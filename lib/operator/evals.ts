import { assembleOperatorContext } from "./context.ts";
import { buildDeterministicPlan } from "./planner.ts";
import { scoreJob } from "./scoring.ts";
import { validateOperatorPlan } from "./schema.ts";

type EvalCase = {
  id: string;
  description: string;
  run: () => string[];
};

const sampleWorkspace = {
  calendar: [
    { id: "cal-1", title: "Staff meeting", start_at: "2026-09-01T12:00:00+05:30", end_at: "2026-09-01T12:30:00+05:30", ownership: "external_fixed", source: "google_calendar", state: "synced" },
  ],
  jobs: [
    { id: "job-high", title: "Senior Product Manager, AI", company: "Zamp", location: "Bengaluru", fit_score: 92, status: "recommended", source: "Manual", next_action: "Review role", fit_reason: "Title matches target role." },
    { id: "job-low", title: "Project coordinator", company: "Agency", location: "Remote", fit_score: 22, status: "recommended", source: "Manual", next_action: "Skip" },
  ],
  learningItems: [{ id: "learn-1", title: "Memory for agents", track_id: "track-1", source: "Paper", item_type: "Paper", duration_minutes: 20, status: "recommended", relevance: "Supports the expertise goal." }],
  startupIdeas: [{ id: "idea-1", title: "Operator", state: "researching", next_validation: "Interview five people", confidence: 30, review_date: "2026-09-07" }],
  contentIdeas: [{ id: "content-1", title: "Goals not task lists", pillar: "AI", status: "recommended", score: 90, source: "Build notes", next_action: "Outline" }],
  connectors: [{ id: "llm", name: "AI runtime", status: "not_connected" }],
  planningNotes: [],
  calendarPreferences: [{ timezone: "Asia/Kolkata" }],
};

const sampleGoals = {
  goals: [{
    id: "goal-career", title: "Land an AI product role", desiredOutcome: "High-agency role", successCriteria: "Five loops",
    targetDate: "2026-11-30", priority: 5, state: "active", progressPercentage: 40, forecast: "At risk",
    milestones: [{ id: "ms-pipeline", goalId: "goal-career", title: "Build the application pipeline", completionRule: "10 shortlisted", targetDate: "2026-09-30", weight: 25, completionPercentage: 40, status: "active" }],
  }],
};

function errorsFor(id: string, check: () => boolean | string) {
  const result = check();
  if (result === true) return [];
  return [`${id}: ${result === false ? "failed" : result}`];
}

export const OPERATOR_EVAL_CASES: EvalCase[] = [
  {
    id: "plan-validates",
    description: "Deterministic planner returns a schema-valid plan",
    run: () => {
      const plan = buildDeterministicPlan(assembleOperatorContext({ goals: sampleGoals, workspace: sampleWorkspace, now: "2026-09-01T04:00:00Z" }));
      const validation = validateOperatorPlan(plan);
      return errorsFor("plan-validates", () => validation.ok || validation.errors.join("; "));
    },
  },
  {
    id: "high-fit-job-cited",
    description: "The highest-fit open job is cited in the plan",
    run: () => {
      const plan = buildDeterministicPlan(assembleOperatorContext({ goals: sampleGoals, workspace: sampleWorkspace, now: "2026-09-01T04:00:00Z" }));
      const cited = [...plan.priorities, ...plan.actions, ...plan.signals].some(item => item.sourceIds.includes("job-high"));
      return errorsFor("high-fit-job-cited", () => cited || "expected job-high in sourceIds");
    },
  },
  {
    id: "no-empty-reasons",
    description: "Priorities and actions include non-empty reasons and sourceIds",
    run: () => {
      const plan = buildDeterministicPlan(assembleOperatorContext({ goals: sampleGoals, workspace: sampleWorkspace, now: "2026-09-01T04:00:00Z" }));
      const bad = [...plan.priorities, ...plan.actions].filter(item => !item.reason.trim() || !item.sourceIds.length);
      return errorsFor("no-empty-reasons", () => bad.length === 0 || `${bad.length} items missing reason or sourceIds`);
    },
  },
  {
    id: "no-unsafe-kinds",
    description: "Planner never emits apply/message/send actions",
    run: () => {
      const plan = buildDeterministicPlan(assembleOperatorContext({ goals: sampleGoals, workspace: sampleWorkspace, now: "2026-09-01T04:00:00Z" }));
      const unsafe = plan.actions.some(item => /apply|message|send|publish/i.test(`${item.kind} ${item.title}`));
      return errorsFor("no-unsafe-kinds", () => !unsafe);
    },
  },
  {
    id: "exclusion-lowers-score",
    description: "Excluded work is scored lower than a matching target role",
    run: () => {
      const profile = {
        targetRoles: ["Senior Product Manager"],
        industries: ["AI"],
        locations: ["Bengaluru"],
        workModes: ["Remote"],
        strengths: ["AI strategy"],
        exclusions: ["pure project management"],
        resumeText: "Senior product manager for AI platform teams in Bengaluru.",
      };
      const good = scoreJob(profile, { title: "Senior Product Manager, AI", company: "Zamp", location: "Bengaluru" });
      const bad = scoreJob(profile, { title: "Pure project management coordinator", company: "Agency", location: "Remote" });
      return errorsFor("exclusion-lowers-score", () => good.fitScore - bad.fitScore >= 20 || `good ${good.fitScore} vs bad ${bad.fitScore}`);
    },
  },
];

export function runOperatorEvals() {
  const failures = OPERATOR_EVAL_CASES.flatMap(item => item.run());
  return { passed: failures.length === 0, failures, total: OPERATOR_EVAL_CASES.length };
}
