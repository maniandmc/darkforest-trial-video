// Look-dev stills for the v4 trailer: render chosen frames, optionally from a custom camera around the wanderer.
//   node tools/trailer_look.js <out.jpg> <frame>[,<frame>…] [orbit]     orbit: 4 views circling the wanderer at that frame
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');
(async () => {
  const [out, framesS, mode] = process.argv.slice(2);
  const tmp = fs.mkdtempSync(path.join(path.dirname(out), 'look_'));
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(`http://127.0.0.1:${process.env.PORT || 8766}/game/trailer.html`);
  const ok = await page.waitForFunction(() => window.TR_READY, null, { timeout: 120000 }).then(h => h.jsonValue());
  if (ok !== true) { console.log('init failed', ok, errs); process.exit(1); }
  if (process.env.EVAL) await page.evaluate(process.env.EVAL);
  const shots = [];
  for (const f of framesS.split(',').map(Number)) {
    const views = mode === 'orbit' ? [0, 1, 2, 3].map(i => ({ a: i * Math.PI / 2 + 0.5 })) : [null];
    for (const v of views) {
      const T = Date.now();
      await page.evaluate(([f, v]) => {
        if (!v) return TR.frame(f);
        TR.frame(f);
        const p = TR.player.pos, r = 3.2;
        return TR.frame(f, { pos: [p.x + Math.sin(v.a) * r, p.y + 1.3, p.z + Math.cos(v.a) * r], look: [p.x, p.y + 1.0, p.z], fov: 32 });
      }, [f, v]);
      const file = path.join(tmp, `${shots.length}.jpg`);
      await page.screenshot({ path: file, type: 'jpeg', quality: 92, clip: { x: 0, y: 135, width: 1920, height: 810 } });
      shots.push(file); console.log(`frame ${f}${v ? ' view ' + v.a.toFixed(1) : ''}  ${((Date.now() - T) / 1000).toFixed(1)} s`);
    }
  }
  await browser.close();
  execFileSync('python3', ['-c', `
import sys
from PIL import Image
fs = sys.argv[2:]; ims = [Image.open(f).resize((960, 405)) for f in fs]
cols = 2 if len(ims) > 1 else 1; rows = (len(ims) + cols - 1) // cols
s = Image.new('RGB', (960 * cols, 405 * rows))
for i, im in enumerate(ims): s.paste(im, ((i % cols) * 960, (i // cols) * 405))
s.save(sys.argv[1], quality=88)`, out, ...shots]);
  fs.rmSync(tmp, { recursive: true });
  console.log(errs.length ? 'ERRORS:\n' + [...new Set(errs)].slice(0, 8).join('\n') : 'no page errors');
})();
