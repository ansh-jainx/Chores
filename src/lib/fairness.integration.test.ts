import { describe, expect, it } from 'vitest'

import type { Assignment, Chore } from '../types'
import { FALLBACK_HOUSEHOLD } from './defaults'
import { scheduleWeek } from './scheduler'
import { addWeeks } from './weeks'

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
  it('never doubles heavy chores for one person in a week when avoidable', () => {
    for (const weekKey of WEEK_KEYS) {
      const schedule = scheduleWeek(FALLBACK_HOUSEHOLD, EMPTY_AWAY, weekKey)
      const heavyByPerson = new Map<string, number>()

      for (const assignment of schedule.assignments) {
        if (assignment.effort !== 'heavy') {
          continue
        }
        heavyByPerson.set(
          assignment.personId,
          (heavyByPerson.get(assignment.personId) ?? 0) + 1,
        )
      }

      expect([...heavyByPerson.values()].every((count) => count === 1)).toBe(true)
      const heavyAssignments = schedule.assignments.filter(
        (assignment) => assignment.effort === 'heavy',
      )
      expect(heavyByPerson.size).toBe(heavyAssignments.length)
    }
  })

  it('spreads biweekly chores across both week parities', () => {
    const even = new Set(
      scheduleWeek(FALLBACK_HOUSEHOLD, EMPTY_AWAY, '2026-W30').assignments.map(
        (assignment) => assignment.choreId,
      ),
    )
    const odd = new Set(
      scheduleWeek(FALLBACK_HOUSEHOLD, EMPTY_AWAY, '2026-W31').assignments.map(
        (assignment) => assignment.choreId,
      ),
    )
    const biweeklyIds = FALLBACK_HOUSEHOLD.chores
      .filter((chore) => chore.cadence === 'biweekly')
      .map((chore) => chore.id)

    const onEven = biweeklyIds.filter((id) => even.has(id))
    const onOdd = biweeklyIds.filter((id) => odd.has(id))

    expect(onEven.length).toBeGreaterThan(0)
    expect(onOdd.length).toBeGreaterThan(0)
    expect(onEven.length + onOdd.length).toBe(biweeklyIds.length)
    expect(onEven.every((id) => !odd.has(id))).toBe(true)
  })
  it('leaves exactly one person chore-free on a full default week (no stacking)', () => {
    for (const weekKey of WEEK_KEYS) {
      const schedule = scheduleWeek(FALLBACK_HOUSEHOLD, EMPTY_AWAY, weekKey)
      const counts = new Map<string, number>()
      for (const assignment of schedule.assignments) {
        counts.set(
          assignment.personId,
          (counts.get(assignment.personId) ?? 0) + 1,
        )
      }

      const freeCount =
        FALLBACK_HOUSEHOLD.people.length -
        [...counts.keys()].filter((id) => (counts.get(id) ?? 0) > 0).length
      expect(freeCount).toBe(1)
      expect(Math.max(0, ...counts.values())).toBe(1)
    }
  })

  it('stacks cardboard ahead of other side chores when holidays force doubles', () => {
    // Leave only 4 people home while 5 chores are due on an even week
    // (baths, kitchen, hallway, pag).
    const away = {
      'person-5': [
        { id: 'h1', name: 'Trip', from: '2026-07-20', until: '2026-07-27' },
      ],
      'person-6': [
        { id: 'h2', name: 'Trip', from: '2026-07-20', until: '2026-07-27' },
      ],
    }
    const schedule = scheduleWeek(FALLBACK_HOUSEHOLD, away, '2026-W30')
    const counts = new Map<string, number>()
    const choresByPerson = new Map<string, string[]>()
    for (const assignment of schedule.assignments) {
      counts.set(
        assignment.personId,
        (counts.get(assignment.personId) ?? 0) + 1,
      )
      const list = choresByPerson.get(assignment.personId) ?? []
      list.push(assignment.choreId)
      choresByPerson.set(assignment.personId, list)
    }

    expect(Math.max(...counts.values())).toBe(2)
    const doubled = [...choresByPerson.entries()].find(
      ([, chores]) => chores.length === 2,
    )
    expect(doubled).toBeTruthy()
    // Even week stackable biweekly is cardboard (paired with hallway).
    expect(doubled![1]).toContain('cardboard')
  })

  it('rotates chore-free weeks evenly when everyone is home', () => {
    const freeCounts = new Map(
      FALLBACK_HOUSEHOLD.people.map((person) => [person.id, 0]),
    )
    const start = '2026-W30'
    const weeks = 24

    for (let index = 0; index < weeks; index += 1) {
      const weekKey = addWeeks(start, index)
      const schedule = scheduleWeek(FALLBACK_HOUSEHOLD, EMPTY_AWAY, weekKey)
      const assigned = new Set(
        schedule.assignments.map((assignment) => assignment.personId),
      )

      for (const person of FALLBACK_HOUSEHOLD.people) {
        if (!assigned.has(person.id)) {
          freeCounts.set(person.id, (freeCounts.get(person.id) ?? 0) + 1)
        }
      }
    }

    const counts = [...freeCounts.values()]
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1)
    // One free person per week when all six are home.
    expect(counts.reduce((sum, count) => sum + count, 0)).toBe(weeks)
  })

  it('gives each person one free week and one cardboard/towel week every six weeks', () => {
    const start = '2026-W30'
    const freeCounts = new Map(
      FALLBACK_HOUSEHOLD.people.map((person) => [person.id, 0]),
    )
    const lightCounts = new Map(
      FALLBACK_HOUSEHOLD.people.map((person) => [person.id, 0]),
    )

    for (let index = 0; index < 6; index += 1) {
      const weekKey = addWeeks(start, index)
      const schedule = scheduleWeek(FALLBACK_HOUSEHOLD, EMPTY_AWAY, weekKey)
      const assigned = new Set(
        schedule.assignments.map((assignment) => assignment.personId),
      )

      for (const person of FALLBACK_HOUSEHOLD.people) {
        if (!assigned.has(person.id)) {
          freeCounts.set(person.id, (freeCounts.get(person.id) ?? 0) + 1)
        }
      }

      for (const assignment of schedule.assignments) {
        if (
          assignment.choreId === 'cardboard' ||
          assignment.choreId === 'towels'
        ) {
          lightCounts.set(
            assignment.personId,
            (lightCounts.get(assignment.personId) ?? 0) + 1,
          )
        }
      }
    }

    for (const person of FALLBACK_HOUSEHOLD.people) {
      expect(freeCounts.get(person.id)).toBe(1)
      expect(lightCounts.get(person.id)).toBe(1)
    }
  })

  it('keeps weekly non-zone chore totals roughly even over a six-week window', () => {
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
    // Heavy-exclusion reshapes the candidate pool, so exact equality is not required.
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(2)
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
