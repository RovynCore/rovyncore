CREATE TABLE `lightdive_chat` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`channel` text DEFAULT 'global' NOT NULL,
	`account` text NOT NULL,
	`body` text NOT NULL,
	`created` integer NOT NULL,
	`hidden` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_lightdive_chat_channel` ON `lightdive_chat` (`channel`,`id`);
--> statement-breakpoint
CREATE INDEX `idx_lightdive_chat_account` ON `lightdive_chat` (`account`,`id`);
--> statement-breakpoint
CREATE INDEX `idx_lightdive_chat_created` ON `lightdive_chat` (`created`);
--> statement-breakpoint
CREATE TABLE `lightdive_chat_mutes` (
	`account` text PRIMARY KEY NOT NULL,
	`until` integer NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `lightdive_chat_reports` (
	`message_id` integer NOT NULL,
	`account` text NOT NULL,
	`created` integer NOT NULL,
	PRIMARY KEY(`message_id`, `account`)
);
