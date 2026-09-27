// Roulette ball physics. The spin is simulated up front at a fixed rate and then played back, so
// the ball can land in the pocket the game already decided without ever cheating visibly: the
// launch is simulated freely, and only the rotor's speed (for the first ball) or the second
// ball's launch moment is chosen so that the real, unmodified physics ends in the right pocket.
//
// Angles follow the wheel's convention: a point at angle a sits at (cos a·r, −sin a·r) and the
// rotor's pocket i at rotor angle + pocketAngle(i) = rotor angle − i·STEP.

export const POCKETS = 37;
export const STEP = (Math.PI * 2) / POCKETS;
const TAU = Math.PI * 2;

/** Wheel geometry in wheel units (must match wheel3d). */
export const GEO = {
  discY: 1.6,
  trackR: 4.75,
  discR: 4.2,
  numbersIn: 3.55,
  pocketsIn: 2.85,
  ballR: 0.17,
  deflectorR: 4.5,
  deflectors: 8,
};
const TRACK_Y = GEO.discY + 0.55;
export const POCKET_R = (GEO.pocketsIn + GEO.numbersIn) / 2;

export const SIM_DT = 1 / 240;
/** Rotor spin-up once the croupier turns it. */
const RAMP = 0.8;
const MIN_ROTOR = 0.35;

export interface RotorPlan {
  /** Rotor angle and speed when the spin starts. */
  a0: number;
  w0: number;
  /** Speed it is turned to, and how fast it then slows (rad/s²). */
  top: number;
  decel: number;
}

/** Rotor speed at spin time t. */
export function rotorSpeed(p: RotorPlan, t: number): number {
  if (t <= RAMP) return p.w0 + (p.top - p.w0) * (t / RAMP);
  return Math.max(MIN_ROTOR, p.top - p.decel * (t - RAMP));
}

/** Rotor angle at spin time t (closed form of the speed above). */
export function rotorAngle(p: RotorPlan, t: number): number {
  const tr = Math.min(t, RAMP);
  let a = p.a0 + p.w0 * tr + ((p.top - p.w0) * tr * tr) / (2 * RAMP);
  if (t <= RAMP) return a;
  const u = t - RAMP;
  const uStop = (p.top - MIN_ROTOR) / p.decel;
  const us = Math.min(u, uStop);
  a += p.top * us - (p.decel * us * us) / 2;
  if (u > uStop) a += MIN_ROTOR * (u - uStop);
  return a;
}

/** Height of the ball's contact surface at radius r. */
export function surfaceY(r: number): number {
  const D = GEO.discY;
  if (r <= GEO.discR) return r < GEO.numbersIn ? D + 0.02 : D;
  const pts: [number, number][] = [[4.2, D], [4.35, D + 0.2], [4.65, TRACK_Y - 0.12], [4.75, TRACK_Y - 0.1]];
  for (let i = 1; i < pts.length; i++) {
    if (r <= pts[i][0]) {
      const [r0, y0] = pts[i - 1], [r1, y1] = pts[i];
      return y0 + ((y1 - y0) * (r - r0)) / (r1 - r0);
    }
  }
  return TRACK_Y - 0.1;
}

export type BallEvent = { t: number; kind: 'knock' | 'tick'; strength: number };

export interface BallPath {
  /** Launch moment in spin time. */
  start: number;
  /** Spin time when the ball comes to rest. */
  end: number;
  /** Samples every SIM_DT from `start`: world angle, radius, height of the ball centre. */
  samples: Float32Array;
  /** Rolling loudness 0..1 per sample. */
  roll: Float32Array;
  events: BallEvent[];
  /** Pocket it rests in. */
  pocket: number;
}

type Rng = () => number;

