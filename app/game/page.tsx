"use client";

import Image from "next/image";
import { ArrowUpRight, Eye, Recycle, Scale, Sparkles } from "lucide-react";
import Link from "@/components/site-link";
import { useLanguage } from "@/components/language-provider";
import { Head, type Copy4 } from "@/components/rv/ui";

// Only confirmed facts and our design commitments. Lightdive is open on the testnet (10-15); the mainnet launch has no date.
const q = (en: string, zhHant: string, zhHans: string, ko: string): Copy4 => ({ en, "zh-Hant": zhHant, "zh-Hans": zhHans, ko });
const T = {
  eyebrow: q("First game", "第一款遊戲", "第一款游戏", "첫 게임"),
  title: q("A world is being built. RVYN sits at its core.", "一個世界正在打造，RVYN 位於它的核心。", "一个世界正在打造，RVYN 位于它的核心。", "세계가 만들어지고 있고, 그 중심에 RVYN이 있습니다."),
  lead: q("Lightdive is a card expedition game on Robinhood Chain, played with RVYN. The testnet version is open: anyone can play it now with test tokens that have no value. The contracts are not audited.", "潛光遠征是 Robinhood Chain 上的卡牌遠征遊戲，用 RVYN 遊玩。測試網版本已經開放：現在任何人都能用沒有價值的測試幣試玩。合約尚未經過審計。", "潜光远征是 Robinhood Chain 上的卡牌远征游戏，用 RVYN 游玩。测试网版本已经开放：现在任何人都能用没有价值的测试币试玩。合约尚未经过审计。", "라이트다이브(潛光遠征)는 Robinhood Chain의 카드 원정 게임으로, RVYN으로 플레이합니다. 테스트넷 버전이 열렸습니다. 지금 누구나 가치 없는 테스트 토큰으로 플레이할 수 있습니다. 컨트랙트는 감사를 받지 않았습니다."),
  status: q("Testnet open", "測試網開放中", "测试网开放中", "테스트넷 오픈"),
  play: q("Play Lightdive (testnet)", "開始玩潛光遠征（測試網）", "开始玩潜光远征（测试网）", "라이트다이브 플레이(테스트넷)"),
  follow: q("Follow @RovynCORE for updates", "在 X 追蹤 @RovynCORE 掌握更新", "在 X 关注 @RovynCORE 掌握更新", "X에서 @RovynCORE 팔로우하고 소식 받기"),
  rvyn: q("About RVYN", "認識 RVYN", "认识 RVYN", "RVYN 알아보기"),
  prEyebrow: q("Design principles", "設計原則", "设计原则", "설계 원칙"),
  prTitle: q("What we are designing toward.", "我們設計的方向。", "我们设计的方向。", "우리가 지향하는 설계."),
  prLead: q("These are commitments for the design, not features that exist today.", "這些是設計上的承諾，不是目前已存在的功能。", "这些是设计上的承诺，不是目前已存在的功能。", "현재 존재하는 기능이 아니라 설계에 대한 약속입니다."),
  p1: q("RVYN at the center", "以 RVYN 為核心", "以 RVYN 为核心", "RVYN 중심"),
  p1b: q("RVYN is planned as the game's core currency, so the economy is designed around one token rather than many.", "RVYN 規劃為遊戲的核心貨幣，經濟圍繞單一代幣設計，而不是很多種。", "RVYN 规划为游戏的核心货币，经济围绕单一代币设计，而不是很多种。", "RVYN은 게임의 핵심 화폐로 계획되어 있어 여러 토큰이 아니라 하나의 토큰을 중심으로 경제를 설계합니다."),
  p2: q("Things to spend on, not only rewards", "有花費的去處，不只是獎勵", "有花费的去处，不只是奖励", "보상만이 아닌 쓸 곳"),
  p2b: q("An economy that only pays out does not last. We are designing uses for RVYN inside the game, with limits, before any rewards.", "只發放獎勵的經濟撐不久。我們會先設計 RVYN 在遊戲內的用途與上限，再談獎勵。", "只发放奖励的经济撑不久。我们会先设计 RVYN 在游戏内的用途与上限，再谈奖励。", "지급만 하는 경제는 오래가지 못합니다. 보상보다 먼저 게임 안에서 RVYN의 쓰임과 한도를 설계합니다."),
  p3: q("Checkable where it matters", "重要的部分可以查證", "重要的部分可以查证", "중요한 부분은 확인 가능"),
  p3b: q("Parts that involve value will be onchain or published, so players can check them the same way they can check RVYN today.", "牽涉價值的部分會上鏈或公開，玩家可以像今天查證 RVYN 一樣查證它們。", "牵涉价值的部分会上链或公开，玩家可以像今天查证 RVYN 一样查证它们。", "가치가 걸린 부분은 온체인에 두거나 공개해, 지금 RVYN을 확인하듯 확인할 수 있게 합니다."),
  p4: q("Fun first", "好玩優先", "好玩优先", "재미가 먼저"),
  p4b: q("A game has to be worth playing without the token. RVYN should add to it, not replace it.", "遊戲本身要值得玩；RVYN 是加分，不是取代。", "游戏本身要值得玩；RVYN 是加分，不是取代。", "토큰이 없어도 할 만한 게임이어야 합니다. RVYN은 그것을 대체하는 게 아니라 더해야 합니다."),
  noTag: q("Boundaries", "界線", "界线", "원칙의 경계"),
  noEyebrow: q("What we will not do", "我們不會做的事", "我们不会做的事", "하지 않을 것"),
  no1: q("Promise returns or price targets.", "承諾報酬或價格目標。", "承诺回报或价格目标。", "수익이나 가격 목표를 약속하지 않습니다."),
  no2: q("Announce features or dates before they are decided.", "在決定之前公布功能或日期。", "在决定之前公布功能或日期。", "결정되기 전에 기능이나 일정을 발표하지 않습니다."),
  no3: q("Sell in-game items before the game exists.", "在遊戲存在之前販售遊戲道具。", "在游戏存在之前贩售游戏道具。", "게임이 존재하기 전에 게임 아이템을 팔지 않습니다."),
  msEyebrow: q("Milestones", "里程碑", "里程碑", "마일스톤"),
  msTitle: q("How the game will appear, step by step.", "遊戲會一步步出現。", "游戏会一步步出现。", "게임이 단계적으로 공개되는 방식."),
  m1: q("Concept", "概念", "概念", "콘셉트"),
  m1b: q("World, genre and core loop are being decided.", "正在決定世界觀、類型與核心玩法。", "正在决定世界观、类型与核心玩法。", "세계관, 장르, 핵심 루프를 정하는 중."),
  m2: q("First look", "首次公開", "首次公开", "첫 공개"),
  m2b: q("Art and a short description of how it plays.", "美術與玩法簡介。", "美术与玩法简介。", "아트와 플레이 방식 소개."),
  m3: q("Economy paper", "經濟設計說明", "经济设计说明", "경제 설계 문서"),
  m3b: q("How RVYN moves through the game, published for review.", "公開 RVYN 在遊戲中如何流動，供大家檢視。", "公开 RVYN 在游戏中如何流动，供大家检视。", "게임 속 RVYN의 흐름을 공개해 검토받습니다."),
  m4: q("Playtest", "試玩", "试玩", "플레이테스트"),
  m4b: q("The testnet version, open to everyone, with test tokens.", "測試網版本，開放所有人用測試幣遊玩。", "测试网版本，开放所有人用测试币游玩。", "누구나 테스트 토큰으로 플레이할 수 있는 테스트넷 버전."),
  m5: q("Launch", "上線", "上线", "출시"),
  m5b: q("The first public version.", "第一個公開版本。", "第一个公开版本。", "첫 공개 버전."),
  now: q("Now", "目前", "当前", "현재"),
  msNote: q("The launch on mainnet has no date yet. It is announced on this page and on X when it is decided.", "正式網上線還沒有日期。決定後會公布在本頁與 X。", "正式网上线还没有日期。决定后会公布在本页与 X。", "메인넷 출시 일정은 아직 없습니다. 결정되면 이 페이지와 X에 공지합니다."),
};

