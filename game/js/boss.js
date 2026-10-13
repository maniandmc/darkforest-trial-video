// DITE — the horned colossus. Procedural rig (two-bone IK arms & legs), pose-keyframed attacks, AI, hit/hurt boxes.
import * as THREE from 'three';
import { CFG } from './config.js';
import { clamp, lerp, ease, approachAngle, wrapAngle, rand, randRange } from './math.js';
import { buildBossModel } from './bossmodel.js';

const B = CFG.boss;
const UP = new THREE.Vector3(0, 1, 0);
const ARM = { upper: 2.7, fore: 2.6 }, LEG = { thigh: 2.35, shin: 2.3 };
const PELVIS_Y = 4.25;

// Hand targets are cylindrical around the boss's vertical axis: a = angle (0 forward, + = boss's left), r = radius, y = height.
export const REST = {
  crouch: 0, lean: 0.14, twist: 0, sway: 0, headPitch: 0.05, headYaw: 0, jaw: 0, glow: 0,
  handR: { a: -0.62, r: 2.9, y: 2.9 }, handL: { a: 0.62, r: 2.9, y: 2.9 }, stompR: 0, stompL: 0, kneel: 0,
};
const clonePose = p => ({ ...p, handR: { ...p.handR }, handL: { ...p.handL } });
function mixPose(a, b, t, out) {
  for (const k in a) {
    if (typeof a[k] === 'number') out[k] = lerp(a[k], b[k] ?? a[k], t);
    else { const ha = a[k], hb = b[k] || ha; out[k] = { a: lerp(ha.a, hb.a, t), r: lerp(ha.r, hb.r, t), y: lerp(ha.y, hb.y, t) }; }
  }
  return out;
}
const cyl = (h, v) => v.set(h.r * Math.sin(h.a), h.y, h.r * Math.cos(h.a));

