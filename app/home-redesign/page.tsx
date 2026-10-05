"use client";

import { ArrowDown, ArrowRight, ArrowUpRight, Orbit, Rocket, ShieldCheck } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import Link from "@/components/site-link";
import { useLanguage } from "@/components/language-provider";
import { api } from "@/components/platform-provider";
import { HomeFeatured, HomeRoadmap } from "@/components/home-content";
import { HomeHeroMedia } from "@/components/home-hero-media";
import { ConstellationStory } from "@/components/constellation-story";
import { SectorTag } from "@/components/sector-tag";
import { PresaleConsole } from "@/components/presale-console";
import { HeroHud, TelemetryRail } from "@/components/hero-hud";
import { HeroParallax } from "@/components/hero-parallax";
import type { Locale } from "@/lib/translations";

type Copy = Record<Locale, string>;
const c = (locale: Locale, value: Copy) => value[locale];

type HomeSaleStatus = {
  phase: "allowlist_prep" | "allowlist_open" | "sale_open" | "sale_closed";
  purchasesOpen: boolean;
  registryOpen: boolean;
  registrationStatus: "disabled" | "scheduled" | "open" | "closed";
};

const copy = {
  chooseSignal: { en: "Choose a signal to explore its story", "zh-Hant": "選擇一道訊號，探索它的故事", "zh-Hans": "选择一道信号，探索它的故事", ko: "신호를 선택해 이야기를 살펴보세요" },
  headlineFirst: { en: "A world in the making.", "zh-Hant": "一個世界，正在成形。", "zh-Hans": "一个世界，正在成形。", ko: "만들어지고 있는 세계." },
  headlineSecond: { en: "RVYN at its core.", "zh-Hant": "RVYN 為核心。", "zh-Hans": "RVYN 为核心。", ko: "그 중심에 RVYN." },
  heroLead: { en: "We're building our first game on Robinhood Chain, with RVYN at the heart of its economy. Our launchpad and public onchain records are already live.", "zh-Hant": "我們正在 Robinhood Chain 上打造第一款遊戲，RVYN 將是它經濟的核心。發射台與公開鏈上紀錄已經上線。", "zh-Hans": "我们正在 Robinhood Chain 上打造第一款游戏，RVYN 将是它经济的核心。发射台与公开链上记录已经上线。", ko: "우리는 Robinhood Chain에서 RVYN을 경제의 중심에 둔 첫 게임을 만들고 있습니다. 런치패드와 공개 온체인 기록은 이미 운영 중입니다." },
  secStatus: { en: "LAUNCH STATUS", "zh-Hant": "發射狀態", "zh-Hans": "发射状态", ko: "런치 상태" },
  secOrigin: { en: "ORIGIN", "zh-Hant": "起源", "zh-Hans": "起源", ko: "기원" },
  secRecords: { en: "ONCHAIN RECORDS", "zh-Hant": "鏈上紀錄", "zh-Hans": "链上记录", ko: "온체인 기록" },
  secRoadmap: { en: "ROADMAP", "zh-Hant": "路線圖", "zh-Hans": "路线图", ko: "로드맵" },
  secLaunch: { en: "BEGIN", "zh-Hant": "開始", "zh-Hans": "开始", ko: "시작" },
  telNet: { en: "NETWORK", "zh-Hant": "網路", "zh-Hans": "网络", ko: "네트워크" },
  telSupply: { en: "SUPPLY", "zh-Hant": "總量", "zh-Hans": "总量", ko: "총 공급량" },
  telStage: { en: "STAGE", "zh-Hant": "階段", "zh-Hans": "阶段", ko: "단계" },
  telGame: { en: "GAME", "zh-Hant": "遊戲", "zh-Hans": "游戏", ko: "게임" },
  specChain: { en: "CHAIN 4663", "zh-Hant": "CHAIN 4663", "zh-Hans": "CHAIN 4663", ko: "CHAIN 4663" },
  specSupply: { en: "10,000,000 RVYN", "zh-Hant": "10,000,000 RVYN", "zh-Hans": "10,000,000 RVYN", ko: "10,000,000 RVYN" },
  specGame: { en: "FIRST GAME · IN DEVELOPMENT", "zh-Hant": "第一款遊戲 · 開發中", "zh-Hans": "第一款游戏 · 开发中", ko: "첫 게임 · 개발 중" },
  explore: { en: "View onchain records", "zh-Hant": "查看鏈上紀錄", "zh-Hans": "查看链上记录", ko: "온체인 기록 보기" },
  create: { en: "Start a launch", "zh-Hant": "開始發行", "zh-Hans": "开始发行", ko: "발행 시작하기" },
  joinWhitelist: { en: "Join whitelist", "zh-Hant": "加入白名單", "zh-Hans": "加入白名单", ko: "화이트리스트 등록" },
  checkWhitelist: { en: "View whitelist status", "zh-Hant": "查看白名單狀態", "zh-Hans": "查看白名单状态", ko: "화이트리스트 상태 보기" },
  onchainRecord: { en: "Onchain Record", "zh-Hant": "鏈上紀錄", "zh-Hans": "链上记录", ko: "온체인 기록" },
  onchainRecords: { en: "Onchain records", "zh-Hant": "鏈上紀錄", "zh-Hans": "链上记录", ko: "온체인 기록" },
  buttonStatusOpen: { en: "Open", "zh-Hant": "開放中", "zh-Hans": "开放中", ko: "신청 중" },
  buttonStatusSoon: { en: "Soon", "zh-Hant": "即將開放", "zh-Hans": "即将开放", ko: "오픈 예정" },
  buttonStatusClosed: { en: "Closed", "zh-Hant": "已關閉", "zh-Hans": "已关闭", ko: "종료" },
  buttonStatusPreparing: { en: "Preparing", "zh-Hant": "準備中", "zh-Hans": "准备中", ko: "준비 중" },
  buttonStatusChecking: { en: "Checking", "zh-Hant": "確認中", "zh-Hans": "确认中", ko: "확인 중" },
  buttonStatusUnavailable: { en: "Unavailable", "zh-Hant": "暫時無法確認", "zh-Hans": "暂时无法确认", ko: "확인 불가" },
  whitelistOpen: { en: "Whitelist open", "zh-Hant": "白名單登記開放中", "zh-Hans": "白名单登记开放中", ko: "화이트리스트 신청 중" },
  whitelistPreparing: { en: "Whitelist preparing", "zh-Hant": "白名單準備中", "zh-Hans": "白名单准备中", ko: "화이트리스트 준비 중" },
  whitelistScheduled: { en: "Whitelist opens soon", "zh-Hant": "白名單即將開放", "zh-Hans": "白名单即将开放", ko: "화이트리스트 신청 예정" },
  whitelistClosed: { en: "Whitelist closed", "zh-Hant": "白名單登記已關閉", "zh-Hans": "白名单登记已关闭", ko: "화이트리스트 신청 종료" },
  presaleOpen: { en: "Presale open", "zh-Hant": "預售開放中", "zh-Hans": "预售开放中", ko: "프리세일 진행 중" },
  presaleClosed: { en: "Presale closed", "zh-Hant": "預售已結束", "zh-Hans": "预售已结束", ko: "프리세일 종료" },
  presaleChecking: { en: "Presale status checking", "zh-Hant": "預售狀態確認中", "zh-Hans": "预售状态确认中", ko: "프리세일 상태 확인 중" },
  statusChecking: { en: "Checking availability", "zh-Hant": "正在確認開放狀態", "zh-Hans": "正在确认开放状态", ko: "참여 가능 여부 확인 중" },
  statusUnavailable: { en: "Status temporarily unavailable", "zh-Hant": "狀態暫時無法讀取", "zh-Hans": "状态暂时无法读取", ko: "상태를 일시적으로 확인할 수 없음" },
  network: { en: "LIVE ON ROBINHOOD CHAIN", "zh-Hant": "部署於 Robinhood Chain", "zh-Hans": "部署于 Robinhood Chain", ko: "Robinhood Chain에서 운영" },
  chapter: { en: "THE FIRST SIGNAL", "zh-Hant": "故事，從第一道訊號開始", "zh-Hans": "故事，从第一道信号开始", ko: "첫 번째 신호에서 시작되는 이야기" },
  processTitle: { en: "A signal becomes a world.", "zh-Hant": "一束訊號，\n聚成一個星系。", "zh-Hans": "一束信号，\n聚成一个星系。", ko: "하나의 신호가 세계가 되다." },
  processLead: { en: "In blockchain’s endless night sky, every creator carries a signal not yet seen. ROVYN CORE is our imagined core: a place where those signals can find an orbit and begin to connect. The first light is RVYN.", "zh-Hant": "在區塊鏈無邊的夜空裡，每位創作者都帶著一道尚未被看見的訊號。ROVYN CORE，是我們想像中的核心——讓訊號找到軌道，讓彼此開始連結。第一道光，叫作 RVYN。", "zh-Hans": "在区块链无边的夜空里，每位创作者都带着一道尚未被看见的信号。ROVYN CORE，是我们想象中的核心——让信号找到轨道，让彼此开始连接。第一道光，叫作 RVYN。", ko: "끝없는 블록체인의 밤하늘에서 크리에이터는 아직 보이지 않는 신호를 품고 있습니다. ROVYN CORE는 그 신호가 궤도를 찾고 서로 이어지는 중심이 되기를 상상합니다. 그 첫 번째 빛의 이름은 RVYN입니다." },
  stageOne: { en: "A signal in the dark", "zh-Hant": "夜色裡，出現一道訊號", "zh-Hans": "夜色里，出现一道信号", ko: "어둠 속에 나타난 신호" },
  stageOneBody: { en: "ROVYN CORE begins in the space between an idea and its first believer. A small signal asks to be noticed—not louder than the universe, just clear enough for the right people to find.", "zh-Hant": "ROVYN CORE 的故事，從一個想法與第一個相信它的人之間開始。微弱的訊號不必蓋過整片宇宙，只要清楚到能被正在尋找的人看見。", "zh-Hans": "ROVYN CORE 的故事，从一个想法与第一个相信它的人之间开始。微弱的信号不必盖过整片宇宙，只要清楚到能被正在寻找的人看见。", ko: "ROVYN CORE의 이야기는 아이디어와 그것을 처음 믿어준 사람 사이에서 시작됩니다. 작은 신호가 우주보다 더 클 필요는 없습니다. 찾고 있던 사람이 알아볼 만큼 선명하면 됩니다." },
  stageTwo: { en: "An orbit takes shape", "zh-Hant": "每個想法，找到自己的軌道", "zh-Hans": "每个想法，找到自己的轨道", ko: "각자의 궤도를 찾아서" },
  stageTwoBody: { en: "A signal becomes stronger when it has a place to travel. ROVYN CORE is that first orbit: a home for creators to give an idea a name, a shape and a public point in the onchain sky.", "zh-Hant": "訊號有了可以前進的軌道，才不會一閃即逝。ROVYN CORE 想成為那條起始軌道，讓創作者為想法取名、塑形，並在鏈上留下公開座標。", "zh-Hans": "信号有了可以前进的轨道，才不会一闪即逝。ROVYN CORE 想成为那条起始轨道，让创作者为想法取名、塑形，并在链上留下公开坐标。", ko: "신호가 나아갈 궤도를 얻으면 한순간에 사라지지 않습니다. ROVYN CORE는 크리에이터가 아이디어에 이름과 형태를 부여하고 온체인 하늘에 공개 좌표를 남기는 첫 궤도가 되고자 합니다." },
  stageThree: { en: "RVYN, the first light", "zh-Hant": "RVYN，第一道光", "zh-Hans": "RVYN，第一道光", ko: "첫 번째 빛, RVYN" },
  stageThreeBody: { en: "Our first brand token carries the ROVYN CORE name into the open. RVYN is the opening chapter made visible—a marker of where this constellation begins, and a story still being written.", "zh-Hant": "作為 ROVYN CORE 的首個品牌 Token，RVYN 把這個名字帶進公開的鏈上世界。它是看得見的第一章，標記星系從何處開始；而後續篇章，仍在書寫。", "zh-Hans": "作为 ROVYN CORE 的首个品牌 Token，RVYN 把这个名字带进公开的链上世界。它是看得见的第一章，标记星系从何处开始；而后续篇章，仍在书写。", ko: "ROVYN CORE의 첫 브랜드 토큰인 RVYN은 이 이름을 열린 온체인 세계로 가져갑니다. 눈에 보이는 첫 장이자 이 별자리가 시작된 곳을 표시하는 표식이며, 이야기는 계속 쓰이고 있습니다." },
  stageFour: { en: "The constellation grows", "zh-Hant": "下一道光，還在路上", "zh-Hans": "下一道光，还在路上", ko: "다음 빛은 아직 오는 중" },
  stageFourBody: { en: "One light can point the way; many can redraw the sky. We imagine a growing constellation of creator-led projects, each with its own orbit, its own people and a reason to keep moving forward.", "zh-Hant": "一道光能指引方向，更多光芒則能重新描繪夜空。我們想像一片持續延展的星系：每個創作者項目都有自己的軌道、同行的人，以及繼續前進的理由。", "zh-Hans": "一道光能指引方向，更多光芒则能重新描绘夜空。我们想象一片持续延展的星系：每个创作者项目都有自己的轨道、同行的人，以及继续前进的理由。", ko: "하나의 빛은 길을 가리키고, 더 많은 빛은 밤하늘을 새로 그립니다. 각자의 궤도와 사람들, 계속 나아갈 이유를 가진 크리에이터 프로젝트가 모여 별자리를 키워가는 모습을 상상합니다." },
  finalTitle: { en: "Your next idea starts here.", "zh-Hant": "下一個想法，從這裡開始。", "zh-Hans": "下一个想法，从这里开始。", ko: "다음 아이디어, 여기서 시작하세요." },
  finalText: { en: "Explore what’s already onchain—or bring your own idea to the launchpad.", "zh-Hant": "看看有哪些想法已經上鏈，或帶著你的點子走進發射台。", "zh-Hans": "看看有哪些想法已经上链，或带着你的点子走进发射台。", ko: "이미 온체인에 올라온 아이디어를 살펴보거나, 내 아이디어를 런치패드로 가져오세요." },
  walletSignal: { en: "WALLET-CONTROLLED", "zh-Hant": "錢包由你掌握", "zh-Hans": "钱包由你掌握", ko: "지갑은 직접 관리" },
  creatorSignal: { en: "CREATOR-FIRST TOOLS", "zh-Hant": "以創作者為先", "zh-Hans": "以创作者为先", ko: "크리에이터 우선" },
  publicSignal: { en: "PUBLIC ONCHAIN RECORD", "zh-Hant": "公開鏈上紀錄", "zh-Hans": "公开链上记录", ko: "공개 온체인 기록" },
  scrollExplore: { en: "SCROLL TO EXPLORE", "zh-Hant": "向下探索更多", "zh-Hans": "向下探索更多", ko: "아래로 내려 더 둘러보기" },
  readNext: { en: "CONTINUE DOWN", "zh-Hant": "繼續往下探索", "zh-Hans": "继续向下探索", ko: "아래로 계속 탐색" },
} satisfies Record<string, Copy>;

