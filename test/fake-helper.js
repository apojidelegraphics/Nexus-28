#!/usr/bin/env node
// Stand-in for the NexusCore Swift helper: same JSON-lines protocol, scripted results.
const out = o => process.stdout.write(JSON.stringify(o) + '\n');
out({ event: 'ready' });
const script = (process.env.FAKE_LISTEN || '').split('|').filter(Boolean), heard = {};
require('readline').createInterface({ input: process.stdin }).on('line', line => {
  const m = JSON.parse(line);
  if (m.cmd === 'info') out(process.env.FAKE_HELPER_OLD ? { event: 'info', stt: true, fm: 'available' } : { event: 'info', id: m.id, version: 5, stt: true, eventkit: true, wake: true, screen: true, fm: 'available' });
  if (m.cmd === 'wake_start') { out({ event: 'wake_listening' }); if (process.env.FAKE_WAKE) setTimeout(() => out({ event: 'wake', text: 'hey nexus' }), 300); }
  if (m.cmd === 'front_window') out({ event: 'result', id: m.id, data: process.env.FAKE_WINDOW_ID ? { windowId: +process.env.FAKE_WINDOW_ID, app: 'Safari', title: 'Calculus homework', pid: 999 } : null });
  if (m.cmd === 'ocr') out({ event: 'result', id: m.id, data: { text: 'OCR: The derivative of x^2 is 2x' } });
  if (m.cmd === 'pdf_text') out({ event: 'result', id: m.id, data: { text: 'PDF TEXT: chapter one', pages: 3 } });
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
