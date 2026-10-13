// Procedural sound: every effect is synthesised with Web Audio nodes (no samples). The same recipes render into an
// OfflineAudioContext for recorded gameplay videos.
export class Sound {
  constructor() { this.ctx = null; this.A = null; this.log = null; this.clock = () => 0; this.muted = false; }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.A = buildGraph(this.ctx, this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  play(name, o = {}) {
    if (this.log) this.log.push({ t: this.clock(), name, o: JSON.parse(JSON.stringify(o)) });
    if (!this.A || this.muted || !RECIPES[name]) return;
    RECIPES[name](this.A, this.ctx.currentTime + 0.005 + (o.delay || 0), o);
  }

  setMusic(level) { if (this.A) this.A.setMusic(level, this.ctx.currentTime); if (this.log) this.log.push({ t: this.clock(), name: '@music', o: { level } }); }
  startAmbience() {
    if (this.log && !this.log.some(e => e.name === '@ambience')) this.log.push({ t: this.clock(), name: '@ambience', o: {} });
    if (this.A && !this.A.amb) this.A.amb = startAmbience(this.A, this.ctx.currentTime);
  }
}

// Re-synthesise a logged session (recorded gameplay) into a stereo buffer; returns 16-bit PCM WAV bytes.
export async function renderOffline(log, duration, sr = 44100) {
  const ctx = new OfflineAudioContext(2, Math.ceil(duration * sr), sr);
  const A = buildGraph(ctx, ctx.destination);
  log = log.map(e => ({ ...e, t: Math.max(0, e.t) }));
  const lv = log.filter(e => e.name === '@music');
  for (const e of log) {
    if (e.t > duration) continue;
    if (e.name === '@ambience') startAmbience(A, e.t);
    else if (RECIPES[e.name]) RECIPES[e.name](A, e.t + 0.005 + (e.o.delay || 0), e.o);
  }
  if (lv.length) {
    const levelAt = t => { let l = 0; for (const e of lv) { if (e.t <= t) l = e.o.level; else break; } return l; };
    for (const e of lv) A.music.gain.setTargetAtTime(e.o.level * 0.55, e.t, 0.8);
    startDrums(A, lv[0].t, levelAt, duration);
  }
  const buf = await ctx.startRendering();
  const n = buf.length, L = buf.getChannelData(0), R = buf.getChannelData(1);
  const out = new DataView(new ArrayBuffer(44 + n * 4));
  const w = (o, str) => { for (let i = 0; i < str.length; i++) out.setUint8(o + i, str.charCodeAt(i)); };
  w(0, 'RIFF'); out.setUint32(4, 36 + n * 4, true); w(8, 'WAVE'); w(12, 'fmt '); out.setUint32(16, 16, true);
  out.setUint16(20, 1, true); out.setUint16(22, 2, true); out.setUint32(24, sr, true); out.setUint32(28, sr * 4, true);
  out.setUint16(32, 4, true); out.setUint16(34, 16, true); w(36, 'data'); out.setUint32(40, n * 4, true);
  for (let i = 0, o = 44; i < n; i++, o += 4) {
    out.setInt16(o, Math.max(-1, Math.min(1, L[i])) * 32767, true); out.setInt16(o + 2, Math.max(-1, Math.min(1, R[i])) * 32767, true);
  }
  return new Uint8Array(out.buffer);
}

export function buildGraph(ctx, destination) {
  const master = ctx.createGain(); master.gain.value = 0.9;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.25;
  master.connect(comp); comp.connect(destination);
  const sfx = ctx.createGain(); sfx.gain.value = 0.85; sfx.connect(master);
  const verb = ctx.createConvolver(); verb.buffer = impulse(ctx, 3.2, 2.6);
  const verbIn = ctx.createGain(); verbIn.gain.value = 1; verbIn.connect(verb);
  const verbOut = ctx.createGain(); verbOut.gain.value = 0.55; verb.connect(verbOut); verbOut.connect(master);
  const music = ctx.createGain(); music.gain.value = 0; music.connect(master);
  const musicVerb = ctx.createGain(); musicVerb.gain.value = 0.35; music.connect(musicVerb); musicVerb.connect(verbIn);
  const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const nd = noise.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  const shaper = (k) => { const c = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; c[i] = Math.tanh(x * k) / Math.tanh(k); } return c; };
  const A = { ctx, out: sfx, verb: verbIn, music, noise, curves: { soft: shaper(2.2), hard: shaper(6) }, amb: null, musicLevel: 0 };
  A.setMusic = (level, t) => { A.musicLevel = level; music.gain.cancelScheduledValues(t); music.gain.setTargetAtTime(level * 0.55, t, 0.8); if (level > 0 && !A.drums) A.drums = startDrums(A, t); };
  return A;
}

