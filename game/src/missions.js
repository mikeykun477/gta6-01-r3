// missions.js — the story of Jax Corvo in Veloria, and the mission engine.
// Six story missions plus repeatable courier side-jobs. All original writing.

import { dist, randRange, pick } from './util.js';

export const MISSIONS = [
  {
    id: 'homecoming', title: '1 — Homecoming', reward: 200,
    briefing: [
      ['Mama Odette', 'Jax Corvo. Ten years gone and you walk back into my bar like the tide owes you something.'],
      ['Jax', 'It owes me a clean start, Odette. That is all.'],
      ['Mama Odette', 'Then start by driving over to my bar, the Neon Tide. We will talk about what you owe.'],
    ],
    steps: [
      { type: 'goto', target: 'neonTide', radius: 90, text: 'Drive to the Neon Tide Bar' },
    ],
  },
  {
    id: 'pickup', title: '2 — The Pickup', reward: 400,
    briefing: [
      ['Mama Odette', 'A friend left a package at the Marina del Sol. Bring it to your safehouse. No opening it. No stopping for the view.'],
      ['Jax', 'Packages, Odette? I came back to drive, not to play courier.'],
      ['Mama Odette', 'Driving IS the job, boy. The marina, then home. Go.'],
    ],
    steps: [
      { type: 'goto', target: 'marina', radius: 90, text: 'Collect the package at Marina del Sol' },
      { type: 'deliver', target: 'safehouse', radius: 90, text: 'Deliver the package to your safehouse' },
    ],
  },
  {
    id: 'hotwheels', title: '3 — Hot Wheels', reward: 800,
    briefing: [
      ['Mama Odette', 'The Tide Syndicate parks a fresh Comet GT at their depot. I want it in my chop shop before sunset.'],
      ['Jax', 'Steal from Sal Vane on my second day back? You do know how to welcome a man home.'],
      ['Mama Odette', 'Steal it, lose the cops, bring it to Rust & Chrome. The cops will notice — drive like you mean it.'],
    ],
    steps: [
      { type: 'steal', target: 'depot', radius: 120, text: 'Steal the Comet GT at the Tide Depot (press E near it)' },
      { type: 'deliver', target: 'chopShop', radius: 100, text: 'Deliver the Comet GT to the chop shop', needsCar: true },
    ],
    onStart(game) { game.raiseWanted(0, ''); },
    onStep(game, step) { if (step === 1) game.raiseWanted(2, 'grand theft auto'); },
  },
  {
    id: 'debt', title: '4 — Debt Collector', reward: 1000,
    briefing: [
      ['Mama Odette', "Sal Vane's boys have been leaning on my regulars at the Hotel Alba. Go remind them whose streets these are."],
      ['Jax', 'Remind them with words, or with the loud kind of reminder?'],
      ['Mama Odette', 'Bring your pistol, Jax. Words stopped working years ago.'],
    ],
    steps: [
      { type: 'kill', target: 'hotel', radius: 260, count: 4, text: 'Deal with the Tide thugs at Hotel Alba (0/4)' },
    ],
  },
  {
    id: 'getaway', title: '5 — The Getaway', reward: 1500,
    briefing: [
      ['Mama Odette', 'A client of mine needs a ride out of the Hotel Alba, fast and quiet. The cops are already circling.'],
      ['Jax', 'Quiet and fast. My two favourite lies.'],
      ['Mama Odette', 'Pick him up, lose the law, bring him to your safehouse. Do not get caught, Jax.'],
    ],
    steps: [
      { type: 'goto', target: 'hotel', radius: 90, text: 'Pick up the client at Hotel Alba' },
      { type: 'escape', target: 'safehouse', radius: 100, survive: 22, text: 'Lose the cops, then reach your safehouse' },
    ],
    onStep(game, step) { if (step === 1) game.raiseWanted(3, 'aiding a fugitive'); },
  },
  {
    id: 'tidesend', title: '6 — Tide\'s End', reward: 3000,
    briefing: [
      ['Mama Odette', 'It ends tonight, Jax. Sal Vane is at the container port with his whole crew. Finish it — and Veloria is yours.'],
      ['Jax', 'One last drive, Odette. Then I am done owing anybody anything.'],
      ['Mama Odette', 'Come back alive, boy. The bar is not the same without you.'],
    ],
    steps: [
      { type: 'kill', target: 'port', radius: 320, count: 6, text: "Take down Vane's crew at the port (0/6)" },
      { type: 'goto', target: 'rooftop', radius: 90, text: 'Meet Odette at the Hotel Alba rooftop' },
    ],
  },
];

export function spawnEnemies(game, x, y, n, hp) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + randRange(game.rng, -0.4, 0.4);
    const r = randRange(game.rng, 60, 180);
    game.enemies.push({
      x: x + Math.cos(a) * r, y: y + Math.sin(a) * r,
      angle: 0, hp: hp || 70, dead: false, deadT: 0, shootCd: randRange(game.rng, 0.5, 1.5),
    });
  }
}

