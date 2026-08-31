import { istDateParts, istIso } from "./calendar.ts";

export type IcsEvent = {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  url: string;
  ownership: "external_fixed";
};

type RawEvent = {
  uid: string;
  summary: string;
  url: string;
  start: Date;
  end: Date;
  rrule: string;
  exdates: Date[];
};

const DAY_MS = 86_400_000;
const WEEKDAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

function unfold(ics: string) {
  return ics.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
}

function unescapeIcs(value: string) {
  return value.replace(/\\n/gi, " ").replace(/\\[,;\\]/g, match => match.slice(1)).trim();
}

function parseDate(value: string, params: string) {
  const compact = value.replace(/[-:]/g, "");
  const tzid = /TZID=([^;]+)/i.exec(params)?.[1] ?? "";
  if (/^\d{8}$/.test(compact)) {
    return new Date(`${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}T00:00:00+05:30`);
  }
  const stamp = compact.replace(/Z$/i, "");
  const iso = `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}T${stamp.slice(9, 11) || "00"}:${stamp.slice(11, 13) || "00"}:${stamp.slice(13, 15) || "00"}`;
  if (/Z$/i.test(value) || /Z$/i.test(compact)) return new Date(`${iso}Z`);
  if (/kolkata|calcutta|ist/i.test(tzid) || !tzid) return new Date(`${iso}+05:30`);
  return new Date(`${iso}Z`);
}

function toIstIso(date: Date) {
  const parts = istDateParts(date);
  return istIso(parts.year, parts.month, parts.day, parts.hour, parts.minute);
}

function parseRrule(rrule: string) {
  const parts = Object.fromEntries(rrule.split(";").map(part => {
    const [key, value] = part.split("=");
    return [key.toUpperCase(), value ?? ""];
  }));
  return {
    freq: (parts.FREQ ?? "").toUpperCase(),
    interval: Math.max(1, Number(parts.INTERVAL ?? 1) || 1),
    count: parts.COUNT ? Number(parts.COUNT) : undefined,
    until: parts.UNTIL ? parseDate(parts.UNTIL, "") : undefined,
    byday: (parts.BYDAY ?? "").split(",").map(day => day.replace(/^-?\d+/, "").toUpperCase()).filter(day => WEEKDAYS.includes(day)),
  };
}

function weekdayCode(date: Date) {
  const name = istDateParts(date).weekday.slice(0, 3);
  const map: Record<string, string> = { Sun: "SU", Mon: "MO", Tue: "TU", Wed: "WE", Thu: "TH", Fri: "FR", Sat: "SA" };
  return map[name] ?? WEEKDAYS[date.getUTCDay()] ?? "";
}

function matchesByDay(date: Date, byday: string[]) {
  if (!byday.length) return true;
  return byday.includes(weekdayCode(date));
}

function expandEvent(event: RawEvent, windowStart: Date, windowEnd: Date) {
  const duration = Math.max(15 * 60_000, event.end.getTime() - event.start.getTime());
  const occurrences: { start: Date; end: Date }[] = [];
  if (!event.rrule) {
    if (event.end > windowStart && event.start < windowEnd) occurrences.push({ start: event.start, end: event.end });
    return occurrences;
  }
  const rule = parseRrule(event.rrule);
  if (!["DAILY", "WEEKLY"].includes(rule.freq)) {
    if (event.end > windowStart && event.start < windowEnd) occurrences.push({ start: event.start, end: event.end });
    return occurrences;
  }
  const ex = new Set(event.exdates.map(date => date.toISOString().slice(0, 16)));
  const step = rule.freq === "DAILY" ? rule.interval * DAY_MS : rule.interval * 7 * DAY_MS;
  let cursor = new Date(event.start);
  let emitted = 0;
  const hardStop = rule.until ?? windowEnd;
  const max = Math.min(rule.count ?? 400, 400);
  while (cursor < hardStop && emitted < max && occurrences.length < 200) {
    const end = new Date(cursor.getTime() + duration);
    if (end > windowStart && cursor < windowEnd && matchesByDay(cursor, rule.byday) && !ex.has(cursor.toISOString().slice(0, 16))) {
      occurrences.push({ start: new Date(cursor), end });
      emitted += 1;
    } else if (rule.count && matchesByDay(cursor, rule.byday)) {
      emitted += 1;
    }
    cursor = new Date(cursor.getTime() + (rule.freq === "WEEKLY" && rule.byday.length ? DAY_MS : step));
    if (rule.freq === "WEEKLY" && rule.byday.length && cursor.getTime() - event.start.getTime() > 400 * DAY_MS) break;
  }
  return occurrences;
}

function parseEventBlock(block: string): RawEvent | null {
  const fields = new Map<string, { params: string; value: string }>();
  const exdates: Date[] = [];
  for (const line of block.split("\n")) {
    const split = line.indexOf(":");
    if (split < 0) continue;
    const left = line.slice(0, split);
    const value = line.slice(split + 1);
    const [name, ...paramParts] = left.split(";");
    const key = name.toUpperCase();
    const params = paramParts.join(";");
    if (key === "EXDATE") {
      for (const stamp of value.split(",")) exdates.push(parseDate(stamp, params));
      continue;
    }
    fields.set(key, { params, value });
  }
  const startField = fields.get("DTSTART");
  if (!startField) return null;
  const start = parseDate(startField.value, startField.params);
  const endField = fields.get("DTEND");
  const end = endField ? parseDate(endField.value, endField.params) : new Date(start.getTime() + 45 * 60_000);
  const uid = unescapeIcs(fields.get("UID")?.value ?? "");
  if (!uid) return null;
  return {
    uid,
    summary: unescapeIcs(fields.get("SUMMARY")?.value ?? "Untitled event") || "Untitled event",
    url: unescapeIcs(fields.get("URL")?.value ?? ""),
    start,
    end,
    rrule: fields.get("RRULE")?.value ?? "",
    exdates,
  };
}

export function parseIcs(ics: string, windowStart: Date, windowEnd: Date): IcsEvent[] {
  const body = unfold(ics);
  const blocks = body.split(/BEGIN:VEVENT/i).slice(1).map(chunk => chunk.split(/END:VEVENT/i)[0] ?? "");
  const events: IcsEvent[] = [];
  const seen = new Set<string>();
  for (const block of blocks) {
    const raw = parseEventBlock(block);
    if (!raw) continue;
    for (const occurrence of expandEvent(raw, windowStart, windowEnd)) {
      const startAt = toIstIso(occurrence.start);
      const key = `${raw.uid}:${startAt}`;
      if (seen.has(key)) continue;
      seen.add(key);
      events.push({
        id: key.slice(0, 180),
        title: raw.summary.slice(0, 160),
        startAt,
        endAt: toIstIso(occurrence.end),
        url: raw.url,
        ownership: "external_fixed",
      });
    }
  }
  return events.sort((left, right) => left.startAt.localeCompare(right.startAt)).slice(0, 200);
}
