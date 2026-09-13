import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import {
  CanvasTooltip,
  releasePopperWrapper,
  type CanvasTooltipTarget,
} from '../../../src/components/canvas/CanvasTooltip.tsx'
import { Block } from '../../../src/components/canvas/Block.tsx'
import type { BlockPlacement } from '../../../src/layout/lanes.ts'
import { Canvas } from '../../../src/components/canvas/Canvas.tsx'
import type { DerivedFindings, DerivedSchedule } from '../../../src/store/derived.ts'
import { Category, Gender, Phase, Weapon } from '../../../src/engine/types.ts'
import type { DayConfig } from '../../../src/engine/types.ts'
import { VIEW_STATE_STORAGE_KEY } from '../../../src/store/viewState.ts'
import { useStore } from '../../../src/store/store.ts'
import {
  makeCompetition,
  makeConfig,
  makeScheduleResult,
  makeStrips,
} from '../../helpers/factories.ts'
import { installStubResizeObserver } from '../../helpers/resizeObserver.ts'

// 004 T030 — the tooltip contract (contracts/ui-contract.md §Tooltip contract,
// FR-022).
//
// Every field below is pinned to a literal string for one known fixture. A
// "contains something" assertion here would pass against a tooltip that
// rendered the wrong minute, the wrong strip range, or the wrong day, which is
// exactly the class of defect this file exists to catch.
//
// The last describe block is the one research D3 still turns on: ONE Radix
// anchor for the whole grid, never a trigger per block.
//
// 013 T026 changed how the gesture reaches that anchor, not how many anchors
// there are. The canvas scrolls natively now, so a container-level hit test
// would have to reconstruct the browser's own scroll offsets on two axes
// across four nested sticky layers to answer a question the DOM already
// answers: the element under the pointer. The handler is therefore bound to
// each block and `pointerenter` is the crossing — while the tooltip itself
// stays a single controlled Radix instance the canvas points at.
//
// `getBoundingClientRect()` returns zeros in jsdom, so the anchor case below
// stubs it on the block it hovers rather than reading a layout jsdom never
// performs.

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

let restoreResizeObserver: () => void

beforeEach(() => {
  // Radix's popper measures its content through a ResizeObserver, which jsdom
  // does not implement.
  restoreResizeObserver = installStubResizeObserver(VIEWPORT_WIDTH, VIEWPORT_HEIGHT)
  localStorage.removeItem(VIEW_STATE_STORAGE_KEY)
  useStore.setState(useStore.getInitialState())
})

afterEach(() => {
  restoreResizeObserver()
})

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
 * Three layers sit over the canvas when the tooltip is open, not two: the
 * anchor, the content, and Radix's own portalled positioning wrapper between
 * the portal and the content. The first two carry `pointer-events-none` in
 * their class lists; the wrapper is Radix's element and takes no className, so
 * it stayed hit-testable.
 *
 * That is not cosmetic. The canvas clears its hover on a block's
 * `pointerleave`, so any element that takes the pointer over a block closes
 * the tooltip. `side="top"` keeps the content clear of the pointer only while
 * there is room above the block; near the top of the plot Radix's collision
 * detection flips it to `bottom`, the wrapper's rect covers the pointer resting
 * on the block, and the tooltip closes about 20ms after it opened — measured in
 * Chrome, where `pointerleave` arrived with both `relatedTarget` and
 * `elementFromPoint` reading `<div data-radix-popper-content-wrapper>`.
 *
 * jsdom lays nothing out and so cannot flip a side or hit-test a rect. What it
 * can hold is the invariant the flip exposes: no layer of this tooltip takes
 * the pointer, whatever the geometry does.
 */
