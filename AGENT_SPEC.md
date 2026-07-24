# Flat Chores PWA — agent contract

Repo: `ansh-jainx/Chores` → GitHub Pages at `/Chores/` base.

## Types (`src/types.ts`) — DO NOT CHANGE without coordinating

```ts
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
  /** ISO week numbers that are "biweekly on" — chore runs when weekOfYear % 2 === biweeklyParity */
  biweeklyParity: 0 | 1;
}

/** personId -> list of ISO week keys like "2026-W30" */
export type AwayMap = Record<string, string[]>;

export interface Assignment {
  choreId: string;
  choreName: string;
  personId: string;
  personName: string;
  warning?: string; // e.g. zone spill
}

export interface WeekSchedule {
  weekKey: string; // "2026-W30"
  assignments: Assignment[];
}
```

## File ownership (wave 1)

| Agent | Owns only these paths |
|---|---|
| scheduler | `src/lib/scheduler.ts`, `src/lib/scheduler.test.ts` |
| weeks | `src/lib/weeks.ts`, `src/lib/weeks.test.ts` |
| storage | `src/lib/storage.ts`, `src/lib/share.ts`, `src/lib/share.test.ts` |
| household-data | `public/household.json`, `src/lib/defaults.ts` |
| ThisWeek | `src/components/ThisWeek.tsx` |
| Away | `src/components/AwayPanel.tsx` |
| Setup | `src/components/SetupPanel.tsx` |
| AppShell | `src/App.tsx`, `src/main.tsx`, `src/index.css`, `src/App.css` |
| pwa-deploy | `vite.config.ts`, `index.html`, `.github/workflows/pages.yml`, `public/icons/*`, README |
| hooks | `src/hooks/useHousehold.ts` |

## Scheduler rules

1. Deterministic from `weekKey` + ordered people/chores.
2. Non-zone chores: cyclic assignment by chore index + week ordinal among **present** people (or base then redistribute).
3. Zone chores: cycle only among people with that `bathZone` who are present.
4. Biweekly chores only when `weekNumber % 2 === biweeklyParity`.
5. Away people get no chores that week; their slots go to present people with lightest load; zone spill only if whole zone away → set `warning`.
6. Fairness over a full cycle of N people when nobody is away.

## UI

- Tabs: This week | Away | Setup
- Utility app, readable, mobile-first, installable PWA
- No purple AI-slop theme; calm slate/teal utility look with subtle gradient background
- Fonts: something expressive (e.g. DM Sans + Fraunces via Google fonts link) — not Inter/Roboto

## Storage

- Load `public/household.json` as defaults
- Persist household + away in localStorage key `flat-chores-v1`
- Share link: `#s=<base64url json>` of `{ household, away }`
