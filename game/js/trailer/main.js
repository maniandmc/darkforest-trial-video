// SELVA OSCURA v4 — the trailer rendered from the game's own 3D models. Offline and deterministic: an automation
// script calls TR.frame(f) for every frame and grabs the canvas; each shot re-simulates the wanderer's animation from
// a short pre-roll, so any frame range renders identically in any worker.
import * as THREE from 'three';
import { makeMaterials, matTime } from '../materials.js';
import { Player } from '../player.js';
import { Boss } from '../boss.js';
import { Events } from '../events.js';
import { Forest } from './forest.js';
import { Pipeline } from './pipeline.js';
import { Puppet } from './puppet.js';
import { SHOTS, DURATION, CLEAR } from './shots.js';

const W = 1920, H = 1080, FPS = 30, SIM = 1 / 60, PREROLL = 1.5;

// a rim light for the cloth (cinematographer's backlight): grazing-angle glow, stronger on the side facing the moon
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
  // a candle flame instead of a ball
  const core = lanBody.children.find(o => o.isMesh && o.geometry.type === 'SphereGeometry');
  if (core) { core.scale.set(0.55, 1.15, 0.55); core.position.y = -0.01; }
}

async function init() {
  const loaded = new Promise(res => { THREE.DefaultLoadingManager.onLoad = res; });
  const canvas = document.getElementById('c');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1); renderer.setSize(W, H, false);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.NoToneMapping;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020306);
  const camera = new THREE.PerspectiveCamera(40, W / H, 0.05, 400);
  const mats = makeMaterials(renderer);
  const forest = new Forest(scene, { clearZones: CLEAR });
  const events = new Events();
  const player = new Player(scene, mats, 2);          // the close-up model: smoother cloak, hood and limbs
  const puppet = new Puppet(player);
  const R = player.rig;
  // cloth with sheen (the soft rim light of wool); every material that came from the model's cloth recipes
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
  // a zero-thickness cloak shadows itself in the lantern's cube map; a slightly smaller proxy inside casts for it
  R.cloak.castShadow = R.mantle.castShadow = false;
  const proxy = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.34, 1.25, 16), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
  proxy.position.y = 0.7; proxy.castShadow = true; proxy.renderOrder = -1; R.off.add(proxy);
  // the hood: folds and a softer crown instead of a smooth ball
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
  // the lantern goes from the belt to the left fist; its light now casts shadows (trunks, the wanderer's own body)
  R.armL.hand.add(R.lantern); R.lantern.position.set(0, 0, 0.05);
  R.lantern.traverse(o => { if (o.isMesh) o.castShadow = false; });
  const lan = R.lanLight;
  lan.castShadow = true; lan.decay = 2; lan.distance = 0;
  lan.shadow.mapSize.set(512, 512); lan.shadow.camera.near = 0.1; lan.shadow.camera.far = 14; lan.shadow.bias = -0.004; lan.shadow.normalBias = 0.05;
  const boss = new Boss(scene, mats, events);
  boss.root.visible = false;
  // eyes that read from thirty metres away in fog: larger slits, pushed out of the sockets
  for (const e of boss.model.eyes) { e.scale.multiplyScalar(1.7); e.scale.y *= 1.3; e.position.z += 0.07; }

  const moon = new THREE.DirectionalLight(0xa8bcff, 1);
  moon.castShadow = true; moon.shadow.mapSize.set(2048, 2048); moon.shadow.bias = -0.0004; moon.shadow.normalBias = 0.04;
  scene.add(moon, moon.target);
  const hemi = new THREE.HemisphereLight(0x1c2a44, 0x0a0806, 0.3); scene.add(hemi);
  const pipe = new Pipeline(renderer, W, H);
  const ctx = { time: 0, camYaw: 0, locked: false, boss: null, player, events, combat: null };

  await loaded;

  let cur = null, simT = 0;
  const shotAt = t => SHOTS.find(s => t >= s.t0 && t < s.t1) || SHOTS[SHOTS.length - 1];
  const stepTo = (shot, t) => {
    while (simT < t - 1e-6) {
      simT += SIM; ctx.time = simT; matTime.value = simT;
      puppet.step(SIM, shot.pup(simT), ctx);
    }
  };
  const tmp = new THREE.Vector3(), fwd = new THREE.Vector3();

  function frame(f, view) {
    const t = f / FPS, shot = shotAt(t);
    if (shot !== cur || t < simT - 1e-6 || t - simT > 0.6) {
      cur = shot; simT = Math.max(0, shot.t0) - PREROLL;
      puppet.place(shot.pup(simT - SIM));
    }
    stepTo(shot, t);

    // camera (or a look-dev view: TR.frame(f, { pos, look, fov }))
    const c = view?.pos ? { pos: new THREE.Vector3(...view.pos), look: new THREE.Vector3(...view.look), fov: view.fov || 35 } : shot.cam(t);
    camera.position.copy(c.pos); camera.up.set(0, 1, 0); camera.lookAt(c.look);
    if (c.roll) camera.rotateZ(c.roll);
    camera.fov = c.fov; camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);

    // the look of this moment
    const L = shot.look(t);
    camera.getWorldDirection(fwd);
    const center = tmp.copy(camera.position).addScaledVector(fwd, 18); center.y = 0;
    moon.color.setRGB(...L.moonC); moon.intensity = L.moonI;
    moon.position.copy(center).addScaledVector(L.moonDir, 120); moon.target.position.copy(center); moon.target.updateMatrixWorld();
    const sc = moon.shadow.camera; sc.left = sc.bottom = -36; sc.right = sc.top = 36; sc.near = 1; sc.far = 260; sc.updateProjectionMatrix();
    pipe.aimMoon(L.moonDir, center, 40);
    pipe.setFog(L.air); if (window.DBG) window.DBG(pipe, moon);
    lan.intensity = L.lanI;
    RIM.color.value.setRGB(...(L.rim || [0.05, 0.07, 0.11]));
    RIM.dir.value.copy(L.moonDir).transformDirection(camera.matrixWorldInverse);

    // the thing in the dark
    const ey = shot.eyes ? shot.eyes(t) : null;
    boss.root.visible = !!ey;
    if (ey) {
      const bz = ey.z ?? 63;
      boss.root.position.set(ey.x ?? 3.5, ey.y ?? -2.2, bz); boss.yaw = Math.PI - 0.12;
      Object.assign(boss.pose, { crouch: 1.3, lean: 0.55, headPitch: 0.05, headYaw: 0.05, jaw: 0, glow: 0 });
      boss.applyPose(0);
      const U = mats.bossSkin.userData.U;
      U.uLava.value = 0.04 + 0.12 * ey.on;
      mats.bossEye.emissiveIntensity = 0.2 + 40 * ey.on;
      boss.model.headLight.intensity = 2 * ey.on; boss.model.coreLight.intensity = 0;
    }

    const lp = R.lanLight.getWorldPosition(new THREE.Vector3());
    const prof = pipe.render(scene, camera, { profile: view?.profile, time: t, frame: f, lantern: { pos: lp, col: [1.0, 0.62, 0.3].map(v => v * L.lanI), k: L.lanHalo }, dof: L.dof, bloom: L.bloom, grade: L.grade });
    return { t, shot: shot.name, prof };
  }

  window.TR = { frame, duration: DURATION, fps: FPS, frames: Math.ceil(DURATION * FPS), scene, camera, player, boss, pipe, renderer };
}

window.TR_READY = init().then(() => true, e => { console.error(e); return String(e.stack || e); });
