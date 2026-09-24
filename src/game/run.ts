import {
  BALLS, BASE_INTEREST, BRIBE_PRICE, BRIBE_PULL, BRIBE_RISK, canFuse, CONSUMABLES, DEBTS, FUSE_EXTRA, ITEMS, itemPrice, MAX_CONSUMABLES,
  MAX_SLOTS, NEWS, OFFERS, POCKET_ITEMS, RARITY, RIVAL_NAMES, ROUNDS_PER_CYCLE, RULES, SHARK_FACTOR, START_KITS, START_SLOTS,
  type PocketToolId, type RuleId,
} from './content';
import { FIELD_BY_ID, fieldWins, isInsideCombo } from './fields';
import { Rng } from './rng';
import {
  activeItems, activeSets, hasSet, levelOf, luckOf, neighborIndices, noBoost, pocketWeights, scoreSpin, stakeOf, type Boost, type Perks,
  type SpinResult,
} from './scoring';
import type { Bets, Color, ItemInstance, Pocket, ShopItem } from './types';
import { standardColor, WHEEL_ORDER } from './wheel';

export const RUSH_SECONDS = 15;
export const MAX_HOP_CHANCE = 0.6;
export const HOP_PER_LUCK = 0.06;

/**
 * betting  – stakes can be placed, cashier and showcase are open
 * spinning – the ball is rolling
 * due      – all spins of the cycle are played, the rate must be paid at the cashier
 * shark    – the money is gone; the loan shark offers one last loan
 * gameover – the rate could not be paid
 * victory  – the last rate is paid (the run can continue endlessly)
 */
export type RunPhase = 'betting' | 'spinning' | 'due' | 'shark' | 'gameover' | 'victory';

/** A regular who challenges you to a duel on one spin. */
export interface Duel {
  name: string;
  fieldId: string;
  stake: number;
  /** Set after the spin. */
  outcome?: 'won' | 'lost' | 'tie';
  rivalNet?: number;
  playerNet?: number;
}

export interface RunOptions {
  seed?: number;
  kit?: string;
  /** Debt stage 0..5, the roguelike difficulty. */
  stage?: number;
  /** Item ids that are not unlocked yet and never appear in the showcase. */
  locked?: Set<string>;
  /** Ball in play (see BALLS). */
  ball?: string;
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
  focusWins: number;
  nearMisses: number;
  repeats: number;
  minCash: number;
  hangups: number;
  sameBetStreak: number;
  bestSameBetStreak: number;
  golds: number;
  maxSets: number;
  bribesOk: number;
  bribesCaught: number;
  riskWins: number;
  duelWins: number;
  duelLosses: number;
  sharkRepaid: number;
  smokes: number;
}

