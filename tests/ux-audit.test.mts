import assert from "node:assert/strict";
import test from "node:test";
import { calendarControlsStartOpen, calendarReadStatus, visibleTimelineBlocks } from "../lib/operator/calendar.ts";
import { isParkedCareerEmail, rankCareerEmails } from "../lib/operator/career-email.ts";
import { splitFocusPrograms } from "../lib/operator/focus-nav.ts";
import { isHomepageDump, queuedLearningMinutes, weekLearningQueue } from "../lib/operator/learning-taste.ts";
import { careerThesisSeed, nextThesisGap, normalizeThesisFields, operatorThesisSeed } from "../lib/operator/startup-thesis.ts";

const programs = [
  { name: "Career" as const, mark: "C" },
  { name: "Learning" as const, mark: "L" },
  { name: "Startup Lab" as const, mark: "S" },
  { name: "Content" as const, mark: "W" },
];

test("Focus keeps Today-priority programs and the open program as doors", () => {
  const focused = splitFocusPrograms(programs, "Today", ["Career", "Learning"]);
  assert.deepEqual(focused.primary.map(item => item.name), ["Career", "Learning"]);
  assert.deepEqual(focused.secondary.map(item => item.name), ["Startup Lab", "Content"]);
  const inLab = splitFocusPrograms(programs, "Startup Lab", ["Career"]);
  assert.ok(inLab.primary.some(item => item.name === "Startup Lab"));
  assert.ok(inLab.primary.some(item => item.name === "Career"));
  const stranded = splitFocusPrograms(programs, "Today", []);
  assert.equal(stranded.primary.length, 0);
  assert.deepEqual(stranded.secondary.map(item => item.name), ["Career", "Learning", "Startup Lab", "Content"]);
});

test("calendar status is one honest story and hides dismissed ghosts", () => {
  const live = calendarReadStatus({ icsConfigured: true, connectorStatus: "connected", googleEventCount: 18, todayBlockCount: 3 });
  assert.equal(live.kind, "live");
  assert.equal(live.label, "Google read is live");
  const stale = calendarReadStatus({ icsConfigured: false, connectorStatus: "connected", googleEventCount: 18, todayBlockCount: 6 });
  assert.equal(stale.kind, "stale");
  assert.equal(stale.label, "Reconnect feed");
  const offline = calendarReadStatus({ icsConfigured: false, connectorStatus: "not_connected", googleEventCount: 0, todayBlockCount: 0 });
  assert.equal(offline.kind, "offline");
  assert.equal(offline.label, "Not connected");
  assert.equal(calendarControlsStartOpen(false, true), false);
  assert.equal(calendarControlsStartOpen(false, false), false);
  assert.equal(calendarControlsStartOpen(false, false, "offline"), false);
  assert.equal(calendarControlsStartOpen(false, false, "stale"), true);
  assert.equal(calendarControlsStartOpen(true, false), false);
  const timeline = visibleTimelineBlocks([
    { id: "ghost-1", title: "Convert to interviews", start_at: "2026-09-01T04:30:00+05:30", state: "dismissed", source: "local" },
    { id: "ghost-2", title: "Convert to interviews", start_at: "2026-09-01T04:30:00+05:30", state: "dismissed", source: "local" },
    { id: "live-op", title: "Convert to interviews", start_at: "2026-09-01T04:30:00+05:30", state: "scheduled", source: "local" },
    { id: "gym", title: "Gym", start_at: "2026-09-01T06:30:00+05:30", state: "synced", source: "google_calendar" },
  ]);
  assert.deepEqual(timeline.map(item => item.id), ["live-op", "gym"]);
  const overlapping = visibleTimelineBlocks([
    { id: "gym", title: "Gym", start_at: "2026-09-01T10:00:00+05:30", end_at: "2026-09-01T11:00:00+05:30", state: "synced", source: "google_calendar" },
    { id: "staff", title: "Staff meeting", start_at: "2026-09-01T10:00:00+05:30", end_at: "2026-09-01T10:45:00+05:30", state: "synced", source: "google_calendar" },
    { id: "focus", title: "Convert to interviews", start_at: "2026-09-01T10:00:00+05:30", end_at: "2026-09-01T10:45:00+05:30", state: "scheduled", source: "local" },
  ]);
  assert.deepEqual(overlapping.map(item => item.id), ["gym", "staff", "focus"]);
});

