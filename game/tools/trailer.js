// Render the v4 trailer (game/trailer.html) frame by frame. Serve the repository root (the trailer reads the CC0
// textures in ../assets): python3 -m http.server 8766   (from the repo root), then
//   node tools/trailer.js <outDir> [f0] [f1] [step]      → <outDir>/f_00000.jpg …  (frame numbers at 30 fps)
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const [out, a, b, s] = process.argv.slice(2);
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); });
  await page.goto(`http://127.0.0.1:${process.env.PORT || 8766}/game/trailer.html`);
  const ok = await page.waitForFunction(() => window.TR_READY, null, { timeout: 120000 }).then(h => h.jsonValue());
  if (ok !== true) { console.log('init failed', ok, errs); process.exit(1); }
  const N = await page.evaluate(() => TR.frames);
  const f0 = +(a ?? 0), f1 = Math.min(+(b ?? N), N), step = +(s ?? 1);
  const T0 = Date.now(); let n = 0;
  for (let f = f0; f < f1; f += step) {
    const info = await page.evaluate(f => TR.frame(f), f);
    await page.screenshot({ path: path.join(out, `f_${String(f).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 93 });
    n++;
    if (n === 1 || n % 30 === 0) console.log(`f ${f} t ${info.t.toFixed(2)} ${info.shot}  ${((Date.now() - T0) / n / 1000).toFixed(2)} s/frame`);
  }
  console.log(errs.length ? 'ERRORS:\n' + [...new Set(errs)].slice(0, 12).join('\n') : 'no console errors');
  await browser.close();
})();
