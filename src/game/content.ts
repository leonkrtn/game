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
  I('sanduhr', 'Sanduhr', 'common', 'Letzter Dreh vor der Rate: ×2 Mult.'),
  I('glocke', 'Messingglocke', 'common', 'Jeder Dreh mit Gewinn: dauerhaft +0,2 Mult (aktuell +{n}).'),
  I('rabe', 'Rabe', 'common', 'Jeder Dreh ohne Gewinn: dauerhaft +0,5 Mult (aktuell +{n}).'),
  I('zinnsoldat', 'Zinnsoldat', 'common', 'Liegen Einsätze auf mindestens 4 Feldern: +1 Mult.'),
  I('totenkopf', 'Totenkopf', 'rare', 'Kugel auf 0: ×6 Mult. Die 0 zieht die Kugel stärker an.'),
  I('winkekatze', 'Winkekatze', 'rare', 'Gewinnt ein Plein (Einzelzahl): ×2 Mult.'),
  I('magnet', 'Hufeisenmagnet', 'rare', 'Fächer mit deinen Plein-Zahlen ziehen die Kugel an (Gewicht ×2).'),
  I('taschenuhr', 'Taschenuhr', 'rare', '+1 Dreh vor jeder Rate.'),
  I('goldbarren', 'Goldbarren', 'rare', 'Kugel in einem Goldfach: ×2 Mult.'),
  I('police', 'Versicherungspolice', 'rare', 'Gewinnst du bei einem Dreh nichts, bekommst du 30 % deiner Einsätze zurück.'),
  I('zigarre', 'Zigarre', 'rare', 'Setzt du mindestens die Hälfte deines Bargelds: ×1,5 Mult.'),
  I('fernglas', 'Opernglas', 'rare', 'Gewinnt ein Cheval, Carré, eine Transversale oder Sechserreihe: +2 Mult.'),
  I('spiegel', 'Handspiegel', 'rare', 'Kopiert die Wirkung des Talismans rechts daneben.'),
  I('walkman', 'Walkman', 'common', 'Setzt du nur auf Pleins (Einzelzahlen): +2 Mult.'),
  I('pager', 'Pager', 'common', 'Knapp daneben zählt: Pleins direkt neben der Kugel zahlen ×8.'),
  I('zippo', 'Zippo', 'common', 'Nach zwei verlorenen Runden in Folge: ×2 Mult.'),
  I('hasenpfote', 'Hasenpfote', 'common', 'Glück +1 für jeden freien Platz auf deinem Tisch.'),
  I('kassette', 'Mixtape', 'common', 'Setzt du genau wie beim Dreh davor: +1 Mult.'),
  I('zauberwuerfel', 'Zauberwürfel', 'rare', 'Bei jedem Dreh ist ein Außenfeld verdreht (lila markiert). Gewinnt eine Wette darauf: ×3 Mult.'),
  I('polaroid', 'Polaroid', 'rare', 'Fällt dieselbe Zahl wie beim Dreh davor: ×5 Mult.'),
  I('voodoo', 'Voodoo-Puppe', 'rare', 'Jede Rate ist 15 % niedriger. Aber jeder dritte Nachhopser springt gegen dich.'),
  I('goldkette', 'Goldkettchen', 'rare', '+0,1 Mult pro $50 Bargeld vor dem Einsatz (höchstens +3).'),
  I('sonnenbrille', 'Sonnenbrille', 'legendary', 'Hausregeln gelten für dich nicht.'),
  I('kristallkugel', 'Kristallkugel', 'legendary', 'Zeigt vor jedem Dreh 3 Fächer. Mit 40 % Chance landet die Kugel in einem davon.'),
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
  geiz: { id: 'geiz', name: 'Ungeduldige Gläubiger', desc: 'Die Rate ist einen Dreh früher fällig.' },
  limit: { id: 'limit', name: 'Tischlimit', desc: 'Du darfst pro Dreh höchstens ein Viertel deines Bargelds setzen.' },
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
  runde: { id: 'runde', name: 'Mehr Zeit', desc: '+1 Dreh vor jeder Rate, dauerhaft.', weight: 1 },
  kredit: { id: 'kredit', name: 'Frisches Geld', desc: 'Sofort Bargeld in Höhe der halben nächsten Rate. Die nächste Rate steigt um das Anderthalbfache davon.', weight: 2 },
  stundung: { id: 'stundung', name: 'Stundung', desc: 'Die nächste Rate sinkt um 30 %, die übernächste steigt um 15 %.', weight: 2 },
  rotplus: { id: 'rotplus', name: 'Rote Tinte', desc: 'Kugel auf Rot: +0,5 Mult, dauerhaft.', weight: 2 },
  schwarzplus: { id: 'schwarzplus', name: 'Schwarzes Buch', desc: 'Kugel auf Schwarz: +0,5 Mult, dauerhaft.', weight: 2 },
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

