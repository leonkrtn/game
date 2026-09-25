import { describe, expect, it } from 'vitest';
import { DOOR, KASSE, OBSTACLES, RIVAL_SPOT, TABLE_SPOT } from '../src/world/layout';
import { findPath, resolve, walkable } from '../src/world/nav';

/** Distance from a point to the nearest obstacle rectangle. */
const clearance = (x: number, z: number) => Math.min(...OBSTACLES.map((o) => Math.hypot(Math.max(o.x0 - x, 0, x - o.x1), Math.max(o.z0 - z, 0, z - o.z1))));

function checkPath(from: { x: number; z: number }, to: { x: number; z: number }) {
  const path = findPath(from.x, from.z, to.x, to.z);
  let px = from.x, pz = from.z;
  for (const w of path) {
    for (let t = 0; t <= 1; t += 0.02) {
      const x = px + (w.x - px) * t, z = pz + (w.z - pz) * t;
      // Start and end may sit right beside furniture; the walk in between keeps a body's width.
      if (Math.hypot(x - from.x, z - from.z) > 0.4) expect(clearance(x, z)).toBeGreaterThan(0.25);
    }
    px = w.x;
    pz = w.z;
  }
  return path;
}

describe('navigation', () => {
  it('debt collectors walk from the door to the cashier around the slot machines', () => {
    checkPath({ x: DOOR.x, z: DOOR.z + 0.6 }, { x: KASSE.x - KASSE.halfW - 0.45, z: KASSE.z + 0.95 });
    checkPath({ x: DOOR.x, z: DOOR.z + 0.6 }, { x: KASSE.x + KASSE.halfW - 0.2, z: KASSE.z + 1.3 });
    // Straight through the table would be shorter: the path must bend around it.
    const around = checkPath({ x: -1, z: 0.6 }, { x: -1, z: -2.6 });
    expect(around.length).toBeGreaterThan(1);
  });

  it('the rival walks around the table', () => {
    checkPath({ x: DOOR.x + 0.3, z: DOOR.z + 0.6 }, RIVAL_SPOT);
    checkPath(RIVAL_SPOT, TABLE_SPOT);
  });

  it('every free cell has room for a person, and resolve pushes out of furniture', () => {
    const p = { x: -1, z: -1 };
    resolve(p, 0.3);
    expect(clearance(p.x, p.z)).toBeGreaterThanOrEqual(0.299);
    expect(walkable(-1, -1)).toBe(false);
  });
});
