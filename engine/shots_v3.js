// SELVA OSCURA — v3: v2's first-person cut with photoreal third-person scenes (forestpr / gate3d / beast3d). Same music grid as v1; first-person (FP) beats are interleaved with
// third-person (TP) shots. FP shots carry a viewmodel (lantern / sword / reaching hand) and head-bob cameras.
'use strict';

const PX = SCENES.forest.pathX;
const B = (n, k = 0) => bar(n, k);
const fwd = (L) => L || [0.10, 0.40, 1];

function fcam(z, o = {}) {
  const h = o.h === undefined ? 1.3 : o.h, ahead = o.ahead || 8, off = o.off === undefined ? -0.3 : o.off;
  const up = o.up === undefined ? 0.6 : o.up, side = o.side || 0;
  return { ro: [PX(z) + off, h, z], ta: [PX(z + ahead) + side, h + up, z + ahead] };
}
const forestRays = (cam, amt = 0.6, L) => ({ amt, light: SCENES.forest.project(Object.assign({}, cam, { L: fwd(L) })), thresh: 0.3, decay: 0.975, len: 1.0, col: [0.7, 0.8, 1.0] });
const gradeCold = p => { p.lift = [0.55, 0.72, 0.95, 0.45]; p.gain = [0.92, 0.96, 1.05, 0.25]; p.grade = [1.05, 0.35, 0.82, -0.3]; };
const gradeHell = p => { p.lift = [0.95, 0.55, 0.45, 0.45]; p.gain = [1.05, 0.85, 0.62, 0.30]; p.grade = [0.78, 0.45, 0.92, 0.25]; p.bloom = [0.38, 0.18, 0.5, 0]; p.bloomThresh = 1.1; };
const coldParticles = c => { c.ash = [0.30, 0.35, 1, 0.15]; c.dust = [0.40, 0.3, 1, 0.9]; };
const hellParticles = (c, k = 1) => { c.ember = [0.16 * k, 0.8, 0.75, 0]; c.emberC = [1, 1, 1, 0.12 * k]; c.ash = [0.12, 0.3, 0.8, 0.3]; };
const ENV_COLD = { env: [0.45, 0.55, 0.75], amb: 0.03 }, ENV_HELL = { env: [1.0, 0.5, 0.2], amb: 0.05 };

// ------------------------------------------------------------------------------------------- first-person rig
// path-following walk with head-bob; yaw rotates the look direction around the vertical axis
function fpWalk(t, o = {}) {
  const speed = o.speed === undefined ? 1.4 : o.speed, z = (o.z0 || 0) + speed * t;
  const stride = o.stride || 0.78, bob = o.bob === undefined ? 1 : o.bob;
  const ph = speed * t / stride * Math.PI;
  const by = bob * 0.04 * (Math.abs(Math.sin(ph)) - 0.64);
  const bx = bob * 0.03 * Math.sin(ph * 0.5);
  const h = (o.h || 1.62) + by;
  const ro = [PX(z) + bx + (o.off || 0), h, z];
  let ta = [PX(z + 8) + (o.lookX || 0) + bx * 0.4, h + (o.lookY === undefined ? 0.15 : o.lookY), z + 8];
  if (o.yaw) {
    const dx = ta[0] - ro[0], dz = ta[2] - ro[2], c = Math.cos(o.yaw), s = Math.sin(o.yaw);
    ta = [ro[0] + dx * c + dz * s, ta[1], ro[2] - dx * s + dz * c];
  }
  return { ro, ta, roll: o.roll || 0, ph, bx, by, z };
}
// lantern viewmodel placed on screen + the matching light position in the world (so it lights the trees)
function fpLantern(cam, fl, o = {}) {
  const pivot = [(o.x === undefined ? -0.50 : o.x) - cam.bx * 1.4, (o.y === undefined ? 0.06 : o.y) + cam.by * 1.1];
  const scale = o.scale || 0.34;
  const rot = (o.rot || 0) + (o.swing === undefined ? 0.07 : o.swing) * Math.sin(cam.ph * 0.5 + 0.7);
  const body = [pivot[0] - Math.sin(rot) * 0.8 * scale, pivot[1] - Math.cos(rot) * 0.8 * scale];
  const lanPos = VM.worldAt(cam.ro, cam.ta, cam.roll, fl, body, o.dist || 0.6);
  return { vm: { pos: pivot, scale, rot, flame: o.flame === undefined ? 1 : o.flame }, lanPos };
}
// screen direction -> sword angle (viewmodel convention)
const swAng = (dx, dy) => Math.atan2(-dy, dx);
const sway = (t, a = 1) => [0.008 * a * Math.sin(t * 1.7), 0.006 * a * Math.sin(t * 2.3 + 1)];

