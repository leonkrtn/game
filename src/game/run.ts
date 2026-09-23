import {
  BASE_INTEREST, DEBTS, ITEMS, itemPrice, MAX_SLOTS, OFFERS, POCKET_ITEMS, RARITY, ROUNDS_PER_CYCLE, RULES,
  START_KITS, START_SLOTS, type PocketToolId, type RuleId,
} from './content';
import { FIELD_BY_ID, isInsideCombo } from './fields';
import { Rng } from './rng';
import { luckOf, neighborIndices, pocketWeights, scoreSpin, stakeOf, type Perks, type SpinResult } from './scoring';
import type { Bets, Color, ItemInstance, Pocket, ShopItem } from './types';
import { standardColor, WHEEL_ORDER } from './wheel';

export const RUSH_SECONDS = 15;
export const MAX_HOP_CHANCE = 0.6;
export const HOP_PER_LUCK = 0.06;

/**
 * betting  – stakes can be placed, cashier and showcase are open
 * spinning – the ball is rolling
 * due      – all rounds of the cycle are played, the rate must be paid at the cashier
 * gameover – the rate could not be paid
 * victory  – the last rate is paid (the run can continue endlessly)
 */
export type RunPhase = 'betting' | 'spinning' | 'due' | 'gameover' | 'victory';

export interface RunOptions {
  seed?: number;
  kit?: string;
  /** Item ids that are not unlocked yet and never appear in the showcase. */
  locked?: Set<string>;
}

export interface RunStats {
  spins: number;
  bestWin: number;
  totalWon: number;
  maxMoney: number;
  straightWins: number;
  insideWins: number;
  zeroHits: number;
  hops: number;
  lossStreak: number;
  maxLossStreak: number;
  renumbers: number;
  maxItems: number;
  loansRepaid: number;
  earlyPays: number;
}

export class Run {
  readonly rng: Rng;
  readonly kitId: string;
  phase: RunPhase = 'betting';
  /** Index of the current rate (0-based). */
  cycle = 0;
  paidRates = 0;
  cash = 0;
  deposit = 0;
  marks = 0;
  roundsLeft = 0;
  cycleRounds = 0;
  rule?: RuleId;
  nextRule: RuleId;
  perks: Perks = { luck: 0, interest: 0, redMult: 0, blackMult: 0, extraRounds: 0, slots: START_SLOTS };
  /** Adjustments of the current rate from phone deals. */
  debtFactor = 1;
  debtAdd = 0;
  /** Adjustments that land on the next rate. */
  nextDebtFactor = 1;
  nextDebtAdd = 0;
  /** Deals offered by the phone; empty when it is not ringing. */
  offers: string[] = [];
  /** Pockets shown by the crystal ball this round. */
  visions: number[] = [];

  wheel: Pocket[];
  items: ItemInstance[] = [];
  bets: Bets = {};
  lastBets: Bets = {};
  shop: ShopItem[] = [];
  rerollCost = 1;
  lastResult?: SpinResult;
  lastInterest = 0;
  lastPayMarks = 0;
  /** Last results, newest first, for the marquee. */
  history: { n: number; c: Color }[] = [];
  stats: RunStats = {
    spins: 0, bestWin: 0, totalWon: 0, maxMoney: 0, straightWins: 0, insideWins: 0, zeroHits: 0, hops: 0,
    lossStreak: 0, maxLossStreak: 0, renumbers: 0, maxItems: 0, loansRepaid: 0, earlyPays: 0,
  };
  private locked: Set<string>;
  private uid = 1;
  private loanRunning = false;

  constructor(opts: RunOptions = {}) {
    this.rng = new Rng(opts.seed ?? (Math.random() * 2 ** 32) >>> 0);
    this.locked = opts.locked ?? new Set();
    const kit = START_KITS[opts.kit ?? 'klassisch'] ?? START_KITS.klassisch;
    this.kitId = kit.id;
    this.wheel = WHEEL_ORDER.map((n, index) => ({ index, number: n, color: standardColor(n) }));
    this.cash = kit.money;
    this.marks = kit.marks;
    this.deposit = kit.deposit ?? 0;
    this.perks.luck = kit.luck ?? 0;
    for (const id of kit.items ?? []) this.addItem(id);
    this.nextRule = this.rollRule();
    this.startCycle();
  }

