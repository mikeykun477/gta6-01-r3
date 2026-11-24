// entities.js — the moving pieces of Veloria: the player's car, traffic,
// police cruisers, pedestrians, bullets and particles. All original code.

import { clamp, dist, angleTo, angleDiff, angleLerp, randRange, pick, TAU } from './util.js';
import { ROAD_XS, ROAD_YS, ROAD_W, WORLD, resolveStatic, collidesStatic, nearestRoadCoord, randomRoadPoint } from './city.js';

export const CAR_LEN = 46, CAR_WID = 24;

export function makeCar(x, y, angle, color, kind) {
  return {
    x, y, angle, speed: 0, color, kind: kind || 'traffic',
    len: CAR_LEN, wid: CAR_WID, alive: true,
    // traffic fields
    axis: 'v', dir: 1, targetSpeed: 120 + Math.random() * 60,
    turnCooldown: 0, stuck: 0,
    // police fields
    ramCooldown: 0,
  };
}

// --- Player driving (arcade: accel, steering scaled by speed, drift) ---
export function updatePlayerCar(game, car, input, dt) {
  const maxFwd = 460, maxRev = 160, accel = 340, brake = 520;
  if (input.up) car.speed += accel * dt;
  else if (input.down) {
    if (car.speed > 20) car.speed -= brake * dt;
    else car.speed -= accel * 0.55 * dt;
  } else {
    car.speed -= Math.sign(car.speed) * 140 * dt;
    if (Math.abs(car.speed) < 8) car.speed = 0;
  }
  car.speed = clamp(car.speed, -maxRev, maxFwd);
  const steer = (input.left ? -1 : 0) + (input.right ? 1 : 0);
  const spd = Math.abs(car.speed);
  const grip = spd > 240 ? 0.55 : 1; // drift a little at speed
  car.angle += steer * (1.9 * grip) * (car.speed / maxFwd) * dt * (car.speed >= 0 ? 1 : -1) * 2.2;
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  if (collidesStatic(game.city, nx, ny, 20)) {
    if (spd > 200) { game.sfx.crash(); game.addShake(Math.min(10, spd / 50)); game.damagePlayer(0); }
    car.speed *= -0.25;
  } else {
    car.x = nx; car.y = ny;
  }
  car.x = clamp(car.x, 30, WORLD.w - 30);
  car.y = clamp(car.y, 30, WORLD.h - 30);
  // Skid marks at speed while turning.
  if (spd > 260 && steer !== 0 && Math.random() < 0.6) {
    game.addSkid(car.x - Math.cos(car.angle) * 16, car.y - Math.sin(car.angle) * 16, car.angle);
  }
}

// --- Traffic: cars cruise the road grid, turn at intersections, queue up ---
export function spawnTraffic(game, n) {
  const rng = game.rng;
  game.traffic = [];
  for (let i = 0; i < n; i++) {
    const p = randomRoadPoint(rng);
    const vertical = Math.abs(p.x - nearestRoadCoord(p.x)) < 4;
    const dir = rng() < 0.5 ? 1 : -1;
    const c = makeCar(p.x, p.y, vertical ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI),
      pick(rng, ['#d64545', '#3f7fd0', '#e8c33a', '#e8e8e8', '#2b2b2b', '#4caf7d', '#c05fd0', '#e07b2e', '#7fb3d5']), 'traffic');
    c.axis = vertical ? 'v' : 'h';
    c.dir = dir;
    c.speed = c.targetSpeed;
    game.traffic.push(c);
  }
}

function lanePos(c) {
  // Right-hand traffic: lane offset from the road centre.
  if (c.axis === 'v') return { x: nearestRoadCoord(c.x) + (c.dir > 0 ? 22 : -22), y: c.y };
  return { x: c.x, y: nearestRoadCoord(c.y) + (c.dir > 0 ? -22 : 22) };
}