// ===================================================================================== ACT I — THE FOREST
// FP-1  waking on the path: the view lifts from the ground on the first boom, the lantern rises into frame
TL.add({
  t0: 0, scene: 'forestpr', shake: 0.12,
  rig(t) {
    const up = E.outC(ramp(t, B(0), B(0) + 1.1));
    const cam = fpWalk(t, { z0: 3, speed: 1.3, bob: 0.8, lookY: lerp(-5.5, 0.12, up), h: 1.62 });
    const L = fpLantern(cam, 1.45, { y: lerp(-0.42, 0.06, E.outC(ramp(t, B(0) + 0.15, B(0) + 0.95))), swing: 0.08 });
    return { cam, L };
  },
  params(lt, t) { const { cam, L } = this.rig(t); return { ...cam, fl: 1.45, lanPos: L.lanPos, lantern: 2.0, halo: 0.35, back: 0.5, hfog: 0.55 }; },
  vm(lt, t) { return { lantern: this.rig(t).L.vm, ...ENV_COLD }; },
  rays(lt, t) { return forestRays(this.rig(t).cam, 0.5); },
  comp(c) { coldParticles(c); },
  post(p) { gradeCold(p); p.bloom = [0.42, 0.10, 0.5, 0]; },
});
// TP-2  the wanderer — who we are
TL.add({
  t0: B(2), scene: 'forestpr', shake: 0.12,
  params(lt) {
    const zw = 30 + 1.15 * lt, zc = zw - 4.6 + 0.35 * lt;
    const ro = [PX(zc) - 0.55, 1.15, zc], ta = [PX(zw + 6) + 0.2, 1.7, zw + 6];
    this._c = { ro, ta };
    return { ro, ta, fl: 1.75, wanOn: 1, wan: [PX(zw), 0, zw], yaw: -0.05, walk: lt * 2.3, lantern: 1.7, back: 0.75, hfog: 0.32, fog: 0.026 };
  },
  rays(lt) { return forestRays(this._c, 0.6); },
  dof: (lt) => ({ focus: 4.75 - 0.3 * lt, aperture: 9, max: 12 }),
  comp(c) { coldParticles(c); },
  post(p) { gradeCold(p); p.bloom = [0.42, 0.10, 0.5, 0]; },
});
// FP-3  lantern raised into the dark — eyes open between the trees
TL.add({
  t0: B(3), scene: 'forestpr', shake: 0.08,
  rig(t, lt) {
    const cam = fpWalk(lt, { z0: 40, speed: 0.25, bob: 0.25, yaw: -0.32, lookY: 0.05 });
    const k = E.outC(ramp(lt, 0.0, 0.5));
    const L = fpLantern(cam, 1.7, { x: lerp(-0.56, -0.40, k), y: lerp(0.04, 0.22, k), scale: 0.36, swing: 0.03, rot: 0.05 * Math.sin(lt * 2) });
    return { cam, L };
  },
  params(lt, t) {
    const { cam, L } = this.rig(t, lt);
    const eyeOn = E.outC(ramp(t, B(3, 1.5), B(3, 1.5) + 0.12)) * (1 - 0.9 * pulse(t, B(3, 3), 0.06) * (t < B(3, 3) + 0.1 ? 1 : 0));
    return { ...cam, fl: 1.7, lanPos: L.lanPos, lantern: 2.2, halo: 0.3, back: 0.4, fog: 0.04, hfog: 0.7,
      eyes: VM.worldAt(cam.ro, cam.ta, 0, 1.7, [0.16, 0.0], 9.5), eyeI: eyeOn * (0.9 + 0.1 * Math.sin(t * 9)) };
  },
  vm(lt, t) { return { lantern: this.rig(t, lt).L.vm, ...ENV_COLD }; },
  rays(lt, t) { return forestRays(this.rig(t, lt).cam, 0.3); },
  comp(c) { coldParticles(c); },
  post(p) { gradeCold(p); p.bloom = [0.5, 0.15, 0.6, 0]; },
});
// TP-4  the eye opens
TL.add({
  t0: B(4), scene: 'eye', shake: 0.25,
  params(lt, t) {
    const open = E.outBack(ramp(lt, 0.04, 0.6)) * (1 - 0.85 * Math.max(0, 1 - Math.abs(t - B(4, 3.4)) / 0.07));
    const pupil = lerp(0.12, 0.034, E.outE(ramp(t, B(4, 1.5), B(4, 1.5) + 0.12)));
    const zoom = 1.12 + 0.12 * lt + 0.22 * E.outE(ramp(t, B(4, 2.5), B(4, 2.5) + 0.25));
    return { open, pupil, zoom, tilt: -0.10, look: [0.02 * Math.sin(lt * 1.3), 0.01], glow: 0.9 + 0.25 * lt, burn: 0.45, c: [0, 0.02], refl: 1 };
  },
  comp(c) { c.ember = [0.06, 0.4, 0.6, 0]; },
  post(p) { gradeHell(p); p.lift = [0.6, 0.6, 0.75, 0.4]; p.bloom = [0.5, 0.18, 0.5, 0]; },
});
// FP-5  RUN — branches whip past, a look back at what follows, then the fall
TL.add({
  t0: B(5), scene: 'forestpr', shake: 0.55, mb: 3,
  rig(t, lt) {
    const back = E.ioC(ramp(t, B(5, 2) - 0.07, B(5, 2) + 0.09)) * (1 - E.ioC(ramp(t, B(5, 2) + 0.30, B(5, 3) + 0.02)));
    const fall = E.inQ(ramp(t, B(5, 3) + 0.06, B(6) - 0.02));
    const cam = fpWalk(lt, { z0: 60, speed: 6.2, stride: 1.3, bob: 2.0 * (1 - fall), h: 1.55 - 0.95 * fall, yaw: Math.PI * back + 0.15 * fall,
      lookY: lerp(0.05, -3.5, fall), roll: 0.55 * fall + 0.04 * Math.sin(lt * 9) });
    const L = fpLantern(cam, 1.3, { swing: 0.32, rot: 0.25 * fall, y: 0.03 - 0.3 * fall, x: -0.48 - 0.1 * fall });
    return { cam, L, back, fall };
  },
  params(lt, t) {
    const { cam, L } = this.rig(t, lt);
    return { ...cam, fl: 1.3, lanPos: L.lanPos, lantern: 2.0, halo: 0.25, back: 0.6, hfog: 0.6,
      eyes: [PX(cam.z - 6.5) + 0.25, 1.45, cam.z - 6.5], eyeI: 1.4 };
  },
  vm(lt, t) {
    const { L } = this.rig(t, lt);
    return { lantern: L.vm, ...ENV_COLD, soft: 0.004,
      branchA: { p: ramp(t, B(5) + 0.04, B(5) + 0.26), ang: 1.15, off: 0.1 },
      branchB: { p: ramp(t, B(5, 1) + 0.08, B(5, 1) + 0.28), ang: -1.05, off: -0.15 } };
  },
  rays(lt, t) { return forestRays(this.rig(t, lt).cam, 0.35); },
  comp(c, lt, t) { coldParticles(c); c.exposure = 1 - E.inQ(ramp(t, B(6) - 0.16, B(6) - 0.03)); },
  post(p) { gradeCold(p); },
});

