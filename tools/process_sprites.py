"""Normaliza hojas de sprites irregulares (JPG con fondo liso) a PNG 4x4 con transparencia y pies alineados.

Uso:
  python process_sprites.py <dir_origen> <dir_salida>                    (las hojas de los dioses)
  python process_sprites.py <dir_origen> <dir_salida> id=archivo [...]  (hojas concretas, p. ej. monstruos)
  python process_sprites.py <dir_origen> <dir_salida> --cols=3 id=archivo [...]  (hojas de 3 columnas)
"""
import json
import os
import sys
from collections import deque

import numpy as np
from PIL import Image, ImageDraw

SRC, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)

FILES = {
    'amaterasu': 'Amaterasu.jpg',
    'anubis': 'Anubis.jpg',
    'hades': 'Hades.jpg',
    'huitzilopochtli': 'Huitzilopochtli.jpg',
    'mictlantecuhtli': 'MICTLANTECUHTLI.jpg',
    'osiris': 'Osiris.jpg',
    'poseidon': 'Poseidon.jpg',
    'quetzalcoatl': None,  # nombre con tilde: se busca abajo
    'ra': 'Ra.jpg',
    'raijin': 'Raijin.jpg',
    'susanoo': 'Susanoo.jpg',
    'zeus': 'Zeus.jpg',
}
ARGS = [a for a in sys.argv[3:] if not a.startswith('--cols=')]
SRC_COLS = next((int(a[7:]) for a in sys.argv[3:] if a.startswith('--cols=')), 4)
if ARGS:
    FILES = dict(arg.split('=', 1) for arg in ARGS)
# Columna izquierda con etiquetas de texto (IDLE/RUN/ATTACK/HIT) que no forma parte del sprite
IGNORE_LEFT = {'hades': 185, 'quetzalcoatl': 185}
ROWS, COLS = 4, 4
# Hojas de 3 columnas: el 4.º cuadro de cada fila repite uno existente (idle/carrera en vaivén,
# recuperación = preparación del golpe, levantarse = caída)
FILL_4TH = [1, 1, 0, 1]
PAD = 4  # margen transparente alrededor de cada cuadro


def find_file(deity):
    if FILES[deity]:
        return os.path.join(SRC, FILES[deity])
    for f in os.listdir(SRC):
        if f.lower().startswith('quetzal'):
            return os.path.join(SRC, f)
    raise FileNotFoundError(deity)


def components(mask):
    """Etiqueta componentes 4-conexas de un booleano 2D (BFS, sin scipy)."""
    h, w = mask.shape
    labels = np.zeros((h, w), np.int32)
    sizes, touches = [0], [False]
    cur = 0
    ys, xs = np.nonzero(mask)
    for sy, sx in zip(ys, xs):
        if labels[sy, sx]:
            continue
        cur += 1
        labels[sy, sx] = cur
        q = deque([(sy, sx)])
        size, touch = 0, False
        while q:
            y, x = q.popleft()
            size += 1
            if y == 0 or x == 0 or y == h - 1 or x == w - 1:
                touch = True
            for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not labels[ny, nx]:
                    labels[ny, nx] = cur
                    q.append((ny, nx))
        sizes.append(size)
        touches.append(touch)
    return labels, np.array(sizes), np.array(touches)


