"use client";

import { useEffect, useMemo, useState } from "react";
import { createPublicClient, http } from "viem";
import { RefreshCw } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { CHAINS } from "@/packages/web3/config";
import type { Locale } from "@/lib/translations";
import { RVYN_HEALTH_CONFIG } from "@/lib/rvyn-health-config";
import { deriveHealth, ethAmount, readRvynHealth, tokenAmount, type HealthClient, type HealthView, type SaleStateName } from "@/lib/rvyn-health";
import "./rvyn-health-panel.css";

type Copy = Record<Locale, string>;
const L = (en: string, hant: string, hans: string, ko: string): Copy => ({ en, "zh-Hant": hant, "zh-Hans": hans, ko });

const copy = {
  kicker: L("LIVE FROM THE CHAIN", "鏈上即時資料", "链上实时数据", "온체인 실시간 데이터"),
  title: L("RVYN health, read straight from the contracts.", "RVYN 健康狀態，直接從合約讀取。", "RVYN 健康状态，直接从合约读取。", "RVYN 상태, 컨트랙트에서 직접 읽습니다."),
  lead: L(
    "Every figure below is a contract getter read by your browser from the public RPC, not from our database. If a read fails it says so instead of guessing. This is information, not a safety rating or investment advice.",
    "下方每個數字都是由你的瀏覽器透過公開 RPC 從合約直接讀取，不是來自我們的資料庫。讀取失敗時會直接標示，不會猜測。這是資訊，不是安全評級或投資建議。",
    "下方每个数字都是由你的浏览器通过公开 RPC 从合约直接读取，不是来自我们的数据库。读取失败时会直接标示，不会猜测。这是信息，不是安全评级或投资建议。",
    "아래 모든 수치는 우리 데이터베이스가 아니라 브라우저가 공개 RPC로 컨트랙트에서 직접 읽은 값입니다. 읽기에 실패하면 추측하지 않고 그렇게 표시합니다. 정보일 뿐 안전 등급이나 투자 조언이 아닙니다.",
  ),
  block: L("Block {n} · {time} UTC", "區塊 {n}・{time} UTC", "区块 {n}・{time} UTC", "블록 {n} · {time} UTC"),
  refresh: L("Refresh", "重新整理", "刷新", "새로고침"),
  refreshing: L("Reading…", "讀取中…", "读取中…", "읽는 중…"),
  loading: L("Reading the chain…", "正在讀取鏈上資料…", "正在读取链上数据…", "온체인 데이터를 읽는 중…"),
  errorTitle: L("Could not reach the chain.", "無法連上區塊鏈。", "无法连接区块链。", "체인에 연결할 수 없습니다."),
  errorBody: L(
    "Your browser could not read from the Robinhood Chain RPC. Nothing is shown as fact until a read succeeds. You can still check every address on the explorer above.",
    "你的瀏覽器無法從 Robinhood Chain RPC 讀取資料。讀取成功前不會顯示任何數字。你仍可在上方用區塊瀏覽器核對每個地址。",
    "你的浏览器无法从 Robinhood Chain RPC 读取数据。读取成功前不会显示任何数字。你仍可在上方用区块浏览器核对每个地址。",
    "브라우저가 Robinhood Chain RPC에서 읽지 못했습니다. 읽기에 성공하기 전에는 어떤 수치도 사실로 표시하지 않습니다. 위의 탐색기에서 각 주소를 직접 확인할 수 있습니다.",
  ),
  stale: L("The latest refresh failed. Showing the last successful read.", "最近一次更新失敗，目前顯示上一次成功讀取的結果。", "最近一次更新失败，当前显示上一次成功读取的结果。", "최근 새로고침에 실패했습니다. 마지막으로 성공한 값을 표시합니다."),
  missing: L("unavailable", "無法讀取", "无法读取", "읽을 수 없음"),
  yes: L("Yes", "是", "是", "예"),
  no: L("No", "否", "否", "아니요"),
  alert: {
    supply_increased: L("Total supply is higher than the documented 10,000,000 RVYN. Treat every other number here with caution and check the explorer.", "總供應量高於文件載明的 10,000,000 RVYN。請謹慎看待此頁其他數字，並用區塊瀏覽器核對。", "总供应量高于文件载明的 10,000,000 RVYN。请谨慎看待此页其他数字，并用区块浏览器核对。", "총 공급량이 문서의 10,000,000 RVYN보다 많습니다. 이 페이지의 다른 수치도 주의해서 보고 탐색기로 확인하세요."),
    supply_reduced: L("Total supply is below 10,000,000 RVYN because tokens have been burned. Burns are permanent.", "總供應量低於 10,000,000 RVYN，因為有代幣被銷毀。銷毀無法復原。", "总供应量低于 10,000,000 RVYN，因为有代币被销毁。销毁无法恢复。", "토큰이 소각되어 총 공급량이 10,000,000 RVYN보다 적습니다. 소각은 되돌릴 수 없습니다."),
    partial_data: L("Some reads failed. Fields marked “unavailable” are unknown, not zero.", "部分讀取失敗。標示「無法讀取」的欄位是未知，不是零。", "部分读取失败。标示“无法读取”的字段是未知，不是零。", "일부 읽기에 실패했습니다. '읽을 수 없음'으로 표시된 항목은 0이 아니라 알 수 없는 값입니다."),
    sale_unreadable: L("The presale contract could not be read, so its status is unknown.", "無法讀取預售合約，因此狀態未知。", "无法读取预售合约，因此状态未知。", "프리세일 컨트랙트를 읽을 수 없어 상태를 알 수 없습니다."),
    sale_window_ended: L("The 14-day window has ended but the sale has not been closed onchain yet. Purchases already stop at the deadline.", "14 天期限已過，但預售尚未在鏈上關閉。購買在期限到時已經停止。", "14 天期限已过，但预售尚未在链上关闭。购买在期限到时已经停止。", "14일 기간이 끝났지만 아직 온체인에서 세일이 종료되지 않았습니다. 구매는 기한에 이미 중단됩니다."),
  },
  tokenTitle: L("Supply and who holds it", "供應量與持有者", "供应量与持有者", "공급량과 보유자"),
  tokenNote: L("RVYN is fixed at 10,000,000. Only burning can change the supply.", "RVYN 固定為 10,000,000，只有銷毀會改變供應量。", "RVYN 固定为 10,000,000，只有销毁会改变供应量。", "RVYN은 10,000,000으로 고정되며 소각만 공급량을 바꿉니다."),
  supply: L("Total supply", "總供應量", "总供应量", "총 공급량"),
  burned: L("Burned", "已銷毀", "已销毁", "소각됨"),
  holder: {
    sale: L("Presale contract", "預售合約", "预售合约", "프리세일 컨트랙트"),
    admin: L("Admin wallet (single wallet)", "管理錢包（單一錢包）", "管理钱包（单一钱包）", "관리 지갑(단일 지갑)"),
    safe: L("Multisig (Safe)", "多簽（Safe）", "多签（Safe）", "멀티시그(Safe)"),
    elsewhere: L("Everywhere else", "其他所有地址", "其他所有地址", "그 밖의 모든 주소"),
  },
  saleTitle: L("Presale", "預售", "预售", "프리세일"),
  saleNote: L("Read from the presale contract. A closed or unopened sale means no purchase is possible.", "資料來自預售合約。尚未開始或已關閉時，無法購買。", "数据来自预售合约。尚未开始或已关闭时，无法购买。", "프리세일 컨트랙트에서 읽은 값입니다. 시작 전이거나 종료되면 구매할 수 없습니다."),
  state: {
    label: L("Status", "狀態", "状态", "상태"),
    pending: L("Not open", "尚未開放", "尚未开放", "열리지 않음"),
    open: L("Open", "進行中", "进行中", "진행 중"),
    closed: L("Closed", "已關閉", "已关闭", "종료됨"),
    settled: L("Settled", "已結算", "已结算", "정산됨"),
    cancelled: L("Cancelled", "已取消", "已取消", "취소됨"),
  } satisfies Record<string, Copy>,
  raised: L("Raised", "已募得", "已募得", "모금액"),
  allowlist: L("Allowlist published onchain", "白名單已發布到鏈上", "白名单已发布到链上", "허용 목록 온체인 게시"),
  inventory: L("Sale inventory deposited", "預售庫存已存入", "预售库存已存入", "세일 재고 입금"),
  timeLeft: L("Time left", "剩餘時間", "剩余时间", "남은 시간"),
  ends: L("Window ends", "期限結束", "期限结束", "종료 시각"),
  pool: L("Initial pool", "首池", "首池", "초기 풀"),
  unsold: L("Unsold tokens burned", "未售代幣已銷毀", "未售代币已销毁", "미판매 토큰 소각"),
  withdrawn: L("Project ETH withdrawn", "已提領的專案 ETH", "已提取的项目 ETH", "인출된 프로젝트 ETH"),
  withdrawable: L("Project ETH withdrawable now", "目前可提領的專案 ETH", "当前可提取的项目 ETH", "현재 인출 가능한 프로젝트 ETH"),
  allocTitle: L("Tokens the admin directs", "由管理員決定去向的代幣", "由管理员决定去向的代币", "관리자가 배분하는 토큰"),
  allocNote: L("Spending is capped in the contract, but the recipients are chosen by the sponsor. These are not locked.", "合約限制了總額，但收款對象由發起人決定，這些代幣沒有鎖倉。", "合约限制了总额，但收款对象由发起人决定，这些代币没有锁仓。", "총액은 컨트랙트가 제한하지만 수령인은 스폰서가 정합니다. 잠겨 있지 않습니다."),
  alloc: {
    manager: L("Manager wallet", "管理者錢包", "管理者钱包", "관리자 지갑"),
    product: L("Product and ecosystem", "產品與生態", "产品与生态", "제품 및 생태계"),
    community: L("Community and creators", "社群與創作者", "社区与创作者", "커뮤니티 및 크리에이터"),
    airdrop: L("Airdrop reserve", "空投", "空投", "에어드롭"),
  },
  cap: L("cap", "上限", "上限", "한도"),
  released: L("Released at sale open", "開售時已釋出", "开售时已释放", "세일 시작 시 지급"),
  spent: L("sent", "已發出", "已发出", "지급"),
  vestTitle: L("Team vesting", "團隊鎖倉", "团队锁仓", "팀 베스팅"),
  vestNote: L("One-year cliff, then 1/24 every 30 days.", "一年 cliff，之後每 30 天釋出 1/24。", "一年 cliff，之后每 30 天释放 1/24。", "1년 클리프 후 30일마다 1/24씩."),
  vestNone: L("Not created yet. The vesting contract is created when the sale opens.", "尚未建立。鎖倉合約會在預售開始時建立。", "尚未创建。锁仓合约会在预售开始时创建。", "아직 생성되지 않았습니다. 세일이 시작될 때 만들어집니다."),
  vested: L("Vested so far", "目前已解鎖", "当前已解锁", "현재까지 베스팅"),
  releasedAmt: L("Already released", "已領取", "已领取", "수령 완료"),
  releasable: L("Releasable now", "目前可領取", "当前可领取", "현재 수령 가능"),
  cliffEnds: L("Cliff ends", "Cliff 結束", "Cliff 结束", "클리프 종료"),
  firstRelease: L("First release", "首次釋出", "首次释放", "첫 지급"),
  nextRelease: L("Next release", "下次釋出", "下次释放", "다음 지급"),
  finalRelease: L("Final release", "最後一次釋出", "最后一次释放", "마지막 지급"),
  lockTitle: L("Initial liquidity lock", "首池流動性鎖倉", "首池流动性锁仓", "초기 유동성 락"),
  lockNote: L("Counts the initial lock only. Later liquidity additions are locked separately and are not included here.", "只計算首次鎖倉。之後加入的流動性會另外鎖倉，不包含在此。", "只计算首次锁仓。之后加入的流动性会另外锁仓，不包含在此。", "초기 락만 집계합니다. 이후 추가 유동성은 별도로 잠기며 여기에 포함되지 않습니다."),
  lockNone: L("Not created yet. The lock is created when the pool is made.", "尚未建立。鎖倉會在建立流動性池時產生。", "尚未创建。锁仓会在创建流动性池时产生。", "아직 생성되지 않았습니다. 풀을 만들 때 생성됩니다."),
  lockShare: L("Share of LP supply locked", "被鎖定的 LP 比例", "被锁定的 LP 比例", "락된 LP 비율"),
  unlockAt: L("Unlocks on", "解鎖日期", "解锁日期", "해제일"),
  lockState: L("Lock state", "鎖倉狀態", "锁仓状态", "락 상태"),
  locked: L("Locked", "鎖定中", "锁定中", "잠김"),
  unlocked: L("Unlocked (can be withdrawn)", "已解鎖（可領出）", "已解锁（可取出）", "해제됨(인출 가능)"),
  foot: L("Read in your browser from the public Robinhood Chain RPC. Values update about once a minute while this page is open.", "由你的瀏覽器從 Robinhood Chain 公開 RPC 讀取。頁面開著時約每分鐘更新一次。", "由你的浏览器从 Robinhood Chain 公开 RPC 读取。页面开着时约每分钟更新一次。", "브라우저가 Robinhood Chain 공개 RPC에서 읽습니다. 페이지를 열어 두면 약 1분마다 갱신됩니다."),
};

