# SELVA OSCURA — 30s teaser (motion design piece)

A fictional dark-fantasy AAA game teaser, built entirely in code: every frame is rendered
procedurally (GLSL raymarching / 2D SDF shaders + Canvas2D typography) in headless Chromium,
then encoded with ffmpeg. No stock footage, no pre-made assets — only the music and two
open-license typefaces (Cinzel, Cormorant Garamond — SIL OFL, via Google Fonts). v3 adds CC0 photo-scanned
PBR textures from Poly Haven.

Concept: Dante's *Inferno*, Canto I — *"Nel mezzo del cammin di nostra vita / mi ritrovai per una
selva oscura"* (a dark forest). The teaser goes from the cold, misty forest (Act I) through the
Gate of Hell and its inscription *"Lasciate ogne speranza, voi ch'intrate"*, down the nine
circles (one circle per beat), to the beast, and lands the title on the final hit.

## Cuts
- **v1** (`engine/index.html`, `engine/shots.js`) — cinematic third-person teaser.
- **v2 — first-person cut** (`engine/index_v2.html`, `engine/shots_v2.js`) — same music and beat grid, with
  first-person beats interleaved: walking the path with a lantern that really lights the trees, a look back
  while running from the eyes, reading the inscription by lantern-light, the lantern slipping from your hand
  into the abyss, your sword igniting and slashing across the beast. The FP layer is `engine/viewmodel.js`
  (a screen-space SDF viewmodel: gloved hand + lantern, gauntlet + sword with fire trail, reaching hand,
  motion-blurred branches) driven by head-bob camera rigs.
