import { describe, expect, it } from 'vitest';
import { DEBTS, SHARK_FACTOR } from '../src/game/content';
import { Run } from '../src/game/run';
import { pocketWeights, scoreSpin, type Perks, type SpinInput } from '../src/game/scoring';
import type { Pocket } from '../src/game/types';
import { standardColor, WHEEL_ORDER } from '../src/game/wheel';

const wheel = (): Pocket[] => WHEEL_ORDER.map((n, index) => ({ index, number: n, color: standardColor(n) }));
const idx = (w: Pocket[], n: number) => w.findIndex((p) => p.number === n);
const perks = (): Perks => ({ luck: 0, interest: 0, redMult: 0, blackMult: 0, extraRounds: 0, slots: 4 });
const item = (uid: number, def: string, counter = 0) => ({ uid, def, counter });

function input(partial: Partial<SpinInput>): SpinInput {
  return { wheel: wheel(), bets: {}, items: [], isLastSpin: false, moneyBefore: 1000, perks: perks(), ...partial };
}

describe('scoreSpin', () => {
  it('pays stakes by the roulette table', () => {
    const inp = input({ bets: { n17: [10], black: [5, 5], red: [10] } });
    const r = scoreSpin(inp, idx(inp.wheel, 17));
    expect(r.stake).toBe(30);
    expect(r.sum).toBe(360 + 20);
    expect(r.payout).toBe(380);
  });

  it('zero loses every outside bet', () => {
    const inp = input({ bets: { red: [10], even: [10], doz0: [10] } });
    const r = scoreSpin(inp, idx(inp.wheel, 0));
    expect(r.anyWin).toBe(false);
    expect(r.payout).toBe(0);
  });

  it('pays inside bets by their covered numbers', () => {
    const inp = input({ bets: { 'co0-0': [10], sz0: [10], st0: [10], sl0: [10] } });
    const r = scoreSpin(inp, idx(inp.wheel, 1));
    expect(r.sum).toBe(90 + 180 + 120 + 60);
  });

  it('items add and multiply the mult', () => {
    const inp = input({ bets: { n1: [10] }, items: [item(1, 'kerze'), item(2, 'winkekatze')] });
    const r = scoreSpin(inp, idx(inp.wheel, 1));
    // (1 + 1) × 2 = 4 on 360
    expect(r.mult).toBe(4);
    expect(r.payout).toBe(1440);
  });

  it('the mirror copies its right neighbour', () => {
    const inp = input({ bets: { red: [10] }, items: [item(1, 'spiegel'), item(2, 'kerze')] });
    expect(scoreSpin(inp, idx(inp.wheel, 1)).mult).toBe(3);
  });

  it('the policy refunds part of a lost round', () => {
    const inp = input({ bets: { red: [100] }, items: [item(1, 'police')] });
    expect(scoreSpin(inp, idx(inp.wheel, 2)).payout).toBe(30);
  });

  it('the pager pays near misses and the walkman rewards focus', () => {
    const w = wheel();
    // 32 sits next to 0 on the wheel.
    const inp = input({ wheel: w, bets: { n32: [10] }, items: [item(1, 'pager'), item(2, 'walkman')] });
    const r = scoreSpin(inp, idx(w, 0));
    expect(r.sum).toBe(80);
    expect(r.mult).toBe(2);
  });

  it('the polaroid and the magic cube multiply', () => {
    const inp = input({ bets: { red: [10] }, items: [item(1, 'polaroid'), item(2, 'zauberwuerfel')], lastNumber: 1, cubeField: 'red' });
    expect(scoreSpin(inp, idx(inp.wheel, 1)).mult).toBe(15);
  });

  it('golden talismans and sets are stronger', () => {
    const gold = input({ bets: { red: [10] }, items: [{ ...item(1, 'kerze'), gold: true }] });
    expect(scoreSpin(gold, idx(gold.wheel, 1)).mult).toBe(3);
    const set = input({ bets: { red: [10] }, items: [item(1, 'kerze'), item(2, 'zippo'), item(3, 'sanduhr')] });
    expect(scoreSpin(set, idx(set.wheel, 1)).mult).toBe(4);
    const nightSkull = input({ bets: { n0: [10] }, items: [{ ...item(1, 'totenkopf'), gold: true }] });
    expect(scoreSpin(nightSkull, idx(nightSkull.wheel, 0)).mult).toBe(11);
  });

  it('magnets and heavy pockets raise the weight', () => {
    const w = wheel();
    w[idx(w, 5)].mod = 'schwer';
    const weights = pocketWeights(w, { n8: [1] }, [item(1, 'magnet')]);
    expect(weights[idx(w, 5)]).toBe(2);
    expect(weights[idx(w, 8)]).toBe(2);
    expect(weights[idx(w, 6)]).toBe(1);
  });
});

