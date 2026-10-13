"""Tile preview PNGs into a labelled contact sheet.  python3 contact.py <dir> <out.png> <cols>"""
import sys, glob, os
from PIL import Image, ImageDraw
d, out, cols = sys.argv[1], sys.argv[2], int(sys.argv[3])
files = sorted(glob.glob(os.path.join(d, 't_*.png')), key=lambda f: float(os.path.basename(f)[2:-4]))
ims = [Image.open(f).convert('RGB') for f in files]
w, h = ims[0].size
crop = (0, int(h * 0.128), w, int(h * 0.872))
cw, ch = crop[2] - crop[0], crop[3] - crop[1]
rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (cols * cw, rows * (ch + 2)), (40, 40, 40))
dr = ImageDraw.Draw(sheet)
for i, (im, f) in enumerate(zip(ims, files)):
    x, y = (i % cols) * cw, (i // cols) * (ch + 2)
    sheet.paste(im.crop(crop), (x, y))
    dr.text((x + 4, y + 2), os.path.basename(f)[2:-4], fill=(255, 255, 0))
sheet.save(out)
print(len(ims), 'frames ->', out, sheet.size)
