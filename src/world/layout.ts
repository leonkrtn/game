import { FIELDS } from '../game/fields';

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

export const FIELD_RECTS: Record<string, Rect> = Object.fromEntries(FIELDS.map((f) => [f.id, rectFor(f.id)]));

export const LAYOUT_BOUNDS: Rect = { x0: X0 - TILE, z0: Z0, x1: X0 + 13 * TILE, z1: Z0 + 5 * TILE };

export function fieldAt(x: number, z: number): string | undefined {
  for (const [id, r] of Object.entries(FIELD_RECTS)) {
    if (x >= r.x0 && x < r.x1 && z >= r.z0 && z < r.z1) return id;
  }
  return undefined;
}

export function fieldCenter(id: string): { x: number; z: number } {
  const r = FIELD_RECTS[id];
  return { x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2 };
}

// ---- Room (meters, world coordinates) --------------------------------------

export const ROOM = { x0: -7, x1: 7, z0: -5.5, z1: 5.5, height: 3.4 };
export const TABLE = { x: -1, z: -1, height: 0.82, halfW: 1.65, halfD: 0.68 };
/** Layout and wheel positions relative to the table center. */
export const TABLE_LAYOUT = { x: 0.55, z: 0.1 };
export const TABLE_WHEEL = { x: -1.0, z: -0.02, scale: 0.075 };
export const KASSE = { x: 4.9, z: -3.9, halfW: 1.3, halfD: 0.45 };
export const DOOR = { x: -4.8, z: ROOM.z0 };

/** Where the player stands to interact. */
export const TABLE_SPOT = { x: TABLE.x + TABLE_LAYOUT.x, z: TABLE.z + TABLE.halfD + 0.45 };
export const KASSE_SPOT = { x: KASSE.x, z: KASSE.z + KASSE.halfD + 0.55 };

/** Solid rectangles the player cannot walk through. */
export const OBSTACLES: Rect[] = [
  { x0: TABLE.x - TABLE.halfW, z0: TABLE.z - TABLE.halfD, x1: TABLE.x + TABLE.halfW, z1: TABLE.z + TABLE.halfD },
  { x0: KASSE.x - KASSE.halfW, z0: ROOM.z0, x1: KASSE.x + KASSE.halfW, z1: KASSE.z + KASSE.halfD },
];

/** Free floor spots where lucky coins may appear. */
export const COIN_SPOTS: { x: number; z: number }[] = (() => {
  const out: { x: number; z: number }[] = [];
  for (let x = ROOM.x0 + 1; x <= ROOM.x1 - 1; x += 1.3) {
    for (let z = ROOM.z0 + 1; z <= ROOM.z1 - 1; z += 1.3) {
      const blocked = OBSTACLES.some((r) => x > r.x0 - 0.6 && x < r.x1 + 0.6 && z > r.z0 - 0.6 && z < r.z1 + 0.6);
      if (!blocked) out.push({ x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100 });
    }
  }
  return out;
})();
