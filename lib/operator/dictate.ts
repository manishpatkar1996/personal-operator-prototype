export type DictateState = "idle" | "listening" | "transcribing" | "error";
export type DictateEngine = "speech" | "recorder";

export function formatDictateClock(elapsedMs: number) {
  const total = Math.max(0, Math.floor(elapsedMs / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function appendDictateTranscript(current: string, chunk: string) {
  const next = chunk.trim();
  if (!next) return current;
  const base = current.trimEnd();
  return base ? `${base} ${next}` : next;
}

export function dictateErrorMessage(code: string) {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone is blocked. Allow access, then try Dictate again.";
    case "no-speech":
      return "No speech heard. Click Dictate and try again.";
    case "audio-capture":
      return "No microphone found. Type the note instead.";
    case "network":
      return "Dictation lost the network. Type the note, or try again.";
    case "whisper-unavailable":
      return "This browser has no Dictate, and Whisper transcription needs an OpenAI key. Type the note instead.";
    default:
      return "Dictation stopped. You can type instead.";
  }
}
