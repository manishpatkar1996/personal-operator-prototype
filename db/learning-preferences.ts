import { env } from "cloudflare:workers";

const preferenceId = "primary";
const maxListEntries = 24;
const maxLabelLength = 80;
const maxWeeklyBudgetMinutes = 10_080;
const maxSourceNameLength = 120;
const maxSourceUrlLength = 2_048;

export const learningSourceTypes = [
  "website",
  "rss",
  "newsletter",
  "youtube",
  "podcast",
  "journal",
  "paper_repository",
] as const;

export type LearningSourceType = (typeof learningSourceTypes)[number];

export type LearningPreferences = {
  tracks: string[];
  interests: string[];
  weeklyBudgetMinutes: number;
  createdAt: string;
  updatedAt: string;
};

export type LearningSource = {
  id: string;
  name: string;
  sourceType: LearningSourceType;
  url: string;
  enabled: boolean;
  priority: number;
  createdAt: string;
  updatedAt: string;
};

type PreferenceInput = {
  tracks?: unknown;
  interests?: unknown;
  weeklyBudgetMinutes?: unknown;
};

type SourceInput = {
  name?: unknown;
  sourceType?: unknown;
  url?: unknown;
  enabled?: unknown;
  priority?: unknown;
};

function db() {
  if (!env.DB) throw new Error("D1 binding DB is unavailable");
  return env.DB;
}

