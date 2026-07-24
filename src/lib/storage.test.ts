import { beforeEach, describe, expect, it } from 'vitest'
import type { PersistedState } from '../types'
import { loadState, saveState, STORAGE_KEY } from './storage'

const state: PersistedState = {
  household: {
    people: [
      {
        id: 'alex',
        name: 'Alex',
        bathZone: 'up',
      },
    ],
    chores: [
      {
        id: 'kitchen',
        name: 'Kitchen',
        cadence: 'weekly',
      },
    ],
    biweeklyParity: 0,
  },
  away: {
    alex: [{ id: '2026-W30', name: 'Holiday', from: '2026-07-20', until: '2026-07-27' }],
  },
  completions: {},
}

describe('storage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns null when no state is stored', () => {
    expect(loadState()).toBeNull()
  })

  it('round-trips persisted state', () => {
    saveState(state)

    expect(loadState()).toEqual(state)
  })

  it('clears invalid JSON from localStorage', () => {
    localStorage.setItem(STORAGE_KEY, '{')

    expect(loadState()).toBeNull()
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('clears structurally invalid persisted state from localStorage', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        household: {
          people: [{ id: 'alex', name: 'Alex', bathZone: 'roof' }],
          chores: [],
          biweeklyParity: 0,
        },
        away: {},
      }),
    )

    expect(loadState()).toBeNull()
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('clears prototype-pollution shaped persisted state from localStorage', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        household: {
          people: [
            {
              id: 'alex',
              name: 'Alex',
              bathZone: 'up',
              ['__proto__']: { polluted: true },
            },
          ],
          chores: [],
          biweeklyParity: 0,
        },
        away: {},
      }),
    )

    expect(loadState()).toBeNull()
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })
})
