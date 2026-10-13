"""Download CC0 photo-scanned PBR textures from Poly Haven (polyhaven.com, CC0 — no attribution required).
Albedo + OpenGL normal at 2K, height (displacement) at 1K."""
import json, os, sys, urllib.request

MATERIALS = {
    'bark':   'jolcham_oak_bark_01',   # fissured, mossy oak bark — forest trunks
    'leaves': 'forest_leaves_04',      # leaf litter + twigs — forest floor
    'mud':    'mud_forest',            # trodden path
    'blocks': 'medieval_blocks_06',    # fortress stone blocks — the gate
    'rock':   'dark_rock_02',          # fissured dark rock — cliff, beast hide, the abyss
    'cliff':  'rock_face_03',          # weathered rock face — cliff around the gate
}
MAPS = {'diff': ('Diffuse', '2k'), 'nor': ('nor_gl', '2k'), 'disp': ('Displacement', '1k')}
root = os.path.join(os.path.dirname(__file__), '..', 'assets', 'tex')
UA = {'User-Agent': 'selva-oscura-teaser/1.0 (asset fetch)'}
def get(url): return urllib.request.urlopen(urllib.request.Request(url, headers=UA))
for key, asset in MATERIALS.items():
    files = json.load(get(f'https://api.polyhaven.com/files/{asset}'))
    os.makedirs(os.path.join(root, key), exist_ok=True)
    for m, (ph, res) in MAPS.items():
        url = files[ph][res]['jpg']['url']
        out = os.path.join(root, key, f'{m}.jpg')
        if not os.path.exists(out):
            with open(out, 'wb') as fh: fh.write(get(url).read())
        print(f'{key:7s} {m:5s} {os.path.getsize(out) / 1e6:5.1f} MB  <- {asset}')
