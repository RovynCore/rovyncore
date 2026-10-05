"use client";
import { OperationStatus } from "@/components/workflow-motion";
import { AdminOverview, type AdminTab } from "@/components/admin-overview";
import { SafeProposalPanel } from "@/components/safe-proposal-panel";
import { useLanguage } from "@/components/language-provider";
import { useState } from "react";
import Link from "@/components/site-link";
import {
  encodeDeployData,
  encodeFunctionData,
  formatEther,
  parseEther,
  keccak256,
  toBytes,
  type Address,
  type Abi,
  type Hex,
} from "viem";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePlatform } from "@/components/platform-context";
import { api, message } from "@/components/platform-provider";
import {
  CHAINS,
  OWNER,
  shortAddress,
  type ChainId,
} from "@/packages/web3/config";
import artifacts from "@/packages/web3/artifacts.json";
import rvynArtifacts from "@/packages/contracts/v2/artifacts/contracts.json";
import rvynV4Artifacts from "@/packages/contracts/v4/artifacts/contracts.json";
import rvynV5Artifacts from "@/packages/contracts/v5/artifacts/contracts.json";
import rvynV6Artifacts from "@/packages/contracts/v6/artifacts/contracts.json";
import { RVYN_MODEL } from "@/lib/rvyn-model";
import { type AllowlistWindow, type SaleDesk, type SalePhase } from "@/lib/rvyn-sale-desk";
import { isAddress } from "viem";

// Keep new deployments closed: the audited V5 mainnet contract is already registered.
const V5_MAINNET_DEPLOYMENT_ENABLED = false;
// V6 was deployed on 2026-10-06 (0xfa2b…f888); keep the control closed so it cannot create a second sale (preflight: scripts/v6-preflight.mjs).
const V6_MAINNET_DEPLOYMENT_ENABLED = false;

type AdminToken = {
  address: string;
  name: string;
  symbol: string;
  supply: string | number;
  hidden: boolean | number;
  metadata: { liquidityUrl?: string } | null;
};
type AdminReport = {
  id: string | number;
  token: string;
  reason: string;
  status: string;
};
type AdminDashboard = {
  tokens: AdminToken[];
  reports: AdminReport[];
  audit: unknown[];
  treasuryBalance: string;
  saleStatus: { state: string; raised: string; poolEth: string; withdrawable: string; closedAt: string; allowlistRoot: string; inventory: string; inventoryAllowance?: string; endsAt: string; settlementReady: boolean; failAvailable: boolean; liquidityRevenue?: string; lpRemaining?: string; productRemaining?: string; communityRemaining?: string; airdropRemaining?: string; teamVesting?: string; settledAt?: string; settleGraceEndsAt?: string; minPoolEth?: string; maxPoolEth?: string; operatingFunds?: string; claimableRemaining?: string; withdrawStepBps?: string } | null;
  saleDesk: SaleDesk;
  allowlistWindow: AllowlistWindow;
  allowlistWindowStatus: "disabled" | "scheduled" | "open" | "closed";
  allowlist: { wallet_address: string; status: string; source: string; updated_at: number }[];
  allowlistCount: number;
  pendingCount: number;
  approvedCount: number;
  allowlistRoot: { root: string; addresses: string[]; tx: string; committedAt: number } | null;
  allowlistRootMatchesList: boolean;
};

const ADMIN_TABS: ReadonlyArray<readonly [AdminTab, string]> = [
  ["overview", "總覽"],
  ["presale", "預售"],
  ["platform", "平台與費率"],
  ["content", "內容與檢舉"],
  ["settings", "網站設定"],
];

function toUtc8DateInput(timestamp: number) {
  if (!timestamp) return "";
  const date = new Date(timestamp * 1000 + 8 * 60 * 60 * 1000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

function fromUtc8DateInput(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return 0;
  const [, year, month, day, hour, minute] = match;
  return Math.floor((Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour) - 8, Number(minute)) / 1000));
}

function parseTokenAmount(value: string) {
  try { return value ? parseEther(value) : 0n; } catch { return 0n; }
}

