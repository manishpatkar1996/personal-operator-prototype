import assert from "node:assert/strict";
import test from "node:test";
import { conflictsWith, nextFreeSlot, parsePlanningNote } from "../lib/operator/calendar.ts";
import { buildCouncilProposals } from "../lib/operator/council.ts";
import { assembleOperatorContext } from "../lib/operator/context.ts";
import { runOperatorEvals } from "../lib/operator/evals.ts";
import { scoreJob } from "../lib/operator/scoring.ts";

test("operator eval suite passes", () => {
  const result = runOperatorEvals();
  assert.equal(result.passed, true, result.failures.join("\n"));
  assert.equal(result.total, 5);
});

test("matching AI product role outscores an excluded coordinator role", () => {
  const profile = {
    targetRoles: ["Senior Product Manager"],
    industries: ["AI"],
    locations: ["Bengaluru"],
    workModes: ["Hybrid"],
    strengths: ["agentic products"],
    exclusions: ["pure project management"],
    resumeText: "Product lead for agentic AI systems in Bengaluru.",
  };
  const good = scoreJob(profile, { title: "Senior Product Manager, AI", company: "Zamp", location: "Bengaluru" });
  const bad = scoreJob(profile, { title: "Pure project management coordinator", company: "Agency", location: "Remote US" });
  assert.ok(good.fitScore >= 70, `expected a strong match, got ${good.fitScore}`);
  assert.ok(good.evidence.length > 0);
  assert.ok(bad.fitScore < good.fitScore - 15);
});

test("calendar intelligence skips busy gaps and parses notes", () => {
  const busy = [{ id: "gym", startAt: "2026-09-01T09:00:00+05:30", endAt: "2026-09-01T10:00:00+05:30", state: "synced" }];
  assert.equal(conflictsWith(busy, "2026-09-01T09:30:00+05:30", "2026-09-01T10:15:00+05:30").length, 1);
  const slot = nextFreeSlot(busy, 45, new Date("2026-09-01T03:30:00Z"));
  assert.equal(slot.startAt, "2026-09-01T10:00:00+05:30");
  const parsed = parsePlanningNote("Prepare for Friday’s interview at 4pm", new Date("2026-08-31T04:00:00Z"));
  assert.equal(parsed.durationMinutes, 45);
  assert.equal(parsed.hour, 16);
});

test("council proposals cite the live high-fit job", () => {
  const context = assembleOperatorContext({
    now: "2026-09-01T04:00:00Z",
    goals: { goals: [{ id: "goal-career", title: "Land an AI product role", desiredOutcome: "Role", successCriteria: "Loops", targetDate: "2026-11-30", priority: 5, state: "active", progressPercentage: 20, forecast: "On track", milestones: [{ id: "ms-1", goalId: "goal-career", title: "Convert to interviews", completionRule: "Five loops", targetDate: "2026-11-20", weight: 1, completionPercentage: 0, status: "active" }] }] },
    workspace: {
      calendar: [],
      jobs: [{ id: "job-high", title: "Product Lead, Agents", company: "AI Infrastructure Co.", location: "Remote", fit_score: 88, status: "recommended", source: "Manual", next_action: "Review" }],
      learningItems: [],
      startupIdeas: [],
      contentIdeas: [{ id: "c1", title: "Goals not task lists", pillar: "AI", status: "recommended", score: 90, source: "Notes", next_action: "Outline" }],
      connectors: [],
      planningNotes: [],
    },
  });
  const proposals = buildCouncilProposals(context);
  assert.equal(proposals.length, 2);
  assert.ok(proposals[0].title.includes("Product Lead, Agents"));
  assert.ok(proposals[1].title.toLowerCase().includes("outline"));
});