// ---------------------------------------------------------------------------------- attack library
// Segment: { dur, to (partial pose), ease, tag: windup|active|recover, track (turn rad/s), move (m/s), moveEnd,
//            hit: { parts, dmg, kd, kb }, onEnd: event name, gait: 'run' }
function ATTACKS(boss) {
  return {
    slam: () => [
      { tag: 'windup', dur: 1.0, ease: ease.outQ, track: 1.5,
        to: { handR: { a: -0.35, r: 1.3, y: 10.8 }, handL: { a: 0.95, r: 2.7, y: 3.6 }, crouch: 0.1, lean: -0.22, headPitch: -0.3, twist: 0.25, glow: 0.7 } },
      { tag: 'active', dur: 0.17, ease: ease.inQ, track: 0, hit: { parts: ['fistR', 'foreR'], dmg: 33, kd: true, kb: 10 }, onEnd: 'slamR',
        to: { handR: { a: -0.2, r: 4.75, y: 0.95 }, crouch: 1.45, lean: 0.78, twist: -0.12, headPitch: 0.25, glow: 0.2 } },
      { tag: 'recover', dur: 0.8, to: {}, punish: true },
      { tag: 'recover', dur: 0.7, ease: ease.inOutS, to: REST, track: 0.5 },
    ],
    sweep: () => [
      { tag: 'windup', dur: 0.9, ease: ease.outQ, track: 1.6,
        to: { handL: { a: 2.05, r: 4.0, y: 2.7 }, handR: { a: -0.75, r: 2.6, y: 3.4 }, twist: 0.7, crouch: 0.55, lean: 0.22, headYaw: 0.3 } },
      { tag: 'active', dur: 0.36, ease: ease.inOutQ, track: 0, hit: { parts: ['fistL', 'foreL'], dmg: 26, kb: 8 },
        to: { handL: { a: -1.4, r: 5.4, y: 1.25 }, twist: -0.6, headYaw: -0.25 } },
      { tag: 'recover', dur: 0.55, to: { handL: { a: -1.55, r: 4.6, y: 1.9 } }, punish: true },
      { tag: 'recover', dur: 0.7, ease: ease.inOutS, to: REST, track: 0.6 },
    ],
    charge: () => {
      const d = boss.distToPlayer;
      return [
        { tag: 'windup', dur: 0.95, ease: ease.outQ, track: 2.6,
          to: { crouch: 1.3, lean: 0.55, headPitch: 0.35, handR: { a: -0.5, r: 2.7, y: 1.5 }, handL: { a: 0.5, r: 2.7, y: 1.5 }, glow: 1.0 } },
        { tag: 'active', dur: clamp((d + 5) / 15, 0.6, 1.7), track: 0.3, move: 15, gait: 'run', hit: { parts: ['body', 'thighL', 'thighR', 'head'], dmg: 30, kd: true, kb: 12 },
          to: { lean: 0.62, crouch: 0.9, handR: { a: -0.55, r: 2.4, y: 2.2 }, handL: { a: 0.55, r: 2.4, y: 2.2 }, glow: 0.6 } },
        { tag: 'recover', dur: 0.55, move: 15, moveEnd: 0, gait: 'run', to: { lean: 0.1, crouch: 0.6 } },
        { tag: 'recover', dur: 0.85, ease: ease.inOutS, to: REST, track: 0.6, punish: true },
      ];
    },
    roar: () => [
      { tag: 'windup', dur: 0.7, ease: ease.outQ, track: 2.0, noSpeed: true,
        to: { lean: -0.3, headPitch: -0.5, jaw: 0.25, crouch: 0.45, handR: { a: -1.2, r: 3.4, y: 5.0 }, handL: { a: 1.2, r: 3.4, y: 5.0 }, glow: 0.6 } },
      { tag: 'roar', dur: 1.5, ease: ease.outQ, onStart: 'roar',
        to: { jaw: 1, headPitch: -0.72, lean: -0.42, crouch: 0.1, handR: { a: -1.65, r: 4.6, y: 6.9 }, handL: { a: 1.65, r: 4.6, y: 6.9 }, glow: 1.6 } },
      { tag: 'recover', dur: 0.8, ease: ease.inOutS, to: REST, track: 0.8 },
    ],
    lava: () => [
      { tag: 'windup', dur: 1.0, ease: ease.outQ, track: 1.2,
        to: { handR: { a: -0.42, r: 1.5, y: 10.4 }, handL: { a: 0.42, r: 1.5, y: 10.4 }, lean: -0.22, crouch: 0.1, headPitch: -0.3, glow: 1.0 } },
      { tag: 'active', dur: 0.17, ease: ease.inQ, track: 0, onEnd: 'lavaCall', hit: { parts: ['fistR', 'fistL'], dmg: 30, kd: true, kb: 9 },
        to: { handR: { a: -0.26, r: 4.5, y: 0.9 }, handL: { a: 0.26, r: 4.5, y: 0.9 }, crouch: 1.45, lean: 0.78, headPitch: 0.2, glow: 0.4 } },
      { tag: 'recover', dur: 0.9, to: {}, punish: true },
      { tag: 'recover', dur: 0.7, ease: ease.inOutS, to: REST, track: 0.5 },
    ],
    combo: () => [
      { tag: 'windup', dur: 0.62, ease: ease.outQ, track: 1.8,
        to: { handR: { a: -2.0, r: 3.8, y: 4.0 }, handL: { a: 0.8, r: 2.6, y: 3.4 }, twist: -0.6, crouch: 0.45, lean: 0.15 } },
      { tag: 'active', dur: 0.28, ease: ease.inOutQ, track: 0, hit: { parts: ['fistR', 'foreR'], dmg: 20, kb: 6 },
        to: { handR: { a: 1.25, r: 5.0, y: 1.5 }, twist: 0.5 } },
      { tag: 'windup', dur: 0.5, ease: ease.outQ, track: 1.6,
        to: { handL: { a: 2.0, r: 3.8, y: 4.0 }, handR: { a: -0.6, r: 2.8, y: 3.0 }, twist: 0.65 } },
      { tag: 'active', dur: 0.28, ease: ease.inOutQ, track: 0, hit: { parts: ['fistL', 'foreL'], dmg: 20, kb: 6 },
        to: { handL: { a: -1.25, r: 5.0, y: 1.5 }, twist: -0.5 } },
      { tag: 'windup', dur: 0.62, ease: ease.outQ, track: 1.4,
        to: { handR: { a: -0.3, r: 1.4, y: 10.4 }, handL: { a: 0.3, r: 1.4, y: 10.4 }, twist: 0, lean: -0.25, crouch: 0.1, glow: 0.8 } },
      { tag: 'active', dur: 0.16, ease: ease.inQ, track: 0, onEnd: 'comboSlam', hit: { parts: ['fistR', 'fistL'], dmg: 30, kd: true, kb: 10 },
        to: { handR: { a: -0.25, r: 4.6, y: 0.9 }, handL: { a: 0.25, r: 4.6, y: 0.9 }, crouch: 1.45, lean: 0.78, glow: 0.3 } },
      { tag: 'recover', dur: 1.0, to: {}, punish: true },
      { tag: 'recover', dur: 0.7, ease: ease.inOutS, to: REST, track: 0.5 },
    ],
    nova: () => [
      { tag: 'windup', dur: 1.6, ease: ease.inOutS, track: 0.6, noSpeed: true, onStart: 'novaCharge',
        to: { crouch: 1.0, lean: 0.35, handR: { a: -0.9, r: 1.9, y: 4.0 }, handL: { a: 0.9, r: 1.9, y: 4.0 }, headPitch: 0.25, glow: 2.6, jaw: 0.35 } },
      { tag: 'active', dur: 0.25, ease: ease.outQ, track: 0, onStart: 'novaBlast',
        to: { crouch: -0.2, lean: -0.35, handR: { a: -1.7, r: 4.8, y: 6.0 }, handL: { a: 1.7, r: 4.8, y: 6.0 }, headPitch: -0.5, jaw: 1, glow: 3 } },
      { tag: 'recover', dur: 1.4, to: { glow: 0.4 }, punish: true },
      { tag: 'recover', dur: 0.8, ease: ease.inOutS, to: REST, track: 0.5 },
    ],
    stomp: () => [
      { tag: 'windup', dur: 0.85, ease: ease.outQ, track: 1.0,
        to: { stompR: 1, crouch: -0.25, lean: -0.12, sway: 0.2, handR: { a: -1.1, r: 3.3, y: 4.8 }, handL: { a: 1.1, r: 3.3, y: 4.8 }, glow: 0.4 } },
      { tag: 'active', dur: 0.13, ease: ease.inQ, track: 0, onEnd: 'stompR',
        to: { stompR: 0, crouch: 0.75, sway: -0.06, handR: { a: -0.8, r: 3.0, y: 3.0 }, handL: { a: 0.8, r: 3.0, y: 3.0 } } },
      { tag: 'recover', dur: 0.85, ease: ease.inOutS, to: REST, track: 0.4, punish: true },
    ],
  };
}

