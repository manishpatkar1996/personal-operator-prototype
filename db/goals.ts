import { env } from "cloudflare:workers";

export type MilestoneRecord = {
  id: string;
  goalId: string;
  title: string;
  completionRule: string;
  targetDate: string;
  weight: number;
  completionPercentage: number;
  status: "not_started" | "ready" | "active" | "blocked" | "achieved" | "skipped";
  position: number;
};

export type GoalRecord = {
  id: string;
  title: string;
  desiredOutcome: string;
  successCriteria: string;
  targetDate: string;
  priority: number;
  state: "active" | "paused" | "completed" | "archived";
  progressPercentage: number;
  forecast: "On track" | "At risk" | "Behind" | "Paused" | "Needs milestones";
  milestones: MilestoneRecord[];
};

const goalStates = new Set(["active", "paused", "completed", "archived"]);
const milestoneStates = new Set(["not_started", "ready", "active", "blocked", "achieved", "skipped"]);

function db() {
  if (!env.DB) throw new Error("D1 binding DB is unavailable");
  return env.DB;
}

export async function ensureGoalSchema() {
  const database = db();
  await database.batch([
    database.prepare(`CREATE TABLE IF NOT EXISTS goals (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      desired_outcome TEXT NOT NULL,
      success_criteria TEXT NOT NULL,
      target_date TEXT NOT NULL,
      priority INTEGER NOT NULL DEFAULT 3,
      state TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS milestones (
      id TEXT PRIMARY KEY,
      goal_id TEXT NOT NULL,
      title TEXT NOT NULL,
      completion_rule TEXT NOT NULL,
      target_date TEXT NOT NULL,
      weight INTEGER NOT NULL DEFAULT 1,
      completion_percentage INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'not_started',
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE
    )`),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_goals_state_target ON goals(state, target_date)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_milestones_goal_position ON milestones(goal_id, position)"),
  ]);
}

async function seedFirstRun() {
  const database = db();
  const count = await database.prepare("SELECT COUNT(*) AS count FROM goals").first<{ count: number }>();
  if ((count?.count ?? 0) > 0) return;

  await database.batch([
    database.prepare("INSERT INTO goals (id,title,desired_outcome,success_criteria,target_date,priority,state) VALUES (?,?,?,?,?,?,?)")
      .bind("goal-career", "Land a high-agency AI product role", "Move into an AI product role with high ownership and strong builder scope.", "Reach five qualified interview loops and choose a role that matches the agreed criteria.", "2026-11-30", 5, "active"),
    database.prepare("INSERT INTO goals (id,title,desired_outcome,success_criteria,target_date,priority,state) VALUES (?,?,?,?,?,?,?)")
      .bind("goal-expertise", "Build practical expertise in agentic AI", "Develop enough depth to design, evaluate, and explain reliable agentic systems.", "Complete the learning track and publish three applied explanations with working examples.", "2026-12-15", 4, "active"),
    database.prepare("INSERT INTO milestones (id,goal_id,title,completion_rule,target_date,weight,completion_percentage,status,position) VALUES (?,?,?,?,?,?,?,?,?)")
      .bind("ms-target", "goal-career", "Define the target", "Target role, company, location, and culture criteria are confirmed.", "2026-09-07", 15, 100, "achieved", 0),
    database.prepare("INSERT INTO milestones (id,goal_id,title,completion_rule,target_date,weight,completion_percentage,status,position) VALUES (?,?,?,?,?,?,?,?,?)")
      .bind("ms-pipeline", "goal-career", "Build the application pipeline", "At least 30 qualified roles are reviewed and 10 are shortlisted.", "2026-09-30", 25, 40, "active", 1),
    database.prepare("INSERT INTO milestones (id,goal_id,title,completion_rule,target_date,weight,completion_percentage,status,position) VALUES (?,?,?,?,?,?,?,?,?)")
      .bind("ms-signal", "goal-career", "Strengthen positioning", "Resume, portfolio evidence, and interview stories cover the recurring role requirements.", "2026-10-20", 25, 15, "ready", 2),
    database.prepare("INSERT INTO milestones (id,goal_id,title,completion_rule,target_date,weight,completion_percentage,status,position) VALUES (?,?,?,?,?,?,?,?,?)")
      .bind("ms-interviews", "goal-career", "Convert to interviews", "Five qualified interview loops are active or completed.", "2026-11-20", 35, 0, "not_started", 3),
    database.prepare("INSERT INTO milestones (id,goal_id,title,completion_rule,target_date,weight,completion_percentage,status,position) VALUES (?,?,?,?,?,?,?,?,?)")
      .bind("ms-foundations", "goal-expertise", "Map the foundations", "Architecture, planning, tool use, memory, and evaluation concepts are explained in my own words.", "2026-09-20", 25, 60, "active", 0),
    database.prepare("INSERT INTO milestones (id,goal_id,title,completion_rule,target_date,weight,completion_percentage,status,position) VALUES (?,?,?,?,?,?,?,?,?)")
      .bind("ms-build", "goal-expertise", "Build a working operator loop", "A goal-driven daily planning loop runs with persisted state and inspectable decisions.", "2026-10-31", 40, 20, "active", 1),
    database.prepare("INSERT INTO milestones (id,goal_id,title,completion_rule,target_date,weight,completion_percentage,status,position) VALUES (?,?,?,?,?,?,?,?,?)")
      .bind("ms-explain", "goal-expertise", "Publish applied explanations", "Three source-backed posts or demos explain what was built and learned.", "2026-12-10", 35, 0, "not_started", 2),
  ]);
}

