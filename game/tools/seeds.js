// Find showcase seeds: simulate bot fights and report what happened.  node tools/seeds.js <from> <to> [skill]
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const [a, b, sk] = process.argv.slice(2).map(Number);
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 320, height: 180 } });
  await page.goto('http://127.0.0.1:8765/index.html?test');
  await page.waitForFunction(() => window.GAME && window.Bot);
  const rows = await page.evaluate(({ a, b, sk }) => {
    const g = GAME, out = [];
    const st = {};
    g.events.on('boss-attack', e => { st.atk[e.name] = (st.atk[e.name] || 0) + 1; });
    g.events.on('player-hurt', e => { st.hurt++; });
    g.events.on('boss-stagger', () => st.stag++);
    g.events.on('dodged', () => st.dodged++);
    for (let s = a; s <= b; s++) {
      g.opts.seed = s; g.startFight(); const bot = new Bot(g, { skill: sk || 0.9 });
      st.atk = {}; st.hurt = 0; st.stag = 0; st.dodged = 0; let minHp = 100, t = 0;
      while (t < 400 && g.state === 'fight') { bot.step(1 / 60); g.tick(1 / 60); t += 1 / 60; minHp = Math.min(minHp, g.player.hp); }
      out.push({ seed: s, res: g.state, t: +t.toFixed(1), minHp: Math.round(minHp), hurt: st.hurt, stag: st.stag, dodged: st.dodged, nova: st.atk.nova || 0, lava: st.atk.lava || 0, combo: st.atk.combo || 0, roar: st.atk.roar || 0 });
    }
    return out;
  }, { a, b, sk });
  for (const r of rows) console.log(JSON.stringify(r));
  await browser.close();
})();