export class Boss {
  constructor(scene, mats, events) {
    this.events = events;
    this.root = new THREE.Group();
    this.pelvis = new THREE.Group(); this.root.add(this.pelvis);
    this.chest = new THREE.Group(); this.chest.rotation.order = 'YXZ'; this.pelvis.add(this.chest);
    this.neck = new THREE.Group(); this.neck.position.set(0, 3.25, 0.55); this.chest.add(this.neck);
    this.head = new THREE.Group(); this.head.rotation.order = 'YXZ'; this.head.position.set(0, 0.85, 0.45); this.neck.add(this.head);
    this.jaw = new THREE.Group(); this.jaw.position.set(0, -0.45, -0.1); this.head.add(this.jaw);
    const anchor = (parent, x, y, z) => { const o = new THREE.Object3D(); o.position.set(x, y, z); parent.add(o); return o; };
    this.shR = anchor(this.chest, -2.3, 2.6, 0.15); this.shL = anchor(this.chest, 2.3, 2.6, 0.15);
    this.hipR = anchor(this.pelvis, -1.1, -0.15, 0); this.hipL = anchor(this.pelvis, 1.1, -0.15, 0);
    this.chestTop = anchor(this.chest, 0, 3.0, 0.3);
    this.model = buildBossModel(this, mats);
    scene.add(this.root);

    this.attacks = ATTACKS(this);
    // hurtboxes (and hitbox shapes) — world-space capsules updated every frame
    this.parts = {};
    for (const [k, r] of Object.entries({ body: 1.75, head: 1.05, upperR: 0.62, foreR: 0.66, fistR: 0.9, upperL: 0.62, foreL: 0.66, fistL: 0.9,
      thighR: 0.8, shinR: 0.66, thighL: 0.8, shinL: 0.66 }))
      this.parts[k] = { a: new THREE.Vector3(), b: new THREE.Vector3(), wa: new THREE.Vector3(), wb: new THREE.Vector3(),
        pa: new THREE.Vector3(), pb: new THREE.Vector3(), r, mul: k === 'head' ? 1.5 : 1 };
    this._v = Array.from({ length: 12 }, () => new THREE.Vector3());
    this.reset();
  }

