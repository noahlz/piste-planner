import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import {
  CanvasTooltip,
  type CanvasTooltipTarget,
} from '../../../src/components/canvas/CanvasTooltip.tsx'
import { EventBlock } from '../../../src/components/canvas/EventBlock.tsx'
import type { BlockPlacement } from '../../../src/components/canvas/lanes.ts'
import { MatrixCanvas } from '../../../src/components/canvas/MatrixCanvas.tsx'
import type { DerivedSchedule } from '../../../src/store/derived.ts'
import { Category, Gender, Phase, Weapon } from '../../../src/engine/types.ts'
import {
  DEFAULT_VIEW_STATE,
  RowHeightStep,
  VIEW_STATE_STORAGE_KEY,
  saveViewState,
  type ViewState,
} from '../../../src/store/viewState.ts'
import { useStore } from '../../../src/store/store.ts'
import {
  makeCompetition,
  makeConfig,
  makeScheduleResult,
  makeStrips,
} from '../../helpers/factories.ts'

// 004 T030 — the tooltip contract (contracts/ui-contract.md §Tooltip contract,
// FR-022).
//
// Every field below is pinned to a literal string for one known fixture. A
// "contains something" assertion here would pass against a tooltip that
// rendered the wrong minute, the wrong strip range, or the wrong day, which is
// exactly the class of defect this file exists to catch.
//
// The last describe block is the one research D3 turns on: ONE canvas-level
// pointer handler against a single anchor, never a Radix trigger per block.
// Two jsdom facts make that block work:
//
//  - jsdom 26 ships no `PointerEvent` constructor, so
//    `fireEvent.pointerMove(el, { clientX })` silently degrades to a bare
//    `Event` and the coordinates never arrive. A `MouseEvent` named
//    `pointermove` carries them and React dispatches it to `onPointerMove`.
//  - `getBoundingClientRect()` returns zeros, so a client coordinate is a plot
//    coordinate once the frozen gutter is added back. The canvas hit-tests
//    against rectangles it computed itself, not against layout.

const GUTTER_WIDTH_PX = 72
/**
 * The block layer starts this far below the viewport's top edge. The day band
 * and the hour axis under it take no layout space at all — they are one
 * absolutely positioned `z-20` overlay — so the offset is not the band pushing
 * anything down: it is the block layer, the gutter and the SVG each being
 * positioned this far down, and made this much shorter, so the band has rows to
 * cover rather than rows to hide. A block's inline `top` is measured inside
 * that layer, so a client coordinate aimed at a block has to add the offset
 * back. Written as a literal rather than imported: an expectation computed from
 * the same constant as the implementation agrees with it by construction and
 * can never fail.
 */
const HEADER_OFFSET_PX = 38
const VIEWPORT_WIDTH = 900
const VIEWPORT_HEIGHT = 480

/** The label competitionLabel() produces for the DIV1 men's foil fixture. */
const DIV1_LABEL = "Div 1 Men's Foil Individual"

const POOL_PLACEMENT: BlockPlacement = {
  competitionId: 'plain',
  day: 0,
  phase: Phase.POOLS,
  startMinutes: 480,
  endMinutes: 585,
  stripCount: 4,
  firstStrip: 0,
  overflow: false,
}

class StubResizeObserver {
  callback: ResizeObserverCallback

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
  }

  observe(): void {
    this.callback(
      [{ contentRect: { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT } } as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    )
  }

  unobserve(): void {}
  disconnect(): void {}
}

const originalResizeObserver = globalThis.ResizeObserver

beforeEach(() => {
  // Radix's popper measures its content through a ResizeObserver, which jsdom
  // does not implement.
  globalThis.ResizeObserver = StubResizeObserver as unknown as typeof ResizeObserver
  localStorage.removeItem(VIEW_STATE_STORAGE_KEY)
  useStore.setState(useStore.getInitialState())
})

afterEach(() => {
  globalThis.ResizeObserver = originalResizeObserver
})

function seedViewState(overrides: Partial<ViewState>): void {
  saveViewState({ ...DEFAULT_VIEW_STATE, ...overrides })
}

function makeTarget(overrides: Partial<CanvasTooltipTarget> = {}): CanvasTooltipTarget {
  return {
    competition: makeCompetition({ id: 'plain' }),
    label: DIV1_LABEL,
    day: 0,
    placement: POOL_PLACEMENT,
    findings: [],
    anchorX: 200,
    anchorY: 48,
    ...overrides,
  }
}

function field(key: string): string {
  const el = document.querySelector(`[data-tooltip-field="${key}"]`)
  if (!el) throw new Error(`no tooltip field "${key}" rendered`)
  return el.textContent ?? ''
}

