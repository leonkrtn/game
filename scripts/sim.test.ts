// Balance check: plays many runs with simple bots and prints how many rates they pay.
// Run with `npm run sim`.
import { it } from 'vitest';
import { DEBTS } from '../src/game/content';
import { Run } from '../src/game/run';

interface Bot {
  name: string;
  /** Share of cash deposited every round. */
  save?: number;
  /** Share of cash put on red each round. */
  f: number;
  shop: boolean;
  early: boolean;
  shark?: boolean;
}

const PREFS = ['pfennig', 'kerze', 'hufeisen', 'sanduhr', 'sparschwein', 'katze', 'zinnsoldat', 'wuerfel', 'abakus', 'glocke', 'teufel', 'goldkugel', 'zigarre', 'police'];

function round(run: Run, bot: Bot): void {
  // Keep what the rate needs out of play, and lock it away in the last round.
  const missing = Math.max(0, run.debt - run.deposit);
  if (run.roundsLeft === 1 || run.cash >= missing * 3) run.depositCash(Math.min(missing, run.cash));
  if (bot.early && run.canPay()) {
    run.pay();
    if (run.offers.length) run.chooseOffer(0);
    return;
  }
  if (bot.shop) {
    for (let i = 0; i < run.shop.length; i++) {
      if (run.shop[i].kind === 'item' && PREFS.includes(run.shop[i].def) && run.canBuy(i)) run.buy(i);
    }
  }
  if (bot.save) run.depositCash(Math.floor(run.cash * bot.save));
  const free = Math.max(0, run.cash - Math.max(0, run.debt - run.deposit) * 0.5);
  const stake = Math.floor(free * bot.f);
  if (stake > 0) run.placeBet('red', stake);
  run.spin();
  run.settle();
}

function play(seed: number, bot: Bot): number {
  const run = new Run({ seed });
  for (let guard = 0; guard < 300; guard++) {
    if (run.phase === 'betting') round(run, bot);
    else if (run.phase === 'due') {
      run.pay();
      if (run.offers.length) run.chooseOffer(0);
    } else if (run.phase === 'shark') {
      if (bot.shark) run.takeShark();
      else run.declineShark();
    } else break;
  }
  return run.paidRates;
}

it('balance', () => {
  const bots: Bot[] = [
    { name: 'Rot 30%', f: 0.3, shop: false, early: false },
    { name: 'Rot 30% +Shop', f: 0.3, shop: true, early: false },
    { name: 'Rot 60% +Shop', f: 0.6, shop: true, early: false },
    { name: 'Rot 100% +Shop', f: 1, shop: true, early: false },
    { name: 'Sparer 30/50 +Shop', f: 0.5, save: 0.3, shop: true, early: false },
    { name: 'Sparer 15/60 +Shop', f: 0.6, save: 0.15, shop: true, early: false },
    { name: 'Rot 60% +Shop +Hai', f: 0.6, shop: true, early: false, shark: true },
  ];
  for (const bot of bots) {
    const N = 3000;
    const hist = new Array(DEBTS.length + 1).fill(0);
    for (let s = 0; s < N; s++) hist[play(s + 1, bot)]++;
    let reach = N;
    const rows: string[] = [];
    for (let r = 0; r < DEBTS.length; r++) {
      reach -= hist[r];
      rows.push(`${r + 1}:${((reach / N) * 100).toFixed(0)}%`);
    }
    process.stderr.write(`${bot.name.padEnd(22)} | ${rows.join(' ')}\n`);
  }
}, 120000);
