import type { PocketModId } from './types';

// ---- Talismans: items that stand on the table -----------------------------

export type Rarity = 'common' | 'rare' | 'legendary';

export const RARITY: Record<Rarity, { name: string; weight: number; price: number }> = {
  common: { name: 'Gewöhnlich', weight: 6, price: 3 },
  rare: { name: 'Selten', weight: 3, price: 5 },
  legendary: { name: 'Legendär', weight: 1, price: 8 },
};

export interface ItemDef {
  id: string;
  name: string;
  rarity: Rarity;
  /** `{n}` is replaced with the item's counter. */
  desc: string;
  /** Luck points granted while the item stands on the table. */
  luck?: number;
}

const I = (id: string, name: string, rarity: Rarity, desc: string, luck?: number): ItemDef => ({ id, name, rarity, desc, luck });

export const ITEMS: Record<string, ItemDef> = Object.fromEntries([
  I('hufeisen', 'Hufeisen', 'common', 'Glück +1.', 1),
  I('pfennig', 'Glückspfennig', 'common', 'Jede gewinnende Wette: +$5 Summe.'),
  I('kerze', 'Rote Kerze', 'common', 'Kugel auf Rot: +1 Mult.'),
  I('katze', 'Schwarze Katze', 'common', 'Kugel auf Schwarz: +1 Mult.'),
  I('wuerfel', 'Würfelpaar', 'common', 'Gewinnt eine einfache Chance (Gerade/Ungerade, 1–18/19–36): +1 Mult.'),
  I('abakus', 'Abakus', 'common', 'Gewinnt ein Dutzend oder eine Kolonne: +1,5 Mult.'),
  I('sparschwein', 'Sparschwein', 'common', 'Zinsen auf deine Einzahlung +4 %.'),
  I('kleeblatt', 'Kleeblatt im Topf', 'common', 'Jede bezahlte Rate: +2 Glücksmarken.'),
  I('sanduhr', 'Sanduhr', 'common', 'Letzte Runde vor der Rate: ×2 Mult.'),
  I('glocke', 'Messingglocke', 'common', 'Jede Runde mit Gewinn: dauerhaft +0,2 Mult (aktuell +{n}).'),
  I('rabe', 'Rabe', 'common', 'Jede Runde ohne Gewinn: dauerhaft +0,5 Mult (aktuell +{n}).'),
  I('zinnsoldat', 'Zinnsoldat', 'common', 'Liegen Einsätze auf mindestens 4 Feldern: +1 Mult.'),
  I('totenkopf', 'Totenkopf', 'rare', 'Kugel auf 0: ×6 Mult. Die 0 zieht die Kugel stärker an.'),
  I('winkekatze', 'Winkekatze', 'rare', 'Gewinnt ein Plein (Einzelzahl): ×2 Mult.'),
  I('magnet', 'Hufeisenmagnet', 'rare', 'Fächer mit deinen Plein-Zahlen ziehen die Kugel an (Gewicht ×2).'),
  I('taschenuhr', 'Taschenuhr', 'rare', '+1 Runde vor jeder Rate.'),
  I('goldbarren', 'Goldbarren', 'rare', 'Kugel in einem Goldfach: ×2 Mult.'),
  I('police', 'Versicherungspolice', 'rare', 'Gewinnst du in einer Runde nichts, bekommst du 30 % deiner Einsätze zurück.'),
  I('zigarre', 'Zigarre', 'rare', 'Setzt du mindestens die Hälfte deines Bargelds: ×1,5 Mult.'),
  I('fernglas', 'Opernglas', 'rare', 'Gewinnt ein Cheval, Carré, eine Transversale oder Sechserreihe: +2 Mult.'),
  I('spiegel', 'Handspiegel', 'rare', 'Kopiert die Wirkung des Talismans rechts daneben.'),
  I('kristallkugel', 'Kristallkugel', 'legendary', 'Zeigt jede Runde 3 Fächer. Mit 40 % Chance landet die Kugel in einem davon.'),
  I('goldkugel', 'Goldene Kugel', 'legendary', 'Glück +3. Nachhopser können bis zu zwei Fächer weit springen.', 3),
  I('teufel', 'Teufelsfigur', 'legendary', '×2 Mult auf jeden Gewinn. Jede Rate ist 25 % höher.'),
].map((d) => [d.id, d]));

