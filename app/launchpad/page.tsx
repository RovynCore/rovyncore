"use client";
import { useLanguage } from "@/components/language-provider";
import { humanProof } from "@/components/human-verification";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "@/components/site-link";
import { encodeFunctionData, parseEther } from "viem";
import { Rocket, ShieldCheck, Upload, ArrowRight, ArrowUpRight, CheckCircle2, Info } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog } from "radix-ui";
import { usePlatform } from "@/components/platform-context";
import { api, message } from "@/components/platform-provider";
import { TokenAvatar } from "@/components/token-actions";
import { EMPTY_DRAFT, tokenSchema, type TokenDraft } from "@/lib/validation";
import { CHAINS } from "@/packages/web3/config";
import { RVYN_MODEL } from "@/lib/rvyn-model";
import artifacts from "@/packages/web3/artifacts.json";

import { TokenDraftPreview, LaunchProgress } from "@/components/workflow-motion";
import { Address, type Copy4 } from "@/components/rv/ui";

const q = (en: string, zhHant: string, zhHans: string, ko: string): Copy4 => ({ en, "zh-Hant": zhHant, "zh-Hans": zhHans, ko });
const L = {
  eyebrow: q("Launchpad · Tool", "發射台 · 工具", "发射台 · 工具", "런치패드 · 도구"),
  s1: q("Token details", "代幣資料", "代币资料", "토큰 정보"),
  s2: q("Preview and sign", "預覽並簽署", "预览并签署", "미리보기 및 서명"),
  s3: q("Public record", "公開紀錄", "公开记录", "공개 기록"),
  nextTitle: q("What to do next", "接下來可以做什麼", "接下来可以做什么", "다음 단계"),
  next1: q("Add liquidity if you want trading", "想要交易，就自行加入流動性", "想要交易，就自行加入流动性", "거래를 원하면 유동성 추가"),
  next1b: q("Create a pool on Uniswap with your tokens and ETH. The platform does not do this for you.", "用你的代幣和 ETH 在 Uniswap 建立交易池，平台不會代為建立。", "用你的代币和 ETH 在 Uniswap 建立交易池，平台不会代为建立。", "보유한 토큰과 ETH로 Uniswap에 풀을 만드세요. 플랫폼이 대신 만들지 않습니다."),
  next2: q("Add the pool link", "加上交易池連結", "加上交易池链接", "풀 링크 추가"),
  next2b: q("Paste the public pool link on your Asset Record so visitors can find it.", "把公開的交易池連結加到你的 Asset Record，讓訪客找得到。", "把公开的交易池链接加到你的 Asset Record，让访客找得到。", "공개 풀 링크를 Asset Record에 추가해 방문자가 찾을 수 있게 하세요."),
  next3: q("Share your record", "分享你的紀錄", "分享你的记录", "기록 공유"),
  next3b: q("Your Asset Record and its embeddable badge show the token's public origin.", "你的 Asset Record 與可嵌入徽章會展示代幣的公開起點。", "你的 Asset Record 与可嵌入徽章会展示代币的公开起点。", "Asset Record와 삽입용 배지가 토큰의 공개 출처를 보여줍니다."),
};

