import { remainingCapacityMinutes } from "./calendar.ts";
import { validateOperatorPlan } from "./schema.ts";
import type { OperatorActionKind, OperatorContext, OperatorDomain, OperatorPlan, OperatorPlanAction, OperatorPlanPriority, OperatorPlanSignal } from "./types.ts";

type Candidate = Omit<OperatorPlanPriority, "id" | "rank"> & { score: number; actionKind: OperatorActionKind };

function domainFromText(value: string): OperatorDomain {
  const text = value.toLowerCase();
  if (/career|job|role|interview|resume|application/.test(text)) return "career";
  if (/learn|expert|research|paper|course|agentic/.test(text)) return "learning";
  if (/startup|idea|validat|customer|market/.test(text)) return "startup";
  if (/content|publish|post|write|distribution/.test(text)) return "content";
  if (/calendar|schedule|meeting|time/.test(text)) return "calendar";
  return "general";
}

function daysUntil(date: string, today: string): number {
  const target = Date.parse(`${date.slice(0, 10)}T00:00:00Z`);
  const base = Date.parse(`${today}T00:00:00Z`);
  return Number.isNaN(target) ? 365 : Math.ceil((target - base) / 86_400_000);
}

function urgencyScore(days: number) {
  if (days < 0) return 45;
  if (days <= 3) return 35;
  if (days <= 7) return 25;
  if (days <= 14) return 12;
  return 0;
}

function goalCandidates(context: OperatorContext): Candidate[] {
  return context.goals.filter(goal => goal.state === "active").flatMap(goal => goal.milestones
    .filter(milestone => milestone.completionPercentage < 100 && milestone.status !== "skipped")
    .map(milestone => {
      const days = daysUntil(milestone.targetDate, context.today);
      const domain = domainFromText(`${goal.id} ${goal.title} ${milestone.title}`);
      return {
        score: goal.priority * 18 + urgencyScore(days) + (100 - milestone.completionPercentage) * 0.12 + (milestone.status === "blocked" ? 8 : 0),
        domain,
        title: milestone.status === "blocked" ? `Unblock ${milestone.title}` : `Advance ${milestone.title}`,
        reason: `${goal.title} is ${goal.priority >= 5 ? "highest" : goal.priority === 4 ? "high" : goal.priority === 3 ? "medium" : goal.priority === 2 ? "low" : "lowest"} priority; this milestone is ${milestone.completionPercentage}% complete and due ${milestone.targetDate}.`,
        estimatedMinutes: domain === "career" ? 45 : 60,
        confidence: 0.92,
        sourceIds: [goal.id, milestone.id],
        goalId: goal.id,
        milestoneId: milestone.id,
        dueDate: milestone.targetDate,
        actionKind: milestone.status === "blocked" ? "review" as const : "focus_block" as const,
      };
    }));
}

function workspaceCandidates(context: OperatorContext): Candidate[] {
  const candidates: Candidate[] = [];
  const job = context.jobs.filter(item => !new Set(["applied", "rejected", "archived"]).has(item.status)).sort((a, b) => b.fitScore - a.fitScore)[0];
  if (job) {
    const profileReady = Boolean(context.careerProfile?.resumeExcerpt || context.careerProfile?.targetRoles.length);
    const careerGoal = context.goals.find(goal => /career|job|role|application/i.test(`${goal.id} ${goal.title}`));
    const careerMilestone = careerGoal?.milestones.find(item => item.completionPercentage < 100 && item.status !== "skipped");
    candidates.push({
      score: job.fitScore + (profileReady ? 18 : 8) + (job.fitScore >= 85 ? 20 : 0),
      domain: "career",
      title: `Review ${job.title} at ${job.company}`,
      reason: job.fitReason || `This is the highest uncompleted role match at ${job.fitScore}% fit.`,
      estimatedMinutes: 45,
      confidence: profileReady ? 0.9 : 0.72,
      sourceIds: [job.id, careerGoal?.id, careerMilestone?.id].filter((item): item is string => Boolean(item)),
      goalId: careerGoal?.id,
      milestoneId: careerMilestone?.id,
      actionKind: "focus_block",
    });
  }
  const learning = context.learningItems.filter(item => item.status === "recommended").sort((a, b) => a.durationMinutes - b.durationMinutes)[0];
  if (learning) candidates.push({
    score: 64, domain: "learning", title: `Learn: ${learning.title}`, reason: learning.relevance || "This item is in the recommended learning queue.",
    estimatedMinutes: learning.durationMinutes, confidence: 0.8, sourceIds: [learning.id, learning.trackId].filter(Boolean), actionKind: "learn",
  });
  const startup = context.startupIdeas.filter(item => !new Set(["parked", "committed"]).has(item.state)).sort((a, b) => a.reviewDate.localeCompare(b.reviewDate))[0];
  if (startup) candidates.push({
    score: 48 + urgencyScore(daysUntil(startup.reviewDate, context.today)), domain: "startup", title: `Validate ${startup.title}`,
    reason: `${startup.nextValidation} Current confidence is ${startup.confidence}%.`, estimatedMinutes: 45, confidence: 0.78,
    sourceIds: [startup.id], dueDate: startup.reviewDate, actionKind: "research",
  });
  const content = context.contentIdeas.filter(item => item.status === "recommended").sort((a, b) => b.score - a.score)[0];
  if (content) candidates.push({
    score: content.score * 0.55, domain: "content", title: `Develop ${content.title}`, reason: `${content.nextAction}; this is the highest-ranked content idea.`,
    estimatedMinutes: 40, confidence: 0.76, sourceIds: [content.id], actionKind: "create",
  });
  return candidates;
}

