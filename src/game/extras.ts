import { ITEMS } from './content';

// Content for the systems beyond plain roulette: the chip case, the card draft after each rate,
// the bonus wheel, cheating and the Baron's story.

// ---- The card draft after every paid rate (replaces the phone) -------------------------------

export type CardKind = 'deal' | 'talisman' | 'rad' | 'kugel' | 'schummel' | 'baron';

export interface CardDef {
  id: string;
  name: string;
  desc: string;
  kind: CardKind;
  weight: number;
  rarity: CardTier;
}

/** The four card tiers, from plain to legendary. */
export type CardTier = 'common' | 'rare' | 'epic' | 'legendary';

export const CARD_TIER: Record<CardTier, { name: string; gems: number; weight: number }> = {
  common: { name: 'Normal', gems: 1, weight: 1 },
  rare: { name: 'Selten', gems: 2, weight: 0.85 },
  epic: { name: 'Episch', gems: 3, weight: 0.65 },
  legendary: { name: 'Legendär', gems: 4, weight: 0.45 },
};

export const CARD_KIND_NAME: Record<CardKind, string> = {
  deal: 'Vorteil',
  talisman: 'Talisman',
  rad: 'Rad-Umbau',
  kugel: 'Kugel',
  schummel: 'Schummelei',
  baron: 'Deal mit dem Baron',
};

export const CARDS: Record<string, CardDef> = Object.fromEntries(([
  // Lasting advantages (the old phone deals).
  { id: 'glueck', name: 'Ein gutes Wort', desc: 'Glück +1, dauerhaft.', kind: 'deal', weight: 3, rarity: 'common' },
  { id: 'zinsen', name: 'Bessere Konditionen', desc: 'Zinsen auf deine Einzahlung +3 %, dauerhaft.', kind: 'deal', weight: 2, rarity: 'common' },
  { id: 'platz', name: 'Mehr Platz am Tisch', desc: '+1 Platz für Talismane.', kind: 'deal', weight: 2, rarity: 'epic' },
  { id: 'marken', name: 'Ein Bündel Marken', desc: '+4 Glücksmarken.', kind: 'deal', weight: 3, rarity: 'common' },
  { id: 'runde', name: 'Mehr Zeit', desc: '+1 Dreh vor jeder Rate, dauerhaft.', kind: 'deal', weight: 1, rarity: 'legendary' },
  { id: 'vip', name: 'Ein Wort beim Saalchef', desc: 'Tischlimit +50 %, dauerhaft.', kind: 'deal', weight: 3, rarity: 'rare' },
  { id: 'rotplus', name: 'Rote Tinte', desc: 'Kugel auf Rot: +0,5 Mult, dauerhaft.', kind: 'deal', weight: 2, rarity: 'rare' },
  { id: 'schwarzplus', name: 'Schwarzes Buch', desc: 'Kugel auf Schwarz: +0,5 Mult, dauerhaft.', kind: 'deal', weight: 2, rarity: 'rare' },
  // Wheel building: a free upgrade you place yourself.
  { id: 'r_gold', name: 'Goldfach', desc: 'Gratis: ein Fach deiner Wahl wird golden (+1 Glücksmarke). Nochmal = stärker.', kind: 'rad', weight: 2, rarity: 'common' },
  { id: 'r_kristall', name: 'Kristallfach', desc: 'Gratis: ein Fach deiner Wahl zahlt ×2 Mult. Nochmal = stärker.', kind: 'rad', weight: 2, rarity: 'rare' },
  { id: 'r_doppel', name: 'Doppelfach', desc: 'Gratis: ein Fach deiner Wahl verdoppelt die Summe. Nochmal = stärker.', kind: 'rad', weight: 2, rarity: 'epic' },
  { id: 'r_stern', name: 'Sternfach', desc: 'Gratis: ein Fach deiner Wahl dreht bei einem Gewinn das Bonusrad.', kind: 'rad', weight: 2, rarity: 'rare' },
  { id: 'r_kopie', name: 'Abklatsch', desc: 'Gratis: beide Nachbarn eines Fachs deiner Wahl werden zu seinen Kopien.', kind: 'rad', weight: 2, rarity: 'epic' },
  // Balls.
  { id: 'k_doppel', name: 'Zweite Kugel', desc: '2 Doppelkugel-Drehs: zwei Kugeln rollen, jede zahlt für sich.', kind: 'kugel', weight: 2, rarity: 'epic' },
  // Cheating tools.
  { id: 's_magnet', name: 'Taschenmagnet', desc: 'Magnet-Schummeln macht nur noch halb so viel Verdacht.', kind: 'schummel', weight: 2, rarity: 'rare' },
  { id: 's_finger', name: 'Flinke Finger', desc: 'Das Anstoßen der Kugel gelingt leichter (größere grüne Zone).', kind: 'schummel', weight: 2, rarity: 'common' },
  { id: 's_ruhe', name: 'Unschuldsmiene', desc: 'Der Verdacht sinkt sofort auf 0 und danach doppelt so schnell.', kind: 'schummel', weight: 2, rarity: 'rare' },
  // The Baron's deals: something now, a price later.
  { id: 'b_umschlag', name: 'Ein Umschlag', desc: 'Sofort Bargeld in Höhe der halben Rate. Die nächste Rate steigt um das Anderthalbfache davon.', kind: 'baron', weight: 2, rarity: 'epic' },
  { id: 'b_stundung', name: 'Stundung', desc: 'Die nächste Rate sinkt um 30 %, die übernächste steigt um 15 %.', kind: 'baron', weight: 2, rarity: 'rare' },
  { id: 'b_auftrag', name: 'Ein kleiner Auftrag', desc: '+6 Glücksmarken. Dafür Verdacht +40.', kind: 'baron', weight: 2, rarity: 'common' },
] as CardDef[]).map((c) => [c.id, c]));

