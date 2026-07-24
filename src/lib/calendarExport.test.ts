import { describe, expect, it } from 'vitest'
import type { AwayMap, Household } from '../types'
import {
  buildMonthlyCalendars,
  buildWeeklyExport,
  placeWeekAssignmentsOnDays,
} from './calendarExport'
import { weekKeysOverlappingRange } from './weeks'

const household: Household = {
  people: [
    { id: 'alex', name: 'Alex', bathZone: 'up' },
    { id: 'sam', name: 'Sam', bathZone: 'down' },
  ],
  chores: [
    { id: 'kitchen', name: 'Kitchen', cadence: 'weekly', effort: 'heavy' },
    {
      id: 'cardboard',
      name: 'Cardboard',
      cadence: 'biweekly',
      effort: 'light',
    },
  ],
  biweeklyParity: 0,
}

describe('calendar export placement', () => {
  it('puts cardboard on Wednesday and other chores on both weekend days', () => {
    const placed = placeWeekAssignmentsOnDays(
      '2026-W30',
      [
        {
          choreId: 'kitchen',
          choreName: 'Kitchen',
          personId: 'alex',
          personName: 'Alex',
          effort: 'heavy',
        },
        {
          choreId: 'cardboard',
          choreName: 'Cardboard',
          personId: 'sam',
          personName: 'Sam',
          effort: 'light',
        },
      ],
      {},
    )

    // 2026-W30 Monday is 2026-07-20
    expect(placed['2026-07-22']?.some((entry) => entry.text === 'Cardboard')).toBe(
      true,
    )
    expect(placed['2026-07-22']?.[0]?.note).toMatch(/Tue night/i)
    expect(placed['2026-07-25']?.some((entry) => entry.text === 'Kitchen')).toBe(
      true,
    )
    expect(placed['2026-07-26']?.some((entry) => entry.text === 'Kitchen')).toBe(
      true,
    )
    expect(placed['2026-07-25']?.some((entry) => entry.text === 'Cardboard')).toBe(
      false,
    )
  })

  it('builds monthly calendars and weekly rows for a date range', () => {
    const from = '2026-07-01'
    const until = '2026-07-31'
    const months = buildMonthlyCalendars(household, {}, from, until)
    const weekly = buildWeeklyExport(household, {}, from, until)

    expect(months.length).toBe(1)
    expect(months[0]?.label).toBe('July 2026')
    expect(months[0]?.weeks.length).toBeGreaterThan(3)
    expect(weekly.length).toBe(weekKeysOverlappingRange(from, until).length)
  })

  it('marks holiday weekends without listing chores for away people', () => {
    const away: AwayMap = {
      alex: [
        {
          id: 'trip',
          name: 'Summer',
          from: '2026-07-20',
          until: '2026-07-27',
        },
      ],
    }

    const months = buildMonthlyCalendars(household, away, '2026-07-20', '2026-07-26')
    const saturday = months[0]?.entriesByDate['2026-07-25'] ?? []
    expect(saturday.some((entry) => entry.kind === 'holiday')).toBe(true)
  })
})
