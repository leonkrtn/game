import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeStatic } from './merge';

/** A talisman figurine as it stands on the table. Sizes are in meters (about 6–12 cm tall). */
export interface Figurine {
  group: THREE.Group;
  /** Idle animation, called every frame with the elapsed time. */
  animate?: (t: number) => void;
  /** Height of the figurine, for placing labels and effects above it. */
  height: number;
}

// ---- Materials --------------------------------------------------------------------------

type PhysParams = THREE.MeshPhysicalMaterialParameters;
const phys = (color: number, rough = 0.5, metal = 0, extra: PhysParams = {}) =>
  new THREE.MeshPhysicalMaterial({ color, roughness: rough, metalness: metal, ...extra });
const glow = (color: number, intensity = 2) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity });

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, color = true): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Seeded speckle noise for roughness and bump maps: wear, pores, grain. */
function speckle(seed: number, size = 128, lo = 90, hi = 200, blobs = 900): THREE.CanvasTexture {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  return canvasTex(size, size, (g) => {
    g.fillStyle = `rgb(${(lo + hi) / 2},${(lo + hi) / 2},${(lo + hi) / 2})`;
    g.fillRect(0, 0, size, size);
    for (let i = 0; i < blobs; i++) {
      const v = Math.floor(lo + rnd() * (hi - lo));
      g.fillStyle = `rgba(${v},${v},${v},0.5)`;
      g.beginPath();
      g.arc(rnd() * size, rnd() * size, 0.5 + rnd() * 2.5, 0, Math.PI * 2);
      g.fill();
    }
  }, false);
}

/** Wood grain: stripes that wobble, for turned and carved wooden parts. */
function grain(base: string, dark: string, seed = 3): THREE.CanvasTexture {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  return canvasTex(128, 128, (g) => {
    g.fillStyle = base;
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = dark;
    for (let i = 0; i < 26; i++) {
      g.globalAlpha = 0.25 + rnd() * 0.4;
      g.lineWidth = 0.6 + rnd() * 1.6;
      g.beginPath();
      const x0 = rnd() * 128;
      for (let y = 0; y <= 128; y += 8) g.lineTo(x0 + Math.sin(y * 0.05 + i) * 4 + rnd(), y);
      g.stroke();
    }
    g.globalAlpha = 1;
  });
}

const wear = speckle(7);
const pores = speckle(11, 128, 60, 220, 2400);

const M = {
  gold: phys(0xe6b84e, 0.22, 1, { roughnessMap: wear }),
  brass: phys(0xc9a04a, 0.3, 1, { roughnessMap: wear }),
  iron: phys(0x8a8a92, 0.5, 0.85, { roughnessMap: pores, bumpMap: pores, bumpScale: 0.4 }),
  rust: phys(0x6a3a22, 0.85, 0.3, { bumpMap: pores, bumpScale: 0.6 }),
  silver: phys(0xdadae4, 0.14, 1, { roughnessMap: wear }),
  chrome: phys(0xeef0f4, 0.06, 1),
  copper: phys(0xc8733c, 0.28, 1, { roughnessMap: wear }),
  wood: phys(0xffffff, 0.5, 0, { map: grain('#7a4424', '#3a1a08'), clearcoat: 0.5, clearcoatRoughness: 0.3 }),
  darkWood: phys(0xffffff, 0.35, 0, { map: grain('#3a1c0c', '#140602', 5), clearcoat: 0.8, clearcoatRoughness: 0.15 }),
  ebony: phys(0x121010, 0.25, 0, { clearcoat: 1, clearcoatRoughness: 0.08 }),
  black: phys(0x141418, 0.4, 0, { clearcoat: 0.4 }),
  plastic: phys(0x1a1a1e, 0.35, 0, { clearcoat: 0.6, clearcoatRoughness: 0.3 }),
  fur: phys(0x0b0b0e, 0.85, 0, { sheen: 1, sheenColor: new THREE.Color(0x3a3a50), sheenRoughness: 0.5, bumpMap: pores, bumpScale: 0.8 }),
  feather: phys(0x0c0c12, 0.45, 0, { sheen: 1, sheenColor: new THREE.Color(0x2a3a7a), sheenRoughness: 0.3, clearcoat: 0.4 }),
  white: phys(0xf2eee4, 0.4),
  porcelain: phys(0xfbf8f0, 0.18, 0, { clearcoat: 1, clearcoatRoughness: 0.05 }),
  bone: phys(0xe2d4b4, 0.65, 0, { bumpMap: pores, bumpScale: 0.5 }),
  red: phys(0xb81c28, 0.35, 0, { clearcoat: 0.7 }),
  lacquerRed: phys(0xa8141e, 0.2, 0, { clearcoat: 1, clearcoatRoughness: 0.05 }),
  wax: phys(0xa8101c, 0.45, 0, { sheen: 0.4, sheenColor: new THREE.Color(0xff6060) }),
  pink: phys(0xf2a0b0, 0.2, 0, { clearcoat: 1, clearcoatRoughness: 0.1 }),
  pinkInner: phys(0xe87890, 0.5),
  leaf: phys(0x3a9a3a, 0.45, 0, { sheen: 0.5, sheenColor: new THREE.Color(0x9aff9a), side: THREE.DoubleSide }),
  stem: phys(0x2f7a2a, 0.6),
  terracotta: phys(0xb4592e, 0.85, 0, { bumpMap: pores, bumpScale: 0.5 }),
  soil: phys(0x2a1a0c, 1, 0, { bumpMap: pores, bumpScale: 1 }),
  paper: phys(0xefe6cf, 0.9),
  velvet: phys(0x7a0e1e, 0.9, 0, { sheen: 1, sheenColor: new THREE.Color(0xff5070), sheenRoughness: 0.4 }),
  glass: phys(0xffffff, 0.02, 0, { transparent: true, opacity: 0.22, clearcoat: 1, depthWrite: false }),
  pearl: phys(0xf4ece8, 0.18, 0.1, { iridescence: 1, iridescenceIOR: 1.6, clearcoat: 1 }),
  cream: phys(0xf2e6c8, 0.35, 0, { clearcoat: 0.6 }),
};

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, cast = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = true;
  return m;
}

// ---- Shape helpers ---------------------------------------------------------------------

/** A turned part: [radius, height] pairs from bottom to top. */
function lathe(profile: [number, number][], mat: THREE.Material, segs = 36): THREE.Mesh {
  return mesh(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segs), mat);
}

/** A tube through points, for wires, tails, chains, stems. */
function tube(points: [number, number, number][], radius: number, mat: THREE.Material, segs = 40, radial = 8): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  return mesh(new THREE.TubeGeometry(curve, segs, radius, radial, false), mat);
}

/** A flat outline pushed into a slab with soft bevelled edges. */
function slab(shape: THREE.Shape, depth: number, mat: THREE.Material, bevel = 0.0012): THREE.Mesh {
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 24 });
  geo.translate(0, 0, -depth / 2);
  return mesh(geo, mat);
}

const rbox = (w: number, h: number, d: number, r: number) => new RoundedBoxGeometry(w, h, d, 4, r);
const sphere = (r: number, w = 24, h = 18) => new THREE.SphereGeometry(r, w, h);

