import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import solc from "solc";
import ganache from "ganache";
import { createPublicClient, createWalletClient, custom, defineChain, parseEther, getAddress } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { buildAllowlistTree } from "../lib/allowlist-merkle.ts";

const A = JSON.parse(fs.readFileSync("packages/contracts/v6/artifacts/contracts.json", "utf8"));
Object.assign(A, JSON.parse(fs.readFileSync("packages/contracts/v2/artifacts/contracts.json", "utf8")));
const mocks = JSON.parse(solc.compile(JSON.stringify({
  language: "Solidity",
  sources: { "Mock.sol": { content: fs.readFileSync("tests/fixtures/PresaleDexV6.sol", "utf8") } },
  settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "paris", outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } } },
}), { import: (path) => ({ contents: fs.readFileSync(`node_modules/${path}`, "utf8") }) }));
assert.ok(!mocks.errors?.some((error) => error.severity === "error"), JSON.stringify(mocks.errors));
for (const [name, contract] of Object.entries(mocks.contracts["Mock.sol"])) {
  A[name] = { abi: contract.abi, bytecode: `0x${contract.evm.bytecode.object}` };
}

const DAY = 24 * 60 * 60;
const E = parseEther;
const ZERO = "0x0000000000000000000000000000000000000000";
const State = { Pending: 0, Open: 1, Closed: 2, Settled: 3, Cancelled: 4 };

// One fresh chain + fully deployed (but not yet opened) sale per test.
async function world({ buyersCount = 5, accountsCount = 30, withdrawStepBps = 10_000n, lpLock = 365n * BigInt(DAY) } = {}) {
  const provider = ganache.provider({
    logging: { quiet: true },
    wallet: { totalAccounts: accountsCount, defaultBalance: 1000 },
    chain: { chainId: 31337, hardfork: "shanghai" },
  });
  const chain = defineChain({ id: 31337, name: "Local", nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: ["http://localhost"] } } });
  const client = createPublicClient({ chain, transport: custom(provider), cacheTime: 0 });
  const wallet = createWalletClient({ chain, transport: custom(provider) });
  const accounts = await wallet.getAddresses();
  const [sponsor, teamWallet, lpWallet, stranger] = [accounts[0], accounts[20], accounts[21], accounts[22]];
  void accountsCount;
  const buyers = accounts.slice(1, 1 + buyersCount);
  const tree = buildAllowlistTree(buyers);
  const deploy = async (name, args = [], account = sponsor) => {
    const hash = await wallet.deployContract({ account, abi: A[name].abi, bytecode: A[name].bytecode, args, gas: 14_000_000n });
    const receipt = await client.waitForTransactionReceipt({ hash });
    assert.equal(receipt.status, "success", `${name} deploy`);
    return receipt.contractAddress;
  };
  const send = async (target, name, fn, args = [], account = sponsor, value = 0n) =>
    client.waitForTransactionReceipt({ hash: await wallet.writeContract({ account, address: target, abi: A[name].abi, functionName: fn, args, value, gas: 14_000_000n }) });
  const ok = async (...a) => { const r = await send(...a); assert.equal(r.status, "success", `${a[2]} should succeed`); return r; };
  const no = async (...a) => assert.equal((await send(...a)).status, "reverted", `${a[2]} should revert`);
  const read = (target, name, fn, args = []) => client.readContract({ address: target, abi: A[name].abi, functionName: fn, args });
  const warp = async (seconds) => { await provider.request({ method: "evm_increaseTime", params: [seconds] }); await provider.request({ method: "evm_mine", params: [] }); };

  const token = await deploy("LaunchToken", ["RovynCore", "RVYN", E("10000000"), sponsor]);
  const weth = await deploy("V2WETH");
  const factory = await deploy("V2Factory");
  const router = await deploy("V2Router", [factory, weth]);
  const sale = await deploy("RovynPresaleV6", [token, sponsor, router, teamWallet, lpWallet, lpLock, withdrawStepBps]);
  const S = (fn, args = [], account = sponsor, value = 0n) => send(sale, "RovynPresaleV6", fn, args, account, value);
  const sok = (fn, args = [], account = sponsor, value = 0n) => ok(sale, "RovynPresaleV6", fn, args, account, value);
  const sno = (fn, args = [], account = sponsor, value = 0n) => no(sale, "RovynPresaleV6", fn, args, account, value);
  const sread = (fn, args = []) => read(sale, "RovynPresaleV6", fn, args);
  const bal = (who) => read(token, "LaunchToken", "balanceOf", [who]);
  const prepare = async () => {
    await sok("setAllowlistRoot", [tree.root]);
    await ok(token, "LaunchToken", "approve", [sale, E("10000000")]);
    await sok("depositInventory");
  };
  const openSale = async () => { await prepare(); await sok("open"); };
  const buy = (who, whole) => S("buy", [BigInt(whole), tree.proofFor(who)], who, BigInt(whole) * E("0.0001"));
  return { provider, client, wallet, accounts, sponsor, teamWallet, lpWallet, stranger, buyers, tree, deploy, send, ok, no, read, warp,
    token, weth, factory, router, sale, S, sok, sno, sread, bal, prepare, openSale, buy,
    done: () => provider.disconnect() };
}

