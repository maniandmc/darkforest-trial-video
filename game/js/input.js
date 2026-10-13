// Keyboard + mouse (pointer lock) → a per-frame action snapshot. A test bot can write the same snapshot.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();      // edge-triggered this frame
    this.mouseDX = 0; this.mouseDY = 0;
    this.sens = 0.0024;
    this.locked = false;
    this.free = false;             // pointer lock refused (embedded frames): read the mouse without capturing it
    this.virtual = null;           // when set (bot / tests) it replaces live input
    this.enabled = true;

    addEventListener('keydown', e => {
      if (e.repeat) return;
      this.keys.add(e.code); this.pressed.add(e.code);
      if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('mousedown', e => {
      if (!this.locked && !this.free) return;
      this.pressed.add('Mouse' + e.button); this.keys.add('Mouse' + e.button);
    });
    addEventListener('mouseup', e => this.keys.delete('Mouse' + e.button));
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    addEventListener('mousemove', e => {
      if (!this.locked && !this.free) return;
      this.mouseDX += e.movementX; this.mouseDY += e.movementY;
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) this.keys.clear();
    });
  }

  requestLock() {
    if (this.virtual || this.locked) return;
    if (!this.canvas.requestPointerLock) { this.free = true; return; }
    try {
      const p = this.canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => { this.free = true; });
    } catch (e) { this.free = true; }
    document.addEventListener('pointerlockerror', () => { this.free = true; }, { once: true });
  }

  // Snapshot of actions for this frame
  read() {
    if (this.virtual) {
      const v = this.virtual;
      const s = { moveX: v.moveX || 0, moveY: v.moveY || 0, sprint: !!v.sprint, light: !!v.light, heavy: !!v.heavy,
        roll: !!v.roll, heal: !!v.heal, lock: !!v.lock, lookDX: v.lookDX || 0, lookDY: v.lookDY || 0, pause: false };
      v.light = v.heavy = v.roll = v.heal = v.lock = false; v.lookDX = v.lookDY = 0;
      return s;
    }
    const k = c => this.keys.has(c), p = c => this.pressed.has(c);
    const s = {
      moveX: (k('KeyD') ? 1 : 0) - (k('KeyA') ? 1 : 0),
      moveY: (k('KeyW') ? 1 : 0) - (k('KeyS') ? 1 : 0),
      sprint: k('ShiftLeft') || k('ShiftRight'),
      light: p('Mouse0'), heavy: p('Mouse2'),
      roll: p('Space'), heal: p('KeyE') || p('KeyR'),
      lock: p('KeyQ') || p('Mouse1') || p('Tab'),
      lookDX: this.mouseDX * this.sens, lookDY: this.mouseDY * this.sens,
      pause: p('Escape') || p('KeyP'),
      any: this.pressed.size > 0,
      enter: p('Enter') || p('Space') || p('Mouse0'),
      retry: p('KeyR') || p('Enter') || p('Space'),
      quality: p('KeyO'),
    };
    if (!this.enabled) { s.moveX = s.moveY = 0; s.light = s.heavy = s.roll = s.heal = s.sprint = false; }
    return s;
  }

  endFrame() { this.pressed.clear(); this.mouseDX = this.mouseDY = 0; }
}
