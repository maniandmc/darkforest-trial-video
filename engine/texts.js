// Typography & graphic cues for the storyboard.
'use strict';

const F = (w, px, fam = 'Cinzel') => `${w} ${px}px ${fam}`;
const CUT = window.CUT || 'v1';                 // v2 = first-person cut (sword viewmodel on the right)
const TX = (t0, t1, draw, fx) => TL.texts.push({ t0, t1, draw, fx });
const GX = (t0, t1, draw) => TL.gfx.push({ t0, t1, draw });

// ------------------------------------------------------------------ I. "Midway upon the journey of our life"
TX(B(0) + 0.32, B(2), (ctx, lt) => {
  const outAt = 2.72;
  const lab = 'INFERNO  \u00b7  CANTO I';
  const lw = TYPE.measure(ctx, lab, F(600, 15), 8);
  TYPE.diamond(ctx, 128, 200, 4, E.outC(ramp(lt, 0.0, 0.3)) * (1 - ramp(lt, outAt, outAt + 0.4)), COL.gold);
  TYPE.letters(ctx, lab, 146, 200, { font: F(600, 15), tracking: 8, color: COL.gold, align: 'left', each: TYPE.reveal(lt, { stagger: 0.02, blur: 6, rise: 0, outAt, outDur: 0.35 }) });
  const rp = E.outC(ramp(lt, 0.25, 1.2)) * (1 - ramp(lt, outAt, outAt + 0.4));
  ctx.save(); ctx.globalAlpha = 0.7 * rp; ctx.fillStyle = COL.gold; ctx.fillRect(146 + lw + 22, 199.5, 160 * rp, 1); ctx.restore();
  TYPE.letters(ctx, 'MIDWAY UPON THE JOURNEY OF OUR LIFE', 960, 872, { font: F(400, 32), tracking: 9, color: COL.bone,
    each: TYPE.reveal(lt, { delay: 0.22, stagger: 0.024, blur: 12, rise: 8, outAt: outAt + 0.05, outBlur: 12, outRise: 6 }) });
}, (st, lt) => { st.comp.txtFx[0] = 1.05; });

// ------------------------------------------------------------------ II. "I found myself within a forest dark"
TX(B(2) + 0.14, B(3, 2.5), (ctx, lt) => {
  const outAt = 1.95;
  TYPE.letters(ctx, 'I FOUND MYSELF WITHIN', 960, 462, { font: F(400, 28), tracking: 10, color: COL.boneDim,
    each: TYPE.reveal(lt, { stagger: 0.022, blur: 10, rise: 6, outAt, outBlur: 10 }) });
  TYPE.letters(ctx, 'A FOREST DARK', 960, 540, { font: F(500, 86), tracking: 18, color: COL.bone,
    each: TYPE.reveal(lt, { delay: 0.35, stagger: 0.045, blur: 20, rise: 0, grow: 0.08, fromCenter: true, dur: 0.8, outAt: outAt + 0.05, outBlur: 16, outGrow: 0.04 }) });
}, (st, lt) => { st.comp.txtFx[0] = 1.1; });

// ------------------------------------------------------------------ III. "The straight way / WAS LOST"
{
  const words = ['THE', 'STRAIGHT', 'WAY'];
  const times = [B(5), B(5, 1), B(5, 2)];
  TX(B(5), B(6) + 1.05, (ctx, lt, t) => {
    const font = F(500, 44), tr = 14;
    const full = words.join(' ');
    const W = TYPE.measure(ctx, full, font, tr);
    let x = 960 - W / 2;
    const gone = ramp(t, B(6) + 0.04, B(6) + 0.3);
    TYPE.scrim(ctx, 960, 470, 520, 120, 0.55 * (1 - gone) * Math.min(1, lt * 6));
    words.forEach((w, wi) => {
      const ww = TYPE.measure(ctx, w, font, tr);
      const p = ramp(t, times[wi], times[wi] + 0.14);
      if (p > 0 && gone < 1) {
        const e = E.outE(p);
        TYPE.letters(ctx, w, x, 470 - 40 * E.outC(ramp(t, B(6), B(6) + 0.2)), { font, tracking: tr, align: 'left', color: COL.bone,
          alpha: Math.min(1, p * 3) * (1 - gone), each: () => ({ s: 1 + (1 - e) * 0.3, blur: (1 - e) * 8 }) });
      }
      x += ww + TYPE.measure(ctx, ' ', font, tr) + tr;
    });
    if (t >= B(6)) {
      const lt2 = t - B(6);
      const jit = lt2 < 0.6 ? 1 : 0;
      TYPE.letters(ctx, 'WAS LOST', 960, 566, { font: F(700, 150), tracking: 22, color: COL.bone,
        each: (i) => { const s = TYPE.slam(lt2, { dur: 0.12, from: 0.45, blur: 10 })(i); s.dx = jit * vnoise(t * 40 + i * 7) * 4; s.dy = jit * vnoise(t * 37 + i * 3) * 3; return s; } });
    }
  }, (st, lt, t) => {
    const g = pulse(t, B(6), 0.35);
    st.comp.txtFx[0] = 1.05 + 0.5 * pulse(t, B(6), 0.15);
    st.comp.txtFx[2] = g * 1.2 + 0.25 * pulses(t, [B(5, 1), B(5, 2)], 0.08);
    st.comp.txtFx2[1] = 7 * g;
    st.comp.txtFx2[3] = Math.floor(t * 12);
    st.comp.txtFx[1] = E.inQ(ramp(t, B(6) + 0.5, B(6) + 1.05));
    st.comp.txtFx2[2] = 1.5;
  });
}

