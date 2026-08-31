import assert from "node:assert/strict";
import test from "node:test";
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
