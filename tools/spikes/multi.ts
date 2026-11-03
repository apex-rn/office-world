import { runStress } from '../../packages/sim/src/stress.js';
let C=0,F=0,O=0,M=0;
for (const seed of [5, 11, 23, 42]) { const r = await runStress({ bodies: 12, minutes: 240, seed }); const f=Object.values(r.failDetail).reduce((a,b)=>a+b,0); C+=r.completed; F+=f; O+=r.overlaps; M+=r.offMesh; console.log(seed, r.completed, f, (f/(r.completed+f)).toFixed(3)); }
console.log('TOTAL completed',C,'fails',F,'rate',(F/(C+F)).toFixed(4),'overlaps',O,'offMesh',M);