// ---- Debt stages: the roguelike difficulty ladder ---------------------------------

export const STAGES = [
  { name: 'Kleiner Fisch', desc: 'Die normalen Regeln.' },
  { name: 'Stammkunde', desc: 'Alle Raten sind 25 % höher.' },
  { name: 'Schwarze Liste', desc: 'Alles in der Vitrine kostet eine Glücksmarke mehr.' },
  { name: 'Blutgeld', desc: 'Die Zinsen auf Einzahlungen sind halbiert.' },
  { name: 'Kurze Leine', desc: 'Die Geldeintreiber lassen dir nur 2 Drehs pro Rate.' },
  { name: 'Letzte Chance', desc: 'Du startest ohne Glücksmarken und mit Glück −1.' },
];

// ---- Money --------------------------------------------------------------------

/** Rate due after each cycle. Paying the last one wins the run. */
export const DEBTS = [30, 55, 100, 190, 380, 760, 1550, 3300];
export const ROUNDS_PER_CYCLE = 3;
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

// ---- Golden talismans: a second copy fuses into a stronger one ------------------------

/** Extra price in the showcase for a copy that turns an owned talisman golden. */
export const FUSE_EXTRA = 2;

/** What the golden version does differently, for the item text. */
export const GOLD_DESC: Record<string, string> = {
  hufeisen: 'Glück +2.', pfennig: 'Jede gewinnende Wette: +$10 Summe.', kerze: 'Kugel auf Rot: +2 Mult.', katze: 'Kugel auf Schwarz: +2 Mult.',
  wuerfel: 'Gewinnt eine einfache Chance: +2 Mult.', abakus: 'Gewinnt ein Dutzend oder eine Kolonne: +3 Mult.', sparschwein: 'Zinsen +8 %.',
  kleeblatt: 'Jede bezahlte Rate: +4 Glücksmarken.', sanduhr: 'Letzter Dreh vor der Rate: ×3 Mult.',
  glocke: 'Jeder Dreh mit Gewinn: dauerhaft +0,4 Mult (aktuell +{n}).', rabe: 'Jeder Dreh ohne Gewinn: dauerhaft +1 Mult (aktuell +{n}).',
  zinnsoldat: 'Einsätze auf mindestens 4 Feldern: +2 Mult.', totenkopf: 'Kugel auf 0: ×11 Mult. Die 0 zieht die Kugel stärker an.',
  winkekatze: 'Gewinnt ein Plein: ×3 Mult.', magnet: 'Fächer mit deinen Plein-Zahlen: Gewicht ×3.', taschenuhr: '+2 Drehs vor jeder Rate.',
  goldbarren: 'Kugel in einem Goldfach: ×3 Mult.', police: 'Ohne Gewinn: 60 % der Einsätze zurück.', zigarre: 'Mindestens halbes Bargeld gesetzt: ×2 Mult.',
  fernglas: 'Innenwette gewinnt (außer Plein): +4 Mult.', spiegel: 'Kopiert den rechten Nachbarn – golden, als wäre er golden.',
  walkman: 'Nur Pleins gesetzt: +4 Mult.', pager: 'Pleins direkt neben der Kugel zahlen ×16.', zippo: 'Nach zwei Pleiten in Folge: ×3 Mult.',
  hasenpfote: 'Glück +2 für jeden freien Platz.', kassette: 'Gleicher Einsatz wie davor: +2 Mult.', zauberwuerfel: 'Verdrehtes Feld gewinnt: ×5 Mult.',
  polaroid: 'Dieselbe Zahl wie davor: ×9 Mult.', voodoo: 'Jede Rate 25 % niedriger. Jeder dritte Nachhopser springt gegen dich.',
  goldkette: '+0,2 Mult pro $50 Bargeld (höchstens +6).',
};