// ===================================================================================== THE GATE (3D)
// project a world point to screen texcoords for the light-shaft pass
function proj(ro, ta, roll, fl, P) {
  const { cw, cu, cv } = VM.basis(ro, ta, roll);
  const d = P.map((v, i) => v - ro[i]); const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const z = Math.max(dot(d, cw), 1e-3);
  return [fl * dot(d, cu) / z * 1080 / 1920 + 0.5, fl * dot(d, cv) / z + 0.5];
}
const portalRays = (c, amt = 0.45) => ({ amt, light: proj(c.ro, c.ta, c.roll || 0, c.fl, [0, 7, 6]), thresh: 0.55, decay: 0.972, len: 0.9, col: [1.0, 0.55, 0.25] });
TL.add({ // TP — "WAS LOST": the gate wakes in the dark, crane up and back to reveal the guardians
  t0: B(6), scene: 'gate3d', shake: 0.15,
  cam(lt) { const k = E.ioC(ramp(lt, 0.2, 1.78)); return { ro: [lerp(-2.5, 0, k), lerp(1.8, 6.5, k), lerp(-38, -64, k)], ta: [0, lerp(5, 11, k), 0], fl: lerp(1.45, 1.7, k) }; },
  params(lt, t) {
    return { ...this.cam(lt), portal: 0.06 + 0.94 * E.outC(ramp(lt, 0.25, 0.9)), burn: 0, wanOn: 1, wanZ: -9, haze: 1, lantern: 1,
      flare: 0.25 * pulse(t, B(6) + 0.25, 0.25) };
  },
  rays(lt) { return portalRays(this.cam(lt), 0.4 * E.outC(ramp(lt, 0.25, 0.9))); },
  comp(c, lt) { hellParticles(c, 0.8); c.exposure = E.inQ(ramp(lt, 0.25, 0.85)); },
  post(p) { gradeHell(p); p.bloom = [0.5, 0.18, 0.55, 0]; },
});
TL.add({ // FP — from the foot of the gate, lantern lifted to read the inscription as it ignites
  t0: B(7), scene: 'gate3d', shake: 0.15,
  cam(lt) { const x = lerp(6.4, -0.6, E.outC(ramp(lt, 0, 0.9))); return { ro: [x, 1.7 + 0.03 * Math.sin(lt * 5), -27], ta: [x - 0.3, 19.9, 0], fl: 3.4, x }; },
  params(lt) { const c = this.cam(lt); return { ...c, portal: 1, burn: (10 - c.x) / 20 + 0.1, wanOn: 0, haze: 0.8 }; },
  vm(lt) { const s = sway(lt, 2); return { lantern: { pos: [-0.64 + s[0], 0.12 + s[1]], scale: 0.28, rot: 0.06 * Math.sin(lt * 3), flame: 1 }, ...ENV_HELL }; },
  comp(c) { hellParticles(c, 0.9); },
  post(p) { gradeHell(p); p.bloom = [0.55, 0.22, 0.55, 0]; },
});
TL.add({ // FP — climbing the steps into the portal
  t0: B(7, 2), scene: 'gate3d', shake: 0.35, mb: 2,
  cam(lt) { const k = E.inQ(ramp(lt, 0, 0.89)); const bob = 0.05 * Math.abs(Math.sin(lt * 8));
    return { ro: [0.04 * Math.sin(lt * 4), lerp(1.65, 2.7, k) + bob, lerp(-11, -0.5, k)], ta: [0, 5.2, 24], fl: 1.35 }; },
  params(lt) { const k = E.inC(ramp(lt, 0, 0.89)); return { ...this.cam(lt), portal: 1 + 0.6 * k, burn: 1.2, wanOn: 0, vortex: 0.8 + 2 * k, haze: 1.1 }; },
  vm(lt) { return { lantern: { pos: [-0.50 - 0.02 * Math.sin(lt * 4), 0.02 + 0.015 * Math.abs(Math.sin(lt * 8))], scale: 0.34, rot: 0.12 * Math.sin(lt * 4), flame: 1 }, ...ENV_HELL }; },
  rays(lt) { return portalRays(this.cam(lt), 0.5); },
  comp(c, lt, t) { hellParticles(c, 1); c.zoomBlur = [0.5, 0.5, 0.3 * E.inQ(ramp(lt, 0.3, 0.89)), 0]; c.exposure = 1 - E.inQ(ramp(t, B(8) - 0.2, B(8) - 0.1)); },
  post(p) { gradeHell(p); p.bloom = [0.6, 0.2, 0.6, 0]; },
});

