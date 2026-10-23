// Owner settings for the Lightdive v3 contracts, signed in the browser wallet with no private key anywhere: this script
// serves a page on this computer only (http://127.0.0.1:8791), prepares each settings transaction, the page hands it to
// the wallet (MetaMask) to sign, and the script checks the receipt and the new value.
//
//   npm run lightdive:v3:owner:web                         the testnet deployment in packages/web3/lightdive-v3.json
//   npm run lightdive:v3:owner:web -- --network local      tmp/lightdive-v3-local.json on RPC_URL
//   ... -- --passes 10                                     the daily passes per wallet (a game decision)
//   ... -- --fallback-days 1                               how long a dive with no drand proof waits for its fallback
//
// Nothing changes unless asked for on the command line. (v3.3: a fallback is empty-handed with the most wear and only
// its owner may take it, so its delay is only about how soon a team stuck by a drand outage is free again.)
import fs from "node:fs";
import http from "node:http";
import { createPublicClient, defineChain, encodeFunctionData, getAddress, http as httpTransport } from "viem";
import { CHAINS } from "../packages/web3/config.ts";

const arg = (name) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
const network = arg("network") ?? "testnet";
if (!["testnet", "local"].includes(network)) throw new Error("Pass --network testnet or --network local (mainnet goes through the multisig).");
const D = JSON.parse(fs.readFileSync(network === "local" ? "tmp/lightdive-v3-local.json" : "packages/web3/lightdive-v3.json", "utf8"));
const abi = JSON.parse(fs.readFileSync("packages/web3/lightdive-v3-abi.json", "utf8")).LightdiveConfig3;
const PORT = Number(process.env.PORT || 8791);
const chain = network === "local"
  ? defineChain({ id: D.chainId, name: "Local", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [process.env.RPC_URL || "http://127.0.0.1:8546"] } } })
  : CHAINS[D.chainId];
const rpc = process.env.RPC_URL || chain.rpcUrls.default.http[0];
const client = createPublicClient({ chain, transport: httpTransport(rpc) });
const config = getAddress(D.config);
const read = (functionName) => client.readContract({ address: config, abi, functionName });

const DAY = 86_400;
const passes = arg("passes") ? Number(arg("passes")) : null;
const fallbackDays = arg("fallback-days") ? Number(arg("fallback-days")) : null;
/** The settings to change, each read back after it is sent. */
async function changes() {
  const [voyage, close, fallback, daily, team, teams] = await Promise.all(["voyageSeconds", "decisionCloseSeconds", "fallbackSeconds", "dailyPasses", "teamDivesPerDay", "maxTeams"].map(read));
  const list = [];
  if (fallbackDays !== null) list.push({
    name: "fallback",
    label: `沒有 drand 證明時的保底結算：${Number(fallback) / 3600} 小時 → ${fallbackDays} 天`,
    done: Number(fallback) === fallbackDays * DAY,
    data: encodeFunctionData({ abi, functionName: "setTiming", args: [Number(voyage), Number(close), fallbackDays * DAY] }),
  });
  if (passes !== null) list.push({
    name: "passes",
    label: `每個錢包每天的出發令：${daily} → ${passes}（每隊每天 ${team} 趟、最多 ${teams} 隊不變）`,
    done: Number(daily) === passes,
    data: encodeFunctionData({ abi, functionName: "setLimits", args: [passes, Number(team), Number(teams)] }),
  });
  return list;
}

let busy = false;
const json = (res, code, data) => { res.writeHead(code, { "content-type": "application/json; charset=utf-8" }); res.end(JSON.stringify(data)); };
const body = (req) => new Promise((ok) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => ok(JSON.parse(b || "{}"))); });
async function state() {
  const owner = getAddress(await read("owner"));
  return { chainId: chain.id, chainName: chain.name, rpc, config, owner, changes: (await changes()).map(({ name, label, done }) => ({ name, label, done })) };
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/") { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); return res.end(PAGE); }
    if (req.method === "GET" && req.url === "/api/state") return json(res, 200, await state());
    if (req.method === "GET" && req.url === "/api/tx") {
      const c = (await changes()).find((x) => !x.done);
      if (!c) return json(res, 200, { done: true });
      const owner = getAddress(await read("owner"));
      const gas = await client.estimateGas({ account: owner, to: config, data: c.data });
      return json(res, 200, { name: c.name, label: c.label, from: owner, to: config, data: c.data, gas: `0x${(gas * 13n / 10n).toString(16)}` });
    }
    if (req.method === "POST" && req.url === "/api/sent") {
      if (busy) return json(res, 409, { error: "上一筆還在確認中" });
      busy = true;
      try {
        const { name, hash } = await body(req);
        const want = (await changes()).find((x) => x.name === name && !x.done);
        if (!want) return json(res, 409, { error: "這一項已經完成，請重新整理頁面" });
        const receipt = await client.waitForTransactionReceipt({ hash, timeout: 180_000 });
        const tx = await client.getTransaction({ hash });
        const owner = getAddress(await read("owner"));
        if (getAddress(tx.from) !== owner) return json(res, 400, { error: "這筆交易不是合約擁有者送出的" });
        if (getAddress(tx.to) !== config || tx.input.toLowerCase() !== want.data.toLowerCase()) return json(res, 400, { error: "這筆交易的內容和準備的不一樣" });
        if (receipt.status !== "success") return json(res, 400, { error: `交易失敗：${hash}` });
        const after = (await changes()).find((x) => x.name === name);
        console.log(`  ${name.padEnd(10)} ${after.done ? "ok" : "NOT APPLIED"}  ${hash}`);
        return json(res, 200, await state());
      } finally { busy = false; }
    }
    json(res, 404, { error: "not found" });
  } catch (e) {
    busy = false;
    json(res, 500, { error: e.shortMessage || e.message || String(e) });
  }
});

