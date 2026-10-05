import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";

const token = "0x545a1ff27596de2f31480df39aa9548f363fc361";
const sponsor = "0xEE4C435b9207bA5bB5f4860156409Ae78032ff6e";
const router = "0x89e5DB8B5aA49aA85AC63f691524311AEB649eba";
const factory = "0x8bceaa40b9acdfaedf85adf4ff01f5ad6517937f";
const weth = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";
const lockSeconds = 730n * 24n * 60n * 60n;
const port = Number(process.env.V5_DEPLOYMENT_PORT || 5174);
const artifactPath = "packages/contracts/v5/artifacts/contracts.json";
const compilerPath = "packages/contracts/v5/artifacts/compiler.json";
const inputPath = "packages/contracts/v5/artifacts/standard-input.json";
const mainSourcePath = "packages/contracts/v5/RovynPresaleV5.sol";
const sharedSourcePath = "packages/contracts/v2/GenesisPresale.sol";
const artifacts = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
const compiler = JSON.parse(fs.readFileSync(compilerPath, "utf8"));
const standardInput = fs.readFileSync(inputPath);
const artifact = artifacts.RovynPresaleV5;

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex").toUpperCase();
const addressWord = (value) => value.slice(2).toLowerCase().padStart(64, "0");
const uintWord = (value) => BigInt(value).toString(16).padStart(64, "0");
const constructorArgs = [token, sponsor, router, sponsor, lockSeconds]
  .map((value, index) => index === 4 ? uintWord(value) : addressWord(value))
  .join("");
const bytecode = artifact.bytecode;
if (!bytecode.startsWith("0x") || bytecode.length < 1000) throw new Error("Missing V5 creation bytecode; compile the candidate first.");
const deploymentData = `${bytecode}${constructorArgs}`;

