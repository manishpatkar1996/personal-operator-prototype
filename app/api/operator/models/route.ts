import { env } from "cloudflare:workers";
import { DEEPSEEK_LIVE, MODEL_ROUTES, OPENAI_LIVE } from "@/lib/operator/models.ts";

export const dynamic = "force-dynamic";

function keyLoaded(name: "OPENAI_API_KEY" | "DEEPSEEK_API_KEY") {
  const value = (env as Record<string, string | undefined>)[name];
  return Boolean(typeof value === "string" && value.trim().length > 8);
}

function livePolicy() {
  const liveState = OPENAI_LIVE && DEEPSEEK_LIVE
    ? "OpenAI is primary; DeepSeek is the fallback."
    : OPENAI_LIVE
      ? "OpenAI is the live model."
      : DEEPSEEK_LIVE
        ? "DeepSeek is the live model while OpenAI is paused."
        : "Live models are paused.";
  return `Deterministic code scores jobs, owns calendar policy, and validates plans. Models only write structured JSON. ${liveState} No key is required for local use.`;
}

export async function GET() {
  return Response.json({
    keyConfigured: keyLoaded("OPENAI_API_KEY"),
    deepseekConfigured: keyLoaded("DEEPSEEK_API_KEY"),
    fallback: "deepseek-chat",
    routes: Object.values(MODEL_ROUTES),
    policy: livePolicy(),
  });
}
