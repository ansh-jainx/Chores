import { describe, expect, it } from 'vitest'

import type { Assignment, Chore } from '../types'
import { FALLBACK_HOUSEHOLD } from './defaults'
import { scheduleWeek } from './scheduler'

const WEEK_KEYS = [
  '2026-W30',
  '2026-W31',
  '2026-W32',
  '2026-W33',
  '2026-W34',
  '2026-W35',
] as const
const EMPTY_AWAY = {}

const choreById = new Map(FALLBACK_HOUSEHOLD.chores.map((chore) => [chore.id, chore]))
const peopleById = new Map(FALLBACK_HOUSEHOLD.people.map((person) => [person.id, person]))

function countAssignments(
  assignments: Assignment[],
  shouldCountChore: (chore: Chore) => boolean,
): Map<string, number> {
  const counts = new Map(FALLBACK_HOUSEHOLD.people.map((person) => [person.id, 0]))

  for (const assignment of assignments) {
    const chore = choreById.get(assignment.choreId)

    if (chore !== undefined && shouldCountChore(chore)) {
      counts.set(assignment.personId, (counts.get(assignment.personId) ?? 0) + 1)
    }
  }

  return counts
}

function totalCounts(countsByWeek: Map<string, number>[]): number[] {
  const totals = new Map(FALLBACK_HOUSEHOLD.people.map((person) => [person.id, 0]))

  for (const counts of countsByWeek) {
    for (const [personId, count] of counts) {
      totals.set(personId, (totals.get(personId) ?? 0) + count)
    }
  }

  return [...totals.values()]
}

describe('scheduleWeek fairness integration', () => {
  it('keeps weekly non-zone chore totals equal over a full six-person cycle', () => {
    const countsByWeek = WEEK_KEYS.map((weekKey) => {
      const schedule = scheduleWeek(FALLBACK_HOUSEHOLD, EMPTY_AWAY, weekKey)

      return countAssignments(
        schedule.assignments,
        (chore) => chore.zone === undefined && chore.cadence === 'weekly',
      )
    })
    const counts = totalCounts(countsByWeek)
    const weeklyNonZoneChoreCount = FALLBACK_HOUSEHOLD.chores.filter(
      (chore) => chore.zone === undefined && chore.cadence === 'weekly',
    ).length
    const totalWeeklyNonZoneAssignments = counts.reduce((sum, count) => sum + count, 0)

    expect(totalWeeklyNonZoneAssignments).toBe(weeklyNonZoneChoreCount * WEEK_KEYS.length)
    expect(Math.max(...counts) - Math.min(...counts)).toBe(0)
  })

  it('assigns bath-up only to upstairs-zone people when both zones are present', () => {
    const householdZones = new Set(FALLBACK_HOUSEHOLD.people.map((person) => person.bathZone))
    const upstairsBathroomChores = FALLBACK_HOUSEHOLD.chores.filter(
      (chore) => chore.zone === 'up',
    )
    const upstairsBathroomIds = new Set(upstairsBathroomChores.map((chore) => chore.id))

    expect(householdZones).toEqual(new Set(['up', 'down']))
    expect(upstairsBathroomChores.length).toBeGreaterThan(0)

    for (const weekKey of WEEK_KEYS) {
      const schedule = scheduleWeek(FALLBACK_HOUSEHOLD, EMPTY_AWAY, weekKey)
      const upstairsBathroomAssignments = schedule.assignments.filter((assignment) =>
        upstairsBathroomIds.has(assignment.choreId),
      )

      expect(upstairsBathroomAssignments).toHaveLength(upstairsBathroomChores.length)

      for (const assignment of upstairsBathroomAssignments) {
        expect(peopleById.get(assignment.personId)?.bathZone).toBe('up')
      }
    }
  })
})
