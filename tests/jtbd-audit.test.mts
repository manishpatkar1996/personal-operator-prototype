import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DEFAULT_PROMPTS } from "../lib/operator/agents.ts";
import { calendarControlsStartOpen, calendarReadStatus, sampleBlocksForToday } from "../lib/operator/calendar.ts";
import { DEFAULT_CONTENT_VOICE, isAuthorDefaultVoice, voiceBannerLine } from "../lib/operator/content-craft.ts";
import { EXAMPLE_GOALS_JSON, EXAMPLE_GOALS_PACK_NOTE } from "../lib/operator/goals-json.ts";
import { contentGenerateCopy, modelGuideCopy, sidebarModelCopy } from "../lib/operator/model-status.ts";
import { isSampleJob, SAMPLE_JOB_SOURCE } from "../lib/operator/operator-setup.ts";

test("defaults are a stranger pack, not a named person", () => {
  assert.equal(isAuthorDefaultVoice(DEFAULT_CONTENT_VOICE), false);
  assert.doesNotMatch(DEFAULT_CONTENT_VOICE.name, /Manish/i);
  assert.doesNotMatch(DEFAULT_CONTENT_VOICE.role, /athenahealth/i);
  assert.match(voiceBannerLine({ name: "Manish Patkar", role: "Senior PM, athenahealth" }), /Voice not set/);
  assert.match(voiceBannerLine(DEFAULT_CONTENT_VOICE), /Your voice|Voice not set|set a name/i);
  for (const prompt of DEFAULT_PROMPTS.filter(item => item.roleId === "samwell")) {
    assert.doesNotMatch(prompt.systemPrompt, /Manish Patkar|athenahealth/);
  }
  assert.match(EXAMPLE_GOALS_PACK_NOTE, /Sample shape/i);
  assert.match(EXAMPLE_GOALS_JSON, /Land a high-agency AI Product role/);
});

test("local_plan is not shown as a missing OpenAI key", () => {
  assert.equal(modelGuideCopy({ status: "disabled", reason: "local_plan", keyReady: true, provider: "deepseek" }), null);
  const ready = sidebarModelCopy({ status: "disabled", reason: "local_plan", keyReady: true, provider: "deepseek" }, [{ id: "llm", status: "connected", detail: "DeepSeek is the live model." }]);
  assert.match(ready.title, /Local plan · DeepSeek ready/);
  const missing = sidebarModelCopy({ status: "disabled", reason: "local_plan", keyReady: false }, [{ id: "llm", status: "not_connected" }]);
  assert.equal(missing.title, "No model key · still works");
  const guide = modelGuideCopy({ status: "disabled", reason: "No configured model adapter is available." });
  assert.equal(guide?.title, "No model key · still works");
  assert.equal(guide?.retry, false);
  assert.doesNotMatch(guide?.fix ?? "", /OPENAI_API_KEY to \.dev\.vars for the primary/);
  assert.equal(contentGenerateCopy(true).enabled, true);
  assert.equal(contentGenerateCopy(false).enabled, false);
});

test("never-connected calendar is Not connected, sample blocks land on today", () => {
  const offline = calendarReadStatus({ icsConfigured: false, googleEventCount: 0, todayBlockCount: 0 });
  assert.equal(offline.label, "Not connected");
  assert.equal(calendarControlsStartOpen(false, false, "offline"), false);
  const sample = sampleBlocksForToday("Asia/Kolkata", new Date("2026-09-01T08:00:00+05:30"));
  assert.equal(sample.date, "2026-09-01");
  assert.match(sample.catchUp.start, /^2026-09-01T12:00:00/);
  assert.equal(isSampleJob({ id: "job-zamp", source: SAMPLE_JOB_SOURCE }), true);
  assert.equal(isSampleJob({ id: "other", source: "Greenhouse" }), false);
});

test("page, setup, and content chrome match the JTBD fixes", async () => {
  const [page, setupUi, setupScript, content, plan] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/operator-setup.tsx", import.meta.url), "utf8"),
    readFile(new URL("../scripts/setup.mjs", import.meta.url), "utf8"),
    readFile(new URL("../app/content-workspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/operator/plan/route.ts", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(page, /this Mac|Retry models|same four roles/);
  assert.match(page, /Local only/);
  assert.match(page, /Refresh with model/);
  assert.match(page, /JSON\.stringify\(\{ live: true \}\)/);
  assert.match(page, /Also/);
  assert.match(page, /No mailbox on this machine/);
  assert.match(page, /Sample · not matched/);
  assert.match(setupUi, /Save context/);
  assert.match(setupUi, /Skip for now/);
  assert.doesNotMatch(setupUi, /Keep sample data for now/);
  assert.match(setupUi, /Goals → \+ Add goal/);
  assert.match(setupUi, /Connect Google Calendar/);
  assert.match(setupUi, /secret iCal/);
  assert.match(setupUi, /I'll do this later/);
  assert.match(setupUi, /connect_calendar_ics/);
  assert.doesNotMatch(setupUi, /Reconnect/);
  assert.match(setupScript, /You \(Setup\)/);
  assert.match(setupScript, /secret iCal URL/);
  assert.doesNotMatch(setupScript, /Then Career/);
  assert.doesNotMatch(content, /Manish Patkar|athenahealth/);
  assert.match(content, /generateState\.enabled/);
  assert.match(plan, /live:\s*false/);
  assert.match(plan, /keyReady/);
  assert.match(plan, /local_plan/);
});