function queryField(key: string): Element | null {
  return document.querySelector(`[data-tooltip-field="${key}"]`)
}

/**
 * jsdom has no PointerEvent constructor, so testing-library's `pointerMove`
 * helper drops clientX/clientY on the floor. The event name is what React
 * dispatches on, so a MouseEvent under that name delivers the coordinates.
 */
function firePointerMove(el: Element, clientX: number, clientY: number): void {
  el.dispatchEvent(
    new MouseEvent('pointermove', { clientX, clientY, bubbles: true, cancelable: true }),
  )
}

describe('CanvasTooltip contents (FR-022)', () => {
  it('carries every field the contract lists, each with the value this fixture has', () => {
    render(<CanvasTooltip target={makeTarget()} />)

    expect(field('name')).toBe(DIV1_LABEL)
    expect(field('weapon')).toBe('Foil')
    expect(field('category')).toBe('Div 1')
    expect(field('gender')).toBe("Men's")
    expect(field('day')).toBe('Day 1')
    expect(field('phase')).toBe('Pools')
    expect(field('start')).toBe('8:00')
    expect(field('end')).toBe('9:45')
    expect(field('duration')).toBe('105 min')
    expect(field('strips')).toBe('Strips 1–4')
    expect(field('findings')).toBe('No findings')
  })

  it('reads day, times and strips off the block it was handed, not off a default', () => {
    // A different day, a different phase, a different strip run: nothing here
    // is shared with the fixture above, so a hard-coded field fails.
    render(
      <CanvasTooltip
        target={makeTarget({
          day: 2,
          competition: makeCompetition({
            id: 'staged',
            category: Category.Y10,
            gender: Gender.WOMEN,
            weapon: Weapon.SABRE,
          }),
          label: "Y10 Women's Saber Individual",
          placement: {
            competitionId: 'staged',
            day: 2,
            phase: Phase.DE_ROUND_OF_16,
            startMinutes: 915,
            endMinutes: 1030,
            stripCount: 4,
            firstStrip: 8,
            overflow: false,
          },
        })}
      />,
    )

    expect(field('name')).toBe("Y10 Women's Saber Individual")
    expect(field('weapon')).toBe('Saber')
    expect(field('category')).toBe('Y10')
    expect(field('gender')).toBe("Women's")
    expect(field('day')).toBe('Day 3')
    expect(field('phase')).toBe('DE round of 16')
    expect(field('start')).toBe('15:15')
    expect(field('end')).toBe('17:10')
    expect(field('duration')).toBe('115 min')
    expect(field('strips')).toBe('Strips 9–12')
  })

  it.each([
    [Phase.POOLS, 'Pools'],
    [Phase.FLIGHT_A, 'Flight A'],
    [Phase.FLIGHT_B, 'Flight B'],
    [Phase.DE, 'DE'],
    [Phase.DE_PRELIMS, 'DE prelims'],
    [Phase.DE_ROUND_OF_16, 'DE round of 16'],
  ])('names the %s phase %s', (phase, label) => {
    render(<CanvasTooltip target={makeTarget({ placement: { ...POOL_PLACEMENT, phase } })} />)

    expect(field('phase')).toBe(label)
  })

  it('writes a one-strip block as a strip rather than as a range of one', () => {
    render(
      <CanvasTooltip
        target={makeTarget({ placement: { ...POOL_PLACEMENT, firstStrip: 2, stripCount: 1 } })}
      />,
    )

    expect(field('strips')).toBe('Strip 3')
  })

  it('renders nothing at all with no target', () => {
    render(<CanvasTooltip target={null} />)

    expect(queryField('name')).toBeNull()
    expect(document.querySelector('[data-slot="tooltip-content"]')).toBeNull()
  })
})

describe('CanvasTooltip findings (FR-022)', () => {
  it('lists the findings attached to this competition', () => {
    render(
      <CanvasTooltip
        target={makeTarget({
          findings: [
            'Day 1 has 26 pools assigned but only 24 strips available',
            'Men’s and Women’s Foil share day 1',
          ],
        })}
      />,
    )

    const findings = field('findings')
    expect(findings).toContain('Day 1 has 26 pools assigned but only 24 strips available')
    expect(findings).toContain('Men’s and Women’s Foil share day 1')
  })

  it('says so explicitly when a block has no findings, rather than leaving the row blank', () => {
    render(<CanvasTooltip target={makeTarget({ findings: [] })} />)

    expect(field('findings')).toBe('No findings')
  })
})

