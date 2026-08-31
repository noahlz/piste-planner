import { describe, it, expect } from 'vitest'
import {
  DEFAULT_TIME_ZOOM,
  MAX_AXIS_TICKS,
  MAX_TIME_ZOOM,
  MIN_TIME_ZOOM,
  chooseTickStepMinutes,
  clampTimeZoom,
  fitToDay,
  fitToTournament,
  hourTicks,
  minuteAtX,
  stepRowHeight,
  zoomAtCursor,
  zoomToSelection,
} from '../../../src/components/canvas/zoom.ts'
import { DEFAULT_VIEW_STATE, RowHeightStep } from '../../../src/store/viewState.ts'

// 004 T039 — the pure zoom arithmetic behind FR-017, FR-018 and FR-020.
//
// timeZoom is MINUTES PER PIXEL throughout, matching ViewState.timeZoom and
// windowing.visibleTimeRange. Every expectation below is an absolute number
// rather than a relationship: a round-trip property alone is satisfied by an
// implementation that does nothing, so the intermediate window is pinned too.

describe('clampTimeZoom', () => {
  it('leaves a zoom inside the range untouched', () => {
    expect(clampTimeZoom(2)).toBe(2)
  })

  it('pins a zoom past the zoomed-in end to the minimum', () => {
    expect(clampTimeZoom(MIN_TIME_ZOOM / 100)).toBe(MIN_TIME_ZOOM)
  })

  it('pins a zoom past the zoomed-out end to the maximum', () => {
    expect(clampTimeZoom(MAX_TIME_ZOOM * 100)).toBe(MAX_TIME_ZOOM)
  })

  it('falls back to the default rather than persisting a value viewState rejects', () => {
    // viewState.isValidViewState rejects non-finite and non-positive timeZoom
    // wholesale, so a clamp that let one through would make the whole stored
    // view state unloadable on the next boot. Asserted as the literal 1: a
    // comparison against DEFAULT_TIME_ZOOM holds for any value the constant
    // takes, including one the stored state would reject.
    expect(clampTimeZoom(Number.NaN)).toBe(1)
    expect(clampTimeZoom(Number.POSITIVE_INFINITY)).toBe(1)
    expect(clampTimeZoom(0)).toBe(MIN_TIME_ZOOM)
    expect(clampTimeZoom(-3)).toBe(MIN_TIME_ZOOM)
  })

  it('falls back to the very zoom a fresh view state starts at', () => {
    // zoom.ts claims DEFAULT_TIME_ZOOM matches DEFAULT_VIEW_STATE.timeZoom.
    // Drifting apart would reset a rejected zoom to a level the app never
    // otherwise shows.
    expect(DEFAULT_TIME_ZOOM).toBe(DEFAULT_VIEW_STATE.timeZoom)
  })
})

describe('minuteAtX', () => {
  it('reads the minute under a pixel offset as scroll plus x times zoom', () => {
    expect(minuteAtX({ timeZoom: 2, timeScroll: 600 }, 300)).toBe(1200)
  })

  it('reads the left edge as the scroll position itself', () => {
    expect(minuteAtX({ timeZoom: 2, timeScroll: 600 }, 0)).toBe(600)
  })
})

describe('zoomAtCursor', () => {
  it('keeps the minute under the cursor under the cursor when zooming in', () => {
    // 09:00 sits at x=300 of a window starting at 10:00... no: scroll 600
    // (10:00) at 2 min/px puts minute 1200 (20:00) at x=300. After zooming to
    // 1 min/px that same x must still read 1200, which forces scroll 900.
    const next = zoomAtCursor({ timeZoom: 2, timeScroll: 600 }, 1, 300)
    expect(next).toEqual({ timeZoom: 1, timeScroll: 900 })
    expect(minuteAtX(next, 300)).toBe(1200)
  })

  it('returns to the starting window when zooming back out at the same cursor', () => {
    const zoomedIn = zoomAtCursor({ timeZoom: 2, timeScroll: 600 }, 1, 300)
    const back = zoomAtCursor(zoomedIn, 2, 300)
    expect(back).toEqual({ timeZoom: 2, timeScroll: 600 })
  })

  it('leaves the scroll position alone when the cursor is at the left edge', () => {
    expect(zoomAtCursor({ timeZoom: 2, timeScroll: 600 }, 4, 0)).toEqual({
      timeZoom: 4,
      timeScroll: 600,
    })
  })

  it('holds the right edge of the viewport when the cursor is on it', () => {
    // 800px wide at 1 min/px from 08:00 ends at minute 1280; halving the zoom
    // must keep 1280 on the right edge, so the window becomes [880, 1280).
    const next = zoomAtCursor({ timeZoom: 1, timeScroll: 480 }, 0.5, 800)
    expect(next).toEqual({ timeZoom: 0.5, timeScroll: 880 })
    expect(minuteAtX(next, 800)).toBe(1280)
  })

  it('anchors against the clamped zoom, not the requested one, at the zoomed-out end', () => {
    // Anchoring against an unclamped zoom leaves a scroll position computed for
    // a zoom that was never stored, so the cursor drifts exactly at the end of
    // the range the user is pushing against. Scroll and cursor are chosen so
    // the midnight floor cannot fire and hide the difference: minute 1010 sits
    // at x=10, and at the clamped 8 min/px that puts the window start at 930.
    // Anchoring against the requested 80 would have said 210.
    const next = zoomAtCursor({ timeZoom: 1, timeScroll: 1000 }, MAX_TIME_ZOOM * 10, 10)
    expect(next).toEqual({ timeZoom: MAX_TIME_ZOOM, timeScroll: 930 })
  })

  it('anchors against the clamped zoom, not the requested one, at the zoomed-in end', () => {
    // Minute 1100 at x=100; at the clamped 0.05 min/px the window starts at
    // 1095. Anchoring against the requested 0.001 would have said 1099.9.
    const next = zoomAtCursor({ timeZoom: 1, timeScroll: 1000 }, MIN_TIME_ZOOM / 50, 100)
    expect(next).toEqual({ timeZoom: MIN_TIME_ZOOM, timeScroll: 1095 })
  })

  it('never scrolls before midnight, which viewState would refuse to persist', () => {
    const next = zoomAtCursor({ timeZoom: 0.5, timeScroll: 10 }, 1, 100)
    expect(next.timeScroll).toBe(0)
  })
})

