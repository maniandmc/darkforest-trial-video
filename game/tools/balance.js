// Simulated fights (no rendering) with bots of different skill. node tools/balance.js [runs] [skills]
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const runs = +(process.argv[2] || 4), skills = (process.argv[3] || '0,0.6,0.8,0.95').split(',').map(Number);
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto('http://127.0.0.1:8765/index.html?test');
  await page.waitForFunction(() => window.GAME && window.Bot);
  for (const skill of skills) {
    const res = await page.evaluate(({ skill, runs }) => {
      const out = [];
      for (let r = 0; r < runs; r++) {
        const g = GAME; g.opts.seed = 1000 + r * 77; g.startFight();
        const bot = new Bot(g, { skill, passive: skill === 0 });
        const hits = {}; let dmgTaken = 0;
        if (!g._statHook) { g._statHook = true; g.events.on('player-hurt', i => { g._hits[i.src] = (g._hits[i.src] || 0) + 1; g._dmg += i.dmg; }); g.events.on('boss-attack', a => { g._atk[a.name] = (g._atk[a.name] || 0) + 1; }); g.events.on('boss-stagger', () => g._stag++); }
        g._hits = hits; g._dmg = 0; g._atk = {}; g._stag = 0;
        let t = 0; const dt = 1 / 60;
        while (t < 600 && g.state === 'fight') { bot.step(dt); g.tick(dt); t += dt; }
        out.push({ result: g.state === 'fight' ? 'timeout' : g.state, t: +t.toFixed(1), bossHp: g.boss.hp, playerHp: g.player.hp, flasks: g.player.flasks,
          hits: g._hits, dmgTaken: g._dmg, atk: g._atk, staggers: g._stag, rolls: bot.stats.rolls, swings: bot.stats.attacks, phase: g.boss.phase });
      }
      return out;
    }, { skill, runs });
    const wins = res.filter(r => r.result === 'victory');
    console.log(`skill ${skill}: wins ${wins.length}/${runs}  avg win time ${wins.length ? (wins.reduce((s, r) => s + r.t, 0) / wins.length).toFixed(0) : '-'}s`);
    for (const r of res) console.log('  ', JSON.stringify(r));
  }
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no page errors');
  await browser.close();
})();
