import { runCouncil } from "@/db/council";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    return Response.json(await runCouncil());
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Council retrospective failed" }, { status: 400 });
  }
}
