type LinkInput = {
  type: string;
  url: string;
  source: string;
  updatedBy: string;
};

export type LaunchRecordInput = {
  chainId: number;
  contractAddress: string;
  creatorWallet: string;
  factoryAddress: string;
  factoryVersion: string;
  launchTx: string;
  blockNumber: number;
  blockHash: string;
  timestamp: number;
  totalSupply: string;
  name: string;
  symbol: string;
  metadata: Record<string, unknown> | null;
  status: "pending" | "active";
  confirmationDepth: number;
  observedAt: number;
};

const recordPath = (contractAddress: string) =>
  `/assets/robinhood/${contractAddress.toLowerCase()}`;

function parseJson(value: unknown, fallback: unknown = {}) {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function cleanMetadata(input: Record<string, unknown> | null, fallbackName: string) {
  const value = input || {};
  return {
    name: typeof value.name === "string" && value.name.trim() ? value.name.trim() : fallbackName,
    symbol: typeof value.symbol === "string" ? value.symbol : "",
    logo: typeof value.logo === "string" ? value.logo : "",
    description: typeof value.description === "string" ? value.description : "",
  };
}

function metadataLinks(metadata: Record<string, unknown> | null, actor: string): LinkInput[] {
  if (!metadata) return [];
  return [
    ["website", metadata.website],
    ["x", metadata.x],
    ["telegram", metadata.telegram],
    ["liquidity", metadata.liquidityUrl],
  ]
    .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0)
    .map(([type, url]) => ({ type, url, source: "creator", updatedBy: actor }));
}

export function launchRecordStatements(database: D1Database, input: LaunchRecordInput) {
  const address = input.contractAddress.toLowerCase();
  const creator = input.creatorWallet.toLowerCase();
  const tx = input.launchTx.toLowerCase();
  const metadata = cleanMetadata(input.metadata, input.name);
  const statements: D1PreparedStatement[] = [
    database.prepare(
      `INSERT OR IGNORE INTO asset_events(id,chain_id,contract_address,event_type,source,actor,payload,created_at)
       SELECT ?,?,?,'record_recovered','observed',NULL,?,?
       WHERE EXISTS(SELECT 1 FROM assets WHERE chain_id=? AND contract_address=? AND record_status='unavailable')`,
    ).bind(
      `recovered:${input.chainId}:${tx}:${input.blockHash.toLowerCase()}`,
      input.chainId,
      address,
      JSON.stringify({ launchTx: tx, blockNumber: input.blockNumber, blockHash: input.blockHash.toLowerCase(), status: input.status }),
      input.observedAt,
      input.chainId,
      address,
    ),
    database.prepare(
      `INSERT INTO assets(chain_id,contract_address,asset_type,record_status,launch_tx,created_at,updated_at)
       VALUES(?,?,'erc20',?,?,?,?)
       ON CONFLICT(chain_id,contract_address) DO UPDATE SET
       record_status=CASE WHEN assets.record_status='unavailable' OR (assets.record_status='pending' AND excluded.record_status='active') THEN excluded.record_status ELSE assets.record_status END,
       updated_at=MAX(assets.updated_at,excluded.updated_at)`,
    ).bind(input.chainId, address, input.status, tx, input.timestamp, input.observedAt),
    database.prepare(
      `INSERT OR IGNORE INTO asset_origins(chain_id,contract_address,origin_type,creator_wallet,factory_address,factory_version,launch_tx,block_number,block_hash,timestamp,created_at)
       VALUES(?,?,'rovyncore_launch',?,?,?,?,?,?,?,?)`,
    ).bind(
      input.chainId,
      address,
      creator,
      input.factoryAddress.toLowerCase(),
      input.factoryVersion,
      tx,
      input.blockNumber,
      input.blockHash.toLowerCase(),
      input.timestamp,
      input.observedAt,
    ),
    database.prepare(
      `INSERT OR IGNORE INTO asset_states(id,chain_id,contract_address,state_kind,version,payload,data_source,sync_status,block_number,observed_at,created_at)
       VALUES(?,?,?,'original',1,?,'launch-event+fixed-erc20-template','fresh',?,?,?)`,
    ).bind(
      `original:${input.chainId}:${tx}`,
      input.chainId,
      address,
      JSON.stringify({ totalSupply: input.totalSupply, decimals: 18, initialHolder: creator }),
      input.blockNumber,
      input.timestamp,
      input.observedAt,
    ),
    database.prepare(
      `INSERT OR IGNORE INTO asset_metadata(chain_id,contract_address,data,version,updated_by,updated_at)
       VALUES(?,?,?,1,?,?)`,
    ).bind(input.chainId, address, JSON.stringify(metadata), creator, input.observedAt),
    database.prepare(
      `INSERT OR IGNORE INTO asset_events(id,chain_id,contract_address,event_type,source,actor,payload,created_at)
       VALUES(?,?,?,'asset_launched','platform',?,?,?)`,
    ).bind(
      `launched:${input.chainId}:${tx}`,
      input.chainId,
      address,
      creator,
      JSON.stringify({ launchTx: tx, blockNumber: input.blockNumber, confirmationDepth: input.confirmationDepth }),
      input.timestamp,
    ),
    database.prepare(
      `INSERT OR IGNORE INTO asset_events(id,chain_id,contract_address,event_type,source,actor,payload,created_at)
       SELECT ?,?,?, 'launch_confirmed','platform',?,?,? WHERE ?='active'`,
    ).bind(
      `confirmed:${input.chainId}:${tx}`,
      input.chainId,
      address,
      creator,
      JSON.stringify({ confirmationDepth: input.confirmationDepth }),
      input.timestamp,
      input.status,
    ),
  ];
  for (const link of metadataLinks(input.metadata, creator)) {
    statements.push(
      database.prepare(
        `INSERT OR IGNORE INTO asset_links(id,chain_id,contract_address,link_type,url,source,updated_by,created_at,updated_at)
         VALUES(?,?,?,?,?,?,?,?,?)`,
      ).bind(
        `launch-link:${input.chainId}:${tx}:${link.type}`,
        input.chainId,
        address,
        link.type,
        link.url,
        link.source,
        link.updatedBy,
        input.observedAt,
        input.observedAt,
      ),
    );
    statements.push(
      database.prepare(
        `INSERT OR IGNORE INTO asset_events(id,chain_id,contract_address,event_type,source,actor,payload,created_at)
         VALUES(?,?,?,'link_updated','creator',?,?,?)`,
      ).bind(
        `launch-link-event:${input.chainId}:${tx}:${link.type}`,
        input.chainId,
        address,
        creator,
        JSON.stringify({ linkType: link.type, url: link.url, initial: true }),
        input.timestamp,
      ),
    );
  }
  return statements;
}

