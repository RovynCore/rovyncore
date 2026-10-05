"use client";

import { useMemo, useState } from "react";
import { encodeFunctionData, isAddress, parseAbi, parseEther } from "viem";
import { toast } from "sonner";
import { useLanguage } from "@/components/language-provider";
import type { Locale } from "@/lib/translations";
import { RVYN_MODEL } from "@/lib/rvyn-model";

type Copy = Record<Locale, string>;

const SAFE_DEFAULT = "0xe574e30153efcd94F686124B2d586A0643b33Ef4";
const CHAIN_ID = 4663;
const TOKEN = RVYN_MODEL.contractMainnet;

const copy = {
  title: { en: "Multisig proposals (Safe)", "zh-Hant": "多簽提案（Safe）", "zh-Hans": "多签提案（Safe）", ko: "멀티시그 제안 (Safe)" },
  note: { en: "When the sale sponsor is a Safe, on-chain steps cannot be sent from this page. Pick a step, download the prepared batch, import it in the Safe Transaction Builder, then collect two signatures there. Nothing is sent from here.", "zh-Hant": "預售發起人是 Safe 多簽時，鏈上步驟無法從本頁直接送出。選一個步驟、下載準備好的交易批次、在 Safe 的 Transaction Builder 匯入，並在那裡收集兩個簽署。本頁不會送出任何交易。", "zh-Hans": "预售发起人是 Safe 多签时，链上步骤无法从本页直接发送。选一个步骤、下载准备好的交易批次、在 Safe 的 Transaction Builder 导入，并在那里收集两个签署。本页不会发送任何交易。", ko: "세일 스폰서가 Safe일 때 온체인 단계는 이 페이지에서 직접 보낼 수 없습니다. 단계를 고르고 준비된 배치를 내려받아 Safe Transaction Builder에서 가져온 뒤 그곳에서 서명 두 개를 모으세요. 이 페이지는 거래를 보내지 않습니다." },
  safe: { en: "Safe address", "zh-Hant": "Safe 地址", "zh-Hans": "Safe 地址", ko: "Safe 주소" },
  sale: { en: "Sale contract", "zh-Hant": "預售合約", "zh-Hans": "预售合约", ko: "세일 컨트랙트" },
  step: { en: "Step", "zh-Hant": "步驟", "zh-Hans": "步骤", ko: "단계" },
  root: { en: "Whitelist root", "zh-Hant": "白名單根值", "zh-Hans": "白名单根值", ko: "화이트리스트 루트" },
  rootMissing: { en: "Generate the whitelist root above first.", "zh-Hant": "請先在上方產生白名單根值。", "zh-Hans": "请先在上方生成白名单根值。", ko: "먼저 위에서 화이트리스트 루트를 생성하세요." },
  invalid: { en: "Check the Safe and sale addresses.", "zh-Hant": "請檢查 Safe 與預售合約地址。", "zh-Hans": "请检查 Safe 与预售合约地址。", ko: "Safe와 세일 컨트랙트 주소를 확인하세요." },
  contents: { en: "Calls in this batch", "zh-Hant": "此批次內容", "zh-Hans": "此批次内容", ko: "이 배치의 호출" },
  download: { en: "Download Safe batch (JSON)", "zh-Hant": "下載 Safe 批次檔（JSON）", "zh-Hans": "下载 Safe 批次文件（JSON）", ko: "Safe 배치 다운로드 (JSON)" },
  openSafe: { en: "Open Transaction Builder", "zh-Hant": "開啟 Transaction Builder", "zh-Hans": "打开 Transaction Builder", ko: "Transaction Builder 열기" },
  copy: { en: "Copy calldata", "zh-Hant": "複製 calldata", "zh-Hans": "复制 calldata", ko: "calldata 복사" },
  copied: { en: "Copied", "zh-Hant": "已複製", "zh-Hans": "已复制", ko: "복사됨" },
  after: { en: "After it executes, switch the site stage above so the public page follows.", "zh-Hant": "執行完成後，請在上方切換網站階段，公開頁面才會同步。", "zh-Hans": "执行完成后，请在上方切换网站阶段，公开页面才会同步。", ko: "실행 후 위에서 사이트 단계를 전환해야 공개 페이지가 따라갑니다." },
  sRoot: { en: "1 · Publish whitelist root", "zh-Hant": "1・發布白名單根值", "zh-Hans": "1・发布白名单根值", ko: "1 · 화이트리스트 루트 게시" },
  sDeposit: { en: "2 · Deposit RVYN inventory (approve + deposit)", "zh-Hant": "2・存入 RVYN 庫存（授權＋存入）", "zh-Hans": "2・存入 RVYN 库存（授权＋存入）", ko: "2 · RVYN 재고 입금 (승인 + 입금)" },
  sOpen: { en: "3 · Open the sale", "zh-Hant": "3・開啟預售", "zh-Hans": "3・开启预售", ko: "3 · 세일 열기" },
  sClose: { en: "4 · Close the sale", "zh-Hant": "4・結束預售", "zh-Hans": "4・结束预售", ko: "4 · 세일 종료" },
} satisfies Record<string, Copy>;

const SALE_ABI = parseAbi([
  "function setAllowlistRoot(bytes32 newRoot)",
  "function depositInventory()",
  "function open()",
  "function close()",
]);
const ERC20_ABI = parseAbi(["function approve(address spender, uint256 amount) returns (bool)"]);

