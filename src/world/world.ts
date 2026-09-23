import * as THREE from 'three';
import { CHIPS } from '../game/content';
import { FIELDS } from '../game/fields';
import type { Pocket } from '../game/types';
import { Figure } from './figure';
import {
  DOOR, FIELD_RECTS, fieldAt, fieldCenter, KASSE, KASSE_SPOT, LAYOUT_BOUNDS, OBSTACLES, ROOM, TABLE,
  TABLE_LAYOUT, TABLE_SPOT, TABLE_WHEEL,
} from './layout';
import { boardTexture, BOARD_SIZE, carpetTexture, chipTexture } from './textures';
import { Wheel3D } from './wheel3d';

const CHIP_H = 0.011;
const CHIP_R = 0.036;
const WALK = 2.6;
const SPRINT = 4.4;
const PLAYER_R = 0.3;

interface Tween {
  t: number;
  dur: number;
  step: (u: number) => void;
  done?: () => void;
}

export type CameraMode = 'room' | 'table' | 'wheel' | 'kasse' | 'caught';

function textTexture(text: string, w: number, h: number, font: string, color: string, glow?: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (glow) {
    g.shadowColor = glow;
    g.shadowBlur = h * 0.25;
  } else {
    g.fillStyle = '#0c4a22';
    g.fillRect(0, 0, w, h);
  }
  g.fillStyle = color;
  g.fillText(text, w / 2, h / 2);
  g.fillText(text, w / 2, h / 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class World {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(50, 1, 0.05, 100);
  readonly player = new Figure({ suit: 0x2a1f4a, hat: 'top' });
  readonly croupier = new Figure({ suit: 0x1b1b1f, hat: 'visor', tie: 0x111111 });
  readonly cashier = new Figure({ suit: 0x5a2230, skin: 0xd9a47a, tie: 0xe0b44a });
  readonly thugs = [
    new Figure({ suit: 0x0e0e10, hat: 'none', shades: true, bulky: true, scale: 1.12, tie: 0x0e0e10, skin: 0xc99270 }),
    new Figure({ suit: 0x0e0e10, hat: 'none', shades: true, bulky: true, scale: 1.18, tie: 0x0e0e10, skin: 0xe8b894 }),
  ];
  readonly wheel = new Wheel3D();
  readonly layout = new THREE.Group();
  cameraMode: CameraMode = 'room';

  private felt!: THREE.Mesh;
  private raycaster = new THREE.Raycaster();
  private chipGeo = new THREE.CylinderGeometry(CHIP_R, CHIP_R, CHIP_H, 32);
  private chipSide = new Map<string, THREE.MeshStandardMaterial>();
  private chipMeshes = new Map<number, THREE.Mesh>();
  private stacks = new Map<string, number[]>();
  private highlights = new Map<string, THREE.Mesh>();
  private coinMeshes = new Map<number, THREE.Object3D>();
  private ghost?: THREE.Mesh;
  private ghostDef?: string;
  private tweens: Tween[] = [];
  private camPos = new THREE.Vector3(0, 5, 9);
  private camLook = new THREE.Vector3(0, 0.8, 0);
  private time = 0;
  private sparks: { mesh: THREE.Mesh; vel: THREE.Vector3; life: number }[] = [];
  private sparkGeo = new THREE.OctahedronGeometry(0.012);
  private velocity = new THREE.Vector3();
  private thugState: 'away' | 'coming' | 'waiting' | 'leaving' | 'attacking' = 'away';

  hoverField?: string;
  pulseFields = new Set<string>();

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x07040a);
    this.buildRoom();
    this.buildTable();
    this.buildKasse();

    this.player.group.position.set(DOOR.x + 0.8, 0, DOOR.z + 2.2);
    this.player.heading = Math.PI * 0.8;
    this.croupier.group.position.set(TABLE.x - 0.05, 0, TABLE.z - TABLE.halfD - 0.4);
    this.croupier.heading = 0;
    this.cashier.group.position.set(KASSE.x, 0, KASSE.z - 0.75);
    this.cashier.heading = 0;
    for (const t of this.thugs) {
      t.group.position.set(DOOR.x, 0, DOOR.z - 1);
      t.group.visible = false;
    }
    this.scene.add(this.player.group, this.croupier.group, this.cashier.group, ...this.thugs.map((t) => t.group));

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  private resize(): void {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ---- Building the casino -------------------------------------------------

  private buildRoom(): void {
    const W = ROOM.x1 - ROOM.x0, D = ROOM.z1 - ROOM.z0;
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(W, D),
      new THREE.MeshStandardMaterial({ map: carpetTexture(), roughness: 0.95 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const wallMat = new THREE.MeshStandardMaterial({ color: 0x3b1420, roughness: 0.85 });
    const panelMat = new THREE.MeshStandardMaterial({ color: 0x2a1208, roughness: 0.5 });
    const trim = new THREE.MeshStandardMaterial({ color: 0xd9ae4c, roughness: 0.3, metalness: 0.9 });
    const H = ROOM.height;
    const wall = (w: number, x: number, z: number, rot: number) => {
      const g = new THREE.Group();
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, H), wallMat);
      m.position.y = H / 2;
      m.receiveShadow = true;
      const panel = new THREE.Mesh(new THREE.BoxGeometry(w, 1.0, 0.05), panelMat);
      panel.position.set(0, 0.5, 0.025);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, 0.07), trim);
      rail.position.set(0, 1.0, 0.035);
      g.add(m, panel, rail);
      g.position.set(x, 0, z);
      g.rotation.y = rot;
      this.scene.add(g);
    };
    wall(W, 0, ROOM.z0, 0);
    wall(D, ROOM.x0, 0, Math.PI / 2);
    wall(D, ROOM.x1, 0, -Math.PI / 2);
    // Low front wall so the room still reads as closed without blocking the camera.
    const front = new THREE.Mesh(new THREE.BoxGeometry(W, 0.35, 0.12), panelMat);
    front.position.set(0, 0.175, ROOM.z1);
    this.scene.add(front);

    // Door the debt collectors come through.
    const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.3, 0.1), trim);
    doorFrame.position.set(DOOR.x, 1.15, DOOR.z + 0.03);
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.15, 0.12), new THREE.MeshStandardMaterial({ color: 0x1a0c06, roughness: 0.4 }));
    door.position.set(DOOR.x, 1.08, DOOR.z + 0.05);
    const exit = new THREE.Mesh(
      new THREE.PlaneGeometry(0.6, 0.2),
      new THREE.MeshBasicMaterial({ map: textTexture('AUSGANG', 256, 80, '700 50px sans-serif', '#e8ffe8') }),
    );
    exit.position.set(DOOR.x, 2.55, DOOR.z + 0.08);
    this.scene.add(doorFrame, door, exit);

    // Neon sign.
    const neon = new THREE.Mesh(
      new THREE.PlaneGeometry(3.6, 0.9),
      new THREE.MeshBasicMaterial({
        map: textTexture('Rien ne va plus', 1024, 256, 'italic 700 120px Georgia, serif', '#ffd0f0', '#ff2fa8'),
        transparent: true,
      }),
    );
    neon.position.set(-0.6, 2.55, ROOM.z0 + 0.04);
    const neonLight = new THREE.PointLight(0xff3fb0, 6, 6, 1.5);
    neonLight.position.set(-0.6, 2.4, ROOM.z0 + 0.6);
    this.scene.add(neon, neonLight);

    // Paintings on the side walls.
    const frameMat = trim;
    const painting = (x: number, z: number, rot: number, hue: number) => {
      const c = document.createElement('canvas');
      c.width = 256;
      c.height = 192;
      const g = c.getContext('2d')!;
      const grad = g.createLinearGradient(0, 0, 256, 192);
      grad.addColorStop(0, `hsl(${hue},55%,30%)`);
      grad.addColorStop(1, `hsl(${hue + 50},60%,15%)`);
      g.fillStyle = grad;
      g.fillRect(0, 0, 256, 192);
      for (let i = 0; i < 6; i++) {
        g.fillStyle = `hsla(${hue + i * 30},70%,60%,0.6)`;
        g.beginPath();
        g.arc(40 + Math.random() * 180, 30 + Math.random() * 130, 10 + Math.random() * 35, 0, Math.PI * 2);
        g.fill();
      }
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const grp = new THREE.Group();
      const f = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.85, 0.05), frameMat);
      const art = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.7), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }));
      art.position.z = 0.03;
      grp.add(f, art);
      grp.position.set(x, 1.9, z);
      grp.rotation.y = rot;
      this.scene.add(grp);
    };
    painting(ROOM.x0 + 0.04, -2.5, Math.PI / 2, 200);
    painting(ROOM.x0 + 0.04, 1.5, Math.PI / 2, 20);
    painting(ROOM.x1 - 0.04, 1.2, -Math.PI / 2, 280);

    // Potted plants in the corners.
    const pot = new THREE.MeshStandardMaterial({ color: 0x6b3a1c, roughness: 0.6 });
    const leaf = new THREE.MeshStandardMaterial({ color: 0x2f7a3a, roughness: 0.8 });
    for (const [x, z] of [[ROOM.x0 + 0.6, ROOM.z0 + 0.6], [ROOM.x1 - 0.6, ROOM.z1 - 0.8], [ROOM.x0 + 0.6, ROOM.z1 - 0.8]]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.2, 0.5, 16), pot);
      p.position.set(x, 0.25, z);
      p.castShadow = true;
      this.scene.add(p);
      for (let i = 0; i < 5; i++) {
        const l = new THREE.Mesh(new THREE.SphereGeometry(0.25 + Math.random() * 0.1, 10, 8), leaf);
        l.position.set(x + (Math.random() - 0.5) * 0.4, 0.75 + Math.random() * 0.5, z + (Math.random() - 0.5) * 0.4);
        l.castShadow = true;
        this.scene.add(l);
      }
    }

    // A small bar corner with bottles for flavor.
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.6, 2.4), panelMat);
    shelf.position.set(ROOM.x0 + 0.2, 0.8, -0.5);
    this.scene.add(shelf);
    const bottleColors = [0x2f7a3a, 0x8a3a1a, 0xc9a13a, 0x3a5a8a];
    for (let i = 0; i < 10; i++) {
      const b = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.05, 0.3, 10),
        new THREE.MeshStandardMaterial({ color: bottleColors[i % 4], roughness: 0.1, transparent: true, opacity: 0.85 }),
      );
      b.position.set(ROOM.x0 + 0.3, 1.75, -1.5 + i * 0.22);
      this.scene.add(b);
    }

    // Lighting.
    this.scene.add(new THREE.HemisphereLight(0xffe2c0, 0x40182a, 0.75));
    const fill = new THREE.DirectionalLight(0xffe8d0, 0.5);
    fill.position.set(3, 8, 6);
    this.scene.add(fill);
    // Flat ceiling fixtures so they never block the camera.
    const lamp = (x: number, z: number, intensity: number, shadow: boolean) => {
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.06, 24), trim);
      ring.position.set(x, ROOM.height - 0.05, z);
      const bulb = new THREE.Mesh(new THREE.CircleGeometry(0.22, 20), new THREE.MeshBasicMaterial({ color: 0xffe7b0 }));
      bulb.rotation.x = Math.PI / 2;
      bulb.position.set(x, ROOM.height - 0.09, z);
      const spot = new THREE.SpotLight(0xffd59a, intensity, 10, 0.8, 0.6, 1.2);
      spot.position.set(x, ROOM.height - 0.12, z);
      spot.target.position.set(x, 0, z);
      if (shadow) {
        spot.castShadow = true;
        spot.shadow.mapSize.set(2048, 2048);
        spot.shadow.bias = -0.0002;
        spot.shadow.camera.near = 0.5;
      }
      this.scene.add(ring, bulb, spot, spot.target);
    };
    lamp(TABLE.x - 0.8, TABLE.z, 16, true);
    lamp(TABLE.x + 0.9, TABLE.z, 16, false);
    lamp(KASSE.x, KASSE.z + 0.6, 16, false);
    lamp(-4.5, 2.5, 12, false);
    lamp(3.5, 2.5, 12, false);
    lamp(-4.5, -3, 8, false);
  }

  private buildTable(): void {
    const wood = new THREE.MeshStandardMaterial({ color: 0x4a2310, roughness: 0.45 });
    const cushion = new THREE.MeshStandardMaterial({ color: 0x2b1208, roughness: 0.35 });
    const feltMat = new THREE.MeshStandardMaterial({ color: 0x0f5a34, roughness: 0.95 });
    const brass = new THREE.MeshStandardMaterial({ color: 0xd9ae4c, roughness: 0.3, metalness: 0.9 });
    const T = TABLE;
    const table = new THREE.Group();
    table.position.set(T.x, 0, T.z);
    const body = new THREE.Mesh(new THREE.BoxGeometry(T.halfW * 2 - 0.2, 0.25, T.halfD * 2 - 0.2), wood);
    body.position.y = T.height - 0.15;
    body.castShadow = body.receiveShadow = true;
    const top = new THREE.Mesh(new THREE.BoxGeometry(T.halfW * 2, 0.04, T.halfD * 2), feltMat);
    top.position.y = T.height - 0.02;
    top.receiveShadow = true;
    const rimGeoX = new THREE.BoxGeometry(T.halfW * 2 + 0.1, 0.07, 0.1);
    const rimGeoZ = new THREE.BoxGeometry(0.1, 0.07, T.halfD * 2 + 0.1);
    for (const [g, x, z] of [
      [rimGeoX, 0, T.halfD], [rimGeoX, 0, -T.halfD], [rimGeoZ, T.halfW, 0], [rimGeoZ, -T.halfW, 0],
    ] as const) {
      const r = new THREE.Mesh(g, cushion);
      r.position.set(x, T.height + 0.02, z);
      r.castShadow = true;
      table.add(r);
    }
    for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, T.height - 0.2, 12), wood);
      leg.position.set(x * (T.halfW - 0.25), (T.height - 0.2) / 2, z * (T.halfD - 0.2));
      leg.castShadow = true;
      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), brass);
      foot.position.set(leg.position.x, 0.04, leg.position.z);
      table.add(leg, foot);
    }
    table.add(body, top);
    this.scene.add(table);

    // Betting layout.
    this.layout.position.set(T.x + TABLE_LAYOUT.x, T.height + 0.001, T.z + TABLE_LAYOUT.z);
    this.felt = new THREE.Mesh(
      new THREE.PlaneGeometry(BOARD_SIZE.w, BOARD_SIZE.d),
      new THREE.MeshStandardMaterial({ map: boardTexture(), roughness: 0.9 }),
    );
    this.felt.rotation.x = -Math.PI / 2;
    this.felt.position.set((LAYOUT_BOUNDS.x0 + LAYOUT_BOUNDS.x1) / 2, 0, (LAYOUT_BOUNDS.z0 + LAYOUT_BOUNDS.z1) / 2);
    this.felt.receiveShadow = true;
    this.layout.add(this.felt);
    const hlGeo = new THREE.PlaneGeometry(1, 1);
    for (const f of FIELDS) {
      const r = FIELD_RECTS[f.id];
      const m = new THREE.Mesh(
        hlGeo,
        new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0, depthWrite: false }),
      );
      m.rotation.x = -Math.PI / 2;
      m.scale.set(r.x1 - r.x0 - 0.008, r.z1 - r.z0 - 0.008, 1);
      m.position.set((r.x0 + r.x1) / 2, 0.001, (r.z0 + r.z1) / 2);
      this.highlights.set(f.id, m);
      this.layout.add(m);
    }
    this.scene.add(this.layout);

    const s = TABLE_WHEEL.scale;
    this.wheel.group.scale.setScalar(s);
    this.wheel.group.position.set(T.x + TABLE_WHEEL.x, T.height - 0.9 * s + 0.004, T.z + TABLE_WHEEL.z);
    this.scene.add(this.wheel.group);
  }

  private buildKasse(): void {
    const K = KASSE;
    const wood = new THREE.MeshStandardMaterial({ color: 0x3a1a0c, roughness: 0.4 });
    const marble = new THREE.MeshStandardMaterial({ color: 0xe8e0d0, roughness: 0.2 });
    const brass = new THREE.MeshStandardMaterial({ color: 0xd9ae4c, roughness: 0.3, metalness: 0.9 });
    const g = new THREE.Group();
    g.position.set(K.x, 0, K.z);
    const counter = new THREE.Mesh(new THREE.BoxGeometry(K.halfW * 2, 1.1, K.halfD * 2), wood);
    counter.position.y = 0.55;
    counter.castShadow = counter.receiveShadow = true;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(K.halfW * 2 + 0.1, 0.05, K.halfD * 2 + 0.1), marble);
    slab.position.y = 1.12;
    slab.receiveShadow = true;
    g.add(counter, slab);
    // Brass bars of the cashier window.
    for (let i = -5; i <= 5; i++) {
      if (Math.abs(i) <= 1) continue;
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.0), brass);
      bar.position.set(i * 0.11, 1.65, K.halfD - 0.05);
      g.add(bar);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(K.halfW * 2, 0.08, 0.08), brass);
    lintel.position.set(0, 2.17, K.halfD - 0.05);
    g.add(lintel);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(1.4, 0.4),
      new THREE.MeshBasicMaterial({ map: textTexture('KASSE', 512, 150, '700 110px Georgia, serif', '#ffe6a0', '#ffae00'), transparent: true }),
    );
    sign.position.set(0, 2.45, K.halfD - 0.04);
    const register = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.25, 0.3), new THREE.MeshStandardMaterial({ color: 0x8a1c2a, roughness: 0.4, metalness: 0.3 }));
    register.position.set(0.7, 1.27, 0);
    register.rotation.y = -0.3;
    const cash = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.08), new THREE.MeshStandardMaterial({ color: 0x5f9a4a, roughness: 0.8 }));
    cash.position.set(-0.4, 1.16, 0.1);
    g.add(sign, register, cash);
    this.scene.add(g);
  }

  // ---- Player movement -------------------------------------------------

  /** `move` is a screen-relative direction in the XZ plane (length ≤ 1). */
  movePlayer(dt: number, move: THREE.Vector2, sprint: boolean): void {
    const speed = sprint ? SPRINT : WALK;
    const target = new THREE.Vector3(move.x * speed, 0, move.y * speed);
    this.velocity.lerp(target, 1 - Math.exp(-(move.lengthSq() > 0 ? 12 : 16) * dt));
    const p = this.player.group.position;
    p.addScaledVector(this.velocity, dt);
    this.collide(p);
    const v = Math.hypot(this.velocity.x, this.velocity.z);
    if (v > 0.2) this.player.face(this.velocity.x, this.velocity.z, dt);
    this.player.animate(dt, v);
  }

  private collide(p: THREE.Vector3): void {
    const r = PLAYER_R;
    p.x = THREE.MathUtils.clamp(p.x, ROOM.x0 + r + 0.4, ROOM.x1 - r - 0.1);
    p.z = THREE.MathUtils.clamp(p.z, ROOM.z0 + r + 0.1, ROOM.z1 - r - 0.1);
    for (const o of OBSTACLES) {
      const cx = THREE.MathUtils.clamp(p.x, o.x0, o.x1);
      const cz = THREE.MathUtils.clamp(p.z, o.z0, o.z1);
      const dx = p.x - cx, dz = p.z - cz;
      const d = Math.hypot(dx, dz);
      if (d < r && d > 1e-6) {
        p.x = cx + (dx / d) * r;
        p.z = cz + (dz / d) * r;
      } else if (d <= 1e-6) {
        p.z = o.z1 + r;
      }
    }
  }

  distTo(spot: { x: number; z: number }): number {
    const p = this.player.group.position;
    return Math.hypot(p.x - spot.x, p.z - spot.z);
  }

  nearTable(): boolean {
    return this.distTo(TABLE_SPOT) < 1.3 || this.nearTableEdge();
  }

  private nearTableEdge(): boolean {
    const p = this.player.group.position;
    const o = OBSTACLES[0];
    return p.x > o.x0 - 0.2 && p.x < o.x1 + 0.2 && p.z > o.z1 && p.z < o.z1 + 0.9;
  }

  nearKasse(): boolean {
    return this.distTo(KASSE_SPOT) < 1.2;
  }

  /** Puts the player at the table (hidden, first-person) or back into the room. */
  standAtTable(atTable: boolean): void {
    const p = this.player.group.position;
    if (atTable) {
      p.set(TABLE_SPOT.x, 0, TABLE_SPOT.z);
      this.player.heading = Math.PI;
    }
    this.player.group.visible = !atTable;
    this.velocity.set(0, 0, 0);
  }

  standAtKasse(): void {
    this.player.group.position.set(KASSE_SPOT.x, 0, KASSE_SPOT.z);
    this.player.heading = Math.PI;
    this.velocity.set(0, 0, 0);
  }

  // ---- Table interaction -------------------------------------------------

  raycastField(clientX: number, clientY: number): string | undefined {
    const ndc = new THREE.Vector2((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObject(this.felt, false)[0];
    if (!hit) return undefined;
    const local = this.layout.worldToLocal(hit.point.clone());
    return fieldAt(local.x, local.z);
  }

  refreshWheel(wheel: Pocket[], highlight?: number): void {
    this.wheel.refresh(wheel, highlight);
  }

  // ---- Chips -------------------------------------------------------------

  private chipMaterials(def: string): THREE.Material[] {
    let side = this.chipSide.get(def);
    if (!side) {
      side = new THREE.MeshStandardMaterial({ color: CHIPS[def].color, roughness: 0.4 });
      this.chipSide.set(def, side);
    }
    const face = new THREE.MeshStandardMaterial({
      map: chipTexture(def),
      roughness: 0.35,
      transparent: def === 'glas',
      opacity: def === 'glas' ? 0.8 : 1,
    });
    return [side.clone(), face, face];
  }

  private makeChip(def: string): THREE.Mesh {
    const m = new THREE.Mesh(this.chipGeo, this.chipMaterials(def));
    m.castShadow = true;
    return m;
  }

  private stackPos(fieldId: string, i: number): THREE.Vector3 {
    const c = fieldCenter(fieldId);
    const j = ((i * 7919) % 13) / 13 - 0.5;
    return new THREE.Vector3(c.x + j * 0.004, CHIP_H / 2 + i * CHIP_H, c.z - j * 0.003);
  }

  /** Semi-transparent preview of the selected chip on the hovered field. */
  setGhost(def: string | undefined, fieldId: string | undefined): void {
    if (def !== this.ghostDef) {
      if (this.ghost) this.layout.remove(this.ghost);
      this.ghost = undefined;
      this.ghostDef = def;
      if (def) {
        this.ghost = this.makeChip(def);
        for (const m of this.ghost.material as THREE.MeshStandardMaterial[]) {
          m.transparent = true;
          m.opacity = 0.55;
        }
        this.ghost.castShadow = false;
        this.layout.add(this.ghost);
      }
    }
    if (!this.ghost) return;
    this.ghost.visible = !!fieldId;
    if (fieldId) {
      const n = this.stacks.get(fieldId)?.length ?? 0;
      const pos = this.stackPos(fieldId, n);
      this.ghost.position.set(pos.x, pos.y + 0.012 + Math.sin(this.time * 5) * 0.004, pos.z);
    }
  }

  placeChip(uid: number, def: string, fieldId: string): void {
    const stack = this.stacks.get(fieldId) ?? [];
    stack.push(uid);
    this.stacks.set(fieldId, stack);
    const mesh = this.makeChip(def);
    const to = this.stackPos(fieldId, stack.length - 1);
    const from = new THREE.Vector3(to.x * 0.6, 0.25, 0.55);
    mesh.position.copy(from);
    this.layout.add(mesh);
    this.chipMeshes.set(uid, mesh);
    this.tween(0.22, (u) => {
      mesh.position.lerpVectors(from, to, u);
      mesh.position.y += Math.sin(u * Math.PI) * 0.08;
      mesh.rotation.x = (1 - u) * Math.PI * 2;
    });
  }

  pickChip(fieldId: string): void {
    const uid = this.stacks.get(fieldId)?.pop();
    if (uid === undefined) return;
    const mesh = this.chipMeshes.get(uid)!;
    this.chipMeshes.delete(uid);
    const from = mesh.position.clone();
    const to = new THREE.Vector3(from.x * 0.6, 0.25, 0.55);
    this.tween(0.2, (u) => {
      mesh.position.lerpVectors(from, to, u);
      mesh.position.y += Math.sin(u * Math.PI) * 0.06;
    }, () => this.layout.remove(mesh));
  }

  /** Winning chips pop and sparkle, losing ones fade into the felt. */
  resolveChips(results: { uid: number; won: boolean }[], broken: number[]): void {
    const brokenSet = new Set(broken);
    for (const r of results) {
      const mesh = this.chipMeshes.get(r.uid);
      if (!mesh) continue;
      const base = mesh.position.clone();
      if (r.won) {
        this.tween(0.7, (u) => {
          mesh.position.y = base.y + Math.sin(u * Math.PI) * 0.05;
          mesh.rotation.y = u * Math.PI * 4;
        }, () => {
          if (brokenSet.has(r.uid)) {
            this.burst(this.layout.localToWorld(mesh.position.clone()), 0x9fe3f0, 30);
            mesh.visible = false;
          }
        });
        this.burst(this.layout.localToWorld(base.clone()), 0xffd76a, 8);
      } else {
        const mats = mesh.material as THREE.MeshStandardMaterial[];
        this.tween(0.8, (u) => {
          for (const m of mats) {
            m.transparent = true;
            m.opacity = 1 - u * 0.75;
          }
        });
      }
    }
  }

  /** The croupier sweeps the table: all chips slide off towards the wheel. */
  clearChips(): void {
    const meshes = [...this.chipMeshes.values()];
    this.chipMeshes.clear();
    this.stacks.clear();
    for (const mesh of meshes) {
      const from = mesh.position.clone();
      const to = new THREE.Vector3(LAYOUT_BOUNDS.x0 - 0.2, from.y, -0.2);
      this.tween(0.45 + Math.random() * 0.2, (u) => mesh.position.lerpVectors(from, to, u * u), () => this.layout.remove(mesh));
    }
  }

  fieldTopWorld(fieldId: string): THREE.Vector3 {
    const c = fieldCenter(fieldId);
    const n = this.stacks.get(fieldId)?.length ?? 0;
    return this.layout.localToWorld(new THREE.Vector3(c.x, n * CHIP_H + 0.03, c.z));
  }

  // ---- Coins -------------------------------------------------------------

  setCoins(coins: { id: number; x: number; z: number; kind: 'coin' | 'star' }[]): void {
    for (const [id, m] of this.coinMeshes) {
      if (!coins.some((c) => c.id === id)) {
        this.scene.remove(m);
        this.coinMeshes.delete(id);
      }
    }
    for (const c of coins) {
      if (this.coinMeshes.has(c.id)) continue;
      let m: THREE.Mesh;
      if (c.kind === 'coin') {
        m = new THREE.Mesh(
          new THREE.CylinderGeometry(0.13, 0.13, 0.03, 24),
          new THREE.MeshStandardMaterial({ color: 0xffc83d, emissive: 0x9a6a00, metalness: 0.7, roughness: 0.25 }),
        );
        m.rotation.x = Math.PI / 2;
      } else {
        m = new THREE.Mesh(
          new THREE.IcosahedronGeometry(0.13, 0),
          new THREE.MeshStandardMaterial({ color: 0xff7ad9, emissive: 0xb03080, metalness: 0.3, roughness: 0.2 }),
        );
      }
      m.castShadow = true;
      const holder = new THREE.Group();
      holder.add(m);
      holder.position.set(c.x, 0.35, c.z);
      holder.userData = { kind: c.kind, seed: c.id };
      this.coinMeshes.set(c.id, holder);
      this.scene.add(holder);
    }
  }

  coinsNearPlayer(): number[] {
    if (!this.player.group.visible) return [];
    const p = this.player.group.position;
    const out: number[] = [];
    for (const [id, m] of this.coinMeshes) {
      if (Math.hypot(m.position.x - p.x, m.position.z - p.z) < 0.55) out.push(id);
    }
    return out;
  }

  collectCoinFx(id: number): THREE.Vector3 | undefined {
    const m = this.coinMeshes.get(id);
    if (!m) return undefined;
    this.coinMeshes.delete(id);
    this.burst(m.position, m.userData.kind === 'star' ? 0xff7ad9 : 0xffc83d, 20, 0.04);
    const from = m.position.clone();
    this.tween(0.35, (u) => {
      m.position.y = from.y + u * 1.2;
      m.scale.setScalar(1 - u);
    }, () => this.scene.remove(m));
    this.player.bounce();
    return from;
  }

  // ---- Debt collectors ---------------------------------------------------

  summonThugs(): void {
    if (this.thugState === 'coming' || this.thugState === 'waiting') return;
    this.thugState = 'coming';
    this.thugs.forEach((t, i) => {
      t.group.visible = true;
      t.group.position.set(DOOR.x + (i - 0.5) * 0.5, 0, DOOR.z + 0.3);
    });
  }

  dismissThugs(): void {
    if (this.thugState === 'away') return;
    this.thugState = 'leaving';
  }

  thugsAttack(): void {
    this.thugState = 'attacking';
    this.thugs.forEach((t) => (t.group.visible = true));
    this.player.group.visible = true;
  }

  private updateThugs(dt: number): void {
    const posts = [
      { x: KASSE.x - KASSE.halfW - 0.45, z: KASSE.z + 0.9 },
      { x: KASSE.x + KASSE.halfW - 0.1, z: KASSE.z + 1.25 },
    ];
    const p = this.player.group.position;
    this.thugs.forEach((t, i) => {
      if (!t.group.visible) return;
      switch (this.thugState) {
        case 'coming':
        case 'waiting': {
          const arrived = t.walkTo(posts[i].x, posts[i].z, dt, 1.6);
          if (arrived) {
            t.face(p.x - t.group.position.x, p.z - t.group.position.z, dt, 4);
            if (i === 1) this.thugState = 'waiting';
          }
          break;
        }
        case 'leaving':
          if (t.walkTo(DOOR.x + (i - 0.5) * 0.5, DOOR.z + 0.2, dt, 2.2)) {
            t.group.visible = false;
            if (i === 1) this.thugState = 'away';
          }
          break;
        case 'attacking': {
          const side = i === 0 ? -0.55 : 0.55;
          if (t.walkTo(p.x + side, p.z + 0.1, dt, 2.4)) t.face(-side, 0, dt, 6);
          break;
        }
      }
    });
    if (this.thugState === 'leaving' && this.thugs.every((t) => !t.group.visible)) this.thugState = 'away';
  }

  // ---- Effects -----------------------------------------------------------

  private tween(dur: number, step: (u: number) => void, done?: () => void): void {
    this.tweens.push({ t: 0, dur, step, done });
  }

  burst(at: THREE.Vector3, color: number, n: number, speed = 0.012): void {
    const mat = new THREE.MeshBasicMaterial({ color });
    const scale = speed / 0.012;
    for (let i = 0; i < n; i++) {
      const mesh = new THREE.Mesh(this.sparkGeo, mat);
      mesh.scale.setScalar(scale);
      mesh.position.copy(at);
      const vel = new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.3 + Math.random() * 0.6, (Math.random() - 0.5) * 0.6).multiplyScalar(scale);
      this.sparks.push({ mesh, vel, life: 0.7 + Math.random() * 0.5 });
      this.scene.add(mesh);
    }
  }

  project(p: THREE.Vector3): { x: number; y: number; visible: boolean } {
    const v = p.clone().project(this.camera);
    return { x: ((v.x + 1) / 2) * window.innerWidth, y: ((1 - v.y) / 2) * window.innerHeight, visible: v.z < 1 };
  }

  // ---- Frame -------------------------------------------------------------

  update(dt: number): void {
    this.time += dt;
    for (const tw of [...this.tweens]) {
      tw.t += dt;
      const u = Math.min(1, tw.t / tw.dur);
      tw.step(u);
      if (u >= 1) {
        this.tweens.splice(this.tweens.indexOf(tw), 1);
        tw.done?.();
      }
    }
    for (const s of [...this.sparks]) {
      s.life -= dt;
      s.vel.y -= 1.4 * dt * (s.mesh.scale.x);
      s.mesh.position.addScaledVector(s.vel, dt);
      s.mesh.rotation.x += dt * 8;
      if (s.life <= 0) {
        this.scene.remove(s.mesh);
        this.sparks.splice(this.sparks.indexOf(s), 1);
      }
    }
    for (const m of this.coinMeshes.values()) {
      m.children[0].rotation.y += dt * 2.5;
      m.position.y = 0.35 + Math.sin(this.time * 3 + m.userData.seed) * 0.05;
    }

    const pulse = 0.3 + 0.2 * Math.sin(this.time * 6);
    for (const [id, m] of this.highlights) {
      const mat = m.material as THREE.MeshBasicMaterial;
      let target = 0;
      if (this.pulseFields.has(id)) {
        target = pulse + 0.1;
        mat.color.setHex(0xffd24a);
      } else if (id === this.hoverField) {
        target = 0.28;
        mat.color.setHex(0xfff2b0);
      }
      mat.opacity += (target - mat.opacity) * Math.min(1, dt * 14);
    }

    // Idle NPCs: croupier watches the wheel or the player, cashier breathes.
    const pp = this.player.group.position;
    const cp = this.croupier.group.position;
    if (this.wheel.spinning) this.croupier.face(TABLE.x + TABLE_WHEEL.x - cp.x, TABLE.z - cp.z, dt, 3);
    else this.croupier.face(pp.x - cp.x, pp.z - cp.z, dt, 2);
    this.croupier.animate(dt, 0);
    const kp = this.cashier.group.position;
    this.cashier.face(pp.x - kp.x, pp.z - kp.z, dt, 2);
    this.cashier.animate(dt, 0);
    this.updateThugs(dt);

    this.updateCamera(dt);
    this.renderer.render(this.scene, this.camera);
  }

  private updateCamera(dt: number): void {
    const p = this.player.group.position;
    const pos = new THREE.Vector3();
    const look = new THREE.Vector3();
    const L = this.layout.position;
    const W = this.wheel.group.position;
    let rate = 4;
    switch (this.cameraMode) {
      case 'room':
        pos.set(p.x * 0.75, 4.3, Math.min(p.z + 5.2, ROOM.z1 + 4));
        look.set(p.x * 0.8, 0.7, p.z - 0.9);
        break;
      case 'table': {
        // Keep the whole layout in view above the hand bar, also on narrow screens.
        const aspect = this.camera.aspect;
        const back = aspect < 1.5 ? 1 + (1.5 - aspect) * 1.1 : 1;
        pos.set(L.x, L.y + 1.2 * back, L.z + 0.62 * back);
        look.set(L.x, L.y, L.z + 0.16 * back);
        rate = 5;
        break;
      }
      case 'wheel':
        pos.set(W.x + 0.15, TABLE.height + 0.95, W.z + 0.6);
        look.set(W.x, TABLE.height + 0.05, W.z + 0.04);
        rate = 3.5;
        break;
      case 'kasse':
        pos.set(KASSE.x - 1.2, 2.2, KASSE.z + 3.3);
        look.set(KASSE.x, 1.3, KASSE.z);
        break;
      case 'caught':
        pos.set(p.x + 1.6, 1.9, p.z + 2.8);
        look.set(p.x, 1.1, p.z);
        rate = 2;
        break;
    }
    const k = 1 - Math.exp(-rate * dt);
    this.camPos.lerp(pos, k);
    this.camLook.lerp(look, k);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
  }
}
