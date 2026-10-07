import { describe, it, expect } from 'vitest'
import { compareIds } from '../../src/engine/order.ts'
import { CATALOGUE } from '../../src/engine/catalogue.ts'

const catalogueIds = CATALOGUE.map(e => e.id)

/** The reference order: plain code-unit comparison, which equals code-point order for ASCII ids. */
const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

describe('compareIds', () => {
  it('sorts every catalogue id in code-point order', () => {
    expect([...catalogueIds].sort(compareIds)).toEqual([...catalogueIds].sort(byCodeUnit))
  })

  it('sorts the catalogue the way the en locale does, so the scheduler keeps its order', () => {
    expect([...catalogueIds].sort(compareIds)).toEqual(
      [...catalogueIds].sort((a, b) => a.localeCompare(b, 'en')),
    )
  })

  it('differs from the Lithuanian locale, which is why the locale must not decide', () => {
    expect([...catalogueIds].sort((a, b) => a.localeCompare(b, 'lt'))).not.toEqual(
      [...catalogueIds].sort(byCodeUnit),
    )
  })

  it('returns 0 for equal ids and orders a prefix before its extension', () => {
    expect(compareIds('JR-M-FOIL-IND', 'JR-M-FOIL-IND')).toBe(0)
    expect(compareIds('JR-M', 'JR-M-FOIL-IND')).toBeLessThan(0)
    expect(compareIds('JR-M-FOIL-IND', 'JR-M')).toBeGreaterThan(0)
  })

  it('compares by code point, not by UTF-16 unit, past the basic plane', () => {
    // U+1F600 is the surrogate pair D83D DE00, which a unit comparison puts before U+FFFF.
    expect(compareIds('\u{1F600}', '￿')).toBeGreaterThan(0)
    expect(compareIds('￿', '\u{1F600}')).toBeLessThan(0)
  })
})
