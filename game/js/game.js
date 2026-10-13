// Game orchestration: renderer, scene, state flow (title → intro → fight → result), update order, feedback wiring.
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
import { FX } from './fx.js';
import { Sound } from './audio.js';
import { Post } from './post.js';
import { matTime } from './materials.js';
import { seed, rand, randRange, clamp, lerp, ease } from './math.js';

export const QUALITY = {
  high: { label: 'High', pr: 1.0, shadow: 2048, bloom: true, particles: 1.0 },
  medium: { label: 'Medium', pr: 0.8, shadow: 1024, bloom: true, particles: 0.6 },
  low: { label: 'Low', pr: 0.6, shadow: 0, bloom: false, particles: 0.35 },
};
const INTRO_LEN = 5.0;
const $ = id => document.getElementById(id);

export class Game {
  constructor(canvas, opts = {}) {
    this.opts = opts;
    this.canvas = canvas;
    let q = opts.quality;
    try { q = q || localStorage.getItem('dite.quality'); } catch (e) { /* storage unavailable */ }
    this.qualityName = QUALITY[q] ? q : 'high';
    this.quality = { ...QUALITY[this.qualityName] };
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: !!opts.test });
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.0;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.type = THREE.PCFShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 400);
    this.events = new Events();
    this.input = new Input(canvas);
    this.mats = makeMaterials(this.renderer);
    this.arena = new Arena(this.scene, this.mats, { shadow: this.quality.shadow || 1024 });
    this.player = new Player(this.scene, this.mats);
    this.boss = new Boss(this.scene, this.mats, this.events);
    this.combat = new Combat(this);
    this.rig = new CameraRig(this.camera);
    this.hud = new HUD();
    this.fx = new FX(this.scene, this.quality);
    this.sound = new Sound();
    if (opts.record) this.sound.unlock = () => {};                 // recorded sessions log sound and render it offline
    this.sound.clock = () => this.clock;
    this.time = 0; this.clock = 0; this.freeze = 0; this.slowmo = 0; this.locked = false; this.state = 'boot'; this.endAt = 0;
    this.ctx = { time: 0, camYaw: 0, locked: false, boss: this.boss, player: this.player, events: this.events, combat: this.combat };
    this.stats = {};
    this.post = new Post(this.renderer, this.scene, this.camera);
    this.wire();
    this.applyQuality();
    this.resize();
    addEventListener('resize', () => this.resize());
    this.bindUI();
  }

  // ------------------------------------------------------------------------------------- quality
  setQuality(name) {
    if (!QUALITY[name]) return;
    this.qualityName = name; Object.assign(this.quality, QUALITY[name]);
    try { localStorage.setItem('dite.quality', name); } catch (e) { /* ignore */ }
    this.applyQuality(); this.resize();
  }
  applyQuality() {
    const q = this.quality, r = this.renderer;
    r.setPixelRatio(Math.min(devicePixelRatio || 1, 2) * q.pr);
    r.shadowMap.enabled = q.shadow > 0;
    const moon = this.arena.moon;
    moon.castShadow = q.shadow > 0;
    if (q.shadow > 0 && moon.shadow.mapSize.x !== q.shadow) { moon.shadow.mapSize.set(q.shadow, q.shadow); moon.shadow.map?.dispose(); moon.shadow.map = null; }
    this.scene.traverse(o => { if (o.material && !Array.isArray(o.material)) o.material.needsUpdate = true; });
    this.post?.setEnabled(q.bloom);
    for (const b of document.querySelectorAll('[data-q]')) b.classList.toggle('sel', b.dataset.q === this.qualityName);
  }

  // ------------------------------------------------------------------------------------- events → fx / sound
  wire() {
    const E = this.events, S = this.sound, fx = this.fx;
    const tmp = new THREE.Vector3();
    E.on('swing', ({ kind }) => S.play(kind === 'heavy' ? 'swingHeavy' : 'swing'));
    E.on('roll', () => S.play('roll'));
    E.on('player-step', st => { if (st.sprint) fx.dust(st.at, 0.3, 2, 0.35); });
    E.on('player-land', l => { fx.dust(l.at, 0.6 * l.k, 8 * l.k, 0.55 * l.k); S.play('thud', { k: 0.55 * l.k }); });
    E.on('heavy-impact', h => { fx.dust(h.at, 0.9, 14, 0.7); S.play('thud', { k: 1.3 }); this.rig.shake(0.22); });
    E.on('healed', () => { S.play('heal'); fx.embersAround(tmp.copy(this.player.pos).setY(0.2), 0.8, 30, 1.5); });
    E.on('ring', w => fx.ringFor(w));
    E.on('player-hit-boss', h => {
      const dir = tmp.subVectors(h.at, this.player.pos).setY(0.2).normalize();
      fx.sparks(h.at, dir, h.heavy ? 46 : 28, { light: h.heavy ? 70 : 40 });
      S.play('hit', { heavy: h.heavy });
      this.stats.hits++;
    });
    E.on('player-hurt', info => {
      S.play('hurt', { kd: info.kd });
      this.hud.flash('150,10,0', 0.35);
      fx.dust(this.player.pos, 1.5, 10);
      this.stats.dmgTaken += info.dmg;
    });
    E.on('boss-seg', s => {
      if (s.tag === 'active' && s.name !== 'nova') S.play('bossSwing', { dur: s.dur });
      if (s.tag === 'windup' && (s.name === 'slam' || s.name === 'lava' || s.name === 'charge')) S.play('windup');
    });
    E.on('boss-step', st => {
      const k = st.run ? 1.2 : 0.75;
      S.play('step', { k: k * clamp(1.4 - this.boss.distToPlayer / 30, 0.3, 1) });
      const foot = st.side === 'R' ? this.boss.parts.shinR.wb : this.boss.parts.shinL.wb;
      fx.dust(foot, 1.2, st.run ? 10 : 5);
      this.rig.shake(st.run ? 0.18 : 0.06);
    });
    E.on('boss-impact', ({ kind, boss, dur }) => {
      const B = boss || this.boss;
      if (kind === 'slamR' || kind === 'comboSlam' || kind === 'lavaCall') {
        const at = kind === 'slamR' ? B.parts.fistR.wa.clone() : B.parts.fistR.wa.clone().lerp(B.parts.fistL.wa, 0.5);
        this.combat.ring(at, { maxR: kind === 'slamR' ? 4.3 : 4.8, speed: 30, dmg: 16, kb: 7, kind: 'slam' });
        this.shakeAt(at, 0.9); fx.dust(at, 4, 50); fx.flashLight(at.clone().setY(1), 0xff8a40, 120, 0.3);
        S.play('slam');
        if (kind === 'lavaCall') this.spawnPools();
      } else if (kind === 'stompR') {
        this.combat.ring(B.footR, { maxR: 6.0, speed: 26, dmg: 20, kb: 8, kind: 'stomp' });
        this.shakeAt(B.footR, 0.8); fx.dust(B.footR, 5, 60); S.play('stomp');
      } else if (kind === 'roar') {
        this.combat.ring(B.pos, { maxR: 13, speed: 24, dmg: 0, push: true, kb: 9, width: 2.2, kind: 'roar' });
        this.rig.shake(1.0); this.hud.flash('255,140,60', 0.25);
        S.play('roar', { dur: 2.0, pitch: B.phase >= 2 ? 0.85 : 1 });
        S.setMusic(B.phase >= 2 ? 1.0 : 0.75);
        fx.embersAround(tmp.copy(B.pos).setY(1), 7, 120, 4);
      } else if (kind === 'novaCharge') {
        fx.decal(1, B.pos, 16.5, { size: 18, color: 0xff5a10, life: dur + 0.1, fadeOut: 0.15 });
        S.play('novaCharge', { dur });
      } else if (kind === 'novaBlast') {
        this.combat.ring(B.pos, { maxR: 16.5, speed: 13, dmg: 40, kd: true, kb: 11, width: 1.8, kind: 'nova' });
        this.rig.shake(1.4); this.hud.flash('255,150,60', 0.55);
        fx.flashLight(tmp.copy(B.pos).setY(4), 0xff7a2a, 500, 0.6);
        fx.dust(B.pos, 8, 90);
        S.play('novaBlast');
      }
    });
    E.on('pool', p => {
      fx.decal(1, p.c, p.r, { size: p.r + 0.6, color: 0xff6a20, life: p.warn, fadeOut: 0.05 });
      if (this.clock - (this._lastWarn ?? -9) > 0.5) { S.play('lavaWarn'); this._lastWarn = this.clock; }
    });
    E.on('pool-erupt', p => {
      fx.decal(2, p.c, p.r, { size: p.r + 0.6, life: p.life, fadeOut: 0.8, y: 0.05 });
      fx.sparks(tmp.copy(p.c).setY(0.3), new THREE.Vector3(0, 1.4, 0), 24, { speed: 0.8, light: 0 });
      fx.embersAround(p.c, p.r * 0.8, 30, 2.5);
      if (this.clock - (this._lastErupt ?? -9) > 0.25) { S.play('lavaErupt'); this._lastErupt = this.clock; }
    });
    E.on('boss-stagger', () => { this.rig.shake(0.5); S.play('stagger'); this.stats.staggers++; this.hud.flash('255,230,200', 0.25); });
    E.on('player-dead', () => { this.endAt = this.time + 2.6; this.pendingEnd = 'defeat'; S.setMusic(0); });
    E.on('boss-dead', () => {
      this.endAt = this.time + 3.6; this.pendingEnd = 'victory'; this.locked = false; this.slowmo = 1.4;
      S.play('bossDeath'); S.setMusic(0); this.hud.flash('255,220,180', 0.6);
    });
    E.on('end', ({ result }) => S.play(result === 'victory' ? 'victory' : 'defeat'));
  }

  // lava call: one pool under the player, the rest scattered around them (never stacked)
  spawnPools() {
    const p = this.player.pos, n = this.boss.phase >= 2 ? 6 : 4;
    const spots = [p.clone().setY(0)];
    let guard = 0;
    while (spots.length < n && guard++ < 80) {
      const a = rand() * Math.PI * 2, r = randRange(3.2, 9.5);
      const c = new THREE.Vector3(p.x + Math.sin(a) * r, 0, p.z + Math.cos(a) * r);
      if (Math.hypot(c.x, c.z) > CFG.arenaRadius - 2.5) continue;
      if (spots.some(s => s.distanceTo(c) < 4.2)) continue;
      spots.push(c);
    }
    spots.forEach((c, i) => this.combat.pool(c, { r: 2.5, warn: 1.25 + i * 0.12, life: 4.5, dmg: 18, dps: 10 }));
  }

  shakeAt(p, amt) {
    const d = Math.hypot(p.x - this.player.pos.x, p.z - this.player.pos.z);
    this.rig.shake(amt * Math.max(0.15, 1 - d / 30));
  }

  onPlayerHit(h) {
    this.freeze = h.heavy ? 0.085 : 0.06;
    this.rig.shake(h.heavy ? 0.32 : 0.16);
    this.hud.bossDamage(h.dmg);
    this.events.emit('player-hit-boss', h);
  }
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
    this.fx.setScale(h * this.renderer.getPixelRatio() * 0.5 / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)));
    this.post?.resize(w, h, this.renderer.getPixelRatio());
  }

  // ------------------------------------------------------------------------------------- UI / flow
  bindUI() {
    const click = (id, fn) => $(id)?.addEventListener('click', e => { e.stopPropagation(); this.sound.unlock(); this.sound.play('ui'); fn(); });
    click('btn-start', () => this.begin());
    click('btn-resume', () => this.resume());
    click('btn-restart', () => { this.resume(true); this.startFight(); });
    click('btn-title', () => this.toTitle());
    click('btn-retry', () => this.startFight());
    click('btn-retry2', () => this.startFight());
    click('btn-title2', () => this.toTitle());
    click('btn-title3', () => this.toTitle());
    for (const b of document.querySelectorAll('[data-q]')) b.addEventListener('click', e => { e.stopPropagation(); this.setQuality(b.dataset.q); this.sound.play('ui'); });
    document.addEventListener('pointerlockchange', () => {
      if (!document.pointerLockElement && this.state === 'fight' && !this.opts.test && !this._resuming && !this.pendingEnd) this.pause();
    });
  }

  setScreen(id) { for (const el of document.querySelectorAll('.screen')) el.classList.toggle('on', el.id === id); }

  resetWorld() {
    seed(this.opts.seed || ((Math.random() * 1e9) | 0));
    this.player.reset(); this.boss.reset(); this.combat.reset(); this.hud.reset(); this.fx.clear();
    this.time = 0; this.freeze = 0; this.slowmo = 0; this.endAt = 0; this.pendingEnd = null; this.locked = false;
    this.stats = { hits: 0, dmgTaken: 0, staggers: 0 };
  }

  toTitle() {
    this.resetWorld();
    this.state = 'title'; this.stateT = 0;
    this.boss.ai = false;
    this.hud.show(false); this.hud.showBoss(false);
    this.setScreen('title'); $('namecard').classList.remove('on'); $('skip').classList.remove('on');
    if (document.pointerLockElement) document.exitPointerLock();
    this.sound.setMusic(0);
  }

  begin() {
    this.sound.unlock(); this.sound.startAmbience(); this.sound.play('begin');
    if (!this.opts.test) this.input.requestLock();
    this.startIntro();
  }

  startIntro() {
    this.resetWorld();
    this.state = 'intro'; this.stateT = 0;
    this.boss.state = 'intro'; this.boss.introT = 0; this.boss.ai = false;
    this.setScreen(null); this.hud.show(false); this.hud.showBoss(false);
    $('skip').classList.add('on');
    this.sound.play('rumble', { dur: 2.6 });
    this.fx.decal(2, this.boss.pos, 5.5, { size: 6.2, life: 3.2, fadeOut: 1.5, y: 0.06 });
    this._introRoar = false;
  }

  startFight({ fromIntro = false } = {}) {
    if (!fromIntro) this.resetWorld();
    this.boss.state = 'idle'; this.boss.introT = 1; this.boss.root.position.y = 0; this.boss.ai = true;
    this.boss.timer = fromIntro ? 0.8 : 1.6;
    this.state = 'fight'; this.stateT = 0;
    this.locked = !!this.opts.lockDefault;
    this.rig.reset(this.player);
    this.camBlend = { t: 0, pos: this.camera.position.clone(), quat: this.camera.quaternion.clone() };
    this.hud.show(true); this.hud.showBoss(true);
    this.setScreen(null); $('namecard').classList.remove('on'); $('skip').classList.remove('on');
    this.input.enabled = true;
    this.sound.unlock(); this.sound.startAmbience(); this.sound.setMusic(0.5);
    if (!this.opts.test) this.input.requestLock();
  }

  pause() {
    if (this.state !== 'fight') return;
    this.state = 'paused'; this.setScreen('pause');
    this.sound.ctx?.suspend();
  }
  resume(silent) {
    if (this.state !== 'paused') return;
    this.state = 'fight'; this.setScreen(null);
    this.sound.ctx?.resume();
    if (!silent && !this.opts.test) { this._resuming = true; this.input.requestLock(); setTimeout(() => (this._resuming = false), 300); }
  }

  // ------------------------------------------------------------------------------------- main tick
  tick(dt) {
    const inp = this.input.read();
    this.clock += dt;
    matTime.value = this.clock;
    this.ambient(dt);
    this.stateT = (this.stateT || 0) + dt;
    switch (this.state) {
      case 'title': this.tickTitle(dt, inp); break;
      case 'intro': this.tickIntro(dt, inp); break;
      case 'fight': case 'victory': case 'defeat': this.tickFight(dt, inp); break;
      case 'paused': if (inp.pause) this.resume(); break;
    }
    if (this.opts.record) this.fadeUI(dt);
    this.input.endFrame();
  }

  // drifting embers and ash over the whole arena; the blade smoulders when it is swung
  ambient(dt) {
    const fx = this.fx, R = CFG.arenaRadius + 6, n = 26 * dt * this.quality.particles, rand = Math.random;
    this._embAcc = (this._embAcc || 0) + n;
    while (this._embAcc >= 1) {
      this._embAcc -= 1;
      const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * R;
      fx.parts.spawn({ x: Math.sin(a) * r, y: rand() * 2, z: Math.cos(a) * r, vx: (rand() - 0.5) * 0.6, vy: 0.8 + rand() * 1.4, vz: (rand() - 0.5) * 0.6,
        life: 3 + rand() * 4, age: 0, size: 0.04 + rand() * 0.06, r: 3.0, g: 1.1, b: 0.3, grav: -0.15, drag: 0.2, fade: 1, wobble: 1.6, seed: rand() * 9, fadeIn: 0.5 });
    }
    const p = this.player, a = p.atk;
    let glow = 0.15;
    if (p.state === 'attack' && a) {
      const tA = a.d.windup, tB = tA + a.d.active;
      glow = a.kind === 'heavy' ? (p.t < tA ? 0.4 + 2.2 * (p.t / tA) : p.t < tB ? 3 : 3 * Math.exp(-(p.t - tB) * 5)) : (p.t < tB ? 1.2 : 1.2 * Math.exp(-(p.t - tB) * 8));
    }
    this.mats.blade.emissiveIntensity = glow;
  }

  // recording: CSS transitions run on wall-clock time, so drive overlay fades from the game clock instead
  fadeUI(dt) {
    for (const el of document.querySelectorAll('.screen, #namecard, #hud, #bossbar, #skip')) {
      const target = el.classList.contains('on') ? 1 : 0;
      const cur = el._fade ?? target;
      el._fade = target > cur ? Math.min(target, cur + dt / 0.9) : Math.max(target, cur - dt / 0.6);
      el.style.opacity = el._fade.toFixed(3);
    }
  }

  tickWorldPassive(dt) {
    const c = this.ctx; c.time = this.time; c.camYaw = this.rig.yaw; c.locked = false;
    this.player.update(dt, { moveX: 0, moveY: 0 }, c);
    this.boss.update(dt, c);
    this.arena.update(dt, this.clock);
    this.fx.update(dt, this.clock);
    this.fx.trail.update(dt);
  }

  tickTitle(dt, inp) {
    this.time += dt;
    this.tickWorldPassive(dt);
    const a = this.clock * 0.06 + 2.2, R = 25;
    const pos = new THREE.Vector3(Math.sin(a) * R, 2.2 + Math.sin(this.clock * 0.13) * 0.6, 8 + Math.cos(a) * R);
    this.rig.apply(dt, pos, new THREE.Vector3(0, 6.2, 8), 42);
    if (inp.enter && this.stateT > 0.6) this.begin();
  }

  tickIntro(dt, inp) {
    this.time += dt;
    const t = this.stateT, k = t / (INTRO_LEN - 0.4);
    this.boss.introT = k;
    this.tickWorldPassive(dt);
    const B = this.boss.pos;
    if (k > 0.05 && k < 0.62) this.fx.embersAround(new THREE.Vector3(B.x, 0.2, B.z), 4.5, 360 * dt, 3);
    if (!this._introRoar && k >= 0.55) { this._introRoar = true; this.sound.play('roar', { dur: 2.2 }); this.rig.shake(0.9); this.fx.dust(B, 6, 80); }
    $('namecard').classList.toggle('on', k >= 0.6 && k < 0.98);
    if (k > 0.1 && k < 0.6) this.rig.shake(0.05 + k * 0.1);
    // camera: low behind the wanderer → low angle under the colossus
    let pos, look, fov;
    if (t < 2.3) {
      const u = ease.inOutS(t / 2.3);
      pos = new THREE.Vector3(lerp(2.6, 1.6, u), lerp(1.0, 1.5, u), lerp(-20, -17.2, u));
      look = new THREE.Vector3(0, 2.5 + this.boss.root.position.y * 0.3 + u * 2, 8);
      fov = 48;
    } else {
      const u = ease.outQ(clamp((t - 2.3) / 2.4, 0, 1));
      pos = new THREE.Vector3(lerp(9, 7, u), lerp(1.2, 2.0, u), lerp(-3.5, -1.5, u));
      look = new THREE.Vector3(0, lerp(7.5, 8.6, u), 8);
      fov = lerp(52, 46, u);
    }
    this.rig.apply(dt, pos, look, fov);
    if (this.opts.record) { if (t >= INTRO_LEN) this.introDone = true; return; }     // the recorder starts the fight on a frame boundary
    if (((inp.enter || inp.roll) && t > 0.4) || t >= INTRO_LEN) this.startFight({ fromIntro: true });
  }

  tickFight(dt, inp) {
    const playing = this.state === 'fight';
    if (playing && inp.pause) { this.pause(); return; }
    if (playing && inp.lock && this.boss.alive) this.locked = !this.locked;
    if (playing && inp.quality) { const ks = Object.keys(QUALITY); this.setQuality(ks[(ks.indexOf(this.qualityName) + 1) % ks.length]); }
    let sdt = dt;
    if (this.freeze > 0) { this.freeze -= dt; sdt = 0; }
    if (this.slowmo > 0) { this.slowmo -= dt; sdt *= 0.3; }
    this.time += sdt;
    const c = this.ctx; c.time = this.time; c.camYaw = this.rig.yaw; c.locked = this.locked;
    const pin = playing && !this.pendingEnd ? inp : { moveX: 0, moveY: 0, lookDX: inp.lookDX, lookDY: inp.lookDY };
    this.player.update(sdt, pin, c);
    this.boss.update(sdt, c);
    if (playing) { this.combat.bossHits(this.boss, this.player, this.time); this.combat.update(sdt); }
    // nova charge: embers sucked into the colossus; phase 3: it smoulders
    const tel = this.boss.telegraph();
    if (tel && tel.name === 'nova' && tel.tag === 'windup') this.fx.gather(this.boss.parts.body.wb, 10, 140 * sdt);
    if (this.boss.phase >= 2 && this.boss.alive) this.fx.embersAround(this.boss.parts.body.wb, 2.5, 10 * sdt, 1.5);
    const pa = this.player.atk;
    this.fx.trail.push(this.player.hilt, this.player.tip, this.player.anim.trailOn, pa?.kind === 'heavy');
    this.fx.trail.update(sdt);
    this.fx.update(sdt, this.clock);
    this.arena.update(dt, this.clock);
    this.rig.update(dt, inp, this.player, this.boss, this.locked && this.boss.alive && this.player.alive);
    // smooth hand-off from the cutscene camera
    if (this.camBlend && this.camBlend.t < 1) {
      this.camBlend.t = Math.min(1, this.camBlend.t + dt / 0.8);
      const k = ease.inOutS(this.camBlend.t);
      this.camera.position.lerpVectors(this.camBlend.pos, this.camera.position, k);
      this.camera.quaternion.slerpQuaternions(this.camBlend.quat, this.camera.quaternion, k);
    }
    this.hud.update(dt, this);
    this.hud.burning(this.player.burning);
    if (this.pendingEnd && this.time >= this.endAt) {
      this.state = this.pendingEnd; this.pendingEnd = null; this.endAt = this.time; this.stateT = 0;
      this.showResult(this.state);
      if (document.pointerLockElement) document.exitPointerLock();
      this.events.emit('end', { result: this.state });
    }
    if ((this.state === 'victory' || this.state === 'defeat') && this.stateT > 1.2 && inp.retry) this.startFight();
  }

  showResult(kind) {
    const s = this.stats, mm = Math.floor(this.time / 60), ss = Math.floor(this.time % 60);
    const flasksUsed = CFG.player.flasks - this.player.flasks;
    const txt = `${mm}:${String(ss).padStart(2, '0')}  ·  ${s.hits} hits  ·  ${s.dmgTaken} damage taken  ·  ${flasksUsed} flasks  ·  ${s.staggers} staggers`;
    $(kind + '-stats').textContent = kind === 'victory' ? txt : `Dite ${Math.round(this.boss.hp / CFG.boss.hp * 100)}% remaining  ·  ` + txt;
    this.setScreen(kind);
    this.hud.showBoss(false);
  }

  render() {
    if (this.post && this.quality.bloom) this.post.render(this.clock);
    else this.renderer.render(this.scene, this.camera);
  }
}
