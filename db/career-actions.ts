import { env } from "cloudflare:workers";
import { completeJson, deepseekConfigured, lastModelProvider, openaiConfigured } from "@/lib/operator/llm";
import { liveProviderOrder } from "@/lib/operator/models";
import { fallbackResumeLatex, isCompleteLatex, latexFromModelPayload, resumeTexFilename } from "@/lib/operator/resume-latex";
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

export async function generateResumeVariant(jobId: string, options: { regenerate?: boolean } = {}) {
  await ensureCareerExtraColumns();
  const [job, profile] = await Promise.all([
    db().prepare("SELECT id,title,company,location,fit_reason,resume_variant FROM jobs WHERE id=?").bind(jobId).first<{
      id: string;
      title: string;
      company: string;
      location: string;
      fit_reason: string;
      resume_variant: string;
    }>(),
    getCareerProfile(),
  ]);
  if (!job) throw new Error("Role was not found");
  if (!profile.resumeText.trim()) throw new Error("Paste a résumé first so a job-specific variant can be generated");
  const filename = resumeTexFilename(job.company, job.title);
  if (!options.regenerate && isCompleteLatex(job.resume_variant)) {
    return { jobId, variant: job.resume_variant, latex: job.resume_variant, filename, model: "stored", reused: true };
  }

  const posting = { title: job.title, company: job.company, location: job.location, fitReason: job.fit_reason };
  let latex = fallbackResumeLatex(posting, profile);
  let model = "fallback";
  const live = liveProviderOrder(openaiConfigured(), deepseekConfigured());
  if (live.length) {
    try {
      const resume = profile.resumeText.slice(0, 18_000);
      const payload = await completeJson(
        "resume_extract",
        "Emit a complete compilable LaTeX résumé for this one posting. Return JSON {latex:string}. latex must include \\documentclass (article or resume is fine), \\begin{document}, and \\end{document}. If the stored résumé is already LaTeX, keep its packages and structure and retarget section order and bullets for this role. Use only employers, titles, dates, tools, and metrics written in the stored résumé or this job. Do not invent facts. Drop quota-carrying sales language. Never apply, message, or send.",
        JSON.stringify({ job: posting, resume, strengths: profile.strengths, targetRoles: profile.targetRoles }),
      );
      const generated = latexFromModelPayload(payload);
      if (isCompleteLatex(generated)) {
        latex = generated;
        model = lastModelProvider() || live[0];
      }
    } catch {
      model = "fallback";
    }
  }

  await db().prepare("UPDATE jobs SET resume_variant=?,next_action=? WHERE id=?").bind(latex, "Review the job-specific résumé variant before any application", jobId).run();
  return { jobId, variant: latex, latex, filename, model, reused: false };
}