  // ---- Derived values ---------------------------------------------------

  get debt(): number {
    const base = debtFor(this.cycle) * (this.has('teufel') ? 1.25 : 1);
    return roundNice(base * this.debtFactor + this.debtAdd);
  }

  get stakeTotal(): number {
    return Object.values(this.bets).reduce((a, s) => a + stakeOf(s), 0);
  }

  /** Cash plus what is currently on the table. */
  get moneyBefore(): number {
    return this.cash + this.stakeTotal;
  }

  get round(): number {
    return this.cycleRounds - this.roundsLeft + 1;
  }

  get endless(): boolean {
    return this.cycle >= DEBTS.length;
  }

  get luck(): number {
    return luckOf(this.items, this.perks);
  }

  get hopChance(): number {
    return Math.min(MAX_HOP_CHANCE, this.luck * HOP_PER_LUCK);
  }

  get interestRate(): number {
    return BASE_INTEREST + this.perks.interest + 0.04 * this.items.filter((t) => t.def === 'sparschwein').length;
  }

  /** Most that may still be added to the table this round. */
  get betLimit(): number {
    if (this.rule !== 'limit') return this.cash;
    return Math.max(0, Math.min(this.cash, Math.floor(this.moneyBefore / 4) - this.stakeTotal));
  }

  has(def: string): boolean {
    return this.items.some((t) => t.def === def);
  }

  private rollRule(): RuleId {
    return this.rng.pick(Object.keys(RULES) as RuleId[]);
  }

  private startCycle(): void {
    this.phase = 'betting';
    this.rule = this.cycle > 0 ? this.nextRule : undefined;
    if (this.cycle > 0) this.nextRule = this.rollRule();
    this.cycleRounds = ROUNDS_PER_CYCLE + this.perks.extraRounds + this.items.filter((t) => t.def === 'taschenuhr').length - (this.rule === 'geiz' ? 1 : 0);
    this.roundsLeft = this.cycleRounds;
    this.bets = {};
    this.rerollCost = 1;
    this.rollShop();
    this.rollVisions();
  }

  private rollVisions(): void {
    this.visions = [];
    if (!this.has('kristallkugel')) return;
    const w = pocketWeights(this.wheel, {}, this.items, this.rule);
    while (this.visions.length < 3) {
      const k = this.rng.weighted(w);
      this.visions.push(k);
      w[k] = 0;
    }
  }

  // ---- Betting ----------------------------------------------------------

  placeBet(fieldId: string, value: number): boolean {
    if (this.phase !== 'betting' || value <= 0 || value > this.betLimit || !FIELD_BY_ID[fieldId]) return false;
    this.cash -= value;
    (this.bets[fieldId] ??= []).push(value);
    return true;
  }

  removeBet(fieldId: string): number {
    if (this.phase !== 'betting') return 0;
    const stack = this.bets[fieldId];
    const v = stack?.pop();
    if (!v) return 0;
    if (!stack.length) delete this.bets[fieldId];
    this.cash += v;
    return v;
  }

  clearBets(): void {
    if (this.phase !== 'betting') return;
    this.cash += this.stakeTotal;
    this.bets = {};
  }

  /** Places last round's bets again, as far as the cash allows. */
  repeatBets(): number {
    if (this.phase !== 'betting') return 0;
    let placed = 0;
    for (const [fid, stack] of Object.entries(this.lastBets)) {
      for (const v of stack) if (this.placeBet(fid, v)) placed++;
    }
    return placed;
  }

  weights(): number[] {
    return pocketWeights(this.wheel, this.bets, this.items, this.rule);
  }

  /** Chance (0..1) that the ball lands in each pocket this round, visions included. */
  chances(): number[] {
    const w = this.weights();
    const total = w.reduce((a, b) => a + b, 0);
    const base = w.map((x) => x / total);
    if (!this.visions.length) return base;
    const vw = this.visions.reduce((a, i) => a + w[i], 0);
    return base.map((p, i) => p * 0.6 + (this.visions.includes(i) ? (0.4 * w[i]) / vw : 0));
  }

