export type RelevanceProfile = {
  targetRoles: string[];
};

export type RelevanceJob = {
  title: string;
  fitScore: number;
  status: string;
  source: string;
};

const SALES_TITLE = /\b(account executive|account exec|\bae\b|sales development|\bsdr\b|\bbdr\b|quota-carrying|enterprise hunter|enterprise grower)\b/i;
const PRODUCT_TITLE = /\b(product manager|\bpm\b|product lead|product owner|program manager|engineering|designer|data scientist|research scientist|applied scientist)\b/i;

export function isQuotaSalesRole(title: string) {
  return SALES_TITLE.test(title) && !PRODUCT_TITLE.test(title);
}

export function isRelevantTrackedJob(job: RelevanceJob, profile: RelevanceProfile) {
  if (job.status === "archived" || job.status === "rejected") return false;
  if (["applying", "applied", "interviewing"].includes(job.status)) return true;
  const wantsSales = profile.targetRoles.some(role => isQuotaSalesRole(role));
  if (!wantsSales && isQuotaSalesRole(job.title)) return false;
  if (/greenhouse|lever/i.test(job.source) && job.fitScore < 62) return false;
  return job.fitScore >= 50;
}
