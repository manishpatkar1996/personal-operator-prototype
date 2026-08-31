import { env } from "cloudflare:workers";
import { addIstDays, istDateParts } from "@/lib/operator/calendar";
import { parseIcs, type IcsEvent } from "@/lib/operator/ics";

function db() {
  if (!env.DB) throw new Error("D1 binding DB is unavailable");
  return env.DB;
}

function envIcsUrl() {
  const value = (env as Record<string, string | undefined>).GOOGLE_CALENDAR_ICS_URL;
  return typeof value === "string" && /^https?:\/\//i.test(value.trim()) ? value.trim() : "";
}

export function parseCalendarFeedUrl(value: unknown) {
  if (typeof value !== "string") throw new Error("Calendar feed URL is required");
  const input = value.trim().replace(/^webcal:\/\//i, "https://");
  if (!input) throw new Error("Calendar feed URL is required");
  let parsed: URL;
  try { parsed = new URL(input); } catch { throw new Error("Calendar feed URL must be valid"); }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("Calendar feed URL must use http or https");
  if (!/ical|ics|calendar/i.test(`${parsed.hostname}${parsed.pathname}${parsed.search}`)) {
    throw new Error("Use a secret iCal URL from Google Calendar → Settings → Integrate calendar");
  }
  parsed.hash = "";
  return parsed.toString();
}

export async function calendarFeedConfigured() {
  const envUrl = envIcsUrl();
  if (envUrl) return true;
  const row = await db().prepare("SELECT ics_url FROM calendar_preferences WHERE id='primary'").first<{ ics_url?: string }>();
  return Boolean(row?.ics_url && row.ics_url.length > 8);
}

async function storedIcsUrl() {
  const envUrl = envIcsUrl();
  if (envUrl) return envUrl;
  const row = await db().prepare("SELECT ics_url FROM calendar_preferences WHERE id='primary'").first<{ ics_url?: string }>();
  return row?.ics_url?.trim() ?? "";
}

function syncWindow(days: number) {
  const parts = istDateParts(new Date());
  const start = addIstDays(parts.year, parts.month, parts.day, 0);
  const end = addIstDays(parts.year, parts.month, parts.day, Math.max(1, days));
  return {
    syncStart: `${start.year}-${start.month}-${start.day}T00:00:00+05:30`,
    syncEnd: `${end.year}-${end.month}-${end.day}T00:00:00+05:30`,
    windowStart: new Date(`${start.year}-${start.month}-${start.day}T00:00:00+05:30`),
    windowEnd: new Date(`${end.year}-${end.month}-${end.day}T00:00:00+05:30`),
  };
}

export async function applyCalendarEvents(events: IcsEvent[], account: string, syncStart: string, syncEnd: string) {
  const database = db();
  const syncedAt = new Date().toISOString();
  const existing = await database.prepare("SELECT id,external_event_id,ownership FROM calendar_blocks WHERE source='google_calendar' AND start_at>=? AND start_at<?").bind(syncStart, syncEnd).all<{ id: string; external_event_id: string; ownership: string }>();
  const existingByExternalId = new Map(existing.results.map(item => [item.external_event_id, item]));
  const activeIds = new Set(events.map(event => event.id));
  const statements = events.map(event => {
    const previous = existingByExternalId.get(event.id);
    const ownership = previous?.ownership === "operator_created" ? "operator_created" : event.ownership;
    const blockId = previous?.id ?? `gcal:${event.id}`.slice(0, 180);
    return database.prepare("INSERT OR REPLACE INTO calendar_blocks (id,title,goal_id,milestone_id,start_at,end_at,state,ownership,source,external_event_id,event_url,last_synced_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(blockId, event.title, null, null, event.startAt, event.endAt, "synced", ownership, "google_calendar", event.id, event.url, syncedAt);
  });
  for (const item of existing.results) {
    if (item.external_event_id && !activeIds.has(item.external_event_id) && item.ownership !== "operator_created") {
      statements.push(database.prepare("DELETE FROM calendar_blocks WHERE id=?").bind(item.id));
    }
  }
  await database.prepare("DELETE FROM calendar_blocks WHERE source='sample' OR id LIKE 'cal-%'").run();
  if (statements.length) await database.batch(statements);
  await database.prepare("UPDATE connectors SET status='connected',detail=?,updated_at=? WHERE id='google-calendar'")
    .bind(`${account} · ${events.length} events in the next window · read-only iCal`, syncedAt).run();
  return { message: `Google Calendar refreshed — ${events.length} events in the planning window`, count: events.length };
}

export async function saveCalendarFeedUrl(url: string) {
  const normalized = parseCalendarFeedUrl(url);
  await db().prepare("UPDATE calendar_preferences SET ics_url=?,updated_at=CURRENT_TIMESTAMP WHERE id='primary'").bind(normalized).run();
  return refreshCalendarFromIcs();
}

export async function refreshCalendarFromIcs() {
  const url = await storedIcsUrl();
  if (!url) {
    await db().prepare("UPDATE connectors SET status='not_connected',detail=?,updated_at=CURRENT_TIMESTAMP WHERE id='google-calendar'")
      .bind("Paste a Google Calendar secret iCal URL in Calendar controls. Writes still queue until a write worker exists.").run();
    return { message: "Add a Google Calendar secret iCal URL under Calendar controls, then refresh." };
  }
  const preference = await db().prepare("SELECT sync_window_days FROM calendar_preferences WHERE id='primary'").first<{ sync_window_days: number }>();
  const window = syncWindow(Number(preference?.sync_window_days ?? 7));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "text/calendar, text/plain, */*", "user-agent": "PersonalOperator/1.0" },
    });
    if (!response.ok) throw new Error(`Calendar feed returned HTTP ${response.status}`);
    const ics = await response.text();
    if (!/BEGIN:VCALENDAR/i.test(ics)) throw new Error("That URL did not return an iCal feed");
    const events = parseIcs(ics, window.windowStart, window.windowEnd);
    let host = "Calendar feed";
    try { host = new URL(url).hostname.replace(/^www\./, ""); } catch { /* keep default */ }
    return applyCalendarEvents(events, host, window.syncStart, window.syncEnd);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Calendar feed could not be read";
    await db().prepare("UPDATE connectors SET status='sync_requested',detail=?,updated_at=CURRENT_TIMESTAMP WHERE id='google-calendar'")
      .bind(`${detail}. Check the secret iCal URL and refresh again.`).run();
    throw new Error(detail);
  } finally {
    clearTimeout(timer);
  }
}
