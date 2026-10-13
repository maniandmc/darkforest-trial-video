// Visual effects: pooled GPU particles (sparks, embers, dust), ground rings, lava/nova decals, blade trail, flash lights.
import * as THREE from 'three';
import { lerp, clamp } from './math.js';
// cosmetic randomness only — never touches the seeded gameplay RNG
const rand = Math.random, randRange = (a, b) => a + (b - a) * Math.random();

const PART_VS = `
attribute float size; attribute vec4 col;
uniform float uScale;
varying vec4 vC;
void main(){
  vC = col;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(size * uScale / max(-mv.z, 0.1), 0.0, 96.0);
}`;
const PART_FS = `
varying vec4 vC;
void main(){
  vec2 p = gl_PointCoord - 0.5;
  float d = length(p);
  float a = smoothstep(0.5, 0.0, d); a *= a;
  if (a * vC.a < 0.003) discard;
  gl_FragColor = vec4(vC.rgb * a * vC.a, 1.0);
}`;

class Particles {
  constructor(scene, max) {
    this.max = max; this.n = 0;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 4); this.size = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('col', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
    this.mat = new THREE.ShaderMaterial({ vertexShader: PART_VS, fragmentShader: PART_FS, uniforms: { uScale: { value: 600 } },
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false; this.points.renderOrder = 5;
    scene.add(this.points); this.geo = g;
    this.p = [];   // {x,y,z, vx,vy,vz, life, age, size, r,g,b, grav, drag, fade, grow}
    this.budget = 1;
  }
  spawn(o) {
    if (this.p.length >= this.max) return;
    this.p.push(o);
  }
  update(dt) {
    const P = this.p;
    for (let i = P.length - 1; i >= 0; i--) {
      const q = P[i]; q.age += dt;
      if (q.age >= q.life) { P[i] = P[P.length - 1]; P.pop(); continue; }
      const dr = Math.exp(-q.drag * dt);
      q.vx *= dr; q.vy = q.vy * dr - q.grav * dt; q.vz *= dr;
      if (q.wobble) { q.vx += Math.sin(q.age * 3 + q.seed) * q.wobble * dt; q.vz += Math.cos(q.age * 2.3 + q.seed) * q.wobble * dt; }
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      if (q.y < 0.02 && q.bounce) { q.y = 0.02; q.vy *= -0.3; q.vx *= 0.6; q.vz *= 0.6; }
    }
    const n = Math.min(P.length, this.max);
    for (let i = 0; i < n; i++) {
      const q = P[i], k = q.age / q.life;
      const a = (q.fadeIn ? Math.min(1, q.age / q.fadeIn) : 1) * Math.pow(1 - k, q.fade || 1.5);
      this.pos[i * 3] = q.x; this.pos[i * 3 + 1] = q.y; this.pos[i * 3 + 2] = q.z;
      const heat = q.cool ? 1 - k * q.cool : 1;
      this.col[i * 4] = q.r * heat; this.col[i * 4 + 1] = q.g * heat * heat; this.col[i * 4 + 2] = q.b * heat * heat * heat; this.col[i * 4 + 3] = a;
      this.size[i] = q.size * (1 + (q.grow || 0) * k);
    }
    this.geo.setDrawRange(0, n);
    for (const k of ['position', 'col', 'size']) this.geo.attributes[k].needsUpdate = true;
  }
}

// ground ring / decal shader (annulus or filled disc with noise)
const RING_FS = `
uniform float uR, uW, uA, uT, uMode; uniform vec3 uColor;
varying vec2 vP;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(h(i),h(i+vec2(1,0)),u.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),u.x),u.y); }
void main(){
  float d = length(vP);
  float a = 0.0; vec3 c = uColor;
  if (uMode < 0.5) {            // shock ring
    a = smoothstep(uW, 0.0, abs(d - uR)) * (0.6 + 0.4 * n2(vP * 2.0 + uT * 3.0));
  } else if (uMode < 1.5) {     // warning circle (lava / nova): bright rim, faint pulsing fill
    float rim = smoothstep(0.18, 0.0, abs(d - uR));
    float fill = step(d, uR) * (0.09 + 0.06 * sin(uT * 12.0)) * smoothstep(0.0, uR, d + uR * 0.3);
    a = rim + fill;
  } else {                      // molten pool
    float e = smoothstep(uR, uR - 0.5, d + (n2(vP * 1.3 + uT * 0.2) - 0.5) * 0.7);
    float m = n2(vP * 2.2 + vec2(uT * 0.3, -uT * 0.2)) * 0.6 + n2(vP * 5.0 - uT * 0.5) * 0.4;
    c = mix(vec3(0.35, 0.03, 0.0), vec3(3.2, 1.1, 0.25), smoothstep(0.35, 0.85, m));
    a = e;
  }
  gl_FragColor = vec4(c * a * uA, a * uA);
}`;
const RING_VS = `varying vec2 vP; uniform float uSize; void main(){ vP = position.xy * uSize; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

export class FX {
  constructor(scene, quality) {
    this.scene = scene;
    this.parts = new Particles(scene, 2600);
    this.decals = [];
    this.planeGeo = new THREE.PlaneGeometry(2, 2);
    this.quality = quality;
    // fixed pool of flash lights (constant light count avoids shader recompiles)
    this.lights = Array.from({ length: 3 }, () => { const l = new THREE.PointLight(0xff8a3a, 0, 18, 2); scene.add(l); return { l, t: 0, dur: 1, peak: 0 }; });
    this.trail = new BladeTrail(scene);
  }

  setScale(px) { this.parts.mat.uniforms.uScale.value = px; }

  flashLight(pos, color, peak, dur) {
    const s = this.lights.reduce((a, b) => (a.l.intensity < b.l.intensity ? a : b));
    s.l.position.copy(pos); s.l.color.set(color); s.peak = peak; s.t = 0; s.dur = dur;
  }

  // ------------------------------------------------------------------------------- emitters
  sparks(at, dir, n = 26, opts = {}) {
    n = Math.round(n * this.quality.particles);
    for (let i = 0; i < n; i++) {
      const sp = randRange(4, 13) * (opts.speed || 1);
      const vx = (rand() - 0.5) * 2, vy = rand() * 1.2 + 0.2, vz = (rand() - 0.5) * 2;
      this.parts.spawn({ x: at.x, y: at.y, z: at.z, vx: (vx + dir.x * 1.5) * sp, vy: (vy + (dir.y || 0)) * sp, vz: (vz + dir.z * 1.5) * sp,
        life: randRange(0.25, 0.6), age: 0, size: randRange(0.05, 0.11) * (opts.size || 1), r: 3.2, g: 1.6, b: 0.6, grav: 14, drag: 2.5, fade: 1, cool: 0.7, bounce: true });
    }
    this.flashLight(at, opts.color || 0xff9a4a, opts.light || 40, 0.16);
  }
  dust(at, radius, n = 40, sc = 1) {
    n = Math.max(1, Math.round(n * this.quality.particles));
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2, r = rand() * radius * 0.4;
      const sp = randRange(2, 7) * Math.sqrt(sc);
      this.parts.spawn({ x: at.x + Math.sin(a) * r, y: 0.2, z: at.z + Math.cos(a) * r, vx: Math.sin(a) * sp, vy: randRange(0.5, 3), vz: Math.cos(a) * sp,
        life: randRange(0.6, 1.4) * Math.sqrt(sc), age: 0, size: randRange(0.5, 1.2) * sc, r: 0.22, g: 0.13, b: 0.08, grav: 1.5, drag: 2.2, fade: 2, grow: 1.5 });
    }
    for (let i = 0; i < n * 0.6 * sc; i++) {
      const a = rand() * Math.PI * 2, sp = randRange(3, 12);
      this.parts.spawn({ x: at.x, y: 0.3, z: at.z, vx: Math.sin(a) * sp * 0.6, vy: randRange(3, 9), vz: Math.cos(a) * sp * 0.6,
        life: randRange(0.5, 1.1), age: 0, size: randRange(0.06, 0.14), r: 3.0, g: 1.3, b: 0.4, grav: 12, drag: 1.2, fade: 1, cool: 0.6, bounce: true });
    }
  }
  embersAround(center, radius, n, upSpeed = 2) {
    n = Math.round(n * this.quality.particles);
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * radius;
      this.parts.spawn({ x: center.x + Math.sin(a) * r, y: center.y + rand() * 0.5, z: center.z + Math.cos(a) * r, vx: 0, vy: randRange(0.5, 1.5) * upSpeed, vz: 0,
        life: randRange(0.8, 2.0), age: 0, size: randRange(0.05, 0.12), r: 3, g: 1.2, b: 0.3, grav: -0.5, drag: 0.6, fade: 1.2, wobble: 2.5, seed: rand() * 10, fadeIn: 0.15 });
    }
  }
  // particles pulled inward toward a point (nova charge)
  gather(center, radius, n) {
    n = Math.round(n * this.quality.particles);
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2, e = randRange(-0.4, 1.0), r = radius * randRange(0.7, 1.0);
      const x = center.x + Math.sin(a) * r * Math.cos(e), y = center.y + Math.sin(e) * r * 0.6 + 2, z = center.z + Math.cos(a) * r * Math.cos(e);
      const life = randRange(0.45, 0.8);
      this.parts.spawn({ x, y, z, vx: (center.x - x) / life, vy: (center.y - y) / life, vz: (center.z - z) / life, life, age: 0, size: randRange(0.08, 0.18),
        r: 3.2, g: 1.4, b: 0.4, grav: 0, drag: 0, fade: 0.6, fadeIn: 0.2 });
    }
  }

  // ------------------------------------------------------------------------------- decals
  decal(mode, center, r, opts = {}) {
    const mat = new THREE.ShaderMaterial({ vertexShader: RING_VS, fragmentShader: RING_FS, transparent: true, depthWrite: false, premultipliedAlpha: true,
      blending: mode === 2 ? THREE.NormalBlending : THREE.AdditiveBlending,
      uniforms: { uR: { value: r }, uW: { value: opts.width || 1 }, uA: { value: 1 }, uT: { value: 0 }, uMode: { value: mode },
        uColor: { value: new THREE.Color(opts.color || 0xff7a2a) }, uSize: { value: opts.size || r + 2 } } });
    const m = new THREE.Mesh(this.planeGeo, mat);
    m.rotation.x = -Math.PI / 2; m.position.set(center.x, opts.y || 0.04 + this.decals.length * 0.002, center.z);
    const s = opts.size || r + 2; m.scale.set(s, s, 1); m.renderOrder = 2;
    this.scene.add(m);
    const d = { m, mat, mode, t: 0, life: opts.life || 1, follow: opts.follow, fadeOut: opts.fadeOut || 0.3, onUpdate: opts.onUpdate };
    this.decals.push(d);
    return d;
  }
  ringFor(w) {   // visual for a combat shock ring
    const col = w.kind === 'nova' ? 0xff6a1a : w.kind === 'roar' ? 0xffc89a : 0xffa060;
    this.decal(0, w.c, 0, { width: w.width * 0.7, size: w.maxR + 2, color: col, life: 9, follow: w });
  }
  kill(d) { d.dead = true; }

  update(dt, time) {
    this.parts.update(dt);
    for (const s of this.lights) {
      s.t += dt; s.l.intensity = s.t < s.dur ? s.peak * Math.pow(1 - s.t / s.dur, 2) : 0;
    }
    for (let i = this.decals.length - 1; i >= 0; i--) {
      const d = this.decals[i]; d.t += dt; const u = d.mat.uniforms; u.uT.value = time;
      if (d.follow) {
        u.uR.value = d.follow.r;
        const k = d.follow.r / d.follow.maxR;
        u.uA.value = (d.follow.kind === 'nova' ? 2.2 : 1.6) * (1 - Math.pow(k, 4)) * Math.min(1, d.t * 12);
        if (d.follow.r >= d.follow.maxR) d.dead = true;
      }
      if (d.onUpdate) d.onUpdate(d, dt);
      if (!d.follow && d.t > d.life) {
        const k = (d.t - d.life) / d.fadeOut;
        u.uA.value = Math.max(0, 1 - k) * (d.baseA ?? 1);
        if (k >= 1) d.dead = true;
      }
      if (d.dead) { this.scene.remove(d.m); d.mat.dispose(); this.decals.splice(i, 1); }
    }
  }
  clear() { for (const d of this.decals) { this.scene.remove(d.m); d.mat.dispose(); } this.decals.length = 0; this.parts.p.length = 0; this.trail.clear(); }
}

// ribbon following the blade during a swing
const TRAIL_N = 64, TRAIL_SUB = 4, TRAIL_AGE = 0.12, TRAIL_IN = 0.42;
// Sword smear: a band along the outer part of the blade, sampled each frame, ageing out fast; Catmull-Rom subdivided
// so fast arcs stay round.
class BladeTrail {
  constructor(scene) {
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(TRAIL_N * 2 * 3); this.alpha = new Float32Array(TRAIL_N * 2);
    const idx = [];
    for (let i = 0; i < TRAIL_N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setIndex(idx);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      vertexShader: `attribute float alpha; varying float vA; varying float vS; void main(){ vA = alpha; vS = float(gl_VertexID % 2); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 uC; varying float vA; varying float vS; void main(){ float e = vS * vS * (0.35 + 0.65 * vS); gl_FragColor = vec4(uC * vA * e, 1.0); }`,
      uniforms: { uC: { value: new THREE.Color(1.5, 0.65, 0.22) } }, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 6;
    scene.add(this.mesh); this.geo = g;
    this.samples = []; this.t = 0; this.heavy = false;
  }
  push(h, t, on, heavy) {
    if (!on) return;
    this.samples.unshift({ h: h.clone().lerp(t, TRAIL_IN), t: t.clone(), at: this.t });
    this.heavy = heavy;
  }
  update(dt) {
    this.t += dt;
    const maxAge = TRAIL_AGE * (this.heavy ? 1.4 : 1), S = this.samples;
    while (S.length && this.t - S[S.length - 1].at > maxAge) S.pop();
    const n = S.length;
    this.mesh.visible = n > 1;
    if (n < 2) return;
    let k = 0;
    const put = (h, t, age, f) => {
      if (k >= TRAIL_N) return;
      const o = k * 6, a = Math.pow(clamp(1 - age / maxAge, 0, 1), 1.6) * (this.heavy ? 1.25 : 0.9) * (1 - f * 0.7);
      this.pos[o] = h.x; this.pos[o + 1] = h.y; this.pos[o + 2] = h.z; this.pos[o + 3] = t.x; this.pos[o + 4] = t.y; this.pos[o + 5] = t.z;
      this.alpha[k * 2] = this.alpha[k * 2 + 1] = a; k++;
    };
    const cr = (p0, p1, p2, p3, u, out) => {
      const u2 = u * u, u3 = u2 * u;
      for (const c of ['x', 'y', 'z']) out[c] = 0.5 * (2 * p1[c] + (p2[c] - p0[c]) * u + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * u2 + (3 * p1[c] - p0[c] - 3 * p2[c] + p3[c]) * u3);
      return out;
    };
    const H = this._h || (this._h = new THREE.Vector3()), T = this._t || (this._t = new THREE.Vector3());
    const steps = (n - 1) * TRAIL_SUB;
    for (let i = 0; i < n - 1 && k < TRAIL_N; i++) {
      const a = S[Math.max(0, i - 1)], b = S[i], c = S[i + 1], d = S[Math.min(n - 1, i + 2)];
      for (let j = 0; j < TRAIL_SUB && k < TRAIL_N; j++) {
        const u = j / TRAIL_SUB, f = (i * TRAIL_SUB + j) / steps;
        put(cr(a.h, b.h, c.h, d.h, u, H), cr(a.t, b.t, c.t, d.t, u, T), this.t - lerp(b.at, c.at, u), f);
      }
    }
    put(S[n - 1].h, S[n - 1].t, this.t - S[n - 1].at, 1);
    for (let i = k; i < TRAIL_N; i++) {              // collapse the unused tail onto the last point
      const o = i * 6, l = (k - 1) * 6;
      for (let j = 0; j < 6; j++) this.pos[o + j] = this.pos[l + j];
      this.alpha[i * 2] = this.alpha[i * 2 + 1] = 0;
    }
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.alpha.needsUpdate = true;
  }
  clear() { this.samples.length = 0; this.mesh.visible = false; }
}