// ===================================================================================== ACT II — NINE CIRCLES
TL.add({ // FP — falling: the hand reaches, the lantern tumbles away into the depth
  t0: B(8), scene: 'descent', shake: 0.45, mb: 3,
  params(lt, t) {
    const n = Math.floor(lt / BEAT), fr = (lt - n * BEAT) / BEAT;
    const ice = E.outC(ramp(t, B(10), B(10) + 0.12));
    return { prog: 0.2 + n + E.outC(fr), spin: n * 0.55 + E.outC(fr) * 0.55 + lt * 0.12, focal: 0.85, fire: 0.9 + 0.06 * n,
      vp: [0.03 * Math.sin(lt * 1.7), 0.02 * Math.cos(lt * 1.3)], haze: 0.28, ring: 1.2, ice, flash: 0.25 * pulse(t, B(8), 0.15) };
  },
  vm(lt, t) {
    const slip = E.inQ(ramp(t, B(8) + 0.35, B(9) + 0.4));
    const fallK = 1 - Math.exp(-lt * 1.9);
    const o = { ...ENV_HELL, soft: 0.002 };
    if (slip < 1) o.reach = { pos: [lerp(0.27, 0.36, slip) + 0.01 * Math.sin(lt * 9), lerp(-0.18, -0.85, slip)], scale: 0.62, ang: -0.42, open: lerp(1, 0.55, ramp(lt, 0.2, 0.7)) };
    if (lt < 3.4) o.falling = { pos: [lerp(0.15, 0.0, fallK), lerp(-0.03, 0.0, fallK)], scale: 0.17 * Math.exp(-lt * 1.35), rot: lt * 2.6, flame: 1 };
    return o;
  },
  comp(c) { c.ember = [0.12, 1.2, 0.45, 1]; c.emberC = [1, 1, 1, 0]; },
  post(p, lt, t) { gradeHell(p); const ice = E.outC(ramp(t, B(10), B(10) + 0.12)); if (ice > 0) { p.lift = mixv(p.lift, [0.5, 0.7, 1.0, 0.5], ice); p.gain = mixv(p.gain, [0.85, 0.95, 1.1, 0.3], ice); } },
});
TL.add({ // TP — the beast rises out of the fire (burn dissolve from the frozen ninth circle)
  t0: B(10, 1), scene: 'beast3d', shake: 0.3, tin: { dur: 0.3, type: 0, p: [1, 0, 0, 0] },
  params(lt) {
    const k = E.outC(ramp(lt, 0, 1.33)), eyes = E.outE(ramp(lt, 0.22, 0.32));
    return { ro: [0, lerp(2.0, 3.0, k), lerp(-30, -26.5, k)], ta: [0, lerp(5.5, 9.6, k), 0], fl: 1.5, rise: lerp(5.5, -0.6, k),
      eyes: eyes * (1 + 0.6 * pulse(lt, 0.22, 0.3)), cracks: 0.6 * eyes + 0.2, fire: 0.9, smoke: 0.5 };
  },
  dof: () => ({ focus: 27, aperture: 3, max: 8 }),
  comp(c) { hellParticles(c, 1); },
  post(p) { gradeHell(p); p.bloom = [0.55, 0.25, 0.6, 0]; },
});
TL.add({ // FP — your blade ignites in front of it — NINE CIRCLES
  t0: B(11), scene: 'beast3d', shake: 0.3,
  params(lt, t) { return { ro: [0.25, 1.68, -12.2 + lt * 0.15], ta: [0, 10.5, 0], fl: 1.0, rise: -0.6, eyes: 1, cracks: 0.7, fire: 0.85, smoke: 0.45, flash: 0.1 * pulse(t, B(11, 1.5), 0.15) }; },
  dof: () => ({ focus: 13, aperture: 3, max: 8 }),
  vm(lt) {
    const s = sway(lt, 1.5);
    return { sword: { pos: [0.62 + s[0], -0.30 + s[1]], scale: 0.40, ang: swAng(-0.34, 0.94) + 0.03 * Math.sin(lt * 1.3), ignite: E.outQ(ramp(lt, 0.0, 0.45)) }, ...ENV_HELL };
  },
  comp(c) { hellParticles(c, 1.1); },
  post(p) { gradeHell(p); p.bloom = [0.55, 0.25, 0.6, 0]; },
});
TL.add({ // TP — confrontation, ONE SOUL; wide: the tiny hero before the whole colossus, horn tips in frame; the blade swings
  t0: B(12), scene: 'beast3d', shake: 0.6,
  params(lt, t) {
    const roar = E.outE(ramp(lt, 0.0, 0.25)) * (0.75 + 0.25 * Math.sin(lt * 20));
    const sw = E.outE(ramp(t, B(12, 2), B(12, 2) + 0.14));
    return { ro: [lerp(1.3, 0.9, lt / 1.78), 1.25, lerp(-21.8, -20.8, lt / 1.78)], ta: [0, 8.4, 0], fl: 0.9, rise: -0.6, eyes: 1, roar, cracks: 0.9,
      fire: 0.75 + 0.15 * pulse(lt, 0, 0.5), smoke: 0.45, heroOn: 1, hero: [0, 0, -12], ignite: 1, swing: lerp(0.35, 2.3, sw), flash: 0.35 * pulse(t, B(12, 2), 0.1),
      fgFire: 0.4, key: 1.15 };
  },
  dof: () => ({ focus: 9.4, aperture: 2.5, max: 8 }),
  comp(c) { hellParticles(c, 1.3); },
  post(p) { gradeHell(p); p.bloom = [0.55, 0.25, 0.6, 0]; },
});
// FP slash helper: blade sweeps across the beast, leaving a fire arc
function slashVM(lt, o = {}) {
  const a0 = swAng(-0.2, 0.98), a1 = a0 - (o.span || 1.7);
  const k = E.outC(ramp(lt, 0.0, o.dur || 0.17));
  const pos = [lerp(o.x0 || 0.64, o.x1 || -0.08, k), lerp(o.y0 || 0.10, o.y1 || -0.20, k)];
  return { sword: { pos, scale: o.scale || 0.42, ang: lerp(a0, a1, k), ignite: 1, trail: Math.exp(-Math.max(0, lt - (o.dur || 0.17)) / 0.13) * Math.min(1, lt * 40), trailFrom: a0 }, ...ENV_HELL, soft: 0.003 };
}
const beastClose = (lt, o = {}) => ({ ro: [0.2, 1.7, -10.5], ta: [0, 10.5, 0], fl: 1.0, rise: -0.6, eyes: 1.1, roar: 0.5, cracks: 1, fire: 0.9, smoke: 0.4, ...o });
TL.add({ t0: B(13), scene: 'beast3d', shake: 0.9, mb: 6, // FP — the slash
  params(lt) { return beastClose(lt); },
  vm(lt) { return slashVM(lt); },
  comp(c) { hellParticles(c, 1.3); }, post(p) { gradeHell(p); } });
