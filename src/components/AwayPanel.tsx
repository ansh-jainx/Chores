import { useMemo, useState } from 'react'
import type { Absence, AwayMap, Household } from '../types'
import { AWAY_DAY_THRESHOLD } from '../types'
import { awayDaysInWeek } from '../lib/scheduler'
import {
  addWeeks,
  formatWeekLabel,
  toWeekKey,
} from '../lib/weeks'

interface AwayPanelProps {
  household: Household
  away: AwayMap
  weekKey: string
  onAddAbsence: (
    personId: string,
    name: string,
    from: string,
    until: string,
  ) => void
  onRemoveAbsence: (personId: string, absenceId: string) => void
}

function formatDayLabel(isoDate: string) {
  const [year, month, day] = isoDate.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

function todayIsoDate() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function weeksTouchedByAbsence(absence: Absence): Array<{
  weekKey: string
  days: number
  skipsChores: boolean
}> {
  const startWeek = toWeekKey(new Date(`${absence.from}T00:00:00Z`))
  const endWeek = toWeekKey(new Date(`${absence.until}T00:00:00Z`))
  const results: Array<{ weekKey: string; days: number; skipsChores: boolean }> =
    []
  let cursor = addWeeks(startWeek, -1)
  const last = addWeeks(endWeek, 1)

  while (cursor <= last) {
    const days = awayDaysInWeek({ preview: [absence] }, 'preview', cursor)
    if (days > 0) {
      results.push({
        weekKey: cursor,
        days,
        skipsChores: days >= AWAY_DAY_THRESHOLD,
      })
    }
    cursor = addWeeks(cursor, 1)
    if (results.length > 12) {
      break
    }
  }

  return results
}

export function AwayPanel({
  household,
  away,
  onAddAbsence,
  onRemoveAbsence,
}: AwayPanelProps) {
  const defaultFrom = useMemo(() => todayIsoDate(), [])
  const [personId, setPersonId] = useState(household.people[0]?.id ?? '')
  const [name, setName] = useState('')
  const [from, setFrom] = useState(defaultFrom)
  const [until, setUntil] = useState(defaultFrom)

  const selectedPersonId = household.people.some(
    (person) => person.id === personId,
  )
    ? personId
    : (household.people[0]?.id ?? '')

  const draftAbsence: Absence | null =
    selectedPersonId && from < until
      ? {
          id: 'draft',
          name: name.trim() || 'Holiday',
          from,
          until,
        }
      : null

  const draftWeeks = draftAbsence ? weeksTouchedByAbsence(draftAbsence) : []

  const allHolidays = household.people.flatMap((person) =>
    (away[person.id] ?? []).map((absence) => ({
      person,
      absence,
      weeks: weeksTouchedByAbsence(absence),
    })),
  )

  const canAdd =
    Boolean(selectedPersonId) && from < until && name.trim().length > 0

  return (
    <section className="away-panel" aria-labelledby="away-panel-title">
      <div>
        <h2 id="away-panel-title">Holidays</h2>
        <p>
          Choose who is away, name the trip, and pick dates on the calendar. The
          rota works out which weeks skip chores.
        </p>
      </div>

      {household.people.length === 0 ? (
        <p className="empty-state">
          Add people in setup before planning holidays.
        </p>
      ) : (
        <form
          className="holiday-form"
          onSubmit={(event) => {
            event.preventDefault()
            if (!canAdd) {
              return
            }
            onAddAbsence(selectedPersonId, name, from, until)
            setName('')
          }}
        >
          <label className="field">
            <span>Who</span>
            <select
              value={selectedPersonId}
              onChange={(event) => setPersonId(event.target.value)}
            >
              {household.people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          </label>

          <label className="field field-name">
            <span>Holiday name</span>
            <input
              type="text"
              value={name}
              placeholder="e.g. Summer trip"
              required
              onChange={(event) => setName(event.target.value)}
            />
          </label>

          <label className="field">
            <span>Away from</span>
            <input
              type="date"
              value={from}
              required
              onChange={(event) => setFrom(event.target.value)}
            />
          </label>

          <label className="field">
            <span>Back on</span>
            <input
              type="date"
              value={until}
              required
              onChange={(event) => setUntil(event.target.value)}
            />
          </label>

          <button type="submit" className="primary-button" disabled={!canAdd}>
            Save holiday
          </button>
        </form>
      )}

      {draftAbsence && draftWeeks.length > 0 ? (
        <div className="holiday-preview" aria-live="polite">
          <h3>This trip</h3>
          <ul>
            {draftWeeks.map((entry) => (
              <li key={entry.weekKey}>
                <strong>{formatWeekLabel(entry.weekKey)}</strong>
                <span>
                  {entry.skipsChores ? 'No chores' : 'Still has chores'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <section aria-labelledby="saved-holidays-heading">
        <h3 id="saved-holidays-heading">Saved holidays</h3>
        {allHolidays.length === 0 ? (
          <p className="empty-state">No holidays yet.</p>
        ) : (
          <ul className="absence-list">
            {allHolidays.map(({ person, absence, weeks }) => (
              <li key={`${person.id}-${absence.id}`} className="absence-item">
                <div>
                  <p className="absence-item__eyebrow">{person.name}</p>
                  <strong>{absence.name}</strong>
                  <p className="field-help">
                    {formatDayLabel(absence.from)} → back{' '}
                    {formatDayLabel(absence.until)}
                  </p>
                  <ul className="holiday-week-results">
                    {weeks.map((entry) => (
                      <li key={entry.weekKey}>
                        {formatWeekLabel(entry.weekKey)}:{' '}
                        {entry.skipsChores ? 'no chores' : 'still has chores'}
                      </li>
                    ))}
                  </ul>
                </div>
                <button
                  type="button"
                  className="danger-button"
                  aria-label={`Remove ${absence.name} for ${person.name}`}
                  onClick={() => onRemoveAbsence(person.id, absence.id)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  )
}

export default AwayPanel
