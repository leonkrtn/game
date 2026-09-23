export type Color = 'red' | 'black' | 'green';

export type PocketModId = 'gold' | 'kristall' | 'flamme' | 'schwer';

export interface Pocket {
  /** Position on the wheel (0..36), fixed. */
  index: number;
  number: number;
  color: Color;
  mod?: PocketModId;
}

export type BetKind =
  | 'straight'
  | 'column'
  | 'dozen'
  | 'low'
  | 'high'
  | 'even'
  | 'odd'
  | 'red'
  | 'black';

export interface Field {
  id: string;
  kind: BetKind;
  /** Number for straight, 0..2 for column/dozen. */
  value: number;
  label: string;
  payout: number;
}

export interface ChipInstance {
  uid: number;
  def: string;
}

export interface TalismanInstance {
  uid: number;
  def: string;
  /** Scaling counter for talismans that grow during a run. */
  counter: number;
}

export type ShopItemKind = 'chip' | 'talisman' | 'pocket' | 'service';

export interface ShopItem {
  kind: ShopItemKind;
  def: string;
  price: number;
  sold?: boolean;
}

