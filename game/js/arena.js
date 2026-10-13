// The arena: a basalt disc veined with magma, ringed by a lava moat, broken pillars and a cliff wall under a burning sky.
import * as THREE from 'three';
import { CFG } from './config.js';
import { lumpy, fbm3 } from './geo.js';
import { matTime } from './materials.js';

const LAVA_VS = `varying vec2 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const LAVA_FS = `
uniform float uTime; varying vec2 vW;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),u.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),u.x),u.y); }
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a * n(p); p = p * 2.03 + 1.7; a *= 0.5; } return s; }
void main(){
  float a = atan(vW.y, vW.x), r = length(vW);
  vec2 q = vec2(a * 9.0 + uTime * 0.05, r * 0.55);
  vec2 w = vec2(fbm(q + uTime * 0.07), fbm(q * 1.3 - uTime * 0.05));
  float m = fbm(q * 1.6 + w * 1.8 + vec2(0.0, uTime * 0.12));
  float crust = smoothstep(0.42, 0.62, fbm(q * 2.4 - w + uTime * 0.03));
  vec3 hot = mix(vec3(1.4, 0.18, 0.02), vec3(4.5, 1.7, 0.35), smoothstep(0.35, 0.8, m));
  vec3 c = mix(hot, vec3(0.05, 0.02, 0.015), crust * 0.85);
  gl_FragColor = vec4(c, 1.0);
}`;
const SKY_FS = `
uniform float uTime; varying vec3 vD;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),u.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),u.x),u.y); }
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a * n(p); p = p * 2.07 + 3.1; a *= 0.5; } return s; }
void main(){
  vec3 d = normalize(vD);
  float y = d.y;
  vec3 c = mix(vec3(0.32, 0.07, 0.02), vec3(0.012, 0.006, 0.008), smoothstep(-0.05, 0.45, y));
  vec2 p = d.xz / max(y + 0.25, 0.08);
  float s = fbm(p * 1.4 + vec2(uTime * 0.02, -uTime * 0.012));
  c += vec3(0.5, 0.12, 0.03) * smoothstep(0.45, 0.85, s) * smoothstep(0.6, 0.05, y) * 0.6;
  c *= 0.75 + 0.5 * fbm(p * 3.0 - uTime * 0.03);
  gl_FragColor = vec4(c, 1.0);
}`;

export class Arena {
  constructor(scene, mats, quality) {
    this.group = new THREE.Group(); scene.add(this.group);
    const R = CFG.arenaRadius;
    scene.fog = new THREE.FogExp2(0x1d0a05, 0.0125);
    scene.background = new THREE.Color(0x0a0403);

    // floor: one big basalt disc (magma seams in its material)
    const floor = new THREE.Mesh(new THREE.CircleGeometry(R + 2.0, 160), mats.floor);
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; this.group.add(floor);
    // the moat of lava and the far bank
    this.lavaMat = new THREE.ShaderMaterial({ vertexShader: LAVA_VS, fragmentShader: LAVA_FS, uniforms: { uTime: matTime } });
    const moat = new THREE.Mesh(new THREE.RingGeometry(R + 1.6, R + 7.5, 160, 4), this.lavaMat);
    moat.rotation.x = -Math.PI / 2; moat.position.y = -0.35; this.group.add(moat);
    const bank = new THREE.Mesh(new THREE.RingGeometry(R + 7.0, R + 60, 160, 2), mats.floor);
    bank.rotation.x = -Math.PI / 2; bank.position.y = 0.0; bank.receiveShadow = true; this.group.add(bank);

    // rim boulders (instanced) along the arena's edge, leaning into the moat
    const rockGeo = lumpy(new THREE.IcosahedronGeometry(1, 3), 0.55, 0.9, 4.2, [1, 1, 1], 0.4);
    const rim = new THREE.InstancedMesh(rockGeo, mats.rubble, 70);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
    let k = 0;
    for (let i = 0; i < 70; i++) {
      const a = i / 70 * Math.PI * 2 + Math.sin(i * 7.7) * 0.03, rr = R + 1.2 + Math.abs(Math.sin(i * 3.3)) * 1.2;
      const sz = 0.7 + Math.abs(Math.sin(i * 12.9)) * 1.3;
      p.set(Math.sin(a) * rr, -0.3 + sz * 0.3, Math.cos(a) * rr);
      e.set(Math.sin(i) * 0.6, i * 1.7, Math.cos(i * 2.1) * 0.6); q.setFromEuler(e);
      s.set(sz * 1.3, sz * (0.6 + Math.abs(Math.sin(i * 5.1)) * 0.6), sz);
      rim.setMatrixAt(k++, m4.compose(p, q, s));
    }
    rim.castShadow = true; rim.receiveShadow = true; this.group.add(rim);

    // broken pillars of an older temple
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.2, rr = R + 9 + (i % 3) * 2.5, h = [14, 7, 19, 5, 12, 22, 9, 16, 6][i];
      const g = lumpy(new THREE.CylinderGeometry(1.5, 1.8, h, 18, Math.round(h / 1.5)), 0.35, 0.8, i * 3.1, [1, 1, 1], 0.5);
      const col = new THREE.Mesh(g, mats.rubble); col.position.set(Math.sin(a) * rr, h / 2 - 0.5, Math.cos(a) * rr);
      col.rotation.set(Math.sin(i * 2.2) * 0.08, i, Math.cos(i * 1.3) * 0.08); col.castShadow = true; col.receiveShadow = true;
      this.group.add(col);
    }

    // cliff wall: a jagged open cylinder seen from inside
    const wg = new THREE.CylinderGeometry(R + 34, R + 48, 70, 200, 30, true);
    const wp = wg.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < wp.count; i++) {
      v.fromBufferAttribute(wp, i);
      const ang = Math.atan2(v.x, v.z), y = v.y;
      const d = (fbm3(ang * 6, y * 0.06, 0.5) - 0.5) * 22 + (fbm3(ang * 22, y * 0.25, 4.0) - 0.5) * 7;
      const l = Math.hypot(v.x, v.z), nl = l + d;
      wp.setXYZ(i, v.x / l * nl, y, v.z / l * nl);
    }
    wg.computeVertexNormals();
    const wall = new THREE.Mesh(wg, mats.wall); wall.material.side = THREE.BackSide; wall.position.y = 25; this.group.add(wall);

    // burning sky
    const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 48, 24), new THREE.ShaderMaterial({
      vertexShader: `varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: SKY_FS, uniforms: { uTime: matTime }, side: THREE.BackSide, depthWrite: false, fog: false }));
    sky.renderOrder = -1; this.group.add(sky);

    // light: dim cold key for shape + shadows, warm bounce from the lava, fire glow at the moat
    this.hemi = new THREE.HemisphereLight(0x3a2c44, 0x5a1c08, 1.1); scene.add(this.hemi);
    const moon = new THREE.DirectionalLight(0xa8b4ff, 1.5);
    moon.position.set(-22, 42, -16); moon.castShadow = true;
    const sc = moon.shadow.camera; sc.left = sc.bottom = -38; sc.right = sc.top = 38; sc.near = 5; sc.far = 120;
    moon.shadow.mapSize.set(quality.shadow, quality.shadow); moon.shadow.bias = -0.0005; moon.shadow.normalBias = 0.05;
    scene.add(moon); scene.add(moon.target); this.moon = moon;
    const warm = new THREE.DirectionalLight(0xff5a1e, 0.9); warm.position.set(18, 4, 30); scene.add(warm); scene.add(warm.target);
    this.fires = [];
    for (const [x, z] of [[0, R + 4], [-R - 3, -6], [R + 3, -10]]) {
      const l = new THREE.PointLight(0xff5a1a, 260, 40, 1.4); l.position.set(x, 2.5, z); scene.add(l); this.fires.push(l);
    }
  }

  update(dt, t) {
    this.fires.forEach((f, i) => { f.intensity = 260 * (0.8 + 0.2 * Math.sin(t * (6.3 + i) + i) * Math.sin(t * (2.9 + i * 0.7))); });
  }
}
