"use client";
import { useLanguage } from "@/components/language-provider";
import { useCallback, useState, useEffect } from "react";
import { createPublicClient, http, encodeFunctionData, formatEther, type Hex } from "viem";
import { ArrowRight, ArrowUpRight, Check, Info, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import Image from "next/image";
import Link from "@/components/site-link";
import { usePlatform } from "@/components/platform-context";
import { message, api } from "@/components/platform-provider";
import { CHAINS } from "@/packages/web3/config";
import artifacts from "@/packages/web3/artifacts.json";
import rvynArtifacts from "@/packages/contracts/v2/artifacts/contracts.json";
import rvynV4Artifacts from "@/packages/contracts/v4/artifacts/contracts.json";
import rvynV5Artifacts from "@/packages/contracts/v5/artifacts/contracts.json";
import rvynV6Artifacts from "@/packages/contracts/v6/artifacts/contracts.json";
import { RVYN_MODEL } from "@/lib/rvyn-model";
import { Address, Countdown, formatUtc8, Head, type Copy4 } from "@/components/rv/ui";
import { AllocationBar } from "@/components/rv/allocation";

type OfficialRvynRecord = {
  asset: { chainId: number; network: string; contractAddress: string; recordStatus: string; url: string };
  identity: { name: string; symbol: string };
  originalState: { values: Record<string, unknown> } | null;
};
type PublicSaleStatus = {
  phase: "allowlist_prep" | "allowlist_open" | "sale_open" | "sale_closed";
  effectivePhase: string;
  purchasesOpen: boolean;
  registryOpen: boolean;
  registrationStatus: "disabled" | "scheduled" | "open" | "closed";
  registrationOpensAt: number | null;
  registrationClosesAt: number | null;
  allowlistEnforcedOnchain: boolean;
  listedCount: number | null;
};
type AllowlistCheck = PublicSaleStatus & { result: "enter_address" | "preparing" | "pending" | "approved" | "listed" | "not_listed"; address?: string; proof?: Hex[] };

const rvynPageCopy = {
  saleHeading: { en: "RVYN presale status", "zh-Hant": "RVYN 預售狀態", "zh-Hans": "RVYN 预售状态", ko: "RVYN 프리세일 상태" },
  planAllocation: { en: "Planned presale allocation", "zh-Hant": "預售配置（規劃）", "zh-Hans": "预售配置（规划）", ko: "프리세일 배정량 (계획)" },
  planPrice: { en: "Planned price", "zh-Hant": "規劃單價", "zh-Hans": "规划单价", ko: "계획 가격" },
  planWalletCap: { en: "Planned wallet cap", "zh-Hant": "單錢包上限（規劃）", "zh-Hans": "单钱包上限（规划）", ko: "지갑 한도 (계획)" },
  planDisclaimer: { en: "These tokenomics figures are plans, not an open presale or live onchain fundraising status.", "zh-Hant": "以上為代幣經濟模型規劃，不代表預售已開放或目前鏈上募資狀態。", "zh-Hans": "以上为代币经济模型规划，不代表预售已开放或当前链上募资状态。", ko: "이 토큰 이코노미 수치는 계획이며, 프리세일이 열렸거나 현재 온체인 모금 중임을 뜻하지 않습니다." },
  priceDisclaimer: { en: "The presale is not open; this is a planning figure, not a live sale price.", "zh-Hant": "預售尚未開放；此為模型規劃值，不是現行募資價格。", "zh-Hans": "预售尚未开放；此为模型规划值，不是当前募资价格。", ko: "프리세일은 아직 열리지 않았으며 이 값은 계획일 뿐 현재 판매 가격이 아닙니다." },
  capDisclaimer: { en: "This cap is not an active presale condition.", "zh-Hant": "此額度尚未成為開放中的預售條件。", "zh-Hans": "此额度尚未成为开放中的预售条件。", ko: "이 한도는 현재 진행 중인 프리세일 조건이 아닙니다." },
  record: { en: "Official onchain record", "zh-Hant": "官方鏈上紀錄", "zh-Hans": "官方链上记录", ko: "공식 온체인 기록" },
  noPool: { en: "No official pool observed", "zh-Hant": "尚未觀測到官方交易池", "zh-Hans": "尚未观测到官方交易池", ko: "공식 풀 미관측" },
  decimals: { en: "Decimals", "zh-Hant": "小數位", "zh-Hans": "小数位", ko: "소수 자릿수" },
  copyContract: { en: "Copy contract", "zh-Hant": "複製合約", "zh-Hans": "复制合约", ko: "계약 주소 복사" },
  copied: { en: "Contract copied", "zh-Hant": "已複製合約地址", "zh-Hans": "已复制合约地址", ko: "계약 주소 복사됨" },
  recordUnavailable: { en: "Record temporarily unavailable. Check the onchain page for the latest verified details.", "zh-Hant": "紀錄暫時無法讀取，請至鏈上紀錄頁核對最新資料。", "zh-Hans": "记录暂时无法读取，请到链上记录页核对最新资料。", ko: "기록을 일시적으로 읽을 수 없습니다. 온체인 기록 페이지에서 최신 정보를 확인하세요." },
  checkAllowlist: { en: "Whitelist", "zh-Hant": "白名單", "zh-Hans": "白名单", ko: "화이트리스트" },
  heroRegister: { en: "Whitelist registration", "zh-Hant": "白名單登記", "zh-Hans": "白名单登记", ko: "화이트리스트 신청" },
  heroPresale: { en: "RVYN presale", "zh-Hant": "預售購買", "zh-Hans": "预售购买", ko: "RVYN 프리세일" },
  registerHeading: { en: "Register for the whitelist", "zh-Hant": "登記白名單", "zh-Hans": "登记白名单", ko: "지갑 신청" },
  registerDescription: { en: "Connect your wallet and sign a login message to submit an application. Approval and publication of the onchain whitelist are separate steps; signing alone does not grant purchase eligibility.", "zh-Hant": "連接錢包並簽署登入訊息，即可送出登記申請。管理端核准並發布鏈上白名單後才會取得購買資格；簽署本身不會直接取得資格。", "zh-Hans": "连接钱包并签署登录消息，即可提交登记申请。管理端批准并发布链上白名单后才会取得购买资格；签署本身不会直接取得资格。", ko: "지갑을 연결하고 로그인 메시지에 서명하면 신청이 제출됩니다. 관리자의 승인과 온체인 화이트리스트 게시 후에야 구매 자격이 생기며, 서명만으로 자격이 부여되지는 않습니다." },
  register: { en: "Connect, sign & register", "zh-Hant": "連接錢包並簽署登記", "zh-Hans": "连接钱包并签署登记", ko: "지갑 연결·서명 후 신청" },
  registerUnavailable: { en: "Whitelist registration not open", "zh-Hant": "目前尚未開放登記", "zh-Hans": "目前尚未开放登记", ko: "신청 기간이 아닙니다" },
  checkHeading: { en: "Check whitelist status", "zh-Hant": "查詢白名單狀態", "zh-Hans": "查询白名单状态", ko: "신청 상태 확인" },
  checkDescription: { en: "Enter a wallet address to see its application and onchain eligibility status.", "zh-Hant": "輸入錢包地址，查看登記、審核及鏈上購買資格狀態。", "zh-Hans": "输入钱包地址，查看登记、审核及链上购买资格状态。", ko: "지갑 주소를 입력해 신청, 승인 및 온체인 구매 자격 상태를 확인하세요." },
  registrationOpen: { en: "Whitelist applications are open. Wallet login uses a signature only—no transaction, token approval, or payment.", "zh-Hant": "白名單登記開放中。錢包登入只簽署一段訊息，不會送出交易、核准 Token 或付款。", "zh-Hans": "白名单登记开放中。钱包登录只签署一段消息，不会发送交易、授权 Token 或付款。", ko: "허용 목록 신청이 열렸습니다. 지갑 로그인 서명만 필요하며 거래, 토큰 승인 또는 결제는 없습니다." },
  registrationScheduled: { en: "Whitelist applications are scheduled to open. The dates below are in UTC+8.", "zh-Hant": "白名單登記尚未開始，已排定開放時段（以下為 UTC+8 時間）。", "zh-Hans": "白名单登记尚未开始，已排定开放时段（以下为 UTC+8 时间）。", ko: "허용 목록 신청이 아직 시작되지 않았습니다. 아래 일정은 UTC+8 기준입니다." },
  registrationExpired: { en: "The whitelist application window has ended. Previously submitted applications may still be reviewed.", "zh-Hant": "白名單登記時段已截止；已送出的申請仍可繼續審核。", "zh-Hans": "白名单登记时段已截止；已提交的申请仍可继续审核。", ko: "허용 목록 신청 기간이 종료되었습니다. 기존 신청은 계속 검토될 수 있습니다." },
  registrationOpens: { en: "Opens", "zh-Hant": "開放", "zh-Hans": "开放", ko: "시작" },
  registrationCloses: { en: "Closes", "zh-Hant": "截止", "zh-Hans": "截止", ko: "마감" },
  registrationClosed: { en: "Whitelist registration is not open right now.", "zh-Hant": "目前尚未開放白名單登記。", "zh-Hans": "目前尚未开放白名单登记。", ko: "현재 신청 기간이 아닙니다." },
  registrationUnavailable: { en: "Whitelist status is temporarily unavailable. Registration remains closed.", "zh-Hant": "白名單狀態暫時無法讀取，登記維持關閉。", "zh-Hans": "白名单状态暂时无法读取，登记维持关闭。", ko: "화이트리스트 상태를 일시적으로 확인할 수 없어 신청은 닫힌 상태입니다." },
  registrationSubmitted: { en: "Your wallet application is submitted.", "zh-Hant": "此錢包已送出登記申請。", "zh-Hans": "此钱包已提交登记申请。", ko: "지갑 신청이 제출되었습니다." },
  registrationExisting: { en: "This wallet already has an application; its current status is shown below.", "zh-Hant": "這個錢包已有登記紀錄，目前狀態如下。", "zh-Hans": "这个钱包已有登记记录，当前状态如下。", ko: "이 지갑은 이미 신청되어 있으며 현재 상태는 아래에 표시됩니다." },
  eligibilityOpen: { en: "A listed wallet is eligible to buy RVYN under the published onchain root. It is not an NFT or a token allocation.", "zh-Hant": "列入名單的錢包，依已發布的鏈上根值取得購買 RVYN 的資格；這不是 NFT，也不代表代幣配額。", "zh-Hans": "列入名单的钱包，按已发布的链上根值取得购买 RVYN 的资格；这不是 NFT，也不代表代币配额。", ko: "등록된 지갑은 게시된 온체인 루트에 따라 RVYN 구매 자격을 갖습니다. NFT나 토큰 배정은 아닙니다." },
  pending: { en: "Application received; awaiting review.", "zh-Hant": "已收到申請，等待審核。", "zh-Hans": "已收到申请，等待审核。", ko: "신청 접수됨 · 검토 대기" },
  approved: { en: "Approved, but not yet eligible onchain; the root has not been published.", "zh-Hant": "已核准，但根值尚未上鏈，鏈上購買資格尚未生效。", "zh-Hans": "已核准，但根值尚未上链，链上购买资格尚未生效。", ko: "승인되었지만 루트가 아직 게시되지 않아 온체인 구매 자격은 없습니다." },
  refund: { en: "Refund my contribution", "zh-Hant": "退回我的預售款", "zh-Hans": "退回我的预售款", ko: "기여금 환불받기" },
  walletAddress: { en: "Wallet address", "zh-Hant": "錢包地址", "zh-Hans": "钱包地址", ko: "지갑 주소" },
  check: { en: "Check address", "zh-Hant": "查詢地址", "zh-Hans": "查询地址", ko: "주소 확인" },
  preparing: { en: "The whitelist is being prepared. No purchase is open.", "zh-Hant": "白名單準備中，目前沒有開放購買。", "zh-Hans": "白名单准备中，目前没有开放购买。", ko: "허용 목록을 준비 중입니다. 현재 구매할 수 없습니다." },
  listed: { en: "This address is listed. Purchases are not open.", "zh-Hant": "此地址已列入白名單；目前尚不可購買。", "zh-Hans": "此地址已列入白名单；目前尚不可购买。", ko: "이 주소는 목록에 있습니다. 구매는 아직 불가합니다." },
  listedOpen: { en: "This wallet is eligible under the published root and the presale is open. Verify all terms before submitting a purchase.", "zh-Hant": "此錢包已符合鏈上白名單資格且預售開放中；請在購買前再次核對完整條件。", "zh-Hans": "此钱包已符合链上白名单资格且预售开放中；请在购买前再次核对完整条件。", ko: "이 지갑은 게시된 루트에 따라 자격이 있으며 프리세일이 열려 있습니다. 구매 전에 모든 조건을 확인하세요." },
  notListed: { en: "This address is not listed. Purchases are not open.", "zh-Hant": "此地址尚未列入白名單；目前尚不可購買。", "zh-Hans": "此地址尚未列入白名单；目前尚不可购买。", ko: "이 주소는 목록에 없습니다. 구매는 아직 불가합니다." },
  eligibility: { en: "A listed wallet has eligibility to buy RVYN if a sale opens. It is not an NFT. It is not a live sale. Listing is not an allocation of tokens.", "zh-Hant": "列入白名單只代表未來若開售時購買 RVYN 的資格。它不是 NFT，目前也不是正在進行的販售；列入名單不代表已獲配代幣。", "zh-Hans": "列入白名单只代表未来若开售时购买 RVYN 的资格。它不是 NFT，目前也不是正在进行的销售；列入名单不代表已获配代币。", ko: "목록 등록은 판매가 열릴 경우 RVYN을 구매할 자격일 뿐입니다. NFT가 아니며 현재 판매 중이 아닙니다. 등록이 토큰 배정을 뜻하지 않습니다." },
  brandStory: { en: "RVYN is the first light in ROVYN CORE's constellation: a fixed-supply token whose origin is recorded onchain. Its story starts with a verifiable launch, not a promise of yield.", "zh-Hant": "RVYN 是 ROVYN CORE 星系裡的第一道光：一枚固定供應、起點可在鏈上核對的 Token。它的故事從可驗證的發行開始，而不是從收益承諾開始。", "zh-Hans": "RVYN 是 ROVYN CORE 星系里的第一道光：一枚固定供应、起点可在链上核对的 Token。它的故事从可验证的发行开始，而不是从收益承诺开始。", ko: "RVYN은 ROVYN CORE 별자리의 첫 번째 빛입니다. 발행 출처를 온체인에서 확인할 수 있는 고정 공급 토큰입니다. 수익 약속이 아닌 검증 가능한 발행에서 이야기가 시작됩니다." },
  heroGame: { en: "We're building our first game, with RVYN at the heart of its economy.", "zh-Hant": "我們正在打造第一款遊戲，RVYN 將是它經濟的核心。", "zh-Hans": "我们正在打造第一款游戏，RVYN 将是它经济的核心。", ko: "우리는 RVYN을 경제의 중심에 둔 첫 게임을 만들고 있습니다." },
  positioning: { en: "Planned as the core currency of our first game, now in development. No in-game use is live yet, and RVYN carries no staking, profit-sharing or promised returns.", "zh-Hant": "規劃為我們第一款遊戲的核心貨幣，遊戲目前開發中。遊戲內用途尚未上線；RVYN 不提供 staking、分潤或收益承諾。", "zh-Hans": "规划为我们第一款游戏的核心货币，游戏目前开发中。游戏内用途尚未上线；RVYN 不提供 staking、分润或收益承诺。", ko: "개발 중인 첫 게임의 핵심 화폐로 계획되어 있습니다. 게임 내 용도는 아직 제공되지 않으며, RVYN은 스테이킹, 이익 배분 또는 수익을 약속하지 않습니다." },
  purchasesNotOpen: { en: "Purchases not open", "zh-Hant": "目前尚未開放購買", "zh-Hans": "目前尚未开放购买", ko: "구매 미개시" },
  phaseUnavailable: { en: "Sale status unavailable. Purchases remain closed.", "zh-Hant": "銷售狀態暫不可讀，購買維持關閉。", "zh-Hans": "销售状态暂不可读，购买维持关闭。", ko: "판매 상태를 확인할 수 없어 구매가 닫혀 있습니다." },
  plannedTerms: { en: "Planned sale terms and allocations", "zh-Hant": "規劃中的銷售條件與配置", "zh-Hans": "规划中的销售条件与配置", ko: "예정된 판매 조건과 배분" },
  verifiedTerms: { en: "Sale contract terms and allocation caps", "zh-Hant": "預售合約條款與配置上限", "zh-Hans": "预售合约条款与配置上限", ko: "판매 계약 조건과 배분 상한" },
  verifiedLabel: { en: "CONTRACT CAPS · SALE CLOSED", "zh-Hant": "合約上限・尚未開售", "zh-Hans": "合约上限・尚未开售", ko: "계약 상한 · 판매 미개시" },
  verifiedAllocation: { en: "Sale allocation cap", "zh-Hant": "預售配置上限", "zh-Hans": "预售配置上限", ko: "판매 배분 상한" },
  verifiedPrice: { en: "Sale contract price", "zh-Hant": "預售合約單價", "zh-Hans": "预售合约单价", ko: "판매 계약 가격" },
  verifiedWalletCap: { en: "Sale wallet cap", "zh-Hant": "預售單錢包上限", "zh-Hans": "预售单钱包上限", ko: "판매 지갑 상한" },
  verifiedDisclaimer: { en: "These are deployed sale contract constants, not proof of funded inventory, transfers, an open sale or live fundraising. Check current onchain state before any purchase.", "zh-Hant": "以上為已部署預售合約常數，不代表庫存已轉入、代幣已分配、預售開放或正在募資。購買前仍須查核即時鏈上狀態。", "zh-Hans": "以上为已部署预售合约常数，不代表库存已转入、代币已分配、预售开放或正在募资。购买前仍须核对实时链上状态。", ko: "이는 배포된 판매 계약의 상수일 뿐 재고 입금, 토큰 분배, 판매 개시 또는 모금 진행을 증명하지 않습니다. 구매 전 최신 온체인 상태를 확인하세요." },
  verifiedSignal: { en: "Supply and decimals come from the official token record. The sale price and caps are deployed contract constants, but purchases are not open.", "zh-Hant": "供應量與小數位取自官方代幣紀錄；預售單價及上限為已部署合約常數，但目前未開放購買。", "zh-Hans": "供应量与小数位取自官方代币记录；预售单价及上限为已部署合约常数，但目前未开放购买。", ko: "공급량과 소수 자릿수는 공식 토큰 기록에서 확인됩니다. 판매 가격과 상한은 배포된 계약 상수이지만 구매는 아직 열리지 않았습니다." },
  allocationCaveat: { en: "Token allocations and presale terms are planning figures unless confirmed by the currently configured onchain contract. Purchases are enabled only when the live contract, published whitelist root, and public sale stage all agree. Locks and unsold-token treatment follow the deployed contract, not this description alone.", "zh-Hant": "除非由目前設定的鏈上合約確認，代幣配置與預售條件均屬規劃值。只有鏈上合約、已發布白名單根值與公開銷售階段彼此一致時，才會開放購買。鎖倉與未售 Token 處理以實際部署合約為準，不能只依賴本頁說明。", "zh-Hans": "除非由当前配置的链上合约确认，代币配置与预售条件均属规划值。只有链上合约、已发布白名单根值与公开销售阶段一致时，才会开放购买。锁仓与未售 Token 处理以实际部署合约为准，不能只依赖本页说明。", ko: "현재 설정된 온체인 계약으로 확인되지 않는 한 토큰 배분과 프리세일 조건은 계획값입니다. 온체인 계약, 게시된 허용 목록 루트, 공개 판매 단계가 모두 일치할 때만 구매가 열립니다. 잠금과 미판매 토큰 처리는 이 설명만이 아니라 실제 배포된 계약을 따릅니다." },
} as const;

const q = (en: string, zhHant: string, zhHans: string, ko: string): Copy4 => ({ en, "zh-Hant": zhHant, "zh-Hans": zhHans, ko });
const R = {
  heroTitle: q("The core of a world in the making.", "一個正在成形的世界的核心。", "一个正在成形的世界的核心。", "만들어지고 있는 세계의 중심."),
  joinNow: q("Register now", "立即登記", "立即登记", "지금 신청"),
  supply: q("Total supply", "總供應量", "总供应量", "총 공급량"),
  price: q("Presale price", "預售單價", "预售单价", "프리세일 가격"),
  cap: q("Per-wallet cap", "單錢包上限", "单钱包上限", "지갑당 한도"),
  stage: q("Stage", "階段", "阶段", "단계"),
  checking: q("Checking…", "確認中…", "确认中…", "확인 중…"),
  presaleOpen: q("Presale open", "預售開放中", "预售开放中", "프리세일 진행 중"),
  presaleClosed: q("Presale closed", "預售已結束", "预售已结束", "프리세일 종료"),
  regOpen: q("Registration open", "登記開放中", "登记开放中", "신청 가능"),
  opens: q("Opens", "開放", "开放", "시작"),
  preparing: q("Preparing", "準備中", "准备中", "준비 중"),
  scheduled: q("Scheduled", "已排程", "已排程", "예정"),
  ended: q("Registration ended", "登記已截止", "登记已截止", "신청 마감"),
  notOpen: q("Not open", "尚未開放", "尚未开放", "미개시"),
  now: q("Now", "目前", "当前", "현재"),
  pathEyebrow: q("How it works", "流程", "流程", "진행 방식"),
  pathTitle: q("Five steps from registration to RVYN in your wallet.", "從登記到 RVYN 入帳，共五步。", "从登记到 RVYN 入账，共五步。", "신청부터 지갑에 RVYN이 들어오기까지 다섯 단계."),
  pathLead: q("Each step is enforced by the sale contract or shown live on this page.", "每一步都由預售合約執行，或在本頁即時顯示。", "每一步都由预售合约执行，或在本页实时显示。", "각 단계는 판매 계약이 집행하거나 이 페이지에 실시간으로 표시됩니다."),
  s1: q("Register", "登記", "登记", "신청"),
  s1m: q("Dates are announced on this page.", "日期會公布在本頁。", "日期会公布在本页。", "일정은 이 페이지에 공개됩니다."),
  s2: q("Review and onchain list", "審核並上鏈名單", "审核并上链名单", "검토 및 온체인 목록"),
  s2m: q("Approved wallets are published onchain before the sale opens.", "核准的錢包會在開售前發布到鏈上。", "核准的钱包会在开售前发布到链上。", "승인된 지갑은 판매 전에 온체인에 게시됩니다."),
  s3: q("Presale (14 days)", "預售（14 天）", "预售（14 天）", "프리세일 (14일)"),
  s3m: q("0.0001 ETH per RVYN, up to 0.25 ETH per wallet.", "每枚 0.0001 ETH，每個錢包最多 0.25 ETH。", "每枚 0.0001 ETH，每个钱包最多 0.25 ETH。", "RVYN당 0.0001 ETH, 지갑당 최대 0.25 ETH."),
  s4: q("Settlement", "結算", "结算", "정산"),
  s4m: q("The pool is built and its LP locked. Anyone can settle 7 days after close.", "建立交易池並鎖定 LP。結束滿 7 天後任何人都能結算。", "建立交易池并锁定 LP。结束满 7 天后任何人都能结算。", "풀을 만들고 LP를 잠급니다. 종료 7일 후 누구나 정산할 수 있습니다."),
  s5: q("Claim RVYN", "領取 RVYN", "领取 RVYN", "RVYN 클레임"),
  s5m: q("Claim the RVYN you paid for on this page.", "在本頁領取你購買的 RVYN。", "在本页领取你购买的 RVYN。", "구매한 RVYN을 이 페이지에서 클레임합니다."),
  wlEyebrow: q("Step 1 · Whitelist", "第 1 步 · 白名單", "第 1 步 · 白名单", "1단계 · 화이트리스트"),
  w1: q("Connect your wallet", "連接錢包", "连接钱包", "지갑 연결"),
  w1b: q("Use your own EVM wallet. We never ask for a seed phrase.", "使用你自己的 EVM 錢包。我們不會索取助記詞。", "使用你自己的 EVM 钱包。我们不会索取助记词。", "본인의 EVM 지갑을 사용하세요. 시드 문구는 절대 요구하지 않습니다."),
  w2: q("Sign a login message", "簽署登入訊息", "签署登录消息", "로그인 메시지 서명"),
  w2b: q("It is not a transaction: no gas, no token approval, no payment.", "這不是交易：不花 gas、不授權代幣、不付款。", "这不是交易：不花 gas、不授权代币、不付款。", "거래가 아닙니다. 가스, 토큰 승인, 결제가 없습니다."),
  w3: q("Wait for review", "等待審核", "等待审核", "검토 대기"),
  w3b: q("Eligibility starts only after the approved list is published onchain.", "核准的名單發布上鏈後，才具備購買資格。", "核准的名单发布上链后，才具备购买资格。", "승인 목록이 온체인에 게시된 뒤에야 자격이 생깁니다."),
  scam: q("We will never DM you first or ask you to send funds to an address in a reply. Only use rovyncore.com.", "我們不會主動私訊你，也不會要你把資金轉到留言裡的地址。請只使用 rovyncore.com。", "我们不会主动私信你，也不会要你把资金转到留言里的地址。请只使用 rovyncore.com。", "먼저 DM을 보내거나 댓글 속 주소로 송금을 요청하지 않습니다. rovyncore.com만 이용하세요."),
  psEyebrow: q("Step 3 · Presale", "第 3 步 · 預售", "第 3 步 · 预售", "3단계 · 프리세일"),
  psLead: q("Terms fixed in the deployed V6 sale contract.", "以下條件寫死在已部署的 V6 預售合約中。", "以下条件写死在已部署的 V6 预售合约中。", "배포된 V6 판매 계약에 고정된 조건입니다."),
  hardCap: q("Total cap", "總上限", "总上限", "전체 한도"),
  length: q("Sale window", "銷售期", "销售期", "판매 기간"),
  lengthV: q("14 days once opened", "開售後 14 天", "开售后 14 天", "시작 후 14일"),
  delivery: q("Delivery", "交付", "交付", "지급"),
  deliveryV: q("Claim after settlement", "結算後領取", "结算后领取", "정산 후 클레임"),
  refund: q("Refund", "退款", "退款", "환불"),
  refundV: q("None", "無", "无", "없음"),
  saleContract: q("Sale contract (V6)", "預售合約（V6）", "预售合约（V6）", "판매 계약 (V6)"),
  buyTitle: q("Buy RVYN", "購買 RVYN", "购买 RVYN", "RVYN 구매"),
  amountHint: q("Whole tokens, up to 2,500 RVYN per wallet in total.", "以整數枚計，每個錢包累計最多 2,500 RVYN。", "以整数枚计，每个钱包累计最多 2,500 RVYN。", "정수 단위, 지갑당 누적 최대 2,500 RVYN."),
  tkEyebrow: q("Token", "代幣", "代币", "토큰"),
  network: q("Network", "網路", "网络", "네트워크"),
  tax: q("Buy / sell tax", "買賣稅", "买卖税", "매매 수수료"),
  taxV: q("None in the token contract", "代幣合約沒有", "代币合约没有", "토큰 계약에 없음"),
  explorer: q("View on explorer", "在區塊瀏覽器查看", "在区块浏览器查看", "탐색기에서 보기"),
  transparency: q("Transparency", "公開透明", "公开透明", "투명성"),
  alloc: q("Allocation caps", "配置上限", "配置上限", "배분 상한"),
  faqTitle: q("Questions people ask", "常見問題", "常见问题", "자주 묻는 질문"),
  risk: q("RVYN can lose all of its value. The contracts have not been independently audited. Nothing here is financial advice.", "RVYN 的價值可能歸零。合約未經獨立審計。本頁內容不構成投資建議。", "RVYN 的价值可能归零。合约未经独立审计。本页内容不构成投资建议。", "RVYN은 가치를 모두 잃을 수 있습니다. 계약은 독립 감사를 받지 않았습니다. 이 내용은 투자 조언이 아닙니다."),
  terms: q("Read the terms & risks", "閱讀條款與風險", "阅读条款与风险", "약관·위험 읽기"),
  faq: [
    [q("What is the whitelist?", "白名單是什麼？", "白名单是什么？", "화이트리스트란?"), q("Registering puts your wallet up for review. Once approved wallets are published onchain, those wallets may buy in the presale. It is not an NFT and not a token allocation.", "登記會讓你的錢包進入審核。核准的錢包發布上鏈後，才能在預售中購買。它不是 NFT，也不是代幣配額。", "登记会让你的钱包进入审核。核准的钱包发布上链后，才能在预售中购买。它不是 NFT，也不是代币配额。", "신청하면 지갑이 검토 대상이 됩니다. 승인된 지갑이 온체인에 게시되면 프리세일에서 구매할 수 있습니다. NFT도 토큰 배정도 아닙니다.")],
    [q("Does registering cost anything?", "登記要花錢嗎？", "登记要花钱吗？", "신청에 비용이 드나요?"), q("No. You only sign a login message: no transaction, no gas, no token approval.", "不用。你只需簽署一段登入訊息：沒有交易、不花 gas、不授權代幣。", "不用。你只需签署一段登录消息：没有交易、不花 gas、不授权代币。", "아니요. 로그인 메시지에만 서명합니다. 거래, 가스, 토큰 승인이 없습니다.")],
    [q("When is the presale?", "什麼時候預售？", "什么时候预售？", "프리세일은 언제인가요?"), q("No date has been set. It will be announced on this site and on our X account.", "尚未訂定日期，會公布在本站和我們的 X 帳號。", "尚未确定日期，会公布在本站和我们的 X 账号。", "일정은 정해지지 않았습니다. 이 사이트와 X 계정에 공지합니다.")],
    [q("When do I receive RVYN?", "什麼時候會收到 RVYN？", "什么时候会收到 RVYN？", "RVYN은 언제 받나요?"), q("After the sale closes and is settled. You then claim it on this page. Nothing is delivered at the moment you pay.", "預售結束並完成結算後，在本頁領取。付款當下不會交付代幣。", "预售结束并完成结算后，在本页领取。付款当下不会交付代币。", "판매 종료와 정산 후 이 페이지에서 클레임합니다. 결제 시점에는 지급되지 않습니다.")],
    [q("Can I get a refund?", "可以退款嗎？", "可以退款吗？", "환불받을 수 있나요?"), q("No. The sale contract has no refund function. Only take part with money you can afford to lose.", "不行。預售合約沒有退款功能。請只用你能承受損失的資金參與。", "不行。预售合约没有退款功能。请只用你能承受损失的资金参与。", "아니요. 판매 계약에는 환불 기능이 없습니다. 잃어도 되는 금액으로만 참여하세요.")],
    [q("What happens to the ETH raised?", "募到的 ETH 去哪裡？", "募到的 ETH 去哪里？", "모금된 ETH는 어떻게 되나요?"), q("At settlement at least half of it (plus any forwarded launchpad revenue) goes into the RVYN/ETH pool at the sale price, and the pool's LP is locked for 24 months. The rest is operating funds, which the multisig can withdraw at most 25% every 30 days.", "結算時，至少一半（加上轉入的發射台收益）會依預售價放入 RVYN/ETH 交易池，池子的 LP 鎖倉 24 個月。其餘為營運資金，多簽每 30 天最多提領 25%。", "结算时，至少一半（加上转入的发射台收益）会按预售价放入 RVYN/ETH 交易池，池子的 LP 锁仓 24 个月。其余为运营资金，多签每 30 天最多提取 25%。", "정산 시 최소 절반(전달된 런치패드 수익 포함)이 판매 가격으로 RVYN/ETH 풀에 들어가고 LP는 24개월 잠깁니다. 나머지는 운영 자금이며 멀티시그가 30일마다 최대 25%까지 인출할 수 있습니다.")],
    [q("Has the contract been audited?", "合約有審計嗎？", "合约有审计吗？", "계약은 감사를 받았나요?"), q("No independent audit. The source is verified on the explorer and the contracts were tested by the developers, but bugs may exist.", "沒有獨立審計。原始碼已在區塊瀏覽器驗證，並經開發者測試，但仍可能存在漏洞。", "没有独立审计。源码已在区块浏览器验证，并经开发者测试，但仍可能存在漏洞。", "독립 감사는 없습니다. 소스는 탐색기에서 검증되었고 개발자가 테스트했지만 버그가 있을 수 있습니다.")],
    [q("What is RVYN used for?", "RVYN 有什麼用途？", "RVYN 有什么用途？", "RVYN은 어디에 쓰이나요?"), q("It is planned as the core currency of our first game, which is in development. No in-game use is live yet.", "規劃為我們第一款遊戲的核心貨幣，遊戲開發中，目前還沒有遊戲內用途。", "规划为我们第一款游戏的核心货币，游戏开发中，目前还没有游戏内用途。", "개발 중인 첫 게임의 핵심 화폐로 계획되어 있습니다. 아직 게임 내 용도는 없습니다.")],
  ] as Array<[Copy4, Copy4]>,
};

export default function RovynCore() {
  const { tr, locale } = useLanguage();

  const { config, transact, account, connect } = usePlatform();
  const [amount, setAmount] = useState("1000");
  const [sale, setSale] = useState<{
    kind: "legacy" | "presale";
    active: boolean;
    state?: bigint;
    closedAt?: bigint;
    contribution?: bigint;
    inventory: bigint;
    price: bigint;
  } | null>(null);
  const [record, setRecord] = useState<OfficialRvynRecord | null>(null);
  const [saleDesk, setSaleDesk] = useState<PublicSaleStatus | null>(null);
  const [checkAddress, setCheckAddress] = useState("");
  const [checkResult, setCheckResult] = useState<AllowlistCheck | null>(null);
  const [checkBusy, setCheckBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const officialTokenAddress = config.genesis || (config.chainId === 4663 ? RVYN_MODEL.contractMainnet : null);
  const isPresale = config.presaleVersion === 2 || config.presaleVersion === 3 || config.presaleVersion === 4 || config.presaleVersion === 5 || config.presaleVersion === 6;
  const isV6 = config.presaleVersion === 6;
  const presaleAbi =
    isV6
      ? rvynV6Artifacts.RovynPresaleV6.abi
      : config.presaleVersion === 5
      ? rvynV5Artifacts.RovynPresaleV5.abi
      : config.presaleVersion === 4
      ? rvynV4Artifacts.GenesisPresaleV4.abi
      : config.presaleVersion === 3 ? rvynArtifacts.GenesisPresaleV3.abi : rvynArtifacts.GenesisPresale.abi;

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setRecord(null);
      if (!officialTokenAddress) return;
      void api<OfficialRvynRecord>(`v1/assets/${officialTokenAddress.toLowerCase()}`)
        .then((result) => { if (active) setRecord(result); })
        .catch(() => { if (active) setRecord(null); });
    }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [officialTokenAddress]);
  useEffect(() => {
    let active = true;
    const update = async () => {
      try {
        const status = await api<PublicSaleStatus>("rvyn/status");
        if (active) setSaleDesk(status);
      } catch {
        if (active) setSaleDesk(null);
      }
    };
    void update();
    const timer = window.setInterval(() => void update(), 30000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  async function checkAllowlist() {
    setCheckBusy(true);
    try {
      const result = await api<AllowlistCheck>(`rvyn/allowlist?address=${encodeURIComponent(checkAddress.trim())}`);
      setCheckResult(result);
    } catch (cause) {
      setCheckResult(null);
      toast.error(message(cause));
    } finally {
      setCheckBusy(false);
    }
  }

  async function registerAllowlist() {
    setCheckBusy(true);
    try {
      const currentStatus = await api<PublicSaleStatus>("rvyn/status");
      setSaleDesk(currentStatus);
      if (!currentStatus.registryOpen) throw new Error(rvynPageCopy.registerUnavailable[locale]);
      const walletAddress = await connect();
      setCheckAddress(walletAddress);
      const submission = await api<{ idempotent?: boolean }>("rvyn/register", {});
      const result = await api<AllowlistCheck>(`rvyn/allowlist?address=${encodeURIComponent(walletAddress)}`);
      setCheckResult(result);
      toast.success(submission.idempotent ? rvynPageCopy.registrationExisting[locale] : rvynPageCopy.registrationSubmitted[locale]);
    } catch (cause) {
      setCheckResult(null);
      toast.error(message(cause));
    } finally {
      setCheckBusy(false);
    }
  }

  const load = useCallback(async () => {
    if (!config.sale || !config.genesis) return;
    try {
      const c = createPublicClient({
        chain: CHAINS[config.chainId],
        transport: http(),
      });
      if (isPresale) {
        const [state, closedAt, endsAt, raised, hardCap, inventory] = await Promise.all([
          c.readContract({ address: config.sale, abi: presaleAbi, functionName: "state" }),
          c.readContract({ address: config.sale, abi: presaleAbi, functionName: "closedAt" }),
          c.readContract({ address: config.sale, abi: presaleAbi, functionName: "endsAt" }),
          c.readContract({ address: config.sale, abi: presaleAbi, functionName: "raised" }),
          c.readContract({ address: config.sale, abi: presaleAbi, functionName: "HARD_CAP" }),
          c.readContract({ address: config.genesis, abi: rvynArtifacts.LaunchToken.abi, functionName: "balanceOf", args: [config.sale] }),
        ]);
        setSale({
          kind: "presale",
          active: Number(state) === 1
            && (closedAt as bigint) === 0n
            && BigInt(Math.floor(Date.now() / 1000)) < (endsAt as bigint)
            && (raised as bigint) < (hardCap as bigint),
          state: BigInt(state as bigint | number),
          closedAt: closedAt as bigint,
          price: 10n ** 14n,
          inventory: inventory as bigint,
        });
      } else {
        const [active, price, inventory] = await Promise.all([
          c.readContract({ address: config.sale, abi: artifacts.GenesisSale.abi, functionName: "active" }),
          c.readContract({ address: config.sale, abi: artifacts.GenesisSale.abi, functionName: "pricePerToken" }),
          c.readContract({ address: config.genesis, abi: artifacts.LaunchToken.abi, functionName: "balanceOf", args: [config.sale] }),
        ]);
        setSale({ kind: "legacy", active: active as boolean, price: price as bigint, inventory: inventory as bigint });
      }
      setError("");
    } catch (e) {
      setSale(null);
      setError(message(e));
    }
  }, [config.chainId, config.sale, config.genesis, isPresale, presaleAbi]);
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) void load(); });
    return () => { cancelled = true; };
  }, [load]);
  const maxAmount = isPresale ? RVYN_MODEL.walletCapTokens : 1000000;
  const valid = /^[1-9][0-9]{0,6}$/.test(amount) && Number(amount) <= maxAmount;
  const qty = valid ? BigInt(amount) : 0n;
  async function buy() {
    setBusy(true);
    try {
      if (!config.sale || !sale || !valid || !saleDesk?.purchasesOpen || !saleDesk.allowlistEnforcedOnchain)
        throw new Error(tr("目前尚未開放購買"));
      let proof: Hex[] = [];
      if (config.presaleVersion === 4 || config.presaleVersion === 5 || isV6) {
        const buyer = account || await connect();
        const eligibility = await api<AllowlistCheck>(`rvyn/allowlist?address=${encodeURIComponent(buyer)}`);
        if (eligibility.result !== "listed" || !eligibility.proof)
          throw new Error(tr("此錢包尚未取得鏈上白名單資格"));
        proof = eligibility.proof;
      }
      await transact({
        title: tr("購買 RovynCore"),
        to: config.sale,
        data: encodeFunctionData({
          abi: isPresale ? presaleAbi : artifacts.GenesisSale.abi,
          functionName: "buy",
          args: config.presaleVersion === 4 || config.presaleVersion === 5 || isV6 ? [qty, proof] : [qty],
        }),
        value: qty * sale.price,
        details: [
          [tr("數量"), `${amount} RVYN`],
          [tr("Token"), config.genesis!],
        ],
      });
      toast.success(
        isPresale
          ? config.presaleVersion === 5
            ? tr("付款已確認，RVYN 已即時轉入你的錢包")
            : tr("預售款已記錄；結算後可領取 RVYN")
          : tr("RVYN 已轉入你的錢包"),
      );
      await load();
    } catch (e) {
      toast.error(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function claim() {
    setBusy(true);
    try {
      if (!isPresale || sale?.state !== (isV6 ? 3n : 2n) || !config.sale)
        throw new Error(tr("目前尚未進入領取階段"));
      const recipient = account || (await connect());
      await transact({
        title: tr("領取 RovynCore"),
        to: config.sale,
        data: encodeFunctionData({
          abi: presaleAbi,
          functionName: "claim",
          args: isV6 ? [] : [recipient],
        } as never),
        value: 0n,
      });
      toast.success(tr("RVYN 已轉入你的錢包"));
      await load();
    } catch (e) {
      toast.error(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function refund() {
    setBusy(true);
    try {
      if (!isPresale || sale?.state !== 3n || !config.sale)
        throw new Error(tr("目前尚未進入退款階段"));
      const recipient = account || await connect();
      await transact({
        title: rvynPageCopy.refund[locale],
        to: config.sale,
        data: encodeFunctionData({ abi: presaleAbi, functionName: "refund", args: [recipient] }),
        value: 0n,
        details: [[tr("退款地址"), recipient], [tr("退回金額"), tr("依合約記錄的本人實際付款額計算")]],
      });
      toast.success(tr("退款交易已確認"));
      await load();
    } catch (cause) {
      toast.error(message(cause));
    } finally {
      setBusy(false);
    }
  }
  const contractAddress = RVYN_MODEL.contractMainnet;
  const canPurchase = Boolean(sale?.active && saleDesk?.purchasesOpen && saleDesk.allowlistEnforcedOnchain);
  const saleState = canPurchase ? "open" : !saleDesk ? "unknown" : "closed";
  const saleStateCopy = {
    open: { en: "PRESALE OPEN", "zh-Hant": "預售進行中", "zh-Hans": "预售进行中", ko: "프리세일 진행 중" },
    closed: { en: "PURCHASES NOT OPEN", "zh-Hant": "目前未開放預售", "zh-Hans": "目前未开放预售", ko: "프리세일 미개시" },
    notConfigured: { en: "PRESALE NOT CONFIGURED", "zh-Hant": "尚未連結預售合約", "zh-Hans": "尚未关联预售合约", ko: "프리세일 계약 미연결" },
    unknown: { en: "PRESALE STATUS UNAVAILABLE", "zh-Hant": "預售狀態暫不可讀", "zh-Hans": "预售状态暂不可读", ko: "프리세일 상태 확인 불가" },
  }[saleState][locale];
  const verifiedV5 = config.chainId === 4663
    && officialTokenAddress?.toLowerCase() === RVYN_MODEL.contractMainnet
    && (!config.sale || (config.presaleVersion === 6 || (config.presaleVersion === 5 && ["0x3cb9443f4726155817106a0fe115b26e9ad14b5f", "0x6496fc99ba4d5904e6c99488a9a9f477605146ac"].includes(config.sale.toLowerCase()))));
  const t = (c: Copy4) => c[locale];
  const reg = saleDesk?.registrationStatus;
  const opensAt = saleDesk?.registrationOpensAt ?? null;
  const closesAt = saleDesk?.registrationClosesAt ?? null;
  // Where the visitor is on the path: 0 registration, 1 list published, 2 presale, 3 settlement, 4 claim.
  const stage = saleDesk?.purchasesOpen ? 2 : saleDesk?.phase === "sale_closed" ? (sale?.state === 3n ? 4 : 3) : saleDesk?.allowlistEnforcedOnchain ? 1 : 0;
  const statusLine = !saleDesk ? rvynPageCopy.registrationUnavailable[locale]
    : reg === "scheduled" ? rvynPageCopy.registrationScheduled[locale]
    : saleDesk.registryOpen ? rvynPageCopy.registrationOpen[locale]
    : reg === "closed" ? rvynPageCopy.registrationExpired[locale]
    : rvynPageCopy.registrationClosed[locale];
  const steps: Array<[Copy4, Copy4]> = [
    [R.s1, opensAt && closesAt ? { en: `${formatUtc8(opensAt, "en", false)} – ${formatUtc8(closesAt, "en", false)} (UTC+8)`, "zh-Hant": `${formatUtc8(opensAt, "zh-Hant", false)} – ${formatUtc8(closesAt, "zh-Hant", false)}（UTC+8）`, "zh-Hans": `${formatUtc8(opensAt, "zh-Hans", false)} – ${formatUtc8(closesAt, "zh-Hans", false)}（UTC+8）`, ko: `${formatUtc8(opensAt, "ko", false)} – ${formatUtc8(closesAt, "ko", false)} (UTC+8)` } : R.s1m],
    [R.s2, R.s2m], [R.s3, R.s3m], [R.s4, R.s4m], [R.s5, R.s5m],
  ];
  return (
    <main>
      <section className="rv-pagehead">
        <div className="rv-container rv-pagehead__inner">
          <div className="rv-pagehead__copy">
            <span className="rv-eyebrow">$RVYN · Robinhood Chain</span>
            <h1 className="rv-h1">RVYN<span className="rv-accent">.</span> {t(R.heroTitle)}</h1>
            <p className="rv-lead">{rvynPageCopy.positioning[locale]}</p>
            <div className="rv-row">
              <a className="rv-btn rv-btn--primary" href="#whitelist">{saleDesk?.registryOpen ? t(R.joinNow) : rvynPageCopy.heroRegister[locale]}<ArrowRight aria-hidden="true" /></a>
              <a className="rv-btn rv-btn--secondary" href="#presale">{rvynPageCopy.heroPresale[locale]}</a>
            </div>
            <Address value={contractAddress} locale={locale} href={`https://robinhoodchain.blockscout.com/token/${contractAddress}`} />
          </div>
          <div className="rv-hero__art rv-pagehead__art"><Image src="/rv-core.webp" alt="" width={600} height={600} priority unoptimized /></div>
        </div>
        <div className="rv-container" style={{ marginTop: 40 }}>
          <div className="rv-strip" style={{ ["--n" as string]: 4 }}>
            <div><span className="rv-stat__label">{t(R.supply)}</span><span className="rv-stat__value rv-num">10,000,000</span></div>
            <div><span className="rv-stat__label">{t(R.price)}</span><span className="rv-stat__value rv-num">{RVYN_MODEL.priceEth} ETH</span></div>
            <div><span className="rv-stat__label">{t(R.cap)}</span><span className="rv-stat__value rv-num">{RVYN_MODEL.walletCapEth} ETH</span></div>
            <div><span className="rv-stat__label">{t(R.stage)}</span><span className={`rv-pill${saleDesk?.registryOpen || saleDesk?.purchasesOpen ? " rv-pill--live" : reg === "scheduled" ? " rv-pill--warn" : ""}`}>{!saleDesk ? t(R.checking) : saleDesk.purchasesOpen ? t(R.presaleOpen) : saleDesk.registryOpen ? t(R.regOpen) : reg === "scheduled" && opensAt ? `${t(R.opens)} ${formatUtc8(opensAt, locale, false)}` : saleDesk.phase === "sale_closed" ? t(R.presaleClosed) : t(R.preparing)}</span></div>
          </div>
        </div>
      </section>

      <section className="rv-section--tight">
        <div className="rv-container">
          <Head eyebrow={t(R.pathEyebrow)} title={t(R.pathTitle)} lead={t(R.pathLead)} />
          <ol className="rv-steps" style={{ ["--n" as string]: 5 }}>
            {steps.map(([title, meta], i) => (
              <li key={title.en} className={`rv-step${i < stage ? " is-done" : i === stage ? " is-current" : ""}`}>
                <span className="rv-step__label">{String(i + 1).padStart(2, "0")}{i === stage ? ` · ${t(R.now)}` : ""}</span>
                <span className="rv-step__title">{t(title)}</span>
                <span className="rv-step__meta">{t(meta)}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="rv-section rv-section--line" id="whitelist" aria-labelledby="rv-whitelist-title">
        <div className="rv-container rv-split">
          <div className="rv-stack" style={{ ["--gap" as string]: "20px" }}>
            <Head eyebrow={t(R.wlEyebrow)} title={rvynPageCopy.checkAllowlist[locale]} id="rv-whitelist-title" lead={saleDesk?.purchasesOpen ? rvynPageCopy.eligibilityOpen[locale] : rvynPageCopy.eligibility[locale]} />
            <ol className="rv-numbered">
              <li><b>{t(R.w1)}</b><span>{t(R.w1b)}</span></li>
              <li><b>{t(R.w2)}</b><span>{t(R.w2b)}</span></li>
              <li><b>{t(R.w3)}</b><span>{t(R.w3b)}</span></li>
            </ol>
            <div className="rv-notice rv-notice--risk"><ShieldAlert aria-hidden="true" /><span>{t(R.scam)}</span></div>
          </div>
          <div className="rv-card rv-card--accent rv-stack" style={{ ["--gap" as string]: "22px" }}>
            <div className="rv-stack" style={{ ["--gap" as string]: "10px" }}>
              <span className={`rv-pill${saleDesk?.registryOpen ? " rv-pill--live" : reg === "scheduled" ? " rv-pill--warn" : ""}`} style={{ justifySelf: "start" }}>{saleDesk?.registryOpen ? t(R.regOpen) : reg === "scheduled" ? t(R.scheduled) : reg === "closed" ? t(R.ended) : t(R.notOpen)}</span>
              <p className="rv-small" role="status">{statusLine}</p>
              {reg === "scheduled" && opensAt ? <Countdown to={opensAt} locale={locale} /> : null}
              {opensAt && closesAt ? <p className="rv-caption">{rvynPageCopy.registrationOpens[locale]} {formatUtc8(opensAt, locale)} · {rvynPageCopy.registrationCloses[locale]} {formatUtc8(closesAt, locale)} (UTC+8)</p> : null}
            </div>
            <div className="rv-stack" style={{ ["--gap" as string]: "10px" }}>
              <h3 className="rv-h3">{rvynPageCopy.registerHeading[locale]}</h3>
              <p className="rv-small">{rvynPageCopy.registerDescription[locale]}</p>
              <button type="button" className="rv-btn rv-btn--primary rv-btn--block" disabled={!saleDesk?.registryOpen || checkBusy} onClick={() => void registerAllowlist()}>
                {checkBusy ? tr("處理中…") : saleDesk?.registryOpen ? rvynPageCopy.register[locale] : rvynPageCopy.registerUnavailable[locale]}
              </button>
            </div>
            <div className="rv-stack" style={{ ["--gap" as string]: "10px", paddingTop: 20, borderTop: "1px solid var(--rv-line)" }}>
              <h3 className="rv-h3">{rvynPageCopy.checkHeading[locale]}</h3>
              <div className="rv-field">
                <label htmlFor="rvyn-allowlist-address">{rvynPageCopy.walletAddress[locale]}</label>
                <div className="rv-input-row">
                  <input id="rvyn-allowlist-address" className="rv-input" value={checkAddress} onChange={(event) => { setCheckAddress(event.target.value); setCheckResult(null); }} placeholder="0x…" spellCheck={false} autoComplete="off" />
                  <button type="button" className="rv-btn rv-btn--secondary" disabled={checkBusy || !/^0x[a-fA-F0-9]{40}$/.test(checkAddress.trim())} onClick={() => void checkAllowlist()}>{checkBusy ? tr("處理中…") : rvynPageCopy.check[locale]}</button>
                </div>
              </div>
              {checkResult && <div className={`rv-notice${checkResult.result === "listed" ? " rv-notice--ok" : ""}`} role="status">{checkResult.result === "listed" ? <Check aria-hidden="true" /> : <Info aria-hidden="true" />}<span>{checkResult.result === "listed" ? saleDesk?.purchasesOpen ? rvynPageCopy.listedOpen[locale] : rvynPageCopy.listed[locale] : checkResult.result === "not_listed" ? rvynPageCopy.notListed[locale] : checkResult.result === "pending" ? rvynPageCopy.pending[locale] : checkResult.result === "approved" ? rvynPageCopy.approved[locale] : rvynPageCopy.preparing[locale]}</span></div>}
            </div>
          </div>
        </div>
      </section>

      <section className="rv-section rv-section--line" id="presale">
        <div className="rv-container rv-split">
          <div className="rv-stack" style={{ ["--gap" as string]: "20px" }}>
            <Head eyebrow={t(R.psEyebrow)} title={rvynPageCopy.saleHeading[locale]} lead={t(R.psLead)} />
            <dl className="rv-kv">
              <div><dt>{verifiedV5 ? rvynPageCopy.verifiedAllocation[locale] : rvynPageCopy.planAllocation[locale]}</dt><dd className="rv-num">{Number(RVYN_MODEL.presaleTokens).toLocaleString(locale)} RVYN</dd></div>
              <div><dt>{verifiedV5 ? rvynPageCopy.verifiedPrice[locale] : rvynPageCopy.planPrice[locale]}</dt><dd className="rv-num">{RVYN_MODEL.priceEth} ETH</dd></div>
              <div><dt>{verifiedV5 ? rvynPageCopy.verifiedWalletCap[locale] : rvynPageCopy.planWalletCap[locale]}</dt><dd className="rv-num">{RVYN_MODEL.walletCapTokens.toLocaleString(locale)} RVYN</dd></div>
              <div><dt>{t(R.hardCap)}</dt><dd className="rv-num">100 ETH</dd></div>
              <div><dt>{t(R.length)}</dt><dd>{t(R.lengthV)}</dd></div>
              <div><dt>{t(R.delivery)}</dt><dd>{t(R.deliveryV)}</dd></div>
              <div><dt>{t(R.refund)}</dt><dd>{t(R.refundV)}</dd></div>
            </dl>
            {config.sale ? <div className="rv-stack" style={{ ["--gap" as string]: "8px" }}><span className="rv-stat__label">{t(R.saleContract)}</span><Address value={config.sale} locale={locale} href={`https://robinhoodchain.blockscout.com/address/${config.sale}`} /></div> : null}
          </div>
          <div className="rv-card rv-stack" style={{ ["--gap" as string]: "18px" }}>
            <div className="rv-row rv-row--between">
              <h3 className="rv-h3">{t(R.buyTitle)}</h3>
              <span className={`rv-pill${canPurchase ? " rv-pill--live" : ""}`}>{saleStateCopy}</span>
            </div>
            {canPurchase && sale ? <>
              <div className="rv-field">
                <label htmlFor="rvyn-amount">{tr("購買數量（RVYN）")}</label>
                <input id="rvyn-amount" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
                <span className="rv-hint">{t(R.amountHint)}</span>
              </div>
              <dl className="rv-receipt">
                <div><dt>{tr("每枚價格")}</dt><dd>{formatEther(sale.price)} ETH</dd></div>
                <div><dt>{tr("付款")}</dt><dd>{valid ? formatEther(qty * sale.price) : "—"} ETH</dd></div>
                <div><dt>{tr("可購買庫存")}</dt><dd>{Number(formatEther(sale.inventory)).toLocaleString(locale)}</dd></div>
              </dl>
              {error && <p className="rv-error">{error}</p>}
              <button type="button" className="rv-btn rv-btn--primary rv-btn--block" disabled={busy || !valid || qty * 10n ** 18n > sale.inventory} onClick={() => void buy()}>
                {busy ? tr("處理中…") : tr("連接錢包並購買")}
              </button>
              {isV6 ? <p className="rv-caption">{tr("購買時不會立即收到 RVYN；預售結束並結算後，請回到本頁領取。沒有退款。")}</p> : null}
              <p className="rv-caption">{tr("Gas 另計。購買不代表獲得公司股份、分潤或保證報酬。")}</p>
            </> : <>
              <button type="button" className="rv-btn rv-btn--primary rv-btn--block" disabled aria-disabled="true">{rvynPageCopy.purchasesNotOpen[locale]}</button>
              <p className="rv-caption">{!saleDesk ? rvynPageCopy.phaseUnavailable[locale] : verifiedV5 ? rvynPageCopy.verifiedDisclaimer[locale] : rvynPageCopy.planDisclaimer[locale]}</p>
            </>}
            {config.presaleVersion !== 5 && isPresale && sale?.state === (isV6 ? 3n : 2n) && (
              <button type="button" className="rv-btn rv-btn--secondary rv-btn--block" disabled={busy} onClick={() => void claim()}>{tr("領取已購買的 RVYN")}</button>
            )}
            {config.presaleVersion !== 5 && !isV6 && isPresale && sale?.state === 3n && (
              <button type="button" className="rv-btn rv-btn--secondary rv-btn--block" disabled={busy} onClick={() => void refund()}>{rvynPageCopy.refund[locale]}</button>
            )}
          </div>
        </div>
      </section>

      <section className="rv-section rv-section--line" id="token">
        <div className="rv-container rv-split rv-split--wide-right">
          <div className="rv-stack" style={{ ["--gap" as string]: "20px" }}>
            <Head eyebrow={t(R.tkEyebrow)} title={`${record?.identity.name || "RovynCore"} $${record?.identity.symbol || "RVYN"}`} lead={rvynPageCopy.brandStory[locale]} />
            <dl className="rv-kv">
              <div><dt>{t(R.network)}</dt><dd>Robinhood Chain · 4663</dd></div>
              <div><dt>{t(R.supply)}</dt><dd className="rv-num">10,000,000</dd></div>
              <div><dt>{rvynPageCopy.decimals[locale]}</dt><dd className="rv-num">18</dd></div>
              <div><dt>{t(R.tax)}</dt><dd>{t(R.taxV)}</dd></div>
            </dl>
            <div className="rv-row">
              <a className="rv-btn rv-btn--secondary rv-btn--sm" href={`https://robinhoodchain.blockscout.com/token/${contractAddress}`} target="_blank" rel="noreferrer">{t(R.explorer)}<ArrowUpRight aria-hidden="true" /></a>
              <Link className="rv-btn rv-btn--secondary rv-btn--sm" href={`/assets/robinhood/${contractAddress}`}>{rvynPageCopy.record[locale]}</Link>
              <Link className="rv-btn rv-btn--secondary rv-btn--sm" href="/transparency">{t(R.transparency)}</Link>
            </div>
          </div>
          <div className="rv-card rv-card--accent">
            <div className="rv-row rv-row--between" style={{ marginBottom: 22 }}>
              <h3 className="rv-h3">{t(R.alloc)}</h3>
              <span className="rv-num rv-accent">10,000,000</span>
            </div>
            <AllocationBar locale={locale} />
            <p className="rv-caption" style={{ marginTop: 18 }}>{rvynPageCopy.allocationCaveat[locale]}</p>
          </div>
        </div>
      </section>

      <section className="rv-section rv-section--line">
        <div className="rv-container--narrow">
          <Head eyebrow="FAQ" title={t(R.faqTitle)} />
          {R.faq.map(([q, a]) => (
            <details className="rv-details" key={q.en}>
              <summary>{t(q)}</summary>
              <p className="rv-body">{t(a)}</p>
            </details>
          ))}
          <div className="rv-notice rv-notice--risk" style={{ marginTop: 32 }}><ShieldAlert aria-hidden="true" /><span>{t(R.risk)} <Link className="rv-link" href="/legal">{t(R.terms)}</Link></span></div>
        </div>
      </section>
    </main>
  );
}
