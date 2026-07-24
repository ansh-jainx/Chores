import type {
  Absence,
  AwayMap,
  BathZone,
  Cadence,
  Chore,
  CompletionMap,
  Effort,
  Household,
  PersistedState,
  Person,
} from '../types'
import { weekEndExclusiveDate, weekStartDate } from './weeks'

const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  )
}

function isPlainArray(value: unknown): value is unknown[] {
  return Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype
}

function hasUnsafeOwnKey(value: Record<string, unknown> | unknown[]): boolean {
  return Object.keys(value).some((key) => UNSAFE_KEYS.has(key))
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function isBathZone(value: unknown): value is BathZone {
  return value === 'up' || value === 'down'
}

function isCadence(value: unknown): value is Cadence {
  return value === 'weekly' || value === 'biweekly'
}

function isEffort(value: unknown): value is Effort {
  return value === 'heavy' || value === 'medium' || value === 'light'
}

function parsePerson(value: unknown): Person | null {
  if (!isPlainObject(value) || hasUnsafeOwnKey(value)) {
    return null
  }

  if (
    !hasOwn(value, 'id') ||
    typeof value.id !== 'string' ||
    UNSAFE_KEYS.has(value.id) ||
    !hasOwn(value, 'name') ||
    typeof value.name !== 'string' ||
    !hasOwn(value, 'bathZone') ||
    !isBathZone(value.bathZone)
  ) {
    return null
  }

  return {
    id: value.id,
    name: value.name,
    bathZone: value.bathZone,
  }
}

function parseChore(value: unknown): Chore | null {
  if (!isPlainObject(value) || hasUnsafeOwnKey(value)) {
    return null
  }

  if (
    !hasOwn(value, 'id') ||
    typeof value.id !== 'string' ||
    UNSAFE_KEYS.has(value.id) ||
    !hasOwn(value, 'name') ||
    typeof value.name !== 'string' ||
    !hasOwn(value, 'cadence') ||
    !isCadence(value.cadence)
  ) {
    return null
  }

  let zone: BathZone | undefined
  if (hasOwn(value, 'zone') && value.zone !== undefined) {
    if (!isBathZone(value.zone)) {
      return null
    }
    zone = value.zone
  }

  let effort: Effort | undefined
  if (hasOwn(value, 'effort') && value.effort !== undefined) {
    if (!isEffort(value.effort)) {
      return null
    }
    effort = value.effort
  }

  return {
    id: value.id,
    name: value.name,
    cadence: value.cadence,
    ...(zone ? { zone } : {}),
    ...(effort ? { effort } : {}),
  }
}

function parsePlainArray<T>(
  value: unknown,
  parseItem: (item: unknown) => T | null,
): T[] | null {
  if (!isPlainArray(value) || hasUnsafeOwnKey(value)) {
    return null
  }

  const parsedItems: T[] = []

  for (let index = 0; index < value.length; index += 1) {
    if (!hasOwn(value, String(index))) {
      return null
    }

    const parsedItem = parseItem(value[index])

    if (parsedItem === null) {
      return null
    }

    parsedItems.push(parsedItem)
  }

  return parsedItems
}

function parseHousehold(value: unknown): Household | null {
  if (!isPlainObject(value) || hasUnsafeOwnKey(value)) {
    return null
  }

  if (
    !hasOwn(value, 'people') ||
    !hasOwn(value, 'chores') ||
    !hasOwn(value, 'biweeklyParity')
  ) {
    return null
  }

  const people = parsePlainArray(value.people, parsePerson)
  const chores = parsePlainArray(value.chores, parseChore)

  if (
    people === null ||
    chores === null ||
    (value.biweeklyParity !== 0 && value.biweeklyParity !== 1)
  ) {
    return null
  }

  return {
    people,
    chores,
    biweeklyParity: value.biweeklyParity,
  }
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function isWeekKey(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-W\d{2}$/.test(value)
}

function parseAbsence(value: unknown): Absence | null {
  if (!isPlainObject(value) || hasUnsafeOwnKey(value)) {
    return null
  }

  if (
    !hasOwn(value, 'id') ||
    typeof value.id !== 'string' ||
    UNSAFE_KEYS.has(value.id) ||
    !hasOwn(value, 'from') ||
    !isIsoDate(value.from) ||
    !hasOwn(value, 'until') ||
    !isIsoDate(value.until) ||
    value.until <= value.from
  ) {
    return null
  }

  const name =
    hasOwn(value, 'name') && typeof value.name === 'string' && value.name.trim()
      ? value.name.trim()
      : 'Holiday'

  return {
    id: value.id,
    name,
    from: value.from,
    until: value.until,
  }
}

function parseAway(value: unknown): AwayMap | null {
  if (!isPlainObject(value) || hasUnsafeOwnKey(value)) {
    return null
  }

  const away: AwayMap = {}

  for (const [personId, entries] of Object.entries(value)) {
    if (UNSAFE_KEYS.has(personId)) {
      return null
    }

    if (!isPlainArray(entries) || hasUnsafeOwnKey(entries)) {
      return null
    }

    const absences: Absence[] = []

    for (let index = 0; index < entries.length; index += 1) {
      if (!hasOwn(entries, String(index))) {
        return null
      }

      const entry = entries[index]

      // Legacy: array of ISO week keys → full week ranges.
      if (isWeekKey(entry)) {
        try {
          absences.push({
            id: entry,
            name: 'Holiday',
            from: weekStartDate(entry),
            until: weekEndExclusiveDate(entry),
          })
        } catch {
          return null
        }
        continue
      }

      const absence = parseAbsence(entry)
      if (absence === null) {
        return null
      }
      absences.push(absence)
    }

    away[personId] = absences
  }

  return away
}

function parseCompletions(value: unknown): CompletionMap | null {
  if (value === undefined) {
    return {}
  }

  if (!isPlainObject(value) || hasUnsafeOwnKey(value)) {
    return null
  }

  const completions: CompletionMap = {}

  for (const [weekKey, choreIdsValue] of Object.entries(value)) {
    if (UNSAFE_KEYS.has(weekKey) || !isWeekKey(weekKey)) {
      return null
    }

    if (!isPlainArray(choreIdsValue) || hasUnsafeOwnKey(choreIdsValue)) {
      return null
    }

    const choreIds: string[] = []

    for (let index = 0; index < choreIdsValue.length; index += 1) {
      if (!hasOwn(choreIdsValue, String(index))) {
        return null
      }

      const choreId = choreIdsValue[index]
      if (typeof choreId !== 'string' || UNSAFE_KEYS.has(choreId)) {
        return null
      }
      choreIds.push(choreId)
    }

    completions[weekKey] = choreIds
  }

  return completions
}

export function parsePersistedState(value: unknown): PersistedState | null {
  if (!isPlainObject(value) || hasUnsafeOwnKey(value)) {
    return null
  }

  if (!hasOwn(value, 'household') || !hasOwn(value, 'away')) {
    return null
  }

  const household = parseHousehold(value.household)
  const away = parseAway(value.away)
  const completions = parseCompletions(
    hasOwn(value, 'completions') ? value.completions : undefined,
  )

  if (household === null || away === null || completions === null) {
    return null
  }

  return {
    household,
    away,
    completions,
  }
}