// ------------------------------------------------------------------ IV. Nine circles, one per beat
TX(B(8), B(10) + 0.42, (ctx, lt, t) => {
  const k = Math.min(8, Math.floor((t - B(8)) / BEAT + 1e-4));
  const lk = t - B(8, k);
  const ice = k === 8;
  const col = ice ? COL.ice : COL.bone;
  TYPE.letters(ctx, ROMAN[k], 960, 532, { font: F(700, 190), tracking: 6, color: col, each: () => {
    const e = E.outE(ramp(lk, 0, 0.13)); return { s: 1 + (1 - e) * 0.4, blur: (1 - e) * 9, a: Math.min(1, lk * 12) };
  } });
  TYPE.letters(ctx, 'CIRCLE', 960, 388, { font: F(600, 14), tracking: 12, color: ice ? COL.ice : COL.gold, alpha: 0.85 * Math.min(1, lk * 10) });
  TYPE.letters(ctx, SINS[k], 960, 676, { font: F(500, 26), tracking: 16, color: ice ? COL.ice : COL.gold,
    each: TYPE.reveal(lk, { stagger: 0.012, dur: 0.18, blur: 6, rise: 6 }) });
}, (st, lt, t) => {
  const k = Math.min(8, Math.floor((t - B(8)) / BEAT + 1e-4));
  const lk = t - B(8, k);
  st.comp.txtFx[0] = 1.0 + 0.9 * Math.exp(-lk / 0.1);
  st.comp.txtFx2[1] = 5 * Math.exp(-lk / 0.06);
  if (t > B(10) + 0.25) { st.comp.txtFx[1] = E.inQ(ramp(t, B(10) + 0.2, B(10) + 0.42)); st.comp.txtFx2[2] = 1.2; }
});
GX(B(8), B(10) + 0.42, (ctx, lt, t) => {
  const k = Math.min(8, Math.floor((t - B(8)) / BEAT + 1e-4));
  const lk = t - B(8, k);
  const p = E.outC(ramp(lk, 0, 0.38));
  ctx.save();
  ctx.strokeStyle = k === 8 ? COL.ice : COL.gold; ctx.lineWidth = 2 * (1 - p) + 0.6;
  ctx.globalAlpha = 0.75 * (1 - p);
  ctx.beginPath(); ctx.arc(960, 532, 150 + 260 * p, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 1;
  for (let i = 0; i <= k; i++) { ctx.beginPath(); ctx.arc(960, 532, 232 + i * 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, (t - B(8, i)) / 0.3)); ctx.stroke(); }
  ctx.restore();
});

// ------------------------------------------------------------------ V. NINE CIRCLES / ONE SOUL
TX(B(11) + 0.12, B(12) - 0.02, (ctx, lt) => {
  const nx = CUT === 'v2' ? 560 : 1385;
  TYPE.letters(ctx, 'NINE CIRCLES', nx, 520, { font: F(600, 66), tracking: 14, color: COL.bone,
    each: TYPE.reveal(lt, { stagger: 0.035, blur: 14, rise: 0, grow: 0.12, dur: 0.45, outAt: 1.45, outDur: 0.2, outBlur: 10 }) });
  TYPE.rule(ctx, nx, 572, 380, E.outC(ramp(lt, 0.3, 1.0)) * (1 - ramp(lt, 1.45, 1.6)), 0.8, COL.gold);
}, (st, lt) => { st.comp.txtFx[0] = 1.15; });
TX(B(12) + 0.18, B(13), (ctx, lt) => {
  TYPE.letters(ctx, 'ONE SOUL', 960, 300, { font: F(600, 84), tracking: 20, color: COL.bone,
    each: TYPE.reveal(lt, { stagger: 0.05, blur: 16, rise: 0, grow: 0.1, fromCenter: true, dur: 0.5 }) });
}, (st, lt, t) => { st.comp.txtFx[0] = 1.15; st.comp.txtFx[2] = 1.4 * ramp(t, B(13) - 0.12, B(13)); st.comp.txtFx2[3] = Math.floor(t * 30); });

