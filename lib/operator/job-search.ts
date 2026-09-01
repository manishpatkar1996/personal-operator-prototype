import { jobFingerprint } from "./job-url.ts";

export const SEARCH_IMPORT_CAP = 24;
export const BOARD_IMPORT_CAP = 20;
export const JOB_DESCRIPTION_MAX = 24_000;

export const COMPANY_BOARD_PROVIDERS = [
  { id: "greenhouse", label: "Greenhouse", placeholder: "stripe" },
  { id: "lever", label: "Lever", placeholder: "netflix" },
  { id: "ashby", label: "Ashby", placeholder: "notion" },
  { id: "smartrecruiters", label: "SmartRecruiters", placeholder: "company-slug" },
] as const;

export type CompanyBoardProvider = (typeof COMPANY_BOARD_PROVIDERS)[number]["id"];

export type RoleSearchInput = {
  targetRoles: string[];
  industries?: string[];
  locations?: string[];
  seniority?: string[];
  workModes?: string[];
};

export type RoleSearchQuery = {
  query: string;
  remotiveCategory?: string;
  jobicyIndustry?: string;
  museCategory?: string;
};

export type NormalizedJob = {
  title: string;
  company: string;
  location: string;
  url: string;
  description: string;
  source: string;
  providerId?: string;
};

const STOPWORDS = new Set([
  "a", "an", "and", "at", "for", "from", "in", "of", "on", "or", "the", "to", "with",
]);

function text(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function stripHtml(value: string) {
  return text(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, "\"")
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/\s+([.,;:!?])/g, "$1"),
  ).slice(0, JOB_DESCRIPTION_MAX);
}

function clipDescription(value: unknown) {
  return stripHtml(String(value ?? "")).slice(0, JOB_DESCRIPTION_MAX);
}

