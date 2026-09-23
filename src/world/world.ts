import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { POCKET_MOD_INFO, type PocketToolId } from '../game/content';
import { FIELDS } from '../game/fields';
import type { ItemInstance, Pocket, ShopItem } from '../game/types';
import { Figure } from './figure';
import { buildFigurine, buildUpgradeBox, type Figurine } from './items3d';
import {
  DOOR, FIELD_RECTS, fieldAt, fieldCenter, itemSlot, KASSE, KASSE_SPOT, LAYOUT_BOUNDS, OBSTACLES, PHONE, PHONE_SPOT, ROOM,
  TABLE, TABLE_LAYOUT, TABLE_SPOT, TABLE_WHEEL, VITRINE, VITRINE_SPOT,
} from './layout';
import { boardTexture, BOARD_SIZE, carpetTexture, chipSideTexture, chipTexture } from './textures';
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

export type CameraMode = 'room' | 'table' | 'wheel' | 'kasse' | 'vitrine' | 'phone' | 'caught';

/** Darkens the frame edges and adds a little film grain. */
const VignetteShader = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, strength: { value: 0.55 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time; uniform float strength; varying vec2 vUv;
    float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 d = vUv - 0.5;
      float v = smoothstep(0.85, 0.2, length(d * vec2(1.1, 1.0)));
      c.rgb *= mix(1.0 - strength, 1.0, v);
      c.rgb += (rand(vUv * 800.0 + time) - 0.5) * 0.025;
      gl_FragColor = c;
    }`,
};

interface PlacedItem {
  uid: number;
  def: string;
  fig: Figurine;
  holder: THREE.Group;
  jump: number;
}

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
  private chipMats = new Map<number, THREE.Material[]>();
  private stacks = new Map<string, THREE.Mesh[]>();
  private highlights = new Map<string, THREE.Mesh>();
  private composer: EffectComposer;
  private vignette: ShaderPass;
  private shakeAmt = 0;
  private dust!: THREE.Points;
  private dustBase!: Float32Array;
  private falling: { mesh: THREE.Mesh; vel: THREE.Vector3; spin: THREE.Vector3; life: number }[] = [];
  private coinGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.004, 20);
  private coinMat = new THREE.MeshStandardMaterial({ color: 0xffc83d, emissive: 0x6a4000, metalness: 0.9, roughness: 0.25 });
  /** Number cells lit up by the hovered bet. */
  hoverCells = new Set<string>();
  /** Number cells marked by a prediction card. */
  markCells = new Set<string>();
  private ghost?: THREE.Mesh;
  private ghostValue?: number;
  private tableGroup = new THREE.Group();
  private placedItems: PlacedItem[] = [];
  private slotPlates: THREE.Mesh[] = [];
  private showcase = new THREE.Group();
  private showcaseItems: { index: number; fig: Figurine; holder: THREE.Group }[] = [];
  private phoneHandset = new THREE.Group();
  private phoneLamp!: THREE.MeshStandardMaterial;
  private phoneLight!: THREE.PointLight;
  private marqueeCanvas = document.createElement('canvas');
  private marqueeTex!: THREE.CanvasTexture;
  phoneRinging = false;
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
    this.renderer.toneMappingExposure = 0.95;
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x07040a);
    this.scene.fog = new THREE.FogExp2(0x12060c, 0.035);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(512, 512), 0.45, 0.45, 0.93));
    this.vignette = new ShaderPass(VignetteShader);
    this.composer.addPass(this.vignette);
    this.composer.addPass(new OutputPass());
    this.buildRoom();
    this.buildAtmosphere();
    this.buildTable();
    this.buildKasse();
    this.buildVitrine();
    this.buildPhone();
    this.buildMarquee();

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
    this.composer?.setSize(w, h);
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
    painting(ROOM.x1 - 0.04, -1.4, -Math.PI / 2, 280);

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
    lamp(TABLE.x - 0.8, TABLE.z, 9, true);
    lamp(TABLE.x + 0.9, TABLE.z, 9, false);
    lamp(KASSE.x, KASSE.z + 0.6, 16, false);
    lamp(-4.5, 2.5, 12, false);
    lamp(3.5, 2.5, 12, false);
    lamp(-4.5, -3, 8, false);
  }

  /** Light shafts under the table lamps and dust floating through them. */
  private buildAtmosphere(): void {
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 128;
    const g = c.getContext('2d')!;
    const grad = g.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, 'rgba(255,220,160,0.9)');
    grad.addColorStop(1, 'rgba(255,220,160,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 128);
    const tex = new THREE.CanvasTexture(c);
    const shaftMat = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    for (const [x, z] of [[TABLE.x - 0.8, TABLE.z], [TABLE.x + 0.9, TABLE.z], [KASSE.x, KASSE.z + 0.6]]) {
      const h = ROOM.height - TABLE.height;
      const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 1.1, h, 32, 1, true), shaftMat);
      cone.position.set(x, TABLE.height + h / 2, z);
      this.scene.add(cone);
    }
    const n = 500;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = TABLE.x + (Math.random() - 0.5) * 5;
      pos[i * 3 + 1] = 0.3 + Math.random() * 2.9;
      pos[i * 3 + 2] = TABLE.z + (Math.random() - 0.5) * 3.5;
    }
    this.dustBase = pos.slice();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dust = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xffe6b8, size: 0.012, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.scene.add(this.dust);
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
      if (!r) continue;
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
    this.tableGroup.position.set(T.x, T.height, T.z);
    this.scene.add(this.tableGroup);

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

  nearVitrine(): boolean {
    return this.distTo(VITRINE_SPOT) < 1.1;
  }

  nearPhone(): boolean {
    return this.distTo(PHONE_SPOT) < 1.1;
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

  /** Places the player in front of the cashier, showcase or phone. */
  standAt(where: 'kasse' | 'vitrine' | 'phone'): void {
    const spot = where === 'kasse' ? KASSE_SPOT : where === 'vitrine' ? VITRINE_SPOT : PHONE_SPOT;
    this.player.group.position.set(spot.x, 0, spot.z);
    this.player.heading = where === 'kasse' ? Math.PI : where === 'vitrine' ? -Math.PI / 2 : Math.PI / 2;
    this.player.group.visible = true;
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

  refreshWheel(wheel: Pocket[], highlight?: number, marks?: number[]): void {
    this.wheel.refresh(wheel, highlight, marks);
  }

  // ---- Chips -------------------------------------------------------------

  private chipMaterials(value: number): THREE.Material[] {
    let mats = this.chipMats.get(value);
    if (!mats) {
      const side = new THREE.MeshStandardMaterial({ map: chipSideTexture(value), roughness: 0.4 });
      const face = new THREE.MeshStandardMaterial({ map: chipTexture(value), roughness: 0.35 });
      mats = [side, face, face];
      this.chipMats.set(value, mats);
    }
    return mats.map((m) => m.clone());
  }

  private makeChip(value: number): THREE.Mesh {
    const m = new THREE.Mesh(this.chipGeo, this.chipMaterials(value));
    m.castShadow = true;
    m.userData.value = value;
    return m;
  }

  private stackPos(fieldId: string, i: number): THREE.Vector3 {
    const c = fieldCenter(fieldId);
    const j = ((i * 7919) % 13) / 13 - 0.5;
    return new THREE.Vector3(c.x + j * 0.004, CHIP_H / 2 + i * CHIP_H, c.z - j * 0.003);
  }

  /** Semi-transparent preview of the selected chip on the hovered field. */
  setGhost(value: number | undefined, fieldId: string | undefined): void {
    if (value !== this.ghostValue) {
      if (this.ghost) this.layout.remove(this.ghost);
      this.ghost = undefined;
      this.ghostValue = value;
      if (value) {
        this.ghost = this.makeChip(value);
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

  placeChip(fieldId: string, value: number): void {
    const stack = this.stacks.get(fieldId) ?? [];
    this.stacks.set(fieldId, stack);
    const mesh = this.makeChip(value);
    const to = this.stackPos(fieldId, stack.length);
    stack.push(mesh);
    const from = new THREE.Vector3(to.x * 0.6, 0.25, 0.55);
    mesh.position.copy(from);
    this.layout.add(mesh);
    this.tween(0.22, (u) => {
      mesh.position.lerpVectors(from, to, u);
      mesh.position.y += Math.sin(u * Math.PI) * 0.08;
      mesh.rotation.x = (1 - u) * Math.PI * 2;
    });
  }

  pickChip(fieldId: string): void {
    const stack = this.stacks.get(fieldId);
    const mesh = stack?.pop();
    if (!mesh) return;
    if (!stack!.length) this.stacks.delete(fieldId);
    const from = mesh.position.clone();
    const to = new THREE.Vector3(from.x * 0.6, 0.25, 0.55);
    this.tween(0.2, (u) => {
      mesh.position.lerpVectors(from, to, u);
      mesh.position.y += Math.sin(u * Math.PI) * 0.06;
    }, () => this.layout.remove(mesh));
  }

  /** Rebuilds all stacks from the bets, without animation (after loading or clearing). */
  syncChips(bets: Record<string, number[]>): void {
    for (const stack of this.stacks.values()) for (const m of stack) this.layout.remove(m);
    this.stacks.clear();
    for (const [fid, values] of Object.entries(bets)) {
      const stack: THREE.Mesh[] = [];
      values.forEach((v, i) => {
        const m = this.makeChip(v);
        m.position.copy(this.stackPos(fid, i));
        this.layout.add(m);
        stack.push(m);
      });
      this.stacks.set(fid, stack);
    }
  }

  /** Losing stacks fade into the felt right after the ball lands. */
  dimLosers(fieldIds: string[]): void {
    for (const fid of fieldIds) {
      for (const mesh of this.stacks.get(fid) ?? []) {
        const mats = mesh.material as THREE.MeshStandardMaterial[];
        this.tween(0.6, (u) => {
          for (const m of mats) {
            m.transparent = true;
            m.opacity = 1 - u * 0.7;
          }
        });
      }
    }
  }

  /** A winning stack jumps and sparkles while its payout is counted. Returns its world position. */
  popField(fieldId: string, color = 0xffd76a): THREE.Vector3 {
    const stack = this.stacks.get(fieldId) ?? [];
    stack.forEach((mesh, i) => {
      const base = this.stackPos(fieldId, i);
      const mats = mesh.material as THREE.MeshStandardMaterial[];
      this.tween(0.4, (u) => {
        const k = Math.sin(u * Math.PI);
        mesh.position.set(base.x, base.y + k * (0.03 + i * 0.004), base.z);
        mesh.rotation.z = Math.sin(u * Math.PI * 2) * 0.25;
        mats[0].emissive.setHex(0xffc850);
        mats[0].emissiveIntensity = k * 0.9;
      });
    });
    const world = this.fieldTopWorld(fieldId);
    this.burst(world, color, 12);
    return world;
  }

  /** Gold coins rain onto the table after a big win. */
  coinShower(n: number): void {
    const b = LAYOUT_BOUNDS;
    for (let i = 0; i < n; i++) {
      const mesh = new THREE.Mesh(this.coinGeo, this.coinMat);
      mesh.position.set(b.x0 + Math.random() * (b.x1 - b.x0), 0.6 + Math.random() * 0.8, b.z0 + Math.random() * (b.z1 - b.z0));
      mesh.castShadow = true;
      this.layout.add(mesh);
      this.falling.push({
        mesh,
        vel: new THREE.Vector3((Math.random() - 0.5) * 0.3, -Math.random() * 0.5, (Math.random() - 0.5) * 0.3),
        spin: new THREE.Vector3(Math.random() * 12, Math.random() * 6, Math.random() * 12),
        life: 2.6 + Math.random(),
      });
    }
  }

  shake(amount: number): void {
    this.shakeAmt = Math.max(this.shakeAmt, amount);
  }

  /** The croupier sweeps the table: all chips slide off towards the wheel. */
  clearChips(): void {
    const meshes = [...this.stacks.values()].flat();
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

  // ---- Talismans on the table ---------------------------------------------

  /** Shows the player's talismans on the table, in order, with a plate per free slot. */
  setItems(items: ItemInstance[], slots: number): void {
    const keep = new Map(this.placedItems.map((p) => [p.uid, p]));
    const next: PlacedItem[] = [];
    for (const it of items) {
      let p = keep.get(it.uid);
      if (!p) {
        const fig = buildFigurine(it.def);
        const holder = new THREE.Group();
        holder.add(fig.group);
        holder.userData.itemUid = it.uid;
        this.tableGroup.add(holder);
        p = { uid: it.uid, def: it.def, fig, holder, jump: 1 };
        this.burst(this.tableGroup.localToWorld(new THREE.Vector3(itemSlot(next.length, slots).x, 0.05, itemSlot(next.length, slots).z)), 0xffd76a, 20, 0.02);
      }
      keep.delete(it.uid);
      next.push(p);
    }
    for (const p of keep.values()) this.tableGroup.remove(p.holder);
    this.placedItems = next;
    for (const m of this.slotPlates) this.tableGroup.remove(m);
    this.slotPlates = [];
    const plateMat = new THREE.MeshStandardMaterial({ color: 0x8a6a2a, roughness: 0.35, metalness: 0.9 });
    for (let i = 0; i < slots; i++) {
      const s = itemSlot(i, slots);
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.048, 0.006, 28), plateMat);
      plate.position.set(s.x, 0.003, s.z);
      plate.receiveShadow = true;
      this.tableGroup.add(plate);
      this.slotPlates.push(plate);
      if (next[i]) next[i].holder.position.set(s.x, 0.006, s.z);
    }
    next.forEach((p, i) => (p.holder.visible = i < slots));
  }

  /** Talisman under the pointer, if any. */
  pickItem(clientX: number, clientY: number): number | undefined {
    const ndc = new THREE.Vector2((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObjects(this.placedItems.map((p) => p.holder), true)[0];
    let o: THREE.Object3D | null = hit?.object ?? null;
    while (o && o.userData.itemUid === undefined) o = o.parent;
    return o?.userData.itemUid;
  }

  /** A talisman hops and sparkles when it takes effect. Returns its world position. */
  triggerItem(uid: number): THREE.Vector3 | undefined {
    const p = this.placedItems.find((x) => x.uid === uid);
    if (!p) return undefined;
    p.jump = 1;
    const top = p.holder.localToWorld(new THREE.Vector3(0, p.fig.height + 0.02, 0));
    this.burst(top, 0xffe08a, 14);
    return top;
  }

  itemTopWorld(uid: number): THREE.Vector3 | undefined {
    const p = this.placedItems.find((x) => x.uid === uid);
    return p?.holder.localToWorld(new THREE.Vector3(0, p.fig.height + 0.03, 0));
  }

  // ---- Showcase, phone and marquee -------------------------------------------

  private buildVitrine(): void {
    const V = VITRINE;
    const wood = new THREE.MeshStandardMaterial({ color: 0x2e140a, roughness: 0.45 });
    const brass = new THREE.MeshStandardMaterial({ color: 0xc9a04a, roughness: 0.3, metalness: 0.85 });
    const glass = new THREE.MeshPhysicalMaterial({ color: 0xcfe6ff, transparent: true, opacity: 0.12, roughness: 0.02, depthWrite: false });
    const g = new THREE.Group();
    g.position.set(V.x, 0, V.z);
    const base = new THREE.Mesh(new THREE.BoxGeometry(V.halfW * 2, 0.7, V.halfD * 2), wood);
    base.position.y = 0.35;
    base.castShadow = base.receiveShadow = true;
    const top = new THREE.Mesh(new THREE.BoxGeometry(V.halfW * 2 + 0.04, 0.08, V.halfD * 2 + 0.04), wood);
    top.position.y = V.height;
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.04, V.height - 0.7, V.halfD * 2), new THREE.MeshStandardMaterial({ color: 0x4a0f1c, roughness: 0.95 }));
    back.position.set(-V.halfW + 0.02, 0.7 + (V.height - 0.7) / 2, 0);
    const front = new THREE.Mesh(new THREE.PlaneGeometry(V.halfD * 2, V.height - 0.7), glass);
    front.rotation.y = Math.PI / 2;
    front.position.set(V.halfW, 0.7 + (V.height - 0.7) / 2, 0);
    g.add(base, top, back, front);
    for (const z of [-V.halfD, V.halfD]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(V.halfW * 2, V.height - 0.7, 0.03), brass);
      post.position.set(0, 0.7 + (V.height - 0.7) / 2, z);
      g.add(post);
    }
    for (const y of [0.72, 1.3]) {
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(V.halfW * 2 - 0.06, 0.02, V.halfD * 2 - 0.06), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, roughness: 0.05 }));
      shelf.position.y = y;
      g.add(shelf);
    }
    const light = new THREE.PointLight(0xffe0b0, 2.5, 2.5, 2);
    light.position.set(0.1, V.height - 0.1, 0);
    g.add(light);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2, 0.3),
      new THREE.MeshBasicMaterial({ map: textTexture('Kuriositäten', 512, 128, 'italic 700 72px Georgia, serif', '#ffe6a0', '#ffae00'), transparent: true }),
    );
    sign.rotation.y = Math.PI / 2;
    sign.position.set(V.halfW + 0.01, V.height + 0.25, 0);
    g.add(sign, this.showcase);
    this.scene.add(g);
  }

  /** Puts the showcase stock on its shelves; sold pieces disappear. */
  setShowcase(shop: ShopItem[]): void {
    for (const s of this.showcaseItems) this.showcase.remove(s.holder);
    this.showcaseItems = [];
    const V = VITRINE;
    shop.forEach((it, i) => {
      if (it.sold) return;
      const fig = it.kind === 'item' ? buildFigurine(it.def) : buildUpgradeBox(POCKET_MOD_INFO[it.def as keyof typeof POCKET_MOD_INFO]?.color ?? (it.def as PocketToolId === 'pinsel' ? '#e8e0d0' : '#7a7aff'));
      const holder = new THREE.Group();
      holder.add(fig.group);
      holder.scale.setScalar(it.kind === 'item' ? 2.2 : 1.6);
      const row = it.kind === 'item' ? 1 : 0;
      const col = it.kind === 'item' ? i : i - 4;
      const perRow = it.kind === 'item' ? 4 : 2;
      holder.position.set(0.05, row ? 1.31 : 0.73, -V.halfD + 0.25 + (col + 0.5) * ((V.halfD * 2 - 0.5) / perRow));
      holder.rotation.y = Math.PI / 2;
      this.showcase.add(holder);
      this.showcaseItems.push({ index: i, fig, holder });
    });
  }

  private buildPhone(): void {
    const g = new THREE.Group();
    g.position.set(PHONE.x, PHONE.y, PHONE.z);
    g.rotation.y = -Math.PI / 2;
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.03), new THREE.MeshStandardMaterial({ color: 0x3a1a0c, roughness: 0.5 }));
    const red = new THREE.MeshStandardMaterial({ color: 0xb0101c, roughness: 0.3, metalness: 0.1 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.24, 0.1), red);
    body.position.z = 0.065;
    const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.012, 24), new THREE.MeshStandardMaterial({ color: 0xf0e8d8, roughness: 0.4 }));
    dial.rotation.x = Math.PI / 2;
    dial.position.set(0, -0.03, 0.121);
    const hand = new THREE.Mesh(new THREE.CapsuleGeometry(0.022, 0.16, 6, 12), red);
    hand.rotation.z = Math.PI / 2;
    this.phoneHandset.add(hand);
    for (const x of [-0.09, 0.09]) {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 12), red);
      cup.position.set(x, -0.012, 0);
      this.phoneHandset.add(cup);
    }
    this.phoneHandset.position.set(0, 0.1, 0.13);
    this.phoneLamp = new THREE.MeshStandardMaterial({ color: 0x400000, emissive: 0xff2020, emissiveIntensity: 0 });
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 10), this.phoneLamp);
    lamp.position.set(0, 0.22, 0.03);
    g.add(board, body, dial, this.phoneHandset, lamp);
    g.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = true;
    });
    g.scale.setScalar(1.4);
    const sconce = new THREE.PointLight(0xffb070, 3, 3, 2);
    sconce.position.set(PHONE.x - 0.4, PHONE.y + 0.6, PHONE.z);
    this.phoneLight = new THREE.PointLight(0xff2020, 0, 2.5, 2);
    this.phoneLight.position.set(PHONE.x - 0.3, PHONE.y + 0.2, PHONE.z);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(0.8, 0.2),
      new THREE.MeshBasicMaterial({ map: textTexture('TELEFON', 512, 128, '700 80px Georgia, serif', '#ffd0d0', '#ff3030'), transparent: true }),
    );
    sign.rotation.y = -Math.PI / 2;
    sign.position.set(PHONE.x - 0.02, PHONE.y + 0.62, PHONE.z);
    this.scene.add(g, sconce, this.phoneLight, sign);
  }

  /** Board next to the wheel with the last numbers and the next rate, like in real casinos. */
  private buildMarquee(): void {
    this.marqueeCanvas.width = 256;
    this.marqueeCanvas.height = 512;
    this.marqueeTex = new THREE.CanvasTexture(this.marqueeCanvas);
    this.marqueeTex.colorSpace = THREE.SRGBColorSpace;
    const g = new THREE.Group();
    g.position.set(TABLE.x - TABLE.halfW + 0.05, 0, TABLE.z - TABLE.halfD - 0.15);
    g.rotation.y = 0.5;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 1.5, 12), new THREE.MeshStandardMaterial({ color: 0xc9a04a, metalness: 0.85, roughness: 0.3 }));
    pole.position.y = 0.75;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.62, 0.05), new THREE.MeshStandardMaterial({ color: 0x111114, roughness: 0.4 }));
    frame.position.y = 1.75;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.58), new THREE.MeshBasicMaterial({ map: this.marqueeTex, toneMapped: false }));
    screen.position.set(0, 1.75, 0.026);
    g.add(pole, frame, screen);
    this.scene.add(g);
    this.setMarquee([], 0, 0, 0);
  }

  setMarquee(history: { n: number; c: string }[], debt: number, round: number, rounds: number): void {
    const c = this.marqueeCanvas;
    const g = c.getContext('2d')!;
    g.fillStyle = '#050305';
    g.fillRect(0, 0, c.width, c.height);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#ffcf5a';
    g.font = '700 26px monospace';
    g.fillText('RATE', 128, 34);
    g.font = '700 44px monospace';
    g.fillText('$' + debt.toLocaleString('de-DE'), 128, 76);
    g.font = '700 24px monospace';
    g.fillStyle = '#ff7a5a';
    g.fillText(rounds ? `RUNDE ${Math.min(round, rounds)}/${rounds}` : '', 128, 116);
    g.fillStyle = '#3a2a1a';
    g.fillRect(20, 140, 216, 3);
    history.slice(0, 8).forEach((h, i) => {
      const y = 180 + i * 42;
      const x = h.c === 'red' ? 90 : h.c === 'black' ? 166 : 128;
      g.fillStyle = h.c === 'red' ? '#ff3b4a' : h.c === 'black' ? '#e8e8f0' : '#3fe07a';
      g.font = `700 ${i === 0 ? 40 : 32}px monospace`;
      g.fillText(String(h.n), x, y);
    });
    this.marqueeTex.needsUpdate = true;
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
    for (const f of [...this.falling]) {
      f.life -= dt;
      f.vel.y -= 3.2 * dt;
      f.mesh.position.addScaledVector(f.vel, dt);
      f.mesh.rotation.x += f.spin.x * dt;
      f.mesh.rotation.z += f.spin.z * dt;
      if (f.mesh.position.y < 0.002) {
        f.mesh.position.y = 0.002;
        f.vel.y *= -0.35;
        f.vel.x *= 0.6;
        f.vel.z *= 0.6;
        f.spin.multiplyScalar(0.5);
        if (Math.abs(f.vel.y) < 0.05) {
          f.vel.set(0, 0, 0);
          f.mesh.rotation.set(0, f.mesh.rotation.y, 0);
        }
      }
      if (f.life < 0.5) f.mesh.scale.setScalar(Math.max(0.001, f.life / 0.5));
      if (f.life <= 0) {
        this.layout.remove(f.mesh);
        this.falling.splice(this.falling.indexOf(f), 1);
      }
    }
    const dp = this.dust.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < dp.count; i++) {
      const t = this.time * 0.15 + i;
      dp.setXYZ(i, this.dustBase[i * 3] + Math.sin(t) * 0.15, this.dustBase[i * 3 + 1] + Math.sin(t * 0.7) * 0.1, this.dustBase[i * 3 + 2] + Math.cos(t * 0.9) * 0.15);
    }
    dp.needsUpdate = true;
    for (const p of this.placedItems) {
      p.fig.animate?.(this.time);
      p.jump = Math.max(0, p.jump - dt * 2.5);
      const k = Math.sin(p.jump * Math.PI);
      p.fig.group.position.y = k * 0.04;
      p.fig.group.scale.setScalar(1 + k * 0.25);
    }
    for (const s of this.showcaseItems) {
      s.fig.animate?.(this.time);
      s.fig.group.rotation.y = this.time * 0.5 + s.index;
    }
    const ring = this.phoneRinging && Math.sin(this.time * 18) > 0 && this.time % 2 < 1.2;
    this.phoneHandset.position.y = 0.1 + (ring ? 0.012 : 0);
    this.phoneHandset.rotation.z = ring ? Math.sin(this.time * 60) * 0.08 : 0;
    this.phoneLamp.emissiveIntensity = this.phoneRinging ? (Math.sin(this.time * 6) > 0 ? 3 : 0.2) : 0;
    this.phoneLight.intensity = this.phoneRinging ? (Math.sin(this.time * 6) > 0 ? 4 : 0) : 0;

    const pulse = 0.3 + 0.2 * Math.sin(this.time * 6);
    for (const [id, m] of this.highlights) {
      const mat = m.material as THREE.MeshBasicMaterial;
      let target = 0;
      if (this.pulseFields.has(id)) {
        target = pulse + 0.1;
        mat.color.setHex(0xffd24a);
      } else if (id === this.hoverField || this.hoverCells.has(id)) {
        target = id === this.hoverField ? 0.3 : 0.2;
        mat.color.setHex(0xfff2b0);
      } else if (this.markCells.has(id)) {
        target = 0.2 + 0.12 * Math.sin(this.time * 4);
        mat.color.setHex(0xb48cff);
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
    this.vignette.uniforms.time.value = this.time % 10;
    this.composer.render(dt);
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
        pos.set(L.x, L.y + 1.2 * back, L.z + 0.7 * back);
        look.set(L.x, L.y, L.z + 0.02 * back);
        rate = 5;
        break;
      }
      case 'wheel': {
        // Push in slowly while the ball loses speed.
        const k = this.wheel.progress * this.wheel.progress;
        pos.set(W.x + 0.15 - k * 0.1, TABLE.height + 0.95 - k * 0.4, W.z + 0.6 - k * 0.12);
        look.set(W.x, TABLE.height + 0.05, W.z + 0.04);
        rate = 3.5;
        break;
      }
      case 'kasse':
        pos.set(KASSE.x - 1.2, 2.2, KASSE.z + 3.3);
        look.set(KASSE.x, 1.3, KASSE.z);
        break;
      case 'vitrine':
        pos.set(VITRINE.x + 2.2, 1.7, VITRINE.z + 0.6);
        look.set(VITRINE.x, 1.1, VITRINE.z);
        break;
      case 'phone':
        pos.set(PHONE.x - 1.6, 1.75, PHONE.z + 0.9);
        look.set(PHONE.x, PHONE.y, PHONE.z);
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
    if (this.shakeAmt > 0.001) {
      const a = this.shakeAmt;
      this.camera.position.x += (Math.random() - 0.5) * a * 0.06;
      this.camera.position.y += (Math.random() - 0.5) * a * 0.06;
      this.camera.rotation.z += (Math.random() - 0.5) * a * 0.03;
      this.shakeAmt *= Math.exp(-6 * dt);
    }
  }
}