/** Milestone in progress: the playtest (the open testnet). */
const CURRENT = 3;

export default function GamePage() {
  const { locale } = useLanguage();
  const t = (c: Copy4) => c[locale];
  const milestones: Array<[Copy4, Copy4]> = [[T.m1, T.m1b], [T.m2, T.m2b], [T.m3, T.m3b], [T.m4, T.m4b], [T.m5, T.m5b]];
  return (
    <main>
      <section className="rv-pagehead">
        <div className="rv-container rv-pagehead__inner">
          <div className="rv-pagehead__copy">
            <span className="rv-eyebrow">{t(T.eyebrow)}</span>
            <h1 className="rv-h1">{t(T.title)}</h1>
            <p className="rv-lead">{t(T.lead)}</p>
            <span className="rv-pill rv-pill--ok">{t(T.status)}</span>
            <div className="rv-row">
              <Link className="rv-btn rv-btn--primary" href="/game/lightdive">{t(T.play)}<ArrowUpRight aria-hidden="true" /></Link>
              <a className="rv-btn rv-btn--secondary" href="https://x.com/RovynCORE" target="_blank" rel="noreferrer">{t(T.follow)}</a>
              <Link className="rv-btn rv-btn--secondary" href="/rvyn">{t(T.rvyn)}</Link>
            </div>
          </div>
          <div className="rv-hero__art rv-pagehead__art"><Image src="/rv-core.webp" alt="" width={600} height={600} priority unoptimized /></div>
        </div>
      </section>

      <section className="rv-section rv-section--line">
        <div className="rv-container">
          <Head eyebrow={t(T.prEyebrow)} title={t(T.prTitle)} lead={t(T.prLead)} />
          <div className="rv-grid rv-grid--2">
            {([[Sparkles, T.p1, T.p1b], [Recycle, T.p2, T.p2b], [Eye, T.p3, T.p3b], [Scale, T.p4, T.p4b]] as const).map(([Icon, title, body]) => (
              <div className="rv-card rv-reveal" key={title.en}>
                <span className="rv-card__icon"><Icon aria-hidden="true" /></span>
                <h3 className="rv-h3">{t(title)}</h3>
                <p className="rv-small" style={{ marginTop: 8 }}>{t(body)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rv-section rv-section--line">
        <div className="rv-container rv-split">
          <div>
            <Head eyebrow={t(T.msEyebrow)} title={t(T.msTitle)} lead={t(T.msNote)} />
          </div>
          <ol className="rv-steps rv-steps--vertical">
            {milestones.map(([title, body], i) => (
              <li key={title.en} className={`rv-step${i === CURRENT ? " is-current" : ""}`}>
                <span className="rv-step__label">{String(i + 1).padStart(2, "0")}{i === CURRENT ? ` · ${t(T.now)}` : ""}</span>
                <span className="rv-step__title">{t(title)}</span>
                <span className="rv-step__meta">{t(body)}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="rv-section rv-section--line">
        <div className="rv-container--narrow">
          <Head eyebrow={t(T.noTag)} title={t(T.noEyebrow)} />
          <ol className="rv-numbered">
            <li><b>{t(T.no1)}</b></li>
            <li><b>{t(T.no2)}</b></li>
            <li><b>{t(T.no3)}</b></li>
          </ol>
        </div>
      </section>
    </main>
  );
}
