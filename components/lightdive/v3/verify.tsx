"use client";

// 驗證一趟航程 (P0-02, 10-30): /game/lightdive/verify/<dive id>. Shows how a dive's result follows from its drand round,
// step by step, from public data only: the dive as recorded on chain, the round's signature from drand, the odds table
// the contract used, and the three numbers that pick the row, the multiplier and the wear. Then it compares the
// recomputation with the result written on chain (or says the next transaction will write exactly this one). No key,
// no wallet; the steps are in lib/lightdive-v3/verify.ts.
import { useEffect, useMemo, useState } from "react";
import { createPublicClient, formatEther, http } from "viem";
import { CheckCircle2, ShieldAlert } from "lucide-react";
import { DESTINATIONS } from "@/lib/lightdive-v3/rules";
import { TEXTS } from "@/lib/lightdive-v3/texts";
import { syncGameLocale, tl } from "@/lib/lightdive-v3/i18n";
import { useLanguage } from "@/components/language-provider";
import { gameChain } from "@/lib/lightdive-v3/deployment";
import { outcomeNameOf } from "@/lib/lightdive-v3/history";
import { DRAND_API, diveReward, drandSignature, events, readPlan, readWorld, roundTime, type ChainPlan, type Ctx, type Dive3 } from "@/lib/lightdive-v3/onchain";
import { explainDive, type DiveExplained } from "@/lib/lightdive-v3/verify";
import { OUTCOME } from "./copy";

type Onchain = { tier: number; multX100: number; wear: number; reward: bigint; fallbackUsed: boolean };
type Loaded = { dive: Dive3 & { owner: string }; plan: ChainPlan; signature: string | null; explained: DiveExplained | null; onchain: Onchain | null };

const hex = (n: bigint) => `0x${n.toString(16).padStart(64, "0")}`;
const destName = (id: number) => TEXTS.clusters[DESTINATIONS[id].cluster].destinations[DESTINATIONS[id].slot].name;

async function load(id: bigint): Promise<Loaded | "missing"> {
  const G = gameChain(true);
  if (!G.contracts) throw new Error("not deployed");
  const ctx: Ctx = { client: createPublicClient({ chain: G.chain, transport: http(G.rpcUrl), cacheTime: 0 }) as never, c: G.contracts, abi: G.abi, fromBlock: BigInt(G.deployment.deploymentBlock), multicall: G.multicall };
  const E = ctx.abi.Expedition3;
  const count = (await ctx.client.readContract({ address: ctx.c.expedition, abi: E, functionName: "diveCount" })) as bigint;
  if (id >= count) return "missing";
  const [world, info, echoed, revealed] = await Promise.all([
    readWorld(ctx, G.testToken),
    ctx.client.readContract({ address: ctx.c.expedition, abi: E, functionName: "diveInfo", args: [id] }) as Promise<Record<string, unknown>>,
    ctx.client.readContract({ address: ctx.c.expedition, abi: E, functionName: "echoed", args: [id] }).catch(() => false) as Promise<boolean>,
    events<Record<string, unknown>>(ctx, ctx.c.expedition, E, "Revealed", { diveId: id }),
  ]);
  const dive = {
    id, owner: String(info.owner), spire: BigInt(info.spire as bigint), day: Number(info.day), dest: Number(info.dest), beam: Number(info.beam), revealed: Boolean(info.revealed),
    power: Number(info.power), round: BigInt(info.round as bigint), pointsE2: BigInt(info.pointsE2 as bigint), rate: BigInt(info.rate as bigint),
    long: Boolean(info.long), attuned: Boolean(info.attuned), supply: Number(info.supply ?? 0), bond: Number(info.bond ?? 0), echo: echoed ? world.echoStability : 0,
  };
  const plan = await readPlan(ctx, dive, world.chartStability);
  const signature = Date.now() / 1000 >= roundTime(dive.round) ? await drandSignature(dive.round).catch(() => null) : null;
  const r = revealed[0]?.args;
  const onchain = r ? { tier: Number(r.tier), multX100: Number(r.multX100), wear: Number(r.wear), reward: BigInt(r.reward as bigint), fallbackUsed: Boolean(r.fallbackUsed) } : null;
  return { dive, plan, signature, explained: signature ? explainDive(plan, signature as `0x${string}`, id, dive.supply) : null, onchain };
}

