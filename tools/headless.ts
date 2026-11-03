// 24-hour headless stress run (WORLD_PLAN §20): npm run sim:headless -- [bodies] [hours] [seed]
import { runStress } from '../packages/sim/src/stress.js';
const [bodies = '12', hours = '24', seed = '1'] = process.argv.slice(2);
const r = await runStress({ bodies: +bodies, minutes: +hours * 60, seed: +seed });
const fails = Object.values(r.failDetail).reduce((a, b) => a + b, 0);
console.log(JSON.stringify({ ...r, runtimeFailRate: +(fails / (r.completed + fails)).toFixed(4) }, null, 1));
process.exit(r.overlaps === 0 && r.offMesh === 0 ? 0 : 1);
