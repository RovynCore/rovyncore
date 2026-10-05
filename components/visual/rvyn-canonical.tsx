"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { RVYN_MODEL } from "@/lib/rvyn-model";
import type { Locale } from "@/lib/translations";

const copy = {
  en: { eyebrow:"THE RVYN TOKEN", title1:"The first light",title2:"now onchain.",titlePending:"preparing for launch.",lead:"RVYN is RovynCore's first brand token. Its origin and onchain facts have a public record; sale access follows the live contract state.",sale:"View presale status",allocation:"View allocation",total:"Fixed total supply",tokenomics:"TOKENOMICS / PLANNED ALLOCATION",balance:"A balanced orbit for what comes next.",allocationNote:"These percentages are a published plan, not proof of custody or distribution. Confirm against the deployed contracts.",feature:["First platform token","Community connection","Public records","Long view"],featureBody:["A starting point, not a return promise.","Built for creators and their supporters.","Origin and changes can be inspected.","Future ideas remain plans until delivered."],presale:"PRESALE",presaleTitle:"Access follows readiness.",signal:"THE RVYN SIGNAL",signalTitle:"More than a token.",roadmap:"ROADMAP",roadmapTitle:"From first light onward.",roadmapStages:["Whitelist","Presale","Liquidity","Ecosystem"],planning:"PLANNED · NOT LIVE TERMS" },
  "zh-Hant": { eyebrow:"RVYN 代幣",title1:"第一道光，",title2:"已在鏈上。",titlePending:"正在準備發行。",lead:"RVYN 是 RovynCore 的首個品牌代幣。起點與鏈上資料有公開紀錄；銷售資格以即時合約狀態為準。",sale:"查看預售狀態",allocation:"查看配置",total:"固定總供應量",tokenomics:"代幣經濟 / 規劃配置",balance:"為下一步保留平衡的軌道。",allocationNote:"這些比例是公開規劃，不等於已完成託管或分配。請以實際部署合約核對。",feature:["首個平台代幣","連結社群","公開紀錄","長期視野"],featureBody:["一個起點，不是收益承諾。","為創作者與支持者而建。","來源和變更皆可核對。","未實現的構想仍屬規劃。"],presale:"預售",presaleTitle:"準備就緒後才開放。",signal:"RVYN 訊號",signalTitle:"不只是一枚代幣。",roadmap:"發展路線",roadmapTitle:"從第一道光繼續前進。",roadmapStages:["白名單","預售","流動性","生態"],planning:"規劃值 · 尚非已生效條件" },
  "zh-Hans": { eyebrow:"RVYN 代币",title1:"第一道光，",title2:"已在链上。",titlePending:"正在准备发行。",lead:"RVYN 是 RovynCore 的首个品牌代币。起点与链上资料有公开记录；销售资格以实时合约状态为准。",sale:"查看预售状态",allocation:"查看配置",total:"固定总供应量",tokenomics:"代币经济 / 规划配置",balance:"为下一步保留平衡的轨道。",allocationNote:"这些比例是公开规划，不等于已完成托管或分配。请以实际部署合约核对。",feature:["首个平台代币","连接社区","公开记录","长期视野"],featureBody:["一个起点，不是收益承诺。","为创作者与支持者而建。","来源和变更皆可核对。","未实现的构想仍属规划。"],presale:"预售",presaleTitle:"准备就绪后才开放。",signal:"RVYN 信号",signalTitle:"不只是一枚代币。",roadmap:"发展路线",roadmapTitle:"从第一道光继续前进。",roadmapStages:["白名单","预售","流动性","生态"],planning:"规划值 · 尚非已生效条件" },
  ko: { eyebrow:"RVYN 토큰",title1:"첫 번째 빛,",title2:"온체인으로.",titlePending:"출시 준비 중.",lead:"RVYN은 RovynCore의 첫 브랜드 토큰입니다. 시작과 온체인 사실은 공개 기록으로 남고 판매 참여는 실제 계약 상태에 따릅니다.",sale:"프리세일 상태 보기",allocation:"배분 보기",total:"고정 총공급량",tokenomics:"토크노믹스 / 계획된 배분",balance:"다음 단계에 균형 잡힌 궤도.",allocationNote:"이 비율은 공개된 계획이며 실제 보관·배분의 증거는 아닙니다. 배포된 계약을 확인하세요.",feature:["첫 플랫폼 토큰","커뮤니티 연결","공개 기록","장기 전망"],featureBody:["출발점이며 수익 약속이 아닙니다.","창작자와 지지자를 위한 것입니다.","출처와 변화를 확인할 수 있습니다.","실현되지 않은 구상은 여전히 계획입니다."],presale:"프리세일",presaleTitle:"준비가 완료되면 열립니다.",signal:"RVYN 신호",signalTitle:"토큰 이상의 시작.",roadmap:"로드맵",roadmapTitle:"첫 빛에서 계속 나아갑니다.",roadmapStages:["화이트리스트","프리세일","유동성","생태계"],planning:"계획값 · 아직 적용되지 않음" },
};