export function VerifyDive({ id }: { id: string }) {
  syncGameLocale(useLanguage().locale);
  const valid = /^\d{1,12}$/.test(id);
  const [data, setData] = useState<Loaded | "missing" | "error" | null>(null);
  const [other, setOther] = useState("");
  useEffect(() => {
    if (!valid) return;
    let dead = false;
    load(BigInt(id)).then((d) => { if (!dead) setData(d); }).catch(() => { if (!dead) setData("error"); });
    return () => { dead = true; };
  }, [id, valid]);

  const go = (e: React.FormEvent) => { e.preventDefault(); if (/^\d{1,12}$/.test(other.trim())) window.location.href = `/game/lightdive/verify/${other.trim()}`; };
  const head = (
    <section className="rv-pagehead">
      <div className="rv-container rv-pagehead__copy">
        <span className="rv-eyebrow">{tl("驗證航程")}</span>
        <h1 className="rv-h1">{tl("航程 #{0} 是怎麼決定的", { 0: valid ? id : "—" })}</h1>
        <p className="rv-lead">{tl("每一趟的結果都由 drand 公開隨機數決定：出發時就固定用哪一輪，那一輪公開前沒有人（包括我們）知道它的值。下面每一步都只用公開資料，任何人都能自己重算。")}</p>
        <form className="rv-row" onSubmit={go} style={{ marginTop: 12, gap: 8 }}>
          <input className="rv-input" style={{ maxWidth: 180 }} inputMode="numeric" placeholder={tl("航程編號")} value={other} onChange={(e) => setOther(e.target.value)} aria-label={tl("航程編號")} />
          <button type="submit" className="rv-btn rv-btn--secondary rv-btn--sm">{tl("驗證另一趟")}</button>
        </form>
      </div>
    </section>
  );
  const body = !valid ? <p className="rv-body">{tl("航程編號不正確。")}</p>
    : data === null ? <p className="rv-body">{tl("從鏈上和 drand 讀取中…")}</p>
      : data === "missing" ? <p className="rv-body">{tl("目前的測試網上還沒有這一趟航程。")}</p>
        : data === "error" ? <p className="rv-body">{tl("讀不到鏈上資料，請稍後再試。")}</p>
          : <Steps d={data} />;
  return <main id="main">{head}<section className="rv-section--tight"><div className="rv-container rv-stack" style={{ ["--gap" as string]: "28px" }}>{body}</div></section></main>;
}

