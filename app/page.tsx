"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type View = "Today" | "Goals" | "Career" | "Learning" | "Startup Lab" | "Content" | "Memory" | "Small Council";
type GoalState = "active" | "paused" | "completed" | "archived";
type MilestoneStatus = "not_started" | "ready" | "active" | "blocked" | "achieved" | "skipped";

type Milestone = {
  id: string;
  goalId: string;
  title: string;
  completionRule: string;
  targetDate: string;
  weight: number;
  completionPercentage: number;
  status: MilestoneStatus;
  position: number;
};

type Goal = {
  id: string;
  title: string;
  desiredOutcome: string;
  successCriteria: string;
  targetDate: string;
  priority: number;
  state: GoalState;
  progressPercentage: number;
  forecast: string;
  milestones: Milestone[];
};

type GoalDraft = Omit<Goal, "id" | "progressPercentage" | "forecast" | "milestones">;
type NewMilestone = Omit<Milestone, "id" | "goalId">;
type WorkspaceData = {
  decisions: Record<string, unknown>[]; calendar: Record<string, unknown>[]; calendarPreferences: Record<string, unknown>[]; calendarWriteRequests: Record<string, unknown>[]; emailSignals: Record<string, unknown>[]; jobs: Record<string, unknown>[];
  tracks: Record<string, unknown>[]; learningItems: Record<string, unknown>[]; startupIdeas: Record<string, unknown>[];
  contentIdeas: Record<string, unknown>[]; councilRoles: Record<string, unknown>[]; councilProposals: Record<string, unknown>[];
  planningNotes: Record<string, unknown>[]; connectors: Record<string, unknown>[];
};

const today = new Date().toISOString().slice(0, 10);

function addDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${value}T00:00:00`));
}

function statusLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase());
}

async function apiRequest(method: string, body?: unknown, suffix = "") {
  const response = await fetch(`/api/goals${suffix}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json() as { error?: string; id?: string; goals?: Goal[] };
  if (!response.ok) throw new Error(result.error ?? "The change could not be saved");
  return result;
}

async function workspaceRequest(action?: string, data?: Record<string, unknown>) {
  const response = await fetch("/api/workspace", action ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, data }) } : undefined);
  const result = await response.json() as WorkspaceData & { error?: string; message?: string };
  if (!response.ok) throw new Error(result.error ?? "The workspace could not be updated");
  return result;
}

function Heading({ eyebrow, title, copy, action }: { eyebrow: string; title: string; copy: string; action?: React.ReactNode }) {
  return <header className="page-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p className="lede">{copy}</p></div>{action}</header>;
}

function ProgressBar({ value }: { value: number }) {
  return <div className="progress" aria-label={`${value}% complete`}><span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>;
}

function GoalList({ goals, selectedId, select }: { goals: Goal[]; selectedId?: string; select: (id: string) => void }) {
  const groups: { label: string; states: GoalState[] }[] = [
    { label: "In motion", states: ["active"] },
    { label: "Paused", states: ["paused"] },
    { label: "Completed", states: ["completed"] },
  ];
  return <aside className="goal-sidebar">
    {groups.map(group => {
      const items = goals.filter(goal => group.states.includes(goal.state));
      if (!items.length) return null;
      return <section key={group.label}><span className="label">{group.label} · {items.length}</span><div className="goal-picker">{items.map(goal => {
        const next = goal.milestones.find(milestone => milestone.completionPercentage < 100 && milestone.status !== "skipped");
        return <button key={goal.id} className={selectedId === goal.id ? "selected" : ""} onClick={() => select(goal.id)}>
          <span className="goal-picker-top"><strong>{goal.title}</strong><b>{goal.progressPercentage}%</b></span>
          <span className="mini-progress"><i style={{ width: `${goal.progressPercentage}%` }} /></span>
          <small>{next ? `Next: ${next.title} · ${formatDate(next.targetDate)}` : "No open milestone"}</small>
        </button>;
      })}</div></section>;
    })}
  </aside>;
}

function GoalForm({ close, created }: { close: () => void; created: (id: string) => void }) {
  const [goal, setGoal] = useState<GoalDraft>({ title: "", desiredOutcome: "", successCriteria: "", targetDate: addDays(90), priority: 3, state: "active" });
  const [milestones, setMilestones] = useState<NewMilestone[]>([{ title: "", completionRule: "", targetDate: addDays(30), weight: 1, completionPercentage: 0, status: "not_started", position: 0 }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const changeMilestone = (index: number, changes: Partial<NewMilestone>) => setMilestones(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item));

  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      if (!milestones.length || milestones.some(item => !item.title.trim() || !item.completionRule.trim() || !item.targetDate)) throw new Error("Each milestone needs a title, completion rule, and date");
      const result = await apiRequest("POST", { data: { ...goal, milestones: milestones.map((item, position) => ({ ...item, position })) } });
      created(String(result.id));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not create the goal"); setSaving(false); }
  }

  return <div className="drawer-backdrop" role="presentation"><form className="drawer" onSubmit={submit}>
    <div className="drawer-head"><div><span className="eyebrow">New goal</span><h2>Define the outcome</h2></div><button type="button" className="icon-button" onClick={close} aria-label="Close">×</button></div>
    <label>Goal title<input required value={goal.title} onChange={event => setGoal({ ...goal, title: event.target.value })} placeholder="Land a high-agency AI product role" /></label>
    <label>Desired outcome<textarea required value={goal.desiredOutcome} onChange={event => setGoal({ ...goal, desiredOutcome: event.target.value })} placeholder="What should be different when this is complete?" /></label>
    <label>Success criteria<textarea required value={goal.successCriteria} onChange={event => setGoal({ ...goal, successCriteria: event.target.value })} placeholder="What evidence will prove the goal is achieved?" /></label>
    <div className="field-row"><label>Target date<input required min={today} type="date" value={goal.targetDate} onChange={event => setGoal({ ...goal, targetDate: event.target.value })} /></label><label>Priority<select value={goal.priority} onChange={event => setGoal({ ...goal, priority: Number(event.target.value) })}>{[5,4,3,2,1].map(value => <option key={value} value={value}>{value} — {value === 5 ? "Highest" : value === 1 ? "Lowest" : ""}</option>)}</select></label></div>
    <div className="form-divider"><span className="label">DATED MILESTONES</span><button type="button" className="link" onClick={() => setMilestones(current => [...current, { title: "", completionRule: "", targetDate: goal.targetDate, weight: 1, completionPercentage: 0, status: "not_started", position: current.length }])}>+ Add milestone</button></div>
    {milestones.map((milestone, index) => <div className="new-milestone" key={index}>
      <div className="milestone-number">{index + 1}</div><div className="new-milestone-fields"><label>Milestone<input required value={milestone.title} onChange={event => changeMilestone(index, { title: event.target.value })} placeholder="A concrete intermediate outcome" /></label><label>Completion rule<input required value={milestone.completionRule} onChange={event => changeMilestone(index, { completionRule: event.target.value })} placeholder="What proves this milestone is complete?" /></label><div className="field-row"><label>Target date<input required type="date" value={milestone.targetDate} onChange={event => changeMilestone(index, { targetDate: event.target.value })} /></label><label>Weight<input required min="1" max="100" type="number" value={milestone.weight} onChange={event => changeMilestone(index, { weight: Number(event.target.value) })} /></label></div></div>{milestones.length > 1 && <button type="button" className="icon-button" onClick={() => setMilestones(current => current.filter((_, itemIndex) => itemIndex !== index))} aria-label="Remove milestone">×</button>}
    </div>)}
    {error && <p className="form-error">{error}</p>}
    <div className="drawer-actions"><button type="button" onClick={close}>Cancel</button><button className="primary" disabled={saving}>{saving ? "Creating…" : "Create goal"}</button></div>
  </form></div>;
}

