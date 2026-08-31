import { addStartupNote, chatStartupIdea, listStartupMessages, listStartupNotes, updateStartupIdea } from "@/db/startup-chat";
import { researchStartupIdea, validateStartupThesis } from "@/db/startup";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  return Response.json({ error: error instanceof Error ? error.message : "Startup lab failed" }, { status: 400 });
}

export async function GET(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get("id") ?? "";
    if (!id) throw new Error("Idea id is required");
    const [messages, notes] = await Promise.all([listStartupMessages(id), listStartupNotes(id)]);
    return Response.json({ messages, notes });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const id = String(body.id ?? "");
    if (body.research === true) return Response.json(await researchStartupIdea(id));
    if (body.validate === true) return Response.json(await validateStartupThesis(id));
    if (typeof body.note === "string") return Response.json(await addStartupNote(id, String(body.title ?? "Research note"), body.note));
    if (typeof body.message === "string") return Response.json(await chatStartupIdea(id, body.message));
    return Response.json(await updateStartupIdea(id, body));
  } catch (error) {
    return errorResponse(error);
  }
}
