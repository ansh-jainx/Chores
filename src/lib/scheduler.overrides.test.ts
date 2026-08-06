import { describe, expect, it } from 'vitest'

import type { AwayMap, WeekAssignmentOverride, WeekOverrideMap } from '../types'
import { FALLBACK_HOUSEHOLD } from './defaults'
import { peoplePresent, scheduleWeek } from './scheduler'
import { validateSeedWeek } from './seedRotaDraft'

function lockWeek(weekKey: string): WeekAssignmentOverride {
  return Object.fromEntries(
    scheduleWeek(FALLBACK_HOUSEHOLD, {}, weekKey).assignments.map(
      (assignment) => [assignment.choreId, assignment.personId],
    ),
  )
}

function countFreePresentPeople(
  away: AwayMap,
  weekKey: string,
  assignments: ReturnType<typeof scheduleWeek>['assignments'],
): number {
  const assigned = new Set(assignments.map((assignment) => assignment.personId))
  return peoplePresent(FALLBACK_HOUSEHOLD, away, weekKey).filter(
    (person) => !assigned.has(person.id),
  ).length
}

describe('scheduler seeded week overrides with holidays', () => {
  it('validates seed weeks against away people', () => {
    const weekKey = '2026-W30'
    const draft = lockWeek(weekKey)
    const awayPersonId = draft.kitchen
    const awayPerson = FALLBACK_HOUSEHOLD.people.find(
      (person) => person.id === awayPersonId,
    )
    expect(awayPerson).toBeTruthy()

    const away: AwayMap = {
      [awayPersonId]: [
        {
          id: 'seed-week-trip',
          name: 'Seed week trip',
          from: '2026-07-20',
          until: '2026-07-27',
        },
      ],
    }

    const error = validateSeedWeek(FALLBACK_HOUSEHOLD, away, weekKey, draft)

    expect(error).toContain(awayPerson!.name)
    expect(error).toMatch(/holiday/i)
  })

  it('redistributes the auto week after locked seeds when someone is away', () => {
    const overrides: WeekOverrideMap = {
      '2026-W30': lockWeek('2026-W30'),
      '2026-W31': lockWeek('2026-W31'),
    }
    const weekKey = '2026-W32'
    const away: AwayMap = {
      'person-2': [
        {
          id: 'person-2-auto-week-trip',
          name: 'Auto week trip',
          from: '2026-08-03',
          until: '2026-08-10',
        },
      ],
    }

    const baseline = scheduleWeek(FALLBACK_HOUSEHOLD, {}, weekKey, { overrides })
    const schedule = scheduleWeek(FALLBACK_HOUSEHOLD, away, weekKey, { overrides })
    const assignedIds = new Set(
      schedule.assignments.map((assignment) => assignment.personId),
    )

    expect(baseline.assignments).toHaveLength(5)
    expect(countFreePresentPeople({}, weekKey, baseline.assignments)).toBe(1)
    expect(schedule.assignments).toHaveLength(5)
    expect(assignedIds.has('person-2')).toBe(false)
    expect(assignedIds.size).toBe(5)
    expect(countFreePresentPeople(away, weekKey, schedule.assignments)).toBe(0)
  })

  it('materializes a locked away assignee with a warning', () => {
    const weekKey = '2026-W30'
    const override = lockWeek(weekKey)
    const awayPersonId = override.kitchen
    const away: AwayMap = {
      [awayPersonId]: [
        {
          id: 'locked-week-trip',
          name: 'Locked week trip',
          from: '2026-07-20',
          until: '2026-07-27',
        },
      ],
    }

    const schedule = scheduleWeek(FALLBACK_HOUSEHOLD, away, weekKey, {
      overrides: { [weekKey]: override },
    })
    const assignment = schedule.assignments.find(
      (item) => item.choreId === 'kitchen',
    )

    expect(assignment?.personId).toBe(awayPersonId)
    expect(assignment?.warning).toContain('holiday')
  })
})
