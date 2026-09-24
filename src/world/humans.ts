import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const SINGLE = import.meta.env.MODE === 'single';

/**
 * Loads a glTF model. The single-file build ships models as base64 text (hosts that only serve
 * web file types and forbid fetching data: URLs), decoded here and parsed in memory.
 */
export async function loadModel(base: string, name: string): Promise<GLTF> {
  const loader = new GLTFLoader();
  if (!SINGLE) return loader.loadAsync(base + name + '.glb');
  // Decode embedded textures through <img> instead of fetch(), which strict CSPs may block.
  loader.register((parser) => {
    (parser as unknown as { textureLoader: THREE.TextureLoader }).textureLoader = new THREE.TextureLoader(parser.options.manager);
    return { name: 'img_textures' };
  });
  const res = await fetch(base + name + '.glb.txt');
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  const bin = atob((await res.text()).trim());
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return loader.parseAsync(bytes.buffer, base);
}


/** Rigged people: a man in a suit (Ready Player Me), animated with Mixamo clips retargeted offline. */
export interface HumanAssets {
  man: GLTF;
  sunglasses?: GLTF;
  /** Retargeted clips per model kind. */
  clips: Record<HumanKind, Record<string, THREE.AnimationClip>>;
}

export type HumanKind = 'man';

export type Motion = 'idle' | 'walk' | 'run';
const MOTIONS: Motion[] = ['idle', 'walk', 'run'];
const GESTURES = ['headShake', 'agree', 'sad_pose', 'sneak_pose'] as const;
export type Gesture = (typeof GESTURES)[number];

export interface HumanStyle {
  kind: HumanKind;
  /** Multiplies the clothing textures, e.g. to turn a grey suit black. */
  top?: number;
  bottom?: number;
  shoes?: number;
  skin?: number;
  hat?: boolean;
  beard?: boolean;
  sunglasses?: boolean;
  /** Body height factor, 1 ≈ 1.8 m. */
  scale?: number;
  /** Extra width for heavy-set people. */
  bulk?: number;
}

export async function loadHumanAssets(base: string): Promise<HumanAssets> {
  const load = (f: string) => loadModel(base, f);
  const clipsOf = async (kind: HumanKind) => {
    const res = await fetch(`${base}clips-${kind}.json`);
    const list = (await res.json()) as unknown[];
    return Object.fromEntries(list.map((j) => {
      const c = THREE.AnimationClip.parse(j as never);
      return [c.name, c];
    }));
  };
  // Sequential on purpose: some browsers fail to decode many embedded textures at once.
  const man = await load('man');
  const sunglasses = await load('sunglasses').catch(() => undefined);
  const manClips = await clipsOf('man');
  return { man, sunglasses, clips: { man: manClips } };
}

function tintMaterial(m: THREE.MeshStandardMaterial, color: number): THREE.MeshStandardMaterial {
  const c = m.clone();
  c.color.setHex(color);
  return c;
}

/** One animated person in the casino. */
export class Human {
  readonly group = new THREE.Group();
  readonly model: THREE.Object3D;
  private mixer: THREE.AnimationMixer;
  private actions: Record<string, THREE.AnimationAction> = {};
  private current: Motion = 'idle';
  private gesture?: THREE.AnimationAction;
  private head?: THREE.Object3D;
  private rightHand?: THREE.Object3D;
  heading = 0;

