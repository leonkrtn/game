import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { DOOR, JUKEBOX, KASSE, LOUNGE, ROOM, SMOKES, TABLE, TV, VITRINE } from './layout';
import { carpet, ceiling, damask, marble, smudges, wood, woodBump } from './materials';

/** Handles to the parts of the room that animate or that the game talks to. */
export interface Casino {
  update(dt: number, t: number): void;
  showcase: THREE.Group;
  /** Shows a headline in the late-night news on the TV. */
  setNews(headline: string): void;
  /** Where background guests stand, at the bar. */
  guestSpots: { x: number; z: number; heading: number }[];
  /** Objects that fade out when they block the view onto the player. */
  occluders: THREE.Mesh[];
  /** What the cash register's display reads (the rate that is due). */
  setRegister(amount: number): void;
}

export function textTexture(text: string, w: number, h: number, font: string, color: string, glow?: string, bg?: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  if (bg) {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
  }
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (glow) {
    g.shadowColor = glow;
    g.shadowBlur = h * 0.3;
    g.fillStyle = glow;
    g.fillText(text, w / 2, h / 2);
  }
  g.shadowBlur = 0;
  g.fillStyle = color;
  g.fillText(text, w / 2, h / 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const std = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(p);
const phys = (p: THREE.MeshPhysicalMaterialParameters) => new THREE.MeshPhysicalMaterial(p);

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, cast = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = true;
  return m;
}

/** A glowing neon word on a dark backing board. */
function neon(text: string, color: string, w: number, h: number, font: string): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: textTexture(text, 1024, Math.round((1024 * h) / w), font, '#ffffff', color), transparent: true, toneMapped: false }),
  );
  m.userData.neon = true;
  return m;
}

