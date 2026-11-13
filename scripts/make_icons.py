# Regenerates the icons.
#   App icon (Dock/Finder): assets/logo-source.png (the Nexus '28 "N" logo) → assets/icon.png
#   Menu-bar icon: the same hexagon logo as the chat window header → assets/trayTemplate.png (+@2x)
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

# Menu-bar template: the header SVG (viewBox 24: hexagon M12 2 l8.66 5 v10 L12 22 l-8.66-5 V7 z, circle r 3.2),
# drawn in black so macOS tints it for light/dark menu bars.
def tray(size, name, stroke=1.9):
    k = 8; S = size * k; u = S / 24
    im = Image.new('L', (S, S), 0); d = ImageDraw.Draw(im)
    pts = [(12, 2), (20.66, 7), (20.66, 17), (12, 22), (3.34, 17), (3.34, 7)]
    pts = [(x * u, y * u) for x, y in pts]
    w = round(stroke * u)
    d.line(pts + [pts[0], pts[1]], fill=255, width=w, joint='curve')
    r = 3.2 * u
    d.ellipse([12 * u - r - w / 2, 12 * u - r - w / 2, 12 * u + r + w / 2, 12 * u + r + w / 2], fill=255)
    d.ellipse([12 * u - r + w / 2, 12 * u - r + w / 2, 12 * u + r - w / 2, 12 * u + r - w / 2], fill=0)
    mask = im.resize((size, size), Image.LANCZOS)
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0)); out.putalpha(mask)
    out.save(A(name))
tray(18, 'trayTemplate.png'); tray(36, 'trayTemplate@2x.png')
print('icons written')
