import { DEEPSEEK_LIVE, OPENAI_LIVE } from "./models.ts";

export type PlanModelState = {
  status?: string;
  provider?: string;
  reason?: string;
  keyReady?: boolean;
};

export type ConnectorRow = {
  id?: unknown;
  status?: unknown;
  detail?: unknown;
};

function llmConnector(connectors: ConnectorRow[] | undefined) {
  return connectors?.find(item => String(item.id) === "llm");
}

export function liveModelReady(model?: PlanModelState, connectors?: ConnectorRow[]) {
  if (model?.status === "used") return true;
  if (model?.keyReady) return true;
  const llm = llmConnector(connectors);
  return String(llm?.status ?? "") === "connected";
}

export function liveModelName(model?: PlanModelState, connectors?: ConnectorRow[]) {
  if (model?.provider === "deepseek" || (DEEPSEEK_LIVE && liveModelReady(model, connectors))) return "DeepSeek";
  if (model?.provider === "openai" || OPENAI_LIVE) return "OpenAI";
  const detail = String(llmConnector(connectors)?.detail ?? "");
  if (/deepseek/i.test(detail)) return "DeepSeek";
  return "Model";
}

export function sidebarModelCopy(model?: PlanModelState, connectors?: ConnectorRow[]) {
  const ready = liveModelReady(model, connectors);
  const name = liveModelName(model, connectors);
  if (model?.status === "used") {
    return { title: name, detail: `${name} is the live model`, ready: true };
  }
  if (/429/.test(model?.reason ?? "")) {
    return { title: "Local rules · rate limited", detail: "Today stayed on local rules after a rate limit.", ready };
  }
  if (model?.reason === "local_plan" || model?.status === "disabled") {
    if (ready) {
      return {
        title: `Local plan · ${name} ready`,
        detail: "Deterministic Today on purpose. Refresh with model to spend tokens.",
        ready: true,
      };
    }
    return {
      title: "No model key · still works",
      detail: "Local rules cover Today. Add DEEPSEEK_API_KEY to .dev.vars for live drafts.",
      ready: false,
    };
  }
  if (ready) {
    return { title: `${name} ready`, detail: String(llmConnector(connectors)?.detail ?? `${name} is configured.`), ready: true };
  }
  return { title: "No model key · still works", detail: "Local rules. Live drafts need a model key.", ready: false };
}

export function modelGuideCopy(model?: PlanModelState) {
  if (!model || model.status === "used") return null;
  const reason = model.reason ?? "";
  if (reason === "local_plan") return null;
  if (model.keyReady) return null;
  if (model.status === "disabled" || /not configured|OPENAI_API_KEY|DEEPSEEK_API_KEY|No configured model/i.test(reason)) {
    return {
      title: "No model key · still works",
      lead: "Rankings, the daily plan, calendar approvals, and your edits still work without a live model.",
      fix: "Add DEEPSEEK_API_KEY to .dev.vars if you want live drafts and Refresh with model. Restart the dev server after saving. Never paste keys into chat.",
      retry: false,
    };
  }
  if (/429/.test(reason)) {
    return {
      title: "Live models did not respond",
      lead: "The live model hit a rate limit. Local rules are covering Today so you can keep working.",
      fix: "Confirm DEEPSEEK_API_KEY is in .dev.vars, or wait and retry. Never paste keys into chat.",
      retry: true,
    };
  }
  if (model.status === "fallback" || reason) {
    return {
      title: "Models unavailable",
      lead: reason || "The live model did not return a usable result. Local rules are filling in.",
      fix: "Retry when an API is healthy. Goals, calendar approvals, and boards do not need a live model.",
      retry: true,
    };
  }
  return null;
}

export function contentGenerateCopy(ready: boolean) {
  if (ready) {
    return { enabled: true, hint: "Uses the live model. Publishing stays a copy-out." };
  }
  return {
    enabled: false,
    hint: "No model key · still works. Capture and edit locally; Generate needs DEEPSEEK_API_KEY.",
  };
}
