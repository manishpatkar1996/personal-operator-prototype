import { env } from "cloudflare:workers";

export const dynamic = "force-dynamic";

const MAX_BYTES = 4_000_000;

function openaiKey() {
  const value = (env as Record<string, string | undefined>).OPENAI_API_KEY;
  return typeof value === "string" && value.trim().length > 8 ? value.trim() : "";
}

export async function POST(request: Request) {
  const key = openaiKey();
  if (!key) {
    return Response.json({ error: "Dictation fallback needs OPENAI_API_KEY for transcription. Type the note, or use Chrome/Safari Dictate." }, { status: 400 });
  }
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return Response.json({ error: "Audio must be uploaded as a file" }, { status: 400 });
  }
  const form = await request.formData();
  const audio = form.get("audio");
  if (!(audio instanceof File) || audio.size < 32) {
    return Response.json({ error: "No audio was captured" }, { status: 400 });
  }
  if (audio.size > MAX_BYTES) {
    return Response.json({ error: "Audio is too long to transcribe" }, { status: 413 });
  }
  const payload = new FormData();
  payload.set("model", "whisper-1");
  payload.set("language", "en");
  payload.set("file", audio, audio.name || "note.webm");
  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { authorization: `Bearer ${key}` },
    body: payload,
  });
  const result = await response.json() as { text?: string; error?: { message?: string } };
  if (!response.ok) {
    return Response.json({ error: result.error?.message ?? "Transcription failed" }, { status: 400 });
  }
  return Response.json({ text: String(result.text ?? "").trim() });
}
