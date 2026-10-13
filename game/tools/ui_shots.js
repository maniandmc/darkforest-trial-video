// Screenshots of the menu flow: title, intro (rise + name card), pause.  node tools/ui_shots.js <outDir>
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
(async () => {
  const out = process.argv[2]; fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto('http://127.0.0.1:8765/index.html?test');
  await page.waitForFunction(() => window.GAME);
  const step = (secs) => page.evaluate(s => { for (let i = 0; i < Math.round(s * 60); i++) GAME.tick(1 / 60); GAME.render(); }, secs);
  await page.evaluate(() => GAME.toTitle()); await step(2.0); await page.waitForTimeout(1300);
  await page.screenshot({ path: `${out}/1_title.png` });
  await page.evaluate(() => GAME.begin()); await step(1.4); await page.screenshot({ path: `${out}/2_intro_rise.png` });
  await step(2.0); await page.waitForTimeout(1100); await page.screenshot({ path: `${out}/3_intro_namecard.png` });
  await step(2.0); await step(1.0); await page.screenshot({ path: `${out}/4_fight_start.png` });
  await page.evaluate(() => GAME.pause()); await page.waitForTimeout(1300); await page.screenshot({ path: `${out}/5_pause.png` });
  await page.evaluate(() => { GAME.resume(true); GAME.boss.takeDamage(1e6, 0, 'body', GAME); }); await step(5.0); await page.waitForTimeout(1400);
  await page.screenshot({ path: `${out}/6_victory.png` });
  await page.evaluate(() => { GAME.startFight(); GAME.player.takeHit({ dmg: 999, from: GAME.boss.pos.clone() }, GAME.ctx); }); await step(4.0); await page.waitForTimeout(1400);
  await page.screenshot({ path: `${out}/7_defeat.png` });
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no page errors');
  await browser.close();
})();
