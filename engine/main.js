// Frame renderer: evaluates the timeline at t, renders scene(s), composites, post-processes.
'use strict';

const SCENES = {};       // filled by scenes/*.js : SCENES[name] = { frag, init?() }
const R = {};            // runtime state

function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

async function init(opts = {}) {
  const scale = opts.scale || 1;
  const W = Math.round(1920 * scale), H = Math.round(1080 * scale);
  const canvas = document.getElementById('out');
  canvas.width = W; canvas.height = H;
  const gl = GLX.init(canvas);
  R.W = W; R.H = H; R.scale = scale; R.gl = gl;

  // fonts must be ready before any text is rasterised
  const faces = ['400 40px Cinzel', '700 40px Cinzel', '900 40px Cinzel', 'italic 400 40px "Cormorant Garamond"',
    '500 40px "Cormorant Garamond"', '400 40px "IM Fell English SC"', '700 40px "Cinzel Decorative"', '900 40px "Cinzel Decorative"'];
  await Promise.all(faces.map(f => document.fonts.load(f, 'ABCabc')));

  R.txtCanvas = makeCanvas(W, H); R.txt = R.txtCanvas.getContext('2d');
  R.gfxCanvas = makeCanvas(W, H); R.gfx = R.gfxCanvas.getContext('2d');
  R.txtTex = GLX.texture(R.txtCanvas); R.gfxTex = GLX.texture(R.gfxCanvas);

  const P = {};
  for (const [k, src] of Object.entries(POST)) P[k] = GLX.program(k, src);
  R.post = P;
  R.sceneProg = {};
  for (const [name, sc] of Object.entries(SCENES)) {
    R.sceneProg[name] = GLX.program('scene_' + name, GLSL_HEAD + GLSL_LIB + (sc.uniforms || '') + sc.frag);
    if (sc.init) sc.init(R);
  }

  R.sceneA = GLX.target(W, H); R.sceneB = GLX.target(W, H); R.mix = GLX.target(W, H);
  R.rays = GLX.target(W >> 1, H >> 1);
  R.comp = GLX.target(W, H); R.acc = GLX.target(W, H);
  R.bloom = [];
  let bw = W >> 1, bh = H >> 1;
  for (let i = 0; i < 6; i++) { R.bloom.push(GLX.target(Math.max(bw, 2), Math.max(bh, 2))); bw >>= 1; bh >>= 1; }
  R.streakA = GLX.target(W >> 2, H >> 2); R.streakB = GLX.target(W >> 2, H >> 2);
  return { W, H, float: GLX.floatOK };
}

function renderScene(shot, target, t) {
  const prog = R.sceneProg[shot.scene];
  if (!prog) throw new Error('unknown scene ' + shot.scene);
  const sc = SCENES[shot.scene];
  const tex = sc.textures ? sc.textures(R, shot) : {};
  GLX.pass(prog, target, {
    uRes: [target.w, target.h], uTime: t, uLT: shot.lt, uP: shot.P,
    uLow: shot.audio.low, uHigh: shot.audio.high, uLvl: shot.audio.lvl,
  }, tex);
}

function drawLayers(st) {
  for (const [ctx, fn, tex, cvs] of [[R.txt, st.drawText, R.txtTex, R.txtCanvas], [R.gfx, st.drawGfx, R.gfxTex, R.gfxCanvas]]) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, R.W, R.H);
    ctx.setTransform(R.scale, 0, 0, R.scale, 0, 0);
    if (fn) fn(ctx);
    GLX.updateTexture(tex, cvs);
  }
}

