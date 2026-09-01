export type TimeBlock = {
  id?: string;
  startAt: string;
  endAt: string;
  state?: string;
  title?: string;
  ownership?: string;
};

export const OPERATOR_TIMEZONE = "Asia/Kolkata";
export const WORKDAY_START_HOUR = 9;
export const WORKDAY_END_HOUR = 18;
export const DAY_CAPACITY_MINUTES = 8 * 60;

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function toMs(iso: string) {
  const value = Date.parse(iso);
  return Number.isNaN(value) ? 0 : value;
}

export function overlaps(left: TimeBlock, right: TimeBlock) {
  return toMs(left.startAt) < toMs(right.endAt) && toMs(right.startAt) < toMs(left.endAt);
}

export function isOccupying(block: TimeBlock) {
  return !["dismissed"].includes(block.state ?? "");
}

export function conflictsWith(blocks: TimeBlock[], startAt: string, endAt: string, ignoreId?: string) {
  const probe = { startAt, endAt };
  return blocks.filter(block => isOccupying(block) && block.id !== ignoreId && overlaps(block, probe));
}

export function istDateParts(date: Date) {
  return zonedDateParts(date, OPERATOR_TIMEZONE);
}

export function zonedDateParts(date: Date, timeZone = OPERATOR_TIMEZONE) {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      hourCycle: "h23",
    }).formatToParts(date);
    const get = (type: string) => parts.find(part => part.type === type)?.value ?? "0";
    return {
      year: get("year"),
      month: get("month"),
      day: get("day"),
      hour: Number(get("hour")),
      minute: Number(get("minute")),
      weekday: get("weekday"),
    };
  } catch {
    return istDatePartsFallback(date);
  }
}

function istDatePartsFallback(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: OPERATOR_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? "0";
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    weekday: get("weekday"),
  };
}

export function preferredTimezone(value: unknown) {
  const zone = String(value ?? "").trim();
  if (!zone) return OPERATOR_TIMEZONE;
  try {
    Intl.DateTimeFormat("en-US", { timeZone: zone }).format(new Date());
    return zone;
  } catch {
    return OPERATOR_TIMEZONE;
  }
}

export function zoneOffsetIso(date: Date, timeZone: string) {
  try {
    const name = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "longOffset",
      hour: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date).find(part => part.type === "timeZoneName")?.value ?? "GMT";
    const match = name.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
    if (!match) return timeZone === OPERATOR_TIMEZONE ? "+05:30" : "+00:00";
    return `${match[1]}${String(match[2]).padStart(2, "0")}:${match[3] ?? "00"}`;
  } catch {
    return timeZone === OPERATOR_TIMEZONE ? "+05:30" : "+00:00";
  }
}

export function zonedIso(timeZone: string, year: string, month: string, day: string, hour: number, minute: number) {
  const local = `${year}-${month}-${day}T${pad(hour)}:${pad(minute)}:00`;
  let millis = Date.parse(`${local}Z`);
  for (let i = 0; i < 4; i += 1) {
    const offset = zoneOffsetIso(new Date(Number.isNaN(millis) ? Date.now() : millis), timeZone);
    millis = Date.parse(`${local}${offset}`);
  }
  const offset = zoneOffsetIso(new Date(Number.isNaN(millis) ? Date.now() : millis), timeZone);
  return `${local}${offset}`;
}

export function sampleBlocksForToday(timeZone = OPERATOR_TIMEZONE, now = new Date()) {
  const zone = preferredTimezone(timeZone);
  const parts = zonedDateParts(now, zone);
  const block = (hour: number, minute: number, duration: number) => {
    const start = zonedIso(zone, parts.year, parts.month, parts.day, hour, minute);
    const endTotal = hour * 60 + minute + duration;
    return {
      start,
      end: zonedIso(zone, parts.year, parts.month, parts.day, Math.floor(endTotal / 60), endTotal % 60),
    };
  };
  return {
    timezone: zone,
    date: `${parts.year}-${parts.month}-${parts.day}`,
    catchUp: block(12, 0, 45),
    career: block(14, 0, 45),
    learning: block(16, 0, 60),
  };
}

export function formatInTimezone(value: string | Date, timeZone: string, options: Intl.DateTimeFormatOptions, locale = "en-IN") {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone: preferredTimezone(timeZone) }).format(date);
  } catch {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone: OPERATOR_TIMEZONE }).format(date);
  }
}

export function calendarDayStamp(timeZone: string, now = new Date()) {
  return formatInTimezone(now, timeZone, { year: "numeric", month: "2-digit", day: "2-digit" }, "en-CA");
}