function GoalContract({ goal, changed }: { goal: Goal; changed: () => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<GoalDraft>(goal);
  const [saving, setSaving] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault(); setSaving(true);
    try { await apiRequest("PATCH", { kind: "goal", data: { ...draft, id: goal.id } }); await changed(); setEditing(false); }
    finally { setSaving(false); }
  }

  async function togglePause() {
    setSaving(true);
    try { await apiRequest("PATCH", { kind: "goal", data: { ...goal, state: goal.state === "paused" ? "active" : "paused" } }); await changed(); }
    finally { setSaving(false); }
  }

  if (editing) return <form className="box contract-form" onSubmit={save}>
    <div className="between"><span className="label">EDIT GOAL CONTRACT</span><button type="button" className="icon-button" onClick={() => setEditing(false)}>×</button></div>
    <label>Goal title<input required value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} /></label>
    <label>Desired outcome<textarea required value={draft.desiredOutcome} onChange={event => setDraft({ ...draft, desiredOutcome: event.target.value })} /></label>
    <label>Success criteria<textarea required value={draft.successCriteria} onChange={event => setDraft({ ...draft, successCriteria: event.target.value })} /></label>
    <div className="field-row"><label>Target date<input required type="date" value={draft.targetDate} onChange={event => setDraft({ ...draft, targetDate: event.target.value })} /></label><label>Priority<select value={draft.priority} onChange={event => setDraft({ ...draft, priority: Number(event.target.value) })}>{[5,4,3,2,1].map(value => <option key={value}>{value}</option>)}</select></label><label>Status<select value={draft.state} onChange={event => setDraft({ ...draft, state: event.target.value as GoalState })}><option value="active">Active</option><option value="paused">Paused</option><option value="completed">Completed</option><option value="archived">Archived</option></select></label></div>
    <div className="actions"><button className="primary" disabled={saving}>{saving ? "Saving…" : "Save contract"}</button><button type="button" onClick={() => setEditing(false)}>Cancel</button></div>
  </form>;

  const next = goal.milestones.find(milestone => milestone.completionPercentage < 100 && milestone.status !== "skipped");
  return <article className="box goal-contract">
    <div className="between"><div><span className={`pill ${goal.state}`}>{statusLabel(goal.state)} · Priority {goal.priority}</span><h2>{goal.title}</h2><p>{goal.desiredOutcome}</p></div><div className="actions"><button onClick={() => setEditing(true)}>Edit contract</button><button disabled={saving} onClick={togglePause}>{goal.state === "paused" ? "Resume" : "Pause"}</button></div></div>
    <ProgressBar value={goal.progressPercentage} />
    <div className="goal-summary"><p><strong>{goal.progressPercentage}%</strong><small>weighted progress</small></p><p><strong>{formatDate(goal.targetDate)}</strong><small>goal target</small></p><p><strong>{next ? formatDate(next.targetDate) : "—"}</strong><small>next milestone</small></p><p><strong className={goal.forecast === "Behind" ? "danger" : ""}>{goal.forecast}</strong><small>forecast</small></p></div>
    <div className="success-rule"><span className="label">SUCCESS CRITERIA</span><p>{goal.successCriteria}</p></div>
  </article>;
}

function MilestoneEditor({ milestone, saved, removed }: { milestone: Milestone; saved: () => void; removed: () => void }) {
  const [draft, setDraft] = useState(milestone);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const overdue = milestone.targetDate < today && milestone.completionPercentage < 100;

  async function save() {
    setSaving(true);
    try { await apiRequest("PATCH", { kind: "milestone", data: draft }); await saved(); setEditing(false); }
    finally { setSaving(false); }
  }
  async function remove() {
    if (!window.confirm(`Remove “${milestone.title}”?`)) return;
    setSaving(true);
    try { await apiRequest("DELETE", undefined, `?id=${encodeURIComponent(milestone.id)}`); await removed(); }
    finally { setSaving(false); }
  }

  if (editing) return <div className="milestone-edit">
    <label>Milestone<input value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} /></label>
    <label>Completion rule<input value={draft.completionRule} onChange={event => setDraft({ ...draft, completionRule: event.target.value })} /></label>
    <div className="field-row four"><label>Target date<input type="date" value={draft.targetDate} onChange={event => setDraft({ ...draft, targetDate: event.target.value })} /></label><label>Weight<input min="1" max="100" type="number" value={draft.weight} onChange={event => setDraft({ ...draft, weight: Number(event.target.value) })} /></label><label>Status<select value={draft.status} onChange={event => setDraft({ ...draft, status: event.target.value as MilestoneStatus })}>{["not_started","ready","active","blocked","achieved","skipped"].map(status => <option value={status} key={status}>{statusLabel(status)}</option>)}</select></label><label>Progress<input min="0" max="100" type="number" value={draft.completionPercentage} onChange={event => { const value = Number(event.target.value); setDraft({ ...draft, completionPercentage: value, status: value === 100 ? "achieved" : draft.status === "achieved" ? "active" : draft.status }); }} /></label></div>
    <div className="actions"><button className="primary" disabled={saving || !draft.title.trim() || !draft.completionRule.trim()} onClick={save}>{saving ? "Saving…" : "Save milestone"}</button><button disabled={saving} onClick={() => setEditing(false)}>Cancel</button><button disabled={saving} className="danger-button" onClick={remove}>Remove</button></div>
  </div>;

  return <div className="milestone-view">
    <div className={`milestone-marker ${milestone.status === "achieved" ? "done" : milestone.status === "active" ? "current" : ""}`}>{milestone.status === "achieved" ? "✓" : milestone.position + 1}</div>
    <div><div className="milestone-title"><strong>{milestone.title}</strong><span className={`state-chip ${overdue ? "overdue" : ""}`}>{overdue ? "Overdue" : statusLabel(milestone.status)}</span></div><p>{milestone.completionRule}</p><small>Due {formatDate(milestone.targetDate)} · Weight {milestone.weight}</small></div>
    <div className="milestone-progress"><strong>{milestone.completionPercentage}%</strong><ProgressBar value={milestone.completionPercentage} /><button className="link" onClick={() => setEditing(true)}>Edit</button></div>
  </div>;
}

function AddMilestone({ goal, saved, close }: { goal: Goal; saved: () => void; close: () => void }) {
  const [draft, setDraft] = useState<NewMilestone>({ title: "", completionRule: "", targetDate: goal.targetDate, weight: 1, completionPercentage: 0, status: "not_started", position: goal.milestones.length });
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true);
    try { await apiRequest("POST", { kind: "milestone", data: { ...draft, goalId: goal.id } }); await saved(); close(); }
    finally { setSaving(false); }
  }
  return <form className="milestone-add" onSubmit={submit}><span className="label">NEW MILESTONE</span><label>Milestone<input required value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} placeholder="Concrete intermediate outcome" /></label><label>Completion rule<input required value={draft.completionRule} onChange={event => setDraft({ ...draft, completionRule: event.target.value })} placeholder="Evidence required for 100%" /></label><div className="field-row"><label>Target date<input required type="date" value={draft.targetDate} onChange={event => setDraft({ ...draft, targetDate: event.target.value })} /></label><label>Weight<input required min="1" max="100" type="number" value={draft.weight} onChange={event => setDraft({ ...draft, weight: Number(event.target.value) })} /></label></div><div className="actions"><button className="primary" disabled={saving}>{saving ? "Adding…" : "Add milestone"}</button><button type="button" onClick={close}>Cancel</button></div></form>;
}

