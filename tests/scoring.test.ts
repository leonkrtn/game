import { describe, expect, it } from 'vitest';
import { Rng } from '../src/game/rng';
import { pocketWeights, scoreSpin, type SpinInput } from '../src/game/scoring';
import { Run } from '../src/game/run';
import type { Pocket } from '../src/game/types';
import { standardColor, WHEEL_ORDER } from '../src/game/wheel';

const wheel = (): Pocket[] => WHEEL_ORDER.map((n, index) => ({ index, number: n, color: standardColor(n) }));
const idx = (w: Pocket[], n: number) => w.findIndex((p) => p.number === n);
const chip = (uid: number, def: string) => ({ uid, def });

function input(partial: Partial<SpinInput>): SpinInput {
  return { wheel: wheel(), placed: {}, talismans: [], isLastSpin: false, money: 0, winStreak: 0, bonusMult: 0, paidRates: 0, ...partial };
}

describe('scoreSpin', () => {
  it('pays straight numbers ×36 and outside bets ×2', () => {
    const inp = input({ placed: { n17: [chip(1, 'basis')], black: [chip(2, 'basis')], red: [chip(3, 'basis')] } });
    const r = scoreSpin(inp, idx(inp.wheel, 17), new Rng(1));
    expect(r.sum).toBe(360 + 20);
    expect(r.mult).toBe(1);
    expect(r.score).toBe(380);
  });

  it('zero loses every outside bet', () => {
    const inp = input({ placed: { red: [chip(1, 'basis')], even: [chip(2, 'basis')], doz0: [chip(3, 'basis')] } });
    const r = scoreSpin(inp, idx(inp.wheel, 0), new Rng(1));
    expect(r.anyWin).toBe(false);
    expect(r.score).toBe(0);
  });

  it('applies color chips, talismans and multipliers in order', () => {
    const inp = input({
      placed: { red: [chip(1, 'rot'), chip(2, 'basis')] },
      talismans: [{ uid: 9, def: 'rotfuchs', counter: 0 }, { uid: 10, def: 'hochstapler', counter: 0 }],
    });
    const r = scoreSpin(inp, idx(inp.wheel, 1), new Rng(1));
    // sum = (5 + 10) * 2 = 30, mult = 1 + 3 (rot) + 4 (fuchs) + 2 (stack) = 10
    expect(r.sum).toBe(30);
    expect(r.mult).toBe(10);
    expect(r.score).toBe(300);
  });

  it('neighbor chips win on adjacent wheel pockets', () => {
    const w = wheel();
    // 32 sits right next to 0 on the wheel.
    const inp = input({ wheel: w, placed: { n0: [chip(1, 'nachbar')] } });
    const r = scoreSpin(inp, idx(w, 32), new Rng(1));
    expect(r.chips[0].won).toBe(true);
    expect(r.sum).toBe(10 * 9);
  });

  it('renumbered pockets count for the new number and color', () => {
    const w = wheel();
    const p = w[idx(w, 2)];
    p.number = 7;
    p.color = standardColor(7);
    const inp = input({ wheel: w, placed: { n7: [chip(1, 'basis')], red: [chip(2, 'basis')] } });
    const r = scoreSpin(inp, p.index, new Rng(1));
    expect(r.sum).toBe(360 + 20);
  });

  it('magnets and heavy pockets raise the weight', () => {
    const w = wheel();
    w[idx(w, 5)].mod = 'schwer';
    const weights = pocketWeights(w, { n5: [chip(1, 'magnet')] }, []);
    expect(weights[idx(w, 5)]).toBe(3);
    expect(weights[idx(w, 6)]).toBe(1);
  });
});

describe('Run', () => {
  it('plays a full cycle and keeps chip accounting intact', () => {
    const run = new Run(42);
    const total = run.bag.length;
    expect(run.hand.length).toBe(5);
    for (let spin = 0; spin < 5; spin++) {
      expect(run.phase).toBe('betting');
      for (const c of [...run.hand]) run.place(c.uid, 'red');
      run.spin();
      run.settle();
      const counted = run.drawPile.length + run.discard.length + run.hand.length;
      expect(counted).toBe(total);
    }
    expect(['due', 'gameover']).toContain(run.phase);
  });

  it('paying the rate starts the next cycle', () => {
    const run = new Run(7);
    run.spinsLeft = 1;
    run.spin();
    run.settle();
    run.phase = 'due';
    run.money = run.debt + 100;
    expect(run.pay()).toBe(true);
    expect(run.cycle).toBe(1);
    expect(run.money).toBe(100);
    expect(run.phase).toBe('betting');
    expect(run.spinsLeft).toBe(run.spinsPerCycle);
  });

  it('is game over when the rate cannot be paid', () => {
    const run = new Run(3);
    run.spinsLeft = 1;
    run.spin();
    run.money = -1e9;
    run.settle();
    expect(run.phase).toBe('gameover');
  });
});