/** Deforms a geometry's vertices in place. */
function shapeVerts(geo: THREE.BufferGeometry, fn: (v: THREE.Vector3) => void): THREE.BufferGeometry {
  const p = geo.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    fn(v);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Small turned ebony foot with a brass ring, for figurines that need a stand. */
function plinth(r: number, h = 0.008): THREE.Group {
  const g = new THREE.Group();
  g.add(lathe([[0, 0], [r, 0], [r + 0.001, h * 0.3], [r * 0.96, h * 0.7], [r * 0.9, h], [0, h]], M.ebony, 40));
  const ring = mesh(new THREE.TorusGeometry(r * 0.97, 0.0009, 6, 48), M.brass, 0, h * 0.62, 0, false);
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
  return g;
}

/** A flame in two layers: a bright core inside a soft glow. */
function flame(size: number): THREE.Group {
  const g = new THREE.Group();
  const outer = mesh(new THREE.SphereGeometry(size * 0.5, 16, 12), new THREE.MeshBasicMaterial({ color: 0xff8a20, transparent: true, opacity: 0.55, toneMapped: false, depthWrite: false }), 0, size * 0.55, 0, false);
  outer.scale.set(1, 2.1, 1);
  const inner = mesh(new THREE.SphereGeometry(size * 0.28, 12, 10), new THREE.MeshBasicMaterial({ color: 0xfff0b0, toneMapped: false }), 0, size * 0.42, 0, false);
  inner.scale.set(1, 1.9, 1);
  const blue = mesh(new THREE.SphereGeometry(size * 0.22, 10, 8), new THREE.MeshBasicMaterial({ color: 0x4a7aff, transparent: true, opacity: 0.6, toneMapped: false, depthWrite: false }), 0, size * 0.12, 0, false);
  blue.scale.set(1, 0.8, 1);
  g.add(outer, inner, blue);
  g.userData.keep = true;
  return g;
}

const flicker = (f: THREE.Group, t: number, speed = 1) => {
  f.scale.set(1, 0.88 + Math.sin(t * 17 * speed) * 0.08 + Math.sin(t * 7.3) * 0.06, 1);
  f.rotation.z = Math.sin(t * 5) * 0.08;
};

/** Canvas face for a die: 1–6 pips. */
function dieFace(n: number): THREE.CanvasTexture {
  const spots: Record<number, [number, number][]> = {
    1: [[0.5, 0.5]], 2: [[0.28, 0.28], [0.72, 0.72]], 3: [[0.26, 0.26], [0.5, 0.5], [0.74, 0.74]],
    4: [[0.28, 0.28], [0.72, 0.28], [0.28, 0.72], [0.72, 0.72]], 5: [[0.26, 0.26], [0.74, 0.26], [0.5, 0.5], [0.26, 0.74], [0.74, 0.74]],
    6: [[0.28, 0.24], [0.72, 0.24], [0.28, 0.5], [0.72, 0.5], [0.28, 0.76], [0.72, 0.76]],
  };
  return canvasTex(128, 128, (g) => {
    g.fillStyle = '#b8101c';
    g.fillRect(0, 0, 128, 128);
    for (const [x, y] of spots[n]) {
      const grad = g.createRadialGradient(x * 128 - 2, y * 128 - 2, 1, x * 128, y * 128, 12);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(1, '#d8d0c8');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(x * 128, y * 128, 11, 0, Math.PI * 2);
      g.fill();
    }
  });
}

type Builder = () => Figurine;

// ---- Figurines -------------------------------------------------------------------------

const BUILDERS: Record<string, Builder> = {
  hufeisen() {
    const g = new THREE.Group();
    // A worn iron shoe standing upright in a little oak block, open end up for luck.
    const s = new THREE.Shape();
    const R = 0.032, r = 0.02;
    s.absarc(0, 0, R, Math.PI * -0.12, Math.PI * 1.12, false);
    s.lineTo(Math.cos(Math.PI * 1.12) * r - 0.004, Math.sin(Math.PI * 1.12) * r);
    s.absarc(0, 0, r, Math.PI * 1.12, Math.PI * -0.12, true);
    s.closePath();
    const shoe = slab(s, 0.007, M.iron, 0.0015);
    shoe.rotation.z = Math.PI;
    shoe.position.y = 0.05;
    g.add(shoe);
    // Nail holes and the heel calks.
    for (let i = 0; i < 8; i++) {
      const a = Math.PI * (-0.02 + (i < 4 ? i : i + 1) * 0.115);
      const hole = mesh(new THREE.BoxGeometry(0.0025, 0.004, 0.009), M.black, Math.cos(a) * 0.026, 0.05 - Math.sin(a) * 0.026, 0, false);
      hole.rotation.z = -a;
      g.add(hole);
    }
    for (const x of [-0.027, 0.027]) g.add(mesh(rbox(0.009, 0.006, 0.01, 0.0015), M.rust, x, 0.064, 0));
    g.add(mesh(rbox(0.07, 0.022, 0.03, 0.004), M.wood, 0, 0.011, 0));
    g.add(mesh(new THREE.BoxGeometry(0.058, 0.002, 0.012), M.black, 0, 0.0225, 0, false));
    const plaque = mesh(new THREE.PlaneGeometry(0.036, 0.009), phys(0xffffff, 0.3, 1, { map: canvasTex(128, 32, (c) => {
      c.fillStyle = '#c9a04a';
      c.fillRect(0, 0, 128, 32);
      c.fillStyle = '#3a2408';
      c.font = 'italic 700 20px Georgia, serif';
      c.textAlign = 'center';
      c.fillText('Glück auf', 64, 23);
    }) }), 0, 0.011, 0.0152, false);
    g.add(plaque);
    return { group: g, height: 0.09 };
  },

  pfennig() {
    const g = new THREE.Group();
    // A big copper penny on a brass easel.
    const face = canvasTex(128, 128, (c) => {
      const grad = c.createRadialGradient(56, 50, 6, 64, 64, 64);
      grad.addColorStop(0, '#f0a070');
      grad.addColorStop(1, '#9a4a20');
      c.fillStyle = grad;
      c.fillRect(0, 0, 128, 128);
      c.strokeStyle = '#6a2a0a';
      c.lineWidth = 3;
      c.beginPath();
      c.arc(64, 64, 52, 0, Math.PI * 2);
      c.stroke();
      c.fillStyle = '#5a2008';
      c.font = '700 64px Georgia, serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('1', 64, 58);
      c.font = '700 14px Georgia, serif';
      c.fillText('PFENNIG · 1950', 64, 100);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        c.beginPath();
        c.ellipse(64 + Math.cos(a) * 40, 64 + Math.sin(a) * 40, 5, 2, a, 0, Math.PI * 2);
        c.fill();
      }
    });
    const coinMat = phys(0xffffff, 0.3, 1, { map: face, bumpMap: face, bumpScale: 1.2 });
    const coin = new THREE.Group();
    const rim = lathe([[0.02, -0.0025], [0.0265, -0.0025], [0.028, -0.0012], [0.028, 0.0012], [0.0265, 0.0025], [0.02, 0.0025]], M.copper, 48);
    rim.rotation.x = Math.PI / 2;
    const front = mesh(new THREE.CircleGeometry(0.0262, 48), coinMat, 0, 0, 0.0021);
    const back = mesh(new THREE.CircleGeometry(0.0262, 48), coinMat, 0, 0, -0.0021);
    back.rotation.y = Math.PI;
    coin.add(rim, front, back);
    coin.position.y = 0.043;
    coin.userData.keep = true;
    g.add(plinth(0.03), coin);
    for (const x of [-0.012, 0.012]) {
      const leg = tube([[x, 0.008, -0.006], [x * 1.1, 0.02, -0.008], [x * 0.8, 0.034, -0.006]], 0.0012, M.brass, 12, 6);
      g.add(leg);
      g.add(mesh(new THREE.BoxGeometry(0.006, 0.003, 0.006), M.brass, x, 0.018, 0.004));
    }
    return { group: g, height: 0.08, animate: (t) => (coin.rotation.y = Math.sin(t * 1.2) * 0.5) };
  },

  kerze() {
    const g = new THREE.Group();
    // Turned brass candlestick with a drip dish, a red candle with runs of wax, a living flame.
    g.add(lathe([[0, 0], [0.03, 0], [0.031, 0.002], [0.027, 0.004], [0.012, 0.007], [0.008, 0.012], [0.01, 0.016], [0.006, 0.02], [0.006, 0.03], [0.009, 0.033], [0.006, 0.036], [0.018, 0.038], [0.02, 0.041], [0.011, 0.04], [0, 0.04]], M.brass, 48));
    const ring = mesh(new THREE.TorusGeometry(0.012, 0.002, 8, 24, Math.PI * 1.4), M.brass, 0.028, 0.012, 0);
    ring.rotation.set(0, 0, Math.PI / 2);
    g.add(ring);
    const candle = new THREE.CylinderGeometry(0.0105, 0.011, 0.058, 28, 12);
    shapeVerts(candle, (v) => {
      // Melted top edge and slight irregularity.
      const a = Math.atan2(v.z, v.x);
      if (v.y > 0.026) v.y -= (Math.sin(a * 3) * 0.5 + 0.5) * 0.004;
      const k = 1 + Math.sin(a * 5 + v.y * 80) * 0.02;
      v.x *= k;
      v.z *= k;
    });
    g.add(mesh(candle, M.wax, 0, 0.069, 0));
    for (const [a, len] of [[0.3, 0.02], [1.9, 0.034], [3.5, 0.014], [4.8, 0.026]]) {
      const x = Math.cos(a) * 0.0108, z = Math.sin(a) * 0.0108;
      g.add(tube([[x, 0.097, z], [x * 1.05, 0.097 - len * 0.5, z * 1.05], [x * 1.1, 0.097 - len, z * 1.1]], 0.0022, M.wax, 10, 8));
      g.add(mesh(sphere(0.0028, 10, 8), M.wax, x * 1.1, 0.097 - len, z * 1.1));
    }
    const pool = mesh(new THREE.CylinderGeometry(0.019, 0.02, 0.003, 24), M.wax, 0.003, 0.0415, 0);
    g.add(pool);
    g.add(mesh(new THREE.CylinderGeometry(0.0006, 0.0006, 0.006), M.black, 0, 0.098, 0));
    const f = flame(0.012);
    f.position.y = 0.099;
    g.add(f);
    return { group: g, height: 0.12, animate: (t) => flicker(f, t) };
  },

  katze() {
    const g = new THREE.Group();
    // A sitting black cat: haunches, chest, front legs, a curled tail and green eyes.
    const body = mesh(sphere(0.022), M.fur, 0, 0.026, -0.004);
    body.scale.set(1, 1.25, 1.1);
    const chest = mesh(sphere(0.015), M.fur, 0, 0.042, 0.008);
    chest.scale.set(1, 1.3, 0.9);
    g.add(body, chest);
    for (const x of [-0.014, 0.014]) {
      const haunch = mesh(sphere(0.013), M.fur, x, 0.014, -0.006);
      haunch.scale.set(0.8, 1, 1.3);
      g.add(haunch);
      g.add(mesh(new THREE.CapsuleGeometry(0.0045, 0.03, 6, 10), M.fur, x * 0.5, 0.019, 0.017));
      const paw = mesh(sphere(0.0055, 12, 8), M.fur, x * 0.5, 0.004, 0.02);
      paw.scale.set(1, 0.6, 1.3);
      g.add(paw);
    }
    const head = new THREE.Group();
    head.position.set(0, 0.07, 0.01);
    const skull = mesh(sphere(0.015), M.fur, 0, 0, 0);
    skull.scale.set(1.08, 0.95, 1);
    const muzzle = mesh(sphere(0.007, 16, 12), M.fur, 0, -0.005, 0.012);
    muzzle.scale.set(1.3, 0.8, 0.9);
    const nose = mesh(sphere(0.0018, 8, 6), M.pinkInner, 0, -0.002, 0.018);
    head.add(skull, muzzle, nose);
    for (const x of [-0.008, 0.008]) {
      const ear = mesh(new THREE.ConeGeometry(0.006, 0.013, 4), M.fur, x, 0.014, -0.001);
      ear.rotation.z = -x * 25;
      const inner = mesh(new THREE.ConeGeometry(0.0038, 0.009, 4), M.pinkInner, x * 0.98, 0.0135, 0.0012, false);
      inner.rotation.z = -x * 25;
      const eye = mesh(sphere(0.0034, 14, 10), phys(0x9dff4a, 0.05, 0, { emissive: 0x6adf2a, emissiveIntensity: 1.6, clearcoat: 1 }), x * 0.75, 0.002, 0.0125);
      eye.scale.set(1, 1, 0.6);
      const pupil = mesh(new THREE.BoxGeometry(0.0009, 0.005, 0.001), M.black, x * 0.75, 0.002, 0.0147, false);
      head.add(ear, inner, eye, pupil);
      for (const dy of [-0.001, 0.0015]) {
        const w = tube([[x * 0.6, -0.005 + dy, 0.016], [x * 1.8, -0.004 + dy * 2, 0.017], [x * 3, -0.003 + dy * 3, 0.014]], 0.00022, M.white, 6, 3);
        head.add(w);
      }
    }
    head.userData.keep = true;
    g.add(head);
    const tail = tube([[0.008, 0.006, -0.025], [0.028, 0.004, -0.018], [0.034, 0.006, 0.004], [0.026, 0.008, 0.02], [0.012, 0.01, 0.026]], 0.004, M.fur, 30, 8);
    g.add(tail);
    const collar = mesh(new THREE.TorusGeometry(0.0115, 0.0016, 8, 28), M.lacquerRed, 0, 0.057, 0.008);
    collar.rotation.x = Math.PI / 2 - 0.3;
    g.add(collar, mesh(sphere(0.0022, 10, 8), M.gold, 0, 0.052, 0.019));
    return { group: g, height: 0.095, animate: (t) => (head.rotation.y = Math.sin(t * 0.6) * 0.35) };
  },

  wuerfel() {
    const g = new THREE.Group();
    // A pair of red casino dice, rounded, with proper pips on every face.
    const mats = [1, 6, 2, 5, 3, 4].map((n) => phys(0xffffff, 0.12, 0, { map: dieFace(n), clearcoat: 1, clearcoatRoughness: 0.03 }));
    const die = (x: number, y: number, z: number, rx: number, ry: number, rz: number) => {
      const m = new THREE.Mesh(rbox(0.024, 0.024, 0.024, 0.0035), mats);
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, rz);
      m.castShadow = m.receiveShadow = true;
      return m;
    };
    g.add(die(-0.015, 0.012, 0.004, 0, 0.4, 0), die(0.014, 0.012, -0.006, Math.PI / 2, -0.3, 0));
    const top = die(0.001, 0.037, 0, 0.62, 0.8, 0.62);
    top.userData.keep = true;
    g.add(top);
    const felt = mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.002, 40), phys(0x0c4a2c, 0.95, 0, { sheen: 1, sheenColor: new THREE.Color(0x3a9a6a) }), 0, 0.001, 0, false);
    g.add(felt);
    return { group: g, height: 0.065, animate: (t) => (top.rotation.y = 0.8 + Math.sin(t * 0.7) * 0.2) };
  },

  abakus() {
    const g = new THREE.Group();
    // Rosewood frame with turned posts, brass rods and lacquered beads.
    for (const x of [-0.037, 0.037]) {
      g.add(lathe([[0, 0], [0.0045, 0], [0.0045, 0.004], [0.0032, 0.006], [0.0032, 0.058], [0.0045, 0.06], [0.0045, 0.066], [0.002, 0.068], [0, 0.068]], M.darkWood, 16).translateX(x));
    }
    for (const y of [0.006, 0.06]) g.add(mesh(rbox(0.078, 0.006, 0.01, 0.002), M.darkWood, 0, y, 0));
    const colors = [0xc8202c, 0xe0b44a, 0x2a6fd8, 0x2f8a3a, 0xf0e8d8];
    for (let r = 0; r < 5; r++) {
      const y = 0.015 + r * 0.0095;
      const rod = mesh(new THREE.CylinderGeometry(0.0009, 0.0009, 0.072, 8), M.brass, 0, y, 0);
      rod.rotation.z = Math.PI / 2;
      g.add(rod);
      const bead = phys(colors[r], 0.2, 0, { clearcoat: 1, clearcoatRoughness: 0.05 });
      for (let k = 0; k < 6; k++) {
        const b = mesh(sphere(0.0042, 16, 10), bead, -0.028 + k * 0.0088 + (k > 2 ? 0.012 * (r % 3) : 0), y, 0);
        b.scale.set(0.75, 1, 1);
        g.add(b);
      }
    }
    return { group: g, height: 0.075 };
  },

  sparschwein() {
    const g = new THREE.Group();
    // Glazed porcelain pig with painted flowers, a coin sticking out of the slot.
    const flowers = canvasTex(256, 128, (c) => {
      c.fillStyle = '#f4a8b8';
      c.fillRect(0, 0, 256, 128);
      for (let i = 0; i < 14; i++) {
        const x = (i * 53) % 256, y = 30 + ((i * 37) % 70);
        c.fillStyle = ['#ffffff', '#ffe070', '#ff6a8a'][i % 3];
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * Math.PI * 2;
          c.beginPath();
          c.arc(x + Math.cos(a) * 5, y + Math.sin(a) * 5, 3.5, 0, Math.PI * 2);
          c.fill();
        }
        c.fillStyle = '#e0a020';
        c.beginPath();
        c.arc(x, y, 2.5, 0, Math.PI * 2);
        c.fill();
      }
    });
    const glaze = phys(0xffffff, 0.15, 0, { map: flowers, clearcoat: 1, clearcoatRoughness: 0.04 });
    const body = mesh(sphere(0.028, 32, 24), glaze, 0, 0.033, 0);
    body.scale.set(1, 0.88, 1.3);
    const snout = lathe([[0, 0], [0.011, 0], [0.012, 0.003], [0.0115, 0.008], [0, 0.009]], M.pink, 24);
    snout.rotation.x = Math.PI / 2;
    snout.position.set(0, 0.033, 0.033);
    g.add(body, snout);
    for (const x of [-0.004, 0.004]) g.add(mesh(new THREE.CylinderGeometry(0.0017, 0.0017, 0.002, 10), M.pinkInner, x, 0.033, 0.0425).rotateX(Math.PI / 2));
    for (const x of [-0.013, 0.013]) {
      const ear = mesh(new THREE.ConeGeometry(0.0075, 0.013, 3), M.pink, x, 0.058, 0.014);
      ear.rotation.set(0.5, 0, -x * 20);
      g.add(ear);
      g.add(mesh(sphere(0.0022, 10, 8), phys(0x111111, 0.05, 0, { clearcoat: 1 }), x * 0.7, 0.043, 0.03));
    }
    for (const [x, z] of [[-0.014, -0.018], [0.014, -0.018], [-0.014, 0.018], [0.014, 0.018]]) {
      g.add(lathe([[0, 0], [0.0055, 0], [0.0058, 0.002], [0.005, 0.012], [0, 0.012]], M.pink, 16).translateX(x).translateZ(z));
    }
    g.add(tube([[0, 0.034, -0.036], [0.004, 0.038, -0.04], [0, 0.042, -0.041], [-0.003, 0.038, -0.04], [0.001, 0.036, -0.043]], 0.0012, M.pink, 20, 6));
    g.add(mesh(new THREE.BoxGeometry(0.016, 0.002, 0.003), M.black, 0, 0.0575, -0.004, false));
    const coin = mesh(new THREE.CylinderGeometry(0.0085, 0.0085, 0.0016, 28), M.gold, 0, 0.063, -0.004);
    coin.rotation.x = Math.PI / 2;
    g.add(coin);
    return { group: g, height: 0.075 };
  },

  kleeblatt() {
    const g = new THREE.Group();
    // Terracotta pot with a lip, dark soil and a bunch of clover, one with four leaves.
    g.add(lathe([[0, 0], [0.016, 0], [0.017, 0.002], [0.021, 0.026], [0.024, 0.027], [0.024, 0.033], [0.021, 0.034], [0.02, 0.03], [0, 0.03]], M.terracotta, 36));
    g.add(mesh(new THREE.CylinderGeometry(0.0205, 0.0205, 0.002, 28), M.soil, 0, 0.031, 0));
    const heart = new THREE.Shape();
    heart.moveTo(0, 0);
    heart.bezierCurveTo(0.004, 0.003, 0.009, 0.006, 0.007, 0.011);
    heart.bezierCurveTo(0.006, 0.013, 0.002, 0.013, 0, 0.01);
    heart.bezierCurveTo(-0.002, 0.013, -0.006, 0.013, -0.007, 0.011);
    heart.bezierCurveTo(-0.009, 0.006, -0.004, 0.003, 0, 0);
    const leafGeo = new THREE.ShapeGeometry(heart, 10);
    const sway: THREE.Group[] = [];
    const clover = (x: number, z: number, h: number, leaves: number, scale: number, lean: number) => {
      const stem = tube([[x, 0.031, z], [x + lean * 0.3, 0.031 + h * 0.5, z], [x + lean, 0.031 + h, z + lean * 0.3]], 0.0008, M.stem, 12, 5);
      g.add(stem);
      const head = new THREE.Group();
      head.position.set(x + lean, 0.031 + h, z + lean * 0.3);
      for (let i = 0; i < leaves; i++) {
        const leaf = new THREE.Mesh(leafGeo, M.leaf);
        leaf.castShadow = true;
        const a = (i / leaves) * Math.PI * 2;
        leaf.rotation.set(-Math.PI / 2 + 0.35, 0, 0);
        const holder = new THREE.Group();
        holder.rotation.y = a;
        holder.add(leaf);
        head.add(holder);
      }
      head.scale.setScalar(scale);
      head.userData.keep = true;
      sway.push(head);
      g.add(head);
    };
    clover(0, 0, 0.042, 4, 1.25, 0.002);
    clover(-0.008, 0.006, 0.03, 3, 0.9, -0.006);
    clover(0.009, -0.004, 0.034, 3, 1, 0.006);
    clover(0.004, 0.01, 0.024, 3, 0.8, 0.004);
    return { group: g, height: 0.09, animate: (t) => sway.forEach((s, i) => (s.rotation.y = Math.sin(t * 0.8 + i) * 0.25)) };
  },

  sanduhr() {
    const g = new THREE.Group();
    // Turned mahogany caps, three spindles, a real glass hourglass with sand running.
    const cap = [[0, 0], [0.026, 0], [0.027, 0.002], [0.025, 0.004], [0.022, 0.0055], [0.022, 0.007], [0, 0.007]] as [number, number][];
    g.add(lathe(cap, M.darkWood, 40));
    const topCap = lathe(cap, M.darkWood, 40);
    topCap.rotation.x = Math.PI;
    topCap.position.y = 0.086;
    g.add(topCap);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      g.add(lathe([[0.0022, 0], [0.0022, 0.004], [0.003, 0.008], [0.0016, 0.014], [0.0026, 0.02], [0.0016, 0.03], [0.003, 0.04], [0.0016, 0.05], [0.0026, 0.058], [0.0016, 0.064], [0.003, 0.07], [0.0022, 0.075], [0.0022, 0.079]], M.darkWood, 12).translateX(Math.cos(a) * 0.021).translateZ(Math.sin(a) * 0.021).translateY(0.007));
    }
    const bulb: [number, number][] = [[0.002, 0], [0.012, 0.002], [0.017, 0.008], [0.017, 0.016], [0.012, 0.028], [0.003, 0.036], [0.0018, 0.0395]];
    const lower = lathe(bulb, M.glass, 32);
    lower.position.y = 0.007;
    const upper = lathe(bulb, M.glass, 32);
    upper.rotation.x = Math.PI;
    upper.position.y = 0.079;
    lower.castShadow = upper.castShadow = false;
    const sand = phys(0xe6c07a, 0.95);
    const pile = lathe([[0, 0], [0.015, 0], [0.012, 0.006], [0.004, 0.011], [0, 0.012]], sand, 24);
    pile.position.y = 0.009;
    const rest = lathe([[0, 0], [0.013, 0], [0.011, 0.005], [0.004, 0.012], [0.002, 0.016], [0, 0.017]], sand, 24);
    rest.rotation.x = Math.PI;
    rest.position.y = 0.071;
    const stream = mesh(new THREE.CylinderGeometry(0.0004, 0.0004, 0.026, 5), sand, 0, 0.034, 0, false);
    g.add(lower, upper, pile, rest, stream);
    return { group: g, height: 0.095 };
  },

  glocke() {
    const g = new THREE.Group();
    // A polished hotel bell: domed brass, engraved bands, lathe-turned wooden handle.
    const pivot = new THREE.Group();
    const bell = lathe([[0.0005, 0.058], [0.008, 0.057], [0.012, 0.052], [0.014, 0.042], [0.016, 0.028], [0.021, 0.013], [0.027, 0.005], [0.03, 0.002], [0.03, 0], [0.028, 0], [0.025, 0.003], [0.019, 0.011], [0.014, 0.026], [0.012, 0.04], [0.009, 0.05], [0.0005, 0.054]], phys(0xd8ac4a, 0.16, 1, { roughnessMap: wear, side: THREE.DoubleSide }), 48);
    pivot.add(bell);
    for (const y of [0.012, 0.045]) {
      const band = mesh(new THREE.TorusGeometry(y < 0.02 ? 0.0205 : 0.0132, 0.0008, 6, 40), M.gold, 0, y, 0, false);
      band.rotation.x = Math.PI / 2;
      pivot.add(band);
    }
    pivot.add(lathe([[0.0025, 0.057], [0.004, 0.062], [0.0028, 0.066], [0.0035, 0.074], [0.0028, 0.082], [0.006, 0.086], [0.0065, 0.091], [0.004, 0.095], [0, 0.096]], M.darkWood, 20));
    const clapper = mesh(sphere(0.0045, 12, 10), M.iron, 0, 0.008, 0);
    pivot.add(clapper, mesh(new THREE.CylinderGeometry(0.0008, 0.0008, 0.044), M.iron, 0, 0.03, 0));
    g.add(pivot);
    return { group: g, height: 0.1, animate: (t) => (pivot.rotation.z = Math.sin(t * 1.3) * 0.03) };
  },

  rabe() {
    const g = new THREE.Group();
    // A raven perched on a gnarled branch, wings folded in layered feathers.
    const branch = tube([[-0.035, 0.012, 0], [-0.01, 0.016, 0.002], [0.012, 0.014, -0.002], [0.035, 0.018, 0.001]], 0.0035, M.wood, 24, 8);
    g.add(branch, plinth(0.022), tube([[0, 0.008, 0], [0.002, 0.012, 0.001], [0.004, 0.016, 0]], 0.0028, M.wood, 8, 6));
    const bird = new THREE.Group();
    bird.position.y = 0.02;
    const body = mesh(sphere(0.017, 24, 16), M.feather, 0, 0.018, 0);
    body.scale.set(0.85, 1, 1.5);
    body.rotation.x = -0.5;
    const breast = mesh(sphere(0.012, 20, 14), M.feather, 0, 0.022, 0.012);
    bird.add(body, breast);
    const feather = new THREE.Shape();
    feather.moveTo(0, 0);
    feather.quadraticCurveTo(0.005, 0.01, 0.002, 0.03);
    feather.lineTo(0, 0.033);
    feather.lineTo(-0.002, 0.03);
    feather.quadraticCurveTo(-0.005, 0.01, 0, 0);
    const fGeo = new THREE.ShapeGeometry(feather, 6);
    const featherMat = phys(0x101018, 0.35, 0, { sheen: 1, sheenColor: new THREE.Color(0x3a4a9a), side: THREE.DoubleSide, clearcoat: 0.5 });
    for (const side of [-1, 1]) {
      for (let i = 0; i < 5; i++) {
        const f = new THREE.Mesh(fGeo, featherMat);
        f.castShadow = true;
        f.position.set(side * 0.012, 0.03 - i * 0.002, 0.004 - i * 0.004);
        f.rotation.set(-Math.PI / 2 - 0.45, side * (0.18 + i * 0.03), side * 0.2);
        bird.add(f);
      }
    }
    for (let i = -2; i <= 2; i++) {
      const f = new THREE.Mesh(fGeo, featherMat);
      f.castShadow = true;
      f.position.set(i * 0.0015, 0.01, -0.018);
      f.rotation.set(-Math.PI / 2 - 0.7, 0, i * 0.12);
      bird.add(f);
    }
    const head = new THREE.Group();
    head.position.set(0, 0.038, 0.017);
    head.add(mesh(sphere(0.0105, 20, 14), M.feather, 0, 0, 0));
    const beakTop = mesh(new THREE.ConeGeometry(0.0038, 0.02, 10), phys(0x2a2a30, 0.25, 0.2, { clearcoat: 1 }), 0, 0.0005, 0.017);
    beakTop.rotation.x = Math.PI / 2 + 0.08;
    beakTop.scale.set(1, 1, 0.75);
    const beakLow = mesh(new THREE.ConeGeometry(0.0028, 0.015, 8), phys(0x2a2a30, 0.3, 0.2), 0, -0.0028, 0.014);
    beakLow.rotation.x = Math.PI / 2 - 0.12;
    head.add(beakTop, beakLow);
    for (const x of [-0.006, 0.006]) {
      head.add(mesh(sphere(0.0022, 10, 8), phys(0x1a0000, 0.05, 0, { emissive: 0xff2020, emissiveIntensity: 1.6, clearcoat: 1 }), x, 0.002, 0.007));
    }
    head.userData.keep = true;
    bird.add(head);
    for (const x of [-0.005, 0.005]) {
      bird.add(mesh(new THREE.CylinderGeometry(0.0009, 0.0009, 0.01), M.black, x, 0.002, 0.002));
      for (const a of [-0.5, 0, 0.5]) bird.add(tube([[x, -0.003, 0.002], [x + Math.sin(a) * 0.003, -0.004, 0.002 + Math.cos(a) * 0.004], [x + Math.sin(a) * 0.004, -0.006, 0.002 + Math.cos(a) * 0.005]], 0.0005, M.black, 6, 4));
    }
    g.add(bird);
    return { group: g, height: 0.075, animate: (t) => (head.rotation.y = Math.sin(t * 0.7) * 0.5 + (Math.sin(t * 3.1) > 0.95 ? 0.3 : 0)) };
  },

  zinnsoldat() {
    const g = new THREE.Group();
    // Hand-painted tin grenadier: boots, trousers, red coat with white cross-belts, shako with plume.
    const blue = phys(0x1a2a6a, 0.35, 0.3, { clearcoat: 0.6 });
    const coat = phys(0xb81c28, 0.35, 0.3, { clearcoat: 0.6 });
    const skin = phys(0xf1c7a0, 0.45, 0.1, { clearcoat: 0.4 });
    g.add(mesh(rbox(0.03, 0.004, 0.02, 0.0015), phys(0x3a6a2a, 0.5, 0.3), 0, 0.002, 0));
    for (const x of [-0.0045, 0.0045]) {
      g.add(mesh(rbox(0.0068, 0.009, 0.01, 0.002), M.black, x, 0.0085, 0.001));
      g.add(mesh(new THREE.CylinderGeometry(0.003, 0.0034, 0.022, 12), blue, x, 0.024, 0));
    }
    g.add(lathe([[0.0082, 0], [0.0095, 0.004], [0.0092, 0.016], [0.008, 0.022], [0.0045, 0.026], [0, 0.026]], coat, 20).translateY(0.034));
    // Coat tails, belts and buttons.
    g.add(mesh(new THREE.BoxGeometry(0.014, 0.012, 0.002), coat, 0, 0.037, -0.0085));
    for (const s of [-1, 1]) {
      const belt = mesh(new THREE.BoxGeometry(0.0022, 0.03, 0.0008), M.white, 0, 0.047, 0.0092, false);
      belt.rotation.z = s * 0.55;
      g.add(belt);
      const arm = mesh(new THREE.CapsuleGeometry(0.0026, 0.016, 4, 10), coat, s * 0.0108, 0.049, 0);
      arm.rotation.z = s * 0.12;
      g.add(arm, mesh(sphere(0.0025, 10, 8), skin, s * 0.012, 0.038, 0.001));
    }
    for (let i = 0; i < 4; i++) g.add(mesh(sphere(0.0009, 8, 6), M.gold, 0, 0.038 + i * 0.005, 0.0094, false));
    g.add(mesh(new THREE.CylinderGeometry(0.0035, 0.004, 0.003, 12), skin, 0, 0.061, 0));
    const face = mesh(sphere(0.0062, 20, 14), skin, 0, 0.067, 0);
    g.add(face);
    for (const x of [-0.0022, 0.0022]) g.add(mesh(sphere(0.0007, 6, 6), M.black, x, 0.068, 0.0058, false));
    g.add(mesh(new THREE.BoxGeometry(0.004, 0.0008, 0.001), M.black, 0, 0.0655, 0.0059, false));
    const cheeks = phys(0xe07a7a, 0.6);
    for (const x of [-0.003, 0.003]) g.add(mesh(sphere(0.0012, 6, 6), cheeks, x, 0.0655, 0.0052, false));
    g.add(lathe([[0.0066, 0], [0.0072, 0.016], [0.0078, 0.018], [0, 0.018]], M.black, 20).translateY(0.071));
    g.add(mesh(new THREE.BoxGeometry(0.009, 0.0015, 0.004), M.black, 0, 0.0715, 0.007));
    g.add(mesh(new THREE.CylinderGeometry(0.0032, 0.0032, 0.001, 16), M.gold, 0, 0.08, 0.0068).rotateX(Math.PI / 2));
    const plume = mesh(sphere(0.003, 10, 8), phys(0xffffff, 0.9, 0, { sheen: 1 }), 0, 0.093, 0.002);
    plume.scale.set(0.8, 1.8, 0.8);
    g.add(plume);
    // Musket shouldered with a bayonet.
    g.add(mesh(new THREE.CylinderGeometry(0.0011, 0.0013, 0.05, 8), M.darkWood, 0.0135, 0.052, 0.003));
    g.add(mesh(new THREE.CylinderGeometry(0.0004, 0.0008, 0.014, 6), M.silver, 0.0135, 0.083, 0.003));
    return { group: g, height: 0.1 };
  },

  totenkopf() {
    const g = new THREE.Group();
    // An old skull on two leather-bound books, a faint red glow deep in the sockets.
    const book = (y: number, w: number, d: number, h: number, col: number, rot: number) => {
      const b = new THREE.Group();
      b.add(mesh(rbox(w, h, d, 0.0012), phys(col, 0.6, 0, { bumpMap: pores, bumpScale: 0.4 }), 0, 0, 0));
      b.add(mesh(new THREE.BoxGeometry(w - 0.003, h - 0.002, d + 0.0006), M.cream, 0.0016, 0, 0, false));
      for (const z of [-d * 0.3, d * 0.3]) b.add(mesh(new THREE.BoxGeometry(0.0015, h + 0.0004, 0.0015), M.gold, -w / 2 + 0.0004, 0, z, false));
      b.position.y = y;
      b.rotation.y = rot;
      g.add(b);
    };
    book(0.005, 0.06, 0.045, 0.01, 0x4a1010, 0.1);
    book(0.0145, 0.052, 0.04, 0.009, 0x1a2a1a, -0.2);
    const cranium = new THREE.SphereGeometry(0.022, 40, 30);
    shapeVerts(cranium, (v) => {
      // Flattened sides, a heavier brow, narrowing cheeks.
      v.x *= 0.88;
      if (v.y < -0.004) {
        const k = 1 - Math.min(1, (-v.y - 0.004) / 0.018) * 0.35;
        v.x *= k;
        v.z *= 1 + (v.z > 0 ? 0.1 : -0.1) * (1 - k);
      }
      if (v.z > 0.012 && v.y > 0.002 && v.y < 0.01) v.z += 0.0015;
    });
    const skull = mesh(cranium, M.bone, 0, 0.042, -0.002);
    skull.scale.set(1, 0.95, 1.12);
    g.add(skull);
    const jaw = lathe([[0.012, 0], [0.013, 0.006], [0.0105, 0.012], [0, 0.012]], M.bone, 24);
    jaw.scale.set(1, 1, 0.9);
    jaw.position.set(0, 0.02, 0.006);
    g.add(jaw);
    const hole = phys(0x0a0606, 1);
    for (const x of [-0.0085, 0.0085]) {
      const socket = mesh(sphere(0.0062, 16, 12), hole, x, 0.041, 0.019);
      socket.scale.set(1.1, 1, 0.6);
      g.add(socket, mesh(sphere(0.0018, 8, 6), glow(0xff1a1a, 2.5), x, 0.041, 0.0205));
      const cheek = mesh(sphere(0.004, 12, 8), M.bone, x * 1.25, 0.033, 0.016);
      cheek.scale.set(1.2, 0.8, 0.8);
      g.add(cheek);
    }
    const nose = mesh(new THREE.ConeGeometry(0.0032, 0.007, 3), hole, 0, 0.032, 0.023);
    nose.rotation.x = Math.PI;
    g.add(nose);
    const tooth = new THREE.BoxGeometry(0.0026, 0.004, 0.002);
    for (let i = -3; i <= 3; i++) {
      const a = i * 0.16;
      for (const y of [0.0265, 0.0225]) {
        const t = mesh(tooth, phys(0xf0e6cc, 0.4), Math.sin(a) * 0.0115, y, 0.0165 + Math.cos(a) * 0.0045 - 0.0045, false);
        t.rotation.y = a;
        g.add(t);
      }
    }
    // Cracks drawn as thin dark seams.
    g.add(tube([[0.004, 0.062, 0.008], [0.007, 0.058, 0.014], [0.006, 0.054, 0.018]], 0.00035, hole, 8, 3));
    return { group: g, height: 0.07 };
  },

  winkekatze() {
    const g = new THREE.Group();
    // Maneki-neko: white glaze, painted face, red bib with a bell, a gold koban and a waving paw.
    const face = canvasTex(256, 128, (c) => {
      c.fillStyle = '#fbf8f0';
      c.fillRect(0, 0, 256, 128);
      c.strokeStyle = '#1a1a1a';
      c.lineWidth = 4;
      for (const x of [104, 152]) {
        c.beginPath();
        c.arc(x, 58, 9, Math.PI * 1.1, Math.PI * 1.9);
        c.stroke();
      }
      c.fillStyle = '#e06a7a';
      c.beginPath();
      c.ellipse(128, 70, 6, 4, 0, 0, Math.PI * 2);
      c.fill();
      c.beginPath();
      c.moveTo(118, 80);
      c.quadraticCurveTo(123, 86, 128, 80);
      c.quadraticCurveTo(133, 86, 138, 80);
      c.stroke();
      c.lineWidth = 2;
      for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
        c.beginPath();
        c.moveTo(128 + s * 18, 72 + i * 5);
        c.lineTo(128 + s * 46, 66 + i * 8);
        c.stroke();
      }
      c.fillStyle = '#ffb0c0';
      for (const x of [92, 164]) {
        c.globalAlpha = 0.5;
        c.beginPath();
        c.arc(x, 78, 8, 0, Math.PI * 2);
        c.fill();
      }
      c.globalAlpha = 1;
    });
    g.add(mesh(rbox(0.05, 0.01, 0.04, 0.004), phys(0xa8141e, 0.8, 0, { sheen: 1, sheenColor: new THREE.Color(0xff6060) }), 0, 0.005, 0));
    for (const [x, z] of [[-0.024, -0.019], [0.024, -0.019], [-0.024, 0.019], [0.024, 0.019]]) g.add(mesh(sphere(0.002, 8, 6), M.gold, x, 0.004, z));
    g.add(lathe([[0.0, 0], [0.02, 0], [0.023, 0.006], [0.022, 0.024], [0.018, 0.036], [0, 0.04]], M.porcelain, 36).translateY(0.01));
    const head = mesh(sphere(0.021, 36, 26), phys(0xffffff, 0.18, 0, { map: face, clearcoat: 1, clearcoatRoughness: 0.05 }), 0, 0.064, 0.002);
    head.rotation.y = -Math.PI / 2;
    head.scale.set(1, 0.9, 1.12);
    g.add(head);
    for (const x of [-0.012, 0.012]) {
      const ear = mesh(new THREE.ConeGeometry(0.0075, 0.013, 4), M.porcelain, x, 0.085, 0);
      ear.rotation.z = -x * 18;
      const inner = mesh(new THREE.ConeGeometry(0.0048, 0.009, 4), M.pinkInner, x, 0.0845, 0.002, false);
      inner.rotation.z = -x * 18;
      g.add(ear, inner);
    }
    const bib = mesh(new THREE.TorusGeometry(0.0175, 0.0028, 10, 32), M.lacquerRed, 0, 0.045, 0.001);
    bib.rotation.x = Math.PI / 2 - 0.15;
    g.add(bib, mesh(sphere(0.0048, 16, 12), M.gold, 0, 0.04, 0.0195));
    g.add(mesh(new THREE.BoxGeometry(0.006, 0.0007, 0.002), M.black, 0, 0.0395, 0.0242, false));
    // Gold koban with a stamped face.
    const koban = mesh(sphere(0.0115, 24, 14), phys(0xffffff, 0.2, 1, { map: canvasTex(64, 64, (c) => {
      c.fillStyle = '#e8b84a';
      c.fillRect(0, 0, 64, 64);
      c.strokeStyle = '#8a5a10';
      c.lineWidth = 2;
      c.strokeRect(20, 14, 24, 36);
      c.fillStyle = '#8a5a10';
      c.font = '700 20px Georgia, serif';
      c.textAlign = 'center';
      c.fillText('千', 32, 40);
    }) }), -0.012, 0.03, 0.021);
    koban.scale.set(0.8, 1.15, 0.22);
    koban.rotation.y = -Math.PI / 2;
    g.add(koban, mesh(new THREE.CapsuleGeometry(0.0055, 0.01, 6, 12), M.porcelain, -0.014, 0.034, 0.016).rotateZ(0.3));
    const armPivot = new THREE.Group();
    armPivot.position.set(0.017, 0.05, 0.008);
    armPivot.add(mesh(new THREE.CapsuleGeometry(0.0058, 0.02, 6, 12), M.porcelain, 0, 0.013, 0));
    const pad = mesh(sphere(0.0028, 10, 8), M.pinkInner, 0, 0.024, 0.0045);
    pad.scale.set(1, 1, 0.4);
    armPivot.add(pad);
    armPivot.userData.keep = true;
    g.add(armPivot);
    return { group: g, height: 0.1, animate: (t) => (armPivot.rotation.x = -0.25 + Math.sin(t * 3) * 0.45) };
  },

  magnet() {
    const g = new THREE.Group();
    // Classic red horseshoe magnet with ground steel poles, a few nails clinging to it.
    const u = new THREE.Shape();
    u.absarc(0, 0, 0.024, Math.PI, 0, true);
    u.lineTo(0.024, -0.026);
    u.lineTo(0.011, -0.026);
    u.lineTo(0.011, 0);
    u.absarc(0, 0, 0.011, 0, Math.PI, false);
    u.lineTo(-0.011, -0.026);
    u.lineTo(-0.024, -0.026);
    u.closePath();
    const paint = phys(0xc8202c, 0.25, 0.2, { clearcoat: 1, clearcoatRoughness: 0.1 });
    const shoe = new THREE.Group();
    // The arch on top, the two poles pointing down.
    const body = slab(u, 0.012, paint, 0.0015);
    body.position.y = 0.04;
    shoe.add(body);
    for (const x of [-0.0175, 0.0175]) shoe.add(mesh(rbox(0.0135, 0.008, 0.0145, 0.0012), M.silver, x, 0.012, 0));
    const lab = (t: string, x: number) => {
      shoe.add(mesh(new THREE.PlaneGeometry(0.008, 0.008), new THREE.MeshBasicMaterial({ map: canvasTex(32, 32, (c) => {
        c.fillStyle = '#ffffff';
        c.font = '700 26px Arial';
        c.textAlign = 'center';
        c.fillText(t, 16, 26);
      }), transparent: true }), x, 0.024, 0.0078, false));
    };
    lab('N', -0.0175);
    lab('S', 0.0175);
    // Nails clinging to the poles.
    for (const [x, a] of [[-0.02, 0.25], [-0.015, -0.1], [0.018, -0.3]] as [number, number][]) {
      const nail = new THREE.Group();
      nail.add(mesh(new THREE.CylinderGeometry(0.0007, 0.0004, 0.018, 6), M.iron, 0, -0.009, 0));
      nail.add(mesh(new THREE.CylinderGeometry(0.0018, 0.0018, 0.0008, 10), M.iron, 0, 0, 0));
      nail.position.set(x, 0.008, 0.003);
      nail.rotation.z = a;
      shoe.add(nail);
    }
    shoe.position.y = 0.028;
    shoe.userData.keep = true;
    g.add(plinth(0.032), shoe);
    return { group: g, height: 0.1, animate: (t) => (shoe.rotation.y = Math.sin(t * 0.6) * 0.3) };
  },
};

