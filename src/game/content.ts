import type { PocketModId } from './types';

export interface ChipDef {
  id: string;
  name: string;
  value: number;
  price: number;
  desc: string;
  /** Face color and rim color for rendering. */
  color: string;
  rim: string;
  /** Relative shop weight. */
  weight: number;
}

export const CHIPS: Record<string, ChipDef> = {
  basis: { id: 'basis', name: 'Basis-Jeton', value: 10, price: 2, desc: 'Solide. Keine Tricks.', color: '#e8e4da', rim: '#8a8578', weight: 2 },
  rot: { id: 'rot', name: 'Rot-Jeton', value: 5, price: 3, desc: '+3 Mult, wenn die Kugel auf Rot landet.', color: '#d8323c', rim: '#f5d0d0', weight: 3 },
  schwarz: { id: 'schwarz', name: 'Schwarz-Jeton', value: 5, price: 3, desc: '+3 Mult, wenn die Kugel auf Schwarz landet.', color: '#25252b', rim: '#c9c9d4', weight: 3 },
  gold: { id: 'gold', name: 'Gold-Jeton', value: 30, price: 5, desc: 'Hoher Grundwert.', color: '#e7b53c', rim: '#fff1b8', weight: 2 },
  ketten: { id: 'ketten', name: 'Ketten-Jeton', value: 5, price: 4, desc: 'Gewinnt er: +10 Wert pro anderem gewinnenden Jeton.', color: '#8e4fd6', rim: '#e3cffa', weight: 3 },
  turm: { id: 'turm', name: 'Turm-Jeton', value: 5, price: 4, desc: 'Gewinnt er: +15 Wert pro anderem Jeton im selben Stapel.', color: '#c46a2b', rim: '#ffd9b8', weight: 3 },
  magnet: { id: 'magnet', name: 'Magnet-Jeton', value: 5, price: 5, desc: 'Auf einer Zahl: Fächer mit dieser Zahl ziehen die Kugel an (Gewicht +1).', color: '#2f6fd8', rim: '#cfe0ff', weight: 2 },
  nachbar: { id: 'nachbar', name: 'Nachbar-Jeton', value: 10, price: 4, desc: 'Auf einer Zahl: gewinnt auch, wenn die Kugel direkt daneben auf dem Rad landet (×9).', color: '#1f9e8f', rim: '#c4f2ec', weight: 2 },
  versicherung: { id: 'versicherung', name: 'Versicherung', value: 10, price: 3, desc: 'Verliert er: +3 Mult.', color: '#3d9a3d', rim: '#d2f3d2', weight: 2 },
  glas: { id: 'glas', name: 'Glas-Jeton', value: 10, price: 5, desc: 'Gewinnt er: ×2 Mult. 25 % Chance, danach zu zerbrechen.', color: '#9fe3f0', rim: '#ffffff', weight: 2 },
  zins: { id: 'zins', name: 'Zins-Jeton', value: 5, price: 4, desc: 'Gewinnt er: +5 % Zinsen auf dein Bargeld.', color: '#9bbf2f', rim: '#eef8c8', weight: 2 },
};

export interface TalismanDef {
  id: string;
  name: string;
  price: number;
  /** `{n}` is replaced with the talisman's counter. */
  desc: string;
  icon: string;
  weight: number;
}

export const TALISMANS: Record<string, TalismanDef> = {
  rotfuchs: { id: 'rotfuchs', name: 'Rotfuchs', price: 5, desc: '+4 Mult, wenn die Kugel auf Rot landet.', icon: '🦊', weight: 3 },
  nachteule: { id: 'nachteule', name: 'Nachteule', price: 5, desc: '+4 Mult, wenn die Kugel auf Schwarz landet.', icon: '🦉', weight: 3 },
  nullheld: { id: 'nullheld', name: 'Null-Held', price: 6, desc: 'Landet die Kugel auf einer 0: ×6 Mult.', icon: '⭕', weight: 2 },
  scharfschuetze: { id: 'scharfschuetze', name: 'Scharfschütze', price: 7, desc: 'Gewinnt mindestens eine Einzelzahl: ×2 Mult.', icon: '🎯', weight: 2 },
  hochstapler: { id: 'hochstapler', name: 'Hochstapler', price: 6, desc: '+2 Mult pro gewinnendem Stapel (mind. 2 Jetons).', icon: '🗼', weight: 3 },
  vorsicht: { id: 'vorsicht', name: 'Vorsichtiger', price: 5, desc: 'Jetons auf Außenwetten (Farbe, Gerade/Ungerade, 1–18/19–36): +15 Wert.', icon: '🛡️', weight: 3 },
  dutzend: { id: 'dutzend', name: 'Dutzendware', price: 5, desc: '+2 Mult pro gewinnendem Jeton auf Dutzend oder Kolonne.', icon: '📦', weight: 3 },
  letzterwurf: { id: 'letzterwurf', name: 'Letzter Wurf', price: 6, desc: 'Letzte Runde vor der Rate: ×2 Mult.', icon: '⌛', weight: 2 },
  serie: { id: 'serie', name: 'Glückssträhne', price: 6, desc: '+1 Mult pro Runde in Folge mit Gewinn (aktuell +{n}).', icon: '🔥', weight: 2 },
  sammler: { id: 'sammler', name: 'Sammler', price: 5, desc: '+1 Mult pro Talisman, den du besitzt.', icon: '🧿', weight: 2 },
  schuldner: { id: 'schuldner', name: 'Alter Schuldner', price: 6, desc: '+2 Mult pro bereits bezahlter Rate.', icon: '📜', weight: 2 },
  sparschwein: { id: 'sparschwein', name: 'Sparschwein', price: 4, desc: 'Nach jeder bezahlten Rate: +15 % Zinsen auf dein Restgeld.', icon: '🐷', weight: 2 },
  kopierer: { id: 'kopierer', name: 'Kopierer', price: 7, desc: '+3 Mult für jede weitere Kopie der getroffenen Zahl auf dem Rad.', icon: '📠', weight: 2 },
  wachstum: { id: 'wachstum', name: 'Bohnenranke', price: 7, desc: 'Gewinnt eine Einzelzahl: dauerhaft +1 Mult (aktuell +{n}).', icon: '🌱', weight: 2 },
  magnetfeld: { id: 'magnetfeld', name: 'Magnetfeld', price: 6, desc: 'Magnet-Jetons wirken dreifach.', icon: '🧲', weight: 2 },
  muenzsammler: { id: 'muenzsammler', name: 'Münzsammler', price: 4, desc: 'Glücksmünzen geben doppelt so viel Mult.', icon: '🪙', weight: 2 },
  glueckskind: { id: 'glueckskind', name: 'Glückskind', price: 4, desc: 'Jede Runde liegt eine Glücksmünze mehr im Casino herum.', icon: '🍀', weight: 2 },
};

