import { createContentIdea, draftContent, getContentStrategy, importContentStrategy, outlineContent, updateContentNotes } from "@/db/content";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  return Response.json({ error: error instanceof Error ? error.message : "Content workspace failed" }, { status: 400 });
}

export async function GET() {
  try {
    return Response.json({ strategy: await getContentStrategy() });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    if (typeof body.thesis === "string") {
      return Response.json({ strategy: await importContentStrategy(body.thesis, String(body.sourceName ?? "Imported strategy")) });
    }
    if (typeof body.title === "string" && !body.id) {
      return Response.json(await createContentIdea({ title: body.title, notes: String(body.notes ?? ""), pillar: String(body.pillar ?? "Inbox") }), { status: 201 });
    }
    const id = String(body.id ?? "");
    if (typeof body.notes === "string") return Response.json(await updateContentNotes(id, body.notes));
    if (body.generate === "draft") return Response.json(await draftContent(id));
    return Response.json(await outlineContent(id));
  } catch (error) {
    return errorResponse(error);
  }
}
