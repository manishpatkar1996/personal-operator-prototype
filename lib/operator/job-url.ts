export type ParsedJobUrl = {
  url: string;
  host: string;
  linkedInJobId?: string;
  title?: string;
  company?: string;
};

export type JobPasteInput = {
  url: string;
  title?: string;
  company?: string;
  location?: string;
  description?: string;
};

export type JobPasteDraft = {
  title: string;
  company: string;
  location: string;
  url: string;
  source: string;
  description: string;
  nextAction: string;
  linkedInJobId?: string;
};

const LINKEDIN_HOST = /(^|\.)linkedin\.com$/i;
const DESCRIPTION_MAX = 24_000;

function titleCaseSlug(slug: string) {
  return slug
    .split("-")
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function withHttps(raw: string) {
  return /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
}

function parseLinkedInJobId(url: URL) {
  const view = url.pathname.match(/\/jobs\/view\/([^/]+)/i)?.[1] ?? "";
  const token = decodeURIComponent(view).replace(/\/+$/, "");
  const trailingId = token.match(/^(?:(.+)-)?(\d{3,})$/);
  const fromQuery = url.searchParams.get("currentJobId") ?? "";
  const jobId = trailingId?.[2] || (/^\d{3,}$/.test(fromQuery) ? fromQuery : "");
  if (!jobId) {
    throw new Error("That LinkedIn link is not a job posting. Paste a /jobs/view/… URL.");
  }
  let title: string | undefined;
  let company: string | undefined;
  const slug = trailingId?.[1] ?? "";
  if (slug) {
    const at = slug.match(/^(.*)-at-(.+)$/i);
    if (at) {
      title = titleCaseSlug(at[1]);
      company = titleCaseSlug(at[2]);
    } else {
      title = titleCaseSlug(slug);
    }
  }
  return { linkedInJobId: jobId, title, company };
}

export function parseJobUrl(raw: string): ParsedJobUrl {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("Paste a job URL first.");
  let parsed: URL;
  try {
    parsed = new URL(withHttps(trimmed));
  } catch {
    throw new Error("That is not a valid job URL.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Use an http(s) job link.");
  }
  const host = parsed.hostname.toLowerCase();
  if (LINKEDIN_HOST.test(host)) {
    const linkedIn = parseLinkedInJobId(parsed);
    return { url: trimmed.includes("://") ? trimmed : parsed.href, host, ...linkedIn };
  }
  return { url: trimmed.includes("://") ? trimmed : parsed.href, host };
}

export function jobFingerprint(title: string, company: string, url: string) {
  const trimmed = url.trim();
  if (trimmed) {
    try {
      const parsed = parseJobUrl(trimmed);
      if (parsed.linkedInJobId) return `linkedin:${parsed.linkedInJobId}`;
      return parsed.url.replace(/\/+$/, "").toLocaleLowerCase();
    } catch {
      return trimmed.toLocaleLowerCase();
    }
  }
  return `${title.trim().toLocaleLowerCase()}::${company.trim().toLocaleLowerCase()}`;
}

export function jobFromPaste(input: JobPasteInput): JobPasteDraft {
  const parsed = parseJobUrl(input.url);
  const title = (input.title ?? "").trim() || parsed.title || (parsed.linkedInJobId ? `LinkedIn job ${parsed.linkedInJobId}` : "Untitled role");
  const company = (input.company ?? "").trim() || parsed.company || "Unknown company";
  const description = (input.description ?? "").trim().slice(0, DESCRIPTION_MAX);
  return {
    title,
    company,
    location: (input.location ?? "").trim() || "Unspecified",
    url: parsed.url,
    source: "Pasted URL",
    description,
    nextAction: description
      ? "Review the pasted posting and decide whether to apply"
      : "Open the posting and add a title or description",
    linkedInJobId: parsed.linkedInJobId,
  };
}
