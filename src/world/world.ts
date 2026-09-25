import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { BALLS, CHIP_COLORS, ITEMS, POCKET_MOD_INFO, type PocketToolId } from '../game/content';
import { FIELDS } from '../game/fields';
import type { ItemInstance, Pocket, ShopItem } from '../game/types';
import { Human, loadHumanAssets, loadModel, type HumanAssets, type HumanStyle } from './humans';
import { buildFigurine, buildUpgradeBox, goldify, registerModelFigurine, type Figurine } from './items3d';
import {
  DOOR, FIELD_RECTS, fieldAt, fieldCenter, itemSlot, KASSE, KASSE_SPOT, LAYOUT_BOUNDS, OBSTACLES, PHONE, PHONE_SPOT, RIVAL_SPOT, ROOM,
  SMOKES, SMOKES_SPOT, TABLE, TABLE_LAYOUT, TABLE_SPOT, TABLE_WHEEL, VITRINE, VITRINE_SPOT,
} from './layout';
import { feltNormal, leather, smudges, wood } from './materials';
import { mergeStatic } from './merge';
import { buildCasino, smoke, type Casino } from './room';
import { boardTexture, BOARD_SIZE, chipSideTexture, chipTexture } from './textures';
import { faceEllipses, MAX_FACES, VhsShader } from './vhs';
import { resolve } from './nav';
import { Wheel3D } from './wheel3d';

const CHIP_H = 0.0105;
const CHIP_R = 0.0195;
const WALK = 1.7;
const SPRINT = 3.6;
const PLAYER_R = 0.3;
const PERSON_R = 0.28;

interface Tween {
  t: number;
  dur: number;
  step: (u: number) => void;
  done?: () => void;
}

export type CameraMode = 'menu' | 'room' | 'table' | 'wheel' | 'kasse' | 'vitrine' | 'phone' | 'smokes' | 'shark' | 'caught';

interface PlacedItem {
  uid: number;
  def: string;
  fig: Figurine;
  holder: THREE.Group;
  jump: number;
  gold: boolean;
}

export type Quality = 'high' | 'medium' | 'low';

export class World {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(48, 1, 0.03, 60);
  readonly wheel = new Wheel3D();
  readonly layout = new THREE.Group();
  cameraMode: CameraMode = 'menu';

  player!: Human;
  croupier!: Human;
  cashier!: Human;
  thugs: Human[] = [];
  guests: Human[] = [];
  private rival!: Human;
  private rivalChips: THREE.Mesh[] = [];
  private rivalState: 'away' | 'coming' | 'here' | 'leaving' = 'away';
  private shark!: Human;
  private sharkState: 'away' | 'coming' | 'here' | 'leaving' = 'away';
  private people: Human[] = [];
  private casino!: Casino;
  private humanAssets!: HumanAssets;

  private composer: EffectComposer;
  private gtao?: GTAOPass;
  private vhs: ShaderPass;
  private bloom!: UnrealBloomPass;
  private frameNo = 0;
  private felt!: THREE.Mesh;
  private raycaster = new THREE.Raycaster();
  private chipGeo = new THREE.CylinderGeometry(CHIP_R, CHIP_R, CHIP_H, 40);
  private chipMats = new Map<number, THREE.Material[]>();
  private stacks = new Map<string, THREE.Mesh[]>();
  private highlights = new Map<string, THREE.Mesh>();
  private ghost?: THREE.Mesh;
  private ghostValue?: number;
  private tableGroup = new THREE.Group();
  private placedItems: PlacedItem[] = [];
  private slotPlates: THREE.Mesh[] = [];
  private showcaseItems: { index: number; fig: Figurine; holder: THREE.Group }[] = [];
  private marqueeCanvas = document.createElement('canvas');
  private marqueeTex!: THREE.CanvasTexture;
  private dolly!: THREE.Group;
  private tweens: Tween[] = [];
  private camPos = new THREE.Vector3(-3, 2.6, 4);
  private camLook = new THREE.Vector3(0, 0.9, -1);
  private time = 0;
  private sparks: { mesh: THREE.Mesh; vel: THREE.Vector3; life: number }[] = [];
  private sparkGeo = new THREE.OctahedronGeometry(0.006);
  private falling: { mesh: THREE.Mesh; vel: THREE.Vector3; spin: THREE.Vector3; life: number }[] = [];
  private coinGeo = new THREE.CylinderGeometry(0.014, 0.014, 0.0025, 20);
  private coinMat = new THREE.MeshStandardMaterial({ color: 0xffc83d, emissive: 0x3a2000, metalness: 1, roughness: 0.25 });
  private velocity = new THREE.Vector3();
  private thugState: 'away' | 'coming' | 'waiting' | 'leaving' | 'attacking' = 'away';
  private shakeAmt = 0;
  private faceBuf: THREE.Vector3[] = [];
  private glitch = 0;
  quality: Quality = 'high';

