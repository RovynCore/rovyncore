"use client";

import {
  ArrowUpRight, Compass, Rocket, WalletCards, ShieldCheck, Check, CircleHelp,
  Orbit, Network, Sparkles, type LucideIcon,
} from "lucide-react";
import Link from "@/components/site-link";
import Image from "next/image";
import { useLanguage } from "@/components/language-provider";
import { useScrollReveal } from "@/components/scroll-reveal";
import { useEffect, useState } from "react";
import type { Locale } from "@/lib/translations";
import { api, message } from "@/components/platform-provider";
import { usePlatform } from "@/components/platform-context";
import { createPublicClient, formatEther, formatUnits, http, parseEther } from "viem";
import { CHAINS } from "@/packages/web3/config";
import { RVYN_MODEL } from "@/lib/rvyn-model";

type Local = Record<Locale, string>;

const choose = (value: Local, locale: Locale) => value[locale];

const howToSteps: Array<{
  number: string;
  Icon: LucideIcon;
  title: Local;
  body: Local;
}> = [
  {
    number: "01",
    Icon: Compass,
    title: {
      en: "Discover",
      "zh-Hant": "探索",
      "zh-Hans": "探索",
      ko: "탐색",
    },
    body: {
      en: "Browse launches, compare confirmed onchain facts, and expand a project for its full story.",
      "zh-Hant": "在探索頁瀏覽發行、查看已確認的鏈上資料，展開卡片閱讀項目內容。",
      "zh-Hans": "在探索页浏览发行、查看已确认的链上资料，展开卡片阅读项目内容。",
      ko: "탐색 페이지에서 발행을 둘러보고 확인된 온체인 정보를 살펴본 뒤 카드를 펼쳐 자세히 읽습니다.",
    },
  },
  {
    number: "02",
    Icon: Rocket,
    title: {
      en: "Create",
      "zh-Hant": "建立",
      "zh-Hans": "创建",
      ko: "만들기",
    },
    body: {
      en: "Create a token, review its details and approve the launch in your own wallet.",
      "zh-Hant": "填寫並預覽 Token 資料，再由自己的錢包確認發行。",
      "zh-Hans": "填写并预览 Token 资料，再由自己的钱包确认发行。",
      ko: "토큰 정보를 입력하고 미리 본 뒤 본인 지갑에서 발행을 승인합니다.",
    },
  },
  {
    number: "03",
    Icon: WalletCards,
    title: {
      en: "Your tokens",
      "zh-Hant": "我的 Token",
      "zh-Hans": "我的 Token",
      ko: "내 토큰",
    },
    body: {
      en: "Connect your wallet to find every token you launched through ROVYN CORE, even after it leaves the newest list.",
      "zh-Hant": "連接錢包，集中查看你透過 ROVYN CORE 發行的 Token，不怕被最新列表蓋過。",
      "zh-Hans": "连接钱包，集中查看你通过 ROVYN CORE 发行的 Token，不怕被最新列表淹没。",
      ko: "지갑을 연결해 ROVYN CORE에서 발행한 토큰을 최신 목록 아래로 내려가도 한곳에서 확인합니다.",
    },
  },
];

