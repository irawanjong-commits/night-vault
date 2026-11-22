# Night Vault

[![make.fun · best-heist-game-20261122-0559](https://make.fun/badge/best-heist-game-20261122-0559.svg)](https://make.fun/bounty/best-heist-game-20261122-0559?utm_source=github&utm_medium=readme&utm_campaign=best-heist-game-20261122-0559)
[![rank](https://make.fun/badge/best-heist-game-20261122-0559/irawanjong-commits/night-vault/rank.svg)](https://make.fun/bounty/best-heist-game-20261122-0559/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-heist-game-20261122-0559)

**Night Vault** is an original top-down 2D stealth heist game in vanilla JavaScript
(HTML canvas, no libraries, no network). One thief, one museum at night: cross eight
connected rooms, stay out of guard and camera vision cones, dodge or disable laser
tripwires, steal 13 pieces of loot, hold-to-crack the vault for the $25,000 prize,
and reach the getaway van before lockdown.

## Features
- Large scrolling level (2560x1440) with camera follow and eight named rooms
- Six patrolling guards with line-of-sight vision cones; five sweeping security cameras
- Alarm meter that rises when spotted / tripping lasers, decays while hidden; full alarm starts a 30-second lockdown countdown and speeds guards up
- Control panels that disable cameras for 20 seconds or switch off laser groups
- Hold-E vault-cracking mini-game, loot scoring, time bonus and a $5,000 ghost bonus for a never-detected run
- Title, how-to-play, pause, game-over and victory screens; synthesized WebAudio sound effects (no audio files)
- Deterministic runs via `?seed=N`, and `?shot=cover|play|end` fixed scenes for screenshots

## Controls
- **WASD / Arrow keys** - move
- **Shift** - sneak (slower, shorter detection range)
- **E** - interact: use panels, hold at the vault to crack it
- **P / Esc** - pause

## How to run
Serve the `game/` folder with any static server and open it in a desktop browser:

```sh
cd game && python3 -m http.server 8080
# open http://localhost:8080
```

## Entry layout
- `main.ts` - program/v1 entrypoint: validates and ships `game/` + `screenshots/`, writes `manifest.json` and `dossier.json`
- `game/` - the game itself (`index.html` + ES modules under `src/`)
- `screenshots/` - cover / play / end captures at 1280x720

Licensed under MIT - see `LICENSE`.
