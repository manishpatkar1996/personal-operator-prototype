import { env } from "cloudflare:workers";
import { completeJson, openaiConfigured } from "@/lib/operator/llm";

function db() {
  if (!env.DB) throw new Error("D1 binding DB is unavailable");
  return env.DB;
}

export async function ensureContentColumns() {
  const database = db();
  await database.prepare(`CREATE TABLE IF NOT EXISTS content_strategy (
    id TEXT PRIMARY KEY,
    thesis TEXT NOT NULL,
    source_name TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
  const columns = new Set((await database.prepare("PRAGMA table_info(content_ideas)").all<{ name: string }>()).results.map(column => column.name));
  if (!columns.has("outline_json")) await database.prepare("ALTER TABLE content_ideas ADD COLUMN outline_json TEXT NOT NULL DEFAULT '[]'").run();
  if (!columns.has("draft_text")) await database.prepare("ALTER TABLE content_ideas ADD COLUMN draft_text TEXT NOT NULL DEFAULT ''").run();
  await database.prepare("INSERT OR IGNORE INTO content_strategy (id,thesis,source_name) VALUES ('primary','Practical thinking on AI products, agentic workflows, and building with high ownership.','Working thesis')").run();
}

export async function getContentStrategy() {
  await ensureContentColumns();
  return db().prepare("SELECT id,thesis,source_name,updated_at FROM content_strategy WHERE id='primary'").first<{ id: string; thesis: string; source_name: string; updated_at: string }>();
}

export async function importContentStrategy(thesis: string, sourceName = "Imported strategy") {
  const text = thesis.trim();
  if (text.length < 20) throw new Error("Paste at least a short strategy paragraph");
  await ensureContentColumns();
  await db().prepare("UPDATE content_strategy SET thesis=?,source_name=?,updated_at=CURRENT_TIMESTAMP WHERE id='primary'").bind(text.slice(0, 4_000), sourceName.slice(0, 80)).run();
  return getContentStrategy();
}

function fallbackOutline(title: string, thesis: string) {
  return [
    `Open with ${title}`,
    `Context: ${thesis.slice(0, 140)}`,
    "One concrete before/after from the Operator build",
    "What stays human-approved",
    "Ask: what would you protect on your calendar first?",
  ];
}

export async function outlineContent(id: string) {
  await ensureContentColumns();
  const [idea, strategy] = await Promise.all([
    db().prepare("SELECT id,title,pillar,source,next_action FROM content_ideas WHERE id=?").bind(id).first<{ id: string; title: string; pillar: string; source: string; next_action: string }>(),
    getContentStrategy(),
  ]);
  if (!idea) throw new Error("Content idea was not found");
  let outline = fallbackOutline(idea.title, strategy?.thesis ?? "");
  let model = "deterministic";
  if (openaiConfigured()) {
    try {
      const payload = await completeJson(
        "content_outline",
        "Produce a 5-bullet outline for a LinkedIn-length post. Return JSON {outline:string[]}. Do not draft the full post. Never publish.",
        JSON.stringify({ idea, strategy }),
      ) as { outline?: string[] };
      if (Array.isArray(payload.outline) && payload.outline.length) outline = payload.outline.map(String).slice(0, 8);
      model = "mini";
    } catch {
      model = "fallback";
    }
  }
  await db().prepare("UPDATE content_ideas SET status='outlined',outline_json=?,next_action=? WHERE id=?").bind(JSON.stringify(outline), "Review the outline, then request a draft", id).run();
  return { id, outline, model };
}

export async function draftContent(id: string) {
  await ensureContentColumns();
  const [idea, strategy] = await Promise.all([
    db().prepare("SELECT id,title,pillar,outline_json,draft_text FROM content_ideas WHERE id=?").bind(id).first<{ id: string; title: string; pillar: string; outline_json: string; draft_text: string }>(),
    getContentStrategy(),
  ]);
  if (!idea) throw new Error("Content idea was not found");
  let outline: string[] = [];
  try { outline = JSON.parse(idea.outline_json) as string[]; } catch { outline = []; }
  if (!outline.length) outline = fallbackOutline(idea.title, strategy?.thesis ?? "");
  let draft = `${idea.title}\n\n${outline.map(item => `• ${item}`).join("\n")}\n\nThis stays a local draft until you copy it out. The Operator will not publish.`;
  let model = "deterministic";
  if (openaiConfigured()) {
    try {
      const payload = await completeJson(
        "content_draft",
        "Write a LinkedIn post in a precise, practical voice. Return JSON {draft:string}. Do not include hashtags unless essential. Never claim the Operator already published.",
        JSON.stringify({ idea: idea.title, outline, strategy }),
      ) as { draft?: string };
      if (payload.draft) draft = String(payload.draft).slice(0, 4_000);
      model = "standard";
    } catch {
      model = "fallback";
    }
  }
  await db().prepare("UPDATE content_ideas SET status='drafted',outline_json=?,draft_text=?,next_action=? WHERE id=?").bind(JSON.stringify(outline), draft, "Edit locally, then copy out to publish yourself", id).run();
  return { id, outline, draft, model };
}
