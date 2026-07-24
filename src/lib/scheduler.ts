import type {
  Assignment,
  AwayMap,
  Chore,
  Effort,
  Household,
  Person,
  WeekSchedule,
} from '../types';
import { parseWeekKey, weekOrdinal } from './weeks';

const EFFORT_ORDER: Record<Effort, number> = {
  heavy: 0,
  medium: 1,
  light: 2,
};

const EFFORT_WEIGHT: Record<Effort, number> = {
  heavy: 3,
  medium: 2,
  light: 1,
};

export function choreEffort(chore: Chore): Effort {
  return chore.effort ?? 'medium';
}

export function isAway(
  away: AwayMap,
  personId: string,
  weekKey: string,
): boolean {
  return away[personId]?.includes(weekKey) ?? false;
}

export function peoplePresent(
  household: Household,
  away: AwayMap,
  weekKey: string,
): Person[] {
  return household.people.filter((person) => !isAway(away, person.id, weekKey));
}

export function scheduleWeek(
  household: Household,
  away: AwayMap,
  weekKey: string,
): WeekSchedule {
  const { week: weekNumber } = parseWeekKey(weekKey);
  const rotationOrdinal = weekOrdinal(weekKey);
  const presentPeople = peoplePresent(household, away, weekKey);
  const hasAwayPeople = presentPeople.length < household.people.length;
  const heavyCountByPerson: Map<string, number> = new Map(
    presentPeople.map((person) => [person.id, 0] as const),
  );
  const loadByPerson: Map<string, number> = new Map(
    presentPeople.map((person) => [person.id, 0] as const),
  );
  const assignments: Assignment[] = [];

  if (presentPeople.length === 0) {
    return {
      weekKey,
      assignments,
    };
  }

  const dueChores = household.chores
    .map((chore, choreIndex) => ({ chore, choreIndex }))
    .filter(({ chore }) => {
      if (chore.cadence === 'biweekly' && weekNumber % 2 !== household.biweeklyParity) {
        return false;
      }
      return true;
    })
    .sort((left, right) => {
      const effortDelta =
        EFFORT_ORDER[choreEffort(left.chore)] - EFFORT_ORDER[choreEffort(right.chore)];
      if (effortDelta !== 0) {
        return effortDelta;
      }
      return left.choreIndex - right.choreIndex;
    });

  for (const { chore, choreIndex } of dueChores) {
    const effort = choreEffort(chore);
    let candidates = chore.zone
      ? presentPeople.filter((person) => person.bathZone === chore.zone)
      : presentPeople;
    const warnings: string[] = [];

    if (chore.zone && candidates.length === 0) {
      candidates = presentPeople;
      warnings.push(`Zone spill: no bath-${chore.zone} people home`);
    }

    if (effort === 'heavy') {
      const withoutHeavy = candidates.filter(
        (person) => (heavyCountByPerson.get(person.id) ?? 0) === 0,
      );
      if (withoutHeavy.length > 0) {
        candidates = withoutHeavy;
      } else {
        warnings.push('Heavy spill: someone already has a big chore this week');
      }
    }

    const rotationSeed = choreIndex + rotationOrdinal;
    // Full house: pure cyclic keeps long-term fairness.
    // Someone away: prefer lightest current effort load.
    const person = hasAwayPeople
      ? pickLightestCyclicPerson(candidates, loadByPerson, rotationSeed)
      : pickCyclicPerson(candidates, rotationSeed);

    heavyCountByPerson.set(
      person.id,
      (heavyCountByPerson.get(person.id) ?? 0) + (effort === 'heavy' ? 1 : 0),
    );
    loadByPerson.set(
      person.id,
      (loadByPerson.get(person.id) ?? 0) + EFFORT_WEIGHT[effort],
    );

    assignments.push({
      choreId: chore.id,
      choreName: chore.name,
      personId: person.id,
      personName: person.name,
      effort,
      ...(warnings.length > 0 ? { warning: warnings.join(' · ') } : {}),
    });
  }

  const order = new Map(household.chores.map((chore, index) => [chore.id, index]));
  assignments.sort(
    (left, right) => (order.get(left.choreId) ?? 0) - (order.get(right.choreId) ?? 0),
  );

  return {
    weekKey,
    assignments,
  };
}

function pickCyclicPerson(candidates: Person[], rotationSeed: number): Person {
  if (candidates.length === 0) {
    throw new Error('Cannot choose from an empty candidate list');
  }

  return candidates[positiveModulo(rotationSeed, candidates.length)];
}

function pickLightestCyclicPerson(
  candidates: Person[],
  loadByPerson: Map<string, number>,
  rotationSeed: number,
): Person {
  if (candidates.length === 0) {
    throw new Error('Cannot choose from an empty candidate list');
  }

  const startIndex = positiveModulo(rotationSeed, candidates.length);
  let bestPerson = candidates[startIndex];
  let bestLoad = loadByPerson.get(bestPerson.id) ?? 0;

  for (let step = 1; step < candidates.length; step += 1) {
    const candidate = candidates[(startIndex + step) % candidates.length];
    const candidateLoad = loadByPerson.get(candidate.id) ?? 0;

    if (candidateLoad < bestLoad) {
      bestPerson = candidate;
      bestLoad = candidateLoad;
    }
  }

  return bestPerson;
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}
