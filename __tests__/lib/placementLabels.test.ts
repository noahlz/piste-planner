import { describe, it, expect } from 'vitest'
import { Phase } from '../../src/engine/types.ts'
import { phaseDisplay } from '../../src/lib/placementLabels.ts'

describe('phaseDisplay', () => {
  // The six phases eventTimeSegments emits. Literals on purpose: three
  // surfaces share these strings, so a rename must show up here.
  it.each([
    [Phase.POOLS, 'Pools'],
    [Phase.FLIGHT_A, 'Flight A'],
    [Phase.FLIGHT_B, 'Flight B'],
    [Phase.DE_PRELIMS, 'DE prelims'],
    [Phase.DE_ROUND_OF_16, 'Video stage'],
    [Phase.DE, 'DE'],
  ])('labels %s as "%s"', (phase, label) => {
    expect(phaseDisplay(phase)).toBe(label)
  })
})
