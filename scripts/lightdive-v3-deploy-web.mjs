// Deploys and wires the Lightdive v3 contracts (candidate, unaudited) by signing in the browser wallet, with no private
// key anywhere: this script serves a page on this computer only (http://127.0.0.1:8790), prepares each transaction,
// the page hands it to the wallet (MetaMask) to sign and send, and the script checks the receipt before moving on.
//
//   npm run lightdive:v3:deploy:web                      Robinhood Chain testnet (46630), with test RVYN and its faucet
//   npm run lightdive:v3:deploy:web -- --network local   a local chain at RPC_URL (scripts/lightdive-v3-localnet.mjs)
//
// The steps and the record (tmp/lightdive-v3-deploy-<network>-<chainId>.json) are the same as lightdive-v3-deploy.mjs,
// so a run that stops halfway (a rejected signature, a closed tab) continues where it stopped. Each sent transaction is
// checked: from the deployer, to the expected address, carrying exactly the prepared data. Mainnet is not offered here
// (it is handed to the multisig, see docs/lightdive/MAINNET-SWITCH.md). At the end it writes
// packages/web3/lightdive-v3.json (testnet) or tmp/lightdive-v3-local.json (local), which the website reads.
import fs from "node:fs";
import http from "node:http";
import { createPublicClient, defineChain, encodeDeployData, encodeFunctionData, getAddress, http as httpTransport, keccak256, parseEther, toBytes } from "viem";
import { CHAINS } from "../packages/web3/config.ts";
import { ODDS } from "../lib/lightdive-v3/odds.ts";
import { NFT_BASE_URI } from "../lib/lightdive-v3/metadata.ts";

const BEAM_KEY = ["廣域", "聚焦", "針芒"];
const A = JSON.parse(fs.readFileSync("packages/contracts/lightdive-v3/artifacts/contracts.json", "utf8"));
const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const network = arg("network") ?? "testnet";
if (!["testnet", "local"].includes(network)) throw new Error("Pass --network testnet or --network local (mainnet goes through the multisig).");
const env = (k) => process.env[k]?.trim() || undefined;
const PORT = Number(env("PORT") || 8790);

let chain;
if (network === "local") {
  const url = env("RPC_URL") || "http://127.0.0.1:8546";
  const id = await createPublicClient({ transport: httpTransport(url) }).getChainId();
  chain = defineChain({ id, name: "Local", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [url] } } });
} else {
  chain = CHAINS[46630];
}
const rpc = env("RPC_URL") || chain.rpcUrls.default.http[0];
const client = createPublicClient({ chain, transport: httpTransport(rpc) });
if ((await client.getChainId()) !== chain.id) throw new Error(`The RPC is not chain ${chain.id}.`);
const seed = parseEther(env("POOL_SEED") || "1000000");

// ------------------------------------------------------------------ the record (same format as lightdive-v3-deploy.mjs)
fs.mkdirSync("tmp", { recursive: true });
const progressFile = `tmp/lightdive-v3-deploy-${network}-${chain.id}.json`;
const codeHash = keccak256(toBytes(Object.keys(A).sort().map((n) => A[n].bytecode).join("")));
const P = fs.existsSync(progressFile) ? JSON.parse(fs.readFileSync(progressFile, "utf8")) : { deployer: null, steps: {} };
if (Object.keys(P.steps).length && P.codeHash !== codeHash) {
  throw new Error(`${progressFile} was made with different contract code. Move it away (keep it as a record) to deploy the new contracts.`);
}
P.codeHash = codeHash;
const save = () => fs.writeFileSync(progressFile, `${JSON.stringify(P, null, 2)}\n`);
const target = network === "local" ? "tmp/lightdive-v3-local.json" : "packages/web3/lightdive-v3.json";