const verifiedTerms = {
  en: { heading: "TOKENOMICS / CONTRACT ALLOCATION CAPS", note: "The sale contract defines these allocation caps. They do not prove that tokens have been transferred or distributed.", footer: "CONTRACT CAPS · CHECK LIVE BALANCES" },
  "zh-Hant": { heading: "代幣經濟 / 合約配置上限", note: "這些是預售合約設定的配置上限，不代表代幣已轉入或完成分配。", footer: "合約上限・請核對即時餘額" },
  "zh-Hans": { heading: "代币经济 / 合约配置上限", note: "这些是预售合约设定的配置上限，不代表代币已转入或完成分配。", footer: "合约上限・请核对实时余额" },
  ko: { heading: "토크노믹스 / 계약상 배분 한도", note: "이 수치는 판매 계약에 정의된 배분 한도이며 토큰 이전이나 실제 분배를 증명하지 않습니다.", footer: "계약 한도 · 실시간 잔액 확인" },
} as const;

// Color separates the seven real allocation caps; hue is visual encoding, not an additional category.
const TOKENS = ["#dbeaa6","#c9ff55","#a8cd79","#718c53","#8eb761","#bdcf83","#e5efc4"];
function ringNoise(seed: number) {
  let value = Math.imul(seed + 17, 1664525) + 1013904223;
  value ^= value >>> 16;
  value = Math.imul(value, 2246822519);
  return (value >>> 0) / 4294967296;
}

