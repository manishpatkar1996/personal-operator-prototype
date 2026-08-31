export type LearningTaste = {
  tracks: string[];
  interests: string[];
  want: string[];
  avoid: string[];
  weeklyBudgetMinutes: number;
  tasteNotes: string;
};

export type LearningSourceSeed = {
  id: string;
  name: string;
  sourceType: "website" | "rss" | "newsletter" | "youtube" | "podcast" | "journal" | "paper_repository";
  url: string;
  priority: number;
};

export type ArticleCandidate = {
  title: string;
  url: string;
  excerpt: string;
  source: string;
};

const STOP = new Set(["the", "a", "an", "for", "and", "with", "from", "this", "that", "week", "into", "your", "how", "why", "what", "using", "use", "into", "over", "about", "after", "before", "plus"]);

export const DEFAULT_LEARNING_SOURCES: LearningSourceSeed[] = [
  { id: "source-simon", name: "Simon Willison", sourceType: "rss", url: "https://simonwillison.net/atom/everything/", priority: 5 },
  { id: "source-lilian", name: "Lilian Weng", sourceType: "rss", url: "https://lilianweng.github.io/index.xml", priority: 5 },
  { id: "source-chip", name: "Chip Huyen", sourceType: "rss", url: "https://huyenchip.com/feed.xml", priority: 5 },
  { id: "source-langchain", name: "LangChain", sourceType: "rss", url: "https://blog.langchain.dev/rss/", priority: 4 },
  { id: "source-eugeneyan", name: "Eugene Yan", sourceType: "rss", url: "https://eugeneyan.com/rss.xml", priority: 4 },
  { id: "source-interconnects", name: "Interconnects", sourceType: "rss", url: "https://www.interconnects.ai/feed", priority: 4 },
  { id: "source-latent", name: "Latent Space", sourceType: "rss", url: "https://www.latent.space/feed", priority: 4 },
  { id: "source-arxiv-ai", name: "arXiv cs.AI", sourceType: "paper_repository", url: "https://rss.arxiv.org/rss/cs.AI", priority: 3 },
  { id: "source-google-ai", name: "Google AI blog", sourceType: "rss", url: "https://blog.google/technology/ai/rss/", priority: 3 },
  { id: "source-aws-ml", name: "AWS ML blog", sourceType: "rss", url: "https://aws.amazon.com/blogs/machine-learning/feed/", priority: 3 },
];

function unique(values: string[], max = 16) {
  const next: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const label = value.trim();
    if (!label) continue;
    const key = label.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(label);
    if (next.length >= max) break;
  }
  return next;
}

function has(text: string, pattern: RegExp) {
  return pattern.test(text);
}

export function topicFromTitle(title: string) {
  const words = title
    .replace(/[^a-zA-Z0-9 +]/g, " ")
    .split(/\s+/)
    .filter(word => word.length > 3 && !STOP.has(word.toLowerCase()));
  return words.slice(0, 4).join(" ").slice(0, 80);
}

export function preferencesFromResume(profile: {
  targetRoles?: string[];
  industries?: string[];
  strengths?: string[];
  exclusions?: string[];
  resumeText?: string;
}): Pick<LearningTaste, "tracks" | "interests" | "avoid" | "weeklyBudgetMinutes"> {
  const resume = `${profile.resumeText ?? ""} ${(profile.strengths ?? []).join(" ")} ${(profile.targetRoles ?? []).join(" ")}`.toLowerCase();
  const tracks = unique([
    has(resume, /agent|tool.?use|llm|copilot/) ? "Agentic AI products" : "",
    has(resume, /data platform|warehouse|analytics|athena|google cloud|gcp/) ? "Enterprise data & AI platforms" : "",
    "AI product craft",
    has(resume, /health|clinical|athena/) || (profile.industries ?? []).some(item => /health/i.test(item)) ? "Healthcare AI products" : "",
  ].filter(Boolean), 5);
  const interests = unique([
    ...(profile.strengths ?? []).slice(0, 8),
    has(resume, /rag|retriev/) ? "RAG and retrieval" : "",
    has(resume, /eval/) ? "Evals" : "Evals",
    "Tool-using agents",
    "Memory architectures",
    has(resume, /0.?to.?1|platform launch/) ? "0-to-1 platform launches" : "",
    has(resume, /health/) ? "Healthcare AI" : "",
    "Enterprise AI platforms",
  ].filter(Boolean), 12);
  const avoid = unique([
    ...(profile.exclusions ?? []).slice(0, 6),
    "Generic model launch posts",
    "Consumer chatbot news",
    "Quota sales",
  ].filter(Boolean), 12);
  return { tracks: tracks.length ? tracks : ["Agentic AI products", "AI product craft"], interests, avoid, weeklyBudgetMinutes: 300 };
}