// ------------------------------------------------------------------ the steps, built from what is already deployed
const S = P.steps;
const at = (name) => S[`deploy ${name}`];
function steps() {
  const me = P.deployer;
  const treasury = getAddress(env("TREASURY_ADDRESS") || me);
  const deploy = (name, args) => ({ name: `deploy ${name}`, label: `部署 ${name}`, kind: "deploy", make: () => ({ data: encodeDeployData({ abi: A[name].abi, bytecode: A[name].bytecode, args: args() }) }) });
  const call = (name, label, contract, fn, args = () => []) => ({ name, label, kind: "call", make: () => ({ to: contract(), data: encodeFunctionData({ abi: A[contractName(contract)].abi, functionName: fn, args: args() }) }) });
  const list = [
    deploy("TestRVYN", () => [me]),
    deploy("DrandEvmnetRandomness", () => []),
    deploy("LightdiveConfig3", () => [me]),
    deploy("LightdiveNFT3", () => [me, treasury]),
    deploy("CoreLightPool3", () => [me, at("TestRVYN")]),
    deploy("LightdiveMinter3", () => [me, at("TestRVYN"), at("LightdiveNFT3"), at("DrandEvmnetRandomness"), at("CoreLightPool3"), treasury]),
    deploy("Expedition3", () => [me, at("LightdiveNFT3"), at("LightdiveConfig3"), at("DrandEvmnetRandomness"), at("CoreLightPool3"), at("LightdiveMinter3")]),
    deploy("LightdiveMarket3", () => [me, at("TestRVYN"), at("LightdiveNFT3"), at("LightdiveConfig3"), at("CoreLightPool3"), at("LightdiveMinter3")]),
    deploy("LightdiveCommissions3", () => [me, at("Expedition3"), at("LightdiveConfig3")]),
  ];
  for (let c = 0; c < 6; c++) {
    for (let b = 0; b < 3; b++) {
      const tiers = ODDS[`${c + 1}${BEAM_KEY[b]}`].map(([probBp, lo, hi]) => ({ probBp, lo, hi }));
      list.push(call(`odds table ${c + 1}/${BEAM_KEY[b]}`, `賠率表 ${c + 1}/${BEAM_KEY[b]}`, C.config, "setTable", () => [c, b, tiers]));
    }
  }
  list.push(
    call("nft.setMinter", "連接：卡片 → 召喚", C.nft, "setMinter", () => [at("LightdiveMinter3")]),
    call("nft.setGame", "連接：卡片 → 遠征", C.nft, "setGame", () => [at("Expedition3")]),
    call("pool.setExpedition", "連接：核光池 → 遠征", C.pool, "setExpedition", () => [at("Expedition3")]),
    call("expedition.setCommissions", "連接：遠征 → 每日委託", C.expedition, "setCommissions", () => [at("LightdiveCommissions3")]),
    call("nft.setBaseURI", "設定卡片資料網址（錢包和瀏覽器顯示卡圖和屬性）", C.nft, "setBaseURI", () => [NFT_BASE_URI]),
    call("tRVYN mint pool seed", "鑄造核光池的 tRVYN", C.rvyn, "mint", () => [me, seed]),
    call("tRVYN approve pool", "允許核光池使用 tRVYN", C.rvyn, "approve", () => [at("CoreLightPool3"), seed]),
    call("pool.fund", "存入核光池", C.pool, "fund", () => [seed]),
    call("minter.openSale", "開放召喚", C.minter, "openSale", () => [0n]),
  );
  return list;
}
const C = {
  rvyn: () => at("TestRVYN"), config: () => at("LightdiveConfig3"), nft: () => at("LightdiveNFT3"), pool: () => at("CoreLightPool3"),
  minter: () => at("LightdiveMinter3"), expedition: () => at("Expedition3"),
};
const NAMES = { rvyn: "TestRVYN", config: "LightdiveConfig3", nft: "LightdiveNFT3", pool: "CoreLightPool3", minter: "LightdiveMinter3", expedition: "Expedition3" };
const contractName = (f) => NAMES[Object.keys(C).find((k) => C[k] === f)];

const nextStep = () => (P.deployer ? steps().find((s) => S[s.name] === undefined) ?? null : null);
function finish() {
  const out = {
    chainId: chain.id, deploymentBlock: P.startBlock, testToken: true,
    rvyn: at("TestRVYN"), rng: at("DrandEvmnetRandomness"), config: at("LightdiveConfig3"), nft: at("LightdiveNFT3"), pool: at("CoreLightPool3"),
    minter: at("LightdiveMinter3"), expedition: at("Expedition3"), market: at("LightdiveMarket3"), commissions: at("LightdiveCommissions3"),
  };
  fs.writeFileSync(target, `${JSON.stringify(out, null, 2)}\n`);
  P.finished = true;
  save();
  console.log(`\nAll done. Wrote ${target}.`);
}

