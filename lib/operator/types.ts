export const OPERATOR_DOMAINS = ["career", "learning", "startup", "content", "calendar", "general"] as const;
export type OperatorDomain = (typeof OPERATOR_DOMAINS)[number];

export type OperatorMilestone = {
  id: string;
  goalId: string;
  title: string;
  completionRule: string;
  targetDate: string;
  weight: number;
  completionPercentage: number;
  status: string;
};

export type OperatorGoal = {
  id: string;
  title: string;
  desiredOutcome: string;
  successCriteria: string;
  targetDate: string;
  priority: number;
  state: string;
  progressPercentage: number;
  forecast: string;
  milestones: OperatorMilestone[];
};

export type OperatorCalendarBlock = {
  id: string;
  title: string;
  goalId?: string;
  milestoneId?: string;
  startAt: string;
  endAt: string;
  state: string;
  ownership: string;
  source: string;
};

export type OperatorJob = {
  id: string;
  title: string;
  company: string;
  location: string;
  fitScore: number;
  status: string;
  source: string;
  nextAction: string;
};

export type OperatorLearningItem = {
  id: string;
  trackId: string;
  title: string;
  source: string;
  itemType: string;
  durationMinutes: number;
  status: string;
  relevance: string;
};

export type OperatorStartupIdea = {
  id: string;
  title: string;
  state: string;
  nextValidation: string;
  confidence: number;
  reviewDate: string;
};

export type OperatorContentIdea = {
  id: string;
  title: string;
  pillar: string;
  status: string;
  score: number;
  source: string;
  nextAction: string;
};

export type OperatorConnector = {
  id: string;
  name: string;
  status: string;
  detail: string;
  updatedAt?: string;
};

export type OperatorPlanningNote = {
  id: string;
  note: string;
  result: string;
  createdAt: string;
};

export type OperatorContext = {
  version: 1;
  assembledAt: string;
  timezone: string;
  today: string;
  goals: OperatorGoal[];
  calendar: OperatorCalendarBlock[];
  jobs: OperatorJob[];
  learningItems: OperatorLearningItem[];
  startupIdeas: OperatorStartupIdea[];
  contentIdeas: OperatorContentIdea[];
  connectors: OperatorConnector[];
  planningNotes: OperatorPlanningNote[];
};

export type OperatorContextInput = {
  goals?: unknown;
  workspace?: unknown;
  now?: string | Date;
  timezone?: string;
};

export const OPERATOR_ACTION_KINDS = ["focus_block", "review", "research", "respond", "follow_up", "learn", "create"] as const;
export type OperatorActionKind = (typeof OPERATOR_ACTION_KINDS)[number];

export type OperatorPlanPriority = {
  id: string;
  rank: number;
  domain: OperatorDomain;
  title: string;
  reason: string;
  estimatedMinutes: number;
  confidence: number;
  sourceIds: string[];
  goalId?: string;
  milestoneId?: string;
  dueDate?: string;
};

export type OperatorPlanAction = {
  id: string;
  kind: OperatorActionKind;
  domain: OperatorDomain;
  title: string;
  reason: string;
  estimatedMinutes: number;
  requiresApproval: boolean;
  status: "proposed";
  sourceIds: string[];
  goalId?: string;
  milestoneId?: string;
  suggestedWindow?: { earliest: string; latest: string };
};

export type OperatorPlanSignal = {
  id: string;
  category: "risk" | "opportunity" | "change" | "info";
  domain: OperatorDomain;
  title: string;
  detail: string;
  sourceIds: string[];
};

export type OperatorPlan = {
  version: 1;
  generatedAt: string;
  horizonDate: string;
  timezone: string;
  summary: string;
  generation: {
    mode: "deterministic" | "model";
    provider?: string;
    fallbackReason?: string;
  };
  priorities: OperatorPlanPriority[];
  actions: OperatorPlanAction[];
  signals: OperatorPlanSignal[];
};

export type PlanValidationResult =
  | { ok: true; value: OperatorPlan }
  | { ok: false; errors: string[] };
