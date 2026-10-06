"use client";
import { ShieldAlert } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { legalCopy } from "@/lib/legal-copy";
import { OWNER } from "@/packages/web3/config";
import { ReadingNav } from "@/components/workflow-motion";
import { Address, type Copy4 } from "@/components/rv/ui";

const q = (en: string, zhHant: string, zhHans: string, ko: string): Copy4 => ({ en, "zh-Hant": zhHant, "zh-Hans": zhHans, ko });
const contentsLabel = q("On this page", "本頁目錄", "本页目录", "페이지 목차");
const shortTitle = q("In short", "重點摘要", "重点摘要", "요약");
const shortNote = q("This summary does not replace the full terms below.", "此摘要不取代下方完整條款。", "此摘要不取代下方完整条款。", "이 요약은 아래 전체 약관을 대신하지 않습니다.");
const adminLabel = q("Administrator wallet", "管理錢包", "管理钱包", "관리 지갑");
// Plain-language summary of the full terms (lib/legal-copy.ts). Keep it in step with those terms.
const SUMMARY: Copy4[] = [
  q("ROVYN CORE is an independent project run by the ROVYN CORE team. It is not a Robinhood product.", "ROVYN CORE 是由 ROVYN CORE 團隊營運的獨立項目，不是 Robinhood 的產品。", "ROVYN CORE 是由 ROVYN CORE 团队运营的独立项目，不是 Robinhood 的产品。", "ROVYN CORE는 ROVYN CORE 팀이 운영하는 독립 프로젝트이며 Robinhood 제품이 아닙니다."),
  q("RVYN is planned as the currency of a game that is still in development. It has no in-game use yet and promises no returns.", "RVYN 規劃為仍在開發中的遊戲貨幣，目前沒有遊戲內用途，也不承諾任何報酬。", "RVYN 规划为仍在开发中的游戏货币，目前没有游戏内用途，也不承诺任何回报。", "RVYN은 개발 중인 게임의 화폐로 계획되어 있으며 아직 게임 내 용도가 없고 수익을 약속하지 않습니다."),
  q("The presale has no date. Only whitelisted wallets can buy, RVYN is claimed after settlement, and there are no refunds.", "預售沒有日期。只有白名單錢包能購買，RVYN 在結算後領取，沒有退款。", "预售没有日期。只有白名单钱包能购买，RVYN 在结算后领取，没有退款。", "프리세일 일정은 없습니다. 화이트리스트 지갑만 구매할 수 있고 RVYN은 정산 후 클레임하며 환불은 없습니다."),
  q("The contracts have not been independently audited. Bugs may exist and funds can be lost.", "合約未經獨立審計，可能存在漏洞，資金可能損失。", "合约未经独立审计，可能存在漏洞，资金可能损失。", "계약은 독립 감사를 받지 않았습니다. 버그가 있을 수 있고 자금을 잃을 수 있습니다."),
  q("The sale is controlled by a 2-of-3 Safe multisig; platform administration uses a single wallet.", "預售由 3 取 2 的 Safe 多簽控制；平台管理使用單一錢包。", "预售由 3 取 2 的 Safe 多签控制；平台管理使用单一钱包。", "판매는 3 중 2 Safe 멀티시그가 관리하며 플랫폼 관리는 단일 지갑을 사용합니다."),
  q("We never ask for private keys or seed phrases. Only trust rovyncore.com and @RovynCORE on X.", "我們不會索取私鑰或助記詞。請只信任 rovyncore.com 與 X 上的 @RovynCORE。", "我们不会索取私钥或助记词。请只信任 rovyncore.com 与 X 上的 @RovynCORE。", "개인 키나 시드 문구는 절대 요구하지 않습니다. rovyncore.com과 X의 @RovynCORE만 신뢰하세요."),
];

/** Breaks a long legal paragraph into groups of about three sentences so it can be read. */
function paragraphs(body: string) {
  // Latin sentences end at ". " (so "0.0001" and "rovyncore.net" stay intact); CJK ones at a full-width stop.
  const sentences = body.split(/(?<=[。！？])\s*|(?<=[.!?])\s+/u).filter(Boolean);
  const joiner = /[぀-鿿가-힯]/u.test(body) && !/[a-z]{4,} [a-z]{4,}/.test(body) ? "" : " ";
  const groups: string[] = [];
  for (let i = 0; i < sentences.length; i += 3) groups.push(sentences.slice(i, i + 3).join(joiner));
  return groups;
}

export default function Legal() {
  const { locale } = useLanguage();
  const copy = legalCopy[locale];
  const t = (c: Copy4) => c[locale];
  return (
    <main>
      <section className="rv-pagehead">
        <div className="rv-container rv-pagehead__copy">
          <span className="rv-eyebrow">ROVYN CORE</span>
          <h1 className="rv-h1">{copy.title}</h1>
        </div>
      </section>
      <section className="rv-section--tight" style={{ paddingTop: 0 }}>
        <div className="rv-container rv-split rv-legal">
          <aside className="rv-stack rv-sticky" style={{ ["--gap" as string]: "18px" }}>
            <ReadingNav className="rv-legal-nav" label={t(contentsLabel)}>
              {copy.sections.map(([title], index) => <a key={title} href={`#legal-section-${index + 1}`}>{String(index + 1).padStart(2, "0")} · {title}</a>)}
            </ReadingNav>
            <div className="rv-stack" style={{ ["--gap" as string]: "8px" }}>
              <a className="rv-link" style={{ justifySelf: "start" }} href="https://x.com/RovynCORE" target="_blank" rel="noreferrer">@RovynCORE ↗</a>
              <span className="rv-stat__label">{t(adminLabel)}</span>
              <Address value={OWNER} locale={locale} />
            </div>
          </aside>
          <div className="rv-stack" style={{ ["--gap" as string]: "40px" }}>
            <div className="rv-card rv-card--accent rv-stack" style={{ ["--gap" as string]: "14px" }}>
              <h2 className="rv-h3">{t(shortTitle)}</h2>
              <ul className="rv-stack" style={{ ["--gap" as string]: "10px", margin: 0, paddingLeft: 18 }}>
                {SUMMARY.map((item) => <li className="rv-small" key={item.en}>{t(item)}</li>)}
              </ul>
              <div className="rv-notice rv-notice--risk"><ShieldAlert aria-hidden="true" /><span>{t(shortNote)}</span></div>
            </div>
            {copy.sections.map(([title, body], index) => (
              <section key={title} id={`legal-section-${index + 1}`} aria-labelledby={`legal-title-${index + 1}`} className="rv-stack" style={{ ["--gap" as string]: "14px", paddingTop: 28, borderTop: "1px solid var(--rv-line)" }}>
                <span className="rv-eyebrow">{String(index + 1).padStart(2, "0")}</span>
                <h2 className="rv-h3" id={`legal-title-${index + 1}`} style={{ fontSize: 22 }}>{title}</h2>
                {paragraphs(body).map((p, i) => <p className="rv-body" key={i} style={{ maxWidth: "72ch" }}>{p}</p>)}
              </section>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
