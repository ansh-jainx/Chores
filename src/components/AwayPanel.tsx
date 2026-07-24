import type { AwayMap, Household } from "../types";
import { formatWeekLabel, listUpcomingWeekKeys } from "../lib/weeks";

interface AwayPanelProps {
  household: Household;
  away: AwayMap;
  weekKey: string;
  onToggleAway: (personId: string, weekKey: string) => void;
}

export function AwayPanel({
  household,
  away,
  weekKey,
  onToggleAway,
}: AwayPanelProps) {
  const weekKeys = listUpcomingWeekKeys(weekKey, 8);

  return (
    <section className="away-panel" aria-labelledby="away-panel-title">
      <div>
        <h2 id="away-panel-title">Away weeks</h2>
        <p>Mark holiday weeks — chores reassign automatically.</p>
      </div>

      {household.people.length === 0 ? (
        <p className="empty-state">
          Add people in setup before marking away weeks.
        </p>
      ) : null}

      {household.people.map((person) => {
        const awayWeeks = new Set(away[person.id] ?? []);
        const personHeadingId = `away-person-${person.id}`;

        return (
          <section
            className="person-away"
            key={person.id}
            aria-labelledby={personHeadingId}
          >
            <h3 id={personHeadingId}>{person.name}</h3>
            <div className="week-chip-list" aria-label={`${person.name} away weeks`}>
              {weekKeys.map((upcomingWeekKey: string) => {
                const isAway = awayWeeks.has(upcomingWeekKey);
                const weekLabel = formatWeekLabel(upcomingWeekKey);

                return (
                  <button
                    className={`week-chip${isAway ? " week-chip-on" : ""}`}
                    key={upcomingWeekKey}
                    type="button"
                    aria-label={`${isAway ? "Clear away week" : "Mark away week"} for ${person.name}, ${weekLabel}`}
                    aria-pressed={isAway}
                    onClick={() => onToggleAway(person.id, upcomingWeekKey)}
                  >
                    <span>{upcomingWeekKey}</span>
                    <small>{weekLabel}</small>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </section>
  );
}

export default AwayPanel;
