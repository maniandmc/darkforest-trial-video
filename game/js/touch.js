// Touch controls for phones and tablets: a floating stick on the left of the screen (push past its rim to sprint),
// camera drag on the right, and a thumb cluster of action buttons. They feed the same per-frame action snapshot as
// the keyboard and mouse (see Input.read), so nothing else in the game needs to know where input came from.
const $ = id => document.getElementById(id);
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

const svg = body => `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const ICONS = {
  light: svg('<path d="M13 35 L36 12 L37 11"/><path d="M10 30 L18 38"/><path d="M8 40 L13 35"/><path d="M27 7 Q41 9 41 23" stroke-width="2" opacity=".55"/>'),
  heavy: svg('<path d="M24 5 V30"/><path d="M16 30 H32"/><path d="M24 30 V39"/><path d="M8 43 H40" stroke-width="2"/><path d="M12 37 L8 33 M36 37 L40 33" stroke-width="2" opacity=".7"/>'),
  roll: svg('<path d="M36 18 A13 13 0 1 0 37 28"/><path d="M37 9 V18 H28"/>'),
  heal: svg('<path d="M20 7 H28 M21 7 V15 Q12 19 12 29 A12 12 0 0 0 36 29 Q36 19 27 15 V7"/><path d="M15 30 Q24 25 33 30" stroke-width="2" opacity=".7"/>'),
  lock: svg('<circle cx="24" cy="24" r="10"/><path d="M24 6 V12 M24 36 V42 M6 24 H12 M36 24 H42"/>'),
  pause: svg('<path d="M18 12 V36 M30 12 V36" stroke-width="4"/>'),
};
const LABEL = { light: '공격', heavy: '강공격', roll: '구르기', heal: '회복', lock: '락온' };
const STICK_R = 54;                 // stick travel radius, CSS px
const SPRINT_AT = 1.45;             // thumb this far past the rim (× radius) → sprint
const DEAD = 0.14;
const LOOK_X = 0.0078, LOOK_Y = 0.0052;   // radians per CSS px of camera drag

export class TouchControls {
  constructor(game) {
    this.g = game;
    this.stick = { id: null, ox: 0, oy: 0, mx: 0, my: 0, sprint: false };
    this.cam = { id: null, x: 0, y: 0 };
    this.lookX = 0; this.lookY = 0;
    this.edges = new Set();
    this.portrait = matchMedia('(orientation: portrait)');
    this.build();
  }

  build() {
    document.body.classList.add('touch');
    const root = this.root = document.createElement('div');
    root.id = 'touch';
    const btn = (a, extra = '') => `<button class="tbtn t-${a}" data-a="${a}" aria-label="${LABEL[a] || a}">${ICONS[a]}${LABEL[a] ? `<i>${LABEL[a]}</i>` : ''}${extra}</button>`;
    root.innerHTML = `<div id="t-zone"></div>
      <div id="t-stick"><div class="t-ring"></div><div class="t-knob"></div></div>
      ${btn('light')}${btn('heavy')}${btn('roll')}${btn('heal', '<b id="t-heal-n">3</b>')}${btn('lock')}${btn('pause')}`;
    document.body.appendChild(root);
    const rot = document.createElement('div');
    rot.id = 'rotate';
    rot.innerHTML = `<div class="rot-ico">${svg('<rect x="15" y="6" width="18" height="32" rx="3"/><path d="M8 30 A18 18 0 0 0 30 44 M30 44 L26 40 M30 44 L26 47" stroke-width="2"/>')}</div><div>휴대폰을 가로로 돌려 주세요</div>`;
    document.body.appendChild(rot);
    this.stickEl = $('t-stick'); this.knob = this.stickEl.querySelector('.t-knob');
    this.healN = $('t-heal-n');
    this.btns = Object.fromEntries([...root.querySelectorAll('.tbtn')].map(b => [b.dataset.a, b]));

    // stick (left part of the screen) and camera drag (the rest)
    const zone = $('t-zone');
    zone.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse') return;
      e.preventDefault();
      if (e.clientX < innerWidth * 0.42 && this.stick.id === null) this.stickStart(e);
      else if (this.cam.id === null) { this.cam = { id: e.pointerId, x: e.clientX, y: e.clientY }; }
      else return;
      try { zone.setPointerCapture(e.pointerId); } catch (err) { /* already released */ }
    });
    zone.addEventListener('pointermove', e => {
      if (e.pointerId === this.stick.id) this.stickMove(e);
      else if (e.pointerId === this.cam.id) {
        this.lookX += (e.clientX - this.cam.x) * LOOK_X; this.lookY += (e.clientY - this.cam.y) * LOOK_Y;
        this.cam.x = e.clientX; this.cam.y = e.clientY;
      }
    });
    const end = e => {
      if (e.pointerId === this.stick.id) this.stickEnd();
      if (e.pointerId === this.cam.id) this.cam.id = null;
    };
    zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end); zone.addEventListener('lostpointercapture', end);

    // buttons act on press (a dodge must not wait for the finger to lift)
    for (const [a, b] of Object.entries(this.btns)) {
      b.addEventListener('pointerdown', e => {
        e.preventDefault(); e.stopPropagation();
        this.edges.add(a); b.classList.add('down');
        try { b.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      });
      const up = () => b.classList.remove('down');
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
      b.addEventListener('contextmenu', e => e.preventDefault());
    }

    // tap anywhere to skip the intro
    document.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'mouse' && this.g.state === 'intro' && !e.target.closest('button')) this.edges.add('enter');
    });
    // try for a real full screen in landscape when the fight is entered (Android; silently refused elsewhere)
    $('btn-start')?.addEventListener('click', () => this.fullscreen());
    // no pinch-zoom / long-press callouts over the game
    for (const ev of ['gesturestart', 'gesturechange']) document.addEventListener(ev, e => e.preventDefault());

    // touch wording on screens written for keyboards
    const skip = $('skip'); if (skip) skip.textContent = '화면을 탭하면 건너뛰기';
    for (const c of document.querySelectorAll('.controls')) {
      c.classList.add('touch-help');
      c.innerHTML = '<div><b>왼쪽 드래그</b> 이동 · 끝까지 밀면 달리기</div><div><b>오른쪽 드래그</b> 카메라</div>' +
        '<div><b>공격 / 강공격</b> 오른쪽 아래 버튼</div><div><b>구르기</b> 누르는 순간 무적</div><div><b>락온</b> 기본으로 켜짐</div>';
    }
  }

  fullscreen() {
    const el = document.documentElement;
    try {
      const p = el.requestFullscreen?.({ navigationUI: 'hide' });
      p?.then(() => screen.orientation?.lock?.('landscape').catch(() => {})).catch(() => {});
    } catch (e) { /* not allowed here */ }
  }

  stickStart(e) {
    const R = STICK_R, W = innerWidth, H = innerHeight;
    const ox = clamp(e.clientX, R + 14, W * 0.42), oy = clamp(e.clientY, R + 14, H - R - 14);
    this.stick = { id: e.pointerId, ox, oy, mx: 0, my: 0, sprint: false };
    this.stickEl.style.transform = `translate(${ox}px, ${oy}px)`;
    this.stickEl.classList.add('active');
    this.stickMove(e);
  }
  stickMove(e) {
    const s = this.stick, R = STICK_R;
    const dx = e.clientX - s.ox, dy = e.clientY - s.oy, len = Math.hypot(dx, dy);
    const m = Math.min(len / R, 1), k = m < DEAD ? 0 : (m - DEAD) / (1 - DEAD);
    s.mx = len > 0 ? dx / len * k : 0; s.my = len > 0 ? -dy / len * k : 0;      // screen up = forward
    s.sprint = len > R * SPRINT_AT;
    const kl = Math.min(len, R);
    this.knob.style.transform = `translate(${len > 0 ? dx / len * kl : 0}px, ${len > 0 ? dy / len * kl : 0}px)`;
    this.stickEl.classList.toggle('sprint', s.sprint);
  }
  stickEnd() {
    this.stick = { id: null, ox: 0, oy: 0, mx: 0, my: 0, sprint: false };
    this.knob.style.transform = '';
    this.stickEl.style.transform = '';
    this.stickEl.classList.remove('active', 'sprint');
  }
  releaseAll() {
    if (this.stick.id !== null) this.stickEnd();
    this.cam.id = null; this.lookX = this.lookY = 0;
    this.edges.clear();
    for (const b of Object.values(this.btns)) b.classList.remove('down');
  }

  // called from Input.read(): add this frame's touch actions to the keyboard/mouse snapshot
  merge(s) {
    if (this.stick.id !== null) {
      s.moveX = this.stick.mx; s.moveY = this.stick.my;
      if (this.stick.sprint) s.sprint = true;
    }
    s.lookDX += this.lookX; s.lookDY += this.lookY; this.lookX = this.lookY = 0;
    for (const a of this.edges) s[a] = true;          // light, heavy, roll, heal, lock, pause, enter
    this.edges.clear();
  }

  // per frame: show the controls only while fighting, mirror flasks / lock-on / stamina on the buttons
  update(g) {
    const on = g.state === 'fight' && !g.pendingEnd;
    if (on !== this.on) { this.on = on; this.root.classList.toggle('on', on); if (!on) this.releaseAll(); }
    if (this.portrait.matches && g.state === 'fight' && !g.opts.test) g.pause();
    if (!on) return;
    const p = g.player;
    if (this.healN.textContent !== String(p.flasks)) this.healN.textContent = p.flasks;
    this.btns.heal.classList.toggle('empty', p.flasks <= 0);
    this.btns.lock.classList.toggle('sel', !!g.locked);
    const tired = p.st <= 0;
    for (const a of ['light', 'heavy', 'roll']) this.btns[a].classList.toggle('tired', tired);
  }
}