export function istIso(year: string, month: string, day: string, hour: number, minute: number) {
  return `${year}-${month}-${day}T${pad(hour)}:${pad(minute)}:00+05:30`;
}

export function addZonedDays(timeZone: string, year: string, month: string, day: string, days: number) {
  const zone = preferredTimezone(timeZone);
  const shifted = toMs(zonedIso(zone, year, month, day, 12, 0)) + days * 86_400_000;
  const parts = zonedDateParts(new Date(shifted), zone);
  return { year: parts.year, month: parts.month, day: parts.day, weekday: parts.weekday };
}

export function addIstDays(year: string, month: string, day: string, days: number) {
  return addZonedDays(OPERATOR_TIMEZONE, year, month, day, days);
}

export function occupiesCalendarDay(block: TimeBlock, date: string, timeZone = OPERATOR_TIMEZONE) {
  const zone = preferredTimezone(timeZone);
  const [year, month, day] = date.split("-");
  if (!year || !month || !day) return false;
  const dayStart = toMs(zonedIso(zone, year, month, day, 0, 0));
  const next = addZonedDays(zone, year, month, day, 1);
  const dayEnd = toMs(zonedIso(zone, next.year, next.month, next.day, 0, 0));
  const start = toMs(block.startAt);
  const end = toMs(block.endAt) || start;
  if (!start && !end) return block.startAt.slice(0, 10) === date;
  return start < dayEnd && dayStart < end;
}

export function remainingCapacityMinutes(blocks: TimeBlock[], date: string, timeZone = OPERATOR_TIMEZONE) {
  const zone = preferredTimezone(timeZone);
  const occupied = blocks
    .filter(block => isOccupying(block) && occupiesCalendarDay(block, date, zone))
    .reduce((sum, block) => sum + Math.max(0, (toMs(block.endAt) - toMs(block.startAt)) / 60_000), 0);
  return Math.max(0, Math.round(DAY_CAPACITY_MINUTES - occupied));
}

export function busyIntervals(blocks: TimeBlock[], date: string, timeZone = OPERATOR_TIMEZONE) {
  const zone = preferredTimezone(timeZone);
  return blocks
    .filter(block => isOccupying(block) && occupiesCalendarDay(block, date, zone))
    .map(block => ({
      id: block.id,
      title: block.title ?? "Busy",
      startAt: block.startAt,
      endAt: block.endAt,
      ownership: block.ownership ?? "calendar_owned",
    }))
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
}

export type ConflictCluster = {
  count: number;
  titles: string[];
  ids: string[];
  startAt: string;
  endAt: string;
};

export function overlapClusters(blocks: TimeBlock[], date?: string, timeZone = OPERATOR_TIMEZONE): ConflictCluster[] {
  const zone = preferredTimezone(timeZone);
  const occupying = blocks
    .filter(isOccupying)
    .filter(block => !date || occupiesCalendarDay(block, date, zone))
    .sort((left, right) => toMs(left.startAt) - toMs(right.startAt) || toMs(left.endAt) - toMs(right.endAt));
  const groups: TimeBlock[][] = [];
  for (const block of occupying) {
    const hits: number[] = [];
    for (let index = 0; index < groups.length; index += 1) {
      if (groups[index].some(existing => overlaps(existing, block))) hits.push(index);
    }
    if (!hits.length) {
      groups.push([block]);
      continue;
    }
    const merged = [block, ...hits.flatMap(index => groups[index])];
    for (const index of [...hits].reverse()) groups.splice(index, 1);
    groups.push(merged);
  }
  return groups.filter(group => group.length >= 2).map(group => {
    const ordered = [...group].sort((left, right) => toMs(left.startAt) - toMs(right.startAt) || String(left.title ?? "").localeCompare(String(right.title ?? "")));
    return {
      count: ordered.length,
      titles: ordered.map(block => block.title?.trim() || "Busy"),
      ids: ordered.map(block => block.id).filter((id): id is string => Boolean(id)),
      startAt: ordered.reduce((earliest, block) => toMs(block.startAt) < toMs(earliest) ? block.startAt : earliest, ordered[0].startAt),
      endAt: ordered.reduce((latest, block) => toMs(block.endAt) > toMs(latest) ? block.endAt : latest, ordered[0].endAt),
    };
  }).sort((left, right) => toMs(left.startAt) - toMs(right.startAt) || right.count - left.count);
}

