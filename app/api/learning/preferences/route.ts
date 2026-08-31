import {
  createLearningSource,
  deleteLearningSource,
  getLearningConfiguration,
  updateLearningPreferences,
  updateLearningSource,
} from "@/db/learning-preferences";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected learning configuration failure";
  const status = message.includes("not found") ? 404 : 400;
  return Response.json({ error: message }, { status });
}

export async function GET() {
  try {
    return Response.json(await getLearningConfiguration());
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    return Response.json({ preferences: await updateLearningPreferences(body.preferences ?? body) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    return Response.json({ id: await createLearningSource(body.source ?? body) }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const id = typeof body.id === "string" ? body.id : "";
    await updateLearningSource(id, body.source ?? body);
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get("id") ?? "";
    await deleteLearningSource(id);
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
