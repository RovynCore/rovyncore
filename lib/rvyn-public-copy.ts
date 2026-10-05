import type { Locale } from "./translations";

// Editorial UI summaries only. The creator-supplied Asset Record description is
// preserved unchanged and remains available on the detail page.
export const rvynPublicCopy: Record<Locale, { summary: string; originalLabel: string }> = {
  en: {
    summary: "RovynCore (RVYN) is ROVYN CORE's first platform brand token on Robinhood Chain. Its supply is fixed at 10,000,000 tokens, with no transfer tax or hidden minting. It currently offers no staking, profit sharing or guaranteed return.",
    originalLabel: "Original project description (English)",
  },
  "zh-Hant": {
    summary: "RovynCore（RVYN）是 ROVYN CORE 在 Robinhood Chain 發行的首枚平台品牌代幣。總供應量固定為 1,000 萬枚，無轉帳稅或隱藏增發；目前不提供質押、分潤或保證收益。",
    originalLabel: "原始項目介紹（英文，創作者提供）",
  },
  "zh-Hans": {
    summary: "RovynCore（RVYN）是 ROVYN CORE 在 Robinhood Chain 发行的首枚平台品牌代币。总供应量固定为 1,000 万枚，无转账税或隐藏增发；目前不提供质押、利润分成或保证收益。",
    originalLabel: "原始项目介绍（英文，由创建者提供）",
  },
  ko: {
    summary: "RovynCore(RVYN)는 ROVYN CORE가 Robinhood Chain에서 발행한 첫 플랫폼 브랜드 토큰입니다. 총공급량은 1,000만 개로 고정되어 있으며 전송세나 숨겨진 추가 발행이 없습니다. 현재 스테이킹, 수익 배분 또는 수익 보장을 제공하지 않습니다.",
    originalLabel: "원본 프로젝트 소개(영어, 발행자 제공)",
  },
};
