"use client";

// Features added on 2026-10-09: dispatch several teams at once, today's bridge ranking, a share card for a
// reveal. Plus the particle burst used by the reveal.
import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Rocket, Share2, X } from "lucide-react";
import {
  DESTINATIONS, DIVES_PER_DAY, DIVES_PER_TEAM_PER_DAY, basePoints, planDive, teamPower, type TeamInput,
} from "@/lib/lightdive-v3/rules";
import { TEXTS } from "@/lib/lightdive-v3/texts";
import { calm } from "./settings";
import { divesOn, passesOn, teamInput, teamName, teamOut, type Sim, type SimDive } from "./sim";
import { CIRCLED, ERROR, OUTCOME, OUTCOME_TONE, SLOT, STAR, outcomeName } from "./copy";
import { SupplyPrompt, rememberedSupply } from "./provisions";
import { unlocksOf } from "./unlocks";
import { openProfile } from "./logbook";
import { tl } from "@/lib/lightdive-v3/i18n";

const destName = (id: number) => TEXTS.clusters[DESTINATIONS[id].cluster].destinations[DESTINATIONS[id].slot].name;

// ---------------------------------------------------------------- 28. dispatch several teams at once

/** Picks a sensible default for a team: the destination with the best expected haul, attunement included. */
function bestDestination(sim: Sim, input: TeamInput) {
  const power = teamPower(input);
  let best = -1, value = -1;
  for (const d of DESTINATIONS) {
    if (power < d.threshold) continue;
    const plan = planDive(input, d, sim.sky);
    const v = basePoints(plan) * (1 - plan.levy);
    if (v > value) { value = v; best = d.id; }
  }
  return best;
}

