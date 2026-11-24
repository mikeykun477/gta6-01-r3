// save.js — localStorage save / load for Veloria.
// One slot; the save holds progress, cash, position and the story state.

const KEY = 'veloria-save-v1';

export function saveGame(game) {
  try {
    const data = {
      version: 1,
      cash: game.cash,
      health: game.player.health,
      ammo: game.player.ammo,
      missionIndex: game.missionIndex,
      missionsDone: game.missionsDone,
      wanted: 0,
      playerX: game.player.x,
      playerY: game.player.y,
      timeOfDay: game.timeOfDay,
      elapsed: game.elapsed,
      storyComplete: game.storyComplete,
      savedAt: Date.now(),
    };
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch (e) { return false; }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) return null;
    return data;
  } catch (e) { return null; }
}

export function hasSave() {
  return loadGame() !== null;
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch (e) {}
}

export function saveSummary() {
  const d = loadGame();
  if (!d) return null;
  return {
    cash: d.cash,
    missionsDone: d.missionsDone,
    savedAt: new Date(d.savedAt).toLocaleString(),
  };
}
