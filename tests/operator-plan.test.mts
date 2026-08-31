import assert from "node:assert/strict";
import test from "node:test";
import { conflictsWith, nextFreeSlot, parsePlanningNote } from "../lib/operator/calendar.ts";
import { buildCouncilProposals } from "../lib/operator/council.ts";
import { assembleOperatorContext } from "../lib/operator/context.ts";
import { runOperatorEvals } from "../lib/operator/evals.ts";
import { DEEPSEEK_LIVE, liveProviderOrder, MODEL_ROUTES, OPENAI_LIVE } from "../lib/operator/models.ts";
import { scoreJob } from "../lib/operator/scoring.ts";
import { composeLiveSystemPrompt } from "../lib/operator/system-prompt.ts";
import { isQuotaSalesRole, isRelevantTrackedJob } from "../lib/operator/job-relevance.ts";
import { applyThesisValidation, clarityAfterEdits, composeStartupThesis, emptyThesisFields, heuristicFieldJudgement, heuristicThesisClarity, isStartupThesisComplete, operatorThesisSeed, THESIS_FIELD_KEYS, type ThesisClarity } from "../lib/operator/startup-thesis.ts";
import { parseIcs } from "../lib/operator/ics.ts";
import { articleExcerpt, discoverFeedUrl, extractArticleLinks, parseRssOrAtom } from "../lib/operator/learning-sources.ts";
import { applyFeedback, isHomepageDump, preferencesFromResume, scoreArticle } from "../lib/operator/learning-taste.ts";
import { extractPdfText } from "../lib/operator/pdf-text.ts";
import { buildDeterministicPlan } from "../lib/operator/planner.ts";

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

test("quota sales roles stay off a product board", () => {
  assert.equal(isQuotaSalesRole("Account Executive, Enterprise"), true);
  assert.equal(isQuotaSalesRole("Senior Product Manager, AI"), false);
  assert.equal(isRelevantTrackedJob({ title: "Account Executive, AI Sales", fitScore: 44, status: "recommended", source: "Greenhouse · Stripe" }, { targetRoles: ["Senior Product Manager"] }), false);
  assert.equal(isRelevantTrackedJob({ title: "Product Lead, Agents", fitScore: 86, status: "saved", source: "Job alert email" }, { targetRoles: ["Senior Product Manager"] }), true);
});

test("live system prompt keeps the agent voice and appends the JSON contract", () => {
  const composed = composeLiveSystemPrompt(
    "You are Tyrion.\nReturn JSON only that matches the supplied plan schema.",
    'Return JSON only that matches this schema:\n{"version":1}',
  );
  assert.match(composed, /You are Tyrion/);
  assert.match(composed, /"version":1/);
  assert.equal(composeLiveSystemPrompt("same", "same"), "same");
  assert.equal(composeLiveSystemPrompt("", "contract only"), "contract only");
});

test("DeepSeek is the live model while OpenAI is paused", () => {
  assert.equal(OPENAI_LIVE, false);
  assert.equal(DEEPSEEK_LIVE, true);
  assert.deepEqual(liveProviderOrder(true, true), ["deepseek"]);
  assert.deepEqual(liveProviderOrder(false, true), ["deepseek"]);
  assert.deepEqual(liveProviderOrder(true, false), []);
  assert.deepEqual(liveProviderOrder(false, false), []);
  assert.equal(MODEL_ROUTES.startup_validate.task, "startup_validate");
});

