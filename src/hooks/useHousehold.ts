import { useCallback, useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import {
  initCloudSync,
  loadFirebaseConfig,
  pushCloudState,
  subscribeCloudState,
  type SyncStatus,
} from '../lib/cloudSync'
import { EMPTY_AWAY, fetchDefaultHousehold } from '../lib/defaults'
import { decodeShareHash, encodeShareHash } from '../lib/share'
import { clearState, loadState, saveState } from '../lib/storage'
import type {
  AwayMap,
  CompletionMap,
  Household,
  PersistedState,
  WeekOverrideMap,
} from '../types'

export interface UseHouseholdResult {
  household: Household
  away: AwayMap
  completions: CompletionMap
  overrides: WeekOverrideMap
  ready: boolean
  syncStatus: SyncStatus
  setHousehold: Dispatch<SetStateAction<Household>>
  setAway: Dispatch<SetStateAction<AwayMap>>
  setOverrides: Dispatch<SetStateAction<WeekOverrideMap>>
  addAbsence: (
    personId: string,
    name: string,
    from: string,
    until: string,
  ) => void
  removeAbsence: (personId: string, absenceId: string) => void
  toggleCompletion: (weekKey: string, choreId: string) => void
  resetToDefaults: () => Promise<void>
  copyShareLink: () => Promise<string>
}

function withOverrides(state: PersistedState): PersistedState {
  return {
    ...state,
    overrides: state.overrides ?? {},
  }
}

function baseState(
  current: PersistedState | null,
  patch: Partial<PersistedState>,
): PersistedState {
  return {
    household: patch.household ?? current?.household ?? INITIAL_HOUSEHOLD,
    away: patch.away ?? current?.away ?? {},
    completions: patch.completions ?? current?.completions ?? {},
    overrides: patch.overrides ?? current?.overrides ?? {},
  }
}

const SHARE_HASH_PREFIX = '#s='
const INITIAL_HOUSEHOLD: Household = {
  people: [],
  chores: [],
  biweeklyParity: 0,
}
const CLOUD_SAVE_DEBOUNCE_MS = 350

function readShareState(): PersistedState | null {
  if (typeof window === 'undefined') {
    return null
  }

  const { hash } = window.location
  if (!hash.startsWith(SHARE_HASH_PREFIX)) {
    return null
  }

  try {
    return decodeShareHash(hash)
  } catch {
    return null
  }
}

function clearShareHash(): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.history.replaceState(
      window.history.state,
      document.title,
      `${window.location.pathname}${window.location.search}`,
    )
  } catch {
    // Clearing the hash is best-effort; imported state is still applied.
  }
}

function persistLocal(state: PersistedState): void {
  try {
    saveState(state)
  } catch {
    // Ignore storage failures so the in-memory app state remains usable.
  }
}

function buildShareUrl(state: PersistedState): string {
  if (typeof window === 'undefined') {
    throw new Error('Share links can only be created in a browser.')
  }

  const shareHash = encodeShareHash(state)
  const url = new URL(window.location.href)
  url.hash = shareHash.startsWith('#') ? shareHash : `#${shareHash}`
  return url.toString()
}

function sameState(left: PersistedState, right: PersistedState): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

