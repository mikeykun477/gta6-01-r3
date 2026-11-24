// city.js — procedural generation of Veloria, a sun-soaked coastal city.
// Grid of roads, blocks of buildings, a park, a beach and a container port.
// All names, layout and code are original to this game.

import { mulberry32, pick, randRange, clamp } from './util.js';

export const WORLD = { w: 3600, h: 3600 };
export const ROAD_W = 96;
export const BLOCK = 400; // road centre spacing

// Road centrelines: 9 vertical, 9 horizontal.
export const ROAD_XS = [200, 600, 1000, 1400, 1800, 2200, 2600, 3000, 3400];
export const ROAD_YS = [200, 600, 1000, 1400, 1800, 2200, 2600, 3000, 3400];

export const PALETTES = {
  roof: ['#c96f4a', '#d9a05b', '#7d8ba1', '#8f6f8a', '#5b7d6e', '#b0b6bd', '#a8574f', '#6e7f9e'],
  wall: ['#e8dcc8', '#f2e6d0', '#d9c7a8', '#cfd8dc', '#e6c9a8'],
  car: ['#d64545', '#3f7fd0', '#e8c33a', '#e8e8e8', '#2b2b2b', '#4caf7d', '#c05fd0', '#e07b2e', '#7fb3d5'],
};

export function isOnRoad(x, y) {
  for (const rx of ROAD_XS) if (Math.abs(x - rx) < ROAD_W / 2) return true;
  for (const ry of ROAD_YS) if (Math.abs(y - ry) < ROAD_W / 2) return true;
  return false;
}

export function nearestRoadCoord(v) {
  let best = ROAD_XS[0], bd = Infinity;
  for (const r of ROAD_XS) { const d = Math.abs(v - r); if (d < bd) { bd = d; best = r; } }
  return best;
}

// A point is drivable if it is on a road or inside the beach/port aprons.
export function genCity(seed) {
  const rng = mulberry32(seed);
  const buildings = [];
  const trees = [];
  const lamps = [];
  const containers = [];
  const hydrants = [];

  // Blocks: between neighbouring road centrelines.
  for (let bi = 0; bi < ROAD_XS.length - 1; bi++) {
    for (let bj = 0; bj < ROAD_YS.length - 1; bj++) {
      const x0 = ROAD_XS[bi] + ROAD_W / 2 + 14;
      const y0 = ROAD_YS[bj] + ROAD_W / 2 + 14;
      const x1 = ROAD_XS[bi + 1] - ROAD_W / 2 - 14;
      const y1 = ROAD_YS[bj + 1] - ROAD_W / 2 - 14;
      const bw = x1 - x0, bh = y1 - y0;

      // Park block (centre of town).
      if (bi === 4 && bj === 4) {
        for (let i = 0; i < 26; i++) {
          trees.push({ x: randRange(rng, x0 + 20, x1 - 20), y: randRange(rng, y0 + 20, y1 - 20), r: randRange(rng, 10, 18) });
        }
        continue;
      }
      // Beach blocks: southern row is sand, no buildings.
      if (bj === 7) {
        for (let i = 0; i < 6; i++) {
          trees.push({ x: randRange(rng, x0 + 20, x1 - 20), y: randRange(rng, y0 + 20, y1 - 20), r: randRange(rng, 8, 13), palm: true });
        }
        continue;
      }
      // Port blocks: eastern column holds containers instead of buildings.
      if (bi === 7) {
        for (let i = 0; i < 5; i++) {
          containers.push({
            x: randRange(rng, x0 + 10, x1 - 70), y: randRange(rng, y0 + 10, y1 - 30),
            w: randRange(rng, 46, 78), h: 24,
            color: pick(rng, ['#b8442c', '#2c6eb8', '#3a8a4f', '#d08a1d', '#7a4a8a']),
          });
        }
        continue;
      }

      // Normal block: 3–5 buildings, placed with several attempts each.
      const n = 3 + Math.floor(rng() * 3);
      const blockBuildings = [];
      for (let i = 0; i < n; i++) {
        let placed = null;
        for (let attempt = 0; attempt < 12 && !placed; attempt++) {
          const w = randRange(rng, 55, 120);
          const h = randRange(rng, 50, 110);
          const x = randRange(rng, x0, x1 - w);
          const y = randRange(rng, y0, y1 - h);
          let ok = true;
          for (const b of blockBuildings) {
            if (b.x < x + w + 8 && b.x + b.w > x - 8 && b.y < y + h + 8 && b.y + b.h > y - 8) { ok = false; break; }
          }
          if (ok) placed = { x, y, w, h };
        }
        if (!placed) continue;
        const b = {
          ...placed,
          roof: pick(rng, PALETTES.roof),
          wall: pick(rng, PALETTES.wall),
          height: randRange(rng, 6, 26),
          windows: Math.floor(rng() * 3),
        };
        blockBuildings.push(b);
        buildings.push(b);
      }
      // A tree or two on most blocks.
      if (rng() < 0.6) trees.push({ x: randRange(rng, x0 + 16, x1 - 16), y: randRange(rng, y0 + 16, y1 - 16), r: randRange(rng, 9, 15) });
      if (rng() < 0.35) hydrants.push({ x: randRange(rng, x0, x1), y: randRange(rng, y0, y1) });
    }
  }

  // Street lamps along roads.
  for (const rx of ROAD_XS) for (const ry of ROAD_YS) {
    lamps.push({ x: rx + ROAD_W / 2 + 6, y: ry - ROAD_W / 2 - 6 });
    lamps.push({ x: rx - ROAD_W / 2 - 6, y: ry + ROAD_W / 2 + 6 });
  }

  // Named story locations (all on roads / open ground).
  const places = {
    neonTide: { name: 'Neon Tide Bar', x: 1000, y: 940, blurb: "Mama Odette's bar — where every job in Veloria starts." },
    chopShop: { name: 'Rust & Chrome Chop Shop', x: 2600, y: 2540, blurb: 'No questions. Cash on the hood.' },
    port: { name: 'Veloria Container Port', x: 3200, y: 3000, blurb: 'The Tide Syndicate moves its cargo here.' },
    marina: { name: 'Marina del Sol', x: 600, y: 3260, blurb: 'Yachts, gulls, and men who pay in cash.' },
    hotel: { name: 'Hotel Alba', x: 2200, y: 1340, blurb: 'Sal Vane keeps a suite on the top floor.' },
    rooftop: { name: 'Rooftop of the Alba', x: 2200, y: 1400, blurb: 'The last word in the Vane argument.' },
    safehouse: { name: "Jax's Safehouse", x: 1400, y: 620, blurb: 'Home. For now.' },
    depot: { name: 'Tide Depot', x: 3000, y: 1800, blurb: 'Syndicate trucks roll out of here at dawn.' },
  };

  return { seed, buildings, trees, lamps, containers, hydrants, places };
}