// ------------------------------------------------------------------ the server
const json = (res, code, body) => { res.writeHead(code, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }); res.end(JSON.stringify(body, (_, v) => (typeof v === "bigint" ? v.toString() : v))); };
const body = (req) => new Promise((ok) => { let s = ""; req.on("data", (c) => { s += c; }); req.on("end", () => { try { ok(JSON.parse(s || "{}")); } catch { ok({}); } }); });
async function state() {
  const list = P.deployer ? steps() : [];
  return {
    network, chainId: chain.id, chainName: chain.name, rpc, explorer: chain.blockExplorers?.default.url ?? "",
    deployer: P.deployer, balance: P.deployer ? Number(await client.getBalance({ address: P.deployer })) / 1e18 : null,
    steps: list.map((s) => ({ name: s.name, label: s.label, done: S[s.name] !== undefined, value: typeof S[s.name] === "string" ? S[s.name] : null })),
    next: nextStep()?.name ?? null, finished: !!P.finished, target,
  };
}
let busy = false;
const server = http.createServer(async (req, res) => {
  try {
    // only this computer: the page and the API refuse anything that is not addressed to the loopback name it serves
    const host = String(req.headers.host || "");
    if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host)) return json(res, 403, { error: "local only" });
    if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      return res.end(PAGE);
    }
    if (req.method === "GET" && req.url === "/api/state") return json(res, 200, await state());
    if (req.method === "POST" && req.url === "/api/begin") {
      const { address } = await body(req);
      const a = getAddress(String(address));
      if (P.deployer && P.deployer !== a && Object.keys(S).length) return json(res, 409, { error: `這份部署紀錄屬於 ${P.deployer}，請切換到那個錢包繼續。` });
      P.deployer = a;
      P.startBlock ??= Number(await client.getBlockNumber());
      save();
      console.log(`Deployer ${a}`);
      return json(res, 200, await state());
    }
    if (req.method === "GET" && req.url === "/api/tx") {
      const s = nextStep();
      if (!s) return json(res, 200, { done: true });
      const tx = s.make();
      const gas = await client.estimateGas({ account: P.deployer, to: tx.to, data: tx.data });
      return json(res, 200, { name: s.name, label: s.label, from: P.deployer, to: tx.to ?? null, data: tx.data, gas: `0x${(gas * 13n / 10n).toString(16)}`, chainId: `0x${chain.id.toString(16)}` });
    }
    if (req.method === "POST" && req.url === "/api/sent") {
      if (busy) return json(res, 409, { error: "上一筆還在確認中" });
      busy = true;
      try {
        const { name, hash } = await body(req);
        const s = nextStep();
        if (!s || s.name !== name) return json(res, 409, { error: "步驟不一致，請重新整理頁面" });
        const want = s.make();
        const receipt = await client.waitForTransactionReceipt({ hash, timeout: 180_000 });
        const tx = await client.getTransaction({ hash });
        if (getAddress(tx.from) !== P.deployer) return json(res, 400, { error: "這筆交易不是部署錢包送出的" });
        if ((tx.to ? getAddress(tx.to) : null) !== (want.to ? getAddress(want.to) : null) || tx.input.toLowerCase() !== want.data.toLowerCase()) return json(res, 400, { error: "這筆交易的內容和準備的不一樣，沒有記錄" });
        if (receipt.status !== "success") return json(res, 400, { error: `交易失敗：${hash}` });
        S[s.name] = s.kind === "deploy" ? receipt.contractAddress : true;
        save();
        console.log(`  ${s.name.padEnd(28)} ${s.kind === "deploy" ? receipt.contractAddress : "ok"}`);
        if (!nextStep()) finish();
        return json(res, 200, await state());
      } finally {
        busy = false;
      }
    }
    json(res, 404, { error: "not found" });
  } catch (e) {
    busy = false;
    json(res, 500, { error: e.shortMessage || e.message || String(e) });
  }
});

