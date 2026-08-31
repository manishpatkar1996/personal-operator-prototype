CREATE TABLE `career_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`target_roles_json` text DEFAULT '[]' NOT NULL,
	`industries_json` text DEFAULT '[]' NOT NULL,
	`locations_json` text DEFAULT '[]' NOT NULL,
	`work_modes_json` text DEFAULT '[]' NOT NULL,
	`seniority_json` text DEFAULT '[]' NOT NULL,
	`compensation_notes` text DEFAULT '' NOT NULL,
	`strengths_json` text DEFAULT '[]' NOT NULL,
	`exclusions_json` text DEFAULT '[]' NOT NULL,
	`resume_filename` text DEFAULT '' NOT NULL,
	`resume_text` text DEFAULT '' NOT NULL,
	`onboarding_status` text DEFAULT 'not_started' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `content_strategy` (
	`id` text PRIMARY KEY NOT NULL,
	`thesis` text NOT NULL,
	`source_name` text DEFAULT '' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `email_signals` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`category` text NOT NULL,
	`subject` text NOT NULL,
	`sender` text NOT NULL,
	`received_at` text NOT NULL,
	`summary` text NOT NULL,
	`next_action` text NOT NULL,
	`due_at` text,
	`status` text DEFAULT 'open' NOT NULL,
	`message_url` text NOT NULL,
	`last_synced_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_email_signals_status_received` ON `email_signals` (`status`,`received_at`);--> statement-breakpoint
CREATE TABLE `learning_preferences` (
	`id` text PRIMARY KEY NOT NULL,
	`tracks_json` text DEFAULT '[]' NOT NULL,
	`interests_json` text DEFAULT '[]' NOT NULL,
	`weekly_budget_minutes` integer DEFAULT 300 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `learning_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`source_type` text NOT NULL,
	`url` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`priority` integer DEFAULT 3 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_learning_sources_url` ON `learning_sources` (`url`);--> statement-breakpoint
CREATE INDEX `idx_learning_sources_enabled_priority` ON `learning_sources` (`enabled`,`priority`);--> statement-breakpoint
ALTER TABLE `content_ideas` ADD `outline_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `content_ideas` ADD `draft_text` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `jobs` ADD `url` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `jobs` ADD `fit_reason` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `jobs` ADD `evidence_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `jobs` ADD `follow_up_at` text;--> statement-breakpoint
ALTER TABLE `jobs` ADD `resume_variant` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `learning_items` ADD `url` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `learning_items` ADD `summary` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `startup_ideas` ADD `evidence_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `startup_ideas` ADD `experiment` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `startup_ideas` ADD `citations_json` text DEFAULT '[]' NOT NULL;