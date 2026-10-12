"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BaseError, ContractFunctionRevertedError, UserRejectedRequestError, createPublicClient, createWalletClient, custom, http,
  type Abi, type Address, type TransactionReceipt,
} from "viem";
import { usePlatform } from "@/components/platform-context";
import {
  GAME_CHAIN, GAME_RPC, diveSettleable, readBeamTiers, readDiveOutcomes, readDives, readMintRequests, readOverview, readPlayer,
  readTeams, readWalletNfts,
  type BeamTier, type Contracts, type DiveOutcome, type DiveRecord, type MintRequest, type Nft, type Overview, type PlayerState, type Team,
} from "@/lib/lightdive";
import type { Copy } from "@/lib/lightdive-copy";
import { ERRORS } from "@/lib/lightdive-game-copy";

// React's development-only render profiler JSON-serializes changed props and throws on BigInt, which
// halts rendering in `npm run dev`. Production builds do not run it; this only affects development.
if (process.env.NODE_ENV === "development" && !("toJSON" in BigInt.prototype)) {
  Object.defineProperty(BigInt.prototype, "toJSON", { value: function (this: bigint) { return this.toString(); }, configurable: true });
}

export type GameData = {
  overview: Overview | null;
  player: PlayerState | null;
  nfts: Nft[];
  teams: Team[];
  dives: DiveRecord[];
  outcomes: Map<bigint, DiveOutcome>;
  requests: MintRequest[];
  settleable: Set<bigint>;
  tiers: BeamTier[][] | null;
  gas: bigint | null;
  walletChain: number | null;
};

const EMPTY: GameData = {
  overview: null, player: null, nfts: [], teams: [], dives: [], outcomes: new Map(), requests: [], settleable: new Set(), tiers: null, gas: null, walletChain: null,
};

export type TxStep = { label: Copy; address: Address; abi: Abi; functionName: string; args?: readonly unknown[] };
export type TxStepState = { label: Copy; status: "queued" | "wallet" | "pending" | "done" | "failed"; hash?: `0x${string}` };
export type TxState = { steps: TxStepState[]; error: Copy | null; running: boolean };

