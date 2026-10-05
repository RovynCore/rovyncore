"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "@/components/site-link";
import { Search, ArrowUpRight, Orbit, LoaderCircle, Wallet } from "lucide-react";
import { usePlatform } from "@/components/platform-context";
import { api, message } from "@/components/platform-provider";
import { TokenAvatar } from "@/components/token-actions";
import { shortAddress } from "@/packages/web3/config";
import { useLanguage } from "@/components/language-provider";
import { RVYN_MODEL } from "@/lib/rvyn-model";
import { rvynPublicCopy } from "@/lib/rvyn-public-copy";
import { useScrollReveal } from "@/components/scroll-reveal";
import { ParticleField } from "@/components/visual/particle-field";
import type { ReactNode } from "react";

const RECORDS_PER_PAGE = 12;
type RecordSummary = {
  asset: { contractAddress: string; recordStatus: string; createdAt: number };
  identity: { name: string; symbol: string; logo: string; description: string };
  origin: { creatorWallet: string; blockNumber: number };
  links: { liquidity: string; liquidityStatus: string };
};

function RevealedRecordCard({ children, pinned = false, index = 0 }: { children: ReactNode; pinned?: boolean; index?: number }) {
  const [ref, revealClass, revealStyle] = useScrollReveal<HTMLElement>({ delay: Math.min(index, 5) * 70 });
  return <article ref={ref} className={`record-card${pinned ? " record-card--pinned" : ""} ${revealClass}`} style={revealStyle}>{children}</article>;
}

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

  return (
    <main className="workspace record-directory record-directory--retained-hero">
      <div className="eyebrow">{tr("CREATE / PUBLIC RECORD")}</div>
      <div className="title-row record-directory__heading">
        <div>
          <h1>{{en:"Onchain Records","zh-Hant":"鏈上紀錄","zh-Hans":"链上记录",ko:"온체인 기록"}[locale]}</h1>
          <p>{tr("每筆發射都留下來源、初始狀態與後續變化。這裡是紀錄，不是熱榜，也不代表平台背書。")}</p>
        </div>
        <div className="rc-explorer-hero-art" aria-hidden="true">
          <Image className="rc-explorer-hero-art__image" src="/visual-upgrade/explorer-network-v1.webp" alt="" width={1500} height={500} loading="eager" fetchPriority="high" />
          <ParticleField mode="explorer"/>
        </div>
      </div>

      <section className="record-directory__toolbar" aria-label={tr("資產紀錄篩選")}>
        <label className="search record-directory__search">
          <Search size={17} />
          <input aria-label={tr("搜尋名稱、代號或合約")} placeholder={tr("搜尋名稱、代號或合約地址…")} value={query} onChange={(event) => { ++requestId.current; setLoading(true); setQuery(event.target.value); }} />
        </label>
        <button type="button" className={mineOnly ? "secondary is-selected" : "secondary"} onClick={() => void toggleMine()}>
          <Wallet size={15} /> {mineOnly ? tr("全部發射紀錄") : tr("我的發射紀錄")}
        </button>
        <Link className="primary" href="/launchpad">{tr("建立資產")} <ArrowUpRight size={15} /></Link>
      </section>

      <p className="record-directory__note"><Orbit size={14} /> {tr("僅列出已達確認深度的 RovynCore 發射紀錄。項目資料及外部連結由創作者提供；流動性連結不代表平台驗證。")}</p>

      <div className="record-loading" role="status">{loading && <><LoaderCircle className="spin" size={15} />{tr("正在載入資產紀錄…")}</>}</div>
      <div ref={resultsRef} className="record-results" aria-busy={loading} style={{ minHeight: resultHeight }}>
      {loading && !hasLoaded && <div className="record-skeleton" aria-hidden="true"><i /><i /><i /></div>}
      <div className="record-results__content" key={revision}>
      {hasLoaded && !error && (records.length > 0 || pinnedRecord) ? <div className="record-directory__summary"><strong>{pinnedRecord ? tr("本頁其他代幣紀錄 {0} 筆", { 0: records.length }) : tr("本頁顯示 {0} 筆紀錄", { 0: records.length })}</strong><span>{tr("第 {0} 頁 · 依建立時間排列", { 0: pageIndex + 1 })}</span></div> : null}

      {!loading && error ? <div className="record-directory__empty" role="alert"><h2>{tr("暫時無法讀取紀錄")}</h2><p>{error}</p><button className="secondary" onClick={() => void loadPage(pageCursors[pageIndex] ?? null, pageIndex)}>{tr("重新載入")}</button></div> : null}
      {!loading && !error && mineOnly && !account ? <div className="record-directory__empty"><h2>{tr("連接錢包以查看你的發射紀錄")}</h2><p>{tr("紀錄仍是公開資料；錢包只用來篩選由你發行的資產。")}</p><button className="primary" onClick={() => void connect().catch((reason) => setError(message(reason)))}><Wallet size={15} /> {tr("連接錢包")}</button></div> : null}
      {!loading && !error && !(mineOnly && !account) && records.length === 0 && !pinnedRecord ? <div className="record-directory__empty"><h2>{tr("目前沒有符合條件的發射紀錄")}</h2><p>{tr("不以示範代幣或虛構交易填補空列表。完成確認的發射會自動出現在這裡。")}</p><div className="record-directory__empty-actions">{(query.trim() || mineOnly) && <button type="button" className="secondary" onClick={() => { setQuery(""); setMineOnly(false); }}>{{ en: "Reset filters", "zh-Hant": "清除篩選", "zh-Hans": "清除筛选", ko: "필터 초기화" }[locale]}</button>}<Link className="secondary" href="/launchpad">{tr("前往 Launchpad")} <ArrowUpRight size={15} /></Link></div></div> : null}

      {hasLoaded && !error && pinnedRecord ? <section className="record-directory__pinned" aria-label={tr("RVYN 官方紀錄固定置頂")}>
        <div className="record-directory__pinned-label">{tr("RVYN 官方 Token · 固定置頂")}</div>
        <RevealedRecordCard pinned key={pinnedRecord.asset.contractAddress}>
          <Link className="record-card__identity" href={`/assets/robinhood/${pinnedRecord.asset.contractAddress}`}>
            <TokenAvatar name={pinnedRecord.identity.name || pinnedRecord.identity.symbol} logo={pinnedRecord.identity.logo} />
            <span><strong>{pinnedRecord.identity.name}</strong><small>${pinnedRecord.identity.symbol}</small></span>
            <ArrowUpRight size={16} />
          </Link>
          <p>{rvynPublicCopy[locale].summary}</p>
          <dl>
            <div><dt>{tr("發行者")}</dt><dd>{pinnedRecord.origin.creatorWallet ? shortAddress(pinnedRecord.origin.creatorWallet) : tr("未提供")}</dd></div>
            <div><dt>{tr("發行區塊")}</dt><dd>{pinnedRecord.origin.blockNumber || "—"}</dd></div>
          </dl>
        </RevealedRecordCard>
      </section> : null}

      <div className="record-directory__grid">
        {records.map((record, index) => (
          <RevealedRecordCard index={index} key={`${record.asset.contractAddress}`}>
            <Link className="record-card__identity" href={`/assets/robinhood/${record.asset.contractAddress}`}>
              <TokenAvatar name={record.identity.name || record.identity.symbol} logo={record.identity.logo} />
              <span><strong>{record.identity.name}</strong><small>${record.identity.symbol}</small></span>
              <ArrowUpRight size={16} />
            </Link>
            <p>{record.asset.contractAddress.toLowerCase() === RVYN_MODEL.contractMainnet.toLowerCase() ? rvynPublicCopy[locale].summary : record.identity.description || tr("創作者尚未提供項目介紹。")}</p>
            <dl>
              <div><dt>{tr("發行者")}</dt><dd>{record.origin.creatorWallet ? shortAddress(record.origin.creatorWallet) : tr("未提供")}</dd></div>
              <div><dt>{tr("發行區塊")}</dt><dd>{record.origin.blockNumber || "—"}</dd></div>
            </dl>
            <span className={record.links.liquidityStatus === "external_link_only" ? "record-card__liquidity is-link" : "record-card__liquidity"}>
              {record.links.liquidityStatus === "external_link_only" ? tr("創作者提供外部交易連結") : tr("尚未觀測到交易池")}
            </span>
          </RevealedRecordCard>
        ))}
      </div>
      {hasLoaded && !error && (records.length > 0 || pinnedRecord) ? <section className="record-directory__guide" aria-label={tr("如何閱讀這份紀錄")}>
        <h2>{tr("如何閱讀這份紀錄")}</h2>
        <div><article><strong>{tr("公開來源")}</strong><p>{tr("發行者、交易與區塊資訊，協助你在瀏覽器核對來源。")}</p></article><article><strong>{tr("初始快照與目前狀態")}</strong><p>{tr("發行時資料會保留；目前狀態另行觀測，兩者不會混成同一筆。")}</p></article><article><strong>{tr("項目資料由誰提供")}</strong><p>{tr("名稱、介紹與外部連結由創作者提供；紀錄收錄不是平台安全認證。")}</p></article></div>
      </section> : null}
      </div></div>
      {hasLoaded && !error && (pageIndex > 0 || nextCursor) ? <nav className="record-directory__pagination" aria-label={tr("紀錄分頁")}>
        <button className="secondary" disabled={pageIndex === 0 || loading} onClick={goToPreviousPage}>{tr("上一頁")}</button>
        <span>{tr("第 {0} 頁", { 0: pageIndex + 1 })}</span>
        <button className="secondary" disabled={!nextCursor || loading} onClick={goToNextPage}>{tr("下一頁")}</button>
      </nav> : null}
    </main>
  );
}

