import { runStress } from '../../packages/sim/src/stress.js';
const r = await runStress({ bodies: 12, minutes: 360, seed: 5 });
const tot=Object.values(r.failDetail).reduce((a,b)=>a+b,0);
console.log('completed',r.completed,'fails',tot,'rate',(tot/(r.completed+tot)).toFixed(3),'yields',r.yields);
console.log(Object.entries(r.failDetail).sort((a,b)=>b[1]-a[1]).slice(0,25));
