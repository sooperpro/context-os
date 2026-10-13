CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`project_id` text,
	`actor_id` text NOT NULL,
	`actor_name` text NOT NULL,
	`action` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`metadata` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_log_project_idx` ON `audit_log` (`project_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `context_items` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`kind` text NOT NULL,
	`normalized_key` text NOT NULL,
	`title` text NOT NULL,
	`summary` text NOT NULL,
	`data` text NOT NULL,
	`event_at` integer,
	`as_of` integer,
	`verification` text DEFAULT 'inferred' NOT NULL,
	`confidence` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `context_items_project_kind_idx` ON `context_items` (`project_id`,`kind`);--> statement-breakpoint
CREATE INDEX `context_items_project_key_idx` ON `context_items` (`project_id`,`normalized_key`);--> statement-breakpoint
CREATE TABLE `evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`context_item_id` text NOT NULL,
	`source_object_id` text NOT NULL,
	`chunk_id` text,
	`extraction_run_id` text,
	`quote` text NOT NULL,
	`quote_verified` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`context_item_id`) REFERENCES `context_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_object_id`) REFERENCES `source_objects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`chunk_id`) REFERENCES `source_chunks`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`extraction_run_id`) REFERENCES `extraction_runs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `evidence_item_idx` ON `evidence` (`context_item_id`);--> statement-breakpoint
CREATE INDEX `evidence_source_idx` ON `evidence` (`source_object_id`);--> statement-breakpoint
CREATE TABLE `extraction_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`source_object_id` text NOT NULL,
	`model` text NOT NULL,
	`prompt_version` text NOT NULL,
	`status` text NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`error` text,
	`stats` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_object_id`) REFERENCES `source_objects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `extraction_runs_source_idx` ON `extraction_runs` (`source_object_id`);--> statement-breakpoint
CREATE TABLE `feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`kind` text NOT NULL,
	`note` text,
	`actor_id` text NOT NULL,
	`actor_name` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `feedback_project_idx` ON `feedback` (`project_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `hub_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`section` text NOT NULL,
	`data` text NOT NULL,
	`model` text NOT NULL,
	`prompt_version` text NOT NULL,
	`stale` integer DEFAULT false NOT NULL,
	`generated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hub_snapshots_project_section_uq` ON `hub_snapshots` (`project_id`,`section`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`type` text NOT NULL,
	`payload` text NOT NULL,
	`subject` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 3 NOT NULL,
	`run_after` integer NOT NULL,
	`locked_at` integer,
	`started_at` integer,
	`finished_at` integer,
	`last_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `jobs_status_run_after_idx` ON `jobs` (`status`,`run_after`);--> statement-breakpoint
CREATE INDEX `jobs_project_status_idx` ON `jobs` (`project_id`,`status`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `projects_workspace_idx` ON `projects` (`workspace_id`);--> statement-breakpoint
CREATE TABLE `questions` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`question` text NOT NULL,
	`answer` text NOT NULL,
	`model` text NOT NULL,
	`actor_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `questions_project_idx` ON `questions` (`project_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `source_chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`source_object_id` text NOT NULL,
	`project_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`content` text NOT NULL,
	`embedding` blob,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`source_object_id`) REFERENCES `source_objects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `source_chunks_source_idx` ON `source_chunks` (`source_object_id`,`ordinal`);--> statement-breakpoint
CREATE INDEX `source_chunks_project_idx` ON `source_chunks` (`project_id`);--> statement-breakpoint
CREATE TABLE `source_objects` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`connector` text NOT NULL,
	`kind` text NOT NULL,
	`external_id` text,
	`title` text NOT NULL,
	`url` text,
	`author` text,
	`content` text NOT NULL,
	`content_hash` text NOT NULL,
	`source_created_at` integer,
	`source_updated_at` integer,
	`ingested_at` integer NOT NULL,
	`processed_at` integer,
	`status` text DEFAULT 'pending' NOT NULL,
	`error` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `source_objects_project_idx` ON `source_objects` (`project_id`,`ingested_at`);--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL
);
