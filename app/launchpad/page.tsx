"use client";
import { useLanguage } from "@/components/language-provider";
import { humanProof } from "@/components/human-verification";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "@/components/site-link";
import { encodeFunctionData, parseEther } from "viem";
import {
  Rocket,
  ShieldCheck,
  Upload,
  ArrowRight,
  CheckCircle2,
  Info,
} from "lucide-react";
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

export default function Launch() {
  const { tr } = useLanguage();

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
  if (success)
    return (
      <main className="workspace narrow launchpad-page">
        <div className="success-panel">
          <LaunchProgress stage={success.status === "active" ? "active" : "confirming"} confirmations={success.confirmations} required={success.requiredConfirmations} />
          <CheckCircle2 size={52} />
          <div className="eyebrow">{tr("A NEW BEGINNING")}</div>
          <h1>
            {draft.name}
            {tr("已上鏈。")}
          </h1>
          <p>{success.status === "active"
            ? tr("確認深度已達標，Asset Record 已建立，可在同一份公開紀錄核對來源與鏈上狀態。")
            : tr("發射交易已收錄，Asset Record 正等待確認深度；請勿重複付款，系統會自動更新狀態。")}</p>
          {success.status === "pending" ? <p className="notice" role="status">{tr("目前確認數：{0} / {1}", { 0: success.confirmations, 1: success.requiredConfirmations })}</p> : null}
          <section className="post-launch-guide"><div className="eyebrow">{tr("LAUNCH RECORD")}</div><p>{tr("本流程不建立流動性。若創作者之後自行開池，池連結屬於外部連結／metadata，不是平台驗證過的池。")}</p></section>
          <code className="address">{success.address}</code>
          <div className="actions">
            <Link className="primary" href={`/assets/robinhood/${success.address}`}>
              {tr("開啟 Asset Record")}
            </Link>
            <Link className="secondary" href="/onchain-record?view=mine">{tr("我的發射紀錄")}</Link>
            <a
              className="secondary"
              target="_blank"
              rel="noreferrer"
              href={`${CHAINS[config.chainId].blockExplorers.default.url}/tx/${success.tx}`}
            >
              {tr("Explorer")}
            </a>
          </div>
        </div>
      </main>
    );
  return (
    <main className="workspace launchpad-page">
      <div className="eyebrow">{tr("CREATE / LAUNCH / MAKE YOUR MARK")}</div>
      <div className="title-row">
        <div>
          <h1>
            {tr("讓想法")}
            <span>{tr("上鏈。")}</span>
          </h1>
          <p>{tr("填寫資料、確認費用，再由你的錢包簽署發行。")}</p>
        </div>
        <span className="network-badge">{CHAINS[config.chainId].name}</span>
      </div>
      <div className="launch-grid">
        <section ref={workflow} className="panel launch-workflow">
          <div className="steps">
            <span className={step === 1 ? "current" : ""}>
              {tr("01 Token 資料")}
            </span>
            <ArrowRight size={16} />
            <span className={step === 2 ? "current" : ""}>
              {tr("02 預覽與發射")}
            </span>
          </div>
          {(pendingHash || walletReview) && <LaunchProgress stage={pendingHash ? "submitted" : "wallet"} />}
          {step === 1 && <div className="launch-draft-mobile"><TokenDraftPreview name={draft.name} symbol={draft.symbol} supply={draft.supply} logo={draft.logo || localLogo} /></div>}
          {step === 1 ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void preview();
              }}
            >
              <label className="upload">
                <TokenAvatar
                  name={draft.name || "G"}
                  logo={localLogo || draft.logo}
                />
                <div>
                  <strong>
                    {tr("Token 圖示")}
                    {" "}
                    <span className="muted">{tr("選填")}</span>
                  </strong>
                  <p>{tr("PNG、JPEG、WebP · 最大 2 MB")}</p>
                </div>
                <Upload size={20} />
                <input
                  aria-label={tr("上傳 Token 圖示")}
                  type="file"
                  disabled={busy}
                  accept="image/png,image/jpeg,image/webp"
                  onClick={(e) => {
                    e.currentTarget.value = "";
                    setError("");
                  }}
                  onChange={(e) => void upload(e.target.files?.[0])}
                />
              </label>
              {uploadState !== "idle" && (
                <div role="status" aria-live="polite" style={{ marginTop: 12 }}>
                  {tr(
                    uploadState === "uploading"
                      ? "Verifying and uploading image…"
                      : uploadState === "uploaded"
                        ? "Image uploaded successfully."
                        : "Image not uploaded. Retry or remove it to continue.",
                  )}
                  {uploadState === "failed" && (
                    <div className="actions">
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => void upload(selectedFile || undefined)}
                      >
                        {tr("Retry image upload")}
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => {
                          setLocalLogo("");
                          setSelectedFile(null);
                          setUploadState("idle");
                          field("logo", "");
                        }}
                      >
                        {tr("Remove image")}
                      </button>
                    </div>
                  )}
                </div>
              )}
              <div className="form-grid">
                <label>
                  {tr("Token 名稱")}
                  <input
                    required
                    maxLength={40}
                    placeholder={tr("例如：你的項目名稱")}
                    value={draft.name}
                    onChange={(e) => field("name", e.target.value)}
                  />
                </label>
                <label>
                  {tr("Symbol 代號")}
                  <input
                    required
                    maxLength={12}
                    placeholder={tr("例如：TOKEN")}
                    value={draft.symbol}
                    onChange={(e) => field("symbol", e.target.value)}
                  />
                </label>
                <label className="full">
                  {tr("總供應量")}
                  <input
                    required
                    inputMode="numeric"
                    placeholder={tr("例如：10,000,000")}
                    value={draft.supply}
                    onChange={(e) => field("supply", e.target.value)}
                  />
                  <small>
                    {tr("1 至 1 兆枚；發行後不可增發。固定 18 位小數。")}
                  </small>
                </label>
                <label className="full">
                  {tr("項目介紹")}
                  <textarea
                    required
                    minLength={10}
                    maxLength={2000}
                    rows={4}
                    placeholder={tr("這顆 Token 的故事是什麼？")}
                    value={draft.description}
                    onChange={(e) => field("description", e.target.value)}
                  />
                </label>
                <label className="full">
                  {tr("官方網站")}
                  {" "}
                  <span className="muted">{tr("選填")}</span>
                  <input
                    type="url"
                    placeholder="https://"
                    value={draft.website}
                    onChange={(e) => field("website", e.target.value)}
                  />
                </label>
                <label>
                  X <span className="muted">{tr("選填")}</span>
                  <input
                    type="url"
                    placeholder="https://x.com/…"
                    value={draft.x}
                    onChange={(e) => field("x", e.target.value)}
                  />
                </label>
                <label>
                  {tr("Telegram")} <span className="muted">{tr("選填")}</span>
                  <input
                    type="url"
                    placeholder="https://t.me/…"
                    value={draft.telegram}
                    onChange={(e) => field("telegram", e.target.value)}
                  />
                </label>
                <label className="full">
                  {tr("流動性池／交易連結")}
                  {" "}
                  <span className="muted">{tr("選填")}</span>
                  <input
                    type="url"
                    placeholder="https://app.uniswap.org/..."
                    value={draft.liquidityUrl || ""}
                    onChange={(e) => field("liquidityUrl", e.target.value)}
                  />
                  <small>
                    {tr(
                      "平台不會代建流動性池；若你已在 Uniswap 建立交易池，可貼上公開連結，讓探索頁的訪客找到它。",
                    )}
                  </small>
                </label>
              </div>
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <div className="form-bottom">
                <div className="launch-draft-tools">
                  <span>{tr("草稿自動保存在此瀏覽器")}</span>
                  <AlertDialog.Root>
                    <AlertDialog.Trigger asChild><button type="button" className="text-button" disabled={busy}>{tr("清除已儲存草稿")}</button></AlertDialog.Trigger>
                    <AlertDialog.Portal>
                      <AlertDialog.Overlay className="draft-clear-overlay" />
                      <AlertDialog.Content className="draft-clear-dialog">
                        <AlertDialog.Title>{tr("清除已儲存草稿")}</AlertDialog.Title>
                        <AlertDialog.Description>{tr("確定清除這台裝置儲存的發射草稿？此動作無法復原。")}</AlertDialog.Description>
                        <div className="draft-clear-dialog__actions">
                          <AlertDialog.Cancel asChild><button type="button" className="secondary">{tr("取消")}</button></AlertDialog.Cancel>
                          <AlertDialog.Action asChild><button type="button" className="primary" onClick={() => {
                            setDraft(EMPTY_DRAFT);
                            setLocalLogo("");
                            setSelectedFile(null);
                            setUploadState("idle");
                            setAccepted(false);
                            setError("");
                            try { localStorage.removeItem("genesis:launch-draft"); } catch {}
                          }}>{tr("清除已儲存草稿")}</button></AlertDialog.Action>
                        </div>
                      </AlertDialog.Content>
                    </AlertDialog.Portal>
                  </AlertDialog.Root>
                </div>
                <button
                  className="primary"
                  disabled={busy || uploadState === "failed"}
                >
                  {account ? tr("預覽 Token") : tr("連接錢包以預覽")}
                  <ArrowRight size={16} />
                </button>
              </div>
              <p className="launch-connect-note">{tr("連接錢包並完成簽署前，不會送出任何交易。")}</p>
            </form>
          ) : (
            <div className="launch-review" tabIndex={-1}>
              <div className="launch-preview-note"><Info size={17} /><div><strong>{tr("預覽資料，不會送出交易")}</strong><p>{tr("預覽不會送出交易，也不會建立流動性池。簽署後只會部署固定供應 Token 並建立公開 Asset Record。")}</p></div></div>
              <div className="token-title">
                <TokenAvatar name={draft.name} logo={draft.logo || localLogo} />
                <div>
                  <h2>{draft.name}</h2>
                  <p className="muted">${draft.symbol}</p>
                </div>
              </div>
              <p className="description">{draft.description}</p>
              <dl className="receipt">
                <dt>{tr("固定總供應")}</dt>
                <dd>{Number(draft.supply).toLocaleString()}</dd>
                <dt>{tr("發射費")}</dt>
                <dd>{ready ? `${config.launchFee} ETH` : tr("載入中…")}</dd>
                <dt>{tr("Gas")}</dt>
                <dd>{tr("錢包連接後估算，另計")}</dd>
                <dt>{tr("網路")}</dt>
                <dd>{CHAINS[config.chainId].name}</dd>
              </dl>
              <label className="check-line">
                <Checkbox
                  checked={accepted}
                  onCheckedChange={(v) => setAccepted(v === true)}
                />
                <span>
                  {tr("我理解發行不可撤銷，供應量固定，並已閱讀")}
                  <Link href="/legal">{tr("使用條款與風險揭露")}</Link>。
                </span>
              </label>
              {!config.platform && (
                <p className="notice">
                  {tr("測試網平台準備中。資料可先預覽並保留；管理者請先完成")}
                  <Link href="/admin">{tr("合約部署")}</Link>。
                </p>
              )}
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <div className="actions">
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => setStep(1)}
                >
                  {tr("返回編輯")}
                </button>
                {pendingHash ? (
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() => {
                      setBusy(true);
                      sync(pendingHash)
                        .catch((e) => setError(message(e)))
                        .finally(() => setBusy(false));
                    }}
                  >
                    {tr("重新同步已付款交易")}
                  </button>
                ) : (
                  <button
                    className="primary"
                    disabled={!accepted || busy || !ready}
                    onClick={() => void launch()}
                  >
                    <Rocket size={17} />
                    {busy ? tr("處理中…") : tr("連接錢包、簽署並發射")}
                  </button>
                )}
              </div>
            </div>
          )}
        </section>
        <aside>
          <TokenDraftPreview name={draft.name} symbol={draft.symbol} supply={draft.supply} logo={draft.logo || localLogo} />
          <div className="panel launch-summary">
            <ShieldCheck size={28} />
            <h3>{tr("簡單合約。清楚規則。")}</h3>
            <ul>
              <li>{tr("固定供應，不可隱藏增發")}</li>
              <li>{tr("Token 買賣不收交易稅")}</li>
              <li>{tr("不可升級的 ERC-20")}</li>
              <li>{tr("全部 Token 交給簽署錢包")}</li>
            </ul>
            <div className="divider" />
            <span className="muted">{tr("平台發射費")}</span>
            <strong className="fee">
              {ready ? config.launchFee : "—"} <small>ETH</small>
            </strong>
            <p className="muted">
              {tr("費用與 Gas 分開顯示。達到確認深度後，自動建立公開 Asset Record。")}
            </p>
          </div>
          <div className="panel launch-disclosure">
            <div className="launch-disclosure__label">
              {tr("流動性與交易說明")}
            </div>
            <p>
              {tr(
                "本流程只部署代幣並建立公開紀錄，不建立流動性池。若創作者之後自行開池，池連結只列為外部連結，不代表平台驗證；Token 合約不收買賣交易稅。",
              )}
            </p>
            <p className="muted">
              {tr(
                "流動性狀態只記錄平台觀測到的資訊或創作者提供的連結，不代表交易池經平台核驗。",
              )}
            </p>
          </div>
          <p className="side-note">
            {tr(
              "合約規則透明不代表項目沒有風險。請尊重智慧財產權，不冒用品牌、不承諾報酬。",
            )}
          </p>
        </aside>
      </div>
    </main>
  );
}
