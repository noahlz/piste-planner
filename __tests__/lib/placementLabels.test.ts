import { describe, it, expect } from 'vitest'
import { Phase } from '../../src/engine/types.ts'
import { phaseDisplay, stripSetLabel } from '../../src/lib/placementLabels.ts'

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

describe('stripSetLabel', () => {
  // 0-based indices in, 1-based runs out (017 T6a). Literals on purpose.
  it.each([
    [[4], 'Strip 5'],
    [[0, 1, 2, 3], 'Strips 1–4'],
    [[0, 1, 2, 3, 8, 9], 'Strips 1–4, 9–10'],
    [[0, 1, 5, 9, 10, 11], 'Strips 1–2, 6, 10–12'],
    [[9, 8, 1, 0, 3, 2], 'Strips 1–4, 9–10'],
    [[2, 2, 3], 'Strips 3–4'],
  ])('labels %j as "%s"', (strips, label) => {
    expect(stripSetLabel(strips)).toBe(label)
  })
})
