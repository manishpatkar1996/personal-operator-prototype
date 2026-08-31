CREATE INDEX `idx_goals_state_target` ON `goals` (`state`,`target_date`);--> statement-breakpoint
CREATE INDEX `idx_milestones_goal_position` ON `milestones` (`goal_id`,`position`);