  reset() {
    this.root.position.set(0, 0, 8); this.root.rotation.set(0, Math.PI, 0);
    this.yaw = Math.PI;
    this.hp = B.hp; this.poise = B.poise; this.phase = 0; this.sincePoiseHit = 0;
    this.state = 'idle'; this.t = 0; this.timer = 1.2;
    this.pose = clonePose(REST); this.segStart = clonePose(REST); this.segTarget = clonePose(REST);
    this.atk = null; this.seg = 0; this.lastAtk = []; this.cool = {};
    this.gait = 0; this.speed = 0; this.solid = true; this.footprint = B.bodyRadius;
    this.ai = true; this.pendingRoar = false; this.introT = 1; this.root.position.y = 0; this.lastPlant = [false, false];
    this.dmgFlash = 0; this.glowBase = 0; this.dead = false; this.primed = false;
    this.distToPlayer = 20; this.angToPlayer = 0;
    this.applyPose(0);
  }

  get alive() { return !this.dead; }
  get pos() { return this.root.position; }
  phaseCfg() { return B.phases[this.phase]; }

  // ------------------------------------------------------------------------------------------- AI
  update(dt, ctx) {
    const pl = ctx.player;
    const dx = pl.pos.x - this.pos.x, dz = pl.pos.z - this.pos.z;
    this.distToPlayer = Math.hypot(dx, dz);
    const toP = Math.atan2(dx, dz);
    this.angToPlayer = wrapAngle(toP - this.yaw);
    this.t += dt;
    this.dmgFlash = Math.max(0, this.dmgFlash - dt * 4);
    // poise only recovers after a few seconds without being struck — sustained pressure breaks it
    this.sincePoiseHit += dt;
    if (this.state !== 'stagger' && this.state !== 'dead' && this.sincePoiseHit > B.poiseDelay) this.poise = Math.min(B.poise, this.poise + B.poiseRegen * dt);
    for (const k in this.cool) this.cool[k] -= dt;

    let moveSpeed = 0, gaitMode = 'walk';
    const plAlive = pl.alive;
    switch (this.state) {
      case 'idle': {
        this.blendTo(REST, dt, 5);
        if (this.ai) this.turnToward(toP, B.turnRate * dt);
        this.timer -= dt;
        if (this.pendingRoar && plAlive) { this.pendingRoar = false; this.startAttack('roar', ctx); break; }
        if (this.timer <= 0 && plAlive && this.ai) this.decide(ctx);
        break;
      }
      case 'intro': {
        // rising out of the pit; the cutscene drives introT 0..1
        const k = clamp(this.introT, 0, 1);
        this.root.position.y = -11.5 * Math.pow(1 - ease.outC(clamp(k / 0.62, 0, 1)), 1.0);
        const roarK = clamp((k - 0.55) / 0.2, 0, 1) * (1 - clamp((k - 0.92) / 0.08, 0, 1));
        mixPose(REST, ROAR, roarK, this.pose);
        this.pose.headPitch += (1 - clamp(k / 0.5, 0, 1)) * 0.4;
        break;
      }
      case 'chase': {
        this.blendTo(REST, dt, 5);
        this.turnToward(toP, B.turnRate * 1.15 * dt);
        moveSpeed = Math.abs(this.angToPlayer) < 1.2 ? B.walkSpeed * this.phaseCfg().speed : 0.6;
        this.timer -= dt;
        if (!plAlive) { this.state = 'idle'; this.timer = 9e9; break; }
        if (this.pendingRoar) { this.pendingRoar = false; this.startAttack('roar', ctx); break; }
        if (this.timer <= 0 || this.inRangeOf(this.wanted)) this.decide(ctx, true);
        break;
      }
      case 'attack': {
        const r = this.runAttack(dt, ctx, toP);
        moveSpeed = r.move; gaitMode = r.gait || 'walk';
        break;
      }
      case 'stagger': {
        const k = this.t / B.staggerTime;
        const tgt = k < 0.85 ? STAGGER : REST;
        this.blendTo(tgt, dt, k < 0.85 ? 7 : 4);
        if (this.t >= B.staggerTime) { this.state = 'idle'; this.timer = 0.3; this.poise = B.poise; }
        break;
      }
      case 'dead': {
        this.blendTo(DEAD, dt, 1.6);
        break;
      }
    }
    // locomotion
    if (moveSpeed !== 0) {
      const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
      this.pos.x += fx * moveSpeed * dt; this.pos.z += fz * moveSpeed * dt;
      const R = CFG.arenaRadius - 3.2, l = Math.hypot(this.pos.x, this.pos.z);
      if (l > R) { this.pos.x *= R / l; this.pos.z *= R / l; if (this.atk && this.curSeg()?.move) this.nextSeg(ctx); }
    }
    this.speed = lerp(this.speed, Math.abs(moveSpeed), 1 - Math.exp(-8 * dt));
    this.gaitMode = gaitMode;
    // head follows the player when not committed to a swing
    if (this.state === 'idle' || this.state === 'chase') {
      const hy = clamp(this.angToPlayer, -0.7, 0.7);
      this.pose.headYaw = lerp(this.pose.headYaw, hy, 1 - Math.exp(-4 * dt));
    }
    this.applyPose(dt);
  }

