import { createJob, importJobs, listJobs, rescoreJobs, scheduleTopJob } from "@/db/jobs";
import { generateResumeVariant, setJobFollowUp } from "@/db/career-actions";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  return Response.json({ error: error instanceof Error ? error.message : "Jobs could not be updated" }, { status: 400 });
}

export async function GET() {
  try {
    return Response.json({ jobs: await listJobs() });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    if (body.rescore === true) {
      return Response.json(await rescoreJobs());
    }
    if (body.scheduleTop === true) {
      return Response.json(await scheduleTopJob());
    }
    if (body.resumeVariant && typeof body.resumeVariant === "string") {
      return Response.json(await generateResumeVariant(body.resumeVariant, { regenerate: body.regenerate === true }));
    }
    const followUp = body.followUp && typeof body.followUp === "object" ? body.followUp as Record<string, unknown> : null;
    if (followUp) {
      return Response.json(await setJobFollowUp(String(followUp.id ?? ""), String(followUp.date ?? ""), typeof followUp.note === "string" ? followUp.note : undefined));
    }
    const importFrom = body.importFrom && typeof body.importFrom === "object" ? body.importFrom as Record<string, unknown> : null;
    if (importFrom) {
      return Response.json(await importJobs(String(importFrom.provider ?? "greenhouse"), String(importFrom.board ?? "")));
    }
    return Response.json({
      id: await createJob({
        title: String(body.title ?? ""),
        company: String(body.company ?? ""),
        location: String(body.location ?? ""),
        source: String(body.source ?? "Manually added"),
        url: String(body.url ?? ""),
        nextAction: typeof body.nextAction === "string" ? body.nextAction : undefined,
      }),
    }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
