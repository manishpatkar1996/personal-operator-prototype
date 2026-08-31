import { extractPdfText } from "@/lib/operator/pdf-text";
import { saveCareerProfile } from "@/db/career";
import { rescoreJobs } from "@/db/jobs";

export const dynamic = "force-dynamic";

const MAX_BYTES = 2_000_000;

function errorResponse(error: unknown, status = 400) {
  return Response.json({ error: error instanceof Error ? error.message : "Résumé could not be read" }, { status });
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return errorResponse(new Error("Upload the PDF as a file"));
    }
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return errorResponse(new Error("Choose a PDF résumé"));
    if (file.size > MAX_BYTES) return errorResponse(new Error("Résumé PDF must be 2 MB or smaller"), 413);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const resumeText = await extractPdfText(bytes);
    const profile = await saveCareerProfile({
      resumeFilename: file.name.slice(0, 255),
      resumeText,
      onboardingStatus: "in_progress",
    });
    await rescoreJobs(profile);
    return Response.json({ profile, extracted: resumeText.length });
  } catch (error) {
    return errorResponse(error);
  }
}
