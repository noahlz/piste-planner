import { describe, it, expect } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import {
  EventBlock,
  blockChannels,
  GENDER_PREFIX_MIN_WIDTH_PX,
  WEAPON_MARK_MIN_WIDTH_PX,
  LABEL_TEXT_MIN_WIDTH_PX,
  type EventBlockProps,
} from '../../../src/components/canvas/EventBlock.tsx'
import type { BlockPlacement } from '../../../src/components/canvas/lanes.ts'
import { Category, Gender, Phase, VetAgeGroup, Weapon } from '../../../src/engine/types.ts'
import { RowHeightStep } from '../../../src/store/viewState.ts'
import { makeCompetition } from '../../helpers/factories.ts'

// 004 T029 — the encoding contract and the degradation order
// (contracts/ui-contract.md §Encoding contract, FR-014, FR-016).
//
// Four channels, and they do not degrade together: fill and the left edge-bar
// survive everything, while label text, then the weapon mark, then the gender
// prefix drop as a block narrows. Every width below is a literal on one side
// of a named threshold — 13 against 14, 27 against 28, 63 against 64 — so a
// threshold moved by one pixel fails here rather than passing on a range.
//
// The two letter marks are the reason this file exists in the shape it does.
// S4's handoff flagged that a gender prefix of "M" beside a weapon mark of "E"
// reads as one string "ME", collapsing two channels into one — and that merged
// into a single element they would also drop together, losing the contract's
// degradation order. They are pinned here as two elements, dropping separately.

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

const DE_PLACEMENT: BlockPlacement = {
  ...POOL_PLACEMENT,
  phase: Phase.DE,
  startMinutes: 615,
  endMinutes: 699,
  stripCount: 16,
}

function renderBlock(overrides: Partial<EventBlockProps> = {}): HTMLElement {
  const props: EventBlockProps = {
    competition: makeCompetition({ id: 'plain' }),
    label: DIV1_LABEL,
    day: 0,
    placement: POOL_PLACEMENT,
    x: 0,
    y: 0,
    width: 200,
    height: 96,
    rowHeightStep: RowHeightStep.NORMAL,
    findings: [],
    ...overrides,
  }
  render(<EventBlock {...props} />)
  return block()
}

function block(): HTMLElement {
  const el = document.querySelector<HTMLElement>('[data-event-block]')
  if (!el) throw new Error('no event block rendered')
  return el
}

function fillOf(el: HTMLElement): string {
  return el.style.getPropertyValue('--block-fill')
}

function inkOf(el: HTMLElement): string {
  return el.style.getPropertyValue('--block-ink')
}

function has(el: HTMLElement, marker: string): boolean {
  return el.querySelector(marker) !== null
}

describe('EventBlock fill encodes age category (FR-014)', () => {
  it('carries its own category token, not an inherited colour', () => {
    const el = renderBlock()

    expect(el.dataset.category).toBe('DIV1')
    expect(fillOf(el)).toBe('var(--cat-div1)')
    expect(inkOf(el)).toBe('var(--cat-div1-fg)')
  })

  it('gives two categories in different hue families different tokens', () => {
    const senior = renderBlock()
    const seniorFill = fillOf(senior)
    cleanup()

    const youth = renderBlock({
      competition: makeCompetition({ id: 'plain', category: Category.Y10 }),
    })

    expect(seniorFill).toBe('var(--cat-div1)')
    expect(fillOf(youth)).toBe('var(--cat-y10)')
    expect(fillOf(youth)).not.toBe(seniorFill)
  })

  it('gives two competitions in one category the same token, whatever else differs', () => {
    const first = renderBlock()
    const firstFill = fillOf(first)
    cleanup()

    // Same category, every other encoded attribute changed.
    const second = renderBlock({
      competition: makeCompetition({
        id: 'plain',
        category: Category.DIV1,
        gender: Gender.WOMEN,
        weapon: Weapon.SABRE,
      }),
    })

    expect(firstFill).toBe('var(--cat-div1)')
    expect(fillOf(second)).toBe('var(--cat-div1)')
  })

  it('resolves a veteran competition to its age band rather than to one veteran colour', () => {
    const el = renderBlock({
      competition: makeCompetition({
        id: 'plain',
        category: Category.VETERAN,
        vet_age_group: VetAgeGroup.VET50,
      }),
    })

    expect(el.dataset.category).toBe('VET50')
    expect(fillOf(el)).toBe('var(--cat-vet50)')
  })
})