describe('stepRowHeight', () => {
  it('steps compact up to normal and normal up to tall', () => {
    expect(stepRowHeight(RowHeightStep.COMPACT, 1)).toBe(RowHeightStep.NORMAL)
    expect(stepRowHeight(RowHeightStep.NORMAL, 1)).toBe(RowHeightStep.TALL)
  })

  it('steps tall down to normal and normal down to compact', () => {
    expect(stepRowHeight(RowHeightStep.TALL, -1)).toBe(RowHeightStep.NORMAL)
    expect(stepRowHeight(RowHeightStep.NORMAL, -1)).toBe(RowHeightStep.COMPACT)
  })

  it('stays put at the tall end rather than wrapping to compact', () => {
    expect(stepRowHeight(RowHeightStep.TALL, 1)).toBe(RowHeightStep.TALL)
  })

  it('stays put at the compact end rather than wrapping to tall', () => {
    expect(stepRowHeight(RowHeightStep.COMPACT, -1)).toBe(RowHeightStep.COMPACT)
  })
})

describe('fitToDay', () => {
  it('covers the configured day span exactly, starting at the day start', () => {
    // 08:00–22:00 is 840 minutes; in an 840px viewport that is 1 min/px.
    expect(fitToDay(480, 1320, 840)).toEqual({ timeZoom: 1, timeScroll: 480 })
  })

  it('scales the zoom with the viewport rather than the span alone', () => {
    expect(fitToDay(480, 1320, 420)).toEqual({ timeZoom: 2, timeScroll: 480 })
  })

  it('clamps rather than storing a zoom the viewport is too narrow to hold', () => {
    // 840 / 84 = 10 min/px, past MAX_TIME_ZOOM of 8.
    expect(fitToDay(480, 1320, 84)).toEqual({ timeZoom: MAX_TIME_ZOOM, timeScroll: 480 })
  })

  it('declines to fit a viewport that has not been measured yet', () => {
    expect(fitToDay(480, 1320, 0)).toBeNull()
  })

  it('declines to fit a day whose end does not follow its start', () => {
    expect(fitToDay(1320, 480, 840)).toBeNull()
  })
})

describe('fitToTournament', () => {
  it('covers the union of every placed span, earliest start to latest end', () => {
    const spans = [
      { startMinutes: 600, endMinutes: 700 },
      { startMinutes: 540, endMinutes: 900 },
      { startMinutes: 800, endMinutes: 1000 },
    ]
    // Union is 540..1000, 460 minutes, in an 800px viewport.
    expect(fitToTournament(spans, 800)).toEqual({ timeZoom: 0.575, timeScroll: 540 })
  })

  it('returns null when nothing is placed, so the caller keeps its window', () => {
    expect(fitToTournament([], 800)).toBeNull()
  })

  it('skips a span with a non-finite boundary instead of letting it poison the union', () => {
    // Without the guard the union goes NaN, windowCovering rejects it, and
    // fit-to-tournament silently does nothing on a canvas that has events.
    const spans = [
      { startMinutes: 540, endMinutes: 1000 },
      { startMinutes: Number.NaN, endMinutes: 700 },
    ]
    expect(fitToTournament(spans, 800)).toEqual({ timeZoom: 0.575, timeScroll: 540 })
  })

  it('declines to fit a viewport that has not been measured yet', () => {
    expect(fitToTournament([{ startMinutes: 540, endMinutes: 1000 }], 0)).toBeNull()
  })
})

