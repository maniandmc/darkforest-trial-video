// A slice of the game for the fight shots: the real Player and Boss controllers, Combat (hits, shock rings, lava pools)
// and FX, wired to each other exactly as in the game — Game.prototype.wire and friends are borrowed, only the HUD and
// sound are stubbed out. Shots script it like a director: "at 0.4 s the colossus slams; at 1.1 s the wanderer rolls".
import * as THREE from 'three';
import { Game } from '../game.js';
import { Combat } from '../combat.js';
import { FX } from '../fx.js';
import { CFG } from '../config.js';
import { seed } from '../math.js';

const noop = () => {};

export class Stage {
  constructor(scene, mats, player, boss, events) {
    Object.assign(this, { scene, mats, player, boss, events });
    this.quality = { particles: 1, flashLights: 3 };
    this.fx = new FX(scene, this.quality);
    this.combat = new Combat(this);
    this.sound = { play: noop, setMusic: noop, startAmbience: noop, unlock: noop };
    this.hud = { flash: (rgb, a) => { this.hudFlash = { rgb: rgb.split(',').map(v => +v / 255), a, t: 0 }; }, bossDamage: noop, playerHurt: noop, update: noop, burning: noop };
    this.shakeAmp = 0;
    this.rig = { shake: a => { this.shakeAmp = Math.max(this.shakeAmp, a); }, yaw: 0 };
    this.ctx = { time: 0, camYaw: 0, locked: true, boss, player, events, combat: this.combat };
    this.reset();
    Game.prototype.wire.call(this);
  }
  spawnPools() { return Game.prototype.spawnPools.call(this); }
  shakeAt(p, a) { return Game.prototype.shakeAt.call(this, p, a); }
  onPlayerHit(h) { return Game.prototype.onPlayerHit.call(this, h); }
  onBossHit(i) { return Game.prototype.onBossHit.call(this, i); }

  show(on) {
    this.fx.parts.points.visible = on; this.fx.trail.mesh.visible = on && this.fx.trail.mesh.visible;
    for (const s of this.fx.lights) s.l.visible = on;
    for (const d of this.fx.decals) d.m.visible = on;
  }

  // a fresh fight: both at their marks, nothing in the air
  reset(o = {}) {
    seed(o.seed ?? 7);
    this.player.reset(); this.boss.reset(); this.combat.reset(); this.fx.clear();
    this.boss.ai = false; this.boss.phase = o.phase ?? 0; this.boss.timer = 9e9;
    this.player.hp = 1e6; this.player.flasks = 9; this.player.iUntil = o.vulnerable ? 0 : 1e9;
    this.time = 0; this.clock = 0; this.freeze = 0; this.slowmo = 0; this.shakeAmp = 0; this.hudFlash = null;
    this.stats = { hits: 0, dmgTaken: 0, staggers: 0 };
    this.locked = true; this.camYaw = 0;
    this.inp = {};
    this.fired = new Set();
  }

  // true once, the first tick at or after `when` (shot-script cue)
  at(key, T, when) { if (T >= when && !this.fired.has(key)) { this.fired.add(key); return true; } return false; }

  // scripted input for one tick: move toward a world direction, press buttons (edge-triggered by the script)
  input(dir, buttons = {}) {
    const i = { moveX: 0, moveY: 0, lookDX: 0, lookDY: 0, ...buttons };
    if (dir) { const l = Math.hypot(dir.x, dir.z) || 1; i.moveX = -dir.x / l; i.moveY = dir.z / l; }   // camYaw = 0
    return i;
  }

  // one 1/60 s tick of the fight, as Game.tickFight does it
  step(dt, inp) {
    let sdt = dt;
    if (this.freeze > 0) { this.freeze -= dt; sdt = 0; }
    if (this.slowmo > 0) { this.slowmo -= dt; sdt *= 0.3; }
    this.time += sdt; this.clock += dt;
    const c = this.ctx; c.time = this.time; c.camYaw = 0; c.locked = this.locked;
    this.player.update(sdt, inp, c);
    this.boss.update(sdt, c);
    this.combat.bossHits(this.boss, this.player, this.time); this.combat.update(sdt);
    const tel = this.boss.telegraph();
    if (tel && tel.name === 'nova' && tel.tag === 'windup') this.fx.gather(this.boss.parts.body.wb, 10, 140 * sdt);
    if (this.boss.phase >= 2 && this.boss.alive) this.fx.embersAround(this.boss.parts.body.wb, 2.5, 10 * sdt, 1.5);
    const pa = this.player.atk;
    this.fx.trail.push(this.player.hilt, this.player.tip, this.player.anim.trailOn, pa?.kind === 'heavy');
    this.fx.trail.update(sdt);
    this.fx.update(sdt, this.clock);
    Game.prototype.ambient.call(this, dt);
    this.shakeAmp *= Math.exp(-dt * 7);
    if (this.hudFlash) this.hudFlash.t += dt;
  }

  // the colossus rising out of its pit (the game's intro): k 0 → 1
  intro(k, dt) {
    const b = this.boss;
    b.state = 'intro'; b.introT = k;
    b.update(dt, this.ctx);
    if (k > 0.05 && k < 0.62) this.fx.embersAround(new THREE.Vector3(b.pos.x, 0.2, b.pos.z), 4.5, 360 * dt, 3);
  }
}

export const ARENA_R = CFG.arenaRadius;
