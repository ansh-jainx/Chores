import type {
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
  parseIsoDate,
  weekOrdinal,
  weekStartDate,
} from './weeks'

type ScheduleOptions = {
  /** Locked weeks (seed / manual). Used as assignments and as rotation history. */
  overrides?: WeekOverrideMap
}

/** First week the shared rota is simulated from when nothing earlier is locked. */
const ROTA_EPOCH = '2026-W30'

const NEVER = Number.NEGATIVE_INFINITY
const ZONE_PENALTY = 1_000_000
const REPEAT_PENALTY = 10_000
const MAX_EXHAUSTIVE = 7
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

const EFFORT_RANK: Record<Effort, number> = {
  heavy: 0,
  medium: 1,
  light: 2,
}

type History = {
  lastFree: Map<string, number>
  lastDid: Map<string, Map<string, number>>
  prevAssignee: Map<string, string>
}

type CacheEntry = {
  origin: string
  throughKey: string | null
  weeks: Map<string, WeekSchedule>
  history: History
}

const cache = new WeakMap<Household, WeakMap<AwayMap, Map<object, CacheEntry>>>()
const noOverrides = {}

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

/** Chores that fall on this ISO week (weekly + due biweekly half). */
export function choresDueInWeek(
  household: Household,
  weekKey: string,
): Chore[] {
  return dueChores(household, weekKey)
}

export function scheduleWeek(
  household: Household,
  away: AwayMap,
  weekKey: string,
  options?: ScheduleOptions,
): WeekSchedule {
  const overrides = options?.overrides
  const origin = canonicalStart(overrides)
  if (weekOrdinal(weekKey) < weekOrdinal(origin)) {
    return simulateWeek(household, away, overrides, weekKey, emptyHistory())
  }

  const entry = cacheEntry(household, away, overrides, origin)
  if (!entry.weeks.has(weekKey)) {
    const from = entry.throughKey === null ? origin : addWeeks(entry.throughKey, 1)
    for (const cursor of weeksFromThrough(from, weekKey)) {
      const schedule = simulateWeek(
        household,
        away,
        overrides,
        cursor,
        entry.history,
      )
      entry.weeks.set(cursor, schedule)
      entry.throughKey = cursor
    }
  }

  return entry.weeks.get(weekKey) as WeekSchedule
}

function dueChores(household: Household, weekKey: string): Chore[] {
  // Continuous week count, not the ISO week number: ISO numbering restarts
  // after W52/W53, which would run the same biweekly half twice in a row.
  const weekParity = weekOrdinal(weekKey) % 2
  const biweeklyPhases = new Map<string, number>()
  household.chores
    .filter((chore) => chore.cadence === 'biweekly')
    .forEach((chore, index) => {
      biweeklyPhases.set(chore.id, BIWEEKLY_PAIR_PHASE[chore.id] ?? index % 2)
    })

  return household.chores.filter((chore) => {
    if (chore.cadence !== 'biweekly') {
      return true
    }
    const phase = biweeklyPhases.get(chore.id) ?? 0
    return weekParity === (phase + household.biweeklyParity) % 2
  })
}

function canonicalStart(overrides: WeekOverrideMap | undefined): string {
  let start = ROTA_EPOCH
  if (overrides === undefined) {
    return start
  }

  for (const [weekKey, lock] of Object.entries(overrides)) {
    if (lock === undefined || Object.keys(lock).length === 0) {
      continue
    }
    try {
      if (weekOrdinal(weekKey) < weekOrdinal(start)) {
        start = weekKey
      }
    } catch {
      // Ignore keys that are not ISO weeks.
    }
  }

  return start
}

function cacheEntry(
  household: Household,
  away: AwayMap,
  overrides: WeekOverrideMap | undefined,
  origin: string,
): CacheEntry {
  let byAway = cache.get(household)
  if (byAway === undefined) {
    byAway = new WeakMap()
    cache.set(household, byAway)
  }
  let byOverrides = byAway.get(away)
  if (byOverrides === undefined) {
    byOverrides = new Map()
    byAway.set(away, byOverrides)
  }
  const key = overrides ?? noOverrides
  const found = byOverrides.get(key)
  if (found !== undefined && found.origin === origin) {
    return found
  }
  const created: CacheEntry = {
    origin,
    throughKey: null,
    weeks: new Map(),
    history: emptyHistory(),
  }
  byOverrides.set(key, created)
  return created
}

