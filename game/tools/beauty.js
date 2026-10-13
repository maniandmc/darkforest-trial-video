// Close-up look-dev shots of the boss and the wanderer.  node tools/beauty.js <outDir>
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
(async () => {
  const out = process.argv[2]; fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto('http://127.0.0.1:8765/index.html?test');
  await page.waitForFunction(() => window.GAME); await page.waitForTimeout(3000);
  const shots = [
    ['face', [3.5, 8.6, 3.2], [0, 8.4, 8], 40, 0],
    ['body', [7, 4.5, -4], [0, 5.5, 8], 50, 0],
    ['phase3', [-6, 3.5, -5], [0, 6, 8], 50, 2],
    ['hero', [1.8, 1.7, -17.5], [0, 1.1, -15], 40, 0],
  ];
  for (const [name, pos, look, fov, phase] of shots) {
    await page.evaluate(([pos, look, fov, phase]) => {
      const g = GAME; g.startFight(); g.hud.show(false); g.hud.showBoss(false); g.boss.ai = false; g.boss.phase = phase;
      for (let i = 0; i < 30; i++) g.tick(1 / 60);
      const T = g.camera.position.constructor;
      g.rig.apply(0.016, new T(...pos), new T(...look), fov); g.render();
    }, [pos, look, fov, phase]);
    await page.screenshot({ path: `${out}/${name}.png` });
  }
  console.log(errs.length ? errs.join('\n') : 'no page errors');
  await browser.close();
})();