test("priority ids stay unique when career work shares a goal", () => {
  const plan = buildDeterministicPlan(assembleOperatorContext({
    now: "2026-09-01T04:00:00Z",
    goals: { goals: [{
      id: "goal-career", title: "Land an AI product role", desiredOutcome: "Role", successCriteria: "Loops",
      targetDate: "2026-11-30", priority: 5, state: "active", progressPercentage: 20, forecast: "On track",
      milestones: [
        { id: "ms-1", goalId: "goal-career", title: "Convert to interviews", completionRule: "Five loops", targetDate: "2026-09-10", weight: 1, completionPercentage: 0, status: "active" },
        { id: "ms-2", goalId: "goal-career", title: "Build the pipeline", completionRule: "10 roles", targetDate: "2026-09-20", weight: 1, completionPercentage: 0, status: "active" },
      ],
    }] },
    workspace: {
      calendar: [],
      jobs: [{ id: "job-high", title: "Product Lead, Agents", company: "AI Infrastructure Co.", location: "Remote", fit_score: 88, status: "recommended", source: "Manual", next_action: "Review" }],
      learningItems: [],
      startupIdeas: [],
      contentIdeas: [],
      connectors: [],
      planningNotes: [],
    },
  }));
  const ids = plan.priorities.map(item => item.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("ICS parser keeps timed events in the planning window", () => {
  const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:meeting-1@google.com
DTSTART:20260901T040000Z
DTEND:20260901T050000Z
SUMMARY:Staff meeting
URL:https://calendar.google.com/event?eid=1
END:VEVENT
BEGIN:VEVENT
UID:old-1@google.com
DTSTART:20260801T040000Z
DTEND:20260801T050000Z
SUMMARY:Last month
END:VEVENT
END:VCALENDAR`;
  const events = parseIcs(ics, new Date("2026-09-01T00:00:00+05:30"), new Date("2026-09-08T00:00:00+05:30"));
  assert.equal(events.length, 1);
  assert.equal(events[0].title, "Staff meeting");
  assert.equal(events[0].startAt, "2026-09-01T09:30:00+05:30");
});

test("learning collection prefers article URLs over a homepage dump", () => {
  const html = `<html><head><title>Blog</title><link rel="alternate" type="application/rss+xml" href="/feed.xml"></head>
  <body><a href="/2026/08/31/evals-for-agents/">Evals for tool-using agents</a></body></html>`;
  assert.equal(discoverFeedUrl(html, "https://simonwillison.net/"), "https://simonwillison.net/feed.xml");
  assert.deepEqual(extractArticleLinks(html, "https://simonwillison.net/"), ["https://simonwillison.net/2026/08/31/evals-for-agents/"]);
  const rss = `<rss><channel><item><title>Evals for agents</title><link>https://simonwillison.net/2026/08/31/evals-for-agents/</link><description>One eval you can copy this week.</description></item></channel></rss>`;
  const items = parseRssOrAtom(rss, "https://simonwillison.net/");
  assert.equal(items[0].url, "https://simonwillison.net/2026/08/31/evals-for-agents/");
  assert.match(items[0].excerpt, /eval/i);
  const excerpt = articleExcerpt("<article><p>Nav</p><p>Production evals are how tool-using agents earn trust in real products.</p></article>");
  assert.match(excerpt, /Production evals/);
  assert.doesNotMatch(excerpt, /simonwillison.net\/<\/title>/);
});

test("startup thesis completeness requires filled fields and clear validation", () => {
  const operator = operatorThesisSeed();
  const composed = composeStartupThesis(operator);
  assert.match(composed, /fragmented/);
  assert.match(composed, /knowledge workers/);
  assert.match(composed, /Interview five people/);
  assert.match(composed, /The idea:/);

  const empty = emptyThesisFields();
  assert.equal(isStartupThesisComplete(empty), false);
  assert.equal(isStartupThesisComplete(operator), false, "filled but unvalidated fields are not complete");
  assert.equal(heuristicThesisClarity(operator).idea?.status, "unclear");

  const vague = heuristicFieldJudgement("idea", "We will revolutionize productivity with an AI-powered platform");
  assert.equal(vague.status, "unclear");
  const noCompetitors = heuristicFieldJudgement("competition", "We have no competitors");
  assert.equal(noCompetitors.status, "unclear");

  const judged = applyThesisValidation(operator, { fields: { idea: { status: "clear", note: "" }, problem: { status: "unclear", note: "Could describe any app." } } });
  assert.equal(judged.idea?.status, "clear");
  assert.equal(judged.problem?.status, "unclear");
  assert.equal(judged.experiment?.status, "unclear");

  const allClear = Object.fromEntries(THESIS_FIELD_KEYS.map(key => [key, { status: "clear", note: "" }])) as ThesisClarity;
  assert.equal(isStartupThesisComplete(operator, allClear), true);

  const missingExperiment = { ...allClear };
  delete missingExperiment.experiment;
  assert.equal(isStartupThesisComplete(operator, missingExperiment), false);

  const edited = clarityAfterEdits(operator, { ...operator, problem: "A sharper problem for PMs who lose the week to tool-switching." }, allClear);
  assert.equal(edited.problem, undefined);
  assert.equal(isStartupThesisComplete({ ...operator, problem: "A sharper problem for PMs who lose the week to tool-switching." }, edited), false);
});

test("PDF résumé extractor reads uncompressed text streams", async () => {
  const pdf = `%PDF-1.1
1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj
4 0 obj<< /Length 120 >>stream
BT /F1 12 Tf 10 120 Td (Senior Product Manager at athenahealth leading data and AI platform work across agentic workflows.) Tj ET
endstream
endobj
trailer<< /Root 1 0 R >>
%%EOF`;
  const text = await extractPdfText(Uint8Array.from(pdf, char => char.charCodeAt(0)));
  assert.match(text, /athenahealth/);
  assert.match(text, /agentic workflows/);
});

test("Aemon taste is derived from the résumé and updated by card feedback", () => {
  const derived = preferencesFromResume({
    targetRoles: ["Senior Product Manager", "Product Lead AI"],
    industries: ["AI", "Healthcare"],
    strengths: ["Enterprise data platforms", "Agentic workflows", "RAG and retrieval"],
    exclusions: ["Account Executive", "quota-carrying sales"],
    resumeText: "Senior Product Manager at athenahealth leading data and AI platform work across agentic workflows and RAG.",
  });
  assert.ok(derived.tracks.some(item => /agentic/i.test(item)));
  assert.ok(derived.interests.some(item => /rag/i.test(item)));
  assert.ok(derived.avoid.some(item => /account executive/i.test(item)));
  const useful = applyFeedback({ ...derived, want: [], tasteNotes: "" }, { verdict: "useful", title: "Evals for tool-using agents", source: "Lilian Weng" });
  assert.ok(useful.want.some(item => /eval/i.test(item)));
  assert.match(useful.tasteNotes, /Useful: Evals/);
  const skip = applyFeedback({ ...derived, want: useful.want, tasteNotes: useful.tasteNotes }, { verdict: "skip", title: "ChatGPT ads for consumers" });
  assert.ok(skip.avoid.some(item => /chatgpt/i.test(item) || /consumers/i.test(item)));
  const evals = { title: "Evaluating tool-using agents in production", url: "https://example.com/evals", excerpt: "How to eval tool-using agents.", source: "Blog" };
  const ads = { title: "ChatGPT ads for consumers", url: "https://example.com/ads", excerpt: "Consumer chatbot news.", source: "Blog" };
  assert.ok(scoreArticle(evals, { interests: derived.interests, want: useful.want, avoid: skip.avoid }) > scoreArticle(ads, { interests: derived.interests, want: useful.want, avoid: skip.avoid }));
  assert.equal(isHomepageDump({ title: "Simon Willison’s Weblog", url: "https://simonwillison.net/", excerpt: "Sponsored by Greptile" }), true);
  assert.equal(isHomepageDump({ title: "[AINews] OpenAI shuts off Cursor", url: "https://www.latent.space/p/ainews-openai-shuts-off-cursor", excerpt: "Roundup" }), true);
});
