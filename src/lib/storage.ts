import type { PersistedState } from '../types'

export const STORAGE_KEY = 'flat-chores-v1'

export function loadState(): PersistedState | null {
  try {
    const rawState = localStorage.getItem(STORAGE_KEY)

    if (rawState === null) {
      return null
    }

    return JSON.parse(rawState) as PersistedState
  } catch {
    return null
  }
}

export function saveState(state: PersistedState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export function clearState(): void {
  localStorage.removeItem(STORAGE_KEY)
}
