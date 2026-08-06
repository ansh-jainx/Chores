import { describe, expect, it } from 'vitest'
import { removePersonFromOverrides } from './overrides'

describe('removePersonFromOverrides', () => {
  it('unlocks weeks that assigned the removed person', () => {
    const next = removePersonFromOverrides(
      {
        '2026-W30': { kitchen: 'person-1', hallway: 'person-2' },
        '2026-W31': { kitchen: 'person-3', towels: 'person-4' },
      },
      'person-1',
    )

    expect(next).toEqual({
      '2026-W31': { kitchen: 'person-3', towels: 'person-4' },
    })
  })

  it('leaves unrelated weeks untouched', () => {
    const overrides = {
      '2026-W32': { kitchen: 'person-5' },
    }
    expect(removePersonFromOverrides(overrides, 'person-1')).toEqual(overrides)
  })

  it('returns an empty map when every week referenced the person', () => {
    expect(
      removePersonFromOverrides(
        { '2026-W30': { kitchen: 'person-2' } },
        'person-2',
      ),
    ).toEqual({})
  })
})
