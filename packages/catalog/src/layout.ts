import { localToWorld } from '../../shared/src/math.js';
import { def } from './items.js';
import type { Instance, Layout, Opening, WallSeg, Zone } from './schema.js';

// Compound Chronicle office v1. Interior 18 x 13 m, ceiling 3.0 m. x: east, z: south. See docs/WORLD_PLAN.md §5.1.
const W = 18, D = 13, H = 3.0;
const PI = Math.PI;

const walls: WallSeg[] = [];
const openings: Opening[] = [];
const wall = (id: string, ax: number, az: number, bx: number, bz: number, thickness: number, material: 'solid' | 'glass' = 'solid', height = H) =>
  walls.push({ id, a: { x: ax, z: az }, b: { x: bx, z: bz }, thickness, height, material });
/** opening given in absolute plan coordinates along the wall's axis */
const open = (id: string, wallId: string, p0: number, p1: number, kind: 'door' | 'window', extra: Partial<Opening> = {}) => {
  const w = walls.find(x => x.id === wallId)!;
  const horizontal = Math.abs(w.b.x - w.a.x) > Math.abs(w.b.z - w.a.z);
  const base = horizontal ? w.a.x : w.a.z;
  openings.push({ id, wall: wallId, from: p0 - base, to: p1 - base, kind, ...extra });
};

// ---- exterior walls (interior faces on the room boundary) ----
wall('N', -0.2, -0.1, W + 0.2, -0.1, 0.2);
wall('S', -0.2, D + 0.1, W + 0.2, D + 0.1, 0.2);
wall('Wst', -0.1, -0.2, -0.1, D + 0.2, 0.2);
wall('E', W + 0.1, -0.2, W + 0.1, D + 0.2, 0.2);
open('door_entrance', 'Wst', 10.6, 11.5, 'door', { top: 2.1, exterior: true, autoClose: true });
open('door_balcony', 'S', 6.0, 6.9, 'door', { top: 2.1, exterior: true, autoClose: true });
// the meeting room's north wall is solid: it carries the screen and the whiteboard (the room is lit through its glass front)
for (const [a, b] of [[3.6, 7.8], [13.6, 17.4]] as const) open(`win_N_${a}`, 'N', a, b, 'window', { sill: a === 3.6 ? 1.1 : 0.9, top: 2.6 });
for (const [a, b] of [[0.6, 5.6], [7.4, 12.6], [13.4, 17.6]] as const) open(`win_S_${a}`, 'S', a, b, 'window', { sill: 0.9, top: 2.6 });
for (const [a, b] of [[0.6, 4.4], [6.0, 12.0]] as const) open(`win_E_${a}`, 'E', a, b, 'window', { sill: 0.9, top: 2.6 });

// ---- WC (x 0-3.05, z 0-3.05) with two cubicles ----
wall('wc_E', 3.05, 0, 3.05, 3.1, 0.1);
wall('wc_S', 0, 3.05, 3.1, 3.05, 0.1);
open('door_wc', 'wc_S', 1.0, 1.8, 'door', { top: 2.1, autoClose: true });
wall('wc_cub_front', 0, 1.6, 2.0, 1.6, 0.03, 'solid', 2.0);
open('door_cub1', 'wc_cub_front', 0.15, 0.85, 'door', { top: 2.0, autoClose: true });
open('door_cub2', 'wc_cub_front', 1.15, 1.85, 'door', { top: 2.0, autoClose: true });

// ---- meeting room (x 8.2-13.0, z 0-5.0), glass front ----
wall('mt_W', 8.2, 0, 8.2, 5.05, 0.1);
wall('mt_E', 13.0, 0, 13.0, 5.05, 0.1);
wall('mt_S', 8.2, 5.0, 13.0, 5.0, 0.08, 'glass');
open('door_meeting', 'mt_S', 10.0, 10.9, 'door', { top: 2.1, autoClose: true });

// ---- manager office (x 13.0-18.0, z 0-5.0), glass front ----
wall('mg_S', 13.0, 5.0, W, 5.0, 0.08, 'glass');
open('door_manager', 'mg_S', 13.6, 14.5, 'door', { top: 2.1, autoClose: true });

// ---- balcony (outdoor smoking area) railings, 1.1 m ----
wall('bal_S', 4.5, 15.2, 9.5, 15.2, 0.05, 'solid', 1.1);
wall('bal_W', 4.5, D + 0.2, 4.5, 15.2, 0.05, 'solid', 1.1);
wall('bal_E', 9.5, D + 0.2, 9.5, 15.2, 0.05, 'solid', 1.1);

