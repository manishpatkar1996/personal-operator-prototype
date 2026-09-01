import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  applyChallengePayload,
  buildThesisChallenge,
  composeOnePagerMarkdown,
  deterministicChallenge,
  labJourney,
  parseStartupWorld,
  parseThesisChallenge,
} from "../lib/operator/startup-challenge.ts";
import {
  THESIS_FIELD_KEYS,
  YC_FRAME,
  applyThesisValidation,
  clarityAfterEdits,
  emptyThesisFields,
  heuristicFieldJudgement,
  heuristicThesisClarity,
  isStartupThesisComplete,
  operatorThesisSeed,
  type ThesisClarity,
} from "../lib/operator/startup-thesis.ts";
import { startupRunsChallenge, startupRunsValidate } from "../lib/operator/token-policy.ts";

test("YC field guidance is paraphrased, not an essay dump", () => {
  assert.match(YC_FRAME.lede, /will not invent a company/i);
  assert.ok(YC_FRAME.points.some(point => /wedge|beachhead/i.test(point)));
  assert.ok(YC_FRAME.points.some(point => /insight|execute/i.test(point)));
});

test("startup thesis completeness requires filled fields and clear validation", () => {
  const operator = operatorThesisSeed();
  const empty = emptyThesisFields();
  assert.equal(isStartupThesisComplete(empty), false);
  assert.equal(isStartupThesisComplete(operator), false, "filled but unvalidated fields are not complete");
  assert.equal(heuristicThesisClarity(operator).idea?.status, "unclear");

  const vague = heuristicFieldJudgement("idea", "We will revolutionize productivity with an AI-powered platform");
  assert.equal(vague.status, "unclear");
  const noCompetitors = heuristicFieldJudgement("competition", "We have no competitors");
  assert.equal(noCompetitors.status, "unclear");
  const demographic = heuristicFieldJudgement("targetUser", "Everyone");
  assert.equal(demographic.status, "unclear");
  const aiHot = heuristicFieldJudgement("whyNow", "AI is hot so the timing is perfect for this");
  assert.equal(aiHot.status, "unclear");
  const hustle = heuristicFieldJudgement("unfairAdvantage", "We'll execute better and work harder than anyone");
  assert.equal(hustle.status, "unclear");
  const mvp = heuristicFieldJudgement("experiment", "Build an MVP and see if it grows");
  assert.equal(mvp.status, "unclear");

  const judged = applyThesisValidation(operator, { fields: { idea: { status: "clear", note: "" }, problem: { status: "unclear", note: "Could describe any app." } } });
  assert.equal(judged.idea?.status, "clear");
  assert.equal(judged.problem?.status, "unclear");
  assert.equal(judged.experiment?.status, "unclear");

  const allClear = Object.fromEntries(THESIS_FIELD_KEYS.map(key => [key, { status: "clear", note: "" }])) as ThesisClarity;
  assert.equal(isStartupThesisComplete(operator, allClear), true);

  const edited = clarityAfterEdits(operator, { ...operator, problem: "A sharper problem for PMs who lose the week to tool-switching." }, allClear);
  assert.equal(edited.problem, undefined);
  assert.equal(isStartupThesisComplete({ ...operator, problem: "A sharper problem for PMs who lose the week to tool-switching." }, edited), false);
});

test("deterministic challenge JSON has steelman, objections, and next research", () => {
  const operator = operatorThesisSeed();
  const world = parseStartupWorld({ conversations: 0, wouldChangeIf: "" });
  assert.equal(world.peopleTalked, 0);
  const challenge = deterministicChallenge({ fields: operator, worldTest: world });
  assert.equal(challenge.source, "deterministic");
  assert.ok(Array.isArray(challenge.unclear));
  assert.ok(challenge.unclear.length >= 1);
  assert.ok(challenge.unclear.every(item => item.key && item.label && item.note));
  assert.ok(challenge.whyItWorks.length >= 1);
  assert.ok(challenge.whyItDoesnt.length >= 1);
  assert.ok(challenge.next.length >= 1);
  assert.deepEqual(challenge.steelman, challenge.whyItWorks);
  assert.deepEqual(challenge.objections, challenge.whyItDoesnt);
  assert.match(challenge.whyItDoesnt.join(" "), /laptop thesis|assumption|talk/i);

  const heard = buildThesisChallenge(operator, {}, parseStartupWorld({ peopleTalked: 4, wouldChangeMind: "If nobody will take a call." }), 2);
  assert.match(heard.whyItWorks.join(" "), /talked to 4/i);
  const journey = labJourney(operator, {}, parseStartupWorld({ peopleTalked: 4 }), 2);
  assert.equal(journey.completed.talk, true);
  assert.equal(journey.completed.onepager, false);

  const live = applyChallengePayload(challenge, { source: "mini", steelman: ["A named user with weekly pain."], objections: ["No conversations yet."], researchNext: ["Talk to three PMs."] });
  assert.equal(live.source, "mini");
  assert.equal(live.whyItWorks[0], "A named user with weekly pain.");
  assert.equal(parseThesisChallenge(JSON.stringify(live)).source, "mini");
});

test("one-pager markdown lists every canvas field", () => {
  const operator = operatorThesisSeed();
  const markdown = composeOnePagerMarkdown({ title: "Personal AI Operator", fields: operator, worldTest: parseStartupWorld({ peopleTalked: 2, wouldChangeMind: "If trust is a no." }) });
  assert.match(markdown, /^# Personal AI Operator/m);
  assert.match(markdown, /## The idea/);
  assert.match(markdown, /## Next experiment/);
  assert.match(markdown, /People talked to: 2/);
  assert.match(markdown, /Would change my mind: If trust is a no/);
});

test("clarity is Save & check; live challenge is an explicit click", async () => {
  assert.equal(startupRunsValidate("save"), true);
  assert.equal(startupRunsValidate("chat"), false);
  assert.equal(startupRunsValidate("research"), false);
  assert.equal(startupRunsChallenge("challenge"), true);
  assert.equal(startupRunsChallenge("save"), false);

  const [lab, route, page] = await Promise.all([
    readFile(new URL("../app/startup-lab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/startup/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(lab, /Talk to Davos/);
  assert.doesNotMatch(lab, /chat-pane/);
  assert.doesNotMatch(lab, /body\.message/);
  assert.match(lab, /Save & check/);
  assert.match(lab, /Challenge this/);
  assert.match(lab, /Copy Markdown/);
  assert.doesNotMatch(route, /typeof body\.message/);
  assert.match(route, /body\.challenge === true/);
  assert.doesNotMatch(page, /Talk to Davos/);
});
