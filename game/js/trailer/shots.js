// The v4 storyboard: the same 135 BPM grid as v1–v3 (music/edit: first true downbeat at 0.522 s), every shot a
// function of the trailer clock t. A shot gives the wanderer's path + directives (pup), the camera (cam), and the
// look of the frame (air, grade, bloom, moon, lantern).
import * as THREE from 'three';
import { pathX, groundH } from './forest.js';

export const BPM = 135, BEAT = 60 / BPM, BAR = BEAT * 4, D0 = 0.30 + BEAT / 2;
export const B = (n, b = 0) => D0 + n * BAR + b * BEAT;

const clamp01 = x => Math.max(0, Math.min(1, x));
const lerp = (a, b, x) => a + (b - a) * x;
const ramp = (t, a, b) => clamp01((t - a) / (b - a));
const E = { outC: x => 1 - Math.pow(1 - x, 3), ioC: x => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2, ioS: x => x * x * (3 - 2 * x), outQ: x => 1 - (1 - x) * (1 - x) };
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const pulse = (t, at, d) => t < at ? 0 : Math.exp(-(t - at) / d);

// along the path: position at distance s (z grows), facing down the path
const onPath = (z, off = 0) => ({ x: pathX(z) + off, z, yaw: Math.atan2(pathX(z + 0.5) - pathX(z - 0.5), 1) });
const fovFromMM = mm => 2 * Math.atan(12 / mm) * 180 / Math.PI;          // vertical fov of a full-frame 2.39:1-ish crop

const COLD_AIR = { density: 0.05, height: 5.5, ground: 1.6, groundH: 0.7, g: 0.66, noiseK: 1, moonCol: [1.2, 1.5, 2.2], ambCol: [0.0038, 0.0058, 0.011], maxD: 85 };
const COLD_GRADE = { exposure: 1.15, sat: 0.75, vig: 0.55, grain: 0.035, ca: 0.004, contrast: 0.12, lift: [0.25, 0.4, 0.7], gain: [0.98, 1.0, 1.04],
  shadowTint: [0.8, 0.95, 1.2], hiTint: [1.08, 1.0, 0.92] };
// where the colossus crouches in the dark, beyond the trees
const EYES = { x: 3.4, y: -0.6, z: 64 };
const moonFrom = (az, el) => V(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));

