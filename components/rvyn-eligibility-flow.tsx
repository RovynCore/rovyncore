"use client";

import { useState } from "react";
import { WalletCards, ClipboardCheck, ShieldCheck } from "lucide-react";
import type { Locale } from "@/lib/translations";

const copy = {
  en: { title: "How eligibility takes shape", hint: "Select a stage to explore", note: "Process guide · not your application status", names: ["Your wallet", "Review", "Onchain eligibility"], bodies: ["Use your own wallet to sign in and submit an application when registration is open.", "An application is reviewed separately. Submitting or signing does not mean approval or a token allocation.", "Approved entries must be published to the onchain whitelist. Purchase eligibility then follows the live contract and sale state."] },
  "zh-Hant": { title: "資格如何成立", hint: "點選階段，了解流程", note: "流程說明・非你的即時審核結果", names: ["錢包申請", "管理審核", "鏈上資格"], bodies: ["登記開放時，用自己的錢包簽署登入訊息，再送出申請。", "申請需要另外審核。送出或簽署訊息，不代表已核准或獲配代幣。", "核准資料還須發布至鏈上白名單，購買資格及開放狀態以實際合約為準。"] },
  "zh-Hans": { title: "资格如何成立", hint: "点击阶段，了解流程", note: "流程说明・非你的实时审核结果", names: ["钱包申请", "管理审核", "链上资格"], bodies: ["登记开放时，用自己的钱包签署登录消息，再提交申请。", "申请需要另外审核。提交或签署消息，不代表已批准或获配代币。", "批准的数据还须发布至链上白名单，购买资格及开放状态以实际合约为准。"] },
  ko: { title: "참여 자격이 정해지는 과정", hint: "단계를 선택해 살펴보세요", note: "절차 안내 · 내 신청 상태가 아닙니다", names: ["지갑으로 신청", "관리자 검토", "온체인 자격"], bodies: ["신청 기간에 자신의 지갑으로 로그인 메시지에 서명하고 신청서를 제출합니다.", "신청은 별도로 검토됩니다. 제출이나 서명만으로 승인 또는 토큰 배정이 이루어지지 않습니다.", "승인된 항목이 온체인 화이트리스트에 게시되어야 합니다. 구매 자격과 판매 개시는 실제 계약 상태에 따릅니다."] },
};
const icons = [WalletCards, ClipboardCheck, ShieldCheck];
export function RvynEligibilityFlow({ locale }: { locale: Locale }) {
  const [selected, setSelected] = useState(0);
  const text = copy[locale];
  return <div className="eligibility-flow content-motion-zone">
    <div className="eligibility-flow__heading"><h3>{text.title}</h3><span>{text.hint}</span></div>
    <div className="eligibility-flow__stages">
      <div className="eligibility-flow__path" aria-hidden="true"><span style={{ left: `${selected * 50}%` }} /></div>
      {text.names.map((name, index) => {
        const Icon = icons[index];
        return <button type="button" className={selected === index ? "is-active" : ""} key={index} aria-pressed={selected === index} onClick={() => setSelected(index)}>
          <span className="eligibility-flow__node"><Icon size={23} aria-hidden="true" /></span><span>{name}</span><small>0{index + 1}</small>
        </button>;
      })}
    </div>
    <div className="eligibility-flow__explanation">{text.bodies.map((body, index) => <p key={index} className={selected === index ? "is-active" : ""} aria-hidden={selected !== index}>{body}</p>)}</div>
    <p className="eligibility-flow__note">{text.note}</p>
  </div>;
}
