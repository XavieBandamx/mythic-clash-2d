# Recorta objetos sobre fondo verde (#00FF00) por figura conectada y los guarda en WebP con transparencia.
# Uso: python cut_props.py <hoja> <prefijo_salida> <escala>
import sys
from collections import deque
import numpy as np
from PIL import Image

src, prefix, scale = sys.argv[1], sys.argv[2], float(sys.argv[3])
a = np.asarray(Image.open(src).convert('RGB')).astype(np.float32)
R, G, B = a[..., 0], a[..., 1], a[..., 2]
spill = G - np.maximum(R, B)
# Alfa: verde puro = 0; contorno con algo de verde = semitransparente
alpha = np.clip((140 - spill) / 80, 0, 1)
fg = alpha > 0.5

# Componentes en una rejilla de 4 px (sin scipy)
S = 4
h, w = fg.shape
gh, gw = h // S, w // S
grid = fg[:gh * S, :gw * S].reshape(gh, S, gw, S).any(axis=(1, 3))
lab = np.zeros((gh, gw), np.int32)
comps = []
for sy, sx in zip(*np.nonzero(grid)):
    if lab[sy, sx]:
        continue
    n = len(comps) + 1
    lab[sy, sx] = n
    q = deque([(sy, sx)])
    cells = []
    while q:
        y, x = q.popleft()
        cells.append((y, x))
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                ny, nx = y + dy, x + dx
                if 0 <= ny < gh and 0 <= nx < gw and grid[ny, nx] and not lab[ny, nx]:
                    lab[ny, nx] = n
                    q.append((ny, nx))
    ys = [c[0] for c in cells]
    xs = [c[1] for c in cells]
    comps.append(dict(id=n, size=len(cells), x0=min(xs), x1=max(xs), y0=min(ys), y1=max(ys)))

big = [c for c in comps if c['size'] >= 400]
small = [c for c in comps if c['size'] < 400]
# Chispas, pétalos y hojas sueltas se unen al objeto grande más cercano en horizontal
for c in small:
    cx = (c['x0'] + c['x1']) / 2
    best = min(big, key=lambda b: 0 if b['x0'] <= cx <= b['x1'] else min(abs(cx - b['x0']), abs(cx - b['x1'])))
    best.setdefault('extra', []).append(c['id'])
big.sort(key=lambda c: c['x0'])
print(src, 'objetos:', len(big), [(c['x0'] * S, c['x1'] * S, c['size']) for c in big])

# Quitar el verde del contorno
out = a.copy()
out[..., 1] = np.where(spill > 0, np.maximum(R, B) + np.minimum(spill, 0), G)
rgba = np.dstack([out, alpha * 255]).clip(0, 255).astype(np.uint8)

for i, c in enumerate(big):
    ids = [c['id']] + c.get('extra', [])
    m = np.isin(lab, ids)
    mask = np.zeros((h, w), bool)
    mask[:gh * S, :gw * S] = np.repeat(np.repeat(m, S, 0), S, 1)
    piece = rgba.copy()
    piece[~mask, 3] = 0
    ys, xs = np.nonzero(piece[..., 3] > 10)
    crop = Image.fromarray(piece[ys.min():ys.max() + 1, xs.min():xs.max() + 1], 'RGBA')
    crop = crop.resize((max(1, round(crop.width * scale)), max(1, round(crop.height * scale))), Image.LANCZOS)
    crop.save(f'{prefix}-{i}.webp', 'WEBP', quality=90, method=6)
    print(f'  {prefix}-{i}', crop.size)
