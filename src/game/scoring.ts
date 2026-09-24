import { ITEMS, POCKET_MOD_INFO, SETS, type RuleId, type SetDef } from './content';
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
  /** News flash of the current rate. */
  news?: string;
  /** Ball in play. */
  ball?: string;
  /** One-shot items used for this spin. */
  boost?: Boost;
  /** Last spin of the rate played as all-or-nothing: ×2 Mult. */
  highRisk?: boolean;
}

/** Effects of cigarette-machine items that last for one spin. */
export interface Boost {
  luck: number;
  gezinkt: boolean;
  kreide: boolean;
  kaugummi: boolean;
  korn: boolean;
}

export const noBoost = (): Boost => ({ luck: 0, gezinkt: false, kreide: false, kaugummi: false, korn: false });

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

/** Most of a lost stake that refunds can give back. */
export const MAX_REFUND = 0.9;

export const stakeOf = (stack: number[] | undefined) => (stack ?? []).reduce((a, b) => a + b, 0);

/** Items in table order; the mirror borrows its right neighbour's effect. */
export function activeItems(items: ItemInstance[]): { src: ItemInstance; inst: ItemInstance }[] {
  return items.flatMap((t, i) => {
    if (t.def !== 'spiegel') return [{ src: t, inst: t }];
    const next = items[i + 1];
    return next && next.def !== 'spiegel' ? [{ src: t, inst: next }] : [];
  });
}

/** Strength of an item: 2 when golden (a mirror counts as golden when it or its target is). */
export const levelOf = (x: { src: ItemInstance; inst: ItemInstance }) => (x.src.gold || x.inst.gold ? 2 : 1);

/** Sets whose three talismans all stand on the table. */
export function activeSets(items: ItemInstance[]): SetDef[] {
  const defs = new Set(items.map((t) => t.def));
  return SETS.filter((s) => s.items.every((d) => defs.has(d)));
}

export const hasSet = (items: ItemInstance[], id: string) => activeSets(items).some((s) => s.id === id);

export function luckOf(items: ItemInstance[], perks: Perks): number {
  const free = Math.max(0, perks.slots - items.length);
  const fromItems = activeItems(items).reduce((a, x) => a + ((ITEMS[x.inst.def].luck ?? 0) + (x.inst.def === 'hasenpfote' ? free : 0)) * (ITEMS[x.inst.def].rarity === 'legendary' ? 1 : levelOf(x)), 0);
  return perks.luck + fromItems + (hasSet(items, 'aberglaube') ? 3 : 0);
}

