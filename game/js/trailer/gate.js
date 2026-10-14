// The Gate of Hell as a set: a cliff face, a carved facade with a pointed portal whose archivolts recede in steps,
// jamb colonnettes, an inscription panel that burns letter by letter, steps up to the threshold, two colossal hooded
// guardians (the wanderer's own model, carved in stone), and fire at the end of the passage. Light pours out of the
// door: the key light sits behind the cliff, so the rock lets it through the opening only (shafts on the steps and in
// the haze). Facing -z; the facade's front plane is z = 0, the threshold at y = 1.6.
import * as THREE from 'three';
import { fbm3 } from '../geo.js';
import { buildPlayerModel } from '../playermodel.js';
import { PlayerAnim, GUARD } from '../playeranim.js';

export const GATE = { thr: 1.6, w0: 6.0, spring: 8.0, rings: 4, ringStep: 1.15, ringDepth: 0.7, tunnel: 14 };
const SPAN = i => GATE.w0 + i * GATE.ringStep;

// pointed (equilateral) arch outline, from the left foot over the apex to the right foot
function archPts(w, base, spring, n = 24) {
  const pts = [], R = w, sy = base + spring;
  pts.push(new THREE.Vector2(-w / 2, base), new THREE.Vector2(-w / 2, sy));
  for (let i = 1; i <= n; i++) { const a = Math.PI - (Math.PI / 3) * (i / n); pts.push(new THREE.Vector2(w / 2 + Math.cos(a) * R, sy + Math.sin(a) * R)); }
  for (let i = 1; i <= n; i++) { const a = Math.PI / 3 - (Math.PI / 3) * (i / n); pts.push(new THREE.Vector2(-w / 2 + Math.cos(a) * R, sy + Math.sin(a) * R)); }
  pts.push(new THREE.Vector2(w / 2, base));
  return pts;
}
export const apexY = w => GATE.thr + GATE.spring + w * Math.sin(Math.PI / 3);

// U-shaped band between two arch outlines (an archivolt ring, or the passage walls)
function bandGeo(wOut, wIn, z0, depth) {
  const o = archPts(wOut, GATE.thr, GATE.spring), i = archPts(wIn, GATE.thr, GATE.spring).reverse();
  const s = new THREE.Shape([...o, ...i]);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 1 });
  g.translate(0, 0, z0);
  return g;
}

const FIRE_FS = `
uniform float uTime, uI; varying vec2 vUv;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),u.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),u.x),u.y); }
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a * n(p); p = p * 2.02 + 1.3; a *= 0.5; } return s; }
void main(){
  vec2 p = vUv * vec2(3.0, 4.0);
  float f = fbm(p + vec2(0.0, -uTime * 1.6)) * 0.7 + fbm(p * 2.3 + vec2(1.7, -uTime * 2.7)) * 0.3;
  float heat = smoothstep(0.25, 0.9, f + (0.45 - vUv.y) * 0.9);
  vec3 c = mix(vec3(0.9, 0.12, 0.01), vec3(6.0, 2.6, 0.7), heat) + vec3(2.0, 0.8, 0.2) * smoothstep(0.5, 0.0, vUv.y);
  gl_FragColor = vec4(c * uI, 1.0);
}`;

