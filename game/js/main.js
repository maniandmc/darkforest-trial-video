// Entry point. ?test exposes window.GAME and lets an automation script drive the clock; ?touch forces touch controls.
import { Game } from './game.js';
import { Bot } from './bot.js';
import { renderOffline } from './audio.js';

const params = new URLSearchParams(location.search);
const test = params.has('test');
const canvas = document.getElementById('game');
// phones / tablets get the touch controls from the start; a touch laptop switches over on its first touch
const touch = params.has('touch') || matchMedia('(hover: none) and (pointer: coarse)').matches;
const game = new Game(canvas, { test, touch, record: params.has('rec'), quality: params.get('q') || undefined, seed: +(params.get('seed') || 1234) });
if (touch) game.enableTouch();
else if (!test) addEventListener('touchstart', () => game.enableTouch(), { once: true, passive: true });
if (params.has('rec')) document.body.classList.add('rec');
window.GAME = game;
window.Bot = Bot;
window.renderOffline = renderOffline;

if (!test) {
  canvas.addEventListener('click', () => { if (game.state === 'fight' && !game.touch) game.input.requestLock(); });
  game.toTitle();
  let last = performance.now();
  const frame = now => {
    const ms = now - last, dt = Math.min(ms / 1000, 1 / 20); last = now;
    game.tick(dt); game.render();
    game.adaptResolution(ms);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
