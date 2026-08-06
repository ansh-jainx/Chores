import { describe, expect, it } from 'vitest'
import type { AwayMap, Household, WeekAssignmentOverride } from '../types'
import { FALLBACK_HOUSEHOLD } from './defaults'
import {
  buildSeedPairDrafts,
  buildWeekDraft,
  refreshWeekTwoDraft,
  validateSeedWeek,
} from './seedRotaDraft'

const EMPTY_AWAY = {}

const smallHousehold: Household = {
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
})

describe('validateSeedWeek', () => {
  const weekKey = '2026-W02'

  it('rejects duplicate assignees across due chores', () => {
    const draft: WeekAssignmentOverride = {
      dishes: 'ada',
      bins: 'ada',
      hallway: 'ben',
    }

    const error = validateSeedWeek(smallHousehold, {}, weekKey, draft)

    expect(error).toContain('Ada')
    expect(error).toMatch(/already assigned/i)
  })

  it('accepts one assignee per due chore', () => {
    const draft: WeekAssignmentOverride = {
      dishes: 'ada',
      bins: 'ben',
      hallway: 'cy',
    }

    expect(validateSeedWeek(smallHousehold, {}, weekKey, draft)).toBeNull()
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

    const error = validateSeedWeek(smallHousehold, away, weekKey, draft)

    expect(error).toContain('Ben')
    expect(error).toMatch(/holiday/i)
  })

  it('rejects a missing due chore assignment', () => {
    const draft: WeekAssignmentOverride = {
      dishes: 'ada',
      bins: 'ben',
    }

    const error = validateSeedWeek(smallHousehold, {}, weekKey, draft)

    expect(error).toContain('pick someone for Hallway')
  })
})

describe('seed pair drafts', () => {
  it('builds week two using provisional week-one draft as history', () => {
    const start = '2026-W30'
    const auto = buildSeedPairDrafts(
      FALLBACK_HOUSEHOLD,
      EMPTY_AWAY,
      start,
      {},
    )

    const editedOne = { ...auto.draftOne }
    const other = FALLBACK_HOUSEHOLD.people.find(
      (person) => person.id !== editedOne.kitchen,
    )
    expect(other).toBeTruthy()
    editedOne.kitchen = other!.id

    const refreshed = refreshWeekTwoDraft(
      FALLBACK_HOUSEHOLD,
      EMPTY_AWAY,
      start,
      {},
      editedOne,
    )
    expect(refreshed).not.toBeNull()

    const lockedTwo = buildWeekDraft(FALLBACK_HOUSEHOLD, EMPTY_AWAY, '2026-W31', {
      '2026-W31': auto.draftTwo,
    })
    expect(
      refreshWeekTwoDraft(
        FALLBACK_HOUSEHOLD,
        EMPTY_AWAY,
        start,
        { '2026-W31': lockedTwo },
        editedOne,
      ),
    ).toBeNull()
  })
})