const roadmapLocal = (en: string, zhHant: string, zhHans: string, ko: string): Local => ({ en, "zh-Hant": zhHant, "zh-Hans": zhHans, ko });
type RoadmapMilestone = { status: Local; title: Local; body: Local; tone: "live" | "active" | "future" };
type RoadmapPhase = { id: string; label: Local; window: Local; summary: Local; title: Local; items: RoadmapMilestone[] };
const roadmapPhases: RoadmapPhase[] = [
  {
    id: "foundation",
    label: roadmapLocal("Completed", "已完成", "已完成", "완료"),
    window: roadmapLocal("AUG—SEP 2026", "2026.08—09", "2026.08—09", "2026.08—09"),
    summary: roadmapLocal("Website, launchpad and public records are live.", "官網、發射台與公開紀錄已上線。", "官网、发射台与公开记录已上线。", "웹사이트, 런치패드와 공개 기록이 운영 중입니다."),
    title: roadmapLocal("A foundation you can already use.", "已經可以使用的基礎。", "已经可以使用的基础。", "이미 사용할 수 있는 기반."),
    items: [
      {
        status: roadmapLocal("LIVE", "已上線", "已上线", "운영 중"),
        title: roadmapLocal("Website and launchpad", "官網與發射台上線", "官网与发射台上线", "웹사이트와 런치패드"),
        body: roadmapLocal("The team formed in August. The website, official X and launchpad opened in September; creators can issue a fixed-supply token with their own wallets.", "8 月組成團隊，9 月官網、官方 X 與發射台對外開放。創作者可用自己的錢包發行固定供應量 Token。", "8 月组成团队，9 月官网、官方 X 与发射台对外开放。创作者可用自己的钱包发行固定供应量 Token。", "8월에 팀을 구성하고 9월에 웹사이트, 공식 X와 런치패드를 공개했습니다. 크리에이터는 자신의 지갑으로 고정 공급 토큰을 발행할 수 있습니다."),
        tone: "live",
      },
      {
        status: roadmapLocal("LIVE", "已上線", "已上线", "운영 중"),
        title: roadmapLocal("Public onchain records", "公開鏈上紀錄", "公开链上记录", "공개 온체인 기록"),
        body: roadmapLocal("Look up launches by name, symbol or contract. Check their origin, initial state and later observations, or filter launches made by your wallet.", "依名稱、代號或合約查詢發行紀錄，核對來源、初始狀態與後續觀測，也能篩選自己錢包的發行。", "按名称、代号或合约查询发行记录，核对来源、初始状态与后续观测，也能筛选自己钱包的发行。", "이름, 심볼 또는 계약으로 발행을 검색하고 출처, 초기 상태와 이후 관측을 확인합니다. 자신의 지갑으로 발행한 기록도 필터링할 수 있습니다."),
        tone: "live",
      },
      {
        status: roadmapLocal("SEP 2026 · ISSUED", "2026.09 · 已發行", "2026.09 · 已发行", "2026.09 · 발행 완료"),
        title: roadmapLocal("RVYN's first onchain chapter", "RVYN 首枚官方 Token", "RVYN 首枚官方 Token", "RVYN 첫 공식 토큰"),
        body: roadmapLocal("RVYN was issued through the platform in September with a fixed initial supply of 10,000,000. Its contract and origin can be checked in its public record.", "RVYN 於 9 月透過平台發行，初始總供應量固定為 1,000 萬枚。合約地址與發行來源皆可在公開紀錄中核對。", "RVYN 于 9 月通过平台发行，初始总供应量固定为 1,000 万枚。合约地址与发行来源均可在公开记录中核对。", "RVYN은 9월에 플랫폼을 통해 초기 고정 공급량 1,000만 개로 발행되었습니다. 계약과 발행 출처는 공개 기록에서 확인할 수 있습니다."),
        tone: "live",
      },
    ],
  },
  {
    id: "next",
    label: roadmapLocal("Near-term goals", "近期目標", "近期目标", "가까운 목표"),
    window: roadmapLocal("FIRST GAME · IN DEVELOPMENT", "第一款遊戲 · 開發中", "第一款游戏 · 开发中", "첫 게임 · 개발 중"),
    summary: roadmapLocal("Build our first game and prepare the whitelist and presale.", "打造第一款遊戲，並完成白名單與預售準備。", "打造第一款游戏，并完成白名单与预售准备。", "첫 게임을 만들고 화이트리스트와 프리세일을 준비합니다."),
    title: roadmapLocal("The next steps we are preparing.", "正在準備的下一步。", "正在准备的下一步。", "준비 중인 다음 단계."),
    items: [
      {
        status: roadmapLocal("IN DEVELOPMENT", "開發中", "开发中", "개발 중"),
        title: roadmapLocal("Our first game, with RVYN at its core", "第一款遊戲，以 RVYN 為核心", "第一款游戏，以 RVYN 为核心", "RVYN을 중심에 둔 첫 게임"),
        body: roadmapLocal("RVYN is planned as the game's core currency. Gameplay, items and RVYN's in-game uses will be published once they are confirmed; no game economy is live yet.", "RVYN 規劃為遊戲的核心貨幣。玩法、道具與 RVYN 的遊戲內用途，確認後才會公開；目前尚無任何遊戲經濟上線。", "RVYN 规划为游戏的核心货币。玩法、道具与 RVYN 的游戏内用途，确认后才会公开；目前尚无任何游戏经济上线。", "RVYN은 게임의 핵심 화폐로 계획되어 있습니다. 게임 방식, 아이템과 RVYN의 게임 내 용도는 확정 후 공개하며, 아직 게임 경제는 운영되지 않습니다."),
        tone: "active",
      },
      {
        status: roadmapLocal("PREPARING", "準備中", "准备中", "준비 중"),
        title: roadmapLocal("Whitelist and presale readiness", "白名單與預售準備", "白名单与预售准备", "화이트리스트와 프리세일 준비"),
        body: roadmapLocal("Check contract terms, whitelist eligibility and the purchase flow. Announce access after verification; a whitelist entry alone is not a token allocation.", "核對合約條件、白名單資格與購買流程，完成驗證後再公告開放。列入白名單不代表已獲配代幣。", "核对合约条件、白名单资格与购买流程，完成验证后再公告开放。列入白名单不代表已获配代币。", "계약 조건, 화이트리스트 자격과 구매 흐름을 점검한 뒤 공개를 공지합니다. 화이트리스트 등록만으로 토큰이 배정되지는 않습니다."),
        tone: "active",
      },
      {
        status: roadmapLocal("DATE TO BE ANNOUNCED", "日期待公告", "日期待公告", "일정 추후 공지"),
        title: roadmapLocal("RVYN's first presale", "RVYN 首輪預售", "RVYN 首轮预售", "RVYN 첫 프리세일"),
        body: roadmapLocal("No presale date has been set. We will announce it only when the product is ready; this roadmap does not open a sale.", "首輪預售尚未訂定日期，會在產品準備就緒後才正式公告；路線圖不代表預售已開放。", "首轮预售尚未确定日期，会在产品准备就绪后才正式公告；路线图不代表预售已开放。", "첫 프리세일 일정은 아직 정해지지 않았습니다. 제품이 준비된 뒤에만 공지하며, 이 로드맵이 판매 개시를 뜻하지 않습니다."),
        tone: "future",
      },
    ],
  },
  {
    id: "future",
    label: roadmapLocal("Long-term direction", "長期方向", "长期方向", "장기 방향"),
    window: roadmapLocal("EXPLORE · CONFIRM IN STAGES", "持續探索 · 分階段確認", "持续探索 · 分阶段确认", "지속 탐색 · 단계별 확정"),
    summary: roadmapLocal("Grow the game world, with the launchpad and records as companion tools.", "以遊戲為主軸持續擴展，發射台與鏈上紀錄作為輔助工具。", "以游戏为主轴持续扩展，发射台与链上记录作为辅助工具。", "게임 세계를 중심으로 확장하고, 런치패드와 기록은 보조 도구로 운영합니다."),
    title: roadmapLocal("Directions to explore, with details to follow.", "先確認方向，再逐步落實。", "先确认方向，再逐步落实。", "방향을 확인하고 단계별로 실현합니다."),
    items: [
      {
        status: roadmapLocal("EXPLORING", "研究方向", "研究方向", "탐색 중"),
        title: roadmapLocal("RVYN in the game economy", "RVYN 與遊戲經濟", "RVYN 与游戏经济", "게임 경제 속 RVYN"),
        body: roadmapLocal("Define how RVYN is used, earned and burned inside the game. Each use will be announced only after it is implemented and verified.", "規劃 RVYN 在遊戲內的使用、取得與銷毀方式；每一項用途都要實作並驗證後才會公告。", "规划 RVYN 在游戏内的使用、获取与销毁方式；每一项用途都要实现并验证后才会公告。", "게임 안에서 RVYN을 사용하고 얻고 소각하는 방식을 설계합니다. 각 용도는 구현과 검증을 마친 뒤에만 공지합니다."),
        tone: "future",
      },
      {
        status: roadmapLocal("ONGOING", "持續推進", "持续推进", "지속 진행"),
        title: roadmapLocal("Launchpad and records as companion tools", "發射台與紀錄持續完善", "发射台与记录持续完善", "보조 도구로서의 런치패드와 기록"),
        body: roadmapLocal("Keep improving launch previews, record readability and mobile interactions, so every creator can understand each step before confirming it.", "持續改善發行預覽、紀錄閱讀與手機操作，讓每位創作者在確認前都看清每一步。", "持续改善发行预览、记录阅读与手机操作，让每位创作者在确认前都看清每一步。", "발행 미리보기, 기록 가독성과 모바일 조작을 계속 개선해 확인 전에 각 단계를 이해하도록 합니다."),
        tone: "future",
      },
      {
        status: roadmapLocal("ONGOING", "持續推進", "持续推进", "지속 진행"),
        title: roadmapLocal("Public progress updates", "持續公開進度", "持续公开进度", "공개 진행 상황"),
        body: roadmapLocal("Keep completed work and work in preparation distinct in website and official X updates. Publish changes to the schedule as they are confirmed.", "透過官網與官方 X 更新進度，區分已完成項目與準備中的工作；時程變更確認後同步公告。", "通过官网与官方 X 更新进度，区分已完成项目与准备中的工作；时间变更确认后同步公告。", "웹사이트와 공식 X에서 완료된 작업과 준비 중인 작업을 구분해 공유합니다. 일정 변경은 확정 후 공지합니다."),
        tone: "future",
      },
    ],
  },
];


