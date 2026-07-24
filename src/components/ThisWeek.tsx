import type {
  Assignment,
  AwayMap,
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

export function ThisWeek({
  household,
  away,
  weekKey,
  onWeekChange,
}: ThisWeekProps) {
  const thisWeek = getWeekSchedule(household, away, weekKey)
  const previousWeekKey = addWeeks(weekKey, -1)
  const nextWeekKey = addWeeks(weekKey, 1)
  const todayWeekKey = currentWeekKey()
  const nextWeek = getWeekSchedule(household, away, nextWeekKey)

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
        <div>
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
        <p>No people have been added yet.</p>
      ) : (
        <div aria-label="Assignments grouped by person">
          {household.people.map((person) => {
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
                      <li key={assignment.choreId} className="chore-pill">
                        <span>{assignment.choreName}</span>
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
            <p>No people have been added yet.</p>
          ) : (
            <ul aria-label="Next week assignment preview">
              {household.people.map((person) => {
                const personIsAway = isAway(away, person.id, nextWeekKey)
                const assignments = nextWeekByPerson.get(person.id) ?? []

                return (
                  <li key={person.id}>
                    <strong>{person.name}</strong>{' '}
                    {personIsAway ? (
                      <span className="away-badge">Away</span>
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
