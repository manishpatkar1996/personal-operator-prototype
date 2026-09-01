const GOAL_STATES = new Set(["active", "paused", "completed", "archived"]);
const MILESTONE_STATES = new Set(["not_started", "ready", "active", "blocked", "achieved", "skipped"]);

export type GoalDumpMilestone = {
  title: string;
  completionRule: string;
  targetDate: string;
  weight: number;
  completionPercentage: number;
  status: "not_started" | "ready" | "active" | "blocked" | "achieved" | "skipped";
};

export type GoalDump = {
  title: string;
  desiredOutcome: string;
  successCriteria: string;
  targetDate: string;
  priority: number;
  state: "active" | "paused" | "completed" | "archived";
  milestones: GoalDumpMilestone[];
};

export type GoalsDump = { goals: GoalDump[] };

export function parseGoalDate(value: unknown) {
  if (typeof value !== "string") throw new Error("Goal dates must be text");
  const trimmed = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(trimmed);
  if (dmy) {
    const day = dmy[1].padStart(2, "0");
    const month = dmy[2].padStart(2, "0");
    return `${dmy[3]}-${month}-${day}`;
  }
  throw new Error(`Date must be YYYY-MM-DD or DD/MM/YYYY (got ${trimmed})`);
}

export function parseGoalPriority(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5) return value;
  const label = String(value ?? "").trim().toLowerCase();
  if (label === "highest" || label === "high") return 5;
  if (label === "medium") return 3;
  if (label === "low") return 2;
  if (label === "lowest") return 1;
  const asNumber = Number(label);
  if (Number.isInteger(asNumber) && asNumber >= 1 && asNumber <= 5) return asNumber;
  throw new Error("Priority must be 1–5 or High / Medium / Low");
}

export function parseGoalWeight(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(1, Math.min(100, Math.round(value)));
  const raw = String(value ?? "").trim().replace(/%$/, "");
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) throw new Error("Milestone weight must be a number or percent");
  return Math.max(1, Math.min(100, Math.round(parsed)));
}

function parseState(value: unknown, allowed: Set<string>, fallback: string) {
  if (value === undefined || value === null || value === "") return fallback;
  const label = String(value).trim().toLowerCase().replaceAll(" ", "_");
  if (!allowed.has(label)) throw new Error(`Unknown state ${String(value)}`);
  return label;
}

function parseMilestone(value: unknown, index: number): GoalDumpMilestone {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Milestone ${index + 1} must be an object`);
  const row = value as Record<string, unknown>;
  const title = String(row.title ?? "").trim();
  const completionRule = String(row.completionRule ?? row.completion_rule ?? "").trim();
  if (!title || !completionRule) throw new Error(`Milestone ${index + 1} needs a title and completionRule`);
  return {
    title,
    completionRule,
    targetDate: parseGoalDate(row.targetDate ?? row.target_date),
    weight: parseGoalWeight(row.weight ?? 1),
    completionPercentage: Math.max(0, Math.min(100, Math.round(Number(row.completionPercentage ?? row.completion_percentage ?? 0) || 0))),
    status: parseState(row.status, MILESTONE_STATES, "not_started") as GoalDumpMilestone["status"],
  };
}

function parseGoal(value: unknown, index: number): GoalDump {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Goal ${index + 1} must be an object`);
  const row = value as Record<string, unknown>;
  const title = String(row.title ?? "").trim();
  const desiredOutcome = String(row.desiredOutcome ?? row.desired_outcome ?? "").trim();
  const successCriteria = String(row.successCriteria ?? row.success_criteria ?? "").trim();
  if (!title || !desiredOutcome || !successCriteria) throw new Error(`Goal ${index + 1} needs title, desiredOutcome, and successCriteria`);
  const milestones = Array.isArray(row.milestones) ? row.milestones.map(parseMilestone) : [];
  return {
    title,
    desiredOutcome,
    successCriteria,
    targetDate: parseGoalDate(row.targetDate ?? row.target_date),
    priority: parseGoalPriority(row.priority ?? 3),
    state: parseState(row.state, GOAL_STATES, "active") as GoalDump["state"],
    milestones,
  };
}