  constructor(assets: HumanAssets, style: HumanStyle) {
    const src = assets.man;
    this.model = SkeletonUtils.clone(src.scene);
    const s = style.scale ?? 1;
    this.model.scale.multiplyScalar(s);
    if (style.bulk) this.model.scale.x *= style.bulk;
    this.model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;
        const mat = mesh.material as THREE.MeshStandardMaterial;
        const n = (mat?.name ?? '') + ' ' + mesh.name;
        if (/Headwear/i.test(n) && !style.hat) mesh.visible = false;
        if (/Beard/i.test(n) && style.beard === false) mesh.visible = false;
        if (/Outfit_Top/i.test(n) && style.top !== undefined) mesh.material = tintMaterial(mat, style.top);
        if (/Outfit_Bottom/i.test(n) && style.bottom !== undefined) mesh.material = tintMaterial(mat, style.bottom);
        if (/Footwear/i.test(n) && style.shoes !== undefined) mesh.material = tintMaterial(mat, style.shoes);
        if (/Wolf3D_(Skin|Body)/i.test(n) && style.skin !== undefined) mesh.material = tintMaterial(mat, style.skin);
        if (mesh.material !== mat) (mesh.material as THREE.MeshStandardMaterial).envMapIntensity = 0.6;
      }
      if ((o as THREE.Bone).isBone && /Head$/.test(o.name) && !this.head) this.head = o;
      if ((o as THREE.Bone).isBone && /RightHand$/.test(o.name) && !this.rightHand) this.rightHand = o;
    });
    if (style.sunglasses && assets.sunglasses && this.head) {
      const g = assets.sunglasses.scene.clone(true);
      // The sample glasses are about 14 cm wide, sized for a real head.
      const box = new THREE.Box3().setFromObject(g);
      const w = box.max.x - box.min.x;
      g.scale.setScalar(0.15 / w / this.headWorldScale());
      g.position.set(0, 0.075 / this.headWorldScale(), 0.09 / this.headWorldScale());
      this.head.add(g);
    }
    this.group.add(this.model);
    this.mixer = new THREE.AnimationMixer(this.model);
    const clips = assets.clips[style.kind];
    for (const name of [...MOTIONS, ...GESTURES]) {
      const clip = clips[name];
      if (!clip) continue;
      const a = this.mixer.clipAction(clip);
      if (GESTURES.includes(name as Gesture)) {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
      }
      this.actions[name] = a;
    }
    this.actions.idle?.play();
    this.mixer.update(Math.random() * 3);
    this.mixer.addEventListener('finished', (e) => {
      if (e.action === this.gesture) {
        this.gesture.fadeOut(0.4);
        this.actions[this.current]?.reset().fadeIn(0.4).play();
        this.gesture = undefined;
      }
    });
  }

  private headWorldScale(): number {
    const v = new THREE.Vector3();
    this.head?.getWorldScale(v);
    return v.x || 1;
  }

  /** Blends idle, walk and run for the given ground speed (m/s). */
  setSpeed(speed: number): void {
    const want: Motion = speed < 0.25 ? 'idle' : speed < 3.2 ? 'walk' : 'run';
    if (want !== this.current && !this.gesture) {
      const from = this.actions[this.current];
      const to = this.actions[want];
      if (to) {
        to.reset().play();
        if (from) to.crossFadeFrom(from, 0.25, true);
      }
      this.current = want;
    }
    const a = this.actions[this.current];
    if (a && want !== 'idle') a.timeScale = want === 'walk' ? Math.max(0.6, speed / 1.5) : Math.max(0.7, speed / 4.5);
  }

  play(g: Gesture): void {
    const a = this.actions[g];
    if (!a || this.gesture) return;
    this.gesture = a;
    a.reset().fadeIn(0.3).play();
    this.actions[this.current]?.fadeOut(0.3);
  }

  update(dt: number): void {
    this.mixer.update(dt);
    this.group.rotation.y = this.heading;
  }

  /** World position of the face, for pixelating it on screen. */
  facePosition(out = new THREE.Vector3()): THREE.Vector3 {
    if (!this.head) return this.group.getWorldPosition(out).setY(1.6);
    this.head.getWorldPosition(out);
    out.y += 0.08;
    return out;
  }

  handPosition(out = new THREE.Vector3()): THREE.Vector3 {
    return (this.rightHand ?? this.group).getWorldPosition(out);
  }

  face(dx: number, dz: number, dt: number, rate = 10): void {
    const want = Math.atan2(dx, dz);
    let d = want - this.heading;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.heading += d * (1 - Math.exp(-rate * dt));
  }

  /** Walks towards a point; returns true once arrived. */
  walkTo(x: number, z: number, dt: number, speed = 1.4): boolean {
    const p = this.group.position;
    const dx = x - p.x, dz = z - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) {
      this.setSpeed(0);
      return true;
    }
    const step = Math.min(d, speed * dt);
    p.x += (dx / d) * step;
    p.z += (dz / d) * step;
    this.face(dx, dz, dt);
    this.setSpeed(speed);
    return false;
  }
}
