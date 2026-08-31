import { env } from "cloudflare:workers";
import { applyFeedback } from "@/lib/operator/learning-taste";
import { getLearningConfiguration, updateLearningPreferences } from "./learning-preferences";

function db() {
  if (!env.DB) throw new Error("D1 binding DB is unavailable");
  return env.DB;
}

export async function ensureLearningFeedbackSchema() {
  await db().prepare(`CREATE TABLE IF NOT EXISTS learning_feedback (
    id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL,
    verdict TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
  const columns = new Set((await db().prepare("PRAGMA table_info(learning_items)").all<{ name: string }>()).results.map(column => column.name));
  if (!columns.has("feedback")) await db().prepare("ALTER TABLE learning_items ADD COLUMN feedback TEXT NOT NULL DEFAULT ''").run();
}

export async function recordLearningFeedback(itemId: string, verdict: string, note = "") {
  await ensureLearningFeedbackSchema();
  if (!new Set(["useful", "skip"]).has(verdict)) throw new Error("Feedback must be useful or skip");
  const item = await db().prepare("SELECT id,title,source FROM learning_items WHERE id=?").bind(itemId).first<{ id: string; title: string; source: string }>();
  if (!item) throw new Error("Learning item was not found");
  await db().prepare("INSERT INTO learning_feedback (id,item_id,verdict,note) VALUES (?,?,?,?)")
    .bind(crypto.randomUUID(), item.id, verdict, note.trim().slice(0, 240)).run();
  await db().prepare("UPDATE learning_items SET feedback=? WHERE id=?").bind(verdict, item.id).run();
  const { preferences } = await getLearningConfiguration();
  const next = applyFeedback({
    tracks: preferences.tracks,
    interests: preferences.interests,
    want: preferences.want,
    avoid: preferences.avoid,
    weeklyBudgetMinutes: preferences.weeklyBudgetMinutes,
    tasteNotes: preferences.tasteNotes,
  }, { verdict: verdict as "useful" | "skip", title: item.title, source: item.source });
  const updated = await updateLearningPreferences({
    want: next.want,
    avoid: next.avoid,
    tasteNotes: next.tasteNotes,
  });
  return {
    message: verdict === "useful" ? "Aemon will look for more like this." : "Aemon will skip this kind of piece.",
    preferences: updated,
    feedback: verdict,
  };
}
