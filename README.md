[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/c/gta6-01)
[![rank](https://make.fun/badge/gta6-01/mikeykun477/gta6-01-r3/rank.svg)](https://make.fun/c/gta6-01)
[![reward](https://make.fun/badge/gta6-01/mikeykun477/gta6-01-r3/reward.svg)](https://make.fun/c/gta6-01)

# VELORIA — Streets of the Neon Tide

An original open-world crime game in the spirit of GTA 6, built from scratch for the
[make.fun GTA 6 bounty](https://make.fun/c/gta6-01). No Rockstar names, maps, art or assets —
everything here is invented: the city, the story, the characters, the code.

## The pitch

Ten years ago Jax Corvo drove the getaway car for the biggest score Veloria ever saw — then
vanished. Now he is back, broke, and Mama Odette owns his debt. **One city. Six jobs. A
syndicate that does not forgive.** Steal cars, outrun the Veloria PD, and take the streets
back, one mission at a time.

This is not a driving demo or a walking demo — it is the whole genre, wired together and
playable end to end:

- **A living city to explore** — a 3,600 × 3,600 procedural coastal city: 9 × 9 road grid,
  ~155 buildings, a park, a beach with animated surf, a container port, street lamps,
  crosswalks and a full day/night cycle.
- **On foot and by car** — walk, run, aim and shoot with the mouse; jump in any parked car
  or steal one from traffic (the driver flees — and the law may notice).
- **Traffic and pedestrians** — cars cruise the grid, turn at intersections and queue up
  behind you; pedestrians stroll the sidewalks and run for their lives when shots ring out.
- **Wanted system and police** — 5 stars, a police director that spawns cruisers to match
  your heat, ramming pursuits, flashing light bars, sirens, and getting **BUSTED** if a
  cruiser pins you on foot. Lay low and the heat cools off.
- **Missions and a story** — six story missions with dialogue, objectives and a minimap
  beacon: a pickup at the marina, stealing the Comet GT from the Tide Syndicate depot,
  a hotel shootout, a getaway with the law already circling, and a final stand at the port.
  Plus repeatable courier side-jobs for cash.
- **Combat** — pistol with reloads, enemy gang members who shoot back, blood, sparks,
  skid marks, screen shake and a full synthesized soundscape (engine, sirens, gunshots —
  all generated live with WebAudio, zero audio files).
- **HUD and minimap** — health, cash, ammo, wanted stars, mission tracker with distance,
  speedometer, live minimap with police and objective blips, toasts and dialogue boxes.
- **Start, pause, game over and save** — title screen with the story, pause menu with
  save, busted/wasted screens with a price to pay, and autosave + continue via localStorage.

## Play it

Serve the `game/` folder with any static server and open `game/index.html` — no build step,
no network request at runtime, keyboard + mouse on desktop:

```sh
python3 -m http.server 8000   # then open http://localhost:8000/game/
```

| Key | Action |
| --- | ------ |
| WASD / Arrows | Move on foot / drive |
| Mouse + Click | Aim / shoot |
| E | Enter, steal or exit a car |
| R | Reload pistol |
| M | Start the next story mission |
| Q | Courier side job |
| P / Esc | Pause · N: mute |

**Self-test:** open `game/index.html?selftest=1` — twelve headless checks (city
generation, missions, wanted system, save/load) print PASS/FAIL on screen.

**Screenshots:** `screenshots/` holds four real renders of the game — title screen, free
roam, a 3-star police chase, and the "Hot Wheels" car-theft mission.

## Structure

```
game/
  index.html          title / pause / game-over overlays
  src/
    main.js           game loop, state machine, wanted director, combat, car theft
    city.js           procedural Veloria: roads, blocks, buildings, park, beach, port
    entities.js       traffic AI, police pursuit, pedestrians, enemies, bullets
    missions.js       six-mission story + courier side-jobs
    render.js         camera, world drawing, particles, day/night
    hud.js            HUD, minimap, toasts, dialogue
    audio.js          synthesized WebAudio SFX (no audio files)
    save.js           localStorage save / load
    selftest.js       headless ?selftest=1 checks
    util.js           seeded RNG + math helpers
screenshots/          4 real gameplay renders (JPEG, ≤256 KiB each)
main.ts               make.fun program: hands game/ + screenshots/ to /output
vendor/makefun-game.ts  kit library, unchanged
```

## License

MIT — see [LICENSE](LICENSE). Built for [make.fun](https://make.fun/c/gta6-01).
