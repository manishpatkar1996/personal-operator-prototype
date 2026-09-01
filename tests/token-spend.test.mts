import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { assembleOperatorContext } from "../lib/operator/context.ts";
import { compactPlanContext, dailyPlanCacheKey, parseCachedDailyPlan } from "../lib/operator/plan-cache.ts";
import { composeLiveSystemPrompt } from "../lib/operator/system-prompt.ts";
import {
  collectedArticleCopy,
  collectRunsSummarize,
  contentGenerateTasks,
  dailyPlanMode,
  isLiveTaskDisabled,
  startupRunsChallenge,
  startupRunsValidate,
  userHasPreferencePayload,
} from "../lib/operator/token-policy.ts";
import { OPENAI_LIVE } from "../lib/operator/models.ts";
import { insightFallback } from "../lib/operator/learning-sources.ts";
import { heuristicThesisClarity, operatorThesisSeed } from "../lib/operator/startup-thesis.ts";
import { formatStrategyForPrompt, DEFAULT_LINKEDIN_CRAFT, DEFAULT_MEDIUM_CRAFT } from "../lib/operator/content-craft.ts";

test("Today plan is cached or deterministic unless Refresh with model", async () => {
  assert.equal(dailyPlanMode(false, false), "deterministic");
  assert.equal(dailyPlanMode(false, true), "cache");
  assert.equal(dailyPlanMode(true, true), "live");
  assert.equal(dailyPlanCacheKey("2026-09-01"), "daily_plan:2026-09-01");
  assert.equal(parseCachedDailyPlan(""), null);
  assert.ok(parseCachedDailyPlan(JSON.stringify({
    plan: { version: 1, summary: "Three moves" },
    model: { status: "used", provider: "deepseek" },
  })));

  const context = assembleOperatorContext({
    now: "2026-09-01T04:00:00Z",
    careerProfile: {
      targetRoles: ["Senior Product Manager"],
      resumeText: "SECRET_RESUME_EXCERPT should never ride along with daily_plan context.",
    },
    goals: { goals: [] },
    workspace: { calendar: [], jobs: [], learningItems: [], startupIdeas: [], contentIdeas: [], connectors: [], planningNotes: [] },
  });
  const compact = compactPlanContext(context);
  assert.doesNotMatch(compact, /SECRET_RESUME_EXCERPT/);
  assert.doesNotMatch(compact, /resumeExcerpt/);
  assert.match(compact, /Senior Product Manager/);

  const [page, route] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/operator/plan/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page, /Refresh with model/);
  assert.match(page, /JSON\.stringify\(\{ live: true \}\)/);
  const refreshFn = page.slice(page.indexOf("async function refresh("), page.indexOf("async function mutate("));
  assert.doesNotMatch(refreshFn, /loadPlan/);
  const mutateFn = page.slice(page.indexOf("async function mutate("), page.indexOf("useEffect(() => { void (async () => { await refresh(); await loadPlan(); })();"));
  assert.doesNotMatch(mutateFn, /loadPlan/);
  assert.match(route, /dailyPlanMode/);
  assert.match(route, /live:\s*false/);
  assert.equal(OPENAI_LIVE, false);
});

test("completeJson keeps the agent prompt once and skips duplicate prefs", () => {
  const stored = "You are Tyrion.\nReturn JSON that matches the supplied plan schema exactly.";
  const contract = "Return JSON that matches the supplied plan schema exactly.\nKeep summary under 280 characters.";
  const composed = composeLiveSystemPrompt(stored, contract);
  assert.equal(composed.split("Return JSON that matches the supplied plan schema exactly.").length - 1, 1);
  assert.match(composed, /You are Tyrion/);
  assert.match(composed, /Keep summary under 280/);
  assert.equal(composeLiveSystemPrompt(stored, stored), stored);

  assert.equal(userHasPreferencePayload("learning_select", JSON.stringify({ taste: { interests: ["evals"] } })), true);
  assert.equal(userHasPreferencePayload("content_draft", JSON.stringify({ idea: { format: "linkedin_post" } })), false);
  assert.equal(userHasPreferencePayload("content_draft", JSON.stringify({ strategy: { linkedinCraft: {} } })), true);
  assert.equal(userHasPreferencePayload("resume_extract", JSON.stringify({ strengths: ["RAG"], targetRoles: ["PM"] })), true);
  assert.equal(isLiveTaskDisabled("job_explain"), true);
  assert.equal(isLiveTaskDisabled("voice_parse"), true);
  assert.equal(isLiveTaskDisabled("daily_plan"), false);
});

