import { describe, expect, it } from 'vitest'

import type { AwayMap, Household, WeekAssignmentOverride } from '../types'
import {
  buildSeedPairDrafts,
  buildWeekDraft,
  refreshWeekTwoDraft,
  validateSeedWeek,
} from './seedRotaDraft'

const EMPTY_AWAY: AwayMap = {}

const validationHousehold: Household = {
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

const rotationHousehold: Household = {
  people: [
    { id: 'ada', name: 'Ada', bathZone: 'up' },
    { id: 'ben', name: 'Ben', bathZone: 'down' },
  ],
  biweeklyParity: 0,
  chores: [
    { id: 'dishes', name: 'Dishes', cadence: 'weekly' },
    { id: 'bins', name: 'Bins', cadence: 'weekly' },
  ],
}

describe('validateSeedWeek', () => {
  const weekKey = '2026-W02'

  it('accepts one assignee per due chore', () => {
    const draft: WeekAssignmentOverride = {
      dishes: 'ada',
      bins: 'ben',
      hallway: 'cy',
    }

    expect(validateSeedWeek(validationHousehold, EMPTY_AWAY, weekKey, draft)).toBeNull()
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

    const error = validateSeedWeek(validationHousehold, away, weekKey, draft)

    expect(error).toContain('Ben')
    expect(error).toMatch(/holiday/i)
  })

  it('rejects a missing due chore assignment', () => {
    const draft: WeekAssignmentOverride = {
      dishes: 'ada',
      bins: 'ben',
    }

    const error = validateSeedWeek(validationHousehold, EMPTY_AWAY, weekKey, draft)

    expect(error).toContain('pick someone for Hallway')
  })
})

describe('seed pair drafts', () => {
  it('builds week two using provisional week-one draft as history', () => {
    const start = '2026-W30'
    const weekTwo = '2026-W31'
    const persistedWeekOne = { dishes: 'ada', bins: 'ben' }
    const editedWeekOne = { dishes: 'ben', bins: 'ada' }
    const overrides = { [start]: persistedWeekOne }

    const staleWeekTwo = buildWeekDraft(
      rotationHousehold,
      EMPTY_AWAY,
      weekTwo,
      overrides,
    )
    const pair = buildSeedPairDrafts(
      rotationHousehold,
      EMPTY_AWAY,
      start,
      overrides,
      editedWeekOne,
    )

    expect(staleWeekTwo).toEqual({ dishes: 'ben', bins: 'ada' })
    expect(pair.draftOne).toEqual(editedWeekOne)
    expect(pair.draftTwo).toEqual({ dishes: 'ada', bins: 'ben' })
    expect(pair.draftTwo).not.toEqual(staleWeekTwo)
  })

  it('keeps a locked week-two draft instead of rebuilding from provisional history', () => {
    const start = '2026-W30'
    const weekTwo = '2026-W31'
    const lockedWeekTwo = { dishes: 'ben', bins: 'ada' }
    const pair = buildSeedPairDrafts(
      rotationHousehold,
      EMPTY_AWAY,
      start,
      {
        [start]: { dishes: 'ada', bins: 'ben' },
        [weekTwo]: lockedWeekTwo,
      },
      { dishes: 'ben', bins: 'ada' },
    )

    expect(pair.draftTwo).toEqual(lockedWeekTwo)
  })

  it('refreshes week two only when it is not locked', () => {
    const start = '2026-W30'
    const weekTwo = '2026-W31'
    const editedWeekOne = { dishes: 'ben', bins: 'ada' }
    const refreshed = refreshWeekTwoDraft(
      rotationHousehold,
      EMPTY_AWAY,
      start,
      {},
      editedWeekOne,
    )

    expect(refreshed).toEqual({ dishes: 'ada', bins: 'ben' })
    expect(
      refreshWeekTwoDraft(
        rotationHousehold,
        EMPTY_AWAY,
        start,
        { [weekTwo]: { dishes: 'ben', bins: 'ada' } },
        editedWeekOne,
      ),
    ).toBeNull()
  })
})
import { describe, expect, it } from 'vitest'

import type { AwayMap, Household, WeekAssignmentOverride } from '../types'
import {
  buildSeedPairDrafts,
  buildWeekDraft,
  refreshWeekTwoDraft,
  validateSeedWeek,
} from './seedRotaDraft'

const EMPTY_AWAY: AwayMap = {}

const validationHousehold: Household = {
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

const rotationHousehold: Household = {
  people: [
    { id: 'ada', name: 'Ada', bathZone: 'up' },
    { id: 'ben', name: 'Ben', bathZone: 'down' },
  ],
  biweeklyParity: 0,
  chores: [
    { id: 'dishes', name: 'Dishes', cadence: 'weekly' },
    { id: 'bins', name: 'Bins', cadence: 'weekly' },
  ],
}

describe('validateSeedWeek', () => {
  const weekKey = '2026-W02'

  it('rejects duplicate assignees across due chores', () => {
    const draft: WeekAssignmentOverride = {
      dishes: 'ada',
      bins: 'ada',
      hallway: 'ben',
    }

    const error = validateSeedWeek(validationHousehold, EMPTY_AWAY, weekKey, draft)

    expect(error).toContain('Ada')
    expect(error).toMatch(/already assigned/i)
  })

  it('accepts one assignee per due chore', () => {
    const draft: WeekAssignmentOverride = {
      dishes: 'ada',
      bins: 'ben',
      hallway: 'cy',
    }

    expect(validateSeedWeek(validationHousehold, EMPTY_AWAY, weekKey, draft)).toBeNull()
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

    const error = validateSeedWeek(validationHousehold, away, weekKey, draft)

    expect(error).toContain('Ben')
    expect(error).toMatch(/holiday/i)
  })

  it('rejects a missing due chore assignment', () => {
    const draft: WeekAssignmentOverride = {
      dishes: 'ada',
      bins: 'ben',
    }

    const error = validateSeedWeek(validationHousehold, EMPTY_AWAY, weekKey, draft)

    expect(error).toContain('pick someone for Hallway')
  })
})

describe('seed pair drafts', () => {
  it('builds week two using provisional week-one draft as history', () => {
    const start = '2026-W30'
    const weekTwo = '2026-W31'
    const persistedWeekOne = { dishes: 'ada', bins: 'ben' }
    const editedWeekOne = { dishes: 'ben', bins: 'ada' }
    const overrides = { [start]: persistedWeekOne }

    const staleWeekTwo = buildWeekDraft(
      rotationHousehold,
      EMPTY_AWAY,
      weekTwo,
      overrides,
    )
    const pair = buildSeedPairDrafts(
      rotationHousehold,
      EMPTY_AWAY,
      start,
      overrides,
      editedWeekOne,
    )

    expect(staleWeekTwo).toEqual({ dishes: 'ben', bins: 'ada' })
    expect(pair.draftOne).toEqual(editedWeekOne)
    expect(pair.draftTwo).toEqual({ dishes: 'ada', bins: 'ben' })
    expect(pair.draftTwo).not.toEqual(staleWeekTwo)
  })

  it('keeps a locked week-two draft instead of rebuilding from provisional history', () => {
    const start = '2026-W30'
    const weekTwo = '2026-W31'
    const lockedWeekTwo = { dishes: 'ben', bins: 'ada' }
    const pair = buildSeedPairDrafts(
      rotationHousehold,
      EMPTY_AWAY,
      start,
      {
        [start]: { dishes: 'ada', bins: 'ben' },
        [weekTwo]: lockedWeekTwo,
      },
      { dishes: 'ben', bins: 'ada' },
    )

    expect(pair.draftTwo).toEqual(lockedWeekTwo)
  })

  it('refreshes week two only when it is not locked', () => {
    const start = '2026-W30'
    const weekTwo = '2026-W31'
    const editedWeekOne = { dishes: 'ben', bins: 'ada' }
    const refreshed = refreshWeekTwoDraft(
      rotationHousehold,
      EMPTY_AWAY,
      start,
      {},
      editedWeekOne,
    )

    expect(refreshed).toEqual({ dishes: 'ada', bins: 'ben' })
    expect(
      refreshWeekTwoDraft(
        rotationHousehold,
        EMPTY_AWAY,
        start,
        { [weekTwo]: { dishes: 'ben', bins: 'ada' } },
        editedWeekOne,
      ),
    ).toBeNull()
  })
})
