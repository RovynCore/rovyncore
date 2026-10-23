CREATE TABLE `lightdive_vote` (
	`month` text NOT NULL,
	`account` text NOT NULL,
	`choice` integer NOT NULL,
	`updated` integer NOT NULL,
	PRIMARY KEY(`month`, `account`)
);
