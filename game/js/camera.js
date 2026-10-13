// Third-person orbit camera with soft lock-on, screen shake and a scripted mode for cutscenes.
import * as THREE from 'three';
import { clamp, damp, lerp, lerpAngle, wrapAngle } from './math.js';

export class CameraRig {
  constructor(camera) {
    this.cam = camera;
    this.yaw = 0; this.pitch = 0.3; this.dist = 7.4;
    this.target = new THREE.Vector3(0, 1.7, -15);
    this.look = new THREE.Vector3();
    this.shakeAmp = 0; this.shakeT = 0; this.kick = 0;
    this.script = null;                 // cutscene override: (t) => {pos, look, fov}
    this._p = new THREE.Vector3(); this._l = new THREE.Vector3();
  }

  shake(a) { this.shakeAmp = Math.max(this.shakeAmp, a); }

  reset(player) {
    this.yaw = player.yaw; this.pitch = 0.28;
    this.target.set(player.pos.x, 1.7, player.pos.z);
  }

  update(dt, inp, player, boss, locked) {
    if (!locked) {
      this.yaw -= inp.lookDX;
      this.pitch = clamp(this.pitch + inp.lookDY, -0.3, 1.05);
    } else {
      const dx = boss.pos.x - player.pos.x, dz = boss.pos.z - player.pos.z;
      const want = Math.atan2(dx, dz);
      this.yaw = lerpAngle(this.yaw, want, 1 - Math.exp(-7 * dt));
      const d = Math.hypot(dx, dz);
      // close to the colossus: drop low and look up so its arms and head (the telegraphs) stay in frame
      const wantPitch = clamp(0.05 + (d - 4) * 0.02, 0.05, 0.3);
      this.pitch = damp(this.pitch, wantPitch, 4, dt);
    }
    // pull back when the boss is near, wherever the camera points
    const bd = Math.hypot(boss.pos.x - player.pos.x, boss.pos.z - player.pos.z);
    this.close = damp(this.close || 0, boss.alive ? clamp((14 - bd) / 10, 0, 1) : 0, 3, dt);
    this.dist = 7.4 + this.close * 2.6;
    this.target.x = damp(this.target.x, player.pos.x, 12, dt);
    this.target.z = damp(this.target.z, player.pos.z, 12, dt);
    this.target.y = damp(this.target.y, 1.75, 8, dt);

    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    // over-the-shoulder offset to the right so the hero doesn't hide the boss
    const rx = -fz, rz = fx, sh = 0.55;
    this._p.set(this.target.x - fx * this.dist * cp + rx * sh, this.target.y + this.dist * sp, this.target.z - fz * this.dist * cp + rz * sh);
    if (locked) {
      const bc = boss.parts.body.wb;
      this._l.set(this.target.x + rx * sh, this.target.y + 0.4, this.target.z + rz * sh).lerp(bc, 0.3 + this.close * 0.25);
    } else this._l.set(this.target.x + fx * 2 + rx * sh, this.target.y + 0.5 - sp * 0.8 + this.close * 2.2, this.target.z + fz * 2 + rz * sh);
    this._p.y = Math.max(this._p.y, 0.45);
    this.apply(dt, this._p, this._l, 60 + this.close * 8);
  }

  apply(dt, pos, look, fov) {
    this.shakeT += dt;
    this.shakeAmp *= Math.exp(-dt * 6);
    const a = this.shakeAmp, t = this.shakeT * 37;
    const ox = (Math.sin(t * 1.3) + Math.sin(t * 2.9) * 0.5) * a, oy = (Math.sin(t * 1.7 + 1) + Math.sin(t * 3.3) * 0.5) * a;
    this.cam.position.copy(pos);
    this.cam.position.y += oy * 0.6;
    this.look.copy(look);
    this.cam.lookAt(this.look);
    this.cam.rotateZ(ox * 0.03);
    this.cam.translateX(ox * 0.25);
    if (this.cam.fov !== fov) { this.cam.fov = fov; this.cam.updateProjectionMatrix(); }
  }
}
