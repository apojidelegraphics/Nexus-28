#!/usr/bin/env node
// Stand-in for the NexusCore Swift helper: same JSON-lines protocol, scripted results.
const out = o => process.stdout.write(JSON.stringify(o) + '\n');
out({ event: 'ready' });
const script = (process.env.FAKE_LISTEN || '').split('|').filter(Boolean), heard = {};
let ocrN = 0;
require('readline').createInterface({ input: process.stdin }).on('line', line => {
  const m = JSON.parse(line);
  if (m.cmd === 'info') out(process.env.FAKE_HELPER_OLD ? { event: 'info', stt: true, fm: 'available' } : { event: 'info', id: m.id, version: 7, stt: true, eventkit: true, wake: true, screen: true, ax: true, transcribeFile: true, selwatch: !process.env.FAKE_NO_SELWATCH, fm: 'available' });
  if (m.cmd === 'wake_start') { out({ event: 'wake_listening' }); if (process.env.FAKE_WAKE) setTimeout(() => out({ event: 'wake', text: 'hey nexus' }), 300); }
  if (m.cmd === 'front_window') out({ event: 'result', id: m.id, data: process.env.FAKE_WINDOW_ID ? { windowId: +process.env.FAKE_WINDOW_ID, app: 'Safari', title: 'Calculus homework', pid: 999 } : null });
  // FAKE_OCR_SEQ="a|b|c": each OCR returns the next reading (the last one repeats) — for Watch mode.
  if (m.cmd === 'ocr') {
    let text = 'OCR: The derivative of x^2 is 2x';
    if (process.env.FAKE_OCR_SEQ) { const seq = process.env.FAKE_OCR_SEQ.split('|'); text = seq[Math.min(ocrN++, seq.length - 1)]; }
    out({ event: 'result', id: m.id, data: { text } });
  }
  if (m.cmd === 'transcribe_file') out({ event: 'result', id: m.id, data: { text: 'the quiz is on friday' } });
  if (m.cmd === 'pdf_text') out({ event: 'result', id: m.id, data: { text: 'PDF TEXT: chapter one', pages: 3 } });
  if (m.cmd === 'ax_status') out({ event: 'result', id: m.id, data: { trusted: !process.env.FAKE_AX_DENIED } });
  if (m.cmd === 'selected_text') out(process.env.FAKE_AX_DENIED ? { event: 'error', id: m.id, error: 'AX_DENIED' } : { event: 'result', id: m.id, data: { text: process.env.FAKE_SELECTION || 'Mitochondria is the powerhouse of the cell.', app: 'Safari', method: 'ax' } });
  // Highlight orb: FAKE_HIGHLIGHT="text" → a selection shortly after the watch starts
  if (m.cmd === 'sel_watch_start') { out(process.env.FAKE_AX_DENIED ? { event: 'sel_watch', ok: false, error: 'AX_DENIED' } : { event: 'sel_watch', ok: true });
    if (process.env.FAKE_HIGHLIGHT && !process.env.FAKE_AX_DENIED) { const fire = () => out({ event: 'selection', text: process.env.FAKE_HIGHLIGHT, app: 'Safari', bundle: 'com.apple.Safari', x: 400, y: 300 }); const d = +process.env.FAKE_HIGHLIGHT_DELAY || 800;
      setTimeout(fire, d); if (process.env.FAKE_HIGHLIGHT_AGAIN) { setTimeout(() => out({ event: 'sel_clear', x: 10, y: 10 }), d + 1500); setTimeout(fire, d + 2500); setTimeout(fire, d + 6500); } } }
  if (m.cmd === 'sel_watch_stop') {}
  if (m.cmd === 'wake_stop') out({ event: 'wake_stopped' });
  if (process.env.FAKE_HELPER_OLD && /^(cal|rem)_/.test(m.cmd)) out({ event: 'error', id: m.id, error: 'unknown command ' + m.cmd });
  // FAKE_LISTEN="first thing|second thing": each listen hears the next phrase; after the list runs out, silence.
  if (m.cmd === 'listen') {
    out({ event: 'listening', id: m.id });
    setTimeout(() => out({ event: 'level', id: m.id, level: 0.5 }), 20);
    if (process.env.FAKE_LISTEN) {
      const said = script.shift();
      heard[m.id] = said || '';
      if (said) setTimeout(() => out({ event: 'partial', id: m.id, text: said }), 40);
    } else {
      setTimeout(() => out({ event: 'partial', id: m.id, text: 'hey flash' }), 40);
      setTimeout(() => out({ event: 'partial', id: m.id, text: 'hey flash what time is it' }), 60);
    }
  }
  if (m.cmd === 'stop') setTimeout(() => out({ event: 'final', id: m.id, text: process.env.FAKE_LISTEN ? heard[m.id] || '' : 'hey flash what time is it' }), 20);
  if (m.cmd === 'fm') out(m.prompt.includes('FAIL') ? { event: 'error', id: m.id, error: 'model busy' } : { event: 'fm', id: m.id, text: 'on-device says hi' });
});
