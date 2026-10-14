// The dark forest of the trailer's first act, as real geometry: a winding path of trodden mud through leaf litter,
// old trunks with root flare, buttresses and broken branches (photo-scanned bark), a canopy of dark foliage masses
// that the moon shines through, fallen logs, rocks and ferns. Built once; chunks are frustum-culled.
import * as THREE from 'three';
import { fbm3, noise3, lumpy } from '../geo.js';

export const pathX = z => 1.3 * Math.sin(z * 0.07) + 0.5 * Math.sin(z * 0.19 + 1.3);
export function groundH(x, z) {
  const pd = x - pathX(z);
  return 0.6 * (fbm3(x * 0.12, 0.5, z * 0.12, 3) - 0.5) + 0.07 * (noise3(x * 1.9, 3.1, z * 1.9) - 0.5) - 0.12 * Math.exp(-pd * pd * 0.5);
}

const Z0 = -10, Z1 = 130, XW = 30;          // forest extent (the path runs along +z)
const CELL = 3.2;

// mulberry32 — the set must be identical in every render worker
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function merge(geos) {
  const out = new THREE.BufferGeometry(), P = [], N = [], U = [], I = [];
  let base = 0;
  for (const g of geos) {
    const gi = g.index ? g : g.setIndex([...Array(g.attributes.position.count).keys()]);
    P.push(...g.attributes.position.array); N.push(...g.attributes.normal.array); U.push(...g.attributes.uv.array);
    for (const i of gi.index.array) I.push(i + base);
    base += g.attributes.position.count;
  }
  out.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  out.setIndex(I);
  return out;
}

// one trunk: flared, buttressed, knotted, slightly leaning; broken dead branches; bark UVs in metres
function trunkGeo(R, o) {
  const radial = o.radial || 26, hs = o.hs || 44, h = o.h, r0 = o.r0;
  const g = new THREE.CylinderGeometry(1, 1, h + 0.8, radial, hs, true);
  g.translate(0, (h + 0.8) / 2 - 0.8, 0);
  const pos = g.attributes.position, uv = g.attributes.uv, v = new THREE.Vector3();
  const k = Math.max(1, Math.round(Math.PI * 2 * r0 / 0.9)), s = o.seed, lobes = 4 + Math.floor(R() * 4), lx = (R() - 0.5) * 0.08, lz = (R() - 0.5) * 0.08;
  for (let i = 0; i <= hs; i++) for (let j = 0; j <= radial; j++) {
    const idx = i * (radial + 1) + j;
    v.fromBufferAttribute(pos, idx);
    const a = j / radial * Math.PI * 2, y = v.y, yp = Math.max(y, 0);
    let r = r0 * (1 + 0.9 * Math.exp(-yp * 2.0)) * (0.5 + 0.5 * THREE.MathUtils.smoothstep(y, h, h * 0.3));
    r += r0 * 0.75 * Math.exp(-yp * 2.6) * Math.pow(Math.max(0, Math.sin(a * lobes + s)), 3);
    r += r0 * (0.07 * Math.sin(a * 6 + y * 0.7 + s * 20) + 0.16 * (fbm3(Math.cos(a) * 1.6 + s, y * 0.9, Math.sin(a) * 1.6, 3) - 0.5));
    if (y < -0.05) r *= 1 + 0.4 * Math.min(1, -y);                       // roots spread under the soil
    if (o.snag && y > h - 1.2) r *= 1 + 0.25 * (fbm3(a * 2, y * 4, s, 2) - 0.5);   // splintered top
    pos.setXYZ(idx, Math.sin(a) * r + lx * yp, y, Math.cos(a) * r + lz * yp);
    uv.setXY(idx, j / radial * k + (s % 1), y / 1.8);
  }
  g.computeVertexNormals();
  const parts = [g];
  // dead branches, broken short; a couple of live limbs high up on the tall ones
  const nb = o.snag ? 1 : 3 + Math.floor(R() * 3);
  for (let b = 0; b < nb; b++) {
    const by = o.snag ? h * (0.3 + R() * 0.4) : 2.4 + R() * Math.min(9, h - 4), ba = R() * Math.PI * 2;
    const len = (o.snag ? 0.6 : 0.9) + R() * (by > 8 ? 3.2 : 1.4), rb = r0 * (0.22 + R() * 0.12);
    const bg = new THREE.CylinderGeometry(rb * 0.25, rb, len, 8, 4, true);
    bg.translate(0, len / 2, 0);
    const bu = bg.attributes.uv; for (let i = 0; i < bu.count; i++) bu.setXY(i, bu.getX(i) * 2, bu.getY(i) * len / 1.8);
    const tilt = 0.7 + R() * 0.6;
    bg.rotateZ(-tilt); bg.rotateY(ba);
    const rr = r0 * (1 + 0.9 * Math.exp(-by * 2)) * 0.8;
    bg.translate(Math.cos(ba) * rr, by, -Math.sin(ba) * rr);
    parts.push(bg);
  }
  return merge(parts);
}

