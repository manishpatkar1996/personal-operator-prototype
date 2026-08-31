"use client";

import { isCompleteLatex, resumeTexFilename } from "@/lib/operator/resume-latex";
import { useMemo, useRef, useState } from "react";

type GenerateResult = {
  latex?: string;
  variant?: string;
  filename?: string;
  model?: string;
  reused?: boolean;
  error?: string;
};

function downloadTex(filename: string, contents: string) {
  const blob = new Blob([contents], { type: "application/x-tex;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}

export function JobResumeVariant({ job, onGenerated }: { job: Record<string, unknown>; onGenerated: () => Promise<void> }) {
  const jobId = String(job.id ?? "");
  const title = String(job.title ?? "Role");
  const company = String(job.company ?? "");
  const url = String(job.url ?? "");
  const stored = String(job.resume_variant ?? job.resumeVariant ?? "");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [note, setNote] = useState("");
  const preRef = useRef<HTMLPreElement>(null);
  const latex = isCompleteLatex(draft) ? draft : isCompleteLatex(stored) ? stored : "";
  const filename = useMemo(() => resumeTexFilename(company, title), [company, title]);
  const posting = url ? <a className="button-link" href={url} target="_blank" rel="noreferrer">Open posting</a> : null;

  async function generate(regenerate = false) {
    if (!regenerate && latex) return;
    setBusy("Writing full LaTeX for this role…");
    setError("");
    setCopied(false);
    setNote("");
    try {
      const response = await fetch("/api/career/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeVariant: jobId, regenerate }),
      });
      const result = await response.json() as GenerateResult;
      if (!response.ok) throw new Error(result.error ?? "Could not write a job-specific résumé");
      const next = String(result.latex || result.variant || "");
      if (!isCompleteLatex(next)) throw new Error("The model returned a snippet instead of compilable LaTeX. Try again.");
      setDraft(next);
      setBusy("");
      setNote(result.model === "deepseek"
        ? "Full LaTeX for this posting. Copy or download the .tex — the Operator will not submit it."
        : result.reused
          ? "Stored LaTeX for this posting. Copy or download — the Operator will not submit it."
          : "Local draft from your stored résumé. Copy or download the .tex — DeepSeek did not rewrite this one.");
      await onGenerated();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not write a job-specific résumé");
    } finally {
      setBusy("");
    }
  }

  async function copyLatex() {
    if (!latex) return;
    try {
      await navigator.clipboard.writeText(latex);
      setCopied(true);
      setError("");
      setNote("Copied. Paste into Overleaf or your TeX editor — the Operator will not submit it.");
    } catch {
      const node = preRef.current;
      if (node) {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(node);
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
      setError("Copy failed. The source is selected — copy it yourself.");
    }
  }

  return <div className="variant-source">
    {latex ? <pre ref={preRef} className="variant-preview">{latex}</pre> : null}
    <div className="actions variant-export">
      {latex ? <>
        <button className="primary" type="button" onClick={() => void copyLatex()}>{copied ? "Copied" : "Copy LaTeX"}</button>
        <button type="button" onClick={() => downloadTex(filename, latex)}>Download .tex</button>
        <button className="link" type="button" disabled={Boolean(busy)} onClick={() => void generate(true)}>Regenerate</button>
      </> : <button className="primary" type="button" disabled={Boolean(busy)} onClick={() => void generate(false)}>
        {busy ? "Writing LaTeX…" : "Job-specific résumé"}
      </button>}
      {posting}
    </div>
    {busy && !latex ? <small className="config-message">{busy}</small> : null}
    {error ? <small className="form-error">{error}</small> : null}
    {!busy && !error && note ? <small className="config-message">{note}</small> : null}
  </div>;
}
