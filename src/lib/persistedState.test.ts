import { describe, expect, it } from 'vitest'
import type { PersistedState } from '../types'
import { parsePersistedState } from './persistedState'

const state: PersistedState = {
  household: {
    people: [{ id: 'alex', name: 'Alex', bathZone: 'up' }],
    chores: [{ id: 'kitchen', name: 'Kitchen', cadence: 'weekly' }],
    biweeklyParity: 0,
  },
  away: {
    alex: ['2026-W30'],
  },
}

describe('parsePersistedState', () => {
  it('returns a clean persisted state for valid input', () => {
    expect(parsePersistedState(state)).toEqual(state)
  })

  it('rejects objects with unexpected prototypes', () => {
    const stateWithNullPrototype = Object.assign(Object.create(null), state)

    expect(parsePersistedState(stateWithNullPrototype)).toBeNull()
  })
})
