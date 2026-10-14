// Classic script, loaded after v3's engine/timeline.js, type.js and texts.js: v4 reuses v3's typography and sigil
// (same music grid, same words). Draws this frame's text and graphic layers and returns their compositing state.
'use strict';
window.V4TEXT = function (t, txt, gfx) {
  const st = { t, comp: TL.defaultComp(), post: TL.defaultPost() };
  const texts = TL.texts.filter(c => t >= c.t0 && t < c.t1), g = TL.gfx.filter(c => t >= c.t0 && t < c.t1);
  for (const c of texts) if (c.fx) c.fx(st, t - c.t0, t);
  for (const c of [txt, gfx]) {             // a clean slate: no transform, alpha or filter left over from the last frame
    c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.filter = 'none'; c.globalCompositeOperation = 'source-over'; c.setLineDash([]);
    c.clearRect(0, 0, 1920, 1080);
  }
  for (const c of texts) c.draw(txt, t - c.t0, t);
  for (const c of g) c.draw(gfx, t - c.t0, t);
  const c = st.comp;
  return { txtFx: c.txtFx, txtFx2: c.txtFx2, gfxFx: c.gfxFx };
};
window.V4AUDIO = t => audioAt(t);
