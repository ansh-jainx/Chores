import type {
  Absence,
  Assignment,
  AwayMap,
  Chore,
  Effort,
  Household,
  Person,
  WeekSchedule,
} from '../types'
import { AWAY_DAY_THRESHOLD } from '../types'
import {
  formatUtcDate,
  overlapDaysInWeek,
  parseIsoDate,
  parseWeekKey,
  weekEndExclusiveDate,
  weekOrdinal,
  weekStartDate,
} from './weeks'

const MS_PER_DAY = 24 * 60 * 60 * 1000

const EFFORT_ORDER: Record<Effort, number> = {
  heavy: 0,
  medium: 1,
  light: 2,
}

const EFFORT_WEIGHT: Record<Effort, number> = {
  heavy: 3,
  medium: 2,
  light: 1,
}

export function choreEffort(chore: Chore): Effort {
  return chore.effort ?? 'medium'
}

/** Days this person is away during the ISO week (union of ranges). */
export function awayDaysInWeek(
  away: AwayMap,
  personId: string,
  weekKey: string,
): number {
  const ranges = away[personId] ?? []
  if (ranges.length === 0) {
    return 0
  }

  const weekStart = weekStartDate(weekKey)
  let covered = 0

  for (let dayOffset = 0; dayOffset < 7; dayOffset += 1) {
    const dayKey = addDaysToIsoDate(weekStart, dayOffset)
    const dayEnd = addDaysToIsoDate(weekStart, dayOffset + 1)
    const hit = ranges.some((range) =>
      rangesOverlap(range.from, range.until, dayKey, dayEnd),
    )
    if (hit) {
      covered += 1
    }
  }

  return covered
}

export function isAway(
  away: AwayMap,
  personId: string,
  weekKey: string,
  threshold: number = AWAY_DAY_THRESHOLD,
): boolean {
  return awayDaysInWeek(away, personId, weekKey) >= threshold
}

export function peoplePresent(
  household: Household,
  away: AwayMap,
  weekKey: string,
): Person[] {
  return household.people.filter((person) => !isAway(away, person.id, weekKey))
}

export function scheduleWeek(
  household: Household,
  away: AwayMap,
  weekKey: string,
): WeekSchedule {
  const { week: weekNumber } = parseWeekKey(weekKey)
  const rotationOrdinal = weekOrdinal(weekKey)
  const presentPeople = peoplePresent(household, away, weekKey)
  const hasAwayPeople = presentPeople.length < household.people.length
  const heavyCountByPerson: Map<string, number> = new Map(
    presentPeople.map((person) => [person.id, 0] as const),
  )
  const loadByPerson: Map<string, number> = new Map(
    presentPeople.map((person) => [person.id, 0] as const),
  )
  const assignments: Assignment[] = []

  if (presentPeople.length === 0) {
    return {
      weekKey,
      assignments,
    }
  }

  const biweeklyPhases = new Map<string, number>()
  household.chores
    .filter((chore) => chore.cadence === 'biweekly')
    .forEach((chore, index) => {
      biweeklyPhases.set(chore.id, index % 2)
    })

  const dueChores = household.chores
    .map((chore, choreIndex) => ({ chore, choreIndex }))
    .filter(({ chore }) => {
      if (chore.cadence !== 'biweekly') {
        return true
      }

      // Stagger biweekly chores across alternating weeks so they don't all pile up.
      const phase = biweeklyPhases.get(chore.id) ?? 0
      const targetParity = (phase + household.biweeklyParity) % 2
      return weekNumber % 2 === targetParity
    })
    .sort((left, right) => {
      const effortDelta =
        EFFORT_ORDER[choreEffort(left.chore)] -
        EFFORT_ORDER[choreEffort(right.chore)]
      if (effortDelta !== 0) {
        return effortDelta
      }
      return left.choreIndex - right.choreIndex
    })

  for (const { chore, choreIndex } of dueChores) {
    const effort = choreEffort(chore)
    let candidates = chore.zone
      ? presentPeople.filter((person) => person.bathZone === chore.zone)
      : presentPeople
    const warnings: string[] = []

    if (chore.zone && candidates.length === 0) {
      candidates = presentPeople
      warnings.push(`Zone spill: no bath-${chore.zone} people home`)
    }

    if (effort === 'heavy') {
      const withoutHeavy = candidates.filter(
        (person) => (heavyCountByPerson.get(person.id) ?? 0) === 0,
      )
      if (withoutHeavy.length > 0) {
        candidates = withoutHeavy
      } else {
        warnings.push('Heavy spill: someone already has a big chore this week')
      }
    }

    const rotationSeed = choreIndex + rotationOrdinal
    const person = hasAwayPeople
      ? pickLightestCyclicPerson(candidates, loadByPerson, rotationSeed)
      : pickCyclicPerson(candidates, rotationSeed)

    heavyCountByPerson.set(
      person.id,
      (heavyCountByPerson.get(person.id) ?? 0) + (effort === 'heavy' ? 1 : 0),
    )
    loadByPerson.set(
      person.id,
      (loadByPerson.get(person.id) ?? 0) + EFFORT_WEIGHT[effort],
    )

    assignments.push({
      choreId: chore.id,
      choreName: chore.name,
      personId: person.id,
      personName: person.name,
      effort,
      ...(warnings.length > 0 ? { warning: warnings.join(' · ') } : {}),
    })
  }

  const order = new Map(household.chores.map((chore, index) => [chore.id, index]))
  assignments.sort(
    (left, right) => (order.get(left.choreId) ?? 0) - (order.get(right.choreId) ?? 0),
  )

  return {
    weekKey,
    assignments,
  }
}

/** Convert a legacy whole-week away key into a Mon→next-Mon range. */
export function absenceFromWeekKey(weekKey: string, id = weekKey): Absence {
  return {
    id,
    name: 'Holiday',
    from: weekStartDate(weekKey),
    until: weekEndExclusiveDate(weekKey),
  }
}

export function countRangeDaysInWeek(
  from: string,
  until: string,
  weekKey: string,
): number {
  return overlapDaysInWeek(from, until, weekKey)
}

function rangesOverlap(
  fromA: string,
  untilA: string,
  fromB: string,
  untilB: string,
): boolean {
  return fromA < untilB && fromB < untilA
}

function addDaysToIsoDate(date: string, days: number): string {
  return formatUtcDate(parseIsoDate(date) + days * MS_PER_DAY)
}

function pickCyclicPerson(candidates: Person[], rotationSeed: number): Person {
  if (candidates.length === 0) {
    throw new Error('Cannot choose from an empty candidate list')
  }

  return candidates[positiveModulo(rotationSeed, candidates.length)]
}

function pickLightestCyclicPerson(
  candidates: Person[],
  loadByPerson: Map<string, number>,
  rotationSeed: number,
): Person {
  if (candidates.length === 0) {
    throw new Error('Cannot choose from an empty candidate list')
  }

  const startIndex = positiveModulo(rotationSeed, candidates.length)
  let bestPerson = candidates[startIndex]
  let bestLoad = loadByPerson.get(bestPerson.id) ?? 0

  for (let step = 1; step < candidates.length; step += 1) {
    const candidate = candidates[(startIndex + step) % candidates.length]
    const candidateLoad = loadByPerson.get(candidate.id) ?? 0

    if (candidateLoad < bestLoad) {
      bestPerson = candidate
      bestLoad = candidateLoad
    }
  }

  return bestPerson
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor
}
