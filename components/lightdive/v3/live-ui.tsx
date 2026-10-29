"use client";

// The parts of the screen only the live game has: the wallet in the side rail, the strip that says what the player
// needs before they can play (connect, network, gas), the transaction panel, the bar that saves team changes, the
// reminder for summons still to be opened, and the test-token page of the testnet.
import { useState } from "react";
import { usePlatform } from "@/components/platform-context";
import { AlertTriangle, CheckCircle2, Droplets, ExternalLink, Loader2, Plug, Save, Sparkles, Undo2, Wallet, X, XCircle } from "lucide-react";
import { PageHead } from "../game/hud";
import { Tile } from "./kit";
import { ERROR, clock, fmt } from "./copy";
import { short } from "./chain";
import type { Game } from "./sim";
import { tl } from "@/lib/lightdive-v3/i18n";

const GAS_FAUCETS = [
  { name: "Robinhood Chain", url: "https://faucet.testnet.chain.robinhood.com" },
  { name: "Alchemy", url: "https://www.alchemy.com/faucets/robinhood-testnet" },
];

export function WalletBox({ sim }: { sim: Game }) {
  const ch = sim.chain!;
  if (!ch.account) {
    return <button type="button" className="hud-btn hud-btn--primary hud-btn--block" onClick={() => void ch.join()}><Wallet aria-hidden="true" />{tl("連接錢包")}</button>;
  }
  return (
    <div className="hud-wallet" title={ch.account}>
      <Wallet aria-hidden="true" />{short(ch.account)}
      <small>{ch.wrongChain ? tl("網路不對") : ch.chainName}</small>
    </div>
  );
}

/** What stands between the player and the game right now, one line at a time. */
export function ChainStrip({ sim, onFaucet }: { sim: Game; onFaucet: () => void }) {
  const ch = sim.chain!;
  const s = sim.state;
  if (!ch.ready) return <p className="v3-notice is-cap" role="status">{tl("合約部署中，遊戲即將開放。")}</p>;
  if (ch.failed && !ch.loaded) return <p className="v3-notice is-cap" role="alert">{tl("讀不到鏈上資料，稍後會自動重試。")} <button type="button" className="hud-btn hud-btn--ghost hud-btn--sm" onClick={() => void ch.reload()}>{tl("重試")}</button></p>;
  if (!ch.account) return <p className="v3-notice" role="status"><Plug aria-hidden="true" /> {tl("連接錢包就能開始玩：卡片、隊伍和收益都記在你的錢包。")} <button type="button" className="hud-btn hud-btn--primary hud-btn--sm" onClick={() => void ch.join()}>{tl("連接錢包")}</button></p>;
  if (ch.wrongChain) return <p className="v3-notice is-cap" role="alert"><AlertTriangle aria-hidden="true" /> {tl("錢包不在 {0}。", { 0: ch.chainName })} <button type="button" className="hud-btn hud-btn--primary hud-btn--sm" onClick={() => void ch.switchNetwork()}>{tl("切換網路")}</button></p>;
  if (ch.eth === 0) {
    return (
      <p className="v3-notice is-cap" role="status">
        <Droplets aria-hidden="true" /> {tl("錢包裡沒有手續費用的測試 ETH。先到水龍頭領一點（免費），再回來領測試 $RVYN。")}{" "}
        {GAS_FAUCETS.map((f) => <a key={f.url} className="hud-btn hud-btn--ghost hud-btn--sm" href={f.url} target="_blank" rel="noreferrer">{f.name}<ExternalLink aria-hidden="true" /></a>)}
      </p>
    );
  }
  if (ch.drip && s && s.balance < 20 && sim.now >= ch.drip.nextAt) {
    return (
      <p className="v3-notice" role="status">
        <Droplets aria-hidden="true" /> {tl("先領測試 $RVYN：每 24 小時可以領 {0}。", { 0: fmt(ch.drip.amount, 0) })}
        <button type="button" className="hud-btn hud-btn--primary hud-btn--sm" disabled={!!ch.tx?.running} onClick={() => void ch.drip!.run()}>{tl("領取 {0} tRVYN", { 0: fmt(ch.drip.amount, 0) })}</button>
        <button type="button" className="hud-btn hud-btn--ghost hud-btn--sm" onClick={onFaucet}>{tl("說明")}</button>
      </p>
    );
  }
  return null;
}

