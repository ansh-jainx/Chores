import { describe, expect, it } from 'vitest'

import type {
  Assignment,
  AwayMap,
  Chore,
  WeekAssignmentOverride,
  WeekOverrideMap,
  WeekSchedule,
} from '../types'
import { FALLBACK_HOUSEHOLD } from './defaults'
import { choresDueInWeek, isAway, peoplePresent, scheduleWeek } from './scheduler'
import { addWeeks, toWeekKey } from './weeks'

const WEEK_KEYS = [
  '2026-W30',
  '2026-W31',
  '2026-W32',
  '2026-W33',
  '2026-W34',
  '2026-W35',
] as const
const SEEDED_WEEK_KEYS = ['2026-W30', '2026-W31'] as const
const AUTO_WEEK_KEYS = Array.from({ length: 10 }, (_, index) =>
  addWeeks('2026-W32', index),
)
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

function lockSchedule(schedule: WeekSchedule): WeekAssignmentOverride {
  const override: WeekAssignmentOverride = {}
  const counts = new Map<string, number>()

  for (const assignment of schedule.assignments) {
    override[assignment.choreId] = assignment.personId
    counts.set(assignment.personId, (counts.get(assignment.personId) ?? 0) + 1)
  }

  expect(Math.max(0, ...counts.values())).toBe(1)

  return override
}

function seededOverrides(away: AwayMap = EMPTY_AWAY): WeekOverrideMap {
  const overrides: WeekOverrideMap = {}

  for (const weekKey of SEEDED_WEEK_KEYS) {
    overrides[weekKey] = lockSchedule(scheduleWeek(FALLBACK_HOUSEHOLD, away, weekKey))
  }

  return overrides
}

function expectExactlyOneFreePerson(schedule: WeekSchedule): void {
  const assigned = new Set(schedule.assignments.map((assignment) => assignment.personId))

  expect(FALLBACK_HOUSEHOLD.people.length - assigned.size).toBe(1)
  expect(schedule.assignments).toHaveLength(assigned.size)
}