Object.assign(BUILDERS, {
  taschenuhr(): Figurine {
    const g = new THREE.Group();
    // Gold hunter watch leaning on a little stand: fluted case, crystal, roman dial, moving hands.
    const dial = canvasTex(256, 256, (c) => {
      const grad = c.createRadialGradient(128, 128, 10, 128, 128, 128);
      grad.addColorStop(0, '#fbf5e6');
      grad.addColorStop(1, '#e6dcc2');
      c.fillStyle = grad;
      c.fillRect(0, 0, 256, 256);
      c.strokeStyle = '#2a1a0a';
      c.lineWidth = 2;
      c.beginPath();
      c.arc(128, 128, 112, 0, Math.PI * 2);
      c.stroke();
      for (let i = 0; i < 60; i++) {
        const a = (i / 60) * Math.PI * 2;
        const l = i % 5 === 0 ? 10 : 5;
        c.beginPath();
        c.moveTo(128 + Math.cos(a) * 110, 128 + Math.sin(a) * 110);
        c.lineTo(128 + Math.cos(a) * (110 - l), 128 + Math.sin(a) * (110 - l));
        c.stroke();
      }
      c.fillStyle = '#1a0e04';
      c.font = '700 26px Georgia, serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      const R = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
      R.forEach((r, i) => {
        const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
        c.fillText(r, 128 + Math.cos(a) * 84, 128 + Math.sin(a) * 84);
      });
      c.font = 'italic 14px Georgia, serif';
      c.fillText('Glashütte', 128, 170);
      c.beginPath();
      c.arc(128, 180, 22, 0, Math.PI * 2);
      c.stroke();
    });
    const watch = new THREE.Group();
    watch.position.set(0, 0.034, 0.002);
    watch.rotation.x = -0.3;
    const caseGeo = new THREE.LatheGeometry([[0, -0.004], [0.02, -0.004], [0.0235, -0.003], [0.025, -0.001], [0.025, 0.001], [0.0235, 0.003], [0.022, 0.0035], [0, 0.0035]].map(([r, y]) => new THREE.Vector2(r, y)), 64);
    const casing = mesh(caseGeo, M.gold);
    casing.rotation.x = Math.PI / 2;
    const bezel = mesh(new THREE.TorusGeometry(0.0222, 0.0012, 10, 64), M.gold, 0, 0, 0.0036);
    const face = mesh(new THREE.CircleGeometry(0.0212, 48), phys(0xffffff, 0.35, 0, { map: dial }), 0, 0, 0.0034);
    const crystal = mesh(new THREE.SphereGeometry(0.0215, 32, 12, 0, Math.PI * 2, 0, 0.5), M.glass, 0, 0, -0.0145, false);
    crystal.rotation.x = Math.PI / 2;
    const hands = new THREE.Group();
    hands.position.z = 0.0042;
    const hour = mesh(new THREE.BoxGeometry(0.0012, 0.01, 0.0004), phys(0x1a1a3a, 0.2, 0.8), 0, 0.004, 0, false);
    const minute = mesh(new THREE.BoxGeometry(0.0009, 0.016, 0.0004), phys(0x1a1a3a, 0.2, 0.8), 0, 0.007, 0.0004, false);
    const hp = new THREE.Group();
    hp.add(hour);
    const mp = new THREE.Group();
    mp.add(minute);
    hands.add(hp, mp, mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 0.001, 12), M.gold, 0, 0, 0.0008, false).rotateX(Math.PI / 2));
    hands.userData.keep = true;
    const pendant = mesh(new THREE.CylinderGeometry(0.0022, 0.0022, 0.004, 12), M.gold, 0, 0.0265, 0);
    const crown = mesh(new THREE.CylinderGeometry(0.0034, 0.0034, 0.004, 18), phys(0xe6b84e, 0.35, 1, { bumpMap: canvasTex(32, 8, (c) => {
      for (let i = 0; i < 32; i += 2) {
        c.fillStyle = i % 4 ? '#000' : '#fff';
        c.fillRect(i, 0, 2, 8);
      }
    }, false), bumpScale: 1 }), 0, 0.0305, 0);
    const bow = mesh(new THREE.TorusGeometry(0.0065, 0.0012, 8, 24), M.gold, 0, 0.038, 0);
    watch.add(casing, bezel, face, crystal, hands, pendant, crown, bow);
    g.add(watch);
    // Stand and chain.
    g.add(mesh(rbox(0.05, 0.005, 0.03, 0.0015), M.darkWood, 0, 0.0025, 0));
    g.add(mesh(new THREE.BoxGeometry(0.003, 0.03, 0.003), M.darkWood, 0, 0.02, -0.01).rotateX(-0.3));
    const links: [number, number, number][] = [];
    for (let i = 0; i <= 14; i++) links.push([Math.sin(i * 0.5) * 0.012 - 0.01 + i * 0.0015, 0.006 + Math.max(0, 0.03 - i * 0.004), 0.008 + i * 0.001]);
    for (let i = 0; i < links.length; i++) {
      const l = mesh(new THREE.TorusGeometry(0.0022, 0.0006, 6, 12), M.gold, ...links[i]);
      l.rotation.set(Math.PI / 2, i % 2 ? Math.PI / 2 : 0, i * 0.4);
      g.add(l);
    }
    return {
      group: g, height: 0.085,
      animate: (t) => {
        mp.rotation.z = -t * 0.3;
        hp.rotation.z = -t * 0.025;
      },
    };
  },

  goldbarren(): Figurine {
    const g = new THREE.Group();
    // Three stamped fine-gold ingots on a wooden tray.
    const stamp = canvasTex(128, 64, (c) => {
      c.fillStyle = '#e6b84e';
      c.fillRect(0, 0, 128, 64);
      c.strokeStyle = '#8a5a14';
      c.lineWidth = 3;
      c.strokeRect(10, 8, 108, 48);
      c.fillStyle = '#7a4a10';
      c.font = '700 18px Georgia, serif';
      c.textAlign = 'center';
      c.fillText('FEINGOLD', 64, 30);
      c.font = '700 14px monospace';
      c.fillText('999,9 · 1 KG', 64, 48);
    });
    const goldTop = phys(0xffffff, 0.2, 1, { map: stamp, bumpMap: stamp, bumpScale: 0.8 });
    const bar = () => {
      const geo = new THREE.BoxGeometry(0.036, 0.012, 0.018, 1, 1, 1);
      shapeVerts(geo, (v) => {
        if (v.y > 0) {
          v.x *= 0.82;
          v.z *= 0.72;
        }
      });
      return new THREE.Mesh(geo, [M.gold, M.gold, goldTop, M.gold, M.gold, M.gold]);
    };
    const place = (x: number, y: number, z: number, r: number) => {
      const b = bar();
      b.position.set(x, y, z);
      b.rotation.y = r;
      b.castShadow = b.receiveShadow = true;
      g.add(b);
    };
    place(-0.012, 0.012, 0.004, 0.05);
    place(0.014, 0.012, -0.004, -0.08);
    place(0.001, 0.024, 0, 0.3);
    g.add(mesh(rbox(0.064, 0.006, 0.04, 0.002), M.darkWood, 0, 0.003, 0));
    for (const z of [-0.019, 0.019]) g.add(mesh(new THREE.BoxGeometry(0.064, 0.004, 0.002), M.darkWood, 0, 0.007, z));
    return { group: g, height: 0.045 };
  },

  police(): Figurine {
    const g = new THREE.Group();
    // A typed insurance policy with a wax seal and a fountain pen lying across it.
    const doc = canvasTex(160, 208, (c) => {
      c.fillStyle = '#f2ead4';
      c.fillRect(0, 0, 160, 208);
      c.fillStyle = '#1a1a3a';
      c.font = '700 13px Georgia, serif';
      c.textAlign = 'center';
      c.fillText('VERSICHERUNGS-', 80, 22);
      c.fillText('POLICE Nr. 0815', 80, 38);
      c.fillStyle = 'rgba(40,40,60,0.7)';
      for (let y = 56; y < 170; y += 8) c.fillRect(14, y, 60 + ((y * 37) % 70), 2);
      c.strokeStyle = '#1a1a5a';
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(90, 188);
      c.bezierCurveTo(100, 176, 110, 196, 120, 182);
      c.bezierCurveTo(128, 176, 136, 192, 146, 184);
      c.stroke();
      c.strokeStyle = 'rgba(160,20,30,0.6)';
      c.lineWidth = 3;
      c.beginPath();
      c.arc(40, 180, 16, 0, Math.PI * 2);
      c.stroke();
    });
    for (let i = 0; i < 4; i++) {
      const sheet = mesh(new THREE.BoxGeometry(0.052, 0.0012, 0.068), i === 3 ? [M.paper, M.paper, phys(0xffffff, 0.9, 0, { map: doc }), M.paper, M.paper, M.paper] as unknown as THREE.Material : M.paper, (i % 2) * 0.0015, 0.0008 + i * 0.0013, 0);
      sheet.rotation.y = (i - 2.5) * 0.05;
      g.add(sheet);
    }
    const seal = lathe([[0, 0], [0.0085, 0], [0.0095, 0.001], [0.0088, 0.0026], [0.006, 0.0032], [0, 0.0033]], phys(0x9a1020, 0.3, 0, { clearcoat: 0.8 }), 20);
    seal.position.set(-0.012, 0.0055, 0.021);
    g.add(seal, mesh(new THREE.TorusGeometry(0.0045, 0.0007, 6, 20), phys(0x7a0a14, 0.3), -0.012, 0.0088, 0.021).rotateX(Math.PI / 2));
    const pen = new THREE.Group();
    pen.add(lathe([[0, 0], [0.0028, 0.002], [0.003, 0.03], [0.0032, 0.034], [0.003, 0.05], [0.0022, 0.056], [0, 0.058]], M.ebony, 20));
    pen.add(mesh(new THREE.CylinderGeometry(0.0032, 0.0032, 0.0025, 20), M.gold, 0, 0.032, 0));
    pen.add(mesh(new THREE.BoxGeometry(0.0008, 0.02, 0.0015), M.gold, 0.0033, 0.045, 0));
    pen.add(mesh(new THREE.ConeGeometry(0.0022, 0.008, 12), M.gold, 0, -0.003, 0).rotateX(Math.PI));
    pen.rotation.set(0, 0.6, Math.PI / 2);
    pen.position.set(0.024, 0.0095, -0.004);
    g.add(pen);
    return { group: g, height: 0.03 };
  },

  zigarre(): Figurine {
    const g = new THREE.Group();
    // Heavy cut-glass ashtray, a Havana with its paper band, a glowing tip under grey ash.
    g.add(lathe([[0, 0], [0.03, 0], [0.032, 0.004], [0.032, 0.011], [0.029, 0.012], [0.026, 0.006], [0, 0.006]], phys(0xb8d0dc, 0.04, 0, { transparent: true, opacity: 0.55, clearcoat: 1 }), 12));
    const leafTex = canvasTex(128, 32, (c) => {
      c.fillStyle = '#5a3418';
      c.fillRect(0, 0, 128, 32);
      c.strokeStyle = 'rgba(30,14,4,0.6)';
      for (let i = 0; i < 16; i++) {
        c.beginPath();
        c.moveTo(0, i * 2 + Math.sin(i) * 2);
        c.lineTo(128, i * 2 + 6 + Math.cos(i) * 3);
        c.stroke();
      }
    });
    const cigar = new THREE.Group();
    cigar.add(lathe([[0.0015, 0], [0.0042, 0.003], [0.0046, 0.008], [0.0046, 0.058], [0.0036, 0.064], [0, 0.066]], phys(0xffffff, 0.75, 0, { map: leafTex }), 20));
    cigar.add(mesh(new THREE.CylinderGeometry(0.0049, 0.0049, 0.009, 20), phys(0xffffff, 0.4, 0.3, { map: canvasTex(128, 32, (c) => {
      c.fillStyle = '#c8102c';
      c.fillRect(0, 0, 128, 32);
      c.fillStyle = '#e8c04a';
      c.fillRect(0, 4, 128, 3);
      c.fillRect(0, 25, 128, 3);
      c.font = '700 14px Georgia, serif';
      c.fillText('HABANA', 36, 21);
    }) }), 0, 0.05, 0));
    cigar.add(mesh(new THREE.CylinderGeometry(0.0045, 0.0046, 0.006, 20), phys(0x8a8680, 1, 0, { bumpMap: pores, bumpScale: 1 }), 0, -0.003, 0));
    const ember = mesh(new THREE.CylinderGeometry(0.0043, 0.0045, 0.0015, 20), glow(0xff5a1a, 2.5), 0, -0.0065, 0);
    cigar.add(ember);
    cigar.rotation.z = Math.PI / 2 - 0.12;
    cigar.position.set(0.028, 0.014, 0);
    g.add(cigar);
    return { group: g, height: 0.04, animate: (t) => ((ember.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.5 + Math.sin(t * 2.2) * 1) };
  },

  fernglas(): Figurine {
    const g = new THREE.Group();
    // Mother-of-pearl opera glasses with gilt rings, focus wheel and a lorgnette handle.
    const barrel: [number, number][] = [[0, 0], [0.0098, 0], [0.0102, 0.002], [0.0098, 0.004], [0.0085, 0.012], [0.0068, 0.022], [0.0072, 0.024], [0.0066, 0.026], [0, 0.026]];
    for (const x of [-0.0115, 0.0115]) {
      const b = lathe(barrel, M.pearl, 32);
      b.rotation.x = -Math.PI / 2;
      b.position.set(x, 0.042, 0.012);
      g.add(b);
      for (const [z, r] of [[0.011, 0.0101], [0.0005, 0.0072], [-0.009, 0.0072]]) {
        const ring = mesh(new THREE.TorusGeometry(r, 0.0011, 8, 32), M.gold, x, 0.042, z, false);
        g.add(ring);
      }
      g.add(mesh(new THREE.CircleGeometry(0.0088, 32), phys(0x1a2a3a, 0.02, 0.4, { clearcoat: 1 }), x, 0.042, 0.0122, false));
    }
    g.add(mesh(new THREE.BoxGeometry(0.014, 0.003, 0.004), M.gold, 0, 0.042, -0.008));
    const wheel = mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.006, 16), M.gold, 0, 0.042, -0.002);
    wheel.rotation.z = Math.PI / 2;
    g.add(wheel);
    g.add(tube([[0.018, 0.04, 0], [0.024, 0.026, 0], [0.026, 0.01, 0], [0.024, 0.002, 0]], 0.0015, M.gold, 16, 8));
    g.add(mesh(sphere(0.0025, 10, 8), M.gold, 0.024, 0.002, 0));
    return { group: g, height: 0.06 };
  },

  spiegel(): Figurine {
    const g = new THREE.Group();
    // Oval hand mirror in a beaded gilt frame, standing in a little brass holder.
    const pivot = new THREE.Group();
    const frame = mesh(new THREE.TorusGeometry(0.02, 0.0028, 12, 48), M.gold, 0, 0.058, 0);
    frame.scale.set(1, 1.3, 1);
    pivot.add(frame);
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      pivot.add(mesh(sphere(0.0014, 8, 6), M.gold, Math.cos(a) * 0.0235, 0.058 + Math.sin(a) * 0.0305, 0.0015, false));
    }
    const glass = mesh(new THREE.CircleGeometry(0.02, 40), phys(0xe8f0f8, 0.02, 1), 0, 0.058, 0.0005);
    glass.scale.set(1, 1.3, 1);
    const backing = mesh(new THREE.CircleGeometry(0.02, 40), M.velvet, 0, 0.058, -0.0008);
    backing.scale.set(1, 1.3, 1);
    backing.rotation.y = Math.PI;
    pivot.add(glass, backing);
    pivot.add(lathe([[0.0035, 0], [0.004, 0.004], [0.003, 0.008], [0.0042, 0.012], [0.0028, 0.022], [0.0045, 0.026], [0.003, 0.03], [0, 0.031]], M.gold, 20).translateY(-0.004));
    pivot.add(mesh(sphere(0.003, 12, 8), M.lacquerRed, 0, 0.0975, 0.002));
    pivot.userData.keep = true;
    g.add(plinth(0.018), pivot);
    return { group: g, height: 0.1, animate: (t) => (pivot.rotation.y = Math.sin(t * 0.9) * 0.6) };
  },

  kristallkugel(): Figurine {
    const g = new THREE.Group();
    // A clear orb on a claw stand; violet mist swirls inside.
    g.add(lathe([[0, 0], [0.022, 0], [0.023, 0.003], [0.019, 0.006], [0.012, 0.009], [0.01, 0.014], [0.014, 0.016], [0, 0.016]], M.brass, 40));
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      g.add(tube([[Math.cos(a) * 0.011, 0.014, Math.sin(a) * 0.011], [Math.cos(a) * 0.016, 0.02, Math.sin(a) * 0.016], [Math.cos(a) * 0.014, 0.028, Math.sin(a) * 0.014]], 0.0014, M.brass, 10, 6));
      g.add(mesh(sphere(0.0018, 8, 6), M.brass, Math.cos(a) * 0.014, 0.028, Math.sin(a) * 0.014));
    }
    const orb = mesh(sphere(0.022, 40, 30), phys(0xe8e0ff, 0, 0, { transparent: true, opacity: 0.28, clearcoat: 1, clearcoatRoughness: 0, iridescence: 0.4, depthWrite: false }), 0, 0.04, 0, false);
    const mist = new THREE.Group();
    mist.position.y = 0.04;
    for (let i = 0; i < 3; i++) {
      const m = mesh(new THREE.TorusGeometry(0.009 + i * 0.002, 0.0025, 8, 32), new THREE.MeshBasicMaterial({ color: [0xb48cff, 0x8a5aff, 0xff8ae0][i], transparent: true, opacity: 0.45, toneMapped: false, depthWrite: false }), 0, 0, 0, false);
      m.rotation.set(i * 1.1, i * 0.7, 0);
      mist.add(m);
    }
    mist.add(mesh(sphere(0.005, 12, 10), glow(0xd8b8ff, 3), 0, 0, 0, false));
    mist.userData.keep = true;
    g.add(mist, orb);
    return {
      group: g, height: 0.07,
      animate: (t) => {
        mist.rotation.set(t * 0.5, t * 0.8, t * 0.3);
        mist.scale.setScalar(0.9 + Math.sin(t * 2) * 0.12);
      },
    };
  },

  goldkugel(): Figurine {
    const g = new THREE.Group();
    // The golden roulette ball on a tufted velvet cushion with gold tassels.
    const cushionGeo = rbox(0.046, 0.014, 0.046, 0.006);
    shapeVerts(cushionGeo, (v) => {
      // Tufted: dimples in a grid on top.
      if (v.y > 0.004) v.y -= Math.max(0, 0.0025 - Math.min(Math.hypot(v.x - 0.011, v.z - 0.011), Math.hypot(v.x + 0.011, v.z - 0.011), Math.hypot(v.x - 0.011, v.z + 0.011), Math.hypot(v.x + 0.011, v.z + 0.011), Math.hypot(v.x, v.z) + 0.003) * 0.4);
      v.y += (1 - Math.min(1, Math.hypot(v.x, v.z) / 0.03)) * 0.002;
    });
    g.add(mesh(cushionGeo, M.velvet, 0, 0.008, 0));
    for (const [x, z] of [[0.011, 0.011], [-0.011, 0.011], [0.011, -0.011], [-0.011, -0.011]]) g.add(mesh(sphere(0.0014, 8, 6), M.gold, x, 0.0145, z, false));
    for (const [x, z] of [[-0.023, -0.023], [0.023, -0.023], [-0.023, 0.023], [0.023, 0.023]]) {
      g.add(mesh(sphere(0.0022, 10, 8), M.gold, x, 0.01, z));
      g.add(lathe([[0.0005, 0], [0.0025, 0.001], [0.0028, 0.006], [0.0012, 0.008], [0, 0.009]], M.gold, 12).translateX(x * 1.08).translateY(0.001).translateZ(z * 1.08));
    }
    const ball = mesh(sphere(0.0105, 40, 30), phys(0xffd24a, 0.08, 1, { clearcoat: 1, emissive: 0x3a2400, emissiveIntensity: 0.5 }), 0, 0.026, 0);
    ball.userData.keep = true;
    g.add(ball);
    return { group: g, height: 0.045, animate: (t) => (ball.position.y = 0.026 + Math.abs(Math.sin(t * 2)) * 0.004) };
  },

  teufel(): Figurine {
    const g = new THREE.Group();
    // Lacquered devil in a black cape, horns, goatee, trident and an arrow-tipped tail.
    const skin = phys(0xb01818, 0.25, 0.1, { clearcoat: 1, clearcoatRoughness: 0.08 });
    const cape = phys(0x121216, 0.35, 0, { clearcoat: 0.7, sheen: 0.6, sheenColor: new THREE.Color(0x6a1020), side: THREE.DoubleSide });
    g.add(plinth(0.022, 0.007));
    g.add(lathe([[0.012, 0], [0.0135, 0.004], [0.011, 0.02], [0.0085, 0.036], [0.006, 0.042], [0, 0.043]], skin, 28).translateY(0.007));
    const capeGeo = new THREE.CylinderGeometry(0.0095, 0.019, 0.042, 32, 6, true, Math.PI * 0.25, Math.PI * 1.5);
    shapeVerts(capeGeo, (v) => {
      const a = Math.atan2(v.z, v.x);
      const k = 1 + Math.sin(a * 7) * 0.06 * (0.5 - v.y / 0.042);
      v.x *= k;
      v.z *= k;
    });
    const capeMesh = mesh(capeGeo, cape, 0, 0.029, -0.001);
    capeMesh.rotation.y = Math.PI;
    g.add(capeMesh);
    const collar = mesh(new THREE.TorusGeometry(0.0085, 0.0022, 8, 24, Math.PI), cape, 0, 0.049, -0.001);
    collar.rotation.x = -0.4;
    g.add(collar);
    const head = new THREE.Group();
    head.position.y = 0.059;
    const skull = mesh(sphere(0.0095, 24, 18), skin, 0, 0, 0);
    skull.scale.set(0.95, 1.1, 1);
    head.add(skull);
    const goatee = mesh(new THREE.ConeGeometry(0.0025, 0.008, 8), M.black, 0, -0.011, 0.005);
    goatee.rotation.x = Math.PI + 0.3;
    head.add(goatee);
    for (const x of [-1, 1]) {
      head.add(tube([[x * 0.005, 0.006, 0.001], [x * 0.009, 0.011, 0], [x * 0.008, 0.017, -0.002]], 0.0016, phys(0xf0e0c0, 0.3, 0, { clearcoat: 1 }), 10, 8));
      head.add(mesh(sphere(0.0016, 8, 6), glow(0xffe040, 3), x * 0.0035, 0.001, 0.0082, false));
      const brow = mesh(new THREE.BoxGeometry(0.004, 0.0009, 0.001), M.black, x * 0.0036, 0.0037, 0.0086, false);
      brow.rotation.z = -x * 0.5;
      head.add(brow);
      const ear = mesh(new THREE.ConeGeometry(0.0022, 0.006, 4), skin, x * 0.009, 0.001, 0);
      ear.rotation.z = -x * 1.2;
      head.add(ear);
    }
    head.add(mesh(new THREE.TorusGeometry(0.003, 0.0006, 6, 12, Math.PI), M.black, 0, -0.0035, 0.0082, false).rotateZ(Math.PI));
    g.add(head);
    const fork = new THREE.Group();
    fork.add(mesh(new THREE.CylinderGeometry(0.001, 0.001, 0.075, 8), M.iron, 0, 0.0375, 0));
    fork.add(mesh(new THREE.BoxGeometry(0.011, 0.0015, 0.0015), M.iron, 0, 0.074, 0));
    for (const dx of [-0.0048, 0, 0.0048]) fork.add(mesh(new THREE.ConeGeometry(0.0012, dx ? 0.012 : 0.015, 6), M.iron, dx, dx ? 0.0805 : 0.082, 0));
    fork.position.set(0.017, 0.007, 0.004);
    g.add(fork, mesh(sphere(0.0022, 10, 8), skin, 0.016, 0.042, 0.004));
    g.add(tube([[-0.008, 0.012, -0.012], [-0.02, 0.008, -0.014], [-0.026, 0.016, -0.004], [-0.022, 0.026, 0.002]], 0.0012, skin, 20, 6));
    const tip = mesh(new THREE.ConeGeometry(0.003, 0.006, 3), skin, -0.021, 0.029, 0.003);
    g.add(tip);
    return { group: g, height: 0.095, animate: (t) => (g.rotation.y = Math.sin(t * 0.5) * 0.15) };
  },
});

