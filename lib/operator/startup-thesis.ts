/** Startup Lab thesis canvas.
 * Field set is grounded in YC/PG/Seibel — not an MBA pitch deck:
 * - Idea: PG, How to Apply — matter-of-fact “what will you make?”
 * - Problem / users: PG, How to Get Startup Ideas — urgent for a few, not mild for millions
 * - Scale: PG, Billionaires Build — larval beachhead with a path to a huge market
 * - Market: bottom-up count, not TAM theatre (Dalton: don’t kill ideas on TAM; still be honest)
 * - Competition: YC application — name substitutes; “none” usually means no research
 * - Why now / unfair advantage: YC application + PG insight (not “we’ll execute better”)
 * - Riskiest assumption / next experiment: Seibel — hold the problem, test the hypothesis
 */

export const THESIS_FIELD_KEYS = [
  "idea",
  "problem",
  "targetUser",
  "scale",
  "market",
  "competition",
  "whyNow",
  "unfairAdvantage",
  "riskiestAssumption",
  "experiment",
] as const;

export type ThesisFieldKey = (typeof THESIS_FIELD_KEYS)[number];
export type FieldClarity = "empty" | "unclear" | "clear";
export type FieldValidation = { status: Exclude<FieldClarity, "empty">; note: string };
export type ThesisFields = Record<ThesisFieldKey, string>;
export type ThesisClarity = Partial<Record<ThesisFieldKey, FieldValidation>>;

export type ThesisFieldSpec = {
  key: ThesisFieldKey;
  column: string;
  label: string;
  helper: string;
  placeholder: string;
  example: string;
  whyItMatters: string;
  goodLooksLike: string;
  weakLooksLike: string;
};

export const YC_FRAME = {
  title: "What “clear” means here",
  lede: "Public YC advice is blunt: make something people want. Davos helps you write that down and say when it is not yet clear. It will not invent a company for you.",
  points: [
    "A partner should be able to act on each sentence: who the user is, what hurts this week, what they do today, why you, why this year.",
    "A wedge is the first beachhead — a specific user and a painful problem — not a platform for everyone.",
    "Insight is a non-obvious belief, usually earned by being the user. “We’ll execute better” is not an advantage.",
    "Why now is a change in the world or in the job, not a trend label. Talk to people before you scale.",
  ],
};