// ------------------------------------------------------------------ VI. the sigil assembles through the build
GX(B(13), FINAL + 3, (ctx, lt, t) => {
  let rings, a, R = 300, cx = 960, cy = 540, color = COL.gold, num = 0, path = 0, rot = t * 0.35;
  if (t < B(14)) { rings = 5 * E.outC(ramp(t, B(13), B(14))); a = 0.35; }
  else if (t < B(15)) { rings = 5 + 4 * ramp(t, B(14), B(15)); a = 0.55 + 0.4 * pulses(t, [0, 1, 2, 3, 4, 5, 6, 7].map(i => B(14, i * 0.5)), 0.08); num = ramp(t, B(14), B(15)); }
  else if (t < B(15, 3)) { rings = 9; a = 0.22; num = 1; }
  else if (t < FINAL) { rings = 9; num = 1; path = 1; const s16 = Math.floor((t - B(15, 3)) / (BEAT / 4)); a = (s16 % 2 === 0 ? 1.0 : 0.25); color = COL.hot; rot += s16 * 0.2; }
  else {
    const k = E.outE(ramp(t, FINAL, FINAL + 0.6));
    R = lerp(300, 140, k); cy = lerp(540, 378, k); rings = 9; num = 1; path = 1;
    a = 1; color = ramp(t, FINAL, FINAL + 0.9) < 1 ? (t - FINAL < 0.25 ? COL.hot : COL.gold) : COL.gold;
    rot = t * 0.12;
  }
  TYPE.sigil(ctx, cx, cy, R, t, { rings, a, color, rot, numerals: num, path, lw: t >= FINAL ? 1.15 : 1 });
});

// ------------------------------------------------------------------ VII. ABANDON / ALL / HOPE
[['ABANDON', B(15), B(15, 1), 210], ['ALL', B(15, 1), B(15, 2), 290], ['HOPE', B(15, 2), FINAL - 0.02, 300]].forEach(([w, t0, t1, px]) => {
  TX(t0, t1, (ctx, lt, t) => {
    TYPE.letters(ctx, w, 960, 548, { font: F(900, px), tracking: px * 0.05, color: COL.bone,
      each: (i, n) => { const s = TYPE.slam(lt, { dur: 0.11, from: 0.5, blur: 14 })(i, n); s.dx = vnoise(t * 30 + i * 5) * 3; s.dy = vnoise(t * 33 + i * 9) * 3; return s; } });
  }, (st, lt, t) => {
    st.comp.txtFx[0] = 1.0 + 0.9 * Math.exp(-lt / 0.07);
    st.comp.txtFx2[1] = 8 * Math.exp(-lt / 0.05);
    if (w === 'HOPE') { st.comp.txtFx[1] = E.inQ(ramp(t, B(15, 2.55), FINAL - 0.06)); st.comp.txtFx2[2] = 2.2; st.comp.txtFx2[3] = 3; }
  });
});

// ------------------------------------------------------------------ VIII. title lockup
TX(FINAL, FINAL + 3, (ctx, lt) => {
  const tr = lerp(40, 27, E.outC(ramp(lt, 0, 2.4)));
  TYPE.letters(ctx, 'SELVA OSCURA', 960, 632, { font: F(600, 124), tracking: tr, color: '#efe2c6',
    each: TYPE.reveal(lt, { delay: 0.02, stagger: 0.03, blur: 22, rise: 0, grow: 0.12, fromCenter: true, dur: 0.7 }) });
  TYPE.rule(ctx, 960, 710, 600, E.outC(ramp(lt, 0.45, 1.3)), 0.9, COL.gold);
  TYPE.diamond(ctx, 960, 710, 4, E.outC(ramp(lt, 0.6, 0.9)), COL.gold);
  TYPE.letters(ctx, 'COMING  2027', 960, 758, { font: F(600, 26), tracking: 16, color: COL.bone,
    each: TYPE.reveal(lt, { delay: 0.95, stagger: 0.03, blur: 8, rise: 4 }) });
}, (st, lt) => {
  st.comp.txtFx[0] = 1.05 + 1.2 * Math.exp(-lt / 0.18);
  st.comp.txtFx[3] = E.outC(ramp(lt, 0.2, 0.8));
  st.comp.txtFx2[0] = lerp(-1.2, 2.6, E.ioC(ramp(lt, 0.5, 2.1)));
  st.comp.txtFx2[1] = 6 * Math.exp(-lt / 0.2);
  st.comp.gfxFx[0] = 1.2 + 1.5 * Math.exp(-lt / 0.25);
});
