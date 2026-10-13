CREATE TABLE `departments` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `departments_workspace_name_uq` ON `departments` (`workspace_id`,`name`);--> statement-breakpoint
CREATE TABLE `teams` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`department_id` text NOT NULL,
	`parent_id` text,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `teams_workspace_department_name_uq` ON `teams` (`workspace_id`,`department_id`,`name`);--> statement-breakpoint
ALTER TABLE `memberships` ADD `organization` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `workspaces` ADD `slug` text;--> statement-breakpoint
ALTER TABLE `workspaces` ADD `primary_domain` text;--> statement-breakpoint
ALTER TABLE `workspaces` ADD `region` text DEFAULT 'us-east-1' NOT NULL;--> statement-breakpoint
ALTER TABLE `workspaces` ADD `settings` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `workspaces` ADD `version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `workspaces_slug_unique` ON `workspaces` (`slug`);