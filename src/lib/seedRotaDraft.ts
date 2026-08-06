import type {
  AwayMap,
  Household,
  WeekAssignmentOverride,
  WeekOverrideMap,
} from '../types'
import { choresDueInWeek, isAway, scheduleWeek } from './scheduler'
import { addWeeks, formatWeekLabel } from './weeks'

/** Build a week draft from a lock, or from the scheduler using overrides as history. */
export function buildWeekDraft(
  household: Household,
  away: AwayMap,
  weekKey: string,
  overrides: WeekOverrideMap,
  provisionalOverrides: WeekOverrideMap = {},
): WeekAssignmentOverride {
  const mergedOverrides = { ...overrides, ...provisionalOverrides }
  const existing = mergedOverrides[weekKey]
  if (existing !== undefined) {
    return { ...existing }
  }

  const schedule = scheduleWeek(household, away, weekKey, {
    overrides: mergedOverrides,
  })
  const draft: WeekAssignmentOverride = {}
  for (const assignment of schedule.assignments) {
    draft[assignment.choreId] = assignment.personId
  }
  return draft
}

/**
 * Drafts for a seed pair. Week two's auto suggestion includes the current
 * week-one draft as provisional history so edits to week one reshape week two.
 */
export function buildSeedPairDrafts(
  household: Household,
  away: AwayMap,
  startWeek: string,
  overrides: WeekOverrideMap,
  draftOne?: WeekAssignmentOverride,
): { draftOne: WeekAssignmentOverride; draftTwo: WeekAssignmentOverride } {
  const weekTwo = addWeeks(startWeek, 1)
  const one =
    draftOne === undefined
      ? buildWeekDraft(household, away, startWeek, overrides)
      : { ...draftOne }

  const twoLocked = overrides[weekTwo]
  if (twoLocked !== undefined) {
    return { draftOne: one, draftTwo: { ...twoLocked } }
  }

  const two = buildWeekDraft(household, away, weekTwo, overrides, {
    [startWeek]: one,
  })
  return { draftOne: one, draftTwo: two }
}

/** Refresh week-two auto draft after week-one edits (no-op if week two is locked). */
export function refreshWeekTwoDraft(
  household: Household,
  away: AwayMap,
  startWeek: string,
  overrides: WeekOverrideMap,
  draftOne: WeekAssignmentOverride,
): WeekAssignmentOverride | null {
  const weekTwo = addWeeks(startWeek, 1)
  if (overrides[weekTwo] !== undefined) {
    return null
  }

  return buildWeekDraft(household, away, weekTwo, overrides, {
    [startWeek]: draftOne,
  })
}

export function validateSeedWeek(
  household: Household,
  away: AwayMap,
  weekKey: string,
  draft: WeekAssignmentOverride,
): string | null {
  const due = choresDueInWeek(household, weekKey)
  const seen = new Map<string, string>()

  for (const chore of due) {
    const personId = draft[chore.id]
    if (!personId) {
      return `${formatWeekLabel(weekKey)}: pick someone for ${chore.name}.`
    }

    const person = household.people.find((item) => item.id === personId)
    if (!person) {
      return `${formatWeekLabel(weekKey)}: unknown person for ${chore.name}.`
    }

    if (isAway(away, personId, weekKey)) {
      return `${formatWeekLabel(weekKey)}: ${person.name} is on holiday — pick someone else for ${chore.name}, or adjust Holidays.`
    }

    const previousChore = seen.get(personId)
    if (previousChore !== undefined) {
      return `${formatWeekLabel(weekKey)}: ${person.name} is already assigned to ${previousChore}; pick someone else for ${chore.name}.`
    }
    seen.set(personId, chore.name)
  }

  return null
}