export const THESIS_FIELDS: ThesisFieldSpec[] = [
  {
    key: "idea",
    column: "crisp_idea",
    label: "The idea",
    helper: "One sentence a stranger could rebuild. No marketing-speak.",
    placeholder: "A ___ that does ___ for ___.",
    example: "A weekly operator for PMs who already pay for an LLM and a calendar. It proposes the week and never silently moves someone else’s meetings.",
    whyItMatters: "Start with what you will make. If a stranger cannot rebuild the product from this sentence, the rest of the canvas is fog.",
    goodLooksLike: "Matter-of-fact. Names the thing, who it is for, and what it does — not a category or a slogan.",
    weakLooksLike: "An AI-powered platform that revolutionizes how teams work.",
  },
  {
    key: "problem",
    column: "problem",
    label: "Problem",
    helper: "Who hurts, and what breaks for them this week — not a mild inconvenience for millions.",
    placeholder: "When X happens, Y people lose Z.",
    example: "When Monday planning starts, PMs rebuild the week from Slack, calendar, and notes. They lose the morning, then the plan dies by Wednesday.",
    whyItMatters: "Want is a painful, frequent problem for a specific person. A small group that urgently wants this beats a large group that might.",
    goodLooksLike: "A scene from last week: who, what broke, what it cost.",
    weakLooksLike: "People struggle with productivity and information overload.",
  },
  {
    key: "targetUser",
    column: "target_user",
    label: "Target users",
    helper: "Name the first ten people. A small group that urgently wants this beats a large group that might.",
    placeholder: "A specific person you could email this week.",
    example: "Staff PMs at AI or data-platform companies who already juggle ChatGPT plus Google Calendar and will take a 30-minute call this week.",
    whyItMatters: "You should be able to find the first ten people. Demographics are not users.",
    goodLooksLike: "A person you could email: job, context, and why they feel it this week.",
    weakLooksLike: "Anyone who uses AI tools. SMBs. Enterprises.",
  },
  {
    key: "scale",
    column: "scale",
    label: "Scale",
    helper: "Beachhead now, then the larval path to a much bigger market. Not “everyone with a calendar.”",
    placeholder: "Start with ___. Expand when ___.",
    example: "Start with a few operators who already mix an LLM and a real calendar. Expand when career, learning, and writing are already in the same week.",
    whyItMatters: "Huge from day one is usually a lack of focus, not ambition. Name the beachhead, then the next adjacent group.",
    goodLooksLike: "Who you serve first, and who you serve next only after the first group pulls you there.",
    weakLooksLike: "Everyone with a to-do list.",
  },
  {
    key: "market",
    column: "market",
    label: "Market",
    helper: "Bottom-up: who pays, roughly how many, and why that is enough. Not a $50B slide.",
    placeholder: "N people who already pay for ___ × $___ / year.",
    example: "Knowledge workers who already pay for an LLM plus a calendar. First beachhead: product and AI operators. Expand only after a few of them trust proposed calendar writes.",
    whyItMatters: "Don’t kill an early idea on TAM theatre — but be honest about who pays. A bottom-up count beats a slide.",
    goodLooksLike: "Who already pays for a substitute, roughly how many you can reach, and a price they already understand.",
    weakLooksLike: "The global productivity software market is $50B.",
  },
  {
    key: "competition",
    column: "competition",
    label: "Competition",
    helper: "Name the real substitutes. “No competitors” usually means no research.",
    placeholder: "They use ___ today. We differ because ___.",
    example: "ChatGPT and Claude (chat, no week). Motion and Reclaim (calendar, no goals). Notion (tasks, no operator). The current stack is that pile plus willpower.",
    whyItMatters: "People already do something. Name the substitutes and the one reason they would switch.",
    goodLooksLike: "Named products or workflows they use today, plus the difference that would make them move.",
    weakLooksLike: "We have no real competitors.",
  },
  {
    key: "whyNow",
    column: "why_now",
    label: "Why now",
    helper: "What changed so this is possible or urgent this year — not “AI is hot.”",
    placeholder: "This year, ___ became true, so ___.",
    example: "Models can already draft a week from notes, and calendar APIs are good enough to propose writes. The constraint to test is trust, not generation quality.",
    whyItMatters: "Why this year, not five years ago. A change in tools, in the job, or in what just became possible.",
    goodLooksLike: "A specific change that made this newly possible or newly painful.",
    weakLooksLike: "AI is exploding so the timing is perfect.",
  },
  {
    key: "unfairAdvantage",
    column: "unfair_advantage",
    label: "Unfair advantage",
    helper: "What you know that others don’t. “We’ll execute better” is not an insight.",
    placeholder: "Most people think ___. We’ve learned ___.",
    example: "The founder is the user: a PM of data/AI products running the operator on their own calendar. Approval boundaries are a product decision learned from use, not a slogan.",
    whyItMatters: "Insight, not hustle. What you know that a well-funded team does not.",
    goodLooksLike: "A non-obvious belief you earned — from being the user, from a domain, or from a constraint others treat as a bug.",
    weakLooksLike: "We’ll just work harder and move faster.",
  },
  {
    key: "riskiestAssumption",
    column: "riskiest_assumption",
    label: "Riskiest assumption",
    helper: "The belief that, if false, kills the idea. Make it falsifiable.",
    placeholder: "We are betting that ___ will ___.",
    example: "People will trust an operator with calendar writes only if those writes stay proposed until they approve — and that constraint is still useful enough to keep using.",
    whyItMatters: "Hold the problem; test the hypothesis. If you cannot falsify the bet, you cannot learn.",
    goodLooksLike: "One sentence you could prove wrong in two weeks.",
    weakLooksLike: "We assume customers will love it.",
  },
  {
    key: "experiment",
    column: "experiment",
    label: "Next experiment",
    helper: "The smallest honest test in ~14 days. Talk to users; don’t scale yet.",
    placeholder: "This week I will ___ with ___ people to learn ___.",
    example: "This week I will talk to five PMs who already pay for ChatGPT and a calendar, and ask whether they would let a tool propose (not send) calendar changes.",
    whyItMatters: "Building the whole product is not a test. A count of people, a question, and what you will believe if the answer is no.",
    goodLooksLike: "Who you will talk to, what you will ask, and what would change the idea.",
    weakLooksLike: "Build an MVP and see if it grows.",
  },
];