function GoalsPage({ goals, selectedId, select, refresh, addGoal }: { goals: Goal[]; selectedId?: string; select: (id: string) => void; refresh: () => Promise<void>; addGoal: () => void }) {
  const [addingMilestone, setAddingMilestone] = useState(false);
  const selected = goals.find(goal => goal.id === selectedId) ?? goals[0];

  return <>
    <Heading eyebrow={`${goals.filter(goal => goal.state === "active").length} active goals`} title="Goals and milestones" copy="Every goal has dated milestones. Progress is the weighted percentage of those milestones—not a count of activity." action={<button className="primary" onClick={addGoal}>+ Add goal</button>} />
    {!selected ? <article className="box empty"><h2>No goals yet</h2><p>Create your first outcome and define how you will know it is achieved.</p><button className="primary" onClick={addGoal}>Create a goal</button></article> : <div className="goals-layout"><GoalList goals={goals} selectedId={selected.id} select={id => { setAddingMilestone(false); select(id); }} /><div className="goal-detail"><GoalContract key={selected.id} goal={selected} changed={refresh} /><article className="box milestone-panel"><div className="between"><div><span className="label">MILESTONES · {selected.milestones.length}</span><h2>Dated outcomes</h2></div><button onClick={() => setAddingMilestone(true)}>+ Add milestone</button></div><div className="milestone-table">{selected.milestones.map(milestone => <MilestoneEditor key={`${milestone.id}-${milestone.completionPercentage}-${milestone.status}-${milestone.targetDate}-${milestone.weight}`} milestone={milestone} saved={refresh} removed={refresh} />)}</div>{addingMilestone && <AddMilestone goal={selected} saved={refresh} close={() => setAddingMilestone(false)} />}{!selected.milestones.length && !addingMilestone && <p className="empty-line">This goal needs at least one dated milestone before it can be planned.</p>}</article></div></div>}
  </>;
}

function Connector({ data, id }: { data: WorkspaceData; id: string }) {
  const connector = data.connectors.find(item => item.id === id);
  if (!connector) return null;
  return <div className={`connector ${connector.status}`}><span>{String(connector.name)}</span><b>{statusLabel(String(connector.status))}</b><small>{String(connector.detail)}</small></div>;
}

type PlanPriority = { id: string; rank: number; domain: string; title: string; reason: string; estimatedMinutes: number; confidence: number; dueDate?: string };
type PlanSignal = { id: string; category: string; domain: string; title: string; detail: string };
type PlanPayload = {
  plan?: { summary: string; generation?: { mode: string; provider?: string; fallbackReason?: string }; priorities?: PlanPriority[]; signals?: PlanSignal[] };
  model?: { status: string; provider?: string; reason?: string };
};

