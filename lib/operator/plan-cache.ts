import type { OperatorPlanResult } from "./model-adapter.ts";
import type { OperatorContext } from "./types.ts";

export const PLAN_CACHE_PREFIX = "daily_plan:";
const MAX_CONTEXT_CHARS = 24_000;

export function dailyPlanCacheKey(istDate: string) {
  return `${PLAN_CACHE_PREFIX}${istDate}`;
}

export function compactPlanContext(context: OperatorContext) {
  const career = context.careerProfile
    ? {
      targetRoles: context.careerProfile.targetRoles,
      locations: context.careerProfile.locations,
      industries: context.careerProfile.industries,
      workModes: context.careerProfile.workModes,
      strengths: context.careerProfile.strengths,
      exclusions: context.careerProfile.exclusions,
      onboardingStatus: context.careerProfile.onboardingStatus,
    }
    : null;
  return JSON.stringify({
    today: context.today,
    timezone: context.timezone,
    career,
    goals: context.goals.map(goal => ({
      id: goal.id,
      title: goal.title,
      priority: goal.priority,
      forecast: goal.forecast,
      targetDate: goal.targetDate,
      milestones: goal.milestones.map(item => ({
        id: item.id, title: item.title, targetDate: item.targetDate,
        completionPercentage: item.completionPercentage, status: item.status,
      })),
    })),
    calendar: context.calendar.slice(0, 24).map(item => ({
      id: item.id, title: item.title, startAt: item.startAt, endAt: item.endAt, ownership: item.ownership,
    })),
    jobs: context.jobs.slice(0, 12),
    learningItems: context.learningItems.slice(0, 8),
    startupIdeas: context.startupIdeas.slice(0, 6),
    contentIdeas: context.contentIdeas.slice(0, 6),
    notes: context.planningNotes.slice(0, 5),
    connectors: context.connectors,
  }).slice(0, MAX_CONTEXT_CHARS);
}

export function parseCachedDailyPlan(value: string): OperatorPlanResult | null {
  if (!value.trim()) return null;
  try {
    const parsed = JSON.parse(value) as OperatorPlanResult;
    if (!parsed?.plan || !parsed.model) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function serializeDailyPlanCache(result: OperatorPlanResult) {
  return JSON.stringify({ plan: result.plan, model: result.model });
}
