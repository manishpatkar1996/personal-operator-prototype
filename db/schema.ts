import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const goals = sqliteTable("goals", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  desiredOutcome: text("desired_outcome").notNull(),
  successCriteria: text("success_criteria").notNull(),
  targetDate: text("target_date").notNull(),
  priority: integer("priority").notNull().default(3),
  state: text("state").notNull().default("active"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, table => [index("idx_goals_state_target").on(table.state, table.targetDate)]);

export const milestones = sqliteTable("milestones", {
  id: text("id").primaryKey(),
  goalId: text("goal_id").notNull().references(() => goals.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  completionRule: text("completion_rule").notNull(),
  targetDate: text("target_date").notNull(),
  weight: integer("weight").notNull().default(1),
  completionPercentage: integer("completion_percentage").notNull().default(0),
  status: text("status").notNull().default("not_started"),
  position: integer("position").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, table => [index("idx_milestones_goal_position").on(table.goalId, table.position)]);

export const decisions = sqliteTable("decisions", {
  id: text("id").primaryKey(),
  decision: text("decision").notNull(),
  rationale: text("rationale").notNull(),
  affected: text("affected").notNull().default("General"),
  decidedAt: text("decided_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const calendarBlocks = sqliteTable("calendar_blocks", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  goalId: text("goal_id"),
  milestoneId: text("milestone_id"),
  startAt: text("start_at").notNull(),
  endAt: text("end_at").notNull(),
  state: text("state").notNull().default("scheduled"),
  ownership: text("ownership").notNull().default("operator_created"),
  source: text("source").notNull().default("local"),
  externalEventId: text("external_event_id"),
  eventUrl: text("event_url"),
  lastSyncedAt: text("last_synced_at"),
}, table => [index("idx_calendar_start").on(table.startAt)]);

export const calendarPreferences = sqliteTable("calendar_preferences", {
  id: text("id").primaryKey(),
  policy: text("policy").notNull().default("propose_only"),
  timezone: text("timezone").notNull().default("Asia/Kolkata"),
  syncWindowDays: integer("sync_window_days").notNull().default(7),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const calendarWriteRequests = sqliteTable("calendar_write_requests", {
  id: text("id").primaryKey(),
  blockId: text("block_id").notNull(),
  action: text("action").notNull(),
  status: text("status").notNull().default("approved_pending"),
  payloadJson: text("payload_json").notNull(),
  externalEventId: text("external_event_id"),
  error: text("error"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, table => [index("idx_calendar_writes_status").on(table.status, table.createdAt)]);

export const emailSignals = sqliteTable("email_signals", {
  id: text("id").primaryKey(),
  threadId: text("thread_id").notNull(),
  category: text("category").notNull(),
  subject: text("subject").notNull(),
  sender: text("sender").notNull(),
  receivedAt: text("received_at").notNull(),
  summary: text("summary").notNull(),
  nextAction: text("next_action").notNull(),
  dueAt: text("due_at"),
  status: text("status").notNull().default("open"),
  messageUrl: text("message_url").notNull(),
  lastSyncedAt: text("last_synced_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, table => [index("idx_email_signals_status_received").on(table.status, table.receivedAt)]);

export const jobs = sqliteTable("jobs", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  company: text("company").notNull(),
  location: text("location").notNull(),
  fitScore: integer("fit_score").notNull(),
  status: text("status").notNull().default("recommended"),
  source: text("source").notNull(),
  nextAction: text("next_action").notNull(),
  url: text("url").notNull().default(""),
  fitReason: text("fit_reason").notNull().default(""),
  evidenceJson: text("evidence_json").notNull().default("[]"),
  followUpAt: text("follow_up_at"),
  resumeVariant: text("resume_variant").notNull().default(""),
}, table => [index("idx_jobs_status_fit").on(table.status, table.fitScore)]);

export const learningTracks = sqliteTable("learning_tracks", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  purpose: text("purpose").notNull(),
  weeklyBudgetMinutes: integer("weekly_budget_minutes").notNull(),
  state: text("state").notNull().default("active"),
  position: integer("position").notNull(),
});

export const learningItems = sqliteTable("learning_items", {
  id: text("id").primaryKey(),
  trackId: text("track_id").notNull(),
  title: text("title").notNull(),
  source: text("source").notNull(),
  itemType: text("item_type").notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  status: text("status").notNull().default("recommended"),
  relevance: text("relevance").notNull(),
  url: text("url").notNull().default(""),
  summary: text("summary").notNull().default(""),
}, table => [index("idx_learning_track_status").on(table.trackId, table.status)]);

export const startupIdeas = sqliteTable("startup_ideas", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  crispIdea: text("crisp_idea").notNull().default(""),
  problem: text("problem").notNull(),
  targetUser: text("target_user").notNull(),
  scale: text("scale").notNull().default(""),
  market: text("market").notNull().default(""),
  competition: text("competition").notNull().default(""),
  whyNow: text("why_now").notNull().default(""),
  unfairAdvantage: text("unfair_advantage").notNull().default(""),
  riskiestAssumption: text("riskiest_assumption").notNull().default(""),
  state: text("state").notNull().default("captured"),
  nextValidation: text("next_validation").notNull(),
  confidence: integer("confidence").notNull().default(20),
  reviewDate: text("review_date").notNull(),
  evidenceJson: text("evidence_json").notNull().default("[]"),
  experiment: text("experiment").notNull().default(""),
  citationsJson: text("citations_json").notNull().default("[]"),
  thesis: text("thesis").notNull().default(""),
  fieldClarityJson: text("field_clarity_json").notNull().default("{}"),
});

export const contentIdeas = sqliteTable("content_ideas", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  pillar: text("pillar").notNull(),
  status: text("status").notNull().default("idea"),
  score: integer("score").notNull(),
  source: text("source").notNull(),
  nextAction: text("next_action").notNull(),
  outlineJson: text("outline_json").notNull().default("[]"),
  draftText: text("draft_text").notNull().default(""),
  notesText: text("notes_text").notNull().default(""),
  format: text("format").notNull().default("linkedin_post"),
  generatedDraft: text("generated_draft").notNull().default(""),
  workingNotes: text("working_notes").notNull().default(""),
  feedbackText: text("feedback_text").notNull().default(""),
}, table => [index("idx_content_status_score").on(table.status, table.score)]);

export const contentStrategy = sqliteTable("content_strategy", {
  id: text("id").primaryKey(),
  thesis: text("thesis").notNull(),
  sourceName: text("source_name").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  formatsJson: text("formats_json").notNull().default("[\"linkedin_post\",\"medium_article\"]"),
  voiceJson: text("voice_json").notNull().default("{}"),
  linkedinCraftJson: text("linkedin_craft_json").notNull().default("{}"),
  mediumCraftJson: text("medium_craft_json").notNull().default("{}"),
  tasteJson: text("taste_json").notNull().default("[]"),
});

export const contentMessages = sqliteTable("content_messages", {
  id: text("id").primaryKey(),
  ideaId: text("idea_id").notNull(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const councilRoles = sqliteTable("council_roles", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  roleName: text("role_name").notNull(),
  mission: text("mission").notNull(),
  status: text("status").notNull().default("active"),
  lastRunAt: text("last_run_at"),
});

export const councilProposals = sqliteTable("council_proposals", {
  id: text("id").primaryKey(),
  roleId: text("role_id").notNull(),
  title: text("title").notNull(),
  rationale: text("rationale").notNull(),
  status: text("status").notNull().default("proposed"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, table => [index("idx_council_proposal_status").on(table.status, table.createdAt)]);

export const planningNotes = sqliteTable("planning_notes", {
  id: text("id").primaryKey(),
  note: text("note").notNull(),
  result: text("result").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const connectors = sqliteTable("connectors", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  status: text("status").notNull(),
  detail: text("detail").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const careerProfiles = sqliteTable("career_profiles", {
  id: text("id").primaryKey(),
  targetRolesJson: text("target_roles_json").notNull().default("[]"),
  industriesJson: text("industries_json").notNull().default("[]"),
  locationsJson: text("locations_json").notNull().default("[]"),
  workModesJson: text("work_modes_json").notNull().default("[]"),
  seniorityJson: text("seniority_json").notNull().default("[]"),
  compensationNotes: text("compensation_notes").notNull().default(""),
  strengthsJson: text("strengths_json").notNull().default("[]"),
  exclusionsJson: text("exclusions_json").notNull().default("[]"),
  resumeFilename: text("resume_filename").notNull().default(""),
  resumeText: text("resume_text").notNull().default(""),
  onboardingStatus: text("onboarding_status").notNull().default("not_started"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const learningPreferences = sqliteTable("learning_preferences", {
  id: text("id").primaryKey(),
  tracksJson: text("tracks_json").notNull().default("[]"),
  interestsJson: text("interests_json").notNull().default("[]"),
  weeklyBudgetMinutes: integer("weekly_budget_minutes").notNull().default(300),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const learningSources = sqliteTable("learning_sources", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  sourceType: text("source_type").notNull(),
  url: text("url").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  priority: integer("priority").notNull().default(3),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, table => [uniqueIndex("idx_learning_sources_url").on(table.url), index("idx_learning_sources_enabled_priority").on(table.enabled, table.priority)]);