/** Any draft card by id: fixed cards, and `t_<item>` for a talisman card. */
export function cardDef(id: string): CardDef {
  if (id.startsWith('t_')) {
    const d = ITEMS[id.slice(2)];
    return { id, name: d.name, desc: `Gratis auf deinen Tisch: ${d.desc.replace(' (aktuell +{n})', '')}`, kind: 'talisman', weight: 0, rarity: d.rarity };
  }
  return CARDS[id];
}

/** A card's tier: talisman cards take the talisman's, one higher when they make yours golden. */
export function cardTier(def: CardDef, fuse = false): CardTier {
  if (!fuse) return def.rarity;
  const up: Record<CardTier, CardTier> = { common: 'rare', rare: 'epic', epic: 'legendary', legendary: 'legendary' };
  return up[def.rarity];
}

/** Marks for turning all three cards down. */
export const SKIP_DRAFT_MARKS = 2;

// ---- The bonus wheel -------------------------------------------------------------------------

export interface BonusSegment {
  id: string;
  label: string;
  desc: string;
  color: string;
  weight: number;
}

/**
 * Talisman cards: the draft shows a concrete talisman (card id `t_<item>`), placed on your table
 * for free. Their weight in the draft, by rarity.
 */
export const TALISMAN_CARD_WEIGHT = { common: 3, rare: 1.6, legendary: 0.5 };