function emptyHistory(): History {
  return {
    lastFree: new Map(),
    lastDid: new Map(),
    prevAssignee: new Map(),
  }
}

function weeksFromThrough(from: string, to: string): string[] {
  const weeks: string[] = []
  let cursor = from
  const end = weekOrdinal(to)
  while (weekOrdinal(cursor) <= end) {
    weeks.push(cursor)
    cursor = addWeeks(cursor, 1)
  }
  return weeks
}

function simulateWeek(
  household: Household,
  away: AwayMap,
  overrides: WeekOverrideMap | undefined,
  weekKey: string,
  history: History,
): WeekSchedule {
  const lock = overrides?.[weekKey]
  const locked = lock !== undefined && Object.keys(lock).length > 0 ? lock : undefined
  const ordinal = weekOrdinal(weekKey)
  const present = peoplePresent(household, away, weekKey)

  if (locked !== undefined) {
    const schedule = materializeOverride(household, away, weekKey, locked)
    recordHistory(present, schedule.assignments, ordinal, history)
    return schedule
  }

  if (present.length === 0) {
    return { weekKey, assignments: [] }
  }

  const due = dueChores(household, weekKey)
  const freeIds = selectFreePeople(present, due, history)
  const working = present.filter((person) => !freeIds.has(person.id))
  const assignments = assignChores(household, present, working, due, history)
  const schedule = orderedSchedule(household, weekKey, assignments)
  recordHistory(present, schedule.assignments, ordinal, history)
  return schedule
}

function materializeOverride(
  household: Household,
  away: AwayMap,
  weekKey: string,
  override: WeekAssignmentOverride,
): WeekSchedule {
  const peopleById = new Map(household.people.map((person) => [person.id, person]))
  const assignments: Assignment[] = []

  for (const chore of dueChores(household, weekKey)) {
    const personId = override[chore.id]
    const person = personId === undefined ? undefined : peopleById.get(personId)
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
    assignments.push(makeAssignment(chore, person, warnings))
  }

  return orderedSchedule(household, weekKey, assignments)
}

function selectFreePeople(
  present: Person[],
  due: Chore[],
  history: History,
): Set<string> {
  const freeCount = Math.max(0, present.length - due.length)
  const free = new Set<string>()
  if (freeCount === 0) {
    return free
  }

  const neededZones = new Set(
    due.flatMap((chore) => (chore.zone ? [chore.zone] : [])),
  )
  const ordered = [...present].sort(
    (left, right) =>
      (history.lastFree.get(left.id) ?? NEVER) -
        (history.lastFree.get(right.id) ?? NEVER) ||
      present.indexOf(left) - present.indexOf(right),
  )

  for (const person of ordered) {
    if (free.size >= freeCount) {
      break
    }
    const remaining = present.filter(
      (candidate) => candidate !== person && !free.has(candidate.id),
    )
    const coversZones = [...neededZones].every((zone) =>
      remaining.some((candidate) => candidate.bathZone === zone),
    )
    if (coversZones) {
      free.add(person.id)
    }
  }

  return free
}