TL.add({ t0: B(13, 1), scene: 'eye', shake: 0.6,
  params(lt) { return { open: 1, pupil: 0.026 + 0.01 * lt, zoom: 1.9 + lt * 0.6, tilt: -0.12, glow: 0.85, burn: 0.95, hue: 0.8, refl: 0.5 }; },
  comp(c) { c.ember = [0.08, 0.5, 0.6, 0]; }, post(p) { gradeHell(p); } });
TL.add({ t0: B(13, 2), scene: 'gate3d', shake: 0.5, // FP — pushing toward the fire with the lantern
  params(lt) { return { ro: [0.03 * Math.sin(lt * 9), 2.0 + 0.04 * Math.abs(Math.sin(lt * 9)), -6.5 + lt * 3.5], ta: [0, 5.0, 24], fl: 1.3, portal: 1.5, burn: 1.2, wanOn: 0, vortex: 1.4, haze: 1.1 }; },
  vm(lt) { return { lantern: { pos: [-0.48, 0.03 + 0.02 * Math.abs(Math.sin(lt * 9))], scale: 0.34, rot: 0.15 * Math.sin(lt * 5), flame: 1 }, ...ENV_HELL }; },
  comp(c) { hellParticles(c, 1.2); }, post(p) { gradeHell(p); } });
