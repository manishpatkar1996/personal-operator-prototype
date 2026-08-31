import { createContentIdea, draftContent, generateContent, generateContentNotes, getContentStrategy, importContentStrategy, outlineContent, saveContentDraft, setContentFormat, shareContentFeedback, updateContentNotes, updateWorkingNotes } from "@/db/content";

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
      return Response.json(await createContentIdea({ title: body.title, notes: String(body.notes ?? ""), pillar: String(body.pillar ?? "Inbox"), format: String(body.format ?? "") }), { status: 201 });
    }
    const id = String(body.id ?? "");
    if (!id) throw new Error("Content idea was not found");
    if (typeof body.format === "string" && body.generate == null && body.draft == null && body.notes == null && body.workingNotes == null && body.feedback == null) {
      return Response.json(await setContentFormat(id, body.format));
    }
    if (typeof body.workingNotes === "string") return Response.json(await updateWorkingNotes(id, body.workingNotes));
    if (typeof body.feedback === "string") return Response.json(await shareContentFeedback(id, body.feedback));
    if (typeof body.notes === "string") return Response.json(await updateContentNotes(id, body.notes));
    if (typeof body.draft === "string") return Response.json(await saveContentDraft(id, body.draft));
    if (body.generate === "notes") return Response.json(await generateContentNotes(id));
    if (body.generate === "draft") return Response.json(await draftContent(id));
    if (body.generate === "content") return Response.json(await generateContent(id));
    return Response.json(await outlineContent(id));
  } catch (error) {
    return errorResponse(error);
  }
}
