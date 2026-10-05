"use client";
import {
  useLanguage,
} from "@/components/language-provider";
import { useCallback, useState, useEffect } from "react";
import {
  createPublicClient,
  http,
  encodeFunctionData,
  formatEther,
  type Hex,
} from "viem";
import { ArrowUpRight, Check, Copy, Orbit } from "lucide-react";
import { toast } from "sonner";
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
import Image from "next/image";
import { RetainedRvynTokenomics } from "@/components/visual/rvyn-canonical";
import { useScrollReveal } from "@/components/scroll-reveal";
import { RvynEligibilityFlow } from "@/components/rvyn-eligibility-flow";
import { PresaleTerms } from "@/components/presale-terms";
import { HeroHud, TelemetryRail } from "@/components/hero-hud";

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

export default function RovynCore() {
  const { tr, locale } = useLanguage();

  const { config, transact, account, connect } = usePlatform();
  const [buyRef, buyClassName, buyStyle] = useScrollReveal<HTMLElement>({ delay: 40 });
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
  const plannedLabel = {
    en: "PLANNED · NOT LIVE",
    "zh-Hant": "規劃值・尚未生效",
    "zh-Hans": "规划值・尚未生效",
    ko: "계획값 · 아직 미적용",
  }[locale];
  return (
    <main className="rvyn-page">
      <section className="genesis-hero content-motion-zone">
        <div className="hero-core-scene" aria-hidden="true"><Image className="core-backdrop" src="/genesis-core.webp" alt="" width={1000} height={1000} priority unoptimized /></div>
        <div className="hero-copy">
          <span className="tag">{tr("ROVYN CORE / $RVYN")}</span>
          <h1>{tr("每個偉大的起點，")}<br />{tr("都曾只是")}<span>{tr("一個想法。")}</span></h1>
          <p>{tr("RovynCore 是我們寫下的第一行。")}<br />{rvynPageCopy.heroGame[locale]}</p>
          <div className="rvyn-hero-actions"><a className="rvyn-hero-action rvyn-hero-action--primary" href="#allowlist"><span>{rvynPageCopy.heroRegister[locale]}</span><ArrowUpRight size={18} /></a><a className="rvyn-hero-action rvyn-hero-action--secondary" href="#buy"><span>{rvynPageCopy.heroPresale[locale]}</span><ArrowUpRight size={18} /></a></div>
          <span className="hero-note">{tr("已由 ROVYN CORE 平台發行")}</span>
        </div>
        <HeroHud />
        <TelemetryRail label="RVYN" cells={[
          { key: "net", label: { en: "NETWORK", "zh-Hant": "網路", "zh-Hans": "网络", ko: "네트워크" }, value: "Robinhood Chain · 4663" },
          { key: "supply", label: { en: "SUPPLY", "zh-Hant": "總量", "zh-Hans": "总量", ko: "총 공급량" }, value: "10,000,000 RVYN" },
          { key: "stage", label: { en: "STAGE", "zh-Hant": "階段", "zh-Hans": "阶段", ko: "단계" }, value: !saleDesk ? { en: "Checking", "zh-Hant": "確認中", "zh-Hans": "确认中", ko: "확인 중" } : saleDesk.purchasesOpen ? { en: "Presale open", "zh-Hant": "預售開放中", "zh-Hans": "预售开放中", ko: "프리세일 진행 중" } : saleDesk.registryOpen ? { en: "Whitelist open", "zh-Hant": "白名單登記中", "zh-Hans": "白名单登记中", ko: "화이트리스트 신청 중" } : saleDesk.phase === "sale_closed" ? { en: "Presale closed", "zh-Hant": "預售已結束", "zh-Hans": "预售已结束", ko: "프리세일 종료" } : { en: "Preparing", "zh-Hant": "準備中", "zh-Hans": "准备中", ko: "준비 중" }, live: Boolean(saleDesk?.purchasesOpen || saleDesk?.registryOpen) },
          { key: "reg", label: { en: "WHITELIST", "zh-Hant": "白名單", "zh-Hans": "白名单", ko: "화이트리스트" }, value: saleDesk?.registryOpen ? { en: "Registration open", "zh-Hant": "登記開放", "zh-Hans": "登记开放", ko: "신청 가능" } : { en: "Registration closed", "zh-Hant": "登記未開放", "zh-Hans": "登记未开放", ko: "신청 불가" } },
        ]} />
        <div className="rvyn-hero-contract">
          <span>{tr("合約")}</span>
          <code><span>{contractAddress.slice(0, 22)}</span><wbr /><span>{contractAddress.slice(22)}</span></code>
          <button type="button" className="rvyn-hero-contract__copy" aria-label={rvynPageCopy.copyContract[locale]} title={rvynPageCopy.copyContract[locale]} onClick={() => { void navigator.clipboard.writeText(contractAddress).then(() => toast.success(rvynPageCopy.copied[locale])).catch((cause) => toast.error(message(cause))); }}>
            <Copy size={16} aria-hidden="true" />
          </button>
        </div>
      </section>
      <section className="rvyn-allowlist workspace" id="allowlist" aria-labelledby="rvyn-allowlist-title">
        <div className="rvyn-allowlist__copy">
          <span className="eyebrow">RVYN / WHITELIST</span>
          <h2 id="rvyn-allowlist-title">{rvynPageCopy.checkAllowlist[locale]}</h2>
          <p>{saleDesk?.purchasesOpen ? rvynPageCopy.eligibilityOpen[locale] : rvynPageCopy.eligibility[locale]}</p>
          <RvynEligibilityFlow locale={locale} />
        </div>
        <div className="rvyn-allowlist__form panel">
          <p className={`rvyn-sale-status${saleDesk?.registryOpen ? " rvyn-sale-status--open" : ""}`} role="status">{!saleDesk ? rvynPageCopy.registrationUnavailable[locale] : saleDesk.registrationStatus === "scheduled" ? rvynPageCopy.registrationScheduled[locale] : saleDesk.registryOpen ? rvynPageCopy.registrationOpen[locale] : saleDesk.registrationStatus === "closed" ? rvynPageCopy.registrationExpired[locale] : rvynPageCopy.registrationClosed[locale]}</p>
          {saleDesk?.registrationOpensAt && saleDesk.registrationClosesAt && <p className="side-note">{rvynPageCopy.registrationOpens[locale]}: {new Date(saleDesk.registrationOpensAt * 1000).toLocaleString(locale, { timeZone: "Etc/GMT-8" })} · {rvynPageCopy.registrationCloses[locale]}: {new Date(saleDesk.registrationClosesAt * 1000).toLocaleString(locale, { timeZone: "Etc/GMT-8" })} (UTC+8)</p>}
          <div className="rvyn-allowlist__step rvyn-allowlist__step--register" id="allowlist-register">
            <div className="rvyn-allowlist__step-heading">
              <span className="rvyn-allowlist__step-index" aria-hidden="true">01</span>
              <div>
                <h3>{rvynPageCopy.registerHeading[locale]}</h3>
                <p>{rvynPageCopy.registerDescription[locale]}</p>
              </div>
            </div>
            <button type="button" className="primary full-width" disabled={!saleDesk?.registryOpen || checkBusy} onClick={() => void registerAllowlist()}>
              {checkBusy ? tr("處理中…") : saleDesk?.registryOpen ? rvynPageCopy.register[locale] : rvynPageCopy.registerUnavailable[locale]}
            </button>
          </div>
          <div className="rvyn-allowlist__step rvyn-allowlist__step--check">
            <div className="rvyn-allowlist__step-heading">
              <span className="rvyn-allowlist__step-index" aria-hidden="true">02</span>
              <div>
                <h3>{rvynPageCopy.checkHeading[locale]}</h3>
                <p>{rvynPageCopy.checkDescription[locale]}</p>
              </div>
            </div>
            <label className="block" htmlFor="rvyn-allowlist-address">{rvynPageCopy.walletAddress[locale]}</label>
            <div className="rvyn-allowlist__controls"><input id="rvyn-allowlist-address" value={checkAddress} onChange={(event) => { setCheckAddress(event.target.value); setCheckResult(null); }} placeholder="0x…" spellCheck={false} autoComplete="off" /><button type="button" className="secondary" disabled={checkBusy || !/^0x[a-fA-F0-9]{40}$/.test(checkAddress.trim())} onClick={() => void checkAllowlist()}>{checkBusy ? tr("處理中…") : rvynPageCopy.check[locale]}</button></div>
            {checkResult && <p role="status" className="rvyn-allowlist__result">{checkResult.result === "listed" ? <Check size={17} /> : null}{checkResult.result === "listed" ? saleDesk?.purchasesOpen ? rvynPageCopy.listedOpen[locale] : rvynPageCopy.listed[locale] : checkResult.result === "not_listed" ? rvynPageCopy.notListed[locale] : checkResult.result === "pending" ? rvynPageCopy.pending[locale] : checkResult.result === "approved" ? rvynPageCopy.approved[locale] : rvynPageCopy.preparing[locale]}</p>}
          </div>
        </div>
      </section>
      <section
        ref={buyRef}
        className={`buy-section workspace ${buyClassName}`}
        style={buyStyle}
        id="buy"
      >
        <div>
          <div className="eyebrow">{tr("ONE TOKEN. THE FIRST CHAPTER.")}</div>
          <h2>{record?.identity.name || "RovynCore"} <span className="green">${record?.identity.symbol || "RVYN"}</span></h2>
          <p className="description">
            {rvynPageCopy.positioning[locale]}
          </p>
          <p className="muted">{rvynPageCopy.brandStory[locale]}</p>
          <div className="links">
            <a href="https://robinhoodchain.blockscout.com/token/0x545a1ff27596de2f31480df39aa9548f363fc361" target="_blank" rel="noreferrer">{{ en: "Token on explorer", "zh-Hant": "在瀏覽器查看代幣", "zh-Hans": "在浏览器查看代币", ko: "탐색기에서 토큰 보기" }[locale]} ↗</a>
            <Link href="/transparency">{{ en: "Transparency", "zh-Hant": "公開透明", "zh-Hans": "公开透明", ko: "투명성" }[locale]} ↗</Link>
            {config.socialX && <a href={config.socialX} target="_blank" rel="noreferrer">X ↗</a>}
            {config.socialTelegram && <a href={config.socialTelegram} target="_blank" rel="noreferrer">{tr("Telegram")} ↗</a>}
          </div>
        </div>
        <div className="panel presale-panel content-motion-zone">
          <Orbit className="green" />
          <h3>{rvynPageCopy.saleHeading[locale]}</h3>
          <p className={`rvyn-sale-status rvyn-sale-status--${saleState}`}><span key={saleStateCopy}>{saleStateCopy}</span></p>
          {canPurchase && sale ? <>
            <p className="muted top-gap">{tr("固定價格 · 從已核准的 RVYN 庫存交付")}</p>
            <label className="top-gap block">
              {tr("購買數量（RVYN）")}
              <input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>
            <dl className="receipt">
              <dt>{tr("每枚價格")}</dt><dd>{formatEther(sale.price)} ETH</dd>
              <dt>{tr("付款")}</dt><dd>{valid ? formatEther(qty * sale.price) : "—"} ETH</dd>
              <dt>{tr("可購買庫存")}</dt><dd>{Number(formatEther(sale.inventory)).toLocaleString(locale)}</dd>
            </dl>
            {error && <p className="error">{error}</p>}
            <button className="primary full-width" disabled={busy || !valid || qty * 10n ** 18n > sale.inventory} onClick={() => void buy()}>
              {busy ? tr("處理中…") : tr("連接錢包並購買")}
            </button>
          </> : <div className="rvyn-presale-plan">
            <button className="primary full-width" disabled aria-disabled="true">{rvynPageCopy.purchasesNotOpen[locale]}</button>
            <p className="side-note">{!saleDesk ? rvynPageCopy.phaseUnavailable[locale] : verifiedV5 ? rvynPageCopy.verifiedDisclaimer[locale] : rvynPageCopy.planDisclaimer[locale]}</p>
            <PresaleTerms title={verifiedV5 ? rvynPageCopy.verifiedTerms[locale] : rvynPageCopy.plannedTerms[locale]} badge={verifiedV5 ? rvynPageCopy.verifiedLabel[locale] : plannedLabel}><dl className="receipt">
              <dt>{verifiedV5 ? rvynPageCopy.verifiedAllocation[locale] : rvynPageCopy.planAllocation[locale]}</dt><dd>{Number(RVYN_MODEL.presaleTokens).toLocaleString(locale)} RVYN</dd>
              <dt>{verifiedV5 ? rvynPageCopy.verifiedPrice[locale] : rvynPageCopy.planPrice[locale]}</dt><dd>{RVYN_MODEL.priceEth} ETH</dd>
              <dt>{verifiedV5 ? rvynPageCopy.verifiedWalletCap[locale] : rvynPageCopy.planWalletCap[locale]}</dt><dd>{RVYN_MODEL.walletCapTokens.toLocaleString(locale)} RVYN</dd>
            </dl></PresaleTerms>
          </div>}
          {config.presaleVersion !== 5 && isPresale && sale?.state === (isV6 ? 3n : 2n) && (
            <button className="secondary full-width top-gap" disabled={busy} onClick={() => void claim()}>{tr("領取已購買的 RVYN")}</button>
          )}
          {config.presaleVersion !== 5 && !isV6 && isPresale && sale?.state === 3n && (
            <button className="secondary full-width top-gap" disabled={busy} onClick={() => void refund()}>{rvynPageCopy.refund[locale]}</button>
          )}
          {canPurchase ? <p className="side-note">{tr("Gas 另計。購買不代表獲得公司股份、分潤或保證報酬。")}</p> : null}
          {canPurchase && isV6 ? <p className="side-note">{tr("購買時不會立即收到 RVYN；預售結束並結算後，請回到本頁領取。沒有退款。")}</p> : null}
        </div>
      </section>
      <RetainedRvynTokenomics locale={locale} contractV5={verifiedV5} translate={tr} />
    </main>
  );
}
