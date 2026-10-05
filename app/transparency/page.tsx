"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "@/components/site-link";
import { useLanguage } from "@/components/language-provider";
import type { Locale } from "@/lib/translations";

type Copy = Record<Locale, string>;

const EXPLORER = "https://robinhoodchain.blockscout.com";
// Last checked against the chain: block 80,630,130 (2026-10-05). Facts here are read from the contracts, not promises.
const CHECKED = "2026-10-05";

const copy = {
  kicker: { en: "TRANSPARENCY", "zh-Hant": "公開透明", "zh-Hans": "公开透明", ko: "투명성" },
  title: { en: "Everything we run onchain, in one place.", "zh-Hant": "我們在鏈上運行的一切，都在這裡。", "zh-Hans": "我们在链上运行的一切，都在这里。", ko: "온체인에서 운영하는 모든 것을 한곳에." },
  lead: { en: "Addresses, who controls them, and what is and isn't verified. Don't trust this page: open the explorer links and check.", "zh-Hant": "地址、由誰控制、哪些已驗證、哪些尚未。不必相信這一頁——點開區塊瀏覽器自己核對。", "zh-Hans": "地址、由谁控制、哪些已验证、哪些尚未。不必相信这一页——点开区块浏览器自己核对。", ko: "주소, 관리 주체, 검증된 것과 아닌 것. 이 페이지를 믿지 말고 탐색기 링크로 직접 확인하세요." },
  checked: { en: `Last checked ${CHECKED} on Robinhood Chain (chain ID 4663).`, "zh-Hant": `最後核對：${CHECKED}，Robinhood Chain（鏈 ID 4663）。`, "zh-Hans": `最后核对：${CHECKED}，Robinhood Chain（链 ID 4663）。`, ko: `최종 확인: ${CHECKED}, Robinhood Chain (체인 ID 4663).` },
  contractsTitle: { en: "Contracts and wallets", "zh-Hant": "合約與錢包", "zh-Hans": "合约与钱包", ko: "컨트랙트와 지갑" },
  open: { en: "Open in explorer", "zh-Hant": "在瀏覽器查看", "zh-Hans": "在浏览器查看", ko: "탐색기에서 보기" },
  verifiedYes: { en: "Source verified on Blockscout", "zh-Hant": "原始碼已在 Blockscout 驗證", "zh-Hans": "源码已在 Blockscout 验证", ko: "Blockscout에서 소스 검증됨" },
  eoa: { en: "Single wallet (EOA), not a multisig", "zh-Hant": "單一錢包（EOA），不是多簽", "zh-Hans": "单一钱包（EOA），不是多签", ko: "단일 지갑(EOA), 멀티시그 아님" },
  rvynName: { en: "RVYN token", "zh-Hant": "RVYN 代幣", "zh-Hans": "RVYN 代币", ko: "RVYN 토큰" },
  rvynNote: { en: "Total supply 10,000,000, 18 decimals, fixed at creation. The full supply is currently held by the admin wallet; none has been sold or distributed.", "zh-Hant": "總量 10,000,000，18 位小數，建立時即固定。目前全部由管理錢包持有，尚未出售或分發。", "zh-Hans": "总量 10,000,000，18 位小数，创建时即固定。目前全部由管理钱包持有，尚未出售或分发。", ko: "총 공급량 10,000,000, 소수 18자리, 생성 시 고정. 현재 전량을 관리 지갑이 보유하며 판매·배분된 적이 없습니다." },
  platformName: { en: "Launch platform V2", "zh-Hant": "發射平台 V2", "zh-Hans": "发射平台 V2", ko: "런치 플랫폼 V2" },
  platformNote: { en: "Token launch factory, owned by the admin wallet; launch fee 0.001 ETH; not paused. Ownership transfers are two-step and cannot be renounced.", "zh-Hant": "代幣發射工廠，擁有者為管理錢包；發射費 0.001 ETH；目前未暫停。擁有權轉移需兩步驟，且無法放棄。", "zh-Hans": "代币发射工厂，拥有者为管理钱包；发射费 0.001 ETH；当前未暂停。所有权转移需两步，且无法放弃。", ko: "토큰 런치 팩토리, 소유자는 관리 지갑. 런치 수수료 0.001 ETH, 일시 중지 아님. 소유권 이전은 2단계이며 포기할 수 없습니다." },
  saleName: { en: "RVYN presale contract (V5, multisig sponsor)", "zh-Hant": "RVYN 預售合約（V5，多簽發起人）", "zh-Hans": "RVYN 预售合约（V5，多签发起人）", ko: "RVYN 프리세일 컨트랙트 (V5, 멀티시그 스폰서)" },
  saleNote: { en: "Deployed and source-verified, with the multisig below as sponsor and team beneficiary (fixed in the contract). Not open: it holds no RVYN, has no allowlist root and has raised 0. No sale date has been set.", "zh-Hant": "已部署且原始碼已驗證，發起人與團隊受益人為下方的多簽（寫死在合約中）。尚未開放：目前沒有 RVYN、沒有白名單 root、募得金額為 0。尚未訂定開售日期。", "zh-Hans": "已部署且源码已验证，发起人与团队受益人为下方的多签（写死在合约中）。尚未开放：当前没有 RVYN、没有白名单 root、募得金额为 0。尚未确定开售日期。", ko: "배포 및 소스 검증 완료. 스폰서와 팀 수혜자는 아래 멀티시그입니다(계약에 고정). 열려 있지 않으며 RVYN 보유 0, 화이트리스트 루트 없음, 모금액 0. 판매 일정은 정해지지 않았습니다." },
  oldSaleName: { en: "Earlier presale contract (V5, superseded)", "zh-Hant": "先前的預售合約（V5，已被取代）", "zh-Hans": "先前的预售合约（V5，已被取代）", ko: "이전 프리세일 컨트랙트 (V5, 대체됨)" },
  oldSaleNote: { en: "Same source code, but its sponsor is the single admin wallet, which cannot be changed. It was never funded or opened and will not be used.", "zh-Hant": "同一份原始碼，但發起人是單一管理錢包且無法更改。從未入庫或開放，之後也不會使用。", "zh-Hans": "同一份源码，但发起人是单一管理钱包且无法更改。从未入库或开放，之后也不会使用。", ko: "같은 소스 코드이지만 스폰서가 단일 관리 지갑이며 변경할 수 없습니다. 입금·개시된 적이 없고 사용하지 않습니다." },
  safeName: { en: "Multisig (Safe, 2 of 3)", "zh-Hant": "多簽（Safe，3 取 2）", "zh-Hans": "多签（Safe，3 取 2）", ko: "멀티시그 (Safe, 3 중 2)" },
  safeNote: { en: "Three signers; any two must approve a transaction. It controls the new presale contract. The platform ownership and the RVYN supply have not been moved to it yet.", "zh-Hant": "三位簽署人，任兩位同意才能執行。它掌管新的預售合約；平台擁有權與 RVYN 供應量尚未轉入。", "zh-Hans": "三位签署人，任两位同意才能执行。它掌管新的预售合约；平台所有权与 RVYN 供应量尚未转入。", ko: "서명자 3명 중 2명이 승인해야 실행됩니다. 새 프리세일 컨트랙트를 관리하며, 플랫폼 소유권과 RVYN 공급량은 아직 옮겨지지 않았습니다." },
  safeStatus: { en: "Safe v1.5.0 · 2 of 3 · signers checked onchain", "zh-Hant": "Safe v1.5.0・3 取 2・簽署人已於鏈上核對", "zh-Hans": "Safe v1.5.0・3 取 2・签署人已于链上核对", ko: "Safe v1.5.0 · 3 중 2 · 서명자 온체인 확인" },
  adminName: { en: "Admin, Treasury and sale sponsor wallet", "zh-Hant": "管理、金庫與預售發起錢包", "zh-Hans": "管理、金库与预售发起钱包", ko: "관리·트레저리·세일 스폰서 지갑" },
  adminNote: { en: "This single externally owned wallet still owns the launch platform and holds the RVYN supply. A multisig now exists (above); moving these over is planned, and until then treat them as a single point of control.", "zh-Hant": "這個單一外部帳戶目前仍是發射平台的擁有者並持有 RVYN 供應量。多簽已建立（見上方），之後會逐步轉移；在那之前，請視為單點控制。", "zh-Hans": "这个单一外部账户目前仍是发射平台的所有者并持有 RVYN 供应量。多签已建立（见上方），之后会逐步转移；在那之前，请视为单点控制。", ko: "이 단일 외부 소유 지갑이 아직 런치 플랫폼을 소유하고 RVYN 공급량을 보유합니다. 멀티시그가 이미 만들어졌으며(위), 이전은 계획 중입니다. 그 전까지는 단일 통제 지점으로 간주하세요." },
  auditTitle: { en: "What has not been done", "zh-Hant": "尚未完成的事", "zh-Hans": "尚未完成的事", ko: "아직 하지 않은 것" },
  auditBody: { en: "No independent third party has audited these contracts. We have run our own tests and reviews, but that is not an audit. Do not risk funds you cannot afford to lose.", "zh-Hant": "這些合約尚未經過獨立第三方審計。我們做過自己的測試與審查，但那不等於審計。請勿投入無法承受損失的資金。", "zh-Hans": "这些合约尚未经过独立第三方审计。我们做过自己的测试与审查，但那不等于审计。请勿投入无法承受损失的资金。", ko: "이 컨트랙트들은 독립된 제3자의 감사를 받지 않았습니다. 자체 테스트와 검토는 했지만 감사가 아닙니다. 잃어도 되는 금액만 사용하세요." },
  howTitle: { en: "How to check this yourself", "zh-Hant": "如何自己核對", "zh-Hans": "如何自己核对", ko: "직접 확인하는 방법" },
  how1: { en: "Open an address above in the explorer and compare it with the address shown in your wallet before signing.", "zh-Hant": "在瀏覽器開啟上方地址，簽署前與錢包顯示的地址比對。", "zh-Hans": "在浏览器打开上方地址，签署前与钱包显示的地址比对。", ko: "위 주소를 탐색기에서 열고, 서명 전에 지갑에 표시된 주소와 비교하세요." },
  how2: { en: "On a verified contract, use the Read Contract tab to see owner, treasury and state directly from the chain.", "zh-Hant": "在已驗證的合約上，用 Read Contract 分頁直接從鏈上讀取擁有者、金庫與狀態。", "zh-Hans": "在已验证的合约上，用 Read Contract 标签页直接从链上读取拥有者、金库与状态。", ko: "검증된 컨트랙트에서는 Read Contract 탭으로 소유자, 트레저리, 상태를 체인에서 직접 읽으세요." },
  how3: { en: "We never ask for private keys or recovery phrases, and we never DM you first. Official news: @RovynCORE on X.", "zh-Hant": "我們絕不索取私鑰或助記詞，也不會主動私訊你。官方消息：X 上的 @RovynCORE。", "zh-Hans": "我们绝不索取私钥或助记词，也不会主动私信你。官方消息：X 上的 @RovynCORE。", ko: "개인 키나 복구 문구는 절대 요청하지 않으며 먼저 DM을 보내지 않습니다. 공식 소식: X의 @RovynCORE." },
  report: { en: "Found a security issue? Email via the contact in /.well-known/security.txt or message @RovynCORE on X.", "zh-Hant": "發現安全問題？請見 /.well-known/security.txt，或在 X 私訊 @RovynCORE。", "zh-Hans": "发现安全问题？请见 /.well-known/security.txt，或在 X 私信 @RovynCORE。", ko: "보안 문제를 발견하셨나요? /.well-known/security.txt를 확인하거나 X에서 @RovynCORE에 메시지를 보내세요." },
  source: { en: "Source code on GitHub (MIT)", "zh-Hant": "GitHub 原始碼（MIT）", "zh-Hans": "GitHub 源码（MIT）", ko: "GitHub 소스 코드 (MIT)" },
  legal: { en: "Legal notice", "zh-Hant": "法律聲明", "zh-Hans": "法律声明", ko: "법적 고지" },
} satisfies Record<string, Copy>;

