// The hooded wanderer: locomotion, stamina, attacks (3-hit light chain, charged heavy), roll with i-frames, healing flasks.
import * as THREE from 'three';
import { CFG } from './config.js';
import { approachAngle } from './math.js';
import { buildPlayerModel } from './playermodel.js';
import { PlayerAnim } from './playeranim.js';

const P = CFG.player;

export class Player {
  constructor(scene, mats) {
    this.mats = mats;
    this.root = new THREE.Group();
    this.rig = buildPlayerModel(this.root, mats);
    Object.assign(this, { sword: this.rig.sword, blade: this.rig.blade, flask: this.rig.flask });
    this.hitAway = new THREE.Vector3(0, 0, -1); this.hitKind = 'hit'; this.serial = 0;
    this.anim = new PlayerAnim(this, this.rig);

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
    this.atk = null; this.chain = 0; this.moving = 0; this.sprinting = false;
    this.healed = false; this.hurtFlash = 0; this.dead = false; this.dotAcc = 0;
    this.root.position.copy(this.pos); this.root.rotation.set(0, 0, 0);
    this.swordPrimed = false;
    this.anim.reset();
  }

  get alive() { return this.state !== 'dead'; }
  invulnerable(now) {
    if (now < this.iUntil || this.state === 'dead') return true;
    return this.state === 'roll' && this.t >= P.roll.iStart && this.t <= P.roll.iEnd;
  }
  spend(c) { this.st -= c; this.regenWait = this.st <= 0 ? P.exhaustDelay : P.regenDelay; this.st = Math.max(this.st, -10); }
  canAct() { return this.st > 0; }

  setState(s) { this.state = s; this.t = 0; this.serial++; }

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
      if (b.a === 'roll' && this.canAct()) { this.buffer = null; this.startRoll(dir); ctx.events.emit('roll'); return true; }
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
    this.atk = { kind, d, step: chain, hit: false };
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
    this.hitAway.copy(away); this.hitKind = this.hp <= 0 ? 'dead' : info.kd ? 'kd' : 'hit';
    this.buffer = null; this.atk = null;
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

  // pushed by a roar: brief stagger, no damage
  push(from, speed, ctx) {
    if (!this.alive || this.state === 'down') return;
    const a = new THREE.Vector3(this.pos.x - from.x, 0, this.pos.z - from.z);
    if (a.lengthSq() < 1e-4) a.set(0, 0, -1);
    a.normalize();
    this.hitAway.copy(a); this.hitKind = 'push';
    this.atk = null; this.buffer = null;
    this.setState('hit'); this.vel.copy(a).multiplyScalar(speed);
  }

  // damage over time (lava): no stun, can kill
  applyDot(amount, ctx) {
    if (!this.alive) return;
    this.hp -= amount; this.dotAcc = (this.dotAcc || 0) + amount;
    if (this.hp <= 0) { this.hp = 0; this.setState('dead'); this.atk = null; ctx.events.emit('player-dead'); }
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

  // the rig is posed by PlayerAnim; the sword's world segment is the hit box
  animate(dt, ctx) {
    this.anim.update(dt, ctx);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 3);
    this.prevHilt.copy(this.hilt); this.prevTip.copy(this.tip);
    this.hilt.set(0, 0, 0.16); this.sword.localToWorld(this.hilt);
    this.tip.set(0, 0, this.atk && this.atk.kind === 'heavy' ? 1.5 : 1.37); this.sword.localToWorld(this.tip);
    if (!this.swordPrimed) { this.prevHilt.copy(this.hilt); this.prevTip.copy(this.tip); this.swordPrimed = true; }
  }

  // hurtbox capsule in world space
  hurtbox(a, b) {
    a.set(this.pos.x, 0.32, this.pos.z); b.set(this.pos.x, 1.45, this.pos.z);
    if (this.state === 'roll' || this.state === 'down' || this.state === 'dead') b.y = 0.75;
    return P.radius;
  }
}
