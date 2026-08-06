import { describe, expect, it } from 'vitest'
import { FALLBACK_HOUSEHOLD } from './defaults'
import { parseSeedHistoryImport } from './seedRotaImport'

describe('parseSeedHistoryImport', () => {
  it('imports weeks using person and chore names', () => {
    const result = parseSeedHistoryImport(
      FALLBACK_HOUSEHOLD,
      JSON.stringify({
        '2026-W28': {
          Kitchen: 'Person 1',
          'Bath up': 'Person 3',
          'Bath down': 'Person 2',
          Hallway: 'Person 5',
          Cardboard: 'Person 4',
        },
      }),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }
    expect(result.overrides['2026-W28']).toEqual({
      kitchen: 'person-1',
      'bath-up': 'person-3',
      'bath-down': 'person-2',
      hallway: 'person-5',
      cardboard: 'person-4',
    })
  })

  it('accepts person number shortcuts', () => {
    const result = parseSeedHistoryImport(
      FALLBACK_HOUSEHOLD,
      JSON.stringify({
        '2026-W29': {
          kitchen: '2',
          'bath-up': 'person-1',
          'bath-down': '4',
          towels: '5',
          pag: '3',
        },
      }),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }
    expect(result.overrides['2026-W29'].kitchen).toBe('person-2')
  })

  it('rejects empty or invalid JSON', () => {
    expect(parseSeedHistoryImport(FALLBACK_HOUSEHOLD, '').ok).toBe(false)
    expect(parseSeedHistoryImport(FALLBACK_HOUSEHOLD, '{').ok).toBe(false)
  })
})
