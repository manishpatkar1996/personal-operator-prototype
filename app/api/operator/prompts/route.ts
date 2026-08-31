import { listPrompts, resetPrompt, updatePrompt } from "@/db/prompts";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  return Response.json({ error: error instanceof Error ? error.message : "Prompts could not be updated" }, { status: 400 });
}

export async function GET() {
  try {
    return Response.json(await listPrompts());
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json() as { id?: string; systemPrompt?: string; reset?: boolean };
    const id = String(body.id ?? "");
    if (body.reset) return Response.json(await resetPrompt(id));
    return Response.json(await updatePrompt(id, String(body.systemPrompt ?? "")));
  } catch (error) {
    return errorResponse(error);
  }
}