describe('EventBlock edge-bar and hatch encode phase (FR-014)', () => {
  it('matches a pool and a DE block in fill and separates them in the phase channel', () => {
    const pool = renderBlock()
    const poolFill = fillOf(pool)
    const poolKind = pool.dataset.phaseKind
    const poolHasHatch = has(pool, '[data-hatch]')
    const poolHasBar = has(pool, '[data-edge-bar]')
    cleanup()

    const de = renderBlock({ placement: DE_PLACEMENT })

    expect(poolFill).toBe('var(--cat-div1)')
    expect(fillOf(de)).toBe('var(--cat-div1)')

    expect(poolKind).toBe('pool')
    expect(de.dataset.phaseKind).toBe('de')

    expect(poolHasHatch).toBe(false)
    expect(has(de, '[data-hatch]')).toBe(true)

    expect(poolHasBar).toBe(true)
    expect(has(de, '[data-edge-bar]')).toBe(true)
  })

  it.each([
    [Phase.POOLS, 'pool'],
    [Phase.FLIGHT_A, 'pool'],
    [Phase.FLIGHT_B, 'pool'],
    [Phase.DE, 'de'],
    [Phase.DE_PRELIMS, 'de'],
    [Phase.DE_ROUND_OF_16, 'de'],
  ])('reads %s as a %s-kind block', (phase, kind) => {
    const el = renderBlock({ placement: { ...POOL_PLACEMENT, phase } })

    expect(el.dataset.phase).toBe(phase)
    expect(el.dataset.phaseKind).toBe(kind)
    expect(has(el, '[data-hatch]')).toBe(kind === 'de')
  })
})

describe('EventBlock weapon mark and gender prefix (FR-014, FR-016)', () => {
  it.each([
    [Weapon.FOIL, 'F'],
    [Weapon.EPEE, 'E'],
    [Weapon.SABRE, 'S'],
  ])('marks %s with %s', (weapon, mark) => {
    const el = renderBlock({ competition: makeCompetition({ id: 'plain', weapon }) })

    expect(el.querySelector('[data-weapon-mark]')?.textContent).toBe(mark)
  })

  it.each([
    [Gender.MEN, 'M'],
    [Gender.WOMEN, 'W'],
  ])('prefixes a %s event with %s', (gender, prefix) => {
    const el = renderBlock({ competition: makeCompetition({ id: 'plain', gender }) })

    expect(el.querySelector('[data-gender-prefix]')?.textContent).toBe(prefix)
  })

  it('keeps the weapon mark and the gender prefix as two separate elements', () => {
    const el = renderBlock({
      competition: makeCompetition({ id: 'plain', weapon: Weapon.EPEE, gender: Gender.MEN }),
      width: 40,
    })

    const weapon = el.querySelector<HTMLElement>('[data-weapon-mark]')
    const prefix = el.querySelector<HTMLElement>('[data-gender-prefix]')
    if (!weapon || !prefix) throw new Error('both letter marks must render at 40px')

    expect(weapon).not.toBe(prefix)
    expect(weapon.contains(prefix)).toBe(false)
    expect(prefix.contains(weapon)).toBe(false)
    // Each holds exactly its own letter. A single merged glyph reading "EM"
    // would land under one of these markers and fail here whichever it wore.
    expect(weapon.textContent).toBe('E')
    expect(prefix.textContent).toBe('M')
  })

  it('drops the weapon mark without taking the gender prefix with it', () => {
    // The degradation order only survives while the two marks are two
    // elements: merged, they would drop together and the order is lost.
    const narrow = renderBlock({ width: 27 })
    const narrowWeapon = narrow.querySelector('[data-weapon-mark]')
    const narrowPrefix = narrow.querySelector('[data-gender-prefix]')
    cleanup()

    const wide = renderBlock({ width: 28 })

    expect(narrowWeapon).toBeNull()
    expect(narrowPrefix).not.toBeNull()
    expect(wide.querySelector('[data-weapon-mark]')).not.toBeNull()
    expect(wide.querySelector('[data-gender-prefix]')).not.toBeNull()
  })
})

