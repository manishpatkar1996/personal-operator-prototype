import { env } from "cloudflare:workers";
import { modelFor, type OperatorTask } from "./models.ts";

const MAX_CHARS = 24_000;

function apiKey() {
  const value = (env as { OPENAI_API_KEY?: string }).OPENAI_API_KEY;
  return typeof value === "string" && value.trim().length > 8 ? value.trim() : "";
}

export function openaiConfigured() {
  return Boolean(apiKey());
}

export async function completeJson(task: OperatorTask, system: string, user: string) {
  const key = apiKey();
  if (!key) throw new Error("OPENAI_API_KEY is not configured");
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
        { role: "system", content: `${system}\nReturn JSON only.` },
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
