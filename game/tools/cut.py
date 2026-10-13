"""Assemble the recorded highlight: dip-to-black between cuts, slice the session audio to the same windows with short
crossfades, encode H.264/AAC.   python3 tools/cut.py <recDir> <out.mp4> [crf]"""
import json, os, subprocess, sys, tempfile
import numpy as np, soundfile as sf
from PIL import Image, ImageEnhance

rec, out = sys.argv[1], sys.argv[2]
crf = sys.argv[3] if len(sys.argv) > 3 else '20'
plan = json.load(open(os.path.join(rec, 'plan.json')))
fps, wins = plan['fps'], plan['windows']
frames_dir = os.path.join(rec, 'frames')
frames = sorted(f for f in os.listdir(frames_dir) if f.endswith('.jpg'))

# frame counts per window, in the same order the recorder rendered them
counts, total = [], 0
for a, b in wins:
    n = sum(1 for f in range(plan['frames']) if a <= f / fps < b)
    counts.append(n); total += n
assert total == len(frames), (total, len(frames))

tmp = tempfile.mkdtemp(prefix='cut_', dir=rec)
k, FADE = 0, 5
for wi, n in enumerate(counts):
    for j in range(n):
        im = Image.open(os.path.join(frames_dir, frames[k]))
        dip = 1.0
        if wi > 0 and j < FADE: dip = min(dip, (j + 1) / (FADE + 1))
        if wi < len(counts) - 1 and j >= n - FADE: dip = min(dip, (n - j) / (FADE + 1))
        if wi == len(counts) - 1 and j >= n - 20: dip = min(dip, (n - j) / 21)        # fade out at the very end
        if dip < 1: im = ImageEnhance.Brightness(im).enhance(dip)
        im.save(os.path.join(tmp, f'c_{k:05d}.jpg'), quality=93)
        k += 1

audio, sr = sf.read(os.path.join(rec, 'session.wav'))
parts, X = [], int(0.06 * sr)
for wi, (a, b) in enumerate(wins):
    n = counts[wi]
    f0 = next(f for f in range(plan['frames']) if a <= f / fps < b)
    s0 = int(f0 / fps * sr); seg = audio[s0:s0 + int(n / fps * sr)].copy()
    if len(seg) < int(n / fps * sr): seg = np.pad(seg, ((0, int(n / fps * sr) - len(seg)), (0, 0)))
    ramp = np.linspace(0, 1, X)[:, None]
    if wi > 0: seg[:X] *= ramp
    if wi < len(wins) - 1: seg[-X:] *= ramp[::-1]
    else: seg[-int(0.7 * sr):] *= np.linspace(1, 0, int(0.7 * sr))[:, None]
    parts.append(seg)
mix = np.concatenate(parts)
peak = np.abs(mix).max()
if peak > 0.98: mix *= 0.98 / peak
wav = os.path.join(tmp, 'audio.wav'); sf.write(wav, mix, sr)

subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', str(fps), '-i', os.path.join(tmp, 'c_%05d.jpg'), '-i', wav,
                '-c:v', 'libx264', '-preset', 'slow', '-crf', crf, '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k',
                '-shortest', '-movflags', '+faststart', out], check=True)
print(f'{out}: {k} frames, {k / fps:.1f} s, {os.path.getsize(out) / 1e6:.1f} MB')
