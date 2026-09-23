import {
  BOSSES, CHIPS, DEBTS, POCKET_ITEMS, priceFor, SPINS_PER_CYCLE, STARTING_BAG, TALISMANS,
  type BossId, type PocketToolId,
} from './content';
import { Rng } from './rng';
import { pocketWeights, scoreSpin, type Placed, type SpinResult } from './scoring';
import type { ChipInstance, Pocket, ShopItem, TalismanInstance } from './types';
import { standardColor, WHEEL_ORDER } from './wheel';

export const MAX_TALISMANS = 5;
export const BASE_HAND = 5;
export const REDRAWS_PER_CYCLE = 3;
export const MIN_BAG = 6;
export const RUSH_SECONDS = 15;

/**
 * betting  – chips can be placed, the shop is open
 * spinning – the ball is rolling
 * due      – all rounds of the cycle are played, the rate must be paid at the cashier
 * gameover – the rate could not be paid
 * victory  – the last rate is paid (the run can continue endlessly)
 */
export type RunPhase = 'betting' | 'spinning' | 'due' | 'gameover' | 'victory';

export interface Coin {
  id: number;
  /** Position on the casino floor, in room coordinates. */
  x: number;
  z: number;
  kind: 'coin' | 'star';
}

export class Run {
  readonly rng: Rng;
  phase: RunPhase = 'betting';
  /** Index of the current rate (0-based). */
  cycle = 0;
  paidRates = 0;
  money = 0;
  spinsLeft = 0;
  redrawsLeft = 0;
  winStreak = 0;
  bonusMult = 0;
  rule?: BossId;

  wheel: Pocket[];
  bag: ChipInstance[];
  drawPile: ChipInstance[] = [];
  discard: ChipInstance[] = [];
  hand: ChipInstance[] = [];
  placed: Placed = {};
  talismans: TalismanInstance[] = [];
  coins: Coin[] = [];
  shop: ShopItem[] = [];
  rerollCost = 0;
  lastResult?: SpinResult;
  lastInterest = 0;
  stats = { spins: 0, bestSpin: 0, totalWon: 0 };
  /** Where coins may spawn; set by the world so they land on free floor. */
  coinSpots: { x: number; z: number }[] = [{ x: 0, z: 3 }];

  private uid = 1;

  constructor(seed = (Math.random() * 2 ** 32) >>> 0) {
    this.rng = new Rng(seed);
    this.wheel = WHEEL_ORDER.map((n, index) => ({ index, number: n, color: standardColor(n) }));
    this.bag = STARTING_BAG.map((def) => ({ uid: this.uid++, def }));
    this.startCycle();
  }

  get debt(): number {
    return debtFor(this.cycle);
  }

  get handSize(): number {
    return BASE_HAND - (this.rule === 'kleinehand' ? 1 : 0);
  }

  get spinsPerCycle(): number {
    return SPINS_PER_CYCLE - (this.rule === 'geiz' ? 1 : 0);
  }

  get round(): number {
    return this.spinsPerCycle - this.spinsLeft + 1;
  }

  get endless(): boolean {
    return this.cycle >= DEBTS.length;
  }

  /** Money that could still be raised by selling every talisman. */
  get sellValue(): number {
    return this.talismans.reduce((a, t) => a + this.sellPrice(t.uid), 0);
  }

  private startCycle(): void {
    this.phase = 'betting';
    this.rule = this.cycle > 0 ? this.rng.pick(Object.keys(BOSSES) as BossId[]) : undefined;
    this.spinsLeft = this.spinsPerCycle;
    this.redrawsLeft = REDRAWS_PER_CYCLE;
    this.drawPile = this.rng.shuffle([...this.bag]);
    this.discard = [];
    this.hand = [];
    this.placed = {};
    this.bonusMult = 0;
    this.rerollCost = priceFor(1, this.debt);
    this.rollShop();
    this.refillHand();
    this.spawnCoins();
  }

  private drawOne(): ChipInstance | undefined {
    if (this.drawPile.length === 0) {
      this.drawPile = this.rng.shuffle(this.discard);
      this.discard = [];
    }
    return this.drawPile.pop();
  }

  private refillHand(): void {
    while (this.hand.length < this.handSize) {
      const c = this.drawOne();
      if (!c) break;
      this.hand.push(c);
    }
  }

  private spawnCoins(): void {
    const n = 1 + (this.talismans.some((t) => t.def === 'glueckskind') ? 1 : 0);
    const spots = this.rng.shuffle([...this.coinSpots]);
    const taken = new Set(this.coins.map((c) => `${c.x},${c.z}`));
    const free = spots.filter((s) => !taken.has(`${s.x},${s.z}`));
    for (let i = 0; i < n && i < free.length && this.coins.length < 4; i++) {
      this.coins.push({ id: this.uid++, ...free[i], kind: this.rng.chance(0.25) ? 'star' : 'coin' });
    }
  }

