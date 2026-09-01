import type { OperatorTask } from "./models.ts";

export const DISABLED_OPERATOR_TASKS = ["job_explain", "voice_parse"] as const;

export type DailyPlanMode = "live" | "cache" | "deterministic";
export type StartupValidateTrigger = "save" | "chat" | "research";
export type StartupChallengeTrigger = "save" | "challenge";
export type ContentGenerateMode = "notes" | "content" | "draft" | "outline";

export function isLiveTaskDisabled(task: OperatorTask) {
  return (DISABLED_OPERATOR_TASKS as readonly string[]).includes(task);
}

export function dailyPlanMode(live: boolean, hasFreshCache: boolean): DailyPlanMode {
  if (live) return "live";
  if (hasFreshCache) return "cache";
  return "deterministic";
}

export function collectRunsSummarize() {
  return false;
}

export function startupRunsValidate(trigger: StartupValidateTrigger) {
  return trigger === "save";
}

export function startupRunsChallenge(trigger: StartupChallengeTrigger) {
  return trigger === "challenge";
}

export function contentGenerateTasks(mode: ContentGenerateMode): OperatorTask[] {
  if (mode === "notes") return ["content_notes"];
  if (mode === "outline") return ["content_outline"];
  return ["content_draft"];
}

export function userHasPreferencePayload(task: OperatorTask, user: string) {
  const text = user.toLowerCase();
  if (task === "resume_extract" || task === "job_explain") {
    return text.includes("targetroles") || text.includes("strengths") || text.includes("target_roles");
  }
  if (task === "learning_summarize" || task === "learning_select") {
    return text.includes('"taste"') || text.includes('"interests"');
  }
  if (task === "content_notes" || task === "content_outline" || task === "content_draft" || task === "content_chat") {
    return text.includes("linkedincraft") || text.includes("mediumcraft") || text.includes("live content strategy");
  }
  return false;
}

export function collectedArticleCopy(
  article: { insight?: string; summary?: string; excerpt: string; source: string },
  fallback: (excerpt: string) => string,
) {
  const fallbackInsight = fallback(article.excerpt);
  const insight = article.insight?.trim() && article.insight.trim() !== article.source
    ? article.insight.trim()
    : fallbackInsight;
  return {
    insight,
    summary: article.summary?.trim() || fallbackInsight,
  };
}
