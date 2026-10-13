"""Music edit: section A (8 bars) -> section C (8 bars + ring-out), 135 BPM.
Source sections repeat every 8 bars (14.222 s); splicing on the bar line A->C
is musically identical to the original A->B transition."""
import sys, numpy as np, soundfile as sf

src, dst = sys.argv[1], sys.argv[2]
SRC_OFF = 110.0                   # seg48.wav starts at 1:50.000 of the upload
y, sr = sf.read(src)
P = 60 / 135                      # beat length
B0 = 123.338                      # grid beat 0 (track start)
PR = 0.30                         # black pre-roll before music
A_START = 123.15                  # include swell into first hit
A_END = B0 + 32 * P - 0.012       # just before bar 8 transient
C_START = B0 + 64 * P - 0.012     # just before bar 16 transient
END_ORIG = 168.70
XF = 0.010                        # splice crossfade
FADE_IN, FADE_OUT = 0.04, 1.10

def cut(a, b):
    return y[int((a - SRC_OFF) * sr):int((b - SRC_OFF) * sr)].copy()

a = cut(A_START, A_END + XF)
c = cut(C_START, END_ORIG)
n = int(XF * sr)
w = np.linspace(0, np.pi / 2, n)[:, None]
a[-n:] = a[-n:] * np.cos(w) + c[:n] * np.sin(w)
music = np.concatenate([a, c[n:]])
fi = int(FADE_IN * sr); music[:fi] *= np.linspace(0, 1, fi)[:, None]
fo = int(FADE_OUT * sr); music[-fo:] *= (np.cos(np.linspace(0, np.pi, fo)) * .5 + .5)[:, None] ** 1.5
lead = int(round((PR - (B0 - A_START)) * sr))   # music starts slightly after t=0
out = np.concatenate([np.zeros((lead, 2)), music, np.zeros((int(0.2 * sr), 2))])
sf.write(dst, out.astype(np.float32), sr, subtype='FLOAT')
te_a = lambda o: o - B0 + PR
te_c = lambda o: o - (B0 + 64 * P) + PR + 32 * P
print(f'length {len(out)/sr:.3f}s  splice at {te_a(A_END):.3f}s  first boom {te_a(123.556):.3f}  C boom {te_c(152.0):.3f}  end stop {te_c(166.45):.3f}')
