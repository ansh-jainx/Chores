import type { Assignment, AwayMap, Household } from '../types'
import { isAway, scheduleWeek } from './scheduler'
import { buildPrintCalendar, type PrintWeekRow } from './printCalendar'
import {
  addDaysToIsoDate,
  formatUtcDate,
  parseIsoDate,
  weekKeysOverlappingRange,
  weekStartDate,
} from './weeks'

export type ExportFormat = 'monthly' | 'weekly'

export interface CalendarDayEntry {
  personName: string
  text: string
  kind: 'chore' | 'holiday'
  note?: string
}

export interface CalendarMonth {
  year: number
  month: number
  label: string
  /** Monday-start weeks; each week has 7 date keys (may fall outside month). */
  weeks: string[][]
  entriesByDate: Record<string, CalendarDayEntry[]>
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

const ISO_WEDNESDAY = 3
const ISO_SATURDAY = 6
const ISO_SUNDAY = 7

function isCardboard(assignment: Assignment): boolean {
  return (
    assignment.choreId === 'cardboard' ||
    /cardboard/i.test(assignment.choreName)
  )
}

function dateForIsoWeekday(weekKey: string, isoWeekday: number): string {
  return addDaysToIsoDate(weekStartDate(weekKey), isoWeekday - 1)
}

function pushEntry(
  map: Record<string, CalendarDayEntry[]>,
  date: string,
  entry: CalendarDayEntry,
) {
  const list = map[date] ?? []
  list.push(entry)
  map[date] = list
}

function monthsCoveringRange(
  from: string,
  until: string,
): Array<{ year: number; month: number }> {
  const start = parseIsoDate(from)
  const end = parseIsoDate(until)
  if (end < start) {
    return []
  }

  const startParts = new Date(start)
  let year = startParts.getUTCFullYear()
  let month = startParts.getUTCMonth() + 1
  const endParts = new Date(end)
  const endYear = endParts.getUTCFullYear()
  const endMonth = endParts.getUTCMonth() + 1
  const months: Array<{ year: number; month: number }> = []

  while (year < endYear || (year === endYear && month <= endMonth)) {
    months.push({ year, month })
    month += 1
    if (month > 12) {
      month = 1
      year += 1
    }
    if (months.length > 24) {
      break
    }
  }

  return months
}

function buildMonthGrid(year: number, month: number): string[][] {
  const first = `${year}-${String(month).padStart(2, '0')}-01`
  const firstWeekday = ((new Date(parseIsoDate(first)).getUTCDay() + 6) % 7) + 1
  // Monday=1 ... pad days before month start
  let cursor = addDaysToIsoDate(first, -(firstWeekday - 1))
  const weeks: string[][] = []

  for (let w = 0; w < 6; w += 1) {
    const week: string[] = []
    for (let d = 0; d < 7; d += 1) {
      week.push(cursor)
      cursor = addDaysToIsoDate(cursor, 1)
    }
    weeks.push(week)
    const last = week[6]
    if (last) {
      const lastDate = new Date(parseIsoDate(last))
      if (
        lastDate.getUTCFullYear() > year ||
        (lastDate.getUTCFullYear() === year &&
          lastDate.getUTCMonth() + 1 > month)
      ) {
        break
      }
    }
  }

  return weeks
}

/**
 * Place week's chores onto calendar days:
 * - cardboard → Wednesday (Tue night / Wed morning)
 * - everything else → Saturday and Sunday (weekend chore days)
 */
export function placeWeekAssignmentsOnDays(
  weekKey: string,
  assignments: Assignment[],
  away: AwayMap,
): Record<string, CalendarDayEntry[]> {
  const entries: Record<string, CalendarDayEntry[]> = {}
  const wednesday = dateForIsoWeekday(weekKey, ISO_WEDNESDAY)
  const saturday = dateForIsoWeekday(weekKey, ISO_SATURDAY)
  const sunday = dateForIsoWeekday(weekKey, ISO_SUNDAY)

  for (const assignment of assignments) {
    if (isAway(away, assignment.personId, weekKey)) {
      continue
    }

    if (isCardboard(assignment)) {
      pushEntry(entries, wednesday, {
        personName: assignment.personName,
        text: assignment.choreName,
        kind: 'chore',
        note: 'Tue night / Wed morning',
      })
      continue
    }

    const weekendEntry: CalendarDayEntry = {
      personName: assignment.personName,
      text: assignment.choreName,
      kind: 'chore',
    }
    pushEntry(entries, saturday, weekendEntry)
    pushEntry(entries, sunday, { ...weekendEntry })
  }

  return entries
}

export function buildMonthlyCalendars(
  household: Household,
  away: AwayMap,
  from: string,
  until: string,
): CalendarMonth[] {
  const entriesByDate: Record<string, CalendarDayEntry[]> = {}

  for (const weekKey of weekKeysOverlappingRange(from, until)) {
    const schedule = scheduleWeek(household, away, weekKey)
    const placed = placeWeekAssignmentsOnDays(
      weekKey,
      schedule.assignments,
      away,
    )

    for (const [date, dayEntries] of Object.entries(placed)) {
      if (date < from || date > until) {
        continue
      }
      for (const entry of dayEntries) {
        pushEntry(entriesByDate, date, entry)
      }
    }

    for (const person of household.people) {
      if (!isAway(away, person.id, weekKey)) {
        continue
      }

      const saturday = dateForIsoWeekday(weekKey, ISO_SATURDAY)
      if (saturday < from || saturday > until) {
        continue
      }

      const holidayNames = (away[person.id] ?? [])
        .map((absence) => absence.name.trim())
        .filter((name) => name.length > 0)
      pushEntry(entriesByDate, saturday, {
        personName: person.name,
        text: holidayNames.length > 0 ? holidayNames.join(', ') : 'Holiday',
        kind: 'holiday',
      })
    }
  }

  return monthsCoveringRange(from, until).map(({ year, month }) => ({
    year,
    month,
    label: `${MONTH_NAMES[month - 1]} ${year}`,
    weeks: buildMonthGrid(year, month),
    entriesByDate,
  }))
}

export function buildWeeklyExport(
  household: Household,
  away: AwayMap,
  from: string,
  until: string,
): PrintWeekRow[] {
  const weekKeys = weekKeysOverlappingRange(from, until)
  if (weekKeys.length === 0) {
    return []
  }

  const first = weekKeys[0]
  return buildPrintCalendar(household, away, first, weekKeys.length).filter(
    (row) => weekKeys.includes(row.weekKey),
  )
}

export function defaultExportRange(now = new Date()): {
  from: string
  until: string
} {
  const year = now.getFullYear()
  const month = now.getMonth()
  const from = formatUtcDate(Date.UTC(year, month, 1))
  const until = formatUtcDate(Date.UTC(year, month + 2, 0))
  return { from, until }
}
