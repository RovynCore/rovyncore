"use client";

import type { ReactNode } from "react";

// Read-only summary of the admin dashboard payload. It never writes anything: it only points to the tab that owns each action.
type Overview = {
  tokens: unknown[];
  reports: unknown[];
  treasuryBalance: string;
  saleStatus: { state: string; raised: string; withdrawable: string; allowlistRoot: string; inventory: string; inventoryAllowance?: string } | null;
  saleDesk: { phase: "allowlist_prep" | "allowlist_open" | "sale_open" | "sale_closed" };
  allowlistWindowStatus: "disabled" | "scheduled" | "open" | "closed";
  allowlistCount: number;
  pendingCount: number;
  approvedCount: number;
  allowlistRootMatchesList: boolean;
};

export type AdminTab = "overview" | "presale" | "platform" | "content" | "settings";

const NEW_SALE = "0x6496fc99ba4d5904e6c99488a9a9f477605146ac";
const ZERO_ROOT = "0x0000000000000000000000000000000000000000000000000000000000000000";
const PHASE_LABEL = { allowlist_prep: "準備中", allowlist_open: "白名單開放", sale_open: "預售開放", sale_closed: "預售結束" } as const;
const CHAIN_STATE = ["尚未開售", "開售中", "已結束", "已結算", "已取消"] as const;
const WINDOW_LABEL = { disabled: "未啟用排程", scheduled: "已排程", open: "登記中", closed: "已截止" } as const;

function Card({ title, value, note, tone, children }: { title: string; value: string; note?: string; tone?: "ok" | "warn" | "idle"; children?: ReactNode }) {
  return (
    <div className={`admin-ov-card admin-ov-card--${tone || "idle"}`}>
      <span className="admin-ov-card__title">{title}</span>
      <strong className="admin-ov-card__value">{value}</strong>
      {note && <span className="admin-ov-card__note">{note}</span>}
      {children}
    </div>
  );
}

export function AdminOverview({ data, sale, multisigSale, onTab }: { data: Overview; sale: string | null | undefined; multisigSale: boolean; onTab: (tab: AdminTab) => void }) {
  const s = data.saleStatus;
  const onNewSale = (sale || "").toLowerCase() === NEW_SALE;
  const rootPublished = Boolean(s && s.allowlistRoot && s.allowlistRoot.toLowerCase() !== ZERO_ROOT && data.allowlistRootMatchesList);
  const inventoryIn = Boolean(s && Number(s.inventory) >= 10_000_000);
  const state = s ? Number(s.state) : -1;
  const steps: Array<{ label: string; done: boolean; tab: AdminTab; hint: string }> = [
    { label: "網站指向新預售合約", done: onNewSale, tab: "presale", hint: "在「預售」分頁登記新合約的部署交易" },
    { label: "開放白名單登記", done: data.saleDesk.phase !== "allowlist_prep", tab: "presale", hint: "設定登記時段，並把網站階段切到「白名單開放」" },
    { label: "審核申請", done: data.pendingCount === 0 && data.allowlistCount + data.approvedCount > 0, tab: "presale", hint: "核准或撤銷待審地址" },
    { label: "發布白名單根值", done: rootPublished, tab: "presale", hint: multisigSale ? "用「多簽提案」下載批次，在 Safe 簽署" : "預覽名單後發布根值" },
    { label: "授權並存入 1,000 萬 RVYN", done: inventoryIn, tab: "presale", hint: multisigSale ? "多簽提案第 2 步" : "預售主要操作的第 1、2 步" },
    { label: "開啟預售", done: state >= 1, tab: "presale", hint: multisigSale ? "多簽提案第 3 步，再把網站階段切到「預售開放」" : "預售主要操作" },
    { label: "結束預售並建池", done: state >= 2, tab: "presale", hint: "結束後再決定首池金額" },
  ];
  const current = steps.findIndex((step) => !step.done);

  return (
    <section data-admin-tab="overview" className="panel admin-overview" aria-labelledby="admin-overview-title">
      <h2 id="admin-overview-title">總覽</h2>
      <div className="admin-ov-grid">
        <Card title="網站階段" value={PHASE_LABEL[data.saleDesk.phase]} note={`登記：${WINDOW_LABEL[data.allowlistWindowStatus]}`} tone={data.saleDesk.phase === "allowlist_prep" ? "idle" : "ok"} />
        <Card title="鏈上預售" value={s ? CHAIN_STATE[state] || "未知" : "未連線"} note={s ? `募得 ${s.raised} ETH` : "請重新載入管理資料"} tone={state === 1 ? "ok" : "idle"} />
        <Card title="白名單" value={`${data.allowlistCount.toLocaleString()} 位有效`} note={`待審 ${data.pendingCount.toLocaleString()} · 已核准 ${data.approvedCount.toLocaleString()}`} tone={data.pendingCount > 0 ? "warn" : "idle"} />
        <Card title="預售合約" value={onNewSale ? "新 V5（多簽）" : sale ? "舊 V5（單一錢包）" : "未登記"} note={sale ? `${sale.slice(0, 8)}…${sale.slice(-6)}` : undefined} tone={onNewSale ? "ok" : "warn"} />
        <Card title="平台待提領費用" value={`${data.treasuryBalance} ETH`} note="發射費與 Boost 收入" tone="idle" />
        <Card title="內容" value={`${data.tokens.length.toLocaleString()} 個 Token`} note={data.reports.length ? `${data.reports.length.toLocaleString()} 筆檢舉待看` : "沒有檢舉"} tone={data.reports.length ? "warn" : "idle"} />
      </div>
      <h3 className="top-gap">開售進度</h3>
      <ol className="admin-ov-steps">
        {steps.map((step, index) => (
          <li key={step.label} className={step.done ? "is-done" : index === current ? "is-current" : ""}>
            <span className="admin-ov-steps__mark" aria-hidden="true">{step.done ? "✓" : index + 1}</span>
            <span className="admin-ov-steps__text"><b>{step.label}</b>{index === current && <small>{step.hint}</small>}</span>
            {index === current && <button type="button" className="secondary" onClick={() => onTab(step.tab)}>前往</button>}
          </li>
        ))}
      </ol>
      <p className="side-note">{current === -1 ? "所有步驟都已完成。" : "每個步驟完成後會自動打勾；這裡只顯示狀態，不會送出任何交易。"}</p>
    </section>
  );
}