TL.add({ t0: B(13, 3), scene: 'forestpr', shake: 0.4, // FP — the eyes are right there
  rig(lt) {
    const cam = fpWalk(lt, { z0: 40, speed: 0.6, bob: 0.4, yaw: 0.25, lookY: 0.0 });
    const L = fpLantern(cam, 2.0, { x: -0.32, y: 0.2, scale: 0.36, swing: 0.05 });
    return { cam, L };
  },
  params(lt) { const { cam, L } = this.rig(lt); return { ...cam, fl: 2.0, lanPos: L.lanPos, lantern: 2.2, halo: 0.3, back: 0.4, fog: 0.045, hfog: 0.7, eyes: VM.worldAt(cam.ro, cam.ta, 0, 2.0, [0.1, 0.02], 6.5), eyeI: 1.5 }; },
  vm(lt) { return { lantern: this.rig(lt).L.vm, ...ENV_COLD }; },
  rays(lt) { return forestRays(this.rig(lt).cam, 0.3); },
  comp(c) { coldParticles(c); }, post(p) { gradeCold(p); } });

// 8th-note build: rapid cuts alternating FP and TP
const BUILD = [
  ['beast3d', lt => ({ ro: [0, 10.3, -7.2 + lt * 2], ta: [0, 11.6, 0], fl: 2.4, rise: -1.2, eyes: 1.1, cracks: 1, fire: 0.8, smoke: 0.3 })],
  ['beast3d', lt => beastClose(lt, { roar: 0.8 }), lt => slashVM(lt, { dur: 0.12 })],
  ['eye', lt => ({ open: 1, pupil: 0.04, zoom: 1.9 + lt, tilt: 0.3, glow: 0.8, burn: 0.8, hue: 0.4 })],
  ['gate3d', lt => ({ ro: [3 - lt * 4, 1.7, -26], ta: [3 - lt * 4, 19.9, 0], fl: 3.6, portal: 1.3, burn: 1.2, wanOn: 0, haze: 0.8 }), lt => ({ lantern: { pos: [-0.62, 0.13], scale: 0.28, rot: 0.1, flame: 1 }, ...ENV_HELL })],
  ['descent', lt => ({ prog: 5 + lt * 4, spin: lt * 3, focal: 0.8, fire: 1.3, ring: 1.5 }), lt => ({ reach: { pos: [0.3, -0.22 - lt * 0.6], scale: 0.62, ang: -0.42, open: 0.9 }, ...ENV_HELL })],
  ['forestpr', null, null, true],
  ['beast3d', lt => ({ ro: [3.0, 3.2, -22], ta: [0, 10.0, 0], fl: 1.3, rise: -0.6, eyes: 1.2, roar: 1, cracks: 1, fire: 1.1, smoke: 0.3 })],
  ['eye', lt => ({ open: 1, pupil: 0.022, zoom: 1.5 + lt * 2, tilt: -0.1, glow: 0.9, burn: 1, hue: 1 })],
];
BUILD.forEach(([scene, fn, vmf, fpRun], i) => {
  const shot = {
    t0: B(14, i * 0.5), scene, shake: 0.9, mb: 2, params: fn,
    tin: i % 3 === 2 ? { dur: 0.08, type: 2, p: [0, 0, 0, 0] } : undefined,
    comp(c) { if (scene === 'forestpr') coldParticles(c); else hellParticles(c, 1.2); },
    post(p) { if (scene === 'forestpr' || scene === 'descent') gradeCold(p); else gradeHell(p); },
  };
  if (vmf) shot.vm = vmf;
  if (fpRun) { // FP sprint between the trees
    shot.rig = lt => { const cam = fpWalk(lt, { z0: 150, speed: 6.5, stride: 1.3, bob: 2.2, h: 1.5, roll: 0.05 * Math.sin(lt * 11) }); return { cam, L: fpLantern(cam, 1.3, { swing: 0.35 }) }; };
    shot.params = function (lt) { const { cam, L } = this.rig(lt); return { ...cam, fl: 1.3, lanPos: L.lanPos, lantern: 2.0, halo: 0.25, back: 0.55, hfog: 0.55 }; };
    shot.vm = function (lt) { return { lantern: this.rig(lt).L.vm, ...ENV_COLD, branchA: { p: ramp(lt, 0.02, 0.2), ang: 1.0, off: 0 } }; };
    shot.rays = function (lt) { return forestRays(this.rig(lt).cam, 0.35); };
  }
  TL.add(shot);
});