export function formatClock(value: string, timeZone = OPERATOR_TIMEZONE) {
  const parts = zonedDateParts(new Date(value), preferredTimezone(timeZone));
  return `${pad(parts.hour)}:${pad(parts.minute)}`;
}

export function formatConflictCallout(cluster: ConflictCluster, timeZone = OPERATOR_TIMEZONE) {
  const zone = preferredTimezone(timeZone);
  return `${cluster.count} event${cluster.count === 1 ? "" : "s"} overlap at ${formatClock(cluster.startAt, zone)}`;
}

export function formatConflictRange(cluster: ConflictCluster, timeZone = OPERATOR_TIMEZONE) {
  const zone = preferredTimezone(timeZone);
  return `${formatClock(cluster.startAt, zone)}–${formatClock(cluster.endAt, zone)}`;
}

export function planningBusyBlocks(blocks: TimeBlock[], timeZone = OPERATOR_TIMEZONE): TimeBlock[] {
  const occupying = blocks.filter(isOccupying);
  const clusters = overlapClusters(occupying, undefined, preferredTimezone(timeZone));
  return [
    ...occupying,
    ...clusters.map((cluster, index) => ({
      id: `conflict-cluster-${index}`,
      title: cluster.titles.join(" · "),
      startAt: cluster.startAt,
      endAt: cluster.endAt,
      state: "synced",
      ownership: "conflict_cluster",
    })),
  ];
}

export function nextFreeSlot(blocks: TimeBlock[], durationMinutes = 45, from = new Date(), timeZone = OPERATOR_TIMEZONE) {
  const duration = Math.min(180, Math.max(15, durationMinutes));
  const zone = preferredTimezone(timeZone);
  const startParts = zonedDateParts(from, zone);
  const occupied = planningBusyBlocks(blocks, zone);
  for (let day = 0; day < 10; day += 1) {
    const date = addZonedDays(zone, startParts.year, startParts.month, startParts.day, day);
    if (date.weekday === "Sat" || date.weekday === "Sun") continue;
    let hour = WORKDAY_START_HOUR;
    let minute = 0;
    if (day === 0) {
      hour = Math.max(WORKDAY_START_HOUR, startParts.hour);
      minute = startParts.minute <= 0 ? 0 : startParts.minute <= 15 ? 15 : startParts.minute <= 30 ? 30 : startParts.minute <= 45 ? 45 : 0;
      if (startParts.minute > 45) hour += 1;
      if (minute === 0 && startParts.minute > 45) hour = Math.max(hour, startParts.hour + 1);
      if (hour < WORKDAY_START_HOUR) {
        hour = WORKDAY_START_HOUR;
        minute = 0;
      }
    }
    while (hour * 60 + minute + duration <= WORKDAY_END_HOUR * 60) {
      const startAt = zonedIso(zone, date.year, date.month, date.day, hour, minute);
      const endTotal = hour * 60 + minute + duration;
      const endAt = zonedIso(zone, date.year, date.month, date.day, Math.floor(endTotal / 60), endTotal % 60);
      if (conflictsWith(occupied, startAt, endAt).length === 0) {
        return { startAt, endAt, date: `${date.year}-${date.month}-${date.day}`, snapped: day > 0 || hour !== 10 || minute !== 0 };
      }
      minute += 15;
      if (minute >= 60) {
        minute = 0;
        hour += 1;
      }
    }
  }
  const fallback = addZonedDays(zone, startParts.year, startParts.month, startParts.day, 1);
  return {
    startAt: zonedIso(zone, fallback.year, fallback.month, fallback.day, 10, 0),
    endAt: zonedIso(zone, fallback.year, fallback.month, fallback.day, 10, duration),
    date: `${fallback.year}-${fallback.month}-${fallback.day}`,
    snapped: true,
  };
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

export function parsePlanningNote(note: string, from = new Date(), timeZone = OPERATOR_TIMEZONE) {
  const text = note.trim();
  if (!text) throw new Error("Planning note cannot be empty");
  const durationMinutes = /\b90\b/.test(text) ? 90 : /\b(60|one hour|1 hour)\b/i.test(text) ? 60 : /\b30\b/.test(text) ? 30 : 45;
  const clock = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i) ?? text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  let hour: number | undefined;
  let minute = 0;
  if (clock) {
    hour = Number(clock[1]);
    minute = Number(clock[2] || 0);
    const meridian = clock[3]?.toLowerCase();
    if (meridian === "pm" && hour < 12) hour += 12;
    if (meridian === "am" && hour === 12) hour = 0;
  }
  const parts = zonedDateParts(from, preferredTimezone(timeZone));
  let dayOffset = /\btoday\b/i.test(text) ? 0 : 1;
  const weekdayName = WEEKDAYS.find(day => new RegExp(`\\b${day}\\b`, "i").test(text));
  if (weekdayName) {
    const wanted = WEEKDAYS.indexOf(weekdayName);
    const currentName = parts.weekday.toLowerCase();
    const current = WEEKDAYS.findIndex(day => day.startsWith(currentName.slice(0, 3)));
    dayOffset = (wanted - (current >= 0 ? current : from.getDay()) + 7) % 7 || 7;
  }
  const title = text
    .replace(/\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, "")
    .replace(/\bat\s+\d{1,2}(:\d{2})?\s*(am|pm)?/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 72) || text.slice(0, 72);
  return { title, durationMinutes, dayOffset, hour, minute, raw: text };
}

