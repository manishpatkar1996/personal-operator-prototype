import { OPERATOR_ACTION_KINDS, OPERATOR_DOMAINS, type OperatorPlan, type PlanValidationResult } from "./types";

export const OPERATOR_PLAN_JSON_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "personal-operator-plan-v1",
  type: "object",
  additionalProperties: false,
  required: ["version", "generatedAt", "horizonDate", "timezone", "summary", "generation", "priorities", "actions", "signals"],
  properties: {
    version: { const: 1 },
    generatedAt: { type: "string", format: "date-time" },
    horizonDate: { type: "string", format: "date" },
    timezone: { type: "string", minLength: 1 },
    summary: { type: "string", minLength: 1, maxLength: 500 },
    generation: {
      type: "object",
      additionalProperties: false,
      required: ["mode"],
      properties: {
        mode: { enum: ["deterministic", "model"] },
        provider: { type: "string" },
        fallbackReason: { type: "string" },
      },
    },
    priorities: {
      type: "array", maxItems: 3,
      items: { $ref: "#/$defs/priority" },
    },
    actions: { type: "array", maxItems: 8, items: { $ref: "#/$defs/action" } },
    signals: { type: "array", maxItems: 12, items: { $ref: "#/$defs/signal" } },
  },
  $defs: {
    priority: {
      type: "object", additionalProperties: false,
      required: ["id", "rank", "domain", "title", "reason", "estimatedMinutes", "confidence", "sourceIds"],
      properties: {
        id: { type: "string", minLength: 1 }, rank: { type: "integer", minimum: 1, maximum: 3 },
        domain: { enum: OPERATOR_DOMAINS }, title: { type: "string", minLength: 1 }, reason: { type: "string", minLength: 1 },
        estimatedMinutes: { type: "integer", minimum: 5, maximum: 480 }, confidence: { type: "number", minimum: 0, maximum: 1 },
        sourceIds: { type: "array", items: { type: "string" } }, goalId: { type: "string" }, milestoneId: { type: "string" }, dueDate: { type: "string" },
      },
    },
    action: {
      type: "object", additionalProperties: false,
      required: ["id", "kind", "domain", "title", "reason", "estimatedMinutes", "requiresApproval", "status", "sourceIds"],
      properties: {
        id: { type: "string", minLength: 1 }, kind: { enum: OPERATOR_ACTION_KINDS }, domain: { enum: OPERATOR_DOMAINS },
        title: { type: "string", minLength: 1 }, reason: { type: "string", minLength: 1 }, estimatedMinutes: { type: "integer", minimum: 5, maximum: 480 },
        requiresApproval: { type: "boolean" }, status: { const: "proposed" }, sourceIds: { type: "array", items: { type: "string" } },
        goalId: { type: "string" }, milestoneId: { type: "string" },
        suggestedWindow: {
          type: "object", additionalProperties: false, required: ["earliest", "latest"],
          properties: { earliest: { type: "string", format: "date-time" }, latest: { type: "string", format: "date-time" } },
        },
      },
    },
    signal: {
      type: "object", additionalProperties: false,
      required: ["id", "category", "domain", "title", "detail", "sourceIds"],
      properties: {
        id: { type: "string", minLength: 1 }, category: { enum: ["risk", "opportunity", "change", "info"] }, domain: { enum: OPERATOR_DOMAINS },
        title: { type: "string", minLength: 1 }, detail: { type: "string", minLength: 1 }, sourceIds: { type: "array", items: { type: "string" } },
      },
    },
  },
} as const;

type UnknownRecord = Record<string, unknown>;
const domains = new Set<string>(OPERATOR_DOMAINS);
const actionKinds = new Set<string>(OPERATOR_ACTION_KINDS);

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === "string");
}

function requireText(value: unknown, path: string, errors: string[]) {
  if (typeof value !== "string" || !value.trim()) errors.push(`${path} must be a non-empty string`);
}

