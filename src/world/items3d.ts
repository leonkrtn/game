import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/** A talisman figurine as it stands on the table. Sizes are in meters (about 6–12 cm tall). */
export interface Figurine {
  group: THREE.Group;
  /** Idle animation, called every frame with the elapsed time. */
  animate?: (t: number) => void;
  /** Height of the figurine, for placing labels and effects above it. */
  height: number;
}

const std = (color: number, rough = 0.5, metal = 0, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
const glow = (color: number, intensity = 2) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity });

const M = {
  gold: std(0xe0b44a, 0.28, 0.9),
  brass: std(0xc9a04a, 0.35, 0.85),
  iron: std(0x6a6a72, 0.45, 0.8),
  silver: std(0xd8d8e0, 0.2, 0.95),
  wood: std(0x6b3a1c, 0.6),
  darkWood: std(0x3a1d0c, 0.5),
  black: std(0x141418, 0.45),
  fur: std(0x0d0d10, 0.9),
  white: std(0xf2eee4, 0.4),
  porcelain: std(0xfbf8f0, 0.2),
  bone: std(0xe8dcc0, 0.7),
  red: std(0xb81c28, 0.45),
  wax: std(0xa8101c, 0.55),
  pink: std(0xf2a0b0, 0.55),
  green: std(0x2f8a3a, 0.6),
  terracotta: std(0xb4592e, 0.8),
  paper: std(0xefe6cf, 0.9),
  copper: std(0xc0703a, 0.3, 0.9),
  velvet: std(0x7a0e1e, 0.95),
};

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, cast = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = true;
  return m;
}

function diceTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f4f0e6';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#b01020';
  for (const [x, y] of [[16, 16], [48, 48], [32, 32], [48, 16], [16, 48]]) {
    g.beginPath();
    g.arc(x, y, 6, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function clockTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f6efdc';
  g.beginPath();
  g.arc(64, 64, 62, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#2a1a0a';
  g.font = '700 16px Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (let i = 1; i <= 12; i++) {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
    g.fillText(String(i), 64 + Math.cos(a) * 48, 64 + Math.sin(a) * 48);
  }
  g.strokeStyle = '#2a1a0a';
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(64, 64);
  g.lineTo(64, 28);
  g.moveTo(64, 64);
  g.lineTo(88, 72);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const rbox = (w: number, h: number, d: number, r: number) => new RoundedBoxGeometry(w, h, d, 3, r);

type Builder = () => Figurine;

const BUILDERS: Record<string, Builder> = {
  hufeisen() {
    const g = new THREE.Group();
    const shoe = mesh(new THREE.TorusGeometry(0.03, 0.008, 10, 24, Math.PI * 1.35), M.iron, 0, 0.042, 0);
    shoe.rotation.z = -Math.PI * 0.175 + Math.PI;
    g.add(shoe, mesh(new THREE.CylinderGeometry(0.03, 0.034, 0.008, 20), M.darkWood, 0, 0.004, 0));
    return { group: g, height: 0.08 };
  },
  pfennig() {
    const g = new THREE.Group();
    const coin = mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.005, 28), M.copper, 0, 0.038, 0);
    coin.rotation.x = Math.PI / 2;
    g.add(coin, mesh(new THREE.BoxGeometry(0.04, 0.01, 0.02), M.darkWood, 0, 0.005, 0));
    return { group: g, height: 0.07, animate: (t) => (coin.rotation.z = Math.sin(t * 1.5) * 0.4) };
  },
  kerze() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.028, 0.03, 0.006, 20), M.brass, 0, 0.003, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.012, 0.013, 0.07, 16), M.wax, 0, 0.041, 0));
    for (const [x, y] of [[0.011, 0.06], [-0.009, 0.05]]) g.add(mesh(new THREE.SphereGeometry(0.004, 8, 6), M.wax, x, y, 0.004));
    const flame = mesh(new THREE.ConeGeometry(0.006, 0.02, 10), glow(0xffa030, 3), 0, 0.087, 0);
    flame.castShadow = false;
    g.add(flame);
    return {
      group: g, height: 0.1,
      animate: (t) => {
        flame.scale.set(1, 0.85 + Math.sin(t * 17) * 0.1 + Math.sin(t * 7.3) * 0.08, 1);
        flame.rotation.z = Math.sin(t * 5) * 0.12;
      },
    };
  },
  katze() {
    const g = new THREE.Group();
    const body = mesh(new THREE.SphereGeometry(0.026, 16, 12), M.fur, 0, 0.028, 0);
    body.scale.set(1, 1.2, 0.9);
    const head = mesh(new THREE.SphereGeometry(0.018, 16, 12), M.fur, 0, 0.068, 0.006);
    const earL = mesh(new THREE.ConeGeometry(0.007, 0.014, 6), M.fur, -0.01, 0.084, 0.004);
    const earR = mesh(new THREE.ConeGeometry(0.007, 0.014, 6), M.fur, 0.01, 0.084, 0.004);
    const tail = mesh(new THREE.TorusGeometry(0.022, 0.004, 6, 16, Math.PI), M.fur, 0.02, 0.02, -0.012);
    tail.rotation.y = Math.PI / 2;
    const eyeMat = glow(0x9dff4a, 2.5);
    g.add(body, head, earL, earR, tail, mesh(new THREE.SphereGeometry(0.003, 8, 6), eyeMat, -0.007, 0.071, 0.022), mesh(new THREE.SphereGeometry(0.003, 8, 6), eyeMat, 0.007, 0.071, 0.022));
    return { group: g, height: 0.09, animate: (t) => (tail.rotation.x = Math.sin(t * 2) * 0.3) };
  },
  wuerfel() {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ map: diceTexture(), roughness: 0.3 });
    const a = mesh(new THREE.BoxGeometry(0.022, 0.022, 0.022), mat, -0.014, 0.011, 0);
    const b = mesh(new THREE.BoxGeometry(0.022, 0.022, 0.022), mat, 0.014, 0.011, 0.006);
    b.rotation.y = 0.6;
    const c = mesh(new THREE.BoxGeometry(0.022, 0.022, 0.022), mat, 0, 0.033, 0.002);
    c.rotation.set(0.3, 0.9, 0.2);
    g.add(a, b, c);
    return { group: g, height: 0.06 };
  },
  abakus() {
    const g = new THREE.Group();
    for (const x of [-0.035, 0.035]) g.add(mesh(new THREE.BoxGeometry(0.006, 0.06, 0.012), M.wood, x, 0.03, 0));
    for (const y of [0.003, 0.057]) g.add(mesh(new THREE.BoxGeometry(0.076, 0.006, 0.012), M.wood, 0, y, 0));
    const colors = [0xc8202c, 0xe0b44a, 0x2a6fd8, 0x2f8a3a];
    for (let r = 0; r < 4; r++) {
      const y = 0.013 + r * 0.012;
      const rod = mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 0.07), M.brass, 0, y, 0);
      rod.rotation.z = Math.PI / 2;
      g.add(rod);
      for (let k = 0; k < 4; k++) g.add(mesh(new THREE.SphereGeometry(0.0045, 10, 8), std(colors[r], 0.4), -0.025 + k * 0.009 + (r % 2) * 0.012, y, 0));
    }
    return { group: g, height: 0.07 };
  },
  sparschwein() {
    const g = new THREE.Group();
    const body = mesh(new THREE.SphereGeometry(0.028, 18, 14), M.pink, 0, 0.032, 0);
    body.scale.set(1, 0.85, 1.25);
    const snout = mesh(new THREE.CylinderGeometry(0.01, 0.011, 0.01, 14), M.pink, 0, 0.032, 0.037);
    snout.rotation.x = Math.PI / 2;
    g.add(body, snout);
    for (const x of [-0.013, 0.013]) g.add(mesh(new THREE.ConeGeometry(0.007, 0.012, 6), M.pink, x, 0.058, 0.01));
    for (const [x, z] of [[-0.014, -0.016], [0.014, -0.016], [-0.014, 0.016], [0.014, 0.016]]) g.add(mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.012, 8), M.pink, x, 0.006, z));
    g.add(mesh(new THREE.BoxGeometry(0.014, 0.002, 0.003), M.black, 0, 0.056, -0.004));
    return { group: g, height: 0.07 };
  },
  kleeblatt() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.022, 0.016, 0.03, 16), M.terracotta, 0, 0.015, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.003, 16), std(0x2a1a0c, 1), 0, 0.03, 0));
    const stem = mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 0.035), M.green, 0, 0.048, 0);
    const leaves = new THREE.Group();
    leaves.position.y = 0.066;
    for (let i = 0; i < 4; i++) {
      const leaf = mesh(new THREE.SphereGeometry(0.011, 12, 8), std(0x3fb04a, 0.5), 0, 0, 0);
      leaf.scale.set(1, 0.25, 0.8);
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      leaf.position.set(Math.cos(a) * 0.01, 0, Math.sin(a) * 0.01);
      leaves.add(leaf);
    }
    g.add(stem, leaves);
    return { group: g, height: 0.08, animate: (t) => (leaves.rotation.y = Math.sin(t * 0.8) * 0.2) };
  },
  sanduhr() {
    const g = new THREE.Group();
    const glass = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, roughness: 0.05 });
    const sand = std(0xe6c07a, 0.9);
    for (const y of [0.004, 0.076]) g.add(mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.006, 16), M.darkWood, 0, y, 0));
    const top = mesh(new THREE.ConeGeometry(0.018, 0.034, 16, 1, true), glass, 0, 0.057, 0);
    top.rotation.x = Math.PI;
    const bottom = mesh(new THREE.ConeGeometry(0.018, 0.034, 16, 1, true), glass, 0, 0.023, 0);
    const sandTop = mesh(new THREE.ConeGeometry(0.011, 0.014, 12), sand, 0, 0.05, 0);
    sandTop.rotation.x = Math.PI;
    const sandBottom = mesh(new THREE.ConeGeometry(0.015, 0.016, 12), sand, 0, 0.015, 0);
    g.add(top, bottom, sandTop, sandBottom);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      g.add(mesh(new THREE.CylinderGeometry(0.0018, 0.0018, 0.07), M.darkWood, Math.cos(a) * 0.021, 0.04, Math.sin(a) * 0.021));
    }
    return { group: g, height: 0.085 };
  },
  glocke() {
    const g = new THREE.Group();
    const pts = [
      new THREE.Vector2(0.001, 0.06), new THREE.Vector2(0.01, 0.058), new THREE.Vector2(0.014, 0.045),
      new THREE.Vector2(0.018, 0.02), new THREE.Vector2(0.026, 0.006), new THREE.Vector2(0.028, 0.002),
    ];
    const bell = mesh(new THREE.LatheGeometry(pts, 24), new THREE.MeshStandardMaterial({ color: 0xd4a84a, metalness: 0.9, roughness: 0.25, side: THREE.DoubleSide }), 0, 0, 0);
    const handle = mesh(new THREE.CylinderGeometry(0.003, 0.004, 0.025), M.darkWood, 0, 0.072, 0);
    const knob = mesh(new THREE.SphereGeometry(0.006, 10, 8), M.darkWood, 0, 0.087, 0);
    const pivot = new THREE.Group();
    pivot.add(bell, handle, knob);
    g.add(pivot);
    return { group: g, height: 0.095, animate: (t) => (pivot.rotation.z = Math.sin(t * 1.3) * 0.03) };
  },
  rabe() {
    const g = new THREE.Group();
    const body = mesh(new THREE.SphereGeometry(0.02, 14, 10), M.fur, 0, 0.03, 0);
    body.scale.set(0.8, 1, 1.4);
    body.rotation.x = -0.4;
    const head = mesh(new THREE.SphereGeometry(0.012, 12, 10), M.fur, 0, 0.056, 0.016);
    const beak = mesh(new THREE.ConeGeometry(0.004, 0.018, 8), std(0x3a3a40, 0.3, 0.3), 0, 0.054, 0.034);
    beak.rotation.x = Math.PI / 2;
    const eye = glow(0xff2020, 3);
    const tail = mesh(new THREE.BoxGeometry(0.014, 0.003, 0.03), M.fur, 0, 0.02, -0.03);
    tail.rotation.x = 0.4;
    const headGroup = new THREE.Group();
    headGroup.add(head, beak, mesh(new THREE.SphereGeometry(0.0022, 6, 6), eye, -0.007, 0.059, 0.024), mesh(new THREE.SphereGeometry(0.0022, 6, 6), eye, 0.007, 0.059, 0.024));
    for (const x of [-0.006, 0.006]) g.add(mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 0.014), M.iron, x, 0.007, 0.004));
    g.add(body, tail, headGroup);
    return { group: g, height: 0.075, animate: (t) => (headGroup.rotation.y = Math.sin(t * 0.7) * 0.5 + (Math.sin(t * 3.1) > 0.95 ? 0.3 : 0)) };
  },
  zinnsoldat() {
    const g = new THREE.Group();
    const tin = std(0x9a9aa6, 0.35, 0.8);
    g.add(mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.005, 16), tin, 0, 0.0025, 0));
    for (const x of [-0.005, 0.005]) g.add(mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.025), std(0x1a2a6a, 0.5), x, 0.017, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.009, 0.01, 0.026), std(0xb81c28, 0.5), 0, 0.042, 0));
    g.add(mesh(new THREE.SphereGeometry(0.0075, 12, 10), std(0xf1c7a0, 0.6), 0, 0.061, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.0075, 0.007, 0.018), M.black, 0, 0.076, 0));
    const rifle = mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 0.05), M.darkWood, 0.012, 0.05, 0.004);
    g.add(rifle);
    return { group: g, height: 0.09 };
  },
  totenkopf() {
    const g = new THREE.Group();
    const skull = mesh(new THREE.SphereGeometry(0.024, 18, 14), M.bone, 0, 0.034, 0);
    skull.scale.set(1, 0.95, 1.1);
    const jaw = mesh(new THREE.BoxGeometry(0.026, 0.012, 0.02), M.bone, 0, 0.013, 0.012);
    const eyeMat = glow(0xff1a1a, 3);
    const holeMat = std(0x0a0606, 1);
    g.add(skull, jaw);
    for (const x of [-0.009, 0.009]) {
      g.add(mesh(new THREE.SphereGeometry(0.0065, 10, 8), holeMat, x, 0.036, 0.021));
      g.add(mesh(new THREE.SphereGeometry(0.0022, 6, 6), eyeMat, x, 0.036, 0.025));
    }
    g.add(mesh(new THREE.ConeGeometry(0.003, 0.007, 3), holeMat, 0, 0.026, 0.026));
    for (let i = -2; i <= 2; i++) g.add(mesh(new THREE.BoxGeometry(0.003, 0.004, 0.002), M.white, i * 0.004, 0.016, 0.023));
    return { group: g, height: 0.065 };
  },
  winkekatze() {
    const g = new THREE.Group();
    const body = mesh(new THREE.CylinderGeometry(0.02, 0.024, 0.04, 18), M.porcelain, 0, 0.02, 0);
    const head = mesh(new THREE.SphereGeometry(0.021, 16, 12), M.porcelain, 0, 0.057, 0.002);
    head.scale.set(1.1, 0.95, 1);
    const collar = mesh(new THREE.TorusGeometry(0.019, 0.003, 6, 20), M.red, 0, 0.041, 0);
    collar.rotation.x = Math.PI / 2;
    const bell = mesh(new THREE.SphereGeometry(0.0045, 10, 8), M.gold, 0, 0.037, 0.021);
    const earMat = std(0xf2a0b0, 0.5);
    g.add(body, head, collar, bell);
    for (const x of [-0.012, 0.012]) g.add(mesh(new THREE.ConeGeometry(0.007, 0.012, 6), earMat, x, 0.077, 0));
    for (const x of [-0.008, 0.008]) g.add(mesh(new THREE.SphereGeometry(0.0022, 6, 6), M.black, x, 0.06, 0.02));
    const armPivot = new THREE.Group();
    armPivot.position.set(0.018, 0.045, 0.006);
    const arm = mesh(new THREE.CapsuleGeometry(0.006, 0.02, 4, 8), M.porcelain, 0, 0.012, 0);
    armPivot.add(arm);
    g.add(armPivot, mesh(new THREE.SphereGeometry(0.009, 10, 8), std(0xe0b44a, 0.3, 0.8), -0.013, 0.022, 0.018));
    return { group: g, height: 0.09, animate: (t) => (armPivot.rotation.x = -0.3 + Math.sin(t * 3) * 0.5) };
  },
  magnet() {
    const g = new THREE.Group();
    const u = mesh(new THREE.TorusGeometry(0.022, 0.008, 10, 20, Math.PI), std(0xc8202c, 0.4), 0, 0.045, 0);
    u.rotation.z = Math.PI;
    g.add(u);
    for (const x of [-0.022, 0.022]) {
      g.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.02), std(0xc8202c, 0.4), x, 0.035, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.0082, 0.0082, 0.01), M.silver, x, 0.02, 0));
    }
    return { group: g, height: 0.075, animate: (t) => (g.rotation.y = Math.sin(t * 0.6) * 0.3) };
  },
  taschenuhr() {
    const g = new THREE.Group();
    const casing = mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.008, 28), M.gold, 0, 0.03, 0);
    casing.rotation.x = Math.PI / 2 - 0.25;
    const face = mesh(new THREE.CircleGeometry(0.021, 28), new THREE.MeshStandardMaterial({ map: clockTexture(), roughness: 0.4 }), 0, 0.031, 0.0045);
    face.rotation.x = -0.25;
    const crown = mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.006), M.gold, 0, 0.057, -0.005);
    const ring = mesh(new THREE.TorusGeometry(0.006, 0.0015, 6, 12), M.gold, 0, 0.064, -0.006);
    g.add(casing, face, crown, ring);
    for (let i = 0; i < 5; i++) {
      const link = mesh(new THREE.TorusGeometry(0.004, 0.001, 4, 8), M.gold, -0.015 - i * 0.006, 0.003, 0.01 + Math.sin(i) * 0.004);
      link.rotation.x = Math.PI / 2 + (i % 2) * 0.8;
      g.add(link);
    }
    return { group: g, height: 0.075 };
  },
  goldbarren() {
    const g = new THREE.Group();
    const bar = () => new THREE.CylinderGeometry(0.012, 0.016, 0.012, 4);
    const positions: [number, number, number][] = [[-0.014, 0.006, 0], [0.014, 0.006, 0], [0, 0.018, 0]];
    for (const [x, y, z] of positions) {
      const b = mesh(bar(), M.gold, x, y, z);
      b.rotation.y = Math.PI / 4;
      b.scale.set(1, 1, 2);
      g.add(b);
    }
    return { group: g, height: 0.04 };
  },
  police() {
    const g = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const sheet = mesh(new THREE.BoxGeometry(0.05, 0.0015, 0.065), M.paper, (i % 2) * 0.002, 0.001 + i * 0.0016, 0);
      sheet.rotation.y = (i - 1.5) * 0.06;
      g.add(sheet);
    }
    g.add(mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.003, 16), std(0x9a1020, 0.4), 0.012, 0.009, 0.018));
    const pen = mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.06), M.black, -0.01, 0.01, 0);
    pen.rotation.z = Math.PI / 2;
    pen.rotation.y = 0.5;
    g.add(pen);
    return { group: g, height: 0.03 };
  },
  zigarre() {
    const g = new THREE.Group();
    const tray = mesh(new THREE.CylinderGeometry(0.028, 0.024, 0.01, 20), new THREE.MeshPhysicalMaterial({ color: 0x9ab8c8, transparent: true, opacity: 0.6, roughness: 0.1 }), 0, 0.005, 0);
    const cigar = mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.06, 10), std(0x5a3418, 0.8), 0.01, 0.014, 0);
    cigar.rotation.z = Math.PI / 2 - 0.15;
    const band = mesh(new THREE.CylinderGeometry(0.0043, 0.0043, 0.006, 10), M.gold, -0.005, 0.012, 0);
    band.rotation.z = Math.PI / 2 - 0.15;
    const tip = mesh(new THREE.SphereGeometry(0.0042, 8, 6), glow(0xff5a1a, 2.5), 0.04, 0.019, 0);
    g.add(tray, cigar, band, tip);
    return { group: g, height: 0.04, animate: (t) => ((tip.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.5 + Math.sin(t * 2.2) * 1) };
  },
  fernglas() {
    const g = new THREE.Group();
    for (const x of [-0.011, 0.011]) {
      const tube = mesh(new THREE.CylinderGeometry(0.009, 0.007, 0.03, 14), M.black, x, 0.04, 0);
      tube.rotation.x = Math.PI / 2;
      const rim = mesh(new THREE.TorusGeometry(0.009, 0.0015, 6, 14), M.gold, x, 0.04, 0.015);
      g.add(tube, rim);
    }
    g.add(mesh(new THREE.BoxGeometry(0.01, 0.004, 0.004), M.gold, 0, 0.04, 0));
    const stick = mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.045), M.gold, 0.02, 0.018, 0);
    stick.rotation.z = -0.3;
    g.add(stick);
    return { group: g, height: 0.055 };
  },
  spiegel() {
    const g = new THREE.Group();
    const frame = mesh(new THREE.TorusGeometry(0.02, 0.003, 8, 24), M.gold, 0, 0.055, 0);
    frame.scale.set(1, 1.3, 1);
    const glass = mesh(new THREE.CircleGeometry(0.02, 24), new THREE.MeshStandardMaterial({ color: 0xdde8f0, metalness: 1, roughness: 0.02 }), 0, 0.055, 0.001);
    glass.scale.set(1, 1.3, 1);
    const handle = mesh(new THREE.CylinderGeometry(0.003, 0.004, 0.03), M.gold, 0, 0.015, 0);
    const pivot = new THREE.Group();
    pivot.add(frame, glass, handle);
    g.add(pivot);
    return { group: g, height: 0.085, animate: (t) => (pivot.rotation.y = Math.sin(t * 0.9) * 0.6) };
  },
  kristallkugel() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.014, 0.02, 0.012, 16), M.brass, 0, 0.006, 0));
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const claw = mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 0.016), M.brass, Math.cos(a) * 0.012, 0.017, Math.sin(a) * 0.012);
      claw.rotation.z = Math.cos(a) * 0.4;
      claw.rotation.x = -Math.sin(a) * 0.4;
      g.add(claw);
    }
    const orb = mesh(new THREE.SphereGeometry(0.022, 24, 18), new THREE.MeshPhysicalMaterial({ color: 0xd8c8ff, transparent: true, opacity: 0.45, roughness: 0, clearcoat: 1 }), 0, 0.04, 0);
    const core = mesh(new THREE.SphereGeometry(0.008, 12, 10), glow(0xb48cff, 3), 0, 0.04, 0);
    core.castShadow = false;
    g.add(orb, core);
    return { group: g, height: 0.07, animate: (t) => core.scale.setScalar(0.8 + Math.sin(t * 2) * 0.3) };
  },
  goldkugel() {
    const g = new THREE.Group();
    const cushion = mesh(new THREE.BoxGeometry(0.04, 0.012, 0.04), M.velvet, 0, 0.006, 0);
    const ball = mesh(new THREE.SphereGeometry(0.011, 20, 16), std(0xffd24a, 0.12, 1, { emissive: 0x5a3a00, emissiveIntensity: 0.6 }), 0, 0.022, 0);
    for (const [x, z] of [[-0.02, -0.02], [0.02, -0.02], [-0.02, 0.02], [0.02, 0.02]]) g.add(mesh(new THREE.SphereGeometry(0.003, 6, 6), M.gold, x, 0.012, z));
    g.add(cushion, ball);
    return { group: g, height: 0.04, animate: (t) => (ball.position.y = 0.022 + Math.abs(Math.sin(t * 2)) * 0.004) };
  },
  teufel() {
    const g = new THREE.Group();
    const skin = std(0xb01818, 0.4, 0.1);
    g.add(mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.005, 16), M.black, 0, 0.0025, 0));
    g.add(mesh(new THREE.ConeGeometry(0.014, 0.045, 12), skin, 0, 0.028, 0));
    g.add(mesh(new THREE.SphereGeometry(0.011, 14, 10), skin, 0, 0.058, 0));
    for (const x of [-0.007, 0.007]) {
      const horn = mesh(new THREE.ConeGeometry(0.003, 0.012, 6), std(0xf0e0c0, 0.4), x, 0.07, 0);
      horn.rotation.z = -x * 40;
      g.add(horn, mesh(new THREE.SphereGeometry(0.0018, 6, 6), glow(0xffe040, 3), x * 0.6, 0.06, 0.01));
    }
    const fork = mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 0.07), M.iron, 0.016, 0.035, 0.004);
    g.add(fork);
    for (const dx of [-0.004, 0, 0.004]) g.add(mesh(new THREE.CylinderGeometry(0.0009, 0.0009, 0.01), M.iron, 0.016 + dx, 0.073, 0.004));
    return { group: g, height: 0.085, animate: (t) => (g.rotation.y = Math.sin(t * 0.5) * 0.15) };
  },
};

