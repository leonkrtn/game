import { CHIPS, TALISMANS, POCKET_MOD_INFO, type BossId } from './content';
import { FIELD_BY_ID, fieldWins, isOutside } from './fields';
import type { Rng } from './rng';
import type { ChipInstance, Pocket, TalismanInstance } from './types';
import { COLOR_NAME, POCKET_COUNT } from './wheel';

export type Placed = Record<string, ChipInstance[]>;

export interface SpinInput {
  wheel: Pocket[];
  placed: Placed;
  talismans: TalismanInstance[];
  boss?: BossId;
  isLastSpin: boolean;
  money: number;
  winStreak: number;
  bonusMult: number;
  paidRates: number;
}

export interface ChipResult {
  uid: number;
  def: string;
  fieldId: string;
  won: boolean;
  value: number;
  payout: number;
  score: number;
}

export type LineKind = 'info' | 'sum' | 'add' | 'mul' | 'money';

export interface Line {
  kind: LineKind;
  text: string;
  amount: number;
  /** Talisman uid that triggered this line, for UI highlighting. */
  talisman?: number;
}

export interface SpinResult {
  pocket: Pocket;
  chips: ChipResult[];
  lines: Line[];
  sum: number;
  mult: number;
  score: number;
  money: number;
  broken: number[];
  anyWin: boolean;
  winStreak: number;
  /** Talisman uid -> counter increment. */
  growth: Record<number, number>;
}

/** Relative chance of the ball landing in each pocket. */
export function pocketWeights(wheel: Pocket[], placed: Placed, talismans: TalismanInstance[], boss?: BossId): number[] {
  const magnetPower = talismans.some((t) => t.def === 'magnetfeld') ? 3 : 1;
  const magnetsOn: Record<number, number> = {};
  for (const [fid, chips] of Object.entries(placed)) {
    const f = FIELD_BY_ID[fid];
    if (f.kind !== 'straight') continue;
    const m = chips.filter((c) => c.def === 'magnet').length;
    if (m) magnetsOn[f.value] = (magnetsOn[f.value] ?? 0) + m;
  }
  return wheel.map((p) => {
    let w = p.mod === 'schwer' ? 2 : 1;
    if (boss === 'nullnebel' && p.number === 0) w *= 4;
    w += (magnetsOn[p.number] ?? 0) * magnetPower;
    return w;
  });
}

function neighborNumbers(wheel: Pocket[], index: number): number[] {
  return [wheel[(index + 1) % POCKET_COUNT].number, wheel[(index + POCKET_COUNT - 1) % POCKET_COUNT].number];
}

