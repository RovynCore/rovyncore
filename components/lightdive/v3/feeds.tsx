"use client";

// Corner panels for the summon and market pages (the wallet balance already sits in the top bar):
// a live feed of everyone's summons with the countdown to the next price update, and 渡 the dock keeper.
import { useState } from "react";
import { ODDS_BP, seeded, type Kind } from "@/lib/lightdive-v3/rules";
import { type Sim } from "./sim";
import { othersListings } from "./market-data";
import { RarityGem } from "./kit";
import { KIND, RARITY_COLOR, TIER, ago, clock, fmt } from "./copy";
import { tl, localized } from "@/lib/lightdive-v3/i18n";

const BUCKET = 40_000;

/** Simulated summons by other observers: a few a minute, the same for everyone at a given time. */
function summonsAround(now: number, count = 4) {
  const out: { id: number; who: string; kind: Kind; rarity: number; at: number }[] = [];
  const b = Math.floor(now / BUCKET);
  for (let k = 0; out.length < count && k < 30; k++) {
    const r = seeded((b - k) * 6151 + 11);
    if (r() < 0.25) continue; // some windows are quiet
    const kind = Math.floor(r() * 3) as Kind;
    let x = Math.floor(r() * 10000), rarity = 0;
    for (; rarity < 4; rarity++) { if (x < ODDS_BP[kind][rarity]) break; x -= ODDS_BP[kind][rarity]; }
    const addr = Math.floor(r() * 0xffffffff).toString(16).padStart(8, "0");
    out.push({ id: b - k, who: `0x${addr.slice(0, 4)}…${addr.slice(4)}`, kind, rarity, at: (b - k) * BUCKET + Math.floor(r() * BUCKET) });
  }
  return out.filter((x) => x.at <= now);
}

export function SummonFeed({ sim }: { sim: Sim }) {
  const list = summonsAround(sim.now);
  const nextDay = (sim.today + 1) * 86_400_000;
  return (
    <aside className="v3-feed" aria-label={tl("全服召喚動態")}>
      <header><span className="v3-feed__live" aria-hidden="true" />{tl("全服召喚動態")}</header>
      <ul>
        {list.map((x) => (
          <li key={x.id} style={{ ["--rc" as string]: RARITY_COLOR[x.rarity] }} className={x.rarity >= 3 ? "is-rare" : ""}>
            <RarityGem rarity={x.rarity} size={14} />
            <span><b>{x.who}</b> {tl("召喚到")} <em>{TIER[x.rarity]}{KIND[x.kind]}</em></span>
            <small>{ago(sim.now - x.at)}</small>
          </li>
        ))}
      </ul>
      <footer>{tl("價格每天 00:00 UTC 依流動池均價更新 · 倒數")} <b>{clock(nextDay - sim.now)}</b></footer>
    </aside>
  );
}

const DU_LINES = localized([
  "碼頭只負責點燈。價錢是賣的人定的，值不值得，是買的人看的。",
  "看戰力，看光紋，看還能走多遠。外表好不好看，也算數。",
  "每筆成交收二十分之一。大部分倒回核光池，一點點拿來點這盞燈。",
  "汐以前坐在這張椅子上。那張毯子我一直沒收起來。",
  "上架中的卡不能出發。想帶它出去，就先把它從攤子上拿下來。",
  "急著賣的人，價錢會寫得歪歪的。我都看得出來。",
  "有人一次買五張，有人在攤子前站一整晚。兩種我都喜歡。",
  "光塵餅是免費的。來過碼頭的人，不能空著手走。",
]);

export function DockKeeper({ sim }: { sim: Sim }) {
  const [i, setI] = useState(0);
  const day = Math.floor(sim.now / 86_400_000);
  const today = othersListings(day * 86_400_000 + 86_399_000, sim.state!.sold ?? []);
  const listed = today.filter((l) => l.listedAt <= sim.now).length;
  const sales = (sim.state!.sales ?? []).length;
  return (
    <aside className="v3-feed v3-keeper" aria-label={tl("碼頭看燈人・渡")}>
      <button type="button" className="v3-keeper__talk" onClick={() => setI((x) => x + 1)} aria-label={tl("點一下換一句")}>
        <span className="v3-keeper__lamp" aria-hidden="true"><i /></span>
        <span>
          <b>{tl("碼頭看燈人・渡")}</b>
          <q>{DU_LINES[i % DU_LINES.length]}</q>
          <small>{tl("點一下換一句")}</small>
        </span>
      </button>
      <footer>{tl("今天掛單")} <b>{listed}</b> {tl("筆 · 你成交過")} <b>{sales}</b> {tl("筆 · 平均掛價")} <b>{fmt(today.reduce((a, l) => a + l.price, 0) / Math.max(1, today.length))}</b> $RVYN</footer>
    </aside>
  );
}
