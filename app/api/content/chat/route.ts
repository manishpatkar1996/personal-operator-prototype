import { chatContentIdea, listContentMessages } from "@/db/content-chat";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  return Response.json({ error: error instanceof Error ? error.message : "Samwell could not reply" }, { status: 400 });
}

export async function GET(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get("id") ?? "";
    if (!id) throw new Error("Open an idea first");
    return Response.json({ messages: await listContentMessages(id) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { id?: string; message?: string; draft?: string };
    return Response.json(await chatContentIdea(String(body.id ?? ""), String(body.message ?? ""), typeof body.draft === "string" ? body.draft : undefined));
  } catch (error) {
    return errorResponse(error);
  }
}
