"use client";

// 營運數據 (10-19), on /admin/lightdive: the live game's numbers, read straight from the public chain events
// (lib/lightdive-v3/stats.ts). No database and nothing private: a player is only a wallet address. The numbers are
// worked out in the browser each time the page loads or "重新讀取" is pressed.
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPublicClient, http } from "viem";
import { gameChain } from "@/lib/lightdive-v3/deployment";
import { readStats, type Stats } from "@/lib/lightdive-v3/stats";
import { useLanguage } from "@/components/language-provider";
import { syncGameLocale, tl } from "@/lib/lightdive-v3/i18n";
import { CIRCLED, OUTCOME } from "./copy";
import "./admin-stats.css";

const n0 = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 0 });
const n2 = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 2 });
const pct = (v: number | null, of = 1) => (v === null || !of ? "—" : `${((v / of) * 100).toFixed(1)}%`);
const date = (day: number) => new Date(day * 86_400_000).toISOString().slice(5, 10);

export function AdminStats() {
  const { locale } = useLanguage();
  syncGameLocale(locale);
  const G = useMemo(() => gameChain(true), []);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(!!G.contracts);
  const fetchStats = useCallback(() => {
    const client = createPublicClient({ chain: G.chain, transport: http(G.rpcUrl) });
    return readStats({ client: client as never, c: G.contracts!, abi: G.abi, fromBlock: BigInt(G.deployment.deploymentBlock), multicall: G.multicall }, G.testToken);
  }, [G]);
  const failed = (e: unknown) => { console.warn("lightdive stats", e); setError(tl("讀取鏈上資料失敗，請稍後再試。")); };
  // the first read when the page opens
  useEffect(() => {
    if (!G.contracts) return;
    let dead = false;
    fetchStats().then((x) => { if (!dead) setStats(x); }).catch((e) => { if (!dead) failed(e); }).finally(() => { if (!dead) setBusy(false); });
    return () => { dead = true; };
  }, [fetchStats, G.contracts]);
  const load = async () => {
    setBusy(true);
    setError(null);
    try { setStats(await fetchStats()); } catch (e) { failed(e); } finally { setBusy(false); }
  };

  if (!G.contracts) return null;
  const t = stats?.totals;
  return (
    <section className="lds" lang={locale}>
      <header className="lds__head">
        <div>
          <h2>{tl("潛光 v3 營運數據")}</h2>
          <p>{tl("直接讀鏈上的公開紀錄計算，不需要資料庫，也不包含任何個人資料（玩家只是錢包地址）。{0}", { 0: G.testnet ? tl("目前是測試網。") : "" })}</p>
        </div>
        <button type="button" className="lds__btn" disabled={busy} onClick={() => void load()}>{busy ? tl("讀取中…") : tl("重新讀取")}</button>
      </header>
      {error && <p className="lds__error">{error}</p>}
      {!stats ? <p className="lds__dim">{busy ? tl("讀取鏈上資料…") : ""}</p> : (
        <>
          <p className="lds__dim">{tl("資料時間 {0}（UTC）", { 0: new Date(stats.readAt).toISOString().slice(0, 16).replace("T", " ") })}</p>

          <div className="lds__tiles">
            <Tile label={tl("玩過的錢包")} value={n0(stats.wallets)} sub={tl("今天出航 {0}", { 0: n0(stats.activeToday) })} />
            <Tile label={tl("次日留存")} value={pct(stats.retention.d1)} sub={tl("第 7 天 {0}", { 0: pct(stats.retention.d7) })} />
            <Tile label={tl("核光池")} value={n0(stats.pool)} sub={tl("今日分配率 {0}", { 0: stats.rate.toFixed(5) })} />
            <Tile label={tl("出航")} value={n0(t!.dives)} sub={t!.echoes ? tl("深潛 {0} · 光橋回聲 {1}", { 0: n0(t!.deep), 1: n0(t!.echoes) }) : tl("深潛 {0}", { 0: n0(t!.deep) })} />
            <Tile label={tl("召喚的卡")} value={n0(t!.summons)} sub={tl("{0} $RVYN", { 0: n2(t!.summonPaid) })} />
            <Tile label={tl("帶回（已扣出發成本）")} value={n2(t!.rewards)} sub={tl("出發成本 {0}", { 0: n2(t!.levy) })} />
            <Tile label={tl("提領")} value={n2(t!.claimed)} sub={tl("手續費 {0}", { 0: n2(t!.claimFees) })} />
            <Tile label={tl("銷毀")} value={n2(t!.burned)} sub="$RVYN" />
            <Tile label={tl("補給")} value={n0(t!.supplies[0] + t!.supplies[1])} sub={tl("燈油 {0} · 星圖 {1} · {2} $RVYN", { 0: t!.supplies[0], 1: t!.supplies[1], 2: n2(t!.supplyPaid) })} />
            <Tile label={tl("完成委託")} value={n0(t!.commissions)} sub={tl("獎勵 {0} $RVYN", { 0: n2(t!.commissionBonus) })} />
            <Tile label={tl("市集成交")} value={n0(t!.sales)} sub={tl("{0} $RVYN · 稅 {1}", { 0: n2(t!.salesVolume), 1: n2(t!.salesTax) })} />
            {G.testToken && <Tile label={tl("測試幣領取")} value={n0(t!.drips)} sub={tl("次")} />}
          </div>

          <h3 className="lds__row">{tl("最近 14 天")}<button type="button" className="lds__btn is-small" onClick={() => downloadCsv(stats)}>{tl("下載 CSV")}</button></h3>
          <div className="lds__scroll">
            <table className="lds__table">
              <thead>
                <tr>
                  <th>{tl("日期")}</th><th>{tl("出航的錢包")}</th><th>{tl("新錢包")}</th><th>{tl("出航")}</th><th>{tl("深潛")}</th>
                  <th>{tl("召喚")}</th><th>{tl("召喚 $RVYN")}</th><th>{tl("帶回 $RVYN")}</th><th>{tl("補給")}</th><th>{tl("委託")}</th><th>{tl("成交")}</th><th>{tl("分配率")}</th>
                </tr>
              </thead>
              <tbody>
                {stats.days.map((d) => (
                  <tr key={d.day} className={d.dives || d.summons ? "" : "is-quiet"}>
                    <td>{date(d.day)}</td><td>{n0(d.active)}</td><td>{n0(d.fresh)}</td><td>{n0(d.dives)}</td><td>{n0(d.deep)}</td>
                    <td>{n0(d.summons)}</td><td>{n2(d.summonPaid)}</td><td>{n2(d.rewards)}</td><td>{n0(d.supplies)}</td><td>{n0(d.commissions)}</td><td>{n0(d.sales)}</td>
                    <td>{d.rate === null ? "—" : d.rate.toFixed(5)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="lds__cols">
            <Split title={tl("出航的星團")} rows={stats.clusters.map((v, i) => [`${CIRCLED[i]}`, v])} />
            <Split title={tl("揭曉結果")} rows={Object.entries(stats.outcomes).sort((a, b) => b[1] - a[1]).map(([k, v]) => [(OUTCOME as Record<string, string>)[k] ?? k, v])} />
            <Split title={tl("召喚出的稀有度")} rows={[0, 1, 2, 3, 4].map((r) => [[tl("微光"), tl("輝脈"), tl("澄晶"), tl("稜光"), tl("曜核")][r], stats.rarities.reduce((a, k) => a + k[r], 0)])} />
          </div>
          <p className="lds__dim">{tl("留存：在某天第一次出現的錢包，隔天（或第 7 天）又出航或召喚的比例；只算已經過完那一天的錢包。")}</p>
        </>
      )}
    </section>
  );
}

/** The daily table as a CSV file (opens in any spreadsheet). */
function downloadCsv(stats: Stats) {
  const head = ["date", "active_wallets", "new_wallets", "dives", "deep_dives", "cards_summoned", "summon_rvyn", "brought_back_rvyn", "supplies", "supply_rvyn", "commissions", "sales", "sales_rvyn", "rate"];
  const rows = [...stats.days].reverse().map((d) => [new Date(d.day * 86_400_000).toISOString().slice(0, 10), d.active, d.fresh, d.dives, d.deep, d.summons, d.summonPaid.toFixed(4), d.rewards.toFixed(4), d.supplies, d.supplyPaid.toFixed(4), d.commissions, d.sales, d.salesVolume.toFixed(4), d.rate ?? ""]);
  const csv = [head, ...rows].map((r) => r.join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = `lightdive-stats-${new Date(stats.readAt).toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return <div className="lds__tile"><span>{label}</span><b>{value}</b>{sub && <small>{sub}</small>}</div>;
}

/** A share list: each row as blocks of a ten-block line (the game's rule: blocks, not bars). */
function Split({ title, rows }: { title: string; rows: [string, number][] }) {
  const total = rows.reduce((a, [, v]) => a + v, 0);
  return (
    <div className="lds__split">
      <b>{title}</b>
      {!total ? <p className="lds__dim">{tl("還沒有資料。")}</p> : (
        <ul>
          {rows.map(([k, v]) => {
            const on = Math.round((v / total) * 10);
            return (
              <li key={k}>
                <span>{k}</span>
                <i aria-hidden="true">{Array.from({ length: 10 }, (_, j) => <em key={j} className={j < on ? "is-on" : ""} />)}</i>
                <small>{n0(v)} · {pct(v, total)}</small>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
