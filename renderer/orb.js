// Nexus orb — a glass sphere with flowing light inside, one thin orbit ring, and a soft halo.
// NexusOrb.create(canvas, { color, minimal, skin }) → { pulse, setLevel, setMode, setColor, setSkin, stop }
// Skins (v1.7, unlocked with points): aurora · reactor · nebula · pulse · prism · pixel · eclipse · overlord (v1.8)
// Renders at the display's pixel density, so it stays crisp on Retina screens.
(function () {
  const hexToRgb = hex => {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  // Rotate hue (degrees) for the secondary/tertiary aurora colors.
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
      const base = skin === 'prism' ? shiftHue(rgb, (t * 45) % 360) : skin === 'overlord' ? [255, 40 + e * 30, 30] : rgb;
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
      body.addColorStop(0, skin === 'eclipse' ? 'rgba(10,10,14,.95)' : rgba(c1, .35));
      body.addColorStop(1, skin === 'eclipse' ? 'rgba(0,0,0,.98)' : 'rgba(4,10,14,.85)');
      ctx.fillStyle = body;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();

      // Aurora inside the sphere
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, R * .98, 0, Math.PI * 2); ctx.clip();
      ctx.globalCompositeOperation = 'lighter';
      const layers = skin === 'reactor' || skin === 'overlord' ? [] : [[c1, 0, .62, .9], [c2, 2.1, .52, .7], [c3, 4.2, .48, .65]];
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
      core.addColorStop(0, `rgba(255,255,255,${(.55 + e * .4) * (skin === 'eclipse' ? .08 : skin === 'overlord' ? .25 : skin === 'reactor' ? 1.1 : 1)})`);
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