export const THESIS_COLUMNS = THESIS_FIELDS.map(field => field.column);

const MARKETING_SPEAK = /\b(revolutionize|transform the|synergy|next-gen(?:eration)?|disrupt(?:ive|ion)?|ai-powered platform|leverage|unlock value)\b/i;

export function emptyThesisFields(): ThesisFields {
  return {
    idea: "",
    problem: "",
    targetUser: "",
    scale: "",
    market: "",
    competition: "",
    whyNow: "",
    unfairAdvantage: "",
    riskiestAssumption: "",
    experiment: "",
  };
}

export function normalizeThesisFields(input: Partial<ThesisFields> & { title?: string; experiment?: string } = {}): ThesisFields {
  const next = emptyThesisFields();
  for (const key of THESIS_FIELD_KEYS) {
    const value = input[key];
    next[key] = typeof value === "string" ? value.trim() : "";
  }
  if (!next.idea && typeof input.title === "string") next.idea = input.title.trim();
  return next;
}

export function thesisFieldsFromRow(row: Record<string, unknown> | null | undefined): ThesisFields {
  const source = row ?? {};
  const next = emptyThesisFields();
  for (const field of THESIS_FIELDS) {
    const value = source[field.column] ?? source[field.key];
    next[field.key] = typeof value === "string" ? value.trim() : "";
  }
  if (!next.experiment) {
    const fallback = source.next_validation ?? source.nextValidation;
    next.experiment = typeof fallback === "string" ? fallback.trim() : "";
  }
  return next;
}

export function parseThesisClarity(value: unknown): ThesisClarity {
  let parsed: unknown = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return {};
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const clarity: ThesisClarity = {};
  for (const key of THESIS_FIELD_KEYS) {
    const entry = (parsed as Record<string, unknown>)[key];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const status = (entry as { status?: unknown }).status;
    if (status !== "clear" && status !== "unclear") continue;
    const note = (entry as { note?: unknown }).note;
    clarity[key] = { status, note: typeof note === "string" ? note.trim() : "" };
  }
  return clarity;
}

export function fieldStatus(value: string, clarity?: FieldValidation): FieldClarity {
  if (!value.trim()) return "empty";
  if (clarity?.status === "clear") return "clear";
  return "unclear";
}

export function thesisFieldStatuses(fields: ThesisFields, clarity: ThesisClarity = {}): Record<ThesisFieldKey, FieldClarity> {
  const statuses = {} as Record<ThesisFieldKey, FieldClarity>;
  for (const key of THESIS_FIELD_KEYS) statuses[key] = fieldStatus(fields[key], clarity[key]);
  return statuses;
}

export function filledThesisCount(fields: ThesisFields) {
  return THESIS_FIELD_KEYS.filter(key => fields[key].trim()).length;
}

export function clearThesisCount(fields: ThesisFields, clarity: ThesisClarity = {}) {
  return THESIS_FIELD_KEYS.filter(key => fieldStatus(fields[key], clarity[key]) === "clear").length;
}

export function isStartupThesisComplete(fields: ThesisFields, clarity: ThesisClarity = {}) {
  return THESIS_FIELD_KEYS.every(key => fieldStatus(fields[key], clarity[key]) === "clear");
}

export function thesisCompleteness(fields: ThesisFields, clarity: ThesisClarity = {}) {
  const statuses = thesisFieldStatuses(fields, clarity);
  const filled = filledThesisCount(fields);
  const clear = clearThesisCount(fields, clarity);
  return {
    complete: isStartupThesisComplete(fields, clarity),
    filled,
    clear,
    total: THESIS_FIELD_KEYS.length,
    statuses,
  };
}

