import { describe, expect, it } from 'vitest';

import { awayDaysInWeek, isAway, peoplePresent, scheduleWeek } from './scheduler';
import { FALLBACK_HOUSEHOLD } from './defaults';
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
      ben: [{ id: 'trip', name: 'Holiday', from: '2026-07-23', until: '2026-07-30' }],
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
  it('keeps everyone at one chore when there are enough people', () => {
    const household = householdWithChores(['dishes', 'bins', 'vacuum']);

    for (const weekKey of ['2026-W01', '2026-W02', '2026-W03']) {
      const counts = countAssignmentsByPerson(
        scheduleWeek(household, {}, weekKey).assignments,
      );
      expect(Object.values(counts).every((count) => count === 1)).toBe(true);
      expect(Object.keys(counts)).toHaveLength(3);
    }
  });

  it('prefers empty people so zone chores do not force unnecessary doubles', () => {
    const household: Household = {
      people: basePeople,
      biweeklyParity: 0,
      chores: [
        { id: 'down-bath', name: 'Down bath', cadence: 'weekly', zone: 'down' },
        { id: 'dishes', name: 'Dishes', cadence: 'weekly' },
      ],
    };

    const schedule = scheduleWeek(household, {}, '2026-W01');
    const counts = countAssignmentsByPerson(schedule.assignments);
    // 2 chores / 3 people ⇒ exactly one free person, nobody doubled.
    expect(Object.keys(counts)).toHaveLength(2);
    expect(Math.max(...Object.values(counts))).toBe(1);
    expect(counts.ben).toBe(1); // only down-zone person must cover down bath
  });

  it('uses cardboard before P/A/G before towels when a second chore is required', () => {
    const household: Household = {
      people: [
        { id: 'p1', name: 'P1', bathZone: 'up' },
        { id: 'p2', name: 'P2', bathZone: 'down' },
        { id: 'p3', name: 'P3', bathZone: 'up' },
      ],
      biweeklyParity: 0,
      chores: [
        { id: 'kitchen', name: 'Kitchen', cadence: 'weekly', effort: 'heavy' },
        { id: 'bath-up', name: 'Bath up', cadence: 'weekly', zone: 'up', effort: 'heavy' },
        { id: 'bath-down', name: 'Bath down', cadence: 'weekly', zone: 'down', effort: 'heavy' },
        { id: 'cardboard', name: 'Cardboard', cadence: 'weekly', effort: 'light' },
        { id: 'pag', name: 'P/A/G', cadence: 'weekly', effort: 'medium' },
        { id: 'towels', name: 'Towels', cadence: 'weekly', effort: 'medium' },
      ],
    };

    // 6 chores / 3 people ⇒ everyone gets 2. The three second chores should be
    // cardboard, pag, and towels (the preferred stackers), not a second heavy.
    const schedule = scheduleWeek(household, {}, '2026-W30');
    const byPerson = new Map<string, string[]>();
    for (const assignment of schedule.assignments) {
      const list = byPerson.get(assignment.personId) ?? [];
      list.push(assignment.choreId);
      byPerson.set(assignment.personId, list);
    }

    expect([...byPerson.values()].every((chores) => chores.length === 2)).toBe(true);

    const secondChores = [...byPerson.values()].map((chores) => {
      // Prefer identifying the non-heavy as the "second" when mixed.
      const light = chores.find((id) => ['cardboard', 'pag', 'towels'].includes(id));
      return light ?? chores[1];
    });

    expect(new Set(secondChores)).toEqual(new Set(['cardboard', 'pag', 'towels']));
  });

  it('pairs hallway with cardboard and towels with P/A/G', () => {
    const household: Household = {
      people: basePeople,
      biweeklyParity: 0,
      chores: [
        { id: 'hallway', name: 'Hallway', cadence: 'biweekly' },
        { id: 'cardboard', name: 'Cardboard', cadence: 'biweekly' },
        { id: 'towels', name: 'Towels', cadence: 'biweekly' },
        { id: 'pag', name: 'P/A/G', cadence: 'biweekly' },
      ],
    };

    expect(
      scheduleWeek(household, {}, '2026-W30').assignments.map(({ choreId }) => choreId).sort(),
    ).toEqual(['cardboard', 'hallway']);
    expect(
      scheduleWeek(household, {}, '2026-W31').assignments.map(({ choreId }) => choreId).sort(),
    ).toEqual(['pag', 'towels']);
  });

  it('staggers biweekly chores across alternating weeks', () => {
    const household: Household = {
      people: basePeople,
      biweeklyParity: 0,
      chores: [
        { id: 'dishes', name: 'Dishes', cadence: 'weekly' },
        { id: 'hallway', name: 'Hallway', cadence: 'biweekly' },
        { id: 'towels', name: 'Towels', cadence: 'biweekly' },
        { id: 'cardboard', name: 'Cardboard', cadence: 'biweekly' },
        { id: 'pag', name: 'P/A/G', cadence: 'biweekly' },
      ],
    };

    expect(
      scheduleWeek(household, {}, '2026-W30').assignments.map(({ choreId }) => choreId),
    ).toEqual(['dishes', 'hallway', 'cardboard']);
    expect(
      scheduleWeek(household, {}, '2026-W31').assignments.map(({ choreId }) => choreId),
    ).toEqual(['dishes', 'towels', 'pag']);
  });

  it('shifts the staggered biweekly set when household parity flips', () => {
    const household: Household = {
      people: basePeople,
      biweeklyParity: 1,
      chores: [
        { id: 'dishes', name: 'Dishes', cadence: 'weekly' },
        { id: 'fridge', name: 'Fridge', cadence: 'biweekly' },
        { id: 'oven', name: 'Oven', cadence: 'biweekly' },
      ],
    };

    expect(
      scheduleWeek(household, {}, '2026-W30').assignments.map(({ choreId }) => choreId),
    ).toEqual(['dishes', 'oven']);
    expect(
      scheduleWeek(household, {}, '2026-W31').assignments.map(({ choreId }) => choreId),
    ).toEqual(['dishes', 'fridge']);
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
      { ben: [{ id: 'ben-away', name: 'Holiday', from: '2025-12-29', until: '2026-01-05' }] },
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
      ada: [{ id: 'a', name: 'Holiday', from: '2025-12-29', until: '2026-01-05' }],
      ben: [{ id: 'b', name: 'Holiday', from: '2025-12-29', until: '2026-01-05' }],
      cy: [{ id: 'c', name: 'Holiday', from: '2025-12-29', until: '2026-01-05' }],
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
      'up-a': [{ id: 'ua', name: 'Holiday', from: '2026-01-05', until: '2026-01-12' }],
      'up-b': [{ id: 'ub', name: 'Holiday', from: '2026-01-05', until: '2026-01-12' }],
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
        { id: 'hallway', name: 'Hallway', cadence: 'biweekly', effort: 'heavy' },
        { id: 'towels', name: 'Towels', cadence: 'biweekly', effort: 'medium' },
      ],
    };

    for (const weekKey of ['2026-W30', '2026-W31', '2026-W32']) {
      const heavyByPerson = new Map<string, number>();
      const schedule = scheduleWeek(household, {}, weekKey);
      for (const assignment of schedule.assignments) {
        if (assignment.effort !== 'heavy') {
          continue;
        }
        heavyByPerson.set(
          assignment.personId,
          (heavyByPerson.get(assignment.personId) ?? 0) + 1,
        );
      }

      expect([...heavyByPerson.values()].every((count) => count === 1)).toBe(true);
      const expectedHeavies = weekKey === '2026-W31' ? 3 : 4;
      expect(heavyByPerson.size).toBe(expectedHeavies);
    }
  });

  it('is deterministic for the same week, people order, chores order, and away map', () => {
    const household = householdWithChores(['dishes', 'bins', 'vacuum']);
    const away: AwayMap = {
      ada: [{ id: 'ada-away', name: 'Holiday', from: '2026-07-20', until: '2026-07-27' }],
    };

    expect(scheduleWeek(household, away, '2026-W30')).toEqual(
      scheduleWeek(household, away, '2026-W30'),
    );
  });

  it('uses seeded overrides as locked weeks and rotation history', () => {
    const overrides = {
      '2026-W30': {
        'bath-up': 'person-1',
        'bath-down': 'person-2',
        kitchen: 'person-3',
        hallway: 'person-5',
        cardboard: 'person-4',
      },
      '2026-W31': {
        'bath-up': 'person-3',
        'bath-down': 'person-4',
        kitchen: 'person-6',
        towels: 'person-5',
        pag: 'person-1',
      },
    };

    const locked = scheduleWeek(FALLBACK_HOUSEHOLD, {}, '2026-W30', { overrides });
    expect(
      Object.fromEntries(
        locked.assignments.map((item) => [item.choreId, item.personId]),
      ),
    ).toEqual(overrides['2026-W30']);

    // Week after the seed should not repeat kitchen from the locked week.
    const next = scheduleWeek(FALLBACK_HOUSEHOLD, {}, '2026-W32', { overrides });
    const kitchen = next.assignments.find((item) => item.choreId === 'kitchen');
    expect(kitchen?.personId).not.toBe('person-3');
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
