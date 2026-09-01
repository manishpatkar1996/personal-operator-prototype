import { getCareerProfile, saveCareerProfile } from "./career";
import { resetContentStrategyToGeneric } from "./content";
import { createGoal, importGoalsDump, listGoals } from "./goals";
import { allowDemoSeed, getMeta, isOperatorOnboarded, setMeta } from "./operator-meta";
import {
  DEMO_CALENDAR_IDS,
  DEMO_CONTENT_IDS,
  DEMO_GOAL_IDS,
  DEMO_JOB_IDS,
  DEMO_LEARNING_IDS,
  DEMO_STARTUP_IDS,
  calendarSetupStatus,
  inferPersonalOperator,
  ONBOARDED_KEY,
  setupChecklist,
  setupComplete,
  WORKSPACE_KIND_KEY,
} from "@/lib/operator/operator-setup";
import { preferredTimezone } from "@/lib/operator/calendar";
import { calendarFeedConfigured } from "./calendar-sync";
import { env } from "cloudflare:workers";

function db() {
  if (!env.DB) throw new Error("D1 binding DB is unavailable");
  return env.DB;
}

async function deleteByIds(table: string, ids: readonly string[]) {
  if (!ids.length) return;
  const placeholders = ids.map(() => "?").join(",");
  await db().prepare(`DELETE FROM ${table} WHERE id IN (${placeholders})`).bind(...ids).run();
}

async function clearUserTables() {
  const database = db();
  await database.batch([
    database.prepare("DELETE FROM milestones"),
    database.prepare("DELETE FROM goals"),
    database.prepare("DELETE FROM jobs"),
    database.prepare("DELETE FROM calendar_blocks"),
    database.prepare("DELETE FROM email_signals"),
    database.prepare("DELETE FROM planning_notes"),
    database.prepare("DELETE FROM learning_items"),
    database.prepare("DELETE FROM startup_ideas"),
    database.prepare("DELETE FROM content_ideas"),
    database.prepare("DELETE FROM career_profiles"),
    database.prepare("DELETE FROM learning_preferences"),
    database.prepare("DELETE FROM decisions"),
    database.prepare("DELETE FROM learning_tracks"),
  ]);
  await database.prepare("DELETE FROM operator_meta WHERE key IN ('aemon_resume_revision','jobs_sample_revision','calendar_sample_revision')").run();
}

async function neutralizeDemoIdentity() {
  await resetContentStrategyToGeneric();
  await db().prepare("DELETE FROM decisions").run();
}

export async function getOnboardingState() {
  const [kind, onboardedFlag, profile, goals, calendarConnected] = await Promise.all([
    getMeta(WORKSPACE_KIND_KEY),
    isOperatorOnboarded(),
    getCareerProfile(),
    listGoals(),
    calendarFeedConfigured(),
  ]);
  const inferred = inferPersonalOperator({ resumeChars: profile.resumeText.trim().length, goalCount: goals.length });
  let onboarded = onboardedFlag;
  let workspaceKind = kind === "personal" || kind === "demo" ? kind : "demo";
  if (!onboarded && inferred) {
    await setMeta(ONBOARDED_KEY, "1");
    await setMeta(WORKSPACE_KIND_KEY, "personal");
    onboarded = true;
    workspaceKind = "personal";
  }
  const checklist = setupChecklist({
    resumeChars: profile.resumeText.trim().length,
    roleCount: profile.targetRoles.length,
    goalCount: goals.length,
    locationCount: profile.locations.length,
    calendarConnected,
  });
  const calendar = calendarSetupStatus(calendarConnected);
  return {
    onboarded,
    workspaceKind,
    demoSeed: await allowDemoSeed(),
    complete: setupComplete({
      resumeChars: profile.resumeText.trim().length,
      roleCount: profile.targetRoles.length,
      goalCount: goals.length,
    }),
    checklist,
    calendar: {
      connected: calendarConnected,
      status: calendar.label,
      detail: calendar.detail,
    },
    profile: {
      targetRoles: profile.targetRoles,
      locations: profile.locations,
      workModes: profile.workModes,
      exclusions: profile.exclusions,
      resumeFilename: profile.resumeFilename,
      resumeChars: profile.resumeText.trim().length,
    },
    goals: goals.map(goal => ({ id: goal.id, title: goal.title, targetDate: goal.targetDate })),
  };
}

