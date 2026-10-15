CREATE TABLE `replay_workspaces` (
	`user_id` text PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`object_key` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `replay_datasets` (
	`user_id` text NOT NULL,
	`id` text NOT NULL,
	`object_key` text NOT NULL,
	`sha256` text NOT NULL,
	`symbol` text NOT NULL,
	`name` text NOT NULL,
	`bar_count` integer NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `id`)
);
