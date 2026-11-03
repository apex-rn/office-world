import { runStress } from '../../packages/sim/src/stress.js';
const agg:Record<string,number>={};
for (const seed of [5, 11, 23, 42]) { const r = await runStress({ bodies: 12, minutes: 240, seed }); for (const [k,v] of Object.entries(r.failDetail)) agg[k.replace(/ [a-z_]+\.?[a-z_0-9]*$/, m=>m)]=(agg[k]??0)+v; }
const byVerb:Record<string,number>={}; for (const [k,v] of Object.entries(agg)) { const kk=k.split(' ').slice(0,2).join(' '); byVerb[kk]=(byVerb[kk]??0)+v; }
console.log(byVerb); console.log(Object.entries(agg).sort((a,b)=>b[1]-a[1]).slice(0,15));
