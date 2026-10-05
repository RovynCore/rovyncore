"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "@/components/site-link";
import { usePlatform } from "@/components/platform-context";
import { api, message } from "@/components/platform-provider";
import { TokenAvatar } from "@/components/token-actions";
import { CHAINS, shortAddress } from "@/packages/web3/config";
import { formatUnits, isAddress } from "viem";
import { ArrowLeft, ArrowUpRight, Check, CircleHelp, Copy, ExternalLink, LoaderCircle, Pencil, RefreshCw, Save, X } from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "@/components/language-provider";
import { RVYN_MODEL } from "@/lib/rvyn-model";
import { rvynPublicCopy } from "@/lib/rvyn-public-copy";

import { ReadingNav, MotionDisclosure } from "@/components/workflow-motion";

type AssetRecord = {
  schemaVersion: string;
  asset: { type: string; chainId: number; network: string; contractAddress: string; recordStatus: string; createdAt: number; url: string };
  identity: { name: string; symbol: string; logo: string; description: string; assetType: string };
  origin: { type: string; creatorWallet: string; contractAddress: string; factoryAddress: string | null; factoryVersion: string | null; launchTx: string; blockNumber: number; blockHash: string | null; timestamp: number };
  originalState: { values: Record<string, unknown>; version: number; dataSource: string; blockNumber: number | null; observedAt: number } | null;
  correctionState: { values: Record<string, unknown>; version: number; dataSource: string; observedAt: number } | null;
  canonicalState: { values: Record<string, unknown>; type: "original" | "correction"; version: number } | null;
  currentState: { values: Record<string, unknown> | null; syncStatus: string; dataSource: string | null; blockNumber: number | null; lastSyncedAt: number | null; freshnessThresholdSeconds?: number };
  comparison: { status: string; baseline: "original" | "correction" | null; baselineVersion: number | null; fields: { field: string; original: unknown; current: unknown; status: string; source: string }[] };
  links: { website: string; x: string; telegram: string; liquidity: string; liquidityStatus: string; liquiditySource: string | null; all: { type: string; url: string; source: string; updatedAt: number }[] };
  recordStatus: string;
  comparisonStatus: string;
  dataSource: string;
  lastSyncedAt: number | null;
};
type AssetEvent = {
  id: string;
  type: string;
  source: string;
  actor: string | null;
  payload: {
    reason?: string;
    linkType?: string;
    syncStatus?: string;
    launchTx?: string;
    [key: string]: unknown;
  };
  createdAt: number;
};

const titleForEvent: Record<string, string> = {
  asset_launched: "資產發射紀錄",
  launch_confirmed: "達到確認深度",
  record_recovered: "紀錄已重新核對",
  metadata_updated: "展示資料更新",
  link_updated: "外部連結更新",
  state_refresh: "鏈上狀態同步",
  observed_state_change: "觀測到鏈上狀態變化",
  correction: "紀錄更正",
  record_unavailable: "紀錄暫不可用",
};

function formattedSupply(value: unknown, decimals: unknown, locale: string) {
  try {
    return Number(formatUnits(BigInt(String(value)), Number(decimals ?? 18))).toLocaleString(locale);
  } catch { return String(value ?? "—"); }
}

function valueForField(field: string, value: unknown, tr: (source: string, values?: Record<string, unknown>) => string, locale: string) {
  if (value === null || value === undefined) return "—";
  if (field === "totalSupply") {
    return tr("{0} tokens", { 0: formattedSupply(value, 18, locale) });
  }
  if (field === "decimals") return tr("{0} 位小數", { 0: String(value) });
  if (["mintable", "paused", "upgradeable"].includes(field)) return value === false ? tr("否") : value === true ? tr("是") : String(value);
  if (field === "officialPair") return value === "no_pool" ? tr("尚未觀測到交易池") : value === "external_link_only" ? tr("僅有外部連結") : String(value);
  return String(value);
}

const fieldLabels: Record<string, string> = {
  totalSupply: "總供應量",
  decimals: "小數位",
  owner: "合約擁有者",
  mintable: "可增發",
  paused: "可暫停",
  buyTax: "買入手續費",
  sellTax: "賣出手續費",
  upgradeable: "可升級代理",
  officialPair: "官方交易池",
};

