CREATE TABLE `audit` (
	`id` text PRIMARY KEY NOT NULL,
	`action` text NOT NULL,
	`detail` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `boosts` (
	`id` text PRIMARY KEY NOT NULL,
	`chain` integer NOT NULL,
	`token` text NOT NULL,
	`buyer` text NOT NULL,
	`units` integer NOT NULL,
	`expires` integer NOT NULL,
	`paid` text NOT NULL,
	`block` integer NOT NULL,
	`tx` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_boosts_chain_token_expiry` ON `boosts` (`chain`,`token`,`expires`);--> statement-breakpoint
CREATE TABLE `challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`message` text NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `metadata` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`chain` integer NOT NULL,
	`token` text NOT NULL,
	`reason` text NOT NULL,
	`created` integer NOT NULL,
	`status` text DEFAULT 'open' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tokens` (
	`chain` integer NOT NULL,
	`address` text NOT NULL,
	`creator` text NOT NULL,
	`sequence` integer NOT NULL,
	`name` text NOT NULL,
	`symbol` text NOT NULL,
	`supply` text NOT NULL,
	`metadata_id` text,
	`tx` text NOT NULL,
	`block` integer NOT NULL,
	`created` integer NOT NULL,
	`hidden` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`chain`, `address`)
);
--> statement-breakpoint
CREATE INDEX `idx_tokens_chain_created` ON `tokens` (`chain`,`created`);--> statement-breakpoint
CREATE TABLE `views` (
	`chain` integer NOT NULL,
	`token` text NOT NULL,
	`visitor` text NOT NULL,
	`day` integer NOT NULL,
	`created` integer NOT NULL,
	PRIMARY KEY(`chain`, `token`, `visitor`, `day`)
);
--> statement-breakpoint
CREATE INDEX `idx_views_recent` ON `views` (`chain`,`token`,`created`);