// SELVA OSCURA v4 — the trailer rendered from the game's own 3D models. Offline and deterministic: an automation
// script calls TR.frame(f) for every frame and grabs the canvas. Each shot (or "take" shared by consecutive shots)
// re-simulates its action from a short pre-roll, so any frame range renders identically in any worker.
import * as THREE from 'three';
import { makeMaterials, matTime } from '../materials.js';
import { Player } from '../player.js';
import { Boss } from '../boss.js';
import { Arena } from '../arena.js';
import { Events } from '../events.js';
import { Forest } from './forest.js';
import { Gate } from './gate.js';
import { Descent } from './descent.js';
import { Stage } from './stage.js';
import { Pipeline } from './pipeline.js';
import { Puppet } from './puppet.js';
import { SHOTS, DURATION, CLEAR, cues } from './shots.js';

const W = 1920, H = 1080, FPS = 30, SIM = 1 / 60, PREROLL = 1.5;

// a rim light for the cloth (cinematographer's backlight): grazing-angle glow, stronger on the side facing the key
const RIM = { color: { value: new THREE.Color(0, 0, 0) }, dir: { value: new THREE.Vector3(0, 1, 0) } };
function addRim(m) {
  m.onBeforeCompile = sh => {
    sh.uniforms.uRimCol = RIM.color; sh.uniforms.uRimDir = RIM.dir;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uRimCol, uRimDir;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        { float f_ = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.0);
          totalEmissiveRadiance += uRimCol * f_ * (0.25 + 0.75 * clamp(dot(normal, uRimDir) * 0.5 + 0.5, 0.0, 1.0)); }`);
  };
}

// the game's lantern is a few boxes seen from afar; for close-ups: a pierced cap, glass panes, a wire bail
function dressLantern(R) {
  const lanBody = R.lanLight.parent;
  const iron = new THREE.MeshStandardMaterial({ color: 0x2c2826, roughness: 0.5, metalness: 0.85 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xffd9a0, roughness: 0.15, transmission: 0, transparent: true, opacity: 0.28,
    emissive: 0xff9a40, emissiveIntensity: 0.7, side: THREE.DoubleSide, depthWrite: false });
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.07, 16, 1, true), iron); cap.position.y = 0.13; lanBody.add(cap);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 8), iron); knob.position.y = 0.17; lanBody.add(knob);
  const bail = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.004, 6, 24, Math.PI), iron); bail.position.y = 0.12; lanBody.add(bail);
  const pane = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.15, 4, 1, true), glass); pane.rotation.y = Math.PI / 4; lanBody.add(pane);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.025, 16), iron); base.position.y = -0.095; lanBody.add(base);
  for (const o of [cap, knob, bail, pane, base]) { o.castShadow = false; o.receiveShadow = true; }
  const core = lanBody.children.find(o => o.isMesh && o.geometry.type === 'SphereGeometry');
  if (core) { core.scale.set(0.55, 1.15, 0.55); core.position.y = -0.01; }
}

// smooth 1D noise for camera shake (as v3)
function vnoise(x) { const i = Math.floor(x), f = x - i; const h = n => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }; const u = f * f * (3 - 2 * f); return (h(i) + (h(i + 1) - h(i)) * u) * 2 - 1; }

async function init() {
  const loaded = new Promise(res => { THREE.DefaultLoadingManager.onLoad = res; });
  const canvas = document.getElementById('c');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1); renderer.setSize(W, H, false);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.NoToneMapping;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020306);
  const camera = new THREE.PerspectiveCamera(40, W / H, 0.05, 600);
  const mats = makeMaterials(renderer);
  const setMats = makeMaterials(renderer);                  // the gate and the pit get their own rock (double-sided cliffs)
  setMats.wall.side = THREE.DoubleSide;
  const events = new Events();

  // ---------------------------------------------------------------- sets
  const forest = new Forest(scene, { clearZones: CLEAR });
  const gate = new Gate(scene, setMats); gate.group.visible = false;
  const descent = new Descent(scene, setMats);
  const before = new Set(scene.children);
  const arena = new Arena(scene, mats, { shadow: 2048 });
  const arenaLights = scene.children.filter(o => !before.has(o) && o.isLight);
  arena.moon.castShadow = false; arena.moon.visible = false;     // the trailer's own key light stands in for it
  const arenaFog = scene.fog; scene.fog = null;
  arena.group.visible = false; for (const l of arenaLights) l.visible = false;

  // ---------------------------------------------------------------- the wanderer (close-up build) and the colossus
  const player = new Player(scene, mats, 2);
  const puppet = new Puppet(player);
  const R = player.rig;
  const up = new Map();
  player.root.traverse(o => {
    if (!o.isMesh || !o.material || o.material.isMeshPhysicalMaterial || o.material === mats.playerDark) return;
    const m = o.material;
    if (m.roughness < 0.9 || m.metalness > 0) return;
    if (!up.has(m)) up.set(m, new THREE.MeshPhysicalMaterial({ color: m.color, roughness: m.roughness, normalMap: m.normalMap, normalScale: m.normalScale,
      side: m.side, shadowSide: THREE.BackSide, sheen: 1, sheenRoughness: 0.45, sheenColor: new THREE.Color(0.32, 0.3, 0.28) }));
    o.material = up.get(m);
  });
  for (const m of up.values()) addRim(m);
  R.cloak.castShadow = R.mantle.castShadow = false;
  const proxy = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.34, 1.25, 16), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
  proxy.position.y = 0.7; proxy.castShadow = true; proxy.renderOrder = -1; R.off.add(proxy);
  player.root.traverse(o => {
    if (!o.isMesh || o.geometry.type !== 'SphereGeometry' || Math.abs(o.geometry.parameters.radius - 0.205) > 1e-3) return;
    const g = o.geometry, pos = g.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const a = Math.atan2(v.x, v.z), y = v.y / 0.205;
      const fold = (0.035 * Math.sin(a * 7 + y * 2.5) * Math.max(0, 0.6 - y) + 0.02 * Math.sin(a * 13 - y * 4)) * (1 - 0.85 * Math.max(0, Math.cos(a)));
      v.multiplyScalar(1 + fold + (y > 0.5 && Math.cos(a) < 0 ? 0.05 * (y - 0.5) : 0));
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
  });
  dressLantern(R);
  // the hood's point hangs down the back (seen from behind, an upright point reads as a horn)
  player.root.traverse(o => { if (o.isMesh && o.geometry.type === 'ConeGeometry' && Math.abs(o.geometry.parameters.radius - 0.11) < 1e-3) { o.rotation.x = -2.2; o.position.y -= 0.09; o.position.z -= 0.03; } });
  R.armL.hand.add(R.lantern); R.lantern.position.set(0, 0, 0.05);
  R.lantern.traverse(o => { if (o.isMesh) o.castShadow = false; });
  const lan = R.lanLight;
  lan.castShadow = true; lan.decay = 2; lan.distance = 0;
  lan.shadow.mapSize.set(512, 512); lan.shadow.camera.near = 0.1; lan.shadow.camera.far = 14; lan.shadow.bias = -0.004; lan.shadow.normalBias = 0.05;

  const boss = new Boss(scene, mats, events);
  boss.root.visible = false;
  for (const e of boss.model.eyes) { e.scale.multiplyScalar(1.7); e.scale.y *= 1.3; e.position.z += 0.07; }
  const stage = new Stage(scene, mats, player, boss, events);
  stage.show(false);

  // ---------------------------------------------------------------- light and the pipeline
  const moon = new THREE.DirectionalLight(0xa8bcff, 1);
  moon.castShadow = true; moon.shadow.mapSize.set(2048, 2048); moon.shadow.bias = -0.0004; moon.shadow.normalBias = 0.04;
  scene.add(moon, moon.target);
  const hemi = new THREE.HemisphereLight(0x1c2a44, 0x0a0806, 0.3); scene.add(hemi);
  const pipe = new Pipeline(renderer, W, H);
  const ctx = { time: 0, camYaw: 0, locked: false, boss: null, player, events, combat: null };

  await loaded;
  await Promise.all(['600 118px Cinzel', '400 32px Cinzel', '700 150px Cinzel', '900 290px Cinzel', '500 86px Cinzel', 'italic 400 30px "Cormorant Garamond"']
    .map(f => document.fonts.load(f).catch(() => null)));
  await document.fonts.ready;
  gate.burn(0);

  const SETS = {
    forest: { on: [forest.group, hemi], bg: 0x020306 },
    gate: { on: [gate.group], bg: 0x040102 },
    descent: { on: [descent.group], bg: 0x000000 },
    arena: { on: [arena.group, ...arenaLights.filter(l => l !== arena.moon)], bg: 0x0a0403, fog: arenaFog, stage: true },
  };
  let curSet = null;
  const useSet = name => {
    if (name === curSet) return;
    curSet = name;
    for (const [k, s] of Object.entries(SETS)) for (const o of s.on) o.visible = k === name;
    scene.background = new THREE.Color(SETS[name].bg);
    scene.fog = SETS[name].fog || null;
    stage.show(!!SETS[name].stage);
  };

  // ---------------------------------------------------------------- the lantern can leave the hand (the fall)
  const lanHome = { parent: R.armL.hand, pos: R.lantern.position.clone() };
  const lanternTo = (where) => {
    if (where === 'hand' && R.lantern.parent !== lanHome.parent) { lanHome.parent.add(R.lantern); R.lantern.position.copy(lanHome.pos); R.lantern.quaternion.identity(); }
    if (where === 'world' && R.lantern.parent !== scene) scene.attach(R.lantern);
  };

  // ---------------------------------------------------------------- simulation: puppet shots and fight takes
  let cur = null, simT = 0;
  const shotAt = t => SHOTS.find(s => t >= s.t0 && t < s.t1) || SHOTS[SHOTS.length - 1];
  const keyOf = s => s.take || s;                          // consecutive shots on one take share its simulation
  const W0 = { stage, player, boss, gate, descent, forest, R };
  const begin = (shot, t0) => {
    useSet(shot.set || 'forest');
    cur = keyOf(shot); simT = t0;
    lanternTo('hand'); R.lantern.visible = shot.lantern !== false;
    if (shot.take) {
      puppet.mode = 'game';
      stage.reset(shot.take.reset || {});
      shot.take.init?.(stage, W0);
      boss.root.visible = true;
    } else {
      puppet.mode = 'puppet';
      puppet.place(shot.pup(t0 - SIM, W0));
      boss.root.visible = !!shot.boss;
    }
  };
  const step = (shot) => {
    simT += SIM; matTime.value = simT;
    if (shot.take) {
      const tk = shot.take, inp = tk.tick ? tk.tick(simT, stage, W0) || {} : {};
      if (tk.intro) { const k = tk.intro(simT); if (k !== null && k !== undefined) stage.intro(k, SIM); }
      stage.step(SIM, stage.input(inp.dir, inp.btn));
    } else {
      ctx.time = simT;
      const a = shot.pup(simT, W0);
      puppet.step(SIM, a, ctx);
      if (a.dropLantern && R.lantern.parent !== scene) lanternTo('world');
      if (shot.boss) {
        const b = shot.boss(simT);
        boss.root.position.set(b.x, b.y ?? 0, b.z); boss.yaw = b.yaw ?? Math.PI;
        boss.speed = b.speed || 0; boss.gaitMode = b.gait || 'walk';
        Object.assign(boss.pose, { crouch: 0, lean: 0.14, headPitch: 0.05, headYaw: 0, jaw: 0, glow: 0, ...b.pose });
        boss.applyPose(SIM);
      }
    }
    if (shot.lanternFall && R.lantern.parent === scene) shot.lanternFall(simT, R.lantern);
  };

  const tmp = new THREE.Vector3(), fwd = new THREE.Vector3();
  function frame(f, view) {
    const t = f / FPS, shot = shotAt(t);
    const pre = shot.take ? (shot.take.t0 ?? shot.t0) - (shot.take.preroll ?? PREROLL) : shot.t0 - (shot.preroll ?? PREROLL);
    if (keyOf(shot) !== cur || t < simT - 1e-6 || t - simT > 0.6) begin(shot, Math.min(pre, t - 0.2));
    while (simT < t - 1e-6) step(shot);

    // camera (or a look-dev view: TR.frame(f, { pos, look, fov }))
    const c = view?.pos ? { pos: new THREE.Vector3(...view.pos), look: new THREE.Vector3(...view.look), fov: view.fov || 35 } : shot.cam(t, W0);
    camera.position.copy(c.pos); camera.up.set(0, 1, 0); camera.lookAt(c.look);
    if (c.roll) camera.rotateZ(c.roll);
    const cu = cues(t, shot);
    const au = window.V4AUDIO ? window.V4AUDIO(t) : { low: 0 };
    const amp = view?.pos ? 0 : (shot.shake || 0) * (0.35 + 0.9 * au.low) + cu.kick * 1.4 + (shot.take ? stage.shakeAmp * 1.5 : 0);
    camera.rotateX(vnoise(t * 11) * amp * 0.004); camera.rotateY(vnoise(t * 11 + 37) * amp * 0.004); camera.rotateZ(vnoise(t * 6 + 91) * amp * 0.003);
    camera.fov = c.fov; camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
    stage.fx.setScale(H * 0.5 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));

    // the look of this moment
    const L = shot.look(t, W0);
    camera.getWorldDirection(fwd);
    const center = tmp.copy(camera.position).addScaledVector(fwd, L.keyAhead ?? 18); center.y = L.keyY ?? 0;
    moon.color.setRGB(...L.moonC); moon.intensity = L.moonI;
    moon.position.copy(center).addScaledVector(L.moonDir, 120); moon.target.position.copy(center); moon.target.updateMatrixWorld();
    const sc = moon.shadow.camera, half = L.keyHalf ?? 36; sc.left = sc.bottom = -half; sc.right = sc.top = half; sc.near = 1; sc.far = 300; sc.updateProjectionMatrix();
    pipe.aimMoon(L.moonDir, center, L.fogHalf ?? 40);
    pipe.setFog(L.air);
    lan.intensity = R.lantern.visible ? (L.lanI ?? 0) : 0;
    RIM.color.value.setRGB(...(L.rim || [0.05, 0.07, 0.11]));
    RIM.dir.value.copy(L.moonDir).transformDirection(camera.matrixWorldInverse);
    if (L.blade !== undefined) mats.blade.emissiveIntensity = L.blade;
    shot.dress?.(t, W0, L);                                     // per-shot set dressing: eyes, inscription, glow…
    if (window.TWEAK) window.TWEAK(window.TR, L);
    if (curSet === 'gate') gate.update(t, L.gate || {});
    if (curSet === 'descent') descent.update(t, L.pit || {});
    if (curSet === 'arena') arena.update(SIM, t);

    // typography and overlay state
    const txt = window.V4TEXT ? window.V4TEXT(t, pipe.txt.ctx, pipe.gfx.ctx) : {};
    const comp = { ember: [0, 0.6, 1, 0], emberC: [1, 1, 1, 0], ash: [0, 0.3, 1, 0.1], dust: [0, 0.2, 1, 1], zoomBlur: [0.5, 0.5, 0, 0], exposure: 1, ...(L.comp || {}), ...txt };
    let fl = cu.flash;
    if (shot.take && stage.hudFlash) { const h = stage.hudFlash, k = h.a * Math.exp(-h.t / 0.12); if (k > 0.01) fl = [...h.rgb.map((v, i) => (fl[i] * fl[3] + v * k) / (fl[3] + k)), fl[3] + k]; }
    comp.flash = fl;
    const grade = { ...(L.grade || {}), bars: cu.bars };
    const lp = R.lanLight.getWorldPosition(new THREE.Vector3());
    const prof = pipe.render(scene, camera, { profile: view?.profile, time: t, frame: f, comp,
      lantern: R.lantern.visible && L.lanHalo ? { pos: lp, col: [1.0, 0.62, 0.3].map(v => v * L.lanI), k: L.lanHalo } : null, dof: L.dof, bloom: L.bloom, grade });
    return { t, shot: shot.name, prof };
  }

  window.TR = { frame, shots: SHOTS.map(s => ({ name: s.name, t0: s.t0, t1: s.t1 })), duration: DURATION, fps: FPS, frames: Math.ceil(DURATION * FPS), scene, camera, player, boss, stage, gate, descent, pipe, renderer, mats };
}

window.TR_READY = init().then(() => true, e => { console.error(e); return String(e.stack || e); });