const PAGE = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>潛光 v3 合約設定</title><style>
:root{color-scheme:dark}body{margin:0;background:#0b0f14;color:#e8eef5;font:15px/1.6 system-ui,"Microsoft JhengHei",sans-serif}
main{max-width:720px;margin:0 auto;padding:28px 16px 60px}h1{font-size:24px;margin:0 0 4px}p{margin:6px 0}.dim{color:#8a98a8}
.card{border:1px solid #233140;border-radius:12px;padding:16px;margin:16px 0;background:#111821}
button{font:inherit;font-weight:700;padding:10px 18px;border-radius:10px;border:0;background:#3de7e0;color:#04201f;cursor:pointer;margin:6px 8px 0 0}
button:disabled{opacity:.4;cursor:default}button.ghost{background:#233140;color:#e8eef5}
li{margin:4px 0}li.done{color:#7fdc9a}.err{color:#ff8a8a;white-space:pre-wrap}.ok{color:#7fdc9a}code{background:#1a2430;padding:1px 6px;border-radius:6px;word-break:break-all}
</style></head><body><main>
<h1>潛光 v3 合約設定（防作弊）</h1>
<p class="dim">這個頁面只在你的電腦上（127.0.0.1）。每一筆都由你的錢包簽名送出，私鑰不會經過這裡。只會改下面列出的設定，不會動到任何玩家的卡或收益。</p>
<div class="card" id="net"></div>
<div class="card"><div id="who">尚未連接錢包。</div>
<button id="connect">1. 連接錢包</button><button id="switch" class="ghost" disabled>2. 切換網路</button><button id="go" disabled>3. 送出設定</button>
<p id="msg"></p></div>
<div class="card"><b>要改的設定</b><ul id="list"></ul></div>
<script>
const $ = (id) => document.getElementById(id);
let st = null, account = null, running = false;
const eth = window.ethereum;
const msg = (t, cls = "") => { $("msg").className = cls; $("msg").textContent = t; };
async function api(path, data) {
  const r = await fetch(path, data ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) } : {});
  const j = await r.json(); if (!r.ok) throw new Error(j.error || r.statusText); return j;
}
function render() {
  $("net").innerHTML = "網路：<b>" + st.chainName + "</b>（" + st.chainId + "）<br>設定合約 <code>" + st.config + "</code><br>擁有者 <code>" + st.owner + "</code>";
  $("list").innerHTML = st.changes.map((c) => "<li class='" + (c.done ? "done" : "") + "'>" + (c.done ? "✓ " : "") + c.label + "</li>").join("");
  if (st.changes.every((c) => c.done)) { msg("全部完成，可以關掉這個頁面，回到對話跟我說一聲。", "ok"); $("go").disabled = true; }
}
async function chainOk() { return eth && parseInt(await eth.request({ method: "eth_chainId" }), 16) === st.chainId; }
$("connect").onclick = async () => {
  if (!eth) return msg("找不到錢包。請用裝了 MetaMask 的瀏覽器打開這個頁面。", "err");
  [account] = await eth.request({ method: "eth_requestAccounts" });
  $("who").innerHTML = "已連接 <code>" + account + "</code>" + (account.toLowerCase() === st.owner.toLowerCase() ? "（是合約擁有者）" : "<span class='err'>（不是合約擁有者，請切換帳號）</span>");
  $("switch").disabled = false;
  $("go").disabled = !(await chainOk()) || account.toLowerCase() !== st.owner.toLowerCase();
  msg(await chainOk() ? "網路正確。" : "請按「切換網路」。");
};
$("switch").onclick = async () => {
  const hex = "0x" + st.chainId.toString(16);
  try { await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] }); }
  catch (e) { if (e.code !== 4902) return msg(e.message, "err"); await eth.request({ method: "wallet_addEthereumChain", params: [{ chainId: hex, chainName: st.chainName, rpcUrls: [st.rpc], nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 } }] }); }
  $("go").disabled = !(await chainOk()) || !account || account.toLowerCase() !== st.owner.toLowerCase();
};
$("go").onclick = async () => {
  if (running) return; running = true; $("go").disabled = true;
  try {
    for (;;) {
      const tx = await api("/api/tx");
      if (tx.done) break;
      msg("請在錢包確認：" + tx.label);
      const hash = await eth.request({ method: "eth_sendTransaction", params: [{ from: tx.from, to: tx.to, data: tx.data, gas: tx.gas }] });
      msg("已送出，等待鏈上確認…");
      st = await api("/api/sent", { name: tx.name, hash }); render();
    }
  } catch (e) { msg((e.code === 4001 ? "你取消了這筆簽名。" : e.message), "err"); $("go").disabled = false; }
  finally { running = false; st = await api("/api/state"); render(); }
};
api("/api/state").then((s) => { st = s; render(); }).catch((e) => msg(e.message, "err"));
</script></main></body></html>`;

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Lightdive v3 owner settings for ${chain.name} (${chain.id}): http://127.0.0.1:${PORT}`);
});