  /** Called when the player walks over a coin. Returns the mult it adds to the next spin. */
  collectCoin(id: number): number {
    const i = this.coins.findIndex((c) => c.id === id);
    if (i < 0) return 0;
    const [coin] = this.coins.splice(i, 1);
    const factor = this.talismans.some((t) => t.def === 'muenzsammler') ? 2 : 1;
    const mult = (coin.kind === 'star' ? 4 : 2) * factor;
    this.bonusMult += mult;
    return mult;
  }

  // ---- Betting ----------------------------------------------------------

  place(uid: number, fieldId: string): boolean {
    if (this.phase !== 'betting') return false;
    const i = this.hand.findIndex((c) => c.uid === uid);
    if (i < 0) return false;
    const [chip] = this.hand.splice(i, 1);
    (this.placed[fieldId] ??= []).push(chip);
    return true;
  }

  pickUp(fieldId: string): ChipInstance | undefined {
    if (this.phase !== 'betting') return undefined;
    const stack = this.placed[fieldId];
    const chip = stack?.pop();
    if (!chip) return undefined;
    if (stack.length === 0) delete this.placed[fieldId];
    this.hand.push(chip);
    return chip;
  }

  redraw(): boolean {
    if (this.phase !== 'betting' || this.redrawsLeft <= 0 || this.hand.length === 0) return false;
    this.redrawsLeft--;
    const old = this.hand;
    this.hand = [];
    this.refillHand();
    this.discard.push(...old);
    return true;
  }

  isPlaced(uid: number): boolean {
    return Object.values(this.placed).some((s) => s.some((c) => c.uid === uid));
  }

  get placedCount(): number {
    return Object.values(this.placed).reduce((a, s) => a + s.length, 0);
  }

  weights(): number[] {
    return pocketWeights(this.wheel, this.placed, this.talismans, this.rule);
  }

  /** Resolves the spin immediately; the renderer animates towards `result.pocket`. */
  spin(): SpinResult {
    if (this.phase !== 'betting') throw new Error('not betting');
    const pocketIndex = this.rng.weighted(this.weights());
    const result = scoreSpin(
      {
        wheel: this.wheel,
        placed: this.placed,
        talismans: this.talismans,
        boss: this.rule,
        isLastSpin: this.spinsLeft === 1,
        money: this.money,
        winStreak: this.winStreak,
        bonusMult: this.bonusMult,
        paidRates: this.paidRates,
      },
      pocketIndex,
      this.rng,
    );
    this.phase = 'spinning';
    this.lastResult = result;
    return result;
  }

  /** Applies the result once the ball has landed. */
  settle(): void {
    const r = this.lastResult;
    if (!r || this.phase !== 'spinning') return;
    this.money += r.score + r.money;
    this.winStreak = r.winStreak;
    this.stats.spins++;
    this.stats.totalWon += r.score + r.money;
    this.stats.bestSpin = Math.max(this.stats.bestSpin, r.score);
    for (const t of this.talismans) t.counter += r.growth[t.uid] ?? 0;
    const broken = new Set(r.broken);
    for (const stack of Object.values(this.placed)) {
      for (const c of stack) if (!broken.has(c.uid)) this.discard.push(c);
    }
    this.bag = this.bag.filter((c) => !broken.has(c.uid));
    this.placed = {};
    this.bonusMult = 0;
    this.spinsLeft--;
    if (this.spinsLeft > 0) {
      this.phase = 'betting';
      this.refillHand();
      this.spawnCoins();
    } else {
      this.phase = 'due';
      this.checkBroke();
    }
  }

  /** Game over once the rate is due and not even selling everything would cover it. */
  private checkBroke(): void {
    if (this.phase === 'due' && this.money + this.sellValue < this.debt) this.phase = 'gameover';
  }

  canPay(): boolean {
    return this.phase === 'due' && this.money >= this.debt;
  }

  pay(): boolean {
    if (!this.canPay()) return false;
    this.money -= this.debt;
    this.paidRates++;
    this.lastInterest = this.talismans.some((t) => t.def === 'sparschwein') ? Math.floor(this.money * 0.15) : 0;
    this.money += this.lastInterest;
    const won = this.cycle === DEBTS.length - 1;
    this.cycle++;
    this.startCycle();
    if (won) this.phase = 'victory';
    return true;
  }

  /** Leaves the victory screen and keeps playing with ever-growing rates. */
  continueEndless(): void {
    if (this.phase === 'victory') this.phase = 'betting';
  }

  // ---- Shop -------------------------------------------------------------

