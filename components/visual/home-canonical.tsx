"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { ArrowRight, Boxes, CircleDot, Globe2, UsersRound } from "lucide-react";
import Link from "@/components/site-link";
import { ParticleField } from "@/components/visual/particle-field";
import type { Locale } from "@/lib/translations";

type HomeCanonicalProps = { locale: Locale; whitelistText: string; saleStatusText: string; stageTone: string };
const words = {
  en: { eyebrow:"BUILD · LAUNCH · OWN · TOGETHER", line1:"Ideas deserve", line2:"a way forward.", lead:"RovynCore gives creators a route from an early idea to a public onchain asset and a record anyone can inspect.", launch:"Explore Launchpad", records:"View Records", story:"THE STORY", storyTitle:"From a single signal\nto a brighter tomorrow.", storyLead:"An idea finds a shape, an orbit and a public onchain record.", stages:["A signal in the dark","An orbit takes shape","RVYN, the first light","The constellation grows"], stageBodies:["An idea is ready to be seen.","Creators give it a name and a place onchain.","Our first brand token leaves a public record.","Every new launch adds another point to the map."], roadmap:"ROADMAP", roadTitle:"A clear path\nfrom idea to ecosystem.", roadLead:"Public milestones. No promised outcomes.", horizons:["Foundation","Launchpad","Creator tools","Ecosystem"], horizonText:["Platform and RVYN","Token launches and records","Make the path clearer","Explore what comes next"], cards:["For builders","For communities","For the curious","For the future"], cardTitles:["Launch with clarity.","Find what's next.","Read the real record.","Keep building openly."], cardBodies:["Create a fixed-supply token.","Follow public onchain beginnings.","Check origin and observed changes.","The roadmap is a direction, not a promise."], note:"PUBLIC DATA · NO IMPLIED ENDORSEMENT" },
  "zh-Hant": { eyebrow:"建造 · 發行 · 擁有 · 同行", line1:"每個想法，", line2:"都值得向前。", lead:"從想法到鏈上資產，RovynCore 讓創作者留下任何人都能查閱的公開紀錄。", launch:"探索發射台", records:"查看紀錄", story:"我們的故事", storyTitle:"從一道訊號，\n到更明亮的未來。", storyLead:"想法有了形狀、軌道，也有了公開的鏈上紀錄。", stages:["黑暗中的訊號","軌道逐漸成形","RVYN，第一道光","星系持續延展"], stageBodies:["一個想法，等待被看見。","創作者賦予它名稱與鏈上座標。","首個品牌代幣留下公開紀錄。","每次發行都為版圖增加新的一點。"], roadmap:"發展路線", roadTitle:"從想法到生態，\n路線清晰可見。", roadLead:"公開里程碑；不承諾結果。", horizons:["基礎","發射台","創作者工具","生態"], horizonText:["平台與 RVYN","代幣發行和紀錄","持續優化流程","探索下一步"], cards:["給建造者","給社群","給好奇的人","給未來"], cardTitles:["清楚地發行。","找到下一步。","閱讀真實紀錄。","持續公開建造。"], cardBodies:["建立固定供應量代幣。","關注公開的鏈上起點。","核對來源和觀測到的變化。","路線是方向，不是承諾。"], note:"公開資料 · 不代表平台背書" },
  "zh-Hans": { eyebrow:"构建 · 发行 · 拥有 · 同行", line1:"每个想法，", line2:"都值得向前。", lead:"从想法到链上资产，RovynCore 让创作者留下任何人都能查阅的公开记录。", launch:"探索发射台", records:"查看记录", story:"我们的故事", storyTitle:"从一道信号，\n到更明亮的未来。", storyLead:"想法有了形状、轨道，也有了公开的链上记录。", stages:["黑暗中的信号","轨道逐渐成形","RVYN，第一道光","星系持续延展"], stageBodies:["一个想法，等待被看见。","创作者赋予它名称与链上坐标。","首个品牌代币留下公开记录。","每次发行都为版图增加新的一点。"], roadmap:"发展路线", roadTitle:"从想法到生态，\n路线清晰可见。", roadLead:"公开里程碑；不承诺结果。", horizons:["基础","发射台","创作者工具","生态"], horizonText:["平台与 RVYN","代币发行和记录","持续优化流程","探索下一步"], cards:["给建造者","给社区","给好奇的人","给未来"], cardTitles:["清晰地发行。","找到下一步。","阅读真实记录。","持续公开构建。"], cardBodies:["建立固定供应量代币。","关注公开的链上起点。","核对来源和观测到的变化。","路线是方向，不是承诺。"], note:"公开数据 · 不代表平台背书" },
  ko: { eyebrow:"BUILD · LAUNCH · OWN · TOGETHER", line1:"모든 아이디어에는", line2:"나아갈 길이 있습니다.", lead:"RovynCore는 초기 아이디어가 공개 온체인 자산과 누구나 확인할 수 있는 기록으로 이어지도록 돕습니다.", launch:"런치패드 살펴보기", records:"기록 보기", story:"우리의 이야기", storyTitle:"하나의 신호에서\n더 밝은 내일로.", storyLead:"아이디어가 형태와 궤도, 공개 온체인 기록을 얻습니다.", stages:["어둠 속의 신호","궤도의 형성","첫 번째 빛, RVYN","커져가는 별자리"], stageBodies:["하나의 아이디어가 발견을 기다립니다.","창작자가 이름과 온체인 좌표를 줍니다.","첫 브랜드 토큰이 공개 기록을 남깁니다.","새로운 발행마다 지도에 한 점이 더해집니다."], roadmap:"로드맵", roadTitle:"아이디어부터 생태계까지\n분명한 경로.", roadLead:"공개된 이정표이며 결과를 약속하지 않습니다.", horizons:["기반","런치패드","창작자 도구","생태계"], horizonText:["플랫폼과 RVYN","토큰 발행과 기록","경로를 더 명료하게","다음을 탐색"], cards:["창작자를 위해","커뮤니티를 위해","궁금한 사람을 위해","미래를 위해"], cardTitles:["명확하게 발행하세요.","다음을 발견하세요.","실제 기록을 읽으세요.","공개적으로 구축하세요."], cardBodies:["고정 공급 토큰을 만듭니다.","공개 온체인 시작을 따라갑니다.","출처와 관측된 변화를 확인합니다.","로드맵은 방향이지 약속이 아닙니다."], note:"공개 데이터 · 플랫폼 보증 아님" },
};

