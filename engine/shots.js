// SELVA OSCURA — 30s teaser storyboard. All times derive from the music grid (135 BPM, true downbeat D0).
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

// grades
const gradeCold = p => { p.lift = [0.55, 0.72, 0.95, 0.45]; p.gain = [0.92, 0.96, 1.05, 0.25]; p.grade = [1.05, 0.35, 0.82, -0.3]; };
const gradeHell = p => { p.lift = [0.95, 0.55, 0.45, 0.45]; p.gain = [1.05, 0.85, 0.62, 0.30]; p.grade = [0.78, 0.45, 0.92, 0.25]; p.bloom = [0.38, 0.18, 0.5, 0]; p.bloomThresh = 1.1; };
const coldParticles = c => { c.ash = [0.30, 0.35, 1, 0.15]; c.dust = [0.40, 0.3, 1, 0.9]; };
const hellParticles = (c, k = 1) => { c.ember = [0.16 * k, 0.8, 0.75, 0]; c.emberC = [1, 1, 1, 0.12 * k]; c.ash = [0.12, 0.3, 0.8, 0.3]; };

// ===================================================================================== ACT I — THE FOREST
// S1  open: bars burst from a hairline on the first boom, camera lurches into the forest
TL.add({
  t0: 0, scene: 'forest', shake: 0.15,
  cam(t) {
    const lt = Math.max(0, t - B(0));
    let z = 2 + 7.5 * (1 - Math.exp(-lt * 1.25)) + 0.9 * lt + 0.7 * E.outC(ramp(t, B(1), B(1) + 0.5));
    return Object.assign(fcam(z, { h: 1.05 + 0.25 * E.ioS(ramp(t, 0.5, 4)), up: 0.45, off: -0.4 }), { z });
  },
  params(lt, t) {
    const c = this.cam(t);
    return { ...c, fl: 1.55, wanOn: 1, wan: [PX(23 + 0.75 * t), 0, 23 + 0.75 * t], walk: t * 1.6, lantern: 1.3, back: 0.5, hfog: 0.55 };
  },
  rays(lt, t) { return forestRays(this.cam(t), 0.55); },
  comp(c) { coldParticles(c); },
  post(p, lt, t) { gradeCold(p); p.bloom = [0.42, 0.10, 0.5, 0]; },
});
// S2  the wanderer
TL.add({
  t0: B(2), scene: 'forest', shake: 0.12,
  params(lt) {
    const zw = 30 + 1.15 * lt;
    const zc = zw - 4.6 + 0.35 * lt;
    const ro = [PX(zc) - 0.55, 1.15, zc], ta = [PX(zw + 6) + 0.2, 1.7, zw + 6];
    this._c = { ro, ta };
    return { ro, ta, fl: 1.75, wanOn: 1, wan: [PX(zw), 0, zw], yaw: -0.05, walk: lt * 2.3, lantern: 1.1, back: 0.7, hfog: 0.6 };
  },
  rays(lt) { return forestRays(this._c, 0.6); },
  comp(c) { coldParticles(c); },
  post(p) { gradeCold(p); p.bloom = [0.42, 0.10, 0.5, 0]; },
});
// S3  over the shoulder — something watches between the trees
TL.add({
  t0: B(3), scene: 'forest', shake: 0.1,
  params(lt, t) {
    const zw = 40, w = [PX(zw), 0, zw];
    const ro = [w[0] - 1.05, 1.5, zw - 2.4 + 0.25 * lt], ta = [w[0] + 2.2, 1.3, zw + 7];
    this._c = { ro, ta };
    const eyeOn = E.outC(ramp(t, B(3, 1.5), B(3, 1.5) + 0.12)) * (1 - 0.9 * pulse(t, B(3, 3), 0.06) * (t < B(3, 3) + 0.1 ? 1 : 0));
    return { ro, ta, fl: 2.1, wanOn: 1, wan: w, yaw: 0.35, walk: 0, lantern: 1.0, back: 0.45, fog: 0.04, hfog: 0.7,
      eyes: [w[0] + 3.2, 1.25, zw + 11], eyeI: eyeOn * (0.9 + 0.1 * Math.sin(t * 9)) };
  },
  rays(lt) { return forestRays(this._c, 0.35); },
  comp(c) { coldParticles(c); },
  post(p) { gradeCold(p); p.bloom = [0.5, 0.15, 0.6, 0]; },
});
// S4  the eye opens
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
// S5  the build — cuts on each beat
TL.add({ // run through the trees
  t0: B(5), scene: 'forest', shake: 0.8, mb: 3,
  params(lt) {
    const z = 60 + 8.5 * lt;
    const c = fcam(z, { h: 0.85 + 0.08 * Math.sin(lt * 18), up: 0.3, off: 0.4 * Math.sin(lt * 4), ahead: 6 });
    this._c = c;
    return { ...c, fl: 1.25, roll: 0.06 * Math.sin(lt * 9), back: 0.6, hfog: 0.6 };
  },
  rays() { return forestRays(this._c, 0.45); },
  comp(c) { coldParticles(c); },
  post(p) { gradeCold(p); },
});
TL.add({ // pupil macro
  t0: B(5, 1), scene: 'eye', shake: 0.5,
  params(lt) { return { open: 1, pupil: lerp(0.028, 0.05, ramp(lt, 0, 0.4)), zoom: 2.1 + lt * 0.8, tilt: 0.2 + lt * 0.3, glow: 0.55, burn: 0.6, c: [0.0, 0.0], hue: 0.5, refl: 0.6 }; },
  comp(c) { c.ember = [0.06, 0.4, 0.6, 0]; },
  post(p) { gradeHell(p); },
});
TL.add({ // the wanderer, dutch angle
  t0: B(5, 2), scene: 'forest', shake: 0.6, mb: 2,
  params(lt) {
    const zw = 80 + 2.0 * lt, w = [PX(zw), 0, zw];
    const ro = [w[0] + 1.3, 0.7, zw - 2.2 + 0.6 * lt], ta = [w[0] - 0.4, 1.5, zw + 3];
    this._c = { ro, ta };
    return { ro, ta, roll: 0.22 + 0.35 * lt, fl: 1.4, wanOn: 1, wan: w, yaw: 0.1, walk: lt * 3.2, lantern: 1.25, back: 0.6, hfog: 0.6 };
  },
  rays() { return forestRays(this._c, 0.4); },
  comp(c) { coldParticles(c); },
  post(p) { gradeCold(p); },
});
TL.add({ // canopy spinning overhead — lost
  t0: B(5, 3), scene: 'forest', shake: 0.4, mb: 3,
  params(lt) {
    const z = 95;
    const ro = [PX(z) + 0.3, 0.6, z], ta = [PX(z) + 0.6, 10, z + 2.5];
    this._c = { ro, ta };
    return { ro, ta, roll: 0.5 + lt * 2.4, fl: 1.05, back: 1.3, hfog: 0.4 };
  },
  rays() { return { amt: 0 }; },
  comp(c) { coldParticles(c); },
  post(p) { gradeCold(p); },
});

