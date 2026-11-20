# Regenerates the icons.
#   App icon (Dock/Finder): assets/logo-source.png (3.11: assets/logo.svg, the glowing hexagon with the N and three stars,
#   rendered at 1024) → assets/icon.png. The menu-bar icon (hexagon + N) and the Icon Composer layers come from the same
#   SVG: see the 3.11 notes in docs/DEVELOPERS.md. Running this file only rebuilds icon.png.
#   python3 scripts/make_icons.py
from PIL import Image, ImageDraw, ImageFilter
import os
root = os.path.join(os.path.dirname(__file__), '..')
A = lambda *p: os.path.join(root, 'assets', *p)

# App icon on the macOS grid: 824px body, centered, soft shadow.
src = Image.open(A('logo-source.png')).convert('RGBA')
body = src.resize((824, 824), Image.LANCZOS)
canvas = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
shadow = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
shadow.paste((0, 0, 0, 255), (100, 112), body.split()[3].point(lambda v: int(v * 0.45)))
canvas.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(14)))
canvas.alpha_composite(body, (100, 100))
canvas.save(A('icon.png'))

print('icons written')
