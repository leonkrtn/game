import * as THREE from 'three';
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
  r0: number;
  dr: number;
  b0: number;
  db: number;
  target: number;
  lastPocket: number;
}

export class Wheel3D {
  readonly group = new THREE.Group();
  readonly rotor = new THREE.Group();
  readonly ball: THREE.Mesh;
  private canvas = document.createElement('canvas');
  private texture: THREE.CanvasTexture;
  private anim?: SpinAnim;
  private ballAngle = 0;
  private idleSpeed = 0.15;
  onTick?: (strength: number) => void;

  constructor() {
    this.canvas.width = this.canvas.height = 2048;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;

    const wood = new THREE.MeshStandardMaterial({ color: 0x3b1d0c, roughness: 0.45, metalness: 0.1 });
    const brass = new THREE.MeshStandardMaterial({ color: 0xd9ae4c, roughness: 0.25, metalness: 0.9 });

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
      new THREE.MeshStandardMaterial({ map: this.texture, roughness: 0.35, metalness: 0.15 }),
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
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.15, metalness: 0.1 }),
    );
    this.ball.visible = false;

    for (const m of [pedestal, bowl, disc, cone, this.ball]) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
    this.group.add(pedestal, bowl, trackRing, this.rotor, this.ball);
  }

  get spinning(): boolean {
    return !!this.anim;
  }

  refresh(wheel: Pocket[], highlight?: number): void {
    drawWheelTexture(this.canvas, wheel, highlight);
    this.texture.needsUpdate = true;
  }

  /** Starts a spin that ends with the ball resting in `target`. */
  spin(target: number, duration = 6): void {
    const r0 = this.rotor.rotation.y;
    const dr = TAU * (1.4 + Math.random() * 0.6);
    const b0 = r0 + Math.random() * TAU;
    // Ball runs the other way; pick the full-turn count so it travels 5–6 turns.
    let db = pocketAngle(target) + r0 + dr - b0;
    db = ((db % TAU) + TAU) % TAU - TAU * 6;
    this.anim = { t: 0, duration, r0, dr, b0, db, target, lastPocket: -1 };
    this.ball.visible = true;
  }

  /** Advances the animation. Returns true on the frame the ball comes to rest. */
  update(dt: number, speedUp = 1): boolean {
    const a = this.anim;
    if (!a) {
      this.rotor.rotation.y += this.idleSpeed * dt;
      if (this.ball.visible) this.placeBall(0, POCKET_R, DISC_Y + 0.12, true);
      return false;
    }
    a.t = Math.min(a.duration, a.t + dt * speedUp);
    const u = a.t / a.duration;
    this.rotor.rotation.y = a.r0 + a.dr * easeOutQuad(u);
    const world = a.b0 + a.db * easeOutCubic(u);

    let r = TRACK_R, y = TRACK_Y;
    if (u > 0.55) {
      const s = smooth(Math.min(1, (u - 0.55) / 0.27));
      r = TRACK_R + (POCKET_R - TRACK_R) * s;
      y = TRACK_Y + (DISC_Y + 0.12 - TRACK_Y) * s + Math.abs(Math.sin(s * Math.PI * 3.5)) * 0.35 * (1 - s);
      const rel = world - this.rotor.rotation.y;
      const pocket = Math.round(-rel / STEP);
      if (pocket !== a.lastPocket && s > 0.6) {
        if (a.lastPocket !== -1) this.onTick?.(1 - u);
        a.lastPocket = pocket;
      }
    }
    this.placeBall(world, r, y, false);

    if (a.t >= a.duration) {
      this.ballAngle = pocketAngle(a.target);
      this.anim = undefined;
      return true;
    }
    return false;
  }

  private placeBall(angle: number, r: number, y: number, attached: boolean): void {
    const world = attached ? this.rotor.rotation.y + this.ballAngle : angle;
    this.ball.position.set(Math.cos(world) * r, y + BALL_R * 0.4, -Math.sin(world) * r);
  }

  hideBall(): void {
    this.ball.visible = false;
  }
}
