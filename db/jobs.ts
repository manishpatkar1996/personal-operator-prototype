import { env } from "cloudflare:workers";
import { getCareerProfile, type CareerProfile } from "./career";
import { isQuotaSalesRole, isRelevantTrackedJob } from "@/lib/operator/job-relevance.ts";
import { jobFromPaste } from "@/lib/operator/job-url.ts";
import {
  adzunaCountryFromLocations,
  BOARD_IMPORT_CAP,
  indiaJobLocation,
  jobicyTag,
  listingFingerprint,
  listingMatchesQuery,
  mapAdzunaJob,
  mapArbeitnowJob,
  mapAshbyJob,
  mapGreenhouseJob,
  mapIndianApiJob,
  mapJobicyJob,
  mapLeverJob,
  mapMuseJob,
  mapRemotiveJob,
  mapSmartRecruitersJob,
  mergeNormalizedJobs,
  SEARCH_IMPORT_CAP,
  searchQueriesFromTargets,
  type NormalizedJob,
  type RoleSearchQuery,
} from "@/lib/operator/job-search.ts";
import { DEMO_JOB_IDS, SAMPLE_JOB_SOURCE } from "@/lib/operator/operator-setup";
import { parseStoredMatch, resumeIsUsable, scoreJob, type ScoreableProfile } from "@/lib/operator/scoring";
import { ensureCareerExtraColumns } from "./career-actions";
import { slotForDuration } from "./calendar-slots";

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
  description: string;
  fitReason: string;
  evidence: string[];
  gaps?: string[];
  followUpAt?: string;
  resumeVariant?: string;
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
  description?: string | null;
  fit_reason?: string | null;
  evidence_json?: string | null;
  follow_up_at?: string | null;
  resume_variant?: string | null;
};

function db() {
  if (!env.DB) throw new Error("D1 binding DB is unavailable");
  return env.DB;
}

function mapJob(row: JobRow): JobRecord {
  const stored = parseStoredMatch(row.evidence_json);
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
    description: row.description ?? "",
    fitReason: row.fit_reason ?? "",
    evidence: stored.matches,
    gaps: stored.gaps,
    followUpAt: row.follow_up_at ?? undefined,
    resumeVariant: row.resume_variant ?? "",
  };
}

