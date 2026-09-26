import * as THREE from 'three';
import { mergeStatic } from './merge';
import type { Pocket } from '../game/types';
import { POCKET_COUNT } from '../game/wheel';
import { drawWheelTexture, pocketAngle, WHEEL_RADII } from './textures';

const TAU = Math.PI * 2;
const STEP = TAU / POCKET_COUNT;
const DISC_Y = 1.6;
const TRACK_R = 4.75;
const TRACK_Y = DISC_Y + 0.55;
const POCKET_R = (WHEEL_RADII.pocketsIn + WHEEL_RADII.numbersIn) / 2;
const BALL_R = 0.17;

const easeOutCubic = (u: number) => 1 - Math.pow(1 - u, 3);
const easeOutQuad = (u: number) => 1 - Math.pow(1 - u, 2);
const smooth = (u: number) => u * u * (3 - 2 * u);

interface SpinAnim {
  t: number;
  duration: number;
  b0: number;
  db: number;
  target: number;
  lastPocket: number;
  /** Deflector hits: progress points where the ball knocks on a brass diamond. */
  knocks: number[];
  /** How wild the final rattle over the separators is. */
  rattle: number;
  knocked: number;
  done: boolean;
}

/** One ball: the normal one, or the second of a double-ball spin. */
interface Ball {
  mesh: THREE.Mesh;
  anim?: SpinAnim;
  angle: number;
}

export class Wheel3D {
  readonly group = new THREE.Group();
  readonly rotor = new THREE.Group();
  readonly ball: THREE.Mesh;
  /** The second ball of a double-ball spin. */
  readonly ball2: THREE.Mesh;
  private balls: Ball[];
  private canvas = document.createElement('canvas');
  private texture: THREE.CanvasTexture;
  private rotorSpin?: { t: number; duration: number; r0: number; dr: number };
  private pendingHop?: number;
  private hop?: { t: number; from: number; delta: number };
  private idleSpeed = 0.15;
  onTick?: (strength: number) => void;
  /** The ball knocks on a deflector (strength 0..1). */
  onKnock?: (strength: number) => void;
  /** How fast the ball rolls right now (0..1), for the rolling sound. */
  roll = 0;

