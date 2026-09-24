export type Color = 'red' | 'black' | 'green';

export type PocketModId = 'gold' | 'kristall' | 'flamme' | 'schwer';

export interface Pocket {
  /** Position on the wheel (0..36), fixed. */
  index: number;
  number: number;
  color: Color;
  mod?: PocketModId;
}

export type InsideKind = 'straight' | 'split' | 'street' | 'corner' | 'sixline';
export type BetKind = InsideKind | 'column' | 'dozen' | 'low' | 'high' | 'even' | 'odd' | 'red' | 'black';

export interface Field {
  id: string;
  kind: BetKind;
  /** Covered numbers for inside bets. */
  numbers: number[];
  /** 0..2 index for column/dozen. */
  value: number;
  label: string;
  payout: number;
}

/** Stakes on the table: field id -> chip values in the order they were placed. */
export type Bets = Record<string, number[]>;

export interface ItemInstance {
  uid: number;
  def: string;
  /** Scaling counter for items that grow during a run. */
  counter: number;
  /** Fused with a second copy: stronger effect. */
  gold?: boolean;
}

export type ShopItemKind = 'item' | 'pocket';

export interface ShopItem {
  kind: ShopItemKind;
  def: string;
  /** Price in lucky marks. */
  price: number;
  sold?: boolean;
  /** Buying it turns the owned copy golden. */
  fuse?: boolean;
}