test("V6 holds every RVYN inside the contract until settlement; buyers receive nothing on purchase", async () => {
  const w = await world();
  try {
    await w.sno("open"); // no allowlist, no inventory
    await w.prepare();
    await w.sok("setAllowlistRoot", [w.tree.root]);
    await w.sok("open");
    await w.sno("setAllowlistRoot", [w.tree.root]); // locked after open
    assert.equal(await w.bal(w.sale), E("10000000"));
    assert.equal(await w.bal(w.sponsor), 0n, "manager allocation is not released at open");

    await w.sno("buy", [1000n, []], w.stranger, E("0.1")); // no proof
    await w.sno("buy", [1000n, w.tree.proofFor(w.buyers[0])], w.buyers[0], E("0.09")); // wrong payment
    await w.sno("buy", [2501n, w.tree.proofFor(w.buyers[0])], w.buyers[0], 2501n * E("0.0001")); // over per-wallet cap
    await w.buy(w.buyers[0], 1000);
    assert.equal(await w.bal(w.buyers[0]), 0n, "no RVYN is delivered at purchase");
    assert.equal(await w.bal(w.sale), E("10000000"), "contract still holds the whole supply");
    assert.equal(await w.sread("raised"), E("0.1"));
    assert.equal(await w.sread("contributions", [w.buyers[0]]), E("0.1"));
    await w.sno("claim", [], w.buyers[0]); // not settled
    await w.sno("settle", [0n]); // not closed
    await w.sno("withdrawProjectFunds", [1n]);
    await w.sno("distributeProduct", [w.stranger, 1n, `0x${"01".repeat(32)}`]);
    await w.sno("airdrop", [[w.stranger], [1n], `0x${"01".repeat(32)}`]);
  } finally { await w.done(); }
});

