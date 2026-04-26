import { describe, it, expect } from 'vitest'
import { sequenceEventsForDay } from '../../src/engine/daySequencing.ts'
import { makeCompetition, makeConfig } from '../helpers/factories.ts'
import { Category, EventType, Gender, Weapon, VetAgeGroup } from '../../src/engine/types.ts'

const config = makeConfig()

describe('sequenceEventsForDay', () => {
  it('Y8 event is sorted before DIV1 event regardless of strip count', () => {
    const div1 = makeCompetition({ id: 'div1', category: Category.DIV1, strips_allocated: 20 })
    const y8 = makeCompetition({ id: 'y8', category: Category.Y8, strips_allocated: 4 })

    const result = sequenceEventsForDay([div1, y8], config)

    expect(result[0].id).toBe('y8')
    expect(result[1].id).toBe('div1')
  })

  it('Y10 event is sorted before DIV1 event regardless of strip count', () => {
    const div1 = makeCompetition({ id: 'div1', category: Category.DIV1, strips_allocated: 20 })
    const y10 = makeCompetition({ id: 'y10', category: Category.Y10, strips_allocated: 2 })

    const result = sequenceEventsForDay([div1, y10], config)

    expect(result[0].id).toBe('y10')
  })

  it('mandatory event is sorted before optional event', () => {
    const optional = makeCompetition({ id: 'opt', optional: true, strips_allocated: 16 })
    const mandatory = makeCompetition({ id: 'mand', optional: false, strips_allocated: 8 })

    const result = sequenceEventsForDay([optional, mandatory], config)

    expect(result[0].id).toBe('mand')
    expect(result[1].id).toBe('opt')
  })

  it('individual event is sorted before matching team event (same category/gender/weapon)', () => {
    const team = makeCompetition({
      id: 'team',
      category: Category.DIV1,
      event_type: EventType.TEAM,
      strips_allocated: 8,
    })
    const indiv = makeCompetition({
      id: 'indiv',
      category: Category.DIV1,
      event_type: EventType.INDIVIDUAL,
      strips_allocated: 8,
    })

    const result = sequenceEventsForDay([team, indiv], config)

    expect(result[0].id).toBe('indiv')
    expect(result[1].id).toBe('team')
  })

  it('among same-type events: larger strip demand first', () => {
    const small = makeCompetition({ id: 'small', category: Category.DIV1, strips_allocated: 4 })
    const large = makeCompetition({ id: 'large', category: Category.DIV1, strips_allocated: 12 })

    const result = sequenceEventsForDay([small, large], config)

    expect(result[0].id).toBe('large')
    expect(result[1].id).toBe('small')
  })

  it('among same strip demand: longer duration first', () => {
    // Give the same strips_allocated but different fencer counts so strip-hours differ.
    const shorter = makeCompetition({ id: 'short', category: Category.DIV1, strips_allocated: 8, fencer_count: 12 })
    const longer = makeCompetition({ id: 'long', category: Category.DIV1, strips_allocated: 8, fencer_count: 48 })

    const result = sequenceEventsForDay([shorter, longer], config)

    expect(result[0].id).toBe('long')
    expect(result[1].id).toBe('short')
  })

  it('flighting pair: priority event is immediately followed by its partner', () => {
    const groupId = 'flight-group-1'
    const priority = makeCompetition({
      id: 'priority',
      category: Category.DIV1,
      strips_allocated: 12,
      flighted: true,
      flighting_group_id: groupId,
      is_priority: true,
    })
    const partner = makeCompetition({
      id: 'partner',
      category: Category.DIV1,
      strips_allocated: 12,
      flighted: true,
      flighting_group_id: groupId,
      is_priority: false,
    })
    // A third event that would otherwise sort between them based on strip demand.
    const middle = makeCompetition({
      id: 'middle',
      category: Category.DIV1,
      strips_allocated: 12,
      flighted: false,
      flighting_group_id: null,
      is_priority: false,
    })

    const result = sequenceEventsForDay([partner, middle, priority], config)

    const priorityIdx = result.findIndex(c => c.id === 'priority')
    const partnerIdx = result.findIndex(c => c.id === 'partner')
    expect(partnerIdx).toBe(priorityIdx + 1)
  })

  it('mixed scenario exercises all tiebreakers in correct order', () => {
    const groupId = 'flight-group-x'
    const y8 = makeCompetition({ id: 'y8', category: Category.Y8, strips_allocated: 4 })
    const mandatory = makeCompetition({ id: 'mand', category: Category.DIV1, strips_allocated: 12, optional: false })
    const optional = makeCompetition({ id: 'opt', category: Category.JUNIOR, strips_allocated: 14, optional: true })
    const team = makeCompetition({
      id: 'team',
      category: Category.DIV1,
      event_type: EventType.TEAM,
      strips_allocated: 8,
      optional: false,
    })
    const priorityFlight = makeCompetition({
      id: 'priority',
      category: Category.DIV1,
      strips_allocated: 10,
      optional: false,
      flighted: true,
      flighting_group_id: groupId,
      is_priority: true,
    })
    const partnerFlight = makeCompetition({
      id: 'partner',
      category: Category.DIV1,
      strips_allocated: 10,
      optional: false,
      flighted: true,
      flighting_group_id: groupId,
      is_priority: false,
    })

    const result = sequenceEventsForDay(
      [optional, team, partnerFlight, mandatory, y8, priorityFlight],
      config,
    )

    // Y8 must be first
    expect(result[0].id).toBe('y8')

    // Optional event must come after all mandatory events
    const mandatoryPositions = result
      .filter(c => !c.optional)
      .map(c => result.indexOf(c))
    const optIdx = result.findIndex(c => c.id === 'opt')
    expect(Math.max(...mandatoryPositions)).toBeLessThan(optIdx)

    // Individual events before team events in the mandatory group
    const indivIdx = result.findIndex(c => c.id === 'mand')
    const teamIdx = result.findIndex(c => c.id === 'team')
    expect(indivIdx).toBeLessThan(teamIdx)

    // Flighted partner immediately follows priority
    const priorityIdx = result.findIndex(c => c.id === 'priority')
    const partnerIdx = result.findIndex(c => c.id === 'partner')
    expect(partnerIdx).toBe(priorityIdx + 1)
  })

  it('does not mutate the input array', () => {
    const events = [
      makeCompetition({ id: 'a', category: Category.DIV1 }),
      makeCompetition({ id: 'b', category: Category.Y8 }),
    ]
    const original = [...events]
    sequenceEventsForDay(events, config)
    expect(events.map(e => e.id)).toEqual(original.map(e => e.id))
  })
})

