import {
  CareerProfileValidationError,
  getCareerProfile,
  saveCareerProfile,
} from "@/db/career";
import { rescoreJobs } from "@/db/jobs";

export const dynamic = "force-dynamic";

const MAX_REQUEST_BYTES = 300_000;

function errorResponse(error: unknown) {
  if (error instanceof CareerProfileValidationError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  return Response.json(
    {
      error:
        error instanceof Error
          ? error.message
          : "Career profile could not be updated",
    },
    { status: 500 },
  );
}

export async function GET() {
  try {
    return Response.json({ profile: await getCareerProfile() });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > MAX_REQUEST_BYTES) {
      return Response.json(
        { error: "Career profile request must be 300,000 bytes or fewer" },
        { status: 413 },
      );
    }

    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) {
      return Response.json(
        { error: "Career profile request must be 300,000 bytes or fewer" },
        { status: 413 },
      );
    }

    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return Response.json(
        { error: "Career profile request must contain valid JSON" },
        { status: 400 },
      );
    }

    const profile = await saveCareerProfile(body);
    await rescoreJobs(profile);
    return Response.json({ profile });
  } catch (error) {
    return errorResponse(error);
  }
}
