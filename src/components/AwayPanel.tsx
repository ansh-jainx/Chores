import type { AwayMap, Household } from "../types";
import { listUpcomingWeekKeys } from "../lib/weeks";

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

      {household.people.map((person) => {
        const awayWeeks = new Set(away[person.id] ?? []);

        return (
          <div className="person-away" key={person.id}>
            <h3>{person.name}</h3>
            <div aria-label={`${person.name} away weeks`}>
              {weekKeys.map((upcomingWeekKey: string) => {
                const isAway = awayWeeks.has(upcomingWeekKey);

                return (
                  <button
                    className={`week-chip${isAway ? " week-chip-on" : ""}`}
                    key={upcomingWeekKey}
                    type="button"
                    aria-pressed={isAway}
                    onClick={() => onToggleAway(person.id, upcomingWeekKey)}
                  >
                    {upcomingWeekKey}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </section>
  );
}

export default AwayPanel;