  get shopOpen(): boolean {
    return this.phase === 'betting' || this.phase === 'due';
  }

  private rollShop(): void {
    const owned = new Set(this.talismans.map((t) => t.def));
    const pickWeighted = <T extends { weight: number }>(defs: T[]) => defs[this.rng.weighted(defs.map((d) => d.weight))];
    const items: ShopItem[] = [];
    const takenTalismans = new Set<string>();
    for (let i = 0; i < 3; i++) {
      const pool = Object.values(TALISMANS).filter((t) => !owned.has(t.id) && !takenTalismans.has(t.id));
      if (this.rng.chance(0.55) && pool.length) {
        const t = pickWeighted(pool);
        takenTalismans.add(t.id);
        items.push({ kind: 'talisman', def: t.id, price: priceFor(t.price, this.debt) });
      } else {
        const c = pickWeighted(Object.values(CHIPS));
        items.push({ kind: 'chip', def: c.id, price: priceFor(c.price, this.debt) });
      }
    }
    const pocketPool = Object.values(POCKET_ITEMS);
    const a = pickWeighted(pocketPool);
    const b = pickWeighted(pocketPool.filter((p) => p.id !== a.id));
    for (const p of [a, b]) {
      items.push({ kind: p.id === 'schere' ? 'service' : 'pocket', def: p.id, price: priceFor(p.price, this.debt) });
    }
    this.shop = items;
  }

  reroll(): boolean {
    if (!this.shopOpen || this.money < this.rerollCost) return false;
    this.money -= this.rerollCost;
    this.rerollCost = Math.round(this.rerollCost * 1.5);
    this.rollShop();
    this.checkBroke();
    return true;
  }

  canBuy(i: number): boolean {
    const item = this.shop[i];
    if (!this.shopOpen || !item || item.sold || this.money < item.price) return false;
    if (item.kind === 'talisman' && this.talismans.length >= MAX_TALISMANS) return false;
    if (item.kind === 'service' && this.bag.length <= MIN_BAG) return false;
    return true;
  }

  /** Buys chips and talismans directly. Pocket items and services need a target, see `applyItem`. */
  buy(i: number): boolean {
    if (!this.canBuy(i)) return false;
    const item = this.shop[i];
    if (item.kind === 'chip') {
      const chip = { uid: this.uid++, def: item.def };
      this.bag.push(chip);
      this.discard.push(chip);
    } else if (item.kind === 'talisman') {
      this.talismans.push({ uid: this.uid++, def: item.def, counter: 0 });
    } else {
      return false;
    }
    this.money -= item.price;
    item.sold = true;
    this.checkBroke();
    return true;
  }

  /** Buys a pocket item and applies it to `target` (pocket index, or chip uid for services). */
  applyItem(i: number, target: number, newNumber?: number): boolean {
    if (!this.canBuy(i)) return false;
    const item = this.shop[i];
    if (item.kind === 'service') {
      if (!this.bag.some((c) => c.uid === target) || this.isPlaced(target)) return false;
      const gone = (c: ChipInstance) => c.uid !== target;
      this.bag = this.bag.filter(gone);
      this.drawPile = this.drawPile.filter(gone);
      this.discard = this.discard.filter(gone);
      this.hand = this.hand.filter(gone);
    } else if (item.kind === 'pocket') {
      const p = this.wheel[target];
      if (!p) return false;
      const id = item.def as PocketToolId;
      if (id === 'pinsel') {
        if (newNumber === undefined || newNumber < 0 || newNumber > 36) return false;
        p.number = newNumber;
        p.color = standardColor(newNumber);
      } else if (id === 'farbe') {
        p.color = p.color === 'red' ? 'black' : 'red';
      } else {
        p.mod = id;
      }
    } else {
      return false;
    }
    this.money -= item.price;
    item.sold = true;
    this.checkBroke();
    return true;
  }

  sellPrice(uid: number): number {
    const t = this.talismans.find((x) => x.uid === uid);
    return t ? Math.floor(priceFor(TALISMANS[t.def].price, this.debt) / 2) : 0;
  }

  sellTalisman(uid: number): boolean {
    if (!this.shopOpen) return false;
    const i = this.talismans.findIndex((t) => t.uid === uid);
    if (i < 0) return false;
    this.money += this.sellPrice(uid);
    this.talismans.splice(i, 1);
    return true;
  }

  /** Gives up when the rate cannot be paid. */
  surrender(): void {
    this.phase = 'gameover';
  }
}

export function debtFor(cycle: number): number {
  if (cycle < DEBTS.length) return DEBTS[cycle];
  return Math.round(DEBTS[DEBTS.length - 1] * Math.pow(2.3, cycle - DEBTS.length + 1) / 1000) * 1000;
}