def split_near(profile, targets, radius):
    """Para cada posición objetivo, el índice cercano con menos contenido (centro de la racha mínima)."""
    cuts = []
    for t in targets:
        lo, hi = max(1, t - radius), min(len(profile) - 1, t + radius)
        seg = profile[lo:hi]
        m = seg.min()
        idx = np.nonzero(seg == m)[0]
        # racha mínima más cercana al objetivo; se toma su centro
        runs, start = [], idx[0]
        for a, b in zip(idx, idx[1:]):
            if b != a + 1:
                runs.append((start, a))
                start = b
        runs.append((start, idx[-1]))
        best = min(runs, key=lambda r: abs(lo + (r[0] + r[1]) // 2 - t))
        cuts.append(lo + (best[0] + best[1]) // 2)
    return cuts


def column_cuts(profile, x0):
    """SRC_COLS - 1 cortes de columna: los huecos vacíos interiores más anchos."""
    nz = np.nonzero(profile > 1)[0]
    first, last = nz[0], nz[-1]
    gaps, inside = [], False
    for x in range(first, last + 1):
        empty = profile[x] <= 1
        if empty and not inside:
            gs, inside = x, True
        elif not empty and inside:
            gaps.append((x - gs, gs, x - 1))
            inside = False
    gaps.sort(reverse=True)
    n = SRC_COLS - 1
    if len(gaps) < n:
        raise RuntimeError(f'no se encontraron {n} huecos entre cuadros')
    return sorted((g[1] + g[2]) // 2 for g in gaps[:n]), first, last


def process(deity):
    path = find_file(deity)
    rgb = np.asarray(Image.open(path).convert('RGB')).astype(np.int16)
    h, w, _ = rgb.shape
    border = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]])
    bg = np.median(border, 0)
    white_bg = bg.mean() > 128
    dist = np.abs(rgb - bg).max(2)

    # Fondo = zonas parecidas al color de fondo que tocan el borde o son bolsas grandes (entre brazos, aros...)
    tol = 34 if white_bg else 9
    bg_like = dist <= tol
    labels, sizes, touches = components(bg_like)
    is_bg_label = touches | (sizes >= 120)
    is_bg_label[0] = False
    background = is_bg_label[labels]

    # Alfa suave en el contorno para eliminar el halo de compresión JPG
    soft_hi = 90 if white_bg else 28
    alpha = np.clip((dist - tol) / (soft_hi - tol), 0, 1)
    near_bg = background.copy()
    for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
        near_bg |= np.roll(background, (dy, dx), (0, 1))
    alpha = np.where(near_bg, alpha, 1.0)
    alpha[background] = 0
    if deity in IGNORE_LEFT:
        alpha[:, :IGNORE_LEFT[deity]] = 0
    fg = alpha > 0.35

    row_prof = fg.sum(1)
    rcuts = split_near(row_prof, [h * k // ROWS for k in range(1, ROWS)], h // ROWS // 3)
    rbounds = [0] + rcuts + [h]

    frames = []
    for r in range(ROWS):
        y0, y1 = rbounds[r], rbounds[r + 1]
        band = fg[y0:y1]
        ccuts, first, last = column_cuts(band.sum(0), 0)
        cbounds = [first] + ccuts + [last + 1]
        for c in range(SRC_COLS):
            x0, x1 = cbounds[c], cbounds[c + 1]
            sub = fg[y0:y1, x0:x1]
            ys, xs = np.nonzero(sub)
            # Descarta motas sueltas en los bordes del recorte
            by0, by1 = np.percentile(ys, 0.2), ys.max()
            bx0, bx1 = xs.min(), xs.max()
            top, bottom = int(by0) + y0, int(by1) + y0
            left, right = int(bx0) + x0, int(bx1) + x0
            # Ancla horizontal: mediana del cuerpo en la mitad inferior (evita que rayos/estelas desplacen al personaje)
            low = sub[int(by0 + (by1 - by0) * 0.55):int(by1) + 1]
            lys, lxs = np.nonzero(low)
            anchor_x = int(np.median(lxs)) + x0 if len(lxs) else (left + right) // 2
            frames.append(dict(row=r, col=c, top=top, bottom=bottom, left=left, right=right, anchor=anchor_x))

    half_w = max(max(f['anchor'] - f['left'], f['right'] - f['anchor']) for f in frames) + PAD
    cell_h = max(f['bottom'] - f['top'] for f in frames) + 1 + PAD
    cell_w = 2 * half_w

    rgba = np.dstack([rgb.astype(np.uint8), (alpha * 255).astype(np.uint8)])
    src = Image.fromarray(rgba, 'RGBA')
    sheet = Image.new('RGBA', (cell_w * COLS, cell_h * ROWS), (0, 0, 0, 0))
    for f in frames:
        crop = src.crop((f['left'], f['top'], f['right'] + 1, f['bottom'] + 1))
        # Pies (fila inferior del sprite) pegados al borde inferior de la celda
        dx = f['col'] * cell_w + half_w - (f['anchor'] - f['left'])
        dy = f['row'] * cell_h + cell_h - crop.height
        sheet.alpha_composite(crop, (dx, dy))
        if SRC_COLS == 3 and f['col'] == FILL_4TH[f['row']]:
            sheet.alpha_composite(crop, (dx + (3 - f['col']) * cell_w, dy))
    sheet.save(os.path.join(OUT, f'{deity}.png'), optimize=True)

    # Depuración: cajas detectadas sobre el original
    dbg = Image.open(path).convert('RGB')
    dr = ImageDraw.Draw(dbg)
    for f in frames:
        dr.rectangle((f['left'], f['top'], f['right'], f['bottom']), outline=(0, 255, 0))
        dr.line((f['anchor'], f['bottom'] - 10, f['anchor'], f['bottom']), fill=(255, 0, 0), width=3)
    dbg.save(os.path.join(OUT, f'_debug_{deity}.png'))

    idle_h = float(np.median([f['bottom'] - f['top'] + 1 for f in frames if f['row'] == 0]))
    return dict(frameWidth=int(cell_w), frameHeight=int(cell_h), idleHeight=idle_h, whiteBackground=bool(white_bg))


meta = {}
for deity in FILES:
    meta[deity] = process(deity)
    print(deity, meta[deity])
with open(os.path.join(OUT, '_meta.json'), 'w') as fh:
    json.dump(meta, fh, indent=2)
