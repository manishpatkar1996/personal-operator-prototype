import { deleteDecision, updateDecision } from "@/db/memory";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  return Response.json({ error: error instanceof Error ? error.message : "Memory could not be updated" }, { status: 400 });
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json() as { id?: string; decision?: string; rationale?: string; affected?: string };
    return Response.json(await updateDecision(String(body.id ?? ""), body));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get("id") ?? "";
    return Response.json(await deleteDecision(id));
  } catch (error) {
    return errorResponse(error);
  }
}