  inRangeOf(name) {
    const d = this.distToPlayer, a = Math.abs(this.angToPlayer);
    switch (name) {
      case 'slam': return d > 2.6 && d < 7.6 && a < 0.5;
      case 'sweep': return d > 1.5 && d < 6.6 && a < 0.9;
      case 'stomp': return d < 5.2;
      case 'charge': return d > 8 && a < 0.35;
      default: return d < 6.5 && a < 0.6;
    }
  }

  decide(ctx, fromChase = false) {
    const d = this.distToPlayer, a = Math.abs(this.angToPlayer);
    const w = {};
    if (d < 5.2 && (a > 1.2 || d < 3.0)) w.stomp = 4;
    if (d > 2.6 && d < 7.6 && a < 0.9) w.slam = 3;
    if (d > 1.5 && d < 6.6 && a < 1.25) w.sweep = 3;
    if (d > 10 && (this.cool.charge || 0) <= 0) w.charge = d > 15 ? 5 : 2;
    if (this.phase >= 1) {
      if (d > 1.5 && d < 6.4 && a < 0.9) w.combo = 3.2;
      if (d < 17 && (this.cool.lava || 0) <= 0) w.lava = d > 8 ? 4 : 2.2;
    }
    if (this.phase >= 2 && d < 15 && (this.cool.nova || 0) <= 0) w.nova = 4;
    for (const k in w) {
      const rep = this.lastAtk.filter(x => x === k).length;
      w[k] *= rep >= 2 ? 0.15 : rep === 1 ? 0.55 : 1;
      if ((this.cool[k] || 0) > 0) delete w[k];
    }
    const keys = Object.keys(w);
    if (!keys.length) {
      if (fromChase && this.state === 'chase' && this.timer > 0) return;
      // walk in, aiming for whatever fits best once there
      this.state = 'chase'; this.timer = 3.0;
      this.wanted = d > 9 ? (rand() < 0.5 ? 'slam' : 'sweep') : 'any';
      return;
    }
    let tot = keys.reduce((s, k) => s + w[k], 0), r = rand() * tot, pick = keys[0];
    for (const k of keys) { r -= w[k]; if (r <= 0) { pick = k; break; } }
    this.startAttack(pick, ctx);
  }