/** Player-language reason for a failed call: the contract's custom error when there is one. */
export function explain(error: unknown): Copy {
  if (error instanceof BaseError) {
    if (error.walk((e) => e instanceof UserRejectedRequestError)) return ERRORS.rejected;
    const reverted = error.walk((e) => e instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null;
    const name = reverted?.data?.errorName;
    if (name && ERRORS[name]) return ERRORS[name];
  }
  const code = (error as { code?: number })?.code;
  if (code === 4001) return ERRORS.rejected;
  return ERRORS.unknown;
}

export function useGame(c: Contracts) {
  const platform = usePlatform();
  const account = platform.account;
  const client = useMemo(() => createPublicClient({ chain: GAME_CHAIN, transport: http(GAME_RPC), cacheTime: 0 }), []);
  const [data, setData] = useState<GameData>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  /** Chain time minus local time, in seconds, so countdowns follow the chain's clock. */
  const offset = useRef(-Infinity);
  const tiersRef = useRef<BeamTier[][] | null>(null);
  const inflight = useRef<Promise<void> | null>(null);
  /** A load asked for while another was running (e.g. the account changed): run it right after. */
  const again = useRef(false);
  const latest = useRef<() => Promise<void>>(async () => {});

  const load = useCallback(async () => {
    if (inflight.current) {
      again.current = true;
      return inflight.current;
    }
    const run = (async () => {
      setLoading(true);
      try {
        const overview = await readOverview(client, c);
        // The latest block can be a little old on a quiet chain; only move the clock back for a real jump.
        const measured = overview.now - Date.now() / 1000;
        offset.current = measured < offset.current && offset.current - measured < 600 ? offset.current : measured;
        if (!tiersRef.current) tiersRef.current = await readBeamTiers(client, c);
        let next: GameData = { ...EMPTY, overview, tiers: tiersRef.current };
        if (account) {
          const [player, nfts, teams, dives, requests, gas, walletChain] = await Promise.all([
            readPlayer(client, c, account),
            readWalletNfts(client, c, account),
            readTeams(client, c, account),
            readDives(client, c, account),
            readMintRequests(client, c, account),
            client.getBalance({ address: account }).catch(() => null),
            (async () => {
              try {
                return Number(await platform.walletProvider().request({ method: "eth_chainId" }));
              } catch {
                return null;
              }
            })(),
          ]);
          const [outcomes, flags] = await Promise.all([
            readDiveOutcomes(client, c, dives),
            Promise.all(dives.map((d) => diveSettleable(client, c, d, overview.today).catch(() => false))),
          ]);
          next = { ...next, player, nfts, teams, dives, requests, gas, walletChain, outcomes, settleable: new Set(dives.filter((_, i) => flags[i]).map((d) => d.id)) };
        }
        setData(next);
        setFailed(false);
        setLoadedAt(Date.now());
      } catch {
        setFailed(true);
      } finally {
        setLoading(false);
        inflight.current = null;
        if (again.current) {
          again.current = false;
          queueMicrotask(() => void latest.current());
        }
      }
    })();
    inflight.current = run;
    return run;
  }, [client, c, account, platform]);
  useEffect(() => {
    latest.current = load;
  }, [load]);

  useEffect(() => {
    queueMicrotask(() => void load());
    const timer = window.setInterval(() => {
      if (!document.hidden) void load();
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  // Reload when a new one-minute slot begins (a new signal may be revealed and new actions open up).
  const now = useChainClock(offset);
  const slotRef = useRef<number | null>(null);
  useEffect(() => {
    const slot = Math.floor(now / 60);
    if (slotRef.current !== null && slot !== slotRef.current) queueMicrotask(() => void load());
    slotRef.current = slot;
  }, [now, load]);

  const [tx, setTx] = useState<TxState | null>(null);
  const run = useCallback(
    async (steps: TxStep[]): Promise<TransactionReceipt[] | null> => {
      const states: TxStepState[] = steps.map((s) => ({ label: s.label, status: "queued" }));
      const update = (i: number, patch: Partial<TxStepState>, error: Copy | null = null, running = true) => {
        states[i] = { ...states[i], ...patch };
        setTx({ steps: [...states], error, running });
      };
      setTx({ steps: [...states], error: null, running: true });
      const receipts: TransactionReceipt[] = [];
      let i = 0;
      try {
        // Already signed in: do not reopen the site wallet dialog for every transaction.
        const from = account ?? (await platform.connect());
        await platform.switchWalletChain(GAME_CHAIN);
        const wallet = createWalletClient({ chain: GAME_CHAIN, transport: custom(platform.walletProvider()) });
        for (; i < steps.length; i++) {
          const s = steps[i];
          update(i, { status: "wallet" });
          const { request } = await client.simulateContract({ account: from, address: s.address, abi: s.abi, functionName: s.functionName, args: s.args ?? [] });
          // Set the gas limit ourselves (estimate + 20%): some wallets fall back to a fixed default that is too low.
          const gas = await client.estimateContractGas({ account: from, address: s.address, abi: s.abi, functionName: s.functionName, args: s.args ?? [] });
          const hash = await wallet.writeContract({ ...request, account: from, chain: GAME_CHAIN, gas: (gas * 12n) / 10n });
          update(i, { status: "pending", hash });
          const receipt = await client.waitForTransactionReceipt({ hash });
          if (receipt.status !== "success") throw new Error("reverted");
          receipts.push(receipt);
          update(i, { status: "done" });
        }
        setTx({ steps: [...states], error: null, running: false });
        // Success needs no reading: close the panel shortly so the game can show what happened.
        window.setTimeout(() => setTx((cur) => (cur && !cur.running && !cur.error ? null : cur)), 1200);
        void load();
        return receipts;
      } catch (error) {
        console.warn("lightdive transaction", steps[i]?.functionName, error);
        update(Math.min(i, steps.length - 1), { status: "failed" }, explain(error), false);
        void load();
        return null;
      }
    },
    [client, platform, load, account],
  );

  /** Sign in and move the wallet to the game's chain in one go. */
  const join = useCallback(async () => {
    try {
      await platform.connect();
      await platform.switchWalletChain(GAME_CHAIN);
    } catch {
      // the wallet dialog shows what went wrong
    } finally {
      void load();
    }
  }, [platform, load]);
  const switchNetwork = useCallback(async () => {
    try {
      await platform.switchWalletChain(GAME_CHAIN);
    } catch {
      // declined in the wallet
    } finally {
      void load();
    }
  }, [platform, load]);

  return { client, account, data, loading, failed, loadedAt, load, now, tx, run, closeTx: () => setTx(null), platform, join, switchNetwork };
}

/** Chain time in whole seconds, ticking every second. */
function chainNow(offset: React.MutableRefObject<number>) {
  return Math.floor(Date.now() / 1000 + (Number.isFinite(offset.current) ? offset.current : 0));
}

function useChainClock(offset: React.MutableRefObject<number>) {
  // Starts at 0 so the server render and the first browser render match; the real time arrives on mount.
  const [now, setNow] = useState(0);
  useEffect(() => {
    queueMicrotask(() => setNow(chainNow(offset)));
    const timer = window.setInterval(() => setNow(chainNow(offset)), 1000);
    return () => window.clearInterval(timer);
  }, [offset]);
  return now;
}

export function countdown(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}