describe('sequenceEventsForDay — Vet age-descending tiebreaker (F3b)', () => {
  it('Test A — age-descending order overrides strip-demand for sibling Vet ind pairs', () => {
    // VET40 has the highest strip demand (80 fencers, 12 strips). Without the age-descending
    // sort key, strip-demand (key #4) would place VET40 first. The new key 3.5 must override
    // that and produce age-descending order: VET80 → VET60 → VET40.
    const vet40 = makeCompetition({
      id: 'vet40',
      category: Category.VETERAN,
      event_type: EventType.INDIVIDUAL,
      gender: Gender.MEN,
      weapon: Weapon.FOIL,
      vet_age_group: VetAgeGroup.VET40,
      fencer_count: 80,
      strips_allocated: 12,
    })
    const vet60 = makeCompetition({
      id: 'vet60',
      category: Category.VETERAN,
      event_type: EventType.INDIVIDUAL,
      gender: Gender.MEN,
      weapon: Weapon.FOIL,
      vet_age_group: VetAgeGroup.VET60,
      fencer_count: 30,
      strips_allocated: 5,
    })
    const vet80 = makeCompetition({
      id: 'vet80',
      category: Category.VETERAN,
      event_type: EventType.INDIVIDUAL,
      gender: Gender.MEN,
      weapon: Weapon.FOIL,
      vet_age_group: VetAgeGroup.VET80,
      fencer_count: 10,
      strips_allocated: 2,
    })

    const result = sequenceEventsForDay([vet40, vet60, vet80], config)

    expect(result.map(c => c.id)).toEqual(['vet80', 'vet60', 'vet40'])
  })

  it('Test B — cross-gender Vet pair: age-descending rule does not apply; strip-demand decides', () => {
    // VET40 M Foil (high strip demand) and VET60 W Foil (low strip demand) are different genders.
    // The age-descending key only fires for same-gender + same-weapon pairs, so key #4
    // (strip demand descending) should place VET40 first.
    const vet40m = makeCompetition({
      id: 'vet40m',
      category: Category.VETERAN,
      event_type: EventType.INDIVIDUAL,
      gender: Gender.MEN,
      weapon: Weapon.FOIL,
      vet_age_group: VetAgeGroup.VET40,
      fencer_count: 80,
      strips_allocated: 12,
    })
    const vet60w = makeCompetition({
      id: 'vet60w',
      category: Category.VETERAN,
      event_type: EventType.INDIVIDUAL,
      gender: Gender.WOMEN,
      weapon: Weapon.FOIL,
      vet_age_group: VetAgeGroup.VET60,
      fencer_count: 10,
      strips_allocated: 2,
    })

    const result = sequenceEventsForDay([vet40m, vet60w], config)

    // Strip demand decides: VET40 M has higher demand and sorts first.
    expect(result[0].id).toBe('vet40m')
    expect(result[1].id).toBe('vet60w')
  })

  it('Test C — non-Vet events are unaffected by the age-descending rule', () => {
    // Mix of a Vet event with non-Vet events. The age-descending tiebreaker returns null
    // for any pair involving a non-Vet event, so the existing chain governs all Vet↔non-Vet
    // and non-Vet↔non-Vet comparisons.
    //
    // Strip allocations chosen to produce a deterministic order via key #4 (strip demand
    // = strips_allocated × categoryWeight). Weights: VETERAN:VET40 = 0.8, JUNIOR = 1.3,
    // CADET = 1.3. To guarantee vet40 sorts first: 20×0.8=16 > 8×1.3=10.4 > 4×1.3=5.2.
    const vet40 = makeCompetition({
      id: 'vet40',
      category: Category.VETERAN,
      event_type: EventType.INDIVIDUAL,
      gender: Gender.MEN,
      weapon: Weapon.FOIL,
      vet_age_group: VetAgeGroup.VET40,
      fencer_count: 80,
      strips_allocated: 20,
      optional: false,
    })
    const junior = makeCompetition({
      id: 'junior',
      category: Category.JUNIOR,
      event_type: EventType.INDIVIDUAL,
      gender: Gender.MEN,
      weapon: Weapon.FOIL,
      fencer_count: 32,
      strips_allocated: 8,
      optional: false,
    })
    const cadet = makeCompetition({
      id: 'cadet',
      category: Category.CADET,
      event_type: EventType.INDIVIDUAL,
      gender: Gender.MEN,
      weapon: Weapon.FOIL,
      fencer_count: 16,
      strips_allocated: 4,
      optional: false,
    })

    const result = sequenceEventsForDay([vet40, junior, cadet], config)

    // Strip demand descending: vet40 (20×0.8=16) → junior (8×1.3=10.4) → cadet (4×1.3=5.2).
    // Vet age-descending rule is a no-op for Vet↔non-Vet pairs.
    expect(result.map(c => c.id)).toEqual(['vet40', 'junior', 'cadet'])
  })

  it('Test D — VET50 and VET70 weights are correct (covers all five age-band entries)', () => {
    // Test A only exercises VET40/VET60/VET80. This test pins VET50 and VET70
    // so a typo swapping their weights (e.g. VET70: 3 vs VET50: 1) would be caught.
    const vet50 = makeCompetition({
      id: 'vet50',
      category: Category.VETERAN,
      event_type: EventType.INDIVIDUAL,
      gender: Gender.MEN,
      weapon: Weapon.FOIL,
      vet_age_group: VetAgeGroup.VET50,
      fencer_count: 30,
      strips_allocated: 5,
    })
    const vet70 = makeCompetition({
      id: 'vet70',
      category: Category.VETERAN,
      event_type: EventType.INDIVIDUAL,
      gender: Gender.MEN,
      weapon: Weapon.FOIL,
      vet_age_group: VetAgeGroup.VET70,
      fencer_count: 20,
      strips_allocated: 4,
    })

    const result = sequenceEventsForDay([vet50, vet70], config)

    // VET70 (older) sorts before VET50 (younger).
    expect(result.map(c => c.id)).toEqual(['vet70', 'vet50'])
  })

  it('Test E — cross-weapon Vet pair: age-descending rule does not apply; strip-demand decides', () => {
    // VET40 M Foil (high strip demand) and VET80 M Sabre (low strip demand) are different
    // weapons. The age-descending key only fires for same-gender + same-weapon pairs, so
    // key #4 (strip demand) should place VET40 first despite VET80 being older.
    const vet40Foil = makeCompetition({
      id: 'vet40-foil',
      category: Category.VETERAN,
      event_type: EventType.INDIVIDUAL,
      gender: Gender.MEN,
      weapon: Weapon.FOIL,
      vet_age_group: VetAgeGroup.VET40,
      fencer_count: 80,
      strips_allocated: 12,
    })
    const vet80Sabre = makeCompetition({
      id: 'vet80-sabre',
      category: Category.VETERAN,
      event_type: EventType.INDIVIDUAL,
      gender: Gender.MEN,
      weapon: Weapon.SABRE,
      vet_age_group: VetAgeGroup.VET80,
      fencer_count: 10,
      strips_allocated: 2,
    })

    const result = sequenceEventsForDay([vet40Foil, vet80Sabre], config)

    expect(result[0].id).toBe('vet40-foil')
    expect(result[1].id).toBe('vet80-sabre')
  })
})
