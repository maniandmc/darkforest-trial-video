// Procedural animation for the wanderer. Each frame the gameplay state (state, time in state, velocity, attack and
// chain step, hit direction) becomes a pose — a flat set of joint channels — which is then layered with:
//   · inertial blending, so a state change never pops (the old pose's offset decays over a few frames)
//   · springs for momentum: the body leans into acceleration and turns, sways back when it stops
//   · a stride cycle for the feet and two-bone IK for the legs (and the off hand, for two-handed grips / drinking)
//   · a cloth pass: the cloak is skinned to hips + chest; its hem trails, hangs, flares on spins and flutters
//   · world-space pendulums for the lantern and the sash tail
// Only the sword's world position flows back into gameplay (it is the hit box); the rest is cosmetic.
import * as THREE from 'three';
import { CFG } from './config.js';
import { clamp, lerp, damp, ease, wrapAngle } from './math.js';
import { RIG } from './playermodel.js';

const P = CFG.player, TAU = Math.PI * 2;

// ---------------------------------------------------------------------------------------------- pose channels
// hipY crouch(-)/hop(+) · cy roll-centre height · sq squash · lean fwd(+) · side lean right(+) · twist hips left(+)
// spinX somersault · spinY spin (left +) · cB/cT/cS chest bend/twist/side · hY/hP head yaw/pitch
// rY/rP/rR right shoulder yaw(across +)/pitch(down +)/roll · rE elbow · rWp/rWy wrist (blade down + / left +)
// lY/lP/lR/lE left arm (lY + = outward) · lIK off-hand IK weight · fb feet ride with the body · tuck knees to chest
const CH = ['hipY', 'cy', 'sq', 'lean', 'side', 'twist', 'spinX', 'spinY', 'cB', 'cT', 'cS', 'hY', 'hP',
  'rY', 'rP', 'rR', 'rE', 'rWp', 'rWy', 'lY', 'lP', 'lR', 'lE', 'lIK', 'fb', 'tuck'];
const WRAP = { spinX: true, spinY: true };
const BODY = new Set(['hipY', 'cy', 'sq', 'lean', 'side', 'twist', 'spinX', 'spinY', 'cB', 'cT', 'cS', 'hY', 'hP', 'fb', 'tuck']);
const WRIST = new Set(['rWp', 'rWy']);
const ZERO = Object.fromEntries(CH.map(k => [k, 0]));

export const GUARD = { ...ZERO, hipY: -0.03, lean: 0.06, twist: -0.22, cT: 0.12, cB: 0.04,
  rY: -0.3, rP: 1.12, rR: 0.15, rE: 1.2, rWp: 0.25, rWy: -0.12, lY: 0.3, lP: 1.1, lE: 0.45 };
const pose = o => ({ ...GUARD, ...o });

