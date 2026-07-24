import type {
  Assignment,
  AwayMap,
  Household,
  Person,
  WeekSchedule,
} from '../types';
import { parseWeekKey, weekOrdinal } from './weeks';

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
  const loadByPerson: Map<string, number> = new Map(
    presentPeople.map((person) => [person.id, 0] as const),
  );
  const assignments: Assignment[] = [];

  household.chores.forEach((chore, choreIndex) => {
    if (
      chore.cadence === 'biweekly' &&
      weekNumber % 2 !== household.biweeklyParity
    ) {
      return;
    }

    if (presentPeople.length === 0) {
      throw new Error(`Cannot schedule due chores for ${weekKey}: nobody is home`);
    }

    let candidates = chore.zone
      ? presentPeople.filter((person) => person.bathZone === chore.zone)
      : presentPeople;
    let warning: string | undefined;

    if (chore.zone && candidates.length === 0) {
      candidates = presentPeople;
      warning = `Zone spill: no bath-${chore.zone} people home`;
    }

    const person = pickLightestCyclicPerson(
      candidates,
      loadByPerson,
      choreIndex + rotationOrdinal,
    );
    loadByPerson.set(person.id, (loadByPerson.get(person.id) ?? 0) + 1);

    assignments.push({
      choreId: chore.id,
      choreName: chore.name,
      personId: person.id,
      personName: person.name,
      ...(warning ? { warning } : {}),
    });
  });

  return {
    weekKey,
    assignments,
  };
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
