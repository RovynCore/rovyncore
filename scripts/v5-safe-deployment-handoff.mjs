// Local, read-only signing helper for deploying RovynPresaleV5 with a Safe multisig as sponsor and team beneficiary.
// It serves a page on 127.0.0.1 that previews the exact creation transaction. It never signs or holds a key:
// the founder reviews the preview in the wallet and decides whether to send it.
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";

const token = "0x545a1ff27596de2f31480df39aa9548f363fc361";
const safe = "0xe574e30153efcd94F686124B2d586A0643b33Ef4";
const expectedSigners = [
  "0xEE4C435b9207bA5bB5f4860156409Ae78032ff6e",
  "0x6B4660e55C67285697FaeDB22B035cBAd5df302C",
  "0xF67486D4a31EF2ee47FE955a90c687db0dA0d2Ea",
];
const deployer = "0xEE4C435b9207bA5bB5f4860156409Ae78032ff6e";
const router = "0x89e5DB8B5aA49aA85AC63f691524311AEB649eba";
const factory = "0x8bceaa40b9acdfaedf85adf4ff01f5ad6517937f";
const weth = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";
const lockSeconds = 730n * 24n * 60n * 60n;
const port = Number(process.env.V5_DEPLOYMENT_PORT || 5175);
const artifacts = JSON.parse(fs.readFileSync("packages/contracts/v5/artifacts/contracts.json", "utf8"));
const compiler = JSON.parse(fs.readFileSync("packages/contracts/v5/artifacts/compiler.json", "utf8"));
const standardInput = fs.readFileSync("packages/contracts/v5/artifacts/standard-input.json");
const mainSource = fs.readFileSync("packages/contracts/v5/RovynPresaleV5.sol");
const sharedSource = fs.readFileSync("packages/contracts/v2/GenesisPresale.sol");
const artifact = artifacts.RovynPresaleV5;

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex").toUpperCase();
const addressWord = (value) => value.slice(2).toLowerCase().padStart(64, "0");
const uintWord = (value) => BigInt(value).toString(16).padStart(64, "0");
// constructor(address token_, address sponsor_, address router_, address teamBeneficiary_, uint256 lpLockDuration_)
const constructorArgs = [addressWord(token), addressWord(safe), addressWord(router), addressWord(safe), uintWord(lockSeconds)].join("");
const bytecode = artifact.bytecode.startsWith("0x") ? artifact.bytecode : `0x${artifact.bytecode}`;
if (bytecode.length < 1000) throw new Error("Missing V5 creation bytecode; compile the candidate first.");
const deploymentData = `${bytecode}${constructorArgs}`;

const config = {
  chainId: 4663, chainIdHex: "0x1237", token, safe, expectedSigners, deployer, router,
  expectedFactory: factory, expectedWeth: weth, lpLockSeconds: lockSeconds.toString(), compiler,
  fingerprints: {
    mainSourceSha256: sha256(mainSource),
    sharedSourceSha256: sha256(sharedSource),
    standardInputSha256: sha256(standardInput),
    creationBytecodeSha256: sha256(Buffer.from(bytecode.slice(2), "hex")),
    deploymentDataSha256: sha256(Buffer.from(deploymentData.slice(2), "hex")),
  },
  deploymentData,
};

