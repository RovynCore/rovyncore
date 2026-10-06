"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPublicClient, createWalletClient, custom, formatEther, http, maxUint256, type Abi, type Address } from "viem";
import { toast } from "sonner";
import { LoaderCircle, RefreshCw } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { usePlatform } from "@/components/platform-context";
import {
  ABI, CONTRACTS, ERC20_ABI, GAME_CHAIN, GAME_RPC, KIND, previewLuminance, diveSettleable,
  readDives, readMintRequests, readOverview, readPlayer, readTeams, readWalletNfts,
  type Contracts, type DiveRecord, type MintRequest, type Nft, type Overview, type PlayerState, type Team,
} from "@/lib/lightdive";
import {
  ATTRIBUTE, ATTRIBUTE_COLOR, BEAM, DEPTH, KIND_NAME, LOG_LINE, OUTCOME, RARITY, RARITY_COLOR, SIGNATURE,
  SPECIAL_PRISM, SPECIAL_SPIRE, T, type Copy,
} from "@/lib/lightdive-copy";
import "./lightdive.css";

const fmt = (v: bigint, digits = 2) =>
  Number(formatEther(v)).toLocaleString(undefined, { maximumFractionDigits: digits });
const MAX_PER_TX = [3, 5, 10];

/** Display-only coordinate for a depth on a given day; its attribute rotates daily (the "Anomaly"). */
function coordinate(day: number, depth: number) {
  const id = (day % 10_000) * 10 + depth;
  return { id, label: `${DEPTH[depth]}·${String(day % 10_000).padStart(4, "0")}`, attribute: (day * 7 + depth * 3) % 6 };
}

type Tab = "mint" | "teams" | "vault" | "log";

export function LightdiveGame() {
  const { locale } = useLanguage();
  const t = useCallback((v: Copy) => v[locale], [locale]);
  if (!CONTRACTS) {
    return (
      <main className="ld" lang={locale}>
        <Hero t={t} />
        <p className="ld-empty">{t(T.notDeployed)}</p>
      </main>
    );
  }
  return <Game c={CONTRACTS} t={t} />;
}

function Hero({ t }: { t: (v: Copy) => string }) {
  return (
    <header className="ld-hero">
      <span className="ld-kicker">{t(T.kicker)}</span>
      <h1>{t(T.title)}</h1>
      <p className="ld-tagline">{t(T.tagline)}</p>
      <p className="ld-note">{t(T.testnetNote)}</p>
    </header>
  );
}

