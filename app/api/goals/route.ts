import { createGoal, createMilestone, deleteMilestone, importGoalsDump, listGoals, updateGoal, updateMilestone } from "@/db/goals";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected goal operation failure";
  return Response.json({ error: message }, { status: 400 });
}

export async function GET() {
  try { return Response.json({ goals: await listGoals() }); }
  catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    if (body.kind === "import") {
      const replaceAll = body.replaceAll === true;
      const result = await importGoalsDump(body.data ?? body.goals ?? body, { replaceAll, replaceDemo: !replaceAll });
      return Response.json(result, { status: 201 });
    }
    if (body.kind === "milestone") return Response.json({ id: await createMilestone(body.data as Parameters<typeof createMilestone>[0]) }, { status: 201 });
    return Response.json({ id: await createGoal(body.data as Parameters<typeof createGoal>[0]) }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    if (body.kind === "milestone") await updateMilestone(body.data as Parameters<typeof updateMilestone>[0]);
    else await updateGoal(body.data as Parameters<typeof updateGoal>[0]);
    return Response.json({ ok: true });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id) throw new Error("Milestone id is required");
    await deleteMilestone(id);
    return Response.json({ ok: true });
  } catch (error) { return errorResponse(error); }
}
