import { describe, expect, it } from 'vitest';

import { awayDaysInWeek, isAway, peoplePresent, scheduleWeek } from './scheduler';
import type { Assignment, AwayMap, Household } from '../types';

const basePeople: Household['people'] = [
  { id: 'ada', name: 'Ada', bathZone: 'up' },
  { id: 'ben', name: 'Ben', bathZone: 'down' },
  { id: 'cy', name: 'Cy', bathZone: 'up' },
];

describe('scheduler helpers', () => {
  it('uses the 4-day threshold for crossover holidays', () => {
    // 2026-W30 is Mon 20 Jul – Sun 26 Jul.
    // Away Thu 23 Jul → back Thu 30 Jul ⇒ W30: 4 days, W31: 3 days.
    const away: AwayMap = {
      ben: [{ id: 'trip', from: '2026-07-23', until: '2026-07-30' }],
    };
    const household = householdWithChores(['dishes']);

    expect(awayDaysInWeek(away, 'ben', '2026-W30')).toBe(4);
    expect(awayDaysInWeek(away, 'ben', '2026-W31')).toBe(3);
    expect(isAway(away, 'ben', '2026-W30')).toBe(true);
    expect(isAway(away, 'ben', '2026-W31')).toBe(false);
    expect(isAway(away, 'ada', '2026-W30')).toBe(false);
    expect(peoplePresent(household, away, '2026-W30').map(({ id }) => id)).toEqual([
      'ada',
      'cy',
    ]);
    expect(peoplePresent(household, away, '2026-W31').map(({ id }) => id)).toEqual([
      'ada',
      'ben',
      'cy',
    ]);
  });
});

