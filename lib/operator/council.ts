import type { OperatorContext } from "./types.ts";
import { remainingCapacityMinutes } from "./calendar.ts";

export type CouncilDraft = {
  roleId: "tyrion" | "samwell";
  title: string;
  rationale: string;
};

export function buildCouncilProposals(context: OperatorContext): CouncilDraft[] {
  const remaining = remainingCapacityMinutes(context.calendar, context.today);
  const job = context.jobs.filter(item => !["applied", "rejected", "archived"].includes(item.status)).sort((a, b) => b.fitScore - a.fitScore)[0];
  const milestone = context.goals
    .filter(goal => goal.state === "active")
    .flatMap(goal => goal.milestones.map(item => ({ goal, item })))
    .filter(entry => entry.item.completionPercentage < 100 && entry.item.status !== "skipped")
    .sort((a, b) => a.item.targetDate.localeCompare(b.item.targetDate))[0];
  const content = context.contentIdeas.filter(item => item.status === "recommended" || item.status === "idea").sort((a, b) => b.score - a.score)[0];
  const learning = context.learningItems.find(item => item.status === "recommended");

  const tyrion: CouncilDraft = remaining < 90
    ? {
      roleId: "tyrion",
      title: "Protect one Operator-owned focus block tomorrow",
      rationale: `Today has only ${remaining} minutes of remaining 8-hour capacity. External meetings stay read-only; this only proposes an Operator-owned block.`,
    }
    : job
      ? {
        roleId: "tyrion",
        title: `Review ${job.title} at ${job.company} this week`,
        rationale: `This is the strongest open match at ${job.fitScore}% fit. The council can only propose calendar time — it cannot apply or message.`,
      }
      : {
        roleId: "tyrion",
        title: milestone ? `Advance ${milestone.item.title}` : "Keep one protected deep-work block this week",
        rationale: milestone
          ? `${milestone.goal.title} is the nearest incomplete milestone, due ${milestone.item.targetDate}.`
          : "No high-fit role or dated milestone is open, so the next useful move is protected focus time.",
      };

  const samwell: CouncilDraft = content
    ? {
      roleId: "samwell",
      title: `Outline “${content.title}” before drafting`,
      rationale: `${content.nextAction} This stays in the content workspace; publishing is never automatic.`,
    }
    : {
      roleId: "samwell",
      title: learning ? `Turn “${learning.title}” into a short operator note` : "Use the Operator build as this week's public thread",
      rationale: learning
        ? "A learning item can become a career-facing artifact without leaving the local workspace."
        : "The live build is the strongest proof point for both career positioning and the expertise goal.",
    };

  return [tyrion, samwell];
}