export function itemPrice(id: string): number {
  return RARITY[ITEMS[id].rarity].price;
}

// ---- Wheel upgrades ---------------------------------------------------------

export type PocketToolId = PocketModId | 'pinsel' | 'farbe';

export interface PocketItemDef {
  id: PocketToolId;
  name: string;
  price: number;
  desc: string;
  weight: number;
}

export const POCKET_ITEMS: Record<PocketToolId, PocketItemDef> = {
  gold: { id: 'gold', name: 'Goldfach', price: 3, desc: 'Ein Fach wird golden: +1 Glücksmarke, wenn die Kugel dort landet.', weight: 3 },
  kristall: { id: 'kristall', name: 'Kristallfach', price: 4, desc: 'Ein Fach wird zu Kristall: ×2 Mult, wenn getroffen.', weight: 2 },
  flamme: { id: 'flamme', name: 'Flammenfach', price: 3, desc: 'Ein Fach brennt: +1 Mult, wenn getroffen.', weight: 3 },
  schwer: { id: 'schwer', name: 'Schweres Fach', price: 3, desc: 'Die Kugel landet doppelt so oft in diesem Fach.', weight: 2 },
  pinsel: { id: 'pinsel', name: 'Umnummerieren', price: 2, desc: 'Gib einem Fach eine neue Zahl (0–36). Die Farbe passt sich an.', weight: 3 },
  farbe: { id: 'farbe', name: 'Farbwechsel', price: 2, desc: 'Ein Fach wechselt Rot ↔ Schwarz (Grün wird Rot).', weight: 2 },
};

export const POCKET_MOD_INFO: Record<PocketModId, { name: string; short: string; color: string }> = {
  gold: { name: 'Gold', short: '+1 Glücksmarke', color: '#f2c14e' },
  kristall: { name: 'Kristall', short: '×2 Mult', color: '#7fe7ff' },
  flamme: { name: 'Flamme', short: '+1 Mult', color: '#ff7a2f' },
  schwer: { name: 'Schwer', short: '2× Chance', color: '#b39bff' },
};

// ---- House rules ------------------------------------------------------------

export type RuleId = 'eile' | 'rotfluch' | 'geiz' | 'limit' | 'halbzahl' | 'nullnebel';

export const RULES: Record<RuleId, { id: RuleId; name: string; desc: string }> = {
  eile: { id: 'eile', name: 'Rien ne va plus!', desc: 'Am Tisch hast du nur 15 Sekunden zum Setzen, dann dreht der Croupier.' },
  rotfluch: { id: 'rotfluch', name: 'Roter Fluch', desc: 'Wetten auf Rot verlieren immer.' },
  geiz: { id: 'geiz', name: 'Ungeduldige Gläubiger', desc: 'Die Rate ist eine Runde früher fällig.' },
  limit: { id: 'limit', name: 'Tischlimit', desc: 'Du darfst pro Runde höchstens ein Viertel deines Bargelds setzen.' },
  halbzahl: { id: 'halbzahl', name: 'Halbe Sache', desc: 'Pleins (Einzelzahlen) zahlen nur ×18.' },
  nullnebel: { id: 'nullnebel', name: 'Hungrige Null', desc: 'Fächer mit der 0 ziehen die Kugel stark an (Gewicht ×4).' },
};

// ---- The phone: the boss offers a deal after every paid rate ------------------

export interface OfferDef {
  id: string;
  name: string;
  desc: string;
  weight: number;
}