export function nextThesisGap(fields: ThesisFields, clarity: ThesisClarity = {}): { key: ThesisFieldKey; status: Exclude<FieldClarity, "clear"> } | null {
  const statuses = thesisFieldStatuses(fields, clarity);
  for (const key of THESIS_FIELD_KEYS) {
    if (statuses[key] === "empty") return { key, status: "empty" };
  }
  for (const key of THESIS_FIELD_KEYS) {
    if (statuses[key] === "unclear") return { key, status: "unclear" };
  }
  return null;
}

export function clarityAfterEdits(previous: ThesisFields, next: ThesisFields, clarity: ThesisClarity): ThesisClarity {
  const updated: ThesisClarity = { ...clarity };
  for (const key of THESIS_FIELD_KEYS) {
    if (!next[key].trim()) {
      delete updated[key];
      continue;
    }
    if (previous[key].trim() !== next[key].trim()) delete updated[key];
  }
  return updated;
}

export function applyThesisValidation(fields: ThesisFields, payload: unknown): ThesisClarity {
  const incoming = parseThesisClarity(payload && typeof payload === "object" && !Array.isArray(payload) && "fields" in payload
    ? (payload as { fields: unknown }).fields
    : payload);
  const next: ThesisClarity = {};
  for (const key of THESIS_FIELD_KEYS) {
    if (!fields[key].trim()) continue;
    next[key] = incoming[key] ?? { status: "unclear", note: "Needs a clear/unclear judgement." };
  }
  return next;
}

