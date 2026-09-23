import { ITEMS, START_KITS } from './content';
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
];

const KEY = 'rien-ne-va-plus/profile/v1';

export function emptyProfile(): Profile {
  return { runs: 0, wins: 0, bestRates: 0, bestWin: 0, totalWon: 0, done: [], lastKit: 'klassisch' };
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
  p.bestRates = Math.max(p.bestRates, run.paidRates);
  p.bestWin = Math.max(p.bestWin, run.stats.bestWin);
  p.totalWon += run.stats.totalWon;
  saveProfile(p);
}

export function rewardName(id: string): string {
  return ITEMS[id]?.name ?? (START_KITS[id] ? `Start „${START_KITS[id].name}"` : id);
}
