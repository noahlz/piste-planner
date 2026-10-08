import { describe, it, expect } from 'vitest'
import { useStore } from '../../src/store/store.ts'
import { buildTournamentConfig } from '../../src/store/buildConfig.ts'
import {
  TEMPLATES,
  TEMPLATE_HINTS,
  TEMPLATE_HINT_GENERIC,
  TEMPLATE_MIN_DAYS,
  templateHintSentence,
} from '../../src/engine/catalogue.ts'
import { buildConstraintGraph } from '../../src/engine/constraintGraph.ts'
import { assignDaysByColoring } from '../../src/engine/dayColoring.ts'
import { Category, EventType, TournamentType, VetAgeGroup } from '../../src/engine/types.ts'
import type { Competition } from '../../src/engine/types.ts'
import { chromaticNumber } from '../helpers/chromatic.ts'

// Pins the hand-written TEMPLATE_MIN_DAYS table (019 R1, R1a, decision 5) to the
// exact chromatic number of each template's hard same-day graph, built the way
// the app builds it: the store's template path, then `buildConstraintGraph`.

const NATIONAL_TYPES: readonly TournamentType[] = [TournamentType.NAC, TournamentType.SYC, TournamentType.SJCC]
const REGIONAL_TYPES: readonly TournamentType[] = [TournamentType.ROC, TournamentType.RYC, TournamentType.RJCC]
const TEMPLATE_NAMES = Object.keys(TEMPLATES)

// The age-banded Vet individual events of one gender and weapon run on one day
// (METHODOLOGY §Veteran Age-Group Co-Day Rule), so each such group needs one
// colour between them – one vertex. Vet Combined is not in the group.
const VET_BANDED: ReadonlySet<string> = new Set([
  VetAgeGroup.VET40,
  VetAgeGroup.VET50,
  VetAgeGroup.VET60,
  VetAgeGroup.VET70,
  VetAgeGroup.VET80,
])

function vertexOf(c: Competition): string {
  if (
    c.category === Category.VETERAN &&
    c.event_type === EventType.INDIVIDUAL &&
    c.vet_age_group !== null &&
    VET_BANDED.has(c.vet_age_group)
  ) {
    return `VET-BANDED-${c.gender}-${c.weapon}`
  }
  return c.id
}

function templateCompetitions(name: string, type: TournamentType): Competition[] {
  useStore.setState(useStore.getInitialState(), true)
  useStore.getState().setTournamentType(type)
  useStore.getState().applyTemplate(name)
  return buildTournamentConfig(useStore.getState()).competitions
}

/** The hard graph (weight Infinity edges) with each Vet co-day group contracted to one vertex. */
function contractedHardGraph(competitions: Competition[], type: TournamentType): Map<string, Set<string>> {
  const byId = new Map(competitions.map((c) => [c.id, c]))
  const adjacency = new Map<string, Set<string>>()
  for (const c of competitions) adjacency.set(vertexOf(c), new Set())
  for (const [id, edges] of buildConstraintGraph(competitions, type)) {
    for (const edge of edges) {
      if (edge.weight !== Infinity) continue
      const a = vertexOf(byId.get(id)!)
      const b = vertexOf(byId.get(edge.targetId)!)
      // A hard edge inside a co-day group would make the group unsatisfiable on
      // any number of days, and the contraction meaningless.
      if (a === b) throw new Error(`hard edge inside the co-day group ${a}: ${id} – ${edge.targetId}`)
      adjacency.get(a)!.add(b)
      adjacency.get(b)!.add(a)
    }
  }
  return adjacency
}

function hardChromaticNumber(name: string, type: TournamentType): number {
  return chromaticNumber(contractedHardGraph(templateCompetitions(name, type), type))
}

function tableDays(name: string, type: TournamentType): number {
  const row = TEMPLATE_MIN_DAYS[name]
  return REGIONAL_TYPES.includes(type) ? row.regional : row.national
}

describe('TEMPLATE_MIN_DAYS', () => {
  it('has a row for every template and no other', () => {
    expect(Object.keys(TEMPLATE_MIN_DAYS).sort()).toEqual([...TEMPLATE_NAMES].sort())
  })

  // No template's number changes under the contraction today, so this pins that
  // it runs: 66 events, of which 30 banded Vet individuals in 6 gender × weapon
  // groups fold to 6 vertices – 66 − 30 + 6 = 42.
  it('contracts NAC Vet/Div1/Junior’s banded Vet events to one vertex per gender and weapon', () => {
    const competitions = templateCompetitions('NAC Vet/Div1/Junior', TournamentType.NAC)

    expect(competitions).toHaveLength(66)
    expect(contractedHardGraph(competitions, TournamentType.NAC).size).toBe(42)
  })

  it.each(TEMPLATE_NAMES)('%s: national column at NAC, SYC and SJCC, regional at ROC, RYC and RJCC', (name) => {
    const measured: Record<string, number> = {}
    const expected: Record<string, number> = {}
    for (const type of [...NATIONAL_TYPES, ...REGIONAL_TYPES]) {
      measured[type] = hardChromaticNumber(name, type)
      expected[type] = tableDays(name, type)
    }
    expect(measured).toEqual(expected)
  })

  it.each(TEMPLATE_NAMES)('%s: day colouring at the table’s count breaks no hard pair (80 strips)', (name) => {    const broken: string[] = []
    for (const type of [...NATIONAL_TYPES, ...REGIONAL_TYPES]) {
      templateCompetitions(name, type)
      useStore.getState().setDays(tableDays(name, type))
      useStore.getState().setStrips(80)
      const { config, competitions } = buildTournamentConfig(useStore.getState())
      const graph = buildConstraintGraph(competitions, config.tournament_type)
      for (const v of assignDaysByColoring(graph, competitions, config).violations) {
        broken.push(`${type}: ${JSON.stringify(v)}`)
      }
    }
    expect(broken).toEqual([])
  })
})

// 019 R3, decision 9: the sentence naming the rule behind each template's minimum.
// A key that drifts from the template names would fall back to the generic
// sentence silently, so the table is pinned cell by cell.
describe('TEMPLATE_HINTS', () => {
  it('has no key that is not a template', () => {
    for (const key of Object.keys(TEMPLATE_HINTS)) expect(TEMPLATE_NAMES).toContain(key)
  })

  const CELLS = TEMPLATE_NAMES.flatMap((name) =>
    ([['national', TournamentType.NAC], ['regional', TournamentType.RYC]] as const).map(
      ([column, type]) => ({ name, column, type, minDays: TEMPLATE_MIN_DAYS[name][column] }),
    ),
  )

  it.each(CELLS)('$name on $column: a specific sentence exactly when the minimum is 3 or more', ({ name, type, minDays }) => {
    const generic = templateHintSentence(name, type) === TEMPLATE_HINT_GENERIC

    expect(generic).toBe(minDays < 3)
  })

  it.each([
    ['NAC Cadet/Junior', TournamentType.NAC, 'Cadet and Junior events of one weapon and gender'],
    ['NAC Div1/Junior', TournamentType.NAC, 'Div 1 and Junior events of one weapon and gender'],
    ['NAC Vet/Div1/Junior', TournamentType.NAC, 'Div 1 and Junior events of one weapon and gender'],
    ['NAC Vet/Div1/Junior', TournamentType.RYC, 'neither the Veteran Combined nor the Veteran team event'],
    ['Junior Olympics', TournamentType.NAC, 'Junior\'s individual and team events'],
  ])('%s on %s: names its own rule', (name, type, fragment) => {
    expect(templateHintSentence(name, type)).toContain(fragment)
  })
})
