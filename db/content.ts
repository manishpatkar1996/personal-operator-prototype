import { env } from "cloudflare:workers";
import { completeJson, liveModelsConfigured } from "@/lib/operator/llm";
import {
  DEFAULT_CONTENT_VOICE,
  DEFAULT_LINKEDIN_CRAFT,
  DEFAULT_MEDIUM_CRAFT,
  GENERIC_CONTENT_THESIS,
  appendTasteLog,
  contentStatusAfterEdit,
  contentStatusAfterGenerate,
  fallbackDraft,
  fallbackNotes,
  fallbackOutline,
  formatLabel,
  parseContentFormat,
  parseLinkedInCraft,
  parseMediumCraft,
  parseTasteLog,
  parseVoice,
  summarizeEditDiff,
  type ContentFormat,
  type ContentTasteEntry,
  type ContentVoice,
  type LinkedInCraft,
  type MediumCraft,
} from "@/lib/operator/content-craft";
import { getMeta } from "./operator-meta";
import { WORKSPACE_KIND_KEY } from "@/lib/operator/operator-setup";

function db() {
  if (!env.DB) throw new Error("D1 binding DB is unavailable");
  return env.DB;
}

export type ContentStrategy = {
  id: string;
  thesis: string;
  source_name: string;
  updated_at: string;
  formats: ContentFormat[];
  voice: ContentVoice;
  linkedinCraft: LinkedInCraft;
  mediumCraft: MediumCraft;
  taste: ContentTasteEntry[];
};

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  try {
    return JSON.parse(value || "") as T;
  } catch {
    return fallback;
  }
}

