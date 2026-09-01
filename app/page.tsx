"use client";

import { OPERATOR_AGENTS } from "@/lib/operator/agents";
import { DEEPSEEK_LIVE, OPENAI_LIVE } from "@/lib/operator/models";
import { CaptureComposer } from "./capture-composer";
import { JobCareerMatch } from "./career-match";
import { ContentWorkspace } from "./content-workspace";
import { GoalsJsonPanel, OperatorSetup } from "./operator-setup";
import { StartupLab } from "./startup-lab";
import { asTimeBlock, calendarControlsStartOpen, calendarDayStamp, calendarReadStatus, formatConflictCallout, formatConflictRange, formatInTimezone, occupiesCalendarDay, overlapClusters, preferredTimezone, visibleTimelineBlocks } from "@/lib/operator/calendar";
import { rankCareerEmails } from "@/lib/operator/career-email";
import { splitFocusPrograms } from "@/lib/operator/focus-nav";
import { isQuotaSalesRole } from "@/lib/operator/job-relevance";
import { COMPANY_BOARD_PROVIDERS, SEARCH_IMPORT_CAP } from "@/lib/operator/job-search";
import { queuedLearningMinutes, weekLearningQueue } from "@/lib/operator/learning-taste";
import { memoryDisplayBody, type PresentedMemoryNote } from "@/lib/operator/memory-notes";
import { modelGuideCopy, sidebarModelCopy } from "@/lib/operator/model-status";
import { isSampleJob } from "@/lib/operator/operator-setup";
import { MIN_RESUME_CHARS } from "@/lib/operator/scoring";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type View = "Today" | "Goals" | "Career" | "Learning" | "Startup Lab" | "Content" | "Memory" | "Small Council" | "Setup";
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
  planningNotes: Record<string, unknown>[]; connectors: Record<string, unknown>[]; contentStrategy: Record<string, unknown>[];
};

const today = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const PROGRAM_VIEWS: View[] = ["Career", "Learning", "Startup Lab", "Content"];
const FOCUS_NAV_KEY = "operator-focus-nav";

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

function priorityWord(value: number) {
  if (value >= 5) return "Highest";
  if (value === 4) return "High";
  if (value === 3) return "Medium";
  if (value === 2) return "Low";
  return "Lowest";
}

function programForDomain(domain: string, title?: string, goalId?: string): View {
  if (goalId && /^(Advance |Unblock )/i.test(title ?? "")) return "Goals";
  if (domain === "career") return "Career";
  if (domain === "learning") return "Learning";
  if (domain === "startup") return "Startup Lab";
  if (domain === "content") return "Content";
  return "Goals";
}

type PlanPriority = { id: string; rank: number; domain: string; title: string; reason: string; estimatedMinutes: number; confidence: number; dueDate?: string; goalId?: string };
type PlanSignal = { id: string; category: string; domain: string; title: string; detail: string };
type PlanPayload = {
  plan?: { summary: string; generation?: { mode: string; provider?: string; fallbackReason?: string }; priorities?: PlanPriority[]; signals?: PlanSignal[] };
  model?: { status: string; provider?: string; reason?: string; keyReady?: boolean };
};

function ModelGuide({ model, onRetry }: { model?: PlanPayload["model"]; onRetry: () => void }) {
  const copy = modelGuideCopy(model);
  const token = `${model?.status ?? ""}:${model?.reason ?? ""}`;
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    try { setHidden(sessionStorage.getItem("operator-model-guide") === token); }
    catch { setHidden(false); }
  }, [token]);
  if (!copy || hidden) return null;
  return <aside className="model-guide">
    <div>
      <span className="label">MODEL STATUS</span>
      <h2>{copy.title}</h2>
      <p>{copy.lead}</p>
      <p>{copy.fix}</p>
      <small>Still works: Today, goals, calendar approvals, the career board, memory edits. Live only when a model key is ready: drafts, research, council review, Refresh with model.</small>
    </div>
    <div className="actions">
      {copy.retry ? <button className="primary" onClick={onRetry}>Refresh with model</button> : null}
      <button className="link" onClick={() => { try { sessionStorage.setItem("operator-model-guide", token); } catch { /* ignore */ } setHidden(true); }}>Continue on local rules</button>
    </div>
  </aside>;
}

function agentFor(program: string) {
  return OPERATOR_AGENTS.find(agent => agent.program === program);
}

function inlineMarkdown(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, index) => part.startsWith("**") && part.endsWith("**") ? <strong key={index}>{part.slice(2, -2)}</strong> : part);
}

function Markdown({ value }: { value: string }) {
  const chunks = value.replace(/\r\n/g, "\n").split(/\n{2,}/);
  const blocks: React.ReactNode[] = [];
  for (const chunk of chunks) {
    const trimmed = chunk.trim();
    if (!trimmed || trimmed === "---") {
      if (trimmed === "---") blocks.push(<hr key={blocks.length} />);
      continue;
    }
    const lines = trimmed.split("\n");
    if (lines.every(line => /^\s*[-*]\s+/.test(line))) {
      blocks.push(<ul key={blocks.length}>{lines.map((line, index) => <li key={index}>{inlineMarkdown(line.replace(/^\s*[-*]\s+/, "").replace(/\[x\]/i, "✓ ").replace(/\[\s\]/, "○ "))}</li>)}</ul>);
      continue;
    }
    const first = lines[0].trim();
    if (first.startsWith("# ") || first.startsWith("## ")) {
      blocks.push(first.startsWith("# ")
        ? <h2 key={blocks.length}>{inlineMarkdown(first.slice(2))}</h2>
        : <h3 key={blocks.length}>{inlineMarkdown(first.slice(3))}</h3>);
      const rest = lines.slice(1);
      if (rest.length) blocks.push(<p key={blocks.length}>{rest.map((line, index) => <span key={index}>{inlineMarkdown(line)}{index < rest.length - 1 ? <br /> : null}</span>)}</p>);
      continue;
    }
    blocks.push(<p key={blocks.length}>{lines.map((line, index) => <span key={index}>{inlineMarkdown(line)}{index < lines.length - 1 ? <br /> : null}</span>)}</p>);
  }
  return <article className="md">{blocks}</article>;
}

function SetupPanel({ title, hint, open, onOpenChange, children }: { title: string; hint: string; open: boolean; onOpenChange: (open: boolean) => void; children: React.ReactNode }) {
  return <details className="setup-panel" open={open} onToggle={event => { const next = event.currentTarget.open; if (next !== open) onOpenChange(next); }}>
    <summary><span>{title}</span><small>{hint}</small></summary>
    {children}
  </details>;
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

function Heading({ eyebrow, title, copy, action, agent }: { eyebrow: string; title: string; copy: string; action?: React.ReactNode; agent?: string }) {
  const named = agentFor(agent ?? eyebrow);
  return <header className="page-heading"><div>{named && <span className="agent-chip">{named.label} · {named.roleName}</span>}<span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p className="lede">{copy}</p></div>{action}</header>;
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
      return <section key={group.label}><span className="label">{group.label} · {items.length}</span><div className="goal-picker">{items.map((goal, index) => {
        const next = goal.milestones.find(milestone => milestone.completionPercentage < 100 && milestone.status !== "skipped");
        return <button type="button" key={goal.id} className={`goal-card ${selectedId === goal.id ? "selected" : ""}`} onClick={() => select(goal.id)}>
          <span className="goal-index">{String(index + 1).padStart(2, "0")}</span>
          <span className="goal-card-body">
            <span className="goal-picker-top"><strong>{goal.title}</strong><b>{goal.progressPercentage}%</b></span>
            <span className="mini-progress"><i style={{ width: `${goal.progressPercentage}%` }} /></span>
            <small>{next ? `Next: ${next.title}` : "No open milestone"}</small>
          </span>
        </button>;
      })}</div></section>;
    })}
  </aside>;
}

