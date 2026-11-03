import type { ItemDef, SupportSurface } from './schema.js';

// Real-world dimensions. Every `source` is either a standard / exact geometry, or marked VERIFY: until a
// published product spec is attached in docs/CATALOG_SOURCES.md. Values are metres.

const top = (w: number, d: number, y: number, inset = 0.02): SupportSurface =>
  ({ name: 'top', y, x0: -w / 2 + inset, x1: w / 2 - inset, z0: -d / 2 + inset, z1: d / 2 - inset });

// 16:9 panel: width = diag*16/sqrt(337), height = diag*9/sqrt(337)
const panel = (diagIn: number) => ({ w: (diagIn * 0.0254 * 16) / Math.sqrt(337), h: (diagIn * 0.0254 * 9) / Math.sqrt(337) });
export const PANEL_24 = panel(24); // 0.531 x 0.299
export const PANEL_65 = panel(65); // 1.439 x 0.809

export const ITEMS: ItemDef[] = [
  // ---------------- furniture ----------------
  {
    id: 'desk_140', name: 'Work desk 140x70', kind: 'furniture', placement: 'floor',
    dims: { w: 1.40, d: 0.70, h: 0.74 }, source: 'EN 527-1:2011 fixed work desk height 0.74; common 1400x700 top',
    massKg: 32, nav: 'static', support: [top(1.40, 0.70, 0.74)],
    anchors: { user: { x: 0, z: 0.70 }, chair: { x: 0, z: 0.70 } },
    affordances: [{ verb: 'work', at: 'user', duration: [600, 3600], capacity: 1, anim: 'typing' }],
  },
  {
    id: 'desk_160', name: 'Manager desk 160x80', kind: 'furniture', placement: 'floor',
    dims: { w: 1.60, d: 0.80, h: 0.74 }, source: 'EN 527-1:2011 height 0.74; 1600x800 executive top',
    massKg: 45, nav: 'static', support: [top(1.60, 0.80, 0.74)],
    anchors: { user: { x: 0, z: 0.75 }, chair: { x: 0, z: 0.75 }, guestL: { x: -0.5, z: -0.75 }, guestR: { x: 0.5, z: -0.75 } },
    affordances: [{ verb: 'work', at: 'user', duration: [600, 3600], capacity: 1, anim: 'typing' }],
  },
  {
    id: 'office_chair', name: 'Swivel office chair', kind: 'furniture', placement: 'floor',
    dims: { w: 0.65, d: 0.65, h: 1.05 }, source: 'EN 1335-1 seat height 0.40-0.51 (set 0.46); 5-star base dia 0.65',
    massKg: 15, nav: 'dynamic', footprint: { shape: 'circle', r: 0.33 }, seatH: 0.46,
    anchors: { seat: { x: 0, z: 0, y: 0.46 }, approach: { x: 0, z: -0.62, yaw: Math.PI } },
    affordances: [{ verb: 'sit', at: 'seat', duration: [2, 3], capacity: 1, anim: 'sit_down' }],
  },
  {
    id: 'side_chair', name: 'Four-leg side chair', kind: 'furniture', placement: 'floor',
    dims: { w: 0.46, d: 0.52, h: 0.82 }, source: 'EN 16139 / typical dining chair: seat 0.45, 460x520 footprint',
    massKg: 6, nav: 'dynamic', footprint: { shape: 'circle', r: 0.30 }, seatH: 0.45,
    anchors: { seat: { x: 0, z: 0, y: 0.45 }, approach: { x: 0, z: -0.60, yaw: Math.PI } },
    affordances: [{ verb: 'sit', at: 'seat', duration: [2, 3], capacity: 1, anim: 'sit_down' }],
  },
  {
    id: 'meeting_table', name: 'Meeting table 280x120', kind: 'furniture', placement: 'floor',
    dims: { w: 2.80, d: 1.20, h: 0.74 }, source: 'EN 527-1 height 0.74; 8-seat 2800x1200 top (0.7 m per seat); ≥0.95 m clear at both ends',
    massKg: 85, nav: 'static', support: [top(2.8, 1.2, 0.74)],
  },
  {
    id: 'kitchen_table', name: 'Kitchen table 120x80', kind: 'furniture', placement: 'floor',
    dims: { w: 1.20, d: 0.80, h: 0.74 }, source: 'dining table 1200x800, height 0.74',
    massKg: 25, nav: 'static', support: [top(1.2, 0.8, 0.74)],
  },
  {
    id: 'kitchen_counter', name: 'Kitchen counter 240', kind: 'furniture', placement: 'floor',
    dims: { w: 2.40, d: 0.60, h: 0.90 }, source: 'EN 1116 worktop height 0.90, depth 0.60',
    massKg: 120, nav: 'static', support: [top(2.4, 0.6, 0.90)],
    anchors: { front: { x: 0, z: 0.65 } },
  },
  {
    id: 'sink_unit', name: 'Sink unit 80', kind: 'device', placement: 'floor',
    dims: { w: 0.80, d: 0.60, h: 0.90 }, source: 'EN 1116 height 0.90; 800 sink base',
    massKg: 40, nav: 'static', anchors: { front: { x: 0, z: 0.62 } },
    affordances: [{ verb: 'wash', at: 'front', duration: [20, 60], capacity: 1, anim: 'wash_hands' }],
  },
  {
    id: 'sofa_3', name: 'Three-seat sofa', kind: 'furniture', placement: 'floor',
    dims: { w: 2.10, d: 0.90, h: 0.80 }, source: 'VERIFY: typical 3-seat sofa 2100x900, seat 0.43',
    massKg: 60, nav: 'static', seatH: 0.43,
    anchors: {
      seat0: { x: -0.62, z: 0.08, y: 0.43 }, seat1: { x: 0, z: 0.08, y: 0.43 }, seat2: { x: 0.62, z: 0.08, y: 0.43 },
      approach0: { x: -0.62, z: 0.85 }, approach1: { x: 0, z: 0.85 }, approach2: { x: 0.62, z: 0.85 },
    },
    affordances: [{ verb: 'sit', at: 'seat0', duration: [2, 3], capacity: 3, anim: 'sit_down' }],
  },
  {
    id: 'coffee_table', name: 'Coffee table', kind: 'furniture', placement: 'floor',
    dims: { w: 1.10, d: 0.60, h: 0.42 }, source: 'VERIFY: lounge table 1100x600, height 0.42',
    massKg: 15, nav: 'static', support: [top(1.1, 0.6, 0.42)],
  },
  {
    id: 'bookcase', name: 'Bookcase', kind: 'furniture', placement: 'floor',
    dims: { w: 0.80, d: 0.35, h: 1.80 }, source: 'VERIFY: 800x350x1800 office shelf',
    massKg: 35, nav: 'static', anchors: { front: { x: 0, z: 0.55 } },
    // people take a book and read it at their desk or on the sofa — nobody reads for ten minutes standing at a shelf
    affordances: [{ verb: 'read', at: 'front', duration: [20, 60], capacity: 1, anim: 'browse_shelf', yields: 'book' }],
  },
  {
    id: 'cabinet_low', name: 'Low cabinet', kind: 'furniture', placement: 'floor',
    dims: { w: 0.80, d: 0.50, h: 0.75 }, source: 'office pedestal/credenza height 0.75',
    massKg: 30, nav: 'static', support: [top(0.8, 0.5, 0.75)], anchors: { front: { x: 0, z: 0.60 } },
  },
  {
    id: 'reception_desk', name: 'Reception desk', kind: 'furniture', placement: 'floor',
    dims: { w: 1.60, d: 0.75, h: 0.74 }, source: 'EN 527-1 height 0.74 (counter top added visually)',
    massKg: 50, nav: 'static', support: [top(1.6, 0.75, 0.74)],
    anchors: { user: { x: 0, z: 0.72 }, chair: { x: 0, z: 0.72 } },
    affordances: [{ verb: 'work', at: 'user', duration: [600, 3600], capacity: 1, anim: 'typing' }],
  },
  {
    id: 'toilet', name: 'WC pan', kind: 'device', placement: 'floor',
    dims: { w: 0.38, d: 0.68, h: 0.40 }, source: 'EN 997 typical floor WC 380x680, seat 0.40',
    massKg: 25, nav: 'static', seatH: 0.40, anchors: { front: { x: 0, z: 0.70 } },
    affordances: [{ verb: 'use_toilet', at: 'front', duration: [90, 300], capacity: 1, anim: 'enter_cubicle' }],
  },
  {
    id: 'fridge', name: 'Fridge', kind: 'device', placement: 'floor',
    dims: { w: 0.60, d: 0.65, h: 1.80 }, source: 'standard 600 mm built-in width; VERIFY depth/height',
    massKg: 65, nav: 'static', powered: true, anchors: { front: { x: 0, z: 0.75 } },
    affordances: [
      { verb: 'take_food', at: 'front', duration: [10, 25], capacity: 1, anim: 'open_fridge', yields: 'lunchbox' },
      { verb: 'take_drink', at: 'front', duration: [6, 12], capacity: 1, anim: 'open_fridge', yields: 'water_bottle' },
    ],
  },
  {
    id: 'water_dispenser', name: 'Water dispenser', kind: 'device', placement: 'floor',
    dims: { w: 0.33, d: 0.33, h: 1.05 }, source: 'VERIFY: floor water cooler 330x330x1050',
    massKg: 18, nav: 'static', powered: true, anchors: { front: { x: 0, z: 0.55 } },
    affordances: [{ verb: 'fill_water', at: 'front', duration: [8, 15], capacity: 1, anim: 'fill_cup', yields: 'paper_cup' }],
  },
  {
    id: 'server_rack', name: 'GPU / server rack', kind: 'device', placement: 'floor',
    dims: { w: 0.60, d: 1.00, h: 2.00 }, source: 'EIA-310 42U rack 600x1000x2000',
    massKg: 140, nav: 'static', powered: true,
  },
  {
    id: 'plant_floor', name: 'Floor plant', kind: 'furniture', placement: 'floor',
    dims: { w: 0.45, d: 0.45, h: 1.20 }, source: 'VERIFY: potted plant, pot dia 0.45',
    massKg: 20, nav: 'static',
  },
  {
    id: 'trash_bin', name: 'Recycling bin', kind: 'furniture', placement: 'floor',
    dims: { w: 0.30, d: 0.30, h: 0.45 }, source: 'VERIFY: 30 L bin 300x300x450',
    massKg: 2, nav: 'static', anchors: { front: { x: 0, z: 0.45 } },
    affordances: [{ verb: 'throw_away', at: 'front', duration: [2, 4], capacity: 1, anim: 'throw' }],
  },
  {
    id: 'coat_rack', name: 'Coat rack', kind: 'furniture', placement: 'floor',
    dims: { w: 0.50, d: 0.50, h: 1.75 }, source: 'VERIFY: standing coat rack base dia 0.50',
    massKg: 6, nav: 'static', anchors: { front: { x: 0, z: 0.55 } },
    affordances: [{ verb: 'hang_coat', at: 'front', duration: [4, 8], capacity: 1, anim: 'hang_coat' }],
  },
  {
    id: 'ashtray_stand', name: 'Outdoor ashtray', kind: 'furniture', placement: 'floor',
    dims: { w: 0.30, d: 0.30, h: 0.95 }, source: 'VERIFY: standing ashtray bin',
    massKg: 8, nav: 'static', anchors: { front: { x: 0, z: 0.55 }, left: { x: -0.45, z: 0.40 }, right: { x: 0.45, z: 0.40 } },
    affordances: [{ verb: 'smoke', at: 'front', slots: ['left', 'right'], duration: [300, 480], capacity: 2, anim: 'smoke' }],
  },

  // ---------------- devices / items on surfaces ----------------
  {
    id: 'monitor_24', name: '24" monitor on stand', kind: 'device', placement: 'surface',
    dims: { w: PANEL_24.w + 0.012, d: 0.20, h: 0.45 },
    source: '24in 16:9 panel 0.531x0.299 (exact geometry) + 6 mm bezel; stand so top edge is at seated eye level (ISO 9241-5)',
    massKg: 4.5, nav: 'none', powered: true, tags: ['screen'],
  },
  {
    id: 'keyboard', name: 'Keyboard', kind: 'item', placement: 'surface',
    dims: { w: 0.44, d: 0.13, h: 0.03 }, source: 'full-size keyboard ~440x130', massKg: 0.7, nav: 'none',
  },
  {
    id: 'mouse', name: 'Mouse', kind: 'item', placement: 'surface',
    dims: { w: 0.065, d: 0.12, h: 0.04 }, source: 'typical mouse 65x120x40', massKg: 0.1, nav: 'none',
  },
  {
    id: 'desk_lamp', name: 'LED task lamp', kind: 'device', placement: 'surface',
    dims: { w: 0.16, d: 0.16, h: 0.45 }, source: 'VERIFY: task lamp, base dia 0.16, height 0.45',
    massKg: 1.2, nav: 'none', powered: true,
    affordances: [{ verb: 'switch', at: 'self', duration: [1, 2], capacity: 1, anim: 'reach_switch' }],
  },
  {
    id: 'mug', name: 'Mug 350 ml', kind: 'item', placement: 'surface',
    dims: { w: 0.085, d: 0.085, h: 0.095 }, source: 'standard 350 ml mug dia 85, h 95', massKg: 0.35, nav: 'none',
  },
  {
    id: 'laptop_14', name: '14" laptop', kind: 'device', placement: 'surface',
    dims: { w: 0.32, d: 0.22, h: 0.018 }, source: 'VERIFY: 14in laptop 320x220x18', massKg: 1.4, nav: 'none', powered: true,
  },
  {
    id: 'coffee_machine', name: 'Espresso machine', kind: 'device', placement: 'surface',
    dims: { w: 0.30, d: 0.45, h: 0.40 }, source: 'VERIFY: bean-to-cup machine 300x450x400',
    massKg: 9, nav: 'none', powered: true, anchors: { front: { x: 0, z: 0.85 } },
    affordances: [{ verb: 'brew_coffee', at: 'front', duration: [45, 75], capacity: 1, anim: 'use_machine', yields: 'mug' }],
  },
  {
    id: 'microwave', name: 'Microwave', kind: 'device', placement: 'surface',
    dims: { w: 0.48, d: 0.36, h: 0.28 }, source: 'VERIFY: 20 L microwave 480x360x280',
    massKg: 11, nav: 'none', powered: true, anchors: { front: { x: 0, z: 0.80 } },
    affordances: [{ verb: 'heat_food', at: 'front', duration: [90, 180], capacity: 1, anim: 'use_machine' }],
  },
  {
    id: 'printer', name: 'Laser printer', kind: 'device', placement: 'surface',
    dims: { w: 0.42, d: 0.42, h: 0.35 }, source: 'VERIFY: A4 laser MFP 420x420x350',
    massKg: 15, nav: 'none', powered: true, anchors: { front: { x: 0, z: 0.85 } },
    affordances: [{ verb: 'print', at: 'front', duration: [15, 60], capacity: 1, anim: 'use_machine', yields: 'paper_stack' }],
  },
  { id: 'lunchbox', name: 'Lunch box', kind: 'item', placement: 'surface', dims: { w: 0.20, d: 0.15, h: 0.07 }, source: 'VERIFY', massKg: 0.6, nav: 'none' },
  { id: 'water_bottle', name: 'Water bottle 500 ml', kind: 'item', placement: 'surface', dims: { w: 0.065, d: 0.065, h: 0.21 }, source: 'PET 500 ml dia 65, h 210', massKg: 0.52, nav: 'none' },
  { id: 'paper_cup', name: 'Paper cup', kind: 'item', placement: 'surface', dims: { w: 0.08, d: 0.08, h: 0.09 }, source: '8 oz cup', massKg: 0.25, nav: 'none' },
  { id: 'paper_stack', name: 'A4 paper stack', kind: 'item', placement: 'surface', dims: { w: 0.21, d: 0.297, h: 0.01 }, source: 'ISO 216 A4 210x297', massKg: 0.1, nav: 'none' },
  { id: 'book', name: 'Hardcover book', kind: 'item', placement: 'surface', dims: { w: 0.16, d: 0.24, h: 0.03 }, source: 'royal octavo hardcover 156x234 mm', massKg: 0.6, nav: 'none' },
  { id: 'notebook', name: 'A5 notebook', kind: 'item', placement: 'surface', dims: { w: 0.148, d: 0.21, h: 0.012 }, source: 'ISO 216 A5 148x210', massKg: 0.2, nav: 'none' },
  { id: 'headphones', name: 'Headphones', kind: 'item', placement: 'surface', dims: { w: 0.17, d: 0.08, h: 0.19 }, source: 'VERIFY: over-ear headphones', massKg: 0.25, nav: 'none' },
  { id: 'photo_frame', name: 'Photo frame 10x15', kind: 'item', placement: 'surface', dims: { w: 0.13, d: 0.06, h: 0.18 }, source: '10x15 cm photo frame', massKg: 0.3, nav: 'none' },
  { id: 'desk_plant', name: 'Small desk plant', kind: 'item', placement: 'surface', dims: { w: 0.11, d: 0.11, h: 0.20 }, source: 'VERIFY: 11 cm pot', massKg: 0.6, nav: 'none' },
  { id: 'snack_bowl', name: 'Snack bowl', kind: 'item', placement: 'surface', dims: { w: 0.14, d: 0.14, h: 0.06 }, source: 'VERIFY', massKg: 0.3, nav: 'none' },

  // ---------------- wall items ----------------
  {
    id: 'kanban_board', name: 'NAVBAT kanban board', kind: 'fixture', placement: 'wall',
    dims: { w: 1.80, d: 0.03, h: 1.20 }, wallBottom: 0.90, source: 'magnetic whiteboard 1800x1200, bottom edge 0.90',
    massKg: 18, nav: 'none', anchors: { front: { x: 0, z: 0.50 }, left: { x: -0.45, z: 0.50 }, right: { x: 0.45, z: 0.50 } },
    affordances: [{ verb: 'move_card', at: 'front', slots: ['left', 'right'], duration: [5, 15], capacity: 2, anim: 'pin_card' }],
  },
  {
    id: 'whiteboard', name: 'Whiteboard', kind: 'fixture', placement: 'wall',
    dims: { w: 1.80, d: 0.03, h: 1.20 }, wallBottom: 0.90, source: 'whiteboard 1800x1200, bottom 0.90',
    massKg: 18, nav: 'none', anchors: { front: { x: 0, z: 0.50 } },
    affordances: [{ verb: 'write_board', at: 'front', duration: [20, 120], capacity: 1, anim: 'write_board' }],
  },
  {
    id: 'tv_65', name: '65" display', kind: 'device', placement: 'wall',
    dims: { w: PANEL_65.w + 0.02, d: 0.06, h: PANEL_65.h + 0.02 }, wallBottom: 1.00,
    source: '65in 16:9 panel 1.439x0.809 (exact geometry) + bezel', massKg: 25, nav: 'none', powered: true, tags: ['screen'],
  },
  {
    id: 'wall_clock', name: 'Wall clock', kind: 'fixture', placement: 'wall',
    dims: { w: 0.35, d: 0.05, h: 0.35 }, wallBottom: 2.05, source: 'VERIFY: 35 cm wall clock', massKg: 1, nav: 'none',
  },
  {
    id: 'wc_partition', name: 'WC cubicle partition', kind: 'fixture', placement: 'floor',
    dims: { w: 0.03, d: 1.58, h: 2.00 }, source: 'VERIFY: compact laminate partition, 2.0 m high, 0.15 floor gap',
    massKg: 30, nav: 'static',
  },
];

export const ITEM_BY_ID: ReadonlyMap<string, ItemDef> = new Map(ITEMS.map(d => [d.id, d]));

export function def(id: string): ItemDef {
  const d = ITEM_BY_ID.get(id);
  if (!d) throw new Error(`unknown item def: ${id}`);
  return d;
}
