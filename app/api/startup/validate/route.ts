import { validateStartupThesis } from "@/db/startup";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const id = String(body.id ?? "");
    if (!id) throw new Error("Idea id is required");
    return Response.json(await validateStartupThesis(id));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Thesis could not be validated" }, { status: 400 });
  }
}