export async function ensureJobColumns() {
  const columns = new Set((await db().prepare("PRAGMA table_info(jobs)").all<{ name: string }>()).results.map(column => column.name));
  if (!columns.has("url")) await db().prepare("ALTER TABLE jobs ADD COLUMN url TEXT NOT NULL DEFAULT ''").run();
  if (!columns.has("description")) await db().prepare("ALTER TABLE jobs ADD COLUMN description TEXT NOT NULL DEFAULT ''").run();
  if (!columns.has("fit_reason")) await db().prepare("ALTER TABLE jobs ADD COLUMN fit_reason TEXT NOT NULL DEFAULT ''").run();
  if (!columns.has("evidence_json")) await db().prepare("ALTER TABLE jobs ADD COLUMN evidence_json TEXT NOT NULL DEFAULT '[]'").run();
  await ensureCareerExtraColumns();
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

function fingerprint(title: string, company: string, url: string, providerId?: string) {
  return listingFingerprint({ title, company, url, providerId });
}

function envValue(name: string) {
  const value = (env as Record<string, string | undefined>)[name];
  return typeof value === "string" ? value.trim() : "";
}

const UNMATCHED_REASON = "Add a résumé on You before matching";
const UNMATCHED_ACTION = "Review role — matching waits on a résumé";

function scoreForStorage(profile: CareerProfile, job: { title: string; company: string; location: string; description?: string }) {
  if (!resumeIsUsable(profile.resumeText)) {
    return { fitScore: 0, fitReason: UNMATCHED_REASON, evidence: [] as string[] };
  }
  return scoreJob(asProfile(profile), job);
}

async function dropSampleJobs() {
  const placeholders = DEMO_JOB_IDS.map(() => "?").join(",");
  await db().prepare(`DELETE FROM jobs WHERE id IN (${placeholders}) OR lower(source)=?`).bind(...DEMO_JOB_IDS, SAMPLE_JOB_SOURCE.toLowerCase()).run();
}

export async function listJobs(): Promise<JobRecord[]> {
  await ensureJobColumns();
  const rows = await db().prepare("SELECT id,title,company,location,fit_score,status,source,next_action,url,description,fit_reason,evidence_json,follow_up_at,resume_variant FROM jobs ORDER BY fit_score DESC, title").all<JobRow>();
  return rows.results.map(mapJob);
}

export async function rescoreJobs(profile?: CareerProfile) {
  await ensureJobColumns();
  const current = profile ?? await getCareerProfile();
  const jobs = await listJobs();
  if (!jobs.length) return { updated: 0 };
  const scoredJobs = jobs.map(job => ({ job, scored: scoreForStorage(current, job) }));
  const statements = scoredJobs.map(({ job, scored }) => db().prepare("UPDATE jobs SET fit_score=?,fit_reason=?,evidence_json=? WHERE id=?")
    .bind(scored.fitScore, scored.fitReason, JSON.stringify(scored.evidence), job.id));
  const hide = scoredJobs
    .filter(({ job, scored }) => !isRelevantTrackedJob({ title: job.title, fitScore: scored.fitScore, status: job.status, source: job.source }, asProfile(current)) && job.status === "recommended")
    .map(({ job }) => db().prepare("UPDATE jobs SET status=?,next_action=? WHERE id=?").bind("archived", "Hidden: off-profile or below the fit bar", job.id));
  await db().batch([...statements, ...hide]);
  return { updated: jobs.length, hidden: hide.length };
}

export async function createJob(input: {
  title?: string;
  company?: string;
  location?: string;
  source?: string;
  url?: string;
  description?: string;
  nextAction?: string;
  status?: string;
}) {
  const url = (input.url ?? "").trim();
  const pasted = url ? jobFromPaste({
    url,
    title: input.title,
    company: input.company,
    location: input.location,
    description: input.description,
  }) : null;
  const title = (input.title ?? "").trim() || pasted?.title || "";
  const company = (input.company ?? "").trim() || pasted?.company || "";
  if (!url && !title && !company) throw new Error("Paste a job URL first.");
  if (!title || !company) throw new Error(url ? "Could not save that posting" : "Job title and company are required");
  await ensureJobColumns();
  const storedUrl = pasted?.url || url;
  const description = pasted?.description ?? (input.description ?? "").trim();
  const existing = await listJobs();
  const key = fingerprint(title, company, storedUrl);
  if (existing.some(job => fingerprint(job.title, job.company, job.url) === key)) {
    throw new Error("That role is already on the board");
  }
  const location = (input.location ?? "").trim() || pasted?.location || "Unspecified";
  const profile = await getCareerProfile();
  const scored = scoreForStorage(profile, { title, company, location, description });
  await dropSampleJobs();
  const id = crypto.randomUUID();
  await db().prepare("INSERT INTO jobs (id,title,company,location,fit_score,status,source,next_action,url,description,fit_reason,evidence_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind(
      id, title, company, location,
      scored.fitScore, input.status ?? "recommended", (input.source ?? "").trim() || pasted?.source || "Manually added",
      input.nextAction ?? pasted?.nextAction ?? (scored.fitScore === 0 ? UNMATCHED_ACTION : "Review role and decide whether to apply"),
      storedUrl, description, scored.fitReason, JSON.stringify(scored.evidence),
    ).run();
  return id;
}

const FETCH_MS = 10_000;

async function fetchJson(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(FETCH_MS) });
  if (!response.ok) throw new Error(`${response.status}`);
  return response.json() as Promise<unknown>;
}

function compactJobs(jobs: Array<NormalizedJob | null>, cap = BOARD_IMPORT_CAP) {
  return jobs.filter((job): job is NormalizedJob => Boolean(job)).slice(0, cap);
}

async function importGreenhouse(board: string): Promise<NormalizedJob[]> {
  const token = board.trim();
  const [metaResponse, jobsResponse] = await Promise.all([
    fetch(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(FETCH_MS) }),
    fetch(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs`, { signal: AbortSignal.timeout(FETCH_MS) }),
  ]);
  if (!jobsResponse.ok) throw new Error("That Greenhouse board was not found");
  const meta = metaResponse.ok ? await metaResponse.json() as { name?: string } : {};
  const payload = await jobsResponse.json() as { jobs?: Record<string, unknown>[] };
  const company = meta.name?.trim() || token;
  return compactJobs((payload.jobs ?? []).map(job => mapGreenhouseJob(job, company)));
}

async function importLever(site: string): Promise<NormalizedJob[]> {
  const token = site.trim();
  const payload = await fetchJson(`https://api.lever.co/v0/postings/${encodeURIComponent(token)}?mode=json`).catch(() => {
    throw new Error("That Lever careers site was not found");
  });
  if (!Array.isArray(payload)) throw new Error("Lever returned an unexpected payload");
  return compactJobs(payload.map(job => mapLeverJob(job as Record<string, unknown>, token)));
}

