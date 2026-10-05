CREATE TABLE `rvyn_allowlist` (
	`chain_id` integer NOT NULL,
	`wallet_address` text NOT NULL,
	`status` text NOT NULL,
	`source` text NOT NULL,
	`public_note` text DEFAULT '' NOT NULL,
	`listed_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`updated_by` text NOT NULL,
	PRIMARY KEY(`chain_id`, `wallet_address`)
);
--> statement-breakpoint
CREATE INDEX `idx_rvyn_allowlist_status` ON `rvyn_allowlist` (`chain_id`,`status`,`updated_at`);
