import { describe, it, expect } from 'vitest'
import { CATALOGUE, TEMPLATES, findCompetition } from '../../src/engine/catalogue.ts'
import { Category, EventType, Gender, VetAgeGroup, Weapon } from '../../src/engine/types.ts'
import type { CatalogueEntry } from '../../src/engine/types.ts'

// Non-veteran individual categories (each has exactly 6 entries: 3 weapons × 2 genders)
const NON_VET_INDIVIDUAL_CATEGORIES: Category[] = [
  Category.Y8,
  Category.Y10,
  Category.Y12,
  Category.Y14,
  Category.CADET,
  Category.JUNIOR,
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
  // VET: 6 age groups × IND + 1 TEAM = 7 event types; D1 + JR: 1 IND + 1 TEAM each
  // Total: (6+1+1+1+1+1) × 3 weapons × 2 genders = 66
  ['NAC Vet/Div1/Junior', 66],
  // D1A IND (6) + VET Combined IND (6) = 12 (ROC only has Vet Combined)
  ['ROC Div1A/Vet', 12],
  // D1A IND (6) + D2 IND (6) + VET Combined IND (6) = 18
  ['ROC Div1A/Div2/Vet', 18],
  ['ROC Mega', 42],
  ['RYC Weekend', 18],
  ['RJCC Weekend', 12],
  ['Junior Olympics', 18],
]

describe('CATALOGUE', () => {
  it('has exactly 120 entries', () => {
    expect(CATALOGUE).toHaveLength(120)
  })

  it('has no duplicate IDs', () => {
    const ids = CATALOGUE.map((e: CatalogueEntry) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every entry has all required fields populated', () => {
    for (const e of CATALOGUE) {
      expect(e.id).toBeTruthy()
      expect(Object.values(Gender)).toContain(e.gender)
      expect(Object.values(Category)).toContain(e.category)
      expect(Object.values(Weapon)).toContain(e.weapon)
      expect(e.event_type).toBeTruthy()
    }
  })

  it('contains all 96 individual events (10 non-vet categories × 6 + 6 vet age groups × 6)', () => {
    const individuals = CATALOGUE.filter(
      (e: CatalogueEntry) => e.event_type === EventType.INDIVIDUAL,
    )
    expect(individuals).toHaveLength(96)
  })

  it('contains all 24 team events (3 non-vet categories × 6 + 1 vet category × 6)', () => {
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

  it('covers all non-veteran individual categories with 6 events each (3 weapons × 2 genders)', () => {
    for (const cat of NON_VET_INDIVIDUAL_CATEGORIES) {
      const entries = CATALOGUE.filter(
        (e: CatalogueEntry) => e.category === cat && e.event_type === EventType.INDIVIDUAL,
      )
      expect(entries).toHaveLength(6)
    }
  })

  it('veteran individual entries: 36 total (6 age groups × 3 weapons × 2 genders)', () => {
    const vetInd = CATALOGUE.filter(
      (e: CatalogueEntry) =>
        e.category === Category.VETERAN && e.event_type === EventType.INDIVIDUAL,
    )
    expect(vetInd).toHaveLength(36)
  })

  it('veteran individual entries all have a non-null vet_age_group', () => {
    const vetInd = CATALOGUE.filter(
      (e: CatalogueEntry) =>
        e.category === Category.VETERAN && e.event_type === EventType.INDIVIDUAL,
    )
    for (const e of vetInd) {
      expect(e.vet_age_group).not.toBeNull()
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
      [
        'VET-M-FOIL-IND-V40',
        {
          id: 'VET-M-FOIL-IND-V40',
          gender: Gender.MEN,
          category: Category.VETERAN,
          weapon: Weapon.FOIL,
          event_type: EventType.INDIVIDUAL,
          vet_age_group: VetAgeGroup.VET40,
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

  it('uses correct ID format for veteran individual events (age group suffix)', () => {
    const expected = [
      'VET-M-FOIL-IND-V40',
      'VET-W-EPEE-IND-V50',
      'VET-M-SABRE-IND-V60',
      'VET-W-FOIL-IND-V70',
      'VET-M-EPEE-IND-V80',
      'VET-W-SABRE-IND-VCMB',
    ]
    for (const id of expected) {
      expect(findCompetition(id), `Missing veteran individual: ${id}`).toBeDefined()
    }
  })

  it('old veteran individual ID format (no age group suffix) is not in catalogue', () => {
    expect(findCompetition('VET-M-FOIL-IND')).toBeUndefined()
    expect(findCompetition('VET-W-EPEE-IND')).toBeUndefined()
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

  it('returns the full entry for a veteran individual ID (with age group suffix)', () => {
    expect(findCompetition('VET-M-FOIL-IND-V40')).toEqual({
      id: 'VET-M-FOIL-IND-V40',
      gender: Gender.MEN,
      category: Category.VETERAN,
      weapon: Weapon.FOIL,
      event_type: EventType.INDIVIDUAL,
      vet_age_group: VetAgeGroup.VET40,
    })
  })

  it('returns undefined for an unknown ID', () => {
    expect(findCompetition('INVALID-ID')).toBeUndefined()
  })

  it('returns undefined for old veteran individual ID format (no age group suffix)', () => {
    expect(findCompetition('VET-M-FOIL-IND')).toBeUndefined()
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