export async function getAssetRecord(
  database: D1Database,
  chainId: number,
  contractAddress: string,
  includeHidden = false,
) {
  const address = contractAddress.toLowerCase();
  const row = await database
    .prepare(
      `SELECT a.*, t.creator AS legacy_creator, t.name AS chain_name, t.symbol AS chain_symbol, t.supply AS legacy_supply,
              t.hidden AS legacy_hidden, o.origin_type, o.creator_wallet, o.factory_address, o.factory_version,
              o.launch_tx AS origin_launch_tx, o.block_number AS origin_block_number, o.block_hash, o.timestamp AS origin_timestamp,
              m.data AS metadata_json, m.version AS metadata_version, m.updated_at AS metadata_updated_at
       FROM assets a
       LEFT JOIN tokens t ON t.chain=a.chain_id AND t.address=a.contract_address
       LEFT JOIN asset_origins o ON o.chain_id=a.chain_id AND o.contract_address=a.contract_address
       LEFT JOIN asset_metadata m ON m.chain_id=a.chain_id AND m.contract_address=a.contract_address
       WHERE a.chain_id=? AND a.contract_address=?`,
    )
    .bind(chainId, address)
    .first<Record<string, unknown>>();
  if (!row || (!includeHidden && Number(row.legacy_hidden || 0) === 1)) return null;

  const [states, links] = await Promise.all([
    database
      .prepare(
        `SELECT s.* FROM asset_states s
         WHERE s.chain_id=? AND s.contract_address=? AND (
           (s.state_kind='original' AND s.version=(
             SELECT MIN(v.version) FROM asset_states v WHERE v.chain_id=s.chain_id AND v.contract_address=s.contract_address AND v.state_kind='original'
           )) OR
           (s.state_kind='correction' AND s.version=(
             SELECT MAX(v.version) FROM asset_states v WHERE v.chain_id=s.chain_id AND v.contract_address=s.contract_address AND v.state_kind='correction'
           )) OR
           (s.state_kind='current' AND s.version=(
             SELECT MAX(v.version) FROM asset_states v WHERE v.chain_id=s.chain_id AND v.contract_address=s.contract_address AND v.state_kind='current'
           )) OR
         (s.state_kind='current' AND s.sync_status='fresh' AND s.version=(
             SELECT MAX(v.version) FROM asset_states v WHERE v.chain_id=s.chain_id AND v.contract_address=s.contract_address AND v.state_kind='current' AND v.sync_status='fresh'
           ))
         )
         ORDER BY CASE s.state_kind WHEN 'original' THEN 0 WHEN 'correction' THEN 1 WHEN 'current' THEN 2 ELSE 3 END, s.version DESC`,
      )
      .bind(chainId, address)
      .all<Record<string, unknown>>(),
    database
      .prepare(
        "SELECT link_type,url,source,updated_by,updated_at FROM asset_links WHERE chain_id=? AND contract_address=? ORDER BY link_type",
      )
      .bind(chainId, address)
      .all<Record<string, unknown>>(),
  ]);
  const stateRows = states.results;
  const originalRow = stateRows.find((x) => x.state_kind === "original");
  const correctionRow = stateRows.find((x) => x.state_kind === "correction");
  const currentRow = stateRows.find((x) => x.state_kind === "current");
  const lastSuccessfulCurrent = stateRows.find((x) => x.state_kind === "current" && x.sync_status === "fresh");
  const original = parseJson(originalRow?.payload, null) as Record<string, unknown> | null;
  const correction = parseJson(correctionRow?.payload, null) as Record<string, unknown> | null;
  const comparisonBaseline = correction || original;
  const current = parseJson(currentRow?.payload, null) as Record<string, unknown> | null;
  const metadata = parseJson(row.metadata_json, {}) as Record<string, unknown>;
  const name = typeof metadata.name === "string" && metadata.name ? metadata.name : String(row.chain_name || "");
  const symbol = String(row.chain_symbol || metadata.symbol || "");
  const currentStatus = String(currentRow?.sync_status || "unknown");
  const linkRows = links.results.map((item) => ({
    type: String(item.link_type),
    url: String(item.url),
    source: String(item.source),
    updatedBy: String(item.updated_by),
    updatedAt: Number(item.updated_at),
  }));
  const linkMap = Object.fromEntries(linkRows.map((link) => [link.type, link.url])) as Record<string, string>;
  const dynamicFieldNames = ["totalSupply", "decimals"] as const;
  const fields: { field: string; original: unknown; current: unknown; status: string; source: string }[] = dynamicFieldNames.map((field) => {
    const before = comparisonBaseline?.[field];
    const after = current?.[field];
    const status = !currentRow
      ? "pending"
      : currentStatus === "unavailable"
        ? "unavailable"
        : before === undefined || before === null
          ? "not_applicable"
          : after === undefined || after === null
            ? "unavailable"
          : String(before) === String(after)
            ? "matched"
            : "changed";
    return {
      field,
      original: before ?? null,
      current: after ?? null,
      status,
      source: String(currentRow?.data_source || "launch-snapshot"),
    };
  });
  const templateVersion = String(row.factory_version || "");
  const knownFactoryTemplate = row.origin_type === "rovyncore_launch"
    && Boolean(row.factory_address)
    && (templateVersion === "v1" || templateVersion === "v2");
  const originType = row.origin_type === "rovyncore_launch" && !knownFactoryTemplate
    ? "legacy_import"
    : String(row.origin_type || "legacy_import");
  // The launch templates have no owner, mint, pause, proxy or tax getter.
  // Omitting those capabilities keeps the public API from implying that an
  // unsupported read failed. A creator-supplied URL never proves a pool.
  fields.push({
    field: "officialPair",
    original: null,
    current: "no_pool",
    status: "not_observed",
    source: "record-layer:pair-not-observed",
  });
  const known = fields.filter((field) => field.status === "matched" || field.status === "changed" || field.status === "not_applicable");
  const comparisonStatus = currentStatus === "unavailable"
    ? "unavailable"
      : fields.some((field) => field.status === "changed")
        ? "changed"
      : !currentRow
        ? "pending"
        : known.length === 0 || fields.some((field) => field.status === "unavailable")
          ? "partial"
          : "matched";
  const lastSyncedAt = lastSuccessfulCurrent ? Number(lastSuccessfulCurrent.observed_at) : null;
  return {
    schemaVersion: "1.0.0",
    asset: {
      type: String(row.asset_type),
      chainId,
      network: chainId === 4663 ? "Robinhood Chain" : "Robinhood Testnet",
      contractAddress: address,
      recordStatus: String(row.record_status),
      url: recordPath(address),
      createdAt: Number(row.created_at),
    },
    identity: {
      name,
      symbol,
      logo: typeof metadata.logo === "string" ? metadata.logo : "",
      description: typeof metadata.description === "string" ? metadata.description : "",
      assetType: String(row.asset_type),
    },
    origin: {
      type: originType,
      creatorWallet: String(row.creator_wallet || row.legacy_creator || ""),
      contractAddress: address,
      factoryAddress: row.factory_address || null,
      factoryVersion: row.factory_version || null,
      launchTx: String(row.origin_launch_tx || row.launch_tx || ""),
      blockNumber: Number(row.origin_block_number || 0),
      blockHash: row.block_hash || null,
      timestamp: Number(row.origin_timestamp || row.created_at),
    },
    originalState: original ? {
      values: original,
      version: Number(originalRow?.version || 1),
      dataSource: String(originalRow?.data_source || "unknown"),
      blockNumber: originalRow?.block_number == null ? null : Number(originalRow.block_number),
      observedAt: Number(originalRow?.observed_at || row.created_at),
    } : null,
    correctionState: correction ? {
      values: correction,
      version: Number(correctionRow?.version || 1),
      dataSource: String(correctionRow?.data_source || "operator-correction"),
      observedAt: Number(correctionRow?.observed_at || row.updated_at),
    } : null,
    canonicalState: comparisonBaseline ? {
      values: comparisonBaseline,
      type: correction ? "correction" : "original",
      version: Number((correctionRow || originalRow)?.version || 1),
    } : null,
    currentState: current ? {
      values: current,
      syncStatus: currentStatus,
      dataSource: String(currentRow?.data_source || "unknown"),
      blockNumber: lastSuccessfulCurrent?.block_number == null ? null : Number(lastSuccessfulCurrent.block_number),
      lastSyncedAt,
    } : {
      values: null,
      syncStatus: "unknown",
      dataSource: null,
      blockNumber: null,
      lastSyncedAt: null,
    },
    comparison: {
      status: comparisonStatus,
      fields,
      baseline: correction ? "correction" : original ? "original" : null,
      baselineVersion: correction ? Number(correctionRow?.version || 1) : original ? Number(originalRow?.version || 1) : null,
    },
    links: {
      website: linkMap.website || "",
      x: linkMap.x || "",
      telegram: linkMap.telegram || "",
      liquidity: linkMap.liquidity || "",
      liquidityStatus: linkMap.liquidity ? "external_link_only" : "no_pool",
      liquiditySource: linkRows.find((link) => link.type === "liquidity")?.source || null,
      all: linkRows,
    },
    recordStatus: String(row.record_status),
    comparisonStatus,
    dataSource: String(currentRow?.data_source || correctionRow?.data_source || originalRow?.data_source || "launch-record"),
    lastSyncedAt,
    metadataVersion: Number(row.metadata_version || 1),
    metadataUpdatedAt: row.metadata_updated_at == null ? null : Number(row.metadata_updated_at),
  };
}

