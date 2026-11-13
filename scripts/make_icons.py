# Regenerates every icon from assets/logo-source.png (1024×1024 Nexus '28 logo).
#   python3 scripts/make_icons.py
from PIL import Image, ImageFilter
import os
root = os.path.join(os.path.dirname(__file__), '..')
src = Image.open(os.path.join(root, 'assets', 'logo-source.png')).convert('RGBA')

# App icon on the macOS grid: 824px body, centered, soft shadow.
body = src.resize((824, 824), Image.LANCZOS)
canvas = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
shadow = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
shadow.paste((0, 0, 0, 255), (100, 112), body.split()[3].point(lambda v: int(v * 0.45)))
canvas.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(14)))
canvas.alpha_composite(body, (100, 100))
canvas.save(os.path.join(root, 'assets', 'icon.png'))

# Chat window header logo.
src.resize((128, 128), Image.LANCZOS).save(os.path.join(root, 'renderer', 'logo.png'))

# Menu-bar icon: the same full-color logo (18pt, plus @2x for Retina).
for size, name in [(18, 'tray.png'), (36, 'tray@2x.png')]:
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    out.alpha_composite(src.resize((size - 2, size - 2), Image.LANCZOS), (1, 1))
    out.save(os.path.join(root, 'assets', name))
print('icons written')
