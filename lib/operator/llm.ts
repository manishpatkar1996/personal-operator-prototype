import { env } from "cloudflare:workers";
import { DEFAULT_PROMPTS } from "./agents.ts";
import { formatStrategyForPrompt, parseContentFormat, parseLinkedInCraft, parseMediumCraft, parseTasteLog, parseVoice, type ContentFormat } from "./content-craft.ts";
import { deepseekModelFor, liveProviderOrder, modelFor, type OperatorTask } from "./models.ts";
import { composeLiveSystemPrompt } from "./system-prompt.ts";
import { isLiveTaskDisabled, userHasPreferencePayload } from "./token-policy.ts";

const MAX_CHARS = 24_000;

type ModelProvider = "openai" | "deepseek";

let lastProvider: ModelProvider | "" = "";

export function lastModelProvider() {
  return lastProvider;
}

function envRecord() {
  return env as Record<string, string | undefined>;
}

function readKey(name: "OPENAI_API_KEY" | "DEEPSEEK_API_KEY") {
  const value = envRecord()[name];
  return typeof value === "string" && value.trim().length > 8 ? value.trim() : "";
}

function openaiKey() {
  return readKey("OPENAI_API_KEY");
}

function deepseekKey() {
  return readKey("DEEPSEEK_API_KEY");
}

export function openaiConfigured() {
  return Boolean(openaiKey());
}

export function deepseekConfigured() {
  return Boolean(deepseekKey());
}

export function liveModelsConfigured() {
  return liveProviderOrder(openaiConfigured(), deepseekConfigured()).length > 0;
}

async function storedPrompt(task: string) {
  if (!env.DB) return "";
  try {
    const row = await env.DB.prepare("SELECT system_prompt FROM operator_prompts WHERE id=?").bind(task).first<{ system_prompt: string }>();
    return row?.system_prompt?.trim() ?? "";
  } catch {
    return "";
  }
}

function readJsonList(value: string | null | undefined) {
  try {
    const parsed: unknown = JSON.parse(value ?? "[]");
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function contentFormatFromUser(user: string): ContentFormat | undefined {
  try {
    const parsed = JSON.parse(user) as { idea?: { format?: string }; format?: string };
    const value = parsed.idea?.format ?? parsed.format;
    return value ? parseContentFormat(value) : undefined;
  } catch {
    return undefined;
  }
}

async function preferenceContext(task: OperatorTask, user: string) {
  if (!env.DB) return "";
  if (userHasPreferencePayload(task, user)) return "";
  try {
    if (task === "resume_extract" || task === "job_explain") {
      const row = await env.DB.prepare("SELECT target_roles_json,locations_json,work_modes_json,strengths_json,exclusions_json FROM career_profiles WHERE id='local'").first<Record<string, string>>();
      if (!row) return "";
      return `\nLive career preferences:\nTarget roles: ${readJsonList(row.target_roles_json).join(", ") || "not set"}\nLocations: ${readJsonList(row.locations_json).join(", ") || "not set"}\nWork modes: ${readJsonList(row.work_modes_json).join(", ") || "not set"}\nStrengths: ${readJsonList(row.strengths_json).join(", ") || "not set"}\nExclude: ${readJsonList(row.exclusions_json).join(", ") || "not set"}`;
    }
    if (task === "learning_summarize" || task === "learning_select") {
      const row = await env.DB.prepare("SELECT tracks_json,interests_json,want_json,avoid_json,taste_notes,weekly_budget_minutes FROM learning_preferences LIMIT 1").first<Record<string, string | number>>();
      if (!row) return "";
      const list = (value: unknown) => {
        try {
          const parsed: unknown = JSON.parse(String(value ?? "[]"));
          return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
        } catch {
          return [];
        }
      };
      return `\nLive learning preferences:\nTracks: ${list(row.tracks_json).join(", ") || "not set"}\nInterests: ${list(row.interests_json).join(", ") || "not set"}\nWant more of: ${list(row.want_json).join(", ") || "not set yet"}\nSkip: ${list(row.avoid_json).join(", ") || "not set"}\nWeekly budget: ${Number(row.weekly_budget_minutes ?? 0)} minutes${row.taste_notes ? `\nRecent feedback:\n${String(row.taste_notes)}` : ""}`;
    }
    if (task === "content_notes" || task === "content_outline" || task === "content_draft" || task === "content_chat") {
      const row = await env.DB.prepare("SELECT thesis,source_name,voice_json,linkedin_craft_json,medium_craft_json,taste_json FROM content_strategy WHERE id='primary'").first<{
        thesis: string;
        source_name: string;
        voice_json: string;
        linkedin_craft_json: string;
        medium_craft_json: string;
        taste_json: string;
      }>();
      if (!row) return "";
      const parse = (value: string) => {
        try { return JSON.parse(value || "") as unknown; } catch { return {}; }
      };
      return `\n${formatStrategyForPrompt({
        thesis: row.thesis,
        sourceName: row.source_name,
        voice: parseVoice(parse(row.voice_json)),
        linkedinCraft: parseLinkedInCraft(parse(row.linkedin_craft_json)),
        mediumCraft: parseMediumCraft(parse(row.medium_craft_json)),
        taste: parseTasteLog(parse(row.taste_json)),
        format: contentFormatFromUser(user),
      })}`;
    }
  } catch {
    return "";
  }
  return "";
}

async function chatJson(options: {
  provider: ModelProvider;
  url: string;
  key: string;
  model: string;
  temperature: number;
  messages: { role: "system" | "user"; content: string }[];
}) {
  const response = await fetch(options.url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${options.key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: options.model,
      temperature: options.temperature,
      response_format: { type: "json_object" },
      messages: options.messages,
    }),
  });
  if (!response.ok) throw new Error(`${options.provider === "openai" ? "OpenAI" : "DeepSeek"} request failed (${response.status})`);
  const payload = await response.json() as { choices?: { message?: { content?: string } }[] };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error(`${options.provider === "openai" ? "OpenAI" : "DeepSeek"} returned an empty response`);
  return JSON.parse(content) as unknown;
}