/** Each step of the current transaction: waiting for the wallet, on its way, done or failed. */
export function TxPanel({ sim }: { sim: Game }) {
  const ch = sim.chain!;
  const tx = ch.tx;
  if (!tx) return null;
  const icon = (st: string) => st === "done" ? <CheckCircle2 aria-hidden="true" /> : st === "failed" ? <XCircle aria-hidden="true" /> : st === "queued" ? <span className="v3-tx__dot" aria-hidden="true" /> : <Loader2 className="v3-spin" aria-hidden="true" />;
  const label = (st: string) => st === "wallet" ? tl("請在錢包確認") : st === "pending" ? tl("等待上鏈…") : st === "done" ? tl("完成") : st === "failed" ? tl("沒有完成") : tl("排隊中");
  return (
    <div className="v3-tx" role="status" aria-live="polite">
      <header>
        <b>{tx.running ? tl("交易進行中") : tx.error ? tl("交易沒有完成") : tl("交易完成")}</b>
        {!tx.running && <button type="button" className="hud-icon" onClick={ch.closeTx} aria-label={tl("關閉")}><X aria-hidden="true" /></button>}
      </header>
      <ol>
        {tx.steps.map((s, i) => (
          <li key={i} className={`is-${s.status}`}>
            {icon(s.status)}<span>{s.label}</span><small>{label(s.status)}</small>
            {s.hash && ch.explorer && <a href={`${ch.explorer}/tx/${s.hash}`} target="_blank" rel="noreferrer" aria-label={tl("在區塊瀏覽器查看")}><ExternalLink aria-hidden="true" /></a>}
          </li>
        ))}
      </ol>
      {tx.error && <p className="v3-error" role="alert">{ERROR[tx.error] ?? ERROR.chain}</p>}
    </div>
  );
}

/** Team changes are drafts until saved: one bar for all of them. */
export function DraftBar({ sim }: { sim: Game }) {
  const ch = sim.chain!;
  const [error, setError] = useState<string | null>(null);
  if (!ch.drafts.length) return null;
  const save = async () => {
    const e = await ch.saveTeams();
    setError(e ? ERROR[e] ?? ERROR.chain : null);
  };
  return (
    <div className="v3-draftbar" role="region" aria-label={tl("尚未儲存的隊伍")}>
      <span><b>{tl("{0} 支隊伍有變更，還沒上鏈", { 0: ch.drafts.length })}</b>{error ? <em>{error}</em> : <small>{tl("出發時會自動一起儲存，也可以現在先存。每支隊伍一筆交易。")}</small>}</span>
      <button type="button" className="hud-btn hud-btn--ghost hud-btn--sm" onClick={() => { ch.discardTeams(); setError(null); }}><Undo2 aria-hidden="true" />{tl("還原")}</button>
      <button type="button" className="hud-btn hud-btn--primary hud-btn--sm" onClick={() => void save()} disabled={!!ch.tx?.running}><Save aria-hidden="true" />{tl("儲存隊伍")}</button>
    </div>
  );
}

/** drand, the randomness every result waits for, is behind by a minute or more (P0-02). Nothing is lost: a dive or
 *  summon already fixed its round, and its result is that round's whenever drand publishes it. */
export function DrandBanner({ sim }: { sim: Game }) {
  const lag = sim.chain?.drandLag;
  if (lag === null || lag === undefined || lag < 60) return null;
  return (
    <div className="v3-draftbar is-drand" role="status">
      <span><b>{tl("隨機信標 drand 延遲中（約 {0} 分鐘）", { 0: Math.max(1, Math.round(lag / 60)) })}</b><small>{tl("揭曉會晚一點出現。已經出發或召喚的結果不受影響：它們用的那一輪早就固定了，drand 一公開就會揭曉。")}</small></span>
    </div>
  );
}

