import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DEFAULT_PROMPTS } from "../lib/operator/agents.ts";
import { OPENAI_LIVE } from "../lib/operator/models.ts";
import {
  matchResumeToJob,
  MIN_RESUME_CHARS,
  parseStoredMatch,
  RESUME_REQUIRED_MESSAGE,
  resumeIsUsable,
} from "../lib/operator/scoring.ts";

const zamp = { title: "Senior Product Manager, AI", company: "Zamp", location: "Bengaluru" };

const profile = {
  targetRoles: ["Senior Product Manager"],
  industries: ["AI"],
  locations: ["Bengaluru"],
  workModes: ["Hybrid"],
  strengths: ["agentic products"],
  exclusions: ["pure project management"],
  resumeText: "Senior Product Manager at athenahealth leading data and AI platform work across agentic workflows and RAG in Bengaluru. Built 0-to-1 agent products for clinicians.",
};

test("a short résumé is blocked before match runs", () => {
  assert.equal(resumeIsUsable(""), false);
  assert.equal(resumeIsUsable("too short"), false);
  assert.equal(resumeIsUsable("x".repeat(MIN_RESUME_CHARS)), false);
  assert.equal(resumeIsUsable(profile.resumeText), true);
  assert.match(RESUME_REQUIRED_MESSAGE, /You \(Setup\)/);
});

test("Zamp match lists résumé evidence and gaps to fix", () => {
  const report = matchResumeToJob(profile, zamp);
  assert.ok(report.fitScore >= 70, `expected a strong Zamp match, got ${report.fitScore}`);
  assert.ok(report.evidence.length > 0, "expected Matches bullets from the résumé");
  assert.ok(report.evidence.some(item => /title|résumé|location|ai/i.test(item)));
  assert.ok(report.gaps.length > 0, "expected Gaps / fix bullets");
  assert.doesNotMatch(report.gaps.join(" "), /\\documentclass|rewritten résumé/i);
});

test("stored evidence_json can hold matches and gaps", () => {
  assert.deepEqual(parseStoredMatch(["Title matches target role."]).matches, ["Title matches target role."]);
  const stored = parseStoredMatch({ matches: ["Platform overlap."], gaps: ["Name RAG in the top half."] });
  assert.deepEqual(stored.matches, ["Platform overlap."]);
  assert.deepEqual(stored.gaps, ["Name RAG in the top half."]);
});

test("Career UX is ATS match, not LaTeX-on-click", async () => {
  const [page, matchUi, jobsRoute] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/career-match.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/career/jobs/route.ts", import.meta.url), "utf8"),
  ]);
  const careerPage = page.slice(page.indexOf("function CareerPage"), page.indexOf("function LearningConfiguration"));
  assert.match(careerPage, /JobCareerMatch/);
  assert.doesNotMatch(careerPage, /Job-specific résumé|resumeVariant|Download \.tex/);
  assert.match(matchUi, /Why this role|Match against résumé/);
  assert.match(matchUi, /Matches/);
  assert.match(matchUi, /Gaps \/ fix/);
  assert.doesNotMatch(matchUi, /Download \.tex|Copy LaTeX|Writing LaTeX|Job-specific résumé/);
  assert.match(jobsRoute, /explainJob/);
  assert.doesNotMatch(jobsRoute, /generateResumeVariant|resumeVariant/);
  assert.equal(OPENAI_LIVE, false);
  const prompt = DEFAULT_PROMPTS.find(item => item.id === "job_explain")?.systemPrompt ?? "";
  assert.match(prompt, /\{reason:string, gaps:string\[\]\}/);
  assert.doesNotMatch(prompt, /\{latex:string\}/);
});
