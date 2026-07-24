import { useEffect, useState } from 'react'
import type {
  Assignment,
  AwayMap,
  Effort,
  Household,
  Person,
  WeekSchedule,
} from '../types'
import { scheduleWeek } from '../lib/scheduler'
import { addWeeks, currentWeekKey, formatWeekLabel } from '../lib/weeks'

export interface ThisWeekProps {
  household: Household
  away: AwayMap
  weekKey: string
  onWeekChange?: (weekKey: string) => void
}

const VIEWER_STORAGE_KEY = 'flat-chores-viewer-v1'

const EFFORT_LABEL: Record<Effort, string> = {
  heavy: 'Big',
  medium: 'Medium',
  light: 'Light',
}

function isAway(away: AwayMap, personId: string, weekKey: string) {
  return away[personId]?.includes(weekKey) ?? false
}

function assignmentsForPeople(
  people: Person[],
  assignments: Assignment[],
  away: AwayMap,
  weekKey: string,
) {
  const grouped = new Map<string, Assignment[]>()

  for (const person of people) {
    grouped.set(person.id, [])
  }

  for (const assignment of assignments) {
    if (!isAway(away, assignment.personId, weekKey)) {
      grouped.get(assignment.personId)?.push(assignment)
    }
  }

  return grouped
}

function everyoneIsAway(people: Person[], away: AwayMap, weekKey: string) {
  return (
    people.length > 0 &&
    people.every((person) => isAway(away, person.id, weekKey))
  )
}

function getWeekSchedule(
  household: Household,
  away: AwayMap,
  weekKey: string,
): WeekSchedule {
  if (
    household.people.length === 0 ||
    everyoneIsAway(household.people, away, weekKey)
  ) {
    return {
      weekKey,
      assignments: [],
    }
  }

  return scheduleWeek(household, away, weekKey)
}

function formatAssignmentCount(count: number) {
  return `${count} ${count === 1 ? 'chore' : 'chores'}`
}

function readStoredViewerId(people: Person[]): string {
  if (typeof window === 'undefined' || people.length === 0) {
    return people[0]?.id ?? ''
  }

  try {
    const stored = window.localStorage.getItem(VIEWER_STORAGE_KEY)
    if (stored && people.some((person) => person.id === stored)) {
      return stored
    }
  } catch {
    // Ignore storage failures.
  }

  return people[0]?.id ?? ''
}

