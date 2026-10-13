// DOM HUD: player bars, flasks, souls-style boss bar with damage tally, lock reticle, hurt vignette, screens.
import * as THREE from 'three';
import { CFG } from './config.js';

const $ = id => document.getElementById(id);

export class HUD {
  constructor() {
    this.el = {
      hud: $('hud'), hp: $('hp-fill'), hpLag: $('hp-lag'), st: $('st-fill'), flasks: $('flask-n'),
      boss: $('bossbar'), bossFill: $('boss-fill'), bossLag: $('boss-lag'), bossName: $('boss-name'), bossDmg: $('boss-dmg'),
      reticle: $('reticle'), vignette: $('vignette'), flash: $('flash'),
    };
    this.el.bossName.textContent = CFG.boss.name;
    $('boss-title').textContent = CFG.boss.title;
    this.hpLag = 1; this.bossLag = 1; this.dmgSum = 0; this.dmgT = 0; this.hurt = 0;
    this._v = new THREE.Vector3();
  }

  show(on) { this.el.hud.classList.toggle('on', on); }
  showBoss(on) { this.el.boss.classList.toggle('on', on); }

  bossDamage(n) {
    this.dmgSum += n; this.dmgT = 2.2;
    this.el.bossDmg.textContent = this.dmgSum; this.el.bossDmg.classList.add('on');
  }
  playerHurt(amount) { this.hurt = Math.min(1, this.hurt + 0.5 + amount / 60); }
  flash(color = '255,240,220', a = 0.6) { const f = this.el.flash; f.style.transition = 'none'; f.style.background = `rgba(${color},${a})`; f.offsetWidth; f.style.transition = 'background .35s ease-out'; f.style.background = `rgba(${color},0)`; }

  update(dt, game) {
    const p = game.player, b = game.boss, E = this.el;
    const hp = p.hp / CFG.player.hp;
    E.hp.style.width = (hp * 100) + '%';
    this.hpLag = this.hpLag > hp ? Math.max(hp, this.hpLag - dt * 0.35) : hp;
    E.hpLag.style.width = (this.hpLag * 100) + '%';
    E.st.style.width = (Math.max(0, p.st) / CFG.player.stamina * 100) + '%';
    E.st.parentElement.classList.toggle('low', p.st <= 0);
    E.flasks.textContent = p.flasks;
    const bh = b.hp / CFG.boss.hp;
    E.bossFill.style.width = (bh * 100) + '%';
    this.bossLag = this.bossLag > bh ? Math.max(bh, this.bossLag - dt * (this.dmgT > 1.4 ? 0 : 0.3)) : bh;
    E.bossLag.style.width = (this.bossLag * 100) + '%';
    E.boss.classList.toggle('enraged', b.phase >= 2);
    if (this.dmgT > 0) { this.dmgT -= dt; if (this.dmgT <= 0) { this.dmgSum = 0; E.bossDmg.classList.remove('on'); } }
    this.hurt = Math.max(0, this.hurt - dt * 1.4);
    const low = hp < 0.3 && p.alive ? 0.25 + 0.12 * Math.sin(game.time * 5) : 0;
    E.vignette.style.opacity = Math.min(1, this.hurt + low).toFixed(3);
    // lock-on reticle over the boss chest
    if (game.locked && b.alive) {
      const v = this._v.copy(b.parts.body.wb).lerp(b.parts.body.wa, 0.25).project(game.camera);
      if (v.z < 1) {
        E.reticle.style.display = 'block';
        E.reticle.style.transform = `translate(${(v.x * 0.5 + 0.5) * innerWidth}px, ${(-v.y * 0.5 + 0.5) * innerHeight}px)`;
      } else E.reticle.style.display = 'none';
    } else E.reticle.style.display = 'none';
  }

  reset() { this.hpLag = 1; this.bossLag = 1; this.dmgSum = 0; this.dmgT = 0; this.hurt = 0; this.el.bossDmg.classList.remove('on'); }
}
