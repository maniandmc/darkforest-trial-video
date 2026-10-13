// Dite's body, built from noise-displaced primitives: horned demon skull, basalt-plated torso with live magma seams,
// spiked shoulders and spine, clawed fists. Limb segments live under the root and are placed by the IK every frame.
import * as THREE from 'three';
import { lumpy, ellipsoidGeo } from './geo.js';

// tube along a curve whose radius tapers from r0 to r1, with optional growth rings (horns, claws)
export function taperTube(points, r0, r1, tubular = 24, radial = 12, pow = 1, rings = 0) {
  const curve = new THREE.CatmullRomCurve3(points);
  const g = new THREE.TubeGeometry(curve, tubular, 1, radial, false);
  const pos = g.attributes.position, c = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i <= tubular; i++) {
    const t = i / tubular; curve.getPointAt(t, c);
    let r = r1 + (r0 - r1) * Math.pow(1 - t, pow);
    if (rings) r *= 1 + rings * Math.max(0, Math.sin(t * 46)) * (1 - t);
    for (let j = 0; j <= radial; j++) {
      const idx = i * (radial + 1) + j;
      v.fromBufferAttribute(pos, idx).sub(c).multiplyScalar(r).add(c);
      pos.setXYZ(idx, v.x, v.y, v.z);
    }
  }
  g.computeVertexNormals();
  return g;
}

let seedN = 1;
const blobGeo = (rx, ry, rz, amp = 0.12, freq = 1.1, seg = 40) => lumpy(ellipsoidGeo(seg), amp, freq, (seedN++) * 7.31, [rx, ry, rz], 0.35);

