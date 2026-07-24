import { describe, expect, it } from 'vitest'
import type { PersistedState } from '../types'
import { decodeShareHash, encodeShareHash } from './share'

const state: PersistedState = {
  household: {
    people: [
      {
        id: 'alex',
        name: 'Alex 🧹',
        bathZone: 'up',
      },
      {
        id: 'sam',
        name: 'Sâm',
        bathZone: 'down',
      },
    ],
    chores: [
      {
        id: 'kitchen',
        name: 'Kitchen – surfaces',
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

function encodeRawShareHash(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('')
  const encoded = btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '')

  return `#s=${encoded}`
}

describe('share hashes', () => {
  it('round-trips persisted state with unicode names through a base64url hash', () => {
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

  it('returns null for structurally invalid persisted state', () => {
    expect(
      decodeShareHash(
        encodeRawShareHash({
          household: {
            people: [{ id: 'alex', name: 'Alex', bathZone: 'sideways' }],
            chores: [],
            biweeklyParity: 0,
          },
          away: {},
        }),
      ),
    ).toBeNull()

    expect(
      decodeShareHash(
        encodeRawShareHash({
          household: {
            people: [],
            chores: [{ id: 'kitchen', name: 'Kitchen', cadence: 'monthly' }],
            biweeklyParity: 0,
          },
          away: {},
        }),
      ),
    ).toBeNull()

    expect(
      decodeShareHash(
        encodeRawShareHash({
          household: {
            people: [],
            chores: [],
            biweeklyParity: 2,
          },
          away: { alex: [123] },
        }),
      ),
    ).toBeNull()
  })

  it('returns null for prototype-pollution shaped state', () => {
    expect(
      decodeShareHash(
        encodeRawShareHash({
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
      ),
    ).toBeNull()

    expect(
      decodeShareHash(
        encodeRawShareHash({
          household: {
            people: [],
            chores: [],
            biweeklyParity: 0,
          },
          away: {
            ['__proto__']: ['2026-W30'],
          },
        }),
      ),
    ).toBeNull()
  })
})
