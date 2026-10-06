"use client";
// RVYN allocation caps as one stacked bar with a legend (figures from the sale contract constants).
import type { Copy4 } from "@/components/rv/ui";

const ALLOC_COLORS = ["#8fd13a", "#c9ff55", "#d9e8c6", "#5fa82a", "#3f8a3a", "#2e6f4a", "#93a48a"];

const ALLOC: Array<[Copy4, number]> = [
  [{ en: "Presale", "zh-Hant": "預售", "zh-Hans": "预售", ko: "프리세일" }, 10],
  [{ en: "Liquidity", "zh-Hant": "流動性", "zh-Hans": "流动性", ko: "유동성" }, 50],
  [{ en: "Manager wallet", "zh-Hant": "管理錢包", "zh-Hans": "管理钱包", ko: "관리 지갑" }, 5],
  [{ en: "Team (vesting)", "zh-Hant": "團隊（歸屬）", "zh-Hans": "团队（归属）", ko: "팀 (베스팅)" }, 10],
  [{ en: "Product & ecosystem", "zh-Hant": "產品與生態", "zh-Hans": "产品与生态", ko: "제품·생태계" }, 10],
  [{ en: "Community & creators", "zh-Hant": "社群與創作者", "zh-Hans": "社群与创作者", ko: "커뮤니티·크리에이터" }, 10],
  [{ en: "Airdrop reserve", "zh-Hant": "空投保留", "zh-Hans": "空投保留", ko: "에어드롭 예비" }, 5],
];

export function AllocationBar({ locale }: { locale: keyof Copy4 }) {
  return (
    <div className="rv-alloc">
      <div className="rv-alloc__bar" aria-hidden="true">
        {ALLOC.map(([, pct], i) => <span key={i} style={{ width: `${pct}%`, background: ALLOC_COLORS[i] }} />)}
      </div>
      <ul className="rv-alloc__legend">
        {ALLOC.map(([label, pct], i) => (
          <li key={i}><i style={{ background: ALLOC_COLORS[i] }} /><span>{label[locale]}</span><b>{pct}%</b></li>
        ))}
      </ul>
    </div>
  );
}