function normalize(value: string) {
  return value.toLocaleLowerCase("en-US").replace(/[^a-z0-9+/# ]+/g, " ").replace(/\s+/g, " ").trim();
}

function tokens(value: string) {
  return [...new Set(normalize(value).split(" ").filter(word => word.length > 1 && !STOPWORDS.has(word)))];
}

export function expandRoleQuery(role: string) {
  const trimmed = role.trim();
  if (!trimmed) return "";
  if (/^pms?$/i.test(trimmed) || /^product mgrs?$/i.test(trimmed)) return "product manager";
  if (/^ux$/i.test(trimmed) || /^ui$/i.test(trimmed)) return "product designer";
  if (/^swe$/i.test(trimmed) || /^sde$/i.test(trimmed)) return "software engineer";
  if (/^ds$/i.test(trimmed)) return "data scientist";
  return trimmed;
}

export function remotiveCategoryFor(role: string) {
  const n = normalize(role);
  if (/\b(product manager|product lead|product owner|\bpm\b)\b/.test(n) || n === "product manager") return "product";
  if (/\b(software|engineer|developer|frontend|backend|full stack|sre|devops)\b/.test(n)) return "software-dev";
  if (/\b(design|designer|ux|ui)\b/.test(n)) return "design";
  if (/\b(data scientist|data analyst|data engineer|machine learning|\bml\b|\bai\b research)\b/.test(n)) return "data";
  if (/\b(marketing|growth|brand)\b/.test(n)) return "marketing";
  if (/\b(sales|account executive|\bsdr\b|\bbdr\b)\b/.test(n)) return "sales";
  if (/\b(writer|content|copywriter|editor)\b/.test(n)) return "writing";
  if (/\b(customer success|customer support|support)\b/.test(n)) return "customer-support";
  if (/\b(recruiter|people|human resources|\bhr\b)\b/.test(n)) return "hr";
  if (/\b(finance|accountant|controller)\b/.test(n)) return "finance-legal";
  return undefined;
}

export function jobicyIndustryFor(role: string) {
  const n = normalize(role);
  if (/\b(product manager|product lead|product owner|\bpm\b)\b/.test(n)) return "product";
  if (/\b(software|engineer|developer|sre|devops)\b/.test(n)) return "engineering";
  if (/\b(design|designer|ux|ui)\b/.test(n)) return "design";
  if (/\b(data scientist|data analyst|data engineer|machine learning)\b/.test(n)) return "data";
  if (/\b(marketing|growth|brand)\b/.test(n)) return "marketing";
  if (/\b(sales|account executive)\b/.test(n)) return "business";
  if (/\b(writer|content|copywriter)\b/.test(n)) return "copywriting";
  if (/\b(finance|accountant)\b/.test(n)) return "finance";
  return undefined;
}

export function museCategoryFor(role: string) {
  const n = normalize(role);
  if (/\b(product manager|product lead|product owner|\bpm\b)\b/.test(n)) return "Product";
  if (/\b(software|engineer|developer|sre|devops)\b/.test(n)) return "Engineering";
  if (/\b(design|designer|ux|ui)\b/.test(n)) return "Creative & Design";
  if (/\b(data scientist|data analyst|data engineer|machine learning)\b/.test(n)) return "Data Science";
  if (/\b(marketing|growth|brand)\b/.test(n)) return "Marketing";
  if (/\b(sales|account executive|\bsdr\b)\b/.test(n)) return "Sales & BD";
  if (/\b(writer|content|editor)\b/.test(n)) return "Writing and Editing";
  if (/\b(recruiter|people|\bhr\b)\b/.test(n)) return "HR & Recruiting";
  if (/\b(project manager|program manager)\b/.test(n)) return "Project Management";
  return undefined;
}

function queryKey(query: string) {
  return normalize(query).replace(/^(senior|staff|principal|lead|junior|sr|jr)\s+/, "");
}

export function searchQueriesFromTargets(input: RoleSearchInput): RoleSearchQuery[] {
  const seen = new Set<string>();
  const queries: RoleSearchQuery[] = [];
  for (const role of input.targetRoles) {
    const query = expandRoleQuery(role);
    const key = queryKey(query);
    if (!query || seen.has(key)) continue;
    seen.add(key);
    queries.push({
      query,
      remotiveCategory: remotiveCategoryFor(query),
      jobicyIndustry: jobicyIndustryFor(query),
      museCategory: museCategoryFor(query),
    });
    if (queries.length >= 3) break;
  }
  return queries;
}

export function jobicyTag(query: string) {
  const trimmed = expandRoleQuery(query).slice(0, 50).trim();
  return trimmed.length >= 3 ? trimmed : "";
}

export function listingMatchesQuery(job: { title: string; description?: string }, query: string) {
  const qTokens = tokens(query);
  if (!qTokens.length) return true;
  const titleNorm = normalize(job.title);
  const titleHits = qTokens.filter(token => titleNorm.includes(token));
  if (titleHits.length >= 1) return true;
  const blob = normalize(`${job.title} ${job.description ?? ""}`.slice(0, 800));
  const hits = qTokens.filter(token => blob.includes(token));
  return hits.length >= Math.min(2, qTokens.length);
}

export function listingFingerprint(job: Pick<NormalizedJob, "title" | "company" | "url" | "providerId">) {
  if (job.url.trim()) return jobFingerprint(job.title, job.company, job.url);
  if (job.providerId?.trim()) return job.providerId.trim().toLocaleLowerCase("en-US");
  return jobFingerprint(job.title, job.company, "");
}

function asJob(input: {
  title?: unknown;
  company?: unknown;
  location?: unknown;
  url?: unknown;
  description?: unknown;
  source: string;
  providerId?: unknown;
}): NormalizedJob | null {
  const title = text(input.title);
  const company = text(input.company);
  const url = text(input.url);
  if (!title || !company) return null;
  return {
    title,
    company,
    location: text(input.location) || "Unspecified",
    url,
    description: clipDescription(input.description),
    source: input.source,
    providerId: text(input.providerId) || undefined,
  };
}

export function mapGreenhouseJob(job: Record<string, unknown>, company: string): NormalizedJob | null {
  const location = job.location && typeof job.location === "object" ? (job.location as { name?: unknown }).name : job.location;
  const id = job.id != null ? `greenhouse:${job.id}` : undefined;
  return asJob({
    title: job.title,
    company,
    location,
    url: job.absolute_url,
    description: job.content,
    source: `Greenhouse · ${company}`,
    providerId: id,
  });
}

export function mapLeverJob(job: Record<string, unknown>, company: string): NormalizedJob | null {
  const categories = job.categories && typeof job.categories === "object" ? job.categories as { location?: unknown } : {};
  const id = text(job.id) ? `lever:${job.id}` : undefined;
  return asJob({
    title: job.text ?? job.title,
    company,
    location: categories.location,
    url: job.hostedUrl ?? job.applyUrl,
    description: job.descriptionPlain ?? job.description,
    source: `Lever · ${company}`,
    providerId: id,
  });
}

export function mapAshbyJob(job: Record<string, unknown>, company: string): NormalizedJob | null {
  const id = text(job.id) ? `ashby:${job.id}` : undefined;
  const remote = job.isRemote === true || String(job.workplaceType ?? "") === "Remote";
  return asJob({
    title: job.title,
    company: company || text(job.department) || "Unknown company",
    location: remote ? "Remote" : job.location,
    url: job.jobUrl ?? job.applyUrl,
    description: job.descriptionPlain ?? job.descriptionHtml,
    source: `Ashby · ${company}`,
    providerId: id,
  });
}

export function mapSmartRecruitersJob(job: Record<string, unknown>, company: string): NormalizedJob | null {
  const location = job.location && typeof job.location === "object"
    ? [text((job.location as { city?: unknown }).city), text((job.location as { region?: unknown }).region), text((job.location as { country?: unknown }).country)].filter(Boolean).join(", ")
    : job.location;
  const id = text(job.id);
  const url = text((job.ref as { jobAd?: string } | undefined)?.jobAd)
    || (id ? `https://jobs.smartrecruiters.com/${encodeURIComponent(company)}/${encodeURIComponent(id)}` : "");
  return asJob({
    title: job.name ?? job.title,
    company,
    location,
    url,
    description: job.jobAd && typeof job.jobAd === "object" ? (job.jobAd as { text?: unknown }).text : undefined,
    source: `SmartRecruiters · ${company}`,
    providerId: id ? `smartrecruiters:${id}` : undefined,
  });
}

export function mapRemotiveJob(job: Record<string, unknown>): NormalizedJob | null {
  const company = text(job.company_name);
  const id = job.id != null ? `remotive:${job.id}` : undefined;
  return asJob({
    title: job.title,
    company,
    location: job.candidate_required_location,
    url: job.url,
    description: job.description,
    source: company ? `Remotive · ${company}` : "Remotive",
    providerId: id,
  });
}

export function mapJobicyJob(job: Record<string, unknown>): NormalizedJob | null {
  const company = text(job.companyName);
  const id = job.id != null ? `jobicy:${job.id}` : undefined;
  return asJob({
    title: job.jobTitle ?? job.title,
    company,
    location: job.jobGeo,
    url: job.url,
    description: job.jobExcerpt ?? job.jobDescription,
    source: company ? `Jobicy · ${company}` : "Jobicy",
    providerId: id,
  });
}

export function mapArbeitnowJob(job: Record<string, unknown>): NormalizedJob | null {
  const company = text(job.company_name);
  const slug = text(job.slug);
  return asJob({
    title: job.title,
    company,
    location: job.remote === true ? "Remote" : job.location,
    url: job.url,
    description: job.description,
    source: company ? `Arbeitnow · ${company}` : "Arbeitnow",
    providerId: slug ? `arbeitnow:${slug}` : undefined,
  });
}

export function mapMuseJob(job: Record<string, unknown>): NormalizedJob | null {
  const companyObj = job.company && typeof job.company === "object" ? job.company as { name?: unknown } : {};
  const locations = Array.isArray(job.locations) ? job.locations : [];
  const location = locations.map(item => text((item as { name?: unknown }).name)).filter(Boolean).join(" · ");
  const refs = job.refs && typeof job.refs === "object" ? job.refs as { landing_page?: unknown } : {};
  const company = text(companyObj.name);
  const id = job.id != null ? `muse:${job.id}` : undefined;
  return asJob({
    title: job.name ?? job.title,
    company,
    location,
    url: refs.landing_page,
    description: job.contents,
    source: company ? `The Muse · ${company}` : "The Muse",
    providerId: id,
  });
}

export function mapIndianApiJob(job: Record<string, unknown>): NormalizedJob | null {
  const company = text(job.company);
  const id = job.id != null ? `indianapi:${job.id}` : undefined;
  const description = [job.job_description, job.role_and_responsibility, job.education_and_skills]
    .map(item => text(item))
    .filter(Boolean)
    .join("\n\n");
  return asJob({
    title: job.title ?? job.job_title,
    company,
    location: job.location,
    url: job.apply_link ?? job.url,
    description,
    source: company ? `India jobs · ${company}` : "India jobs",
    providerId: id,
  });
}

export function indiaJobLocation(locations: string[]) {
  const blob = normalize(locations.join(" "));
  if (/\bchennai\b/.test(blob)) return "Chennai";
  if (/\b(bengaluru|bangalore)\b/.test(blob)) return "Bangalore";
  if (/\bhyderabad\b/.test(blob)) return "Hyderabad";
  if (/\bmumbai\b/.test(blob)) return "Mumbai";
  if (/\b(delhi|ncr|gurgaon|gurugram|noida)\b/.test(blob)) return "Delhi";
  if (/\bpune\b/.test(blob)) return "Pune";
  if (/\bindia\b/.test(blob)) return "India";
  return "";
}

export function mapAdzunaJob(job: Record<string, unknown>): NormalizedJob | null {
  const companyObj = job.company && typeof job.company === "object" ? job.company as { display_name?: unknown } : {};
  const locationObj = job.location && typeof job.location === "object" ? job.location as { display_name?: unknown } : {};
  const company = text(companyObj.display_name);
  const id = job.id != null ? `adzuna:${job.id}` : undefined;
  return asJob({
    title: job.title,
    company,
    location: locationObj.display_name,
    url: job.redirect_url ?? job.url,
    description: job.description,
    source: company ? `Adzuna · ${company}` : "Adzuna",
    providerId: id,
  });
}

export function adzunaCountryFromLocations(locations: string[]) {
  const blob = normalize(locations.join(" "));
  if (/\b(india|bengaluru|bangalore|chennai|hyderabad|mumbai|delhi|pune)\b/.test(blob)) return "in";
  if (/\b(united kingdom|\buk\b|london|england|scotland|wales)\b/.test(blob)) return "gb";
  if (/\b(germany|berlin|munich|hamburg)\b/.test(blob)) return "de";
  if (/\b(canada|toronto|vancouver|montreal)\b/.test(blob)) return "ca";
  if (/\b(australia|sydney|melbourne)\b/.test(blob)) return "au";
  if (/\b(united states|\busa\b|\bus\b|new york|san francisco|seattle|austin)\b/.test(blob)) return "us";
  if (/\bremote\b/.test(blob)) return "us";
  return "us";
}

export function mergeNormalizedJobs(groups: NormalizedJob[][], cap = SEARCH_IMPORT_CAP) {
  const seen = new Set<string>();
  const merged: NormalizedJob[] = [];
  for (const group of groups) {
    for (const job of group) {
      const key = listingFingerprint(job);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(job);
      if (merged.length >= cap) return merged;
    }
  }
  return merged;
}