function particleNoise(seed: number) {
  let value = Math.imul(seed ^ (seed >>> 15), 0x2c1b3c6d);
  value = Math.imul(value ^ (value >>> 12), 0x297a2d39);
  return ((value ^ (value >>> 15)) >>> 0) / 4294967296;
}

function SignalArt({ index }: { index: number }) {
  const dots = Array.from({ length: 390 }, (_, i) => {
    const a = particleNoise(i * 31 + index * 607) * Math.PI * 2;
    const b = particleNoise(i * 73 + index * 811);
    const c = particleNoise(i * 127 + index * 379);
    let x = 0;
    let y = 0;
    if (index === 0) {
      x = b * 320;
      y = 114 + Math.sin(x / 46) * 16 + (c - .5) * (19 + x / 16);
    } else if (index === 1) {
      const rx = 38 + b * 93;
      const flatX = Math.cos(a) * rx;
      const flatY = Math.sin(a) * rx * .31;
      x = 185 + flatX * .93 + flatY * .35;
      y = 106 - flatX * .35 + flatY * .93;
    } else if (index === 2) {
      const radius = 31 + b * 36;
      x = 190 + Math.cos(a) * radius;
      y = 105 + Math.sin(a) * radius * .8;
    } else {
      const node = i % 5;
      const centers = [[57, 130], [136, 105], [222, 118], [280, 69], [300, 143]];
      const center = centers[node];
      const radius = 12 + b * 45;
      x = center[0] + Math.cos(a) * radius;
      y = center[1] + Math.sin(a) * radius * .55;
    }
    return { x: x.toFixed(2), y: y.toFixed(2), r: i % 41 === 0 ? 1.65 : i % 7 === 0 ? .9 : .48, opacity: (.13 + c * .65).toFixed(2), fill: i % 43 === 0 ? "#e7c16d" : index === 0 && i % 4 === 0 ? "#8ac8e8" : "#39f0c1" };
  });
  return <svg className={`rc-home-signal rc-home-signal--${index}`} viewBox="0 0 320 170" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs>
      <radialGradient id={`rc-stage-${index}`}><stop stopColor="#f1fff8" stopOpacity=".92"/><stop offset=".11" stopColor="#a7ffe6" stopOpacity=".55"/><stop offset=".35" stopColor="#39f0c1" stopOpacity=".19"/><stop offset="1" stopColor="#39f0c1" stopOpacity="0"/></radialGradient>
    </defs>
    {index === 0 && <><path d="M-5 136 C75 76 116 141 180 114 S254 96 326 72" fill="none" stroke="#39f0c1" strokeOpacity=".27"/><circle cx="219" cy="104" r="51" fill={`url(#rc-stage-${index})`}/></>}
    {index === 1 && <><ellipse cx="185" cy="105" rx="129" ry="40" transform="rotate(-21 185 105)" fill="none" stroke="#39f0c1" strokeOpacity=".43"/><ellipse cx="185" cy="105" rx="108" ry="31" transform="rotate(-21 185 105)" fill="none" stroke="#e7c16d" strokeOpacity=".3"/><ellipse cx="185" cy="105" rx="77" ry="23" transform="rotate(-21 185 105)" fill="none" stroke="#39f0c1" strokeOpacity=".3"/><circle cx="185" cy="105" r="40" fill={`url(#rc-stage-${index})`}/></>}
    {index === 2 && <><circle cx="190" cy="105" r="75" fill="none" stroke="#39f0c1" strokeOpacity=".24" strokeDasharray="2 5"/><circle cx="190" cy="105" r="53" fill="none" stroke="#39f0c1" strokeOpacity=".55"/><ellipse cx="190" cy="105" rx="91" ry="33" transform="rotate(-23 190 105)" fill="none" stroke="#e7c16d" strokeOpacity=".29"/><circle cx="190" cy="105" r="71" fill={`url(#rc-stage-${index})`}/></>}
    {index === 3 && <><path d="M0 150 Q65 118 136 105 T222 118 T280 69 L319 34 M57 130 Q168 156 300 143" fill="none" stroke="#39f0c1" strokeOpacity=".29"/>{[[57,130,24],[136,105,36],[222,118,43],[280,69,27],[300,143,20]].map(([x,y,r],i)=><circle key={i} cx={x} cy={y} r={r} fill={`url(#rc-stage-${index})`}/>)}</>}
    {dots.map((dot, i) => <circle key={i} cx={dot.x} cy={dot.y} r={dot.r} fill={dot.fill} opacity={dot.opacity}/>)}
  </svg>;
}

