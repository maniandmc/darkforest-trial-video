"""Contact sheets (one per move) and an mp4 from tools/motion.js output.
python3 tools/motion_sheet.py <dir> [cols=6] [step=1] [video.mp4]"""
import json, os, subprocess, sys
from PIL import Image, ImageDraw

d = sys.argv[1]
cols = int(sys.argv[2]) if len(sys.argv) > 2 else 6
step = int(sys.argv[3]) if len(sys.argv) > 3 else 1
video = sys.argv[4] if len(sys.argv) > 4 else None
meta = json.load(open(os.path.join(d, 'labels.json')))
frames = sorted(f for f in os.listdir(os.path.join(d, 'frames')) if f.endswith('.jpg'))
groups = {}
for i, lab in enumerate(meta['labels']): groups.setdefault(lab, []).append(i)
os.makedirs(os.path.join(d, 'sheets'), exist_ok=True)
for lab, idx in groups.items():
    idx = idx[::step]
    ims = [Image.open(os.path.join(d, 'frames', frames[i])) for i in idx]
    w, h = ims[0].size
    cw, ch = int(w * 0.6), int(h * 0.6)
    # crop to the middle so the figure is large
    cells = [im.crop(((w - cw) // 2, (h - ch) // 2, (w + cw) // 2, (h + ch) // 2)).resize((cw * 2 // 3, ch * 2 // 3)) for im in ims]
    cw, ch = cells[0].size
    rows = (len(cells) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * cw, rows * ch), (0, 0, 0))
    dr = ImageDraw.Draw(sheet)
    for j, c in enumerate(cells):
        x, y = (j % cols) * cw, (j // cols) * ch
        sheet.paste(c, (x, y))
        dr.text((x + 6, y + 4), f'{lab} {j * step / meta["fps"]:.2f}s', fill=(255, 220, 120))
    sheet.save(os.path.join(d, 'sheets', f'{lab}.jpg'), quality=85)
print('sheets:', ', '.join(groups))
if video:
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', str(meta['fps']), '-i', os.path.join(d, 'frames', 'm_%04d.jpg'),
                    '-c:v', 'libx264', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', video], check=True)
    print(video)
