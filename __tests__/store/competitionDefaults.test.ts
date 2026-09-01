import { describe, it, expect } from 'vitest'
import { useStore } from '../../src/store/store.ts'
import { CATALOGUE, TEMPLATES, findCompetition } from '../../src/engine/catalogue.ts'
import { buildTournamentConfig } from '../../src/store/buildConfig.ts'
import { validateConfig } from '../../src/engine/validation.ts'
import { BottleneckSeverity, CutMode, EventType, ValidationMode } from '../../src/engine/types.ts'
import { DEFAULT_CUT_BY_CATEGORY } from '../../src/engine/constants.ts'

/**
 * Contract test for specs/008-team-event-cut/contracts/competition-defaults.md
 * (C1, C2, C3). Gates the store's per-competition default derivation
 * (`defaultConfigForId`, src/store/store.ts:217-235) against the engine's own
 * published rules, checked across the whole catalogue rather than the eight
 * reference tournaments that happen to be fixtures (research.md D1-D3).
 *
 * Today this is RED on C1 and C2 for the 18 non-Veteran team catalogue
 * entries (Cadet/Junior/Div1 x 3 weapons x 2 genders): `defaultConfigForId`
 * keys the cut default off category alone, so a team event inherits its
 * category's individual cut (PERCENTAGE/20 for these three categories)
 * instead of the DISABLED/100 the engine's `cut-on-team` rule
 * (src/engine/validation.ts:157-159) requires. Veteran's 6 team entries
 * already default to DISABLED/100 because Veteran's category default is that
 * value (data-model.md; research.md D3), so they are not part of the red
 * set. T005 makes C1/C2 green by branching the derivation on event_type; C3
 * is a regression guard on the individual side and is not expected to be red.
 */

/**
 * A fencer count valid for every catalogue entry under either cut a category
 * might default to (PERCENTAGE/20 or DISABLED/100): the resulting DE bracket
 * size is covered by DEFAULT_DE_DURATION_TABLE for all three weapons either
 * way (32 fencers, DISABLED -> bracket 32; 32 fencers, PERCENTAGE/20 ->
 * round(32*0.2)=6 promoted -> bracket 8). C1's scope note: fencer_count is
 * the user's input, not a store-chosen default, so the test supplies a valid
 * one and holds the store responsible only for the fields it picked.
 */
const VALID_FENCER_COUNT = 32

/**
 * C1's store-chosen fields (contracts/competition-defaults.md C1 scope
 * note) — the fields `defaultConfigForId` picks, as opposed to
 * `fencer_count`, which is the user's input. A BINDING ERROR whose `field`
 * falls outside this set is out of C1's scope regardless of severity — e.g.
 * ROC Mega's strip-hours shortfall (baseline.md), which is a tournament-level
 * feasibility finding on `feasibility`, not a per-competition default.
 */
const STORE_CHOSEN_FIELDS = new Set([
  'cut_mode',
  'cut_value',
  'ref_policy',
  'de_mode',
  'de_video_policy',
  'use_single_pool_override',
])

describe('C1 — store-chosen defaults raise no BINDING error', () => {
  it.each(CATALOGUE.map((entry) => entry.id))(
    '%s: store defaults raise no attributable BINDING error',
    (id) => {
      useStore.setState(useStore.getInitialState(), true)
      useStore.getState().selectCompetitions([id])
      useStore.getState().updateCompetition(id, { fencer_count: VALID_FENCER_COUNT })

      const { config, competitions } = buildTournamentConfig(useStore.getState())
      const findings = validateConfig(config, competitions, ValidationMode.BINDING)
      const attributable = findings.filter(
        (finding) => finding.severity === BottleneckSeverity.ERROR && STORE_CHOSEN_FIELDS.has(finding.field),
      )

      expect(
        attributable,
        `${id}: ${attributable.length} store-attributable BINDING error(s) — ` +
          attributable.map((finding) => `${finding.rule ?? '(no rule)'} [${finding.field}]: ${finding.message}`).join('; '),
      ).toEqual([])
    },
  )
})

const TEAM_IDS = CATALOGUE.filter((entry) => entry.event_type === EventType.TEAM).map((entry) => entry.id)

/**
 * The first template that carries this team id, for exercising the
 * `applyTemplate` route in C2. Which template is picked does not matter —
 * `applyTemplate` reaches the same `defaultConfigForId` every route reaches
 * (data-model.md "The three creation routes") — only that one exists.
 */
function templateContaining(id: string): string {
  const name = Object.entries(TEMPLATES).find(([, ids]) => ids.includes(id))?.[0]
  if (!name) {
    throw new Error(`C2: no template contains team id ${id} — the applyTemplate route has nothing to exercise it`)
  }
  return name
}

describe('C2 — the team default is all-advance, in every creation route', () => {
  it.each(TEAM_IDS)('%s: selectCompetitions default is all-advance', (id) => {
    useStore.setState(useStore.getInitialState(), true)
    useStore.getState().selectCompetitions([id])

    const config = useStore.getState().selectedCompetitions[id]
    expect(config.cut_mode, `${id} via selectCompetitions: cut_mode`).toBe(CutMode.DISABLED)
    expect(config.cut_value, `${id} via selectCompetitions: cut_value`).toBe(100)
  })

  it.each(TEAM_IDS)('%s: addCompetition default is all-advance', (id) => {
    useStore.setState(useStore.getInitialState(), true)
    useStore.getState().addCompetition(id)

    const config = useStore.getState().selectedCompetitions[id]
    expect(config.cut_mode, `${id} via addCompetition: cut_mode`).toBe(CutMode.DISABLED)
    expect(config.cut_value, `${id} via addCompetition: cut_value`).toBe(100)
  })

  it.each(TEAM_IDS)('%s: applyTemplate default is all-advance', (id) => {
    useStore.setState(useStore.getInitialState(), true)
    useStore.getState().applyTemplate(templateContaining(id))

    const config = useStore.getState().selectedCompetitions[id]
    expect(config.cut_mode, `${id} via applyTemplate: cut_mode`).toBe(CutMode.DISABLED)
    expect(config.cut_value, `${id} via applyTemplate: cut_value`).toBe(100)
  })
})

const INDIVIDUAL_IDS = CATALOGUE.filter((entry) => entry.event_type === EventType.INDIVIDUAL).map((entry) => entry.id)

describe('C3 — individual defaults are unchanged, value for value', () => {
  it.each(INDIVIDUAL_IDS)('%s: derived cut matches DEFAULT_CUT_BY_CATEGORY[category]', (id) => {
    useStore.setState(useStore.getInitialState(), true)
    useStore.getState().selectCompetitions([id])

    const config = useStore.getState().selectedCompetitions[id]
    const entry = findCompetition(id)
    if (!entry) throw new Error(`${id}: not found in CATALOGUE`)
    const expected = DEFAULT_CUT_BY_CATEGORY[entry.category]

    expect(config.cut_mode, `${id}: cut_mode`).toBe(expected.mode)
    expect(config.cut_value, `${id}: cut_value`).toBe(expected.value)
  })
})