describe('zoomToSelection', () => {
  it('pads the selection so it does not sit flush against the viewport edges', () => {
    // 600..660 is 60 minutes; padding is max(5% of span, 5 minutes) = 5 on
    // each side, so the window covers 595..665 — 70 minutes in 700px.
    expect(zoomToSelection({ startMinutes: 600, endMinutes: 660 }, 700)).toEqual({
      timeZoom: 0.1,
      timeScroll: 595,
    })
  })

  it('grows the padding with the span once 5% exceeds the floor', () => {
    // 600..1200 is 600 minutes; 5% is 30, above the 5-minute floor, so the
    // window covers 570..1230 — 660 minutes in 660px.
    expect(zoomToSelection({ startMinutes: 600, endMinutes: 1200 }, 660)).toEqual({
      timeZoom: 1,
      timeScroll: 570,
    })
  })

  it('clamps the padded start at midnight and still covers the selection', () => {
    // 0..60 pads to -5..65, 70 minutes in 700px. The zoom is solved against
    // the *padded* span and only the scroll is floored: clamping the start
    // first would give 0..65 and a different window that still covers the
    // selection, which is why this pins the pair rather than the coverage.
    expect(zoomToSelection({ startMinutes: 0, endMinutes: 60 }, 700)).toEqual({
      timeZoom: 0.1,
      timeScroll: 0,
    })
  })

  it('declines a selection with no duration', () => {
    expect(zoomToSelection({ startMinutes: 600, endMinutes: 600 }, 700)).toBeNull()
  })
})

describe('chooseTickStepMinutes', () => {
  it('ticks once an hour when an hour is wide enough to label', () => {
    expect(chooseTickStepMinutes(0.5)).toBe(60)
    expect(chooseTickStepMinutes(1)).toBe(60)
  })

  it('holds the hourly step at exactly the minimum spacing, and gives it up just past', () => {
    // 1.25 min/px puts an hour at exactly 48px, which the >= admits; a hair
    // wider a zoom and it does not.
    expect(chooseTickStepMinutes(1.25)).toBe(60)
    expect(chooseTickStepMinutes(1.2501)).toBe(120)
  })

  it('coarsens to two hours once an hour falls below the label spacing', () => {
    // 1.5 min/px puts an hour at 40px, under the 48px minimum; two hours is 80px.
    expect(chooseTickStepMinutes(1.5)).toBe(120)
    expect(chooseTickStepMinutes(2)).toBe(120)
  })

  it('coarsens to three hours when two are still too close', () => {
    // 3 min/px puts two hours at 40px and three at 60px.
    expect(chooseTickStepMinutes(3)).toBe(180)
  })

  it('coarsens to six hours when three are still too close', () => {
    // 4 min/px puts three hours at 45px, under 48px; six hours is 90px.
    expect(chooseTickStepMinutes(4)).toBe(360)
  })

  it('stops coarsening at the widest step on the ladder', () => {
    expect(chooseTickStepMinutes(MAX_TIME_ZOOM)).toBe(360)
  })

  it('falls back to hourly for a zoom that is not a usable scale', () => {
    expect(chooseTickStepMinutes(0)).toBe(60)
    expect(chooseTickStepMinutes(Number.NaN)).toBe(60)
  })
})

describe('hourTicks', () => {
  it('places a tick on every hour of a full day window, labelled as a time of day', () => {
    const ticks = hourTicks({ startMinutes: 480, endMinutes: 1320 }, 1)
    // Half-open, matching windowing.visibleTimeRange: 08:00 through 21:00, and
    // no tick at 22:00 because that is the exclusive end.
    expect(ticks).toHaveLength(14)
    expect(ticks[0]).toEqual({ minutes: 480, label: '8:00' })
    expect(ticks[13]).toEqual({ minutes: 1260, label: '21:00' })
  })

  it('starts at the first step boundary at or after the window start', () => {
    const ticks = hourTicks({ startMinutes: 500, endMinutes: 800 }, 1)
    expect(ticks.map((t) => t.minutes)).toEqual([540, 600, 660, 720, 780])
  })

  it('emits the coarsened step rather than every hour when zoomed out', () => {
    const ticks = hourTicks({ startMinutes: 480, endMinutes: 1320 }, 4)
    expect(ticks.map((t) => t.minutes)).toEqual([720, 1080])
  })

  it('emits nothing for a window that contains no step boundary', () => {
    expect(hourTicks({ startMinutes: 481, endMinutes: 539 }, 1)).toEqual([])
  })

  it('emits nothing for a window that is not finite', () => {
    expect(hourTicks({ startMinutes: 480, endMinutes: Number.NaN }, 1)).toEqual([])
  })

  it('fails loudly rather than building an unbounded tick array', () => {
    // Unreachable through the clamps — a 4000px viewport at MAX_TIME_ZOOM is
    // 89 ticks — so a window this wide means something upstream is broken and
    // silently allocating millions of nodes would be worse than throwing
    // (constitution IV).
    expect(() => hourTicks({ startMinutes: 0, endMinutes: 1e9 }, MAX_TIME_ZOOM)).toThrow(
      /tick/i,
    )
    expect(MAX_AXIS_TICKS).toBeGreaterThan(89)
  })
})
