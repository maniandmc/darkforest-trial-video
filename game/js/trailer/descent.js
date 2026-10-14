// The descent: Dante's funnel as a set — nine terraced circles of rock narrowing into the depth, each ledge's lip
// smouldering with a ring of fire (the ninth, Cocytus, is ice), the pit lit from below. The wanderer falls through
// the middle. Ring n's lip sits at y = RING_Y(n), radius RING_R(n).
import * as THREE from 'three';
import { fbm3 } from '../geo.js';

export const RING_Y = n => -n * 20;
export const RING_R = n => 30 - 2.9 * n;

export class Descent {
  constructor(scene, mats) {
    this.group = new THREE.Group(); scene.add(this.group); this.group.visible = false;
    const g = this.group;
    // profile from the rim inward and down: ledge (outer → lip), short lip drop, wall down to the next ledge
    const prof = [new THREE.Vector2(RING_R(0) + 40, 30), new THREE.Vector2(RING_R(0) + 6, 2)];
    for (let n = 0; n < 9; n++) {
      const r = RING_R(n), y = RING_Y(n), rn = RING_R(n + 1) + 3.2;
      prof.push(new THREE.Vector2(r + 3, y + 0.15), new THREE.Vector2(r, y), new THREE.Vector2(r - 0.25, y - 1.2));
      // the wall bulges and steps down to the next ledge's outer edge
      prof.push(new THREE.Vector2(r - 0.1, y - 7), new THREE.Vector2(r - 0.6, y - 13), new THREE.Vector2(rn, RING_Y(n + 1) + 0.3));
    }
    prof.push(new THREE.Vector2(1.5, RING_Y(9) - 25));
    const lg = new THREE.LatheGeometry(prof.reverse(), 160);
    const p = lg.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const a = Math.atan2(v.x, v.z), r = Math.hypot(v.x, v.z);
      const d = (fbm3(Math.cos(a) * 4 + 3, v.y * 0.12, Math.sin(a) * 4, 4) - 0.5) * 2.6 + (fbm3(Math.cos(a) * 14, v.y * 0.4, Math.sin(a) * 14, 3) - 0.5) * 0.8;
      const nr = Math.max(0.5, r + d * Math.min(1, r / 6));
      p.setXYZ(i, Math.sin(a) * nr, v.y, Math.cos(a) * nr);
    }
    lg.computeVertexNormals();
    const rock = new THREE.Mesh(lg, mats.wall); rock.receiveShadow = true; rock.castShadow = true; g.add(rock);
    rock.material.side = THREE.DoubleSide;

    // smouldering lips (the ninth is ice)
    this.rings = [];
    for (let n = 0; n < 9; n++) {
      const ice = n === 8;
      const m = new THREE.MeshStandardMaterial({ color: ice ? 0x9ad4ff : 0x200400, emissive: ice ? 0x58b8ff : 0xff5a12, emissiveIntensity: ice ? 2.5 : 5, roughness: 0.6 });
      const geo = new THREE.TorusGeometry(RING_R(n) - 0.1, 0.22, 8, 220);
      const tp = geo.attributes.position;
      for (let i = 0; i < tp.count; i++) { v.fromBufferAttribute(tp, i); const a = Math.atan2(v.y, v.x); const r = Math.hypot(v.x, v.y);
        const d = (fbm3(Math.cos(a) * 4 + 3, RING_Y(n) * 0.12, Math.sin(a) * 4, 4) - 0.5) * 2.6;
        tp.setXYZ(i, v.x * (1 + d / r), v.y * (1 + d / r), v.z); }
      geo.computeVertexNormals();
      const t = new THREE.Mesh(geo, m); t.rotation.x = Math.PI / 2; t.position.y = RING_Y(n) - 0.05; g.add(t);
      this.rings.push({ mesh: t, mat: m, ice });
    }
    // the depth: a furnace glow far below
    this.glow = new THREE.PointLight(0xff5a1a, 0, 0, 1.6); this.glow.position.set(0, RING_Y(9) - 10, 0); g.add(this.glow);
    this.hemi = new THREE.HemisphereLight(0x281010, 0x4a1406, 0.25); g.add(this.hemi);
    const pit = new THREE.Mesh(new THREE.CircleGeometry(12, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 1.6, 0.35) }));
    pit.rotation.x = -Math.PI / 2; pit.position.y = RING_Y(9) - 24; g.add(pit);
  }

  update(t, o = {}) {
    this.glow.intensity = (o.glow ?? 1) * 4000;
    for (const r of this.rings) r.mat.emissiveIntensity = (r.ice ? 2.5 * (o.ice ?? 1) : 5) * (0.85 + 0.15 * Math.sin(t * 5 + r.mesh.position.y));
  }
}
