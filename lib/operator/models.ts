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
  | "content_outline"
  | "content_draft"
  | "startup_research"
  | "startup_chat"
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
    useWhen: "Pull target-role keywords, strengths, and skills out of pasted résumé text once on upload.",
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
  content_outline: {
    task: "content_outline",
    model: MODEL_TIERS.mini,
    useWhen: "Produce a structured outline from a selected idea.",
    skipLlmWhen: "The backlog only needs ranking, not a draft.",
    estimatedUsdPerRun: "~$0.01",
  },
  content_draft: {
    task: "content_draft",
    model: MODEL_TIERS.standard,
    useWhen: "Write a LinkedIn post or longer piece in the user's voice. Rare, user-triggered.",
    skipLlmWhen: "Handoff to an external editor is enough.",
    estimatedUsdPerRun: "~$0.04",
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
  council: {
    task: "council",
    model: MODEL_TIERS.standard,
    useWhen: "Daily retrospective. Needs judgement, not volume. One call, structured proposals only.",
    skipLlmWhen: "Open proposals still need review, or the user did not run the retrospective.",
    estimatedUsdPerRun: "~$0.03",
  },
};

export function modelFor(task: OperatorTask, envVars: Record<string, string | undefined> = {}) {
  const override = envVars[`OPERATOR_MODEL_${task.toUpperCase()}`];
  if (typeof override === "string" && override.trim()) return override.trim();
  return MODEL_ROUTES[task].model;
}