Object.assign(BUILDERS, {
  walkman(): Figurine {
    const g = new THREE.Group();
    // Blue metal cassette player: tape window with reels, chrome keys, foam headphones on a cable.
    const body = new THREE.Group();
    body.position.set(0, 0.043, 0);
    body.rotation.x = -0.12;
    const shell = phys(0x2a4a8a, 0.3, 0.7, { clearcoat: 0.6, roughnessMap: wear });
    body.add(mesh(rbox(0.056, 0.082, 0.02, 0.004), shell, 0, 0, 0));
    body.add(mesh(rbox(0.044, 0.032, 0.002, 0.002), M.plastic, 0, 0.006, 0.0101));
    const win = mesh(new THREE.PlaneGeometry(0.038, 0.024), phys(0x1a1a22, 0.02, 0, { transparent: true, opacity: 0.55, clearcoat: 1 }), 0, 0.006, 0.0114, false);
    body.add(win);
    const reels: THREE.Mesh[] = [];
    for (const x of [-0.011, 0.011]) {
      const reel = mesh(new THREE.CylinderGeometry(0.0032, 0.0032, 0.002, 6), phys(0xd8d8d8, 0.4), x, 0.006, 0.0106);
      reel.rotation.x = Math.PI / 2;
      reels.push(reel);
      body.add(reel, mesh(new THREE.CylinderGeometry(x < 0 ? 0.009 : 0.005, x < 0 ? 0.009 : 0.005, 0.0015, 24), phys(0x3a2418, 0.5), x, 0.006, 0.0103).rotateX(Math.PI / 2));
    }
    body.add(mesh(new THREE.PlaneGeometry(0.046, 0.01), phys(0xffffff, 0.3, 0.5, { map: canvasTex(192, 40, (c) => {
      c.fillStyle = '#d8d8dc';
      c.fillRect(0, 0, 192, 40);
      c.fillStyle = '#c8102c';
      c.fillRect(0, 32, 192, 8);
      c.fillStyle = '#1a1a1a';
      c.font = '700 24px Arial Narrow, Arial, sans-serif';
      c.fillText('WALKMAN  WM-2', 12, 26);
    }) }), 0, 0.032, 0.0102, false));
    for (let i = 0; i < 5; i++) body.add(mesh(rbox(0.008, 0.005, 0.007, 0.001), i === 0 ? phys(0xc8102c, 0.3) : M.chrome, -0.02 + i * 0.01, 0.043, 0.001));
    body.add(mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.004, 16), M.chrome, 0.029, 0.018, 0).rotateZ(Math.PI / 2));
    body.add(mesh(new THREE.CylinderGeometry(0.0016, 0.0016, 0.003, 10), M.black, 0.02, 0.0425, -0.004));
    g.add(body);
    const band = tube([[-0.036, 0.075, -0.018], [-0.03, 0.105, -0.018], [0, 0.118, -0.018], [0.03, 0.105, -0.018], [0.036, 0.075, -0.018]], 0.0018, M.silver, 30, 8);
    g.add(band);
    for (const x of [-0.036, 0.036]) {
      const pad = mesh(sphere(0.012, 20, 16), phys(0xff6a1a, 0.95, 0, { bumpMap: pores, bumpScale: 1, sheen: 0.8, sheenColor: new THREE.Color(0xffb070) }), x, 0.072, -0.018);
      pad.scale.set(0.55, 1, 1);
      g.add(pad, mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.004, 20), M.silver, x * 0.86, 0.072, -0.018).rotateZ(Math.PI / 2));
    }
    g.add(tube([[-0.036, 0.062, -0.018], [-0.03, 0.03, -0.01], [-0.01, 0.004, 0.012], [0.01, 0.006, 0.016], [0.02, 0.01, 0.006]], 0.0008, M.black, 30, 5));
    return { group: g, height: 0.12, animate: (t) => reels.forEach((r) => (r.rotation.y = t * 3)) };
  },

  pager(): Figurine {
    const g = new THREE.Group();
    // A black pager with a green backlit display, four keys and a steel belt clip.
    const body = new THREE.Group();
    body.position.set(0, 0.018, 0);
    body.rotation.x = -0.95;
    body.add(mesh(rbox(0.052, 0.034, 0.016, 0.006), M.plastic, 0, 0, 0));
    body.add(mesh(rbox(0.04, 0.018, 0.002, 0.002), phys(0x0a0a0a, 0.2), 0, 0.004, 0.0078));
    const lcd = mesh(new THREE.PlaneGeometry(0.035, 0.013), new THREE.MeshStandardMaterial({ map: canvasTex(160, 60, (c) => {
      c.fillStyle = '#8aa85a';
      c.fillRect(0, 0, 160, 60);
      c.fillStyle = 'rgba(20,40,10,0.15)';
      for (let x = 0; x < 160; x += 4) c.fillRect(x, 0, 1, 60);
      c.fillStyle = '#1a2a10';
      c.font = '700 30px monospace';
      c.fillText('07734', 14, 34);
      c.font = '700 14px monospace';
      c.fillText('RUF AN  23:12', 14, 52);
    }), emissive: 0x6a9a3a, emissiveIntensity: 0.6, roughness: 0.3 }), 0, 0.004, 0.0091, false);
    body.add(lcd);
    for (let i = 0; i < 4; i++) body.add(mesh(rbox(0.007, 0.004, 0.003, 0.0012), phys(0x3a3a40, 0.4), -0.015 + i * 0.01, -0.01, 0.0075));
    body.add(mesh(sphere(0.0013, 8, 6), glow(0xff2020, 2), 0.021, 0.012, 0.007, false));
    body.add(mesh(rbox(0.018, 0.03, 0.002, 0.001), M.silver, 0, 0.003, -0.0095));
    g.add(body);
    return { group: g, height: 0.05, animate: (t) => ((lcd.material as THREE.MeshStandardMaterial).emissiveIntensity = Math.sin(t * 6) > 0.6 ? 1.4 : 0.5) };
  },

  zippo(): Figurine {
    const g = new THREE.Group();
    // Brushed-chrome lighter, lid flipped open on its hinge, perforated chimney, knurled wheel.
    const brushed = phys(0xd8dae0, 0.28, 1, { bumpMap: canvasTex(8, 64, (c) => {
      for (let y = 0; y < 64; y++) {
        const v = 110 + ((y * 97) % 60);
        c.fillStyle = `rgb(${v},${v},${v})`;
        c.fillRect(0, y, 8, 1);
      }
    }, false), bumpScale: 0.3 });
    g.add(mesh(rbox(0.022, 0.034, 0.013, 0.0028), brushed, 0, 0.017, 0));
    g.add(mesh(new THREE.BoxGeometry(0.0225, 0.0008, 0.0135), M.black, 0, 0.0343, 0, false));
    const lidPivot = new THREE.Group();
    lidPivot.position.set(0.011, 0.0345, 0);
    lidPivot.add(mesh(rbox(0.022, 0.014, 0.013, 0.0028), brushed, -0.011, 0.007, 0));
    lidPivot.rotation.z = -2.1;
    g.add(lidPivot);
    for (let i = 0; i < 3; i++) g.add(mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 0.004, 8), brushed, 0.011, 0.031 + i * 0.0015, 0).rotateX(Math.PI / 2));
    const chimney = new THREE.CylinderGeometry(0.0052, 0.0052, 0.011, 16, 1, true);
    g.add(mesh(chimney, phys(0xc8cad0, 0.3, 1, { side: THREE.DoubleSide, alphaTest: 0.5, alphaMap: canvasTex(64, 32, (c) => {
      c.fillStyle = '#fff';
      c.fillRect(0, 0, 64, 32);
      c.fillStyle = '#000';
      for (let x = 4; x < 64; x += 8) for (let y = 8; y < 28; y += 8) {
        c.beginPath();
        c.arc(x, y, 2.2, 0, Math.PI * 2);
        c.fill();
      }
    }, false) }), 0, 0.0395, 0));
    const wheel = mesh(new THREE.CylinderGeometry(0.0028, 0.0028, 0.003, 14), M.iron, -0.007, 0.0415, 0);
    wheel.rotation.x = Math.PI / 2;
    g.add(wheel, mesh(new THREE.CylinderGeometry(0.0006, 0.0006, 0.004), M.black, 0, 0.0445, 0));
    const f = flame(0.011);
    f.position.y = 0.0455;
    g.add(f);
    return { group: g, height: 0.075, animate: (t) => flicker(f, t, 1.2) };
  },

  hasenpfote(): Figurine {
    const g = new THREE.Group();
    // A fluffy rabbit's foot on a key chain: fur tufts, gold cap, split ring.
    const fur = phys(0xe8dcc8, 1, 0, { sheen: 1, sheenColor: new THREE.Color(0xffffff), sheenRoughness: 0.8, bumpMap: pores, bumpScale: 1.5 });
    const foot = new THREE.Group();
    foot.rotation.z = 0.4;
    foot.position.set(0.004, 0.012, 0);
    const core = new THREE.CapsuleGeometry(0.0105, 0.032, 10, 20);
    shapeVerts(core, (v) => {
      const n = Math.sin(v.x * 900) * Math.sin(v.y * 700) * Math.sin(v.z * 800);
      v.multiplyScalar(1 + n * 0.08);
    });
    foot.add(mesh(core, fur, 0, 0.02, 0));
    for (let i = 0; i < 18; i++) {
      const a = i * 2.4, y = 0.004 + (i / 18) * 0.034;
      const tuft = mesh(new THREE.ConeGeometry(0.0035, 0.009, 6), fur, Math.cos(a) * 0.0095, y, Math.sin(a) * 0.0095);
      tuft.lookAt(Math.cos(a) * 0.05, y - 0.01, Math.sin(a) * 0.05);
      tuft.rotateX(Math.PI / 2);
      foot.add(tuft);
    }
    for (const x of [-0.004, 0, 0.004]) foot.add(mesh(sphere(0.0022, 8, 6), phys(0x4a3a30, 0.4), x, -0.004, 0.006, false));
    foot.add(lathe([[0.0092, 0], [0.0105, 0.002], [0.0098, 0.008], [0.004, 0.012], [0, 0.0125]], M.gold, 28).translateY(0.042));
    const ring = mesh(new THREE.TorusGeometry(0.0034, 0.0009, 8, 20), M.gold, 0, 0.058, 0);
    foot.add(ring);
    const key = mesh(new THREE.TorusGeometry(0.009, 0.001, 8, 32), M.silver, 0, 0.068, 0);
    key.rotation.y = Math.PI / 2;
    foot.add(key);
    g.add(foot);
    return { group: g, height: 0.085 };
  },

  kassette(): Figurine {
    const g = new THREE.Group();
    // A home-made mixtape leaning on its clear case: handwritten label, screws, visible tape.
    const tape = new THREE.Group();
    tape.add(mesh(rbox(0.064, 0.041, 0.009, 0.002), phys(0x1a1a1c, 0.35, 0, { clearcoat: 0.5 }), 0, 0, 0));
    const label = mesh(new THREE.PlaneGeometry(0.056, 0.026), new THREE.MeshStandardMaterial({ map: canvasTex(256, 120, (c) => {
      c.fillStyle = '#f2ead6';
      c.fillRect(0, 0, 256, 120);
      c.fillStyle = '#e04a2a';
      c.fillRect(0, 0, 256, 18);
      c.fillStyle = '#2a8ae0';
      c.fillRect(0, 18, 256, 4);
      c.fillStyle = '#20206a';
      c.font = 'italic 700 28px "Comic Sans MS", Georgia, serif';
      c.fillText("Mixtape '87", 18, 52);
      c.font = '16px Georgia, serif';
      c.fillText('A: Falco · Nena · Alphaville', 18, 72);
      c.fillStyle = '#1a1a1a';
      c.beginPath();
      c.roundRect(64, 80, 128, 30, 14);
      c.fill();
    }), roughness: 0.7 }), 0, 0.003, 0.0047);
    tape.add(label);
    for (const x of [-0.016, 0.016]) {
      const hub = mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.0095, 6), M.white, x, 0.0005, 0);
      hub.rotation.x = Math.PI / 2;
      tape.add(hub, mesh(new THREE.CylinderGeometry(x < 0 ? 0.008 : 0.0055, x < 0 ? 0.008 : 0.0055, 0.004, 24), phys(0x3a2418, 0.45, 0.2), x, 0.0005, 0).rotateX(Math.PI / 2));
    }
    tape.add(mesh(new THREE.BoxGeometry(0.03, 0.006, 0.0092), phys(0x2a2a2e, 0.4), 0, -0.017, 0));
    for (const [x, y] of [[-0.029, 0.017], [0.029, 0.017], [-0.029, -0.017], [0.029, -0.017], [0, -0.017]]) tape.add(mesh(new THREE.CylinderGeometry(0.0013, 0.0013, 0.001, 10), M.silver, x, y, 0.0048, false).rotateX(Math.PI / 2));
    tape.rotation.x = -0.3;
    tape.position.set(0, 0.022, 0.004);
    const caseMat = phys(0xeef4f8, 0.04, 0, { transparent: true, opacity: 0.25, clearcoat: 1, depthWrite: false });
    const box = mesh(rbox(0.07, 0.044, 0.012, 0.0015), caseMat, 0, 0.024, -0.012, false);
    box.rotation.x = -0.15;
    const inlay = mesh(new THREE.PlaneGeometry(0.064, 0.04), new THREE.MeshStandardMaterial({ map: canvasTex(128, 80, (c) => {
      const grad = c.createLinearGradient(0, 0, 128, 80);
      grad.addColorStop(0, '#ff2fa8');
      grad.addColorStop(1, '#27e3ff');
      c.fillStyle = grad;
      c.fillRect(0, 0, 128, 80);
      c.fillStyle = 'rgba(0,0,0,0.3)';
      for (let y = 40; y < 80; y += 6) c.fillRect(0, y, 128, 2);
    }) }), 0, 0.024, -0.0175, false);
    inlay.rotation.x = -0.15;
    g.add(tape, box, inlay);
    return { group: g, height: 0.05 };
  },

  zauberwuerfel(): Figurine {
    const g = new THREE.Group();
    // A Rubik's cube caught mid-twist: black body, glossy stickers.
    const colors = [0xffffff, 0xffd200, 0xc8102e, 0xff6a00, 0x0051ba, 0x009e60];
    const stickers = colors.map((c) => phys(c, 0.18, 0, { clearcoat: 1, clearcoatRoughness: 0.05 }));
    const cube = new THREE.Group();
    const s = 0.013;
    const layers: THREE.Group[] = [new THREE.Group(), new THREE.Group(), new THREE.Group()];
    const cubieGeo = rbox(s * 0.97, s * 0.97, s * 0.97, 0.0016);
    const stickerGeo = rbox(s * 0.8, s * 0.8, 0.0006, 0.0014);
    const body = phys(0x0a0a0a, 0.45);
    for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
      const cubie = new THREE.Group();
      cubie.position.set(x * s, y * s, z * s);
      cubie.add(mesh(cubieGeo, body, 0, 0, 0));
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
        const st = mesh(stickerGeo, stickers[(c + x + 2 * y + 3 * z + 9) % 6], p.x * 1.01, p.y * 1.01, p.z * 1.01, false);
        st.rotation.copy(r);
        cubie.add(st);
      }
      layers[y + 1].add(cubie);
    }
    layers[2].userData.keep = true;
    cube.add(...layers);
    cube.position.y = 0.021;
    cube.rotation.y = 0.5;
    g.add(cube);
    return { group: g, height: 0.045, animate: (t) => (layers[2].rotation.y = 0.35 + Math.sin(t * 0.8) * 0.3) };
  },

  polaroid(): Figurine {
    const g = new THREE.Group();
    // Polaroid instant camera: cream body, rainbow stripe, big lens, flash, a photo sliding out.
    const body = phys(0xf2eee4, 0.35, 0, { clearcoat: 0.5 });
    g.add(mesh(rbox(0.07, 0.04, 0.05, 0.006), body, 0, 0.02, 0));
    const top = mesh(rbox(0.07, 0.032, 0.036, 0.006), M.plastic, 0, 0.052, -0.006);
    top.rotation.x = -0.15;
    g.add(top);
    g.add(mesh(new THREE.PlaneGeometry(0.012, 0.038), new THREE.MeshStandardMaterial({ map: canvasTex(16, 80, (c) => {
      ['#e0302a', '#ff8a1a', '#ffd21a', '#3aa84a', '#2a6ad8'].forEach((col, i) => {
        c.fillStyle = col;
        c.fillRect(0, i * 16, 16, 16);
      });
    }), roughness: 0.3 }), -0.012, 0.02, 0.0253, false));
    const lens = lathe([[0.013, 0], [0.013, 0.008], [0.0115, 0.011], [0.009, 0.012], [0, 0.012]], M.black, 40);
    lens.rotation.x = Math.PI / 2;
    lens.position.set(0.016, 0.042, 0.004);
    g.add(lens);
    for (const r of [0.0085, 0.0055]) g.add(mesh(new THREE.TorusGeometry(r, 0.0007, 6, 32), M.silver, 0.016, 0.042, 0.0162, false));
    g.add(mesh(new THREE.CircleGeometry(0.0065, 32), phys(0x2a3a6a, 0, 0.3, { clearcoat: 1, iridescence: 0.8 }), 0.016, 0.042, 0.0165, false));
    g.add(mesh(rbox(0.018, 0.009, 0.004, 0.0015), phys(0xf8f8ff, 0.1, 0, { emissive: 0xffffff, emissiveIntensity: 0.15 }), -0.02, 0.06, 0.009));
    g.add(mesh(rbox(0.01, 0.008, 0.004, 0.0015), phys(0x0a0a10, 0.05, 0, { clearcoat: 1 }), 0.024, 0.062, 0.008));
    g.add(mesh(sphere(0.0034, 12, 8), phys(0xc8102c, 0.3, 0, { clearcoat: 1 }), 0.03, 0.03, 0.0255));
    const photo = new THREE.Group();
    photo.add(mesh(new THREE.BoxGeometry(0.036, 0.0012, 0.042), M.white, 0, 0, 0));
    const img = mesh(new THREE.PlaneGeometry(0.03, 0.03), new THREE.MeshStandardMaterial({ map: canvasTex(64, 64, (c) => {
      const grad = c.createLinearGradient(0, 0, 0, 64);
      grad.addColorStop(0, '#3a2a4a');
      grad.addColorStop(1, '#c86a3a');
      c.fillStyle = grad;
      c.fillRect(0, 0, 64, 64);
      c.fillStyle = '#1a0a0a';
      c.fillRect(18, 20, 28, 40);
      c.fillStyle = '#ff2fa8';
      c.fillRect(10, 8, 44, 5);
    }), roughness: 0.4 }), 0, 0.0007, -0.004, false);
    img.rotation.x = -Math.PI / 2;
    photo.add(img);
    photo.position.set(0, 0.0012, 0.046);
    photo.rotation.x = 0.1;
    g.add(photo);
    return { group: g, height: 0.075 };
  },

  voodoo(): Figurine {
    const g = new THREE.Group();
    // Burlap doll with cross-stitched mouth, button eyes, twine wraps and three pins.
    const burlapTex = canvasTex(64, 64, (c) => {
      c.fillStyle = '#8a6a3a';
      c.fillRect(0, 0, 64, 64);
      for (let i = 0; i < 64; i += 3) {
        c.fillStyle = i % 2 ? '#6a4a22' : '#a0804a';
        c.fillRect(i, 0, 1.5, 64);
        c.fillRect(0, i, 64, 1.5);
      }
    });
    const burlap = phys(0xffffff, 1, 0, { map: burlapTex, bumpMap: burlapTex, bumpScale: 1.5 });
    const body = mesh(new THREE.CapsuleGeometry(0.012, 0.028, 8, 16), burlap, 0, 0.032, 0);
    const head = mesh(sphere(0.0145, 24, 18), burlap, 0, 0.068, 0);
    g.add(body, head);
    for (const side of [-1, 1]) {
      const arm = mesh(new THREE.CapsuleGeometry(0.0042, 0.02, 6, 10), burlap, side * 0.019, 0.042, 0);
      arm.rotation.z = side * 1.1;
      const leg = mesh(new THREE.CapsuleGeometry(0.005, 0.016, 6, 10), burlap, side * 0.0072, 0.01, 0);
      g.add(arm, leg);
      const button = lathe([[0, 0], [0.0035, 0], [0.0036, 0.0012], [0.003, 0.0016], [0, 0.0016]], side < 0 ? phys(0x1a1a1a, 0.2, 0, { clearcoat: 1 }) : phys(0xc8102c, 0.2, 0, { clearcoat: 1 }), 16);
      button.rotation.x = Math.PI / 2;
      button.position.set(side * 0.0055, 0.071, 0.0135);
      g.add(button);
    }
    const thread = phys(0x1a1a1a, 0.8);
    for (let i = -2; i <= 2; i++) {
      for (const a of [0.7, -0.7]) {
        const st = mesh(new THREE.BoxGeometry(0.0032, 0.0005, 0.0005), thread, i * 0.0022, 0.0615, 0.0135, false);
        st.rotation.z = a;
        g.add(st);
      }
    }
    for (const y of [0.028, 0.034, 0.05]) {
      const wrap = mesh(new THREE.TorusGeometry(0.0123, 0.0007, 6, 28), phys(0xc8a060, 0.9), 0, y, 0, false);
      wrap.rotation.x = Math.PI / 2 + (y - 0.035) * 8;
      g.add(wrap);
    }
    g.add(mesh(new THREE.BoxGeometry(0.006, 0.006, 0.0008), phys(0xc8102c, 0.7), 0.004, 0.044, 0.0124, false));
    [0xff2020, 0x20a0ff, 0xffd020].forEach((c, i) => {
      const pin = new THREE.Group();
      pin.add(mesh(new THREE.CylinderGeometry(0.0005, 0.0005, 0.03), M.silver, 0, 0.015, 0));
      pin.add(mesh(sphere(0.0024, 12, 8), phys(c, 0.15, 0, { clearcoat: 1 }), 0, 0.03, 0));
      pin.position.set(-0.006 + i * 0.006, 0.028 + i * 0.013, 0.006);
      pin.rotation.set(0.9, 0, (i - 1) * 0.5);
      g.add(pin);
    });
    return { group: g, height: 0.09, animate: (t) => (g.rotation.z = Math.sin(t * 0.9) * 0.05) };
  },

  goldkette(): Figurine {
    const g = new THREE.Group();
    // A heavy curb chain on a velvet neck form, with a dollar medallion.
    g.add(lathe([[0, 0], [0.022, 0], [0.024, 0.004], [0.018, 0.008], [0.012, 0.03], [0.011, 0.05], [0.009, 0.056], [0, 0.057]], M.velvet, 36));
    const n = 32;
    const linkGeo = new THREE.TorusGeometry(0.0034, 0.0011, 8, 14);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = 0.0125 + Math.max(0, Math.sin(a)) * 0.012;
      const y = 0.042 - Math.max(0, Math.sin(a)) * 0.024;
      const link = mesh(linkGeo, M.gold, Math.cos(a) * 0.0135, y, Math.sin(a) * r);
      link.lookAt(link.position.x - Math.sin(a), y, link.position.z + Math.cos(a));
      link.rotateZ((i % 2) * Math.PI / 2);
      g.add(link);
    }
    const medal = new THREE.Group();
    medal.position.set(0, 0.014, 0.026);
    medal.rotation.x = -0.15;
    const relief = canvasTex(128, 128, (c) => {
      c.fillStyle = '#e6b84e';
      c.fillRect(0, 0, 128, 128);
      c.strokeStyle = '#8a5a14';
      c.lineWidth = 6;
      c.beginPath();
      c.arc(64, 64, 54, 0, Math.PI * 2);
      c.stroke();
      c.fillStyle = '#8a5a14';
      c.font = '700 84px Georgia, serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('$', 64, 68);
    });
    const coinFace = phys(0xffffff, 0.2, 1, { map: relief, bumpMap: relief, bumpScale: 2 });
    const disc = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.0028, 40), [M.gold, coinFace, M.gold] as unknown as THREE.Material, 0, 0, 0);
    disc.rotation.x = Math.PI / 2;
    medal.add(disc, mesh(new THREE.TorusGeometry(0.0028, 0.0009, 6, 12), M.gold, 0, 0.0135, 0));
    g.add(medal);
    return { group: g, height: 0.06 };
  },

  clubkarte(): Figurine {
    const g = new THREE.Group();
    // A black VIP card with gold foil, standing in a small brass holder.
    const face = canvasTex(256, 160, (c) => {
      const grad = c.createLinearGradient(0, 0, 256, 160);
      grad.addColorStop(0, '#1a1418');
      grad.addColorStop(1, '#050405');
      c.fillStyle = grad;
      c.fillRect(0, 0, 256, 160);
      c.strokeStyle = '#d8b050';
      c.lineWidth = 4;
      c.strokeRect(10, 10, 236, 140);
      c.fillStyle = '#d8b050';
      c.font = 'italic 700 30px Georgia, serif';
      c.fillText('Club Rouge', 24, 58);
      c.font = '700 16px monospace';
      c.fillText('MITGLIED SEIT 1979', 24, 88);
      c.fillText('VIP  ·  TISCH OHNE LIMIT', 24, 112);
      c.fillStyle = '#c8a040';
      c.fillRect(190, 96, 40, 30);
      c.strokeStyle = '#8a6a20';
      c.lineWidth = 1;
      for (let i = 0; i < 4; i++) c.strokeRect(192 + i * 9, 98, 8, 26);
    });
    const card = new THREE.Mesh(rbox(0.058, 0.037, 0.0012, 0.0005), [M.black, M.black, M.black, M.black, phys(0xffffff, 0.2, 0.4, { map: face, clearcoat: 1 }), M.black]);
    card.castShadow = true;
    card.position.set(0, 0.026, 0);
    card.rotation.x = -0.2;
    g.add(card);
    g.add(mesh(rbox(0.04, 0.006, 0.016, 0.002), M.brass, 0, 0.003, 0));
    g.add(mesh(new THREE.BoxGeometry(0.036, 0.008, 0.002), M.brass, 0, 0.009, 0.004));
    return { group: g, height: 0.05 };
  },
});

