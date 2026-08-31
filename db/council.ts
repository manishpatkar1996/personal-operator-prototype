import { listGoals } from "./goals";
import { getCareerProfile } from "./career";
import { getWorkspace } from "./workspace";
import { assembleOperatorContext } from "@/lib/operator/context.ts";
import { buildCouncilProposals } from "@/lib/operator/council.ts";
import { completeJson, openaiConfigured } from "@/lib/operator/llm";
import { env } from "cloudflare:workers";

function db() {
  if (!env.DB) throw new Error("D1 binding DB is unavailable");
  return env.DB;
}

export async function runCouncil() {
  const existing = await db().prepare("SELECT COUNT(*) AS count FROM council_proposals WHERE status='proposed'").first<{ count: number }>();
  if ((existing?.count ?? 0) > 0) {
    const createdAt = new Date().toISOString();
    await db().prepare("UPDATE council_roles SET last_run_at=? WHERE id IN ('tyrion','varys','aemon','davos','samwell')").bind(createdAt).run();
    return { message: "The current council proposals still need review", created: 0, model: "skipped" };
  }
  const [goals, workspace, careerProfile] = await Promise.all([listGoals(), getWorkspace(), getCareerProfile()]);
  const context = assembleOperatorContext({ goals, workspace, careerProfile });
  let drafts = buildCouncilProposals(context);
  let model = "deterministic";
  if (openaiConfigured()) {
    try {
      const payload = await completeJson(
        "council",
        "You are a two-role Small Council. Return JSON {proposals:[{roleId:'tyrion'|'samwell',title,rationale}]}. Produce exactly two proposals. Never write rules, send email, apply, publish, or change permissions. External calendar events stay read-only.",
        JSON.stringify({
          today: context.today,
          goals: context.goals.map(goal => ({ title: goal.title, forecast: goal.forecast, milestones: goal.milestones })),
          jobs: context.jobs.slice(0, 5),
          calendar: context.calendar.slice(0, 12),
          content: context.contentIdeas.slice(0, 4),
          learning: context.learningItems.slice(0, 4),
        }),
      ) as { proposals?: { roleId?: string; title?: string; rationale?: string }[] };
      const allowed = new Set(["tyrion", "varys", "aemon", "davos", "samwell"]);
      const next = (payload.proposals ?? []).filter(item => allowed.has(String(item.roleId))).slice(0, 2);
      if (next.length === 2) {
        drafts = next.map(item => ({ roleId: String(item.roleId), title: String(item.title ?? "").slice(0, 160), rationale: String(item.rationale ?? "").slice(0, 500) }));
        model = "standard";
      }
    } catch {
      model = "fallback";
    }
  }
  const createdAt = new Date().toISOString();
  await db().batch([
    db().prepare("UPDATE council_roles SET last_run_at=? WHERE id IN ('tyrion','varys','aemon','davos','samwell')").bind(createdAt),
    ...drafts.map(draft => db().prepare("INSERT INTO council_proposals (id,role_id,title,rationale,status,created_at) VALUES (?,?,?,?,?,?)")
      .bind(crypto.randomUUID(), draft.roleId, draft.title, draft.rationale, "proposed", createdAt)),
  ]);
  return { message: "Retrospective complete — two proposals need review", created: drafts.length, model, proposals: drafts };
}