function mix(a, b, t, out = {}, wrap = true) {
  for (const k of CH) {
    let bv = b[k];
    if (wrap && WRAP[k]) bv = a[k] + wrapAngle(bv - a[k]);
    out[k] = a[k] + (bv - a[k]) * t;
  }
  return out;
}
// body leads, the arm follows, the wrist snaps through last
const SWING = { body: ease.outC, arm: ease.inOutQ, wrist: ease.inQ };
function mixGroups(a, b, u, E, out) {
  const ub = E.body(u), ua = E.arm(u), uw = E.wrist(u);
  for (const k of CH) out[k] = a[k] + (b[k] - a[k]) * (BODY.has(k) ? ub : WRIST.has(k) ? uw : ua);
  return out;
}
// keyframe track with Catmull-Rom tangents, so motion flows through keys instead of stopping at each one
function track(keys, k, out) {
  const n = keys.length; k = clamp(k, keys[0][0], keys[n - 1][0]);
  let i = 0; while (i < n - 2 && k > keys[i + 1][0]) i++;
  const [t0, A] = keys[i], [t1, B] = keys[i + 1], Pk = keys[i - 1], Nk = keys[i + 2];
  const d = t1 - t0, u = d > 0 ? (k - t0) / d : 1, u2 = u * u, u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
  for (const c of CH) {
    const m0 = Pk ? (B[c] - Pk[1][c]) / (t1 - Pk[0]) : 0, m1 = Nk ? (Nk[1][c] - A[c]) / (Nk[0] - t0) : 0;
    out[c] = h00 * A[c] + h10 * d * m0 + h01 * B[c] + h11 * d * m1;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------- the move set
const RUN = pose({ hipY: -0.05, lean: 0.14, rY: -0.45, rP: 1.42, rR: 0.25, rE: 0.5, rWp: 1.3, rWy: 0.05, lP: 1.0, lE: 0.9 });
const SPRINT = pose({ hipY: -0.07, lean: 0.3, twist: 0, cT: 0, cB: 0.1, rY: -0.45, rP: 1.95, rR: 0.3, rE: 0.25, rWp: 0.7, rWy: 0,
  lY: 0.15, lP: 1.0, lE: 1.45 });

// light chain: anticipation (end of wind-up), strike (end of the active frames), follow-through
export const LIGHT = [
  { // 1 — forehand diagonal, high right → low left
    ready: pose({ hipY: -0.08, lean: 0.08, twist: -0.45, cT: -0.5, cS: 0.12, rY: -1.2, rP: -0.9, rR: -0.6, rE: 1.5, rWp: 0.8, rWy: -0.3, lY: 0.75, lP: 0.6, lE: 0.5 }),
    strike: pose({ hipY: -0.13, lean: 0.28, twist: 0.22, cT: 0.45, cS: -0.12, cB: 0.15, rY: 0.55, rP: 0.6, rR: 0.35, rE: 0.1, rWp: 0.15, rWy: 0.25, lY: 0.35, lP: 1.45, lE: 0.3 }),
    follow: pose({ hipY: -0.11, lean: 0.22, twist: 0.3, cT: 0.6, cS: -0.1, cB: 0.12, rY: 0.8, rP: 0.85, rR: 0.4, rE: 0.4, rWp: 0.35, rWy: 0.4, lY: 0.3, lP: 1.4, lE: 0.3 }),
  },
  { // 2 — rising backhand, low left → high right
    ready: pose({ hipY: -0.1, lean: 0.12, twist: 0.35, cT: 0.55, cS: -0.08, rY: 1.0, rP: 0.8, rR: 1.3, rE: 0.95, rWp: 0.25, rWy: 0.55, lY: 0.1, lP: 1.3, lE: 0.4 }),
    strike: pose({ hipY: -0.04, lean: 0.2, twist: -0.3, cT: -0.55, cS: 0.12, rY: -0.5, rP: -0.35, rR: 0.6, rE: 0.1, rWp: -0.2, rWy: -0.3, lY: 0.75, lP: 0.6, lE: 0.5 }),
    follow: pose({ hipY: -0.06, lean: 0.16, twist: -0.36, cT: -0.68, cS: 0.14, rY: -0.75, rP: -0.6, rR: 0.6, rE: 0.35, rWp: -0.35, rWy: -0.4, lY: 0.8, lP: 0.6, lE: 0.5 }),
  },
  { // 3 — spinning slash: a full turn with the blade held wide
    ready: pose({ hipY: -0.14, lean: 0.16, spinY: -0.9, twist: -0.2, cT: -0.45, rY: -1.55, rP: 0.5, rR: -0.2, rE: 0.45, rWp: 0.05, rWy: -0.35, lY: 0.9, lP: 0.8, lE: 0.4, fb: 1 }),
    strike: pose({ hipY: 0.03, lean: 0.1, spinY: 3.9, twist: 0.1, cT: 0.15, rY: -1.3, rP: 0.25, rR: 0, rE: 0.05, rWp: 0.0, rWy: 0.0, lY: 1.2, lP: 0.55, lE: 0.3, fb: 1 }),
    follow: pose({ hipY: -0.12, lean: 0.2, spinY: TAU + 0.25, twist: 0.25, cT: 0.45, rY: 0.9, rP: 0.75, rR: 0.3, rE: 0.4, rWp: 0.3, rWy: 0.3, lY: 0.4, lP: 1.3, lE: 0.4, fb: 0.3 }),
    ease: { body: u => lerp(u, ease.inOutQ(u), 0.4), arm: ease.outQ, wrist: ease.outQ }, followK: 0.42, trail: 0.13,
  },
];
// heavy — two-handed leaping overhead slam
export const HEAVY = {
  ready: pose({ hipY: -0.17, lean: -0.08, cB: -0.25, twist: -0.1, cT: 0.05, rY: 0.6, rP: -1.9, rR: 0, rE: 1.0, rWp: -0.8, rWy: 0, lIK: 1, hP: -0.1 }),
  hop: pose({ hipY: 0.1, lean: -0.15, cB: -0.35, twist: -0.05, cT: 0.05, rY: 0.6, rP: -2.05, rR: 0, rE: 1.15, rWp: -1.0, rWy: 0, lIK: 1, hP: -0.15, fb: 0.35 }),
  strike: pose({ hipY: -0.3, lean: 0.35, cB: 0.3, twist: 0, cT: 0.08, rY: 0.3, rP: 0.0, rR: 0, rE: 0.05, rWp: 0.0, rWy: 0, lIK: 1, hP: 0.15 }),
  follow: pose({ hipY: -0.33, lean: 0.4, cB: 0.35, twist: 0, cT: 0.08, rY: 0.3, rP: 0.1, rR: 0, rE: 0.1, rWp: 0.15, rWy: 0, lIK: 1, hP: 0.2 }),
  hopAt: 0.62, ease: { body: ease.inQ, arm: u => ease.inQ(Math.min(1, u * 1.15)), wrist: ease.inC }, followK: 0.38, trail: 0.03,
};

// roll: dive → tucked somersault (spinX is added on top) → landing crouch
const ROLL = [
  [0, pose({ hipY: -0.06, lean: 0.25 })],
  [0.13, pose({ hipY: -0.12, lean: 0.55, cB: 0.45, hP: 0.4, cy: -0.2, sq: 0.3, fb: 0.6, tuck: 0.4, rY: -0.2, rP: 0.6, rE: 1.9, rWp: 0.9, rWy: 0, lP: 0.4, lE: 2.0 })],
  [0.32, pose({ hipY: -0.08, lean: 0.3, cB: 0.8, hP: 0.6, cy: -0.33, sq: 0.6, fb: 1, tuck: 1, rY: -0.1, rP: 0.5, rE: 2.0, rWp: 1.0, rWy: 0, lP: 0.4, lE: 2.1 })],
  [0.56, pose({ hipY: -0.08, lean: 0.3, cB: 0.8, hP: 0.6, cy: -0.33, sq: 0.6, fb: 1, tuck: 1, rY: -0.1, rP: 0.5, rE: 2.0, rWp: 1.0, rWy: 0, lP: 0.4, lE: 2.1 })],
  [0.72, pose({ hipY: -0.22, lean: 0.32, cB: 0.2, hP: 0.1, cy: -0.05, sq: 0.1, fb: 0.15, tuck: 0.1, rY: -0.9, rP: 0.85, rE: 0.35, rWp: 0.2, rWy: -0.2, lY: 0.9, lP: 0.7, lE: 0.4 })],
  [1, pose({ hipY: -0.08, lean: 0.12 })],
];
const ROLL_SPIN = [0.06, 0.66];          // the somersault happens between these fractions of the roll

// knock-down: launched back, lands, bounces, lies, sits up, kneels, stands
const DOWN = [
  [0, pose({ hipY: 0.04, lean: -0.55, cB: -0.4, hP: -0.5, rY: -0.7, rP: -0.4, rE: 0.4, rWp: 0.3, lY: 0.9, lP: -0.3, lE: 0.4, fb: 0.4 })],
  [0.16, pose({ hipY: -0.12, lean: -1.15, cB: -0.15, hP: -0.2, rY: -0.9, rP: -0.6, rE: 0.3, lY: 1.0, lP: -0.5, lE: 0.3, fb: 1 })],
  [0.27, pose({ hipY: -0.34, lean: -1.5, cB: 0.05, hP: 0.25, rY: -1.1, rP: 0.25, rE: 0.25, lY: 1.1, lP: 0.25, lE: 0.25, fb: 1, tuck: 0.3 })],
  [0.33, pose({ hipY: -0.27, lean: -1.42, cB: 0.12, hP: 0.4, rY: -1.0, rP: 0.15, rE: 0.4, lY: 1.0, lP: 0.15, lE: 0.4, fb: 1, tuck: 0.4 })],
  [0.4, pose({ hipY: -0.34, lean: -1.5, cB: 0.05, hP: 0.3, rY: -1.1, rP: 0.3, rE: 0.3, lY: 1.1, lP: 0.3, lE: 0.3, fb: 1, tuck: 0.3 })],
  [0.62, pose({ hipY: -0.34, lean: -1.45, cB: 0.15, side: 0.15, cT: 0.15, hP: 0.45, rY: -1.0, rP: 0.6, rE: 0.5, lY: 1.0, lP: 0.6, lE: 0.6, fb: 1, tuck: 0.45 })],
  [0.78, pose({ hipY: -0.38, lean: -0.45, cB: 0.45, side: 0.12, hP: 0.3, rY: -0.6, rP: 1.3, rE: 0.4, rWp: 0.5, lY: 0.6, lP: 1.65, lE: 0.1, fb: 0.7, tuck: 0.7 })],
  [0.9, pose({ hipY: -0.26, lean: 0.4, cB: 0.25, hP: 0.0, rY: -0.5, rP: 1.2, rE: 0.6, lY: 0.5, lP: 1.4, lE: 0.3, fb: 0.15, tuck: 0.2 })],
  [1, pose({ hipY: -0.1, lean: 0.18 })],
];
const DEAD = [
  [0, pose({ hipY: -0.04, lean: -0.3, cB: -0.3, hP: -0.4, rY: -0.7, rP: 0.2, rE: 0.4, lY: 0.8, lP: 0.3 })],
  [0.3, pose({ hipY: -0.36, lean: 0.12, cB: 0.38, hP: 0.45, rY: -0.4, rP: 1.45, rE: 0.1, rWp: 0.9, lY: 0.4, lP: 1.35, lE: 0.2 })],
  [0.5, pose({ hipY: -0.38, lean: 0.18, cB: 0.42, hP: 0.5, side: 0.2, rY: -0.4, rP: 1.5, rE: 0.1, rWp: 1.0, lY: 0.4, lP: 1.4, lE: 0.2 })],
  [0.78, pose({ hipY: -0.42, lean: 0.3, cB: 0.2, hP: 0.2, side: 1.15, rY: -1.2, rP: 0.9, rE: 0.2, rWp: 0.4, lY: 0.9, lP: 0.6, lE: 0.5, fb: 0.8, tuck: 0.3 })],
  [0.86, pose({ hipY: -0.38, lean: 0.3, cB: 0.2, hP: 0.25, side: 1.3, rY: -1.2, rP: 0.9, rE: 0.25, rWp: 0.4, lY: 0.9, lP: 0.6, lE: 0.5, fb: 1, tuck: 0.3 })],
  [1, pose({ hipY: -0.43, lean: 0.28, cB: 0.18, hP: 0.3, side: 1.38, rY: -1.25, rP: 0.85, rE: 0.2, rWp: 0.4, lY: 0.95, lP: 0.55, lE: 0.55, fb: 1, tuck: 0.3 })],
];
const DEAD_LEN = 1.5;
// flask: lower the sword, bring it to the mouth (IK), head back, then a surge as it takes hold
const HEAL = [
  [0, GUARD],
  [0.2, pose({ hipY: -0.05, rY: -0.4, rP: 1.35, rE: 0.35, rWp: 0.7, rWy: 0, lIK: 0.85, hP: -0.05 })],
  [0.36, pose({ hipY: -0.04, cB: -0.15, hP: -0.42, rY: -0.4, rP: 1.4, rE: 0.3, rWp: 0.75, rWy: 0, lIK: 1 })],
  [0.56, pose({ hipY: -0.04, cB: -0.18, hP: -0.48, rY: -0.4, rP: 1.4, rE: 0.3, rWp: 0.75, rWy: 0, lIK: 1 })],
  [0.68, pose({ hipY: 0.02, lean: -0.06, cB: -0.24, hP: -0.12, rY: -0.65, rP: 1.1, rE: 0.5, rWp: 0.3, lY: 0.75, lP: 0.85, lE: 0.35, lIK: 0 })],
  [0.84, pose({ hipY: -0.06, lean: 0.1, cB: 0.06 })],
  [1, GUARD],
];
const BLEND = { idle: 0.2, move: 0.2, roll: 0.07, heal: 0.15, hit: 0.05, down: 0.06, dead: 0.08, attack: 0 };

export const POSES = { GUARD, RUN, SPRINT, LIGHT, HEAVY, ROLL, DOWN, DEAD, HEAL };

// ---------------------------------------------------------------------------------------------- small physics
class Spring {
  constructor(w, z) { this.w = w; this.z = z; this.x = 0; this.v = 0; }
  step(target, dt) {
    const n = Math.ceil(dt * 120), h = n ? dt / n : 0;
    for (let i = 0; i < n; i++) { this.v += (this.w * this.w * (target - this.x) - 2 * this.z * this.w * this.v) * h; this.x += this.v * h; }
    return this.x;
  }
  reset(x = 0) { this.x = x; this.v = 0; }
}
class VSpring {
  constructor(w, z, x0 = [0, 0, 0]) { this.w = w; this.z = z; this.x0 = x0; this.x = new THREE.Vector3(...x0); this.v = new THREE.Vector3(); }
  step(target, dt) {
    const n = Math.ceil(dt * 120), h = n ? dt / n : 0, w2 = this.w * this.w, c = 2 * this.z * this.w;
    for (let i = 0; i < n; i++) {
      this.v.x += (w2 * (target.x - this.x.x) - c * this.v.x) * h; this.v.y += (w2 * (target.y - this.x.y) - c * this.v.y) * h; this.v.z += (w2 * (target.z - this.x.z) - c * this.v.z) * h;
      this.x.addScaledVector(this.v, h);
    }
    return this.x;
  }
  reset() { this.x.set(...this.x0); this.v.set(0, 0, 0); }
}

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _d = new THREE.Vector3(), _t = new THREE.Vector3(), _u = new THREE.Vector3();
const _y = new THREE.Vector3(), _x = new THREE.Vector3(), _pp = new THREE.Vector3(), _h = new THREE.Vector3(), _k = new THREE.Vector3();
const _a = new THREE.Vector3(), _fw = new THREE.Vector3(), _g = new THREE.Vector3(), _tw = new THREE.Vector3(), _pole = new THREE.Vector3();
const _M = new THREE.Matrix4(), _C = new THREE.Matrix4(), _Mi = new THREE.Matrix4(), _mr = new THREE.Matrix4(), _mb = new THREE.Matrix4();
const _q = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qg = new THREE.Quaternion(), _pq = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const UP = new THREE.Vector3(0, 1, 0), DOWNV = new THREE.Vector3(0, -1, 0);

// two-bone IK: from joint origin to target (both in the parent's space), bending toward `pole`.
// Returns the bend angle and writes the upper-segment basis (z along the segment, +y toward the target side) into _mb.
function solve2(origin, target, a, b, pole) {
  _d.subVectors(target, origin);
  const d = clamp(_d.length(), 0.06, a + b - 0.002);
  _d.normalize();
  const A = Math.acos(clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1));
  const bend = Math.PI - Math.acos(clamp((a * a + b * b - d * d) / (2 * a * b), -1, 1));
  _pp.copy(pole).addScaledVector(_d, -pole.dot(_d));
  if (_pp.lengthSq() < 1e-6) _pp.set(0, 1, 0).addScaledVector(_d, -_d.y);
  _pp.normalize();
  _u.copy(_d).multiplyScalar(Math.cos(A)).addScaledVector(_pp, Math.sin(A));          // upper segment
  _y.copy(_d).multiplyScalar(Math.sin(A)).addScaledVector(_pp, -Math.cos(A));         // ⟂, toward the target
  _x.crossVectors(_y, _u);
  _mb.makeBasis(_x, _y, _u);
  return { bend, d };
}

// cloth: per-vertex angle around the body, hem weight and chest-skin weight
function clothInfo(mesh, hemTop, hemBot, skinLo, skinHi) {
  const pos = mesh.geometry.attributes.position; pos.setUsage(THREE.DynamicDrawUsage);
  const base = Float32Array.from(pos.array), n = pos.count, info = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const x = base[i * 3], y = base[i * 3 + 1], z = base[i * 3 + 2];
    info[i * 3] = Math.atan2(x, z);
    info[i * 3 + 1] = Math.pow(clamp((hemTop - y) / (hemTop - hemBot), 0, 1), 1.6);
    info[i * 3 + 2] = skinHi > skinLo ? ease.inOutS(clamp((y - skinLo) / (skinHi - skinLo), 0, 1)) : 0;
  }
  return { mesh, pos, base, info, n };
}

