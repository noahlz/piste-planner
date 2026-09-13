import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EventsPanel } from '../../../../src/components/workbench/panels/EventsPanel.tsx'
import { useStore } from '../../../../src/store/store.ts'
import { CATALOGUE, ALL_VET_AGE_GROUPS, TEMPLATES, findCompetition } from '../../../../src/engine/catalogue.ts'
import { MIN_FENCERS } from '../../../../src/engine/constants.ts'
import { Category, EventType, Gender, Weapon } from '../../../../src/engine/types.ts'
import { categoryDisplay, vetAgeGroupDisplay, competitionLabel } from '../../../../src/components/competitionLabels.ts'

// Perf review on T020-T022: EventsPanel used to subscribe to the whole
// selectedCompetitions record, so committing one fencer count re-rendered
// all 120 chips. NumberInput's aria-label is unique per chip
// ("Fencer count for {label}"), so wrapping it counts renders per chip
// without touching EventChip's internals or the DOM/aria contract the other
// 13 cases in this file pin. A React Profiler around the whole tree only
// reports one number for the whole subtree per commit, which can't
// distinguish "one chip re-rendered" from "all 120 did" — this counts each
// chip's NumberInput individually, which is what proves isolation.
const { numberInputRenderCounts } = vi.hoisted(() => ({
  numberInputRenderCounts: new Map<string, number>(),
}))

vi.mock('@/components/ui/number-input', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../../src/components/ui/number-input.tsx')>()
  return {
    ...actual,
    NumberInput: (props: Parameters<typeof actual.NumberInput>[0]) => {
      const label = props['aria-label'] ?? ''
      numberInputRenderCounts.set(label, (numberInputRenderCounts.get(label) ?? 0) + 1)
      return <actual.NumberInput {...props} />
    },
  }
})

// 013 T019 (FR-019–FR-021, ui-contract.md §Events): red first, against
// src/components/workbench/panels/EventsPanel.tsx, which does not exist yet.
// Takes the events and fencer-count cases from configEditing.test.tsx
// (the fencer-count and competition-matrix sections, the composed-host
// case) as its seed —
// that file is untouched here; T021 deletes it once this panel replaces both
// section components.

beforeEach(() => {
  useStore.setState(useStore.getInitialState())
  numberInputRenderCounts.clear()
})

// The individual-category order every gender/weapon group shares
// (src/engine/catalogue.ts's buildCatalogue loop), used to assert chip order
// within one section without hard-coding a display string T021 hasn't fixed.
const INDIVIDUAL_CATEGORY_ORDER: Category[] = [
  Category.Y8, Category.Y10, Category.Y12, Category.Y14,
  Category.CADET, Category.JUNIOR,
  Category.DIV1, Category.DIV1A, Category.DIV2, Category.DIV3,
]

describe('EventsPanel — heading', () => {
  it('reads "Selected 0 of 120" on a fresh store', () => {
    render(<EventsPanel />)
    expect(screen.getByRole('heading', { name: 'Selected 0 of 120' })).toBeInTheDocument()
    expect(CATALOGUE).toHaveLength(120)
  })

  it('reads the template\'s count after applyTemplate', () => {
    useStore.getState().applyTemplate('RYC Weekend')
    render(<EventsPanel />)
    const count = Object.keys(useStore.getState().selectedCompetitions).length
    expect(screen.getByRole('heading', { name: `Selected ${count} of 120` })).toBeInTheDocument()
  })
})

