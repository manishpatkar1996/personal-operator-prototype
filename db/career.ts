import { env } from "cloudflare:workers";

const LOCAL_PROFILE_ID = "local";

export const CAREER_ONBOARDING_STATUSES = [
  "not_started",
  "in_progress",
  "complete",
] as const;

export type CareerOnboardingStatus = (typeof CAREER_ONBOARDING_STATUSES)[number];

export type CareerProfile = {
  id: typeof LOCAL_PROFILE_ID;
  targetRoles: string[];
  industries: string[];
  locations: string[];
  workModes: string[];
  seniority: string[];
  compensationNotes: string;
  strengths: string[];
  exclusions: string[];
  resumeFilename: string;
  resumeText: string;
  onboardingStatus: CareerOnboardingStatus;
  createdAt: string | null;
  updatedAt: string | null;
};

export type CareerProfileInput = Partial<
  Omit<CareerProfile, "id" | "createdAt" | "updatedAt">
>;

type CareerProfileRow = {
  id: string;
  target_roles_json: string;
  industries_json: string;
  locations_json: string;
  work_modes_json: string;
  seniority_json: string;
  compensation_notes: string;
  strengths_json: string;
  exclusions_json: string;
  resume_filename: string;
  resume_text: string;
  onboarding_status: string;
  created_at: string;
  updated_at: string;
};

type StringListRule = {
  label: string;
  maxItems: number;
  maxItemLength: number;
};

export class CareerProfileValidationError extends Error {
  readonly status = 400;

  constructor(message: string) {
    super(message);
    this.name = "CareerProfileValidationError";
  }
}

const EMPTY_PROFILE: CareerProfile = {
  id: LOCAL_PROFILE_ID,
  targetRoles: [],
  industries: [],
  locations: [],
  workModes: [],
  seniority: [],
  compensationNotes: "",
  strengths: [],
  exclusions: [],
  resumeFilename: "",
  resumeText: "",
  onboardingStatus: "not_started",
  createdAt: null,
  updatedAt: null,
};

const INPUT_FIELDS = new Set<keyof CareerProfileInput>([
  "targetRoles",
  "industries",
  "locations",
  "workModes",
  "seniority",
  "compensationNotes",
  "strengths",
  "exclusions",
  "resumeFilename",
  "resumeText",
  "onboardingStatus",
]);

function database() {
  if (!env.DB) throw new Error("D1 binding DB is unavailable");
  return env.DB;
}

