import { env } from "cloudflare:workers";
import { completeJson, liveModelsConfigured } from "@/lib/operator/llm";
import { adviseOnDraft, parseContentFormat } from "@/lib/operator/content-craft";
import { ensureContentColumns, getContentStrategy } from "./content";

function db() {
  if (!env.DB) throw new Error("D1 binding DB is unavailable");
  return env.DB;
}

export async function ensureContentChat() {
  await ensureContentColumns();
  await db().prepare(`CREATE TABLE IF NOT EXISTS content_messages (
    id TEXT PRIMARY KEY,
    idea_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
}

export async function listContentMessages(ideaId: string) {
  await ensureContentChat();
  return (await db().prepare("SELECT id,idea_id,role,content,created_at FROM content_messages WHERE idea_id=? ORDER BY created_at").bind(ideaId).all<Record<string, unknown>>()).results;
}

export async function chatContentIdea(ideaId: string, message: string, liveDraft?: string) {
  const text = message.trim();
  if (!text) throw new Error("Ask Samwell how to change the draft");
  await ensureContentChat();
  const idea = await db().prepare("SELECT id,title,format,draft_text,generated_draft,working_notes,feedback_text,outline_json FROM content_ideas WHERE id=?")
    .bind(ideaId).first<{
      id: string;
      title: string;
      format: string;
      draft_text: string;
      generated_draft: string;
      working_notes: string;
      feedback_text: string;
      outline_json: string;
    }>();
  if (!idea) throw new Error("Content idea was not found");
  const format = parseContentFormat(idea.format);
  const currentDraft = liveDraft?.trim() ? liveDraft : (idea.draft_text || idea.generated_draft);
  const history = await listContentMessages(ideaId);
  const strategy = await getContentStrategy();
  let reply = adviseOnDraft(currentDraft, format, text);
  let revisedDraft = "";
  let model = "deterministic";
  if (liveModelsConfigured()) {
    try {
      const payload = await completeJson(
        "content_chat",
        "Advise on the current draft. Return JSON {reply:string, revisedDraft?:string}. Only include revisedDraft if the user asked you to rewrite. Never publish.",
        JSON.stringify({
          idea: { title: idea.title, format, workingNotes: idea.working_notes, feedback: idea.feedback_text, outline: idea.outline_json },
          draft: currentDraft.slice(0, format === "linkedin_post" ? 3_000 : 6_000),
          generated: idea.generated_draft.slice(0, format === "linkedin_post" ? 3_000 : 6_000),
          strategy: strategy ? { thesis: strategy.thesis, sourceName: strategy.source_name } : null,
          history: history.slice(-4).map(item => ({ role: item.role, content: String(item.content).slice(0, 800) })),
          message: text,
        }),
      ) as { reply?: string; revisedDraft?: string };
      reply = String(payload.reply ?? reply).slice(0, 4_000);
      if (payload.revisedDraft) revisedDraft = String(payload.revisedDraft).slice(0, format === "linkedin_post" ? 3_000 : 24_000);
      model = "mini";
    } catch {
      model = "fallback";
    }
  }
  await db().batch([
    db().prepare("INSERT INTO content_messages (id,idea_id,role,content) VALUES (?,?,?,?)").bind(crypto.randomUUID(), ideaId, "user", text.slice(0, 4_000)),
    db().prepare("INSERT INTO content_messages (id,idea_id,role,content) VALUES (?,?,?,?)").bind(crypto.randomUUID(), ideaId, "agent", reply),
  ]);
  return { reply, revisedDraft, model, messages: await listContentMessages(ideaId) };
}
