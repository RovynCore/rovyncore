"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "@/components/site-link";
import { Search, ArrowUpRight, Orbit, LoaderCircle, Wallet } from "lucide-react";
import { usePlatform } from "@/components/platform-context";
import { api, message } from "@/components/platform-provider";
import { TokenAvatar } from "@/components/token-actions";
import { shortAddress } from "@/packages/web3/config";
import { useLanguage } from "@/components/language-provider";
import { RVYN_MODEL } from "@/lib/rvyn-model";
import { rvynPublicCopy } from "@/lib/rvyn-public-copy";
import { Head, type Copy4 } from "@/components/rv/ui";

const q = (en: string, zhHant: string, zhHans: string, ko: string): Copy4 => ({ en, "zh-Hant": zhHant, "zh-Hans": zhHans, ko });
const C = {
  eyebrow: q("Onchain Records · Tool", "鏈上紀錄 · 工具", "链上记录 · 工具", "온체인 기록 · 도구"),
  title: q("Onchain Records", "鏈上紀錄", "链上记录", "온체인 기록"),
  source: q("RovynCore launches only · origin snapshot is immutable", "僅限 RovynCore 發射 · 起源快照不可覆寫", "仅限 RovynCore 发射 · 起源快照不可覆盖", "RovynCore 발행만 · 초기 스냅샷 변경 불가"),
  reset: q("Reset filters", "清除篩選", "清除筛选", "필터 초기화"),
  onlyOfficial: q("So far this archive holds the official RVYN record. Launches by other creators appear here automatically once they are confirmed.", "目前這裡只有官方的 RVYN 紀錄。其他創作者的發射確認後，會自動出現在這裡。", "目前这里只有官方的 RVYN 记录。其他创作者的发射确认后，会自动出现在这里。", "지금은 공식 RVYN 기록만 있습니다. 다른 크리에이터의 발행은 확인되면 자동으로 여기에 표시됩니다."),
  guideEyebrow: q("Reading a record", "閱讀紀錄", "阅读记录", "기록 읽는 법"),
};

const RECORDS_PER_PAGE = 12;
type RecordSummary = {
  asset: { contractAddress: string; recordStatus: string; createdAt: number };
  identity: { name: string; symbol: string; logo: string; description: string };
  origin: { creatorWallet: string; blockNumber: number };
  links: { liquidity: string; liquidityStatus: string };
};

