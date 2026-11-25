// 4.0.7: where a desktop widget opens. A saved spot is kept as long as some of the widget is on a screen; it's measured
// against the whole screen, not the work area (on a Mac with Stage Manager or a left-side Dock the work area starts
// ~220px in, and clamping to it moved widgets you'd parked at the left edge every launch).
'use strict';
function clampSpot(saved, display) {
  const b = display.bounds, wa = display.workArea || b;
  return { x: Math.min(Math.max(+saved.x, b.x - 200), b.x + b.width - 60), y: Math.min(Math.max(+saved.y, wa.y), b.y + b.height - 40) };
}
module.exports = { clampSpot };
