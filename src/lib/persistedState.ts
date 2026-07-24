import type {
  AwayMap,
  BathZone,
  Cadence,
  Chore,
  Household,
  PersistedState,
  Person,
} from '../types'

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

  if (hasOwn(value, 'zone') && value.zone !== undefined) {
    if (!isBathZone(value.zone)) {
      return null
    }

    return {
      id: value.id,
      name: value.name,
      cadence: value.cadence,
      zone: value.zone,
    }
  }

  return {
    id: value.id,
    name: value.name,
    cadence: value.cadence,
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

function parseAway(value: unknown): AwayMap | null {
  if (!isPlainObject(value) || hasUnsafeOwnKey(value)) {
    return null
  }

  const away: AwayMap = {}

  for (const [personId, weeksValue] of Object.entries(value)) {
    if (UNSAFE_KEYS.has(personId)) {
      return null
    }

    if (!isPlainArray(weeksValue) || hasUnsafeOwnKey(weeksValue)) {
      return null
    }

    const weeks: string[] = []

    for (let index = 0; index < weeksValue.length; index += 1) {
      if (!hasOwn(weeksValue, String(index))) {
        return null
      }

      const week = weeksValue[index]

      if (typeof week !== 'string') {
        return null
      }

      weeks.push(week)
    }

    away[personId] = weeks
  }

  return away
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

  if (household === null || away === null) {
    return null
  }

  return {
    household,
    away,
  }
}