function NextSection({ href, locale, label = copy.readNext }: { href: string; locale: Locale; label?: Copy }) {
  return <a className="reboot-next" href={href}><ArrowDown aria-hidden="true" /><span>{c(locale, label)}</span></a>;
}

export default function HomeRedesign() {
  const { locale } = useLanguage();
  const img = "/genesis-core.webp";
  const [saleStatus, setSaleStatus] = useState<HomeSaleStatus | null>(null);
  const [statusUnavailable, setStatusUnavailable] = useState(false);
  useEffect(() => {
    let active = true;
    const refreshStatus = async () => {
      try {
        const status = await api<HomeSaleStatus>("rvyn/status");
        if (!active) return;
        setSaleStatus(status);
        setStatusUnavailable(false);
      } catch {
        if (!active) return;
        setSaleStatus(null);
        setStatusUnavailable(true);
      }
    };
    void refreshStatus();
    const timer = window.setInterval(() => void refreshStatus(), 30000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  const presaleOpen = saleStatus?.purchasesOpen === true;
  const whitelistOpen = !presaleOpen && saleStatus?.registryOpen === true;
  const saleStatusText = presaleOpen ? copy.presaleOpen
    : whitelistOpen ? copy.whitelistOpen
    : statusUnavailable ? copy.statusUnavailable
    : !saleStatus ? copy.statusChecking
    : saleStatus.phase === "sale_closed" ? copy.presaleClosed
    : saleStatus.phase === "sale_open" ? copy.presaleChecking
    : saleStatus.registrationStatus === "scheduled" ? copy.whitelistScheduled
    : saleStatus.registrationStatus === "closed" ? copy.whitelistClosed
    : copy.whitelistPreparing;
  const stageTone = presaleOpen || whitelistOpen ? "open" : saleStatus || statusUnavailable ? "closed" : "checking";
  const whitelistAction = whitelistOpen ? copy.joinWhitelist : copy.checkWhitelist;
  return (
    <main className="home-reboot" lang={locale}>
      <section className="reboot-hero" aria-labelledby="reboot-title">
        <HomeHeroMedia />
        <HeroHud />
        <HeroParallax />
        <div className="reboot-hero__copy">
          <div className="reboot-hero__eyebrow"><span className="reboot-network-pill"><Image src="/robinhood-chain-feather-avatar.jpg" alt="" width={19} height={19} />{c(locale, copy.network)}</span><span className="reboot-release"><i />{c(locale, saleStatusText)}</span></div>
          <h1 className="reboot-hero__headline" id="reboot-title"><span>{c(locale, copy.headlineFirst)}</span><em>{c(locale, copy.headlineSecond)}</em></h1>
          <p className="reboot-hero__lead">{c(locale, copy.heroLead)}</p>
          <div className="reboot-actions reboot-actions--hero">
            <Link href="/rvyn#allowlist" className="reboot-button reboot-hero__whitelist"><span className="reboot-button__status"><i />{stageTone === "open" ? c(locale, copy.buttonStatusOpen) : stageTone === "checking" ? c(locale, copy.buttonStatusChecking) : c(locale, copy.buttonStatusPreparing)}</span><span className="reboot-button__content"><ShieldCheck className="home-cta-mark" /><span className="reboot-button__label">{c(locale, whitelistAction)}</span></span><ArrowRight className="home-cta-arrow" /></Link>
            <Link href="/launchpad" className="reboot-button reboot-hero__secondary reboot-hero__secondary--launch"><span className="reboot-button__content"><Rocket className="home-cta-mark" /><span className="reboot-button__label">{c(locale, copy.create)}</span></span><ArrowRight className="home-cta-arrow" /></Link>
            <Link href="/onchain-record" className="reboot-button reboot-hero__secondary reboot-hero__secondary--record"><span className="reboot-button__content"><Orbit className="home-cta-mark" /><span className="reboot-button__label">{c(locale, copy.onchainRecords)}</span></span><ArrowRight className="home-cta-arrow" /></Link>
          </div>
        </div>
        <TelemetryRail label="ROVYN CORE" cells={[
          { key: "net", label: copy.telNet, value: "Robinhood Chain · 4663" },
          { key: "supply", label: copy.telSupply, value: "10,000,000 RVYN" },
          { key: "stage", label: copy.telStage, value: saleStatusText, live: stageTone === "open" },
          { key: "game", label: copy.telGame, value: copy.specGame },
        ]} />
        <a className="reboot-scroll" href="#reboot-flow" aria-label={c(locale, copy.scrollExplore)}><ArrowDown size={30} /></a>
      </section>
      <SectorTag n="01" label={copy.secStatus} aside="LIVE" />
      <PresaleConsole variant="home" />
      <SectorTag n="02" label={copy.secOrigin} aside="SIGNAL" />
      <ConstellationStory selectionHint={c(locale, copy.chooseSignal)} eyebrow={c(locale, copy.chapter)} title={c(locale, copy.processTitle)} lead={c(locale, copy.processLead)} nextLabel={c(locale, copy.scrollExplore)} steps={[
        { n: "01", title: c(locale, copy.stageOne), body: c(locale, copy.stageOneBody) },
        { n: "02", title: c(locale, copy.stageTwo), body: c(locale, copy.stageTwoBody) },
        { n: "03", title: c(locale, copy.stageThree), body: c(locale, copy.stageThreeBody) },
        { n: "04", title: c(locale, copy.stageFour), body: c(locale, copy.stageFourBody) },
      ]} />

      <SectorTag n="03" label={copy.secRecords} aside="4663" />
      <div className="reboot-featured" id="reboot-launches"><HomeFeatured /><NextSection href="#reboot-roadmap" locale={locale} /><span className="reboot-divider-signal" aria-hidden="true" /></div>

      <SectorTag n="04" label={copy.secRoadmap} aside="NEXT" />
      <div className="reboot-roadmap" id="reboot-roadmap">
        <HomeRoadmap />
        <div className="reboot-roadmap-separator reboot-roadmap-separator--end">
          <a className="reboot-roadmap-separator__arrow" href="#reboot-final" aria-label={c(locale, copy.readNext)}><ArrowDown aria-hidden="true" /></a>
          <span aria-hidden="true" />
        </div>
      </div>

      <SectorTag n="05" label={copy.secLaunch} aside="GO" />
      <section className="reboot-final" id="reboot-final">
        <Image className="reboot-final__crystal" src={img} alt="" width={900} height={900} loading="lazy" unoptimized />
        <div className="reboot-final__flare" aria-hidden="true" />
        <span className="reboot-kicker">ROVYN CORE / ONCHAIN STUDIO</span>
        <h2>{c(locale, copy.finalTitle)}</h2>
        <p>{c(locale, copy.finalText)}</p>
        <div className="reboot-actions">
          <Link href="/onchain-record" className="reboot-button reboot-button--lime">{c(locale, copy.explore)} <ArrowUpRight size={16} /></Link>
          <Link href="/launchpad" className="reboot-button reboot-button--glass">{c(locale, copy.create)} <ArrowRight size={16} /></Link>
        </div>
      </section>
    </main>
  );
}
