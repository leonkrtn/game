import type { BetKind, Field, InsideKind, Pocket } from './types';

const INSIDE_PAYOUT: Record<InsideKind, number> = { straight: 36, split: 18, street: 12, corner: 9, sixline: 6 };

export const KIND_NAME: Record<BetKind, string> = {
  straight: 'Plein', split: 'Cheval (Split)', street: 'Transversale', corner: 'Carré', sixline: 'Sechserreihe',
  column: 'Kolonne', dozen: 'Dutzend', low: 'Manque', high: 'Passe', even: 'Pair', odd: 'Impair', red: 'Rouge', black: 'Noir',
};

function inside(kind: InsideKind, id: string, numbers: number[]): Field {
  const sorted = [...numbers].sort((a, b) => a - b);
  const label = kind === 'street' || kind === 'sixline' ? `${sorted[0]}–${sorted[sorted.length - 1]}` : sorted.join(' / ');
  return { id, kind, numbers: sorted, value: sorted[0], label, payout: INSIDE_PAYOUT[kind] };
}

/** Number at column c (0..11), row r (0 = bottom row 1,4,7…). */
const num = (c: number, r: number) => 3 * c + r + 1;

function build(): Field[] {
  const f: Field[] = [];
  for (let n = 0; n <= 36; n++) f.push(inside('straight', `n${n}`, [n]));
  // Splits: horizontal neighbours (same row), vertical neighbours (same column), and the zero.
  for (let c = 0; c < 11; c++) for (let r = 0; r < 3; r++) f.push(inside('split', `sh${c}-${r}`, [num(c, r), num(c + 1, r)]));
  for (let c = 0; c < 12; c++) for (let r = 0; r < 2; r++) f.push(inside('split', `sv${c}-${r}`, [num(c, r), num(c, r + 1)]));
  for (let r = 0; r < 3; r++) f.push(inside('split', `sz${r}`, [0, r + 1]));
  for (let c = 0; c < 12; c++) f.push(inside('street', `st${c}`, [num(c, 0), num(c, 1), num(c, 2)]));
  for (let c = 0; c < 11; c++) {
    for (let r = 0; r < 2; r++) f.push(inside('corner', `co${c}-${r}`, [num(c, r), num(c, r + 1), num(c + 1, r), num(c + 1, r + 1)]));
  }
  for (let c = 0; c < 11; c++) {
    f.push(inside('sixline', `sl${c}`, [0, 1, 2].flatMap((r) => [num(c, r), num(c + 1, r)])));
  }
  for (let c = 0; c < 3; c++) f.push({ id: `col${c}`, kind: 'column', numbers: [], value: c, label: `Kolonne ${c + 1}`, payout: 3 });
  const dozenLabels = ['1–12', '13–24', '25–36'];
  for (let d = 0; d < 3; d++) f.push({ id: `doz${d}`, kind: 'dozen', numbers: [], value: d, label: dozenLabels[d], payout: 3 });
  const outside: [BetKind, string, string][] = [
    ['low', 'low', '1–18'], ['even', 'even', 'Gerade'], ['red', 'red', 'Rot'],
    ['black', 'black', 'Schwarz'], ['odd', 'odd', 'Ungerade'], ['high', 'high', '19–36'],
  ];
  for (const [kind, id, label] of outside) f.push({ id, kind, numbers: [], value: 0, label, payout: 2 });
  return f;
}

export const FIELDS: readonly Field[] = build();
export const FIELD_BY_ID: Record<string, Field> = Object.fromEntries(FIELDS.map((f) => [f.id, f]));

export function isInsideCombo(f: Field): boolean {
  return f.kind === 'split' || f.kind === 'street' || f.kind === 'corner' || f.kind === 'sixline';
}

export function isNumberBet(f: Field): boolean {
  return f.kind === 'straight' || isInsideCombo(f);
}

export function isOutside(f: Field): boolean {
  return ['low', 'high', 'even', 'odd', 'red', 'black'].includes(f.kind);
}

export function fieldWins(f: Field, p: Pocket): boolean {
  const n = p.number;
  switch (f.kind) {
    case 'straight':
    case 'split':
    case 'street':
    case 'corner':
    case 'sixline':
      return f.numbers.includes(n);
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
