import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { useStore } from '../../src/store/store.ts'
import { CATALOGUE, TEMPLATES, TEMPLATE_FENCER_DEFAULTS, fencerDefaultKeyOf, findCompetition } from '../../src/engine/catalogue.ts'
import {
  MAX_FENCERS,
  MIN_FENCERS,
  NAC_FENCER_DEFAULTS,
  REGIONAL_CUT_TOURNAMENT_TYPES,
  REGIONAL_FENCER_DEFAULTS,
} from '../../src/engine/constants.ts'
import { TournamentType } from '../../src/engine/types.ts'

// 018 T4 (R6): an event added by hand starts at its default count for the
// tournament type, never at 0, so a fresh add can never reach the engine
// unsizeable.

beforeEach(() => {
  useStore.setState(useStore.getInitialState())
})

describe('the fencer default tables', () => {
  it.each([
    ['NAC_FENCER_DEFAULTS', NAC_FENCER_DEFAULTS],
    ['REGIONAL_FENCER_DEFAULTS', REGIONAL_FENCER_DEFAULTS],
  ])('%s gives every catalogue event a whole-number default inside MIN_FENCERS–MAX_FENCERS', (_name, table) => {
    const bad = CATALOGUE.filter((entry) => {
      const value = table[fencerDefaultKeyOf(entry)]
      return value === undefined || !Number.isInteger(value) || value < MIN_FENCERS || value > MAX_FENCERS
    }).map((entry) => entry.id)
    expect(bad).toEqual([])
  })
})

describe('addCompetition starts an event at the default for the tournament type', () => {
  const ID = 'CDT-M-FOIL-IND'
  const entry = findCompetition(ID)!
  const key = fencerDefaultKeyOf(entry)

  it('premise: the two tables disagree on the event, so the test can tell them apart', () => {
    expect(NAC_FENCER_DEFAULTS[key]).not.toBe(REGIONAL_FENCER_DEFAULTS[key])
  })

  it('uses NAC_FENCER_DEFAULTS at a NAC', () => {
    useStore.getState().setTournamentType(TournamentType.NAC)
    useStore.getState().addCompetition(ID)
    expect(useStore.getState().selectedCompetitions[ID].fencer_count).toBe(NAC_FENCER_DEFAULTS[key])
  })

  it.each([...REGIONAL_CUT_TOURNAMENT_TYPES])('uses REGIONAL_FENCER_DEFAULTS at a %s', (type) => {
    useStore.getState().setTournamentType(type as TournamentType)
    useStore.getState().addCompetition(ID)
    expect(useStore.getState().selectedCompetitions[ID].fencer_count).toBe(REGIONAL_FENCER_DEFAULTS[key])
  })

  it('premise: every tournament type is a NAC or a regional type', () => {
    for (const type of Object.values(TournamentType)) {
      expect(type === TournamentType.NAC || REGIONAL_CUT_TOURNAMENT_TYPES.has(type), type).toBe(true)
    }
  })

  it('gives every catalogue event a count inside MIN_FENCERS–MAX_FENCERS at every tournament type', () => {
    const outOfRange: string[] = []
    for (const type of Object.values(TournamentType)) {
      useStore.setState(useStore.getInitialState())
      useStore.getState().setTournamentType(type)
      for (const { id } of CATALOGUE) useStore.getState().addCompetition(id)
      for (const [id, config] of Object.entries(useStore.getState().selectedCompetitions)) {
        if (config.fencer_count < MIN_FENCERS || config.fencer_count > MAX_FENCERS) outOfRange.push(`${type}:${id}`)
      }
    }
    expect(outOfRange).toEqual([])
  })
})

describe('applyTemplate starts every event at a sizeable count', () => {
  // Behaviour: a template whose own table lacks a key used to start the event
  // at 0, a count the engine cannot size. It now falls back to the table for
  // the tournament type, as addCompetition does.
  describe('a template with no table of its own', () => {
    const NAME = 'RYC Weekend'
    const saved = TEMPLATE_FENCER_DEFAULTS[NAME]
    beforeEach(() => {
      delete TEMPLATE_FENCER_DEFAULTS[NAME]
    })
    afterEach(() => {
      TEMPLATE_FENCER_DEFAULTS[NAME] = saved
    })

    it.each([
      [TournamentType.NAC, NAC_FENCER_DEFAULTS],
      [TournamentType.RYC, REGIONAL_FENCER_DEFAULTS],
    ])('falls back to the %s default table', (type, table) => {
      expect(TEMPLATE_FENCER_DEFAULTS[NAME], 'premise: the template table is gone').toBeUndefined()
      useStore.getState().setTournamentType(type)
      useStore.getState().applyTemplate(NAME)
      const counts = Object.entries(useStore.getState().selectedCompetitions)
      expect(counts.length).toBe(TEMPLATES[NAME].length)
      for (const [id, { fencer_count }] of counts) {
        expect(fencer_count, id).toBe(table[fencerDefaultKeyOf(findCompetition(id)!)])
      }
    })
  })

  // Guard: every shipped template already starts sizeable, with or without the fallback.
  it('gives every event of every template a whole count inside MIN_FENCERS–MAX_FENCERS, at every tournament type', () => {
    expect(Object.keys(TEMPLATES).length, 'premise: there are templates to sweep').toBeGreaterThan(0)
    const bad: string[] = []
    for (const type of Object.values(TournamentType)) {
      for (const name of Object.keys(TEMPLATES)) {
        useStore.setState(useStore.getInitialState())
        useStore.getState().setTournamentType(type)
        useStore.getState().applyTemplate(name)
        const chosen = Object.entries(useStore.getState().selectedCompetitions)
        if (chosen.length !== TEMPLATES[name].length) bad.push(`${type}:${name}: ${chosen.length} events selected`)
        for (const [id, { fencer_count: count }] of chosen) {
          if (!Number.isInteger(count) || count < MIN_FENCERS || count > MAX_FENCERS) bad.push(`${type}:${name}:${id}=${count}`)
        }
      }
    }
    expect(bad).toEqual([])
  })
})
