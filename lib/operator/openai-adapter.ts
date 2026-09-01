import type { OperatorModelAdapter, OperatorModelRequest } from "./model-adapter.ts";
import { completeJson, lastModelProvider, liveModelsConfigured } from "./llm.ts";
import { compactPlanContext } from "./plan-cache.ts";

export function createOpenAIAdapter(): OperatorModelAdapter {
  return {
    get id() {
      return lastModelProvider() || "openai";
    },
    isConfigured() {
      return liveModelsConfigured();
    },
    async generate(request: OperatorModelRequest) {
      return completeJson(
        "daily_plan",
        [
          "Return JSON matching the plan schema.",
          "Required root fields: version (must be the number 1), generatedAt, horizonDate, timezone, summary, generation.mode ('model'), priorities, actions, signals.",
          "Each priority needs integer rank 1-3, domain career|learning|startup|content|calendar|general, estimatedMinutes 5-480, confidence 0-1, and sourceIds from context.",
          "Never recommend applying, messaging, sending email, publishing, or changing permissions.",
          "Prefer the highest-fit open job when career work is due.",
          "Keep summary under 280 characters.",
        ].join("\n"),
        compactPlanContext(request.context),
      );
    },
  };
}