  constructor() {
    this.canvas.width = this.canvas.height = 2048;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;

    const wood = new THREE.MeshPhysicalMaterial({ color: 0x3b1a0a, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.08 });
    const brass = new THREE.MeshStandardMaterial({ color: 0xd6ad52, roughness: 0.18, metalness: 1 });

    // Pedestal and bowl.
    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 5, 1.2, 64), wood);
    pedestal.position.y = 0.6;
    const profile = [
      new THREE.Vector2(4.2, DISC_Y - 0.1),
      new THREE.Vector2(4.35, DISC_Y + 0.2),
      new THREE.Vector2(TRACK_R - 0.1, TRACK_Y - 0.12),
      new THREE.Vector2(TRACK_R + 0.25, TRACK_Y - 0.05),
      new THREE.Vector2(5.35, TRACK_Y + 0.35),
      new THREE.Vector2(5.9, TRACK_Y + 0.45),
      new THREE.Vector2(6.1, TRACK_Y + 0.2),
      new THREE.Vector2(6.1, 0.9),
      new THREE.Vector2(5, 0.9),
    ];
    const bowl = new THREE.Mesh(new THREE.LatheGeometry(profile, 96), wood);
    const trackRing = new THREE.Mesh(
      new THREE.TorusGeometry(5.9, 0.07, 8, 96),
      brass,
    );
    trackRing.rotation.x = Math.PI / 2;
    trackRing.position.y = TRACK_Y + 0.45;
    // Brass deflectors on the slope.
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      const d = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.45), brass);
      d.position.set(Math.cos(a) * 4.5, TRACK_Y - 0.25, -Math.sin(a) * 4.5);
      d.rotation.y = a;
      d.rotation.z = 0.35;
      this.group.add(d);
    }

    // Rotor: textured disc, 3D separators and the center turret.
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(WHEEL_RADII.disc, 128),
      new THREE.MeshPhysicalMaterial({ map: this.texture, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.05 }),
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = DISC_Y;
    this.rotor.add(disc);
    const sepGeo = new THREE.BoxGeometry(WHEEL_RADII.numbersIn - WHEEL_RADII.pocketsIn, 0.16, 0.04);
    for (let i = 0; i < POCKET_COUNT; i++) {
      const a = pocketAngle(i) + STEP / 2;
      const s = new THREE.Mesh(sepGeo, brass);
      s.position.set(Math.cos(a) * POCKET_R, DISC_Y + 0.08, -Math.sin(a) * POCKET_R);
      s.rotation.y = a;
      this.rotor.add(s);
    }
    const cone = new THREE.Mesh(new THREE.ConeGeometry(WHEEL_RADII.pocketsIn - 0.05, 0.9, 64, 1, true), wood);
    cone.position.y = DISC_Y + 0.45;
    const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 1.4, 24), brass);
    turret.position.y = DISC_Y + 1.1;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 16), brass);
    knob.position.y = DISC_Y + 1.9;
    this.rotor.add(cone, turret, knob);
    for (let i = 0; i < 4; i++) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.8, 12), brass);
      arm.rotation.z = Math.PI / 2;
      arm.rotation.y = (i * Math.PI) / 2;
      arm.position.y = DISC_Y + 1.6;
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), brass);
      ball.position.set(Math.cos((i * Math.PI) / 2) * 0.95, DISC_Y + 1.6, -Math.sin((i * Math.PI) / 2) * 0.95);
      this.rotor.add(arm, ball);
    }

    this.ball = new THREE.Mesh(
      new THREE.SphereGeometry(BALL_R, 24, 16),
      new THREE.MeshPhysicalMaterial({ color: 0xf6f0e2, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 }),
    );
    this.ball.visible = false;
    this.ball2 = new THREE.Mesh(this.ball.geometry, new THREE.MeshPhysicalMaterial({ color: 0xffd24a, roughness: 0.15, metalness: 0.6, clearcoat: 1 }));
    this.ball2.visible = false;
    this.balls = [{ mesh: this.ball, angle: 0 }, { mesh: this.ball2, angle: 0 }];

    for (const m of [pedestal, bowl, disc, cone, this.ball, this.ball2]) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
    this.group.add(pedestal, bowl, trackRing, this.rotor, this.ball, this.ball2);
    // Separators, arms and deflectors are the same brass: merge them (the rotor turns as one piece).
    mergeStatic([this.rotor], [], this.rotor);
    mergeStatic([this.group], [this.rotor, this.ball, this.ball2], this.group);
  }

  get spinning(): boolean {
    return !!this.rotorSpin || !!this.hop;
  }

  /** 0..1 progress of the current spin (0 when idle). */
  get progress(): number {
    const a = this.balls[0].anim;
    return a ? a.t / a.duration : 0;
  }

  refresh(wheel: Pocket[], highlight?: number, marks?: number[]): void {
    drawWheelTexture(this.canvas, wheel, highlight, marks);
    this.texture.needsUpdate = true;
  }

  /**
   * Starts a spin that ends with the ball resting in `target`, optionally hopping on into `hopTo`.
   * With `second`, a second (golden) ball runs too and rests in that pocket a little later.
   */
  spin(target: number, duration = 6, hopTo?: number, second?: number): void {
    const r0 = this.rotor.rotation.y;
    const dr = TAU * (1.4 + Math.random() * 0.6);
    const total = duration + (second !== undefined ? 0.9 : 0);
    this.rotorSpin = { t: 0, duration: total, r0, dr };
    this.launch(this.balls[0], target, duration, r0, dr, total);
    if (second !== undefined) this.launch(this.balls[1], second, duration + 0.9, r0, dr, total);
    else this.balls[1].mesh.visible = false;
    this.pendingHop = hopTo;
  }

  private launch(b: Ball, target: number, duration: number, r0: number, dr: number, total: number): void {
    const b0 = r0 + Math.random() * TAU;
    // Where the rotor will be when this ball stops.
    const rEnd = r0 + dr * easeOutQuad(duration / total);
    // Ball runs the other way; pick the full-turn count so it travels 5–6 turns.
    let db = pocketAngle(target) + rEnd - b0;
    db = ((db % TAU) + TAU) % TAU - TAU * 6;
    const knocks = [0.5 + Math.random() * 0.06, 0.6 + Math.random() * 0.06];
    if (Math.random() < 0.5) knocks.push(0.7 + Math.random() * 0.04);
    b.anim = { t: 0, duration, b0, db, target, lastPocket: -1, knocks, rattle: 0.8 + Math.random() * 0.8, knocked: 0, done: false };
    b.mesh.visible = true;
  }

  /** Makes the resting ball jump into another pocket (a nudge), as if luck did it. */
  queueHop(to: number): void {
    if (this.balls[0].anim && !this.balls[0].anim.done) this.pendingHop = to;
  }

  /**
   * Advances the animation. Returns 'landed' when the first ball rests before a hop, and 'done'
   * on the frame every ball is finally at rest.
   */
  update(dt: number, speedUp = 1): 'none' | 'landed' | 'done' {
    if (this.hop) return this.updateHop(dt * speedUp);
    const rs = this.rotorSpin;
    if (!rs) {
      this.rotor.rotation.y += this.idleSpeed * dt;
      this.roll = 0;
      for (const b of this.balls) if (b.mesh.visible) this.placeResting(b);
      return 'none';
    }
    rs.t = Math.min(rs.duration, rs.t + dt * speedUp);
    this.rotor.rotation.y = rs.r0 + rs.dr * easeOutQuad(rs.t / rs.duration);
    let ev: 'none' | 'landed' | 'done' = 'none';
    let roll = 0;
    for (const [i, b] of this.balls.entries()) {
      const a = b.anim;
      if (!a) continue;
      if (a.done) {
        this.placeResting(b);
        continue;
      }
      a.t = Math.min(a.duration, a.t + dt * speedUp);
      const u = a.t / a.duration;
      roll = Math.max(roll, u < 0.55 ? 1 - u * 0.6 : Math.max(0, 0.7 - (u - 0.55) * 1.8));
      this.moveBall(b, a, u);
      if (a.t >= a.duration) {
        a.done = true;
        b.angle = pocketAngle(a.target);
        this.onTick?.(0.9);
        if (i === 0 && this.pendingHop !== undefined) {
          const from = pocketAngle(a.target);
          let delta = pocketAngle(this.pendingHop) - from;
          delta = Math.atan2(Math.sin(delta), Math.cos(delta));
          this.hop = { t: -0.55, from, delta };
          this.pendingHop = undefined;
          ev = 'landed';
        }
      }
    }
    this.roll = roll;
    if (ev === 'landed') return ev;
    if (this.balls.every((b) => !b.anim || b.anim.done) && !this.hop) {
      this.rotorSpin = undefined;
      for (const b of this.balls) b.anim = undefined;
      return 'done';
    }
    return 'none';
  }

  /**
   * The ball's path: fast on the track, knocked by the diamonds as it drops, then rattling over
   * the separators before it settles in its pocket.
   */
  private moveBall(b: Ball, a: SpinAnim, u: number): void {
    let world = a.b0 + a.db * easeOutCubic(u);
    let r = TRACK_R + Math.sin(u * 40) * 0.02 * (1 - u);
    let y = TRACK_Y;
    if (u > 0.5) {
      const s = smooth(Math.min(1, (u - 0.5) / 0.3));
      r = TRACK_R + (POCKET_R - TRACK_R) * s;
      y = TRACK_Y + (DISC_Y + 0.12 - TRACK_Y) * s;
      // Knocks on the diamonds: a short, sharp jump outwards and up.
      for (let k = 0; k < a.knocks.length; k++) {
        const d = u - a.knocks[k];
        if (d > 0 && d < 0.035) {
          const j = Math.sin((d / 0.035) * Math.PI);
          y += j * (0.5 - k * 0.12);
          r += j * 0.25;
        }
        if (d > 0 && a.knocked === k) {
          a.knocked++;
          this.onKnock?.(1 - k * 0.25);
        }
      }
      // Rattle: the ball bounces back and forth over a few separators, dying out.
      if (u > 0.8) {
        const q = (u - 0.8) / 0.2;
        const env = Math.pow(1 - q, 2);
        world += STEP * a.rattle * env * Math.sin(q * Math.PI * 4.5);
        y += Math.abs(Math.sin(q * Math.PI * 9)) * 0.22 * env;
      }
      const rel = world - this.rotor.rotation.y;
      const pocket = Math.round(-rel / STEP);
      if (pocket !== a.lastPocket && s > 0.6) {
        if (a.lastPocket !== -1) this.onTick?.(1 - u * 0.8);
        a.lastPocket = pocket;
      }
    }
    b.mesh.position.set(Math.cos(world) * r, y + BALL_R * 0.4, -Math.sin(world) * r);
  }

  /** The ball sits for a moment, then jumps over the separator into the lucky pocket. */
  private updateHop(dt: number): 'none' | 'done' {
    const h = this.hop!;
    const rs = this.rotorSpin;
    if (rs) {
      rs.t = Math.min(rs.duration, rs.t + dt);
      this.rotor.rotation.y = rs.r0 + rs.dr * easeOutQuad(rs.t / rs.duration);
    } else this.rotor.rotation.y += this.idleSpeed * dt;
    h.t += dt;
    const u = Math.max(0, Math.min(1, h.t / 0.5));
    const lift = Math.sin(u * Math.PI) * 0.9;
    const b = this.balls[0];
    b.angle = h.from + h.delta * smooth(u);
    const world = this.rotor.rotation.y + b.angle;
    b.mesh.position.set(Math.cos(world) * (POCKET_R + lift * 0.3), DISC_Y + 0.12 + lift + BALL_R * 0.4, -Math.sin(world) * (POCKET_R + lift * 0.3));
    if (this.balls[1].mesh.visible && this.balls[1].anim?.done !== false) this.placeResting(this.balls[1]);
    if (h.t >= 0.5) {
      this.hop = undefined;
      this.onTick?.(1);
      // The second ball may still be rolling: let the normal update finish it.
      if (this.balls[1].anim && !this.balls[1].anim.done) return 'none';
      this.rotorSpin = undefined;
      for (const x of this.balls) x.anim = undefined;
      return 'done';
    }
    return 'none';
  }

  private placeResting(b: Ball): void {
    const world = this.rotor.rotation.y + b.angle;
    b.mesh.position.set(Math.cos(world) * POCKET_R, DISC_Y + 0.12 + BALL_R * 0.4, -Math.sin(world) * POCKET_R);
  }

  hideBall(): void {
    this.ball.visible = false;
    this.ball2.visible = false;
  }
}