function assignChores(
  household: Household,
  present: Person[],
  working: Person[],
  due: Chore[],
  history: History,
): Assignment[] {
  if (due.length === 0) {
    return []
  }

  const ranks = rankTable(present, due, history)
  const zoneAvailable = new Set(
    working.flatMap((person) => [person.bathZone]),
  )
  const cost = (person: Person, chore: Chore) =>
    zoneCost(person, chore, zoneAvailable) +
    (history.prevAssignee.get(chore.id) === person.id ? REPEAT_PENALTY : 0) +
    10 * (ranks.get(chore.id)?.get(person.id) ?? 0)

  if (working.length >= due.length) {
    const chosen = cheapestMatching(due, working, cost)
    return due.map((chore, index) =>
      makeAssignment(chore, chosen[index], spillWarnings(chore, chosen[index], present)),
    )
  }

  const byWeight = [...due].sort(
    (left, right) =>
      EFFORT_RANK[choreEffort(left)] - EFFORT_RANK[choreEffort(right)] ||
      household.chores.indexOf(left) - household.chores.indexOf(right),
  )
  const primary = byWeight.slice(0, working.length)
  const extras = byWeight.slice(working.length)
  const primaryZone = new Set(working.map((person) => person.bathZone))
  const primaryCost = (person: Person, chore: Chore) =>
    zoneCost(person, chore, primaryZone) +
    (history.prevAssignee.get(chore.id) === person.id ? REPEAT_PENALTY : 0) +
    10 * (ranks.get(chore.id)?.get(person.id) ?? 0)
  const chosen = cheapestMatching(primary, working, primaryCost)
  const assignments = primary.map((chore, index) =>
    makeAssignment(chore, chosen[index], spillWarnings(chore, chosen[index], present)),
  )
  const effortSoFar = new Map<string, number>()
  const heavySoFar = new Map<string, number>()
  for (const assignment of assignments) {
    effortSoFar.set(
      assignment.personId,
      (effortSoFar.get(assignment.personId) ?? 0) + effortWeight(assignment.effort),
    )
    if (assignment.effort === 'heavy') {
      heavySoFar.set(assignment.personId, 1)
    }
  }

  for (const chore of extras) {
    const person = leastLoaded(present, chore, effortSoFar, heavySoFar, ranks, history)
    const warnings = spillWarnings(chore, person, present)
    if (
      choreEffort(chore) === 'heavy' &&
      (heavySoFar.get(person.id) ?? 0) > 0
    ) {
      warnings.push('Heavy spill: someone already has a big chore this week')
    }
    assignments.push(makeAssignment(chore, person, warnings))
    effortSoFar.set(
      person.id,
      (effortSoFar.get(person.id) ?? 0) + effortWeight(choreEffort(chore)),
    )
    if (choreEffort(chore) === 'heavy') {
      heavySoFar.set(person.id, (heavySoFar.get(person.id) ?? 0) + 1)
    }
  }

  return assignments
}

function zoneCost(person: Person, chore: Chore, availableZones: Set<string>): number {
  if (!chore.zone || person.bathZone === chore.zone) {
    return 0
  }
  if (!availableZones.has(chore.zone)) {
    return 0
  }
  return ZONE_PENALTY
}

function spillWarnings(chore: Chore, person: Person, present: Person[]): string[] {
  if (!chore.zone || person.bathZone === chore.zone) {
    return []
  }
  if (!present.some((candidate) => candidate.bathZone === chore.zone)) {
    return [`Zone spill: no bath-${chore.zone} people home`]
  }
  return [`Free-week spill: bath-${chore.zone} coverage needed from a free person`]
}

function rankTable(
  present: Person[],
  due: Chore[],
  history: History,
): Map<string, Map<string, number>> {
  const table = new Map<string, Map<string, number>>()
  for (const chore of due) {
    const ranks = new Map<string, number>()
    for (const person of present) {
      const mine = history.lastDid.get(person.id)?.get(chore.id) ?? NEVER
      let older = 0
      for (const other of present) {
        if (chore.zone && other.bathZone !== chore.zone) {
          continue
        }
        const theirs = history.lastDid.get(other.id)?.get(chore.id) ?? NEVER
        if (theirs < mine) {
          older += 1
        }
      }
      ranks.set(person.id, older)
    }
    table.set(chore.id, ranks)
  }
  return table
}

