import { listGoals } from "@/db/goals";
import { getCareerProfile } from "@/db/career";
import { getWorkspace } from "@/db/workspace";
import { istPlanDate, readDailyPlanCache, writeDailyPlanCache } from "@/db/operator-plan";
import { assembleOperatorContext, createOpenAIAdapter, generateOperatorPlan } from "@/lib/operator";
import { deepseekConfigured, liveModelsConfigured, openaiConfigured } from "@/lib/operator/llm";
import { DEEPSEEK_LIVE, OPENAI_LIVE } from "@/lib/operator/models";
import { dailyPlanMode } from "@/lib/operator/token-policy";

export const dynamic = "force-dynamic";

function localPlanModel() {
  const ready = liveModelsConfigured();
  const provider = DEEPSEEK_LIVE && deepseekConfigured()
    ? "deepseek"
    : OPENAI_LIVE && openaiConfigured()
      ? "openai"
      : undefined;
  return { status: "disabled" as const, reason: "local_plan", provider, keyReady: ready };
}

async function createPlan(options: { now?: string; live?: boolean }) {
  const now = options.now;
  if (now && Number.isNaN(Date.parse(now))) throw new Error("now must be a valid ISO date-time");
  const [goals, workspace, careerProfile] = await Promise.all([listGoals(), getWorkspace(), getCareerProfile()]);
  const context = assembleOperatorContext({ goals, workspace, careerProfile, now });
  const today = context.today || istPlanDate(now);
  const cached = await readDailyPlanCache(today);
  const mode = dailyPlanMode(Boolean(options.live), Boolean(cached));

  if (mode === "cache" && cached) {
    return withContext(cached, context, "cache");
  }

  if (mode === "deterministic") {
    const result = await generateOperatorPlan(context);
    return withContext({
      ...result,
      model: localPlanModel(),
    }, context, "deterministic");
  }

  const result = await generateOperatorPlan(context, createOpenAIAdapter());
  await writeDailyPlanCache(today, result);
  return withContext(result, context, "live");
}

function withContext(
  result: Awaited<ReturnType<typeof generateOperatorPlan>>,
  context: ReturnType<typeof assembleOperatorContext>,
  source: "live" | "cache" | "deterministic",
) {
  return {
    ...result,
    source,
    context: {
      assembledAt: context.assembledAt,
      timezone: context.timezone,
      today: context.today,
      counts: {
        goals: context.goals.length,
        calendar: context.calendar.length,
        jobs: context.jobs.length,
        learningItems: context.learningItems.length,
        startupIdeas: context.startupIdeas.length,
        contentIdeas: context.contentIdeas.length,
      },
    },
  };
}

function errorResponse(error: unknown) {
  return Response.json({ error: error instanceof Error ? error.message : "The Operator plan could not be generated" }, { status: 400 });
}

function wantsLive(request: Request, body?: { live?: unknown; refresh?: unknown }) {
  const params = new URL(request.url).searchParams;
  if (params.get("live") === "1" || params.get("refresh") === "1") return true;
  return body?.live === true || body?.refresh === true;
}

export async function GET(request: Request) {
  try {
    const now = new URL(request.url).searchParams.get("now") ?? undefined;
    return Response.json(await createPlan({ now, live: false }));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({})) as { now?: unknown; live?: unknown; refresh?: unknown };
    return Response.json(await createPlan({
      now: typeof body.now === "string" ? body.now : undefined,
      live: wantsLive(request, body),
    }));
  } catch (error) {
    return errorResponse(error);
  }
}
