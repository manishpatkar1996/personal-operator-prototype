import type {
  OperatorCalendarBlock,
  OperatorCareerProfile,
  OperatorConnector,
  OperatorContentIdea,
  OperatorContext,
  OperatorContextInput,
  OperatorGoal,
  OperatorJob,
  OperatorLearningItem,
  OperatorPlanningNote,
  OperatorStartupIdea,
} from "./types.ts";
import { isRelevantTrackedJob } from "./job-relevance.ts";

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : value == null ? fallback : String(value).trim();
}

function number(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bounded(value: unknown, min: number, max: number, fallback = min): number {
  return Math.max(min, Math.min(max, number(value, fallback)));
}

function optionalText(value: unknown): string | undefined {
  const result = text(value);
  return result || undefined;
}

function first(source: UnknownRecord, camel: string, snake: string): unknown {
  return source[camel] ?? source[snake];
}

function validDate(value: unknown, fallback: string): string {
  const candidate = text(value);
  return candidate && !Number.isNaN(Date.parse(candidate)) ? candidate : fallback;
}

function dateInTimezone(date: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function normalizeGoal(value: unknown): OperatorGoal | null {
  const source = record(value);
  const id = text(source.id);
  const title = text(source.title);
  if (!id || !title) return null;
  const milestones = array(source.milestones).map(item => {
    const milestone = record(item);
    const milestoneId = text(milestone.id);
    if (!milestoneId || !text(milestone.title)) return null;
    return {
      id: milestoneId,
      goalId: text(first(milestone, "goalId", "goal_id"), id),
      title: text(milestone.title),
      completionRule: text(first(milestone, "completionRule", "completion_rule")),
      targetDate: text(first(milestone, "targetDate", "target_date")),
      weight: Math.max(1, number(milestone.weight, 1)),
      completionPercentage: bounded(first(milestone, "completionPercentage", "completion_percentage"), 0, 100),
      status: text(milestone.status, "not_started"),
    };
  }).filter(item => item !== null);
  return {
    id,
    title,
    desiredOutcome: text(first(source, "desiredOutcome", "desired_outcome")),
    successCriteria: text(first(source, "successCriteria", "success_criteria")),
    targetDate: text(first(source, "targetDate", "target_date")),
    priority: bounded(source.priority, 1, 5, 3),
    state: text(source.state, "active"),
    progressPercentage: bounded(first(source, "progressPercentage", "progress_percentage"), 0, 100),
    forecast: text(source.forecast, "Needs review"),
    milestones,
  };
}

function normalizeCalendar(value: unknown): OperatorCalendarBlock | null {
  const source = record(value);
  const id = text(source.id);
  const title = text(source.title);
  const startAt = text(first(source, "startAt", "start_at"));
  const endAt = text(first(source, "endAt", "end_at"));
  if (!id || !title || !startAt || !endAt) return null;
  return {
    id, title, startAt, endAt,
    goalId: optionalText(first(source, "goalId", "goal_id")),
    milestoneId: optionalText(first(source, "milestoneId", "milestone_id")),
    state: text(source.state, "scheduled"),
    ownership: text(source.ownership, "external_fixed"),
    source: text(source.source, "unknown"),
  };
}

function stringList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map(item => text(item)).filter(Boolean);
}

function normalizeJob(value: unknown): OperatorJob | null {
  const source = record(value);
  const id = text(source.id);
  const title = text(source.title);
  if (!id || !title) return null;
  const evidenceValue = source.evidence ?? source.evidence_json;
  let evidence: string[] = [];
  if (typeof evidenceValue === "string") {
    try {
      const parsed: unknown = JSON.parse(evidenceValue);
      if (Array.isArray(parsed)) evidence = parsed.map(item => text(item)).filter(Boolean);
      else if (parsed && typeof parsed === "object") {
        const record = parsed as Record<string, unknown>;
        const matches = Array.isArray(record.matches) ? record.matches : Array.isArray(record.evidence) ? record.evidence : [];
        evidence = matches.map(item => text(item)).filter(Boolean);
      }
    } catch {
      evidence = [];
    }
  } else if (Array.isArray(evidenceValue)) {
    evidence = evidenceValue.map(item => text(item)).filter(Boolean);
  } else if (evidenceValue && typeof evidenceValue === "object") {
    const record = evidenceValue as Record<string, unknown>;
    const matches = Array.isArray(record.matches) ? record.matches : Array.isArray(record.evidence) ? record.evidence : [];
    evidence = matches.map(item => text(item)).filter(Boolean);
  }
  return {
    id, title,
    company: text(source.company, "Unknown company"),
    location: text(source.location),
    fitScore: bounded(first(source, "fitScore", "fit_score"), 0, 100),
    status: text(source.status, "recommended"),
    source: text(source.source, "unknown"),
    nextAction: text(first(source, "nextAction", "next_action"), "Review role"),
    url: optionalText(source.url),
    fitReason: optionalText(first(source, "fitReason", "fit_reason")),
    evidence,
  };
}

function normalizeCareerProfile(value: unknown): OperatorCareerProfile | null {
  const source = record(value);
  if (!Object.keys(source).length) return null;
  const resume = text(first(source, "resumeText", "resume_text"));
  return {
    targetRoles: stringList(source.targetRoles ?? source.target_roles),
    locations: stringList(source.locations),
    industries: stringList(source.industries),
    workModes: stringList(source.workModes ?? source.work_modes),
    strengths: stringList(source.strengths),
    exclusions: stringList(source.exclusions),
    compensationNotes: text(first(source, "compensationNotes", "compensation_notes")),
    resumeFilename: text(first(source, "resumeFilename", "resume_filename")),
    resumeExcerpt: resume.slice(0, 4_000),
    onboardingStatus: text(first(source, "onboardingStatus", "onboarding_status"), "not_started"),
  };
}

function normalizeLearningItem(value: unknown): OperatorLearningItem | null {
  const source = record(value);
  const id = text(source.id);
  const title = text(source.title);
  if (!id || !title) return null;
  return {
    id, title,
    trackId: text(first(source, "trackId", "track_id")),
    source: text(source.source, "unknown"),
    itemType: text(first(source, "itemType", "item_type"), "Item"),
    durationMinutes: Math.max(5, number(first(source, "durationMinutes", "duration_minutes"), 20)),
    status: text(source.status, "recommended"),
    relevance: text(source.relevance),
  };
}

function normalizeStartupIdea(value: unknown): OperatorStartupIdea | null {
  const source = record(value);
  const id = text(source.id);
  const title = text(source.title);
  if (!id || !title) return null;
  return {
    id, title,
    state: text(source.state, "captured"),
    nextValidation: text(first(source, "nextValidation", "next_validation"), "Define the next validation step"),
    confidence: bounded(source.confidence, 0, 100),
    reviewDate: text(first(source, "reviewDate", "review_date")),
  };
}

function normalizeContentIdea(value: unknown): OperatorContentIdea | null {
  const source = record(value);
  const id = text(source.id);
  const title = text(source.title);
  if (!id || !title) return null;
  return {
    id, title,
    pillar: text(source.pillar, "General"),
    status: text(source.status, "idea"),
    score: bounded(source.score, 0, 100),
    source: text(source.source, "unknown"),
    nextAction: text(first(source, "nextAction", "next_action"), "Review idea"),
  };
}

function normalizeConnector(value: unknown): OperatorConnector | null {
  const source = record(value);
  const id = text(source.id);
  if (!id) return null;
  return {
    id,
    name: text(source.name, id),
    status: text(source.status, "not_connected"),
    detail: text(source.detail),
    updatedAt: optionalText(first(source, "updatedAt", "updated_at")),
  };
}

function normalizePlanningNote(value: unknown): OperatorPlanningNote | null {
  const source = record(value);
  const id = text(source.id);
  const note = text(source.note);
  if (!id || !note) return null;
  return {
    id, note,
    result: text(source.result),
    createdAt: text(first(source, "createdAt", "created_at")),
  };
}

export function assembleOperatorContext(input: OperatorContextInput): OperatorContext {
  const now = input.now instanceof Date ? input.now : new Date(input.now ?? Date.now());
  const safeNow = Number.isNaN(now.getTime()) ? new Date() : now;
  const workspace = record(input.workspace);
  const goalsEnvelope = record(input.goals);
  const goalsSource = Array.isArray(input.goals) ? input.goals : goalsEnvelope.goals;
  const calendarPreferences = record(array(workspace.calendarPreferences)[0]);
  const timezone = text(input.timezone ?? calendarPreferences.timezone, "Asia/Kolkata");
  const assembledAt = safeNow.toISOString();

  const careerProfile = normalizeCareerProfile(input.careerProfile);
  const jobs = array(workspace.jobs).map(normalizeJob).filter(item => item !== null)
    .filter(job => isRelevantTrackedJob(job, { targetRoles: careerProfile?.targetRoles ?? [] }));

  return {
    version: 1,
    assembledAt,
    timezone,
    today: dateInTimezone(safeNow, timezone),
    goals: array(goalsSource).map(normalizeGoal).filter(item => item !== null),
    calendar: array(workspace.calendar).map(normalizeCalendar).filter(item => item !== null),
    jobs,
    learningItems: array(workspace.learningItems).map(normalizeLearningItem).filter(item => item !== null),
    startupIdeas: array(workspace.startupIdeas).map(normalizeStartupIdea).filter(item => item !== null),
    contentIdeas: array(workspace.contentIdeas).map(normalizeContentIdea).filter(item => item !== null),
    connectors: array(workspace.connectors).map(normalizeConnector).filter(item => item !== null),
    planningNotes: array(workspace.planningNotes).map(normalizePlanningNote).filter(item => item !== null)
      .map(item => ({ ...item, createdAt: validDate(item.createdAt, assembledAt) })),
    careerProfile,
  };
}