  startAttack(name, ctx) {
    this.atk = { name, segs: this.attacks[name](), hits: new Set() };
    this.lastAtk.push(name); if (this.lastAtk.length > 3) this.lastAtk.shift();
    if (name === 'charge') this.cool.charge = 6;
    if (name === 'lava') this.cool.lava = 10;
    if (name === 'nova') this.cool.nova = 14;
    this.state = 'attack'; this.seg = -1; this.nextSeg(ctx);
    this.events.emit('boss-attack', { name });
  }

  curSeg() { return this.atk && this.atk.segs[this.seg]; }

  nextSeg(ctx) {
    const prev = this.curSeg();
    if (prev && prev.onEnd) this.events.emit('boss-impact', { kind: prev.onEnd, boss: this });
    this.seg++;
    const s = this.curSeg();
    if (!s) { this.endAttack(); return; }
    const pc = this.phaseCfg(), sp = s.noSpeed ? 1 : pc.speed;
    s._dur = s.tag === 'windup' ? Math.max(s.dur / sp, Math.min(s.dur, B.minWindup)) : s.dur / sp;
    s._t = 0;
    if (s.onStart) this.events.emit('boss-impact', { kind: s.onStart, boss: this, dur: s._dur });
    this.segStart = clonePose(this.pose);
    this.segTarget = s.to === REST ? clonePose(REST) : clonePose({ ...this.pose, ...s.to });
    if (s.tag === 'active') this.atk.hits.clear();
    this.events.emit('boss-seg', { name: this.atk.name, tag: s.tag, seg: this.seg, dur: s._dur });
  }

  endAttack() {
    this.atk = null; this.state = 'idle';
    const g = this.phaseCfg().gap; this.timer = randRange(g[0], g[1]);
  }

  runAttack(dt, ctx, toP) {
    const s = this.curSeg(); if (!s) return { move: 0 };
    s._t += dt;
    const k = Math.min(s._t / s._dur, 1);
    mixPose(this.segStart, this.segTarget, (s.ease || ease.inOutS)(k), this.pose);
    if (s.track) this.turnToward(toP, s.track * dt);
    let move = 0;
    if (s.move) move = s.moveEnd !== undefined ? lerp(s.move, s.moveEnd, ease.outQ(k)) : s.move;
    if (s.hit) this.activeHit = s.hit; else this.activeHit = null;
    if (s._t >= s._dur) this.nextSeg(ctx);
    return { move, gait: s.gait };
  }

  // windup progress etc. for UI / bots
  telegraph() {
    const s = this.curSeg(); if (!s || !this.atk) return null;
    return { name: this.atk.name, tag: s.tag, t: s._t, dur: s._dur, seg: this.seg, segs: this.atk.segs };
  }

  turnToward(target, step) { this.yaw = approachAngle(this.yaw, target, step); }
  blendTo(p, dt, rate) { mixPose(this.pose, p, 1 - Math.exp(-rate * dt), this.pose); }