- **v3 — photoreal third-person** (`engine/index_v3.html`, `engine/shots_v3.js`) — v2's cut with every
  third-person shot rebuilt for realism:
  - `scenes/forest_pr.js` — photo-scanned bark / leaf-litter / mud materials with normal + height maps, bark
    displacement on silhouettes, moonlight soft shadows dappled by the canopy, lantern soft shadows, AO, fallen logs,
    cloth folds.
  - `scenes/gate3d.js` — the Gate of Hell as a 3D set: rough cliff, carved facade, gothic portal with receding
    archivolts and columns, inscription panel, steps, two 17 m hooded guardian statues; portal key light with soft
    shadows, glow spill, raking moon key, volumetric haze, god rays out of the portal.
  - `scenes/beast3d.js` — a 3D demon bust (horned skull, sockets with slit embers, dropping jaw with fangs,
    shoulders with spikes) in a fissured rock hide whose real crevices (height map) glow with lava; fire key light
    from below with soft shadows, fire-wall rim, foreground flames, a 3D hooded hero with a flaming sword.
  - Thin-lens depth of field (`POST.dof`, scenes write view depth into alpha) for focus-pulled shots.
  - Materials: CC0 photo-scans from [Poly Haven](https://polyhaven.com) (`tools/fetch_assets.py`, `assets/tex/`).

- **v4 — rendered from the game's own 3D models** (`game/trailer.html`, `game/js/trailer/`) — the whole teaser re-shot
  in Three.js with the real meshes, rig and combat of the game instead of raymarched stand-ins; same music, beat grid
  and typography as v1–v3 (v3's `type.js` / `texts.js` are loaded as-is and composited as an overlay):
  - Sets: `forest.js` (flared, buttressed trunks in two levels of detail, a foliage canopy the moon shines through,
    leaf litter and a trodden mud path, ferns, rocks, logs), `gate.js` (cliff, carved facade with a pointed portal
    whose archivolts recede in steps, jamb colonnettes, an inscription that burns letter by letter, stairs, fire down
    the passage, two 17 m guardians carved from the wanderer's own model), `descent.js` (nine terraced circles with
    smouldering lips, the ninth of ice), and the game's arena.
  - `pipeline.js` — offline render pipeline: HDR + MSAA scene, the key light's depth from its side, **volumetric fog**
    (a jittered half-res march in-scattering the key light wherever its depth map lets it through — moon shafts cut by
    the trunks; at the gate the key sits behind the cliff, so light pours out of the door only), the lantern's halo
    in closed form, depth of field, v3's overlay layer (typography with its effects, screen-space embers / ash / dust,
    zoom blur, flashes), bloom, grade, letterbox.
  - `puppet.js` — directs the game's wanderer (the same procedural animator) along paths, with trailer-only poses:
    a wary walk, the lantern lifted into the dark, the tumble through the pit; the lantern hangs from the left fist,
    lights and shadows the set, and slips away in the fall. Close-up build: smoother cloak and hood, cloth sheen,
    rim light, a dressed lantern.
  - `stage.js` — the fight shots run the game's real Player / Boss / Combat / FX, wired by borrowing
    `Game.prototype.wire` (sparks, shock rings, lava pools, the nova, hit-stop, shake). `shots.js` scripts them on the
    beat: the slam lands on bar 13, the nova blasts on ABANDON.
  - Render: `python3 -m http.server 8766` from the repo root, then `node game/tools/trailer.js <outDir> [f0] [f1]`
    (`tools/trailer_look.js` for look-dev stills). About 3–7 s per 1080p frame in software WebGL.
  - `out/SELVA_OSCURA_v4_1080p.mp4` (+ `_web`), `out/SELVA_OSCURA_v4_keyframes.jpg`; the earlier forest-only test is
    `out/SELVA_OSCURA_v4_forest_test.mp4`.

## The game (`game/`)
**Dite** — a playable browser boss fight against the trailer's colossus (Three.js, no build step): title → skippable
intro → three-phase fight → result/retry. See [`game/README.md`](game/README.md); run with
`cd game && python3 -m http.server 8000`. Highlight reel (bot-played, 56 s): `out/DITE_gameplay_highlight_web.mp4`.

## Music edit
Source: the uploaded track, 2:03.3–2:48 (135 BPM). The cue is three near-identical 8-bar
phrases (A/B/C) plus a final hit. The edit keeps phrase **A** and splices straight into
phrase **C** on the bar line (musically identical to the original A→B join), giving
16 bars + ring-out ≈ 31 s. True downbeats sit an 8th-note after the beat tracker's grid
(first boom at 0.522 s), so every cut and slam is placed on `bar(n, beat)` from that grid.

- `tools/edit_audio.py` — the splice (10 ms equal-power crossfade, 0.3 s pre-roll)
- `tools/accents.py` — onset/accent map + per-frame audio envelopes (drive camera shake)

## Engine (`engine/`)
- `scenes/` — forest (raymarched, volumetric canopy shafts, wanderer + lantern), eye, gate,
  descent (analytic self-similar funnel of terraces), beast/confrontation, title backdrop
- `post.js` — transitions (burn dissolve, slash split, glitch, iris), light shafts, particles
  (embers/ash/dust), type effects (glitch, burn-dissolve, bevelled metal), bloom, anamorphic
  streak, lens dirt, ACES + split-tone grade, CA, grain, animated letterbox
- `type.js` / `texts.js` — per-letter typography and the nine-rings sigil motif
- `shots.js` — the storyboard; `timeline.js` — beat grid, easing, evaluation

## Render
```bash
node tools/render.js out/frames 1 30 0 1        # <dir> <scale> <fps> <worker> <workers>
PAGE=index_v2.html node tools/render.js out/frames_v2 1 30 0 1   # first-person cut
PAGE=index_v3.html node tools/render.js out/frames_v3 1 30 0 1   # photoreal third-person (needs assets/tex)
tools/encode.sh out/frames out/SELVA_OSCURA_teaser.mp4
node tools/preview.js /tmp/pv 0.5 1.0,7.9,29.6  # look-dev stills
```

## Output (`out/`)
- `SELVA_OSCURA_teaser_1080p.mp4` — master, 1920×1080, 30 fps, H.264 ~30 Mbps, AAC 320k, 31.4 s
- `SELVA_OSCURA_teaser_1080p_web.mp4` — web/portfolio upload, ~10 Mbps
- `SELVA_OSCURA_keyframes.jpg`, `SELVA_OSCURA_poster.jpg` — stills for the portfolio page
- `SELVA_OSCURA_v2_FP_*` — the first-person cut (same set of encodes + keyframes)
- `SELVA_OSCURA_v3_*` — the photoreal third-person cut
