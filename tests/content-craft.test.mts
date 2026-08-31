import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_LINKEDIN_CRAFT,
  DEFAULT_MEDIUM_CRAFT,
  adviseOnDraft,
  appendTasteLog,
  contentStatusAfterEdit,
  contentStatusAfterGenerate,
  countHashtags,
  engagementBaitHits,
  evaluateDraftCraft,
  fallbackDraft,
  fallbackNotes,
  fallbackOutline,
  formatLabel,
  formatLinkedInCraftForPrompt,
  formatMediumCraftForPrompt,
  formatStrategyForPrompt,
  hookFitsMobileFold,
  linkedinHook,
  parseContentFormat,
  summarizeEditDiff,
} from "../lib/operator/content-craft.ts";
import { DEFAULT_PROMPTS } from "../lib/operator/agents.ts";
import { MODEL_ROUTES, OPENAI_LIVE } from "../lib/operator/models.ts";

test("LinkedIn vs Medium are distinct format contracts", () => {
  assert.equal(parseContentFormat("medium_article"), "medium_article");
  assert.equal(parseContentFormat("nope"), "linkedin_post");
  assert.equal(formatLabel("linkedin_post"), "LinkedIn posting");
  assert.equal(formatLabel("medium_article"), "Medium article");
  const linkedin = formatLinkedInCraftForPrompt(DEFAULT_LINKEDIN_CRAFT);
  const medium = formatMediumCraftForPrompt(DEFAULT_MEDIUM_CRAFT);
  assert.match(linkedin, /3,?000/);
  assert.match(linkedin, /140/);
  assert.match(linkedin, /See more/);
  assert.doesNotMatch(linkedin, /H2 every/);
  assert.match(medium, /Headline/);
  assert.match(medium, /800/);
  assert.notEqual(linkedin, medium);
});

test("LinkedIn hook fits the observed mobile fold", () => {
  const short = "Agents need goals, not a longer task list.";
  assert.equal(hookFitsMobileFold(short), true);
  assert.ok(linkedinHook(`${short}\n\nThe rest of the post.`).length <= DEFAULT_LINKEDIN_CRAFT.hookMaxChars);
  const long = "A".repeat(200);
  assert.equal(hookFitsMobileFold(long), false);
});

test("fallback LinkedIn draft follows craft; Medium is not a feed post", () => {
  const li = fallbackDraft("Goals beat task lists", fallbackOutline("Goals beat task lists", "Operator thesis", "linkedin_post"), "linkedin_post", "Goals beat task lists.");
  assert.ok(li.length <= DEFAULT_LINKEDIN_CRAFT.platformLimitChars);
  assert.equal(hookFitsMobileFold(li), true);
  assert.ok(li.includes("\n\n"));
  assert.equal(countHashtags(li) <= DEFAULT_LINKEDIN_CRAFT.hashtagsMax, true);
  assert.equal(engagementBaitHits(li), false);
  const md = fallbackDraft("Goals beat task lists", fallbackOutline("Goals beat task lists", "Operator thesis", "medium_article"), "medium_article", "Goals beat task lists.");
  assert.match(md, /^# /m);
  assert.match(md, /^## /m);
  assert.ok(md.split(/\s+/).length > 80);
  assert.notEqual(li, md);
});

test("edit diff and taste log capture what the user kept and cut", () => {
  const generated = "Agents need goals, not a longer task list.\n\nThe Operator will not publish this.";
  const edited = "Agents need goals, not a longer task list.\n\nKeep the calendar example. Drop the hashtags.";
  const diff = summarizeEditDiff(generated, edited);
  assert.ok(diff.added.some(item => /calendar example/i.test(item)));
  assert.ok(diff.removed.some(item => /will not publish/i.test(item)));
  const log = appendTasteLog([], { at: "2026-09-01", ideaId: "c1", title: "Goals", format: "linkedin_post", added: diff.added, removed: diff.removed });
  assert.equal(log.length, 1);
  assert.equal(appendTasteLog([], { at: "2026-09-01", ideaId: "c1", title: "Goals" }).length, 0);
  assert.equal(contentStatusAfterEdit(generated, edited), "edited");
  assert.equal(contentStatusAfterEdit(generated, generated), "drafted");
  assert.equal(contentStatusAfterGenerate("notes", "idea"), "idea");
  assert.equal(contentStatusAfterGenerate("draft", "outlined"), "drafted");
});

test("strategy prompt injects craft, voice, and taste for Samwell", () => {
  const block = formatStrategyForPrompt({
    thesis: "Practical thinking on AI products.",
    sourceName: "Working thesis",
    voice: { name: "Manish Patkar", role: "Senior PM, athenahealth", beat: "agentic", target: "Principal PM, AI", tone: "builder", not: "LinkedIn-bro" },
    linkedinCraft: DEFAULT_LINKEDIN_CRAFT,
    mediumCraft: DEFAULT_MEDIUM_CRAFT,
    taste: [{ at: "t", ideaId: "1", title: "Goals", note: "Cut the hashtags", added: ["Keep the calendar example"] }],
  });
  assert.match(block, /Manish Patkar/);
  assert.match(block, /LinkedIn posting is first-class/);
  assert.match(block, /Medium article/);
  assert.match(block, /Cut the hashtags/);
  assert.match(block, /Never post/);
  assert.match(fallbackNotes("Goals", "Thesis", "linkedin_post"), /LinkedIn posting/);
});

test("deterministic desk advice flags bait and long hooks", () => {
  const advice = adviseOnDraft("I'm excited to announce a new chapter.\nComment YES if you agree. #a #b #c #d #e", "linkedin_post", "tighten this");
  assert.match(advice, /engagement bait|Hook|hashtags/i);
  assert.match(advice, /will not post/i);
});

test("LinkedIn craft checklist is idle until there is a draft, then pass/fail against the text", () => {
  const idle = evaluateDraftCraft("", "linkedin_post");
  assert.equal(idle.length, 3);
  assert.equal(idle[0].label, "First lines before See more");
  assert.equal(idle[1].label, "One point");
  assert.equal(idle[2].label, "A real example");
  assert.ok(idle.every(item => item.pass === null));
  const good = fallbackDraft("Goals beat task lists", fallbackOutline("Goals beat task lists", "Operator thesis", "linkedin_post"), "linkedin_post", "Goals beat task lists.");
  const live = evaluateDraftCraft(good, "linkedin_post");
  assert.equal(live[0].pass, true);
  assert.equal(live[1].pass, true);
  assert.equal(live[2].pass, true);
  const bait = evaluateDraftCraft("I'm excited to announce a new chapter.\nComment YES if you agree.", "linkedin_post");
  assert.equal(bait[2].pass, false);
  const jargon = evaluateDraftCraft("A".repeat(200), "linkedin_post");
  assert.equal(jargon[0].pass, false);
});

test("Samwell tasks are routed and OpenAI stays paused", () => {
  assert.equal(OPENAI_LIVE, false);
  for (const task of ["content_notes", "content_outline", "content_draft", "content_chat"] as const) {
    assert.ok(MODEL_ROUTES[task]);
    assert.ok(DEFAULT_PROMPTS.some(item => item.id === task && item.roleId === "samwell"));
  }
});
