import { runStress } from '../../packages/sim/src/stress.js';
process.env.STRESS_DEBUG='1';
await runStress({ bodies: 12, minutes: 120, seed: 5 });
