// Hit resolution. Every test is swept between the previous and current frame so fast swings can't tunnel.
import * as THREE from 'three';
import { CFG } from './config.js';
import { segSegDist, lerp } from './math.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const _o1 = new THREE.Vector3(), _o2 = new THREE.Vector3();
const _pa = new THREE.Vector3(), _pb = new THREE.Vector3();
const SAMPLES = 4;

export class Combat {
  constructor(game) { this.game = game; this.waves = []; this.pools = []; }

  reset() { this.waves.length = 0; this.pools.length = 0; }

  // lava pool: telegraphed circle, erupts after the warning, then burns while you stand in it
  pool(center, opts) {
    const p = { c: new THREE.Vector3(center.x, 0, center.z), r: opts.r || 2.5, t: 0, warn: opts.warn || 1.15, life: opts.life || 5.5,
      dmg: opts.dmg || 22, dps: opts.dps || 14, erupted: false, done: false };
    this.pools.push(p);
    this.game.events.emit('pool', p);
    return p;
  }

  // player blade (hilt→tip, swept) against every boss hurtbox capsule; first contact wins
  playerSwordSweep(player, atk) {
    const boss = this.game.boss;
    if (!boss.alive) return;
    let best = null;
    for (let i = 1; i <= SAMPLES; i++) {
      const t = i / SAMPLES;
      _a.lerpVectors(player.prevHilt, player.hilt, t); _b.lerpVectors(player.prevTip, player.tip, t);
      for (const k in boss.parts) {
        const p = boss.parts[k];
        const d = segSegDist(_a, _b, p.wa, p.wb, _o1, _o2);
        if (d < p.r + 0.06 && (!best || d - p.r < best.pen)) best = { part: k, pen: d - p.r, at: _o2.clone().lerp(_o1, 0.5) };
      }
      if (best) break;
    }
    if (!best) return;
    atk.hit = true;
    const d = atk.d;
    const dealt = boss.takeDamage(d.dmg, d.poise, best.part, this.game);
    this.game.onPlayerHit({ part: best.part, at: best.at, dmg: dealt, heavy: atk.kind === 'heavy' });
  }

  // boss active hitboxes against the player's capsule
  bossHits(boss, player, now) {
    const h = boss.activeHit;
    if (!h || !boss.atk || boss.atk.hits.has('player') || !player.alive) return;
    const pr = player.hurtbox(_pa, _pb);
    for (const name of h.parts) {
      const p = boss.parts[name];
      for (let i = 0; i <= SAMPLES; i++) {
        const t = i / SAMPLES;
        _a.lerpVectors(p.pa, p.wa, t); _b.lerpVectors(p.pb, p.wb, t);
        const d = segSegDist(_a, _b, _pa, _pb, _o1, _o2);
        if (d < p.r + pr) {
          boss.atk.hits.add('player');
          this.applyToPlayer({ dmg: h.dmg, kd: h.kd, kb: h.kb, from: boss.pos.clone(), at: _o2.clone(), src: boss.atk.name });
          return;
        }
      }
    }
  }

  applyToPlayer(info) {
    const g = this.game;
    info.dmg = Math.round(info.dmg * g.boss.phaseCfg().dmg);
    const ok = g.player.takeHit(info, g.ctx);
    if (ok) g.onBossHit(info);
    else if (g.player.state === 'roll') g.events.emit('dodged', info);
    return ok;
  }

  // expanding ground ring: hits the player once when the front passes them (roll through it, or outrun it)
  ring(center, opts) {
    const w = { c: new THREE.Vector3(center.x, 0, center.z), r: opts.r0 || 0, speed: opts.speed || 30, maxR: opts.maxR, width: opts.width || 1.4,
      dmg: opts.dmg, kd: !!opts.kd, kb: opts.kb || 7, hit: false, t: 0, kind: opts.kind || 'shock', prevR: opts.r0 || 0, push: !!opts.push };
    this.waves.push(w);
    this.game.events.emit('ring', w);
    return w;
  }

  update(dt) {
    const g = this.game, pl = g.player;
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i];
      w.t += dt; w.prevR = w.r; w.r = Math.min(w.maxR, w.r + w.speed * dt);
      if (!w.hit && pl.alive) {
        const d = Math.hypot(pl.pos.x - w.c.x, pl.pos.z - w.c.z);
        // the band swept this frame, widened by the ring thickness and the player's radius
        const lo = w.prevR - w.width * 0.5 - CFG.player.radius, hi = w.r + w.width * 0.5 + CFG.player.radius;
        if (d >= lo && d <= hi) {
          w.hit = true;
          if (w.push) { if (!pl.invulnerable(g.time)) pl.push(w.c, w.kb, g.ctx); }
          else {
            const ok = this.applyToPlayer({ dmg: w.dmg, kd: w.kd, kb: w.kb, from: w.c.clone(), at: pl.pos.clone(), src: w.kind });
            if (!ok) w.hit = false, w.dodged = true;
          }
        }
      }
      if (w.r >= w.maxR && w.t > 0.05) { if (!w.done) { w.done = true; } this.waves.splice(i, 1); }
    }
    pl.burning = false;
    for (let i = this.pools.length - 1; i >= 0; i--) {
      const p = this.pools[i];
      p.t += dt;
      const d = Math.hypot(pl.pos.x - p.c.x, pl.pos.z - p.c.z), inside = d < p.r + CFG.player.radius * 0.4;
      if (!p.erupted && p.t >= p.warn) {
        p.erupted = true; g.events.emit('pool-erupt', p);
        if (inside && pl.alive) this.applyToPlayer({ dmg: p.dmg, kd: false, kb: 6, from: p.c.clone(), at: pl.pos.clone(), src: 'lava' });
      } else if (p.erupted && inside && pl.alive && pl.state !== 'down') {
        pl.burning = true;
        pl.applyDot(p.dps * dt, g.ctx);
      }
      if (p.t >= p.warn + p.life) { p.done = true; this.pools.splice(i, 1); }
    }
  }
}