// ===================================================================================== THE GATE
TL.add({ // "WAS LOST" — the gate wakes in the dark
  t0: B(6), scene: 'gate', shake: 0.2,
  params(lt, t) {
    const k = E.ioC(ramp(lt, 0.3, 1.78));
    return { cam: [0, lerp(5.2, 11.2, k)], S: lerp(22, 34, k), portal: 0.08 + 0.92 * E.outC(ramp(lt, 0.25, 0.9)), burn: 0, wanOn: 1, wanX: 0,
      vortex: 0.5, flare: 0.25 * pulse(t, B(6) + 0.25, 0.25), smoke: 0.6, lantern: 1 };
  },
  comp(c, lt) { hellParticles(c, 0.8); c.exposure = E.inQ(ramp(lt, 0.25, 0.85)); },
  post(p) { gradeHell(p); p.bloom = [0.5, 0.18, 0.55, 0]; },
});
TL.add({ // the inscription ignites on the boom
  t0: B(7), scene: 'gate', shake: 0.25,
  params(lt) {
    const x = lerp(-6.6, 0.4, E.outC(ramp(lt, 0, 0.9)));
    return { cam: [x, 20.15], S: 4.4, roll: -0.02, portal: 1, burn: (x + 10) / 20 + 0.1, wanOn: 0, vortex: 0.6, smoke: 0.35 };
  },
  comp(c) { hellParticles(c, 0.9); },
  post(p) { gradeHell(p); p.bloom = [0.55, 0.22, 0.55, 0]; },
});
TL.add({ // pulled into the portal
  t0: B(7, 2), scene: 'gate', shake: 0.45, mb: 2,
  params(lt) {
    const k = E.inC(ramp(lt, 0, 0.89));
    return { cam: [0, lerp(3.2, 4.2, k)], S: lerp(10, 2.4, k), portal: 1 + 0.5 * k, burn: 1.2, wanOn: 1, wanX: 0, vortex: 0.8 + 2 * k, smoke: 0.5, lantern: 1 };
  },
  comp(c, lt, t) { hellParticles(c, 1); c.zoomBlur = [0.5, 0.5, 0.35 * E.inQ(ramp(lt, 0.2, 0.89)), 0]; c.exposure = 1 - E.inQ(ramp(t, B(8) - 0.2, B(8) - 0.1)); },
  post(p, lt) { gradeHell(p); p.bloom = [0.6, 0.2, 0.6, 0]; },
});

