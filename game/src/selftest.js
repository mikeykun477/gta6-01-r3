// selftest.js — headless self-checks for Veloria.
// Run with ?selftest=1 : builds a fresh world, runs the core systems and
// reports PASS/FAIL on screen and in document.title. No network, no input.

import { genCity, collidesStatic, resolveStatic, isOnRoad, WORLD } from './city.js';
import { mulberry32, dist } from './util.js';
import { MISSIONS, startMission, updateMission, spawnEnemies } from './missions.js';
import { saveGame, loadGame, clearSave } from './save.js';

export function runSelftest() {
  const results = [];
  const check = (name, fn) => {
    try {
      const ok = fn();
      results.push({ name, ok: !!ok });
    } catch (e) {
      results.push({ name, ok: false, err: String(e && e.message || e) });
    }
  };

  check('city generates buildings', () => {
    const c = genCity(7);
    return c.buildings.length > 120;
  });
  check('city has named story places', () => {
    const c = genCity(7);
    return Object.keys(c.places).length >= 8 && !!c.places.neonTide && !!c.places.port;
  });
  check('roads are walkable, buildings block', () => {
    const c = genCity(7);
    if (!isOnRoad(600, 600)) return false;
    const b = c.buildings[0];
    return collidesStatic(c, b.x + b.w / 2, b.y + b.h / 2, 10) === true;
  });
  check('resolveStatic pushes out of a building', () => {
    const c = genCity(7);
    const b = c.buildings[0];
    const r = resolveStatic(c, b.x + b.w / 2, b.y + b.h / 2, 12);
    return !collidesStatic(c, r.x, r.y, 12);
  });
  check('city generation is deterministic', () => {
    const a = genCity(42), b = genCity(42);
    return a.buildings.length === b.buildings.length && a.buildings[0].x === b.buildings[0].x;
  });
  check('mission list has 6 story missions', () => MISSIONS.length === 6 && MISSIONS.every(m => m.steps.length > 0 && m.briefing.length > 0));
  check('mission goto step completes at the marker', () => {
    const g = fakeGame();
    startMission(g, 0);
    g.player.x = g.city.places.neonTide.x; g.player.y = g.city.places.neonTide.y;
    updateMission(g, 0.1);
    return g.missionsDone === 1 && g.missionIndex === 1;
  });
  check('kill step counts enemy downs', () => {
    const g = fakeGame();
    startMission(g, 3);
    spawnEnemies(g, 2200, 1400, 4, 10);
    for (const e of g.enemies) { e.hp = 0; e.dead = true; g.onEnemyDown(e); }
    updateMission(g, 0.1);
    return g.missionsDone === 1;
  });
  check('save / load round-trips', () => {
    const g = fakeGame();
    g.cash = 1234; g.missionIndex = 2; g.missionsDone = 2;
    g.player.x = 1000; g.player.y = 1400;
    clearSave();
    saveGame(g);
    const d = loadGame();
    clearSave();
    return d && d.cash === 1234 && d.missionIndex === 2 && d.playerX === 1000;
  });
  check('wanted level raises and decays', () => {
    const g = fakeGame();
    g.raiseWanted(2, 'test');
    if (g.wanted !== 2) return false;
    g.wantedDecay(30);
    return g.wanted === 0;
  });
  check('rng is seeded and repeatable', () => {
    const r1 = mulberry32(99), r2 = mulberry32(99);
    return r1() === r2() && r1() === r2();
  });
  check('world bounds are sane', () => WORLD.w === 3600 && WORLD.h === 3600 && dist(0, 0, 3, 4) === 5);

  const passed = results.filter(r => r.ok).length;
  return { results, passed, total: results.length, ok: passed === results.length };
}

// Minimal stand-in game object with the methods missions/save need.
export function fakeGame() {
  const city = genCity(7);
  const g = {
    city, rng: mulberry32(7), cash: 500, wanted: 0, missionsDone: 0,
    missionIndex: 0, missionStep: 0, missionActive: false, missionKills: 0,
    missionTimer: 0, enemies: [], toasts: [],
    player: { x: 1400, y: 600, health: 100, ammo: 12, car: null },
    sfx: { missionDone() {}, pickup() {}, cash() {} },
    toast() {}, flashMessage() {}, autosave() {},
    raiseWanted(n) { this.wanted = Math.min(5, this.wanted + n); },
    wantedDecay(sec) { this.wanted = Math.max(0, this.wanted - Math.floor(sec / 12)); },
    onEnemyDown() { this.missionKills++; },
  };
  return g;
}

export function drawSelftest(ctx, report, viewW, viewH) {
  ctx.fillStyle = '#101418';
  ctx.fillRect(0, 0, viewW, viewH);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffd640'; ctx.font = 'bold 28px sans-serif';
  ctx.fillText('VELORIA — SELFTEST', 40, 60);
  ctx.font = '20px sans-serif';
  ctx.fillStyle = report.ok ? '#3ddc5a' : '#ff4d4d';
  ctx.fillText(report.ok ? `ALL PASS (${report.passed}/${report.total})` : `FAILURES PRESENT (${report.passed}/${report.total})`, 40, 100);
  ctx.font = '17px monospace';
  let y = 150;
  for (const r of report.results) {
    ctx.fillStyle = r.ok ? '#3ddc5a' : '#ff4d4d';
    ctx.fillText((r.ok ? 'PASS  ' : 'FAIL  ') + r.name + (r.err ? ' — ' + r.err : ''), 40, y);
    y += 30;
  }
  ctx.fillStyle = '#9fb3c8'; ctx.font = '15px sans-serif';
  ctx.fillText('Selftest runs without input or network. Close this tab to play the game.', 40, y + 20);
}
