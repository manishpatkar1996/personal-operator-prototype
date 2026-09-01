import { challengeStartupThesis } from "@/db/startup";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { id?: string };
    const id = String(body.id ?? "");
    if (!id) throw new Error("Idea id is required");
    return Response.json(await challengeStartupThesis(id));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Challenge failed" }, { status: 400 });
  }
}
