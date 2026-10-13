"""Accent map of the edited music -> engine/audio_data.js
Per-frame envelopes (120 Hz) + 16th-note slot scores for designing cuts."""
import sys, json, numpy as np, soundfile as sf, librosa

y, sr = sf.read(sys.argv[1]); y = y.mean(1)
P = 60 / 135; PR = 0.30
hop = 200                                      # 240 Hz analysis
S = np.abs(librosa.stft(y, n_fft=2048, hop_length=hop))
f = librosa.fft_frequencies(sr=sr, n_fft=2048)
t = librosa.frames_to_time(np.arange(S.shape[1]), sr=sr, hop_length=hop)
def band(lo, hi): return S[(f >= lo) & (f < hi)].sum(0) + 1e-6
def onset(e):
    le = 20 * np.log10(e); d = np.diff(le, prepend=le[0]); return np.clip(d, 0, None)
rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=hop)[0]
rdb = 20 * np.log10(rms + 1e-9)
low, high, full = onset(band(20, 160)), onset(band(3000, 12000)), onset(band(20, 12000))

def slot_scores(tt):
    m_pre = (t >= tt - 0.07) & (t < tt - 0.01)
    m_post = (t >= tt) & (t < tt + 0.09)
    m_on = (t >= tt - 0.02) & (t < tt + 0.05)
    jump = rdb[m_post].mean() - rdb[m_pre].mean()
    return jump, low[m_on].max(), high[m_on].max(), rdb[m_post].mean()

rows = []
for k in range(0, 66 * 4):
    tt = PR + k * P / 4
    if tt > t[-1] - 0.2: break
    j, l, h, lv = slot_scores(tt)
    rows.append(dict(k=k, t=round(tt, 4), bar=k // 16, s16=k % 16, jump=j, low=l, high=h, lvl=lv))
J = np.array([r['jump'] for r in rows]); L = np.array([r['low'] for r in rows]); H = np.array([r['high'] for r in rows])
for r in rows:
    r['boom'] = float(max(0, r['jump']) / np.quantile(J, .97) * .6 + r['low'] / np.quantile(L, .97) * .4)
chars = ' .:-=+*#%@'
print('boom map (rows = bars, 16ths; edited time)')
for b in range(17):
    rr = [r for r in rows if r['bar'] == b]
    if not rr: break
    s = ''.join(chars[min(9, int(r['boom'] * 9))] for r in rr)
    s = s.ljust(16)
    print(f"bar{b:2d} t={PR + b*4*P:6.3f} |{s[:4]}|{s[4:8]}|{s[8:12]}|{s[12:16]}|  lvl {np.mean([r['lvl'] for r in rr]):6.1f}")
top = sorted(rows, key=lambda r: -r['boom'])[:40]
print('top accents:')
for r in sorted(top, key=lambda r: r['t']):
    print(f"  t={r['t']:7.3f} bar{r['bar']:2d}.{r['s16']:2d} boom={r['boom']:.2f} jump={r['jump']:5.1f} low={r['low']:5.1f} high={r['high']:5.1f}")

# envelopes for the engine (120 fps), normalised
fps = 120; n = int(t[-1] * fps)
tq = np.arange(n) / fps
def env(x, decay):
    x = np.interp(tq, t, x); x = x / np.quantile(x, .995); out = np.zeros_like(x); v = 0
    for i, xi in enumerate(x):
        v = max(xi, v * np.exp(-1 / (fps * decay))); out[i] = v
    return np.clip(out, 0, 1.5)
lvl = np.interp(tq, t, rdb); lvl = np.clip((lvl + 40) / 32, 0, 1)
data = dict(fps=fps, bpm=135, pr=PR, low=np.round(env(low, .12), 3).tolist(),
            high=np.round(env(high, .07), 3).tolist(), lvl=np.round(lvl, 3).tolist(),
            slots=[dict(t=r['t'], boom=round(r['boom'], 3)) for r in rows])
open(sys.argv[2], 'w').write('window.AUDIO=' + json.dumps(data, separators=(',', ':')) + ';')
