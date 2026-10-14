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
| Left click / Right click | light attack (3-hit chain: diagonal cut → rising backhand → spinning slash) / heavy attack (two-handed leaping slam, staggers faster) |
| Space | roll — invincible for ~0.4 s |
| Shift | sprint |
| E | drink a flask (3 per fight; you move slowly while drinking) |
| Q (or middle click / Tab) | lock on |
| Esc | pause (restart, quality, title) · O cycles quality in-fight |

**Phones and tablets** (detected automatically; `?touch` forces it) — hold the phone in landscape:

| | |
|---|---|
| Left side of the screen | floating stick: drag to move, push past its rim to sprint |
| Right side of the screen | drag to turn the camera (when not locked on) |
| Buttons, bottom right | attack · heavy · roll · flask (with the count) · lock-on (on by default) |
| Top right | pause |

Quality on touch screens is a choice between **PC 원본** (the PC High preset, untouched) and **모바일 저사양**:
CSS-pixel resolution that drops by itself (down to 55 %) while frames run long, no bloom or shadows, the rock shader
without normal maps and macro layer, one flash light. On an emulated phone screen (844×390, DPR 3) it costs about a
sixth of PC 원본 per frame in software rendering — real-device frame rates still need measuring on the device.

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
  layered cloak / lantern / longsword model, rigged with hips, chest, head, elbows, wrists and legs.
- `js/playeranim.js` — procedural animation: every state is a pose of ~26 joint channels (keyframe tracks with
  Catmull-Rom tangents; swings ease body first, arm next, wrist last), blended inertially between states, then layered
  with springs (lean into acceleration and turns), a stride cycle with two-bone leg IK, off-hand IK (two-handed grip,
  drinking), a cloth pass (cloak skinned to hips + chest; the hem trails, hangs, flares on spins and makes room for the
  legs) and world-space pendulums for the lantern and sash. Only the sword's position feeds back into gameplay.
- `js/materials.js` — MeshStandardMaterial patched with triplanar photo-scan rock in each mesh's own object space (so
  textures stick to moving limbs) and 3D-Voronoi plate seams carrying animated magma.
- `js/fx.js`, `js/post.js` — GPU particles, ground rings, lava/nova decals, blade trail; HDR + MSAA, bloom, grade.
- `js/audio.js` — every sound is synthesised with Web Audio (no samples), including the 135 BPM combat drums that
  intensify by phase; the same recipes render offline for recorded footage.
- Quality presets (High / Medium / Low, Mobile) scale resolution, shadows, bloom and particles; the choice is remembered.
- `js/touch.js`, `touch.css` — touch controls (they feed the same per-frame action snapshot as keyboard and mouse),
  the HUD laid out around the thumbs, compact menus for short screens, a rotate-to-landscape prompt.

## Testing (headless Chromium via Playwright)
- `tools/balance.js [runs] [skills]` — whole fights played by a bot that reacts to wind-ups with a human-like delay and
  a chance to miss. 72 seeded fights at 60 / 75 / 90 % dodge skill: 37 wins, median win 3.4 min; standing still dies in < 30 s.
  (The animated swings connect more often than the old rigid ones, so light-chain damage was rebalanced per step to keep
  the fight as hard as before.)
- `tools/capture.js`, `tools/ui_shots.js`, `tools/beauty.js` — labelled screenshots of attacks, menus, look-dev.
- `tools/touch_test.js` — the touch controls on an emulated phone: stick, sprint, two-finger attack, every button,
  camera drag, pause and quality switch, portrait prompt (15 checks + screenshots).
- `tools/poses.js` (key-pose sheets, clay-shaded, three views) and `tools/motion.js` + `tools/motion_sheet.py` (the
  wanderer's whole move list filmed close up → contact sheets / video) — for working on the animation.
- `tools/record.js` + `tools/cut.py` — deterministic bot replay rendered to a highlight video with offline audio.

## Credits
Textures: Poly Haven (CC0). Fonts: Cinzel, Cinzel Decorative, Cormorant Garamond (SIL OFL). Three.js (MIT).