const page = `<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>RVYN V5（多簽發起人）部署簽署準備</title>
<style>
:root{color-scheme:dark;font-family:system-ui,"Noto Sans TC",sans-serif;background:#07100b;color:#e8f0e2}body{margin:0;padding:32px 18px;background:radial-gradient(ellipse at 85% 0,#182715 0,transparent 48%),#07100b}.wrap{max-width:900px;margin:auto}.card{border:1px solid #3c5730;background:#0d1710ed;border-radius:18px;padding:26px;margin:18px 0}h1{font-size:clamp(25px,4vw,36px);margin:0 0 10px}h2{font-size:18px;margin:0 0 14px}.tag{color:#b9ff4b;font-size:12px;letter-spacing:.15em;text-transform:uppercase}.warning{border-left:4px solid #ffb547;padding:12px 14px;background:#281d0f;color:#ffe2b3;line-height:1.7}.subtle{color:#aab9a1;line-height:1.7}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.item{min-width:0;padding:12px;background:#080f0a;border:1px solid #233524;border-radius:10px}.item span{display:block;color:#96a48e;font-size:12px;margin-bottom:6px}.item code{font-size:12px;word-break:break-all;color:#d7e6cd}.checks{display:grid;gap:10px;margin:14px 0}.checks label{display:flex;gap:10px;line-height:1.6}.btn{border:0;border-radius:10px;padding:14px 18px;background:#bcf943;color:#13200a;font-size:15px;font-weight:700;cursor:pointer}.btn:disabled{opacity:.45;cursor:not-allowed}.status{min-height:26px;color:#c8ef83;line-height:1.7}.danger{color:#ffcf88}.ok{color:#bfff62}.small{font-size:13px}@media(max-width:640px){.grid{grid-template-columns:1fr}}
</style></head><body><main class="wrap">
<div class="tag">RovynCore · mainnet transaction review</div><h1>RVYN V5 預售合約（Safe 多簽為發起人）</h1>
<section class="card"><h2>這筆交易做什麼、不做什麼</h2><div class="warning">只會<b>建立一個新的合約</b>：發起人與團隊受益人都設為你們的 Safe 多簽，之後只有 Safe（2/3 簽署）能操作它。<br>不會轉移、授權或存入任何 RVYN，不會開啟白名單或預售，也不會動到舊的 V5。主網部署不可逆，會支付少量 Gas。</div><p class="subtle">合約程式碼和已在 Blockscout 驗證的 V5（0x3cb9…4b5f）是同一份原始碼與編譯設定；只有建構參數不同（發起人與團隊受益人改為 Safe）。<b>這份合約沒有經過獨立第三方審計。</b></p></section>
<section class="card"><h2>部署參數（請逐項核對）</h2><div class="grid" id="params"></div></section>
<section class="card"><h2>來源與建構指紋（SHA-256）</h2><div class="grid" id="hashes"></div><div id="compiler" class="subtle small"></div></section>
<section class="card"><h2>1. 連線並執行唯讀檢查</h2><p class="subtle">請連接 0xEE 錢包（部署者，只負責付 Gas，不會成為管理者）。頁面會唯讀檢查：鏈 ID、RVYN 供應、Router 的 Factory 與 WETH、Safe 的簽署人與門檻是否正確，並模擬部署 Gas。不會送出交易。</p><button class="btn" id="check">連線並執行唯讀檢查</button><p id="status" class="status" role="status"></p></section>
<section class="card"><h2>2. 開啟錢包的交易預覽</h2><div class="checks"><label><input id="noaudit" type="checkbox">我了解這份合約沒有經過獨立第三方審計。</label><label><input id="risk" type="checkbox">我了解這是不可逆的主網合約建立；發起人與受益人一旦設為 Safe 就不能更改，我已核對上方地址。</label></div><button class="btn" id="review" disabled>開啟錢包交易預覽（尚未簽署）</button><p class="subtle small">按下後只會請錢包顯示確認視窗，是否簽署由你決定。成功後請保留交易 Hash 給我。</p></section>
</main><script>
const $=id=>document.getElementById(id);let cfg=null,account="",preflight=false;
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const box=(l,v)=>'<div class="item"><span>'+esc(l)+'</span><code>'+esc(v)+'</code></div>';
function render(){const c=cfg;$('params').innerHTML=[['Network','Robinhood Chain · 4663'],['RVYN Token',c.token],['Sponsor（Safe 多簽，不可改）',c.safe],['Team beneficiary（Safe 多簽，不可改）',c.safe],['Uniswap V2 Router',c.router],['LP lock','24 months · '+Number(c.lpLockSeconds).toLocaleString()+' seconds'],['Deployer（只付 Gas）',c.deployer]].map(x=>box(...x)).join('');$('hashes').innerHTML=[['V5 main source',c.fingerprints.mainSourceSha256],['Shared Genesis source',c.fingerprints.sharedSourceSha256],['Complete compiler input',c.fingerprints.standardInputSha256],['Creation bytecode',c.fingerprints.creationBytecodeSha256],['Deployment data + constructor',c.fingerprints.deploymentDataSha256]].map(x=>box(...x)).join('');$('compiler').textContent='solc '+c.compiler.version+' · optimizer '+(c.compiler.settings.optimizer.enabled?'ON':'OFF')+' / '+c.compiler.settings.optimizer.runs+' runs · EVM '+c.compiler.settings.evmVersion}
const req=(method,params=[])=>window.ethereum.request({method,params});
const word=a=>a.slice(2).toLowerCase().padStart(64,'0');
const addr=v=>'0x'+v.slice(-40).toLowerCase();
const call=(to,data)=>req('eth_call',[{to,data},'latest']);
async function check(){const s=$('status');s.className='status';s.textContent='';preflight=false;$('review').disabled=true;try{
if(!window.ethereum)throw new Error('找不到 MetaMask／EVM 錢包擴充。');
const accounts=await req('eth_requestAccounts');if(!accounts.length)throw new Error('錢包未提供帳戶。');account=accounts[0];
const chain=await req('eth_chainId');if(chain.toLowerCase()!==cfg.chainIdHex)throw new Error('目前 Chain ID 是 '+chain+'，需要 Robinhood Chain 主網 4663；請在錢包切換後重做檢查。');
if(account.toLowerCase()!==cfg.deployer.toLowerCase())throw new Error('目前帳戶 '+account+' 不是預期的部署者 '+cfg.deployer+'；請切換到 0xEE 錢包。');
for(const [label,a] of [['RVYN',cfg.token],['Router',cfg.router],['Factory',cfg.expectedFactory],['WETH',cfg.expectedWeth],['Safe',cfg.safe]]){const code=await req('eth_getCode',[a,'latest']);if(!code||code==='0x')throw new Error(label+' 地址查不到主網程式碼：'+a)}
const supply=BigInt(await call(cfg.token,'0x18160ddd'));if(supply!==10000000n*10n**18n)throw new Error('RVYN totalSupply 不符：'+supply.toString());
const f=addr(await call(cfg.router,'0xc45a0155')),w=addr(await call(cfg.router,'0xad5c4648'));
if(f!==cfg.expectedFactory.toLowerCase())throw new Error('Router 回報的 Factory 與已核對地址不一致：'+f);
if(w!==cfg.expectedWeth.toLowerCase())throw new Error('Router 回報的 WETH 與已核對地址不一致：'+w);
const th=BigInt(await call(cfg.safe,'0xe75235b8'));if(th!==2n)throw new Error('Safe 門檻不是 2（目前 '+th+'）。');
const raw=await call(cfg.safe,'0xa0e67e2b');const n=Number(BigInt('0x'+raw.slice(2+64,2+128)));const owners=[];for(let i=0;i<n;i++)owners.push(addr('0x'+raw.slice(2+128+i*64,2+192+i*64)));
const want=cfg.expectedSigners.map(x=>x.toLowerCase()).sort().join(),have=owners.slice().sort().join();if(want!==have)throw new Error('Safe 簽署人與預期不符：'+owners.join(', '));
const gas=BigInt(await req('eth_estimateGas',[{from:account,data:cfg.deploymentData,value:'0x0'}]));
const eth=BigInt(await req('eth_getBalance',[account,'latest']));
preflight=true;s.innerHTML='<span class="ok">唯讀檢查全部通過：</span>Safe 簽署人與 2/3 門檻正確；預估 Gas '+gas.toString()+' units；帳戶 ETH '+(Number(eth)/1e18).toFixed(6)+'。建立交易尚未送出。';
$('review').disabled=!($('noaudit').checked&&$('risk').checked)}catch(e){s.className='status danger';s.textContent='檢查未通過：'+(e?.message||String(e))}}
$('check').addEventListener('click',check);
for(const id of ['noaudit','risk'])$(id).addEventListener('change',()=>{$('review').disabled=!(preflight&&$('noaudit').checked&&$('risk').checked)});
$('review').addEventListener('click',async()=>{if(!preflight||!$('noaudit').checked||!$('risk').checked)return;try{$('review').disabled=true;$('status').textContent='請在錢包檢視並自行決定是否簽署；尚未取得交易 Hash。';const hash=await req('eth_sendTransaction',[{from:account,data:cfg.deploymentData,value:'0x0'}]);$('status').innerHTML='錢包已回傳交易 Hash：<code>'+esc(hash)+'</code>。請保留並告訴 Claude，待鏈上確認後再做驗證與後續設定。'}catch(e){$('status').className='status danger';$('status').textContent='交易尚未送出：'+(e?.message||String(e));$('review').disabled=false}});
fetch('/deployment.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('部署資料載入失敗');return r.json()}).then(c=>{cfg=c;render()}).catch(e=>{$('status').textContent=e.message});
</script></body></html>`;

const server = http.createServer((req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.url === "/deployment.json") { res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" }); res.end(JSON.stringify(config)); return; }
  if (req.url === "/") { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); res.end(page); return; }
  res.writeHead(404); res.end("Not found");
});
server.listen(port, "127.0.0.1", () => {
  console.log(`RVYN V5 (Safe sponsor) deployment handoff is ready at http://127.0.0.1:${port}/`);
  console.log("This helper never signs transactions and does not contain a private key.");
});
