export type ScoreableProfile = {
  targetRoles: string[];
  industries: string[];
  locations: string[];
  workModes: string[];
  strengths: string[];
  exclusions: string[];
  resumeText: string;
};

export type ScoreableJob = {
  title: string;
  company: string;
  location: string;
};

export type JobScore = {
  fitScore: number;
  fitReason: string;
  evidence: string[];
};

const STOPWORDS = new Set([
  "a", "an", "and", "at", "for", "from", "in", "of", "on", "or", "the", "to", "with",
  "senior", "lead", "principal", "staff", "manager", "product", "role",
]);

function normalize(value: string) {
  return value.toLocaleLowerCase("en-US").replace(/[^a-z0-9+/# ]+/g, " ").replace(/\s+/g, " ").trim();
}

function tokens(value: string) {
  return new Set(normalize(value).split(" ").filter(word => word.length > 2 && !STOPWORDS.has(word)));
}

function includesNormalized(haystack: string, needle: string) {
  const hay = normalize(haystack);
  const pin = normalize(needle);
  return Boolean(pin) && hay.includes(pin);
}

export function profileHasSignal(profile: ScoreableProfile) {
  return Boolean(
    profile.resumeText.trim()
    || profile.targetRoles.length
    || profile.strengths.length
    || profile.locations.length
    || profile.industries.length,
  );
}

export function scoreJob(profile: ScoreableProfile, job: ScoreableJob): JobScore {
  if (!profileHasSignal(profile)) {
    return {
      fitScore: 50,
      fitReason: "Add a résumé and target roles so the Operator can score this against your evidence.",
      evidence: [],
    };
  }

  const evidence: string[] = [];
  let score = 38;
  const blob = `${job.title} ${job.company} ${job.location}`;
  const resume = profile.resumeText.slice(0, 20_000);

  for (const role of profile.targetRoles) {
    if (includesNormalized(job.title, role) || includesNormalized(role, job.title)) {
      score += 22;
      evidence.push(`Title matches target role “${role}”.`);
      break;
    }
    const roleWords = [...tokens(role)];
    const titleWords = tokens(job.title);
    const overlap = roleWords.filter(word => titleWords.has(word));
    if (overlap.length >= 2) {
      score += 14;
      evidence.push(`Title overlaps target role “${role}” (${overlap.slice(0, 3).join(", ")}).`);
      break;
    }
  }

  for (const location of profile.locations) {
    if (includesNormalized(job.location, location) || includesNormalized(location, job.location)) {
      score += 12;
      evidence.push(`Location matches preference “${location}”.`);
      break;
    }
  }

  const remoteJob = /remote|india|hybrid/i.test(blob);
  if (remoteJob && profile.workModes.some(mode => /remote|hybrid/i.test(mode))) {
    score += 8;
    evidence.push("Work mode matches a remote or hybrid preference.");
  }

  for (const industry of profile.industries) {
    if (includesNormalized(blob, industry) || includesNormalized(resume, industry) && includesNormalized(blob, industry)) {
      score += 6;
      evidence.push(`Industry signal “${industry}” appears in the role.`);
      break;
    }
  }

  const resumeTokens = tokens(`${resume} ${profile.strengths.join(" ")}`);
  const jobTokens = tokens(blob);
  const shared = [...jobTokens].filter(word => resumeTokens.has(word)).slice(0, 6);
  if (shared.length) {
    score += Math.min(18, shared.length * 3);
    evidence.push(`Résumé evidence overlaps the posting: ${shared.join(", ")}.`);
  }

  for (const strength of profile.strengths) {
    if (includesNormalized(blob, strength) || includesNormalized(resume, strength) && tokens(strength).size <= 4 && includesNormalized(job.title, strength)) {
      score += 5;
      evidence.push(`Strength “${strength}” is relevant to this posting.`);
      break;
    }
  }

  for (const exclusion of profile.exclusions) {
    if (includesNormalized(blob, exclusion)) {
      score -= 28;
      evidence.push(`Exclusion “${exclusion}” appears in the posting.`);
      break;
    }
  }

  if (/\b(account executive|account exec|\bsdr\b|\bbdr\b|quota-carrying)\b/i.test(job.title)
    && !profile.targetRoles.some(role => /account executive|sales/i.test(role))) {
    score -= 32;
    evidence.push("Quota-carrying sales title is off-profile for the current target roles.");
  }

  const fitScore = Math.max(8, Math.min(97, Math.round(score)));
  const fitReason = evidence.length
    ? evidence.slice(0, 3).join(" ")
    : "Limited overlap with the current résumé and preferences — review before investing time.";

  return { fitScore, fitReason, evidence: evidence.slice(0, 6) };
}