/** Segments in wheel order. `x…` multiply the net win of the spin that triggered the wheel. */
export const BONUS_SEGMENTS: BonusSegment[] = [
  { id: 'x2', label: '×2', desc: 'Dein letzter Gewinn noch einmal.', color: '#c8202c', weight: 5 },
  { id: 'marken3', label: '◆3', desc: '+3 Glücksmarken.', color: '#6a2c9a', weight: 5 },
  { id: 'x3', label: '×3', desc: 'Dein letzter Gewinn zweimal obendrauf.', color: '#1f8a4a', weight: 3 },
  { id: 'talisman', label: 'TALISMAN', desc: 'Ein zufälliger Talisman für deinen Tisch.', color: '#2a6ad8', weight: 3 },
  { id: 'niete', label: 'NIETE', desc: 'Nichts. Pech.', color: '#1b1b20', weight: 4 },
  { id: 'x5', label: '×5', desc: 'Dein letzter Gewinn viermal obendrauf.', color: '#e0a020', weight: 2 },
  { id: 'doppel', label: '2 KUGELN', desc: 'Der nächste Dreh mit zwei Kugeln.', color: '#b48cff', weight: 3 },
  { id: 'rabatt', label: 'RATE −20%', desc: 'Die laufende Rate sinkt um 20 %.', color: '#3aa0a0', weight: 3 },
  { id: 'marken5', label: '◆5', desc: '+5 Glücksmarken.', color: '#8a3ac8', weight: 2 },
  { id: 'fach', label: 'FACH', desc: 'Ein zufälliges Fach bekommt einen Effekt.', color: '#ff7a2f', weight: 3 },
  { id: 'x10', label: '×10', desc: 'JACKPOT: dein letzter Gewinn neunmal obendrauf.', color: '#ffd23a', weight: 1 },
  { id: 'ruhe', label: 'VERDACHT 0', desc: 'Niemand hat etwas gesehen.', color: '#4a4a52', weight: 3 },
];

// ---- Cheating ------------------------------------------------------------------------------

/** Suspicion (0..100). At 100 the floor manager steps in. */
export const SUSPICION = {
  bribe: 25,
  magnet: 14,
  nudgeGood: 15,
  nudgeBad: 35,
  /** Decay per spin without cheating, and when a rate is paid. */
  decay: 12,
  payDecay: 30,
  /** Where it drops to after being caught. */
  afterCaught: 45,
};

/** Rate penalty (share of the rate) when caught. */
export const CAUGHT_PENALTY = 0.25;

// ---- The Baron's story ----------------------------------------------------------------------

export const BARON = {
  intro: [
    'HAMBURG, OKTOBER 1987.',
    'DU SCHULDEST DEM BARON {SUMME} DOLLAR. ER WILL SIE IN ACHT RATEN – UND ER WILL SIE PÜNKTLICH.',
    'DAS EINZIGE, WAS DU HAST: ETWAS BARGELD, EINEN TALISMAN UND DIESEN TISCH.',
  ],
  /** After paying rate n (index = rates paid − 1): what the Baron says on the line. */
  afterRate: [
    '„Die erste Rate. Wie niedlich. Nimm dir eine Karte – ich bin heute großzügig."',
    '„Du bist noch da. Das überrascht mich. Such dir was aus."',
    '„Meine Leute sagen, du hast Glück. Glück ist teuer, mein Freund."',
    '„Halbzeit. Du weißt, dass ich jede Nacht zusehe, oder?"',
    '„Fünf Raten. Langsam wirst du mir sympathisch. Langsam."',
    '„Die Summen werden groß. Genau wie meine Geduld klein wird."',
    '„Noch eine. Dann komme ich persönlich. Zieh dich gut an."',
  ],
  bossArrives: 'DER BARON BETRITT DEN SAAL. DIE LETZTE RATE SPIELT ER SELBST GEGEN DICH.',
  bossRule: 'Der Baron sperrt vor jedem Dreh ein Außenfeld und setzt gegen dich. Schlägst du ihn, sinkt die Rate um 10 %.',
  ending: [
    'DER BARON LEGT DIE KARTEN HIN. ER LÄCHELT NICHT.',
    '„Bezahlt. Bis auf den letzten Pfennig." Er steht auf, nickt – und ist verschwunden.',
    'DRAUSSEN WIRD ES HELL. DU BIST FREI.',
  ],
};

/** Boss duel win: the final rate drops by this share. */
export const BOSS_DUEL_DISCOUNT = 0.1;
