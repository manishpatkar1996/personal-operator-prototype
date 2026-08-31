import { env } from "cloudflare:workers";
import { DEFAULT_PROMPTS } from "./agents.ts";
import { deepseekModelFor, liveProviderOrder, modelFor, type OperatorTask } from "./models.ts";
import { composeLiveSystemPrompt } from "./system-prompt.ts";

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
  return openaiConfigured() || deepseekConfigured();
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

async function preferenceContext(task: OperatorTask) {
  if (!env.DB) return "";
  try {
    if (task === "resume_extract" || task === "job_explain") {
      const row = await env.DB.prepare("SELECT target_roles_json,locations_json,work_modes_json,strengths_json,exclusions_json FROM career_profiles WHERE id='local'").first<Record<string, string>>();
      if (!row) return "";
      return `\nLive career preferences:\nTarget roles: ${readJsonList(row.target_roles_json).join(", ") || "not set"}\nLocations: ${readJsonList(row.locations_json).join(", ") || "not set"}\nWork modes: ${readJsonList(row.work_modes_json).join(", ") || "not set"}\nStrengths: ${readJsonList(row.strengths_json).join(", ") || "not set"}\nExclude: ${readJsonList(row.exclusions_json).join(", ") || "not set"}`;
    }
    if (task === "learning_summarize") {
      const row = await env.DB.prepare("SELECT tracks_json,interests_json,weekly_budget_minutes FROM learning_preferences LIMIT 1").first<Record<string, string | number>>();
      if (!row) return "";
      return `\nLive learning preferences:\nTracks: ${readJsonList(String(row.tracks_json)).join(", ") || "not set"}\nInterests: ${readJsonList(String(row.interests_json)).join(", ") || "not set"}\nWeekly budget: ${Number(row.weekly_budget_minutes ?? 0)} minutes`;
    }
    if (task === "content_outline" || task === "content_draft") {
      const row = await env.DB.prepare("SELECT thesis,source_name FROM content_strategy WHERE id='primary'").first<{ thesis: string; source_name: string }>();
      if (!row) return "";
      return `\nLive content strategy (${row.source_name}):\n${row.thesis}`;
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
  const stored = await storedPrompt(task);
  const catalog = DEFAULT_PROMPTS.find(item => item.id === task)?.systemPrompt || "";
  const systemPrompt = composeLiveSystemPrompt(stored || catalog, system);
  if (!systemPrompt.trim()) throw new Error("No system prompt is configured for this task");
  const extra = await preferenceContext(task);
  const temperature = task === "council" || task === "content_draft" ? 0.4 : 0.2;
  const messages = [
    { role: "system" as const, content: `${systemPrompt}${extra}\nReturn JSON only.` },
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

  if (!errors.length) throw new Error("No model key is configured. Add OPENAI_API_KEY or DEEPSEEK_API_KEY to .dev.vars.");
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
        : "Local rules and seeded results are active; live research requires a model key.";
  await env.DB.prepare("UPDATE connectors SET status=?,detail=?,updated_at=CURRENT_TIMESTAMP WHERE id='llm'").bind(status, detail).run();
}