// ---- Registry --------------------------------------------------------------------------

/** Figurines backed by real models, registered once they are loaded. */
const MODEL_FIGURINES = new Map<string, () => Figurine>();
export function registerModelFigurine(def: string, build: () => Figurine): void {
  MODEL_FIGURINES.set(def, build);
}

/** Glue each figurine's fixed parts into one mesh per material; moving parts stay separate. */
function compact(fig: Figurine): Figurine {
  const keep: THREE.Object3D[] = [];
  fig.group.traverse((o) => {
    if (o.userData.keep) keep.push(o);
  });
  mergeStatic([fig.group], keep, fig.group);
  return fig;
}

export function buildFigurine(def: string): Figurine {
  const model = MODEL_FIGURINES.get(def);
  if (model) return model();
  const b = BUILDERS[def];
  if (b) return compact(b());
  const g = new THREE.Group();
  g.add(mesh(new THREE.OctahedronGeometry(0.02), M.gold, 0, 0.03, 0));
  return { group: g, height: 0.05 };
}

/** Small gift box used in the showcase for wheel upgrades: lacquered, with a satin ribbon and bow. */
export function buildUpgradeBox(color: string): Figurine {
  const g = new THREE.Group();
  const ribbon = phys(new THREE.Color(color).getHex(), 0.3, 0.2, { sheen: 1, sheenColor: new THREE.Color(0xffffff), clearcoat: 0.5 });
  g.add(mesh(rbox(0.048, 0.032, 0.048, 0.002), phys(0x3a1020, 0.35, 0, { clearcoat: 1, clearcoatRoughness: 0.1 }), 0, 0.016, 0));
  g.add(mesh(rbox(0.052, 0.009, 0.052, 0.002), phys(0x3a1020, 0.3, 0, { clearcoat: 1 }), 0, 0.033, 0));
  g.add(mesh(new THREE.BoxGeometry(0.0535, 0.0395, 0.009), ribbon, 0, 0.019, 0));
  g.add(mesh(new THREE.BoxGeometry(0.009, 0.0395, 0.0535), ribbon, 0, 0.019, 0));
  for (const s of [-1, 1]) {
    const loop = mesh(new THREE.TorusGeometry(0.0065, 0.0022, 8, 20), ribbon, s * 0.007, 0.041, 0);
    loop.rotation.set(0, Math.PI / 2, s * 0.6);
    loop.scale.set(1, 0.7, 1);
    g.add(loop);
  }
  g.add(mesh(sphere(0.003, 10, 8), ribbon, 0, 0.039, 0));
  return compact({ group: g, height: 0.05 });
}

/** Turns a figurine into its golden version: gilded materials and a halo ring on the plate. */
export function goldify(fig: Figurine): void {
  const gold = new THREE.Color(0xffc640);
  fig.group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    const next = mats.map((mat) => {
      const c = (mat as THREE.MeshStandardMaterial).clone();
      if (c.color) c.color.lerp(gold, 0.7);
      if ('metalness' in c) {
        c.metalness = Math.max(c.metalness, 0.85);
        c.roughness = Math.min(c.roughness, 0.3);
        c.emissive?.lerp(new THREE.Color(0x3a2200), 0.6);
      }
      return c;
    });
    m.material = Array.isArray(m.material) ? next : next[0];
  });
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.043, 0.0025, 8, 40), new THREE.MeshBasicMaterial({ color: 0xffd76a, toneMapped: false }));
  halo.rotation.x = Math.PI / 2;
  halo.position.y = 0.004;
  fig.group.add(halo);
}