export function currentMission(game) {
  if (game.missionIndex >= MISSIONS.length) return null;
  return MISSIONS[game.missionIndex];
}

export function missionStep(game) {
  const m = currentMission(game);
  if (!m || !game.missionActive) return null;
  return m.steps[game.missionStep];
}

export function missionTargetPos(game) {
  const step = missionStep(game);
  if (!step) return null;
  const place = game.city.places[step.target];
  if (!place) return null;
  return { x: place.x, y: place.y, name: place.name, radius: step.radius };
}

export function startMission(game, idx) {
  const m = MISSIONS[idx];
  if (!m) return;
  game.missionIndex = idx;
  game.missionStep = 0;
  game.missionActive = true;
  game.missionTimer = 0;
  game.enemies = [];
  game.dialogue = { lines: m.briefing, idx: 0, done: false };
  game.toast('New mission: ' + m.title, 4);
  game.sfx.missionDone();
  if (m.onStart) m.onStart(game);
}

export function advanceDialogue(game) {
  if (!game.dialogue) return;
  game.dialogue.idx++;
  if (game.dialogue.idx >= game.dialogue.lines.length) game.dialogue = null;
}

function completeStep(game) {
  const m = currentMission(game);
  game.missionStep++;
  game.sfx.pickup();
  if (game.missionStep >= m.steps.length) {
    completeMission(game);
  } else {
    if (m.onStep) m.onStep(game, game.missionStep);
    game.toast('Objective complete', 2.5);
  }
}

function completeMission(game) {
  const m = currentMission(game);
  game.cash += m.reward;
  game.missionActive = false;
  game.missionsDone++;
  game.sfx.missionDone();
  game.sfx.cash();
  game.toast('Mission complete: ' + m.title + '  +$' + m.reward, 5);
  game.flashMessage('MISSION COMPLETE', m.title + '  —  +$' + m.reward);
  game.autosave();
  game.missionIndex++;
  if (game.missionIndex >= MISSIONS.length) {
    game.storyComplete = true;
    game.flashMessage('KING OF VELORIA', 'Every mission complete. The city is yours, Jax.');
  } else {
    // Next mission starts when the player drives to the marker, or via the M key.
    game.nextMissionReady = true;
    game.toast('Press M to start the next mission', 6);
  }
}

export function updateMission(game, dt) {
  const step = missionStep(game);
  if (!step) return;
  const place = game.city.places[step.target];
  if (!place) return;
  const p = game.player;
  const d = dist(p.x, p.y, place.x, place.y);
  game.missionTimer += dt;

  if (step.type === 'goto' || step.type === 'deliver') {
    if (step.needsCar && !p.car) { game.missionHint = 'You need a car for this.'; return; }
    if (d < step.radius) completeStep(game);
  } else if (step.type === 'steal') {
    // The marked car: the player must be driving the mission car.
    if (p.car && p.car.missionCar) completeStep(game);
  } else if (step.type === 'kill') {
    const killed = game.missionKills || 0;
    step._text = step.text.replace(/\(\d+\/\d+\)/, `(${killed}/${step.count})`);
    if (killed >= step.count) completeStep(game);
  } else if (step.type === 'escape') {
    if (game.wanted >= 2 && game.escapeTimer == null) game.escapeTimer = 0;
    if (game.escapeTimer != null) {
      game.escapeTimer += dt;
      if (game.wanted === 0 && game.escapeTimer > 3) {
        // Lost them — now just reach the safehouse.
        if (d < step.radius) completeStep(game);
      } else if (game.escapeTimer > step.survive && d < step.radius) {
        completeStep(game);
      }
    }
  }
}

// --- Side jobs: repeatable courier runs for cash ---
const SIDE_TARGETS = ['marina', 'neonTide', 'chopShop', 'hotel', 'safehouse', 'depot', 'port'];

export function startSideJob(game) {
  if (game.missionActive || game.sideJob) return false;
  const target = pick(game.rng, SIDE_TARGETS);
  const place = game.city.places[target];
  if (dist(game.player.x, game.player.y, place.x, place.y) < 300) return false;
  const reward = 150 + Math.floor(game.rng() * 3) * 50;
  game.sideJob = { target, reward, startX: game.player.x, startY: game.player.y };
  game.toast('Side job: deliver a package to ' + place.name + '  ($' + reward + ')', 5);
  return true;
}

export function updateSideJob(game, dt) {
  if (!game.sideJob) return;
  const place = game.city.places[game.sideJob.target];
  if (dist(game.player.x, game.player.y, place.x, place.y) < 90) {
    game.cash += game.sideJob.reward;
    game.sfx.cash();
    game.toast('Side job done  +$' + game.sideJob.reward, 4);
    game.sideJob = null;
    game.autosave();
  }
}
