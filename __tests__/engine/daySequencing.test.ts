import { describe, it, expect } from 'vitest'
import { sequenceEventsForDay } from '../../src/engine/daySequencing.ts'
import { makeCompetition, makeConfig } from '../helpers/factories.ts'
import { Category, EventType } from '../../src/engine/types.ts'

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
