"use client";

// 觀測者名片 (10-19): the profile as a 1200x630 share image — the representative title, the career in numbers and the
// card that stands for the observer, painted on its own scene. Honour only, like the profile itself.
import { useState } from "react";
import { Download, Share2 } from "lucide-react";
import { DESTINATIONS } from "@/lib/lightdive-v3/rules";
import { TEXTS } from "@/lib/lightdive-v3/texts";
import { tl } from "@/lib/lightdive-v3/i18n";
import { CIRCLED, KIND, RARITY, RARITY_COLOR, SLOT } from "./copy";
import { sceneImage } from "./cards";
import type { Records } from "./logbook";
import type { SimNft } from "./sim";

const painting = (n: SimNft) =>
  n.kind === 0 ? `/lightdive/cards/spire-r${n.rarity}.webp` : n.kind === 1 ? `/lightdive/cards/prism-b${n.trait}-r${n.rarity}.webp` : `/lightdive/cards/seeker-l${n.trait}-r${n.rarity}.webp`;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

async function drawProfile(r: Records, best: string | null, top: SimNft | undefined, address: string | null): Promise<HTMLCanvasElement> {
  const c = document.createElement("canvas");
  c.width = 1200; c.height = 630;
  const g = c.getContext("2d")!;
  const load = (src: string) => new Promise<HTMLImageElement>((ok, no) => { const img = new Image(); img.onload = () => ok(img); img.onerror = no; img.src = src; }); // onload, not decode(): decode never settles in a hidden tab
  const cover = (img: HTMLImageElement, x: number, y: number, w: number, h: number) => {
    const s = Math.max(w / img.width, h / img.height), iw = img.width * s, ih = img.height * s;
    g.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
  };
  const tone = top ? RARITY_COLOR[top.rarity] : "#c9ff55";
  g.fillStyle = "#020405"; g.fillRect(0, 0, 1200, 630);
  try { cover(await load(top ? sceneImage(top.kind, top.trait) : "/lightdive/share-bg.webp"), 0, 0, 1200, 630); } catch {}
  const shade = g.createLinearGradient(0, 0, 820, 0);
  shade.addColorStop(0, "rgba(2,4,5,0.92)"); shade.addColorStop(0.75, "rgba(2,4,5,0.7)"); shade.addColorStop(1, "rgba(2,4,5,0.15)");
  g.fillStyle = shade; g.fillRect(0, 0, 1200, 630);

  // the card on the right: its frame in the rarity colour, the painting inside
  if (top) {
    const x = 830, y = 70, w = 320, h = 427;
    const glow = g.createRadialGradient(x + w / 2, y + h / 2, 0, x + w / 2, y + h / 2, 300);
    glow.addColorStop(0, `${tone}55`); glow.addColorStop(1, "transparent");
    g.fillStyle = glow; g.fillRect(x - 160, y - 120, w + 320, h + 240);
    g.fillStyle = "rgba(4,8,10,0.85)"; g.fillRect(x, y, w, h);
    try { cover(await load(sceneImage(top.kind, top.trait)), x, y, w, h); } catch {}
    g.fillStyle = "rgba(2,4,5,0.35)"; g.fillRect(x, y, w, h);
    try {
      const img = await load(painting(top));
      const s = Math.min((w - 20) / img.width, (h - 20) / img.height);
      g.drawImage(img, x + (w - img.width * s) / 2, y + h - img.height * s - 6, img.width * s, img.height * s);
    } catch {}
    g.strokeStyle = tone; g.lineWidth = 3; g.strokeRect(x, y, w, h);
    g.fillStyle = tone; g.font = "700 22px sans-serif"; g.textAlign = "center";
    g.fillText(`${RARITY[top.rarity]} ${KIND[top.kind]} #${top.id}`, x + w / 2, y + h + 40);
    g.fillStyle = "#a3b39c"; g.font = "500 18px sans-serif";
    g.fillText(tl("戰力 {0}", { 0: top.power }), x + w / 2, y + h + 68);
    g.textAlign = "left";
  }

  g.fillStyle = "#c9ff55"; g.font = "700 24px 'Chakra Petch', sans-serif";
  g.fillText(tl("LIGHTDIVE · 潛光遠征"), 70, 86);
  g.fillStyle = "#eaf3e1"; g.font = "700 34px sans-serif";
  g.fillText(address ? tl("觀測者 {0}", { 0: short(address) }) : tl("觀測者"), 70, 146);
  // the representative title as a gold plate
  const title = best ?? tl("還沒有稱號");
  g.font = "800 52px sans-serif";
  const tw = Math.min(700, g.measureText(title).width + 44);
  g.fillStyle = "rgba(240,199,102,0.14)"; g.fillRect(70, 172, tw, 76);
  g.strokeStyle = "rgba(240,199,102,0.75)"; g.lineWidth = 2; g.strokeRect(70, 172, tw, 76);
  g.fillStyle = best ? "#f0c766" : "#8a958a"; g.fillText(title, 92, 229, tw - 44);

  // the career in six numbers
  const deepest = r.deepest === null ? "—" : `${CIRCLED[DESTINATIONS[r.deepest].cluster]}${SLOT[DESTINATIONS[r.deepest].slot]}`;
  const stats: [string, string][] = [
    [tl("收下的結果"), String(r.dives)],
    [tl("到過的目的地"), `${r.places} / 24`],
    [tl("最深到達"), deepest],
    [tl("最高倍率"), r.bestMult ? `×${(r.bestMult / 100).toFixed(2)}` : "—"],
    [tl("傳說"), String(r.legends)],
    [tl("首航次數"), String(r.firsts)],
  ];
  stats.forEach(([label, value], i) => {
    const x = 70 + (i % 3) * 240, y = 300 + Math.floor(i / 3) * 120;
    g.fillStyle = "rgba(255,255,255,0.04)"; g.fillRect(x, y, 220, 100);
    g.strokeStyle = "rgba(201,255,85,0.25)"; g.lineWidth = 1; g.strokeRect(x, y, 220, 100);
    g.fillStyle = "#8fa088"; g.font = "500 18px sans-serif"; g.fillText(label, x + 16, y + 32);
    g.fillStyle = "#eaf3e1"; g.font = "700 38px 'Chakra Petch', sans-serif"; g.fillText(value, x + 16, y + 80, 190);
  });
  if (r.deepest !== null) {
    g.fillStyle = "#66745f"; g.font = "500 18px sans-serif";
    g.fillText(tl("最深：{0} · {1}", { 0: TEXTS.clusters[DESTINATIONS[r.deepest].cluster].name, 1: TEXTS.clusters[DESTINATIONS[r.deepest].cluster].destinations[DESTINATIONS[r.deepest].slot].name }), 70, 560);
  }
  g.fillStyle = "#66745f"; g.font = "500 18px sans-serif";
  const preview = typeof window !== "undefined" && window.location.pathname.includes("/preview");
  g.fillText(preview ? tl("ROVYN CORE · 測試版（預覽模式，結果為模擬）") : tl("ROVYN CORE · 潛光遠征測試網（測試幣，沒有價值）"), 70, 596);
  return c;
}

