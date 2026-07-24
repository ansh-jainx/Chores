import type { PersistedState } from '../types'
import { parsePersistedState } from './persistedState'

export const STORAGE_KEY = 'flat-chores-v1'

function getStorage(): Storage | null {
  return typeof localStorage === 'undefined' ? null : localStorage
}

function removeStoredState(storage: Storage): void {
  try {
    storage.removeItem(STORAGE_KEY)
  } catch {
    // Ignore storage failures so callers can recover in memory.
  }
}

export function loadState(): PersistedState | null {
  const storage = getStorage()

  if (storage === null) {
    return null
  }

  let rawState: string | null

  try {
    rawState = storage.getItem(STORAGE_KEY)
  } catch {
    return null
  }

  if (rawState === null) {
    return null
  }

  try {
    const parsedState: unknown = JSON.parse(rawState)
    const validState = parsePersistedState(parsedState)

    if (validState !== null) {
      return validState
    }
  } catch {
    // Invalid JSON is treated the same as an invalid persisted shape below.
  }

  removeStoredState(storage)
  return null
}

export function saveState(state: PersistedState): void {
  const storage = getStorage()

  if (storage === null) {
    return
  }

  storage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export function clearState(): void {
  const storage = getStorage()

  if (storage === null) {
    return
  }

  removeStoredState(storage)
}
