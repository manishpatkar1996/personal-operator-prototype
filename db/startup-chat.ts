import { env } from "cloudflare:workers";
import { completeJson, openaiConfigured } from "@/lib/operator/llm";
import { ensureStartupColumns } from "./startup";

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
}

export async function listStartupMessages(ideaId: string) {
  await ensureStartupChat();
  return (await db().prepare("SELECT id,idea_id,role,content,created_at FROM startup_messages WHERE idea_id=? ORDER BY created_at").bind(ideaId).all<Record<string, unknown>>()).results;
}

export async function updateStartupIdea(id: string, input: Record<string, unknown>) {
  await ensureStartupColumns();
  const current = await db().prepare("SELECT id,title,problem,target_user,state,next_validation,confidence,review_date,evidence_json,experiment,citations_json FROM startup_ideas WHERE id=?").bind(id).first<Record<string, unknown>>();
  if (!current) throw new Error("Idea was not found");
  const problem = typeof input.problem === "string" ? input.problem.trim() : String(current.problem);
  const targetUser = typeof input.targetUser === "string" ? input.targetUser.trim() : String(current.target_user);
  const nextValidation = typeof input.nextValidation === "string" ? input.nextValidation.trim() : String(current.next_validation);
  const experiment = typeof input.experiment === "string" ? input.experiment.trim() : String(current.experiment ?? "");
  const state = typeof input.state === "string" ? input.state : String(current.state);
  const confidence = typeof input.confidence === "number" ? Math.max(0, Math.min(100, Math.round(input.confidence))) : Number(current.confidence);
  const evidence = Array.isArray(input.evidence) ? input.evidence.map(String) : null;
  await db().prepare("UPDATE startup_ideas SET problem=?,target_user=?,next_validation=?,experiment=?,state=?,confidence=?,evidence_json=COALESCE(?,evidence_json) WHERE id=?")
    .bind(problem, targetUser, nextValidation, experiment, state, confidence, evidence ? JSON.stringify(evidence) : null, id)
    .run();
  return { message: "Idea updated" };
}

function fallbackReply(idea: Record<string, unknown>, message: string) {
  const missing = [
    !String(idea.problem ?? "").trim() || String(idea.problem).includes("needs framing") ? "Who hurts, and what exactly breaks for them today?" : "",
    !String(idea.target_user ?? "").trim() || String(idea.target_user).includes("needs framing") ? "Name one specific person who would use this next week." : "",
    !String(idea.experiment ?? "").trim() ? "What is the smallest test you could run in 14 days?" : "",
  ].filter(Boolean);
  const question = missing[0] || "What would make you park this idea versus committing a week to it?";
  return {
    reply: `Understood: “${message.slice(0, 140)}”. ${question}`,
    updates: {} as Record<string, unknown>,
  };
}

export async function chatStartupIdea(ideaId: string, message: string) {
  const text = message.trim();
  if (!text) throw new Error("Say something about the idea first");
  await ensureStartupChat();
  const idea = await db().prepare("SELECT id,title,problem,target_user,state,next_validation,confidence,experiment,evidence_json FROM startup_ideas WHERE id=?").bind(ideaId).first<Record<string, unknown>>();
  if (!idea) throw new Error("Idea was not found");
  const history = await listStartupMessages(ideaId);
  let reply = fallbackReply(idea, text);
  let model = "deterministic";
  if (openaiConfigured()) {
    try {
      const payload = await completeJson(
        "startup_chat",
        "",
        JSON.stringify({ idea, history: history.slice(-8), message: text }),
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
  if (Object.keys(reply.updates).length) await updateStartupIdea(ideaId, reply.updates);
  await db().batch([
    db().prepare("INSERT INTO startup_messages (id,idea_id,role,content) VALUES (?,?,?,?)").bind(crypto.randomUUID(), ideaId, "user", text),
    db().prepare("INSERT INTO startup_messages (id,idea_id,role,content) VALUES (?,?,?,?)").bind(crypto.randomUUID(), ideaId, "agent", reply.reply.slice(0, 4_000)),
    db().prepare("UPDATE startup_ideas SET state=CASE WHEN state='captured' THEN 'framing' ELSE state END WHERE id=?").bind(ideaId),
  ]);
  return { reply: reply.reply, updates: reply.updates, model, messages: await listStartupMessages(ideaId) };
}
