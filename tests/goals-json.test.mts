import assert from "node:assert/strict";
import test from "node:test";
import {
  EXAMPLE_GOALS_DUMP,
  EXAMPLE_GOALS_JSON,
  exportGoalsDump,
  parseGoalDate,
  parseGoalPriority,
  parseGoalWeight,
  parseGoalsDump,
} from "../lib/operator/goals-json.ts";

test("parses ISO and DD/MM/YYYY dates into ISO", () => {
  assert.equal(parseGoalDate("2026-11-30"), "2026-11-30");
  assert.equal(parseGoalDate("30/11/2026"), "2026-11-30");
  assert.equal(parseGoalDate("10/09/2026"), "2026-09-10");
  assert.equal(parseGoalDate("1/9/2026"), "2026-09-01");
  assert.throws(() => parseGoalDate("November 30"), /YYYY-MM-DD/);
});

test("maps High Medium Low and numeric priorities", () => {
  assert.equal(parseGoalPriority("High"), 5);
  assert.equal(parseGoalPriority("medium"), 3);
  assert.equal(parseGoalPriority("Low"), 2);
  assert.equal(parseGoalPriority(4), 4);
  assert.throws(() => parseGoalPriority("urgent"), /Priority/);
});

test("stores percent weights as integer weights", () => {
  assert.equal(parseGoalWeight("15%"), 15);
  assert.equal(parseGoalWeight(20), 20);
  assert.equal(parseGoalWeight("25"), 25);
});

test("parses a dump with word priority, percent weights, and DMY dates", () => {
  const dump = parseGoalsDump(`{
    "goals": [{
      "title": "Land a high-agency AI Product role",
      "desiredOutcome": "Join a strong AI-first team with ownership.",
      "successCriteria": "At least 1 accepted offer that meets the quality bar.",
      "targetDate": "30/11/2026",
      "priority": "High",
      "state": "active",
      "milestones": [{
        "title": "Build target-company and role map",
        "completionRule": "30–40 priority companies identified.",
        "targetDate": "10/09/2026",
        "weight": "15%",
        "completionPercentage": 0,
        "status": "not_started"
      }]
    }]
  }`);
  assert.equal(dump.goals[0].targetDate, "2026-11-30");
  assert.equal(dump.goals[0].priority, 5);
  assert.equal(dump.goals[0].milestones[0].targetDate, "2026-09-10");
  assert.equal(dump.goals[0].milestones[0].weight, 15);
});

test("example pack is five faithful outcome goals that round-trip and is labeled a sample", () => {
  const parsed = parseGoalsDump(EXAMPLE_GOALS_JSON);
  assert.equal(parsed.goals.length, 5);
  assert.deepEqual(parsed.goals.map(goal => goal.title), [
    "Land a high-agency AI Product role",
    "Become exceptional at AI / Senior PM interviews",
    "Become a top-tier AI Product builder",
    "Build a strong public voice in AI Product",
    "Find and validate a startup idea worth building",
  ]);
  assert.equal(parsed.goals[0].priority, 5);
  assert.equal(parsed.goals[3].priority, 3);
  assert.equal(parsed.goals[0].milestones.length, 5);
  assert.equal(parsed.goals[0].milestones[0].title, "Build target-company and role map");
  assert.equal(parsed.goals[0].milestones.reduce((sum, item) => sum + item.weight, 0), 100);
  assert.match(parsed.goals[0].desiredOutcome, /meaningful ownership/);
  assert.doesNotMatch(EXAMPLE_GOALS_JSON, /Zamp|AthenaHealth hiring bar/);
  const exported = exportGoalsDump(parsed.goals);
  assert.deepEqual(exported, EXAMPLE_GOALS_DUMP);
});

test("rejects empty or invalid JSON", () => {
  assert.throws(() => parseGoalsDump("{"), /valid JSON/);
  assert.throws(() => parseGoalsDump({ goals: [] }), /at least one goal/);
});

test("a machine with a résumé and goals is treated as already onboarded", async () => {
  const { inferPersonalOperator } = await import("../lib/operator/operator-setup.ts");
  assert.equal(inferPersonalOperator({ resumeChars: 400, goalCount: 2 }), true);
  assert.equal(inferPersonalOperator({ resumeChars: 10, goalCount: 2 }), false);
  assert.equal(inferPersonalOperator({ resumeChars: 400, goalCount: 0 }), false);
});

test("setup checklist shows Calendar as optional and never says Reconnect when unused", async () => {
  const { calendarSetupStatus, setupChecklist, setupComplete } = await import("../lib/operator/operator-setup.ts");
  const empty = setupChecklist({ resumeChars: 0, roleCount: 0, goalCount: 0, locationCount: 0 });
  const calendar = empty.find(item => item.id === "calendar");
  assert.ok(calendar);
  assert.equal(calendar.done, false);
  assert.equal(calendar.required, false);
  assert.equal(calendar.status, "Not connected");
  assert.doesNotMatch(calendar.status, /Reconnect/i);
  assert.equal(calendarSetupStatus(false).label, "Not connected");
  assert.doesNotMatch(calendarSetupStatus(false).label, /Reconnect/i);
  assert.equal(setupComplete({ resumeChars: 400, roleCount: 1, goalCount: 1 }), true);
  const live = setupChecklist({ resumeChars: 400, roleCount: 1, goalCount: 1, locationCount: 1, calendarConnected: true });
  const connected = live.find(item => item.id === "calendar");
  assert.equal(connected?.done, true);
  assert.equal(connected?.status, "Google read is live");
  assert.equal(setupComplete({ resumeChars: 400, roleCount: 1, goalCount: 1 }), true);
});
