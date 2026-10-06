"use client";

import { createContext, useContext } from "react";
import type { Address, Chain, EIP1193Provider, Hex } from "viem";
import type { PlatformConfig } from "@/packages/web3/config";

export type Transaction = {
  kind?: "launch";
  title: string;
  to?: Address;
  data: Hex;
  value: bigint;
  details?: [string, string][];
  allowUndeployed?: boolean;
  onSubmitted?: (hash: Hex) => void;
};

export type PlatformContextValue = {
  config: PlatformConfig & { chainStatus?: string };
  ready: boolean;
  account: Address | null;
  refresh: (options?: { silent?: boolean }) => Promise<void>;
  connect: () => Promise<Address>;
  transact: (tx: Transaction) => Promise<Hex>;
  admin: <T = unknown>(action: string, payload: unknown) => Promise<T>;
  /** The selected browser wallet, for pages that sign on another chain than the platform's (e.g. the Lightdive testnet). */
  walletProvider: () => EIP1193Provider;
  switchWalletChain: (chain: Chain) => Promise<void>;
};

export const PlatformContext = createContext<PlatformContextValue | null>(null);

export function usePlatform() {
  const value = useContext(PlatformContext);
  if (!value) throw new Error("PlatformContext is unavailable; ensure PlatformProvider wraps this page.");
  return value;
}