export const OFFERS: Record<string, OfferDef> = {
  glueck: { id: 'glueck', name: 'Ein gutes Wort', desc: 'Glück +1, dauerhaft.', weight: 3 },
  zinsen: { id: 'zinsen', name: 'Bessere Konditionen', desc: 'Zinsen auf deine Einzahlung +3 %, dauerhaft.', weight: 3 },
  platz: { id: 'platz', name: 'Mehr Platz am Tisch', desc: '+1 Platz für Talismane.', weight: 2 },
  marken: { id: 'marken', name: 'Ein Bündel Marken', desc: '+4 Glücksmarken.', weight: 3 },
  runde: { id: 'runde', name: 'Mehr Zeit', desc: '+1 Runde vor jeder Rate, dauerhaft.', weight: 1 },
  kredit: { id: 'kredit', name: 'Frisches Geld', desc: 'Sofort Bargeld in Höhe der halben nächsten Rate. Die nächste Rate steigt um das Doppelte davon.', weight: 2 },
  stundung: { id: 'stundung', name: 'Stundung', desc: 'Die nächste Rate sinkt um 30 %, die übernächste steigt um 60 %.', weight: 2 },
  rotplus: { id: 'rotplus', name: 'Rote Tinte', desc: 'Kugel auf Rot: +0,25 Mult, dauerhaft.', weight: 2 },
  schwarzplus: { id: 'schwarzplus', name: 'Schwarzes Buch', desc: 'Kugel auf Schwarz: +0,25 Mult, dauerhaft.', weight: 2 },
  goldfach: { id: 'goldfach', name: 'Ein Geschenk', desc: 'Ein zufälliges Fach wird zum Goldfach.', weight: 2 },
  kristallfach: { id: 'kristallfach', name: 'Ein Kristall', desc: 'Ein zufälliges Fach wird zum Kristallfach.', weight: 2 },
};

// ---- Start equipment ----------------------------------------------------------

export interface StartKit {
  id: string;
  name: string;
  desc: string;
  money: number;
  marks: number;
  deposit?: number;
  luck?: number;
  items?: string[];
}

export const START_KITS: Record<string, StartKit> = {
  klassisch: { id: 'klassisch', name: 'Pleite', desc: '$100 Bargeld, 3 Glücksmarken und ein Hufeisen.', money: 100, marks: 3, items: ['hufeisen'] },
  gluckspilz: { id: 'gluckspilz', name: 'Glückspilz', desc: '$80 Bargeld, Kleeblatt im Topf und Glück +1.', money: 80, marks: 2, luck: 1, items: ['kleeblatt'] },
  zocker: { id: 'zocker', name: 'Zocker', desc: '$60 Bargeld und die Winkekatze. Pleins zahlen doppelt.', money: 60, marks: 1, items: ['winkekatze'] },
  bankier: { id: 'bankier', name: 'Bankier', desc: '$60 Bargeld, $60 schon eingezahlt und ein Sparschwein.', money: 60, marks: 2, deposit: 60, items: ['sparschwein'] },
  teufel: { id: 'teufel', name: 'Teufelspakt', desc: '$150 Bargeld und die Teufelsfigur. Alles doppelt – auch die Schulden.', money: 150, marks: 2, items: ['teufel'] },
};

// ---- Money --------------------------------------------------------------------

/** Rate due after each cycle. Paying the last one wins the run. */
export const DEBTS = [50, 90, 160, 300, 600, 1200, 2500, 5500];
export const ROUNDS_PER_CYCLE = 5;
export const BASE_INTEREST = 0.08;
export const START_SLOTS = 4;
export const MAX_SLOTS = 7;

/** Chip values, as on a real table. */
export const DENOMINATIONS = [1, 5, 25, 100, 500, 1000, 5000, 25000, 100000];

export const CHIP_COLORS: Record<number, { face: string; rim: string }> = {
  1: { face: '#ece6d6', rim: '#6b6b6b' },
  5: { face: '#c8202c', rim: '#f4e3c8' },
  25: { face: '#1f8a4a', rim: '#f4e3c8' },
  100: { face: '#1b1b20', rim: '#e6d3a0' },
  500: { face: '#6a2c9a', rim: '#f0d8ff' },
  1000: { face: '#e0a020', rim: '#3a2408' },
  5000: { face: '#8a4a24', rim: '#ffe0c0' },
  25000: { face: '#2a5fbf', rim: '#dfeaff' },
  100000: { face: '#b8b8c4', rim: '#2a2a34' },
};

export function chipLabel(v: number): string {
  return v >= 1000 ? `${v / 1000}K` : String(v);
}
