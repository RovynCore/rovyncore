"use client";

import Image from "next/image";
import { ArrowRight, ArrowUpRight, BadgeCheck, Coins, Gamepad2, Layers, Lock, ShieldCheck, Users } from "lucide-react";
import Link from "@/components/site-link";
import { useLanguage } from "@/components/language-provider";
import { Address, Countdown, formatUtc8, Head, useSaleStatus, type Copy4 } from "@/components/rv/ui";
import { RVYN_MODEL } from "@/lib/rvyn-model";
import { AllocationBar } from "@/components/rv/allocation";

const T = {
  heroEyebrow: { en: "Robinhood Chain · First game in development", "zh-Hant": "Robinhood Chain · 第一款遊戲開發中", "zh-Hans": "Robinhood Chain · 第一款游戏开发中", ko: "Robinhood Chain · 첫 게임 개발 중" },
  heroA: { en: "A world in the making.", "zh-Hant": "一個正在成形的世界。", "zh-Hans": "一个正在成形的世界。", ko: "만들어지고 있는 세계." },
  heroB: { en: "RVYN at its core.", "zh-Hant": "RVYN 是它的核心。", "zh-Hans": "RVYN 是它的核心。", ko: "그 중심에 RVYN." },
  heroLead: { en: "ROVYN CORE is building a game world on Robinhood Chain, with RVYN as its planned core currency. We build in public: contracts are verified and every step is on record.", "zh-Hant": "ROVYN CORE 正在 Robinhood Chain 上打造一個遊戲世界，RVYN 規劃為它的核心貨幣。我們公開建置：合約公開驗證，每一步都有紀錄。", "zh-Hans": "ROVYN CORE 正在 Robinhood Chain 上打造一个游戏世界，RVYN 规划为它的核心货币。我们公开建置：合约公开验证，每一步都有记录。", ko: "ROVYN CORE는 Robinhood Chain에서 게임 세계를 만들고 있으며 RVYN은 그 핵심 화폐로 계획되어 있습니다. 공개적으로 만듭니다. 계약은 검증되어 있고 모든 단계가 기록됩니다." },
  join: { en: "Join the whitelist", "zh-Hant": "登記白名單", "zh-Hans": "登记白名单", ko: "화이트리스트 신청" },
  opensOn: { en: "Whitelist opens", "zh-Hant": "白名單開放", "zh-Hans": "白名单开放", ko: "화이트리스트 시작" },
  viewRvyn: { en: "Explore RVYN", "zh-Hant": "認識 RVYN", "zh-Hans": "认识 RVYN", ko: "RVYN 알아보기" },
  aboutGame: { en: "About the game", "zh-Hant": "關於遊戲", "zh-Hans": "关于游戏", ko: "게임 소개" },
  whitelist: { en: "Whitelist", "zh-Hant": "白名單", "zh-Hans": "白名单", ko: "화이트리스트" },
  presale: { en: "Presale", "zh-Hant": "預售", "zh-Hans": "预售", ko: "프리세일" },
  game: { en: "Game", "zh-Hant": "遊戲", "zh-Hans": "游戏", ko: "게임" },
  open: { en: "Open now", "zh-Hant": "開放中", "zh-Hans": "开放中", ko: "진행 중" },
  scheduled: { en: "Scheduled", "zh-Hant": "已排程", "zh-Hans": "已排程", ko: "예정" },
  closed: { en: "Closed", "zh-Hant": "已截止", "zh-Hans": "已截止", ko: "마감" },
  preparing: { en: "Preparing", "zh-Hant": "準備中", "zh-Hans": "准备中", ko: "준비 중" },
  checking: { en: "Checking…", "zh-Hant": "確認中…", "zh-Hans": "确认中…", ko: "확인 중…" },
  unavailable: { en: "Status unavailable", "zh-Hant": "暫時無法讀取", "zh-Hans": "暂时无法读取", ko: "확인 불가" },
  notOpen: { en: "Not open", "zh-Hant": "尚未開放", "zh-Hans": "尚未开放", ko: "미개시" },
  noDate: { en: "No date set yet", "zh-Hant": "尚未訂定日期", "zh-Hans": "尚未确定日期", ko: "일정 미정" },
  inDev: { en: "In development", "zh-Hant": "開發中", "zh-Hans": "开发中", ko: "개발 중" },
  firstLook: { en: "First look coming to this site", "zh-Hant": "首次公開將發布在本站", "zh-Hans": "首次公开将发布在本站", ko: "첫 공개는 이 사이트에서" },
  closesOn: { en: "Closes", "zh-Hant": "截止", "zh-Hans": "截止", ko: "마감" },
  whatEyebrow: { en: "What we are building", "zh-Hant": "我們在做什麼", "zh-Hans": "我们在做什么", ko: "우리가 만드는 것" },
  whatTitle: { en: "One brand. A game, its currency, and the tools around it.", "zh-Hant": "一個品牌：一款遊戲、它的貨幣，以及周邊工具。", "zh-Hans": "一个品牌：一款游戏、它的货币，以及周边工具。", ko: "하나의 브랜드. 게임, 그 화폐, 그리고 주변 도구." },
  gameTitle: { en: "The game", "zh-Hant": "遊戲", "zh-Hans": "游戏", ko: "게임" },
  gameBody: { en: "Our first game is in development. Gameplay and how RVYN is used in it will be published here once they are confirmed.", "zh-Hant": "第一款遊戲開發中。玩法與 RVYN 在遊戲中的用途，確定後會在這裡公布。", "zh-Hans": "第一款游戏开发中。玩法与 RVYN 在游戏中的用途，确定后会在这里公布。", ko: "첫 게임을 개발 중입니다. 게임 방식과 RVYN의 쓰임은 확정되면 이곳에 공개합니다." },
  rvynTitle: { en: "RVYN", "zh-Hant": "RVYN", "zh-Hans": "RVYN", ko: "RVYN" },
  rvynBody: { en: "A fixed supply of 10,000,000 tokens, planned as the game's core currency. No staking, profit-sharing or promised returns.", "zh-Hant": "固定供應 10,000,000 枚，規劃為遊戲的核心貨幣。沒有 staking、分潤或收益承諾。", "zh-Hans": "固定供应 10,000,000 枚，规划为游戏的核心货币。没有 staking、分润或收益承诺。", ko: "고정 공급 10,000,000개, 게임의 핵심 화폐로 계획. 스테이킹, 수익 배분, 수익 약속 없음." },
  toolsTitle: { en: "Tools, already live", "zh-Hant": "已上線的工具", "zh-Hans": "已上线的工具", ko: "이미 운영 중인 도구" },
  toolsBody: { en: "A launchpad for fixed-supply tokens and a public Onchain Record for every launch. They are how we work in the open.", "zh-Hant": "固定供應代幣的發射台，以及每次發射都有的公開鏈上紀錄。這是我們公開運作的方式。", "zh-Hans": "固定供应代币的发射台，以及每次发射都有的公开链上记录。这是我们公开运作的方式。", ko: "고정 공급 토큰 런치패드와 모든 발행의 공개 온체인 기록. 우리가 공개적으로 일하는 방식입니다." },
  more: { en: "Learn more", "zh-Hant": "了解更多", "zh-Hans": "了解更多", ko: "더 알아보기" },
  rvynEyebrow: { en: "RVYN at a glance", "zh-Hant": "RVYN 一覽", "zh-Hans": "RVYN 一览", ko: "RVYN 한눈에" },
  rvynHeadTitle: { en: "Fixed supply. Rules written in the contract.", "zh-Hant": "固定供應，規則寫在合約裡。", "zh-Hans": "固定供应，规则写在合约里。", ko: "고정 공급. 규칙은 계약에." },
  supply: { en: "Total supply", "zh-Hant": "總供應量", "zh-Hans": "总供应量", ko: "총 공급량" },
  price: { en: "Presale price", "zh-Hant": "預售單價", "zh-Hans": "预售单价", ko: "프리세일 가격" },
  cap: { en: "Per-wallet cap", "zh-Hant": "單錢包上限", "zh-Hans": "单钱包上限", ko: "지갑당 한도" },
  delivery: { en: "Delivery", "zh-Hant": "交付方式", "zh-Hans": "交付方式", ko: "지급 방식" },
  deliveryValue: { en: "Claim after settlement", "zh-Hant": "結算後領取", "zh-Hans": "结算后领取", ko: "정산 후 클레임" },
  contract: { en: "Token contract", "zh-Hant": "代幣合約", "zh-Hans": "代币合约", ko: "토큰 계약" },
  allocTitle: { en: "Allocation caps", "zh-Hant": "配置上限", "zh-Hans": "配置上限", ko: "배분 상한" },
  allocNote: { en: "Caps defined in the sale contract, not a record of tokens sold. Unsold presale tokens are burned.", "zh-Hant": "合約定義的上限，不代表已售出。未售出的預售代幣會銷毀。", "zh-Hans": "合约定义的上限，不代表已售出。未售出的预售代币会销毁。", ko: "판매 계약에 정의된 상한이며 판매 기록이 아닙니다. 미판매 프리세일 토큰은 소각됩니다." },
  fullDetails: { en: "Full RVYN details", "zh-Hant": "完整 RVYN 資訊", "zh-Hans": "完整 RVYN 信息", ko: "RVYN 자세히" },
  trustEyebrow: { en: "Check, don't trust", "zh-Hant": "請自己查證", "zh-Hans": "请自己查证", ko: "직접 확인하세요" },
  trustTitle: { en: "Everything that matters can be checked onchain.", "zh-Hant": "重要的事，都能在鏈上查證。", "zh-Hans": "重要的事，都能在链上查证。", ko: "중요한 것은 모두 온체인에서 확인할 수 있습니다." },
  t1: { en: "Verified source", "zh-Hant": "原始碼已驗證", "zh-Hans": "源码已验证", ko: "소스 검증" },
  t1b: { en: "The RVYN token, the presale contract and the launch platform are source-verified on the explorer.", "zh-Hant": "RVYN 代幣、預售合約與發射平台的原始碼都已在區塊瀏覽器驗證。", "zh-Hans": "RVYN 代币、预售合约与发射平台的源码都已在区块浏览器验证。", ko: "RVYN 토큰, 프리세일 계약, 런치 플랫폼 모두 탐색기에서 소스 검증되었습니다." },
  t2: { en: "Multisig sponsor", "zh-Hant": "多簽發起人", "zh-Hans": "多签发起人", ko: "멀티시그 스폰서" },
  t2b: { en: "The presale is controlled by a Safe that needs 2 of 3 signers. No single key can move it.", "zh-Hant": "預售由 Safe 多簽控制，需 3 位簽署人中的 2 位同意，沒有單一金鑰能動用。", "zh-Hans": "预售由 Safe 多签控制，需 3 位签署人中的 2 位同意，没有单一密钥能动用。", ko: "프리세일은 3명 중 2명의 서명이 필요한 Safe가 관리합니다. 단일 키로 움직일 수 없습니다." },
  t3: { en: "Launch rules in code", "zh-Hant": "發射規則寫進合約", "zh-Hans": "发射规则写进合约", ko: "코드에 담긴 출시 규칙" },
  t3b: { en: "Buyers claim after settlement, the pool gets at least half the raise, LP is locked for 24 months, and anyone can settle 7 days after close.", "zh-Hant": "結算後才領取、池子至少放入募資的一半、LP 鎖倉 24 個月、結束滿 7 天後任何人都能結算。", "zh-Hans": "结算后才领取、池子至少放入募资的一半、LP 锁仓 24 个月、结束满 7 天后任何人都能结算。", ko: "정산 후 클레임, 풀에는 모금액의 절반 이상, LP 24개월 잠금, 종료 7일 후 누구나 정산 가능." },
  t4: { en: "Honest about limits", "zh-Hant": "誠實說明限制", "zh-Hans": "诚实说明限制", ko: "한계를 솔직하게" },
  t4b: { en: "The contracts have not been independently audited. We say so everywhere it matters.", "zh-Hant": "合約未經獨立審計，我們在每個重要的地方都會說明。", "zh-Hans": "合约未经独立审计，我们在每个重要的地方都会说明。", ko: "계약은 독립 감사를 받지 않았습니다. 중요한 곳마다 그렇게 밝힙니다." },
  seeTransparency: { en: "Open the transparency page", "zh-Hant": "查看公開透明頁", "zh-Hans": "查看公开透明页", ko: "투명성 페이지 보기" },
  roadEyebrow: { en: "Roadmap", "zh-Hant": "路線圖", "zh-Hans": "路线图", ko: "로드맵" },
  roadTitle: { en: "Where we are, and what comes next.", "zh-Hant": "我們在哪裡，接下來做什麼。", "zh-Hans": "我们在哪里，接下来做什么。", ko: "지금 어디에 있고, 다음은 무엇인지." },
  done: { en: "Done", "zh-Hant": "已完成", "zh-Hans": "已完成", ko: "완료" },
  next: { en: "Next", "zh-Hant": "接下來", "zh-Hans": "接下来", ko: "다음" },
  later: { en: "Later", "zh-Hant": "之後", "zh-Hans": "之后", ko: "이후" },
  d1: { en: "RVYN token live on Robinhood Chain", "zh-Hant": "RVYN 代幣已在 Robinhood Chain 上線", "zh-Hans": "RVYN 代币已在 Robinhood Chain 上线", ko: "RVYN 토큰 Robinhood Chain 출시" },
  d2: { en: "Launchpad and Onchain Records", "zh-Hant": "發射台與鏈上紀錄", "zh-Hans": "发射台与链上记录", ko: "런치패드와 온체인 기록" },
  d3: { en: "Presale contract V6, source-verified", "zh-Hant": "預售合約 V6，原始碼已驗證", "zh-Hans": "预售合约 V6，源码已验证", ko: "프리세일 계약 V6, 소스 검증" },
  d4: { en: "Safe multisig and live transparency page", "zh-Hant": "Safe 多簽與即時透明頁", "zh-Hans": "Safe 多签与实时透明页", ko: "Safe 멀티시그와 실시간 투명성 페이지" },
  n1: { en: "Whitelist registration", "zh-Hant": "白名單登記", "zh-Hans": "白名单登记", ko: "화이트리스트 신청" },
  n2: { en: "Presale (date to be announced)", "zh-Hant": "預售（日期待公布）", "zh-Hans": "预售（日期待公布）", ko: "프리세일 (일정 미정)" },
  n3: { en: "First look at the game", "zh-Hant": "遊戲首次公開", "zh-Hans": "游戏首次公开", ko: "게임 첫 공개" },
  l1: { en: "The first game goes live", "zh-Hant": "第一款遊戲上線", "zh-Hans": "第一款游戏上线", ko: "첫 게임 출시" },
  l2: { en: "RVYN used inside the game", "zh-Hant": "RVYN 在遊戲中使用", "zh-Hans": "RVYN 在游戏中使用", ko: "게임 안에서 RVYN 사용" },
  l3: { en: "The world grows, stage by stage", "zh-Hant": "世界逐步擴展", "zh-Hans": "世界逐步扩展", ko: "세계를 단계적으로 확장" },
  roadNote: { en: "Items under Next and Later are plans, not commitments or dates.", "zh-Hant": "「接下來」與「之後」是規劃，不是承諾或日期。", "zh-Hans": "“接下来”与“之后”是规划，不是承诺或日期。", ko: "'다음'과 '이후'는 계획이며 약속이나 일정이 아닙니다." },
  storyEyebrow: { en: "Why ROVYN CORE", "zh-Hant": "為什麼是 ROVYN CORE", "zh-Hans": "为什么是 ROVYN CORE", ko: "왜 ROVYN CORE인가" },
  story: { en: "Every world starts as a small signal. Ours is RVYN: a fixed supply, a public origin, and a game being built around it, one verifiable step at a time.", "zh-Hant": "每個世界都從一道微弱的訊號開始。我們的訊號是 RVYN：固定的供應量、公開的起點，以及圍繞它一步步、可被驗證地打造的遊戲。", "zh-Hans": "每个世界都从一道微弱的信号开始。我们的信号是 RVYN：固定的供应量、公开的起点，以及围绕它一步步、可被验证地打造的游戏。", ko: "모든 세계는 작은 신호에서 시작합니다. 우리의 신호는 RVYN입니다. 고정된 공급, 공개된 출발점, 그리고 그 위에 한 걸음씩 검증 가능하게 만들어지는 게임." },
  ctaTitle: { en: "Follow the build.", "zh-Hant": "追蹤建置過程。", "zh-Hans": "追踪建置过程。", ko: "만드는 과정을 지켜보세요." },
  ctaBody: { en: "Updates land on X first. Whitelist registration happens only on this site, with a wallet signature.", "zh-Hant": "最新消息會先發在 X。白名單登記只在本站進行，使用錢包簽名。", "zh-Hans": "最新消息会先发在 X。白名单登记只在本站进行，使用钱包签名。", ko: "소식은 X에 먼저 올라옵니다. 화이트리스트 신청은 이 사이트에서 지갑 서명으로만 진행됩니다." },
  follow: { en: "Follow on X", "zh-Hant": "在 X 追蹤", "zh-Hans": "在 X 关注", ko: "X 팔로우" },
  risk: { en: "Unaudited · No sale date set · Not financial advice", "zh-Hant": "未經獨立審計 · 尚未訂定預售日期 · 非投資建議", "zh-Hans": "未经独立审计 · 尚未确定预售日期 · 非投资建议", ko: "독립 감사 미실시 · 판매 일정 없음 · 투자 조언 아님" },
} satisfies Record<string, Copy4>;

