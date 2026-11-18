// Remakes docs/assets/hero.gif (the README animation) from scripts/hero/scene.html.
//   node scripts/hero/make.js        (needs Playwright's Chromium and ffmpeg)
const { chromium } = require('playwright'), fs = require('fs'), os = require('os'), path = require('path'), { execFileSync } = require('child_process');
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hero-')), fps = 15, n = Math.round(18.4 * fps);
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await p.clock.install({ time: 0 }); await p.clock.pauseAt(1000);      // only our steps move time, so every frame is on cue
  await p.goto('file://' + path.join(__dirname, 'scene.html'));
  for (let i = 0; i < n; i++) { await p.clock.runFor(1000 / fps); await p.screenshot({ path: path.join(dir, String(i).padStart(4, '0') + '.png') }); }
  await b.close();
  const inp = ['-framerate', String(fps), '-i', path.join(dir, '%04d.png')], out = path.join(__dirname, '..', '..', 'docs', 'assets', 'hero.gif');
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...inp, '-vf', 'scale=960:-1:flags=lanczos,palettegen=max_colors=192:stats_mode=diff', path.join(dir, 'pal.png')]);
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...inp, '-i', path.join(dir, 'pal.png'), '-lavfi', 'scale=960:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=sierra2_4a:diff_mode=rectangle', '-loop', '0', out]);
  console.log('wrote', out);
})();