test("V6 settles within the 50% floor, seeds the pool by direct mint, locks LP, then buyers claim", async () => {
  const w = await world({ withdrawStepBps: 10_000n });
  try {
    await w.openSale();
    await w.buy(w.buyers[0], 1000); // 0.1 ETH
    await w.buy(w.buyers[1], 500);  // 0.05 ETH
    await w.sok("depositLiquidityRevenue", [], w.sponsor, E("0.02"));
    assert.equal(await w.sread("minPoolEth"), E("0.095")); // 50% of 0.15 + 0.02
    assert.equal(await w.sread("maxPoolEth"), E("0.17"));
    await w.sno("close", [], w.stranger); // anyone cannot close early
    await w.sok("close");
    assert.equal(await w.sread("state"), State.Closed);
    await w.sno("buy", [1n, w.tree.proofFor(w.buyers[2])], w.buyers[2], E("0.0001")); // closed
    await w.sno("settle", [E("0.094")]); // below floor
    await w.sno("settle", [E("0.171")]); // above funds
    await w.sno("settle", [E("0.095")], w.stranger); // stranger before grace
    await w.sok("settle", [E("0.12")]);

    assert.equal(await w.sread("state"), State.Settled);
    const poolEth = await w.sread("initialPoolEth");
    const poolTokens = await w.sread("initialPoolTokens");
    assert.equal(poolEth, E("0.12"));
    assert.equal(poolTokens, E("1200")); // price 0.0001 ETH per RVYN
    const pair = await w.sread("pair");
    const lock = await w.sread("initialLpLock");
    assert.equal(getAddress(await w.read(w.factory, "V2Factory", "getPair", [w.token, w.weth])), getAddress(pair));
    const [r0, r1] = await w.read(pair, "V2Pair", "getReserves");
    const t0 = await w.read(pair, "V2Pair", "token0");
    const [rt, re] = getAddress(t0) === getAddress(w.token) ? [r0, r1] : [r1, r0];
    assert.equal(rt, poolTokens);
    assert.equal(re, poolEth);
    const lpSupply = await w.read(pair, "V2Pair", "totalSupply");
    assert.equal(await w.read(pair, "V2Pair", "balanceOf", [lock]), lpSupply - 1000n, "all LP except burned minimum sits in the lock");
    assert.equal(await w.bal(pair), poolTokens);

    // unsold sale RVYN is burned; manager and team allocations are released at settlement
    assert.equal(await w.sread("unsoldBurned"), E("1000000") - E("1500"));
    assert.equal(await w.read(w.token, "LaunchToken", "totalSupply"), E("10000000") - (E("1000000") - E("1500")));
    assert.equal(await w.bal(w.sponsor), E("500000"));
    const vesting = await w.sread("teamVesting");
    assert.equal(await w.bal(vesting), E("1000000"));

    // claims
    assert.equal(await w.sread("claimableTokensRemaining"), E("1500"));
    await w.sok("claim", [], w.buyers[0]);
    assert.equal(await w.bal(w.buyers[0]), E("1000"));
    await w.sno("claim", [], w.buyers[0]); // second claim
    await w.sno("claim", [], w.stranger); // never bought
    await w.sok("claim", [], w.buyers[1]);
    assert.equal(await w.bal(w.buyers[1]), E("500"));
    assert.equal(await w.sread("claimableTokensRemaining"), 0n);

    // operating funds: 0.15 + 0.02 - 0.12 = 0.05, unlocked in full at once with a 10000 bps step
    assert.equal(await w.sread("operatingFunds"), E("0.05"));
    assert.equal(await w.sread("withdrawableProjectEth"), E("0.05"));
    await w.sno("withdrawProjectFunds", [E("0.0501")]);
    const before = await w.client.getBalance({ address: w.sponsor });
    await w.sok("withdrawProjectFunds", [E("0.05")]);
    assert.ok((await w.client.getBalance({ address: w.sponsor })) > before);
    assert.equal(await w.client.getBalance({ address: w.sale }), 0n, "no ETH is stranded in the sale contract");
  } finally { await w.done(); }
});

test("V6 settlement cannot be blocked by pre-creating the pair or donating WETH/RVYN-less dust to it", async () => {
  for (const variant of ["precreated-pair", "weth-donated", "weth-donated-and-synced"]) {
    const w = await world();
    try {
      await w.openSale();
      await w.buy(w.buyers[0], 1000);
      await w.sok("close");
      // An attacker has no RVYN (it is all inside the sale), so the only things they can do are these:
      await w.ok(w.factory, "V2Factory", "createPair", [w.token, w.weth], w.stranger);
      const pairAddress = await w.read(w.factory, "V2Factory", "getPair", [w.token, w.weth]);
      assert.notEqual(pairAddress, ZERO, `${variant}: pair exists`);
      if (variant !== "precreated-pair") {
        const griefer = await w.deploy("V2Griefer", [], w.stranger);
        await w.ok(griefer, "V2Griefer", "wrapAndSend", [w.weth, pairAddress], w.stranger, E("5"));
        if (variant.endsWith("synced")) await w.ok(pairAddress, "V2Pair", "sync", [], w.stranger);
      }
      await w.sok("settle", [E("0.1")]);
      assert.equal(await w.sread("state"), State.Settled, `${variant}: settled`);
      assert.equal(getAddress(await w.sread("pair")), getAddress(pairAddress));
      await w.sok("claim", [], w.buyers[0]);
      assert.equal(await w.bal(w.buyers[0]), E("1000"), `${variant}: buyer still receives RVYN`);
    } finally { await w.done(); }
  }
});

