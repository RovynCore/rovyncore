"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "@/components/site-link";
import { useLanguage } from "@/components/language-provider";
import { usePlatform } from "@/components/platform-context";
import { api, message } from "@/components/platform-provider";
import { TokenAvatar, BoostButton } from "@/components/token-actions";
import { CHAINS, shortAddress } from "@/packages/web3/config";
import { formatEther } from "viem";
import { ArrowUpRight, RefreshCw, WalletCards } from "lucide-react";

type CreatorToken = {
  address: string;
  name: string;
  symbol: string;
  sequence: number;
  supply: string | number;
  created: number;
  activeBoost: string | number;
  metadata: { logo?: string } | null;
};
type CreatorTokensResponse = { tokens: CreatorToken[] };

export function VerifyModule() {
  const { tr, locale } = useLanguage();
  const { config, account, connect } = usePlatform();
  const [tokens, setTokens] = useState<CreatorToken[]>([]);
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!account) {
      setTokens([]);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await api<CreatorTokensResponse>(`tokens?tab=new&creator=${encodeURIComponent(account)}`);
      setTokens(result.tokens);
    } catch (cause) {
      setError(message(cause));
    } finally {
      setLoading(false);
    }
  }, [account]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) void load(); });
    return () => { cancelled = true; };
  }, [load, config.chainId]);

  async function openWallet() {
    setConnecting(true);
    setError("");
    try {
      await connect();
    } catch (cause) {
      setError(message(cause));
    } finally {
      setConnecting(false);
    }
  }

  const explorer = CHAINS[config.chainId].blockExplorers.default.url;
  return (
    <section className="creator-studio" aria-labelledby="creator-studio-title">
      <div className="creator-studio__toolbar">
        <div className="creator-studio__wallet">
          <span className="creator-studio__icon"><WalletCards size={20} aria-hidden="true" /></span>
          <div>
            <strong>{account ? shortAddress(account) : tr("尚未連接錢包")}</strong>
            <small>{CHAINS[config.chainId].name}</small>
          </div>
        </div>
        {account ? (
          <button type="button" className="secondary" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={15} className={loading ? "spin" : ""} /> {tr("重新載入")}
          </button>
        ) : (
          <button type="button" className="primary" onClick={() => void openWallet()} disabled={connecting}>
            <WalletCards size={16} /> {connecting ? tr("處理中…") : tr("連接錢包查看我的 Token")}
          </button>
        )}
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      {loading ? (
        <p className="creator-studio__empty" role="status">{tr("正在查找你的發行紀錄…")}</p>
      ) : !account ? (
        <div className="creator-studio__empty">
          <p>{tr("連接錢包後，這裡會列出該錢包透過 ROVYN CORE 發行的 Token。")}</p>
          <small>{tr("只讀取公開鏈上發行資料，不會要求交易或資產授權。")}</small>
        </div>
      ) : tokens.length === 0 ? (
        <div className="creator-studio__empty">
          <p>{tr("這個錢包目前沒有在所選網路找到平台發行紀錄。")}</p>
          <Link className="secondary" href="/launchpad">{tr("前往發射台")} <ArrowUpRight size={15} /></Link>
        </div>
      ) : (
        <div className="creator-studio__list">
          {tokens.map((token) => (
            <article className="creator-studio__token" key={token.address}>
              <div className="creator-studio__token-main">
                <TokenAvatar name={token.name} logo={token.metadata?.logo} />
                <div>
                  <Link href={`/token/${token.address}`}><strong>{token.name}</strong> <span>${token.symbol}</span></Link>
                  <small>{tr("平台發行")} · #{token.sequence} · {shortAddress(token.address)}</small>
                </div>
              </div>
              <dl className="creator-studio__facts">
                <div><dt>{tr("固定總供應")}</dt><dd>{Number(formatEther(BigInt(token.supply))).toLocaleString(locale)}</dd></div>
                <div><dt>{tr("發行日期")}</dt><dd>{new Date(token.created * 1000).toLocaleDateString(locale)}</dd></div>
                <div><dt>{tr("目前 Boost")}</dt><dd>{Number(token.activeBoost).toLocaleString(locale)}</dd></div>
              </dl>
              <div className="creator-studio__actions">
                <a className="text-link" href={`${explorer}/token/${token.address}`} target="_blank" rel="noreferrer">{tr("查看鏈上紀錄")} <ArrowUpRight size={14} /></a>
                <BoostButton address={token.address} name={token.name} onSuccess={() => void load()} />
              </div>
            </article>
          ))}
        </div>
      )}
      <p className="creator-studio__note">{tr("工作台只顯示目前網路已索引的發行；切換網路後，資料會隨網路更新。")}</p>
    </section>
  );
}
