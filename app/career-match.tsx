"use client";

import { MIN_RESUME_CHARS, parseStoredMatch, RESUME_REQUIRED_MESSAGE } from "@/lib/operator/scoring";
import { useEffect, useState } from "react";

type MatchResult = {
  fitScore?: number;
  reason?: string;
  matches?: string[];
  evidence?: string[];
  gaps?: string[];
  model?: string;
  reused?: boolean;
  error?: string;
};

function bullets(value: unknown) {
  return parseStoredMatch(value);
}

export function JobCareerMatch({ job, onMatched }: { job: Record<string, unknown>; onMatched: () => Promise<void> }) {
  const jobId = String(job.id ?? "");
  const url = String(job.url ?? "");
  const stored = bullets(job.evidence_json ?? job.evidence);
  const [matches, setMatches] = useState(stored.matches);
  const [gaps, setGaps] = useState(stored.gaps);
  const [resumeChars, setResumeChars] = useState<number | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    const next = bullets(job.evidence_json ?? job.evidence);
    setMatches(next.matches);
    setGaps(next.gaps);
  }, [job.evidence_json, job.evidence]);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/career/profile", { cache: "no-store" })
      .then(response => response.json())
      .then((result: { profile?: { resumeText?: string } }) => {
        if (!cancelled) setResumeChars(String(result.profile?.resumeText ?? "").trim().length);
      })
      .catch(() => {
        if (!cancelled) setResumeChars(0);
      });
    return () => { cancelled = true; };
  }, []);

  const gated = resumeChars !== null && resumeChars <= MIN_RESUME_CHARS;
  const hasReport = matches.length > 0 || gaps.length > 0;
  const posting = url ? <a className="button-link" href={url} target="_blank" rel="noreferrer">Open posting</a> : null;

  async function match(regenerate = false) {
    if (gated) {
      setError(RESUME_REQUIRED_MESSAGE);
      return;
    }
    setBusy("Matching against your résumé…");
    setError("");
    setNote("");
    try {
      const response = await fetch("/api/career/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ explainJob: jobId, regenerate }),
      });
      const result = await response.json() as MatchResult;
      if (!response.ok) throw new Error(result.error ?? "Could not match this role");
      const nextMatches = (result.matches ?? result.evidence ?? []).map(String).filter(Boolean);
      const nextGaps = (result.gaps ?? []).map(String).filter(Boolean);
      setMatches(nextMatches);
      setGaps(nextGaps);
      setNote(result.model === "deepseek"
        ? "Deterministic overlap plus DeepSeek colour. This is not a rewritten résumé."
        : result.reused
          ? "Stored match for this posting."
          : "Deterministic résumé overlap. DeepSeek did not rewrite this one.");
      await onMatched();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not match this role");
    } finally {
      setBusy("");
    }
  }

  return <div className="job-match">
    {hasReport ? <>
      {matches.length > 0 && <><h3>Matches</h3><ul className="evidence">{matches.slice(0, 6).map(item => <li key={item}>{item}</li>)}</ul></>}
      {gaps.length > 0 && <><h3>Gaps / fix</h3><ul className="evidence match-gaps">{gaps.slice(0, 6).map(item => <li key={item}>{item}</li>)}</ul></>}
    </> : null}
    <div className="actions variant-export">
      {gated
        ? <button type="button" disabled>Match against résumé</button>
        : <button className="primary" type="button" disabled={Boolean(busy) || resumeChars === null} onClick={() => void match(hasReport)}>
          {busy ? "Matching…" : hasReport ? "Match again" : "Why this role"}
        </button>}
      {posting}
    </div>
    {gated ? <small className="config-message">{RESUME_REQUIRED_MESSAGE}</small> : null}
    {busy && !hasReport ? <small className="config-message">{busy}</small> : null}
    {error ? <small className="form-error">{error}</small> : null}
    {!busy && !error && !gated && note ? <small className="config-message">{note}</small> : null}
  </div>;
}
