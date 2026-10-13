// Motion study of the wanderer: a scripted move list (run, turn, sprint, light chain, heavy, rolls, heal, hit, knock-down,
// roar push) filmed by a close orbit camera with the boss frozen out of the way. Writes frames + a label track that
// tools/motion_sheet.py turns into contact sheets and a video.
// node tools/motion.js <outDir> [every=2] [w=800] [h=600] [only=label,label|all] [clay]
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const [out, everyS, wS, hS, onlyArg, clayS] = process.argv.slice(2);
  const onlyS = onlyArg && onlyArg !== 'all' ? onlyArg : null, clay = clayS === 'clay';
  const every = +(everyS || 2), W = +(wS || 800), H = +(hS || 600);
  fs.mkdirSync(path.join(out, 'frames'), { recursive: true });
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(`http://127.0.0.1:${process.env.PORT || 8765}/index.html?test&rec`);      // PORT: film another checkout
  await page.waitForFunction(() => window.GAME); await page.waitForTimeout(3000);

  await page.evaluate(async (clay) => {
    const g = GAME, P = g.player;
    g.startFight();
    if (clay) {                     // readable forms for animation review
      const THREE = await import('three');
      const m = new THREE.MeshStandardMaterial({ color: 0x9a948c, roughness: 0.8, side: THREE.DoubleSide }), d = new THREE.MeshStandardMaterial({ color: 0x4a4744, roughness: 0.8 });
      P.root.traverse(o => { if (o.isMesh && o !== P.blade && o.material !== g.mats.playerDark) o.material = o.geometry.type === 'CapsuleGeometry' ? d : m; if (o.isPointLight) o.intensity = 0.4; });
      const key = new THREE.DirectionalLight(0xffffff, 3.0); key.position.set(-30, 40, 30); g.scene.add(key);
      g.scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    }
    for (let i = 0; i < 5; i++) g.tick(1 / 60);
    g.boss.update = () => {};                      // frozen and out of the way
    g.boss.root.visible = false; g.boss.solid = false; g.boss.root.position.set(0, 0, 400);
    for (const id of ['hud', 'bossbar']) { const e = document.getElementById(id); if (e) e.style.display = 'none'; }
    const v = {}; g.input.virtual = v;
    const front = (d) => { const p = P.pos; return { x: p.x + Math.sin(P.yaw) * d, y: 0, z: p.z + Math.cos(P.yaw) * d }; };
    // [label, seconds, per-tick driver(t, v)]
    const press = (k, ...at) => (t, v, dt) => { for (const a of at) if (t <= a && t + dt > a) v[k] = true; };
    window.__moves = [
      ['idle', 0.9, () => {}],
      ['run', 1.3, (t, v) => { v.moveY = 1; }],
      ['turns', 1.2, (t, v) => { v.moveY = 0.3; v.moveX = t < 0.6 ? 1 : -1; }],
      ['sprint', 1.4, (t, v) => { v.moveY = 1; v.sprint = true; }],
      ['stop', 0.8, () => {}],
      ['light-chain', 1.7, press('light', 0.01, 0.36, 0.72)],
      ['heavy', 1.35, press('heavy', 0.01)],
      ['roll', 0.95, (t, v, dt) => { press('roll', 0.01)(t, v, dt); if (t < 0.1) v.moveY = 1; }],
      ['roll-side', 0.95, (t, v, dt) => { press('roll', 0.01)(t, v, dt); if (t < 0.1) v.moveX = 1; }],
      ['heal', 1.45, press('heal', 0.01)],
      ['hit', 0.75, (t) => { if (t === 0) P.takeHit({ dmg: 1, from: front(3), kb: 5 }, g.ctx); }],
      ['knockdown', 1.75, (t) => { if (t === 0) P.takeHit({ dmg: 1, kd: true, kb: 9, from: front(3) }, g.ctx); }],
      ['push', 0.9, (t) => { if (t === 0) P.push(front(6), 9, g.ctx); }],
    ];
    window.__cam = { yaw: P.yaw };
  }, clay);

  const moves = await page.evaluate(() => __moves.map(m => [m[0], m[1]]));
  const only = onlyS ? new Set(onlyS.split(',')) : null;
  const labels = []; let k = 0;
  for (let mi = 0; mi < moves.length; mi++) {
    const [label, dur] = moves[mi];
    const ticks = Math.round(dur * 60);
    for (let i = 0; i < ticks; i++) {
      const want = (!only || only.has(label)) && i % every === 0;
      await page.evaluate(({ mi, i, want }) => {
        const g = GAME, P = g.player, v = g.input.virtual, dt = 1 / 60;
        for (const key of ['moveX', 'moveY', 'sprint']) v[key] = 0;
        __moves[mi][2](i * dt, v, dt);
        g.player.hp = 100; g.player.st = Math.max(g.player.st, 60);
        g.tick(dt);
        // close three-quarter orbit, following the gameplay facing (not the visual spin), smoothed
        const c = __cam; c.yaw += Math.atan2(Math.sin(P.yaw - c.yaw), Math.cos(P.yaw - c.yaw)) * (1 - Math.exp(-2.5 * dt));
        const a = c.yaw - 0.75, R = 5.2, p = P.pos;
        g.camera.position.set(p.x + Math.sin(a) * R, 1.55, p.z + Math.cos(a) * R);
        g.camera.lookAt(p.x, 1.0, p.z); g.camera.fov = 40; g.camera.updateProjectionMatrix();
        if (want) g.render();
      }, { mi, i, want });
      if (want) {
        await page.screenshot({ path: path.join(out, 'frames', `m_${String(k).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 88 });
        labels.push(label); k++;
      }
    }
  }
  fs.writeFileSync(path.join(out, 'labels.json'), JSON.stringify({ fps: 60 / every, labels }));
  console.log(`${k} frames`); console.log(errs.length ? 'ERRORS:\n' + errs.slice(0, 10).join('\n') : 'no page errors');
  await browser.close();
})();
