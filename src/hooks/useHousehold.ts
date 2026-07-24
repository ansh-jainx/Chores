import { useCallback, useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { fetchDefaultHousehold } from "../lib/defaults";
import { decodeShareHash, encodeShareHash } from "../lib/share";
import { loadState, saveState } from "../lib/storage";
import type { AwayMap, Household, PersistedState } from "../types";

export interface UseHouseholdResult {
  household: Household | null;
  away: AwayMap;
  ready: boolean;
  setHousehold: Dispatch<SetStateAction<Household | null>>;
  setAway: Dispatch<SetStateAction<AwayMap>>;
  toggleAway: (personId: string, weekKey: string) => void;
  resetToDefaults: () => Promise<void>;
  copyShareLink: () => Promise<string>;
}

const SHARE_HASH_PREFIX = "#s=";

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

function persistState(state: PersistedState): void {
  try {
    void Promise.resolve(saveState(state)).catch(() => undefined);
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
  const [household, setHousehold] = useState<Household | null>(null);
  const [away, setAway] = useState<AwayMap>({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function initialize(): Promise<void> {
      const sharedState = readShareState();
      const storedState = sharedState ?? (await loadState());
      const nextState =
        storedState ?? {
          household: await fetchDefaultHousehold(),
          away: {},
        };

      if (cancelled) {
        return;
      }

      setHousehold(nextState.household);
      setAway(nextState.away);
      setReady(true);
    }

    void initialize();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready || household === null) {
      return;
    }

    persistState({ household, away });
  }, [away, household, ready]);

  const toggleAway = useCallback((personId: string, weekKey: string) => {
    setAway((currentAway) => {
      const weeks = new Set(currentAway[personId] ?? []);

      if (weeks.has(weekKey)) {
        weeks.delete(weekKey);
      } else {
        weeks.add(weekKey);
      }

      const nextAway = { ...currentAway };
      const nextWeeks = Array.from(weeks).sort();

      if (nextWeeks.length === 0) {
        delete nextAway[personId];
      } else {
        nextAway[personId] = nextWeeks;
      }

      return nextAway;
    });
  }, []);

  const resetToDefaults = useCallback(async () => {
    const defaultHousehold = await fetchDefaultHousehold();
    setHousehold(defaultHousehold);
    setAway({});
    setReady(true);
  }, []);

  const copyShareLink = useCallback(async () => {
    if (household === null) {
      throw new Error("Household state is not ready.");
    }

    const url = buildShareUrl({ household, away });
    await window.navigator.clipboard.writeText(url);
    return url;
  }, [away, household]);

  return {
    household,
    away,
    ready,
    setHousehold,
    setAway,
    toggleAway,
    resetToDefaults,
    copyShareLink,
  };
}
