import { recordLearningFeedback } from "@/db/learning-feedback";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    return Response.json(await recordLearningFeedback(String(body.id ?? ""), String(body.verdict ?? ""), String(body.note ?? "")));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Feedback could not be saved" }, { status: 400 });
  }
}
