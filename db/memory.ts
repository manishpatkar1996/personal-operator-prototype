import { env } from "cloudflare:workers";

function db() {
  if (!env.DB) throw new Error("D1 binding DB is unavailable");
  return env.DB;
}

export async function updateDecision(id: string, input: { decision?: string; rationale?: string; affected?: string }) {
  const current = await db().prepare("SELECT id,decision,rationale,affected FROM decisions WHERE id=?").bind(id).first<{ id: string; decision: string; rationale: string; affected: string }>();
  if (!current) throw new Error("Decision was not found");
  const decision = (input.decision ?? current.decision).trim();
  const rationale = (input.rationale ?? current.rationale).trim();
  const affected = (input.affected ?? current.affected).trim() || "General";
  if (!decision || !rationale) throw new Error("Decision and rationale are required");
  await db().prepare("UPDATE decisions SET decision=?,rationale=?,affected=? WHERE id=?").bind(decision, rationale, affected, id).run();
  return { message: "Decision corrected" };
}

export async function deleteDecision(id: string) {
  const current = await db().prepare("SELECT id FROM decisions WHERE id=?").bind(id).first<{ id: string }>();
  if (!current) throw new Error("Decision was not found");
  await db().prepare("DELETE FROM decisions WHERE id=?").bind(id).run();
  return { message: "Decision removed from memory" };
}