Object.assign(BUILDERS, {
  walkman(): Figurine {
    const g = new THREE.Group();
    const body = mesh(rbox(0.058, 0.084, 0.022, 0.004), std(0x2a4a8a, 0.35, 0.6), 0, 0.042, 0);
    const window = mesh(new THREE.PlaneGeometry(0.04, 0.026), std(0x101014, 0.1, 0, { transparent: true, opacity: 0.8 }), 0, 0.05, 0.0115);
    const label = mesh(new THREE.PlaneGeometry(0.046, 0.012), new THREE.MeshStandardMaterial({ map: canvasTex(128, 32, (c) => {
      c.fillStyle = '#d8d8dc';
      c.fillRect(0, 0, 128, 32);
      c.fillStyle = '#1a1a1a';
      c.font = '700 20px Arial Narrow, Arial, sans-serif';
      c.fillText('WALKMAN', 10, 23);
    }), roughness: 0.4 }), 0, 0.074, 0.0115);
    const band = mesh(new THREE.TorusGeometry(0.035, 0.0025, 8, 24, Math.PI), M.silver, 0, 0.09, -0.005);
    g.add(body, window, label, band);
    for (const x of [-0.035, 0.035]) {
      const pad = mesh(new THREE.SphereGeometry(0.013, 14, 10), std(0xff6a1a, 0.95), x, 0.088, -0.005);
      pad.scale.set(0.6, 1, 1);
      g.add(pad);
    }
    for (const x of [-0.012, 0.012]) g.add(mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.003, 12), M.white, x, 0.05, 0.012).rotateX(Math.PI / 2));
    return { group: g, height: 0.11 };
  },
  pager(): Figurine {
    const g = new THREE.Group();
    const body = mesh(rbox(0.05, 0.034, 0.016, 0.005), std(0x121214, 0.5), 0, 0.017, 0);
    body.rotation.x = -0.9;
    body.position.set(0, 0.018, 0);
    const lcd = mesh(new THREE.PlaneGeometry(0.034, 0.012), new THREE.MeshStandardMaterial({ map: canvasTex(128, 48, (c) => {
      c.fillStyle = '#6a8a4a';
      c.fillRect(0, 0, 128, 48);
      c.fillStyle = '#1a2a10';
      c.font = '700 34px monospace';
      c.fillText('07734', 8, 36);
    }), emissive: 0x3a5a2a, emissiveIntensity: 0.6, roughness: 0.3 }), 0, 0.0081, 0.004);
    body.add(lcd);
    lcd.position.set(0, 0.004, 0.0081);
    lcd.rotation.set(0, 0, 0);
    g.add(body);
    return { group: g, height: 0.05, animate: (t) => ((lcd.material as THREE.MeshStandardMaterial).emissiveIntensity = Math.sin(t * 6) > 0.6 ? 1.4 : 0.5) };
  },
  zippo(): Figurine {
    const g = new THREE.Group();
    const body = mesh(rbox(0.022, 0.034, 0.013, 0.003), M.silver, 0, 0.017, 0);
    const lidPivot = new THREE.Group();
    lidPivot.position.set(0.011, 0.034, 0);
    const lid = mesh(rbox(0.022, 0.014, 0.013, 0.003), M.silver, -0.011, 0.007, 0);
    lidPivot.add(lid);
    lidPivot.rotation.z = -2.2;
    const chimney = mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.01, 12, 1, true), M.silver, 0, 0.039, 0);
    const flame = mesh(new THREE.ConeGeometry(0.0045, 0.02, 10), glow(0xffa030, 3), 0, 0.054, 0);
    flame.castShadow = false;
    g.add(body, lidPivot, chimney, flame);
    return { group: g, height: 0.07, animate: (t) => flame.scale.set(1, 0.8 + Math.sin(t * 19) * 0.12 + Math.sin(t * 5.1) * 0.1, 1) };
  },
  hasenpfote(): Figurine {
    const g = new THREE.Group();
    const fur = mesh(new THREE.CapsuleGeometry(0.011, 0.03, 8, 14), std(0xe8dcc8, 1), 0, 0.03, 0);
    fur.rotation.z = 0.35;
    const cap = mesh(new THREE.CylinderGeometry(0.009, 0.011, 0.012, 16), M.gold, -0.008, 0.055, 0);
    cap.rotation.z = 0.35;
    const ring = mesh(new THREE.TorusGeometry(0.009, 0.0016, 8, 20), M.gold, -0.013, 0.069, 0);
    g.add(fur, cap, ring);
    for (let i = 0; i < 5; i++) {
      const tuft = mesh(new THREE.SphereGeometry(0.006, 8, 6), std(0xf2e8d8, 1), 0.004 + Math.sin(i) * 0.006, 0.012 + i * 0.006, Math.cos(i * 2) * 0.007);
      g.add(tuft);
    }
    return { group: g, height: 0.08 };
  },
  kassette(): Figurine {
    const g = new THREE.Group();
    const tape = new THREE.Group();
    tape.add(mesh(rbox(0.064, 0.041, 0.009, 0.002), std(0x1a1a1c, 0.4), 0, 0, 0));
    const label = mesh(new THREE.PlaneGeometry(0.056, 0.024), new THREE.MeshStandardMaterial({ map: canvasTex(224, 96, (c) => {
      c.fillStyle = '#f2ead6';
      c.fillRect(0, 0, 224, 96);
      c.fillStyle = '#e04a2a';
      c.fillRect(0, 0, 224, 18);
      c.fillStyle = '#20206a';
      c.font = 'italic 700 26px Georgia, serif';
      c.fillText("Mixtape '86", 16, 56);
      c.fillStyle = '#1a1a1a';
      c.beginPath();
      c.roundRect(62, 64, 100, 26, 12);
      c.fill();
    }), roughness: 0.7 }), 0, 0.003, 0.0046);
    tape.add(label);
    for (const x of [-0.016, 0.016]) tape.add(mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.0095, 12), M.white, x, -0.003, 0).rotateX(Math.PI / 2));
    tape.rotation.x = -0.35;
    tape.position.set(0, 0.022, 0);
    g.add(tape, mesh(new THREE.BoxGeometry(0.07, 0.004, 0.02), M.darkWood, 0, 0.002, -0.008));
    return { group: g, height: 0.05 };
  },
  zauberwuerfel(): Figurine {
    const g = new THREE.Group();
    const colors = [0xffffff, 0xffd200, 0xc8102e, 0xff6a00, 0x0051ba, 0x009e60];
    const cube = new THREE.Group();
    const s = 0.013;
    const layers: THREE.Group[] = [new THREE.Group(), new THREE.Group(), new THREE.Group()];
    for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
      const cubie = new THREE.Group();
      cubie.position.set(x * s, y * s, z * s);
      cubie.add(mesh(rbox(s * 0.98, s * 0.98, s * 0.98, 0.0015), std(0x0a0a0a, 0.5), 0, 0, 0));
      const faces: [number, THREE.Vector3, THREE.Euler][] = [
        [x === 1 ? 2 : -1, new THREE.Vector3(s * 0.5, 0, 0), new THREE.Euler(0, Math.PI / 2, 0)],
        [x === -1 ? 3 : -1, new THREE.Vector3(-s * 0.5, 0, 0), new THREE.Euler(0, -Math.PI / 2, 0)],
        [y === 1 ? 0 : -1, new THREE.Vector3(0, s * 0.5, 0), new THREE.Euler(-Math.PI / 2, 0, 0)],
        [y === -1 ? 1 : -1, new THREE.Vector3(0, -s * 0.5, 0), new THREE.Euler(Math.PI / 2, 0, 0)],
        [z === 1 ? 5 : -1, new THREE.Vector3(0, 0, s * 0.5), new THREE.Euler(0, 0, 0)],
        [z === -1 ? 4 : -1, new THREE.Vector3(0, 0, -s * 0.5), new THREE.Euler(0, Math.PI, 0)],
      ];
      for (const [c, p, r] of faces) {
        if (c < 0) continue;
        const st = mesh(new THREE.PlaneGeometry(s * 0.82, s * 0.82), std(colors[c], 0.3), p.x * 1.02, p.y * 1.02, p.z * 1.02, false);
        st.rotation.copy(r);
        cubie.add(st);
      }
      layers[y + 1].add(cubie);
    }
    cube.add(...layers);
    layers[2].rotation.y = 0.35;
    cube.position.y = 0.021;
    cube.rotation.y = 0.5;
    g.add(cube);
    return { group: g, height: 0.045, animate: (t) => (layers[2].rotation.y = 0.35 + Math.sin(t * 0.8) * 0.3) };
  },
  polaroid(): Figurine {
    const g = new THREE.Group();
    g.add(mesh(rbox(0.07, 0.04, 0.05, 0.006), std(0xf4f0e8, 0.45), 0, 0.02, 0));
    g.add(mesh(rbox(0.07, 0.03, 0.035, 0.006), std(0x1a1a1a, 0.5), 0, 0.052, -0.006));
    const stripe = mesh(new THREE.PlaneGeometry(0.012, 0.038), new THREE.MeshStandardMaterial({ map: canvasTex(16, 64, (c) => {
      ['#e0302a', '#ff8a1a', '#ffd21a', '#3aa84a', '#2a6ad8'].forEach((col, i) => {
        c.fillStyle = col;
        c.fillRect(0, i * 13, 16, 13);
      });
    }) }), 0, 0.02, 0.0252);
    const lens = mesh(new THREE.CylinderGeometry(0.012, 0.013, 0.012, 24), M.black, 0.018, 0.045, 0.012);
    lens.rotation.x = Math.PI / 2;
    const glass = mesh(new THREE.CircleGeometry(0.009, 24), std(0x2a3a5a, 0.02, 0.5), 0.018, 0.045, 0.0185);
    const photo = mesh(new THREE.BoxGeometry(0.036, 0.0015, 0.042), M.white, 0, 0.0008, 0.05);
    const img = mesh(new THREE.PlaneGeometry(0.03, 0.03), new THREE.MeshStandardMaterial({ map: canvasTex(64, 64, (c) => {
      const grad = c.createLinearGradient(0, 0, 0, 64);
      grad.addColorStop(0, '#3a2a4a');
      grad.addColorStop(1, '#c86a3a');
      c.fillStyle = grad;
      c.fillRect(0, 0, 64, 64);
      c.fillStyle = '#1a0a0a';
      c.fillRect(24, 22, 16, 30);
    }), roughness: 0.6 }), 0, 0.0017, 0.047, false);
    img.rotation.x = -Math.PI / 2;
    g.add(stripe, lens, glass, photo, img);
    return { group: g, height: 0.07 };
  },
  voodoo(): Figurine {
    const g = new THREE.Group();
    const burlap = new THREE.MeshStandardMaterial({ map: canvasTex(64, 64, (c) => {
      c.fillStyle = '#8a6a3a';
      c.fillRect(0, 0, 64, 64);
      c.strokeStyle = '#6a4a22';
      for (let i = 0; i < 64; i += 4) {
        c.beginPath();
        c.moveTo(i, 0);
        c.lineTo(i, 64);
        c.moveTo(0, i);
        c.lineTo(64, i);
        c.stroke();
      }
    }), roughness: 1 });
    const body = mesh(new THREE.CapsuleGeometry(0.012, 0.028, 6, 12), burlap, 0, 0.03, 0);
    const head = mesh(new THREE.SphereGeometry(0.014, 14, 10), burlap, 0, 0.066, 0);
    g.add(body, head);
    for (const side of [-1, 1]) {
      const arm = mesh(new THREE.CapsuleGeometry(0.004, 0.02, 4, 8), burlap, side * 0.018, 0.04, 0);
      arm.rotation.z = side * 1.1;
      const leg = mesh(new THREE.CapsuleGeometry(0.005, 0.016, 4, 8), burlap, side * 0.007, 0.008, 0);
      g.add(arm, leg);
      const eye = mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.002, 10), M.black, side * 0.005, 0.068, 0.013);
      eye.rotation.x = Math.PI / 2;
      g.add(eye);
    }
    const pinColors = [0xff2020, 0x20a0ff, 0xffd020];
    pinColors.forEach((c, i) => {
      const pin = new THREE.Group();
      pin.add(mesh(new THREE.CylinderGeometry(0.0006, 0.0006, 0.03), M.silver, 0, 0.015, 0));
      pin.add(mesh(new THREE.SphereGeometry(0.0022, 8, 6), std(c, 0.3), 0, 0.03, 0));
      pin.position.set(-0.006 + i * 0.006, 0.03 + i * 0.012, 0.008);
      pin.rotation.set(0.8, 0, (i - 1) * 0.5);
      g.add(pin);
    });
    return { group: g, height: 0.09, animate: (t) => (g.rotation.z = Math.sin(t * 0.9) * 0.05) };
  },
  goldkette(): Figurine {
    const g = new THREE.Group();
    const n = 26;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const link = mesh(new THREE.TorusGeometry(0.0035, 0.0011, 6, 12), M.gold, Math.cos(a) * 0.03, 0.002, Math.sin(a) * 0.022);
      link.rotation.set(Math.PI / 2, 0, a + (i % 2) * Math.PI / 2);
      g.add(link);
    }
    const medal = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.003, 24), M.gold, 0, 0.012, 0.028);
    medal.rotation.x = 1.2;
    const sign = mesh(new THREE.PlaneGeometry(0.014, 0.014), new THREE.MeshStandardMaterial({ map: canvasTex(64, 64, (c) => {
      c.fillStyle = '#8a6a1a';
      c.font = '700 54px Georgia, serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('$', 32, 36);
    }), transparent: true, metalness: 1, roughness: 0.3 }), 0, 0.0126, 0.0296, false);
    sign.rotation.x = 1.2 - Math.PI / 2;
    g.add(medal, sign);
    return { group: g, height: 0.03 };
  },
});

/** Figurines backed by real models, registered once they are loaded. */
const MODEL_FIGURINES = new Map<string, () => Figurine>();
export function registerModelFigurine(def: string, build: () => Figurine): void {
  MODEL_FIGURINES.set(def, build);
}

export function buildFigurine(def: string): Figurine {
  const model = MODEL_FIGURINES.get(def);
  if (model) return model();
  const b = BUILDERS[def];
  if (b) return b();
  const g = new THREE.Group();
  g.add(mesh(new THREE.OctahedronGeometry(0.02), M.gold, 0, 0.03, 0));
  return { group: g, height: 0.05 };
}

/** Small box used in the showcase for wheel upgrades. */
export function buildUpgradeBox(color: string): Figurine {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.05, 0.035, 0.05), std(0x3a1020, 0.6), 0, 0.0175, 0));
  g.add(mesh(new THREE.BoxGeometry(0.052, 0.008, 0.052), std(new THREE.Color(color).getHex(), 0.4, 0.3), 0, 0.03, 0));
  g.add(mesh(new THREE.BoxGeometry(0.008, 0.036, 0.052), std(new THREE.Color(color).getHex(), 0.4, 0.3), 0, 0.018, 0));
  return { group: g, height: 0.05 };
}