export async function listAssetRecords(
  database: D1Database,
  options: { chainId: number; query: string; creator?: string; excludeAddress?: string; limit: number; cursor?: string },
) {
  const { chainId, query, creator, excludeAddress, limit } = options;
  let cursorTime: number | null = null;
  let cursorAddress = "";
  if (options.cursor) {
    const match = /^(\d{1,12}):(0x[a-fA-F0-9]{40})$/.exec(options.cursor);
    if (!match) throw new Error("Invalid cursor");
    cursorTime = Number(match[1]);
    cursorAddress = match[2].toLowerCase();
  }
  const escaped = query.replace(/[\\%_]/g, "\\$&");
  const pattern = `%${escaped}%`;
  const rows = await database
    .prepare(
      `SELECT a.chain_id,a.contract_address,a.asset_type,a.record_status,a.created_at,a.launch_tx,
              o.creator_wallet,o.factory_address,o.factory_version,o.block_number,
              t.name AS chain_name,t.symbol AS chain_symbol,m.data AS metadata_json,
              (SELECT url FROM asset_links l WHERE l.chain_id=a.chain_id AND l.contract_address=a.contract_address AND l.link_type='liquidity') AS liquidity_url
       FROM assets a
       LEFT JOIN asset_origins o ON o.chain_id=a.chain_id AND o.contract_address=a.contract_address
       LEFT JOIN tokens t ON t.chain=a.chain_id AND t.address=a.contract_address
       LEFT JOIN asset_metadata m ON m.chain_id=a.chain_id AND m.contract_address=a.contract_address
       WHERE a.chain_id=? AND a.record_status='active' AND (t.address IS NULL OR t.hidden=0)
       AND (? IS NULL OR o.creator_wallet=?)
       AND (? IS NULL OR a.contract_address<>?)
       AND (?='' OR t.name LIKE ? ESCAPE '\\' OR t.symbol LIKE ? ESCAPE '\\' OR a.contract_address LIKE ? ESCAPE '\\' OR json_extract(m.data,'$.name') LIKE ? ESCAPE '\\')
       AND (? IS NULL OR a.created_at>? OR (a.created_at=? AND a.contract_address>?))
       ORDER BY a.created_at ASC,a.contract_address ASC LIMIT ?`,
    )
    .bind(
      chainId,
      creator?.toLowerCase() || null,
      creator?.toLowerCase() || null,
      excludeAddress?.toLowerCase() || null,
      excludeAddress?.toLowerCase() || null,
      query,
      pattern,
      pattern,
      pattern,
      pattern,
      cursorTime,
      cursorTime,
      cursorTime,
      cursorAddress,
      limit + 1,
    )
    .all<Record<string, unknown>>();
  const hasMore = rows.results.length > limit;
  const page = rows.results.slice(0, limit);
  const records = page.map((row) => {
    const metadata = parseJson(row.metadata_json, {}) as Record<string, unknown>;
    const address = String(row.contract_address).toLowerCase();
    return {
      schemaVersion: "1.0.0",
      asset: {
        type: String(row.asset_type),
        chainId,
        network: chainId === 4663 ? "Robinhood Chain" : "Robinhood Testnet",
        contractAddress: address,
        recordStatus: String(row.record_status),
        url: recordPath(address),
        createdAt: Number(row.created_at),
      },
      identity: {
        name: typeof metadata.name === "string" && metadata.name ? metadata.name : String(row.chain_name || ""),
        symbol: String(row.chain_symbol || metadata.symbol || ""),
        logo: typeof metadata.logo === "string" ? metadata.logo : "",
        description: typeof metadata.description === "string" ? metadata.description : "",
        assetType: String(row.asset_type),
      },
      origin: {
        creatorWallet: String(row.creator_wallet || ""),
        factoryAddress: row.factory_address || null,
        factoryVersion: row.factory_version || null,
        launchTx: String(row.launch_tx || ""),
        blockNumber: Number(row.block_number || 0),
      },
      links: {
        liquidity: String(row.liquidity_url || ""),
        liquidityStatus: row.liquidity_url ? "external_link_only" : "no_pool",
      },
      recordStatus: String(row.record_status),
    };
  });
  const last = page.at(-1);
  return {
    assets: records,
    nextCursor: hasMore && last
      ? `${Number(last.created_at)}:${String(last.contract_address).toLowerCase()}`
      : null,
    limit,
  };
}

