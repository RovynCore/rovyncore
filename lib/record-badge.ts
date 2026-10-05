// Onchain Record badge: a small SVG that links to an asset's public record.
// It states only what the record layer observed (a launch was confirmed, and when). It is never a safety
// rating, audit or endorsement, and it never claims anything the record does not hold.

export const SITE_ORIGIN = "https://www.rovyncore.com";
export const BADGE_WIDTH = 360;
export const BADGE_HEIGHT = 96;

export type BadgeRecordStatus = "active" | "pending" | "unavailable";
export type BadgeInput = {
  name: string;
  symbol: string;
  status: string;
  /** Unix seconds of the launch transaction's block. */
  launchedAt: number | null;
};

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/** Accepts `0x…` or `0x….svg`; anything else is rejected without decoding. */
export function parseBadgeAddress(raw: string): string | null {
  const bare = raw.endsWith(".svg") ? raw.slice(0, -4) : raw;
  return ADDRESS.test(bare) ? bare.toLowerCase() : null;
}

export const badgeUrl = (address: string) => `${SITE_ORIGIN}/badge/${address.toLowerCase()}.svg`;
export const recordUrl = (address: string) => `${SITE_ORIGIN}/assets/robinhood/${address.toLowerCase()}`;

/** Copy-paste snippets. The alt text is fixed so creator-supplied names can never break out of the markup. */
export function badgeSnippets(address: string) {
  const alt = "Onchain Record badge on RovynCore";
  return {
    html: `<a href="${recordUrl(address)}" target="_blank" rel="noopener"><img src="${badgeUrl(address)}" alt="${alt}" width="${BADGE_WIDTH}" height="${BADGE_HEIGHT}"></a>`,
    markdown: `[![${alt}](${badgeUrl(address)})](${recordUrl(address)})`,
  };
}

// Characters XML 1.0 forbids, plus bidirectional overrides that could visually reorder the text.
const FORBIDDEN = /[^\u0009\u000A\u000D -퟿-�\u{10000}-\u{10FFFF}]|[‪-‮⁦-⁩]/gu;

export function escapeXml(text: string): string {
  return text
    .replace(FORBIDDEN, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const isWide = (codePoint: number) => codePoint >= 0x2e80;

/** Trims to a visual width budget (CJK counts double) and ends with an ellipsis when something was cut. */
export function fitText(text: string, budget: number): string {
  const chars = [...text.replace(FORBIDDEN, "").replace(/\s+/g, " ").trim()];
  const widthOf = (char: string) => (isWide(char.codePointAt(0) ?? 0) ? 2 : 1);
  if (chars.reduce((sum, char) => sum + widthOf(char), 0) <= budget) return chars.join("");
  let used = 0;
  let out = "";
  for (const char of chars) {
    if (used + widthOf(char) > budget - 1) break;
    used += widthOf(char);
    out += char;
  }
  return `${out}…`;
}

const day = (seconds: number) => new Date(seconds * 1000).toISOString().slice(0, 10);

export function badgeStatusLine(input: Pick<BadgeInput, "status" | "launchedAt">): { line: string; color: string } {
  if (input.status === "active") {
    return { line: input.launchedAt ? `Confirmed launch record · ${day(input.launchedAt)}` : "Confirmed launch record", color: "#c7ff4f" };
  }
  if (input.status === "pending") return { line: "Awaiting confirmations", color: "#e6c36a" };
  return { line: "Record temporarily unavailable", color: "#8b9c80" };
}

export function renderBadgeSvg(input: BadgeInput): string {
  const symbol = fitText(input.symbol, 12) || "—";
  const name = fitText(input.name, 30);
  const { line, color } = badgeStatusLine(input);
  const title = `${escapeXml(symbol)} · Onchain Record`;
  const desc = "Observed facts from the RovynCore Onchain Record. Not a safety rating, audit or endorsement. The name and symbol are chosen by the asset's creator.";
  const font = "system-ui,-apple-system,'Segoe UI',Roboto,'Noto Sans','Noto Sans CJK TC','Noto Sans CJK KR',sans-serif";
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${BADGE_WIDTH}" height="${BADGE_HEIGHT}" viewBox="0 0 ${BADGE_WIDTH} ${BADGE_HEIGHT}" role="img" aria-labelledby="t d">`,
    `<title id="t">${title}</title><desc id="d">${escapeXml(desc)}</desc>`,
    `<rect width="${BADGE_WIDTH}" height="${BADGE_HEIGHT}" rx="12" fill="#090c0a"/>`,
    `<rect x=".5" y=".5" width="${BADGE_WIDTH - 1}" height="${BADGE_HEIGHT - 1}" rx="11.5" fill="none" stroke="#2a3528"/>`,
    `<circle cx="26" cy="26" r="5" fill="${color}"/>`,
    `<text x="38" y="30" font-family="${font}" font-size="11" letter-spacing="1.4" fill="#9fd66a">ONCHAIN RECORD · ${escapeXml(symbol)}</text>`,
    `<text x="20" y="57" font-family="${font}" font-size="14" font-weight="600" fill="#a8b5a0">${escapeXml(name)}</text>`,
    `<text x="20" y="80" font-family="${font}" font-size="12.5" fill="#f2f7ec">${escapeXml(line)}</text>`,
    `<text x="${BADGE_WIDTH - 16}" y="80" text-anchor="end" font-family="${font}" font-size="10" fill="#6f7d68">rovyncore.com</text>`,
    `</svg>`,
  ].join("");
}
