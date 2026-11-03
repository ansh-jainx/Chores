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
import { addDaysToIsoDate, addWeeks, weekOrdinal, weekStartDate } from './weeks'

type ScheduleOptions = {
  overrides?: WeekOverrideMap
}

type State = {
  lastFree: Map<string, number>
  lastDid: Map<string, Map<string, number>>
  /** How many times each person has already done each chore. */
  times: Map<string, Map<string, number>>
  prevAssignee: Map<string, string>
}

type CacheEntry = {
  weeks: Map<string, WeekSchedule>
  anchor: string
  through: string | null
  state: State | null
}

type RankTable = Map<string, Map<string, number>>
type CostFn = (person: Person, chore: Chore) => number

const ROTA_EPOCH = '2026-W30'
const ZONE_PENALTY = 1e6
const REPEAT_PENALTY = 1e4
/** Dominates recency so a heavy chore is not repeated until everyone eligible has had a turn. */
const COUNT_PENALTY = 1_000
const EXHAUSTIVE_LIMIT = 7
const NO_OVERRIDES: WeekOverrideMap = {}

/** Known biweekly pairs share a phase. Other biweekly chores stagger by index. */
const BIWEEKLY_PAIR_PHASE: Record<string, 0 | 1> = {
  hallway: 0,
  cardboard: 0,
  towels: 1,
  pag: 1,
}

const EFFORT_WEIGHT: Record<Effort, number> = { heavy: 3, medium: 2, light: 1 }
const EFFORT_RANK: Record<Effort, number> = { heavy: 0, medium: 1, light: 2 }