  takeDamage(dmg, poiseDmg, part, ctx) {
    if (this.dead) return 0;
    const mul = this.parts[part]?.mul || 1;
    const stagMul = this.state === 'stagger' ? 1.35 : 1;
    const dealt = Math.round(dmg * mul * stagMul);
    this.hp -= dealt; this.dmgFlash = 1;
    if (this.state !== 'stagger') {
      this.poise -= poiseDmg * mul; this.sincePoiseHit = 0;
      if (this.poise <= 0 && this.hp > 0) {
        this.state = 'stagger'; this.t = 0; this.atk = null; this.activeHit = null;
        this.events.emit('boss-stagger');
      }
    }
    if (this.hp <= 0) {
      this.hp = 0; this.dead = true; this.state = 'dead'; this.atk = null; this.activeHit = null; this.solid = true;
      this.events.emit('boss-dead');
    } else {
      // phase change
      const f = this.hp / B.hp;
      for (let i = B.phases.length - 1; i > this.phase; i--) if (f <= B.phases[i].from) { this.phase = i; this.pendingRoar = true; this.events.emit('boss-phase', { phase: i }); break; }
    }
    return dealt;
  }

  // ------------------------------------------------------------------------------------------- rig
  applyPose(dt) {
    const P = this.pose, v = this._v;
    // gait
    const run = this.gaitMode === 'run';
    const stride = run ? 2.6 : 1.5, lift = run ? 0.9 : 0.55;
    if (this.speed > 0.05) this.gait += dt * this.speed / stride * Math.PI;
    const g = this.gait, amt = clamp(this.speed / 2.0, 0, 1);
    const bob = Math.abs(Math.sin(g)) * (run ? 0.35 : 0.18) * amt;

    this.root.rotation.y = this.yaw;
    this.pelvis.position.set(0, PELVIS_Y - P.crouch - bob - P.kneel * 1.6, 0);
    this.pelvis.rotation.set(P.kneel * 0.1, P.twist * 0.25, P.sway);
    this.chest.rotation.set(P.lean + P.kneel * 0.35, P.twist * 0.75, -P.sway * 0.5);
    this.head.rotation.set(P.headPitch, P.headYaw, 0);
    this.jaw.rotation.x = P.jaw * 0.55;
    this.root.updateMatrixWorld(true);

    const toLocal = (obj, out) => this.root.worldToLocal(obj.getWorldPosition(out));
    const m = this.model;
    // arms
    for (const side of ['R', 'L']) {
      const sgn = side === 'R' ? -1 : 1;
      const S = toLocal(side === 'R' ? this.shR : this.shL, v[0]);
      const T = cyl(side === 'R' ? P.handR : P.handL, v[1]);
      const pole = v[2].set(S.x + sgn * 2.2, S.y - 1.2, S.z - 2.6);
      const E = v[3];
      solveIK(S, T, ARM.upper, ARM.fore, pole, E);
      placeSeg(m['upper' + side], S, E);
      placeSeg(m['fore' + side], E, T);
      m['fist' + side].position.copy(T);
      m['fist' + side].quaternion.setFromUnitVectors(UP, v[4].subVectors(T, E).normalize());
      this.setPart('upper' + side, S, E); this.setPart('fore' + side, E, T); this.setPart('fist' + side, T, T);
    }
    // legs
    for (const side of ['R', 'L']) {
      const sgn = side === 'R' ? -1 : 1;
      const H = toLocal(side === 'R' ? this.hipR : this.hipL, v[0]);
      const ph = g + (side === 'R' ? 0 : Math.PI);
      const st = side === 'R' ? P.stompR : P.stompL;
      const up = Math.cos(ph) > 0 && amt > 0.2, si = side === 'R' ? 0 : 1;
      if (this.lastPlant[si] && !up) this.events.emit('boss-step', { side, amt, run });
      this.lastPlant[si] = up;
      const F = v[1].set(sgn * (1.3 + P.kneel * 0.3), Math.max(0, Math.cos(ph)) * lift * amt + st * 3.1, 0.25 + Math.sin(ph) * stride * 0.45 * amt + st * 1.1 + (side === 'R' ? P.kneel * 1.6 : -P.kneel * 0.8));
      if (side === 'L' && P.kneel > 0) F.y = Math.max(F.y, 0);
      const pole = v[2].set(H.x + sgn * 0.4, H.y - 1, H.z + 4);
      const K = v[3];
      solveIK(H, F, LEG.thigh, LEG.shin, pole, K);
      placeSeg(m['thigh' + side], H, K);
      placeSeg(m['shin' + side], K, F);
      m['foot' + side].position.set(F.x, Math.max(F.y, 0) + 0.25, F.z + 0.35);
      this.setPart('thigh' + side, H, K); this.setPart('shin' + side, K, F);
      if (side === 'R') this.footR = this.root.localToWorld(v[5].copy(F)).clone();
    }
    // torso & head capsules
    this.setPart('body', toLocal(this.pelvis, v[6]).add(v[7].set(0, 0.6, 0)), toLocal(this.chestTop, v[8]));
    const hc = toLocal(this.head, v[9]).add(v[10].set(0, 0.15, 0.1));
    this.setPart('head', hc, hc);
    // world-space capsules; the previous frame's copy makes every hit test a sweep
    for (const k in this.parts) {
      const p = this.parts[k];
      p.pa.copy(p.wa); p.pb.copy(p.wb);
      this.root.localToWorld(p.wa.copy(p.a)); this.root.localToWorld(p.wb.copy(p.b));
      if (!this.primed) { p.pa.copy(p.wa); p.pb.copy(p.wb); }
    }
    this.primed = true;
    this.model.update?.(dt, this);
  }

