import { useMemo, useState } from 'react'
import type { Absence, AwayMap, Household } from '../types'
import { AWAY_DAY_THRESHOLD } from '../types'
import { awayDaysInWeek, isAway } from '../lib/scheduler'
import {
  addWeeks,
  formatWeekLabel,
  listUpcomingWeekKeys,
  toWeekKey,
} from '../lib/weeks'

interface AwayPanelProps {
  household: Household
  away: AwayMap
  weekKey: string
  onAddAbsence: (personId: string, from: string, until: string) => void
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

export function AwayPanel({
  household,
  away,
  weekKey,
  onAddAbsence,
  onRemoveAbsence,
}: AwayPanelProps) {
  const previewWeeks = listUpcomingWeekKeys(weekKey, 6)
  const [drafts, setDrafts] = useState<Record<string, { from: string; until: string }>>(
    {},
  )

  const defaultFrom = useMemo(() => {
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }, [])

  return (
    <section className="away-panel" aria-labelledby="away-panel-title">
      <div>
        <h2 id="away-panel-title">Away / holiday</h2>
        <p>
          Add a date range: <strong>from</strong> the first day you are away,{' '}
          <strong>until</strong> the first day you are back. A week counts as away
          only if you miss <strong>{AWAY_DAY_THRESHOLD}+ days</strong> of that
          Mon–Sun week — so a Thu→next-Thu trip skips the first week (4 days) and
          keeps chores in the second (3 days).
        </p>
      </div>

      {household.people.length === 0 ? (
        <p className="empty-state">
          Add people in setup before marking holidays.
        </p>
      ) : null}

      {household.people.map((person) => {
        const absences = away[person.id] ?? []
        const draft = drafts[person.id] ?? {
          from: defaultFrom,
          until: defaultFrom,
        }
        const personHeadingId = `away-person-${person.id}`
        const canAdd = draft.from < draft.until

        return (
          <section
            className="person-away"
            key={person.id}
            aria-labelledby={personHeadingId}
          >
            <h3 id={personHeadingId}>{person.name}</h3>

            <div className="absence-form">
              <label className="field">
                <span>Away from</span>
                <input
                  type="date"
                  value={draft.from}
                  onChange={(event) =>
                    setDrafts((current) => ({
                      ...current,
                      [person.id]: { ...draft, from: event.target.value },
                    }))
                  }
                />
              </label>
              <label className="field">
                <span>Back on</span>
                <input
                  type="date"
                  value={draft.until}
                  onChange={(event) =>
                    setDrafts((current) => ({
                      ...current,
                      [person.id]: { ...draft, until: event.target.value },
                    }))
                  }
                />
              </label>
              <button
                type="button"
                className="primary-button"
                disabled={!canAdd}
                onClick={() => {
                  if (!canAdd) {
                    return
                  }
                  onAddAbsence(person.id, draft.from, draft.until)
                }}
              >
                Add trip
              </button>
            </div>

            {absences.length === 0 ? (
              <p className="empty-state">No holidays saved yet.</p>
            ) : (
              <ul className="absence-list" aria-label={`${person.name} holidays`}>
                {absences.map((absence) => (
                  <li key={absence.id} className="absence-item">
                    <div>
                      <strong>
                        {formatDayLabel(absence.from)} → back{' '}
                        {formatDayLabel(absence.until)}
                      </strong>
                      <AbsenceWeekPreview
                        absence={absence}
                        weeks={previewWeeks}
                      />
                    </div>
                    <button
                      type="button"
                      className="danger-button"
                      aria-label={`Remove holiday for ${person.name}`}
                      onClick={() => onRemoveAbsence(person.id, absence.id)}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="week-impact" aria-label={`${person.name} week impact`}>
              {previewWeeks.map((upcomingWeekKey) => {
                const days = awayDaysInWeek(away, person.id, upcomingWeekKey)
                const skipped = isAway(away, person.id, upcomingWeekKey)
                return (
                  <span
                    key={upcomingWeekKey}
                    className={`week-impact-chip${skipped ? ' is-away' : ''}`}
                  >
                    {formatWeekLabel(upcomingWeekKey)}: {days}d
                    {skipped ? ' · no chores' : ' · chores'}
                  </span>
                )
              })}
            </div>
          </section>
        )
      })}
    </section>
  )
}

function AbsenceWeekPreview({
  absence,
  weeks,
}: {
  absence: Absence
  weeks: string[]
}) {
  const impacted = weeks
    .map((weekKey) => {
      const days = awayDaysInWeek(
        { preview: [absence] },
        'preview',
        weekKey,
      )
      return { weekKey, days, skipped: days >= AWAY_DAY_THRESHOLD }
    })
    .filter((entry) => entry.days > 0)

  if (impacted.length === 0) {
    const startWeek = toWeekKey(new Date(`${absence.from}T00:00:00Z`))
    const nearby = listUpcomingWeekKeys(addWeeks(startWeek, -1), 4)
    const fallback = nearby
      .map((weekKey) => {
        const days = awayDaysInWeek({ preview: [absence] }, 'preview', weekKey)
        return { weekKey, days, skipped: days >= AWAY_DAY_THRESHOLD }
      })
      .filter((entry) => entry.days > 0)

    if (fallback.length === 0) {
      return <p className="field-help">No overlap with nearby weeks.</p>
    }

    return (
      <p className="field-help">
        {fallback
          .map(
            (entry) =>
              `${formatWeekLabel(entry.weekKey)}: ${entry.days} day${entry.days === 1 ? '' : 's'}${entry.skipped ? ' (skip chores)' : ' (still chores)'}`,
          )
          .join(' · ')}
      </p>
    )
  }

  return (
    <p className="field-help">
      {impacted
        .map(
          (entry) =>
            `${formatWeekLabel(entry.weekKey)}: ${entry.days} day${entry.days === 1 ? '' : 's'}${entry.skipped ? ' (skip chores)' : ' (still chores)'}`,
        )
        .join(' · ')}
    </p>
  )
}

export default AwayPanel