function TodayPage({ goals, data, mutate, refresh }: { goals: Goal[]; data: WorkspaceData; mutate: (action: string, payload?: Record<string, unknown>) => Promise<void>; refresh: () => Promise<void> }) {
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [listening, setListening] = useState(false);
  const [planPayload, setPlanPayload] = useState<PlanPayload | null>(null);
  const candidates = goals.flatMap(goal => goal.milestones.map(milestone => ({ goal, milestone, score: goal.priority * 10 + Math.max(0, 20 - Math.ceil((new Date(milestone.targetDate).getTime() - Date.now()) / 86_400_000)) + (100 - milestone.completionPercentage) / 10 }))).filter(item => item.goal.state === "active" && item.milestone.completionPercentage < 100 && item.milestone.status !== "skipped").sort((a, b) => b.score - a.score).slice(0, 3);
  const planPriorities = planPayload?.plan?.priorities ?? [];
  const minuteTotal = planPriorities.reduce((sum, item) => sum + item.estimatedMinutes, 0) || 1;
  const rawAllocations = planPriorities.map(item => Math.round(item.estimatedMinutes / minuteTotal * 100));
  const priorAllocation = rawAllocations.slice(0, -1).reduce((sum, value) => sum + value, 0);
  const priorities = planPriorities.map((item, index) => ({ ...item, allocation: index === planPriorities.length - 1 ? 100 - priorAllocation : rawAllocations[index] }));
  const calendar = data.calendar.filter(item => String(item.start_at).slice(0, 10) === today);
  const calendarMinutes = calendar.reduce((total, item) => total + Math.max(0, (new Date(String(item.end_at)).getTime() - new Date(String(item.start_at)).getTime()) / 60_000), 0);
  const calendarHours = `${Math.floor(calendarMinutes / 60)}h ${Math.round(calendarMinutes % 60)}m`;
  const calendarConnected = data.connectors.some(item => item.id === "google-calendar" && item.status === "connected");
  const dateHeading = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" }).format(new Date());
  const initialFocusStart = () => { const value = new Date(Date.now() + 86_400_000); value.setHours(10, 0, 0, 0); return new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); };
  const [focusMilestoneId, setFocusMilestoneId] = useState(candidates[0]?.milestone.id ?? "");
  const [focusTitle, setFocusTitle] = useState(candidates[0]?.milestone.title ?? "Goal focus block");
  const [focusStart, setFocusStart] = useState(initialFocusStart);
  const [focusDuration, setFocusDuration] = useState(45);
  const preference = data.calendarPreferences[0];
  const calendarPolicy = String(preference?.policy ?? "propose_only");
  const openCalendarBlocks = data.calendar.filter(item => ["proposed", "approved_pending", "write_failed"].includes(String(item.state)));
  const pendingWrites = data.calendarWriteRequests.filter(item => item.status === "approved_pending").length;
  const openEmailSignals = data.emailSignals.filter(item => item.status === "open");
  const generation = planPayload?.plan?.generation?.mode === "model" ? "Live model" : planPayload?.model?.status === "fallback" ? "Fallback rules" : "Local rules";

  useEffect(() => {
    void fetch("/api/operator/plan").then(response => response.json()).then((payload: PlanPayload) => setPlanPayload(payload));
  }, [goals, data]);

  async function scheduleTopRole() {
    const response = await fetch("/api/career/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scheduleTop: true }) });
    const result = await response.json() as { message?: string; error?: string };
    setMessage(result.message ?? result.error ?? "Could not propose a block");
    await refresh();
  }

  function startVoice() {
    const speechWindow = window as unknown as { webkitSpeechRecognition?: new () => { lang: string; interimResults: boolean; start(): void; onresult: (event: { results: { 0: { 0: { transcript: string } } }[] }) => void; onerror: () => void; onend: () => void } };
    if (!speechWindow.webkitSpeechRecognition) { setMessage("Voice recognition is not available in this browser. You can type the note instead."); return; }
    const recognition = new speechWindow.webkitSpeechRecognition(); recognition.lang = "en-IN"; recognition.interimResults = false; setListening(true);
    recognition.onresult = event => setNote(current => `${current}${current ? " " : ""}${event.results[0][0].transcript}`);
    recognition.onerror = () => setMessage("Voice capture stopped before a transcript was available.");
    recognition.onend = () => setListening(false); recognition.start();
  }
  async function submit(event: FormEvent) { event.preventDefault(); if (!note.trim()) return; await mutate("planning_note", { note }); setMessage("Plan updated: a flexible block was proposed and the note was stored."); setNote(""); }
  async function submitFocus(event: FormEvent) {
    event.preventDefault();
    const candidate = candidates.find(item => item.milestone.id === focusMilestoneId) ?? candidates[0];
    const start = new Date(focusStart);
    const end = new Date(start.getTime() + focusDuration * 60_000);
    await mutate("propose_calendar_block", { title: focusTitle, goalId: candidate?.goal.id, milestoneId: candidate?.milestone.id, startAt: start.toISOString(), endAt: end.toISOString() });
  }

  return <><Heading eyebrow={dateHeading} title="Today, in service of your goals" copy="The Operator combines milestone urgency with scored roles and calendar constraints before recommending where your attention should go." action={<div className="actions"><button onClick={() => void scheduleTopRole()}>Propose application block</button><button onClick={() => mutate("request_calendar_sync")}>Request refresh</button></div>} />
    <div className="today-summary box"><div><span className="label">RECOMMENDED SHAPE · {generation}</span><h2>{planPayload?.plan?.summary ?? "Loading today’s plan…"}</h2><p>{calendarConnected ? `Google Calendar is connected. Today currently has ${calendar.length} blocks covering ${calendarHours}.` : "Connect Google Calendar to replace the local sample plan with your real commitments."}{planPayload?.model?.reason ? ` ${planPayload.model.reason}` : ""}</p></div><div className="allocation-total"><strong>100%</strong><small>allocated</small></div></div>
    <article className="box calendar-control"><div className="calendar-policy"><div><span className="label">CALENDAR AUTONOMY</span><h2>Choose what the Operator may do</h2><p>External meetings are always read-only. This setting applies only to goal blocks created by the Operator.</p></div><label>Permission level<select value={calendarPolicy} onChange={event => mutate("update_calendar_policy", { policy: event.target.value })}><option value="propose_only">Propose only — ask every time</option><option value="auto_create">Automatically add new goal blocks</option><option value="auto_create_and_move_owned">Add and move Operator-owned blocks</option></select></label></div><form className="focus-planner" onSubmit={submitFocus}><div><span className="label">PLAN A GOAL BLOCK</span><h2>Turn a milestone into calendar time</h2></div><label>Milestone<select value={focusMilestoneId} onChange={event => { const next = candidates.find(item => item.milestone.id === event.target.value); setFocusMilestoneId(event.target.value); if (next) setFocusTitle(next.milestone.title); }}>{candidates.map(item => <option key={item.milestone.id} value={item.milestone.id}>{item.goal.title} · {item.milestone.title}</option>)}</select></label><label>Calendar title<input required value={focusTitle} onChange={event => setFocusTitle(event.target.value)} /></label><label>Start<input required type="datetime-local" value={focusStart} onChange={event => setFocusStart(event.target.value)} /></label><label>Duration<select value={focusDuration} onChange={event => setFocusDuration(Number(event.target.value))}>{[30,45,60,90].map(minutes => <option key={minutes} value={minutes}>{minutes} minutes</option>)}</select></label><button className="primary">{calendarPolicy === "propose_only" ? "Propose block" : "Queue block"}</button></form>{openCalendarBlocks.length > 0 && <div className="calendar-queue"><div className="between"><span className="label">CALENDAR QUEUE · {openCalendarBlocks.length}</span>{pendingWrites > 0 && <small>{pendingWrites} waiting for calendar worker</small>}</div>{openCalendarBlocks.map(item => <div key={String(item.id)}><span><strong>{String(item.title)}</strong><small>{new Intl.DateTimeFormat("en-IN", { weekday:"short", day:"numeric", month:"short", hour:"2-digit", minute:"2-digit", timeZone:"Asia/Kolkata" }).format(new Date(String(item.start_at)))} · {statusLabel(String(item.state))}</small>{item.state === "write_failed" && <em>The calendar write failed and needs another review.</em>}</span>{item.state === "proposed" && <div className="actions"><button className="primary" onClick={() => mutate("review_calendar_block", { id: item.id, decision: "approve" })}>Approve & add</button><button onClick={() => mutate("review_calendar_block", { id: item.id, decision: "dismiss" })}>Dismiss</button></div>}</div>)}</div>}</article>
    <div className="priority-grid">{priorities.map((item, index) => <article className="box priority-card" key={item.id}><div className="priority-number">0{index + 1}</div><span className="label">{item.domain}</span><h2>{item.title}</h2><p>{item.reason}</p><div className="allocation"><strong>{item.allocation}%</strong><span><i style={{ width: `${item.allocation}%` }} /></span></div><small>{item.estimatedMinutes} min · {Math.round(item.confidence * 100)}% confidence{item.dueDate ? ` · due ${formatDate(item.dueDate)}` : ""}</small></article>)}{priorities.length === 0 && <article className="box"><p>The plan will appear here once goals or roles are available.</p></article>}</div>
    <div className="today-grid"><article className="box"><div className="section-row"><div><span className="label">CALENDAR PLAN</span><h2>Today’s shape</h2></div><Connector data={data} id="google-calendar" /></div><div className="timeline">{calendar.map(item => <div key={String(item.id)} className={String(item.ownership)}><time>{new Date(String(item.start_at)).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })}</time><span>{item.event_url ? <a href={String(item.event_url)} target="_blank" rel="noreferrer"><strong>{String(item.title)}</strong></a> : <strong>{String(item.title)}</strong>}<small>{item.source === "google_calendar" ? "Google Calendar" : statusLabel(String(item.ownership))} · {statusLabel(String(item.state))}</small></span></div>)}{calendar.length === 0 && <p className="empty-line">No calendar blocks are scheduled for today.</p>}</div></article><article className="box changes"><span className="label">WHAT CHANGED</span><h2>{planPayload?.plan?.signals?.length ?? 0} signals in the current plan</h2><ul>{(planPayload?.plan?.signals ?? []).slice(0, 6).map(signal => <li key={signal.id}><b>{statusLabel(signal.category)}:</b> {signal.title}. {signal.detail}</li>)}{openEmailSignals.length > 0 && <li><b>Email:</b> {openEmailSignals.length} career signals need review.</li>}{(planPayload?.plan?.signals ?? []).length === 0 && <li>No new plan signals yet.</li>}</ul><div className="connector-stack"><Connector data={data} id="gmail" /><Connector data={data} id="llm" /></div></article></div>
    {data.planningNotes.length > 0 && <article className="box note-list"><span className="label">PLANNING NOTES · {data.planningNotes.length}</span>{data.planningNotes.map(item => <section key={String(item.id)}><p>{String(item.note)}</p><small>{String(item.result)}</small></section>)}</article>}
    <form className="box planning-note" onSubmit={submit}><div><span className="label">ADD TO TODAY</span><h2>Anything else the Operator should plan around?</h2><p>Describe a commitment, deadline, or change. The accepted note is stored and ripples into the local plan.</p></div><textarea value={note} onChange={event => setNote(event.target.value)} placeholder="For example: I need to prepare for Friday’s interview and send the take-home by 6 PM tomorrow." /><div className="actions"><button type="button" onClick={startVoice}>{listening ? "Listening…" : "Use voice"}</button><button className="primary" disabled={!note.trim()}>Update plan</button></div>{message && <small className="success-message">{message}</small>}</form>
  </>;
}