const PAGE = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>潛光 v3 部署</title><style>
:root{color-scheme:dark}body{margin:0;background:#0b0f14;color:#e8eef5;font:15px/1.6 system-ui,"Microsoft JhengHei",sans-serif}
main{max-width:760px;margin:0 auto;padding:28px 16px 60px}h1{font-size:24px;margin:0 0 4px}p{margin:6px 0}.dim{color:#8a98a8}
.card{border:1px solid #233140;border-radius:12px;padding:16px;margin:16px 0;background:#111821}
button{font:inherit;font-weight:700;padding:10px 18px;border-radius:10px;border:0;background:#3de7e0;color:#04201f;cursor:pointer;margin:6px 8px 0 0}
button:disabled{opacity:.4;cursor:default}button.ghost{background:#233140;color:#e8eef5}
ol{padding-left:22px;margin:8px 0}li{margin:2px 0}li.done{color:#7fdc9a}li.now{color:#ffe7a8;font-weight:700}li small{color:#8a98a8;margin-left:6px;word-break:break-all}
.err{color:#ff8a8a;white-space:pre-wrap}.ok{color:#7fdc9a}code{background:#1a2430;padding:1px 6px;border-radius:6px}
.bar{height:8px;background:#1a2430;border-radius:99px;overflow:hidden}.bar i{display:block;height:100%;background:#3de7e0;width:0}
</style></head><body><main>
<h1>潛光 v3.2 部署（光橋回聲）</h1>
<p class="dim">這個頁面只在你的電腦上（127.0.0.1）。每一筆交易都由你的錢包簽名送出，私鑰不會經過這裡。</p>
<div class="card" id="net"></div>
<div class="card"><div id="who">尚未連接錢包。</div>
<button id="connect">1. 連接錢包</button><button id="switch" class="ghost" disabled>2. 切換到測試網</button><button id="go" disabled>3. 開始部署</button>
<p id="msg"></p><div class="bar"><i id="bar"></i></div></div>
<div class="card"><b>步驟</b> <span id="count" class="dim"></span><ol id="list"></ol></div>
<script>
const $ = (id) => document.getElementById(id);
let st = null, account = null, running = false;
const eth = window.ethereum;
const msg = (t, cls = "") => { $("msg").className = cls; $("msg").textContent = t; };
async function api(path, data) {
  const r = await fetch(path, data ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) } : {});
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}
function render() {
  if (!st) return;
  $("net").innerHTML = "網路：<b>" + st.chainName + "</b>（" + st.chainId + "）<br><span class='dim'>完成後寫入 <code>" + st.target + "</code>，網站就會指向新的合約。這會重置測試網（舊的卡和紀錄留在舊合約上）。</span>";
  const done = st.steps.filter((s) => s.done).length;
  $("count").textContent = st.steps.length ? done + " / " + st.steps.length : "（連接錢包後顯示，共約 35 筆）";
  $("bar").style.width = st.steps.length ? (100 * done / st.steps.length) + "%" : "0";
  $("list").innerHTML = st.steps.map((s) => "<li class='" + (s.done ? "done" : s.name === st.next ? "now" : "") + "'>" + (s.done ? "✓ " : "") + s.label + (s.value ? "<small>" + s.value + "</small>" : "") + "</li>").join("");
  if (st.deployer) $("who").innerHTML = "部署錢包：<code>" + st.deployer + "</code>　餘額 " + (st.balance ?? 0).toFixed(5) + " ETH";
  if (st.finished) { msg("全部完成！可以關掉這個頁面，回到對話跟我說一聲。", "ok"); $("go").disabled = true; }
}
async function refresh() { st = await api("/api/state"); render(); }
async function chainOk() { return eth && parseInt(await eth.request({ method: "eth_chainId" }), 16) === st.chainId; }
$("connect").onclick = async () => {
  if (!eth) return msg("找不到錢包。請用裝了 MetaMask 的瀏覽器打開這個頁面。", "err");
  try {
    [account] = await eth.request({ method: "eth_requestAccounts" });
    st = await api("/api/begin", { address: account });
    render();
    $("switch").disabled = false;
    $("go").disabled = !(await chainOk()) || st.finished;
    msg(await chainOk() ? "錢包已連接，網路正確。按「開始部署」，然後在錢包裡逐筆確認。" : "請按「切換到測試網」。");
  } catch (e) { msg(e.message, "err"); }
};
$("switch").onclick = async () => {
  const hex = "0x" + st.chainId.toString(16);
  try {
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] });
  } catch (e) {
    if (e.code !== 4902) return msg(e.message, "err");
    await eth.request({ method: "wallet_addEthereumChain", params: [{ chainId: hex, chainName: st.chainName, rpcUrls: [st.rpc], nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, blockExplorerUrls: st.explorer ? [st.explorer] : [] }] });
  }
  $("go").disabled = !(await chainOk()) || st.finished;
  msg(await chainOk() ? "網路正確。按「開始部署」。" : "還不是測試網，請在錢包裡切換。");
};
$("go").onclick = async () => {
  if (running) return;
  running = true; $("go").disabled = true;
  try {
    for (;;) {
      if (!(await chainOk())) throw new Error("錢包的網路被切換了，請切回測試網再按「開始部署」繼續。");
      const [now] = await eth.request({ method: "eth_accounts" });
      if (!now || now.toLowerCase() !== st.deployer.toLowerCase()) throw new Error("錢包帳號和部署錢包不同，請切回 " + st.deployer + "。");
      const tx = await api("/api/tx");
      if (tx.done) break;
      msg("請在錢包確認：" + tx.label);
      const params = { from: tx.from, data: tx.data, gas: tx.gas };
      if (tx.to) params.to = tx.to;
      const hash = await eth.request({ method: "eth_sendTransaction", params: [params] });
      msg("已送出，等待鏈上確認：" + tx.label);
      st = await api("/api/sent", { name: tx.name, hash });
      render();
      if (st.finished) break;
    }
  } catch (e) {
    msg((e.code === 4001 ? "你取消了這筆簽名。" : e.message) + "\\n已完成的步驟都有記錄，按「開始部署」會從這裡繼續。", "err");
    $("go").disabled = false;
  } finally { running = false; await refresh().catch(() => {}); }
};
refresh().catch((e) => msg(e.message, "err"));
</script></main></body></html>`;

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Lightdive v3 deploy page for ${chain.name} (${chain.id}): http://127.0.0.1:${PORT}`);
  console.log(`Record: ${progressFile}. Ctrl+C stops the page (the record stays; start again to continue).`);
});
