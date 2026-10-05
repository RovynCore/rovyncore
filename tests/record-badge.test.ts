import test from "node:test";
import assert from "node:assert/strict";
import {
  badgeSnippets,
  badgeStatusLine,
  badgeUrl,
  escapeXml,
  fitText,
  parseBadgeAddress,
  recordUrl,
  renderBadgeSvg,
} from "../lib/record-badge.ts";

const ADDRESS = "0x545a1ff27596de2f31480df39aa9548f363fc361";
const base = { name: "RovynCore", symbol: "RVYN", status: "active", launchedAt: 1_790_000_000 };

test("only a plain address, optionally with .svg, is accepted", () => {
  assert.equal(parseBadgeAddress(ADDRESS), ADDRESS);
  assert.equal(parseBadgeAddress(`${ADDRESS}.svg`), ADDRESS);
  assert.equal(parseBadgeAddress(ADDRESS.toUpperCase().replace("0X", "0x")), ADDRESS, "normalised to lower case");
  for (const bad of ["", "0x123", `${ADDRESS}0`, `${ADDRESS}.png`, `${ADDRESS}.svg.svg`, `../${ADDRESS}`, `${ADDRESS}%2e`, `0x${"g".repeat(40)}`, `${ADDRESS}\n`]) {
    assert.equal(parseBadgeAddress(bad), null, JSON.stringify(bad));
  }
});

test("a confirmed record says so, with the launch date, and nothing about safety", () => {
  const svg = renderBadgeSvg(base);
  assert.match(svg, /Confirmed launch record · 2026-09-21/);
  assert.match(svg, /ONCHAIN RECORD · RVYN/);
  // The only mention of these words is the explicit disclaimer in <desc>.
  const visible = svg.replace(/<desc[\s\S]*?<\/desc>/, "");
  assert.doesNotMatch(visible, /verified|safe|audit|secure|trust|guarantee/i);
  assert.match(svg, /Not a safety rating, audit or endorsement/);
});

test("pending and unavailable records never read as confirmed", () => {
  assert.match(renderBadgeSvg({ ...base, status: "pending" }), /Awaiting confirmations/);
  assert.doesNotMatch(renderBadgeSvg({ ...base, status: "pending" }), /Confirmed/);
  assert.match(renderBadgeSvg({ ...base, status: "unavailable" }), /temporarily unavailable/);
  assert.doesNotMatch(renderBadgeSvg({ ...base, status: "unavailable" }), /Confirmed/);
  assert.match(renderBadgeSvg({ ...base, status: "something-new" }), /temporarily unavailable/, "unknown statuses fail closed");
  assert.equal(badgeStatusLine({ status: "active", launchedAt: null }).line, "Confirmed launch record");
});

test("creator-supplied text cannot inject markup or scripts", () => {
  const hostile = `"><script>alert(1)</script><image href="x" onerror="alert(2)"/>&'`;
  const svg = renderBadgeSvg({ ...base, name: hostile, symbol: hostile });
  assert.doesNotMatch(svg, /<script/i);
  assert.doesNotMatch(svg, /<image/i);
  // Every "<" in the output belongs to a tag we wrote; user text only ever appears escaped.
  const tags = svg.match(/<(?!\/?(svg|title|desc|rect|circle|text)\b)[^>]*>/g);
  assert.equal(tags, null, `unexpected tags: ${tags?.join(" ")}`);
  assert.equal(escapeXml(`<>&"'`), "&lt;&gt;&amp;&quot;&apos;");
});

test("control characters, invalid XML characters and bidi overrides are removed", () => {
  const nasty = "A\u0000B\u0008C￾D‮E⁦F\u0007G";
  const out = escapeXml(nasty);
  assert.equal(out, "ABCDEFG");
  assert.doesNotMatch(renderBadgeSvg({ ...base, name: nasty, symbol: nasty }), /[\u0000-\u0008‮⁦￾]/);
});

test("long and CJK names are shortened to fit and still end cleanly", () => {
  assert.equal(fitText("RVYN", 12), "RVYN");
  assert.equal(fitText("ABCDEFGHIJKLMNOP", 12), "ABCDEFGHIJK…");
  assert.equal(fitText("一二三四五六七八", 12), "一二三四五…", "CJK counts double and fits the same budget");
  assert.equal(fitText("  spaced \n\t out  ", 40), "spaced out");
  assert.equal(fitText("", 12), "");
  const svg = renderBadgeSvg({ ...base, name: "N".repeat(500), symbol: "S".repeat(500) });
  assert.ok(svg.length < 2500, "output size is bounded regardless of input size");
});

test("an emoji (surrogate pair) is never split in half", () => {
  const out = fitText("😀".repeat(30), 12);
  assert.ok(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(out), "no lone high surrogate");
  assert.ok(!/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(out), "no lone low surrogate");
});

test("the SVG is well formed and has a stable accessible name", () => {
  const svg = renderBadgeSvg(base);
  assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'));
  assert.ok(svg.endsWith("</svg>"));
  assert.match(svg, /role="img" aria-labelledby="t d"/);
  assert.match(svg, /<title id="t">RVYN · Onchain Record<\/title>/);
  const opens = (svg.match(/<(svg|title|desc|text)\b/g) ?? []).length;
  const closes = (svg.match(/<\/(svg|title|desc|text)>/g) ?? []).length;
  assert.equal(opens, closes);
});

test("embed snippets point at the canonical site and contain no creator text", () => {
  const { html, markdown } = badgeSnippets(ADDRESS.toUpperCase().replace("0X", "0x"));
  assert.equal(badgeUrl(ADDRESS), `https://www.rovyncore.com/badge/${ADDRESS}.svg`);
  assert.equal(recordUrl(ADDRESS), `https://www.rovyncore.com/assets/robinhood/${ADDRESS}`);
  assert.ok(html.includes(`src="${badgeUrl(ADDRESS)}"`) && html.includes(`href="${recordUrl(ADDRESS)}"`));
  assert.ok(html.includes('rel="noopener"'));
  assert.ok(markdown.includes(`(${badgeUrl(ADDRESS)})`) && markdown.endsWith(`(${recordUrl(ADDRESS)})`));
  assert.doesNotMatch(html + markdown, /RovynCore\b(?!\s+(Onchain|$))[^"\]]*RVYN/);
});
