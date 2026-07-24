import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { EMPTY_AWAY, fetchDefaultHousehold } from "../lib/defaults";
import { decodeShareHash, encodeShareHash } from "../lib/share";
import { clearState, loadState, saveState } from "../lib/storage";
import type { AwayMap, Household, PersistedState } from "../types";

export interface UseHouseholdResult {
  household: Household;
  away: AwayMap;
  ready: boolean;
  setHousehold: Dispatch<SetStateAction<Household>>;
  setAway: Dispatch<SetStateAction<AwayMap>>;
  addAbsence: (
    personId: string,
    name: string,
    from: string,
    until: string,
  ) => void;
  removeAbsence: (personId: string, absenceId: string) => void;
  resetToDefaults: () => Promise<void>;
  copyShareLink: () => Promise<string>;
}

const SHARE_HASH_PREFIX = "#s=";
const INITIAL_HOUSEHOLD: Household = {
  people: [],
  chores: [],
  biweeklyParity: 0,
};

function readShareState(): PersistedState | null {
  if (typeof window === "undefined") {
    return null;
  }

  const { hash } = window.location;
  if (!hash.startsWith(SHARE_HASH_PREFIX)) {
    return null;
  }

  try {
    return decodeShareHash(hash);
  } catch {
    return null;
  }
}

function clearShareHash(): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.history.replaceState(
      window.history.state,
      document.title,
      `${window.location.pathname}${window.location.search}`,
    );
  } catch {
    // Clearing the hash is best-effort; imported state is still applied.
  }
}

function persistState(state: PersistedState): void {
  try {
    saveState(state);
  } catch {
    // Ignore storage failures so the in-memory app state remains usable.
  }
}

function buildShareUrl(state: PersistedState): string {
  if (typeof window === "undefined") {
    throw new Error("Share links can only be created in a browser.");
  }

  const shareHash = encodeShareHash(state);
  const url = new URL(window.location.href);
  url.hash = shareHash.startsWith("#") ? shareHash : `#${shareHash}`;
  return url.toString();
}

export function useHousehold(): UseHouseholdResult {
  const [state, setState] = useState<PersistedState | null>(null);
  const stateToSkipPersistRef = useRef<PersistedState | null>(null);
  const household = state?.household ?? INITIAL_HOUSEHOLD;
  const away = state?.away ?? EMPTY_AWAY;
  const ready = state !== null;

  useEffect(() => {
    let cancelled = false;

    async function initialize(): Promise<void> {
      const sharedState = readShareState();
      const storedState = sharedState ?? loadState();
      const nextState =
        storedState ?? {
          household: await fetchDefaultHousehold(),
          away: {},
        };

      if (cancelled) {
        return;
      }

      if (sharedState !== null) {
        persistState(sharedState);
        clearShareHash();
      }

      stateToSkipPersistRef.current = nextState;
      setState(nextState);
    }

    void initialize();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (state === null) {
      return;
    }

    if (stateToSkipPersistRef.current === state) {
      stateToSkipPersistRef.current = null;
      return;
    }

    persistState(state);
  }, [state]);

  const setHousehold = useCallback<Dispatch<SetStateAction<Household>>>(
    (nextHousehold) => {
      setState((currentState) => {
        const currentHousehold = currentState?.household ?? INITIAL_HOUSEHOLD;
        const householdValue =
          typeof nextHousehold === "function"
            ? nextHousehold(currentHousehold)
            : nextHousehold;

        return {
          household: householdValue,
          away: currentState?.away ?? {},
        };
      });
    },
    [],
  );

  const setAway = useCallback<Dispatch<SetStateAction<AwayMap>>>((nextAway) => {
    setState((currentState) => {
      const currentAway = currentState?.away ?? {};
      const awayValue =
        typeof nextAway === "function" ? nextAway(currentAway) : nextAway;

      return {
        household: currentState?.household ?? INITIAL_HOUSEHOLD,
        away: awayValue,
      };
    });
  }, []);

  const addAbsence = useCallback(
    (personId: string, name: string, from: string, until: string) => {
      const trimmedName = name.trim() || 'Holiday'
      if (until <= from) {
        return
      }

      setState((currentState) => {
        if (currentState === null) {
          return currentState
        }

        const absence = {
          id: `${personId}-${from}-${until}-${Math.random().toString(36).slice(2, 7)}`,
          name: trimmedName,
          from,
          until,
        }
        const existing = currentState.away[personId] ?? []

        return {
          household: currentState.household,
          away: {
            ...currentState.away,
            [personId]: [...existing, absence],
          },
        }
      })
    },
    [],
  )

  const removeAbsence = useCallback((personId: string, absenceId: string) => {
    setState((currentState) => {
      if (currentState === null) {
        return currentState;
      }

      const nextAway = { ...currentState.away };
      const remaining = (nextAway[personId] ?? []).filter(
        (absence) => absence.id !== absenceId,
      );

      if (remaining.length === 0) {
        delete nextAway[personId];
      } else {
        nextAway[personId] = remaining;
      }

      return {
        household: currentState.household,
        away: nextAway,
      };
    });
  }, []);

  const resetToDefaults = useCallback(async () => {
    const defaultHousehold = await fetchDefaultHousehold();
    const nextState = {
      household: defaultHousehold,
      away: {},
    };

    clearState();
    stateToSkipPersistRef.current = nextState;
    setState(nextState);
  }, []);

  const copyShareLink = useCallback(async () => {
    if (state === null) {
      throw new Error("Household state is not ready.");
    }

    const url = buildShareUrl(state);
    await window.navigator.clipboard.writeText(url);
    return url;
  }, [state]);

  return {
    household,
    away,
    ready,
    setHousehold,
    setAway,
    addAbsence,
    removeAbsence,
    resetToDefaults,
    copyShareLink,
  };
}