/** The profile's share buttons: download the card, or post it to X with a link to the profile. */
export function ProfileShare({ r, best, top, address }: { r: Records; best: string | null; top: SimNft | undefined; address: string | null }) {
  const [busy, setBusy] = useState(false);
  const download = async () => {
    setBusy(true);
    try {
      const c = await drawProfile(r, best, top, address);
      const a = document.createElement("a");
      a.href = c.toDataURL("image/png");
      a.download = `lightdive-observer${address ? `-${address.slice(2, 8)}` : ""}.png`;
      a.click();
    } finally { setBusy(false); }
  };
  const text = best ? tl("我在《潛光遠征》的代表稱號是「{0}」。", { 0: best }) : tl("我在《潛光遠征》的觀測紀錄。");
  const url = address ? `https://www.rovyncore.com/game/lightdive#logbook=${address}` : "https://www.rovyncore.com/game/lightdive";
  const intent = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
  return (
    <div className="v3-share">
      <button type="button" className="hud-btn hud-btn--ghost hud-btn--sm" onClick={download} disabled={busy}><Download aria-hidden="true" />{tl("下載觀測者名片")}</button>
      <a className="hud-btn hud-btn--ghost hud-btn--sm" href={intent} target="_blank" rel="noreferrer"><Share2 aria-hidden="true" />{tl("分享到 X")}</a>
    </div>
  );
}
