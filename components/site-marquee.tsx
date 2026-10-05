"use client";

import { useEffect, useRef } from "react";
import { Orbit, Sparkles, Fingerprint, Radio, ArrowUpRight } from "lucide-react";
import { useLanguage } from "@/components/language-provider";

const copy = {
  marqueeLabel: { en: "ROVYN CORE / A STORY IN FIVE SIGNALS", "zh-Hant": "ROVYN CORE／五道訊號的故事", "zh-Hans": "ROVYN CORE／五道信号的故事", ko: "ROVYN CORE / 다섯 신호의 이야기" },
  tickerOne: { en: "A world in the making. Our first game is in development, with RVYN at its core.", "zh-Hant": "一個世界，正在成形。第一款遊戲開發中，RVYN 是它的核心。", "zh-Hans": "一个世界，正在成形。第一款游戏开发中，RVYN 是它的核心。", ko: "만들어지고 있는 세계. RVYN을 중심에 둔 첫 게임을 개발 중입니다." },
  tickerTwo: { en: "Your idea. Your wallet. A public record of where it all began.", "zh-Hant": "你的想法，你的錢包。一份公開紀錄，留下故事開始的地方。", "zh-Hans": "你的想法，你的钱包。一份公开记录，留下故事开始的地方。", ko: "내 아이디어, 내 지갑. 모든 것이 시작된 곳을 공개 기록으로 남기세요." },
  tickerThree: { en: "Build in the open. Keep the origin clear for everyone to explore.", "zh-Hant": "在鏈上公開建造，讓每個人都能循著紀錄，找到創作的起點。", "zh-Hans": "在链上公开构建，让每个人都能循着记录，找到创作的起点。", ko: "공개적으로 만들고, 누구나 시작을 살펴볼 수 있도록 기록하세요." },
  tickerFour: { en: "RVYN is our first light. The opening chapter of ROVYN CORE.", "zh-Hant": "RVYN 是我們的第一道光，也是 ROVYN CORE 故事展開的第一章。", "zh-Hans": "RVYN 是我们的第一道光，也是 ROVYN CORE 故事展开的第一章。", ko: "RVYN은 우리의 첫 번째 빛, ROVYN CORE 이야기의 첫 장입니다." },
  tickerFive: { en: "Find your own orbit. Give the next chapter a place to begin.", "zh-Hant": "找到屬於自己的軌道，讓下一個篇章，從你的想法開始。", "zh-Hans": "找到属于自己的轨道，让下一个篇章，从你的想法开始。", ko: "나만의 궤도를 찾고, 다음 장이 시작될 자리를 만들어보세요." },
};

const leads = {
  en: ["A world in the making.", "Your idea. Your wallet.", "Build in the open.", "RVYN is our first light.", "Find your own orbit."],
  "zh-Hant": ["一個世界，正在成形。", "你的想法，你的錢包。", "在鏈上公開建造，", "RVYN 是我們的第一道光，", "找到屬於自己的軌道，"],
  "zh-Hans": ["一个世界，正在成形。", "你的想法，你的钱包。", "在链上公开构建，", "RVYN 是我们的第一道光，", "找到属于自己的轨道，"],
  ko: ["만들어지고 있는 세계.", "내 아이디어, 내 지갑.", "공개적으로 만들고,", "RVYN은 우리의 첫 번째 빛,", "나만의 궤도를 찾고,"],
};
const symbols = [Sparkles, Fingerprint, Radio, Orbit, ArrowUpRight];
const lines = [copy.tickerOne, copy.tickerTwo, copy.tickerThree, copy.tickerFour, copy.tickerFive];

