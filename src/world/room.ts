import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { DOOR, KASSE, PHONE, ROOM, TABLE, VITRINE } from './layout';
import { carpet, ceiling, damask, marble, smudges, wood, woodBump } from './materials';

/** Handles to the parts of the room that animate or that the game talks to. */
export interface Casino {
  update(dt: number, t: number): void;
  showcase: THREE.Group;
  phoneHandset: THREE.Group;
  phoneLamp: THREE.MeshStandardMaterial;
  phoneLight: THREE.PointLight;
  /** Where background guests stand, facing the slot machines. */
  guestSpots: { x: number; z: number; heading: number }[];
  /** Objects that fade out when they block the view onto the player. */
  occluders: THREE.Mesh[];
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
    const skirting = mesh(new THREE.BoxGeometry(len, 0.14, 0.07), darkWood, 0, 0.07, 0.035);
    const crown = mesh(new THREE.BoxGeometry(len, 0.12, 0.12), darkWood, 0, H - 0.06, 0.06);
    g.add(paper, panel, rail, skirting, crown);
    for (let k = -len / 2 + 0.4; k < len / 2; k += 0.8) g.add(mesh(new THREE.BoxGeometry(0.05, 1.0, 0.07), darkWood, k, 0.55, 0.04));
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    scene.add(g);
  };
  wall(W, 0, ROOM.z0, 0);
  wall(D, ROOM.x0, 0, Math.PI / 2);
  wall(D, ROOM.x1, 0, -Math.PI / 2);

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
  for (const [x, z, len, rot] of [[0, ROOM.z0 + 0.14, W - 0.4, 0], [ROOM.x0 + 0.14, 0, D - 0.4, Math.PI / 2], [ROOM.x1 - 0.14, 0, D - 0.4, Math.PI / 2]] as const) {
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, len, 8), trimMat);
    tube.rotation.z = Math.PI / 2;
    tube.rotation.y = rot;
    tube.position.set(x, H - 0.16, z);
    scene.add(tube);
  }

  // ---- Lights ------------------------------------------------------------------
  scene.add(new THREE.HemisphereLight(0x8a7a90, 0x2a1010, 0.7));

  const tableLamp = new THREE.Group();
  tableLamp.position.set(TABLE.x, 2.55, TABLE.z);
  const shadeMat = phys({ color: 0x0e3a1c, roughness: 0.25, metalness: 0.2, clearcoat: 1, side: THREE.DoubleSide });
  const shade = mesh(new RoundedBoxGeometry(2.4, 0.16, 0.5, 3, 0.05), shadeMat, 0, 0, 0);
  const inner = mesh(new THREE.PlaneGeometry(2.3, 0.42), new THREE.MeshBasicMaterial({ color: 0xffe8c0, toneMapped: false }), 0, -0.081, 0, false);
  inner.rotation.x = Math.PI / 2;
  tableLamp.add(shade, inner);
  for (const x of [-1, 1]) tableLamp.add(mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.9), brass, x * 0.9, 0.45, 0, false));
  occluders.push(shade);
  scene.add(tableLamp);
  for (const x of [-0.75, 0.75]) {
    const spot = new THREE.SpotLight(0xffd6a0, 11, 6, 0.75, 0.55, 1.6);
    spot.position.set(TABLE.x + x, 2.45, TABLE.z);
    spot.target.position.set(TABLE.x + x, 0, TABLE.z);
    spot.castShadow = true;
    spot.shadow.mapSize.set(2048, 2048);
    spot.shadow.bias = -0.00015;
    spot.shadow.normalBias = 0.02;
    spot.shadow.camera.near = 0.8;
    scene.add(spot, spot.target);
  }

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
    return spot;
  };
  lamp(KASSE.x, KASSE.z + 0.8, 16);
  lamp(-4.6, 3.2, 12);
  lamp(3.8, 2.6, 12);
  lamp(VITRINE.x + 1.2, VITRINE.z, 10);
  lamp(DOOR.x, ROOM.z0 + 1.2, 9, 0xffb070);
  lamp(TABLE.x, TABLE.z + 1.9, 12, 0xffd0a0);
  lamp(-2.8, 0.6, 8);

  // Neon signs with coloured bounce light.
  const sign = neon('Rien ne va plus', '#ff2fa8', 3.4, 0.8, 'italic 700 150px Georgia, serif');
  sign.position.set(-0.6, 2.6, ROOM.z0 + 0.05);
  const signLight = new THREE.PointLight(0xff3fb0, 5, 5, 1.8);
  signLight.position.set(-0.6, 2.4, ROOM.z0 + 0.5);
  scene.add(sign, signLight);
  const kasseSign = neon('KASSE', '#ffb000', 1.3, 0.36, '700 220px Georgia, serif');
  kasseSign.position.set(KASSE.x, 2.5, KASSE.z + KASSE.halfD - 0.02);
  scene.add(kasseSign);
  const barSign = neon('BAR', '#27e3ff', 0.9, 0.36, '700 260px Arial Narrow, Arial, sans-serif');
  barSign.position.set(ROOM.x1 - 0.04, 2.35, 3.9);
  barSign.rotation.y = -Math.PI / 2;
  const barLight = new THREE.PointLight(0x27e3ff, 3, 4, 2);
  barLight.position.set(ROOM.x1 - 0.8, 2.1, 3.9);
  scene.add(barSign, barLight);
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
    g.add(mesh(new RoundedBoxGeometry(V.halfW * 2, 0.7, V.halfD * 2, 3, 0.02), lacquer, 0, 0.35, 0));
    g.add(mesh(new RoundedBoxGeometry(V.halfW * 2 + 0.05, 0.08, V.halfD * 2 + 0.05, 2, 0.02), lacquer, 0, V.height, 0));
    g.add(mesh(new THREE.BoxGeometry(0.03, V.height - 0.7, V.halfD * 2), velvet, -V.halfW + 0.02, 0.7 + (V.height - 0.7) / 2, 0));
    const front = mesh(new THREE.PlaneGeometry(V.halfD * 2, V.height - 0.7), glass, V.halfW, 0.7 + (V.height - 0.7) / 2, 0, false);
    front.rotation.y = Math.PI / 2;
    g.add(front);
    for (const z of [-V.halfD, V.halfD]) g.add(mesh(new THREE.BoxGeometry(V.halfW * 2, V.height - 0.7, 0.03), brass, 0, 0.7 + (V.height - 0.7) / 2, z));
    for (const y of [0.72, 1.3]) g.add(mesh(new THREE.BoxGeometry(V.halfW * 2 - 0.06, 0.015, V.halfD * 2 - 0.06), phys({ color: 0xffffff, transparent: true, opacity: 0.25, roughness: 0.02 }), 0, y, 0, false));
    const inLight = new THREE.PointLight(0xffe0b0, 2.2, 2.4, 2);
    inLight.position.set(0.1, V.height - 0.12, 0);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.3), new THREE.MeshBasicMaterial({ map: textTexture('Kuriositäten', 512, 120, 'italic 700 78px Georgia, serif', '#ffffff', '#ff9a2a'), transparent: true, toneMapped: false }));
    sign.rotation.y = Math.PI / 2;
    sign.position.set(V.halfW + 0.02, V.height + 0.28, 0);
    g.add(inLight, sign, showcase);
    scene.add(g);
  }

  // ---- Phone with a flickering fluorescent tube -------------------------------------
  const phoneHandset = new THREE.Group();
  const phoneLamp = std({ color: 0x400000, emissive: 0xff2020, emissiveIntensity: 0 });
  const phoneLight = new THREE.PointLight(0xff2020, 0, 2.5, 2);
  {
    const g = new THREE.Group();
    g.position.set(PHONE.x, PHONE.y, PHONE.z);
    g.rotation.y = -Math.PI / 2;
    g.add(mesh(new RoundedBoxGeometry(0.42, 0.52, 0.03, 2, 0.01), darkWood, 0, 0, 0));
    const red = phys({ color: 0x9a0a14, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1 });
    g.add(mesh(new RoundedBoxGeometry(0.22, 0.26, 0.11, 3, 0.03), red, 0, -0.02, 0.07));
    const dial = mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.012, 32), std({ color: 0xf0e8d8, roughness: 0.4 }), 0, -0.05, 0.127);
    dial.rotation.x = Math.PI / 2;
    g.add(dial);
    const hand = mesh(new THREE.CapsuleGeometry(0.024, 0.17, 6, 12), red, 0, 0, 0);
    hand.rotation.z = Math.PI / 2;
    phoneHandset.add(hand);
    for (const x of [-0.095, 0.095]) phoneHandset.add(mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.032, 16), red, x, -0.014, 0));
    phoneHandset.position.set(0, 0.11, 0.135);
    g.add(phoneHandset, mesh(new THREE.SphereGeometry(0.028, 12, 10), phoneLamp, 0.15, 0.2, 0.03));
    // Coiled cord.
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 60; i++) {
      const a = i * 0.9;
      pts.push(new THREE.Vector3(-0.1 + Math.cos(a) * 0.012, 0.08 - i * 0.006, 0.12 + Math.sin(a) * 0.012));
    }
    g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 200, 0.003, 5), red, 0, 0, 0, false));
    g.scale.setScalar(1.4);
    const tube = mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.0, 10), std({ color: 0xffffff, emissive: 0xe8fff0, emissiveIntensity: 2 }), 0, 0.72, 0.02, false);
    tube.rotation.z = Math.PI / 2;
    g.add(tube);
    const tubeLight = new THREE.PointLight(0xdfffe8, 2.5, 3.5, 2);
    tubeLight.position.set(PHONE.x - 0.3, PHONE.y + 1.0, PHONE.z);
    scene.add(g, phoneLight, tubeLight);
    phoneLight.position.set(PHONE.x - 0.3, PHONE.y + 0.2, PHONE.z);
    const tubeMat = tube.material as THREE.MeshStandardMaterial;
    let buzz = 0;
    updates.push((dt) => {
      buzz -= dt;
      if (buzz < -0.3) buzz = 1 + Math.random() * 4;
      const on = buzz > 0 || Math.random() > 0.6;
      tubeLight.intensity = on ? 2.5 : 0.1;
      tubeMat.emissiveIntensity = on ? 2 : 0.1;
    });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.2), new THREE.MeshBasicMaterial({ map: textTexture('TELEFON', 512, 128, '700 84px Georgia, serif', '#ffffff', '#ff3030'), transparent: true, toneMapped: false }));
    sign.rotation.y = -Math.PI / 2;
    sign.position.set(PHONE.x - 0.02, PHONE.y + 0.62, PHONE.z);
    scene.add(sign);
  }

  // ---- Slot machines with little CRT reels -------------------------------------------
  const guestSpots: Casino['guestSpots'] = [];
  const slotScreens: { tex: THREE.CanvasTexture; g: CanvasRenderingContext2D; next: number; reels: number[] }[] = [];
  const symbols = ['7', '♣', '$', '♦', 'BAR', '♥'];
  const drawReels = (g: CanvasRenderingContext2D, reels: number[], blur: boolean) => {
    g.fillStyle = '#0a0a12';
    g.fillRect(0, 0, 256, 192);
    reels.forEach((r, i) => {
      const x = 16 + i * 80;
      const grad = g.createLinearGradient(0, 20, 0, 172);
      grad.addColorStop(0, '#444');
      grad.addColorStop(0.5, '#f4f0e0');
      grad.addColorStop(1, '#444');
      g.fillStyle = grad;
      g.fillRect(x, 20, 64, 152);
      g.fillStyle = r % 2 ? '#c8102c' : '#101010';
      g.font = `700 ${symbols[r].length > 1 ? 26 : 50}px Georgia, serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      if (blur) g.globalAlpha = 0.45;
      g.fillText(symbols[r], x + 32, 96);
      if (blur) g.fillText(symbols[(r + 1) % symbols.length], x + 32, 40);
      g.globalAlpha = 1;
    });
    g.fillStyle = 'rgba(255,40,40,0.8)';
    g.fillRect(0, 94, 256, 3);
  };
  const cabinetMat = phys({ color: 0x2a0a30, roughness: 0.35, metalness: 0.3, clearcoat: 0.8 });
  for (let i = 0; i < 3; i++) {
    const x = 0.9 + i * 1.05;
    const g = new THREE.Group();
    g.position.set(x, 0, ROOM.z0 + 0.45);
    g.add(mesh(new RoundedBoxGeometry(0.8, 1.35, 0.7, 3, 0.05), cabinetMat, 0, 0.675, 0));
    g.add(mesh(new RoundedBoxGeometry(0.72, 0.62, 0.55, 3, 0.05), cabinetMat, 0, 1.64, -0.05));
    const [c, cg] = (() => {
      const cv = document.createElement('canvas');
      cv.width = 256;
      cv.height = 192;
      return [cv, cv.getContext('2d')!] as const;
    })();
    const reels = [i, i + 2, i + 4].map((k) => k % symbols.length);
    drawReels(cg, reels, false);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const screen = mesh(new THREE.PlaneGeometry(0.52, 0.39), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }), 0, 1.66, 0.231, false);
    screen.rotation.x = -0.12;
    g.add(screen);
    slotScreens.push({ tex, g: cg, next: Math.random() * 4, reels });
    const topBox = mesh(new RoundedBoxGeometry(0.72, 0.22, 0.4, 2, 0.04), new THREE.MeshStandardMaterial({ color: 0x220000, emissive: [0xff2a4a, 0x27e3ff, 0xffb000][i], emissiveIntensity: 1.6 }), 0, 2.08, -0.05, false);
    g.add(topBox);
    g.add(mesh(new THREE.BoxGeometry(0.5, 0.08, 0.18), chrome, 0, 0.95, 0.38));
    const lever = mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.45), chrome, 0.46, 1.4, 0.05);
    lever.rotation.z = -0.15;
    g.add(lever, mesh(new THREE.SphereGeometry(0.045, 14, 10), phys({ color: 0xc8102c, clearcoat: 1, roughness: 0.2 }), 0.49, 1.63, 0.05));
    const glowLight = new THREE.PointLight([0xff2a4a, 0x27e3ff, 0xffb000][i], 1.6, 2.2, 2);
    glowLight.position.set(0, 1.7, 0.6);
    g.add(glowLight);
    scene.add(g);
    if (i !== 1) guestSpots.push({ x, z: ROOM.z0 + 1.25, heading: Math.PI });
  }
  updates.push((dt) => {
    for (const s of slotScreens) {
      s.next -= dt;
      if (s.next < 0) {
        const spinning = s.next > -1.2;
        if (spinning) {
          s.reels = s.reels.map(() => Math.floor(Math.random() * symbols.length));
          drawReels(s.g, s.reels, true);
        } else {
          drawReels(s.g, s.reels, false);
          s.next = 3 + Math.random() * 6;
        }
        s.tex.needsUpdate = true;
      }
    }
  });

  // ---- Bar corner ------------------------------------------------------------------
  {
    const g = new THREE.Group();
    g.position.set(ROOM.x1 - 1.1, 0, 3.9);
    g.add(mesh(new RoundedBoxGeometry(0.7, 1.05, 2.2, 3, 0.03), panelMat, 0, 0.525, 0));
    g.add(mesh(new RoundedBoxGeometry(0.85, 0.06, 2.35, 2, 0.02), lacquer, 0, 1.08, 0));
    const shelf = mesh(new THREE.BoxGeometry(0.3, 0.03, 2.0), darkWood, 0.78, 1.55, 0);
    g.add(shelf);
    const bottleColors = [0x3a6a2a, 0x8a3a1a, 0xc9a13a, 0x2a4a7a, 0x6a1a2a, 0xd8d0b0];
    for (let i = 0; i < 12; i++) {
      const glassMat = phys({ color: bottleColors[i % 6], transparent: true, opacity: 0.75, roughness: 0.05, clearcoat: 1 });
      const b = new THREE.Group();
      b.add(mesh(new THREE.CylinderGeometry(0.04, 0.042, 0.22, 16), glassMat, 0, 0.11, 0));
      b.add(mesh(new THREE.CylinderGeometry(0.014, 0.03, 0.08, 12), glassMat, 0, 0.26, 0));
      b.add(mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.02, 10), brass, 0, 0.31, 0));
      b.position.set(0.78, 1.565, -0.9 + i * 0.16);
      g.add(b);
    }
    for (const z of [-0.6, 0.3]) {
      const stool = new THREE.Group();
      stool.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 20), velvet, 0, 0.78, 0));
      stool.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.75, 10), chrome, 0, 0.38, 0));
      stool.add(mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.03, 20), chrome, 0, 0.015, 0));
      stool.add(mesh(new THREE.TorusGeometry(0.15, 0.01, 6, 20), chrome, 0, 0.3, 0).rotateX(Math.PI / 2));
      stool.position.set(-0.75, 0, z);
      g.add(stool);
    }
    const glass = mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.09, 16), phys({ color: 0xffffff, transparent: true, opacity: 0.3, roughness: 0 }), -0.2, 1.155, 0.2);
    const whisky = mesh(new THREE.CylinderGeometry(0.032, 0.028, 0.04, 16), phys({ color: 0xb06010, transparent: true, opacity: 0.8, roughness: 0 }), -0.2, 1.135, 0.2, false);
    g.add(glass, whisky);
    if (candle) {
      const c = candle.scene.clone(true);
      c.scale.setScalar(0.8);
      c.position.set(-0.1, 1.11, -0.5);
      g.add(c);
    }
    scene.add(g);
  }

  // ---- Lounge: velvet chairs, jukebox and a CRT on a trolley ----------------------------
  if (chair) {
    const spots: [number, number, number][] = [[-5.9, 3.9, 0.6], [-4.7, 4.5, -0.3], [TABLE.x + TABLE.halfW + 0.55, TABLE.z + 0.1, -Math.PI / 2]];
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
    side.position.set(-5.3, 0, 4.15);
    side.add(mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.03, 24), lacquer, 0, 0.58, 0));
    side.add(mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.56, 10), brass, 0, 0.28, 0));
    side.add(mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.02, 20), phys({ color: 0x9ab8c8, transparent: true, opacity: 0.6, roughness: 0.1 }), 0.08, 0.605, 0));
    scene.add(side);
    smoke(scene, updates, new THREE.Vector3(-5.22, 0.64, 4.15));
  }
  {
    // Jukebox.
    const g = new THREE.Group();
    g.position.set(ROOM.x0 + 0.5, 0, -3.6);
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
    const jl = new THREE.PointLight(0xff8a3a, 2, 2.5, 2);
    jl.position.set(0, 1.2, 0.8);
    g.add(jl);
    scene.add(g);
  }
  {
    // CRT television with a horse race and static.
    const g = new THREE.Group();
    g.position.set(ROOM.x1 - 0.55, 0, -2.9);
    g.rotation.y = -Math.PI / 2 + 0.3;
    g.add(mesh(new THREE.BoxGeometry(0.6, 0.6, 0.45), darkWood, 0, 0.3, 0));
    g.add(mesh(new RoundedBoxGeometry(0.62, 0.5, 0.48, 3, 0.05), std({ color: 0x2a2420, roughness: 0.5 }), 0, 0.86, 0));
    const cv = document.createElement('canvas');
    cv.width = 160;
    cv.height = 120;
    const cg = cv.getContext('2d')!;
    const tvTex = new THREE.CanvasTexture(cv);
    tvTex.colorSpace = THREE.SRGBColorSpace;
    const screen = mesh(new THREE.PlaneGeometry(0.44, 0.33), new THREE.MeshBasicMaterial({ map: tvTex, toneMapped: false }), -0.04, 0.88, 0.245, false);
    g.add(screen);
    const tvLight = new THREE.PointLight(0x9ab8ff, 1.2, 2.2, 2);
    tvLight.position.set(0, 0.9, 0.6);
    g.add(tvLight);
    let tv = 0;
    let frame = 0;
    updates.push((dt) => {
      tv -= dt;
      if (tv > 0) return;
      tv = 1 / 12;
      frame++;
      const img = cg.createImageData(160, 120);
      const race = Math.floor(frame / 60) % 3 !== 2;
      for (let i = 0; i < img.data.length; i += 4) {
        const n = Math.random() * 255;
        if (race) {
          const y = Math.floor(i / 4 / 160);
          const base = y < 50 ? [60, 90, 150] : [40, 110, 40];
          img.data[i] = base[0] + n * 0.15;
          img.data[i + 1] = base[1] + n * 0.15;
          img.data[i + 2] = base[2] + n * 0.15;
        } else {
          img.data[i] = img.data[i + 1] = img.data[i + 2] = n;
        }
        img.data[i + 3] = 255;
      }
      cg.putImageData(img, 0, 0);
      if (race) {
        for (let k = 0; k < 4; k++) {
          const x = ((frame * (1.5 + k * 0.3)) % 200) - 20;
          cg.fillStyle = ['#3a2010', '#101010', '#6a4020', '#e0d0b0'][k];
          cg.fillRect(x, 58 + k * 12, 18, 9);
          cg.fillRect(x + 14, 54 + k * 12, 6, 6);
        }
        cg.fillStyle = '#fff';
        cg.font = '700 11px monospace';
        cg.fillText('RENNEN 4 · LIVE', 6, 14);
      }
      tvTex.needsUpdate = true;
      tvLight.intensity = race ? 1.0 : 1.4 + Math.random() * 0.4;
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
  poster(ROOM.x0 + 0.03, -1.2, Math.PI / 2, 'Big Band', 'JEDEN FREITAG · 22 UHR', 330);
  poster(ROOM.x0 + 0.03, 2.4, Math.PI / 2, 'Jackpot', 'AB 1.000.000 LIRE', 200);
  poster(ROOM.x1 - 0.03, -1.4, -Math.PI / 2, 'Casino', 'SEIT 1961', 20);

  // Haze near the ceiling.
  haze(scene, updates);

  return {
    update: (dt, t) => updates.forEach((u) => u(dt, t)),
    showcase,
    phoneHandset,
    phoneLamp,
    phoneLight,
    guestSpots,
    occluders,
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

/** Cigarette smoke curling up from a point. */
export function smoke(scene: THREE.Scene, updates: ((dt: number, t: number) => void)[], at: THREE.Vector3, rate = 3): void {
  smokeTex ??= smokeTexture();
  const puffs: { s: THREE.Sprite; life: number; vx: number }[] = [];
  let acc = 0;
  updates.push((dt, t) => {
    acc += dt * rate;
    while (acc > 1) {
      acc--;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, color: 0xb8b0a8, transparent: true, opacity: 0, depthWrite: false }));
      s.position.copy(at);
      s.scale.setScalar(0.03);
      scene.add(s);
      puffs.push({ s, life: 0, vx: (Math.random() - 0.5) * 0.05 });
    }
    for (const p of [...puffs]) {
      p.life += dt;
      const k = p.life / 5;
      p.s.position.y += dt * 0.12;
      p.s.position.x += dt * (p.vx + Math.sin(t * 1.3 + p.life * 2) * 0.03);
      p.s.scale.setScalar(0.03 + k * 0.5);
      (p.s.material as THREE.SpriteMaterial).opacity = Math.sin(Math.min(1, k) * Math.PI) * 0.22;
      if (k >= 1) {
        scene.remove(p.s);
        puffs.splice(puffs.indexOf(p), 1);
      }
    }
  });
}

/** A thin layer of smoke hanging under the ceiling. */
function haze(scene: THREE.Scene, updates: ((dt: number, t: number) => void)[]): void {
  smokeTex ??= smokeTexture();
  const sprites: THREE.Sprite[] = [];
  for (let i = 0; i < 26; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, color: 0x8a7a70, transparent: true, opacity: 0.06, depthWrite: false }));
    s.position.set(ROOM.x0 + Math.random() * (ROOM.x1 - ROOM.x0), 2.3 + Math.random() * 0.9, ROOM.z0 + Math.random() * (ROOM.z1 - ROOM.z0));
    s.scale.setScalar(2.5 + Math.random() * 2.5);
    s.userData.base = s.position.clone();
    scene.add(s);
    sprites.push(s);
  }
  updates.push((_dt, t) => {
    sprites.forEach((s, i) => {
      const b = s.userData.base as THREE.Vector3;
      s.position.x = b.x + Math.sin(t * 0.05 + i) * 0.6;
      s.position.z = b.z + Math.cos(t * 0.04 + i * 1.7) * 0.4;
    });
  });
}
