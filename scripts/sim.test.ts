// Balance check: plays many runs with simple bots and prints how many rates they pay.
// Run with `npm run sim`.
import { it } from 'vitest';
import { DEBTS } from '../src/game/content';
import { Run } from '../src/game/run';

type Bet = (run: Run) => void;

/** Everything on the color the hand's color chips favor. */
const allIn: Bet = (run) => {
  const reds = run.hand.filter((c) => c.def === 'rot').length;
  const blacks = run.hand.filter((c) => c.def === 'schwarz').length;
  const field = blacks > reds ? 'black' : 'red';
  for (const c of [...run.hand]) run.place(c.uid, field);
};

/** Splits the hand between red and black. */
const hedge: Bet = (run) => {
  run.hand.slice().forEach((c, i) => run.place(c.uid, i % 2 ? 'black' : 'red'));
};

const PREFS = ['rotfuchs', 'nachteule', 'hochstapler', 'vorsicht', 'sammler', 'serie', 'letzterwurf', 'schuldner'];

function shop(run: Run): void {
  for (let i = 0; i < run.shop.length; i++) {
    const it = run.shop[i];
    const want =
      (it.kind === 'talisman' && PREFS.includes(it.def)) ||
      (it.kind === 'chip' && ['rot', 'schwarz', 'gold', 'turm'].includes(it.def));
    const reserve = run.phase === 'due' ? run.debt : run.debt * (1 - run.round / 6);
    if (want && run.canBuy(i) && run.money - it.price >= reserve) run.buy(i);
  }
}

function play(seed: number, bet: Bet, shopping: boolean): number {
  const run = new Run(seed);
  for (let guard = 0; guard < 400; guard++) {
    if (run.phase === 'betting') {
      if (shopping) shop(run);
      bet(run);
      run.spin();
      run.settle();
    } else if (run.phase === 'due') {
      run.pay();
    } else break;
  }
  return run.paidRates;
}

it('balance', () => {
  for (const [name, bet] of [['all-in', allIn], ['hedge', hedge]] as const) {
    for (const shopping of [false, true]) {
      const N = 2000;
      const hist = new Array(DEBTS.length + 1).fill(0);
      for (let s = 0; s < N; s++) hist[play(s + 1, bet, shopping)]++;
      let reach = N;
      const rows: string[] = [];
      for (let r = 0; r < DEBTS.length; r++) {
        reach -= hist[r];
        rows.push(`${r + 1}:${((reach / N) * 100).toFixed(0)}%`);
      }
      process.stderr.write(`${name.padEnd(7)} ${shopping ? 'Shop ' : 'ohne '} | ${rows.join(' ')}\n`);
    }
  }
  // Income of the starting bag over one cycle, for tuning the first rate.
  for (const [name, bet] of [['all-in', allIn], ['hedge', hedge]] as const) {
    const incomes: number[] = [];
    for (let s = 0; s < 2000; s++) {
      const run = new Run(s + 99);
      for (let i = 0; i < 5; i++) {
        bet(run);
        run.spin();
        run.settle();
      }
      incomes.push(run.money);
    }
    incomes.sort((a, b) => a - b);
    const q = (p: number) => incomes[Math.floor(p * incomes.length)];
    process.stderr.write(`Einkommen Zyklus 1 (${name}): 5%=${q(0.05)} 25%=${q(0.25)} 50%=${q(0.5)} 75%=${q(0.75)}\n`);
  }
});