function CareerOnboarding({ onSaved }: { onSaved: () => Promise<void> }) {
  const [profile, setProfile] = useState<Record<string, unknown> | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => { void fetch("/api/career/profile").then(response => response.json()).then(result => setProfile(result.profile)); }, []);
  const list = (value: unknown) => Array.isArray(value) ? value.join(", ") : "";
  const split = (value: string) => value.split(",").map(item => item.trim()).filter(Boolean);
  async function save(event: FormEvent) {
    event.preventDefault(); if (!profile) return;
    const input = { targetRoles:profile.targetRoles, industries:profile.industries, locations:profile.locations, workModes:profile.workModes, seniority:profile.seniority, compensationNotes:profile.compensationNotes, strengths:profile.strengths, exclusions:profile.exclusions, resumeFilename:profile.resumeFilename, resumeText:profile.resumeText, onboardingStatus:profile.onboardingStatus };
    const response = await fetch("/api/career/profile", { method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify(input) });
    const result = await response.json();
    if (!response.ok) { setMessage(result.error ?? "Career profile could not be saved"); return; }
    setProfile(result.profile); setMessage("Career context saved. Open roles were rescored against this résumé."); await onSaved();
  }
  async function onResumeFile(file: File | undefined) {
    if (!file || !profile) return;
    if (!/text|markdown|tex|plain|html/i.test(file.type || file.name) && !/\.(txt|md|tex|html)$/i.test(file.name)) {
      setMessage("Upload a .txt, .md, or .tex file, or paste the résumé text below.");
      return;
    }
    const resumeText = await file.text();
    setProfile({ ...profile, resumeFilename: file.name, resumeText, onboardingStatus: "in_progress" });
    setMessage(`${file.name} loaded. Save career context to rescore the board.`);
  }
  if (!profile) return <article className="box onboarding-card"><span className="label">CAREER ONBOARDING</span><p>Loading your career context…</p></article>;
  return <form className="box onboarding-card" onSubmit={save}><div className="between"><div><span className="label">CAREER ONBOARDING · {statusLabel(String(profile.onboardingStatus))}</span><h2>Give the Operator your career filter</h2><p>This context will drive role discovery, fit explanations, résumé changes, and learning gaps.</p></div><button className="primary">Save career context</button></div><div className="onboarding-grid"><label>Target roles<input value={list(profile.targetRoles)} onChange={event => setProfile({ ...profile, targetRoles:split(event.target.value), onboardingStatus:"in_progress" })} placeholder="Senior Product Manager, Product Lead AI" /></label><label>Locations<input value={list(profile.locations)} onChange={event => setProfile({ ...profile, locations:split(event.target.value), onboardingStatus:"in_progress" })} placeholder="Bengaluru, Remote India" /></label><label>Work modes<input value={list(profile.workModes)} onChange={event => setProfile({ ...profile, workModes:split(event.target.value), onboardingStatus:"in_progress" })} placeholder="Remote, Hybrid" /></label><label>Seniority<input value={list(profile.seniority)} onChange={event => setProfile({ ...profile, seniority:split(event.target.value), onboardingStatus:"in_progress" })} placeholder="Senior, Lead, Principal" /></label><label>Industries<input value={list(profile.industries)} onChange={event => setProfile({ ...profile, industries:split(event.target.value), onboardingStatus:"in_progress" })} placeholder="AI, Fintech, Healthtech" /></label><label>Strengths<input value={list(profile.strengths)} onChange={event => setProfile({ ...profile, strengths:split(event.target.value), onboardingStatus:"in_progress" })} placeholder="0-to-1 products, AI strategy" /></label><label>Exclude<input value={list(profile.exclusions)} onChange={event => setProfile({ ...profile, exclusions:split(event.target.value), onboardingStatus:"in_progress" })} placeholder="Pure project management" /></label><label>Compensation notes<input value={String(profile.compensationNotes ?? "")} onChange={event => setProfile({ ...profile, compensationNotes:event.target.value, onboardingStatus:"in_progress" })} /></label><label>Résumé filename<input value={String(profile.resumeFilename ?? "")} onChange={event => setProfile({ ...profile, resumeFilename:event.target.value, onboardingStatus:"in_progress" })} placeholder="manish-resume.tex" /></label><label>Upload résumé text<input type="file" accept=".txt,.md,.tex,.html,text/plain" onChange={event => void onResumeFile(event.target.files?.[0])} /></label><label className="resume-source">Résumé / LaTeX source<textarea value={String(profile.resumeText ?? "")} onChange={event => setProfile({ ...profile, resumeText:event.target.value, onboardingStatus:"in_progress" })} placeholder="Paste your canonical résumé or LaTeX source here. Job-specific versions will be generated from this copy." /></label></div><div className="between onboarding-foot"><small>{message}</small><label className="complete-check"><input type="checkbox" checked={profile.onboardingStatus === "complete"} onChange={event => setProfile({ ...profile, onboardingStatus:event.target.checked ? "complete" : "in_progress" })} /> Mark onboarding complete</label></div></form>;
}