const VAGUE = /^(needs framing\.?|tbd|todo|n\/?a|none|everyone|all users)$/i;
const DEMOGRAPHIC = /\b(everyone|anybody|anyone|all users|consumers|enterprises|smbs?|millennials|knowledge workers in general)\b/i;
const EXECUTE_BETTER = /\b(execute better|work harder|move faster|we('ll| will) just|passion(?:ate)? team|hustle)\b/i;
const AI_IS_HOT = /\b(ai is (?:hot|exploding|booming)|everyone is using ai|ai boom|ai revolution)\b/i;
const LOVE_IT = /\b(customers? will love it|people will want this|they will come)\b/i;
const BUILD_MVP = /\b(build (?:an |the )?mvp|build the (?:whole )?product|see if it grows|launch and see)\b/i;

export function heuristicFieldJudgement(key: ThesisFieldKey, value: string): FieldValidation {
  const text = value.trim();
  if (!text) return { status: "unclear", note: "Empty." };
  if (text.length < 24 || VAGUE.test(text)) {
    return { status: "unclear", note: "Too thin — be specific enough that a stranger could act on it." };
  }
  if (MARKETING_SPEAK.test(text)) {
    return { status: "unclear", note: "Sounds like marketing-speak. Say what you will make, in plain words." };
  }
  if (key === "idea" && /\b(platform for everyone|ai productivity|the uber for)\b/i.test(text)) {
    return { status: "unclear", note: "Name the thing and who it is for. A category is not an idea." };
  }
  if (key === "problem" && /\b(productivity|information overload|inefficien(?:t|cy))\b/i.test(text) && text.length < 80) {
    return { status: "unclear", note: "Describe a scene from last week — who, what broke, what it cost." };
  }
  if (key === "targetUser" && (DEMOGRAPHIC.test(text) || /^(smes?|smbs?|enterprises|businesses)\.?$/i.test(text))) {
    return { status: "unclear", note: "Name a person you could email this week, not a demographic." };
  }
  if (key === "scale" && /\b(everyone with a (calendar|to-do)|all professionals)\b/i.test(text)) {
    return { status: "unclear", note: "Name the beachhead first. Everyone is not a starting market." };
  }
  if (key === "competition" && /no competitors|no competition|we have no (real )?competitors/i.test(text)) {
    return { status: "unclear", note: "Name the substitutes people use today." };
  }
  if (key === "market" && /\$\s*\d+\s*(b|bn|billion|t|trillion)\b/i.test(text) && !/\b\d{2,}\b/.test(text)) {
    return { status: "unclear", note: "A huge TAM is not a market. Count who would actually pay." };
  }
  if (key === "whyNow" && AI_IS_HOT.test(text)) {
    return { status: "unclear", note: "Why this year, not “AI is hot.” Name what changed." };
  }
  if (key === "unfairAdvantage" && EXECUTE_BETTER.test(text)) {
    return { status: "unclear", note: "Hustle is not an insight. What do you know that others don’t?" };
  }
  if (key === "riskiestAssumption" && LOVE_IT.test(text)) {
    return { status: "unclear", note: "Make it falsifiable. What, if false, kills the idea?" };
  }
  if (key === "experiment" && (BUILD_MVP.test(text) || (!/\b\d+\b/.test(text) && !/\b(talk|interview|call|ask)\b/i.test(text)))) {
    return { status: "unclear", note: "A test names people, a question, and what a “no” would change — not “build the MVP.”" };
  }
  return { status: "unclear", note: "Filled, but not judged clear yet. Save & check is the gate." };
}

export function heuristicThesisClarity(fields: ThesisFields): ThesisClarity {
  const clarity: ThesisClarity = {};
  for (const key of THESIS_FIELD_KEYS) {
    if (!fields[key].trim()) continue;
    clarity[key] = heuristicFieldJudgement(key, fields[key]);
  }
  return clarity;
}

export function composeStartupThesis(idea: Partial<ThesisFields> & { title?: string; experiment?: string }) {
  const fields = normalizeThesisFields(idea);
  const lines = THESIS_FIELDS
    .map(field => {
      const value = fields[field.key];
      return value ? `${field.label}: ${value.endsWith(".") ? value : `${value}.`}` : "";
    })
    .filter(Boolean);
  if (lines.length) return lines.join(" ");
  const title = (idea.title ?? "").trim() || "This idea";
  return `${title} still needs a sharp problem, a named user, and a next experiment.`;
}

export function operatorThesisSeed(): ThesisFields {
  return {
    idea: "A personal operator that keeps goals, calendar, career, learning, and writing in one loop — proposing the week, never silently moving someone else’s time.",
    problem: "Goals, plans, information, and execution are fragmented across tools.",
    targetUser: "Ambitious knowledge workers using multiple AI tools",
    scale: "Start with a small set of operators who already juggle AI tools and a real calendar, then expand with knowledge work that already spans planning, career, and learning — a larval market, not everyone with a to-do list.",
    market: "Bottom-up: knowledge workers who already pay for an LLM plus a calendar or productivity stack. First beachhead is product and AI operators; expand only after a few of them trust proposed calendar writes.",
    competition: "ChatGPT/Claude (chat, no week), Motion/Reclaim (calendar, no goals), Notion/Linear (tasks, no operator), Superhuman (mail). The current substitute is that pile plus willpower.",
    whyNow: "Models can already draft plans and parse notes, and this operator is already in daily use — so the riskiest assumption can be tested on a real week instead of a slide.",
    unfairAdvantage: "The founder is the user: a PM of data/AI/agentic products running the operator on their own calendar, career, and learning loops. Insight comes from use. Approval boundaries are a product decision, not a slogan.",
    riskiestAssumption: "People will trust an operator with calendar autonomy only if writes stay proposed until they approve — and that constraint is still useful enough to keep using.",
    experiment: "Interview five people about trust and calendar autonomy.",
  };
}

export function careerThesisSeed(): Partial<ThesisFields> {
  return {
    idea: "Evidence-based job-fit explanations so experienced product and AI candidates can tell high-fit roles from high-volume listings.",
    problem: "Job seekers cannot reliably distinguish high-fit roles from high-volume listings.",
    targetUser: "Experienced product and AI candidates",
    experiment: "Test whether evidence-based fit explanations change application choices.",
  };
}

export const STARTUP_IDEA_SELECT = [
  "id",
  "title",
  "crisp_idea",
  "problem",
  "target_user",
  "scale",
  "market",
  "competition",
  "why_now",
  "unfair_advantage",
  "riskiest_assumption",
  "state",
  "next_validation",
  "confidence",
  "review_date",
  "evidence_json",
  "experiment",
  "citations_json",
  "thesis",
  "field_clarity_json",
  "world_test_json",
  "challenge_json",
].join(",");