function Game({ c, t }: { c: Contracts; t: (v: Copy) => string }) {
  const { locale } = useLanguage();
  const platform = usePlatform();
  const account = platform.account;
  const client = useMemo(() => createPublicClient({ chain: GAME_CHAIN, transport: http(GAME_RPC) }), []);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [player, setPlayer] = useState<PlayerState | null>(null);
  const [nfts, setNfts] = useState<Nft[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [dives, setDives] = useState<DiveRecord[]>([]);
  const [ready, setReady] = useState<Set<bigint>>(new Set());
  const [requests, setRequests] = useState<MintRequest[]>([]);
  const [tab, setTab] = useState<Tab>("mint");
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const o = await readOverview(client, c);
      setOverview(o);
      if (account) {
        const [p, n, tm, d, rq] = await Promise.all([
          readPlayer(client, c, account), readWalletNfts(client, c, account), readTeams(client, c, account),
          readDives(client, c, account), readMintRequests(client, c, account),
        ]);
        setPlayer(p); setNfts(n); setTeams(tm); setDives(d); setRequests(rq);
        const flags = await Promise.all(d.map((x) => diveSettleable(client, c, x, o.today)));
        setReady(new Set(d.filter((_, i) => flags[i]).map((x) => x.id)));
      }
    } catch (e) {
      toast.error((e as Error).message.slice(0, 200));
    } finally {
      setLoading(false);
    }
  }, [client, c, account]);

  useEffect(() => {
    queueMicrotask(() => void load());
    const timer = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const send = useCallback(async (label: string, address: Address, abi: Abi, functionName: string, args: readonly unknown[] = []) => {
    setBusy(label);
    try {
      const from = await platform.connect();
      await platform.switchWalletChain(GAME_CHAIN);
      const wallet = createWalletClient({ chain: GAME_CHAIN, transport: custom(platform.walletProvider()) });
      const hash = await wallet.writeContract({ account: from, chain: GAME_CHAIN, address, abi, functionName, args });
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error(`Transaction reverted: ${hash}`);
      toast.success(t(T.done));
      await load();
    } catch (e) {
      toast.error((e as Error).message.split("\n")[0].slice(0, 200));
    } finally {
      setBusy(null);
    }
  }, [platform, client, load, t]);

  const feeBp = overview && player && player.lastClaimAt > 0n
    ? (() => {
        const days = Math.floor((overview.now - Number(player.lastClaimAt)) / 86_400);
        return days >= overview.claimFeeDecayDays ? 0 : Math.round(overview.claimFeeMaxBp * (overview.claimFeeDecayDays - days) / overview.claimFeeDecayDays);
      })()
    : overview?.claimFeeMaxBp ?? 0;
  const estRelease = overview
    ? (() => {
        const byRate = overview.pool.available * BigInt(overview.emissionRateBp) / 10_000n;
        const byCap = overview.todayPoints * overview.yieldCapPerPoint / 10_000n;
        return byRate < byCap ? byRate : byCap;
      })()
    : 0n;

  return (
    <main className="ld" lang={locale}>
      <Hero t={t} />

      <section className="ld-bar">
        {account ? (
          <>
            <span className="ld-mono">{account.slice(0, 6)}…{account.slice(-4)}</span>
            <span>{t(T.balance)} <b>{player ? fmt(player.rvyn) : "—"}</b></span>
            <button type="button" className="ld-btn ld-btn--ghost" onClick={() => void platform.switchWalletChain(GAME_CHAIN).catch(() => {})}>{t(T.switchNet)}</button>
          </>
        ) : (
          <button type="button" className="ld-btn" onClick={() => void platform.connect().catch(() => {})}>{t(T.connect)}</button>
        )}
        <button type="button" className="ld-btn ld-btn--ghost ld-refresh" onClick={() => void load()} aria-label={t(T.refresh)} disabled={loading}>
          {loading ? <LoaderCircle size={16} className="ld-spin" /> : <RefreshCw size={16} />}
        </button>
      </section>

      <section className="ld-stats" aria-label={t(T.observatory)}>
        <Stat label={t(T.pool)} value={overview ? fmt(overview.pool.balance, 0) : "—"} unit="RVYN" />
        <Stat label={t(T.todayRelease)} value={overview ? fmt(estRelease, 0) : "—"} unit="RVYN" />
        <Stat label={t(T.todayDust)} value={overview ? (Number(overview.todayPoints) / 10_000).toLocaleString(locale, { maximumFractionDigits: 0 }) : "—"} />
        <Stat label={t(T.signal)} value={overview ? t(overview.hourScheduled ? T.signalOk : T.signalOff) : "—"} tone={overview && !overview.hourScheduled ? "warn" : undefined} />
        <div className="ld-stat ld-stat--claim">
          <span>{t(T.credit)}</span>
          <strong>{player ? fmt(player.credit) : "—"} <small>RVYN</small></strong>
          <small>{t(T.decayFee)} {(feeBp / 100).toFixed(0)}%</small>
          <button type="button" className="ld-btn" disabled={!player || player.credit === 0n || busy !== null}
            onClick={() => void send("claim", c.expedition, ABI.Expedition, "claim")}>{t(T.claim)}</button>
        </div>
      </section>

      <nav className="ld-tabs" role="tablist">
        {(["mint", "teams", "vault", "log"] as Tab[]).map((key) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? "is-on" : ""} onClick={() => setTab(key)}>
            {t({ mint: T.tabMint, teams: T.tabTeams, vault: T.tabVault, log: T.tabLog }[key])}
          </button>
        ))}
      </nav>

      {tab === "mint" && overview && (
        <MintTab c={c} t={t} overview={overview} player={player} requests={requests} busy={busy} send={send} />
      )}
      {tab === "teams" && overview && (
        <TeamsTab c={c} t={t} overview={overview} player={player} nfts={nfts} teams={teams} busy={busy} send={send} />
      )}
      {tab === "vault" && <Vault t={t} nfts={nfts} teams={teams} />}
      {tab === "log" && <VoyageLog c={c} t={t} dives={dives} ready={ready} busy={busy} send={send} />}
      {tab === "log" && <OddsPanel c={c} t={t} client={client} />}
    </main>
  );
}