/**
 * The tooltip's fields are unconditional — it is handed no width, no row height
 * and no record of what the block managed to draw, so no row can be gated on
 * any of them. The pair below is the contrast that makes that a claim rather
 * than a restatement: the same target, against a block that dropped two
 * channels and a block that drew all three, says the same thing both times.
 */
describe('CanvasTooltip fields do not vary with what the block drew (FR-016, FR-022)', () => {
  it('names the weapon at a width where the block itself cannot draw the mark', () => {
    // 27px is one pixel under WEAPON_MARK_MIN_WIDTH_PX, so the block drops the
    // weapon mark and the label text and keeps only the gender prefix.
    render(
      <EventBlock
        competition={makeCompetition({ id: 'plain' })}
        label={DIV1_LABEL}
        day={0}
        placement={POOL_PLACEMENT}
        x={0}
        y={0}
        width={27}
        height={96}
        rowHeightStep={RowHeightStep.NORMAL}
        findings={[]}
      />,
    )

    expect(document.querySelector('[data-weapon-mark]')).toBeNull()
    expect(document.querySelector('[data-label-text]')).toBeNull()
    cleanup()

    render(<CanvasTooltip target={makeTarget()} />)

    // The tooltip is the only place either fact is available at that width.
    expect(field('weapon')).toBe('Foil')
    expect(field('name')).toBe(DIV1_LABEL)
  })

  it('carries the same fields at a width where the block drew all of them', () => {
    render(
      <EventBlock
        competition={makeCompetition({ id: 'plain' })}
        label={DIV1_LABEL}
        day={0}
        placement={POOL_PLACEMENT}
        x={0}
        y={0}
        width={200}
        height={96}
        rowHeightStep={RowHeightStep.NORMAL}
        findings={[]}
      />,
    )

    expect(document.querySelector('[data-weapon-mark]')).not.toBeNull()
    expect(document.querySelector('[data-label-text]')).not.toBeNull()
    cleanup()

    render(<CanvasTooltip target={makeTarget()} />)

    expect(field('weapon')).toBe('Foil')
    expect(field('name')).toBe(DIV1_LABEL)
    expect(field('gender')).toBe("Men's")
  })
})

/**
 * A committed schedule with two placed events and three blocks between them,
 * so "one trigger however many blocks render" is a claim about more than one.
 * The numbers are literals, not engine output: this file is about the pointer
 * path, and viewEquivalence.test.tsx is where derived values are pinned.
 */
function scheduleWithTwoEvents(): DerivedSchedule {
  return {
    config: makeConfig({ days_available: 3, strips: makeStrips(24, 4) }),
    competitions: [
      makeCompetition({ id: 'c1' }),
      makeCompetition({
        id: 'c2',
        category: Category.Y10,
        gender: Gender.WOMEN,
        weapon: Weapon.SABRE,
      }),
    ],
    events: {
      c1: {
        result: {
          ...makeScheduleResult('c1', 0),
          pool_start: 600,
          pool_end: 700,
          pool_strip_count: 4,
          de_start: 760,
          de_end: 900,
          de_strip_count: 4,
        },
        day_out_of_range: false,
      },
      c2: {
        result: {
          ...makeScheduleResult('c2', 0),
          pool_start: 600,
          pool_end: 700,
          pool_strip_count: 4,
        },
        day_out_of_range: false,
      },
    },
  }
}

function viewport(): HTMLElement {
  const el = document.querySelector<HTMLElement>('[data-canvas-viewport]')
  if (!el) throw new Error('canvas viewport not rendered')
  return el
}

function blockFor(key: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(`[data-event-block="${key}"]`)
  if (!el) throw new Error(`no block rendered for ${key}`)
  return el
}

