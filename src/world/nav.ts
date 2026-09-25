import { OBSTACLES, ROOM } from './layout';

/**
 * Walkable grid over the casino floor. Every obstacle is inflated by a person's radius, so a path
 * through free cells never clips furniture. People find their way with A* and follow smoothed paths.
 */
const CELL = 0.2;
const RADIUS = 0.34;
const W = Math.ceil((ROOM.x1 - ROOM.x0) / CELL);
const H = Math.ceil((ROOM.z1 - ROOM.z0) / CELL);
const blocked = new Uint8Array(W * H);

const cx = (x: number) => Math.min(W - 1, Math.max(0, Math.floor((x - ROOM.x0) / CELL)));
const cz = (z: number) => Math.min(H - 1, Math.max(0, Math.floor((z - ROOM.z0) / CELL)));
const wx = (i: number) => ROOM.x0 + (i + 0.5) * CELL;
const wz = (j: number) => ROOM.z0 + (j + 0.5) * CELL;

function build(): void {
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const x = wx(i), z = wz(j);
      let b = x < ROOM.x0 + RADIUS || x > ROOM.x1 - RADIUS || z < ROOM.z0 + RADIUS || z > ROOM.z1 - RADIUS;
      for (const o of OBSTACLES) {
        if (b) break;
        const dx = Math.max(o.x0 - x, 0, x - o.x1);
        const dz = Math.max(o.z0 - z, 0, z - o.z1);
        b = dx * dx + dz * dz < RADIUS * RADIUS;
      }
      blocked[j * W + i] = b ? 1 : 0;
    }
  }
}
build();

export function walkable(x: number, z: number): boolean {
  return !blocked[cz(z) * W + cx(x)];
}

/** Nearest free cell to a point (the point itself when it is free). */
function nearestFree(i: number, j: number): [number, number] {
  if (!blocked[j * W + i]) return [i, j];
  for (let r = 1; r < Math.max(W, H); r++) {
    let best: [number, number] | undefined;
    let bd = Infinity;
    for (let dj = -r; dj <= r; dj++) {
      for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const a = i + di, b = j + dj;
        if (a < 0 || b < 0 || a >= W || b >= H || blocked[b * W + a]) continue;
        const d = di * di + dj * dj;
        if (d < bd) {
          bd = d;
          best = [a, b];
        }
      }
    }
    if (best) return best;
  }
  return [i, j];
}

/** True when the straight segment only crosses free cells. */
function clear(x0: number, z0: number, x1: number, z1: number): boolean {
  const steps = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / (CELL * 0.4));
  for (let s = 0; s <= steps; s++) {
    const t = s / Math.max(1, steps);
    if (!walkable(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t)) return false;
  }
  return true;
}

/** Walkable path from (x0,z0) to (x1,z1) as world waypoints, ending at the (nearest free) target. */
export function findPath(x0: number, z0: number, x1: number, z1: number): { x: number; z: number }[] {
  const [si, sj] = nearestFree(cx(x0), cz(z0));
  const [ti, tj] = nearestFree(cx(x1), cz(z1));
  const end = walkable(x1, z1) ? { x: x1, z: z1 } : { x: wx(ti), z: wz(tj) };
  if (clear(x0, z0, end.x, end.z)) return [end];
  const start = sj * W + si, goal = tj * W + ti;
  const g = new Float32Array(W * H).fill(Infinity);
  const from = new Int32Array(W * H).fill(-1);
  const closed = new Uint8Array(W * H);
  const open: number[] = [start];
  const f = new Float32Array(W * H).fill(Infinity);
  const hx = (k: number) => Math.hypot((k % W) - ti, Math.floor(k / W) - tj);
  g[start] = 0;
  f[start] = hx(start);
  while (open.length) {
    let bi = 0;
    for (let k = 1; k < open.length; k++) if (f[open[k]] < f[open[bi]]) bi = k;
    const cur = open.splice(bi, 1)[0];
    if (cur === goal) break;
    closed[cur] = 1;
    const i = cur % W, j = Math.floor(cur / W);
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const a = i + di, b = j + dj;
        if (a < 0 || b < 0 || a >= W || b >= H) continue;
        const n = b * W + a;
        if (blocked[n] || closed[n]) continue;
        // No corner cutting past a blocked cell.
        if (di && dj && (blocked[j * W + a] || blocked[b * W + i])) continue;
        const cost = g[cur] + (di && dj ? Math.SQRT2 : 1);
        if (cost < g[n]) {
          if (g[n] === Infinity) open.push(n);
          g[n] = cost;
          f[n] = cost + hx(n);
          from[n] = cur;
        }
      }
    }
  }
  if (from[goal] === -1 && goal !== start) return [end];
  const cells: { x: number; z: number }[] = [];
  for (let k = goal; k !== -1 && k !== start; k = from[k]) cells.push({ x: wx(k % W), z: wz(Math.floor(k / W)) });
  cells.reverse();
  cells[cells.length - 1] = end;
  // Pull the string: skip waypoints that can be seen directly.
  const out: { x: number; z: number }[] = [];
  let px = x0, pz = z0;
  let k = 0;
  while (k < cells.length) {
    let far = k;
    for (let m = cells.length - 1; m > k; m--) {
      if (clear(px, pz, cells[m].x, cells[m].z)) {
        far = m;
        break;
      }
    }
    out.push(cells[far]);
    px = cells[far].x;
    pz = cells[far].z;
    k = far + 1;
  }
  return out;
}

/** Pushes a point out of every obstacle (inflated by `r`) and keeps it inside the room. */
export function resolve(p: { x: number; z: number }, r: number): void {
  p.x = Math.min(ROOM.x1 - r - 0.05, Math.max(ROOM.x0 + r + 0.05, p.x));
  p.z = Math.min(ROOM.z1 - r - 0.05, Math.max(ROOM.z0 + r + 0.05, p.z));
  for (let pass = 0; pass < 2; pass++) {
    for (const o of OBSTACLES) {
      const qx = Math.min(o.x1, Math.max(o.x0, p.x));
      const qz = Math.min(o.z1, Math.max(o.z0, p.z));
      const dx = p.x - qx, dz = p.z - qz;
      const d = Math.hypot(dx, dz);
      if (d >= r) continue;
      if (d > 1e-6) {
        p.x = qx + (dx / d) * r;
        p.z = qz + (dz / d) * r;
      } else {
        // Inside the rectangle: leave by the nearest side.
        const out = [p.x - o.x0, o.x1 - p.x, p.z - o.z0, o.z1 - p.z];
        const m = out.indexOf(Math.min(...out));
        if (m === 0) p.x = o.x0 - r;
        else if (m === 1) p.x = o.x1 + r;
        else if (m === 2) p.z = o.z0 - r;
        else p.z = o.z1 + r;
      }
    }
  }
}
