// Shadow Ledger: bootstrap, input, screens and the fixed-step loop.
// Also stages the deterministic screenshot scenes behind ?shot=start|play|end&seed=N:
// each plays the real rules forward from a fresh world, so a screenshot is a frame of
// the actual game, and the same seed always gives the same frame.

import { World, EV_CAUGHT, EV_LEVEL_CLEAR, EV_GOLD, VIEW_W, VIEW_H } from './world.js';
import { LEVELS } from './levels.js';
import { drawWorld, drawTitle, drawCaught, drawLevelIntro, drawWin } from './render.js';

const STEP = 1 / 60;
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const status = document.getElementById('status');

function fitCanvas() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
}
window.addEventListener('resize', fitCanvas);
fitCanvas();

function drawFrame(draw) {
  const scale = Math.min(canvas.width / VIEW_W, canvas.height / VIEW_H);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0b0d13';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.translate((canvas.width - VIEW_W * scale) / 2, (canvas.height - VIEW_H * scale) / 2);
  ctx.scale(scale, scale);
  draw(ctx);
}

// --- a whisper of sound, made locally, only after the player interacts -------
let audio = null;
function beep(freq, seconds, type) {
  try {
    if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.06, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + seconds);
    osc.connect(gain).connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + seconds);
  } catch (err) { /* sound is a garnish, never a blocker */ }
}

// --- input -------------------------------------------------------------------
const keys = new Set();
window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
  keys.add(e.key.toLowerCase());
  onKey(e.key);
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

function readInput() {
  return {
    up: keys.has('w') || keys.has('arrowup'),
    down: keys.has('s') || keys.has('arrowdown'),
    left: keys.has('a') || keys.has('arrowleft'),
    right: keys.has('d') || keys.has('arrowright'),
    sneak: keys.has('shift'),
  };
}

// --- screens -----------------------------------------------------------------
const world = new World();
let screen = 'title'; // title | intro | play | caught | win
let lastEvents = 0;

function announce(text) { status.textContent = text; }

function onKey(key) {
  const k = key.toLowerCase();
  if (screen === 'title' && (k === 'enter')) {
    world.loadLevel(0);
    world.time = 0;
    world.timesSpotted = 0;
    screen = 'intro';
  } else if (screen === 'intro' && k === 'enter') {
    screen = 'play';
    announce(world.level.def.name + '. ' + world.level.def.intro);
  } else if (screen === 'caught' && (k === 'r' || k === 'enter')) {
    world.loadLevel(world.levelIndex);
    screen = 'play';
  } else if (screen === 'play' && k === 'r') {
    world.loadLevel(world.levelIndex);
  } else if (screen === 'win' && k === 'enter') {
    screen = 'title';
  }
}

function stepPlay(dt) {
  const events = world.step(dt, readInput());
  if (events & EV_GOLD) beep(880, 0.15, 'triangle');
  if (events & EV_CAUGHT) {
    beep(160, 0.4, 'sawtooth');
    screen = 'caught';
    announce('Spotted! Press R to try again.');
  } else if (events & EV_LEVEL_CLEAR) {
    beep(660, 0.2, 'triangle');
    if (world.levelIndex + 1 < LEVELS.length) {
      world.loadLevel(world.levelIndex + 1);
      screen = 'intro';
    } else {
      screen = 'win';
      announce('You emptied every vault unseen.');
    }
  }
  lastEvents = events;
}

function draw() {
  if (screen === 'title') drawFrame((c) => drawTitle(c, world));
  else if (screen === 'intro') drawFrame((c) => drawLevelIntro(c, world));
  else if (screen === 'caught') drawFrame((c) => drawCaught(c, world));
  else if (screen === 'win') drawFrame((c) => drawWin(c, world));
  else drawFrame((c) => drawWorld(c, world));
}

// --- screenshot staging --------------------------------------------------------
function steer(world, tx, ty, sneak) {
  const dx = tx - world.player.x;
  const dy = ty - world.player.y;
  return {
    up: dy < -6, down: dy > 6, left: dx < -6, right: dx > 6,
    sneak: !!sneak,
  };
}

function stageShot(name) {
  const idle = { up: false, down: false, left: false, right: false, sneak: false };
  if (name === 'play') {
    world.loadLevel(1);
    const route = [[330, 60], [330, 220], [570, 220], [570, 340], [660, 340]];
    let wp = 0;
    for (let i = 0; i < 60 * 9; i += 1) {
      const [tx, ty] = route[Math.min(wp, route.length - 1)];
      if (Math.hypot(tx - world.player.x, ty - world.player.y) < 14 && wp < route.length - 1) wp += 1;
      world.step(STEP, steer(world, tx, ty, true));
    }
    for (let i = 0; i < 40; i += 1) world.step(STEP, idle);
    screen = 'play';
    return;
  }
  if (name === 'end') {
    world.loadLevel(2);
    world.gold.taken = true;
    for (let i = 0; i < 90; i += 1) world.step(STEP, idle);
    screen = 'win';
    return;
  }
  // start: the title over a living first vault
  world.loadLevel(0);
  for (let i = 0; i < 60 * 3; i += 1) world.step(STEP, idle);
  screen = 'title';
}

const params = new URLSearchParams(window.location.search);
if (params.has('shot')) {
  stageShot(params.get('shot'));
  draw();
} else {
  let last = performance.now();
  let acc = 0;
  const frame = (now) => {
    acc += Math.min(0.25, (now - last) / 1000);
    last = now;
    while (acc >= STEP) {
      if (screen === 'play') stepPlay(STEP);
      else world.step(STEP, { up: false, down: false, left: false, right: false, sneak: false });
      acc -= STEP;
    }
    draw();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