const rect = (x0: number, z0: number, x1: number, z1: number) => [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }];
const zones: Zone[] = [
  { id: 'wc', name: 'WC', poly: rect(0, 0, 3.05, 3.05), enclosed: true, capacity: 3, door: 'door_wc' },
  { id: 'kitchen', name: 'Kitchen', poly: rect(3.05, 0, 8.2, 4.0), enclosed: false },
  { id: 'meeting', name: 'Meeting room', poly: rect(8.2, 0, 13.0, 5.0), enclosed: true },
  { id: 'manager', name: "Manager's office", poly: rect(13.0, 0, W, 5.0), enclosed: true, capacity: 5, door: 'door_manager' },
  { id: 'reception', name: 'Reception', poly: rect(0, 3.05, 3.05, D), enclosed: false },
  { id: 'work', name: 'Open work area', poly: [{ x: 3.05, z: 4.0 }, { x: 8.2, z: 4.0 }, { x: 8.2, z: 5.0 }, { x: 13.0, z: 5.0 }, { x: 13.0, z: D }, { x: 3.05, z: D }], enclosed: false },
  { id: 'print', name: 'Print & server corner', poly: rect(13.0, 5.0, W, 9.0), enclosed: false },
  { id: 'lounge', name: 'Lounge', poly: rect(13.0, 9.0, W, D), enclosed: false },
  { id: 'balcony', name: 'Balcony (smoking)', poly: rect(4.5, D, 9.5, 15.2), enclosed: false, outdoor: true },
];

// ---- instances ----
const inst: Instance[] = [];
const put = (id: string, defId: string, x: number, z: number, yaw = 0, extra: Partial<Instance> = {}) => {
  inst.push({ id, def: defId, x, z, yaw, ...extra });
  return id;
};
/** place an item on a parent's surface at local (lx, lz) in the parent's frame */
const onTop = (id: string, defId: string, parent: string, lx: number, lz: number, yawRel = 0, extra: Partial<Instance> = {}) => {
  const p = inst.find(i => i.id === parent)!;
  const w = localToWorld(p.x, p.z, p.yaw, lx, lz);
  return put(id, defId, w.x, w.z, p.yaw + yawRel, { on: parent, surface: 'top', ...extra });
};
/** desk + chair at the desk's `chair` anchor + standard equipment */
const workstation = (owner: string, deskDef: string, x: number, z: number, yaw: number, opts: { lampLeft?: boolean } = {}) => {
  const deskId = put(`desk.${owner}`, deskDef, x, z, yaw, { owner });
  const a = def(deskDef).anchors!.chair!;
  const c = localToWorld(x, z, yaw, a.x, a.z);
  put(`chair.${owner}`, 'office_chair', c.x, c.z, yaw + PI, { owner });
  const dd = def(deskDef).dims;
  onTop(`monitor.${owner}`, 'monitor_24', deskId, 0, -dd.d / 2 + 0.16);
  onTop(`keyboard.${owner}`, 'keyboard', deskId, 0, dd.d / 2 - 0.17);
  onTop(`mouse.${owner}`, 'mouse', deskId, 0.33, dd.d / 2 - 0.17);
  const lampX = (opts.lampLeft ?? true) ? -dd.w / 2 + 0.15 : dd.w / 2 - 0.15;
  onTop(`lamp.${owner}`, 'desk_lamp', deskId, lampX, -dd.d / 2 + 0.14, 0, { owner });
  return deskId;
};

// kitchen
const counter = put('kitchen.counter', 'kitchen_counter', 4.4, 0.30);
put('kitchen.sink', 'sink_unit', 6.0, 0.30);
put('kitchen.fridge', 'fridge', 6.85, 0.325);
put('kitchen.bin', 'trash_bin', 7.55, 0.20);
onTop('kitchen.coffee', 'coffee_machine', counter, -0.8, -0.05);
onTop('kitchen.microwave', 'microwave', counter, 0.3, -0.10);
// ≥1.2 m between the worktop and the backs of the dining chairs (people stand at the counter)
put('kitchen.table', 'kitchen_table', 5.4, 3.2);
put('kitchen.chair1', 'side_chair', 5.1, 2.45, 0);
put('kitchen.chair2', 'side_chair', 5.7, 2.45, 0);
put('kitchen.chair3', 'side_chair', 5.1, 3.95, PI);
put('kitchen.chair4', 'side_chair', 5.7, 3.95, PI);
put('kitchen.water', 'water_dispenser', 2.75, 3.40, 0);