describe('blockChannels degradation order', () => {
  it('pins the three width thresholds the contract names', () => {
    expect(GENDER_PREFIX_MIN_WIDTH_PX).toBe(14)
    expect(WEAPON_MARK_MIN_WIDTH_PX).toBe(28)
    expect(LABEL_TEXT_MIN_WIDTH_PX).toBe(64)
  })

  it.each([
    [13, { labelText: false, weaponMark: false, labelPrefix: false }],
    [14, { labelText: false, weaponMark: false, labelPrefix: true }],
    [27, { labelText: false, weaponMark: false, labelPrefix: true }],
    [28, { labelText: false, weaponMark: true, labelPrefix: true }],
    [63, { labelText: false, weaponMark: true, labelPrefix: true }],
    [64, { labelText: true, weaponMark: true, labelPrefix: true }],
  ])('answers %ipx with the channels the contract allows', (width, expected) => {
    expect(blockChannels(width, RowHeightStep.NORMAL)).toEqual(expected)
    expect(blockChannels(width, RowHeightStep.TALL)).toEqual(expected)
  })

  it.each([13, 14, 28, 64, 1000])(
    'drops every text channel at the compact step, %ipx wide',
    (width) => {
      expect(blockChannels(width, RowHeightStep.COMPACT)).toEqual({
        labelText: false,
        weaponMark: false,
        labelPrefix: false,
      })
    },
  )
})

describe('EventBlock degradation order in the DOM', () => {
  it.each([
    [13, false, false, false],
    [14, false, false, true],
    [27, false, false, true],
    [28, false, true, true],
    [63, false, true, true],
    [64, true, true, true],
  ])('renders %ipx with text=%s weapon=%s prefix=%s', (width, text, weapon, prefix) => {
    const el = renderBlock({ width })

    expect(has(el, '[data-label-text]')).toBe(text)
    expect(has(el, '[data-weapon-mark]')).toBe(weapon)
    expect(has(el, '[data-gender-prefix]')).toBe(prefix)

    // Fill and the edge-bar are the channels that never drop — including at
    // 13px, where no text survives at all.
    expect(fillOf(el)).toBe('var(--cat-div1)')
    expect(has(el, '[data-edge-bar]')).toBe(true)
  })

  it('shows the label text itself once the block is wide enough to carry it', () => {
    const el = renderBlock({ width: 64 })

    expect(el.querySelector('[data-label-text]')?.textContent).toBe(DIV1_LABEL)
  })

  it('drops all three text channels at the compact step where normal keeps them', () => {
    const normal = renderBlock({ width: 200, rowHeightStep: RowHeightStep.NORMAL })
    const normalChannels = [
      has(normal, '[data-label-text]'),
      has(normal, '[data-weapon-mark]'),
      has(normal, '[data-gender-prefix]'),
    ]
    cleanup()

    const compact = renderBlock({
      width: 200,
      height: 64,
      rowHeightStep: RowHeightStep.COMPACT,
    })

    expect(normalChannels).toEqual([true, true, true])
    expect(has(compact, '[data-label-text]')).toBe(false)
    expect(has(compact, '[data-weapon-mark]')).toBe(false)
    expect(has(compact, '[data-gender-prefix]')).toBe(false)

    // The two channels that survive compact, which is what makes compact
    // readable at all.
    expect(fillOf(compact)).toBe('var(--cat-div1)')
    expect(has(compact, '[data-edge-bar]')).toBe(true)
  })
})

/**
 * 004 T050 — the scorecard's hover highlight (FR-029, S6 design brief §5).
 *
 * The highlight is deliberately **not** a fifth encoding channel. The four
 * channels say what an event *is*; the highlight says only "this block drives
 * the metric currently under the pointer", which belongs to the scorecard and
 * is gone the moment the pointer leaves. So it has to sit outside the channels
 * and outside their degradation order both ways: visible at the widths and the
 * row height where every text channel is already gone, and changing nothing a
 * block encodes.
 *
 * The two halves are asserted separately on purpose. A cue drawn out of
 * `blockChannels` would pass the "changes nothing" half and fail the narrow
 * cases; a cue that repainted the fill would pass the narrow cases and fail the
 * readout below.
 */
