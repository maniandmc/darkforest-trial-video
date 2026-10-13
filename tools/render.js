// Batch renderer.  node tools/render.js <outDir> <scale> <fps> <worker> <workers> [from] [to] [--nomb]
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const a = process.argv.slice(2);
  const [outDir, scale, fps, wi, wn] = [a[0], +a[1], +a[2], +a[3], +a[4]];
  const nomb = a.includes('--nomb');
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.goto('file://' + path.resolve(__dirname, '../engine/' + (process.env.PAGE || 'index.html')));
  await page.evaluate(s => init({ scale: s }), scale);
  const total = await page.evaluate(f => Math.round(TL.duration * f), fps);
  const from = a[5] && !a[5].startsWith('--') ? +a[5] : 0, to = a[6] && !a[6].startsWith('--') ? +a[6] : total;
  const t0 = Date.now(); let n = 0;
  for (let f = from; f < to; f++) {
    if (f % wn !== wi) continue;
    const file = path.join(outDir, `f_${String(f).padStart(5, '0')}.png`);
    if (fs.existsSync(file)) continue;
    const url = await page.evaluate(([f, fps, nomb]) => { renderFrame(f / fps, Object.assign({ fps }, nomb ? { sub: 1 } : {})); return grab(); }, [f, fps, nomb]);
    fs.writeFileSync(file + '.tmp', Buffer.from(url.split(',')[1], 'base64'));
    fs.renameSync(file + '.tmp', file);
    n++;
    if (n % 25 === 0) console.log(`worker ${wi}: frame ${f}/${to}  avg ${((Date.now() - t0) / n / 1000).toFixed(2)}s`);
  }
  console.log(`worker ${wi} done: ${n} frames in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  await browser.close();
})();
