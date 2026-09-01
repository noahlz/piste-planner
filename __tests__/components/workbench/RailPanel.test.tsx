import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import { RailPanel } from '../../../src/components/workbench/RailPanel.tsx'
import { Rail } from '../../../src/components/workbench/Rail.tsx'
import { useStore } from '../../../src/store/store.ts'

// 004 T068 finding 7. `AdvancedPanel` duplicated `RailPanel`'s trigger byte for
// byte — same classes, same chevron, same rotate-90 — because `RailPanel`
// unmounts its `CollapsibleContent` on close and FR-035 needs the applied
// defaults readable while the panel is collapsed. The duplication was never the
// requirement; a slot outside `CollapsibleContent` satisfies FR-035 and leaves
// the rail one panel shape.
//
// This suite is that slot's contract, and it exists so the three properties the
// refactor must not weaken have somewhere to fail: the summary stays mounted
// while `aria-expanded` is `false`, the trigger keeps its accessible name, and
// the rail's tab order stays visual with Advanced last.

beforeEach(() => {
  useStore.setState(useStore.getInitialState())
})

describe('RailPanel summary slot', () => {
  it('keeps the summary mounted and readable while the panel is collapsed (FR-035)', () => {
    render(
      <RailPanel heading="Demo" summary={<span>applied defaults</span>}>
        <p>panel body</p>
      </RailPanel>,
    )

    const trigger = screen.getByRole('button', { name: 'Demo' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    // The whole reason the slot exists: Radix unmounts CollapsibleContent, so a
    // summary passed as a child would vanish exactly when it is needed.
    expect(screen.getByText('applied defaults')).toBeInTheDocument()
    expect(
      screen.queryByText('panel body'),
      'the content is mounted while collapsed, so the summary slot proves nothing',
    ).not.toBeInTheDocument()

    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('panel body')).toBeInTheDocument()
    expect(screen.getByText('applied defaults')).toBeInTheDocument()
  })

  it('renders the summary between the trigger and the content, not inside either', () => {
    render(
      <RailPanel heading="Demo" summary={<span>applied defaults</span>} defaultOpen>
        <p>panel body</p>
      </RailPanel>,
    )

    const trigger = screen.getByRole('button', { name: 'Demo' })
    const root = trigger.parentElement
    if (!root) throw new Error('the trigger has no parent — RailPanel renders no Collapsible root')

    // Order matters for the reading order a screen reader follows and for the
    // visual position the summary has always had, under the heading.
    expect(Array.from(root.children).indexOf(trigger)).toBe(0)
    const summary = screen.getByText('applied defaults')
    const body = screen.getByText('panel body')
    expect(
      trigger.contains(summary),
      'the summary is inside the trigger, which would fold it into the accessible name',
    ).toBe(false)
    expect(
      summary.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING,
      'the summary does not precede the content',
    ).toBeTruthy()
  })

  it('ties the summary to the trigger with aria-describedby', () => {
    render(
      <RailPanel heading="Demo" summary={<span>applied defaults</span>}>
        <p>panel body</p>
      </RailPanel>,
    )

    const trigger = screen.getByRole('button', { name: 'Demo' })
    const describedBy = trigger.getAttribute('aria-describedby')
    expect(describedBy, 'a panel with a summary names no description').toBeTruthy()
    expect(document.getElementById(describedBy as string)).toHaveTextContent('applied defaults')

    // The description must not leak into the name.
    expect(trigger).toHaveAccessibleName('Demo')
  })

  it('names no description and renders no summary container when no summary is passed', () => {
    render(
      <RailPanel heading="Demo">
        <p>panel body</p>
      </RailPanel>,
    )

    const trigger = screen.getByRole('button', { name: 'Demo' })
    expect(
      trigger.getAttribute('aria-describedby'),
      'a summary-less panel points aria-describedby at nothing, which a screen reader reads as a broken reference',
    ).toBeNull()
    const root = trigger.parentElement
    if (!root) throw new Error('the trigger has no parent — RailPanel renders no Collapsible root')
    expect(
      root.children.length,
      'a summary-less panel renders an empty summary container',
    ).toBe(2)
  })
})

describe('Rail panel order', () => {
  const HEADINGS = [
    'Tournament',
    'Strips',
    'Events',
    'Per-event overrides',
    'Pool durations',
    'Advanced',
  ]

  it('keeps the six triggers in visual order with Advanced last', () => {
    render(<Rail />)

    const rail = screen.getByRole('complementary', { name: 'Left rail' })
    const triggers = HEADINGS.map((heading) =>
      within(rail).getByRole('button', { name: heading }),
    )

    for (let i = 1; i < triggers.length; i++) {
      expect(
        triggers[i - 1].compareDocumentPosition(triggers[i]) & Node.DOCUMENT_POSITION_FOLLOWING,
        `"${HEADINGS[i]}" does not follow "${HEADINGS[i - 1]}" in the DOM`,
      ).toBeTruthy()
    }
  })

  it('leaves tab order equal to visual order — no panel trigger takes a positive tabindex', () => {
    // Tab order is DOM order only while nothing claims a positive tabindex.
    // Without this, "Advanced last" could hold visually and not for a keyboard
    // user, which is the case FR-035's reader is in.
    render(<Rail />)

    const rail = screen.getByRole('complementary', { name: 'Left rail' })
    for (const heading of HEADINGS) {
      const attr = within(rail).getByRole('button', { name: heading }).getAttribute('tabindex')
      expect(
        attr === null || Number(attr) <= 0,
        `"${heading}" has tabindex="${attr}", which pulls it out of visual tab order`,
      ).toBe(true)
    }
  })
})