describe('scheduleWeek', () => {
  it('rotates each non-zone chore fairly over a full people cycle', () => {
    const household = householdWithChores([
      'dishes',
      'bins',
      'vacuum',
      'surfaces',
    ]);
    const countsByChore = new Map(
      household.chores.map((chore) => [chore.id, emptyPersonCounts()]),
    );

    for (const weekKey of ['2026-W01', '2026-W02', '2026-W03']) {
      for (const assignment of scheduleWeek(household, {}, weekKey).assignments) {
        countsByChore.get(assignment.choreId)![assignment.personId] += 1;
      }
    }

    for (const counts of countsByChore.values()) {
      expect(counts).toEqual({
        ada: 1,
        ben: 1,
        cy: 1,
      });
    }
  });

  it('does not let fixed-zone chores skew no-away non-zone rotation', () => {
    const household: Household = {
      people: basePeople,
      biweeklyParity: 0,
      chores: [
        { id: 'down-bath', name: 'Down bath', cadence: 'weekly', zone: 'down' },
        { id: 'dishes', name: 'Dishes', cadence: 'weekly' },
      ],
    };
    const nonZoneCounts: Record<string, number> = { ada: 0, ben: 0, cy: 0 };

    for (const weekKey of ['2026-W01', '2026-W02', '2026-W03']) {
      const assignment = scheduleWeek(household, {}, weekKey).assignments.find(
        ({ choreId }) => choreId === 'dishes',
      )!;
      nonZoneCounts[assignment.personId] += 1;
    }

    expect(nonZoneCounts).toEqual({
      ada: 1,
      ben: 1,
      cy: 1,
    });
  });

  it('skips biweekly chores unless week parity matches the household', () => {
    const household: Household = {
      people: basePeople,
      biweeklyParity: 0,
      chores: [
        { id: 'dishes', name: 'Dishes', cadence: 'weekly' },
        { id: 'fridge', name: 'Fridge', cadence: 'biweekly' },
      ],
    };

    expect(scheduleWeek(household, {}, '2026-W30').assignments.map(({ choreId }) => choreId)).toEqual([
      'dishes',
      'fridge',
    ]);
    expect(scheduleWeek(household, {}, '2026-W31').assignments.map(({ choreId }) => choreId)).toEqual([
      'dishes',
    ]);
  });

  it('redistributes work away from absent people to present people with balanced loads', () => {
    const household = householdWithChores([
      'dishes',
      'bins',
      'vacuum',
      'surfaces',
    ]);
    // 2026-W01 = Mon 29 Dec 2025 – Sun 4 Jan 2026
    const schedule = scheduleWeek(
      household,
      { ben: [{ id: 'ben-away', from: '2025-12-29', until: '2026-01-05' }] },
      '2026-W01',
    );

    expect(schedule.assignments).toHaveLength(4);
    expect(schedule.assignments.some(({ personId }) => personId === 'ben')).toBe(
      false,
    );
    expect(countAssignmentsByPerson(schedule.assignments)).toEqual({
      ada: 2,
      cy: 2,
    });
  });

  it('returns an empty schedule instead of throwing when everyone is away', () => {
    const household = householdWithChores(['dishes', 'bins']);
    const away: AwayMap = {
      ada: [{ id: 'a', from: '2025-12-29', until: '2026-01-05' }],
      ben: [{ id: 'b', from: '2025-12-29', until: '2026-01-05' }],
      cy: [{ id: 'c', from: '2025-12-29', until: '2026-01-05' }],
    };

    expect(scheduleWeek(household, away, '2026-W01')).toEqual({
      weekKey: '2026-W01',
      assignments: [],
    });
  });

  it('keeps zone chores assigned to present people in the matching bath zone', () => {
    const household: Household = {
      people: basePeople,
      biweeklyParity: 0,
      chores: [
        { id: 'up-bath', name: 'Up bath', cadence: 'weekly', zone: 'up' },
        { id: 'down-bath', name: 'Down bath', cadence: 'weekly', zone: 'down' },
        { id: 'up-mirror', name: 'Up mirror', cadence: 'weekly', zone: 'up' },
      ],
    };
    const peopleById = new Map(household.people.map((person) => [person.id, person]));

    const assignments = scheduleWeek(household, {}, '2026-W01').assignments;

    expect(assignments).toHaveLength(3);
    for (const assignment of assignments) {
      const chore = household.chores.find(({ id }) => id === assignment.choreId)!;
      expect(peopleById.get(assignment.personId)!.bathZone).toBe(chore.zone);
      expect(assignment.warning).toBeUndefined();
    }
  });

  it('spills zone chores to other present people with warnings when the zone is away', () => {
    const household: Household = {
      people: [
        { id: 'up-a', name: 'Up A', bathZone: 'up' },
        { id: 'up-b', name: 'Up B', bathZone: 'up' },
        { id: 'down-a', name: 'Down A', bathZone: 'down' },
        { id: 'down-b', name: 'Down B', bathZone: 'down' },
      ],
      biweeklyParity: 0,
      chores: [
        { id: 'up-bath', name: 'Up bath', cadence: 'weekly', zone: 'up' },
        { id: 'up-mirror', name: 'Up mirror', cadence: 'weekly', zone: 'up' },
      ],
    };
    // 2026-W02 = Mon 5 Jan – Sun 11 Jan 2026
    const away: AwayMap = {
      'up-a': [{ id: 'ua', from: '2026-01-05', until: '2026-01-12' }],
      'up-b': [{ id: 'ub', from: '2026-01-05', until: '2026-01-12' }],
    };

    const assignments = scheduleWeek(household, away, '2026-W02').assignments;

    expect(countAssignmentsByPerson(assignments)).toEqual({
      'down-a': 1,
      'down-b': 1,
    });
    expect(assignments.map(({ warning }) => warning)).toEqual([
      'Zone spill: no bath-up people home',
      'Zone spill: no bath-up people home',
    ]);
  });

  it('never gives one person two heavy chores in the same week when avoidable', () => {
    const household: Household = {
      people: [
        { id: 'p1', name: 'P1', bathZone: 'up' },
        { id: 'p2', name: 'P2', bathZone: 'down' },
        { id: 'p3', name: 'P3', bathZone: 'up' },
        { id: 'p4', name: 'P4', bathZone: 'down' },
        { id: 'p5', name: 'P5', bathZone: 'up' },
        { id: 'p6', name: 'P6', bathZone: 'down' },
      ],
      biweeklyParity: 0,
      chores: [
        { id: 'bath-up', name: 'Bath up', cadence: 'weekly', zone: 'up', effort: 'heavy' },
        { id: 'bath-down', name: 'Bath down', cadence: 'weekly', zone: 'down', effort: 'heavy' },
        { id: 'kitchen', name: 'Kitchen', cadence: 'weekly', effort: 'heavy' },
        { id: 'hallway', name: 'Hallway', cadence: 'weekly', effort: 'heavy' },
        { id: 'towels', name: 'Towels', cadence: 'biweekly', effort: 'medium' },
      ],
    };

    for (const weekKey of ['2026-W30', '2026-W31', '2026-W32']) {
      const heavyByPerson = new Map<string, number>();
      for (const assignment of scheduleWeek(household, {}, weekKey).assignments) {
        if (assignment.effort !== 'heavy') {
          continue;
        }
        heavyByPerson.set(
          assignment.personId,
          (heavyByPerson.get(assignment.personId) ?? 0) + 1,
        );
      }

      expect([...heavyByPerson.values()].every((count) => count === 1)).toBe(true);
      expect(heavyByPerson.size).toBe(4);
    }
  });

  it('is deterministic for the same week, people order, chores order, and away map', () => {
    const household = householdWithChores(['dishes', 'bins', 'vacuum']);
    const away: AwayMap = {
      ada: [{ id: 'ada-away', from: '2026-07-20', until: '2026-07-27' }],
    };

    expect(scheduleWeek(household, away, '2026-W30')).toEqual(
      scheduleWeek(household, away, '2026-W30'),
    );
  });
});

function householdWithChores(choreIds: string[]): Household {
  return {
    people: basePeople,
    biweeklyParity: 0,
    chores: choreIds.map((id) => ({
      id,
      name: titleCase(id),
      cadence: 'weekly',
    })),
  };
}

function emptyPersonCounts(): Record<string, number> {
  return Object.fromEntries(basePeople.map(({ id }) => [id, 0]));
}

function countAssignmentsByPerson(
  assignments: Assignment[],
): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const assignment of assignments) {
    counts[assignment.personId] = (counts[assignment.personId] ?? 0) + 1;
  }

  return counts;
}

function titleCase(value: string): string {
  return `${value[0].toUpperCase()}${value.slice(1)}`;
}
