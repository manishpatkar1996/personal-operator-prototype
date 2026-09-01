import { env } from "cloudflare:workers";
import { getLearningConfiguration } from "./learning-preferences";
import { ensureLearningFeedbackSchema } from "./learning-feedback";
import { completeJson, liveModelsConfigured } from "@/lib/operator/llm";
import {
  articleExcerpt,
  commonFeedUrls,
  discoverFeedUrl,
  extractArticleLinks,
  insightFallback,
  looksLikeFeed,
  parseRssOrAtom,
  type FeedItem,
} from "@/lib/operator/learning-sources";
import { isHomepageDump, scoreArticle, type ArticleCandidate } from "@/lib/operator/learning-taste";
import { collectedArticleCopy, collectRunsSummarize } from "@/lib/operator/token-policy";

function db() {
  if (!env.DB) throw new Error("D1 binding DB is unavailable");
  return env.DB;
}

export async function ensureLearningItemColumns() {
  const columns = new Set((await db().prepare("PRAGMA table_info(learning_items)").all<{ name: string }>()).results.map(column => column.name));
  if (!columns.has("url")) await db().prepare("ALTER TABLE learning_items ADD COLUMN url TEXT NOT NULL DEFAULT ''").run();
  if (!columns.has("summary")) await db().prepare("ALTER TABLE learning_items ADD COLUMN summary TEXT NOT NULL DEFAULT ''").run();
  await ensureLearningFeedbackSchema();
  await db().batch([
    db().prepare("UPDATE learning_items SET url=?,summary=? WHERE id=? AND (url IS NULL OR url='' OR url='https://simonwillison.net/')")
      .bind("https://simonwillison.net/2024/Dec/9/llm-jq/", "Production evals are how tool-using agents earn trust. Read one technique, then come back with what you would copy into this Operator.", "learn-evals"),
    db().prepare("UPDATE learning_items SET url=?,summary=? WHERE id=? AND (url IS NULL OR url='')")
      .bind("https://arxiv.org/search/?query=memory+architecture+agents&searchtype=all", "Long-running agents fail when they cannot retrieve the right context. Read the research, then come back to the Operator with what you would actually ship.", "learn-memory"),
    db().prepare("UPDATE learning_items SET url=? WHERE id=? AND (url IS NULL OR url='' OR url='https://simonwillison.net/')")
      .bind("https://simonwillison.net/2026/", "learn-model"),
  ]);
  await db().prepare("DELETE FROM learning_items WHERE title LIKE '%Weblog%' OR title LIKE '[AINews]%' OR url IN ('https://simonwillison.net/','https://simonwillison.net')").run();
}

function pageTitle(html: string, fallback: string) {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return (match?.[1] ?? fallback).replace(/\s+/g, " ").trim().slice(0, 160);
}

function pickTrack(tracks: { id: string; name: string }[], text: string) {
  const lower = text.toLowerCase();
  return tracks.find(track => lower.includes(track.name.toLowerCase().split(" ")[0] ?? ""))?.id ?? tracks[0]?.id;
}

async function fetchText(url: string, timeoutMs = 8_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "text/html,application/xhtml+xml,application/rss+xml,application/atom+xml,text/xml,text/plain", "user-agent": "PersonalOperator/1.0" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return { body: await response.text(), contentType: response.headers.get("content-type") ?? "", finalUrl: response.url || url };
  } finally {
    clearTimeout(timer);
  }
}

async function summarize(title: string, text: string, interests: string[]) {
  const fallbackInsight = insightFallback(text);
  if (!liveModelsConfigured() || text.length < 80) return { insight: fallbackInsight, summary: fallbackInsight };
  try {
    const payload = await completeJson(
      "learning_summarize",
      "Return JSON {insight:string, summary:string}. insight is one sentence on why this specific article matters for the user's tracks and recent feedback. summary is two sentences max. Do not paste the article or a homepage dump.",
      JSON.stringify({ title, interests, excerpt: text.slice(0, 4_000) }),
    ) as { insight?: string; summary?: string; relevance?: string };
    return {
      insight: String(payload.insight ?? payload.relevance ?? fallbackInsight).slice(0, 280),
      summary: String(payload.summary ?? fallbackInsight).slice(0, 420),
    };
  } catch {
    return { insight: fallbackInsight, summary: fallbackInsight };
  }
}