function impulse(ctx, dur, decay) {
  const n = Math.floor(ctx.sampleRate * dur), b = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay); }
  return b;
}

// --- building blocks ----------------------------------------------------------------------------
function gainEnv(A, t, { attack = 0.005, dur = 0.3, peak = 1, curve = 'exp' } = {}) {
  const g = A.ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  if (curve === 'exp') g.gain.exponentialRampToValueAtTime(0.0001, t + attack + dur);
  else g.gain.linearRampToValueAtTime(0.0001, t + attack + dur);
  return g;
}
function route(A, node, { dry = 1, wet = 0, dist = null } = {}) {
  let n = node;
  if (dist) { const ws = A.ctx.createWaveShaper(); ws.curve = A.curves[dist]; n.connect(ws); n = ws; }
  if (dry) { const g = A.ctx.createGain(); g.gain.value = dry; n.connect(g); g.connect(A.out); }
  if (wet) { const g = A.ctx.createGain(); g.gain.value = wet; n.connect(g); g.connect(A.verb); }
}
function tone(A, t, { type = 'sine', f0 = 220, f1 = null, dur = 0.3, gain = 0.5, attack = 0.005, glide = null, dry = 1, wet = 0, dist = null, curve = 'exp', detune = 0 }) {
  const o = A.ctx.createOscillator(); o.type = type; o.detune.value = detune;
  o.frequency.setValueAtTime(f0, t);
  if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + (glide || dur));
  const g = gainEnv(A, t, { attack, dur, peak: gain, curve });
  o.connect(g); route(A, g, { dry, wet, dist });
  o.start(t); o.stop(t + attack + dur + 0.05);
  return o;
}
function burst(A, t, { dur = 0.3, gain = 0.5, attack = 0.004, type = 'lowpass', f0 = 1000, f1 = null, q = 0.7, dry = 1, wet = 0, dist = null, curve = 'exp', rate = 1 }) {
  const s = A.ctx.createBufferSource(); s.buffer = A.noise; s.playbackRate.value = rate;
  const f = A.ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  if (f1) f.frequency.exponentialRampToValueAtTime(Math.max(f1, 20), t + attack + dur);
  const g = gainEnv(A, t, { attack, dur, peak: gain, curve });
  s.connect(f); f.connect(g); route(A, g, { dry, wet, dist });
  s.start(t, Math.random() * 1.5); s.stop(t + attack + dur + 0.05);
  return f;
}
function roar(A, t, { dur = 2.2, pitch = 1, gain = 0.7, fall = 0.85 }) {
  const ctx = A.ctx, out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, t); out.gain.linearRampToValueAtTime(gain, t + 0.18);
  out.gain.setValueAtTime(gain, t + dur * 0.6); out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const mix = ctx.createGain(); mix.gain.value = 0.5;
  const lfo = ctx.createOscillator(); lfo.frequency.value = 6.5; const lg = ctx.createGain(); lg.gain.value = 4 * pitch; lfo.connect(lg);
  for (const [f, ty] of [[58, 'sawtooth'], [87, 'sawtooth'], [116.5, 'square']]) {
    const o = ctx.createOscillator(); o.type = ty;
    o.frequency.setValueAtTime(f * pitch * 0.8, t); o.frequency.linearRampToValueAtTime(f * pitch, t + 0.3); o.frequency.linearRampToValueAtTime(f * pitch * fall, t + dur);
    lg.connect(o.frequency); o.connect(mix); o.start(t); o.stop(t + dur + 0.1);
  }
  lfo.start(t); lfo.stop(t + dur + 0.1);
  const n = ctx.createBufferSource(); n.buffer = A.noise; const ng = ctx.createGain(); ng.gain.value = 0.6; n.connect(ng); ng.connect(mix); n.start(t); n.stop(t + dur + 0.1);
  for (const [f0, f1, f2, q, g] of [[300, 640, 420, 5, 1], [900, 1300, 800, 6, 0.6], [2400, 2700, 2000, 8, 0.25]]) {
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = q;
    bp.frequency.setValueAtTime(f0, t); bp.frequency.linearRampToValueAtTime(f1, t + dur * 0.35); bp.frequency.linearRampToValueAtTime(f2, t + dur);
    const bg = ctx.createGain(); bg.gain.value = g; mix.connect(bp); bp.connect(bg); bg.connect(out);
  }
  route(A, out, { dry: 1, wet: 0.7, dist: 'hard' });
}
function boom(A, t, k = 1) {
  tone(A, t, { f0: 62, f1: 26, dur: 1.1 * k, gain: 1.1 * Math.min(k, 1.3), glide: 0.9 * k, wet: 0.4 });
  burst(A, t, { type: 'lowpass', f0: 700, f1: 90, dur: 0.9 * k, gain: 0.9 * Math.min(k, 1.3), wet: 0.5, dist: 'soft' });
  burst(A, t + 0.03, { type: 'highpass', f0: 2500, dur: 0.35, gain: 0.12 * k, rate: 0.7 });
  for (let i = 0; i < 5; i++) burst(A, t + 0.12 + Math.random() * 0.5 * k, { type: 'bandpass', f0: 1200 + Math.random() * 2000, q: 2, dur: 0.06, gain: 0.08 * k });
}