function Steps({ d }: { d: Loaded }) {
  const { dive, plan, signature, explained: e, onchain } = d;
  const name = (tier: number) => OUTCOME[outcomeNameOf(dive.dest, dive.day, dive.beam, dive.long, tier) as keyof typeof OUTCOME] ?? String(tier);
  const reward = useMemo(() => (e ? diveReward(dive.pointsE2, e.multX100, dive.rate, plan.levyBp).reward : 0n), [e, dive, plan]);
  const t = new Date(roundTime(dive.round) * 1000).toISOString().replace("T", " ").slice(0, 19);
  const match = e && onchain && !onchain.fallbackUsed && onchain.tier === e.tier && onchain.multX100 === e.multX100 && onchain.wear === e.wear;
  return (
    <>
      <div className="rv-card rv-stack" style={{ ["--gap" as string]: "10px" }}>
        <span className="rv-eyebrow">1</span>
        <h2 className="rv-h3">{tl("這趟航程（鏈上紀錄）")}</h2>
        <dl className="rv-kv">
          <div><dt>{tl("出發者")}</dt><dd className="rv-mono">{dive.owner}</dd></div>
          <div><dt>{tl("目的地")}</dt><dd>{destName(dive.dest)}{dive.long ? ` · ${tl("深潛")}` : ""}</dd></div>
          <div><dt>{tl("指定的 drand 輪次")}</dt><dd className="rv-mono">#{String(dive.round)} · {t} UTC</dd></div>
        </dl>
      </div>

      <div className="rv-card rv-stack" style={{ ["--gap" as string]: "10px" }}>
        <span className="rv-eyebrow">2</span>
        <h2 className="rv-h3">{tl("drand 公開的簽章")}</h2>
        {signature && e ? (
          <dl className="rv-kv">
            <div><dt>{tl("簽章")}</dt><dd className="rv-mono" style={{ wordBreak: "break-all" }}><a href={`${DRAND_API}/${dive.round}`} target="_blank" rel="noreferrer">{signature}</a></dd></div>
            <div><dt>{tl("隨機數 = sha256(簽章)")}</dt><dd className="rv-mono" style={{ wordBreak: "break-all" }}>{e.randomness}</dd></div>
            <div><dt>{tl("混入航程編號 = keccak256(隨機數, 航程編號)")}</dt><dd className="rv-mono" style={{ wordBreak: "break-all" }}>{hex(e.r)}</dd></div>
          </dl>
        ) : <p className="rv-body">{tl("這一輪還沒公開。公開後重新整理這頁，就能看到結果是怎麼算出來的。")}</p>}
      </div>

      {e && (
        <div className="rv-card rv-stack" style={{ ["--gap" as string]: "10px" }}>
          <span className="rv-eyebrow">3</span>
          <h2 className="rv-h3">{tl("用這個數字查勝算表")}</h2>
          <p className="rv-body">{tl("取最後一段：{0} 除以 10000 的餘數是 {1}。落在哪一列，就是哪個結果。", { 0: tl("混入後的數字"), 1: e.roll })}</p>
          <div className="rv-table-wrap">
            <table className="rv-table">
              <thead><tr><th>{tl("結果")}</th><th>{tl("機率")}</th><th>{tl("落點範圍")}</th><th>{tl("倍率範圍")}</th></tr></thead>
              <tbody>
                {e.rows.map((row) => (
                  <tr key={row.tier} style={row.hit ? { background: "rgba(155, 227, 107, 0.08)" } : undefined}>
                    <td>{row.hit ? <strong>{name(row.tier)} ←</strong> : name(row.tier)}</td>
                    <td className="rv-mono">{(row.probBp / 100).toFixed(2)}%</td>
                    <td className="rv-mono">{row.probBp ? `${row.from}–${row.to}` : "—"}</td>
                    <td className="rv-mono">×{(row.lo / 100).toFixed(2)}–×{(row.hi / 100).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="rv-body">{tl("倍率：往右移 128 位、除以這一列倍率範圍的格數取餘數得 {0}，所以是 ×{1}。", { 0: String(e.multRoll), 1: (e.multX100 / 100).toFixed(2) })}</p>
          <p className="rv-body">{e.lampOil ? tl("耗損：這趟帶了燈油，耗損固定 1 次航程。") : tl("耗損：往右移 64 位除以 10000 取餘數得 {0}；小於 {1} 耗損 3，小於 {2} 耗損 2，否則耗損 1，所以耗損 {3}。", { 0: e.wearRoll, 1: plan.wear3Bp, 2: plan.wear3Bp + plan.wear2Bp, 3: e.wear })}</p>
          <p className="rv-body">{tl("帶回（已扣出發成本）：{0} $RVYN", { 0: Number(formatEther(reward)).toFixed(4) })}</p>
        </div>
      )}

      <div className={`rv-notice ${match || (e && !onchain) ? "rv-notice--ok" : "rv-notice--risk"}`}>
        {match || (e && !onchain) ? <CheckCircle2 aria-hidden="true" /> : <ShieldAlert aria-hidden="true" />}
        <span>
          {onchain?.fallbackUsed ? tl("這趟沒有人送出 drand 證明，由主人用保底結算：空手而歸、耗損最多。保底永遠不會比正常抽到的好。")
            : match ? tl("一致：重算的結果和鏈上紀錄完全相同（{0} ×{1}，耗損 {2}）。", { 0: name(e!.tier), 1: (e!.multX100 / 100).toFixed(2), 2: e!.wear })
              : e && !onchain ? tl("這趟還沒寫入鏈上：結果已經由 drand 決定，就是上面算出的 {0} ×{1}。下一筆交易寫入時，合約會用同一個簽章得到同一個結果。", { 0: name(e.tier), 1: (e.multX100 / 100).toFixed(2) })
                : onchain && e ? tl("不一致：鏈上紀錄是 {0} ×{1}，重算是 {2} ×{3}。請回報給我們。", { 0: name(onchain.tier), 1: (onchain.multX100 / 100).toFixed(2), 2: name(e.tier), 3: (e.multX100 / 100).toFixed(2) })
                  : tl("等 drand 公開這一輪後才能比對。")}
        </span>
      </div>
      <p className="rv-caption">{tl("勝算表由合約 LightdiveConfig3.plan 依目的地、戰力、光束、當天星象、默契、補給與光橋回聲算出；計算步驟和 Expedition3 結算時完全相同。合約未經審計。")}</p>
    </>
  );
}