type StepKey = "root" | "deposit" | "open" | "close";
type Call = { to: string; name: string; inputs: Array<{ internalType: string; name: string; type: string }>; values: Record<string, string>; data: `0x${string}` };

function buildCalls(step: StepKey, sale: `0x${string}`, root: string): Call[] | null {
  if (step === "root") {
    if (!/^0x[0-9a-fA-F]{64}$/.test(root)) return null;
    return [{ to: sale, name: "setAllowlistRoot", inputs: [{ internalType: "bytes32", name: "newRoot", type: "bytes32" }], values: { newRoot: root }, data: encodeFunctionData({ abi: SALE_ABI, functionName: "setAllowlistRoot", args: [root as `0x${string}`] }) }];
  }
  if (step === "deposit") {
    const amount = parseEther("10000000");
    return [
      { to: TOKEN, name: "approve", inputs: [{ internalType: "address", name: "spender", type: "address" }, { internalType: "uint256", name: "amount", type: "uint256" }], values: { spender: sale, amount: amount.toString() }, data: encodeFunctionData({ abi: ERC20_ABI, functionName: "approve", args: [sale, amount] }) },
      { to: sale, name: "depositInventory", inputs: [], values: {}, data: encodeFunctionData({ abi: SALE_ABI, functionName: "depositInventory" }) },
    ];
  }
  const name = step === "open" ? "open" : "close";
  return [{ to: sale, name, inputs: [], values: {}, data: encodeFunctionData({ abi: SALE_ABI, functionName: name }) }];
}

export function SafeProposalPanel({ sale, root }: { sale?: string | null; root?: string | null }) {
  const { locale } = useLanguage();
  const t = (value: Copy) => value[locale];
  const [safe, setSafe] = useState(SAFE_DEFAULT);
  const [saleAddress, setSaleAddress] = useState(sale || "");
  const [step, setStep] = useState<StepKey>("root");
  const saleInput = (saleAddress || sale || "").trim();
  const valid = isAddress(safe.trim()) && isAddress(saleInput);

  const calls = useMemo(() => (valid ? buildCalls(step, saleInput as `0x${string}`, root || "") : null), [valid, step, saleInput, root]);
  const needsRoot = step === "root" && !calls;

  function batchJson() {
    return JSON.stringify({
      version: "1.0",
      chainId: String(CHAIN_ID),
      createdAt: Date.now(),
      meta: { name: `RovynCore sale · ${step}`, description: "Prepared by the RovynCore admin page. Review every call before signing." },
      transactions: (calls || []).map((c) => ({
        to: c.to, value: "0", data: null,
        contractMethod: { inputs: c.inputs, name: c.name, payable: false },
        contractInputsValues: c.values,
      })),
    }, null, 2);
  }
  function download() {
    const blob = new Blob([batchJson()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `rovyncore-safe-${step}.json`; a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const builderUrl = `https://app.safe.global/apps/open?safe=robinhood:${safe.trim()}&appUrl=${encodeURIComponent("https://apps-portal.safe.global/tx-builder")}`;
  const steps: Array<[StepKey, Copy]> = [["root", copy.sRoot], ["deposit", copy.sDeposit], ["open", copy.sOpen], ["close", copy.sClose]];

  return (
    <section data-admin-tab="presale" className="panel safe-proposal-panel">
      <h2>{t(copy.title)}</h2>
      <p className="side-note">{t(copy.note)}</p>
      <label className="block top-gap" htmlFor="safe-address">{t(copy.safe)}</label>
      <input id="safe-address" value={safe} onChange={(e) => setSafe(e.target.value)} spellCheck={false} />
      <label className="block top-gap" htmlFor="safe-sale">{t(copy.sale)}</label>
      <input id="safe-sale" value={saleAddress} onChange={(e) => setSaleAddress(e.target.value)} placeholder={sale || "0x…"} spellCheck={false} />
      <label className="block top-gap" htmlFor="safe-step">{t(copy.step)}</label>
      <select id="safe-step" value={step} onChange={(e) => setStep(e.target.value as StepKey)}>
        {steps.map(([key, label]) => <option key={key} value={key}>{t(label)}</option>)}
      </select>
      {step === "root" && <p className="side-note">{t(copy.root)}: <code>{root || "—"}</code></p>}
      {!valid && <p className="side-note">{t(copy.invalid)}</p>}
      {valid && needsRoot && <p className="side-note">{t(copy.rootMissing)}</p>}
      {calls && (
        <>
          <h3 className="top-gap">{t(copy.contents)}</h3>
          <ol className="admin-quick-steps">
            {calls.map((c, i) => (
              <li key={`${c.name}-${i}`}>
                <code>{c.name}({Object.values(c.values).join(", ")})</code> → <code className="address">{c.to}</code>
              </li>
            ))}
          </ol>
          <div className="top-gap" style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <button type="button" className="primary" onClick={download}>{t(copy.download)}</button>
            <a className="secondary button-like" href={builderUrl} target="_blank" rel="noreferrer">{t(copy.openSafe)} ↗</a>
            <button type="button" className="secondary" onClick={() => { void navigator.clipboard.writeText(calls.map((c) => `${c.to}\n${c.data}`).join("\n\n")).then(() => toast.success(t(copy.copied))); }}>{t(copy.copy)}</button>
          </div>
          <p className="side-note">{t(copy.after)}</p>
        </>
      )}
    </section>
  );
}