/** Summons whose drand round is late (v3.3: they open on their own as soon as drand publishes it; nothing to sign). */
export function SummonBar({ sim }: { sim: Game }) {
  const ch = sim.chain!;
  const due = (sim.state?.mints ?? []).filter((m) => sim.now >= m.revealAt + 15_000);
  if (!due.length || ch.tx?.running) return null;
  return (
    <div className="v3-draftbar is-summon" role="region" aria-label={tl("等待中的召喚")}>
      <span><b>{tl("{0} 次召喚在等 drand", { 0: due.length })}</b><small>{tl("卡片已經在你的錢包裡（封印中），drand 公開這一輪後就會自動揭曉，不用再簽錢包。")}</small></span>
      <button type="button" className="hud-btn hud-btn--ghost hud-btn--sm" onClick={() => void ch.reload()}><Sparkles aria-hidden="true" />{tl("重新整理")}</button>
    </div>
  );
}

/** Testnet only: test $RVYN from the faucet, gas from Robinhood's faucets, the token added to the wallet. */
export function Faucet({ sim }: { sim: Game }) {
  const ch = sim.chain!;
  const d = ch.drip;
  const platform = usePlatform();
  const [added, setAdded] = useState(false);
  const wait = d ? Math.max(0, d.nextAt - sim.now) : 0;
  // gas first only for a wallet that has none; otherwise the claim button comes first
  const needGas = !ch.account || !ch.eth;
  const gas = (
    <section className="v3-panel">
      <h3><Droplets aria-hidden="true" />{needGas ? tl("1. 領手續費用的測試 ETH") : tl("手續費用的測試 ETH")}</h3>
      <p>{tl("每筆交易都要一點點手續費。到 Robinhood Chain 測試網的水龍頭免費領取：")}</p>
      <p>{GAS_FAUCETS.map((f) => <a key={f.url} className="hud-btn hud-btn--ghost" href={f.url} target="_blank" rel="noreferrer">{f.name}<ExternalLink aria-hidden="true" /></a>)}</p>
    </section>
  );
  const watch = async () => {
    if (!ch.contracts) return;
    try {
      await platform.walletProvider().request({
        method: "wallet_watchAsset",
        params: { type: "ERC20", options: { address: ch.contracts.rvyn, symbol: "tRVYN", decimals: 18 } },
      } as never);
      setAdded(true);
    } catch { /* declined */ }
  };
  return (
    <div className="hud-page v3-buy">
      <PageHead kicker={tl("取得")} icon="rvyn" title={tl("測試幣")} lead={tl("測試網的遊戲用測試 $RVYN（tRVYN）遊玩，沒有任何價值，也不能換成真的 $RVYN。")} />
      <div className="v3-tiles is-3">
        <Tile label={tl("錢包裡的 tRVYN")} value={fmt(sim.state?.balance ?? 0)} />
        <Tile label={tl("手續費用的測試 ETH")} value={ch.eth === null ? "—" : fmt(ch.eth, 4)} tone={ch.eth === 0 ? "#ff9d8a" : undefined} />
        <Tile label={tl("每次可領")} value={d ? fmt(d.amount, 0) : "—"} sub={tl("每 24 小時一次")} />
      </div>
      {needGas && gas}
      <section className="v3-panel">
        <h3><Sparkles aria-hidden="true" />{needGas ? tl("2. 領測試 $RVYN") : tl("領測試 $RVYN")}</h3>
        {!ch.account ? (
          <button type="button" className="hud-btn hud-btn--primary" onClick={() => void ch.join()}><Wallet aria-hidden="true" />{tl("連接錢包")}</button>
        ) : (
          <>
            <button type="button" className="hud-btn hud-btn--gold" disabled={!d || wait > 0 || !!ch.tx?.running} onClick={() => void d?.run()}>
              {wait > 0 ? tl("{0} 後可以再領", { 0: clock(wait) }) : tl("領取 {0} tRVYN", { 0: fmt(d?.amount ?? 0, 0) })}
            </button>{" "}
            <button type="button" className="hud-btn hud-btn--ghost" onClick={() => void watch()}>{added ? tl("已加入錢包") : tl("把 tRVYN 加進錢包")}</button>
          </>
        )}
      </section>
      {!needGas && gas}
      <p className="v3-muted">{tl("合約尚未經過審計。測試網隨時可能重置，測試幣和測試卡片都不會轉到正式版。")}</p>
    </div>
  );
}
