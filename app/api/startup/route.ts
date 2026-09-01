import { addStartupNote, listStartupNotes, updateStartupIdea } from "@/db/startup-chat";
import { challengeStartupThesis, researchStartupIdea, saveStartupMemoryNote, saveStartupWorldTest, validateStartupThesis } from "@/db/startup";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  return Response.json({ error: error instanceof Error ? error.message : "Startup lab failed" }, { status: 400 });
}

export async function GET(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get("id") ?? "";
    if (!id) throw new Error("Idea id is required");
    const notes = await listStartupNotes(id);
    return Response.json({ notes });
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
    if (body.challenge === true) return Response.json(await challengeStartupThesis(id));
    if (body.memory === true) return Response.json(await saveStartupMemoryNote(id));
    if (body.worldTest && typeof body.worldTest === "object" && !Array.isArray(body.worldTest)) {
      return Response.json(await saveStartupWorldTest(id, body.worldTest as Record<string, unknown>));
    }
    if (typeof body.note === "string") return Response.json(await addStartupNote(id, String(body.title ?? "Research note"), body.note));
    return Response.json(await updateStartupIdea(id, body));
  } catch (error) {
    return errorResponse(error);
  }
}
