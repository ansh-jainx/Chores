import type { AwayMap, Household, WeekOverrideMap } from '../types'
import { isAway, scheduleWeek } from './scheduler'
import {
  formatWeekLabel,
  listUpcomingWeekKeys,
  overlapDaysInWeek,
} from './weeks'

export const DEFAULT_PRINT_WEEKS = 8

export type PrintCellStatus = 'chores' | 'holiday' | 'empty'

export interface PrintWeekCell {
  status: PrintCellStatus
  choreNames: string[]
  holidayLabel?: string
}

export interface PrintWeekRow {
  weekKey: string
  label: string
  cells: Record<string, PrintWeekCell>
}

function holidayLabelForPerson(
  away: AwayMap,
  personId: string,
  weekKey: string,
): string {
  const names = (away[personId] ?? [])
    .filter((absence) => overlapDaysInWeek(absence.from, absence.until, weekKey) > 0)
    .map((absence) => absence.name.trim())
    .filter((name) => name.length > 0)

  return names.length > 0 ? names.join(', ') : 'Holiday'
}

export function buildPrintCalendar(
  household: Household,
  away: AwayMap,
  fromWeekKey: string,
  weekCount = DEFAULT_PRINT_WEEKS,
  overrides: WeekOverrideMap = {},
): PrintWeekRow[] {
  const weekKeys = listUpcomingWeekKeys(fromWeekKey, weekCount)

  return weekKeys.map((weekKey) => {
    const schedule = scheduleWeek(household, away, weekKey, { overrides })
    const choresByPerson = new Map<string, string[]>()

    for (const assignment of schedule.assignments) {
      const existing = choresByPerson.get(assignment.personId) ?? []
      existing.push(assignment.choreName)
      choresByPerson.set(assignment.personId, existing)
    }

    const cells: Record<string, PrintWeekCell> = {}

    for (const person of household.people) {
      if (isAway(away, person.id, weekKey)) {
        cells[person.id] = {
          status: 'holiday',
          choreNames: [],
          holidayLabel: holidayLabelForPerson(away, person.id, weekKey),
        }
        continue
      }

      const choreNames = choresByPerson.get(person.id) ?? []
      cells[person.id] = {
        status: choreNames.length > 0 ? 'chores' : 'empty',
        choreNames,
      }
    }

    return {
      weekKey,
      label: formatWeekLabel(weekKey),
      cells,
    }
  })
}
