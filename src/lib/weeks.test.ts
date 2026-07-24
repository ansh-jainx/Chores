import { describe, expect, it } from 'vitest';

import {
  addWeeks,
  currentWeekKey,
  formatWeekLabel,
  listUpcomingWeekKeys,
  parseWeekKey,
  toWeekKey,
  weekOrdinal,
} from './weeks';

describe('ISO week helpers', () => {
  describe('toWeekKey', () => {
    it.each([
      [new Date(2026, 6, 24, 12), '2026-W30'],
      [new Date(2026, 0, 1, 12), '2026-W01'],
      [new Date(2026, 11, 31, 12), '2026-W53'],
      [new Date(2027, 0, 1, 12), '2026-W53'],
      [new Date(2020, 0, 1, 12), '2020-W01'],
      [new Date(2020, 11, 31, 12), '2020-W53'],
      [new Date(2021, 0, 1, 12), '2020-W53'],
      [new Date(2021, 0, 4, 12), '2021-W01'],
      [new Date(2024, 0, 1, 12), '2024-W01'],
      [new Date(2018, 11, 31, 12), '2019-W01'],
      [new Date(2019, 11, 30, 12), '2020-W01'],
      [new Date(2024, 11, 29, 12), '2024-W52'],
      [new Date(2024, 11, 30, 12), '2025-W01'],
      [new Date(2017, 0, 1, 12), '2016-W52'],
    ])('formats %s as %s', (date, weekKey) => {
      expect(toWeekKey(date)).toBe(weekKey);
    });

    it('rejects invalid dates', () => {
      expect(() => toWeekKey(new Date(Number.NaN))).toThrow(RangeError);
    });
  });

  describe('parseWeekKey', () => {
    it.each([
      ['2026-W30', { year: 2026, week: 30 }],
      ['2020-W53', { year: 2020, week: 53 }],
      ['2026-W53', { year: 2026, week: 53 }],
      ['2025-W01', { year: 2025, week: 1 }],
    ])('parses valid ISO week key %s', (weekKey, expected) => {
      expect(parseWeekKey(weekKey)).toEqual(expected);
    });

    it.each([
      '2026-W3',
      '2026-30',
      '2026-W00',
      '2021-W53',
      '2024-W53',
      '2025-W53',
      '2026-W54',
      'abcd',
    ])('rejects invalid key %s', (weekKey) => {
      expect(() => parseWeekKey(weekKey)).toThrow(RangeError);
    });
  });

  describe('weekOrdinal', () => {
    it('returns a stable integer for rotation', () => {
      expect(Number.isInteger(weekOrdinal('2026-W30'))).toBe(true);
    });

    it.each([
      ['2026-W30', '2026-W31'],
      ['2024-W52', '2025-W01'],
      ['2020-W53', '2021-W01'],
      ['2026-W53', '2027-W01'],
    ])('increments by one from %s to %s', (weekKey, nextWeekKey) => {
      expect(addWeeks(weekKey, 1)).toBe(nextWeekKey);
      expect(weekOrdinal(nextWeekKey)).toBe(weekOrdinal(weekKey) + 1);
    });
  });

  describe('addWeeks', () => {
    it.each([
      ['2026-W30', 1, '2026-W31'],
      ['2026-W30', -1, '2026-W29'],
      ['2026-W52', 1, '2026-W53'],
      ['2026-W53', 1, '2027-W01'],
      ['2020-W53', 1, '2021-W01'],
      ['2021-W01', -1, '2020-W53'],
      ['2025-W01', -1, '2024-W52'],
    ])('adds %d weeks to %s', (weekKey, delta, expected) => {
      expect(addWeeks(weekKey, delta)).toBe(expected);
    });

    it.each([
      ['2026-W30', 0],
      ['2024-W52', 1],
      ['2025-W01', -1],
      ['2020-W53', 5],
      ['2027-W01', -53],
    ])('roundtrips %s by %d weeks', (weekKey, delta) => {
      expect(addWeeks(addWeeks(weekKey, delta), -delta)).toBe(weekKey);
    });

    it('rejects fractional deltas', () => {
      expect(() => addWeeks('2026-W30', 1.5)).toThrow(RangeError);
    });
  });

  describe('currentWeekKey', () => {
    it('uses the provided date when supplied', () => {
      expect(currentWeekKey(new Date(2026, 6, 24, 12))).toBe('2026-W30');
    });
  });

  describe('formatWeekLabel', () => {
    it.each([
      ['2026-W30', 'Jul 20\u201326, 2026'],
      ['2026-W14', 'Mar 30\u2013Apr 5, 2026'],
      ['2025-W01', 'Dec 30, 2024\u2013Jan 5, 2025'],
      ['2026-W01', 'Dec 29, 2025\u2013Jan 4, 2026'],
      ['2020-W53', 'Dec 28, 2020\u2013Jan 3, 2021'],
      ['2024-W01', 'Jan 1\u20137, 2024'],
    ])('formats %s as %s', (weekKey, label) => {
      expect(formatWeekLabel(weekKey)).toBe(label);
    });
  });

  describe('listUpcomingWeekKeys', () => {
    it('lists consecutive week keys including the starting week', () => {
      expect(listUpcomingWeekKeys('2026-W52', 4)).toEqual([
        '2026-W52',
        '2026-W53',
        '2027-W01',
        '2027-W02',
      ]);
    });

    it('keeps length and order across a 52-week year boundary', () => {
      const weekKeys = listUpcomingWeekKeys('2024-W50', 6);

      expect(weekKeys).toHaveLength(6);
      expect(weekKeys).toEqual([
        '2024-W50',
        '2024-W51',
        '2024-W52',
        '2025-W01',
        '2025-W02',
        '2025-W03',
      ]);
    });

    it('returns an empty list for a zero count', () => {
      expect(listUpcomingWeekKeys('2026-W30', 0)).toEqual([]);
    });

    it.each([-1, 1.5])('rejects invalid count %s', (count) => {
      expect(() => listUpcomingWeekKeys('2026-W30', count)).toThrow(
        RangeError,
      );
    });
  });
});