  // ---- Spinning -----------------------------------------------------------

  private input(isLastSpin: boolean) {
    return {
      wheel: this.wheel, bets: this.bets, items: this.items, rule: this.rule, isLastSpin,
      moneyBefore: this.moneyBefore, perks: this.perks,
    };
  }

  /** Resolves the spin immediately; the renderer animates towards `result.pocket`. */
  spin(): SpinResult {
    if (this.phase !== 'betting') throw new Error('not betting');
    const w = this.weights();
    let index: number;
    if (this.visions.length && this.rng.chance(0.4)) {
      index = this.visions[this.rng.weighted(this.visions.map((i) => w[i]))];
    } else {
      index = this.rng.weighted(w);
    }
    const input = this.input(this.roundsLeft === 1);
    let result = scoreSpin(input, index);
    // Luck: the ball may hop over a separator into a pocket that pays more.
    if (this.stakeTotal > 0 && this.rng.chance(this.hopChance)) {
      const reach = this.has('goldkugel') ? 2 : 1;
      let best = result;
      let bestIndex = index;
      for (const j of neighborIndices(index, reach)) {
        const alt = scoreSpin(input, j);
        if (alt.payout > best.payout) {
          best = alt;
          bestIndex = j;
        }
      }
      if (bestIndex !== index) result = { ...best, hop: { from: index, to: bestIndex } };
    }
    this.phase = 'spinning';
    this.lastResult = result;
    return result;
  }

  /** Applies the result once the ball has landed. */
  settle(): void {
    const r = this.lastResult;
    if (!r || this.phase !== 'spinning') return;
    this.cash += r.payout;
    this.marks += r.marks;
    for (const t of this.items) t.counter += r.growth[t.uid] ?? 0;
    this.lastInterest = Math.floor(this.deposit * this.interestRate);
    this.deposit += this.lastInterest;
    this.history.unshift({ n: r.pocket.number, c: r.pocket.color });
    this.history.length = Math.min(this.history.length, 12);
    this.trackStats(r);
    this.lastBets = this.bets;
    this.bets = {};
    this.roundsLeft--;
    if (this.roundsLeft > 0) {
      this.phase = 'betting';
      this.rollVisions();
    } else {
      this.phase = 'due';
      if (this.cash + this.deposit < this.debt) this.phase = 'gameover';
    }
  }

  private trackStats(r: SpinResult): void {
    const s = this.stats;
    const won = r.payout - r.stake;
    s.spins++;
    if (won > 0) s.totalWon += won;
    s.bestWin = Math.max(s.bestWin, won);
    s.maxMoney = Math.max(s.maxMoney, this.cash + this.deposit);
    const winners = r.bets.filter((b) => b.won);
    if (winners.some((b) => FIELD_BY_ID[b.fieldId].kind === 'straight')) s.straightWins++;
    if (winners.some((b) => isInsideCombo(FIELD_BY_ID[b.fieldId]))) s.insideWins++;
    if (r.pocket.number === 0 && winners.length) s.zeroHits++;
    if (r.hop) s.hops++;
    s.lossStreak = r.stake > 0 && !r.anyWin ? s.lossStreak + 1 : r.anyWin ? 0 : s.lossStreak;
    s.maxLossStreak = Math.max(s.maxLossStreak, s.lossStreak);
  }

  // ---- Cashier ------------------------------------------------------------

  get cashierOpen(): boolean {
    return this.phase === 'betting' || this.phase === 'due';
  }

  /** Locks cash away for the rate. It earns interest after every round and can't be lost at the table. */
  depositCash(amount: number): boolean {
    amount = Math.floor(Math.min(amount, this.cash));
    if (!this.cashierOpen || amount <= 0) return false;
    this.cash -= amount;
    this.deposit += amount;
    return true;
  }

  canPay(): boolean {
    return this.cashierOpen && this.stakeTotal === 0 && this.cash + this.deposit >= this.debt;
  }

