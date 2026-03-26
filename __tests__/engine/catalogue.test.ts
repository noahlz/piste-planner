import { describe, it, expect } from 'vitest'
import { CATALOGUE, TEMPLATES, findCompetition } from '../../src/engine/catalogue.ts'
import { Category, EventType, Gender, Weapon } from '../../src/engine/types.ts'
import type { CatalogueEntry } from '../../src/engine/types.ts'

const CATALOGUE_CATEGORIES: Category[] = [
  Category.Y8,
  Category.Y10,
  Category.Y12,
  Category.Y14,
  Category.CADET,
  Category.JUNIOR,
  Category.VETERAN,
  Category.DIV1,
  Category.DIV1A,
  Category.DIV2,
  Category.DIV3,
]

const TEAM_CATEGORIES: Category[] = [
  Category.CADET,
  Category.JUNIOR,
  Category.VETERAN,
  Category.DIV1,
]

const NO_TEAM_CATEGORIES: Category[] = [
  Category.Y8,
  Category.Y10,
  Category.Y12,
  Category.Y14,
  Category.DIV1A,
  Category.DIV2,
  Category.DIV3,
]

const EXPECTED_TEMPLATE_SIZES: [string, number][] = [
  ['NAC Youth', 24],
  ['NAC Cadet/Junior', 24],
  ['NAC Div1/Junior', 24],
  ['NAC Vet/Div1/Junior', 36],
  ['ROC Div1A/Vet', 12],
  ['ROC Div1A/Div2/Vet', 18],
  ['ROC Mega', 42],
  ['RYC Weekend', 18],
  ['RJCC Weekend', 12],
  ['Blank', 0],
]

