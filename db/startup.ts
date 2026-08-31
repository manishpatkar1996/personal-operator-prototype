import { env } from "cloudflare:workers";
import { completeJson, openaiConfigured } from "@/lib/operator/llm";

function db() {
  if (!env.DB) throw new Error("D1 binding DB is unavailable");
  return env.DB;
}

export async function ensureStartupColumns() {
  const columns = new Set((await db().prepare("PRAGMA table_info(startup_ideas)").all<{ name: string }>()).results.map(column => column.name));
  if (!columns.has("evidence_json")) await db().prepare("ALTER TABLE startup_ideas ADD COLUMN evidence_json TEXT NOT NULL DEFAULT '[]'").run();
  if (!columns.has("experiment")) await db().prepare("ALTER TABLE startup_ideas ADD COLUMN experiment TEXT NOT NULL DEFAULT ''").run();
  if (!columns.has("citations_json")) await db().prepare("ALTER TABLE startup_ideas ADD COLUMN citations_json TEXT NOT NULL DEFAULT '[]'").run();
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
  const idea = await db().prepare("SELECT id,title,problem,target_user,state FROM startup_ideas WHERE id=?").bind(id).first<{ id: string; title: string; problem: string; target_user: string; state: string }>();
  if (!idea) throw new Error("Idea was not found");
  let research = fallbackResearch(idea);
  let model = "deterministic";
  if (openaiConfigured()) {
    try {
      const payload = await completeJson(
        "startup_research",
        "Map competitors, assumptions, and a next experiment for a personal operator idea. Return JSON {evidence:string[], experiment:string, citations:string[]}. Cite only claims grounded in the supplied brief. Never recommend sending email, applying, or publishing.",
        JSON.stringify(idea),
      ) as { evidence?: string[]; experiment?: string; citations?: string[] };
      research = {
        evidence: Array.isArray(payload.evidence) ? payload.evidence.map(String).slice(0, 6) : research.evidence,
        experiment: String(payload.experiment ?? research.experiment),
        citations: Array.isArray(payload.citations) ? payload.citations.map(String).slice(0, 6) : research.citations,
      };
      model = "mini";
    } catch {
      model = "fallback";
    }
  }
  await db().prepare("UPDATE startup_ideas SET state=?,next_validation=?,evidence_json=?,experiment=?,citations_json=?,confidence=CASE WHEN confidence<45 THEN confidence+8 ELSE confidence END WHERE id=?")
    .bind("researching", research.experiment, JSON.stringify(research.evidence), research.experiment, JSON.stringify(research.citations), id)
    .run();
  return { id, model, ...research };
}