export async function saveOperatorSetup(input: {
  targetRoles?: string[];
  locations?: string[];
  workModes?: string[];
  exclusions?: string[];
  resumeText?: string;
  resumeFilename?: string;
  goal?: {
    title: string;
    desiredOutcome: string;
    successCriteria: string;
    targetDate: string;
    milestoneTitle?: string;
    milestoneRule?: string;
    milestoneDate?: string;
  };
  replaceSample?: boolean;
  goalsDump?: unknown;
  replaceAllGoals?: boolean;
  timezone?: string;
}) {
  const current = await getCareerProfile();
  await saveCareerProfile({
    targetRoles: input.targetRoles ?? current.targetRoles,
    locations: input.locations ?? current.locations,
    workModes: input.workModes ?? current.workModes,
    exclusions: input.exclusions ?? current.exclusions,
    resumeText: input.resumeText ?? current.resumeText,
    resumeFilename: input.resumeFilename ?? current.resumeFilename,
    onboardingStatus: "complete",
  });
  const kind = await getMeta(WORKSPACE_KIND_KEY);
  const replaceSample = input.replaceSample ?? kind !== "personal";
  const goals = await listGoals();
  if (input.goalsDump) {
    await importGoalsDump(input.goalsDump, { replaceAll: input.replaceAllGoals, replaceDemo: !input.replaceAllGoals });
  } else if (input.goal?.title.trim() && !goals.some(goal => goal.title.toLowerCase() === input.goal!.title.trim().toLowerCase())) {
    const milestoneTitle = input.goal.milestoneTitle?.trim();
    await createGoal({
      title: input.goal.title.trim(),
      desiredOutcome: input.goal.desiredOutcome.trim() || input.goal.title.trim(),
      successCriteria: input.goal.successCriteria.trim() || "I will know this is done when the next milestone is true.",
      targetDate: input.goal.targetDate || new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10),
      priority: 5,
      state: "active",
      milestones: milestoneTitle
        ? [{
            title: milestoneTitle,
            completionRule: input.goal.milestoneRule?.trim() || milestoneTitle,
            targetDate: input.goal.milestoneDate || new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
            weight: 1,
            completionPercentage: 0,
            status: "active",
            position: 0,
          }]
        : [],
    });
  }
  if (replaceSample) {
    if (!input.goalsDump) {
      await deleteByIds("milestones", ["ms-target", "ms-pipeline", "ms-signal", "ms-interviews", "ms-foundations", "ms-build", "ms-explain"]);
      await deleteByIds("goals", DEMO_GOAL_IDS);
    }
    await deleteByIds("jobs", DEMO_JOB_IDS);
    await deleteByIds("calendar_blocks", DEMO_CALENDAR_IDS);
    await deleteByIds("learning_items", DEMO_LEARNING_IDS);
    await deleteByIds("startup_ideas", DEMO_STARTUP_IDS);
    await deleteByIds("content_ideas", DEMO_CONTENT_IDS);
    await db().prepare("DELETE FROM email_signals").run();
    await neutralizeDemoIdentity();
  }
  if (input.timezone) {
    const timezone = preferredTimezone(input.timezone);
    await db().prepare("INSERT OR IGNORE INTO calendar_preferences (id,policy,timezone,sync_window_days) VALUES ('primary','auto_create',?,7)").bind(timezone).run();
    await db().prepare("UPDATE calendar_preferences SET timezone=?,updated_at=CURRENT_TIMESTAMP WHERE id='primary'").bind(timezone).run();
  }
  await setMeta(WORKSPACE_KIND_KEY, "personal");
  await setMeta(ONBOARDED_KEY, "1");
  await setMeta("aemon_resume_revision", "0");
  return getOnboardingState();
}

export async function resetOperator(mode: "empty" | "demo") {
  if (mode === "demo") {
    await setMeta(WORKSPACE_KIND_KEY, "demo");
    await setMeta(ONBOARDED_KEY, "0");
    await clearUserTables();
    await resetContentStrategyToGeneric();
    const { seedWorkspace } = await import("./workspace");
    await seedWorkspace();
    return getOnboardingState();
  }
  await setMeta(WORKSPACE_KIND_KEY, "personal");
  await setMeta(ONBOARDED_KEY, "0");
  await clearUserTables();
  await neutralizeDemoIdentity();
  return getOnboardingState();
}