export class PlayerAnim {
  constructor(player, rig) {
    this.p = player; this.R = rig;
    this.cloak = clothInfo(rig.cloak, 0.95, 0.0, 0.62, 1.12);
    this.mantle = clothInfo(rig.mantle, 1.36, 0.96, 0, 0);
    this.out = { ...GUARD }; this.tgt = { ...GUARD }; this.off = { ...ZERO }; this.from = { ...GUARD };
    this.leanS = new Spring(13, 0.42); this.sideS = new Spring(13, 0.42);
    this.trailS = new VSpring(8, 0.32); this.flareS = new Spring(11, 0.35);
    this.lanD = new VSpring(9, 0.12, [0, -1, 0]); this.tailD = new VSpring(7, 0.2, [0, -1, 0]);
    this.vs = new THREE.Vector3(); this.acc = new THREE.Vector3(); this.wind = new THREE.Vector3();
    this.pend = [{ obj: rig.lantern, D: this.lanD, accK: 0.5, drag: 0.25 }, { obj: rig.tail, D: this.tailD, accK: 0.7, drag: 1.1 }];
    for (const pd of this.pend) { pd.pos = new THREE.Vector3(); pd.vel = new THREE.Vector3(); pd.acc = new THREE.Vector3(); }
    this.legPts = new Float32Array(12);              // knees and ankles in model space: the hem makes room for them
    this.reset();
  }

