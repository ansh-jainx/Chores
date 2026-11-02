import type {
  AwayMap,
  Household,
  WeekAssignmentOverride,
  WeekOverrideMap,
} from '../types'
import { choresDueInWeek, isAway, scheduleWeek } from './scheduler'
import { formatWeekLabel } from './weeks'

/** Build a week draft from a lock, or from the scheduler using overrides as history. */
export function buildWeekDraft(
  household: Household,
  away: AwayMap,
  weekKey: string,
  overrides: WeekOverrideMap,
): WeekAssignmentOverride {
  const existing = overrides[weekKey]
  if (existing !== undefined) {
    return { ...existing }
  }

  const schedule = scheduleWeek(household, away, weekKey, { overrides })
  const draft: WeekAssignmentOverride = {}
  for (const assignment of schedule.assignments) {
    draft[assignment.choreId] = assignment.personId
  }
  return draft
}

export function validateSeedWeek(
  household: Household,
  away: AwayMap,
  weekKey: string,
  draft: WeekAssignmentOverride,
): string | null {
  const due = choresDueInWeek(household, weekKey)

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
  }

  return null
}
