import type { OperatorModelAdapter, OperatorModelRequest } from "./model-adapter.ts";
import { completeJson, openaiConfigured } from "./llm.ts";
import { OPERATOR_PLAN_JSON_SCHEMA } from "./schema.ts";

const MAX_CONTEXT_CHARS = 24_000;

function compactContext(request: OperatorModelRequest) {
  const context = request.context;
  return JSON.stringify({
    today: context.today,
    timezone: context.timezone,
    career: context.careerProfile,
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

export function createOpenAIAdapter(): OperatorModelAdapter {
  return {
    id: "openai",
    isConfigured() {
      return openaiConfigured();
    },
    async generate(request) {
      return completeJson(
        "daily_plan",
        [
          "You are the Personal AI Operator planner.",
          "Return JSON only that matches this schema:",
          JSON.stringify(request.responseSchema ?? OPERATOR_PLAN_JSON_SCHEMA),
          "Never recommend applying, messaging, sending email, publishing, or changing permissions.",
          "Every priority and action must include sourceIds from the provided context.",
          "Prefer the highest-fit open job when career work is due.",
          "Keep summary under 280 characters.",
        ].join("\n"),
        compactContext(request),
      );
    },
  };
}
