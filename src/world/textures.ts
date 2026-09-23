import * as THREE from 'three';
import { CHIP_COLORS, chipLabel, POCKET_MOD_INFO } from '../game/content';
import { FIELDS } from '../game/fields';
import type { Pocket } from '../game/types';
import { POCKET_COUNT, standardColor } from '../game/wheel';
import { FIELD_RECTS, LAYOUT_BOUNDS as BOARD_BOUNDS, TILE } from './layout';

const COLORS = { red: '#b3202a', black: '#17171c', green: '#11804a' };

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function finish(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export const BOARD_SIZE = {
  w: BOARD_BOUNDS.x1 - BOARD_BOUNDS.x0,
  d: BOARD_BOUNDS.z1 - BOARD_BOUNDS.z0,
};

export function boardTexture(): THREE.CanvasTexture {
  // Pixel sizes below are tuned for 330 px per tile; `k` scales them.
  const tilePx = 180;
  const ppu = tilePx / TILE;
  const k = tilePx / 330;
  const [c, g] = canvas(Math.round(BOARD_SIZE.w * ppu), Math.round(BOARD_SIZE.d * ppu));
  const grad = g.createRadialGradient(c.width / 2, c.height / 2, 50, c.width / 2, c.height / 2, c.width * 0.6);
  grad.addColorStop(0, '#1f7a4a');
  grad.addColorStop(1, '#10492c');
  g.fillStyle = grad;
  g.fillRect(0, 0, c.width, c.height);
  // Felt noise.
  for (let i = 0; i < 20000; i++) {
    g.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},0.035)`;
    g.fillRect(Math.random() * c.width, Math.random() * c.height, 1.5, 1.5);
  }
  const px = (x: number) => (x - BOARD_BOUNDS.x0) * ppu;
  const pz = (z: number) => (z - BOARD_BOUNDS.z0) * ppu;

  for (const f of FIELDS) {
    const r = FIELD_RECTS[f.id];
    if (!r) continue;
    const x = px(r.x0), y = pz(r.z0), w = (r.x1 - r.x0) * ppu, h = (r.z1 - r.z0) * ppu;
    const cx = x + w / 2, cy = y + h / 2;
    if (f.kind === 'straight') {
      g.fillStyle = COLORS[standardColor(f.value)];
      const pad = 18 * k;
      g.beginPath();
      if (f.value === 0) {
        g.moveTo(x + w - pad, y + pad);
        g.lineTo(x + pad * 1.5, cy);
        g.lineTo(x + w - pad, y + h - pad);
      } else {
        g.roundRect(x + pad, y + pad, w - 2 * pad, h - 2 * pad, 28 * k);
      }
      g.closePath();
      g.fill();
    }
    g.strokeStyle = 'rgba(245, 230, 190, 0.9)';
    g.lineWidth = 6 * k;
    g.strokeRect(x, y, w, h);

    g.fillStyle = '#f6ecd0';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (f.kind === 'red' || f.kind === 'black') {
      g.fillStyle = COLORS[f.kind];
      g.beginPath();
      g.moveTo(cx, cy - h * 0.32);
      g.lineTo(cx + w * 0.22, cy);
      g.lineTo(cx, cy + h * 0.32);
      g.lineTo(cx - w * 0.22, cy);
      g.closePath();
      g.fill();
      g.strokeStyle = '#f6ecd0';
      g.lineWidth = 5 * k;
      g.stroke();
    } else {
      const size = (f.kind === 'straight' ? 110 : f.kind === 'column' ? 60 : 78) * k;
      g.font = `700 ${size}px Georgia, serif`;
      const label = f.kind === 'column' ? '2:1' : f.label;
      if (f.kind === 'straight') {
        g.save();
        g.translate(cx, cy);
        g.fillText(label, 0, 6 * k);
        g.restore();
      } else {
        g.fillText(label, cx, cy + 4 * k);
      }
    }
  }
  // Outer frame line.
  g.strokeStyle = '#f0dca0';
  g.lineWidth = 14 * k;
  g.strokeRect(7 * k, 7 * k, c.width - 14 * k, c.height - 14 * k);
  return finish(c);
}

// ---- Wheel ---------------------------------------------------------------

/** Rotor-local angle of a pocket's center. Pockets run clockwise seen from above. */
export function pocketAngle(index: number): number {
  return -index * ((Math.PI * 2) / POCKET_COUNT);
}

export const WHEEL_RADII = { disc: 4.2, numbersIn: 3.55, pocketsIn: 2.85 };

export function drawWheelTexture(c: HTMLCanvasElement, wheel: Pocket[], highlight?: number, marks: number[] = []): void {
  const g = c.getContext('2d')!;
  const S = c.width;
  const cx = S / 2, cy = S / 2;
  const k = S / 2 / WHEEL_RADII.disc;
  const step = (Math.PI * 2) / POCKET_COUNT;
  g.clearRect(0, 0, S, S);

  // Wooden disc.
  const wood = g.createRadialGradient(cx, cy, 0, cx, cy, S / 2);
  wood.addColorStop(0, '#6b3a1c');
  wood.addColorStop(0.6, '#4a2410');
  wood.addColorStop(1, '#2b1408');
  g.fillStyle = wood;
  g.beginPath();
  g.arc(cx, cy, S / 2, 0, Math.PI * 2);
  g.fill();
  for (let i = 0; i < 24; i++) {
    g.strokeStyle = `rgba(0,0,0,${0.05 + Math.random() * 0.06})`;
    g.lineWidth = 2;
    g.beginPath();
    g.arc(cx, cy, (WHEEL_RADII.pocketsIn * k * i) / 24, 0, Math.PI * 2);
    g.stroke();
  }

  // Canvas angle for a math angle: y is flipped.
  const seg = (r0: number, r1: number, a: number, fill: string) => {
    g.fillStyle = fill;
    g.beginPath();
    g.arc(cx, cy, r1 * k, -(a + step / 2), -(a - step / 2));
    g.arc(cx, cy, r0 * k, -(a - step / 2), -(a + step / 2), true);
    g.closePath();
    g.fill();
  };

  for (const p of wheel) {
    const a = pocketAngle(p.index);
    const base = COLORS[p.color];
    seg(WHEEL_RADII.numbersIn, WHEEL_RADII.disc - 0.05, a, base);
    seg(WHEEL_RADII.pocketsIn, WHEEL_RADII.numbersIn, a, shade(base, -0.25));
    if (p.mod) {
      const info = POCKET_MOD_INFO[p.mod];
      seg(WHEEL_RADII.pocketsIn, WHEEL_RADII.pocketsIn + 0.22, a, info.color);
      seg(WHEEL_RADII.disc - 0.2, WHEEL_RADII.disc - 0.05, a, info.color);
    }
    if (marks.includes(p.index)) {
      g.globalAlpha = 0.55;
      seg(WHEEL_RADII.pocketsIn, WHEEL_RADII.disc, a, '#b48cff');
      g.globalAlpha = 1;
    }
    if (highlight === p.index) {
      g.globalAlpha = 0.45;
      seg(WHEEL_RADII.pocketsIn, WHEEL_RADII.disc, a, '#fff3a0');
      g.globalAlpha = 1;
    }
    // Number, rotated so it reads outward.
    const rt = ((WHEEL_RADII.numbersIn + WHEEL_RADII.disc) / 2) * k;
    g.save();
    g.translate(cx + rt * Math.cos(a), cy - rt * Math.sin(a));
    g.rotate(Math.PI / 2 - a);
    g.fillStyle = '#fbf3dc';
    g.font = `700 ${Math.round(S * 0.034)}px Georgia, serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(p.number), 0, 0);
    g.restore();
  }

  // Gold separators.
  g.strokeStyle = '#e9c46a';
  g.lineWidth = 3;
  for (let i = 0; i < POCKET_COUNT; i++) {
    const a = pocketAngle(i) + step / 2;
    g.beginPath();
    g.moveTo(cx + WHEEL_RADII.pocketsIn * k * Math.cos(a), cy - WHEEL_RADII.pocketsIn * k * Math.sin(a));
    g.lineTo(cx + WHEEL_RADII.disc * k * Math.cos(a), cy - WHEEL_RADII.disc * k * Math.sin(a));
    g.stroke();
  }
  for (const r of [WHEEL_RADII.pocketsIn, WHEEL_RADII.numbersIn, WHEEL_RADII.disc - 0.04]) {
    g.lineWidth = 5;
    g.beginPath();
    g.arc(cx, cy, r * k, 0, Math.PI * 2);
    g.stroke();
  }
}

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v + v * amt)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