export const RECIPES = {
  swing: (A, t) => burst(A, t, { type: 'bandpass', f0: 700, f1: 2600, q: 1.4, attack: 0.05, dur: 0.16, gain: 0.32, curve: 'lin' }),
  swingHeavy: (A, t) => { burst(A, t, { type: 'bandpass', f0: 300, f1: 1500, q: 1.1, attack: 0.08, dur: 0.26, gain: 0.45, curve: 'lin' }); tone(A, t + 0.02, { f0: 90, f1: 60, dur: 0.25, gain: 0.15 }); },
  hit: (A, t, o) => {
    const k = o.heavy ? 1.4 : 1;
    burst(A, t, { type: 'lowpass', f0: 3500, f1: 600, dur: 0.13 * k, gain: 0.8, dist: 'soft', wet: 0.2 });
    tone(A, t, { f0: 150 * (o.heavy ? 0.8 : 1), f1: 55, dur: 0.22 * k, gain: 0.9, dist: 'soft' });
    tone(A, t, { type: 'triangle', f0: 760, f1: 640, dur: 0.12, gain: 0.12, wet: 0.3 });
    tone(A, t, { type: 'square', f0: 1320, f1: 980, dur: 0.05, gain: 0.04 });
  },
  hurt: (A, t, o) => { tone(A, t, { f0: 95, f1: 42, dur: 0.32, gain: 0.95, dist: 'soft' }); burst(A, t, { type: 'lowpass', f0: 900, f1: 200, dur: 0.25, gain: 0.55 }); if (o.kd) burst(A, t + 0.35, { type: 'lowpass', f0: 500, dur: 0.25, gain: 0.5 }); },
  roll: (A, t) => { burst(A, t, { type: 'bandpass', f0: 520, f1: 260, q: 0.9, attack: 0.03, dur: 0.32, gain: 0.22, curve: 'lin' }); tone(A, t + 0.38, { f0: 70, f1: 45, dur: 0.12, gain: 0.25 }); },
  heal: (A, t) => { [523.3, 659.3, 784, 1046.5].forEach((f, i) => tone(A, t + 0.06 * i, { f0: f, dur: 1.1, gain: 0.09, attack: 0.02, wet: 0.8 })); burst(A, t, { type: 'highpass', f0: 4000, dur: 0.6, gain: 0.04, wet: 0.6 }); },
  bossSwing: (A, t, o) => burst(A, t, { type: 'lowpass', f0: 220, f1: 1300, q: 1.6, attack: 0.12, dur: (o.dur || 0.35) + 0.2, gain: 0.6, curve: 'lin', wet: 0.2 }),
  slam: (A, t) => boom(A, t, 1.0),
  stomp: (A, t) => boom(A, t, 0.8),
  thud: (A, t, o) => { const k = o.k || 1; tone(A, t, { f0: 110, f1: 48, dur: 0.14, gain: 0.3 * k }); burst(A, t, { type: 'lowpass', f0: 700, f1: 150, dur: 0.12, gain: 0.22 * k }); },
  step: (A, t, o) => { const k = o.k || 1; tone(A, t, { f0: 52, f1: 30, dur: 0.32, gain: 0.45 * k }); burst(A, t, { type: 'lowpass', f0: 380, f1: 120, dur: 0.22, gain: 0.3 * k }); },
  roar: (A, t, o) => roar(A, t, { dur: o.dur || 2.2, pitch: o.pitch || 1, gain: o.gain || 0.75 }),
  windup: (A, t) => burst(A, t, { type: 'bandpass', f0: 180, f1: 420, q: 3, attack: 0.25, dur: 0.4, gain: 0.25, curve: 'lin', wet: 0.4 }),
  lavaWarn: (A, t) => { burst(A, t, { type: 'highpass', f0: 1200, f1: 3500, attack: 0.6, dur: 0.5, gain: 0.1, curve: 'lin', wet: 0.3 }); tone(A, t, { f0: 70, f1: 110, attack: 0.8, dur: 0.4, gain: 0.25, curve: 'lin' }); },
  lavaErupt: (A, t) => { boom(A, t, 0.55); for (let i = 0; i < 6; i++) tone(A, t + 0.1 + i * 0.09 + Math.random() * 0.05, { f0: 120 + Math.random() * 120, f1: 50, dur: 0.12, gain: 0.25 }); },
  novaCharge: (A, t, o) => {
    const d = o.dur || 1.5;
    tone(A, t, { type: 'sawtooth', f0: 70, f1: 260, glide: d, attack: d * 0.9, dur: 0.15, gain: 0.22, curve: 'lin', dist: 'soft', wet: 0.5 });
    burst(A, t, { type: 'bandpass', f0: 200, f1: 3000, q: 2, attack: d * 0.95, dur: 0.1, gain: 0.35, curve: 'lin', wet: 0.4 });
  },
  novaBlast: (A, t) => { boom(A, t, 1.6); burst(A, t, { type: 'lowpass', f0: 1800, f1: 100, attack: 0.02, dur: 2.4, gain: 0.6, wet: 0.8 }); },
  stagger: (A, t) => { tone(A, t, { f0: 75, f1: 33, dur: 0.7, gain: 0.9, dist: 'soft' }); burst(A, t, { type: 'highpass', f0: 2800, dur: 0.09, gain: 0.45 }); burst(A, t + 0.4, { type: 'lowpass', f0: 600, f1: 120, dur: 0.5, gain: 0.6, wet: 0.4 }); },
  bossDeath: (A, t) => { roar(A, t, { dur: 3.6, pitch: 0.8, gain: 0.8, fall: 0.45 }); boom(A, t + 2.6, 1.5); },
  victory: (A, t) => { [220, 277.2, 329.6, 440, 554.4].forEach((f, i) => tone(A, t + i * 0.12, { type: i % 2 ? 'triangle' : 'sine', f0: f, attack: 1.2, dur: 4.5, gain: 0.08, wet: 0.9 })); },
  defeat: (A, t) => { boom(A, t, 0.9); [110, 130.8, 164.8, 98].forEach((f, i) => tone(A, t + 0.3 + i * 0.2, { type: 'triangle', f0: f, attack: 1.4, dur: 4, gain: 0.09, wet: 0.9 })); },
  ui: (A, t) => tone(A, t, { f0: 660, f1: 880, dur: 0.12, gain: 0.08, wet: 0.3 }),
  begin: (A, t) => { tone(A, t, { f0: 110, f1: 220, glide: 0.8, attack: 0.3, dur: 1.5, gain: 0.2, wet: 0.8 }); boom(A, t + 0.2, 0.6); },
  rumble: (A, t, o) => burst(A, t, { type: 'lowpass', f0: 160, f1: 60, attack: 0.6, dur: o.dur || 2.5, gain: 0.7, curve: 'lin', wet: 0.4, dist: 'soft' }),
};

