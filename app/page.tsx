"use client";

import { OPERATOR_AGENTS } from "@/lib/operator/agents";
import { DEEPSEEK_LIVE, OPENAI_LIVE } from "@/lib/operator/models";
import { CaptureComposer } from "./capture-composer";
import { JobResumeVariant } from "./career-resume-variant";
import { ContentWorkspace } from "./content-workspace";
import { calendarControlsStartOpen, calendarReadStatus, visibleTimelineBlocks } from "@/lib/operator/calendar";
import { rankCareerEmails } from "@/lib/operator/career-email";
import { splitFocusPrograms } from "@/lib/operator/focus-nav";
import { isQuotaSalesRole } from "@/lib/operator/job-relevance";
import { queuedLearningMinutes, weekLearningQueue } from "@/lib/operator/learning-taste";
import { memoryDisplayBody, type PresentedMemoryNote } from "@/lib/operator/memory-notes";
import { THESIS_FIELDS, emptyThesisFields, nextThesisGap, parseThesisClarity, thesisCompleteness, thesisFieldsFromRow, type ThesisFields } from "@/lib/operator/startup-thesis";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

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
  planningNotes: Record<string, unknown>[]; connectors: Record<string, unknown>[]; contentStrategy: Record<string, unknown>[];
};

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
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
  model?: { status: string; provider?: string; reason?: string };
};

function modelGuideCopy(model?: PlanPayload["model"]) {
  if (!model || model.status === "used") return null;
  const reason = model.reason ?? "";
  if (model.status === "disabled" || /not configured|OPENAI_API_KEY|DEEPSEEK_API_KEY|No configured model/i.test(reason)) {
    return {
      title: "Running on local rules",
      lead: OPENAI_LIVE || DEEPSEEK_LIVE
        ? "No live model key is loaded. Rankings, the daily plan, calendar approvals, and your edits still work."
        : "Live models are paused. Rankings, the daily plan, calendar approvals, and your edits still work.",
      fix: OPENAI_LIVE || DEEPSEEK_LIVE
        ? "Add OPENAI_API_KEY to .dev.vars for the primary model, and DEEPSEEK_API_KEY for fallback when OpenAI is down. Restart the dev server after saving. Never paste keys into chat."
        : "Seeded and deterministic results stay in charge. Keys can remain in .dev.vars — live calls resume when the pause flags are flipped.",
    };
  }
  if (/429/.test(reason)) {
    return {
      title: "Live models did not respond",
      lead: "OpenAI is rate-limited, and DeepSeek did not take over. Local rules are covering Today so you can keep working.",
      fix: "Confirm DEEPSEEK_API_KEY is in .dev.vars, or wait and retry OpenAI. Never paste keys into chat.",
    };
  }
  if (model.status === "fallback" || reason) {
    return {
      title: "Models unavailable",
      lead: reason || "OpenAI and DeepSeek did not return a usable result. Local rules are filling in.",
      fix: "Retry when an API is healthy. Goals, calendar approvals, and boards do not need a live model.",
    };
  }
  return null;
}

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
      <span className="label">WHILE MODELS ARE PAUSED</span>
      <h2>{copy.title}</h2>
      <p>{copy.lead}</p>
      <p>{copy.fix}</p>
      <small>Still works: Today, goals, calendar approvals, the career board, memory edits. Paused or local-only: live résumé variants, drafts, research, collection, council review.</small>
    </div>
    <div className="actions">
      <button className="primary" onClick={onRetry}>Retry models</button>
      <button className="link" onClick={() => { try { sessionStorage.setItem("operator-model-guide", token); } catch { /* ignore */ } setHidden(true); }}>Continue on local rules</button>
    </div>
  </aside>;
}

function asList(value: unknown) {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch { return []; }
  }
  return [];
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
    <div className="field-row"><label>Target date<input required min={today} type="date" value={goal.targetDate} onChange={event => setGoal({ ...goal, targetDate: event.target.value })} /></label><label>Priority<select value={goal.priority} onChange={event => setGoal({ ...goal, priority: Number(event.target.value) })}>{[5,4,3,2,1].map(value => <option key={value} value={value}>{priorityWord(value)}</option>)}</select></label></div>
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
    <Heading eyebrow={`${goals.filter(goal => goal.state === "active").length} active goals`} title="Keep the contract current" copy="Update the next milestone. Progress is the weighted percentage of dated outcomes—not a count of activity." action={<button className="primary" onClick={addGoal}>+ Add goal</button>} />
    {!selected ? <article className="box empty"><h2>No goals yet</h2><p>Create your first outcome and define how you will know it is achieved.</p><button className="primary" onClick={addGoal}>Create a goal</button></article> : <div className="goals-layout"><GoalList goals={goals} selectedId={selected.id} select={id => { setAddingMilestone(false); select(id); }} /><div className="goal-detail"><GoalContract key={selected.id} goal={selected} changed={refresh} /><article className="box milestone-panel"><div className="between"><div><span className="label">MILESTONES · {selected.milestones.length}</span><h2>Dated outcomes</h2></div><button onClick={() => setAddingMilestone(true)}>+ Add milestone</button></div><div className="milestone-table">{selected.milestones.map(milestone => <MilestoneEditor key={`${milestone.id}-${milestone.completionPercentage}-${milestone.status}-${milestone.targetDate}-${milestone.weight}`} milestone={milestone} saved={refresh} removed={refresh} />)}</div>{addingMilestone && <AddMilestone goal={selected} saved={refresh} close={() => setAddingMilestone(false)} />}{!selected.milestones.length && !addingMilestone && <p className="empty-line">This goal needs at least one dated milestone before it can be planned.</p>}</article></div></div>}
  </>;
}

