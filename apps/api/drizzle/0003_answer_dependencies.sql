ALTER TABLE `audit_log` ADD `previous_hash` text;--> statement-breakpoint
ALTER TABLE `audit_log` ADD `entry_hash` text;--> statement-breakpoint
ALTER TABLE `questions` ADD `source_ids` text;
