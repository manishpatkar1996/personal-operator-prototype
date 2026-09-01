import { env } from "cloudflare:workers";
import { completeJson, deepseekConfigured, lastModelProvider, openaiConfigured } from "@/lib/operator/llm";
import { liveProviderOrder } from "@/lib/operator/models";
import { matchResumeToJob, parseStoredMatch, RESUME_REQUIRED_MESSAGE, resumeIsUsable } from "@/lib/operator/scoring";
import { getCareerProfile } from "./career";

function db() {
  if (!env.DB) throw new Error("D1 binding DB is unavailable");
  return env.DB;
}

export async function ensureCareerExtraColumns() {
  const columns = new Set((await db().prepare("PRAGMA table_info(jobs)").all<{ name: string }>()).results.map(column => column.name));
  if (!columns.has("follow_up_at")) await db().prepare("ALTER TABLE jobs ADD COLUMN follow_up_at TEXT").run();
  if (!columns.has("resume_variant")) await db().prepare("ALTER TABLE jobs ADD COLUMN resume_variant TEXT NOT NULL DEFAULT ''").run();
}

export function linkedInSearchUrl(roles: string[], locations: string[]) {
  const keywords = [...roles.slice(0, 3), ...locations.slice(0, 1)].filter(Boolean).join(" ") || "AI product manager";
  return `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(keywords)}&f_TPR=r604800`;
}

export async function setJobFollowUp(id: string, date: string, note?: string) {
  await ensureCareerExtraColumns();
  const job = await db().prepare("SELECT id,title,company FROM jobs WHERE id=?").bind(id).first<{ id: string; title: string; company: string }>();
  if (!job) throw new Error("Role was not found");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Follow-up date must be YYYY-MM-DD");
  const nextAction = note?.trim() || `Follow up with ${job.company} on ${date}`;
  await db().prepare("UPDATE jobs SET follow_up_at=?,next_action=? WHERE id=?").bind(date, nextAction, id).run();
  return { message: `Follow-up set for ${job.title} at ${job.company}`, date };
}

function colourFromPayload(payload: unknown, fallback: { reason: string; gaps: string[] }) {
  if (!payload || typeof payload !== "object") return fallback;
  const record = payload as Record<string, unknown>;
  const reason = typeof record.reason === "string" && record.reason.trim() ? record.reason.trim() : fallback.reason;
  const gaps = Array.isArray(record.gaps) ? record.gaps.map(item => String(item).trim()).filter(Boolean).slice(0, 6) : [];
  return { reason, gaps: gaps.length ? gaps : fallback.gaps };
}

export async function explainJobMatch(jobId: string, options: { regenerate?: boolean } = {}) {
  await ensureCareerExtraColumns();
  const [job, profile] = await Promise.all([
    db().prepare("SELECT id,title,company,location,description,fit_score,fit_reason,evidence_json FROM jobs WHERE id=?").bind(jobId).first<{
      id: string;
      title: string;
      company: string;
      location: string;
      description: string;
      fit_score: number;
      fit_reason: string;
      evidence_json: string;
    }>(),
    getCareerProfile(),
  ]);
  if (!job) throw new Error("Role was not found");
  if (!resumeIsUsable(profile.resumeText)) throw new Error(RESUME_REQUIRED_MESSAGE);

  const stored = parseStoredMatch(job.evidence_json);
  if (!options.regenerate && stored.matches.length && stored.gaps.length && job.fit_reason.trim()) {
    return {
      jobId,
      fitScore: Number(job.fit_score),
      reason: job.fit_reason,
      evidence: stored.matches,
      matches: stored.matches,
      gaps: stored.gaps,
      model: "stored",
      reused: true,
    };
  }

  const scored = matchResumeToJob({
    targetRoles: profile.targetRoles,
    industries: profile.industries,
    locations: profile.locations,
    workModes: profile.workModes,
    strengths: profile.strengths,
    exclusions: profile.exclusions,
    resumeText: profile.resumeText,
  }, { title: job.title, company: job.company, location: job.location, description: job.description ?? "" });

  let reason = scored.fitReason;
  let gaps = scored.gaps;
  let model = "deterministic";
  const live = liveProviderOrder(openaiConfigured(), deepseekConfigured());
  if (live.length) {
    try {
      const payload = await completeJson(
        "job_explain",
        "Colour the deterministic résumé overlap for this posting. Return JSON {reason:string, gaps:string[]}. reason is 2–4 sentences citing only résumé evidence. gaps are 2–5 concrete résumé or story fixes, not a rewritten résumé. Do not change the numeric fit score. Never recommend auto-applying.",
        JSON.stringify({
          job: { title: job.title, company: job.company, location: job.location, description: (job.description ?? "").slice(0, 8_000) },
          resume: profile.resumeText.slice(0, 18_000),
          fitScore: scored.fitScore,
          evidence: scored.evidence,
          gaps: scored.gaps,
          strengths: profile.strengths,
          targetRoles: profile.targetRoles,
          exclusions: profile.exclusions,
        }),
      );
      const coloured = colourFromPayload(payload, { reason, gaps });
      reason = coloured.reason;
      gaps = coloured.gaps;
      model = lastModelProvider() || live[0];
    } catch {
      model = "deterministic";
    }
  }

  await db().prepare("UPDATE jobs SET fit_score=?,fit_reason=?,evidence_json=?,next_action=? WHERE id=?")
    .bind(scored.fitScore, reason, JSON.stringify({ matches: scored.evidence, gaps }), "Review résumé overlap before any application", jobId)
    .run();

  return {
    jobId,
    fitScore: scored.fitScore,
    reason,
    evidence: scored.evidence,
    matches: scored.evidence,
    gaps,
    model,
    reused: false,
  };
}
