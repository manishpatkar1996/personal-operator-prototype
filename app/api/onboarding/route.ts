import { getOnboardingState, resetOperator, saveOperatorSetup } from "@/db/onboarding";
import { setMeta } from "@/db/operator-meta";
import { ONBOARDED_KEY } from "@/lib/operator/operator-setup";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  return Response.json({ error: error instanceof Error ? error.message : "Onboarding could not be updated" }, { status: 400 });
}

export async function GET() {
  try {
    return Response.json(await getOnboardingState());
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    if (body.reset === "empty" || body.reset === "demo") {
      return Response.json(await resetOperator(body.reset));
    }
    if (body.skip === true) {
      await setMeta(ONBOARDED_KEY, "1");
      return Response.json(await getOnboardingState());
    }
    const goal = body.goal && typeof body.goal === "object" ? body.goal as Record<string, string> : undefined;
    const list = (value: unknown) => Array.isArray(value) ? value.map(item => String(item)).filter(Boolean) : undefined;
    return Response.json(await saveOperatorSetup({
      targetRoles: list(body.targetRoles),
      locations: list(body.locations),
      workModes: list(body.workModes),
      exclusions: list(body.exclusions),
      resumeText: typeof body.resumeText === "string" ? body.resumeText : undefined,
      resumeFilename: typeof body.resumeFilename === "string" ? body.resumeFilename : undefined,
      replaceSample: typeof body.replaceSample === "boolean" ? body.replaceSample : undefined,
      goalsDump: body.goalsDump ?? body.goals,
      replaceAllGoals: body.replaceAllGoals === true,
      timezone: typeof body.timezone === "string" ? body.timezone : undefined,
      goal: goal?.title
        ? {
            title: String(goal.title ?? ""),
            desiredOutcome: String(goal.desiredOutcome ?? ""),
            successCriteria: String(goal.successCriteria ?? ""),
            targetDate: String(goal.targetDate ?? ""),
            milestoneTitle: goal.milestoneTitle,
            milestoneRule: goal.milestoneRule,
            milestoneDate: goal.milestoneDate,
          }
        : undefined,
    }));
  } catch (error) {
    return errorResponse(error);
  }
}