describe('one canvas-level pointer handler, not a trigger per block (research D3)', () => {
  beforeEach(() => {
    // No store seed: every case here passes `schedule={scheduleWithTwoEvents()}`,
    // so the canvas draws from that config's own days and strips and the store
    // reaches nothing rendered.
    //
    // 828px of plot at 1 minute per pixel from 08:00 covers every block below.
    seedViewState({ timeScroll: 480, timeZoom: 1, rowScroll: 0 })
  })

  it('opens the tooltip for the block under the pointer', () => {
    render(<MatrixCanvas schedule={scheduleWithTwoEvents()} />)

    const pool = blockFor('c1:POOLS')
    // 600 minutes is 120px into an 08:00 window at 1 min/px, and the block is
    // 100px of the 100 minutes it runs.
    expect(pool.style.left).toBe('120px')
    expect(pool.style.width).toBe('100px')

    // Client coordinates are plot coordinates plus the frozen gutter — the row
    // is read off the block itself, so this case pins the hit test rather than
    // the lane assignment.
    const top = parseFloat(pool.style.top)
    const height = parseFloat(pool.style.height)
    firePointerMove(viewport(), GUTTER_WIDTH_PX + 170, HEADER_OFFSET_PX + top + height / 2)

    expect(field('name')).toBe(DIV1_LABEL)
    expect(field('start')).toBe('10:00')
    expect(field('end')).toBe('11:40')
    expect(field('phase')).toBe('Pools')
  })

  it('closes the tooltip once the pointer leaves every block', () => {
    render(<MatrixCanvas schedule={scheduleWithTwoEvents()} />)

    const pool = blockFor('c1:POOLS')
    const top = parseFloat(pool.style.top)
    const height = parseFloat(pool.style.height)
    firePointerMove(viewport(), GUTTER_WIDTH_PX + 170, HEADER_OFFSET_PX + top + height / 2)
    expect(queryField('name')).not.toBeNull()

    // Plot x 600 reads minute 1080 — past the 900 every block here ends by.
    firePointerMove(viewport(), GUTTER_WIDTH_PX + 600, HEADER_OFFSET_PX + top + height / 2)

    expect(queryField('name')).toBeNull()
  })

  it('follows the pointer from one block to another rather than sticking', () => {
    render(<MatrixCanvas schedule={scheduleWithTwoEvents()} />)

    const pool = blockFor('c1:POOLS')
    const de = blockFor('c1:DE')
    const poolTop = parseFloat(pool.style.top)
    const poolHeight = parseFloat(pool.style.height)
    firePointerMove(viewport(), GUTTER_WIDTH_PX + 170, HEADER_OFFSET_PX + poolTop + poolHeight / 2)
    expect(field('phase')).toBe('Pools')

    // The DE block runs 760-900, so plot x 300 is minute 780, inside it.
    const deTop = parseFloat(de.style.top)
    const deHeight = parseFloat(de.style.height)
    firePointerMove(viewport(), GUTTER_WIDTH_PX + 300, HEADER_OFFSET_PX + deTop + deHeight / 2)

    expect(field('phase')).toBe('DE')
    expect(field('start')).toBe('12:40')
    expect(field('end')).toBe('15:00')
  })

  it('closes the tooltip when the pointer leaves the canvas without crossing empty grid', () => {
    // The case above walks the pointer off a block and onto bare grid, which is
    // the `blockAt() === null` path inside the viewport. A pointer that leaves
    // the element entirely — off the edge of the canvas, or onto the drawer —
    // fires no further move at all, so nothing but pointerleave closes it.
    render(<MatrixCanvas schedule={scheduleWithTwoEvents()} />)

    const pool = blockFor('c1:POOLS')
    const top = parseFloat(pool.style.top)
    const height = parseFloat(pool.style.height)
    firePointerMove(viewport(), GUTTER_WIDTH_PX + 170, HEADER_OFFSET_PX + top + height / 2)
    expect(field('phase')).toBe('Pools')

    fireEvent.pointerLeave(viewport())

    expect(queryField('phase')).toBeNull()
  })

  it('anchors the tooltip at the hovered block’s own top centre', () => {
    // jsdom lays nothing out, so getBoundingClientRect() is zeros and the
    // viewport's origin is 0,0 — which makes these exact pixels rather than a
    // range. The pool block is plot x 120-220 in an 08:00 window, so its centre
    // is plot x 170: 72px of gutter puts the anchor at 242, and the block's own
    // top of 0 plus the 38px header puts it at 38.
    render(<MatrixCanvas schedule={scheduleWithTwoEvents()} />)

    const pool = blockFor('c1:POOLS')
    expect(pool.style.left).toBe('120px')
    expect(pool.style.top).toBe('0px')

    firePointerMove(viewport(), GUTTER_WIDTH_PX + 170, HEADER_OFFSET_PX + 48)

    const anchor = document.querySelector<HTMLElement>('[data-slot="tooltip-trigger"]')
    expect(anchor?.style.left).toBe('242px')
    expect(anchor?.style.top).toBe('38px')
  })

  it('mounts exactly one tooltip trigger however many blocks are on screen', () => {
    render(<MatrixCanvas schedule={scheduleWithTwoEvents()} />)

    const blocks = Array.from(document.querySelectorAll<HTMLElement>('[data-event-block]'))
    expect(blocks.length).toBeGreaterThanOrEqual(3)

    expect(document.querySelectorAll('[data-slot="tooltip-trigger"]')).toHaveLength(1)
    for (const el of blocks) {
      expect(el.querySelector('[data-slot="tooltip-trigger"]')).toBeNull()
    }
  })
})