function fernGeo(R) {
  // a clump of arching fronds: each frond is a tapering strip bent outward and down, leaflets as a zigzag width
  const P = [], N = [], U = [], I = [];
  const n = 7 + Math.floor(R() * 5);
  for (let f = 0; f < n; f++) {
    const a = f / n * Math.PI * 2 + R() * 0.5, L = 0.55 + R() * 0.45, up = 0.9 + R() * 0.5, segs = 10;
    const base = P.length / 3;
    for (let i = 0; i <= segs; i++) {
      const u = i / segs, d = L * u, y = up * L * u * (1 - u * 0.95) * 0.9;
      const w = 0.11 * Math.sin(Math.PI * Math.min(1, u * 1.15)) * (i % 2 ? 1.25 : 0.75);
      const cx = Math.sin(a) * d, cz = Math.cos(a) * d, px = Math.cos(a) * w, pz = -Math.sin(a) * w;
      P.push(cx - px, y, cz - pz, cx + px, y + 0.01, cz + pz);
      N.push(0, 1, 0, 0, 1, 0); U.push(0, u, 1, u);
      if (i < segs) { const b = base + i * 2; I.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setIndex(I); g.computeVertexNormals();
  return g;
}

// UVs for welded, displaced geometry (lumpy() drops them): projected on the mesh's own axes
function planarUV(g, k) {
  const p = g.attributes.position, u = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { u[i * 2] = (p.getX(i) + p.getZ(i) * 0.7) * k; u[i * 2 + 1] = (p.getY(i) - p.getZ(i) * 0.3) * k; }
  g.setAttribute('uv', new THREE.BufferAttribute(u, 2));
  return g;
}

export class Forest {
  // clearZones: [x0, z0, x1, z1, r] segments kept free of trees (camera tracks)
  constructor(scene, { base = '../assets/tex/', clearZones = [] } = {}) {
    this.clearZones = clearZones;
    const L = new THREE.TextureLoader(), tex = (u, srgb, rep = 1) => {
      const t = L.load(base + u); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.repeat.set(rep, rep);
      if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t;
    };
    this.group = new THREE.Group(); scene.add(this.group);
    const R = rng(20251014);

    // ---------------------------------------------------------------- ground: leaf litter, trodden mud on the path
    const W = XW * 2 + 20, Lz = Z1 - Z0 + 20, sx = 160, sz = 320;
    const gg = new THREE.PlaneGeometry(W, Lz, sx, sz); gg.rotateX(-Math.PI / 2); gg.translate(0, 0, (Z0 + Z1) / 2);
    const gp = gg.attributes.position, guv = gg.attributes.uv, pw = new Float32Array(gp.count);
    for (let i = 0; i < gp.count; i++) {
      const x = gp.getX(i), z = gp.getZ(i);
      gp.setY(i, groundH(x, z)); guv.setXY(i, x / 2.2, z / 2.2);
      const pd = x - pathX(z);
      pw[i] = Math.exp(-pd * pd * 0.42) * (0.75 + 0.5 * noise3(x * 0.8, 1.7, z * 0.8));
    }
    gg.setAttribute('pathW', new THREE.BufferAttribute(pw, 1));
    gg.computeVertexNormals();
    const groundMat = new THREE.MeshStandardMaterial({ map: tex('leaves/diff.jpg', true), normalMap: tex('leaves/nor.jpg'), normalScale: new THREE.Vector2(1.3, 1.3), roughness: 0.9 });
    const mudD = tex('mud/diff.jpg', true), mudN = tex('mud/nor.jpg');
    groundMat.onBeforeCompile = sh => {
      sh.uniforms.tMud = { value: mudD }; sh.uniforms.tMudN = { value: mudN };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float pathW; varying float vPathW;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPathW = pathW;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D tMud, tMudN; varying float vPathW;')
        .replace('#include <map_fragment>', `
          vec4 leafC_ = texture2D(map, vMapUv); vec4 mudC_ = texture2D(tMud, vMapUv * 1.4);
          float wPath_ = smoothstep(0.35, 0.75, vPathW + (leafC_.g - 0.12) * 1.5);
          diffuseColor *= mix(leafC_ * vec4(0.8, 0.78, 0.74, 1.0), mudC_ * vec4(0.55, 0.5, 0.46, 1.0), wPath_);`)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.55, wPath_);')
        .replace('texture2D( normalMap, vNormalMapUv ).xyz', 'mix(texture2D( normalMap, vNormalMapUv ).xyz, texture2D(tMudN, vNormalMapUv * 1.4).xyz, wPath_)');
    };
    const ground = new THREE.Mesh(gg, groundMat); ground.receiveShadow = true; this.group.add(ground);

    // ---------------------------------------------------------------- trees
    // two levels of detail: trunks near the path are seen up close, the rest are silhouettes in the fog
    const barkMat = new THREE.MeshStandardMaterial({ map: tex('bark/diff.jpg', true), normalMap: tex('bark/nor.jpg'), normalScale: new THREE.Vector2(1.6, 1.6), roughness: 0.92, color: 0x9a9088 });
    const NV = 7, variants = [];
    for (let i = 0; i < NV; i++) {
      const snag = i >= 5, r0 = [0.22, 0.3, 0.38, 0.26, 0.45, 0.3, 0.42][i], h = snag ? 3 + R() * 5 : 22, seed = i * 1.37 + 0.2;
      variants.push({ hi: trunkGeo(rng(i * 977 + 5), { r0, h, seed, snag, radial: 20, hs: 26 }), lo: trunkGeo(rng(i * 977 + 5), { r0, h, seed, snag, radial: 9, hs: 9 }) });
    }
    const foliage = new THREE.MeshStandardMaterial({ color: 0x0b0f0b, roughness: 1 });
    const canopyGeo = lumpy(new THREE.IcosahedronGeometry(1, 1), 0.5, 1.1, 3.3, [3.2, 1.4, 3.2], 0.3);
    const fernMat = new THREE.MeshStandardMaterial({ color: 0x1d2418, roughness: 0.85, side: THREE.DoubleSide });
    const ferns = [0, 1, 2].map(() => fernGeo(R));
    const rockMat = new THREE.MeshStandardMaterial({ map: tex('rock/diff.jpg', true, 0.5), normalMap: tex('rock/nor.jpg', false, 0.5), roughness: 0.9, color: 0x6f6a62 });
    const rockGeo = planarUV(lumpy(new THREE.IcosahedronGeometry(1, 3), 0.7, 1.6, 5.1, [1, 0.6, 1], 0.6), 0.8);

    // everything is bucketed into 10 m chunks so off-screen (and out-of-shadow-frustum) chunks are culled
    const CH = 10, m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const chunks = new Map();
    const bucket = (x, z, kind) => {
      const k = Math.floor(x / CH) + ',' + Math.floor(z / CH);
      if (!chunks.has(k)) chunks.set(k, new Map());
      const c = chunks.get(k); if (!c.has(kind)) c.set(kind, []);
      return c.get(kind);
    };
    const clear = (x, z, r) => this.clearZones.some(c => {           // camera tracks need room
      const dx = c[2] - c[0], dz = c[3] - c[1], l2 = dx * dx + dz * dz || 1;
      const u = Math.max(0, Math.min(1, ((x - c[0]) * dx + (z - c[1]) * dz) / l2));
      return Math.hypot(x - c[0] - dx * u, z - c[1] - dz * u) < c[4] + r;
    });
    this.trees = [];
    const logs = [];
    for (let z = Z0; z < Z1; z += CELL) for (let x = -XW; x < XW; x += CELL) {
      const tx = x + CELL / 2 + (R() - 0.5) * 1.6, tz = z + CELL / 2 + (R() - 0.5) * 1.6, near = Math.abs(tx - pathX(tz));
      const open = near < 1.9 || R() < 0.12;
      const vi = Math.floor(R() * NV), sc = 0.85 + R() * 0.4, ry = R() * Math.PI * 2, sy = 0.9 + R() * 0.25;
      if (!open && !clear(tx, tz, 0.6 * sc)) {
        e.set(0, ry, 0); q.setFromEuler(e); s.set(sc, sy, sc);
        p.set(tx, groundH(tx, tz) - 0.05, tz);
        bucket(tx, tz, (near < 9 ? 'hi' : 'lo') + vi).push(m4.compose(p, q, s).clone());
        this.trees.push({ x: tx, z: tz, r: 0.35 * sc });
        if (vi < 5) for (let c = 0; c < 2 + Math.floor(R() * 2); c++) {
          const a = R() * Math.PI * 2, d = R() * 2.5;
          e.set(R() * 0.4, R() * 6, R() * 0.4); q.setFromEuler(e); const cs = 0.7 + R() * 0.9; s.set(cs * (0.9 + R() * 0.5), cs * (0.6 + R() * 0.6), cs);
          p.set(tx + Math.sin(a) * d, 13 + R() * 7 + c * 1.5, tz + Math.cos(a) * d);
          bucket(tx, tz, 'canopy').push(m4.compose(p, q, s).clone());
        }
      }
      // undergrowth: ferns hug the path edges and the tree feet, rocks here and there
      const nf = near < 6 ? 2 : (R() < 0.5 ? 1 : 0);
      for (let f = 0; f < nf; f++) {
        const fx = x + R() * CELL, fz = z + R() * CELL, fv = Math.floor(R() * 3);
        e.set((R() - 0.5) * 0.2, R() * 6, (R() - 0.5) * 0.2); q.setFromEuler(e); const fs = 0.7 + R() * 0.8; s.set(fs, fs * (0.8 + R() * 0.4), fs);
        if (Math.abs(fx - pathX(fz)) < 1.15 || near > 14 || clear(fx, fz, 0.3)) continue;
        p.set(fx, groundH(fx, fz) - 0.02, fz);
        bucket(fx, fz, 'fern' + fv).push(m4.compose(p, q, s).clone());
      }
      if (R() < 0.18) {
        const rx = x + R() * CELL, rz = z + R() * CELL;
        e.set(R(), R() * 6, R()); q.setFromEuler(e); const rs = 0.15 + R() * 0.35; s.set(rs * 1.3, rs * 0.8, rs);
        if (Math.abs(rx - pathX(rz)) > 1.2 && !clear(rx, rz, rs)) { p.set(rx, groundH(rx, rz) - rs * 0.3, rz); bucket(rx, rz, 'rock').push(m4.compose(p, q, s).clone()); }
      }
      if (R() < 0.05) logs.push([x + CELL / 2, z + CELL / 2, R() * Math.PI, 0.16 + R() * 0.18, 2.5 + R() * 3.5]);
    }
    const geoOf = kind => kind === 'canopy' ? canopyGeo : kind === 'rock' ? rockGeo : kind.startsWith('fern') ? ferns[+kind[4]] : variants[+kind.slice(2)][kind.slice(0, 2)];
    const matOf = kind => kind === 'canopy' ? foliage : kind === 'rock' ? rockMat : kind.startsWith('fern') ? fernMat : barkMat;
    for (const c of chunks.values()) for (const [kind, list] of c) {
      const im = new THREE.InstancedMesh(geoOf(kind), matOf(kind), list.length);
      list.forEach((m, i) => im.setMatrixAt(i, m));
      im.castShadow = !kind.startsWith('fern'); im.receiveShadow = kind !== 'canopy';
      im.computeBoundingSphere(); this.group.add(im);
    }
    for (const [x, z, a, r, len] of logs) {
      if (Math.abs(x - pathX(z)) < len / 2 + 0.9 || clear(x, z, len / 2)) continue;      // never across the path
      const lg = planarUV(lumpy(new THREE.CylinderGeometry(r * 0.85, r, len, 14, 8, false), r * 0.25, 2.2, x + z, [1, 1, 1], 0.2), 0.55);
      const m = new THREE.Mesh(lg, barkMat);
      m.rotation.set(0, a, Math.PI / 2); m.position.set(x, groundH(x, z) + r * 0.45, z);
      m.castShadow = m.receiveShadow = true; this.group.add(m);
    }

    // distant layers beyond the fog limit read as dark walls of trunks: the fog takes care of them
    this.mats = { ground: groundMat, bark: barkMat, foliage, fern: fernMat };
  }

}