function Ridge() {
  const gaussian = (x: number, center: number, width: number, height: number) => height * Math.exp(-Math.pow((x - center) / width, 2));
  const ridgeY = (x: number) => {
    const elevation = gaussian(x, 430, 112, 31) + gaussian(x, 655, 127, 77) + gaussian(x, 932, 140, 67) + gaussian(x, 1250, 128, 113);
    const faceting = (Math.sin(x * .081) * 5 + Math.sin(x * .157) * 3 + Math.sin(x * .281) * 1.4) * (.38 + elevation / 102);
    return 175 - elevation + faceting;
  };
  const line = (depth: number) => Array.from({ length: 182 }, (_, i) => {
    const x = i * 8;
    const y = ridgeY(x) + depth * 4 + Math.sin(x * .019 + depth * .39) * depth * .23;
    return `${i ? "L" : "M"}${x} ${y.toFixed(2)}`;
  }).join(" ");
  const crest = line(0);
  const particles = Array.from({ length: 440 }, (_, i) => {
    const x = particleNoise(i * 83 + 47) * 1448;
    const depth = particleNoise(i * 97 + 13) * 94;
    return { x: x.toFixed(2), y: (ridgeY(x) + depth).toFixed(2), a: (.07 + particleNoise(i * 17 + 11) * .54).toFixed(2), r: i % 67 === 0 ? 1.55 : .45 };
  });
  return <svg className="rc-ridge" viewBox="0 0 1448 230" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="rc-ridge-fill" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#39f0c1" stopOpacity=".23"/><stop offset="1" stopColor="#39f0c1" stopOpacity="0"/></linearGradient><filter id="rc-ridge-glow"><feGaussianBlur stdDeviation="4"/></filter></defs>
    <path d={`${crest} L1448 230 L0 230 Z`} fill="url(#rc-ridge-fill)"/>
    {Array.from({ length: 19 }, (_, i) => <path key={i} d={line(i)} fill="none" stroke={i % 5 === 0 ? "#a7ffe6" : "#39f0c1"} strokeOpacity={i % 5 === 0 ? .26 : .1 + (19 - i) * .007} strokeWidth={i % 5 === 0 ? .9 : .55}/>)}
    {Array.from({ length: 90 }, (_, i) => { const x = i * 16; return <path key={i} d={`M${x} ${ridgeY(x).toFixed(2)} L${x + 32} ${(ridgeY(x + 32) + 76).toFixed(2)}`} fill="none" stroke="#39f0c1" strokeOpacity=".12" strokeWidth=".5"/>; })}
    {particles.map((point, i) => <circle key={i} cx={point.x} cy={point.y} r={point.r} fill={i % 61 === 0 ? "#e7c16d" : "#39f0c1"} opacity={point.a}/>)}
    <path d={crest} fill="none" stroke="#a7ffe6" strokeWidth="4" opacity=".37" filter="url(#rc-ridge-glow)"/><path d={crest} fill="none" stroke="#a7ffe6" strokeOpacity=".5" strokeWidth="1"/>
  </svg>;
}