// low drone + distant fire crackle, runs forever
function startAmbience(A, t) {
  const ctx = A.ctx, g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.32, t + 3); g.connect(A.out);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220; lp.Q.value = 0.8; lp.connect(g);
  for (const [f, d] of [[41.2, -6], [41.2, 7], [61.7, 0], [82.4, 3]]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = d; const og = ctx.createGain(); og.gain.value = 0.18; o.connect(og); og.connect(lp); o.start(t); }
  const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07; const lg = ctx.createGain(); lg.gain.value = 90; lfo.connect(lg); lg.connect(lp.frequency); lfo.start(t);
  const n = ctx.createBufferSource(); n.buffer = A.noise; n.loop = true;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 0.6;
  const cg = ctx.createGain(); cg.gain.value = 0.05; n.connect(bp); bp.connect(cg); cg.connect(A.out); n.start(t);
  const crack = ctx.createBufferSource(); crack.buffer = A.noise; crack.loop = true; crack.playbackRate.value = 0.5;
  const cf = ctx.createBiquadFilter(); cf.type = 'lowpass'; cf.frequency.value = 500; const cg2 = ctx.createGain(); cg2.gain.value = 0.12;
  crack.connect(cf); cf.connect(cg2); cg2.connect(A.out); crack.start(t);
  return { g };
}

