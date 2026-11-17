/* Generated from the Nexus '28 Mac app by scripts/sync-companion.js — edit the original, not this copy. */
// Nexus orb — a glass sphere with flowing light inside, one thin orbit ring, and a soft halo.
// NexusOrb.create(canvas, { color, minimal, skin }) → { pulse, setLevel, setMode, setColor, setSkin, stop }
// Skins (v1.7, unlocked with points): aurora · reactor · nebula · pulse · prism · pixel · eclipse · overlord (v1.8)
//   v3.2: hologram (a calm wireframe globe in the agent's color, for points) and crucible (Axiom's own: a jagged, molten red-gold
//   lattice that strains against its shell; never sold for points). Both are drawn as real 3D point clouds.
// Renders at the display's pixel density, so it stays crisp on Retina screens.
(function () {
  const hexToRgb = hex => {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  // Rotate hue (degrees) for the secondary/tertiary aurora colors.
  const mixWhite = (c, k) => c.map(v => v + (255 - v) * k);
  function shiftHue([r, g, b], deg) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
    let h = 0, s = 0;
    if (max !== min) {
      const d = max - min;
      s = l > .5 ? d / (2 - max - min) : d / (max + min);
      h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h /= 6;
    }
    h = ((h * 360 + deg) % 360 + 360) % 360 / 360;
    const f = (p, q, t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
    const q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    return [f(p, q, h + 1 / 3) * 255, f(p, q, h) * 255, f(p, q, h - 1 / 3) * 255];
  }

  function create(canvas, opts = {}) {
    const ctx = canvas.getContext('2d');
    const minimal = !!opts.minimal;
    let W = 0, D = 1;
    function fit() {
      const css = canvas.getBoundingClientRect().width || parseFloat(getComputedStyle(canvas).width) || 200;
      D = Math.min(3, window.devicePixelRatio || 1);
      W = css;
      canvas.width = Math.round(css * D); canvas.height = Math.round(css * D);
    }
    fit();
    window.addEventListener('resize', fit);

    let energy = 0, target = 0, level = 0, t = 0, mode = 'idle', spin = 0, skin = opts.skin || 'aurora', running = true;
    const stars = Array.from({ length: 34 }, (_, i) => ({ a: Math.random() * Math.PI * 2, r: .15 + Math.random() * .8, s: .2 + Math.random() * .8, z: Math.random() }));
    let pix = null;
    // v3.2 3D point clouds: an even spread of points over a sphere (Fibonacci), each with its own jitter and phase
    const fib = (n, jag) => Array.from({ length: n }, (_, i) => {
      const y = 1 - (i + .5) / n * 2, r = Math.sqrt(1 - y * y), a = i * 2.39996323;
      return { x: Math.cos(a) * r, y, z: Math.sin(a) * r, j: 1 + (Math.random() - .5) * jag, ph: Math.random() * 6.28, s: .4 + Math.random() };
    });
    const nearest = (pts, k) => pts.map((p, i) => pts.map((q, j) => [j, (p.x - q.x) ** 2 + (p.y - q.y) ** 2 + (p.z - q.z) ** 2]).filter(x => x[0] > i).sort((a, b) => a[1] - b[1]).slice(0, k).map(x => x[0]));
    const crucible = fib(110, .34), crucibleLinks = nearest(crucible, 3);
    const embers = Array.from({ length: 26 }, () => ({ a: Math.random() * 6.28, d: Math.random(), v: .3 + Math.random() * .7 }));
    // rotate around Y then X, return screen x/y and depth (0 back … 1 front)
    const proj = (p, cx, cy, R, ry, rx, k = 1) => {
      const cY = Math.cos(ry), sY = Math.sin(ry), cX = Math.cos(rx), sX = Math.sin(rx);
      const x1 = p.x * cY + p.z * sY, z1 = -p.x * sY + p.z * cY, y2 = p.y * cX - z1 * sX, z2 = p.y * sX + z1 * cX;
      return [cx + x1 * R * k, cy + y2 * R * k, (z2 + 1) / 2];
    };
    let rgb = hexToRgb(opts.color || '#3dffa0'), goal = rgb.slice();
    const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

    // Smooth closed blob: radius modulated by a few slow sines.
    function blob(cx, cy, r, phase, wob) {
      ctx.beginPath();
      for (let i = 0; i <= 64; i++) {
        const a = i / 64 * Math.PI * 2;
        const k = 1 + wob * (Math.sin(a * 3 + phase) * .55 + Math.sin(a * 5 - phase * 1.3) * .3 + Math.sin(a * 2 + phase * .7) * .15);
        const x = cx + Math.cos(a) * r * k, y = cy + Math.sin(a) * r * k;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.closePath();
    }

    function frame() {
      t += 1 / 60;
      for (let i = 0; i < 3; i++) rgb[i] += (goal[i] - rgb[i]) * .08;
      if (mode === 'thinking') target = Math.max(target, .45 + Math.sin(t * 6) * .12);
      if (mode === 'speaking') target = Math.max(target, .35 + level * .7);
      if (mode === 'listening') target = Math.max(target, .2 + level * .9);
      energy += (target - energy) * .1;
      target *= .94; level *= .88;
      const e = energy;
      const base = skin === 'prism' ? shiftHue(rgb, (t * 45) % 360) : skin === 'overlord' ? [255, 40 + e * 30, 30] : skin === 'crucible' ? [255, 70 + e * 60, 28] : rgb;   // v3.3: hologram follows the agent's color
      const c1 = base, c2 = shiftHue(base, skin === 'prism' ? 120 : 38), c3 = shiftHue(base, skin === 'prism' ? -120 : -42);

      ctx.setTransform(D, 0, 0, D, 0, 0);
      ctx.clearRect(0, 0, W, W);
      const cx = W / 2, cy = W / 2;
      const R = W * (minimal ? .26 : .3) * (1 + e * .06);

      // Halo
      const halo = ctx.createRadialGradient(cx, cy, R * .6, cx, cy, W * .5);
      halo.addColorStop(0, rgba(c1, .22 + e * .25));
      halo.addColorStop(.5, rgba(c1, .05 + e * .06));
      halo.addColorStop(1, rgba(c1, 0));
      ctx.fillStyle = halo; ctx.fillRect(0, 0, W, W);

      // Orbit ring + travelling highlight
      const ringR = W * .43;
      ctx.lineWidth = 1;
      ctx.strokeStyle = rgba(c1, minimal ? .18 : .22);
      ctx.beginPath(); ctx.arc(cx, cy, ringR, 0, Math.PI * 2); ctx.stroke();
      // Orbit speed: a slow, steady drift. It only quickens slightly while thinking/answering,
      // and accumulates smoothly so changing speed never makes the arc jump.
      const rate = 0.35 + Math.min(e, 1) * 0.25 + (mode === 'thinking' ? 0.25 : 0);
      spin += rate / 60;
      const arcLen = mode === 'listening' ? .9 + level * 1.4 : .55 + e * .8;
      const grad = ctx.createConicGradient ? ctx.createConicGradient(spin, cx, cy) : null;
      if (grad) {
        grad.addColorStop(0, rgba(c1, .0)); grad.addColorStop(arcLen / (Math.PI * 2), rgba(c1, .95)); grad.addColorStop(Math.min(1, arcLen / (Math.PI * 2) + .001), rgba(c1, 0)); grad.addColorStop(1, rgba(c1, 0));
        ctx.strokeStyle = grad;
      } else ctx.strokeStyle = rgba(c1, .8);
      ctx.lineWidth = 1.6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(cx, cy, ringR, spin, spin + arcLen); ctx.stroke();
      const dx = cx + Math.cos(spin + arcLen) * ringR, dy = cy + Math.sin(spin + arcLen) * ringR;
      ctx.fillStyle = rgba([255, 255, 255], .9);
      ctx.shadowColor = rgba(c1, 1); ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.arc(dx, dy, 1.8, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;

      // Pulse skin: sonar rings drifting out from the sphere
      if (skin === 'pulse') {
        for (let k = 0; k < 3; k++) {
          const p = ((t * .45 + k / 3) % 1);
          ctx.strokeStyle = rgba(c1, (1 - p) * (.45 + e * .4)); ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.arc(cx, cy, R + (ringR - R) * p * 1.05, 0, Math.PI * 2); ctx.stroke();
        }
      }
      // Sphere body
      const body = ctx.createRadialGradient(cx - R * .3, cy - R * .35, R * .1, cx, cy, R);
      body.addColorStop(0, skin === 'eclipse' ? 'rgba(10,10,14,.95)' : skin === 'hologram' ? rgba(c1, .12) : skin === 'crucible' ? 'rgba(40,6,4,.9)' : rgba(c1, .35));
      body.addColorStop(1, skin === 'eclipse' ? 'rgba(0,0,0,.98)' : 'rgba(4,10,14,.85)');
      ctx.fillStyle = body;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();

      // Aurora inside the sphere
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, R * .98, 0, Math.PI * 2); ctx.clip();
      ctx.globalCompositeOperation = 'lighter';
      const layers = skin === 'reactor' || skin === 'overlord' || skin === 'crucible' || skin === 'hologram' ? [] : [[c1, 0, .62, .9], [c2, 2.1, .52, .7], [c3, 4.2, .48, .65]];
      const dim = skin === 'eclipse' ? .18 : 1;
      if (skin === 'reactor') {
        // Arc-reactor: concentric rings, rotating spokes, hot core
        for (let k = 1; k <= 3; k++) { ctx.strokeStyle = rgba(c1, .25 + k * .12 + e * .2); ctx.lineWidth = k === 3 ? 2.2 : 1.2; ctx.beginPath(); ctx.arc(cx, cy, R * (.28 + k * .2), 0, Math.PI * 2); ctx.stroke(); }
        for (let k = 0; k < 6; k++) { const a = spin * 1.6 + k * Math.PI / 3; ctx.strokeStyle = rgba(c2, .5 + e * .4); ctx.lineWidth = 2.4; ctx.beginPath(); ctx.arc(cx, cy, R * .78, a, a + .32); ctx.stroke(); }
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * .5); g.addColorStop(0, rgba(c1, .9)); g.addColorStop(1, rgba(c1, 0)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R * .5, 0, Math.PI * 2); ctx.fill();
      }
      if (skin === 'overlord') {
        // Overlord: a cold machine core. Armored plates turn in opposite directions around a hot red heart,
        // and a scan line sweeps the sphere; everything flares while it thinks or speaks.
        const heart = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * (.42 + e * .18));
        heart.addColorStop(0, `rgba(255,${200 + e * 55 | 0},${170 + e * 60 | 0},${.85 + e * .15})`); heart.addColorStop(.35, rgba(c1, .75 + e * .25)); heart.addColorStop(1, rgba(c1, 0));
        ctx.fillStyle = heart; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
        [[.88, 8, 1, .32], [.66, 5, -1.7, .5], [.47, 3, 2.6, .7]].forEach(([rr, n, dir, gap]) => {
          ctx.lineWidth = R * (rr > .8 ? .1 : .08); ctx.lineCap = 'butt';
          for (let k = 0; k < n; k++) {
            const a = spin * dir + k * Math.PI * 2 / n;
            ctx.strokeStyle = `rgba(${28 + e * 40 | 0},${10 + e * 6 | 0},${12 + e * 6 | 0},.92)`;
            ctx.beginPath(); ctx.arc(cx, cy, R * rr, a, a + Math.PI * 2 / n - gap); ctx.stroke();
            ctx.strokeStyle = rgba(c1, .35 + e * .5); ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(cx, cy, R * rr + R * .05, a, a + Math.PI * 2 / n - gap); ctx.stroke();
            ctx.lineWidth = R * (rr > .8 ? .1 : .08);
          }
        });
        const sy = cy + Math.sin(t * (1.2 + e * 2.5)) * R * .8;
        const scan = ctx.createLinearGradient(cx, sy - R * .12, cx, sy + R * .12);
        scan.addColorStop(0, rgba(c1, 0)); scan.addColorStop(.5, rgba([255, 120, 100], .35 + e * .45)); scan.addColorStop(1, rgba(c1, 0));
        ctx.fillStyle = scan; ctx.fillRect(cx - R, sy - R * .12, R * 2, R * .24);
      }
      if (skin === 'hologram') {
        // Hologram: a calm wireframe globe. Latitude and longitude lines ripple slowly, the far side fades,
        // and a few motes drift through it. Speaking makes the ripples run faster.
        const ry = spin * .6, rx = .35 + Math.sin(t * .2) * .12, rip = .04 + e * .06;
        ctx.lineWidth = 1;
        const line = pts => { for (let i = 1; i < pts.length; i++) { const [x0, y0, z0] = pts[i - 1], [x1, y1, z1] = pts[i]; ctx.strokeStyle = rgba(c1, .08 + (z0 + z1) / 2 * (.5 + e * .35)); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); } };
        for (let la = -3; la <= 3; la++) {
          const ph = la / 4 * Math.PI / 2, pts = [];
          for (let k = 0; k <= 48; k++) { const a = k / 48 * Math.PI * 2, w = 1 + Math.sin(a * 4 + t * (1.2 + e * 3) + la) * rip; pts.push(proj({ x: Math.cos(ph) * Math.cos(a) * w, y: Math.sin(ph) * w, z: Math.cos(ph) * Math.sin(a) * w }, cx, cy, R, ry, rx, .92)); }
          line(pts);
        }
        for (let lo = 0; lo < 12; lo++) {
          const a = lo / 12 * Math.PI * 2, pts = [];
          for (let k = 0; k <= 32; k++) { const ph = -Math.PI / 2 + k / 32 * Math.PI, w = 1 + Math.sin(ph * 5 + t * (1.2 + e * 3) + lo) * rip; pts.push(proj({ x: Math.cos(ph) * Math.cos(a) * w, y: Math.sin(ph) * w, z: Math.cos(ph) * Math.sin(a) * w }, cx, cy, R, ry, rx, .92)); }
          line(pts);
        }
        for (const st of stars) {
          st.a += .003 + st.s * .004;
          const [x, y, z] = proj({ x: Math.cos(st.a) * st.r, y: Math.sin(st.a * 1.3) * st.r * .8, z: Math.sin(st.a) * st.r }, cx, cy, R, ry * .5, rx, .9);
          ctx.fillStyle = rgba(mixWhite(c1, .65), .25 + z * .6); ctx.beginPath(); ctx.arc(x, y, .5 + z * 1.1, 0, Math.PI * 2); ctx.fill();
        }
      }
      if (skin === 'crucible') {
        // Crucible (Axiom's): a molten lattice of jagged points wired to their neighbours. It turns on a tilted axis,
        // strains outward against its shell (more while he thinks or speaks), and sheds embers from a white-gold core.
        // v3.3: at small sizes (N28C's header and talk bar) everything scales down so it reads as a lattice, not a light ball
        const ry = spin * 1.1, rx = Math.sin(t * .37) * .5, strain = .86 + e * .12;
        const sc = Math.max(.4, Math.min(1, R / 60)), step = R < 16 ? 3 : R < 34 ? 2 : 1;
        const heart = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * (.3 + sc * .2 + e * .15));
        const hA = .35 + sc * .45;
        heart.addColorStop(0, `rgba(255,${225 + e * 30 | 0},${150 + e * 60 | 0},${(.7 + e * .3) * hA})`); heart.addColorStop(.4, rgba([255, 110, 30], (.45 + e * .35) * hA)); heart.addColorStop(1, rgba([255, 40, 30], 0));
        ctx.fillStyle = heart; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
        const P = crucible.map(p => { const k = strain * p.j * (1 + Math.sin(t * (1.6 + e * 4) * p.s + p.ph) * (.05 + e * .08)); return proj(p, cx, cy, R, ry, rx, Math.min(.99, k)); });
        ctx.lineWidth = Math.max(.6, sc);
        crucibleLinks.forEach((ns, i) => i % step || ns.forEach(j => {
          const [x0, y0, z0] = P[i], [x1, y1, z1] = P[j], z = (z0 + z1) / 2, flick = .65 + .35 * Math.sin(t * 9 + i * 1.7 + j);
          ctx.strokeStyle = `rgba(255,${80 + z * 140 | 0},${20 + z * 40 | 0},${(.1 + z * .55 + e * .25) * flick})`;
          ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
        }));
        P.forEach(([x, y, z], i) => { if (i % step) return; const s = (1.8 + z * 2) * sc; ctx.fillStyle = `rgba(255,${150 + z * 105 | 0},${60 + z * 80 | 0},${.25 + z * .7})`; ctx.fillRect(x - s / 2, y - s / 2, s, s); });
        for (const m of embers) {
          m.d += (.004 + e * .012) * m.v; if (m.d > 1) { m.d = 0; m.a = Math.random() * 6.28; }
          const x = cx + Math.cos(m.a) * R * m.d * .95, y = cy + Math.sin(m.a) * R * m.d * .95;
          ctx.fillStyle = `rgba(255,${200 - m.d * 120 | 0},60,${(1 - m.d) * (.5 + e * .4)})`; ctx.beginPath(); ctx.arc(x, y, (.8 + (1 - m.d)) * sc, 0, Math.PI * 2); ctx.fill();
        }
      }
      if (skin === 'nebula') {
        for (const st of stars) {
          st.a += (.004 + st.s * .01) * (1 + e * 2);
          const x = cx + Math.cos(st.a) * R * st.r, y = cy + Math.sin(st.a * (1 + st.z * .2)) * R * st.r * .85;
          ctx.fillStyle = rgba(st.z > .5 ? c2 : [255, 255, 255], .35 + .5 * Math.abs(Math.sin(t * 2 + st.a * 3)));
          ctx.beginPath(); ctx.arc(x, y, .6 + st.z * 1.2, 0, Math.PI * 2); ctx.fill();
        }
      }
      layers.forEach(([c, off, size, alpha], i) => {
        alpha *= dim;
        const ox = Math.cos(t * (.4 + i * .13) + off) * R * (.22 + e * .1);
        const oy = Math.sin(t * (.5 + i * .11) + off) * R * (.2 + e * .1);
        const g = ctx.createRadialGradient(cx + ox, cy + oy, 0, cx + ox, cy + oy, R * size * 1.3);
        g.addColorStop(0, rgba(c, alpha * (.55 + e * .45)));
        g.addColorStop(1, rgba(c, 0));
        ctx.fillStyle = g;
        blob(cx + ox, cy + oy, R * size, t * (.8 + i * .3) + off, .1 + e * .22);
        ctx.fill();
      });
      // White core breathes with energy
      const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * (.35 + e * .25));
      core.addColorStop(0, `rgba(255,255,255,${(.55 + e * .4) * (skin === 'eclipse' ? .08 : skin === 'overlord' ? .25 : skin === 'crucible' ? .25 * Math.min(1, R / 60) : skin === 'hologram' ? .12 : skin === 'reactor' ? 1.1 : 1)})`);
      core.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = core; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      // Glass rim + specular highlight
      ctx.lineWidth = skin === 'eclipse' ? 2.6 : 1.2;
      ctx.strokeStyle = rgba(c1, .55 + e * .35);
      if (skin === 'eclipse') { ctx.shadowColor = rgba(c1, 1); ctx.shadowBlur = 18 + e * 20; }
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
      ctx.shadowBlur = 0;
      const spec = ctx.createLinearGradient(cx, cy - R, cx, cy);
      spec.addColorStop(0, 'rgba(255,255,255,.16)'); spec.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = spec;
      ctx.beginPath(); ctx.ellipse(cx, cy - R * .52, R * .62, R * .34, 0, 0, Math.PI * 2); ctx.fill();

      // Pixel skin: redraw the frame at low resolution, scaled back up without smoothing
      if (skin === 'pixel') {
        const n = Math.max(24, Math.round(W / 6));
        if (!pix) { pix = document.createElement('canvas'); }
        pix.width = n; pix.height = n;
        const p = pix.getContext('2d');
        p.imageSmoothingEnabled = false; p.clearRect(0, 0, n, n); p.drawImage(canvas, 0, 0, n, n);
        ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(pix, 0, 0, canvas.width, canvas.height);
        ctx.imageSmoothingEnabled = true;
      }

      if (running && canvas.isConnected !== false) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    return {
      pulse(n = .3) { target = Math.min(1, target + n); },
      setLevel(v) { level = Math.max(level, Math.min(1, v)); },
      setMode(m) { mode = m; },
      setColor(hex, instant) { goal = hexToRgb(hex); if (instant) rgb = goal.slice(); },
      setSkin(s) { skin = s || 'aurora'; },
      stop() { running = false; },
      refit: fit
    };
  }

  window.NexusOrb = { create };
})();