// True if a circle at (x,y,r) hits a building, container, tree or the sea.
export function collidesStatic(city, x, y, r) {
  if (x < 24 || y < 24 || x > WORLD.w - 24 || y > WORLD.h - 24) return true;
  if (y > 3360) return true; // the sea
  for (const b of city.buildings) {
    if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return true;
  }
  for (const c of city.containers) {
    if (x + r > c.x && x - r < c.x + c.w && y + r > c.y && y - r < c.y + c.h) return true;
  }
  return false;
}

// Push a circle out of static colliders; returns corrected {x,y}.
export function resolveStatic(city, x, y, r) {
  for (let iter = 0; iter < 3; iter++) {
    let moved = false;
    const push = (rx, ry, rw, rh) => {
      const nx = clamp(x, rx, rx + rw), ny = clamp(y, ry, ry + rh);
      const dx = x - nx, dy = y - ny, d2 = dx * dx + dy * dy;
      if (d2 >= r * r) return;
      if (d2 === 0) { y = ry - r; moved = true; return; }
      const d = Math.sqrt(d2), p = (r - d) / d;
      x += dx * p; y += dy * p; moved = true;
    };
    for (const b of city.buildings) push(b.x, b.y, b.w, b.h);
    for (const c of city.containers) push(c.x, c.y, c.w, c.h);
    if (y > 3360 - r) { y = 3360 - r; moved = true; }
    if (x < 24 + r) { x = 24 + r; moved = true; }
    if (y < 24 + r) { y = 24 + r; moved = true; }
    if (x > WORLD.w - 24 - r) { x = WORLD.w - 24 - r; moved = true; }
    if (!moved) break;
  }
  return { x, y };
}

// A random point on a road, for spawning traffic / pedestrians.
export function randomRoadPoint(rng) {
  if (rng() < 0.5) {
    return { x: pick(rng, ROAD_XS), y: randRange(rng, 120, WORLD.h - 240) };
  }
  return { x: randRange(rng, 120, WORLD.w - 240), y: pick(rng, ROAD_YS) };
}