// tribal combat percussion at 135 BPM (the trailer's tempo). Real time: a lookahead loop reading A.musicLevel.
// Offline: pass levelAt(t) and an end time and the whole pattern is scheduled at once.
export function startDrums(A, t0, levelAt = null, until = undefined) {
  const ctx = A.ctx, beat = 60 / 135;
  const hit = (t, f0, f1, g, d) => {
    const o = ctx.createOscillator(); o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + d);
    const e = ctx.createGain(); e.gain.setValueAtTime(0.0001, t); e.gain.linearRampToValueAtTime(g, t + 0.004); e.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(e); e.connect(A.music); o.start(t); o.stop(t + d + 0.05);
  };
  const noiseHit = (t, f, g, d) => {
    const s = ctx.createBufferSource(); s.buffer = A.noise; const fl = ctx.createBiquadFilter(); fl.type = 'bandpass'; fl.frequency.value = f; fl.Q.value = 1.2;
    const e = ctx.createGain(); e.gain.setValueAtTime(0.0001, t); e.gain.linearRampToValueAtTime(g, t + 0.003); e.gain.exponentialRampToValueAtTime(0.0001, t + d);
    s.connect(fl); fl.connect(e); e.connect(A.music); s.start(t, Math.random()); s.stop(t + d + 0.05);
  };
  // 2-bar pattern in 16ths: K = taiko low, T = mid tom, S = rim/noise
  const K = [0, 3, 6, 8, 11, 14, 16, 19, 22, 24, 27, 30], T = [10, 13, 26, 28, 29, 31], S = [4, 12, 20, 28];
  let next = t0, step = 0;
  const sched = { stop: false };
  const pump = () => {
    if (sched.stop) return;
    const horizon = until !== undefined ? until : ctx.currentTime + 0.25;
    while (next < horizon) {
      const s = step % 32, lv = levelAt ? levelAt(next) : A.musicLevel;
      if (lv > 0) {
        if (K.includes(s)) hit(next, 95, 42, 0.9, 0.42);
        if (lv > 0.55 && T.includes(s)) hit(next, 180, 120, 0.45, 0.22);
        if (S.includes(s)) noiseHit(next, 2600, 0.12 + 0.1 * lv, 0.08);
        if (lv > 0.8 && s % 2 === 1) noiseHit(next, 6000, 0.035, 0.03);
      }
      next += beat / 4; step++;
    }
    if (until === undefined) setTimeout(pump, 60);
  };
  pump();
  return sched;
}