export async function ensureContentColumns() {
  const database = db();
  await database.prepare(`CREATE TABLE IF NOT EXISTS content_strategy (
    id TEXT PRIMARY KEY,
    thesis TEXT NOT NULL,
    source_name TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
  const strategyColumns = new Set((await database.prepare("PRAGMA table_info(content_strategy)").all<{ name: string }>()).results.map(column => column.name));
  if (!strategyColumns.has("formats_json")) await database.prepare("ALTER TABLE content_strategy ADD COLUMN formats_json TEXT NOT NULL DEFAULT '[\"linkedin_post\",\"medium_article\"]'").run();
  if (!strategyColumns.has("voice_json")) await database.prepare("ALTER TABLE content_strategy ADD COLUMN voice_json TEXT NOT NULL DEFAULT '{}'").run();
  if (!strategyColumns.has("linkedin_craft_json")) await database.prepare("ALTER TABLE content_strategy ADD COLUMN linkedin_craft_json TEXT NOT NULL DEFAULT '{}'").run();
  if (!strategyColumns.has("medium_craft_json")) await database.prepare("ALTER TABLE content_strategy ADD COLUMN medium_craft_json TEXT NOT NULL DEFAULT '{}'").run();
  if (!strategyColumns.has("taste_json")) await database.prepare("ALTER TABLE content_strategy ADD COLUMN taste_json TEXT NOT NULL DEFAULT '[]'").run();
  const ideaColumns = new Set((await database.prepare("PRAGMA table_info(content_ideas)").all<{ name: string }>()).results.map(column => column.name));
  if (!ideaColumns.has("outline_json")) await database.prepare("ALTER TABLE content_ideas ADD COLUMN outline_json TEXT NOT NULL DEFAULT '[]'").run();
  if (!ideaColumns.has("draft_text")) await database.prepare("ALTER TABLE content_ideas ADD COLUMN draft_text TEXT NOT NULL DEFAULT ''").run();
  if (!ideaColumns.has("notes_text")) await database.prepare("ALTER TABLE content_ideas ADD COLUMN notes_text TEXT NOT NULL DEFAULT ''").run();
  if (!ideaColumns.has("format")) await database.prepare("ALTER TABLE content_ideas ADD COLUMN format TEXT NOT NULL DEFAULT 'linkedin_post'").run();
  if (!ideaColumns.has("generated_draft")) await database.prepare("ALTER TABLE content_ideas ADD COLUMN generated_draft TEXT NOT NULL DEFAULT ''").run();
  if (!ideaColumns.has("working_notes")) await database.prepare("ALTER TABLE content_ideas ADD COLUMN working_notes TEXT NOT NULL DEFAULT ''").run();
  if (!ideaColumns.has("feedback_text")) await database.prepare("ALTER TABLE content_ideas ADD COLUMN feedback_text TEXT NOT NULL DEFAULT ''").run();
  await database.prepare("INSERT OR IGNORE INTO content_strategy (id,thesis,source_name) VALUES ('primary',?,'Working thesis')").bind(GENERIC_CONTENT_THESIS).run();
  await database.prepare("CREATE TABLE IF NOT EXISTS operator_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)").run();
  const revision = await database.prepare("SELECT value FROM operator_meta WHERE key='content_craft_revision'").first<{ value: string }>();
  if (Number(revision?.value ?? 0) < 1) {
    await database.prepare(`UPDATE content_strategy SET
      formats_json=?, voice_json=?, linkedin_craft_json=?, medium_craft_json=?,
      taste_json=CASE WHEN taste_json='[]' OR taste_json='' THEN taste_json ELSE taste_json END
      WHERE id='primary'`).bind(
      JSON.stringify(["linkedin_post", "medium_article"]),
      JSON.stringify(DEFAULT_CONTENT_VOICE),
      JSON.stringify(DEFAULT_LINKEDIN_CRAFT),
      JSON.stringify(DEFAULT_MEDIUM_CRAFT),
    ).run();
    await database.prepare("INSERT OR REPLACE INTO operator_meta (key,value) VALUES ('content_craft_revision','1')").run();
  }
  if (Number((await database.prepare("SELECT value FROM operator_meta WHERE key='content_craft_revision'").first<{ value: string }>())?.value ?? 0) < 2) {
    const kind = await getMeta(WORKSPACE_KIND_KEY);
    if (kind !== "personal") {
      await database.prepare("UPDATE content_strategy SET thesis=?,source_name='Working thesis',voice_json=?,taste_json='[]',updated_at=CURRENT_TIMESTAMP WHERE id='primary'")
        .bind(GENERIC_CONTENT_THESIS, JSON.stringify(DEFAULT_CONTENT_VOICE)).run();
    }
    await database.prepare("INSERT OR REPLACE INTO operator_meta (key,value) VALUES ('content_craft_revision','2')").run();
  }
}

export async function resetContentStrategyToGeneric() {
  await ensureContentColumns();
  await db().prepare(`UPDATE content_strategy SET
    thesis=?, source_name='Working thesis', voice_json=?, taste_json='[]', updated_at=CURRENT_TIMESTAMP
    WHERE id='primary'`).bind(GENERIC_CONTENT_THESIS, JSON.stringify(DEFAULT_CONTENT_VOICE)).run();
}

function mapStrategy(row: {
  id: string;
  thesis: string;
  source_name: string;
  updated_at: string;
  formats_json?: string;
  voice_json?: string;
  linkedin_craft_json?: string;
  medium_craft_json?: string;
  taste_json?: string;
}): ContentStrategy {
  const formats = parseJson<unknown[]>(row.formats_json, ["linkedin_post", "medium_article"])
    .map(parseContentFormat)
    .filter((item, index, list) => list.indexOf(item) === index);
  return {
    id: row.id,
    thesis: row.thesis,
    source_name: row.source_name,
    updated_at: row.updated_at,
    formats: formats.length ? formats : ["linkedin_post", "medium_article"],
    voice: parseVoice(parseJson(row.voice_json, DEFAULT_CONTENT_VOICE)),
    linkedinCraft: parseLinkedInCraft(parseJson(row.linkedin_craft_json, DEFAULT_LINKEDIN_CRAFT)),
    mediumCraft: parseMediumCraft(parseJson(row.medium_craft_json, DEFAULT_MEDIUM_CRAFT)),
    taste: parseTasteLog(parseJson(row.taste_json, [])),
  };
}

export async function getContentStrategy() {
  await ensureContentColumns();
  const row = await db().prepare("SELECT id,thesis,source_name,updated_at,formats_json,voice_json,linkedin_craft_json,medium_craft_json,taste_json FROM content_strategy WHERE id='primary'")
    .first<{
      id: string;
      thesis: string;
      source_name: string;
      updated_at: string;
      formats_json: string;
      voice_json: string;
      linkedin_craft_json: string;
      medium_craft_json: string;
      taste_json: string;
    }>();
  return row ? mapStrategy(row) : null;
}

export async function importContentStrategy(thesis: string, sourceName = "Imported strategy") {
  const text = thesis.trim();
  if (text.length < 20) throw new Error("Paste at least a short strategy paragraph");
  await ensureContentColumns();
  await db().prepare("UPDATE content_strategy SET thesis=?,source_name=?,updated_at=CURRENT_TIMESTAMP WHERE id='primary'").bind(text.slice(0, 4_000), sourceName.slice(0, 80)).run();
  return getContentStrategy();
}

async function saveTaste(taste: ContentTasteEntry[]) {
  await db().prepare("UPDATE content_strategy SET taste_json=?,updated_at=CURRENT_TIMESTAMP WHERE id='primary'").bind(JSON.stringify(taste)).run();
}

async function recordTaste(entry: ContentTasteEntry) {
  const strategy = await getContentStrategy();
  const next = appendTasteLog(strategy?.taste ?? [], entry);
  await saveTaste(next);
  return next;
}

type IdeaRow = {
  id: string;
  title: string;
  pillar: string;
  status: string;
  score: number;
  source: string;
  next_action: string;
  outline_json: string;
  draft_text: string;
  notes_text: string;
  format: string;
  generated_draft: string;
  working_notes: string;
  feedback_text: string;
};

async function getIdea(id: string) {
  return db().prepare("SELECT id,title,pillar,status,score,source,next_action,outline_json,draft_text,notes_text,format,generated_draft,working_notes,feedback_text FROM content_ideas WHERE id=?")
    .bind(id).first<IdeaRow>();
}

function parseOutline(value: string) {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export async function createContentIdea(input: { title: string; notes?: string; pillar?: string; format?: string }) {
  const title = input.title.trim();
  if (title.length < 4) throw new Error("Give the idea a title of at least a few words");
  await ensureContentColumns();
  const id = crypto.randomUUID();
  const format = parseContentFormat(input.format);
  const notes = (input.notes ?? "").trim().slice(0, 8_000);
  await db().prepare("INSERT INTO content_ideas (id,title,pillar,status,score,source,next_action,notes_text,format,working_notes) VALUES (?,?,?,?,?,?,?,?,?,?)")
    .bind(id, title.slice(0, 160), (input.pillar ?? "Inbox").slice(0, 80), "idea", 70, "Captured", "Generate notes or a draft — publishing stays a copy-out", notes, format, notes).run();
  return { id, format };
}

export async function setContentFormat(id: string, formatValue: string) {
  await ensureContentColumns();
  const idea = await getIdea(id);
  if (!idea) throw new Error("Content idea was not found");
  const format = parseContentFormat(formatValue);
  await db().prepare("UPDATE content_ideas SET format=?,next_action=? WHERE id=?").bind(format, `Generate a ${formatLabel(format)} — still a local draft`, id).run();
  return { id, format };
}

export async function updateContentNotes(id: string, notes: string) {
  await ensureContentColumns();
  const idea = await getIdea(id);
  if (!idea) throw new Error("Content idea was not found");
  await db().prepare("UPDATE content_ideas SET notes_text=? WHERE id=?").bind(notes.trim().slice(0, 8_000), id).run();
  return { id };
}

export async function updateWorkingNotes(id: string, notes: string) {
  await ensureContentColumns();
  const idea = await getIdea(id);
  if (!idea) throw new Error("Content idea was not found");
  await db().prepare("UPDATE content_ideas SET working_notes=? WHERE id=?").bind(notes.trim().slice(0, 8_000), id).run();
  return { id };
}

export async function shareContentFeedback(id: string, feedback: string) {
  const text = feedback.trim();
  if (text.length < 4) throw new Error("Tell Samwell what worked or what to stop doing");
  await ensureContentColumns();
  const idea = await getIdea(id);
  if (!idea) throw new Error("Content idea was not found");
  const merged = [text, idea.feedback_text].filter(Boolean).join("\n\n").slice(0, 8_000);
  await db().prepare("UPDATE content_ideas SET feedback_text=?,notes_text=? WHERE id=?").bind(merged, merged, id).run();
  const taste = await recordTaste({
    at: new Date().toISOString(),
    ideaId: idea.id,
    title: idea.title,
    format: parseContentFormat(idea.format),
    note: text,
  });
  return { id, feedback: merged, taste };
}

export async function saveContentDraft(id: string, draft: string) {
  const text = draft.trim();
  if (!text) throw new Error("The draft is empty");
  await ensureContentColumns();
  const idea = await getIdea(id);
  if (!idea) throw new Error("Content idea was not found");
  const generated = idea.generated_draft || idea.draft_text;
  const status = contentStatusAfterEdit(generated, text);
  const diff = summarizeEditDiff(generated, text);
  await db().prepare("UPDATE content_ideas SET draft_text=?,status=?,next_action=? WHERE id=?")
    .bind(text.slice(0, 24_000), status, "Copy out yourself when it sounds like you. Samwell will not publish.", id).run();
  let taste = (await getContentStrategy())?.taste ?? [];
  if (status === "edited") {
    taste = await recordTaste({
      at: new Date().toISOString(),
      ideaId: idea.id,
      title: idea.title,
      format: parseContentFormat(idea.format),
      added: diff.added,
      removed: diff.removed,
    });
  }
  return { id, draft: text, status, taste };
}

async function payloadFor(idea: IdeaRow, strategy: ContentStrategy | null) {
  const format = parseContentFormat(idea.format);
  return {
    idea: {
      id: idea.id,
      title: idea.title,
      pillar: idea.pillar,
      format,
      formatLabel: formatLabel(format),
      notes: idea.notes_text,
      workingNotes: idea.working_notes,
      feedback: idea.feedback_text,
    },
    strategy: strategy ? {
      thesis: strategy.thesis,
      sourceName: strategy.source_name,
    } : null,
  };
}

export async function generateContentNotes(id: string) {
  await ensureContentColumns();
  const [idea, strategy] = await Promise.all([getIdea(id), getContentStrategy()]);
  if (!idea) throw new Error("Content idea was not found");
  const format = parseContentFormat(idea.format);
  let notes = fallbackNotes(idea.title, strategy?.thesis ?? "", format);
  let model = "deterministic";
  if (liveModelsConfigured()) {
    try {
      const payload = await completeJson(
        "content_notes",
        "Produce working notes for this idea. Return JSON {notes:string}. Do not draft the post. Never publish.",
        JSON.stringify({ ...await payloadFor(idea, strategy), captured: idea.notes_text }),
      ) as { notes?: string };
      if (payload.notes) notes = String(payload.notes).slice(0, 8_000);
      model = "mini";
    } catch {
      model = "fallback";
    }
  }
  const status = contentStatusAfterGenerate("notes", idea.status);
  await db().prepare("UPDATE content_ideas SET working_notes=?,status=?,next_action=? WHERE id=?")
    .bind(notes, status, `Review notes, then generate a ${formatLabel(format)}`, id).run();
  return { id, notes, model, status };
}

export async function outlineContent(id: string) {
  await ensureContentColumns();
  const [idea, strategy] = await Promise.all([getIdea(id), getContentStrategy()]);
  if (!idea) throw new Error("Content idea was not found");
  const format = parseContentFormat(idea.format);
  let outline = fallbackOutline(idea.title, strategy?.thesis ?? "", format);
  let model = "deterministic";
  if (liveModelsConfigured()) {
    try {
      const payload = await completeJson(
        "content_outline",
        `Produce a 5–7 bullet outline for a ${formatLabel(format)}. Return JSON {outline:string[]}. Do not draft the full piece. Never publish.`,
        JSON.stringify({ ...await payloadFor(idea, strategy), workingNotes: idea.working_notes }),
      ) as { outline?: string[] };
      if (Array.isArray(payload.outline) && payload.outline.length) outline = payload.outline.map(String).slice(0, 8);
      model = "mini";
    } catch {
      model = "fallback";
    }
  }
  const status = contentStatusAfterGenerate("outline", idea.status);
  await db().prepare("UPDATE content_ideas SET status=?,outline_json=?,next_action=? WHERE id=?")
    .bind(status, JSON.stringify(outline), `Review the outline, then generate the ${formatLabel(format)}`, id).run();
  return { id, outline, model, status, format };
}

export async function draftContent(id: string) {
  await ensureContentColumns();
  const [idea, strategy] = await Promise.all([getIdea(id), getContentStrategy()]);
  if (!idea) throw new Error("Content idea was not found");
  const format = parseContentFormat(idea.format);
  let outline = parseOutline(idea.outline_json);
  if (!outline.length) outline = fallbackOutline(idea.title, strategy?.thesis ?? "", format);
  let draft = fallbackDraft(idea.title, outline, format, strategy?.thesis ?? "");
  let model = "deterministic";
  if (liveModelsConfigured()) {
    try {
      const payload = await completeJson(
        "content_draft",
        `Write a ${formatLabel(format)} in the user's operator voice. Return JSON {draft:string}. Never claim it was published.`,
        JSON.stringify({ ...await payloadFor(idea, strategy), outline, workingNotes: idea.working_notes }),
      ) as { draft?: string };
      if (payload.draft) draft = String(payload.draft).slice(0, format === "linkedin_post" ? 3_000 : 24_000);
      model = "standard";
    } catch {
      model = "fallback";
    }
  }
  await db().prepare("UPDATE content_ideas SET status='drafted',outline_json=?,draft_text=?,generated_draft=?,next_action=? WHERE id=?")
    .bind(JSON.stringify(outline), draft, draft, "Edit in place, then copy out yourself. Samwell will not publish.", id).run();
  return { id, outline, draft, model, status: "drafted", format };
}

export async function generateContent(id: string) {
  return draftContent(id);
}
