import { deleteDecision, updateDecision } from "@/db/memory";
import { listMemoryDocuments, refreshMemoryDocument, saveMemoryDocument } from "@/db/memory-docs";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  return Response.json({ error: error instanceof Error ? error.message : "Memory could not be updated" }, { status: 400 });
}

export async function GET() {
  try {
    return Response.json({ documents: await listMemoryDocuments() });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json() as { id?: string; body?: string; refresh?: boolean };
    if (body.refresh) return Response.json(await refreshMemoryDocument(String(body.id ?? "")));
    return Response.json(await saveMemoryDocument(String(body.id ?? ""), String(body.body ?? "")));
  } catch (error) {
    return errorResponse(error);
  }
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