export const canFuse = (def: string) => ITEMS[def].rarity !== 'legendary' && def in GOLD_DESC;

// ---- Sets: three talismans that belong together ---------------------------------------

export interface SetDef {
  id: string;
  name: string;
  items: string[];
  desc: string;
}

export const SETS: SetDef[] = [
  { id: 'achtziger', name: 'Mixtape 87', items: ['walkman', 'kassette', 'pager'], desc: 'Gewinnende Pleins, auch Pager-Treffer: ×3 Mult.' },
  { id: 'aberglaube', name: 'Aberglaube', items: ['hufeisen', 'kleeblatt', 'hasenpfote'], desc: 'Glück +3.' },
  { id: 'nacht', name: 'Schwarze Nacht', items: ['rabe', 'katze', 'totenkopf'], desc: 'Kugel auf Schwarz oder 0: ×2 Mult.' },
  { id: 'bank', name: 'Schweizer Konto', items: ['sparschwein', 'abakus', 'goldbarren'], desc: 'Zinsen +6 % und jede Rate 10 % niedriger.' },
  { id: 'feuer', name: 'Feuerteufel', items: ['kerze', 'zippo', 'sanduhr'], desc: 'Kugel auf Rot: ×2 Mult.' },
  { id: 'spieler', name: 'Alter Zocker', items: ['wuerfel', 'zigarre', 'winkekatze'], desc: 'Jede gewinnende Wette: +50 % Summe.' },
];

// ---- Cigarette machine: one-shot items bought with cash ---------------------------------

export interface ConsumableDef {
  id: string;
  name: string;
  desc: string;
  /** Price as a share of the current rate. */
  price: number;
}

export const CONSUMABLES: Record<string, ConsumableDef> = Object.fromEntries([
  { id: 'zigarette', name: 'Glückszigarette', desc: 'Nächster Dreh: Glück +4.', price: 0.1 },
  { id: 'gezinkt', name: 'Gezinkte Kugel', desc: 'Nächster Dreh: Die Kugel hüpft sicher ins beste Nachbarfach.', price: 0.45 },
  { id: 'kreide', name: 'Blaue Kreide', desc: 'Nächster Dreh: Fächer mit deinen Plein-Zahlen ziehen dreifach an.', price: 0.5 },
  { id: 'espresso', name: 'Doppelter Espresso', desc: 'Sofort: +1 Dreh vor dieser Rate.', price: 0.4 },
  { id: 'kaugummi', name: 'Kaugummi', desc: 'Nächster Dreh: Verlierst du, kommt die Hälfte deiner Einsätze zurück.', price: 0.1 },
  { id: 'korn', name: 'Doppelkorn', desc: 'Nächster Dreh: +2 Mult bei Gewinn.', price: 0.6 },
  { id: 'rubbellos', name: 'Rubbellos', desc: 'Sofort: 1 zu 3 auf das Dreifache des Preises.', price: 0.12 },
].map((c) => [c.id, c]));

export const MAX_CONSUMABLES = 3;

// ---- The TV: a news flash for every rate -------------------------------------------------

export interface NewsDef {
  id: string;
  headline: string;
  desc: string;
}

