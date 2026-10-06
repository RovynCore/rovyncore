const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const p = await b.newPage();
  await p.goto('file://' + __dirname + '/whitepaper.html', { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  await p.pdf({ path: process.argv[2], format: 'A4', printBackground: true, preferCSSPageSize: true,
    displayHeaderFooter: true, headerTemplate: '<span></span>',
    footerTemplate: '<div style="width:100%;font-size:7pt;color:#80857c;padding:0 17mm;display:flex;justify-content:space-between;font-family:sans-serif"><span>RovynCore: Lightdive · Whitepaper v1.0</span><span class="pageNumber"></span></div>' });
  await b.close();
})();
