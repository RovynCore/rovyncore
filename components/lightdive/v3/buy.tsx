"use client";

// 購買 $RVYN: swap USDT, USDC or ETH for $RVYN on Robinhood Chain. The RVYN liquidity pool is not open yet, so this
// page shows the interface with clearly marked simulated quotes; the swap button stays off until the pool and its
// router are live (that launch needs the founder's go-ahead).
import { useState } from "react";
import { ArrowDownUp, ShieldCheck, Wallet } from "lucide-react";
import { PRICE } from "@/lib/lightdive-v3/rules";
import { PageHead } from "../game/hud";
import { Tile } from "./kit";
import { fmt } from "./copy";
import { tl } from "@/lib/lightdive-v3/i18n";

type Token = { sym: string; name: string; usd: number; decimals: number };
// simulated prices for the preview only
const TOKENS: Token[] = [
  { sym: "USDT", name: "Tether USD", usd: 1, decimals: 2 },
  { sym: "USDC", name: "USD Coin", usd: 1, decimals: 2 },
  { sym: "ETH", name: "Ether", usd: 2500, decimals: 4 },
];
const RVYN_USD = 0.1; // simulated
const SLIPPAGE = [0.005, 0.01, 0.02];

export function Buy() {
  const [from, setFrom] = useState(TOKENS[0]);
  const [amount, setAmount] = useState("10");
  const [slip, setSlip] = useState(SLIPPAGE[1]);
  const pay = Math.max(0, Number(amount) || 0);
  const usd = pay * from.usd;
  const impact = Math.min(0.15, usd / 200_000); // simulated depth
  const out = (usd / RVYN_USD) * (1 - impact) * (1 - 0.003);
  return (
    <div className="hud-page v3-buy">
      <PageHead kicker={tl("取得")} icon="rvyn" title={tl("購買 $RVYN")} lead={tl("在 Robinhood Chain 上用 USDT、USDC 或 ETH 直接換成 $RVYN。")} />
      <p className="v3-notice is-cap">{tl("$RVYN 流動池還沒開放。這一頁先展示介面，報價是模擬的，不能交易。")}</p>
      <div className="v3-buy__wrap">
        <section className="v3-swap" aria-label={tl("兌換")}>
          <div className="v3-swap__row">
            <span className="v3-swap__label">{tl("支付")}</span>
            <div className="v3-swap__field">
              <input type="number" min={0} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label={tl("支付數量")} />
              <select className="hud-select" value={from.sym} onChange={(e) => setFrom(TOKENS.find((t) => t.sym === e.target.value)!)} aria-label={tl("支付幣種")}>
                {TOKENS.map((t) => <option key={t.sym} value={t.sym}>{t.sym}</option>)}
              </select>
            </div>
            <small>≈ {tl("{0} USD · 餘額：連接錢包後顯示", { 0: fmt(usd) })}</small>
          </div>
          <span className="v3-swap__flip" aria-hidden="true"><ArrowDownUp /></span>
          <div className="v3-swap__row is-out">
            <span className="v3-swap__label">{tl("取得（估計）")}</span>
            <div className="v3-swap__field">
              <b>{fmt(out)}</b>
              <em>$RVYN</em>
            </div>
            <small>{tl("夠召喚約 {0} 位探索者（以開賣價 {1} $RVYN 計）", { 0: Math.floor(out / PRICE[2]), 1: fmt(PRICE[2]) })}</small>
          </div>
          <div className="v3-tiles is-2">
            <Tile label={tl("模擬價格")} value={`${fmt(RVYN_USD, 4)}`} sub={tl("USD／$RVYN · 1 {0} ≈ {1} $RVYN", { 0: from.sym, 1: fmt(from.usd / RVYN_USD) })} />
            <Tile label={tl("價格影響")} value={`${fmt(impact * 100)}%`} sub={tl("交易越大，影響越大")} tone={impact > 0.03 ? "#ff9d8a" : undefined} />
            <Tile label={tl("最少收到")} value={fmt(out * (1 - slip))} sub={tl("$RVYN · 滑價上限 {0}%", { 0: fmt(slip * 100, 1) })} />
            <Tile label={tl("手續費")} value="0.30%" sub={tl("流動池手續費＋少量網路費")} />
          </div>
          <div className="v3-swap__slip">
            <span>{tl("滑價上限")}</span>
            <div className="hud-seg" role="group" aria-label={tl("滑價上限")}>
              {SLIPPAGE.map((x) => <button key={x} type="button" className={slip === x ? "is-on" : ""} onClick={() => setSlip(x)}>{fmt(x * 100, 1)}%</button>)}
            </div>
          </div>
          <button type="button" className="hud-btn hud-btn--primary hud-btn--block v3-swap__go" disabled title={tl("流動池開放後啟用")}><Wallet aria-hidden="true" />{tl("流動池開放後啟用")}</button>
        </section>

        <aside className="v3-buy__side">
          <section className="v3-panel">
            <h3>{tl("$RVYN 用在哪裡")}</h3>
            <ul className="v3-buy__uses">
              <li><b>{tl("召喚")}</b><span>{tl("光塔 {0}、稜鏡 {1}、探索者 {2} $RVYN（開賣價，之後依流動池均價每天調整）", { 0: fmt(PRICE[0]), 1: fmt(PRICE[1]), 2: fmt(PRICE[2]) })}</span></li>
              <li><b>{tl("續航")}</b><span>{tl("停泊中的 NFT 付原價 50% 回滿航程，一次")}</span></li>
              <li><b>{tl("市集")}</b><span>{tl("向其他觀測者買光塔、稜鏡、探索者")}</span></li>
            </ul>
            <p className="v3-muted">{tl("遊戲裡只有 $RVYN 一種貨幣。出發令、航程是次數，不能買賣。")}</p>
          </section>
          <section className="v3-panel">
            <h3><ShieldCheck aria-hidden="true" />{tl("交易前請確認")}</h3>
            <ul className="v3-buy__uses">
              <li><b>{tl("網路")}</b><span>{tl("Robinhood Chain（主網 4663）")}</span></li>
              <li><b>{tl("合約地址")}</b><span>{tl("流動池開放時在透明度頁公布，只認那一個地址")}</span></li>
              <li><b>{tl("價格")}</b><span>{tl("$RVYN 價格會漲跌，沒有任何保證；只用你可以承受損失的金額")}</span></li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
