// The wanderer: layered hooded cloak with folds and a ragged hem, mantle, sash, gauntlets, a lantern at the hip
// (the trailer's wanderer) and a diamond-section longsword.
import * as THREE from 'three';

function latheCloak(profile, seg, folds, foldAmp, hemRag, seed) {
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  const pos = g.attributes.position, v = new THREE.Vector3();
  const yTop = profile[0][1], yBot = profile[profile.length - 1][1];
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const a = Math.atan2(v.x, v.z), r = Math.hypot(v.x, v.z), k = (yTop - v.y) / (yTop - yBot);
    const fold = Math.sin(a * folds + v.y * 2.3 + seed) * 0.6 + Math.sin(a * folds * 2.1 - v.y * 3.1 + seed * 2) * 0.4;
    let nr = r + foldAmp * fold * k;
    let y = v.y;
    if (k > 0.97) y += hemRag * (Math.abs(Math.sin(a * 7.3 + seed)) * 0.7 + Math.abs(Math.sin(a * 17.1 + seed * 3)) * 0.3);
    pos.setXYZ(i, Math.sin(a) * nr, y, Math.cos(a) * nr * 0.86);
  }
  g.computeVertexNormals();
  return g;
}

export function buildPlayerModel(off, mats) {
  const add = (parent, mesh, x = 0, y = 0, z = 0) => { mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh; };
  const nor = mats.T.cliffN.clone(); nor.repeat.set(6, 6); nor.needsUpdate = true;
  const cloth = new THREE.MeshStandardMaterial({ color: 0x24211f, roughness: 0.93, normalMap: nor, normalScale: new THREE.Vector2(0.6, 0.6), side: THREE.DoubleSide });
  const clothDark = new THREE.MeshStandardMaterial({ color: 0x141211, roughness: 0.95, normalMap: nor, normalScale: new THREE.Vector2(0.5, 0.5), side: THREE.DoubleSide });
  const sashM = new THREE.MeshStandardMaterial({ color: 0x5a1209, roughness: 0.85, side: THREE.DoubleSide });
  const leather = new THREE.MeshStandardMaterial({ color: 0x2a1d15, roughness: 0.7 });
  const iron = new THREE.MeshStandardMaterial({ color: 0x3c3836, roughness: 0.45, metalness: 0.85 });

  const cloak = add(off, new THREE.Mesh(latheCloak([[0.12, 1.42], [0.22, 1.38], [0.3, 1.3], [0.31, 1.15], [0.3, 0.95], [0.33, 0.7], [0.39, 0.45], [0.45, 0.2], [0.48, 0.03]], 40, 9, 0.03, 0.09, 1.3), cloth));
  add(off, new THREE.Mesh(latheCloak([[0.13, 1.5], [0.27, 1.42], [0.37, 1.3], [0.4, 1.13], [0.4, 0.98]], 40, 7, 0.02, 0.06, 4.1), clothDark));   // mantle
  const hood = add(off, new THREE.Mesh(new THREE.SphereGeometry(0.205, 20, 16), cloth));
  hood.scale.set(1.0, 1.14, 1.16); hood.position.set(0, 1.56, -0.02);
  const tip = add(off, new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.42, 12), cloth), 0, 1.6, -0.19); tip.rotation.x = -1.15;
  const face = add(off, new THREE.Mesh(new THREE.SphereGeometry(0.135, 14, 10), mats.playerDark), 0, 1.53, 0.1); face.scale.set(1, 1.1, 0.62); face.castShadow = false;
  const sash = add(off, new THREE.Mesh(new THREE.TorusGeometry(0.315, 0.035, 8, 32), sashM), 0, 0.93, 0); sash.rotation.x = Math.PI / 2; sash.scale.set(1, 0.86, 1);
  const tail = add(off, new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.55, 1, 4), sashM), -0.2, 0.66, -0.22); tail.rotation.set(0.15, 0.6, 0.1);
  for (const s of [-1, 1]) add(off, new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.12, 4, 10), leather), s * 0.13, 0.08, 0.05);   // boots

  // lantern hanging at the left hip
  const lan = new THREE.Group(); lan.position.set(0.33, 0.78, 0.06); off.add(lan);
  add(lan, new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.015, 0.11), iron), 0, 0.09, 0);
  add(lan, new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.015, 0.11), iron), 0, -0.08, 0);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(lan, new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.17, 0.012), iron), x * 0.05, 0, z * 0.05);
  const core = add(lan, new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffc070, emissive: 0xff9a40, emissiveIntensity: 9 })));
  core.castShadow = false;
  const lanLight = new THREE.PointLight(0xffa050, 5.5, 7, 1.8); lanLight.position.set(0, 0, 0.05); lan.add(lanLight);

  const mkArm = (side) => {
    const piv = new THREE.Group(); piv.rotation.order = 'YXZ';
    piv.position.set(-0.28 * side, 1.3, 0.04); off.add(piv);
    const sleeve = add(piv, new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.3, 4, 10), cloth), 0, 0, 0.19); sleeve.rotation.x = Math.PI / 2;
    const gaunt = add(piv, new THREE.Mesh(new THREE.CapsuleGeometry(0.058, 0.12, 4, 10), iron), 0, 0, 0.42); gaunt.rotation.x = Math.PI / 2;
    return piv;
  };
  const armR = mkArm(1), armL = mkArm(-1);

  const sword = new THREE.Group(); sword.position.z = 0.48; armR.add(sword);
  const grip = add(sword, new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.24, 8), leather)); grip.rotation.x = Math.PI / 2; grip.position.z = 0.0;
  add(sword, new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), iron), 0, 0, -0.13);
  const guard = add(sword, new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.04, 0.045), iron), 0, 0, 0.13);
  for (const s of [-1, 1]) { const e = add(guard, new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.08, 8), iron), s * 0.19, 0, 0); e.rotation.z = -s * Math.PI / 2; }
  const bg = new THREE.CylinderGeometry(0.004, 0.044, 1.22, 4, 1); bg.rotateY(Math.PI / 4); bg.scale(1, 1, 0.26); bg.rotateX(Math.PI / 2);
  const blade = add(sword, new THREE.Mesh(bg, mats.blade), 0, 0, 0.76);
  const flask = add(armL, new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 8), mats.flask), 0, 0, 0.5); flask.visible = false;
  return { cloak, armR, armL, sword, blade, flask, lantern: lan, lanLight, tail };
}