// ===================================================================================== ACT II — NINE CIRCLES
TL.add({
  t0: B(8), scene: 'descent', shake: 0.45, mb: 3,
  params(lt, t) {
    const n = Math.floor(lt / BEAT), fr = (lt - n * BEAT) / BEAT;
    const prog = 0.2 + n + E.outC(fr);
    const ice = E.outC(ramp(t, B(10), B(10) + 0.12));
    return { prog, spin: n * 0.55 + E.outC(fr) * 0.55 + lt * 0.12, focal: 0.85, fire: 0.9 + 0.06 * n, vp: [0.03 * Math.sin(lt * 1.7), 0.02 * Math.cos(lt * 1.3)], haze: 0.28, ring: 1.2, ice, flash: 0.25 * pulse(t, B(8), 0.15) };
  },
  comp(c, lt) { c.ember = [0.12, 1.2, 0.45, 1]; c.emberC = [1, 1, 1, 0]; },
  post(p, lt, t) { gradeHell(p); const ice = E.outC(ramp(t, B(10), B(10) + 0.12)); if (ice > 0) { p.lift = mixv(p.lift, [0.5, 0.7, 1.0, 0.5], ice); p.gain = mixv(p.gain, [0.85, 0.95, 1.1, 0.3], ice); } },
});
TL.add({ // the beast rises (burn dissolve from the frozen ninth circle)
  t0: B(10, 1), scene: 'beast', shake: 0.3, tin: { dur: 0.3, type: 0, p: [1, 0, 0, 0] },
  params(lt, t) {
    const k = E.outC(ramp(lt, 0, 1.33));
    const eyes = E.outE(ramp(lt, 0.22, 0.32));
    return { cam: [0, lerp(0.05, 0.38, k)], S: lerp(3.0, 2.35, k), rise: lerp(0.35, 0, k), eyes: eyes * (1 + 0.6 * pulse(lt, 0.22, 0.3)), cracks: 0.55 * eyes, fire: 0.8, smoke: 0.65 };
  },
  comp(c) { hellParticles(c, 1); },
  post(p) { gradeHell(p); p.bloom = [0.55, 0.25, 0.6, 0]; },
});
TL.add({ // the hero's blade ignites — NINE CIRCLES
  t0: B(11), scene: 'beast', shake: 0.3,
  params(lt, t) {
    return { cam: [0.15, lerp(-0.1, 0.0, lt / 1.78)], S: lerp(1.75, 1.55, E.outC(lt / 1.78)), eyes: 0.8, cracks: 0.5, fire: 0.75, smoke: 0.6,
      heroOn: 1, hero: [-0.42, -1.3], heroS: 0.82, ignite: E.outQ(ramp(lt, 0.0, 0.42)), swordAng: 0.98 + 0.05 * Math.sin(lt * 2), heroLight: 1.2,
      flash: 0.12 * pulse(t, B(11, 1.5), 0.15) };
  },
  comp(c) { hellParticles(c, 1.1); },
  post(p) { gradeHell(p); p.bloom = [0.55, 0.25, 0.6, 0]; },
});
TL.add({ // confrontation — ONE SOUL; the beast roars, the blade swings
  t0: B(12), scene: 'beast', shake: 0.7,
  params(lt, t) {
    const roar = E.outE(ramp(lt, 0.0, 0.25)) * (0.75 + 0.25 * Math.sin(lt * 20));
    const sw = E.outE(ramp(t, B(12, 2), B(12, 2) + 0.14));
    return { cam: [0, lerp(0.1, 0.25, lt / 1.78)], S: lerp(4.5, 4.0, E.outC(lt / 1.78)), eyes: 0.9, roar, cracks: 0.9, fire: 0.85 + 0.15 * pulse(lt, 0, 0.5), smoke: 0.55,
      heroOn: 1, hero: [0, -1.95], heroS: 0.55, ignite: 1, swordAng: lerp(1.15, -0.55, sw), heroLight: 1.4, flash: 0.35 * pulse(t, B(12, 2), 0.1) };
  },
  comp(c) { hellParticles(c, 1.3); },
  post(p) { gradeHell(p); p.bloom = [0.55, 0.25, 0.6, 0]; },
});
// montage on the beat (split-slash into the first cut)
TL.add({ t0: B(13), scene: 'eye', shake: 0.6, tin: { dur: 0.32, type: 1, p: [-0.62, 0.9, 0, 0] },
  params(lt) { return { open: 1, pupil: 0.026 + 0.01 * lt, zoom: 1.9 + lt * 0.6, tilt: -0.12, glow: 0.85, burn: 0.95, hue: 0.8, refl: 0.5 }; },
  comp(c) { c.ember = [0.08, 0.5, 0.6, 0]; }, post(p) { gradeHell(p); } });
