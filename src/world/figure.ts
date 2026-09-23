import * as THREE from 'three';

export interface FigureStyle {
  suit: number;
  skin?: number;
  hat?: 'top' | 'none' | 'visor';
  tie?: number;
  shades?: boolean;
  /** Overall size multiplier; 1 is about 1.8 m tall. */
  scale?: number;
  /** Chunkier torso for the debt collectors. */
  bulky?: boolean;
}

const mat = (color: number, rough = 0.6, metal = 0) =>
  new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });

/** A stylized person built from primitives, with a simple walk cycle. */
export class Figure {
  readonly group = new THREE.Group();
  readonly hand = new THREE.Group();
  private body = new THREE.Group();
  private armL: THREE.Mesh;
  private armR: THREE.Mesh;
  private legs: THREE.Mesh[] = [];
  private phase = Math.random() * 10;
  private hop = 0;
  heading = 0;
  holding = false;

  constructor(style: FigureStyle) {
    const s = 0.74 * (style.scale ?? 1);
    const suit = mat(style.suit);
    const skin = mat(style.skin ?? 0xf1c7a0, 0.7);
    const white = mat(0xf4f1ea);
    const black = mat(0x111114, 0.4);
    const tie = mat(style.tie ?? 0xc8202c, 0.5);

    const w = style.bulky ? 1.35 : 1;
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.55, 8, 16), suit);
    torso.scale.set(w, 1, style.bulky ? 1.15 : 1);
    torso.position.y = 0.95;
    const shirt = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.5, 0.1), white);
    shirt.position.set(0, 1.15, 0.36 * (style.bulky ? 1.15 : 1));
    const bow = new THREE.Mesh(new THREE.OctahedronGeometry(0.1), tie);
    bow.scale.set(1.8, 0.8, 0.6);
    bow.position.set(0, 1.38, 0.42 * (style.bulky ? 1.12 : 1));
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.36, 24, 18), skin);
    head.position.y = 1.82;
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), skin);
    nose.position.set(0, 1.8, 0.36);
    this.body.add(torso, shirt, bow, head, nose);

    if (style.shades) {
      const glasses = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.1, 0.05), black);
      glasses.position.set(0, 1.9, 0.32);
      this.body.add(glasses);
    } else {
      const eyeGeo = new THREE.SphereGeometry(0.045, 10, 8);
      for (const x of [-0.13, 0.13]) {
        const eye = new THREE.Mesh(eyeGeo, black);
        eye.position.set(x, 1.88, 0.32);
        this.body.add(eye);
      }
    }
    if (style.hat === 'top') {
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.05, 28), black);
      brim.position.y = 2.1;
      const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.55, 28), black);
      hat.position.y = 2.38;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.325, 0.325, 0.1, 28), tie);
      band.position.y = 2.19;
      this.body.add(brim, hat, band);
    } else if (style.hat === 'visor') {
      const visor = new THREE.Mesh(
        new THREE.CylinderGeometry(0.42, 0.42, 0.04, 24, 1, false, -Math.PI / 2, Math.PI),
        new THREE.MeshStandardMaterial({ color: 0x3aa35a, transparent: true, opacity: 0.8 }),
      );
      visor.position.set(0, 2.02, 0.15);
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.03, 6, 24), mat(0x3aa35a));
      band.rotation.x = Math.PI / 2;
      band.position.y = 2.02;
      this.body.add(visor, band);
    }

    const armGeo = new THREE.CapsuleGeometry(0.11 * w, 0.45, 6, 10);
    armGeo.translate(0, -0.25, 0);
    this.armL = new THREE.Mesh(armGeo, suit);
    this.armR = new THREE.Mesh(armGeo, suit);
    this.armL.position.set(-0.5 * w, 1.32, 0);
    this.armR.position.set(0.5 * w, 1.32, 0);
    const legGeo = new THREE.CapsuleGeometry(0.13 * w, 0.35, 6, 10);
    legGeo.translate(0, -0.2, 0);
    for (const x of [-0.18, 0.18]) {
      const leg = new THREE.Mesh(legGeo, black);
      leg.position.set(x * w, 0.5, 0);
      this.legs.push(leg);
      this.body.add(leg);
    }
    this.hand.position.set(0.5 * w, 1.0, 0.45);
    this.body.add(this.armL, this.armR, this.hand);
    this.body.scale.setScalar(s);
    this.body.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = true;
    });
    this.group.add(this.body);
  }

  /** Animates limbs for the given ground speed (m/s). */
  animate(dt: number, speed: number): void {
    const k = Math.min(1, speed / 2.5);
    this.phase += dt * speed * 5.5;
    const swing = Math.sin(this.phase) * k;
    this.armL.rotation.x = swing * 0.7;
    this.armR.rotation.x = -swing * 0.7 - (this.holding ? 0.9 : 0);
    this.legs[0].rotation.x = -swing * 0.6;
    this.legs[1].rotation.x = swing * 0.6;
    this.hop = Math.max(0, this.hop - dt * 4);
    this.body.position.y = Math.abs(Math.sin(this.phase)) * 0.06 * k + Math.sin(this.hop * Math.PI) * 0.25;
    this.body.rotation.x = Math.min(0.12, speed * 0.03);
    this.group.rotation.y = this.heading;
  }

  bounce(): void {
    this.hop = 1;
  }

  /** Turns smoothly towards a direction in the XZ plane. */
  face(dx: number, dz: number, dt: number, rate = 12): void {
    const want = Math.atan2(dx, dz);
    let d = want - this.heading;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.heading += d * (1 - Math.exp(-rate * dt));
  }

  /** Walks towards a point; returns true once arrived. */
  walkTo(x: number, z: number, dt: number, speed = 1.8): boolean {
    const p = this.group.position;
    const dx = x - p.x, dz = z - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) {
      this.animate(dt, 0);
      return true;
    }
    const step = Math.min(d, speed * dt);
    p.x += (dx / d) * step;
    p.z += (dz / d) * step;
    this.face(dx, dz, dt);
    this.animate(dt, speed);
    return false;
  }
}
