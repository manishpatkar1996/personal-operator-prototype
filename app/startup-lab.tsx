"use client";

import { OPERATOR_AGENTS } from "@/lib/operator/agents";
import {
  buildThesisChallenge,
  composeOnePagerMarkdown,
  parseStartupWorld,
  parseThesisChallenge,
  type LabStageId,
  type StartupWorld,
} from "@/lib/operator/startup-challenge";
import {
  THESIS_FIELDS,
  YC_FRAME,
  emptyThesisFields,
  nextThesisGap,
  parseThesisClarity,
  thesisCompleteness,
  thesisFieldsFromRow,
  type ThesisFields,
} from "@/lib/operator/startup-thesis";
import { FormEvent, useEffect, useState } from "react";
import { CaptureComposer } from "./capture-composer";

type WorkspaceSlice = { startupIdeas: Record<string, unknown>[] };

const STAGES: { id: Extract<LabStageId, "frame" | "fill" | "talk" | "onepager">; n: string; label: string; hint: string }[] = [
  { id: "frame", n: "1", label: "Frame", hint: "What good looks like" },
  { id: "fill", n: "2", label: "Fill", hint: "Write the canvas" },
  { id: "talk", n: "3", label: "Test", hint: "Talk to people" },
  { id: "onepager", n: "4", label: "One-pager", hint: "Copy it out" },
];

function addDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function asList(value: unknown) {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function StartupLab({
  data,
  mutate,
  refresh,
}: {
  data: WorkspaceSlice;
  mutate: (action: string, payload?: Record<string, unknown>) => Promise<void>;
  refresh: () => Promise<void>;
}) {
  const davos = OPERATOR_AGENTS.find(agent => agent.id === "davos");
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [problem, setProblem] = useState("");
  const [targetUser, setTargetUser] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [stage, setStage] = useState<(typeof STAGES)[number]["id"]>("frame");
  const [draft, setDraft] = useState<ThesisFields>(emptyThesisFields());
  const [worldDraft, setWorldDraft] = useState<StartupWorld>(parseStartupWorld("{}"));
  const [notes, setNotes] = useState<Record<string, unknown>[]>([]);
  const [busy, setBusy] = useState("");
  const [copied, setCopied] = useState("");
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
  const dirty = THESIS_FIELDS.some(field => draft[field.key] !== saved[field.key]);
  const worldSaved = idea ? parseStartupWorld(idea.world_test_json ?? idea.world_json) : parseStartupWorld("{}");
  const savedChallenge = idea
    ? parseThesisChallenge(idea.challenge_json, buildThesisChallenge(saved, savedClarity, worldSaved, notes.length))
    : buildThesisChallenge(saved, savedClarity, worldSaved, notes.length);
  const challenge = savedChallenge;

  useEffect(() => {
    if (!idea) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate the canvas from the saved idea
    setDraft(thesisFieldsFromRow(idea));
    setWorldDraft(parseStartupWorld(idea.world_test_json ?? idea.world_json));
    // idea is read for the selected row; identity is selectedId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, idea?.id, idea?.thesis, idea?.field_clarity_json, idea?.world_test_json, idea?.challenge_json]);

  useEffect(() => {
    if (!idea) return;
    const filled = thesisFieldsFromRow(idea);
    const count = THESIS_FIELDS.filter(field => filled[field.key].trim()).length;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- pick Frame vs Fill when opening an idea
    setStage(count <= 1 ? "frame" : "fill");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, idea?.id]);

  useEffect(() => {
    if (!idea) return;
    void fetch(`/api/startup?id=${encodeURIComponent(String(idea.id))}`).then(response => response.json()).then(result => {
      setNotes(result.notes ?? []);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, idea?.id]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    await mutate("add_startup", { title, problem, targetUser, reviewDate: addDays(14) });
    setTitle(""); setProblem(""); setTargetUser(""); setAdding(false);
  }

  async function saveAndCheck() {
    if (!idea) return;
    setBusy("Checking clarity…");
    const response = await fetch("/api/startup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: idea.id, ...draft, nextValidation: draft.experiment }) });
    const result = await response.json() as { error?: string };
    setBusy(response.ok ? "" : result.error ?? "Thesis could not be saved");
    if (response.ok) await refresh();
  }

  async function challengeNow() {
    if (!idea) return;
    if (dirty) {
      setBusy("Save & check first — challenge uses the saved canvas, not live typing.");
      return;
    }
    setBusy("Challenging the thesis…");
    const response = await fetch("/api/startup/challenge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: idea.id }) });
    const result = await response.json() as { error?: string };
    setBusy(response.ok ? "" : result.error ?? "Challenge failed");
    if (response.ok) await refresh();
  }

  async function saveWorld(next: StartupWorld) {
    if (!idea) return;
    setWorldDraft(next);
    const response = await fetch("/api/startup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: idea.id, worldTest: next }) });
    if (response.ok) await refresh();
  }

  async function research() {
    if (!idea) return;
    setBusy("Rebuilding from notes…");
    const response = await fetch("/api/startup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: idea.id, research: true }) });
    const result = await response.json() as { error?: string };
    setBusy(response.ok ? "" : result.error ?? "Research failed");
    if (response.ok) await refresh();
  }

  async function addResearch(text: string, noteTitle = "Conversation note") {
    if (!idea) return;
    const response = await fetch("/api/startup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: idea.id, title: noteTitle, note: text }) });
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

  async function copyMarkdown() {
    const markdown = composeOnePagerMarkdown({ title: String(idea?.title ?? "Untitled idea"), fields: draft, worldTest: worldDraft });
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied("Copied.");
      setTimeout(() => setCopied(""), 2000);
    } catch {
      setBusy("Clipboard is blocked. Select the one-pager and copy it yourself.");
    }
  }

  async function saveMemory() {
    if (!idea) return;
    if (!completeness.complete) {
      setBusy("Save a Memory note when every field is filled and judged clear.");
      return;
    }
    setBusy("Saving a Memory note…");
    const response = await fetch("/api/startup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: idea.id, memory: true }) });
    const result = await response.json() as { error?: string; message?: string };
    setBusy(response.ok ? (result.message ?? "Saved.") : result.error ?? "Memory note could not be saved");
  }

  if (idea) {
    const filledEnough = completeness.filled === completeness.total;
    const stillAssumption = worldDraft.peopleTalked === 0;
    return <>
      <header className="page-heading">
        <div>
          {davos && <span className="agent-chip">{davos.label} · {davos.roleName}</span>}
          <span className="eyebrow">Startup Lab</span>
          <h1>{String(idea.title)}</h1>
          <p className="lede">{completeness.complete
            ? "Every field is filled and judged clear. Copy the one-pager when you want it out of the lab."
            : nextField
              ? `${nextField.label} ${gap?.status === "empty" ? "is empty" : "is not clear"}. Fill the canvas. Save & check is the gate — not typing.`
              : "Every field is filled. Save & check to see if they are actually clear."}</p>
        </div>
        <div className="heading-actions"><button type="button" onClick={() => setSelectedId(null)}>All ideas</button></div>
      </header>
      <nav className="lab-stages" aria-label="Startup Lab journey">
        {STAGES.map(item => <button key={item.id} type="button" className={stage === item.id ? "active" : ""} onClick={() => setStage(item.id)}><b>{item.n}</b><span>{item.label}</span><small>{item.hint}</small></button>)}
      </nav>
      <div className="startup-lab">
        <div className="lab-main">
          {stage === "frame" && <section className="box idea-brief">
            <h2>{YC_FRAME.title}</h2>
            <p>{YC_FRAME.lede}</p>
            <ul className="yc-points">{YC_FRAME.points.map(point => <li key={point}>{point}</li>)}</ul>
            <p className="thesis-hint">Each field below is what a clear answer looks like. Then write yours on Fill. Empty boxes are not a thesis.</p>
            {THESIS_FIELDS.map(field => <article key={field.key} className="yc-guide">
              <div className="between"><strong>{field.label}</strong><em className={`clarity-chip ${completeness.statuses[field.key]}`}>{completeness.statuses[field.key]}</em></div>
              <p>{field.whyItMatters}</p>
              <p><span className="label">What good looks like</span> {field.goodLooksLike}</p>
              <p className="example-line"><span className="label">Example</span> {field.example}</p>
              <p className="weak-line"><span className="label">Not this</span> {field.weakLooksLike}</p>
            </article>)}
            <div className="actions"><button className="primary" type="button" onClick={() => setStage("fill")}>Write the canvas</button></div>
          </section>}
          {stage === "fill" && <form className="box idea-brief thesis-canvas lab-canvas" onSubmit={event => { event.preventDefault(); void saveAndCheck(); }}>
            <div className="between">
              <span className={`pill ${completeness.complete ? "completed" : ""}`}>{completeness.complete ? "Thesis clear" : "Incomplete"}</span>
              <strong>{completeness.filled} filled · {completeness.clear} clear</strong>
            </div>
            <div className="progress" aria-label={`${(completeness.clear / completeness.total) * 100}% complete`}><span style={{ width: `${(completeness.clear / completeness.total) * 100}%` }} /></div>
            <p className="thesis-hint">Write in plain language. Guidance stays under each field. Chat is not here — if a line is not clear, the rail will say so after Save & check.</p>
            {nextField && <div className="thesis-next"><span className="label">NEXT</span><h2>{nextField.label}</h2><p>{nextField.helper}</p></div>}
            {THESIS_FIELDS.map(field => {
              const status = completeness.statuses[field.key];
              const noteText = liveClarity[field.key]?.note ?? "";
              return <label key={field.key} className={`thesis-card status-${status}${field.key === gap?.key ? " thesis-gap" : ""}`}>
                <span className="thesis-card-head"><span>{field.label}</span><em className={`clarity-chip ${status}`}>{status}</em></span>
                <small>{field.helper}</small>
                <textarea className="tall" value={draft[field.key]} onChange={event => setDraft({ ...draft, [field.key]: event.target.value })} placeholder={field.placeholder} rows={field.key === "idea" || field.key === "problem" ? 5 : 4} />
                <details className="field-guide">
                  <summary>Example and why it matters</summary>
                  <p>{field.whyItMatters}</p>
                  <p><b>Good:</b> {field.goodLooksLike}</p>
                  <p><b>Example:</b> {field.example}</p>
                  <p><b>Not this:</b> {field.weakLooksLike}</p>
                </details>
                {status === "unclear" && noteText ? <span className="clarity-note">{noteText}</span> : null}
                {status === "empty" ? <span className="clarity-note empty">{field.label} is empty.</span> : null}
              </label>;
            })}
            <div className="actions"><button className="primary">Save & check</button><button type="button" onClick={() => setStage("talk")}>Go to Test</button></div>
            {busy && <small className="config-message">{busy}</small>}
          </form>}
          {stage === "talk" && <section className="box idea-brief">
            <h2>Test in the world</h2>
            <p>The canvas is a bet until someone else says the pain. Talk to people. Write what would change the idea. Davos will not do the conversations for you.</p>
            <div className="world-meter">
              <div className="between">
                <strong>Talked to {worldDraft.peopleTalked} {worldDraft.peopleTalked === 1 ? "person" : "people"}</strong>
                <span className={`pill ${stillAssumption ? "" : "completed"}`}>{stillAssumption ? "Still an assumption" : "Heard from people"}</span>
              </div>
              <div className="actions">
                <button type="button" onClick={() => void saveWorld({ ...worldDraft, peopleTalked: Math.max(0, worldDraft.peopleTalked - 1) })}>−</button>
                <button type="button" onClick={() => void saveWorld({ ...worldDraft, peopleTalked: worldDraft.peopleTalked + 1 })}>+</button>
              </div>
            </div>
            <label>What to ask
              <textarea className="tall" value={worldDraft.lastAsked} onChange={event => setWorldDraft({ ...worldDraft, lastAsked: event.target.value })} onBlur={() => { if (worldDraft.lastAsked !== worldSaved.lastAsked) void saveWorld(worldDraft); }} placeholder={challenge.talkPrompt} rows={3} />
            </label>
            <label>What evidence would change or kill this idea?
              <textarea className="tall" value={worldDraft.wouldChangeMind} onChange={event => setWorldDraft({ ...worldDraft, wouldChangeMind: event.target.value })} onBlur={() => { if (worldDraft.wouldChangeMind !== worldSaved.wouldChangeMind) void saveWorld(worldDraft); }} placeholder="If three people already solved this with X, or nobody will take a 20-minute call…" rows={4} />
            </label>
            <div>
              <span className="label">What to ask</span>
              <ul className="yc-points">
                <li>Walk me through the last time this broke. What did you do instead?</li>
                <li>What do you use today — a product, a spreadsheet, willpower?</li>
                <li>If this disappeared next month, what would you lose in hours or money?</li>
                <li>{challenge.talkPrompt}</li>
              </ul>
            </div>
            <div className="dump-row">
              <span className="label">Notes to self</span>
              <CaptureComposer placeholder="Paste an interview note, a competitor claim, or what you heard…" submitLabel="Save note" onSubmit={text => addResearch(text)} />
              <label className="file-dump">Add a text file<input type="file" accept=".txt,.md,.csv,.json,text/plain" onChange={event => void onDump(event.target.files?.[0])} /></label>
            </div>
            {notes.length > 0 && <div className="note-stack">{notes.slice(0, 8).map(item => <section key={String(item.id)}><strong>{String(item.title)}</strong><p>{String(item.body).slice(0, 400)}</p></section>)}</div>}
            {asList(idea.evidence_json).length > 0 && <><span className="label">What we learned (from Rebuild)</span><ul className="evidence">{asList(idea.evidence_json).map(item => <li key={item}>{item}</li>)}</ul></>}
            <div className="actions"><button className="primary" type="button" onClick={() => setStage("onepager")}>See the one-pager</button><button type="button" onClick={() => void research()}>Rebuild canvas from notes</button></div>
            {busy && <small className="config-message">{busy}</small>}
          </section>}
          {stage === "onepager" && <section className="box idea-brief one-pager">
            <div className="between">
              <h2>{completeness.complete ? "Thesis one-pager" : filledEnough ? "Draft one-pager" : "Not a one-pager yet"}</h2>
              <span className={`pill ${completeness.complete ? "completed" : ""}`}>{completeness.complete ? "Clear" : filledEnough ? "Filled, not judged clear" : `${completeness.filled}/10 filled`}</span>
            </div>
            {!completeness.complete && <p className="thesis-hint">{filledEnough ? "Every field has text, but Save & check has not judged them all clear. Copy is still useful; do not treat this as done." : "Fill the canvas first. Empty fields stay marked below."}</p>}
            <article className="pager-preview">
              {THESIS_FIELDS.map(field => <p key={field.key}><strong>{field.label}.</strong> {draft[field.key].trim() || <em>Not filled.</em>}</p>)}
              <p><strong>In the world.</strong> Talked to {worldDraft.peopleTalked}. {stillAssumption ? "Still an assumption." : "Heard from people."}</p>
              {worldDraft.wouldChangeMind.trim() ? <p><strong>Would change if.</strong> {worldDraft.wouldChangeMind}</p> : null}
            </article>
            <div className="actions">
              <button className="primary" type="button" onClick={() => void copyMarkdown()}>Copy Markdown</button>
              <button type="button" disabled={!completeness.complete} onClick={() => void saveMemory()}>Save a Memory note</button>
            </div>
            {copied && <small className="config-message">{copied}</small>}
            {busy && <small className="config-message">{busy}</small>}
            <p className="thesis-hint">Nothing is sent to Notion. Memory is a local note on this machine.</p>
          </section>}
        </div>
        <aside className="box challenge-rail">
          <div className="chat-head challenge-head"><strong>Challenge</strong><small>{dirty ? "Stale until Save & check" : challenge.source === "mini" ? "From Challenge this" : "From last check"}</small></div>
          <div className="challenge-body">
            <p className="thesis-hint">Why it might work, why it might not. Updates on Save & check or Challenge this — not while you type.</p>
            <div>
              <span className="label">What’s unclear</span>
              {challenge.unclear.length ? <ul>{challenge.unclear.slice(0, 8).map(item => <li key={item.key}><b>{item.label}</b> {item.note}</li>)}</ul> : <p className="empty-line">Nothing flagged. Save & check if this is a new draft.</p>}
            </div>
            <div>
              <span className="label">Why it might work</span>
              <ul>{challenge.whyItWorks.map(item => <li key={item}>{item}</li>)}</ul>
            </div>
            <div>
              <span className="label">Why it might not</span>
              <ul className="objections">{challenge.whyItDoesnt.map(item => <li key={item}>{item}</li>)}</ul>
            </div>
            <div>
              <span className="label">Research next</span>
              <ul>{challenge.next.map(item => <li key={item}>{item}</li>)}</ul>
            </div>
          </div>
          <div className="challenge-actions">
            <button className="primary" type="button" onClick={() => void saveAndCheck()}>Save & check</button>
            <button type="button" onClick={() => void challengeNow()}>Challenge this</button>
            {busy && <small className="config-message">{busy}</small>}
          </div>
        </aside>
      </div>
    </>;
  }

  return <>
    <header className="page-heading">
      <div>
        {davos && <span className="agent-chip">{davos.label} · {davos.roleName}</span>}
        <span className="eyebrow">Startup Lab</span>
        <h1>Build a concrete idea</h1>
        <p className="lede">Name a bet, fill a YC-shaped canvas, talk to people, and let Davos challenge what is still unclear. Chat is not the product.</p>
      </div>
      <button className="primary" onClick={() => setAdding(true)}>+ Add idea</button>
    </header>
    {adding && <form className="box inline-form" onSubmit={submit}>
      <div className="between"><h2>Name the idea</h2><button type="button" className="icon-button" onClick={() => setAdding(false)}>×</button></div>
      <p className="thesis-hint">A working title is enough. You will write the canvas next — Davos will not invent one for you.</p>
      <label>Idea title<input required value={title} onChange={event => setTitle(event.target.value)} placeholder="A weekly operator for PMs who…" /></label>
      <label>Problem, if you have one<textarea value={problem} onChange={event => setProblem(event.target.value)} placeholder="When Monday starts, they lose the morning to rebuilding the week." /></label>
      <label>First person you would email<input value={targetUser} onChange={event => setTargetUser(event.target.value)} placeholder="A staff PM who already pays for ChatGPT and a calendar" /></label>
      <button className="primary">Add to lab</button>
    </form>}
    <div className="idea-grid">{data.startupIdeas.map(item => {
      const complete = Number(item.thesis_complete) === 1;
      const clear = Number(item.thesis_clear_count ?? 0);
      const world = parseStartupWorld(item.world_test_json ?? item.world_json);
      return <button className="box idea-workspace idea-open" key={String(item.id)} onClick={() => setSelectedId(String(item.id))}>
        <div className="between"><span className={`pill ${complete ? "completed" : ""}`}>{complete ? "Thesis clear" : "Incomplete"}</span><strong>{clear}/10</strong></div>
        <h2>{String(item.title)}</h2>
        <p>{String(item.problem)}</p>
        <small>{world.peopleTalked} talked · {world.peopleTalked === 0 ? "assumption" : "heard"} · Open canvas →</small>
      </button>;
    })}</div>
  </>;
}