const caches = new WeakMap<Household, WeakMap<AwayMap, WeakMap<object, CacheEntry>>>()

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
  if (ranges.length === 0) return 0

  const weekStart = weekStartDate(weekKey)
  let covered = 0
  for (let dayOffset = 0; dayOffset < 7; dayOffset += 1) {
    const day = addDaysToIsoDate(weekStart, dayOffset)
    const next = addDaysToIsoDate(weekStart, dayOffset + 1)
    if (ranges.some((range) => range.from < next && day < range.until)) covered += 1
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
export function choresDueInWeek(household: Household, weekKey: string): Chore[] {
  // ISO week numbers restart after W52/W53; the ordinal does not.
  const weekParity = weekOrdinal(weekKey) % 2
  let biweeklyIndex = 0
  const due: Chore[] = []

  for (const chore of household.chores) {
    if (chore.cadence !== 'biweekly') {
      due.push(chore)
      continue
    }
    const phase = BIWEEKLY_PAIR_PHASE[chore.id] ?? biweeklyIndex % 2
    biweeklyIndex += 1
    if (weekParity === (phase + household.biweeklyParity) % 2) due.push(chore)
  }

  return due
}

export function scheduleWeek(
  household: Household,
  away: AwayMap,
  weekKey: string,
  options?: ScheduleOptions,
): WeekSchedule {
  const overrides = options?.overrides
  const entry = cacheFor(household, away, overrides)
  const cached = entry.weeks.get(weekKey)
  if (cached) return cached

  const target = weekOrdinal(weekKey)
  if (target < weekOrdinal(entry.anchor)) {
    const schedule = simulateWeek(household, away, weekKey, overrides, freshState())
    entry.weeks.set(weekKey, schedule)
    return schedule
  }

  let state: State
  let cursor: string
  if (entry.state === null || entry.through === null) {
    state = freshState()
    cursor = entry.anchor
  } else {
    state = entry.state
    cursor = addWeeks(entry.through, 1)
  }

  while (weekOrdinal(cursor) <= target) {
    const schedule = simulateWeek(household, away, cursor, overrides, state)
    entry.weeks.set(cursor, schedule)
    entry.through = cursor
    entry.state = state
    cursor = addWeeks(cursor, 1)
  }

  const schedule = entry.weeks.get(weekKey)
  if (!schedule) throw new Error(`Missing schedule for ${weekKey}`)
  return schedule
}

function cacheFor(
  household: Household,
  away: AwayMap,
  overrides: WeekOverrideMap | undefined,
): CacheEntry {
  let byAway = caches.get(household)
  if (!byAway) {
    byAway = new WeakMap()
    caches.set(household, byAway)
  }
  let byOverrides = byAway.get(away)
  if (!byOverrides) {
    byOverrides = new WeakMap()
    byAway.set(away, byOverrides)
  }
  const key = overrides ?? NO_OVERRIDES
  let entry = byOverrides.get(key)
  if (!entry) {
    entry = {
      weeks: new Map(),
      anchor: anchorFor(overrides),
      through: null,
      state: null,
    }
    byOverrides.set(key, entry)
  }
  return entry
}

function anchorFor(overrides: WeekOverrideMap | undefined): string {
  let earliest: string | null = null
  let earliestOrdinal = Number.POSITIVE_INFINITY
  for (const [weekKey, override] of Object.entries(overrides ?? {})) {
    // A `{}` entry is not a lock; a blank key must not wipe the week.
    if (Object.keys(override).length === 0) continue
    const ordinal = weekOrdinal(weekKey)
    if (ordinal < earliestOrdinal) {
      earliestOrdinal = ordinal
      earliest = weekKey
    }
  }
  if (earliest === null || earliestOrdinal >= weekOrdinal(ROTA_EPOCH)) return ROTA_EPOCH
  return earliest
}

function freshState(): State {
  return {
    lastFree: new Map(),
    lastDid: new Map(),
    times: new Map(),
    prevAssignee: new Map(),
  }
}

function simulateWeek(
  household: Household,
  away: AwayMap,
  weekKey: string,
  overrides: WeekOverrideMap | undefined,
  state: State,
): WeekSchedule {
  const ordinal = weekOrdinal(weekKey)
  const present = peoplePresent(household, away, weekKey)
  const locked = lockedOverride(overrides, weekKey)
  if (locked) {
    const schedule = materializeOverride(household, away, weekKey, locked)
    record(state, present, schedule.assignments, ordinal)
    return schedule
  }

  const due = choresDueInWeek(household, weekKey)
  if (present.length === 0 || due.length === 0) {
    const schedule = { weekKey, assignments: [] }
    record(state, present, [], ordinal)
    return schedule
  }

  const free = selectFree(household, present, due, state)
  const working = present.filter((person) => !free.has(person.id))
  const ranks = buildRanks(present, due, state)
  const costOf = makeCost(working, state, ranks)
  const assignments =
    working.length >= due.length
      ? spreadAssignments(working, due, costOf, household, present)
      : stackAssignments(present, due, costOf, ranks, household, state)

  const schedule = { weekKey, assignments: sortAssignments(household, assignments) }
  record(state, present, schedule.assignments, ordinal)
  return schedule
}

function lockedOverride(
  overrides: WeekOverrideMap | undefined,
  weekKey: string,
): WeekAssignmentOverride | undefined {
  const override = overrides?.[weekKey]
  if (override === undefined || Object.keys(override).length === 0) return undefined
  return override
}

function materializeOverride(
  household: Household,
  away: AwayMap,
  weekKey: string,
  override: WeekAssignmentOverride,
): WeekSchedule {
  const peopleById = new Map(household.people.map((person) => [person.id, person]))
  const assignments: Assignment[] = []

  for (const chore of choresDueInWeek(household, weekKey)) {
    const personId = override[chore.id]
    if (personId === undefined) continue
    const person = peopleById.get(personId)
    if (person === undefined) continue
    const warnings: string[] = []
    if (isAway(away, person.id, weekKey)) warnings.push('Person is on holiday this week')
    if (chore.zone && person.bathZone !== chore.zone) {
      warnings.push(`Zone spill: ${chore.name} usually needs bath-${chore.zone}`)
    }
    assignments.push(toAssignment(chore, person, joinWarnings(warnings)))
  }

  return { weekKey, assignments: sortAssignments(household, assignments) }
}

function selectFree(
  household: Household,
  present: Person[],
  due: Chore[],
  state: State,
): Set<string> {
  const free = new Set<string>()
  const freeCount = Math.max(0, present.length - due.length)
  if (freeCount === 0) return free

  const seat = new Map(household.people.map((person, index) => [person.id, index]))
  const protectedIds = protectedFromSittingOut(present, due, state)
  const ordered = [...present].sort((left, right) => {
    const leftHeld = protectedIds.has(left.id) ? 1 : 0
    const rightHeld = protectedIds.has(right.id) ? 1 : 0
    if (leftHeld !== rightHeld) return leftHeld - rightHeld
    const leftFree = state.lastFree.get(left.id) ?? Number.NEGATIVE_INFINITY
    const rightFree = state.lastFree.get(right.id) ?? Number.NEGATIVE_INFINITY
    if (leftFree !== rightFree) return leftFree < rightFree ? -1 : 1
    return (seat.get(left.id) ?? 0) - (seat.get(right.id) ?? 0)
  })

  for (const person of ordered) {
    if (free.size >= freeCount) break
    const covered = due.every((chore) => {
      if (!chore.zone) return true
      return present.some(
        (candidate) =>
          candidate.id !== person.id &&
          !free.has(candidate.id) &&
          candidate.bathZone === chore.zone,
      )
    })
    if (covered) free.add(person.id)
  }
  return free
}

/** Person who is the only one at the lowest count for a due heavy chore. */
function protectedFromSittingOut(
  present: Person[],
  due: Chore[],
  state: State,
): Set<string> {
  const held = new Set<string>()
  for (const chore of due) {
    if (choreEffort(chore) !== 'heavy' || !chore.zone) continue
    const eligible = present.filter(
      (person) => !chore.zone || person.bathZone === chore.zone,
    )
    if (eligible.length < 2) continue
    let lowest = Number.POSITIVE_INFINITY
    for (const person of eligible) {
      lowest = Math.min(lowest, timesDone(state, person.id, chore.id))
    }
    const atLowest = eligible.filter(
      (person) => timesDone(state, person.id, chore.id) === lowest,
    )
    if (atLowest.length === 1) held.add(atLowest[0].id)
  }
  return held
}

function spreadAssignments(
  working: Person[],
  due: Chore[],
  costOf: CostFn,
  household: Household,
  present: Person[],
): Assignment[] {
  return assignByMinCost(working, due, costOf, household).map(([chore, person]) =>
    toAssignment(chore, person, zoneSpill(chore, person, present)),
  )
}

function stackAssignments(
  present: Person[],
  due: Chore[],
  costOf: CostFn,
  ranks: RankTable,
  household: Household,
  state: State,
): Assignment[] {
  const choreOrder = new Map(household.chores.map((chore, index) => [chore.id, index]))
  const seat = new Map(household.people.map((person, index) => [person.id, index]))
  const sorted = [...due].sort((left, right) => {
    const effortDelta = EFFORT_RANK[choreEffort(left)] - EFFORT_RANK[choreEffort(right)]
    if (effortDelta !== 0) return effortDelta
    return (choreOrder.get(left.id) ?? 0) - (choreOrder.get(right.id) ?? 0)
  })
  const effort = new Map<string, number>()
  const heavies = new Map<string, number>()
  const assignments: Assignment[] = []

  for (const [chore, person] of assignByMinCost(
    present,
    sorted.slice(0, present.length),
    costOf,
    household,
  )) {
    noteLoad(effort, heavies, person.id, chore)
    assignments.push(toAssignment(chore, person, zoneSpill(chore, person, present)))
  }

  for (const chore of sorted.slice(present.length)) {
    const picked = pickExtra(chore, present, effort, heavies, ranks, seat, state)
    noteLoad(effort, heavies, picked.person.id, chore)
    assignments.push(toAssignment(chore, picked.person, joinWarnings(picked.warnings)))
  }
  return assignments
}

function pickExtra(
  chore: Chore,
  present: Person[],
  effort: Map<string, number>,
  heavies: Map<string, number>,
  ranks: RankTable,
  seat: Map<string, number>,
  state: State,
): { person: Person; warnings: string[] } {
  const warnings: string[] = []
  const zone = chore.zone
  let candidates = zone ? present.filter((person) => person.bathZone === zone) : present
  if (zone && candidates.length === 0) {
    candidates = present
    warnings.push(`Zone spill: no bath-${zone} people home`)
  }
  if (choreEffort(chore) === 'heavy') {
    const open = candidates.filter((person) => (heavies.get(person.id) ?? 0) === 0)
    if (open.length > 0) candidates = open
    else warnings.push('Heavy spill: someone already has a big chore this week')
  }

  let best = candidates[0]
  for (let index = 1; index < candidates.length; index += 1) {
    const person = candidates[index]
    if (stacksBefore(person, best, chore, effort, ranks, seat, state)) best = person
  }
  return { person: best, warnings }
}

function stacksBefore(
  person: Person,
  best: Person,
  chore: Chore,
  effort: Map<string, number>,
  ranks: RankTable,
  seat: Map<string, number>,
  state: State,
): boolean {
  const effortDelta = (effort.get(person.id) ?? 0) - (effort.get(best.id) ?? 0)
  if (effortDelta !== 0) return effortDelta < 0
  const timesDelta =
    timesDone(state, person.id, chore.id) - timesDone(state, best.id, chore.id)
  if (timesDelta !== 0) return timesDelta < 0
  const rankDelta =
    (ranks.get(person.id)?.get(chore.id) ?? 0) - (ranks.get(best.id)?.get(chore.id) ?? 0)
  if (rankDelta !== 0) return rankDelta < 0
  return (seat.get(person.id) ?? 0) < (seat.get(best.id) ?? 0)
}

function assignByMinCost(
  people: Person[],
  chores: Chore[],
  costOf: CostFn,
  household: Household,
): Array<[Chore, Person]> {
  if (chores.length === 0 || people.length === 0) return []
  if (people.length > EXHAUSTIVE_LIMIT) return greedyAssign(people, chores, costOf, household)
  const chosen = bestPermutation(chores.map((chore) => people.map((person) => costOf(person, chore))))
  return chosen.map((personIndex, choreIndex) => [chores[choreIndex], people[personIndex]])
}

function bestPermutation(costs: number[][]): number[] {
  const choreCount = costs.length
  const personCount = costs[0]?.length ?? 0
  const used: boolean[] = Array(personCount).fill(false)
  const current: number[] = Array(choreCount).fill(0)
  let bestCost = Number.POSITIVE_INFINITY
  let best = current.slice()

  const search = (choreIndex: number, total: number): void => {
    if (total >= bestCost) return
    if (choreIndex === choreCount) {
      bestCost = total
      best = current.slice()
      return
    }
    const row = costs[choreIndex]
    for (let personIndex = 0; personIndex < personCount; personIndex += 1) {
      if (used[personIndex]) continue
      used[personIndex] = true
      current[choreIndex] = personIndex
      search(choreIndex + 1, total + row[personIndex])
      used[personIndex] = false
      if (bestCost === 0) return
    }
  }

  search(0, 0)
  return best
}

function greedyAssign(
  people: Person[],
  chores: Chore[],
  costOf: CostFn,
  household: Household,
): Array<[Chore, Person]> {
  const order = new Map(household.chores.map((chore, index) => [chore.id, index]))
  const sorted = [...chores].sort((left, right) => {
    const zoneDelta = Number(right.zone !== undefined) - Number(left.zone !== undefined)
    if (zoneDelta !== 0) return zoneDelta
    const effortDelta = EFFORT_RANK[choreEffort(left)] - EFFORT_RANK[choreEffort(right)]
    if (effortDelta !== 0) return effortDelta
    return (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0)
  })
  const remaining = [...people]
  const pairs: Array<[Chore, Person]> = []
  for (const chore of sorted) {
    let bestIndex = 0
    let bestCost = Number.POSITIVE_INFINITY
    for (let index = 0; index < remaining.length; index += 1) {
      const cost = costOf(remaining[index], chore)
      if (cost < bestCost) {
        bestCost = cost
        bestIndex = index
      }
    }
    pairs.push([chore, remaining[bestIndex]])
    remaining.splice(bestIndex, 1)
  }
  return pairs
}

function makeCost(working: Person[], state: State, ranks: RankTable): CostFn {
  const covered = new Set(working.map((person) => person.bathZone))
  return (person, chore) => {
    let total =
      timesDone(state, person.id, chore.id) * COUNT_PENALTY +
      (ranks.get(person.id)?.get(chore.id) ?? 0) * 10
    if (state.prevAssignee.get(chore.id) === person.id) total += REPEAT_PENALTY
    if (chore.zone && person.bathZone !== chore.zone && covered.has(chore.zone)) {
      total += ZONE_PENALTY
    }
    return total
  }
}

function buildRanks(present: Person[], chores: Chore[], state: State): RankTable {
  const ranks: RankTable = new Map(present.map((person) => [person.id, new Map()]))
  for (const chore of chores) {
    const seen = present.map((person) => lastDid(state, person.id, chore.id))
    for (let index = 0; index < present.length; index += 1) {
      let rank = 0
      for (let other = 0; other < present.length; other += 1) {
        if (chore.zone && present[other].bathZone !== chore.zone) continue
        if (seen[other] < seen[index]) rank += 1
      }
      ranks.get(present[index].id)?.set(chore.id, rank)
    }
  }
  return ranks
}

function lastDid(state: State, personId: string, choreId: string): number {
  return state.lastDid.get(personId)?.get(choreId) ?? Number.NEGATIVE_INFINITY
}

function timesDone(state: State, personId: string, choreId: string): number {
  return state.times.get(personId)?.get(choreId) ?? 0
}

function record(
  state: State,
  present: Person[],
  assignments: Assignment[],
  ordinal: number,
) {
  const assigned = new Set<string>()
  for (const assignment of assignments) {
    assigned.add(assignment.personId)
    let done = state.lastDid.get(assignment.personId)
    if (!done) {
      done = new Map()
      state.lastDid.set(assignment.personId, done)
    }
    done.set(assignment.choreId, ordinal)
    let counts = state.times.get(assignment.personId)
    if (!counts) {
      counts = new Map()
      state.times.set(assignment.personId, counts)
    }
    counts.set(assignment.choreId, (counts.get(assignment.choreId) ?? 0) + 1)
    state.prevAssignee.set(assignment.choreId, assignment.personId)
  }
  for (const person of present) {
    if (!assigned.has(person.id)) state.lastFree.set(person.id, ordinal)
  }
}

function noteLoad(
  effort: Map<string, number>,
  heavies: Map<string, number>,
  personId: string,
  chore: Chore,
) {
  effort.set(personId, (effort.get(personId) ?? 0) + EFFORT_WEIGHT[choreEffort(chore)])
  if (choreEffort(chore) === 'heavy') heavies.set(personId, (heavies.get(personId) ?? 0) + 1)
}

function zoneSpill(chore: Chore, person: Person, present: Person[]): string | undefined {
  if (!chore.zone || person.bathZone === chore.zone) return undefined
  if (present.some((candidate) => candidate.bathZone === chore.zone)) return undefined
  return `Zone spill: no bath-${chore.zone} people home`
}

function toAssignment(chore: Chore, person: Person, warning?: string): Assignment {
  return {
    choreId: chore.id,
    choreName: chore.name,
    personId: person.id,
    personName: person.name,
    effort: choreEffort(chore),
    ...(warning ? { warning } : {}),
  }
}

function sortAssignments(household: Household, assignments: Assignment[]): Assignment[] {
  const order = new Map(household.chores.map((chore, index) => [chore.id, index]))
  assignments.sort(
    (left, right) => (order.get(left.choreId) ?? 0) - (order.get(right.choreId) ?? 0),
  )
  return assignments
}

function joinWarnings(warnings: string[]): string | undefined {
  return warnings.length > 0 ? warnings.join(' · ') : undefined
}