export class Run {
  readonly rng: Rng;
  readonly kitId: string;
  readonly stage: number;
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
  /** Field twisted by the magic cube this round. */
  cubeField?: string;
  readonly ball: string;
  /** News flash of the current rate. */
  news: string;
  /** One-shot items carried in the pocket (max 3). */
  smokes: string[] = [];
  /** One-shot effects that apply to the next spin. */
  boost: Boost = noBoost();
  /** The croupier was paid for the next spin. */
  bribed = false;
  bribesThisCycle = 0;
  /** Last spin of the rate played all-or-nothing; the surcharge is held here. */
  highRisk = false;
  riskStake = 0;
  /** Duel on the next spin, and the spin count of the one after. */
  duel?: Duel;
  lastDuel?: Duel;
  private nextDuelAt: number;
  /** Loan shark: used once per run, raises every later rate. */
  sharkUsed = false;
  sharkDue = false;
  sharkFrom = Infinity;
  private sharkRunning = false;

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
    focusWins: 0, nearMisses: 0, repeats: 0, minCash: Infinity, hangups: 0, sameBetStreak: 0, bestSameBetStreak: 0,
    golds: 0, maxSets: 0, bribesOk: 0, bribesCaught: 0, riskWins: 0, duelWins: 0, duelLosses: 0, sharkRepaid: 0, smokes: 0,
  };
  private locked: Set<string>;
  private uid = 1;
  private loanRunning = false;

  constructor(opts: RunOptions = {}) {
    this.rng = new Rng(opts.seed ?? (Math.random() * 2 ** 32) >>> 0);
    this.locked = opts.locked ?? new Set();
    const kit = START_KITS[opts.kit ?? 'klassisch'] ?? START_KITS.klassisch;
    this.kitId = kit.id;
    this.stage = Math.max(0, Math.min(5, opts.stage ?? 0));
    this.ball = opts.ball && BALLS[opts.ball] ? opts.ball : 'stahl';
    this.news = '';
    this.nextDuelAt = 4 + this.rng.int(3);
    this.wheel = WHEEL_ORDER.map((n, index) => ({ index, number: n, color: standardColor(n) }));
    this.cash = kit.money;
    this.marks = kit.marks;
    this.deposit = kit.deposit ?? 0;
    this.perks.luck = (kit.luck ?? 0) - (this.stage >= 5 ? 1 : 0);
    if (this.stage >= 5) this.marks = 0;
    for (const id of kit.items ?? []) this.addItem(id);
    this.nextRule = this.rollRule();
    this.startCycle();
  }

  // ---- Derived values ---------------------------------------------------

  get debt(): number {
    // Every active copy counts, including one mirrored by the hand mirror.
    const devil = Math.pow(1.25, this.active('teufel').length);
    const voodoo = this.active('voodoo').reduce((a, lvl) => a * (lvl === 2 ? 0.75 : 0.85), 1);
    const base = debtFor(this.cycle) * devil * voodoo * (this.stage >= 1 ? 1.25 : 1)
      * (hasSet(this.items, 'bank') ? 0.9 : 1) * (this.news === 'razzia' ? 0.8 : this.news === 'inflation' ? 1.2 : 1)
      * (this.cycle >= this.sharkFrom ? SHARK_FACTOR : 1);
    return roundNice(base * this.debtFactor + this.debtAdd);
  }

  /** Base rate before any modifiers, for explaining where the rate comes from. */
  get baseDebt(): number {
    return debtFor(this.cycle);
  }

  get stakeTotal(): number {
    return Object.values(this.bets).reduce((a, s) => a + stakeOf(s), 0);
  }

  /** Cash plus what is currently on the table (and a held high-risk surcharge). */
  get moneyBefore(): number {
    return this.cash + this.stakeTotal + this.riskStake;
  }

  /** Levels (1 or 2) of every active copy of a talisman, mirrored copies included. */
  active(def: string): number[] {
    return activeItems(this.items).filter((x) => x.inst.def === def).map(levelOf);
  }

  /** How far a lucky hop can jump. */
  get hopReach(): number {
    return Math.max(1, ...this.active('goldkugel').map((l) => (l === 2 ? 3 : 2)));
  }

  get round(): number {
    return this.cycleRounds - this.roundsLeft + 1;
  }

  get endless(): boolean {
    return this.cycle >= DEBTS.length;
  }

  get luck(): number {
    return luckOf(this.items, this.perks) + (this.ball === 'elfenbein' ? 2 : 0) + (this.news === 'vollmond' ? 2 : 0) + this.boost.luck;
  }

  get hopChance(): number {
    if (this.ball === 'blei') return 0;
    if (this.boost.gezinkt) return 1;
    return Math.max(0, Math.min(MAX_HOP_CHANCE, this.luck * HOP_PER_LUCK));
  }

  get interestRate(): number {
    let r = BASE_INTEREST + this.perks.interest + this.active('sparschwein').reduce((a, l) => a + 0.04 * l, 0)
      + (hasSet(this.items, 'bank') ? 0.06 : 0);
    if (this.stage >= 3) r /= 2;
    if (this.news === 'crash') r = 0;
    if (this.news === 'boom') r *= 2;
    return r;
  }

  /** Extra spins per rate from pocket watches. */
  private get clockBonus(): number {
    return this.active('taschenuhr').reduce((a, l) => a + l, 0);
  }

  /** The house rule that actually applies; the sunglasses ignore it. */
  get activeRule(): RuleId | undefined {
    return this.has('sonnenbrille') ? undefined : this.rule;
  }

  /** Most that may still be added to the table this round. */
  get betLimit(): number {
    if (this.activeRule !== 'limit') return this.cash;
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
    const ids = Object.keys(NEWS).filter((id) => id !== this.news);
    this.news = this.rng.pick(ids);
    this.cycleRounds = Math.max(2, ROUNDS_PER_CYCLE + this.perks.extraRounds + this.clockBonus
      - (this.rule === 'geiz' && !this.has('sonnenbrille') ? 1 : 0) - (this.stage >= 4 ? 1 : 0));
    this.roundsLeft = this.cycleRounds;
    this.bets = {};
    this.rerollCost = 1;
    this.bribesThisCycle = 0;
    this.bribed = false;
    this.rollShop();
    this.rollVisions();
    this.rollDuel();
  }

  /** Every 7–10 spins a regular sits down and challenges you for one spin. */
  private rollDuel(): void {
    if (this.duel || this.stats.spins + 1 < this.nextDuelAt || this.phase !== 'betting') return;
    const outside = ['red', 'black', 'even', 'odd', 'low', 'high', 'doz0', 'doz1', 'doz2', 'col0', 'col1', 'col2'];
    const fieldId = this.rng.chance(0.3) ? `n${this.rng.int(37)}` : this.rng.pick(outside);
    this.duel = { name: this.rng.pick(RIVAL_NAMES), fieldId, stake: Math.max(5, roundNice(this.debt * 0.3)) };
  }

  private rollVisions(): void {
    this.visions = [];
    const twistable = ['red', 'black', 'even', 'odd', 'low', 'high', 'doz0', 'doz1', 'doz2', 'col0', 'col1', 'col2'];
    this.cubeField = this.has('zauberwuerfel') ? this.rng.pick(twistable) : undefined;
    if (!this.has('kristallkugel')) return;
    const w = pocketWeights(this.wheel, {}, this.items, this.activeRule);
    while (this.visions.length < 3) {
      const k = this.rng.weighted(w);
      this.visions.push(k);
      w[k] = 0;
    }
  }

  // ---- Betting ----------------------------------------------------------

  placeBet(fieldId: string, value: number): boolean {
    if (this.phase !== 'betting' || this.highRisk || value <= 0 || value > this.betLimit || !FIELD_BY_ID[fieldId]) return false;
    this.cash -= value;
    (this.bets[fieldId] ??= []).push(value);
    return true;
  }

  removeBet(fieldId: string): number {
    if (this.phase !== 'betting' || this.highRisk) return 0;
    const stack = this.bets[fieldId];
    const v = stack?.pop();
    if (!v) return 0;
    if (!stack.length) delete this.bets[fieldId];
    this.cash += v;
    return v;
  }

  clearBets(): void {
    if (this.phase !== 'betting') return;
    this.setHighRisk(false);
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
    const w = pocketWeights(this.wheel, this.bets, this.items, this.activeRule, { ball: this.ball, kreide: this.boost.kreide });
    return this.bribed && this.stakeTotal > 0 ? this.pulled(w) : w;
  }

  /** The croupier's nudge: pockets that pay more than the stake weigh more. */
  private pulled(w: number[]): number[] {
    const input = this.input(this.roundsLeft === 1);
    return w.map((x, i) => (scoreSpin(input, i).payout > this.stakeTotal ? x * BRIBE_PULL : x));
  }

  /** Landing chances for given pocket weights, crystal-ball visions included. */
  private landing(w: number[]): number[] {
    const total = w.reduce((a, b) => a + b, 0);
    const base = w.map((x) => x / total);
    if (!this.visions.length) return base;
    const vw = this.visions.reduce((a, i) => a + w[i], 0);
    return base.map((p, i) => p * 0.6 + (this.visions.includes(i) ? (0.4 * w[i]) / vw : 0));
  }

  /** Where a lucky hop from `index` ends: the best-paying neighbour, or with voodoo sometimes the worst. */
  private hopTargets(index: number, pay: number[]): { best: number; worst: number } {
    let best = index;
    let worst = index;
    for (const j of neighborIndices(index, this.hopReach)) {
      if (pay[j] > pay[best]) best = j;
      if (pay[j] < pay[worst]) worst = j;
    }
    return { best, worst };
  }

  private get voodooTurn(): number {
    return this.active('voodoo').length && !this.boost.gezinkt ? 1 / 3 : 0;
  }

  /**
   * Chance of each pocket being the final result, lucky hops included: what the player really gets.
   * `chances()` is only where the ball first lands.
   */
  finalChances(): number[] {
    const land = this.chances();
    const h = this.stakeTotal > 0 ? this.hopChance : 0;
    if (!h) return land;
    const input = this.input(this.roundsLeft === 1);
    const pay = this.wheel.map((_, i) => scoreSpin(input, i).payout);
    const v = this.voodooTurn;
    const out = land.map((p) => p * (1 - h));
    land.forEach((p, i) => {
      const t = this.hopTargets(i, pay);
      out[t.best] += p * h * (1 - v);
      out[t.worst] += p * h * v;
    });
    return out;
  }

  /** Exact outlook of the next spin: chance of any win and the expected net result, all effects included. */
  outlook(): { pWin: number; ev: number; bribeGain: number } {
    const input = this.input(this.roundsLeft === 1);
    const results = this.wheel.map((_, i) => scoreSpin(input, i));
    const fin = this.finalChances();
    let pWin = 0;
    let back = 0;
    results.forEach((r, i) => {
      if (r.anyWin) pWin += fin[i];
      back += fin[i] * (r.payout + (r.anyWin && this.highRisk ? this.riskRefund : 0));
    });
    // What the croupier's nudge is worth (landing only), for pricing the bribe.
    let bribeGain = 0;
    if (this.stakeTotal > 0) {
      const plain = pocketWeights(this.wheel, this.bets, this.items, this.activeRule, { ball: this.ball, kreide: this.boost.kreide });
      const a = this.landing(plain);
      const b = this.landing(this.pulled(plain));
      results.forEach((r, i) => (bribeGain += (b[i] - a[i]) * r.payout));
    }
    return { pWin, ev: back - this.stakeTotal - this.riskStake, bribeGain };
  }

  /** Chance (0..1) that the ball lands in each pocket this round, visions included. */
  chances(): number[] {
    return this.landing(this.weights());
  }

  // ---- Spinning -----------------------------------------------------------

  private input(isLastSpin: boolean) {
    return {
      wheel: this.wheel, bets: this.bets, items: this.items, rule: this.activeRule, isLastSpin,
      moneyBefore: this.moneyBefore, perks: this.perks, cubeField: this.cubeField,
      lastNumber: this.history[0]?.n, lossStreak: this.stats.lossStreak, sameBets: this.sameAsLast(),
      news: this.news, ball: this.ball, boost: this.boost, highRisk: this.highRisk,
    };
  }

  /** Whether the current bets are exactly last round's bets. */
  sameAsLast(): boolean {
    const a = Object.entries(this.bets).map(([k, v]) => `${k}:${stakeOf(v)}`).sort().join('|');
    const b = Object.entries(this.lastBets).map(([k, v]) => `${k}:${stakeOf(v)}`).sort().join('|');
    return a.length > 0 && a === b;
  }

  /** Resolves the spin immediately; the renderer animates towards `result.pocket`. */
  spin(): SpinResult {
    if (this.phase !== 'betting') throw new Error('not betting');
    // A bribe may be spotted by the floor manager: the money is gone and the rate goes up.
    this.bribeCaught = false;
    this.bribePaid = 0;
    // High risk only counts on the last spin (an espresso may have added one).
    if (this.highRisk && this.roundsLeft !== 1) this.setHighRisk(false);
    // Nothing on the table: nothing to nudge, nothing to pay.
    if (this.stakeTotal === 0) this.bribed = false;
    if (this.bribed) {
      const price = this.bribePrice;
      if (this.cash < price) {
        this.bribed = false;
      } else {
        this.cash -= price;
        this.bribePaid = price;
        this.bribesThisCycle++;
      }
    }
    if (this.bribed) {
      const risk = this.news === 'streik' ? 0 : BRIBE_RISK * this.bribesThisCycle;
      if (this.rng.chance(risk)) {
        this.bribed = false;
        this.bribeCaught = true;
        this.debtAdd += roundNice(this.debt * 0.2);
        this.stats.bribesCaught++;
      } else {
        this.stats.bribesOk++;
      }
    }
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
      const pay = this.wheel.map((_, i) => (neighborIndices(index, this.hopReach).includes(i) || i === index ? scoreSpin(input, i).payout : 0));
      const t = this.hopTargets(index, pay);
      // The voodoo doll's price: now and then luck turns against you.
      const to = this.voodooTurn && this.rng.chance(this.voodooTurn) ? t.worst : t.best;
      if (to !== index) result = { ...scoreSpin(input, to), hop: { from: index, to } };
    }
    this.phase = 'spinning';
    this.lastResult = result;
    return result;
  }

  /** Set by `spin` when the floor manager saw the bribe, and what was paid. */
  bribeCaught = false;
  bribePaid = 0;

  /** Part of the high-risk surcharge that comes back after a win. */
  get riskRefund(): number {
    return Math.floor(this.riskStake / 2);
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
    const same = this.sameAsLast();
    this.trackStats(r, same);
    const riskIn = this.riskStake;
    const riskBack = this.highRisk && r.anyWin ? this.riskRefund : 0;
    if (this.highRisk) {
      this.cash += riskBack;
      if (r.anyWin) this.stats.riskWins++;
      this.highRisk = false;
      this.riskStake = 0;
    }
    this.settleDuel(r, riskBack - riskIn);
    this.lastBets = this.bets;
    this.bets = {};
    this.boost = noBoost();
    this.bribed = false;
    this.roundsLeft--;
    if (this.roundsLeft > 0) {
      this.phase = 'betting';
      this.rollVisions();
      this.rollDuel();
      // Broke in the middle of a rate: the loan shark shows up once.
      if (this.cash < 1 && this.deposit < this.debt && !this.sharkUsed) {
        this.phase = 'shark';
        this.sharkDue = false;
      }
    } else {
      this.phase = 'due';
      if (this.cash + this.deposit < this.debt) {
        if (!this.sharkUsed) {
          this.phase = 'shark';
          this.sharkDue = true;
        } else {
          this.phase = 'gameover';
        }
      }
    }
  }

  private settleDuel(r: SpinResult, riskNet: number): void {
    const d = this.duel;
    this.lastDuel = undefined;
    if (!d) return;
    // The rival plays by the same house rules.
    const f = FIELD_BY_ID[d.fieldId];
    const wins = fieldWins(f, r.pocket) && !(f.kind === 'red' && this.activeRule === 'rotfluch');
    const pays = f.kind === 'straight' && this.activeRule === 'halbzahl' ? 18 : f.payout;
    const rivalNet = (wins ? d.stake * pays : 0) - d.stake;
    const playerNet = r.payout - r.stake + riskNet;
    d.rivalNet = rivalNet;
    d.playerNet = playerNet;
    // Sitting the duel out counts as losing it.
    if (r.stake > 0 && playerNet > rivalNet) {
      d.outcome = 'won';
      this.marks += 3;
      this.cash += d.stake;
      this.stats.duelWins++;
    } else if (r.stake === 0 || playerNet < rivalNet) {
      d.outcome = 'lost';
      this.debtAdd += roundNice(this.debt * 0.15);
      this.stats.duelLosses++;
    } else {
      d.outcome = 'tie';
    }
    this.lastDuel = d;
    this.duel = undefined;
    this.nextDuelAt = this.stats.spins + 7 + this.rng.int(4);
  }

  // ---- The loan shark ------------------------------------------------------------

  /** What the loan shark would hand over now. */
  get sharkAmount(): number {
    if (this.sharkDue) return roundNice(this.debt - this.deposit - this.cash + this.debt * 0.25);
    return Math.max(20, roundNice(this.debt * 0.6));
  }

  takeShark(): number {
    if (this.phase !== 'shark') return 0;
    const amount = this.sharkAmount;
    this.cash += amount;
    this.sharkUsed = true;
    this.sharkRunning = true;
    this.sharkFrom = this.cycle + 1;
    this.phase = this.sharkDue ? 'due' : 'betting';
    return amount;
  }

  declineShark(): void {
    if (this.phase !== 'shark') return;
    this.sharkUsed = true;
    this.phase = this.sharkDue ? 'gameover' : 'betting';
  }

  // ---- Cigarette machine ------------------------------------------------------------

  smokePrice(id: string): number {
    return Math.max(3, roundNice(this.debt * CONSUMABLES[id].price));
  }

  /** Buys a one-shot item. Returns a message, or undefined when it was not possible. */
  buySmoke(id: string): string | undefined {
    if (!CONSUMABLES[id] || this.locked.has(id) || !this.cashierOpen) return undefined;
    const price = this.smokePrice(id);
    if (this.cash < price) return undefined;
    const instant = id === 'rubbellos' || id === 'espresso';
    if (!instant && this.smokes.length >= MAX_CONSUMABLES) return undefined;
    if (id === 'espresso' && this.phase !== 'betting') return undefined;
    this.cash -= price;
    this.stats.smokes++;
    if (id === 'rubbellos') {
      if (this.rng.chance(1 / 3)) {
        this.cash += price * 3;
        return `GEWONNEN! +$${price * 3}`;
      }
      return 'NIETE.';
    }
    if (id === 'espresso') {
      this.setHighRisk(false);
      this.roundsLeft++;
      this.cycleRounds++;
      return '+1 DREH VOR DIESER RATE.';
    }
    this.smokes.push(id);
    return `${CONSUMABLES[id].name.toUpperCase()} IN DER TASCHE.`;
  }

  /** Uses a pocket item for the next spin. */
  useSmoke(i: number): boolean {
    const id = this.smokes[i];
    if (!id || this.phase !== 'betting') return false;
    const b = this.boost;
    if (id === 'zigarette') b.luck += 4;
    else if (id === 'gezinkt') b.gezinkt = true;
    else if (id === 'kreide') b.kreide = true;
    else if (id === 'kaugummi') b.kaugummi = true;
    else if (id === 'korn') b.korn = true;
    this.smokes.splice(i, 1);
    return true;
  }

  // ---- Croupier and high risk --------------------------------------------------------

  /** The croupier wants a share of what his nudge is worth for your current bets. */
  get bribePrice(): number {
    if (this.stakeTotal === 0) return 0;
    return Math.max(5, roundNice(this.outlookBribeGain() * BRIBE_PRICE));
  }

  private outlookBribeGain(): number {
    const was = this.bribed;
    this.bribed = false;
    const g = this.outlook().bribeGain;
    this.bribed = was;
    return g;
  }

  /** Chance that the next bribe is seen. */
  get bribeRisk(): number {
    return this.news === 'streik' ? 0 : BRIBE_RISK * (this.bribesThisCycle + 1);
  }

  /** Tips the croupier for the next spin; he is paid when the ball is thrown. Calling again takes it back. */
  bribe(): boolean {
    if (this.phase !== 'betting') return false;
    if (this.bribed) {
      this.bribed = false;
      return true;
    }
    if (this.stakeTotal === 0 || this.cash < this.bribePrice) return false;
    this.bribed = true;
    return true;
  }

  /** High risk is possible on the last spin of a rate, with stakes on the table and cash to double them. */
  get canHighRisk(): boolean {
    return this.phase === 'betting' && this.roundsLeft === 1 && this.stakeTotal > 0 && (this.highRisk || this.cash >= this.stakeTotal);
  }

  setHighRisk(on: boolean): boolean {
    if (on === this.highRisk) return true;
    if (on) {
      if (!this.canHighRisk) return false;
      this.riskStake = this.stakeTotal;
      this.cash -= this.riskStake;
    } else {
      this.cash += this.riskStake;
      this.riskStake = 0;
    }
    this.highRisk = on;
    return true;
  }

  private trackStats(r: SpinResult, same: boolean): void {
    const s = this.stats;
    if (r.anyWin && r.bets.length === 1) s.focusWins++;
    s.nearMisses += r.nearMiss.length;
    if (this.history[1] && this.history[1].n === r.pocket.number) s.repeats++;
    s.minCash = Math.min(s.minCash, this.cash);
    s.sameBetStreak = same ? s.sameBetStreak + 1 : 0;
    s.bestSameBetStreak = Math.max(s.bestSameBetStreak, s.sameBetStreak);
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
    s.maxSets = Math.max(s.maxSets, activeSets(this.items).length);
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

  /** Marks for paying a rate, from clover pots. */
  private get cloverMarks(): number {
    return this.active('kleeblatt').reduce((a, l) => a + 2 * l, 0);
  }

  /** Marks earned by paying now: 3 plus 1 for every round left over. */
  get payMarks(): number {
    const early = this.phase === 'betting' ? this.roundsLeft : 0;
    return 3 + early + this.cloverMarks;
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
    if (this.sharkRunning) this.stats.sharkRepaid++;
    this.sharkRunning = false;
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

  /** Hangs up on the boss. */
  declineOffers(): void {
    if (!this.offers.length) return;
    this.offers = [];
    this.stats.hangups++;
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
      case 'runde': p.extraRounds++; this.roundsLeft++; this.cycleRounds++; return 'Ab sofort ein Dreh mehr vor jeder Rate.';
      case 'kredit': {
        const amount = roundNice(this.debt / 2);
        this.cash += amount;
        const extra = Math.round(amount * 1.5);
        this.debtAdd += extra;
        this.loanRunning = true;
        return `+$${amount}. Die Rate steigt um $${extra}.`;
      }
      case 'stundung':
        this.debtFactor *= 0.7;
        this.nextDebtFactor *= 1.15;
        return 'Diese Rate ist 30 % niedriger. Die nächste wird 15 % teurer.';
      case 'rotplus': p.redMult += 0.5; return 'Rot zahlt ab sofort +0,5 Mult.';
      case 'schwarzplus': p.blackMult += 0.5; return 'Schwarz zahlt ab sofort +0,5 Mult.';
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
    const owned = new Map(this.items.map((t) => [t.def, t]));
    // Owned talismans come back now and then: a second copy makes the first one golden.
    const pool = Object.values(ITEMS).filter((d) => !this.locked.has(d.id) && (!owned.has(d.id) || (canFuse(d.id) && !owned.get(d.id)!.gold)));
    const items: ShopItem[] = [];
    const extra = this.stage >= 2 ? 1 : 0;
    for (let i = 0; i < 4 && pool.length; i++) {
      const k = this.rng.weighted(pool.map((d) => RARITY[d.rarity].weight * (owned.has(d.id) ? 0.6 : 1)));
      const [d] = pool.splice(k, 1);
      const fuse = owned.has(d.id);
      items.push({ kind: 'item', def: d.id, price: itemPrice(d.id) + extra + (fuse ? FUSE_EXTRA : 0), fuse });
    }
    const tools = Object.values(POCKET_ITEMS);
    for (let i = 0; i < 2; i++) {
      const k = this.rng.weighted(tools.map((t) => t.weight));
      const [t] = tools.splice(k, 1);
      items.push({ kind: 'pocket', def: t.id, price: t.price + extra });
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
    if (item.kind === 'item' && !this.fuseTarget(item) && this.items.length >= this.perks.slots) return false;
    return true;
  }

  /** The owned copy a showcase item would turn golden. */
  fuseTarget(item: ShopItem): ItemInstance | undefined {
    if (item.kind !== 'item' || !item.fuse) return undefined;
    return this.items.find((t) => t.def === item.def && !t.gold);
  }

  private addItem(def: string): void {
    this.items.push({ uid: this.uid++, def, counter: 0 });
    this.stats.maxItems = Math.max(this.stats.maxItems, this.items.length);
  }

  buy(i: number): boolean {
    if (!this.canBuy(i) || this.shop[i].kind !== 'item') return false;
    const item = this.shop[i];
    const clock = this.clockBonus;
    const target = this.fuseTarget(item);
    if (target) {
      target.gold = true;
      this.stats.golds++;
    } else {
      this.addItem(item.def);
    }
    this.marks -= item.price;
    item.sold = true;
    const gained = this.clockBonus - clock;
    this.roundsLeft += gained;
    this.cycleRounds += gained;
    if ((item.def === 'kristallkugel' || item.def === 'zauberwuerfel') && this.phase === 'betting') this.rollVisions();
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
    return t ? Math.max(1, Math.floor(itemPrice(t.def) / 2) + (t.gold ? 2 : 0)) : 0;
  }

  sellItem(uid: number): boolean {
    if (!this.cashierOpen) return false;
    const i = this.items.findIndex((t) => t.uid === uid);
    if (i < 0) return false;
    this.marks += this.sellPrice(uid);
    const clock = this.clockBonus;
    const [t] = this.items.splice(i, 1);
    const lost = Math.max(0, Math.min(clock - this.clockBonus, this.roundsLeft - 1));
    this.roundsLeft -= lost;
    this.cycleRounds -= lost;
    if (t.def === 'kristallkugel' && !this.has('kristallkugel')) this.visions = [];
    if (t.def === 'zauberwuerfel' && !this.has('zauberwuerfel')) this.cubeField = undefined;
    return true;
  }

  /** Swaps an item with its neighbour; order matters for the mirror. */
  moveItem(uid: number, dir: -1 | 1): boolean {
    const i = this.items.findIndex((t) => t.uid === uid);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= this.items.length) return false;
    const clock = this.clockBonus;
    [this.items[i], this.items[j]] = [this.items[j], this.items[i]];
    // A mirror next to a pocket watch copies its extra spin.
    const d = Math.max(this.clockBonus - clock, 1 - this.roundsLeft);
    this.roundsLeft += d;
    this.cycleRounds += d;
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
