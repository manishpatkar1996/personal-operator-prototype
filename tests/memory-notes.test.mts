import assert from "node:assert/strict";
import test from "node:test";
import {
  MEMORY_NOTES,
  formatMemoryUpdatedAt,
  memoryDisplayBody,
  memoryNoteFreshness,
  presentMemoryNote,
  sortMemoryNotes,
} from "../lib/operator/memory-notes.ts";

test("Memory notes are named views, not CMS files or live-state jargon", () => {
  assert.equal(MEMORY_NOTES.goals.updateLabel, "Update this note from Goals");
  assert.equal(MEMORY_NOTES.career.updateLabel, "Update this note from Career");
  assert.equal(MEMORY_NOTES["content-strategy"].updateLabel, "Update this note from Content");
  assert.equal(MEMORY_NOTES.decisions.updateLabel, "Update this note from the ledger");
  for (const note of Object.values(MEMORY_NOTES)) {
    assert.doesNotMatch(note.title, /\.md$/i);
    assert.doesNotMatch(note.updateLabel, /live state|refresh|snapshot/i);
    assert.doesNotMatch(note.replacesHint, /cloud|sync/i);
  }
});

test("Update is hidden when the note already matches the live view", () => {
  const live = "# Goals\n\nShip the operator.";
  const current = memoryNoteFreshness({ id: "goals", source: "generated", storedBody: live, liveBody: live });
  assert.equal(current.showUpdate, false);
  assert.equal(current.label, "Current");
  assert.match(current.detail, /Goals/);
});

test("Behind and edited notes offer a named update, not a refresh", () => {
  const live = "# Career\n\nTarget roles: PM";
  const behind = memoryNoteFreshness({ id: "career", source: "generated", storedBody: "# Career\n\nOld", liveBody: live });
  assert.equal(behind.showUpdate, true);
  assert.equal(behind.kind, "behind");
  assert.equal(behind.detail, "Behind Career");
  const edited = memoryNoteFreshness({ id: "career", source: "edited", storedBody: "My wording", liveBody: live });
  assert.equal(edited.showUpdate, true);
  assert.equal(edited.label, "Your edits");
  assert.equal(edited.detail, "Behind Career");
});

test("Notes that cannot be rebuilt stay local and hide update", () => {
  const local = memoryNoteFreshness({ id: "scratch", source: "edited", storedBody: "Keep this" });
  assert.equal(local.showUpdate, false);
  assert.equal(local.label, "Your edits");
});

test("Reader drops a duplicate title heading and keeps real content headings", () => {
  assert.equal(memoryDisplayBody("# Goals\n\nNo goals yet.", "Goals"), "No goals yet.");
  assert.equal(memoryDisplayBody("# Ship the operator\n\nProgress: 40%", "Goals"), "# Ship the operator\n\nProgress: 40%");
});

test("Presented notes sort in operator order and keep human titles", () => {
  const rows = sortMemoryNotes([
    { id: "decisions", title: "decisions.md", body: "Old", source: "generated", updated_at: "2026-08-30 08:00:00" },
    { id: "goals", title: "goals.md", body: "# Goals\n\nLive", source: "generated", updated_at: "2026-09-01 04:00:00" },
    { id: "career", title: "career.md", body: "Mine", source: "edited", updated_at: "2026-08-31 08:00:00" },
  ]);
  assert.deepEqual(rows.map(item => item.id), ["goals", "career", "decisions"]);
  const presented = presentMemoryNote(rows[1], "# Career\n\nBoard");
  assert.equal(presented.title, "Career");
  assert.equal(presented.showUpdate, true);
  assert.equal(presented.updateLabel, "Update this note from Career");
  const stamp = formatMemoryUpdatedAt("2026-09-01 06:00:00", new Date("2026-09-01T12:00:00+05:30"));
  assert.equal(stamp.short, "Today");
  assert.equal(stamp.long, "Updated today");
});
