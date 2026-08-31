import { env } from "cloudflare:workers";
import { getCareerProfile, type CareerProfile } from "./career";
import { scoreJob, type ScoreableProfile } from "@/lib/operator/scoring";

export type JobRecord = {
  id: string;
  title: string;
  company: string;
  location: string;
  fitScore: number;
  status: string;
  source: string;
  nextAction: string;
  url: string;
  fitReason: string;
  evidence: string[];
};

type JobRow = {
  id: string;
  title: string;
  company: string;
  location: string;
  fit_score: number;
  status: string;
  source: string;
  next_action: string;
  url?: string | null;
  fit_reason?: string | null;
  evidence_json?: string | null;
};

function db() {
  if (!env.DB) throw new Error("D1 binding DB is unavailable");
  return env.DB;
}

function parseEvidence(value: string | null | undefined) {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function mapJob(row: JobRow): JobRecord {
  return {
    id: row.id,
    title: row.title,
    company: row.company,
    location: row.location,
    fitScore: Number(row.fit_score),
    status: row.status,
    source: row.source,
    nextAction: row.next_action,
    url: row.url ?? "",
    fitReason: row.fit_reason ?? "",
    evidence: parseEvidence(row.evidence_json),
  };
}

export async function ensureJobColumns() {
  const columns = new Set((await db().prepare("PRAGMA table_info(jobs)").all<{ name: string }>()).results.map(column => column.name));
  if (!columns.has("url")) await db().prepare("ALTER TABLE jobs ADD COLUMN url TEXT NOT NULL DEFAULT ''").run();
  if (!columns.has("fit_reason")) await db().prepare("ALTER TABLE jobs ADD COLUMN fit_reason TEXT NOT NULL DEFAULT ''").run();
  if (!columns.has("evidence_json")) await db().prepare("ALTER TABLE jobs ADD COLUMN evidence_json TEXT NOT NULL DEFAULT '[]'").run();
}

function asProfile(profile: CareerProfile): ScoreableProfile {
  return {
    targetRoles: profile.targetRoles,
    industries: profile.industries,
    locations: profile.locations,
    workModes: profile.workModes,
    strengths: profile.strengths,
    exclusions: profile.exclusions,
    resumeText: profile.resumeText,
  };
}

function fingerprint(title: string, company: string, url: string) {
  return `${url.trim().toLocaleLowerCase() || `${title.trim().toLocaleLowerCase()}::${company.trim().toLocaleLowerCase()}`}`;
}

export async function listJobs(): Promise<JobRecord[]> {
  await ensureJobColumns();
  const rows = await db().prepare("SELECT id,title,company,location,fit_score,status,source,next_action,url,fit_reason,evidence_json FROM jobs ORDER BY fit_score DESC, title").all<JobRow>();
  return rows.results.map(mapJob);
}

export async function rescoreJobs(profile?: CareerProfile) {
  await ensureJobColumns();
  const current = profile ?? await getCareerProfile();
  const jobs = await listJobs();
  if (!jobs.length) return { updated: 0 };
  const statements = jobs.map(job => {
    const scored = scoreJob(asProfile(current), job);
    return db().prepare("UPDATE jobs SET fit_score=?,fit_reason=?,evidence_json=? WHERE id=?")
      .bind(scored.fitScore, scored.fitReason, JSON.stringify(scored.evidence), job.id);
  });
  await db().batch(statements);
  return { updated: jobs.length };
}

export async function createJob(input: {
  title: string;
  company: string;
  location?: string;
  source?: string;
  url?: string;
  nextAction?: string;
  status?: string;
}) {
  const title = input.title.trim();
  const company = input.company.trim();
  if (!title || !company) throw new Error("Job title and company are required");
  await ensureJobColumns();
  const url = (input.url ?? "").trim();
  const existing = await listJobs();
  const key = fingerprint(title, company, url);
  if (existing.some(job => fingerprint(job.title, job.company, job.url) === key)) {
    throw new Error("That role is already on the board");
  }
  const profile = await getCareerProfile();
  const scored = scoreJob(asProfile(profile), { title, company, location: input.location ?? "" });
  const id = crypto.randomUUID();
  await db().prepare("INSERT INTO jobs (id,title,company,location,fit_score,status,source,next_action,url,fit_reason,evidence_json) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
    .bind(
      id, title, company, (input.location ?? "").trim() || "Unspecified",
      scored.fitScore, input.status ?? "recommended", (input.source ?? "Manually added").trim() || "Manually added",
      input.nextAction ?? "Review role and decide whether to apply",
      url, scored.fitReason, JSON.stringify(scored.evidence),
    ).run();
  return id;
}

type ImportedJob = { title: string; company: string; location: string; url: string; source: string };

async function importGreenhouse(board: string): Promise<ImportedJob[]> {
  const token = board.trim();
  const [metaResponse, jobsResponse] = await Promise.all([
    fetch(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}`),
    fetch(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs`),
  ]);
  if (!jobsResponse.ok) throw new Error("That Greenhouse board was not found");
  const meta = metaResponse.ok ? await metaResponse.json() as { name?: string } : {};
  const payload = await jobsResponse.json() as { jobs?: { title?: string; absolute_url?: string; location?: { name?: string } }[] };
  const company = meta.name?.trim() || token;
  return (payload.jobs ?? []).slice(0, 20).map(job => ({
    title: String(job.title ?? "Untitled role"),
    company,
    location: job.location?.name ?? "",
    url: job.absolute_url ?? "",
    source: `Greenhouse · ${company}`,
  }));
}

async function importLever(site: string): Promise<ImportedJob[]> {
  const token = site.trim();
  const response = await fetch(`https://api.lever.co/v0/postings/${encodeURIComponent(token)}?mode=json`);
  if (!response.ok) throw new Error("That Lever careers site was not found");
  const payload = await response.json() as { text?: string; hostedUrl?: string; categories?: { location?: string }; }[];
  if (!Array.isArray(payload)) throw new Error("Lever returned an unexpected payload");
  return payload.slice(0, 20).map(job => ({
    title: String(job.text ?? "Untitled role"),
    company: token,
    location: job.categories?.location ?? "",
    url: job.hostedUrl ?? "",
    source: `Lever · ${token}`,
  }));
}

export async function importJobs(provider: string, board: string) {
  const token = board.trim();
  if (!token) throw new Error("A company or board name is required");
  const listings = provider === "lever" ? await importLever(token) : await importGreenhouse(token);
  if (!listings.length) throw new Error("No open roles were returned");
  const existing = await listJobs();
  const seen = new Set(existing.map(job => fingerprint(job.title, job.company, job.url)));
  let imported = 0;
  let skipped = 0;
  for (const listing of listings) {
    const key = fingerprint(listing.title, listing.company, listing.url);
    if (seen.has(key)) {
      skipped += 1;
      continue;
    }
    seen.add(key);
    await createJob(listing);
    imported += 1;
  }
  return { imported, skipped, total: listings.length, provider };
}

function tomorrowWindow() {
  const tomorrow = new Date(Date.now() + 86_400_000);
  const parts = new Intl.DateTimeFormat("en", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(tomorrow);
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? "01";
  const date = `${part("year")}-${part("month")}-${part("day")}`;
  return { startAt: `${date}T10:00:00+05:30`, endAt: `${date}T10:45:00+05:30` };
}

export async function scheduleTopJob() {
  const jobs = (await listJobs()).filter(job => !new Set(["applied", "rejected", "archived"]).has(job.status));
  const top = jobs.sort((a, b) => b.fitScore - a.fitScore)[0];
  if (!top) throw new Error("Add or import a role first");
  const { startAt, endAt } = tomorrowWindow();
  const preference = await db().prepare("SELECT policy FROM calendar_preferences WHERE id='primary'").first<{ policy: string }>();
  const automatic = preference?.policy !== "propose_only";
  const blockId = crypto.randomUUID();
  const title = `Review ${top.title} at ${top.company}`;
  const state = automatic ? "approved_pending" : "proposed";
  const statements = [
    db().prepare("INSERT INTO calendar_blocks (id,title,goal_id,milestone_id,start_at,end_at,state,ownership,source) VALUES (?,?,?,?,?,?,?,?,?)")
      .bind(blockId, title, "goal-career", "ms-pipeline", startAt, endAt, state, "operator_created", "local"),
    db().prepare("UPDATE jobs SET next_action=? WHERE id=?").bind("Review during the proposed calendar block", top.id),
  ];
  if (automatic) {
    statements.push(db().prepare("INSERT INTO calendar_write_requests (id,block_id,action,status,payload_json) VALUES (?,?,?,?,?)")
      .bind(crypto.randomUUID(), blockId, "create", "approved_pending", JSON.stringify({ title, startAt, endAt, timezone: "Asia/Kolkata", description: `[AI Operator] Application review · ${top.id}` })));
  }
  await db().batch(statements);
  return {
    jobId: top.id,
    blockId,
    title,
    startAt,
    message: automatic
      ? `Queued a calendar block to review ${top.title} at ${top.company}`
      : `Proposed a 45-minute block tomorrow at 10:00 to review ${top.title} at ${top.company}`,
  };
}
