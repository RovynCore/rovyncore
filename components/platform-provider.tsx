"use client";
import {
  useLanguage,
  translateRuntime as tr,
} from "@/components/language-provider";
import { HumanVerification, humanProof } from "./human-verification";
import {
  useState,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { useWallet } from "@/hooks/use-wallet";

import {
  createPublicClient,
  createWalletClient,
  custom,
  formatEther,
  type Address,
  type Hex,
} from "viem";
import Image from "next/image";
import {
  Wallet,
  ExternalLink,
  LogOut,
  CheckCircle2,
  LoaderCircle,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Toaster, toast } from "sonner";
import {
  CHAINS,
  DEFAULT_CONFIG,
  OWNER,
  shortAddress,
  type PlatformConfig,
} from "@/packages/web3/config";
import {
  COMMON_WALLETS,
  type WalletBrand,
  type WalletChoice,
} from "@/lib/wallet-choice";
import { SiteHeader, SiteFooter } from "@/components/rv/shell";
import { PlatformContext, type Transaction } from "@/components/platform-context";

export async function api<T = unknown>(path: string, body?: unknown): Promise<T> {
  const proof = body === undefined ? {} : await humanProof(path.split("?")[0]);
  const r = await fetch(
    `/api/${path}`,
    body === undefined
      ? { cache: "no-store" }
      : {
          method: "POST",
          headers: { "Content-Type": "application/json", ...proof },
          body: JSON.stringify(body),
        },
  );
  // Sites may return an HTML error document when a Worker invocation times
  // out. Parse the body ourselves so the user never sees the misleading
  // `Unexpected token '<'` JSON exception.
  const text = await r.text();
  let data: (T & { error?: string }) | null = null;
  try {
    data = text ? (JSON.parse(text) as T & { error?: string }) : null;
  } catch {
    throw new Error(
      r.ok ? tr("服務暫時無法回應，請稍後再試。") : tr("服務暫時無法完成此請求，請稍後再試。"),
    );
  }
  if (!r.ok) throw new Error(tr(data?.error || "請求未完成"));
  return (data ?? {}) as T;
}
export function message(error: unknown) {
  const e = error as { shortMessage?: string; message?: string; code?: number };
  const text = `${e.shortMessage || ""} ${e.message || ""}`;
  if (e.code === 4001 || /rejected|denied/i.test(text))
    return tr("你已取消錢包請求。資料已保留。");
  if (/wrong network|network does not match|chain.?id.*match|switch.*network/i.test(text))
    return tr("錢包網路不正確，請切換到畫面指定的 Robinhood Chain 網路後重試。");
  if (/timeout|timed out|rpc unavailable|temporarily unreachable/i.test(text))
    return tr("RPC 暫時無法回應；交易狀態尚未確定，請稍後重新同步，不要重複付款。");
  if (/revert|execution reverted|transaction failed/i.test(text))
    return tr("交易已在鏈上執行失敗；請查看區塊瀏覽器的 revert 原因，未建立 Asset Record。");
  const source = e.shortMessage || e.message || "操作失敗，請重試。";
  const translated = tr(source);
  if (translated !== source) return translated;
  if (/[\u3400-\u9fff]/u.test(source) && typeof document !== "undefined" &&
      !document.documentElement.lang.startsWith("zh"))
    return tr("操作暫時無法完成，請稍後再試。");
  return source;
}
type Config = PlatformConfig & { chainStatus?: string };

function WalletLogo({
  brand,
  icon,
}: {
  brand: WalletBrand;
  icon?: string;
}) {
  const [failedSource, setFailedSource] = useState("");
  const source = COMMON_WALLETS.find((wallet) => wallet.brand === brand)?.iconUrl || icon;
  const failed = failedSource === source;
  return (
    <span className="wallet-option__logo" data-wallet={brand} aria-hidden="true">
      {brand === "coinbase" ? (<span className="wallet-option__monogram">C</span>) : source && !failed ? (
        <Image
          src={source}
          alt=""
          width={28}
          height={28}
          unoptimized
          onError={() => setFailedSource(source)}
        />
      ) : (
        <Wallet size={18} />
      )}
    </span>
  );
}

function WalletCatalogOption({
  wallet,
  choice,
  selected,
  busy,
  tr,
  onSelect,
}: {
  wallet: (typeof COMMON_WALLETS)[number];
  choice?: WalletChoice;
  selected: boolean;
  busy: boolean;
  tr: (source: string) => string;
  onSelect: (id: string) => void;
}) {
  const content = (
    <>
      <WalletLogo brand={wallet.brand} icon={wallet.iconUrl} />
      <span className="wallet-option__copy">
        <strong>{wallet.name}</strong>
        <small>{tr(choice ? "已偵測" : "未偵測到 · 前往官方網站")}</small>
      </span>
      {choice ? (
        selected ? <CheckCircle2 size={16} aria-hidden="true" /> : null
      ) : (
        <ExternalLink size={15} aria-hidden="true" />
      )}
    </>
  );
  if (!choice)
    return (
      <a
        className="wallet-option wallet-option--install"
        href={wallet.downloadUrl}
        target="_blank"
        rel="noopener noreferrer"
        key={wallet.brand}
      >
        {content}
      </a>
    );
  return (
    <button
      type="button"
      className={`wallet-option${selected ? " is-selected" : ""}`}
      aria-pressed={selected}
      disabled={busy}
      onClick={() => onSelect(choice.id)}
      key={wallet.brand}
    >
      {content}
    </button>
  );
}

export function PlatformProvider({ children }: { children: ReactNode }) {
  const { tr, locale } = useLanguage();

  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG);
  const [ready, setReady] = useState(false);
  const [showLoadingNotice, setShowLoadingNotice] = useState(false);
  useEffect(() => {
    if (ready) return;
    const timer = window.setTimeout(() => setShowLoadingNotice(true), 2000);
    return () => window.clearTimeout(timer);
  }, [ready]);
  const walletSession = useWallet();
  const { account, chain, provider } = walletSession;
  const [walletOpen, setWalletOpen] = useState(false);
  const [pending, setPending] = useState<
    | (Transaction & {
        gas: bigint;
        gasPrice: bigint;
        resolve: (v: Hex) => void;
        reject: (e: Error) => void;
        account: Address;
        chainId: number;
      })
    | null
  >(null);
  const [busy, setBusy] = useState(false);
  const [txState, setTxState] = useState<{
    status: string;
    hash?: Hex;
    error?: string;
  } | null>(null);
  const transactionLock = useRef(false);
  const hasLoadedConfig = useRef(false);
  async function refresh(options?: { silent?: boolean }) {
    try {
      setConfig(await api<Config>("config"));
      setReady(true);
      hasLoadedConfig.current = true;
    } catch (e) {
      // Keep the last known-good config during transient RPC/Worker errors.
      // A background refresh should never make a completed wallet transaction
      // look like it failed.
      if (!hasLoadedConfig.current) setReady(false);
      if (!options?.silent) toast.error(message(e));
    }
  }
  useEffect(() => {
    void refresh();
    const interval = setInterval(() => void refresh({ silent: true }), 45000);
    return () => clearInterval(interval);
  }, []);
  async function connect() {
    setWalletOpen(true);
    try {
      const connected = await walletSession.connect(CHAINS[config.chainId]);
      setWalletOpen(false);
      return connected;
    } catch (cause) {
      throw cause;
    }
  }
  async function ensureNetwork() {
    await walletSession.switchChain(CHAINS[config.chainId]);
  }
  async function transact(tx: Transaction): Promise<Hex> {
    if (transactionLock.current) throw new Error(tr("已有交易處理中"));
    if (!ready) throw new Error(tr("設定尚未載入"));
    if (config.maintenance && !tx.allowUndeployed)
      throw new Error(tr("平台維護中"));
    if (!config.platform && !tx.allowUndeployed)
      throw new Error(tr("平台正在準備上線；請管理者先部署合約。"));
    transactionLock.current = true;
    try {
      const a = await connect();
      setWalletOpen(false);
      await ensureNetwork();
      const client = createPublicClient({
        chain: CHAINS[config.chainId],
        transport: custom(provider()),
      });
      const gas = await client.estimateGas({
        account: a,
        to: tx.to,
        data: tx.data,
        value: tx.value,
      });
      const gasPrice = await client.getGasPrice();
      return await new Promise<Hex>((resolve, reject) =>
        setPending({
          ...tx,
          gas,
          gasPrice,
          resolve,
          reject,
          account: a,
          chainId: config.chainId,
        }),
      );
    } finally {
      transactionLock.current = false;
    }
  }
  async function submit() {
    if (!pending || busy) return;
    const current = pending;
    setBusy(true);
    try {
      if (current.chainId !== config.chainId)
        throw new Error(tr("服務網路已變更，請重新預覽交易"));
      await ensureNetwork();
      const accounts = (await provider().request({
        method: "eth_accounts",
      })) as string[];
      if (accounts[0]?.toLowerCase() !== current.account.toLowerCase())
        throw new Error(tr("錢包已變更，請重新確認交易"));
      const wallet = createWalletClient({
        chain: CHAINS[config.chainId],
        transport: custom(provider()),
      });
      const client = createPublicClient({
        chain: CHAINS[config.chainId],
        transport: custom(provider()),
      });
      setTxState({ status: tr("請在錢包確認簽署") });
      const hash = await wallet.sendTransaction({
        account: current.account,
        to: current.to,
        data: current.data,
        value: current.value,
        gas: (current.gas * 120n) / 100n,
      });
      setTxState({ status: tr("交易已送出，等待區塊確認"), hash });
      current.onSubmitted?.(hash);
      try {
        sessionStorage.setItem(
          "genesis:last-transaction",
          JSON.stringify({
            hash,
            chainId: config.chainId,
            title: current.title,
            kind: current.kind,
          }),
        );
      } catch {}
      const receipt = await client.waitForTransactionReceipt({
        hash,
        confirmations: 3,
        timeout: 180000,
      });
      if (receipt.status !== "success")
        throw new Error(tr("鏈上執行失敗；請查看交易明細"));
      current.onSubmitted?.(receipt.transactionHash);
      setTxState({ status: tr("交易已確認"), hash });
      setPending(null);
      current.resolve(receipt.transactionHash);
      void refresh({ silent: true });
    } catch (e) {
      setTxState((s) => ({
        status: tr("交易未完成"),
        hash: s?.hash,
        error: message(e),
      }));
      setPending(null);
      current.reject(e as Error);
    } finally {
      setBusy(false);
    }
  }
  async function admin<T = unknown>(action: string, payload: unknown): Promise<T> {
    const a = await connect();
    if (a.toLowerCase() !== OWNER.toLowerCase())
      throw new Error(tr("請使用指定的管理錢包"));
    const challenge = await api<{ id: string; message: string }>("challenge", { action, payload });
    const signature = await createWalletClient({
      transport: custom(provider()),
    }).signMessage({ account: a, message: challenge.message });
    return api<T>("admin", {
      action,
      payload,
      auth: { id: challenge.id, signature },
    });
  }
  function handleWalletButton() {
    if (account) {
      setWalletOpen(true);
      void walletSession.sync().catch(e => toast.error(message(e)));
      return;
    }
    // Let wallet discovery finish and show the selected provider before asking
    // an extension for access. This prevents an arbitrary first-loaded wallet
    // from receiving the request when several extensions are installed.
    setWalletOpen(true);
  }
  const cancel = () => {
    if (busy) return;
    if (pending) pending.reject(new Error(tr("已取消交易")));
    setPending(null);
  };
  return (
    <PlatformContext.Provider
      value={{ config, ready, account, refresh, connect, transact, admin }}
    >
      <SiteHeader
        walletBusy={walletSession.busy}
        onWallet={handleWalletButton}
        walletLabel={walletSession.busy ? tr("請在錢包確認簽署") : account ? shortAddress(account) : tr("連接錢包")}
      />
      {config.maintenance && (
        <div className="rv-banner">
          {tr("平台維護中，瀏覽與資產查詢仍可使用。")}
        </div>
      )}
      {!ready && showLoadingNotice && (
        <div className="rv-banner" role="status">
          {tr("正在載入平台設定…")}
          <button type="button" onClick={() => void refresh()}>{tr("重新載入")}</button>
        </div>
      )}
      {children}
      <SiteFooter />
      <Dialog open={walletOpen} onOpenChange={setWalletOpen}>
        <DialogContent className="rv-dialog wallet-dialog" data-lenis-prevent>
          <DialogTitle>
            {account ? tr("你的錢包") : tr("連接你的錢包")}
          </DialogTitle>
          <DialogDescription>
            {tr("使用 EVM 瀏覽器錢包。平台不會要求私鑰或助記詞。")}
          </DialogDescription>
          {walletSession.status && <p role="status">{tr(walletSession.status)}</p>}
          {walletSession.error && <p role="alert" className="rv-error">{tr(walletSession.error)}</p>}
          {account ? (
            <>
              <code className="rv-mono" style={{ overflowWrap: "anywhere" }}>{account}</code>
              <p className="rv-small">
                {chain === config.chainId
                  ? CHAINS[config.chainId].name
                  : tr("錢包目前在其他網路")}
              </p>
              <button
                className="rv-btn rv-btn--secondary"
                disabled={walletSession.busy}
                onClick={() =>
                  ensureNetwork().catch((e) => toast.error(message(e)))
                }
              >
                {tr("切換至")}
                {CHAINS[config.chainId].name}
              </button>
              <button
                className="rv-btn rv-btn--secondary"
                disabled={walletSession.busy}
                onClick={() => void walletSession.disconnect().catch(e => toast.error(message(e)))}
              >
                <LogOut size={16} />
                {tr("中斷此網站連線狀態")}
              </button>
            </>
          ) : (
            <>
              <section className="wallet-picker" aria-label={tr("常用 EVM 錢包")}>
                <div className="wallet-picker__heading">
                  <strong>{tr("常用 EVM 錢包")}</strong>
                  <span>{tr("選擇已安裝的錢包，或從官方網站安裝。")}</span>
                </div>
                <div className="wallet-picker__grid">
                  {COMMON_WALLETS.map((wallet) => {
                    const choice = walletSession.choices.find((item) => item.brand === wallet.brand);
                    return (
                      <WalletCatalogOption
                        key={wallet.brand}
                        wallet={wallet}
                        choice={choice}
                        selected={choice?.id === walletSession.selected}
                        busy={walletSession.busy}
                        tr={tr}
                        onSelect={(id) => void walletSession.select(id).catch((error) => toast.error(message(error)))}
                      />
                    );
                  })}
                </div>
                {walletSession.choices.some((item) => item.brand === "other") ? (
                  <div className="wallet-picker__other">
                    <strong>{tr("其他相容錢包")}</strong>
                    <div className="wallet-picker__grid">
                      {walletSession.choices.filter((item) => item.brand === "other").map((item) => (
                        <button
                          className={`wallet-option${item.id === walletSession.selected ? " is-selected" : ""}`}
                          type="button"
                          aria-pressed={item.id === walletSession.selected}
                          disabled={walletSession.busy}
                          onClick={() => void walletSession.select(item.id).catch((error) => toast.error(message(error)))}
                          key={item.id}
                        >
                          <WalletLogo brand="other" icon={item.icon} />
                          <span className="wallet-option__copy">
                            <strong>{item.name}</strong>
                            <small>{tr("已偵測")}</small>
                          </span>
                          {item.id === walletSession.selected ? <CheckCircle2 size={16} aria-hidden="true" /> : null}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </section>
              {!walletSession.discoveryReady ? (
                <p className="wallet-picker__message" role="status">
                  <LoaderCircle size={15} className="spin" /> {tr("正在掃描可用錢包…")}
                </p>
              ) : walletSession.choices.length === 0 ? (
                <p className="wallet-picker__message" role="status">
                  {tr("尚未偵測到錢包。安裝後重新整理此頁，即可連線。")}
                </p>
              ) : null}
              {walletSession.discoveryReady && walletSession.choices.length === 0 && typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ? (
                <div className="wallet-picker__message" role="group">
                  <p>{{ en: "On a phone? Open this page inside your wallet app's browser:", "zh-Hant": "使用手機？請在錢包 App 內建瀏覽器中開啟本頁：", "zh-Hans": "使用手机？请在钱包 App 内置浏览器中打开本页：", ko: "휴대폰이신가요? 지갑 앱의 내장 브라우저에서 이 페이지를 여세요:" }[locale]}</p>
                  {[
                    ["MetaMask", (u: string) => `https://metamask.app.link/dapp/${u.replace(/^https?:\/\//, "")}`],
                    ["Coinbase Wallet", (u: string) => `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(u)}`],
                    ["Trust Wallet", (u: string) => `https://link.trustwallet.com/open_url?coin_id=60&url=${encodeURIComponent(u)}`],
                  ].map(([name, build]) => (
                    <a key={name as string} className="wallet-picker__deeplink" href={(build as (u: string) => string)(window.location.href)} rel="noreferrer">{name as string} ↗</a>
                  ))}
                </div>
              ) : null}
              <button
                className="rv-btn rv-btn--primary"
                disabled={walletSession.busy || !walletSession.selected}
                onClick={() => connect().catch((e) => toast.error(message(e)))}
              >
                {walletSession.selectedName ? (
                  <WalletLogo
                    brand={walletSession.selectedBrand}
                    icon={walletSession.selectedIcon}
                  />
                ) : (
                  <Wallet size={18} />
                )}
                {walletSession.selectedName
                  ? tr("使用 {0}", { 0: walletSession.selectedName })
                  : walletSession.discoveryReady && walletSession.choices.length === 0
                    ? tr("安裝錢包後即可繼續")
                    : tr("選擇或安裝錢包")}
              </button>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!pending}
        onOpenChange={(v) => {
          if (!v) cancel();
        }}
      >
        <DialogContent className="rv-dialog" showCloseButton={!busy}>
          <DialogTitle>
            {pending?.title}
            {tr("· 確認交易")}
          </DialogTitle>
          <DialogDescription>
            {tr("確認網路、合約與費用後，再交由錢包簽署。")}
          </DialogDescription>
          {pending && (
            <>
              <dl className="rv-receipt">
                <div><dt>{tr("網路")}</dt><dd>{CHAINS[config.chainId].name}</dd></div>
                <div><dt>{tr("付款金額")}</dt><dd>{formatEther(pending.value)} ETH</dd></div>
                <div><dt>{tr("Gas 估計")}</dt><dd>~ {Number(formatEther(pending.gas * pending.gasPrice)).toPrecision(3)} ETH</dd></div>
                <div><dt>{tr("合約")}</dt><dd>{pending.to || tr("部署新合約")}</dd></div>
                {pending.details?.map(([k, v]) => (
                  <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
                ))}
              </dl>
              <button
                className="rv-btn rv-btn--primary"
                disabled={busy}
                onClick={() => void submit()}
              >
                {busy ? (
                  <>
                    <LoaderCircle className="spin" size={18} />
                    {tr("等待錢包 / 區塊確認")}
                  </>
                ) : (
                  tr("確認並開啟錢包")
                )}
              </button>
            </>
          )}
        </DialogContent>
      </Dialog>
      {txState && (
        <aside className="rv-txstatus" role="status">
          <button
            aria-label={tr("關閉交易狀態")}
            onClick={() => setTxState(null)}
          >
            ×
          </button>
          <strong>
            {txState.status === tr("交易已確認") ? (
              <CheckCircle2 size={16} />
            ) : null}{" "}
            {tr(txState.status)}
          </strong>
          {txState.error && <p>{tr(txState.error)}</p>}
          {txState.hash && (
            <a
              href={`${CHAINS[config.chainId].blockExplorers.default.url}/tx/${txState.hash}`}
              target="_blank"
              rel="noreferrer"
            >
              {tr("查看 Explorer")}
              <ExternalLink size={14} />
            </a>
          )}
        </aside>
      )}
      <Toaster theme="dark" richColors position="bottom-right" />
      <HumanVerification />
    </PlatformContext.Provider>
  );
}