export type PocketToolId = PocketModId | 'pinsel' | 'farbe';
export type ServiceId = 'schere';

export interface PocketItemDef {
  id: PocketToolId | ServiceId;
  name: string;
  price: number;
  desc: string;
  icon: string;
  weight: number;
}

export const POCKET_ITEMS: Record<string, PocketItemDef> = {
  gold: { id: 'gold', name: 'Goldfach', price: 4, desc: 'Ein Fach wird golden: +10 % Zinsen auf dein Bargeld, wenn die Kugel dort landet.', icon: '🟡', weight: 3 },
  kristall: { id: 'kristall', name: 'Kristallfach', price: 6, desc: 'Ein Fach wird zu Kristall: ×2 Mult, wenn getroffen.', icon: '💎', weight: 2 },
  flamme: { id: 'flamme', name: 'Flammenfach', price: 5, desc: 'Ein Fach brennt: +4 Mult, wenn getroffen.', icon: '🔥', weight: 3 },
  schwer: { id: 'schwer', name: 'Schweres Fach', price: 5, desc: 'Die Kugel landet doppelt so oft in diesem Fach.', icon: '⚓', weight: 2 },
  pinsel: { id: 'pinsel', name: 'Umnummerieren', price: 4, desc: 'Gib einem Fach eine neue Zahl (0–36). Die Farbe passt sich an.', icon: '🖌️', weight: 3 },
  farbe: { id: 'farbe', name: 'Farbwechsel', price: 3, desc: 'Ein Fach wechselt Rot ↔ Schwarz (Grün wird Rot).', icon: '🎨', weight: 2 },
  schere: { id: 'schere', name: 'Jeton entfernen', price: 3, desc: 'Entferne einen Jeton dauerhaft aus deinem Beutel.', icon: '✂️', weight: 2 },
};

export const POCKET_MOD_INFO: Record<PocketModId, { name: string; short: string; color: string }> = {
  gold: { name: 'Gold', short: '+10 % Zinsen', color: '#f2c14e' },
  kristall: { name: 'Kristall', short: '×2 Mult', color: '#7fe7ff' },
  flamme: { name: 'Flamme', short: '+4 Mult', color: '#ff7a2f' },
  schwer: { name: 'Schwer', short: '2× Chance', color: '#b39bff' },
};

export type BossId = 'eile' | 'rotfluch' | 'geiz' | 'kleinehand' | 'halbzahl' | 'nullnebel';

/** House rules: from the second rate on, each cycle runs under one of these. */
export interface BossDef {
  id: BossId;
  name: string;
  desc: string;
}

export const BOSSES: Record<BossId, BossDef> = {
  eile: { id: 'eile', name: 'Rien ne va plus!', desc: 'Am Tisch hast du nur 15 Sekunden zum Setzen, dann dreht der Croupier.' },
  rotfluch: { id: 'rotfluch', name: 'Roter Fluch', desc: 'Wetten auf Rot verlieren immer.' },
  geiz: { id: 'geiz', name: 'Ungeduldige Gläubiger', desc: 'Die Rate ist schon nach 4 Runden fällig.' },
  kleinehand: { id: 'kleinehand', name: 'Kleine Hände', desc: 'Handgröße −1.' },
  halbzahl: { id: 'halbzahl', name: 'Halbe Sache', desc: 'Einzelzahlen zahlen nur ×18.' },
  nullnebel: { id: 'nullnebel', name: 'Hungrige Null', desc: 'Fächer mit der 0 ziehen die Kugel stark an (Gewicht ×4).' },
};

export const STARTING_BAG: string[] = [
  'basis', 'basis', 'basis', 'basis', 'basis', 'basis', 'basis',
  'rot', 'rot', 'schwarz', 'schwarz', 'versicherung',
];

/** Rate due at the cashier after each cycle. Paying the last one wins the run. */
export const DEBTS = [350, 800, 1800, 3800, 8000, 16000, 32000, 64000];
export const SPINS_PER_CYCLE = 5;

/** Shop prices scale with the next rate so upgrades always cost something. */
export function priceFor(base: number, debt: number): number {
  const raw = (base * debt) / 14;
  const mag = Math.pow(10, Math.max(0, Math.floor(Math.log10(raw)) - 1));
  return Math.max(5, Math.round(raw / mag) * mag);
}
