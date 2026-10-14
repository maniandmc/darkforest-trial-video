// The wanderer: layered hooded cloak with folds and a ragged hem, mantle, sash, gauntlets, a lantern at the hip
// (the trailer's wanderer) and a diamond-section longsword — rigged for procedural animation:
//   root ─ tumble (rolls and spins pivot on the figure's centre) ─ body (hips: crouch, lean, twist) ─ off (model space)
//     off: cloak (skinned to hips + chest, hem simulated), sash, sash tail and lantern (pendulums)
//     off ─ chest (bend / twist / side) ─ mantle, head (hood), arms: shoulder ─ elbow ─ hand (sword / flask)
//   root: legs (thigh, shin, boot), solved every frame from foot targets so feet can plant while the body moves.
import * as THREE from 'three';

export const RIG = {
  center: 0.8, hip: 0.62, chest: 1.0, neck: 1.42,
  upper: 0.26, fore: 0.235,                         // shoulder → elbow → grip
  hipX: 0.12, hipJ: 0.64, thigh: 0.31, shin: 0.3, ankle: 0.085,
};

function latheCloak(profile, seg, folds, foldAmp, hemRag, seed, detail = 1) {
  let pts = profile.map(([r, y]) => new THREE.Vector2(r, y));
  if (detail > 1) pts = new THREE.SplineCurve(pts).getPoints((pts.length - 1) * Math.round(detail * 3));
  const g = new THREE.LatheGeometry(pts, Math.round(seg * detail));
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

export function buildPlayerModel(root, mats, detail = 1) {
  const n = k => Math.round(k * detail);              // segment counts scale with the detail level
  const add = (parent, mesh, x = 0, y = 0, z = 0) => { mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh; };
  const group = (parent, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.order = 'YXZ'; parent.add(g); return g; };
  // its own copy of the cliff normal map (finer repeat); loaded separately so it uploads when its image arrives
  const nor = new THREE.TextureLoader().load('assets/tex/cliff_nor.jpg'); nor.wrapS = nor.wrapT = THREE.RepeatWrapping; nor.repeat.set(6, 6);
  const cloth = new THREE.MeshStandardMaterial({ color: 0x24211f, roughness: 0.93, normalMap: nor, normalScale: new THREE.Vector2(0.6, 0.6), side: THREE.DoubleSide });
  const clothDark = new THREE.MeshStandardMaterial({ color: 0x141211, roughness: 0.95, normalMap: nor, normalScale: new THREE.Vector2(0.5, 0.5), side: THREE.DoubleSide });
  const sashM = new THREE.MeshStandardMaterial({ color: 0x5a1209, roughness: 0.85, side: THREE.DoubleSide });
  const leather = new THREE.MeshStandardMaterial({ color: 0x2a1d15, roughness: 0.7 });
  const iron = new THREE.MeshStandardMaterial({ color: 0x3c3836, roughness: 0.45, metalness: 0.85 });

  const tumble = group(root, 0, RIG.center, 0), tumbleOff = group(tumble, 0, -RIG.center, 0);
  const body = group(tumbleOff, 0, RIG.hip, 0), off = group(body, 0, -RIG.hip, 0);
  const chest = group(off, 0, RIG.chest, 0), chestOff = group(chest, 0, -RIG.chest, 0);

  const cloak = add(off, new THREE.Mesh(latheCloak([[0.12, 1.42], [0.22, 1.38], [0.3, 1.3], [0.31, 1.15], [0.3, 0.95], [0.33, 0.7], [0.39, 0.45], [0.45, 0.2], [0.48, 0.03]], 40, 9, 0.03, 0.09, 1.3, detail), cloth));
  const mantle = add(chestOff, new THREE.Mesh(latheCloak([[0.13, 1.5], [0.27, 1.42], [0.37, 1.3], [0.4, 1.13], [0.4, 0.98]], 40, 7, 0.02, 0.06, 4.1, detail), clothDark));
  cloak.frustumCulled = mantle.frustumCulled = false;      // deformed on the CPU every frame
  const head = group(chestOff, 0, RIG.neck, 0), headOff = group(head, 0, -RIG.neck, 0);
  const hood = add(headOff, new THREE.Mesh(new THREE.SphereGeometry(0.205, n(20), n(16)), cloth));
  hood.scale.set(1.0, 1.14, 1.16); hood.position.set(0, 1.56, -0.02);
  const tip = add(headOff, new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.42, n(12), n(1)), cloth), 0, 1.6, -0.19); tip.rotation.x = -1.15;
  // the dark opening of the hood, so you can read which way the figure faces
  const face = add(headOff, new THREE.Mesh(new THREE.SphereGeometry(0.13, n(16), n(12)), mats.playerDark), 0, 1.52, 0.165); face.scale.set(0.9, 1.12, 0.45); face.castShadow = false;
  const sash = add(off, new THREE.Mesh(new THREE.TorusGeometry(0.315, 0.035, n(8), n(32)), sashM), 0, 0.93, 0); sash.rotation.x = Math.PI / 2; sash.scale.set(1, 0.86, 1);
  // sash tail hangs from a hook so it can swing from its top edge
  const tail = group(off, -0.2, 0.93, -0.22);
  const tailM = add(tail, new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.55, 1, 4), sashM), 0, -0.27, 0); tailM.rotation.y = 0.6;

  // lantern hanging at the left hip, from its ring
  const lantern = group(off, 0.33, 0.9, 0.06);
  const lan = group(lantern, 0, -0.12, 0);
  add(lantern, new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.005, 6, 12), iron), 0, 0, 0);
  add(lan, new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.015, 0.11), iron), 0, 0.09, 0);
  add(lan, new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.015, 0.11), iron), 0, -0.08, 0);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(lan, new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.17, 0.012), iron), x * 0.05, 0, z * 0.05);
  const core = add(lan, new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffc070, emissive: 0xff9a40, emissiveIntensity: 9 })));
  core.castShadow = false;
  const lanLight = new THREE.PointLight(0xffa050, 5.5, 7, 1.8); lanLight.position.set(0, 0, 0.05); lan.add(lanLight);

  const mkArm = (side) => {
    const sh = group(chestOff, -0.28 * side, 1.3, 0.04);
    const up = add(sh, new THREE.Mesh(new THREE.CapsuleGeometry(0.074, 0.16, n(4), n(10)), cloth), 0, 0, 0.12); up.rotation.x = Math.PI / 2;
    const el = group(sh, 0, 0, RIG.upper);
    const fore = add(el, new THREE.Mesh(new THREE.CapsuleGeometry(0.066, 0.08, n(4), n(10)), cloth), 0, 0, 0.04); fore.rotation.x = Math.PI / 2;
    const gaunt = add(el, new THREE.Mesh(new THREE.CapsuleGeometry(0.058, 0.1, n(4), n(10)), iron), 0, 0, 0.15); gaunt.rotation.x = Math.PI / 2;
    const hand = group(el, 0, 0, RIG.fore);
    add(hand, new THREE.Mesh(new THREE.SphereGeometry(0.05, n(10), n(8)), leather)).scale.set(1, 1.15, 1.2);
    return { sh, el, hand };
  };
  const armR = mkArm(1), armL = mkArm(-1);

  const sword = armR.hand;
  const grip = add(sword, new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.24, 8), leather)); grip.rotation.x = Math.PI / 2;
  add(sword, new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), iron), 0, 0, -0.13);
  const guard = add(sword, new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.04, 0.045), iron), 0, 0, 0.13);
  for (const s of [-1, 1]) { const e = add(guard, new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.08, 8), iron), s * 0.19, 0, 0); e.rotation.z = -s * Math.PI / 2; }
  const bg = new THREE.CylinderGeometry(0.004, 0.044, 1.22, 4, 1); bg.rotateY(Math.PI / 4); bg.scale(1, 1, 0.26); bg.rotateX(Math.PI / 2);
  const blade = add(sword, new THREE.Mesh(bg, mats.blade), 0, 0, 0.76);
  const flask = add(armL.hand, new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 8), mats.flask), 0, 0.02, 0.06); flask.visible = false;

  // legs live under the root: the animator places them between the hips and the planted feet
  const legs = [1, -1].map(side => {        // side +1 = left (+x), -1 = right
    const thigh = add(root, new THREE.Mesh(new THREE.CapsuleGeometry(0.068, RIG.thigh - 0.05, n(4), n(10)), clothDark));
    const shin = add(root, new THREE.Mesh(new THREE.CapsuleGeometry(0.056, RIG.shin - 0.05, n(4), n(10)), clothDark));
    const boot = group(root);
    add(boot, new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.13, n(4), n(10)), leather), 0, -0.02, 0.05).rotation.x = Math.PI / 2;
    add(boot, new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.064, 0.14, n(10)), leather), 0, 0.05, -0.01);   // cuff
    return { side, thigh, shin, boot };
  });

  return { tumble, tumbleOff, body, off, chest, chestOff, head, cloak, mantle, armR, armL, sword, blade, flask, lantern, lanLight, tail, legs };
}
