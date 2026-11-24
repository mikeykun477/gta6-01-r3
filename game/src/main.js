// main.js — Veloria: an open-world crime game in the spirit of GTA 6.
// Top-down 2D, original city, story and code. Static files, no network.

import { mulberry32, clamp, dist, angleTo, angleLerp, randRange, pick } from './util.js';
import { genCity, WORLD, ROAD_XS, ROAD_YS, ROAD_W, isOnRoad, nearestRoadCoord, randomRoadPoint, resolveStatic, collidesStatic } from './city.js';
import { Sfx } from './audio.js';
import { makeCar, updatePlayerCar, spawnTraffic, updateTraffic, spawnCop, updatePolice, spawnPeds, updatePeds, updateBullets, updateEnemies, CAR_LEN } from './entities.js';
import { addParticles, updateParticles, drawWorld, makeCamera, updateCamera } from './render.js';
import { drawHUD } from './hud.js';
import { MISSIONS, currentMission, missionStep, missionTargetPos, startMission, updateMission, updateSideJob, startSideJob, spawnEnemies } from './missions.js';
import { saveGame, loadGame, hasSave, clearSave, saveSummary } from './save.js';
import { runSelftest, drawSelftest } from './selftest.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const params = new URLSearchParams(location.search);
const SEED = parseInt(params.get('seed') || '20261124', 10);

class Game {
  constructor() {
    this.rng = mulberry32(SEED);
    this.city = genCity(SEED);
    this.sfx = new Sfx();
    this.camera = makeCamera();
    this.state = 'menu'; // menu | playing | paused | busted | wasted
    this.elapsed = 0;
    this.timeOfDay = 0.35; // morning light
    this.cash = 500;
    this.wanted = 0;
    this.crimeTimer = 0;
    this.copSpawnTimer = 0;
    this.missionIndex = 0;
    this.missionStep = 0;
    this.missionActive = false;
    this.missionKills = 0;
    this.missionTimer = 0;
    this.missionsDone = 0;
    this.nextMissionReady = false;
    this.storyComplete = false;
    this.sideJob = null;
    this.escapeTimer = null;
    this.dialogue = null;
    this.toasts = [];
    this.flash = null;
    this.hurtFlash = 0;
    this.gunfireNear = null;
    this.bullets = [];
    this.enemies = [];
    this.particles = [];
    this.skids = [];
    this.pickups = [];
    this.police = [];
    this.traffic = [];
    this.peds = [];
    this.parkedCars = [];
    this.missionCarSpawned = false;
    this.missionHint = '';
    this.autosaveTimer = 0;
    this.bustedTimer = 0;
    this.player = {
      x: 1400, y: 600, angle: 0, health: 100, ammo: 12, maxAmmo: 12,
      reloading: false, reloadT: 0, shootCd: 0, car: null, onFootSpeed: 210,
    };
    this.input = { up: false, down: false, left: false, right: false, shift: false };
    this.mouse = { x: 0, y: 0, down: false };
    this.keys = {};
    this.shotMode = params.get('shot');
    this.selftestMode = params.get('selftest') === '1';
    this.viewW = 1280; this.viewH = 720;
    this.spawnParkedCars();
    this.spawnPickups();
    spawnTraffic(this, 14);
    spawnPeds(this, 26);
  }

  // ---------- helpers used by other modules ----------
  toast(text, secs) { this.toasts.push({ text, life: secs || 3, max: secs || 3 }); }
  flashMessage(title, sub) { this.flash = { title, sub, life: 3.2 }; }
  addShake(n) { this.camera.shake = Math.max(this.camera.shake, n); }
  addSkid(x, y, angle) { this.skids.push({ x, y, angle, life: 1 }); if (this.skids.length > 220) this.skids.shift(); }
  spawnSparks(x, y, n, color) { addParticles(this, x, y, n, color || '#ffd76a', 160, 0.4, 2.5); }
  spawnBlood(x, y) { addParticles(this, x, y, 12, '#b02020', 90, 0.7, 3.5); }
  spawnSmoke(x, y) { addParticles(this, x, y, 8, '#888', 50, 1.1, 5); }

