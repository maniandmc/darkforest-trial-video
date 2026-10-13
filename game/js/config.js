// All gameplay tuning in one place (units: metres, seconds, HP).
export const CFG = {
  arenaRadius: 30,

  player: {
    hp: 100, stamina: 100,
    runSpeed: 4.8, sprintSpeed: 7.4, healSpeed: 1.5, turnRate: 14,
    staminaRegen: 42, regenDelay: 0.55, exhaustDelay: 1.0, sprintCost: 15,
    // light chain: per-step damage / poise (opener, backhand, spinning finisher)
    light: { cost: 15, dmg: [30, 46, 52], poise: [4.5, 7, 9], windup: 0.13, active: 0.15, recovery: 0.34, chainFrom: 0.1, rollFrom: 0.16, lunge: 2.6 },
    heavy: { cost: 30, dmg: 105, poise: 24, windup: 0.46, active: 0.16, recovery: 0.46, rollFrom: 0.28, lunge: 3.2 },
    roll: { cost: 20, dur: 0.62, speed: 8.6, iStart: 0.04, iEnd: 0.42 },
    flasks: 3, heal: { dur: 1.2, at: 0.72, amount: 60 },
    hitStun: 0.42, downTime: 1.15, hurtInvuln: 0.55,
    bufferTime: 0.28,
    radius: 0.38,
  },

  boss: {
    name: 'DITE', title: 'Colossus of the Ninth Circle',
    hp: 1850, poise: 100, poiseRegen: 0.6, poiseDelay: 0, staggerTime: 2.6,
    bodyRadius: 2.3, walkSpeed: 3.0, turnRate: 1.7,
    // per-phase multipliers: animation speed (telegraphs never drop below minWindup), damage, idle gap
    phases: [
      { from: 1.0, speed: 1.0, dmg: 1.0, gap: [0.55, 1.05] },
      { from: 0.6, speed: 1.08, dmg: 1.04, gap: [0.45, 0.9] },
      { from: 0.25, speed: 1.2, dmg: 1.08, gap: [0.35, 0.7] },
    ],
    minWindup: 0.5,
  },
};