const NUMBER_LOCALE: Record<Locale, string> = { en: "en", "zh-Hant": "zh-TW", "zh-Hans": "zh-CN", ko: "ko" };
const REFRESH_MS = 60_000;

let cachedClient: HealthClient | null = null;
function healthClient(): HealthClient {
  if (cachedClient) return cachedClient;
  const chain = CHAINS[RVYN_HEALTH_CONFIG.chainId as keyof typeof CHAINS];
  const client = createPublicClient({ chain, transport: http(chain.rpcUrls.default.http[0], { timeout: 10_000, retryCount: 1, batch: { batchSize: 50, wait: 16 } }) });
  cachedClient = {
    readContract: (args) => client.readContract(args as never),
    getBlock: () => client.getBlock(),
  };
  return cachedClient;
}

const utc = (seconds: number) => new Date(seconds * 1000).toISOString().slice(0, 16).replace("T", " ");
const utcDay = (seconds: number) => new Date(seconds * 1000).toISOString().slice(0, 10);

function duration(seconds: number) {
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  return days > 0 ? `${days}d ${hours}h` : hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function Row({ label, value, missing }: { label: string; value: string | null | undefined; missing: string }) {
  return (
    <div className="rvyn-health__row">
      <dt>{label}</dt>
      <dd className={value ? undefined : "is-missing"}>{value ?? missing}</dd>
    </div>
  );
}

export function RvynHealthPanel() {
  const { locale } = useLanguage();
  const t = (value: Copy) => value[locale];
  const [view, setView] = useState<HealthView | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(true);
  const [tick, setTick] = useState(0);

  // Each tick starts one read; a newer tick cancels the previous one so results never arrive out of order.
  useEffect(() => {
    let cancelled = false;
    readRvynHealth(healthClient(), RVYN_HEALTH_CONFIG)
      .then((raw) => {
        // No block and no supply means the RPC itself was unreachable; do not present that as "pending".
        if (raw.block === null && !raw.supply.ok) throw new Error("unreachable");
        if (cancelled) return;
        setView(deriveHealth(raw));
        setFailed(false);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tick]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!document.hidden) setTick((value) => value + 1);
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, []);

  const refresh = () => {
    setBusy(true);
    setTick((value) => value + 1);
  };

  const nf = useMemo(() => new Intl.NumberFormat(NUMBER_LOCALE[locale], { maximumFractionDigits: 2 }), [locale]);
  const tokens = (value: bigint | null) => (value === null ? null : `${nf.format(tokenAmount(value))} RVYN`);
  const eth = (value: bigint | null) => (value === null ? null : `${nf.format(ethAmount(value))} ETH`);
  const pct = (bps: number | null) => (bps === null ? null : `${nf.format(bps / 100)}%`);
  const yesNo = (value: boolean | null) => (value === null ? null : value ? t(copy.yes) : t(copy.no));
  const day = (seconds: number | null | undefined) => (seconds ? utcDay(seconds) : null);

  const missingText = t(copy.missing);

  const sale = view?.sale;
  const knownHeld = view ? view.token.balances.reduce((sum, entry) => sum + (entry.amount ?? 0n), 0n) : 0n;
  const allHeldKnown = view ? view.token.balances.every((entry) => entry.amount !== null) : false;
  const elsewhere = view && view.token.supply !== null && allHeldKnown ? view.token.supply - knownHeld : null;
  const stateLabel = (state: SaleStateName | null) => (state ? t(copy.state[state]) : null);

  return (
    <section className="game-principles rvyn-health" aria-labelledby="rvyn-health-title" aria-busy={busy}>
      <div className="game-principles__head">
        <span className="game-chapter__kicker">{t(copy.kicker)}</span>
        <h2 id="rvyn-health-title">{t(copy.title)}</h2>
      </div>
      <p className="transparency-body">{t(copy.lead)}</p>
      <div className="rvyn-health__bar-row">
        <span className="rvyn-health__meta" aria-live="polite">
          {view?.block ? t(copy.block).replace("{n}", Number(view.block.number).toLocaleString(NUMBER_LOCALE[locale])).replace("{time}", utc(view.block.timestamp)) : busy ? t(copy.loading) : ""}
        </span>
        <button type="button" className="rvyn-health__refresh" onClick={refresh} disabled={busy}>
          <RefreshCw size={15} aria-hidden="true" className={busy ? "is-spinning" : undefined} />
          {busy ? t(copy.refreshing) : t(copy.refresh)}
        </button>
      </div>

      {failed && !view && (
        <div className="rvyn-health__alert is-error" role="alert">
          <strong>{t(copy.errorTitle)}</strong> {t(copy.errorBody)}
        </div>
      )}
      {failed && view && <div className="rvyn-health__alert is-warn" role="status">{t(copy.stale)}</div>}
      {!view && !failed && <div className="rvyn-health__skeleton" aria-hidden="true" />}

      {view && (
        <>
          {view.alerts.length > 0 && (
            <ul className="rvyn-health__alerts">
              {view.alerts.map((alert) => (
                <li key={alert.id} className={`rvyn-health__alert${alert.severity === "warn" ? " is-warn" : ""}`}>{t(copy.alert[alert.id])}</li>
              ))}
            </ul>
          )}
          <div className="rvyn-health__grid">
            <article className="rvyn-health__card">
              <h3>{t(copy.tokenTitle)}</h3>
              <p>{t(copy.tokenNote)}</p>
              <dl className="rvyn-health__rows">
                <Row missing={missingText} label={t(copy.supply)} value={tokens(view.token.supply)} />
                <Row missing={missingText} label={t(copy.burned)} value={tokens(view.token.burned)} />
                {view.token.balances.map((entry) => (
                  <Row missing={missingText} key={entry.id} label={t(copy.holder[entry.id as "sale" | "admin" | "safe"])} value={tokens(entry.amount)} />
                ))}
                <Row missing={missingText} label={t(copy.holder.elsewhere)} value={tokens(elsewhere)} />
              </dl>
            </article>

            <article className="rvyn-health__card">
              <h3>{t(copy.saleTitle)}</h3>
              <p>{t(copy.saleNote)}</p>
              <dl className="rvyn-health__rows">
                <div className="rvyn-health__row">
                  <dt>{t(copy.state.label)}</dt>
                  <dd className={sale?.state ? undefined : "is-missing"}>
                    {sale?.state ? <span className={`rvyn-health__chip${sale.state === "open" ? " is-open" : ""}`}>{stateLabel(sale.state)}</span> : t(copy.missing)}
                  </dd>
                </div>
                <Row missing={missingText} label={t(copy.raised)} value={sale?.raised != null ? `${nf.format(ethAmount(sale.raised))} / ${nf.format(ethAmount(sale.hardCap))} ETH` : null} />
              </dl>
              {sale?.progressBps != null && (
                <div className="rvyn-health__bar" role="img" aria-label={`${t(copy.raised)} ${pct(sale.progressBps)}`}>
                  <span style={{ width: `${sale.progressBps / 100}%` }} />
                </div>
              )}
              <dl className="rvyn-health__rows">
                <Row missing={missingText} label={t(copy.allowlist)} value={yesNo(sale?.allowlistRootSet ?? null)} />
                <Row missing={missingText} label={t(copy.inventory)} value={yesNo(sale?.inventoryDeposited ?? null)} />
                {sale?.state === "open" && <Row missing={missingText} label={t(copy.timeLeft)} value={sale.secondsLeft !== null ? duration(sale.secondsLeft) : null} />}
                {sale?.endsAt ? <Row missing={missingText} label={t(copy.ends)} value={`${utc(sale.endsAt)} UTC`} /> : null}
                {sale?.pool.pair ? <Row missing={missingText} label={t(copy.pool)} value={sale.pool.eth !== null && sale.pool.tokens !== null ? `${eth(sale.pool.eth)} + ${tokens(sale.pool.tokens)}` : null} /> : null}
                {sale?.state === "settled" && <Row missing={missingText} label={t(copy.unsold)} value={tokens(sale.unsoldBurned)} />}
                {sale?.state === "settled" && <Row missing={missingText} label={t(copy.withdrawn)} value={eth(sale.funds.withdrawn)} />}
                {sale?.state === "settled" && <Row missing={missingText} label={t(copy.withdrawable)} value={eth(sale.funds.withdrawable)} />}
              </dl>
            </article>

            <article className="rvyn-health__card">
              <h3>{t(copy.allocTitle)}</h3>
              <p>{t(copy.allocNote)}</p>
              <dl className="rvyn-health__rows">
                {view.allocations.map((entry) => (
                  <Row
                    missing={missingText}
                    key={entry.id}
                    label={t(copy.alloc[entry.id])}
                    value={
                      entry.id === "manager"
                        ? entry.released === null ? null : `${tokens(entry.cap)} ${t(copy.cap)} · ${t(copy.released)}: ${yesNo(entry.released)}`
                        : entry.spent === null ? null : `${nf.format(tokenAmount(entry.spent))} / ${nf.format(tokenAmount(entry.cap))} RVYN ${t(copy.spent)}`
                    }
                  />
                ))}
              </dl>
            </article>

            <article className="rvyn-health__card">
              <h3>{t(copy.vestTitle)}</h3>
              <p>{t(copy.vestNote)}</p>
              {view.vesting === null ? (
                <p className="rvyn-health__note">{t(copy.vestNone)}</p>
              ) : (
                <dl className="rvyn-health__rows">
                  <Row missing={missingText} label={t(copy.vested)} value={pct(view.vesting.vestedBps)} />
                  <Row missing={missingText} label={t(copy.releasedAmt)} value={tokens(view.vesting.released)} />
                  <Row missing={missingText} label={t(copy.releasable)} value={tokens(view.vesting.releasable)} />
                  <Row missing={missingText} label={t(copy.cliffEnds)} value={day(view.vesting.schedule?.cliffEndsAt)} />
                  <Row missing={missingText} label={t(copy.firstRelease)} value={day(view.vesting.schedule?.firstReleaseAt)} />
                  <Row missing={missingText} label={t(copy.nextRelease)} value={view.vesting.schedule ? day(view.vesting.schedule.nextReleaseAt) ?? "—" : null} />
                  <Row missing={missingText} label={t(copy.finalRelease)} value={day(view.vesting.schedule?.finalReleaseAt)} />
                </dl>
              )}
            </article>

            <article className="rvyn-health__card">
              <h3>{t(copy.lockTitle)}</h3>
              <p>{t(copy.lockNote)}</p>
              {view.lock === null ? (
                <p className="rvyn-health__note">{t(copy.lockNone)}</p>
              ) : (
                <dl className="rvyn-health__rows">
                  <Row missing={missingText} label={t(copy.lockShare)} value={pct(view.lock.shareBps)} />
                  <Row missing={missingText} label={t(copy.unlockAt)} value={day(view.lock.unlockAt)} />
                  <Row missing={missingText} label={t(copy.lockState)} value={view.lock.unlocked === null ? null : view.lock.unlocked ? t(copy.unlocked) : t(copy.locked)} />
                </dl>
              )}
            </article>
          </div>
          <p className="rvyn-health__foot">{t(copy.foot)}</p>
        </>
      )}
    </section>
  );
}
