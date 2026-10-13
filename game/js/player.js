// The hooded wanderer: locomotion, stamina, attacks (3-hit light chain, charged heavy), roll with i-frames, healing flasks.
import * as THREE from 'three';
import { CFG } from './config.js';
import { clamp, lerp, ease, approachAngle, wrapAngle, segSegDist } from './math.js';

const P = CFG.player;
const REST_ARM = { yaw: -0.3, pitch: 0.95, roll: 0.0 };
// light chain: [windup pose, end-of-swing pose]
const LIGHT = [
  { from: { yaw: -1.95, pitch: 0.12, roll: -0.3 }, to: { yaw: 1.35, pitch: 0.38, roll: 0.3 } },
  { from: { yaw: 1.7, pitch: -0.05, roll: 0.4 }, to: { yaw: -1.55, pitch: 0.42, roll: -0.3 } },
  { from: { yaw: -0.55, pitch: -1.45, roll: 0.0 }, to: { yaw: 0.35, pitch: 1.05, roll: 0.0 } },
];
const HEAVY = { from: { yaw: 0.05, pitch: -2.35, roll: 0 }, to: { yaw: 0.1, pitch: 1.2, roll: 0 } };
const lerpPose = (a, b, t) => ({ yaw: lerp(a.yaw, b.yaw, t), pitch: lerp(a.pitch, b.pitch, t), roll: lerp(a.roll, b.roll, t) });