export function scoreSpin(input: SpinInput, pocketIndex: number, rng: Rng): SpinResult {
  const { wheel, placed, talismans, boss } = input;
  const pocket = wheel[pocketIndex];
  const has = (id: string) => talismans.find((t) => t.def === id);
  const lines: Line[] = [];
  const chips: ChipResult[] = [];

  lines.push({ kind: 'info', text: `Kugel: ${pocket.number} ${COLOR_NAME[pocket.color]}`, amount: 0 });

  // 1. Which chips win, and at what payout.
  const neighbors = neighborNumbers(wheel, pocketIndex);
  for (const [fid, stack] of Object.entries(placed)) {
    const f = FIELD_BY_ID[fid];
    for (const c of stack) {
      let won = fieldWins(f, pocket);
      let payout = f.payout;
      if (f.kind === 'red' && boss === 'rotfluch') won = false;
      if (f.kind === 'straight' && boss === 'halbzahl') payout = 18;
      if (!won && c.def === 'nachbar' && f.kind === 'straight' && neighbors.includes(f.value)) {
        won = true;
        payout = 9;
      }
      chips.push({ uid: c.uid, def: c.def, fieldId: fid, won, value: CHIPS[c.def].value, payout: won ? payout : 0, score: 0 });
    }
  }
  const winners = chips.filter((c) => c.won);
  const anyWin = winners.length > 0;
  const winStreak = anyWin ? input.winStreak + 1 : 0;

  // 2. Chip values and the sum.
  const vorsicht = has('vorsicht');
  for (const c of winners) {
    const f = FIELD_BY_ID[c.fieldId];
    if (c.def === 'ketten') c.value += 10 * (winners.length - 1);
    if (c.def === 'turm') c.value += 15 * (placed[c.fieldId].length - 1);
    if (vorsicht && isOutside(f)) c.value += 15;
    c.score = c.value * c.payout;
  }
  const sum = winners.reduce((a, c) => a + c.score, 0);
  lines.push({ kind: 'sum', text: `${winners.length} von ${chips.length} Jetons gewinnen`, amount: sum });

  // 3. Additive mult.
  let mult = 1;
  const add = (text: string, amount: number, talisman?: number) => {
    if (amount === 0) return;
    mult += amount;
    lines.push({ kind: 'add', text, amount, talisman });
  };
  const count = (def: string, pred: (c: ChipResult) => boolean = () => true) =>
    chips.filter((c) => c.def === def && pred(c)).length;

  if (pocket.color === 'red') add('Rot-Jetons', 3 * count('rot'));
  if (pocket.color === 'black') add('Schwarz-Jetons', 3 * count('schwarz'));
  add('Versicherung', 3 * count('versicherung', (c) => !c.won));
  if (pocket.mod === 'flamme') add('Flammenfach', 4);
  add('Glücksmünzen', input.bonusMult);

  const growth: Record<number, number> = {};
  const straightWin = winners.some((c) => FIELD_BY_ID[c.fieldId].kind === 'straight' && c.payout >= 18);
  for (const t of talismans) {
    const name = TALISMANS[t.def].name;
    switch (t.def) {
      case 'rotfuchs':
        if (pocket.color === 'red') add(name, 4, t.uid);
        break;
      case 'nachteule':
        if (pocket.color === 'black') add(name, 4, t.uid);
        break;
      case 'hochstapler': {
        const stacks = Object.entries(placed).filter(
          ([fid, s]) => s.length >= 2 && winners.some((w) => w.fieldId === fid),
        ).length;
        add(name, 2 * stacks, t.uid);
        break;
      }
      case 'dutzend': {
        const n = winners.filter((c) => ['dozen', 'column'].includes(FIELD_BY_ID[c.fieldId].kind)).length;
        add(name, 2 * n, t.uid);
        break;
      }
      case 'serie':
        growth[t.uid] = winStreak - t.counter;
        add(name, winStreak, t.uid);
        break;
      case 'sammler':
        add(name, talismans.length, t.uid);
        break;
      case 'schuldner':
        add(name, 2 * input.paidRates, t.uid);
        break;
      case 'kopierer': {
        const copies = wheel.filter((p) => p.number === pocket.number).length - 1;
        add(name, 3 * copies, t.uid);
        break;
      }
      case 'wachstum':
        if (straightWin) growth[t.uid] = 1;
        add(name, t.counter + (growth[t.uid] ?? 0), t.uid);
        break;
    }
  }

  // 4. Multiplicative mult.
  const mul = (text: string, factor: number, talisman?: number) => {
    mult *= factor;
    lines.push({ kind: 'mul', text, amount: factor, talisman });
  };
  const broken: number[] = [];
  for (const c of winners) {
    if (c.def !== 'glas') continue;
    mul('Glas-Jeton', 2);
    if (rng.chance(0.25)) broken.push(c.uid);
  }
  if (pocket.mod === 'kristall') mul('Kristallfach', 2);
  for (const t of talismans) {
    const name = TALISMANS[t.def].name;
    if (t.def === 'nullheld' && pocket.number === 0) mul(name, 6, t.uid);
    if (t.def === 'scharfschuetze' && straightWin) mul(name, 2, t.uid);
    if (t.def === 'letzterwurf' && input.isLastSpin) mul(name, 2, t.uid);
  }

  // 5. Interest on cash, paid on top of the winnings.
  let money = 0;
  const zins = count('zins', (c) => c.won);
  if (zins) {
    const z = Math.floor(input.money * 0.05 * zins);
    money += z;
    lines.push({ kind: 'money', text: 'Zins-Jetons', amount: z });
  }
  if (pocket.mod === 'gold') {
    const z = Math.floor(input.money * 0.1);
    money += z;
    lines.push({ kind: 'money', text: `${POCKET_MOD_INFO.gold.name}fach`, amount: z });
  }

  mult = Math.round(mult * 100) / 100;
  const score = Math.floor(sum * mult);
  return { pocket, chips, lines, sum, mult, score, money, broken, anyWin, winStreak, growth };
}