  reset() {
    Object.assign(this.out, GUARD); Object.assign(this.off, ZERO);
    this.key = ''; this.offT = 1; this.offDur = 0.1;
    for (const s of [this.leanS, this.sideS, this.flareS, this.trailS, this.lanD, this.tailD]) s.reset();
    this.vs.set(0, 0, 0); this.acc.set(0, 0, 0); this.wind.set(0, 0, 0);
    this.phase = 0; this.spd = 0; this.moveW = 0; this.sprintK = 0; this.clock = 0; this.C = 1.5;
    this.gdx = 0; this.gdz = 1; this.lastQ = [0, 0.5]; this.fresh = true; this.trailOn = false;
    this.prevSpin = null; this.landed = ''; this.fell = '';
  }

  // ------------------------------------------------------------------------------------------- per frame
  update(dt, ctx) {
    const p = this.p, s = p.state, t = p.t;
    this.clock += dt; this.dt = dt;

    // kinematics: smoothed velocity → acceleration (drives lean, cloth, pendulums)
    if (dt > 0) {
      _w.copy(this.vs);
      this.vs.lerp(_v.set(p.vel.x, 0, p.vel.z), 1 - Math.exp(-12 * dt));
      this.acc.subVectors(this.vs, _w).divideScalar(dt);
      if (this.acc.length() > 60) this.acc.setLength(60);
    }
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    const aF = this.acc.x * fx + this.acc.z * fz, aL = this.acc.x * fz - this.acc.z * fx;
    const spd = Math.hypot(p.vel.x, p.vel.z);
    this.spd = damp(this.spd, spd, 14, dt);
    this.moveW = damp(this.moveW, clamp(spd / 1.2, 0, 1), 10, dt);
    this.sprintK = damp(this.sprintK, p.sprinting ? 1 : 0, 5, dt);
    this.C = lerp(lerp(1.3, 2.1, clamp((this.spd - 1.5) / 3.3, 0, 1)), 2.7, this.sprintK);
    this.phase = (this.phase + spd * dt / this.C) % 1;
    this.wind.multiplyScalar(Math.exp(-2.2 * dt));

    // state change → inertial blend from the pose we were in
    const loco = s === 'idle' || s === 'move';
    const key = loco ? 'loco' : s + p.serial;
    const entering = key !== this.key;
    if (entering) { this.key = key; this.enter(s, aF, aL); }
    const o = this.target(s, t, ctx);
    if (entering) {
      for (const k of CH) this.off[k] = WRAP[k] ? wrapAngle(this.out[k] - o[k]) : this.out[k] - o[k];
      this.offT = 0; this.offDur = BLEND[s] ?? 0.12;
    }
    // momentum layer: lean into acceleration and turns, settle back with a little overshoot
    const grounded = loco || s === 'heal' ? 1 : s === 'attack' ? 0.6 : s === 'hit' ? 0.5 : 0;
    this.leanS.step(clamp(aF * 0.02, -0.32, 0.28) * grounded, dt);
    this.sideS.step(clamp(-aL * 0.018, -0.28, 0.28) * grounded, dt);
    o.lean += this.leanS.x; o.side += this.sideS.x;
    this.head(o, s, ctx);

    this.offT += dt;
    const dk = this.offT >= this.offDur ? 0 : 1 - ease.inOutS(this.offT / this.offDur);
    for (const k of CH) this.out[k] = o[k] + this.off[k] * dk;

    this.apply(this.out, s);
    this.events(s, t, ctx);
    this.fresh = false;
  }

