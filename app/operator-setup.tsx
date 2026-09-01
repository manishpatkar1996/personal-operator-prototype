"use client";

import { EXAMPLE_GOALS_JSON, EXAMPLE_GOALS_PACK_NOTE, exportGoalsDump } from "@/lib/operator/goals-json";
import { FormEvent, useEffect, useState } from "react";

export type OnboardingState = {
  onboarded: boolean;
  workspaceKind: "demo" | "personal" | string;
  demoSeed: boolean;
  complete: boolean;
  checklist: { id: string; label: string; done: boolean; required?: boolean; status?: string }[];
  calendar?: { connected: boolean; status: string; detail: string };
  profile: {
    targetRoles: string[];
    locations: string[];
    workModes: string[];
    exclusions: string[];
    resumeFilename: string;
    resumeChars: number;
  };
  goals: { id: string; title: string; targetDate: string }[];
};

const list = (value: string[] | undefined) => (value ?? []).join(", ");
const split = (value: string) => value.split(",").map(item => item.trim()).filter(Boolean);

export function GoalsJsonPanel({
  existing,
  demo,
  embedded,
  onImported,
}: {
  existing?: Parameters<typeof exportGoalsDump>[0];
  demo?: boolean;
  embedded?: boolean;
  onImported: () => Promise<void>;
}) {
  const [draft, setDraft] = useState("");
  const [replaceAll, setReplaceAll] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadExample() {
    setDraft(EXAMPLE_GOALS_JSON);
    setMessage("Loaded the labeled example pack. It is a sample shape — not your goals.");
  }

  async function copyExample() {
    try {
      await navigator.clipboard.writeText(EXAMPLE_GOALS_JSON);
      setMessage("Example JSON copied.");
    } catch {
      setMessage("Copy failed — select the box and copy.");
    }
  }

  async function copyCurrent() {
    if (!existing?.length) return;
    const text = `${JSON.stringify(exportGoalsDump(existing), null, 2)}\n`;
    setDraft(text);
    try {
      await navigator.clipboard.writeText(text);
      setMessage("Current goals copied as JSON.");
    } catch {
      setMessage("Current goals are in the box — copy them from there.");
    }
  }

  async function importDump() {
    setBusy(true);
    setMessage("");
    try {
      const parsed = JSON.parse(draft) as unknown;
      const response = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "import", data: parsed, replaceAll }),
      });
      const result = await response.json() as { created?: number; skipped?: number; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not import goals");
      setMessage(`Imported ${result.created ?? 0} goal${(result.created ?? 0) === 1 ? "" : "s"}${result.skipped ? ` · skipped ${result.skipped} already present` : ""}.`);
      setBusy(false);
      await onImported();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not import goals");
      setBusy(false);
    }
  }

  const hint = <p>{EXAMPLE_GOALS_PACK_NOTE} Dates can be YYYY-MM-DD or DD/MM/YYYY. Priority can be High / Medium / Low.</p>;
  const copyActions = <div className="actions">
    <button type="button" onClick={() => void loadExample()}>Load example pack</button>
    <button type="button" onClick={() => void copyExample()}>Copy example</button>
    {existing && existing.length > 0 && <button type="button" onClick={() => void copyCurrent()}>Copy mine</button>}
  </div>;
  const fields = <>
    <label>JSON<textarea value={draft} onChange={event => setDraft(event.target.value)} spellCheck={false} rows={embedded ? 12 : 14} /></label>
    <label className="check-row"><input type="checkbox" checked={replaceAll} onChange={event => setReplaceAll(event.target.checked)} /> Replace all existing goals{demo ? " (sample goals are replaced on import anyway)" : ""}</label>
    <div className={embedded ? "drawer-actions" : "actions"}><button type="button" className="primary" disabled={busy} onClick={() => void importDump()}>{busy ? "Importing…" : "Import JSON"}</button>{message && <small className="config-message">{message}</small>}</div>
  </>;

  if (embedded) return <div className="goals-json goals-json-embedded">{hint}{copyActions}{fields}</div>;

  return <article className="box goals-json">
    <div className="between">
      <div>
        <span className="label">GOALS JSON</span>
        <h2>Dump or paste a pack</h2>
        {hint}
      </div>
      {copyActions}
    </div>
    {fields}
  </article>;
}

