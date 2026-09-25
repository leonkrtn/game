import { BALLS, CONSUMABLES, ITEMS, START_KITS } from './content';
import type { Run } from './run';

/** Persistent progress across runs. Stored per browser. */
export interface Profile {
  runs: number;
  wins: number;
  bestRates: number;
  bestWin: number;
  totalWon: number;
  done: string[];
  lastKit: string;
  /** Highest debt stage unlocked (0..5). */
  maxStage: number;
  lastStage: number;
  lastBall: string;
  /** Graphics setting: 'auto' lowers it by itself when the frame rate drops. */
  quality: 'auto' | 'high' | 'medium' | 'low';
  /** Steps of the first-run tutorial already shown. */
  tutorial: number;
}

export interface Achievement {
  id: string;
  name: string;
  /** Condition, written for the player. */
  desc: string;
  /** Item or start-kit ids unlocked by it. */
  rewards: string[];
  check: (run: Run) => boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'rate1', name: 'Erste Rate', desc: 'Bezahle deine erste Rate.', rewards: ['glocke'], check: (r) => r.paidRates >= 1 },
  { id: 'rate3', name: 'Stammgast', desc: 'Bezahle 3 Raten in einem Spiel.', rewards: ['gluckspilz', 'fernglas'], check: (r) => r.paidRates >= 3 },
  { id: 'rate5', name: 'Alter Hase', desc: 'Bezahle 5 Raten in einem Spiel.', rewards: ['goldkugel'], check: (r) => r.paidRates >= 5 },
  { id: 'frei', name: 'Frei!', desc: 'Bezahle alle 8 Raten.', rewards: ['teufel'], check: (r) => r.paidRates >= 8 },
  { id: 'plein', name: 'Volltreffer', desc: 'Gewinne mit einem Plein (Einzelzahl).', rewards: ['winkekatze', 'zocker'], check: (r) => r.stats.straightWins >= 1 },
  { id: 'tausend', name: 'Tausender', desc: 'Gewinne $1.000 Reingewinn in einer Runde.', rewards: ['spiegel'], check: (r) => r.stats.bestWin >= 1000 },
  { id: 'zehntausend', name: 'Großer Fisch', desc: 'Gewinne $10.000 Reingewinn in einer Runde.', rewards: ['kristallkugel'], check: (r) => r.stats.bestWin >= 10000 },
  { id: 'null', name: 'Null-Nummer', desc: 'Gewinne etwas, während die Kugel auf der 0 liegt.', rewards: ['totenkopf'], check: (r) => r.stats.zeroHits >= 1 },
  { id: 'maler', name: 'Kunstmaler', desc: 'Nummeriere in einem Spiel 3 Fächer um.', rewards: ['magnet'], check: (r) => r.stats.renumbers >= 3 },
  { id: 'kredit', name: 'Kreditwürdig', desc: 'Nimm am Telefon frisches Geld an und zahle die Rate danach trotzdem.', rewards: ['zigarre'], check: (r) => r.stats.loansRepaid >= 1 },
  { id: 'pech', name: 'Pechsträhne', desc: 'Verliere 3 Runden in Folge.', rewards: ['rabe'], check: (r) => r.stats.maxLossStreak >= 3 },
  { id: 'voll', name: 'Vollgestellt', desc: 'Habe 5 Talismane gleichzeitig auf dem Tisch.', rewards: ['goldbarren'], check: (r) => r.stats.maxItems >= 5 },
  { id: 'split', name: 'Feine Klinge', desc: 'Gewinne mit einem Cheval, Carré, einer Transversale oder Sechserreihe.', rewards: ['police'], check: (r) => r.stats.insideWins >= 1 },
  { id: 'reich', name: 'Dagobert', desc: 'Besitze $5.000 (Bargeld und Einzahlung).', rewards: ['bankier'], check: (r) => r.stats.maxMoney >= 5000 },
  { id: 'hops', name: 'Hüpf!', desc: 'Lass die Kugel 3-mal durch Glück nachhüpfen.', rewards: ['taschenuhr'], check: (r) => r.stats.hops >= 3 },
  { id: 'frueh', name: 'Pünktlich', desc: 'Bezahle eine Rate vor der letzten Runde.', rewards: ['kleeblatt'], check: (r) => r.stats.earlyPays >= 1 },
  { id: 'rate2', name: 'Durchhalter', desc: 'Bezahle 2 Raten in einem Spiel.', rewards: ['hasenpfote'], check: (r) => r.paidRates >= 2 },
  { id: 'fokus', name: 'Alles auf eine Karte', desc: 'Gewinne mit deinem ganzen Einsatz auf einem einzigen Feld.', rewards: ['walkman'], check: (r) => r.stats.focusWins >= 1 },
  { id: 'knapp', name: 'Knapp daneben', desc: 'Liege dreimal mit einem Plein direkt neben der Kugel.', rewards: ['pager'], check: (r) => r.stats.nearMisses >= 3 },
  { id: 'doppel', name: 'Déjà-vu', desc: 'Dieselbe Zahl fällt zweimal hintereinander.', rewards: ['polaroid'], check: (r) => r.stats.repeats >= 1 },
  { id: 'blank', name: 'Blank', desc: 'Hab einmal weniger als $5 Bargeld.', rewards: ['zippo'], check: (r) => r.stats.minCash < 5 },
  { id: 'auflegen', name: 'Nein danke', desc: 'Leg auf, wenn der Boss anruft.', rewards: ['voodoo'], check: (r) => r.stats.hangups >= 1 },
  { id: 'gewohnheit', name: 'Gewohnheitstier', desc: 'Setze dreimal hintereinander genau dasselbe.', rewards: ['kassette'], check: (r) => r.stats.bestSameBetStreak >= 3 },
  { id: 'reich2', name: 'Goldjunge', desc: 'Besitze $20.000 (Bargeld und Einzahlung).', rewards: ['goldkette'], check: (r) => r.stats.maxMoney >= 20000 },
  { id: 'stufe1', name: 'Stammkunde', desc: 'Bezahle eine Rate auf Schuldenstufe 1 oder höher.', rewards: ['zauberwuerfel'], check: (r) => r.stage >= 1 && r.paidRates >= 1 },
  { id: 'stufe3', name: 'Unantastbar', desc: 'Bezahle 4 Raten auf Schuldenstufe 3 oder höher.', rewards: ['sonnenbrille'], check: (r) => r.stage >= 3 && r.paidRates >= 4 },
  { id: 'gold1', name: 'Goldschmied', desc: 'Mach einen Talisman golden (zweites Exemplar kaufen).', rewards: ['glas'], check: (r) => r.stats.golds >= 1 },
  { id: 'set1', name: 'Sammler', desc: 'Stell ein komplettes Set aus drei Talismanen auf den Tisch.', rewards: ['elfenbein'], check: (r) => r.stats.maxSets >= 1 },
  { id: 'duell', name: 'High Noon', desc: 'Gewinne ein Duell gegen einen Stammgast.', rewards: ['onyx'], check: (r) => r.stats.duelWins >= 1 },
  { id: 'schmiergeld', name: 'Schmiergeld', desc: 'Besteche den Croupier dreimal, ohne aufzufliegen.', rewards: ['kupfer'], check: (r) => r.stats.bribesOk >= 3 },
  { id: 'risiko', name: 'Alles oder nichts', desc: 'Gewinne einen Hochrisiko-Dreh.', rewards: ['blei'], check: (r) => r.stats.riskWins >= 1 },
  { id: 'hai', name: 'Mit Haien schwimmen', desc: 'Nimm das Geld vom Kredithai und bezahle danach eine Rate.', rewards: ['gezinkt'], check: (r) => r.stats.sharkRepaid >= 1 },
  { id: 'raucher', name: 'Kettenraucher', desc: 'Kauf 4 Sachen am Zigarettenautomaten in einem Spiel.', rewards: ['espresso'], check: (r) => r.stats.smokes >= 4 },
];

