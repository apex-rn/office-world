import { init, Crowd, NavMeshQuery } from 'recast-navigation';
import { generateTileCache, tileCacheGeneratorConfigDefaults } from 'recast-navigation/generators';
await init();
// floor 18x13 as 2 tris, plus a box obstacle (desk) 1.4x0.74x0.7 at (9,6.5)
const P:number[]=[], I:number[]=[];
function quad(a:number[],b:number[],c:number[],d:number[]){const o=P.length/3;P.push(...a,...b,...c,...d);I.push(o,o+2,o+1,o,o+3,o+2);}
quad([0,0,0],[18,0,0],[18,0,13],[0,0,13]);
function box(cx:number,cz:number,w:number,d:number,h:number){const x0=cx-w/2,x1=cx+w/2,z0=cz-d/2,z1=cz+d/2;
 quad([x0,h,z0],[x1,h,z0],[x1,h,z1],[x0,h,z1]); quad([x0,0,z0],[x1,0,z0],[x1,h,z0],[x0,h,z0]); quad([x1,0,z1],[x0,0,z1],[x0,h,z1],[x1,h,z1]);
 quad([x0,0,z1],[x0,0,z0],[x0,h,z0],[x0,h,z1]); quad([x1,0,z0],[x1,0,z1],[x1,h,z1],[x1,h,z0]);}
box(9,6.5,1.4,0.7,0.74);
const cs=0.05,ch=0.05;
const cfg={...tileCacheGeneratorConfigDefaults,cs,ch,tileSize:64,walkableRadius:Math.ceil(0.25/cs),walkableHeight:Math.ceil(1.8/ch),walkableClimb:Math.floor(0.3/ch),maxSimplificationError:1.0,expectedLayersPerTile:4,maxObstacles:256};
const r=generateTileCache(new Float32Array(P),new Uint32Array(I),cfg as any);
console.log('ok',r.success, (r as any).error);
if(!r.success) process.exit(1);
const {navMesh,tileCache}=r as any;
const q=new NavMeshQuery(navMesh);
const crowd=new Crowd(navMesh,{maxAgents:16,maxAgentRadius:0.3});
const params={radius:0.25,height:1.8,maxAcceleration:4,maxSpeed:1.35,collisionQueryRange:2.5,pathOptimizationRange:6,separationWeight:2};
const a=crowd.addAgent({x:2,y:0,z:6.5},params), b=crowd.addAgent({x:16,y:0,z:6.5},params);
a.requestMoveTarget({x:16,y:0,z:6.5}); b.requestMoveTarget({x:2,y:0,z:6.5});
// dynamic obstacle: chair
const ob=tileCache.addCylinderObstacle({x:6,y:0,z:6.5},0.33,1.0); for(let i=0;i<5;i++) tileCache.update(navMesh);
let minD=99,inDesk=0;
for(let t=0;t<20*20;t++){crowd.update(0.05);const pa=a.position(),pb=b.position();const d=Math.hypot(pa.x-pb.x,pa.z-pb.z);minD=Math.min(minD,d);
 for(const p of [pa,pb]) if(Math.abs(p.x-9)<0.7+0.2&&Math.abs(p.z-6.5)<0.35+0.2) inDesk++;}
console.log('final',a.position(),b.position(),'minDist',minD.toFixed(3),'deskViolations',inDesk, 'ob', !!ob);
