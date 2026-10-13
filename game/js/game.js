// Game orchestration: renderer, scene, state flow, update order, hit feedback.
import * as THREE from 'three';
import { CFG } from './config.js';
import { Input } from './input.js';
import { Events } from './events.js';
import { makeMaterials } from './materials.js';
import { Arena } from './arena.js';
import { Player } from './player.js';
import { Boss } from './boss.js';
import { Combat } from './combat.js';
import { CameraRig } from './camera.js';
import { HUD } from './hud.js';
import { seed } from './math.js';

export const QUALITY = {
  high: { label: 'HIGH', pr: 1.0, shadow: 2048, bloom: true, msaa: 4, particles: 1.0 },
  medium: { label: 'MEDIUM', pr: 0.85, shadow: 1024, bloom: true, msaa: 0, particles: 0.6 },
  low: { label: 'LOW', pr: 0.66, shadow: 0, bloom: false, msaa: 0, particles: 0.3 },
};

export class Game {
  constructor(canvas, opts = {}) {
    this.opts = opts;
    this.canvas = canvas;
    this.qualityName = opts.quality || 'high';
    this.quality = QUALITY[this.qualityName];
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.quality.msaa > 0, powerPreference: 'high-performance', preserveDrawingBuffer: !!opts.test });
    r.setPixelRatio(Math.min(devicePixelRatio || 1, 2) * this.quality.pr);
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.0;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.enabled = this.quality.shadow > 0; r.shadowMap.type = THREE.PCFShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 400);
    this.events = new Events();
    this.input = new Input(canvas);
    this.mats = makeMaterials();
    this.arena = new Arena(this.scene, this.mats, { shadow: this.quality.shadow || 512 });
    this.player = new Player(this.scene, this.mats);
    this.boss = new Boss(this.scene, this.mats, this.events);
    this.combat = new Combat(this);
    this.rig = new CameraRig(this.camera);
    this.hud = new HUD();
    this.time = 0; this.freeze = 0; this.locked = false; this.state = 'boot'; this.endAt = 0;
    this.ctx = { time: 0, camYaw: 0, locked: false, boss: this.boss, player: this.player, events: this.events, combat: this.combat };
    this.wire();
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  wire() {
    const E = this.events;
    E.on('boss-impact', ({ kind, boss }) => {
      if (kind === 'slamR') {
        this.combat.ring(boss.parts.fistR.wa, { maxR: 4.3, speed: 30, dmg: 16, kb: 7, kind: 'slam' });
        this.shakeAt(boss.parts.fistR.wa, 0.9);
      } else if (kind === 'stompR') {
        this.combat.ring(boss.footR, { maxR: 6.0, speed: 26, dmg: 20, kb: 8, kind: 'stomp' });
        this.shakeAt(boss.footR, 0.8);
      }
    });
    E.on('player-dead', () => { this.endAt = this.time + 2.4; this.pendingEnd = 'defeat'; });
    E.on('boss-dead', () => { this.endAt = this.time + 3.2; this.pendingEnd = 'victory'; this.locked = false; });
    E.on('boss-stagger', () => this.rig.shake(0.4));
  }

  shakeAt(p, amt) {
    const d = Math.hypot(p.x - this.player.pos.x, p.z - this.player.pos.z);
    this.rig.shake(amt * Math.max(0.15, 1 - d / 30));
  }

  // player blade connected
  onPlayerHit(h) {
    this.freeze = h.heavy ? 0.085 : 0.06;
    this.rig.shake(h.heavy ? 0.32 : 0.16);
    this.hud.bossDamage(h.dmg);
    this.events.emit('player-hit-boss', h);
  }
  // boss connected
  onBossHit(info) {
    this.freeze = Math.max(this.freeze, 0.05);
    this.rig.shake(info.kd ? 0.8 : 0.5);
    this.hud.playerHurt(info.dmg);
    this.events.emit('player-hurt', info);
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  startFight() {
    seed(this.opts.seed || 1234);
    this.player.reset(); this.boss.reset(); this.combat.reset(); this.hud.reset();
    this.time = 0; this.freeze = 0; this.endAt = 0; this.pendingEnd = null;
    this.locked = !!this.opts.lockDefault;
    this.rig.reset(this.player);
    this.state = 'fight';
    this.hud.show(true); this.hud.showBoss(true);
    this.setScreen(null);
    this.input.enabled = true;
  }

  setScreen(id) {
    for (const el of document.querySelectorAll('.screen')) el.classList.toggle('on', el.id === id);
  }

  tick(dt) {
    const inp = this.input.read();
    if (this.state === 'fight' || this.state === 'ending') this.tickFight(dt, inp);
    else if (this.state === 'victory' || this.state === 'defeat') {
      this.tickFight(dt, { ...inp, moveX: 0, moveY: 0, light: false, heavy: false, roll: false, heal: false, lock: false });
      if (inp.retry && this.time > this.endAt + 1.0) this.startFight();
    }
    this.input.endFrame();
  }

  tickFight(dt, inp) {
    if (inp.lock && this.boss.alive) this.locked = !this.locked;
    let sdt = dt;
    if (this.freeze > 0) { this.freeze -= dt; sdt = 0; }
    this.time += sdt;
    const c = this.ctx; c.time = this.time; c.camYaw = this.rig.yaw; c.locked = this.locked;
    if (this.state === 'fight') {
      this.player.update(sdt, inp, c);
      this.boss.update(sdt, c);
      this.combat.bossHits(this.boss, this.player, this.time);
      this.combat.update(sdt);
    } else {
      this.player.update(sdt, { moveX: 0, moveY: 0 }, c);
      this.boss.update(sdt, c);
    }
    this.arena.update(dt, this.time);
    this.rig.update(dt, inp, this.player, this.boss, this.locked && this.boss.alive);
    this.hud.update(dt, this);
    if (this.pendingEnd && this.time >= this.endAt) {
      this.state = this.pendingEnd; this.pendingEnd = null; this.endAt = this.time;
      this.setScreen(this.state);
      this.events.emit('end', { result: this.state });
    }
  }

  render() { this.renderer.render(this.scene, this.camera); }
}
