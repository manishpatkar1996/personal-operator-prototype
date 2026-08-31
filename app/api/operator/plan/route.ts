import { listGoals } from "@/db/goals";
import { getWorkspace } from "@/db/workspace";
import { assembleOperatorContext, generateOperatorPlan } from "@/lib/operator";

export const dynamic = "force-dynamic";

async function createPlan(now?: string) {
  if (now && Number.isNaN(Date.parse(now))) throw new Error("now must be a valid ISO date-time");
  const [goals, workspace] = await Promise.all([listGoals(), getWorkspace()]);
  const context = assembleOperatorContext({ goals, workspace, now });
  const result = await generateOperatorPlan(context);
  return {
    ...result,
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

export async function GET(request: Request) {
  try {
    return Response.json(await createPlan(new URL(request.url).searchParams.get("now") ?? undefined));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { now?: unknown };
    return Response.json(await createPlan(typeof body.now === "string" ? body.now : undefined));
  } catch (error) {
    return errorResponse(error);
  }
}
