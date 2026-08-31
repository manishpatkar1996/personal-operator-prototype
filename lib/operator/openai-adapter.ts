import { env } from "cloudflare:workers";
import type { OperatorModelAdapter, OperatorModelRequest } from "./model-adapter.ts";
import { modelFor } from "./models.ts";

const MAX_CONTEXT_CHARS = 24_000;

function apiKey() {
  const value = (env as { OPENAI_API_KEY?: string }).OPENAI_API_KEY;
  return typeof value === "string" && value.trim().length > 8 ? value.trim() : "";
}

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
      return Boolean(apiKey());
    },
    async generate(request) {
      const key = apiKey();
      if (!key) throw new Error("OPENAI_API_KEY is not configured");
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          authorization: `Bearer ${key}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: modelFor("daily_plan", env as Record<string, string | undefined>),
          temperature: 0.2,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: [
                "You are the Personal AI Operator planner.",
                "Return JSON only that matches this schema:",
                JSON.stringify(request.responseSchema),
                "Never recommend applying, messaging, sending email, publishing, or changing permissions.",
                "Every priority and action must include sourceIds from the provided context.",
                "Prefer the highest-fit open job when career work is due.",
                "Keep summary under 280 characters.",
              ].join("\n"),
            },
            { role: "user", content: compactContext(request) },
          ],
        }),
      });
      if (!response.ok) {
        throw new Error(`OpenAI request failed (${response.status})`);
      }
      const payload = await response.json() as { choices?: { message?: { content?: string } }[] };
      const content = payload.choices?.[0]?.message?.content;
      if (!content) throw new Error("OpenAI returned an empty plan");
      return JSON.parse(content) as unknown;
    },
  };
}
