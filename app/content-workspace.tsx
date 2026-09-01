"use client";

import { OPERATOR_AGENTS } from "@/lib/operator/agents";
import {
  draftLengthLabel,
  evaluateDraftCraft,
  formatLabel,
  parseContentFormat,
  voiceBannerLine,
  type ContentFormat,
} from "@/lib/operator/content-craft";
import { contentGenerateCopy } from "@/lib/operator/model-status";
import { FormEvent, useEffect, useMemo, useState, type ComponentType } from "react";

type CaptureBarProps = { placeholder: string; submitLabel: string; onSubmit: (text: string) => Promise<void> };

type WorkspaceSlice = {
  contentIdeas: Record<string, unknown>[];
  contentStrategy: Record<string, unknown>[];
};

function asStringList(value: unknown) {
  return Array.isArray(value) ? value.map(String) : [];
}

function statusLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase());
}

function checkState(pass: boolean | null) {
  if (pass == null) return "idle";
  return pass ? "pass" : "fail";
}

function checkMark(pass: boolean | null) {
  if (pass == null) return "Wait";
  return pass ? "Pass" : "Fix";
}

export function ContentWorkspace({
  data,
  mutate,
  refresh,
  CaptureBar,
  modelReady = false,
}: {
  data: WorkspaceSlice;
  mutate: (action: string, payload?: Record<string, unknown>) => Promise<void>;
  refresh: () => Promise<void>;
  CaptureBar: ComponentType<CaptureBarProps>;
  modelReady?: boolean;
}) {
  const strategy = data.contentStrategy[0];
  const [thesis, setThesis] = useState(String(strategy?.thesis ?? ""));
  const [setupOpen, setSetupOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(String(data.contentIdeas[0]?.id ?? ""));
  const idea = data.contentIdeas.find(item => String(item.id) === selectedId) ?? data.contentIdeas[0];
  const [workingNotes, setWorkingNotes] = useState(String(idea?.working_notes ?? idea?.notes_text ?? ""));
  const [draft, setDraft] = useState(String(idea?.draft_text ?? ""));
  const [feedback, setFeedback] = useState("");
  const [chat, setChat] = useState("");
  const [messages, setMessages] = useState<Record<string, unknown>[]>([]);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [captureFormat, setCaptureFormat] = useState<ContentFormat>("linkedin_post");
  const [notesOpen, setNotesOpen] = useState(false);
  const format = parseContentFormat(idea?.format);
  const samwell = OPERATOR_AGENTS.find(agent => agent.id === "samwell");
  const craftChecks = useMemo(() => evaluateDraftCraft(draft, format), [draft, format]);

  useEffect(() => {
    setWorkingNotes(String(idea?.working_notes ?? idea?.notes_text ?? ""));
    setDraft(String(idea?.draft_text ?? ""));
    setNotesOpen(false);
  }, [idea?.id]);

  useEffect(() => {
    if (!idea?.id) return;
    void fetch(`/api/content/chat?id=${encodeURIComponent(String(idea.id))}`).then(response => response.json()).then(result => {
      setMessages(result.messages ?? []);
    });
  }, [idea?.id]);

  async function post(body: Record<string, unknown>) {
    const response = await fetch("/api/content", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json() as Record<string, unknown>;
    if (!response.ok) throw new Error(String(result.error ?? "Content request failed"));
    return result;
  }

  async function generate(mode: "notes" | "content") {
    if (!idea) return;
    setBusy(mode === "notes" ? "Samwell is taking notes…" : `Samwell is drafting a ${formatLabel(format)}…`);
    setMessage("");
    try {
      if (workingNotes.trim()) await post({ id: idea.id, workingNotes });
      const result = await post({ id: idea.id, generate: mode });
      if (mode === "notes" && typeof result.notes === "string") {
        setWorkingNotes(result.notes);
        setNotesOpen(true);
        setMessage("Notes are local. Generate the posting when the angle is right.");
      }
      if (mode === "content" && typeof result.draft === "string") {
        setDraft(result.draft);
        setNotesOpen(false);
        setMessage("Draft is local. Edit in the same place, then copy out yourself.");
      }
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Generation failed");
    } finally {
      setBusy("");
    }
  }

  async function importStrategy(event: FormEvent) {
    event.preventDefault();
    await post({ thesis, sourceName: "Imported strategy" });
    setSetupOpen(false);
    await refresh();
  }

  async function capture(text: string) {
    const result = await post({ title: text.slice(0, 120), notes: text, format: captureFormat });
    await refresh();
    if (result.id) setSelectedId(String(result.id));
  }

  async function saveWorkingNotes() {
    if (!idea) return;
    await post({ id: idea.id, workingNotes });
    setMessage("Working notes saved.");
    await refresh();
  }

  async function saveDraft() {
    if (!idea) return;
    setBusy("Saving edit…");
    try {
      const result = await post({ id: idea.id, draft });
      setMessage(result.status === "edited" ? "Edit saved. Samwell will use this taste on the next draft." : "Draft saved. Copy-out still stays with you.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Draft could not be saved");
    } finally {
      setBusy("");
    }
  }

  async function copyOut() {
    if (!draft.trim()) return;
    try {
      await navigator.clipboard.writeText(draft);
      setMessage(format === "medium_article" ? "Copied. Paste into Medium yourself — Samwell never publishes." : "Copied. Paste into LinkedIn yourself — Samwell never posts.");
    } catch {
      setMessage("Copy failed. Select the draft and copy it yourself.");
    }
  }

  async function sendFeedback(event: FormEvent) {
    event.preventDefault();
    if (!idea || !feedback.trim()) return;
    const result = await post({ id: idea.id, feedback });
    setFeedback("");
    setMessage("Logged. Samwell will use this on the next draft — it does not publish anything.");
    if (Array.isArray(result.taste)) await refresh();
    else await refresh();
  }

  async function setFormat(next: ContentFormat) {
    if (!idea) return;
    await post({ id: idea.id, format: next });
    await refresh();
  }

  async function askSamwell(event: FormEvent) {
    event.preventDefault();
    if (!idea || !chat.trim()) return;
    setBusy("Samwell is reading the draft…");
    const response = await fetch("/api/content/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: idea.id, message: chat, draft }),
    });
    const result = await response.json() as { messages?: Record<string, unknown>[]; revisedDraft?: string; error?: string };
    setBusy("");
    if (!response.ok) {
      setMessage(result.error ?? "Samwell could not reply");
      return;
    }
    setChat("");
    setMessages(result.messages ?? []);
    if (result.revisedDraft) {
      setDraft(result.revisedDraft);
      setMessage("Samwell updated the draft above. Save the edit if you want this taste to stick.");
    }
  }

  const generateState = contentGenerateCopy(modelReady);
  const linkedin = (strategy?.linkedinCraft ?? {}) as Record<string, unknown>;
  const medium = (strategy?.mediumCraft ?? {}) as Record<string, unknown>;
  const voice = (strategy?.voice ?? {}) as Record<string, unknown>;
  const taste = Array.isArray(strategy?.taste) ? strategy.taste as Record<string, unknown>[] : [];
  const linkedinSkills = asStringList(linkedin.skills);
  const linkedinAvoid = asStringList(linkedin.avoid);
  const linkedinWorks = asStringList(linkedin.formatsThatWork);

  return <div className="content-workspace">
    <header className="page-heading">
      <div>
        {samwell && <span className="agent-chip">{samwell.label} · {samwell.roleName}</span>}
        <span className="eyebrow">Content</span>
        <h1>Advance one idea</h1>
        <p className="lede">Dump an idea, pick LinkedIn or Medium, generate, then edit the full draft in one place. Publishing stays a copy-out.</p>
      </div>
    </header>
    <section className="content-capture">
      <div className="format-switch" role="tablist" aria-label="Format for the next idea">
        <button type="button" className={captureFormat === "linkedin_post" ? "active" : ""} onClick={() => setCaptureFormat("linkedin_post")}>LinkedIn posting</button>
        <button type="button" className={captureFormat === "medium_article" ? "active" : ""} onClick={() => setCaptureFormat("medium_article")}>Medium article</button>
      </div>
      <p className="capture-hint">Audience and intent live in the strategy. You only need the idea and the format.</p>
      <CaptureBar placeholder={captureFormat === "medium_article" ? "Dump the article idea…" : "Dump a LinkedIn idea, a riff, or a proof point…"} submitLabel="Capture idea" onSubmit={capture} />
    </section>
    <details className="setup-panel" open={setupOpen} onToggle={event => { const next = event.currentTarget.open; if (next !== setupOpen) setSetupOpen(next); }}>
      <summary><span>Samwell · Content strategy & craft</span><small>{voiceBannerLine(voice)}</small></summary>
      <form className="box inline-form" onSubmit={importStrategy}>
        <label>Import or replace thesis<textarea value={thesis} onChange={event => setThesis(event.target.value)} placeholder="Paste the authoritative content strategy here." /></label>
        <button className="primary">Save thesis</button>
      </form>
      <div className="craft-grid">
        <article className="box craft-card">
          <span className="label">LinkedIn posting</span>
          <h3>Feed post, not an article</h3>
          <p><strong>{String(linkedin.platformLimitChars ?? 3000)}</strong> character cap · first lines ≤ <strong>{String(linkedin.hookMaxChars ?? 140)}</strong> chars so they survive mobile See more · target {String(linkedin.targetCharsMin ?? 700)}–{String(linkedin.targetCharsMax ?? 1800)}</p>
          <p>{String(linkedin.spacing ?? "Short paragraphs, blank line between ideas.")}</p>
          <p>{String(linkedin.ctaStyle ?? "A real question or next experiment.")}</p>
          {linkedinWorks.length > 0 && <><span className="label">What to write</span><ul className="evidence">{linkedinWorks.map(item => <li key={item}>{item}</li>)}</ul></>}
          {linkedinAvoid.length > 0 && <><span className="label">Avoid</span><ul className="evidence quiet">{linkedinAvoid.slice(0, 5).map(item => <li key={item}>{item}</li>)}</ul></>}
          {linkedinSkills.length > 0 && <><span className="label">Samwell follows</span><ul className="evidence">{linkedinSkills.map(item => <li key={item}>{item}</li>)}</ul></>}
        </article>
        <article className="box craft-card">
          <span className="label">Medium article</span>
          <h3>Separate long-form contract</h3>
          <p>Headline: {String(medium.headlineChars ?? "50–70 characters")}</p>
          <p>{String(medium.subtitle ?? "Subtitle completes the promise.")}</p>
          <p>{String(medium.lede ?? "Lede in 2–3 sentences.")} {String(medium.wordsMin ?? 800)}–{String(medium.wordsMax ?? 1800)} words. {String(medium.subheads ?? "H2s as a map.")}</p>
          <span className="label">Samwell follows</span>
          <ul className="evidence">{asStringList(medium.skills).map(item => <li key={item}>{item}</li>)}</ul>
        </article>
      </div>
      {taste.length > 0 && <article className="box">
        <span className="label">Learned taste · injected on the next run</span>
        <ul className="evidence">{taste.slice(0, 6).map((entry, index) => <li key={String(entry.at ?? index)}>{String(entry.title)}{entry.note ? ` — ${String(entry.note)}` : ""}{asStringList(entry.added).length ? ` · kept: ${asStringList(entry.added)[0]}` : ""}{asStringList(entry.removed).length ? ` · cut: ${asStringList(entry.removed)[0]}` : ""}</li>)}</ul>
      </article>}
    </details>
    <div className="workspace-split content-split">
      <aside className="idea-rail" aria-label="Ideas">{data.contentIdeas.map(item => <div key={String(item.id)} className={`idea-row${item.id === idea?.id ? " is-selected" : ""}`}><button type="button" onClick={() => setSelectedId(String(item.id))}><strong>{String(item.title)}</strong><small>{statusLabel(String(item.status))} · {formatLabel(parseContentFormat(item.format))}</small></button></div>)}</aside>
      {idea ? <article className="box content-desk">
        <div className="desk-head">
          <div>
            <span className="label">{String(idea.pillar)} · {statusLabel(String(idea.status))}</span>
            <h2>{String(idea.title)}</h2>
          </div>
          <button className="link" onClick={() => mutate("update_content", { id: idea.id, status: "parked" })}>Set aside</button>
        </div>
        <div className="desk-step">
          <span className="desk-step-index">1</span>
          <div>
            <strong>Format</strong>
            <p>LinkedIn is a feed post. Medium is a separate article. Pick before you generate.</p>
            <div className="format-switch" role="tablist" aria-label="Content kind">
              <button type="button" className={format === "linkedin_post" ? "active" : ""} onClick={() => void setFormat("linkedin_post")}>LinkedIn posting</button>
              <button type="button" className={format === "medium_article" ? "active" : ""} onClick={() => void setFormat("medium_article")}>Medium article</button>
            </div>
          </div>
        </div>
        <details className="notes-panel" open={notesOpen} onToggle={event => { const next = event.currentTarget.open; if (next !== notesOpen) setNotesOpen(next); }}>
          <summary><span>Angle notes · optional</span><small>Not the post. Proof, claims to avoid, then generate.</small></summary>
          <label className="notes-field">Working notes<textarea value={workingNotes} onChange={event => setWorkingNotes(event.target.value)} placeholder="Angle, one proof, claims to avoid." /></label>
          <div className="actions">
            <button disabled={Boolean(busy) || !generateState.enabled} onClick={() => void generate("notes")}>Generate notes</button>
            <button disabled={!workingNotes.trim()} onClick={() => void saveWorkingNotes()}>Save notes</button>
          </div>
        </details>
        <div className="desk-step">
          <span className="desk-step-index">2</span>
          <div className="draft-block">
            <div className="between">
              <div>
                <strong>Draft · edit here</strong>
                <p>This is the posting. Read it, change it, then copy it out. There is no second preview.</p>
              </div>
              <button className="primary" disabled={Boolean(busy) || !generateState.enabled} onClick={() => void generate("content")}>Generate {formatLabel(format)}</button>
            </div>
            <label className="draft-label">
              <span className="draft-meta">{draftLengthLabel(draft, format)}</span>
              <textarea
                className="draft-stage"
                value={draft}
                onChange={event => setDraft(event.target.value)}
                placeholder={format === "linkedin_post" ? "First lines before See more…" : "# Headline"}
              />
            </label>
            <ul className="craft-checks" aria-label="Checks against this draft">
              {craftChecks.map(check => (
                <li key={check.id} className={`craft-check ${checkState(check.pass)}`}>
                  <b>{checkMark(check.pass)}</b>
                  <div>
                    <strong>{check.label}</strong>
                    <p>{check.hint}</p>
                    <small>{check.detail}</small>
                  </div>
                </li>
              ))}
            </ul>
            <div className="actions">
              <button className="primary" disabled={Boolean(busy) || !draft.trim()} onClick={() => void saveDraft()}>Save edit</button>
              <button disabled={!draft.trim()} onClick={() => void copyOut()}>Copy for {format === "medium_article" ? "Medium" : "LinkedIn"}</button>
            </div>
            <p className="copy-out-note">Publishing stays a human copy-out. Samwell never posts.</p>
            {!generateState.enabled && <p className="copy-out-note">{generateState.hint}</p>}
            {busy && <small className="config-message">{busy}</small>}
            {message && <small className="config-message">{message}</small>}
          </div>
        </div>
        <div className="desk-step">
          <span className="desk-step-index">3</span>
          <div className="chat-pane content-chat">
            <div className="chat-head"><strong>Ask Samwell</strong><small>Against the draft above. Rewrites land in the same editor; save to teach taste.</small></div>
            <div className="chat-log">{messages.length ? messages.map(item => <div key={String(item.id)} className={item.role === "user" ? "user" : "agent"}><b>{item.role === "user" ? "You" : "Samwell"}</b><p>{String(item.content)}</p></div>) : <p className="empty-line">Ask how to tighten the opening, cut bait, or rewrite a passage.</p>}</div>
            <form className="chat-compose" onSubmit={askSamwell}>
              <textarea value={chat} onChange={event => setChat(event.target.value)} placeholder="Make the first lines concrete. Drop the last paragraph." />
              <button className="primary" disabled={!chat.trim() || Boolean(busy)}>Ask</button>
            </form>
          </div>
        </div>
        <div className="desk-step">
          <span className="desk-step-index">4</span>
          <form className="inline-form feedback-form" onSubmit={sendFeedback}>
            <strong>What worked / what did not</strong>
            <p>This becomes taste for the next run. It is not a publish.</p>
            <label>Share with Samwell<textarea value={feedback} onChange={event => setFeedback(event.target.value)} placeholder="Too much posture. Keep the calendar example. Cut the hashtags." /></label>
            <button className="primary" disabled={!feedback.trim()}>Share notes</button>
            {String(idea.feedback_text ?? "") && <p className="taste-log">Logged: {String(idea.feedback_text).slice(0, 280)}</p>}
          </form>
        </div>
      </article> : <article className="box"><p>Capture an idea to open the desk.</p></article>}
    </div>
  </div>;
}