export class Gate {
  constructor(scene, mats, T) {
    this.group = new THREE.Group(); scene.add(this.group);
    const g = this.group;
    const stone = mats.rubble, cliffM = mats.wall;
    const add = (geo, mat, cast = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true; g.add(m); return m; };

    // ---------------------------------------------------------------- facade with the portal cut through it
    const wOut = SPAN(GATE.rings), fw = 26, fh = 34, fd = 3;
    // the outline runs up and over the arch as a notch from the bottom edge (a hole may not touch the outline)
    const notch = archPts(wOut, 0, GATE.thr + GATE.spring);
    const face = new THREE.Shape([new THREE.Vector2(-fw / 2, 0), ...notch, new THREE.Vector2(fw / 2, 0), new THREE.Vector2(fw / 2, fh), new THREE.Vector2(-fw / 2, fh)]);
    add(new THREE.ExtrudeGeometry(face, { depth: fd, bevelEnabled: false, curveSegments: 1 }), stone);
    // cornice bands and buttresses for a carved, layered read
    for (const [y, h, d] of [[fh - 2, 1.2, 1.2], [apexY(wOut) + 4.2, 0.5, 0.6], [apexY(wOut) + 0.6, 0.4, 0.5]]) add(new THREE.BoxGeometry(fw + 1, h, d), stone).position.set(0, y, -d / 2 + 0.05);
    for (const s of [-1, 1]) {
      const b = add(new THREE.BoxGeometry(2.6, fh + 2, 3.4), stone); b.position.set(s * (fw / 2 - 0.6), (fh + 2) / 2 - 1, -0.9);
      const p = add(new THREE.CylinderGeometry(0.18, 1.6, 7, 4), stone); p.position.set(s * (fw / 2 - 0.6), fh + 4.3, -0.9); p.rotation.y = Math.PI / 4;   // pinnacle
    }
    // archivolts receding in steps, each with a colonnette in its jamb
    for (let i = GATE.rings; i >= 1; i--) {
      const z0 = (GATE.rings - i + 1) * GATE.ringDepth;
      add(bandGeo(SPAN(i), SPAN(i - 1), z0, fd - z0 + 0.01), stone);
      for (const s of [-1, 1]) {
        const c = add(new THREE.CylinderGeometry(0.22, 0.26, GATE.spring - 0.4, 12), stone);
        c.position.set(s * (SPAN(i) / 2 - 0.3), GATE.thr + (GATE.spring - 0.4) / 2, z0 + 0.25);
        const cap = add(new THREE.BoxGeometry(0.7, 0.35, 0.7), stone); cap.position.set(s * (SPAN(i) / 2 - 0.3), GATE.thr + GATE.spring - 0.2, z0 + 0.25);
      }
    }
    // the passage into the rock, its floor, and the fire at its end
    add(bandGeo(GATE.w0 + 3, GATE.w0, fd, GATE.tunnel - fd), stone);
    add(new THREE.BoxGeometry(GATE.w0 + 3, GATE.thr, GATE.tunnel + 1), stone).position.set(0, GATE.thr / 2, GATE.tunnel / 2 - 0.5);
    this.fireMat = new THREE.ShaderMaterial({ vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: FIRE_FS, uniforms: { uTime: { value: 0 }, uI: { value: 1 } } });
    const fire = add(new THREE.PlaneGeometry(GATE.w0 + 0.2, apexY(GATE.w0) - GATE.thr + 0.5), this.fireMat, false);
    fire.position.set(0, (apexY(GATE.w0) + GATE.thr) / 2, GATE.tunnel - 0.6); fire.rotation.y = Math.PI; fire.receiveShadow = false;
    // steps up to the threshold and a broad landing
    const nSteps = 6, sh = GATE.thr / nSteps;
    for (let i = 0; i < nSteps; i++) add(new THREE.BoxGeometry(16 - i * 0.6, sh * (i + 1), 1.0), stone).position.set(0, sh * (i + 1) / 2, -1.2 - (nSteps - 1 - i) * 1.0 - 0.5);
    add(new THREE.BoxGeometry(fw - 2, GATE.thr, 3.6), stone).position.set(0, GATE.thr / 2, 0);
    this.stepsZ = -1.2 - nSteps * 1.0;                         // z of the foot of the stairs
    this.stepY = z => Math.max(0, Math.min(1, (z - this.stepsZ) / (nSteps * 1.0))) * GATE.thr;   // smoothed stair height for walking

    // ---------------------------------------------------------------- inscription: carved, then burning letter by letter
    this.insc = document.createElement('canvas'); this.insc.width = 2048; this.insc.height = 192;
    this.inscTex = new THREE.CanvasTexture(this.insc); this.inscTex.colorSpace = THREE.SRGBColorSpace;
    const panel = add(new THREE.PlaneGeometry(19, 19 * 192 / 2048), new THREE.MeshStandardMaterial({ color: 0x0e0b0a, roughness: 0.9, emissive: 0xffffff, emissiveMap: this.inscTex, emissiveIntensity: 1 }), false);
    panel.position.set(0, apexY(wOut) + 2.4, -0.07);
    panel.rotation.y = Math.PI;                                 // the facade faces -z
    this.panel = panel; this.burn(0);

    // ---------------------------------------------------------------- the cliff around it (a hole where the passage runs)
    const cw = 130, ch = 80, sx = 130, sy = 80;
    const cg = new THREE.PlaneGeometry(cw, ch, sx, sy); cg.translate(0, ch / 2 - 2, 0);
    const cp = cg.attributes.position;
    for (let i = 0; i < cp.count; i++) {
      const x = cp.getX(i), y = cp.getY(i);
      const near = Math.max(Math.abs(x) - fw / 2, y - fh);              // distance outside the facade
      const k = THREE.MathUtils.smoothstep(near, 0, 8);
      const d = (fbm3(x * 0.05, y * 0.05, 1.3) - 0.5) * 22 + (fbm3(x * 0.2, y * 0.2, 7.1) - 0.5) * 5;
      cp.setZ(i, -(fd - 0.3 + k * (4 + d)));                            // negated: the plane is turned to face -z below
    }
    const idx = cg.index.array, keep = [];
    for (let t = 0; t < idx.length; t += 3) {
      let cx = 0, cy = 0; for (let j = 0; j < 3; j++) { cx += cp.getX(idx[t + j]) / 3; cy += cp.getY(idx[t + j]) / 3; }
      if (Math.abs(cx) < fw / 2 - 0.5 && cy < fh - 0.5) continue;        // hidden behind the facade, and the passage must stay open
      keep.push(idx[t], idx[t + 1], idx[t + 2]);
    }
    cg.setIndex(keep); cg.rotateY(Math.PI); cg.computeVertexNormals();
    add(cg, cliffM);

    // ---------------------------------------------------------------- ground: a broken plaza of basalt
    const gg = new THREE.PlaneGeometry(150, 130, 150, 130); gg.rotateX(-Math.PI / 2); gg.translate(0, 0, -60);
    const gp = gg.attributes.position;
    for (let i = 0; i < gp.count; i++) { const x = gp.getX(i), z = gp.getZ(i); gp.setY(i, (fbm3(x * 0.08, 0.3, z * 0.08) - 0.5) * 0.8 * THREE.MathUtils.smoothstep(Math.hypot(x, z + 8), 6, 20) - 0.02); }
    gg.computeVertexNormals();
    add(gg, mats.floor, false);

    // ---------------------------------------------------------------- the guardians: the wanderer, carved seventeen metres tall
    this.statues = [];
    for (const s of [-1, 1]) {
      const root = new THREE.Group(); g.add(root);
      const rig = buildPlayerModel(root, mats, 1);
      const fake = { root, rig, pos: new THREE.Vector3(), yaw: 0, vel: new THREE.Vector3(), state: 'idle', t: 0, atk: null, sprinting: false, flask: rig.flask };
      const anim = new PlayerAnim(fake, rig);
      // head bowed, arms at rest, the sword hanging point-down along its side into the plinth
      anim.debugPose({ ...GUARD, hipY: 0, lean: 0.02, twist: 0, cT: 0, cB: 0.16, hP: 0.5, hY: 0, rY: 0.02, rP: 1.36, rR: 0, rE: 0.12, rWp: 0.08, rWy: 0, lY: 0.18, lP: 1.48, lR: 0, lE: 0.2, lIK: 0, fb: 0 }, 'idle');
      root.traverse(o => { if (o.isMesh) { o.material = stone; o.castShadow = true; o.receiveShadow = true; } if (o.isPointLight) o.visible = false; });
      rig.lantern.visible = false;
      root.scale.setScalar(9.5); root.position.set(s * 15.2, 0.0, -3.2); root.rotation.y = s * 0.12;
      const ped = add(new THREE.BoxGeometry(6.5, 1.6, 6.5), stone); ped.position.set(s * 15.2, 0.8, -3.2);
      root.position.y = 1.6;
      this.statues.push(root);
    }

    // ---------------------------------------------------------------- light: the door's glow on the steps and facade
    this.portal = new THREE.PointLight(0xff6a24, 0, 0, 2); this.portal.position.set(0, 4.5, 1.5); g.add(this.portal);
    this.sky = new THREE.HemisphereLight(0x3a2630, 0x4a1608, 1.1); g.add(this.sky);
  }

