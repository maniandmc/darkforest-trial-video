// Render selected times to PNG for look-dev.  node tools/preview.js <outdir> <scale> <t1,t2,...> [shotFile]
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs'), path = require('path');

(async () => {
  const [outDir, scaleS, timesS, sub] = process.argv.slice(2);
  const scale = parseFloat(scaleS || '0.5');
  const times = timesS.split(',').map(Number);
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('console', m => { const s = m.text(); if (!s.includes('GPU stall')) console.log('[page]', s); });
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.goto('file://' + path.resolve(__dirname, '../engine/index.html'));
  const info = await page.evaluate(s => init({ scale: s }), scale);
  console.log('init', JSON.stringify(info));
  for (const t of times) {
    const t0 = Date.now();
    const url = await page.evaluate(([t, sub]) => { renderFrame(t, sub ? { sub: +sub } : {}); return grab(); }, [t, sub]);
    fs.writeFileSync(path.join(outDir, `t_${t.toFixed(3)}.png`), Buffer.from(url.split(',')[1], 'base64'));
    console.log(`t=${t.toFixed(3)} ${Date.now() - t0}ms`);
  }
  await browser.close();
})();