function GoalForm({ close, created, imported, existing, demo }: { close: () => void; created: (id: string) => void; imported: () => Promise<void>; existing: Goal[]; demo?: boolean }) {
  const [mode, setMode] = useState<"one" | "pack">("one");
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

  return <div className="drawer-backdrop" role="presentation"><div className="drawer">
    <div className="drawer-head"><div><span className="eyebrow">New goal</span><h2>{mode === "one" ? "Define the outcome" : "Paste a JSON pack"}</h2></div><button type="button" className="icon-button" onClick={close} aria-label="Close">×</button></div>
    <div className="goal-mode-switch" role="tablist" aria-label="How to add goals">
      <button type="button" role="tab" aria-selected={mode === "one"} className={mode === "one" ? "active" : ""} onClick={() => setMode("one")}>Add one</button>
      <button type="button" role="tab" aria-selected={mode === "pack"} className={mode === "pack" ? "active" : ""} onClick={() => setMode("pack")}>Paste JSON pack</button>
    </div>
    {mode === "pack" ? <GoalsJsonPanel embedded existing={existing} demo={demo} onImported={imported} /> : <form className="goal-create" onSubmit={submit}>
    <label>Goal title<input required value={goal.title} onChange={event => setGoal({ ...goal, title: event.target.value })} placeholder="Land a high-agency AI product role" /></label>
    <label>Desired outcome<textarea required value={goal.desiredOutcome} onChange={event => setGoal({ ...goal, desiredOutcome: event.target.value })} placeholder="What should be different when this is complete?" /></label>
    <label>Success criteria<textarea required value={goal.successCriteria} onChange={event => setGoal({ ...goal, successCriteria: event.target.value })} placeholder="What evidence will prove the goal is achieved?" /></label>
    <div className="field-row"><label>Target date<input required min={today} type="date" value={goal.targetDate} onChange={event => setGoal({ ...goal, targetDate: event.target.value })} /></label><label>Priority<select value={goal.priority} onChange={event => setGoal({ ...goal, priority: Number(event.target.value) })}>{[5,4,3,2,1].map(value => <option key={value} value={value}>{priorityWord(value)}</option>)}</select></label></div>
    <div className="form-divider"><span className="label">DATED MILESTONES</span><button type="button" className="link" onClick={() => setMilestones(current => [...current, { title: "", completionRule: "", targetDate: goal.targetDate, weight: 1, completionPercentage: 0, status: "not_started", position: current.length }])}>+ Add milestone</button></div>
    {milestones.map((milestone, index) => <div className="new-milestone" key={index}>
      <div className="milestone-number">{index + 1}</div><div className="new-milestone-fields"><label>Milestone<input required value={milestone.title} onChange={event => changeMilestone(index, { title: event.target.value })} placeholder="A concrete intermediate outcome" /></label><label>Completion rule<input required value={milestone.completionRule} onChange={event => changeMilestone(index, { completionRule: event.target.value })} placeholder="What proves this milestone is complete?" /></label><div className="field-row"><label>Target date<input required type="date" value={milestone.targetDate} onChange={event => changeMilestone(index, { targetDate: event.target.value })} /></label><label>Weight<input required min="1" max="100" type="number" value={milestone.weight} onChange={event => changeMilestone(index, { weight: Number(event.target.value) })} /></label></div></div>{milestones.length > 1 && <button type="button" className="icon-button" onClick={() => setMilestones(current => current.filter((_, itemIndex) => itemIndex !== index))} aria-label="Remove milestone">×</button>}
    </div>)}
    {error && <p className="form-error">{error}</p>}
    <div className="drawer-actions"><button type="button" onClick={close}>Cancel</button><button className="primary" disabled={saving}>{saving ? "Creating…" : "Create goal"}</button></div>
  </form>}
  </div></div>;
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
    <div className="field-row"><label>Target date<input required type="date" value={draft.targetDate} onChange={event => setDraft({ ...draft, targetDate: event.target.value })} /></label><label>Priority<select value={draft.priority} onChange={event => setDraft({ ...draft, priority: Number(event.target.value) })}>{[5,4,3,2,1].map(value => <option key={value} value={value}>{priorityWord(value)}</option>)}</select></label><label>Status<select value={draft.state} onChange={event => setDraft({ ...draft, state: event.target.value as GoalState })}><option value="active">Active</option><option value="paused">Paused</option><option value="completed">Completed</option><option value="archived">Archived</option></select></label></div>
    <div className="actions"><button className="primary" disabled={saving}>{saving ? "Saving…" : "Save contract"}</button><button type="button" onClick={() => setEditing(false)}>Cancel</button></div>
  </form>;

  const next = goal.milestones.find(milestone => milestone.completionPercentage < 100 && milestone.status !== "skipped");
  return <article className="box goal-contract">
    <div className="between"><div><span className={`pill ${goal.state}`}>{statusLabel(goal.state)} · {priorityWord(goal.priority)}</span><h2>{goal.title}</h2><p>{goal.desiredOutcome}</p></div><div className="actions"><button onClick={() => setEditing(true)}>Edit contract</button><button disabled={saving} onClick={togglePause}>{goal.state === "paused" ? "Resume" : "Pause"}</button></div></div>
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
    <div className="milestone-progress"><strong>{milestone.completionPercentage}%</strong><ProgressBar value={milestone.completionPercentage} /><button onClick={() => setEditing(true)}>Edit</button></div>
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
    <Heading eyebrow={`${goals.filter(goal => goal.state === "active").length} active goals`} title="Keep the contract current" copy="Update the next milestone. Progress is the weighted percentage of dated outcomes—not a count of activity. Add one goal or paste a JSON pack from + Add goal." action={<button className="primary" onClick={addGoal}>+ Add goal</button>} />
    {!selected ? <article className="box empty"><h2>No goals yet</h2><p>Create your first outcome and define how you will know it is achieved. You can also paste a JSON pack from + Add goal.</p><button className="primary" onClick={addGoal}>Create a goal</button></article> : <div className="goals-layout"><GoalList goals={goals} selectedId={selected.id} select={id => { setAddingMilestone(false); select(id); }} /><div className="goal-detail"><GoalContract key={selected.id} goal={selected} changed={refresh} /><article className="box milestone-panel"><div className="between"><div><span className="label">MILESTONES · {selected.milestones.length}</span><h2>Dated outcomes</h2></div><button onClick={() => setAddingMilestone(true)}>+ Add milestone</button></div><div className="milestone-table">{selected.milestones.map(milestone => <MilestoneEditor key={`${milestone.id}-${milestone.completionPercentage}-${milestone.status}-${milestone.targetDate}-${milestone.weight}`} milestone={milestone} saved={refresh} removed={refresh} />)}</div>{addingMilestone && <AddMilestone goal={selected} saved={refresh} close={() => setAddingMilestone(false)} />}{!selected.milestones.length && !addingMilestone && <p className="empty-line">This goal needs at least one dated milestone before it can be planned.</p>}</article></div></div>}
  </>;
}