TL.add({ t0: B(13, 1), scene: 'gate', shake: 0.6,
  params(lt) { return { cam: [0, 3.0 + lt], S: 8.5 - lt * 2, portal: 1.6, burn: 1.2, wanOn: 1, vortex: 1.4, smoke: 0.4 }; },
  comp(c) { hellParticles(c, 1.2); }, post(p) { gradeHell(p); } });
TL.add({ t0: B(13, 2), scene: 'descent', shake: 0.6, mb: 2,
  params(lt) { return { prog: 3.2 + E.outC(lt / BEAT) * 1.2, spin: 2.0 + lt * 2.5, focal: 0.8, fire: 1.2, ice: 1, ring: 1.4 }; },
  comp(c) { c.ember = [0.12, 1.4, 0.45, 1]; }, post(p) { gradeCold(p); } });
TL.add({ t0: B(13, 3), scene: 'forest', shake: 0.4,
  params(lt, t) {
    const zw = 40, w = [PX(zw), 0, zw];
    const ro = [w[0] + 1.6, 1.4, zw + 4 + 0.6 * lt], ta = [w[0] + 2.6, 1.3, zw + 12];
    this._c = { ro, ta };
    return { ro, ta, fl: 2.6, back: 0.4, fog: 0.045, hfog: 0.7, eyes: [w[0] + 3.0, 1.3, zw + 10.5], eyeI: 1.4 };
  },
  rays(lt) { return forestRays(this._c, 0.3); },
  comp(c) { coldParticles(c); }, post(p) { gradeCold(p); } });

// 8th-note build: rapid cuts, glitch seams
const BUILD = [
  ['beast', lt => ({ cam: [0, 0.43], S: 0.85, eyes: 0.7, cracks: 1, fire: 0.7, smoke: 0.3 })],
  ['beast', lt => ({ cam: [0.0, 0.2], S: 1.25, eyes: 1, heroOn: 1, hero: [-0.2, -1.0], heroS: 0.7, ignite: 1, swordAng: 0.7 + lt * 2, fire: 0.9 })],
  ['eye', lt => ({ open: 1, pupil: 0.04, zoom: 1.9 + lt, tilt: 0.3, glow: 0.8, burn: 0.8, hue: 0.4 })],
  ['gate', lt => ({ cam: [-3 + lt * 4, 20.15], S: 3.6, portal: 1.3, burn: 1.2, wanOn: 0, smoke: 0.3 })],
  ['descent', lt => ({ prog: 5 + lt * 4, spin: lt * 3, focal: 0.8, fire: 1.3, ring: 1.5 })],
  ['forest', lt => { const zw = 140 + lt; const w = [PX(zw), 0, zw]; return { ro: [w[0] - 0.3, 1.2, zw - 3.4], ta: [w[0], 1.5, zw + 5], fl: 1.8, wanOn: 1, wan: w, walk: lt * 3, lantern: 1.3, back: 0.5, hfog: 0.55 }; }],
  ['beast', lt => ({ cam: [0, 0.3], S: 1.9, eyes: 1.6, roar: 1, cracks: 1, fire: 1.3, smoke: 0.3 })],
  ['eye', lt => ({ open: 1, pupil: 0.022, zoom: 1.5 + lt * 2, tilt: -0.1, glow: 0.9, burn: 1, hue: 1 })],
];
BUILD.forEach(([scene, fn], i) => TL.add({
  t0: B(14, i * 0.5), scene, shake: 0.9, mb: 2, params: fn,
  tin: i % 3 === 1 ? { dur: 0.08, type: 2, p: [0, 0, 0, 0] } : undefined,
  rays: scene === 'forest' ? () => ({ amt: 0.4, light: [0.55, 1.1], thresh: 0.3, decay: 0.975, len: 1.0, col: [0.7, 0.8, 1.0] }) : undefined,
  comp(c) { if (scene === 'forest') coldParticles(c); else hellParticles(c, 1.2); },
  post(p) { if (scene === 'forest' || scene === 'descent') gradeCold(p); else gradeHell(p); },
}));

