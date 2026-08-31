import { buildDeterministicPlan } from "./planner";
import { OPERATOR_PLAN_JSON_SCHEMA, validateOperatorPlan } from "./schema";
import type { OperatorContext, OperatorPlan } from "./types";

export type OperatorModelRequest = {
  context: OperatorContext;
  responseSchema: typeof OPERATOR_PLAN_JSON_SCHEMA;
};

export interface OperatorModelAdapter {
  readonly id: string;
  isConfigured(): boolean;
  generate(request: OperatorModelRequest): Promise<unknown>;
}

export type OperatorPlanResult = {
  plan: OperatorPlan;
  model: { status: "disabled" | "used" | "fallback"; provider?: string; reason?: string };
};

export async function generateOperatorPlan(context: OperatorContext, adapter?: OperatorModelAdapter): Promise<OperatorPlanResult> {
  if (!adapter || !adapter.isConfigured()) {
    return {
      plan: buildDeterministicPlan(context),
      model: { status: "disabled", provider: adapter?.id, reason: "No configured model adapter is available." },
    };
  }
  try {
    const candidate = await adapter.generate({ context, responseSchema: OPERATOR_PLAN_JSON_SCHEMA });
    const validation = validateOperatorPlan(candidate);
    if (!validation.ok) throw new Error(validation.errors.join("; "));
    return {
      plan: { ...validation.value, generation: { mode: "model", provider: adapter.id } },
      model: { status: "used", provider: adapter.id },
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "The model adapter failed.";
    const fallback = buildDeterministicPlan(context);
    return {
      plan: { ...fallback, generation: { mode: "deterministic", provider: adapter.id, fallbackReason: reason.slice(0, 300) } },
      model: { status: "fallback", provider: adapter.id, reason: reason.slice(0, 300) },
    };
  }
}
