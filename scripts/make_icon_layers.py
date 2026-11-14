# Builds the macOS 26 app icon from the original art (assets/logo-source or the old icon):
#   assets/Nexus.icon/   Icon Composer bundle (layers: N, sparkles, '28 over a dark gradient) → Liquid Glass,
#                        light/dark/tinted/clear modes, like the built-in apps. Compiled by electron-builder (needs Xcode 26).
#   assets/icon.png      a flat fallback drawn on Apple's macOS grid (824 px body in a 1024 canvas) for older macOS.
# Run: python3 scripts/make_icon_layers.py <original-icon.png>
import json, os, sys
import numpy as np
from PIL import Image, ImageFilter, ImageDraw

src = np.array(Image.open(sys.argv[1]).convert('RGBA')).astype(float)
a = src[..., 3]; ys, xs = np.where(a > 10)
x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1          # the old icon's body
r, g, b = src[..., 0], src[..., 1], src[..., 2]
tealness = np.clip((g - r - 8) / 70.0, 0, 1) * (a / 255)                 # soft (anti-aliased) glyph mask
sel = tealness > .9
teal = tuple(int(v) for v in np.median(np.stack([r[sel], g[sel], b[sel]], 1), 0))
print('teal', teal)

regions = {  # (x0, x1, y0, y1) in the old icon
  'N': (140, 660, 270, 830), 'Sparkles': (560, 860, 150, 370), 'Year': (650, 880, 650, 800)}
S = 1024
out = 'assets/Nexus.icon'; os.makedirs(out + '/Assets', exist_ok=True)

def body_to_canvas(mask, margin=0):
  # Crop to the old body and scale it to fill the 1024 canvas (Icon Composer masks the shape itself).
  m = Image.fromarray((mask * 255).astype('uint8'), 'L').crop((x0, y0, x1, y1))
  size = S - 2 * margin
  m = m.resize((size, size), Image.LANCZOS)
  c = Image.new('L', (S, S), 0); c.paste(m, (margin, margin)); return c

layers = []
for name, (rx0, rx1, ry0, ry1) in regions.items():
  m = np.zeros_like(tealness); m[ry0:ry1, rx0:rx1] = tealness[ry0:ry1, rx0:rx1]
  alpha = body_to_canvas(m)
  img = Image.new('RGBA', (S, S), teal + (0,)); img.putalpha(alpha)
  img.save(f'{out}/Assets/{name}.png', optimize=True)
  layers.append(name)

c = lambda rgb: 'srgb:' + ','.join(f'{v / 255:.5f}' for v in rgb) + ',1.00000'
icon = {
  'fill': {'linear-gradient': [c((52, 50, 46)), c((8, 8, 9))], 'orientation': {'start': {'x': 0.5, 'y': 0.0}, 'stop': {'x': 0.5, 'y': 0.75}}},
  'groups': [
    {'name': 'Sparkles', 'lighting': 'individual', 'specular': True, 'shadow': {'kind': 'layer-color', 'opacity': 0.5}, 'translucency': {'enabled': True, 'value': 0.3},
     'layers': [{'name': 'Sparkles', 'image-name': 'Sparkles.png', 'glass': True}]},
    {'name': 'Mark', 'lighting': 'combined', 'specular': True, 'shadow': {'kind': 'layer-color', 'opacity': 0.5}, 'translucency': {'enabled': True, 'value': 0.2},
     'layers': [{'name': 'Year', 'image-name': 'Year.png', 'glass': True}, {'name': 'N', 'image-name': 'N.png', 'glass': True}]}
  ],
  'supported-platforms': {'squares': 'shared'}
}
json.dump(icon, open(out + '/icon.json', 'w'), indent=2)

# Flat fallback on the macOS grid: 824 px rounded-square body, centered, soft shadow.
B, M = 824, 100
def squircle(n, size):  # Apple-like continuous corners (superellipse)
  yy, xx = np.mgrid[0:size * 4, 0:size * 4] / (size * 4 - 1) * 2 - 1
  m = (np.abs(xx) ** n + np.abs(yy) ** n) <= 1
  return Image.fromarray((m * 255).astype('uint8'), 'L').resize((size, size), Image.LANCZOS)
mask = squircle(5.0, B)
grad = Image.new('RGBA', (B, B)); d = ImageDraw.Draw(grad)
top, bot = np.array((52, 50, 46)), np.array((8, 8, 9))
for yv in range(B): t = min(1, yv / (B * .75)); d.line([(0, yv), (B, yv)], fill=tuple(int(v) for v in top + (bot - top) * t) + (255,))
art = Image.new('RGBA', (B, B), (0, 0, 0, 0))
for name in layers:
  l = Image.open(f'{out}/Assets/{name}.png').resize((B, B), Image.LANCZOS); art.alpha_composite(l)
grad.alpha_composite(art)
# Thin inner highlight like the system icons
hl = Image.new('RGBA', (B, B), (255, 255, 255, 0)); edge = squircle(5.0, B).filter(ImageFilter.FIND_EDGES)
hl.putalpha(edge.point(lambda v: min(40, v)))
grad.alpha_composite(hl)
grad.putalpha(mask)
canvas = Image.new('RGBA', (S, S), (0, 0, 0, 0))
shadow = Image.new('RGBA', (S, S), (0, 0, 0, 0)); sh = Image.new('RGBA', (B, B), (0, 0, 0, 110)); sh.putalpha(mask.point(lambda v: v * 110 // 255))
shadow.paste(sh, (M, M + 12), sh); shadow = shadow.filter(ImageFilter.GaussianBlur(14))
canvas.alpha_composite(shadow); canvas.alpha_composite(grad, (M, M))
canvas.save('assets/icon.png', optimize=True)
print('ok')