describe('EventsPanel — sections', () => {
  it('renders one section per gender and weapon, named "Women\'s Foil" etc.', () => {
    render(<EventsPanel />)

    for (const gender of [Gender.WOMEN, Gender.MEN]) {
      for (const weapon of [Weapon.FOIL, Weapon.EPEE, Weapon.SABRE]) {
        const genderWord = gender === Gender.WOMEN ? "Women's" : "Men's"
        const weaponWord = weapon === Weapon.FOIL ? 'Foil' : weapon === Weapon.EPEE ? 'Epee' : 'Saber'
        expect(
          screen.getByRole('region', { name: `${genderWord} ${weaponWord}` }),
        ).toBeInTheDocument()
      }
    }
  })

  it('orders a section\'s chips: individual categories, the six veteran bands, then team categories', () => {
    render(<EventsPanel />)

    const section = screen.getByRole('region', { name: "Women's Foil" })
    const chips = section.querySelectorAll('button[aria-pressed]')
    // 10 individual + 6 veteran bands + 4 team (CADET/JUNIOR/DIV1 + VETERAN) = 20
    expect(chips.length).toBe(20)

    const names = Array.from(chips).map((c) => c.getAttribute('aria-label') ?? c.textContent ?? '')

    INDIVIDUAL_CATEGORY_ORDER.forEach((category, i) => {
      const expectedLabel = categoryDisplay(category, EventType.INDIVIDUAL)
      expect(names[i], `chip ${i} (individual ${category})`).toContain(expectedLabel)
      expect(names[i], `chip ${i} (individual ${category}) must not read as a team chip`).not.toMatch(/Team$/)
    })

    ALL_VET_AGE_GROUPS.forEach((ageGroup, i) => {
      const idx = INDIVIDUAL_CATEGORY_ORDER.length + i
      expect(names[idx], `chip ${idx} (veteran band ${ageGroup})`).toContain(vetAgeGroupDisplay(ageGroup))
    })

    // The remaining chips are the team categories, each suffixed "Team".
    const teamNames = names.slice(INDIVIDUAL_CATEGORY_ORDER.length + ALL_VET_AGE_GROUPS.length)
    expect(teamNames).toHaveLength(4)
    for (const name of teamNames) {
      expect(name, name).toMatch(/Team$/)
    }
  })

  it('each chip is a button with aria-pressed, false when unselected', () => {
    render(<EventsPanel />)
    const chips = screen.getAllByRole('button', { pressed: false })
    // Fresh store: every one of the 120 catalogue chips is unpressed.
    expect(chips.length).toBe(120)
  })
})

describe('EventsPanel — selection', () => {
  it('clicking an unselected chip selects it in the store', () => {
    render(<EventsPanel />)

    const section = screen.getAllByRole('region')[0]
    const firstChip = section.querySelector('button[aria-pressed]') as HTMLElement
    expect(firstChip).toBeTruthy()

    fireEvent.click(firstChip)

    expect(Object.keys(useStore.getState().selectedCompetitions).length).toBe(1)
    expect(firstChip).toHaveAttribute('aria-pressed', 'true')
  })

  // 013 T021: successor to configEditing.test.tsx's competition-matrix case
  // ("renders competition toggles when template is applied"), deleted with
  // that file. The heading case above proves the *count* the panel prints;
  // this proves the chips themselves carry the pressed state.
  it('presses exactly the applied template\'s chips', () => {
    useStore.getState().applyTemplate('RYC Weekend')
    render(<EventsPanel />)

    expect(screen.getAllByRole('button', { pressed: true })).toHaveLength(
      TEMPLATES['RYC Weekend'].length,
    )
  })

  it('clicking a selected chip deselects it in the store', () => {
    useStore.getState().applyTemplate('RYC Weekend')
    render(<EventsPanel />)

    const pressed = screen.getAllByRole('button', { pressed: true })
    expect(pressed.length).toBeGreaterThan(0)
    const before = Object.keys(useStore.getState().selectedCompetitions).length

    fireEvent.click(pressed[0])

    expect(Object.keys(useStore.getState().selectedCompetitions).length).toBe(before - 1)
  })
})