  enter(s, aF, aL) {
    const p = this.p;
    if (s === 'attack') Object.assign(this.from, this.out);
    if (s === 'hit' || s === 'down' || s === 'dead') {
      const h = p.hitAway, fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
      const hF = h.x * fx + h.z * fz, hL = h.x * fz - h.z * fx;          // where the blow sends us, in body terms
      this.hF = hF; this.hL = hL;
      if (s === 'hit' && p.hitKind === 'push') { this.wind.copy(h).multiplyScalar(1.4); this.hitKeys = this.braceKeys(hF, hL); }
      else if (s === 'hit') { this.hitKeys = this.flinchKeys(hF, hL); this.leanS.v += 5 * hF; this.sideS.v -= 5 * hL; }
      this.flareS.v += 2.5;
    }
  }

  flinchKeys(hF, hL) {
    return [
      [0, pose({ hipY: -0.08, lean: 0.6 * hF, side: -0.5 * hL, cB: 0.5 * hF, cT: 0.5 * hL, hP: 0.6 * hF, rY: -0.7, rP: 0.2, rE: 0.6, rWp: 0.4, lY: 0.9, lP: 0.3, lE: 0.3 })],
      [0.2, pose({ hipY: -0.13, lean: 0.25 * hF, side: -0.25 * hL, cB: 0.22 * hF, cT: 0.2 * hL, hP: 0.15 * hF, rY: -0.5, rP: 0.8, rE: 0.8, rWp: 0.2, lY: 0.6, lP: 0.8, lE: 0.4 })],
      [0.62, pose({ hipY: -0.08, lean: 0.1 })],
      [1, GUARD],
    ];
  }
  braceKeys(hF, hL) {
    // lean into the blast, shield the face with the off arm, sword low
    const b = pose({ hipY: -0.16, lean: clamp(-0.4 * hF, -0.1, 0.45), side: 0.3 * hL, cB: 0.22, hP: 0.35, rY: -0.5, rP: 1.6, rR: 0.2, rE: 0.3, rWp: 0.7, lY: -0.55, lP: -0.55, lE: 2.05 });
    return [[0, pose({ hipY: -0.1, lean: -0.2 * hF, hP: -0.2 })], [0.15, b], [0.7, b], [1, GUARD]];
  }

  target(s, t, ctx) {
    const o = this.tgt;
    switch (s) {
      case 'idle': case 'move': this.loco(o); break;
      case 'attack': this.attack(o, t); break;
      case 'roll': {
        const k = t / P.roll.dur;
        track(ROLL, k, o);
        o.spinX = TAU * ease.inOutQ(clamp((k - ROLL_SPIN[0]) / (ROLL_SPIN[1] - ROLL_SPIN[0]), 0, 1));
        break;
      }
      case 'heal': track(HEAL, t / P.heal.dur, o); break;
      case 'hit': track(this.hitKeys || this.flinchKeys(-1, 0), t / P.hitStun, o); break;
      case 'down': track(DOWN, t / P.downTime, o); break;
      case 'dead': track(DEAD, t / DEAD_LEN, o); break;
      default: Object.assign(o, GUARD);
    }
    return o;
  }

