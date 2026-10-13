// Tiny pub/sub used to decouple gameplay from FX, audio and HUD.
export class Events {
  constructor() { this.map = new Map(); }
  on(name, fn) { if (!this.map.has(name)) this.map.set(name, []); this.map.get(name).push(fn); return this; }
  emit(name, data) { const l = this.map.get(name); if (l) for (const fn of l) fn(data); }
}
