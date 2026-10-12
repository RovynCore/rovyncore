"use client";

// Settings: sound, effects quality with a measured performance check, calm mode, language, and preview tools.
import { useEffect, useRef, useState } from "react";
import { BellRing, Gauge, Languages, MonitorPlay, RotateCcw, Volume2 } from "lucide-react";
import { PageHead } from "../game/hud";
import { play, useVolume } from "./audio";
import { setAlerts, setCalm, setFxQuality, useSettings, type FxQuality } from "./settings";
import { AlertsSwitch } from "./alerts";
import { useLanguage } from "@/components/language-provider";
import { isReady } from "@/lib/lightdive-v3/i18n";
import type { Locale } from "@/lib/translations";
import type { SummonFx } from "./summon-fx";
import type { Sim } from "./sim";
import { tl, localized } from "@/lib/lightdive-v3/i18n";

const FX: { key: FxQuality; name: string; text: string }[] = localized([
  { key: "high", name: "高", text: "完整的 WebGL 星圖和召喚特效。" },
  { key: "standard", name: "標準", text: "保留特效，粒子大約減半、光暈簡化，較省電。" },
  { key: "low", name: "簡化", text: "不使用 WebGL：星圖和召喚改用輕量的畫面，最省資源。" },
]);
const LANGS: { key: Locale; name: string }[] = [
  { key: "zh-Hant", name: "繁體中文" },
  { key: "en", name: "English" },
  { key: "zh-Hans", name: "简体中文" },
  { key: "ko", name: "한국어" },
];
const COACH_KEY = "lightdive:v3:coach-done";