  loco(o) {
    const p = this.p, m = this.moveW, sk = this.sprintK, ph = this.phase * TAU, c = this.clock;
    mix(GUARD, RUN, m * (1 - sk), o);
    mix(o, SPRINT, sk * m, o);
    const sn = Math.sin(ph), bob = -Math.cos(2 * ph - 0.5);
    o.hipY += m * ((0.03 + 0.02 * sk) * bob - 0.014);
    o.side -= m * 0.05 * sn;
    o.twist += m * 0.11 * sn; o.cT -= m * 0.15 * sn;
    o.lP -= m * (0.5 + 0.3 * sk) * sn; o.lE += m * 0.25 * Math.max(0, -sn);
    o.rP += m * (0.05 + 0.1 * sk) * Math.sin(ph + 0.6);
    // lean the way we travel (strafing included)
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    const vF = this.vs.x * fx + this.vs.z * fz, vL = this.vs.x * fz - this.vs.z * fx;
    o.lean += clamp(vF / P.runSpeed, -1, 1.6) * 0.07;
    o.side -= clamp(vL / P.runSpeed, -1, 1) * 0.08;
    // breathing and a slow weight shift at rest
    const idle = 1 - m;
    o.cB += idle * 0.022 * Math.sin(c * 2.2); o.hipY += idle * 0.008 * Math.sin(c * 2.2 + 0.8);
    o.rP += idle * 0.018 * Math.sin(c * 2.2 + 0.3); o.side += idle * 0.02 * Math.sin(c * 0.55);
  }

  attack(o, t) {
    const a = this.p.atk;
    if (!a) return Object.assign(o, GUARD);
    const d = a.d, S = a.kind === 'heavy' ? HEAVY : LIGHT[a.step];
    const tA = d.windup, tB = tA + d.active, tE = tB + d.recovery, tF = tB + d.recovery * (S.followK || 0.35);
    if (t < tA) {
      const u = t / tA;
      if (S.hop) {
        if (u < S.hopAt) return mix(this.from, S.ready, ease.outC(u / S.hopAt), o);
        return mix(S.ready, S.hop, ease.inOutQ((u - S.hopAt) / (1 - S.hopAt)), o, false);
      }
      return mix(this.from, S.ready, ease.outC(u), o);
    }
    if (t < tB) return mixGroups(S.hop || S.ready, S.strike, (t - tA) / d.active, S.ease || SWING, o);
    if (t < tF) return mix(S.strike, S.follow, ease.outQ((t - tB) / (tF - tB)), o, false);
    return mix(S.follow, GUARD, ease.inOutS(clamp((t - tF) / (tE - tF), 0, 1)), o);      // spins settle facing forward
  }

  // keep the gaze steady and on the colossus when locked on (a dancer's spot during the spin)
  head(o, s, ctx) {
    const stab = s === 'down' || s === 'dead' || s === 'roll' ? 0 : 1;
    if (!stab) return;
    const p = this.p, chestYaw = p.yaw + o.spinY + o.twist + o.cT;
    let gaze = p.yaw;
    if (ctx.locked && ctx.boss && ctx.boss.alive) gaze = Math.atan2(ctx.boss.pos.x - p.pos.x, ctx.boss.pos.z - p.pos.z);
    o.hY += clamp(wrapAngle(gaze - chestYaw), -1.0, 1.0);
    o.hP -= (o.lean + o.cB) * 0.45;
  }

  // ------------------------------------------------------------------------------------------- rig
  apply(o, s) {
    const p = this.p, R = this.R;
    p.root.position.copy(p.pos); p.root.rotation.set(0, p.yaw, 0);
    R.tumble.position.y = RIG.center + o.cy;
    R.tumble.rotation.set(o.spinX, o.spinY, 0);
    R.tumble.scale.set(1 + 0.12 * o.sq, 1 - 0.2 * o.sq, 1 + 0.12 * o.sq);
    R.body.position.y = RIG.hip + o.hipY;
    R.body.rotation.set(o.lean, o.twist, o.side);
    R.chest.rotation.set(o.cB, o.cT, o.cS);
    R.head.rotation.set(o.hP, o.hY, 0);
    R.armR.sh.rotation.set(o.rP, o.rY, o.rR); R.armR.el.rotation.x = -o.rE; R.armR.hand.rotation.set(o.rWp, o.rWy, 0);
    R.armL.sh.rotation.set(o.lP, o.lY, o.lR); R.armL.el.rotation.x = -o.lE;
    if (o.lIK > 0.001) this.offHand(clamp(o.lIK, 0, 1), s === 'heal' ? 'mouth' : 'grip');
    const k = s === 'heal' ? p.t / P.heal.dur : 1;
    R.flask.visible = s === 'heal' && k > 0.08 && k < 0.66;

    for (const g of [R.tumble, R.body, R.chest]) g.updateMatrix();
    _M.multiplyMatrices(R.tumble.matrix, R.tumbleOff.matrix).multiply(R.body.matrix).multiply(R.off.matrix);   // model → root
    _mr.extractRotation(_M); _qb.setFromRotationMatrix(_mr);
    this.legs(o, s);
    p.root.updateMatrixWorld(true);
    this.clothes(o, s);
    this.pendulums();
  }

