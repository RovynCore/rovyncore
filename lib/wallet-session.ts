import { getAddress, verifyMessage } from "viem";
const COOKIE = "__Host-rovyn-wallet";
const json = (data: unknown, cookie?: string) => Response.json(data, {
  headers: { "Cache-Control": "no-store", ...(cookie ? { "Set-Cookie": cookie } : {}) },
});
const cookie = (token: string, age: number) => `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`;
const digest = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), x => x.toString(16).padStart(2, "0")).join("");
export async function walletSessionAccount(request: Request, db: D1Database) {
  const url = new URL(request.url);
  const token = request.headers.get("cookie")?.split(";").map(x => x.trim()).find(x => x.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const key = `wallet-session:${await digest(token)}`;
  const row = await db.prepare("SELECT message FROM challenges WHERE id=? AND expires>?").bind(key, Math.floor(Date.now() / 1000)).first<{message: string}>();
  if (!row) return null;
  try {
    const session = JSON.parse(row.message);
    return session?.origin === url.origin && typeof session.account === "string" ? getAddress(session.account) : null;
  } catch {
    return null;
  }
}
export async function walletSession(request: Request, db: D1Database, chainId: number) {
  const url = new URL(request.url);
  const action = url.pathname.split("/").at(-1);
  const now = Math.floor(Date.now() / 1000);
  const token = request.headers.get("cookie")?.split(";").map(x => x.trim()).find(x => x.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  const key = token && /^[a-f0-9]{64}$/.test(token) ? `wallet-session:${await digest(token)}` : null;
  if (request.method === "GET" && action === "session") {
    const row = key ? await db.prepare("SELECT message FROM challenges WHERE id=? AND expires>?").bind(key, now).first<{message: string}>() : null;
    const session = row ? JSON.parse(row.message) : null;
    return json(session?.origin === url.origin ? { account: session.account } : { account: null });
  }
  if (request.method !== "POST" || request.headers.get("origin") !== url.origin) return new Response("Forbidden", {status:403});
  if (action === "logout") {
    if (key) await db.prepare("DELETE FROM challenges WHERE id=?").bind(key).run();
    return json({ok: true}, cookie("", 0));
  }
  const text = await request.text();
  if (text.length > 4096) return new Response("Too large", {status: 413});
  const body = JSON.parse(text);
  if (action === "challenge") {
    const account = getAddress(body.account);
    const id = crypto.randomUUID().replaceAll("-", "");
    const message = `${url.host} wants you to sign in with your Ethereum account:\n${account}\n\nSign in to ROVYN CORE. This does not authorize transactions or spending.\n\nURI: ${url.origin}\nVersion: 1\nChain ID: ${chainId}\nNonce: ${id}\nIssued At: ${new Date(now * 1000).toISOString()}\nExpiration Time: ${new Date((now + 300) * 1000).toISOString()}`;
    await db.prepare("INSERT INTO challenges(id,message,expires) VALUES(?,?,?)").bind(`wallet-login:${id}`, JSON.stringify({message, account, origin: url.origin}), now + 300).run();
    await db.prepare("DELETE FROM challenges WHERE expires<?").bind(now).run();
    return json({id, message});
  }
  if (action === "verify") {
    if (!/^[a-f0-9]{32}$/.test(body.id || "") || !/^0x[a-f0-9]{130}$/i.test(body.signature || "")) return new Response("Invalid signature", {status: 400});
    const id = `wallet-login:${body.id}`;
    const row = await db.prepare("SELECT message FROM challenges WHERE id=? AND expires>?").bind(id, now).first<{message:string}>();
    if (!row) return new Response("Sign-in expired. Please retry.", {status: 401});
    const challenge = JSON.parse(row.message);
    if (challenge.origin !== url.origin || !await verifyMessage({address: challenge.account, message: challenge.message, signature: body.signature})) return new Response("Signature does not match this wallet.", {status: 401});
    const consumed = await db.prepare("DELETE FROM challenges WHERE id=? AND expires>? RETURNING id").bind(id, now).first();
    if (!consumed) return new Response("Signature already used.", {status: 401});
    if (key) await db.prepare("DELETE FROM challenges WHERE id=?").bind(key).run();
    const next = Array.from(crypto.getRandomValues(new Uint8Array(32)), x => x.toString(16).padStart(2, "0")).join("");
    await db.prepare("INSERT INTO challenges(id,message,expires) VALUES(?,?,?)").bind(`wallet-session:${await digest(next)}`, JSON.stringify({account: challenge.account, origin: url.origin}), now + 28800).run();
    return json({account: challenge.account}, cookie(next, 28800));
  }
  return new Response("Not found", {status:404});
}
