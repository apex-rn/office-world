// Record the live stream's events (speech, greet, think_failed, ...) to JSONL, read-only:
//   node tools/record_events.mjs ws://127.0.0.1:8765 out.jsonl [seconds]
import { appendFileSync } from 'node:fs';
const [url = 'ws://127.0.0.1:8765', out = 'events.jsonl', secs = '540'] = process.argv.slice(2);
const ws = new WebSocket(url);
let n = 0;
ws.onmessage = e => { try { const m = JSON.parse(e.data); if (m.t === 'event') { appendFileSync(out, JSON.stringify(m.e) + '\n'); n++; } } catch {} };
ws.onerror = e => console.error('ws error', e.message ?? e.type);
setTimeout(() => { console.log('events', n); process.exit(0); }, Number(secs) * 1000);
