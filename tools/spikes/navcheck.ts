import { OFFICE_V1 } from '../../packages/catalog/src/layout.js';
import { buildNav, snap, path } from '../../packages/sim/src/nav.js';
const t0=Date.now(); const nav=await buildNav(OFFICE_V1); console.log('built ms',Date.now()-t0);
const e=snap(nav,{x:OFFICE_V1.entrance.x,y:0,z:OFFICE_V1.entrance.z}); console.log('entrance',e);
for (const [n,p] of Object.entries({wcCub1:{x:0.5,y:0,z:1.04},meetingBehindN:{x:9.475,y:0,z:0.73},mgrChairApproach:{x:15.8,y:0,z:0.83},sofa:{x:15.6,y:0,z:11.7},balcony:{x:8.8,y:0,z:13.65},coffee:{x:3.6,y:0,z:1.10},writerChairBack:{x:6.4,y:0,z:7.92},ytChairBack:{x:6.4,y:0,z:8.28}})) {
  const s=snap(nav,p,{x:0.15,y:1,z:0.15}); const pa=s&&e?path(nav,e,s):null;
  console.log(n.padEnd(18), s?`snap(${s.x.toFixed(2)},${s.z.toFixed(2)})`:'NO-SNAP', pa?`path ${pa.length} end(${pa.at(-1)!.x.toFixed(2)},${pa.at(-1)!.z.toFixed(2)})`:'NO-PATH');
}