function calculateProgress(milestones: MilestoneRecord[]) {
  const totalWeight = milestones.reduce((sum, milestone) => sum + milestone.weight, 0);
  if (!totalWeight) return 0;
  return Math.round(milestones.reduce((sum, milestone) => sum + milestone.weight * milestone.completionPercentage, 0) / totalWeight);
}

function calculateForecast(goal: Omit<GoalRecord, "progressPercentage" | "forecast" | "milestones">, milestones: MilestoneRecord[]): GoalRecord["forecast"] {
  if (goal.state === "paused") return "Paused";
  if (!milestones.length) return "Needs milestones";
  const today = new Date().toISOString().slice(0, 10);
  if (milestones.some(item => item.targetDate < today && item.completionPercentage < 100)) return "Behind";
  const next = milestones.find(item => item.completionPercentage < 100);
  if (next) {
    const days = Math.ceil((new Date(next.targetDate).getTime() - Date.now()) / 86_400_000);
    if (days <= 7 && next.completionPercentage < 50) return "At risk";
  }
  return "On track";
}

export async function listGoals() {
  await ensureGoalSchema();
  await seedFirstRun();
  const database = db();
  const goalRows = await database.prepare("SELECT id,title,desired_outcome,target_date,success_criteria,priority,state FROM goals WHERE state != 'archived' ORDER BY priority DESC, target_date ASC").all<Record<string, unknown>>();
  const milestoneRows = await database.prepare("SELECT id,goal_id,title,completion_rule,target_date,weight,completion_percentage,status,position FROM milestones ORDER BY goal_id, position").all<Record<string, unknown>>();

  return goalRows.results.map(row => {
    const base = {
      id: String(row.id), title: String(row.title), desiredOutcome: String(row.desired_outcome),
      successCriteria: String(row.success_criteria), targetDate: String(row.target_date),
      priority: Number(row.priority), state: String(row.state) as GoalRecord["state"],
    };
    const milestones = milestoneRows.results.filter(item => item.goal_id === row.id).map(item => ({
      id: String(item.id), goalId: String(item.goal_id), title: String(item.title), completionRule: String(item.completion_rule),
      targetDate: String(item.target_date), weight: Number(item.weight), completionPercentage: Number(item.completion_percentage),
      status: String(item.status) as MilestoneRecord["status"], position: Number(item.position),
    }));
    return { ...base, milestones, progressPercentage: calculateProgress(milestones), forecast: calculateForecast(base, milestones) };
  });
}