export function buildBossModel(boss, mats) {
  const M = {};
  const skin = mats.bossSkin, horn = mats.bossHorn, claw = mats.claw;
  const add = (parent, mesh, x = 0, y = 0, z = 0, shadow = true) => {
    mesh.position.set(x, y, z); mesh.castShadow = shadow; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  };
  const blob = (parent, rx, ry, rz, x, y, z, o = {}) => {
    const m = new THREE.Mesh(blobGeo(rx, ry, rz, o.amp ?? 0.12, o.freq ?? 1.1, o.seg ?? 40), o.mat || skin);
    m.scale.set(rx, ry, rz); if (o.rot) m.rotation.set(...o.rot);
    return add(parent, m, x, y, z, o.shadow ?? true);
  };
  const spike = (parent, r, h, x, y, z, rx, rz, mat = horn) => {
    const g = new THREE.ConeGeometry(r, h, 10, 3); g.translate(0, h / 2, 0);
    const m = add(parent, new THREE.Mesh(lumpy(g, r * 0.25, 3, seedN++), mat), x, y, z);
    m.rotation.set(rx, 0, rz); return m;
  };

  // ---------------------------------------------------------------- torso
  blob(boss.pelvis, 1.8, 1.2, 1.4, 0, 0, 0);
  const C = boss.chest;
  blob(C, 1.6, 1.25, 1.25, 0, 0.75, 0.15);
  blob(C, 2.35, 1.75, 1.55, 0, 1.95, 0, { amp: 0.16 });
  for (const s of [-1, 1]) {
    blob(C, 1.25, 0.95, 0.85, s * 1.15, 2.2, 0.95, { rot: [0.15, 0, s * 0.12] });            // pectorals
    blob(C, 1.2, 1.1, 1.2, s * 2.3, 2.6, 0.1);                                               // deltoid
    blob(C, 1.35, 0.42, 1.25, s * 2.45, 3.35, 0.0, { rot: [0, 0, s * 0.38], amp: 0.2 });     // rock pauldron
    blob(C, 1.0, 1.5, 0.9, s * 1.2, 2.95, -0.45);                                           // trapezius
    spike(C, 0.32, 1.7, s * 2.55, 3.55, -0.1, -0.35, -s * 0.55);
    spike(C, 0.26, 1.25, s * 3.1, 3.2, 0.35, 0.1, -s * 0.95);
    spike(C, 0.24, 1.1, s * 2.0, 3.65, -0.6, -0.7, -s * 0.25);
  }
  for (let i = 0; i < 6; i++) spike(C, 0.3 - i * 0.03, 1.3 - i * 0.12, 0, 3.1 - i * 0.42, -1.3 + i * 0.05, -1.0 - i * 0.06, 0);   // spine ridge
  const neck = new THREE.Mesh(lumpy(new THREE.CapsuleGeometry(0.85, 0.9, 8, 20), 0.14, 1.3, seedN++), skin);
  add(C, neck, 0, 2.95, 0.35).rotation.x = 0.45;
  M.coreLight = new THREE.PointLight(0xff6a20, 0, 16, 1.6); M.coreLight.position.set(0, 2.0, 2.2); C.add(M.coreLight);

  // ---------------------------------------------------------------- head
  const H = boss.head;
  blob(H, 0.92, 0.95, 1.05, 0, 0.15, 0.0, { amp: 0.08, freq: 2 });
  blob(H, 1.0, 0.26, 0.42, 0, 0.3, 0.72, { rot: [-0.15, 0, 0], amp: 0.06, freq: 3 });          // brow ridge
  blob(H, 0.22, 0.55, 0.78, 0, 0.78, 0.15, { amp: 0.05, freq: 3 });                           // crest
  for (const s of [-1, 1]) blob(H, 0.32, 0.22, 0.52, s * 0.72, -0.1, 0.45, { amp: 0.05, freq: 3 });   // cheekbones
  blob(H, 0.6, 0.5, 0.64, 0, -0.28, 0.7, { amp: 0.06, freq: 3 });                             // maxilla
  M.eyes = [];
  for (const s of [-1, 1]) {
    blob(H, 0.25, 0.18, 0.16, s * 0.37, 0.09, 0.98, { mat: mats.socket, amp: 0, shadow: false, seg: 16 });
    blob(H, 0.09, 0.07, 0.04, s * 0.1, -0.13, 1.3, { mat: mats.socket, amp: 0, shadow: false, seg: 12 });
    const e = blob(H, 0.13, 0.035, 0.05, s * 0.37, 0.09, 1.07, { mat: mats.bossEye, amp: 0, shadow: false, seg: 12, rot: [0, 0, s * 0.18] });
    M.eyes.push(e);
    const pts = [[0.62, 0.42, 0.05], [1.75, 0.62, 0.35], [2.7, 1.5, 0.45], [2.75, 2.65, 0.95], [2.35, 3.25, 1.55]].map(p => new THREE.Vector3(s * p[0], p[1], p[2]));
    add(H, new THREE.Mesh(taperTube(pts, 0.46, 0.025, 48, 16, 0.8, 0.06), horn));
  }
  for (let i = 0; i < 7; i++) {                                                               // upper fangs
    const a = (i - 3) * 0.2, t = add(H, new THREE.Mesh(new THREE.ConeGeometry(0.055, i === 1 || i === 5 ? 0.42 : 0.26, 6), mats.bone), Math.sin(a) * 0.5, -0.55, 0.62 + Math.cos(a) * 0.5);
    t.rotation.x = Math.PI;
  }
  const J = boss.jaw;
  blob(J, 0.66, 0.28, 0.76, 0, -0.15, 0.62, { amp: 0.05, freq: 3 });
  for (let i = 0; i < 6; i++) { const a = (i - 2.5) * 0.22; add(J, new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.24, 6), mats.bone), Math.sin(a) * 0.48, 0.05, 0.6 + Math.cos(a) * 0.48); }
  M.headLight = new THREE.PointLight(0xff7a20, 0, 9, 2); M.headLight.position.set(0, 0.1, 1.7); H.add(M.headLight);

  // ---------------------------------------------------------------- limbs (y-aligned, placed by IK)
  const limb = (name, r, len, amp) => { M[name] = add(boss.root, new THREE.Mesh(lumpy(new THREE.CapsuleGeometry(r, len, 10, 22), amp, 1.0, seedN++), skin)); return M[name]; };
  for (const s of ['R', 'L']) {
    limb('upper' + s, 0.7, 2.7, 0.16);
    const fore = limb('fore' + s, 0.64, 2.6, 0.14);
    for (let i = 0; i < 3; i++) spike(fore, 0.2, 0.9 - i * 0.15, 0, -0.7 + i * 0.6, -0.5, -1.2, 0);
    limb('thigh' + s, 0.86, 2.35, 0.16); limb('shin' + s, 0.7, 2.3, 0.14);
    const fist = new THREE.Group(); add(boss.root, fist); M['fist' + s] = fist;
    blob(fist, 0.86, 0.78, 0.74, 0, 0.3, 0, { amp: 0.12 });
    for (let i = 0; i < 4; i++) {
      const a = (i - 1.5) * 0.42;
      const g = taperTube([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.45, 0.1), new THREE.Vector3(0, 0.8, 0.35)], 0.15, 0.01, 12, 8);
      const c = add(fist, new THREE.Mesh(g, claw), Math.sin(a) * 0.48, 0.75, Math.cos(a) * 0.42);
      c.rotation.y = a;
    }
    const foot = new THREE.Group(); add(boss.root, foot); M['foot' + s] = foot;
    blob(foot, 0.82, 0.42, 1.2, 0, 0, 0, { amp: 0.1 });
    for (let i = 0; i < 3; i++) {
      const a = (i - 1) * 0.45;
      const g = taperTube([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -0.05, 0.4), new THREE.Vector3(0, -0.3, 0.7)], 0.17, 0.01, 10, 8);
      add(foot, new THREE.Mesh(g, claw), Math.sin(a) * 0.55, 0.0, 0.95 + Math.cos(a) * 0.1).rotation.y = a * 0.5;
    }
  }

  M.update = (dt, b) => {
    const base = [0.45, 0.75, 1.3][b.phase] ?? 0.45;
    let glow = base + Math.min(Math.max(0, b.pose.glow), 1.5) * 0.18 + b.dmgFlash * 0.25;
    if (b.dead) { M.deadT = (M.deadT || 0) + dt; glow = Math.max(0.03, base * Math.exp(-M.deadT * 0.6)); }
    else M.deadT = 0;
    skin.userData.U.uLava.value = glow;
    const eye = b.dead ? glow * 0.6 : 1 + glow * 1.6 + Math.max(0, b.pose.glow);
    mats.bossEye.emissiveIntensity = 3 + eye * 3;
    M.headLight.intensity = 6 + eye * 8;
    M.coreLight.intensity = glow * 70;
  };
  return M;
}
