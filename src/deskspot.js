// 4.0.7: where a desktop widget opens. A saved spot is kept as long as some of the widget is on a screen; it's measured
// against the whole screen, not the work area (on a Mac with Stage Manager or a left-side Dock the work area starts
// ~220px in, and clamping to it moved widgets you'd parked at the left edge every launch).
// 4.2.0: widgets that change size keep their bottom where it is (the top moves instead), the widgets stacked on them move
// with them, and widgets can go with you to another monitor.
'use strict';
function clampSpot(saved, display) {
  const b = display.bounds, wa = display.workArea || b;
  return { x: Math.min(Math.max(+saved.x, b.x - 200), b.x + b.width - 60), y: Math.min(Math.max(+saved.y, wa.y), b.y + b.height - 40) };
}

const GAP = 40;   // widgets this close (or overlapping) count as stacked on each other
const overlapX = (a, b) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);

// me: { k, x, y, w, h }, newH: its new height, others: [{ k, x, y, w, h }], screen: { x, y, width, height }
// → { me: { y, h }, moved: [{ k, y }] }. The bottom of `me` stays put and the top moves; widgets stacked above it (same
// column, a gap of ≤ 40px) move by the same amount, and the ones stacked on those, and so on. If that would push the top
// one off the screen, everything is shifted back down (then the widgets stacked below move down too).
function layoutResize(me, newH, others = [], scr) {
  const d = newH - me.h;
  if (!d) return { me: { y: me.y, h: me.h }, moved: [] };
  const pos = new Map(others.map(o => [o.k, { ...o }]));
  const column = o => overlapX(o, me) > Math.min(o.w, me.w) * 0.3;
  // walk up: anything whose bottom sits on (or overlaps) the top of the chain
  const above = [], seen = new Set([me.k]);
  let edge = [me];
  while (edge.length) {
    const next = [];
    for (const e of edge) for (const o of pos.values()) {
      if (seen.has(o.k) || !column(o) || overlapX(o, e) <= 0) continue;
      const gap = e.y - (o.y + o.h);
      if (gap <= GAP && o.y < e.y) { seen.add(o.k); above.push(o); next.push(o); }
    }
    edge = next;
  }
  let myY = me.y - d;
  const moved = above.map(o => ({ k: o.k, y: o.y - d }));
  // keep it on the screen: if the highest thing would go above the top, shift it all back down
  const top = Math.min(myY, ...moved.map(m => m.y));
  if (scr && top < scr.y) {
    const back = scr.y - top;
    myY += back; for (const m of moved) m.y += back;
    // our bottom now moves down by `back`: push what's stacked below us down too
    const below = [], seen2 = new Set([me.k, ...above.map(o => o.k)]);
    let edge2 = [{ ...me, y: myY, h: newH }];
    while (edge2.length) {
      const next = [];
      for (const e of edge2) for (const o of pos.values()) {
        if (seen2.has(o.k) || !column(o) || overlapX(o, e) <= 0) continue;
        const orig = e.k === me.k ? me.y + me.h : e.y + e.h - back;
        const gap = o.y - orig;
        if (gap <= GAP && o.y > e.y) { seen2.add(o.k); below.push(o); next.push({ ...o, y: o.y + back }); }
      }
      edge2 = next;
    }
    for (const o of below) moved.push({ k: o.k, y: Math.min(o.y + back, scr.y + scr.height - 40) });
  }
  return { me: { y: Math.round(myY), h: newH }, moved: moved.map(m => ({ k: m.k, y: Math.round(m.y) })) };
}

// where a widget saved on display `fromBounds` goes on display `toBounds`: the same place relative to the screen
// (a widget 20px from the right edge stays 20px from the right edge), so a column on the right stays on the right.
function carrySpot(spot, fromBounds, toBounds, w = 260, h = 100) {
  const f = fromBounds, t = toBounds;
  const right = spot.x + w / 2 > f.x + f.width / 2, low = spot.y + h / 2 > f.y + f.height / 2;
  let x = right ? t.x + t.width - w - (f.x + f.width - spot.x - w) : t.x + (spot.x - f.x);
  let y = low ? t.y + t.height - h - (f.y + f.height - spot.y - h) : t.y + (spot.y - f.y);
  x = Math.min(Math.max(x, t.x), t.x + t.width - w); y = Math.min(Math.max(y, t.y), t.y + t.height - 40);
  return { x: Math.round(x), y: Math.round(y) };
}

// which display a saved spot belongs to: the one it was saved on (by id) if it's still connected, else null
function homeDisplay(spot, displays) { return spot && spot.d != null ? displays.find(d => String(d.id) === String(spot.d)) || null : null; }

module.exports = { clampSpot, layoutResize, carrySpot, homeDisplay, GAP };