type GoalInput = Omit<GoalRecord, "id" | "progressPercentage" | "forecast" | "milestones"> & { milestones?: Omit<MilestoneRecord, "id" | "goalId">[] };

export async function createGoal(input: GoalInput) {
  await ensureGoalSchema();
  if (!input.title?.trim() || !input.desiredOutcome?.trim() || !input.successCriteria?.trim() || !input.targetDate) throw new Error("Goal title, outcome, success criteria, and target date are required");
  const database = db();
  const id = crypto.randomUUID();
  const milestones = input.milestones ?? [];
  const statements = [database.prepare("INSERT INTO goals (id,title,desired_outcome,success_criteria,target_date,priority,state) VALUES (?,?,?,?,?,?,?)").bind(id, input.title.trim(), input.desiredOutcome.trim(), input.successCriteria.trim(), input.targetDate, Math.max(1, Math.min(5, Number(input.priority) || 3)), goalStates.has(input.state) ? input.state : "active")];
  milestones.forEach((item, position) => {
    statements.push(database.prepare("INSERT INTO milestones (id,goal_id,title,completion_rule,target_date,weight,completion_percentage,status,position) VALUES (?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(), id, item.title.trim(), item.completionRule.trim(), item.targetDate, Math.max(1, Number(item.weight) || 1), Math.max(0, Math.min(100, Number(item.completionPercentage) || 0)), milestoneStates.has(item.status) ? item.status : "not_started", position));
  });
  await database.batch(statements);
  return id;
}

export async function updateGoal(input: GoalInput & { id: string }) {
  await ensureGoalSchema();
  if (!input.id || !input.title?.trim() || !input.targetDate || !goalStates.has(input.state)) throw new Error("Invalid goal update");
  await db().prepare("UPDATE goals SET title=?,desired_outcome=?,success_criteria=?,target_date=?,priority=?,state=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
    .bind(input.title.trim(), input.desiredOutcome.trim(), input.successCriteria.trim(), input.targetDate, Math.max(1, Math.min(5, Number(input.priority) || 3)), input.state, input.id).run();
}

export async function createMilestone(input: Omit<MilestoneRecord, "id">) {
  await ensureGoalSchema();
  if (!input.goalId || !input.title?.trim() || !input.completionRule?.trim() || !input.targetDate) throw new Error("Milestone title, completion rule, and date are required");
  const id = crypto.randomUUID();
  await db().prepare("INSERT INTO milestones (id,goal_id,title,completion_rule,target_date,weight,completion_percentage,status,position) VALUES (?,?,?,?,?,?,?,?,?)")
    .bind(id, input.goalId, input.title.trim(), input.completionRule.trim(), input.targetDate, Math.max(1, Number(input.weight) || 1), Math.max(0, Math.min(100, Number(input.completionPercentage) || 0)), milestoneStates.has(input.status) ? input.status : "not_started", Number(input.position) || 0).run();
  return id;
}

export async function updateMilestone(input: MilestoneRecord) {
  await ensureGoalSchema();
  if (!input.id || !input.title?.trim() || !input.completionRule?.trim() || !input.targetDate || !milestoneStates.has(input.status)) throw new Error("Invalid milestone update");
  await db().prepare("UPDATE milestones SET title=?,completion_rule=?,target_date=?,weight=?,completion_percentage=?,status=?,position=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
    .bind(input.title.trim(), input.completionRule.trim(), input.targetDate, Math.max(1, Number(input.weight) || 1), Math.max(0, Math.min(100, Number(input.completionPercentage) || 0)), input.status, Number(input.position) || 0, input.id).run();
}

export async function deleteMilestone(id: string) {
  await ensureGoalSchema();
  await db().prepare("DELETE FROM milestones WHERE id=?").bind(id).run();
}