export async function completeJson(task: OperatorTask, system: string, user: string) {
  lastProvider = "";
  if (isLiveTaskDisabled(task)) throw new Error(`${task} is not enabled`);
  const stored = await storedPrompt(task);
  const catalog = DEFAULT_PROMPTS.find(item => item.id === task)?.systemPrompt || "";
  const systemPrompt = composeLiveSystemPrompt(stored || catalog, system);
  if (!systemPrompt.trim()) throw new Error("No system prompt is configured for this task");
  const extra = await preferenceContext(task, user);
  const temperature = task === "council" || task === "content_draft" ? 0.4 : 0.2;
  const jsonOnly = /return json/i.test(`${systemPrompt}${extra}`) ? "" : "\nReturn JSON only.";
  const messages = [
    { role: "system" as const, content: `${systemPrompt}${extra}${jsonOnly}` },
    { role: "user" as const, content: user.slice(0, MAX_CHARS) },
  ];
  const vars = envRecord();
  const errors: string[] = [];

  for (const provider of liveProviderOrder(openaiConfigured(), deepseekConfigured())) {
    try {
      const value = await chatJson({
        provider,
        url: provider === "openai" ? "https://api.openai.com/v1/chat/completions" : "https://api.deepseek.com/v1/chat/completions",
        key: provider === "openai" ? openaiKey() : deepseekKey(),
        model: provider === "openai" ? modelFor(task, vars) : deepseekModelFor(vars),
        temperature,
        messages,
      });
      lastProvider = provider;
      return value;
    } catch (caught) {
      errors.push(caught instanceof Error ? caught.message : String(caught));
    }
  }

  if (!errors.length) throw new Error("Live models are paused, or no model key is configured. Add OPENAI_API_KEY or DEEPSEEK_API_KEY to .dev.vars.");
  throw new Error(errors.join(" Then "));
}

export async function syncLlmConnector() {
  if (!env.DB) return;
  const order = liveProviderOrder(openaiConfigured(), deepseekConfigured());
  const openai = order.includes("openai");
  const deepseek = order.includes("deepseek");
  const status = openai || deepseek ? "connected" : "not_connected";
  const detail = openai && deepseek
    ? "OpenAI is primary. DeepSeek covers 429s and other live-model failures."
    : openai
      ? "OpenAI is configured. Add DEEPSEEK_API_KEY to .dev.vars for a live fallback."
      : deepseek
        ? "DeepSeek is the live model. OpenAI is paused."
        : "Live models are paused. Local rules and seeded results are active.";
  await env.DB.prepare("UPDATE connectors SET status=?,detail=?,updated_at=CURRENT_TIMESTAMP WHERE id='llm'").bind(status, detail).run();
}