export class Player {
  constructor(scene, mats) {
    this.mats = mats;
    this.root = new THREE.Group();
    this.body = new THREE.Group(); this.body.position.y = 0.55; this.root.add(this.body);
    const off = new THREE.Group(); off.position.y = -0.55; this.body.add(off); this.model = off;

    const cloth = mats.cloak, dark = mats.playerDark;
    const cloak = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.47, 1.28, 14, 3), cloth);
    cloak.position.y = 0.66; off.add(cloak);
    const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 10), cloth);
    shoulders.scale.set(1.25, 0.75, 0.95); shoulders.position.y = 1.3; off.add(shoulders);
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), cloth);
    hood.scale.set(1.0, 1.15, 1.12); hood.position.set(0, 1.52, -0.02); off.add(hood);
    const peak = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.3, 10), cloth);
    peak.position.set(0, 1.71, -0.1); peak.rotation.x = -0.5; off.add(peak);
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), dark);
    face.position.set(0, 1.5, 0.11); face.scale.set(1, 1.1, 0.6); off.add(face);
    for (const m of [cloak, shoulders, hood, peak]) m.castShadow = true;
    this.cloak = cloak;

    const mkArm = (side) => {
      const piv = new THREE.Group(); piv.rotation.order = 'YXZ';
      piv.position.set(-0.27 * side, 1.29, 0.04); off.add(piv);
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.36, 4, 8), cloth);
      arm.rotation.x = Math.PI / 2; arm.position.z = 0.22; arm.castShadow = true; piv.add(arm);
      return piv;
    };
    this.armR = mkArm(1); this.armL = mkArm(-1);

    // sword along local +z of the right arm pivot
    const sword = new THREE.Group(); sword.position.z = 0.46; this.armR.add(sword); this.sword = sword;
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.22, 8), dark);
    grip.rotation.x = Math.PI / 2; sword.add(grip);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.045, 0.05), mats.steel);
    guard.position.z = 0.12; sword.add(guard);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.018, 1.18), mats.blade);
    blade.position.z = 0.73; blade.castShadow = true; sword.add(blade);
    this.blade = blade;
    // flask in the left hand (shown while healing)
    const flask = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 8), mats.flask);
    flask.position.z = 0.48; flask.visible = false; this.armL.add(flask); this.flask = flask;

    scene.add(this.root);
    this.hilt = new THREE.Vector3(); this.tip = new THREE.Vector3();
    this.prevHilt = new THREE.Vector3(); this.prevTip = new THREE.Vector3();
    this.reset();
  }

  reset() {
    this.pos = new THREE.Vector3(0, 0, -15);
    this.yaw = 0; this.vel = new THREE.Vector3();
    this.hp = P.hp; this.st = P.stamina; this.regenWait = 0; this.flasks = P.flasks;
    this.state = 'idle'; this.t = 0; this.iUntil = 0; this.buffer = null;
    this.atk = null; this.chain = 0; this.moving = 0; this.sprinting = false; this.bob = 0;
    this.arm = { ...REST_ARM }; this.armLp = { yaw: 0.25, pitch: 0.95, roll: 0 };
    this.healed = false; this.hurtFlash = 0; this.dead = false;
    this.root.position.copy(this.pos); this.root.rotation.set(0, 0, 0);
    this.body.rotation.set(0, 0, 0);
  }

  get alive() { return this.state !== 'dead'; }
  invulnerable(now) {
    if (now < this.iUntil || this.state === 'dead') return true;
    return this.state === 'roll' && this.t >= P.roll.iStart && this.t <= P.roll.iEnd;
  }
  spend(c) { this.st -= c; this.regenWait = this.st <= 0 ? P.exhaustDelay : P.regenDelay; this.st = Math.max(this.st, -10); }
  canAct() { return this.st > 0; }

  setState(s) { this.state = s; this.t = 0; }

  // returns the desired move direction in world space from camera-relative input
  moveDir(inp, camYaw) {
    const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
    const x = fx * inp.moveY - fz * inp.moveX, z = fz * inp.moveY + fx * inp.moveX;
    const l = Math.hypot(x, z);
    return l > 0.01 ? { x: x / l, z: z / l, l: Math.min(l, 1) } : null;
  }

  faceTarget(ctx, dir) {
    if (ctx.locked && ctx.boss.alive) { const d = ctx.boss.root.position; return Math.atan2(d.x - this.pos.x, d.z - this.pos.z); }
    if (dir) return Math.atan2(dir.x, dir.z);
    return this.yaw;
  }

  update(dt, inp, ctx) {
    const now = ctx.time;
    this.t += dt;
    if (inp.light) this.buffer = { a: 'light', t: now };
    if (inp.heavy) this.buffer = { a: 'heavy', t: now };
    if (inp.roll) this.buffer = { a: 'roll', t: now };
    if (inp.heal) this.buffer = { a: 'heal', t: now };
    if (this.buffer && now - this.buffer.t > P.bufferTime) this.buffer = null;

    // stamina
    if (this.regenWait > 0) this.regenWait -= dt;
    else if (!this.sprinting && this.state !== 'attack' && this.state !== 'roll') this.st = Math.min(P.stamina, this.st + P.staminaRegen * (this.state === 'heal' ? 0.5 : 1) * dt);

    const dir = this.moveDir(inp, ctx.camYaw);
    this.sprinting = false;
    const startBuffered = () => {
      const b = this.buffer; if (!b) return false;
      if (b.a === 'roll' && this.canAct()) { this.buffer = null; this.startRoll(dir); return true; }
      if ((b.a === 'light' || b.a === 'heavy') && this.canAct()) { this.buffer = null; this.startAttack(b.a, dir, ctx); return true; }
      if (b.a === 'heal' && this.flasks > 0) { this.buffer = null; this.flasks--; this.healed = false; this.setState('heal'); ctx.events.emit('heal-start'); return true; }
      return false;
    };

    switch (this.state) {
      case 'idle': case 'move': {
        if (startBuffered()) break;
        let speed = 0;
        if (dir) {
          const wantSprint = inp.sprint && this.st > 0;
          speed = (wantSprint ? P.sprintSpeed : P.runSpeed) * dir.l;
          if (wantSprint) { this.sprinting = true; this.st -= P.sprintCost * dt; this.regenWait = this.st <= 0 ? P.exhaustDelay : 0.3; }
          this.vel.x = dir.x * speed; this.vel.z = dir.z * speed;
          const face = (ctx.locked && !this.sprinting) ? this.faceTarget(ctx, dir) : Math.atan2(dir.x, dir.z);
          this.yaw = approachAngle(this.yaw, face, P.turnRate * dt);
          this.state = 'move';
        } else {
          this.vel.x = this.vel.z = 0; this.state = 'idle';
          if (ctx.locked) this.yaw = approachAngle(this.yaw, this.faceTarget(ctx, null), 6 * dt);
        }
        this.moving = speed;
        break;
      }
      case 'attack': this.updateAttack(dt, dir, ctx, startBuffered); break;
      case 'roll': {
        const r = P.roll, k = Math.min(this.t / r.dur, 1);
        const v = r.speed * Math.pow(1 - k, 0.55);
        this.vel.x = Math.sin(this.rollYaw) * v; this.vel.z = Math.cos(this.rollYaw) * v;
        if (this.t >= r.dur) { this.setState('idle'); startBuffered(); }
        else if (this.t > r.dur * 0.78 && this.buffer && this.buffer.a !== 'roll') { this.setState('idle'); startBuffered(); }
        break;
      }
      case 'heal': {
        const h = P.heal;
        if (dir) { this.vel.x = dir.x * P.healSpeed; this.vel.z = dir.z * P.healSpeed; this.yaw = approachAngle(this.yaw, Math.atan2(dir.x, dir.z), 5 * dt); }
        else this.vel.set(0, 0, 0);
        if (!this.healed && this.t >= h.at) { this.healed = true; this.hp = Math.min(P.hp, this.hp + h.amount); ctx.events.emit('healed'); }
        if (this.t >= h.dur) this.setState('idle');
        break;
      }
      case 'hit': {
        this.vel.multiplyScalar(Math.exp(-7 * dt));
        if (this.t >= P.hitStun) { this.setState('idle'); startBuffered(); }
        break;
      }
      case 'down': {
        this.vel.multiplyScalar(Math.exp(-5 * dt));
        if (this.t >= P.downTime) { this.setState('idle'); this.iUntil = Math.max(this.iUntil, now + 0.35); }
        break;
      }
      case 'dead': this.vel.multiplyScalar(Math.exp(-4 * dt)); break;
    }

    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    this.resolveCollisions(ctx);
    this.animate(dt, ctx);
  }

  startAttack(kind, dir, ctx) {
    const d = kind === 'light' ? P.light : P.heavy;
    const chain = kind === 'light' && this.state === 'attack' && this.atk && this.atk.kind === 'light' ? (this.atk.step + 1) % 3 : 0;
    this.spend(d.cost);
    this.yaw = this.faceTarget(ctx, dir);
    this.atk = { kind, d, step: chain, hit: false, pose0: { ...this.arm } };
    this.setState('attack');
    this.swordPrimed = false;
    ctx.events.emit('swing-start', { kind });
  }

  updateAttack(dt, dir, ctx, startBuffered) {
    const a = this.atk, d = a.d, t = this.t;
    const tA = d.windup, tB = d.windup + d.active, tEnd = tB + d.recovery;
    // slight tracking during wind-up, a lunge through the swing
    if (t < tA) this.yaw = approachAngle(this.yaw, this.faceTarget(ctx, dir), 5 * dt);
    const lunge = t < tB ? d.lunge * (t < tA ? 0.35 : 1.0) : d.lunge * Math.max(0, 1 - (t - tB) / 0.12) * 0.4;
    this.vel.x = Math.sin(this.yaw) * lunge; this.vel.z = Math.cos(this.yaw) * lunge;
    if (t >= tA && t <= tB + 0.02 && !a.hit) ctx.combat.playerSwordSweep(this, a);
    if (t >= tA && !a.whoosh) { a.whoosh = true; ctx.events.emit('swing', { kind: a.kind }); }
    // cancels
    if (t > tB) {
      const r = t - tB;
      const b = this.buffer;
      if (b && b.a === 'roll' && r >= d.rollFrom) { startBuffered(); return; }
      if (b && a.kind === 'light' && b.a === 'light' && r >= (d.chainFrom || 0)) { startBuffered(); return; }
      if (b && b.a === 'heavy' && r >= (d.chainFrom || d.rollFrom)) { startBuffered(); return; }
    }
    if (t >= tEnd) { this.setState('idle'); this.atk = null; startBuffered(); }
  }

  takeHit(info, ctx) {
    if (this.invulnerable(ctx.time)) return false;
    this.hp -= info.dmg; this.hurtFlash = 1;
    const away = new THREE.Vector3(this.pos.x - info.from.x, 0, this.pos.z - info.from.z);
    if (away.lengthSq() < 1e-4) away.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    away.normalize();
    this.buffer = null; this.atk = null; this.flask.visible = false;
    if (this.hp <= 0) {
      this.hp = 0; this.setState('dead'); this.vel.copy(away).multiplyScalar(4);
      ctx.events.emit('player-dead');
    } else if (info.kd) {
      this.setState('down'); this.vel.copy(away).multiplyScalar(info.kb || 9);
      this.iUntil = ctx.time + P.downTime + 0.35;
      this.yaw = Math.atan2(-away.x, -away.z);
    } else {
      this.setState('hit'); this.vel.copy(away).multiplyScalar(info.kb || 5);
      this.iUntil = ctx.time + P.hurtInvuln;
    }
    return true;
  }

  startRoll(dir) {
    this.spend(P.roll.cost);
    this.rollYaw = dir ? Math.atan2(dir.x, dir.z) : this.yaw;
    this.yaw = this.rollYaw;
    this.atk = null;
    this.setState('roll');
  }

  resolveCollisions(ctx) {
    const R = CFG.arenaRadius - 0.6, l = Math.hypot(this.pos.x, this.pos.z);
    if (l > R) { this.pos.x *= R / l; this.pos.z *= R / l; }
    const b = ctx.boss;
    if (b && b.solid) {
      const dx = this.pos.x - b.root.position.x, dz = this.pos.z - b.root.position.z;
      const d = Math.hypot(dx, dz), min = b.footprint + P.radius;
      if (d < min && d > 1e-4) { this.pos.x = b.root.position.x + dx / d * min; this.pos.z = b.root.position.z + dz / d * min; }
    }
  }

  // procedural animation of the rig
  animate(dt, ctx) {
    const s = this.state, t = this.t;
    let arm = REST_ARM, bodyPitch = 0, bodyY = 0.55, bodyRoll = 0, spin = 0;
    this.flask.visible = false;
    if (s === 'move' || s === 'idle') {
      const spd = this.moving;
      this.bob += dt * (spd > 0.1 ? spd * 2.1 : 1.5);
      bodyY += spd > 0.1 ? Math.abs(Math.sin(this.bob)) * 0.06 : Math.sin(this.bob) * 0.008;
      bodyPitch = spd * 0.035 * (this.sprinting ? 1.6 : 1);
      arm = { yaw: REST_ARM.yaw - 0.1 * Math.sin(this.bob) * (spd > 0.1 ? 1 : 0), pitch: REST_ARM.pitch + (this.sprinting ? 0.5 : 0), roll: 0 };
    } else if (s === 'attack' && this.atk) {
      const a = this.atk, d = a.d, sw = a.kind === 'heavy' ? HEAVY : LIGHT[a.step];
      const tA = d.windup, tB = tA + d.active;
      if (t < tA) { arm = lerpPose(a.pose0, sw.from, ease.outQ(t / tA)); bodyPitch = a.kind === 'heavy' ? -0.12 * (t / tA) : 0; }
      else if (t < tB) { arm = lerpPose(sw.from, sw.to, ease.inOutQ((t - tA) / d.active)); bodyPitch = a.kind === 'heavy' ? 0.3 : 0.12; }
      else { const k = ease.inOutS(Math.min((t - tB) / d.recovery, 1)); arm = lerpPose(sw.to, REST_ARM, k); bodyPitch = (a.kind === 'heavy' ? 0.3 : 0.12) * (1 - k); }
    } else if (s === 'roll') {
      const k = Math.min(t / P.roll.dur, 1);
      spin = ease.inOutQ(Math.min(k / 0.82, 1)) * Math.PI * 2;
      bodyY = 0.55 - 0.22 * Math.sin(Math.PI * Math.min(k / 0.82, 1));
      arm = { yaw: -0.2, pitch: 1.4, roll: 0 };
    } else if (s === 'heal') {
      const k = Math.min(t / P.heal.dur, 1);
      this.flask.visible = !this.healed || t < P.heal.at + 0.2;
      this.armLp = { yaw: 0.2, pitch: lerp(0.95, -0.75, Math.sin(Math.PI * k)), roll: 0 };
    } else if (s === 'hit') {
      bodyPitch = -0.35 * Math.exp(-t * 6);
    } else if (s === 'down') {
      const k = t / P.downTime;
      bodyPitch = k < 0.7 ? -1.45 * ease.outQ(Math.min(k / 0.18, 1)) : -1.45 * (1 - ease.inOutQ((k - 0.7) / 0.3));
      bodyY = 0.55 - 0.3 * (k < 0.7 ? Math.min(k / 0.18, 1) : 1 - (k - 0.7) / 0.3);
    } else if (s === 'dead') {
      bodyPitch = -1.5 * ease.outQ(Math.min(t / 0.6, 1)); bodyY = 0.55 - 0.32 * Math.min(t / 0.6, 1);
    }
    if (s !== 'heal') this.armLp = { yaw: 0.25 + (s === 'move' ? 0.1 * Math.sin(this.bob) : 0), pitch: 0.95, roll: 0 };
    // smooth the arm between states (attacks drive it directly)
    const k = s === 'attack' ? 1 : 1 - Math.exp(-18 * dt);
    this.arm = s === 'attack' ? arm : lerpPose(this.arm, arm, k);

    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
    this.body.position.y = bodyY;
    this.body.rotation.set(bodyPitch + spin, 0, bodyRoll);
    this.armR.rotation.set(this.arm.pitch, this.arm.yaw, this.arm.roll);
    this.armL.rotation.set(this.armLp.pitch, this.armLp.yaw, this.armLp.roll);
    this.cloak.scale.set(1 + 0.05 * Math.min(this.moving / 5, 1), 1, 1 + 0.08 * Math.min(this.moving / 5, 1));
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 3);

    this.prevHilt.copy(this.hilt); this.prevTip.copy(this.tip);
    this.root.updateMatrixWorld(true);
    this.hilt.set(0, 0, 0.14); this.sword.localToWorld(this.hilt);
    this.tip.set(0, 0, this.atk && this.atk.kind === 'heavy' ? 1.45 : 1.32); this.sword.localToWorld(this.tip);
    if (!this.swordPrimed) { this.prevHilt.copy(this.hilt); this.prevTip.copy(this.tip); this.swordPrimed = true; }
  }

  // hurtbox capsule in world space
  hurtbox(a, b) {
    a.set(this.pos.x, 0.32, this.pos.z); b.set(this.pos.x, 1.45, this.pos.z);
    if (this.state === 'roll' || this.state === 'down' || this.state === 'dead') b.y = 0.75;
    return P.radius;
  }
}
