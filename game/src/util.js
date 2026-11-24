// util.js — small math + seeded-random helpers for Veloria.
// Everything here is original code written for this game.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
export const TAU = Math.PI * 2;

export function angleTo(x1, y1, x2, y2) { return Math.atan2(y2 - y1, x2 - x1); }

export function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

export function angleLerp(a, b, t) { return a + angleDiff(a, b) * t; }

export function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }

export function randRange(rng, lo, hi) { return lo + rng() * (hi - lo); }

export function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

// Circle vs axis-aligned rect collision, returns push-out vector or null.
export function circleRectResolve(cx, cy, r, rx, ry, rw, rh) {
  const nx = clamp(cx, rx, rx + rw);
  const ny = clamp(cy, ry, ry + rh);
  const dx = cx - nx, dy = cy - ny;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return null;
  if (d2 === 0) return { x: 0, y: -r };
  const d = Math.sqrt(d2);
  const push = (r - d) / d;
  return { x: dx * push, y: dy * push };
}

export function fmtMoney(n) { return '$' + Math.floor(n).toLocaleString('en-US'); }

export function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}