/** Small deterministic RNG, so a candidate can be re-simulated identically. */
export function mulberry(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** State where the ball meets the rotor, from the stator part of the flight. */
interface Contact {
  t: number;
  a: number;
  w: number;
  r: number;
  vr: number;
  h: number;
  vh: number;
}

interface Stator {
  samples: number[];
  roll: number[];
  events: BallEvent[];
  contact: Contact;
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * The ball on the fixed bowl: it circles the track against the rotor, slows, drops down the slope
 * (spinning faster as it falls inward), knocks on the brass deflectors and reaches the rotor.
 * Times are relative to the launch.
 */
function simulateStator(a0: number, w0: number, rng: Rng): Stator {
  const samples: number[] = [];
  const roll: number[] = [];
  const events: BallEvent[] = [];
  const drag = 0.9 + rng() * 0.2;
  const leave = 4.6 + rng() * 0.9;
  let a = a0, w = w0, r = GEO.trackR, vr = 0, h = 0, vh = 0;
  let onRim = true;
  let cooldown = 0;
  let t = 0;
  const dt = SIM_DT;
  for (let n = 0; n < 240 * 20; n++) {
    samples.push(a, r, surfaceY(r) + GEO.ballR + h);
    roll.push(h > 0.02 ? 0 : Math.min(1, Math.abs(w) / 12) * (onRim ? 1 : 0.85));
    // Rolling friction and air drag.
    const s = Math.sign(w);
    w -= s * (1.05 + 0.017 * w * w) * drag * dt;
    if (onRim) {
      // Held against the outer wall until it is too slow for the curve.
      if (Math.abs(w) < leave) {
        onRim = false;
        vr = -0.15;
      }
    } else {
      // Down the slope: gravity against what is left of the centrifugal force.
      const ar = -Math.max(0.9, 3.1 - 0.035 * w * w);
      vr += ar * dt;
      const rn = r + vr * dt;
      // Angular momentum: falling inward spins it up.
      w *= (r * r) / (rn * rn);
      r = rn;
      if (r >= GEO.trackR) {
        r = GEO.trackR;
        vr = 0;
        if (Math.abs(w) >= leave) onRim = true;
      }
      // The brass deflectors on the slope.
      cooldown -= dt;
      if (cooldown <= 0 && h < 0.1 && Math.abs(r - GEO.deflectorR) < 0.13) {
        const half = (0.225 + GEO.ballR) / GEO.deflectorR;
        for (let i = 0; i < GEO.deflectors; i++) {
          const d = wrap(a - (i / GEO.deflectors) * TAU);
          const dn = wrap(a + w * dt - (i / GEO.deflectors) * TAU);
          if (Math.abs(dn) < half && Math.abs(d) >= half) {
            const speed = Math.abs(w);
            events.push({ t, kind: 'knock', strength: Math.min(1, speed / 6.5) });
            w *= 0.35 + rng() * 0.4;
            vr = (0.3 + rng() * 1.1) * Math.min(1, speed / 5);
            vh = (1.4 + rng() * 1.8) * Math.min(1.2, speed / 5.5);
            cooldown = 0.12;
            break;
          }
        }
      }
    }
    // Airborne after a knock.
    if (h > 0 || vh > 0) {
      vh -= 16 * dt;
      h += vh * dt;
      if (h <= 0) {
        if (vh < -1.2) events.push({ t, kind: 'tick', strength: Math.min(0.8, -vh / 5) });
        h = 0;
        vh = vh < -0.8 ? -vh * 0.3 : 0;
      }
    }
    a += w * dt;
    t += dt;
    if (r <= GEO.discR) return { samples, roll, events, contact: { t, a, w, r, vr, h, vh } };
  }
  // Never reached the rotor (cannot happen with the constants above): drop it in.
  return { samples, roll, events, contact: { t, a, w, r: GEO.discR, vr: -0.5, h: 0, vh: 0 } };
}

interface RotorPart {
  samples: number[];
  roll: number[];
  events: BallEvent[];
  end: number;
  pocket: number;
}

/**
 * The ball on the turning rotor: dragged along by the number ring, it drops into the pockets and
 * rattles over the separators until it rests. Works in the rotor's frame (ψ = angle − rotor).
 */
function simulateRotor(c: Contact, start: number, plan: RotorPlan, rng: Rng, restR: number): RotorPart {
  const samples: number[] = [];
  const roll: number[] = [];
  const events: BallEvent[] = [];
  const dt = SIM_DT;
  let t = start + c.t;
  let psi = c.a - rotorAngle(plan, t);
  let wr = c.w - rotorSpeed(plan, t);
  let r = c.r, vr = c.vr, h = c.h, vh = c.vh;
  let inPockets = false;
  let cell = Math.round(psi / STEP);
  let still = 0;
  const bounce = 0.3 + rng() * 0.25;
  for (let n = 0; n < 240 * 12; n++) {
    const rot = rotorAngle(plan, t);
    samples.push(rot + psi, r, surfaceY(r) + GEO.ballR + h);
    roll.push(h > 0.02 ? 0 : Math.min(0.7, (Math.abs(wr) * r) / 20));
    const air = h > 0.14;
    if (!inPockets) {
      // Number ring: rolling friction on the moving disc pulls the ball towards the rotor's speed.
      if (!air) wr -= (wr * 0.35 + Math.sign(wr) * 0.3) * dt;
      vr += -1.6 * dt;
      r += vr * dt;
      if (r <= GEO.numbersIn) {
        inPockets = true;
        cell = Math.round(psi / STEP);
        // Dropping over the pocket edge.
        vh = Math.max(vh, 0.6 + rng() * 0.5);
        events.push({ t, kind: 'tick', strength: 0.55 });
      }
    } else {
      // Pocket ring: the curved pocket floor pulls towards the pocket centre and brakes.
      const center = cell * STEP;
      if (!air) {
        wr += (-70 * (psi - center) - 2.4 * wr - Math.sign(wr) * 0.5) * dt;
        // Radially it settles against the back of the pocket.
        vr += (-40 * (r - restR) - 7 * vr) * dt;
      } else vr *= 1 - 0.5 * dt;
      r += vr * dt;
      const inner = GEO.pocketsIn + GEO.ballR;
      if (r < inner) {
        r = inner;
        vr = -vr * 0.4;
      }
      if (r > GEO.numbersIn) {
        r = GEO.numbersIn;
        vr = -Math.abs(vr) * 0.4;
      }
    }
    const next = psi + wr * dt;
    const nextCell = Math.round(next / STEP);
    if (inPockets && nextCell !== cell) {
      const speed = Math.abs(wr) * r;
      if (air) {
        cell = nextCell;
      } else if (speed > 2.6 + rng() * 2.0) {
        // Over the separator: it jumps and loses speed.
        events.push({ t, kind: 'tick', strength: Math.min(1, speed / 12) });
        wr *= 0.7 + rng() * 0.22;
        vh = Math.max(vh, Math.min(2.4, speed * (0.1 + rng() * 0.12)));
        cell = nextCell;
      } else {
        // Bounces back off the separator.
        events.push({ t, kind: 'tick', strength: Math.min(0.9, 0.2 + speed / 10) });
        wr = -wr * (bounce + rng() * 0.2);
        vh = Math.max(vh, speed * 0.05);
      }
    }
    if (!inPockets || nextCell === cell || h > 0.14) psi += wr * dt;
    // Gravity for hops.
    if (h > 0 || vh > 0) {
      vh -= 16 * dt;
      h += vh * dt;
      if (h <= 0) {
        if (vh < -0.9) events.push({ t, kind: 'tick', strength: Math.min(0.7, -vh / 5) });
        h = 0;
        vh = vh < -0.9 ? -vh * 0.28 : 0;
      }
    }
    t += dt;
    if (inPockets && h === 0 && vh === 0 && Math.abs(wr) < 0.06 && Math.abs(psi - cell * STEP) < 0.01 && Math.abs(vr) < 0.05) {
      still += dt;
      if (still > 0.05) break;
    } else still = 0;
  }
  // Rest exactly in the pocket centre.
  const pocket = ((-cell % POCKETS) + POCKETS) % POCKETS;
  const rot = rotorAngle(plan, t);
  samples.push(rot + cell * STEP, restR, surfaceY(restR) + GEO.ballR);
  roll.push(0);
  return { samples, roll, events, end: t, pocket };
}

function join(start: number, st: Stator, rp: RotorPart): BallPath {
  return {
    start,
    end: rp.end,
    samples: Float32Array.from([...st.samples, ...rp.samples]),
    roll: Float32Array.from([...st.roll, ...rp.roll]),
    events: [...st.events.map((e) => ({ ...e, t: e.t + start })), ...rp.events].sort((x, y) => x.t - y.t),
    pocket: rp.pocket,
  };
}

/** Launch of a ball: anywhere on the track, against the rotor, about two turns a second. */
function randomLaunch(rng: Rng): { a: number; w: number } {
  return { a: rng() * TAU, w: -(11.5 + rng() * 2.5) };
}

export interface SpinPlan {
  rotor: RotorPlan;
  balls: BallPath[];
}

/**
 * Plans a spin: the first ball ends in `target`, the optional second in `second`. The rotor starts
 * where it is (`a0`, turning at `w0`).
 */
export function planSpin(a0: number, w0: number, target: number, second?: number, rnd: Rng = Math.random, restR = [POCKET_R, POCKET_R]): SpinPlan {
  const decel = 0.1 + rnd() * 0.06;
  let best: { plan: RotorPlan; path: BallPath; err: number } | undefined;
  for (let attempt = 0; attempt < 12 && !(best && best.err === 0); attempt++) {
    const seed = Math.floor(rnd() * 2 ** 31);
    const launch = randomLaunch(mulberry(seed));
    const st = simulateStator(launch.a, launch.w, mulberry(seed + 1));
    // Try rotor speeds from a random starting point outward; the first that lands right wins.
    const lo = 1.5, hi = 3.1, n = 160;
    const off = Math.floor(rnd() * n);
    for (let k = 0; k < n; k++) {
      const top = lo + ((hi - lo) * ((off + (k % 2 ? -1 : 1) * Math.ceil(k / 2) + n * 4) % n)) / n;
      const plan: RotorPlan = { a0, w0, top, decel };
      const rp = simulateRotor(st.contact, 0, plan, mulberry(seed + 2), restR[0]);
      const err = pocketDist(rp.pocket, target);
      if (!best || err < best.err) best = { plan, path: join(0, st, rp), err };
      if (err === 0) break;
    }
  }
  const plan = best!.plan;
  const balls = [best!.path];
  if (best!.err !== 0) forcePocket(balls[0], target, plan, restR[0]);
  if (second !== undefined) balls.push(planSecond(plan, second, rnd, second === target ? restR[1] : restR[0]));
  return { rotor: plan, balls };
}

/** The second ball: launched a little later, at the moment that makes it land in its pocket. */
function planSecond(plan: RotorPlan, target: number, rnd: Rng, restR: number): BallPath {
  let best: { path: BallPath; err: number } | undefined;
  for (let attempt = 0; attempt < 40 && !(best && best.err === 0); attempt++) {
    const seed = Math.floor(rnd() * 2 ** 31);
    const launch = randomLaunch(mulberry(seed));
    const st = simulateStator(launch.a, launch.w, mulberry(seed + 1));
    const n = 120;
    const off = Math.floor(rnd() * n);
    for (let k = 0; k < n; k++) {
      const start = 0.5 + (0.9 * ((off + k) % n)) / n;
      const rp = simulateRotor(st.contact, start, plan, mulberry(seed + 2), restR);
      const err = pocketDist(rp.pocket, target);
      if (!best || err < best.err) best = { path: join(start, st, rp), err };
      if (err === 0) break;
    }
  }
  if (best!.err !== 0) forcePocket(best!.path, target, plan, restR);
  return best!.path;
}

function pocketDist(a: number, b: number): number {
  const d = Math.abs(a - b) % POCKETS;
  return Math.min(d, POCKETS - d);
}

/** How often a plan needed the fallback below (for tests). */
export const planStats = { forced: 0 };

/** Last resort (practically never needed): the final settle glides into the right pocket. */
function forcePocket(p: BallPath, target: number, plan: RotorPlan, restR: number): void {
  planStats.forced++;
  const s = p.samples;
  const n = s.length / 3;
  const glide = Math.min(n - 1, 60);
  for (let i = 0; i <= glide; i++) {
    const j = n - 1 - glide + i;
    const t = p.start + j * SIM_DT;
    const rot = rotorAngle(plan, t);
    const psi = s[j * 3] - rot;
    const want = -target * STEP + Math.round((psi + target * STEP) / TAU) * TAU;
    const u = i / glide;
    const e = u * u * (3 - 2 * u);
    s[j * 3] = rot + psi + (want - psi) * e;
    s[j * 3 + 1] += (restR - s[j * 3 + 1]) * e;
  }
  p.pocket = target;
}

/** Ball position at spin time t: [angle, radius, height], or undefined before its launch. */
export function sampleAt(p: BallPath, t: number, out: number[]): boolean {
  if (t < p.start) return false;
  const s = p.samples;
  const n = s.length / 3;
  const f = (t - p.start) / SIM_DT;
  const i = Math.min(n - 1, Math.floor(f));
  const j = Math.min(n - 1, i + 1);
  const u = Math.min(1, f - i);
  out[0] = s[i * 3] + (s[j * 3] - s[i * 3]) * u;
  out[1] = s[i * 3 + 1] + (s[j * 3 + 1] - s[i * 3 + 1]) * u;
  out[2] = s[i * 3 + 2] + (s[j * 3 + 2] - s[i * 3 + 2]) * u;
  return true;
}

export function rollAt(p: BallPath, t: number): number {
  if (t < p.start) return 0;
  const i = Math.min(p.roll.length - 1, Math.floor((t - p.start) / SIM_DT));
  return p.roll[i];
}
