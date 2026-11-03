import { localToWorld } from '../../shared/src/math.js';
import { def } from './items.js';
import type { Instance, Layout, Opening, WallSeg, Zone } from './schema.js';

// Compound Chronicle office v2 (luxury, larger). Interior 24 x 17 m, ceiling 3.2 m. x: east, z: south. See docs/WORLD_PLAN.md §5.1.
const W = 24, D = 17, H = 3.2;
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
// Main doors are double-leaf, double-swing (open both ways): 1.6-1.8 m clear, two people pass each other.
wall('N', -0.2, -0.1, W + 0.2, -0.1, 0.2);
wall('S', -0.2, D + 0.1, W + 0.2, D + 0.1, 0.2);
wall('Wst', -0.1, -0.2, -0.1, D + 0.2, 0.2);
wall('E', W + 0.1, -0.2, W + 0.1, D + 0.2, 0.2);
open('door_entrance', 'Wst', 13.0, 14.8, 'door', { top: 2.2, exterior: true, autoClose: true });
open('door_balcony', 'S', 8.2, 9.8, 'door', { top: 2.2, exterior: true, autoClose: true });
for (const [a, b] of [[5.0, 11.0], [18.6, 23.4]] as const) open(`win_N_${a}`, 'N', a, b, 'window', { sill: a === 5.0 ? 1.1 : 0.9, top: 2.8 });
for (const [a, b] of [[1.0, 7.0], [10.6, 16.4], [17.4, 23.4]] as const) open(`win_S_${a}`, 'S', a, b, 'window', { sill: 0.9, top: 2.8 });
for (const [a, b] of [[1.0, 6.0], [7.2, 16.2]] as const) open(`win_E_${a}`, 'E', a, b, 'window', { sill: 0.9, top: 2.8 });

// ---- WC (x 0-4.5, z 0-4.0): three cubicles, a roomy lobby with the basin ----
wall('wc_E', 4.5, 0, 4.5, 4.05, 0.1);
wall('wc_S', 0, 4.0, 4.55, 4.0, 0.1);
open('door_wc', 'wc_S', 1.6, 2.6, 'door', { top: 2.1, autoClose: true });
wall('wc_cub_front', 0, 1.6, 3.3, 1.6, 0.03, 'solid', 2.0);
open('door_cub1', 'wc_cub_front', 0.2, 0.9, 'door', { top: 2.0, autoClose: true });
open('door_cub2', 'wc_cub_front', 1.3, 2.0, 'door', { top: 2.0, autoClose: true });
open('door_cub3', 'wc_cub_front', 2.4, 3.1, 'door', { top: 2.0, autoClose: true });

// ---- meeting room (x 11.5-18.0, z 0-6.0), glass front ----
wall('mt_W', 11.5, 0, 11.5, 6.05, 0.1);
wall('mt_E', 18.0, 0, 18.0, 6.55, 0.1);
wall('mt_S', 11.5, 6.0, 18.0, 6.0, 0.08, 'glass');
open('door_meeting', 'mt_S', 13.95, 15.55, 'door', { top: 2.2, autoClose: true });

// ---- manager office (x 18.0-24.0, z 0-6.5), glass front ----
wall('mg_S', 18.0, 6.5, W, 6.5, 0.08, 'glass');
open('door_manager', 'mg_S', 18.6, 20.4, 'door', { top: 2.2, autoClose: true });

// ---- balcony (outdoor smoking area) railings, 1.1 m ----
wall('bal_S', 6.5, 19.2, 12.5, 19.2, 0.05, 'solid', 1.1);
wall('bal_W', 6.5, D + 0.2, 6.5, 19.2, 0.05, 'solid', 1.1);
wall('bal_E', 12.5, D + 0.2, 12.5, 19.2, 0.05, 'solid', 1.1);

