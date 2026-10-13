// Typography + graphic language: per-letter animation, rules, the nine-rings sigil.
'use strict';

const COL = {
  bone: '#ece5d6', boneDim: '#b9b2a4', gold: '#d9a35b', goldDim: '#9a7442', hot: '#ffe2b0', ember: '#ff8a3c', ice: '#bfe0ff',
};

const TYPE = {};

// Draw a string letter-by-letter. o.each(i, n, ch) -> {a, dx, dy, s, sx, sy, blur, rot, color}
TYPE.letters = function (ctx, str, x, y, o) {
  ctx.font = o.font;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const chars = [...str];
  const widths = chars.map(c => ctx.measureText(c).width);
  const tr = o.tracking || 0;
  const total = widths.reduce((a, b) => a + b, 0) + tr * (chars.length - 1);
  let cx = o.align === 'left' ? x : o.align === 'right' ? x - total : x - total / 2;
  const n = chars.length;
  chars.forEach((c, i) => {
    const st = o.each ? o.each(i, n, c) : {};
    const a = (st.a === undefined ? 1 : st.a) * (o.alpha === undefined ? 1 : o.alpha);
    if (a > 0.003 && c !== ' ') {
      ctx.save();
      ctx.globalAlpha = Math.min(1, a);
      if (st.blur > 0.3) ctx.filter = `blur(${st.blur.toFixed(1)}px)`;
      ctx.translate(cx + widths[i] / 2 + (st.dx || 0), y + (st.dy || 0));
      if (st.rot) ctx.rotate(st.rot);
      const s = st.s === undefined ? 1 : st.s;
      ctx.scale(st.sx === undefined ? s : st.sx, st.sy === undefined ? s : st.sy);
      ctx.fillStyle = st.color || o.color || COL.bone;
      ctx.fillText(c, -widths[i] / 2, 0);
      if (o.stroke) { ctx.lineWidth = o.stroke.w; ctx.strokeStyle = o.stroke.c; ctx.strokeText(c, -widths[i] / 2, 0); }
      ctx.restore();
    }
    cx += widths[i] + tr;
  });
  return total;
};

TYPE.measure = function (ctx, str, font, tracking = 0) {
  ctx.font = font;
  return [...str].reduce((a, c) => a + ctx.measureText(c).width, 0) + tracking * ([...str].length - 1);
};

// thin horizontal rule that grows from its centre
TYPE.rule = function (ctx, cx, cy, w, prog, a = 1, color = COL.gold, th = 1.2) {
  if (prog <= 0 || a <= 0) return;
  const hw = w / 2 * prog;
  const g = ctx.createLinearGradient(cx - hw, 0, cx + hw, 0);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, color); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = g; ctx.fillRect(cx - hw, cy - th / 2, hw * 2, th); ctx.restore();
};

TYPE.diamond = function (ctx, cx, cy, r, a = 1, color = COL.gold) {
  ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = color; ctx.beginPath();
  ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy); ctx.closePath(); ctx.fill(); ctx.restore();
};

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];
const SINS = ['LIMBO', 'LUST', 'GLUTTONY', 'GREED', 'WRATH', 'HERESY', 'VIOLENCE', 'FRAUD', 'TREACHERY'];

