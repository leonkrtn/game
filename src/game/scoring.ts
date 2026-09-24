import { ITEMS, POCKET_MOD_INFO, type RuleId } from './content';
import { FIELD_BY_ID, fieldWins, isInsideCombo, isOutside } from './fields';
import type { Bets, ItemInstance, Pocket } from './types';
import { POCKET_COUNT } from './wheel';

/** Permanent boni from phone deals. */
export interface Perks {
  luck: number;
  interest: number;
  redMult: number;
  blackMult: number;
  extraRounds: number;
  slots: number;
}

export interface SpinInput {
  wheel: Pocket[];
  bets: Bets;
  items: ItemInstance[];
  rule?: RuleId;
  isLastSpin: boolean;
  /** Cash before the stakes were taken off, for "bet at least half" effects. */
  moneyBefore: number;
  perks: Perks;
  /** Field twisted by the magic cube this round. */
  cubeField?: string;
  /** Number of the previous round. */
  lastNumber?: number;
  /** Rounds lost in a row before this one. */
  lossStreak?: number;
  /** True when the bets equal last round's bets. */
  sameBets?: boolean;
}

export interface BetResult {
  fieldId: string;
  stake: number;
  won: boolean;
  payout: number;
  amount: number;
}

export type LineKind = 'bet' | 'add' | 'mul' | 'money' | 'marks';

export interface Line {
  kind: LineKind;
  text: string;
  amount: number;
  /** Item uid that triggered this line, for highlighting it on the table. */
  item?: number;
  fieldId?: string;
}

export interface SpinResult {
  pocket: Pocket;
  bets: BetResult[];
  lines: Line[];
  stake: number;
  sum: number;
  mult: number;
  /** Money paid back by the table (winnings including stakes, plus refunds). */
  payout: number;
  marks: number;
  anyWin: boolean;
  /** Item uid -> counter increment. */
  growth: Record<number, number>;
  /** Plein numbers that sat right next to the result on the wheel. */
  nearMiss: number[];
  /** Set when luck made the ball hop into a better pocket. */
  hop?: { from: number; to: number };
}

export const stakeOf = (stack: number[] | undefined) => (stack ?? []).reduce((a, b) => a + b, 0);

/** Items in table order; the mirror borrows its right neighbour's effect. */
export function activeItems(items: ItemInstance[]): { src: ItemInstance; inst: ItemInstance }[] {
  return items.flatMap((t, i) => {
    if (t.def !== 'spiegel') return [{ src: t, inst: t }];
    const next = items[i + 1];
    return next && next.def !== 'spiegel' ? [{ src: t, inst: next }] : [];
  });
}

export function luckOf(items: ItemInstance[], perks: Perks): number {
  const free = Math.max(0, perks.slots - items.length);
  return perks.luck + activeItems(items).reduce((a, x) => a + (ITEMS[x.inst.def].luck ?? 0) + (x.inst.def === 'hasenpfote' ? free : 0), 0);
}

/** Relative chance of the ball landing in each pocket. */
export function pocketWeights(wheel: Pocket[], bets: Bets, items: ItemInstance[], rule?: RuleId): number[] {
  const act = activeItems(items).map((x) => x.inst.def);
  const magnets = act.filter((d) => d === 'magnet').length;
  const skulls = act.filter((d) => d === 'totenkopf').length;
  const pleins = new Set(Object.keys(bets).filter((id) => FIELD_BY_ID[id].kind === 'straight').map((id) => FIELD_BY_ID[id].value));
  return wheel.map((p) => {
    let w = p.mod === 'schwer' ? 2 : 1;
    if (p.number === 0) {
      if (rule === 'nullnebel') w *= 4;
      w *= Math.pow(2, skulls);
    }
    if (pleins.has(p.number)) w *= Math.pow(2, magnets);
    return w;
  });
}

export function neighborIndices(index: number, reach = 1): number[] {
  const out: number[] = [];
  for (let d = 1; d <= reach; d++) out.push((index + d) % POCKET_COUNT, (index - d + POCKET_COUNT) % POCKET_COUNT);
  return out;
}

const fmtMult = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 2 });