async function importAshby(board: string): Promise<NormalizedJob[]> {
  const token = board.trim();
  const payload = await fetchJson(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(token)}`).catch(() => {
    throw new Error("That Ashby job board was not found");
  });
  const body = payload && typeof payload === "object" ? payload as { jobs?: Record<string, unknown>[] } : {};
  return compactJobs((body.jobs ?? []).map(job => mapAshbyJob(job, token)));
}

async function importSmartRecruiters(board: string): Promise<NormalizedJob[]> {
  const token = board.trim();
  const payload = await fetchJson(`https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(token)}/postings?limit=20`).catch(() => {
    throw new Error("That SmartRecruiters board was not found");
  });
  const body = payload && typeof payload === "object" ? payload as { content?: Record<string, unknown>[] } : {};
  return compactJobs((body.content ?? []).map(job => mapSmartRecruitersJob(job, token)));
}

async function importCompanyBoard(provider: string, board: string): Promise<NormalizedJob[]> {
  if (provider === "lever") return importLever(board);
  if (provider === "ashby") return importAshby(board);
  if (provider === "smartrecruiters") return importSmartRecruiters(board);
  return importGreenhouse(board);
}

type SourceResult = { source: string; jobs: NormalizedJob[]; error?: string };

async function settleSource(source: string, run: () => Promise<NormalizedJob[]>): Promise<SourceResult> {
  try {
    return { source, jobs: await run() };
  } catch (error) {
    return { source, jobs: [], error: error instanceof Error ? error.message : "request failed" };
  }
}

function filterAgainstQueries(jobs: NormalizedJob[], queries: RoleSearchQuery[]) {
  if (!queries.length) return jobs;
  return jobs.filter(job => queries.some(query => listingMatchesQuery(job, query.query)));
}

async function searchRemotive(query: RoleSearchQuery) {
  const params = new URLSearchParams({ search: query.query, limit: "20" });
  if (query.remotiveCategory) params.set("category", query.remotiveCategory);
  const payload = await fetchJson(`https://remotive.com/api/remote-jobs?${params.toString()}`);
  const body = payload && typeof payload === "object" ? payload as { jobs?: Record<string, unknown>[] } : {};
  return compactJobs((body.jobs ?? []).map(mapRemotiveJob), 20);
}

async function searchJobicy(query: RoleSearchQuery) {
  const params = new URLSearchParams({ count: "20" });
  const tag = jobicyTag(query.query);
  if (tag) params.set("tag", tag);
  if (query.jobicyIndustry) params.set("industry", query.jobicyIndustry);
  const payload = await fetchJson(`https://jobicy.com/api/v2/remote-jobs?${params.toString()}`);
  const body = payload && typeof payload === "object" ? payload as { jobs?: Record<string, unknown>[] } : {};
  return compactJobs((body.jobs ?? []).map(mapJobicyJob), 20);
}

async function searchArbeitnow() {
  const payload = await fetchJson("https://www.arbeitnow.com/api/job-board-api");
  const body = payload && typeof payload === "object" ? payload as { data?: Record<string, unknown>[] } : {};
  const rows = Array.isArray(body.data) ? body.data : Array.isArray(payload) ? payload as Record<string, unknown>[] : [];
  return compactJobs(rows.map(mapArbeitnowJob), 40);
}

async function searchMuse(query: RoleSearchQuery) {
  const params = new URLSearchParams({ page: "1" });
  if (query.museCategory) params.append("category", query.museCategory);
  const key = envValue("THE_MUSE_API_KEY");
  if (key) params.set("api_key", key);
  const payload = await fetchJson(`https://www.themuse.com/api/public/jobs?${params.toString()}`);
  const body = payload && typeof payload === "object" ? payload as { results?: Record<string, unknown>[] } : {};
  return compactJobs((body.results ?? []).map(mapMuseJob), 20);
}