// ---- Chips ---------------------------------------------------------------

const chipCache = new Map<number, THREE.CanvasTexture>();

/** Face of a casino chip of the given value. */
export function chipTexture(value: number): THREE.CanvasTexture {
  const hit = chipCache.get(value);
  if (hit) return hit;
  const d = CHIP_COLORS[value] ?? CHIP_COLORS[1];
  const [c, g] = canvas(256, 256);
  g.fillStyle = d.face;
  g.beginPath();
  g.arc(128, 128, 128, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = d.rim;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.beginPath();
    g.arc(128, 128, 128, a - 0.18, a + 0.18);
    g.arc(128, 128, 96, a + 0.18, a - 0.18, true);
    g.closePath();
    g.fill();
  }
  g.strokeStyle = d.rim;
  g.lineWidth = 5;
  g.setLineDash([10, 8]);
  g.beginPath();
  g.arc(128, 128, 80, 0, Math.PI * 2);
  g.stroke();
  g.setLineDash([]);
  g.fillStyle = d.rim;
  const label = chipLabel(value);
  g.font = `700 ${label.length > 2 ? 58 : 76}px Georgia, serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(label, 128, 134);
  const t = finish(c);
  chipCache.set(value, t);
  return t;
}

const sideCache = new Map<number, THREE.CanvasTexture>();

/** Edge of a casino chip: colored rim with light inserts. */
export function chipSideTexture(value: number): THREE.CanvasTexture {
  const hit = sideCache.get(value);
  if (hit) return hit;
  const d = CHIP_COLORS[value] ?? CHIP_COLORS[1];
  const [c, g] = canvas(256, 16);
  g.fillStyle = d.face;
  g.fillRect(0, 0, 256, 16);
  g.fillStyle = d.rim;
  for (let i = 0; i < 6; i++) g.fillRect(i * 43 + 8, 0, 14, 16);
  const t = finish(c);
  sideCache.set(value, t);
  return t;
}

export function carpetTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#3a0f18';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = '#4e1522';
  g.lineWidth = 5;
  for (let i = -1; i <= 1; i++) {
    g.beginPath();
    g.moveTo(128, 0 + i * 256);
    g.lineTo(256, 128 + i * 256);
    g.lineTo(128, 256 + i * 256);
    g.lineTo(0, 128 + i * 256);
    g.closePath();
    g.stroke();
  }
  g.strokeStyle = '#5a2030';
  g.lineWidth = 2;
  g.beginPath();
  g.arc(128, 128, 22, 0, Math.PI * 2);
  g.stroke();
  const t = finish(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(7, 6);
  return t;
}