export default function Launch() {
  const { tr, locale } = useLanguage();

  const { config, transact, ready, account, connect } = usePlatform();
  const [draft, setDraft] = useState<TokenDraft>(EMPTY_DRAFT);
  const [localLogo, setLocalLogo] = useState("");
  const [uploadState, setUploadState] = useState<
    "idle" | "uploading" | "uploaded" | "failed"
  >("idle");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [step, setStep] = useState(1);
  const workflow = useRef<HTMLElement>(null);
  const previousStep = useRef(1);
  useEffect(() => {
    if (step !== previousStep.current) {
      previousStep.current = step;
      const panel = workflow.current;
      if (panel) {
        panel.querySelector<HTMLElement>(".launch-review, input")?.focus({ preventScroll: true });
        panel.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
      }
    }
  }, [step]);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{
    address: string;
    tx: string;
    status: "pending" | "active";
    confirmations: number;
    requiredConfirmations: number;
  } | null>(null);
  const [pendingHash, setPendingHash] = useState("");
  const [walletReview, setWalletReview] = useState(false);
  useEffect(() => {
    let cancelled = false;
    try {
      const saved = JSON.parse(
        sessionStorage.getItem("genesis:last-transaction") || "null",
      );
      queueMicrotask(() => {
        if (
          !cancelled &&
          (saved?.kind === "launch" || saved?.title?.startsWith("發射 ")) &&
          saved.chainId === config.chainId
        ) {
          setPendingHash(saved.hash);
          setStep(2);
        }
      });
    } catch {}
    return () => { cancelled = true; };
  }, [config.chainId]);
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        const s = localStorage.getItem("genesis:launch-draft");
        const query = new URLSearchParams(window.location.search);
        const savedDraft = s ? JSON.parse(s) as Partial<TokenDraft> : null;
        const isFormerOfficialSeed = savedDraft?.name === "RovynCore" &&
          savedDraft.symbol === "RVYN" &&
          savedDraft.supply === RVYN_MODEL.supply &&
          savedDraft.website === "https://rovyncore.com" &&
          savedDraft.x === "https://x.com/RovynCORE";
        if (query.get("genesis") === "1" || isFormerOfficialSeed) {
          setDraft(EMPTY_DRAFT);
          localStorage.removeItem("genesis:launch-draft");
          if (query.has("genesis")) {
            const url = new URL(window.location.href);
            url.searchParams.delete("genesis");
            window.history.replaceState(window.history.state, "", url);
          }
        } else if (savedDraft) setDraft({ ...EMPTY_DRAFT, ...savedDraft });
      } catch {}
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (loaded)
      try {
        localStorage.setItem("genesis:launch-draft", JSON.stringify(draft));
      } catch {}
  }, [draft, loaded]);
  const field = (key: keyof TokenDraft, value: string) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setError("");
  };
  useEffect(() => {
    return () => {
      if (localLogo) URL.revokeObjectURL(localLogo);
    };
  }, [localLogo]);
  async function upload(file?: File) {
    if (!file) return;
    if (busy) return;
    setBusy(true);
    setError("");
    setSelectedFile(file);
    setUploadState("uploading");
    try {
      if (file.size > 2_000_000) throw new Error(tr("圖片不可超過 2 MB"));
      field("logo", "");
      const previewUrl = URL.createObjectURL(file);
      setLocalLogo(previewUrl);
      const form = new FormData();
      form.set("file", file);
      const r = await fetch("/api/upload", {
        method: "POST",
        headers: await humanProof("upload"),
        body: form,
        signal: AbortSignal.timeout(30000),
      });
      const data = (await r.json()) as { url: string; error?: string };
      if (!r.ok) throw new Error(data.error);
      field("logo", data.url);
      setUploadState("uploaded");
    } catch (e) {
      setUploadState("failed");
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function preview() {
    if (uploadState === "failed" || uploadState === "uploading") return;
    const result = tokenSchema.safeParse(draft);
    if (!result.success) {
      setError(result.error.issues.map((i) => tr(i.message)).join("; "));
      return;
    }
    if (!account) {
      try { await connect(); }
      catch (reason) { setError(message(reason)); return; }
    }
    setDraft(result.data);
    setStep(2);
    setError("");
  }
  const sync = useCallback(async (tx: string) => {
    const result = await api<{
      record: { contractAddress: string; status: "pending" | "active"; url: string } | null;
      confirmations: number;
      requiredConfirmations: number;
    }>("sync", { tx });
    if (!result.record)
      throw new Error(
        tr("收據已讀取，但尚未找到 RovynCore 發射事件；請勿重複付款，稍後再同步。"),
      );
    setPendingHash("");
    setSuccess({ address: result.record.contractAddress, tx, status: result.record.status, confirmations: result.confirmations, requiredConfirmations: result.requiredConfirmations });
    if (result.record.status === "active") {
      sessionStorage.removeItem("genesis:last-transaction");
      localStorage.removeItem("genesis:launch-draft");
    }
  }, [tr]);
  async function launch() {
    setBusy(true);
    setError("");
    try {
      if (!config.platform)
        throw new Error(
          tr("平台合約尚未部署，草稿已保存。管理者可由管理平台完成部署。"),
        );
      if (!accepted) throw new Error(tr("請先確認固定供應與發行風險"));
      const metadata = await api<{ uri: string }>("metadata", tokenSchema.parse(draft));
      setWalletReview(true);
      const tx = await transact({
        kind: "launch",
        title: tr("發射 {0}", { 0: draft.name }),
        to: config.platform,
        data: encodeFunctionData({
          abi: artifacts.GenesisPlatform.abi,
          functionName: "launch",
          args: [
            draft.name,
            draft.symbol,
            parseEther(draft.supply),
            metadata.uri,
          ],
        }),
        value: parseEther(config.launchFee),
        onSubmitted: (hash) => { setWalletReview(false); setPendingHash(hash); },
        details: [
          [tr("Token"), `${draft.name} (${draft.symbol})`],
          [tr("固定供應"), Number(draft.supply).toLocaleString()],
          [tr("接收地址"), tr("目前簽署錢包")],
        ],
      });
      setPendingHash(tx);
      await sync(tx);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!busy) { queueMicrotask(() => setWalletReview(false)); }
  }, [busy]);
  useEffect(() => {
    if (!pendingHash || success?.status === "active") return;
    const timer = setInterval(() => { void sync(pendingHash).catch(() => {}); }, 8000);
    return () => clearInterval(timer);
  }, [pendingHash, success?.status, sync]);
  const pendingSuccessTx = success?.status === "pending" ? success.tx : "";
  useEffect(() => {
    if (!pendingSuccessTx) return;
    const timer = setInterval(() => { void sync(pendingSuccessTx).catch(() => {}); }, 8000);
    return () => clearInterval(timer);
  }, [pendingSuccessTx, sync]);
  const t = (c: Copy4) => c[locale];
  if (success)
    return (
      <main className="rv-section">
        <div className="rv-container--narrow">
          <div className="rv-card rv-card--accent rv-stack" style={{ ["--gap" as string]: "20px" }}>
            <LaunchProgress stage={success.status === "active" ? "active" : "confirming"} confirmations={success.confirmations} required={success.requiredConfirmations} />
            <CheckCircle2 size={44} className="rv-accent" />
            <span className="rv-eyebrow">{tr("A NEW BEGINNING")}</span>
            <h1 className="rv-h2">{draft.name}{tr("已上鏈。")}</h1>
            <p className="rv-body">{success.status === "active"
              ? tr("確認深度已達標，Asset Record 已建立，可在同一份公開紀錄核對來源與鏈上狀態。")
              : tr("發射交易已收錄，Asset Record 正等待確認深度；請勿重複付款，系統會自動更新狀態。")}</p>
            {success.status === "pending" ? <div className="rv-notice" role="status"><Info aria-hidden="true" /><span>{tr("目前確認數：{0} / {1}", { 0: success.confirmations, 1: success.requiredConfirmations })}</span></div> : null}
            <Address value={success.address} locale={locale} />
            <div className="rv-notice"><Info aria-hidden="true" /><span>{tr("本流程不建立流動性。若創作者之後自行開池，池連結屬於外部連結／metadata，不是平台驗證過的池。")}</span></div>
            <div className="rv-stack" style={{ ["--gap" as string]: "10px" }}>
              <h2 className="rv-h3">{t(L.nextTitle)}</h2>
              <ol className="rv-numbered">
                <li><b>{t(L.next1)}</b><span>{t(L.next1b)}</span></li>
                <li><b>{t(L.next2)}</b><span>{t(L.next2b)}</span></li>
                <li><b>{t(L.next3)}</b><span>{t(L.next3b)}</span></li>
              </ol>
            </div>
            <div className="rv-row">
              <Link className="rv-btn rv-btn--primary" href={`/assets/robinhood/${success.address}`}>{tr("開啟 Asset Record")}</Link>
              <Link className="rv-btn rv-btn--secondary" href="/onchain-record?view=mine">{tr("我的發射紀錄")}</Link>
              <a className="rv-btn rv-btn--secondary" target="_blank" rel="noreferrer" href={`${CHAINS[config.chainId].blockExplorers.default.url}/tx/${success.tx}`}>{tr("Explorer")}<ArrowUpRight aria-hidden="true" /></a>
            </div>
          </div>
        </div>
      </main>
    );
  return (
    <main>
      <section className="rv-pagehead">
        <div className="rv-container rv-pagehead__inner">
          <div className="rv-pagehead__copy">
            <span className="rv-eyebrow">{t(L.eyebrow)}</span>
            <h1 className="rv-h1">{tr("讓想法")}<span className="rv-accent">{tr("上鏈。")}</span></h1>
            <p className="rv-lead">{tr("填寫資料、確認費用，再由你的錢包簽署發行。")}</p>
          </div>
          <div className="rv-pagehead__side">
            <span className="rv-pill rv-pill--plain">{CHAINS[config.chainId].name}</span>
            <span className="rv-stat__label">{tr("平台發射費")}</span>
            <span className="rv-stat__value rv-num">{ready ? config.launchFee : "—"} ETH</span>
          </div>
        </div>
      </section>

      <section className="rv-section--tight" style={{ paddingTop: 0 }}>
        <div className="rv-container rv-split rv-split--wide-left">
          <section ref={workflow} className="rv-card rv-stack" style={{ ["--gap" as string]: "22px" }}>
            <ol className="rv-steps" style={{ ["--n" as string]: 3 }}>
              {[L.s1, L.s2, L.s3].map((label, i) => (
                <li key={label.en} className={`rv-step${i + 1 < step ? " is-done" : i + 1 === step ? " is-current" : ""}`}>
                  <span className="rv-step__label">{String(i + 1).padStart(2, "0")}</span>
                  <span className="rv-step__title">{t(label)}</span>
                </li>
              ))}
            </ol>
            {(pendingHash || walletReview) && <LaunchProgress stage={pendingHash ? "submitted" : "wallet"} />}
            {step === 1 ? (
              <form className="rv-stack" style={{ ["--gap" as string]: "18px" }} onSubmit={(e) => { e.preventDefault(); void preview(); }}>
                <label className="rv-upload">
                  <TokenAvatar name={draft.name || "G"} logo={localLogo || draft.logo} />
                  <div>
                    <strong>{tr("Token 圖示")} <span className="rv-caption">{tr("選填")}</span></strong>
                    <p className="rv-caption">{tr("PNG、JPEG、WebP · 最大 2 MB")}</p>
                  </div>
                  <Upload size={20} aria-hidden="true" />
                  <input aria-label={tr("上傳 Token 圖示")} type="file" disabled={busy} accept="image/png,image/jpeg,image/webp"
                    onClick={(e) => { e.currentTarget.value = ""; setError(""); }}
                    onChange={(e) => void upload(e.target.files?.[0])} />
                </label>
                {uploadState !== "idle" && (
                  <div className="rv-small" role="status" aria-live="polite">
                    {tr(uploadState === "uploading" ? "Verifying and uploading image…" : uploadState === "uploaded" ? "Image uploaded successfully." : "Image not uploaded. Retry or remove it to continue.")}
                    {uploadState === "failed" && (
                      <div className="rv-row" style={{ marginTop: 10 }}>
                        <button type="button" className="rv-btn rv-btn--secondary rv-btn--sm" onClick={() => void upload(selectedFile || undefined)}>{tr("Retry image upload")}</button>
                        <button type="button" className="rv-btn rv-btn--secondary rv-btn--sm" onClick={() => { setLocalLogo(""); setSelectedFile(null); setUploadState("idle"); field("logo", ""); }}>{tr("Remove image")}</button>
                      </div>
                    )}
                  </div>
                )}
                <div className="rv-grid rv-grid--2">
                  <div className="rv-field"><label htmlFor="lp-name">{tr("Token 名稱")}</label><input id="lp-name" required maxLength={40} placeholder={tr("例如：你的項目名稱")} value={draft.name} onChange={(e) => field("name", e.target.value)} /></div>
                  <div className="rv-field"><label htmlFor="lp-symbol">{tr("Symbol 代號")}</label><input id="lp-symbol" required maxLength={12} placeholder={tr("例如：TOKEN")} value={draft.symbol} onChange={(e) => field("symbol", e.target.value)} /></div>
                </div>
                <div className="rv-field"><label htmlFor="lp-supply">{tr("總供應量")}</label><input id="lp-supply" required inputMode="numeric" placeholder={tr("例如：10,000,000")} value={draft.supply} onChange={(e) => field("supply", e.target.value)} /><span className="rv-hint">{tr("1 至 1 兆枚；發行後不可增發。固定 18 位小數。")}</span></div>
                <div className="rv-field"><label htmlFor="lp-desc">{tr("項目介紹")}</label><textarea id="lp-desc" required minLength={10} maxLength={2000} rows={4} placeholder={tr("這顆 Token 的故事是什麼？")} value={draft.description} onChange={(e) => field("description", e.target.value)} /></div>
                <div className="rv-field"><label htmlFor="lp-web">{tr("官方網站")} <span className="rv-caption">{tr("選填")}</span></label><input id="lp-web" type="url" placeholder="https://" value={draft.website} onChange={(e) => field("website", e.target.value)} /></div>
                <div className="rv-grid rv-grid--2">
                  <div className="rv-field"><label htmlFor="lp-x">X <span className="rv-caption">{tr("選填")}</span></label><input id="lp-x" type="url" placeholder="https://x.com/…" value={draft.x} onChange={(e) => field("x", e.target.value)} /></div>
                  <div className="rv-field"><label htmlFor="lp-tg">{tr("Telegram")} <span className="rv-caption">{tr("選填")}</span></label><input id="lp-tg" type="url" placeholder="https://t.me/…" value={draft.telegram} onChange={(e) => field("telegram", e.target.value)} /></div>
                </div>
                <div className="rv-field"><label htmlFor="lp-pool">{tr("流動性池／交易連結")} <span className="rv-caption">{tr("選填")}</span></label><input id="lp-pool" type="url" placeholder="https://app.uniswap.org/..." value={draft.liquidityUrl || ""} onChange={(e) => field("liquidityUrl", e.target.value)} /><span className="rv-hint">{tr("平台不會代建流動性池；若你已在 Uniswap 建立交易池，可貼上公開連結，讓探索頁的訪客找到它。")}</span></div>
                {error && <p className="rv-error" role="alert">{error}</p>}
                <div className="rv-row rv-row--between">
                  <div className="rv-row" style={{ ["--gap" as string]: "8px" }}>
                    <span className="rv-caption">{tr("草稿自動保存在此瀏覽器")}</span>
                    <AlertDialog.Root>
                      <AlertDialog.Trigger asChild><button type="button" className="rv-btn rv-btn--ghost" disabled={busy}>{tr("清除已儲存草稿")}</button></AlertDialog.Trigger>
                      <AlertDialog.Portal>
                        <AlertDialog.Overlay className="draft-clear-overlay" />
                        <AlertDialog.Content className="draft-clear-dialog">
                          <AlertDialog.Title>{tr("清除已儲存草稿")}</AlertDialog.Title>
                          <AlertDialog.Description>{tr("確定清除這台裝置儲存的發射草稿？此動作無法復原。")}</AlertDialog.Description>
                          <div className="draft-clear-dialog__actions">
                            <AlertDialog.Cancel asChild><button type="button" className="rv-btn rv-btn--secondary rv-btn--sm">{tr("取消")}</button></AlertDialog.Cancel>
                            <AlertDialog.Action asChild><button type="button" className="rv-btn rv-btn--primary rv-btn--sm" onClick={() => {
                              setDraft(EMPTY_DRAFT); setLocalLogo(""); setSelectedFile(null); setUploadState("idle"); setAccepted(false); setError("");
                              try { localStorage.removeItem("genesis:launch-draft"); } catch {}
                            }}>{tr("清除已儲存草稿")}</button></AlertDialog.Action>
                          </div>
                        </AlertDialog.Content>
                      </AlertDialog.Portal>
                    </AlertDialog.Root>
                  </div>
                  <button className="rv-btn rv-btn--primary" disabled={busy || uploadState === "failed"}>
                    {account ? tr("預覽 Token") : tr("連接錢包以預覽")}<ArrowRight aria-hidden="true" />
                  </button>
                </div>
                <p className="rv-caption">{tr("連接錢包並完成簽署前，不會送出任何交易。")}</p>
              </form>
            ) : (
              <div className="launch-review rv-stack" style={{ ["--gap" as string]: "18px" }} tabIndex={-1}>
                <div className="rv-notice"><Info aria-hidden="true" /><span><strong>{tr("預覽資料，不會送出交易")}</strong> {tr("預覽不會送出交易，也不會建立流動性池。簽署後只會部署固定供應 Token 並建立公開 Asset Record。")}</span></div>
                <div className="rv-row" style={{ ["--gap" as string]: "14px" }}>
                  <TokenAvatar name={draft.name} logo={draft.logo || localLogo} />
                  <div><h2 className="rv-h3">{draft.name}</h2><p className="rv-mono rv-small">${draft.symbol}</p></div>
                </div>
                <p className="rv-body">{draft.description}</p>
                <dl className="rv-receipt">
                  <div><dt>{tr("固定總供應")}</dt><dd>{Number(draft.supply).toLocaleString()}</dd></div>
                  <div><dt>{tr("發射費")}</dt><dd>{ready ? `${config.launchFee} ETH` : tr("載入中…")}</dd></div>
                  <div><dt>{tr("Gas")}</dt><dd>{tr("錢包連接後估算，另計")}</dd></div>
                  <div><dt>{tr("網路")}</dt><dd>{CHAINS[config.chainId].name}</dd></div>
                </dl>
                <label className="rv-check">
                  <Checkbox checked={accepted} onCheckedChange={(v) => setAccepted(v === true)} />
                  <span>{tr("我理解發行不可撤銷，供應量固定，並已閱讀")}<Link href="/legal">{tr("使用條款與風險揭露")}</Link>。</span>
                </label>
                {!config.platform && <div className="rv-notice rv-notice--risk"><Info aria-hidden="true" /><span>{tr("測試網平台準備中。資料可先預覽並保留；管理者請先完成")}<Link href="/admin">{tr("合約部署")}</Link>。</span></div>}
                {error && <p className="rv-error" role="alert">{error}</p>}
                <div className="rv-row">
                  <button type="button" className="rv-btn rv-btn--secondary" disabled={busy} onClick={() => setStep(1)}>{tr("返回編輯")}</button>
                  {pendingHash ? (
                    <button type="button" className="rv-btn rv-btn--primary" disabled={busy} onClick={() => { setBusy(true); sync(pendingHash).catch((e) => setError(message(e))).finally(() => setBusy(false)); }}>{tr("重新同步已付款交易")}</button>
                  ) : (
                    <button type="button" className="rv-btn rv-btn--primary" disabled={!accepted || busy || !ready} onClick={() => void launch()}><Rocket aria-hidden="true" />{busy ? tr("處理中…") : tr("連接錢包、簽署並發射")}</button>
                  )}
                </div>
              </div>
            )}
          </section>
          <aside className="rv-stack rv-sticky" style={{ ["--gap" as string]: "16px" }}>
            <TokenDraftPreview name={draft.name} symbol={draft.symbol} supply={draft.supply} logo={draft.logo || localLogo} />
            <div className="rv-card rv-stack" style={{ ["--gap" as string]: "12px" }}>
              <span className="rv-card__icon" style={{ marginBottom: 0 }}><ShieldCheck aria-hidden="true" /></span>
              <h3 className="rv-h3">{tr("簡單合約。清楚規則。")}</h3>
              <ul className="rv-stack" style={{ ["--gap" as string]: "8px", margin: 0, paddingLeft: 18 }}>
                <li className="rv-small">{tr("固定供應，不可隱藏增發")}</li>
                <li className="rv-small">{tr("Token 買賣不收交易稅")}</li>
                <li className="rv-small">{tr("不可升級的 ERC-20")}</li>
                <li className="rv-small">{tr("全部 Token 交給簽署錢包")}</li>
              </ul>
              <p className="rv-caption">{tr("費用與 Gas 分開顯示。達到確認深度後，自動建立公開 Asset Record。")}</p>
            </div>
            <div className="rv-notice"><Info aria-hidden="true" /><span>{tr("本流程只部署代幣並建立公開紀錄，不建立流動性池。若創作者之後自行開池，池連結只列為外部連結，不代表平台驗證；Token 合約不收買賣交易稅。")}</span></div>
            <p className="rv-caption">{tr("合約規則透明不代表項目沒有風險。請尊重智慧財產權，不冒用品牌、不承諾報酬。")}</p>
          </aside>
        </div>
      </section>
    </main>
  );
}
