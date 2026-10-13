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

## Two cuts
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