function TodayPage({ goals, data, mutate, planPayload, openProgram, sampleData, refreshWithModel, planning }: { goals: Goal[]; data: WorkspaceData; mutate: (action: string, payload?: Record<string, unknown>) => Promise<void>; planPayload: PlanPayload | null; openProgram: (view: View, goalId?: string) => void; sampleData?: boolean; refreshWithModel: () => Promise<void>; planning?: boolean }) {
  const [capacity, setCapacity] = useState<{ remainingMinutes?: number; nextSlot?: { startAt: string } } | null>(null);
  const candidates = goals.flatMap(goal => goal.milestones.map(milestone => ({ goal, milestone, score: goal.priority * 10 + Math.max(0, 20 - Math.ceil((new Date(milestone.targetDate).getTime() - Date.now()) / 86_400_000)) + (100 - milestone.completionPercentage) / 10 }))).filter(item => item.goal.state === "active" && item.milestone.completionPercentage < 100 && item.milestone.status !== "skipped").sort((a, b) => b.score - a.score).slice(0, 3);
  const planPriorities = planPayload?.plan?.priorities ?? [];
  const minuteTotal = planPriorities.reduce((sum, item) => sum + item.estimatedMinutes, 0) || 1;
  const rawAllocations = planPriorities.map(item => Math.round(item.estimatedMinutes / minuteTotal * 100));
  const priorAllocation = rawAllocations.slice(0, -1).reduce((sum, value) => sum + value, 0);
  const priorities = planPriorities.map((item, index) => ({ ...item, allocation: index === planPriorities.length - 1 ? 100 - priorAllocation : rawAllocations[index] }));
  const preference = data.calendarPreferences[0];
  const timeZone = preferredTimezone(preference?.timezone);
  const todayStamp = calendarDayStamp(timeZone);
  const icsConfigured = Number(preference?.ics_configured ?? 0) === 1;
  const todayRows = data.calendar.filter(item => occupiesCalendarDay(asTimeBlock(item), todayStamp, timeZone));
  const calendar = visibleTimelineBlocks(todayRows);
  const conflictClusters = overlapClusters(calendar.map(asTimeBlock), todayStamp, timeZone);
  const conflictIds = new Set(conflictClusters.flatMap(cluster => cluster.ids));
  const calendarMinutes = calendar.reduce((total, item) => total + Math.max(0, (new Date(String(item.end_at)).getTime() - new Date(String(item.start_at)).getTime()) / 60_000), 0);
  const calendarHours = `${Math.floor(calendarMinutes / 60)}h ${Math.round(calendarMinutes % 60)}m`;
  const hasGoogleEventsToday = todayRows.some(item => item.source === "google_calendar" && String(item.state) !== "dismissed");
  const googleEventCount = data.calendar.filter(item => item.source === "google_calendar" && String(item.state) !== "dismissed").length;
  const readStatus = calendarReadStatus({ icsConfigured, googleEventCount, todayBlockCount: calendar.length });
  const dateHeading = formatInTimezone(new Date(), timeZone, { weekday: "long", day: "numeric", month: "long" });
  const initialFocusStart = () => { const value = new Date(Date.now() + 86_400_000); value.setHours(10, 0, 0, 0); return new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); };
  const [focusMilestoneId, setFocusMilestoneId] = useState(candidates[0]?.milestone.id ?? "");
  const [focusTitle, setFocusTitle] = useState(candidates[0]?.milestone.title ?? "Goal focus block");
  const [focusStart, setFocusStart] = useState(initialFocusStart);
  const [focusDuration, setFocusDuration] = useState(45);
  const [calendarOpen, setCalendarOpen] = useState(() => calendarControlsStartOpen(icsConfigured, hasGoogleEventsToday, readStatus.kind));
  const [icsUrl, setIcsUrl] = useState("");
  const calendarPolicy = String(preference?.policy ?? "auto_create");
  const openCalendarBlocks = data.calendar.filter(item => ["proposed", "approved_pending", "write_failed"].includes(String(item.state)));
  const pendingWrites = data.calendarWriteRequests.filter(item => item.status === "approved_pending").length;
  const openEmailSignals = data.emailSignals.filter(item => item.status === "open");
  const generation = planPayload?.plan?.generation?.mode === "model"
    ? planPayload.plan.generation?.provider === "deepseek" ? "DeepSeek" : "Live model"
    : planPayload?.model?.status === "fallback" ? "Fallback rules" : "Local rules";

  useEffect(() => {
    void fetch("/api/operator/calendar").then(response => response.json()).then(payload => setCapacity(payload));
  }, [goals, data]);

  async function submitFocus(event: FormEvent) {
    event.preventDefault();
    const candidate = candidates.find(item => item.milestone.id === focusMilestoneId) ?? candidates[0];
    const start = new Date(focusStart);
    const end = new Date(start.getTime() + focusDuration * 60_000);
    await mutate("propose_calendar_block", { title: focusTitle, goalId: candidate?.goal.id, milestoneId: candidate?.milestone.id, startAt: start.toISOString(), endAt: end.toISOString() });
  }

  return <><Heading eyebrow={dateHeading} title="Three moves for today" copy="Open a card to do the work. Approve any calendar time that needs you first." agent="Today" action={<div className="heading-actions"><button type="button" onClick={() => mutate("request_calendar_sync")}>Refresh</button><button type="button" className="primary" disabled={planning} onClick={() => void refreshWithModel()}>{planning ? "Refreshing…" : "Refresh with model"}</button></div>} />
    {sampleData && <article className="box"><span className="label">SAMPLE DATA</span><h2>This laptop is still on the walkthrough pack</h2><p>Open You to paste your résumé and import goals JSON. Sample jobs and goals are not yours until you replace them.</p><button className="primary" type="button" onClick={() => openProgram("Setup")}>Make it yours</button></article>}
    <div className="today-summary box"><div><span className="label">RECOMMENDED SHAPE · {generation}</span><h2>{planPayload?.plan?.summary ?? "Loading today’s plan…"}</h2><p>{readStatus.kind === "live" ? `Google read is live. Today currently has ${calendar.length} blocks covering ${calendarHours}.` : readStatus.kind === "stale" ? `Showing ${calendar.length} blocks covering ${calendarHours}. ${readStatus.detail}` : `${readStatus.detail} Today currently has ${calendar.length} blocks covering ${calendarHours}.`}{typeof capacity?.remainingMinutes === "number" ? ` ${capacity.remainingMinutes} minutes of an 8-hour focus budget remain.` : ""}</p></div></div>
    {openCalendarBlocks.length > 0 && <article className="box calendar-queue needs-you"><div className="between"><span className="label">NEEDS YOU · {openCalendarBlocks.length} calendar {openCalendarBlocks.length === 1 ? "block" : "blocks"}</span>{pendingWrites > 0 && <small>{pendingWrites} waiting for calendar worker</small>}</div>{openCalendarBlocks.map(item => <div key={String(item.id)}><span><strong>{String(item.title)}</strong><small>{new Intl.DateTimeFormat("en-IN", { weekday:"short", day:"numeric", month:"short", hour:"2-digit", minute:"2-digit", timeZone: timeZone }).format(new Date(String(item.start_at)))} · {statusLabel(String(item.state))}</small>{item.state === "write_failed" && <em>The calendar write failed and needs another review.</em>}</span>{item.state === "proposed" && <div className="actions"><button className="primary" onClick={() => mutate("review_calendar_block", { id: item.id, decision: "approve" })}>Approve & add</button><button onClick={() => mutate("review_calendar_block", { id: item.id, decision: "dismiss" })}>Dismiss</button></div>}{item.state === "write_failed" && <button onClick={() => mutate("retry_calendar_write", { id: item.id })}>Retry write</button>}</div>)}</article>}
    <div className="priority-grid">{priorities.map((item, index) => { const destination = programForDomain(item.domain, item.title, item.goalId); return <button type="button" className="box priority-card" key={`${item.id}-${index}`} onClick={() => openProgram(destination, item.goalId)}><div className="priority-number">0{index + 1}</div><span className="label">{item.domain}</span><h2>{item.title}</h2><p>{item.reason}</p><div className="allocation"><strong>{item.allocation}%</strong><span><i style={{ width: `${item.allocation}%` }} /></span></div><small>{item.estimatedMinutes} min · {Math.round(item.confidence * 100)}% confidence{item.dueDate ? ` · due ${formatDate(item.dueDate)}` : ""}</small><em className="priority-open">Open {destination} →</em></button>; })}{priorities.length === 0 && <article className="box"><p>The plan will appear here once goals or roles are available.</p></article>}</div>
    {conflictClusters.length > 0 && <article className="box calendar-conflicts"><div className="between"><span className="label">CONFLICTS · {conflictClusters.reduce((sum, cluster) => sum + cluster.count, 0)} overlapping</span><small>{conflictClusters.length === 1 ? "Same-day intervals intersect" : `${conflictClusters.length} clusters`}</small></div>{conflictClusters.map(cluster => <div key={`${cluster.startAt}-${cluster.endAt}-${cluster.ids.join("|")}`}><span><strong>{formatConflictCallout(cluster, timeZone)}</strong><small>{formatConflictRange(cluster, timeZone)} · {cluster.titles.join(" · ")}</small></span></div>)}</article>}
    <article className="box"><div className="section-row"><div><span className="label">CALENDAR · TODAY</span><h2>Protect this time</h2></div><div className={`connector ${readStatus.kind === "live" ? "connected" : "not_connected"}`}><span>Google Calendar</span><b>{readStatus.label}</b><small>{readStatus.detail}</small></div></div><div className="timeline">{calendar.map(item => <div key={String(item.id)} className={`${String(item.ownership)}${conflictIds.has(String(item.id)) ? " conflict" : ""}`}><time>{formatInTimezone(String(item.start_at), timeZone, { hour: "2-digit", minute: "2-digit" })}</time><span>{item.event_url ? <a href={String(item.event_url)} target="_blank" rel="noreferrer"><strong>{String(item.title)}</strong></a> : <strong>{String(item.title)}</strong>}<small>{item.source === "google_calendar" ? "Google Calendar" : item.source === "sample" ? "Sample" : statusLabel(String(item.ownership))} · {statusLabel(String(item.state))}{conflictIds.has(String(item.id)) ? " · Overlaps" : ""}</small></span></div>)}{calendar.length === 0 && <p className="empty-line">No calendar blocks are scheduled for today.</p>}</div>{(planPayload?.plan?.signals?.length ?? 0) > 0 || openEmailSignals.length > 0 ? <ul className="today-signals">{(planPayload?.plan?.signals ?? []).slice(0, 4).map(signal => <li key={signal.id}><b>{statusLabel(signal.category)}:</b> {signal.title}</li>)}{openEmailSignals.length > 0 && <li><b>Email:</b> {openEmailSignals.length} career signals need review.</li>}</ul> : null}</article>
    <SetupPanel title="Calendar controls" hint={icsConfigured ? "Autonomy, feed, and new goal blocks" : readStatus.kind === "stale" ? "Feed not saved — paste iCal to keep busy/free live" : "Connect Google Calendar via secret iCal URL"} open={calendarOpen} onOpenChange={setCalendarOpen}>
      <article className="box calendar-control">
        <form className="ics-connect" onSubmit={event => { event.preventDefault(); if (!icsUrl.trim()) return; void mutate("connect_calendar_ics", { icsUrl: icsUrl.trim() }).then(() => setIcsUrl("")); }}>
          <div><span className="label">GOOGLE CALENDAR · READ</span><h2>{icsConfigured ? "Live calendar feed is saved" : "Read Google Calendar without a write worker"}</h2><p>In Google Calendar: Settings → your calendar → Integrate calendar → Secret address in iCal format. Paste that URL here. Same connect is also on You (Setup). External events stay read-only. Operator blocks still land locally; Google writes remain queued.</p></div>
          <label>Secret iCal URL<input type="url" value={icsUrl} onChange={event => setIcsUrl(event.target.value)} placeholder={icsConfigured ? "Saved. Paste a new URL to replace it." : "https://calendar.google.com/calendar/ical/…/basic.ics"} /></label>
          <button className="primary">{icsConfigured ? "Replace feed" : "Connect calendar"}</button>
        </form>
        <div className="calendar-policy"><div><span className="label">CALENDAR AUTONOMY</span><h2>Choose what the Operator may do</h2><p>External meetings are always read-only. This setting applies only to goal blocks created by the Operator.</p></div><label>Permission level<select value={calendarPolicy} onChange={event => mutate("update_calendar_policy", { policy: event.target.value })}><option value="propose_only">Propose only — ask every time</option><option value="auto_create">Automatically add new goal blocks</option><option value="auto_create_and_move_owned">Add and move Operator-owned blocks</option></select></label></div>
        <form className="focus-planner" onSubmit={submitFocus}><div><span className="label">PLAN A GOAL BLOCK</span><h2>Turn a milestone into calendar time</h2></div><label>Milestone<select value={focusMilestoneId} onChange={event => { const next = candidates.find(item => item.milestone.id === event.target.value); setFocusMilestoneId(event.target.value); if (next) setFocusTitle(next.milestone.title); }}>{candidates.map(item => <option key={item.milestone.id} value={item.milestone.id}>{item.goal.title} · {item.milestone.title}</option>)}</select></label><label>Calendar title<input required value={focusTitle} onChange={event => setFocusTitle(event.target.value)} /></label><label>Start<input required type="datetime-local" value={focusStart} onChange={event => setFocusStart(event.target.value)} /></label><label>Duration<select value={focusDuration} onChange={event => setFocusDuration(Number(event.target.value))}>{[30,45,60,90].map(minutes => <option key={minutes} value={minutes}>{minutes} minutes</option>)}</select></label><button className="primary">{calendarPolicy === "propose_only" ? "Propose block" : "Add block"}</button></form>
      </article>
    </SetupPanel>
    <article className="box capture-panel">
      <div><span className="label">ADD A BLOCK</span><h2>Drop a constraint onto the calendar</h2><p>Type or dictate. The Operator places it in the next free weekday gap on this calendar. External meetings stay read-only.</p></div>
      <CaptureComposer placeholder="Prepare for Friday’s interview, 45 minutes" submitLabel="Add to calendar" onSubmit={async text => { await mutate("planning_note", { note: text }); }} />
    </article>
    {data.planningNotes.length > 0 && <article className="box note-list"><span className="label">RECENT CAPTURES · {data.planningNotes.length}</span>{data.planningNotes.slice(0, 3).map(item => <section key={String(item.id)}><p>{String(item.note)}</p><small>{String(item.result)}</small></section>)}</article>}
  </>;
}

