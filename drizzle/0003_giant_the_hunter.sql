ALTER TABLE `calendar_blocks` ADD `source` text DEFAULT 'local' NOT NULL;--> statement-breakpoint
ALTER TABLE `calendar_blocks` ADD `external_event_id` text;--> statement-breakpoint
ALTER TABLE `calendar_blocks` ADD `event_url` text;--> statement-breakpoint
ALTER TABLE `calendar_blocks` ADD `last_synced_at` text;