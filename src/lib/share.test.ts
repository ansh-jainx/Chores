import { describe, expect, it } from 'vitest'
import type { PersistedState } from '../types'
import { decodeShareHash, encodeShareHash } from './share'

const state: PersistedState = {
  household: {
    people: [
      {
        id: 'alex',
        name: 'Alex',
        bathZone: 'up',
      },
      {
        id: 'sam',
        name: 'Sam',
        bathZone: 'down',
      },
    ],
    chores: [
      {
        id: 'kitchen',
        name: 'Kitchen',
        cadence: 'weekly',
      },
      {
        id: 'bathroom-up',
        name: 'Upstairs bathroom',
        cadence: 'biweekly',
        zone: 'up',
      },
    ],
    biweeklyParity: 1,
  },
  away: {
    sam: ['2026-W30'],
  },
}

describe('share hashes', () => {
  it('round-trips persisted state through a base64url hash', () => {
    const hash = encodeShareHash(state)

    expect(hash).toMatch(/^#s=[A-Za-z0-9_-]+$/)
    expect(decodeShareHash(hash)).toEqual(state)
  })

  it('returns null for invalid input', () => {
    expect(decodeShareHash('')).toBeNull()
    expect(decodeShareHash('#s=not valid')).toBeNull()
    expect(decodeShareHash('#s=bm90LWpzb24')).toBeNull()
    expect(decodeShareHash('#s=e30')).toBeNull()
  })
})
