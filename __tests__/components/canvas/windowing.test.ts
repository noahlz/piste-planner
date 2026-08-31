import { describe, it, expect } from 'vitest'
import {
  buildDayLayout,
  flatRowIndex,
  intersectsTimeRange,
  maxRowScroll,
  resolveFlatRow,
  visibleRowRange,
  visibleTimeRange,
} from '../../../src/components/canvas/windowing.ts'
import { RowHeightStep } from '../../../src/store/viewState.ts'

// A realistic tournament: 3 days, 20 strips, so 60 flat rows with day
// boundaries at 0, 20 and 40. The day header band is an overlay, not a row,
// so rows-per-day is exactly stripsTotal.
const LAYOUT = buildDayLayout(3, 20)
const TOTAL_ROWS = 60

// ROW_HEIGHT_PX: compact 16, normal 24, tall 36.
const NORMAL_ROW_PX = 24

describe('buildDayLayout', () => {
  it('gives every day exactly stripsTotal rows, with no row for the header band', () => {
    expect(LAYOUT).toEqual({
      daysAvailable: 3,
      stripsTotal: 20,
      rowsPerDay: 20,
      totalRows: 60,
    })
  })

  it('collapses to one row per day when there is a single strip', () => {
    expect(buildDayLayout(3, 1)).toEqual({
      daysAvailable: 3,
      stripsTotal: 1,
      rowsPerDay: 1,
      totalRows: 3,
    })
  })

  it('has no rows when there are no days or no strips', () => {
    expect(buildDayLayout(0, 20).totalRows).toBe(0)
    expect(buildDayLayout(3, 0).totalRows).toBe(0)
  })

  it('floors fractional and negative inputs into a usable layout', () => {
    expect(buildDayLayout(2.7, 20).daysAvailable).toBe(2)
    expect(buildDayLayout(-1, 20).totalRows).toBe(0)
  })
})

describe('resolveFlatRow', () => {
  it('resolves the first row to the first strip of the first day', () => {
    expect(resolveFlatRow(LAYOUT, 0)).toEqual({ day: 0, strip: 0 })
  })

  it('resolves the last row of day 0 to its last strip, not to day 1', () => {
    expect(resolveFlatRow(LAYOUT, 19)).toEqual({ day: 0, strip: 19 })
  })

  it('resolves the row one past that boundary to the first strip of day 1', () => {
    expect(resolveFlatRow(LAYOUT, 20)).toEqual({ day: 1, strip: 0 })
  })

  it('resolves the final row to the last strip of the last day', () => {
    expect(resolveFlatRow(LAYOUT, 59)).toEqual({ day: 2, strip: 19 })
  })

  it('returns null one past the end', () => {
    expect(resolveFlatRow(LAYOUT, 60)).toBeNull()
  })

  it('returns null for a negative index', () => {
    expect(resolveFlatRow(LAYOUT, -1)).toBeNull()
  })

  it('advances a day per row when there is a single strip', () => {
    const single = buildDayLayout(3, 1)
    expect(resolveFlatRow(single, 0)).toEqual({ day: 0, strip: 0 })
    expect(resolveFlatRow(single, 1)).toEqual({ day: 1, strip: 0 })
    expect(resolveFlatRow(single, 2)).toEqual({ day: 2, strip: 0 })
    expect(resolveFlatRow(single, 3)).toBeNull()
  })

  it('returns null for every index of an empty layout', () => {
    expect(resolveFlatRow(buildDayLayout(0, 20), 0)).toBeNull()
  })
})

describe('flatRowIndex', () => {
  it('inverts resolveFlatRow across the day boundary', () => {
    expect(flatRowIndex(LAYOUT, 0, 0)).toBe(0)
    expect(flatRowIndex(LAYOUT, 0, 19)).toBe(19)
    expect(flatRowIndex(LAYOUT, 1, 0)).toBe(20)
    expect(flatRowIndex(LAYOUT, 2, 19)).toBe(59)
  })

  it('returns null for a day past the last', () => {
    expect(flatRowIndex(LAYOUT, 3, 0)).toBeNull()
  })

  it('returns null for a strip past the last', () => {
    expect(flatRowIndex(LAYOUT, 0, 20)).toBeNull()
  })

  it('returns null for negative coordinates', () => {
    expect(flatRowIndex(LAYOUT, -1, 0)).toBeNull()
    expect(flatRowIndex(LAYOUT, 0, -1)).toBeNull()
  })
})

