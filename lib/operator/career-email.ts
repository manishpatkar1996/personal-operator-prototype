export type CareerEmailSignal = {
  subject?: unknown;
  sender?: unknown;
  summary?: unknown;
  next_action?: unknown;
  due_at?: unknown;
  received_at?: unknown;
  category?: unknown;
};

export type CareerEmailJob = {
  company?: unknown;
  title?: unknown;
  fit_score?: unknown;
  status?: unknown;
};

const WAIT_ACTION = /\b(wait|track this|newsletter|no action|nothing to do|monitor)\b/i;
const HUMAN_ACTION = /\b(review|draft|send|reply|decide|tailor|follow[- ]up|schedule|prepare|write|open)\b/i;

export function isParkedCareerEmail(signal: CareerEmailSignal) {
  const action = String(signal.next_action ?? "");
  return WAIT_ACTION.test(action) && !HUMAN_ACTION.test(action);
}

export function careerEmailUrgency(signal: CareerEmailSignal, jobs: CareerEmailJob[] = [], now = Date.now()) {
  const action = String(signal.next_action ?? "");
  const blob = `${signal.subject ?? ""} ${signal.sender ?? ""} ${signal.summary ?? ""} ${action}`.toLowerCase();
  let score = 0;
  if (isParkedCareerEmail(signal)) score -= 50;
  if (HUMAN_ACTION.test(action)) score += 40;
  if (/\bdraft\b/i.test(action) || /\bsend\b/i.test(action) || /\bdecide\b/i.test(action)) score += 30;
  for (const job of jobs) {
    const company = String(job.company ?? "").trim().toLowerCase();
    const title = String(job.title ?? "").trim().toLowerCase();
    const matched = (company && blob.includes(company)) || (title && title.length > 8 && blob.includes(title));
    if (!matched) continue;
    const status = String(job.status ?? "");
    score += 20 + Math.min(20, Number(job.fit_score ?? 0) / 5);
    if (status === "recommended" || status === "applying" || status === "saved") score += 15;
  }
  if (signal.due_at) {
    const due = Date.parse(String(signal.due_at));
    if (!Number.isNaN(due)) {
      const days = (due - now) / 86_400_000;
      if (days >= 0 && days <= 7) score += 10;
      else if (days < 0 && days > -14) score += 5;
    }
  }
  return score;
}

export function rankCareerEmails<T extends CareerEmailSignal>(signals: T[], jobs: CareerEmailJob[] = [], now = Date.now()) {
  return [...signals].sort((left, right) => {
    const parked = Number(isParkedCareerEmail(left)) - Number(isParkedCareerEmail(right));
    if (parked) return parked;
    const urgency = careerEmailUrgency(right, jobs, now) - careerEmailUrgency(left, jobs, now);
    if (urgency) return urgency;
    const dueLeft = left.due_at ? Date.parse(String(left.due_at)) : Number.POSITIVE_INFINITY;
    const dueRight = right.due_at ? Date.parse(String(right.due_at)) : Number.POSITIVE_INFINITY;
    if (dueLeft !== dueRight) return dueLeft - dueRight;
    return String(right.received_at ?? "").localeCompare(String(left.received_at ?? ""));
  });
}