  raiseWanted(n, reason) {
    if (n <= 0) return;
    const before = this.wanted;
    this.wanted = clamp(this.wanted + n, 0, 5);
    this.crimeTimer = 0;
    if (this.wanted > before && reason) this.toast('Wanted level up — ' + reason, 3);
    if (this.wanted >= 1) this.sfx.setSiren(true);
  }

  wantedDecay(sec) { this.wanted = Math.max(0, this.wanted - Math.floor(sec / 12)); }

  damagePlayer(n) {
    if (this.state !== 'playing' || n <= 0) return;
    this.player.health -= n;
    this.hurtFlash = 1;
    if (this.player.health <= 0) {
      this.player.health = 0;
      this.die('wasted');
    }
  }

  onEnemyDown(e) { this.missionKills++; }

  autosave() { if (saveGame(this)) { /* saved silently */ } }

  // ---------- world setup ----------
  spawnParkedCars() {
    const spots = [
      [600, 640], [1000, 1240], [1800, 640], [2200, 1040], [2600, 640],
      [1400, 1840], [3000, 1040], [1000, 2240], [2200, 2240], [600, 2640],
    ];
    for (const [x, y] of spots) {
      const c = makeCar(x, y, this.rng() < 0.5 ? 0 : Math.PI / 2, pick(this.rng, ['#d64545', '#3f7fd0', '#e8c33a', '#e8e8e8', '#4caf7d', '#c05fd0']), 'parked');
      this.parkedCars.push(c);
    }
  }

  spawnPickups() {
    for (let i = 0; i < 14; i++) {
      const p = randomRoadPoint(this.rng);
      const kind = pick(this.rng, ['cash', 'cash', 'health', 'ammo']);
      this.pickups.push({ x: p.x + randRange(this.rng, -40, 40), y: p.y + randRange(this.rng, -40, 40), kind });
    }
  }

  spawnMissionCar() {
    if (this.missionCarSpawned) return;
    this.missionCarSpawned = true;
    const depot = this.city.places.depot;
    const c = makeCar(depot.x + 40, depot.y - 20, Math.PI / 2, '#ffd21f', 'parked');
    c.missionCar = true;
    this.parkedCars.push(c);
    this.toast('The Comet GT is parked at the Tide Depot', 4);
  }

