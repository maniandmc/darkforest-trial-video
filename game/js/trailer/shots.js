// The v4 storyboard: the same 135 BPM grid and words as v1–v3 (music edit: first true downbeat at 0.522 s). A shot is
// a function of the trailer clock t: the wanderer's path + directives (pup) or a fight take (take), the camera (cam),
// and the look of the frame (key light, air, grade, bloom, overlay particles). Fight takes script the game's real
// controllers on the beat ("the fist lands on bar 13"), and consecutive shots on one take share its simulation.
import * as THREE from 'three';
import { pathX, groundH } from './forest.js';
import { GATE, apexY } from './gate.js';
import { RING_Y } from './descent.js';

export const BPM = 135, BEAT = 60 / BPM, BAR = BEAT * 4, D0 = 0.30 + BEAT / 2;
export const B = (n, b = 0) => D0 + n * BAR + b * BEAT;
export const FINAL = B(16);
const q = t => Math.floor(t * 30 + 0.34) / 30;             // snap musical events to the frame (as v3)

const clamp01 = x => Math.max(0, Math.min(1, x));
const lerp = (a, b, x) => a + (b - a) * x;
const ramp = (t, a, b) => clamp01((t - a) / (b - a));
const E = { outC: x => 1 - Math.pow(1 - x, 3), inC: x => x * x * x, ioC: x => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2,
  ioS: x => x * x * (3 - 2 * x), outQ: x => 1 - (1 - x) * (1 - x), inQ: x => x * x, outE: x => x >= 1 ? 1 : 1 - Math.pow(2, -10 * x), inE: x => x <= 0 ? 0 : Math.pow(2, 10 * x - 10) };
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const pulse = (t, at, d) => t < at ? 0 : Math.exp(-(t - at) / d);
const pulses = (t, ats, d) => ats.reduce((m, a) => Math.max(m, pulse(t, a, d)), 0);
const onPath = (z, off = 0, dir = 1) => ({ x: pathX(z) + off, z, yaw: Math.atan2((pathX(z + 0.5) - pathX(z - 0.5)) * dir, dir) });
const fovFromMM = mm => 2 * Math.atan(12 / mm) * 180 / Math.PI;
const moonFrom = (az, el) => V(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
const wp = o => o.getWorldPosition(new THREE.Vector3());

// ------------------------------------------------------------------------------------------------ looks
const COLD_AIR = { density: 0.05, height: 5.5, ground: 1.6, groundH: 0.7, g: 0.66, noiseK: 1, moonCol: [1.2, 1.5, 2.2], ambCol: [0.0038, 0.0058, 0.011], maxD: 85 };
const COLD_GRADE = { exposure: 1.15, sat: 0.75, vig: 0.55, grain: 0.035, ca: 0.004, contrast: 0.12, lift: [0.25, 0.4, 0.7], gain: [0.98, 1.0, 1.04],
  shadowTint: [0.8, 0.95, 1.2], hiTint: [1.08, 1.0, 0.92] };
const HELL_GRADE = { exposure: 1.1, sat: 0.95, vig: 0.6, grain: 0.04, ca: 0.0045, contrast: 0.16, lift: [0.7, 0.3, 0.18], gain: [1.05, 0.96, 0.88],
  shadowTint: [1.12, 0.92, 0.82], hiTint: [1.05, 0.96, 0.86] };
const COLD_PART = { ash: [0.3, 0.35, 1, 0.15], dust: [0.4, 0.3, 1, 0.9] };
const hellPart = (k = 1) => ({ ember: [0.16 * k, 0.8, 0.75, 0], emberC: [1, 1, 1, 0.12 * k], ash: [0.12, 0.3, 0.8, 0.3] });
const forestLook = (o = {}) => ({ moonDir: moonFrom(-Math.PI * 0.1, 0.62), moonI: 0.8, moonC: [0.62, 0.72, 1.0], air: COLD_AIR, lanI: 7, lanHalo: 0.06,
  grade: COLD_GRADE, bloom: [0.6, 0.6, 0.85], comp: COLD_PART, ...o });
// the arena: its cold key from high behind the colossus, lava light from below, warm haze
const ARENA_KEY = V(-22, 42, -16).normalize();
const ARENA_AIR = { density: 0.014, height: 9, ground: 1.2, groundH: 1.0, g: 0.55, noiseK: 1, moonCol: [0.35, 0.36, 0.5], ambCol: [0.016, 0.005, 0.002], maxD: 140 };
const arenaLook = (o = {}) => ({ moonDir: ARENA_KEY, moonI: 1.4, moonC: [0.66, 0.71, 1.0], air: ARENA_AIR, keyHalf: 42, keyAhead: 12, fogHalf: 50,
  grade: HELL_GRADE, bloom: [0.75, 0.6, 0.8], comp: hellPart(1), rim: [0.14, 0.07, 0.04], blade: undefined, lava: 0.75, ...o });

// ------------------------------------------------------------------------------------------------ the forest
const EYES = { x: 3.4, y: -0.6, z: 64 };
const lurk = (o = {}) => ({ x: EYES.x, y: EYES.y, z: EYES.z, yaw: Math.PI - 0.12, pose: { crouch: 1.3, lean: 0.55, headPitch: 0.05, headYaw: 0.05, ...o } });
// eyes / seams / breath light on the colossus in the dark
function glowBoss(W, eyes, lava = 0.04, head = 2, eyeMax = 40) {
  const U = W.boss.model;
  W.stage.mats.bossSkin.userData.U.uLava.value = lava;
  W.stage.mats.bossEye.emissiveIntensity = 0.2 + eyeMax * eyes;
  U.headLight.intensity = head * eyes; U.coreLight.intensity = lava > 0.3 ? 40 * lava : 0;
}

const SH = [];
// 1 — establishing. Low beside the path; the wanderer comes toward us out of the mist under shafts of moonlight.
SH.push({
  name: 'path', t0: 0, t1: B(2), shake: 0.12,
  pup(t) { const z = 26 + 1.2 * t; return { ...onPath(z, -0.15), lookY: 0.15 * Math.sin(t * 0.7), lookP: 0.05 }; },
  cam(t) {
    const k = E.ioS(ramp(t, 0, B(2)));
    const zc = 38.5 + 0.9 * t, x = pathX(zc) + lerp(1.1, 0.7, k);
    const w = this.pup(t);
    return { pos: V(x, groundH(x, zc) + lerp(0.45, 0.75, k), zc), look: V(w.x, 1.2 + groundH(w.x, w.z), w.z), fov: fovFromMM(lerp(40, 46, k)) };
  },
  look(t) { return forestLook({ moonDir: moonFrom(Math.PI * 1.06, 0.66), moonI: 0.9, air: COLD_AIR, lanI: 7, bloom: [0.55, 0.55, 0.85],
    comp: { ...COLD_PART, exposure: E.outC(ramp(t, B(0) - 0.05, B(0) + 0.9)) } }); },
});
// 2 — the lantern nearest the lens, tracking the walk in profile
SH.push({
  name: 'profile', t0: B(2), t1: B(3), shake: 0.12,
  pup(t) { const z = 32 + 1.2 * (t - B(2)); return { ...onPath(z, 0), lookY: -0.12, lookP: 0.02 }; },
  cam(t) {
    const w = this.pup(t), lt = t - B(2);
    const side = V(Math.cos(w.yaw), 0, -Math.sin(w.yaw));
    const pos = V(w.x, 0, w.z).addScaledVector(side, 3.4).add(V(0, groundH(w.x, w.z) + 1.0, 0.45 - 0.15 * lt));
    return { pos, look: V(w.x, groundH(w.x, w.z) + 1.0, w.z + 0.35), fov: fovFromMM(35) };
  },
  look() { return forestLook({ moonDir: moonFrom(-Math.PI * 0.6, 0.65), moonI: 0.7, air: { ...COLD_AIR, density: 0.042 }, lanI: 3.2, lanHalo: 0.012, bloom: [0.5, 0.55, 0.92], dof: { focus: 3.4, aperture: 22, max: 12 } }); },
});
// 3 — over the shoulder: it stops, lifts the lantern into the dark… and between the trees two embers open
SH.push({
  name: 'raise', t0: B(3), t1: B(4), shake: 0.08,
  pup(t) {
    const lt = t - B(3), stop = E.outQ(ramp(lt, 0, 0.7));
    const z = 34.2 + 1.2 * Math.min(lt, 0.7) * (1 - 0.5 * stop);
    return { ...onPath(z, 0), raise: E.ioC(ramp(lt, 0.15, 0.95)), lookY: lerp(0, -0.18, ramp(lt, 0.9, 1.6)), lookP: -0.06 };
  },
  cam(t) {
    const lt = t - B(3), w = this.pup(t), k = E.ioS(ramp(lt, 0, 2.2));
    const back = V(-Math.sin(w.yaw), 0, -Math.cos(w.yaw)), left = V(Math.cos(w.yaw), 0, -Math.sin(w.yaw));
    const pos = V(w.x, groundH(w.x, w.z) + lerp(1.95, 2.1, k), w.z).addScaledVector(back, lerp(5.0, 4.5, k)).addScaledVector(left, 1.25);
    return { pos, look: V(lerp(w.x + 0.6, EYES.x - 0.4, 0.35), lerp(1.2, 1.6, k), lerp(w.z + 12, EYES.z, 0.3)), fov: fovFromMM(lerp(36, 40, k)) };
  },
  boss: () => lurk(),
  dress(t, W) { glowBoss(W, E.outC(ramp(t, B(3, 1.5), B(3, 1.5) + 0.15)) * (1 - 0.9 * pulse(t, B(3, 3), 0.06) * (t < B(3, 3) + 0.1 ? 1 : 0))); },
  look(t) { return forestLook({ rim: [0.1, 0.13, 0.2], air: { ...COLD_AIR, density: 0.06 }, lanI: lerp(7, 10, ramp(t, B(3), B(3) + 1)), bloom: [0.65, 0.6, 0.85],
    dof: { focus: lerp(1.8, 22, E.ioC(ramp(t, B(3, 1.5) - 0.1, B(3, 1.5) + 0.5))), aperture: 23, max: 12 } }); },
});
// 4 — the face in the dark: the eyes flare, magma wakes in the seams of its hide, the jaw parts
SH.push({
  name: 'face', t0: B(4), t1: B(5), shake: 0.25, lantern: true,
  pup() { return { ...onPath(34.9, 0), raise: 1, lookP: -0.06 }; },
  boss(t) { const lt = t - B(4); return lurk({ headPitch: 0.1 - 0.12 * E.outC(ramp(lt, 1.1, 1.5)), jaw: 0.45 * E.outC(ramp(t, B(4, 2.5), B(4, 2.5) + 0.3)), headYaw: 0.05 + 0.03 * Math.sin(lt * 2) }); },
  cam(t, W) {
    const lt = t - B(4), h = wp(W.boss.head);
    const k = E.ioS(ramp(lt, 0, 1.78)) + 0.25 * E.outE(ramp(t, B(4, 2.5), B(4, 2.5) + 0.25));
    return { pos: V(h.x - 1.2, h.y - 0.9, h.z - lerp(8.5, 6.2, k)), look: V(h.x - 0.1, h.y - 0.25, h.z), fov: fovFromMM(lerp(50, 58, k)) };
  },
  dress(t, W) { glowBoss(W, 1 + 0.6 * pulse(t, B(4), 0.3), 0.04 + 0.9 * E.outC(ramp(t, B(4, 1.5), B(4, 1.5) + 0.5)), 3, 6); },
  look(t) { return forestLook({ moonDir: moonFrom(-Math.PI * 0.92, 0.7), moonI: 0.6, rim: [0.08, 0.1, 0.16], air: { ...COLD_AIR, density: 0.035 }, lanI: 0, lanHalo: 0,
    grade: { ...COLD_GRADE, sat: 0.9, hiTint: [1.15, 0.95, 0.8] }, bloom: [0.6, 0.5, 0.9], comp: { ember: [0.06, 0.4, 0.6, 0] } }); },
});
// 5 — RUN: toward us down the path, a look back at what follows, then the dive into the dark
const RUN_Z0 = 34.5, RUN_V = 7.0;
SH.push({
  name: 'run', t0: B(5), t1: B(6), shake: 0.55, preroll: 1.2,
  pup(t) {
    const lt = t - B(5), z = RUN_Z0 - RUN_V * Math.max(0, lt) - (lt < 0 ? 2.5 * lt : 0);
    const back = E.ioC(ramp(t, B(5, 2) - 0.07, B(5, 2) + 0.09)) * (1 - E.ioC(ramp(t, B(5, 2) + 0.3, B(5, 3) + 0.02)));
    const a = { ...onPath(z, 0.2, -1), game: true, sprint: lt > -0.3, lookY: 1.1 * back, lookP: -0.1 * back };
    if (t >= B(5, 3) + 0.04) { a.state = 'roll'; a.stateT = t - B(5, 3) - 0.04; }
    return a;
  },
  cam(t) {
    const lt = t - B(5), w = this.pup(t), zc = RUN_Z0 - 4.6 - (RUN_V - 0.9) * lt;
    const x = pathX(zc) - 0.35;
    return { pos: V(x, groundH(x, zc) + 0.75 + 0.05 * Math.sin(lt * 17), zc), look: V(w.x, groundH(w.x, w.z) + 1.25, w.z + 2), fov: fovFromMM(28), roll: 0.03 * Math.sin(lt * 9) };
  },
  boss(t) { const lt = t - B(5); return { x: 2.2, y: -0.2, z: 60 - 6.5 * Math.max(0, lt + 1), yaw: Math.PI - 0.05, speed: 3.2, gait: 'run', pose: { lean: 0.35, crouch: 0.35, headPitch: 0.15 } }; },
  dress(t, W) { glowBoss(W, 1, 0.3, 2, 12); },
  look(t) { return forestLook({ moonDir: moonFrom(Math.PI * 1.06, 0.66), moonI: 0.9, lanI: 7, lanHalo: 0.06, bloom: [0.6, 0.6, 0.85],
    comp: { ...COLD_PART, exposure: 1 - E.inQ(ramp(t, B(6) - 0.16, B(6) - 0.03)) } }); },
});

// ------------------------------------------------------------------------------------------------ the gate
const GATE_AIR = { density: 0.026, height: 9, ground: 1.6, groundH: 1.2, g: 0.72, noiseK: 1, moonCol: [3.4, 1.5, 0.5], ambCol: [0.0045, 0.002, 0.0016], maxD: 120 };
const BEAM = V(0.04, 0.32, 1).normalize();            // the key light sits behind the cliff: it reaches us through the door
const gateLook = (o = {}) => ({ moonDir: BEAM, moonI: 4.5, moonC: [1.0, 0.5, 0.22], air: GATE_AIR, keyAhead: 0, keyY: 6, keyHalf: 30, fogHalf: 34,
  lanI: 7, lanHalo: 0.05, rim: [0.16, 0.07, 0.03], grade: { ...HELL_GRADE, exposure: 1.15 }, bloom: [0.7, 0.6, 0.85], comp: hellPart(0.8), gate: { portal: 1, fire: 1, inscI: 3 }, ...o });
// 6 — "WAS LOST": the gate wakes in the dark; crane up and back from the wanderer at its foot to the guardians
SH.push({
  name: 'gate', t0: B(6), t1: B(7), set: 'gate', shake: 0.15,
  pup(t) { const z = -16 + 1.25 * (t - B(6)); return { x: -0.3, z, y: 0, yaw: 0, raise: 0 }; },
  cam(t) {
    const k = E.ioC(ramp(t - B(6), 0.0, 1.78));
    return { pos: V(lerp(-2.4, 0, k), lerp(1.4, 9, k), lerp(-21, -50, k)), look: V(0, lerp(3.5, 11, k), 0), fov: fovFromMM(lerp(30, 34, k)) };
  },
  dress(t, W) { W.gate.burn(0); },
  look(t) {
    const lt = t - B(6), on = E.outC(ramp(lt, 0.15, 0.8));
    return gateLook({ moonI: 4.5 * on, gate: { portal: 0.08 + 0.92 * on, fire: 0.1 + 0.9 * on, inscI: 3 }, air: { ...GATE_AIR, moonCol: GATE_AIR.moonCol.map(v => v * on) },
      comp: { ...hellPart(0.8), exposure: lerp(0.35, 1, E.inQ(ramp(lt, 0.1, 0.7))) } });
  },
});
// 7 — the inscription burns into the stone above the raised lantern
SH.push({
  name: 'inscription', t0: B(7), t1: B(7, 2), set: 'gate', shake: 0.15,
  pup(t) { return { x: -0.5, z: -9.6, y: 0, yaw: 0.05, raise: E.ioC(ramp(t - B(7), -0.4, 0.35)), lookP: -0.45 }; },
  cam(t) { const lt = t - B(7); return { pos: V(1.3 - 0.5 * lt, 1.25, -14.6 + 0.5 * lt), look: V(-0.3, 14.2, 0), fov: fovFromMM(26) }; },
  dress(t, W) { W.gate.burn(E.outQ(ramp(t - B(7), 0, 0.85))); },
  look() { return gateLook({ gate: { portal: 1, fire: 1, inscI: 4 } }); },
});
// 8 — up the steps into the glare
SH.push({
  name: 'steps', t0: B(7, 2), t1: B(8), set: 'gate', shake: 0.35,
  pup(t, W) { const lt = t - B(7, 2), z = -6.4 + 5.6 * lt; return { x: 0, z, y: W ? W.gate.stepY(z) : 0, yaw: 0, game: true, sprint: true }; },
  cam(t, W) {
    const lt = t - B(7, 2), k = E.inQ(ramp(lt, 0, 0.89)), w = this.pup(t, W);
    return { pos: V(0.6, lerp(2.3, 3.0, k) + 0.04 * Math.abs(Math.sin(lt * 12)), w.z - lerp(4.0, 2.2, k)), look: V(0, 4.6, w.z + 12), fov: fovFromMM(lerp(32, 26, k)) };
  },
  dress(t, W) { W.gate.burn(1); },
  look(t) {
    const lt = t - B(7, 2), k = E.inC(ramp(lt, 0, 0.89));
    return gateLook({ gate: { portal: 0.7 + 0.8 * k, fire: 0.55 + 1.2 * k, inscI: 4 }, moonI: 3 + 4 * k, air: { ...GATE_AIR, moonCol: [2.2, 1.0, 0.33] }, grade: { ...HELL_GRADE, exposure: 0.95 },
      comp: { ...hellPart(1), zoomBlur: [0.5, 0.55, 0.3 * E.inQ(ramp(lt, 0.3, 0.89)), 0], exposure: 1 - E.inQ(ramp(t, B(8) - 0.2, B(8) - 0.1)) } });
  },
});

// ------------------------------------------------------------------------------------------------ the descent
const FALL_V = 45, fallY = t => 4.5 - FALL_V * (t - B(8));
SH.push({
  name: 'fall', t0: B(8), t1: B(10, 1), set: 'descent', shake: 0.45, preroll: 0.4,
  pup(t) {
    const lt = t - B(8);
    return { x: 0.6 * Math.sin(lt * 0.9), z: 0.4 * Math.cos(lt * 0.7), y: fallY(t), yaw: lt * 0.5, fall: 1, spin: lt * 4.2, spinY: lt * 0.8, dropLantern: lt > 0.35 };
  },
  // the lantern slips from the hand and tumbles away below
  lanternFall(t, lan) {
    const u = Math.max(0, t - B(8) - 0.35), w = this.pup(t);  // (relative to the falling wanderer)
    lan.position.set(w.x + 0.9 + 1.6 * u, w.y - 0.2 - 6 * u * u - 2 * u, w.z + 0.5 + 0.9 * u);
    lan.rotation.set(u * 7, u * 2, u * 5);
  },
  cam(t) {
    const lt = t - B(8), w = this.pup(t);
    return { pos: V(w.x - 3.2, w.y + 5.5, w.z - 3.6), look: V(w.x + 2.6, w.y - 30, w.z + 3.4), fov: fovFromMM(18), roll: lt * 0.55 };
  },
  look(t) {
    const ice = E.outC(ramp(t, B(10), B(10) + 0.12));
    return { moonDir: V(0.1, -1, 0.06).normalize(), moonI: 0.0, moonC: [1, 0.5, 0.2], keyAhead: 0, keyY: fallY(t) - 40, keyHalf: 45, fogHalf: 45,
      air: { density: 0.012, height: 400, ground: 0, groundH: 1, g: 0.6, noiseK: 1, moonCol: [2.4, 0.9, 0.3], ambCol: [0.006, 0.002, 0.001], maxD: 140 },
      lanI: 9, lanHalo: 0.03, rim: [0.18, 0.08, 0.03], pit: { glow: 1, ice: 1 }, bloom: [0.8, 0.6, 0.8],
      grade: ice > 0 ? { ...HELL_GRADE, lift: [lerp(0.7, 0.4, ice), lerp(0.3, 0.6, ice), lerp(0.18, 1.0, ice)], shadowTint: [lerp(1.12, 0.8, ice), 0.95, lerp(0.82, 1.25, ice)] } : HELL_GRADE,
      comp: { ember: [0.12, 1.2, 0.45, 1], emberC: [1, 1, 1, 0] } };
  },
});

// ------------------------------------------------------------------------------------------------ the arena: takes
const START = { boss: V(0, 0, 8), yaw: Math.PI };
function place(S, p, pyaw = 0, b = START.boss, byaw = START.yaw) {
  S.player.pos.copy(p); S.player.yaw = pyaw; S.player.root.position.copy(p);
  S.boss.root.position.copy(b); S.boss.yaw = byaw; S.boss.root.rotation.y = byaw; S.boss.applyPose(0);
}
// rise → ignite → roar (B10.1 → B13)
const RISE = {
  t0: B(10, 1), preroll: 0.7, reset: { phase: 0, seed: 3 },
  init(S) {
    place(S, V(1.4, 0, -5.2), -0.1);
    S.player.setState('down'); S.player.t = 0.05; S.player.hitAway.set(0, 0, -1); S.player.vel.set(0, 0, 0);
    S.boss.state = 'intro'; S.boss.introT = 0; S.boss.root.position.y = -11.5;
    S.fx.decal(2, S.boss.pos, 5.5, { size: 6.2, life: 4.0, fadeOut: 1.5, y: 0.06 });
  },
  intro(T) { return T < B(11) + 0.7 ? clamp01((T - (B(10, 1) - 0.1)) / 2.06) : null; },
  tick(T, S) {
    if (S.at('idle', T, B(11) + 0.7)) { S.boss.state = 'idle'; S.boss.introT = 1; S.boss.root.position.y = 0; }
    if (S.at('vuln', T, B(12) - 0.6)) S.player.iUntil = 0;           // the roar may push him back
    if (S.at('roar', T, B(12) - 0.68)) S.boss.startAttack('roar', S.ctx);
    return {};
  },
};
// slam → dodge → leaping counter → the face → sweep → roll under (B13 → B14)
const B13 = {
  t0: B(13), preroll: 1.7, reset: { phase: 0, seed: 5 },
  init(S) { place(S, V(0.4, 0, 2.7), 0); },
  tick(T, S) {
    if (S.at('slam', T, B(13) - 1.183)) S.boss.startAttack('slam', S.ctx);
    if (S.at('roll', T, B(13) - 0.32)) return { dir: V(-1, 0, -0.25), btn: { roll: true } };
    if (S.at('heavy', T, B(13) + 0.1)) return { btn: { heavy: true } };
    if (S.at('sweep', T, B(13, 3) - 0.86)) S.boss.startAttack('sweep', S.ctx);
    if (S.at('roll2', T, B(13, 3) - 0.12)) return { dir: V(0.6, 0, 1), btn: { roll: true } };
    return {};
  },
};
// one take per beat-cut of the build (each sets up its own moment)
const cut = (o) => ({ preroll: 2.4, reset: { phase: 1, seed: 11 }, ...o, init(S) { place(S, o.p || V(0, 0, 0), o.pyaw ?? 0, o.b || START.boss, o.byaw ?? START.yaw); o.setup?.(S); } });
const BT = i => B(14, i * 0.5);
const BUILD = [
  // lava erupts all around the wanderer
  cut({ t0: BT(0), preroll: 2.8, p: V(0, 0, -3), tick(T, S) { if (S.at('lava', T, BT(0) + 0.08 - 1.183 - 1.25)) S.boss.startAttack('lava', S.ctx); } }),
  // the spinning third slash of the light chain
  cut({ t0: BT(1), p: V(0, 0, 2.6), tick(T, S) { for (const [k, d] of [['l1', -0.62], ['l2', -0.36], ['l3', -0.12]]) if (S.at(k, T, BT(1) + d)) return { btn: { light: true } }; } }),
  // a hook of the combo sweeps past
  cut({ t0: BT(2), p: V(-0.6, 0, 3.4), tick(T, S) { if (S.at('combo', T, BT(2) + 0.06 - 0.633)) S.boss.startAttack('combo', S.ctx); } }),
  // sprinting in toward us
  cut({ t0: BT(3), p: V(-2, 0, -9), pyaw: 0.2, tick(T, S) { S.locked = false; return { dir: V(0.15, 0, 1), btn: { sprint: true } }; } }),
  // the nova gathering fire into the colossus' chest
  cut({ t0: BT(4), p: V(1, 0, -4), reset: { phase: 2, seed: 13 }, tick(T, S) { if (S.at('nova', T, BT(4) - 0.95)) S.boss.startAttack('nova', S.ctx); } }),
  // poise broken: down on one knee
  cut({ t0: BT(5), p: V(-1.6, 0, 2.2), pyaw: 0.4, setup(S) { }, tick(T, S) { if (S.at('stag', T, BT(5) - 0.9)) { S.boss.state = 'stagger'; S.boss.t = 0; S.events.emit('boss-stagger'); } } }),
  // a heavy blow lands on its knee
  cut({ t0: BT(6), p: V(-1.2, 0, 3.3), pyaw: 0.15, tick(T, S) { if (S.at('heavy', T, BT(6) + 0.1 - 0.65)) return { btn: { heavy: true } }; } }),
  // its eyes
  cut({ t0: BT(7), p: V(0, 0, -2), reset: { phase: 2, seed: 17 } }),
];
// ABANDON (nova blast) · ALL (the leap) · HOPE (into its face)
const NOVA = cut({ t0: B(15), p: V(0.8, 0, -3.2), reset: { phase: 2, seed: 19 }, tick(T, S) {
  if (S.at('nova', T, B(15) - 1.617)) S.boss.startAttack('nova', S.ctx);
  if (S.at('roll', T, B(15) + 0.12)) return { dir: V(0, 0, 1), btn: { roll: true } };
} });
const LEAP = cut({ t0: B(15, 1), p: V(-0.6, 0, 1.6), reset: { phase: 2, seed: 23 }, tick(T, S) { if (S.at('heavy', T, B(15, 1) - 0.24)) return { btn: { heavy: true } }; } });
const STARE = cut({ t0: B(15, 2), p: V(0, 0, -2), reset: { phase: 2, seed: 29 } });
const TITLE = cut({ t0: FINAL, p: V(0, 0, -14), reset: { phase: 1, seed: 31 } });

const head = W => wp(W.boss.head), chest = W => W.boss.parts.body.wb.clone(), pl = W => W.player.pos.clone();
const bossLava = (W, k) => { W.stage.mats.bossSkin.userData.U.uLava.value = k; W.boss.model.coreLight.intensity = 70 * k; };

// 10.1 — the colossus rises from its pit beyond the wanderer, who gets up off the stone
SH.push({ name: 'rise', t0: B(10, 1), t1: B(11), set: 'arena', take: RISE, shake: 0.35, lantern: false,
  cam(t, W) { const lt = t - B(10, 1); return { pos: V(2.9, 0.45 + 0.25 * lt, -10.5 + 0.6 * lt), look: V(0.4, lerp(3.5, 7.5, E.outC(ramp(lt, 0, 1.33))), 8), fov: fovFromMM(30) }; },
  look() { return arenaLook({ dof: { focus: 18, aperture: 6, max: 8 } }); } });
// 11 — NINE CIRCLES: the blade kindles in his hand; the colossus towers behind
SH.push({ name: 'ignite', t0: B(11), t1: B(12), set: 'arena', take: RISE, shake: 0.3, lantern: false,
  cam(t, W) { const lt = t - B(11), p = pl(W); return { pos: V(p.x - 1.45, 0.75, p.z - 2.3 + 0.12 * lt), look: V(p.x + 1.6, 3.2 + 0.2 * lt, p.z + 9), fov: fovFromMM(32) }; },
  look(t) { return arenaLook({ blade: lerp(0.15, 3.2, E.outQ(ramp(t - B(11), 0.0, 0.45))), dof: { focus: 2.6, aperture: 20, max: 11 } }); } });
// 12 — ONE SOUL: the roar throws him back; the whole colossus in frame
SH.push({ name: 'roar', t0: B(12), t1: B(13), set: 'arena', take: RISE, shake: 0.6, lantern: false,
  cam(t) { const lt = t - B(12); return { pos: V(lerp(4.6, 4.0, lt / 1.78), 0.9, lerp(-15.5, -14.5, lt / 1.78)), look: V(0, 6.2, 8), fov: fovFromMM(22) }; },
  look() { return arenaLook({ blade: 1.2, comp: hellPart(1.3) }); } });
// 13 — slam on the beat, he dives clear
SH.push({ name: 'slam', t0: B(13), t1: B(13, 1), set: 'arena', take: B13, shake: 0.9, lantern: false,
  cam() { return { pos: V(-6.5, 0.6, -0.8), look: V(0.5, 2.0, 4.5), fov: fovFromMM(24) }; }, look() { return arenaLook({ blade: 0.6 }); } });
// 13.1 — the leaping counter
SH.push({ name: 'counter', t0: B(13, 1), t1: B(13, 2), set: 'arena', take: B13, shake: 0.7, lantern: false,
  cam(t, W) { const p = pl(W); return { pos: V(p.x - 2.6, 0.5, p.z - 2.4), look: V(p.x + 0.8, 1.6, p.z + 2.5), fov: fovFromMM(24) }; }, look() { return arenaLook(); } });
// 13.2 — its face
SH.push({ name: 'glare', t0: B(13, 2), t1: B(13, 3), set: 'arena', take: B13, shake: 0.6, lantern: false,
  cam(t, W) { const h = head(W), lt = t - B(13, 2); return { pos: V(h.x - 0.8, h.y - 1.2, h.z - 6.2 + lt * 2), look: h, fov: fovFromMM(45) }; },
  look() { return arenaLook({ lava: 1.1 }); } });
// 13.3 — the sweep passes over as he rolls under it
SH.push({ name: 'sweep', t0: B(13, 3), t1: B(14), set: 'arena', take: B13, shake: 0.8, lantern: false,
  cam(t, W) { const p = pl(W); return { pos: V(p.x + 3.4, 0.35, p.z - 3.8), look: V(p.x - 0.5, 1.8, p.z + 3), fov: fovFromMM(20) }; }, look() { return arenaLook(); } });
// 14 — the eighth-note build
const BUILD_CAMS = [
  W => { const p = pl(W); return { pos: V(p.x + 6, 9.5, p.z - 9), look: V(p.x, 0, p.z + 1), fov: fovFromMM(24) }; },
  W => { const p = pl(W); return { pos: V(p.x + 1.9, 1.1, p.z - 1.9), look: V(p.x, 1.1, p.z), fov: fovFromMM(28) }; },
  W => { const p = pl(W); return { pos: V(p.x - 2.2, 0.8, p.z - 2.6), look: V(p.x + 1.5, 3.0, p.z + 4), fov: fovFromMM(20) }; },
  W => { const p = pl(W); return { pos: V(p.x + 0.4, 0.55, p.z + 5.5), look: V(p.x, 1.1, p.z), fov: fovFromMM(30) }; },
  W => { const c = chest(W); return { pos: V(c.x + 5, 1.2, c.z - 13), look: V(c.x, c.y - 0.5, c.z), fov: fovFromMM(32) }; },
  W => { const p = pl(W); return { pos: V(p.x - 1.5, 0.9, p.z - 3.2), look: V(0.2, 3.2, 8), fov: fovFromMM(24) }; },
  W => { const p = pl(W); return { pos: V(p.x - 1.4, 0.4, p.z - 1.6), look: V(p.x + 0.6, 1.0, p.z + 2.2), fov: fovFromMM(22) }; },
  W => { const h = head(W); return { pos: V(h.x + 0.6, h.y - 0.6, h.z - 4.6), look: V(h.x, h.y - 0.2, h.z), fov: fovFromMM(55) }; },
];
BUILD.forEach((take, i) => SH.push({ name: 'build' + i, t0: BT(i), t1: BT(i + 1), set: 'arena', take, shake: 0.9, lantern: false,
  cam(t, W) { return BUILD_CAMS[i](W); },
  dress(t, W) { if (take.reset.phase >= 2) bossLava(W, i === 7 ? 0.55 : 1.3); if (i === 7) { W.stage.mats.bossEye.emissiveIntensity = 4; W.boss.model.headLight.intensity = 4; } },
  look() { return arenaLook({ bloom: i === 7 ? [0.45, 0.5, 0.95] : [0.75, 0.6, 0.8], comp: { ...hellPart(1.2), zoomBlur: i % 3 === 2 ? [0.5, 0.5, 0.12, 0] : [0.5, 0.5, 0, 0] } }); } }));
// 15 / 15.1 / 15.2 — ABANDON · ALL · HOPE under the words
SH.push({ name: 'nova', t0: B(15), t1: B(15, 1), set: 'arena', take: NOVA, shake: 1.0, lantern: false,
  cam(t, W) { const p = pl(W); return { pos: V(p.x + 3.5, 1.0, p.z - 7.5), look: V(0, 2.5, 8), fov: fovFromMM(20) }; },
  dress(t, W) { bossLava(W, 1.3); }, look() { return arenaLook({ comp: { ...hellPart(1.2), exposure: 0.55 } }); } });
SH.push({ name: 'leap', t0: B(15, 1), t1: B(15, 2), set: 'arena', take: LEAP, shake: 1.0, lantern: false,
  cam(t, W) { const p = pl(W); return { pos: V(p.x - 1.2, 0.2, p.z - 2.8), look: V(p.x + 0.3, 2.4, p.z + 1), fov: fovFromMM(18) }; },
  dress(t, W) { bossLava(W, 1.3); }, look() { return arenaLook({ comp: { ...hellPart(1.2), exposure: 0.5 } }); } });
SH.push({ name: 'stare', t0: B(15, 2), t1: FINAL, set: 'arena', take: STARE, shake: 1.1, lantern: false,
  cam(t, W) { const h = head(W), k = E.inQ(ramp(t - B(15, 2), 0, 0.89)); return { pos: V(h.x, h.y + 0.05, h.z - lerp(9, 3.2, k)), look: V(h.x, h.y - 0.05, h.z), fov: fovFromMM(40) }; },
  dress(t, W) { bossLava(W, 0.75); W.stage.mats.bossEye.emissiveIntensity = 5; },
  look(t) { const lt = t - B(15, 2); return arenaLook({ comp: { ...hellPart(1.0), exposure: t < B(15, 3) ? 0.45 : 0.12, zoomBlur: [0.5, 0.52, 0.45 * E.inC(ramp(lt, 0.3, 0.89)), 0] } }); } });
// title: far off across the arena, the colossus stands in its fire; the name over it
SH.push({ name: 'title', t0: FINAL, t1: 31.4, set: 'arena', take: TITLE, shake: 0.2, lantern: false,
  cam(t) { const lt = t - FINAL; return { pos: V(-3 + 0.4 * lt, 1.6, -26 + 0.8 * lt), look: V(0, 5.5, 8), fov: fovFromMM(40) }; },
  dress(t, W) { bossLava(W, 0.9); },
  look(t) { return arenaLook({ comp: { ember: [0.12, 0.5, 0.7, 0], emberC: [1, 1, 1, 0.1], ash: [0.1, 0.2, 0.8, 0.2], exposure: 0.42 }, bloom: [0.6, 0.6, 0.8] }); } });

export const SHOTS = SH;
// room for the camera tracks: [x0, z0, x1, z1, radius]
export const CLEAR = [[pathX(31) + 3.4, 31, pathX(35.5) + 3.4, 35.5, 1.4],
  [pathX(36) + 0.5, 36, EYES.x - 0.3, EYES.z - 3, 1.1],           // the sightline to the eyes
  [EYES.x, EYES.z, EYES.x, EYES.z + 1, 3.6],                       // room for the colossus itself
  [2.2, 44, 2.2, 61, 3.0]];                                        // its path when it gives chase
export const DURATION = 31.4;

// ------------------------------------------------------------------------------------------------ global cues (v3's)
const FLASHES = [
  { t: B(0), a: 1.1, d: 0.10, c: [1, 0.85, 0.7] }, { t: B(1), a: 0.15, d: 0.15, c: [0.7, 0.8, 1] },
  { t: B(4), a: 0.35, d: 0.2, c: [1, 0.5, 0.2] }, { t: B(4, 1.5), a: 0.25, d: 0.12, c: [1, 0.5, 0.2] },
  { t: B(5), a: 0.3, d: 0.1, c: [0.8, 0.85, 1] }, { t: B(5, 1), a: 0.2, d: 0.1, c: [0.8, 0.85, 1] },
  { t: B(5, 2), a: 0.35, d: 0.1, c: [1, 0.4, 0.3] }, { t: B(5, 3), a: 0.25, d: 0.1, c: [0.8, 0.85, 1] },
  { t: B(6), a: 0.6, d: 0.09, c: [1, 0.3, 0.15] }, { t: B(7), a: 0.7, d: 0.18, c: [1, 0.6, 0.3] },
  { t: B(8), a: 1.4, d: 0.11, c: [1, 0.9, 0.8] }, { t: B(10), a: 0.45, d: 0.12, c: [0.7, 0.85, 1] },
  { t: B(10, 1), a: 0.5, d: 0.12, c: [1, 0.6, 0.3] },
  { t: B(11), a: 0.2, d: 0.1, c: [1, 0.6, 0.3] }, { t: B(12), a: 0.3, d: 0.12, c: [1, 0.5, 0.2] },
  { t: B(13), a: 0.35, d: 0.07, c: [1, 0.75, 0.45] },
  { t: B(13, 1), a: 0.35, d: 0.08, c: [1, 0.6, 0.3] }, { t: B(13, 2), a: 0.35, d: 0.08, c: [1, 0.6, 0.3] }, { t: B(13, 3), a: 0.35, d: 0.08, c: [1, 0.6, 0.3] },
  ...[0, 1, 2, 3, 4, 5, 6, 7].map(i => ({ t: B(14, i * 0.5), a: 0.25, d: 0.05, c: [1, 0.8, 0.6] })),
  { t: B(15), a: 0.7, d: 0.08, c: [1, 0.6, 0.3] }, { t: B(15, 1), a: 0.6, d: 0.08, c: [1, 0.6, 0.3] }, { t: B(15, 2), a: 0.7, d: 0.08, c: [1, 0.6, 0.3] },
  ...[0, 1, 2, 3].map(i => ({ t: B(15, 3 + i * 0.25), a: 0.5, d: 0.05, c: [1, 0.85, 0.7] })),
  { t: FINAL, a: 1.8, d: 0.09, c: [1, 0.92, 0.85] },
].map(f => Object.assign(f, { t: q(f.t) }));
const KICKS = [B(0), B(1), B(4), B(4, 1.5), B(4, 2.5), B(5, 2), B(6), B(7), B(8), B(10), B(11), B(12), B(12, 2), B(13), B(15), B(15, 1), B(15, 2), FINAL].map(q);

export function cues(t) {
  const kick = pulses(t, KICKS, 0.18);
  let fl = [0, 0, 0], a = 0;
  for (const F of FLASHES) { const p = pulse(t, F.t, F.d) * F.a; if (p > 0.001) { fl = fl.map((v, i) => v + F.c[i] * p); a += p; } }
  const flash = a > 0 ? [...fl.map(v => v / a), Math.min(a, 4)] : [1, 1, 1, 0];
  let bars = t < B(0) ? 1.0 : lerp(1.0, 0.256, E.outE(ramp(t, B(0), B(0) + 0.7)));
  bars += 0.10 * E.inC(ramp(t, B(7, 2.6), B(8) - 0.02)) * (t < B(8) ? 1 : 0);
  bars -= 0.06 * pulses(t, [B(15), B(15, 1), B(15, 2)], 0.2);
  if (t > B(15, 3) && t < FINAL) bars = lerp(0.256, 0.985, E.inE(ramp(t, B(15, 3), FINAL - 0.02)));
  if (t >= FINAL) bars = lerp(0.985, 0.256, E.outE(ramp(t, FINAL, FINAL + 0.55)));
  return { kick, flash, bars };
}
