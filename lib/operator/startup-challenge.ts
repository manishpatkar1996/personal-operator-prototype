import {
  THESIS_FIELDS,
  emptyThesisFields,
  filledThesisCount,
  nextThesisGap,
  thesisCompleteness,
  type ThesisClarity,
  type ThesisFields,
} from "./startup-thesis.ts";

export type StartupWorld = {
  peopleTalked: number;
  lastAsked: string;
  wouldChangeMind: string;
};

/** Alias used by persist layer. */
export type WorldTest = StartupWorld;

export type LabStageId = "frame" | "fill" | "talk" | "challenge" | "onepager";

export const LAB_STAGES: Array<{ id: LabStageId; label: string; hint: string }> = [
  { id: "frame", label: "Name it", hint: "One sentence a stranger could rebuild." },
  { id: "fill", label: "Fill", hint: "Matter-of-fact canvas, like a YC application." },
  { id: "talk", label: "Talk", hint: "Leave the laptop. Ask the user you named." },
  { id: "challenge", label: "Stress-test", hint: "Why it might work, and why it might not." },
  { id: "onepager", label: "One-pager", hint: "Copy Markdown when every field is judged clear." },
];

export type ThesisChallenge = {
  stage: LabStageId;
  completed: Record<LabStageId, boolean>;
  unclear: Array<{ key: string; label: string; note: string }>;
  whyItWorks: string[];
  whyItDoesnt: string[];
  next: string[];
  talkPrompt: string;
  steelman: string[];
  objections: string[];
  researchNext: string[];
  source: "deterministic" | "mini" | "fallback";
};

const slice = (value: string, max = 160) => {
  const text = value.trim().replace(/\s+/g, " ");
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
};

function asLines(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback;
  const lines = value.map(item => String(item).trim()).filter(Boolean).slice(0, 6);
  return lines.length ? lines : fallback;
}

export function emptyStartupWorld(): StartupWorld {
  return { peopleTalked: 0, lastAsked: "", wouldChangeMind: "" };
}

export const emptyWorldTest = emptyStartupWorld;

export function normalizeStartupWorld(input: Partial<StartupWorld> & Record<string, unknown> = {}): StartupWorld {
  const people = Number(input.peopleTalked ?? input.people_talked ?? input.conversations);
  return {
    peopleTalked: Number.isFinite(people) ? Math.max(0, Math.min(999, Math.round(people))) : 0,
    lastAsked: typeof input.lastAsked === "string"
      ? input.lastAsked.trim().slice(0, 2_000)
      : typeof input.last_asked === "string" ? input.last_asked.trim().slice(0, 2_000) : "",
    wouldChangeMind: typeof input.wouldChangeMind === "string"
      ? input.wouldChangeMind.trim().slice(0, 2_000)
      : typeof input.wouldChangeIf === "string"
        ? input.wouldChangeIf.trim().slice(0, 2_000)
        : typeof input.would_change_mind === "string" ? input.would_change_mind.trim().slice(0, 2_000) : "",
  };
}

export function parseStartupWorld(value: unknown): StartupWorld {
  let parsed: unknown = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return emptyStartupWorld();
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return emptyStartupWorld();
  return normalizeStartupWorld(parsed as Record<string, unknown>);
}

export const parseWorldTest = parseStartupWorld;

export function labJourney(
  fields: ThesisFields,
  clarity: ThesisClarity = {},
  world: StartupWorld = emptyStartupWorld(),
  noteCount = 0,
): { stage: LabStageId; completed: Record<LabStageId, boolean> } {
  const completeness = thesisCompleteness(fields, clarity);
  const ideaReady = fields.idea.trim().length >= 24;
  const talked = world.peopleTalked > 0 || noteCount > 0;
  const checked = Object.values(clarity).some(item => item?.status === "clear" || item?.status === "unclear");
  const completed: Record<LabStageId, boolean> = {
    frame: ideaReady,
    fill: completeness.filled === completeness.total,
    talk: talked,
    challenge: checked,
    onepager: completeness.complete,
  };
  let stage: LabStageId = "frame";
  if (!completed.frame) stage = "frame";
  else if (!completed.fill) stage = "fill";
  else if (!completed.talk) stage = "talk";
  else if (!completed.onepager) stage = "challenge";
  else stage = "onepager";
  return { stage, completed };
}