describe('no layer of the tooltip takes the pointer (research D3)', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('leaves Radix’s positioning wrapper transparent to the pointer, as the anchor and content are', () => {
    render(<CanvasTooltip target={makeTarget()} />)

    const content = document.querySelector<HTMLElement>('[data-slot="tooltip-content"]')
    if (!content) throw new Error('tooltip content not rendered')

    const wrapper = content.parentElement
    expect(wrapper?.hasAttribute('data-radix-popper-content-wrapper')).toBe(true)
    expect(wrapper?.style.pointerEvents).toBe('none')
  })

  it('keeps the anchor and the content transparent too', () => {
    render(<CanvasTooltip target={makeTarget()} />)

    const anchor = document.querySelector<HTMLElement>('[data-slot="tooltip-trigger"]')
    const content = document.querySelector<HTMLElement>('[data-slot="tooltip-content"]')
    expect(anchor?.className).toContain('pointer-events-none')
    expect(content?.className).toContain('pointer-events-none')
  })

  it('warns in dev and leaves the parent untouched when the Radix wrapper is not there to release', () => {
    // Called directly, off a plain div rather than a rendered Radix tree: the
    // shape `releasePopperWrapper` depends on — a parent carrying
    // `data-radix-popper-content-wrapper` — is Radix's to change without
    // notice, and this is the case where it has.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const parent = document.createElement('div')
    const content = document.createElement('div')
    parent.appendChild(content)

    releasePopperWrapper(content)

    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]?.[0]).toContain('CanvasTooltip')
    expect(parent.style.pointerEvents).toBe('')
  })

  it('stays silent outside dev and leaves the parent untouched the same way', () => {
    // import.meta.env.DEV is read inside releasePopperWrapper at call time, not
    // cached at module load, so stubbing it here reaches the guard above.
    vi.stubEnv('DEV', false)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const parent = document.createElement('div')
    const content = document.createElement('div')
    parent.appendChild(content)

    releasePopperWrapper(content)

    expect(warn).not.toHaveBeenCalled()
    expect(parent.style.pointerEvents).toBe('')
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
  it('names the weapon at a width where the block itself can draw nothing', () => {
    // At this block's own row height, padding is clamp(rowH*0.2, 6, 11) = 6
    // per side. 20px leaves neither the shortest name rung (the category
    // alone) nor even a lone icon room: 20 - 2*6 = 8px is below the icon's
    // 10px floor (T027 follow-up, SC-005), so the block is a bare coloured
    // bar with nothing drawn at all.
    render(
      <Block
        competition={makeCompetition({ id: 'plain' })}
        label={DIV1_LABEL}
        placement={POOL_PLACEMENT}
        pinned={false}
        selected={false}
        widthPx={20}
        heightPx={96}
        style={{ position: 'absolute', left: 0, top: 0, width: 20, height: 96 }}
        findings={[]}
      />,
    )

    expect(document.querySelector('[data-icon]')).toBeNull()
    expect(document.querySelector('[data-label]')?.textContent).toBe('')
    cleanup()

    render(<CanvasTooltip target={makeTarget()} />)

    // The tooltip is the only place either fact is available at that width.
    expect(field('weapon')).toBe('Foil')
    expect(field('name')).toBe(DIV1_LABEL)
  })

  it('carries the same fields at a width where the block drew all of them', () => {
    render(
      <Block
        competition={makeCompetition({ id: 'plain' })}
        label={DIV1_LABEL}
        placement={POOL_PLACEMENT}
        pinned={false}
        selected={false}
        widthPx={200}
        heightPx={96}
        style={{ position: 'absolute', left: 0, top: 0, width: 200, height: 96 }}
        findings={[]}
      />,
    )

    expect(document.querySelector('[data-icon="grid"]')).not.toBeNull()
    expect(document.querySelector('[data-label]')?.textContent).not.toBe('')
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

/**
 * Everything `Canvas` needs beyond the schedule. One wide clock-time window
 * for all three days (research D3: every day shares one axis span) covers
 * every block above, and rung 2 draws at 3.2 pixels per minute.
 */
const CANVAS_DAY_CONFIGS: DayConfig[] = [
  { day_start_time: 480, day_end_time: 1320 },
  { day_start_time: 480, day_end_time: 1320 },
  { day_start_time: 480, day_end_time: 1320 },
]
const CANVAS_ZOOM = { zoomStep: 2, fitting: false }
const EMPTY_FINDINGS: DerivedFindings = {
  validationErrors: [],
  analysis: { warnings: [], suggestions: [] },
}
/** Rung 2's pixels per minute, and the axis start every `left` is measured from. */
const PPM = 3.2
const AXIS_START = 480

function renderCanvas(schedule: DerivedSchedule = scheduleWithTwoEvents()): void {
  render(
    <Canvas
      schedule={schedule}
      findings={EMPTY_FINDINGS}
      dayConfigs={CANVAS_DAY_CONFIGS}
      zoom={CANVAS_ZOOM}
    />,
  )
}

function blockFor(key: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(`[data-event-block="${key}"]`)
  if (!el) throw new Error(`no block rendered for ${key}`)
  return el
}

describe('one tooltip anchor for the whole grid, not a trigger per block (research D3)', () => {
  it('opens the tooltip for the block the pointer enters', () => {
    renderCanvas()

    const pool = blockFor('c1:POOLS')
    // 600 minutes is 120 past the 08:00 axis start, at 3.2px a minute, and the
    // block is 100 minutes wide.
    expect(pool.style.left).toBe(`${(600 - AXIS_START) * PPM}px`)
    expect(pool.style.width).toBe(`${100 * PPM}px`)

    fireEvent.pointerEnter(pool)

    expect(field('name')).toBe(DIV1_LABEL)
    expect(field('start')).toBe('10:00')
    expect(field('end')).toBe('11:40')
    expect(field('phase')).toBe('Pools')
  })

  it('closes the tooltip once the pointer leaves the block', () => {
    renderCanvas()

    const pool = blockFor('c1:POOLS')
    fireEvent.pointerEnter(pool)
    expect(queryField('name')).not.toBeNull()

    fireEvent.pointerLeave(pool)

    expect(queryField('name')).toBeNull()
  })

  it('follows the pointer from one block to another rather than sticking', () => {
    renderCanvas()

    fireEvent.pointerEnter(blockFor('c1:POOLS'))
    expect(field('phase')).toBe('Pools')

    // No intervening pointerleave: crossing straight from one block to its
    // neighbour is what a real pointer does at a shared edge, and a handler
    // that only ever *cleared* on leave would leave the old block showing.
    fireEvent.pointerEnter(blockFor('c1:DE'))

    expect(field('phase')).toBe('DE')
    expect(field('start')).toBe('12:40')
    expect(field('end')).toBe('15:00')
  })

  it('closes the tooltip when the hovered block stops being drawn, without any pointer event', () => {
    // The cases above close it by a gesture. A block can also leave the grid
    // under a stationary pointer — an edit removes the event, or its day goes
    // out of range — and the hover state is primitives only so that this
    // resolves to nothing on the next render rather than stranding a snapshot
    // of a block that is no longer there.
    renderCanvas()

    fireEvent.pointerEnter(blockFor('c1:POOLS'))
    expect(field('phase')).toBe('Pools')

    const withoutC1 = scheduleWithTwoEvents()
    delete withoutC1.events.c1
    cleanup()
    renderCanvas(withoutC1)

    expect(document.querySelector('[data-event-block="c1:POOLS"]')).toBeNull()
    expect(queryField('phase')).toBeNull()
  })

  it('anchors the tooltip at the hovered block’s own top centre', () => {
    // jsdom lays nothing out, so the anchor is read from a stubbed rect: the
    // claim is that the canvas takes the block's top *centre*, not its origin
    // and not the pointer, and a rect of zeros could not tell those apart.
    renderCanvas()

    const pool = blockFor('c1:POOLS')
    vi.spyOn(pool, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: 40,
      width: 320,
      height: 96,
      right: 420,
      bottom: 136,
      x: 100,
      y: 40,
      toJSON: () => ({}),
    } as DOMRect)

    fireEvent.pointerEnter(pool)

    const anchor = document.querySelector<HTMLElement>('[data-slot="tooltip-trigger"]')
    expect(anchor?.style.left).toBe('260px')
    expect(anchor?.style.top).toBe('40px')
  })

  it('mounts exactly one tooltip trigger however many blocks are on screen', () => {
    renderCanvas()

    const blocks = Array.from(document.querySelectorAll<HTMLElement>('[data-event-block]'))
    expect(blocks.length).toBeGreaterThanOrEqual(3)

    expect(document.querySelectorAll('[data-slot="tooltip-trigger"]')).toHaveLength(1)
    for (const el of blocks) {
      expect(el.querySelector('[data-slot="tooltip-trigger"]')).toBeNull()
    }
  })
})
