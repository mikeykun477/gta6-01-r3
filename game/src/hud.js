// hud.js — the on-screen HUD: health, cash, wanted stars, ammo, minimap,
// mission tracker, toasts and big flash messages. All original code.

import { clamp, fmtMoney, fmtTime } from './util.js';
import { WORLD, ROAD_XS, ROAD_YS, ROAD_W } from './city.js';
import { currentMission, missionStep, missionTargetPos } from './missions.js';

export function drawHUD(ctx, game, viewW, viewH) {
  const p = game.player;
  ctx.save();
  ctx.textBaseline = 'alphabetic';

  // --- Top-left: health, armor-less, cash, ammo ---
  ctx.fillStyle = 'rgba(10,12,16,0.55)';
  roundRect(ctx, 14, 14, 250, 92, 10); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'left';
  ctx.fillText('JAX CORVO', 26, 36);
  // Health bar
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; roundRect(ctx, 26, 46, 150, 14, 7); ctx.fill();
  ctx.fillStyle = p.health > 30 ? '#3ddc5a' : '#ff4d4d';
  roundRect(ctx, 26, 46, 150 * clamp(p.health / 100, 0, 1), 14, 7); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = '12px sans-serif';
  ctx.fillText(Math.ceil(p.health) + ' HP', 182, 57);
  ctx.font = 'bold 16px sans-serif'; ctx.fillStyle = '#7dffa0';
  ctx.fillText(fmtMoney(game.cash), 26, 84);
  ctx.font = '13px sans-serif'; ctx.fillStyle = '#ffd76a';
  ctx.fillText('AMMO ' + (p.reloading ? 'RELOADING…' : p.ammo + ' / ∞'), 130, 84);

  // --- Wanted stars (top centre) ---
  const starY = 34;
  ctx.font = '26px sans-serif'; ctx.textAlign = 'center';
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i < game.wanted ? '#ffd21f' : 'rgba(255,255,255,0.25)';
    ctx.fillText('★', viewW / 2 - 60 + i * 30, starY);
  }
  if (game.wanted > 0) {
    ctx.font = 'bold 12px sans-serif'; ctx.fillStyle = '#ff6b6b';
    ctx.fillText(game.wanted >= 3 ? 'THE LAW IS HUNTING YOU' : 'WANTED', viewW / 2, 56);
  }

  // --- Clock + day ---
  ctx.textAlign = 'right'; ctx.font = 'bold 14px sans-serif'; ctx.fillStyle = '#fff';
  const hours = Math.floor(6 + game.timeOfDay * 18) % 24;
  const mins = Math.floor((game.timeOfDay * 18 * 60) % 60);
  ctx.fillText(String(hours).padStart(2, '0') + ':' + String(mins).padStart(2, '0') + '  ·  VELORIA', viewW - 176, 32);

  // --- Mission tracker (top-right, under the clock) ---
  const m = currentMission(game);
  const step = missionStep(game);
  if (m && step) {
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(10,12,16,0.55)';
    roundRect(ctx, viewW - 330, 48, 316, 64, 10); ctx.fill();
    ctx.fillStyle = '#ffd640'; ctx.font = 'bold 13px sans-serif';
    ctx.fillText(m.title.toUpperCase(), viewW - 318, 70);
    ctx.fillStyle = '#fff'; ctx.font = '13px sans-serif';
    const txt = step._text || step.text;
    ctx.fillText(txt.length > 42 ? txt.slice(0, 42) + '…' : txt, viewW - 318, 90);
    const t = missionTargetPos(game);
    if (t) {
      const d = Math.hypot(p.x - t.x, p.y - t.y);
      ctx.fillStyle = '#9fd8ff'; ctx.font = '12px sans-serif';
      ctx.fillText(Math.round(d) + 'm  ·  ' + t.name, viewW - 318, 106);
    }
  } else if (game.sideJob) {
    const place = game.city.places[game.sideJob.target];
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(10,12,16,0.55)';
    roundRect(ctx, viewW - 330, 48, 316, 48, 10); ctx.fill();
    ctx.fillStyle = '#7dffa0'; ctx.font = 'bold 13px sans-serif';
    ctx.fillText('SIDE JOB — COURIER', viewW - 318, 70);
    ctx.fillStyle = '#fff'; ctx.font = '13px sans-serif';
    ctx.fillText('Deliver to ' + place.name + '  ($' + game.sideJob.reward + ')', viewW - 318, 90);
  } else if (game.nextMissionReady) {
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(10,12,16,0.55)';
    roundRect(ctx, viewW - 330, 48, 316, 48, 10); ctx.fill();
    ctx.fillStyle = '#ffd640'; ctx.font = 'bold 13px sans-serif';
    ctx.fillText('NEXT MISSION READY', viewW - 318, 70);
    ctx.fillStyle = '#fff'; ctx.font = '13px sans-serif';
    ctx.fillText('Press M to start: ' + (m ? m.title : ''), viewW - 318, 90);
  }

  // --- Minimap (bottom-right) ---
  drawMinimap(ctx, game, viewW - 178, viewH - 178, 164);

  // --- Speedometer while driving ---
  if (p.car) {
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(10,12,16,0.55)';
    roundRect(ctx, viewW - 178, viewH - 228, 164, 40, 10); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 22px sans-serif';
    ctx.fillText(Math.round(Math.abs(p.car.speed) * 0.24) + ' km/h', viewW - 24, viewH - 200);
  }

  // --- Controls hint (bottom-left, fades after a while) ---
  if (game.elapsed < 25) {
    ctx.globalAlpha = clamp((25 - game.elapsed) / 5, 0, 1) * 0.9;
    ctx.textAlign = 'left'; ctx.font = '13px sans-serif'; ctx.fillStyle = '#fff';
    ctx.fillStyle = 'rgba(10,12,16,0.5)';
    roundRect(ctx, 14, viewH - 96, 330, 82, 10); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText('WASD move / drive · Mouse aim · Click shoot', 26, viewH - 72);
    ctx.fillText('E enter / steal car · R reload · M mission', 26, viewH - 52);
    ctx.fillText('Q side job · P pause · Esc menu · N mute', 26, viewH - 32);
    ctx.globalAlpha = 1;
  }

  // --- Toasts ---
  let ty = 120;
  ctx.textAlign = 'center';
  for (const t of game.toasts) {
    ctx.globalAlpha = clamp(t.life / 1.2, 0, 1);
    ctx.fillStyle = 'rgba(10,12,16,0.7)';
    const w = ctx.measureText(t.text).width + 28;
    roundRect(ctx, viewW / 2 - w / 2, ty, w, 30, 15); ctx.fill();
    ctx.fillStyle = '#ffd640'; ctx.font = 'bold 14px sans-serif';
    ctx.fillText(t.text, viewW / 2, ty + 20);
    ty += 38;
  }
  ctx.globalAlpha = 1;

  // --- Flash message (mission complete etc.) ---
  if (game.flash) {
    ctx.globalAlpha = clamp(game.flash.life / 1, 0, 1);
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(10,12,16,0.55)';
    roundRect(ctx, viewW / 2 - 260, viewH * 0.3, 520, 84, 12); ctx.fill();
    ctx.fillStyle = '#ffd640'; ctx.font = 'bold 30px sans-serif';
    ctx.fillText(game.flash.title, viewW / 2, viewH * 0.3 + 38);
    ctx.fillStyle = '#fff'; ctx.font = '15px sans-serif';
    ctx.fillText(game.flash.sub, viewW / 2, viewH * 0.3 + 64);
    ctx.globalAlpha = 1;
  }

  // --- Dialogue box (bottom centre) ---
  if (game.dialogue) {
    const line = game.dialogue.lines[game.dialogue.idx];
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(8,10,14,0.85)';
    roundRect(ctx, viewW / 2 - 320, viewH - 190, 640, 86, 12); ctx.fill();
    ctx.strokeStyle = '#ffd640'; ctx.lineWidth = 2;
    roundRect(ctx, viewW / 2 - 320, viewH - 190, 640, 86, 12); ctx.stroke();
    ctx.fillStyle = '#ffd640'; ctx.font = 'bold 15px sans-serif';
    ctx.fillText(line[0].toUpperCase(), viewW / 2 - 300, viewH - 160);
    ctx.fillStyle = '#fff'; ctx.font = '15px sans-serif';
    wrapText(ctx, line[1], viewW / 2 - 300, viewH - 136, 600, 20);
    ctx.fillStyle = '#9fb3c8'; ctx.font = '12px sans-serif'; ctx.textAlign = 'right';
    ctx.fillText('E / click to continue', viewW / 2 + 300, viewH - 112);
  }

  // --- Busted / wasted handled by DOM overlay; show a red vignette when hurt ---
  if (game.hurtFlash > 0) {
    ctx.fillStyle = `rgba(255,30,30,${clamp(game.hurtFlash, 0, 0.35)})`;
    ctx.fillRect(0, 0, viewW, viewH);
  }
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapText(ctx, text, x, y, maxW, lh) {
  const words = text.split(' ');
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, y);
      line = w; y += lh;
    } else line = test;
  }
  ctx.fillText(line, x, y);
}

