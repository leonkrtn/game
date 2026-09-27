import * as THREE from 'three';
import { mergeStatic } from './merge';
import type { Pocket } from '../game/types';
import { POCKET_COUNT } from '../game/wheel';
import { drawWheelTexture, pocketAngle, WHEEL_RADII } from './textures';
import { planSpin, rollAt, rotorAngle, rotorSpeed, sampleAt, surfaceY, type BallPath, type SpinPlan } from './ballphysics';

const TAU = Math.PI * 2;
const STEP = TAU / POCKET_COUNT;
const DISC_Y = 1.6;
const TRACK_R = 4.75;
const TRACK_Y = DISC_Y + 0.55;
const POCKET_R = (WHEEL_RADII.pocketsIn + WHEEL_RADII.numbersIn) / 2;
const BALL_R = 0.17;

const smooth = (u: number) => u * u * (3 - 2 * u);

/** One ball: the normal one, or the second of a double-ball spin. */
interface Ball {
  mesh: THREE.Mesh;
  path?: BallPath;
  /** Next event to fire. */
  ev: number;
  settled: boolean;
  /** Resting place relative to the rotor. */
  angle: number;
  r: number;
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
  /** The simulated spin being played back, and its clock. */
  private plan?: SpinPlan;
  private clock = 0;
  private pendingHop?: number;
  private hop?: { t: number; from: number; delta: number; r0: number };
  /** Rotor speed (rad/s) outside a spin: it slows down to a lazy idle. */
  private rotorW = 0.15;
  private readonly idleSpeed = 0.15;
  private readonly tmp = [0, 0, 0];
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
    this.balls = [this.ball, this.ball2].map((mesh) => ({ mesh, ev: 0, settled: true, angle: 0, r: POCKET_R }));

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
    return !!this.plan;
  }

  /** 0..1 progress of the current spin until the first ball rests (0 when idle). */
  get progress(): number {
    const b = this.plan?.balls[0];
    return b ? Math.min(1, this.clock / b.end) : 0;
  }

  refresh(wheel: Pocket[], highlight?: number, marks?: number[]): void {
    drawWheelTexture(this.canvas, wheel, highlight, marks);
    this.texture.needsUpdate = true;
  }

  /**
   * Starts a spin that ends with the ball resting in `target`, optionally hopping on into `hopTo`.
   * With `second`, a second (golden) ball is launched a moment later and rests in that pocket.
   * The whole spin is simulated physically up front (see ballphysics).
   */
  spin(target: number, hopTo?: number, second?: number): void {
    const same = second === target;
    const rest = same ? [POCKET_R - 0.19, POCKET_R + 0.19] : [POCKET_R, POCKET_R];
    this.plan = planSpin(this.rotor.rotation.y, this.rotorW, target, second, Math.random, rest);
    this.clock = 0;
    this.hop = undefined;
    this.pendingHop = hopTo;
    for (const [i, b] of this.balls.entries()) {
      b.path = this.plan.balls[i];
      b.ev = 0;
      b.settled = !b.path;
      b.mesh.visible = false;
    }
  }

  /** Makes the resting ball jump into another pocket (a nudge), as if luck did it. */
  queueHop(to: number): void {
    if (this.plan && !this.balls[0].settled) this.pendingHop = to;
  }

  /**
   * Advances the playback. Returns 'landed' when the first ball rests before a hop, and 'done'
   * on the frame every ball is finally at rest.
   */
  update(dt: number, speedUp = 1): 'none' | 'landed' | 'done' {
    const plan = this.plan;
    if (!plan) {
      this.rotorW += (this.idleSpeed - this.rotorW) * (1 - Math.exp(-dt / 1.6));
      this.rotor.rotation.y += this.rotorW * dt;
      this.roll = 0;
      for (const b of this.balls) if (b.mesh.visible) this.placeResting(b);
      return 'none';
    }
    this.clock += dt * speedUp;
    const t = this.clock;
    this.rotor.rotation.y = rotorAngle(plan.rotor, t);
    let ev: 'none' | 'landed' | 'done' = 'none';
    let roll = 0;
    for (const [i, b] of this.balls.entries()) {
      const p = b.path;
      if (!p) continue;
      if (b.settled) {
        if (!(i === 0 && this.hop)) this.placeResting(b);
        continue;
      }
      if (!sampleAt(p, t, this.tmp)) continue;
      b.mesh.visible = true;
      const [a, r, y] = this.tmp;
      b.mesh.position.set(Math.cos(a) * r, y, -Math.sin(a) * r);
      roll = Math.max(roll, rollAt(p, t));
      while (b.ev < p.events.length && p.events[b.ev].t <= t) {
        const e = p.events[b.ev++];
        if (e.kind === 'knock') this.onKnock?.(e.strength);
        else this.onTick?.(e.strength);
      }
      if (t >= p.end) {
        b.settled = true;
        b.angle = pocketAngle(p.pocket);
        b.r = Math.hypot(b.mesh.position.x, b.mesh.position.z);
        this.placeResting(b);
        if (i === 0 && this.pendingHop !== undefined) {
          let delta = pocketAngle(this.pendingHop) - b.angle;
          delta = Math.atan2(Math.sin(delta), Math.cos(delta));
          this.hop = { t: -0.55, from: b.angle, delta, r0: b.r };
          this.pendingHop = undefined;
          ev = 'landed';
        }
      }
    }
    this.roll = roll;
    if (this.hop) this.updateHop(dt * speedUp);
    if (ev === 'landed') return ev;
    if (this.balls.every((b) => b.settled) && !this.hop) {
      this.rotorW = rotorSpeed(plan.rotor, t);
      this.plan = undefined;
      return 'done';
    }
    return 'none';
  }

  /** The ball sits for a moment, then jumps over the separator into the lucky pocket. */
  private updateHop(dt: number): void {
    const h = this.hop!;
    h.t += dt;
    const u = Math.max(0, Math.min(1, h.t / 0.5));
    const lift = Math.sin(u * Math.PI) * 0.9;
    const b = this.balls[0];
    b.angle = h.from + h.delta * smooth(u);
    b.r = h.r0 + (POCKET_R - h.r0) * u;
    const world = this.rotor.rotation.y + b.angle;
    const r = b.r + lift * 0.3;
    b.mesh.position.set(Math.cos(world) * r, surfaceY(b.r) + BALL_R + lift, -Math.sin(world) * r);
    if (h.t >= 0.5) {
      this.hop = undefined;
      this.onTick?.(1);
    }
  }

  private placeResting(b: Ball): void {
    const world = this.rotor.rotation.y + b.angle;
    b.mesh.position.set(Math.cos(world) * b.r, surfaceY(b.r) + BALL_R, -Math.sin(world) * b.r);
  }

  hideBall(): void {
    this.ball.visible = false;
    this.ball2.visible = false;
  }
}