function TodayPage({ goals, data, mutate, planPayload, openProgram }: { goals: Goal[]; data: WorkspaceData; mutate: (action: string, payload?: Record<string, unknown>) => Promise<void>; planPayload: PlanPayload | null; openProgram: (view: View, goalId?: string) => void }) {
  const [capacity, setCapacity] = useState<{ remainingMinutes?: number; nextSlot?: { startAt: string } } | null>(null);
  const candidates = goals.flatMap(goal => goal.milestones.map(milestone => ({ goal, milestone, score: goal.priority * 10 + Math.max(0, 20 - Math.ceil((new Date(milestone.targetDate).getTime() - Date.now()) / 86_400_000)) + (100 - milestone.completionPercentage) / 10 }))).filter(item => item.goal.state === "active" && item.milestone.completionPercentage < 100 && item.milestone.status !== "skipped").sort((a, b) => b.score - a.score).slice(0, 3);
  const planPriorities = planPayload?.plan?.priorities ?? [];
  const minuteTotal = planPriorities.reduce((sum, item) => sum + item.estimatedMinutes, 0) || 1;
  const rawAllocations = planPriorities.map(item => Math.round(item.estimatedMinutes / minuteTotal * 100));
  const priorAllocation = rawAllocations.slice(0, -1).reduce((sum, value) => sum + value, 0);
  const priorities = planPriorities.map((item, index) => ({ ...item, allocation: index === planPriorities.length - 1 ? 100 - priorAllocation : rawAllocations[index] }));
  const todayRows = data.calendar.filter(item => String(item.start_at).slice(0, 10) === today);
  const calendar = visibleTimelineBlocks(todayRows);
  const calendarMinutes = calendar.reduce((total, item) => total + Math.max(0, (new Date(String(item.end_at)).getTime() - new Date(String(item.start_at)).getTime()) / 60_000), 0);
  const calendarHours = `${Math.floor(calendarMinutes / 60)}h ${Math.round(calendarMinutes % 60)}m`;
  const preference = data.calendarPreferences[0];
  const icsConfigured = Number(preference?.ics_configured ?? 0) === 1;
  const hasGoogleEventsToday = todayRows.some(item => item.source === "google_calendar" && String(item.state) !== "dismissed");
  const googleEventCount = data.calendar.filter(item => item.source === "google_calendar" && String(item.state) !== "dismissed").length;
  const readStatus = calendarReadStatus({ icsConfigured, googleEventCount, todayBlockCount: calendar.length });
  const dateHeading = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" }).format(new Date());
  const initialFocusStart = () => { const value = new Date(Date.now() + 86_400_000); value.setHours(10, 0, 0, 0); return new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); };
  const [focusMilestoneId, setFocusMilestoneId] = useState(candidates[0]?.milestone.id ?? "");
  const [focusTitle, setFocusTitle] = useState(candidates[0]?.milestone.title ?? "Goal focus block");
  const [focusStart, setFocusStart] = useState(initialFocusStart);
  const [focusDuration, setFocusDuration] = useState(45);
  const [calendarOpen, setCalendarOpen] = useState(() => calendarControlsStartOpen(icsConfigured, hasGoogleEventsToday));
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

  return <><Heading eyebrow={dateHeading} title="Three moves for today" copy="Open a card to do the work. Approve any calendar time that needs you first." agent="Today" action={<button onClick={() => mutate("request_calendar_sync")}>Refresh</button>} />
    <div className="today-summary box"><div><span className="label">RECOMMENDED SHAPE · {generation}</span><h2>{planPayload?.plan?.summary ?? "Loading today’s plan…"}</h2><p>{readStatus.kind === "live" ? `Google read is live. Today currently has ${calendar.length} blocks covering ${calendarHours}.` : readStatus.kind === "stale" ? `Showing ${calendar.length} blocks covering ${calendarHours}. ${readStatus.detail}` : `${readStatus.detail} Today currently has ${calendar.length} blocks covering ${calendarHours}.`}{typeof capacity?.remainingMinutes === "number" ? ` ${capacity.remainingMinutes} minutes of an 8-hour focus budget remain.` : ""}</p></div></div>
    {openCalendarBlocks.length > 0 && <article className="box calendar-queue needs-you"><div className="between"><span className="label">NEEDS YOU · {openCalendarBlocks.length} calendar {openCalendarBlocks.length === 1 ? "block" : "blocks"}</span>{pendingWrites > 0 && <small>{pendingWrites} waiting for calendar worker</small>}</div>{openCalendarBlocks.map(item => <div key={String(item.id)}><span><strong>{String(item.title)}</strong><small>{new Intl.DateTimeFormat("en-IN", { weekday:"short", day:"numeric", month:"short", hour:"2-digit", minute:"2-digit", timeZone:"Asia/Kolkata" }).format(new Date(String(item.start_at)))} · {statusLabel(String(item.state))}</small>{item.state === "write_failed" && <em>The calendar write failed and needs another review.</em>}</span>{item.state === "proposed" && <div className="actions"><button className="primary" onClick={() => mutate("review_calendar_block", { id: item.id, decision: "approve" })}>Approve & add</button><button onClick={() => mutate("review_calendar_block", { id: item.id, decision: "dismiss" })}>Dismiss</button></div>}{item.state === "write_failed" && <button onClick={() => mutate("retry_calendar_write", { id: item.id })}>Retry write</button>}</div>)}</article>}
    <div className="priority-grid">{priorities.map((item, index) => { const destination = programForDomain(item.domain, item.title, item.goalId); return <button type="button" className="box priority-card" key={`${item.id}-${index}`} onClick={() => openProgram(destination, item.goalId)}><div className="priority-number">0{index + 1}</div><span className="label">{item.domain}</span><h2>{item.title}</h2><p>{item.reason}</p><div className="allocation"><strong>{item.allocation}%</strong><span><i style={{ width: `${item.allocation}%` }} /></span></div><small>{item.estimatedMinutes} min · {Math.round(item.confidence * 100)}% confidence{item.dueDate ? ` · due ${formatDate(item.dueDate)}` : ""}</small><em className="priority-open">Open {destination} →</em></button>; })}{priorities.length === 0 && <article className="box"><p>The plan will appear here once goals or roles are available.</p></article>}</div>
    <article className="box"><div className="section-row"><div><span className="label">CALENDAR · TODAY</span><h2>Protect this time</h2></div><div className={`connector ${readStatus.kind === "live" ? "connected" : "not_connected"}`}><span>Google Calendar</span><b>{readStatus.label}</b><small>{readStatus.detail}</small></div></div><div className="timeline">{calendar.map(item => <div key={String(item.id)} className={String(item.ownership)}><time>{new Date(String(item.start_at)).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })}</time><span>{item.event_url ? <a href={String(item.event_url)} target="_blank" rel="noreferrer"><strong>{String(item.title)}</strong></a> : <strong>{String(item.title)}</strong>}<small>{item.source === "google_calendar" ? "Google Calendar" : statusLabel(String(item.ownership))} · {statusLabel(String(item.state))}</small></span></div>)}{calendar.length === 0 && <p className="empty-line">No calendar blocks are scheduled for today.</p>}</div>{(planPayload?.plan?.signals?.length ?? 0) > 0 || openEmailSignals.length > 0 ? <ul className="today-signals">{(planPayload?.plan?.signals ?? []).slice(0, 4).map(signal => <li key={signal.id}><b>{statusLabel(signal.category)}:</b> {signal.title}</li>)}{openEmailSignals.length > 0 && <li><b>Email:</b> {openEmailSignals.length} career signals need review.</li>}</ul> : null}</article>
    <SetupPanel title="Calendar controls" hint={icsConfigured ? "Autonomy, feed, and new goal blocks" : readStatus.kind === "stale" ? "Feed not saved — paste iCal to keep busy/free live" : "Connect Google Calendar via secret iCal URL"} open={calendarOpen} onOpenChange={setCalendarOpen}>
      <article className="box calendar-control">
        <form className="ics-connect" onSubmit={event => { event.preventDefault(); if (!icsUrl.trim()) return; void mutate("connect_calendar_ics", { icsUrl: icsUrl.trim() }).then(() => setIcsUrl("")); }}>
          <div><span className="label">GOOGLE CALENDAR · READ</span><h2>{icsConfigured ? "Live calendar feed is saved" : "Read Google Calendar without a write worker"}</h2><p>In Google Calendar: Settings → your calendar → Integrate calendar → Secret address in iCal format. Paste that URL here. External events stay read-only. Operator blocks still land locally; Google writes remain queued.</p></div>
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
  const [setupOpen, setSetupOpen] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => { void fetch("/api/career/profile").then(response => response.json()).then(result => setProfile(result.profile)); }, []);
  useEffect(() => {
    if (!profile || hydrated) return;
    setSetupOpen(profile.onboardingStatus !== "complete" && String(profile.resumeText ?? "").length < 80);
    setHydrated(true);
  }, [profile, hydrated]);
  const list = (value: unknown) => Array.isArray(value) ? value.join(", ") : "";
  const split = (value: string) => value.split(",").map(item => item.trim()).filter(Boolean);
  async function save(event: FormEvent) {
    event.preventDefault(); if (!profile) return;
    const input = { targetRoles:profile.targetRoles, industries:profile.industries, locations:profile.locations, workModes:profile.workModes, seniority:profile.seniority, compensationNotes:profile.compensationNotes, strengths:profile.strengths, exclusions:profile.exclusions, resumeFilename:profile.resumeFilename, resumeText:profile.resumeText, onboardingStatus:profile.onboardingStatus };
    const response = await fetch("/api/career/profile", { method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify(input) });
    const result = await response.json();
    if (!response.ok) { setMessage(result.error ?? "Career profile could not be saved"); return; }
    setProfile(result.profile); setMessage("Career context saved. Open roles were rescored against this résumé."); setSetupOpen(false); await onSaved();
  }
  async function onResumeFile(file: File | undefined) {
    if (!file || !profile) return;
    if (/\.pdf$/i.test(file.name) || file.type === "application/pdf") {
      setMessage(`Reading ${file.name}…`);
      const body = new FormData();
      body.set("file", file);
      const response = await fetch("/api/career/resume", { method: "POST", body });
      const result = await response.json() as { profile?: Record<string, unknown>; error?: string };
      if (!response.ok || !result.profile) { setMessage(result.error ?? "Could not read that PDF. Paste the résumé text instead."); return; }
      setProfile(result.profile);
      setMessage(`${file.name} extracted. Save career context to keep filters.`);
      await onSaved();
      return;
    }
    if (!/text|markdown|tex|plain|html/i.test(file.type || file.name) && !/\.(txt|md|tex|html)$/i.test(file.name)) {
      setMessage("Upload a PDF, or paste the résumé / a .txt / .md file.");
      return;
    }
    const resumeText = await file.text();
    setProfile({ ...profile, resumeFilename: file.name, resumeText, onboardingStatus: "in_progress" });
    setMessage(`${file.name} loaded. Save career context to rescore the board.`);
  }
  if (!profile) return <article className="box onboarding-card"><p>Loading career context…</p></article>;
  return <SetupPanel title={`Varys · Career preferences · ${statusLabel(String(profile.onboardingStatus))}`} hint={setupOpen ? "Used in Varys’s prompt" : "Edit résumé and filters"} open={setupOpen} onOpenChange={setSetupOpen}>
    <form className="box onboarding-card" onSubmit={save}><div className="between"><div><h2>Give Varys your career filter</h2><p>This context is injected into the Career Intelligence prompt. It drives fit scores, résumé variants, and LinkedIn search.</p></div><button className="primary">Save</button></div><div className="onboarding-grid"><label>Target roles<input value={list(profile.targetRoles)} onChange={event => setProfile({ ...profile, targetRoles:split(event.target.value), onboardingStatus:"in_progress" })} placeholder="Senior Product Manager, Product Lead AI" /></label><label>Locations<input value={list(profile.locations)} onChange={event => setProfile({ ...profile, locations:split(event.target.value), onboardingStatus:"in_progress" })} placeholder="Bengaluru, Remote India" /></label><label>Work modes<input value={list(profile.workModes)} onChange={event => setProfile({ ...profile, workModes:split(event.target.value), onboardingStatus:"in_progress" })} placeholder="Remote, Hybrid" /></label><label>Seniority<input value={list(profile.seniority)} onChange={event => setProfile({ ...profile, seniority:split(event.target.value), onboardingStatus:"in_progress" })} placeholder="Senior, Lead, Principal" /></label><label>Industries<input value={list(profile.industries)} onChange={event => setProfile({ ...profile, industries:split(event.target.value), onboardingStatus:"in_progress" })} placeholder="AI, Fintech, Healthtech" /></label><label>Strengths<input value={list(profile.strengths)} onChange={event => setProfile({ ...profile, strengths:split(event.target.value), onboardingStatus:"in_progress" })} placeholder="0-to-1 products, AI strategy" /></label><label>Exclude<input value={list(profile.exclusions)} onChange={event => setProfile({ ...profile, exclusions:split(event.target.value), onboardingStatus:"in_progress" })} placeholder="Pure project management" /></label><label>Compensation notes<input value={String(profile.compensationNotes ?? "")} onChange={event => setProfile({ ...profile, compensationNotes:event.target.value, onboardingStatus:"in_progress" })} /></label><label>Résumé filename<input value={String(profile.resumeFilename ?? "")} onChange={event => setProfile({ ...profile, resumeFilename:event.target.value, onboardingStatus:"in_progress" })} placeholder="manish-resume.tex" /></label><label>Upload résumé<input type="file" accept=".txt,.md,.tex,.html,.pdf,application/pdf,text/plain" onChange={event => void onResumeFile(event.target.files?.[0])} /></label><label className="resume-source">Résumé / LaTeX source<textarea value={String(profile.resumeText ?? "")} onChange={event => setProfile({ ...profile, resumeText:event.target.value, onboardingStatus:"in_progress" })} placeholder="Paste your canonical résumé or LaTeX source here." /></label></div><div className="between onboarding-foot"><small>{message}</small><label className="complete-check"><input type="checkbox" checked={profile.onboardingStatus === "complete"} onChange={event => setProfile({ ...profile, onboardingStatus:event.target.checked ? "complete" : "in_progress" })} /> Mark onboarding complete</label></div></form>
  </SetupPanel>;
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

