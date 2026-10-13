// Record a bot-played highlight reel. The game is deterministic for a given seed, so pass 1 simulates the whole session
// (title → intro → fight → result) without rendering to find the key moments; pass 2 replays it and renders only the
// frames inside those windows. Sound is re-synthesised offline from the logged events and cut to the same windows.
// node tools/record.js <outDir> <seed> [skill] [w] [h]
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const [out, seedS, skillS, wS, hS] = process.argv.slice(2);
  const seed = +(seedS || 3), skill = +(skillS || 0.9), W = +(wS || 1280), H = +(hS || 720), FPS = 30;
  const dir = path.join(out, 'frames'); fs.mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(`http://127.0.0.1:8765/index.html?test&rec&seed=${seed}`);
  await page.waitForFunction(() => window.GAME && window.Bot); await page.waitForTimeout(4000);

  // in-page session driver: one call = one video frame (two 1/60 s game ticks)
  await page.evaluate((skill) => {
    const g = GAME;
    window.__sess = {
      start() {
        g.sound.log = []; this.ev = []; this.f = 0; this.phase = 'title'; this.endF = -1; this.c0 = g.clock; window.__bot = null;
        g.toTitle();
        if (!this.hooked) {
          this.hooked = true;
          const ev = (name, d) => __sess.ev.push({ t: g.clock - __sess.c0, name, ...(d || {}) });
          g.events.on('boss-attack', e => ev('attack', { a: e.name }));
          g.events.on('boss-stagger', () => ev('stagger'));
          g.events.on('boss-dead', () => ev('dead'));
          g.events.on('player-dead', () => ev('pdead'));
          g.events.on('boss-impact', e => ev('impact', { k: e.kind }));
          g.events.on('end', e => ev('end', { r: e.result }));
        }
      },
      // advance one frame; returns false when the session is over
      step(render) {
        if (this.phase === 'title' && this.f >= 2.6 * 30) { g.begin(); this.phase = 'intro'; this.ev.push({ t: g.clock - this.c0, name: 'intro' }); }
        if (this.phase === 'intro' && g.introDone) {
          g.introDone = false; g.startFight(); window.__bot = new Bot(g, { skill }); this.phase = 'fight';
          this.ev.push({ t: g.clock - this.c0, name: 'fight' });
        }
        for (let i = 0; i < 2; i++) { if (window.__bot) __bot.step(1 / 60); g.tick(1 / 60); }
        if (render) g.render();
        this.f++;
        if (this.phase === 'fight' && g.state !== 'fight' && this.endF < 0) this.endF = this.f;
        return !(this.endF >= 0 && this.f - this.endF > 5.5 * 30) && this.f < 420 * 30;
      },
    };
  }, skill);

  // ---- pass 1: simulate everything, find the moments
  const plan = await page.evaluate(() => {
    const s = __sess; s.start();
    while (s.step(false)) { /* simulate */ }
    return { frames: s.f, ev: s.ev, result: GAME.state, fightTime: GAME.time };
  });
  const T = plan.frames / FPS, E = plan.ev;
  const first = (pred, n = 0) => E.filter(pred)[n];
  const at = (e, a, b) => e ? [e.t + a, e.t + b] : null;
  const fightT = first(e => e.name === 'fight').t;
  const wins = [
    [0, fightT + 3.2],                                                            // title, intro, first steps
    [fightT + 9, fightT + 17],                                                    // opening exchanges
    at(first(e => e.name === 'impact' && e.k === 'roar'), -1.2, 2.8),             // phase 2 roar
    at(first(e => e.name === 'impact' && e.k === 'lavaCall'), -1.3, 3.0),        // lava call
    at(first(e => e.name === 'attack' && e.a === 'combo'), 0, 3.8),              // 3-hit combo
    at(first(e => e.name === 'stagger'), -1.6, 2.6),                             // poise break
    at(first(e => e.name === 'impact' && e.k === 'roar', 1), -1.0, 2.6),          // phase 3 roar
    at(first(e => e.name === 'impact' && e.k === 'novaCharge'), -0.3, 3.6),       // fire nova
    at(first(e => e.name === 'dead' || e.name === 'pdead'), -4.0, T),             // the end + result screen
  ].filter(Boolean).map(([a, b]) => [Math.max(0, a), Math.min(T, b)]).sort((x, y) => x[0] - y[0]);
  const merged = [];
  for (const w of wins) { const l = merged[merged.length - 1]; if (l && w[0] <= l[1] + 0.5) l[1] = Math.max(l[1], w[1]); else merged.push([...w]); }
  const inWin = f => merged.some(([a, b]) => f / FPS >= a && f / FPS < b);
  const total = merged.reduce((s, [a, b]) => s + b - a, 0);
  console.log(`session ${T.toFixed(1)} s, result ${plan.result}; highlight ${total.toFixed(1)} s in ${merged.length} cuts`);
  console.log(JSON.stringify(merged.map(w => w.map(x => +x.toFixed(2)))));

  // ---- pass 2: replay, render only highlight frames
  await page.evaluate(() => __sess.start());
  let k = 0; const t0 = Date.now(); const kept = [];
  for (let f = 0; f < plan.frames; f++) {
    const want = inWin(f);
    await page.evaluate((r) => __sess.step(r), want);
    if (want) {
      await page.screenshot({ path: path.join(dir, `f_${String(k).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 90 });
      kept.push(f); k++;
      if (k % 150 === 0) console.log(`rendered ${k} frames  ${((Date.now() - t0) / k / 1000).toFixed(2)} s/frame`);
    }
  }
  const check = await page.evaluate(() => ({ ev: __sess.ev, result: GAME.state }));
  const same = JSON.stringify(check.ev.map(e => [e.name, e.t.toFixed(3)])) === JSON.stringify(plan.ev.map(e => [e.name, e.t.toFixed(3)]));
  console.log('replay identical to plan:', same, 'result', check.result);

  // ---- audio: synthesise the whole session, keep the windows
  const bytes = await page.evaluate(async (dur) => {
    const log = GAME.sound.log.map(e => ({ ...e, t: e.t - __sess.c0 - 1 / 30 }));
    window.__wav = await renderOffline(log, dur); return __wav.length;
  }, T);
  const chunks = [];
  for (let a = 0; a < bytes; a += 3 << 20) {
    chunks.push(Buffer.from(await page.evaluate(([a, b]) => { const u = __wav.subarray(a, b); let s = ''; for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); return btoa(s); }, [a, Math.min(bytes, a + (3 << 20))]), 'base64'));
  }
  fs.writeFileSync(path.join(out, 'session.wav'), Buffer.concat(chunks));
  fs.writeFileSync(path.join(out, 'plan.json'), JSON.stringify({ fps: FPS, frames: plan.frames, windows: merged, kept: kept.length, result: plan.result, fightTime: plan.fightTime, events: plan.ev, identical: same }, null, 1));
  console.log(errs.length ? 'ERRORS:\n' + errs.slice(0, 10).join('\n') : 'no page errors');
  await browser.close();
})();