export function HomeStory() {
  const { locale } = useLanguage();
  const [revealRef, revealClassName, revealStyle] = useScrollReveal<HTMLElement>({ delay: 35 });
  const chapters = [
    {
      Icon: Sparkles,
      title: {
        en: "An idea needs a first step",
        "zh-Hant": "一個想法，需要一個起點",
        "zh-Hans": "一个想法，需要一个起点",
        ko: "아이디어에는 출발점이 필요합니다",
      },
      body: {
        en: "A creator should be able to move from a name and a story to a public onchain record while keeping control of their wallet.",
        "zh-Hant": "創作者應該能從名稱與故事開始，留下公開的鏈上紀錄，同時保有自己的錢包控制權。",
        "zh-Hans": "创作者应该能从名称与故事开始，留下公开的链上记录，同时保有自己的钱包控制权。",
        ko: "크리에이터는 지갑 통제권을 유지하면서 이름과 이야기에서 공개 온체인 기록까지 나아갈 수 있어야 합니다.",
      },
    },
    {
      Icon: ShieldCheck,
      title: {
        en: "A launch should be readable",
        "zh-Hant": "每次發行，都該看得明白",
        "zh-Hans": "每次发行，都该看得明白",
        ko: "발행 과정은 이해하기 쉬워야 합니다",
      },
      body: {
        en: "Supply, network, fees and confirmation should be clear before the wallet asks you to approve.",
        "zh-Hant": "供應量、網路、費用與交易確認，都應該在錢包要求簽署前清楚呈現。",
        "zh-Hans": "供应量、网络、费用与交易确认，都应该在钱包要求签署前清楚呈现。",
        ko: "공급량, 네트워크, 수수료, 거래 확인은 지갑에서 승인하기 전에 명확히 보여야 합니다.",
      },
    },
    {
      Icon: Network,
      title: {
        en: "The story continues after launch",
        "zh-Hant": "發行之後，故事還會繼續",
        "zh-Hans": "发行之后，故事还会继续",
        ko: "발행 이후에도 이야기는 계속됩니다",
      },
      body: {
        en: "We help creators publish and organize launch information. Market access and liquidity remain choices made through external services.",
        "zh-Hant": "我們協助創作者發行並整理公開資訊；市場與流動性則由創作者透過外部服務自行選擇。",
        "zh-Hans": "我们协助创作者发行并整理公开信息；市场与流动性则由创作者通过外部服务自行选择。",
        ko: "발행과 공개 정보 정리를 돕습니다. 시장 접근과 유동성은 외부 서비스를 통해 크리에이터가 선택합니다.",
      },
    },
  ];
  const copy = {
    eyebrow: {
      en: "WHY WE STARTED",
      "zh-Hant": "我們為什麼開始",
      "zh-Hans": "我们为何开始",
      ko: "우리가 시작한 이유",
    },
    title: {
      en: "Give every good idea a clear first step onchain.",
      "zh-Hant": "讓每個好點子，都有清楚的鏈上第一步。",
      "zh-Hans": "让每个好点子，都有清晰的链上第一步。",
      ko: "좋은 아이디어마다 명확한 온체인 첫걸음을.",
    },
    intro: {
      en: "ROVYN CORE began with a simple question: what do creators and communities need after a token is launched? We chose to make the starting point clear—so creating, viewing and tracking are easier to understand, while each person chooses what comes next.",
      "zh-Hant": "ROVYN CORE 從一個簡單問題開始：發行 Token 之後，創作者與社群需要什麼？我們選擇先把起點做好，讓建立、查看與追蹤都更清楚，並讓每個人自己決定下一步。",
      "zh-Hans": "ROVYN CORE 从一个简单问题开始：发行 Token 之后，创作者与社群需要什么？我们选择先把起点做好，让创建、查看与追踪都更清晰，并让每个人自己决定下一步。",
      ko: "ROVYN CORE는 간단한 질문에서 시작했습니다. 토큰 발행 후 크리에이터와 커뮤니티에는 무엇이 필요할까요? 우리는 시작점을 명확하게 만드는 데 집중합니다. 만들고 살펴보고 추적하는 과정은 분명하게, 다음 단계는 각자가 결정합니다.",
    },
  };
  return (
    <section
      ref={revealRef}
      style={revealStyle}
      className={`home-story ${revealClassName}`}
      aria-labelledby="home-story-title"
    >
      <div className="home-story__intro">
        <div className="eyebrow">{choose(copy.eyebrow, locale)}</div>
        <h2 id="home-story-title">{choose(copy.title, locale)}</h2>
        <p>{choose(copy.intro, locale)}</p>
      </div>
      <div className="home-story__chapters">
        {chapters.map(({ Icon, title, body }, index) => (
          <article className="home-story__chapter" key={index}>
            <span className="home-story__icon">
              <Icon size={19} aria-hidden="true" />
            </span>
            <span className="home-story__index">0{index + 1}</span>
            <h3>{choose(title, locale)}</h3>
            <p>{choose(body, locale)}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

export function HomeHowTo() {
  const { locale, tr } = useLanguage();
  const [revealRef, revealClassName, revealStyle] = useScrollReveal<HTMLElement>({ delay: 30 });
  return (
    <section
      ref={revealRef}
      style={revealStyle}
      className={`home-howto ${revealClassName}`}
      aria-labelledby="howto-title"
    >
      <div className="home-section-heading">
        <div>
          <div className="eyebrow">{choose({ en: "HOW IT WORKS", "zh-Hant": "使用流程", "zh-Hans": "使用流程", ko: "이용 방법" }, locale)}</div>
          <h2 id="howto-title">{tr("平台怎麼用")}</h2>
        </div>
        <p>
          {choose(
            {
              en: "Three short steps. Details stay on each page.",
              "zh-Hant": "三個短步驟。細節留在各功能頁。",
              "zh-Hans": "三个短步骤。细节留在各功能页。",
              ko: "짧은 세 단계. 세부 내용은 각 페이지에 있습니다.",
            },
            locale,
          )}
        </p>
      </div>
      <div className="home-howto__grid">
        {howToSteps.map((step) => (
          <article className="home-howto__card" key={step.number}>
            <span className="home-howto__icon"><step.Icon size={20} aria-hidden="true" /></span>
            <small>{step.number}</small>
            <strong>{choose(step.title, locale)}</strong>
            <p>{choose(step.body, locale)}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

type FeaturedAsset = {
  asset: { chainId: number; network: string; contractAddress: string; recordStatus: string; createdAt: number; url: string };
  identity: { name: string; symbol: string; logo: string; description: string };
  originalState: { values: Record<string, unknown> } | null;
  currentState: { values: Record<string, unknown> | null; syncStatus: string; lastSyncedAt: number | null };
};

const presaleReadAbi = [
  { type: "function", name: "state", inputs: [], outputs: [{ type: "uint8" }], stateMutability: "view" },
  { type: "function", name: "closedAt", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "endsAt", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "raised", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "HARD_CAP", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
] as const;
const legacySaleReadAbi = [
  { type: "function", name: "active", inputs: [], outputs: [{ type: "bool" }], stateMutability: "view" },
] as const;

export function HomeFeatured() {
  const { locale } = useLanguage();
  const { config } = usePlatform();
  const [token, setToken] = useState<FeaturedAsset | null>(null);
  const [presaleStatus, setPresaleStatus] = useState<"open" | "closed" | "unknown" | "not-configured">("unknown");
  const [presaleMetrics, setPresaleMetrics] = useState<{ raised: bigint; hardCap: bigint } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revealRef, revealClassName, revealStyle] = useScrollReveal<HTMLElement>({ delay: 25 });

  useEffect(() => {
    let active = true;
    const request = config.genesis
      ? api<FeaturedAsset>(`v1/assets/${config.genesis.toLowerCase()}`)
      : api<{ assets: FeaturedAsset[] }>("v1/assets?limit=100").then((result) => { const official = result.assets.find((item) => item.identity.name.toLowerCase() === "rovyncore" && item.identity.symbol.toUpperCase() === "RVYN"); return official ? api<FeaturedAsset>(`v1/assets/${official.asset.contractAddress}`) : null; });
    request
      .then((result) => { if (active) setToken(result); })
      .catch((reason) => { if (active) setError(message(reason)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [config.genesis]);

  useEffect(() => {
    let active = true;
    const checkPresale = async () => {
      if (!config.sale) {
        if (active) {
          setPresaleStatus("not-configured");
          setPresaleMetrics(null);
        }
        return;
      }
      try {
        const client = createPublicClient({ chain: CHAINS[config.chainId], transport: http() });
        let isOpen = false;
        let metrics: { raised: bigint; hardCap: bigint } | null = null;
        if (config.presaleVersion === 2 || config.presaleVersion === 3 || config.presaleVersion === 4 || config.presaleVersion === 5) {
          const [state, closedAt, endsAt, raised, hardCap] = await Promise.all([
            client.readContract({ address: config.sale, abi: presaleReadAbi, functionName: "state" }),
            client.readContract({ address: config.sale, abi: presaleReadAbi, functionName: "closedAt" }),
            client.readContract({ address: config.sale, abi: presaleReadAbi, functionName: "endsAt" }),
            client.readContract({ address: config.sale, abi: presaleReadAbi, functionName: "raised" }),
            client.readContract({ address: config.sale, abi: presaleReadAbi, functionName: "HARD_CAP" }),
          ]);
          metrics = { raised, hardCap };
          isOpen = Number(state) === 1 && closedAt === 0n && BigInt(Math.floor(Date.now() / 1000)) < endsAt && raised < hardCap;
        } else {
          isOpen = await client.readContract({ address: config.sale, abi: legacySaleReadAbi, functionName: "active" });
        }
        if (active) {
          setPresaleStatus(isOpen ? "open" : "closed");
          setPresaleMetrics(metrics);
        }
      } catch {
        if (active) {
          setPresaleStatus("unknown");
          setPresaleMetrics(null);
        }
      }
    };
    void checkPresale();
    const timer = window.setInterval(() => void checkPresale(), 30_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [config.sale, config.chainId, config.presaleVersion]);

  const copy = {
    title: { en: "Official Token", "zh-Hant": "官方代幣", "zh-Hans": "官方代币", ko: "공식 토큰" },
    intro: { en: "Issued through the launchpad deployed by ROVYN CORE.", "zh-Hant": "由 ROVYN CORE 部署的發射台發行。", "zh-Hans": "由 ROVYN CORE 部署的发射台发行。", ko: "ROVYN CORE가 배포한 런치패드를 통해 발행되었습니다." },
    empty: { en: "The official RVYN onchain record is not available right now.", "zh-Hant": "目前無法讀取 RVYN 官方鏈上紀錄。", "zh-Hans": "目前无法读取 RVYN 官方链上记录。", ko: "현재 RVYN 공식 온체인 기록을 불러올 수 없습니다." },
    verified: { en: "PRESALE OPEN", "zh-Hant": "預售進行中", "zh-Hans": "预售进行中", ko: "프리세일 진행 중" },
    saleClosed: { en: "PRESALE CLOSED", "zh-Hant": "目前未開放預售", "zh-Hans": "目前未开放预售", ko: "프리세일 미진행" },
    saleUnknown: { en: "PRESALE STATUS UNAVAILABLE", "zh-Hant": "預售狀態暫不可讀", "zh-Hans": "预售状态暂不可读", ko: "프리세일 상태 확인 불가" },
    saleNotConfigured: { en: "PRESALE CONTRACT NOT LINKED", "zh-Hant": "尚未連結預售合約", "zh-Hans": "尚未关联预售合约", ko: "프리세일 계약 미연결" },
    progressTitle: { en: "PRESALE RAISED", "zh-Hant": "預售募資進度", "zh-Hans": "预售募资进度", ko: "프리세일 모금 진행률" },
    liveFeed: { en: "LIVE ONCHAIN DATA", "zh-Hant": "鏈上即時資料", "zh-Hans": "链上实时数据", ko: "실시간 온체인 데이터" },
    waitingFeed: { en: "WAITING FOR CONTRACT", "zh-Hant": "等待預售合約", "zh-Hans": "等待预售合约", ko: "프리세일 계약 대기" },
    goalProgress: { en: "OF GOAL", "zh-Hant": "募資達成率", "zh-Hans": "募资达成率", ko: "목표 달성률" },
    progressUnavailable: { en: "Live presale progress is temporarily unavailable. Please verify against the onchain record.", "zh-Hant": "即時募資進度暫不可讀，請稍後重試並以鏈上紀錄為準。", "zh-Hans": "实时募资进度暂不可读，请稍后重试并以链上记录为准。", ko: "실시간 모금 진행률을 일시적으로 확인할 수 없습니다. 온체인 기록을 확인하세요." },
    progressNotConfigured: { en: "Link the presale contract to show live raised and RVYN sold figures here.", "zh-Hant": "設定並連結預售合約後，這裡就會即時顯示募資額與 RVYN 售出進度。", "zh-Hans": "设置并关联预售合约后，这里会实时显示募资额与 RVYN 售出进度。", ko: "프리세일 계약을 연결하면 이곳에 실시간 모금액과 RVYN 판매량이 표시됩니다." },
    raisedOf: { en: "RAISED SO FAR", "zh-Hant": "目前已募", "zh-Hans": "目前已募", ko: "현재 모금액" },
    target: { en: "PRESALE GOAL", "zh-Hant": "預售募資目標", "zh-Hans": "预售募资目标", ko: "프리세일 목표액" },
    targetPlan: { en: "PLANNED FROM TOKENOMICS", "zh-Hant": "依代幣經濟模型規劃", "zh-Hans": "依代币经济模型规划", ko: "토큰 이코노미 계획 기준" },
    targetLive: { en: "ONCHAIN CONTRACT TARGET", "zh-Hant": "預售合約目標", "zh-Hans": "预售合约目标", ko: "온체인 계약 목표" },
    tokensSold: { en: "RVYN PRESALE ALLOCATION", "zh-Hant": "預售代幣銷售進度", "zh-Hans": "预售代币销售进度", ko: "RVYN 프리세일 배정량" },
    waitingAmount: { en: "Not started", "zh-Hant": "尚未開始", "zh-Hans": "尚未开始", ko: "아직 시작 전" },
    allocationShare: { en: "of total RVYN supply", "zh-Hant": "占總供應量", "zh-Hans": "占总供应量", ko: "총 공급량 중" },
    supply: { en: "INITIAL TOTAL SUPPLY", "zh-Hant": "初始總供應量", "zh-Hans": "初始总供应量", ko: "최초 총공급량" },
    launchDate: { en: "DEPLOYED", "zh-Hant": "發行日期", "zh-Hans": "发行日期", ko: "발행일" },
    network: { en: "NETWORK", "zh-Hant": "所屬網路", "zh-Hans": "所属网络", ko: "네트워크" },
    tradeFee: { en: "TOKEN TRADE FEE", "zh-Hant": "TOKEN 交易手續費", "zh-Hans": "TOKEN 交易手续费", ko: "토큰 거래 수수료" },
    tokenIntro: {
      en: "RovynCore (RVYN) is the first official token issued through the ROVYN CORE launchpad, marking the platform’s first onchain chapter. Its initial supply is fixed at 10,000,000 RVYN, with no mint function in the launch-token design. The token contract is designed without buy or sell tax; network gas and any third-party exchange fees may still apply. Presale, liquidity and holder-distribution details should always be checked against current onchain records.",
      "zh-Hant": "RovynCore（RVYN）是 ROVYN CORE 發射台發行的首枚官方代幣，記錄平台第一個上鏈篇章。初始總供應量固定為 10,000,000 RVYN，發射台的 Token 合約設計不含增發功能。Token 合約不設買賣交易稅；鏈上 Gas 與第三方交易平台費用仍可能產生。預售、流動性與持幣分布，請以最新鏈上資料為準。",
      "zh-Hans": "RovynCore（RVYN）是 ROVYN CORE 发射台发行的首枚官方代币，记录平台第一个上链篇章。初始总供应量固定为 10,000,000 RVYN，发射台的 Token 合约设计不含增发功能。Token 合约不设买卖交易税；链上 Gas 与第三方交易平台费用仍可能产生。预售、流动性与持币分布，请以最新链上资料为准。",
      ko: "RovynCore(RVYN)는 ROVYN CORE 런치패드에서 발행한 첫 공식 토큰으로, 플랫폼의 첫 온체인 기록입니다. 최초 공급량은 10,000,000 RVYN으로 고정되며 런치 토큰 설계에는 추가 발행 기능이 없습니다. 토큰 계약은 매수·매도 세금을 부과하지 않도록 설계되었지만 네트워크 가스와 제3자 거래소 수수료는 발생할 수 있습니다. 프리세일, 유동성 및 보유자 분포는 최신 온체인 기록을 확인하세요.",
    },
    contract: { en: "TOKEN CONTRACT", "zh-Hant": "Token 合約", "zh-Hans": "Token 合约", ko: "토큰 컨트랙트" },
    securityTitle: { en: "TOKEN DESIGN / LIVE CHECKS", "zh-Hant": "合約設計規格／尚待查核項目", "zh-Hans": "合约设计规格／尚待查核项目", ko: "토큰 설계 / 실시간 확인 필요" },
    templateSpec: { en: "TOKEN DESIGN", "zh-Hant": "合約設計規格", "zh-Hans": "合约设计规格", ko: "토큰 설계 사양" },
    fixedSupplyCheck: { en: "Fixed supply · no mint function", "zh-Hant": "固定供應量・無增發功能", "zh-Hans": "固定供应量・无增发功能", ko: "고정 공급량 · 추가 발행 기능 없음" },
    taxCheck: { en: "No token buy/sell tax", "zh-Hant": "不收 Token 買賣稅", "zh-Hans": "不收 Token 买卖税", ko: "토큰 매수·매도 세금 없음" },
    blacklistCheck: { en: "No blacklist / freeze controls", "zh-Hant": "無黑名單／凍結控制", "zh-Hans": "无黑名单／冻结控制", ko: "블랙리스트 / 동결 제어 없음" },
    sourceCheck: { en: "Explorer source verification", "zh-Hant": "區塊瀏覽器原始碼驗證", "zh-Hans": "区块浏览器源代码验证", ko: "탐색기 소스 코드 검증" },
    liquidityCheck: { en: "LP lock / burn status", "zh-Hant": "LP 鎖定／銷毀狀態", "zh-Hans": "LP 锁定／销毁状态", ko: "LP 잠금 / 소각 상태" },
    holdersCheck: { en: "Holder concentration", "zh-Hant": "持幣集中度", "zh-Hans": "持币集中度", ko: "보유자 집중도" },
    honeypotCheck: { en: "Buy / sell simulation", "zh-Hant": "買賣模擬檢查", "zh-Hans": "买卖模拟检查", ko: "매수 / 매도 시뮬레이션" },
    specLabel: { en: "Template spec", "zh-Hant": "發行規格", "zh-Hans": "发行规格", ko: "발행 사양" },
    needsCheck: { en: "Needs live check", "zh-Hant": "需即時查核", "zh-Hans": "需实时查核", ko: "실시간 확인 필요" },
    riskNote: { en: "Design checks are not an audit or a safety guarantee. Liquidity, holder distribution and honeypot checks require current third-party or onchain data.", "zh-Hant": "設計規格不等於安全審計或安全保證；流動性、持幣分布與貔貅風險仍須依即時鏈上／第三方資料判讀。", "zh-Hans": "设计规格不等于安全审计或安全保证；流动性、持币分布与貔貅风险仍须依据实时链上／第三方资料判断。", ko: "설계 사양 표시는 보안 감사나 안전 보장이 아닙니다. 유동성, 보유자 분포, 허니팟 여부는 최신 온체인 또는 제3자 데이터로 확인해야 합니다." },
    explorer: { en: "View the full onchain record", "zh-Hant": "查看完整鏈上紀錄", "zh-Hans": "查看完整链上记录", ko: "전체 온체인 기록 보기" },
    loading: { en: "Loading the official RVYN record…", "zh-Hant": "正在讀取 RVYN 官方紀錄…", "zh-Hans": "正在读取 RVYN 官方记录…", ko: "RVYN 공식 기록을 불러오는 중…" },
    openRvyn: { en: "Open the official RVYN page", "zh-Hant": "前往 RVYN 官方頁面", "zh-Hans": "前往 RVYN 官方页面", ko: "RVYN 공식 페이지 열기" },
  } satisfies Record<string, Local>;

  const recordUrl = token?.asset.url || (token ? `/assets/robinhood/${token.asset.contractAddress}` : "/onchain-record");
  const saleCopy = presaleStatus === "open" ? copy.verified : presaleStatus === "closed" ? copy.saleClosed : presaleStatus === "not-configured" ? copy.saleNotConfigured : copy.saleUnknown;
  const raised = presaleMetrics?.raised ?? 0n;
  const hardCap = presaleMetrics?.hardCap ?? 0n;
  const presalePercent = hardCap > 0n ? Math.min(100, Number((raised * 10_000n) / hardCap) / 100) : 0;
  const presalePriceWei = parseEther(RVYN_MODEL.priceEth);
  const soldTokens = presalePriceWei > 0n ? raised / presalePriceWei : 0n;
  const plannedPresaleTokens = BigInt(RVYN_MODEL.presaleTokens);
  const plannedTargetWei = plannedPresaleTokens * presalePriceWei;
  const plannedTargetEth = Number(formatEther(plannedTargetWei)).toLocaleString(locale, { maximumFractionDigits: 2 });
  const presaleShare = RVYN_MODEL.allocations.find((item) => item.label === "Presale")?.percent ?? 0;
  const riskChecks = [
    { label: copy.fixedSupplyCheck, passed: true },
    { label: copy.taxCheck, passed: true },
    { label: copy.blacklistCheck, passed: true },
    { label: copy.sourceCheck, passed: false },
    { label: copy.liquidityCheck, passed: false },
    { label: copy.holdersCheck, passed: false },
    { label: copy.honeypotCheck, passed: false },
  ];

  return (
    <section ref={revealRef} style={revealStyle} className={`home-featured ${revealClassName}`} aria-labelledby="home-featured-title">
      <div className="home-featured__heading">
        <div>
          <h2 id="home-featured-title"><span>ROVYN CORE</span>{" "}<span>{choose(copy.title, locale)}</span></h2>
          <p>{choose(copy.intro, locale)}</p>
        </div>
        <span className={`home-featured__presale home-featured__presale--${presaleStatus}`} aria-live="polite">
          <i aria-hidden="true" />{choose(saleCopy, locale)}
        </span>
      </div>
      {loading ? (
        <p className="home-featured__state" role="status">{choose(copy.loading, locale)}</p>
      ) : error ? (
        <div className="home-featured__empty"><p>{choose(copy.empty, locale)}</p><span>{error}</span></div>
      ) : token ? (
        <div className="home-featured__grid">
          {(() => {
            let supply = "—";
            try {
              const snapshotSupply = token.originalState?.values.totalSupply;
              const snapshotDecimals = Number(token.originalState?.values.decimals ?? 18);
              if (snapshotSupply !== null && snapshotSupply !== undefined && Number.isInteger(snapshotDecimals) && snapshotDecimals >= 0 && snapshotDecimals <= 36) {
                supply = `${Number(formatUnits(BigInt(String(snapshotSupply)), snapshotDecimals)).toLocaleString(locale)} RVYN`;
              }
            } catch {}
            return (
              <article className="home-featured__card home-featured__card--official" key={token.asset.contractAddress}>
                <div className="home-featured__official-body">
                  <div className="home-featured__official-copy">
                    <Link className="home-featured__identity home-featured__identity-link" href="/rvyn" aria-label={choose(copy.openRvyn, locale)}>
                      <span className="home-featured__avatar">
                        <Orbit size={21} />
                        {token.identity.logo && <Image src={token.identity.logo} alt="" width={72} height={72} unoptimized onError={(event) => { event.currentTarget.style.display = "none"; }} />}
                      </span>
                      <div><h3>{token.identity.name}</h3><span>${token.identity.symbol}</span></div>
                      <ArrowUpRight size={18} className="home-featured__arrow" />
                    </Link>
                    <Link className="home-featured__contract-link" href={recordUrl}>
                      <small>{choose(copy.contract, locale)}</small><span>{token.asset.contractAddress} <ArrowUpRight size={15} /></span>
                    </Link>
                    <p className="home-featured__description">{choose(copy.tokenIntro, locale)}</p>
                    <div className={`home-featured__progress${presaleMetrics ? " is-live" : " is-unavailable"}${presaleStatus === "open" && presaleMetrics ? " is-active" : ""}`} aria-label={choose(copy.progressTitle, locale)}>
                      <div className="home-featured__progress-heading">
                        <strong>{choose(copy.progressTitle, locale)}</strong>
                        <span className={`home-featured__progress-feed${presaleMetrics ? " is-connected" : ""}`}><i aria-hidden="true" />{choose(presaleMetrics ? copy.liveFeed : copy.waitingFeed, locale)}</span>
                      </div>
                      <div className="home-featured__progress-metrics">
                        <div className="home-featured__progress-raised">
                          <small>{choose(copy.raisedOf, locale)}</small>
                          <strong>{presaleMetrics ? Number(formatEther(raised)).toLocaleString(locale, { maximumFractionDigits: 2 }) : "—"}<em> ETH</em></strong>
                          <span>{presaleMetrics ? choose(copy.liveFeed, locale) : choose(copy.waitingFeed, locale)}</span>
                        </div>
                        <div className="home-featured__progress-target">
                          <small>{choose(copy.target, locale)}</small>
                          <strong>{presaleMetrics ? Number(formatEther(hardCap)).toLocaleString(locale, { maximumFractionDigits: 2 }) : plannedTargetEth}<em> ETH</em></strong>
                          <span>{choose(presaleMetrics ? copy.targetLive : copy.targetPlan, locale)}</span>
                        </div>
                      </div>
                      <div className="home-featured__progress-completion">
                        <span>{choose(copy.goalProgress, locale)}</span>
                        <strong>{presaleMetrics ? `${presalePercent.toFixed(2)}%` : "—"}</strong>
                      </div>
                      <div
                        className="home-featured__progress-track"
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={presaleMetrics ? presalePercent : undefined}
                        aria-valuetext={presaleMetrics ? `${presalePercent.toFixed(2)}%` : choose(presaleStatus === "not-configured" ? copy.progressNotConfigured : copy.progressUnavailable, locale)}
                      ><span style={{ width: `${presalePercent}%` }} /></div>
                      {presaleMetrics ? (
                        <div className="home-featured__progress-footer">
                          <span>{choose(copy.tokensSold, locale)} <b>{Number(soldTokens).toLocaleString(locale)} / {Number(plannedPresaleTokens).toLocaleString(locale)} RVYN</b></span>
                          <span><b>{presaleShare}%</b> {choose(copy.allocationShare, locale)}</span>
                        </div>
                      ) : (
                        <div className="home-featured__progress-empty">
                          <Orbit size={18} aria-hidden="true" />
                          <p>
                            <strong>{choose(copy.tokensSold, locale)}　{choose(copy.waitingAmount, locale)} / {Number(plannedPresaleTokens).toLocaleString(locale)} RVYN</strong>
                            <span>{presaleShare}% {choose(copy.allocationShare, locale)} · {choose(presaleStatus === "not-configured" ? copy.progressNotConfigured : copy.progressUnavailable, locale)}</span>
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="home-featured__official-data">
                    <div className="home-featured__fee-callout">
                      <small>{choose(copy.tradeFee, locale)}</small>
                      <strong>0<span>%</span></strong>
                      <p>{choose(copy.taxCheck, locale)}</p>
                    </div>
                    <div className="home-featured__security">
                      <h4>{choose(copy.securityTitle, locale)}</h4>
                      <ul>
                        {riskChecks.map(({ label, passed }) => (
                          <li className={passed ? "is-design-check" : "is-pending-check"} key={label.en}>
                            {passed ? <Check size={15} aria-hidden="true" /> : <CircleHelp size={15} aria-hidden="true" />}
                            <span>{choose(label, locale)}</span>
                            <small>{choose(passed ? copy.specLabel : copy.needsCheck, locale)}</small>
                          </li>
                        ))}
                      </ul>
                      <p className="home-featured__risk-note">{choose(copy.riskNote, locale)}</p>
                    </div>
                    <div className="home-featured__facts record-fact-timeline content-motion-zone">
                      <span><small>{choose(copy.supply, locale)}</small><strong>{supply}</strong></span>
                      <span><small>{choose(copy.launchDate, locale)}</small><strong>{new Date(token.asset.createdAt * 1000).toLocaleDateString(locale)}</strong></span>
                      <span><small>{choose(copy.network, locale)}</small><strong>{token.asset.network}</strong></span>
                    </div>
                    <Link className="home-featured__explorer" href={recordUrl}>{choose(copy.explorer, locale)} <ArrowUpRight size={15} /></Link>
                  </div>
                </div>
              </article>
            );
          })()}
        </div>
      ) : (
        <div className="home-featured__empty"><Orbit size={26} /><p>{choose(copy.empty, locale)}</p></div>
      )}
    </section>
  );
}

export function HomeRvynEntry() {
  const { locale } = useLanguage();
  const [revealRef, revealClassName, revealStyle] = useScrollReveal<HTMLElement>({ delay: 30 });
  const copy = {
    eyebrow: { en: "OUR FIRST TOKEN", "zh-Hant": "我們的第一個 Token", "zh-Hans": "我们的第一个 Token", ko: "우리의 첫 토큰" },
    description: {
      en: "RVYN is ROVYN CORE’s first brand token. Review its fixed-supply model, contract and presale state on a page built around public information.",
      "zh-Hant": "RVYN 是 ROVYN CORE 的第一個品牌 Token。固定供應模型、合約與預售狀態，都集中在官方頁面公開說明。",
      "zh-Hans": "RVYN 是 ROVYN CORE 的第一个品牌 Token。固定供应模型、合约与预售状态，都集中在官方页面公开说明。",
      ko: "RVYN은 ROVYN CORE의 첫 브랜드 토큰입니다. 고정 공급 모델, 컨트랙트, 프리세일 상태를 공식 페이지에서 확인할 수 있습니다.",
    },
  };
  return (
    <section
      ref={revealRef}
      style={revealStyle}
      className={`home-rvyn-entry ${revealClassName}`}
      aria-labelledby="rvyn-entry-title"
    >
      <div className="home-rvyn-entry__card">
        <div>
          <div className="eyebrow">{choose(copy.eyebrow, locale)}</div>
          <h2 id="rvyn-entry-title">RovynCore (RVYN)</h2>
          <p>{choose(copy.description, locale)}</p>
        </div>
        <Link className="home-signal__link" href="/rvyn">
          {choose(
            {
              en: "Open official token page",
              "zh-Hant": "開啟官方 Token 頁",
              "zh-Hans": "打开官方 Token 页",
              ko: "공식 토큰 페이지 열기",
            },
            locale,
          )}{" "}
          <ArrowUpRight size={16} aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}

export function HomeRoadmap() {
  const { locale } = useLanguage();
  const [activePhase, setActivePhase] = useState("next");
  const [revealRef, revealClassName, revealStyle] = useScrollReveal<HTMLElement>({ delay: 40 });
  const current = roadmapPhases.find((phase) => phase.id === activePhase) || roadmapPhases[1];
  const phaseIndex = roadmapPhases.findIndex(phase => phase.id === current.id);
  return (
    <section ref={revealRef} style={revealStyle} className={`home-roadmap home-roadmap--unified ${revealClassName}`} id="roadmap" aria-labelledby="roadmap-title">
      <div className="unified-roadmap__heading">
        <div>
          <div className="eyebrow">{choose(roadmapLocal("ROADMAP / PROGRESS & NEXT STEPS", "發展路線 / 進度與下一步", "发展路线 / 进度与下一步", "로드맵 / 진행 상황과 다음 단계"), locale)}</div>
          <h2 id="roadmap-title">{choose(roadmapLocal("Built foundations. A clear next chapter.", "已完成的基礎，接下來的方向。", "已完成的基础，接下来的方向。", "완성된 기반, 다음 단계의 방향."), locale)}</h2>
          <p>{choose(roadmapLocal("See what is live, what we are preparing and what remains under exploration. Select a stage for its milestones.", "從已上線的功能、近期準備到長期探索，依階段查看目前進度與下一步。", "从已上线的功能、近期准备到长期探索，按阶段查看当前进度与下一步。", "운영 중인 기능부터 준비 중인 작업과 장기 탐색까지, 단계를 선택해 진행 상황과 다음 목표를 확인하세요."), locale)}</p>
        </div>
        <a className="unified-roadmap__updates" href="https://x.com/RovynCORE" target="_blank" rel="noreferrer">{choose(roadmapLocal("Follow progress on X", "在 X 追蹤進度", "在 X 追踪进度", "X에서 진행 상황 보기"), locale)} <ArrowUpRight size={16} aria-hidden="true" /></a>
      </div>
      <div className="unified-roadmap__phases content-motion-zone" role="tablist" aria-label={choose(roadmapLocal("Roadmap stages", "發展階段", "发展阶段", "로드맵 단계"), locale)} onKeyDown={(event) => {
        const index = roadmapPhases.findIndex(phase => phase.id === activePhase);
        const next = event.key === "ArrowRight" ? (index + 1) % roadmapPhases.length
          : event.key === "ArrowLeft" ? (index + roadmapPhases.length - 1) % roadmapPhases.length
          : event.key === "Home" ? 0 : event.key === "End" ? roadmapPhases.length - 1 : null;
        if (next === null) return;
        event.preventDefault();
        setActivePhase(roadmapPhases[next].id);
        event.currentTarget.querySelectorAll<HTMLButtonElement>("[role=tab]")[next]?.focus();
      }}>
        {roadmapPhases.map((phase, index) => <button type="button" role="tab" key={phase.id} id={`roadmap-tab-${phase.id}`} aria-label={choose(phase.label, locale)} aria-controls={`roadmap-panel-${phase.id}`} aria-selected={activePhase === phase.id} tabIndex={activePhase === phase.id ? 0 : -1} onClick={() => setActivePhase(phase.id)}>
          <span className="unified-roadmap__phase-number">0{index + 1}</span>
          <span className="unified-roadmap__phase-window">{choose(phase.window, locale)}</span>
          <strong>{choose(phase.label, locale)}</strong>
          <span className="unified-roadmap__phase-summary">{choose(phase.summary, locale)}</span>
        </button>)}
      </div>
      <div className="unified-roadmap__route" aria-hidden="true">
        {[0, 1, 2].map(index => <i key={index} style={{ left: `${index * 50}%` }} />)}
        <span style={{ left: `${phaseIndex * 50}%` }} />
      </div>
      <div className="unified-roadmap__panels">
        {roadmapPhases.map(phase => <div key={phase.id} id={`roadmap-panel-${phase.id}`} className={`unified-roadmap__panel${phase.id === activePhase ? " is-active" : ""}`} role="tabpanel" aria-labelledby={`roadmap-tab-${phase.id}`} aria-hidden={phase.id !== activePhase} inert={phase.id !== activePhase}>
          <h3 className="unified-roadmap__phase-title">{choose(phase.title, locale)}</h3>
          <div className="unified-roadmap__milestones">
            {phase.items.map((item, index) => <article key={index} className={`home-roadmap__card home-roadmap__card--${item.tone}`}>
              <div className="home-roadmap__card-top"><span>0{index + 1}</span><b>{choose(item.status, locale)}</b></div>
              <h3>{choose(item.title, locale)}</h3><p>{choose(item.body, locale)}</p>
            </article>)}
          </div>
        </div>)}
      </div>
      <p className="unified-roadmap__note">{choose(roadmapLocal("Dates are planning targets, not a guarantee of availability. Presale access follows the official announcement and live contract state.", "時程為規劃目標，並非開放保證。預售資格與實際開放，以官方公告及即時合約狀態為準。", "时间为规划目标，并非开放保证。预售资格与实际开放，以官方公告及实时合约状态为准。", "일정은 계획 목표이며 공개를 보장하지 않습니다. 프리세일 자격과 실제 개시는 공식 공지와 실시간 계약 상태를 기준으로 확인하세요."), locale)}</p>
    </section>
  );
}


// Keep Discover/Create/Verify card data available for other surfaces if needed.
export const firstScreenActions = [
  { href: "/explore", label: "Discover", Icon: Compass },
  { href: "/launchpad", label: "Create", Icon: Rocket },
  { href: "/verify", label: "Your tokens", Icon: WalletCards },
] as const;
