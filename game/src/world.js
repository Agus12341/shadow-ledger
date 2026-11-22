// Shadow Ledger simulation: the thief, the guards, their eyes and ears.
// Fixed-step friendly (call step with dt), no randomness, no DOM — main.js drives it
// and render.js draws the state it keeps here.

import { LEVELS, TILE, COLS, ROWS } from './levels.js';

export const VIEW_W = COLS * TILE;
export const VIEW_H = ROWS * TILE;

const PLAYER_R = 13;
const WALK_SPEED = 168;
const SNEAK_SPEED = 94;
const GUARD_CATCH_DIST = 24;
const NOISE_RADIUS = 96;

const SIGHT_RANGE = 186;
const SIGHT_HALF_ANGLE = 0.58; // radians, ~33 degrees each side
const CLOSE_RANGE = 46; // nobody hides this close to a guard

export const EV_NONE = 0;
export const EV_CAUGHT = 1;
export const EV_LEVEL_CLEAR = 2;
export const EV_GOLD = 4;

function tileAt(level, tx, ty) {
  if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return '#';
  return level.tiles[ty][tx];
}

function isSolid(ch) {
  return ch === '#' || ch === 'C';
}

/** True when the straight line a->b crosses no wall or crate (stepped along the line). */
export function lineOfSight(level, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const dist = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(dist / 7));
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    const x = ax + dx * t;
    const y = ay + dy * t;
    if (isSolid(tileAt(level, Math.floor(x / TILE), Math.floor(y / TILE)))) return false;
  }
  return true;
}

