"use client";

import { Check, ExternalLink, LoaderCircle, Wallet, X } from "lucide-react";
import { formatEther } from "viem";
import { useLanguage } from "@/components/language-provider";
import { EXPLORER, KIND, type Nft } from "@/lib/lightdive";
import { ATTRIBUTE, BEAM, KIND_NAME, RARITY, RARITY_COLOR, SIGNATURE, type Copy } from "@/lib/lightdive-copy";
import { G } from "@/lib/lightdive-game-copy";
import { NftArt } from "./art";
import type { TxState } from "./use-game";

export function useT() {
  const { locale } = useLanguage();
  return { t: (v: Copy) => v[locale], locale };
}

/** Fills {name} placeholders. */
export function fill(text: string, values: Record<string, string | number>) {
  return text.replace(/\{(\w+)\}/g, (_, k) => String(values[k] ?? ""));
}

export function rvyn(v: bigint, digits = 2) {
  return Number(formatEther(v)).toLocaleString(undefined, { maximumFractionDigits: digits });
}

export function dust(points: bigint) {
  return (Number(points) / 10_000).toLocaleString(undefined, { maximumFractionDigits: 1 });
}

export function nftName(t: (v: Copy) => string, n: Nft) {
  const a = n.attributes;
  return t(KIND_NAME[a.kind]); // spire and prism special editions were removed (PR #2)
}

export function nftTrait(t: (v: Copy) => string, n: Nft) {
  const a = n.attributes;
  if (a.kind === KIND.spire) return `Lv.${a.trait}`;
  if (a.kind === KIND.prism) return t(BEAM[a.trait]);
  return t(ATTRIBUTE[a.trait]);
}

export const MAX_VOYAGES = [120, 30, 10];

export function NftCard({ n, onClick, selected, badge, compact, disabled }: {
  n: Nft; onClick?: () => void; selected?: boolean; badge?: string; compact?: boolean; disabled?: boolean;
}) {
  const { t } = useT();
  const a = n.attributes;
  const voyagePct = Math.min(100, (a.voyagesLeft / MAX_VOYAGES[a.kind]) * 100);
  const Tag = onClick ? "button" : "article";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      className={`ldg-nft${selected ? " is-selected" : ""}${compact ? " is-compact" : ""}${a.rarity === 4 ? " is-radiant" : ""}`}
      style={{ ["--rc" as string]: RARITY_COLOR[a.rarity] }}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={onClick ? selected : undefined}
    >
      <NftArt a={a} className="ldg-nft__art" />
      <span className="ldg-nft__rarity">{t(RARITY[a.rarity])}</span>
      {badge && <span className="ldg-nft__badge">{badge}</span>}
      {selected && <span className="ldg-nft__check"><Check aria-hidden="true" /></span>}
      <span className="ldg-nft__body">
        <span className="ldg-nft__name">{nftName(t, n)} <span className="ldg-mono">#{String(n.id)}</span></span>
        <span className="ldg-nft__meta">
          <span>{nftTrait(t, n)}</span>
          <span>✦ {a.luminance}</span>
        </span>
        {!compact && (
          <span className="ldg-nft__voyages" title={`${t(G.voyagesLeft)} ${a.voyagesLeft}`}>
            <i style={{ width: `${voyagePct}%` }} />
            <small>{t(G.voyagesLeft)} {a.voyagesLeft}</small>
          </span>
        )}
        {a.variant > 0 && a.kind === KIND.seeker && !compact && <span className="ldg-chip">{t(G.signature)} · {t(SIGNATURE[a.variant - 1])}</span>}
      </span>
    </Tag>
  );
}

export type Mood = "idle" | "active" | "alert" | "dim";

/** The Signal-Keeper, the observatory's NPC. Its eye, chest core and orbit react to the game state. */
export function Keeper({ line, mood = "idle", action }: { line: string; mood?: Mood; action?: React.ReactNode }) {
  const { t } = useT();
  return (
    <section className={`ldg-keeper is-${mood}`} aria-live="polite">
      <div className="ldg-keeper__figure" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/lightdive/keeper-portrait.webp" alt="" width={640} height={953} />
        <span className="ldg-keeper__eye" />
        <span className="ldg-keeper__core" />
        <svg className="ldg-keeper__orbit" viewBox="0 0 100 40">
          <ellipse cx="50" cy="20" rx="46" ry="11" />
          <ellipse cx="50" cy="22" rx="40" ry="9" />
          <circle className="ldg-keeper__orb" r="2.6" cx="96" cy="20" />
          <circle className="ldg-keeper__orb ldg-keeper__orb--b" r="2.2" cx="10" cy="22" />
        </svg>
      </div>
      <div className="ldg-keeper__speech">
        <span className="ldg-keeper__who">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/lightdive/keeper-face.webp" alt="" width={36} height={36} />
          <span><b>{t(G.keeperName)}</b><small>{t(G.keeperRole)}</small></span>
        </span>
        <p>{line}</p>
        {action && <div className="ldg-keeper__action">{action}</div>}
      </div>
    </section>
  );
}

export function TxPanel({ tx, onClose }: { tx: TxState; onClose: () => void }) {
  const { t } = useT();
  return (
    <div className="ldg-tx" role="dialog" aria-modal="true" aria-labelledby="ldg-tx-title">
      <div className="ldg-tx__card">
        <header>
          <h2 id="ldg-tx-title"><Wallet aria-hidden="true" />{t(G.txTitle)}</h2>
          {!tx.running && <button type="button" className="ldg-icon" onClick={onClose} aria-label={t(G.txClose)}><X aria-hidden="true" /></button>}
        </header>
        <ol>
          {tx.steps.map((s, i) => (
            <li key={i} className={`is-${s.status}`}>
              <span className="ldg-tx__dot" aria-hidden="true">
                {s.status === "done" ? <Check /> : s.status === "failed" ? <X /> : s.status === "wallet" || s.status === "pending" ? <LoaderCircle className="ldg-spin" /> : i + 1}
              </span>
              <span>
                <b>{t(s.label)}</b>
                <small>{t({ queued: G.txQueued, wallet: G.txWallet, pending: G.txPending, done: G.txDone, failed: G.txFailed }[s.status])}</small>
              </span>
              {s.hash && EXPLORER && (
                <a href={`${EXPLORER}/tx/${s.hash}`} target="_blank" rel="noreferrer" className="ldg-icon" aria-label={t(G.viewExplorer)}><ExternalLink aria-hidden="true" /></a>
              )}
            </li>
          ))}
        </ol>
        {tx.error && <p className="ldg-tx__error" role="alert">{t(tx.error)}</p>}
        {!tx.running && <button type="button" className="rv-btn rv-btn--secondary rv-btn--block" onClick={onClose}>{t(G.txClose)}</button>}
      </div>
    </div>
  );
}

export function Stat({ label, value, unit, tone, children }: { label: string; value: React.ReactNode; unit?: string; tone?: "warn" | "ok"; children?: React.ReactNode }) {
  return (
    <div className={`ldg-stat${tone ? ` is-${tone}` : ""}`}>
      <span className="ldg-stat__label">{label}</span>
      <strong className="ldg-stat__value">{value}{unit && <small> {unit}</small>}</strong>
      {children}
    </div>
  );
}

export function SectionHead({ kicker, title, lead, action }: { kicker: string; title: string; lead?: string; action?: React.ReactNode }) {
  return (
    <header className="ldg-head">
      <div>
        <span className="rv-eyebrow">{kicker}</span>
        <h2 className="rv-h2">{title}</h2>
        {lead && <p className="rv-lead">{lead}</p>}
      </div>
      {action}
    </header>
  );
}
