import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchDefaultHousehold } from '../lib/defaults'
import { encodeShareHash } from '../lib/share'
import { STORAGE_KEY } from '../lib/storage'
import type { Household, PersistedState } from '../types'
import { useHousehold } from './useHousehold'

vi.mock('../lib/defaults', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/defaults')>()

  return {
    ...actual,
    fetchDefaultHousehold: vi.fn(),
  }
})

const defaultHousehold: Household = {
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
}

const storedState: PersistedState = {
  household: {
    people: [
      {
        id: 'sam',
        name: 'Sam',
        bathZone: 'down',
      },
    ],
    chores: [
      {
        id: 'trash',
        name: 'Trash',
        cadence: 'weekly',
      },
    ],
    biweeklyParity: 1,
  },
  away: {
    sam: ['2026-W30'],
  },
}

const mockedFetchDefaultHousehold = vi.mocked(fetchDefaultHousehold)

function readStoredState(): PersistedState | null {
  const rawState = localStorage.getItem(STORAGE_KEY)

  return rawState === null ? null : (JSON.parse(rawState) as PersistedState)
}

describe('useHousehold', () => {
  beforeEach(() => {
    localStorage.clear()
    window.history.replaceState(null, '', '/')
    vi.clearAllMocks()
    mockedFetchDefaultHousehold.mockResolvedValue(defaultHousehold)
  })

  it('imports a share hash, saves it, and clears the hash', async () => {
    window.history.replaceState(
      null,
      '',
      `/chores/${encodeShareHash(storedState)}`,
    )

    const { result } = renderHook(() => useHousehold())

    await waitFor(() => expect(result.current.ready).toBe(true))

    expect(result.current.household).toEqual(storedState.household)
    expect(result.current.away).toEqual(storedState.away)
    expect(readStoredState()).toEqual(storedState)
    expect(window.location.hash).toBe('')
    expect(mockedFetchDefaultHousehold).not.toHaveBeenCalled()
  })

  it('does not persist the empty initial household while defaults load', async () => {
    let resolveDefaults: (household: Household) => void = () => undefined
    mockedFetchDefaultHousehold.mockReturnValue(
      new Promise<Household>((resolve) => {
        resolveDefaults = resolve
      }),
    )

    const { result } = renderHook(() => useHousehold())

    expect(result.current.ready).toBe(false)
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()

    await act(async () => {
      resolveDefaults(defaultHousehold)
      await Promise.resolve()
    })

    await waitFor(() => expect(result.current.ready).toBe(true))

    expect(result.current.household).toEqual(defaultHousehold)
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('clears storage on reset and persists later user changes', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(storedState))

    const { result } = renderHook(() => useHousehold())

    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current.household).toEqual(storedState.household)

    await act(async () => {
      await result.current.resetToDefaults()
      await Promise.resolve()
    })

    expect(result.current.household).toEqual(defaultHousehold)
    expect(result.current.away).toEqual({})
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()

    act(() => {
      result.current.setAway({ alex: ['2026-W31'] })
    })

    await waitFor(() =>
      expect(readStoredState()).toEqual({
        household: defaultHousehold,
        away: { alex: ['2026-W31'] },
      }),
    )
  })
})
