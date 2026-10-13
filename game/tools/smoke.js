// Headless smoke test: load, start the fight, step N frames, screenshot.  node tools/smoke.js <out.png> [frames] [url]
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const [out, framesS, url] = process.argv.slice(2);
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  await page.goto(url || 'http://127.0.0.1:8765/index.html?test');
  await page.waitForFunction(() => window.GAME, null, { timeout: 20000 });
  const t0 = Date.now();
  const info = await page.evaluate((n) => {
    const g = GAME; g.startFight();
    for (let i = 0; i < n; i++) g.tick(1 / 60);
    const t = performance.now(); g.render(); const rt = performance.now() - t;
    return { boss: g.boss.state, hp: g.boss.hp, p: [g.player.pos.x, g.player.pos.z], calls: g.renderer.info.render.calls, tris: g.renderer.info.render.triangles, rt };
  }, +(framesS || 60));
  await page.screenshot({ path: out });
  console.log(JSON.stringify(info), (Date.now() - t0) + 'ms');
  console.log(errs.length ? errs.join('\n') : 'no console errors');
  await browser.close();
})();
