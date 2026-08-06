import type {
  Absence,
  Assignment,
  AwayMap,
  Chore,
  Effort,
  Household,
  Person,
  WeekAssignmentOverride,
  WeekOverrideMap,
  WeekSchedule,
} from '../types'
import { AWAY_DAY_THRESHOLD } from '../types'
import {
  addWeeks,
  formatUtcDate,
  overlapDaysInWeek,
  parseIsoDate,
  parseWeekKey,
  weekEndExclusiveDate,
  weekOrdinal,
  weekStartDate,
} from './weeks'

type ScheduleOptions = {
  /**
   * When true (default), avoid giving the same chore to the person who had it
   * on the previous occurrence if another candidate is available.
   */
  avoidConsecutive?: boolean
  /** Locked weeks (seed / manual). Used as assignments and as rotation history. */
  overrides?: WeekOverrideMap
}

/** How far back consecutive-avoidance may recurse when resolving prior weeks. */
const AVOID_LOOKBACK_DEPTH = 64

const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * Known biweekly pairs share a phase so they land on the same week.
 * Unknown biweekly chores still stagger by order.
 */
const BIWEEKLY_PAIR_PHASE: Record<string, 0 | 1> = {
  hallway: 0,
  cardboard: 0,
  towels: 1,
  pag: 1,
}

/**
 * Higher = more preferred as someone's *second* chore = assigned later,
 * after people already have their first chore filled.
 */
const SECOND_CHORE_PREFERENCE: Record<string, number> = {
  cardboard: 100,
  pag: 80,
  towels: 60,
}

/** Light biweekly chores that should rotate one-per-person across a 6-week cycle. */
const LIGHT_SIDE_CHORE_IDS = new Set(['cardboard', 'towels'])

/**
 * Biweekly partners of the light side (hallway with cardboard, pag with towels).
 * Reserved early on a fixed rotating seat so they are not whatever person is
 * left after baths/kitchen fill — which caused consecutive repeats.
 */
const ROTATING_PAIR_CHORE_IDS = new Set(['hallway', 'pag'])

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
  options?: ScheduleOptions,
): WeekSchedule {
  return scheduleWeekInternal(
    household,
    away,
    weekKey,
    options,
    new Map<string, WeekSchedule>(),
    AVOID_LOOKBACK_DEPTH,
  )
}

/** Chores that fall on this ISO week (weekly + due biweekly half). */
export function choresDueInWeek(
  household: Household,
  weekKey: string,
): Chore[] {
  return dueChoreEntries(household, weekKey).map(({ chore }) => chore)
}

function dueChoreEntries(
  household: Household,
  weekKey: string,
): Array<{ chore: Chore; choreIndex: number }> {
  const { week: weekNumber } = parseWeekKey(weekKey)
  const biweeklyPhases = new Map<string, number>()
  household.chores
    .filter((chore) => chore.cadence === 'biweekly')
    .forEach((chore, index) => {
      biweeklyPhases.set(
        chore.id,
        BIWEEKLY_PAIR_PHASE[chore.id] ?? index % 2,
      )
    })

  return household.chores
    .map((chore, choreIndex) => ({ chore, choreIndex }))
    .filter(({ chore }) => {
      if (chore.cadence !== 'biweekly') {
        return true
      }

      const phase = biweeklyPhases.get(chore.id) ?? 0
      const targetParity = (phase + household.biweeklyParity) % 2
      return weekNumber % 2 === targetParity
    })
    .sort((left, right) => {
      const stackDelta =
        assignLaterScore(left.chore) - assignLaterScore(right.chore)
      if (stackDelta !== 0) {
        return stackDelta
      }
      return left.choreIndex - right.choreIndex
    })
}

