import { describe, expect, it } from 'vitest'
import type { AwayMap, Household } from '../types'
import {
  buildMonthlyDateGrids,
  buildMonthlyPersonSchedules,
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
  it('puts cardboard on Wednesday and weekend chores once on Saturday', () => {
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
    expect(placed['2026-07-22']?.some((entry) => entry.choreName === 'Cardboard')).toBe(
      true,
    )
    expect(placed['2026-07-22']?.[0]?.note).toMatch(/Tue night/i)
    expect(placed['2026-07-25']?.some((entry) => entry.choreName === 'Kitchen')).toBe(
      true,
    )
    expect(placed['2026-07-26']).toBeUndefined()
    expect(placed['2026-07-25']?.some((entry) => entry.choreName === 'Cardboard')).toBe(
      false,
    )
  })

  it('builds person-first monthly schedules for a date range', () => {
    const from = '2026-07-01'
    const until = '2026-07-31'
    const months = buildMonthlyPersonSchedules(household, {}, from, until)
    const weekly = buildWeeklyExport(household, {}, from, until)

    expect(months).toHaveLength(1)
    expect(months[0]?.label).toBe('July 2026')
    expect(months[0]?.people.map((person) => person.personName)).toEqual([
      'Alex',
      'Sam',
    ])
    expect(
      months[0]?.people.some((person) => person.items.length > 0),
    ).toBe(true)
    expect(weekly.length).toBe(weekKeysOverlappingRange(from, until).length)
  })

  it('lists holidays under the person rather than as a calendar grid', () => {
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

    const months = buildMonthlyPersonSchedules(
      household,
      away,
      '2026-07-20',
      '2026-07-26',
    )
    const alex = months[0]?.people.find((person) => person.personId === 'alex')
    expect(alex?.items.some((item) => item.kind === 'holiday')).toBe(true)
  })

  it('builds a full-month date-row × person-column grid', () => {
    const grids = buildMonthlyDateGrids(household, {}, '2026-07-01', '2026-07-31')
    expect(grids).toHaveLength(1)
    expect(grids[0]?.people.map((person) => person.name)).toEqual([
      'Alex',
      'Sam',
    ])
    // Every day in July, not only chore days.
    expect(grids[0]?.rows).toHaveLength(31)
    expect(grids[0]?.rows[0]?.date).toBe('2026-07-01')
    expect(grids[0]?.rows[30]?.date).toBe('2026-07-31')
    expect(grids[0]?.rows.some((row) => Object.keys(row.cells).length > 0)).toBe(
      true,
    )
  })
})
