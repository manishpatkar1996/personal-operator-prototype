"use client";

import { appendDictateTranscript, dictateErrorMessage, formatDictateClock, type DictateEngine, type DictateState } from "@/lib/operator/dictate";
import { useEffect, useRef, useState } from "react";

type SpeechResult = { isFinal: boolean; 0: { transcript: string } };
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  abort?: () => void;
  onresult: ((event: { resultIndex: number; results: ArrayLike<SpeechResult> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

function speechRecognitionCtor() {
  const speechWindow = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
}

function MicIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="2" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0" />
    <path d="M12 18v3" />
    <path d="M8 21h8" />
  </svg>;
}

function WaveBars() {
  return <span className="dictate-bars"><i /><i /><i /><i /></span>;
}

export function DictationControl({
  state,
  clock,
  onToggle,
}: {
  state: DictateState;
  clock: string;
  onToggle: () => void;
}) {
  const listening = state === "listening";
  const transcribing = state === "transcribing";
  const errored = state === "error";
  const label = transcribing ? "Transcribing…" : listening ? "Listening…" : "Dictate";
  const ariaLabel = listening
    ? `Stop dictation, ${clock}`
    : transcribing
      ? "Transcribing dictation"
      : errored
        ? "Dictate, try again"
        : "Dictate";

  return <button
    type="button"
    className="dictate-control"
    data-state={state}
    aria-pressed={listening}
    aria-busy={transcribing}
    aria-disabled={transcribing}
    aria-label={ariaLabel}
    title={listening ? "Click to stop" : transcribing ? "Transcribing…" : "Dictate"}
    onClick={() => { if (!transcribing) onToggle(); }}
  >
    {listening && <span className="dictate-dot" aria-hidden="true" />}
    <span className="dictate-face" aria-hidden="true">
      {transcribing ? <span className="dictate-spinner" /> : listening ? <WaveBars /> : <MicIcon />}
    </span>
    {listening && <span className="dictate-clock">{clock}</span>}
    <span className="dictate-label">{label}</span>
  </button>;
}

function useDictation(onTranscript: (text: string) => void) {
  const [state, setState] = useState<DictateState>("idle");
  const [engine, setEngine] = useState<DictateEngine | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState("");
  const onTranscriptRef = useRef(onTranscript);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const stateRef = useRef(state);
  onTranscriptRef.current = onTranscript;
  stateRef.current = state;

  useEffect(() => {
    if (state !== "listening") {
      setElapsedMs(0);
      return;
    }
    const started = Date.now();
    const tick = window.setInterval(() => setElapsedMs(Date.now() - started), 200);
    return () => window.clearInterval(tick);
  }, [state]);

  useEffect(() => () => {
    try { recognitionRef.current?.abort?.(); } catch { /* already stopped */ }
    try { recognitionRef.current?.stop(); } catch { /* already stopped */ }
    recognitionRef.current = null;
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    streamRef.current?.getTracks().forEach(track => track.stop());
  }, []);

  function fail(code: string, fallback?: string) {
    setInterim("");
    setEngine(null);
    setState("error");
    setError(fallback ?? dictateErrorMessage(code));
  }

  async function transcribeBlob(blob: Blob) {
    setState("transcribing");
    setError("");
    const form = new FormData();
    form.set("audio", blob, "note.webm");
    try {
      const response = await fetch("/api/operator/transcribe", { method: "POST", body: form });
      const result = await response.json() as { text?: string; error?: string };
      if (!response.ok) {
        const message = result.error ?? "Type the note instead.";
        fail("whisper-unavailable", message.includes("OPENAI") ? dictateErrorMessage("whisper-unavailable") : message);
        return;
      }
      if (result.text) onTranscriptRef.current(result.text);
      setState("idle");
    } catch {
      fail("network");
    }
  }

  async function startRecorder() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        void transcribeBlob(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
      };
      recorderRef.current = recorder;
      recorder.start();
      setEngine("recorder");
      setError("");
      setState("listening");
    } catch {
      fail("not-allowed");
    }
  }

  function startSpeech(Ctor: new () => SpeechRecognitionLike) {
    const recognition = new Ctor();
    recognition.lang = "en-IN";
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.onresult = event => {
      let finals = "";
      let live = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const text = result[0].transcript;
        if (result.isFinal) finals += text;
        else live += text;
      }
      if (finals.trim()) onTranscriptRef.current(finals);
      setInterim(live.trim());
    };
    recognition.onerror = event => {
      if (event.error === "aborted") return;
      fail(event.error);
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setInterim("");
      setState(current => current === "listening" ? "idle" : current);
    };
    recognitionRef.current = recognition;
    recognition.start();
    setEngine("speech");
    setError("");
    setState("listening");
  }

  function stopCapture() {
    const recognition = recognitionRef.current;
    if (recognition) {
      recognitionRef.current = null;
      try { recognition.stop(); } catch { /* already ending */ }
    }
    if (recorderRef.current?.state === "recording") {
      setState("transcribing");
      recorderRef.current.stop();
    }
  }

  async function toggle() {
    if (stateRef.current === "transcribing") return;
    if (stateRef.current === "listening") {
      stopCapture();
      return;
    }
    setInterim("");
    setError("");
    const Ctor = speechRecognitionCtor();
    if (!Ctor) {
      await startRecorder();
      return;
    }
    try {
      startSpeech(Ctor);
    } catch {
      await startRecorder();
    }
  }

  const clock = formatDictateClock(elapsedMs);
  const status = state === "error"
    ? error
    : state === "transcribing"
      ? "Transcribing…"
      : state === "listening" && engine === "recorder"
        ? "Recording… click to stop. Whisper runs only if an OpenAI key is configured."
        : state === "listening"
          ? (interim ? `Listening… ${interim}` : "Listening… click to stop.")
          : "";

  return { state, clock, engine, status, error, toggle };
}

export function CaptureComposer({ placeholder, submitLabel, onSubmit }: { placeholder: string; submitLabel: string; onSubmit: (text: string) => Promise<void> }) {
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const dictate = useDictation(chunk => setNote(current => appendDictateTranscript(current, chunk)));

  return <form className="capture-bar" onSubmit={event => { event.preventDefault(); if (!note.trim()) return; void onSubmit(note.trim()).then(() => { setNote(""); setMessage(""); }).catch(error => setMessage(error instanceof Error ? error.message : "Could not save")); }}>
    <input value={note} onChange={event => setNote(event.target.value)} placeholder={placeholder} />
    <DictationControl state={dictate.state} clock={dictate.clock} onToggle={() => void dictate.toggle()} />
    <button className="primary" disabled={!note.trim()}>{submitLabel}</button>
    <p className={`dictate-live${dictate.state === "error" ? " error" : ""}`} role="status" aria-live="polite">{dictate.status}</p>
    {message && <small className="config-message">{message}</small>}
  </form>;
}
