"use client";

// The live Lightdive game on the v3 contracts (testnet for now; the mainnet switch only changes the deployment file).
import { LightdiveApp } from "./preview";
import { useChain } from "./use-chain";

export function LightdiveLive() {
  const game = useChain();
  return <LightdiveApp sim={game} />;
}