export const SHOTS = [
  // 1 — establishing. Low beside the path; the wanderer comes toward us out of the mist under shafts of moonlight.
  {
    name: 'path', t0: 0, t1: B(2),
    pup(t) { const z = 26 + 1.2 * (t - 0.0); const a = onPath(z, -0.15); return { ...a, lookY: 0.15 * Math.sin(t * 0.7), lookP: 0.05 }; },
    cam(t) {
      const k = E.ioS(ramp(t, 0, B(2)));
      const zc = 38.5 + 0.9 * t, x = pathX(zc) + lerp(1.1, 0.7, k);
      const pos = V(x, groundH(x, zc) + lerp(0.45, 0.75, k), zc);
      const w = this.pup(t), look = V(w.x, 1.2 + groundH(w.x, w.z), w.z);
      return { pos, look, fov: fovFromMM(lerp(40, 46, k)) };
    },
    look(t) {
      return { moonDir: moonFrom(Math.PI * 1.06, 0.66), moonI: 0.9, moonC: [0.62, 0.72, 1.0], air: COLD_AIR, lanI: 7, lanHalo: 0.06,
        grade: { ...COLD_GRADE, fade: E.outC(ramp(t, B(0) - 0.05, B(0) + 0.9)) }, bloom: [0.55, 0.55, 0.85] };
    },
  },
  // 2 — the lantern in the foreground, tracking with the walk in profile; the forest slides past behind
  {
    name: 'profile', t0: B(2), t1: B(3),
    pup(t) { const z = 32 + 1.2 * (t - B(2)); return { ...onPath(z, 0), lookY: -0.12, lookP: 0.02 }; },
    cam(t) {
      const w = this.pup(t), lt = t - B(2);
      const side = V(Math.cos(w.yaw), 0, -Math.sin(w.yaw));        // the wanderer's left
      const pos = V(w.x, 0, w.z).addScaledVector(side, 3.4).add(V(0, groundH(w.x, w.z) + 1.0, 0.45 - 0.15 * lt));
      const look = V(w.x, groundH(w.x, w.z) + 1.0, w.z + 0.35);
      return { pos, look, fov: fovFromMM(35) };
    },
    look() { return { moonDir: moonFrom(-Math.PI * 0.6, 0.65), moonI: 0.7, moonC: [0.62, 0.72, 1.0], air: { ...COLD_AIR, density: 0.042 }, lanI: 6, lanHalo: 0.04,
      grade: COLD_GRADE, bloom: [0.6, 0.6, 0.85], dof: { focus: 3.4, aperture: 22, max: 12 } }; },
  },
  // 3 — over the shoulder: it stops, lifts the lantern into the dark… and far between the trees two embers open
  {
    name: 'raise', t0: B(3), t1: B(4) + 0.4,
    pup(t) {
      const lt = t - B(3), stop = E.outQ(ramp(lt, 0, 0.7));
      const z = 34.2 + 1.2 * Math.min(lt, 0.7) * (1 - 0.5 * stop);
      return { ...onPath(z, 0), raise: E.ioC(ramp(lt, 0.15, 0.95)), lookY: lerp(0, -0.18, ramp(lt, 0.9, 1.6)), lookP: -0.06 };
    },
    cam(t) {
      const lt = t - B(3), w = this.pup(t);
      const k = E.ioS(ramp(lt, 0, 2.2));
      const back = V(-Math.sin(w.yaw), 0, -Math.cos(w.yaw)), left = V(Math.cos(w.yaw), 0, -Math.sin(w.yaw));
      const pos = V(w.x, groundH(w.x, w.z) + lerp(1.95, 2.1, k), w.z).addScaledVector(back, lerp(5.0, 4.5, k)).addScaledVector(left, 1.25);
      const look = V(lerp(w.x + 0.6, EYES.x - 0.4, 0.35), lerp(1.2, 1.6, k), lerp(w.z + 12, EYES.z, 0.3));
      return { pos, look, fov: fovFromMM(lerp(36, 40, k)) };
    },
    eyes(t) { const lt = t - B(3); return { ...EYES, on: E.outC(ramp(t, B(3, 1.5), B(3, 1.5) + 0.15)) * (1 - 0.9 * pulse(t, B(3, 3), 0.06) * (t < B(3, 3) + 0.1 ? 1 : 0)), lt }; },
    look(t) { return { rim: [0.1, 0.13, 0.2], moonDir: moonFrom(-Math.PI * 0.1, 0.6), moonI: 0.8, moonC: [0.62, 0.72, 1.0], air: { ...COLD_AIR, density: 0.06 }, lanI: lerp(7, 10, ramp(t, B(3), B(3) + 1)), lanHalo: 0.06,
      grade: COLD_GRADE, bloom: [0.65, 0.6, 0.85], dof: { focus: lerp(1.8, 22, E.ioC(ramp(t, B(3, 1.5) - 0.1, B(3, 1.5) + 0.5))), aperture: 23, max: 12 } }; },
  },
];
// room for the camera tracks: [x0, z0, x1, z1, radius]
export const CLEAR = [[pathX(31) + 3.4, 31, pathX(35.5) + 3.4, 35.5, 1.4],
  [pathX(36) + 0.5, 36, EYES.x - 0.3, EYES.z - 3, 1.1],           // the sightline to the eyes
  [EYES.x, EYES.z, EYES.x, EYES.z + 1, 3.6]];                     // room for the colossus itself
export const DURATION = SHOTS[SHOTS.length - 1].t1;
