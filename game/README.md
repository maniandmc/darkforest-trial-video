# SELVA OSCURA — *Dite* (boss-fight game)

A one-boss, third-person action game in the browser: you, the lantern-bearing wanderer, against **Dite, Colossus of the
Ninth Circle** — the horned basalt demon from the SELVA OSCURA trailer. Three.js r185 (vendored) + vanilla ES modules,
no build step, no external assets beyond the CC0 textures and OFL fonts in `assets/`.

## Run
Browsers block ES modules and WebGL textures loaded from `file://`, so serve the folder with any static server:

```
cd game
python3 -m http.server 8000      # then open http://localhost:8000
```

## Controls
| | |
|---|---|
| WASD | move |
| Mouse | camera (click *Enter the Abyss* to capture the mouse) |
| Left click / Right click | light attack (3-hit chain) / heavy attack (charged, staggers faster) |
| Space | roll — invincible for ~0.4 s |
| Shift | sprint |
| E | drink a flask (3 per fight; you move slowly while drinking) |
| Q (or middle click / Tab) | lock on |
| Esc | pause (restart, quality, title) · O cycles quality in-fight |

## The fight
- **Phase 1 (100–60 %)** — overhead slam (+ shock ring), sweeping backhand, charge, stomp (punishes standing underneath).
- **Phase 2 (60–25 %)** — opens with a roar that throws you back; adds the lava call (pools telegraphed for ~1.2 s,
  erupt, then keep burning) and a 3-hit combo (hook, hook, two-handed slam).
- **Phase 3 (< 25 %)** — the seams blaze, everything is ~20 % faster (wind-ups never drop below 0.5 s), and the
  **fire nova**: a 1.6 s charge with its danger circle drawn on the floor, then an expanding ring of fire you must roll
  *through* (rolling away lets it catch you after your i-frames).
- Poise: sustained hits (heavies count triple) break it — Dite drops to a knee, head in reach, taking +35 % damage.

## Under the hood
- `js/boss.js` — procedural rig: two-bone IK arms and legs; attacks are pose keyframes with hand targets in cylindrical
  coordinates, so swings arc naturally; hit boxes are the real fist/forearm/body capsules, swept frame to frame.
- `js/player.js`, `js/playermodel.js` — controller (stamina, input buffer, chain/roll cancels, i-frames, flasks) and the
  layered cloak / lantern / longsword model.
- `js/materials.js` — MeshStandardMaterial patched with triplanar photo-scan rock in each mesh's own object space (so
  textures stick to moving limbs) and 3D-Voronoi plate seams carrying animated magma.
- `js/fx.js`, `js/post.js` — GPU particles, ground rings, lava/nova decals, blade trail; HDR + MSAA, bloom, grade.
- `js/audio.js` — every sound is synthesised with Web Audio (no samples), including the 135 BPM combat drums that
  intensify by phase; the same recipes render offline for recorded footage.
- Quality presets (High / Medium / Low) scale resolution, shadows, bloom and particles; the choice is remembered.

## Testing (headless Chromium via Playwright)
- `tools/balance.js [runs] [skills]` — whole fights played by a bot that reacts to wind-ups with a human-like delay and
  a chance to miss. 24 seeded fights at 90 % dodge skill: 15 wins, wins take 2.5–4.3 min; standing still dies in < 30 s.
- `tools/capture.js`, `tools/ui_shots.js`, `tools/beauty.js` — labelled screenshots of attacks, menus, look-dev.
- `tools/record.js` + `tools/cut.py` — deterministic bot replay rendered to a highlight video with offline audio.

## Credits
Textures: Poly Haven (CC0). Fonts: Cinzel, Cinzel Decorative, Cormorant Garamond (SIL OFL). Three.js (MIT).