  // ---------- car enter / exit / steal ----------
  nearestCar(maxD) {
    let best = null, bd = maxD;
    const p = this.player;
    for (const c of this.parkedCars) {
      const d = dist(p.x, p.y, c.x, c.y);
      if (d < bd) { bd = d; best = c; }
    }
    for (const c of this.traffic) {
      if (!c.alive || Math.abs(c.speed) > 60) continue;
      const d = dist(p.x, p.y, c.x, c.y);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  enterCar() {
    const p = this.player;
    if (p.car) { this.exitCar(); return; }
    const c = this.nearestCar(64);
    if (!c) return;
    // Stealing a traffic car: the driver flees, the law may notice.
    if (c.kind === 'traffic') {
      this.traffic = this.traffic.filter(t => t !== c);
      const ped = { x: c.x + 30, y: c.y + 30, angle: 0, speed: 60, color: '#e8b4b8', state: 'walk', tx: c.x + 200, ty: c.y + 200, panic: 3, dead: false, deadT: 0 };
      this.peds.push(ped);
      if (this.police.some(cp => dist(cp.x, cp.y, c.x, c.y) < 500) || this.rng() < 0.45) {
        this.raiseWanted(1, 'carjacking in plain sight');
      } else {
        this.toast('Car stolen — nobody saw', 2.5);
      }
    }
    if (c.kind === 'parked') this.parkedCars = this.parkedCars.filter(t => t !== c);
    c.kind = 'player';
    c.speed = 0;
    p.car = c;
    p.x = c.x; p.y = c.y;
    this.sfx.doorSlam();
    this.sfx.startEngine();
    if (c.missionCar) this.toast('Comet GT acquired — get it to the chop shop', 4);
  }

  exitCar() {
    const p = this.player;
    if (!p.car) return;
    const c = p.car;
    c.kind = 'parked';
    c.speed = 0;
    p.x = c.x - Math.sin(c.angle) * 30;
    p.y = c.y + Math.cos(c.angle) * 30;
    const r = resolveStatic(this.city, p.x, p.y, 12);
    p.x = r.x; p.y = r.y;
    this.parkedCars.push(c);
    p.car = null;
    this.sfx.stopEngine();
    this.sfx.doorSlam();
  }

  // ---------- combat ----------
  shoot() {
    const p = this.player;
    if (p.car || p.reloading || p.shootCd > 0 || p.ammo <= 0) {
      if (p.ammo <= 0 && !p.reloading) this.startReload();
      return;
    }
    p.shootCd = 0.22;
    p.ammo--;
    const wx = this.camera.x + (this.mouse.x - this.viewW / 2) / this.camera.zoom;
    const wy = this.camera.y + (this.mouse.y - this.viewH / 2) / this.camera.zoom;
    const a = angleTo(p.x, p.y, wx, wy);
    p.angle = a;
    this.bullets.push({
      x: p.x + Math.cos(a) * 20, y: p.y + Math.sin(a) * 20,
      vx: Math.cos(a) * 900, vy: Math.sin(a) * 900, life: 0.9, from: 'player', damage: 34,
    });
    this.gunfireNear = { x: p.x, y: p.y };
    this.sfx.gunshot();
    this.addShake(2);
    addParticles(this, p.x + Math.cos(a) * 22, p.y + Math.sin(a) * 22, 3, '#ffe066', 120, 0.15, 2);
    if (this.police.some(cp => dist(cp.x, cp.y, p.x, p.y) < 420)) this.raiseWanted(1, 'shots fired near police');
    if (p.ammo === 0) this.startReload();
  }

  startReload() {
    const p = this.player;
    if (p.reloading) return;
    p.reloading = true; p.reloadT = 1.1;
  }

  die(kind) {
    this.state = kind; // 'busted' | 'wasted'
    this.sfx.stopEngine();
    this.sfx.setSiren(false);
    this.sfx.busted();
    const lost = Math.floor(this.cash * (kind === 'busted' ? 0.2 : 0.1));
    this.cash -= lost;
    this.wanted = 0;
    this.police = [];
    showGameOver(kind, lost, this);
  }

  respawn() {
    const p = this.player;
    const s = this.city.places.safehouse;
    if (p.car) { this.exitCar(); }
    p.x = s.x; p.y = s.y - 40;
    p.health = 100; p.ammo = p.maxAmmo;
    this.camera.x = p.x; this.camera.y = p.y;
    this.state = 'playing';
    this.autosave();
  }

  // ---------- wanted / police director ----------
  updateWanted(dt) {
    this.crimeTimer += dt;
    // Decay: 12 quiet seconds with no cop nearby drops a star.
    const copNear = this.police.some(cp => dist(cp.x, cp.y, this.player.x, this.player.y) < 500);
    if (this.wanted > 0 && this.crimeTimer > 12 && !copNear) {
      this.wanted--;
      this.crimeTimer = 0;
      if (this.wanted === 0) { this.sfx.setSiren(false); this.toast('You lost the law — for now', 3); }
    }
    // Director: keep cop count matched to wanted level.
    const wantCops = this.wanted === 0 ? 0 : Math.min(5, this.wanted + (this.wanted >= 3 ? 1 : 0));
    this.copSpawnTimer -= dt;
    if (this.police.length < wantCops && this.copSpawnTimer <= 0) {
      this.police.push(spawnCop(this, this.police.length === 0));
      this.copSpawnTimer = 2.2;
    }
    // Busted: a cruiser sits on the player on foot.
    if (!this.player.car && this.wanted > 0) {
      const close = this.police.some(cp => dist(cp.x, cp.y, this.player.x, this.player.y) < 40);
      if (close) {
        this.bustedTimer += dt;
        if (this.bustedTimer > 1.2) { this.bustedTimer = 0; this.die('busted'); }
      } else this.bustedTimer = Math.max(0, this.bustedTimer - dt * 2);
    } else this.bustedTimer = 0;
  }

  // ---------- per-frame update ----------
  update(dt) {
    if (this.state !== 'playing') return;
    if (this.dialogue) return; // story beats pause the world
    this.elapsed += dt;
    this.timeOfDay = (this.timeOfDay + dt / 240) % 1;
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2.2);
    for (const t of this.toasts) t.life -= dt;
    this.toasts = this.toasts.filter(t => t.life > 0);
    if (this.flash) { this.flash.life -= dt; if (this.flash.life <= 0) this.flash = null; }
    this.autosaveTimer += dt;
    if (this.autosaveTimer > 60) { this.autosaveTimer = 0; this.autosave(); }

    const p = this.player;
    p.shootCd -= dt;
    if (p.reloading) {
      p.reloadT -= dt;
      if (p.reloadT <= 0) { p.reloading = false; p.ammo = p.maxAmmo; }
    }
    if (this.mouse.down) this.shoot();

    // Aim on foot follows the mouse.
    if (!p.car) {
      const wx = this.camera.x + (this.mouse.x - this.viewW / 2) / this.camera.zoom;
      const wy = this.camera.y + (this.mouse.y - this.viewH / 2) / this.camera.zoom;
      p.angle = angleTo(p.x, p.y, wx, wy);
      const sp = (this.input.shift ? 320 : 210);
      let mx = (this.input.right ? 1 : 0) - (this.input.left ? 1 : 0);
      let my = (this.input.down ? 1 : 0) - (this.input.up ? 1 : 0);
      if (mx || my) {
        const len = Math.hypot(mx, my); mx /= len; my /= len;
        const nx = p.x + mx * sp * dt, ny = p.y + my * sp * dt;
        const r = resolveStatic(this.city, nx, ny, 12);
        p.x = r.x; p.y = r.y;
      }
    } else {
      updatePlayerCar(this, p.car, this.input, dt);
      p.x = p.car.x; p.y = p.car.y;
      p.angle = p.car.angle;
      this.sfx.setEngine(Math.abs(p.car.speed) / 460, true);
      // Running over pedestrians.
      for (const ped of this.peds) {
        if (ped.dead) continue;
        if (dist(ped.x, ped.y, p.x, p.y) < 22 && Math.abs(p.car.speed) > 60) {
          ped.dead = true; ped.deadT = 0;
          this.spawnBlood(ped.x, ped.y);
          this.raiseWanted(1, 'pedestrian hit');
        }
      }
    }

    // Car-vs-car collisions (player car vs traffic).
    if (p.car) {
      for (const c of this.traffic) {
        if (!c.alive) continue;
        const d = dist(p.car.x, p.car.y, c.x, c.y);
        if (d < 44 && d > 0.1) {
          const push = (44 - d) / 2;
          const a = angleTo(c.x, c.y, p.car.x, p.car.y);
          p.car.x += Math.cos(a) * push; p.car.y += Math.sin(a) * push;
          c.x -= Math.cos(a) * push; c.y -= Math.sin(a) * push;
          if (Math.abs(p.car.speed) > 180) { this.sfx.crash(); this.spawnSparks(p.car.x, p.car.y, 6, '#ffb347'); this.addShake(4); }
          p.car.speed *= 0.7; c.speed *= 0.5;
        }
      }
    }

    updateTraffic(this, dt);
    updatePolice(this, dt);
    updatePeds(this, dt);
    updateEnemies(this, dt);
    updateBullets(this, dt);
    updateParticles(this, dt);
    this.updateWanted(dt);

    // Pickups.
    for (const pk of this.pickups) {
      if (dist(p.x, p.y, pk.x, pk.y) < 30) {
        if (pk.kind === 'cash') { this.cash += 50 + Math.floor(this.rng() * 100); this.sfx.cash(); this.toast('+$' + 50, 1.5); }
        else if (pk.kind === 'health') { p.health = Math.min(100, p.health + 35); this.sfx.pickup(); this.toast('Health +35', 1.5); }
        else { p.ammo = p.maxAmmo; this.sfx.pickup(); this.toast('Ammo refilled', 1.5); }
        pk.taken = true;
      }
    }
    if (this.pickups.some(pk => pk.taken)) {
      this.pickups = this.pickups.filter(pk => !pk.taken);
      if (this.pickups.length < 10) {
        const np = randomRoadPoint(this.rng);
        this.pickups.push({ x: np.x, y: np.y, kind: pick(this.rng, ['cash', 'health', 'ammo']) });
      }
    }

    // Mission logic.
    if (this.missionActive) {
      const step = missionStep(this);
      if (step && step.type === 'kill' && this.missionKills === 0 && this.enemies.length === 0 && !this._killSpawned) {
        const place = this.city.places[step.target];
        spawnEnemies(this, place.x, place.y, step.count, step.count >= 6 ? 90 : 70);
        this._killSpawned = true;
      }
      if (step && step.type === 'steal') this.spawnMissionCar();
      updateMission(this, dt);
    }
    updateSideJob(this, dt);
    if (this.gunfireNear) this.gunfireNear = null;

    updateCamera(this, dt);
  }

  render() {
    drawWorld(ctx, this, this.viewW, this.viewH);
    if (this.state === 'playing' || this.state === 'paused') drawHUD(ctx, this, this.viewW, this.viewH);
  }
}

// ---------- DOM overlays ----------
const $ = id => document.getElementById(id);
const game = new Game();

function showMenu() {
  game.state = 'menu';
  $('menu').style.display = 'flex';
  $('pause').style.display = 'none';
  $('gameover').style.display = 'none';
  const s = hasSave() ? saveSummary() : null;
  $('continueBtn').style.display = s ? 'inline-block' : 'none';
  if (s) $('continueBtn').textContent = 'Continue — $' + s.cash + ' · ' + s.missionsDone + ' missions done';
  updateMenuStats();
}

function updateMenuStats() {
  const s = hasSave() ? saveSummary() : null;
  $('menuStats').textContent = s
    ? 'Save found: $' + s.cash + ' · ' + s.missionsDone + '/6 missions · saved ' + s.savedAt
    : 'No save yet — a new story begins in Veloria.';
}

function startNewGame() {
  clearSave();
  resetGameState();
  $('menu').style.display = 'none';
  game.state = 'playing';
  game.sfx.ensure();
  startMission(game, 0);
}

function continueGame() {
  const d = loadGame();
  if (!d) { startNewGame(); return; }
  resetGameState();
  game.cash = d.cash;
  game.missionIndex = d.missionIndex;
  game.missionsDone = d.missionsDone;
  game.storyComplete = d.storyComplete;
  game.player.x = d.playerX; game.player.y = d.playerY;
  game.player.health = d.health; game.player.ammo = d.ammo;
  game.timeOfDay = d.timeOfDay || 0.35;
  game.camera.x = d.playerX; game.camera.y = d.playerY;
  $('menu').style.display = 'none';
  game.state = 'playing';
  game.sfx.ensure();
  if (game.missionIndex < MISSIONS.length) {
    game.nextMissionReady = true;
    game.toast('Press M to continue the story', 6);
  }
}

function resetGameState() {
  const keepSeed = game;
  game.cash = 500; game.wanted = 0; game.missionIndex = 0; game.missionStep = 0;
  game.missionActive = false; game.missionKills = 0; game.missionsDone = 0;
  game.nextMissionReady = false; game.storyComplete = false; game.sideJob = null;
  game.dialogue = null; game.toasts = []; game.flash = null;
  game.bullets = []; game.enemies = []; game.police = []; game.particles = [];
  game.player.x = 1400; game.player.y = 600; game.player.health = 100;
  game.player.ammo = 12; game.player.car = null; game.player.angle = 0;
  game.missionCarSpawned = false; game._killSpawned = false;
  game.elapsed = 0; game.timeOfDay = 0.35;
  game.camera.x = 1400; game.camera.y = 600;
  game.parkedCars = [];
  game.spawnParkedCars();
  spawnTraffic(game, 14);
  spawnPeds(game, 26);
  game.pickups = [];
  game.spawnPickups();
}

function showGameOver(kind, lost, g) {
  const el = $('gameover');
  el.style.display = 'flex';
  $('goTitle').textContent = kind === 'busted' ? 'BUSTED' : 'WASTED';
  $('goText').textContent = kind === 'busted'
    ? 'The Veloria PD dragged you out of the driver seat. You lost $' + lost + ' in fines and impound fees.'
    : 'You went down in the streets of Veloria. The medics patched you up — for a price: $' + lost + '.';
  $('goStats').textContent = 'Cash: $' + g.cash + ' · Missions: ' + g.missionsDone + '/6 · Time: ' + Math.floor(g.elapsed / 60) + 'm';
}

function togglePause() {
  if (game.state === 'playing') {
    game.state = 'paused';
    $('pause').style.display = 'flex';
    game.sfx.stopEngine();
    game.sfx.setSiren(false);
  } else if (game.state === 'paused') {
    game.state = 'playing';
    $('pause').style.display = 'none';
    game.sfx.ensure();
  }
}

// ---------- input ----------
const KEYMAP = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right' };
window.addEventListener('keydown', e => {
  if (e.code in KEYMAP) { game.input[KEYMAP[e.code]] = true; e.preventDefault(); }
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') game.input.shift = true;
  if (e.repeat) return;
  if (e.code === 'KeyE') {
    if (game.dialogue) { advanceDialogue(); return; }
    if (game.state === 'playing') game.enterCar();
  }
  if (e.code === 'KeyR' && game.state === 'playing') game.startReload();
  if (e.code === 'KeyM') {
    if (game.state === 'playing' && !game.missionActive && game.nextMissionReady) {
      game.nextMissionReady = false;
      startMission(game, game.missionIndex);
    } else if (game.state === 'playing' && !game.missionActive && game.missionIndex === 0 && game.missionsDone === 0) {
      startMission(game, 0);
    }
  }
  if (e.code === 'KeyQ' && game.state === 'playing') startSideJob(game);
  if (e.code === 'KeyN') { game.sfx.setMuted(!game.sfx.muted); game.toast(game.sfx.muted ? 'Sound off' : 'Sound on', 1.5); }
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (game.state === 'playing' || game.state === 'paused') togglePause();
  }
});
window.addEventListener('keyup', e => {
  if (e.code in KEYMAP) game.input[KEYMAP[e.code]] = false;
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') game.input.shift = false;
});
canvas.addEventListener('mousemove', e => {
  const r = canvas.getBoundingClientRect();
  game.mouse.x = (e.clientX - r.left) * (canvas.width / r.width);
  game.mouse.y = (e.clientY - r.top) * (canvas.height / r.height);
});
canvas.addEventListener('mousedown', e => {
  if (e.button !== 0) return;
  game.sfx.ensure();
  if (game.dialogue) { advanceDialogue(); return; }
  game.mouse.down = true;
  if (game.state === 'playing') game.shoot();
});
window.addEventListener('mouseup', () => { game.mouse.down = false; });
canvas.addEventListener('contextmenu', e => e.preventDefault());

