"use client";

// Live Lightdive v3 card counts for /transparency: how many of each kind exist, are on teams and are listed, read
// straight from the deployment the game plays on. null until loaded (or while no deployment is configured).
import { useEffect, useState } from "react";
import { createPublicClient, http } from "viem";
import { gameChain } from "@/lib/lightdive-v3/deployment";
import { readMarket, readOnTeam, readWorld, type Ctx } from "@/lib/lightdive-v3/onchain";

export type LiveSupply = { alive: number[]; maxAlive: number[]; onTeam: number[]; listed: number[]; testnet: boolean; nft: string };

export function useLiveSupply(): LiveSupply | null {
  const [supply, setSupply] = useState<LiveSupply | null>(null);
  useEffect(() => {
    const G = gameChain();
    if (!G.contracts) return;
    const client = createPublicClient({ chain: G.chain, transport: http(G.rpcUrl), cacheTime: 0 });
    const ctx: Ctx = { client: client as never, c: G.contracts, abi: G.abi, fromBlock: BigInt(G.deployment.deploymentBlock), multicall: G.multicall };
    let live = true;
    void (async () => {
      try {
        const [world, onTeam, market] = await Promise.all([readWorld(ctx, G.testToken), readOnTeam(ctx), readMarket(ctx)]);
        const listed = [0, 1, 2].map((k) => market.filter((l) => l.kind === k).length);
        if (live) setSupply({ alive: world.alive, maxAlive: world.maxAlive, onTeam, listed, testnet: G.testnet, nft: G.contracts!.nft });
      } catch {
        // the table keeps its dashes
      }
    })();
    return () => { live = false; };
  }, []);
  return supply;
}
