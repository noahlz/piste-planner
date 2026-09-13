import { describe, it, expect } from 'vitest'
import {
  ZOOM_STEPS,
  DEFAULT_ZOOM,
  MAX_ZOOM_STEP,
  FIT_FALLBACK_STEP,
  rungAt,
  zoomReadout,
  canZoomIn,
  canZoomOut,
  stepZoom,
  resetZoom,
  fitDay,
} from '../../../src/components/canvas/zoomLadder.ts'

// 013 T024 — the zoom ladder (research D3, data-model §7): six discrete
// pixel-per-minute rungs plus a fit-to-day mode. A ladder cannot reach a
// scale it does not contain, closing the defect in 004's continuous zoom
// (backlog §Zooming in destroys the view) by construction.

describe('ZOOM_STEPS', () => {
  it('lists the six rungs exactly, in order', () => {
    expect(ZOOM_STEPS).toEqual([
      { ppm: 1.5, row: 15 },
      { ppm: 2.2, row: 22 },
      { ppm: 3.2, row: 34 },
      { ppm: 4.6, row: 48 },
      { ppm: 6.5, row: 62 },
      { ppm: 9.0, row: 78 },
    ])
  })
})

describe('DEFAULT_ZOOM', () => {
  it('is the 100% rung, index 2 of the ladder', () => {
    expect(DEFAULT_ZOOM).toBe(2)
    expect(ZOOM_STEPS[DEFAULT_ZOOM]).toEqual({ ppm: 3.2, row: 34 })
  })
})

describe('zoomReadout', () => {
  it.each([
    [0, '47%'],
    [1, '69%'],
    [2, '100%'],
    [3, '144%'],
    [4, '203%'],
    [5, '281%'],
  ])('reads step %i as %s', (step, expected) => {
    expect(zoomReadout(step)).toBe(expected)
  })
})

describe('rungAt', () => {
  it('returns the rung at a step inside the ladder', () => {
    expect(rungAt(3)).toEqual({ ppm: 4.6, row: 48 })
  })

  it('clamps a step below the ladder to the first rung', () => {
    expect(rungAt(-1)).toEqual(ZOOM_STEPS[0])
    expect(rungAt(-100)).toEqual(ZOOM_STEPS[0])
  })

  it('clamps a step past the ladder to the last rung', () => {
    expect(rungAt(MAX_ZOOM_STEP + 1)).toEqual(ZOOM_STEPS[MAX_ZOOM_STEP])
    expect(rungAt(100)).toEqual(ZOOM_STEPS[MAX_ZOOM_STEP])
  })

  it('falls back to the default rung for non-finite input', () => {
    expect(rungAt(Number.NaN)).toEqual(ZOOM_STEPS[DEFAULT_ZOOM])
    expect(rungAt(Number.POSITIVE_INFINITY)).toEqual(ZOOM_STEPS[DEFAULT_ZOOM])
    expect(rungAt(Number.NEGATIVE_INFINITY)).toEqual(ZOOM_STEPS[DEFAULT_ZOOM])
  })
})

describe('canZoomIn / canZoomOut', () => {
  it('disables zooming in only at the last rung', () => {
    expect(canZoomIn(MAX_ZOOM_STEP)).toBe(false)
    for (let step = 0; step < MAX_ZOOM_STEP; step++) {
      expect(canZoomIn(step)).toBe(true)
    }
  })

  it('disables zooming out only at the first rung', () => {
    expect(canZoomOut(0)).toBe(false)
    for (let step = 1; step <= MAX_ZOOM_STEP; step++) {
      expect(canZoomOut(step)).toBe(true)
    }
  })
})

describe('stepZoom', () => {
  it('steps in by one and clears fitting', () => {
    expect(stepZoom({ zoomStep: 2, fitting: false }, 1)).toEqual({ zoomStep: 3, fitting: false })
  })

  it('steps out by one and clears fitting', () => {
    expect(stepZoom({ zoomStep: 2, fitting: false }, -1)).toEqual({ zoomStep: 1, fitting: false })
  })

  it('clamps at the last rung rather than overshooting when zooming in', () => {
    expect(stepZoom({ zoomStep: MAX_ZOOM_STEP, fitting: false }, 1)).toEqual({
      zoomStep: MAX_ZOOM_STEP,
      fitting: false,
    })
  })

  it('clamps at the first rung rather than undershooting when zooming out', () => {
    expect(stepZoom({ zoomStep: 0, fitting: false }, -1)).toEqual({ zoomStep: 0, fitting: false })
  })

  it('leaves fit mode at the neighbouring rung of the stored step, in', () => {
    expect(stepZoom({ zoomStep: 3, fitting: true }, 1)).toEqual({ zoomStep: 4, fitting: false })
  })

  it('leaves fit mode at the neighbouring rung of the stored step, out', () => {
    expect(stepZoom({ zoomStep: 3, fitting: true }, -1)).toEqual({ zoomStep: 2, fitting: false })
  })
})

describe('resetZoom', () => {
  it('lands on the default rung with fitting cleared', () => {
    expect(resetZoom()).toEqual({ zoomStep: DEFAULT_ZOOM, fitting: false })
  })
})

describe('fitDay', () => {
  it('sets fitting and keeps the current step', () => {
    expect(fitDay({ zoomStep: 4, fitting: false })).toEqual({ zoomStep: 4, fitting: true })
  })

  it('is idempotent on a state already fitting', () => {
    expect(fitDay({ zoomStep: 1, fitting: true })).toEqual({ zoomStep: 1, fitting: true })
  })
})

describe('FIT_FALLBACK_STEP', () => {
  it('is the default rung, drawn when fit day has no measured plot width', () => {
    expect(FIT_FALLBACK_STEP).toBe(DEFAULT_ZOOM)
  })
})
