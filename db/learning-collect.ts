import { env } from "cloudflare:workers";
import { getLearningConfiguration } from "./learning-preferences";
import { completeJson, openaiConfigured } from "@/lib/operator/llm";

function db() {
  if (!env.DB) throw new Error("D1 binding DB is unavailable");
  return env.DB;
}

export async function ensureLearningItemColumns() {
  const columns = new Set((await db().prepare("PRAGMA table_info(learning_items)").all<{ name: string }>()).results.map(column => column.name));
  if (!columns.has("url")) await db().prepare("ALTER TABLE learning_items ADD COLUMN url TEXT NOT NULL DEFAULT ''").run();
  if (!columns.has("summary")) await db().prepare("ALTER TABLE learning_items ADD COLUMN summary TEXT NOT NULL DEFAULT ''").run();
}

function extractText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 8_000);
}

function pageTitle(html: string, fallback: string) {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return (match?.[1] ?? fallback).replace(/\s+/g, " ").trim().slice(0, 160);
}

function firstSentences(text: string) {
  return (text.split(/(?<=[.?!])\s+/).slice(0, 2).join(" ") || text).slice(0, 420);
}

function pickTrack(tracks: { id: string; name: string }[], text: string) {
  const lower = text.toLowerCase();
  return tracks.find(track => lower.includes(track.name.toLowerCase().split(" ")[0] ?? ""))?.id ?? tracks[0]?.id;
}

async function summarize(title: string, text: string, interests: string[]) {
  if (!openaiConfigured() || text.length < 80) return firstSentences(text);
  try {
    const payload = await completeJson(
      "learning_summarize",
      "Summarise this source for a personal AI operator. Return JSON {summary, relevance}. Never recommend applying, messaging, or publishing.",
      JSON.stringify({ title, interests, excerpt: text.slice(0, 4_000) }),
    ) as { summary?: string; relevance?: string };
    return String(payload.summary ?? payload.relevance ?? firstSentences(text)).slice(0, 420);
  } catch {
    return firstSentences(text);
  }
}

export async function collectLearning() {
  await ensureLearningItemColumns();
  const { preferences, sources } = await getLearningConfiguration();
  const enabled = sources.filter(source => source.enabled).sort((a, b) => b.priority - a.priority).slice(0, 8);
  if (!enabled.length) throw new Error("Add and enable at least one learning source first");
  const tracks = (await db().prepare("SELECT id,name FROM learning_tracks ORDER BY position").all<{ id: string; name: string }>()).results;
  const existing = (await db().prepare("SELECT title,source,url FROM learning_items").all<{ title: string; source: string; url?: string }>()).results;
  const seen = new Set(existing.flatMap(item => [item.url, item.source, item.title.toLowerCase()].filter(Boolean).map(value => String(value).toLowerCase())));
  let collected = 0;
  let skipped = 0;
  let failed = 0;
  for (const source of enabled) {
    const key = source.url.toLowerCase();
    if (seen.has(key)) {
      skipped += 1;
      continue;
    }
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8_000);
      const response = await fetch(source.url, { signal: controller.signal, headers: { accept: "text/html,application/xhtml+xml,text/plain" } });
      clearTimeout(timer);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text();
      const title = pageTitle(html, source.name);
      if (seen.has(title.toLowerCase())) {
        skipped += 1;
        continue;
      }
      const text = extractText(html);
      const summary = await summarize(title, text, preferences.interests);
      const trackId = pickTrack(tracks, `${title} ${summary} ${preferences.tracks.join(" ")}`) ?? "track-news";
      await db().prepare("INSERT INTO learning_items (id,track_id,title,source,item_type,duration_minutes,status,relevance,url,summary) VALUES (?,?,?,?,?,?,?,?,?,?)")
        .bind(crypto.randomUUID(), trackId, title, source.name, source.sourceType === "paper_repository" ? "Paper" : "Article", 12, "recommended", summary, source.url, summary)
        .run();
      seen.add(key);
      seen.add(title.toLowerCase());
      collected += 1;
    } catch {
      failed += 1;
      if (!seen.has(key)) {
        const trackId = tracks[0]?.id ?? "track-news";
        await db().prepare("INSERT INTO learning_items (id,track_id,title,source,item_type,duration_minutes,status,relevance,url,summary) VALUES (?,?,?,?,?,?,?,?,?,?)")
          .bind(crypto.randomUUID(), trackId, source.name, source.name, "Source", 10, "recommended", "The source URL was saved; the page could not be fetched from this runtime.", source.url, "")
          .run();
        seen.add(key);
        collected += 1;
      }
    }
  }
  return { collected, skipped, failed, sources: enabled.length, model: openaiConfigured() ? "nano" : "deterministic" };
}
