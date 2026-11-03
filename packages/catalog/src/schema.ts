// Catalog schema: every object in the world is an instance of an ItemDef with REAL dimensions and a cited source.
// Local frame: origin = centre of the footprint on its base, +x = width, +z = FRONT (the side a user faces/uses), +y up.
// yaw rotates the local frame about +Y (same convention as three.js rotation.y).

export type Kind = 'fixture' | 'furniture' | 'device' | 'item';
export type Placement = 'floor' | 'surface' | 'wall';
/** How an object affects walking: static = baked into the navmesh, dynamic = movable obstacle (chairs), none = never blocks. */
export type NavBlock = 'static' | 'dynamic' | 'none';

export interface Dims { w: number; d: number; h: number }

/** A flat surface objects can rest on, in local coordinates (rectangle). */
export interface SupportSurface { name: string; y: number; x0: number; x1: number; z0: number; z1: number }

/** A named point in local coordinates. yaw is relative to the object's yaw. */
export interface Anchor { x: number; z: number; y?: number; yaw?: number }

export type Verb =
  | 'sit' | 'work' | 'brew_coffee' | 'take_food' | 'take_drink' | 'wash' | 'use_toilet' | 'print'
  | 'heat_food' | 'read' | 'write_board' | 'move_card' | 'watch' | 'switch' | 'throw_away' | 'smoke' | 'hang_coat' | 'fill_water';

export interface Affordance {
  verb: Verb;
  /** where the user must stand/sit (anchor name) */
  at: string;
  /** for capacity > 1: one anchor per simultaneous user (each person gets their own spot) */
  slots?: string[];
  /** seconds [min, max] */
  duration: [number, number];
  /** concurrent users */
  capacity: number;
  /** animation clip name for the client */
  anim: string;
  /** item spawned into the user's hand when done (e.g. coffee), by def id */
  yields?: string;
}

export interface ItemDef {
  id: string;
  name: string;
  kind: Kind;
  placement: Placement;
  dims: Dims;
  /** Where the dimension comes from. 'VERIFY:' prefix = still to be confirmed against a published spec. */
  source: string;
  massKg: number;
  nav: NavBlock;
  /** collision footprint override (e.g. a chair's 5-star base is round) */
  footprint?: { shape: 'box' } | { shape: 'circle'; r: number };
  support?: SupportSurface[];
  anchors?: Record<string, Anchor>;
  affordances?: Affordance[];
  /** For seats: seat height (m). */
  seatH?: number;
  /** For wall items: height of the bottom edge above the floor. */
  wallBottom?: number;
  /** Needs a power socket within cable reach. */
  powered?: boolean;
  tags?: string[];
}

export interface WallSeg {
  id: string;
  a: { x: number; z: number }; b: { x: number; z: number };
  thickness: number; height: number;
  material: 'solid' | 'glass';
}

export interface Opening {
  id: string;
  wall: string;
  /** distance along the wall from `a` to the opening's start and end (m) */
  from: number; to: number;
  kind: 'door' | 'window';
  /** door: leaf height; window: sill height and top */
  sill?: number; top?: number;
  /** doors that auto-close (block sight/sound when nobody passes) */
  autoClose?: boolean;
  /** door leads outside the building */
  exterior?: boolean;
}

export interface Zone {
  id: string;
  name: string;
  poly: { x: number; z: number }[];
  /** enclosed rooms bound sound and sight by their walls; open zones do not */
  enclosed: boolean;
  outdoor?: boolean;
}

export interface Instance {
  id: string;
  def: string;
  x: number; z: number; yaw: number;
  /** instance id this object rests on (surface placement); absent = floor */
  on?: string;
  /** support surface name on the parent */
  surface?: string;
  /** wall placement: wall id */
  wall?: string;
  /** owner agent id (personal desk items) */
  owner?: string;
  /** a chair tucked under its desk may overlap the desk footprint */
  tuckedUnder?: string;
  /** interchangeable devices (e.g. two WC pans): a user is routed to the one with the shortest line */
  group?: string;
  /** where the line for this device starts (plan coordinates) and which way it extends */
  queueAt?: { x: number; z: number; yaw: number };
}

export interface Layout {
  id: string;
  room: { w: number; d: number; h: number };
  walls: WallSeg[];
  openings: Opening[];
  zones: Zone[];
  instances: Instance[];
  /** power sockets (plan positions, wall-mounted at 0.3 m) */
  sockets: { x: number; z: number }[];
  /** spawn/arrival point (inside the entrance door) */
  entrance: { x: number; z: number };
}