export function Settings({ sim, muted, toggleMute, musicOn, toggleMusic }: { sim: Sim; muted: boolean; toggleMute: () => void; musicOn: boolean; toggleMusic: () => void }) {
  const st = useSettings();
  const site = useLanguage();
  const [msg, setMsg] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  return (
    <div className="hud-page v3-settings">
      <PageHead kicker={tl("設定")} icon="settings" title={tl("設定")} lead={tl("聲音、畫面效果和語言。設定只存在這台裝置的瀏覽器裡。")} />
      {msg && <p className="v3-notice" role="status">{msg}</p>}
      <div className="v3-settings__grid">
        <section className="v3-panel v3-setcard">
          <h3><Volume2 aria-hidden="true" />{tl("聲音")}</h3>
          <VolumeRow kind="sfx" label={tl("音效")} on={!muted} onToggle={toggleMute} />
          <VolumeRow kind="music" label={tl("音樂")} on={musicOn} onToggle={toggleMusic} />
          <p className="v3-muted">{tl("音效包含按鈕、揭曉、收取的聲音；音樂是各頁的背景配樂。故事和白皮書頁不播音樂。")}</p>
        </section>

        <section className="v3-panel v3-setcard">
          <h3><MonitorPlay aria-hidden="true" />{tl("畫面")}</h3>
          <div className="v3-setchoice" role="radiogroup" aria-label={tl("特效品質")}>
            {FX.map((x) => (
              <button key={x.key} type="button" role="radio" aria-checked={st.fx === x.key} className={st.fx === x.key ? "is-on" : ""} onClick={() => { setFxQuality(x.key); play("toggle"); }}>
                <b>{x.name}</b><small>{x.text}</small>
              </button>
            ))}
          </div>
          <label className="v3-setswitch">
            <input type="checkbox" checked={st.calm} onChange={(e) => { setCalm(e.target.checked); play("toggle"); }} />
            <span><b>{tl("減少動畫")}</b><small>{tl("關掉閃光、震動、粒子和大部分動態效果，適合容易暈眩或想要安靜畫面的人。系統設定了「減少動態效果」時會自動開啟。")}</small></span>
          </label>
        </section>

        <section className="v3-panel v3-setcard">
          <h3><BellRing aria-hidden="true" />{tl("提醒")}</h3>
          <AlertsSwitch on={st.alerts} onChange={(v) => { setAlerts(v); play("toggle"); }} />
        </section>

        <PerfCheck current={st.fx} onApply={(q) => { setFxQuality(q); setMsg(tl("已套用建議：特效品質「{0}」。", { 0: FX.find((x) => x.key === q)!.name })); }} />

        <section className="v3-panel v3-setcard">
          <h3><Languages aria-hidden="true" />{tl("語言")}</h3>
          <div className="v3-setchoice is-lang" role="radiogroup" aria-label={tl("語言")}>
            {LANGS.map((x) => (
              <button key={x.key} type="button" role="radio" aria-checked={site.locale === x.key} disabled={!isReady(x.key)} className={site.locale === x.key && isReady(x.key) ? "is-on" : ""} onClick={() => site.setLocale(x.key)}>
                <b>{x.name}</b>{!isReady(x.key) && <small>{tl("製作中")}</small>}
              </button>
            ))}
          </div>
          <p className="v3-muted">{tl("遊戲文字正在翻譯成英文、簡體中文和韓文，完成後就能在這裡切換。")}</p>
        </section>

        <section className="v3-panel v3-setcard">
          <h3><RotateCcw aria-hidden="true" />{tl("其他")}</h3>
          <div className="v3-setrow">
            <span><b>{tl("重新看新手引導")}</b><small>{tl("下次打開潛光頁時，從星圖開始重新帶一次。")}</small></span>
            <button type="button" className="hud-btn hud-btn--ghost hud-btn--sm" onClick={() => { try { localStorage.removeItem(COACH_KEY); } catch {} setMsg(tl("新手引導已重置，到潛光頁就會出現。")); play("toggle"); }}>{tl("重置引導")}</button>
          </div>
          <div className="v3-setrow">
            <span><b>{tl("重置預覽資料")}</b><small>{tl("清掉這台裝置上的預覽進度（卡片、隊伍、紀錄），回到剛開始的狀態。只影響預覽，不影響鏈上任何東西。")}</small></span>
            {resetting ? (
              <span className="v3-setrow__confirm">
                <button type="button" className="hud-btn hud-btn--ghost hud-btn--sm" onClick={() => setResetting(false)}>{tl("取消")}</button>
                <button type="button" className="hud-btn hud-btn--danger hud-btn--sm" onClick={() => { sim.reset(); setResetting(false); setMsg(tl("預覽資料已重置。")); }}>{tl("確定重置")}</button>
              </span>
            ) : (
              <button type="button" className="hud-btn hud-btn--ghost hud-btn--sm" onClick={() => setResetting(true)}>{tl("重置…")}</button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function VolumeRow({ kind, label, on, onToggle }: { kind: "sfx" | "music"; label: string; on: boolean; onToggle: () => void }) {
  const [level, setLevel] = useVolume(kind);
  const v = Math.round(level * 100);
  return (
    <div className="v3-setvol">
      <label className="v3-setswitch is-inline">
        <input type="checkbox" checked={on} onChange={onToggle} />
        <span><b>{label}</b></span>
      </label>
      <input type="range" min={0} max={100} step={1} value={v} disabled={!on} aria-label={tl("{0}音量", { 0: label })} style={{ ["--v" as string]: `${v}%` }}
        onChange={(e) => setLevel(Number(e.target.value) / 100)} onPointerUp={() => { if (kind === "sfx") play("click"); }} />
      <em>{on ? v : 0}</em>
    </div>
  );
}

type Result = { avg: number; low: number; gpu: string; threads: number; memory?: number; ok: boolean };

/** Runs the summon effect at full quality for a few seconds and measures the frame rate, then suggests a quality. */
function PerfCheck({ current, onApply }: { current: FxQuality; onApply: (q: FxQuality) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!running) return;
    let fx: SummonFx | null = null;
    let raf = 0, dead = false, shown = false;
    const frames: number[] = [];
    const start = performance.now();
    const DURATION = 5000;
    const tick = (now: number) => {
      if (dead) return;
      frames.push(now);
      const t = now - start;
      if (!shown) fx?.charge(Math.min(1, t / 3200));
      if (t > 3300 && fx && !shown) { fx.reveal("#ff9d2e", 4); shown = true; }
      setLeft(Math.max(0, Math.ceil((DURATION - t) / 1000)));
      if (t < DURATION) { raf = requestAnimationFrame(tick); return; }
      // frame rate overall and in the worst half second (skipping the first second while things load)
      const settled = frames.filter((f) => f - start > 1000);
      // a hidden or throttled tab draws almost nothing: then the test says so instead of guessing
      const ok = settled.length >= 30;
      const avg = (settled.length - 1) / ((settled.at(-1)! - settled[0]) / 1000);
      let low = Infinity;
      for (let w = start + 1000; w + 500 <= start + DURATION; w += 250) {
        const n = settled.filter((f) => f >= w && f < w + 500).length;
        low = Math.min(low, n * 2);
      }
      setResult({ ok, avg: ok ? Math.round(avg) : 0, low: ok ? Math.round(low) : 0, gpu: gpuName(), threads: navigator.hardwareConcurrency ?? 0, memory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory });
      setRunning(false);
    };
    if (host.current) {
      import("./summon-fx").then((m) => m.createSummonFx(host.current!, "#c9ff55")).then((f) => {
        if (dead) { f.destroy(); return; }
        fx = f;
        raf = requestAnimationFrame(tick);
      }).catch(() => { setRunning(false); });
    }
    return () => { dead = true; cancelAnimationFrame(raf); fx?.destroy(); };
  }, [running]);
  const suggest: FxQuality | null = result?.ok ? (result.avg >= 50 && result.low >= 35 ? "high" : result.avg >= 30 ? "standard" : "low") : null;
  return (
    <section className="v3-panel v3-setcard v3-perf">
      <h3><Gauge aria-hidden="true" />{tl("效能檢查")}</h3>
      <p className="v3-muted">{tl("用完整品質跑一段召喚特效約 5 秒，量這台電腦每秒能畫幾格，再建議特效品質。測試時畫面會動，請保持這個分頁在前面。")}</p>
      <div className={`v3-perf__stage${running ? " is-running" : ""}`} ref={host} aria-hidden="true">
        {running && <span className="v3-perf__count">{left}</span>}
        {!running && !result && <span className="v3-perf__idle">{tl("按下面的按鈕開始")}</span>}
      </div>
      {result && !result.ok && <p className="v3-error" role="alert">{tl("這次沒有量到足夠的畫面（分頁可能被切到背景或被瀏覽器暫停），請讓這個分頁保持在前面，再測一次。")}</p>}
      {result && suggest && (
        <dl className="v3-perf__result">
          <div><dt>{tl("平均")}</dt><dd>{result.avg}<small> {tl("格／秒")}</small></dd></div>
          <div><dt>{tl("最低")}</dt><dd>{result.low}<small> {tl("格／秒")}</small></dd></div>
          <div><dt>{tl("建議")}</dt><dd className="is-suggest">{FX.find((x) => x.key === suggest)!.name}</dd></div>
          <div className="is-wide"><dt>{tl("這台裝置")}</dt><dd><small>{result.gpu || tl("顯示卡資訊無法讀取")} · {result.threads || "?"} {tl("執行緒")}{result.memory ? tl(" · 約 {0} GB 記憶體", { 0: result.memory }) : ""}</small></dd></div>
        </dl>
      )}
      <div className="v3-perf__actions">
        <button type="button" className="hud-btn hud-btn--ghost" disabled={running} onClick={() => { setResult(null); setRunning(true); }}>{running ? tl("測試中…") : result ? tl("再測一次") : tl("開始測試")}</button>
        {suggest && suggest !== current && <button type="button" className="hud-btn hud-btn--primary" onClick={() => onApply(suggest)}>{tl("套用建議")}</button>}
        {suggest && suggest === current && <span className="v3-perf__ok">{tl("目前的設定就是建議值。")}</span>}
      </div>
    </section>
  );
}

function gpuName(): string {
  try {
    const gl = document.createElement("canvas").getContext("webgl");
    if (!gl) return "";
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
    return name.replace(/^ANGLE \(/, "").replace(/\)$/, "").replace(/ Direct3D.*$/, "");
  } catch {
    return "";
  }
}
