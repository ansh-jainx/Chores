import { describe, expect, it } from 'vitest'
import type { AwayMap, Household } from '../types'
import { buildPrintCalendar } from './printCalendar'

const household: Household = {
  people: [
    { id: 'alex', name: 'Alex', bathZone: 'up' },
    { id: 'sam', name: 'Sam', bathZone: 'down' },
  ],
  chores: [
    { id: 'kitchen', name: 'Kitchen', cadence: 'weekly', effort: 'heavy' },
    {
      id: 'bathroom-up',
      name: 'Bath up',
      cadence: 'weekly',
      zone: 'up',
      effort: 'heavy',
    },
    {
      id: 'bathroom-down',
      name: 'Bath down',
      cadence: 'weekly',
      zone: 'down',
      effort: 'heavy',
    },
  ],
  biweeklyParity: 0,
}

describe('buildPrintCalendar', () => {
  it('builds one row per requested week with cells for each person', () => {
    const rows = buildPrintCalendar(household, {}, '2026-W30', 2)

    expect(rows).toHaveLength(2)
    expect(rows[0]?.weekKey).toBe('2026-W30')
    expect(rows[1]?.weekKey).toBe('2026-W31')
    expect(rows[0]?.label).toContain('2026')
    expect(Object.keys(rows[0]?.cells ?? {})).toEqual(['alex', 'sam'])
  })

  it('marks people on holiday instead of listing chores', () => {
    const away: AwayMap = {
      alex: [
        {
          id: 'trip',
          name: 'Summer trip',
          from: '2026-07-20',
          until: '2026-07-27',
        },
      ],
    }

    const [row] = buildPrintCalendar(household, away, '2026-W30', 1)

    expect(row?.cells.alex).toEqual({
      status: 'holiday',
      choreNames: [],
      holidayLabel: 'Summer trip',
    })
    expect(row?.cells.sam?.status).not.toBe('holiday')
  })
})