async function articlesFromSource(sourceUrl: string, sourceName: string): Promise<FeedItem[]> {
  const page = await fetchText(sourceUrl);
  if (looksLikeFeed(page.contentType, page.body)) {
    return parseRssOrAtom(page.body, page.finalUrl).slice(0, 8);
  }
  const discovered = discoverFeedUrl(page.body, page.finalUrl);
  const feedCandidates = [discovered, ...commonFeedUrls(page.finalUrl)].filter((value, index, all): value is string => Boolean(value) && all.indexOf(value) === index);
  for (const feedUrl of feedCandidates.slice(0, 4)) {
    try {
      const feed = await fetchText(feedUrl, 6_000);
      if (!looksLikeFeed(feed.contentType, feed.body) && !/<item|<entry/i.test(feed.body)) continue;
      const items = parseRssOrAtom(feed.body, feed.finalUrl).slice(0, 8);
      if (items.length) return items;
    } catch {
      continue;
    }
  }
  const links = extractArticleLinks(page.body, page.finalUrl);
  const articles: FeedItem[] = [];
  for (const url of links.slice(0, 8)) {
    try {
      const article = await fetchText(url, 8_000);
      articles.push({
        title: pageTitle(article.body, sourceName),
        url: article.finalUrl,
        excerpt: articleExcerpt(article.body),
      });
    } catch {
      articles.push({ title: sourceName, url, excerpt: "" });
    }
  }
  return articles.filter(item => {
    try { return item.url && new URL(item.url).pathname !== "/"; } catch { return false; }
  });
}

type SelectedArticle = ArticleCandidate & { insight: string; summary: string; trackHint: string };

async function selectArticles(candidates: ArticleCandidate[], taste: { tracks: string[]; interests: string[]; want: string[]; avoid: string[] }): Promise<SelectedArticle[]> {
  const ranked = [...candidates]
    .map(item => ({ item, score: scoreArticle(item, taste) }))
    .filter(entry => entry.score >= 0 && !isHomepageDump(entry.item))
    .sort((left, right) => right.score - left.score || left.item.title.localeCompare(right.item.title));
  const shortlist = ranked.slice(0, 16).map(entry => entry.item);
  if (!shortlist.length) return [];
  if (!liveModelsConfigured() || shortlist.length < 3) {
    return shortlist.slice(0, 12).map(item => ({
      ...item,
      insight: insightFallback(item.excerpt) || `Worth a look for ${taste.interests[0] ?? "this week’s tracks"}.`,
      summary: insightFallback(item.excerpt),
      trackHint: taste.tracks[0] ?? "",
    }));
  }
  try {
    const payload = await completeJson(
      "learning_select",
      "Return JSON {selected:[{url, insight, summary, trackHint}]}. Pick 8–12 urls from the supplied candidates only.",
      JSON.stringify({ taste, candidates: shortlist.map(item => ({ title: item.title, url: item.url, excerpt: item.excerpt.slice(0, 160), source: item.source })) }),
    ) as { selected?: { url?: string; insight?: string; summary?: string; trackHint?: string }[] };
    const byUrl = new Map(shortlist.map(item => [item.url, item]));
    const selected = (payload.selected ?? [])
      .map(row => {
        const match = byUrl.get(String(row.url ?? ""));
        if (!match) return null;
        return {
          ...match,
          insight: String(row.insight ?? insightFallback(match.excerpt)).slice(0, 280),
          summary: String(row.summary ?? insightFallback(match.excerpt)).slice(0, 420),
          trackHint: String(row.trackHint ?? ""),
        };
      })
      .filter((item): item is SelectedArticle => Boolean(item));
    if (selected.length) return selected.slice(0, 12);
  } catch {
    /* fall through to ranked shortlist */
  }
  return shortlist.slice(0, 12).map(item => ({
    ...item,
    insight: insightFallback(item.excerpt),
    summary: insightFallback(item.excerpt),
    trackHint: taste.tracks[0] ?? "",
  }));
}