const KEY = 'rien-ne-va-plus/profile/v1';

export function emptyProfile(): Profile {
  return { runs: 0, wins: 0, bestRates: 0, bestWin: 0, totalWon: 0, done: [], lastKit: 'klassisch', maxStage: 0, lastStage: 0, lastBall: 'stahl', quality: 'auto', tutorial: 0 };
}

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...emptyProfile(), ...JSON.parse(raw) };
  } catch {
    // Storage can be unavailable (private mode, sandboxed previews); play without saving.
  }
  return emptyProfile();
}

export function saveProfile(p: Profile): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // See loadProfile.
  }
}

/** Everything that is still locked for this profile. */
export function lockedIds(p: Profile): Set<string> {
  const done = new Set(p.done);
  const out = new Set<string>();
  for (const a of ACHIEVEMENTS) if (!done.has(a.id)) for (const r of a.rewards) out.add(r);
  return out;
}

/** Marks newly reached achievements and returns them. */
export function checkAchievements(p: Profile, run: Run): Achievement[] {
  const fresh = ACHIEVEMENTS.filter((a) => !p.done.includes(a.id) && a.check(run));
  if (fresh.length) {
    p.done.push(...fresh.map((a) => a.id));
    saveProfile(p);
  }
  return fresh;
}

/** Folds a finished (or abandoned) run into the lifetime stats. */
export function recordRun(p: Profile, run: Run, won: boolean): void {
  p.runs++;
  if (won) p.wins++;
  if (won && run.stage >= p.maxStage) p.maxStage = Math.min(5, run.stage + 1);
  p.bestRates = Math.max(p.bestRates, run.paidRates);
  p.bestWin = Math.max(p.bestWin, run.stats.bestWin);
  p.totalWon += run.stats.totalWon;
  saveProfile(p);
}

export function rewardName(id: string): string {
  if (ITEMS[id]) return ITEMS[id].name;
  if (START_KITS[id]) return `Start „${START_KITS[id].name}"`;
  if (BALLS[id]) return `Kugel „${BALLS[id].name}"`;
  if (CONSUMABLES[id]) return `Automat: ${CONSUMABLES[id].name}`;
  return id;
}
