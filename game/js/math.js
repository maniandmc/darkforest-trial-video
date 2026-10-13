// Small math kit: easing, angles, seeded RNG, segment/capsule distance tests.
import * as THREE from 'three';

export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, x) => clamp((x - a) / (b - a), 0, 1);
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const TAU = Math.PI * 2;

export const ease = {
  linear: t => t,
  inQ: t => t * t,
  outQ: t => 1 - (1 - t) * (1 - t),
  inOutQ: t => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t)),
  inC: t => t * t * t,
  outC: t => 1 - Math.pow(1 - t, 3),
  inOutS: t => t * t * (3 - 2 * t),
  outBack: t => { const c = 1.6; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
};

export function wrapAngle(a) {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}
export const approachAngle = (a, b, maxStep) => a + clamp(wrapAngle(b - a), -maxStep, maxStep);
export const lerpAngle = (a, b, t) => a + wrapAngle(b - a) * t;

// mulberry32 — seeded so test runs are reproducible
let rs = 0x9e3779b9;
export function seed(n) { rs = n >>> 0; }
export function rand() {
  rs = (rs + 0x6d2b79f5) >>> 0;
  let t = rs;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const randRange = (a, b) => a + (b - a) * rand();

// Closest distance between segments p1-q1 and p2-q2 (Ericson, Real-Time Collision Detection 5.1.9)
const _d1 = new THREE.Vector3(), _d2 = new THREE.Vector3(), _r = new THREE.Vector3();
const _c1 = new THREE.Vector3(), _c2 = new THREE.Vector3();
export function segSegDist(p1, q1, p2, q2, out1, out2) {
  _d1.subVectors(q1, p1); _d2.subVectors(q2, p2); _r.subVectors(p1, p2);
  const a = _d1.dot(_d1), e = _d2.dot(_d2), f = _d2.dot(_r);
  let s, t;
  if (a <= 1e-9 && e <= 1e-9) { s = t = 0; }
  else if (a <= 1e-9) { s = 0; t = clamp(f / e, 0, 1); }
  else {
    const c = _d1.dot(_r);
    if (e <= 1e-9) { t = 0; s = clamp(-c / a, 0, 1); }
    else {
      const b = _d1.dot(_d2), den = a * e - b * b;
      s = den > 1e-9 ? clamp((b * f - c * e) / den, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); }
      else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); }
    }
  }
  _c1.copy(p1).addScaledVector(_d1, s);
  _c2.copy(p2).addScaledVector(_d2, t);
  if (out1) out1.copy(_c1);
  if (out2) out2.copy(_c2);
  return _c1.distanceTo(_c2);
}

// A capsule = segment a-b with radius r. Overlap test, optionally returning the contact point.
export function capsuleOverlap(a1, b1, r1, a2, b2, r2, contact) {
  const o1 = contact ? new THREE.Vector3() : null, o2 = contact ? new THREE.Vector3() : null;
  const d = segSegDist(a1, b1, a2, b2, o1, o2);
  if (d < r1 + r2) {
    if (contact) contact.copy(o1).lerp(o2, r1 / Math.max(r1 + r2, 1e-6));
    return true;
  }
  return false;
}

export const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