/** Relative chance of the ball landing in each pocket. */
export function pocketWeights(wheel: Pocket[], bets: Bets, items: ItemInstance[], rule?: RuleId, extra: { ball?: string; kreide?: boolean } = {}): number[] {
  const act = activeItems(items);
  const magnet = act.filter((x) => x.inst.def === 'magnet').reduce((a, x) => a * (levelOf(x) === 2 ? 3 : 2), 1);
  const skulls = act.filter((x) => x.inst.def === 'totenkopf').length;
  const pleins = new Set(Object.keys(bets).filter((id) => FIELD_BY_ID[id].kind === 'straight').map((id) => FIELD_BY_ID[id].value));
  return wheel.map((p) => {
    let w = p.mod === 'schwer' ? 2 : 1;
    if (p.number === 0) {
      if (rule === 'nullnebel') w *= 4;
      if (extra.ball === 'elfenbein') w *= 2;
      w *= Math.pow(2, skulls);
    }
    if (pleins.has(p.number)) w *= magnet * (extra.kreide ? 3 : 1);
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
  const pagerPay = pagers.some((x) => levelOf(x) === 2) ? 16 : 8;
  if (pagers.length) {
    const near = neighborIndices(pocketIndex).map((i) => wheel[i].number);
    for (const r of results) {
      const f = FIELD_BY_ID[r.fieldId];
      if (!r.won && f.kind === 'straight' && near.includes(f.value)) {
        r.won = true;
        r.payout = pagerPay;
        r.amount = r.stake * pagerPay;
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
  for (const x of active) {
    if (x.inst.def === 'pfennig' && winners.length) {
      const bonus = 5 * levelOf(x) * winners.length;
      sum += bonus;
      lines.push({ kind: 'bet', text: `${ITEMS[x.src.def].name}: +$${bonus}`, amount: bonus, item: x.src.uid });
    }
  }
  const sets = activeSets(items);
  if (sets.some((z) => z.id === 'spieler') && sum > 0) {
    const bonus = Math.floor(sum / 2);
    sum += bonus;
    lines.push({ kind: 'bet', text: 'Set Alter Zocker: +50 %', amount: bonus });
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
    lines.push({ kind: 'add', text: `${text} ${amount < 0 ? '−' : '+'}${fmtMult(Math.abs(amount))}`, amount, item });
  };
  const glass = input.ball === 'glas';
  if (pocket.color === 'red') add('Rote Tinte', perks.redMult);
  if (pocket.color === 'black') add('Schwarzes Buch', perks.blackMult);
  if (pocket.mod === 'flamme') add(glass ? 'Flammenfach (Glaskugel)' : 'Flammenfach', glass ? 2 : 1);
  if (input.news === 'hitze' && pocket.color === 'red') add('Hitzewelle', 1);
  if (input.news === 'nebel' && pocket.color === 'black') add('Nebel am Hafen', 1);
  if (input.ball === 'blei') add('Bleikugel', 1);
  if (input.ball === 'onyx' && pocket.color === 'black') add('Onyx', 1.5);
  if (input.ball === 'onyx' && pocket.color === 'red') add('Onyx', -0.5);
  if (input.boost?.korn) add('Doppelkorn', 2);

  const kinds = new Set(winners.map((w) => FIELD_BY_ID[w.fieldId].kind));
  const straightWin = winners.some((w) => FIELD_BY_ID[w.fieldId].kind === 'straight' && w.payout >= 18);
  const growth: Record<number, number> = {};
  for (const x of active) {
    const { src, inst } = x;
    const name = ITEMS[src.def].name + (levelOf(x) === 2 ? ' (golden)' : '');
    const g = levelOf(x);
    switch (inst.def) {
      case 'kerze':
        if (pocket.color === 'red') add(name, g, src.uid);
        break;
      case 'katze':
        if (pocket.color === 'black') add(name, g, src.uid);
        break;
      case 'wuerfel':
        if (winners.some((w) => isOutside(FIELD_BY_ID[w.fieldId]) && !['red', 'black'].includes(FIELD_BY_ID[w.fieldId].kind))) add(name, g, src.uid);
        break;
      case 'abakus':
        if (kinds.has('dozen') || kinds.has('column')) add(name, 1.5 * g, src.uid);
        break;
      case 'fernglas':
        if (winners.some((w) => isInsideCombo(FIELD_BY_ID[w.fieldId]))) add(name, 2 * g, src.uid);
        break;
      case 'zinnsoldat':
        if (results.length >= 4) add(name, g, src.uid);
        break;
      case 'walkman':
        if (results.length && results.every((r) => FIELD_BY_ID[r.fieldId].kind === 'straight')) add(name, 2 * g, src.uid);
        break;
      case 'kassette':
        if (input.sameBets) add(name, g, src.uid);
        break;
      case 'goldkette':
        add(name, Math.min(3 * g, Math.floor(input.moneyBefore / 50) * 0.1 * g), src.uid);
        break;
      case 'glocke':
        if (anyWin) growth[inst.uid] = 1;
        add(name, 0.2 * g * (inst.counter + (growth[inst.uid] ?? 0)), src.uid);
        break;
      case 'rabe':
        if (!anyWin && stake > 0) growth[inst.uid] = 1;
        add(name, 0.5 * g * inst.counter, src.uid);
        break;
    }
  }

  // 3. Multiplicative mult.
  const mul = (text: string, factor: number, item?: number) => {
    if (!anyWin) return;
    mult *= factor;
    lines.push({ kind: 'mul', text: `${text} ×${fmtMult(factor)}`, amount: factor, item });
  };
  if (pocket.mod === 'kristall') mul(glass ? 'Kristallfach (Glaskugel)' : 'Kristallfach', glass ? 4 : 2);
  for (const x of active) {
    const { src, inst } = x;
    const name = ITEMS[src.def].name + (levelOf(x) === 2 ? ' (golden)' : '');
    const up = (f: number) => (levelOf(x) === 2 ? 2 * f - 1 : f);
    if (inst.def === 'totenkopf' && pocket.number === 0) mul(name, up(6), src.uid);
    if (inst.def === 'winkekatze' && straightWin) mul(name, up(2), src.uid);
    if (inst.def === 'sanduhr' && input.isLastSpin) mul(name, up(2), src.uid);
    if (inst.def === 'goldbarren' && pocket.mod === 'gold') mul(name, up(2), src.uid);
    if (inst.def === 'zigarre' && stake >= input.moneyBefore / 2) mul(name, levelOf(x) === 2 ? 2 : 1.5, src.uid);
    if (inst.def === 'teufel') mul(name, 2, src.uid);
    if (inst.def === 'zippo' && (input.lossStreak ?? 0) >= 2) mul(name, up(2), src.uid);
    if (inst.def === 'polaroid' && input.lastNumber === pocket.number) mul(name, up(5), src.uid);
    if (inst.def === 'zauberwuerfel' && input.cubeField && winners.some((w) => w.fieldId === input.cubeField)) mul(name, up(3), src.uid);
  }
  if (sets.some((z) => z.id === 'nacht') && (pocket.color === 'black' || pocket.number === 0)) mul('Set Schwarze Nacht', 2);
  if (sets.some((z) => z.id === 'feuer') && pocket.color === 'red') mul('Set Feuerteufel', 2);
  // The mixtape set also turns the pager's near misses into full plein wins for its ×3.
  if (sets.some((z) => z.id === 'achtziger') && winners.some((w) => FIELD_BY_ID[w.fieldId].kind === 'straight')) mul('Set Mixtape 87', 3);
  if (input.news === 'lotto' && straightWin) mul('Lottofieber', 1.5);
  if (input.news === 'komet' && pocket.number === 0) mul('Komet', 3);
  if (input.news === 'inflation') mul('Inflation', 1.2);
  if (input.highRisk) mul('Hochrisiko', 2);
  mult = Math.round(mult * 1000) / 1000;

  // 4. Money and marks.
  let payout = Math.floor(sum * mult);
  if (!anyWin && stake > 0) {
    // Refunds never add up to more than 90 % of the stake: losing must still cost something.
    let left = Math.floor(stake * MAX_REFUND);
    const refund = (name: string, share: number, item?: number) => {
      const back = Math.min(left, Math.floor(stake * share));
      if (back <= 0) return;
      left -= back;
      payout += back;
      lines.push({ kind: 'money', text: `${name}: ${Math.round((back / stake) * 100)} % zurück`, amount: back, item });
    };
    for (const x of active) {
      if (x.inst.def !== 'police') continue;
      refund(ITEMS[x.src.def].name, levelOf(x) === 2 ? 0.6 : 0.3, x.src.uid);
    }
    if (input.boost?.kaugummi) refund('Kaugummi', 0.5);
  }
  let marks = 0;
  if (pocket.mod === 'gold') {
    const m = glass ? 2 : 1;
    marks += m;
    lines.push({ kind: 'marks', text: `${POCKET_MOD_INFO.gold.name}fach`, amount: m });
  }
  if (input.ball === 'kupfer') {
    const n = winners.filter((w) => FIELD_BY_ID[w.fieldId].kind === 'straight' && w.payout >= 18).length;
    if (n) {
      marks += n;
      lines.push({ kind: 'marks', text: 'Kupferkugel', amount: n });
    }
  }

  return { pocket, bets: results, lines, stake, sum, mult, payout, marks, anyWin, growth, nearMiss };
}
