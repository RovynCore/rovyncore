"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Minus, Plus, Sparkles } from "lucide-react";
import { maxUint256, type Abi } from "viem";
import { ABI, ERC20_ABI, KIND, mintedIn, type Contracts, type MintRequest, type Nft } from "@/lib/lightdive";
import { KIND_NAME, RARITY, RARITY_COLOR } from "@/lib/lightdive-copy";
import { A, G } from "@/lib/lightdive-game-copy";
import { KindArt, NftArt } from "./art";
import type { Derived, Game, View } from "./game";
import { Starfield } from "./scene";
import { sfx } from "./sound";
import { countdown } from "./use-game";
import { fill, nftName, nftTrait, rvyn, useT } from "./ui";

const MAX_PER_TX = [3, 5, 10];
const DECK_SIZE = [3000, 6000, 10000];
const EARLY_WINDOW = 48 * 3600;
const PORTAL = ["#c9ff55", "#7fd3ff", "#e8c46a"];

export function Summon({ g, d, c, go }: { g: Game; d: Derived; c: Contracts; go: (v: View) => void }) {
  const { t } = useT();
  const o = g.data.overview!;
  const p = g.data.player;
  const [kind, setKind] = useState<number>(KIND.seeker);
  const [qty, setQty] = useState(1);
  const [reveal, setReveal] = useState<Nft[] | null>(null);
  const [charging, setCharging] = useState(false);

  const deck = o.decks[kind];
  const price = o.prices[kind];
  const discount = p && !p.firstMintUsed[kind] ? (price * BigInt(o.firstDiscountBp)) / 10_000n : 0n;
  const total = price * BigInt(qty) - discount;
  const saleStart = Number(o.spireSaleStart);
  const spireOpen = saleStart > 0 && saleStart <= g.now;
  const early = kind === KIND.spire && spireOpen && g.now < saleStart + EARLY_WINDOW;
  const earlyLeft = early ? Math.max(0, 3 - (p?.earlySpires ?? 0)) : MAX_PER_TX[kind];
  const maxQty = Math.max(1, Math.min(MAX_PER_TX[kind], earlyLeft));
  const capped = kind !== KIND.seeker;
  const full = capped && o.alive[kind] + qty > o.maxAlive[kind];
  const short = p ? p.rvyn < total : false;
  const blocked =
    !d.connected ? null
    : kind === KIND.spire && !spireOpen ? t(G.saleNotOpen)
    : early && earlyLeft === 0 ? fill(t(G.earlyLimit), { n: p?.earlySpires ?? 0 })
    : full ? t(G.soldOut)
    : short ? t(G.notEnough)
    : o.paused.minter ? t(G.paused)
    : !o.slotScheduled ? t(G.signalOff)
    : null;

  const summon = async () => {
    if (!p) return;
    sfx.summon();
    setCharging(true);
    const steps = [];
    if (p.allowance < total) steps.push({ label: G.stepApproveRvyn, address: c.rvyn, abi: ERC20_ABI as unknown as Abi, functionName: "approve", args: [c.minter, maxUint256] });
    steps.push({ label: G.stepDraw, address: c.minter, abi: ABI.LightdiveMinter, functionName: "requestMint", args: [kind, qty] });
    const ok = await g.run(steps);
    setCharging(false);
    if (ok) setQty(1);
    else sfx.fail();
  };

  const open = async (r: MintRequest) => {
    const receipts = await g.run([{ label: G.stepOpen, address: c.minter, abi: ABI.LightdiveMinter, functionName: "fulfill", args: [r.id] }]);
    if (receipts && g.account) {
      g.closeTx();
      sfx.summon();
      setReveal(await mintedIn(g.client, c, receipts[0], g.account));
    } else sfx.fail();
  };

  const pending = g.data.requests.filter((r) => !r.fulfilled);

  return (
    <div className="ldg-summon">
      <div className="ldg-summon__stage" style={{ ["--pc" as string]: PORTAL[kind] }}>
        <Starfield />
        <div className="ldg-altars" role="tablist" aria-label={t(A.summonTitle)}>
          {[KIND.spire, KIND.prism, KIND.seeker].map((k) => (
            <button key={k} type="button" role="tab" aria-selected={kind === k} className={`ldg-altar${kind === k ? " is-on" : ""}`} style={{ ["--pc" as string]: PORTAL[k] }} onClick={() => { sfx.click(); setKind(k); setQty(1); }}>
              <KindArt kind={k} className="ldg-altar__art" />
              <b>{t(KIND_NAME[k])}</b>
              <span>{rvyn(o.prices[k], 0)} RVYN</span>
            </button>
          ))}
        </div>

        <div className={`ldg-portal${charging ? " is-charging" : ""}`} aria-hidden="true">
          <span className="ldg-portal__ring r1" />
          <span className="ldg-portal__ring r2" />
          <span className="ldg-portal__ring r3" />
          <span className="ldg-portal__core" />
          <KindArt kind={kind} className="ldg-portal__art" />
        </div>
        <p className="ldg-portal__caption">{t(G.kindRole[kind])}</p>
      </div>

      <div className="ldg-summon__panel">
        <section className="ldg-card-panel">
          <header>
            <h2>{t(A.summonTitle)}</h2>
            <p className="ldg-dim ldg-small">{t(A.summonLead)}</p>
          </header>
          <div className="ldg-deckbar"><i style={{ width: `${(deck.remaining / DECK_SIZE[kind]) * 100}%` }} /></div>
          <p className="ldg-dim ldg-small">{fill(t(G.deckProgress), { n: deck.number, left: deck.remaining.toLocaleString(), size: DECK_SIZE[kind].toLocaleString() })}</p>
          <ul className="ldg-odds">
            {deck.rarityLeft.map((left, r) => {
              const pct = deck.remaining ? (left / deck.remaining) * 100 : 0;
              return (
                <li key={r} style={{ ["--rc" as string]: RARITY_COLOR[r] }}>
                  <span className="ldg-odds__name"><i />{t(RARITY[r])}</span>
                  <span className="ldg-odds__bar"><i style={{ width: `${Math.max(pct, 0.6)}%` }} /></span>
                  <b className="ldg-mono">{pct.toFixed(2)}%</b>
                </li>
              );
            })}
          </ul>
          <p className="ldg-dim ldg-small">
            {[
              kind === KIND.seeker ? fill(t(G.signaturesLeft), { n: deck.signatureLeft }) : null,
              kind === KIND.prism ? t(G.beamSplit) : null,
              capped ? fill(t(G.liveCap), { a: o.alive[kind].toLocaleString(), b: o.maxAlive[kind].toLocaleString() }) : null,
            ].filter(Boolean).join(" · ")}
          </p>
        </section>

        <section className="ldg-card-panel ldg-buy">
          <div className="ldg-qty">
            <span>{t(G.quantity)}</span>
            <div>
              <button type="button" className="ldg-icon" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} aria-label="−"><Minus aria-hidden="true" /></button>
              <output className="ldg-mono" aria-live="polite">{qty}</output>
              <button type="button" className="ldg-icon" onClick={() => setQty((q) => Math.min(maxQty, q + 1))} disabled={qty >= maxQty} aria-label="+"><Plus aria-hidden="true" /></button>
            </div>
          </div>
          <dl className="ldg-kv">
            <div><dt>{t(G.unitPrice)}</dt><dd>{rvyn(price, 0)} RVYN</dd></div>
            {discount > 0n && <div className="is-good"><dt>{fill(t(G.firstOff), { kind: t(KIND_NAME[kind]) })}</dt><dd>−{rvyn(discount)}</dd></div>}
            <div className="is-total"><dt>{t(G.total)}</dt><dd>{rvyn(total)} RVYN</dd></div>
            {p && <div><dt>{t(G.afterDraw)}</dt><dd className={short ? "is-bad" : ""}>{short ? "—" : rvyn(p.rvyn - total)}</dd></div>}
          </dl>
          {early && <p className="ldg-dim ldg-small">{fill(t(G.earlyLimit), { n: p?.earlySpires ?? 0 })}</p>}
          {!d.connected ? (
            <button type="button" className="ldg-summon-btn" onClick={() => void g.join()}>{t(G.connect)}</button>
          ) : (
            <button type="button" className="ldg-summon-btn" disabled={!!blocked || !!g.tx?.running} onClick={() => void summon()} style={{ ["--pc" as string]: PORTAL[kind] }}>
              <Sparkles aria-hidden="true" />{blocked ?? fill(t(A.summonBtn), { n: qty })}
            </button>
          )}
          <p className="ldg-dim ldg-small">{t(G.howDraw)} {t(G.split)}</p>
        </section>

        {pending.length > 0 && (
          <section className="ldg-card-panel">
            <h3 className="ldg-sub">{t(A.pending)}</h3>
            <ul className="ldg-crystals">
              {pending.map((r) => {
                const opensAt = (Number(r.slot) + 1) * 60; // the request slot's randomness is revealed when the minute ends
                const left = opensAt - g.now;
                const pct = r.ready ? 100 : Math.max(4, Math.min(96, 100 - (left / 60) * 100));
                return (
                  <li key={String(r.id)} className={r.ready ? "is-ready" : ""} style={{ ["--pc" as string]: PORTAL[r.kind], ["--pct" as string]: `${pct}%` }}>
                    <span className="ldg-crystal" aria-hidden="true"><KindArt kind={r.kind} /></span>
                    <span className="ldg-crystals__text">
                      <b>{t(KIND_NAME[r.kind])} × {r.qty}</b>
                      <small>{r.ready ? t(A.charged) : left > 0 ? fill(t(A.chargedIn), { t: countdown(left) }) : t(A.charging)}</small>
                    </span>
                    {r.ready && <button type="button" className="rv-btn rv-btn--primary rv-btn--sm" disabled={!!g.tx?.running} onClick={() => void open(r)}><Sparkles aria-hidden="true" />{t(G.openDraw)}</button>}
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>

      {reveal && <Reveal cards={reveal} onClose={() => setReveal(null)} onHangar={() => { setReveal(null); go("plain"); }} />}
    </div>
  );
}

/** Opening ceremony: a portal burst, then the cards flip one by one. Skippable. */
function Reveal({ cards, onClose, onHangar }: { cards: Nft[]; onClose: () => void; onHangar: () => void }) {
  const { t } = useT();
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (shown >= cards.length) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => {
      sfx.reveal(cards[shown].attributes.rarity);
      setShown((s) => s + 1);
    }, reduce ? 0 : shown === 0 ? 900 : 700);
    return () => window.clearTimeout(timer);
  }, [shown, cards]);
  const best = cards.reduce((m, n) => Math.max(m, n.attributes.rarity), 0);
  const done = shown >= cards.length;
  return (
    <div className="ldg-reveal" role="dialog" aria-modal="true" aria-labelledby="ldg-reveal-title" style={{ ["--rc" as string]: RARITY_COLOR[best] }}>
      <span className="ldg-reveal__burst" aria-hidden="true" />
      <div className="ldg-reveal__inner">
        <h2 id="ldg-reveal-title" className="rv-h2">{t(G.revealTitle)}</h2>
        <div className={`ldg-reveal__grid${cards.length === 1 ? " is-single" : ""}`}>
          {cards.map((n, i) => (
            <div key={String(n.id)} className={`ldg-flip${i < shown ? " is-open" : ""} r${n.attributes.rarity}`} style={{ ["--rc" as string]: RARITY_COLOR[n.attributes.rarity], ["--i" as string]: i }} onClick={() => setShown((s) => Math.max(s, i + 1))}>
              <div className="ldg-flip__back"><KindArt kind={n.attributes.kind} /></div>
              <div className="ldg-flip__front">
                <NftArt a={n.attributes} />
                <span className="ldg-flip__stars">{"★".repeat(n.attributes.rarity + 1)}</span>
                <span className="ldg-flip__rarity">{t(RARITY[n.attributes.rarity])}</span>
                <span className="ldg-flip__name">{nftName(t, n)} · {nftTrait(t, n)}</span>
                <span className="ldg-mono ldg-dim">✦ {n.attributes.luminance} · #{String(n.id)}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="ldg-reveal__actions">
          {!done ? (
            <button type="button" className="rv-btn rv-btn--secondary" onClick={() => setShown(cards.length)}>{t(G.skip)}</button>
          ) : (
            <>
              <button type="button" className="rv-btn rv-btn--secondary" onClick={onClose}>{t(G.close)}</button>
              <button type="button" className="rv-btn rv-btn--primary" onClick={onHangar}>{t(A.hangarTitle)}<ArrowRight aria-hidden="true" /></button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