function JobIntake({ refresh }: { refresh: () => Promise<void> }) {
  const [job, setJob] = useState({ title: "", company: "", location: "", url: "" });
  const [board, setBoard] = useState({ provider: "greenhouse", name: "" });
  const [message, setMessage] = useState("");
  async function post(body: Record<string, unknown>, ok: string) {
    const response = await fetch("/api/career/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json() as { error?: string; imported?: number; skipped?: number; message?: string };
    setMessage(response.ok ? ok.replace("{imported}", String(result.imported ?? 1)).replace("{skipped}", String(result.skipped ?? 0)).replace("{message}", result.message ?? ok) : result.error ?? "The job board could not be updated");
    if (response.ok) await refresh();
  }
  return <article className="box job-intake"><div><span className="label">COLLECT ROLES</span><h2>Add a role or import a public job board</h2><p>Manual entries and Greenhouse/Lever boards are scored against your résumé. LinkedIn stays a visible handoff.</p></div>
    <form className="job-add" onSubmit={event => { event.preventDefault(); void post(job, "Role added and scored."); setJob({ title: "", company: "", location: "", url: "" }); }}>
      <label>Title<input required value={job.title} onChange={event => setJob({ ...job, title: event.target.value })} placeholder="Senior Product Manager, AI" /></label>
      <label>Company<input required value={job.company} onChange={event => setJob({ ...job, company: event.target.value })} placeholder="Zamp" /></label>
      <label>Location<input value={job.location} onChange={event => setJob({ ...job, location: event.target.value })} placeholder="Bengaluru" /></label>
      <label>URL<input value={job.url} onChange={event => setJob({ ...job, url: event.target.value })} placeholder="https://…" /></label>
      <button className="primary">Add role</button>
    </form>
    <form className="job-import" onSubmit={event => { event.preventDefault(); void post({ importFrom: { provider: board.provider, board: board.name } }, "Imported {imported} roles ({skipped} already on the board)."); }}>
      <label>Board source<select value={board.provider} onChange={event => setBoard({ ...board, provider: event.target.value })}><option value="greenhouse">Greenhouse</option><option value="lever">Lever</option></select></label>
      <label>Company or board token<input required value={board.name} onChange={event => setBoard({ ...board, name: event.target.value })} placeholder="stripe" /></label>
      <button>Import open roles</button>
    </form>
    {message && <small className="config-message">{message}</small>}
  </article>;
}

function CareerPage({ data, mutate, refresh }: { data: WorkspaceData; mutate: (action: string, payload?: Record<string, unknown>) => Promise<void>; refresh: () => Promise<void> }) {
  const jobs = data.jobs;
  const emailSignals = data.emailSignals.filter(item => item.status === "open");
  const columns = ["recommended", "saved", "applying", "applied", "interviewing"];
  const evidence = (job: Record<string, unknown>) => {
    if (Array.isArray(job.evidence_json)) return job.evidence_json.map(String);
    if (typeof job.evidence_json === "string") {
      try {
        const parsed: unknown = JSON.parse(job.evidence_json);
        return Array.isArray(parsed) ? parsed.map(String) : [];
      } catch { return []; }
    }
    return [];
  };
  async function scheduleTop() {
    const response = await fetch("/api/career/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scheduleTop: true }) });
    const result = await response.json() as { message?: string; error?: string };
    if (!response.ok) throw new Error(result.error ?? "Could not propose a calendar block");
    await refresh();
  }
  return <><Heading eyebrow="Career" title="Find the roles worth your time" copy="A ranked shortlist scored from your résumé, a living application board, and explicit connector boundaries." action={<div className="actions"><button className="primary" onClick={() => void scheduleTop()}>Propose application block</button><button onClick={() => mutate("request_linkedin")}>Find jobs on LinkedIn</button></div>} />
    <div className="connector-row"><Connector data={data} id="linkedin" /><Connector data={data} id="gmail" /></div>
    <CareerOnboarding onSaved={refresh} />
    <JobIntake refresh={refresh} />
    <article className="box email-signals"><div className="between"><div><span className="label">GMAIL CAREER SIGNALS · {emailSignals.length}</span><h2>Application activity and actions</h2><p>Read-only signals from the last 14 days. The Operator cannot send, archive, label, or delete email.</p></div><button onClick={() => mutate("request_gmail_sync")}>Request refresh</button></div><div>{emailSignals.slice(0,8).map(signal => <section key={String(signal.id)}><div><span className="pill">{statusLabel(String(signal.category))}</span><h3>{String(signal.subject)}</h3><small>{String(signal.sender)} · {new Intl.DateTimeFormat("en-IN", { day:"numeric", month:"short", hour:"2-digit", minute:"2-digit", timeZone:"Asia/Kolkata" }).format(new Date(String(signal.received_at)))}</small><p>{String(signal.summary)}</p><strong>Next: {String(signal.next_action)}</strong>{signal.due_at && <em>Due {formatDate(String(signal.due_at).slice(0,10))}</em>}</div><div className="actions"><a className="button-link" href={String(signal.message_url)} target="_blank" rel="noreferrer">Open Gmail</a><button className="primary" onClick={() => mutate("update_email_signal", { id: signal.id, status: "handled" })}>Mark handled</button><button onClick={() => mutate("update_email_signal", { id: signal.id, status: "dismissed" })}>Dismiss</button></div></section>)}{emailSignals.length === 0 && <p className="empty-line">No open career email actions.</p>}</div></article>
    <div className="job-shortlist">{jobs.slice(0,3).map((job,index) => <article className="box job-card" key={String(job.id)}><div className="priority-number">0{index+1}</div><div><span className="label">{String(job.source)}</span><h2>{String(job.title)}</h2><p>{String(job.company)} · {String(job.location)}</p><small><b>Why:</b> {String(job.fit_reason || job.next_action)}</small>{evidence(job).length > 0 && <ul className="evidence">{evidence(job).slice(0,3).map(item => <li key={item}>{item}</li>)}</ul>}{job.url ? <a className="button-link" href={String(job.url)} target="_blank" rel="noreferrer">Open posting</a> : null}</div><div className="job-fit"><strong>{String(job.fit_score)}%</strong><select value={String(job.status)} onChange={event => mutate("update_job", { id: job.id, status: event.target.value, nextAction: job.next_action })}>{columns.map(status => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></div></article>)}</div>
    <div className="section-heading"><div><span className="label">APPLICATION BOARD</span><h2>{jobs.length} tracked roles</h2></div></div><div className="kanban">{columns.map(column => <section className="box" key={column}><span className="label">{statusLabel(column)} · {jobs.filter(job => job.status === column).length}</span>{jobs.filter(job => job.status === column).map(job => <div className="board-card" key={String(job.id)}><strong>{String(job.title)}</strong><small>{String(job.company)}</small></div>)}</section>)}</div>
    <article className="box honest-handoff"><span className="label">BROWSER HANDOFF</span><h2>LinkedIn collection is ready, but never hidden</h2><p>The button creates a request for a visible, user-approved Chrome session. It does not scrape in the background, bypass controls, apply, message, or change your LinkedIn account.</p></article>
  </>;
}

function LearningConfiguration() {
  const [configuration, setConfiguration] = useState<{ preferences: Record<string, unknown>; sources: Record<string, unknown>[] } | null>(null);
  const [source, setSource] = useState({ name:"", sourceType:"website", url:"", priority:3 });
  const [message, setMessage] = useState("");
  const refresh = async () => { const result = await fetch("/api/learning/preferences").then(response => response.json()); setConfiguration(result); };
  useEffect(() => { void refresh(); }, []);
  const list = (value: unknown) => Array.isArray(value) ? value.join(", ") : "";
  const split = (value: string) => value.split(",").map(item => item.trim()).filter(Boolean);
  async function savePreferences(event: FormEvent) { event.preventDefault(); if (!configuration) return; const response = await fetch("/api/learning/preferences", { method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ preferences:configuration.preferences }) }); const result = await response.json(); setMessage(response.ok ? "Learning preferences saved." : result.error); if (response.ok) await refresh(); }
  async function addSource(event: FormEvent) { event.preventDefault(); const response = await fetch("/api/learning/preferences", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ source }) }); const result = await response.json(); setMessage(response.ok ? "Learning source added." : result.error); if (response.ok) { setSource({ name:"", sourceType:"website", url:"", priority:3 }); await refresh(); } }
  async function toggleSource(item: Record<string, unknown>) { await fetch("/api/learning/preferences", { method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ id:item.id, source:{ enabled:!item.enabled } }) }); await refresh(); }
  if (!configuration) return <article className="box learning-config"><span className="label">LEARNING SETUP</span><p>Loading learning preferences…</p></article>;
  return <article className="box learning-config"><div><span className="label">LEARNING SETUP</span><h2>Choose what the research stream should follow</h2><p>Sources are configuration only for now; the daily research collector is the next layer.</p></div><form className="learning-preferences" onSubmit={savePreferences}><label>Tracks<input value={list(configuration.preferences.tracks)} onChange={event => setConfiguration({ ...configuration, preferences:{...configuration.preferences,tracks:split(event.target.value)} })} placeholder="Agentic AI, AI news, Product management" /></label><label>Interests<input value={list(configuration.preferences.interests)} onChange={event => setConfiguration({ ...configuration, preferences:{...configuration.preferences,interests:split(event.target.value)} })} placeholder="Memory, tool use, evaluations" /></label><label>Weekly minutes<input type="number" min="0" max="10080" value={Number(configuration.preferences.weeklyBudgetMinutes ?? 300)} onChange={event => setConfiguration({ ...configuration, preferences:{...configuration.preferences,weeklyBudgetMinutes:Number(event.target.value)} })} /></label><button className="primary">Save preferences</button></form><form className="source-add" onSubmit={addSource}><label>Source name<input required value={source.name} onChange={event => setSource({...source,name:event.target.value})} placeholder="OpenAI research" /></label><label>Type<select value={source.sourceType} onChange={event => setSource({...source,sourceType:event.target.value})}>{["website","rss","newsletter","youtube","podcast","journal","paper_repository"].map(type => <option value={type} key={type}>{statusLabel(type)}</option>)}</select></label><label>URL<input required type="url" value={source.url} onChange={event => setSource({...source,url:event.target.value})} placeholder="https://…" /></label><label>Priority<select value={source.priority} onChange={event => setSource({...source,priority:Number(event.target.value)})}>{[5,4,3,2,1].map(value => <option key={value}>{value}</option>)}</select></label><button>Add source</button></form>{message && <small className="config-message">{message}</small>}<div className="source-list">{configuration.sources.map(item => <button key={String(item.id)} className={item.enabled ? "enabled" : ""} onClick={() => toggleSource(item)}><span><strong>{String(item.name)}</strong><small>{statusLabel(String(item.sourceType))} · Priority {String(item.priority)}</small></span><b>{item.enabled ? "Following" : "Paused"}</b></button>)}</div></article>;
}

function LearningPage({ data, mutate }: { data: WorkspaceData; mutate: (action: string, payload?: Record<string, unknown>) => Promise<void> }) {
  const [trackId, setTrackId] = useState(String(data.tracks[0]?.id ?? ""));
  const track = data.tracks.find(item => item.id === trackId) ?? data.tracks[0];
  const items = data.learningItems.filter(item => item.track_id === track?.id);
  return <><Heading eyebrow="Learning" title="Build expertise in parallel tracks" copy="Each track has its own purpose, time budget, and queue so urgent interview preparation does not erase long-term learning." />
    <LearningConfiguration />
    <div className="track-tabs">{data.tracks.map(item => <button key={String(item.id)} className={track?.id === item.id ? "active" : ""} onClick={() => setTrackId(String(item.id))}><strong>{String(item.name)}</strong><small>{Math.round(Number(item.weekly_budget_minutes)/60*10)/10}h / week</small></button>)}</div>
    {track && <article className="box track-summary"><span className="label">ACTIVE TRACK</span><h2>{String(track.name)}</h2><p>{String(track.purpose)}</p></article>}
    <div className="resource-grid">{items.map(item => <article className="box resource-card" key={String(item.id)}><span className="pill">{String(item.item_type)} · {String(item.duration_minutes)} MIN</span><h2>{String(item.title)}</h2><p>{String(item.relevance)}</p><small>{String(item.source)}</small><div className="actions"><button className="primary" onClick={() => mutate("update_learning", { id: item.id, status: "in_progress" })}>Learn now</button><button onClick={() => mutate("update_learning", { id: item.id, status: item.status === "saved" ? "recommended" : "saved" })}>{item.status === "saved" ? "Unsave" : "Save"}</button><button className="link" onClick={() => mutate("update_learning", { id: item.id, status: "completed" })}>Mark complete</button></div><em>{statusLabel(String(item.status))}</em></article>)}</div>
  </>;
}