function advanceDialogue() {
  if (!game.dialogue) return;
  game.dialogue.idx++;
  if (game.dialogue.idx >= game.dialogue.lines.length) {
    game.dialogue = null;
    // After the briefing of a kill mission, spawn the thugs.
    const step = missionStep(game);
    if (step && step.type === 'kill') {
      const place = game.city.places[step.target];
      if (game.enemies.length === 0) spawnEnemies(game, place.x, place.y, step.count, step.count >= 6 ? 90 : 70);
      game._killSpawned = true;
    }
  }
}

// Buttons
$('newBtn').addEventListener('click', () => { game.sfx.ensure(); game.sfx.click(); startNewGame(); });
$('continueBtn').addEventListener('click', () => { game.sfx.ensure(); game.sfx.click(); continueGame(); });
$('resumeBtn').addEventListener('click', togglePause);
$('saveBtn').addEventListener('click', () => { game.autosave(); game.toast('Game saved', 2); $('pause').style.display = 'none'; game.state = 'playing'; });
$('quitBtn').addEventListener('click', () => { game.autosave(); showMenu(); });
$('muteBtn').addEventListener('click', () => { game.sfx.setMuted(!game.sfx.muted); $('muteBtn').textContent = game.sfx.muted ? 'Sound: Off' : 'Sound: On'; });
$('respawnBtn').addEventListener('click', () => { $('gameover').style.display = 'none'; game.respawn(); });
$('menuBtn').addEventListener('click', () => { $('gameover').style.display = 'none'; showMenu(); });