function compositeAt(t, target) {
  const st = TL.evaluate(t);
  renderScene(st.shot, R.sceneA, t);
  let src = R.sceneA;
  if (st.shotB) {
    renderScene(st.shotB, R.sceneB, t);
    GLX.pass(R.post.transition, R.mix, { uRes: [R.W, R.H], uTime: t, uType: st.trans.type, uProg: st.trans.prog, uTP: st.trans.p || [0, 0, 0, 0] },
      { uA: R.sceneA.tex, uB: R.sceneB.tex });
    src = R.mix;
  }
  const ry = st.rays;
  if (ry && ry.amt > 0) {
    GLX.pass(R.post.rays, R.rays, { uRes: [R.rays.w, R.rays.h], uTime: t, uLight: ry.light, uRayP: [ry.thresh, ry.decay, ry.len, 0] }, { uScene: src.tex });
  }
  drawLayers(st);
  const c = st.comp;
  GLX.pass(R.post.composite, target, {
    uRes: [R.W, R.H], uTime: t,
    uShake: c.shake, uZoomBlur: c.zoomBlur, uRaysCol: ry && ry.col ? ry.col : [0, 0, 0], uRaysAmt: ry && ry.amt ? ry.amt : 0,
    uEmber: c.ember, uEmberC: c.emberC, uAsh: c.ash, uDust: c.dust, uPartC: c.partC,
    uTxtFx: c.txtFx, uTxtFx2: c.txtFx2, uGfxFx: c.gfxFx, uFlash: c.flash, uExposure: c.exposure,
  }, { uScene: src.tex, uRays: R.rays.tex, uGfx: R.gfxTex, uTxt: R.txtTex });
  return st;
}

function renderFrame(t, opts = {}) {
  const gl = R.gl;
  const sub = opts.sub || TL.motionSamples(t);
  const shutter = (opts.shutter || 0.5) / (opts.fps || 30);
  let st, src;
  if (sub <= 1) { st = compositeAt(t, R.comp); src = R.comp; }
  else {
    gl.bindFramebuffer(gl.FRAMEBUFFER, R.acc.fb); gl.viewport(0, 0, R.W, R.H);
    gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    const si = TL.shotAt(t), s0 = TL.shots[si].t0, s1 = si + 1 < TL.shots.length ? TL.shots[si + 1].t0 : 1e9;
    for (let i = 0; i < sub; i++) {
      const ts = Math.min(Math.max(t + ((i + 0.5) / sub - 0.5) * shutter, s0), s1 - 1e-4);   // never blur across a cut
      st = compositeAt(ts, R.comp);
      GLX.pass(R.post.copy, R.acc, { uRes: [R.W, R.H], uGain: 1 / sub }, { uTex: R.comp.tex }, 'add');
    }
    src = R.acc;
    st = TL.evaluate(t);         // post params + over-bar text at the centre of the shutter
    drawLayers(st);
  }
  const pp = st.post;
  // bloom chain
  const b = R.bloom;
  GLX.pass(R.post.bloomPre, b[0], { uRes: [b[0].w, b[0].h], uTexel: [1 / R.W, 1 / R.H], uThresh: pp.bloomThresh }, { uTex: src.tex });
  for (let i = 1; i < b.length; i++) GLX.pass(R.post.down, b[i], { uRes: [b[i].w, b[i].h], uTexel: [1 / b[i - 1].w, 1 / b[i - 1].h] }, { uTex: b[i - 1].tex });
  for (let i = b.length - 1; i > 0; i--) GLX.pass(R.post.up, b[i - 1], { uRes: [b[i - 1].w, b[i - 1].h], uTexel: [1 / b[i].w, 1 / b[i].h], uGain: 1.0 }, { uTex: b[i].tex }, 'add');
  // anamorphic streak from the quarter-res level
  GLX.pass(R.post.streak, R.streakA, { uRes: [R.streakA.w, R.streakA.h], uTexel: [1 / b[1].w, 1 / b[1].h], uStride: 2.0 }, { uTex: b[1].tex });
  GLX.pass(R.post.streak, R.streakB, { uRes: [R.streakB.w, R.streakB.h], uTexel: [1 / R.streakA.w, 1 / R.streakA.h], uStride: 6.0 }, { uTex: R.streakA.tex });
  GLX.pass(R.post.final, null, {
    uRes: [R.W, R.H], uTime: t,
    uBloomP: pp.bloom, uGrade: pp.grade, uLift: pp.lift, uGain: pp.gain, uLens: pp.lens, uBars: pp.bars, uTint: pp.tint, uLine: pp.line,
  }, { uComp: src.tex, uBloom: b[0].tex, uStreak: R.streakB.tex, uTxt: R.txtTex });
  return true;
}

function grab(type = 'image/png', q = 0.95) {
  return document.getElementById('out').toDataURL(type, q);
}