// ABANDON / ALL / HOPE
TL.add({ t0: B(15), scene: 'title', shake: 1.0,
  params() { return { shock: -1, glow: 0.35, rays: 0.7, c: [0, 0.0], floor: 1 }; },
  comp(c) { hellParticles(c, 1.2); c.exposure = 0.8; }, post(p) { gradeHell(p); p.bloom = [0.3, 0.15, 0.4, 0]; } });
TL.add({ t0: B(15, 1), scene: 'descent', shake: 1.0, mb: 2,
  params(lt) { return { prog: 7 + E.outC(lt / BEAT) * 1.4, spin: 4 + lt * 3, focal: 0.8, fire: 1.4, ring: 1.6 }; },
  comp(c) { c.ember = [0.10, 1.6, 0.5, 1]; c.exposure = 0.2; }, post(p) { gradeHell(p); p.bloom = [0.3, 0.15, 0.4, 0]; } });
TL.add({ t0: B(15, 2), scene: 'beast3d', shake: 1.1, mb: 2,
  params(lt) { return { ro: [0, 11.15, lerp(-10, -5.2, E.inQ(ramp(lt, 0, 0.89)))], ta: [0, 11.1, 0], fl: 2.0, rise: -1.2, eyes: 1.2, roar: 0, cracks: 1, fire: 1.0, smoke: 0.4 }; },
  comp(c, lt) { hellParticles(c, 1.0); c.exposure = 0.22; c.zoomBlur = [0.5, 0.52, 0.45 * E.inC(ramp(lt, 0.3, 0.89)), 0]; },
  post(p) { gradeHell(p); p.bloom = [0.3, 0.15, 0.4, 0]; } });

// ===================================================================================== TITLE
TL.add({ t0: FINAL, scene: 'title', shake: 0.2,
  params(lt) { return { shock: lt, glow: lerp(0.55, 0.3, E.outC(ramp(lt, 0, 1.0))), rays: lerp(1.0, 0.5, E.outC(ramp(lt, 0, 1.6))), c: [0, 0.135], floor: 1 }; },
  comp(c) { c.ember = [0.12, 0.5, 0.7, 0]; c.emberC = [1, 1, 1, 0.1]; c.ash = [0.1, 0.2, 0.8, 0.2]; },
  post(p, lt) { gradeHell(p); p.bloom = [0.4, 0.22, 0.5, 0]; p.bars[3] = E.ioS(ramp(lt, 1.85, 2.43)); } });