  // off hand to the sword grip (two-handed) or the flask to the mouth
  offHand(w, mode) {
    const L = this.R.armL, A = this.R.armR;
    if (mode === 'grip') {
      for (const g of [A.sh, A.el, A.hand]) g.updateMatrix();
      _C.multiplyMatrices(A.sh.matrix, A.el.matrix).multiply(A.hand.matrix);
      _t.set(0, 0, -0.1).applyMatrix4(_C);
    } else _t.set(0.03, 1.43, 0.26);
    const { bend } = solve2(L.sh.position, _t, RIG.upper, RIG.fore, _pole.set(0.75, -0.65, -0.15));
    _q.setFromRotationMatrix(_mb);
    L.sh.quaternion.slerp(_q, w);
    L.el.rotation.x = lerp(L.el.rotation.x, -bend, w);
  }

  // feet: a stride cycle while moving, a fighting stance at rest; tucked against the body in rolls and falls
  legs(o, s) {
    const R = this.R, p = this.p, m = this.moveW;
    _fw.set(0, 0, 1).applyQuaternion(_qb);                 // knees point where the hips face
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    const vF = p.vel.x * fx + p.vel.z * fz, vL = p.vel.x * fz - p.vel.z * fx, vl = Math.hypot(vF, vL);
    if (vl > 0.3) { this.gdx = damp(this.gdx, vL / vl, 12, this.dt); this.gdz = damp(this.gdz, vF / vl, 12, this.dt); }
    _Mi.copy(_M).invert();
    const gl = Math.hypot(this.gdx, this.gdz) || 1, gx = this.gdx / gl, gz = this.gdz / gl;
    const A = Math.min(this.C / 4, 0.3), h = lerp(0.06, 0.13, clamp((this.spd - 1.5) / 3.3, 0, 1)) + 0.05 * this.sprintK;
    R.legs.forEach((L, i) => {
      const side = L.side, q = (this.phase + (side > 0 ? 0 : 0.5)) % 1;
      let sft, lift = 0, sw = 0;
      if (q < 0.5) sft = A * (1 - 4 * q);
      else { sw = (q - 0.5) / 0.5; sft = -A + 2 * A * ease.inOutS(sw); lift = h * Math.sin(Math.PI * sw); }
      const sx = side > 0 ? 0.14 : -0.15, sz = side > 0 ? 0.12 : -0.13;
      _a.set(lerp(sx, side * 0.13 + gx * sft, m), RIG.ankle + lift * m, lerp(sz, gz * sft, m));
      _e.set(m * (lift > 0 ? 0.45 * Math.sin(TAU * sw) : 0), side * 0.12, 0); _qg.setFromEuler(_e);
      if (o.fb > 0.001) {                                  // foot carried by the body
        _t.set(side * RIG.hipX, lerp(RIG.ankle, 0.44, o.tuck), lerp(0.03, 0.3, o.tuck)).applyMatrix4(_M);
        _a.lerp(_t, clamp(o.fb, 0, 1));
        _e.set(-0.5 * o.tuck, 0, 0); _q.setFromEuler(_e).premultiply(_qb);
        _qg.slerp(_q, clamp(o.fb, 0, 1));
      }
      _h.set(side * RIG.hipX, RIG.hipJ, 0).applyMatrix4(_M);
      const { d } = solve2(_h, _a, RIG.thigh, RIG.shin, _fw);
      _a.copy(_h).addScaledVector(_d, d);                  // where the foot actually reaches
      _k.copy(_h).addScaledVector(_u, RIG.thigh);          // knee
      place(L.thigh, _h, _k); place(L.shin, _k, _a);
      L.boot.position.copy(_a); L.boot.quaternion.copy(_qg);
      _t.copy(_k).applyMatrix4(_Mi); this.legPts.set([_t.x, _t.y, _t.z], i * 6);
      _t.copy(_a).applyMatrix4(_Mi); this.legPts.set([_t.x, _t.y, _t.z], i * 6 + 3);
      L.q = q;
    });
  }

  // cloak skinned to hips + chest; the hem trails behind motion, hangs toward the ground, flares when spinning
  clothes(o, s) {
    const R = this.R, p = this.p;
    // angular speed of the figure (spins and rolls fling the hem out)
    const spin = { x: o.spinX, y: o.spinY + p.yaw };
    let w = 0;
    if (this.prevSpin && this.dt > 0) w = Math.hypot(wrapAngle(spin.x - this.prevSpin.x), wrapAngle(spin.y - this.prevSpin.y)) / this.dt;
    this.prevSpin = spin;
    this.flareS.step(clamp(w * 0.025 + this.spd * 0.008, 0, 0.38), this.dt);
    // trailing offset in world space (inertia + drag + wind), then into the model's frame
    _tw.copy(this.vs).multiplyScalar(-0.035).addScaledVector(this.acc, -0.004).addScaledVector(this.wind, 0.3);
    _tw.y = 0; if (_tw.length() > 0.42) _tw.setLength(0.42);
    this.trailS.step(_tw, this.dt);
    R.off.getWorldQuaternion(_pq); _pq.invert();
    _t.copy(this.trailS.x).applyQuaternion(_pq);
    // gravity: a leaning body still lets its hem hang toward the ground (not while tumbling)
    _g.copy(DOWNV).applyQuaternion(_pq);
    const gw = 0.7 * (1 - clamp(o.fb, 0, 1));
    const tx = _t.x + _g.x * gw, tz = _t.z + _g.z * gw, lift = (tx * tx + tz * tz) * 0.55 + Math.max(0, this.flareS.x) * 0.3;
    const flare = Math.max(0, this.flareS.x), flutter = 0.012 * this.spd + this.wind.length() * 0.02;
    R.chest.updateMatrix(); _C.multiplyMatrices(R.chest.matrix, R.chestOff.matrix);
    this.deform(this.cloak, _C, tx, tz, lift, flare, flutter, true, o.tuck);
    this.deform(this.mantle, null, tx * 0.35, tz * 0.35, lift * 0.3, flare * 0.6, flutter * 0.6, false, 0);
  }