const rect = (x0: number, z0: number, x1: number, z1: number) => [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }];
const zones: Zone[] = [
  { id: 'wc', name: 'WC', poly: rect(0, 0, 4.5, 4.0), enclosed: true, capacity: 4, door: 'door_wc' },
  { id: 'kitchen', name: 'Kitchen', poly: rect(4.5, 0, 11.5, 5.0), enclosed: false },
  { id: 'meeting', name: 'Meeting room', poly: rect(11.5, 0, 18.0, 6.0), enclosed: true },
  { id: 'manager', name: "Manager's office", poly: rect(18.0, 0, W, 6.5), enclosed: true, capacity: 6, door: 'door_manager' },
  { id: 'reception', name: 'Reception', poly: rect(0, 4.0, 4.5, D), enclosed: false },
  { id: 'work', name: 'Open work area', poly: [{ x: 4.5, z: 5.0 }, { x: 11.5, z: 5.0 }, { x: 11.5, z: 6.0 }, { x: 17.0, z: 6.0 }, { x: 17.0, z: D }, { x: 4.5, z: D }], enclosed: false },
  { id: 'print', name: 'Print & server corner', poly: [{ x: 17.0, z: 6.0 }, { x: 18.0, z: 6.0 }, { x: 18.0, z: 6.5 }, { x: W, z: 6.5 }, { x: W, z: 10.0 }, { x: 17.0, z: 10.0 }], enclosed: false },
  { id: 'lounge', name: 'Lounge', poly: rect(17.0, 10.0, W, D), enclosed: false },
  { id: 'balcony', name: 'Balcony (smoking)', poly: rect(6.5, D, 12.5, 19.2), enclosed: false, outdoor: true },
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
  // every desk also has its owner's 14" laptop, to the left of the keyboard
  onTop(`laptop.${owner}`, 'laptop_14', deskId, -dd.w / 2 + 0.26, dd.d / 2 - 0.2, 0, { owner });
  const lampX = (opts.lampLeft ?? true) ? -dd.w / 2 + 0.15 : dd.w / 2 - 0.15;
  // the lamp's head (its front, +Z) leans over the work area in front of the keyboard, not off the desk edge
  const lampZ = -dd.d / 2 + 0.14;
  onTop(`lamp.${owner}`, 'desk_lamp', deskId, lampX, lampZ, Math.atan2(-lampX, 0.05 - lampZ), { owner });
  return deskId;
};
// kitchen / café: worktop along the north wall, two dining tables
const counter = put('kitchen.counter', 'kitchen_counter', 6.2, 0.30);
put('kitchen.sink', 'sink_unit', 7.8, 0.30);
onTop('kitchen.tap', 'faucet', 'kitchen.sink', 0, -0.18);
put('kitchen.fridge', 'fridge', 8.6, 0.325);
put('kitchen.bin', 'trash_bin', 9.3, 0.20);
onTop('kitchen.coffee', 'coffee_machine', counter, -0.8, -0.05);
onTop('kitchen.microwave', 'microwave', counter, 0.3, -0.10);
put('kitchen.table', 'kitchen_table', 6.3, 3.3);
put('kitchen.chair1', 'side_chair', 6.0, 2.55, 0);
put('kitchen.chair2', 'side_chair', 6.6, 2.55, 0);
put('kitchen.chair3', 'side_chair', 6.0, 4.05, PI);
put('kitchen.chair4', 'side_chair', 6.6, 4.05, PI);
put('kitchen.table2', 'kitchen_table', 9.6, 3.3);
put('kitchen.chair5', 'side_chair', 9.3, 2.55, 0);
put('kitchen.chair6', 'side_chair', 9.9, 2.55, 0);
put('kitchen.chair7', 'side_chair', 9.3, 4.05, PI);
put('kitchen.chair8', 'side_chair', 9.9, 4.05, PI);
put('kitchen.water', 'water_dispenser', 11.1, 0.4, 0);
put('kitchen.plant', 'plant_floor', 4.95, 4.5);

// WC: three pans (one shared line outside the door), basin in the lobby
put('wc.part1', 'wc_partition', 1.1, 0.79);
put('wc.part2', 'wc_partition', 2.2, 0.79);
put('wc.part3', 'wc_partition', 3.3, 0.79);
// people wait outside the WC door, never inside the lobby or a cubicle doorway
const wcLine = { x: 2.1, z: 4.75, yaw: 0 };
put('wc.toilet1', 'toilet', 0.55, 0.34, 0, { group: 'wc', queueAt: wcLine });
put('wc.toilet2', 'toilet', 1.65, 0.34, 0, { group: 'wc', queueAt: wcLine });
put('wc.toilet3', 'toilet', 2.75, 0.34, 0, { group: 'wc', queueAt: wcLine });
put('wc.sink', 'vanity_basin', 3.9, 0.23, 0);
onTop('wc.tap', 'faucet', 'wc.sink', 0, -0.09);