// ABANDON / ALL / HOPE
TL.add({ t0: B(15), scene: 'title', shake: 1.0,
  params(lt) { return { shock: -1, glow: 0.35, rays: 0.7, c: [0, 0.0], floor: 1 }; },
  comp(c) { hellParticles(c, 1.2); c.exposure = 0.8; }, post(p) { gradeHell(p); p.bloom = [0.3, 0.15, 0.4, 0]; } });
TL.add({ t0: B(15, 1), scene: 'descent', shake: 1.0, mb: 2,
  params(lt) { return { prog: 7 + E.outC(lt / BEAT) * 1.4, spin: 4 + lt * 3, focal: 0.8, fire: 1.4, ring: 1.6 }; },
  comp(c) { c.ember = [0.10, 1.6, 0.5, 1]; c.exposure = 0.2; }, post(p) { gradeHell(p); p.bloom = [0.3, 0.15, 0.4, 0]; } });
TL.add({ t0: B(15, 2), scene: 'beast', shake: 1.1, mb: 2,
  params(lt) { return { cam: [0, 0.43], S: lerp(1.1, 0.55, E.inQ(ramp(lt, 0, 0.89))), eyes: 1.2, roar: 0, cracks: 1, fire: 1.0, smoke: 0.4 }; },
  comp(c, lt) { hellParticles(c, 1.0); c.exposure = 0.22; c.zoomBlur = [0.5, 0.52, 0.45 * E.inC(ramp(lt, 0.3, 0.89)), 0]; },
  post(p) { gradeHell(p); p.bloom = [0.3, 0.15, 0.4, 0]; } });

// ===================================================================================== TITLE
TL.add({ t0: FINAL, scene: 'title', shake: 0.2,
  params(lt) { return { shock: lt, glow: lerp(0.55, 0.3, E.outC(ramp(lt, 0, 1.0))), rays: lerp(1.0, 0.5, E.outC(ramp(lt, 0, 1.6))), c: [0, 0.135], floor: 1 }; },
  comp(c, lt) { c.ember = [0.12, 0.5, 0.7, 0]; c.emberC = [1, 1, 1, 0.1]; c.ash = [0.1, 0.2, 0.8, 0.2]; },
  post(p, lt) { gradeHell(p); p.bloom = [0.4, 0.22, 0.5, 0]; p.bars[3] = E.ioS(ramp(lt, 1.85, 2.43)); } });