function signals(context: OperatorContext): OperatorPlanSignal[] {
  const result: OperatorPlanSignal[] = [];
  context.goals.filter(goal => goal.state === "active" && new Set(["At risk", "Behind"]).has(goal.forecast)).forEach(goal => result.push({
    id: `signal-goal-${goal.id}`, category: "risk", domain: domainFromText(`${goal.id} ${goal.title}`),
    title: `${goal.title} is ${goal.forecast.toLowerCase()}`, detail: `Progress is ${goal.progressPercentage}% against a ${goal.targetDate} target.`, sourceIds: [goal.id],
  }));
  const disconnected = context.connectors.filter(item => item.status === "not_connected");
  if (disconnected.length) result.push({
    id: "signal-connectors", category: "info", domain: "general", title: `${disconnected.length} data source${disconnected.length === 1 ? " is" : "s are"} not connected`,
    detail: `Recommendations do not yet include ${disconnected.map(item => item.name).join(", ")}.`, sourceIds: disconnected.map(item => item.id),
  });
  const highFit = context.jobs.filter(job => job.fitScore >= 85 && !new Set(["applied", "rejected", "archived"]).has(job.status));
  if (highFit.length) result.push({
    id: "signal-high-fit-jobs", category: "opportunity", domain: "career", title: `${highFit.length} high-fit role${highFit.length === 1 ? "" : "s"} need review`,
    detail: `The strongest current match is ${Math.max(...highFit.map(item => item.fitScore))}%.`, sourceIds: highFit.map(item => item.id),
  });
  if (!context.careerProfile?.resumeExcerpt) result.push({
    id: "signal-resume", category: "info", domain: "career", title: "Career scoring is running without a résumé",
    detail: "Upload or paste a résumé so role rankings can cite evidence instead of seed scores.", sourceIds: ["career-profile"],
  });
  const remaining = remainingCapacityMinutes(context.calendar, context.today);
  if (remaining < 90) result.push({
    id: "signal-capacity", category: "risk", domain: "calendar", title: `Only ${remaining} minutes of focus capacity remain today`,
    detail: "New Operator blocks will snap to the next free weekday gap instead of overlapping existing events.", sourceIds: context.calendar.map(item => item.id).slice(0, 6),
  });
  return result.slice(0, 12);
}

export function buildDeterministicPlan(context: OperatorContext): OperatorPlan {
  const selected = [...goalCandidates(context), ...workspaceCandidates(context)]
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .filter((candidate, index, all) => all.findIndex(item => item.domain === candidate.domain && item.title === candidate.title) === index)
    .slice(0, 3);
  const priorities: OperatorPlanPriority[] = selected.map((candidate, index) => ({
    id: `priority-${candidate.sourceIds[0] ?? index + 1}`,
    rank: index + 1,
    domain: candidate.domain,
    title: candidate.title,
    reason: candidate.reason,
    estimatedMinutes: candidate.estimatedMinutes,
    confidence: candidate.confidence,
    sourceIds: candidate.sourceIds,
    goalId: candidate.goalId,
    milestoneId: candidate.milestoneId,
    dueDate: candidate.dueDate,
  }));
  const actions: OperatorPlanAction[] = selected.map((candidate, index) => ({
    id: `action-${candidate.sourceIds[0] ?? index + 1}`,
    kind: candidate.actionKind,
    domain: candidate.domain,
    title: candidate.title,
    reason: candidate.reason,
    estimatedMinutes: candidate.estimatedMinutes,
    requiresApproval: candidate.actionKind === "focus_block",
    status: "proposed",
    sourceIds: candidate.sourceIds,
    goalId: candidate.goalId,
    milestoneId: candidate.milestoneId,
  }));
  const domains = priorities.map(item => item.domain);
  const summary = priorities.length
    ? `Focus today on ${priorities.map(item => item.title).join("; ")}. This plan balances ${new Set(domains).size} active area${new Set(domains).size === 1 ? "" : "s"}.`
    : "No actionable work was found. Add an active goal or review the connected data sources.";
  const plan: OperatorPlan = {
    version: 1, generatedAt: context.assembledAt, horizonDate: context.today, timezone: context.timezone, summary,
    generation: { mode: "deterministic" }, priorities, actions, signals: signals(context),
  };
  const validation = validateOperatorPlan(plan);
  if (!validation.ok) throw new Error(`Deterministic planner produced an invalid plan: ${validation.errors.join("; ")}`);
  return validation.value;
}