export function eventStatement(
  database: D1Database,
  input: { id: string; chainId: number; contractAddress: string; eventType: string; source: string; actor?: string | null; payload: unknown; createdAt: number },
) {
  return database.prepare(
    "INSERT OR IGNORE INTO asset_events(id,chain_id,contract_address,event_type,source,actor,payload,created_at) VALUES(?,?,?,?,?,?,?,?)",
  ).bind(
    input.id,
    input.chainId,
    input.contractAddress.toLowerCase(),
    input.eventType,
    input.source,
    input.actor?.toLowerCase() || null,
    JSON.stringify(input.payload ?? {}),
    input.createdAt,
  );
}

export async function listAssetEvents(database: D1Database, chainId: number, contractAddress: string, limit: number, cursor?: string) {
  const params: (string | number)[] = [chainId, contractAddress.toLowerCase()];
  let cursorClause = "";
  if (cursor) {
    if (!/^\d{1,12}:[A-Za-z0-9:_-]{1,120}$/.test(cursor)) throw new Error("Invalid cursor");
    const split = cursor.indexOf(":");
    cursorClause = " AND (created_at<? OR (created_at=? AND id<?))";
    params.push(Number(cursor.slice(0, split)), Number(cursor.slice(0, split)), cursor.slice(split + 1));
  }
  params.push(limit + 1);
  const result = await database.prepare(
    `SELECT id,event_type,source,actor,payload,created_at FROM asset_events WHERE chain_id=? AND contract_address=?${cursorClause} ORDER BY created_at DESC,id DESC LIMIT ?`,
  ).bind(...params).all<Record<string, unknown>>();
  const hasMore = result.results.length > limit;
  const rows = result.results.slice(0, limit);
  const last = rows.at(-1);
  return {
    events: rows.map((row) => ({
      id: String(row.id),
      type: String(row.event_type),
      source: String(row.source),
      actor: row.actor || null,
      payload: parseJson(row.payload),
      createdAt: Number(row.created_at),
    })),
    nextCursor: hasMore && last ? `${Number(last.created_at)}:${String(last.id)}` : null,
    limit,
  };
}
