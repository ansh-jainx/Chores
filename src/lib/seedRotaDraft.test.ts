import { describe, expect, it } from 'vitest'

import type { AwayMap, Household, WeekAssignmentOverride } from '../types'
import { choresDueInWeek } from './scheduler'
import { buildWeekDraft, validateSeedWeek } from './seedRotaDraft'

const EMPTY_AWAY: AwayMap = {}

const household: Household = {
  people: [
    { id: 'ada', name: 'Ada', bathZone: 'up' },
    { id: 'ben', name: 'Ben', bathZone: 'down' },
    { id: 'cy', name: 'Cy', bathZone: 'up' },
  ],
  biweeklyParity: 0,
  chores: [
    { id: 'dishes', name: 'Dishes', cadence: 'weekly' },
    { id: 'bins', name: 'Bins', cadence: 'weekly' },
    { id: 'hallway', name: 'Hallway', cadence: 'biweekly' },
  ],
}

describe('buildWeekDraft', () => {
  it('returns a copy of a locked week as-is', () => {
    const weekKey = '2026-W02'
    const locked: WeekAssignmentOverride = {
      dishes: 'cy',
      bins: 'cy',
      hallway: 'ben',
    }

    const draft = buildWeekDraft(household, EMPTY_AWAY, weekKey, {
      [weekKey]: locked,
    })

    expect(draft).toEqual(locked)
    expect(draft).not.toBe(locked)
  })

  it('assigns each due chore to a household member for an unlocked week', () => {
    const weekKey = '2026-W03'
    const draft = buildWeekDraft(household, EMPTY_AWAY, weekKey, {
      '2026-W02': { dishes: 'ada', bins: 'ben', hallway: 'cy' },
    })
    const dueIds = choresDueInWeek(household, weekKey).map((chore) => chore.id)
    const personIds = household.people.map((person) => person.id)

    expect(dueIds.length).toBeGreaterThan(0)
    expect(Object.keys(draft).sort()).toEqual([...dueIds].sort())
    for (const personId of Object.values(draft)) {
      expect(personIds).toContain(personId)
    }
  })
})

describe('validateSeedWeek', () => {
  const weekKey = '2026-W02'

  it('allows one person to hold multiple chores in a locked week', () => {
    const draft: WeekAssignmentOverride = {
      dishes: 'ada',
      bins: 'ada',
      hallway: 'ben',
    }

    expect(validateSeedWeek(household, EMPTY_AWAY, weekKey, draft)).toBeNull()
  })

  it('accepts one assignee per due chore', () => {
    const draft: WeekAssignmentOverride = {
      dishes: 'ada',
      bins: 'ben',
      hallway: 'cy',
    }

    expect(validateSeedWeek(household, EMPTY_AWAY, weekKey, draft)).toBeNull()
  })

  it('rejects an away assignee', () => {
    const away: AwayMap = {
      ben: [
        {
          id: 'ben-away',
          name: 'Holiday',
          from: '2026-01-05',
          until: '2026-01-12',
        },
      ],
    }
    const draft: WeekAssignmentOverride = {
      dishes: 'ada',
      bins: 'ben',
      hallway: 'cy',
    }

    const error = validateSeedWeek(household, away, weekKey, draft)

    expect(error).toContain('Ben')
    expect(error).toMatch(/holiday/i)
  })

  it('rejects a missing due chore assignment', () => {
    const draft: WeekAssignmentOverride = {
      dishes: 'ada',
      bins: 'ben',
    }

    const error = validateSeedWeek(household, EMPTY_AWAY, weekKey, draft)

    expect(error).toContain('pick someone for Hallway')
  })
})
