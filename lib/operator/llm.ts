import { env } from "cloudflare:workers";
import { DEFAULT_PROMPTS } from "./agents.ts";
import { modelFor, type OperatorTask } from "./models.ts";

const MAX_CHARS = 24_000;

function apiKey() {
  const value = (env as { OPENAI_API_KEY?: string }).OPENAI_API_KEY;
  return typeof value === "string" && value.trim().length > 8 ? value.trim() : "";
}

export function openaiConfigured() {
  return Boolean(apiKey());
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

export async function completeJson(task: OperatorTask, system: string, user: string) {
  const key = apiKey();
  if (!key) throw new Error("OPENAI_API_KEY is not configured");
  const systemPrompt = (await storedPrompt(task)) || system || DEFAULT_PROMPTS.find(item => item.id === task)?.systemPrompt || "";
  if (!systemPrompt.trim()) throw new Error("No system prompt is configured for this task");
  const extra = await preferenceContext(task);
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: modelFor(task, env as Record<string, string | undefined>),
      temperature: task === "council" || task === "content_draft" ? 0.4 : 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `${systemPrompt}${extra}\nReturn JSON only.` },
        { role: "user", content: user.slice(0, MAX_CHARS) },
      ],
    }),
  });
  if (!response.ok) throw new Error(`OpenAI request failed (${response.status})`);
  const payload = await response.json() as { choices?: { message?: { content?: string } }[] };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI returned an empty response");
  return JSON.parse(content) as unknown;
}

export async function syncLlmConnector() {
  if (!env.DB) return;
  const status = openaiConfigured() ? "connected" : "not_connected";
  const detail = openaiConfigured()
    ? "OpenAI is configured. Models follow the per-task nano/mini/standard table."
    : "Local rules and seeded results are active; live research requires a model key.";
  await env.DB.prepare("UPDATE connectors SET status=?,detail=?,updated_at=CURRENT_TIMESTAMP WHERE id='llm'").bind(status, detail).run();
}
