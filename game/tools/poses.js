// Key-pose sheet for the wanderer: every named pose from js/playeranim.js, held still and shot from the front-right
// and the right side. Fast to iterate on pose numbers.   node tools/poses.js <out.jpg> [names,comma,separated]
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
(async () => {
  const [out, onlyS] = process.argv.slice(2);
  const tmp = fs.mkdtempSync(path.join(path.dirname(out), 'poses_'));
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 640, height: 640 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto('http://127.0.0.1:8765/index.html?test&rec');
  await page.waitForFunction(() => window.GAME); await page.waitForTimeout(2500);
  const names = await page.evaluate(async (only) => {
    const g = GAME; g.startFight();
    for (let i = 0; i < 3; i++) g.tick(1 / 60);
    g.boss.update = () => {};
    for (const id of ['hud', 'bossbar']) { const e = document.getElementById(id); if (e) e.style.display = 'none'; }
    const { POSES: P } = await import('./js/playeranim.js');
    // readable forms: clay material, a key and a rim light, the lantern dimmed
    const THREE = await import('three');
    const clay = new THREE.MeshStandardMaterial({ color: 0x9a948c, roughness: 0.8, side: THREE.DoubleSide });
    const dark = new THREE.MeshStandardMaterial({ color: 0x4a4744, roughness: 0.8, side: THREE.DoubleSide });
    g.player.root.traverse(o => { if (o.isMesh && o !== g.player.blade && o.material !== g.mats.playerDark) o.material = o.geometry.type === 'CapsuleGeometry' ? dark : clay; if (o.isPointLight) o.intensity = 0.3; });
    g.player.blade.material = new THREE.MeshStandardMaterial({ color: 0xffe0a0, emissive: 0x806020, roughness: 0.3 });
    const key = new THREE.DirectionalLight(0xffffff, 3.5); key.position.set(-6, 8, 4); key.target.position.set(0, 0, -15); g.scene.add(key, key.target);
    const rim = new THREE.DirectionalLight(0x9ab4ff, 2.0); rim.position.set(5, 4, -25); rim.target.position.set(0, 0, -15); g.scene.add(rim, rim.target);
    g.scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const list = [['guard', P.GUARD], ['run', P.RUN], ['sprint', P.SPRINT]];
    P.LIGHT.forEach((L, i) => { for (const k of ['ready', 'strike', 'follow']) list.push([`L${i + 1}.${k}`, L[k]]); });
    for (const k of ['ready', 'hop', 'strike']) list.push([`heavy.${k}`, P.HEAVY[k]]);
    for (const i of [1, 2, 4]) list.push([`roll${i}`, { ...P.ROLL[i][1], spinX: i === 2 ? Math.PI * 0.9 : 0 }]);
    for (const i of [2, 6, 7]) list.push([`down${i}`, P.DOWN[i][1]]);
    list.push(['dead', P.DEAD[P.DEAD.length - 1][1]]);
    for (const i of [2, 4]) list.push([`heal${i}`, P.HEAL[i][1]]);
    window.__poses = only ? list.filter(([n]) => only.split(',').includes(n)) : list;
    return __poses.map(p => p[0]);
  }, onlyS || null);
  const views = [[-3.4, 1.4, 3.6], [-5.0, 1.1, 0.2], [3.0, 1.9, -4.0]];
  for (let i = 0; i < names.length; i++) {
    for (let v = 0; v < views.length; v++) {
      await page.evaluate(({ i, v }) => {
        const g = GAME, p = g.player;
        p.pos.set(0, 0, -15); p.yaw = 0; p.state = 'idle'; p.atk = null; p.vel.set(0, 0, 0);
        const heal = __poses[i][0].startsWith('heal');
        p.anim.debugPose(__poses[i][1], heal ? 'heal' : 'idle');
        p.flask.visible = heal;
        const c = g.camera; c.position.set(v[0], v[1], -15 + v[2]); c.lookAt(0, 0.8, -14.9); c.fov = 34; c.updateProjectionMatrix();
        g.render();
      }, { i, v: views[v] });
      await page.screenshot({ path: path.join(tmp, `${String(i).padStart(2, '0')}_${v}.jpg`), type: 'jpeg', quality: 85, clip: { x: 150, y: 70, width: 340, height: 500 } });
    }
  }
  await browser.close();
  execFileSync('python3', ['-c', `
import sys, os
from PIL import Image, ImageDraw
d, out, names = sys.argv[1], sys.argv[2], sys.argv[3].split(',')
V = 3; W, H = 340, 500; cols = 2; per = 4
for c0 in range(0, len(names), per):
    chunk = names[c0:c0 + per]
    rows = (len(chunk) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * W * V, rows * H), (0, 0, 0)); dr = ImageDraw.Draw(sheet)
    for j, n in enumerate(chunk):
        i = c0 + j
        for v in range(V):
            im = Image.open(os.path.join(d, f'{i:02d}_{v}.jpg'))
            sheet.paste(im, ((j % cols) * W * V + v * W, (j // cols) * H))
        dr.text(((j % cols) * W * V + 8, (j // cols) * H + 6), n, fill=(255, 230, 120))
    sheet.save(out.replace('.jpg', f'_{c0 // per + 1}.jpg'), quality=85)
`, tmp, out, names.join(',')]);
  fs.rmSync(tmp, { recursive: true });
  console.log(out, names.length, 'poses'); console.log(errs.length ? 'ERRORS:\n' + errs.slice(0, 10).join('\n') : 'no page errors');
})();
