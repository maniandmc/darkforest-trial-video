# SELVA OSCURA — 30s teaser (motion design piece)

A fictional dark-fantasy AAA game teaser, built entirely in code: every frame is rendered
procedurally (GLSL raymarching / 2D SDF shaders + Canvas2D typography) in headless Chromium,
then encoded with ffmpeg. No stock footage, no pre-made assets — only the music and two
open-license typefaces (Cinzel, Cormorant Garamond — SIL OFL, via Google Fonts).

Concept: Dante's *Inferno*, Canto I — *"Nel mezzo del cammin di nostra vita / mi ritrovai per una
selva oscura"* (a dark forest). The teaser goes from the cold, misty forest (Act I) through the
Gate of Hell and its inscription *"Lasciate ogne speranza, voi ch'intrate"*, down the nine
circles (one circle per beat), to the beast, and lands the title on the final hit.

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
tools/encode.sh out/frames out/SELVA_OSCURA_teaser.mp4
node tools/preview.js /tmp/pv 0.5 1.0,7.9,29.6  # look-dev stills
```

## Output (`out/`)
- `SELVA_OSCURA_teaser_1080p.mp4` — master, 1920×1080, 30 fps, H.264 ~30 Mbps, AAC 320k, 31.4 s
- `SELVA_OSCURA_teaser_1080p_web.mp4` — web/portfolio upload, ~10 Mbps
- `SELVA_OSCURA_keyframes.jpg`, `SELVA_OSCURA_poster.jpg` — stills for the portfolio page
