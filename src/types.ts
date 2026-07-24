export type BathZone = "up" | "down";
export type Cadence = "weekly" | "biweekly";
/** heavy = big weekly jobs; medium = side tasks; light = quick jobs */
export type Effort = "heavy" | "medium" | "light";

export interface Person {
  id: string;
  name: string;
  bathZone: BathZone;
}

export interface Chore {
  id: string;
  name: string;
  cadence: Cadence;
  /** If set, only people with matching bathZone are eligible (unless zone spill). */
  zone?: BathZone;
  /** Defaults to medium when omitted (older share links). */
  effort?: Effort;
}

export interface Household {
  people: Person[];
  chores: Chore[];
  /** Shifts which half of the staggered biweekly set runs on even/odd weeks. */
  biweeklyParity: 0 | 1;
}

/**
 * Half-open holiday range: away on `from` through the day before `until`.
 * Example: Thu → next Thu means away Thu–Wed (4 days in week 1, 3 in week 2).
 */
export interface Absence {
  id: string;
  /** Display name for the trip, e.g. "Summer holiday" */
  name: string;
  /** Inclusive first day away, YYYY-MM-DD */
  from: string;
  /** Exclusive first day back home, YYYY-MM-DD */
  until: string;
}

/** personId -> holiday ranges */
export type AwayMap = Record<string, Absence[]>;

/** A person skips chores in a Mon–Sun week when away ≥ this many days. */
export const AWAY_DAY_THRESHOLD = 4;

export interface Assignment {
  choreId: string;
  choreName: string;
  personId: string;
  personName: string;
  effort: Effort;
  warning?: string;
}

export interface WeekSchedule {
  weekKey: string;
  assignments: Assignment[];
}

/** weekKey -> completed choreIds for that week */
export type CompletionMap = Record<string, string[]>;

export interface PersistedState {
  household: Household;
  away: AwayMap;
  /** Checklist ticks, keyed by ISO week */
  completions: CompletionMap;
}
