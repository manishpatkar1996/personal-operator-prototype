import { calendarIntelligence, retryCalendarWrite } from "@/db/calendar-slots";
import { mutateWorkspace } from "@/db/workspace";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  return Response.json({ error: error instanceof Error ? error.message : "Calendar intelligence failed" }, { status: 400 });
}

export async function GET(request: Request) {
  try {
    const date = new URL(request.url).searchParams.get("date") ?? undefined;
    return Response.json(await calendarIntelligence(date));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    if (body.retry === true) {
      return Response.json(await retryCalendarWrite(typeof body.requestId === "string" ? body.requestId : undefined, typeof body.blockId === "string" ? body.blockId : undefined));
    }
    if (typeof body.note === "string") {
      return Response.json(await mutateWorkspace("planning_note", { note: body.note }));
    }
    return errorResponse(new Error("Unknown calendar action"));
  } catch (error) {
    return errorResponse(error);
  }
}