function materializeOverrideSchedule(
  household: Household,
  away: AwayMap,
  weekKey: string,
  override: WeekAssignmentOverride,
): WeekSchedule {
  const peopleById = new Map(
    household.people.map((person) => [person.id, person]),
  )
  const order = new Map(household.chores.map((chore, index) => [chore.id, index]))
  const assignments: Assignment[] = []

  for (const chore of choresDueInWeek(household, weekKey)) {
    const personId = override[chore.id]
    if (personId === undefined) {
      continue
    }
    const person = peopleById.get(personId)
    if (person === undefined) {
      continue
    }

    const warnings: string[] = []
    if (isAway(away, person.id, weekKey)) {
      warnings.push('Person is on holiday this week')
    }
    if (chore.zone && person.bathZone !== chore.zone) {
      warnings.push(`Zone spill: ${chore.name} usually needs bath-${chore.zone}`)
    }

    assignments.push({
      choreId: chore.id,
      choreName: chore.name,
      personId: person.id,
      personName: person.name,
      effort: choreEffort(chore),
      ...(warnings.length > 0 ? { warning: warnings.join(' · ') } : {}),
    })
  }

  assignments.sort(
    (left, right) => (order.get(left.choreId) ?? 0) - (order.get(right.choreId) ?? 0),
  )

  return { weekKey, assignments }
}

