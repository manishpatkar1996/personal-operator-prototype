import { env } from "cloudflare:workers";
import { completeJson, liveModelsConfigured } from "@/lib/operator/llm";
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

export async function generateResumeVariant(jobId: string) {
  await ensureCareerExtraColumns();
  const [job, profile] = await Promise.all([
    db().prepare("SELECT id,title,company,location,fit_reason FROM jobs WHERE id=?").bind(jobId).first<{ id: string; title: string; company: string; location: string; fit_reason: string }>(),
    getCareerProfile(),
  ]);
  if (!job) throw new Error("Role was not found");
  if (!profile.resumeText.trim()) throw new Error("Paste a résumé first so a job-specific variant can be generated");
  let variant = [
    `Variant for ${job.title} at ${job.company}`,
    "",
    "Lead with:",
    ...profile.strengths.slice(0, 4).map(item => `• ${item}`),
    "",
    job.fit_reason,
    "",
    profile.resumeText.slice(0, 1_200),
    "",
    "This is a local draft. The Operator will not submit an application.",
  ].join("\n");
  let model = "deterministic";
  if (liveModelsConfigured()) {
    try {
      const payload = await completeJson(
        "resume_extract",
        "Rewrite the résumé into a job-specific variant. Return JSON {variant:string}. Keep facts; do not invent employers. Never apply or send.",
        JSON.stringify({ job, resume: profile.resumeText.slice(0, 6_000), strengths: profile.strengths, targetRoles: profile.targetRoles }),
      ) as { variant?: string };
      if (payload.variant) variant = String(payload.variant).slice(0, 6_000);
      model = "mini";
    } catch {
      model = "fallback";
    }
  }
  await db().prepare("UPDATE jobs SET resume_variant=?,next_action=? WHERE id=?").bind(variant, "Review the job-specific résumé variant before any application", jobId).run();
  return { jobId, variant, model };
}