function indianApiRows(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload as Record<string, unknown>[];
  if (!payload || typeof payload !== "object") return [];
  const body = payload as { jobs?: unknown; data?: unknown; results?: unknown };
  const rows = body.jobs ?? body.data ?? body.results;
  return Array.isArray(rows) ? rows as Record<string, unknown>[] : [];
}

async function searchIndianApi(query: RoleSearchQuery, locations: string[]) {
  const key = envValue("INDIANAPI_JOBS_KEY");
  if (!key) throw new Error("not configured");
  const params = new URLSearchParams({ limit: "20", title: query.query });
  const location = indiaJobLocation(locations);
  if (location) params.set("location", location);
  const payload = await fetchJson(`https://jobs.indianapi.in/jobs?${params.toString()}`, {
    headers: { "X-Api-Key": key },
  });
  return compactJobs(indianApiRows(payload).map(mapIndianApiJob), 20);
}

async function searchAdzuna(query: RoleSearchQuery, locations: string[]) {
  const appId = envValue("ADZUNA_APP_ID");
  const appKey = envValue("ADZUNA_APP_KEY");
  if (!appId || !appKey) throw new Error("not configured");
  const country = envValue("ADZUNA_COUNTRY") || adzunaCountryFromLocations(locations);
  const params = new URLSearchParams({
    app_id: appId,
    app_key: appKey,
    results_per_page: "20",
    what: query.query,
    content_type: "application/json",
  });
  const payload = await fetchJson(`https://api.adzuna.com/v1/api/jobs/${encodeURIComponent(country)}/search/1?${params.toString()}`);
  const body = payload && typeof payload === "object" ? payload as { results?: Record<string, unknown>[] } : {};
  return compactJobs((body.results ?? []).map(mapAdzunaJob), 20);
}

async function searchPublicJobs(profile: CareerProfile, queries: RoleSearchQuery[]) {
  const primary = queries[0];
  if (!primary) return { listings: [] as NormalizedJob[], sources: [] as string[], failed: [] as string[] };
  const second = queries[1];
  const tasks: Array<Promise<SourceResult>> = [
    settleSource("indianapi", () => searchIndianApi(primary, profile.locations)),
    settleSource("remotive", () => searchRemotive(primary)),
    settleSource("jobicy", () => searchJobicy(primary)),
    settleSource("arbeitnow", searchArbeitnow),
    settleSource("themuse", () => searchMuse(primary)),
    settleSource("adzuna", () => searchAdzuna(primary, profile.locations)),
  ];
  if (second) {
    tasks.push(settleSource("indianapi", () => searchIndianApi(second, profile.locations)));
    tasks.push(settleSource("remotive", () => searchRemotive(second)));
  }
  const results = await Promise.all(tasks);
  const groups = results.map(result => filterAgainstQueries(result.jobs, queries));
  return {
    listings: mergeNormalizedJobs(groups, SEARCH_IMPORT_CAP),
    sources: [...new Set(results.filter(result => result.jobs.length).map(result => result.source))],
    failed: results.filter(result => result.error).map(result => `${result.source}: ${result.error}`),
  };
}

function keepImported(listing: NormalizedJob, scored: { fitScore: number }, profile: CareerProfile) {
  if (isQuotaSalesRole(listing.title) && !profile.targetRoles.some(role => isQuotaSalesRole(role))) return false;
  if (!resumeIsUsable(profile.resumeText)) return true;
  return isRelevantTrackedJob({ title: listing.title, fitScore: scored.fitScore, status: "recommended", source: listing.source }, asProfile(profile));
}