describe('Run', () => {
  it('takes stakes from cash and pays winnings back', () => {
    const run = new Run({ seed: 42 });
    const start = run.cash;
    expect(run.placeBet('red', 25)).toBe(true);
    expect(run.placeBet('black', 1000)).toBe(false);
    expect(run.cash).toBe(start - 25);
    expect(run.removeBet('red')).toBe(25);
    expect(run.cash).toBe(start);
    run.placeBet('red', 25);
    const r = run.spin();
    run.settle();
    expect(run.cash).toBe(start - 25 + r.payout);
    expect(run.roundsLeft).toBe(run.cycleRounds - 1);
  });

  it('deposits earn interest and pay the rate', () => {
    const run = new Run({ seed: 7 });
    run.news = '';
    run.cash = 1000;
    run.depositCash(200);
    run.spin();
    run.settle();
    expect(run.deposit).toBe(216);
    const marks = run.marks;
    const early = run.roundsLeft;
    expect(run.pay()).toBe(true);
    expect(run.deposit).toBe(216 - DEBTS[0]);
    expect(run.marks).toBe(marks + 3 + early);
    expect(run.cycle).toBe(1);
    expect(run.offers.length).toBe(3);
  });

  it('debt stages make rates harder and the sunglasses ignore house rules', () => {
    const easy = new Run({ seed: 1 });
    const hard = new Run({ seed: 1, stage: 4 });
    expect(hard.debt).toBeGreaterThan(easy.debt);
    expect(hard.cycleRounds).toBe(easy.cycleRounds - 1);
    hard.rule = 'limit';
    expect(hard.activeRule).toBe('limit');
    hard.items.push({ uid: 99, def: 'sonnenbrille', counter: 0 });
    expect(hard.activeRule).toBeUndefined();
  });

  it('the loan shark comes once, then it is game over', () => {
    const run = new Run({ seed: 3 });
    run.news = '';
    run.cash = 0;
    run.roundsLeft = 1;
    run.spin();
    run.settle();
    expect(run.phase).toBe('shark');
    const before = run.debt;
    run.takeShark();
    expect(run.phase).toBe('due');
    expect(run.canPay()).toBe(true);
    expect(run.debt).toBe(before);
    run.pay();
    run.news = '';
    expect(run.debt).toBe(Math.round(DEBTS[1] * SHARK_FACTOR));
    run.cash = 0;
    run.deposit = 0;
    run.roundsLeft = 1;
    run.phase = 'betting';
    run.spin();
    run.settle();
    expect(run.phase).toBe('gameover');
  });

  it('declining the loan shark at the rate ends the run', () => {
    const run = new Run({ seed: 4 });
    run.cash = 0;
    run.roundsLeft = 1;
    run.spin();
    run.settle();
    run.declineShark();
    expect(run.phase).toBe('gameover');
  });

  it('a second copy turns a talisman golden without a new slot', () => {
    const run = new Run({ seed: 5, kit: 'klassisch' });
    run.marks = 50;
    run.shop = [{ kind: 'item', def: 'hufeisen', price: 5, fuse: true }];
    const luck = run.luck;
    const count = run.items.length;
    expect(run.buy(0)).toBe(true);
    expect(run.items.length).toBe(count);
    expect(run.items[0].gold).toBe(true);
    expect(run.luck).toBe(luck + 1);
  });

  it('high risk doubles the loss and the mult', () => {
    const run = new Run({ seed: 11 });
    run.cash = 100;
    run.roundsLeft = 1;
    run.placeBet('red', 20);
    expect(run.setHighRisk(true)).toBe(true);
    expect(run.cash).toBe(60);
    expect(run.placeBet('black', 5)).toBe(false);
    const r = run.spin();
    run.settle();
    if (r.anyWin) expect(run.cash).toBe(60 + 20 + 20 * 2 * 2);
    else expect(run.cash).toBe(60);
  });

  it('cigarette machine items work for one spin', () => {
    const run = new Run({ seed: 12 });
    run.cash = 1000;
    expect(run.buySmoke('zigarette')).toBeTruthy();
    const luck = run.luck;
    run.useSmoke(0);
    expect(run.luck).toBe(luck + 4);
    run.spin();
    run.settle();
    expect(run.luck).toBe(luck);
  });

  it('a rival challenges you every few spins', () => {
    const run = new Run({ seed: 13 });
    run.cash = 1e12;
    let duels = 0;
    for (let i = 0; i < 40; i++) {
      if (run.phase === 'due') {
        run.pay();
        run.offers = [];
        run.phase = 'betting';
      }
      if (run.phase === 'victory') run.continueEndless();
      if (run.duel) duels++;
      run.placeBet('red', 5);
      run.spin();
      run.settle();
    }
    expect(duels).toBeGreaterThanOrEqual(3);
    expect(duels).toBeLessThanOrEqual(6);
  });

  it('luck lets the ball hop into a paying neighbour', () => {
    const run = new Run({ seed: 9 });
    run.perks.luck = 100;
    run.cash = 1000;
    run.placeBet('n17', 10);
    let hop: { from: number; to: number } | undefined;
    for (let i = 0; i < 2000 && !hop; i++) {
      run.phase = 'betting';
      hop = run.spin().hop;
    }
    expect(hop).toBeTruthy();
    expect(run.wheel[hop!.to].number).toBe(17);
    expect(Math.abs(hop!.to - hop!.from) % 35).toBeLessThanOrEqual(1);
  });
});