describe('EventsPanel — fencer count', () => {
  it('a pressed chip renders a spinbutton "Fencer count for {label}" with min = MIN_FENCERS', () => {
    useStore.getState().applyTemplate('RYC Weekend')
    render(<EventsPanel />)

    const spinbuttons = screen.getAllByRole('spinbutton', { name: /Fencer count for/ })
    expect(spinbuttons.length).toBeGreaterThan(0)
    for (const input of spinbuttons) {
      expect(input).toHaveAttribute('min', String(MIN_FENCERS))
    }
  })

  it('an unpressed chip renders no fencer-count spinbutton', () => {
    render(<EventsPanel />)
    expect(screen.queryAllByRole('spinbutton', { name: /Fencer count for/ })).toHaveLength(0)
  })

  // 013 T021: successor to configEditing.test.tsx's two positive fencer-count
  // cases ("entering fencer counts updates the inputs" and "changing fencer
  // count input updates store state"), deleted with that file. Without this
  // the panel's remaining fencer-count cases only pin what the input refuses,
  // never that it commits at all.
  it('a change to a valid value commits it and shows it in the field', () => {
    // Addressed by label, not by DOM position: the panel lays chips out in
    // catalogue-group order, which is not the sort order of the ids.
    const id = TEMPLATES['RYC Weekend'][0]
    useStore.getState().applyTemplate('RYC Weekend')
    render(<EventsPanel />)

    const entry = findCompetition(id)
    expect(entry).toBeDefined()
    const input = screen.getByRole('spinbutton', {
      name: `Fencer count for ${competitionLabel(entry!)}`,
    })
    fireEvent.change(input, { target: { value: '64' } })

    // commitOnChange — no blur needed for the store to see it.
    expect(useStore.getState().selectedCompetitions[id].fencer_count).toBe(64)
    expect((input as HTMLInputElement).value).toBe('64')
  })

  it('a change to a value below MIN_FENCERS commits nothing', () => {
    useStore.getState().applyTemplate('RYC Weekend')
    const [firstId] = Object.keys(useStore.getState().selectedCompetitions).sort()
    useStore.getState().updateCompetition(firstId, { fencer_count: 10 })
    render(<EventsPanel />)

    const inputs = screen.getAllByRole('spinbutton', { name: /Fencer count for/ })
    fireEvent.change(inputs[0], { target: { value: String(MIN_FENCERS - 1) } })

    // commitOnChange never clamps mid-keystroke (number-input.tsx) — an
    // out-of-range value is simply not committed, the same rule
    // configEditing.test.tsx's fencer-count commit-on-change case already
    // pins for the retired fencer-count component.
    const stillFirstId = Object.keys(useStore.getState().selectedCompetitions).sort()[0]
    expect(useStore.getState().selectedCompetitions[stillFirstId].fencer_count).not.toBe(MIN_FENCERS - 1)
  })
})

describe('EventsPanel — chip render isolation (perf review, T020–T022 follow-up)', () => {
  it('a fencer-count edit does not re-render an unrelated chip\'s input', () => {
    useStore.getState().applyTemplate('RYC Weekend')

    const ids = TEMPLATES['RYC Weekend']
    const editedEntry = findCompetition(ids[0])!
    const untouchedEntry = findCompetition(ids[1])!
    const editedLabel = `Fencer count for ${competitionLabel(editedEntry)}`
    const untouchedLabel = `Fencer count for ${competitionLabel(untouchedEntry)}`

    render(<EventsPanel />)

    // Mount renders every selected chip's input once.
    expect(numberInputRenderCounts.get(untouchedLabel)).toBe(1)

    const editedInput = screen.getByRole('spinbutton', { name: editedLabel })
    fireEvent.change(editedInput, { target: { value: '64' } })

    expect(useStore.getState().selectedCompetitions[ids[0]].fencer_count).toBe(64)
    // The edited chip's own input re-renders (it owns the changed value);
    // the sibling chip subscribes to a different store slice, so its
    // NumberInput must not render again.
    expect(numberInputRenderCounts.get(editedLabel)).toBeGreaterThan(1)
    expect(numberInputRenderCounts.get(untouchedLabel)).toBe(1)
  })
})

describe('EventsPanel — no per-event control beyond selection and fencer count (FR-021)', () => {
  it('renders no combobox or spinbutton for cut, DE mode, video policy, referee policy or single-pool override', () => {
    useStore.getState().applyTemplate('RYC Weekend')
    render(<EventsPanel />)

    const forbidden = /cut|de mode|video policy|referee|single.?pool/i
    const controls = [
      ...screen.queryAllByRole('combobox'),
      ...screen.queryAllByRole('spinbutton'),
    ]
    for (const control of controls) {
      const name = control.getAttribute('aria-label') ?? ''
      expect(name, `unexpected per-event control: "${name}"`).not.toMatch(forbidden)
    }
  })
})