test("V6 anyone can settle after the grace period, always at the minimum pool, even if the sponsor disappears", async () => {
  const w = await world();
  try {
    await w.openSale();
    await w.buy(w.buyers[0], 2000); // 0.2
    await w.buy(w.buyers[1], 2000); // 0.2
    await w.sno("close", [], w.stranger); // still running
    await w.warp(14 * DAY + 1);
    await w.sok("close", [], w.stranger); // permissionless once the period ended
    await w.sno("settle", [0n], w.stranger); // grace running
    await w.warp(7 * DAY - 60);
    await w.sno("settle", [0n], w.stranger);
    await w.warp(120);
    await w.sok("settle", [E("999")], w.stranger); // the argument is ignored for strangers
    assert.equal(await w.sread("initialPoolEth"), E("0.2")); // 50% of 0.4
    assert.equal(await w.sread("initialPoolTokens"), E("2000"));
    await w.sok("claim", [], w.buyers[0]);
    await w.sok("claim", [], w.buyers[1]);
    assert.equal(await w.bal(w.buyers[0]), E("2000"));
    assert.equal(await w.sread("operatingFunds"), E("0.2"));
  } finally { await w.done(); }
});

test("V6 with a zero raise settles without a pool and still releases the other allocations", async () => {
  const w = await world();
  try {
    await w.openSale();
    await w.sok("close");
    await w.sno("settle", [E("0.01")]); // nothing to put in a pool
    await w.sok("settle", [0n]);
    assert.equal(await w.sread("pair"), ZERO);
    assert.equal(await w.sread("unsoldBurned"), E("1000000"));
    assert.equal(await w.read(w.token, "LaunchToken", "totalSupply"), E("9000000"));
    assert.equal(await w.bal(w.sponsor), E("500000"));
  } finally { await w.done(); }
});

test("V6 spreads operating funds over time when the step is below 100%, and never lets the sponsor exceed it", async () => {
  const w = await world({ withdrawStepBps: 2500n }); // 25% per 30 days, first step at settlement
  try {
    await w.openSale();
    await w.buy(w.buyers[0], 2500); // 0.25 ETH
    await w.sok("close");
    await w.sok("settle", [E("0.125")]);
    assert.equal(await w.sread("operatingFunds"), E("0.125"));
    assert.equal(await w.sread("unlockedProjectEth"), E("0.03125"));
    await w.sno("withdrawProjectFunds", [E("0.0313")]);
    await w.sok("withdrawProjectFunds", [E("0.03125")]);
    await w.sno("withdrawProjectFunds", [1n]);
    await w.warp(30 * DAY);
    assert.equal(await w.sread("withdrawableProjectEth"), E("0.03125"));
    await w.warp(200 * DAY);
    assert.equal(await w.sread("unlockedProjectEth"), E("0.125"));
    await w.sok("withdrawProjectFunds", [E("0.09375")]);
    assert.equal(await w.client.getBalance({ address: w.sale }), 0n);
  } finally { await w.done(); }
});

