import { env } from "cloudflare:workers";
import { calendarDayStamp, conflictsWith, formatConflictCallout, formatConflictRange, isOccupying, nextFreeSlot, occupiesCalendarDay, overlapClusters, parsePlanningNote, planningBusyBlocks, preferredTimezone, remainingCapacityMinutes, type TimeBlock } from "@/lib/operator/calendar";

function db() {
  if (!env.DB) throw new Error("D1 binding DB is unavailable");
  return env.DB;
}

type BlockRow = {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  state: string;
  ownership: string;
};

export async function listTimeBlocks(): Promise<TimeBlock[]> {
  const rows = await db().prepare("SELECT id,title,start_at,end_at,state,ownership FROM calendar_blocks").all<BlockRow>();
  return rows.results.map(row => ({
    id: row.id,
    title: row.title,
    startAt: row.start_at,
    endAt: row.end_at,
    state: row.state,
    ownership: row.ownership,
  }));
}

async function preferredCalendarTimezone() {
  const row = await db().prepare("SELECT timezone FROM calendar_preferences WHERE id='primary'").first<{ timezone: string }>();
  return preferredTimezone(row?.timezone);
}

export async function calendarIntelligence(date?: string) {
  const blocks = await listTimeBlocks();
  const timezone = await preferredCalendarTimezone();
  const today = date ?? calendarDayStamp(timezone);
  const slot = nextFreeSlot(blocks, 45, new Date(), timezone);
  const clusters = overlapClusters(blocks, today, timezone);
  return {
    timezone,
    date: today,
    remainingMinutes: remainingCapacityMinutes(blocks, today, timezone),
    nextSlot: slot,
    busy: blocks.filter(block => isOccupying(block) && occupiesCalendarDay(block, today, timezone)),
    conflicts: clusters.map(cluster => ({
      ...cluster,
      headline: formatConflictCallout(cluster, timezone),
      range: formatConflictRange(cluster, timezone),
    })),
  };
}

export async function slotForDuration(durationMinutes = 45, preferredStart?: string, preferredEnd?: string) {
  const blocks = await listTimeBlocks();
  const timezone = await preferredCalendarTimezone();
  const occupied = planningBusyBlocks(blocks, timezone);
  if (preferredStart && preferredEnd && conflictsWith(occupied, preferredStart, preferredEnd).length === 0) {
    return { startAt: preferredStart, endAt: preferredEnd, snapped: false, conflicts: [] as TimeBlock[] };
  }
  const slot = nextFreeSlot(blocks, durationMinutes, preferredStart ? new Date(preferredStart) : new Date(), timezone);
  return {
    startAt: slot.startAt,
    endAt: slot.endAt,
    snapped: true,
    conflicts: preferredStart && preferredEnd ? conflictsWith(occupied, preferredStart, preferredEnd) : [],
  };
}

export async function retryCalendarWrite(requestId?: string, blockId?: string) {
  const request = requestId
    ? await db().prepare("SELECT id,block_id,action,payload_json,external_event_id FROM calendar_write_requests WHERE id=?").bind(requestId).first<{ id: string; block_id: string; action: string; payload_json: string; external_event_id: string | null }>()
    : await db().prepare("SELECT id,block_id,action,payload_json,external_event_id FROM calendar_write_requests WHERE block_id=? AND status='failed' ORDER BY created_at DESC LIMIT 1").bind(blockId ?? "").first<{ id: string; block_id: string; action: string; payload_json: string; external_event_id: string | null }>();
  if (!request) throw new Error("No failed calendar write was found to retry");
  await db().batch([
    db().prepare("UPDATE calendar_write_requests SET status='approved_pending',error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(request.id),
    db().prepare("UPDATE calendar_blocks SET state='approved_pending' WHERE id=?").bind(request.block_id),
  ]);
  return { message: "Calendar write re-queued for the Google worker", requestId: request.id };
}

export async function applyPlanningNote(note: string) {
  const timezone = await preferredCalendarTimezone();
  const parsed = parsePlanningNote(note, new Date(), timezone);
  const slot = await slotForDuration(parsed.durationMinutes);
  return { parsed, slot };
}
