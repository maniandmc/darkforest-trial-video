// Entry point. ?test exposes window.GAME and lets an automation script drive the clock.
import { Game } from './game.js';
import { Bot } from './bot.js';

const params = new URLSearchParams(location.search);
const test = params.has('test');
const canvas = document.getElementById('game');
const game = new Game(canvas, { test, quality: params.get('q') || undefined, seed: +(params.get('seed') || 1234) });
window.GAME = game;
window.Bot = Bot;

if (!test) {
  canvas.addEventListener('click', () => game.input.requestLock());
  game.startFight();
  let last = performance.now();
  const frame = now => {
    const dt = Math.min((now - last) / 1000, 1 / 20); last = now;
    game.tick(dt); game.render();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
