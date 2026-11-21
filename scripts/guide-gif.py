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
# and the screenshots become small WebP files
for f in glob.glob(os.path.join(d, '*.png')):
    Image.open(f).save(f[:-4] + '.webp', 'WEBP', quality=86, method=6); os.remove(f)
