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

export interface PersonChoreDate {
  date: string
  dateLabel: string
  choreName: string
  kind: 'chore' | 'holiday'
  note?: string
}

export interface PersonMonthSchedule {
  personId: string
  personName: string
  items: PersonChoreDate[]
}

export interface MonthlyPersonExport {
  year: number
  month: number
  label: string
  people: PersonMonthSchedule[]
}

export interface DateGridCell {
  text: string
  kind: 'chore' | 'holiday'
  note?: string
}

export interface MonthlyDateGridRow {
  date: string
  dateLabel: string
  /** personId → cell content when they have something that day */
  cells: Record<string, DateGridCell>
}

export interface MonthlyDateGrid {
  year: number
  month: number
  label: string
  people: Array<{ id: string; name: string }>
  rows: MonthlyDateGridRow[]
}

/** Shown on monthly and weekly PDF titles. */
export const WEEKEND_CHORE_NOTE =
  'Weekend chores can be done Fri/Sat/Sun · listed on Saturday · Cardboard Tue night / Wed morning'

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

const SHORT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const ISO_WEDNESDAY = 3
const ISO_SATURDAY = 6

function isCardboard(assignment: Assignment): boolean {
  return (
    assignment.choreId === 'cardboard' ||
    /cardboard/i.test(assignment.choreName)
  )
}

function dateForIsoWeekday(weekKey: string, isoWeekday: number): string {
  return addDaysToIsoDate(weekStartDate(weekKey), isoWeekday - 1)
}

export function formatChoreDateLabel(isoDate: string): string {
  const ms = parseIsoDate(isoDate)
  const date = new Date(ms)
  const dayName = DAY_NAMES[date.getUTCDay()]
  const day = date.getUTCDate()
  const month = SHORT_MONTHS[date.getUTCMonth()]
  return `${dayName} ${day} ${month}`
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

function monthPrefix(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}-`
}

/**
 * Place week's chores onto calendar days:
 * - cardboard → Wednesday (Tue night / Wed morning)
 * - everything else → Saturday once (do anytime Fri/Sat/Sun)
 */
export function placeWeekAssignmentsOnDays(
  weekKey: string,
  assignments: Assignment[],
  away: AwayMap,
): Record<string, Array<Omit<PersonChoreDate, 'date' | 'dateLabel'> & { personId: string; personName: string }>> {
  const entries: Record<
    string,
    Array<
      Omit<PersonChoreDate, 'date' | 'dateLabel'> & {
        personId: string
        personName: string
      }
    >
  > = {}
  const wednesday = dateForIsoWeekday(weekKey, ISO_WEDNESDAY)
  const saturday = dateForIsoWeekday(weekKey, ISO_SATURDAY)

  const push = (
    date: string,
    entry: Omit<PersonChoreDate, 'date' | 'dateLabel'> & {
      personId: string
      personName: string
    },
  ) => {
    const list = entries[date] ?? []
    list.push(entry)
    entries[date] = list
  }

  for (const assignment of assignments) {
    if (isAway(away, assignment.personId, weekKey)) {
      continue
    }

    if (isCardboard(assignment)) {
      push(wednesday, {
        personId: assignment.personId,
        personName: assignment.personName,
        choreName: assignment.choreName,
        kind: 'chore',
        note: 'Tue night / Wed morning',
      })
      continue
    }

    push(saturday, {
      personId: assignment.personId,
      personName: assignment.personName,
      choreName: assignment.choreName,
      kind: 'chore',
    })
  }

  return entries
}

export function buildMonthlyPersonSchedules(
  household: Household,
  away: AwayMap,
  from: string,
  until: string,
): MonthlyPersonExport[] {
  type RawItem = PersonChoreDate & { personId: string }
  const allItems: RawItem[] = []

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
        allItems.push({
          personId: entry.personId,
          date,
          dateLabel: formatChoreDateLabel(date),
          choreName: entry.choreName,
          kind: entry.kind,
          note: entry.note,
        })
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

      allItems.push({
        personId: person.id,
        date: saturday,
        dateLabel: formatChoreDateLabel(saturday),
        choreName:
          holidayNames.length > 0 ? holidayNames.join(', ') : 'Holiday',
        kind: 'holiday',
      })
    }
  }

  allItems.sort((left, right) => {
    if (left.date !== right.date) {
      return left.date < right.date ? -1 : 1
    }
    return left.choreName.localeCompare(right.choreName)
  })

  return monthsCoveringRange(from, until).map(({ year, month }) => {
    const prefix = monthPrefix(year, month)
    const people: PersonMonthSchedule[] = household.people.map((person) => ({
      personId: person.id,
      personName: person.name,
      items: allItems
        .filter(
          (item) => item.personId === person.id && item.date.startsWith(prefix),
        )
        .map(({ date, dateLabel, choreName, kind, note }) => ({
          date,
          dateLabel,
          choreName,
          kind,
          note,
        })),
    }))

    return {
      year,
      month,
      label: `${MONTH_NAMES[month - 1]} ${year}`,
      people,
    }
  })
}

function listDaysInMonth(year: number, month: number): string[] {
  const prefix = monthPrefix(year, month)
  const days: string[] = []
  let cursor = `${prefix}01`

  while (cursor.startsWith(prefix)) {
    days.push(cursor)
    cursor = addDaysToIsoDate(cursor, 1)
  }

  return days
}

/**
 * Full month grid: every calendar day as a row, people as columns.
 * Chore/holiday cells fill only the days they fall on; other days stay blank.
 * One month per page keeps the familiar calendar scan; export range can span
 * multiple months (default ~2).
 */
export function buildMonthlyDateGrids(
  household: Household,
  away: AwayMap,
  from: string,
  until: string,
): MonthlyDateGrid[] {
  return buildMonthlyPersonSchedules(household, away, from, until).map(
    (month) => {
      const rowMap = new Map<string, MonthlyDateGridRow>()

      for (const date of listDaysInMonth(month.year, month.month)) {
        if (date < from || date > until) {
          continue
        }
        rowMap.set(date, {
          date,
          dateLabel: formatChoreDateLabel(date),
          cells: {},
        })
      }

      for (const person of month.people) {
        for (const item of person.items) {
          let row = rowMap.get(item.date)
          if (!row) {
            // Outside the clipped from/until window for this month page.
            continue
          }

          const existing = row.cells[person.personId]
          if (existing) {
            row.cells[person.personId] = {
              text: `${existing.text}; ${item.choreName}`,
              kind:
                existing.kind === 'holiday' || item.kind === 'holiday'
                  ? 'holiday'
                  : 'chore',
              note: existing.note ?? item.note,
            }
          } else {
            row.cells[person.personId] = {
              text: item.choreName,
              kind: item.kind,
              note: item.note,
            }
          }
        }
      }

      const rows = [...rowMap.values()].sort((left, right) =>
        left.date < right.date ? -1 : left.date > right.date ? 1 : 0,
      )

      return {
        year: month.year,
        month: month.month,
        label: month.label,
        people: month.people.map((person) => ({
          id: person.personId,
          name: person.personName,
        })),
        rows,
      }
    },
  )
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