  deform(c, M, tx, tz, lift, flare, flutter, legs, tuck) {
    const a = c.pos.array, B = c.base, I = c.info, T = this.clock, LP = this.legPts;
    for (let i = 0; i < c.n; i++) {
      let x = B[i * 3], y = B[i * 3 + 1], z = B[i * 3 + 2];
      const ang = I[i * 3], h = I[i * 3 + 1], w = I[i * 3 + 2];
      if (M && w > 0) { _v.set(x, y, z).applyMatrix4(M); x += (_v.x - x) * w; y += (_v.y - y) * w; z += (_v.z - z) * w; }
      if (h > 0) {
        const sa = Math.sin(ang), ca = Math.cos(ang);
        const r = (flare * (1 + 0.35 * Math.sin(ang * 5 + T * 9)) + flutter * Math.sin(ang * 7 - T * 15)) * h;
        if (tuck > 0) { const g = 1 - 0.5 * tuck * h; x *= g; z *= g; y += 0.25 * tuck * h; }      // gathered into a ball
        x += sa * r + tx * h; z += ca * r * 0.86 + tz * h; y += (lift + flare * 0.25) * h * h;
        if (legs) {                         // knees and feet push the hem out instead of poking through it
          const rv = x * sa + z * ca; let push = 0;
          for (let j = 0; j < 12; j += 3) {
            const px = LP[j], py = LP[j + 1], pz = LP[j + 2], pn = Math.hypot(px, pz);
            if (pn < 0.05) continue;
            const cs = (sa * px + ca * pz) / pn, wy = 1 - Math.abs(y - py) / 0.45;
            if (cs < 0.35 || wy <= 0) continue;
            const need = cs * pn + 0.09 - rv;
            if (need > 0) { const f = (cs - 0.35) / 0.65; push = Math.max(push, need * f * f * Math.min(1, wy * 1.6)); }
          }
          x += sa * push; z += ca * push;
        }
      }
      a[i * 3] = x; a[i * 3 + 1] = y; a[i * 3 + 2] = z;
    }
    c.pos.needsUpdate = true;
    c.mesh.geometry.computeVertexNormals();
  }

  // lantern and sash tail hang toward world-down, pushed by the hook's acceleration and drag
  pendulums() {
    const dt = this.dt;
    for (const pd of this.pend) {
      pd.obj.getWorldPosition(_v);
      if (this.fresh || dt <= 0) { if (this.fresh) { pd.pos.copy(_v); pd.vel.set(0, 0, 0); pd.acc.set(0, 0, 0); } }
      else {
        _w.subVectors(_v, pd.pos).divideScalar(dt); pd.pos.copy(_v);
        _t.subVectors(_w, pd.vel).divideScalar(dt); pd.vel.copy(_w);
        if (_t.length() > 80) _t.setLength(80);
        pd.acc.lerp(_t, 1 - Math.exp(-25 * dt));
        _g.set(0, -9.8, 0).addScaledVector(pd.acc, -pd.accK).addScaledVector(pd.vel, -pd.drag).addScaledVector(this.wind, 3).normalize();
        pd.D.step(_g, dt);
      }
      pd.obj.parent.getWorldQuaternion(_pq); _pq.invert();
      _t.copy(pd.D.x); if (_t.lengthSq() < 1e-6) _t.set(0, -1, 0);
      _t.normalize().applyQuaternion(_pq);
      pd.obj.quaternion.setFromUnitVectors(DOWNV, _t);
      pd.obj.updateMatrixWorld(true);
    }
  }

  // footfalls, landings, the heavy's impact — for dust, sound and shake
  events(s, t, ctx) {
    const p = this.p, E = ctx.events;
    if (!E) return;
    if ((s === 'idle' || s === 'move') && this.spd > 3) {
      this.R.legs.forEach((L, i) => {
        if (this.lastQ[i] >= 0.5 && L.q < 0.5 && L.q < this.lastQ[i]) E.emit('player-step', { at: L.boot.getWorldPosition(new THREE.Vector3()), sprint: p.sprinting });
      });
    }
    this.R.legs.forEach((L, i) => { this.lastQ[i] = L.q; });
    if (s === 'roll' && t >= P.roll.dur * 0.62 && this.landed !== this.key) { this.landed = this.key; E.emit('player-land', { at: p.pos.clone(), k: 0.7 }); }
    if (s === 'down' && t >= P.downTime * 0.27 && this.fell !== this.key) { this.fell = this.key; E.emit('player-land', { at: p.pos.clone(), k: 1.2 }); }
    if (s === 'dead' && t >= DEAD_LEN * 0.78 && this.fell !== this.key) { this.fell = this.key; E.emit('player-land', { at: p.pos.clone(), k: 1.0 }); }
    const a = p.atk;
    this.trailOn = false;
    if (s === 'attack' && a) {
      const S = a.kind === 'heavy' ? HEAVY : LIGHT[a.step], tA = a.d.windup, tB = tA + a.d.active;
      this.trailOn = t >= tA - 0.02 && t <= tB + (S.trail ?? 0.05);
      if (a.kind === 'heavy' && t >= tB && !a.impacted) {
        a.impacted = true;
        E.emit('heavy-impact', { at: new THREE.Vector3(p.pos.x + Math.sin(p.yaw) * 1.5, 0, p.pos.z + Math.cos(p.yaw) * 1.5) });
      }
    }
  }

  // tools/poses.js: show one pose as-is
  debugPose(o, s = 'idle') { this.fresh = true; this.dt = 0; this.prevSpin = null; Object.assign(this.out, GUARD, o); this.apply(this.out, s); }
}

function place(mesh, a, b) {
  mesh.position.addVectors(a, b).multiplyScalar(0.5);
  _w.subVectors(b, a); const l = _w.length();
  if (l > 1e-5) mesh.quaternion.setFromUnitVectors(UP, _w.multiplyScalar(1 / l));
}