export type TimelineBlock = {
  id?: unknown;
  title?: unknown;
  state?: unknown;
  source?: unknown;
  ownership?: unknown;
  start_at?: unknown;
  startAt?: unknown;
  end_at?: unknown;
  endAt?: unknown;
};

function blockStart(block: TimelineBlock) {
  return String(block.start_at ?? block.startAt ?? "");
}

function blockEnd(block: TimelineBlock) {
  return String(block.end_at ?? block.endAt ?? "");
}

export function asTimeBlock(block: TimelineBlock): TimeBlock {
  return {
    id: block.id != null && String(block.id) ? String(block.id) : undefined,
    title: block.title != null ? String(block.title) : undefined,
    startAt: blockStart(block),
    endAt: blockEnd(block) || blockStart(block),
    state: block.state != null ? String(block.state) : undefined,
    ownership: block.ownership != null ? String(block.ownership) : undefined,
  };
}

export function isDismissedTimelineBlock(block: TimelineBlock) {
  return String(block.state ?? "") === "dismissed";
}

export function visibleTimelineBlocks<T extends TimelineBlock>(blocks: T[]): T[] {
  const live = blocks.filter(block => !isDismissedTimelineBlock(block));
  const ranked = [...live].sort((left, right) => {
    const sourceRank = (item: T) => String(item.source) === "google_calendar" ? 0 : 1;
    const stateRank = (item: T) => {
      const state = String(item.state ?? "");
      if (state === "synced" || state === "scheduled") return 0;
      if (state === "proposed" || state === "approved_pending") return 2;
      return 1;
    };
    return sourceRank(left) - sourceRank(right) || stateRank(left) - stateRank(right);
  });
  const seen = new Set<string>();
  const next: T[] = [];
  for (const block of ranked) {
    const key = `${String(block.title ?? "").trim().toLowerCase()}|${blockStart(block).slice(0, 16)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(block);
  }
  return next.sort((left, right) => {
    const a = Date.parse(blockStart(left)) || 0;
    const b = Date.parse(blockStart(right)) || 0;
    if (a !== b) return a - b;
    return blockStart(left).localeCompare(blockStart(right));
  });
}

export type CalendarReadKind = "live" | "stale" | "offline";

export type CalendarReadStatus = {
  kind: CalendarReadKind;
  label: string;
  detail: string;
};

export function calendarReadStatus(input: {
  icsConfigured: boolean;
  connectorStatus?: string;
  googleEventCount: number;
  todayBlockCount: number;
}): CalendarReadStatus {
  const { icsConfigured, googleEventCount, todayBlockCount } = input;
  if (icsConfigured) {
    return {
      kind: "live",
      label: "Google read is live",
      detail: todayBlockCount
        ? `${todayBlockCount} block${todayBlockCount === 1 ? "" : "s"} today · read-only · writes still queue`
        : "Read-only iCal · writes still queue",
    };
  }
  if (googleEventCount > 0) {
    return {
      kind: "stale",
      label: "Reconnect feed",
      detail: `${googleEventCount} previously synced event${googleEventCount === 1 ? "" : "s"} · paste a secret iCal URL to keep busy/free live`,
    };
  }
  return {
    kind: "offline",
    label: "Not connected",
    detail: "No calendar feed on this machine. Paste a secret iCal URL to read Google events. Writes still queue.",
  };
}

export function calendarControlsStartOpen(icsConfigured: boolean, hasGoogleEventsToday: boolean, kind?: CalendarReadKind) {
  if (icsConfigured || hasGoogleEventsToday) return false;
  return kind === "stale";
}
