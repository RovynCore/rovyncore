export const SALE_PHASES = ["allowlist_prep", "allowlist_open", "sale_open", "sale_closed"] as const;
export type SalePhase = (typeof SALE_PHASES)[number];

export type SaleDesk = {
  phase: SalePhase;
  updatedAt: number;
  updatedBy: string;
  reason: string;
};

export type AllowlistWindow = {
  enabled: boolean;
  opensAt: number;
  closesAt: number;
  updatedAt: number;
  updatedBy: string;
};

export const DEFAULT_SALE_DESK: SaleDesk = {
  phase: "allowlist_prep",
  updatedAt: 0,
  updatedBy: "system",
  reason: "Allowlist registry is being prepared",
};

export const DEFAULT_ALLOWLIST_WINDOW: AllowlistWindow = {
  enabled: false,
  opensAt: 0,
  closesAt: 0,
  updatedAt: 0,
  updatedBy: "system",
};

export type AllowlistWindowStatus = "disabled" | "scheduled" | "open" | "closed";

export function allowlistWindowKey(chainId: number) {
  return `rvyn:allowlist-window:${chainId}`;
}

export function normalizeAllowlistWindow(value: unknown): AllowlistWindow {
  if (!value || typeof value !== "object") return DEFAULT_ALLOWLIST_WINDOW;
  const data = value as Partial<AllowlistWindow>;
  return {
    enabled: data.enabled === true,
    opensAt: Number.isSafeInteger(data.opensAt) && Number(data.opensAt) >= 0 ? Number(data.opensAt) : 0,
    closesAt: Number.isSafeInteger(data.closesAt) && Number(data.closesAt) >= 0 ? Number(data.closesAt) : 0,
    updatedAt: Number.isSafeInteger(data.updatedAt) && Number(data.updatedAt) >= 0 ? Number(data.updatedAt) : 0,
    updatedBy: typeof data.updatedBy === "string" ? data.updatedBy : "system",
  };
}

export function allowlistWindowStatus(window: AllowlistWindow, timestamp = Math.floor(Date.now() / 1000)): AllowlistWindowStatus {
  if (!window.enabled || window.opensAt <= 0 || window.closesAt <= window.opensAt) return "disabled";
  if (timestamp < window.opensAt) return "scheduled";
  if (timestamp < window.closesAt) return "open";
  return "closed";
}

export function saleDeskKey(chainId: number) {
  return `rvyn:sale-desk:${chainId}`;
}

export function normalizeSaleDesk(value: unknown): SaleDesk {
  if (!value || typeof value !== "object") return DEFAULT_SALE_DESK;
  const data = value as Partial<SaleDesk>;
  return {
    phase: SALE_PHASES.includes(data.phase as SalePhase) ? data.phase as SalePhase : DEFAULT_SALE_DESK.phase,
    updatedAt: Number.isSafeInteger(data.updatedAt) ? Number(data.updatedAt) : 0,
    updatedBy: typeof data.updatedBy === "string" ? data.updatedBy : "system",
    reason: typeof data.reason === "string" ? data.reason : "",
  };
}

export function allowedPhaseChange(current: SalePhase, next: SalePhase) {
  if (current === next) return false;
  if (current === "allowlist_prep") return next === "allowlist_open";
  if (current === "allowlist_open") return next === "allowlist_prep" || next === "sale_open";
  if (current === "sale_open") return next === "sale_closed";
  return false;
}

export function saleIsPubliclyOpen(desk: SaleDesk, chainSaleActive: boolean, allowlistContractVerified: boolean) {
  return desk.phase === "sale_open" && chainSaleActive && allowlistContractVerified;
}

export function allowlistRootKey(chainId: number) {
  return `rvyn:allowlist-root:${chainId}`;
}
