import { FIELDS, isInsideCombo } from '../game/fields';

/** Size of one number tile in meters (layout-local coordinates, centered on the layout). */
export const TILE = 0.13;
const X0 = -6 * TILE;
const Z0 = -2.5 * TILE;

export interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

function rectFor(id: string): Rect {
  const T = TILE;
  if (id.startsWith('n')) {
    const n = Number(id.slice(1));
    if (n === 0) return { x0: X0 - T, z0: Z0, x1: X0, z1: Z0 + 3 * T };
    const c = Math.floor((n - 1) / 3);
    const r = (n - 1) % 3;
    const z = Z0 + (2 - r) * T;
    return { x0: X0 + c * T, z0: z, x1: X0 + (c + 1) * T, z1: z + T };
  }
  if (id.startsWith('col')) {
    const r = Number(id.slice(3));
    const z = Z0 + (2 - r) * T;
    return { x0: X0 + 12 * T, z0: z, x1: X0 + 13 * T, z1: z + T };
  }
  if (id.startsWith('doz')) {
    const d = Number(id.slice(3));
    return { x0: X0 + 4 * d * T, z0: Z0 + 3 * T, x1: X0 + 4 * (d + 1) * T, z1: Z0 + 4 * T };
  }
  const outside = ['low', 'even', 'red', 'black', 'odd', 'high'];
  const i = outside.indexOf(id);
  return { x0: X0 + 2 * i * T, z0: Z0 + 4 * T, x1: X0 + 2 * (i + 1) * T, z1: Z0 + 5 * T };
}

/** Rectangles for fields drawn on the felt; inside bets sit on the lines between numbers. */
export const FIELD_RECTS: Record<string, Rect> = Object.fromEntries(
  FIELDS.filter((f) => !isInsideCombo(f)).map((f) => [f.id, rectFor(f.id)]),
);

export const LAYOUT_BOUNDS: Rect = { x0: X0 - TILE, z0: Z0, x1: X0 + 13 * TILE, z1: Z0 + 5 * TILE };

/** How close (in tiles) to a line the pointer must be to bet on that line. */
const LINE_HIT = 0.22;

/** Field under a layout-local point, including splits, streets, corners and six lines. */
export function fieldAt(x: number, z: number): string | undefined {
  const cf = (x - X0) / TILE;
  const rf = (z - Z0) / TILE;
  if (cf >= -LINE_HIT && cf < 12 - LINE_HIT && rf >= 0 && rf <= 3 + LINE_HIT) {
    const bc = Math.round(cf);
    const br = Math.round(rf);
    const nearCol = Math.abs(cf - bc) < LINE_HIT && bc >= 0 && bc <= 11;
    const nearRow = Math.abs(rf - br) < LINE_HIT && br >= 1 && br <= 3;
    const col = Math.min(11, Math.max(0, Math.floor(cf)));
    const row = 2 - Math.min(2, Math.max(0, Math.floor(rf)));
    if (nearRow && br === 3) return nearCol && bc >= 1 ? `sl${bc - 1}` : `st${col}`;
    if (nearCol && bc === 0) return `sz${row}`;
    if (nearCol && nearRow) return `co${bc - 1}-${2 - br}`;
    if (nearCol) return `sh${bc - 1}-${row}`;
    if (nearRow) return `sv${col}-${2 - br}`;
  }
  for (const [id, r] of Object.entries(FIELD_RECTS)) {
    if (x >= r.x0 && x < r.x1 && z >= r.z0 && z < r.z1) return id;
  }
  return undefined;
}

const rowCenter = (r: number) => Z0 + (2 - r) * TILE + TILE / 2;

export function fieldCenter(id: string): { x: number; z: number } {
  const T = TILE;
  const nums = id.match(/\d+/g)?.map(Number) ?? [];
  const [a, b] = nums;
  switch (id.match(/^[a-z]+/)?.[0]) {
    case 'sh': return { x: X0 + (a + 1) * T, z: rowCenter(b) };
    case 'sv': return { x: X0 + (a + 0.5) * T, z: Z0 + (2 - b) * T };
    case 'sz': return { x: X0, z: rowCenter(a) };
    case 'st': return { x: X0 + (a + 0.5) * T, z: Z0 + 3 * T };
    case 'co': return { x: X0 + (a + 1) * T, z: Z0 + (2 - b) * T };
    case 'sl': return { x: X0 + (a + 1) * T, z: Z0 + 3 * T };
  }
  const r = FIELD_RECTS[id];
  return { x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2 };
}

// ---- Room (meters, world coordinates) --------------------------------------

const ROOM_X0 = -7;
const ROOM_X1 = 7;
export const ROOM = { x0: ROOM_X0, x1: ROOM_X1, z0: -5.5, z1: 5.5, height: 3.4 };
export const TABLE = { x: -1, z: -1, height: 0.82, halfW: 1.65, halfD: 0.68 };
/** Layout and wheel positions relative to the table center. */
export const TABLE_LAYOUT = { x: 0.55, z: 0.1 };
export const TABLE_WHEEL = { x: -1.0, z: -0.02, scale: 0.075 };
export const KASSE = { x: 4.9, z: -3.9, halfW: 1.3, halfD: 0.45 };
/** Glass showcase with talismans for sale, against the left wall. */
export const VITRINE = { x: ROOM_X0 + 0.4, z: 0.6, halfW: 0.4, halfD: 1.1, height: 1.9 };
/** Red telephone on the right wall. */
export const PHONE = { x: ROOM_X1 - 0.06, z: 1.6, y: 1.35 };
export const DOOR = { x: -4.8, z: ROOM.z0 };

/** Where the player stands to interact. */
export const TABLE_SPOT = { x: TABLE.x + TABLE_LAYOUT.x, z: TABLE.z + TABLE.halfD + 0.45 };
export const KASSE_SPOT = { x: KASSE.x, z: KASSE.z + KASSE.halfD + 0.55 };
export const VITRINE_SPOT = { x: VITRINE.x + VITRINE.halfW + 0.6, z: VITRINE.z };
export const PHONE_SPOT = { x: PHONE.x - 0.8, z: PHONE.z };

/** Where talismans stand on the table, in table-local coordinates (behind the layout). */
export function itemSlot(i: number, count: number): { x: number; z: number } {
  const spacing = Math.min(0.26, 1.7 / count);
  return { x: TABLE_LAYOUT.x + (i - (count - 1) / 2) * spacing, z: -TABLE.halfD + 0.2 };
}

/** Solid rectangles the player cannot walk through. */
export const OBSTACLES: Rect[] = [
  { x0: TABLE.x - TABLE.halfW, z0: TABLE.z - TABLE.halfD, x1: TABLE.x + TABLE.halfW, z1: TABLE.z + TABLE.halfD },
  { x0: KASSE.x - KASSE.halfW, z0: ROOM.z0, x1: KASSE.x + KASSE.halfW, z1: KASSE.z + KASSE.halfD },
  { x0: ROOM.x0, z0: VITRINE.z - VITRINE.halfD, x1: VITRINE.x + VITRINE.halfW, z1: VITRINE.z + VITRINE.halfD },
];