test("V6 sponsor handover is two-step; a stranger cannot take or accept the role", async () => {
  const w = await world();
  try {
    await w.sno("proposeSponsor", [w.stranger], w.stranger);
    await w.sno("proposeSponsor", [ZERO]);
    await w.sok("proposeSponsor", [w.buyers[0]]);
    await w.sno("acceptSponsor", [], w.stranger);
    assert.equal(getAddress(await w.sread("sponsor")), getAddress(w.sponsor));
    await w.sok("acceptSponsor", [], w.buyers[0]);
    assert.equal(getAddress(await w.sread("sponsor")), getAddress(w.buyers[0]));
    await w.sno("setAllowlistRoot", [w.tree.root], w.sponsor); // old sponsor lost the role
    await w.sok("setAllowlistRoot", [w.tree.root], w.buyers[0]);
  } finally { await w.done(); }
});

test("V6 cancel-before-open returns the inventory; plain ETH transfers are rejected", async () => {
  const w = await world();
  try {
    await w.prepare();
    assert.equal(await w.bal(w.sponsor), 0n);
    await w.sno("cancelBeforeOpen", [], w.stranger);
    await w.sok("cancelBeforeOpen");
    assert.equal(await w.bal(w.sponsor), E("10000000"));
    assert.equal(await w.sread("state"), State.Cancelled);
    await w.sno("open");
    const hash = await w.wallet.sendTransaction({ account: w.stranger, to: w.sale, value: 1n, gas: 200_000n }).catch(() => null);
    if (hash) assert.equal((await w.client.waitForTransactionReceipt({ hash })).status, "reverted");
  } finally { await w.done(); }
});

test("V6 later liquidity uses only the reserved allocation at the live ratio and is locked", async () => {
  const w = await world();
  try {
    await w.openSale();
    await w.buy(w.buyers[0], 1000);
    await w.sok("close");
    await w.sno("addFutureLiquidity", [E("100"), 0n, 0n, 9_999_999_999n], w.sponsor, E("0.01")); // not settled
    await w.sok("settle", [E("0.1")]);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 10 * DAY);
    await w.sno("addFutureLiquidity", [E("100"), 0n, 0n, deadline], w.stranger, E("0.01")); // not sponsor
    await w.sok("addFutureLiquidity", [E("100"), E("100"), E("0.01"), deadline], w.sponsor, E("0.01"));
    assert.equal(await w.sread("lpTokensDeployed"), E("1000") + E("100"));
    await w.sno("addFutureLiquidity", [E("4999000"), 0n, 0n, deadline], w.sponsor, E("500")); // beyond the 4,998,900 still reserved
  } finally { await w.done(); }
});

test("V6 allocation budgets are enforced only after settlement", async () => {
  const w = await world();
  try {
    await w.openSale();
    await w.buy(w.buyers[0], 1000);
    await w.sok("close");
    await w.sok("settle", [E("0.1")]);
    const id = (n) => `0x${String(n).padStart(2, "0").repeat(32)}`;
    await w.sok("distributeProduct", [w.stranger, E("1000000"), id(1)]);
    await w.sno("distributeProduct", [w.stranger, 1n, id(2)]);
    await w.sok("distributeCommunity", [w.stranger, E("1000000"), id(3)]);
    await w.sno("distributeCommunity", [w.stranger, 1n, id(4)]);
    const recipients = w.accounts.slice(2, 22);
    await w.sok("airdrop", [recipients, recipients.map(() => E("25000")), id(5)]);
    await w.sno("airdrop", [[w.accounts[23]], [E("1")], id(6)]); // budget (500k) exhausted
    await w.sno("airdrop", [[...recipients, w.accounts[22]], [...recipients.map(() => 1n), 1n], id(7)]); // 21 recipients
    await w.sno("airdrop", [[recipients[0], recipients[0]], [1n, 1n], id(8)]); // duplicate
    // Buyers can still claim after every budget has been spent: claims draw from their own reserve.
    await w.sok("claim", [], w.buyers[0]);
    assert.equal(await w.bal(w.buyers[0]), E("1000"));
  } finally { await w.done(); }
});