function expectNoConsecutiveNonLightAssignees(
  schedules: WeekSchedule[],
  chorePredicate: (chore: Chore) => boolean,
): void {
  const lastAssignee = new Map<string, string>()

  for (const schedule of schedules) {
    for (const assignment of schedule.assignments) {
      const chore = choreById.get(assignment.choreId)
      if (chore === undefined || !chorePredicate(chore)) {
        continue
      }

      const previous = lastAssignee.get(assignment.choreId)
      expect(
        previous,
        `${assignment.choreId} stuck on ${assignment.personId} at ${schedule.weekKey}`,
      ).not.toBe(assignment.personId)
      lastAssignee.set(assignment.choreId, assignment.personId)
    }
  }
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
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(2)
    // One free person per week when all six are home.
    expect(counts.reduce((sum, count) => sum + count, 0)).toBe(weeks)
  })

  it('keeps the weighted load within 8 points over three years', () => {
    const weights = { heavy: 3, medium: 2, light: 1 } as const
    const load = new Map(
      FALLBACK_HOUSEHOLD.people.map((person) => [person.id, 0]),
    )

    for (let index = 0; index < 156; index += 1) {
      const schedule = scheduleWeek(
        FALLBACK_HOUSEHOLD,
        EMPTY_AWAY,
        addWeeks('2026-W30', index),
      )
      for (const assignment of schedule.assignments) {
        load.set(
          assignment.personId,
          (load.get(assignment.personId) ?? 0) + weights[assignment.effort],
        )
      }
    }

    const totals = [...load.values()]
    expect(Math.max(...totals) - Math.min(...totals)).toBeLessThanOrEqual(8)
  })

  it('spreads kitchen and bathrooms across 1 Nov–5 Dec without back-to-back repeats', () => {
    const first = toWeekKey(new Date('2026-11-01T00:00:00Z'))
    const last = toWeekKey(new Date('2026-12-05T00:00:00Z'))
    const heavyIds = ['kitchen', 'bath-up', 'bath-down', 'hallway']
    const counts = new Map(
      heavyIds.map((choreId) => [
        choreId,
        new Map(FALLBACK_HOUSEHOLD.people.map((person) => [person.id, 0])),
      ]),
    )
    const previous = new Map<string, string>()

    for (let weekKey = first; ; weekKey = addWeeks(weekKey, 1)) {
      const schedule = scheduleWeek(FALLBACK_HOUSEHOLD, EMPTY_AWAY, weekKey)
      for (const assignment of schedule.assignments) {
        if (!counts.has(assignment.choreId)) continue
        expect(previous.get(assignment.choreId)).not.toBe(assignment.personId)
        previous.set(assignment.choreId, assignment.personId)
        const choreCounts = counts.get(assignment.choreId)!
        choreCounts.set(
          assignment.personId,
          (choreCounts.get(assignment.personId) ?? 0) + 1,
        )
      }
      if (weekKey === last) break
    }

    const spread = (choreId: string, people: string[]) => {
      const values = people.map((personId) => counts.get(choreId)?.get(personId) ?? 0)
      return Math.max(...values) - Math.min(...values)
    }
    const upstairs = FALLBACK_HOUSEHOLD.people
      .filter((person) => person.bathZone === 'up')
      .map((person) => person.id)
    const downstairs = FALLBACK_HOUSEHOLD.people
      .filter((person) => person.bathZone === 'down')
      .map((person) => person.id)

    expect(spread('kitchen', FALLBACK_HOUSEHOLD.people.map((person) => person.id))).toBeLessThanOrEqual(1)
    expect(spread('bath-up', upstairs)).toBeLessThanOrEqual(1)
    expect(spread('bath-down', downstairs)).toBeLessThanOrEqual(1)
    expect(spread('hallway', FALLBACK_HOUSEHOLD.people.map((person) => person.id))).toBeLessThanOrEqual(1)
  })

  it('shares 2027 chores evenly, including the biweekly ones', () => {
    const weights = { heavy: 3, medium: 2, light: 1 } as const
    const load = new Map(
      FALLBACK_HOUSEHOLD.people.map((person) => [person.id, 0]),
    )
    const nonZone = ['kitchen', 'hallway', 'towels', 'cardboard', 'pag']
    const counts = new Map(
      nonZone.map((choreId) => [
        choreId,
        new Map(FALLBACK_HOUSEHOLD.people.map((person) => [person.id, 0])),
      ]),
    )

    for (let week = 1; week <= 52; week += 1) {
      const weekKey = `2027-W${String(week).padStart(2, '0')}`
      const schedule = scheduleWeek(FALLBACK_HOUSEHOLD, EMPTY_AWAY, weekKey)
      for (const assignment of schedule.assignments) {
        load.set(
          assignment.personId,
          (load.get(assignment.personId) ?? 0) + weights[assignment.effort],
        )
        counts
          .get(assignment.choreId)
          ?.set(
            assignment.personId,
            (counts.get(assignment.choreId)?.get(assignment.personId) ?? 0) + 1,
          )
      }
    }

    const totals = [...load.values()]
    expect(Math.max(...totals) - Math.min(...totals)).toBeLessThanOrEqual(6)
    for (const choreCounts of counts.values()) {
      const values = [...choreCounts.values()]
      expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(2)
    }
  })

  it('keeps free weeks from bunching while big chores stay shared', () => {
    const weeks = 156
    const assignedByWeek: Array<Set<string>> = []

    for (let index = 0; index < weeks; index += 1) {
      const schedule = scheduleWeek(
        FALLBACK_HOUSEHOLD,
        EMPTY_AWAY,
        addWeeks('2026-W30', index),
      )
      assignedByWeek.push(
        new Set(schedule.assignments.map((assignment) => assignment.personId)),
      )
    }

    for (let start = 0; start + 6 <= weeks; start += 1) {
      for (const person of FALLBACK_HOUSEHOLD.people) {
        let free = 0
        for (let offset = 0; offset < 6; offset += 1) {
          if (!assignedByWeek[start + offset].has(person.id)) {
            free += 1
          }
        }
        expect(free).toBeLessThanOrEqual(2)
      }
    }

    const totals = FALLBACK_HOUSEHOLD.people.map((person) => {
      let free = 0
      for (const assigned of assignedByWeek) {
        if (!assigned.has(person.id)) free += 1
      }
      return free
    })
    expect(Math.max(...totals) - Math.min(...totals)).toBeLessThanOrEqual(2)
  })

  it('does not repeat any chore for the same person on the next occurrence', () => {
    const lastAssignee = new Map<string, string>()

    for (let index = 0; index < 156; index += 1) {
      const weekKey = addWeeks('2026-W30', index)
      const schedule = scheduleWeek(FALLBACK_HOUSEHOLD, EMPTY_AWAY, weekKey)
      for (const assignment of schedule.assignments) {
        expect(
          lastAssignee.get(assignment.choreId),
          `${assignment.choreId} stuck on ${assignment.personId} at ${weekKey}`,
        ).not.toBe(assignment.personId)
        lastAssignee.set(assignment.choreId, assignment.personId)
      }
    }
  })

  it('does not assign the same non-light chore to the same person on consecutive occurrences', () => {
    const start = '2026-W30'
    const weeks = 24
    const lastAssignee = new Map<string, string>()

    for (let index = 0; index < weeks; index += 1) {
      const weekKey = addWeeks(start, index)
      const schedule = scheduleWeek(FALLBACK_HOUSEHOLD, EMPTY_AWAY, weekKey)

      for (const assignment of schedule.assignments) {
        const chore = choreById.get(assignment.choreId)
        if (
          chore === undefined ||
          chore.id === 'cardboard' ||
          chore.id === 'towels'
        ) {
          continue
        }

        const previous = lastAssignee.get(assignment.choreId)
        expect(
          previous,
          `${assignment.choreId} stuck on ${assignment.personId} at ${weekKey}`,
        ).not.toBe(assignment.personId)
        lastAssignee.set(assignment.choreId, assignment.personId)
      }
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

      const downstairsIds = new Set(
        FALLBACK_HOUSEHOLD.chores
          .filter((chore) => chore.zone === 'down')
          .map((chore) => chore.id),
      )
      for (const assignment of schedule.assignments.filter((item) =>
        downstairsIds.has(item.choreId),
      )) {
        expect(peopleById.get(assignment.personId)?.bathZone).toBe('down')
      }
    }
  })

  it('keeps holiday weeks fully assigned without repeating baths or kitchen', () => {
    const away = {
      'person-2': [
        { id: 'p2', name: 'Trip', from: '2026-09-07', until: '2026-09-21' },
      ],
      'person-5': [
        { id: 'p5', name: 'Trip', from: '2026-10-05', until: '2026-10-26' },
      ],
    }
    const watched = new Set(['bath-up', 'bath-down', 'kitchen'])
    const previous = new Map<string, string>()

    for (let index = 0; index < 26; index += 1) {
      const weekKey = addWeeks('2026-W30', index)
      const schedule = scheduleWeek(FALLBACK_HOUSEHOLD, away, weekKey)
      const dueIds = choresDueInWeek(FALLBACK_HOUSEHOLD, weekKey).map(
        (chore) => chore.id,
      )

      expect(schedule.assignments.map((item) => item.choreId).sort()).toEqual(
        [...dueIds].sort(),
      )

      for (const assignment of schedule.assignments) {
        expect(isAway(away, assignment.personId, weekKey)).toBe(false)
        if (!watched.has(assignment.choreId)) {
          continue
        }
        const eligible = peoplePresent(FALLBACK_HOUSEHOLD, away, weekKey).filter(
          (person) => {
            const chore = choreById.get(assignment.choreId)
            return chore?.zone === undefined || person.bathZone === chore.zone
          },
        )
        if (eligible.length > 1) {
          expect(previous.get(assignment.choreId)).not.toBe(assignment.personId)
        }
        previous.set(assignment.choreId, assignment.personId)
      }
    }
  })

  it('continues the free-week rotation from locked history', () => {
    const nextInZone: Record<string, string> = {
      'person-1': 'person-3',
      'person-3': 'person-5',
      'person-5': 'person-1',
      'person-2': 'person-4',
      'person-4': 'person-6',
      'person-6': 'person-2',
    }
    const overrides: WeekOverrideMap = {}
    const freeInLocked = new Set<string>()

    for (const weekKey of SEEDED_WEEK_KEYS) {
      const auto = scheduleWeek(FALLBACK_HOUSEHOLD, EMPTY_AWAY, weekKey)
      overrides[weekKey] = Object.fromEntries(
        auto.assignments.map((item) => [item.choreId, nextInZone[item.personId]]),
      )
      const assigned = new Set(Object.values(overrides[weekKey]))
      for (const person of FALLBACK_HOUSEHOLD.people) {
        if (!assigned.has(person.id)) {
          freeInLocked.add(person.id)
        }
      }
    }

    const locked = SEEDED_WEEK_KEYS.map((weekKey) =>
      scheduleWeek(FALLBACK_HOUSEHOLD, EMPTY_AWAY, weekKey, { overrides }),
    )
    for (const [index, weekKey] of SEEDED_WEEK_KEYS.entries()) {
      expect(
        Object.fromEntries(
          locked[index].assignments.map((item) => [item.choreId, item.personId]),
        ),
      ).toEqual(overrides[weekKey])
    }

    const next = scheduleWeek(FALLBACK_HOUSEHOLD, EMPTY_AWAY, '2026-W32', {
      overrides,
    })
    const free = FALLBACK_HOUSEHOLD.people.find(
      (person) => !next.assignments.some((item) => item.personId === person.id),
    )
    expect(freeInLocked.has(free?.id ?? '')).toBe(false)

    const previous = locked[1]
    for (const choreId of ['kitchen', 'bath-up', 'bath-down']) {
      expect(next.assignments.find((item) => item.choreId === choreId)?.personId).not.toBe(
        previous.assignments.find((item) => item.choreId === choreId)?.personId,
      )
    }
  })

  it('keeps auto-week free slots and non-light rotations after two locked seed weeks', () => {
    const overrides = seededOverrides()
    const schedules = [...SEEDED_WEEK_KEYS, ...AUTO_WEEK_KEYS].map((weekKey) =>
      scheduleWeek(FALLBACK_HOUSEHOLD, EMPTY_AWAY, weekKey, { overrides }),
    )

    for (const schedule of schedules.filter((item) =>
      AUTO_WEEK_KEYS.includes(item.weekKey),
    )) {
      expectExactlyOneFreePerson(schedule)
    }

    expectNoConsecutiveNonLightAssignees(
      schedules,
      (chore) => chore.effort !== 'light',
    )
  })

  it('uses only present people for auto weeks after locked seeds when a holiday removes someone', () => {
    const away = {
      'person-2': [
        {
          id: 'person-2-w33',
          name: 'W33 holiday',
          from: '2026-08-10',
          until: '2026-08-14',
        },
      ],
    }
    const overrides = seededOverrides(away)

    for (const weekKey of AUTO_WEEK_KEYS) {
      const presentIds = new Set(
        peoplePresent(FALLBACK_HOUSEHOLD, away, weekKey).map((person) => person.id),
      )
      const schedule = scheduleWeek(FALLBACK_HOUSEHOLD, away, weekKey, { overrides })

      expect(presentIds.has('person-2')).toBe(weekKey !== '2026-W33')
      for (const assignment of schedule.assignments) {
        expect(presentIds.has(assignment.personId)).toBe(true)
      }
    }
  })
})
