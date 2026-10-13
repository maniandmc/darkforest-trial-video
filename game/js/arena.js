// The arena: a basalt disc ringed by cliffs, lit by fire. (Stage 1: greybox geometry + lights.)
import * as THREE from 'three';
import { CFG } from './config.js';

export class Arena {
  constructor(scene, mats, quality) {
    this.group = new THREE.Group(); scene.add(this.group);
    const R = CFG.arenaRadius;
    scene.fog = new THREE.FogExp2(0x1a0d08, 0.018);
    scene.background = new THREE.Color(0x120806);

    const floor = new THREE.Mesh(new THREE.CircleGeometry(R + 6, 96), mats.floor);
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; this.group.add(floor);
    const grid = new THREE.PolarGridHelper(R, 16, 8, 96, 0x6a4a3a, 0x3a2a22);
    grid.position.y = 0.01; this.group.add(grid); this.grid = grid;
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(R + 1.5, R + 3, 7, 96, 1, true), mats.wall);
    wall.material.side = THREE.BackSide; wall.position.y = 3.5; wall.receiveShadow = true; this.group.add(wall);

    this.hemi = new THREE.HemisphereLight(0x6a5a70, 0x3a1a0e, 1.6); scene.add(this.hemi);
    const moon = new THREE.DirectionalLight(0xb8c4ff, 2.2);
    moon.position.set(-20, 40, -14); moon.castShadow = true;
    const sc = moon.shadow.camera; sc.left = sc.bottom = -36; sc.right = sc.top = 36; sc.near = 5; sc.far = 110;
    moon.shadow.mapSize.set(quality.shadow, quality.shadow); moon.shadow.bias = -0.0006; moon.shadow.normalBias = 0.04;
    scene.add(moon); scene.add(moon.target); this.moon = moon;
    const fire = new THREE.PointLight(0xff6a2a, 220, 60, 1.6); fire.position.set(0, 3, 22); scene.add(fire); this.fire = fire;
  }
  update(dt, t) {
    this.fire.intensity = 220 * (0.85 + 0.15 * Math.sin(t * 7.3) * Math.sin(t * 3.1));
  }
}
