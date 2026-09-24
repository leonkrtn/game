import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildFigurine, buildUpgradeBox, type Figurine } from './items3d';

/** A small turntable that shows one talisman up close, for the showcase menu. */
export class ItemPreview {
  readonly canvas = document.createElement('canvas');
  private renderer?: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.01, 5);
  private holder = new THREE.Group();
  private fig?: Figurine;
  private current = '';
  private running = false;
  private t = 0;

  constructor() {
    this.canvas.width = this.canvas.height = 460;
    this.scene.background = new THREE.Color(0x020204);
    const key = new THREE.SpotLight(0xffe0b0, 5, 3, 0.45, 0.7, 1.2);
    key.position.set(0.25, 0.45, 0.35);
    const rim = new THREE.PointLight(0x6a8aff, 1.5, 2, 2);
    rim.position.set(-0.3, 0.2, -0.3);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(0.2, 48), new THREE.MeshStandardMaterial({ color: 0x08060a, roughness: 0.55, metalness: 0 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    this.scene.add(key, key.target, rim, floor, this.holder);
  }

  private ensureRenderer(): THREE.WebGLRenderer {
    if (!this.renderer) {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
      this.renderer.setPixelRatio(1);
      this.renderer.setSize(460, 460, false);
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.shadowMap.enabled = true;
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      this.scene.environmentIntensity = 0.3;
    }
    return this.renderer;
  }

  /** Shows an item (by id) or a wheel upgrade (kind 'pocket' with its colour). */
  show(def: string, upgradeColor?: string): void {
    if (def === this.current) return;
    this.current = def;
    this.t = 0;
    if (this.fig) this.holder.remove(this.fig.group);
    this.fig = upgradeColor ? buildUpgradeBox(upgradeColor) : buildFigurine(def);
    this.fig.group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
    this.holder.add(this.fig.group);
    const box = new THREE.Box3().setFromObject(this.fig.group);
    const size = box.getSize(new THREE.Vector3());
    const r = Math.max(size.x, size.y, size.z) * 0.5 + 0.005;
    const dist = r / Math.tan((this.camera.fov * Math.PI) / 360) * 1.55;
    const cy = (box.min.y + box.max.y) / 2;
    this.camera.position.set(0, cy + dist * 0.5, dist);
    this.camera.lookAt(0, cy, 0);
    if (!this.running) {
      this.running = true;
      requestAnimationFrame(() => this.loop());
    }
  }

  private loop(): void {
    if (!this.canvas.isConnected) {
      this.running = false;
      return;
    }
    this.t += 1 / 60;
    this.holder.rotation.y = 0.4 + Math.sin(this.t * 0.45) * 0.9;
    this.fig?.animate?.(this.t);
    this.ensureRenderer().render(this.scene, this.camera);
    requestAnimationFrame(() => this.loop());
  }
}