function cheapestMatching(
  chores: Chore[],
  working: Person[],
  cost: (person: Person, chore: Chore) => number,
): Person[] {
  if (working.length > MAX_EXHAUSTIVE) {
    return greedyMatching(chores, working, cost)
  }

  const used = new Array<boolean>(working.length).fill(false)
  const chosen: Person[] = []
  let best: Person[] | null = null
  let bestCost = Infinity

  const visit = (slot: number, total: number) => {
    if (total >= bestCost) {
      return
    }
    if (slot === chores.length) {
      bestCost = total
      best = chosen.slice()
      return
    }
    for (let index = 0; index < working.length; index += 1) {
      if (used[index]) {
        continue
      }
      used[index] = true
      chosen.push(working[index])
      visit(slot + 1, total + cost(working[index], chores[slot]))
      chosen.pop()
      used[index] = false
    }
  }

  visit(0, 0)
  return best ?? working.slice(0, chores.length)
}

function greedyMatching(
  chores: Chore[],
  working: Person[],
  cost: (person: Person, chore: Chore) => number,
): Person[] {
  const remaining = [...working]
  const ordered = [...chores].sort(
    (left, right) => Number(Boolean(right.zone)) - Number(Boolean(left.zone)),
  )
  const assigned = new Map<string, Person>()
  for (const chore of ordered) {
    let bestIndex = 0
    let bestCost = Infinity
    for (let index = 0; index < remaining.length; index += 1) {
      const next = cost(remaining[index], chore)
      if (next < bestCost) {
        bestCost = next
        bestIndex = index
      }
    }
    assigned.set(chore.id, remaining.splice(bestIndex, 1)[0])
  }
  return chores.map((chore) => assigned.get(chore.id) as Person)
}

function leastLoaded(
  present: Person[],
  chore: Chore,
  effortSoFar: Map<string, number>,
  heavySoFar: Map<string, number>,
  ranks: Map<string, Map<string, number>>,
  history: History,
): Person {
  const zoneMatch = present.filter(
    (person) => !chore.zone || person.bathZone === chore.zone,
  )
  let candidates = zoneMatch.length > 0 ? zoneMatch : present
  if (choreEffort(chore) === 'heavy') {
    const withoutHeavy = candidates.filter(
      (person) => (heavySoFar.get(person.id) ?? 0) === 0,
    )
    if (withoutHeavy.length > 0) {
      candidates = withoutHeavy
    }
  }

  return [...candidates].sort(
    (left, right) =>
      (effortSoFar.get(left.id) ?? 0) - (effortSoFar.get(right.id) ?? 0) ||
      (ranks.get(chore.id)?.get(left.id) ?? 0) -
        (ranks.get(chore.id)?.get(right.id) ?? 0) ||
      (history.prevAssignee.get(chore.id) === left.id ? 1 : 0) -
        (history.prevAssignee.get(chore.id) === right.id ? 1 : 0) ||
      present.indexOf(left) - present.indexOf(right),
  )[0]
}

function recordHistory(
  present: Person[],
  assignments: Assignment[],
  ordinal: number,
  history: History,
): void {
  const assigned = new Set(assignments.map((assignment) => assignment.personId))
  for (const person of present) {
    if (!assigned.has(person.id)) {
      history.lastFree.set(person.id, ordinal)
    }
  }
  for (const assignment of assignments) {
    let done = history.lastDid.get(assignment.personId)
    if (done === undefined) {
      done = new Map()
      history.lastDid.set(assignment.personId, done)
    }
    done.set(assignment.choreId, ordinal)
    history.prevAssignee.set(assignment.choreId, assignment.personId)
  }
}

function makeAssignment(chore: Chore, person: Person, warnings: string[]): Assignment {
  return {
    choreId: chore.id,
    choreName: chore.name,
    personId: person.id,
    personName: person.name,
    effort: choreEffort(chore),
    ...(warnings.length > 0 ? { warning: warnings.join(' · ') } : {}),
  }
}

function orderedSchedule(
  household: Household,
  weekKey: string,
  assignments: Assignment[],
): WeekSchedule {
  const order = new Map(household.chores.map((chore, index) => [chore.id, index]))
  return {
    weekKey,
    assignments: [...assignments].sort(
      (left, right) =>
        (order.get(left.choreId) ?? 0) - (order.get(right.choreId) ?? 0),
    ),
  }
}

function effortWeight(effort: Effort): number {
  if (effort === 'heavy') {
    return 3
  }
  if (effort === 'medium') {
    return 2
  }
  return 1
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
