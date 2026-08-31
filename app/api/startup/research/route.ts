import { researchStartupIdea } from "@/db/startup";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { id?: string };
    return Response.json(await researchStartupIdea(String(body.id ?? "")));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Research failed" }, { status: 400 });
  }
}