describe('visibleRowRange', () => {
  it('renders exactly the rows that fit when the viewport is a whole multiple', () => {
    // 96 / 24 = 4 rows exactly. Row 4 starts at y=96, the first pixel outside.
    expect(visibleRowRange(0, 96, RowHeightStep.NORMAL, TOTAL_ROWS)).toEqual({
      firstRow: 0,
      lastRow: 3,
    })
  })

  it('renders the partially visible row when the viewport fits a fraction', () => {
    // 100 / 24 = 4.16…; row 4 occupies y 96-120 and is 4px on screen.
    expect(visibleRowRange(0, 100, RowHeightStep.NORMAL, TOTAL_ROWS)).toEqual({
      firstRow: 0,
      lastRow: 4,
    })
  })

  it('renders a row visible by a single pixel', () => {
    expect(visibleRowRange(0, 97, RowHeightStep.NORMAL, TOTAL_ROWS)).toEqual({
      firstRow: 0,
      lastRow: 4,
    })
  })

  it('starts at rowScroll and excludes the row immediately above it', () => {
    const range = visibleRowRange(5, 96, RowHeightStep.NORMAL, TOTAL_ROWS)
    expect(range).toEqual({ firstRow: 5, lastRow: 8 })
    expect(range?.firstRow).toBeGreaterThan(4)
  })

  it('starts a new day group cleanly when rowScroll lands on a day boundary', () => {
    const range = visibleRowRange(20, 96, RowHeightStep.NORMAL, TOTAL_ROWS)
    expect(range).toEqual({ firstRow: 20, lastRow: 23 })
    expect(resolveFlatRow(LAYOUT, range!.firstRow)).toEqual({ day: 1, strip: 0 })
  })

  it('spans the day boundary when rowScroll sits one row before it', () => {
    const range = visibleRowRange(19, 96, RowHeightStep.NORMAL, TOTAL_ROWS)
    expect(range).toEqual({ firstRow: 19, lastRow: 22 })
    expect(resolveFlatRow(LAYOUT, 19)).toEqual({ day: 0, strip: 19 })
    expect(resolveFlatRow(LAYOUT, 20)).toEqual({ day: 1, strip: 0 })
  })

  it('starts inside the second day when rowScroll sits one row after the boundary', () => {
    expect(visibleRowRange(21, 96, RowHeightStep.NORMAL, TOTAL_ROWS)).toEqual({
      firstRow: 21,
      lastRow: 24,
    })
  })

  it('fits more rows at compact and fewer at tall for the same viewport', () => {
    // 96 / 16 = 6 exactly; 96 / 36 = 2.66… so the third row is partly visible.
    expect(visibleRowRange(0, 96, RowHeightStep.COMPACT, TOTAL_ROWS)).toEqual({
      firstRow: 0,
      lastRow: 5,
    })
    expect(visibleRowRange(0, 96, RowHeightStep.TALL, TOTAL_ROWS)).toEqual({
      firstRow: 0,
      lastRow: 2,
    })
  })

  it('stops at the last row when the viewport is taller than the whole canvas', () => {
    expect(visibleRowRange(0, TOTAL_ROWS * NORMAL_ROW_PX + 500, RowHeightStep.NORMAL, TOTAL_ROWS))
      .toEqual({ firstRow: 0, lastRow: 59 })
  })

  it('pins a scroll near the bottom to the last full window, not to a stub of rows', () => {
    // Row 58 leaves only two rows below it, so the window slides back to 56
    // and shows four rather than leaving half the viewport blank.
    expect(visibleRowRange(58, 96, RowHeightStep.NORMAL, TOTAL_ROWS)).toEqual({
      firstRow: 56,
      lastRow: 59,
    })
  })

  it('pins a scroll far past the end to that same last window', () => {
    // A rowScroll stored against a much larger tournament lands here. It must
    // resolve to a full window, not to the single final row.
    expect(visibleRowRange(100, 96, RowHeightStep.NORMAL, TOTAL_ROWS)).toEqual({
      firstRow: 56,
      lastRow: 59,
    })
  })

  it('clamps a negative scroll to the first row', () => {
    expect(visibleRowRange(-5, 96, RowHeightStep.NORMAL, TOTAL_ROWS)).toEqual({
      firstRow: 0,
      lastRow: 3,
    })
  })

  it('has nothing to render when there are no rows', () => {
    expect(visibleRowRange(0, 96, RowHeightStep.NORMAL, 0)).toBeNull()
  })

  it('has nothing to render when the viewport has no height', () => {
    expect(visibleRowRange(0, 0, RowHeightStep.NORMAL, TOTAL_ROWS)).toBeNull()
  })
})

