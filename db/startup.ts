import { env } from "cloudflare:workers";
import { completeJson, liveModelsConfigured } from "@/lib/operator/llm";
import {
  STARTUP_IDEA_SELECT,
  THESIS_FIELDS,
  applyThesisValidation,
  careerThesisSeed,
  composeStartupThesis,
  heuristicThesisClarity,
  normalizeThesisFields,
  operatorThesisSeed,
  parseThesisClarity,
  thesisFieldsFromRow,
  type ThesisFields,
} from "@/lib/operator/startup-thesis";

function db() {
  if (!env.DB) throw new Error("D1 binding DB is unavailable");
  return env.DB;
}

const NEW_COLUMNS: Array<[string, string]> = [
  ["evidence_json", "TEXT NOT NULL DEFAULT '[]'"],
  ["experiment", "TEXT NOT NULL DEFAULT ''"],
  ["citations_json", "TEXT NOT NULL DEFAULT '[]'"],
  ["thesis", "TEXT NOT NULL DEFAULT ''"],
  ["crisp_idea", "TEXT NOT NULL DEFAULT ''"],
  ["scale", "TEXT NOT NULL DEFAULT ''"],
  ["market", "TEXT NOT NULL DEFAULT ''"],
  ["competition", "TEXT NOT NULL DEFAULT ''"],
  ["why_now", "TEXT NOT NULL DEFAULT ''"],
  ["unfair_advantage", "TEXT NOT NULL DEFAULT ''"],
  ["riskiest_assumption", "TEXT NOT NULL DEFAULT ''"],
  ["field_clarity_json", "TEXT NOT NULL DEFAULT '{}'"],
];