// ===================================================================================== GLOBAL CUES
const FLASHES = [
  { t: B(0), a: 1.1, d: 0.10, c: [1, 0.85, 0.7] },
  { t: B(1), a: 0.15, d: 0.15, c: [0.7, 0.8, 1] },
  { t: B(4), a: 0.35, d: 0.2, c: [1, 0.5, 0.2] },
  { t: B(4, 1.5), a: 0.25, d: 0.12, c: [1, 0.5, 0.2] },
  { t: B(5), a: 0.3, d: 0.1, c: [0.8, 0.85, 1] }, { t: B(5, 1), a: 0.35, d: 0.1, c: [1, 0.6, 0.3] },
  { t: B(5, 2), a: 0.3, d: 0.1, c: [0.8, 0.85, 1] }, { t: B(5, 3), a: 0.3, d: 0.1, c: [0.8, 0.85, 1] },
  { t: B(6), a: 0.6, d: 0.09, c: [1, 0.3, 0.15] },
  { t: B(7), a: 0.7, d: 0.18, c: [1, 0.6, 0.3] },
  { t: B(8), a: 1.4, d: 0.11, c: [1, 0.9, 0.8] },
  { t: B(10), a: 0.45, d: 0.12, c: [0.7, 0.85, 1] },
  { t: B(11), a: 0.2, d: 0.1, c: [1, 0.6, 0.3] },
  { t: B(12), a: 0.3, d: 0.12, c: [1, 0.5, 0.2] },
  { t: B(13), a: 0.4, d: 0.08, c: [1, 0.85, 0.6] },
  { t: B(13, 1), a: 0.35, d: 0.08, c: [1, 0.6, 0.3] }, { t: B(13, 2), a: 0.35, d: 0.08, c: [0.7, 0.85, 1] }, { t: B(13, 3), a: 0.35, d: 0.08, c: [0.8, 0.85, 1] },
  ...[0, 1, 2, 3, 4, 5, 6, 7].map(i => ({ t: B(14, i * 0.5), a: 0.25, d: 0.05, c: [1, 0.8, 0.6] })),
  { t: B(15), a: 0.7, d: 0.08, c: [1, 0.6, 0.3] }, { t: B(15, 1), a: 0.6, d: 0.08, c: [1, 0.6, 0.3] }, { t: B(15, 2), a: 0.7, d: 0.08, c: [1, 0.6, 0.3] },
  ...[0, 1, 2, 3].map(i => ({ t: B(15, 3 + i * 0.25), a: 0.5, d: 0.05, c: [1, 0.85, 0.7] })),
  { t: FINAL, a: 1.8, d: 0.09, c: [1, 0.92, 0.85] },
].map(f => Object.assign(f, { t: TL.q(f.t) }));
const KICKS = [B(0), B(1), B(4), B(4, 1.5), B(4, 2.5), B(6), B(7), B(8), B(10), B(11), B(12), B(12, 2), B(13), B(15), B(15, 1), B(15, 2), FINAL].map(TL.q);

TL.cues.push((st, t) => {
  // camera shake: per-shot base, driven by the drums, kicked on accents
  const shot = TL.shots[TL.shotAt(t)];
  const au = audioAt(t);
  const kick = pulses(t, KICKS, 0.18);
  const amp = (shot.shake || 0) * (0.35 + 0.9 * au.low) + kick * 1.4;
  const f = 11;
  st.comp.shake = [vnoise(t * f) * amp * 0.0055, vnoise(t * f + 37) * amp * 0.0055, vnoise(t * 6 + 91) * amp * 0.004, 1.0 + amp * 0.012 + kick * 0.02];
  // flashes
  let fl = [0, 0, 0], a = 0;
  for (const F of FLASHES) { const p = pulse(t, F.t, F.d) * F.a; if (p > 0.001) { fl = fl.map((v, i) => v + F.c[i] * p); a += p; } }
  if (a > 0) st.comp.flash = [...fl.map(v => v / a), Math.min(a, 4)];
  // chromatic aberration breathes with hits
  st.post.lens[0] = 0.0028 + 0.012 * kick + 0.004 * au.high * 0.5;
  // letterbox: closed until the first boom, then bursts open; squeezes before the abyss and before the title
  let bars = 0.256;
  if (t < B(0)) bars = 1.0;
  else bars = lerp(1.0, 0.256, E.outE(ramp(t, B(0), B(0) + 0.7)));
  bars += 0.10 * E.inC(ramp(t, B(7, 2.6), B(8) - 0.02)) * (t < B(8) ? 1 : 0);
  bars -= 0.06 * pulses(t, [B(15), B(15, 1), B(15, 2)], 0.2);
  if (t > B(15, 3) && t < FINAL) bars = lerp(0.256, 0.985, E.inE(ramp(t, B(15, 3), FINAL - 0.02)));
  if (t >= FINAL) bars = lerp(0.985, 0.256, E.outE(ramp(t, FINAL, FINAL + 0.55)));
  st.post.bars[0] = bars;
  st.post.bars[1] = (t < B(0) + 1.0 ? 2.5 * pulse(t, B(0), 0.28) : 0) + (t > B(15, 3) ? 2.0 * ramp(t, B(15, 3), FINAL) * (t < FINAL ? 1 : 0) + 2.5 * pulse(t, FINAL, 0.4) : 0);
  // opening hairline grows with the swell
  if (t < B(0) + 0.05) st.post.line = [E.inC(ramp(t, 0.18, B(0))) * 1.15, 1.6 * E.inQ(ramp(t, 0.15, B(0))), 1.2, 0];
});