const rows = [
  { name: copy.rvynName, note: copy.rvynNote, address: "0x545a1ff27596de2f31480df39aa9548f363fc361", kind: "token", verified: true },
  { name: copy.platformName, note: copy.platformNote, address: "0x2577d544bc65450dadcc712d0fd4d2aa51195957", kind: "address", verified: true },
  { name: copy.saleName, note: copy.saleNote, address: "0x6496fc99ba4d5904e6c99488a9a9f477605146ac", kind: "address", verified: true },
  { name: copy.safeName, note: copy.safeNote, address: "0xe574e30153efcd94F686124B2d586A0643b33Ef4", kind: "address", verified: "safe" },
  { name: copy.oldSaleName, note: copy.oldSaleNote, address: "0x3cb9443f4726155817106a0fe115b26e9ad14b5f", kind: "address", verified: true },
  { name: copy.adminName, note: copy.adminNote, address: "0xEE4C435b9207bA5bB5f4860156409Ae78032ff6e", kind: "address", verified: null },
] as const;

export default function TransparencyPage() {
  const { locale } = useLanguage();
  const t = (value: Copy) => value[locale];
  return (
    <main className="game-page transparency-page" lang={locale}>
      <section className="game-chapter transparency-head" aria-labelledby="transparency-title">
        <div className="game-chapter__copy">
          <span className="game-chapter__kicker">{t(copy.kicker)}</span>
          <h1 id="transparency-title">{t(copy.title)}</h1>
          <p>{t(copy.lead)}</p>
          <p className="transparency-checked">{t(copy.checked)}</p>
        </div>
      </section>
      <section className="game-principles" aria-labelledby="transparency-contracts">
        <div className="game-principles__head">
          <span className="game-chapter__kicker">{t(copy.contractsTitle)}</span>
          <h2 id="transparency-contracts">{t(copy.contractsTitle)}</h2>
        </div>
        <ul className="transparency-list">
          {rows.map((row) => (
            <li className="game-principles__card transparency-card" key={row.address}>
              <h3>{t(row.name)}</h3>
              <p>{t(row.note)}</p>
              <code className="transparency-address">{row.address}</code>
              <p className="transparency-status">
                {row.verified === null ? t(copy.eoa) : row.verified === "safe" ? t(copy.safeStatus) : t(copy.verifiedYes)}
              </p>
              <a href={`${EXPLORER}/${row.kind}/${row.address}`} target="_blank" rel="noreferrer">{t(copy.open)} <ArrowUpRight size={15} aria-hidden="true" /></a>
            </li>
          ))}
        </ul>
      </section>
      <section className="game-principles" aria-labelledby="transparency-audit">
        <div className="game-principles__head">
          <span className="game-chapter__kicker">{t(copy.auditTitle)}</span>
          <h2 id="transparency-audit">{t(copy.auditTitle)}</h2>
        </div>
        <p className="transparency-body">{t(copy.auditBody)}</p>
      </section>
      <section className="game-principles" aria-labelledby="transparency-how">
        <div className="game-principles__head">
          <span className="game-chapter__kicker">{t(copy.howTitle)}</span>
          <h2 id="transparency-how">{t(copy.howTitle)}</h2>
        </div>
        <ol className="transparency-steps">
          <li>{t(copy.how1)}</li>
          <li>{t(copy.how2)}</li>
          <li>{t(copy.how3)}</li>
        </ol>
        <p className="transparency-body">{t(copy.report)}</p>
        <div className="game-principles__links">
          <a href="https://github.com/RovynCore/rovyncore" target="_blank" rel="noreferrer">{t(copy.source)} <ArrowUpRight size={15} aria-hidden="true" /></a>
          <Link href="/legal">{t(copy.legal)} <ArrowUpRight size={15} aria-hidden="true" /></Link>
          <Link href="/rvyn">RVYN <ArrowUpRight size={15} aria-hidden="true" /></Link>
        </div>
      </section>
    </main>
  );
}
