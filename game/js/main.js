// Entry point. ?test exposes window.GAME and lets an automation script drive the clock.
import { Game } from './game.js';
import { Bot } from './bot.js';
import { renderOffline } from './audio.js';

const params = new URLSearchParams(location.search);
const test = params.has('test');
const canvas = document.getElementById('game');
const game = new Game(canvas, { test, record: params.has('rec'), quality: params.get('q') || undefined, seed: +(params.get('seed') || 1234) });
if (params.has('rec')) document.body.classList.add('rec');
window.GAME = game;
window.Bot = Bot;
window.renderOffline = renderOffline;

if (!test) {
  canvas.addEventListener('click', () => { if (game.state === 'fight') game.input.requestLock(); });
  game.toTitle();
  let last = performance.now();
  const frame = now => {
    const dt = Math.min((now - last) / 1000, 1 / 20); last = now;
    game.tick(dt); game.render();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
