# Builds docs/guide/img/guide-steps.gif from the frames scripts/guide-shots.js saves (gif-guide-*.png), then removes them.
import glob, os
from PIL import Image
d = os.path.join(os.path.dirname(__file__), '..', 'docs', 'guide', 'img')
frames = sorted(glob.glob(os.path.join(d, 'gif-guide-*.png')))
if frames:
    ims = [Image.open(f).convert('RGB').quantize(colors=128, method=Image.Quantize.MEDIANCUT) for f in frames]
    ims[0].save(os.path.join(d, 'guide-steps.gif'), save_all=True, append_images=ims[1:], duration=[1200] + [2600] * (len(ims) - 2) + [3500], loop=0, optimize=True)
    for f in frames: os.remove(f)
    print('guide-steps.gif from', len(frames), 'frames')
# 3.13: the home-page / README tour (hero-*.png → docs/assets/hero.gif), each screen held, with a short cross-fade between
hero = sorted(glob.glob(os.path.join(d, 'hero-*.png')))
if hero:
    W = 960
    shots = [Image.open(f).convert('RGB') for f in hero]
    shots = [im.resize((W, round(im.height * W / im.width)), Image.LANCZOS) for im in shots]
    seq, dur = [], []
    for i, im in enumerate(shots):
        seq.append(im); dur.append(2600)
        nxt = shots[(i + 1) % len(shots)]
        for k in (1, 2):
            seq.append(Image.blend(im, nxt, k / 3)); dur.append(90)
    sheet = Image.new('RGB', (W, sum(im.height for im in shots)))   # one palette from every screen together, so agent colors stay true
    y = 0
    for im in shots: sheet.paste(im, (0, y)); y += im.height
    pal = sheet.quantize(colors=255, method=Image.Quantize.MAXCOVERAGE)
    q = [f.quantize(palette=pal, dither=Image.Dither.NONE) for f in seq]
    out = os.path.join(d, '..', '..', 'assets', 'hero.gif')
    q[0].save(out, save_all=True, append_images=q[1:], duration=dur, loop=0, optimize=True)
    for f in hero: os.remove(f)
    print('hero.gif from', len(hero), 'screens,', os.path.getsize(out) // 1024, 'KB')
# and the screenshots become small WebP files
for f in glob.glob(os.path.join(d, '*.png')):
    Image.open(f).save(f[:-4] + '.webp', 'WEBP', quality=86, method=6); os.remove(f)