export async function ensureLearningPreferencesSchema() {
  const database = db();
  await database.batch([
    database.prepare(`CREATE TABLE IF NOT EXISTS learning_preferences (
      id TEXT PRIMARY KEY,
      tracks_json TEXT NOT NULL DEFAULT '[]',
      interests_json TEXT NOT NULL DEFAULT '[]',
      weekly_budget_minutes INTEGER NOT NULL DEFAULT 300,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS learning_sources (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      source_type TEXT NOT NULL,
      url TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      priority INTEGER NOT NULL DEFAULT 3,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_learning_sources_url ON learning_sources(url)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_learning_sources_enabled_priority ON learning_sources(enabled, priority)"),
  ]);
  await database.prepare("INSERT OR IGNORE INTO learning_preferences (id) VALUES (?)").bind(preferenceId).run();
  const current = await database.prepare("SELECT tracks_json,interests_json,weekly_budget_minutes FROM learning_preferences WHERE id=?")
    .bind(preferenceId).first<Record<string, unknown>>();
  if (current) {
    const tracks = safeJsonList(current.tracks_json);
    const interests = safeJsonList(current.interests_json);
    const nextTracks = tracks.length ? tracks : ["Agentic AI", "AI news & research", "Product management"];
    const nextInterests = interests.length ? interests : ["Memory", "tool use", "evaluations", "enterprise AI platforms"];
    if (!tracks.length || !interests.length) {
      await database.prepare("UPDATE learning_preferences SET tracks_json=?,interests_json=?,weekly_budget_minutes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
        .bind(JSON.stringify(nextTracks), JSON.stringify(nextInterests), Number(current.weekly_budget_minutes) || 300, preferenceId)
        .run();
    }
  }
  const sourceCount = await database.prepare("SELECT COUNT(*) AS count FROM learning_sources").first<{ count: number }>();
  if ((sourceCount?.count ?? 0) === 0) {
    await database.prepare("INSERT INTO learning_sources (id,name,source_type,url,enabled,priority) VALUES (?,?,?,?,?,?)")
      .bind("source-simon", "Simon Willison", "website", "https://simonwillison.net/", 1, 4).run();
  }
  await database.prepare("PRAGMA optimize").run();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseStringList(value: unknown, field: string) {
  if (!Array.isArray(value)) throw new Error(`${field} must be a list`);
  if (value.length > maxListEntries) throw new Error(`${field} can contain at most ${maxListEntries} entries`);

  const normalized = value.map((item) => {
    if (typeof item !== "string") throw new Error(`${field} entries must be text`);
    const label = item.trim();
    if (!label) throw new Error(`${field} entries cannot be empty`);
    if (label.length > maxLabelLength) throw new Error(`${field} entries must be ${maxLabelLength} characters or fewer`);
    return label;
  });

  return [...new Map(normalized.map((label) => [label.toLocaleLowerCase(), label])).values()];
}

function parseInteger(value: unknown, field: string, min: number, max: number) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${field} must be a whole number between ${min} and ${max}`);
  }
  return value;
}

function parseName(value: unknown) {
  if (typeof value !== "string") throw new Error("Source name is required");
  const name = value.trim();
  if (!name) throw new Error("Source name is required");
  if (name.length > maxSourceNameLength) throw new Error(`Source name must be ${maxSourceNameLength} characters or fewer`);
  return name;
}

function parseSourceType(value: unknown): LearningSourceType {
  if (typeof value !== "string" || !learningSourceTypes.includes(value as LearningSourceType)) {
    throw new Error(`Source type must be one of: ${learningSourceTypes.join(", ")}`);
  }
  return value as LearningSourceType;
}

function parseUrl(value: unknown) {
  if (typeof value !== "string") throw new Error("Source URL is required");
  const input = value.trim();
  if (!input || input.length > maxSourceUrlLength) throw new Error(`Source URL must be between 1 and ${maxSourceUrlLength} characters`);
  let parsed: URL;
  try { parsed = new URL(input); }
  catch { throw new Error("Source URL must be valid"); }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("Source URL must use http or https");
  if (!parsed.hostname) throw new Error("Source URL must include a hostname");
  parsed.hash = "";
  return parsed.toString();
}

function parseEnabled(value: unknown) {
  if (typeof value !== "boolean") throw new Error("Enabled must be true or false");
  return value;
}

function safeJsonList(value: unknown) {
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function mapSource(row: Record<string, unknown>): LearningSource {
  return {
    id: String(row.id),
    name: String(row.name),
    sourceType: String(row.source_type) as LearningSourceType,
    url: String(row.url),
    enabled: Number(row.enabled) === 1,
    priority: Number(row.priority),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function getLearningConfiguration() {
  await ensureLearningPreferencesSchema();
  const database = db();
  const [preference, sources] = await Promise.all([
    database.prepare("SELECT tracks_json,interests_json,weekly_budget_minutes,created_at,updated_at FROM learning_preferences WHERE id=?")
      .bind(preferenceId).first<Record<string, unknown>>(),
    database.prepare("SELECT id,name,source_type,url,enabled,priority,created_at,updated_at FROM learning_sources ORDER BY enabled DESC,priority DESC,name COLLATE NOCASE")
      .all<Record<string, unknown>>(),
  ]);

  if (!preference) throw new Error("Learning preferences are unavailable");
  const preferences: LearningPreferences = {
    tracks: safeJsonList(preference.tracks_json),
    interests: safeJsonList(preference.interests_json),
    weeklyBudgetMinutes: Number(preference.weekly_budget_minutes),
    createdAt: String(preference.created_at),
    updatedAt: String(preference.updated_at),
  };
  return { preferences, sources: sources.results.map(mapSource) };
}

export async function updateLearningPreferences(input: unknown) {
  await ensureLearningPreferencesSchema();
  if (!isRecord(input)) throw new Error("Learning preferences must be an object");
  const data = input as PreferenceInput;
  const current = await db().prepare("SELECT tracks_json,interests_json,weekly_budget_minutes FROM learning_preferences WHERE id=?")
    .bind(preferenceId).first<Record<string, unknown>>();
  if (!current) throw new Error("Learning preferences are unavailable");

  const hasTracks = Object.hasOwn(data, "tracks");
  const hasInterests = Object.hasOwn(data, "interests");
  const hasBudget = Object.hasOwn(data, "weeklyBudgetMinutes");
  if (!hasTracks && !hasInterests && !hasBudget) throw new Error("Provide at least one learning preference to update");

  const tracks = hasTracks ? parseStringList(data.tracks, "Tracks") : safeJsonList(current.tracks_json);
  const interests = hasInterests ? parseStringList(data.interests, "Interests") : safeJsonList(current.interests_json);
  const weeklyBudgetMinutes = hasBudget
    ? parseInteger(data.weeklyBudgetMinutes, "Weekly budget", 0, maxWeeklyBudgetMinutes)
    : Number(current.weekly_budget_minutes);

  await db().prepare("UPDATE learning_preferences SET tracks_json=?,interests_json=?,weekly_budget_minutes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
    .bind(JSON.stringify(tracks), JSON.stringify(interests), weeklyBudgetMinutes, preferenceId).run();
  return (await getLearningConfiguration()).preferences;
}

export async function createLearningSource(input: unknown) {
  await ensureLearningPreferencesSchema();
  if (!isRecord(input)) throw new Error("Learning source must be an object");
  const data = input as SourceInput;
  const source = {
    id: crypto.randomUUID(),
    name: parseName(data.name),
    sourceType: parseSourceType(data.sourceType),
    url: parseUrl(data.url),
    enabled: data.enabled === undefined ? true : parseEnabled(data.enabled),
    priority: data.priority === undefined ? 3 : parseInteger(data.priority, "Priority", 1, 5),
  };
  try {
    await db().prepare("INSERT INTO learning_sources (id,name,source_type,url,enabled,priority) VALUES (?,?,?,?,?,?)")
      .bind(source.id, source.name, source.sourceType, source.url, source.enabled ? 1 : 0, source.priority).run();
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes("unique")) throw new Error("That learning source already exists");
    throw error;
  }
  return source.id;
}

export async function updateLearningSource(id: string, input: unknown) {
  await ensureLearningPreferencesSchema();
  if (!id.trim()) throw new Error("Learning source id is required");
  if (!isRecord(input)) throw new Error("Learning source must be an object");
  const data = input as SourceInput;
  const current = await db().prepare("SELECT name,source_type,url,enabled,priority FROM learning_sources WHERE id=?")
    .bind(id).first<Record<string, unknown>>();
  if (!current) throw new Error("Learning source was not found");

  const hasName = Object.hasOwn(data, "name");
  const hasType = Object.hasOwn(data, "sourceType");
  const hasUrl = Object.hasOwn(data, "url");
  const hasEnabled = Object.hasOwn(data, "enabled");
  const hasPriority = Object.hasOwn(data, "priority");
  if (!hasName && !hasType && !hasUrl && !hasEnabled && !hasPriority) throw new Error("Provide at least one source field to update");

  const name = hasName ? parseName(data.name) : String(current.name);
  const sourceType = hasType ? parseSourceType(data.sourceType) : String(current.source_type) as LearningSourceType;
  const url = hasUrl ? parseUrl(data.url) : String(current.url);
  const enabled = hasEnabled ? parseEnabled(data.enabled) : Number(current.enabled) === 1;
  const priority = hasPriority ? parseInteger(data.priority, "Priority", 1, 5) : Number(current.priority);

  try {
    await db().prepare("UPDATE learning_sources SET name=?,source_type=?,url=?,enabled=?,priority=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
      .bind(name, sourceType, url, enabled ? 1 : 0, priority, id).run();
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes("unique")) throw new Error("That learning source already exists");
    throw error;
  }
}

export async function deleteLearningSource(id: string) {
  await ensureLearningPreferencesSchema();
  if (!id.trim()) throw new Error("Learning source id is required");
  const existing = await db().prepare("SELECT id FROM learning_sources WHERE id=?").bind(id).first<{ id: string }>();
  if (!existing) throw new Error("Learning source was not found");
  await db().prepare("DELETE FROM learning_sources WHERE id=?").bind(id).run();
}
