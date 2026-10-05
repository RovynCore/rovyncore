import assert from "node:assert/strict";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
const origin = "https://www.rovyncore.com";
const wallet = privateKeyToAccount(generatePrivateKey());
let cookie = "";
async function call(action, body) {
  const response = await fetch(origin + "/api/wallet/" + action, {
    method: body === undefined ? "GET" : "POST",
    headers: {Origin:origin, "Content-Type":"application/json", ...(cookie ? {Cookie:cookie} : {})},
    body:body === undefined ? undefined : JSON.stringify(body),
    signal:AbortSignal.timeout(20000),
  });
  const setCookie=response.headers.get("set-cookie");
  if(setCookie) cookie=setCookie.split(";")[0];
  return response;
}
try {
  assert.equal((await (await call("session")).json()).account,null);
  const r=await call("challenge",{account:wallet.address});
  assert.equal(r.status,200,await r.clone().text());
  const challenge=await r.json();
  assert.ok(challenge.message.startsWith("www.rovyncore.com wants you to sign in"));
  const signature=await wallet.signMessage({message:challenge.message});
  const verified=await call("verify",{id:challenge.id,signature});
  assert.equal(verified.status,200,await verified.clone().text());
  assert.equal((await (await call("session")).json()).account,wallet.address);
  assert.equal((await call("verify",{id:challenge.id,signature})).status,401);
  await call("logout",{});
  assert.equal((await (await call("session")).json()).account,null);
  console.log("PASS: .com live challenge, signature verification, session, replay rejection and logout. Temporary unfunded test wallet only.");
} finally {if(cookie) await call("logout",{});}
