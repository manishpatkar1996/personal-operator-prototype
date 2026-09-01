import { env } from "cloudflare:workers";
import { completeJson, liveModelsConfigured } from "@/lib/operator/llm";
import {
  STARTUP_IDEA_SELECT,
  THESIS_FIELD_KEYS,
  THESIS_FIELDS,
  clarityAfterEdits,
  composeStartupThesis,
  parseThesisClarity,
  thesisCompleteness,
  thesisFieldsFromRow,
  type ThesisFields,
} from "@/lib/operator/startup-thesis";
import { ensureStartupColumns, persistThesisFields, validateStartupThesis } from "./startup";
import { startupRunsValidate } from "@/lib/operator/token-policy";

function db() {
  if (!env.DB) throw new Error("D1 binding DB is unavailable");
  return env.DB;
}

export async function ensureStartupChat() {
  await ensureStartupColumns();
  await db().prepare(`CREATE TABLE IF NOT EXISTS startup_messages (
    id TEXT PRIMARY KEY,
    idea_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
  await db().prepare(`CREATE TABLE IF NOT EXISTS startup_notes (
    id TEXT PRIMARY KEY,
    idea_id TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
}

export async function listStartupNotes(ideaId: string) {
  await ensureStartupChat();
  return (await db().prepare("SELECT id,idea_id,title,body,created_at FROM startup_notes WHERE idea_id=? ORDER BY created_at DESC").bind(ideaId).all<Record<string, unknown>>()).results;
}

export async function addStartupNote(ideaId: string, title: string, body: string) {
  const text = body.trim();
  if (!text) throw new Error("Paste research, a note, or file text first");
  await ensureStartupChat();
  const idea = await db().prepare("SELECT id FROM startup_ideas WHERE id=?").bind(ideaId).first<{ id: string }>();
  if (!idea) throw new Error("Idea was not found");
  const id = crypto.randomUUID();
  await db().prepare("INSERT INTO startup_notes (id,idea_id,title,body) VALUES (?,?,?,?)")
    .bind(id, ideaId, (title.trim() || "Research note").slice(0, 120), text.slice(0, 12_000)).run();
  return { id, notes: await listStartupNotes(ideaId) };
}

export async function listStartupMessages(ideaId: string) {
  await ensureStartupChat();
  return (await db().prepare("SELECT id,idea_id,role,content,created_at FROM startup_messages WHERE idea_id=? ORDER BY created_at").bind(ideaId).all<Record<string, unknown>>()).results;
}

function fieldsFromInput(current: ThesisFields, input: Record<string, unknown>): ThesisFields {
  const next = { ...current };
  for (const key of THESIS_FIELD_KEYS) {
    if (typeof input[key] === "string") next[key] = input[key].trim();
  }
  if (typeof input.nextValidation === "string" && !next.experiment) next.experiment = input.nextValidation.trim();
  return next;
}

export async function updateStartupIdea(id: string, input: Record<string, unknown>, options: { validate?: boolean } = {}) {
  await ensureStartupColumns();
  const current = await db().prepare(`SELECT ${STARTUP_IDEA_SELECT} FROM startup_ideas WHERE id=?`).bind(id).first<Record<string, unknown>>();
  if (!current) throw new Error("Idea was not found");
  const previousFields = thesisFieldsFromRow(current);
  const fields = fieldsFromInput(previousFields, input);
  const nextValidation = typeof input.nextValidation === "string" ? input.nextValidation.trim() : (fields.experiment || String(current.next_validation ?? ""));
  const state = typeof input.state === "string" ? input.state : String(current.state);
  const confidence = typeof input.confidence === "number" ? Math.max(0, Math.min(100, Math.round(input.confidence))) : Number(current.confidence);
  const evidence = Array.isArray(input.evidence) ? input.evidence.map(String) : null;
  const clarity = clarityAfterEdits(previousFields, fields, parseThesisClarity(current.field_clarity_json));
  const thesis = composeStartupThesis(fields);
  await persistThesisFields(id, fields, clarity, thesis, nextValidation || fields.experiment);
  await db().prepare("UPDATE startup_ideas SET state=?,confidence=?,evidence_json=COALESCE(?,evidence_json) WHERE id=?")
    .bind(state, confidence, evidence ? JSON.stringify(evidence) : null, id)
    .run();
  const validation = options.validate === false || !startupRunsValidate("save")
    ? { fields, clarity }
    : await validateStartupThesis(id);
  return {
    message: "Thesis updated",
    fields: validation.fields,
    clarity: validation.clarity,
    complete: thesisCompleteness(validation.fields, validation.clarity).complete,
  };
}

function fallbackReply(fields: ThesisFields, message: string) {
  const missing = THESIS_FIELDS.filter(field => !fields[field.key].trim());
  const question = missing[0]
    ? `${missing[0].helper} (${missing[0].label} is empty.)`
    : "What would make you park this idea versus committing a week to it?";
  return {
    reply: `Understood: “${message.slice(0, 140)}”. ${question}`,
    updates: {} as Record<string, unknown>,
  };
}

export async function chatStartupIdea(ideaId: string, message: string) {
  const text = message.trim();
  if (!text) throw new Error("Say something about the idea first");
  await ensureStartupChat();
  const idea = await db().prepare(`SELECT ${STARTUP_IDEA_SELECT} FROM startup_ideas WHERE id=?`).bind(ideaId).first<Record<string, unknown>>();
  if (!idea) throw new Error("Idea was not found");
  const fields = thesisFieldsFromRow(idea);
  const history = await listStartupMessages(ideaId);
  const notes = await listStartupNotes(ideaId);
  let reply = fallbackReply(fields, text);
  let model = "deterministic";
  if (liveModelsConfigured()) {
    try {
      const payload = await completeJson(
        "startup_chat",
        "Help develop the structured thesis canvas. Ask one question if a field is empty or unclear. When you learn something, update structured fields. Return JSON {reply:string, updates?:{idea?:string, problem?:string, targetUser?:string, scale?:string, market?:string, competition?:string, whyNow?:string, unfairAdvantage?:string, riskiestAssumption?:string, experiment?:string, nextValidation?:string, evidence?:string[], confidence?:number}}. Never invent customers, revenue, or traction.",
        JSON.stringify({ idea: { id: idea.id, title: idea.title, state: idea.state, confidence: idea.confidence, fields, clarity: parseThesisClarity(idea.field_clarity_json) }, notes: notes.slice(0, 8), history: history.slice(-8), message: text }),
      ) as { reply?: string; updates?: Record<string, unknown> };
      reply = {
        reply: String(payload.reply ?? reply.reply),
        updates: payload.updates ?? {},
      };
      model = "mini";
    } catch {
      model = "fallback";
    }
  }
  if (Object.keys(reply.updates).length) {
    await updateStartupIdea(ideaId, reply.updates, { validate: startupRunsValidate("chat") });
  }
  await db().batch([
    db().prepare("INSERT INTO startup_messages (id,idea_id,role,content) VALUES (?,?,?,?)").bind(crypto.randomUUID(), ideaId, "user", text),
    db().prepare("INSERT INTO startup_messages (id,idea_id,role,content) VALUES (?,?,?,?)").bind(crypto.randomUUID(), ideaId, "agent", reply.reply.slice(0, 4_000)),
    db().prepare("UPDATE startup_ideas SET state=CASE WHEN state='captured' THEN 'framing' ELSE state END WHERE id=?").bind(ideaId),
  ]);
  return { reply: reply.reply, updates: reply.updates, model, messages: await listStartupMessages(ideaId) };
}
