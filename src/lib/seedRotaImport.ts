import type {
  Household,
  WeekAssignmentOverride,
  WeekOverrideMap,
} from '../types'
import { parseWeekKey } from './weeks'

export type SeedImportResult =
  | { ok: true; overrides: WeekOverrideMap; warnings: string[] }
  | { ok: false; error: string }

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  )
}

function resolvePersonId(household: Household, token: string): string | null {
  const trimmed = token.trim()
  if (!trimmed) {
    return null
  }

  const byId = household.people.find((person) => person.id === trimmed)
  if (byId) {
    return byId.id
  }

  const lower = trimmed.toLowerCase()
  const byName = household.people.filter(
    (person) => person.name.trim().toLowerCase() === lower,
  )
  if (byName.length === 1) {
    return byName[0].id
  }

  // Allow "Person 1" / "1" / "p1" style shortcuts for Person N.
  const numberMatch = /^(?:person[-\s]*)?(\d+)$/i.exec(trimmed)
  if (numberMatch) {
    const guessed = `person-${numberMatch[1]}`
    if (household.people.some((person) => person.id === guessed)) {
      return guessed
    }
  }

  return null
}

function resolveChoreId(household: Household, token: string): string | null {
  const trimmed = token.trim()
  if (!trimmed) {
    return null
  }

  const byId = household.chores.find((chore) => chore.id === trimmed)
  if (byId) {
    return byId.id
  }

  const lower = trimmed.toLowerCase()
  const byName = household.chores.filter(
    (chore) => chore.name.trim().toLowerCase() === lower,
  )
  if (byName.length === 1) {
    return byName[0].id
  }

  // Common short names from older wheels.
  const aliases: Record<string, string> = {
    bathup: 'bath-up',
    'bath up': 'bath-up',
    upstairs: 'bath-up',
    bathdown: 'bath-down',
    'bath down': 'bath-down',
    downstairs: 'bath-down',
    'p/a/g': 'pag',
    pag: 'pag',
    'pet / alu / glass': 'pag',
  }
  const aliased = aliases[lower]
  if (aliased && household.chores.some((chore) => chore.id === aliased)) {
    return aliased
  }

  return null
}

function parseWeekAssignment(
  household: Household,
  weekKey: string,
  raw: unknown,
  warnings: string[],
): WeekAssignmentOverride | null {
  if (!isPlainObject(raw)) {
    warnings.push(`${weekKey}: expected an object of chore → person`)
    return null
  }

  const draft: WeekAssignmentOverride = {}
  for (const [choreToken, personToken] of Object.entries(raw)) {
    if (typeof personToken !== 'string') {
      warnings.push(`${weekKey}: ignore non-string assignee for "${choreToken}"`)
      continue
    }

    const choreId = resolveChoreId(household, choreToken)
    if (!choreId) {
      warnings.push(`${weekKey}: unknown chore "${choreToken}"`)
      continue
    }

    const personId = resolvePersonId(household, personToken)
    if (!personId) {
      warnings.push(`${weekKey}: unknown person "${personToken}"`)
      continue
    }

    draft[choreId] = personId
  }

  return draft
}

/**
 * Parse pasted history from an older chore wheel.
 * Accepts:
 * - `{ "2026-W28": { "kitchen": "Person 1", ... }, ... }`
 * - chore/person values as ids or display names
 */
export function parseSeedHistoryImport(
  household: Household,
  text: string,
): SeedImportResult {
  const trimmed = text.trim()
  if (!trimmed) {
    return { ok: false, error: 'Paste a JSON object of week → chore → person.' }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed) as unknown
  } catch {
    return {
      ok: false,
      error: 'Could not parse JSON. Paste an object like {"2026-W28":{"kitchen":"Person 1"}}.',
    }
  }

  if (!isPlainObject(parsed)) {
    return { ok: false, error: 'Import root must be a JSON object keyed by week.' }
  }

  const overrides: WeekOverrideMap = {}
  const warnings: string[] = []

  for (const [weekKey, weekValue] of Object.entries(parsed)) {
    try {
      parseWeekKey(weekKey)
    } catch {
      warnings.push(`Skipped invalid week key "${weekKey}"`)
      continue
    }

    const draft = parseWeekAssignment(household, weekKey, weekValue, warnings)
    if (draft === null) {
      continue
    }
    if (Object.keys(draft).length === 0) {
      warnings.push(`${weekKey}: no usable assignments`)
      continue
    }
    overrides[weekKey] = draft
  }

  if (Object.keys(overrides).length === 0) {
    return {
      ok: false,
      error:
        warnings[0] ??
        'No weeks imported. Use ISO week keys (2026-W28) and known chore/person names.',
    }
  }

  return { ok: true, overrides, warnings }
}
