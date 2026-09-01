import { env } from "cloudflare:workers";
import { ONBOARDED_KEY, WORKSPACE_KIND_KEY } from "@/lib/operator/operator-setup";

function db() {
  if (!env.DB) throw new Error("D1 binding DB is unavailable");
  return env.DB;
}

export async function ensureOperatorMeta() {
  await db().prepare("CREATE TABLE IF NOT EXISTS operator_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)").run();
}

export async function getMeta(key: string) {
  await ensureOperatorMeta();
  const row = await db().prepare("SELECT value FROM operator_meta WHERE key=?").bind(key).first<{ value: string }>();
  return row?.value ?? "";
}

export async function setMeta(key: string, value: string) {
  await ensureOperatorMeta();
  await db().prepare("INSERT OR REPLACE INTO operator_meta (key,value) VALUES (?,?)").bind(key, value).run();
}

export async function allowDemoSeed() {
  return (await getMeta(WORKSPACE_KIND_KEY)) !== "personal";
}

export async function isOperatorOnboarded() {
  return (await getMeta(ONBOARDED_KEY)) === "1";
}