function CareerOnboarding({ onSaved }: { onSaved: () => Promise<void> }) {
  const [profile, setProfile] = useState<Record<string, unknown> | null>(null);
  const [message, setMessage] = useState("");
  const [setupOpen, setSetupOpen] = useState(false);
  useEffect(() => { void fetch("/api/career/profile").then(response => response.json()).then(result => setProfile(result.profile)); }, []);
  const list = (value: unknown) => Array.isArray(value) ? value.join(", ") : "";
  const split = (value: string) => value.split(",").map(item => item.trim()).filter(Boolean);
  async function save(event: FormEvent) {
    event.preventDefault(); if (!profile) return;
    const input = { targetRoles:profile.targetRoles, industries:profile.industries, locations:profile.locations, workModes:profile.workModes, seniority:profile.seniority, compensationNotes:profile.compensationNotes, strengths:profile.strengths, exclusions:profile.exclusions, resumeFilename:profile.resumeFilename, resumeText:profile.resumeText, onboardingStatus:profile.onboardingStatus };
    const response = await fetch("/api/career/profile", { method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify(input) });
    const result = await response.json();
    if (!response.ok) { setMessage(result.error ?? "Career profile could not be saved"); return; }
    setProfile(result.profile); setMessage("Filters saved. Scoring uses the résumé on You."); setSetupOpen(false); await onSaved();
  }
  if (!profile) return <article className="box onboarding-card"><p>Loading career context…</p></article>;
  return <SetupPanel title="Career filters" hint={setupOpen ? "Optional later edits — résumé lives on You" : "Roles and locations · résumé stays on You"} open={setupOpen} onOpenChange={setSetupOpen}>
    <form className="box onboarding-card" onSubmit={save}><div className="between"><div><h2>Edit filters later</h2><p>Paste or upload your résumé on You. These filters retarget scoring after that. This is not a second onboarding form.</p></div><button className="primary">Save filters</button></div><div className="onboarding-grid"><label>Target roles<input value={list(profile.targetRoles)} onChange={event => setProfile({ ...profile, targetRoles:split(event.target.value), onboardingStatus:"in_progress" })} placeholder="Senior Product Manager, Product Lead AI" /></label><label>Locations<input value={list(profile.locations)} onChange={event => setProfile({ ...profile, locations:split(event.target.value), onboardingStatus:"in_progress" })} placeholder="Bengaluru, Remote India" /></label><label>Work modes<input value={list(profile.workModes)} onChange={event => setProfile({ ...profile, workModes:split(event.target.value), onboardingStatus:"in_progress" })} placeholder="Remote, Hybrid" /></label><label>Seniority<input value={list(profile.seniority)} onChange={event => setProfile({ ...profile, seniority:split(event.target.value), onboardingStatus:"in_progress" })} placeholder="Senior, Lead, Principal" /></label><label>Industries<input value={list(profile.industries)} onChange={event => setProfile({ ...profile, industries:split(event.target.value), onboardingStatus:"in_progress" })} placeholder="AI, Fintech, Healthtech" /></label><label>Strengths<input value={list(profile.strengths)} onChange={event => setProfile({ ...profile, strengths:split(event.target.value), onboardingStatus:"in_progress" })} placeholder="0-to-1 products, AI strategy" /></label><label>Exclude<input value={list(profile.exclusions)} onChange={event => setProfile({ ...profile, exclusions:split(event.target.value), onboardingStatus:"in_progress" })} placeholder="Pure project management" /></label><label>Compensation notes<input value={String(profile.compensationNotes ?? "")} onChange={event => setProfile({ ...profile, compensationNotes:event.target.value, onboardingStatus:"in_progress" })} /></label></div><div className="between onboarding-foot"><small>{message}</small></div></form>
  </SetupPanel>;
}

