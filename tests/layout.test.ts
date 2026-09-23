import { describe, expect, it } from 'vitest';
import { FIELD_BY_ID } from '../src/game/fields';
import { fieldAt, fieldCenter, TILE } from '../src/world/layout';

describe('layout hit detection', () => {
  it('maps every field center back to the same field', () => {
    for (const id of Object.keys(FIELD_BY_ID)) {
      const c = fieldCenter(id);
      expect(fieldAt(c.x, c.z), id).toBe(id);
    }
  });

  it('prefers the number when clicking the middle of a tile', () => {
    const c = fieldCenter('n17');
    expect(fieldAt(c.x + TILE * 0.2, c.z - TILE * 0.2)).toBe('n17');
  });

  it('inside bets cover the right numbers', () => {
    expect(FIELD_BY_ID['co0-0'].numbers).toEqual([1, 2, 4, 5]);
    expect(FIELD_BY_ID['sh0-2'].numbers).toEqual([3, 6]);
    expect(FIELD_BY_ID['sv11-1'].numbers).toEqual([35, 36]);
    expect(FIELD_BY_ID['sl10'].numbers).toEqual([31, 32, 33, 34, 35, 36]);
  });
});