export function OperatorSetup({ onSaved }: { onSaved: () => Promise<void> }) {
  const [state, setState] = useState<OnboardingState | null>(null);
  const [roles, setRoles] = useState("");
  const [locations, setLocations] = useState("");
  const [modes, setModes] = useState("");
  const [exclusions, setExclusions] = useState("");
  const [resumeText, setResumeText] = useState("");
  const [resumeFilename, setResumeFilename] = useState("");
  const [timezone, setTimezone] = useState(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata"; }
    catch { return "Asia/Kolkata"; }
  });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [icsUrl, setIcsUrl] = useState("");
  const [calendarLater, setCalendarLater] = useState(false);
  const [calendarMessage, setCalendarMessage] = useState("");

  async function load() {
    const [setupResponse, careerResponse] = await Promise.all([
      fetch("/api/onboarding"),
      fetch("/api/career/profile"),
    ]);
    const setup = await setupResponse.json() as OnboardingState;
    const career = await careerResponse.json() as { profile?: Record<string, unknown> };
    setState(setup);
    setRoles(list(setup.profile.targetRoles));
    setLocations(list(setup.profile.locations));
    setModes(list(setup.profile.workModes));
    setExclusions(list(setup.profile.exclusions));
    setResumeFilename(setup.profile.resumeFilename);
    setResumeText(String(career.profile?.resumeText ?? ""));
  }

  useEffect(() => { void load(); }, []);

  async function uploadPdf(file: File | undefined) {
    if (!file) return;
    setBusy("Reading résumé…");
    const body = new FormData();
    body.set("file", file);
    const response = await fetch("/api/career/resume", { method: "POST", body });
    const result = await response.json() as { profile?: { resumeText?: string; resumeFilename?: string }; error?: string };
    setBusy("");
    if (!response.ok || !result.profile) { setMessage(result.error ?? "Could not read that PDF."); return; }
    setResumeText(String(result.profile.resumeText ?? ""));
    setResumeFilename(String(result.profile.resumeFilename ?? file.name));
    setMessage(`${file.name} extracted. Save setup to keep it.`);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy("Saving…");
    setMessage("");
    const response = await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetRoles: split(roles),
        locations: split(locations),
        workModes: split(modes),
        exclusions: split(exclusions),
        resumeText,
        resumeFilename,
        timezone,
        replaceSample: state?.workspaceKind !== "personal",
      }),
    });
    const result = await response.json() as OnboardingState & { error?: string };
    setBusy("");
    if (!response.ok) { setMessage(result.error ?? "Could not save setup"); return; }
    setState(result);
    setMessage("This operator is yours. Add a goal from Goals, or paste a JSON pack from + Add goal.");
    await onSaved();
  }

  async function connectCalendar(event: FormEvent) {
    event.preventDefault();
    if (!icsUrl.trim()) return;
    setBusy("Connecting calendar…");
    setCalendarMessage("");
    try {
      const response = await fetch("/api/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "connect_calendar_ics", data: { icsUrl: icsUrl.trim() } }),
      });
      const result = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not connect calendar");
      setIcsUrl("");
      setCalendarLater(false);
      setCalendarMessage(result.message ?? "Google read is live.");
      await load();
      await onSaved();
    } catch (error) {
      setCalendarMessage(error instanceof Error ? error.message : "Could not connect calendar");
    }
    setBusy("");
  }

  async function skip() {
    await fetch("/api/onboarding", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ skip: true }) });
    await onSaved();
    await load();
  }

  async function reset(mode: "empty" | "demo") {
    if (mode === "empty" && !window.confirm("Clear résumé, goals, jobs, and sample items? The app stays local on this machine.")) return;
    if (mode === "demo" && !window.confirm("Restore the sample operator? Your current goals and résumé on this machine will be deleted.")) return;
    setBusy("Resetting…");
    const response = await fetch("/api/onboarding", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reset: mode }) });
    setBusy("");
    if (!response.ok) { setMessage("Reset failed"); return; }
    await onSaved();
    await load();
    setMessage(mode === "demo" ? "Sample operator restored." : "Blank operator. Add a résumé on You. Sample jobs, goals, and voice were not re-seeded.");
  }

  if (!state) return <article className="box"><p>Loading setup…</p></article>;

  const calendar = state.calendar ?? { connected: false, status: "Not connected", detail: "Optional. Paste a secret iCal URL — not the public HTML link. Does not block Save context." };

  return <>
    <header className="page-heading">
      <div>
        <span className="eyebrow">Your operator</span>
        <h1>{state.onboarded ? "Update what this machine knows about you" : "Make this operator yours"}</h1>
        <p className="lede">Résumé, filters, and goals live on this computer. Connect Google Calendar here if you want Today to read your meetings. Sample data is only a walkthrough — replace it here. Nothing is hosted.</p>
      </div>
      {!state.onboarded && <button type="button" className="link" onClick={() => void skip()}>Skip for now · keep sample, labeled</button>}
    </header>
    <ul className="setup-checks">{state.checklist.map(item => <li key={item.id} className={item.done ? "done" : ""}>{item.status ?? (item.done ? "Ready" : "Needed")} · {item.label}</li>)}</ul>
    {state.workspaceKind === "demo" && <p className="config-message">You are looking at a labeled sample pack. Save context replaces sample jobs and voice. JSON paste lives under Goals → + Add goal.</p>}
    <form className="box operator-setup" onSubmit={event => void save(event)}>
      <div className="between"><div><span className="label">YOU</span><h2>Résumé and filters</h2><p>This is the résumé path. Career can edit filters later. PDF or paste.</p></div><button className="primary" disabled={Boolean(busy)}>{busy || "Save context"}</button></div>
      <div className="onboarding-grid">
        <label>Target roles<input value={roles} onChange={event => setRoles(event.target.value)} placeholder="Senior Product Manager, Product Lead AI" /></label>
        <label>Locations<input value={locations} onChange={event => setLocations(event.target.value)} placeholder="Chennai, Bengaluru, Remote India" /></label>
        <label>Work modes<input value={modes} onChange={event => setModes(event.target.value)} placeholder="Remote, Hybrid" /></label>
        <label>Skip / exclude<input value={exclusions} onChange={event => setExclusions(event.target.value)} placeholder="Account Executive, quota sales" /></label>
        <label>Timezone<input value={timezone} onChange={event => setTimezone(event.target.value)} placeholder="America/Los_Angeles" /></label>
      </div>
      <label>Résumé PDF<input type="file" accept=".pdf,.txt,.md,.tex" onChange={event => void uploadPdf(event.target.files?.[0])} /></label>
      {resumeFilename && <small>{resumeFilename}{state.profile.resumeChars ? ` · ${state.profile.resumeChars} characters stored` : ""}</small>}
      <label>Or paste résumé text<textarea value={resumeText} onChange={event => setResumeText(event.target.value)} rows={8} placeholder="Paste the résumé you want scoring to use." /></label>
      {message && <small className="config-message">{message}</small>}
    </form>
    <article className="box setup-calendar">
      <div className="between">
        <div>
          <span className="label">CALENDAR</span>
          <h2>Connect Google Calendar</h2>
          <p>Read-only. In Google Calendar: Settings → your calendar → Integrate calendar → Secret address in iCal format. Paste that secret iCal URL — not the public HTML link. Writes stay queued in the app.</p>
        </div>
        <div className={`connector ${calendar.connected ? "connected" : "not_connected"}`}>
          <span>Google Calendar</span>
          <b>{calendar.status}</b>
          <small>{calendar.detail}</small>
        </div>
      </div>
      {calendarLater && !calendar.connected
        ? <p>Skipped for now. Save context still works. Paste the secret iCal URL here later, or on Today → Calendar controls.</p>
        : <form className="ics-connect" onSubmit={event => void connectCalendar(event)}>
            <label>Secret iCal URL<input type="url" value={icsUrl} onChange={event => setIcsUrl(event.target.value)} placeholder={calendar.connected ? "Saved. Paste a new URL to replace it." : "https://calendar.google.com/calendar/ical/…/basic.ics"} /></label>
            <div className="actions">
              <button className="primary" disabled={Boolean(busy) || !icsUrl.trim()}>{calendar.connected ? "Replace feed" : "Connect"}</button>
              {!calendar.connected && <button type="button" onClick={() => setCalendarLater(true)}>{"I'll do this later"}</button>}
            </div>
          </form>}
      {calendarMessage && <small className="config-message">{calendarMessage}</small>}
    </article>
    <article className="box">
      <span className="label">GOALS</span>
      <h2>Add a goal next</h2>
      <p>JSON paste lives under Goals → + Add goal → Paste JSON pack. The example pack is a sample shape — not your goals.</p>
    </article>
    <article className="box">
      <span className="label">RESET</span>
      <h2>Start this machine over</h2>
      <p>Does not affect GitHub. Only the local SQLite on this laptop.</p>
      <div className="actions">
        <button type="button" onClick={() => void reset("empty")}>Clear and start empty</button>
        <button type="button" onClick={() => void reset("demo")}>Restore sample operator</button>
      </div>
    </article>
  </>;
}