function JobIntake({ refresh }: { refresh: () => Promise<void> }) {
  const emptyJob = { title: "", company: "", location: "", url: "", description: "" };
  const [job, setJob] = useState(emptyJob);
  const [board, setBoard] = useState({ provider: "greenhouse", name: "" });
  const [targets, setTargets] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const selectedBoard = COMPANY_BOARD_PROVIDERS.find(item => item.id === board.provider) ?? COMPANY_BOARD_PROVIDERS[0];
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/career/profile", { cache: "no-store" })
      .then(response => response.json())
      .then((result: { profile?: { targetRoles?: string[] } }) => {
        const roles = result.profile?.targetRoles;
        if (!cancelled) setTargets(Array.isArray(roles) ? roles.map(String).filter(Boolean) : []);
      })
      .catch(() => { if (!cancelled) setTargets([]); });
    return () => { cancelled = true; };
  }, []);
  async function post(body: Record<string, unknown>, ok: string) {
    setBusy(true);
    try {
      const response = await fetch("/api/career/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json() as { error?: string; imported?: number; skipped?: number; message?: string; sources?: string[]; cap?: number };
      const sources = Array.isArray(result.sources) && result.sources.length ? ` Sources: ${result.sources.join(", ")}.` : "";
      const cap = result.cap ? ` Cap ${result.cap}.` : "";
      setMessage(response.ok ? ok.replace("{imported}", String(result.imported ?? 1)).replace("{skipped}", String(result.skipped ?? 0)).replace("{message}", result.message ?? ok) + sources + cap : result.error ?? "The job board could not be updated");
      if (response.ok) await refresh();
    } catch {
      setMessage("The job board could not be updated");
    } finally {
      setBusy(false);
    }
  }
  return <article className="box job-intake"><div><span className="label">COLLECT ROLES</span><h2>Get roles for what you want</h2><p>We pull public job boards. We do not open LinkedIn. A collect imports up to {SEARCH_IMPORT_CAP} roles and replaces labeled sample jobs.</p></div>
    <section className="job-collect-block">
      <h3>By what I want</h3>
      <p>{targets.length ? "Uses the target roles saved on You. India listings join the collect when an India jobs key is set in .dev.vars." : "Add target roles on You first — PM, eng, design, data, or whatever you are actually targeting."}</p>
      {targets.length > 0 && <div className="job-targets">{targets.slice(0, 6).map(role => <span key={role}>{role}</span>)}</div>}
      <button className="primary" type="button" disabled={busy || targets.length === 0} onClick={() => void post({ importFrom: { provider: "targets" } }, "Imported {imported} roles for your targets ({skipped} skipped).")}>{busy ? "Collecting…" : "Get roles for my targets"}</button>
    </section>
    <form className="job-import" onSubmit={event => { event.preventDefault(); void post({ importFrom: { provider: board.provider, board: board.name } }, "Imported {imported} roles from that board ({skipped} already on the board)."); }}>
      <label>By company board<select value={board.provider} onChange={event => setBoard({ ...board, provider: event.target.value })}>{COMPANY_BOARD_PROVIDERS.map(item => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label>
      <label>Company or board token<input required value={board.name} onChange={event => setBoard({ ...board, name: event.target.value })} placeholder={selectedBoard.placeholder} /></label>
      <button disabled={busy}>Import open roles</button>
    </form>
    <form className="job-paste" onSubmit={event => { event.preventDefault(); void post(job, "Saved the posting on this table."); setJob(emptyJob); }}>
      <p className="job-paste-copy">Paste a posting URL. Paste the job link (and optional description). We save it here. We do not open LinkedIn.</p>
      <label className="job-url">Job URL<input required value={job.url} onChange={event => setJob({ ...job, url: event.target.value })} placeholder="https://www.linkedin.com/jobs/view/4291847391" /></label>
      <label>Title (optional)<input value={job.title} onChange={event => setJob({ ...job, title: event.target.value })} placeholder="Senior Product Manager, AI" /></label>
      <label>Company (optional)<input value={job.company} onChange={event => setJob({ ...job, company: event.target.value })} placeholder="Zamp" /></label>
      <label>Location (optional)<input value={job.location} onChange={event => setJob({ ...job, location: event.target.value })} placeholder="Bengaluru" /></label>
      <button className="primary" disabled={busy}>Save posting</button>
      <label className="job-snippet">Description or snippet (optional)<textarea value={job.description} onChange={event => setJob({ ...job, description: event.target.value })} rows={5} placeholder="Paste the posting text if you copied it. We do not fetch it." /></label>
    </form>
    {message && <small className="config-message">{message}</small>}
  </article>;
}

function LinkedInHandoff({ data, mutate }: { data: WorkspaceData; mutate: (action: string, payload?: Record<string, unknown>) => Promise<void> }) {
  const [url, setUrl] = useState("https://www.linkedin.com/jobs/search/?keywords=AI%20product%20manager");
  useEffect(() => {
    void fetch("/api/career/profile").then(response => response.json()).then(result => {
      const profile = result.profile as { targetRoles?: string[]; locations?: string[] } | undefined;
      const keywords = [...(profile?.targetRoles ?? []).slice(0, 3), ...(profile?.locations ?? []).slice(0, 1)].filter(Boolean).join(" ") || "AI product manager";
      setUrl(`https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(keywords)}&f_TPR=r604800`);
    });
  }, [data.jobs.length]);
  return <article className="box honest-handoff"><span className="label">BROWSER HANDOFF</span><h2>LinkedIn stays a copy-out / paste-in</h2><p>Open this search yourself, copy a /jobs/view/… link, and paste it into Collect roles. We save the URL here. We do not open LinkedIn.</p><div className="actions"><a className="button-link" href={url} target="_blank" rel="noreferrer">Open LinkedIn search</a><button onClick={() => mutate("request_linkedin")}>Mark handoff requested</button></div></article>;
}

function CareerEmail({ signals, jobs, mutate, connected }: { signals: Record<string, unknown>[]; jobs: Record<string, unknown>[]; mutate: (action: string, payload?: Record<string, unknown>) => Promise<void>; connected?: boolean }) {
  const [showRest, setShowRest] = useState(false);
  const ranked = rankCareerEmails(signals, jobs);
  const next = ranked[0];
  const rest = ranked.slice(1);
  const visible = next ? (showRest ? ranked : [next]) : [];
  const mailbox = Boolean(connected) || ranked.length > 0;
  return <article className="box email-signals">
    <div className="between"><div><span className="label">GMAIL · {mailbox ? `NEXT ACTION${ranked.length > 1 ? ` · ${ranked.length} OPEN` : ""}` : "NOT CONNECTED"}</span><h2>{next ? String(next.subject) : mailbox ? "No open career email" : "No mailbox on this machine"}</h2><p>{mailbox ? "Read-only. Ranked by whether you need to act this week — wait/track receipts stay parked. The Operator cannot send, archive, label, or delete email." : "There is no Gmail grant on this laptop. Request refresh cannot open a mailbox. Career email stays empty until a feed exists."}</p></div>{mailbox ? <button onClick={() => mutate("request_gmail_sync")}>Request refresh</button> : null}</div>
    <div>{visible.map(signal => <section key={String(signal.id)} className={signal === next ? "email-next" : ""}><div><span className="pill">{statusLabel(String(signal.category))}</span><h3>{String(signal.subject)}</h3><small>{String(signal.sender)} · {formatInTimezone(String(signal.received_at), preferredTimezone(undefined), { day:"numeric", month:"short", hour:"2-digit", minute:"2-digit" })}</small><p>{String(signal.summary)}</p><strong>Next: {String(signal.next_action)}</strong>{signal.due_at && <em>Due {formatDate(String(signal.due_at).slice(0,10))}</em>}</div><div className="actions"><a className="button-link" href={String(signal.message_url)} target="_blank" rel="noreferrer">Open Gmail</a><button className="primary" onClick={() => mutate("update_email_signal", { id: signal.id, status: "handled" })}>Mark handled</button><button className="link" onClick={() => mutate("update_email_signal", { id: signal.id, status: "dismissed" })}>Dismiss</button></div></section>)}{ranked.length === 0 && <p className="empty-line">{mailbox ? "No open career email actions." : "Not connected — this is not a mailbox refresh."}</p>}{rest.length > 0 && <button type="button" className="link" onClick={() => setShowRest(open => !open)}>{showRest ? "Park remaining threads" : `Show remaining ${rest.length}`}</button>}</div>
  </article>;
}

function CareerPage({ data, mutate, refresh }: { data: WorkspaceData; mutate: (action: string, payload?: Record<string, unknown>) => Promise<void>; refresh: () => Promise<void> }) {
  const jobs = data.jobs.filter(job => String(job.status) !== "archived" && !isQuotaSalesRole(String(job.title)));
  const [intakeOpen, setIntakeOpen] = useState(true);
  const [kanbanOpen, setKanbanOpen] = useState(jobs.length === 0);
  const [resumeChars, setResumeChars] = useState<number | null>(null);
  const emailSignals = data.emailSignals.filter(item => item.status === "open");
  const gmail = data.connectors.find(item => item.id === "gmail");
  const gmailConnected = String(gmail?.status ?? "") === "connected";
  const columns = ["recommended", "saved", "applying", "applied", "interviewing"];
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/career/profile", { cache: "no-store" })
      .then(response => response.json())
      .then((result: { profile?: { resumeText?: string } }) => {
        if (!cancelled) setResumeChars(String(result.profile?.resumeText ?? "").trim().length);
      })
      .catch(() => { if (!cancelled) setResumeChars(0); });
    return () => { cancelled = true; };
  }, [data.jobs.length]);
  const hasResume = (resumeChars ?? 0) > MIN_RESUME_CHARS;
  async function scheduleTop() {
    const response = await fetch("/api/career/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scheduleTop: true }) });
    const result = await response.json() as { message?: string; error?: string };
    if (!response.ok) throw new Error(result.error ?? "Could not propose a calendar block");
    await refresh();
  }
  const followUps = jobs.filter(job => job.follow_up_at);
  const topJob = jobs[0];
  const headingAction = topJob
    ? <div className="heading-actions">{topJob.url ? <a className="button-link" href={String(topJob.url)} target="_blank" rel="noreferrer">Open posting</a> : <button className="link" onClick={() => void scheduleTop()}>Propose application block</button>}</div>
    : <button className="primary" onClick={() => void scheduleTop()}>Propose application block</button>;
  return <><Heading eyebrow="Career" title="Move the highest-fit roles" copy={hasResume ? `Start with the ranked shortlist. ${jobs.length} role${jobs.length === 1 ? "" : "s"} on the board.` : "Sample roles stay unlabeled until you paste a résumé on You. Match is gated until then."} action={headingAction} />
    <CareerOnboarding onSaved={refresh} />
    <div className="job-shortlist">{jobs.slice(0,3).map((job,index) => {
      const sample = isSampleJob(job);
      const showScore = hasResume && !sample && Number(job.fit_score) > 0;
      return <article className="box job-card" key={String(job.id)}><div className="priority-number">0{index+1}</div><div><span className="label">{sample ? "Sample" : String(job.source)}</span><h2>{String(job.title)}</h2><p>{String(job.company)} · {String(job.location)}</p><small><b>Why:</b> {sample && !hasResume ? "Sample · not matched to your résumé" : String(job.fit_reason || job.next_action)}</small><JobCareerMatch job={job} onMatched={refresh} /></div><div className="job-fit"><strong>{showScore ? `${String(job.fit_score)}%` : sample ? "Sample" : "—"}</strong><select value={String(job.status)} onChange={event => mutate("update_job", { id: job.id, status: event.target.value, nextAction: job.next_action })}>{columns.map(status => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></div></article>;
    })}</div>
    <SetupPanel title="Application board" hint={`${jobs.length} roles in columns`} open={kanbanOpen} onOpenChange={setKanbanOpen}>
      <div className="kanban">{columns.map(column => <section className="box" key={column}><span className="label">{statusLabel(column)} · {jobs.filter(job => job.status === column).length}</span>{jobs.filter(job => job.status === column).map(job => <div className="board-card" key={String(job.id)}><strong>{String(job.title)}</strong><small>{String(job.company)}{isSampleJob(job) ? " · Sample" : ""}</small></div>)}</section>)}</div>
    </SetupPanel>
    <CareerEmail signals={emailSignals} jobs={jobs} mutate={mutate} connected={gmailConnected} />
    {followUps.length > 0 && <article className="box email-signals"><span className="label">FOLLOW-UPS · {followUps.length}</span>{followUps.map(job => <section key={String(job.id)}><div><h3>{String(job.title)}</h3><small>{String(job.company)} · due {formatDate(String(job.follow_up_at).slice(0,10))}</small><p>{String(job.next_action)}</p></div></section>)}</article>}
    <SetupPanel title="Collect roles" hint="Get roles for my targets, or paste a URL" open={intakeOpen} onOpenChange={setIntakeOpen}>
      <JobIntake refresh={refresh} />
    </SetupPanel>
    <LinkedInHandoff data={data} mutate={mutate} />
  </>;
}

function LearningConfiguration({ tasteTick = 0, onBudget }: { tasteTick?: number; onBudget?: (minutes: number) => void }) {
  const [configuration, setConfiguration] = useState<{ preferences: Record<string, unknown>; sources: Record<string, unknown>[] } | null>(null);
  const [source, setSource] = useState({ name:"", sourceType:"website", url:"", priority:3 });
  const [message, setMessage] = useState("");
  const [setupOpen, setSetupOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const refresh = async () => { const result = await fetch("/api/learning/preferences", { cache: "no-store" }).then(response => response.json()); setConfiguration(result); };
  useEffect(() => { void refresh(); }, [tasteTick]);
  useEffect(() => {
    const minutes = Number(configuration?.preferences.weeklyBudgetMinutes);
    if (onBudget && minutes > 0) onBudget(minutes);
  }, [configuration, onBudget]);
  useEffect(() => {
    if (!configuration || hydrated) return;
    setSetupOpen(configuration.sources.length === 0);
    setHydrated(true);
  }, [configuration, hydrated]);
  const list = (value: unknown) => Array.isArray(value) ? value.join(", ") : "";
  const split = (value: string) => value.split(",").map(item => item.trim()).filter(Boolean);
  async function savePreferences(event: FormEvent) { event.preventDefault(); if (!configuration) return; const response = await fetch("/api/learning/preferences", { method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ preferences:configuration.preferences }) }); const result = await response.json(); setMessage(response.ok ? "Learning preferences saved." : result.error); if (response.ok) { setSetupOpen(false); await refresh(); } }
  async function addSource(event: FormEvent) { event.preventDefault(); const response = await fetch("/api/learning/preferences", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ source }) }); const result = await response.json(); setMessage(response.ok ? "Learning source added." : result.error); if (response.ok) { setSource({ name:"", sourceType:"website", url:"", priority:3 }); await refresh(); } }
  async function toggleSource(item: Record<string, unknown>) { await fetch("/api/learning/preferences", { method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ id:item.id, source:{ enabled:!item.enabled } }) }); await refresh(); }
  if (!configuration) return <article className="box learning-config"><p>Loading learning preferences…</p></article>;
  const tracks = Array.isArray(configuration.preferences.tracks) ? configuration.preferences.tracks.map(String).filter(Boolean) : [];
  const sourceCount = configuration.sources.length;
  const sourcesHint = `${sourceCount} source${sourceCount === 1 ? "" : "s"}`;
  const trackNames = tracks.join(" · ");
  const closedHint = !tracks.length
    ? sourcesHint
    : trackNames.length <= 56
      ? `${trackNames} · ${sourcesHint}`
      : `${tracks.length} tracks · ${sourcesHint}`;
  return <SetupPanel title="Edit Aemon’s preferences" hint={setupOpen ? "Tracks, taste, and sources — injected into collection" : closedHint} open={setupOpen} onOpenChange={setSetupOpen}>
    <article className="box learning-config"><div><span className="label">Seeded from résumé</span><h2>What Aemon should follow</h2><p>Tracks and interests started from the career résumé. These lists are the source of truth — Useful / Not for me on each card updates them. Collecting fetches RSS, then {DEEPSEEK_LIVE ? "DeepSeek picks the week’s queue." : OPENAI_LIVE ? "a live model picks the week’s queue." : "deterministic ranking fills the week’s queue while live models are paused."}</p></div><form className="learning-preferences" onSubmit={savePreferences}><label>Tracks<input value={list(configuration.preferences.tracks)} onChange={event => setConfiguration({ ...configuration, preferences:{...configuration.preferences,tracks:split(event.target.value)} })} placeholder="Agentic AI products, AI product craft" /></label><label>Interests<input value={list(configuration.preferences.interests)} onChange={event => setConfiguration({ ...configuration, preferences:{...configuration.preferences,interests:split(event.target.value)} })} placeholder="Evals, RAG, tool-using agents" /></label><label>Want more of<input value={list(configuration.preferences.want)} onChange={event => setConfiguration({ ...configuration, preferences:{...configuration.preferences,want:split(event.target.value)} })} placeholder="Built from Useful feedback" /></label><label>Skip<input value={list(configuration.preferences.avoid)} onChange={event => setConfiguration({ ...configuration, preferences:{...configuration.preferences,avoid:split(event.target.value)} })} placeholder="Built from Not for me" /></label><label>Weekly minutes<input type="number" min="0" max="10080" value={Number(configuration.preferences.weeklyBudgetMinutes ?? 300)} onChange={event => setConfiguration({ ...configuration, preferences:{...configuration.preferences,weeklyBudgetMinutes:Number(event.target.value)} })} /></label><button className="primary">Save</button></form>{configuration.preferences.tasteNotes ? <pre className="taste-log">{String(configuration.preferences.tasteNotes)}</pre> : null}<form className="source-add" onSubmit={addSource}><label>Source name<input required value={source.name} onChange={event => setSource({...source,name:event.target.value})} placeholder="OpenAI research" /></label><label>Type<select value={source.sourceType} onChange={event => setSource({...source,sourceType:event.target.value})}>{["website","rss","newsletter","youtube","podcast","journal","paper_repository"].map(type => <option value={type} key={type}>{statusLabel(type)}</option>)}</select></label><label>URL<input required type="url" value={source.url} onChange={event => setSource({...source,url:event.target.value})} placeholder="https://…" /></label><label>Priority<select value={source.priority} onChange={event => setSource({...source,priority:Number(event.target.value)})}>{[5,4,3,2,1].map(value => <option key={value} value={value}>{priorityWord(value)}</option>)}</select></label><button>Add source</button></form>{message && <small className="config-message">{message}</small>}<div className="source-list">{configuration.sources.map(item => <button key={String(item.id)} className={item.enabled ? "enabled" : ""} onClick={() => toggleSource(item)}><span><strong>{String(item.name)}</strong><small>{statusLabel(String(item.sourceType))} · {priorityWord(Number(item.priority))}</small></span><b>{item.enabled ? "Following" : "Paused"}</b></button>)}</div></article>
  </SetupPanel>;
}

