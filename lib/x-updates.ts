export const X_ACCOUNT = "RovynCore";
export const X_UPDATES_KEY = "official:x-updates";
export const X_UPDATE_LIMIT = 20;
export type XUpdate = { id: string; url: string; authorName: string; text: string; publishedAt: string };

export function canonicalXPost(input: string): { id: string; url: string } {
  if (input.length > 500) throw new Error("Use an official @RovynCore post URL.");
  let url: URL;
  try { url = new URL(input.trim()); } catch { throw new Error("Use an official @RovynCore post URL."); }
  const match = url.pathname.match(/^\/RovynCore\/status\/([1-9]\d{14,19})\/?$/i);
  if (url.protocol !== "https:" || !["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(url.hostname) || url.port || url.username || url.password || !match) {
    throw new Error("Use an official @RovynCore post URL.");
  }
  return { id: match[1], url: "https://x.com/" + X_ACCOUNT + "/status/" + match[1] };
}

export function publishedAt(id: string): string {
  const timestamp = Number((BigInt(id) >> 22n) + 1288834974657n);
  if (!Number.isSafeInteger(timestamp) || timestamp < 1288834974657 || timestamp > Date.now() + 86400000) throw new Error("Invalid X post date.");
  return new Date(timestamp).toISOString();
}

function decodeText(text: string): string {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“" };
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
    if (!code.startsWith("#")) return named[code.toLowerCase()] ?? entity;
    const value = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : Number(code.slice(1));
    return value > 0 && value <= 0x10ffff && !(value >= 0xd800 && value <= 0xdfff) ? String.fromCodePoint(value) : "�";
  });
}

// oEmbed is treated as untrusted input. Only extract text; never inject its HTML.
export function updateFromOEmbed(input: string, data: unknown): XUpdate {
  const post = canonicalXPost(input);
  if (!data || typeof data !== "object") throw new Error("X returned no public post.");
  const reply = data as Record<string, unknown>;
  const author = typeof reply.author_url === "string" ? new URL(reply.author_url) : null;
  if (!author || author.protocol !== "https:" || !["x.com", "twitter.com"].includes(author.hostname) || author.pathname.toLowerCase() !== "/" + X_ACCOUNT.toLowerCase() || author.username || author.password || author.port) throw new Error("The post must belong to @RovynCore.");
  if (typeof reply.url !== "string" || canonicalXPost(reply.url).id !== post.id || typeof reply.html !== "string" || reply.html.length > 60000) throw new Error("X returned an unexpected post.");
  const paragraph = reply.html.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1];
  if (!paragraph || /<(?!\/?a\b|br\b)[^>]*>/i.test(paragraph)) throw new Error("X returned unsupported post content.");
  const text = decodeText(paragraph
    .replace(/<a\b[^>]*>pic\.twitter\.com\/[^<]*<\/a>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n").replace(/<\/?a\b[^>]*>/gi, ""))
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").trim();
  if (!text || text.length > 15000) throw new Error("X returned empty or oversized post text.");
  return { ...post, authorName: X_ACCOUNT, text, publishedAt: publishedAt(post.id) };
}

export async function importXUpdate(input: string, request: typeof fetch = fetch): Promise<XUpdate> {
  const post = canonicalXPost(input);
  const endpoint = new URL("https://publish.x.com/oembed");
  endpoint.searchParams.set("url", post.url);
  endpoint.searchParams.set("omit_script", "true");
  const response = await request(endpoint, { redirect: "manual", signal: AbortSignal.timeout(8000), headers: { Accept: "application/json" } });
  if (!response.ok || !response.body) throw new Error("X could not provide this public post. Try again later.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > 65536) throw new Error("X returned an oversized response.");
      chunks.push(next.value);
    }
  } finally { await reader.cancel(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return updateFromOEmbed(post.url, JSON.parse(new TextDecoder().decode(bytes)));
}

export function upsertXUpdate(posts: XUpdate[], update: XUpdate): XUpdate[] {
  return [update, ...posts.filter(post => post.id !== update.id)].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, X_UPDATE_LIMIT);
}

// Verified from the official public oEmbed response for the post supplied by the owner.
// Used only when no saved collection exists; an explicitly empty collection stays empty.
export const INITIAL_X_UPDATES: XUpdate[] = [{
  id: "2105584118692200907",
  url: "https://x.com/RovynCore/status/2105584118692200907",
  authorName: "RovynCore",
  text: "What if a game token did more than power the game?\nOne token. Shared across play, records, verification, and the infrastructure underneath.\nNot a closed loop. A base layer.",
  publishedAt: "2026-10-01T09:02:28.414Z",
}];


