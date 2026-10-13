// Geometry helpers: value-noise displacement for organic, rocky shapes (built once at load).
import * as THREE from 'three';

function hash3(x, y, z) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const L = (a, b, t) => a + (b - a) * t;
  const c = (i, j, k) => hash3(xi + i, yi + j, zi + k);
  return L(L(L(c(0, 0, 0), c(1, 0, 0), u), L(c(0, 1, 0), c(1, 1, 0), u), v), L(L(c(0, 0, 1), c(1, 0, 1), u), L(c(0, 1, 1), c(1, 1, 1), u), v), w);
}
export function fbm3(x, y, z, oct = 4) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += a * noise3(x * f + i * 17.3, y * f + i * 5.1, z * f + i * 11.7); a *= 0.5; f *= 2.03; }
  return s;
}

// push vertices along their normals by fbm noise; `freq` in cycles per unit of the *final* (scaled) size
export function lumpy(geo, amp, freq, seed = 0, scale = [1, 1, 1], ridge = 0) {
  geo = geo.index ? geo.toNonIndexed() : geo;
  // weld first so displaced seams don't crack
  const merged = mergeVerts(geo);
  const pos = merged.attributes.position, nor = merged.attributes.normal;
  const p = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i); n.fromBufferAttribute(nor, i);
    const x = p.x * scale[0] * freq + seed, y = p.y * scale[1] * freq + seed * 0.7, z = p.z * scale[2] * freq - seed;
    let d = fbm3(x, y, z) - 0.5;
    if (ridge) d = d * (1 - ridge) + ridge * (0.5 - Math.abs(noise3(x * 2.1, y * 2.1, z * 2.1) - 0.5) * 2) * 0.6;
    p.addScaledVector(n, d * amp / Math.max(scale[0], scale[1], scale[2]) * 2);
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  merged.computeVertexNormals();
  return merged;
}

function mergeVerts(geo) {
  const pos = geo.attributes.position, map = new Map(), idx = [], P = [], N = [];
  const nor = geo.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    const k = `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
    let j = map.get(k);
    if (j === undefined) { j = P.length / 3; map.set(k, j); P.push(pos.getX(i), pos.getY(i), pos.getZ(i)); N.push(nor.getX(i), nor.getY(i), nor.getZ(i)); }
    else { N[j * 3] += nor.getX(i); N[j * 3 + 1] += nor.getY(i); N[j * 3 + 2] += nor.getZ(i); }
    idx.push(j);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  const nn = new THREE.Float32BufferAttribute(N, 3);
  for (let i = 0; i < nn.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(nn, i).normalize(); nn.setXYZ(i, v.x, v.y, v.z); }
  g.setAttribute('normal', nn);
  g.setIndex(idx);
  return g;
}

export const ellipsoidGeo = (seg = 40) => new THREE.SphereGeometry(1, seg, Math.round(seg * 0.75));
