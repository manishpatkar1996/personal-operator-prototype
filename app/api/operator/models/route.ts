import { env } from "cloudflare:workers";
import { MODEL_ROUTES } from "@/lib/operator/models.ts";

export const dynamic = "force-dynamic";

function keyLoaded(name: "OPENAI_API_KEY" | "DEEPSEEK_API_KEY") {
  const value = (env as Record<string, string | undefined>)[name];
  return Boolean(typeof value === "string" && value.trim().length > 8);
}

export async function GET() {
  return Response.json({
    keyConfigured: keyLoaded("OPENAI_API_KEY"),
    deepseekConfigured: keyLoaded("DEEPSEEK_API_KEY"),
    fallback: "deepseek-chat",
    routes: Object.values(MODEL_ROUTES),
    policy: "Deterministic code scores jobs, owns calendar policy, and validates plans. Models only write structured JSON. DeepSeek is the live model while OpenAI is paused. No key is required for local use.",
  });
}