export function ThisWeek({
  household,
  away,
  weekKey,
  onWeekChange,
}: ThisWeekProps) {
  const [viewerId, setViewerId] = useState(() =>
    readStoredViewerId(household.people),
  )

  useEffect(() => {
    if (household.people.length === 0) {
      setViewerId('')
      return
    }

    if (!household.people.some((person) => person.id === viewerId)) {
      setViewerId(readStoredViewerId(household.people))
    }
  }, [household.people, viewerId])

  useEffect(() => {
    if (!viewerId || typeof window === 'undefined') {
      return
    }

    try {
      window.localStorage.setItem(VIEWER_STORAGE_KEY, viewerId)
    } catch {
      // Ignore storage failures.
    }
  }, [viewerId])

  const thisWeek = getWeekSchedule(household, away, weekKey)
  const previousWeekKey = addWeeks(weekKey, -1)
  const nextWeekKey = addWeeks(weekKey, 1)
  const todayWeekKey = currentWeekKey()
  const nextWeek = getWeekSchedule(household, away, nextWeekKey)
  const isEveryoneAwayThisWeek = everyoneIsAway(household.people, away, weekKey)

  const thisWeekByPerson = assignmentsForPeople(
    household.people,
    thisWeek.assignments,
    away,
    weekKey,
  )
  const nextWeekByPerson = assignmentsForPeople(
    household.people,
    nextWeek.assignments,
    away,
    nextWeekKey,
  )
  const totalNextWeekAssignments = household.people.reduce(
    (total, person) => total + (nextWeekByPerson.get(person.id)?.length ?? 0),
    0,
  )

  const viewer = household.people.find((person) => person.id === viewerId)
  const viewerAway = viewer ? isAway(away, viewer.id, weekKey) : false
  const myAssignments = viewer ? (thisWeekByPerson.get(viewer.id) ?? []) : []
  const others = household.people.filter((person) => person.id !== viewerId)

  const changeWeek = (newWeekKey: string) => {
    onWeekChange?.(newWeekKey)
  }

  return (
    <section className="this-week" aria-labelledby="this-week-heading">
      <header className="week-nav">
        <button
          type="button"
          onClick={() => changeWeek(previousWeekKey)}
          disabled={!onWeekChange}
          aria-label={`Show previous week, ${formatWeekLabel(previousWeekKey)}`}
        >
          Previous
        </button>
        <div className="week-nav__current">
          <p>This week</p>
          <h2 id="this-week-heading">{formatWeekLabel(weekKey)}</h2>
        </div>
        <button
          type="button"
          onClick={() => changeWeek(nextWeekKey)}
          disabled={!onWeekChange}
          aria-label={`Show next week, ${formatWeekLabel(nextWeekKey)}`}
        >
          Next
        </button>
        <button
          type="button"
          onClick={() => changeWeek(todayWeekKey)}
          disabled={!onWeekChange || weekKey === todayWeekKey}
          aria-label="Return to the current week"
        >
          Today
        </button>
      </header>

      {household.people.length === 0 ? (
        <p className="empty-state">No people have been added yet.</p>
      ) : (
        <>
          <div className="viewer-picker" role="group" aria-label="Who is looking">
            <p className="viewer-picker__label">I am</p>
            <div className="viewer-picker__chips">
              {household.people.map((person) => {
                const selected = person.id === viewerId
                return (
                  <button
                    key={person.id}
                    type="button"
                    className={`viewer-chip${selected ? ' is-selected' : ''}`}
                    aria-pressed={selected}
                    onClick={() => setViewerId(person.id)}
                  >
                    {person.name}
                  </button>
                )
              })}
            </div>
          </div>

          {viewer ? (
            <section
              className="my-week"
              aria-labelledby="my-week-heading"
            >
              <p className="my-week__eyebrow">Your chores</p>
              <h3 id="my-week-heading">{viewer.name}</h3>
              {viewerAway ? (
                <p className="my-week__empty" role="status">
                  You are away this week — no chores assigned.
                </p>
              ) : isEveryoneAwayThisWeek ? (
                <p className="my-week__empty" role="status">
                  Everyone is away this week, so no chores are assigned.
                </p>
              ) : myAssignments.length === 0 ? (
                <p className="my-week__empty" role="status">
                  Nothing assigned to you this week.
                </p>
              ) : (
                <ul className="my-week__list" aria-label="Your chores this week">
                  {myAssignments.map((assignment) => (
                    <li
                      key={assignment.choreId}
                      className={`my-chore my-chore--${assignment.effort}`}
                    >
                      <span className="my-chore__name">{assignment.choreName}</span>
                      <span className="my-chore__effort">
                        {EFFORT_LABEL[assignment.effort]}
                      </span>
                      {assignment.warning ? (
                        <span className="warning" role="note">
                          {assignment.warning}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}

          <div className="assignment-groups" aria-label="Everyone else this week">
            <h3 className="rest-heading">Rest of the flat</h3>
            {others.map((person) => {
              const personIsAway = isAway(away, person.id, weekKey)
              const assignments = thisWeekByPerson.get(person.id) ?? []
              const headingId = `this-week-person-${person.id}`

              return (
                <section
                  key={person.id}
                  className="person-block"
                  aria-labelledby={headingId}
                >
                  <header>
                    <h3 id={headingId}>{person.name}</h3>
                    {personIsAway ? (
                      <span className="away-badge" aria-label={`${person.name} is away`}>
                        Away
                      </span>
                    ) : null}
                  </header>

                  {personIsAway ? (
                    <p>No chores assigned while away.</p>
                  ) : assignments.length === 0 ? (
                    <p>No chores assigned this week.</p>
                  ) : (
                    <ul aria-label={`${person.name}'s chores`}>
                      {assignments.map((assignment) => (
                        <li
                          key={assignment.choreId}
                          className={`chore-pill chore-pill--${assignment.effort}`}
                        >
                          <span>{assignment.choreName}</span>
                          <span className="chore-pill__effort">
                            {EFFORT_LABEL[assignment.effort]}
                          </span>
                          {assignment.warning ? (
                            <span className="warning" role="note">
                              {assignment.warning}
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )
            })}
          </div>
        </>
      )}

      <aside aria-labelledby="next-week-heading">
        <details>
          <summary>
            <span id="next-week-heading">Next week</span>
            <span>
              {formatWeekLabel(nextWeekKey)} -{' '}
              {formatAssignmentCount(totalNextWeekAssignments)}
            </span>
          </summary>
          {household.people.length === 0 ? (
            <p className="empty-state">No people have been added yet.</p>
          ) : (
            <ul className="next-week-list" aria-label="Next week assignment preview">
              {household.people.map((person) => {
                const personIsAway = isAway(away, person.id, nextWeekKey)
                const assignments = nextWeekByPerson.get(person.id) ?? []

                return (
                  <li key={person.id}>
                    <strong>{person.name}</strong>{' '}
                    {personIsAway ? (
                      <span className="away-badge" aria-label={`${person.name} is away next week`}>
                        Away
                      </span>
                    ) : assignments.length === 0 ? (
                      <span>No chores</span>
                    ) : (
                      <span>{assignments.map(({ choreName }) => choreName).join(', ')}</span>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </details>
      </aside>
    </section>
  )
}

export default ThisWeek