export function useHousehold(): UseHouseholdResult {
  const [state, setState] = useState<PersistedState | null>(null)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('connecting')
  const stateRef = useRef<PersistedState | null>(null)
  const skipNextLocalPersistRef = useRef(false)
  const applyingRemoteRef = useRef(false)
  const lastLocalWriteAtRef = useRef(0)
  const cloudEnabledRef = useRef(false)
  const saveTimerRef = useRef<number | null>(null)

  stateRef.current = state

  useEffect(() => {
    let cancelled = false
    let unsubscribe: (() => void) | undefined

    async function initialize(): Promise<void> {
      setSyncStatus('connecting')

      const sharedState = readShareState()
      const storedState = loadState()
      const config = await loadFirebaseConfig()
      const cloudReady = config !== null && initCloudSync(config)
      cloudEnabledRef.current = cloudReady

      if (cancelled) {
        return
      }

      if (!cloudReady) {
        const nextState = withOverrides(
          sharedState ??
            storedState ?? {
              household: await fetchDefaultHousehold(),
              away: {},
              completions: {},
              overrides: {},
            },
        )

        if (sharedState !== null) {
          persistLocal(nextState)
          clearShareHash()
        }

        skipNextLocalPersistRef.current = true
        setState(nextState)
        setSyncStatus('local-only')
        return
      }

      // Cloud mode: prefer remote, then share hash, then local, then defaults.
      let resolved = false

      unsubscribe = subscribeCloudState(
        (payload) => {
          if (cancelled) {
            return
          }

          if (!resolved) {
            resolved = true

            void (async () => {
              let nextState: PersistedState

              if (payload !== null) {
                nextState = withOverrides(payload.state)
                lastLocalWriteAtRef.current = payload.updatedAt
              } else if (sharedState !== null) {
                nextState = withOverrides(sharedState)
                clearShareHash()
                try {
                  lastLocalWriteAtRef.current = await pushCloudState(nextState)
                } catch {
                  setSyncStatus('error')
                }
              } else if (storedState !== null) {
                nextState = withOverrides(storedState)
                try {
                  lastLocalWriteAtRef.current = await pushCloudState(nextState)
                } catch {
                  setSyncStatus('error')
                }
              } else {
                nextState = {
                  household: await fetchDefaultHousehold(),
                  away: {},
                  completions: {},
                  overrides: {},
                }
                try {
                  lastLocalWriteAtRef.current = await pushCloudState(nextState)
                } catch {
                  setSyncStatus('error')
                }
              }

              if (cancelled) {
                return
              }

              applyingRemoteRef.current = true
              skipNextLocalPersistRef.current = true
              setState(nextState)
              persistLocal(nextState)
              setSyncStatus((current) =>
                current === 'error' ? current : 'synced',
              )
            })()
            return
          }

          if (payload === null) {
            return
          }

          // Ignore echoes of our own writes.
          if (payload.updatedAt <= lastLocalWriteAtRef.current) {
            setSyncStatus('synced')
            return
          }

          const remoteState = withOverrides(payload.state)
          const current = stateRef.current
          if (current !== null && sameState(current, remoteState)) {
            lastLocalWriteAtRef.current = payload.updatedAt
            setSyncStatus('synced')
            return
          }

          lastLocalWriteAtRef.current = payload.updatedAt
          applyingRemoteRef.current = true
          skipNextLocalPersistRef.current = true
          setState(remoteState)
          persistLocal(remoteState)
          setSyncStatus('synced')
        },
        () => {
          if (!cancelled) {
            setSyncStatus('error')
          }
        },
      )
    }

    void initialize()

    return () => {
      cancelled = true
      unsubscribe?.()
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (state === null) {
      return
    }

    if (skipNextLocalPersistRef.current) {
      skipNextLocalPersistRef.current = false
      return
    }

    persistLocal(state)

    if (!cloudEnabledRef.current) {
      return
    }

    if (applyingRemoteRef.current) {
      applyingRemoteRef.current = false
      return
    }

    setSyncStatus('saving')
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current)
    }

    const snapshot = state
    saveTimerRef.current = window.setTimeout(() => {
      void pushCloudState(snapshot)
        .then((updatedAt) => {
          lastLocalWriteAtRef.current = updatedAt
          setSyncStatus('synced')
        })
        .catch(() => {
          setSyncStatus('error')
        })
    }, CLOUD_SAVE_DEBOUNCE_MS)
  }, [state])

  const setHousehold = useCallback<Dispatch<SetStateAction<Household>>>(
    (nextHousehold) => {
      setState((currentState) => {
        const currentHousehold = currentState?.household ?? INITIAL_HOUSEHOLD
        const householdValue =
          typeof nextHousehold === 'function'
            ? nextHousehold(currentHousehold)
            : nextHousehold

        return baseState(currentState, { household: householdValue })
      })
    },
    [],
  )

  const setAway = useCallback<Dispatch<SetStateAction<AwayMap>>>((nextAway) => {
    setState((currentState) => {
      const currentAway = currentState?.away ?? {}
      const awayValue =
        typeof nextAway === 'function' ? nextAway(currentAway) : nextAway

      return baseState(currentState, { away: awayValue })
    })
  }, [])

  const setOverrides = useCallback<Dispatch<SetStateAction<WeekOverrideMap>>>(
    (nextOverrides) => {
      setState((currentState) => {
        const currentOverrides = currentState?.overrides ?? {}
        const overridesValue =
          typeof nextOverrides === 'function'
            ? nextOverrides(currentOverrides)
            : nextOverrides

        return baseState(currentState, { overrides: overridesValue })
      })
    },
    [],
  )

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

        return baseState(currentState, {
          away: {
            ...currentState.away,
            [personId]: [...existing, absence],
          },
        })
      })
    },
    [],
  )

  const removeAbsence = useCallback((personId: string, absenceId: string) => {
    setState((currentState) => {
      if (currentState === null) {
        return currentState
      }

      const nextAway = { ...currentState.away }
      const remaining = (nextAway[personId] ?? []).filter(
        (absence) => absence.id !== absenceId,
      )

      if (remaining.length === 0) {
        delete nextAway[personId]
      } else {
        nextAway[personId] = remaining
      }

      return baseState(currentState, { away: nextAway })
    })
  }, [])

  const toggleCompletion = useCallback((weekKey: string, choreId: string) => {
    setState((currentState) => {
      if (currentState === null) {
        return currentState
      }

      const currentWeek = new Set(currentState.completions[weekKey] ?? [])
      if (currentWeek.has(choreId)) {
        currentWeek.delete(choreId)
      } else {
        currentWeek.add(choreId)
      }

      const nextCompletions: CompletionMap = { ...currentState.completions }
      const nextIds = Array.from(currentWeek).sort()
      if (nextIds.length === 0) {
        delete nextCompletions[weekKey]
      } else {
        nextCompletions[weekKey] = nextIds
      }

      // Keep checklist history bounded.
      const weekKeys = Object.keys(nextCompletions).sort()
      if (weekKeys.length > 16) {
        for (const oldKey of weekKeys.slice(0, weekKeys.length - 16)) {
          delete nextCompletions[oldKey]
        }
      }

      return baseState(currentState, { completions: nextCompletions })
    })
  }, [])

  const resetToDefaults = useCallback(async () => {
    const defaultHousehold = await fetchDefaultHousehold()
    const nextState = {
      household: defaultHousehold,
      away: {},
      completions: {},
      overrides: {},
    }

    clearState()
    skipNextLocalPersistRef.current = true
    setState(nextState)
    persistLocal(nextState)

    if (cloudEnabledRef.current) {
      setSyncStatus('saving')
      try {
        lastLocalWriteAtRef.current = await pushCloudState(nextState)
        setSyncStatus('synced')
      } catch {
        setSyncStatus('error')
      }
    }
  }, [])

  const copyShareLink = useCallback(async () => {
    if (state === null) {
      throw new Error('Household state is not ready.')
    }

    const url = buildShareUrl(state)
    await window.navigator.clipboard.writeText(url)
    return url
  }, [state])

  const household = state?.household ?? INITIAL_HOUSEHOLD
  const away = state?.away ?? EMPTY_AWAY
  const completions = state?.completions ?? {}
  const overrides = state?.overrides ?? {}

  return {
    household,
    away,
    completions,
    overrides,
    ready: state !== null,
    syncStatus,
    setHousehold,
    setAway,
    setOverrides,
    addAbsence,
    removeAbsence,
    toggleCompletion,
    resetToDefaults,
    copyShareLink,
  }
}
