// Autoplay bot used for balance tests and the attract-mode demo. It only reacts to what a player can see:
// the boss's wind-up pose, its distance/facing, and the ground rings — with a human-ish reaction delay and errors.
import { CFG } from './config.js';
import { rand, wrapAngle, clamp } from './math.js';

export class Bot {
  constructor(game, opts = {}) {
    this.g = game;
    this.skill = opts.skill ?? 0.85;        // 1 = never misses a dodge
    this.passive = !!opts.passive;
    this.reaction = opts.reaction ?? 0.2;  // seconds
    this.decided = new Map();              // per attack segment: decision made
    this.strafe = rand() < 0.5 ? 1 : -1;
    this.stats = { rolls: 0, attacks: 0, heals: 0 };
  }

  setMove(v, dx, dz) {
    const c = this.g.rig.yaw, fx = Math.sin(c), fz = Math.cos(c);
    const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    v.moveY = dx * fx + dz * fz;
    v.moveX = dx * -fz + dz * fx;
  }

  step(dt) {
    const g = this.g, p = g.player, b = g.boss;
    const v = g.input.virtual || (g.input.virtual = {});
    v.moveX = v.moveY = 0; v.sprint = false;
    if (this.passive || !p.alive || g.state !== 'fight') return;
    if (!g.locked && b.alive) v.lock = true;
    if (!b.alive) return;

    const bx = b.pos.x, bz = b.pos.z;
    const dx = p.pos.x - bx, dz = p.pos.z - bz, d = Math.hypot(dx, dz);
    const ang = Math.abs(wrapAngle(Math.atan2(dx, dz) - b.yaw));
    const busy = p.state === 'attack' || p.state === 'roll' || p.state === 'heal' || p.state === 'hit' || p.state === 'down';
    const tel = b.telegraph();

    // 1) dodge: imminent boss strike that will reach us
    const threat = this.threat(tel, d, ang);
    if (threat) {
      const key = tel.name + tel.seg + ':' + b.atk.segs.length + ':' + Math.round(g.time / 3);
      if (!this.decided.has(key)) this.decided.set(key, rand() < this.skill ? (rand() - 0.5) * 0.12 : 'miss');
      const j = this.decided.get(key);
      if (j !== 'miss' && threat.until <= 0.1 + j && p.state !== 'roll') {
        const side = this.strafe; this.strafe = rand() < 0.7 ? side : -side;
        let rx, rz;
        if (threat.dir === 'away') { rx = dx; rz = dz; }
        else { rx = -dz * side; rz = dx * side; }               // sideways relative to the boss
        this.setMove(v, rx, rz); v.roll = true; this.stats.rolls++;
        return;
      }
    }
    // ground rings
    for (const w of g.combat.waves) {
      if (w.hit || w.dodged) continue;
      const pd = Math.hypot(p.pos.x - w.c.x, p.pos.z - w.c.z);
      const gap = pd - w.r;
      if (pd > w.maxR + 0.8) continue;                            // it will never reach us
      if (gap > 0 && gap < w.speed * 0.12 + 0.6 && p.state !== 'roll' && p.st > 0 && rand() < this.skill + 0.1) {
        this.setMove(v, p.pos.x - w.c.x, p.pos.z - w.c.z); v.roll = true; this.stats.rolls++; return;
      }
    }
    if (busy) {
      if (p.state === 'attack' && p.atk && p.atk.kind === 'light' && p.atk.step < 1 && this.safeToHit(tel, d) && p.st > CFG.player.light.cost + CFG.player.roll.cost) v.light = true;
      return;
    }
    // 2) heal when it's safe-ish
    if (p.hp < 42 && p.flasks > 0 && (d > 9 || (tel && tel.tag === 'recover' && tel.segs[tel.seg]?.punish && d > 5))) { v.heal = true; this.stats.heals++; return; }
    // 3) punish / poke
    const long = tel && tel.tag === 'recover' && tel.dur - tel.t > 0.8;
    const reserve = long ? 0 : CFG.player.roll.cost + 4;          // keep enough stamina to roll out of the next swing
    if (d < 4.6 && this.safeToHit(tel, d) && p.st > CFG.player.light.cost + reserve) {
      if (long && p.st > 40 && rand() < 0.5) v.heavy = true; else v.light = true;
      this.stats.attacks++;
      this.setMove(v, -dx, -dz);
      return;
    }
    // 4) positioning: hang at ~3.4 m, drift toward the boss's flank; back off when it winds up
    const want = tel && tel.tag === 'windup' ? 7.5 : 3.3;
    let mx = 0, mz = 0;
    if (d > want + 0.4) { mx = -dx; mz = -dz; }
    else if (d < want - 0.6) { mx = dx; mz = dz; }
    const l = d || 1;
    mx += (-dz / l) * this.strafe * 0.6 * l; mz += (dx / l) * this.strafe * 0.6 * l;
    this.setMove(v, mx, mz);
    v.sprint = d > 12 && p.st > 50;
  }

  safeToHit(tel, d) {
    if (!tel) return true;                                     // idle / chasing
    if (tel.tag === 'recover') return true;
    if (tel.tag === 'windup' && tel.dur - tel.t > 0.55) return true;
    return false;
  }

  // will the current/next strike reach the player? returns time until the damaging moment
  threat(tel, d, ang) {
    if (!tel) return null;
    const segs = tel.segs;
    let until = 0;
    if (tel.tag === 'windup') until = tel.dur - tel.t;
    else if (tel.tag === 'active') until = 0;
    else return null;
    const rt = this.reaction;
    // the bot only "sees" a windup after its reaction time has elapsed
    if (tel.tag === 'windup' && tel.t < rt) return null;
    switch (tel.name) {
      case 'slam': return d < 9.8 && ang < 0.95 ? { until: until + 0.05, dir: 'side' } : null;
      case 'sweep': return d < 7.6 && ang < 1.9 ? { until: until + 0.08, dir: d < 3.6 ? 'side' : 'away' } : null;
      case 'stomp': return d < 7 ? { until: until + 0.02, dir: 'away' } : null;
      case 'charge': return ang < 0.6 ? { until: until + Math.max(0, d - 4) / 15, dir: 'side' } : null;
      case 'combo': return d < 8 && ang < 1.6 ? { until, dir: 'side' } : null;
      default: return d < 8 ? { until, dir: 'side' } : null;
    }
  }
}