// ===================================================================================== GLOBAL CUES
const FLASHES = [
  { t: B(0), a: 1.1, d: 0.10, c: [1, 0.85, 0.7] },
  { t: B(1), a: 0.15, d: 0.15, c: [0.7, 0.8, 1] },
  { t: B(4), a: 0.35, d: 0.2, c: [1, 0.5, 0.2] },
  { t: B(4, 1.5), a: 0.25, d: 0.12, c: [1, 0.5, 0.2] },
  { t: B(5), a: 0.3, d: 0.1, c: [0.8, 0.85, 1] }, { t: B(5, 1), a: 0.2, d: 0.1, c: [0.8, 0.85, 1] },
  { t: B(5, 2), a: 0.35, d: 0.1, c: [1, 0.4, 0.3] }, { t: B(5, 3), a: 0.25, d: 0.1, c: [0.8, 0.85, 1] },
  { t: B(6), a: 0.6, d: 0.09, c: [1, 0.3, 0.15] },
  { t: B(7), a: 0.7, d: 0.18, c: [1, 0.6, 0.3] },
  { t: B(8), a: 1.4, d: 0.11, c: [1, 0.9, 0.8] },
  { t: B(10), a: 0.45, d: 0.12, c: [0.7, 0.85, 1] },
  { t: B(11), a: 0.2, d: 0.1, c: [1, 0.6, 0.3] },
  { t: B(12), a: 0.3, d: 0.12, c: [1, 0.5, 0.2] },
  { t: B(13), a: 0.25, d: 0.06, c: [1, 0.75, 0.45] },
  { t: B(13, 1), a: 0.35, d: 0.08, c: [1, 0.6, 0.3] }, { t: B(13, 2), a: 0.35, d: 0.08, c: [1, 0.6, 0.3] }, { t: B(13, 3), a: 0.35, d: 0.08, c: [0.8, 0.85, 1] },
  ...[0, 1, 2, 3, 4, 5, 6, 7].map(i => ({ t: B(14, i * 0.5), a: 0.25, d: 0.05, c: [1, 0.8, 0.6] })),
  { t: B(15), a: 0.7, d: 0.08, c: [1, 0.6, 0.3] }, { t: B(15, 1), a: 0.6, d: 0.08, c: [1, 0.6, 0.3] }, { t: B(15, 2), a: 0.7, d: 0.08, c: [1, 0.6, 0.3] },
  ...[0, 1, 2, 3].map(i => ({ t: B(15, 3 + i * 0.25), a: 0.5, d: 0.05, c: [1, 0.85, 0.7] })),
  { t: FINAL, a: 1.8, d: 0.09, c: [1, 0.92, 0.85] },
].map(f => Object.assign(f, { t: TL.q(f.t) }));
const KICKS = [B(0), B(1), B(4), B(4, 1.5), B(4, 2.5), B(5, 2), B(6), B(7), B(8), B(10), B(11), B(12), B(12, 2), B(13), B(15), B(15, 1), B(15, 2), FINAL].map(TL.q);

TL.cues.push((st, t) => {
  const shot = TL.shots[TL.shotAt(t)];
  const au = audioAt(t);
  const kick = pulses(t, KICKS, 0.18);
  const amp = (shot.shake || 0) * (0.35 + 0.9 * au.low) + kick * 1.4;
  const f = 11;
  st.comp.shake = [vnoise(t * f) * amp * 0.0055, vnoise(t * f + 37) * amp * 0.0055, vnoise(t * 6 + 91) * amp * 0.004, 1.0 + amp * 0.012 + kick * 0.02];
  let fl = [0, 0, 0], a = 0;
  for (const F of FLASHES) { const p = pulse(t, F.t, F.d) * F.a; if (p > 0.001) { fl = fl.map((v, i) => v + F.c[i] * p); a += p; } }
  if (a > 0) st.comp.flash = [...fl.map(v => v / a), Math.min(a, 4)];
  st.post.lens[0] = 0.0028 + 0.012 * kick + 0.004 * au.high * 0.5;
  let bars = 0.256;
  if (t < B(0)) bars = 1.0;
  else bars = lerp(1.0, 0.256, E.outE(ramp(t, B(0), B(0) + 0.7)));
  bars += 0.10 * E.inC(ramp(t, B(7, 2.6), B(8) - 0.02)) * (t < B(8) ? 1 : 0);
  bars -= 0.06 * pulses(t, [B(15), B(15, 1), B(15, 2)], 0.2);
  if (t > B(15, 3) && t < FINAL) bars = lerp(0.256, 0.985, E.inE(ramp(t, B(15, 3), FINAL - 0.02)));
  if (t >= FINAL) bars = lerp(0.985, 0.256, E.outE(ramp(t, FINAL, FINAL + 0.55)));
  st.post.bars[0] = bars;
  st.post.bars[1] = (t < B(0) + 1.0 ? 2.5 * pulse(t, B(0), 0.28) : 0) + (t > B(15, 3) ? 2.0 * ramp(t, B(15, 3), FINAL) * (t < FINAL ? 1 : 0) + 2.5 * pulse(t, FINAL, 0.4) : 0);
  if (t < B(0) + 0.05) st.post.line = [E.inC(ramp(t, 0.18, B(0))) * 1.15, 1.6 * E.inQ(ramp(t, 0.15, B(0))), 1.2, 0];
});