export async function ensureStartupColumns() {
  const columns = new Set((await db().prepare("PRAGMA table_info(startup_ideas)").all<{ name: string }>()).results.map(column => column.name));
  for (const [name, definition] of NEW_COLUMNS) {
    if (!columns.has(name)) await db().prepare(`ALTER TABLE startup_ideas ADD COLUMN ${name} ${definition}`).run();
  }
  await db().prepare(`CREATE TABLE IF NOT EXISTS startup_notes (
    id TEXT PRIMARY KEY,
    idea_id TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
  await backfillStartupThesis();
}

async function backfillStartupThesis() {
  const ideas = (await db().prepare(`SELECT ${STARTUP_IDEA_SELECT} FROM startup_ideas`).all<Record<string, string>>()).results;
  for (const idea of ideas) {
    const current = thesisFieldsFromRow(idea);
    const seed = idea.id === "idea-operator" ? operatorThesisSeed() : idea.id === "idea-career" ? { ...careerThesisSeed() } : {};
    const next = { ...current };
    for (const field of THESIS_FIELDS) {
      if (!next[field.key] && seed[field.key]) next[field.key] = seed[field.key] ?? "";
    }
    const thesis = idea.thesis?.trim() ? idea.thesis : composeStartupThesis(next);
    const changed = THESIS_FIELDS.some(field => next[field.key] !== current[field.key]) || thesis !== (idea.thesis ?? "");
    if (!changed) continue;
    await persistThesisFields(idea.id, next, parseThesisClarity(idea.field_clarity_json), thesis, String(idea.next_validation ?? next.experiment));
  }
}

function bindThesis(fields: ThesisFields) {
  return THESIS_FIELDS.map(field => fields[field.key].slice(0, 4_000));
}

export async function persistThesisFields(id: string, fields: ThesisFields, clarity: ReturnType<typeof parseThesisClarity>, thesis: string, nextValidation: string) {
  await db().prepare(`UPDATE startup_ideas SET
    crisp_idea=?, problem=?, target_user=?, scale=?, market=?, competition=?, why_now=?, unfair_advantage=?, riskiest_assumption=?, experiment=?,
    next_validation=?, thesis=?, field_clarity_json=?
    WHERE id=?`)
    .bind(...bindThesis(fields), nextValidation.slice(0, 4_000), thesis.slice(0, 4_000), JSON.stringify(clarity), id)
    .run();
}

function fallbackResearch(idea: { title: string } & ThesisFields) {
  const seed = idea.title === "Personal AI Operator" ? operatorThesisSeed() : emptyOrCurrent(idea);
  return {
    fields: seed,
    evidence: [
      `Problem framing: ${seed.problem || idea.problem}`,
      `Target user: ${seed.targetUser || idea.targetUser}`,
      seed.riskiestAssumption ? `Riskiest assumption: ${seed.riskiestAssumption}` : "Riskiest assumption is still unnamed.",
    ].filter(Boolean),
    experiment: seed.experiment || `Interview five people in the target user set about “${idea.title}”.`,
    citations: [
      "Local idea brief (not a web citation)",
      "Calendar autonomy decision already recorded in Memory",
    ],
  };
}

function emptyOrCurrent(idea: ThesisFields): ThesisFields {
  return normalizeThesisFields(idea);
}

function fieldsFromPayload(payload: unknown, fallback: ThesisFields): ThesisFields {
  const source = payload && typeof payload === "object" && !Array.isArray(payload)
    ? "fields" in payload && payload.fields && typeof payload.fields === "object"
      ? payload.fields as Record<string, unknown>
      : payload as Record<string, unknown>
    : {};
  const next = { ...fallback };
  for (const field of THESIS_FIELDS) {
    const value = source[field.key];
    if (typeof value === "string" && value.trim()) next[field.key] = value.trim();
  }
  return next;
}

export async function validateStartupThesis(id: string) {
  await ensureStartupColumns();
  const idea = await db().prepare(`SELECT ${STARTUP_IDEA_SELECT} FROM startup_ideas WHERE id=?`).bind(id).first<Record<string, string>>();
  if (!idea) throw new Error("Idea was not found");
  const fields = thesisFieldsFromRow(idea);
  let clarity = heuristicThesisClarity(fields);
  let model = "deterministic";
  if (liveModelsConfigured()) {
    try {
      const payload = await completeJson(
        "startup_validate",
        "Judge each filled thesis field clear vs unclear. Return JSON {fields:{idea:{status,note},problem:{status,note},targetUser:{status,note},scale:{status,note},market:{status,note},competition:{status,note},whyNow:{status,note},unfairAdvantage:{status,note},riskiestAssumption:{status,note},experiment:{status,note}}}. status is only clear or unclear. Omit empty fields.",
        JSON.stringify({ title: idea.title, fields }),
      );
      clarity = applyThesisValidation(fields, payload);
      model = "mini";
    } catch {
      model = "fallback";
    }
  }
  await db().prepare("UPDATE startup_ideas SET field_clarity_json=? WHERE id=?").bind(JSON.stringify(clarity), id).run();
  return { id, model, fields, clarity };
}

export async function researchStartupIdea(id: string) {
  await ensureStartupColumns();
  const idea = await db().prepare(`SELECT ${STARTUP_IDEA_SELECT} FROM startup_ideas WHERE id=?`).bind(id).first<Record<string, string>>();
  if (!idea) throw new Error("Idea was not found");
  const current = thesisFieldsFromRow(idea);
  const notes = (await db().prepare("SELECT title,body FROM startup_notes WHERE idea_id=? ORDER BY created_at DESC LIMIT 12").bind(id).all<{ title: string; body: string }>()).results;
  let research = fallbackResearch({ title: idea.title, ...current });
  let model = "deterministic";
  if (liveModelsConfigured()) {
    try {
      const payload = await completeJson(
        "startup_research",
        "Fill the structured thesis canvas from the brief and notes. Return JSON {fields:{idea,problem,targetUser,scale,market,competition,whyNow,unfairAdvantage,riskiestAssumption,experiment}, evidence:string[], citations:string[]}. Cite only supplied material. Label guesses. Never send outreach, incorporate, or spend.",
        JSON.stringify({ idea: { title: idea.title, ...current }, notes }),
      ) as { fields?: Record<string, unknown>; evidence?: string[]; experiment?: string; citations?: string[] };
      const fields = fieldsFromPayload(payload, research.fields);
      if (typeof payload.experiment === "string" && payload.experiment.trim()) fields.experiment = payload.experiment.trim();
      research = {
        fields,
        evidence: Array.isArray(payload.evidence) ? payload.evidence.map(String).slice(0, 8) : research.evidence,
        experiment: fields.experiment || research.experiment,
        citations: Array.isArray(payload.citations) ? payload.citations.map(String).slice(0, 8) : research.citations,
      };
      model = "mini";
    } catch {
      model = "fallback";
    }
  }
  const fields = { ...research.fields, experiment: research.experiment || research.fields.experiment };
  const thesis = composeStartupThesis(fields);
  await db().prepare("UPDATE startup_ideas SET state=?,next_validation=?,evidence_json=?,experiment=?,citations_json=?,thesis=?,confidence=CASE WHEN confidence<45 THEN confidence+8 ELSE confidence END WHERE id=?")
    .bind("researching", fields.experiment, JSON.stringify(research.evidence), fields.experiment, JSON.stringify(research.citations), thesis, id)
    .run();
  await persistThesisFields(id, fields, {}, thesis, fields.experiment);
  const validation = await validateStartupThesis(id);
  return { id, model, fields: validation.fields, clarity: validation.clarity, evidence: research.evidence, experiment: fields.experiment, citations: research.citations };
}