export function scoreArticle(item: ArticleCandidate, taste: Pick<LearningTaste, "interests" | "want" | "avoid">) {
  const haystack = `${item.title} ${item.excerpt}`.toLowerCase();
  if (taste.avoid.some(term => term && haystack.includes(term.toLowerCase()))) return -100;
  const boosts = [...taste.interests, ...taste.want];
  return boosts.reduce((sum, term) => sum + (term && haystack.includes(term.toLowerCase()) ? 3 : 0), 0);
}

export function isSearchOrHomepageUrl(url: string) {
  if (!url.trim()) return false;
  try {
    const parsed = new URL(url);
    const path = parsed.pathname;
    if (path === "/" || path === "") return true;
    if (/\/search(\/|$)/i.test(path)) return true;
    if (parsed.searchParams.has("q") || parsed.searchParams.has("query") || parsed.searchParams.has("searchtype")) return true;
    return false;
  } catch {
    return false;
  }
}

export function isHomepageDump(item: Pick<ArticleCandidate, "title" | "excerpt" | "url">) {
  if (/weblog|homepage|subscribe\s+to|^\[ainews\]/i.test(item.title)) return true;
  if (isSearchOrHomepageUrl(item.url)) return true;
  return /sponsored by|cookie|sign in to continue/i.test(item.excerpt.slice(0, 200));
}

export const WEEK_QUEUE_CAP = 5;

export type LearningQueueItem = {
  status?: unknown;
  feedback?: unknown;
  url?: unknown;
  title?: unknown;
  duration_minutes?: unknown;
  summary?: unknown;
  relevance?: unknown;
};

export function isLowQualityLearningItem(item: LearningQueueItem) {
  return isHomepageDump({
    title: String(item.title ?? ""),
    url: String(item.url ?? ""),
    excerpt: String(item.summary ?? item.relevance ?? ""),
  });
}

export function weekLearningQueue<T extends LearningQueueItem>(items: T[], cap = WEEK_QUEUE_CAP): T[] {
  const ranked = items
    .filter(item => String(item.status) !== "completed")
    .filter(item => String(item.feedback) !== "skip")
    .filter(item => !isLowQualityLearningItem(item))
    .sort((left, right) => {
      const urlRank = (item: T) => String(item.url ?? "").trim() ? 0 : 1;
      const statusRank = (item: T) => {
        const status = String(item.status ?? "");
        if (status === "recommended") return 0;
        if (status === "saved") return 1;
        return 2;
      };
      return urlRank(left) - urlRank(right) || statusRank(left) - statusRank(right);
    });
  return ranked.slice(0, cap);
}

export function queuedLearningMinutes(items: LearningQueueItem[]) {
  return items.reduce((sum, item) => sum + Math.max(0, Number(item.duration_minutes ?? 0)), 0);
}

export function applyFeedback(
  taste: LearningTaste,
  input: { verdict: "useful" | "skip"; title: string; source?: string },
): Pick<LearningTaste, "want" | "avoid" | "tasteNotes"> {
  const topic = topicFromTitle(input.title) || input.title.slice(0, 80);
  const line = `${input.verdict === "useful" ? "Useful" : "Skip"}: ${input.title.slice(0, 90)}${input.source ? ` (${input.source})` : ""}`;
  const notes = [line, taste.tasteNotes].filter(Boolean).join("\n").split("\n").slice(0, 12).join("\n").slice(0, 1_500);
  if (input.verdict === "useful") {
    return { want: unique([topic, ...taste.want], 16), avoid: taste.avoid, tasteNotes: notes };
  }
  return { want: taste.want, avoid: unique([topic, ...taste.avoid], 16), tasteNotes: notes };
}

export function formatTasteForPrompt(taste: Pick<LearningTaste, "tracks" | "interests" | "want" | "avoid" | "weeklyBudgetMinutes" | "tasteNotes">) {
  return [
    `Tracks: ${taste.tracks.join(", ") || "not set"}`,
    `Interests: ${taste.interests.join(", ") || "not set"}`,
    `Want more of: ${taste.want.join(", ") || "not set yet"}`,
    `Skip: ${taste.avoid.join(", ") || "not set"}`,
    `Weekly budget: ${taste.weeklyBudgetMinutes} minutes`,
    taste.tasteNotes ? `Recent feedback:\n${taste.tasteNotes}` : "",
  ].filter(Boolean).join("\n");
}