function LinkedInHandoff({ data, mutate }: { data: WorkspaceData; mutate: (action: string, payload?: Record<string, unknown>) => Promise<void> }) {
  const [url, setUrl] = useState("https://www.linkedin.com/jobs/search/?keywords=AI%20product%20manager");
  useEffect(() => {
    void fetch("/api/career/profile").then(response => response.json()).then(result => {
      const profile = result.profile as { targetRoles?: string[]; locations?: string[] } | undefined;
      const keywords = [...(profile?.targetRoles ?? []).slice(0, 3), ...(profile?.locations ?? []).slice(0, 1)].filter(Boolean).join(" ") || "AI product manager";
      setUrl(`https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(keywords)}&f_TPR=r604800`);
    });
  }, [data.jobs.length]);
  return <article className="box honest-handoff"><span className="label">BROWSER HANDOFF</span><h2>LinkedIn collection is ready, but never hidden</h2><p>Open this search yourself. The Operator will not scrape, apply, or message. Paste interesting roles back into Collect roles.</p><div className="actions"><a className="button-link" href={url} target="_blank" rel="noreferrer">Open LinkedIn search</a><button onClick={() => mutate("request_linkedin")}>Mark handoff requested</button></div></article>;
}

function CareerEmail({ signals, jobs, mutate }: { signals: Record<string, unknown>[]; jobs: Record<string, unknown>[]; mutate: (action: string, payload?: Record<string, unknown>) => Promise<void> }) {
  const [showRest, setShowRest] = useState(false);
  const ranked = rankCareerEmails(signals, jobs);
  const next = ranked[0];
  const rest = ranked.slice(1);
  const visible = next ? (showRest ? ranked : [next]) : [];
  return <article className="box email-signals">
    <div className="between"><div><span className="label">GMAIL · NEXT ACTION{ranked.length > 1 ? ` · ${ranked.length} OPEN` : ""}</span><h2>{next ? String(next.subject) : "No open career email"}</h2><p>Read-only. Ranked by whether you need to act this week — wait/track receipts stay parked. The Operator cannot send, archive, label, or delete email.</p></div><button onClick={() => mutate("request_gmail_sync")}>Request refresh</button></div>
    <div>{visible.map(signal => <section key={String(signal.id)} className={signal === next ? "email-next" : ""}><div><span className="pill">{statusLabel(String(signal.category))}</span><h3>{String(signal.subject)}</h3><small>{String(signal.sender)} · {new Intl.DateTimeFormat("en-IN", { day:"numeric", month:"short", hour:"2-digit", minute:"2-digit", timeZone:"Asia/Kolkata" }).format(new Date(String(signal.received_at)))}</small><p>{String(signal.summary)}</p><strong>Next: {String(signal.next_action)}</strong>{signal.due_at && <em>Due {formatDate(String(signal.due_at).slice(0,10))}</em>}</div><div className="actions"><a className="button-link" href={String(signal.message_url)} target="_blank" rel="noreferrer">Open Gmail</a><button className="primary" onClick={() => mutate("update_email_signal", { id: signal.id, status: "handled" })}>Mark handled</button><button className="link" onClick={() => mutate("update_email_signal", { id: signal.id, status: "dismissed" })}>Dismiss</button></div></section>)}{ranked.length === 0 && <p className="empty-line">No open career email actions.</p>}{rest.length > 0 && <button type="button" className="link" onClick={() => setShowRest(open => !open)}>{showRest ? "Park remaining threads" : `Show remaining ${rest.length}`}</button>}</div>
  </article>;
}

