import { collectLearning } from "@/db/learning-collect";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    return Response.json(await collectLearning());
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Learning collection failed" }, { status: 400 });
  }
}
