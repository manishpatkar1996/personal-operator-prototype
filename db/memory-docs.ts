import { env } from "cloudflare:workers";
import { listGoals } from "./goals";
import { getCareerProfile } from "./career";
import { getContentStrategy } from "./content";

function db() {
  if (!env.DB) throw new Error("D1 binding DB is unavailable");
  return env.DB;
}

export async function ensureMemoryDocuments() {
  await db().prepare(`CREATE TABLE IF NOT EXISTS memory_documents (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'generated',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
}

function renderGoals(goals: Awaited<ReturnType<typeof listGoals>>) {
  if (!goals.length) return "# Goals\n\nNo goals yet. Add one from the Goals tab.";
  return goals.map(goal => `# ${goal.title}

State: ${goal.state}  
Progress: ${goal.progressPercentage}%  
Target: ${goal.targetDate}

${goal.desiredOutcome}

## Milestones

${goal.milestones.map(item => `- [${item.completionPercentage === 100 ? "x" : " "}] ${item.title} — ${item.completionPercentage}% — due ${item.targetDate}`).join("\n")}`).join("\n\n---\n\n");
}

export async function generateMemoryBodies() {
  const [goals, career, strategy, decisions, jobs] = await Promise.all([
    listGoals(),
    getCareerProfile(),
    getContentStrategy(),
    db().prepare("SELECT decision,rationale,affected,decided_at FROM decisions ORDER BY decided_at DESC").all<Record<string, unknown>>(),
    db().prepare("SELECT title,company,fit_score,status FROM jobs ORDER BY fit_score DESC").all<Record<string, unknown>>(),
  ]);
  return {
    goals: renderGoals(goals),
    decisions: decisions.results.length
      ? decisions.results.map(item => `## ${String(item.decision)}\n\n${String(item.rationale)}\n\nAffected: ${String(item.affected)}  \nDate: ${String(item.decided_at).slice(0, 10)}`).join("\n\n")
      : "# Decisions\n\nNo decisions recorded yet.",
    career: `# Career

Target roles: ${(career.targetRoles ?? []).join(", ") || "Not set"}  
Locations: ${(career.locations ?? []).join(", ") || "Not set"}  
Work modes: ${(career.workModes ?? []).join(", ") || "Not set"}  
Strengths: ${(career.strengths ?? []).join(", ") || "Not set"}  
Exclude: ${(career.exclusions ?? []).join(", ") || "Not set"}

## Active roles

${jobs.results.length ? jobs.results.map(job => `- ${String(job.title)} at ${String(job.company)} — ${String(job.fit_score)}% — ${String(job.status)}`).join("\n") : "No roles on the board yet."}`,
    "content-strategy": `# Content strategy

Source: ${strategy?.source_name ?? "Working thesis"}

${strategy?.thesis ?? "Practical thinking on AI products, agentic workflows, and building with high ownership."}`,
  };
}

export async function listMemoryDocuments() {
  await ensureMemoryDocuments();
  const existing = (await db().prepare("SELECT id,title,body,source,updated_at FROM memory_documents ORDER BY id").all<Record<string, unknown>>()).results;
  if (existing.length >= 4) return existing;
  const generated = await generateMemoryBodies();
  const seed = [
    ["goals", "goals.md", generated.goals],
    ["decisions", "decisions.md", generated.decisions],
    ["career", "career.md", generated.career],
    ["content-strategy", "content-strategy.md", generated["content-strategy"]],
  ] as const;
  await db().batch(seed.map(([id, title, body]) => db().prepare("INSERT OR IGNORE INTO memory_documents (id,title,body,source) VALUES (?,?,?,?)").bind(id, title, body, "generated")));
  return (await db().prepare("SELECT id,title,body,source,updated_at FROM memory_documents ORDER BY id").all<Record<string, unknown>>()).results;
}

export async function saveMemoryDocument(id: string, body: string) {
  const text = body.trim();
  if (!text) throw new Error("Document cannot be empty");
  await ensureMemoryDocuments();
  const existing = await db().prepare("SELECT id FROM memory_documents WHERE id=?").bind(id).first<{ id: string }>();
  if (!existing) throw new Error("Document was not found");
  await db().prepare("UPDATE memory_documents SET body=?,source='edited',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(text.slice(0, 20_000), id).run();
  return { message: "Memory document saved" };
}

export async function refreshMemoryDocument(id: string) {
  const generated = await generateMemoryBodies();
  const body = generated[id as keyof typeof generated];
  if (!body) throw new Error("That document cannot be regenerated");
  await ensureMemoryDocuments();
  await db().prepare("UPDATE memory_documents SET body=?,source='generated',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(body, id).run();
  return { message: "Document refreshed from live state" };
}
