"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPublicClient, createWalletClient, custom, formatEther, http, parseEther, type Abi, type Address } from "viem";
import { toast } from "sonner";
import { useLanguage } from "@/components/language-provider";
import { usePlatform } from "@/components/platform-context";
import { ABI, CONTRACTS, ERC20_ABI, GAME_CHAIN, GAME_RPC, readOverview, type Contracts, type Overview } from "@/lib/lightdive";
import { KIND_NAME, RARITY, type Copy } from "@/lib/lightdive-copy";
import "./lightdive.css";

const c = (en: string, zhHant: string, zhHans: string, ko: string): Copy => ({ en, "zh-Hant": zhHant, "zh-Hans": zhHans, ko });
const A = {
  title: c("Lightdive admin (testnet)", "潛光遠征管理（測試網）", "潜光远征管理（测试网）", "라이트다이브 관리 (테스트넷)"),
  notDeployed: c("Not deployed. Run npm run lightdive:deploy first.", "尚未部署。請先執行 npm run lightdive:deploy。", "尚未部署。请先执行 npm run lightdive:deploy。", "배포 전입니다. 먼저 npm run lightdive:deploy를 실행하세요."),
  owner: c("Contract owner", "合約擁有者", "合约拥有者", "컨트랙트 소유자"),
  you: c("Connected wallet", "目前錢包", "当前钱包", "연결된 지갑"),
  notOwner: c("Read-only: the connected wallet is not the owner.", "唯讀：目前錢包不是合約擁有者。", "只读：当前钱包不是合约拥有者。", "읽기 전용: 연결된 지갑이 소유자가 아닙니다."),
  contracts: c("Contracts", "合約地址", "合约地址", "컨트랙트"),
  pool: c("Core Light Pool", "核光池", "核光池", "코어빛 풀"),
  balance: c("Balance", "餘額", "余额", "잔액"),
  available: c("Available", "可釋出", "可释放", "가용"),
  reserved: c("Reserved for closed days", "已保留給已結束的日子", "已保留给已结束的日子", "마감일 예약분"),
  owed: c("Owed to players", "待玩家領取", "待玩家领取", "플레이어 미수령"),
  fund: c("Fund pool (RVYN)", "注入核光池（RVYN）", "注入核光池（RVYN）", "풀 충전 (RVYN)"),
  supply: c("Supply and decks", "數量與牌組", "数量与牌组", "수량과 덱"),
  lowerCap: c("Lower live cap", "調低流通上限", "调低流通上限", "유통 상한 낮추기"),
  signal: c("Randomness signal", "隨機數訊號", "随机数信号", "무작위 신호"),
  scheduled: c("hours ahead committed", "小時已預先承諾", "小时已预先承诺", "시간 사전 커밋"),
  unrevealed: c("finished hours not revealed (last 6)", "最近 6 小時未揭曉", "最近 6 小时未揭晓", "최근 6시간 미공개"),
  operator: c("Operator", "營運者", "运营者", "운영자"),
  params: c("Parameters", "參數", "参数", "파라미터"),
  emission: c("Daily release (bp)", "每日釋出（bp）", "每日释放（bp）", "일일 방출 (bp)"),
  cap: c("Yield cap per point (RVYN)", "每點光塵上限（RVYN）", "每点光尘上限（RVYN）", "포인트당 상한 (RVYN)"),
  price: c("Price (RVYN)", "價格（RVYN）", "价格（RVYN）", "가격 (RVYN)"),
  save: c("Save", "儲存", "保存", "저장"),
  sale: c("Spire sale", "光塔開賣", "光塔开卖", "스파이어 판매"),
  openSale: c("Open spire sale now", "立即開賣光塔", "立即开卖光塔", "지금 스파이어 판매 시작"),
  saleOpen: c("Open since", "開賣時間", "开卖时间", "판매 시작"),
  pause: c("Pause", "暫停", "暂停", "일시정지"),
  unpause: c("Resume", "恢復", "恢复", "재개"),
  mintPaused: c("Minting", "鑄造", "铸造", "주조"),
  divePaused: c("Diving", "潛光", "潜光", "다이브"),
  paused: c("paused", "已暫停", "已暂停", "일시정지됨"),
  running: c("running", "運作中", "运作中", "운영 중"),
  done: c("Confirmed on chain", "鏈上已確認", "链上已确认", "온체인 확인됨"),
};

export function LightdiveAdmin() {
  const { locale } = useLanguage();
  const t = useCallback((v: Copy) => v[locale], [locale]);
  if (!CONTRACTS) return <main className="ld"><h1 className="ld-admin-title">{t(A.title)}</h1><p className="ld-dim">{t(A.notDeployed)}</p></main>;
  return <Admin c={CONTRACTS} t={t} />;
}

