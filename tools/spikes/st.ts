import { runStress } from '../../packages/sim/src/stress.js';
const r = await runStress({ bodies: 12, minutes: 30, seed: 42 }); console.log(JSON.stringify(r));