export function drawMinimap(ctx, game, x, y, size) {
  const s = size / WORLD.w;
  ctx.save();
  ctx.fillStyle = 'rgba(10,14,18,0.72)';
  roundRect(ctx, x - 6, y - 6, size + 12, size + 12, 10); ctx.fill();
  ctx.beginPath(); ctx.rect(x, y, size, size); ctx.clip();
  // Water + sand
  ctx.fillStyle = '#2f7fb8'; ctx.fillRect(x, y + 3360 * s, size, size - 3360 * s);
  ctx.fillStyle = '#e8d8a0'; ctx.fillRect(x, y + 3240 * s, size, 120 * s);
  // Blocks
  ctx.fillStyle = '#5c6650';
  ctx.fillRect(x, y, size, size);
  // Park
  ctx.fillStyle = '#3f7d3a';
  ctx.fillRect(x + (1400 + 48) * s, y + (1400 + 48) * s, 304 * s, 304 * s);
  // Roads
  ctx.fillStyle = '#8a8f96';
  for (const rx of ROAD_XS) ctx.fillRect(x + (rx - ROAD_W / 2) * s, y, ROAD_W * s, size);
  for (const ry of ROAD_YS) ctx.fillRect(x, y + (ry - ROAD_W / 2) * s, size, ROAD_W * s);
  // Buildings
  ctx.fillStyle = 'rgba(20,24,28,0.8)';
  for (const b of game.city.buildings) {
    ctx.fillRect(x + b.x * s, y + b.y * s, Math.max(1, b.w * s), Math.max(1, b.h * s));
  }
  // Mission / side-job target
  const t = missionTargetPos(game);
  if (t) {
    const pulse = 1 + Math.sin(game.elapsed * 5) * 0.3;
    ctx.fillStyle = '#ffd640';
    ctx.beginPath(); ctx.arc(x + t.x * s, y + t.y * s, 6 * pulse, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#ffd640'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x + t.x * s, y + t.y * s, 10 * pulse, 0, Math.PI * 2); ctx.stroke();
  } else if (game.sideJob) {
    const place = game.city.places[game.sideJob.target];
    ctx.fillStyle = '#7dffa0';
    ctx.beginPath(); ctx.arc(x + place.x * s, y + place.y * s, 5, 0, Math.PI * 2); ctx.fill();
  }
  // Police (red dots)
  ctx.fillStyle = '#ff4d4d';
  for (const c of game.police) {
    ctx.beginPath(); ctx.arc(x + c.x * s, y + c.y * s, 3.5, 0, Math.PI * 2); ctx.fill();
  }
  // Player (white arrow)
  const p = game.player;
  ctx.save();
  ctx.translate(x + p.x * s, y + p.y * s);
  ctx.rotate(p.car ? p.car.angle : p.angle);
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-5, -5); ctx.lineTo(-5, 5); ctx.closePath(); ctx.fill();
  ctx.restore();
  // North + label
  ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left';
  ctx.fillText('VELORIA', x + 2, y + size - 4);
  ctx.restore();
}
