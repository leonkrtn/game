import * as THREE from 'three';

/** Procedural textures for the casino: every surface gets colour, roughness and a normal map. */

function canvas(w: number, h = w): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function tex(c: HTMLCanvasElement, repeat: [number, number] = [1, 1], color = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.anisotropy = 8;
  return t;
}

/** Deterministic random so textures look the same every run. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Turns a greyscale height canvas into a tangent-space normal map. */
function normalFromHeight(src: HTMLCanvasElement, strength = 2): HTMLCanvasElement {
  const w = src.width, h = src.height;
  const data = src.getContext('2d')!.getImageData(0, 0, w, h).data;
  const [c, g] = canvas(w, h);
  const out = g.createImageData(w, h);
  const H = (x: number, y: number) => data[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
      const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      out.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      out.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      out.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      out.data[i + 3] = 255;
    }
  }
  g.putImageData(out, 0, 0);
  return c;
}

function noiseCanvas(size: number, seed: number, scale: number, lo = 90, hi = 170): HTMLCanvasElement {
  const r = rng(seed);
  const [c, g] = canvas(size);
  g.fillStyle = `rgb(${(lo + hi) / 2},${(lo + hi) / 2},${(lo + hi) / 2})`;
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < size * size * scale; i++) {
    const v = lo + r() * (hi - lo);
    g.fillStyle = `rgba(${v},${v},${v},0.5)`;
    g.fillRect(r() * size, r() * size, 1 + r() * 2, 1 + r() * 2);
  }
  return c;
}

export interface Surface {
  map?: THREE.Texture;
  normalMap?: THREE.Texture;
  roughnessMap?: THREE.Texture;
}

/** A loud 1980s casino carpet: dark ground with teal, magenta and gold shapes. */
export function carpet(repeat: [number, number]): Surface {
  const S = 512;
  const r = rng(7);
  const [c, g] = canvas(S);
  const [hc, hg] = canvas(S);
  g.fillStyle = '#16060e';
  g.fillRect(0, 0, S, S);
  hg.fillStyle = '#777';
  hg.fillRect(0, 0, S, S);
  const colors = ['#0b3f44', '#5a1236', '#7a5a1c', '#26164a', '#6a2418'];
  const shape = (x: number, y: number, k: number) => {
    const col = colors[k % colors.length];
    g.fillStyle = col;
    g.strokeStyle = col;
    g.lineWidth = 6;
    const t = k % 4;
    g.beginPath();
    if (t === 0) {
      g.moveTo(x, y - 22);
      g.lineTo(x + 20, y + 14);
      g.lineTo(x - 20, y + 14);
      g.closePath();
      g.fill();
    } else if (t === 1) {
      g.arc(x, y, 14, 0, Math.PI * 2);
      g.lineWidth = 5;
      g.stroke();
    } else if (t === 2) {
      g.moveTo(x - 26, y);
      for (let i = 0; i <= 6; i++) g.lineTo(x - 26 + i * 9, y + (i % 2 ? -9 : 9));
      g.stroke();
    } else {
      g.fillRect(x - 6, y - 22, 12, 44);
      g.fillRect(x - 22, y - 6, 44, 12);
    }
  };
  // Ornamental grid of diamonds with the loud shapes inside, like old casino carpets.
  g.strokeStyle = '#3a1020';
  g.lineWidth = 3;
  for (let k = -S; k < S * 2; k += 64) {
    g.beginPath();
    g.moveTo(k, 0);
    g.lineTo(k + S, S);
    g.moveTo(k + S, 0);
    g.lineTo(k, S);
    g.stroke();
  }
  for (let gy = 0; gy < 8; gy++) {
    for (let gx = 0; gx < 8; gx++) {
      const x = gx * 64 + 32 + (gy % 2) * 32;
      const y = gy * 64 + 32;
      g.save();
      g.translate(x % S, y);
      g.scale(0.6, 0.6);
      shape(0, 0, gx * 3 + gy * 5);
      g.restore();
    }
  }
  // Worn fibres.
  for (let i = 0; i < 60000; i++) {
    const v = r();
    g.fillStyle = v < 0.5 ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.05)';
    const x = r() * S, y = r() * S;
    g.fillRect(x, y, 1, 1);
    hg.fillStyle = v < 0.5 ? '#606060' : '#909090';
    hg.fillRect(x, y, 1, 1);
  }
  return {
    map: tex(c, repeat),
    normalMap: tex(normalFromHeight(hc, 3), repeat, false),
    roughnessMap: tex(noiseCanvas(256, 3, 0.8, 200, 255), repeat, false),
  };
}