export function SiteMarquee() {
  const { locale } = useLanguage();
  const hostRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = hostRef.current;
    const track = trackRef.current;
    const group = track?.firstElementChild as HTMLElement | null;
    if (!host || !track || !group) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let animation: Animation | undefined;
    let distance = 0;
    let frame = 0;
    let speed = 1;
    let targetSpeed = 1;
    let lastY = window.scrollY;
    let lastScrollTime = performance.now();
    let lastFrameTime = lastScrollTime;
    let boostUntil = 0;
    let hovered = false;
    let focused = host.contains(document.activeElement);
    let windowActive = document.hasFocus();
    const isPaused = () => hovered || focused || document.hidden || !windowActive;
    const stopBoost = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      speed = targetSpeed = 1;
      animation?.updatePlaybackRate(1);
      host.style.setProperty("--signal-energy", "0");
    };
    const syncPause = () => {
      if (motion.matches || !animation) return;
      if (isPaused()) {
        animation.pause();
        stopBoost();
      } else {
        animation.play();
      }
      host.dataset.motion = isPaused() ? "paused" : "running";
    };
    const measure = () => {
      // Measure one complete group, rather than guessing by language length.
      const width = group.getBoundingClientRect().width;
      if (motion.matches || width <= 0) return;
      const offset = animation && distance > 0 ? ((Number(animation.currentTime) || 0) * .028) % distance : 0;
      const keyframes = [{ transform: "translate3d(0,0,0)" }, { transform: "translate3d(-" + width + "px,0,0)" }];
      if (animation) {
        const effect = animation.effect as KeyframeEffect;
        effect.setKeyframes(keyframes);
        effect.updateTiming({ duration: width / 28 * 1000 });
        animation.currentTime = (offset % width) / .028;
      } else {
        animation = track.animate(keyframes, { duration: width / 28 * 1000, iterations: Infinity, easing: "linear" });
      }
      distance = width;
      syncPause();
    };
    const setMotion = () => {
      stopBoost();
      animation?.cancel();
      animation = undefined;
      host.dataset.enhanced = "true";
      host.dataset.motion = motion.matches ? "reduced" : "running";
      const viewport = host.querySelector(".marquee-window");
      if (viewport) viewport.scrollLeft = 0;
      measure();
    };
    const settle = (now: number) => {
      const dt = Math.min(now - lastFrameTime, 64);
      lastFrameTime = now;
      const target = now < boostUntil ? targetSpeed : 1;
      speed += (target - speed) * (1 - Math.exp(-dt / 160));
      animation?.updatePlaybackRate(speed);
      host.style.setProperty("--signal-energy", ((speed - 1) / .8).toFixed(3));
      if (now < boostUntil || Math.abs(speed - 1) > .005) {
        frame = requestAnimationFrame(settle);
      } else {
        speed = 1;
        animation?.updatePlaybackRate(1);
        host.style.setProperty("--signal-energy", "0");
        frame = 0;
      }
    };
    const onScroll = () => {
      const now = performance.now();
      const velocity = Math.abs(window.scrollY - lastY) / Math.max(now - lastScrollTime, 16);
      lastY = window.scrollY;
      lastScrollTime = now;
      if (motion.matches || isPaused() || !animation || velocity < .01) return;
      targetSpeed = 1 + Math.min(velocity * .22, .8);
      boostUntil = now + 120;
      if (!frame) {
        lastFrameTime = now;
        frame = requestAnimationFrame(settle);
      }
    };
    const onEnter = (event: PointerEvent) => { if (event.pointerType === "mouse") { hovered = true; syncPause(); } };
    const onLeave = () => { hovered = false; syncPause(); };
    const onFocus = () => { focused = true; syncPause(); };
    const onBlur = (event: FocusEvent) => { focused = host.contains(event.relatedTarget as Node | null); syncPause(); };
    const onWindowBlur = () => { windowActive = false; syncPause(); };
    const onWindowFocus = () => { windowActive = true; lastY = window.scrollY; lastScrollTime = performance.now(); syncPause(); };
    const onKey = (event: KeyboardEvent) => {
      if (!motion.matches || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
      event.preventDefault();
      host.querySelector(".marquee-window")?.scrollBy({ left: event.key === "ArrowRight" ? 180 : -180, behavior: "instant" });
    };
    setMotion();
    const observer = new ResizeObserver(measure);
    observer.observe(group);
    motion.addEventListener("change", setMotion);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("blur", onWindowBlur);
    window.addEventListener("focus", onWindowFocus);
    document.addEventListener("visibilitychange", syncPause);
    host.addEventListener("pointerenter", onEnter);
    host.addEventListener("pointerleave", onLeave);
    host.addEventListener("focusin", onFocus);
    host.addEventListener("focusout", onBlur);
    host.addEventListener("keydown", onKey);
    return () => {
      observer.disconnect();
      stopBoost();
      animation?.cancel();
      motion.removeEventListener("change", setMotion);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("blur", onWindowBlur);
      window.removeEventListener("focus", onWindowFocus);
      document.removeEventListener("visibilitychange", syncPause);
      host.removeEventListener("pointerenter", onEnter);
      host.removeEventListener("pointerleave", onLeave);
      host.removeEventListener("focusin", onFocus);
      host.removeEventListener("focusout", onBlur);
      host.removeEventListener("keydown", onKey);
      delete host.dataset.enhanced;
      delete host.dataset.motion;
    };
  }, [locale]);
  return (
    <div ref={hostRef} className="reboot-marquee" id="reboot-signal" role="region" tabIndex={0} aria-label={copy.marqueeLabel[locale]}>
      <div className="marquee-mark" aria-hidden="true"><Orbit /><span>SIGNAL</span></div>
      <div className="marquee-window">
        <div key={locale} ref={trackRef} className="marquee-track">
          {[0, 1].map((group) => <div className="marquee-group" key={group} aria-hidden={group === 1 ? "true" : undefined}>
            {lines.map((line, index) => {
              const Icon = symbols[index];
              const lead = leads[locale][index];
              return <div className="marquee-item" key={index}>
                <small aria-hidden="true">{String(index + 1).padStart(2, "0")}</small>
                <p><b>{lead}</b>{locale.startsWith("zh") ? "" : " "}{line[locale].slice(lead.length).trim()}</p>
                <Icon aria-hidden="true" />
              </div>;
            })}
          </div>)}
        </div>
      </div>
    </div>
  );
}
