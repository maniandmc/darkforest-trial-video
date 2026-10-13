// Timeline: music grid, shots, transitions, post cues. Everything is a pure function of t.
'use strict';

const BPM = 135, BEAT = 60 / BPM, BAR = BEAT * 4;
const D0 = 0.30 + BEAT / 2;                 // first true downbeat (the opening boom)
const bar = (n, b = 0) => D0 + n * BAR + b * BEAT;
const FINAL = bar(16);                      // 28.967 s — last hit, title

const clamp01 = x => Math.max(0, Math.min(1, x));
const lerp = (a, b, x) => a + (b - a) * x;
const mixv = (a, b, x) => a.map((v, i) => lerp(v, b[i], x));
const ramp = (t, a, b) => clamp01((t - a) / (b - a));
const E = {
  lin: x => x,
  inQ: x => x * x, outQ: x => 1 - (1 - x) * (1 - x),
  inC: x => x * x * x, outC: x => 1 - Math.pow(1 - x, 3), ioC: x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2,
  outE: x => x >= 1 ? 1 : 1 - Math.pow(2, -10 * x), inE: x => x <= 0 ? 0 : Math.pow(2, 10 * x - 10),
  ioE: x => x <= 0 ? 0 : x >= 1 ? 1 : x < .5 ? Math.pow(2, 20 * x - 10) / 2 : (2 - Math.pow(2, -20 * x + 10)) / 2,
  outBack: x => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); },
  ioS: x => x * x * (3 - 2 * x),
};
// decaying pulse after an event time
const pulse = (t, at, decay = 0.25) => t < at ? 0 : Math.exp(-(t - at) / decay);
const pulses = (t, ats, decay) => ats.reduce((m, a) => Math.max(m, pulse(t, a, decay)), 0);
// smooth 1D noise for camera shake
function vnoise(x) { const i = Math.floor(x), f = x - i; const h = n => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }; const u = f * f * (3 - 2 * f); return lerp(h(i), h(i + 1), u) * 2 - 1; }

function audioAt(t) {
  const A = window.AUDIO; const i = Math.max(0, Math.min(A.low.length - 1, Math.round(t * A.fps)));
  return { low: A.low[i], high: A.high[i], lvl: A.lvl[i] };
}

const TL = { duration: 31.4, shots: [], cues: [], texts: [], gfx: [] };

// ----------------------------------------------------------------------------------------- defaults
TL.defaultComp = () => ({
  shake: [0, 0, 0, 1], zoomBlur: [0.5, 0.5, 0, 0],
  ember: [0, 0.6, 1, 0], emberC: [1, 1, 1, 0], ash: [0, 0.3, 1, 0.1], dust: [0, 0.2, 1, 1], partC: [0.5, 0.5],
  txtFx: [1, 0, 0, 0], txtFx2: [0, 0, 1, 0], gfxFx: [1, 0, 0, 0], flash: [1, 1, 1, 0], exposure: 1,
});
TL.defaultPost = () => ({
  bloomThresh: 0.9, bloom: [0.55, 0.25, 0.6, 0],
  grade: [1.0, 0.35, 0.9, 0.0], lift: [0.55, 0.75, 0.9, 0.35], gain: [1.0, 0.82, 0.62, 0.25],
  lens: [0.0035, 0.55, 0.06, 0.03], bars: [0.256, 0, 0, 0], tint: [1, 1, 1, 0], line: [0, 0, 1.5, 0],
});

// ----------------------------------------------------------------------------------------- evaluate
TL.shotAt = function (t) {
  const s = TL.shots;
  for (let i = s.length - 1; i >= 0; i--) if (t >= s[i].t0) return i;
  return 0;
};
TL.instShot = function (shot, t) {
  const lt = t - shot.t0;
  const sc = SCENES[shot.scene];
  const P = new Float32Array(48);
  P.set(sc.pack(shot.params(lt, t)).slice(0, 48));
  return { scene: shot.scene, lt, P, audio: audioAt(t), shot, dof: shot.dof ? shot.dof(lt, t) : null };
};
TL.evaluate = function (t) {
  const idx = TL.shotAt(t);
  const shot = TL.shots[idx];
  const lt = t - shot.t0;
  const st = { t, comp: TL.defaultComp(), post: TL.defaultPost(), rays: null };
  const tin = shot.tin;
  if (tin && lt < tin.dur && idx > 0) {
    st.shot = TL.instShot(TL.shots[idx - 1], t);
    st.shotB = TL.instShot(shot, t);
    st.trans = { type: tin.type, prog: tin.ease ? tin.ease(lt / tin.dur) : lt / tin.dur, p: tin.p };
  } else st.shot = TL.instShot(shot, t);
  if (shot.rays) st.rays = shot.rays(lt, t);
  if (shot.vm) { const v = new Float32Array(48); v.set(VM.pack(shot.vm(lt, t))); st.vm = v; }
  if (shot.comp) shot.comp(st.comp, lt, t);
  if (shot.post) shot.post(st.post, lt, t);
  for (const cue of TL.cues) cue(st, t);
  const texts = TL.texts.filter(c => t >= c.t0 && t < c.t1);
  const gfx = TL.gfx.filter(c => t >= c.t0 && t < c.t1);
  for (const c of texts) if (c.fx) c.fx(st, t - c.t0, t);
  st.drawText = ctx => { for (const c of texts) c.draw(ctx, t - c.t0, t); };
  st.drawGfx = ctx => { for (const c of gfx) c.draw(ctx, t - c.t0, t); };
  return st;
};
TL.motionSamples = function (t) {
  const s = TL.shots[TL.shotAt(t)];
  return s.mb ? (typeof s.mb === 'function' ? s.mb(t - s.t0, t) : s.mb) : 1;
};
// snap event times to the video frame at (or within 1/3 frame before) the musical event
TL.fps = 30;
TL.q = t => Math.floor(t * TL.fps + 0.34) / TL.fps;
TL.add = shot => { shot.t0 = TL.q(shot.t0); TL.shots.push(shot); TL.shots.sort((a, b) => a.t0 - b.t0); return shot; };