export function scoreSpin(input: SpinInput, pocketIndex: number): SpinResult {
  const { wheel, bets, items, rule, perks } = input;
  const pocket = wheel[pocketIndex];
  const lines: Line[] = [];
  const results: BetResult[] = [];
  const active = activeItems(items);

  // 1. Which bets win.
  for (const [fid, stack] of Object.entries(bets)) {
    const f = FIELD_BY_ID[fid];
    const stake = stakeOf(stack);
    if (!stake) continue;
    let won = fieldWins(f, pocket);
    let payout = f.payout;
    if (f.kind === 'red' && rule === 'rotfluch') won = false;
    if (f.kind === 'straight' && rule === 'halbzahl') payout = 18;
    results.push({ fieldId: fid, stake, won, payout: won ? payout : 0, amount: won ? stake * payout : 0 });
  }
  // The pager turns near misses on pleins into small wins.
  const pagers = activeItems(items).filter((x) => x.inst.def === 'pager');
  if (pagers.length) {
    const near = neighborIndices(pocketIndex).map((i) => wheel[i].number);
    for (const r of results) {
      const f = FIELD_BY_ID[r.fieldId];
      if (!r.won && f.kind === 'straight' && near.includes(f.value)) {
        r.won = true;
        r.payout = 8;
        r.amount = r.stake * 8;
      }
    }
  }
  const winners = results.filter((r) => r.won);
  const anyWin = winners.length > 0;
  const stake = results.reduce((a, r) => a + r.stake, 0);
  for (const w of winners) {
    lines.push({ kind: 'bet', text: `${FIELD_BY_ID[w.fieldId].label}: $${w.stake} × ${w.payout}`, amount: w.amount, fieldId: w.fieldId });
  }
  let sum = winners.reduce((a, r) => a + r.amount, 0);
  for (const { src, inst } of active) {
    if (inst.def === 'pfennig' && winners.length) {
      const bonus = 5 * winners.length;
      sum += bonus;
      lines.push({ kind: 'bet', text: `${ITEMS[src.def].name}: +$${bonus}`, amount: bonus, item: src.uid });
    }
  }

  const neighbors = neighborIndices(pocketIndex).map((i) => wheel[i].number);
  const nearMiss = results
    .filter((r) => !r.won && FIELD_BY_ID[r.fieldId].kind === 'straight' && neighbors.includes(FIELD_BY_ID[r.fieldId].value))
    .map((r) => FIELD_BY_ID[r.fieldId].value);

  // 2. Additive mult.
  let mult = 1;
  const add = (text: string, amount: number, item?: number) => {
    if (amount === 0 || !anyWin) return;
    mult += amount;
    lines.push({ kind: 'add', text: `${text} +${fmtMult(amount)}`, amount, item });
  };
  if (pocket.color === 'red') add('Rote Tinte', perks.redMult);
  if (pocket.color === 'black') add('Schwarzes Buch', perks.blackMult);
  if (pocket.mod === 'flamme') add('Flammenfach', 1);

  const kinds = new Set(winners.map((w) => FIELD_BY_ID[w.fieldId].kind));
  const straightWin = winners.some((w) => FIELD_BY_ID[w.fieldId].kind === 'straight' && w.payout >= 18);
  const growth: Record<number, number> = {};
  for (const { src, inst } of active) {
    const name = ITEMS[src.def].name;
    switch (inst.def) {
      case 'kerze':
        if (pocket.color === 'red') add(name, 1, src.uid);
        break;
      case 'katze':
        if (pocket.color === 'black') add(name, 1, src.uid);
        break;
      case 'wuerfel':
        if (winners.some((w) => isOutside(FIELD_BY_ID[w.fieldId]) && !['red', 'black'].includes(FIELD_BY_ID[w.fieldId].kind))) add(name, 1, src.uid);
        break;
      case 'abakus':
        if (kinds.has('dozen') || kinds.has('column')) add(name, 1.5, src.uid);
        break;
      case 'fernglas':
        if (winners.some((w) => isInsideCombo(FIELD_BY_ID[w.fieldId]))) add(name, 2, src.uid);
        break;
      case 'zinnsoldat':
        if (results.length >= 4) add(name, 1, src.uid);
        break;
      case 'walkman':
        if (results.length === 1) add(name, 1, src.uid);
        break;
      case 'kassette':
        if (input.sameBets) add(name, 1, src.uid);
        break;
      case 'goldkette':
        add(name, Math.min(3, Math.floor(input.moneyBefore / 50) * 0.1), src.uid);
        break;
      case 'glocke':
        if (anyWin) growth[inst.uid] = 1;
        add(name, 0.2 * (inst.counter + (growth[inst.uid] ?? 0)), src.uid);
        break;
      case 'rabe':
        if (!anyWin && stake > 0) growth[inst.uid] = 1;
        add(name, 0.5 * inst.counter, src.uid);
        break;
    }
  }

  // 3. Multiplicative mult.
  const mul = (text: string, factor: number, item?: number) => {
    if (!anyWin) return;
    mult *= factor;
    lines.push({ kind: 'mul', text: `${text} ×${fmtMult(factor)}`, amount: factor, item });
  };
  if (pocket.mod === 'kristall') mul('Kristallfach', 2);
  for (const { src, inst } of active) {
    const name = ITEMS[src.def].name;
    if (inst.def === 'totenkopf' && pocket.number === 0) mul(name, 6, src.uid);
    if (inst.def === 'winkekatze' && straightWin) mul(name, 2, src.uid);
    if (inst.def === 'sanduhr' && input.isLastSpin) mul(name, 2, src.uid);
    if (inst.def === 'goldbarren' && pocket.mod === 'gold') mul(name, 2, src.uid);
    if (inst.def === 'zigarre' && stake >= input.moneyBefore / 2) mul(name, 1.5, src.uid);
    if (inst.def === 'teufel') mul(name, 2, src.uid);
    if (inst.def === 'zippo' && (input.lossStreak ?? 0) >= 2) mul(name, 2, src.uid);
    if (inst.def === 'polaroid' && input.lastNumber === pocket.number) mul(name, 5, src.uid);
    if (inst.def === 'zauberwuerfel' && input.cubeField && winners.some((w) => w.fieldId === input.cubeField)) mul(name, 3, src.uid);
  }
  mult = Math.round(mult * 1000) / 1000;

  // 4. Money and marks.
  let payout = Math.floor(sum * mult);
  if (!anyWin && stake > 0) {
    for (const { src, inst } of active) {
      if (inst.def !== 'police') continue;
      const back = Math.floor(stake * 0.3);
      if (back > 0) {
        payout += back;
        lines.push({ kind: 'money', text: `${ITEMS[src.def].name}: 30 % zurück`, amount: back, item: src.uid });
      }
    }
  }
  let marks = 0;
  if (pocket.mod === 'gold') {
    marks++;
    lines.push({ kind: 'marks', text: `${POCKET_MOD_INFO.gold.name}fach`, amount: 1 });
  }

  return { pocket, bets: results, lines, stake, sum, mult, payout, marks, anyWin, growth, nearMiss };
}