function scheduleWeekInternal(
  household: Household,
  away: AwayMap,
  weekKey: string,
  options: ScheduleOptions | undefined,
  memo: Map<string, WeekSchedule>,
  lookbackDepth: number,
): WeekSchedule {
  const avoidConsecutive =
    options?.avoidConsecutive !== false && lookbackDepth > 0
  const weekOverride = options?.overrides?.[weekKey]
  const memoKey =
    weekOverride !== undefined
      ? `${weekKey}|override|${JSON.stringify(weekOverride)}`
      : `${weekKey}|${avoidConsecutive ? '1' : '0'}`
  const cached = memo.get(memoKey)
  if (cached !== undefined) {
    return cached
  }

  if (weekOverride !== undefined) {
    const locked = materializeOverrideSchedule(
      household,
      away,
      weekKey,
      weekOverride,
    )
    memo.set(memoKey, locked)
    return locked
  }

  const rotationOrdinal = weekOrdinal(weekKey)
  const presentPeople = peoplePresent(household, away, weekKey)
  const heavyCountByPerson: Map<string, number> = new Map(
    presentPeople.map((person) => [person.id, 0] as const),
  )
  const choreCountByPerson: Map<string, number> = new Map(
    presentPeople.map((person) => [person.id, 0] as const),
  )
  const assignments: Assignment[] = []

  if (presentPeople.length === 0) {
    const empty = { weekKey, assignments }
    memo.set(memoKey, empty)
    return empty
  }

  const dueChores = dueChoreEntries(household, weekKey)

  // One free person when people outnumber chores (6 people / 5 chores → 1 free).
  // Free weeks rotate; cardboard/towels also rotate so each person gets one
  // light-side week across a 6-week cycle — without stacking extras on purpose.
  const freePersonIds = selectFreePersonIds(
    presentPeople,
    dueChores.map(({ chore }) => chore),
    rotationOrdinal,
  )
  const workingPeople = presentPeople.filter(
    (person) => !freePersonIds.has(person.id),
  )

  // Who held each due chore on its previous occurrence (week -1 or -2).
  // Seeded override weeks count as history so auto weeks continue from them.
  const previousByChore = avoidConsecutive
    ? previousAssignees(
        household,
        away,
        weekKey,
        dueChores.map(({ chore }) => chore),
        options,
        memo,
        lookbackDepth - 1,
      )
    : new Map<string, string>()

  // Reserve rotating biweekly seats first (light + hallway/pag) so their
  // 6-week cycle is not whatever seat is left after baths/kitchen fill.
  const lightDue = dueChores.filter(({ chore }) => isLightSideChore(chore))
  const pairDue = dueChores.filter(({ chore }) => isRotatingPairChore(chore))
  const remainingDue = dueChores.filter(
    ({ chore }) => !isLightSideChore(chore) && !isRotatingPairChore(chore),
  )
  const orderedDue = [...lightDue, ...pairDue, ...remainingDue]

  for (const { chore, choreIndex } of orderedDue) {
    const effort = choreEffort(chore)
    const warnings: string[] = []
    let candidates = candidatesForChore(
      chore,
      workingPeople,
      presentPeople,
      warnings,
    )

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

    // Prefer people with 0 chores; only stack when everyone eligible already has one.
    const minChores = Math.min(
      ...candidates.map((person) => choreCountByPerson.get(person.id) ?? 0),
    )
    candidates = candidates.filter(
      (person) => (choreCountByPerson.get(person.id) ?? 0) === minChores,
    )

    // Skip last occurrence's assignee when someone else can take it.
    const previousId = previousByChore.get(chore.id)
    if (previousId !== undefined && candidates.length > 1) {
      const withoutPrevious = candidates.filter(
        (person) => person.id !== previousId,
      )
      if (withoutPrevious.length > 0) {
        candidates = withoutPrevious
      }
    }

    // Light = seat+1, hallway/pag = seat+2 (fixed household rotation).
    // Weekly heavies round-robin the remaining candidates with a per-chore cursor.
    let person = isLightSideChore(chore)
      ? pickPreferredPerson(candidates, presentPeople, rotationOrdinal + 1)
      : isRotatingPairChore(chore)
        ? pickPreferredPerson(candidates, presentPeople, rotationOrdinal + 2)
        : pickRoundRobinPerson(
            candidates,
            presentPeople,
            choreRotationCursor(chore, rotationOrdinal, choreIndex),
          )

    // Zone/leftover cases can still force a repeat (e.g. only one bath-down
    // person left). Swap with an earlier assignment when possible so we
    // rotate without creating a second free person.
    if (previousId !== undefined && person.id === previousId) {
      const swapped = stealAssignmentToAvoidRepeat(
        chore,
        previousId,
        assignments,
        household,
        presentPeople,
        heavyCountByPerson,
        choreCountByPerson,
      )
      if (swapped !== undefined) {
        person = swapped
      }
    }

    heavyCountByPerson.set(
      person.id,
      (heavyCountByPerson.get(person.id) ?? 0) + (effort === 'heavy' ? 1 : 0),
    )
    choreCountByPerson.set(
      person.id,
      (choreCountByPerson.get(person.id) ?? 0) + 1,
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

  const result = {
    weekKey,
    assignments,
  }
  memo.set(memoKey, result)
  return result
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

function assignLaterScore(chore: Chore): number {
  const preferred = SECOND_CHORE_PREFERENCE[chore.id]
  if (preferred !== undefined) {
    return preferred
  }

  const effort = choreEffort(chore)
  if (effort === 'heavy') {
    return 0
  }
  if (effort === 'medium') {
    return 40
  }
  return 90
}

function isLightSideChore(chore: Chore): boolean {
  return LIGHT_SIDE_CHORE_IDS.has(chore.id) || /cardboard|towels/i.test(chore.name)
}

function isRotatingPairChore(chore: Chore): boolean {
  return (
    ROTATING_PAIR_CHORE_IDS.has(chore.id) || /hallway|p\/?a\/?g/i.test(chore.name)
  )
}

function personEligibleForChore(person: Person, chore: Chore): boolean {
  return chore.zone === undefined || person.bathZone === chore.zone
}

/**
 * Move an earlier non-light assignment onto `previousId` and return that
 * assignee for the current chore — used when the only eligible seat would
 * otherwise repeat last occurrence.
 */
function stealAssignmentToAvoidRepeat(
  chore: Chore,
  previousId: string,
  assignments: Assignment[],
  household: Household,
  presentPeople: Person[],
  heavyCountByPerson: Map<string, number>,
  choreCountByPerson: Map<string, number>,
): Person | undefined {
  const previousPerson = presentPeople.find((person) => person.id === previousId)
  if (previousPerson === undefined) {
    return undefined
  }

  const choreById = new Map(household.chores.map((item) => [item.id, item]))

  for (let index = assignments.length - 1; index >= 0; index -= 1) {
    const other = assignments[index]
    const otherChore = choreById.get(other.choreId)
    if (otherChore === undefined || isLightSideChore(otherChore)) {
      continue
    }

    const otherPerson = presentPeople.find((person) => person.id === other.personId)
    if (otherPerson === undefined) {
      continue
    }
    if (!personEligibleForChore(otherPerson, chore)) {
      continue
    }
    if (!personEligibleForChore(previousPerson, otherChore)) {
      continue
    }

    // Avoid handing otherPerson two heavies via the swap.
    const choreIsHeavy = choreEffort(chore) === 'heavy'
    const otherIsHeavy = choreEffort(otherChore) === 'heavy'
    if (
      choreIsHeavy &&
      !otherIsHeavy &&
      (heavyCountByPerson.get(otherPerson.id) ?? 0) > 0
    ) {
      continue
    }

    assignments[index] = {
      ...other,
      personId: previousPerson.id,
      personName: previousPerson.name,
    }

    heavyCountByPerson.set(
      otherPerson.id,
      (heavyCountByPerson.get(otherPerson.id) ?? 0) - (otherIsHeavy ? 1 : 0),
    )
    choreCountByPerson.set(
      otherPerson.id,
      (choreCountByPerson.get(otherPerson.id) ?? 0) - 1,
    )
    heavyCountByPerson.set(
      previousPerson.id,
      (heavyCountByPerson.get(previousPerson.id) ?? 0) + (otherIsHeavy ? 1 : 0),
    )
    choreCountByPerson.set(
      previousPerson.id,
      (choreCountByPerson.get(previousPerson.id) ?? 0) + 1,
    )

    return otherPerson
  }

  return undefined
}

/** Week key of the previous occurrence of this chore (weekly −1, biweekly −2). */
function lastOccurrenceWeekKey(weekKey: string, chore: Chore): string {
  return addWeeks(weekKey, chore.cadence === 'biweekly' ? -2 : -1)
}

/**
 * Map choreId → personId from each chore's previous occurrence.
 * Lookback is depth-bounded and memoized; seeded override weeks count.
 */
function previousAssignees(
  household: Household,
  away: AwayMap,
  weekKey: string,
  dueChores: Chore[],
  options: ScheduleOptions | undefined,
  memo: Map<string, WeekSchedule>,
  lookbackDepth: number,
): Map<string, string> {
  const result = new Map<string, string>()
  const choresByPrevWeek = new Map<string, Chore[]>()

  for (const chore of dueChores) {
    const prevKey = lastOccurrenceWeekKey(weekKey, chore)
    const list = choresByPrevWeek.get(prevKey) ?? []
    list.push(chore)
    choresByPrevWeek.set(prevKey, list)
  }

  for (const [prevKey, chores] of choresByPrevWeek) {
    // Shared memo + bounded depth so lookback sees real swaps / seeds without
    // walking the calendar back to year 0.
    const previous = scheduleWeekInternal(
      household,
      away,
      prevKey,
      { ...options, avoidConsecutive: true },
      memo,
      lookbackDepth,
    )
    for (const chore of chores) {
      const assignment = previous.assignments.find(
        (item) => item.choreId === chore.id,
      )
      if (assignment !== undefined) {
        result.set(chore.id, assignment.personId)
      }
    }
  }

  return result
}

/**
 * How many people sit out: natural spare seats only (no intentional stacking).
 * 6 people / 5 chores → 1 free person.
 */
function targetFreeCount(presentCount: number, choreCount: number): number {
  if (presentCount === 0) {
    return 0
  }
  if (choreCount === 0) {
    return presentCount
  }

  return Math.max(0, presentCount - choreCount)
}

/**
 * Choose who gets chore-free weeks. Rotates by week ordinal and skips picks
 * that would leave a required bath zone empty.
 */
function selectFreePersonIds(
  presentPeople: Person[],
  dueChores: Chore[],
  rotationOrdinal: number,
): Set<string> {
  const freeCount = targetFreeCount(presentPeople.length, dueChores.length)
  if (freeCount <= 0) {
    return new Set()
  }

  const needsUp = dueChores.some((chore) => chore.zone === 'up')
  const needsDown = dueChores.some((chore) => chore.zone === 'down')
  const free = new Set<string>()

  for (
    let offset = 0;
    free.size < freeCount && offset < presentPeople.length * 3;
    offset += 1
  ) {
    const candidate =
      presentPeople[positiveModulo(rotationOrdinal + offset, presentPeople.length)]
    if (free.has(candidate.id)) {
      continue
    }

    free.add(candidate.id)
    const remaining = presentPeople.filter((person) => !free.has(person.id))
    const ups = remaining.filter((person) => person.bathZone === 'up').length
    const downs = remaining.filter((person) => person.bathZone === 'down').length

    if ((needsUp && ups === 0) || (needsDown && downs === 0)) {
      free.delete(candidate.id)
    }
  }

  return free
}

function candidatesForChore(
  chore: Chore,
  workingPeople: Person[],
  presentPeople: Person[],
  warnings: string[],
): Person[] {
  const zoneFilter = (people: Person[]) =>
    chore.zone
      ? people.filter((person) => person.bathZone === chore.zone)
      : people

  let candidates = zoneFilter(workingPeople)

  if (chore.zone && candidates.length === 0) {
    candidates = zoneFilter(presentPeople)
    if (candidates.length === 0) {
      candidates = presentPeople
      warnings.push(`Zone spill: no bath-${chore.zone} people home`)
    } else {
      warnings.push(
        `Free-week spill: bath-${chore.zone} coverage needed from a free person`,
      )
    }
  }

  if (candidates.length === 0) {
    candidates = presentPeople
  }

  return candidates
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

/**
 * Weekly chores advance one seat per week; biweekly chores advance one seat
 * per occurrence (every two weeks) so they still cycle through everyone.
 */
function choreRotationCursor(
  chore: Chore,
  rotationOrdinal: number,
  choreSalt: number,
): number {
  if (chore.cadence === 'biweekly') {
    return Math.floor(rotationOrdinal / 2) + choreSalt
  }

  return rotationOrdinal + choreSalt
}

function pickCyclicPerson(candidates: Person[], rotationSeed: number): Person {
  if (candidates.length === 0) {
    throw new Error('Cannot choose from an empty candidate list')
  }

  return candidates[positiveModulo(rotationSeed, candidates.length)]
}

/** Prefer a rotating household seat, then walk until a candidate matches. */
function pickPreferredPerson(
  candidates: Person[],
  presentPeople: Person[],
  preferredIndex: number,
): Person {
  if (candidates.length === 0) {
    throw new Error('Cannot choose from an empty candidate list')
  }
  if (presentPeople.length === 0) {
    return candidates[0]
  }

  for (let offset = 0; offset < presentPeople.length; offset += 1) {
    const preferred =
      presentPeople[positiveModulo(preferredIndex + offset, presentPeople.length)]
    const match = candidates.find((person) => person.id === preferred.id)
    if (match) {
      return match
    }
  }

  return pickCyclicPerson(candidates, preferredIndex)
}

/**
 * Round-robin through candidates in stable household order.
 * Using the live candidate list (not a global pool) means the cursor still
 * advances when someone is free/busy, so consecutive weeks rarely repeat.
 */
function pickRoundRobinPerson(
  candidates: Person[],
  presentPeople: Person[],
  cursor: number,
): Person {
  if (candidates.length === 0) {
    throw new Error('Cannot choose from an empty candidate list')
  }

  const order = new Map(presentPeople.map((person, index) => [person.id, index]))
  const ordered = [...candidates].sort(
    (left, right) =>
      (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0),
  )

  return ordered[positiveModulo(cursor, ordered.length)]
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor
}