export const NEWS: Record<string, NewsDef> = Object.fromEntries([
  { id: 'crash', headline: 'BÖRSENCRASH AN DER WALL STREET', desc: 'Keine Zinsen bis zur nächsten Rate.' },
  { id: 'boom', headline: 'DAX AUF REKORDHOCH', desc: 'Doppelte Zinsen bis zur nächsten Rate.' },
  { id: 'hitze', headline: 'HITZEWELLE ÜBER DER STADT', desc: 'Kugel auf Rot: +1 Mult.' },
  { id: 'nebel', headline: 'DICHTER NEBEL AM HAFEN', desc: 'Kugel auf Schwarz: +1 Mult.' },
  { id: 'razzia', headline: 'POLIZEI KÜNDIGT RAZZIEN AN', desc: 'Die Geldeintreiber haben es eilig: Rate −20 %.' },
  { id: 'inflation', headline: 'INFLATION STEIGT WEITER', desc: 'Alle Auszahlungen ×1,2, die Rate auch.' },
  { id: 'lotto', headline: 'LOTTOFIEBER: 14 MILLIONEN IM JACKPOT', desc: 'Gewinnende Pleins: ×1,5 Mult.' },
  { id: 'vollmond', headline: 'VOLLMOND IN DER NACHT ZUM SAMSTAG', desc: 'Glück +2.' },
  { id: 'streik', headline: 'CROUPIERS DROHEN MIT STREIK', desc: 'Bestechung fliegt nie auf.' },
  { id: 'komet', headline: 'KOMET AM NACHTHIMMEL GESICHTET', desc: 'Kugel auf 0: ×3 Mult.' },
].map((n) => [n.id, n]));

// ---- Balls: chosen before a run, unlocked by achievements ----------------------------------

export interface BallDef {
  id: string;
  name: string;
  desc: string;
  color: number;
  metal: number;
  rough: number;
  /** Glass look. */
  clear?: boolean;
}

export const BALLS: Record<string, BallDef> = Object.fromEntries([
  { id: 'stahl', name: 'Stahlkugel', desc: 'Die ganz normale Kugel.', color: 0xdadde2, metal: 1, rough: 0.18 },
  { id: 'elfenbein', name: 'Elfenbein', desc: 'Glück +2. Aber die 0 zieht sie doppelt an.', color: 0xf3ead2, metal: 0, rough: 0.3 },
  { id: 'glas', name: 'Glaskugel', desc: 'Gold-, Kristall- und Flammenfächer wirken doppelt.', color: 0xbfe8ff, metal: 0, rough: 0.02, clear: true },
  { id: 'blei', name: 'Bleikugel', desc: 'Hüpft nie nach. Dafür +1 Mult auf jeden Gewinn.', color: 0x5a5e66, metal: 0.8, rough: 0.55 },
  { id: 'kupfer', name: 'Kupferkugel', desc: 'Jedes gewinnende Plein: +1 Glücksmarke.', color: 0xc8734a, metal: 1, rough: 0.25 },
  { id: 'onyx', name: 'Onyx', desc: 'Kugel auf Schwarz: +1,5 Mult. Auf Rot: −0,5 Mult.', color: 0x121216, metal: 0.2, rough: 0.08 },
].map((b) => [b.id, b]));

// ---- The loan shark: one last chance when the money is gone -------------------------------

/** All later rates are multiplied by this once the loan shark's money was taken. */
export const SHARK_FACTOR = 1.4;

// ---- Bribing the croupier -----------------------------------------------------------------

/**
 * The croupier asks for this share of what his nudge is worth for your bets (the gain in
 * expected payout), so a bribe is only a small edge and costs more the more you have riding.
 * Base risk of being seen, per bribe in the same rate.
 */
export const BRIBE_PRICE = 0.6;
export const BRIBE_RISK = 0.15;
/** Weight factor on pockets that pay for you. */
export const BRIBE_PULL = 2;

// ---- Rival duels ---------------------------------------------------------------------------

export const RIVAL_NAMES = ['Der Graf', 'Lackschuh-Kalle', 'Madame Rouge', 'Der Zahnarzt', 'Onkel Fritz'];