type Send = (label: string, address: Address, abi: Abi, functionName: string, args?: readonly unknown[]) => Promise<void>;

function Stat({ label, value, unit, tone }: { label: string; value: string; unit?: string; tone?: "warn" }) {
  return (
    <div className={`ld-stat${tone ? ` ld-stat--${tone}` : ""}`}>
      <span>{label}</span>
      <strong>{value} {unit && <small>{unit}</small>}</strong>
    </div>
  );
}

function MintTab({ c, t, overview, player, requests, busy, send }: {
  c: Contracts; t: (v: Copy) => string; overview: Overview; player: PlayerState | null; requests: MintRequest[]; busy: string | null; send: Send;
}) {
  const [qty, setQty] = useState([1, 1, 1]);
  const spireOpen = overview.spireSaleStart > 0n && Number(overview.spireSaleStart) <= overview.now;
  return (
    <section className="ld-panel">
      <div className="ld-grid3">
        {[KIND.spire, KIND.prism, KIND.seeker].map((kind) => {
          const deck = overview.decks[kind];
          const price = overview.prices[kind];
          const discounted = player && !player.firstMintUsed[kind];
          const total = price * BigInt(qty[kind]) - (discounted ? price * BigInt(overview.firstDiscountBp) / 10_000n : 0n);
          const needsApproval = !player || player.allowance < total;
          const capped = kind !== KIND.seeker;
          const disabled = busy !== null || overview.paused.minter || !overview.hourScheduled || (kind === KIND.spire && !spireOpen);
          return (
            <article key={kind} className="ld-card">
              <header>
                <Glyph kind={kind} rarity={4} />
                <div>
                  <h3>{t(KIND_NAME[kind])}</h3>
                  <p className="ld-mono">{t(T.price)} {fmt(price, 0)} RVYN</p>
                  {discounted && <span className="ld-chip">{t(T.firstDiscount)}</span>}
                </div>
              </header>
              <p className="ld-mono ld-dim">
                {t(T.deck)} #{deck.number} · {deck.remaining.toLocaleString()} {t(T.cardsLeft)}
                {capped && <> · {t(T.live)} {overview.alive[kind].toLocaleString()}/{overview.maxAlive[kind].toLocaleString()}</>}
              </p>
              <h4>{t(T.odds)}</h4>
              <ul className="ld-odds">
                {deck.rarityLeft.map((left, r) => (
                  <li key={r}>
                    <i style={{ background: RARITY_COLOR[r] }} aria-hidden="true" />
                    <span>{t(RARITY[r])}</span>
                    <b>{deck.remaining ? ((left / deck.remaining) * 100).toFixed(2) : "0.00"}%</b>
                  </li>
                ))}
              </ul>
              <label className="ld-qty">
                <span>{t(T.quantity)}</span>
                <select value={qty[kind]} onChange={(e) => setQty((q) => q.map((v, i) => (i === kind ? Number(e.target.value) : v)))}>
                  {Array.from({ length: MAX_PER_TX[kind] }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                <b className="ld-mono">{fmt(total, 2)} RVYN</b>
              </label>
              {kind === KIND.spire && !spireOpen ? (
                <button type="button" className="ld-btn" disabled>{t(T.saleClosed)}</button>
              ) : needsApproval ? (
                <button type="button" className="ld-btn ld-btn--ghost" disabled={busy !== null}
                  onClick={() => void send("approve", c.rvyn, ERC20_ABI as unknown as Abi, "approve", [c.minter, maxUint256])}>{t(T.approve)}</button>
              ) : (
                <button type="button" className="ld-btn" disabled={disabled}
                  onClick={() => void send(`mint-${kind}`, c.minter, ABI.LightdiveMinter, "requestMint", [kind, qty[kind]])}>
                  {busy === `mint-${kind}` ? <LoaderCircle size={16} className="ld-spin" /> : null}{t(T.mintBtn)}
                </button>
              )}
            </article>
          );
        })}
      </div>

      {requests.length > 0 && (
        <div className="ld-sub">
          <h3>{t(T.requests)}</h3>
          <ul className="ld-list">
            {requests.slice(0, 12).map((r) => (
              <li key={String(r.id)}>
                <span className="ld-mono">#{String(r.id)}</span>
                <span>{t(KIND_NAME[r.kind])} × {r.qty}</span>
                {r.fulfilled ? <span className="ld-dim">{t(T.revealed)}</span>
                  : r.ready ? <button type="button" className="ld-btn" disabled={busy !== null}
                      onClick={() => void send(`fulfill-${r.id}`, c.minter, ABI.LightdiveMinter, "fulfill", [r.id])}>{t(T.reveal)}</button>
                  : <span className="ld-dim">{t(T.waiting)}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function TeamsTab({ c, t, overview, player, nfts, teams, busy, send }: {
  c: Contracts; t: (v: Copy) => string; overview: Overview; player: PlayerState | null; nfts: Nft[]; teams: Team[]; busy: string | null; send: Send;
}) {
  const spires = nfts.filter((n) => n.attributes.kind === KIND.spire);
  const prisms = nfts.filter((n) => n.attributes.kind === KIND.prism);
  const seekers = nfts.filter((n) => n.attributes.kind === KIND.seeker);
  const [spireId, setSpireId] = useState<string>("");
  const [prismId, setPrismId] = useState<string>("");
  const [picked, setPicked] = useState<string[]>([]);
  const spire = spires.find((s) => String(s.id) === spireId) ?? null;
  const prism = prisms.find((p) => String(p.id) === prismId) ?? null;
  const seats = spire?.attributes.trait ?? 0;
  const chosen = seekers.filter((s) => picked.includes(String(s.id))).slice(0, seats);
  const lum = spire && chosen.length ? previewLuminance(spire, prism, chosen) : 0;

  return (
    <section className="ld-panel">
      {teams.length === 0 && <p className="ld-dim">{t(T.noTeams)}</p>}
      <div className="ld-teams">
        {teams.map((team) => <TeamCard key={String(team.spire.id)} c={c} t={t} team={team} overview={overview} busy={busy} send={send} />)}
      </div>

      <div className="ld-sub">
        <h3>{t(T.equipTitle)}</h3>
        <div className="ld-form">
          <label>
            <span>{t(T.chooseSpire)}</span>
            <select value={spireId} onChange={(e) => { setSpireId(e.target.value); setPicked([]); }}>
              <option value="">—</option>
              {spires.map((s) => <option key={String(s.id)} value={String(s.id)}>#{String(s.id)} · {t(RARITY[s.attributes.rarity])} Lv.{s.attributes.trait} · {s.attributes.luminance}</option>)}
            </select>
          </label>
          <label>
            <span>{t(T.choosePrism)}</span>
            <select value={prismId} onChange={(e) => setPrismId(e.target.value)}>
              <option value="">{t(T.emptyMount)}</option>
              {prisms.map((p) => <option key={String(p.id)} value={String(p.id)}>#{String(p.id)} · {t(RARITY[p.attributes.rarity])} · {t(BEAM[p.attributes.trait])} · {p.attributes.luminance}</option>)}
            </select>
          </label>
          <fieldset disabled={!spire}>
            <legend>{t(T.seekerSeats)} {chosen.length}/{seats || "—"}</legend>
            <div className="ld-picks">
              {seekers.map((s) => {
                const on = picked.includes(String(s.id));
                return (
                  <button type="button" key={String(s.id)} className={`ld-pick${on ? " is-on" : ""}`}
                    disabled={!on && chosen.length >= seats}
                    onClick={() => setPicked((p) => (on ? p.filter((x) => x !== String(s.id)) : [...p, String(s.id)]))}>
                    <i style={{ background: ATTRIBUTE_COLOR[s.attributes.trait] }} aria-hidden="true" />
                    #{String(s.id)} {t(RARITY[s.attributes.rarity])} · {s.attributes.luminance}
                  </button>
                );
              })}
              {seekers.length === 0 && <span className="ld-dim">{t(T.empty)}</span>}
            </div>
          </fieldset>
          <p className="ld-mono">{t(T.totalLum)} <b>{lum || "—"}</b></p>
          {player && !player.approvedForGame ? (
            <button type="button" className="ld-btn ld-btn--ghost" disabled={busy !== null}
              onClick={() => void send("approve-nft", c.nft, ABI.LightdiveNFT, "setApprovalForAll", [c.expedition, true])}>{t(T.allowGame)}</button>
          ) : (
            <button type="button" className="ld-btn" disabled={!spire || chosen.length === 0 || busy !== null || overview.paused.expedition}
              onClick={() => void send("equip", c.expedition, ABI.Expedition, "equip", [spire!.id, prism?.id ?? 0n, chosen.map((s) => s.id)]).then(() => { setSpireId(""); setPrismId(""); setPicked([]); })}>
              {t(T.equip)}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function TeamCard({ c, t, team, overview, busy, send }: {
  c: Contracts; t: (v: Copy) => string; team: Team; overview: Overview; busy: string | null; send: Send;
}) {
  const lum = Number(team.luminance);
  const reachable = overview.depthMinLuminance.map((min) => lum >= min);
  const [depth, setDepth] = useState(() => Math.max(0, reachable.lastIndexOf(true)));
  const coord = coordinate(overview.today, depth);
  const doveToday = team.lastDiveDay === overview.today;
  const attuned = team.seekers.find((s) => s.attributes.trait === coord.attribute);
  const s = team.spire.attributes;
  return (
    <article className="ld-team">
      <header>
        <Glyph kind={KIND.spire} rarity={s.rarity} />
        <div>
          <h3>{s.variant ? t(SPECIAL_SPIRE[s.variant - 1]) : t(KIND_NAME[KIND.spire])} #{String(team.spire.id)}</h3>
          <p className="ld-mono">{t(RARITY[s.rarity])} · Lv.{s.trait} · {t(T.voyages)} {s.voyagesLeft}</p>
        </div>
        <strong className="ld-lum">{lum}<small>{t(T.totalLum)}</small></strong>
      </header>
      <ul className="ld-crew">
        <li>{t(KIND_NAME[KIND.prism])}: {team.prism ? `${t(RARITY[team.prism.attributes.rarity])} · ${t(BEAM[team.prism.attributes.trait])} · ${t(T.voyages)} ${team.prism.attributes.voyagesLeft}` : `${t(T.emptyMount)} (${t(BEAM[1])})`}</li>
        {team.seekers.map((sk) => (
          <li key={String(sk.id)}>
            <i style={{ background: ATTRIBUTE_COLOR[sk.attributes.trait] }} aria-hidden="true" />
            {t(KIND_NAME[KIND.seeker])} #{String(sk.id)} · {t(RARITY[sk.attributes.rarity])} · {t(ATTRIBUTE[sk.attributes.trait])} · {t(T.voyages)} {sk.attributes.voyagesLeft}
          </li>
        ))}
      </ul>
      <div className="ld-depths" role="radiogroup" aria-label={t(T.depth)}>
        {DEPTH.map((label, i) => (
          <button key={label} type="button" role="radio" aria-checked={depth === i} disabled={!reachable[i]}
            className={depth === i ? "is-on" : ""} onClick={() => setDepth(i)} title={`${overview.depthMinLuminance[i]}`}>{label}</button>
        ))}
      </div>
      <p className="ld-mono ld-dim">
        {t(T.coord)} {coord.label} · {t(T.attribute)} <span style={{ color: ATTRIBUTE_COLOR[coord.attribute] }}>{t(ATTRIBUTE[coord.attribute])}</span>
      </p>
      {attuned && <p className="ld-attuned">#{String(attuned.id)} {t(T.attuned)}</p>}
      <div className="ld-actions">
        <button type="button" className="ld-btn" disabled={doveToday || team.seekers.length === 0 || !reachable[depth] || busy !== null || !overview.hourScheduled || overview.paused.expedition}
          onClick={() => void send(`dive-${team.spire.id}`, c.expedition, ABI.Expedition, "dive", [team.spire.id, depth, coord.id])}>
          {team.seekers.length === 0 ? t(T.noSeekers) : doveToday ? t(T.doveToday) : t(T.dive)}
        </button>
        <button type="button" className="ld-btn ld-btn--ghost" disabled={busy !== null}
          onClick={() => void send(`unequip-${team.spire.id}`, c.expedition, ABI.Expedition, "unequip", [team.spire.id])}>{t(T.unequip)}</button>
      </div>
    </article>
  );
}

function Vault({ t, nfts, teams }: { t: (v: Copy) => string; nfts: Nft[]; teams: Team[] }) {
  const all = [...nfts, ...teams.flatMap((tm) => [tm.spire, ...(tm.prism ? [tm.prism] : []), ...tm.seekers])];
  if (all.length === 0) return <section className="ld-panel"><p className="ld-dim">{t(T.empty)}</p></section>;
  return (
    <section className="ld-panel">
      <div className="ld-vault">
        {all.map((n) => {
          const a = n.attributes;
          const name = a.kind === KIND.spire && a.variant ? t(SPECIAL_SPIRE[a.variant - 1])
            : a.kind === KIND.prism && a.variant ? t(SPECIAL_PRISM[a.variant - 1]) : t(KIND_NAME[a.kind]);
          const detail = a.kind === KIND.spire ? `Lv.${a.trait}` : a.kind === KIND.prism ? t(BEAM[a.trait]) : t(ATTRIBUTE[a.trait]);
          return (
            <article key={String(n.id)} className="ld-nft" style={{ ["--rc" as string]: RARITY_COLOR[a.rarity] }}>
              <Glyph kind={a.kind} rarity={a.rarity} attribute={a.kind === KIND.seeker ? a.trait : undefined} />
              <h4>{name} <span className="ld-mono">#{String(n.id)}</span></h4>
              <p>{t(RARITY[a.rarity])} · {detail}</p>
              <p className="ld-mono">{t(T.luminance)} {a.luminance} · {t(T.voyages)} {a.voyagesLeft}</p>
              {a.variant > 0 && a.kind !== KIND.seeker && <span className="ld-chip">{t(T.special)}</span>}
              {a.variant > 0 && a.kind === KIND.seeker && <span className="ld-chip">{t(T.signature)} · {t(SIGNATURE[a.variant - 1])}</span>}
            </article>
          );
        })}
      </div>
      <p className="ld-dim ld-small">{t(T.homecoming)}</p>
    </section>
  );
}

function VoyageLog({ c, t, dives, ready, busy, send }: {
  c: Contracts; t: (v: Copy) => string; dives: DiveRecord[]; ready: Set<bigint>; busy: string | null; send: Send;
}) {
  const settleIds = dives.filter((d) => ready.has(d.id)).map((d) => d.id).slice(0, 40);
  const nameOf = (spire: bigint) => `${t(KIND_NAME[KIND.spire])} #${String(spire)}`;
  return (
    <section className="ld-panel">
      <div className="ld-actions">
        <button type="button" className="ld-btn" disabled={settleIds.length === 0 || busy !== null}
          onClick={() => void send("settle", c.expedition, ABI.Expedition, "settle", [settleIds])}>{t(T.settleAll)} ({settleIds.length})</button>
      </div>
      {dives.length === 0 && <p className="ld-dim">{t(T.empty)}</p>}
      <ol className="ld-log">
        {dives.slice(0, 60).map((d) => {
          const coord = coordinate(d.day, d.depth).label;
          const tier = d.result?.tier ?? 1;
          return (
            <li key={String(d.id)} className={d.result ? `ld-log--t${tier}` : ""}>
              <span className="ld-mono ld-dim">#{String(d.id)} · {new Date(d.day * 86_400_000).toISOString().slice(0, 10)} · {t(T.depth)} {DEPTH[d.depth]} · {t(BEAM[d.beam])}</span>
              {d.result ? (
                <>
                  <b>{t(OUTCOME[tier])} ×{(d.result.multX100 / 100).toFixed(2)}</b>
                  <p>{t(LOG_LINE[tier]).replaceAll("{coord}", coord).replaceAll("{name}", nameOf(d.spire))}</p>
                  <span className="ld-mono">{t(T.lightdust)} {(Number(d.result.lightdust) / 10_000).toLocaleString(undefined, { maximumFractionDigits: 1 })} · +{fmt(d.result.reward, 4)} {t(T.reward)}</span>
                </>
              ) : (
                <b className="ld-dim">{ready.has(d.id) ? t(T.settleable) : t(T.pending)}</b>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function OddsPanel({ c, t, client }: { c: Contracts; t: (v: Copy) => string; client: ReturnType<typeof createPublicClient> }) {
  const [tiers, setTiers] = useState<{ probBp: number; lo: number; hi: number }[][] | null>(null);
  useEffect(() => {
    void Promise.all([0, 1, 2].map((b) => client.readContract({ address: c.config, abi: ABI.LightdiveConfig, functionName: "beamTiers", args: [b] })))
      .then((x) => setTiers(x as { probBp: number; lo: number; hi: number }[][]))
      .catch(() => setTiers(null));
  }, [client, c]);
  if (!tiers) return null;
  return (
    <section className="ld-panel ld-sub">
      <h3>{t(T.oddsTitle)}</h3>
      <div className="ld-grid3">
        {tiers.map((rows, b) => (
          <table key={b} className="ld-table">
            <caption>{t(BEAM[b])}</caption>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}><td>{t(OUTCOME[i])}</td><td className="ld-mono">{(r.probBp / 100).toFixed(2)}%</td><td className="ld-mono">{r.hi === 0 ? "0" : `${(r.lo / 100).toFixed(2)}–${(r.hi / 100).toFixed(2)}`}×</td></tr>
              ))}
            </tbody>
          </table>
        ))}
      </div>
      <p className="ld-dim ld-small">{t(T.oddsNote)}</p>
    </section>
  );
}

/** Placeholder art until the art set exists: a geometric emblem per kind, framed in the rarity color. */
function Glyph({ kind, rarity, attribute }: { kind: number; rarity: number; attribute?: number }) {
  const color = RARITY_COLOR[rarity];
  return (
    <svg className="ld-glyph" viewBox="0 0 64 64" aria-hidden="true" style={{ ["--rc" as string]: color }}>
      <rect x="2" y="2" width="60" height="60" rx="10" fill="none" stroke={color} strokeOpacity="0.55" />
      {attribute !== undefined && <circle cx="32" cy="32" r="22" fill="none" stroke={ATTRIBUTE_COLOR[attribute]} strokeWidth="2" strokeDasharray="4 3" />}
      {kind === KIND.spire && (
        <g fill="none" stroke={color} strokeWidth="2">
          <path d="M24 54 L27 12 L31 30 M40 54 L37 12 L33 30" />
          <circle cx="32" cy="34" r="4" fill="#c9ff55" stroke="none" />
          <path d="M26 12 H38" />
        </g>
      )}
      {kind === KIND.prism && (
        <g fill="none" stroke={color} strokeWidth="2">
          <path d="M32 10 L48 40 L16 40 Z" />
          <path d="M32 40 L32 56" stroke="#c9ff55" />
        </g>
      )}
      {kind === KIND.seeker && (
        <g fill="none" stroke={color} strokeWidth="2">
          <path d="M22 26 Q32 10 42 26 L40 40 Q32 46 24 40 Z" />
          <path d="M25 28 H39" stroke="#c9ff55" />
          <path d="M20 56 Q32 44 44 56" />
        </g>
      )}
    </svg>
  );
}