function StartupPage({ data, mutate }: { data: WorkspaceData; mutate: (action: string, payload?: Record<string, unknown>) => Promise<void> }) {
  const [adding, setAdding] = useState(false); const [title, setTitle] = useState(""); const [problem, setProblem] = useState(""); const [targetUser, setTargetUser] = useState("");
  async function submit(event: FormEvent) { event.preventDefault(); await mutate("add_startup", { title, problem, targetUser, reviewDate: addDays(14) }); setTitle(""); setProblem(""); setTargetUser(""); setAdding(false); }
  return <><Heading eyebrow="Startup Lab" title="A portfolio of ideas, not one bet" copy="Every idea keeps its own problem, user, evidence state, confidence, and next validation step." action={<button className="primary" onClick={() => setAdding(true)}>+ Add idea</button>} />
    {adding && <form className="box inline-form" onSubmit={submit}><div className="between"><h2>Capture a new idea</h2><button type="button" className="icon-button" onClick={() => setAdding(false)}>×</button></div><label>Idea title<input required value={title} onChange={event => setTitle(event.target.value)} /></label><label>Problem statement<textarea value={problem} onChange={event => setProblem(event.target.value)} /></label><label>Target user<input value={targetUser} onChange={event => setTargetUser(event.target.value)} /></label><button className="primary">Add to lab</button></form>}
    <div className="idea-grid">{data.startupIdeas.map(idea => <article className="box idea-workspace" key={String(idea.id)}><div className="between"><span className="pill">{statusLabel(String(idea.state))}</span><strong>{String(idea.confidence)}% confidence</strong></div><h2>{String(idea.title)}</h2><dl><div><dt>Problem</dt><dd>{String(idea.problem)}</dd></div><div><dt>Target user</dt><dd>{String(idea.target_user)}</dd></div><div><dt>Next validation</dt><dd>{String(idea.next_validation)}</dd></div></dl><div className="idea-foot"><small>Review {formatDate(String(idea.review_date))}</small><select value={String(idea.state)} onChange={event => mutate("update_startup", { id: idea.id, state: event.target.value })}>{["captured","framing","researching","validating","parked","committed"].map(state => <option key={state} value={state}>{statusLabel(state)}</option>)}</select></div></article>)}</div>
  </>;
}

function ContentPage({ data, mutate }: { data: WorkspaceData; mutate: (action: string, payload?: Record<string, unknown>) => Promise<void> }) {
  const active = data.contentIdeas.filter(item => item.status !== "parked");
  return <><Heading eyebrow="Content" title="Choose the three ideas worth advancing" copy="The strategy remains authoritative. This view prioritizes and hands off work instead of recreating a full editor." />
    <article className="box strategy-banner"><div><span className="label">CONTENT STRATEGY</span><h2>Practical thinking on AI products, agentic workflows, and building with high ownership.</h2><p>The existing strategy source is not connected yet; this normalized summary is clearly demo data.</p></div><span className="state-chip overdue">Source unavailable</span></article>
    <div className="content-top">{active.slice(0,3).map((idea,index) => <article className="box content-card" key={String(idea.id)}><div className="between"><span className="priority-number">0{index+1}</span><strong className="content-score">{String(idea.score)}</strong></div><span className="label">{String(idea.pillar)}</span><h2>{String(idea.title)}</h2><p><b>Why now:</b> {String(idea.source)}</p><small>Next: {String(idea.next_action)}</small><div className="actions"><button className="primary" onClick={() => mutate("update_content", { id: idea.id, status: "selected" })}>Select</button><button onClick={() => mutate("update_content", { id: idea.id, status: "parked" })}>Park</button></div></article>)}</div>
    <article className="box"><span className="label">FULL IDEA BACKLOG · {data.contentIdeas.length}</span><div className="backlog">{data.contentIdeas.map(idea => <div key={String(idea.id)}><strong>{String(idea.title)}</strong><span>{String(idea.pillar)}</span><em>{statusLabel(String(idea.status))}</em><b>{String(idea.score)}</b></div>)}</div></article>
  </>;
}

function MemoryPage({ goals, data, mutate }: { goals: Goal[]; data: WorkspaceData; mutate: (action: string, payload?: Record<string, unknown>) => Promise<void> }) {
  const [adding, setAdding] = useState(false); const [decision, setDecision] = useState(""); const [rationale, setRationale] = useState(""); const [preview, setPreview] = useState("");
  async function submit(event: FormEvent) { event.preventDefault(); await mutate("add_decision", { decision, rationale, affected: "General" }); setDecision(""); setRationale(""); setAdding(false); }
  const files = [["goals.md", `${goals.length} goals · ${goals.reduce((sum,goal)=>sum+goal.milestones.length,0)} milestones`, "Generated from structured goal state"], ["decisions.md", `${data.decisions.length} decisions`, "Append-only decision ledger"], ["career.md", `${data.jobs.length} tracked jobs`, "Career preferences and active state"], ["content-strategy.md", "Awaiting source", "Normalized strategy context"]];
  const previews: Record<string,string> = {
    "goals.md": goals.map(goal => `# ${goal.title}\nState: ${goal.state} | Progress: ${goal.progressPercentage}% | Target: ${goal.targetDate}\n\n${goal.milestones.map(item => `- [${item.completionPercentage === 100 ? "x" : " "}] ${item.title} — ${item.completionPercentage}% — due ${item.targetDate}`).join("\n")}`).join("\n\n"),
    "decisions.md": data.decisions.map(item => `## ${String(item.decision)}\nDate: ${String(item.decided_at).slice(0,10)}\nWhy: ${String(item.rationale)}\nAffected: ${String(item.affected)}`).join("\n\n"),
    "career.md": `# Career memory\n\nTarget: Senior / Lead AI Product roles\nPreferred: Bengaluru, Mumbai, or remote India\n\n## Active roles\n${data.jobs.map(job => `- ${String(job.title)} at ${String(job.company)} — ${String(job.fit_score)}% — ${String(job.status)}`).join("\n")}`,
    "content-strategy.md": "# Content strategy\n\nStatus: Source not connected\n\nWorking thesis: Practical thinking on AI products, agentic workflows, and building with high ownership.\n\nThis demo summary must be replaced by the imported strategy source.",
  };
  return <><Heading eyebrow="Memory" title="What the Operator remembers—and why" copy="Human-readable context remains inspectable while structured records keep workflows reliable." action={<button className="primary" onClick={() => setAdding(true)}>+ Record decision</button>} />
    <div className="memory-files">{files.map(([name,meta,copy]) => <article className="box" key={name}><span className="file-mark">MD</span><h2>{name}</h2><p>{copy}</p><small>{meta}</small><button className="link" onClick={() => setPreview(name)}>Preview →</button></article>)}</div>
    {preview && <article className="box context-panel"><div className="between"><div><span className="label">GENERATED CONTEXT</span><h2>{preview}</h2></div><button className="icon-button" onClick={() => setPreview("")}>×</button></div><pre>{previews[preview]}</pre></article>}
    {adding && <form className="box inline-form" onSubmit={submit}><div className="between"><h2>Record a durable decision</h2><button type="button" className="icon-button" onClick={() => setAdding(false)}>×</button></div><label>Decision<input required value={decision} onChange={event => setDecision(event.target.value)} /></label><label>Why<textarea required value={rationale} onChange={event => setRationale(event.target.value)} /></label><button className="primary">Add to decisions.md</button></form>}
    <article className="box"><span className="label">DECISION LEDGER</span><div className="decision-list">{data.decisions.map(item => <div key={String(item.id)}><time>{new Date(String(item.decided_at)).toLocaleDateString("en-IN", { day:"numeric", month:"short" })}</time><span><strong>{String(item.decision)}</strong><p>{String(item.rationale)}</p><small>{String(item.affected)}</small></span></div>)}</div></article>
  </>;
}