test("Startup Lab next action is the first empty or unclear field", () => {
  const operator = operatorThesisSeed();
  const allUnclear = nextThesisGap(operator, {});
  assert.equal(allUnclear?.key, "idea");
  assert.equal(allUnclear?.status, "unclear");
  const career = normalizeThesisFields(careerThesisSeed());
  const empty = nextThesisGap(career, {
    idea: { status: "clear", note: "" },
    problem: { status: "clear", note: "" },
    targetUser: { status: "clear", note: "" },
    experiment: { status: "clear", note: "" },
  });
  assert.equal(empty?.key, "scale");
  assert.equal(empty?.status, "empty");
  const done = nextThesisGap(operator, Object.fromEntries(Object.keys(operator).map(key => [key, { status: "clear", note: "" }])));
  assert.equal(done, null);
});

test("This week is a short ranked queue without homepage or search URLs", () => {
  const queue = weekLearningQueue([
    { id: "skip", title: "Skip me", status: "recommended", feedback: "skip", url: "https://example.com/a", duration_minutes: 12 },
    { id: "home", title: "Simon Willison’s Weblog", status: "recommended", url: "https://simonwillison.net/", duration_minutes: 10 },
    { id: "search", title: "arXiv search", status: "recommended", url: "https://arxiv.org/search/?query=memory+architecture+agents&searchtype=all", duration_minutes: 28 },
    { id: "done", title: "Finished", status: "completed", url: "https://example.com/done", duration_minutes: 12 },
    { id: "story", title: "Tell the AI Product Operator story", status: "recommended", url: "", duration_minutes: 35 },
    { id: "evals", title: "Evaluating tool-using agents", status: "recommended", url: "https://example.com/evals", duration_minutes: 16 },
    { id: "saved", title: "Saved later", status: "saved", url: "https://example.com/saved", duration_minutes: 12 },
    { id: "extra-1", title: "Extra 1", status: "recommended", url: "https://example.com/1", duration_minutes: 12 },
    { id: "extra-2", title: "Extra 2", status: "recommended", url: "https://example.com/2", duration_minutes: 12 },
    { id: "extra-3", title: "Extra 3", status: "recommended", url: "https://example.com/3", duration_minutes: 12 },
    { id: "extra-4", title: "Extra 4", status: "recommended", url: "https://example.com/4", duration_minutes: 12 },
  ], 5);
  assert.equal(queue.length, 5);
  assert.deepEqual(queue.map(item => String(item.id)), ["evals", "extra-1", "extra-2", "extra-3", "extra-4"]);
  assert.equal(queuedLearningMinutes(queue), 64);
  assert.equal(isHomepageDump({ title: "LangSmith", url: "https://www.langchain.com/", excerpt: "" }), true);
});

test("next Gmail action prefers a high-fit draft over a wait receipt", () => {
  const jobs = [{ company: "Zamp", title: "Senior Product Manager, AI", fit_score: 81, status: "recommended" }];
  const ranked = rankCareerEmails([
    { id: "tf", subject: "Taylor & Francis application", sender: "noreply@tandfonline.com", next_action: "Track this application and wait.", received_at: "2026-09-01T08:00:00Z" },
    { id: "zamp", subject: "Zamp — application draft", sender: "you@gmail.com", next_action: "Review the draft and decide whether to send it yourself", received_at: "2026-08-28T08:00:00Z" },
  ], jobs);
  assert.equal(ranked[0]?.id, "zamp");
  assert.equal(isParkedCareerEmail(ranked[1]!), true);
});