// ---------- resize + main loop ----------
function resize() {
  game.viewW = window.innerWidth;
  game.viewH = window.innerHeight;
  canvas.width = game.viewW;
  canvas.height = game.viewH;
}
window.addEventListener('resize', resize);
resize();

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (game.state === 'menu') {
    // Slow cinematic pan over the city behind the menu.
    game.elapsed += dt;
    game.camera.x = 1800 + Math.cos(game.elapsed * 0.05) * 500;
    game.camera.y = 1800 + Math.sin(game.elapsed * 0.07) * 500;
    game.timeOfDay = 0.35 + Math.sin(game.elapsed * 0.02) * 0.05;
  }
  game.update(dt);
  game.render();
  requestAnimationFrame(frame);
}

// ---------- screenshot presets + selftest ----------
function applyShotPreset() {
  const mode = game.shotMode;
  if (!mode) return;
  game.sfx.ensure = () => {};
  if (mode === 'start') {
    game.state = 'menu';
    return;
  }
  $('menu').style.display = 'none';
  game.state = 'playing';
  if (mode === 'play') {
    const c = makeCar(1800, 1800, 0, '#d64545', 'player');
    game.player.car = c; game.player.x = c.x; game.player.y = c.y; c.speed = 260;
    game.camera.x = 1800; game.camera.y = 1800;
    game.cash = 2450;
    game.missionActive = false; game.nextMissionReady = true;
    game.toast('Free roam — Veloria is yours', 5);
  } else if (mode === 'chase') {
    const c = makeCar(1800, 1400, 0, '#3f7fd0', 'player');
    game.player.car = c; game.player.x = c.x; game.player.y = c.y; c.speed = 320;
    game.camera.x = 1800; game.camera.y = 1400;
    game.wanted = 3;
    game.police.push(spawnCop(game, true), spawnCop(game, true), spawnCop(game, false));
    game.cash = 3120;
    startMission(game, 4);
    game.dialogue = null;
    game.missionStep = 1;
    game.toast('Lose the cops!', 5);
  } else if (mode === 'mission') {
    game.player.x = 2900; game.player.y = 1700; game.player.health = 82;
    game.camera.x = 2900; game.camera.y = 1700;
    game.cash = 1650;
    startMission(game, 2);
    game.dialogue = null;
    game.spawnMissionCar();
    game.toast('Steal the Comet GT', 5);
  }
}

if (game.selftestMode) {
  const report = runSelftest();
  document.title = report.ok ? `SELFTEST PASS ${report.passed}/${report.total}` : `SELFTEST FAIL ${report.passed}/${report.total}`;
  const draw = () => { drawSelftest(ctx, report, game.viewW, game.viewH); requestAnimationFrame(draw); };
  resize();
  draw();
  console.log('SELFTEST', JSON.stringify(report));
} else {
  applyShotPreset();
  if (!game.shotMode) showMenu();
  requestAnimationFrame(frame);
}