export function buildThesisChallenge(
  fields: ThesisFields,
  clarity: ThesisClarity = {},
  world: StartupWorld = emptyStartupWorld(),
  noteCount = 0,
): ThesisChallenge {
  const { stage, completed } = labJourney(fields, clarity, world, noteCount);
  const completeness = thesisCompleteness(fields, clarity);
  const gap = nextThesisGap(fields, clarity);
  const nextField = gap ? THESIS_FIELDS.find(field => field.key === gap.key) : undefined;
  const unclear = THESIS_FIELDS.flatMap(field => {
    const status = completeness.statuses[field.key];
    if (status === "empty") return [{ key: field.key, label: field.label, note: `${field.label} is empty.` }];
    if (status === "unclear") {
      const note = clarity[field.key]?.note?.trim() || "Filled, but not judged clear yet. Save & check is the gate.";
      return [{ key: field.key, label: field.label, note }];
    }
    return [];
  });

  const whyItWorks: string[] = [];
  if (world.peopleTalked > 0) {
    whyItWorks.push(`You have talked to ${world.peopleTalked} ${world.peopleTalked === 1 ? "person" : "people"}. Desk ideas die; this is leaving the building.`);
  }
  if (fields.idea.trim()) whyItWorks.push(`Product sentence: ${slice(fields.idea)}`);
  if (fields.problem.trim() && fields.targetUser.trim()) {
    whyItWorks.push("A named user with a weekly pain — that is the right shape, not a mild problem for millions.");
  }
  if (fields.whyNow.trim()) whyItWorks.push(`Timing claim: ${slice(fields.whyNow)}`);
  if (fields.unfairAdvantage.trim()) whyItWorks.push(`Claimed insight: ${slice(fields.unfairAdvantage)}`);
  if (fields.competition.trim() && !/no competitors|no competition/i.test(fields.competition)) {
    whyItWorks.push("You named substitutes instead of pretending the market is empty.");
  }
  if (world.wouldChangeMind.trim()) whyItWorks.push(`You already wrote what would kill it: ${slice(world.wouldChangeMind)}`);
  if (!whyItWorks.length) {
    whyItWorks.push("Nothing to steelman yet. Write the idea in one sentence a stranger could rebuild.");
  }

  const whyItDoesnt: string[] = [];
  if (world.peopleTalked === 0 && filledThesisCount(fields) >= 2) {
    whyItDoesnt.push("This is still a laptop thesis. Ideas get clearer by talking to the user you named, not by polishing the canvas.");
  }
  for (const item of unclear.slice(0, 4)) whyItDoesnt.push(`${item.label}: ${item.note}`);
  if (fields.competition.trim() && /no competitors|no competition|we have no (real )?competitors/i.test(fields.competition)) {
    whyItDoesnt.push("“No competitors” usually means no research. Name the spreadsheet, the chat, the coworker, or doing nothing.");
  }
  if (fields.unfairAdvantage.trim() && /execute better|work harder|move faster/i.test(fields.unfairAdvantage)) {
    whyItDoesnt.push("Hustle is not an insight. What do you know from being the user that a well-funded team would still miss?");
  }
  if (!fields.riskiestAssumption.trim()) {
    whyItDoesnt.push("If you cannot name the belief that kills the idea, you are still wishing.");
  }
  if (whyItDoesnt.length === 0) {
    whyItDoesnt.push("No obvious holes in the text. The remaining risk is in the world — talk to people, then come back.");
  }

  const next: string[] = [];
  if (nextField) {
    next.push(`Next on the canvas: ${nextField.label}. ${nextField.whyItMatters}`);
  }
  if (world.peopleTalked === 0) {
    next.push("This week: talk to three people in the target set. Ask what they did the last time the problem showed up.");
  } else if (world.peopleTalked < 5) {
    next.push("Keep going. A handful of conversations beats another hour on the canvas.");
  }
  if (fields.experiment.trim()) next.push(`The test you wrote: ${slice(fields.experiment, 200)}`);
  if (completeness.complete) next.push("Every field is judged clear. Copy the one-pager, or save a Memory note. Notion stays a paste.");

  const talkPrompt = nextField
    ? `Ask about ${nextField.label.toLowerCase()}. ${nextField.goodLooksLike}`
    : "Ask the person you named: walk me through the last time this went wrong.";

  const whyItWorksOut = whyItWorks.slice(0, 5);
  const whyItDoesntOut = whyItDoesnt.slice(0, 6);
  const nextOut = next.slice(0, 4);
  return {
    stage,
    completed,
    unclear,
    whyItWorks: whyItWorksOut,
    whyItDoesnt: whyItDoesntOut,
    next: nextOut,
    talkPrompt,
    steelman: whyItWorksOut,
    objections: whyItDoesntOut,
    researchNext: nextOut,
    source: "deterministic",
  };
}

