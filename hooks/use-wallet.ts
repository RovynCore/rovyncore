"use client";
import { useEffect, useRef, useState } from "react";
import {
  WalletController,
  type BrowserWallet,
  type WalletState,
} from "@/lib/wallet-client";
import {
  COMMON_WALLETS,
  identifyWalletBrand,
  mergeWalletChoice,
  preferredWallet,
  type WalletBrand,
  type WalletChoice,
} from "@/lib/wallet-choice";

type ProviderAnnouncement = {
  info?: { uuid?: string; name?: string; rdns?: string; icon?: string };
  provider?: BrowserWallet;
};
type WalletWindow = Window & {
  ethereum?: BrowserWallet;
  coinbaseWalletExtension?: BrowserWallet;
  phantom?: { ethereum?: BrowserWallet };
  braveEthereum?: BrowserWallet;
};

function safeProviderIcon(icon: unknown): string | undefined {
  if (
    typeof icon === "string" &&
    icon.length <= 180_000 &&
    /^data:image\/(?:svg\+xml|png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/i.test(icon)
  )
    return icon;
  return undefined;
}

function walletName(brand: WalletBrand, announcedName?: string) {
  if (brand !== "other")
    return COMMON_WALLETS.find((wallet) => wallet.brand === brand)?.name || announcedName || "Browser wallet";
  const name = announcedName?.trim().replace(/\s+/g, " ").slice(0, 60);
  return name || "Other browser wallet";
}

async function auth(action: string, body?: unknown) {
  const response = await fetch(`/api/wallet/${action}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  const text = await response.text();
  if (!response.ok) {
    let message = text;
    try {
      message = JSON.parse(text).error || text;
    } catch {}
    throw new Error(message.slice(0, 250));
  }
  return JSON.parse(text);
}

export function useWallet() {
  const [choices, setChoices] = useState<WalletChoice[]>([]);
  const [selected, setSelected] = useState("");
  const [discoveryReady, setDiscoveryReady] = useState(false);
  const [state, setState] = useState<WalletState>({
    account: null,
    chain: null,
    busy: false,
    status: "",
    error: "",
  });
  const controller = useRef<WalletController | null>(null);

  useEffect(() => {
    const add = (choice: WalletChoice) =>
      setChoices((old) => mergeWalletChoice(old, choice));
    const announced = (event: Event) => {
      const { info, provider } = (event as CustomEvent<ProviderAnnouncement>).detail;
      if (!provider?.request || !info?.uuid) return;
      const brand = identifyWalletBrand(info.rdns, provider);
      add({
        id: info.uuid,
        brand,
        rdns: info.rdns,
        name: walletName(brand, info.name),
        icon: safeProviderIcon(info.icon),
        provider,
        isMetaMask: brand === "metamask",
      });
    };

    window.addEventListener("eip6963:announceProvider", announced);
    window.dispatchEvent(new Event("eip6963:requestProvider"));

    const legacy = () => {
      const walletWindow = window as WalletWindow;
      const root = walletWindow.ethereum;
      const candidates = [
        ...(root?.providers?.length ? root.providers : root ? [root] : []),
        walletWindow.coinbaseWalletExtension,
        walletWindow.phantom?.ethereum,
        walletWindow.braveEthereum,
      ];
      const seen = new Set<BrowserWallet>();
      let index = 0;
      for (const provider of candidates) {
        if (!provider?.request || seen.has(provider)) continue;
        seen.add(provider);
        const brand = identifyWalletBrand(undefined, provider);
        add({
          id: `injected-${brand}-${index++}`,
          brand,
          name: walletName(brand),
          provider,
          isMetaMask: brand === "metamask",
        });
      }
    };

    const legacyTimer = window.setTimeout(legacy, 350);
    const readyTimer = window.setTimeout(() => setDiscoveryReady(true), 900);
    window.addEventListener("ethereum#initialized", legacy);
    return () => {
      window.clearTimeout(legacyTimer);
      window.clearTimeout(readyTimer);
      window.removeEventListener("eip6963:announceProvider", announced);
      window.removeEventListener("ethereum#initialized", legacy);
    };
  }, []);

  const choice = preferredWallet(choices, selected);
  useEffect(() => {
    if (!choice) return;
    let cancelled = false;
    const current = new WalletController(choice.provider, auth);
    controller.current = current;
    queueMicrotask(() => {
      if (!cancelled) setState(current.state);
    });
    const unsubscribe = current.subscribe(() => setState(current.state));
    const stop = current.start();
    const sync = () => {
      if (!document.hidden) void current.sync();
    };
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", sync);
    const timer = window.setInterval(sync, 5000);
    return () => {
      cancelled = true;
      stop();
      unsubscribe();
      window.clearInterval(timer);
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", sync);
      if (controller.current === current) controller.current = null;
    };
  }, [choice]);

  const get = () => {
    if (!controller.current)
      throw new Error("No compatible EVM wallet detected. Install one and reload the page.");
    return controller.current;
  };

  return {
    ...state,
    choices,
    discoveryReady,
    selected: choice?.id || "",
    selectedName: choice?.name || "",
    selectedBrand: choice?.brand || "other",
    selectedIcon: choice?.icon,
    provider: () => get().provider,
    sync: () => get().sync(),
    connect: (chain?: Parameters<WalletController["connect"]>[0]) =>
      get().connect(chain),
    disconnect: () => get().disconnect(),
    switchChain: (chain: Parameters<WalletController["switchChain"]>[0]) =>
      get().switchChain(chain),
    select: async (id: string) => {
      if (controller.current) await controller.current.disconnect();
      setSelected(id);
    },
  };
}
