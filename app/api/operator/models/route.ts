import { env } from "cloudflare:workers";
import { MODEL_ROUTES } from "@/lib/operator/models.ts";

export const dynamic = "force-dynamic";

export async function GET() {
  const key = (env as { OPENAI_API_KEY?: string }).OPENAI_API_KEY;
  return Response.json({
    keyConfigured: Boolean(typeof key === "string" && key.trim().length > 8),
    routes: Object.values(MODEL_ROUTES),
    policy: "Deterministic code scores jobs, owns calendar policy, and validates plans. Models only write structured JSON. No key is required for local use.",
  });
}