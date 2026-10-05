"use client";

import { useEffect, useRef } from "react";

export function HomeHeroMedia() {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let visible = true;
    const sync = () => {
      if (!document.hidden && visible && !motion.matches) void video.play().catch(() => {});
      else video.pause();
    };
    document.addEventListener("visibilitychange", sync);
    motion.addEventListener("change", sync);
    const observer = "IntersectionObserver" in window ? new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true;
      sync();
    }, { threshold: 0.01 }) : null;
    observer?.observe(video);
    sync();
    return () => {
      observer?.disconnect();
      document.removeEventListener("visibilitychange", sync);
      motion.removeEventListener("change", sync);
      video.pause();
    };
  }, []);
  return <div className="reboot-hero__visual" aria-hidden="true">
    <video ref={videoRef} muted playsInline loop preload="metadata" poster="/rovyncore-home-hero-poster.jpg" tabIndex={-1}>
      <source src="/rovyncore-home-hero.mp4" type="video/mp4" />
    </video>
    <div className="reboot-hero__visual-wash" />
  </div>;
}
