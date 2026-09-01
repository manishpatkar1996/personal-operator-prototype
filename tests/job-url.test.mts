import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { jobFingerprint, jobFromPaste, parseJobUrl } from "../lib/operator/job-url.ts";
import { matchResumeToJob } from "../lib/operator/scoring.ts";

test("LinkedIn /jobs/view/123 yields the numeric id from the URL string only", () => {
  const parsed = parseJobUrl("https://www.linkedin.com/jobs/view/123");
  assert.equal(parsed.linkedInJobId, "123");
  assert.equal(parsed.title, undefined);
  assert.equal(parsed.company, undefined);
});

test("LinkedIn slug-at-company-123 yields id, title, and company", () => {
  const parsed = parseJobUrl("https://www.linkedin.com/jobs/view/senior-product-manager-at-zamp-4291847391/?refId=abc");
  assert.equal(parsed.linkedInJobId, "4291847391");
  assert.equal(parsed.title, "Senior Product Manager");
  assert.equal(parsed.company, "Zamp");
});

test("empty or invalid URLs fail honestly and do not invent a job", () => {
  assert.throws(() => parseJobUrl(""), /Paste a job URL first/);
  assert.throws(() => parseJobUrl("   "), /Paste a job URL first/);
  assert.throws(() => parseJobUrl("not a url"), /not a valid job URL/);
  assert.throws(() => parseJobUrl("https://www.linkedin.com/jobs/search/?keywords=AI"), /not a job posting/);
  assert.throws(() => jobFromPaste({ url: "" }), /Paste a job URL first/);
  assert.throws(() => jobFromPaste({ url: "   " }), /Paste a job URL first/);
});

test("create-from-paste builds a board row without fetching", () => {
  const urlOnly = jobFromPaste({ url: "https://www.linkedin.com/jobs/view/123" });
  assert.equal(urlOnly.linkedInJobId, "123");
  assert.equal(urlOnly.title, "LinkedIn job 123");
  assert.equal(urlOnly.company, "Unknown company");
  assert.equal(urlOnly.url, "https://www.linkedin.com/jobs/view/123");
  assert.equal(urlOnly.source, "Pasted URL");
  assert.equal(urlOnly.description, "");
  assert.doesNotMatch(urlOnly.source, /imported from linkedin/i);

  const withText = jobFromPaste({
    url: "https://careers.example.com/jobs/pm-ai",
    title: "Senior Product Manager, AI",
    description: "Lead agentic products in Bengaluru. RAG and evals.",
  });
  assert.equal(withText.title, "Senior Product Manager, AI");
  assert.equal(withText.company, "Unknown company");
  assert.equal(withText.description, "Lead agentic products in Bengaluru. RAG and evals.");
  assert.match(withText.nextAction, /pasted posting/);
});

test("same LinkedIn job id fingerprints as one role across tracking URLs", () => {
  const a = jobFingerprint("", "", "https://www.linkedin.com/jobs/view/4291847391/?eBP=foo");
  const b = jobFingerprint("Other", "Co", "https://linkedin.com/jobs/view/senior-pm-at-zamp-4291847391");
  assert.equal(a, "linkedin:4291847391");
  assert.equal(a, b);
});

test("pasted description is enough for résumé match when title is unknown", () => {
  const profile = {
    targetRoles: ["Senior Product Manager"],
    industries: ["AI"],
    locations: ["Bengaluru"],
    workModes: ["Hybrid"],
    strengths: ["agentic products"],
    exclusions: [],
    resumeText: "Senior Product Manager at athenahealth leading data and AI platform work across agentic workflows and RAG in Bengaluru.",
  };
  const untitled = matchResumeToJob(profile, { title: "LinkedIn job 123", company: "Unknown company", location: "Unspecified" });
  const withPaste = matchResumeToJob(profile, {
    title: "LinkedIn job 123",
    company: "Unknown company",
    location: "Unspecified",
    description: "Senior Product Manager, AI. Agentic products and RAG in Bengaluru.",
  });
  assert.ok(withPaste.fitScore > untitled.fitScore, `expected pasted JD to raise fit, ${untitled.fitScore} -> ${withPaste.fitScore}`);
  assert.ok(withPaste.evidence.some(item => /agentic|rag|bengaluru|product/i.test(item)));
});

test("paste path never fetches LinkedIn and copy stays a handoff", async () => {
  const [parser, jobs, route, page] = await Promise.all([
    readFile(new URL("../lib/operator/job-url.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/jobs.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/career/jobs/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(parser, /fetch\s*\(/);
  assert.doesNotMatch(parser, /linkedin\.com\/jobs/);
  assert.match(jobs, /jobFromPaste/);
  assert.doesNotMatch(jobs, /linkedin\.com/);
  assert.match(route, /description/);
  assert.match(page, /Paste the job link \(and optional description\)\. We save it here\. We do not open LinkedIn\./);
  assert.doesNotMatch(page, /imported from LinkedIn/i);
  const intake = page.slice(page.indexOf("function JobIntake"), page.indexOf("function LinkedInHandoff"));
  assert.match(intake, /\/api\/career\/jobs/);
  assert.match(intake, /job\.description/);
});
