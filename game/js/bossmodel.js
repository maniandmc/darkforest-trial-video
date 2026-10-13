// Boss meshes built from primitives. Limb segments live under the root and are placed by the IK each frame;
// torso/head pieces hang off the pelvis/chest/head groups.
import * as THREE from 'three';

// tube along a curve whose radius tapers from r0 to r1 (horns, claws)
export function taperTube(points, r0, r1, tubular = 24, radial = 12, pow = 1) {
  const curve = new THREE.CatmullRomCurve3(points);
  const g = new THREE.TubeGeometry(curve, tubular, 1, radial, false);
  const pos = g.attributes.position, c = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i <= tubular; i++) {
    const t = i / tubular; curve.getPointAt(t, c);
    const r = r1 + (r0 - r1) * Math.pow(1 - t, pow);
    for (let j = 0; j <= radial; j++) {
      const idx = i * (radial + 1) + j;
      v.fromBufferAttribute(pos, idx).sub(c).multiplyScalar(r).add(c);
      pos.setXYZ(idx, v.x, v.y, v.z);
    }
  }
  g.computeVertexNormals();
  return g;
}

const ell = (mat, rx, ry, rz, seg = 24) => { const m = new THREE.Mesh(new THREE.SphereGeometry(1, seg, Math.round(seg * 0.75)), mat); m.scale.set(rx, ry, rz); return m; };

export function buildBossModel(boss, mats) {
  const M = {};
  const skin = mats.bossSkin, horn = mats.bossHorn;
  const add = (parent, mesh, x = 0, y = 0, z = 0) => { mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh; };

  // pelvis & torso
  add(boss.pelvis, ell(skin, 1.75, 1.15, 1.35));
  add(boss.chest, ell(skin, 1.65, 1.25, 1.25), 0, 0.75, 0.15);              // belly
  add(boss.chest, ell(skin, 2.35, 1.7, 1.5), 0, 1.95, 0);                    // rib cage
  for (const s of [-1, 1]) {
    add(boss.chest, ell(skin, 1.25, 0.95, 0.85), s * 1.15, 2.15, 0.95);      // pectorals
    add(boss.chest, ell(skin, 1.15, 1.05, 1.15), s * 2.3, 2.6, 0.1);         // shoulder caps
    add(boss.chest, ell(skin, 1.0, 1.5, 0.9), s * 1.2, 2.95, -0.45);         // trapezius
  }
  // neck
  const neck = add(boss.chest, new THREE.Mesh(new THREE.CapsuleGeometry(0.85, 0.9, 6, 14), skin), 0, 2.95, 0.35);
  neck.rotation.x = 0.45;

  // head (skull, brow, jaw, horns, eyes)
  const H = boss.head;
  add(H, ell(skin, 0.9, 0.95, 1.05), 0, 0.12, 0.05);
  add(H, ell(skin, 0.95, 0.28, 0.42), 0, 0.28, 0.72);                        // brow ridge
  add(H, ell(skin, 0.62, 0.55, 0.62), 0, -0.25, 0.68);                       // maxilla
  for (const s of [-1, 1]) add(H, ell(skin, 0.3, 0.22, 0.45), s * 0.72, -0.12, 0.45);   // cheekbones
  const jawM = add(boss.jaw, ell(skin, 0.62, 0.3, 0.7), 0, -0.12, 0.62);
  M.jaw = jawM;
  // teeth
  for (let i = 0; i < 6; i++) {
    const s = i < 3 ? -1 : 1, k = i % 3;
    const t = add(H, new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.26, 6), mats.bone), s * (0.14 + k * 0.17), -0.52, 1.15 - k * 0.1);
    t.rotation.x = Math.PI;
  }
  M.eyes = [];
  for (const s of [-1, 1]) {
    const socket = add(H, ell(mats.socket, 0.22, 0.16, 0.12, 12), s * 0.36, 0.08, 1.0);
    socket.castShadow = false;
    const e = add(H, ell(mats.bossEye, 0.11, 0.05, 0.06, 10), s * 0.36, 0.08, 1.07);
    e.castShadow = false; M.eyes.push(e);
    const pts = [[0.62, 0.42, 0.05], [1.75, 0.62, 0.35], [2.7, 1.5, 0.45], [2.75, 2.65, 0.95], [2.35, 3.25, 1.55]].map(p => new THREE.Vector3(s * p[0], p[1], p[2]));
    add(H, new THREE.Mesh(taperTube(pts, 0.42, 0.025, 40, 14, 0.8), horn));
  }

  // limbs (y-aligned capsules, placed by IK)
  const limb = (name, r, len, mat = skin) => { M[name] = add(boss.root, new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 16), mat)); };
  for (const s of ['R', 'L']) {
    limb('upper' + s, 0.68, 2.7); limb('fore' + s, 0.62, 2.6);
    limb('thigh' + s, 0.82, 2.35); limb('shin' + s, 0.66, 2.3);
    // fist with claws, oriented along the forearm
    const fist = new THREE.Group(); add(boss.root, fist); M['fist' + s] = fist;
    add(fist, ell(skin, 0.82, 0.75, 0.7), 0, 0.25, 0);
    for (let i = 0; i < 4; i++) {
      const a = (i - 1.5) * 0.42;
      const c = add(fist, new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.75, 8), horn), Math.sin(a) * 0.45, 0.85, Math.cos(a) * 0.45);
      c.rotation.x = 0.35; c.rotation.z = -a * 0.3;
    }
    const foot = add(boss.root, ell(skin, 0.75, 0.38, 1.15)); M['foot' + s] = foot;
  }
  M.update = (dt, b) => {
    const glow = Math.max(0, 1 + b.pose.glow + (b.phase >= 2 ? 0.8 : 0));
    mats.bossEye.emissiveIntensity = 3 + glow * 3;
    const f = b.dmgFlash;
    skin.emissive.setRGB(0.5 * f, 0.18 * f, 0.05 * f);
  };
  return M;
}