describe('EventBlock highlight cue (FR-029)', () => {
  /** The four encoding channels, read off a rendered block in one shot. */
  function channelReadout(el: HTMLElement): Record<string, unknown> {
    return {
      fill: fillOf(el),
      ink: inkOf(el),
      edgeBar: has(el, '[data-edge-bar]'),
      hatch: has(el, '[data-hatch]'),
      weaponMark: el.querySelector('[data-weapon-mark]')?.textContent ?? null,
      genderPrefix: el.querySelector('[data-gender-prefix]')?.textContent ?? null,
    }
  }

  it('stamps the marker and draws the cue only when highlighted', () => {
    const plain = renderBlock()
    const plainMarker = plain.dataset.highlighted
    const plainCue = has(plain, '[data-highlight-cue]')
    cleanup()

    const lit = renderBlock({ highlighted: true })

    expect(plainMarker).toBeUndefined()
    expect(plainCue).toBe(false)
    expect(lit.dataset.highlighted).toBe('true')
    expect(has(lit, '[data-highlight-cue]')).toBe(true)
  })

  it('actually paints the ring, rather than drawing an empty overlay', () => {
    // Everything else this describe asserts about the cue — that it exists, is
    // aria-hidden, does not hit-test, survives every width and the compact row
    // — is satisfied by a span that paints nothing at all, and neither this
    // suite nor scripts/smoke.mjs would notice: FR-029 would be dead with a
    // green suite. The two-layer ring *is* the cue, and the module docblock
    // argues at length that it is the deliberate exception to "paint comes from
    // the palette" — chrome tokens, so one of the two reads on every one of the
    // sixteen category fills. jsdom reads the inline value back verbatim.
    const cue = renderBlock({ highlighted: true }).querySelector<HTMLElement>('[data-highlight-cue]')
    if (!cue) throw new Error('a highlighted block must draw a cue')

    expect(cue.style.boxShadow).toBe(
      'inset 0 0 0 2px var(--background), inset 0 0 0 3px var(--foreground)',
    )
  })

  it('keeps the cue out of the accessible tree and out of the hit test', () => {
    const el = renderBlock({ highlighted: true })
    const cue = el.querySelector<HTMLElement>('[data-highlight-cue]')
    if (!cue) throw new Error('a highlighted block must draw a cue')

    // The block already names itself for a screen reader and the canvas
    // hit-tests the pointer against block geometry — a cue that answered
    // either would be a second voice for one rectangle.
    expect(cue.getAttribute('aria-hidden')).toBe('true')
    expect(cue.className).toContain('pointer-events-none')
    expect(cue.className).toContain('absolute')
  })

  it.each([13, 14, 27, 28, 63, 64, 200])(
    'draws the cue at %ipx, whatever the degradation order has already dropped',
    (width) => {
      const el = renderBlock({ width, highlighted: true })

      expect(has(el, '[data-highlight-cue]')).toBe(true)
    },
  )

  it('draws the cue at 13px, where not one text channel survives', () => {
    const el = renderBlock({ width: 13, highlighted: true })

    // The state this case is about, asserted rather than assumed: below the
    // 14px gender-prefix threshold every text channel is already gone.
    expect(has(el, '[data-label-text]')).toBe(false)
    expect(has(el, '[data-weapon-mark]')).toBe(false)
    expect(has(el, '[data-gender-prefix]')).toBe(false)

    expect(has(el, '[data-highlight-cue]')).toBe(true)
    expect(el.dataset.highlighted).toBe('true')
  })

  it('draws the cue at the compact row height, where not one text channel survives either', () => {
    const el = renderBlock({
      width: 200,
      height: 64,
      rowHeightStep: RowHeightStep.COMPACT,
      highlighted: true,
    })

    expect(has(el, '[data-label-text]')).toBe(false)
    expect(has(el, '[data-weapon-mark]')).toBe(false)
    expect(has(el, '[data-gender-prefix]')).toBe(false)

    expect(has(el, '[data-highlight-cue]')).toBe(true)
    expect(el.dataset.highlighted).toBe('true')
  })

  it('leaves all four encoding channels exactly as they were', () => {
    // A DE block, so the phase channel is in play whole — the edge-bar and the
    // hatch — rather than half of it.
    const shared: Partial<EventBlockProps> = {
      competition: makeCompetition({ id: 'plain', weapon: Weapon.EPEE, gender: Gender.WOMEN }),
      placement: DE_PLACEMENT,
      width: 200,
    }
    const plain = renderBlock(shared)
    const before = channelReadout(plain)
    cleanup()

    const lit = renderBlock({ ...shared, highlighted: true })

    // Literals, so a highlight that repainted a channel to some *other*
    // constant could not satisfy both sides of the comparison.
    expect(before).toEqual({
      fill: 'var(--cat-div1)',
      ink: 'var(--cat-div1-fg)',
      edgeBar: true,
      hatch: true,
      weaponMark: 'E',
      genderPrefix: 'W',
    })
    expect(channelReadout(lit)).toEqual(before)
  })

  it('lets the overflow border paint over the highlight, so both cues read at once', () => {
    // Both cues fill the border box, so paint order decides which survives. The
    // overflow cue is the *persistent* fact — this block found no run and is
    // drawn on top of strips something else legitimately holds — while the
    // highlight is gone the moment the pointer moves. Drawing the highlight
    // last would hide an over-capacity day for as long as a metric is hovered;
    // drawn first, the dashed --block-ink border paints over the white ring
    // with its own gaps showing through, and both read.
    // A DE block, so all three overlays are present and the whole order is
    // pinned in one shot: the hatch first — which is why it cannot tint the
    // ring — then the highlight, then the overflow border.
    const el = renderBlock({
      placement: { ...DE_PLACEMENT, overflow: true },
      highlighted: true,
    })

    const marker = ['data-hatch', 'data-highlight-cue', 'data-overflow-cue']
    const overlays = [...el.querySelectorAll(marker.map((m) => `[${m}]`).join(', '))]
    expect(overlays.map((el) => marker.find((m) => el.hasAttribute(m)))).toEqual(marker)
  })

  it('does not dim or otherwise touch a block that is not highlighted', () => {
    // Additive only: lighting one block must not restyle its neighbours, which
    // is the difference between a highlight and a filter.
    const before = renderBlock()
    const beforeClass = before.className
    const beforeOpacity = before.style.opacity
    cleanup()

    const after = renderBlock({ highlighted: false })

    expect(after.className).toBe(beforeClass)
    expect(after.style.opacity).toBe(beforeOpacity)
    expect(after.dataset.highlighted).toBeUndefined()
  })
})

