CREATE TABLE `calendar_blocks` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`goal_id` text,
	`milestone_id` text,
	`start_at` text NOT NULL,
	`end_at` text NOT NULL,
	`state` text DEFAULT 'scheduled' NOT NULL,
	`ownership` text DEFAULT 'operator_created' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_calendar_start` ON `calendar_blocks` (`start_at`);--> statement-breakpoint
CREATE TABLE `connectors` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`status` text NOT NULL,
	`detail` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `content_ideas` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`pillar` text NOT NULL,
	`status` text DEFAULT 'idea' NOT NULL,
	`score` integer NOT NULL,
	`source` text NOT NULL,
	`next_action` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_content_status_score` ON `content_ideas` (`status`,`score`);--> statement-breakpoint
CREATE TABLE `council_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`role_id` text NOT NULL,
	`title` text NOT NULL,
	`rationale` text NOT NULL,
	`status` text DEFAULT 'proposed' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_council_proposal_status` ON `council_proposals` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `council_roles` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`role_name` text NOT NULL,
	`mission` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`last_run_at` text
);
--> statement-breakpoint
CREATE TABLE `decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`decision` text NOT NULL,
	`rationale` text NOT NULL,
	`affected` text DEFAULT 'General' NOT NULL,
	`decided_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`company` text NOT NULL,
	`location` text NOT NULL,
	`fit_score` integer NOT NULL,
	`status` text DEFAULT 'recommended' NOT NULL,
	`source` text NOT NULL,
	`next_action` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_jobs_status_fit` ON `jobs` (`status`,`fit_score`);--> statement-breakpoint
CREATE TABLE `learning_items` (
	`id` text PRIMARY KEY NOT NULL,
	`track_id` text NOT NULL,
	`title` text NOT NULL,
	`source` text NOT NULL,
	`item_type` text NOT NULL,
	`duration_minutes` integer NOT NULL,
	`status` text DEFAULT 'recommended' NOT NULL,
	`relevance` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_learning_track_status` ON `learning_items` (`track_id`,`status`);--> statement-breakpoint
CREATE TABLE `learning_tracks` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`purpose` text NOT NULL,
	`weekly_budget_minutes` integer NOT NULL,
	`state` text DEFAULT 'active' NOT NULL,
	`position` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `planning_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`note` text NOT NULL,
	`result` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `startup_ideas` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`problem` text NOT NULL,
	`target_user` text NOT NULL,
	`state` text DEFAULT 'captured' NOT NULL,
	`next_validation` text NOT NULL,
	`confidence` integer DEFAULT 20 NOT NULL,
	`review_date` text NOT NULL
);
