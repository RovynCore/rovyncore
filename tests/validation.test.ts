import test from "node:test";
import assert from "node:assert/strict";
import { tokenSchema, EMPTY_DRAFT, trendingScore } from "../lib/validation.ts";
import { DEFAULT_ALLOWLIST_WINDOW, DEFAULT_SALE_DESK, allowlistWindowStatus, allowedPhaseChange, normalizeAllowlistWindow, normalizeSaleDesk, saleIsPubliclyOpen } from "../lib/rvyn-sale-desk.ts";
import { legalCopy } from "../lib/legal-copy.ts";
import { RVYN_MODEL } from "../lib/rvyn-model.ts";
const valid = {
  ...EMPTY_DRAFT,
  name: "Genesis",
  symbol: "GEN",
  supply: "1000000000",
  description: "An original project description.",
};
test("valid creation metadata", () =>
  assert.equal(tokenSchema.parse(valid).supply, "1000000000"));
test("new launch form fields are blank until the creator fills them", () =>
  assert.deepEqual(EMPTY_DRAFT, {
    name: "",
    symbol: "",
    supply: "",
    description: "",
    website: "",
    x: "",
    telegram: "",
    liquidityUrl: "",
    logo: "",
  }));
test("reject unsafe URLs, arbitrary logo paths and ambiguous supply", () => {
  for (const bad of [
    { website: "javascript:alert(1)" },
    { website: "https://user:pass@site.test" },
    { logo: "https://evil.test/logo.svg" },
    { supply: "1e9" },
    { supply: "-1" },
    { supply: "1000000000001" },
    { symbol: "<script>" },
  ])
    assert.equal(tokenSchema.safeParse({ ...valid, ...bad }).success, false);
});
test("UTF8 contract limits respected", () =>
  assert.equal(
    tokenSchema.safeParse({ ...valid, name: "測".repeat(30) }).success,
    false,
  ));
test("natural ranking decays with age and ignores promotional state", () => {
  assert.equal(trendingScore(10, 1000, 1000), 10);
  assert.equal(trendingScore(10, 1000, 87400), 5);
  assert.equal(trendingScore(0, 1000, 1000), 0);
});
test("RVYN sale stage cannot jump from preparation to purchases", () => {
  assert.equal(allowedPhaseChange("allowlist_prep", "sale_open"), false);
  assert.equal(allowedPhaseChange("allowlist_prep", "allowlist_open"), true);
  assert.equal(allowedPhaseChange("allowlist_open", "sale_open"), true);
  assert.equal(allowedPhaseChange("sale_closed", "sale_open"), false);
});
test("public purchase gate requires stage, chain state and onchain allowlist enforcement", () => {
  const saleOpen = { ...DEFAULT_SALE_DESK, phase: "sale_open" as const };
  assert.equal(saleIsPubliclyOpen(saleOpen, true, false), false);
  assert.equal(saleIsPubliclyOpen(saleOpen, false, true), false);
  assert.equal(saleIsPubliclyOpen({ ...saleOpen, phase: "allowlist_open" }, true, true), false);
  assert.equal(saleIsPubliclyOpen(saleOpen, true, true), true);
  assert.equal(normalizeSaleDesk({ phase: "unknown" }).phase, "allowlist_prep");
});
test("allowlist registration window enforces exact opening and closing boundaries", () => {
  const window = { ...DEFAULT_ALLOWLIST_WINDOW, enabled: true, opensAt: 100, closesAt: 200 };
  assert.equal(allowlistWindowStatus(window, 99), "scheduled");
  assert.equal(allowlistWindowStatus(window, 100), "open");
  assert.equal(allowlistWindowStatus(window, 199), "open");
  assert.equal(allowlistWindowStatus(window, 200), "closed");
  assert.equal(allowlistWindowStatus({ ...window, enabled: false }, 150), "disabled");
  assert.equal(allowlistWindowStatus({ ...window, closesAt: 99 }, 100), "disabled");
  assert.deepEqual(normalizeAllowlistWindow({ enabled: true, opensAt: -5, closesAt: 100 }), {
    ...DEFAULT_ALLOWLIST_WINDOW,
    enabled: true,
    closesAt: 100,
  });
});
test("all legal locales distinguish eligibility from an NFT, live sale and allocation", () => {
  for (const [locale, copy] of Object.entries(legalCopy)) {
    assert.ok(copy.sections.some(([title]) => /allowlist|白名單|白名单|허용 목록/i.test(title)), locale);
    assert.ok(copy.sections.some(([, body]) => /NFT/.test(body) && /RVYN/.test(body)), locale);
  }
  const englishAllowlist = legalCopy.en.sections.find(([title]) => title === "Allowlist and sale stages")?.[1] || "";
  assert.match(englishAllowlist, /eligibility to buy RVYN/);
  assert.match(englishAllowlist, /not an NFT/);
  assert.match(englishAllowlist, /not a live sale/);
});
test("RVYN visual allocation uses the audited V5 contract caps, not mock reference figures", () => {
  assert.equal(RVYN_MODEL.contractMainnet.toLowerCase(), "0x545a1ff27596de2f31480df39aa9548f363fc361");
  assert.equal(Number(RVYN_MODEL.supply), 10_000_000);
  assert.deepEqual(RVYN_MODEL.allocations.map(({ tokens }) => tokens), [1_000_000, 5_000_000, 500_000, 1_000_000, 1_000_000, 1_000_000, 500_000]);
  assert.equal(RVYN_MODEL.allocations.reduce((sum, item) => sum + item.tokens, 0), Number(RVYN_MODEL.supply));
  assert.equal(RVYN_MODEL.allocations.reduce((sum, item) => sum + item.percent, 0), 100);
});