describe('CATALOGUE', () => {
  it('has exactly 90 entries', () => {
    expect(CATALOGUE).toHaveLength(90)
  })

  it('has no duplicate IDs', () => {
    const ids = CATALOGUE.map((e: CatalogueEntry) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every entry has all required fields populated', () => {
    for (const e of CATALOGUE) {
      expect(e.id).toBeTruthy()
      expect(e.gender).toBeTruthy()
      expect(e.category).toBeTruthy()
      expect(e.weapon).toBeTruthy()
      expect(e.event_type).toBeTruthy()
    }
  })

  it('contains all 66 individual events (11 categories × 3 weapons × 2 genders)', () => {
    const individuals = CATALOGUE.filter(
      (e: CatalogueEntry) => e.event_type === EventType.INDIVIDUAL,
    )
    expect(individuals).toHaveLength(66)
  })

  it('contains all 24 team events (4 categories × 3 weapons × 2 genders)', () => {
    const teams = CATALOGUE.filter((e: CatalogueEntry) => e.event_type === EventType.TEAM)
    expect(teams).toHaveLength(24)
  })

  it('has no team events for Y8, Y10, Y12, Y14, DIV1A, DIV2, DIV3', () => {
    const badTeams = CATALOGUE.filter(
      (e: CatalogueEntry) =>
        e.event_type === EventType.TEAM && NO_TEAM_CATEGORIES.includes(e.category),
    )
    expect(badTeams).toHaveLength(0)
  })

  it('has Y8 individual events but no Y8 team events', () => {
    const y8Ind = CATALOGUE.filter(
      (e: CatalogueEntry) =>
        e.category === Category.Y8 && e.event_type === EventType.INDIVIDUAL,
    )
    const y8Team = CATALOGUE.filter(
      (e: CatalogueEntry) => e.category === Category.Y8 && e.event_type === EventType.TEAM,
    )
    expect(y8Ind).toHaveLength(6)
    expect(y8Team).toHaveLength(0)
  })

  it('covers all expected individual categories with 6 events each', () => {
    for (const cat of CATALOGUE_CATEGORIES) {
      const entries = CATALOGUE.filter(
        (e: CatalogueEntry) => e.category === cat && e.event_type === EventType.INDIVIDUAL,
      )
      expect(entries).toHaveLength(6)
    }
  })

  it('covers all expected team categories with 6 events each', () => {
    for (const cat of TEAM_CATEGORIES) {
      const entries = CATALOGUE.filter(
        (e: CatalogueEntry) => e.category === cat && e.event_type === EventType.TEAM,
      )
      expect(entries).toHaveLength(6)
    }
  })

  it('spot-check: entries have correct fields behind their IDs', () => {
    const checks: [string, CatalogueEntry][] = [
      [
        'Y10-M-FOIL-IND',
        {
          id: 'Y10-M-FOIL-IND',
          gender: Gender.MEN,
          category: Category.Y10,
          weapon: Weapon.FOIL,
          event_type: EventType.INDIVIDUAL,
          vet_age_group: null,
        },
      ],
      [
        'CDT-W-EPEE-TEAM',
        {
          id: 'CDT-W-EPEE-TEAM',
          gender: Gender.WOMEN,
          category: Category.CADET,
          weapon: Weapon.EPEE,
          event_type: EventType.TEAM,
          vet_age_group: null,
        },
      ],
      [
        'D1-M-SABRE-IND',
        {
          id: 'D1-M-SABRE-IND',
          gender: Gender.MEN,
          category: Category.DIV1,
          weapon: Weapon.SABRE,
          event_type: EventType.INDIVIDUAL,
          vet_age_group: null,
        },
      ],
      [
        'VET-W-FOIL-TEAM',
        {
          id: 'VET-W-FOIL-TEAM',
          gender: Gender.WOMEN,
          category: Category.VETERAN,
          weapon: Weapon.FOIL,
          event_type: EventType.TEAM,
          vet_age_group: null,
        },
      ],
    ]
    for (const [id, expected] of checks) {
      const entry = findCompetition(id)
      expect(entry, `Missing catalogue entry: ${id}`).toEqual(expected)
    }
  })

  it('uses correct ID format for individual events', () => {
    const expected = [
      'Y8-M-FOIL-IND',
      'Y10-W-EPEE-IND',
      'CDT-M-SABRE-IND',
      'JR-M-EPEE-IND',
      'D1A-W-FOIL-IND',
      'D2-M-EPEE-IND',
      'D3-W-SABRE-IND',
    ]
    for (const id of expected) {
      expect(findCompetition(id), `Missing individual: ${id}`).toBeDefined()
    }
  })

  it('uses correct ID format for team events', () => {
    const expected = ['CDT-W-EPEE-TEAM', 'JR-M-FOIL-TEAM', 'VET-W-SABRE-TEAM', 'D1-M-EPEE-TEAM']
    for (const id of expected) {
      expect(findCompetition(id), `Missing team: ${id}`).toBeDefined()
    }
  })
})

describe('findCompetition', () => {
  it('returns the full entry for a known individual ID', () => {
    expect(findCompetition('Y10-M-FOIL-IND')).toEqual({
      id: 'Y10-M-FOIL-IND',
      gender: Gender.MEN,
      category: Category.Y10,
      weapon: Weapon.FOIL,
      event_type: EventType.INDIVIDUAL,
      vet_age_group: null,
    })
  })

  it('returns the full entry for a known team ID', () => {
    expect(findCompetition('CDT-W-EPEE-TEAM')).toEqual({
      id: 'CDT-W-EPEE-TEAM',
      gender: Gender.WOMEN,
      category: Category.CADET,
      weapon: Weapon.EPEE,
      event_type: EventType.TEAM,
      vet_age_group: null,
    })
  })

  it('returns undefined for an unknown ID', () => {
    expect(findCompetition('INVALID-ID')).toBeUndefined()
  })
})

describe('TEMPLATES', () => {
  it('contains exactly the expected template names', () => {
    expect(Object.keys(TEMPLATES).sort()).toEqual(
      EXPECTED_TEMPLATE_SIZES.map(([name]) => name).sort(),
    )
  })

  it.each(EXPECTED_TEMPLATE_SIZES)('template "%s" has %i events', (name, size) => {
    expect(TEMPLATES[name]).toHaveLength(size)
  })

  it('all template IDs reference valid catalogue entries', () => {
    for (const [templateName, ids] of Object.entries(TEMPLATES) as [string, string[]][]) {
      for (const id of ids) {
        expect(
          findCompetition(id),
          `Template "${templateName}" references unknown ID "${id}"`,
        ).toBeDefined()
      }
    }
  })

  it('has no duplicate IDs within any template', () => {
    for (const [templateName, ids] of Object.entries(TEMPLATES) as [string, string[]][]) {
      expect(new Set(ids).size, `Template "${templateName}" has duplicate IDs`).toBe(ids.length)
    }
  })

  it('NAC Youth includes Y10 but not DIV1', () => {
    const youth = TEMPLATES['NAC Youth']
    expect(youth).toContain('Y10-M-FOIL-IND')
    expect(youth).not.toContain('D1-M-FOIL-IND')
  })

  it('ROC Mega includes Y10–DIV2 individual but no team events', () => {
    const mega = TEMPLATES['ROC Mega']
    expect(mega).toContain('Y10-M-FOIL-IND')
    expect(mega).toContain('D1A-W-SABRE-IND')
    expect(mega).toContain('D2-M-EPEE-IND')
    expect(mega.some((id: string) => id.endsWith('-TEAM'))).toBe(false)
  })

  // Y8 is in the catalogue but excluded from all templates (non-standard for tournaments)
  it('Y8 is not included in any template', () => {
    for (const [, templateIds] of Object.entries(TEMPLATES) as [string, string[]][]) {
      expect(templateIds.some((id: string) => id.startsWith('Y8-'))).toBe(false)
    }
  })
})
