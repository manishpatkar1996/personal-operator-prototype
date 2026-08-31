export const MEMORY_NOTE_IDS = ["goals", "career", "content-strategy", "decisions"] as const;
export type MemoryNoteId = (typeof MEMORY_NOTE_IDS)[number];

export type MemoryNoteKind = {
  id: MemoryNoteId;
  title: string;
  purpose: string;
  fromLabel: string;
  updateLabel: string;
  replacesHint: string;
};

export const MEMORY_NOTES: Record<MemoryNoteId, MemoryNoteKind> = {
  goals: {
    id: "goals",
    title: "Goals",
    purpose: "Outcomes, progress, and milestones",
    fromLabel: "Goals",
    updateLabel: "Update this note from Goals",
    replacesHint: "This replaces your wording with what’s currently in Goals.",
  },
  career: {
    id: "career",
    title: "Career",
    purpose: "Target roles and what’s on the board",
    fromLabel: "Career",
    updateLabel: "Update this note from Career",
    replacesHint: "This replaces your wording with the Career profile and board.",
  },
  "content-strategy": {
    id: "content-strategy",
    title: "Content strategy",
    purpose: "Working thesis and posting voice",
    fromLabel: "Content",
    updateLabel: "Update this note from Content",
    replacesHint: "This replaces your wording with the current Content strategy.",
  },
  decisions: {
    id: "decisions",
    title: "Decisions",
    purpose: "Durable choices and why they were made",
    fromLabel: "the decision ledger",
    updateLabel: "Update this note from the ledger",
    replacesHint: "This replaces your wording with the decision ledger on this page.",
  },
};

export type MemoryFreshnessKind = "current" | "behind" | "edited";

export type MemoryFreshness = {
  kind: MemoryFreshnessKind;
  label: string;
  detail: string;
  showUpdate: boolean;
};

export type PresentedMemoryNote = {
  id: string;
  title: string;
  purpose: string;
  body: string;
  source: string;
  updated_at: string;
  updatedShort: string;
  updatedLabel: string;
  fromLabel: string;
  updateLabel: string;
  replacesHint: string;
  current: boolean;
  showUpdate: boolean;
  statusKind: MemoryFreshnessKind | "local";
  statusLabel: string;
  statusDetail: string;
};

export function isMemoryNoteId(id: string): id is MemoryNoteId {
  return id in MEMORY_NOTES;
}

export function memoryNoteKind(id: string): MemoryNoteKind | undefined {
  return isMemoryNoteId(id) ? MEMORY_NOTES[id] : undefined;
}

export function memoryNoteOrder(id: string) {
  const index = MEMORY_NOTE_IDS.indexOf(id as MemoryNoteId);
  return index === -1 ? 99 : index;
}

export function memoryBodiesMatch(stored: string, live: string) {
  return stored.trim() === live.trim();
}

export function memoryNoteFreshness(input: {
  id: string;
  source: string;
  storedBody: string;
  liveBody?: string;
}): MemoryFreshness {
  const kind = memoryNoteKind(input.id);
  const from = kind?.fromLabel ?? "another view";
  const canRefresh = input.liveBody !== undefined;
  const current = canRefresh && memoryBodiesMatch(input.storedBody, input.liveBody ?? "");
  const edited = input.source === "edited";
  if (!canRefresh) {
    return {
      kind: edited ? "edited" : "current",
      label: edited ? "Your edits" : "Local note",
      detail: "This note is not rebuilt from another view.",
      showUpdate: false,
    };
  }
  if (current) {
    return {
      kind: "current",
      label: edited ? "Your edits" : "Current",
      detail: edited ? `Still matches ${from}` : `Matches ${from}`,
      showUpdate: false,
    };
  }
  if (edited) {
    return {
      kind: "edited",
      label: "Your edits",
      detail: `Behind ${from}`,
      showUpdate: true,
    };
  }
  return {
    kind: "behind",
    label: "Behind",
    detail: `Behind ${from}`,
    showUpdate: true,
  };
}

function kolkataDay(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function parseMemoryTimestamp(value: string) {
  const text = value.trim();
  if (!text) return null;
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text) ? `${text.replace(" ", "T")}Z` : text;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatMemoryUpdatedAt(value: string, now = new Date()) {
  const date = parseMemoryTimestamp(value);
  if (!date) return { short: "", long: "" };
  const today = kolkataDay(now);
  const then = kolkataDay(date);
  if (then === today) return { short: "Today", long: "Updated today" };
  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  if (then === kolkataDay(yesterdayDate)) return { short: "Yesterday", long: "Updated yesterday" };
  const pretty = new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Kolkata",
  }).format(date);
  return { short: pretty, long: `Updated ${pretty}` };
}

export function memoryDisplayBody(body: string, title: string) {
  const lines = body.replace(/^\uFEFF/, "").split("\n");
  const first = lines[0]?.trim() ?? "";
  if (first.toLowerCase() === `# ${title.trim().toLowerCase()}`) {
    return lines.slice(1).join("\n").replace(/^\n+/, "");
  }
  return body;
}

export function presentMemoryNote(
  row: { id?: unknown; title?: unknown; body?: unknown; source?: unknown; updated_at?: unknown },
  liveBody?: string,
): PresentedMemoryNote {
  const id = String(row.id ?? "");
  const kind = memoryNoteKind(id);
  const body = String(row.body ?? "");
  const source = String(row.source ?? "generated");
  const updatedAt = String(row.updated_at ?? "");
  const updated = formatMemoryUpdatedAt(updatedAt);
  const freshness = memoryNoteFreshness({ id, source, storedBody: body, liveBody });
  const fallbackTitle = String(row.title ?? "Note").replace(/\.md$/i, "");
  return {
    id,
    title: kind?.title ?? fallbackTitle,
    purpose: kind?.purpose ?? "Local operator note",
    body,
    source,
    updated_at: updatedAt,
    updatedShort: updated.short,
    updatedLabel: updated.long,
    fromLabel: kind?.fromLabel ?? "",
    updateLabel: kind?.updateLabel ?? "Update this note from another view",
    replacesHint: kind?.replacesHint ?? "This replaces your wording with the current view.",
    current: freshness.kind === "current",
    showUpdate: freshness.showUpdate,
    statusKind: liveBody === undefined && !kind ? "local" : freshness.kind,
    statusLabel: freshness.label,
    statusDetail: freshness.detail,
  };
}

export function sortMemoryNotes<T extends { id?: unknown }>(rows: T[]) {
  return [...rows].sort((left, right) => memoryNoteOrder(String(left.id ?? "")) - memoryNoteOrder(String(right.id ?? "")));
}
