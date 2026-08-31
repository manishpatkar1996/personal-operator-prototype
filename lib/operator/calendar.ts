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

export function istIso(year: string, month: string, day: string, hour: number, minute: number) {
  return `${year}-${month}-${day}T${pad(hour)}:${pad(minute)}:00+05:30`;
}

export function addIstDays(year: string, month: string, day: string, days: number) {
  const shifted = Date.parse(`${year}-${month}-${day}T12:00:00+05:30`) + days * 86_400_000;
  const parts = istDateParts(new Date(shifted));
  return { year: parts.year, month: parts.month, day: parts.day, weekday: parts.weekday };
}

export function remainingCapacityMinutes(blocks: TimeBlock[], date: string) {
  const occupied = blocks
    .filter(block => isOccupying(block) && block.startAt.slice(0, 10) === date)
    .reduce((sum, block) => sum + Math.max(0, (toMs(block.endAt) - toMs(block.startAt)) / 60_000), 0);
  return Math.max(0, Math.round(DAY_CAPACITY_MINUTES - occupied));
}

export function busyIntervals(blocks: TimeBlock[], date: string) {
  return blocks
    .filter(block => isOccupying(block) && block.startAt.slice(0, 10) === date)
    .map(block => ({
      id: block.id,
      title: block.title ?? "Busy",
      startAt: block.startAt,
      endAt: block.endAt,
      ownership: block.ownership ?? "calendar_owned",
    }))
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
}

export function nextFreeSlot(blocks: TimeBlock[], durationMinutes = 45, from = new Date()) {
  const duration = Math.min(180, Math.max(15, durationMinutes));
  const startParts = istDateParts(from);
  for (let day = 0; day < 10; day += 1) {
    const date = addIstDays(startParts.year, startParts.month, startParts.day, day);
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
      const startAt = istIso(date.year, date.month, date.day, hour, minute);
      const endTotal = hour * 60 + minute + duration;
      const endAt = istIso(date.year, date.month, date.day, Math.floor(endTotal / 60), endTotal % 60);
      if (conflictsWith(blocks, startAt, endAt).length === 0) {
        return { startAt, endAt, date: `${date.year}-${date.month}-${date.day}`, snapped: day > 0 || hour !== 10 || minute !== 0 };
      }
      minute += 15;
      if (minute >= 60) {
        minute = 0;
        hour += 1;
      }
    }
  }
  const fallback = addIstDays(startParts.year, startParts.month, startParts.day, 1);
  return {
    startAt: istIso(fallback.year, fallback.month, fallback.day, 10, 0),
    endAt: istIso(fallback.year, fallback.month, fallback.day, 10, duration),
    date: `${fallback.year}-${fallback.month}-${fallback.day}`,
    snapped: true,
  };
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

export function parsePlanningNote(note: string, from = new Date()) {
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
  const parts = istDateParts(from);
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
