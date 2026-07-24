import type { AwayMap, Household } from "../types";

export const FALLBACK_HOUSEHOLD: Household = {
  people: [
    { id: "person-1", name: "Person 1", bathZone: "up" },
    { id: "person-2", name: "Person 2", bathZone: "down" },
    { id: "person-3", name: "Person 3", bathZone: "up" },
    { id: "person-4", name: "Person 4", bathZone: "down" },
    { id: "person-5", name: "Person 5", bathZone: "up" },
    { id: "person-6", name: "Person 6", bathZone: "down" },
  ],
  chores: [
    { id: "bath-up", name: "Bath up", cadence: "weekly", zone: "up", effort: "heavy" },
    { id: "bath-down", name: "Bath down", cadence: "weekly", zone: "down", effort: "heavy" },
    { id: "kitchen", name: "Kitchen", cadence: "weekly", effort: "heavy" },
    { id: "hallway", name: "Hallway", cadence: "biweekly", effort: "heavy" },
    { id: "towels", name: "Towels", cadence: "biweekly", effort: "medium" },
    { id: "cardboard", name: "Cardboard", cadence: "biweekly", effort: "light" },
    { id: "pag", name: "P/A/G (pet / alu / glass)", cadence: "biweekly", effort: "medium" },
  ],
  biweeklyParity: 0,
};

export async function fetchDefaultHousehold(): Promise<Household> {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}household.json`);

    if (!response.ok) {
      return FALLBACK_HOUSEHOLD;
    }

    return (await response.json()) as Household;
  } catch {
    return FALLBACK_HOUSEHOLD;
  }
}

export const EMPTY_AWAY: AwayMap = {};