function CareerPage({ data, mutate, refresh }: { data: WorkspaceData; mutate: (action: string, payload?: Record<string, unknown>) => Promise<void>; refresh: () => Promise<void> }) {
  const jobs = data.jobs.filter(job => String(job.status) !== "archived" && !isQuotaSalesRole(String(job.title)));
  const [intakeOpen, setIntakeOpen] = useState(jobs.length === 0);
  const [kanbanOpen, setKanbanOpen] = useState(jobs.length === 0);
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
  async function variant(id: string) {
    const response = await fetch("/api/career/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resumeVariant: id }) });
    if (!response.ok) {
      const result = await response.json() as { error?: string };
      throw new Error(result.error ?? "Could not generate a résumé variant");
    }
    await refresh();
  }
  const followUps = jobs.filter(job => job.follow_up_at);
  const topJob = jobs[0];
  const headingAction = topJob
    ? <div className="heading-actions"><button className="primary" onClick={() => void variant(String(topJob.id))}>Job-specific résumé</button>{topJob.url ? <a className="button-link" href={String(topJob.url)} target="_blank" rel="noreferrer">Open posting</a> : <button className="link" onClick={() => void scheduleTop()}>Propose application block</button>}</div>
    : <button className="primary" onClick={() => void scheduleTop()}>Propose application block</button>;
  return <><Heading eyebrow="Career" title="Move the highest-fit roles" copy="Start with the ranked shortlist. The board is the same four roles — keep it collapsed until the shortlist is empty." action={headingAction} />
    <CareerOnboarding onSaved={refresh} />
    <div className="job-shortlist">{jobs.slice(0,3).map((job,index) => <article className="box job-card" key={String(job.id)}><div className="priority-number">0{index+1}</div><div><span className="label">{String(job.source)}</span><h2>{String(job.title)}</h2><p>{String(job.company)} · {String(job.location)}</p><small><b>Why:</b> {String(job.fit_reason || job.next_action)}</small>{evidence(job).length > 0 && <ul className="evidence">{evidence(job).slice(0,3).map(item => <li key={item}>{item}</li>)}</ul>}<JobResumeVariant job={job} onGenerated={refresh} /></div><div className="job-fit"><strong>{String(job.fit_score)}%</strong><select value={String(job.status)} onChange={event => mutate("update_job", { id: job.id, status: event.target.value, nextAction: job.next_action })}>{columns.map(status => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></div></article>)}</div>
    <SetupPanel title="Application board" hint={`${jobs.length} roles in columns — same shortlist, collapsed until it is empty`} open={kanbanOpen} onOpenChange={setKanbanOpen}>
      <div className="kanban">{columns.map(column => <section className="box" key={column}><span className="label">{statusLabel(column)} · {jobs.filter(job => job.status === column).length}</span>{jobs.filter(job => job.status === column).map(job => <div className="board-card" key={String(job.id)}><strong>{String(job.title)}</strong><small>{String(job.company)}</small></div>)}</section>)}</div>
    </SetupPanel>
    <CareerEmail signals={emailSignals} jobs={jobs} mutate={mutate} />
    {followUps.length > 0 && <article className="box email-signals"><span className="label">FOLLOW-UPS · {followUps.length}</span>{followUps.map(job => <section key={String(job.id)}><div><h3>{String(job.title)}</h3><small>{String(job.company)} · due {formatDate(String(job.follow_up_at).slice(0,10))}</small><p>{String(job.next_action)}</p></div></section>)}</article>}
    <SetupPanel title="Collect roles" hint="Add a posting or import a public board" open={intakeOpen} onOpenChange={setIntakeOpen}>
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
  return <><Heading eyebrow="Learning" title="Spend this week’s budget" copy={`${remainingMinutes} of ${weekBudget} minutes remain. This week is a short ranked queue — Useful / Not for me still trains Aemon.`} action={<button className="primary" onClick={() => void collect()}>Collect this week</button>} />
    {collecting && <p className="config-message">{collecting}</p>}
    <LearningConfiguration tasteTick={tasteTick} onBudget={setWeekBudget} />
    <div className="track-tabs"><button className={trackId === "week" ? "active" : ""} onClick={() => setTrackId("week")}><strong>This week</strong><small>{remainingMinutes} min left · {weekItems.length} queued</small></button>{data.tracks.map(item => <button key={String(item.id)} className={track?.id === item.id ? "active" : ""} onClick={() => setTrackId(String(item.id))}><strong>{String(item.name)}</strong><small>{Math.round(Number(item.weekly_budget_minutes)/60*10)/10}h / week</small></button>)}</div>
    <div className={trackId === "week" ? "resource-queue" : "resource-grid"}>{items.map((item, index) => <article className={`box resource-card ${item.feedback === "skip" ? "skipped" : ""}`} key={String(item.id)}>{trackId === "week" && <div className="priority-number">0{index + 1}</div>}<span className="pill">{String(item.item_type)} · {String(item.duration_minutes)} MIN</span><h2>{String(item.title)}</h2><p className="insight">{String(item.relevance || item.summary)}</p>{item.summary && String(item.summary) !== String(item.relevance) ? <small>{String(item.summary)}</small> : <small>{String(item.source)}</small>}{item.url ? <a className="button-link primary-link" href={String(item.url)} target="_blank" rel="noreferrer">Read article</a> : <p className="empty-line">No outbound link yet — add a source URL in preferences.</p>}<div className="feedback-row"><button type="button" className={item.feedback === "useful" ? "active" : ""} onClick={() => void feedback(String(item.id), "useful")}>Useful</button><button type="button" className={item.feedback === "skip" ? "active" : ""} onClick={() => void feedback(String(item.id), "skip")}>Not for me</button></div><div className="actions"><button className="link" onClick={() => mutate("update_learning", { id: item.id, status: item.status === "saved" ? "recommended" : "saved" })}>{item.status === "saved" ? "Unsave" : "Save for later"}</button><button className="link" onClick={() => mutate("update_learning", { id: item.id, status: "completed" })}>Mark done</button></div><em>{item.feedback ? `${statusLabel(String(item.feedback))} · ${statusLabel(String(item.status))}` : statusLabel(String(item.status))}</em></article>)}</div>
  </>;
}

function StartupPage({ data, mutate, refresh }: { data: WorkspaceData; mutate: (action: string, payload?: Record<string, unknown>) => Promise<void>; refresh: () => Promise<void> }) {
  const [adding, setAdding] = useState(false); const [title, setTitle] = useState(""); const [problem, setProblem] = useState(""); const [targetUser, setTargetUser] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ThesisFields>(emptyThesisFields());
  const [messages, setMessages] = useState<Record<string, unknown>[]>([]);
  const [notes, setNotes] = useState<Record<string, unknown>[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [showClear, setShowClear] = useState(false);
  const davosRef = useRef<HTMLTextAreaElement>(null);
  const idea = data.startupIdeas.find(item => String(item.id) === selectedId) ?? null;
  const saved = idea ? thesisFieldsFromRow(idea) : emptyThesisFields();
  const savedClarity = idea ? parseThesisClarity(idea.field_clarity_json) : {};
  const liveClarity = { ...savedClarity };
  for (const field of THESIS_FIELDS) {
    if (draft[field.key] !== saved[field.key]) delete liveClarity[field.key];
  }
  const completeness = thesisCompleteness(draft, liveClarity);
  const gap = nextThesisGap(draft, liveClarity);
  const nextField = gap ? THESIS_FIELDS.find(field => field.key === gap.key) ?? null : null;
  const openFields = THESIS_FIELDS.filter(field => completeness.statuses[field.key] !== "clear");
  const clearFields = THESIS_FIELDS.filter(field => completeness.statuses[field.key] === "clear");
  function thesisCard(field: (typeof THESIS_FIELDS)[number]) {
    const status = completeness.statuses[field.key];
    const noteText = liveClarity[field.key]?.note ?? "";
    return <label key={field.key} className={`thesis-card status-${status}${field.key === gap?.key ? " thesis-gap" : ""}`}>
      <span className="thesis-card-head"><span>{field.label}</span><em className={`clarity-chip ${status}`}>{status}</em></span>
      <small>{field.helper}</small>
      <textarea value={draft[field.key]} onChange={event => setDraft({ ...draft, [field.key]: event.target.value })} placeholder={field.placeholder} rows={field.key === "idea" || field.key === "problem" ? 3 : 2} />
      {status === "unclear" && noteText ? <span className="clarity-note">{noteText}</span> : null}
    </label>;
  }
  useEffect(() => {
    if (!idea) return;
    setDraft(thesisFieldsFromRow(idea));
  }, [selectedId, idea?.id, idea?.thesis, idea?.field_clarity_json]);
  useEffect(() => {
    if (!idea) return;
    void fetch(`/api/startup?id=${encodeURIComponent(String(idea.id))}`).then(response => response.json()).then(result => {
      setMessages(result.messages ?? []);
      setNotes(result.notes ?? []);
    });
  }, [selectedId, idea?.id]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    await mutate("add_startup", { title, problem, targetUser, reviewDate: addDays(14) });
    setTitle(""); setProblem(""); setTargetUser(""); setAdding(false);
  }
  async function saveFields(event: FormEvent) {
    event.preventDefault();
    if (!idea) return;
    setBusy("Davos is checking clarity…");
    const response = await fetch("/api/startup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: idea.id, ...draft, nextValidation: draft.experiment }) });
    const result = await response.json() as { error?: string };
    setBusy(response.ok ? "" : result.error ?? "Thesis could not be saved");
    if (response.ok) await refresh();
  }
  async function chat(event: FormEvent) {
    event.preventDefault();
    if (!idea || !note.trim()) return;
    setBusy("Davos is thinking…");
    const response = await fetch("/api/startup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: idea.id, message: note }) });
    const result = await response.json() as { messages?: Record<string, unknown>[]; error?: string };
    setBusy(response.ok ? "" : result.error ?? "Chat failed");
    setNote("");
    if (response.ok) {
      setMessages(result.messages ?? []);
      await refresh();
    }
  }
  async function research() {
    if (!idea) return;
    setBusy("Davos is researching…");
    const response = await fetch("/api/startup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: idea.id, research: true }) });
    const result = await response.json() as { error?: string };
    setBusy(response.ok ? "" : result.error ?? "Research failed");
    if (response.ok) await refresh();
  }
  async function addResearch(text: string, title = "Research note") {
    if (!idea) return;
    const response = await fetch("/api/startup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: idea.id, title, note: text }) });
    const result = await response.json() as { notes?: Record<string, unknown>[]; error?: string };
    if (!response.ok) throw new Error(result.error ?? "Note could not be saved");
    setNotes(result.notes ?? []);
  }
  async function onDump(file: File | undefined) {
    if (!file || !idea) return;
    if (file.type.startsWith("text") || /\.(txt|md|csv|json)$/i.test(file.name)) {
      await addResearch(await file.text(), file.name);
      return;
    }
    setBusy("PDF/binary files are not parsed here. Paste the text, or dump a .txt / .md file.");
  }
  if (idea) {
    return <><Heading eyebrow="Startup Lab" title={String(idea.title)} copy={nextField ? `Next: ${nextField.label}${gap?.status === "empty" ? " is empty" : " is unclear"}. Collapse the rest. Save & check is the gate to Thesis clear.` : "Every field is filled and judged clear."} action={<div className="heading-actions">{nextField ? <button className="primary" type="button" onClick={() => davosRef.current?.focus()}>Talk to Davos</button> : null}<button type="button" onClick={() => setSelectedId(null)}>All ideas</button></div>} />
      <div className="workspace-split">
        <form className="box idea-brief thesis-canvas" onSubmit={saveFields}>
          <div className="between">
            <span className={`pill ${completeness.complete ? "completed" : ""}`}>{completeness.complete ? "Thesis clear" : "Incomplete"}</span>
            <strong>{completeness.filled} filled · {completeness.clear} clear</strong>
          </div>
          <ProgressBar value={(completeness.clear / completeness.total) * 100} />
          <p className="thesis-hint">{nextField ? `Lead with ${nextField.label}. Clear fields are a strip until you expand them.` : "Matter-of-fact, like a YC application. Complete only when every field is filled and judged clear."}</p>
          {nextField && <div className="thesis-next"><span className="label">NEXT FIELD</span><h2>{nextField.label}</h2><p>{nextField.helper}</p></div>}
          {openFields.map(field => thesisCard(field))}
          {clearFields.length > 0 && <div className="thesis-clear-strip"><button type="button" className="link" onClick={() => setShowClear(open => !open)}>{clearFields.length} clear · {showClear ? "Hide" : "Show"}</button>{showClear ? clearFields.map(field => thesisCard(field)) : <p>{clearFields.map(field => `${field.label}: ${draft[field.key].slice(0, 72)}`).join(" · ")}</p>}</div>}
          {asList(idea.evidence_json).length > 0 && <><span className="label">WHAT WE LEARNED</span><ul className="evidence">{asList(idea.evidence_json).map(item => <li key={item}>{item}</li>)}</ul></>}
          {asList(idea.citations_json).length > 0 && <ul className="evidence quiet">{asList(idea.citations_json).map(item => <li key={item}>{item}</li>)}</ul>}
          <div className="dump-row">
            <span className="label">DUMP RESEARCH</span>
            <CaptureComposer placeholder="Paste an interview note, competitor claim, or assumption…" submitLabel="Add to thesis" onSubmit={text => addResearch(text)} />
            <label className="file-dump">Add a text file<input type="file" accept=".txt,.md,.csv,.json,text/plain" onChange={event => void onDump(event.target.files?.[0])} /></label>
          </div>
          {notes.length > 0 && <div className="note-stack">{notes.slice(0, 6).map(item => <section key={String(item.id)}><strong>{String(item.title)}</strong><p>{String(item.body).slice(0, 280)}</p></section>)}</div>}
          <div className="actions"><button className="primary">Save & check</button><button type="button" onClick={() => void research()}>Rebuild from notes</button></div>
          {busy && <small className="config-message">{busy}</small>}
        </form>
        <section className="box chat-pane">
          <div className="chat-head"><strong>Davos</strong><small>Builder · one question, then update a field</small></div>
          <div className="chat-log">{messages.map(item => <div key={String(item.id)} className={String(item.role)}><b>{item.role === "agent" ? "Davos" : "You"}</b><p>{String(item.content)}</p></div>)}{messages.length === 0 && <p className="empty-line">Start with who hurts, and what breaks for them today.</p>}</div>
          <form className="chat-compose" onSubmit={chat}><textarea ref={davosRef} value={note} onChange={event => setNote(event.target.value)} placeholder="The idea is for people who…" /><button className="primary" disabled={!note.trim() || Boolean(busy)}>Send</button></form>
          {busy && <small className="config-message">{busy}</small>}
        </section>
      </div>
    </>;
  }
  return <><Heading eyebrow="Startup Lab" title="A portfolio of ideas, not one bet" copy="Open an idea and fill the thesis canvas. An idea is not complete until every field is filled and judged clear." action={<button className="primary" onClick={() => setAdding(true)}>+ Add idea</button>} />
    {adding && <form className="box inline-form" onSubmit={submit}><div className="between"><h2>Capture a new idea</h2><button type="button" className="icon-button" onClick={() => setAdding(false)}>×</button></div><label>Idea title<input required value={title} onChange={event => setTitle(event.target.value)} /></label><label>Problem statement<textarea value={problem} onChange={event => setProblem(event.target.value)} /></label><label>Target user<input value={targetUser} onChange={event => setTargetUser(event.target.value)} /></label><button className="primary">Add to lab</button></form>}
    <div className="idea-grid">{data.startupIdeas.map(item => {
      const complete = Number(item.thesis_complete) === 1;
      const clear = Number(item.thesis_clear_count ?? 0);
      return <button className="box idea-workspace idea-open" key={String(item.id)} onClick={() => setSelectedId(String(item.id))}><div className="between"><span className={`pill ${complete ? "completed" : ""}`}>{complete ? "Thesis clear" : "Incomplete"}</span><strong>{clear}/10</strong></div><h2>{String(item.title)}</h2><p>{String(item.problem)}</p><small>Open canvas →</small></button>;
    })}</div>
  </>;
}

function ContentPage({ data, mutate, refresh }: { data: WorkspaceData; mutate: (action: string, payload?: Record<string, unknown>) => Promise<void>; refresh: () => Promise<void> }) {
  return <ContentWorkspace data={data} mutate={mutate} refresh={refresh} CaptureBar={CaptureComposer} />;
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
  { label: "System", items: [{ name: "Memory", mark: "M" }, { name: "Small Council", mark: "2", display: "Council" }] },
];

export default function Home() {
  const [view, setView] = useState<View>("Today"); const [goals, setGoals] = useState<Goal[]>([]); const [data, setData] = useState<WorkspaceData>({ decisions:[], calendar:[], calendarPreferences:[], calendarWriteRequests:[], emailSignals:[], jobs:[], tracks:[], learningItems:[], startupIdeas:[], contentIdeas:[], councilRoles:[], councilProposals:[], planningNotes:[], connectors:[], contentStrategy:[] });
  const [selectedId, setSelectedId] = useState<string>(); const [creating, setCreating] = useState(false); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [toast, setToast] = useState("");
  const [planPayload, setPlanPayload] = useState<PlanPayload | null>(null);
  const [focusMode, setFocusMode] = useState(true);

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

  async function refresh(preferredId?: string) {
    try { const [goalResult, workspace] = await Promise.all([apiRequest("GET"), workspaceRequest()]); const nextGoals = goalResult.goals ?? []; setGoals(nextGoals); setData(workspace); setSelectedId(current => preferredId ?? (current && nextGoals.some(goal => goal.id === current) ? current : nextGoals[0]?.id)); setError(""); await loadPlan(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "The Operator could not be loaded"); } finally { setLoading(false); }
  }
  async function mutate(action: string, payload?: Record<string, unknown>) { try { const result = await workspaceRequest(action, payload); setToast(result.message ?? "Updated"); await refresh(); window.setTimeout(() => setToast(""), 3200); } catch (caught) { setError(caught instanceof Error ? caught.message : "The change could not be saved"); } }
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void refresh(); }, []);
  const activeCount = useMemo(() => goals.filter(goal => goal.state === "active").length, [goals]);
  const guide = modelGuideCopy(planPayload?.model);
  const provider = planPayload?.model?.provider;
  const used = planPayload?.model?.status === "used";
  const modelsLive = used || (!guide && data.connectors.some(item => item.id === "llm" && item.status === "connected"));
  const statusLabelText = used && provider === "deepseek"
    ? "DeepSeek"
    : modelsLive
      ? "Models connected"
      : /429/.test(planPayload?.model?.reason ?? "")
        ? "Local rules · rate limited"
        : "Local rules";

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
    if (view === "Today") return <TodayPage goals={goals} data={data} mutate={mutate} planPayload={planPayload} openProgram={openProgram} />;
    if (view === "Goals") return <GoalsPage goals={goals} selectedId={selectedId} select={setSelectedId} refresh={refresh} addGoal={() => setCreating(true)} />;
    if (view === "Career") return <CareerPage data={data} mutate={mutate} refresh={refresh} />;
    if (view === "Learning") return <LearningPage data={data} mutate={mutate} refresh={refresh} />;
    if (view === "Startup Lab") return <StartupPage data={data} mutate={mutate} refresh={refresh} />;
    if (view === "Content") return <ContentPage data={data} mutate={mutate} refresh={refresh} />;
    if (view === "Memory") return <MemoryPage goals={goals} data={data} mutate={mutate} refresh={refresh} />;
    return <CouncilPage data={data} mutate={mutate} />;
  }

  return <main className="shell"><aside className="app-sidebar"><div className="brand"><b>AO</b><span><strong>AI Operator</strong><small>Personal command center</small></span></div><div className="operator-state"><span><i className={modelsLive ? "live" : "local"} />{statusLabelText}</span><small>{activeCount} active goals{modelsLive ? "" : " · no live models"}</small></div><button type="button" className={`nav-mode ${focusMode ? "active" : ""}`} onClick={toggleFocusMode}>{focusMode ? "Focus · Today first" : "All programs"}</button><nav>{navGroups.map(group => {
    if (group.label !== "Programs" || !focusMode) {
      return <section key={group.label}><span className="nav-label">{group.label}</span>{group.items.map(item => navButton(item))}</section>;
    }
    return <section key={group.label}>{focusPrograms.primary.length > 0 && <><span className="nav-label">Programs</span>{focusPrograms.primary.map(item => navButton(item))}</>}{focusPrograms.secondary.length > 0 && <><span className={`nav-label${focusPrograms.primary.length ? " nav-quiet-label" : ""}`}>{focusPrograms.primary.length ? "More" : "Programs"}</span>{focusPrograms.secondary.map(item => navButton(item, true))}</>}</section>;
  })}</nav><div className="sidebar-foot"><span>Next daily run</span><strong>Tomorrow · 10:00</strong><small>Runs when this Mac is available</small></div></aside><section className="workspace">{error && <div className="error-banner">{error}<button className="link" onClick={() => void refresh()}>Try again</button></div>}{toast && <div className="toast">{toast}</div>}{!loading && <ModelGuide model={planPayload?.model} onRetry={() => void loadPlan()} />}{loading ? <div className="loading">Starting your Operator…</div> : page()}</section>{creating && <GoalForm close={() => setCreating(false)} created={async id => { setCreating(false); await refresh(id); }} />}</main>;
}
