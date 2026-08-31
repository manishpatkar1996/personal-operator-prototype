import { getWorkspace, mutateWorkspace } from "@/db/workspace";

export const dynamic = "force-dynamic";

export async function GET() {
  try { return Response.json(await getWorkspace()); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Workspace could not be loaded" }, { status: 400 }); }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { action: string; data?: Record<string, unknown> };
    return Response.json(await mutateWorkspace(body.action, body.data ?? {}));
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Workspace could not be updated" }, { status: 400 }); }
}