/** Dark red damask wallpaper with a slightly raised pattern. */
export function damask(repeat: [number, number]): Surface {
  const S = 512;
  const [c, g] = canvas(S);
  const [hc, hg] = canvas(S);
  g.fillStyle = '#3a0c14';
  g.fillRect(0, 0, S, S);
  hg.fillStyle = '#505050';
  hg.fillRect(0, 0, S, S);
  const motif = (ctx: CanvasRenderingContext2D, cx: number, cy: number, fill: string) => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    for (let side = -1; side <= 1; side += 2) {
      ctx.moveTo(cx, cy - 110);
      ctx.bezierCurveTo(cx + side * 70, cy - 90, cx + side * 20, cy - 30, cx + side * 60, cy);
      ctx.bezierCurveTo(cx + side * 95, cy + 30, cx + side * 30, cy + 90, cx, cy + 110);
    }
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, 18, 0, Math.PI * 2);
    ctx.fill();
  };
  for (const [x, y] of [[128, 128], [384, 384], [384, -128], [128, 640], [-128, 384], [640, 128]]) {
    motif(g, x, y, '#521520');
    motif(hg, x, y, '#a0a0a0');
  }
  g.strokeStyle = 'rgba(200,150,80,0.08)';
  g.lineWidth = 2;
  for (let x = 0; x < S; x += 16) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, S);
    g.stroke();
  }
  const r = rng(11);
  for (let i = 0; i < 20000; i++) {
    g.fillStyle = `rgba(0,0,0,${r() * 0.12})`;
    g.fillRect(r() * S, r() * S, 2, 2);
  }
  return { map: tex(c, repeat), normalMap: tex(normalFromHeight(hc, 1.5), repeat, false) };
}

/** Fine woven normal map for the felt. */
export function feltNormal(repeat: [number, number]): THREE.Texture {
  return tex(normalFromHeight(noiseCanvas(256, 5, 2.5, 60, 200), 1.2), repeat, false);
}

/** Leather for the padded armrest. */
export function leather(): Surface {
  const S = 256;
  const r = rng(13);
  const [hc, hg] = canvas(S);
  hg.fillStyle = '#808080';
  hg.fillRect(0, 0, S, S);
  for (let i = 0; i < 900; i++) {
    const v = 90 + r() * 80;
    hg.fillStyle = `rgba(${v},${v},${v},0.6)`;
    hg.beginPath();
    hg.arc(r() * S, r() * S, 2 + r() * 6, 0, Math.PI * 2);
    hg.fill();
  }
  return { normalMap: tex(normalFromHeight(hc, 2.5), [6, 1], false), roughnessMap: tex(noiseCanvas(128, 2, 0.6, 120, 200), [6, 1], false) };
}

/** Veined marble for the cashier counter. */
export function marble(): Surface {
  const S = 512;
  const r = rng(17);
  const [c, g] = canvas(S);
  g.fillStyle = '#e9e2d4';
  g.fillRect(0, 0, S, S);
  for (let k = 0; k < 14; k++) {
    g.strokeStyle = `rgba(90,80,70,${0.08 + r() * 0.2})`;
    g.lineWidth = 0.6 + r() * 2.5;
    g.beginPath();
    let x = r() * S, y = 0;
    g.moveTo(x, y);
    while (y < S) {
      x += (r() - 0.5) * 40;
      y += 10 + r() * 20;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  return { map: tex(c, [1, 1]), roughnessMap: tex(noiseCanvas(128, 9, 0.4, 20, 70), [2, 2], false) };
}

/** Subtle smudges so metal and lacquer don't look like perfect CG. */
export function smudges(repeat: [number, number] = [1, 1]): THREE.Texture {
  return tex(noiseCanvas(256, 21, 0.3, 40, 110), repeat, false);
}

/** Ceiling panels. */
export function ceiling(repeat: [number, number]): Surface {
  const S = 256;
  const [c, g] = canvas(S);
  g.fillStyle = '#17100f';
  g.fillRect(0, 0, S, S);
  g.strokeStyle = '#2a1d18';
  g.lineWidth = 8;
  g.strokeRect(4, 4, S - 8, S - 8);
  const [hc, hg] = canvas(S);
  hg.fillStyle = '#909090';
  hg.fillRect(0, 0, S, S);
  hg.strokeStyle = '#404040';
  hg.lineWidth = 8;
  hg.strokeRect(4, 4, S - 8, S - 8);
  return { map: tex(c, repeat), normalMap: tex(normalFromHeight(hc, 2), repeat, false) };
}

const loader = new THREE.TextureLoader();

/** Real wood photo textures (three.js examples, hardwood2). */
export function wood(base: string, repeat: [number, number], rotate = false): Surface {
  const setup = (t: THREE.Texture, color: boolean) => {
    if (color) t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(...repeat);
    t.anisotropy = 8;
    if (rotate) t.rotation = Math.PI / 2;
    return t;
  };
  return {
    map: setup(loader.load(base + 'wood_diffuse.jpg'), true),
    roughnessMap: setup(loader.load(base + 'wood_roughness.jpg'), false),
  };
}

export function woodBump(base: string, repeat: [number, number], rotate = false): THREE.Texture {
  const t = loader.load(base + 'wood_bump.jpg');
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  if (rotate) t.rotation = Math.PI / 2;
  return t;
}