function statusLabel(status: string, tr: (source: string) => string) {
  const labels: Record<string, string> = {
    matched: "與發行時相符",
    changed: "與發行時不同",
    partial: "部分欄位可比較",
    unknown: "讀取失敗，請重試更新",
    unavailable: "讀取失敗，請重試更新",
    not_observed: "尚未觀測到交易池",
    not_applicable: "此模板不支援此欄位",
    stale: "資料可能已過期",
    fresh: "已更新",
    pending: "等待區塊確認",
    active: "鏈上已確認",
  };
  return tr(labels[status] || status);
}

export default function AssetRecordPage({ params }: { params: Promise<{ contract: string }> }) {
  const { contract } = use(params);
  const { tr, locale } = useLanguage();
  const { account, connect, config } = usePlatform();
  const previousFields = useRef<Record<string, string>>({});
  const [updatedFields, setUpdatedFields] = useState<string[]>([]);
  const [record, setRecord] = useState<AssetRecord | null>(null);
  const [events, setEvents] = useState<AssetEvent[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", logo: "", description: "", website: "", x: "", telegram: "", liquidity: "" });
  const contractAddress = isAddress(contract) ? contract.toLowerCase() : "";
  const isOfficialRvyn = contractAddress === RVYN_MODEL.contractMainnet.toLowerCase();
  const explorer = CHAINS[config.chainId].blockExplorers.default.url;

  const load = useCallback(async () => {
    if (!contractAddress) { setError(tr("合約地址格式無效。")); setLoading(false); return; }
    try {
      const [asset, history] = await Promise.all([
        api<AssetRecord>(`v1/assets/${contractAddress}`),
        api<{ events: AssetEvent[] }>(`v1/assets/${contractAddress}/history?limit=30`),
      ]);
      const nextFields = Object.fromEntries(asset.comparison.fields.map(field => [field.field, JSON.stringify(field.current)]));
      setUpdatedFields(Object.keys(nextFields).filter(field => field in previousFields.current && previousFields.current[field] !== nextFields[field]));
      previousFields.current = nextFields;
      setRecord(asset);
      setEvents(history.events);
      setForm({ name: asset.identity.name, logo: asset.identity.logo, description: asset.identity.description, website: asset.links.website, x: asset.links.x, telegram: asset.links.telegram, liquidity: asset.links.liquidity });
      setError("");
    } catch (reason) { setError(message(reason)); }
    finally { setLoading(false); }
  }, [contractAddress, tr]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function refreshState() {
    setRefreshing(true);
    try {
      if (!account) await connect();
      await api(`v1/assets/${contractAddress}/refresh`, {});
      await load();
    } catch (reason) { toast.error(message(reason)); }
    finally { setRefreshing(false); }
  }

  async function saveMetadata() {
    setSaving(true);
    try {
      if (!account) await connect();
      const next = await api<AssetRecord>(`v1/assets/${contractAddress}/metadata`, {
        name: form.name, logo: form.logo, description: form.description,
        links: { website: form.website, x: form.x, telegram: form.telegram, liquidity: form.liquidity },
      });
      setRecord(next);
      setEvents((await api<{ events: AssetEvent[] }>(`v1/assets/${contractAddress}/history?limit=30`)).events);
      setEditing(false);
      toast.success(tr("資產展示資料已更新，變更已記入歷史。"));
    } catch (reason) { toast.error(message(reason)); }
    finally { setSaving(false); }
  }

  if (loading) return <main className="workspace record-detail"><p className="record-state" role="status"><LoaderCircle className="spin" size={18} /> {tr("正在載入 Asset Record…")}</p></main>;
  if (error || !record) return <main className="workspace record-detail"><Link className="muted" href="/onchain-record"><ArrowLeft size={15} /> {tr("返回 Onchain Record")}</Link><div className="record-empty" role="alert"><h1>{tr("無法讀取資產紀錄")}</h1><p>{error || tr("找不到此資產。")}</p><button className="secondary" onClick={() => { setLoading(true); void load(); }}>{tr("重新載入")}</button></div></main>;

  const isCreator = Boolean(account && record.origin.creatorWallet && account.toLowerCase() === record.origin.creatorWallet.toLowerCase());
  const current = record.currentState;
  const syncStatus = current.syncStatus;
  const explorerContract = `${explorer}/token/${contractAddress}`;
  const launchExplorer = `${explorer}/tx/${record.origin.launchTx}`;
  const syncEvents = events.filter((event) => event.type === "state_refresh");
  const visibleEvents = events.filter((event) => event.type !== "state_refresh");
  const sourceLabel = (source: string) => tr(source === "robinhood-rpc" ? "鏈上讀取" : source.startsWith("legacy-") ? "歷史匯入" : source === "operator-correction" ? "紀錄更正" : "發行紀錄");
  async function copySummary() {
    if (!record) return;
    const supply = record?.canonicalState?.values.totalSupply ?? record?.originalState?.values.totalSupply;
    const decimals = record?.canonicalState?.values.decimals ?? record?.originalState?.values.decimals;
    const summary = [
      `${record.identity.name} (${record.identity.symbol})`,
      `Chain: ${record.asset.network} (${record.asset.chainId})`,
      `Contract: ${contractAddress}`,
      `Supply: ${formattedSupply(supply, decimals, "en-US")}`,
      `Liquidity: ${record.links.liquidityStatus === "no_pool" ? "No pool observed" : "External link only — no verified pool"}`,
      `Record: https://www.rovyncore.com${record.asset.url}`,
    ].join("\n");
    try { await navigator.clipboard.writeText(summary); toast.success(tr("已複製紀錄摘要"), { duration: 1600 }); }
    catch { toast.error(tr("無法複製紀錄摘要")); }
  }
  const renderEvents = (items: AssetEvent[]) => <ol className="record-timeline">{items.map((event) => <li key={event.id}>
    <span className={`record-history__source record-history__source--${event.source}`}>{tr(event.source === "observed" ? "鏈上觀測" : event.source === "platform" ? "平台事件" : event.source === "correction" ? "內部更正" : event.source === "creator" ? "創作者更新" : "系統事件")}</span>
    <div><strong>{tr(titleForEvent[event.type] || event.type)}</strong><p>{event.type === "correction" ? event.payload?.reason : event.type === "link_updated" ? tr("連結類型：{0}", { 0: event.payload?.linkType || "—" }) : event.type === "observed_state_change" ? tr("依前後兩次狀態快照差異記錄；不是全鏈事件索引。") : event.payload?.syncStatus === "unavailable" ? tr("目前無法取得新的 RPC 資料。") : event.payload?.syncStatus ? tr("狀態：{0}", { 0: statusLabel(event.payload.syncStatus, tr) }) : event.payload?.launchTx ? tr("交易 {0}", { 0: shortAddress(event.payload.launchTx) }) : tr("已追加至資產歷史。")}</p></div>
    <time dateTime={new Date(event.createdAt * 1000).toISOString()}>{new Date(event.createdAt * 1000).toLocaleString(locale)}</time>
  </li>)}</ol>;

  return (
    <main className="workspace record-detail">
      <Link className="muted record-back" href="/onchain-record"><ArrowLeft size={15} /> {tr("Onchain Record / 發射紀錄")}</Link>
      <header className="record-detail__heading">
        <div className="record-detail__title">
          <TokenAvatar name={record.identity.name || record.identity.symbol} logo={record.identity.logo} />
          <div><div className="eyebrow">{tr("ASSET RECORD / {0}", { 0: record.asset.network })}</div><h1>{record.identity.name}</h1><p>${record.identity.symbol} <span>· {record.identity.assetType.toUpperCase()}</span></p></div>
        </div>
        <span className={`record-status record-status--${record.recordStatus}`} title={record.recordStatus === "active" ? tr("發射交易已達設定的區塊確認門檻。") : undefined}><i />{statusLabel(record.recordStatus, tr)}</span>
      </header>
      <div className="record-heading-actions"><button className="secondary" onClick={() => void copySummary()}><Copy size={15} /> {tr("複製紀錄摘要")}</button></div>
      <ReadingNav className="record-detail__contents" label={tr("ASSET RECORD / {0}", { 0: record.asset.network })}>
        <a href="#record-identity">{tr("資產資料")}</a>
        <a href="#record-origin">{tr("發行來源")}</a>
        <a href="#record-original">{tr("發行時快照")}</a>
        <a href="#record-current">{tr("目前狀態與差異")}</a>
        <a href="#record-history-detail">{tr("紀錄歷史")}</a>
      </ReadingNav>

      {record.recordStatus === "pending" ? <div className="record-notice"><LoaderCircle className="spin" size={16} /> {tr("發射交易已收錄，正在等待設定的確認深度；紀錄暫不列入公開目錄。")}</div> : null}
      {record.recordStatus === "unavailable" ? <div className="record-notice is-warning"><CircleHelp size={16} /> {tr("偵測到交易區塊可能重組，紀錄已保留並標示暫不可用；不會靜默刪除。")}</div> : null}

      <div className="record-detail__layout">
        <div className="record-detail__main">
          <section className="record-panel" id="record-identity">
            <div className="record-panel__title"><div><span className="eyebrow">{tr("IDENTITY")}</span><h2>{tr("資產資料")}</h2></div>{isCreator && !editing ? <button className="text-button" onClick={() => setEditing(true)}><Pencil size={14} /> {tr("編輯展示資料")}</button> : null}</div>
            {editing ? <div className="record-edit-form">
              <label>{tr("顯示名稱")}<input maxLength={40} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
              <label>{tr("Logo 圖片路徑")}<input maxLength={120} placeholder="/api/media/..." value={form.logo} onChange={(event) => setForm({ ...form, logo: event.target.value })} /></label>
              <label>{tr("項目介紹")}<textarea rows={5} maxLength={2000} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
              <div className="record-edit-form__links">
                <label>{tr("Website")}<input type="url" placeholder="https://" value={form.website} onChange={(event) => setForm({ ...form, website: event.target.value })} /></label>
                <label>X<input type="url" placeholder="https://x.com/…" value={form.x} onChange={(event) => setForm({ ...form, x: event.target.value })} /></label>
                <label>Telegram<input type="url" placeholder="https://t.me/…" value={form.telegram} onChange={(event) => setForm({ ...form, telegram: event.target.value })} /></label>
                <label>{tr("外部流動性／交易連結")}<input type="url" placeholder="https://" value={form.liquidity} onChange={(event) => setForm({ ...form, liquidity: event.target.value })} /></label>
              </div>
              <p className="record-muted">{tr("名稱、Logo、介紹與連結屬展示資料；合約地址與初始快照不會由這個表單修改。連結不代表平台驗證。")}</p>
              <div className="record-actions"><button className="secondary" onClick={() => setEditing(false)}><X size={14} /> {tr("取消")}</button><button className="primary" disabled={saving || !form.name.trim() || form.description.trim().length < 10} onClick={() => void saveMetadata()}><Save size={14} />{saving ? tr("儲存中…") : tr("儲存並記錄變更")}</button></div>
            </div> : <>
              <p className="record-detail__description">{isOfficialRvyn ? rvynPublicCopy[locale].summary : record.identity.description || tr("創作者尚未提供項目介紹。")}</p>
              {isOfficialRvyn && locale !== "en" && record.identity.description ? <details className="record-detail__original-copy"><summary>{rvynPublicCopy[locale].originalLabel}</summary><p>{record.identity.description}</p></details> : null}
              <dl className="record-kv"><div><dt>{tr("合約地址")}</dt><dd><code>{contractAddress}</code><a href={explorerContract} target="_blank" rel="noreferrer" aria-label={tr("在區塊瀏覽器查看合約")}><ExternalLink size={14} /></a><button className="icon-button" aria-label={tr("複製合約地址")} onClick={() => navigator.clipboard.writeText(contractAddress).then(() => toast.success(tr("已複製合約地址")))}><Copy size={14} /></button></dd></div><div><dt>{tr("網路")}</dt><dd>{record.asset.network} · {record.asset.chainId}</dd></div></dl>
            </>}
          </section>

          <section className="record-panel" id="record-origin">
            <div className="record-panel__title"><div><span className="eyebrow">{tr("ORIGIN")}</span><h2>{tr("發行來源")}</h2></div></div>
            <dl className="record-kv record-kv--grid">
              <div><dt>{tr("創作者錢包")}</dt><dd><a href={`${explorer}/address/${record.origin.creatorWallet}`} target="_blank" rel="noreferrer">{shortAddress(record.origin.creatorWallet)} <ExternalLink size={12} /></a></dd></div>
              <div><dt>{tr("發行交易")}</dt><dd><a href={launchExplorer} target="_blank" rel="noreferrer">{shortAddress(record.origin.launchTx)} <ExternalLink size={12} /></a></dd></div>
              <div><dt>{tr("發行區塊")}</dt><dd>{record.origin.blockNumber.toLocaleString(locale)}</dd></div>
              <div><dt>{tr("部署器／版本")}</dt><dd>{record.origin.factoryAddress ? `${shortAddress(record.origin.factoryAddress)} · ${record.origin.factoryVersion || tr("版本未記錄")}` : record.origin.type === "legacy_import" ? `${tr("歷史匯入")} · ${record.origin.factoryVersion || tr("部署來源未回填")}` : `${tr("既有紀錄")} · ${record.origin.factoryVersion || tr("發行版本未回填")}`}</dd></div>
              <div><dt>{tr("發行時間")}</dt><dd>{new Date(record.origin.timestamp * 1000).toLocaleString(locale)}</dd></div>
            </dl>
          </section>

          <section className="record-panel" id="record-original">
            <div className="record-panel__title"><div><span className="eyebrow">{tr("ORIGINAL STATE")}</span><h2>{tr("發行時快照")}</h2></div><span className="record-tag">{tr("受保護 · v{0}", { 0: record.originalState?.version || 1 })}</span></div>
            {record.originalState ? <>
              <dl className="record-kv record-kv--grid">{Object.entries(record.originalState.values).map(([field, value]) => <div key={field}><dt>{tr(field === "totalSupply" ? "初始總供應量" : fieldLabels[field] || field)}</dt><dd>{valueForField(field, value, tr, locale)}</dd></div>)}</dl>
              <p className="record-muted" title={record.originalState.dataSource}>{tr("資料來源：{0} · 區塊 {1}。快照不覆寫；如需修正會另加更正紀錄。", { 0: sourceLabel(record.originalState.dataSource), 1: record.originalState.blockNumber ?? "—" })}</p>
            </> : <p className="record-muted">{tr("發行快照尚未可用。")}</p>}
            {record.correctionState ? <div className="record-correction-note"><strong>{tr("最新內部更正 · v{0}", { 0: record.correctionState.version })}</strong><dl className="record-kv record-kv--grid">{Object.entries(record.correctionState.values).map(([field, value]) => <div key={field}><dt>{tr(fieldLabels[field] || field)}</dt><dd>{valueForField(field, value, tr, locale)}</dd></div>)}</dl><p className="record-muted">{tr("原始快照仍完整保留；目前比較基準採用此更正版本，原因可在歷史紀錄核對。")}</p></div> : null}
          </section>

          <section className="record-panel" id="record-current">
            <div className="record-panel__title"><div><span className="eyebrow">{tr("CURRENT STATE / COMPARISON")}</span><h2>{tr("目前狀態與差異")}</h2></div><span className={`record-tag record-tag--${syncStatus}`}>{statusLabel(syncStatus, tr)}</span></div>
            <p className="record-muted">{tr("只列出此發行模板支援且已凍結的比較欄位；不推測安全性，也不提供風險分數。")}</p>
            <div className="record-compare">
              <div className="record-compare__head"><span>{tr("欄位")}</span><span>{record.comparison.baseline === "correction" ? tr("更正基準 v{0}", { 0: record.comparison.baselineVersion }) : tr("發行快照")}</span><span>{tr("目前鏈上／觀測")}</span><span>{tr("比較結果")}</span></div>
              {record.comparison.fields.map((field) => <div className="record-compare__row" key={`${field.field}-${current.lastSyncedAt}`} data-updated={updatedFields.includes(field.field)} data-different={field.status === "changed"}><strong>{tr(fieldLabels[field.field] || field.field)}</strong><span><small className="record-compare__label">{record.comparison.baseline === "correction" ? tr("更正基準 v{0}", { 0: record.comparison.baselineVersion }) : tr("發行快照")}</small>{valueForField(field.field, field.original, tr, locale)}</span><span><small className="record-compare__label">{tr("目前鏈上／觀測")}</small>{valueForField(field.field, field.current, tr, locale)}</span><span className={`comparison-state comparison-state--${field.status}`}>{statusLabel(field.status, tr)}</span></div>)}
              {record.comparison.fields.length === 0 ? <p className="record-muted">{tr("尚無已定義且可比較的欄位。")}</p> : null}
            </div>
            <p className="record-muted">{tr("比較狀態：{0}", { 0: statusLabel(record.comparisonStatus, tr) })}{current.lastSyncedAt ? ` · ${tr("最近同步 {0}", { 0: new Date(current.lastSyncedAt * 1000).toLocaleString(locale) })}` : ` · ${tr("尚未同步目前鏈上狀態")}`}</p>
            <button className="secondary" disabled={refreshing || record.recordStatus !== "active"} onClick={() => void refreshState()}><RefreshCw size={14} className={refreshing ? "spin" : ""} />{refreshing ? tr("同步中…") : tr("手動更新鏈上狀態")}</button>
          </section>

          <section className="record-panel" id="record-links">
            <div className="record-panel__title"><div><span className="eyebrow">{tr("EXTERNAL LINKS")}</span><h2>{tr("外部連結")}</h2></div></div>
            <div className="record-detail__links">
              {[["Website", record.links.website], ["X", record.links.x], ["Telegram", record.links.telegram]].filter((item) => item[1]).map(([label, url]) => <a key={String(label)} href={String(url)} target="_blank" rel="noreferrer">{tr(String(label))} <ArrowUpRight size={14} /></a>)}
              {record.links.liquidity ? <a href={record.links.liquidity} target="_blank" rel="noreferrer">{tr("創作者提供的交易連結")} <ArrowUpRight size={14} /></a> : null}
              {!record.links.website && !record.links.x && !record.links.telegram && !record.links.liquidity ? <span className="record-muted">{tr("尚無外部連結。")}</span> : null}
            </div>
            <p className="record-muted">{tr("流動性狀態：{0}", { 0: record.links.liquidityStatus === "external_link_only" ? tr("僅有創作者提供的外部連結；平台未驗證交易池。") : tr("尚未觀測到交易池。") })}</p>
          </section>

          <section className="record-panel record-history" id="record-history-detail">
            <div className="record-panel__title"><div><span className="eyebrow">{tr("HISTORY")}</span><h2>{tr("紀錄歷史")}</h2></div></div>
            {events.length ? <>
              {visibleEvents.length ? renderEvents(visibleEvents) : null}
              {syncEvents.length ? <MotionDisclosure className="record-history__sync" title={tr("顯示 {0} 筆鏈上狀態同步", { 0: syncEvents.length })}>{renderEvents(syncEvents)}</MotionDisclosure> : null}
            </> : <p className="record-muted">{tr("尚無可顯示的歷史事件。")}</p>}
            <p className="record-muted">{tr("V1 記錄平台事件與觀測到的狀態變更；不宣稱追蹤所有轉帳、持有人或 DEX 歷史。")}</p>
          </section>
          <div className="record-machine-links"><span>{tr("網站、JSON 與公開 API 使用同一份 Asset Record。")}</span><a href={`/api/v1/assets/${contractAddress}`} target="_blank" rel="noreferrer">{tr("開啟 JSON")} <ExternalLink size={13} /></a><Link href="/api/v1/assets" target="_blank">{tr("資產列表 API")} <ArrowUpRight size={13} /></Link></div>
        </div>

        <aside className="record-detail__side">
          <section className="record-panel"><span className="eyebrow">{tr("RECORD STATUS")}</span><dl className="record-kv"><div><dt>{tr("紀錄狀態")}</dt><dd>{statusLabel(record.recordStatus, tr)}</dd></div><div><dt>{tr("比較狀態")}</dt><dd>{statusLabel(record.comparisonStatus, tr)}</dd></div><div><dt>{tr("最近同步")}</dt><dd>{current.lastSyncedAt ? new Date(current.lastSyncedAt * 1000).toLocaleString(locale) : "—"}</dd></div><div><dt>{tr("資料來源")}</dt><dd title={record.dataSource}>{sourceLabel(record.dataSource)}</dd></div></dl><p className="record-muted"><Check size={13} /> {tr("可核對紀錄，不是安全認證或投資建議。")}</p></section>
          <a className="record-explorer" href={explorerContract} target="_blank" rel="noreferrer">{tr("在 Robinhood Chain Explorer 查看合約")} <ExternalLink size={15} /></a>
        </aside>
      </div>
    </main>
  );
}
