CREATE TABLE `assets` (
	`chain_id` integer NOT NULL,
	`contract_address` text NOT NULL,
	`asset_type` text DEFAULT 'erc20' NOT NULL,
	`record_status` text DEFAULT 'pending' NOT NULL,
	`launch_tx` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`chain_id`, `contract_address`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_assets_chain_launch_tx` ON `assets` (`chain_id`,`launch_tx`);
--> statement-breakpoint
CREATE INDEX `idx_assets_chain_created` ON `assets` (`chain_id`,`created_at`,`contract_address`);
--> statement-breakpoint
CREATE INDEX `idx_assets_chain_status` ON `assets` (`chain_id`,`record_status`,`created_at`);
--> statement-breakpoint
CREATE TABLE `asset_origins` (
	`chain_id` integer NOT NULL,
	`contract_address` text NOT NULL,
	`origin_type` text NOT NULL,
	`creator_wallet` text NOT NULL,
	`factory_address` text,
	`factory_version` text,
	`launch_tx` text NOT NULL,
	`block_number` integer NOT NULL,
	`block_hash` text,
	`timestamp` integer NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`chain_id`, `contract_address`)
);
--> statement-breakpoint
CREATE TABLE `asset_states` (
	`id` text PRIMARY KEY NOT NULL,
	`chain_id` integer NOT NULL,
	`contract_address` text NOT NULL,
	`state_kind` text NOT NULL,
	`version` integer NOT NULL,
	`payload` text NOT NULL,
	`data_source` text NOT NULL,
	`sync_status` text NOT NULL,
	`block_number` integer,
	`observed_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_asset_states_version` ON `asset_states` (`chain_id`,`contract_address`,`state_kind`,`version`);
--> statement-breakpoint
CREATE INDEX `idx_asset_states_latest` ON `asset_states` (`chain_id`,`contract_address`,`state_kind`,`version`);
--> statement-breakpoint
CREATE TABLE `asset_metadata` (
	`chain_id` integer NOT NULL,
	`contract_address` text NOT NULL,
	`data` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`chain_id`, `contract_address`)
);
--> statement-breakpoint
CREATE TABLE `asset_links` (
	`id` text PRIMARY KEY NOT NULL,
	`chain_id` integer NOT NULL,
	`contract_address` text NOT NULL,
	`link_type` text NOT NULL,
	`url` text NOT NULL,
	`source` text NOT NULL,
	`updated_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_asset_links_type` ON `asset_links` (`chain_id`,`contract_address`,`link_type`);
--> statement-breakpoint
CREATE INDEX `idx_asset_links_asset` ON `asset_links` (`chain_id`,`contract_address`);
--> statement-breakpoint
CREATE TABLE `asset_events` (
	`id` text PRIMARY KEY NOT NULL,
	`chain_id` integer NOT NULL,
	`contract_address` text NOT NULL,
	`event_type` text NOT NULL,
	`source` text NOT NULL,
	`actor` text,
	`payload` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_asset_events_asset_time` ON `asset_events` (`chain_id`,`contract_address`,`created_at`);
--> statement-breakpoint
CREATE TRIGGER `asset_states_no_update`
BEFORE UPDATE ON `asset_states`
BEGIN
	SELECT RAISE(ABORT, 'asset states are append-only');
END;
--> statement-breakpoint
CREATE TRIGGER `asset_states_no_delete`
BEFORE DELETE ON `asset_states`
BEGIN
	SELECT RAISE(ABORT, 'asset states are append-only');
END;
--> statement-breakpoint
CREATE TRIGGER `asset_events_no_update`
BEFORE UPDATE ON `asset_events`
BEGIN
	SELECT RAISE(ABORT, 'asset events are append-only');
END;
--> statement-breakpoint
CREATE TRIGGER `asset_events_no_delete`
BEFORE DELETE ON `asset_events`
BEGIN
	SELECT RAISE(ABORT, 'asset events are append-only');
END;
--> statement-breakpoint
INSERT OR IGNORE INTO `assets` (`chain_id`,`contract_address`,`asset_type`,`record_status`,`launch_tx`,`created_at`,`updated_at`)
SELECT `chain`,`address`,'erc20','active',`tx`,`created`,`created` FROM `tokens`;
--> statement-breakpoint
INSERT OR IGNORE INTO `asset_origins` (`chain_id`,`contract_address`,`origin_type`,`creator_wallet`,`factory_address`,`factory_version`,`launch_tx`,`block_number`,`block_hash`,`timestamp`,`created_at`)
SELECT `chain`,`address`,'rovyncore_launch',`creator`,NULL,NULL,`tx`,`block`,NULL,`created`,`created` FROM `tokens`;
--> statement-breakpoint
INSERT OR IGNORE INTO `asset_states` (`id`,`chain_id`,`contract_address`,`state_kind`,`version`,`payload`,`data_source`,`sync_status`,`block_number`,`observed_at`,`created_at`)
SELECT 'legacy-original:'||`chain`||':'||`address`,`chain`,`address`,'original',1,json_object('totalSupply',`supply`,'decimals',18),'legacy-indexed-launch-event','fresh',`block`,`created`,`created` FROM `tokens`;
--> statement-breakpoint
INSERT OR IGNORE INTO `asset_metadata` (`chain_id`,`contract_address`,`data`,`version`,`updated_by`,`updated_at`)
SELECT t.`chain`,t.`address`,COALESCE(m.`data`,'{}'),1,t.`creator`,t.`created` FROM `tokens` t LEFT JOIN `metadata` m ON m.`id`=t.`metadata_id`;
--> statement-breakpoint
INSERT OR IGNORE INTO `asset_links` (`id`,`chain_id`,`contract_address`,`link_type`,`url`,`source`,`updated_by`,`created_at`,`updated_at`)
SELECT 'legacy-link:'||t.`chain`||':'||t.`address`||':website',t.`chain`,t.`address`,'website',json_extract(m.`data`,'$.website'),'creator',t.`creator`,t.`created`,t.`created` FROM `tokens` t JOIN `metadata` m ON m.`id`=t.`metadata_id` WHERE COALESCE(json_extract(m.`data`,'$.website'),'')<>'';
--> statement-breakpoint
INSERT OR IGNORE INTO `asset_links` (`id`,`chain_id`,`contract_address`,`link_type`,`url`,`source`,`updated_by`,`created_at`,`updated_at`)
SELECT 'legacy-link:'||t.`chain`||':'||t.`address`||':x',t.`chain`,t.`address`,'x',json_extract(m.`data`,'$.x'),'creator',t.`creator`,t.`created`,t.`created` FROM `tokens` t JOIN `metadata` m ON m.`id`=t.`metadata_id` WHERE COALESCE(json_extract(m.`data`,'$.x'),'')<>'';
--> statement-breakpoint
INSERT OR IGNORE INTO `asset_links` (`id`,`chain_id`,`contract_address`,`link_type`,`url`,`source`,`updated_by`,`created_at`,`updated_at`)
SELECT 'legacy-link:'||t.`chain`||':'||t.`address`||':telegram',t.`chain`,t.`address`,'telegram',json_extract(m.`data`,'$.telegram'),'creator',t.`creator`,t.`created`,t.`created` FROM `tokens` t JOIN `metadata` m ON m.`id`=t.`metadata_id` WHERE COALESCE(json_extract(m.`data`,'$.telegram'),'')<>'';
--> statement-breakpoint
INSERT OR IGNORE INTO `asset_links` (`id`,`chain_id`,`contract_address`,`link_type`,`url`,`source`,`updated_by`,`created_at`,`updated_at`)
SELECT 'legacy-link:'||t.`chain`||':'||t.`address`||':liquidity',t.`chain`,t.`address`,'liquidity',json_extract(m.`data`,'$.liquidityUrl'),'creator',t.`creator`,t.`created`,t.`created` FROM `tokens` t JOIN `metadata` m ON m.`id`=t.`metadata_id` WHERE COALESCE(json_extract(m.`data`,'$.liquidityUrl'),'')<>'';
--> statement-breakpoint
INSERT OR IGNORE INTO `asset_events` (`id`,`chain_id`,`contract_address`,`event_type`,`source`,`actor`,`payload`,`created_at`)
SELECT 'legacy-launched:'||`chain`||':'||`address`,`chain`,`address`,'asset_launched','platform',`creator`,json_object('launchTx',`tx`,'blockNumber',`block`,'imported',true),`created` FROM `tokens`;
