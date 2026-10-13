// Bot-driven fight that screenshots labelled moments.  node tools/capture.js <outDir> [seed] [skill] [labels] [w] [h]
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
(async () => {
  const [outDir, seedS, skillS, labelsS, wS, hS] = process.argv.slice(2);
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: +(wS || 1280), height: +(hS || 720) } });
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto('http://127.0.0.1:8765/index.html?test');
  await page.waitForFunction(() => window.GAME && window.Bot);
  const wanted = (labelsS || 'slam-windup,slam-impact,sweep-active,stomp-windup,charge-active,hit-boss,stagger,end').split(',');
  await page.evaluate(({ seed, skill, wanted }) => {
    const g = GAME; g.opts.seed = seed; g.startFight();
    window.__bot = new Bot(g, { skill, passive: skill === 0 });
    window.__want = new Set(wanted); window.__q = [];
    const at = (label, delay) => { if (__want.has(label)) { __want.delete(label); __q.push({ label, t: g.time + delay }); } };
    g.events.on('boss-seg', s => {
      if (s.tag === 'windup') at(s.name + '-windup', s.dur * 0.75);
      if (s.tag === 'active') at(s.name + '-active', Math.min(0.12, s.dur * 0.5));
      if (s.tag === 'recover' && s.seg === 2) at(s.name + '-impact', 0.02);
    });
    g.events.on('boss-seg', s => { if (s.tag === 'roar') at('roar', 0.45); });
    g.events.on('pool-erupt', () => at('pool', 0.35));
    g.events.on('boss-impact', e => { if (e.kind === 'novaBlast') at('nova-ring', 0.4); });
    g.events.on('player-hit-boss', () => at('hit-boss', 0));
    g.events.on('boss-stagger', () => at('stagger', 0.6));
    g.events.on('player-hurt', () => at('hurt', 0.05));
    g.events.on('end', () => at('end', 1.6));
    g.events.on('boss-phase', p => at('phase' + p.phase, 0.3));
  }, { seed: +(seedS || 7), skill: +(skillS || 0.9), wanted });
  let guard = 0;
  while (guard++ < 40) {
    const lab = await page.evaluate(() => {
      const g = GAME; const dt = 1 / 60;
      for (let i = 0; i < 60 * 400; i++) {
        if (__q.length && g.time >= __q[0].t) { const l = __q.shift().label; g.render(); return l; }
        if (!__q.length && !__want.size) return null;
        if (g.time > 700) return null;
        __bot.step(dt); g.tick(dt);
        if (g.state !== 'fight' && !__q.length && !__want.has('end')) return null;
      }
      return null;
    });
    if (!lab) break;
    await page.screenshot({ path: `${outDir}/${String(guard).padStart(2, '0')}_${lab}.png` });
    console.log('captured', lab);
  }
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no page errors');
  await browser.close();
})();
