// Directing the wanderer for the trailer. Gameplay drives the rig from input; here a shot gives a path (where to be,
// which way to face, at every moment) and directives (walk relaxed, raise the lantern, turn the head). The game's own
// animator does the rest: stride and leg IK from the velocity, cloak, pendulum lantern, momentum lean.
import { GUARD } from '../playeranim.js';
import { groundH } from './forest.js';

const TAU = Math.PI * 2;
// a wary walk: sword low at the right side, lantern hanging from the left fist
export const WALK = { ...GUARD, hipY: -0.015, lean: 0.05, side: 0, twist: 0, cB: 0.06, cT: 0, cS: 0, hY: 0, hP: 0.1,
  rY: -0.25, rP: 1.42, rR: 0.15, rE: 0.3, rWp: 0.95, rWy: 0, lY: 0.3, lP: 1.32, lR: 0, lE: 0.28, lIK: 0 };
// lantern lifted forward to light the dark ahead; the body opens toward it
export const RAISE = { lY: 0.12, lP: -0.32, lR: 0.08, lE: 0.22, cT: -0.16, cS: 0.05, cB: -0.03, lean: -0.01, hP: -0.1, rP: 1.48, rE: 0.2 };

const mixIn = (o, P, k) => { for (const c in P) o[c] += (P[c] - o[c]) * k; };

export class Puppet {
  constructor(player) {
    this.p = player; this.d = { raise: 0, lookY: 0, lookP: 0 };
    player.anim.override = (o, s) => this.pose(o, s);
  }

  pose(o, s) {
    if (s !== 'idle' && s !== 'move') return;
    const A = this.p.anim, d = this.d, m = A.moveW, ph = A.phase * TAU, k = d.raise;
    const sw = Math.cos(ph), bob = -Math.cos(2 * ph - 0.5);
    for (const c in WALK) o[c] = WALK[c];
    o.hipY += m * (0.024 * bob - 0.012);
    o.side += m * 0.03 * Math.sin(ph);
    o.twist -= m * 0.06 * sw; o.cT += m * 0.08 * sw;
    o.rP -= m * 0.2 * sw * (1 - 0.5 * k);                 // the sword arm swings against the left leg
    o.lP += m * 0.12 * sw * (1 - k);                      // the lantern arm barely: it carries the light
    const c = A.clock;                                   // breathing
    o.cB += (1 - m) * 0.02 * Math.sin(c * 2.0); o.hipY += (1 - m) * 0.006 * Math.sin(c * 2.0 + 0.8);
    mixIn(o, RAISE, k);
    o.hY += d.lookY; o.hP += d.lookP;
  }

  // place the wanderer for this sim step (positions from the shot's path; velocity from the step)
  step(dt, a, ctx) {
    const p = this.p;
    if (dt > 0) p.vel.set((a.x - p.pos.x) / dt, 0, (a.z - p.pos.z) / dt);
    p.pos.set(a.x, groundH(a.x, a.z), a.z);
    p.yaw = a.yaw; p.t += dt;
    p.state = Math.hypot(p.vel.x, p.vel.z) > 0.05 ? 'move' : 'idle';
    this.d.raise = a.raise || 0; this.d.lookY = a.lookY || 0; this.d.lookP = a.lookP || 0;
    p.animate(dt, ctx);
  }

  // jump to a pose without history (start of a shot)
  place(a) {
    const p = this.p;
    p.pos.set(a.x, groundH(a.x, a.z), a.z); p.vel.set(0, 0, 0); p.yaw = a.yaw; p.state = 'idle'; p.t = 0;
    p.anim.reset();
  }
}
