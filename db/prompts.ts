import { env } from "cloudflare:workers";
import { DEFAULT_PROMPTS, OPERATOR_AGENTS } from "@/lib/operator/agents";
import { getCareerProfile } from "./career";
import { getLearningConfiguration } from "./learning-preferences";
import { getContentStrategy } from "./content";

function db() {
  if (!env.DB) throw new Error("D1 binding DB is unavailable");
  return env.DB;
}

export async function ensurePrompts() {
  const database = db();
  await database.prepare(`CREATE TABLE IF NOT EXISTS operator_prompts (
    id TEXT PRIMARY KEY,
    role_id TEXT NOT NULL,
    title TEXT NOT NULL,
    use_when TEXT NOT NULL,
    system_prompt TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
  const columns = new Set((await database.prepare("PRAGMA table_info(council_roles)").all<{ name: string }>()).results.map(column => column.name));
  if (!columns.has("program")) await database.prepare("ALTER TABLE council_roles ADD COLUMN program TEXT NOT NULL DEFAULT ''").run();
  if (!columns.has("never_text")) await database.prepare("ALTER TABLE council_roles ADD COLUMN never_text TEXT NOT NULL DEFAULT ''").run();
  if (!columns.has("prompt_id")) await database.prepare("ALTER TABLE council_roles ADD COLUMN prompt_id TEXT NOT NULL DEFAULT ''").run();
  for (const agent of OPERATOR_AGENTS) {
    await database.prepare("INSERT OR IGNORE INTO council_roles (id,label,role_name,mission,status,last_run_at,program,never_text,prompt_id) VALUES (?,?,?,?,?,?,?,?,?)")
      .bind(agent.id, agent.label, agent.roleName, agent.mission, "active", null, agent.program, agent.never, agent.primaryTask).run();
    await database.prepare("UPDATE council_roles SET label=?,role_name=?,mission=?,program=?,never_text=?,prompt_id=? WHERE id=?")
      .bind(agent.label, agent.roleName, agent.mission, agent.program, agent.never, agent.primaryTask, agent.id).run();
  }
  for (const prompt of DEFAULT_PROMPTS) {
    await database.prepare("INSERT OR IGNORE INTO operator_prompts (id,role_id,title,use_when,system_prompt) VALUES (?,?,?,?,?)")
      .bind(prompt.id, prompt.roleId, prompt.title, prompt.useWhen, prompt.systemPrompt).run();
  }
  await database.prepare("CREATE TABLE IF NOT EXISTS operator_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)").run();
  const revision = await database.prepare("SELECT value FROM operator_meta WHERE key='prompt_revision'").first<{ value: string }>();
  if (Number(revision?.value ?? 0) < 2) {
    for (const prompt of DEFAULT_PROMPTS) {
      await database.prepare("UPDATE operator_prompts SET role_id=?,title=?,use_when=?,system_prompt=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
        .bind(prompt.roleId, prompt.title, prompt.useWhen, prompt.systemPrompt, prompt.id).run();
    }
    await database.prepare("INSERT OR REPLACE INTO operator_meta (key,value) VALUES ('prompt_revision','2')").run();
  }
}

export async function getPrompt(id: string) {
  await ensurePrompts();
  const row = await db().prepare("SELECT system_prompt FROM operator_prompts WHERE id=?").bind(id).first<{ system_prompt: string }>();
  return row?.system_prompt ?? DEFAULT_PROMPTS.find(item => item.id === id)?.systemPrompt ?? "";
}

export async function listPrompts() {
  await ensurePrompts();
  const rows = (await db().prepare("SELECT id,role_id,title,use_when,system_prompt,updated_at FROM operator_prompts ORDER BY role_id,title").all<Record<string, unknown>>()).results;
  const [career, learning, strategy] = await Promise.all([
    getCareerProfile().catch(() => null),
    getLearningConfiguration().catch(() => null),
    getContentStrategy().catch(() => null),
  ]);
  const preferences = {
    career: career ? {
      targetRoles: career.targetRoles,
      locations: career.locations,
      workModes: career.workModes,
      strengths: career.strengths,
      exclusions: career.exclusions,
    } : null,
    learning: learning ? {
      tracks: learning.preferences.tracks,
      interests: learning.preferences.interests,
      weeklyBudgetMinutes: learning.preferences.weeklyBudgetMinutes,
    } : null,
    content: strategy ? { thesis: strategy.thesis, sourceName: strategy.source_name } : null,
  };
  return {
    agents: OPERATOR_AGENTS,
    prompts: rows,
    preferences,
  };
}

export async function updatePrompt(id: string, systemPrompt: string) {
  const text = systemPrompt.trim();
  if (text.length < 40) throw new Error("A prompt needs enough instruction to be useful");
  await ensurePrompts();
  const existing = await db().prepare("SELECT id FROM operator_prompts WHERE id=?").bind(id).first<{ id: string }>();
  if (!existing) throw new Error("Prompt was not found");
  await db().prepare("UPDATE operator_prompts SET system_prompt=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(text.slice(0, 8_000), id).run();
  return { message: "Prompt saved. The next run of this agent will use it." };
}

export async function resetPrompt(id: string) {
  const fallback = DEFAULT_PROMPTS.find(item => item.id === id);
  if (!fallback) throw new Error("Prompt was not found");
  await ensurePrompts();
  await db().prepare("UPDATE operator_prompts SET system_prompt=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(fallback.systemPrompt, id).run();
  return { message: "Prompt restored to the default" };
}