export function updateTraffic(game, dt) {
  const px = game.player.x, py = game.player.y;
  for (const c of game.traffic) {
    if (!c.alive) continue;
    // Keep some distance from the car ahead in the same lane.
    let want = c.targetSpeed;
    for (const o of game.traffic) {
      if (o === c || !o.alive || o.axis !== c.axis || o.dir !== c.dir) continue;
      const ahead = c.axis === 'v' ? (c.dir > 0 ? o.y - c.y : c.y - o.y) : (c.dir > 0 ? o.x - c.x : c.x - o.x);
      const lateral = c.axis === 'v' ? Math.abs(o.x - c.x) : Math.abs(o.y - c.y);
      if (ahead > 0 && ahead < 70 && lateral < 26) { want = Math.min(want, 40); break; }
    }
    // Slow for the player blocking the road.
    const pd = dist(c.x, c.y, px, py);
    if (pd < 60 && Math.abs(angleDiff(c.angle, angleTo(c.x, c.y, px, py))) < 0.6) want = 0;
    c.speed += clamp(want - c.speed, -260 * dt, 160 * dt);
    c.x += Math.cos(c.angle) * c.speed * dt;
    c.y += Math.sin(c.angle) * c.speed * dt;

    // Snap to lane.
    const lane = lanePos(c);
    if (c.axis === 'v') c.x = lane.x; else c.y = lane.y;

    // At an intersection, sometimes turn.
    c.turnCooldown -= dt;
    const onCross = c.axis === 'v'
      ? ROAD_YS.some(ry => Math.abs(c.y - ry) < 6)
      : ROAD_XS.some(rx => Math.abs(c.x - rx) < 6);
    if (onCross && c.turnCooldown <= 0 && Math.random() < 0.012) {
      c.axis = c.axis === 'v' ? 'h' : 'v';
      c.dir = Math.random() < 0.5 ? 1 : -1;
      c.angle = c.axis === 'v' ? (c.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (c.dir > 0 ? 0 : Math.PI);
      c.turnCooldown = 2.5;
    }
    // Wrap around the world edges.
    if (c.x < 60) { c.x = WORLD.w - 80; }
    if (c.x > WORLD.w - 60) { c.x = 80; }
    if (c.y < 60) { c.y = WORLD.h - 80; }
    if (c.y > WORLD.h - 60) { c.y = 80; }
    // Too far from the player: teleport closer to keep the streets alive.
    if (dist(c.x, c.y, px, py) > 1500) {
      const p = randomRoadPoint(game.rng);
      const near = { x: clamp(px + (p.x - px) * 0.2, 100, WORLD.w - 100), y: clamp(py + (p.y - py) * 0.2, 100, WORLD.h - 100) };
      c.x = nearestRoadCoord(near.x); c.y = nearestRoadCoord(near.y);
    }
  }
}

// --- Police ---
export function spawnCop(game, nearPlayer) {
  const p = game.player;
  const ang = Math.random() * TAU;
  const d = nearPlayer ? 420 : 700;
  let x = clamp(p.x + Math.cos(ang) * d, 100, WORLD.w - 100);
  let y = clamp(p.y + Math.sin(ang) * d, 100, WORLD.h - 100);
  x = nearestRoadCoord(x); y = nearestRoadCoord(y);
  const c = makeCar(x, y, angleTo(x, y, p.x, p.y), '#1c2733', 'police');
  c.speed = 200;
  return c;
}

export function updatePolice(game, dt) {
  const p = game.player;
  for (const c of game.police) {
    if (!c.alive) continue;
    const d = dist(c.x, c.y, p.x, p.y);
    const target = angleTo(c.x, c.y, p.x, p.y);
    // Steer toward the player, faster with higher wanted level.
    const maxSpeed = 300 + game.wanted * 45;
    c.speed = clamp(c.speed + (d > 90 ? 300 : -200) * dt, -60, maxSpeed);
    c.angle = angleLerp(c.angle, target, clamp(2.2 * dt, 0, 1));
    const nx = c.x + Math.cos(c.angle) * c.speed * dt;
    const ny = c.y + Math.sin(c.angle) * c.speed * dt;
    if (!collidesStatic(game.city, nx, ny, 20)) { c.x = nx; c.y = ny; }
    else { c.speed *= 0.4; c.angle += 0.6 * dt; }
    // Ram the player.
    c.ramCooldown -= dt;
    if (d < 46 && c.ramCooldown <= 0) {
      c.ramCooldown = 0.9;
      game.damagePlayer(6 + game.wanted * 2);
      game.sfx.crash();
      game.addShake(7);
      if (p.car) {
        p.car.speed *= 0.6;
        p.x += Math.cos(c.angle) * 14; p.y += Math.sin(c.angle) * 14;
      } else {
        p.x += Math.cos(c.angle) * 26; p.y += Math.sin(c.angle) * 26;
      }
    }
    // Give up if the player is long gone and wanted is low.
    if (d > 1600 && game.wanted <= 1) c.alive = false;
  }
  game.police = game.police.filter(c => c.alive);
}

// --- Pedestrians ---
export function spawnPeds(game, n) {
  const rng = game.rng;
  game.peds = [];
  for (let i = 0; i < n; i++) {
    const p = randomRoadPoint(rng);
    game.peds.push({
      x: p.x + randRange(rng, -50, 50), y: p.y + randRange(rng, -50, 50),
      angle: rng() * TAU, speed: randRange(rng, 26, 48),
      color: pick(rng, ['#e8b4b8', '#a8c8e8', '#e8d8a8', '#c8e8b4', '#d8b4e8', '#f0f0f0', '#ff9d5c']),
      state: 'walk', tx: p.x, ty: p.y, panic: 0, dead: false, deadT: 0,
    });
  }
}

export function updatePeds(game, dt) {
  const p = game.player;
  for (const ped of game.peds) {
    if (ped.dead) { ped.deadT += dt; continue; }
    const danger = dist(ped.x, ped.y, p.x, p.y);
    if (ped.panic > 0) ped.panic -= dt;
    if (game.gunfireNear && dist(ped.x, ped.y, game.gunfireNear.x, game.gunfireNear.y) < 260) ped.panic = 2.5;
    if (danger < 40 && p.car && Math.abs(p.car.speed) > 150) ped.panic = 2;
    if (ped.panic > 0) {
      // Flee away from the player.
      const a = angleTo(p.x, p.y, ped.x, ped.y);
      ped.x += Math.cos(a) * 150 * dt;
      ped.y += Math.sin(a) * 150 * dt;
      ped.angle = a;
    } else {
      const d = dist(ped.x, ped.y, ped.tx, ped.ty);
      if (d < 12) {
        const np = randomRoadPoint(game.rng);
        ped.tx = np.x + randRange(game.rng, -60, 60);
        ped.ty = np.y + randRange(game.rng, -60, 60);
      } else {
        const a = angleTo(ped.x, ped.y, ped.tx, ped.ty);
        ped.angle = angleLerp(ped.angle, a, clamp(4 * dt, 0, 1));
        ped.x += Math.cos(ped.angle) * ped.speed * dt;
        ped.y += Math.sin(ped.angle) * ped.speed * dt;
      }
    }
    const r = resolveStatic(game.city, ped.x, ped.y, 10);
    ped.x = r.x; ped.y = r.y;
    // Keep peds near the action so streets feel alive.
    if (dist(ped.x, ped.y, p.x, p.y) > 1400) {
      const np = randomRoadPoint(game.rng);
      ped.x = clamp(p.x + (np.x - p.x) * 0.15, 80, WORLD.w - 80);
      ped.y = clamp(p.y + (np.y - p.y) * 0.15, 80, WORLD.h - 80);
      ped.dead = false;
    }
  }
}

// --- Bullets ---
export function updateBullets(game, dt) {
  for (const b of game.bullets) {
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    if (b.life <= 0) continue;
    if (collidesStatic(game.city, b.x, b.y, 2)) { b.life = 0; game.spawnSparks(b.x, b.y, 4, '#ffd76a'); continue; }
    // Hit peds.
    if (b.from === 'player') {
      for (const ped of game.peds) {
        if (ped.dead) continue;
        if (dist(b.x, b.y, ped.x, ped.y) < 12) {
          ped.dead = true; ped.deadT = 0; b.life = 0;
          game.spawnBlood(ped.x, ped.y);
          game.raiseWanted(1, 'pedestrian down');
          break;
        }
      }
      if (b.life <= 0) continue;
      for (const c of game.police) {
        if (dist(b.x, b.y, c.x, c.y) < 24) {
          b.life = 0; c.speed *= 0.5;
          game.spawnSparks(b.x, b.y, 6, '#ffb347');
          game.raiseWanted(1, 'cop car hit');
          break;
        }
      }
      if (b.life <= 0) continue;
      for (const e of game.enemies) {
        if (e.dead) continue;
        if (dist(b.x, b.y, e.x, e.y) < 14) {
          e.hp -= b.damage; b.life = 0;
          game.spawnBlood(e.x, e.y);
          game.sfx.hit();
          if (e.hp <= 0) { e.dead = true; e.deadT = 0; game.onEnemyDown(e); }
          break;
        }
      }
    } else {
      // Enemy bullet vs the player.
      const pr = game.player.car ? 22 : 12;
      if (dist(b.x, b.y, game.player.x, game.player.y) < pr) {
        b.life = 0;
        game.damagePlayer(b.damage);
      }
    }
  }
  game.bullets = game.bullets.filter(b => b.life > 0);
}

// --- Enemies (mission gang members) ---
export function updateEnemies(game, dt) {
  const p = game.player;
  for (const e of game.enemies) {
    if (e.dead) { e.deadT += dt; continue; }
    const d = dist(e.x, e.y, p.x, p.y);
    e.shootCd -= dt;
    if (d > 420) {
      // Close the distance.
      const a = angleTo(e.x, e.y, p.x, p.y);
      e.angle = a;
      const nx = e.x + Math.cos(a) * 95 * dt, ny = e.y + Math.sin(a) * 95 * dt;
      if (!collidesStatic(game.city, nx, ny, 10)) { e.x = nx; e.y = ny; }
    } else {
      e.angle = angleTo(e.x, e.y, p.x, p.y);
      if (e.shootCd <= 0 && d < 380) {
        e.shootCd = randRange(game.rng, 0.9, 1.8);
        const spread = randRange(game.rng, -0.16, 0.16);
        const a = e.angle + spread;
        game.bullets.push({ x: e.x + Math.cos(a) * 16, y: e.y + Math.sin(a) * 16, vx: Math.cos(a) * 620, vy: Math.sin(a) * 620, life: 1.4, from: 'enemy', damage: 9 });
        game.sfx.enemyShot();
      }
    }
  }
  game.enemies = game.enemies.filter(e => !e.dead || e.deadT < 8);
}