export function Dispatch({ sim, onClose, onDeparted }: { sim: Sim; onClose: () => void; onDeparted: (id: number, card: number | undefined, dest: number) => void }) {
  const s = sim.state!;
  const left = DIVES_PER_DAY - passesOn(s, sim.today);
  const rows = s.teams
    .filter((t) => t.seekers.length > 0)
    .map((t) => {
      const input = teamInput(s, t);
      const spire = s.nfts.find((n) => n.id === t.spire)!;
      const busy = teamOut(s, t.spire);
      const today = passesOn(s, sim.today, t.spire);
      return { spire: t.spire, name: teamName(s, spire.id), power: teamPower(input), input, busy, full: today >= DIVES_PER_TEAM_PER_DAY, best: bestDestination(sim, input) };
    })
    .sort((a, b) => b.power - a.power);
  const [pick, setPick] = useState<Record<number, number>>(() => Object.fromEntries(rows.filter((r) => !r.busy && !r.full && r.best >= 0).slice(0, left).map((r) => [r.spire, r.best])));
  const [msg, setMsg] = useState<string | null>(null);
  const chosen = Object.entries(pick).filter(([, d]) => d >= 0);
  const [asking, setAsking] = useState(false);
  const go = async (supply: number) => {
    setAsking(false);
    const errors: string[] = [];
    const results = await sim.diveMany(chosen.map(([spire, dest]) => ({ spire: Number(spire), dest })), supply);
    results.forEach((r, i) => {
      if (r.error) errors.push(ERROR[r.error]);
      else onDeparted(r.id!, r.card, chosen[i][1]);
    });
    if (errors.length) setMsg([...new Set(errors)].join(" "));
    else onClose();
  };
  return (
    <div className="v3-modal" role="dialog" aria-label={tl("一次派遣")} onClick={onClose}>
      <div className="v3-modal__card v3-dispatch" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="v3-dest__close" onClick={onClose} aria-label={tl("關閉")}><X aria-hidden="true" /></button>
        <span className="hud-kicker">{tl("一次派遣")}</span>
        <h2>{tl("派出多支隊伍")}</h2>
        <p>{tl("每支隊伍已經預選「期望收益最高」的目的地（含同頻與出發成本），你可以改。今天還剩 {0} 張出發令。", { 0: left })}</p>
        <ul className="v3-dispatch__list">
          {rows.map((r) => {
            const on = pick[r.spire] !== undefined;
            const disabled = r.busy || r.full || (!on && chosen.length >= left);
            return (
              <li key={r.spire} className={on ? "is-on" : ""}>
                <label>
                  <input type="checkbox" checked={on} disabled={disabled} onChange={() => setPick((p) => { const n = { ...p }; if (on) delete n[r.spire]; else n[r.spire] = r.best; return n; })} />
                  <span><b>{r.name}</b><small>{tl("戰力 {0}", { 0: r.power })}{r.busy ? tl(" · 光橋上") : r.full ? tl(" · 今天已出發 3 次") : ""}</small></span>
                </label>
                <select className="hud-select" disabled={!on} value={pick[r.spire] ?? r.best} onChange={(e) => setPick((p) => ({ ...p, [r.spire]: Number(e.target.value) }))}>
                  {DESTINATIONS.filter((d) => r.power >= d.threshold).map((d) => (
                    <option key={d.id} value={d.id}>{CIRCLED[d.cluster]}{SLOT[d.slot]} {destName(d.id)}{sim.sky.events.get(d.id) ? tl("（{0}）", { 0: STAR[sim.sky.events.get(d.id)!].name }) : ""}{r.input.seekers.some((x) => x.light === sim.sky.lights[d.id]) ? tl(" · 同頻") : ""}</option>
                  ))}
                </select>
              </li>
            );
          })}
        </ul>
        {msg && <p className="v3-error" role="alert">{msg}</p>}
        <p className="hud-note">{tl("正式版會把這幾次出發合成一筆交易，只需要簽一次。")}</p>
        <button type="button" className="hud-btn hud-btn--primary hud-btn--block" disabled={!chosen.length} onClick={() => { const kept = unlocksOf(s).supplies ? rememberedSupply() : 0; if (kept !== null) void go(kept); else setAsking(true); }}><Rocket aria-hidden="true" />{tl("全部出發（{0} 張出發令）", { 0: chosen.length })}</button>
        {asking && <SupplyPrompt sim={sim} go={chosen.map(([spire, dest]) => ({ spire: Number(spire), dest }))} onConfirm={go} onClose={() => setAsking(false)} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- 29. today's bridge ranking

export function Ranking({ sim }: { sim: Sim }) {
  const s = sim.state!;
  const startOfDay = sim.today * 86_400_000;
  const hours = Math.max(1, Math.ceil((sim.now - startOfDay) / 3_600_000));
  const bucket = Math.floor(sim.now / 60_000);
  const others = useMemo(() => sim.feed(bucket * 60_000, 400, hours), [sim, bucket, hours]);
  const rows = [
    ...others.filter((o) => o.at >= startOfDay && o.outcome).map((o) => ({ id: o.id, who: o.who, owner: o.owner, dest: o.dest, mult: o.mult ?? 0, outcome: o.outcome!, me: false })),
    ...divesOn(s, sim.today).filter((d) => d.result).map((d) => ({ id: `me-${d.id}`, who: tl("你"), owner: undefined as string | undefined, dest: d.dest, mult: d.result!.multX100, outcome: d.result!.outcome as string, me: true })),
  ].sort((a, b) => b.mult - a.mult).slice(0, 15);
  if (!rows.length) return <p className="hud-dim hud-live__empty">{tl("今天還沒有揭曉的光橋。")}</p>;
  return (
    <ol className="v3-rank">
      {rows.map((r, i) => (
        <li key={r.id} className={r.me ? "is-mine" : ""}>
          <em>{i + 1}</em>
          <span>{r.owner ? <button type="button" className="v3-who" onClick={() => openProfile(r.owner)} title={tl("看這位觀測者的檔案")}>{r.who}</button> : <b>{r.who}</b>}<small>{CIRCLED[DESTINATIONS[r.dest].cluster]} {destName(r.dest)}</small></span>
          <strong style={{ color: OUTCOME_TONE[r.outcome as keyof typeof OUTCOME_TONE] }}>×{(r.mult / 100).toFixed(2)}</strong>
        </li>
      ))}
    </ol>
  );
}

// ---------------------------------------------------------------- 30. share card

function wrap(g: CanvasRenderingContext2D, text: string, x: number, y: number, max: number, line: number) {
  let row = "";
  for (const ch of text) {
    if (g.measureText(row + ch).width > max) { g.fillText(row, x, y); row = ch; y += line; } else row += ch;
  }
  g.fillText(row, x, y);
}

/** Draws a 1200x630 share image for a reveal (the size X uses for link cards). */
async function drawCard(d: SimDive, title?: string | null): Promise<HTMLCanvasElement> {
  const r = d.result!;
  const c = document.createElement("canvas");
  c.width = 1200; c.height = 630;
  const g = c.getContext("2d")!;
  const tone = OUTCOME_TONE[r.outcome];
  const load = async (src: string) => { const img = new Image(); img.src = src; await img.decode(); return img; };
  // the founder's share background (10-18): the left 55% stays clear for the text, Rovyn stands on the right
  g.fillStyle = "#020405"; g.fillRect(0, 0, 1200, 630);
  try { g.drawImage(await load("/lightdive/share-bg.webp"), 0, 0, 1200, 630); } catch {}
  const shade = g.createLinearGradient(0, 0, 700, 0);
  shade.addColorStop(0, "rgba(2,4,5,0.82)"); shade.addColorStop(1, "rgba(2,4,5,0)");
  g.fillStyle = shade; g.fillRect(0, 0, 700, 630);
  const glow = g.createRadialGradient(930, 330, 0, 930, 330, 280);
  glow.addColorStop(0, `${tone}aa`); glow.addColorStop(0.3, `${tone}44`); glow.addColorStop(1, "transparent");
  g.fillStyle = glow; g.fillRect(620, 0, 580, 630);
  const pose = d.turnedBack ? "guide" : r.outcome === "empty" ? "quiet" : r.outcome === "great" || r.outcome === "legend" || r.outcome === "good" ? "bright" : "guide";
  try { g.drawImage(await load(`/lightdive/npc/rovyn-pose-${pose}.webp`), 760, 60, 470, 574); } catch {}
  g.fillStyle = "#c9ff55"; g.font = "700 26px 'Chakra Petch', sans-serif";
  g.fillText(tl("LIGHTDIVE · 潛光遠征"), 70, 90);
  // the representative title, when the observer has one
  if (title) {
    g.font = "700 22px sans-serif";
    const w = g.measureText(title).width + 28;
    g.fillStyle = "rgba(240,199,102,0.16)"; g.fillRect(70, 108, w, 34);
    g.strokeStyle = "rgba(240,199,102,0.7)"; g.lineWidth = 1.5; g.strokeRect(70, 108, w, 34);
    g.fillStyle = "#f0c766"; g.fillText(title, 84, 133);
  }
  g.fillStyle = "#a3b39c"; g.font = "500 30px sans-serif";
  g.fillText(`${CIRCLED[DESTINATIONS[d.dest].cluster]} ${TEXTS.clusters[DESTINATIONS[d.dest].cluster].name} · ${destName(d.dest)}`, 70, title ? 185 : 160);
  g.fillStyle = tone; g.font = "900 96px sans-serif";
  g.fillText(outcomeName(d), 70, 290);
  g.font = "700 120px 'Chakra Petch', sans-serif";
  g.fillText(`×${(r.multX100 / 100).toFixed(2)}`, 70, 420);
  g.fillStyle = "#eaf3e1"; g.font = "500 28px sans-serif";
  wrap(g, tl("「{0}」", { 0: d.log }), 70, 490, 720, 40);
  g.fillStyle = "#66745f"; g.font = "500 20px sans-serif";
  const preview = typeof window !== "undefined" && window.location.pathname.includes("/preview");
  g.fillText(preview ? tl("ROVYN CORE · 測試版（預覽模式，結果為模擬）") : tl("ROVYN CORE · 潛光遠征測試網（測試幣，沒有價值）"), 70, 590);
  return c;
}

export function ShareButtons({ d, title }: { d: SimDive; title?: string | null }) {
  const [busy, setBusy] = useState(false);
  const download = async () => {
    setBusy(true);
    try {
      const c = await drawCard(d, title);
      const a = document.createElement("a");
      a.href = c.toDataURL("image/png");
      a.download = `lightdive-${d.id}.png`;
      a.click();
    } finally { setBusy(false); }
  };
  const text = tl("我在《潛光遠征》的「{0}」帶回了{1} ×{2}！", { 0: destName(d.dest), 1: OUTCOME[d.result!.outcome], 2: (d.result!.multX100 / 100).toFixed(2) });
  const intent = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent("https://www.rovyncore.com/game/lightdive")}`;
  return (
    <div className="v3-share">
      <button type="button" className="hud-btn hud-btn--ghost hud-btn--sm" onClick={download} disabled={busy}><Download aria-hidden="true" />{tl("下載分享圖")}</button>
      <a className="hud-btn hud-btn--ghost hud-btn--sm" href={intent} target="_blank" rel="noreferrer"><Share2 aria-hidden="true" />{tl("分享到 X")}</a>
    </div>
  );
}

// ---------------------------------------------------------------- server-wide broadcast

/** A banner when anyone (simulated others in the preview) brings back a legend or great result. */
export function Broadcast({ sim }: { sim: Sim }) {
  const bucket = Math.floor(sim.now / 15_000);
  const latest = useMemo(() => sim.feed(bucket * 15_000, 30, 2).filter((o) => o.outcome === "legend" || (o.outcome === "great" && (o.mult ?? 0) >= 280)), [sim, bucket]);
  const [shown, setShown] = useState<string | null>(null);
  const [seen] = useState(() => new Set(latest.map((o) => o.id)));
  const fresh = latest.find((o) => !seen.has(o.id) && sim.now - o.at < 10 * 60_000);
  useEffect(() => {
    if (!fresh) return;
    seen.add(fresh.id);
    const t1 = window.setTimeout(() => setShown(fresh.id), 0);
    const t2 = window.setTimeout(() => setShown(null), 6000);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); };
  }, [fresh, seen]);
  const item = latest.find((o) => o.id === shown);
  if (!item) return null;
  const d = DESTINATIONS[item.dest];
  return (
    <div className={`v3-broadcast is-${item.outcome}`} role="status">
      <b>{item.outcome === "legend" ? tl("核光回響！") : tl("大豐收！")}</b>
      <span>{tl("{0} 在 {1} {2} 帶回了 ×{3}", { 0: item.who, 1: CIRCLED[d.cluster], 2: destName(item.dest), 3: ((item.mult ?? 0) / 100).toFixed(2) })}</span>
    </div>
  );
}

// ---------------------------------------------------------------- reveal particles

/** A one-shot particle burst on a canvas laid over the reveal card; bigger results get more of everything. */
export function Burst({ tone, level }: { tone: string; level: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || level <= 0 || calm()) return;
    const g = c.getContext("2d")!;
    const w = (c.width = c.offsetWidth * 2), h = (c.height = c.offsetHeight * 2);
    const parts = Array.from({ length: 40 * level }, () => {
      const a = Math.random() * Math.PI * 2, v = (2 + Math.random() * 9) * (0.7 + level * 0.2);
      return { x: w / 2, y: h * 0.38, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2, life: 0, max: 50 + Math.random() * 50, r: 1 + Math.random() * 3, white: Math.random() < 0.3 };
    });
    let raf = 0;
    const tick = () => {
      g.clearRect(0, 0, w, h);
      g.globalCompositeOperation = "lighter";
      let alive = 0;
      for (const p of parts) {
        if (p.life > p.max) continue;
        alive++;
        p.life++; p.x += p.vx; p.y += p.vy; p.vx *= 0.97; p.vy = p.vy * 0.97 + 0.08;
        g.globalAlpha = 1 - p.life / p.max;
        g.fillStyle = p.white ? "#ffffff" : tone;
        g.beginPath(); g.arc(p.x, p.y, p.r * 2, 0, Math.PI * 2); g.fill();
      }
      if (alive) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [tone, level]);
  return <canvas ref={ref} className="v3-burst" aria-hidden="true" />;
}