  /** Marks earned by paying now: 3 plus 1 for every round left over. */
  get payMarks(): number {
    const early = this.phase === 'betting' ? this.roundsLeft : 0;
    return 3 + early + 2 * this.items.filter((t) => t.def === 'kleeblatt').length;
  }

  pay(): boolean {
    if (!this.canPay()) return false;
    let due = this.debt;
    const fromDeposit = Math.min(this.deposit, due);
    this.deposit -= fromDeposit;
    due -= fromDeposit;
    this.cash -= due;
    if (this.phase === 'betting') this.stats.earlyPays++;
    if (this.loanRunning) this.stats.loansRepaid++;
    this.loanRunning = false;
    this.lastPayMarks = this.payMarks;
    this.marks += this.lastPayMarks;
    this.paidRates++;
    const won = this.cycle === DEBTS.length - 1;
    this.cycle++;
    this.debtFactor = this.nextDebtFactor;
    this.debtAdd = this.nextDebtAdd;
    this.nextDebtFactor = 1;
    this.nextDebtAdd = 0;
    this.startCycle();
    this.offers = this.rollOffers();
    if (won) this.phase = 'victory';
    return true;
  }

  /** Leaves the victory screen and keeps playing with ever-growing rates. */
  continueEndless(): void {
    if (this.phase === 'victory') this.phase = 'betting';
  }

  // ---- The phone ------------------------------------------------------------

  private rollOffers(): string[] {
    const pool = Object.values(OFFERS).filter((o) => !(o.id === 'platz' && this.perks.slots >= MAX_SLOTS));
    const out: string[] = [];
    while (out.length < 3) {
      const rest = pool.filter((o) => !out.includes(o.id));
      out.push(rest[this.rng.weighted(rest.map((o) => o.weight))].id);
    }
    return out;
  }

  /** Accepts one of the phone deals. Returns a message for the player. */
  chooseOffer(i: number): string | undefined {
    const id = this.offers[i];
    if (!id) return undefined;
    this.offers = [];
    const p = this.perks;
    switch (id) {
      case 'glueck': p.luck++; return 'Glück +1.';
      case 'zinsen': p.interest += 0.03; return 'Deine Einzahlung bringt jetzt 3 % mehr Zinsen.';
      case 'platz': p.slots = Math.min(MAX_SLOTS, p.slots + 1); return 'Auf dem Tisch ist Platz für einen weiteren Talisman.';
      case 'marken': this.marks += 4; return '+4 Glücksmarken.';
      case 'runde': p.extraRounds++; this.roundsLeft++; this.cycleRounds++; return 'Ab sofort eine Runde mehr vor jeder Rate.';
      case 'kredit': {
        const amount = roundNice(this.debt / 2);
        this.cash += amount;
        this.debtAdd += amount * 2;
        this.loanRunning = true;
        return `+$${amount}. Die Rate steigt um $${amount * 2}.`;
      }
      case 'stundung':
        this.debtFactor *= 0.7;
        this.nextDebtFactor *= 1.6;
        return 'Diese Rate ist 30 % niedriger. Die nächste wird teurer.';
      case 'rotplus': p.redMult += 0.25; return 'Rot zahlt ab sofort +0,25 Mult.';
      case 'schwarzplus': p.blackMult += 0.25; return 'Schwarz zahlt ab sofort +0,25 Mult.';
      case 'goldfach':
      case 'kristallfach': {
        const free = this.wheel.filter((q) => !q.mod);
        const q = this.rng.pick(free.length ? free : this.wheel);
        q.mod = id === 'goldfach' ? 'gold' : 'kristall';
        return `Fach ${q.number} ist jetzt ein ${id === 'goldfach' ? 'Gold' : 'Kristall'}fach.`;
      }
    }
    return undefined;
  }

  // ---- Showcase (shop, paid with lucky marks) --------------------------------

  isLocked(id: string): boolean {
    return this.locked.has(id);
  }