export function buildCasino(scene: THREE.Scene, base: string, chair?: GLTF, candle?: GLTF): Casino {
  const W = ROOM.x1 - ROOM.x0;
  const D = ROOM.z1 - ROOM.z0;
  const H = ROOM.height;
  const updates: ((dt: number, t: number) => void)[] = [];
  const occluders: THREE.Mesh[] = [];
  let newsText = 'CASINO RIEN NE VA PLUS · GEÖFFNET BIS 4 UHR';

  // ---- Materials -----------------------------------------------------------
  const carpetS = carpet([W / 1.6, D / 1.6]);
  const floorMat = std({ ...carpetS, roughness: 1, normalScale: new THREE.Vector2(0.6, 0.6) });
  const panelWood = wood(base, [2, 0.6], true);
  const panelMat = std({ ...panelWood, color: 0x6a3f28, roughness: 0.55, bumpMap: woodBump(base, [2, 0.6], true), bumpScale: 0.6 });
  const darkWood = std({ ...wood(base, [1, 1]), color: 0x3a2114, roughness: 0.45 });
  const lacquer = phys({ ...wood(base, [1, 1]), color: 0x5a2a16, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.12 });
  const wallpaper = damask([W / 1.1, 2.2 / 1.1]);
  const brass = std({ color: 0xc9a04a, metalness: 1, roughness: 0.28, roughnessMap: smudges([2, 2]) });
  const chrome = std({ color: 0xdadde2, metalness: 1, roughness: 0.12, roughnessMap: smudges([3, 3]) });
  const velvet = phys({ color: 0x4a0612, roughness: 0.85, sheen: 1, sheenColor: new THREE.Color(0xa83040), sheenRoughness: 0.4 });

  // ---- Shell -----------------------------------------------------------------
  const floor = mesh(new THREE.PlaneGeometry(W, D), floorMat, 0, 0, 0, false);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const ceil = ceiling([W / 1.2, D / 1.2]);
  const ceilingMesh = mesh(new THREE.PlaneGeometry(W, D), std({ ...ceil, roughness: 0.9 }), 0, H, 0, false);
  ceilingMesh.rotation.x = Math.PI / 2;
  scene.add(ceilingMesh);

  const wall = (len: number, x: number, z: number, rot: number) => {
    const g = new THREE.Group();
    const paper = mesh(new THREE.PlaneGeometry(len, H - 1.1), std({ ...wallpaper, roughness: 0.8 }), 0, 1.1 + (H - 1.1) / 2, 0, false);
    const panel = mesh(new THREE.BoxGeometry(len, 1.1, 0.05), panelMat, 0, 0.55, 0.025);
    const rail = mesh(new THREE.CylinderGeometry(0.02, 0.02, len, 10), brass, 0, 1.12, 0.06);
    rail.rotation.z = Math.PI / 2;
    const skirting = mesh(new THREE.BoxGeometry(len, 0.16, 0.07), darkWood, 0, 0.08, 0.035);
    const cap = mesh(new THREE.BoxGeometry(len, 0.05, 0.09), darkWood, 0, 1.08, 0.045);
    const crown = mesh(new THREE.BoxGeometry(len, 0.14, 0.12), darkWood, 0, H - 0.07, 0.06);
    const crownLip = mesh(new THREE.BoxGeometry(len, 0.03, 0.17), darkWood, 0, H - 0.155, 0.085, false);
    const pictureRail = mesh(new THREE.BoxGeometry(len, 0.035, 0.03), darkWood, 0, H - 0.42, 0.015, false);
    g.add(paper, panel, rail, skirting, cap, crown, crownLip, pictureRail);
    // Wainscot: raised, bevelled panels between stiles.
    const bay = 0.8;
    const n = Math.floor(len / bay);
    const start = -((n - 1) * bay) / 2;
    for (let i = 0; i < n; i++) {
      const k = start + i * bay;
      g.add(mesh(new RoundedBoxGeometry(bay - 0.2, 0.7, 0.03, 2, 0.012), panelMat, k, 0.6, 0.06, false));
      g.add(mesh(new THREE.BoxGeometry(bay - 0.12, 0.025, 0.02), darkWood, k, 0.975, 0.055, false));
      g.add(mesh(new THREE.BoxGeometry(bay - 0.12, 0.025, 0.02), darkWood, k, 0.225, 0.055, false));
      g.add(mesh(new THREE.BoxGeometry(0.05, 1.0, 0.07), darkWood, k + bay / 2, 0.58, 0.04));
    }
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    scene.add(g);
  };
  wall(W, 0, ROOM.z0, 0);
  wall(W, 0, ROOM.z1, Math.PI);
  wall(D, ROOM.x0, 0, Math.PI / 2);
  wall(D, ROOM.x1, 0, -Math.PI / 2);

  // Coffered ceiling: dark beams in a grid.
  for (let x = ROOM.x0 + 1.25; x < ROOM.x1 - 0.5; x += 2.5) scene.add(mesh(new THREE.BoxGeometry(0.16, 0.16, D), darkWood, x, H - 0.08, 0, false));
  for (let z = ROOM.z0 + 1.3; z < ROOM.z1 - 0.5; z += 2.6) scene.add(mesh(new THREE.BoxGeometry(W, 0.16, 0.16), darkWood, 0, H - 0.08, z, false));

  // Door with velvet curtains and an exit sign.
  const door = new THREE.Group();
  door.position.set(DOOR.x, 0, ROOM.z0 + 0.02);
  door.add(mesh(new THREE.BoxGeometry(1.4, 2.4, 0.08), darkWood, 0, 1.2, 0.02));
  door.add(mesh(new THREE.BoxGeometry(1.1, 2.2, 0.1), std({ color: 0x140a06, roughness: 0.6 }), 0, 1.1, 0.05));
  door.add(mesh(new THREE.SphereGeometry(0.035, 12, 10), brass, 0.4, 1.05, 0.12));
  const exit = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.16), new THREE.MeshBasicMaterial({ map: textTexture('AUSGANG', 256, 80, '700 52px Arial Narrow, Arial, sans-serif', '#dfffe0', undefined, '#0b5a26'), toneMapped: false }));
  exit.position.set(0, 2.62, 0.1);
  door.add(exit);
  for (const side of [-1, 1]) door.add(curtain(1.1, 2.9, velvet, side * 0.95, 0.2));
  scene.add(door);

  // Ceiling neon trim.
  const trimMat = new THREE.MeshBasicMaterial({ color: 0xff2a9a, toneMapped: false });
  for (const [x, z, len, rot] of [[0, ROOM.z0 + 0.19, W - 0.4, 0], [0, ROOM.z1 - 0.19, W - 0.4, 0], [ROOM.x0 + 0.19, 0, D - 0.4, Math.PI / 2], [ROOM.x1 - 0.19, 0, D - 0.4, Math.PI / 2]] as const) {
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, len, 8), trimMat);
    tube.rotation.z = Math.PI / 2;
    tube.rotation.y = rot;
    tube.position.set(x, H - 0.2, z);
    scene.add(tube);
  }

  // ---- Lights ------------------------------------------------------------------
  scene.add(new THREE.HemisphereLight(0x8a7a90, 0x2a1010, 0.7));

  // Billiard-style pendant: three green glass domes on a brass bar, warm bulbs inside.
  const tableLamp = new THREE.Group();
  tableLamp.position.set(TABLE.x, 2.5, TABLE.z);
  const shadeMat = phys({ color: 0x0e4a22, roughness: 0.18, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05, sheen: 0.4, sheenColor: new THREE.Color(0x3aff8a) });
  const shadeInner = new THREE.MeshBasicMaterial({ color: 0xe8c890, side: THREE.BackSide, toneMapped: false });
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xfff0d0, toneMapped: false });
  const bar = mesh(new THREE.CylinderGeometry(0.018, 0.018, 2.3, 16), brass, 0, 0.16, 0);
  bar.rotation.z = Math.PI / 2;
  tableLamp.add(bar);
  for (const x of [-1.15, 1.15]) tableLamp.add(mesh(new THREE.SphereGeometry(0.03, 16, 12), brass, x, 0.16, 0, false));
  const dome: [number, number][] = [[0.02, 0.16], [0.045, 0.155], [0.07, 0.13], [0.12, 0.085], [0.2, 0.035], [0.25, 0.008], [0.262, 0]];
  for (const x of [-0.85, 0, 0.85]) {
    const outer = mesh(new THREE.LatheGeometry(dome.map(([r, y]) => new THREE.Vector2(r, y)), 48), shadeMat, x, 0, 0);
    const inside = mesh(new THREE.LatheGeometry(dome.map(([r, y]) => new THREE.Vector2(r * 0.985, y - 0.004)), 48), shadeInner, x, 0, 0, false);
    const rim = mesh(new THREE.TorusGeometry(0.262, 0.008, 8, 48), brass, x, 0, 0, false);
    rim.rotation.x = Math.PI / 2;
    const cap = mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.05, 20), brass, x, 0.16, 0);
    const bulb = mesh(new THREE.SphereGeometry(0.045, 16, 12), bulbMat, x, 0.06, 0, false);
    tableLamp.add(outer, inside, rim, cap, bulb);
    occluders.push(outer);
  }
  for (const x of [-0.9, 0.9]) tableLamp.add(mesh(new THREE.CylinderGeometry(0.005, 0.005, H - 2.66), brass, x, 0.16 + (H - 2.66) / 2, 0, false));
  scene.add(tableLamp);
  for (const x of [-0.75, 0.75]) {
    const spot = new THREE.SpotLight(0xffd6a0, 11, 6, 0.75, 0.55, 1.6);
    spot.position.set(TABLE.x + x, 2.52, TABLE.z);
    spot.target.position.set(TABLE.x + x, 0, TABLE.z);
    spot.castShadow = true;
    spot.shadow.mapSize.set(2048, 2048);
    spot.shadow.bias = -0.00015;
    spot.shadow.normalBias = 0.02;
    spot.shadow.camera.near = 0.8;
    scene.add(spot, spot.target);
    lightCone(scene, updates, TABLE.x + x, 2.48, TABLE.z, 0.24, 0.85, 1.6, 0xffd6a0, 0.08);
  }
  dust(scene, updates, TABLE.x, TABLE.z, 2.4, 0.7, 1.1, 2.3);

  const lamp = (x: number, z: number, intensity: number, color = 0xffc890, shadow = false) => {
    const ring = mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.05, 24), brass, x, H - 0.03, z, false);
    const bulb = mesh(new THREE.CircleGeometry(0.18, 20), new THREE.MeshBasicMaterial({ color: 0xffe2b0, toneMapped: false }), x, H - 0.06, z, false);
    bulb.rotation.x = Math.PI / 2;
    const spot = new THREE.SpotLight(color, intensity, 9, 0.9, 0.7, 1.7);
    spot.position.set(x, H - 0.1, z);
    spot.target.position.set(x, 0, z);
    if (shadow) {
      spot.castShadow = true;
      spot.shadow.mapSize.set(1024, 1024);
      spot.shadow.bias = -0.0003;
    }
    scene.add(ring, bulb, spot, spot.target);
    // No visible light shaft: near walls and furniture it showed hard, wrong edges.
    return spot;
  };
  lamp(KASSE.x, KASSE.z + 0.8, 15);
  lamp(LOUNGE.x + 0.4, LOUNGE.z + 0.2, 11);
  lamp(ROOM.x1 - 1.4, 1.4, 10);
  lamp(VITRINE.x, VITRINE.z - 1.0, 13, 0xffd0a0);
  lamp(DOOR.x + 0.6, ROOM.z0 + 1.6, 10, 0xffb070);

  // Wall sconces: fabric shades on brass arms, each washing the wallpaper with warm light up and down.
  const washMat = new THREE.MeshBasicMaterial({ map: washTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, color: 0x9a6038 });
  const shadeFabric = phys({ color: 0xf0d8a8, roughness: 0.9, emissive: 0xffb060, emissiveIntensity: 0.9, side: THREE.DoubleSide, sheen: 0.5, sheenColor: new THREE.Color(0xffe0b0) });
  const sconce = (x: number, z: number, rot: number) => {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    const plate = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.015, 24), brass, 0, 1.85, 0.008, false);
    plate.rotation.x = Math.PI / 2;
    const arm = mesh(new THREE.TorusGeometry(0.09, 0.008, 8, 20, Math.PI / 2), brass, 0, 1.94, 0.01, false);
    arm.rotation.y = -Math.PI / 2;
    const cup = mesh(new THREE.CylinderGeometry(0.025, 0.018, 0.04, 16), brass, 0, 2.02, 0.1, false);
    const shade = mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.13, 24, 1, true), shadeFabric, 0, 2.1, 0.1, false);
    const bulb = mesh(new THREE.SphereGeometry(0.022, 12, 10), new THREE.MeshBasicMaterial({ color: 0xfff0d0, toneMapped: false }), 0, 2.07, 0.1, false);
    const wash = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.1), washMat);
    wash.position.set(0, 2.0, 0.012);
    wash.renderOrder = 3;
    g.add(plate, arm, cup, shade, bulb, wash);
    scene.add(g);
  };
  sconce(ROOM.x0 + 0.6 + 0.35, ROOM.z0, 0);
  for (const z of [-2.0, -0.05, 1.85]) sconce(ROOM.x0, z, Math.PI / 2);
  sconce(ROOM.x1, 0.75, -Math.PI / 2);
  // Above the TV corner, which was nearly black.
  sconce(ROOM.x1, -1.4, -Math.PI / 2);
  sconce(SMOKES.x + 0.9, ROOM.z0, 0);
  for (const x of [VITRINE.x - 1.2, VITRINE.x + 1.2, ROOM.x0 + 1.0, ROOM.x1 - 1.2]) sconce(x, ROOM.z1, Math.PI);

  // Potted palms in two corners.
  const palm = (x: number, z: number, seed: number) => {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.add(mesh(new THREE.LatheGeometry([[0, 0], [0.16, 0], [0.2, 0.34], [0.23, 0.36], [0.23, 0.42], [0.21, 0.42], [0, 0.4]].map(([r, y]) => new THREE.Vector2(r, y)), 32), brass, 0, 0, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 24), std({ color: 0x1a0e06, roughness: 1 }), 0, 0.41, 0, false));
    const trunkPts = [[0, 0.4, 0], [0.02, 0.8, 0.01], [-0.01, 1.2, 0.02], [0.03, 1.55, 0]].map(([a, b, c]) => new THREE.Vector3(a, b, c));
    g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(trunkPts), 20, 0.045, 10), std({ color: 0x4a3420, roughness: 0.95 }), 0, 0, 0));
    const leafMat = phys({ map: frondTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.55, sheen: 0.4, sheenColor: new THREE.Color(0x8aff8a) });
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + seed;
      const len = 0.75 + ((i * 37) % 10) * 0.03;
      const geo = new THREE.PlaneGeometry(0.34, len, 1, 8);
      geo.translate(0, len / 2, 0);
      const pos = geo.attributes.position as THREE.BufferAttribute;
      for (let k = 0; k < pos.count; k++) {
        const t = pos.getY(k) / len;
        pos.setZ(k, -t * t * 0.45);
        pos.setX(k, pos.getX(k) * (1 - t * 0.6));
      }
      geo.computeVertexNormals();
      const frond = mesh(geo, leafMat, 0.03, 1.55, 0);
      frond.rotation.set(-1.0 + ((i * 13) % 5) * 0.12, a, 0, 'YXZ');
      g.add(frond);
    }
    scene.add(g);
  };
  palm(ROOM.x0 + 0.42, ROOM.z0 + 0.42, 0.3);
  palm(ROOM.x1 - 0.42, ROOM.z0 + 0.42, 1.2);


  // Neon signs with coloured bounce light.
  const sign = neon('Rien ne va plus', '#ff2fa8', 3.4, 0.8, 'italic 700 150px Georgia, serif');
  sign.position.set(TABLE.x - 0.5, 2.5, ROOM.z0 + 0.05);
  const signLight = new THREE.PointLight(0xff3fb0, 5, 5, 1.8);
  signLight.position.set(TABLE.x - 0.5, 2.3, ROOM.z0 + 0.5);
  scene.add(sign, signLight);
  const kasseSign = neon('KASSE', '#ffb000', 1.3, 0.36, '700 220px Georgia, serif');
  kasseSign.position.set(KASSE.x, 2.5, KASSE.z + KASSE.halfD - 0.02);
  scene.add(kasseSign);
  let flickerT = 0;
  updates.push((dt, t) => {
    // The big sign buzzes and sometimes drops out for a moment.
    flickerT -= dt;
    if (flickerT < -0.12) flickerT = 2 + Math.random() * 6;
    const on = flickerT > 0 || Math.sin(t * 90) > 0.3;
    (sign.material as THREE.MeshBasicMaterial).opacity = on ? 1 : 0.25;
    signLight.intensity = on ? 5 + Math.sin(t * 50) * 0.3 : 1;
  });

  // ---- Cashier ------------------------------------------------------------------
  let setRegister: (amount: number) => void = () => undefined;
  {
    const K = KASSE;
    const g = new THREE.Group();
    g.position.set(K.x, 0, K.z);
    const counter = mesh(new RoundedBoxGeometry(K.halfW * 2, 1.1, K.halfD * 2, 3, 0.03), panelMat, 0, 0.55, 0);
    const slab = mesh(new RoundedBoxGeometry(K.halfW * 2 + 0.1, 0.05, K.halfD * 2 + 0.12, 2, 0.015), phys({ ...marble(), roughness: 0.25, clearcoat: 0.6 }), 0, 1.13, 0);
    g.add(counter, slab);
    for (let i = -5; i <= 5; i++) {
      if (Math.abs(i) <= 1) continue;
      g.add(mesh(new THREE.CylinderGeometry(0.01, 0.01, 1.0, 10), brass, i * 0.11, 1.65, K.halfD - 0.05));
    }
    g.add(mesh(new THREE.BoxGeometry(K.halfW * 2, 0.08, 0.08), brass, 0, 2.17, K.halfD - 0.05));
    const register = mesh(new RoundedBoxGeometry(0.42, 0.26, 0.34, 2, 0.02), std({ color: 0x3a3a3e, metalness: 0.6, roughness: 0.35 }), 0.7, 1.28, 0);
    register.rotation.y = -0.3;
    const lcd = mesh(new THREE.PlaneGeometry(0.2, 0.05), new THREE.MeshBasicMaterial({ map: textTexture('0000.00', 256, 64, '700 50px monospace', '#6aff7a', '#1a8a2a', '#021004'), toneMapped: false }), 0.66, 1.43, 0.12, false);
    lcd.rotation.y = -0.3;
    let shown = -1;
    setRegister = (amount: number) => {
      if (amount === shown) return;
      shown = amount;
      const mat = lcd.material as THREE.MeshBasicMaterial;
      mat.map?.dispose();
      mat.map = textTexture(`${String(Math.min(99999, Math.round(amount))).padStart(4, '0')}.00`, 256, 64, '700 50px monospace', '#6aff7a', '#1a8a2a', '#021004');
      mat.needsUpdate = true;
    };
    g.add(register, lcd);
    for (let i = 0; i < 4; i++) {
      const bills = mesh(new THREE.BoxGeometry(0.16, 0.012, 0.075), std({ color: 0x7c9a6a, roughness: 0.9 }), -0.5 + i * 0.012, 1.162 + i * 0.012, 0.12 - i * 0.01);
      bills.rotation.y = i * 0.2;
      g.add(bills);
    }
    scene.add(g);
  }

  // ---- Showcase ------------------------------------------------------------------
  const showcase = new THREE.Group();
  {
    const V = VITRINE;
    const glass = phys({ color: 0xdfeaff, transparent: true, opacity: 0.12, roughness: 0.03, metalness: 0, depthWrite: false });
    const g = new THREE.Group();
    g.position.set(V.x, 0, V.z);
    // Built with its glass towards +x, turned so it faces the table.
    g.rotation.y = Math.PI / 2;
    g.add(mesh(new RoundedBoxGeometry(V.halfW * 2, 0.7, V.halfD * 2, 3, 0.02), lacquer, 0, 0.35, 0));
    g.add(mesh(new THREE.BoxGeometry(0.02, V.height - 0.7, V.halfD * 2), lacquer, -V.halfW + 0.005, 0.7 + (V.height - 0.7) / 2, 0));
    // Lit from inside: a warm strip under the lid and a soft light over the shelves.
    const strip = mesh(new THREE.BoxGeometry(0.03, 0.012, V.halfD * 2 - 0.1), new THREE.MeshBasicMaterial({ color: 0xffe6b8, toneMapped: false }), V.halfW - 0.08, V.height - 0.05, 0, false);
    const caseLight = new THREE.PointLight(0xffd9a0, 5, 2.2, 1.6);
    caseLight.position.set(0.05, V.height - 0.2, 0);
    g.add(strip, caseLight);
    g.add(mesh(new RoundedBoxGeometry(V.halfW * 2 + 0.05, 0.08, V.halfD * 2 + 0.05, 2, 0.02), lacquer, 0, V.height, 0));
    g.add(mesh(new THREE.BoxGeometry(0.03, V.height - 0.7, V.halfD * 2), velvet, -V.halfW + 0.02, 0.7 + (V.height - 0.7) / 2, 0));
    const front = mesh(new THREE.PlaneGeometry(V.halfD * 2, V.height - 0.7), glass, V.halfW, 0.7 + (V.height - 0.7) / 2, 0, false);
    front.rotation.y = Math.PI / 2;
    g.add(front);
    for (const z of [-V.halfD, V.halfD]) g.add(mesh(new THREE.BoxGeometry(V.halfW * 2, V.height - 0.7, 0.03), brass, 0, 0.7 + (V.height - 0.7) / 2, z));
    for (const y of [0.72, 1.3]) g.add(mesh(new THREE.BoxGeometry(V.halfW * 2 - 0.06, 0.015, V.halfD * 2 - 0.06), phys({ color: 0xffffff, transparent: true, opacity: 0.25, roughness: 0.02 }), 0, y, 0, false));

    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.3), new THREE.MeshBasicMaterial({ map: textTexture('Kuriositäten', 512, 120, 'italic 700 78px Georgia, serif', '#ffffff', '#ff9a2a'), transparent: true, toneMapped: false }));
    sign.rotation.y = Math.PI / 2;
    sign.position.set(V.halfW + 0.02, V.height + 0.28, 0);
    g.add(sign, showcase);
    scene.add(g);
  }

  // Guests would stand at the bar; the bar is gone, so the room stays quiet.
  const guestSpots: Casino['guestSpots'] = [];

  // ---- Lounge: velvet chairs, jukebox and a CRT on a trolley ----------------------------
  if (chair) {
    const spots: [number, number, number][] = [[LOUNGE.x - 0.5, LOUNGE.z + 0.3, 0.9], [LOUNGE.x + 0.55, LOUNGE.z + 0.75, -0.4], [TABLE.x + TABLE.halfW + 0.55, TABLE.z + 0.1, -Math.PI / 2]];
    for (const [x, z, rot] of spots) {
      const c = chair.scene.clone(true);
      c.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
      c.position.set(x, 0, z);
      c.rotation.y = rot;
      scene.add(c);
    }
  }
  {
    const side = new THREE.Group();
    side.position.set(LOUNGE.x + 0.05, 0, LOUNGE.z + 0.85);
    side.add(mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.03, 24), lacquer, 0, 0.58, 0));
    side.add(mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.56, 10), brass, 0, 0.28, 0));
    // Smoked-glass ashtray with a rim and a hollow, not a flat white disc.
    const glass = phys({ color: 0x3a4a50, transparent: true, opacity: 0.85, roughness: 0.08, clearcoat: 1 });
    side.add(mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.018, 24), glass, 0.08, 0.604, 0));
    const lip = mesh(new THREE.TorusGeometry(0.062, 0.008, 8, 24), glass, 0.08, 0.613, 0);
    lip.rotation.x = Math.PI / 2;
    side.add(lip);
    side.add(mesh(new THREE.CircleGeometry(0.052, 20), std({ color: 0x151412, roughness: 0.9 }), 0.08, 0.614, 0));
    (side.children[side.children.length - 1] as THREE.Mesh).rotation.x = -Math.PI / 2;
    if (candle) {
      const c = candle.scene.clone(true);
      c.scale.setScalar(0.8);
      c.position.set(-0.1, 0.6, 0.05);
      side.add(c);
    }
    scene.add(side);
  }
  {
    // Jukebox.
    const g = new THREE.Group();
    g.position.set(JUKEBOX.x, 0, JUKEBOX.z);
    g.rotation.y = Math.PI / 2;
    g.add(mesh(new RoundedBoxGeometry(0.9, 1.2, 0.6, 4, 0.08), lacquer, 0, 0.6, 0));
    const arch = mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.6, 32, 1, false, 0, Math.PI), lacquer, 0, 1.2, 0);
    arch.rotation.z = Math.PI / 2;
    arch.rotation.y = Math.PI / 2;
    g.add(arch);
    const colors = [0xff3a3a, 0xffb000, 0x3aff8a, 0x27e3ff];
    colors.forEach((c, i) => {
      const tube = mesh(new THREE.TorusGeometry(0.36 - i * 0.05, 0.018, 8, 40, Math.PI), new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 2 }), 0, 1.2, 0.31, false);
      g.add(tube);
    });
    g.add(mesh(new THREE.PlaneGeometry(0.6, 0.35), new THREE.MeshBasicMaterial({ map: textTexture('♪  A1  B4  C7  ♪', 512, 256, '700 60px monospace', '#fff3c0', '#ff9a2a', '#1a0a04'), toneMapped: false }), 0, 0.85, 0.305, false));
    scene.add(g);
  }
  {
    // CRT television with a horse race and static.
    const g = new THREE.Group();
    g.position.set(TV.x, 0, TV.z);
    g.rotation.y = -Math.PI / 2 + 0.3;
    g.add(mesh(new THREE.BoxGeometry(0.6, 0.6, 0.45), darkWood, 0, 0.3, 0));
    // Cabinet in wood veneer, a dark plastic front with the tube on the left and the controls on the right.
    const FW = 0.62, FH = 0.5, FZ = 0.245;
    g.add(mesh(new RoundedBoxGeometry(FW, FH, 0.48, 3, 0.04), std({ color: 0x3a2414, roughness: 0.55 }), 0, 0.86, 0));
    const plastic = std({ color: 0x1c1b1e, roughness: 0.45, metalness: 0.1 });
    g.add(mesh(new RoundedBoxGeometry(FW - 0.03, FH - 0.03, 0.02, 2, 0.008), plastic, 0, 0.86, FZ));
    const SW = 0.46, SH = 0.345, SX = -0.055, SY = 0.865;
    // Chrome trim around the tube.
    const chrome = std({ color: 0xb8b8c0, metalness: 1, roughness: 0.25 });
    for (const [w, h, x, y] of [[SW + 0.02, 0.01, SX, SY + SH / 2 + 0.005], [SW + 0.02, 0.01, SX, SY - SH / 2 - 0.005], [0.01, SH, SX - SW / 2 - 0.005, SY], [0.01, SH, SX + SW / 2 + 0.005, SY]] as const) {
      g.add(mesh(new THREE.BoxGeometry(w, h, 0.012), chrome, x, y, FZ + 0.012, false));
    }
    // Control strip: two knobs, buttons and a speaker grille.
    const knobMat = std({ color: 0x2a2a2e, roughness: 0.35, metalness: 0.3 });
    for (const y of [0.99, 0.91]) {
      const k = mesh(new THREE.CylinderGeometry(0.022, 0.024, 0.025, 20), knobMat, 0.245, y, FZ + 0.02, false);
      k.rotation.x = Math.PI / 2;
      g.add(k);
    }
    for (let i = 0; i < 3; i++) g.add(mesh(new THREE.BoxGeometry(0.03, 0.012, 0.012), chrome, 0.245, 0.84 - i * 0.02, FZ + 0.014, false));
    for (let i = 0; i < 6; i++) g.add(mesh(new THREE.BoxGeometry(0.07, 0.004, 0.004), std({ color: 0x0a0a0c, roughness: 0.9 }), 0.245, 0.77 - i * 0.012, FZ + 0.012, false));
    g.add(mesh(new THREE.CircleGeometry(0.005, 10), new THREE.MeshBasicMaterial({ color: 0xff2020, toneMapped: false }), 0.225, 0.715, FZ + 0.013, false));
    const cv = document.createElement('canvas');
    cv.width = 160;
    cv.height = 120;
    const cg = cv.getContext('2d')!;
    const tvTex = new THREE.CanvasTexture(cv);
    tvTex.colorSpace = THREE.SRGBColorSpace;
    // The tube fills the whole opening, slightly bulged like real glass.
    const tubeGeo = new THREE.PlaneGeometry(SW, SH, 16, 12);
    const pos = tubeGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const u = pos.getX(i) / (SW / 2), v = pos.getY(i) / (SH / 2);
      pos.setZ(i, (1 - Math.min(1, (u * u + v * v) / 2)) * 0.018);
    }
    tubeGeo.computeVertexNormals();
    const screen = mesh(tubeGeo, new THREE.MeshBasicMaterial({ map: tvTex, toneMapped: false }), SX, SY, FZ + 0.006, false);
    g.add(screen);
    // A faint reflection on the glass.
    const glare = document.createElement('canvas');
    glare.width = glare.height = 64;
    const gg = glare.getContext('2d')!;
    const gr = gg.createLinearGradient(0, 0, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,0.09)');
    gr.addColorStop(0.45, 'rgba(255,255,255,0.01)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    gg.fillStyle = gr;
    gg.fillRect(0, 0, 64, 64);
    g.add(mesh(tubeGeo, new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(glare), transparent: true, depthWrite: false, toneMapped: false }), SX, SY, FZ + 0.009, false));
    /** Rounded tube corners, a dark edge and scanlines over every frame. */
    const tube = () => {
      cg.fillStyle = 'rgba(0,0,0,0.12)';
      for (let y = 0; y < 120; y += 2) cg.fillRect(0, y, 160, 1);
      const vg = cg.createRadialGradient(80, 60, 55, 80, 60, 105);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,0.35)');
      cg.fillStyle = vg;
      cg.fillRect(0, 0, 160, 120);
      cg.fillStyle = '#050505';
      cg.beginPath();
      cg.rect(0, 0, 160, 120);
      cg.roundRect(0, 0, 160, 120, 7);
      cg.fill('evenodd');
    };
    const tvLight = new THREE.PointLight(0x6a8aff, 1.2, 3.2, 2);
    // In front of the set, so it lights the room rather than its own plastic front.
    tvLight.position.set(0, 0.95, 1.1);
    g.add(tvLight);
    let tv = 0;
    let frame = 0;
    let scroll = 0;
    updates.push((dt) => {
      tv -= dt;
      scroll += dt * 34;
      if (tv > 0) return;
      tv = 1 / 12;
      frame++;
      // Late-night news: a studio shot with a ticker, and a burst of static between items.
      const staticNow = frame % 150 > 142;
      if (staticNow) {
        const img = cg.createImageData(160, 120);
        for (let i = 0; i < img.data.length; i += 4) {
          const n = Math.random() * 255;
          img.data[i] = img.data[i + 1] = img.data[i + 2] = n;
          img.data[i + 3] = 255;
        }
        cg.putImageData(img, 0, 0);
      } else {
        const grad = cg.createLinearGradient(0, 0, 0, 120);
        grad.addColorStop(0, '#0c2a6a');
        grad.addColorStop(1, '#040c24');
        cg.fillStyle = grad;
        cg.fillRect(0, 0, 160, 120);
        // Map of the world behind the anchor, as a grid of dots.
        cg.fillStyle = 'rgba(120,170,255,0.25)';
        for (let y = 14; y < 70; y += 5) for (let x = 70; x < 156; x += 5) if (Math.sin(x * 0.21 + y * 0.13) + Math.cos(y * 0.3) > 0.4) cg.fillRect(x, y, 2, 2);
        // The anchor: shoulders and a head (the tape blurs the face anyway).
        cg.fillStyle = '#1a1a22';
        cg.beginPath();
        cg.ellipse(46, 96, 30, 26, 0, Math.PI, 0);
        cg.fill();
        cg.fillStyle = '#c89a7a';
        cg.beginPath();
        cg.ellipse(46, 56 + Math.sin(frame * 0.4) * 0.6, 11, 14, 0, 0, Math.PI * 2);
        cg.fill();
        for (let by = 50; by < 64; by += 4) for (let bx = 36; bx < 58; bx += 4) {
          cg.fillStyle = `hsl(20,35%,${45 + Math.random() * 20}%)`;
          cg.fillRect(bx, by, 4, 4);
        }
        cg.fillStyle = '#e8e0d0';
        cg.fillRect(40, 72, 12, 16);
        cg.fillStyle = '#8a0a18';
        cg.fillRect(44, 72, 4, 14);
        // Logo and ticker.
        cg.fillStyle = '#ffcf3a';
        cg.fillRect(4, 4, 58, 11);
        cg.fillStyle = '#0a0a14';
        cg.font = '700 9px monospace';
        cg.fillText('NACHT-JOURNAL', 6, 12);
        cg.fillStyle = '#c8102c';
        cg.fillRect(0, 100, 160, 20);
        cg.fillStyle = '#ffffff';
        cg.font = '700 13px monospace';
        const text = `+++ ${newsText} +++ ${newsText} `;
        const w = cg.measureText(text).width / 2;
        cg.fillText(text, 160 - (scroll % (w + 160)), 115);
      }
      tube();
      tvTex.needsUpdate = true;
      tvLight.intensity = staticNow ? 1.6 : 1.1;
    });
    scene.add(g);
  }

  // ---- Cigarette machine ----------------------------------------------------------------
  {
    const S = SMOKES;
    const g = new THREE.Group();
    g.position.set(S.x, 0, S.z);
    const body = phys({ color: 0x7a0a10, roughness: 0.35, metalness: 0.4, clearcoat: 0.8, clearcoatRoughness: 0.25 });
    g.add(mesh(new RoundedBoxGeometry(S.halfD * 2, 1.82, S.halfW * 2 + 0.1, 3, 0.03), body, 0, 0.91, 0));
    // Glass front with rows of cigarette packs.
    const packColors = ['#f4f0e8', '#c8102c', '#1a3a8a', '#e8c040', '#2a6a3a', '#101014', '#d8d0c0', '#8a1a4a'];
    const packs = document.createElement('canvas');
    packs.width = 256;
    packs.height = 320;
    const pg = packs.getContext('2d')!;
    pg.fillStyle = '#1a1210';
    pg.fillRect(0, 0, 256, 320);
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 6; col++) {
        const x = 8 + col * 41, y = 10 + row * 78;
        const c = packColors[(row * 3 + col * 5) % packColors.length];
        pg.fillStyle = c;
        pg.fillRect(x, y, 34, 52);
        pg.fillStyle = c === '#101014' ? '#c9a04a' : c === '#f4f0e8' || c === '#d8d0c0' ? '#c8102c' : '#f4f0e8';
        pg.fillRect(x, y + 14, 34, 8);
        pg.beginPath();
        pg.arc(x + 17, y + 36, 7, 0, Math.PI * 2);
        pg.fill();
        pg.fillStyle = '#c9a04a';
        pg.font = '700 13px monospace';
        pg.fillText(`${3 + ((row + col) % 3)},-`, x + 3, y + 70);
      }
    }
    const packTex = new THREE.CanvasTexture(packs);
    packTex.colorSpace = THREE.SRGBColorSpace;
    const front = mesh(new THREE.PlaneGeometry(0.62, 0.78), new THREE.MeshStandardMaterial({ map: packTex, emissive: 0xffffff, emissiveMap: packTex, emissiveIntensity: 0.28, roughness: 0.6 }), 0, 1.25, S.halfW + 0.051, false);
    const glassPane = mesh(new THREE.PlaneGeometry(0.64, 0.8), phys({ color: 0xffffff, transparent: true, opacity: 0.12, roughness: 0.02 }), 0, 1.25, S.halfW + 0.065, false);
    g.add(front, glassPane);
    // Pull knobs under the packs.
    for (let i = 0; i < 6; i++) {
      const knob = mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.05, 12), chrome, -0.26 + i * 0.104, 0.78, S.halfW + 0.075);
      knob.rotation.x = Math.PI / 2;
      g.add(knob);
      g.add(mesh(new THREE.BoxGeometry(0.07, 0.025, 0.005), std({ color: 0xf0e8d0, roughness: 0.5 }), -0.26 + i * 0.104, 0.83, S.halfW + 0.052, false));
    }
    g.add(mesh(new THREE.BoxGeometry(0.5, 0.12, 0.06), chrome, 0, 0.42, S.halfW + 0.06));
    g.add(mesh(new THREE.BoxGeometry(0.06, 0.1, 0.02), std({ color: 0x111111, roughness: 0.4 }), 0.22, 0.62, S.halfW + 0.058));
    const sign = mesh(new THREE.PlaneGeometry(0.66, 0.16), new THREE.MeshBasicMaterial({ map: textTexture('ZIGARETTEN', 512, 128, '700 80px Arial Narrow, Arial, sans-serif', '#fff4d8', '#ff5a2a', '#5a0608'), toneMapped: false }), 0, 1.72, S.halfW + 0.052, false);
    g.add(sign);
    let hum = 0;
    updates.push((dt) => {
      hum -= dt;
      if (hum < -0.15) hum = 3 + Math.random() * 7;
      const on = hum > 0 || Math.random() > 0.5;
      (front.material as THREE.MeshStandardMaterial).emissiveIntensity = on ? 0.28 : 0.08;
    });
    scene.add(g);
  }

  // Posters.
  const poster = (x: number, z: number, rot: number, title: string, sub: string, hue: number) => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 360;
    const g = c.getContext('2d')!;
    const grad = g.createLinearGradient(0, 0, 0, 360);
    grad.addColorStop(0, `hsl(${hue},70%,18%)`);
    grad.addColorStop(1, `hsl(${hue + 40},80%,6%)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 360);
    g.strokeStyle = `hsl(${hue},90%,60%)`;
    g.lineWidth = 3;
    for (let i = 0; i < 9; i++) {
      g.beginPath();
      g.moveTo(0, 230 + i * 12);
      g.lineTo(256, 180 + i * 18);
      g.stroke();
    }
    g.fillStyle = '#f4e6c8';
    g.font = 'italic 700 42px Georgia, serif';
    g.textAlign = 'center';
    g.fillText(title, 128, 110);
    g.font = '700 18px Arial Narrow, Arial, sans-serif';
    g.fillText(sub, 128, 150);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    const grp = new THREE.Group();
    grp.add(mesh(new THREE.BoxGeometry(0.74, 1.02, 0.03), brass, 0, 0, 0, false));
    grp.add(mesh(new THREE.PlaneGeometry(0.68, 0.96), std({ map: t, roughness: 0.3 }), 0, 0, 0.017, false));
    grp.position.set(x, 1.85, z);
    grp.rotation.y = rot;
    scene.add(grp);
  };
  poster(ROOM.x0 + 0.03, -1.0, Math.PI / 2, 'Big Band', 'JEDEN FREITAG · 22 UHR', 330);
  poster(ROOM.x0 + 0.03, 0.9, Math.PI / 2, 'Jackpot', 'AB 1.000.000 LIRE', 200);
  poster(ROOM.x1 - 0.03, -1.0, -Math.PI / 2, 'Casino', 'SEIT 1961', 20);
  poster(ROOM.x1 - 0.03, 2.2, -Math.PI / 2, 'Tanzabend', 'SAMSTAGS AB 21 UHR', 300);
  poster(VITRINE.x - 2.2, ROOM.z1 - 0.03, Math.PI, 'Monte Carlo', 'GRAND PRIX 1987', 45);
  poster(VITRINE.x + 2.2, ROOM.z1 - 0.03, Math.PI, 'Roulette', 'FAITES VOS JEUX', 280);

  // Haze near the ceiling.
  haze(scene, updates);

  return {
    update: (dt, t) => updates.forEach((u) => u(dt, t)),
    setNews: (headline) => {
      newsText = headline;
    },
    showcase,
    guestSpots,
    occluders,
    setRegister: (amount) => setRegister(amount),
  };
}

/** A heavy curtain: a plane rippled into folds. */
function curtain(w: number, h: number, mat: THREE.Material, x: number, z: number): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(w, h, 48, 12);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i);
    const py = pos.getY(i);
    const gather = 1 - (py + h / 2) / h;
    pos.setZ(i, Math.sin(px * 22) * 0.05 * (0.6 + gather) + Math.sin(px * 7) * 0.02);
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, h / 2, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function smokeTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

let smokeTex: THREE.CanvasTexture | undefined;

/** One puff or haze patch: a soft round billboard. */
interface Puff {
  pos: THREE.Vector3;
  scale: number;
  alpha: number;
  color: THREE.Color;
}

/**
 * All smoke and haze in a scene, drawn as one instanced mesh of camera-facing quads: the same look
 * as individual sprites, but one draw call and no objects created per puff.
 */
class SmokeLayer {
  readonly puffs: Puff[] = [];
  private mesh: THREE.Mesh;
  private geo: THREE.InstancedBufferGeometry;
  private cap = 0;
  private lastFrame = -1;

  constructor(scene: THREE.Scene) {
    smokeTex ??= smokeTexture();
    this.geo = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    this.geo.index = quad.index;
    this.geo.setAttribute('position', quad.getAttribute('position'));
    this.geo.setAttribute('uv', quad.getAttribute('uv'));
    this.grow(128);
    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: null } }]),
      vertexShader: /* glsl */ `
        attribute vec3 iPos;
        attribute float iScale;
        attribute float iAlpha;
        attribute vec3 iColor;
        varying vec2 vUv;
        varying float vAlpha;
        varying vec3 vColor;
        #include <fog_pars_vertex>
        void main() {
          vUv = uv;
          vAlpha = iAlpha;
          vColor = iColor;
          vec4 mvPosition = modelViewMatrix * vec4(iPos, 1.0);
          mvPosition.xy += position.xy * iScale;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D map;
        varying vec2 vUv;
        varying float vAlpha;
        varying vec3 vColor;
        #include <fog_pars_fragment>
        void main() {
          vec4 t = texture2D(map, vUv);
          gl_FragColor = vec4(vColor * t.rgb, t.a * vAlpha);
          #include <fog_fragment>
        }
      `,
      transparent: true,
      depthWrite: false,
      fog: true,
    });
    mat.uniforms.map.value = smokeTex;
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    // Upload the puffs right before drawing, once per frame.
    this.mesh.onBeforeRender = (renderer) => {
      const f = renderer.info.render.frame;
      if (f === this.lastFrame) return;
      this.lastFrame = f;
      this.upload();
    };
    scene.add(this.mesh);
  }

  private grow(n: number): void {
    this.cap = n;
    this.geo.setAttribute('iPos', new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('iScale', new THREE.InstancedBufferAttribute(new Float32Array(n), 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('iAlpha', new THREE.InstancedBufferAttribute(new Float32Array(n), 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('iColor', new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
  }

  private upload(): void {
    const n = this.puffs.length;
    if (n > this.cap) this.grow(Math.max(n, this.cap * 2));
    const pos = this.geo.getAttribute('iPos') as THREE.InstancedBufferAttribute;
    const sc = this.geo.getAttribute('iScale') as THREE.InstancedBufferAttribute;
    const al = this.geo.getAttribute('iAlpha') as THREE.InstancedBufferAttribute;
    const co = this.geo.getAttribute('iColor') as THREE.InstancedBufferAttribute;
    for (let i = 0; i < n; i++) {
      const p = this.puffs[i];
      pos.setXYZ(i, p.pos.x, p.pos.y, p.pos.z);
      sc.setX(i, p.scale);
      al.setX(i, p.alpha);
      co.setXYZ(i, p.color.r, p.color.g, p.color.b);
    }
    for (const a of [pos, sc, al, co]) a.needsUpdate = true;
    this.geo.instanceCount = n;
  }
}

const layers = new WeakMap<THREE.Scene, SmokeLayer>();
const layerOf = (scene: THREE.Scene) => {
  let l = layers.get(scene);
  if (!l) layers.set(scene, (l = new SmokeLayer(scene)));
  return l;
};

/** Cigarette smoke curling up from a point. */
export function smoke(scene: THREE.Scene, updates: ((dt: number, t: number) => void)[], at: THREE.Vector3, rate = 3): void {
  const layer = layerOf(scene);
  const color = new THREE.Color(0xb8b0a8);
  const puffs: { p: Puff; life: number; vx: number }[] = [];
  let acc = 0;
  updates.push((dt, t) => {
    acc += dt * rate;
    while (acc > 1) {
      acc--;
      const p: Puff = { pos: at.clone(), scale: 0.03, alpha: 0, color };
      layer.puffs.push(p);
      puffs.push({ p, life: 0, vx: (Math.random() - 0.5) * 0.05 });
    }
    for (let i = puffs.length - 1; i >= 0; i--) {
      const q = puffs[i];
      q.life += dt;
      const k = q.life / 5;
      q.p.pos.y += dt * 0.12;
      q.p.pos.x += dt * (q.vx + Math.sin(t * 1.3 + q.life * 2) * 0.03);
      q.p.scale = 0.03 + k * 0.5;
      q.p.alpha = Math.sin(Math.min(1, k) * Math.PI) * 0.22;
      if (k >= 1) {
        layer.puffs.splice(layer.puffs.indexOf(q.p), 1);
        puffs.splice(i, 1);
      }
    }
  });
}

/** A thin layer of smoke hanging under the ceiling. */
function haze(scene: THREE.Scene, updates: ((dt: number, t: number) => void)[]): void {
  const layer = layerOf(scene);
  const color = new THREE.Color(0x8a7a70);
  const patches: { p: Puff; base: THREE.Vector3 }[] = [];
  for (let i = 0; i < 26; i++) {
    const base = new THREE.Vector3(ROOM.x0 + Math.random() * (ROOM.x1 - ROOM.x0), 2.3 + Math.random() * 0.9, ROOM.z0 + Math.random() * (ROOM.z1 - ROOM.z0));
    const p: Puff = { pos: base.clone(), scale: 2.5 + Math.random() * 2.5, alpha: 0.06, color };
    layer.puffs.push(p);
    patches.push({ p, base });
  }
  updates.push((_dt, t) => {
    patches.forEach(({ p, base }, i) => {
      p.pos.x = base.x + Math.sin(t * 0.05 + i) * 0.6;
      p.pos.z = base.z + Math.cos(t * 0.04 + i * 1.7) * 0.4;
    });
  });
}

/**
 * A soft shaft of light in the smoky air below a lamp: an open cone, brightest at the top,
 * fading towards the floor and at its silhouette edges.
 */
function lightCone(scene: THREE.Scene, updates: ((dt: number, t: number) => void)[], x: number, top: number, z: number, rTop: number, rBottom: number, h: number, color: number, strength: number): void {
  const geo = new THREE.CylinderGeometry(rTop, rBottom, h, 40, 8, true);
  const mat = new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(color) }, strength: { value: strength }, time: { value: 0 }, height: { value: h } },
    vertexShader: /* glsl */ `
      varying float vH;
      varying vec3 vN;
      varying vec3 vView;
      varying vec3 vWorld;
      uniform float height;
      void main() {
        vH = 0.5 - position.y / height;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        vView = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vH;
      varying vec3 vN;
      varying vec3 vView;
      varying vec3 vWorld;
      uniform vec3 color;
      uniform float strength;
      uniform float time;
      void main() {
        float edge = pow(abs(dot(vN, vView)), 2.0);
        float fall = pow(1.0 - clamp(vH, 0.0, 1.0), 1.6) * smoothstep(0.0, 0.08, vH);
        float drift = 0.75 + 0.25 * sin(vWorld.y * 3.0 + vWorld.x * 2.0 + time * 0.4) * sin(vWorld.z * 2.5 - time * 0.3);
        gl_FragColor = vec4(color * strength * edge * fall * drift, 1.0);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const cone = new THREE.Mesh(geo, mat);
  cone.position.set(x, top - h / 2, z);
  cone.renderOrder = 5;
  scene.add(cone);
  updates.push((_dt, t) => (mat.uniforms.time.value = t));
}

/** Dust and smoke particles glittering in a lamp's light. */
function dust(scene: THREE.Scene, updates: ((dt: number, t: number) => void)[], cx: number, cz: number, halfW: number, halfD: number, y0: number, y1: number): void {
  smokeTex ??= smokeTexture();
  const n = 260;
  const base = new Float32Array(n * 3);
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    base[i * 3] = cx + (Math.random() * 2 - 1) * halfW;
    base[i * 3 + 1] = y0 + Math.random() * (y1 - y0);
    base[i * 3 + 2] = cz + (Math.random() * 2 - 1) * halfD;
  }
  pos.set(base);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ map: smokeTex, color: 0xffe2b8, size: 0.012, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
  const points = new THREE.Points(geo, mat);
  scene.add(points);
  updates.push((_dt, t) => {
    for (let i = 0; i < n; i++) {
      const k = i * 1.37;
      pos[i * 3] = base[i * 3] + Math.sin(t * 0.13 + k) * 0.08;
      pos[i * 3 + 1] = y0 + ((base[i * 3 + 1] - y0 + t * 0.012 * (0.5 + (i % 5) * 0.2)) % (y1 - y0));
      pos[i * 3 + 2] = base[i * 3 + 2] + Math.cos(t * 0.11 + k * 0.7) * 0.06;
    }
    geo.attributes.position.needsUpdate = true;
  });
}


/** Soft light thrown on a wall by a sconce: a bright spot at the shade, cones fading up and down. */
function washTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 180;
  const g = c.getContext('2d')!;
  const blob = (y: number, rx: number, ry: number, a: number) => {
    g.save();
    g.translate(64, y);
    g.scale(rx / 64, ry / 64);
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, 64);
    grad.addColorStop(0, `rgba(255,255,255,${a})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(-64, -64, 128, 128);
    g.restore();
  };
  blob(26, 50, 40, 0.35);
  blob(128, 42, 60, 0.25);
  blob(78, 22, 16, 0.55);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A palm frond: a midrib with narrow leaflets, cut out with alpha. */
function frondTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.strokeStyle = '#3a6a2a';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(64, 256);
  g.lineTo(64, 0);
  g.stroke();
  for (let y = 250; y > 6; y -= 7) {
    const w = 60 * Math.sin((y / 256) * Math.PI) + 4;
    for (const s of [-1, 1]) {
      const grad = g.createLinearGradient(64, y, 64 + s * w, y - 20);
      grad.addColorStop(0, '#2f6a24');
      grad.addColorStop(1, '#5aa03a');
      g.strokeStyle = grad;
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(64, y);
      g.quadraticCurveTo(64 + s * w * 0.5, y - 6, 64 + s * w, y - 22);
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