export async function collectLearning() {
  await ensureLearningItemColumns();
  const { preferences, sources } = await getLearningConfiguration();
  const enabled = sources.filter(source => source.enabled).sort((a, b) => b.priority - a.priority).slice(0, 10);
  if (!enabled.length) throw new Error("Add and enable at least one learning source first");
  const tracks = (await db().prepare("SELECT id,name FROM learning_tracks ORDER BY position").all<{ id: string; name: string }>()).results;
  const existing = (await db().prepare("SELECT title,source,url FROM learning_items").all<{ title: string; source: string; url?: string }>()).results;
  const seen = new Set(existing.flatMap(item => [item.url, item.title.toLowerCase()].filter(Boolean).map(value => String(value).toLowerCase())));
  const candidates: ArticleCandidate[] = [];
  let skipped = 0;
  let failed = 0;
  const results = await Promise.allSettled(enabled.map(async source => ({ source, articles: await articlesFromSource(source.url, source.name) })));
  for (const result of results) {
    if (result.status === "rejected") {
      failed += 1;
      continue;
    }
    const { source, articles } = result.value;
    if (!articles.length) {
      failed += 1;
      continue;
    }
    for (const article of articles) {
      const urlKey = article.url.toLowerCase();
      const titleKey = article.title.toLowerCase();
      if (seen.has(urlKey) || seen.has(titleKey) || isHomepageDump(article)) {
        skipped += 1;
        continue;
      }
      seen.add(urlKey);
      seen.add(titleKey);
      candidates.push({ title: article.title, url: article.url, excerpt: article.excerpt, source: source.name });
    }
  }
  const selected = await selectArticles(candidates, {
    tracks: preferences.tracks,
    interests: preferences.interests,
    want: preferences.want,
    avoid: preferences.avoid,
  });
  let collected = 0;
  for (const article of selected) {
    let excerpt = article.excerpt;
    let insight = article.insight;
    let summary = article.summary;
    if (excerpt.length < 80) {
      try {
        const page = await fetchText(article.url);
        excerpt = articleExcerpt(page.body) || insightFallback(page.body);
        if (!article.title || article.title === article.source) article.title = pageTitle(page.body, article.title);
      } catch {
        excerpt = article.excerpt;
      }
    }
    const distilled = collectRunsSummarize()
      ? await summarize(article.title, excerpt, [...preferences.interests, ...preferences.want])
      : collectedArticleCopy({ ...article, excerpt }, insightFallback);
    insight = distilled.insight;
    summary = distilled.summary;
    const trackId = pickTrack(tracks, `${article.title} ${insight} ${article.trackHint} ${preferences.tracks.join(" ")}`) ?? "track-news";
    await db().prepare("INSERT INTO learning_items (id,track_id,title,source,item_type,duration_minutes,status,relevance,url,summary,feedback) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
      .bind(crypto.randomUUID(), trackId, article.title.slice(0, 160), article.source, /arxiv|paper/i.test(article.source) ? "Paper" : "Article", 12, "recommended", insight, article.url, summary, "")
      .run();
    collected += 1;
  }
  return { collected, skipped, failed, sources: enabled.length, candidates: candidates.length, model: liveModelsConfigured() ? "live" : "deterministic" };
}

export async function summarizeLearningItem(id: string) {
  await ensureLearningItemColumns();
  const item = await db().prepare("SELECT id,title,source,url,relevance,summary FROM learning_items WHERE id=?")
    .bind(id).first<{ id: string; title: string; source: string; url: string; relevance: string; summary: string }>();
  if (!item) throw new Error("Learning item was not found");
  const stored = collectedArticleCopy({ insight: item.relevance, summary: item.summary, excerpt: item.summary || item.relevance, source: item.source }, insightFallback);
  if (item.relevance.trim() && item.relevance.trim() !== item.source && item.summary.trim()) {
    return { id, insight: stored.insight, summary: stored.summary, model: "stored", reused: true };
  }
  const { preferences } = await getLearningConfiguration();
  let excerpt = item.summary || item.relevance;
  if (item.url) {
    try {
      const page = await fetchText(item.url);
      excerpt = articleExcerpt(page.body) || excerpt;
    } catch {
      /* keep stored excerpt */
    }
  }
  const distilled = await summarize(item.title, excerpt, [...preferences.interests, ...preferences.want]);
  await db().prepare("UPDATE learning_items SET relevance=?,summary=? WHERE id=?").bind(distilled.insight, distilled.summary, id).run();
  return { id, insight: distilled.insight, summary: distilled.summary, model: liveModelsConfigured() ? "live" : "deterministic", reused: false };
}