const mainSource = fs.readFileSync(mainSourcePath);
const sharedSource = fs.readFileSync(sharedSourcePath);
const config = {
  chainId: 4663,
  chainIdHex: "0x1237",
  token,
  sponsor,
  router,
  expectedFactory: factory,
  expectedWeth: weth,
  teamBeneficiary: sponsor,
  lpLockSeconds: lockSeconds.toString(),
  compiler,
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
<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>RVYN V5 主網部署簽署準備</title>
<style>
:root{color-scheme:dark;font-family:system-ui,"Noto Sans TC",sans-serif;background:#07100b;color:#e8f0e2}body{margin:0;padding:32px 18px;background:radial-gradient(ellipse at 85% 0,#182715 0,transparent 48%),#07100b}.wrap{max-width:900px;margin:auto}.card{border:1px solid #3c5730;background:#0d1710ed;border-radius:18px;padding:26px;margin:18px 0;box-shadow:0 18px 60px #0005}h1{font-size:clamp(25px,4vw,38px);margin:0 0 10px}h2{font-size:18px;margin:0 0 14px}.tag{color:#b9ff4b;font-size:12px;letter-spacing:.15em;text-transform:uppercase}.warning{border-left:4px solid #ffb547;padding:12px 14px;background:#281d0f;color:#ffe2b3;line-height:1.7}.subtle{color:#aab9a1;line-height:1.7}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.item{min-width:0;padding:12px;background:#080f0a;border:1px solid #233524;border-radius:10px}.item span{display:block;color:#96a48e;font-size:12px;margin-bottom:6px}.item code{font-size:12px;word-break:break-all;color:#d7e6cd}.checks{display:grid;gap:10px;margin:14px 0}.checks label{display:flex;gap:10px;line-height:1.6}.btn{border:0;border-radius:10px;padding:14px 18px;background:#bcf943;color:#13200a;font-size:15px;font-weight:700;cursor:pointer}.btn:disabled{opacity:.45;cursor:not-allowed}.status{min-height:26px;color:#c8ef83;line-height:1.6}.danger{color:#ffcf88}.ok{color:#bfff62}.small{font-size:13px}.phase{display:inline-block;padding:5px 9px;border-radius:20px;background:#162519;color:#c5ff58;font-size:12px}@media(max-width:640px){.grid{grid-template-columns:1fr}.card{padding:20px}}
</style></head><body><main class="wrap">
<div class="tag">RovynCore · mainnet transaction review</div><h1>RVYN V5 預售合約部署</h1><span class="phase">僅建立合約，不會開啟預售</span>
<section class="card"><h2>簽署前請先看這件事</h2><div class="warning"><b>我無法獨立確認審計方檢查的來源版本。</b>本頁顯示的是目前工作區 V5 原始碼與編譯指紋。只有你已確認審計涵蓋完全相同的程式碼／編譯結果時，才繼續開啟 MetaMask；若無法確認，請勿簽署。主網部署不可逆，會支付 Robinhood Chain ETH Gas。</div><p class="subtle">此交易只部署合約：不會 approve、轉移或存入 RVYN，不會開啟白名單或預售，也不會建立流動性池。MetaMask 會顯示合約建立交易，請核對網路、帳戶與 Gas 後自行決定是否簽署。</p></section>
<section class="card"><h2>部署參數</h2><div class="grid" id="params"></div></section>
<section class="card"><h2>來源與建構指紋（SHA-256）</h2><div class="grid" id="hashes"></div><p class="subtle small">編譯器、最佳化與 EVM 設定同樣列在下方；Blockscout 原始碼公開／驗證會在合約成功部署後另行處理。</p><div id="compiler" class="subtle small"></div></section>
<section class="card"><h2>1. 核對錢包與主網</h2><p class="subtle">請用管理者錢包連線。頁面會唯讀檢查鏈 ID、帳戶、RVYN 總供應及持有量、Router 回報的 Factory／WETH，並模擬部署 Gas；不會送出交易。</p><button class="btn" id="check">連線並執行唯讀檢查</button><p id="status" class="status" role="status"></p></section>
<section class="card"><h2>2. 允許開啟 MetaMask 交易預覽</h2><div class="checks"><label><input id="audit" type="checkbox">我已確認審計涵蓋此頁列出的 V5 主合約、共用合約來源與編譯設定指紋；若沒有核對過，我不會繼續。</label><label><input id="risk" type="checkbox">我了解這是不可逆的主網合約建立，將由我檢查 MetaMask 交易內容並親自決定是否簽署。</label></div><button class="btn" id="review" disabled>開啟 MetaMask 交易預覽（尚未簽署）</button><p class="subtle small">按下後只會請錢包顯示交易確認；本頁與 Codex 不會替你簽署。若簽署成功，請保留交易 Hash，供後續鏈上驗收與原始碼公開。</p></section>
</main><script>
const $=id=>document.getElementById(id);let cfg=null,account="",preflight=false;
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function box(label,value){return '<div class="item"><span>'+esc(label)+'</span><code>'+esc(value)+'</code></div>'}
function render(){const c=cfg;const p=[['Network','Robinhood Chain · 4663'],['RVYN Token',c.token],['Sponsor / deployer',c.sponsor],['Uniswap V2 Router',c.router],['Team beneficiary',c.teamBeneficiary],['LP lock','24 months · '+Number(c.lpLockSeconds).toLocaleString()+' seconds']];$('params').innerHTML=p.map(x=>box(...x)).join('');const h=[['V5 main source',c.fingerprints.mainSourceSha256],['Shared Genesis source',c.fingerprints.sharedSourceSha256],['Complete compiler input',c.fingerprints.standardInputSha256],['Creation bytecode',c.fingerprints.creationBytecodeSha256],['Deployment data + constructor',c.fingerprints.deploymentDataSha256]];$('hashes').innerHTML=h.map(x=>box(...x)).join('');$('compiler').textContent='solc '+c.compiler.version+' · optimizer '+(c.compiler.settings.optimizer.enabled?'ON':'OFF')+' / '+c.compiler.settings.optimizer.runs+' runs · EVM '+c.compiler.settings.evmVersion;}
async function request(method,params=[]){return window.ethereum.request({method,params})}
function wordAddress(address){return address.slice(2).toLowerCase().padStart(64,'0')}
function addressResult(value){return '0x'+value.slice(-40).toLowerCase()}
async function call(to,data){return request('eth_call',[{to,data},'latest'])}
async function check(){const s=$('status');s.textContent='';preflight=false;$('review').disabled=true;try{if(!window.ethereum)throw new Error('找不到 MetaMask／EVM 錢包擴充。');const accounts=await request('eth_requestAccounts');if(!accounts.length)throw new Error('錢包未提供帳戶。');account=accounts[0];const chain=await request('eth_chainId');if(chain.toLowerCase()!==cfg.chainIdHex)throw new Error('目前 Chain ID 是 '+chain+'，需要 Robinhood Chain 主網 4663；請先在錢包切換，然後重做檢查。');if(account.toLowerCase()!==cfg.sponsor.toLowerCase())throw new Error('目前帳戶 '+account+' 不等於部署者 '+cfg.sponsor+'。');for(const [label,address] of [['RVYN',cfg.token],['Router',cfg.router],['Factory',cfg.expectedFactory],['WETH',cfg.expectedWeth]]){const code=await request('eth_getCode',[address,'latest']);if(!code||code==='0x')throw new Error(label+' 地址查不到主網程式碼：'+address)}const supply=BigInt(await call(cfg.token,'0x18160ddd'));const expectedSupply=10000000n*10n**18n;if(supply!==expectedSupply)throw new Error('RVYN totalSupply 不符：'+supply.toString());const balance=BigInt(await call(cfg.token,'0x70a08231'+wordAddress(cfg.sponsor)));if(balance<expectedSupply)throw new Error('管理者目前 RVYN 餘額不足 10,000,000；本交易不會轉幣，但後續存入前需補足。');const actualFactory=addressResult(await call(cfg.router,'0xc45a0155'));const actualWeth=addressResult(await call(cfg.router,'0xad5c4648'));if(actualFactory!==cfg.expectedFactory.toLowerCase())throw new Error('Router 回報的 Factory 與已核對地址不一致：'+actualFactory);if(actualWeth!==cfg.expectedWeth.toLowerCase())throw new Error('Router 回報的 WETH 與已核對地址不一致：'+actualWeth);const gas=BigInt(await request('eth_estimateGas',[{from:account,data:cfg.deploymentData,value:'0x0'}]));const eth=BigInt(await request('eth_getBalance',[account,'latest']));preflight=true;s.innerHTML='<span class="ok">唯讀檢查全部通過。</span> 預估 Gas：'+gas.toString()+' units；帳戶 ETH 餘額：'+(Number(eth)/1e18).toFixed(6)+' ETH。建立交易尚未送出。';$('review').disabled=!($('audit').checked&&$('risk').checked)}catch(e){s.textContent='檢查未通過：'+(e?.message||String(e));s.classList.add('danger')}}
$('check').addEventListener('click',check);for(const id of ['audit','risk'])$(id).addEventListener('change',()=>{$('review').disabled=!(preflight&&$('audit').checked&&$('risk').checked)});
$('review').addEventListener('click',async()=>{if(!preflight||!$('audit').checked||!$('risk').checked)return;try{$('review').disabled=true;$('status').textContent='請在 MetaMask 檢視並自行決定是否簽署；本頁尚未取得交易 Hash。';const hash=await request('eth_sendTransaction',[{from:account,data:cfg.deploymentData,value:'0x0'}]);$('status').innerHTML='錢包已回傳交易 Hash：<code>'+esc(hash)+'</code>。請保留此 Hash；待鏈上確認後再進行後續驗收。'}catch(e){$('status').textContent='交易尚未送出：'+(e?.message||String(e));$('review').disabled=false}});
fetch('/deployment.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('部署資料載入失敗');return r.json()}).then(c=>{cfg=c;render()}).catch(e=>{$('status').textContent=e.message});
</script></body></html>`;

const server = http.createServer((req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.url === "/deployment.json") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(config));
    return;
  }
  if (req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(page);
    return;
  }
  res.writeHead(404);
  res.end("Not found");
});
server.listen(port, "127.0.0.1", () => {
  console.log(`RVYN V5 deployment handoff is ready at http://127.0.0.1:${port}/`);
  console.log("This helper never signs transactions and does not contain a private key.");
});