export function CanonicalHome({locale,whitelistText,saleStatusText,stageTone}:HomeCanonicalProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = rootRef.current;
    if (!root || window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
    root.setAttribute("data-rc-motion", "on");
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.setAttribute("data-rc-visible", "true");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: "0px 0px 28px 0px" });
    root.querySelectorAll("[data-rc-reveal]").forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);
  const w=words[locale];
  const icons=[Boxes,UsersRound,CircleDot,Globe2];
  return <div className="rc-home-canonical rc-vu" ref={rootRef}>
    <link rel="preload" as="image" href="/visual-upgrade/home-orbit-mobile-v3.webp" media="(max-width: 700px)" fetchPriority="high" />
    <link rel="preload" as="image" href="/visual-upgrade/home-orbit-v2.webp" media="(min-width: 701px)" fetchPriority="high" />
    <section className="rc-home-hero" aria-labelledby="rc-home-title">
      <div className="rc-home-hero__visual" aria-hidden="true"><picture className="rc-orbit-picture"><source media="(max-width: 700px)" srcSet="/visual-upgrade/home-orbit-mobile-v3.webp"/><Image className="rc-orbit-art rc-home-hero__art" src="/visual-upgrade/home-orbit-v2.webp" alt="" fill fetchPriority="high" loading="eager" sizes="(max-width: 700px) 100vw, 67vw" unoptimized/></picture><ParticleField mode="home"/><span className="rc-home-visual-caption rc-hud">{"// ROVYNCORE"}<br/>{"// IDEAS INTO ASSETS"}<br/>{"// ONCHAIN"}</span></div>
      <div className="rc-home-hero__copy"><span className="rc-kicker">{w.eyebrow}</span><h1 id="rc-home-title">{w.line1}<br/><em>{w.line2}</em></h1><p>{w.lead}</p>
        <div className="rc-home-hero__actions"><Link className="rc-cta rc-cta--primary" href="/launchpad">{w.launch}<ArrowRight size={18}/></Link><Link className="rc-cta rc-cta--outline" href="/onchain-record">{w.records}<ArrowRight size={18}/></Link></div>
        <div className="rc-home-facts"><div><strong>10M</strong><span>RVYN</span></div><div><strong>4663</strong><span>Robinhood Chain</span></div><div><strong>{stageTone==="open"?"LIVE":"STATUS"}</strong><span>{saleStatusText}</span></div></div>
      </div>
      <div className="rc-home-hero__right-note">THE ROVYN CORE<span>IDEAS<br/>PEOPLE<br/>CAPITAL<br/>ONCHAIN<br/>A BRIGHTER TOMORROW</span></div>
    </section>
    <section className="rc-home-story" aria-labelledby="rc-home-story-title"><div className="rc-home-story__intro"><div><span className="rc-kicker">{w.story}</span><h2 id="rc-home-story-title">{w.storyTitle}</h2></div><p>{w.storyLead}</p><span className="rc-home-story__arrows" aria-hidden="true">←　→</span></div><div className="rc-home-story__grid">{w.stages.map((title,i)=><article key={title} data-rc-reveal style={{"--rc-reveal-delay":`${i*75}ms`} as React.CSSProperties}><span className="rc-home-story__number">0{i+1}</span><h3>{title}</h3><p>{w.stageBodies[i]}</p><SignalArt index={i}/></article>)}</div></section>
    <section className="rc-home-road" aria-labelledby="rc-home-road-title"><Ridge/><div className="rc-home-road__lead"><span className="rc-kicker">{w.roadmap}</span><h2 id="rc-home-road-title">{w.roadTitle}</h2><p>{w.roadLead}</p></div><ol>{w.horizons.map((title,i)=><li key={title} data-rc-reveal style={{"--rc-road-x":`${[31,47,66,86][i]}%`,"--rc-road-y":`${[136,81,108,34][i]}px`,"--rc-reveal-delay":`${i*95}ms`} as React.CSSProperties}><span className="rc-home-road__pin"/><span>0{i+1}</span><strong>{title}</strong><small>{w.horizonText[i]}</small></li>)}</ol></section>
    <section className="rc-home-values" aria-label={w.note}>{w.cards.map((label,i)=>{const Icon=icons[i];return <Link className="rc-home-value rc-glass" data-rc-reveal style={{"--rc-reveal-delay":`${i*75}ms`} as React.CSSProperties} href={["/launchpad","/onchain-record","/onchain-record","/rvyn"][i]} key={label}><Icon size={32} aria-hidden="true"/><div><span>{label}</span><strong>{w.cardTitles[i]}</strong><p>{w.cardBodies[i]}</p></div><ArrowRight size={17} aria-hidden="true"/></Link>})}</section>
    <div className="rc-home-canonical__more"><Link href="/rvyn#allowlist">{whitelistText} <ArrowRight size={15}/></Link><span>{w.note}</span></div>
  </div>;
}
