import type { HealthConfig } from "./rvyn-health";

// Addresses are the ones published on /transparency (checked 2026-10-06; the sale is the V6 contract). When a new presale contract
// is deployed, change `sale` here and on /transparency; nothing else in the health panel is address-specific.
export const RVYN_HEALTH_CONFIG: HealthConfig = {
  chainId: 4663,
  token: "0x545a1ff27596de2f31480df39aa9548f363fc361",
  sale: "0xfa2bd13fbeee08b18087ee157b2752158598f888",
  wallets: [
    { id: "admin", address: "0xee4c435b9207ba5bb5f4860156409ae78032ff6e" },
    { id: "safe", address: "0xe574e30153efcd94f686124b2d586a0643b33ef4" },
  ],
};