export function parseGoalsDump(input: unknown): GoalsDump {
  let value = input;
  if (typeof value === "string") {
    try { value = JSON.parse(value); }
    catch { throw new Error("Goals dump must be valid JSON"); }
  }
  const rows = Array.isArray(value) ? value : (value && typeof value === "object" ? (value as { goals?: unknown }).goals : null);
  if (!Array.isArray(rows) || !rows.length) throw new Error('JSON must be { "goals": [ ... ] } with at least one goal');
  return { goals: rows.map(parseGoal) };
}

export function exportGoalsDump(goals: Array<{
  title: string;
  desiredOutcome: string;
  successCriteria: string;
  targetDate: string;
  priority: number;
  state: string;
  milestones: Array<{
    title: string;
    completionRule: string;
    targetDate: string;
    weight: number;
    completionPercentage: number;
    status: string;
  }>;
}>): GoalsDump {
  return {
    goals: goals.map(goal => ({
      title: goal.title,
      desiredOutcome: goal.desiredOutcome,
      successCriteria: goal.successCriteria,
      targetDate: goal.targetDate,
      priority: goal.priority,
      state: goal.state as GoalDump["state"],
      milestones: goal.milestones.map(item => ({
        title: item.title,
        completionRule: item.completionRule,
        targetDate: item.targetDate,
        weight: item.weight,
        completionPercentage: item.completionPercentage,
        status: item.status as GoalDumpMilestone["status"],
      })),
    })),
  };
}