// meeting room: table runs north-south, 4 chairs a side (0.7 m per seat); ~1.9 m aisles; screen and whiteboard
// on the solid north wall at the head of the table
put('meeting.table', 'meeting_table', 14.75, 3.2, PI / 2);
[2.15, 2.85, 3.55, 4.25].forEach((z, i) => {
  put(`meeting.chairW${i}`, 'office_chair', 13.8, z, PI / 2);
  put(`meeting.chairE${i}`, 'office_chair', 15.7, z, -PI / 2);
});
put('meeting.tv', 'tv_65', 13.6, 0.03, 0, { wall: 'N' });
put('meeting.whiteboard', 'whiteboard', 16.3, 0.015, 0, { wall: 'N' });
put('meeting.plant', 'plant_floor', 11.95, 5.5);

// manager office
workstation('manager', 'desk_160', 21.3, 2.4, PI, { lampLeft: false });
put('manager.guest1', 'side_chair', 20.8, 3.15, PI);
put('manager.guest2', 'side_chair', 21.8, 3.15, PI);
// shelves on the solid west wall: the space behind the Manager's chair stays a clear passage
put('manager.shelf1', 'bookcase', 18.225, 1.2, PI / 2);
put('manager.shelf2', 'bookcase', 18.225, 2.0, PI / 2);
put('manager.plant', 'plant_floor', 23.5, 6.0);
put('manager.plant2', 'plant_floor', 23.5, 0.5);

// open work area: two rows of five (two desks ready for new hires), colleagues back to back, 1.1 m between chair rows
const row1 = ['shorts', 'writer', 'facts', 'qa', 'spare1'];
const row2 = ['ig_res', 'yt_res', 'longform', 'publisher', 'spare2'];
[6.0, 8.2, 10.4, 12.6, 14.8].forEach((x, i) => {
  workstation(row1[i]!, 'desk_140', x, 8.4, 0, { lampLeft: i % 2 === 0 });
  workstation(row2[i]!, 'desk_140', x, 11.6, PI, { lampLeft: i % 2 === 1 });
});
put('work.plant1', 'plant_floor', 16.5, 7.0);
put('work.plant2', 'plant_floor', 5.0, 13.6);

// reception: the office keeper faces the entrance
workstation('guard', 'reception_desk', 2.3, 10.4, PI);
put('reception.board', 'kanban_board', 0.05, 6.5, PI / 2, { wall: 'Wst' });
put('reception.clock', 'wall_clock', 0.05, 11.6, PI / 2, { wall: 'Wst' });
put('reception.coats', 'coat_rack', 0.45, 16.5);
put('reception.plant', 'plant_floor', 4.0, 16.5);

// print & server corner
const cab = put('print.cabinet', 'cabinet_low', 22.0, 6.84, 0);
onTop('print.printer', 'printer', cab, 0, 0);
put('print.rack', 'server_rack', 23.48, 8.3, -PI / 2);   // front (server faces) toward the room
put('print.bin', 'trash_bin', 21.0, 6.74);

// lounge
put('lounge.sofa', 'sofa_3', 20.5, 16.5, PI);
put('lounge.table', 'coffee_table', 20.5, 15.0);
put('lounge.chair1', 'side_chair', 18.6, 15.0, PI / 2);
put('lounge.chair2', 'side_chair', 22.4, 15.0, -PI / 2);
put('lounge.plant1', 'plant_floor', 17.6, 16.6);
put('lounge.plant2', 'plant_floor', 23.5, 16.6);
put('lounge.shelf', 'bookcase', 23.8, 12.6, -PI / 2);

// balcony
put('balcony.ashtray', 'ashtray_stand', 9.0, 18.95, PI);
put('balcony.plant', 'plant_floor', 7.0, 18.9);
put('balcony.plant2', 'plant_floor', 12.0, 18.9);

// power: floor boxes under every desk, wall sockets elsewhere
const sockets = [
  ...inst.filter(i => i.id.startsWith('desk.')).map(i => ({ x: i.x, z: i.z })),
  { x: 5.8, z: 0.05 }, { x: 8.6, z: 0.05 }, { x: 11.1, z: 0.05 }, { x: 22.0, z: 6.55 }, { x: 23.95, z: 8.3 },
  { x: 13.6, z: 0.05 },
];

export const OFFICE: Layout = {
  id: 'office_v2',
  room: { w: W, d: D, h: H },
  walls, openings, zones,
  instances: inst,
  sockets,
  entrance: { x: 0.7, z: 13.9 },
};
/** kept for existing imports */
export const OFFICE_V1 = OFFICE;
