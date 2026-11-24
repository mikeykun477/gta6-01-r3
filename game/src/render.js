// render.js — the camera and every pixel of Veloria: streets, buildings,
// beach, cars, people, muzzle flashes, skid marks and the day-night sky.

import { clamp, lerp, TAU } from './util.js';
import { WORLD, ROAD_XS, ROAD_YS, ROAD_W, isOnRoad } from './city.js';
import { missionTargetPos } from './missions.js';

export function makeCamera() {
  return { x: 1800, y: 1800, zoom: 1, shake: 0, shakeX: 0, shakeY: 0 };
}

export function updateCamera(game, dt) {
  const cam = game.camera;
  const p = game.player;
  cam.x = lerp(cam.x, p.x, clamp(6 * dt, 0, 1));
  cam.y = lerp(cam.y, p.y, clamp(6 * dt, 0, 1));
  // Zoom out a little while driving fast.
  const targetZoom = p.car ? clamp(1 - Math.abs(p.car.speed) / 2400, 0.82, 1) : 1;
  cam.zoom = lerp(cam.zoom, targetZoom, clamp(2 * dt, 0, 1));
  if (cam.shake > 0) {
    cam.shake = Math.max(0, cam.shake - dt * 26);
    cam.shakeX = (Math.random() - 0.5) * cam.shake;
    cam.shakeY = (Math.random() - 0.5) * cam.shake;
  } else { cam.shakeX = 0; cam.shakeY = 0; }
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawWorld(ctx, game, viewW, viewH) {
  const cam = game.camera;
  const city = game.city;
  const tod = game.timeOfDay; // 0 dawn, 0.5 noon, 1 dusk/night cycle value 0..1
  ctx.save();
  ctx.clearRect(0, 0, viewW, viewH);
  ctx.translate(viewW / 2, viewH / 2);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x + cam.shakeX, -cam.y + cam.shakeY);

  const vx0 = cam.x - viewW / 2 / cam.zoom - 60, vx1 = cam.x + viewW / 2 / cam.zoom + 60;
  const vy0 = cam.y - viewH / 2 / cam.zoom - 60, vy1 = cam.y + viewH / 2 / cam.zoom + 60;
  const inView = (x, y, m) => x > vx0 - m && x < vx1 + m && y > vy0 - m && y < vy1 + m;

  // --- Ground: dry grass base ---
  ctx.fillStyle = '#8fae6b';
  ctx.fillRect(vx0, vy0, vx1 - vx0, vy1 - vy0);

  // --- Beach + sea (south edge) ---
  ctx.fillStyle = '#e8d8a0';
  ctx.fillRect(vx0, 3240, vx1 - vx0, 140);
  ctx.fillStyle = '#2f7fb8';
  ctx.fillRect(vx0, 3380, vx1 - vx0, vy1 - 3380 + 60);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  for (let i = 0; i < 8; i++) {
    const wx = ((i * 613 + game.elapsed * 22) % 3600);
    if (wx > vx0 && wx < vx1) ctx.fillRect(wx, 3380 + (i % 3) * 26, 120, 3);
  }

  // --- City blocks (concrete) ---
  ctx.fillStyle = '#b9b3a4';
  for (let bi = 0; bi < ROAD_XS.length - 1; bi++) {
    for (let bj = 0; bj < ROAD_YS.length - 1; bj++) {
      const x0 = ROAD_XS[bi] + ROAD_W / 2, y0 = ROAD_YS[bj] + ROAD_W / 2;
      const x1 = ROAD_XS[bi + 1] - ROAD_W / 2, y1 = ROAD_YS[bj + 1] - ROAD_W / 2;
      if (x1 < vx0 || x0 > vx1 || y1 < vy0 || y0 > vy1) continue;
      if (bi === 4 && bj === 4) { ctx.fillStyle = '#5f9e52'; ctx.fillRect(x0, y0, x1 - x0, y1 - y0); ctx.fillStyle = '#b9b3a4'; }
      else if (bj === 7) { ctx.fillStyle = '#e8d8a0'; ctx.fillRect(x0, y0, x1 - x0, y1 - y0); ctx.fillStyle = '#b9b3a4'; }
      else ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    }
  }

  // --- Roads ---
  ctx.fillStyle = '#3c3f45';
  for (const rx of ROAD_XS) ctx.fillRect(rx - ROAD_W / 2, 0, ROAD_W, WORLD.h);
  for (const ry of ROAD_YS) ctx.fillRect(0, ry - ROAD_W / 2, WORLD.w, ROAD_W);
  // Centre dashes.
  ctx.fillStyle = '#e8d24a';
  for (const rx of ROAD_XS) {
    for (let y = 40; y < WORLD.h; y += 64) {
      if (y > vy0 && y < vy1 && rx > vx0 && rx < vx1) ctx.fillRect(rx - 2, y, 4, 30);
    }
  }
  for (const ry of ROAD_YS) {
    for (let x = 40; x < WORLD.w; x += 64) {
      if (x > vx0 && x < vx1 && ry > vy0 && ry < vy1) ctx.fillRect(x, ry - 2, 30, 4);
    }
  }
  // Crosswalks at intersections.
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  for (const rx of ROAD_XS) for (const ry of ROAD_YS) {
    if (!inView(rx, ry, 80)) continue;
    for (let i = -3; i <= 3; i++) {
      ctx.fillRect(rx - ROAD_W / 2 + 8, ry + i * 12 - 4, ROAD_W - 16, 5);
    }
  }

  // --- Skid marks ---
  ctx.strokeStyle = 'rgba(20,20,20,0.5)';
  ctx.lineWidth = 4;
  for (const s of game.skids) {
    if (!inView(s.x, s.y, 20)) continue;
    ctx.globalAlpha = clamp(s.life, 0, 1) * 0.6;
    ctx.beginPath();
    ctx.moveTo(s.x - Math.cos(s.angle) * 10, s.y - Math.sin(s.angle) * 10);
    ctx.lineTo(s.x + Math.cos(s.angle) * 10, s.y + Math.sin(s.angle) * 10);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // --- Cash / health pickups ---
  for (const pk of game.pickups) {
    if (!inView(pk.x, pk.y, 30)) continue;
    const bob = Math.sin(game.elapsed * 4 + pk.x) * 3;
    ctx.save();
    ctx.translate(pk.x, pk.y + bob);
    if (pk.kind === 'cash') {
      ctx.fillStyle = '#2fae5f'; rr(ctx, -12, -8, 24, 16, 3); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('$', 0, 4);
    } else if (pk.kind === 'health') {
      ctx.fillStyle = '#fff'; rr(ctx, -11, -11, 22, 22, 4); ctx.fill();
      ctx.fillStyle = '#d43a3a'; ctx.fillRect(-3, -8, 6, 16); ctx.fillRect(-8, -3, 16, 6);
    } else {
      ctx.fillStyle = '#f2c14e'; ctx.beginPath(); ctx.arc(0, 0, 10, 0, TAU); ctx.fill();
      ctx.fillStyle = '#7a5b00'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('9mm', 0, 4);
    }
    ctx.restore();
  }

  // --- Containers (port) ---
  for (const c of city.containers) {
    if (!inView(c.x, c.y, 80)) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(c.x + 4, c.y + 4, c.w, c.h);
    ctx.fillStyle = c.color; ctx.fillRect(c.x, c.y, c.w, c.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(c.x + (c.w / 4) * i, c.y); ctx.lineTo(c.x + (c.w / 4) * i, c.y + c.h); ctx.stroke(); }
  }

  // --- Buildings (shadow, wall, roof, windows) ---
  for (const b of city.buildings) {
    if (!inView(b.x, b.y, 200)) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(b.x + b.height * 0.5, b.y + b.height * 0.5, b.w, b.h);
    ctx.fillStyle = b.wall; ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = b.roof; ctx.fillRect(b.x + 4, b.y + 4, b.w - 8, b.h - 8);
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fillRect(b.x + 4, b.y + 4, b.w - 8, 6);
    if (b.windows) {
      ctx.fillStyle = tod > 0.62 ? '#ffe9a3' : '#5a6b7d';
      const cols = Math.max(1, Math.floor(b.w / 26)), rows = Math.max(1, Math.floor(b.h / 24));
      for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
        ctx.fillRect(b.x + 10 + i * 26, b.y + 10 + j * 24, 12, 10);
      }
    }
  }

  // --- Trees ---
  for (const t of city.trees) {
    if (!inView(t.x, t.y, 40)) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath(); ctx.ellipse(t.x + 4, t.y + 5, t.r, t.r * 0.7, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = t.palm ? '#4da34d' : '#3d7d3d';
    ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, TAU); ctx.fill();
    ctx.fillStyle = '#6d4c2f'; ctx.beginPath(); ctx.arc(t.x, t.y, 3, 0, TAU); ctx.fill();
  }

  // --- Mission beacon ---
  const target = missionTargetPos(game);
  if (target) {
    const pulse = 1 + Math.sin(game.elapsed * 4) * 0.12;
    ctx.save();
    ctx.translate(target.x, target.y);
    ctx.strokeStyle = 'rgba(255,214,64,0.9)'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(0, 0, target.radius * 0.5 * pulse, 0, TAU); ctx.stroke();
    ctx.fillStyle = 'rgba(255,214,64,0.15)';
    ctx.beginPath(); ctx.arc(0, 0, target.radius * 0.5 * pulse, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffd640';
    ctx.beginPath(); ctx.moveTo(0, -64 - Math.sin(game.elapsed * 4) * 8); ctx.lineTo(-12, -38); ctx.lineTo(12, -38); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  drawCars(ctx, game);
  drawPeople(ctx, game);
  drawBullets(ctx, game);
  drawParticles(ctx, game);

  // --- Day / night tint ---
  const night = clamp((tod - 0.62) / 0.25, 0, 1);
  const dusk = clamp(1 - Math.abs(tod - 0.78) / 0.12, 0, 1) * 0.5;
  if (dusk > 0) { ctx.fillStyle = `rgba(255,120,40,${dusk * 0.12})`; ctx.fillRect(vx0, vy0, vx1 - vx0, vy1 - vy0); }
  if (night > 0) { ctx.fillStyle = `rgba(10,16,60,${night * 0.34})`; ctx.fillRect(vx0, vy0, vx1 - vx0, vy1 - vy0); }
  ctx.restore();
}

function drawCars(ctx, game) {
  const all = [];
  for (const c of game.traffic) if (c.alive) all.push(c);
  for (const c of game.police) if (c.alive) all.push(c);
  for (const c of game.parkedCars) all.push(c);
  if (game.player.car) all.push(game.player.car);
  for (const c of all) drawCar(ctx, game, c);
}

export function drawCar(ctx, game, c) {
  const night = clamp((game.timeOfDay - 0.62) / 0.25, 0, 1);
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(c.angle);
  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  rr(ctx, -c.len / 2 + 3, -c.wid / 2 + 4, c.len, c.wid, 8); ctx.fill();
  // Wheels
  ctx.fillStyle = '#161616';
  ctx.fillRect(-c.len / 2 + 4, -c.wid / 2 - 2, 10, 5);
  ctx.fillRect(-c.len / 2 + 4, c.wid / 2 - 3, 10, 5);
  ctx.fillRect(c.len / 2 - 14, -c.wid / 2 - 2, 10, 5);
  ctx.fillRect(c.len / 2 - 14, c.wid / 2 - 3, 10, 5);
  // Body
  ctx.fillStyle = c.color;
  rr(ctx, -c.len / 2, -c.wid / 2, c.len, c.wid, 8); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  rr(ctx, -c.len / 2, -c.wid / 2, c.len, 6, 8); ctx.fill();
  // Windshield + roof
  ctx.fillStyle = '#1e2a33';
  rr(ctx, 2, -c.wid / 2 + 4, 12, c.wid - 8, 3); ctx.fill();
  ctx.fillStyle = c.kind === 'police' ? '#0e141b' : 'rgba(0,0,0,0.25)';
  rr(ctx, -12, -c.wid / 2 + 4, 12, c.wid - 8, 3); ctx.fill();
  // Headlights
  if (night > 0.25) {
    ctx.fillStyle = 'rgba(255,244,180,0.9)';
    ctx.beginPath(); ctx.arc(c.len / 2 - 1, -c.wid / 2 + 5, 3, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(c.len / 2 - 1, c.wid / 2 - 5, 3, 0, TAU); ctx.fill();
  } else {
    ctx.fillStyle = '#fff8c8';
    ctx.fillRect(c.len / 2 - 2, -c.wid / 2 + 4, 3, 4);
    ctx.fillRect(c.len / 2 - 2, c.wid / 2 - 8, 3, 4);
  }
  // Police livery + light bar
  if (c.kind === 'police') {
    ctx.fillStyle = '#fff';
    ctx.fillRect(-c.len / 2 + 6, -c.wid / 2 + 3, c.len - 12, 5);
    ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#0e141b';
    ctx.fillText('POLICE', 0, 4);
    const flash = Math.floor(game.elapsed * 6) % 2 === 0;
    ctx.fillStyle = flash ? '#ff2a2a' : '#2a6bff';
    ctx.beginPath(); ctx.arc(-4, -c.wid / 2 + 2, 4, 0, TAU); ctx.fill();
    ctx.fillStyle = flash ? '#2a6bff' : '#ff2a2a';
    ctx.beginPath(); ctx.arc(-4, c.wid / 2 - 2, 4, 0, TAU); ctx.fill();
  }
  if (c.missionCar) {
    ctx.strokeStyle = '#ffd640'; ctx.lineWidth = 3;
    rr(ctx, -c.len / 2 - 3, -c.wid / 2 - 3, c.len + 6, c.wid + 6, 10); ctx.stroke();
  }
  ctx.restore();
}

function drawPeople(ctx, game) {
  const p = game.player;
  // Pedestrians
  for (const ped of game.peds) {
    if (ped.dead) {
      ctx.save(); ctx.translate(ped.x, ped.y); ctx.rotate(ped.angle + 1.2);
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(0, 0, 11, 7, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = ped.color; ctx.beginPath(); ctx.ellipse(0, 0, 9, 5, 0, 0, TAU); ctx.fill();
      ctx.restore();
      continue;
    }
    ctx.save(); ctx.translate(ped.x, ped.y);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(1, 2, 8, 6, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = ped.color; ctx.beginPath(); ctx.arc(0, 0, 8, 0, TAU); ctx.fill();
    ctx.fillStyle = '#2b2118'; ctx.beginPath(); ctx.arc(Math.cos(ped.angle) * 3, Math.sin(ped.angle) * 3, 3.5, 0, TAU); ctx.fill();
    ctx.restore();
  }
  // Enemies (Tide thugs, red jackets)
  for (const e of game.enemies) {
    if (e.dead) {
      ctx.save(); ctx.translate(e.x, e.y);
      ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(0, 0, 11, 7, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#8a1f1f'; ctx.beginPath(); ctx.ellipse(0, 0, 9, 5, 0, 0, TAU); ctx.fill();
      ctx.restore();
      continue;
    }
    ctx.save(); ctx.translate(e.x, e.y);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(1, 2, 9, 7, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#a02020'; ctx.beginPath(); ctx.arc(0, 0, 9, 0, TAU); ctx.fill();
    ctx.fillStyle = '#e8c33a'; ctx.beginPath(); ctx.arc(Math.cos(e.angle) * 4, Math.sin(e.angle) * 4, 3.5, 0, TAU); ctx.fill();
    // Health bar
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(-12, -20, 24, 4);
    ctx.fillStyle = '#ff4d4d'; ctx.fillRect(-12, -20, 24 * clamp(e.hp / 70, 0, 1), 4);
    ctx.restore();
  }
  // Player on foot
  if (!p.car) {
    ctx.save(); ctx.translate(p.x, p.y);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(1, 2, 10, 8, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#1f6fb8'; ctx.beginPath(); ctx.arc(0, 0, 10, 0, TAU); ctx.fill();
    ctx.fillStyle = '#f2c14e'; ctx.beginPath(); ctx.arc(Math.cos(p.angle) * 4, Math.sin(p.angle) * 4, 4, 0, TAU); ctx.fill();
    // Gun barrel
    ctx.strokeStyle = '#222'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(Math.cos(p.angle) * 8, Math.sin(p.angle) * 8);
    ctx.lineTo(Math.cos(p.angle) * 20, Math.sin(p.angle) * 20); ctx.stroke();
    // Player ring so the eye finds him
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 14, 0, TAU); ctx.stroke();
    ctx.restore();
  }
}

function drawBullets(ctx, game) {
  ctx.fillStyle = '#ffe066';
  for (const b of game.bullets) {
    ctx.beginPath(); ctx.arc(b.x, b.y, 3, 0, TAU); ctx.fill();
  }
}

function drawParticles(ctx, game) {
  for (const pt of game.particles) {
    ctx.globalAlpha = clamp(pt.life / pt.maxLife, 0, 1);
    ctx.fillStyle = pt.color;
    ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// --- Particles ---
export function addParticles(game, x, y, n, color, speed, life, size) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU;
    const s = (0.3 + Math.random() * 0.7) * (speed || 120);
    game.particles.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: life || 0.6, maxLife: life || 0.6, color, size: size || 3,
    });
  }
}

export function updateParticles(game, dt) {
  for (const pt of game.particles) {
    pt.x += pt.vx * dt; pt.y += pt.vy * dt;
    pt.vx *= 0.94; pt.vy *= 0.94;
    pt.life -= dt;
  }
  game.particles = game.particles.filter(pt => pt.life > 0);
  for (const s of game.skids) s.life -= dt * 0.25;
  game.skids = game.skids.filter(s => s.life > 0);
}
