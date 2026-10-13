# SELVA OSCURA — *Dite* (boss-rush prototype)

A one-boss, third-person action game in the browser: the horned colossus from the SELVA OSCURA trailer.
Three.js (vendored, r185) + vanilla JS modules — no build step.

## Run
Browsers block ES modules and WebGL textures from `file://`, so serve the folder with any static server:

```
cd game
python3 -m http.server 8000      # then open http://localhost:8000
```

## Controls
| | |
|---|---|
| WASD | move |
| Mouse | camera (click the game to capture the mouse) |
| Left click / Right click | light attack (3-hit chain) / heavy attack |
| Space | roll (invincible frames) |
| Shift | sprint |
| E (or R) | drink a flask (3, slows you while drinking) |
| Q / middle click / Tab | lock on |

## Layout
- `js/game.js` — renderer, state flow, update order, hit feedback
- `js/player.js` — wanderer controller, stamina, attacks, roll, flasks
- `js/boss.js` — boss rig (two-bone IK), attack library, AI, poise/stagger, phases
- `js/combat.js` — swept capsule hit tests, ground shock rings
- `js/bot.js` — autoplay bot (balance tests / demo); `tools/` — headless test scripts (Playwright)

## Testing
`tools/balance.js` plays whole fights headless with bots of different dodge skill and prints win rates;
`tools/capture.js` screenshots labelled moments (wind-ups, impacts, stagger, end screen).
