import type { Field, Pocket } from './types';

function build(): Field[] {
  const f: Field[] = [];
  for (let n = 0; n <= 36; n++) {
    f.push({ id: `n${n}`, kind: 'straight', value: n, label: `${n}`, payout: 36 });
  }
  for (let c = 0; c < 3; c++) {
    f.push({ id: `col${c}`, kind: 'column', value: c, label: `Kolonne ${c + 1}`, payout: 3 });
  }
  const dozenLabels = ['1–12', '13–24', '25–36'];
  for (let d = 0; d < 3; d++) {
    f.push({ id: `doz${d}`, kind: 'dozen', value: d, label: dozenLabels[d], payout: 3 });
  }
  f.push({ id: 'low', kind: 'low', value: 0, label: '1–18', payout: 2 });
  f.push({ id: 'even', kind: 'even', value: 0, label: 'Gerade', payout: 2 });
  f.push({ id: 'red', kind: 'red', value: 0, label: 'Rot', payout: 2 });
  f.push({ id: 'black', kind: 'black', value: 0, label: 'Schwarz', payout: 2 });
  f.push({ id: 'odd', kind: 'odd', value: 0, label: 'Ungerade', payout: 2 });
  f.push({ id: 'high', kind: 'high', value: 0, label: '19–36', payout: 2 });
  return f;
}

export const FIELDS: readonly Field[] = build();
export const FIELD_BY_ID: Record<string, Field> = Object.fromEntries(FIELDS.map((f) => [f.id, f]));

export function isOutside(f: Field): boolean {
  return f.kind !== 'straight' && f.kind !== 'column' && f.kind !== 'dozen';
}

export function fieldWins(f: Field, p: Pocket): boolean {
  const n = p.number;
  switch (f.kind) {
    case 'straight':
      return n === f.value;
    case 'column':
      return n !== 0 && (n - 1) % 3 === f.value;
    case 'dozen':
      return n !== 0 && Math.floor((n - 1) / 12) === f.value;
    case 'low':
      return n >= 1 && n <= 18;
    case 'high':
      return n >= 19 && n <= 36;
    case 'even':
      return n !== 0 && n % 2 === 0;
    case 'odd':
      return n % 2 === 1;
    case 'red':
      return p.color === 'red';
    case 'black':
      return p.color === 'black';
  }
}
