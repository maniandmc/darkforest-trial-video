// CC0 photo-scanned PBR materials (Poly Haven) — see tools/fetch_assets.py
'use strict';
const TEX = {};
const MATERIALS = ['bark', 'leaves', 'mud', 'blocks', 'rock', 'cliff'];
TEX.load = async function () {
  const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('load ' + src)); i.src = src; });
  await Promise.all(MATERIALS.flatMap(m => ['diff', 'nor', 'disp'].map(async k => {
    const img = await loadImg(`../assets/tex/${m}/${k}.jpg`);
    (TEX[m] = TEX[m] || {})[k] = GLX.imageTexture(img, k === 'diff');
  })));
};
// uniform-name -> texture map for a scene: TEX.bind({uBark: 'bark'}) -> {uBarkD, uBarkN, uBarkH}
TEX.bind = spec => Object.fromEntries(Object.entries(spec).flatMap(([u, m]) => [[u + 'D', TEX[m].diff], [u + 'N', TEX[m].nor], [u + 'H', TEX[m].disp]]));
