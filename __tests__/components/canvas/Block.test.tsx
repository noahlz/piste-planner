import { describe, it, expect, afterEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import { Block } from '../../../src/components/canvas/Block.tsx'
import type { BlockProps } from '../../../src/components/canvas/Block.tsx'
import type { BlockPlacement } from '../../../src/layout/lanes.ts'
import { Phase, Weapon } from '../../../src/engine/types.ts'
import { competitionLabel } from '../../../src/components/competitionLabels.ts'
import { categoryDisplay } from '../../../src/components/competitionLabels.ts'
import { Category, EventType } from '../../../src/engine/types.ts'
import { makeCompetition } from '../../helpers/factories.ts'

// 013 T025 (part a) — red tests for the redesigned block (D4, FR-035 to
// FR-037, FR-043, contracts/ui-contract.md §Canvas encoding contract).
// Block.tsx does not exist yet (T026 writes it); every case here fails on
// that missing module.

afterEach(() => cleanup())

const COMPETITION = makeCompetition({ id: 'plain', category: Category.DIV1, weapon: Weapon.FOIL })
const FULL_LABEL = competitionLabel(COMPETITION)
const CATEGORY_LABEL = categoryDisplay(COMPETITION.category, EventType.INDIVIDUAL)

const PLACEMENT: BlockPlacement = {
  competitionId: 'plain',
  day: 0,
  phase: Phase.POOLS,
  startMinutes: 480,
  endMinutes: 585,
  stripCount: 4,
  firstStrip: 0,
  overflow: false,
}

function renderBlock(overrides: Partial<BlockProps> = {}): HTMLElement {
  const props: BlockProps = {
    competition: COMPETITION,
    label: FULL_LABEL,
    placement: PLACEMENT,
    pinned: false,
    selected: false,
    widthPx: 200,
    heightPx: 96,
    style: { position: 'absolute', left: 0, top: 0, width: 200, height: 96 },
    findings: [],
    ...overrides,
  }
  render(<Block {...props} />)
  return block()
}

function block(): HTMLElement {
  const el = document.querySelector<HTMLElement>('[data-event-block]')
  if (!el) throw new Error('no block rendered')
  return el
}

describe('Block identity and accessibility (ui-contract §Canvas)', () => {
  it('is an img with an accessible name starting with the label', () => {
    const el = renderBlock()

    expect(el.getAttribute('role')).toBe('img')
    expect(el.getAttribute('aria-label')?.startsWith(FULL_LABEL)).toBe(true)
  })

  it('carries every kept data attribute with its value', () => {
    const el = renderBlock({
      placement: { ...PLACEMENT, day: 1, firstStrip: 6, phase: Phase.DE, startMinutes: 615, endMinutes: 699, stripCount: 16 },
    })

    expect(el.dataset.eventBlock).toBe('plain:DE')
    expect(el.dataset.eventId).toBe('plain')
    expect(el.dataset.day).toBe('1')
    expect(el.dataset.phase).toBe('DE')
    expect(el.dataset.phaseKind).toBe('de')
    expect(el.dataset.start).toBe('615')
    expect(el.dataset.end).toBe('699')
    expect(el.dataset.strips).toBe('16')
    expect(el.dataset.firstStrip).toBe('6')
    expect(el.dataset.overflow).toBe('false')
  })

  it('never carries a category attribute', () => {
    const el = renderBlock()
    expect(el.hasAttribute('data-category')).toBe(false)
    expect(el.querySelector('[data-category]')).toBeNull()
  })
})

describe('Block fill encodes weapon (FR-036, D4)', () => {
  const WEAPON_SLUGS: Array<[Weapon, string]> = [
    [Weapon.FOIL, 'foil'],
    [Weapon.EPEE, 'epee'],
    [Weapon.SABRE, 'sabre'],
  ]

  it.each(WEAPON_SLUGS)('marks %s with data-weapon and the %s fill token', (weapon, slug) => {
    const el = renderBlock({ competition: { ...COMPETITION, weapon } })

    expect(el.dataset.weapon).toBe(weapon)
    expect(el.style.getPropertyValue('--block-fill')).toBe(`var(--weapon-${slug}-fill)`)
  })
})

describe('Block hatch and icon encode phase (FR-036)', () => {
  it.each([Phase.DE, Phase.DE_PRELIMS, Phase.DE_ROUND_OF_16])(
    'gives a %s block a hatch and the bracket icon, no grid icon',
    (phase) => {
      const el = renderBlock({ placement: { ...PLACEMENT, phase } })

      expect(el.querySelector('[data-hatch]')).not.toBeNull()
      expect(el.querySelector('[data-icon="bracket"]')).not.toBeNull()
      expect(el.querySelector('[data-icon="grid"]')).toBeNull()
    },
  )

  it('gives a POOLS block the grid icon and no hatch', () => {
    const el = renderBlock({ placement: { ...PLACEMENT, phase: Phase.POOLS } })

    expect(el.querySelector('[data-hatch]')).toBeNull()
    expect(el.querySelector('[data-icon="grid"]')).not.toBeNull()
    expect(el.querySelector('[data-icon="bracket"]')).toBeNull()
  })
})

/**
 * The label fallback (mockup lines 1264-1271, phase3-contract.md): text at
 * width `w` fits when `w > text.length * namePx * 0.54 + taken`.
 *
 * T025 wrote these as 14 and 30, the mockup's rough mid-range values, before
 * `Block.tsx` existed to fix them. They are now the values the mockup's own
 * rule yields for *this fixture*, so the three widths below bracket the real
 * thresholds rather than approximations of them:
 *
 * - `namePx = clamp(max(rowH * 0.46, min(contentH * 0.34, 19)), 10, 20)` is 19.
 *   `rowH` is `heightPx / stripCount` = 96 / 4 = 24 and `contentH` is
 *   `heightPx - 8` = 88, so the `min(..., 19)` arm is the binding one.
 * - `taken = (showIcon ? iconPx + 9 : 0) + 22` is 53. `iconPx` is
 *   `round(clamp(min(contentH * 0.42, 22), 0, max(10, contentH - 2)))` = 22,
 *   and every width below clears `iconPx + 26`, so the icon is shown at all
 *   three.
 *
 * 30 was never reachable: `taken` is 22 with no icon and 41-53 with one.
 *
 * The exact "short name" string is still not pinned — only that it differs
 * from both the full label and the category text.
 */
describe('Block label degrades as room shrinks (D4, mockup fits())', () => {
  const NAME_PX = 19
  const TAKEN_PX = 53
  const fitsWidth = (text: string): number => text.length * NAME_PX * 0.54 + TAKEN_PX

  const WIDE = Math.ceil(fitsWidth(FULL_LABEL)) + 60
  const MEDIUM = Math.ceil((fitsWidth(CATEGORY_LABEL) + fitsWidth(FULL_LABEL)) / 2)
  const NARROW = Math.ceil(fitsWidth(CATEGORY_LABEL)) + 8

  function labelText(el: HTMLElement): string {
    return el.querySelector('[data-label]')?.textContent ?? ''
  }

  it('shows the full label when there is room for it', () => {
    const el = renderBlock({ widthPx: WIDE })
    expect(labelText(el)).toBe(FULL_LABEL)
  })

  it('shows something shorter than the full label, and not just the category, at medium width', () => {
    const el = renderBlock({ widthPx: MEDIUM })
    const text = labelText(el)

    expect(text.length).toBeGreaterThan(0)
    expect(text).not.toBe(FULL_LABEL)
  })

  it('falls back to the category alone at the narrowest labelled width', () => {
    const el = renderBlock({ widthPx: NARROW })
    expect(labelText(el)).toBe(CATEGORY_LABEL)
  })

  it('shows the full label when the width is unmeasured (widthPx null)', () => {
    const el = renderBlock({ widthPx: null })
    expect(labelText(el)).toBe(FULL_LABEL)
  })

  // T027 follow-up (SC-005): a 45px DE block at rung 5 in the live driver
  // showed neither label nor icon. FR-035's "neither" tier is for blocks too
  // narrow even for a shrunk glyph, not for a 45px block that has room for
  // one — so when no label fits at all, the icon stands alone down to a 10px
  // floor before the block goes blank.
  const PADDING_PX = 6 // clamp(rowH*0.2, 6, 11); rowH = 96/4 = 24 -> floors to 6

  it('keeps the phase icon alone when no label fits but the icon has room', () => {
    const el = renderBlock({ widthPx: 45, placement: { ...PLACEMENT, phase: Phase.DE_PRELIMS } })

    expect(labelText(el)).toBe('')
    const icon = el.querySelector<HTMLElement>('[data-icon="bracket"]')
    expect(icon).not.toBeNull()
    const iconPx = Number(icon?.style.width.replace('px', ''))
    expect(icon?.style.height.replace('px', '')).toBe(String(iconPx))
    expect(iconPx).toBeGreaterThanOrEqual(10)
    expect(iconPx).toBeLessThanOrEqual(45 - 2 * PADDING_PX)
  })

  it('goes blank — no label, no icon — below the 10px icon floor', () => {
    const el = renderBlock({ widthPx: 12, placement: { ...PLACEMENT, phase: Phase.DE_PRELIMS } })

    expect(labelText(el)).toBe('')
    expect(el.querySelector('[data-icon]')).toBeNull()
  })
})

describe('Block state badges (FR-037)', () => {
  it('shows a pin glyph only when pinned', () => {
    const pinned = renderBlock({ pinned: true })
    expect(pinned.dataset.pinned).toBe('true')
    expect(pinned.querySelector('[data-pin-glyph]')).not.toBeNull()
    cleanup()

    const unpinned = renderBlock({ pinned: false })
    expect(unpinned.dataset.pinned).toBe('false')
    expect(unpinned.querySelector('[data-pin-glyph]')).toBeNull()
  })

  it('draws a dashed border on an overflowed block', () => {
    const el = renderBlock({ placement: { ...PLACEMENT, overflow: true } })

    expect(el.dataset.overflow).toBe('true')
    const dashed = el.style.borderStyle === 'dashed' || el.className.includes('dashed')
    expect(dashed).toBe(true)
  })

  it('shows a ring only when selected', () => {
    const selected = renderBlock({ selected: true })
    expect(selected.dataset.selected).toBe('true')
    expect(selected.querySelector('[data-ring]')).not.toBeNull()
    cleanup()

    const unselected = renderBlock({ selected: false })
    expect(unselected.dataset.selected).toBe('false')
    expect(unselected.querySelector('[data-ring]')).toBeNull()
  })
})

describe('Block offers no drag or resize affordance (FR-043)', () => {
  it('has no resize handle, no draggable attribute and no pointer-driven behaviour', () => {
    const el = renderBlock()

    expect(document.querySelector('[role="resize"]')).toBeNull()
    expect(el.querySelector('[data-resize-handle]')).toBeNull()
    expect(el.hasAttribute('draggable')).toBe(false)
    expect(el.querySelector('[draggable]')).toBeNull()

    const before = el.outerHTML
    fireEvent.pointerDown(el)
    expect(el.outerHTML).toBe(before)
  })
})