function Admin({ c: k, t }: { c: Contracts; t: (v: Copy) => string }) {
  const { locale } = useLanguage();
  const platform = usePlatform();
  const client = useMemo(() => createPublicClient({ chain: GAME_CHAIN, transport: http(GAME_RPC) }), []);
  const [o, setO] = useState<Overview | null>(null);
  const [owner, setOwner] = useState<Address | null>(null);
  const [operator, setOperator] = useState<Address | null>(null);
  const [ahead, setAhead] = useState(0);
  const [unrevealed, setUnrevealed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ emission: "", cap: "", p0: "", p1: "", p2: "", fund: "", capKind: "0", capValue: "" });

  const load = useCallback(async () => {
    try {
      const ov = await readOverview(client, k);
      setO(ov);
      const [own, op] = await Promise.all([
        client.readContract({ address: k.config, abi: ABI.LightdiveConfig, functionName: "owner" }),
        client.readContract({ address: k.beacon, abi: ABI.RandomnessBeacon, functionName: "operator" }),
      ]);
      setOwner(own as Address);
      setOperator(op as Address);
      const future = await Promise.all(Array.from({ length: 48 }, (_, i) =>
        client.readContract({ address: k.beacon, abi: ABI.RandomnessBeacon, functionName: "hasCommitment", args: [ov.hour + BigInt(i + 1)] })));
      setAhead(future.filter(Boolean).length);
      const past = await Promise.all(Array.from({ length: 6 }, async (_, i) => {
        const h = ov.hour - BigInt(i + 1);
        const [has, rev] = await Promise.all([
          client.readContract({ address: k.beacon, abi: ABI.RandomnessBeacon, functionName: "hasCommitment", args: [h] }),
          client.readContract({ address: k.beacon, abi: ABI.RandomnessBeacon, functionName: "revealed", args: [h] }),
        ]);
        return Boolean(has) && !rev;
      }));
      setUnrevealed(past.filter(Boolean).length);
    } catch (e) {
      toast.error((e as Error).message.slice(0, 200));
    }
  }, [client, k]);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  const isOwner = Boolean(owner && platform.account && owner.toLowerCase() === platform.account.toLowerCase());

  const send = async (address: Address, abi: Abi, functionName: string, args: readonly unknown[] = []) => {
    setBusy(true);
    try {
      const from = await platform.connect();
      await platform.switchWalletChain(GAME_CHAIN);
      const wallet = createWalletClient({ chain: GAME_CHAIN, transport: custom(platform.walletProvider()) });
      const hash = await wallet.writeContract({ account: from, chain: GAME_CHAIN, address, abi, functionName, args });
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error(`Transaction reverted: ${hash}`);
      toast.success(t(A.done));
      await load();
    } catch (e) {
      toast.error((e as Error).message.split("\n")[0].slice(0, 200));
    } finally {
      setBusy(false);
    }
  };
  const fmt = (v: bigint) => Number(formatEther(v)).toLocaleString(locale, { maximumFractionDigits: 2 });
  const explorer = GAME_CHAIN.blockExplorers?.default.url;
  const off = !isOwner || busy;

  return (
    <main className="ld" lang={locale}>
      <h1 className="ld-admin-title">{t(A.title)}</h1>
      <section className="ld-bar">
        <span>{t(A.owner)} <b>{owner ?? "—"}</b></span>
        <span>{t(A.you)} <b>{platform.account ?? "—"}</b></span>
        {!isOwner && <span className="ld-dim">{t(A.notOwner)}</span>}
      </section>

      {o && (
        <div className="ld-grid3">
          <section className="ld-card">
            <h3>{t(A.pool)}</h3>
            <dl className="ld-dl">
              <dt>{t(A.balance)}</dt><dd>{fmt(o.pool.balance)}</dd>
              <dt>{t(A.available)}</dt><dd>{fmt(o.pool.available)}</dd>
              <dt>{t(A.reserved)}</dt><dd>{fmt(o.pool.reserved)}</dd>
              <dt>{t(A.owed)}</dt><dd>{fmt(o.pool.owed)}</dd>
            </dl>
            <label className="ld-qty"><span>{t(A.fund)}</span>
              <input value={form.fund} onChange={(e) => setForm({ ...form, fund: e.target.value })} inputMode="decimal" />
            </label>
            <div className="ld-actions">
              <button type="button" className="ld-btn ld-btn--ghost" disabled={off || !form.fund}
                onClick={() => void send(k.rvyn, ERC20_ABI as unknown as Abi, "approve", [k.pool, parseEther(form.fund)])}>1. approve</button>
              <button type="button" className="ld-btn" disabled={off || !form.fund}
                onClick={() => void send(k.pool, ABI.CoreLightPool, "fund", [parseEther(form.fund)])}>2. fund</button>
            </div>
          </section>

          <section className="ld-card">
            <h3>{t(A.signal)}</h3>
            <p className="ld-mono">hour {String(o.hour)}</p>
            <p><b className={ahead < 6 ? "ld-warn" : ""}>{ahead}/48</b> {t(A.scheduled)}</p>
            <p><b className={unrevealed > 1 ? "ld-warn" : ""}>{unrevealed}</b> {t(A.unrevealed)}</p>
            <p className="ld-mono ld-dim">{t(A.operator)} {operator}</p>
          </section>

          <section className="ld-card">
            <h3>{t(A.sale)}</h3>
            <p>{o.spireSaleStart > 0n ? `${t(A.saleOpen)} ${new Date(Number(o.spireSaleStart) * 1000).toISOString().replace("T", " ").slice(0, 16)} UTC` : "—"}</p>
            <button type="button" className="ld-btn" disabled={off || o.spireSaleStart > 0n}
              onClick={() => void send(k.minter, ABI.LightdiveMinter, "openSpireSale", [0n])}>{t(A.openSale)}</button>
            {([["minter", k.minter, ABI.LightdiveMinter, A.mintPaused], ["expedition", k.expedition, ABI.Expedition, A.divePaused]] as const).map(([key, address, abi, label]) => (
              <div key={key} className="ld-actions">
                <span>{t(label)}: {t(o.paused[key] ? A.paused : A.running)}</span>
                <button type="button" className="ld-btn ld-btn--ghost" disabled={off}
                  onClick={() => void send(address, abi, o.paused[key] ? "unpause" : "pause")}>{t(o.paused[key] ? A.unpause : A.pause)}</button>
              </div>
            ))}
          </section>
        </div>
      )}

      {o && (
        <section className="ld-sub">
          <h3>{t(A.supply)}</h3>
          <table className="ld-table">
            <thead><tr><th /><th>deck</th><th>left</th>{RARITY.map((r, i) => <th key={i}>{t(r)}</th>)}<th>live / cap</th></tr></thead>
            <tbody>
              {o.decks.map((d, kind) => (
                <tr key={kind}>
                  <td>{t(KIND_NAME[kind])}</td><td>#{d.number}</td><td>{d.remaining}</td>
                  {d.rarityLeft.map((x, i) => <td key={i}>{x}</td>)}
                  <td>{o.alive[kind]} / {kind === 2 ? "∞" : o.maxAlive[kind]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="ld-actions">
            <select value={form.capKind} onChange={(e) => setForm({ ...form, capKind: e.target.value })}>
              <option value="0">{t(KIND_NAME[0])}</option><option value="1">{t(KIND_NAME[1])}</option>
            </select>
            <input value={form.capValue} onChange={(e) => setForm({ ...form, capValue: e.target.value })} inputMode="numeric" placeholder="cap" />
            <button type="button" className="ld-btn ld-btn--ghost" disabled={off || !form.capValue}
              onClick={() => void send(k.nft, ABI.LightdiveNFT, "lowerMaxAlive", [Number(form.capKind), Number(form.capValue)])}>{t(A.lowerCap)}</button>
          </div>
        </section>
      )}

      {o && (
        <section className="ld-sub">
          <h3>{t(A.params)}</h3>
          <div className="ld-params">
            <Param label={`${t(A.emission)} · ${o.emissionRateBp}`} value={form.emission} onChange={(v) => setForm({ ...form, emission: v })}
              disabled={off} onSave={() => void send(k.config, ABI.LightdiveConfig, "setEmissionRate", [Number(form.emission)])} save={t(A.save)} />
            <Param label={`${t(A.cap)} · ${formatEther(o.yieldCapPerPoint)}`} value={form.cap} onChange={(v) => setForm({ ...form, cap: v })}
              disabled={off} onSave={() => void send(k.config, ABI.LightdiveConfig, "setYieldCap", [parseEther(form.cap)])} save={t(A.save)} />
            {([0, 1, 2] as const).map((kind) => {
              const key = `p${kind}` as "p0" | "p1" | "p2";
              return (
                <Param key={kind} label={`${t(KIND_NAME[kind])} ${t(A.price)} · ${formatEther(o.prices[kind])}`} value={form[key]} onChange={(v) => setForm({ ...form, [key]: v })}
                  disabled={off} onSave={() => void send(k.config, ABI.LightdiveConfig, "setPrice", [kind, parseEther(form[key])])} save={t(A.save)} />
              );
            })}
          </div>
        </section>
      )}

      <section className="ld-sub">
        <h3>{t(A.contracts)}</h3>
        <ul className="ld-list">
          {Object.entries(k).map(([name, address]) => (
            <li key={name}><span>{name}</span>{explorer ? <a className="ld-mono" href={`${explorer}/address/${address}`} target="_blank" rel="noreferrer">{address}</a> : <span className="ld-mono">{address}</span>}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}

function Param({ label, value, onChange, onSave, disabled, save }: { label: string; value: string; onChange: (v: string) => void; onSave: () => void; disabled: boolean; save: string }) {
  return (
    <label className="ld-param">
      <span>{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} inputMode="decimal" />
      <button type="button" className="ld-btn ld-btn--ghost" disabled={disabled || !value} onClick={onSave}>{save}</button>
    </label>
  );
}