export async function ensureCareerProfileSchema() {
  const db = database();
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS career_profiles (
      id TEXT PRIMARY KEY,
      target_roles_json TEXT NOT NULL DEFAULT '[]',
      industries_json TEXT NOT NULL DEFAULT '[]',
      locations_json TEXT NOT NULL DEFAULT '[]',
      work_modes_json TEXT NOT NULL DEFAULT '[]',
      seniority_json TEXT NOT NULL DEFAULT '[]',
      compensation_notes TEXT NOT NULL DEFAULT '',
      strengths_json TEXT NOT NULL DEFAULT '[]',
      exclusions_json TEXT NOT NULL DEFAULT '[]',
      resume_filename TEXT NOT NULL DEFAULT '',
      resume_text TEXT NOT NULL DEFAULT '',
      onboarding_status TEXT NOT NULL DEFAULT 'not_started',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CHECK (id = 'local'),
      CHECK (onboarding_status IN ('not_started', 'in_progress', 'complete'))
    )`),
  ]);
}

function readJsonList(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every(item => typeof item === "string")
      ? parsed
      : [];
  } catch {
    return [];
  }
}

function rowToProfile(row: CareerProfileRow): CareerProfile {
  const onboardingStatus = CAREER_ONBOARDING_STATUSES.includes(
    row.onboarding_status as CareerOnboardingStatus,
  )
    ? (row.onboarding_status as CareerOnboardingStatus)
    : "not_started";

  return {
    id: LOCAL_PROFILE_ID,
    targetRoles: readJsonList(row.target_roles_json),
    industries: readJsonList(row.industries_json),
    locations: readJsonList(row.locations_json),
    workModes: readJsonList(row.work_modes_json),
    seniority: readJsonList(row.seniority_json),
    compensationNotes: row.compensation_notes,
    strengths: readJsonList(row.strengths_json),
    exclusions: readJsonList(row.exclusions_json),
    resumeFilename: row.resume_filename,
    resumeText: row.resume_text,
    onboardingStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function validateString(value: unknown, label: string, maxLength: number) {
  if (typeof value !== "string") {
    throw new CareerProfileValidationError(`${label} must be a string`);
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new CareerProfileValidationError(
      `${label} must be ${maxLength.toLocaleString()} characters or fewer`,
    );
  }
  return normalized;
}

function validateStringList(value: unknown, rule: StringListRule) {
  if (!Array.isArray(value)) {
    throw new CareerProfileValidationError(`${rule.label} must be a list`);
  }
  if (value.length > rule.maxItems) {
    throw new CareerProfileValidationError(
      `${rule.label} can contain at most ${rule.maxItems} items`,
    );
  }

  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const item of value) {
    const text = validateString(item, `${rule.label} item`, rule.maxItemLength);
    if (!text) continue;
    const key = text.toLocaleLowerCase("en-US");
    if (!seen.has(key)) {
      seen.add(key);
      normalized.push(text);
    }
  }
  return normalized;
}

export function validateCareerProfileInput(value: unknown): CareerProfileInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CareerProfileValidationError("Career profile must be a JSON object");
  }

  const input = value as Record<string, unknown>;
  const unexpected = Object.keys(input).filter(
    key => !INPUT_FIELDS.has(key as keyof CareerProfileInput),
  );
  if (unexpected.length) {
    throw new CareerProfileValidationError(
      `Unsupported career profile field${unexpected.length === 1 ? "" : "s"}: ${unexpected.join(", ")}`,
    );
  }

  const result: CareerProfileInput = {};
  if ("targetRoles" in input) {
    result.targetRoles = validateStringList(input.targetRoles, {
      label: "Target roles",
      maxItems: 20,
      maxItemLength: 120,
    });
  }
  if ("industries" in input) {
    result.industries = validateStringList(input.industries, {
      label: "Industries",
      maxItems: 20,
      maxItemLength: 100,
    });
  }
  if ("locations" in input) {
    result.locations = validateStringList(input.locations, {
      label: "Locations",
      maxItems: 20,
      maxItemLength: 120,
    });
  }
  if ("workModes" in input) {
    result.workModes = validateStringList(input.workModes, {
      label: "Work modes",
      maxItems: 8,
      maxItemLength: 50,
    });
  }
  if ("seniority" in input) {
    result.seniority = validateStringList(input.seniority, {
      label: "Seniority levels",
      maxItems: 10,
      maxItemLength: 80,
    });
  }
  if ("strengths" in input) {
    result.strengths = validateStringList(input.strengths, {
      label: "Strengths",
      maxItems: 30,
      maxItemLength: 250,
    });
  }
  if ("exclusions" in input) {
    result.exclusions = validateStringList(input.exclusions, {
      label: "Exclusions",
      maxItems: 30,
      maxItemLength: 250,
    });
  }
  if ("compensationNotes" in input) {
    result.compensationNotes = validateString(
      input.compensationNotes,
      "Compensation notes",
      2_000,
    );
  }
  if ("resumeFilename" in input) {
    result.resumeFilename = validateString(
      input.resumeFilename,
      "Resume filename",
      255,
    );
  }
  if ("resumeText" in input) {
    if (typeof input.resumeText !== "string") {
      throw new CareerProfileValidationError("Resume text must be a string");
    }
    if (input.resumeText.length > 250_000) {
      throw new CareerProfileValidationError(
        "Resume text must be 250,000 characters or fewer",
      );
    }
    result.resumeText = input.resumeText;
  }
  if ("onboardingStatus" in input) {
    if (
      typeof input.onboardingStatus !== "string" ||
      !CAREER_ONBOARDING_STATUSES.includes(
        input.onboardingStatus as CareerOnboardingStatus,
      )
    ) {
      throw new CareerProfileValidationError(
        `Onboarding status must be one of: ${CAREER_ONBOARDING_STATUSES.join(", ")}`,
      );
    }
    result.onboardingStatus = input.onboardingStatus as CareerOnboardingStatus;
  }

  return result;
}

export async function getCareerProfile(): Promise<CareerProfile> {
  await ensureCareerProfileSchema();
  const row = await database()
    .prepare(`SELECT
      id,
      target_roles_json,
      industries_json,
      locations_json,
      work_modes_json,
      seniority_json,
      compensation_notes,
      strengths_json,
      exclusions_json,
      resume_filename,
      resume_text,
      onboarding_status,
      created_at,
      updated_at
    FROM career_profiles
    WHERE id = ?`)
    .bind(LOCAL_PROFILE_ID)
    .first<CareerProfileRow>();

  return row ? rowToProfile(row) : { ...EMPTY_PROFILE };
}

export async function saveCareerProfile(value: unknown): Promise<CareerProfile> {
  const input = validateCareerProfileInput(value);
  if (!Object.keys(input).length) {
    throw new CareerProfileValidationError(
      "Provide at least one career profile field to update",
    );
  }

  const current = await getCareerProfile();
  const next = { ...current, ...input };
  const db = database();
  await db.prepare(`INSERT INTO career_profiles (
      id,
      target_roles_json,
      industries_json,
      locations_json,
      work_modes_json,
      seniority_json,
      compensation_notes,
      strengths_json,
      exclusions_json,
      resume_filename,
      resume_text,
      onboarding_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      target_roles_json = excluded.target_roles_json,
      industries_json = excluded.industries_json,
      locations_json = excluded.locations_json,
      work_modes_json = excluded.work_modes_json,
      seniority_json = excluded.seniority_json,
      compensation_notes = excluded.compensation_notes,
      strengths_json = excluded.strengths_json,
      exclusions_json = excluded.exclusions_json,
      resume_filename = excluded.resume_filename,
      resume_text = excluded.resume_text,
      onboarding_status = excluded.onboarding_status,
      updated_at = CURRENT_TIMESTAMP`)
    .bind(
      LOCAL_PROFILE_ID,
      JSON.stringify(next.targetRoles),
      JSON.stringify(next.industries),
      JSON.stringify(next.locations),
      JSON.stringify(next.workModes),
      JSON.stringify(next.seniority),
      next.compensationNotes,
      JSON.stringify(next.strengths),
      JSON.stringify(next.exclusions),
      next.resumeFilename,
      next.resumeText,
      next.onboardingStatus,
    )
    .run();

  const saved = await getCareerProfile();
  if (input.resumeText !== undefined || input.strengths !== undefined || input.targetRoles !== undefined || input.exclusions !== undefined || input.industries !== undefined) {
    try {
      const { seedAemonFromCareerProfile } = await import("./learning-preferences");
      await seedAemonFromCareerProfile(saved);
    } catch {
      /* Aemon taste is best-effort; career save should still succeed */
    }
  }
  return saved;
}