  private rollShop(): void {
    const owned = new Set(this.items.map((t) => t.def));
    const pool = Object.values(ITEMS).filter((d) => !owned.has(d.id) && !this.locked.has(d.id));
    const items: ShopItem[] = [];
    for (let i = 0; i < 4 && pool.length; i++) {
      const k = this.rng.weighted(pool.map((d) => RARITY[d.rarity].weight));
      const [d] = pool.splice(k, 1);
      items.push({ kind: 'item', def: d.id, price: itemPrice(d.id) });
    }
    const tools = Object.values(POCKET_ITEMS);
    for (let i = 0; i < 2; i++) {
      const k = this.rng.weighted(tools.map((t) => t.weight));
      const [t] = tools.splice(k, 1);
      items.push({ kind: 'pocket', def: t.id, price: t.price });
    }
    this.shop = items;
  }

  reroll(): boolean {
    if (!this.cashierOpen || this.marks < this.rerollCost) return false;
    this.marks -= this.rerollCost;
    this.rerollCost++;
    this.rollShop();
    return true;
  }

  canBuy(i: number): boolean {
    const item = this.shop[i];
    if (!this.cashierOpen || !item || item.sold || this.marks < item.price) return false;
    if (item.kind === 'item' && this.items.length >= this.perks.slots) return false;
    return true;
  }

  private addItem(def: string): void {
    this.items.push({ uid: this.uid++, def, counter: 0 });
    this.stats.maxItems = Math.max(this.stats.maxItems, this.items.length);
  }

  buy(i: number): boolean {
    if (!this.canBuy(i) || this.shop[i].kind !== 'item') return false;
    const item = this.shop[i];
    this.addItem(item.def);
    this.marks -= item.price;
    item.sold = true;
    if (item.def === 'taschenuhr') {
      this.roundsLeft++;
      this.cycleRounds++;
    }
    if (item.def === 'kristallkugel' && this.phase === 'betting') this.rollVisions();
    return true;
  }

  /** Buys a wheel upgrade and applies it to a pocket. */
  applyPocket(i: number, pocketIndex: number, newNumber?: number): boolean {
    if (!this.canBuy(i) || this.shop[i].kind !== 'pocket') return false;
    const item = this.shop[i];
    const p = this.wheel[pocketIndex];
    if (!p) return false;
    const id = item.def as PocketToolId;
    if (id === 'pinsel') {
      if (newNumber === undefined || newNumber < 0 || newNumber > 36) return false;
      p.number = newNumber;
      p.color = standardColor(newNumber);
      this.stats.renumbers++;
    } else if (id === 'farbe') {
      p.color = p.color === 'red' ? 'black' : 'red';
    } else {
      p.mod = id;
    }
    this.marks -= item.price;
    item.sold = true;
    return true;
  }

  sellPrice(uid: number): number {
    const t = this.items.find((x) => x.uid === uid);
    return t ? Math.max(1, Math.floor(itemPrice(t.def) / 2)) : 0;
  }

  sellItem(uid: number): boolean {
    if (!this.cashierOpen) return false;
    const i = this.items.findIndex((t) => t.uid === uid);
    if (i < 0) return false;
    this.marks += this.sellPrice(uid);
    const [t] = this.items.splice(i, 1);
    if (t.def === 'taschenuhr' && this.roundsLeft > 1) {
      this.roundsLeft--;
      this.cycleRounds--;
    }
    if (t.def === 'kristallkugel' && !this.has('kristallkugel')) this.visions = [];
    return true;
  }

  /** Swaps an item with its neighbour; order matters for the mirror. */
  moveItem(uid: number, dir: -1 | 1): boolean {
    const i = this.items.findIndex((t) => t.uid === uid);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= this.items.length) return false;
    [this.items[i], this.items[j]] = [this.items[j], this.items[i]];
    return true;
  }

  surrender(): void {
    this.phase = 'gameover';
  }
}

export function roundNice(v: number): number {
  const mag = Math.pow(10, Math.max(0, Math.floor(Math.log10(Math.max(1, v))) - 1));
  return Math.max(1, Math.round(v / mag) * mag);
}

export function debtFor(cycle: number): number {
  if (cycle < DEBTS.length) return DEBTS[cycle];
  return roundNice(DEBTS[DEBTS.length - 1] * Math.pow(2.4, cycle - DEBTS.length + 1));
}
