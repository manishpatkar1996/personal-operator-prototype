import { collectLearning, summarizeLearningItem } from "@/db/learning-collect";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({})) as { summarizeId?: unknown };
    if (typeof body.summarizeId === "string" && body.summarizeId.trim()) {
      return Response.json(await summarizeLearningItem(body.summarizeId.trim()));
    }
    return Response.json(await collectLearning());
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Learning collection failed" }, { status: 400 });
  }
}