function angleLerp(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function angleDiff(a, b) {
  let d = Math.abs((a - b) % (Math.PI * 2));
  if (d > Math.PI) d = Math.PI * 2 - d;
  return d;
}

export class World {
  constructor() {
    this.levelIndex = 0;
    this.time = 0;
    this.timesSpotted = 0;
    this.loadLevel(0);
  }

  loadLevel(index) {
    const def = LEVELS[index];
    this.levelIndex = index;
    const tiles = [];
    let start = { x: 60, y: 60 };
    let gold = { x: 0, y: 0 };
    let exit = { x: 0, y: 0 };
    const lamps = [];
    for (let ty = 0; ty < ROWS; ty += 1) {
      const row = (def.map[ty] || '').padEnd(COLS, '#').slice(0, COLS);
      tiles.push(row.split(''));
      for (let tx = 0; tx < COLS; tx += 1) {
        const ch = row[tx];
        const cx = tx * TILE + TILE / 2;
        const cy = ty * TILE + TILE / 2;
        if (ch === 'P') start = { x: cx, y: cy };
        if (ch === 'G') gold = { x: cx, y: cy };
        if (ch === 'E') exit = { x: cx, y: cy };
        if (ch === 'L') lamps.push({ x: cx, y: cy });
      }
    }
    this.level = { def, tiles, lamps };
    this.player = {
      x: start.x, y: start.y, r: PLAYER_R, angle: 0,
      sneaking: false, moving: false, hidden: false, inLight: false,
    };
    this.gold = { x: gold.x, y: gold.y, taken: false };
    this.exit = { x: exit.x, y: exit.y };
    this.guards = def.guards.map((g) => {
      const path = g.path.map(([tx, ty]) => ({ x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 }));
      return {
        path, speed: g.speed, wp: 1, wait: 0,
        x: path[0].x, y: path[0].y, angle: Math.atan2(path[1].y - path[0].y, path[1].x - path[0].x),
        state: 'patrol', meter: 0, loseTimer: 0, investigate: null, invTimer: 0,
        seesPlayer: false, r: 14,
      };
    });
    this.levelTime = 0;
    this.alarm = 0;
  }

  tileUnder(x, y) {
    return tileAt(this.level, Math.floor(x / TILE), Math.floor(y / TILE));
  }

  moveCircle(p, dx, dy) {
    // Axis-separated movement against solid tiles; keeps the circle out of walls.
    const tryAxis = (nx, ny) => {
      const minTx = Math.floor((nx - p.r) / TILE);
      const maxTx = Math.floor((nx + p.r) / TILE);
      const minTy = Math.floor((ny - p.r) / TILE);
      const maxTy = Math.floor((ny + p.r) / TILE);
      for (let ty = minTy; ty <= maxTy; ty += 1) {
        for (let tx = minTx; tx <= maxTx; tx += 1) {
          if (!isSolid(tileAt(this.level, tx, ty))) continue;
          const rx = tx * TILE;
          const ry = ty * TILE;
          const cx = Math.max(rx, Math.min(nx, rx + TILE));
          const cy = Math.max(ry, Math.min(ny, ry + TILE));
          if (Math.hypot(nx - cx, ny - cy) < p.r) return false;
        }
      }
      return true;
    };
    if (tryAxis(p.x + dx, p.y)) p.x += dx;
    if (tryAxis(p.x, p.y + dy)) p.y += dy;
  }

  /** How visible the player is to a guard at distance d: 0 (invisible) to 1 (plain sight). */
  visibility(guard, d) {
    const p = this.player;
    if (d > SIGHT_RANGE) return 0;
    if (d <= CLOSE_RANGE) return 1;
    let v = 1 - (d - CLOSE_RANGE) / (SIGHT_RANGE - CLOSE_RANGE) * 0.55;
    if (p.sneaking) v *= 0.55;
    if (p.hidden) v *= 0.3; // crouched in shadow: only a near guard makes you out
    if (p.inLight && !p.hidden) v *= 1.45;
    if (!p.moving) v *= 0.8;
    return Math.min(1, v);
  }

  step(dt, input) {
    let events = EV_NONE;
    this.time += dt;
    this.levelTime += dt;
    const p = this.player;

    // --- the thief -------------------------------------------------------
    p.sneaking = !!input.sneak;
    const speed = p.sneaking ? SNEAK_SPEED : WALK_SPEED;
    let mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    let my = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    p.moving = mx !== 0 || my !== 0;
    if (p.moving) {
      const len = Math.hypot(mx, my);
      mx = (mx / len) * speed * dt;
      my = (my / len) * speed * dt;
      p.angle = Math.atan2(my, mx);
      this.moveCircle(p, mx, my);
    }
    p.hidden = p.sneaking && this.tileUnder(p.x, p.y) === ',';
    p.inLight = this.level.lamps.some((l) => Math.hypot(l.x - p.x, l.y - p.y) < 74);

    if (!this.gold.taken && Math.hypot(this.gold.x - p.x, this.gold.y - p.y) < 26) {
      this.gold.taken = true;
      events |= EV_GOLD;
    }
    if (this.gold.taken && Math.hypot(this.exit.x - p.x, this.exit.y - p.y) < 26) {
      events |= EV_LEVEL_CLEAR;
      return events;
    }

    // --- the guards ------------------------------------------------------
    for (const g of this.guards) {
      const d = Math.hypot(p.x - g.x, p.y - g.y);
      const toPlayer = Math.atan2(p.y - g.y, p.x - g.x);
      const inCone = angleDiff(g.angle, toPlayer) < SIGHT_HALF_ANGLE;
      g.seesPlayer = inCone && this.visibility(g, d) > 0 && lineOfSight(this.level, g.x, g.y, p.x, p.y);

      if (g.seesPlayer) {
        const rate = this.visibility(g, d) * 1.5;
        g.meter = Math.min(1, g.meter + rate * dt);
        g.loseTimer = 0;
        if (g.meter >= 1) g.state = 'chase';
        else if (g.meter > 0.3) g.state = 'suspicious';
      } else {
        g.loseTimer += dt;
        const drain = g.state === 'chase' ? 0.25 : 0.5;
        if (g.loseTimer > 0.6) g.meter = Math.max(0, g.meter - drain * dt);
        if (g.state === 'chase' && g.loseTimer > 2.2) { g.state = 'patrol'; g.meter = 0.25; }
        else if (g.state === 'suspicious' && g.meter <= 0.02) g.state = 'patrol';
      }

      // Hearing: a walking (not sneaking) thief nearby draws a guard's eye.
      if (p.moving && !p.sneaking && d < NOISE_RADIUS && g.state === 'patrol') {
        g.state = 'suspicious';
        g.meter = Math.max(g.meter, 0.34);
        g.investigate = { x: p.x, y: p.y };
        g.invTimer = 1.6;
      }

      if (g.state === 'chase') {
        this.alarm = Math.max(this.alarm, 0.35);
        g.angle = angleLerp(g.angle, toPlayer, Math.min(1, dt * 8));
        if (g.seesPlayer || d < 120) {
          const stepLen = Math.min(d, g.speed * 1.85 * dt);
          this.moveCircle(g, Math.cos(toPlayer) * stepLen, Math.sin(toPlayer) * stepLen);
        }
        if (d < GUARD_CATCH_DIST) {
          this.timesSpotted += 1;
          events |= EV_CAUGHT;
        }
      } else if (g.state === 'suspicious') {
        // Stop and stare at whatever caught the eye; drift toward a heard noise.
        const target = g.seesPlayer ? toPlayer : (g.investigate ? Math.atan2(g.investigate.y - g.y, g.investigate.x - g.x) : g.angle);
        g.angle = angleLerp(g.angle, target, Math.min(1, dt * 5));
        if (!g.seesPlayer && g.investigate) {
          const id = Math.hypot(g.investigate.x - g.x, g.investigate.y - g.y);
          if (id > 30) {
            const stepLen = Math.min(id, g.speed * 0.7 * dt);
            const ia = Math.atan2(g.investigate.y - g.y, g.investigate.x - g.x);
            this.moveCircle(g, Math.cos(ia) * stepLen, Math.sin(ia) * stepLen);
          }
          g.invTimer -= dt;
          if (g.invTimer <= 0) { g.investigate = null; g.meter = Math.min(g.meter, 0.2); }
        }
      } else {
        // Patrol between waypoints, pausing a beat at each end.
        if (g.wait > 0) {
          g.wait -= dt;
        } else {
          const target = g.path[g.wp];
          const dx = target.x - g.x;
          const dy = target.y - g.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 6) {
            g.wp = (g.wp + 1) % g.path.length;
            g.wait = 0.7;
          } else {
            const stepLen = Math.min(dist, g.speed * dt);
            this.moveCircle(g, (dx / dist) * stepLen, (dy / dist) * stepLen);
            g.angle = angleLerp(g.angle, Math.atan2(dy, dx), Math.min(1, dt * 6));
          }
        }
      }
    }
    this.alarm = Math.max(0, this.alarm - dt);
    return events;
  }

  /** The loudest guard meter, for the HUD eye. */
  maxMeter() {
    return this.guards.reduce((m, g) => Math.max(m, g.meter), 0);
  }

  anyChase() {
    return this.guards.some((g) => g.state === 'chase');
  }
}