test("V6 invariants: the supply is conserved and nothing owed to buyers can be taken by anyone else", async () => {
  const w = await world({ buyersCount: 5 });
  try {
    await w.openSale();
    const wholes = [2500, 1200, 700, 333, 1];
    for (let i = 0; i < wholes.length; i++) await w.buy(w.buyers[i], wholes[i]);
    const raised = BigInt(wholes.reduce((a, b) => a + b, 0)) * E("0.0001");
    assert.equal(await w.sread("raised"), raised);
    await w.sok("close");
    await w.sok("settle", [raised / 2n + 1n]);
    // spend every other budget the contract allows
    const id = (n) => `0x${String(n).padStart(2, "0").repeat(32)}`;
    await w.sok("distributeProduct", [w.stranger, E("1000000"), id(1)]);
    await w.sok("distributeCommunity", [w.stranger, E("1000000"), id(2)]);
    const recipients = Array.from({ length: 20 }, () => privateKeyToAccount(generatePrivateKey()).address);
    await w.sok("airdrop", [recipients, recipients.map(() => E("25000")), id(3)]);
    // buyers must still be able to claim exactly what they paid for
    for (let i = 0; i < wholes.length; i++) {
      await w.sok("claim", [], w.buyers[i]);
      assert.equal(await w.bal(w.buyers[i]), BigInt(wholes[i]) * E("1"), `buyer ${i}`);
    }
    assert.equal(await w.sread("claimableTokensRemaining"), 0n);
    // what is left in the contract is exactly the unused LP allocation (initial pool consumed its part)
    const poolTokens = await w.sread("initialPoolTokens");
    assert.equal(await w.bal(w.sale), E("5000000") - poolTokens);
    // supply: 10M minus what was burned; LP + sale + manager + team + product + community + airdrop all accounted for
    const burned = await w.sread("unsoldBurned");
    const supply = await w.read(w.token, "LaunchToken", "totalSupply");
    assert.equal(supply, E("10000000") - burned);
    const held = (await w.bal(w.sale)) + (await w.bal(await w.sread("pair"))) + (await w.bal(w.sponsor)) + (await w.bal(await w.sread("teamVesting")))
      + (await w.bal(w.stranger)) + (await Promise.all(recipients.map((r) => w.bal(r)))).reduce((a, b) => a + b, 0n)
      + (await Promise.all(w.buyers.map((b) => w.bal(b)))).reduce((a, b) => a + b, 0n);
    assert.equal(held, supply, "every RVYN is in a known place");
  } finally { await w.done(); }
});

test("V6 closes itself at the hard cap and rejects further buys", async () => {
  const w = await world({ buyersCount: 400, accountsCount: 410 });
  try {
    // 400 allowlisted wallets of 0.25 ETH reach the 100 ETH cap exactly.
    const wallets = w.buyers;
    assert.equal(wallets.length, 400);
    await w.sok("setAllowlistRoot", [w.tree.root]);
    await w.ok(w.token, "LaunchToken", "approve", [w.sale, E("10000000")]);
    await w.sok("depositInventory");
    await w.sok("open");
    for (let i = 0; i < 399; i++) {
      const hash = await w.wallet.writeContract({ account: wallets[i], address: w.sale, abi: A.RovynPresaleV6.abi, functionName: "buy", args: [2500n, w.tree.proofFor(wallets[i])], value: E("0.25"), gas: 300_000n });
      if (i % 100 === 0 || i === 398) assert.equal((await w.client.waitForTransactionReceipt({ hash })).status, "success");
    }
    assert.equal(await w.sread("state"), State.Open);
    await w.buy(wallets[399], 2500);
    assert.equal(await w.sread("raised"), E("100"));
    assert.equal(await w.sread("state"), State.Closed, "reaching the cap closes the sale");
    await w.sno("buy", [1n, w.tree.proofFor(wallets[0])], wallets[0], E("0.0001"));
    await w.sok("settle", [E("50")]);
    assert.equal(await w.sread("initialPoolTokens"), E("500000"));
    assert.equal(await w.sread("unsoldBurned"), 0n);
    await w.sok("claim", [], wallets[399]);
    assert.equal(await w.bal(wallets[399]), E("2500"));
  } finally { await w.done(); }
});