describe('EventBlock identity and geometry markers', () => {
  it('positions itself from its props rather than from a layout', () => {
    const el = renderBlock({ x: 120, y: 48, width: 105, height: 96 })

    expect(el.style.left).toBe('120px')
    expect(el.style.top).toBe('48px')
    expect(el.style.width).toBe('105px')
    expect(el.style.height).toBe('96px')
  })

  it('carries the placement the canvas has to be able to read back', () => {
    const el = renderBlock({ day: 1, placement: { ...DE_PLACEMENT, day: 1, firstStrip: 6 } })

    expect(el.dataset.eventBlock).toBe('plain:DE')
    expect(el.dataset.eventId).toBe('plain')
    expect(el.dataset.day).toBe('1')
    expect(el.dataset.phase).toBe('DE')
    expect(el.dataset.start).toBe('615')
    expect(el.dataset.end).toBe('699')
    expect(el.dataset.strips).toBe('16')
    expect(el.dataset.firstStrip).toBe('6')
  })

  it('names itself for a screen reader with the facts the block draws', () => {
    renderBlock()

    const el = screen.getByRole('img')
    const name = el.getAttribute('aria-label') ?? ''

    // The four facts FR-022 also puts in the tooltip, in whatever wording the
    // implementation chooses — but every one of them present.
    expect(name).toContain(DIV1_LABEL)
    expect(name).toContain('Pools')
    expect(name).toContain('Day 1')
    expect(name).toContain('8:00')
    expect(name).toContain('9:45')
    expect(name).toContain('Strips 1–4')
  })
})
