import { describe, expect, it } from 'vitest';

import { isAway, peoplePresent, scheduleWeek } from './scheduler';
import type { Assignment, AwayMap, Household } from '../types';

const basePeople: Household['people'] = [
  { id: 'ada', name: 'Ada', bathZone: 'up' },
  { id: 'ben', name: 'Ben', bathZone: 'down' },
  { id: 'cy', name: 'Cy', bathZone: 'up' },
];

describe('scheduler helpers', () => {
  it('detects away people and returns present people in household order', () => {
    const household = householdWithChores(['dishes']);
    const away: AwayMap = {
      ben: ['2026-W30'],
    };

    expect(isAway(away, 'ben', '2026-W30')).toBe(true);
    expect(isAway(away, 'ben', '2026-W31')).toBe(false);
    expect(isAway(away, 'ada', '2026-W30')).toBe(false);
    expect(peoplePresent(household, away, '2026-W30').map(({ id }) => id)).toEqual([
      'ada',
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
    const schedule = scheduleWeek(
      household,
      { ben: ['2026-W01'] },
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
      ada: ['2026-W01'],
      ben: ['2026-W01'],
      cy: ['2026-W01'],
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
    const away: AwayMap = {
      'up-a': ['2026-W02'],
      'up-b': ['2026-W02'],
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

  it('is deterministic for the same week, people order, chores order, and away map', () => {
    const household = householdWithChores(['dishes', 'bins', 'vacuum']);
    const away: AwayMap = {
      ada: ['2026-W30'],
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