export function deterministicChallenge(
  input: ThesisFields | { fields: ThesisFields; clarity?: ThesisClarity; worldTest?: WorldTest; world?: StartupWorld; noteCount?: number },
  clarity?: ThesisClarity,
  world?: StartupWorld,
  noteCount = 0,
): ThesisChallenge {
  if (input && typeof input === "object" && "fields" in input) {
    return buildThesisChallenge(
      input.fields,
      input.clarity,
      input.worldTest ?? input.world,
      input.noteCount ?? 0,
    );
  }
  return buildThesisChallenge(input, clarity, world, noteCount);
}

export function emptyChallenge(): ThesisChallenge {
  return buildThesisChallenge(emptyThesisFields());
}

function asStoredChallenge(value: unknown, fallback: ThesisChallenge): ThesisChallenge {
  if (value && typeof value === "object" && !Array.isArray(value) && "stage" in value && "whyItWorks" in value) {
    return value as ThesisChallenge;
  }
  return fallback;
}

export function parseThesisChallenge(value: unknown, fallback?: ThesisChallenge): ThesisChallenge {
  const base = fallback ?? emptyChallenge();
  let parsed: unknown = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return base;
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return base;
  return applyChallengePayload(base, parsed);
}

export function applyChallengePayload(previous: unknown, incoming?: unknown): ThesisChallenge {
  const fallback = incoming === undefined ? emptyChallenge() : asStoredChallenge(previous, emptyChallenge());
  const payload = incoming === undefined ? previous : incoming;
  const source = payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {};
  const whyItWorks = asLines(source.steelman ?? source.whyItWorks, fallback.whyItWorks);
  const whyItDoesnt = asLines(source.objections ?? source.whyItDoesnt, fallback.whyItDoesnt);
  const next = asLines(source.researchNext ?? source.next, fallback.next);
  const marked = source.source;
  return {
    ...fallback,
    whyItWorks,
    whyItDoesnt,
    next,
    steelman: whyItWorks,
    objections: whyItDoesnt,
    researchNext: next,
    talkPrompt: typeof source.talkPrompt === "string" && source.talkPrompt.trim()
      ? source.talkPrompt.trim()
      : fallback.talkPrompt,
    source: marked === "mini" || marked === "fallback" || marked === "deterministic" ? marked : fallback.source,
  };
}

export function thesisOnePagerMarkdown(
  title: string,
  fields: ThesisFields,
  world: StartupWorld = emptyStartupWorld(),
) {
  const heading = title.trim() || fields.idea.trim() || "Untitled idea";
  const worldLines = [
    world.peopleTalked ? `- People talked to: ${world.peopleTalked}` : "- People talked to: 0 (still a desk thesis)",
    world.lastAsked.trim() ? `- Last asked: ${world.lastAsked.trim()}` : "",
    world.wouldChangeMind.trim() ? `- Would change my mind: ${world.wouldChangeMind.trim()}` : "",
  ].filter(Boolean);
  const fieldBlocks = THESIS_FIELDS.map(field => {
    const value = fields[field.key].trim() || "_(empty)_";
    return `## ${field.label}\n\n${value}`;
  });
  return [`# ${heading}`, "", ...fieldBlocks, "", "## In the world", "", ...worldLines].join("\n");
}

export function composeOnePagerMarkdown(
  input: string | { title: string; fields: ThesisFields; worldTest?: WorldTest; world?: StartupWorld },
  fields?: ThesisFields,
  world?: StartupWorld,
) {
  if (typeof input === "object") {
    return thesisOnePagerMarkdown(input.title, input.fields, input.worldTest ?? input.world);
  }
  return thesisOnePagerMarkdown(input, fields ?? emptyThesisFields(), world);
}
