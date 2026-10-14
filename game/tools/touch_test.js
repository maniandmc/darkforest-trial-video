// Touch controls on an emulated phone (844×390 CSS px, DPR 3, touch): title → start → skip intro → stick, sprint,
// buttons (also while the stick is held), camera drag, pause/resume, quality switch, portrait prompt. Real game loop.
// node tools/touch_test.js <outDir>
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const out = process.argv[2] || 'touch_out'; fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); });
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id, radiusX: 8, radiusY: 8, force: 1 })) });
  const wait = ms => page.waitForTimeout(ms);
  const G = fn => page.evaluate(fn);
  const shot = async n => page.screenshot({ path: path.join(out, n + '.png') });
  const results = []; const check = (name, ok, info = '') => { results.push({ name, ok, info }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (info ? '  ' + info : '')); };
  const center = async sel => { const b = await page.locator(sel).first().boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
  const until = (fn, arg, ms = 4000) => page.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
  const idle = () => until(() => ['idle', 'move'].includes(GAME.player.state), null, 8000);
  const tap = async (sel, id = 5) => { const [x, y] = await center(sel); await touch('touchStart', [[x, y, id]]); await wait(60); await touch('touchEnd', []); };

  await page.goto(process.env.URL || 'http://127.0.0.1:8765/index.html');      // no ?touch: rely on device detection
  await page.waitForFunction(() => window.GAME && GAME.state === 'title'); await wait(1500);
  const det = await G(() => ({ coarse: matchMedia('(hover: none) and (pointer: coarse)').matches, touch: !!GAME.touch, q: GAME.qualityName,
    menu: [...document.querySelectorAll('#title .qrow button')].map(b => b.textContent + (b.classList.contains('sel') ? '*' : '')) }));
  check('touch device detected, phone preset by default', det.touch && det.q === 'mobile', JSON.stringify(det));
  await shot('01_title');

  await tap('#btn-start');
  await page.waitForFunction(() => GAME.state === 'intro'); await wait(900);
  await shot('02_intro');
  await touch('touchStart', [[420, 200, 1]]); await wait(60); await touch('touchEnd', []);
  await page.waitForFunction(() => GAME.state === 'fight', null, { timeout: 15000 });
  check('tap skips the intro', true);
  await wait(1200);
  const st0 = await G(() => ({ locked: GAME.locked, on: document.getElementById('touch').classList.contains('on') }));
  check('controls shown, lock-on on by default', st0.on && st0.locked, JSON.stringify(st0));
  await shot('03_fight');

  // stick: forward, then past the rim to sprint
  const p0 = await G(() => [GAME.player.pos.x, GAME.player.pos.z]);
  await touch('touchStart', [[150, 290, 1]]); await wait(50);
  await touch('touchMove', [[150, 240, 1]]); await wait(900);
  const mv = await G(() => ({ s: GAME.player.state, x: GAME.player.pos.x, z: GAME.player.pos.z }));
  check('stick moves the wanderer', Math.hypot(mv.x - p0[0], mv.z - p0[1]) > 0.5, JSON.stringify(mv));
  await shot('04_stick');
  await touch('touchMove', [[150, 200, 1]]); await wait(400);
  const spr = await G(() => ({ sprint: GAME.player.sprinting, cls: document.getElementById('t-stick').className }));
  check('pushing past the rim sprints', spr.sprint, JSON.stringify(spr));
  await shot('05_sprint');
  // attack while the stick is still held (two fingers)
  const L = await center('.t-light');
  await touch('touchStart', [[150, 200, 1], [L[0], L[1], 2]]);
  const atk = await until(() => GAME.player.state === 'attack');
  await touch('touchMove', [[150, 200, 1]]); await wait(60);
  await touch('touchEnd', []);
  check('attack button works with the stick held', atk);
  await idle();

  for (const [sel, want] of [['.t-roll', 'roll'], ['.t-heavy', 'attack']]) {
    await tap(sel);
    const ok = await until(w => GAME.player.state === w, want);
    check(sel + ' → ' + want, ok, 'state ' + await G(() => GAME.player.state));
    await idle();
  }
  const f0 = await G(() => GAME.player.flasks);
  await tap('.t-heal'); await until(n => GAME.player.flasks === n, f0 - 1); await idle();
  const f1 = await G(() => ({ n: GAME.player.flasks, badge: document.getElementById('t-heal-n').textContent }));
  check('heal uses a flask, badge follows', f1.n === f0 - 1 && f1.badge === String(f1.n), `${f0} → ${JSON.stringify(f1)}`);

  // lock-on off, then the right side of the screen turns the camera
  await tap('.t-lock'); await wait(200);
  const lk = await G(() => GAME.locked);
  const y0 = await G(() => GAME.rig.yaw);
  await touch('touchStart', [[560, 160, 3]]); await wait(40);
  for (let i = 1; i <= 6; i++) { await touch('touchMove', [[560 - i * 30, 160, 3]]); await wait(40); }
  await touch('touchEnd', []); await wait(200);
  const y1 = await G(() => GAME.rig.yaw);
  check('lock button toggles lock-on', lk === false, 'locked ' + lk);
  check('right-side drag turns the camera', Math.abs(y1 - y0) > 0.5, `yaw ${y0.toFixed(2)} → ${y1.toFixed(2)}`);

  // pause, switch quality from the pause menu, resume
  await tap('.t-pause'); await wait(400);
  const ps = await G(() => GAME.state);
  check('pause button pauses', ps === 'paused', ps);
  await shot('06_pause');
  await tap('#pause .qrow [data-q="high"]'); await wait(800);
  const qh = await G(() => ({ q: GAME.qualityName, pr: GAME.renderer.getPixelRatio(), bloom: GAME.quality.bloom }));
  await tap('#pause .qrow [data-q="mobile"]'); await wait(800);
  const qm = await G(() => ({ q: GAME.qualityName, pr: GAME.renderer.getPixelRatio(), lite: GAME.mats.floor.defines.LITE, saved: localStorage.getItem('dite.quality') }));
  check('quality: PC original ↔ phone preset', qh.q === 'high' && qh.pr === 2 && qm.q === 'mobile' && qm.pr <= 1 && qm.lite === 1, JSON.stringify({ qh, qm }));
  await tap('#btn-resume'); await wait(500);
  check('resume', (await G(() => GAME.state)) === 'fight');

  // portrait: prompt + the fight pauses
  await page.setViewportSize({ width: 390, height: 844 });
  await until(() => GAME.state === 'paused', null, 5000);
  const pr = await G(() => ({ s: GAME.state, rot: getComputedStyle(document.getElementById('rotate')).display, mq: GAME.touch.portrait.matches }));
  check('portrait shows the rotate prompt and pauses', pr.s === 'paused' && pr.rot === 'flex', JSON.stringify(pr));
  await shot('07_portrait');
  await page.setViewportSize({ width: 844, height: 390 }); await wait(500);
  await tap('#btn-resume'); await wait(400);

  // the menus on a short screen
  await G(() => { GAME.player.hp = 0; GAME.player.setState('dead'); GAME.events.emit('player-dead'); });
  await page.waitForFunction(() => GAME.state === 'defeat', null, { timeout: 20000 }); await wait(1500);
  await shot('08_defeat');

  console.log(errs.length ? 'ERRORS:\n' + [...new Set(errs)].slice(0, 12).join('\n') : 'no console errors');
  console.log(`${results.filter(r => r.ok).length}/${results.length} passed`);
  await browser.close();
})();