async function persistImported(listings: NormalizedJob[], provider: string, extras?: { sources?: string[]; failed?: string[]; cap?: number }) {
  if (!listings.length) throw new Error("No open roles were returned");
  const profile = await getCareerProfile();
  const existing = await listJobs();
  const seen = new Set(existing.filter(job => job.source.toLowerCase() !== SAMPLE_JOB_SOURCE.toLowerCase()).map(job => fingerprint(job.title, job.company, job.url)));
  let imported = 0;
  let skipped = 0;
  const toInsert: NormalizedJob[] = [];
  for (const listing of listings) {
    const key = fingerprint(listing.title, listing.company, listing.url, listing.providerId);
    if (seen.has(key)) {
      skipped += 1;
      continue;
    }
    seen.add(key);
    const scored = scoreForStorage(profile, listing);
    if (!keepImported(listing, scored, profile)) {
      skipped += 1;
      continue;
    }
    toInsert.push(listing);
  }
  if (toInsert.length) await dropSampleJobs();
  for (const listing of toInsert) {
    const scored = scoreForStorage(profile, listing);
    const id = crypto.randomUUID();
    await db().prepare("INSERT INTO jobs (id,title,company,location,fit_score,status,source,next_action,url,description,fit_reason,evidence_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(
        id, listing.title, listing.company, listing.location,
        scored.fitScore, "recommended", listing.source,
        scored.fitScore === 0 ? UNMATCHED_ACTION : "Review role and decide whether to apply",
        listing.url, listing.description, scored.fitReason, JSON.stringify(scored.evidence),
      ).run();
    imported += 1;
  }
  if (!imported && !skipped) throw new Error("No open roles were returned");
  return {
    imported,
    skipped,
    total: listings.length,
    provider,
    cap: extras?.cap ?? listings.length,
    sources: extras?.sources ?? [provider],
    failed: extras?.failed ?? [],
  };
}

export async function importJobsForTargets() {
  const profile = await getCareerProfile();
  const queries = searchQueriesFromTargets(profile);
  if (!queries.length) throw new Error("Add target roles on You first, then collect again.");
  const { listings, sources, failed } = await searchPublicJobs(profile, queries);
  if (!listings.length) {
    const hint = failed.filter(item => !/not configured/i.test(item)).length
      ? ` Public boards we tried: ${failed.filter(item => !/not configured/i.test(item)).slice(0, 3).join("; ")}.`
      : "";
    throw new Error(`No public roles matched those targets.${hint} Try a company board or paste a URL. We do not open LinkedIn.`);
  }
  return persistImported(listings, "targets", { sources, failed, cap: SEARCH_IMPORT_CAP });
}

export async function importJobs(provider: string, board: string) {
  const kind = provider.trim().toLowerCase();
  if (kind === "targets" || kind === "search") return importJobsForTargets();
  const token = board.trim();
  if (!token) throw new Error("A company or board name is required");
  const listings = await importCompanyBoard(kind, token);
  return persistImported(listings, kind);
}

export async function scheduleTopJob() {
  const profile = await getCareerProfile();
  const jobs = (await listJobs()).filter(job => isRelevantTrackedJob(job, asProfile(profile)) && !new Set(["applied", "rejected", "archived"]).has(job.status));
  const top = jobs.sort((a, b) => b.fitScore - a.fitScore)[0];
  if (!top) throw new Error("Add or import a role first");
  const slot = await slotForDuration(45);
  const preference = await db().prepare("SELECT policy FROM calendar_preferences WHERE id='primary'").first<{ policy: string }>();
  const automatic = preference?.policy !== "propose_only";
  const blockId = crypto.randomUUID();
  const title = `Review ${top.title} at ${top.company}`;
  const state = automatic ? "approved_pending" : "proposed";
  const statements = [
    db().prepare("INSERT INTO calendar_blocks (id,title,goal_id,milestone_id,start_at,end_at,state,ownership,source) VALUES (?,?,?,?,?,?,?,?,?)")
      .bind(blockId, title, "goal-career", "ms-pipeline", slot.startAt, slot.endAt, state, "operator_created", "local"),
    db().prepare("UPDATE jobs SET next_action=? WHERE id=?").bind("Review during the proposed calendar block", top.id),
  ];
  if (automatic) {
    statements.push(db().prepare("INSERT INTO calendar_write_requests (id,block_id,action,status,payload_json) VALUES (?,?,?,?,?)")
      .bind(crypto.randomUUID(), blockId, "create", "approved_pending", JSON.stringify({ title, startAt: slot.startAt, endAt: slot.endAt, timezone: "Asia/Kolkata", description: `[AI Operator] Application review · ${top.id}` })));
  }
  await db().batch(statements);
  const when = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(slot.startAt));
  return {
    jobId: top.id,
    blockId,
    title,
    startAt: slot.startAt,
    message: automatic
      ? `Queued a calendar block at ${when} to review ${top.title} at ${top.company}`
      : `Proposed a 45-minute block at ${when} to review ${top.title} at ${top.company}`,
  };
}