// WC
put('wc.part1', 'wc_partition', 1.0, 0.79);
put('wc.part2', 'wc_partition', 2.0, 0.79);
// people wait outside the WC door, never inside the small lobby or a cubicle doorway
const wcLine = { x: 1.4, z: 3.75, yaw: 0 };
put('wc.toilet1', 'toilet', 0.5, 0.34, 0, { group: 'wc', queueAt: wcLine });
put('wc.toilet2', 'toilet', 1.5, 0.34, 0, { group: 'wc', queueAt: wcLine });
put('wc.sink', 'sink_unit', 2.5, 0.30, 0);

// meeting room: table runs north-south, 4 chairs a side (0.7 m per seat); ≥1.05 m walkway all round;
// screen and whiteboard share the solid north wall at the head of the table: side aisles stay free for the chairs
put('meeting.table', 'meeting_table', 10.6, 2.5, PI / 2);
[1.45, 2.15, 2.85, 3.55].forEach((z, i) => {
  put(`meeting.chairW${i}`, 'office_chair', 9.65, z, PI / 2);
  put(`meeting.chairE${i}`, 'office_chair', 11.55, z, -PI / 2);
});
put('meeting.tv', 'tv_65', 9.45, 0.03, 0, { wall: 'N' });
put('meeting.whiteboard', 'whiteboard', 11.85, 0.015, 0, { wall: 'N' });

// manager office
workstation('manager', 'desk_160', 15.8, 2.2, PI, { lampLeft: false });
put('manager.guest1', 'side_chair', 15.3, 2.95, PI);
put('manager.guest2', 'side_chair', 16.3, 2.95, PI);
// shelves on the solid west wall: the space behind the Manager's chair stays a clear passage
put('manager.shelf1', 'bookcase', 13.225, 1.0, PI / 2);
put('manager.shelf2', 'bookcase', 13.225, 1.8, PI / 2);
put('manager.plant', 'plant_floor', 17.5, 4.5);

// open work area: two rows of four, colleagues back to back
const row1 = ['shorts', 'writer', 'facts', 'qa'];
const row2 = ['ig_res', 'yt_res', 'longform', 'publisher'];
[4.4, 6.4, 8.4, 10.4].forEach((x, i) => {
  workstation(row1[i]!, 'desk_140', x, 6.6, 0, { lampLeft: i % 2 === 0 });
  workstation(row2[i]!, 'desk_140', x, 9.6, PI, { lampLeft: i % 2 === 1 });
});

// reception: the office keeper (guard) faces the entrance
workstation('guard', 'reception_desk', 1.6, 7.8, PI);
put('reception.board', 'kanban_board', 0.05, 5.0, PI / 2, { wall: 'Wst' });
put('reception.clock', 'wall_clock', 0.05, 8.9, PI / 2, { wall: 'Wst' });
put('reception.coats', 'coat_rack', 0.45, 12.5);
put('reception.plant', 'plant_floor', 2.6, 12.6);

// print & server corner
const cab = put('print.cabinet', 'cabinet_low', 15.9, 5.34, 0);
onTop('print.printer', 'printer', cab, 0, 0);
put('print.rack', 'server_rack', 17.65, 6.6, 0);
put('print.bin', 'trash_bin', 14.9, 5.24);

// lounge
put('lounge.sofa', 'sofa_3', 15.6, 12.5, PI);
put('lounge.table', 'coffee_table', 15.6, 11.0);
put('lounge.plant1', 'plant_floor', 13.7, 12.6);
put('lounge.plant2', 'plant_floor', 17.5, 12.6);
put('lounge.shelf', 'bookcase', 17.8, 10.4, -PI / 2);

// balcony
// ashtray against the south railing: smokers stand either side of it, the walkway to the door stays open
put('balcony.ashtray', 'ashtray_stand', 7.0, 14.95, PI);
put('balcony.plant', 'plant_floor', 5.0, 14.9);

// power: floor boxes under every desk, wall sockets elsewhere
const sockets = [
  ...inst.filter(i => i.id.startsWith('desk.')).map(i => ({ x: i.x, z: i.z })),
  { x: 4.0, z: 0.05 }, { x: 6.9, z: 0.05 }, { x: 2.75, z: 3.1 }, { x: 15.9, z: 5.05 }, { x: 17.95, z: 6.6 },
  { x: 9.45, z: 0.05 },
];

export const OFFICE_V1: Layout = {
  id: 'office_v1',
  room: { w: W, d: D, h: H },
  walls, openings, zones,
  instances: inst,
  sockets,
  entrance: { x: 0.7, z: 11.05 },
};
