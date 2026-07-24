import type { AwayMap, Household } from "../types";

export const FALLBACK_HOUSEHOLD: Household = {
  people: [
    {
      id: "alex",
      name: "Alex",
      bathZone: "up",
    },
    {
      id: "blake",
      name: "Blake",
      bathZone: "down",
    },
    {
      id: "casey",
      name: "Casey",
      bathZone: "up",
    },
    {
      id: "drew",
      name: "Drew",
      bathZone: "down",
    },
  ],
  chores: [
    {
      id: "kitchen",
      name: "Kitchen",
      cadence: "weekly",
    },
    {
      id: "trash-recycling",
      name: "Trash & recycling",
      cadence: "weekly",
    },
    {
      id: "vacuum-floors",
      name: "Vacuum / floors",
      cadence: "weekly",
    },
    {
      id: "bathroom-upstairs",
      name: "Bathroom upstairs",
      cadence: "weekly",
      zone: "up",
    },
    {
      id: "bathroom-downstairs",
      name: "Bathroom downstairs",
      cadence: "weekly",
      zone: "down",
    },
    {
      id: "fridge-clean-out",
      name: "Fridge clean-out",
      cadence: "biweekly",
    },
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
