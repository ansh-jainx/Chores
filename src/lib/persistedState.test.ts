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
    alex: [{ id: '2026-W30', name: 'Holiday', from: '2026-07-20', until: '2026-07-27' }],
  },
  completions: {},
  overrides: {},
}

describe('parsePersistedState', () => {
  it('returns a clean persisted state for valid input', () => {
    expect(parsePersistedState(state)).toEqual(state)
  })

  it('migrates legacy week-key away lists into date ranges', () => {
    expect(
      parsePersistedState({
        household: state.household,
        away: { alex: ['2026-W30'] },
      }),
    ).toEqual(state)
  })

  it('defaults missing completions to an empty map', () => {
    expect(
      parsePersistedState({
        household: state.household,
        away: state.away,
      }),
    ).toEqual(state)
  })

  it('parses checklist completions by week', () => {
    expect(
      parsePersistedState({
        household: state.household,
        away: state.away,
        completions: { '2026-W30': ['kitchen', 'hallway'] },
      }),
    ).toEqual({
      ...state,
      completions: { '2026-W30': ['kitchen', 'hallway'] },
    })
  })

  it('rejects invalid completion week keys', () => {
    expect(
      parsePersistedState({
        household: state.household,
        away: state.away,
        completions: { notAWeek: ['kitchen'] },
      }),
    ).toBeNull()
  })

  it('defaults missing overrides to an empty map', () => {
    expect(
      parsePersistedState({
        household: state.household,
        away: state.away,
        completions: {},
      }),
    ).toEqual(state)
  })

  it('parses seeded week overrides', () => {
    expect(
      parsePersistedState({
        household: state.household,
        away: state.away,
        completions: {},
        overrides: { '2026-W30': { kitchen: 'alex' } },
      }),
    ).toEqual({
      ...state,
      overrides: { '2026-W30': { kitchen: 'alex' } },
    })
  })

  it('rejects unsafe keys in overrides', () => {
    for (const unsafeKey of ['__proto__', 'constructor', 'prototype']) {
      expect(
        parsePersistedState({
          household: state.household,
          away: state.away,
          completions: {},
          overrides: { [unsafeKey]: { kitchen: 'alex' } },
        }),
      ).toBeNull()

      expect(
        parsePersistedState({
          household: state.household,
          away: state.away,
          completions: {},
          overrides: { '2026-W30': { [unsafeKey]: 'alex' } },
        }),
      ).toBeNull()
    }
  })

  it('rejects non-week keys in overrides', () => {
    expect(
      parsePersistedState({
        household: state.household,
        away: state.away,
        completions: {},
        overrides: { notAWeek: { kitchen: 'alex' } },
      }),
    ).toBeNull()
  })

  it('rejects non-string person ids in overrides', () => {
    expect(
      parsePersistedState({
        household: state.household,
        away: state.away,
        completions: {},
        overrides: { '2026-W30': { kitchen: 123 } },
      }),
    ).toBeNull()
  })

  it('rejects objects with unexpected prototypes', () => {
    const stateWithNullPrototype = Object.assign(Object.create(null), state)

    expect(parsePersistedState(stateWithNullPrototype)).toBeNull()
  })
})
