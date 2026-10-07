// Playwright is not a project dependency: load it like CommonJS so a global install found through
// NODE_PATH works (e.g. NODE_PATH=$(npm root -g)).
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Usage: node render.mjs <out.pdf> [page.html] [footer label]
const input = process.argv[3] || 'whitepaper.html';
const label = process.argv[4] || 'RovynCore: Lightdive · Whitepaper v1.0';
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const p = await b.newPage();
  await p.goto('file://' + __dirname + '/' + input, { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  await p.pdf({ path: process.argv[2], format: 'A4', printBackground: true, preferCSSPageSize: true,
    displayHeaderFooter: true, headerTemplate: '<span></span>',
    footerTemplate: '<div style="width:100%;font-size:7pt;color:#80857c;padding:0 17mm;display:flex;justify-content:space-between;font-family:sans-serif"><span>' + label + '</span><span class="pageNumber"></span></div>' });
  await b.close();
})();
