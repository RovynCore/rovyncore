import {
  sqliteTable,
  text,
  integer,
  index,
  primaryKey,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
export const metadata = sqliteTable("metadata", {
  id: text("id").primaryKey(),
  data: text("data").notNull(),
  created: integer("created").notNull(),
});
export const tokens = sqliteTable(
  "tokens",
  {
    chain: integer("chain").notNull(),
    address: text("address").notNull(),
    creator: text("creator").notNull(),
    sequence: integer("sequence").notNull(),
    name: text("name").notNull(),
    symbol: text("symbol").notNull(),
    supply: text("supply").notNull(),
    metadataId: text("metadata_id"),
    tx: text("tx").notNull(),
    block: integer("block").notNull(),
    created: integer("created").notNull(),
    hidden: integer("hidden").notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.chain, t.address] }),
    index("idx_tokens_chain_created").on(t.chain, t.created),
  ],
);
/** Canonical, chain-scoped public record. Legacy `tokens` stays as a compatibility projection. */
export const assets = sqliteTable(
  "assets",
  {
    chainId: integer("chain_id").notNull(),
    contractAddress: text("contract_address").notNull(),
    assetType: text("asset_type").notNull().default("erc20"),
    recordStatus: text("record_status").notNull().default("pending"),
    launchTx: text("launch_tx"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.chainId, t.contractAddress] }),
    uniqueIndex("idx_assets_chain_launch_tx").on(t.chainId, t.launchTx),
    index("idx_assets_chain_created").on(t.chainId, t.createdAt, t.contractAddress),
    index("idx_assets_chain_status").on(t.chainId, t.recordStatus, t.createdAt),
  ],
);
export const assetOrigins = sqliteTable(
  "asset_origins",
  {
    chainId: integer("chain_id").notNull(),
    contractAddress: text("contract_address").notNull(),
    originType: text("origin_type").notNull(),
    creatorWallet: text("creator_wallet").notNull(),
    factoryAddress: text("factory_address"),
    factoryVersion: text("factory_version"),
    launchTx: text("launch_tx").notNull(),
    blockNumber: integer("block_number").notNull(),
    blockHash: text("block_hash"),
    timestamp: integer("timestamp").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.chainId, t.contractAddress] })],
);
export const assetStates = sqliteTable(
  "asset_states",
  {
    id: text("id").primaryKey(),
    chainId: integer("chain_id").notNull(),
    contractAddress: text("contract_address").notNull(),
    stateKind: text("state_kind").notNull(),
    version: integer("version").notNull(),
    payload: text("payload").notNull(),
    dataSource: text("data_source").notNull(),
    syncStatus: text("sync_status").notNull(),
    blockNumber: integer("block_number"),
    observedAt: integer("observed_at").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("idx_asset_states_version").on(t.chainId, t.contractAddress, t.stateKind, t.version),
    index("idx_asset_states_latest").on(t.chainId, t.contractAddress, t.stateKind, t.version),
  ],
);
export const assetMetadata = sqliteTable(
  "asset_metadata",
  {
    chainId: integer("chain_id").notNull(),
    contractAddress: text("contract_address").notNull(),
    data: text("data").notNull(),
    version: integer("version").notNull().default(1),
    updatedBy: text("updated_by").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.chainId, t.contractAddress] })],
);
export const assetLinks = sqliteTable(
  "asset_links",
  {
    id: text("id").primaryKey(),
    chainId: integer("chain_id").notNull(),
    contractAddress: text("contract_address").notNull(),
    linkType: text("link_type").notNull(),
    url: text("url").notNull(),
    source: text("source").notNull(),
    updatedBy: text("updated_by").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("idx_asset_links_type").on(t.chainId, t.contractAddress, t.linkType),
    index("idx_asset_links_asset").on(t.chainId, t.contractAddress),
  ],
);
export const assetEvents = sqliteTable(
  "asset_events",
  {
    id: text("id").primaryKey(),
    chainId: integer("chain_id").notNull(),
    contractAddress: text("contract_address").notNull(),
    eventType: text("event_type").notNull(),
    source: text("source").notNull(),
    actor: text("actor"),
    payload: text("payload").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    index("idx_asset_events_asset_time").on(t.chainId, t.contractAddress, t.createdAt),
  ],
);
export const rvynAllowlist = sqliteTable(
  "rvyn_allowlist",
  {
    chainId: integer("chain_id").notNull(),
    walletAddress: text("wallet_address").notNull(),
    status: text("status").notNull(),
    source: text("source").notNull(),
    publicNote: text("public_note").notNull().default(""),
    listedAt: integer("listed_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    updatedBy: text("updated_by").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.chainId, t.walletAddress] }),
    index("idx_rvyn_allowlist_status").on(t.chainId, t.status, t.updatedAt),
  ],
);
export const boosts = sqliteTable(
  "boosts",
  {
    id: text("id").primaryKey(),
    chain: integer("chain").notNull(),
    token: text("token").notNull(),
    buyer: text("buyer").notNull(),
    units: integer("units").notNull(),
    expires: integer("expires").notNull(),
    paid: text("paid").notNull(),
    block: integer("block").notNull(),
    tx: text("tx").notNull(),
  },
  (t) => [
    index("idx_boosts_chain_token_expiry").on(t.chain, t.token, t.expires),
  ],
);
export const views = sqliteTable(
  "views",
  {
    chain: integer("chain").notNull(),
    token: text("token").notNull(),
    visitor: text("visitor").notNull(),
    day: integer("day").notNull(),
    created: integer("created").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.chain, t.token, t.visitor, t.day] }),
    index("idx_views_recent").on(t.chain, t.token, t.created),
  ],
);
export const challenges = sqliteTable("challenges", {
  id: text("id").primaryKey(),
  message: text("message").notNull(),
  expires: integer("expires").notNull(),
});
export const reports = sqliteTable("reports", {
  id: text("id").primaryKey(),
  chain: integer("chain").notNull(),
  token: text("token").notNull(),
  reason: text("reason").notNull(),
  created: integer("created").notNull(),
  status: text("status").notNull().default("open"),
});
export const limits = sqliteTable("limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  expires: integer("expires").notNull(),
});
export const audit = sqliteTable("audit", {
  id: text("id").primaryKey(),
  action: text("action").notNull(),
  detail: text("detail").notNull(),
  created: integer("created").notNull(),
});
