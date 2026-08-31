CREATE TABLE `calendar_preferences` (
	`id` text PRIMARY KEY NOT NULL,
	`policy` text DEFAULT 'propose_only' NOT NULL,
	`timezone` text DEFAULT 'Asia/Kolkata' NOT NULL,
	`sync_window_days` integer DEFAULT 7 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `calendar_write_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`block_id` text NOT NULL,
	`action` text NOT NULL,
	`status` text DEFAULT 'approved_pending' NOT NULL,
	`payload_json` text NOT NULL,
	`external_event_id` text,
	`error` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_calendar_writes_status` ON `calendar_write_requests` (`status`,`created_at`);