export default function OnchainRecordDirectory() {
  const { account, connect } = usePlatform();
  const { tr, locale } = useLanguage();
  const [query, setQuery] = useState("");
  const [mineOnly, setMineOnly] = useState(false);
  const [records, setRecords] = useState<RecordSummary[]>([]);
  const [pinnedRecord, setPinnedRecord] = useState<RecordSummary | null>(null);
  const [pageCursors, setPageCursors] = useState<(string | null)[]>([null]);
  const [pageIndex, setPageIndex] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const requestId = useRef(0);
  const resultsRef = useRef<HTMLDivElement>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [resultHeight, setResultHeight] = useState<number>();
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      setMineOnly(new URLSearchParams(window.location.search).get("view") === "mine");
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const loadPage = useCallback(async (pageCursor: string | null, targetPage: number) => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError("");
    setResultHeight(resultsRef.current?.getBoundingClientRect().height);
    try {
      const params = new URLSearchParams({ limit: String(RECORDS_PER_PAGE) });
      if (query.trim()) params.set("q", query.trim());
      if (mineOnly) {
        if (!account) {
          if (currentRequest !== requestId.current) return;
          setRecords([]);
          setPinnedRecord(null);
          setNextCursor(null);
          setPageIndex(targetPage);
          return;
        }
        params.set("creator", account);
      }
      if (pageCursor) params.set("cursor", pageCursor);
      if (!query.trim() && !mineOnly) params.set("exclude", RVYN_MODEL.contractMainnet);
      const result = await api<{ assets: RecordSummary[]; nextCursor: string | null }>(`v1/assets?${params}`);
      const featured = !query.trim() && !mineOnly
        ? await api<{ assets: RecordSummary[] }>(`v1/assets?q=${RVYN_MODEL.contractMainnet}&limit=1`)
        : null;
      if (currentRequest !== requestId.current) return;
      setRecords(result.assets);
      setPinnedRecord(featured?.assets.find((record) => record.asset.contractAddress.toLowerCase() === RVYN_MODEL.contractMainnet.toLowerCase()) ?? null);
      setNextCursor(result.nextCursor);
      setPageIndex(targetPage);
      setRevision(value => value + 1);
    } catch (reason) {
      if (currentRequest === requestId.current) setError(message(reason));
    } finally {
      if (currentRequest === requestId.current) { setLoading(false); setHasLoaded(true); setResultHeight(undefined); }
    }
  }, [account, mineOnly, query]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setPageCursors([null]);
      void loadPage(null, 0);
    }, 180);
    return () => clearTimeout(timer);
  }, [loadPage]);

  function goToNextPage() {
    if (!nextCursor) return;
    const targetPage = pageIndex + 1;
    setPageCursors((current) => [...current.slice(0, targetPage), nextCursor]);
    void loadPage(nextCursor, targetPage);
  }

  function goToPreviousPage() {
    if (pageIndex === 0) return;
    const targetPage = pageIndex - 1;
    void loadPage(pageCursors[targetPage] ?? null, targetPage);
  }

  async function toggleMine() {
    if (!account) {
      try { await connect(); } catch (reason) { setError(message(reason)); return; }
    }
    setMineOnly((value) => !value);
  }

  const t = (c: Copy4) => c[locale];
  const card = (record: RecordSummary, pinned = false) => (
    <article key={record.asset.contractAddress} className={`rv-card${pinned ? " rv-card--accent" : ""} rv-card--link rv-reveal rv-stack`} style={{ ["--gap" as string]: "14px" }}>
      <Link className="rv-row" style={{ ["--gap" as string]: "14px", flexWrap: "nowrap" }} href={`/assets/robinhood/${record.asset.contractAddress}`}>
        <TokenAvatar name={record.identity.name || record.identity.symbol} logo={record.identity.logo} />
        <span style={{ display: "grid", minWidth: 0, flex: 1 }}><strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{record.identity.name}</strong><span className="rv-mono rv-small">${record.identity.symbol}</span></span>
        <ArrowUpRight size={16} aria-hidden="true" />
      </Link>
      <p className="rv-small" style={{ display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{record.asset.contractAddress.toLowerCase() === RVYN_MODEL.contractMainnet.toLowerCase() ? rvynPublicCopy[locale].summary : record.identity.description || tr("創作者尚未提供項目介紹。")}</p>
      <dl className="rv-kv">
        <div><dt>{tr("發行者")}</dt><dd className="rv-mono">{record.origin.creatorWallet ? shortAddress(record.origin.creatorWallet) : tr("未提供")}</dd></div>
        <div><dt>{tr("發行區塊")}</dt><dd className="rv-mono">{record.origin.blockNumber || "—"}</dd></div>
      </dl>
      {!pinned && <span className={`rv-pill${record.links.liquidityStatus === "external_link_only" ? " rv-pill--ok" : ""}`} style={{ justifySelf: "start" }}>{record.links.liquidityStatus === "external_link_only" ? tr("創作者提供外部交易連結") : tr("尚未觀測到交易池")}</span>}
    </article>
  );
  return (
    <main>
      <section className="rv-pagehead">
        <div className="rv-container rv-pagehead__inner">
          <div className="rv-pagehead__copy">
            <span className="rv-eyebrow">{t(C.eyebrow)}</span>
            <h1 className="rv-h1">{t(C.title)}</h1>
            <p className="rv-lead">{tr("每筆發射都留下來源、初始狀態與後續變化。這裡是紀錄，不是熱榜，也不代表平台背書。")}</p>
          </div>
          <div className="rv-pagehead__side">
            <span className="rv-pill rv-pill--plain">Robinhood Chain · 4663</span>
            <span className="rv-caption">{t(C.source)}</span>
          </div>
        </div>
      </section>

      <section className="rv-section--tight" style={{ paddingTop: 0 }}>
        <div className="rv-container rv-stack" style={{ ["--gap" as string]: "18px" }}>
          <div className="rv-row" aria-label={tr("資產紀錄篩選")} role="group">
            <label className="rv-search">
              <Search size={17} aria-hidden="true" />
              <input aria-label={tr("搜尋名稱、代號或合約")} placeholder={tr("搜尋名稱、代號或合約地址…")} value={query} onChange={(event) => { ++requestId.current; setLoading(true); setQuery(event.target.value); }} />
            </label>
            <button type="button" className={`rv-btn rv-btn--secondary${mineOnly ? " is-selected" : ""}`} aria-pressed={mineOnly} onClick={() => void toggleMine()}>
              <Wallet aria-hidden="true" />{mineOnly ? tr("全部發射紀錄") : tr("我的發射紀錄")}
            </button>
            <Link className="rv-btn rv-btn--primary" href="/launchpad">{tr("建立資產")}<ArrowUpRight aria-hidden="true" /></Link>
          </div>
          <p className="rv-caption" style={{ display: "flex", gap: 8, alignItems: "center" }}><Orbit size={14} aria-hidden="true" /> {tr("僅列出已達確認深度的 RovynCore 發射紀錄。項目資料及外部連結由創作者提供；流動性連結不代表平台驗證。")}</p>
          <div role="status" className="rv-small">{loading && <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}><LoaderCircle className="spin" size={15} />{tr("正在載入資產紀錄…")}</span>}</div>

          <div ref={resultsRef} aria-busy={loading} style={{ minHeight: resultHeight }}>
            <div className="rv-stack" style={{ ["--gap" as string]: "18px" }} key={revision}>
              {!loading && error ? <div className="rv-card rv-stack" role="alert"><h2 className="rv-h3">{tr("暫時無法讀取紀錄")}</h2><p className="rv-small">{error}</p><div><button type="button" className="rv-btn rv-btn--secondary" onClick={() => void loadPage(pageCursors[pageIndex] ?? null, pageIndex)}>{tr("重新載入")}</button></div></div> : null}
              {!loading && !error && mineOnly && !account ? <div className="rv-card rv-stack"><h2 className="rv-h3">{tr("連接錢包以查看你的發射紀錄")}</h2><p className="rv-small">{tr("紀錄仍是公開資料；錢包只用來篩選由你發行的資產。")}</p><div><button type="button" className="rv-btn rv-btn--primary" onClick={() => void connect().catch((reason) => setError(message(reason)))}><Wallet aria-hidden="true" />{tr("連接錢包")}</button></div></div> : null}
              {!loading && !error && !(mineOnly && !account) && records.length === 0 && !pinnedRecord ? <div className="rv-card rv-stack"><h2 className="rv-h3">{tr("目前沒有符合條件的發射紀錄")}</h2><p className="rv-small">{tr("不以示範代幣或虛構交易填補空列表。完成確認的發射會自動出現在這裡。")}</p><div className="rv-row">{(query.trim() || mineOnly) && <button type="button" className="rv-btn rv-btn--secondary" onClick={() => { setQuery(""); setMineOnly(false); }}>{t(C.reset)}</button>}<Link className="rv-btn rv-btn--secondary" href="/launchpad">{tr("前往 Launchpad")}<ArrowUpRight aria-hidden="true" /></Link></div></div> : null}

              {hasLoaded && !error && pinnedRecord ? <section className="rv-stack" style={{ ["--gap" as string]: "10px" }} aria-label={tr("RVYN 官方紀錄固定置頂")}>
                <span className="rv-stat__label">{tr("RVYN 官方 Token · 固定置頂")}</span>
                {card(pinnedRecord, true)}
              </section> : null}

              {hasLoaded && !error && (records.length > 0 || pinnedRecord) ? <div className="rv-row rv-row--between"><span className="rv-small">{pinnedRecord ? tr("本頁其他代幣紀錄 {0} 筆", { 0: records.length }) : tr("本頁顯示 {0} 筆紀錄", { 0: records.length })}</span><span className="rv-caption">{tr("第 {0} 頁 · 依建立時間排列", { 0: pageIndex + 1 })}</span></div> : null}
              {hasLoaded && !error && pinnedRecord && records.length === 0 && !query.trim() && !mineOnly ? <div className="rv-notice"><Orbit aria-hidden="true" /><span>{t(C.onlyOfficial)} <Link className="rv-link" href="/launchpad">{tr("前往 Launchpad")}</Link></span></div> : null}
              <div className="rv-grid rv-grid--3">{records.map((record) => card(record))}</div>
            </div>
          </div>

          {hasLoaded && !error && (pageIndex > 0 || nextCursor) ? <nav className="rv-row" style={{ justifyContent: "center" }} aria-label={tr("紀錄分頁")}>
            <button type="button" className="rv-btn rv-btn--secondary rv-btn--sm" disabled={pageIndex === 0 || loading} onClick={goToPreviousPage}>{tr("上一頁")}</button>
            <span className="rv-small">{tr("第 {0} 頁", { 0: pageIndex + 1 })}</span>
            <button type="button" className="rv-btn rv-btn--secondary rv-btn--sm" disabled={!nextCursor || loading} onClick={goToNextPage}>{tr("下一頁")}</button>
          </nav> : null}
        </div>
      </section>

      <section className="rv-section rv-section--line">
        <div className="rv-container">
          <Head eyebrow={t(C.guideEyebrow)} title={tr("如何閱讀這份紀錄")} />
          <div className="rv-grid rv-grid--3">
            <div className="rv-card rv-card--flat"><h3 className="rv-h3" style={{ fontSize: 17 }}>{tr("公開來源")}</h3><p className="rv-small" style={{ marginTop: 8 }}>{tr("發行者、交易與區塊資訊，協助你在瀏覽器核對來源。")}</p></div>
            <div className="rv-card rv-card--flat"><h3 className="rv-h3" style={{ fontSize: 17 }}>{tr("初始快照與目前狀態")}</h3><p className="rv-small" style={{ marginTop: 8 }}>{tr("發行時資料會保留；目前狀態另行觀測，兩者不會混成同一筆。")}</p></div>
            <div className="rv-card rv-card--flat"><h3 className="rv-h3" style={{ fontSize: 17 }}>{tr("項目資料由誰提供")}</h3><p className="rv-small" style={{ marginTop: 8 }}>{tr("名稱、介紹與外部連結由創作者提供；紀錄收錄不是平台安全認證。")}</p></div>
          </div>
        </div>
      </section>
    </main>
  );
}