test("learning collect does not loop learning_summarize", async () => {
  assert.equal(collectRunsSummarize(), false);
  const copy = collectedArticleCopy(
    { insight: "Why this evals post matters this week.", summary: "Two sentences.", excerpt: "Long excerpt about evals.", source: "Lilian Weng" },
    insightFallback,
  );
  assert.equal(copy.insight, "Why this evals post matters this week.");
  const empty = collectedArticleCopy(
    { insight: "Lilian Weng", excerpt: "Production evals are how tool-using agents earn trust.", source: "Lilian Weng" },
    insightFallback,
  );
  assert.notEqual(empty.insight, "Lilian Weng");

  const source = await readFile(new URL("../db/learning-collect.ts", import.meta.url), "utf8");
  const collectFn = source.slice(source.indexOf("export async function collectLearning"), source.indexOf("export async function summarizeLearningItem"));
  assert.match(collectFn, /selectArticles/);
  assert.match(collectFn, /collectRunsSummarize\(\)/);
  assert.match(collectFn, /collectedArticleCopy/);
  assert.doesNotMatch(collectFn, /completeJson\(\s*"learning_summarize"/);
});

test("startup_validate stays on Save & check, not chat or research", async () => {
  assert.equal(startupRunsValidate("save"), true);
  assert.equal(startupRunsValidate("chat"), false);
  assert.equal(startupRunsValidate("research"), false);
  assert.equal(startupRunsChallenge("challenge"), true);
  assert.equal(startupRunsChallenge("save"), false);
  const clarity = heuristicThesisClarity(operatorThesisSeed());
  assert.ok(Object.values(clarity).every(item => item.status !== "clear"));

  const [chat, research, lab] = await Promise.all([
    readFile(new URL("../db/startup-chat.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/startup.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/startup-lab.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(chat, /validate:\s*startupRunsValidate\("chat"\)/);
  const researchFn = research.slice(research.indexOf("export async function researchStartupIdea"), research.indexOf("export async function challengeStartupThesis"));
  assert.match(researchFn, /startupRunsValidate\("research"\)/);
  assert.ok(!researchFn.includes("await validateStartupThesis") || researchFn.includes('startupRunsValidate("research")'));
  assert.match(research, /startupRunsChallenge\("challenge"\)/);
  assert.doesNotMatch(lab, /Talk to Davos/);
  assert.match(lab, /\/api\/startup\/challenge/);
});

test("Generate LinkedIn/Medium is a single content_draft call", async () => {
  assert.deepEqual(contentGenerateTasks("content"), ["content_draft"]);
  assert.deepEqual(contentGenerateTasks("draft"), ["content_draft"]);
  assert.deepEqual(contentGenerateTasks("notes"), ["content_notes"]);
  assert.deepEqual(contentGenerateTasks("outline"), ["content_outline"]);

  const source = await readFile(new URL("../db/content.ts", import.meta.url), "utf8");
  const generateFn = source.slice(source.indexOf("export async function generateContent(id"));
  assert.match(generateFn, /return draftContent\(id\)/);
  assert.doesNotMatch(generateFn, /outlineContent/);

  const linkedin = formatStrategyForPrompt({
    thesis: "Practical thinking on AI products.",
    sourceName: "Working thesis",
    voice: { name: "Manish Patkar", role: "Senior PM", beat: "agentic", target: "Principal PM", tone: "builder", not: "LinkedIn-bro" },
    linkedinCraft: DEFAULT_LINKEDIN_CRAFT,
    mediumCraft: DEFAULT_MEDIUM_CRAFT,
    taste: [],
    format: "linkedin_post",
  });
  assert.match(linkedin, /LinkedIn posting/);
  assert.doesNotMatch(linkedin, /H2 every 300/);
});
