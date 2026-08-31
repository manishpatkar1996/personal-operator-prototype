export const MODEL_TIERS = {
  nano: "gpt-4.1-nano",
  mini: "gpt-4.1-mini",
  standard: "gpt-4.1",
} as const;

export type OperatorTask =
  | "daily_plan"
  | "job_explain"
  | "resume_extract"
  | "voice_parse"
  | "learning_summarize"
  | "learning_select"
  | "content_notes"
  | "content_outline"
  | "content_draft"
  | "content_chat"
  | "startup_research"
  | "startup_chat"
  | "startup_validate"
  | "council";

export type ModelRoute = {
  task: OperatorTask;
  model: string;
  useWhen: string;
  skipLlmWhen: string;
  estimatedUsdPerRun: string;
};

export const MODEL_ROUTES: Record<OperatorTask, ModelRoute> = {
  daily_plan: {
    task: "daily_plan",
    model: MODEL_TIERS.nano,
    useWhen: "Turn workspace context into a 3-item structured plan. Runs whenever Today loads.",
    skipLlmWhen: "No API key, or the deterministic planner already produced a valid plan.",
    estimatedUsdPerRun: "~$0.001",
  },
  job_explain: {
    task: "job_explain",
    model: MODEL_TIERS.mini,
    useWhen: "Write the 2–4 sentence why-apply / gaps paragraph after deterministic scoring.",
    skipLlmWhen: "Fit score is already computed from résumé overlap. LLM is optional colour, not ranking.",
    estimatedUsdPerRun: "~$0.004",
  },
  resume_extract: {
    task: "resume_extract",
    model: MODEL_TIERS.mini,
    useWhen: "Write a complete job-specific LaTeX résumé from the stored résumé. User-triggered.",
    skipLlmWhen: "The user typed preferences by hand.",
    estimatedUsdPerRun: "~$0.01",
  },
  voice_parse: {
    task: "voice_parse",
    model: MODEL_TIERS.nano,
    useWhen: "Turn a planning note into a structured calendar or priority change.",
    skipLlmWhen: "The note is stored as-is and a default 45-minute block is enough.",
    estimatedUsdPerRun: "~$0.001",
  },
  learning_summarize: {
    task: "learning_summarize",
    model: MODEL_TIERS.nano,
    useWhen: "Summarise a paper, post, or transcript. High volume — keep this on nano.",
    skipLlmWhen: "Item is already short, or the user only needs the title and URL.",
    estimatedUsdPerRun: "~$0.002",
  },
  learning_select: {
    task: "learning_select",
    model: MODEL_TIERS.nano,
    useWhen: "Pick the week's articles from fetched feeds against Aemon's taste. One call per collect.",
    skipLlmWhen: "No live model, or fewer than three candidates survived the deterministic filter.",
    estimatedUsdPerRun: "~$0.003",
  },
  content_notes: {
    task: "content_notes",
    model: MODEL_TIERS.mini,
    useWhen: "Turn a captured idea into working notes (angle, proof, claims to avoid).",
    skipLlmWhen: "The idea title and strategy already make a usable note.",
    estimatedUsdPerRun: "~$0.008",
  },
  content_outline: {
    task: "content_outline",
    model: MODEL_TIERS.mini,
    useWhen: "Produce a structured outline for LinkedIn posting or a Medium article.",
    skipLlmWhen: "The backlog only needs ranking, not a draft.",
    estimatedUsdPerRun: "~$0.01",
  },
  content_draft: {
    task: "content_draft",
    model: MODEL_TIERS.standard,
    useWhen: "Write a LinkedIn post or Medium article in the user's voice. Rare, user-triggered.",
    skipLlmWhen: "Handoff to an external editor is enough.",
    estimatedUsdPerRun: "~$0.04",
  },
  content_chat: {
    task: "content_chat",
    model: MODEL_TIERS.mini,
    useWhen: "User asks Samwell how to change the current draft.",
    skipLlmWhen: "Craft checks on hook, length, and bait are enough.",
    estimatedUsdPerRun: "~$0.01",
  },
  startup_research: {
    task: "startup_research",
    model: MODEL_TIERS.mini,
    useWhen: "Map competitors, assumptions, and evidence with citations. Daily research batch.",
    skipLlmWhen: "The idea is still in capture/framing with no research requested.",
    estimatedUsdPerRun: "~$0.02",
  },
  startup_chat: {
    task: "startup_chat",
    model: MODEL_TIERS.mini,
    useWhen: "User opens an idea and talks it into a concrete problem, user, and experiment.",
    skipLlmWhen: "The idea is only being captured as a title.",
    estimatedUsdPerRun: "~$0.01",
  },
  startup_validate: {
    task: "startup_validate",
    model: MODEL_TIERS.mini,
    useWhen: "Judge each thesis field clear vs unclear after a save, chat update, or research rebuild.",
    skipLlmWhen: "No live model. Fields stay unclear until Davos can judge them.",
    estimatedUsdPerRun: "~$0.01",
  },
  council: {
    task: "council",
    model: MODEL_TIERS.standard,
    useWhen: "Daily retrospective. Needs judgement, not volume. One call, structured proposals only.",
    skipLlmWhen: "Open proposals still need review, or the user did not run the retrospective.",
    estimatedUsdPerRun: "~$0.03",
  },
};

export const DEEPSEEK_MODEL = "deepseek-chat";

/** Flip to true to restore OpenAI as primary. Paused while that account has no credits. */
export const OPENAI_LIVE = false;

/** Flip to false to pause DeepSeek and use seeded/deterministic fallbacks. */
export const DEEPSEEK_LIVE = true;

export function deepseekModelFor(envVars: Record<string, string | undefined> = {}) {
  const override = envVars.OPERATOR_MODEL_DEEPSEEK;
  if (typeof override === "string" && override.trim()) return override.trim();
  return DEEPSEEK_MODEL;
}

export function liveProviderOrder(openai: boolean, deepseek: boolean) {
  const order: Array<"openai" | "deepseek"> = [];
  if (OPENAI_LIVE && openai) order.push("openai");
  if (DEEPSEEK_LIVE && deepseek) order.push("deepseek");
  return order;
}

export function modelFor(task: OperatorTask, envVars: Record<string, string | undefined> = {}) {
  const override = envVars[`OPERATOR_MODEL_${task.toUpperCase()}`];
  if (typeof override === "string" && override.trim()) return override.trim();
  return MODEL_ROUTES[task].model;
}
