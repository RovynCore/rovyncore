import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { Miniflare } from "miniflare";
import { walletSession } from "../lib/wallet-session.ts";
import { WalletController, type BrowserWallet } from "../lib/wallet-client.ts";
import {
  COMMON_WALLETS,
  identifyWalletBrand,
  mergeWalletChoice,
  preferredWallet,
  type WalletChoice,
} from "../lib/wallet-choice.ts";
type RpcArgs = { method: string; params?: unknown };
type MockProvider = EventEmitter & {
  accounts: string[];
  chain: string;
  calls: string[];
  reject: boolean;
  noSwitch: boolean;
  request: (args: RpcArgs) => Promise<unknown>;
};
const a = "0x1111111111111111111111111111111111111111";
const b = "0x2222222222222222222222222222222222222222";
test("MetaMask is the stable default but a selected EIP-6963 wallet wins", () => {
  const phantom: WalletChoice = {id:"phantom",name:"Phantom",brand:"phantom",provider:{} as unknown as BrowserWallet,isMetaMask:false};
  const metamask: WalletChoice = {id:"metamask",name:"MetaMask",brand:"metamask",provider:{} as unknown as BrowserWallet,isMetaMask:true};
  assert.equal(preferredWallet([phantom, metamask], "")?.id, "metamask");
  assert.equal(preferredWallet([phantom, metamask], "phantom")?.id, "phantom");
});
test("common wallet chooser lists five distinct providers with official HTTPS entry points", () => {
  assert.equal(COMMON_WALLETS.length, 5);
  assert.equal(new Set(COMMON_WALLETS.map((wallet) => wallet.brand)).size, 5);
  assert.ok(COMMON_WALLETS.every((wallet) => wallet.downloadUrl.startsWith("https://")));
  assert.ok(COMMON_WALLETS.every((wallet) => wallet.iconUrl.startsWith("https://")));
});
test("wallet identity prefers explicit provider identity to MetaMask compatibility flags", () => {
  const brave = {isMetaMask:true,isBraveWallet:true} as BrowserWallet;
  assert.equal(identifyWalletBrand(undefined, brave), "brave");
  assert.equal(identifyWalletBrand("io.rabby", {} as BrowserWallet), "rabby");
  assert.equal(identifyWalletBrand("app.phantom", {} as BrowserWallet), "phantom");
  assert.equal(identifyWalletBrand(undefined, {} as BrowserWallet), "other");
});
test("legacy and EIP-6963 reports for one branded wallet collapse to one choice", () => {
  const provider = {} as BrowserWallet;
  const legacy: WalletChoice = {id:"injected-metamask-0",name:"MetaMask",brand:"metamask",provider,isMetaMask:true};
  const announced: WalletChoice = {id:"wallet-uuid",name:"MetaMask",brand:"metamask",rdns:"io.metamask",icon:"data:image/png;base64,AA==",provider,isMetaMask:true};
  const merged = mergeWalletChoice([legacy], announced);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, legacy.id);
  assert.equal(merged[0].rdns, announced.rdns);
  assert.equal(merged[0].icon, announced.icon);
});
function fixture() {
  let signed: string | null = null;
  const p = Object.assign(new EventEmitter(), {
    accounts:[a], chain:"0x1", calls:[] as string[], reject:false, noSwitch:false,
    async request(this: MockProvider, {method,params}:RpcArgs):Promise<unknown> {
      this.calls.push(method);
      if(method === "eth_accounts" || method === "eth_requestAccounts") return this.accounts;
      if(method === "eth_chainId") return this.chain;
      if(method === "personal_sign") {if(this.reject) throw Object.assign(new Error("User rejected"), {code:4001}); return "0xsigned";}
      if(method === "wallet_switchEthereumChain") {
        const first = Array.isArray(params) ? params[0] : undefined;
        if (!this.noSwitch && first && typeof first === "object" && "chainId" in first)
          this.chain = String(first.chainId);
        return null;
      }
      if(method === "wallet_revokePermissions") throw Object.assign(new Error("Unsupported"), {code:4200});
      return null;
    }
  }) as MockProvider;
  const c = new WalletController(p as unknown as BrowserWallet, async (action,body?:unknown):Promise<unknown> => {
    if(action === "session") return {account:signed};
    if(action === "logout") {signed=null;return {};}
    if(action === "challenge") return {id:"nonce",message:(body as {account:string}).account};
    if(action === "verify") {signed=p.accounts[0];return {account:signed};}
  });
  return {p,c};
}
test("connection signs, account change invalidates, reconnection signs new account", async () => {
  const {p,c} = fixture(); const stop=c.start();
  await c.connect(); assert.equal(c.state.account,a);
  p.accounts=[b]; p.emit("accountsChanged",[b]); assert.equal(c.state.account,null);
  await c.connect(); assert.equal(c.state.account,b);
  assert.equal(p.calls.filter(x=>x==="personal_sign").length,2); stop();
});
test("disconnect stays disconnected during sync and reconnect requires signature", async () => {
  const {p,c}=fixture(); await c.connect(); await c.disconnect(); await c.sync();
  assert.equal(c.state.account,null); await c.connect();
  assert.equal(p.calls.filter(x=>x==="personal_sign").length,2);
});
test("rejecting login cannot leave an authenticated account", async () => {
  const {p,c}=fixture(); p.reject=true; await assert.rejects(c.connect());
  assert.equal(c.state.account,null); assert.equal(c.state.busy,false); assert.match(c.state.error,/cancelled/);
});
test("parallel clicks share a single sign-in", async () => {
  const {p,c}=fixture(); await Promise.all([c.connect(),c.connect()]);
  assert.equal(p.calls.filter(x=>x==="personal_sign").length,1);
});
test("login switches to the platform network before requesting a signature", async () => {
  const {p,c}=fixture();
  const original=p.request.bind(p);
  let chainAtSignature: string | null = null;
  p.request=async (args:RpcArgs) => {
    if (args.method === "personal_sign") chainAtSignature=p.chain;
    return original(args);
  };
  const chain={id:4663,name:"Robinhood Chain",nativeCurrency:{name:"Ether",symbol:"ETH",decimals:18},rpcUrls:{default:{http:["https://rpc.mainnet.chain.robinhood.com"]}},blockExplorers:{default:{name:"Robinhood Chain Explorer",url:"https://robinhoodchain.blockscout.com"}}};
  await c.connect(chain);
  assert.equal(chainAtSignature,"0x1237");
  assert.ok(p.calls.indexOf("wallet_switchEthereumChain") < p.calls.indexOf("personal_sign"));
});
test("account changes while signing cannot authenticate the old address", async () => {
  const {p,c}=fixture(); const stop=c.start();
  const original=p.request.bind(p);
  p.request=async (args:RpcArgs) => {
    if(args.method==="personal_sign") {p.accounts=[b];p.emit("accountsChanged",[b]);}
    return original(args);
  };
  await assert.rejects(c.connect(),/changed/);assert.equal(c.state.account,null);stop();
});
test("missing network is added then switched and verified", async () => {
  const {p,c}=fixture();const original=p.request.bind(p);let first=true;
  p.request=async (args:RpcArgs) => {
    if(args.method==="wallet_switchEthereumChain" && first) {first=false;throw {code:4902};}
    return original(args);
  };
  await c.switchChain({id:4663,name:"Robinhood Chain",nativeCurrency:{name:"Ether",symbol:"ETH",decimals:18},rpcUrls:{default:{http:["https://rpc.mainnet.chain.robinhood.com"]}},blockExplorers:{default:{name:"Robinhood Chain Explorer",url:"https://robinhoodchain.blockscout.com"}}});
  assert.ok(p.calls.includes("wallet_addEthereumChain"));assert.equal(c.state.chain,4663);
});
test("network switch verifies actual chain and reports a wallet that ignored the request", async () => {
  const {p,c}=fixture();
  const chain={id:46630,name:"Robinhood Testnet",nativeCurrency:{name:"Ether",symbol:"ETH",decimals:18},rpcUrls:{default:{http:["https://rpc.testnet.chain.robinhood.com"]}},blockExplorers:{default:{name:"Robinhood Testnet Explorer",url:"https://explorer.testnet.chain.robinhood.com"}}};
  await c.switchChain(chain); assert.equal(c.state.chain,46630);
  p.chain="0x1";p.noSwitch=true;await assert.rejects(c.switchChain(chain),/did not switch/); assert.equal(c.state.chain,1);
});
test("real signature, single-use nonce, origin binding, session and server logout", async () => {
  const mf = new Miniflare({modules:true,script:"export default {fetch(){return new Response('ok')}}",d1Databases:["DB"]});
  try {
    const db = await mf.getD1Database("DB");
    await db.prepare("CREATE TABLE challenges(id TEXT PRIMARY KEY,message TEXT NOT NULL,expires INTEGER NOT NULL)").run();
    const wallet=privateKeyToAccount(generatePrivateKey());
    const origin="https://www.rovyncore.com";
    const call=(action:string, body?:unknown, cookie?:string, host=origin) => walletSession(new Request(host+"/api/wallet/"+action, {method:body===undefined?"GET":"POST",headers:{origin:host,...(cookie?{cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)}),db as unknown as Parameters<typeof walletSession>[1],46630);
    const challenge=await (await call("challenge",{account:wallet.address})).json() as {id:string;message:string};
    const signature=await wallet.signMessage({message:challenge.message});
    assert.equal((await call("verify",{id:challenge.id,signature},undefined,"https://rovyncore.net")).status,401);
    const verified=await call("verify",{id:challenge.id,signature});
    assert.equal(verified.status,200);
    const cookie=verified.headers.get("set-cookie")!;
    assert.match(cookie,/HttpOnly/);assert.match(cookie,/Secure/);
    assert.equal((await call("verify",{id:challenge.id,signature})).status,401);
    assert.equal((await (await call("session",undefined,cookie)).json() as {account:string|null}).account,wallet.address);
    await call("logout",{},cookie);
    assert.equal((await (await call("session",undefined,cookie)).json() as {account:string|null}).account,null);
  } finally {await mf.dispose();}
});