export default function Home() {
  const { locale } = useLanguage();
  const t = (c: Copy4) => c[locale];
  const { status, failed } = useSaleStatus();
  const reg = status?.registrationStatus;
  const opensAt = status?.registrationOpensAt ?? null;
  const closesAt = status?.registrationClosesAt ?? null;
  const registryOpen = Boolean(status?.registryOpen);

  const primary = registryOpen
    ? { href: "/rvyn#whitelist", label: t(T.join) }
    : reg === "scheduled" && opensAt
      ? { href: "/rvyn#whitelist", label: `${t(T.opensOn)} · ${formatUtc8(opensAt, locale, false)}` }
      : { href: "/rvyn", label: t(T.viewRvyn) };

  const whitelistState = failed && !status ? t(T.unavailable) : !status ? t(T.checking)
    : registryOpen ? t(T.open) : reg === "scheduled" ? t(T.scheduled) : reg === "closed" ? t(T.closed) : t(T.preparing);
  const presaleState = !status ? (failed ? t(T.unavailable) : t(T.checking)) : status.purchasesOpen ? t(T.open) : status.phase === "sale_closed" ? t(T.closed) : t(T.notOpen);

  return (
    <main>
      <section className="rv-hero">
        <div className="rv-hero__grid" aria-hidden="true" />
        <div className="rv-hero__glow" aria-hidden="true" />
        <div className="rv-container">
          <div className="rv-hero__inner">
            <div className="rv-hero__copy">
              <span className="rv-eyebrow">{t(T.heroEyebrow)}</span>
              <h1 className="rv-display">{t(T.heroA)}<br /><span className="rv-accent">{t(T.heroB)}</span></h1>
              <p className="rv-lead">{t(T.heroLead)}</p>
              <div className="rv-row">
                <Link className="rv-btn rv-btn--primary rv-btn--lg" href={primary.href}>{primary.label}<ArrowRight aria-hidden="true" /></Link>
                <Link className="rv-btn rv-btn--secondary rv-btn--lg" href="/game">{t(T.aboutGame)}</Link>
              </div>
            </div>
            <div className="rv-hero__art"><Image src="/rv-core.webp" alt="" width={900} height={900} priority unoptimized /></div>
          </div>
          <div className="rv-strip rv-reveal" style={{ marginTop: "-8px", marginBottom: "clamp(40px, 6vw, 72px)" }}>
            <div>
              <span className="rv-stat__label">{t(T.whitelist)}</span>
              <span className={`rv-pill${registryOpen ? " rv-pill--live" : reg === "scheduled" ? " rv-pill--warn" : ""}`}>{whitelistState}</span>
              {reg === "scheduled" && opensAt ? <Countdown to={opensAt} locale={locale} /> : null}
              {opensAt && closesAt ? <span className="rv-caption">{formatUtc8(opensAt, locale)} – {formatUtc8(closesAt, locale)} (UTC+8)</span> : null}
            </div>
            <div>
              <span className="rv-stat__label">{t(T.presale)}</span>
              <span className={`rv-pill${status?.purchasesOpen ? " rv-pill--live" : ""}`}>{presaleState}</span>
              <span className="rv-caption">{status?.purchasesOpen ? "" : t(T.noDate)}</span>
            </div>
            <div>
              <span className="rv-stat__label">{t(T.game)}</span>
              <span className="rv-pill rv-pill--ok">{t(T.inDev)}</span>
              <span className="rv-caption">{t(T.firstLook)}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="rv-section rv-section--line">
        <div className="rv-container">
          <Head eyebrow={t(T.whatEyebrow)} title={t(T.whatTitle)} />
          <div className="rv-grid rv-grid--3">
            {([
              [Gamepad2, T.gameTitle, T.gameBody, "/game"],
              [Coins, T.rvynTitle, T.rvynBody, "/rvyn"],
              [Layers, T.toolsTitle, T.toolsBody, "/launchpad"],
            ] as const).map(([Icon, title, body, href]) => (
              <Link key={href} href={href} className="rv-card rv-card--link rv-reveal">
                <span className="rv-card__icon"><Icon aria-hidden="true" /></span>
                <h3 className="rv-h3">{t(title)}</h3>
                <p className="rv-small" style={{ margin: "8px 0 18px" }}>{t(body)}</p>
                <span className="rv-small rv-accent" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>{t(T.more)} <ArrowRight size={15} aria-hidden="true" /></span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="rv-section rv-section--line">
        <div className="rv-container rv-split rv-split--wide-right">
          <div className="rv-stack rv-sticky" style={{ ["--gap" as string]: "22px" }}>
            <Head eyebrow={t(T.rvynEyebrow)} title={t(T.rvynHeadTitle)} />
            <dl className="rv-kv">
              <div><dt>{t(T.supply)}</dt><dd className="rv-num">10,000,000 RVYN</dd></div>
              <div><dt>{t(T.price)}</dt><dd className="rv-num">{RVYN_MODEL.priceEth} ETH</dd></div>
              <div><dt>{t(T.cap)}</dt><dd className="rv-num">{RVYN_MODEL.walletCapEth} ETH · {RVYN_MODEL.walletCapTokens.toLocaleString(locale)} RVYN</dd></div>
              <div><dt>{t(T.delivery)}</dt><dd>{t(T.deliveryValue)}</dd></div>
            </dl>
            <div className="rv-stack" style={{ ["--gap" as string]: "8px" }}>
              <span className="rv-stat__label">{t(T.contract)}</span>
              <Address value={RVYN_MODEL.contractMainnet} locale={locale} />
            </div>
            <div><Link className="rv-btn rv-btn--secondary" href="/rvyn">{t(T.fullDetails)}<ArrowRight aria-hidden="true" /></Link></div>
          </div>
          <div className="rv-card rv-card--accent rv-reveal">
            <div className="rv-row rv-row--between" style={{ marginBottom: 22 }}>
              <h3 className="rv-h3">{t(T.allocTitle)}</h3>
              <span className="rv-num rv-accent">10,000,000</span>
            </div>
            <AllocationBar locale={locale} />
            <p className="rv-caption" style={{ marginTop: 18 }}>{t(T.allocNote)}</p>
          </div>
        </div>
      </section>

      <section className="rv-section rv-section--line">
        <div className="rv-container">
          <Head eyebrow={t(T.trustEyebrow)} title={t(T.trustTitle)} action={<Link className="rv-btn rv-btn--secondary" href="/transparency">{t(T.seeTransparency)}<ArrowUpRight aria-hidden="true" /></Link>} />
          <div className="rv-grid rv-grid--4">
            {([[BadgeCheck, T.t1, T.t1b], [Users, T.t2, T.t2b], [Lock, T.t3, T.t3b], [ShieldCheck, T.t4, T.t4b]] as const).map(([Icon, title, body], i) => (
              <div key={i} className="rv-card rv-reveal">
                <span className="rv-card__icon"><Icon aria-hidden="true" /></span>
                <h3 className="rv-h3" style={{ fontSize: 17 }}>{t(title)}</h3>
                <p className="rv-small" style={{ marginTop: 8 }}>{t(body)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rv-section rv-section--line">
        <div className="rv-container">
          <Head eyebrow={t(T.roadEyebrow)} title={t(T.roadTitle)} />
          <div className="rv-grid rv-grid--3">
            {([
              [T.done, [T.d1, T.d2, T.d3, T.d4], "rv-pill--ok"],
              [T.next, [T.n1, T.n2, T.n3], "rv-pill--live"],
              [T.later, [T.l1, T.l2, T.l3], ""],
            ] as const).map(([label, items, tone]) => (
              <div key={label.en} className="rv-card rv-reveal">
                <span className={`rv-pill ${tone}`}>{t(label)}</span>
                <ol className="rv-numbered" style={{ marginTop: 18 }}>
                  {items.map((item) => (
                    <li key={item.en}><b>{t(item)}</b>{item === T.n1 && opensAt && closesAt ? <span>{formatUtc8(opensAt, locale, false)} – {formatUtc8(closesAt, locale, false)} (UTC+8)</span> : null}</li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
          <p className="rv-caption" style={{ marginTop: 18 }}>{t(T.roadNote)}</p>
        </div>
      </section>

      <section className="rv-section rv-section--line">
        <div className="rv-container--narrow" style={{ textAlign: "center", display: "grid", gap: 20, justifyItems: "center" }}>
          <span className="rv-eyebrow">{t(T.storyEyebrow)}</span>
          <p className="rv-h2" style={{ fontWeight: 560 }}>{t(T.story)}</p>
        </div>
      </section>

      <section className="rv-section--tight" style={{ paddingTop: 0 }}>
        <div className="rv-container">
          <div className="rv-cta rv-reveal">
            <h2 className="rv-h1">{t(T.ctaTitle)}</h2>
            <p className="rv-lead">{t(T.ctaBody)}</p>
            <div className="rv-row" style={{ justifyContent: "center" }}>
              <a className="rv-btn rv-btn--primary rv-btn--lg" href="https://x.com/RovynCORE" target="_blank" rel="noreferrer">{t(T.follow)}<ArrowUpRight aria-hidden="true" /></a>
              <Link className="rv-btn rv-btn--secondary rv-btn--lg" href={primary.href}>{primary.label}</Link>
            </div>
            <p className="rv-caption">{t(T.risk)}</p>
          </div>
        </div>
      </section>
    </main>
  );
}