  // inscription burn progress 0 → 1 (letters ignite left to right, with a hot leading edge)
  burn(p) {
    const c = this.insc.getContext('2d'), W = c.canvas.width, H = c.canvas.height;
    c.clearRect(0, 0, W, H); c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
    const text = "LASCIATE OGNE SPERANZA, VOI CH'INTRATE";
    c.font = '600 118px Cinzel'; c.textBaseline = 'middle';
    const tr = 14, chars = [...text], ws = chars.map(ch => c.measureText(ch).width), tot = ws.reduce((a, b) => a + b, 0) + tr * (chars.length - 1);
    let x = (W - tot) / 2;
    chars.forEach((ch, i) => {
      const k = Math.max(0, Math.min(1, p * (chars.length + 6) - i));          // this letter's ignition
      const hot = Math.max(0, 1 - Math.abs(p * (chars.length + 6) - i - 0.5) / 2.5);
      // carved: a faint warm floor even unlit, so the letters read as cut into the stone
      const r = Math.round(40 + 215 * k + 0 * hot), gg = Math.round(14 + 120 * k + 100 * hot), b = Math.round(6 + 30 * k + 90 * hot);
      c.shadowColor = `rgba(255,120,30,${0.9 * k})`; c.shadowBlur = 24 * k;
      c.fillStyle = `rgb(${r},${gg},${b})`; c.fillText(ch, x, H / 2 + 4);
      x += ws[i] + tr;
    });
    this.inscTex.needsUpdate = true;
  }

  update(t, o = {}) {
    this.fireMat.uniforms.uTime.value = t; this.fireMat.uniforms.uI.value = o.fire ?? 1;
    this.portal.intensity = (o.portal ?? 1) * 2600 * (0.9 + 0.1 * Math.sin(t * 7.3) * Math.sin(t * 3.1));
    this.panel.material.emissiveIntensity = o.inscI ?? 3;
  }
}