export default function Admin() {
  const { tr, locale } = useLanguage();

  const { config, admin, transact, refresh } = usePlatform();
  const isV6 = config.presaleVersion === 6;
  const isV5Family = config.presaleVersion === 5 || isV6;
  const isAllowlistSale = config.presaleVersion === 4 || isV5Family;
  const managedPresaleAbi = isV6
    ? rvynV6Artifacts.RovynPresaleV6.abi
    : config.presaleVersion === 5
    ? rvynV5Artifacts.RovynPresaleV5.abi
    : config.presaleVersion === 4
      ? rvynV4Artifacts.GenesisPresaleV4.abi
      : rvynArtifacts.GenesisPresaleV3.abi;
  const [data, setData] = useState<AdminDashboard | null>(null);
  const [tab, setTabState] = useState<AdminTab>("overview");
  const setTab = (next: AdminTab) => { setTabState(next); try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch { /* ignore */ } };
  const [busy, setBusy] = useState(false);
  const [operationDone, setOperationDone] = useState(false);
  const [error, setError] = useState("");
  const [network, setNetwork] = useState<ChainId>(46630);
  const [brand, setBrand] = useState("ROVYN CORE");
  const [maintenance, setMaintenance] = useState(false);
  const [socialX, setSocialX] = useState("");
  const [socialTelegram, setSocialTelegram] = useState("");
  const [fee, setFee] = useState("0.0001");
  const [recipient, setRecipient] = useState<string>(OWNER);
  const [txHash, setTxHash] = useState("");
  const [saleTxHash, setSaleTxHash] = useState("");
  const [genesis, setGenesis] = useState("");
  const [inventory, setInventory] = useState<string>(RVYN_MODEL.escrowTokens);
  const [price, setPrice] = useState<string>(RVYN_MODEL.priceEth);
  const [poolEthAmount, setPoolEthAmount] = useState("");
  const [withdrawEth, setWithdrawEth] = useState("");
  const [liquidityRevenueEth, setLiquidityRevenueEth] = useState("");
  const [teamBeneficiary, setTeamBeneficiary] = useState("");
  const [lpLockMonths, setLpLockMonths] = useState("");
  const [futureLiquidityEth, setFutureLiquidityEth] = useState("");
  const [futureLiquidityTokens, setFutureLiquidityTokens] = useState("");
  const [distributionRecipient, setDistributionRecipient] = useState("");
  const [distributionAmount, setDistributionAmount] = useState("");
  const [distributionReference, setDistributionReference] = useState("");
  const [airdropRows, setAirdropRows] = useState("");
  const [airdropCampaign, setAirdropCampaign] = useState("");
  const [planPrices, setPlanPrices] = useState(["0.0002", "0.0008", "0.0015"]);
  const [liquidityDrafts, setLiquidityDrafts] = useState<Record<string, string>>({});
  const [correctionDrafts, setCorrectionDrafts] = useState<Record<string, { totalSupply: string; decimals: string; reason: string }>>({});
  const [nextPhase, setNextPhase] = useState<SalePhase>("allowlist_open");
  const [phaseReason, setPhaseReason] = useState("");
  const [allowlistEnabled, setAllowlistEnabled] = useState(false);
  const [allowlistOpensAt, setAllowlistOpensAt] = useState("");
  const [allowlistClosesAt, setAllowlistClosesAt] = useState("");
  const [allowlistAddresses, setAllowlistAddresses] = useState("");
  const [allowlistSource, setAllowlistSource] = useState("");
  const [revokeAddress, setRevokeAddress] = useState("");
  const [revokeReason, setRevokeReason] = useState("");
  const [rootPreview, setRootPreview] = useState<{ root: Hex; count: number; addresses: Address[] } | null>(null);
  const poolAmountWei = (() => { try { return poolEthAmount ? parseEther(poolEthAmount) : 0n; } catch { return 0n; } })();
  const liquidityRevenueWei = (() => { try { return data?.saleStatus?.liquidityRevenue ? parseEther(data.saleStatus.liquidityRevenue) : 0n; } catch { return 0n; } })();
  const withdrawAmountWei = (() => { try { return withdrawEth ? parseEther(withdrawEth) : 0n; } catch { return 0n; } })();
  const raisedWei = (() => { try { return data?.saleStatus ? parseEther(data.saleStatus.raised) : 0n; } catch { return 0n; } })();
  const withdrawableWei = (() => { try { return data?.saleStatus ? parseEther(data.saleStatus.withdrawable) : 0n; } catch { return 0n; } })();
  const maxLiquidityWei = raisedWei / 2n + liquidityRevenueWei;
  const parseEtherSafe = (value?: string) => { try { return value ? parseEther(value) : 0n; } catch { return 0n; } };
  const liquidityRevenueInputWei = parseTokenAmount(liquidityRevenueEth);
  const futureLiquidityEthWei = parseTokenAmount(futureLiquidityEth);
  const futureLiquidityTokenWei = parseTokenAmount(futureLiquidityTokens);
  const distributionAmountWei = parseTokenAmount(distributionAmount);
  const parsedAirdrop = (() => {
    try {
      const rows = airdropRows.split(/\r?\n/).map((row) => row.trim()).filter(Boolean).map((row) => row.split(/[\s,;]+/));
      if (!rows.length || rows.length > 20 || rows.some((row) => row.length !== 2 || !isAddress(row[0] || "") || !/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,18})?$/.test(row[1] || ""))) return null;
      const recipients = rows.map((row) => row[0] as Address);
      if (new Set(recipients.map((value) => value.toLowerCase())).size !== recipients.length) return null;
      const amounts = rows.map((row) => parseEther(row[1] || "0"));
      if (amounts.some((amount) => amount <= 0n)) return null;
      return { recipients, amounts };
    } catch { return null; }
  })();
  const deskText = {
    en: { title: "RVYN sale desk", current: "Website display stage", count: "Onchain-eligible wallets", prep: "Allowlist preparing", open: "Allowlist open · no purchases", sale: "Sale open", closed: "Sale closed", listedStatus: "Onchain eligible", revokedStatus: "Revoked / excluded from next root", reason: "Change note (at least 10 characters)", save: "Save website display stage", stageHelp: "This setting changes the status shown on the website only. It does not open or close the onchain sale; use the sale controls below for that.", locked: "The sale can open only after the approved wallet list is published onchain and all 10M RVYN are deposited.", registry: "Allowlist review", addresses: "Wallet addresses (one per line, up to 100)", source: "Import source", import: "Add addresses", revoke: "Revoke an application", revokeReason: "Reason (at least 10 characters)", revokeButton: "Revoke application", note: "A listed wallet is eligible to buy RVYN if a sale opens. It is not an NFT, a live sale, or a token allocation." },
    "zh-Hant": { title: "RVYN 預售管理台", current: "網站顯示階段", count: "鏈上有效資格地址", prep: "白名單準備中", open: "白名單開放・尚不可購買", sale: "預售開放", closed: "預售結束", listedStatus: "鏈上有效資格", revokedStatus: "已撤銷／排除於下次根值", reason: "變更說明（至少 10 字）", save: "儲存網站顯示階段", stageHelp: "這個設定只改網站顯示的狀態，不會真的開啟或關閉鏈上預售；鏈上開售請用下方預售操作按鈕。", locked: "只有白名單已上鏈、1,000 萬枚 RVYN 已存入後，才能開啟預售。", registry: "白名單審核", addresses: "錢包地址（每行一個，最多 100 個）", source: "匯入來源", import: "加入地址", revoke: "撤銷申請", revokeReason: "原因（至少 10 字）", revokeButton: "撤銷申請", note: "列入名單只代表未來若開售時有資格購買 RVYN；不是 NFT、目前沒有在賣，也不是代幣配額。" },
    "zh-Hans": { title: "RVYN 预售管理台", current: "网站显示阶段", count: "链上有效资格地址", prep: "白名单准备中", open: "白名单开放・尚不可购买", sale: "预售开放", closed: "预售结束", listedStatus: "链上有效资格", revokedStatus: "已撤销／排除于下次根值", reason: "变更说明（至少 10 字）", save: "保存网站显示阶段", stageHelp: "此设置只更改网站显示的状态，不会真正开启或关闭链上预售；链上开售请使用下方预售操作按钮。", locked: "只有白名单已上链、1,000 万枚 RVYN 已存入后，才能开启预售。", registry: "白名单审核", addresses: "钱包地址（每行一个，最多 100 个）", source: "导入来源", import: "添加地址", revoke: "撤销申请", revokeReason: "原因（至少 10 字）", revokeButton: "撤销申请", note: "列入名单只代表未来若开售时有资格购买 RVYN；不是 NFT、当前没有在卖，也不是代币配额。" },
    ko: { title: "RVYN 프리세일 관리", current: "웹사이트 표시 단계", count: "온체인 구매 자격 지갑", prep: "허용 목록 준비 중", open: "허용 목록 공개 · 구매 불가", sale: "판매 시작", closed: "판매 종료", listedStatus: "온체인 자격 있음", revokedStatus: "취소됨 / 다음 루트에서 제외", reason: "변경 메모 (10자 이상)", save: "웹사이트 표시 단계 저장", stageHelp: "이 설정은 웹사이트에 보이는 상태만 바꿉니다. 온체인 판매를 열거나 닫지 않으므로 아래 판매 작업 버튼을 사용하세요.", locked: "승인된 지갑 목록을 온체인에 게시하고 RVYN 1,000만 개를 예치한 뒤에만 판매를 열 수 있습니다.", registry: "허용 목록 검토", addresses: "지갑 주소 (한 줄에 하나, 최대 100개)", source: "가져온 경로", import: "주소 추가", revoke: "신청 취소", revokeReason: "이유 (10자 이상)", revokeButton: "신청 취소", note: "목록은 판매가 열릴 경우 RVYN을 구매할 자격일 뿐입니다. NFT, 현재 판매, 토큰 배정이 아닙니다." },
  }[locale];
  const scheduleText = {
    en: { title: "Allowlist application window", enabled: "Accept applications during this window", opens: "Registration opens", closes: "Registration closes", timezone: "Times use UTC+8. The server opens and closes registration automatically; closing applications does not remove already-submitted entries.", disabled: "Disabled", scheduled: "Scheduled", open: "Open now", closed: "Closed", save: "Save registration window", invalid: "Choose a valid opening and closing time. Closing must be after opening and in the future." },
    "zh-Hant": { title: "白名單登記時段", enabled: "依此時段接受登記", opens: "開放登記時間", closes: "截止登記時間", timezone: "時間採 UTC+8。伺服器會依排程自動開放與關閉；截止後仍可審核已送出的申請。", disabled: "未啟用", scheduled: "尚未開始", open: "登記開放中", closed: "已截止", save: "儲存登記時段", invalid: "請設定有效的開放與截止時間；截止時間須晚於開放時間及現在。" },
    "zh-Hans": { title: "白名单登记时段", enabled: "在此时段接受登记", opens: "开放登记时间", closes: "截止登记时间", timezone: "时间采用 UTC+8。服务器会按排程自动开放与关闭；截止后仍可审核已提交的申请。", disabled: "未启用", scheduled: "尚未开始", open: "登记开放中", closed: "已截止", save: "保存登记时段", invalid: "请设置有效的开放与截止时间；截止时间须晚于开放时间及现在。" },
    ko: { title: "허용 목록 신청 기간", enabled: "이 기간에 신청 접수", opens: "신청 시작", closes: "신청 마감", timezone: "시간대는 UTC+8입니다. 서버가 일정에 따라 자동으로 열고 닫습니다. 마감 후에도 이미 접수된 신청은 검토할 수 있습니다.", disabled: "사용 안 함", scheduled: "예약됨", open: "신청 접수 중", closed: "마감됨", save: "신청 기간 저장", invalid: "시작 및 마감 시간을 확인하세요. 마감은 시작과 현재 시각보다 뒤여야 합니다." },
  }[locale];
  const workflowText = {
    en: { pending: "Pending review", approved: "Approved · eligibility starts after root publish", approve: "Approve", root: "Publish allowlist root", rootPreview: "Preview approved list", rootReady: "Preview ready", currentRoot: "Onchain root", publishedRoot: "Confirmed root", addressCount: "addresses", contract: "Contract", rootHash: "Root hash", addressCountLabel: "Wallet count", effect: "Effect", rootConfirm: "Check the wallet count and root hash. Publishing sends one wallet-signed onchain transaction.", rootHelp: "Once the sale opens, this list is frozen. If you change approved wallets before opening, publish the updated root first.", noV4: "The V6 sale contract is deployed but not open. Before opening, confirm its source is verified on the explorer. This dashboard shows the remaining steps before opening.", v4: "Buyers' payments are only recorded; they claim RVYN after the sale is closed and settled. The sponsor is the Safe multisig, so onchain steps are prepared in the Multisig proposals panel and need two signatures.", sequence: "Simple order: finish the allowlist → publish its root (Safe) → send 10,000,000 RVYN from the admin wallet to the Safe → approve and deposit (Safe) → open the sale (Safe). After closing, settle (Safe, or anyone after 7 days): this builds the locked pool and lets buyers claim." },
    "zh-Hant": { pending: "待審核", approved: "已核准・發布根值後才具備鏈上資格", approve: "核准", root: "發布白名單根值", rootPreview: "預覽核准名單", rootReady: "預覽已就緒", currentRoot: "鏈上根值", publishedRoot: "已確認根值", addressCount: "個地址", contract: "合約", rootHash: "Root hash", addressCountLabel: "地址數量", effect: "操作效果", rootConfirm: "請核對地址數量與 root hash；發布時會送出一筆需要錢包簽署的鏈上交易。", rootHelp: "預售一旦開啟，名單就會凍結。開售前若修改核准地址，請先重新發布更新後的根值。", noV4: "V6 預售合約已部署但尚未開售；開售前請確認原始碼已在區塊瀏覽器驗證。這個工作台會提示開售前還要完成的步驟。", v4: "買家付款只會被記錄；預售結束並結算後，買家才能領取 RVYN。發起人是 Safe 多簽，鏈上步驟請在「多簽提案」面板產生批次，並由兩位簽署人簽署。", sequence: "簡單順序：完成白名單 → 發布根值（Safe）→ 把 1,000 萬枚 RVYN 從管理錢包轉到 Safe → 授權並存入（Safe）→ 開售（Safe）。結束後結算（Safe，或滿 7 天後任何人）：建立鎖定的首池並開放買家領取。" },
    "zh-Hans": { pending: "待审核", approved: "已核准・发布根值后才具备链上资格", approve: "核准", root: "发布白名单根值", rootPreview: "预览核准名单", rootReady: "预览已就绪", currentRoot: "链上根值", publishedRoot: "已确认根值", addressCount: "个地址", contract: "合约", rootHash: "Root hash", addressCountLabel: "地址数量", effect: "操作效果", rootConfirm: "请核对地址数量与 root hash；发布时会发送一笔需要钱包签署的链上交易。", rootHelp: "预售一旦开启，名单就会冻结。开售前若修改核准地址，请先重新发布更新后的根值。", noV4: "V6 预售合约已部署但尚未开售；开售前请确认源代码已在区块浏览器验证。这个工作台会提示开售前还要完成的步骤。", v4: "买家付款只会被记录；预售结束并结算后，买家才能领取 RVYN。发起人是 Safe 多签，链上步骤请在“多签提案”面板生成批次，并由两位签署人签署。", sequence: "简单顺序：完成白名单 → 发布根值（Safe）→ 把 1,000 万枚 RVYN 从管理钱包转到 Safe → 授权并存入（Safe）→ 开售（Safe）。结束后结算（Safe，或满 7 天后任何人）：创建锁定的首池并开放买家领取。" },
    ko: { pending: "검토 대기", approved: "승인됨 · 루트 게시 후 온체인 자격 적용", approve: "승인", root: "허용 목록 루트 게시", rootPreview: "승인 목록 미리보기", rootReady: "미리보기 완료", currentRoot: "온체인 루트", publishedRoot: "확인된 루트", addressCount: "개 주소", contract: "계약", rootHash: "Root hash", addressCountLabel: "지갑 수", effect: "작업 효과", rootConfirm: "지갑 수와 root hash를 확인하세요. 게시에는 지갑 서명이 필요한 온체인 거래가 발생합니다.", rootHelp: "판매가 시작되면 목록이 고정됩니다. 판매 전에 승인 지갑을 수정했다면 갱신된 루트를 먼저 게시하세요.", noV4: "V6 판매 계약이 배포되었지만 아직 열리지 않았습니다. 시작 전에 탐색기에서 소스 검증이 되었는지 확인하세요. 이 대시보드가 시작 전 남은 단계를 안내합니다.", v4: "구매자의 결제는 기록만 되며 판매 종료와 정산 후 RVYN을 클레임합니다. 스폰서는 Safe 멀티시그이므로 온체인 단계는 멀티시그 제안 패널에서 준비하고 서명 두 개가 필요합니다.", sequence: "간단한 순서: 허용 목록 완료 → 루트 게시(Safe) → 관리 지갑에서 Safe로 RVYN 1,000만 개 전송 → 승인·예치(Safe) → 판매 시작(Safe). 종료 후 정산(Safe, 또는 7일 후 누구나): 잠긴 풀을 만들고 구매자 클레임을 엽니다." },
  }[locale];
  const allowlistHowToText = {
    en: ["Set the registration window. The site opens and closes applications at those UTC+8 dates; this does not open the sale.", "Review submissions and manually add or approve wallets. Approved wallets are not eligible onchain yet.", "When the list is final, close registration, preview the count and root, then publish it. The root is frozen when the sale opens."],
    "zh-Hant": ["設定登記起訖時間；網站會依 UTC+8 時間自動開關登記，這不等於開售。", "檢查申請，手動新增或核准地址；核准後還沒有鏈上購買資格。", "名單確定後先關閉登記，再預覽地址數量與根值並發布。預售開啟後名單會凍結。"],
    "zh-Hans": ["设置登记起止时间；网站会按 UTC+8 时间自动开关登记，这不等于开售。", "检查申请，手动添加或核准地址；核准后还没有链上购买资格。", "名单确定后先关闭登记，再预览地址数量与根值并发布。预售开启后名单会冻结。"],
    ko: ["신청 시작·종료 시간을 설정하세요. 웹사이트가 UTC+8 시간에 맞춰 신청을 열고 닫으며 판매 시작과는 별개입니다.", "신청을 검토하고 지갑을 직접 추가하거나 승인하세요. 승인만으로 온체인 구매 자격이 생기지는 않습니다.", "목록이 확정되면 신청을 닫고 지갑 수와 루트를 미리 본 뒤 게시하세요. 판매가 시작되면 목록은 고정됩니다."],
  }[locale];
  const v5ButtonText = {
    en: { approve: "Step 1 · Allow contract to use 10M RVYN", approveDone: "Step 1 · Allowance complete", deposit: "Step 2 · Deposit 10M RVYN into presale contract", approveEffect: "Permission only: no RVYN moves and the sale does not start.", depositEffect: "Transfers 10M RVYN from your token wallet into the presale contract. The sale does not start." },
    "zh-Hant": { approve: "第 1 步・授權合約使用 1,000 萬枚 RVYN", approveDone: "第 1 步・授權已完成", deposit: "第 2 步・將 1,000 萬枚 RVYN 存入預售合約", approveEffect: "這筆只授權合約使用代幣，不會轉出 RVYN，也不會開售。", depositEffect: "這筆會把 1,000 萬枚 RVYN 從你的代幣錢包轉入預售合約，但不會開售。" },
    "zh-Hans": { approve: "第 1 步・授权合约使用 1,000 万枚 RVYN", approveDone: "第 1 步・授权已完成", deposit: "第 2 步・将 1,000 万枚 RVYN 存入预售合约", approveEffect: "这笔只授权合约使用代币，不会转出 RVYN，也不会开售。", depositEffect: "这笔会把 1,000 万枚 RVYN 从你的代币钱包转入预售合约，但不会开售。" },
    ko: { approve: "1단계 · 계약의 RVYN 1,000만 개 사용 승인", approveDone: "1단계 · 사용 승인 완료", deposit: "2단계 · RVYN 1,000만 개를 프리세일 계약에 예치", approveEffect: "이 작업은 사용 권한만 설정하며 RVYN이 이동하거나 판매가 시작되지 않습니다.", depositEffect: "지갑의 RVYN 1,000만 개가 프리세일 계약으로 이동합니다. 판매는 시작되지 않습니다." },
  }[locale];
  const v5GroupText = {
    en: { primary: "Presale controls", cancel: "Cancel before opening · irreversible", cancelNote: "This permanently marks the sale as cancelled and returns the contract's token balance. Use only if you have decided not to proceed.", after: "After the sale closes", allocations: "Later token allocations and airdrops" },
    "zh-Hant": { primary: "預售主要操作", cancel: "開售前取消・不可恢復", cancelNote: "此操作會永久取消預售，並把合約內代幣餘額退回；只有確定不再開售時才使用。", after: "預售結束後再操作", allocations: "之後的代幣分配與空投" },
    "zh-Hans": { primary: "预售主要操作", cancel: "开售前取消・不可恢复", cancelNote: "此操作会永久取消预售，并把合约内代币余额退回；只有确定不再开售时才使用。", after: "预售结束后再操作", allocations: "之后的代币分配与空投" },
    ko: { primary: "프리세일 주요 작업", cancel: "판매 전 취소 · 되돌릴 수 없음", cancelNote: "판매를 영구 취소하고 계약의 토큰 잔액을 돌려받습니다. 진행하지 않기로 결정한 경우에만 사용하세요.", after: "판매 종료 후 작업", allocations: "추후 토큰 배분 및 에어드롭" },
  }[locale];
  const legacySaleOpsGuide = {
    en: { heading: "What each presale action does", steps: [
      ["Approve 8M RVYN", "Sets ERC-20 allowance only; tokens have not moved yet."],
      ["Deposit inventory", "Transfers the required 8M RVYN into the sale contract. It is escrow, not a sale."],
      ["Commit allowlist root", "Publishes the approved wallet set. After the sale opens, this root cannot change."],
      ["Open sale", "Requires inventory and a root; starts the 14-day purchase window."],
      ["Close sale", "Stops new purchases. Settlement becomes possible when contract conditions are met."],
      ["Create pool", "Commits up to the raised ETH amount to liquidity and performs the contract's locks/burn. This is a consequential, irreversible settlement action."],
      ["Withdraw", "Only withdraws proceeds left after successful pool creation; never available before settlement."],
      ["Fail / refund / recover", "Failure enables buyers to refund. Sponsor inventory recovery is only for a failed sale; cancel-before-open is a separate pre-sale action."],
    ] },
    "zh-Hant": { heading: "預售按鈕用途與操作時機", steps: [
      ["核准 800 萬 RVYN", "只設定 ERC-20 提款額度；此時 Token 尚未轉出錢包。"],
      ["轉入預售庫存", "把 800 萬 RVYN 移入預售合約託管，不代表開始販售。"],
      ["提交白名單根值", "發布已核准錢包集合；預售開啟後根值不可再更改。"],
      ["開啟預售", "須先有庫存和根值；執行後開始 14 天購買期間。"],
      ["關閉預售", "停止新購買；符合合約條件後才能結算。"],
      ["建立流動性池", "將指定募得 ETH 投入流動性，並執行合約鎖倉／銷毀。這是影響重大且不可逆的結算。"],
      ["提領", "僅能在成功建池後提領未投入建池的餘額；結算前不可提領。"],
      ["失敗／退款／取回庫存", "預售失敗後買家才能退款；發起方只能在失敗後取回庫存。開售前取消是另一個獨立操作。"],
    ] },
    "zh-Hans": { heading: "预售按钮用途与操作时机", steps: [
      ["核准 800 万 RVYN", "只设置 ERC-20 提款额度；此时 Token 尚未离开钱包。"],
      ["转入预售库存", "把 800 万 RVYN 移入预售合约托管，不代表开始销售。"],
      ["提交白名单根值", "发布已核准的钱包集合；预售开启后根值不可更改。"],
      ["开启预售", "需先有库存和根值；执行后开始 14 天购买期。"],
      ["关闭预售", "停止新购买；满足合约条件后才能结算。"],
      ["创建流动性池", "将指定募得 ETH 投入流动性，并执行合约锁仓／销毁。这是影响重大且不可逆的结算。"],
      ["提领", "仅能在成功建池后提领未投入建池的余额；结算前不可提领。"],
      ["失败／退款／取回库存", "预售失败后买家才能退款；发起方只能在失败后取回库存。开售前取消是另一个独立操作。"],
    ] },
    ko: { heading: "프리세일 작업별 기능과 시점", steps: [
      ["RVYN 800만 개 승인", "ERC-20 사용 한도만 설정하며 토큰은 아직 이동하지 않습니다."],
      ["재고 입금", "RVYN 800만 개를 판매 계약에 예치합니다. 판매 시작은 아닙니다."],
      ["허용 목록 루트 기록", "승인된 지갑 목록을 게시합니다. 판매가 열리면 루트를 바꿀 수 없습니다."],
      ["판매 개시", "재고와 루트가 필요하며 실행 후 14일 구매 기간이 시작됩니다."],
      ["판매 종료", "신규 구매를 중단합니다. 계약 조건 충족 후 정산할 수 있습니다."],
      ["유동성 풀 생성", "지정된 모금 ETH를 유동성에 투입하고 계약의 잠금/소각을 수행합니다. 중요하고 되돌릴 수 없는 정산입니다."],
      ["출금", "풀 생성 성공 후 남은 ETH만 출금할 수 있으며 정산 전에는 불가합니다."],
      ["실패/환불/재고 회수", "판매 실패 후 구매자는 환불할 수 있습니다. 후원자는 실패 후에만 재고를 회수합니다. 개시 전 취소는 별도 작업입니다."],
    ] },
  }[locale];
  const v5SaleOpsGuide = {
    en: { heading: "Simple guide: what to do and what each button changes (V6: the sponsor is the Safe, so use the Multisig proposals panel for onchain steps)", steps: [
      ["Review and publish the allowlist", "Preview the final approved wallet list and publish its root onchain (Safe proposal step 1). It becomes immutable once the sale opens."],
      ["Send 10M RVYN to the Safe, then approve and deposit", "Move all 10,000,000 RVYN from the admin wallet to the Safe with a normal transfer, then use Safe proposal step 2 (approve + deposit). The approve and deposit buttons below only work when the admin wallet is the sponsor."],
      ["Open / close sale", "Opening starts the 14-day sale only; no tokens move. Buyers' payments are recorded and they claim RVYN after settlement. The sponsor can close early; anyone can close once the 14 days have passed."],
      ["Forward launchpad revenue", "Manually sends and records the revenue; the presale contract cannot discover launchpad income by itself. It must go into the pool."],
      ["Settle (create the initial pool)", "After close the sponsor settles (Safe proposal step 5). The pool ETH must be at least 50% of the raise plus forwarded revenue and at most all of it; anyone can settle at the minimum 7 days after the close. The pool is built at the fixed price by direct mint, its LP is locked for 730 days, unsold sale tokens are burned, the manager allocation is released and team vesting starts. Buyers can then claim."],
      ["Withdraw project ETH", "After settlement, ETH not placed in the pool is operating funds: at most 25% every 30 days (fixed in the contract). Use Safe proposal step 6."],
      ["Distribute / airdrop", "Product, community, and airdrop transfers draw only from their category budgets and only after settlement. Each airdrop batch supports up to 20 unique wallets; lifetime spend is capped."],
      ["Team release", "Anyone may trigger release after the one-year cliff that starts at settlement; the vested RVYN always goes to the fixed team beneficiary."],
    ] },
    "zh-Hant": { heading: "簡易操作：每個步驟與按鈕的效果（V6：發起人是 Safe，鏈上步驟請用「多簽提案」面板）", steps: [
      ["先審核並發布白名單", "預覽最後的核准名單，再把根值發布上鏈（多簽提案步驟 1）；預售開啟後名單不能再改。"],
      ["把 1,000 萬枚 RVYN 轉給 Safe，再授權並存入", "先用一般轉帳把全部 1,000 萬枚 RVYN 從管理錢包轉到 Safe，再用多簽提案步驟 2（授權＋存入）。下方的授權與存入按鈕只有在發起人是管理錢包時才有用。"],
      ["開啟／關閉預售", "開啟只會開始 14 天預售，不會有代幣移動。買家付款只會被記錄，結算後才領取 RVYN。發起人可提前關閉；滿 14 天後任何人都能關閉。"],
      ["轉入發射台收益", "由管理者手動轉入並記錄；預售合約無法自行辨識發射台收入。這筆收益必須放入首池。"],
      ["結算（建立首池）", "預售結束後由發起人結算（多簽提案步驟 5）。池子 ETH 不得低於募資額的 50% 加上已轉入的發射台收益，最高可用全部；結束滿 7 天後任何人都能以下限結算。首池依固定價格以直接鑄造建立，LP 鎖倉 730 天；未售出的預售 Token 銷毀、管理者份額釋出、團隊鎖倉開始計算，之後買家才能領取。"],
      ["提領專案 ETH", "結算後，未放入首池的 ETH 為營運資金，每 30 天最多提領 25%（寫死在合約中）。請用多簽提案步驟 6。"],
      ["配置／空投", "產品、生態、社群與空投只能在結算後使用各自剩餘額度；每批空投最多 20 個不重複錢包，總量受終身上限限制。"],
      ["團隊解鎖發放", "從結算起算一年 cliff 後任何人都可觸發發放；已解鎖的 RVYN 只會送到部署時固定的團隊地址。"],
    ] },
    "zh-Hans": { heading: "简易操作：每个步骤与按钮的效果（V6：发起人是 Safe，链上步骤请用“多签提案”面板）", steps: [
      ["先审核并发布白名单", "预览最终核准名单，再把根值发布上链（多签提案步骤 1）；预售开启后名单不能再改。"],
      ["把 1,000 万枚 RVYN 转给 Safe，再授权并存入", "先用普通转账把全部 1,000 万枚 RVYN 从管理钱包转到 Safe，再用多签提案步骤 2（授权＋存入）。下方的授权与存入按钮只有在发起人是管理钱包时才有用。"],
      ["开启／关闭预售", "开启只会开始 14 天预售，不会有代币移动。买家付款只会被记录，结算后才领取 RVYN。发起人可提前关闭；满 14 天后任何人都能关闭。"],
      ["转入发射台收益", "由管理者手动转入并记录；预售合约无法自行识别发射台收入。这笔收益必须放入首池。"],
      ["结算（创建首池）", "预售结束后由发起人结算（多签提案步骤 5）。池子 ETH 不得低于募资额的 50% 加上已转入的发射台收益，最高可用全部；结束满 7 天后任何人都能按下限结算。首池按固定价格以直接铸造创建，LP 锁仓 730 天；未售出的预售 Token 销毁、管理者份额释放、团队锁仓开始计算，之后买家才能领取。"],
      ["提领项目 ETH", "结算后，未放入首池的 ETH 为运营资金，每 30 天最多提领 25%（写死在合约中）。请用多签提案步骤 6。"],
      ["分配／空投", "产品、生态、社群与空投只能在结算后使用各自剩余额度；每批空投最多 20 个不重复钱包，总量受终身上限限制。"],
      ["团队解锁发放", "从结算起算一年 cliff 后任何人都可触发发放；已解锁的 RVYN 只会发送到部署时固定的团队地址。"],
    ] },
    ko: { heading: "간단 안내: 단계와 각 버튼의 효과 (V6: 스폰서가 Safe이므로 온체인 단계는 멀티시그 제안 패널을 사용)", steps: [
      ["허용 목록 검토 및 게시", "최종 승인 지갑 목록을 미리 보고 루트를 온체인에 게시하세요(Safe 제안 1단계). 판매가 시작되면 목록을 바꿀 수 없습니다."],
      ["RVYN 1,000만 개를 Safe로 보낸 뒤 승인·예치", "관리 지갑에서 RVYN 1,000만 개 전부를 일반 전송으로 Safe에 보낸 뒤 Safe 제안 2단계(승인＋예치)를 사용하세요. 아래 승인·예치 버튼은 관리 지갑이 스폰서일 때만 작동합니다."],
      ["판매 시작／종료", "시작하면 14일 판매만 시작되며 토큰은 이동하지 않습니다. 구매자의 결제는 기록만 되고 정산 후 RVYN을 클레임합니다. 스폰서는 조기 종료할 수 있고 14일이 지나면 누구나 종료할 수 있습니다."],
      ["런치패드 수익 전송", "관리자가 직접 전송·기록해야 합니다. 프리세일 계약은 런치패드 수익을 자동으로 알 수 없습니다. 이 수익은 풀에 들어가야 합니다."],
      ["정산(초기 풀 생성)", "종료 후 스폰서가 정산합니다(Safe 제안 5단계). 풀 ETH는 모금액의 50%와 전송된 런치패드 수익 이상, 최대 전액까지이며 종료 7일 후에는 누구나 최소 금액으로 정산할 수 있습니다. 고정 가격에 직접 민팅으로 풀을 만들고 LP는 730일 잠기며, 미판매 토큰은 소각되고 관리자 몫이 해제되며 팀 베스팅이 시작됩니다. 이후 구매자가 클레임합니다."],
      ["프로젝트 ETH 인출", "정산 후 풀에 넣지 않은 ETH는 운영 자금이며 30일마다 최대 25%까지 인출할 수 있습니다(계약에 고정). Safe 제안 6단계를 사용하세요."],
      ["배분／에어드롭", "제품·생태계·커뮤니티·에어드롭은 정산 후에만 각 예산 안에서 사용합니다. 에어드롭은 회당 중복 없는 지갑 최대 20개이며 누적 한도가 있습니다."],
      ["팀 베스팅 해제", "정산 시점부터 계산하는 1년 cliff 이후 누구나 해제를 실행할 수 있고, 지급 토큰은 고정된 팀 수령인에게만 전달됩니다."],
    ] },
  }[locale];
  const saleOpsGuide = isV5Family ? v5SaleOpsGuide : legacySaleOpsGuide;
  const v5CheckpointText = {
    en: { title: "Your next step", contract: "Onchain contract", root: "Allowlist root synced", inventory: "Inventory deposited", allowance: "Token use approved", yes: "Yes", no: "No", state: "State", pending: "Not opened", openState: "Open", closedState: "Closed", settledState: "Settled", cancelledState: "Cancelled", loading: "Loading contract status…", list: "Finish reviewing the allowlist, close registration, then preview and publish the root.", deposit: "Next: approve the 10M RVYN allowance, then deposit 10M RVYN. These are two separate wallet transactions; neither opens the sale.", depositOnly: "Allowance is already set. Next, deposit 10M RVYN into the presale contract; this still does not open the sale.", closeRegistration: "Before opening, close the application window and set the website display stage to Allowlist open. This only prepares the site; it does not open the onchain sale.", open: "Ready to open. Recheck the list, price, dates, and contract address first. Opening starts the 14-day sale; no tokens move until settlement.", live: "Sale is live. Monitor purchases and close it when you decide to stop; closing is an onchain transaction.", closed: "Sale is closed. Reconcile proceeds and manually forward any launchpad revenue before deciding whether and how much ETH to put into the initial pool.", settled: "Pool settlement is complete. You may withdraw only the uncommitted ETH and manage remaining token budgets.", cancelled: "Sale was cancelled before opening. The contract has returned its token balance; do not use the open-sale controls." },
    "zh-Hant": { title: "你現在的下一步", contract: "鏈上合約狀態", root: "白名單根值已同步", inventory: "預售庫存已存入", allowance: "代幣使用已授權", yes: "是", no: "否", state: "狀態", pending: "尚未開售", openState: "開售中", closedState: "已關閉", settledState: "已結算", cancelledState: "已取消", loading: "正在讀取合約狀態…", list: "先完成地址審核、關閉登記，再預覽並發布白名單根值。", deposit: "下一步：先授權 1,000 萬枚 RVYN，再存入 1,000 萬枚。這是兩筆分開的錢包交易，都不會開售。", depositOnly: "授權已完成。下一步把 1,000 萬枚 RVYN 存入預售合約；這一步仍不會開售。", closeRegistration: "開售前先關閉登記時段，並把網站顯示階段設為「白名單開放」。這只是準備網站，不會開啟鏈上預售。", open: "條件已齊，可以考慮開售。簽署前再核對名單、價格、時間與合約地址；開售會啟動 14 天預售；結算前不會有代幣移動。", live: "預售進行中。確認要停止時再手動關閉；關閉會送出一筆鏈上交易。", closed: "預售已關閉。先核對募資，再手動轉入發射台收益；之後才決定是否建池及投入多少 ETH。", settled: "首池已結算。只能提領未投入建池的 ETH，並依各自額度管理剩餘代幣。", cancelled: "預售已在開售前取消，合約已退回代幣餘額；不要再使用開售按鈕。" },
    "zh-Hans": { title: "你现在的下一步", contract: "链上合约状态", root: "白名单根值已同步", inventory: "预售库存已存入", allowance: "代币使用已授权", yes: "是", no: "否", state: "状态", pending: "尚未开售", openState: "销售中", closedState: "已关闭", settledState: "已结算", cancelledState: "已取消", loading: "正在读取合约状态…", list: "先完成地址审核、关闭登记，再预览并发布白名单根值。", deposit: "下一步：先授权 1,000 万枚 RVYN，再存入 1,000 万枚。这是两笔分开的钱包交易，都不会开售。", depositOnly: "授权已完成。下一步把 1,000 万枚 RVYN 存入预售合约；这一步仍不会开售。", closeRegistration: "开售前先关闭登记时段，并把网站显示阶段设为“白名单开放”。这只是准备网站，不会开启链上预售。", open: "条件已齐，可以考虑开售。签名前再核对名单、价格、时间与合约地址；开售会启动 14 天预售；结算前不会有代币移动。", live: "预售进行中。确认要停止时再手动关闭；关闭会发送一笔链上交易。", closed: "预售已关闭。先核对募资，再手动转入发射台收益；之后才决定是否建池及投入多少 ETH。", settled: "首池已结算。只能提领未投入建池的 ETH，并按各自额度管理剩余代币。", cancelled: "预售已在开售前取消，合约已退回代币余额；不要再使用开售按钮。" },
    ko: { title: "현재 다음 단계", contract: "온체인 계약 상태", root: "허용 목록 루트 동기화", inventory: "재고 예치 완료", allowance: "토큰 사용 승인 완료", yes: "예", no: "아니요", state: "상태", pending: "판매 전", openState: "판매 중", closedState: "종료됨", settledState: "정산 완료", cancelledState: "취소됨", loading: "계약 상태를 불러오는 중…", list: "지갑 검토를 마치고 신청을 닫은 뒤 허용 목록 루트를 미리 보고 게시하세요.", deposit: "다음: RVYN 1,000만 개 사용을 승인한 뒤 1,000만 개를 예치하세요. 별도의 지갑 거래 두 건이며 판매는 시작되지 않습니다.", depositOnly: "사용 승인이 완료되었습니다. 다음으로 RVYN 1,000만 개를 프리세일 계약에 예치하세요. 판매는 아직 시작되지 않습니다.", closeRegistration: "판매 시작 전 신청 기간을 닫고 웹사이트 표시 단계를 ‘허용 목록 공개’로 설정하세요. 사이트 준비일 뿐 온체인 판매는 열리지 않습니다.", open: "시작 조건이 준비되었습니다. 서명 전 목록, 가격, 기간, 계약 주소를 다시 확인하세요. 시작하면 14일 판매가 시작되며 정산 전에는 토큰이 이동하지 않습니다.", live: "판매 중입니다. 중단할 때 수동으로 종료하세요. 종료도 온체인 거래입니다.", closed: "판매가 종료되었습니다. 모금액을 확인하고 런치패드 수익을 직접 전송한 뒤 초기 풀에 넣을 ETH를 결정하세요.", settled: "초기 풀 정산이 완료되었습니다. 풀에 투입되지 않은 ETH만 인출하고 남은 토큰 예산을 관리할 수 있습니다.", cancelled: "판매 시작 전에 취소되어 계약의 토큰 잔액이 반환되었습니다. 판매 시작 버튼을 사용하지 마세요." },
  }[locale];
  const v5ApprovalComplete = parseTokenAmount(data?.saleStatus?.inventoryAllowance || "") >= parseEther(RVYN_MODEL.escrowTokens);
  const v5Checkpoint = (() => {
    if (!isV5Family) return null;
    const status = data?.saleStatus;
    const rootReady = Boolean(data && data.allowlistRootMatchesList && data.allowlistRoot && data.allowlistRoot.root.toLowerCase() === (status?.allowlistRoot || "").toLowerCase());
    const inventoryReady = status?.inventory === RVYN_MODEL.escrowTokens;
    if (!status) return { state: v5CheckpointText.loading, next: v5CheckpointText.loading, rootReady, inventoryReady };
    if (status.state === "1") return { state: v5CheckpointText.openState, next: v5CheckpointText.live, rootReady, inventoryReady };
    if (status.state === "2") return { state: v5CheckpointText.closedState, next: v5CheckpointText.closed, rootReady, inventoryReady };
    if (status.state === "3") return { state: v5CheckpointText.settledState, next: v5CheckpointText.settled, rootReady, inventoryReady };
    if (status.state === "4") return { state: v5CheckpointText.cancelledState, next: v5CheckpointText.cancelled, rootReady, inventoryReady };
    if (!rootReady) return { state: v5CheckpointText.pending, next: v5CheckpointText.list, rootReady, inventoryReady };
    if (!inventoryReady && !v5ApprovalComplete) return { state: v5CheckpointText.pending, next: v5CheckpointText.deposit, rootReady, inventoryReady };
    if (!inventoryReady) return { state: v5CheckpointText.pending, next: v5CheckpointText.depositOnly, rootReady, inventoryReady };
    if (!data || !["disabled", "closed"].includes(data.allowlistWindowStatus) || data.saleDesk.phase !== "allowlist_open") return { state: v5CheckpointText.pending, next: v5CheckpointText.closeRegistration, rootReady, inventoryReady };
    return { state: v5CheckpointText.pending, next: v5CheckpointText.open, rootReady, inventoryReady };
  })();
  async function run(fn: () => Promise<unknown>) {
    setOperationDone(false);
    setBusy(true);
    setError("");
    try {
      await fn();
      await refresh();
      setOperationDone(true);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function dashboard() {
    const next = await admin<AdminDashboard>("dashboard", {});
    setData(next);
    setAllowlistEnabled(next.allowlistWindow.enabled);
    setAllowlistOpensAt(toUtc8DateInput(next.allowlistWindow.opensAt));
    setAllowlistClosesAt(toUtc8DateInput(next.allowlistWindow.closesAt));
    setNextPhase(next.saleDesk.phase === "allowlist_prep" ? "allowlist_open" : next.saleDesk.phase === "sale_open" ? "sale_closed" : next.saleDesk.phase === "sale_closed" ? "sale_closed" : "allowlist_prep");
    setLiquidityDrafts(
      Object.fromEntries(
        next.tokens.map((token) => [token.address, token.metadata?.liquidityUrl || ""]),
      ),
    );
    setCorrectionDrafts((current) => Object.fromEntries(
      next.tokens.map((token) => [token.address, current[token.address] || { totalSupply: String(token.supply), decimals: "18", reason: "" }]),
    ));
    setNetwork(config.chainId);
    setBrand(config.brand);
    setMaintenance(config.maintenance);
    setSocialX(config.socialX);
    setSocialTelegram(config.socialTelegram);
    setFee(config.launchFee);
    setRecipient(config.treasury);
    setPlanPrices(config.plans.map((p) => p.price));
  }
  async function saveSaleStage() {
    const result = await admin<{ saleDesk: SaleDesk }>("sale-desk", { phase: nextPhase, reason: phaseReason.trim() });
    setData((current) => current ? { ...current, saleDesk: result.saleDesk } : current);
    setNextPhase(result.saleDesk.phase === "allowlist_prep" ? "allowlist_open" : result.saleDesk.phase === "sale_open" ? "sale_closed" : result.saleDesk.phase === "sale_closed" ? "sale_closed" : "allowlist_prep");
    setPhaseReason("");
  }
  async function saveAllowlistWindow() {
    const opensAt = fromUtc8DateInput(allowlistOpensAt);
    const closesAt = fromUtc8DateInput(allowlistClosesAt);
    if (allowlistEnabled && (!opensAt || !closesAt || closesAt <= opensAt || closesAt <= Math.floor(Date.now() / 1000)))
      throw new Error(scheduleText.invalid);
    const result = await admin<{ allowlistWindow: AllowlistWindow; allowlistWindowStatus: AdminDashboard["allowlistWindowStatus"] }>("allowlist-window", {
      enabled: allowlistEnabled,
      opensAt: allowlistEnabled ? opensAt : 0,
      closesAt: allowlistEnabled ? closesAt : 0,
    });
    setData((current) => current ? { ...current, ...result } : current);
  }
  async function importAllowlist() {
    const addresses = [...new Set(allowlistAddresses.split(/[\s,;]+/).map((value) => value.trim()).filter(Boolean))];
    if (!addresses.length || addresses.length > 100 || addresses.some((value) => !isAddress(value)))
      throw new Error(deskText.addresses);
    const result = await admin<Pick<AdminDashboard, "allowlist" | "allowlistCount" | "pendingCount" | "approvedCount">>("allowlist-import", { addresses, source: allowlistSource.trim(), publicNote: "" });
    setData((current) => current ? { ...current, ...result, allowlistRootMatchesList: false } : current);
    setAllowlistAddresses("");
  }
  async function approveAllowlist(walletAddress: string) {
    const result = await admin<Pick<AdminDashboard, "allowlist" | "allowlistCount" | "pendingCount" | "approvedCount">>("allowlist-approve", { addresses: [walletAddress] });
    setData((current) => current ? { ...current, ...result, allowlistRootMatchesList: false } : current);
  }
  async function previewAllowlistRoot() {
    const result = await admin<{ root: Hex; count: number; addresses: Address[] }>("allowlist-root-preview", {});
    setRootPreview(result);
  }
  async function publishAllowlistRoot() {
    const preview = rootPreview || await admin<{ root: Hex; count: number; addresses: Address[] }>("allowlist-root-preview", {});
    setRootPreview(preview);
    const tx = await chainAction(
      tr("發布 RVYN 白名單 Merkle 根值"),
      "setAllowlistRoot",
      [preview.root],
      config.sale,
      managedPresaleAbi,
      [[workflowText.contract, config.sale || ""], [workflowText.rootHash, preview.root], [workflowText.addressCountLabel, String(preview.count)], [workflowText.effect, workflowText.rootHelp]],
    );
    const result = await admin<Pick<AdminDashboard, "allowlist" | "allowlistCount" | "pendingCount" | "approvedCount"> & { root: string; addresses: string[]; tx: string; committedAt: number }>("allowlist-root-confirm", { tx, root: preview.root });
    setData((current) => current ? {
      ...current,
      ...result,
      allowlistRootMatchesList: true,
      allowlistRoot: { root: result.root, addresses: result.addresses, tx: result.tx, committedAt: result.committedAt },
      saleStatus: current.saleStatus ? { ...current.saleStatus, allowlistRoot: result.root } : current.saleStatus,
    } : current);
    setRootPreview(null);
    toast.success(tr("鏈上根值已確認，名單資格已同步"));
  }
  async function revokeAllowlist() {
    const result = await admin<Pick<AdminDashboard, "allowlist" | "allowlistCount" | "pendingCount" | "approvedCount">>("allowlist-revoke", { address: revokeAddress.trim(), reason: revokeReason.trim() });
    setData((current) => current ? { ...current, ...result, allowlistRootMatchesList: false } : current);
    setRevokeAddress("");
    setRevokeReason("");
  }
  async function chainAction(
    title: string,
    functionName: string,
    args: unknown[] = [],
    to: Address | null = config.platform,
    abi: unknown = artifacts.GenesisPlatform.abi,
    details?: [string, string][],
    value = 0n,
  ) {
    if (!to) throw new Error(tr("合約尚未部署"));
    return transact({
      title,
      to,
      data: encodeFunctionData({ abi: abi as Abi, functionName, args: args as never }),
      value,
      allowUndeployed: true,
      details,
    });
  }
  async function deployPlatform() {
    const tx = await transact({
      title: tr("部署 {0} RVYN 平台", { 0: CHAINS[config.chainId].name }),
      onSubmitted: setTxHash,
      data: encodeDeployData({
        abi: rvynArtifacts.GenesisPlatform.abi,
        bytecode: rvynArtifacts.GenesisPlatform.bytecode as Hex,
        args: [OWNER, config.treasury, parseEther(config.launchFee)],
      }),
      value: 0n,
      allowUndeployed: true,
      details: [
        ["Owner", OWNER],
        ["Treasury", config.treasury],
      ],
    });
    setTxHash(tx);
    await admin("deployment", { chainId: config.chainId, tx });
    toast.success(tr("平台部署已註冊"));
  }
  async function deploySale() {
    if (config.chainId !== 4663)
      throw new Error(tr("RVYN 正式預售只能部署在 Robinhood Chain 主網。"));
    if (!config.genesis) throw new Error(tr("請先發行 RovynCore"));
    if (!isAddress(teamBeneficiary) || teamBeneficiary.toLowerCase() === "0x0000000000000000000000000000000000000000" || !lpLockMonths)
      throw new Error(tr("部署前請填寫團隊受益地址並選擇 LP 鎖定期限。"));
    if (!V5_MAINNET_DEPLOYMENT_ENABLED)
      throw new Error(tr("V5 已在主網部署並註冊；為避免重複建立，目前不開放再次部署。"));
    const tx = await transact({
      title: tr("部署 RVYN 預售合約"),
      onSubmitted: setTxHash,
      data: encodeDeployData({
        abi: rvynV5Artifacts.RovynPresaleV5.abi as unknown as Abi,
        bytecode: rvynV5Artifacts.RovynPresaleV5.bytecode as Hex,
        args: [config.genesis, OWNER, RVYN_MODEL.routerMainnet, teamBeneficiary, Number(lpLockMonths) * 365 * 24 * 60 * 60 / 12],
      }),
      value: 0n,
      allowUndeployed: true,
      details: [
        [tr("Token"), config.genesis],
        [tr("單價"), `${RVYN_MODEL.priceEth} ETH`],
        [tr("Router"), RVYN_MODEL.routerMainnet],
        [tr("團隊受益地址"), teamBeneficiary],
        [tr("LP 鎖定期限"), `${lpLockMonths} ${tr("個月")}`],
      ],
    });
    setTxHash(tx);
    await admin("sale", { tx, replace: !!config.sale });
    toast.success(tr("RVYN 預售已註冊"));
  }
  async function deploySaleV6() {
    if (config.chainId !== 4663) throw new Error(tr("RVYN 正式預售只能部署在 Robinhood Chain 主網。"));
    if (!config.genesis) throw new Error(tr("請先發行 RovynCore"));
    if (!V6_MAINNET_DEPLOYMENT_ENABLED) throw new Error(tr("V6 部署尚未開放；需創辦人明確同意後才會啟用。"));
    const safe = RVYN_MODEL.multisigMainnet;
    const tx = await transact({
      title: tr("部署 RVYN V6 預售合約"),
      onSubmitted: setTxHash,
      data: encodeDeployData({
        abi: rvynV6Artifacts.RovynPresaleV6.abi as unknown as Abi,
        bytecode: rvynV6Artifacts.RovynPresaleV6.bytecode as Hex,
        args: [config.genesis, safe, RVYN_MODEL.routerMainnet, safe, safe, BigInt(RVYN_MODEL.v6Deployment.lpLockSeconds), BigInt(RVYN_MODEL.v6Deployment.withdrawStepBps)],
      }),
      value: 0n,
      allowUndeployed: true,
      details: [
        [tr("Token"), config.genesis],
        [tr("Router"), RVYN_MODEL.routerMainnet],
        [tr("發起人／團隊／LP 受益地址"), safe],
        [tr("LP 鎖定期限"), `24 ${tr("個月")}`],
        [tr("營運資金解鎖"), tr("每 30 天 25%")],
      ],
    });
    setTxHash(tx);
    await admin("sale", { tx, replace: !!config.sale });
    toast.success(tr("RVYN 預售已註冊"));
  }
  const button = (
    label: string,
    fn: () => Promise<unknown>,
    disabled = false,
  ) => (
    <button
      className="secondary top-gap"
      disabled={busy || disabled}
      onClick={() => void run(fn)}
    >
      {label}
    </button>
  );
  return (
    <main className="workspace admin-workspace" data-active-tab={tab}>
      <div className="eyebrow">{tr("PLATFORM OPERATIONS")}</div>
      <div className="title-row">
        <div>
          <h1>
            {tr("管理")}
            <span>{tr("平台。")}</span>
          </h1>
          <p>{tr("部署、設定、Treasury 與內容審核。")}</p>
        </div>
        <span className="network-badge">{CHAINS[config.chainId].name}</span>
      </div>
      <section className="panel">
        <div className="token-title">
          <ShieldCheck className="green" />
          <div>
            <h3>{tr("管理錢包")}</h3>
            <code className="address">{OWNER}</code>
          </div>
        </div>
        <p className="muted top-gap">
          {tr("管理操作需要此地址簽署一次性訊息。合約操作另需錢包確認交易。")}
        </p>
        <button
          className="primary top-gap"
          disabled={busy}
          onClick={() => void run(dashboard)}
        >
          {busy
            ? tr("處理中…")
            : data
              ? tr("重新載入管理資料")
              : tr("連接管理錢包並驗證")}
        </button>
      </section>
      <OperationStatus busy={busy} done={operationDone} error={Boolean(error)} />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {data && (
        <>
          <nav className="admin-tabs" aria-label="管理分頁">
            {ADMIN_TABS.map(([key, label]) => (
              <button key={key} type="button" className={`admin-tabs__tab${tab === key ? " is-active" : ""}`} aria-current={tab === key ? "page" : undefined} onClick={() => setTab(key)}>{label}</button>
            ))}
          </nav>
          <AdminOverview data={data} sale={config.sale} multisigSale={(config.sale || "").toLowerCase() === "0x6496fc99ba4d5904e6c99488a9a9f477605146ac"} saleVersion={config.presaleVersion} onTab={setTab} />
          <div className="admin-grid">
            <section data-admin-tab="settings" className="panel">
              <h2>{tr("01 全站設定")}</h2>
              <label className="block top-gap">
                {tr("品牌名稱")}
                <input
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  maxLength={30}
                />
              </label>
              <label className="block top-gap">{tr("目前服務網路")}</label>
              <Select
                value={String(network)}
                onValueChange={(v) => setNetwork(Number(v) as ChainId)}
              >
                <SelectTrigger className="full-width">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="46630">
                    Robinhood Testnet · 46630
                  </SelectItem>
                  <SelectItem value="4663">{tr("Robinhood Mainnet · 4663")}</SelectItem>
                </SelectContent>
              </Select>
              <label className="check-line top-gap">
                <Checkbox
                  checked={maintenance}
                  onCheckedChange={(v) => setMaintenance(v === true)}
                />
                {tr("維護模式")}
              </label>
              <label className="block top-gap">
                {tr("官方 X")}
                <input
                  type="url"
                  value={socialX}
                  onChange={(e) => setSocialX(e.target.value)}
                />
              </label>
              <label className="block top-gap">
                {tr("官方 Telegram")}
                <input
                  type="url"
                  value={socialTelegram}
                  onChange={(e) => setSocialTelegram(e.target.value)}
                />
              </label>
              {button(tr("簽署並保存設定"), () =>
                admin("settings", {
                  brand,
                  chainId: network,
                  maintenance,
                  socialX,
                  socialTelegram,
                }),
              )}
              <p className="side-note">
                {tr("切換網路後使用該網路獨立的合約與資料。")}
              </p>
            </section>
            <section data-admin-tab="platform" className="panel">
              <h2>{tr("02 平台部署")}</h2>
              <p className="muted top-gap">
                {tr("部署 RVYN 相容的 TokenFactory / Registry / Boost 合約。")}
              </p>
              <code className="address">
                {config.platform || tr("尚未部署")}
              </code>
              {button(
                tr("部署 RVYN 平台合約"),
                deployPlatform,
                config.platformVersion === 2,
              )}
              <label className="block top-gap">
                {tr("既有部署交易 Hash")}
                <input
                  value={txHash}
                  onChange={(e) => setTxHash(e.target.value)}
                  placeholder="0x…"
                />
              </label>
              {button(
                tr("驗證並恢復平台部署"),
                () =>
                  admin("deployment", { chainId: config.chainId, tx: txHash }),
                !txHash,
              )}
              <p className="side-note">
                {tr("伺服器核對 bytecode、部署者與 owner。")}
              </p>
              {button(
                tr("同步 / 重建事件索引"),
                async () => {
                  const r = await api<{ caughtUp: boolean }>("sync", {});
                  toast.success(
                    r.caughtUp
                      ? tr("索引已同步")
                      : tr("此批完成，請繼續同步下一批"),
                  );
                },
                !config.platform,
              )}
            </section>
            <section data-admin-tab="platform" className="panel">
              <h2>03　RovynCore（RVYN）</h2>
              <p className="muted top-gap">
                {tr("第一筆發行由管理錢包透過同一發射台完成。")}
              </p>
              <Link className="primary top-gap" href="/launchpad">
                {tr("開啟空白發射表單")}
              </Link>
              <label className="block top-gap">
                {tr("RovynCore Token 地址")}
                <input
                  value={genesis}
                  onChange={(e) => setGenesis(e.target.value)}
                  placeholder={config.genesis || "0x…"}
                />
              </label>
              {button(
                tr("驗證 #001 並登錄品牌頁"),
                () => admin("genesis", { address: genesis }),
                !genesis,
              )}
              <code className="address">
                {config.genesis || tr("尚未登錄")}
              </code>
            </section>
            <section data-admin-tab="presale" className="panel rvyn-sale-desk-admin">
              <h2>{deskText.title}</h2>
              <p className="side-note">{deskText.note}</p>
              <ol className="admin-quick-steps">
                {allowlistHowToText.map((step) => <li key={step}>{step}</li>)}
              </ol>
              <dl className="receipt top-gap">
                <dt>{deskText.current}</dt><dd>{data.saleDesk.phase === "allowlist_prep" ? deskText.prep : data.saleDesk.phase === "allowlist_open" ? deskText.open : data.saleDesk.phase === "sale_closed" ? deskText.closed : deskText.sale}</dd>
                <dt>{deskText.count}</dt><dd>{data.allowlistCount.toLocaleString(locale)}</dd>
                <dt>{workflowText.pending}</dt><dd>{data.pendingCount.toLocaleString(locale)}</dd>
                <dt>{workflowText.approved}</dt><dd>{data.approvedCount.toLocaleString(locale)}</dd>
              </dl>
              {data.saleDesk.updatedAt > 0 && <p className="side-note">{new Date(data.saleDesk.updatedAt * 1000).toLocaleString(locale)} · {data.saleDesk.reason}</p>}
              <p className="side-note admin-stage-help">{deskText.stageHelp}</p>
              <h3 className="top-gap">{scheduleText.title}</h3>
              <p className="side-note">{scheduleText.timezone}</p>
              <p className="side-note"><strong>{scheduleText[ data.allowlistWindowStatus ]}</strong>{data.allowlistWindow.enabled && data.allowlistWindow.opensAt > 0 && data.allowlistWindow.closesAt > 0 ? ` · ${new Date(data.allowlistWindow.opensAt * 1000).toLocaleString(locale, { timeZone: "Etc/GMT-8" })} – ${new Date(data.allowlistWindow.closesAt * 1000).toLocaleString(locale, { timeZone: "Etc/GMT-8" })}` : ""}</p>
              <label className="check-row top-gap"><input type="checkbox" checked={allowlistEnabled} onChange={(event) => setAllowlistEnabled(event.target.checked)} />{scheduleText.enabled}</label>
              <div className="form-grid top-gap">
                <label className="block" htmlFor="rvyn-allowlist-opens">{scheduleText.opens}<input id="rvyn-allowlist-opens" type="datetime-local" value={allowlistOpensAt} onChange={(event) => setAllowlistOpensAt(event.target.value)} disabled={!allowlistEnabled} /></label>
                <label className="block" htmlFor="rvyn-allowlist-closes">{scheduleText.closes}<input id="rvyn-allowlist-closes" type="datetime-local" value={allowlistClosesAt} onChange={(event) => setAllowlistClosesAt(event.target.value)} disabled={!allowlistEnabled} /></label>
              </div>
              {button(scheduleText.save, saveAllowlistWindow, allowlistEnabled && (!allowlistOpensAt || !allowlistClosesAt) || (isAllowlistSale && data.saleStatus?.state !== "0" && allowlistEnabled))}
              <label className="block top-gap" htmlFor="rvyn-sale-phase">{deskText.current}</label>
              <select id="rvyn-sale-phase" value={nextPhase} onChange={(event) => setNextPhase(event.target.value as SalePhase)}>
                <option value="allowlist_prep">{deskText.prep}</option>
                <option value="allowlist_open">{deskText.open}</option>
                <option value="sale_open" disabled={!isAllowlistSale}>{deskText.sale}</option>
                <option value="sale_closed" disabled={!isAllowlistSale}>{deskText.closed}</option>
              </select>
              <label className="block top-gap" htmlFor="rvyn-sale-reason">{deskText.reason}</label>
              <textarea id="rvyn-sale-reason" value={phaseReason} onChange={(event) => setPhaseReason(event.target.value)} maxLength={500} />
              {button(deskText.save, saveSaleStage, phaseReason.trim().length < 10 || nextPhase === data.saleDesk.phase || (nextPhase === "sale_open" && !isAllowlistSale) || (nextPhase === "sale_closed" && !isAllowlistSale) || data.saleDesk.phase === "sale_closed")}
              <p className="side-note">{isAllowlistSale ? workflowText.noV4 : deskText.locked}</p>
              {isV5Family && <p className="side-note">{workflowText.v4}</p>}
              {isV5Family && <p className="side-note">{workflowText.sequence}</p>}
              <h3 className="top-gap">{deskText.registry}</h3>
              <p className="side-note">{deskText.note}</p>
              <label className="block top-gap" htmlFor="rvyn-allowlist-addresses">{deskText.addresses}</label>
              <textarea id="rvyn-allowlist-addresses" value={allowlistAddresses} onChange={(event) => setAllowlistAddresses(event.target.value)} rows={5} spellCheck={false} />
              <label className="block top-gap" htmlFor="rvyn-allowlist-source">{deskText.source}</label>
              <input id="rvyn-allowlist-source" value={allowlistSource} onChange={(event) => setAllowlistSource(event.target.value)} maxLength={100} />
              {button(deskText.import, importAllowlist, !allowlistAddresses.trim() || allowlistSource.trim().length < 2)}
              <div className="rvyn-allowlist-admin-list" aria-label={deskText.registry}>
              {data.allowlist.map((entry) => <div key={entry.wallet_address}><code>{entry.wallet_address}</code><span>{entry.status === "listed" ? deskText.listedStatus : entry.status === "pending" ? workflowText.pending : entry.status === "approved" ? workflowText.approved : deskText.revokedStatus} · {entry.source}</span>{entry.status === "pending" && <button type="button" className="secondary" disabled={busy || (isAllowlistSale && data.saleStatus?.state !== "0")} onClick={() => void run(() => approveAllowlist(entry.wallet_address))}>{workflowText.approve}</button>}</div>)}
              </div>
              <h3 className="top-gap">{deskText.revoke}</h3>
              <label className="block top-gap" htmlFor="rvyn-revoke-address">{deskText.revoke}</label>
              <input id="rvyn-revoke-address" value={revokeAddress} onChange={(event) => setRevokeAddress(event.target.value)} placeholder="0x…" spellCheck={false} />
              <label className="block top-gap" htmlFor="rvyn-revoke-reason">{deskText.revokeReason}</label>
              <textarea id="rvyn-revoke-reason" value={revokeReason} onChange={(event) => setRevokeReason(event.target.value)} maxLength={500} />
              {button(deskText.revokeButton, revokeAllowlist, !isAddress(revokeAddress.trim()) || revokeReason.trim().length < 10)}
              <h3 className="top-gap">{workflowText.root}</h3>
              <p className="side-note">{workflowText.rootHelp}</p>
              <p className="side-note">{workflowText.currentRoot}: <code>{data.saleStatus?.allowlistRoot || "—"}</code></p>
              {data.allowlistRoot && <p className="side-note">{workflowText.publishedRoot}: <code>{data.allowlistRoot.root}</code> · {data.allowlistRoot.addresses.length.toLocaleString(locale)} {workflowText.addressCount}</p>}
              <p className="side-note">{tr(data.allowlistRootMatchesList ? "白名單鏈上根值與目前名單一致" : "名單已變更或尚未發布；請重新產生白名單根值")}</p>
              {button(workflowText.rootPreview, previewAllowlistRoot, !isAllowlistSale || data.approvedCount + data.allowlistCount === 0 || data.saleStatus?.state !== "0")}
              {rootPreview && <div className="notice top-gap"><strong>{workflowText.rootReady} · {rootPreview.count.toLocaleString(locale)}</strong><code className="address">{rootPreview.root}</code></div>}
              {button(workflowText.root, publishAllowlistRoot, !rootPreview || !isAllowlistSale || data.saleStatus?.state !== "0")}
              <p className="side-note">{workflowText.rootConfirm}</p>
            </section>
            <SafeProposalPanel sale={config.sale} root={rootPreview?.root || data.allowlistRoot?.root} minPoolEth={data.saleStatus?.minPoolEth} maxPoolEth={data.saleStatus?.maxPoolEth} />
            <section data-admin-tab="presale" className="panel">
              <h2>{tr("04 RVYN 預售")}</h2>
              <p className="side-note">{deskText.locked}</p>
              {v5Checkpoint && <div className="admin-v5-checkpoint" role="status">
                <h3>{v5CheckpointText.title}</h3>
                <p>{v5Checkpoint.next}</p>
                <dl>
                  <dt>{v5CheckpointText.state}</dt><dd>{v5Checkpoint.state}</dd>
                  <dt>{v5CheckpointText.root}</dt><dd>{v5Checkpoint.rootReady ? v5CheckpointText.yes : v5CheckpointText.no}</dd>
                  <dt>{v5CheckpointText.allowance}</dt><dd>{v5ApprovalComplete || v5Checkpoint.inventoryReady ? v5CheckpointText.yes : v5CheckpointText.no}</dd>
                  <dt>{v5CheckpointText.inventory}</dt><dd>{v5Checkpoint.inventoryReady ? v5CheckpointText.yes : v5CheckpointText.no}</dd>
                </dl>
                <span>{v5CheckpointText.contract}</span>
                <code className="address">{config.sale || tr("尚未部署 Sale")}</code>
              </div>}
              <details className="admin-sale-guide" open={isV5Family}>
                <summary>{saleOpsGuide.heading}</summary>
                <ol>{saleOpsGuide.steps.map(([title, detail]) => <li key={title}><strong>{title}</strong><p>{detail}</p></li>)}</ol>
              </details>
              {isV5Family && <>
              <label className="block top-gap">
                {tr("預售部署交易 Hash")}
                <input value={saleTxHash} onChange={(event) => setSaleTxHash(event.target.value.trim())} placeholder="0x…" spellCheck={false} />
              </label>
              {button(
                tr("以交易 Hash 恢復預售"),
                () => admin("sale", { tx: saleTxHash, replace: !!config.sale }),
                !saleTxHash,
              )}
              <details className="admin-ops-group">
                <summary>{tr("部署 V6 預售合約（參數已固定；目前未開放）")}</summary>
                <p>{tr("發起人、團隊與 LP 受益地址皆為 Safe 多簽；LP 鎖定 24 個月；營運資金每 30 天解鎖 25%。部署是鏈上交易，需創辦人明確同意後才會開啟此按鈕。")}</p>
                {button(tr("部署 RVYN V6 預售合約"), deploySaleV6, !V6_MAINNET_DEPLOYMENT_ENABLED)}
              </details>
              <p className="side-note">{tr("改用新部署的預售合約時使用。伺服器只會在舊合約從未開啟、沒有募資也沒有庫存時才允許替換。")}</p>
              <code className="address">{config.sale || tr("尚未部署 Sale")}</code>
              </>}
              {!isV5Family && <>
              <label className="block top-gap">
                {tr("單枚價格（ETH，合約固定）")}
                <input
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  readOnly={config.presaleVersion === 2 || config.presaleVersion === 3 || config.presaleVersion === 4}
                />
              </label>
              <label className="block top-gap">
                {tr("團隊受益地址（合約部署後不可更改）")}
                <input value={teamBeneficiary} onChange={(event) => setTeamBeneficiary(event.target.value.trim())} placeholder="0x…" spellCheck={false} />
              </label>
              <label className="block top-gap">
                {tr("LP 鎖定期限")}
                <select value={lpLockMonths} onChange={(event) => setLpLockMonths(event.target.value)}>
                  <option value="">{tr("請選擇期限")}</option>
                  <option value="12">12 {tr("個月")}</option>
                  <option value="18">18 {tr("個月")}</option>
                  <option value="24">24 {tr("個月")}</option>
                </select>
              </label>
              {button(
                tr("部署 V5 預售合約"),
                deploySale,
                !V5_MAINNET_DEPLOYMENT_ENABLED || !isAddress(teamBeneficiary) || teamBeneficiary.toLowerCase() === "0x0000000000000000000000000000000000000000" || !lpLockMonths,
              )}
              <label className="block top-gap">
                {tr("預售部署交易 Hash")}
                <input value={saleTxHash} onChange={(event) => setSaleTxHash(event.target.value.trim())} placeholder="0x…" spellCheck={false} />
              </label>
              {button(
                tr("以交易 Hash 恢復預售"),
                () =>
                  admin("sale", {
                    tx: saleTxHash,
                    // The server only allows replacing a sale that was never opened, funded or stocked.
                    replace: !!config.sale,
                  }),
                !saleTxHash,
              )}
              <code className="address">
                {config.sale || tr("尚未部署 Sale")}
              </code>
              <label className="block">
                {tr("核准預售庫存（RVYN）")}
                <input
                  value={inventory}
                  onChange={(e) => setInventory(e.target.value)}
                  readOnly={config.presaleVersion === 2 || config.presaleVersion === 3 || config.presaleVersion === 4}
                />
              </label>
              </>}
              {isV5Family && <h3 className="admin-action-heading">{v5GroupText.primary}</h3>}
              <div className="actions">
                {isV5Family ? (
                  <>
                    {button(
                      v5ApprovalComplete || v5Checkpoint?.inventoryReady ? v5ButtonText.approveDone : v5ButtonText.approve,
                      async () => {
                        await chainAction(v5ButtonText.approve, "approve", [config.sale, parseEther(RVYN_MODEL.escrowTokens)], config.genesis, rvynArtifacts.LaunchToken.abi, [[workflowText.effect, v5ButtonText.approveEffect]]);
                        setData((current) => current?.saleStatus ? { ...current, saleStatus: { ...current.saleStatus, inventoryAllowance: RVYN_MODEL.escrowTokens } } : current);
                      },
                      !config.sale || !config.genesis || data.saleStatus?.state !== "0" || v5ApprovalComplete || v5Checkpoint?.inventoryReady,
                    )}
                    {button(
                      v5ButtonText.deposit,
                      async () => {
                        await chainAction(v5ButtonText.deposit, "depositInventory", [], config.sale, managedPresaleAbi, [[workflowText.effect, v5ButtonText.depositEffect]]);
                        setData((current) => current?.saleStatus ? { ...current, saleStatus: { ...current.saleStatus, inventory: RVYN_MODEL.escrowTokens, inventoryAllowance: "0" } } : current);
                      },
                      !config.sale || data.saleStatus?.state !== "0" || !v5ApprovalComplete || data.saleStatus?.inventory !== RVYN_MODEL.escrowTokens,
                    )}
                    {button(
                      isV6 ? tr("手動開啟預售（14 天；買家在結算後領取 RVYN）") : tr("手動開啟預售（14 天；買家即時收到 RVYN）"),
                      () => chainAction((isV6 ? tr("開啟 RVYN V6 預售") : tr("開啟 RVYN V5 預售")), "open", [], config.sale, managedPresaleAbi),
                      !config.sale || !data.allowlistRootMatchesList || data.saleDesk.phase !== "allowlist_open" || !["disabled", "closed"].includes(data.allowlistWindowStatus) || !data.allowlistRoot || data.allowlistRoot.root.toLowerCase() !== (data.saleStatus?.allowlistRoot || "").toLowerCase() || data.saleStatus?.state !== "0" || data.saleStatus?.inventory !== RVYN_MODEL.escrowTokens,
                    )}
                    {button(
                      tr("手動關閉預售"),
                      () => chainAction((isV6 ? tr("關閉 RVYN V6 預售") : tr("關閉 RVYN V5 預售")), "close", [], config.sale, managedPresaleAbi),
                      !config.sale || data.saleStatus?.state !== "1" || data.saleStatus.closedAt !== "0",
                    )}
                    <details className="admin-ops-group">
                      <summary>{v5GroupText.cancel}</summary>
                      <p>{v5GroupText.cancelNote}</p>
                      {button(
                        tr("開售前取消並取回尚未分配庫存"),
                        () => chainAction((isV6 ? tr("取消尚未開啟的 V6 預售") : tr("取消尚未開啟的 V5 預售")), "cancelBeforeOpen", [], config.sale, managedPresaleAbi),
                        !config.sale || data.saleStatus?.state !== "0",
                      )}
                    </details>
                    <details className="admin-ops-group" open={data.saleStatus?.state === "2" || data.saleStatus?.state === "3"}>
                      <summary>{v5GroupText.after}</summary>
                      {!isV6 && button(
                        tr("無募資或發射台收入時完成無池結算"),
                        () => chainAction(tr("完成 RVYN 無池結算"), "settleWithoutPool", [], config.sale, managedPresaleAbi, [[tr("效果"), tr("將未售出的預售配置依決議銷毀；沒有買家付款，因此不涉及退款。")]]),
                        !config.sale || data.saleStatus?.state !== "2" || data.saleStatus.raised !== "0" || data.saleStatus.liquidityRevenue !== "0",
                      )}
                    <label className="block top-gap">
                      {tr("手動轉入發射台收益（ETH；不會由合約自動計算）")}
                      <input inputMode="decimal" value={liquidityRevenueEth} onChange={(event) => setLiquidityRevenueEth(event.target.value)} placeholder="0.5" />
                    </label>
                    {button(
                      tr("記錄／存入發射台收益"),
                      () => chainAction(tr("轉入發射台收益"), "depositLiquidityRevenue", [], config.sale, managedPresaleAbi, [[tr("本次轉入"), `${liquidityRevenueEth} ETH`]], liquidityRevenueInputWei),
                      !config.sale || liquidityRevenueInputWei <= 0n || !["1", "2"].includes(data.saleStatus?.state || ""),
                    )}
                    <label className="block top-gap">
                      {tr("首次建池 ETH（上限：募資額 50%＋已轉入發射台收益）")}
                      <input inputMode="decimal" value={poolEthAmount} onChange={(event) => setPoolEthAmount(event.target.value)} placeholder="50" />
                    </label>
                    <p className="side-note">{tr("目前募資 {0} ETH；發射台收益 {1} ETH；建池上限 {2} ETH。固定預售價下，這次約投入 {3} 枚 RVYN。", {
                      0: data.saleStatus?.raised || "0",
                      1: data.saleStatus?.liquidityRevenue || "0",
                      2: formatEther(maxLiquidityWei),
                      3: poolAmountWei > 0n ? (poolAmountWei / 10n ** 14n).toLocaleString(locale) : "0",
                    })}</p>
                    {!isV6 && button(
                      tr("建立首池並鎖定 LP（不可逆；先確認金額）"),
                      () => chainAction(tr("建立 RVYN 首池並鎖定 LP"), "createInitialPool", [poolAmountWei], config.sale, managedPresaleAbi),
                      !config.sale || data.saleStatus?.state !== "2" || !data.saleStatus?.settlementReady || poolAmountWei <= 0n || poolAmountWei > maxLiquidityWei,
                    )}
                    {isV6 && <p className="side-note">{tr("V6 池子下限 {0} ETH、上限 {1} ETH；結束滿 7 天後任何人都能以下限結算。結算前買家無法領取 RVYN。", {
                      0: data.saleStatus?.minPoolEth || "—", 1: data.saleStatus?.maxPoolEth || "—",
                    })}</p>}
                    {isV6 && button(
                      tr("結算：建池、鎖定 LP、開放買家領取（不可逆；先確認金額）"),
                      () => chainAction(tr("結算 RVYN V6 預售"), "settle", [poolAmountWei], config.sale, managedPresaleAbi, [[tr("池子 ETH"), `${poolEthAmount} ETH`], [tr("效果"), tr("以固定價把對應 RVYN 與 ETH 放入池子並鎖定 LP，銷毀未售出的預售配置，之後買家才能領取 RVYN。")]]),
                      !config.sale || data.saleStatus?.state !== "2" || poolAmountWei < parseEtherSafe(data.saleStatus?.minPoolEth) || poolAmountWei > parseEtherSafe(data.saleStatus?.maxPoolEth),
                    )}
                    <label className="block top-gap">
                      {tr("結算後提領 ETH 金額（由管理者決定用途）")}
                      <input inputMode="decimal" value={withdrawEth} onChange={(event) => setWithdrawEth(event.target.value)} placeholder="5" />
                    </label>
                    {button(
                      tr("提領 ETH 至管理錢包"),
                      () => chainAction(tr("提領專案 ETH"), "withdrawProjectFunds", [withdrawAmountWei], config.sale, managedPresaleAbi),
                      !config.sale || data.saleStatus?.state !== "3" || withdrawAmountWei <= 0n || withdrawAmountWei > withdrawableWei,
                    )}
                    <label className="block top-gap">
                      {tr("未來加池投入 ETH")}
                      <input inputMode="decimal" value={futureLiquidityEth} onChange={(event) => setFutureLiquidityEth(event.target.value)} placeholder="1" />
                    </label>
                    <label className="block top-gap">
                      {tr("未來加池投入 RVYN")}
                      <input inputMode="numeric" value={futureLiquidityTokens} onChange={(event) => setFutureLiquidityTokens(event.target.value)} placeholder="10000" />
                    </label>
                    {button(
                      tr("加入未來流動性並鎖定 LP"),
                      () => {
                        const eth = futureLiquidityEthWei;
                        const tokens = futureLiquidityTokenWei;
                        return chainAction(tr("加入未來流動性並鎖定 LP"), "addFutureLiquidity", [tokens, tokens, eth, Math.floor(Date.now() / 1000) + 300], config.sale, managedPresaleAbi, [[tr("注意"), tr("請先依目前池子的即時比例填寫；合約要求本次投入數量完全符合路由器實際消耗量。")]], eth);
                      },
                      !config.sale || data.saleStatus?.state !== "3" || data.saleStatus.poolEth === "0" || futureLiquidityEthWei <= 0n || futureLiquidityTokenWei <= 0n,
                    )}
                    </details>
                    <details className="admin-ops-group" open={data.saleStatus?.state === "3"}>
                      <summary>{v5GroupText.allocations}</summary>
                    <label className="block top-gap">
                      {tr("產品與生態／社群與創作者分配地址")}
                      <input value={distributionRecipient} onChange={(event) => setDistributionRecipient(event.target.value.trim())} placeholder="0x…" spellCheck={false} />
                    </label>
                    <label className="block top-gap">
                      {tr("分配數量（RVYN）")}
                      <input inputMode="decimal" value={distributionAmount} onChange={(event) => setDistributionAmount(event.target.value)} placeholder="1000" />
                    </label>
                    <label className="block top-gap">
                      {tr("用途／活動參考記錄")}
                      <input value={distributionReference} onChange={(event) => setDistributionReference(event.target.value)} maxLength={120} />
                    </label>
                    {button(tr("分配至產品與生態"), () => chainAction(tr("分配產品與生態 RVYN"), "distributeProduct", [distributionRecipient, distributionAmountWei, keccak256(toBytes(distributionReference.trim()))], config.sale, managedPresaleAbi), !config.sale || !isAddress(distributionRecipient) || distributionAmountWei <= 0n || !distributionReference.trim() || data.saleStatus?.state === "0" || data.saleStatus?.state === "4")}
                    {button(tr("分配至社群與創作者"), () => chainAction(tr("分配社群與創作者 RVYN"), "distributeCommunity", [distributionRecipient, distributionAmountWei, keccak256(toBytes(distributionReference.trim()))], config.sale, managedPresaleAbi), !config.sale || !isAddress(distributionRecipient) || distributionAmountWei <= 0n || !distributionReference.trim() || data.saleStatus?.state === "0" || data.saleStatus?.state === "4")}
                    <p className="side-note">{tr("剩餘配置：產品與生態 {0} RVYN；社群與創作者 {1} RVYN；空投 {2} RVYN。", {
                      0: data.saleStatus?.productRemaining || "—", 1: data.saleStatus?.communityRemaining || "—", 2: data.saleStatus?.airdropRemaining || "—",
                    })}</p>
                    <label className="block top-gap">
                      {tr("空投名單（每行：錢包地址, RVYN 數量；每批最多 20 位）")}
                      <textarea rows={5} value={airdropRows} onChange={(event) => setAirdropRows(event.target.value)} placeholder={"0x..., 200\n0x..., 200"} spellCheck={false} />
                    </label>
                    <label className="block top-gap">
                      {tr("空投活動識別")}
                      <input value={airdropCampaign} onChange={(event) => setAirdropCampaign(event.target.value)} maxLength={120} />
                    </label>
                    {button(
                      tr("簽署並執行空投"),
                      () => {
                        if (!parsedAirdrop || !airdropCampaign.trim()) throw new Error(tr("請檢查最多 20 位地址、數量格式與活動識別。"));
                        return chainAction(tr("執行 RVYN 空投"), "airdrop", [parsedAirdrop.recipients, parsedAirdrop.amounts, keccak256(toBytes(airdropCampaign.trim()))], config.sale, managedPresaleAbi);
                      },
                      !config.sale || !parsedAirdrop || !airdropCampaign.trim() || data.saleStatus?.state === "0" || data.saleStatus?.state === "4",
                    )}
                    {data.saleStatus?.teamVesting && data.saleStatus.teamVesting !== "0x0000000000000000000000000000000000000000" && button(
                      tr("嘗試發放已解鎖團隊份額"),
                      () => chainAction(tr("發放已解鎖團隊份額"), "release", [], data.saleStatus!.teamVesting as Address, rvynV5Artifacts.RovynTeamVesting.abi),
                      data.saleStatus?.state === "0" || data.saleStatus?.state === "4",
                    )}
                    </details>
                  </>
                ) : config.presaleVersion === 3 || config.presaleVersion === 4 ? (
                  <>
                    {button(
                      tr("核准 8,000,000 RVYN 庫存"),
                      () =>
                        chainAction(
                          tr("核准 RVYN 預售庫存"),
                          "approve",
                          [config.sale, parseEther(RVYN_MODEL.escrowTokens)],
                          config.genesis,
                          rvynArtifacts.LaunchToken.abi,
                        ),
                      !config.sale || !config.genesis || (config.presaleVersion === 4 && data.saleStatus?.state !== "0"),
                    )}
                    {button(
                      tr("轉入 8,000,000 RVYN 至預售合約"),
                      () =>
                        chainAction(
                          tr("轉入 RVYN 預售庫存"),
                          "depositInventory",
                          [],
                          config.sale,
                          managedPresaleAbi,
                        ),
                      !config.sale || (config.presaleVersion === 4 && (data.saleStatus?.state !== "0" || data.saleStatus?.inventory !== "0")),
                    )}
                    {button(
                      tr("手動開啟預售"),
                      () =>
                        chainAction(
                          tr("開啟 RVYN 預售"),
                          "open",
                          [],
                          config.sale,
                          managedPresaleAbi,
                        ),
                      config.presaleVersion !== 4 || !data.allowlistRoot || data.allowlistRoot.root.toLowerCase() !== (data.saleStatus?.allowlistRoot || "").toLowerCase() || data.saleStatus?.state !== "0" || data.saleStatus?.inventory !== RVYN_MODEL.escrowTokens,
                    )}
                    {button(
                      tr("手動關閉預售"),
                      () =>
                        chainAction(
                          tr("關閉 RVYN 預售"),
                          "close",
                          [],
                          config.sale,
                          managedPresaleAbi,
                        ),
                      !config.sale || data.saleStatus?.state !== "1" || data.saleStatus.closedAt !== "0",
                    )}
                    {button(
                      tr("開售前取消預售"),
                      () => chainAction(tr("取消尚未開啟的預售"), "cancelBeforeOpen", [], config.sale, managedPresaleAbi, [[tr("效果"), tr("將合約標記為失敗；買家尚未付款。之後可另行取回庫存。")]]),
                      !config.sale || config.presaleVersion !== 4 || data.saleStatus?.state !== "0",
                    )}
                    {button(
                      tr("失敗後取回預售庫存"),
                      () => chainAction(tr("取回失敗預售庫存"), "recoverFailedInventory", [], config.sale, managedPresaleAbi, [[tr("效果"), tr("將合約持有的 RVYN 庫存退回發起方錢包；僅限預售已失敗。")]]),
                      !config.sale || config.presaleVersion !== 4 || data.saleStatus?.state !== "3",
                    )}
                    <label className="block top-gap">
                      {tr("建池投入 ETH（結算前指定）")}
                      <input
                        inputMode="decimal"
                        value={poolEthAmount}
                        onChange={(e) => setPoolEthAmount(e.target.value)}
                        placeholder="20"
                      />
                    </label>
                    {button(
                      tr("手動建立流動性"),
                      () =>
                        chainAction(
                          tr("建立 RVYN 流動性"),
                          "createPool",
                          [parseEther(poolEthAmount)],
                          config.sale,
                          managedPresaleAbi,
                        ),
                      !config.sale || !data.saleStatus?.settlementReady || poolAmountWei <= 0n || poolAmountWei > raisedWei,
                    )}
                    <label className="block top-gap">
                      {tr("結算後提領未投入建池的 ETH")}
                      <input
                        inputMode="decimal"
                        value={withdrawEth}
                        onChange={(e) => setWithdrawEth(e.target.value)}
                        placeholder="5"
                      />
                    </label>
                    {button(
                      tr("提領 ETH"),
                      () =>
                        chainAction(
                          tr("提領預售剩餘 ETH"),
                          "withdraw",
                          [parseEther(withdrawEth)],
                          config.sale,
                          managedPresaleAbi,
                        ),
                      !config.sale || data.saleStatus?.state !== "2" || withdrawAmountWei <= 0n || withdrawAmountWei > withdrawableWei,
                    )}
                    {button(
                      tr("結束預售並啟用退款"),
                      () =>
                        chainAction(
                          tr("結束 RVYN 預售並啟用退款"),
                          "failSale",
                          [],
                          config.sale,
                          managedPresaleAbi,
                        ),
                      !config.sale || !data.saleStatus?.failAvailable,
                    )}
                  </>
                ) : config.presaleVersion === 2 ? (
                  <>
                    {button(
                      tr("核准 8,000,000 RVYN 庫存"),
                      () =>
                        chainAction(
                          tr("核准 RVYN 預售庫存"),
                          "approve",
                          [config.sale, parseEther(RVYN_MODEL.escrowTokens)],
                          config.genesis,
                          rvynArtifacts.LaunchToken.abi,
                        ),
                      !config.sale || !config.genesis,
                    )}
                    {button(
                      tr("手動開啟預售"),
                      () =>
                        chainAction(
                          tr("開啟 RVYN 預售"),
                          "open",
                          [],
                          config.sale,
                          rvynArtifacts.GenesisPresale.abi,
                        ),
                      true,
                    )}
                    {button(
                      tr("手動關閉預售"),
                      () =>
                        chainAction(
                          tr("關閉 RVYN 預售"),
                          "close",
                          [],
                          config.sale,
                          rvynArtifacts.GenesisPresale.abi,
                        ),
                      !config.sale,
                    )}
                    {button(
                      tr("結算並建立流動性"),
                      () =>
                        chainAction(
                          tr("結算 RVYN 預售並建立流動性"),
                          "settle",
                          [],
                          config.sale,
                          rvynArtifacts.GenesisPresale.abi,
                        ),
                      !config.sale,
                    )}
                    {button(
                      tr("結束預售並啟用退款"),
                      () =>
                        chainAction(
                          tr("結束 RVYN 預售並啟用退款"),
                          "failSale",
                          [],
                          config.sale,
                          rvynArtifacts.GenesisPresale.abi,
                        ),
                      !config.sale,
                    )}
                  </>
                ) : (
                  <>
                    {button(
                      tr("轉入庫存"),
                      () =>
                        chainAction(
                          tr("轉入 Sale 庫存"),
                          "transfer",
                          [config.sale, parseEther(inventory)],
                          config.genesis,
                          artifacts.LaunchToken.abi,
                        ),
                      !config.sale,
                    )}
                    {button(
                      tr("啟用販售"),
                      () =>
                        chainAction(
                          tr("啟用販售"),
                          "setActive",
                          [true],
                          config.sale,
                          artifacts.GenesisSale.abi,
                        ),
                      true,
                    )}
                    {button(
                      tr("暫停販售"),
                      () =>
                        chainAction(
                          tr("暫停販售"),
                          "setActive",
                          [false],
                          config.sale,
                          artifacts.GenesisSale.abi,
                        ),
                      !config.sale,
                    )}
                  </>
                )}
              </div>
              {(config.presaleVersion === 3 || config.presaleVersion === 4 || isV5Family) && (
                <>
                  {data?.saleStatus && (
                    <p className="side-note">
                      {tr("目前募得 {0} ETH；已投入池 {1} ETH；可提領 {2} ETH。", {
                        0: data.saleStatus.raised,
                        1: data.saleStatus.poolEth,
                        2: data.saleStatus.withdrawable,
                      })}
                    </p>
                  )}
                  <p className="side-note">
                    {tr("V3/V4：預售期間不可提領；先成功建立流動性，再提領未投入建池的餘額。")}
                  </p>
                </>
              )}
            </section>
            <section data-admin-tab="platform" className="panel">
              <h2>{tr("05 費率與 Treasury")}</h2>
              <p className="muted top-gap">{tr("平台累積可提領")}</p>
              <strong className="fee">
                {data.treasuryBalance} <small>ETH</small>
              </strong>
              <code className="address">{config.treasury}</code>
              <div className="actions">
                {button(
                  tr("提領平台費用"),
                  () => chainAction(tr("提領平台費用"), "withdraw"),
                  !config.platform,
                )}
                {button(
                  tr("提領 Sale 收款"),
                  () =>
                    chainAction(
                      tr("提領 Sale 收款"),
                      "withdraw",
                      [],
                      config.sale,
                      artifacts.GenesisSale.abi,
                    ),
                  !config.sale || config.presaleVersion === 2,
                )}
              </div>
              <label className="block top-gap">
                {tr("Launch Fee（ETH）")}
                <input value={fee} onChange={(e) => setFee(e.target.value)} />
              </label>
              <label className="block top-gap">
                {tr("Treasury 地址")}
                <input
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                />
              </label>
              {button(
                tr("簽署更新鏈上費率"),
                () =>
                  chainAction(tr("更新費率及 Treasury"), "setFees", [
                    parseEther(fee),
                    recipient,
                  ]),
                !config.platform,
              )}
              <p className="side-note">
                {tr("既有費用仍歸原 Treasury，此設定不變更 Sale 收款地址。")}
              </p>
            </section>
            <section data-admin-tab="platform" className="panel">
              <h2>{tr("06 Boost 方案")}</h2>
              {config.plans.map((p, i) => (
                <div className="top-gap" key={p.id}>
                  <label>
                    {p.name} · {p.units}
                    {tr("點 /")}
                    {p.duration / 3600}h
                    <input
                      aria-label={tr("{0} 價格", { 0: p.name })}
                      value={planPrices[i]}
                      onChange={(e) =>
                        setPlanPrices((v) =>
                          v.map((x, j) => (i === j ? e.target.value : x)),
                        )
                      }
                    />
                  </label>
                  <div className="actions">
                    {button(
                      tr("更新 ETH 價格"),
                      () =>
                        chainAction(tr("更新 {0}", { 0: p.name }), "setPlan", [
                          p.id,
                          parseEther(planPrices[i]),
                          BigInt(p.duration),
                          p.units,
                          true,
                        ]),
                      !config.platform,
                    )}
                    {button(
                      tr("停用"),
                      () =>
                        chainAction(tr("停用 {0}", { 0: p.name }), "setPlan", [
                          p.id,
                          parseEther(planPrices[i]),
                          BigInt(p.duration),
                          p.units,
                          false,
                        ]),
                      !config.platform,
                    )}
                  </div>
                </div>
              ))}
            </section>
          </div>
          <section data-admin-tab="content" className="panel top-gap">
            <h2>{tr("內容審核")}</h2>
            <p className="muted">{tr("下架只影響網站，不改變鏈上資產。管理者緊急調整連結會留下歷史；外部連結不代表平台驗證。鏈上快照不可覆寫，只能附加有原因的更正。")}</p>
            {data.tokens.length === 0 ? (
              <p className="side-note">{tr("目前沒有 Token。")}</p>
            ) : (
              data.tokens.map((t) => (
                <div className="activity-row" key={t.address}>
                  <div>
                    <Link href={`/assets/robinhood/${t.address}`}>
                      {t.name} (${t.symbol})
                    </Link>
                    <small className="block">
                      {shortAddress(t.address)} ·{" "}
                      {t.hidden ? tr("已下架") : tr("公開")}
                    </small>
                    <label className="admin-liquidity">
                      <span>{tr("外部流動性／交易連結")}</span>
                      <input
                        type="url"
                        placeholder="https://"
                        value={liquidityDrafts[t.address] || ""}
                        onChange={(e) =>
                          setLiquidityDrafts((drafts) => ({
                            ...drafts,
                            [t.address]: e.target.value,
                          }))
                        }
                      />
                    </label>
                  </div>
                  <details className="admin-correction">
                    <summary>{tr("新增鏈上快照更正（需填原因）")}</summary>
                    <div className="admin-correction__fields">
                      <label>
                        {tr("總供應量（最小單位整數）")}
                        <input
                          inputMode="numeric"
                          value={correctionDrafts[t.address]?.totalSupply || String(t.supply)}
                          onChange={(event) => setCorrectionDrafts((current) => ({ ...current, [t.address]: { ...(current[t.address] || { totalSupply: String(t.supply), decimals: "18", reason: "" }), totalSupply: event.target.value } }))}
                        />
                      </label>
                      <label>
                        {tr("小數位")}
                        <input
                          inputMode="numeric"
                          value={correctionDrafts[t.address]?.decimals || "18"}
                          onChange={(event) => setCorrectionDrafts((current) => ({ ...current, [t.address]: { ...(current[t.address] || { totalSupply: String(t.supply), decimals: "18", reason: "" }), decimals: event.target.value } }))}
                        />
                      </label>
                      <label className="admin-correction__reason">
                        {tr("更正原因（至少 10 個字元）")}
                        <textarea
                          minLength={10}
                          maxLength={1000}
                          value={correctionDrafts[t.address]?.reason || ""}
                          onChange={(event) => setCorrectionDrafts((current) => ({ ...current, [t.address]: { ...(current[t.address] || { totalSupply: String(t.supply), decimals: "18", reason: "" }), reason: event.target.value } }))}
                        />
                      </label>
                      <button
                        className="secondary"
                        disabled={busy || (correctionDrafts[t.address]?.reason.trim().length || 0) < 10 || !/^\d+$/.test(correctionDrafts[t.address]?.totalSupply || "") || !/^\d+$/.test(correctionDrafts[t.address]?.decimals || "")}
                        onClick={() => void run(async () => {
                          const value = correctionDrafts[t.address];
                          await admin("record-correction", { address: t.address, reason: value.reason, canonicalState: { totalSupply: value.totalSupply, decimals: Number(value.decimals) } });
                          setCorrectionDrafts((current) => ({ ...current, [t.address]: { ...value, reason: "" } }));
                          toast.success(tr("更正已追加至 Asset Record 歷史；原始快照保留。"));
                        })}
                      >{tr("附加更正紀錄")}</button>
                    </div>
                  </details>
                  <div className="admin-token-actions">
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await admin("metadata", {
                            address: t.address,
                            liquidityUrl: liquidityDrafts[t.address] || "",
                          });
                          setData((current) => current && ({
                            ...current,
                            tokens: current.tokens.map((x) =>
                              x.address === t.address
                                ? {
                                    ...x,
                                    metadata: {
                                      ...(x.metadata || {}),
                                      liquidityUrl: liquidityDrafts[t.address] || "",
                                    },
                                  }
                                : x,
                            ),
                          }));
                          toast.success(tr("流動性連結已更新"));
                        })
                      }
                    >
                      {tr("儲存連結")}
                    </button>
                    {button(
                      t.hidden ? tr("恢復展示") : tr("下架展示"),
                      async () => {
                        await admin("moderate", {
                          address: t.address,
                          hidden: !t.hidden,
                        });
                        setData((current) => current && ({
                          ...current,
                          tokens: current.tokens.map((x) =>
                            x.address === t.address
                              ? { ...x, hidden: !t.hidden }
                              : x,
                          ),
                        }));
                      },
                    )}
                  </div>
                </div>
              ))
            )}
          </section>
          <section data-admin-tab="content" className="panel top-gap">
            <h2>{tr("檢舉紀錄")}</h2>
            {data.reports.length === 0 ? (
              <p className="side-note">{tr("目前沒有檢舉。")}</p>
            ) : (
              data.reports.map((r) => (
                <div className="activity-row" key={r.id}>
                  <div>
                    <strong>{shortAddress(r.token)}</strong>
                    <p>{r.reason}</p>
                    <small>{r.status}</small>
                  </div>
                  {button(
                    tr("標記已處理"),
                    async () => {
                      await admin("resolve", { id: r.id });
                      setData((current) => current && ({
                        ...current,
                        reports: current.reports.map((x) =>
                          x.id === r.id ? { ...x, status: "resolved" } : x,
                        ),
                      }));
                    },
                    r.status === "resolved",
                  )}
                </div>
              ))
            )}
          </section>
        </>
      )}
    </main>
  );
}