/** Labeled example pack — sample shape, not the user’s goals. Import only if they want this walkthrough. */
export const EXAMPLE_GOALS_PACK_NOTE = "Sample shape — not your goals. Load this pack only if you want the walkthrough, not as a substitute for your own plan.";
export const EXAMPLE_GOALS_DUMP: GoalsDump = {
  goals: [
    {
      title: "Land a high-agency AI Product role",
      desiredOutcome: "Join a strong AI-first or AI-heavy product team where I have meaningful ownership, work closely with engineering/research, build 0→1 products, stay close to users, and can use my background across AI/ML, data science, consumer products, platforms and hands-on AI building.\n\nPrioritize roles where I am not simply managing execution, but am expected to form product judgment, prototype, influence technical direction and own measurable outcomes.",
      successCriteria: "At least 1 accepted offer for a Senior/Staff/Lead PM or equivalent role that meets my quality bar. Role has meaningful ownership of AI/ML, agentic AI, search, data/platform, developer products, or AI-native consumer experiences. Compensation, role scope, manager quality and company trajectory meet my predefined threshold. I can clearly answer “Why this role over my alternatives?” and would still choose it if I had 2–3 comparable offers.",
      targetDate: "2026-11-30",
      priority: 5,
      state: "active",
      milestones: [
        { title: "Build target-company and role map", completionRule: "30–40 priority companies identified and segmented into Tier 1/2/3; 3–5 target role archetypes defined; relevant teams and hiring managers identified for Tier 1 companies.", targetDate: "2026-09-10", weight: 15, completionPercentage: 0, status: "not_started" },
        { title: "Create role-specific career narrative and application assets", completionRule: "Have 3 strong resume variants — AI/Agentic, Search/Data Platform, Consumer/Growth — plus referral blurb, cover-letter template, GitHub proof points and a crisp 60-second career story.", targetDate: "2026-09-15", weight: 20, completionPercentage: 0, status: "not_started" },
        { title: "Create warm entry points into priority companies", completionRule: "At least 30 meaningful conversations/referral requests across Google, Microsoft, Target, Swiggy, Intuit, AI startups and similar companies; at least 10 hiring-manager/recruiter conversations.", targetDate: "2026-10-15", weight: 20, completionPercentage: 0, status: "not_started" },
        { title: "Reach multiple high-quality interview loops", completionRule: "At least 6 strong interview processes, with at least 3 reaching hiring-manager/final-loop stages.", targetDate: "2026-11-10", weight: 25, completionPercentage: 0, status: "not_started" },
        { title: "Select and accept the best role", completionRule: "Compare opportunities on role scope, manager, learning, AI depth, company trajectory, compensation and location; negotiate and accept preferred offer.", targetDate: "2026-11-30", weight: 20, completionPercentage: 0, status: "not_started" },
      ],
    },
    {
      title: "Become exceptional at AI / Senior PM interviews",
      desiredOutcome: "Reach a point where interviews are no longer preparation-dependent. I should be able to walk into Product Sense, Strategy, Execution, Analytics, Technical/AI, Leadership and Behavioral rounds and consistently demonstrate structured thinking, strong judgment, technical depth and memorable stories.",
      successCriteria: "Complete 25+ serious mock interviews. Build a reusable bank of 15–20 strong career stories. Reach an average self/peer mock score of at least 8/10 across major interview types. Be able to solve unfamiliar product problems in 35–45 minutes without relying on memorized frameworks. Convert at least 50% of first-round interviews into later stages once the preparation system is mature.",
      targetDate: "2026-10-31",
      priority: 5,
      state: "active",
      milestones: [
        { title: "Build the interview system", completionRule: "Create frameworks/checklists for Product Sense, Strategy, Execution, Metrics, Technical Product, AI/ML Product and Behavioral interviews; create tracking rubric.", targetDate: "2026-09-10", weight: 15, completionPercentage: 0, status: "not_started" },
        { title: "Build my story bank", completionRule: "15–20 stories documented from Athena, Infinyte, Bright, Belong and NatWest covering failure, conflict, influence, 0→1, ambiguity, AI, customer discovery, technical decisions, prioritization and measurable impact.", targetDate: "2026-09-20", weight: 20, completionPercentage: 0, status: "not_started" },
        { title: "Complete deliberate mock practice", completionRule: "15 mocks completed across Product Sense, Execution, Strategy and Behavioral with written feedback and repeated weak-area drills.", targetDate: "2026-10-10", weight: 30, completionPercentage: 0, status: "not_started" },
        { title: "Master AI / technical PM interviews", completionRule: "Confidently explain agents, RAG, evals, retrieval/search, model trade-offs, APIs, data platforms, latency/cost/reliability, human-in-the-loop, AI safety and system design for PMs. Complete 10 dedicated technical/AI mocks.", targetDate: "2026-10-25", weight: 25, completionPercentage: 0, status: "not_started" },
        { title: "Demonstrate interview readiness", completionRule: "Complete 3 full simulated loops with no major recurring weakness and average feedback ≥8/10.", targetDate: "2026-10-31", weight: 10, completionPercentage: 0, status: "not_started" },
      ],
    },
    {
      title: "Become a top-tier AI Product builder",
      desiredOutcome: "Develop enough depth across modern AI systems that I can independently reason about what should be built, prototype it, evaluate it and have credible technical discussions with researchers and engineers.\n\nFocus especially on agents, evals, retrieval/search, context engineering, data platforms, recommendation systems and AI product UX rather than passive course consumption.",
      successCriteria: "Ship 3 meaningful AI prototypes/products. Complete one structured learning path across agents, retrieval/RAG, evals and AI systems. Produce written notes/frameworks that I can explain without external material. Be able to design an agentic product end-to-end including context, tools, memory, permissions, evals, failure handling, latency and cost. GitHub clearly demonstrates hands-on AI building.",
      targetDate: "2026-11-30",
      priority: 5,
      state: "active",
      milestones: [
        { title: "Build AI foundations map", completionRule: "Create a personal knowledge map covering LLMs, transformers at useful depth, RAG, semantic search, embeddings, agents, tool calling, memory/context, evals, recommendation systems and production trade-offs.", targetDate: "2026-09-15", weight: 15, completionPercentage: 0, status: "not_started" },
        { title: "Deep dive on agents and evals", completionRule: "Build at least one agent with multiple tools, persistent context and explicit evals; document failure modes and design choices.", targetDate: "2026-09-30", weight: 25, completionPercentage: 0, status: "not_started" },
        { title: "Deep dive on retrieval and intelligence systems", completionRule: "Build a working retrieval/recommendation system using embeddings + ranking + structured context/knowledge relationships; compare at least two approaches quantitatively.", targetDate: "2026-10-20", weight: 20, completionPercentage: 0, status: "not_started" },
        { title: "Ship 3 AI products", completionRule: "Three public or internally usable AI products with working demos, README, architecture decisions and actual user feedback.", targetDate: "2026-11-15", weight: 30, completionPercentage: 0, status: "not_started" },
        { title: "Codify what I learned", completionRule: "Publish an “AI Product Playbook” for myself containing reusable principles for agents, evals, context, search/recommendation and AI UX.", targetDate: "2026-11-30", weight: 10, completionPercentage: 0, status: "not_started" },
      ],
    },
    {
      title: "Build a strong public voice in AI Product",
      desiredOutcome: "Become known within the Indian product/AI ecosystem as someone who builds and thinks deeply about AI products, rather than someone who merely comments on AI news.\n\nUse content to create relationships, inbound opportunities, credibility and a distribution channel for future products.",
      successCriteria: "Publish at least 20 high-quality pieces by the target date. Develop 3 recognizable content pillars. Generate at least 10 meaningful inbound conversations from founders, PM leaders, recruiters or builders. Have at least 3 posts/articles with strong organic engagement relative to my current baseline. Content regularly references things I actually built, tested or learned.",
      targetDate: "2026-11-30",
      priority: 3,
      state: "active",
      milestones: [
        { title: "Define my content thesis", completionRule: "Pick 3 pillars, e.g. AI Product Building, AI/Search/Data Product Analysis, and PM Career/Product Craft; define target audience and writing style.", targetDate: "2026-09-10", weight: 10, completionPercentage: 0, status: "not_started" },
        { title: "Create consistent publishing cadence", completionRule: "Publish minimum 2 useful posts per week for 6 consecutive weeks.", targetDate: "2026-10-20", weight: 30, completionPercentage: 0, status: "not_started" },
        { title: "Publish proof-of-work content", completionRule: "Publish at least 5 deep pieces based on actual builds/experiments — AI Product Operator, AI Career OS, agent evaluation, search/retrieval, PM workflows, etc.", targetDate: "2026-10-31", weight: 25, completionPercentage: 0, status: "not_started" },
        { title: "Turn content into relationships", completionRule: "At least 10 meaningful conversations or inbound opportunities can be directly traced to published content.", targetDate: "2026-11-30", weight: 25, completionPercentage: 0, status: "not_started" },
        { title: "Review distribution analytics", completionRule: "Analyze topics, hooks, formats, saves, comments, profile views and inbound quality; define next-quarter content strategy from evidence.", targetDate: "2026-11-30", weight: 10, completionPercentage: 0, status: "not_started" },
      ],
    },
    {
      title: "Find and validate a startup idea worth building",
      desiredOutcome: "Move from having many interesting ideas to identifying one painful, valuable problem where I have founder-market fit, a credible insight, and evidence that users will repeatedly use or pay for a solution.\n\nThe goal is not to start a company by November. The goal is to earn enough evidence that one idea deserves a serious commitment.",
      successCriteria: "Explore at least 10 problem spaces. Conduct 30+ problem/customer interviews. Build prototypes for the top 3 opportunities. Get at least 10 users to seriously test one solution. Obtain strong validation: repeated usage, willingness to pay, LOIs, or clear pull. Make an explicit pursue / kill / revisit decision for each shortlisted idea.",
      targetDate: "2026-11-30",
      priority: 3,
      state: "active",
      milestones: [
        { title: "Build startup opportunity map", completionRule: "Identify 10–15 problems based on areas where I have unusual insight: AI for PMs, AI career/job workflows, enterprise knowledge/context, healthcare operations, fintech intelligence, AI reliability/evals, etc.", targetDate: "2026-09-20", weight: 15, completionPercentage: 0, status: "not_started" },
        { title: "Conduct problem discovery", completionRule: "Complete at least 20 interviews across the most promising 5 problem areas; record pain severity, frequency, current workaround, buyer and willingness to pay.", targetDate: "2026-10-15", weight: 25, completionPercentage: 0, status: "not_started" },
        { title: "Select top 3 ideas", completionRule: "Score opportunities on pain, frequency, willingness to pay, market size, distribution advantage, founder fit, defensibility and speed to MVP; select top 3.", targetDate: "2026-10-20", weight: 15, completionPercentage: 0, status: "not_started" },
        { title: "Build and test 3 scrappy MVPs", completionRule: "Each idea has a functional prototype and at least 3–5 target users have used or reacted to it in a realistic workflow.", targetDate: "2026-11-15", weight: 25, completionPercentage: 0, status: "not_started" },
        { title: "Choose one idea to pursue", completionRule: "One idea demonstrates materially stronger pull through usage, repeat usage, payment intent or customer urgency; write a one-page investment thesis and concrete 90-day execution plan.", targetDate: "2026-11-30", weight: 20, completionPercentage: 0, status: "not_started" },
      ],
    },
  ],
};

export const EXAMPLE_GOALS_JSON = `${JSON.stringify(EXAMPLE_GOALS_DUMP, null, 2)}\n`;