  setPart(k, a, b) { this.parts[k].a.copy(a); this.parts[k].b.copy(b); }
  worldPart(k) { const p = this.parts[k]; return { a: p.wa, b: p.wb, pa: p.pa, pb: p.pb, r: p.r }; }
}

const STAGGER = { ...clonePose(REST), kneel: 1, crouch: 0.3, lean: 0.55, headPitch: 0.45, jaw: 0.6,
  handR: { a: -0.5, r: 3.2, y: 0.6 }, handL: { a: 0.55, r: 3.0, y: 1.6 }, glow: -0.3 };
const ROAR = { ...clonePose(REST), jaw: 1, headPitch: -0.72, lean: -0.42, crouch: 0.1, handR: { a: -1.65, r: 4.6, y: 6.9 }, handL: { a: 1.65, r: 4.6, y: 6.9 }, glow: 1.6 };
const DEAD = { ...clonePose(REST), kneel: 1.25, crouch: 0.6, lean: 1.05, headPitch: 0.7, jaw: 0.9,
  handR: { a: -0.6, r: 3.6, y: 0.4 }, handL: { a: 0.6, r: 3.6, y: 0.4 }, glow: -1 };

const _d = new THREE.Vector3(), _p = new THREE.Vector3();
export function solveIK(S, T, a, b, pole, outE) {
  _d.subVectors(T, S);
  let len = _d.length();
  const dir = _d.multiplyScalar(1 / Math.max(len, 1e-5));
  const L = clamp(len, Math.abs(a - b) + 0.02, a + b - 0.002);
  if (L !== len) T.copy(S).addScaledVector(dir, L);
  const cosA = clamp((a * a + L * L - b * b) / (2 * a * L), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
  _p.subVectors(pole, S); _p.addScaledVector(dir, -_p.dot(dir));
  if (_p.lengthSq() < 1e-6) _p.set(0, 0, 1).addScaledVector(dir, -dir.z);
  _p.normalize();
  outE.copy(S).addScaledVector(dir, a * cosA).addScaledVector(_p, a * sinA);
}
const _q = new THREE.Vector3();
export function placeSeg(mesh, a, b) {
  if (!mesh) return;
  mesh.position.addVectors(a, b).multiplyScalar(0.5);
  _q.subVectors(b, a);
  const l = _q.length();
  if (l > 1e-5) mesh.quaternion.setFromUnitVectors(UP, _q.multiplyScalar(1 / l));
}