const RING_POINTS = RVYN_MODEL.allocations.map((item, segment) => {
  const start = RVYN_MODEL.allocations.slice(0, segment).reduce((sum, allocation) => sum + allocation.percent, 0);
  const count = Math.round(item.percent * 6);
  return Array.from({ length: count }, (_, index) => {
    const seed = segment * 701 + index;
    const fraction = (index + ringNoise(seed + 1) * .85) / count;
    const angle = -Math.PI / 2 + (start + item.percent * fraction) * Math.PI * 2 / 100;
    const distance = 91 + ringNoise(seed + 2) * 35;
    return {
      x: Number((160 + Math.cos(angle) * distance).toFixed(3)),
      y: Number((160 + Math.sin(angle) * distance).toFixed(3)),
      radius: index % 19 === 0 ? 1.35 : Number((.38 + ringNoise(seed + 3) * .62).toFixed(3)),
      opacity: Number((.24 + ringNoise(seed + 4) * .68).toFixed(3)),
    };
  });
});
function OrbitAllocation({locale,activeIndex,onActiveChange,translate}:{locale:Locale;activeIndex:number|null;onActiveChange:(index:number|null)=>void;translate:(value:string)=>string}) {
  const size=320,radius=103, circumference=2*Math.PI*radius;
  const offsets=RVYN_MODEL.allocations.map((_,index)=>RVYN_MODEL.allocations.slice(0,index).reduce((sum,item)=>sum+item.percent/100*circumference,0));
  return <div className="rc-rvyn-orbit" aria-label="RVYN allocation orbit"><svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label={copy[locale].balance}>
    <defs><filter id="rc-alloc-glow"><feGaussianBlur stdDeviation="3"/></filter><radialGradient id="rc-alloc-center"><stop stopColor="#263817" stopOpacity=".67"/><stop offset="1" stopColor="#080c07" stopOpacity=".1"/></radialGradient></defs>
    <circle cx="160" cy="160" r="149" fill="none" stroke="#c9ff55" strokeOpacity=".12" strokeDasharray="2 8"/><circle cx="160" cy="160" r="134" fill="none" stroke="#c9ff55" strokeOpacity=".18"/><circle cx="160" cy="160" r="122" fill="none" stroke="#a8cd79" strokeOpacity=".11" strokeDasharray="2 7"/><circle cx="160" cy="160" r="88" fill="url(#rc-alloc-center)" stroke="#c9ff55" strokeOpacity=".28"/>
    {RVYN_MODEL.allocations.map((item,i)=>{const length=item.percent/100*circumference-4;const current=offsets[i];const active=activeIndex===i;return <g key={item.label} className="rc-rvyn-orbit__segment" role="button" tabIndex={0} aria-label={`${translate(item.label)} ${item.percent}%`} aria-pressed={active} onMouseEnter={()=>onActiveChange(i)} onMouseLeave={()=>onActiveChange(null)} onFocus={()=>onActiveChange(i)} onBlur={()=>onActiveChange(null)} onClick={()=>onActiveChange(i)} onKeyDown={(event)=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();onActiveChange(i);}}}>
      <g transform="rotate(-90 160 160)"><circle cx="160" cy="160" r={radius} fill="none" stroke={TOKENS[i]} strokeWidth={active?"21":"16"} strokeOpacity={active?".73":".45"} strokeDasharray={`${length} ${circumference-length}`} strokeDashoffset={-current} filter="url(#rc-alloc-glow)"/><circle cx="160" cy="160" r={radius} fill="none" stroke={TOKENS[i]} strokeWidth={active?"14":"10"} strokeOpacity={activeIndex!==null&&!active?".48":"1"} strokeDasharray={`${length} ${circumference-length}`} strokeDashoffset={-current}/></g>
      <g aria-hidden="true" opacity={activeIndex!==null&&!active?.32:1}>{RING_POINTS[i].map((point,index)=><circle key={index} cx={point.x} cy={point.y} r={point.radius} fill={TOKENS[i]} opacity={point.opacity}/>)}</g>
    </g>;})}
    <text x="160" y="152" textAnchor="middle" fill="#f2f7eb" fontSize="28" fontWeight="650" letterSpacing={activeIndex===null?"9":"0"}>{activeIndex===null?"RVYN":`${RVYN_MODEL.allocations[activeIndex].percent}%`}</text><text x="160" y="176" textAnchor="middle" fill="#bfd99c" fontSize="9" letterSpacing={activeIndex===null?"4":"0"}>{activeIndex===null?"10,000,000":translate(RVYN_MODEL.allocations[activeIndex].label)}</text>
  </svg></div>;
}

export function RetainedRvynTokenomics({ locale, contractV5, translate }: { locale: Locale; contractV5: boolean; translate: (value: string) => string }) {
  const [activeAllocation, setActiveAllocation] = useState<number | null>(null);
  const terms = contractV5 ? verifiedTerms[locale] : { heading: copy[locale].tokenomics, note: copy[locale].allocationNote };
  return <section className="rc-rvyn-tokenomics" id="rvyn-allocation-details" aria-labelledby="rvyn-tokenomics-heading">
    <div className="rc-rvyn-tokenomics__intro"><span className="rc-kicker">{terms.heading}</span><h2 id="rvyn-tokenomics-heading">{copy[locale].balance}</h2><p>{terms.note}</p><button type="button" className="rc-cta rc-cta--outline" onClick={() => setActiveAllocation(0)}>{copy[locale].allocation}<ArrowRight size={16} /></button></div>
    <OrbitAllocation locale={locale} activeIndex={activeAllocation} onActiveChange={setActiveAllocation} translate={translate} />
    <div className="rc-rvyn-allocations">{RVYN_MODEL.allocations.map((item, index) => <button type="button" aria-pressed={activeAllocation === index} className={activeAllocation === index ? "is-active" : ""} key={item.label} onMouseEnter={() => setActiveAllocation(index)} onMouseLeave={() => setActiveAllocation(null)} onFocus={() => setActiveAllocation(index)} onBlur={() => setActiveAllocation(null)} onClick={() => setActiveAllocation(index)}><i style={{ background: TOKENS[index] }} /><span>{translate(item.label)}</span><strong>{item.percent}%</strong><small>{item.tokens.toLocaleString(locale)} RVYN</small></button>)}</div>
  </section>;
}