function LearningPage({ data, mutate, refresh }: { data: WorkspaceData; mutate: (action: string, payload?: Record<string, unknown>) => Promise<void>; refresh: () => Promise<void> }) {
  const [trackId, setTrackId] = useState("week");
  const [collecting, setCollecting] = useState("");
  const [tasteTick, setTasteTick] = useState(0);
  const [weekBudget, setWeekBudget] = useState(300);
  const track = data.tracks.find(item => item.id === trackId) ?? null;
  const weekItems = weekLearningQueue(data.learningItems);
  const items = trackId === "week"
    ? weekItems
    : data.learningItems.filter(item => item.track_id === track?.id && item.feedback !== "skip");
  const queuedMinutes = queuedLearningMinutes(weekItems);
  const remainingMinutes = Math.max(0, weekBudget - queuedMinutes);
  async function collect() {
    setCollecting("Fetching feeds…");
    const response = await fetch("/api/learning/collect", { method: "POST" });
    const result = await response.json() as { collected?: number; skipped?: number; failed?: number; candidates?: number; error?: string };
    setCollecting(response.ok ? `Queued ${result.collected ?? 0} from ${result.candidates ?? 0} fetched · skipped ${result.skipped ?? 0} · failed ${result.failed ?? 0}` : result.error ?? "Collection failed");
    if (response.ok) await refresh();
  }
  async function feedback(id: string, verdict: "useful" | "skip") {
    const response = await fetch("/api/learning/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, verdict }) });
    const result = await response.json() as { error?: string };
    if (!response.ok) throw new Error(result.error ?? "Feedback could not be saved");
    setTasteTick(value => value + 1);
    await refresh();
  }
  async function summarizeItem(id: string) {
    setCollecting("Summarizing…");
    const response = await fetch("/api/learning/collect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ summarizeId: id }) });
    const result = await response.json() as { error?: string; reused?: boolean };
    setCollecting(response.ok ? (result.reused ? "Reused the stored summary." : "Summary saved.") : result.error ?? "Summary failed");
    if (response.ok) await refresh();
  }
  return <><Heading eyebrow="Learning" title="Spend this week’s budget" copy={`${remainingMinutes} of ${weekBudget} minutes remain. This week is a short ranked queue — Useful / Not for me still trains Aemon.`} action={<button className="primary" onClick={() => void collect()}>Collect this week</button>} />
    {collecting && <p className="config-message">{collecting}</p>}
    <LearningConfiguration tasteTick={tasteTick} onBudget={setWeekBudget} />
    <div className="track-tabs"><button className={trackId === "week" ? "active" : ""} onClick={() => setTrackId("week")}><strong>This week</strong><small>{remainingMinutes} min left · {weekItems.length} queued</small></button>{data.tracks.map(item => <button key={String(item.id)} className={track?.id === item.id ? "active" : ""} onClick={() => setTrackId(String(item.id))}><strong>{String(item.name)}</strong><small>{Math.round(Number(item.weekly_budget_minutes)/60*10)/10}h / week</small></button>)}</div>
    <div className={trackId === "week" ? "resource-queue" : "resource-grid"}>{items.map((item, index) => <article className={`box resource-card ${item.feedback === "skip" ? "skipped" : ""}`} key={String(item.id)}>{trackId === "week" && <div className="priority-number">0{index + 1}</div>}<span className="pill">{String(item.item_type)} · {String(item.duration_minutes)} MIN</span><h2>{String(item.title)}</h2><p className="insight">{String(item.relevance || item.summary)}</p>{item.summary && String(item.summary) !== String(item.relevance) ? <small>{String(item.summary)}</small> : <small>{String(item.source)}</small>}{item.url ? <a className="button-link primary-link" href={String(item.url)} target="_blank" rel="noreferrer">Read article</a> : <p className="empty-line">No outbound link yet — add a source URL in preferences.</p>}{(!item.relevance || String(item.relevance) === String(item.source)) && item.url ? <button type="button" className="link" onClick={() => void summarizeItem(String(item.id))}>Summarize</button> : null}<div className="feedback-row"><button type="button" className={item.feedback === "useful" ? "active" : ""} onClick={() => void feedback(String(item.id), "useful")}>Useful</button><button type="button" className={item.feedback === "skip" ? "active" : ""} onClick={() => void feedback(String(item.id), "skip")}>Not for me</button></div><div className="actions"><button className="link" onClick={() => mutate("update_learning", { id: item.id, status: item.status === "saved" ? "recommended" : "saved" })}>{item.status === "saved" ? "Unsave" : "Save for later"}</button><button className="link" onClick={() => mutate("update_learning", { id: item.id, status: "completed" })}>Mark done</button></div><em>{item.feedback ? `${statusLabel(String(item.feedback))} · ${statusLabel(String(item.status))}` : statusLabel(String(item.status))}</em></article>)}</div>
  </>;
}

function StartupPage({ data, mutate, refresh }: { data: WorkspaceData; mutate: (action: string, payload?: Record<string, unknown>) => Promise<void>; refresh: () => Promise<void> }) {
  return <StartupLab data={data} mutate={mutate} refresh={refresh} />;
}

function ContentPage({ data, mutate, refresh, modelReady }: { data: WorkspaceData; mutate: (action: string, payload?: Record<string, unknown>) => Promise<void>; refresh: () => Promise<void>; modelReady: boolean }) {
  return <ContentWorkspace data={data} mutate={mutate} refresh={refresh} CaptureBar={CaptureComposer} modelReady={modelReady} />;
}

function MemoryPage({ goals, data, mutate, refresh }: { goals: Goal[]; data: WorkspaceData; mutate: (action: string, payload?: Record<string, unknown>) => Promise<void>; refresh: () => Promise<void> }) {
  const [adding, setAdding] = useState(false); const [decision, setDecision] = useState(""); const [rationale, setRationale] = useState("");
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [documents, setDocuments] = useState<PresentedMemoryNote[]>([]);
  const [activeId, setActiveId] = useState("goals");
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState<"read" | "edit">("read");
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [loadingNotes, setLoadingNotes] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState("");
  const load = async () => {
    setLoadError("");
    try {
      const response = await fetch("/api/memory");
      const result = await response.json() as { documents?: PresentedMemoryNote[]; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Notes could not be loaded");
      const next = result.documents ?? [];
      setDocuments(next);
      setActiveId(current => next.some(item => item.id === current) ? current : String(next[0]?.id ?? current));
    } catch (caught) {
      setLoadError(caught instanceof Error ? caught.message : "Notes could not be loaded");
    } finally {
      setLoadingNotes(false);
    }
  };
  useEffect(() => { void load(); }, [data.decisions, data.jobs, data.contentStrategy, goals]);
  const active = documents.find(item => item.id === activeId);
  useEffect(() => {
    if (mode === "read" && active) setDraft(active.body);
  }, [active, mode]);
  const displayBody = memoryDisplayBody(draft, active?.title ?? "");
  async function submit(event: FormEvent) { event.preventDefault(); await mutate("add_decision", { decision, rationale, affected: "General" }); setDecision(""); setRationale(""); setAdding(false); }
  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    const response = await fetch("/api/memory", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editing) });
    if (!response.ok) throw new Error("Decision could not be corrected");
    setEditing(null);
    await refresh();
  }
  async function remove(id: string) {
    const response = await fetch(`/api/memory?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!response.ok) throw new Error("Decision could not be removed");
    await refresh();
  }
  function openNote(id: string, body: string) {
    setActiveId(id);
    setDraft(body);
    setMode("read");
    setActionError("");
  }
  async function saveDocument() {
    if (!draft.trim()) { setActionError("Write something before saving."); return; }
    setBusy("Saving…");
    setActionError("");
    try {
      const response = await fetch("/api/memory", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: activeId, body: draft }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "This note could not be saved");
      setMode("read");
      await load();
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "This note could not be saved");
    } finally {
      setBusy("");
    }
  }
  async function updateFromView() {
    if (!active?.showUpdate) return;
    if (active.source === "edited" && !window.confirm(`${active.updateLabel}? ${active.replacesHint}`)) return;
    setBusy("Updating…");
    setActionError("");
    try {
      const response = await fetch("/api/memory", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: activeId, refresh: true }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "This note could not be updated");
      setMode("read");
      await load();
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "This note could not be updated");
    } finally {
      setBusy("");
    }
  }
  const listMeta = (item: PresentedMemoryNote) => [item.updatedShort, item.statusDetail || item.statusLabel].filter(Boolean).join(" · ");
  return <><Heading eyebrow="Memory" title="What the operator should remember" copy="These are local notes on this machine, not a cloud wiki. Open one to read or correct it. If a note is behind Goals, Career, Content, or the ledger, you can replace it with a copy of that view." />
    <div className="memory-layout">
      <aside className="memory-nav">
        {loadingNotes && !documents.length && <p className="empty-line">Loading notes…</p>}
        {!loadingNotes && loadError && !documents.length && <p className="empty-line">{loadError}</p>}
        {!loadingNotes && !loadError && !documents.length && <p className="empty-line">No notes yet. They appear once Goals, Career, Content, or decisions exist.</p>}
        {documents.map(item => <button key={item.id} className={item.id === activeId ? "active" : ""} onClick={() => openNote(item.id, item.body)}>
          <strong>{item.title}</strong>
          <span className="memory-purpose">{item.purpose}</span>
          <small className={`memory-status ${item.statusKind}`}>{listMeta(item)}</small>
        </button>)}
      </aside>
      <article className="box memory-reader">
        {!active && <div className="memory-blank"><h2>{loadError ? "Notes could not be loaded" : "Open a note"}</h2><p>{loadError || "Choose a note from the list to read what the operator uses as context."}</p>{loadError && <button className="primary" onClick={() => { setLoadingNotes(true); void load(); }}>Try again</button>}</div>}
        {active && <>
          <header className="memory-doc-head">
            <div className="between">
              <div>
                <span className="label">Local note</span>
                <h2>{active.title}</h2>
                <p>{active.purpose}</p>
                <small>{[active.updatedLabel, active.statusDetail].filter(Boolean).join(" · ")}</small>
              </div>
              <div className="actions heading-actions">
                {mode === "read"
                  ? <button className="primary" onClick={() => { setMode("edit"); setActionError(""); }}>Edit</button>
                  : <><button className="primary" disabled={Boolean(busy)} onClick={() => void saveDocument()}>Save</button><button type="button" disabled={Boolean(busy)} onClick={() => { setDraft(active.body); setMode("read"); setActionError(""); }}>Cancel</button></>}
                {mode === "read" && active.showUpdate && <button className="link" disabled={Boolean(busy)} onClick={() => void updateFromView()}>{active.updateLabel}</button>}
              </div>
            </div>
          </header>
          {mode === "read" && active.showUpdate && <p className="memory-update-hint">{active.replacesHint}</p>}
          {actionError && <p className="memory-update-hint">{actionError}</p>}
          {busy && <small className="config-message">{busy}</small>}
          {mode === "edit"
            ? <textarea className="memory-editor" value={draft} onChange={event => setDraft(event.target.value)} />
            : displayBody.trim()
              ? <Markdown value={displayBody} />
              : <p className="empty-line">{active.showUpdate ? `This note is empty. Edit it, or update it from ${active.fromLabel}.` : "This note is empty. Edit it to add context for the operator."}</p>}
        </>}
      </article>
    </div>
    <SetupPanel title="Decision ledger" hint={`Live source for the Decisions note · ${data.decisions.length} recorded`} open={ledgerOpen} onOpenChange={open => { setLedgerOpen(open); if (!open) { setAdding(false); setEditing(null); } }}>
      <div className="actions"><button className="primary" onClick={() => setAdding(true)}>+ Record decision</button></div>
      {adding && <form className="box inline-form" onSubmit={submit}><div className="between"><h2>Record a durable decision</h2><button type="button" className="icon-button" onClick={() => setAdding(false)}>×</button></div><label>Decision<input required value={decision} onChange={event => setDecision(event.target.value)} /></label><label>Why<textarea required value={rationale} onChange={event => setRationale(event.target.value)} /></label><button className="primary">Add to the ledger</button></form>}
      {editing && <form className="box inline-form" onSubmit={saveEdit}><div className="between"><h2>Correct this decision</h2><button type="button" className="icon-button" onClick={() => setEditing(null)}>×</button></div><label>Decision<input required value={String(editing.decision ?? "")} onChange={event => setEditing({ ...editing, decision: event.target.value })} /></label><label>Why<textarea required value={String(editing.rationale ?? "")} onChange={event => setEditing({ ...editing, rationale: event.target.value })} /></label><button className="primary">Save correction</button></form>}
      <article className="box"><span className="label">Decision ledger</span><div className="decision-list">{data.decisions.length ? data.decisions.map(item => <div key={String(item.id)}><time>{new Date(String(item.decided_at)).toLocaleDateString("en-IN", { day:"numeric", month:"short" })}</time><span><strong>{String(item.decision)}</strong><p>{String(item.rationale)}</p><small>{String(item.affected)}</small><div className="actions"><button className="link" onClick={() => setEditing(item)}>Correct</button><button className="link" onClick={() => void remove(String(item.id))}>Delete</button></div></span></div>) : <p className="empty-line">No decisions recorded yet. Record one if you want it copied into the Decisions note.</p>}</div></article>
    </SetupPanel>
  </>;
}

function CouncilPage({ data, mutate }: { data: WorkspaceData; mutate: (action: string, payload?: Record<string, unknown>) => Promise<void> }) {
  const proposed = data.councilProposals.filter(item => item.status === "proposed");
  const [catalog, setCatalog] = useState<{ agents?: typeof OPERATOR_AGENTS; prompts?: Record<string, unknown>[]; preferences?: Record<string, unknown> } | null>(null);
  const [selectedId, setSelectedId] = useState("tyrion");
  const [promptId, setPromptId] = useState("daily_plan");
  const [promptDraft, setPromptDraft] = useState("");
  const [message, setMessage] = useState("");
  async function load() {
    const result = await fetch("/api/operator/prompts").then(response => response.json());
    setCatalog(result);
  }
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    const agent = OPERATOR_AGENTS.find(item => item.id === selectedId) ?? OPERATOR_AGENTS[0];
    const rolePrompts = (catalog?.prompts ?? []).filter(item => item.role_id === agent.id);
    const nextId = rolePrompts.some(item => item.id === promptId) ? promptId : agent.primaryTask;
    if (nextId !== promptId) setPromptId(nextId);
    const prompt = (catalog?.prompts ?? []).find(item => item.id === nextId);
    if (prompt) setPromptDraft(String(prompt.system_prompt ?? ""));
  }, [selectedId, catalog, promptId]);
  const agent = OPERATOR_AGENTS.find(item => item.id === selectedId) ?? OPERATOR_AGENTS[0];
  const rolePrompts = (catalog?.prompts ?? []).filter(item => item.role_id === agent.id);
  const selectedPrompt = rolePrompts.find(item => item.id === promptId);
  const prefs = catalog?.preferences as { career?: Record<string, unknown>; learning?: Record<string, unknown>; content?: Record<string, unknown> } | undefined;
  const join = (value: unknown) => Array.isArray(value) && value.length ? value.map(String).join(", ") : "not set";
  const preferenceCopy = agent.id === "varys"
    ? `Roles: ${join(prefs?.career?.targetRoles)} · Locations: ${join(prefs?.career?.locations)} · Strengths: ${join(prefs?.career?.strengths)}`
    : agent.id === "aemon"
      ? `Tracks: ${join(prefs?.learning?.tracks)} · Want: ${join(prefs?.learning?.want)} · Skip: ${join(prefs?.learning?.avoid)}`
      : agent.id === "samwell"
        ? `LinkedIn posting + Medium · ${String(prefs?.content?.thesis ?? "Working thesis").slice(0, 140)}`
        : agent.id === "davos"
          ? "The open idea brief and chat history."
          : "Live goals, calendar, and jobs from Today.";
  async function savePrompt() {
    const response = await fetch("/api/operator/prompts", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: promptId, systemPrompt: promptDraft }) });
    const result = await response.json() as { message?: string; error?: string };
    setMessage(result.message ?? result.error ?? "");
    await load();
  }
  async function resetPrompt() {
    await fetch("/api/operator/prompts", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: promptId, reset: true }) });
    setMessage("Prompt restored to the default");
    await load();
  }
  return <><Heading eyebrow="Council" title="Tune how they think" copy="Edit the role prompt. Career, learning, and content preferences sit beside it and are injected at runtime." action={<button className="primary" onClick={() => mutate("run_council")}>Review this week</button>} />
    <div className="agent-switcher">{OPERATOR_AGENTS.map(role => <button type="button" className={`agent-switch ${role.id === selectedId ? "selected" : ""}`} key={role.id} onClick={() => setSelectedId(role.id)}><i>{role.label.slice(0, 1)}</i><span><strong>{role.label}</strong><small>{role.program}</small></span></button>)}</div>
    <article className="box role-brief">
      <div className="between"><div><span className="agent-chip">{agent.label} · {agent.program}</span><h2>{agent.roleName}</h2><p>{agent.mission}</p></div></div>
      <div className="brief-columns">
        <div><strong>Never automatic</strong><p>{agent.never}</p></div>
        <div><strong>Preferences in this prompt</strong><p>{preferenceCopy}</p></div>
        <div><strong>Used when</strong><p>{String(selectedPrompt?.use_when ?? agent.primaryTask)}</p></div>
      </div>
      <div className="prompt-tabs">{rolePrompts.map(item => <button type="button" key={String(item.id)} className={item.id === promptId ? "active" : ""} onClick={() => setPromptId(String(item.id))}>{String(item.title)}</button>)}</div>
      <label className="prompt-editor">System prompt<textarea value={promptDraft} onChange={event => setPromptDraft(event.target.value)} /></label>
      <div className="actions"><button className="primary" onClick={() => void savePrompt()}>Save prompt</button><button onClick={() => void resetPrompt()}>Restore default</button>{message && <small className="config-message">{message}</small>}</div>
    </article>
    <article className="box"><span className="label">Proposals needing review · {proposed.length}</span><div className="proposal-list">{proposed.length ? proposed.map(item => <div key={String(item.id)}><span><strong>{String(item.title)}</strong><p>{String(item.rationale)}</p><small>Proposed by {String(item.role_id)}</small></span><div className="actions"><button className="primary" onClick={() => mutate("update_proposal", { id: item.id, status: "accepted" })}>Accept</button><button onClick={() => mutate("update_proposal", { id: item.id, status: "rejected" })}>Dismiss</button></div></div>) : <p className="empty-line">Review this week to produce bounded, reviewable proposals.</p>}</div></article>
  </>;
}

const navGroups: { label: string; items: { name: View; mark: string; display?: string }[] }[] = [
  { label: "Plan", items: [{ name: "Today", mark: "T" }, { name: "Goals", mark: "G" }] },
  { label: "Programs", items: [{ name: "Career", mark: "C" }, { name: "Learning", mark: "L" }, { name: "Startup Lab", mark: "S" }, { name: "Content", mark: "W" }] },
  { label: "System", items: [{ name: "Setup", mark: "Y", display: "You" }, { name: "Memory", mark: "M" }, { name: "Small Council", mark: "2", display: "Council" }] },
];

export default function Home() {
  const [view, setView] = useState<View>("Today"); const [goals, setGoals] = useState<Goal[]>([]); const [data, setData] = useState<WorkspaceData>({ decisions:[], calendar:[], calendarPreferences:[], calendarWriteRequests:[], emailSignals:[], jobs:[], tracks:[], learningItems:[], startupIdeas:[], contentIdeas:[], councilRoles:[], councilProposals:[], planningNotes:[], connectors:[], contentStrategy:[] });
  const [selectedId, setSelectedId] = useState<string>(); const [creating, setCreating] = useState(false); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [toast, setToast] = useState("");
  const [planPayload, setPlanPayload] = useState<PlanPayload | null>(null);
  const [focusMode, setFocusMode] = useState(true);
  const [sampleData, setSampleData] = useState(false);
  const [planning, setPlanning] = useState(false);
  const setupOpened = useRef(false);

  useEffect(() => {
    try { setFocusMode(localStorage.getItem(FOCUS_NAV_KEY) !== "off"); } catch { setFocusMode(true); }
  }, []);

  async function loadPlan() {
    try {
      const payload = await fetch("/api/operator/plan").then(response => response.json()) as PlanPayload;
      setPlanPayload(payload);
    } catch {
      setPlanPayload({ model: { status: "fallback", reason: "The plan could not be loaded." } });
    }
  }

  async function refreshWithModel() {
    setPlanning(true);
    try {
      const payload = await fetch("/api/operator/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ live: true }) }).then(response => response.json()) as PlanPayload;
      setPlanPayload(payload);
    } catch {
      setPlanPayload({ model: { status: "fallback", reason: "The plan could not be loaded." } });
    } finally {
      setPlanning(false);
    }
  }

  async function refresh(preferredId?: string) {
    try {
      const [goalResult, workspace, setup] = await Promise.all([
        apiRequest("GET"),
        workspaceRequest(),
        fetch("/api/onboarding").then(response => response.json()) as Promise<{ onboarded?: boolean; workspaceKind?: string }>,
      ]);
      const nextGoals = goalResult.goals ?? [];
      setGoals(nextGoals);
      setData(workspace);
      setSampleData(setup.workspaceKind !== "personal");
      setSelectedId(current => preferredId ?? (current && nextGoals.some(goal => goal.id === current) ? current : nextGoals[0]?.id));
      setError("");
      if (!setupOpened.current && setup.onboarded === false) {
        setupOpened.current = true;
        setView("Setup");
      }
    }
    catch (caught) { setError(caught instanceof Error ? caught.message : "The Operator could not be loaded"); } finally { setLoading(false); }
  }
  async function mutate(action: string, payload?: Record<string, unknown>) { try { const result = await workspaceRequest(action, payload); setToast(result.message ?? "Updated"); await refresh(); window.setTimeout(() => setToast(""), 3200); } catch (caught) { setError(caught instanceof Error ? caught.message : "The change could not be saved"); } }
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void (async () => { await refresh(); await loadPlan(); })(); }, []);
  const activeCount = useMemo(() => goals.filter(goal => goal.state === "active").length, [goals]);
  const modelCopy = sidebarModelCopy(planPayload?.model, data.connectors);
  const modelsLive = modelCopy.ready;

  function openProgram(next: View, goalId?: string) {
    if (goalId) setSelectedId(goalId);
    setView(next);
  }

  function toggleFocusMode() {
    const next = !focusMode;
    setFocusMode(next);
    try { localStorage.setItem(FOCUS_NAV_KEY, next ? "on" : "off"); } catch { /* ignore */ }
  }

  const todayDoors = (planPayload?.plan?.priorities ?? [])
    .map(item => programForDomain(item.domain, item.title, item.goalId))
    .filter((name): name is View => PROGRAM_VIEWS.includes(name));
  const programsGroup = navGroups.find(group => group.label === "Programs") ?? { label: "Programs", items: [] as typeof navGroups[number]["items"] };
  const focusPrograms = splitFocusPrograms(programsGroup.items, view, todayDoors);

  function navButton(item: (typeof navGroups)[number]["items"][number], quiet = false) {
    const proposed = item.name === "Small Council" ? data.councilProposals.filter(proposal => proposal.status === "proposed").length : 0;
    return <button key={item.name} className={`${view === item.name ? "active" : ""}${quiet ? " nav-quiet" : ""}`.trim()} onClick={() => setView(item.name)}><i>{item.mark}</i><span>{item.display ?? item.name}</span>{proposed > 0 && <em>{proposed}</em>}</button>;
  }

  function page() {
    if (view === "Today") return <TodayPage goals={goals} data={data} mutate={mutate} planPayload={planPayload} openProgram={openProgram} sampleData={sampleData} refreshWithModel={refreshWithModel} planning={planning} />;
    if (view === "Goals") return <GoalsPage goals={goals} selectedId={selectedId} select={setSelectedId} refresh={refresh} addGoal={() => setCreating(true)} />;
    if (view === "Setup") return <OperatorSetup onSaved={refresh} />;
    if (view === "Career") return <CareerPage data={data} mutate={mutate} refresh={refresh} />;
    if (view === "Learning") return <LearningPage data={data} mutate={mutate} refresh={refresh} />;
    if (view === "Startup Lab") return <StartupPage data={data} mutate={mutate} refresh={refresh} />;
    if (view === "Content") return <ContentPage data={data} mutate={mutate} refresh={refresh} modelReady={modelsLive} />;
    if (view === "Memory") return <MemoryPage goals={goals} data={data} mutate={mutate} refresh={refresh} />;
    return <CouncilPage data={data} mutate={mutate} />;
  }

  return <main className="shell"><aside className="app-sidebar"><div className="brand"><b>AO</b><span><strong>AI Operator</strong><small>Personal command center</small></span></div><div className="operator-state"><span><i className={modelsLive ? "live" : "local"} />{modelCopy.title}</span><small>{activeCount} active goals · {modelCopy.detail}</small></div><button type="button" className={`nav-mode ${focusMode ? "active" : ""}`} onClick={toggleFocusMode}>{focusMode ? "Focus · Today first" : "All programs"}</button><nav>{navGroups.map(group => {
    if (group.label !== "Programs" || !focusMode) {
      return <section key={group.label}><span className="nav-label">{group.label}</span>{group.items.map(item => navButton(item))}</section>;
    }
    return <section key={group.label}>{focusPrograms.primary.length > 0 && <><span className="nav-label">Programs</span>{focusPrograms.primary.map(item => navButton(item))}</>}{focusPrograms.secondary.length > 0 && <><span className="nav-label">{focusPrograms.primary.length ? "Also" : "Programs"}</span>{focusPrograms.secondary.map(item => navButton(item))}</>}</section>;
  })}</nav><div className="sidebar-foot"><span>Local only</span><strong>This machine</strong><small>Plans and drafts stay on this computer. Nothing is hosted.</small></div></aside><section className="workspace">{error && <div className="error-banner">{error}<button className="link" onClick={() => void refresh()}>Try again</button></div>}{toast && <div className="toast">{toast}</div>}{!loading && <ModelGuide model={planPayload?.model} onRetry={() => void refreshWithModel()} />}{loading ? <div className="loading">Starting your Operator…</div> : page()}</section>{creating && <GoalForm close={() => setCreating(false)} existing={goals} demo={sampleData} created={async id => { setCreating(false); await refresh(id); }} imported={async () => { setCreating(false); await refresh(); }} />}</main>;
}