function validatePriority(value: unknown, index: number, errors: string[]) {
  const path = `priorities[${index}]`;
  if (!isRecord(value)) { errors.push(`${path} must be an object`); return; }
  requireText(value.id, `${path}.id`, errors); requireText(value.title, `${path}.title`, errors); requireText(value.reason, `${path}.reason`, errors);
  if (!Number.isInteger(value.rank) || Number(value.rank) < 1 || Number(value.rank) > 3) errors.push(`${path}.rank must be an integer from 1 to 3`);
  if (typeof value.domain !== "string" || !domains.has(value.domain)) errors.push(`${path}.domain is invalid`);
  if (!Number.isInteger(value.estimatedMinutes) || Number(value.estimatedMinutes) < 5 || Number(value.estimatedMinutes) > 480) errors.push(`${path}.estimatedMinutes is invalid`);
  if (typeof value.confidence !== "number" || value.confidence < 0 || value.confidence > 1) errors.push(`${path}.confidence must be from 0 to 1`);
  if (!isStringArray(value.sourceIds)) errors.push(`${path}.sourceIds must be a string array`);
}

function validateAction(value: unknown, index: number, errors: string[]) {
  const path = `actions[${index}]`;
  if (!isRecord(value)) { errors.push(`${path} must be an object`); return; }
  requireText(value.id, `${path}.id`, errors); requireText(value.title, `${path}.title`, errors); requireText(value.reason, `${path}.reason`, errors);
  if (typeof value.kind !== "string" || !actionKinds.has(value.kind)) errors.push(`${path}.kind is invalid`);
  if (typeof value.domain !== "string" || !domains.has(value.domain)) errors.push(`${path}.domain is invalid`);
  if (!Number.isInteger(value.estimatedMinutes) || Number(value.estimatedMinutes) < 5 || Number(value.estimatedMinutes) > 480) errors.push(`${path}.estimatedMinutes is invalid`);
  if (typeof value.requiresApproval !== "boolean") errors.push(`${path}.requiresApproval must be boolean`);
  if (value.status !== "proposed") errors.push(`${path}.status must be proposed`);
  if (!isStringArray(value.sourceIds)) errors.push(`${path}.sourceIds must be a string array`);
}

function validateSignal(value: unknown, index: number, errors: string[]) {
  const path = `signals[${index}]`;
  if (!isRecord(value)) { errors.push(`${path} must be an object`); return; }
  requireText(value.id, `${path}.id`, errors); requireText(value.title, `${path}.title`, errors); requireText(value.detail, `${path}.detail`, errors);
  if (!new Set(["risk", "opportunity", "change", "info"]).has(String(value.category))) errors.push(`${path}.category is invalid`);
  if (typeof value.domain !== "string" || !domains.has(value.domain)) errors.push(`${path}.domain is invalid`);
  if (!isStringArray(value.sourceIds)) errors.push(`${path}.sourceIds must be a string array`);
}

export function validateOperatorPlan(value: unknown): PlanValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) return { ok: false, errors: ["plan must be an object"] };
  if (value.version !== 1) errors.push("version must be 1");
  requireText(value.generatedAt, "generatedAt", errors); requireText(value.horizonDate, "horizonDate", errors);
  requireText(value.timezone, "timezone", errors); requireText(value.summary, "summary", errors);
  if (!isRecord(value.generation) || !new Set(["deterministic", "model"]).has(String(value.generation.mode))) errors.push("generation.mode is invalid");
  if (!Array.isArray(value.priorities) || value.priorities.length > 3) errors.push("priorities must be an array with at most 3 items");
  else value.priorities.forEach((item, index) => validatePriority(item, index, errors));
  if (!Array.isArray(value.actions) || value.actions.length > 8) errors.push("actions must be an array with at most 8 items");
  else value.actions.forEach((item, index) => validateAction(item, index, errors));
  if (!Array.isArray(value.signals) || value.signals.length > 12) errors.push("signals must be an array with at most 12 items");
  else value.signals.forEach((item, index) => validateSignal(item, index, errors));
  return errors.length ? { ok: false, errors } : { ok: true, value: value as OperatorPlan };
}

export function assertOperatorPlan(value: unknown): OperatorPlan {
  const result = validateOperatorPlan(value);
  if (!result.ok) throw new Error(`Invalid Operator plan: ${result.errors.join("; ")}`);
  return result.value;
}