describe('maxRowScroll', () => {
  it('leaves room for a whole viewport of rows below the scroll position', () => {
    // 96px holds 4 rows, so the furthest useful scroll puts row 56 at the top.
    expect(maxRowScroll(96, RowHeightStep.NORMAL, TOTAL_ROWS)).toBe(56)
  })

  it('grows as the rows get shorter, because more of them fit', () => {
    expect(maxRowScroll(96, RowHeightStep.COMPACT, TOTAL_ROWS)).toBe(54)
    expect(maxRowScroll(96, RowHeightStep.TALL, TOTAL_ROWS)).toBe(57)
  })

  it('is zero when the viewport is taller than the whole canvas', () => {
    expect(maxRowScroll(TOTAL_ROWS * NORMAL_ROW_PX + 500, RowHeightStep.NORMAL, TOTAL_ROWS)).toBe(0)
  })

  it('is zero when there are no rows or the viewport is unmeasured', () => {
    expect(maxRowScroll(96, RowHeightStep.NORMAL, 0)).toBe(0)
    expect(maxRowScroll(0, RowHeightStep.NORMAL, TOTAL_ROWS)).toBe(0)
  })
})

describe('visibleTimeRange', () => {
  // timeZoom is minutes per pixel, so a wider viewport at a larger timeZoom
  // covers proportionally more minutes.
  it('covers one minute per pixel at the default zoom', () => {
    expect(visibleTimeRange(480, 1, 600)).toEqual({ startMinutes: 480, endMinutes: 1080 })
  })

  it('covers twice the minutes when zoomed out to two minutes per pixel', () => {
    expect(visibleTimeRange(480, 2, 600)).toEqual({ startMinutes: 480, endMinutes: 1680 })
  })

  it('covers half the minutes when zoomed in to half a minute per pixel', () => {
    expect(visibleTimeRange(480, 0.5, 600)).toEqual({ startMinutes: 480, endMinutes: 780 })
  })

  it('starts exactly at timeScroll', () => {
    expect(visibleTimeRange(0, 1, 600).startMinutes).toBe(0)
    expect(visibleTimeRange(937, 3, 100).startMinutes).toBe(937)
  })

  it('is empty when the viewport has no width', () => {
    expect(visibleTimeRange(480, 1, 0)).toEqual({ startMinutes: 480, endMinutes: 480 })
  })
})

describe('intersectsTimeRange', () => {
  const range = visibleTimeRange(480, 1, 600) // [480, 1080)

  it('includes a block wholly inside the window', () => {
    expect(intersectsTimeRange(range, 480, 585)).toBe(true)
  })

  it('includes the last minute that fits the viewport width', () => {
    expect(intersectsTimeRange(range, 1079, 1090)).toBe(true)
  })

  it('excludes a block starting at the first minute that does not fit', () => {
    expect(intersectsTimeRange(range, 1080, 1090)).toBe(false)
  })

  it('excludes a block ending exactly at the window start', () => {
    expect(intersectsTimeRange(range, 400, 480)).toBe(false)
  })

  it('includes a block overlapping the window start by one minute', () => {
    expect(intersectsTimeRange(range, 400, 481)).toBe(true)
  })

  it('includes a block that spans the entire window', () => {
    expect(intersectsTimeRange(range, 0, 1440)).toBe(true)
  })

  it('applies the same boundaries at a different zoom', () => {
    const zoomedOut = visibleTimeRange(480, 2, 600) // [480, 1680)
    expect(intersectsTimeRange(zoomedOut, 1679, 1700)).toBe(true)
    expect(intersectsTimeRange(zoomedOut, 1680, 1700)).toBe(false)
  })
})