function CouncilPage({ data, mutate }: { data: WorkspaceData; mutate: (action: string, payload?: Record<string, unknown>) => Promise<void> }) {
  const proposed = data.councilProposals.filter(item => item.status === "proposed"); const [selectedRole, setSelectedRole] = useState<Record<string,unknown> | null>(null);
  return <><Heading eyebrow="Small Council" title="Two roles, explicit authority" copy="Names make the roles memorable; missions, rubrics, tools, and approval boundaries determine their behaviour." action={<button className="primary" onClick={() => mutate("run_council")}>Run retrospective</button>} />
    <div className="council-grid">{data.councilRoles.map(role => <article className="box role-card" key={String(role.id)}><div className="role-avatar">{String(role.label).slice(0,1)}</div><span className="pill">{statusLabel(String(role.status))}</span><h2>{String(role.label)}</h2><strong>{String(role.role_name)}</strong><p>{String(role.mission)}</p><small>{role.last_run_at ? `Last ran ${new Date(String(role.last_run_at)).toLocaleString("en-IN")}` : "Not run yet"}</small><button onClick={() => setSelectedRole(role)}>Inspect role brief</button></article>)}</div>
    {selectedRole && <article className="box role-brief"><div className="between"><div><span className="label">VERSIONED ROLE BRIEF</span><h2>{String(selectedRole.label)} · {String(selectedRole.role_name)}</h2></div><button className="icon-button" onClick={() => setSelectedRole(null)}>×</button></div><div className="brief-columns"><div><strong>Mission</strong><p>{String(selectedRole.mission)}</p></div><div><strong>Allowed</strong><p>Read local goals, milestones, program state, calendar constraints, and accepted decisions. Produce structured proposals.</p></div><div><strong>Never automatic</strong><p>External messages, publishing, applications, permission changes, and permanent rule updates.</p></div></div></article>}
    <article className="box"><span className="label">PROPOSALS NEEDING REVIEW · {proposed.length}</span><div className="proposal-list">{proposed.length ? proposed.map(item => <div key={String(item.id)}><span><strong>{String(item.title)}</strong><p>{String(item.rationale)}</p><small>Proposed by {String(item.role_id)}</small></span><div className="actions"><button className="primary" onClick={() => mutate("update_proposal", { id: item.id, status: "accepted" })}>Accept</button><button onClick={() => mutate("update_proposal", { id: item.id, status: "rejected" })}>Dismiss</button></div></div>) : <p className="empty-line">Run the retrospective to produce bounded, reviewable proposals.</p>}</div></article>
    <article className="box honest-handoff"><span className="label">AI RUNTIME</span><h2>Role logic is local; live reasoning is not connected</h2><p>The current retrospective uses deterministic product rules and persists proposals. Connecting a model will add richer reasoning, but it will not expand permissions or own canonical state.</p><Connector data={data} id="llm" /></article>
  </>;
}

const navGroups: { label: string; items: { name: View; mark: string }[] }[] = [
  { label: "Plan", items: [{ name: "Today", mark: "T" }, { name: "Goals", mark: "G" }] },
  { label: "Programs", items: [{ name: "Career", mark: "C" }, { name: "Learning", mark: "L" }, { name: "Startup Lab", mark: "S" }, { name: "Content", mark: "W" }] },
  { label: "System", items: [{ name: "Memory", mark: "M" }, { name: "Small Council", mark: "2" }] },
];

export default function Home() {
  const [view, setView] = useState<View>("Today"); const [goals, setGoals] = useState<Goal[]>([]); const [data, setData] = useState<WorkspaceData>({ decisions:[], calendar:[], calendarPreferences:[], calendarWriteRequests:[], emailSignals:[], jobs:[], tracks:[], learningItems:[], startupIdeas:[], contentIdeas:[], councilRoles:[], councilProposals:[], planningNotes:[], connectors:[] });
  const [selectedId, setSelectedId] = useState<string>(); const [creating, setCreating] = useState(false); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [toast, setToast] = useState("");

  async function refresh(preferredId?: string) {
    try { const [goalResult, workspace] = await Promise.all([apiRequest("GET"), workspaceRequest()]); const nextGoals = goalResult.goals ?? []; setGoals(nextGoals); setData(workspace); setSelectedId(current => preferredId ?? (current && nextGoals.some(goal => goal.id === current) ? current : nextGoals[0]?.id)); setError(""); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "The Operator could not be loaded"); } finally { setLoading(false); }
  }
  async function mutate(action: string, payload?: Record<string, unknown>) { try { const result = await workspaceRequest(action, payload); setToast(result.message ?? "Updated"); await refresh(); window.setTimeout(() => setToast(""), 3200); } catch (caught) { setError(caught instanceof Error ? caught.message : "The change could not be saved"); } }
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void refresh(); }, []);
  const activeCount = useMemo(() => goals.filter(goal => goal.state === "active").length, [goals]);

  function page() {
    if (view === "Today") return <TodayPage goals={goals} data={data} mutate={mutate} refresh={refresh} />;
    if (view === "Goals") return <GoalsPage goals={goals} selectedId={selectedId} select={setSelectedId} refresh={refresh} addGoal={() => setCreating(true)} />;
    if (view === "Career") return <CareerPage data={data} mutate={mutate} refresh={refresh} />;
    if (view === "Learning") return <LearningPage data={data} mutate={mutate} />;
    if (view === "Startup Lab") return <StartupPage data={data} mutate={mutate} />;
    if (view === "Content") return <ContentPage data={data} mutate={mutate} />;
    if (view === "Memory") return <MemoryPage goals={goals} data={data} mutate={mutate} />;
    return <CouncilPage data={data} mutate={mutate} />;
  }

  return <main className="shell"><aside className="app-sidebar"><div className="brand"><b>AO</b><span><strong>AI Operator</strong><small>Personal command center</small></span></div><div className="operator-state"><span><i className="live" />Operator online</span><small>{activeCount} active goals · local mode</small></div><nav>{navGroups.map(group => <section key={group.label}><span className="nav-label">{group.label}</span>{group.items.map(item => <button key={item.name} className={view === item.name ? "active" : ""} onClick={() => setView(item.name)}><i>{item.mark}</i><span>{item.name}</span>{item.name === "Small Council" && data.councilProposals.filter(proposal => proposal.status === "proposed").length > 0 && <em>{data.councilProposals.filter(proposal => proposal.status === "proposed").length}</em>}</button>)}</section>)}</nav><div className="sidebar-foot"><span>Next daily run</span><strong>Tomorrow · 10:00</strong><small>Runs when this Mac is available</small></div></aside><section className="workspace">{error && <div className="error-banner">{error}<button className="link" onClick={() => void refresh()}>Try again</button></div>}{toast && <div className="toast">{toast}</div>}{loading ? <div className="loading">Starting your Operator…</div> : page()}</section>{creating && <GoalForm close={() => setCreating(false)} created={async id => { setCreating(false); await refresh(id); }} />}</main>;
}
