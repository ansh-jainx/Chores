export type BathZone = "up" | "down";
export type Cadence = "weekly" | "biweekly";

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
}

export interface Household {
  people: Person[];
  chores: Chore[];
  /** Biweekly chores run when ISO week number % 2 === biweeklyParity */
  biweeklyParity: 0 | 1;
}

/** personId -> list of ISO week keys like "2026-W30" */
export type AwayMap = Record<string, string[]>;

export interface Assignment {
  choreId: string;
  choreName: string;
  personId: string;
  personName: string;
  warning?: string;
}

export interface WeekSchedule {
  weekKey: string;
  assignments: Assignment[];
}

export interface PersistedState {
  household: Household;
  away: AwayMap;
}