  hoverField?: string;
  hoverCells = new Set<string>();
  markCells = new Set<string>();
  pulseFields = new Set<string>();
  phoneRinging = false;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color(0x050304);
    this.scene.fog = new THREE.FogExp2(0x0a0508, 0.045);

    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, target);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.gtao = new GTAOPass(this.scene, this.camera, size.x / 2, size.y / 2);
    // Ambient occlusion at half resolution: it is soft anyway and costs a quarter.
    const gtaoSetSize = this.gtao.setSize.bind(this.gtao);
    this.gtao.setSize = (w: number, h: number) => gtaoSetSize(Math.max(1, Math.floor(w / 2)), Math.max(1, Math.floor(h / 2)));
    this.gtao.updateGtaoMaterial({ radius: 0.35, distanceExponent: 1.6, thickness: 1.2, scale: 1.2, samples: 12 });
    this.gtao.blendIntensity = 0.85;
    this.composer.addPass(this.gtao);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.32, 0.5, 0.97);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.vhs = new ShaderPass(VhsShader);
    this.composer.addPass(this.vhs);
    for (let i = 0; i < MAX_FACES; i++) this.faceBuf.push(new THREE.Vector3());

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  /** Loads models and builds the casino. Call once before the first frame. */
  async init(base: string, onProgress?: (text: string) => void): Promise<void> {
    onProgress?.('LADE BAND … PERSONEN');
    this.humanAssets = await loadHumanAssets(base);
    const glasses = this.humanAssets.sunglasses;
    if (glasses) {
      registerModelFigurine('sonnenbrille', () => {
        const g = new THREE.Group();
        const m = glasses.scene.clone(true);
        const box = new THREE.Box3().setFromObject(m);
        const size = box.getSize(new THREE.Vector3());
        m.scale.setScalar(0.085 / Math.max(size.x, 1e-6));
        m.rotation.x = -0.25;
        m.position.y = 0.022;
        m.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) o.castShadow = true;
        });
        g.add(m);
        return { group: g, height: 0.05 };
      });
    }
    onProgress?.('LADE BAND … MÖBEL');
    const opt = (f: string) => loadModel(base, f).catch(() => undefined) as Promise<GLTF | undefined>;
    const chair = await opt('chair');
    const candle = await opt('candle');
    onProgress?.('LADE BAND … CASINO');
    const before = new Set(this.scene.children);
    this.casino = buildCasino(this.scene, base, chair, candle);
    // Fewer draw calls: glue the room's fixed furniture together, keeping everything that moves.
    const roomRoots = this.scene.children.filter((o) => !before.has(o));
    mergeStatic(roomRoots, [this.casino.showcase, this.casino.phoneHandset, ...this.casino.occluders]);
    this.buildTable(base);
    this.buildMarquee();
    this.buildPeople();
    // Reflections of the real room for metal, lacquer and glass.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const probe = new THREE.Vector3(TABLE.x, 1.4, TABLE.z + 1);
    const cubeCam = new THREE.CubeCamera(0.1, 30, new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType }));
    cubeCam.position.copy(probe);
    this.scene.add(cubeCam);
    cubeCam.update(this.renderer, this.scene);
    this.scene.environment = pmrem.fromCubemap(cubeCam.renderTarget.texture).texture;
    this.scene.environmentIntensity = 0.55;
    this.scene.remove(cubeCam);
  }

  private resize(): void {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.vhs.uniforms.resolution.value.set(size.x, size.y);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /**
   * high: everything. medium: no ambient occlusion, 1× resolution, lighter shadows.
   * low: also no bloom and no multisampling, lower resolution, shadows updated less often.
   */
  setQuality(q: Quality): void {
    this.quality = q;
    if (this.gtao) this.gtao.enabled = q === 'high';
    this.bloom.enabled = q !== 'low';
    const samples = q === 'high' ? 4 : q === 'medium' ? 2 : 0;
    for (const t of [this.composer.renderTarget1, this.composer.renderTarget2]) {
      if (t.samples !== samples) {
        t.samples = samples;
        t.dispose();
      }
    }
    const shadow = q === 'high' ? 2048 : 1024;
    this.scene.traverse((o) => {
      const l = o as THREE.SpotLight;
      if (l.isSpotLight && l.castShadow && l.shadow.mapSize.x !== shadow && l.shadow.mapSize.x >= 1024) {
        l.shadow.mapSize.set(shadow, shadow);
        l.shadow.map?.dispose();
        (l.shadow as { map: THREE.WebGLRenderTarget | null }).map = null;
      }
    });
    this.renderer.setPixelRatio(q === 'high' ? Math.min(window.devicePixelRatio, 1.25) : q === 'medium' ? 1 : 0.75);
    this.resize();
  }

  /**
   * Compiles every shader the game will need while the loading screen is up, so nothing stutters
   * the first time a chip, a talisman or a visitor appears.
   */
  async warmup(): Promise<void> {
    const extra = new THREE.Group();
    extra.position.set(TABLE.x, TABLE.height + 0.02, TABLE.z);
    for (const v of [1, 5, 25, 100, 500, 1000, 5000, 25000, 100000]) extra.add(this.makeChip(v));
    for (const id of Object.keys(ITEMS)) {
      const f = buildFigurine(id);
      extra.add(f.group);
      const g = buildFigurine(id);
      goldify(g);
      extra.add(g.group);
    }
    extra.add(buildUpgradeBox('#f2c14e').group);
    this.scene.add(extra);
    // Hidden things (visitors, the ball, ghost chips) are skipped by the compiler, so show them for a moment.
    const hidden: THREE.Object3D[] = [];
    this.scene.traverse((o) => {
      if (!o.visible) {
        hidden.push(o);
        o.visible = true;
      }
    });
    try {
      await this.renderer.compileAsync(this.scene, this.camera);
      this.composer.render(0);
    } finally {
      for (const o of hidden) o.visible = false;
      this.scene.remove(extra);
    }
  }

  /** Short burst of tape distortion, e.g. when the debt collectors come in. */
  distort(amount: number): void {
    this.glitch = Math.max(this.glitch, amount);
  }

  // ---- People ------------------------------------------------------------------

  private human(style: HumanStyle): Human {
    const h = new Human(this.humanAssets, style);
    this.scene.add(h.group);
    this.people.push(h);
    return h;
  }

  private buildPeople(): void {
    this.player = this.human({ kind: 'man', hat: true });
    this.resetPlayer();
    this.croupier = this.human({ kind: 'man', top: 0x3a0a12, bottom: 0x121212, beard: false });
    this.croupier.group.position.set(TABLE.x - 0.1, 0, TABLE.z - TABLE.halfD - 0.42);
    this.cashier = this.human({ kind: 'man', top: 0x1c3326, bottom: 0x151515 });
    this.cashier.group.position.set(KASSE.x, 0, KASSE.z - 0.72);
    for (const [s, b] of [[1.06, 1.12], [1.1, 1.2]]) {
      const t = this.human({ kind: 'man', top: 0x0b0b0d, bottom: 0x0b0b0d, shoes: 0x0a0a0a, sunglasses: true, scale: s, bulk: b, beard: false });
      t.group.position.set(DOOR.x, 0, DOOR.z - 1);
      t.group.visible = false;
      this.thugs.push(t);
    }
    this.rival = this.human({ kind: 'man', top: 0x3a1a4a, bottom: 0x1a1020, hat: false, beard: true, scale: 0.98 });
    this.rival.group.visible = false;
    this.shark = this.human({ kind: 'man', top: 0xe8e2d6, bottom: 0xe8e2d6, shoes: 0xf0ece4, hat: true, sunglasses: true, beard: false, scale: 1.04, bulk: 1.12 });
    this.shark.group.visible = false;
    const tints = [0x4a4238, 0x2e2a44];
    this.casino.guestSpots.forEach((spot, i) => {
      const g = this.human({ kind: 'man', top: tints[i % 2], bottom: 0x2a2622, hat: i === 1 });
      g.group.position.set(spot.x, 0, spot.z);
      g.heading = spot.heading;
      this.guests.push(g);
    });
  }

  // ---- The roulette table ----------------------------------------------------------

  private buildTable(base: string): void {
    const T = TABLE;
    const table = new THREE.Group();
    table.position.set(T.x, 0, T.z);
    const woodS = wood(base, [2, 1]);
    const lacquer = new THREE.MeshPhysicalMaterial({ ...woodS, color: 0x6a3218, roughness: 0.38, clearcoat: 1, clearcoatRoughness: 0.1 });
    const brass = new THREE.MeshStandardMaterial({ color: 0xc9a04a, metalness: 1, roughness: 0.25, roughnessMap: smudges([2, 2]) });
    const feltMat = new THREE.MeshPhysicalMaterial({
      color: 0x0c4a2c, roughness: 0.95, sheen: 1, sheenColor: new THREE.Color(0x2a8a5a), sheenRoughness: 0.6,
      normalMap: feltNormal([8, 4]), normalScale: new THREE.Vector2(0.35, 0.35),
    });
    const leatherMat = new THREE.MeshPhysicalMaterial({ ...leather(), color: 0x2a0c08, roughness: 0.55, clearcoat: 0.3, clearcoatRoughness: 0.5 });

    const body = new THREE.Mesh(new RoundedBoxGeometry(T.halfW * 2 - 0.1, 0.24, T.halfD * 2 - 0.1, 3, 0.03), lacquer);
    body.position.y = T.height - 0.14;
    body.castShadow = body.receiveShadow = true;
    const top = new THREE.Mesh(new THREE.BoxGeometry(T.halfW * 2 - 0.04, 0.03, T.halfD * 2 - 0.04), feltMat);
    top.position.y = T.height - 0.015;
    top.receiveShadow = true;
    table.add(body, top);

    // Padded leather armrest running around the table, with a lacquered wood inner trim.
    const rail = (inset: number, radius: number, mat: THREE.Material, y: number) => {
      const w = T.halfW - inset, d = T.halfD - inset, r = 0.12;
      const pts: THREE.Vector3[] = [];
      const corner = (cx: number, cz: number, a0: number) => {
        for (let i = 0; i <= 6; i++) {
          const a = a0 + (i / 6) * (Math.PI / 2);
          pts.push(new THREE.Vector3(cx + Math.cos(a) * r, 0, cz + Math.sin(a) * r));
        }
      };
      corner(w - r, d - r, 0);
      corner(-w + r, d - r, Math.PI / 2);
      corner(-w + r, -d + r, Math.PI);
      corner(w - r, -d + r, Math.PI * 1.5);
      const curve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.2);
      const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 160, radius, 14, true), mat);
      m.position.y = y;
      m.scale.y = 0.75;
      m.castShadow = m.receiveShadow = true;
      table.add(m);
    };
    rail(0.02, 0.045, leatherMat, T.height + 0.012);
    rail(0.085, 0.014, lacquer, T.height + 0.004);

    for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.03, T.height - 0.26, 16), lacquer);
      leg.position.set(x * (T.halfW - 0.28), (T.height - 0.26) / 2, z * (T.halfD - 0.22));
      leg.castShadow = true;
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.05, 16), brass);
      foot.position.set(leg.position.x, 0.025, leg.position.z);
      table.add(leg, foot);
    }
    this.scene.add(table);

    // Chip rack in front of the croupier.
    const rack = new THREE.Group();
    rack.position.set(T.x + 0.1, T.height, T.z - T.halfD + 0.13);
    rack.add(Object.assign(new THREE.Mesh(new RoundedBoxGeometry(0.62, 0.035, 0.12, 2, 0.01), lacquer), { castShadow: true }));
    const vals = [1, 5, 25, 100, 500, 1000];
    vals.forEach((v, i) => {
      const n = 10 + ((i * 7) % 9);
      const stack = new THREE.InstancedMesh(this.chipGeo, this.chipMaterials(v)[0], n);
      const faceMat = this.chipMaterials(v)[1];
      const topChip = new THREE.Mesh(this.chipGeo, [this.chipMaterials(v)[0], faceMat, faceMat]);
      const m = new THREE.Matrix4();
      for (let k = 0; k < n; k++) {
        m.makeRotationZ(Math.PI / 2).setPosition(-0.26 + i * 0.1 + k * CHIP_H - (n * CHIP_H) / 2 + 0.03, 0.04, 0);
        stack.setMatrixAt(k, m);
      }
      topChip.rotation.z = Math.PI / 2;
      topChip.position.set(-0.26 + i * 0.1 + n * CHIP_H - (n * CHIP_H) / 2 + 0.03, 0.04, 0);
      stack.castShadow = true;
      rack.add(stack, topChip);
    });
    this.scene.add(rack);

    // Ashtray with a burning cigarette on the table edge.
    const tray = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.02, 24), new THREE.MeshPhysicalMaterial({ color: 0x9ab8c8, transparent: true, opacity: 0.55, roughness: 0.05 }));
    tray.position.set(T.x + T.halfW - 0.2, T.height + 0.01, T.z - T.halfD + 0.16);
    const cig = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.07, 8), new THREE.MeshStandardMaterial({ color: 0xf0ece0, roughness: 0.8 }));
    cig.rotation.z = Math.PI / 2 - 0.2;
    cig.position.set(tray.position.x + 0.03, T.height + 0.028, tray.position.z);
    const ember = new THREE.Mesh(new THREE.SphereGeometry(0.0045, 8, 6), new THREE.MeshStandardMaterial({ color: 0xff5010, emissive: 0xff4010, emissiveIntensity: 3 }));
    ember.position.set(tray.position.x + 0.064, T.height + 0.035, tray.position.z);
    this.scene.add(tray, cig, ember);
    const smokeUpdates: ((dt: number, t: number) => void)[] = [];
    smoke(this.scene, smokeUpdates, ember.position.clone(), 4);
    this.tickers.push((dt, t) => {
      smokeUpdates.forEach((u) => u(dt, t));
      (ember.material as THREE.MeshStandardMaterial).emissiveIntensity = 2 + Math.sin(t * 2.3) * 1.2;
    });

    // Betting layout.
    this.layout.position.set(T.x + TABLE_LAYOUT.x, T.height + 0.001, T.z + TABLE_LAYOUT.z);
    this.felt = new THREE.Mesh(
      new THREE.PlaneGeometry(BOARD_SIZE.w, BOARD_SIZE.d),
      new THREE.MeshPhysicalMaterial({
        map: boardTexture(), roughness: 0.92, sheen: 0.8, sheenColor: new THREE.Color(0x3a9a6a), sheenRoughness: 0.6,
        normalMap: feltNormal([10, 4]), normalScale: new THREE.Vector2(0.3, 0.3),
      }),
    );
    this.felt.rotation.x = -Math.PI / 2;
    this.felt.position.set((LAYOUT_BOUNDS.x0 + LAYOUT_BOUNDS.x1) / 2, 0, (LAYOUT_BOUNDS.z0 + LAYOUT_BOUNDS.z1) / 2);
    this.felt.receiveShadow = true;
    this.layout.add(this.felt);
    const hlGeo = new THREE.PlaneGeometry(1, 1);
    for (const f of FIELDS) {
      const r = FIELD_RECTS[f.id];
      if (!r) continue;
      const m = new THREE.Mesh(hlGeo, new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
      m.rotation.x = -Math.PI / 2;
      m.scale.set(r.x1 - r.x0 - 0.008, r.z1 - r.z0 - 0.008, 1);
      m.position.set((r.x0 + r.x1) / 2, 0.001, (r.z0 + r.z1) / 2);
      this.highlights.set(f.id, m);
      this.layout.add(m);
    }
    // The dolly: the croupier's marker on the winning number.
    this.dolly = new THREE.Group();
    const crystal = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.04, 16), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, roughness: 0, clearcoat: 1, ior: 1.5 }));
    crystal.position.y = 0.02;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.01, 14, 10), brass);
    cap.position.y = 0.045;
    this.dolly.add(crystal, cap);
    this.dolly.visible = false;
    this.layout.add(this.dolly);
    this.scene.add(this.layout);
    this.tableGroup.position.set(T.x, T.height, T.z);
    this.scene.add(this.tableGroup);

    // The table's wood, leather, brass and the croupier's chip rack never move: one draw call per material.
    mergeStatic([table, rack], [], this.scene);
    const s = TABLE_WHEEL.scale;
    this.wheel.group.scale.setScalar(s);
    this.wheel.group.position.set(T.x + TABLE_WHEEL.x, T.height - 0.9 * s + 0.004, T.z + TABLE_WHEEL.z);
    this.scene.add(this.wheel.group);
  }

  private tickers: ((dt: number, t: number) => void)[] = [];

  /** Shows the marker on the winning number, or hides it. */
  setDolly(number?: number): void {
    if (number === undefined) {
      this.dolly.visible = false;
      return;
    }
    const c = fieldCenter(`n${number}`);
    this.dolly.visible = true;
    const from = new THREE.Vector3(c.x - 0.3, 0.2, c.z - 0.3);
    const to = new THREE.Vector3(c.x + 0.02, 0, c.z + 0.02);
    this.tween(0.5, (u) => {
      this.dolly.position.lerpVectors(from, to, u);
      this.dolly.position.y = Math.sin(u * Math.PI) * 0.08 * (1 - u) + to.y;
    });
  }

  // ---- Player movement -------------------------------------------------------

  /** `move` is a screen-relative direction in the XZ plane (length ≤ 1). */
  // ---- First person ------------------------------------------------------------------

  /** View direction: yaw 0 looks along -z (from the entrance side towards the table). */
  yaw = 0;
  /** Mouse sensitivity factor (settings). */
  sensitivity = 1;
  pitch = -0.08;
  private bob = 0;
  private stepPhase = 0;
  /** Called on every footstep, for the sound. */
  onStep?: () => void;

  /** Turns the view by a mouse movement (pixels). */
  look(dx: number, dy: number): void {
    const sens = 0.0024 * this.sensitivity;
    this.yaw -= dx * sens;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * sens, -1.2, 1.0);
  }

  /** Faces the view towards a point on the floor plan. */
  lookAtPoint(x: number, z: number, pitch = -0.1): void {
    const p = this.player.group.position;
    this.yaw = Math.atan2(-(x - p.x), -(z - p.z));
    this.pitch = pitch;
  }

  private forward(out: THREE.Vector3): THREE.Vector3 {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  /** `move`: x = strafe right, y = backwards (as WASD reports it), relative to the view. */
  movePlayer(dt: number, move: THREE.Vector2, sprint: boolean): void {
    const speed = sprint ? SPRINT : WALK;
    const f = this.forward(this.tmpWorld);
    const rx = -f.z, rz = f.x;
    const target = new THREE.Vector3((rx * move.x - f.x * move.y) * speed, 0, (rz * move.x - f.z * move.y) * speed);
    this.velocity.lerp(target, 1 - Math.exp(-(move.lengthSq() > 0 ? 10 : 14) * dt));
    const p = this.player.group.position;
    p.addScaledVector(this.velocity, dt);
    this.collide(p);
    const v = Math.hypot(this.velocity.x, this.velocity.z);
    this.player.heading = this.yaw + Math.PI;
    this.player.setSpeed(v);
    // Head bob and footsteps.
    if (v > 0.2) {
      const before = Math.sin(this.stepPhase);
      this.stepPhase += dt * v * 5.2;
      if (before > 0 && Math.sin(this.stepPhase) <= 0) this.onStep?.();
      if (before < 0 && Math.sin(this.stepPhase) >= 0) this.onStep?.();
    }
    this.bob += ((v > 0.2 ? 1 : 0) - this.bob) * Math.min(1, dt * 6);
  }

  /** What the player is looking at and close enough to use. */
  focus(): 'kasse' | 'vitrine' | 'phone' | 'smokes' | 'table' | undefined {
    const p = this.player.group.position;
    const f = this.forward(this.tmpWorld);
    const t = TABLE;
    const targets: { id: 'kasse' | 'vitrine' | 'phone' | 'smokes' | 'table'; x: number; z: number; reach: number }[] = [
      { id: 'kasse', x: KASSE.x, z: KASSE.z + KASSE.halfD, reach: 1.9 },
      { id: 'vitrine', x: VITRINE.x + VITRINE.halfW, z: VITRINE.z, reach: 1.8 },
      { id: 'phone', x: PHONE.x, z: PHONE.z, reach: 1.6 },
      { id: 'smokes', x: SMOKES.x - SMOKES.halfW, z: SMOKES.z, reach: 1.6 },
      // The table's nearest edge point, so it can be used from its whole long side.
      { id: 'table', x: THREE.MathUtils.clamp(p.x, t.x - t.halfW + 0.3, t.x + t.halfW), z: THREE.MathUtils.clamp(p.z, t.z - t.halfD, t.z + t.halfD), reach: 1.25 },
    ];
    let best: (typeof targets)[number]['id'] | undefined;
    let bestDot = Math.cos(0.75);
    for (const g of targets) {
      const dx = g.x - p.x, dz = g.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > g.reach) continue;
      const dot = d < 0.35 ? 1 : (dx * f.x + dz * f.z) / d;
      if (dot > bestDot) {
        bestDot = dot;
        best = g.id;
      }
    }
    return best;
  }

  /** Keeps the player out of furniture and out of other people. */
  private collide(p: THREE.Vector3): void {
    for (const h of this.people) {
      if (h === this.player || !h.group.visible) continue;
      const q = h.group.position;
      const dx = p.x - q.x, dz = p.z - q.z;
      const d = Math.hypot(dx, dz);
      const min = PLAYER_R + PERSON_R;
      if (d < min && d > 1e-6) {
        p.x = q.x + (dx / d) * min;
        p.z = q.z + (dz / d) * min;
      }
    }
    resolve(p, PLAYER_R);
  }

  /** People step aside for each other and never stand inside furniture. */
  private separatePeople(): void {
    const fixed = new Set<Human>([this.croupier, this.cashier, ...this.guests]);
    const movers = this.people.filter((h) => h !== this.player && h.group.visible && !fixed.has(h));
    for (const a of movers) {
      const pa = a.group.position;
      for (const b of this.people) {
        if (b === a || !b.group.visible) continue;
        const pb = b.group.position;
        const dx = pa.x - pb.x, dz = pa.z - pb.z;
        const d = Math.hypot(dx, dz);
        const min = PERSON_R * 2;
        if (d >= min || d < 1e-6) continue;
        // Moving people give way to fixed ones and to the player; two walkers share the push.
        const share = fixed.has(b) || b === this.player ? 1 : 0.5;
        pa.x += (dx / d) * (min - d) * share;
        pa.z += (dz / d) * (min - d) * share;
      }
      resolve(pa, PERSON_R);
    }
  }


  distTo(spot: { x: number; z: number }): number {
    const p = this.player.group.position;
    return Math.hypot(p.x - spot.x, p.z - spot.z);
  }

  nearTable(): boolean {
    const p = this.player.group.position;
    const o = OBSTACLES[0];
    return this.distTo(TABLE_SPOT) < 1.3 || (p.x > o.x0 - 0.2 && p.x < o.x1 + 0.2 && p.z > o.z1 && p.z < o.z1 + 0.9);
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

  /** Puts the player a few steps into the room, looking at the table. */
  resetPlayer(): void {
    this.player.group.position.set(TABLE.x - 0.4, 0, TABLE.z + 2.6);
    this.yaw = 0;
    this.pitch = -0.12;
    this.player.group.visible = false;
    this.velocity.set(0, 0, 0);
  }

  nearSmokes(): boolean {
    return this.distTo(SMOKES_SPOT) < 1.0;
  }

  /** Puts the player at the table (hidden, first-person) or back into the room. */
  standAtTable(atTable: boolean): void {
    const p = this.player.group.position;
    if (atTable) {
      p.set(TABLE_SPOT.x, 0, TABLE_SPOT.z);
    } else {
      // Step back from the table, looking at it.
      this.yaw = 0;
      this.pitch = -0.35;
    }
    // First person: you never see your own body.
    this.player.group.visible = false;
    this.velocity.set(0, 0, 0);
  }

  standAt(where: 'kasse' | 'vitrine' | 'phone' | 'smokes'): void {
    const spot = where === 'kasse' ? KASSE_SPOT : where === 'vitrine' ? VITRINE_SPOT : where === 'smokes' ? SMOKES_SPOT : PHONE_SPOT;
    this.player.group.position.set(spot.x, 0, spot.z);
    this.player.group.visible = false;
    this.velocity.set(0, 0, 0);
  }

  // ---- Table interaction -------------------------------------------------------

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

  // ---- Chips --------------------------------------------------------------------

  private chipMaterials(value: number): THREE.Material[] {
    let mats = this.chipMats.get(value);
    if (!mats) {
      const side = new THREE.MeshPhysicalMaterial({ map: chipSideTexture(value), roughness: 0.45, clearcoat: 0.4, clearcoatRoughness: 0.4 });
      const face = new THREE.MeshPhysicalMaterial({ map: chipTexture(value), roughness: 0.4, clearcoat: 0.5, clearcoatRoughness: 0.35 });
      mats = [side, face, face];
      this.chipMats.set(value, mats);
    }
    return mats.map((m) => m.clone());
  }

  private makeChip(value: number): THREE.Mesh {
    const m = new THREE.Mesh(this.chipGeo, this.chipMaterials(value));
    m.castShadow = true;
    m.receiveShadow = true;
    m.userData.value = value;
    return m;
  }

  private stackPos(fieldId: string, i: number): THREE.Vector3 {
    const c = fieldCenter(fieldId);
    const j = ((i * 7919) % 13) / 13 - 0.5;
    const k = ((i * 104729) % 11) / 11 - 0.5;
    return new THREE.Vector3(c.x + j * 0.003, CHIP_H / 2 + i * CHIP_H, c.z + k * 0.003);
  }

  setGhost(value: number | undefined, fieldId: string | undefined): void {
    if (value !== this.ghostValue) {
      if (this.ghost) this.layout.remove(this.ghost);
      this.ghost = undefined;
      this.ghostValue = value;
      if (value) {
        this.ghost = this.makeChip(value);
        for (const m of this.ghost.material as THREE.MeshStandardMaterial[]) {
          m.transparent = true;
          m.opacity = 0.5;
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
      this.ghost.position.set(pos.x, pos.y + 0.01 + Math.sin(this.time * 5) * 0.003, pos.z);
    }
  }

  placeChip(fieldId: string, value: number): void {
    const stack = this.stacks.get(fieldId) ?? [];
    this.stacks.set(fieldId, stack);
    const mesh = this.makeChip(value);
    const to = this.stackPos(fieldId, stack.length);
    stack.push(mesh);
    const from = new THREE.Vector3(to.x * 0.6, 0.22, 0.55);
    mesh.position.copy(from);
    mesh.rotation.y = Math.random() * Math.PI;
    this.layout.add(mesh);
    this.tween(0.24, (u) => {
      mesh.position.lerpVectors(from, to, u);
      mesh.position.y += Math.sin(u * Math.PI) * 0.06;
      mesh.rotation.x = (1 - u) * Math.PI * 1.5;
    });
  }

  pickChip(fieldId: string): void {
    const stack = this.stacks.get(fieldId);
    const mesh = stack?.pop();
    if (!mesh) return;
    if (!stack!.length) this.stacks.delete(fieldId);
    const from = mesh.position.clone();
    const to = new THREE.Vector3(from.x * 0.6, 0.22, 0.55);
    this.tween(0.2, (u) => {
      mesh.position.lerpVectors(from, to, u);
      mesh.position.y += Math.sin(u * Math.PI) * 0.05;
    }, () => this.layout.remove(mesh));
  }

  syncChips(bets: Record<string, number[]>): void {
    for (const stack of this.stacks.values()) for (const m of stack) this.layout.remove(m);
    this.stacks.clear();
    for (const [fid, values] of Object.entries(bets)) {
      const stack: THREE.Mesh[] = [];
      values.forEach((v, i) => {
        const m = this.makeChip(v);
        m.position.copy(this.stackPos(fid, i));
        m.rotation.y = Math.random() * Math.PI;
        this.layout.add(m);
        stack.push(m);
      });
      this.stacks.set(fid, stack);
    }
  }

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

  popField(fieldId: string, color = 0xffd76a): THREE.Vector3 {
    const stack = this.stacks.get(fieldId) ?? [];
    stack.forEach((mesh, i) => {
      const base = this.stackPos(fieldId, i);
      const mats = mesh.material as THREE.MeshStandardMaterial[];
      this.tween(0.4, (u) => {
        const k = Math.sin(u * Math.PI);
        mesh.position.set(base.x, base.y + k * (0.02 + i * 0.003), base.z);
        mesh.rotation.z = Math.sin(u * Math.PI * 2) * 0.25;
        mats[0].emissive.setHex(0xffc850);
        mats[0].emissiveIntensity = k * 0.7;
      });
    });
    const world = this.fieldTopWorld(fieldId);
    this.burst(world, color, 12);
    return world;
  }

  coinShower(n: number): void {
    const b = LAYOUT_BOUNDS;
    for (let i = 0; i < n; i++) {
      const mesh = new THREE.Mesh(this.coinGeo, this.coinMat);
      mesh.position.set(b.x0 + Math.random() * (b.x1 - b.x0), 0.5 + Math.random() * 0.7, b.z0 + Math.random() * (b.z1 - b.z0));
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

  // ---- Talismans on the table ---------------------------------------------------

  setItems(items: ItemInstance[], slots: number): void {
    const keep = new Map(this.placedItems.map((p) => [p.uid, p]));
    const next: PlacedItem[] = [];
    for (const it of items) {
      let p = keep.get(it.uid);
      if (p && p.gold !== !!it.gold) {
        this.tableGroup.remove(p.holder);
        p = undefined;
      }
      if (!p) {
        const fig = buildFigurine(it.def);
        if (it.gold) goldify(fig);
        const holder = new THREE.Group();
        holder.add(fig.group);
        holder.userData.itemUid = it.uid;
        this.tableGroup.add(holder);
        p = { uid: it.uid, def: it.def, fig, holder, jump: 1, gold: !!it.gold };
        const s = itemSlot(next.length, slots);
        this.burst(this.tableGroup.localToWorld(new THREE.Vector3(s.x, 0.05, s.z)), 0xffd76a, it.gold ? 50 : 20, 0.02);
      }
      keep.delete(it.uid);
      next.push(p);
    }
    for (const p of keep.values()) this.tableGroup.remove(p.holder);
    this.placedItems = next;
    for (const m of this.slotPlates) this.tableGroup.remove(m);
    this.slotPlates = [];
    const plateMat = new THREE.MeshPhysicalMaterial({ color: 0x1a0a06, roughness: 0.3, clearcoat: 1 });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xc9a04a, metalness: 1, roughness: 0.3 });
    for (let i = 0; i < slots; i++) {
      const s = itemSlot(i, slots);
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.05, 0.006, 32), plateMat);
      plate.position.set(s.x, 0.003, s.z);
      plate.receiveShadow = true;
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.049, 0.002, 6, 32), rimMat);
      rim.rotation.x = Math.PI / 2;
      rim.position.set(s.x, 0.006, s.z);
      this.tableGroup.add(plate, rim);
      this.slotPlates.push(plate, rim);
      if (next[i]) next[i].holder.position.set(s.x, 0.006, s.z);
    }
    next.forEach((p, i) => (p.holder.visible = i < slots));
  }

  pickItem(clientX: number, clientY: number): number | undefined {
    const ndc = new THREE.Vector2((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObjects(this.placedItems.map((p) => p.holder), true)[0];
    let o: THREE.Object3D | null = hit?.object ?? null;
    while (o && o.userData.itemUid === undefined) o = o.parent;
    return o?.userData.itemUid;
  }

  triggerItem(uid: number): THREE.Vector3 | undefined {
    const p = this.placedItems.find((x) => x.uid === uid);
    if (!p) return undefined;
    p.jump = 1;
    const top = p.holder.localToWorld(new THREE.Vector3(0, p.fig.height + 0.02, 0));
    this.burst(top, 0xffe08a, 14);
    return top;
  }

  // ---- Showcase and marquee ----------------------------------------------------------

  setShowcase(shop: ShopItem[]): void {
    for (const s of this.showcaseItems) this.casino.showcase.remove(s.holder);
    this.showcaseItems = [];
    const V = VITRINE;
    const items = shop.map((it, i) => ({ it, i })).filter((x) => x.it.kind === 'item');
    const tools = shop.map((it, i) => ({ it, i })).filter((x) => x.it.kind === 'pocket');
    const place = (list: typeof items, y: number, scale: number) => {
      list.forEach(({ it, i }, col) => {
        if (it.sold) return;
        const color = POCKET_MOD_INFO[it.def as keyof typeof POCKET_MOD_INFO]?.color ?? ((it.def as PocketToolId) === 'pinsel' ? '#e8e0d0' : '#7a7aff');
        const fig = it.kind === 'item' ? buildFigurine(it.def) : buildUpgradeBox(color);
        const holder = new THREE.Group();
        holder.add(fig.group);
        holder.scale.setScalar(scale);
        holder.position.set(0.05, y, -V.halfD + 0.25 + (col + 0.5) * ((V.halfD * 2 - 0.5) / list.length));
        holder.rotation.y = Math.PI / 2;
        this.casino.showcase.add(holder);
        this.showcaseItems.push({ index: i, fig, holder });
      });
    };
    place(items, 1.31, 2.2);
    place(tools, 0.73, 1.6);
  }

  private buildMarquee(): void {
    this.marqueeCanvas.width = 256;
    this.marqueeCanvas.height = 512;
    this.marqueeTex = new THREE.CanvasTexture(this.marqueeCanvas);
    this.marqueeTex.colorSpace = THREE.SRGBColorSpace;
    const g = new THREE.Group();
    g.position.set(TABLE.x - TABLE.halfW + 0.05, 0, TABLE.z - TABLE.halfD - 0.15);
    g.rotation.y = 0.5;
    const metal = new THREE.MeshStandardMaterial({ color: 0xc9a04a, metalness: 1, roughness: 0.3 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 1.5, 16), metal);
    pole.position.y = 0.75;
    const frame = new THREE.Mesh(new RoundedBoxGeometry(0.36, 0.64, 0.06, 2, 0.01), new THREE.MeshStandardMaterial({ color: 0x111114, roughness: 0.4 }));
    frame.position.y = 1.75;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.58), new THREE.MeshBasicMaterial({ map: this.marqueeTex, toneMapped: false }));
    screen.position.set(0, 1.75, 0.031);
    g.add(pole, frame, screen);
    this.scene.add(g);
    this.setMarquee([], 0, 0, 0);
  }

  setMarquee(history: { n: number; c: string }[], debt: number, round: number, rounds: number): void {
    const c = this.marqueeCanvas;
    const g = c.getContext('2d')!;
    g.fillStyle = '#050305';
    g.fillRect(0, 0, c.width, c.height);
    // LED dot grid.
    g.fillStyle = 'rgba(255,255,255,0.03)';
    for (let y = 0; y < c.height; y += 6) for (let x = 0; x < c.width; x += 6) g.fillRect(x, y, 3, 3);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#ffcf5a';
    g.font = '700 26px monospace';
    g.fillText('RATE', 128, 34);
    g.font = '700 44px monospace';
    g.fillText('$' + debt.toLocaleString('de-DE'), 128, 76);
    g.font = '700 24px monospace';
    g.fillStyle = '#ff7a5a';
    g.fillText(rounds ? `DREH ${Math.min(round, rounds)}/${rounds}` : '', 128, 116);
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

  // ---- Rival, loan shark and the ball ------------------------------------------------

  /** A regular walks up to the table's end and puts his chips on `fieldId`; undefined sends him away. */
  setRival(duel?: { fieldId: string; stake: number }): void {
    for (const m of this.rivalChips) this.layout.remove(m);
    this.rivalChips = [];
    if (!duel) {
      if (this.rivalState !== 'away') this.rivalState = 'leaving';
      return;
    }
    if (this.rivalState === 'away' || this.rivalState === 'leaving') {
      this.rivalState = 'coming';
      this.rival.group.visible = true;
      this.rival.group.position.set(DOOR.x + 0.3, 0, DOOR.z + 0.5);
    }
    // His chips: a violet stack with a gold rim so they are never mistaken for yours.
    const c = fieldCenter(duel.fieldId);
    const n = Math.max(2, Math.min(8, Math.round(Math.log2(duel.stake + 1))));
    const side = new THREE.MeshPhysicalMaterial({ color: 0x5a1a8a, roughness: 0.4, clearcoat: 0.6 });
    const face = new THREE.MeshPhysicalMaterial({ map: chipTexture(500), color: 0xd8b8ff, roughness: 0.4, clearcoat: 0.6 });
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(this.chipGeo, [side, face, face]);
      m.position.set(c.x + 0.028, CHIP_H / 2 + i * CHIP_H, c.z - 0.024);
      m.rotation.y = i * 0.7;
      m.castShadow = true;
      this.layout.add(m);
      this.rivalChips.push(m);
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(CHIP_R + 0.003, 0.0015, 6, 32), new THREE.MeshBasicMaterial({ color: 0xc9a0ff, toneMapped: false }));
    ring.rotation.x = Math.PI / 2;
    ring.position.set(c.x + 0.028, 0.002, c.z - 0.024);
    this.layout.add(ring);
    this.rivalChips.push(ring);
  }

  /** The rival reacts to the duel's outcome. */
  rivalReact(won: boolean): void {
    this.rival.play(won ? 'agree' : 'headShake');
  }

  summonShark(): void {
    this.sharkState = 'coming';
    this.shark.group.visible = true;
    this.shark.group.position.set(DOOR.x, 0, DOOR.z + 0.3);
    this.distort(0.8);
  }

  dismissShark(): void {
    if (this.sharkState !== 'away') this.sharkState = 'leaving';
  }

  /** Swaps the look of the roulette ball. */
  setBall(id: string): void {
    const b = BALLS[id] ?? BALLS.stahl;
    const m = this.wheel.ball.material as THREE.MeshPhysicalMaterial;
    m.color.setHex(b.color);
    m.metalness = b.metal;
    m.roughness = b.rough;
    m.transmission = b.clear ? 0.9 : 0;
    m.thickness = b.clear ? 0.3 : 0;
    m.ior = 1.5;
    m.needsUpdate = true;
  }

  /** The croupier nods when he takes a bribe. */
  croupierNod(): void {
    this.croupier.play('agree');
  }

  private updateVisitors(dt: number): void {
    const p = this.player.group.position;
    const r = this.rival;
    if (this.rivalState === 'coming' || this.rivalState === 'here') {
      if (r.walkPath(RIVAL_SPOT.x, RIVAL_SPOT.z, dt, 1.2)) {
        this.rivalState = 'here';
        r.face(TABLE.x + TABLE_LAYOUT.x - RIVAL_SPOT.x, TABLE.z - RIVAL_SPOT.z, dt, 4);
      }
    } else if (this.rivalState === 'leaving') {
      if (r.walkPath(DOOR.x + 0.3, DOOR.z + 0.45, dt, 1.4)) {
        r.group.visible = false;
        this.rivalState = 'away';
      }
    }
    const sh = this.shark;
    if (this.sharkState === 'coming' || this.sharkState === 'here') {
      const tx = p.x + 0.9, tz = p.z + 0.7;
      if (sh.walkPath(tx, tz, dt, 1.3) || this.sharkState === 'here') {
        this.sharkState = 'here';
        sh.face(p.x - sh.group.position.x, p.z - sh.group.position.z, dt, 4);
      }
    } else if (this.sharkState === 'leaving') {
      if (sh.walkPath(DOOR.x, DOOR.z + 0.45, dt, 1.5)) {
        sh.group.visible = false;
        this.sharkState = 'away';
      }
    }
  }

  // ---- Debt collectors ------------------------------------------------------------

  summonThugs(): void {
    if (this.thugState === 'coming' || this.thugState === 'waiting') return;
    this.thugState = 'coming';
    this.distort(1);
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
    this.distort(1.5);
    this.thugs.forEach((t) => (t.group.visible = true));
  }

  private updateThugs(dt: number): void {
    const posts = [
      { x: KASSE.x - KASSE.halfW - 0.45, z: KASSE.z + 0.95 },
      { x: KASSE.x + KASSE.halfW - 0.2, z: KASSE.z + 1.3 },
    ];
    const p = this.player.group.position;
    this.thugs.forEach((t, i) => {
      if (!t.group.visible) return;
      switch (this.thugState) {
        case 'coming':
        case 'waiting': {
          const arrived = t.walkPath(posts[i].x, posts[i].z, dt, 1.3);
          if (arrived) {
            t.face(p.x - t.group.position.x, p.z - t.group.position.z, dt, 3);
            if (this.thugState === 'coming' && i === 1) {
              this.thugState = 'waiting';
              t.play('headShake');
            }
          }
          break;
        }
        case 'leaving':
          if (t.walkPath(DOOR.x + (i - 0.5) * 0.5, DOOR.z + 0.45, dt, 1.6)) t.group.visible = false;
          break;
        case 'attacking': {
          const side = i === 0 ? -0.6 : 0.6;
          if (t.walkPath(p.x + side, p.z + 0.15, dt, 2.2)) t.face(p.x - t.group.position.x, p.z - t.group.position.z, dt, 6);
          break;
        }
      }
    });
    if (this.thugState === 'leaving' && this.thugs.every((t) => !t.group.visible)) this.thugState = 'away';
  }

  // ---- Effects --------------------------------------------------------------------

  private tween(dur: number, step: (u: number) => void, done?: () => void): void {
    this.tweens.push({ t: 0, dur, step, done });
  }

  burst(at: THREE.Vector3, color: number, n: number, speed = 0.012): void {
    const mat = new THREE.MeshBasicMaterial({ color, toneMapped: false });
    const scale = speed / 0.012;
    for (let i = 0; i < n; i++) {
      const mesh = new THREE.Mesh(this.sparkGeo, mat);
      mesh.scale.setScalar(scale);
      mesh.position.copy(at);
      const vel = new THREE.Vector3((Math.random() - 0.5) * 0.5, 0.25 + Math.random() * 0.5, (Math.random() - 0.5) * 0.5).multiplyScalar(scale);
      this.sparks.push({ mesh, vel, life: 0.6 + Math.random() * 0.5 });
      this.scene.add(mesh);
    }
  }

  project(p: THREE.Vector3): { x: number; y: number; visible: boolean } {
    const v = p.clone().project(this.camera);
    return { x: ((v.x + 1) / 2) * window.innerWidth, y: ((1 - v.y) / 2) * window.innerHeight, visible: v.z < 1 };
  }

  // ---- Frame ---------------------------------------------------------------------

  update(dt: number): void {
    this.time += dt;
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tw = this.tweens[i];
      tw.t += dt;
      const u = Math.min(1, tw.t / tw.dur);
      tw.step(u);
      if (u >= 1) {
        const at = this.tweens.indexOf(tw);
        if (at >= 0) this.tweens.splice(at, 1);
        tw.done?.();
      }
    }
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.life -= dt;
      s.vel.y -= 1.2 * dt * s.mesh.scale.x;
      s.mesh.position.addScaledVector(s.vel, dt);
      s.mesh.rotation.x += dt * 8;
      if (s.life <= 0) {
        this.scene.remove(s.mesh);
        this.sparks.splice(i, 1);
      }
    }
    for (const f of [...this.falling]) {
      f.life -= dt;
      f.vel.y -= 3.2 * dt;
      f.mesh.position.addScaledVector(f.vel, dt);
      f.mesh.rotation.x += f.spin.x * dt;
      f.mesh.rotation.z += f.spin.z * dt;
      if (f.mesh.position.y < 0.0015) {
        f.mesh.position.y = 0.0015;
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
    for (const p of this.placedItems) {
      p.fig.animate?.(this.time);
      if (p.gold && Math.random() < dt * 3) this.burst(p.holder.localToWorld(new THREE.Vector3((Math.random() - 0.5) * 0.05, p.fig.height * Math.random() + 0.01, (Math.random() - 0.5) * 0.05)), 0xffe08a, 1, 0.004);
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
    this.casino.phoneHandset.position.y = 0.11 + (ring ? 0.012 : 0);
    this.casino.phoneHandset.rotation.z = ring ? Math.sin(this.time * 60) * 0.08 : 0;
    this.casino.phoneLamp.emissiveIntensity = this.phoneRinging ? (Math.sin(this.time * 6) > 0 ? 3 : 0.2) : 0;
    this.casino.phoneLight.intensity = this.phoneRinging ? (Math.sin(this.time * 6) > 0 ? 4 : 0) : 0;
    this.casino.update(dt, this.time);
    for (const t of this.tickers) t(dt, this.time);

    const pulse = 0.3 + 0.2 * Math.sin(this.time * 6);
    for (const [id, m] of this.highlights) {
      const mat = m.material as THREE.MeshBasicMaterial;
      let target = 0;
      if (this.pulseFields.has(id)) {
        target = pulse * 0.7;
        mat.color.setHex(0xffd24a);
      } else if (id === this.hoverField || this.hoverCells.has(id)) {
        target = id === this.hoverField ? 0.22 : 0.15;
        mat.color.setHex(0xfff2b0);
      } else if (this.markCells.has(id)) {
        target = 0.15 + 0.1 * Math.sin(this.time * 4);
        mat.color.setHex(0xb48cff);
      }
      mat.opacity += (target - mat.opacity) * Math.min(1, dt * 14);
      // Invisible highlights still cost a draw call each; skip them.
      m.visible = mat.opacity > 0.004;
    }

    // People: the croupier watches the wheel, everyone else idles and looks around.
    const pp = this.player.group.position;
    const cp = this.croupier.group.position;
    if (this.wheel.spinning) this.croupier.face(TABLE.x + TABLE_WHEEL.x - cp.x, TABLE.z - cp.z, dt, 3);
    else this.croupier.face(pp.x - cp.x, pp.z - cp.z, dt, 2);
    const kp = this.cashier.group.position;
    this.cashier.face(pp.x - kp.x, pp.z - kp.z, dt, 2);
    this.updateThugs(dt);
    this.updateVisitors(dt);
    this.separatePeople();
    for (const g of this.guests) if (Math.random() < dt * 0.05) g.play('agree');
    for (const h of this.people) h.update(dt);

    this.updateCamera(dt);
    this.updateFaces();
    this.glitch = Math.max(0, this.glitch - dt * 1.5);
    this.vhs.uniforms.time.value = this.time;
    // Keep the betting layout readable: less tape wear up close at the table.
    const wantAmount = this.cameraMode === 'table' || this.cameraMode === 'wheel' ? 0.55 : 1;
    this.vhs.uniforms.amount.value += (wantAmount - this.vhs.uniforms.amount.value) * Math.min(1, dt * 3);
    this.vhs.uniforms.glitch.value = Math.min(1, this.glitch);
    // Shadows follow people and chips; on weaker settings they may lag a frame or three behind.
    this.frameNo++;
    const every = this.quality === 'low' ? 3 : this.quality === 'medium' ? 2 : 1;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = this.frameNo % every === 0;
    this.composer.render(dt);
  }

  private updateFaces(): void {
    const heads = this.heads;
    heads.length = 0;
    let i = 0;
    for (const h of this.people) {
      if (!h.group.visible || i >= this.faceBuf.length) continue;
      heads.push(h.facePosition(this.faceBuf[i++]));
    }
    const faces = this.vhs.uniforms.faces.value as THREE.Vector4[];
    this.vhs.uniforms.faceCount.value = faceEllipses(this.camera, heads, faces);
  }

  private caughtT = 0;
  /** Eye height of the player in meters. */
  readonly eyeHeight = 1.64;
  private readonly tmpPos = new THREE.Vector3();
  private readonly tmpLook = new THREE.Vector3();
  private readonly tmpWorld = new THREE.Vector3();
  private readonly heads: THREE.Vector3[] = [];

  private updateCamera(dt: number): void {
    const p = this.player.group.position;
    const pos = this.tmpPos.set(0, 0, 0);
    const look = this.tmpLook.set(0, 0, 0);
    const L = this.layout.position;
    const W = this.wheel.group.position;
    let rate = 3.5;
    switch (this.cameraMode) {
      case 'menu': {
        // Slow security-camera pan from the corner.
        const a = Math.sin(this.time * 0.08) * 0.5;
        pos.set(ROOM.x1 - 0.6, 3.05, ROOM.z1 - 0.6);
        look.set(TABLE.x + Math.sin(a) * 3, 0.9, TABLE.z + Math.cos(a) * 0.5);
        rate = 1.5;
        break;
      }
      case 'room': {
        const eye = this.eyeHeight + Math.abs(Math.sin(this.stepPhase)) * 0.035 * this.bob;
        pos.set(p.x, eye, p.z);
        const cp = Math.cos(this.pitch);
        look.set(p.x - Math.sin(this.yaw) * cp, eye + Math.sin(this.pitch), p.z - Math.cos(this.yaw) * cp);
        rate = 60;
        break;
      }
      case 'table': {
        const aspect = this.camera.aspect;
        const back = aspect < 1.5 ? 1 + (1.5 - aspect) * 1.1 : 1;
        // Leave room on the right for the bet slip on wide screens.
        const slip = window.innerWidth > 1050 ? 1 : 0;
        const zoom = back * (1 + 0.36 * slip);
        const dx = 0.42 * slip;
        pos.set(L.x + dx, L.y + 1.15 * zoom, L.z + 0.74 * zoom);
        look.set(L.x + dx, L.y, L.z + 0.02 * zoom);
        rate = 5;
        break;
      }
      case 'wheel': {
        const k = this.wheel.progress * this.wheel.progress;
        pos.set(W.x + 0.15 - k * 0.1, TABLE.height + 0.9 - k * 0.38, W.z + 0.58 - k * 0.12);
        look.set(W.x, TABLE.height + 0.05, W.z + 0.04);
        rate = 3.5;
        break;
      }
      // Close-ups are still seen through your own eyes, just framed on what you use.
      case 'kasse':
        pos.set(KASSE_SPOT.x - 0.15, this.eyeHeight, KASSE_SPOT.z + 0.35);
        look.set(KASSE.x, 1.45, KASSE.z - 0.3);
        break;
      case 'vitrine':
        pos.set(VITRINE_SPOT.x + 0.25, this.eyeHeight - 0.05, VITRINE_SPOT.z + 0.15);
        look.set(VITRINE.x, 1.15, VITRINE.z);
        break;
      case 'phone':
        pos.set(PHONE_SPOT.x - 0.1, this.eyeHeight, PHONE_SPOT.z + 0.2);
        look.set(PHONE.x, PHONE.y, PHONE.z);
        break;
      case 'smokes':
        pos.set(SMOKES_SPOT.x - 0.2, this.eyeHeight, SMOKES_SPOT.z + 0.2);
        look.set(SMOKES.x, 1.2, SMOKES.z);
        break;
      case 'shark': {
        // You look up at the man in white.
        const sp = this.shark.group.position;
        pos.set(p.x, this.eyeHeight, p.z);
        look.set(sp.x, 1.55, sp.z);
        rate = 3;
        break;
      }
      case 'caught': {
        // They grab you: the view sinks and tilts while they close in.
        const a = this.thugs[0].group.position, b = this.thugs[1].group.position;
        pos.set(p.x, this.eyeHeight - 0.45 * Math.min(1, this.caughtT / 2.5), p.z);
        look.set((a.x + b.x) / 2, 1.55, (a.z + b.z) / 2);
        rate = 3;
        break;
      }
    }
    if (this.cameraMode === 'caught') this.caughtT += dt;
    else this.caughtT = 0;
    // First person: once the camera has arrived in your head, it follows the mouse exactly.
    if (this.cameraMode === 'room' && this.camPos.distanceTo(pos) < 0.12) {
      this.camPos.copy(pos);
      this.camLook.copy(look);
    } else {
      const k = 1 - Math.exp(-(this.cameraMode === 'room' ? 7 : rate) * dt);
      this.camPos.lerp(pos, k);
      this.camLook.lerp(look, k);
    }
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    // Handheld feel: the camera breathes a little; when caught, the world tips over.
    this.camera.rotation.z += Math.sin(this.time * 0.7) * 0.002 + (this.cameraMode === 'caught' ? Math.min(1, this.caughtT / 2.5) * 0.35 : 0);
    if (this.shakeAmt > 0.001) {
      const a = this.shakeAmt;
      this.camera.position.x += (Math.random() - 0.5) * a * 0.04;
      this.camera.position.y += (Math.random() - 0.5) * a * 0.04;
      this.camera.rotation.z += (Math.random() - 0.5) * a * 0.03;
      this.shakeAmt *= Math.exp(-6 * dt);
    }
    // Fade the table lamp when it hangs between the camera and the player.
    for (const o of this.casino.occluders) {
      const mat = o.material as THREE.MeshStandardMaterial;
      const wp = o.getWorldPosition(this.tmpWorld);
      const blocking = this.cameraMode === 'room' && wp.y < this.camera.position.y + 0.3 && Math.abs(wp.z - this.camera.position.z) < 3.5 && wp.distanceTo(this.camera.position) < 3.2;
      mat.transparent = true;
      mat.opacity += ((blocking ? 0.2 : 1) - mat.opacity) * Math.min(1, dt * 6);
    }
  }

  /** Pushes the TV headline. */
  setNews(headline: string): void {
    this.casino.setNews(headline);
  }

  /** Chip colour for UI swatches. */
  static chipColor(v: number): string {
    return CHIP_COLORS[v]?.face ?? '#eee';
  }
}

