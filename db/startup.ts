import { env } from "cloudflare:workers";
import { completeJson, liveModelsConfigured } from "@/lib/operator/llm";

function db() {
  if (!env.DB) throw new Error("D1 binding DB is unavailable");
  return env.DB;
}

export async function ensureStartupColumns() {
  const columns = new Set((await db().prepare("PRAGMA table_info(startup_ideas)").all<{ name: string }>()).results.map(column => column.name));
  if (!columns.has("evidence_json")) await db().prepare("ALTER TABLE startup_ideas ADD COLUMN evidence_json TEXT NOT NULL DEFAULT '[]'").run();
  if (!columns.has("experiment")) await db().prepare("ALTER TABLE startup_ideas ADD COLUMN experiment TEXT NOT NULL DEFAULT ''").run();
  if (!columns.has("citations_json")) await db().prepare("ALTER TABLE startup_ideas ADD COLUMN citations_json TEXT NOT NULL DEFAULT '[]'").run();
  if (!columns.has("thesis")) await db().prepare("ALTER TABLE startup_ideas ADD COLUMN thesis TEXT NOT NULL DEFAULT ''").run();
  await db().prepare(`CREATE TABLE IF NOT EXISTS startup_notes (
    id TEXT PRIMARY KEY,
    idea_id TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
}

function fallbackResearch(idea: { title: string; problem: string; target_user: string }) {
  return {
    evidence: [
      `Problem framing: ${idea.problem}`,
      `Target user: ${idea.target_user}`,
      "Riskiest assumption: people will trust an operator with calendar autonomy only if writes stay proposed until approved.",
    ],
    experiment: `Interview five people in the target user set about whether they would let an operator propose — but never silently move — calendar blocks for “${idea.title}”.`,
    citations: [
      "Local idea brief (not a web citation)",
      "Calendar autonomy decision already recorded in Memory",
    ],
  };
}

export async function researchStartupIdea(id: string) {
  await ensureStartupColumns();
  const idea = await db().prepare("SELECT id,title,problem,target_user,state,thesis,evidence_json FROM startup_ideas WHERE id=?").bind(id).first<Record<string, string>>();
  if (!idea) throw new Error("Idea was not found");
  const notes = (await db().prepare("SELECT title,body FROM startup_notes WHERE idea_id=? ORDER BY created_at DESC LIMIT 12").bind(id).all<{ title: string; body: string }>()).results;
  let research = { ...fallbackResearch({ title: idea.title, problem: idea.problem, target_user: idea.target_user }), thesis: idea.thesis || `${idea.problem} For: ${idea.target_user}.` };
  let model = "deterministic";
  if (liveModelsConfigured()) {
    try {
      const payload = await completeJson(
        "startup_research",
        "Build a startup thesis from the brief and any research notes. Return JSON {thesis:string, evidence:string[], experiment:string, citations:string[]}. thesis is 4-8 sentences: problem, user, why now, riskiest assumption. Cite only supplied material. Label guesses. Never send outreach, incorporate, or spend.",
        JSON.stringify({ idea, notes }),
      ) as { thesis?: string; evidence?: string[]; experiment?: string; citations?: string[] };
      research = {
        thesis: String(payload.thesis ?? research.thesis).slice(0, 4_000),
        evidence: Array.isArray(payload.evidence) ? payload.evidence.map(String).slice(0, 8) : research.evidence,
        experiment: String(payload.experiment ?? research.experiment),
        citations: Array.isArray(payload.citations) ? payload.citations.map(String).slice(0, 8) : research.citations,
      };
      model = "mini";
    } catch {
      model = "fallback";
    }
  }
  await db().prepare("UPDATE startup_ideas SET state=?,next_validation=?,evidence_json=?,experiment=?,citations_json=?,thesis=?,confidence=CASE WHEN confidence<45 THEN confidence+8 ELSE confidence END WHERE id=?")
    .bind("researching", research.experiment, JSON.stringify(research.evidence), research.experiment, JSON.stringify(research.citations), research.thesis, id)
    .run();
  return { id, model, ...research };
}