// The nine-rings sigil. o: {rings (0..9 fractional draw-on), rot, a, color, scale, numerals, ticks, path, hot}
TYPE.sigil = function (ctx, cx, cy, R, t, o = {}) {
  const rings = o.rings === undefined ? 9 : o.rings;
  const a = o.a === undefined ? 1 : o.a;
  if (a <= 0) return;
  const color = o.color || COL.gold;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.globalAlpha = a;
  ctx.strokeStyle = color; ctx.fillStyle = color;
  for (let i = 0; i < 9; i++) {
    const p = clamp01(rings - i);
    if (p <= 0) continue;
    const r = R * (0.16 + 0.84 * Math.pow((i + 1) / 9, 0.92));
    const dir = i % 2 ? -1 : 1;
    const rot = (o.rot || 0) * dir * (0.4 + i * 0.12) + i * 0.7;
    ctx.save(); ctx.rotate(rot);
    ctx.lineWidth = (i % 3 === 2 ? 2.2 : 1.1) * (o.lw || 1);
    const gaps = [3, 1, 2, 4, 1, 3, 2, 6, 1][i];
    const span = Math.PI * 2 * p;
    if (i === 4 || i === 7) ctx.setLineDash([2, 7]); else ctx.setLineDash([]);
    for (let g = 0; g < gaps; g++) {
      const a0 = g / gaps * Math.PI * 2, seg = Math.PI * 2 / gaps;
      const a1 = a0 + Math.max(0, Math.min(seg - (gaps > 1 ? 0.12 : 0), span - a0));
      if (a1 <= a0) continue;
      ctx.beginPath(); ctx.arc(0, 0, r, a0, a1); ctx.stroke();
    }
    ctx.restore();
  }
  ctx.setLineDash([]);
  // outer tick ring
  if (o.ticks !== 0) {
    const tp = clamp01((rings - 6) / 3) * (o.ticks === undefined ? 1 : o.ticks);
    const Rt = R * 1.08;
    ctx.save(); ctx.rotate((o.rot || 0) * -0.25);
    ctx.lineWidth = 1;
    const n = 108;
    for (let k = 0; k < n * tp; k++) {
      const ang = k / n * Math.PI * 2;
      const len = k % 12 === 0 ? 14 : k % 3 === 0 ? 7 : 3.5;
      ctx.beginPath(); ctx.moveTo(Math.cos(ang) * Rt, Math.sin(ang) * Rt); ctx.lineTo(Math.cos(ang) * (Rt + len), Math.sin(ang) * (Rt + len)); ctx.stroke();
    }
    ctx.restore();
  }
  // numerals around
  if (o.numerals) {
    const np = o.numerals;
    ctx.font = `600 ${Math.round(R * 0.075)}px Cinzel`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let k = 0; k < 9; k++) {
      const aa = clamp01(np * 9 - k);
      if (aa <= 0) continue;
      const ang = -Math.PI / 2 + k / 9 * Math.PI * 2 + (o.rot || 0) * 0.15;
      ctx.globalAlpha = a * aa;
      ctx.save(); ctx.translate(Math.cos(ang) * R * 1.24, Math.sin(ang) * R * 1.24); ctx.rotate(ang + Math.PI / 2);
      ctx.fillText(ROMAN[k], 0, 0); ctx.restore();
    }
    ctx.globalAlpha = a;
  }
  // the path: vertical axis through the circles
  if (o.path) {
    const pp = o.path;
    const h = R * 1.55 * pp;
    const g = ctx.createLinearGradient(0, -h, 0, h);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, color); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(-0.9, -h, 1.8, h * 2);
    ctx.fillStyle = color;
    TYPE.diamond(ctx, 0, 0, 5 * pp, a, color);
    TYPE.diamond(ctx, 0, -R * 1.08, 3.5 * pp, a, color);
    TYPE.diamond(ctx, 0, R * 1.08, 3.5 * pp, a, color);
  }
  ctx.restore();
};

// soft dark scrim behind type for legibility over bright plates
TYPE.scrim = function (ctx, cx, cy, rx, ry, a) {
  if (a <= 0) return;
  ctx.save(); ctx.translate(cx, cy); ctx.scale(rx / ry, 1);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, ry);
  g.addColorStop(0, `rgba(0,0,0,${a})`); g.addColorStop(0.55, `rgba(0,0,0,${a * 0.6})`); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(-ry, -ry, ry * 2, ry * 2); ctx.restore();
};

// corner brackets framing the picture (HUD-like, sparse)
TYPE.corners = function (ctx, a, inset = 60, len = 26, color = COL.boneDim) {
  if (a <= 0) return;
  ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = color; ctx.lineWidth = 1.2;
  const x0 = inset, x1 = 1920 - inset, y0 = 138 + inset * 0.5, y1 = 942 - inset * 0.5;
  for (const [x, y, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) {
    ctx.beginPath(); ctx.moveTo(x, y + sy * len); ctx.lineTo(x, y); ctx.lineTo(x + sx * len, y); ctx.stroke();
  }
  ctx.restore();
};

// ------------------------------------------------------------------------- reusable letter animations
// staggered blur-rise reveal; returns per-letter style fn
TYPE.reveal = (lt, o = {}) => (i, n) => {
  const d = o.delay || 0, stg = o.stagger === undefined ? 0.028 : o.stagger, dur = o.dur || 0.55;
  const order = o.fromCenter ? Math.abs(i - (n - 1) / 2) : i;
  const p = clamp01((lt - d - order * stg) / dur);
  const e = E.outC(p);
  const out = o.outAt !== undefined ? clamp01((lt - o.outAt - order * (o.outStagger || 0.015)) / (o.outDur || 0.4)) : 0;
  const eo = E.inQ(out);
  return { a: e * (1 - eo), blur: (1 - e) * (o.blur || 10) + eo * (o.outBlur || 8), dy: (1 - e) * (o.rise || 10) - eo * (o.outRise || 0), s: 1 + (1 - e) * (o.grow || 0) + eo * (o.outGrow || 0) };
};
// hard slam: scale-down from big with exposure punch
TYPE.slam = (lt, o = {}) => (i, n) => {
  const p = clamp01((lt - (o.delay || 0) - i * (o.stagger || 0)) / (o.dur || 0.16));
  const e = E.outE(p);
  return { a: Math.min(1, p * 4), s: 1 + (1 - e) * (o.from || 0.35), blur: (1 - e) * (o.blur || 6) };
};
