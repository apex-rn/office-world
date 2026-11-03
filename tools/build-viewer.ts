// Assemble the self-contained viewer page: client/viewer.html + exported data.  npx tsx tools/build-viewer.ts <data.json> <out.html>
import { readFileSync, writeFileSync } from 'node:fs';
const [dataPath, out] = process.argv.slice(2);
const tpl = readFileSync(new URL('../client/viewer.html', import.meta.url), 'utf8');
const data = readFileSync(dataPath!, 'utf8').replace(/</g, '\\u003c');
writeFileSync(out!, tpl.replace('/*DATA*/', data));
console.log(out, (Buffer.byteLength(tpl) + data.length) / 1e6, 'MB');
