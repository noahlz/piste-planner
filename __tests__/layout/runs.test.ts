import { describe, it, expect } from 'vitest'
import { runsOf } from '../../src/layout/runs.ts'
import { stripSetLabel } from '../../src/lib/placementLabels.ts'

// The one statement of "maximal consecutive strip runs": the strip assigner
// draws rects from it and the strip label words them (017 T6b, the review item
// T6a deferred).

describe('runsOf', () => {
  it.each([
    { name: 'no strips', strips: [], runs: [] },
    { name: 'one strip', strips: [3], runs: [{ first: 3, count: 1 }] },
    { name: 'one consecutive stretch', strips: [0, 1, 2, 3], runs: [{ first: 0, count: 4 }] },
    {
      name: 'a split set',
      strips: [0, 1, 5, 6, 7, 20],
      runs: [{ first: 0, count: 2 }, { first: 5, count: 3 }, { first: 20, count: 1 }],
    },
  ])('splits $name at every gap', ({ strips, runs }) => {
    expect(runsOf(strips)).toEqual(runs)
  })
})

describe('stripSetLabel reads the same runs', () => {
  it.each([
    { strips: [4, 5, 6], label: 'Strips 5–7' },
    { strips: [0, 1, 5, 6, 7, 20], label: 'Strips 1–2, 6–8, 21' },
    { strips: [7, 3, 4], label: 'Strips 4–5, 8' },
  ])('words $strips as $label', ({ strips, label }) => {
    expect(stripSetLabel(strips)).toBe(label)
  })
})
