import { describe, it, expect, vi, afterEach } from 'vitest'
import { compareIds } from '../../src/engine/order.ts'
import { CATALOGUE } from '../../src/engine/catalogue.ts'
import { scheduleAll } from '../../src/engine/scheduler.ts'
import { Weapon } from '../../src/engine/types.ts'
import { makeCompetition, makeConfig, makeStrips } from '../helpers/factories.ts'

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
    expect(compareIds('\u{1F600}', '\uFFFF')).toBeGreaterThan(0)
    expect(compareIds('\uFFFF', '\u{1F600}')).toBeLessThan(0)
  })
})

describe('the scheduler\'s node tie-break', () => {
  afterEach(() => vi.restoreAllMocks())

  it.each([['JR-A', 'Y14-A'], ['Y14-A', 'JR-A']])(
    'seats JR-A before Y14-A (input order %s, %s) when localeCompare follows Lithuanian',
    (...ids) => {
      // Two events alike in everything but id and weapon, on a board where only
      // one can run at a time, so `compareNodes` falls through to the id.
      // Lithuanian puts "Y" between "I" and "J" [M] and would seat Y14-A first.
      const lithuanian = new Intl.Collator('lt')
      vi.spyOn(String.prototype, 'localeCompare').mockImplementation(function (this: string, that: string) {
        return lithuanian.compare(this, that)
      })
      const config = makeConfig({
        days_available: 1, strips: makeStrips(8, 2), strips_total: 8, video_strips_total: 2,
      })
      const comps = ids.map(id => makeCompetition({
        id, fencer_count: 36, weapon: id === 'JR-A' ? Weapon.FOIL : Weapon.EPEE,
      }))

      const { schedule } = scheduleAll(comps, config)

      expect(schedule['JR-A'].pool_start).not.toBeNull()
      expect(schedule['JR-A'].pool_start!).toBeLessThan(schedule['Y14-A'].pool_start!)
    },
  )
})
