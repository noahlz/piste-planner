import type { CatalogueEntry, VetAgeGroup } from './types.ts'
import { Category, EventType, Gender, Weapon, VetAgeGroup as VetAgeGroupEnum } from './types.ts'
import { NAC_FENCER_DEFAULTS, REGIONAL_FENCER_DEFAULTS } from './constants.ts'

// ──────────────────────────────────────────────
// ID generation helpers
// ──────────────────────────────────────────────

const CATEGORY_PREFIX: Record<Category, string> = {
  [Category.Y8]: 'Y8',
  [Category.Y10]: 'Y10',
  [Category.Y12]: 'Y12',
  [Category.Y14]: 'Y14',
  [Category.CADET]: 'CDT',
  [Category.JUNIOR]: 'JR',
  [Category.VETERAN]: 'VET',
  [Category.DIV1]: 'D1',
  [Category.DIV1A]: 'D1A',
  [Category.DIV2]: 'D2',
  [Category.DIV3]: 'D3',
}

const GENDER_CODE: Record<Gender, string> = {
  [Gender.MEN]: 'M',
  [Gender.WOMEN]: 'W',
}

const EVENT_TYPE_CODE: Record<EventType, string> = {
  [EventType.INDIVIDUAL]: 'IND',
  [EventType.TEAM]: 'TEAM',
}

const VET_AGE_GROUP_CODE: Record<VetAgeGroup, string> = {
  [VetAgeGroupEnum.VET40]: 'V40',
  [VetAgeGroupEnum.VET50]: 'V50',
  [VetAgeGroupEnum.VET60]: 'V60',
  [VetAgeGroupEnum.VET70]: 'V70',
  [VetAgeGroupEnum.VET80]: 'V80',
  [VetAgeGroupEnum.VET_COMBINED]: 'VCMB',
}

function makeId(
  category: Category,
  gender: Gender,
  weapon: Weapon,
  eventType: EventType,
  vetAgeGroup: VetAgeGroup | null = null,
): string {
  const base = `${CATEGORY_PREFIX[category]}-${GENDER_CODE[gender]}-${weapon}-${EVENT_TYPE_CODE[eventType]}`
  if (vetAgeGroup) return `${base}-${VET_AGE_GROUP_CODE[vetAgeGroup]}`
  return base
}

function makeEntry(
  category: Category,
  gender: Gender,
  weapon: Weapon,
  eventType: EventType,
  vetAgeGroup: VetAgeGroup | null = null,
): CatalogueEntry {
  return {
    id: makeId(category, gender, weapon, eventType, vetAgeGroup),
    gender,
    category,
    weapon,
    event_type: eventType,
    vet_age_group: vetAgeGroup,
  }
}

// ──────────────────────────────────────────────
// Catalogue generation
// ──────────────────────────────────────────────

// Veteran is excluded — expanded separately with per-age-group entries
const INDIVIDUAL_CATEGORIES: Category[] = [
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

// Veteran is excluded — generated as a single team entry (no age group split for teams)
const TEAM_CATEGORIES: Category[] = [
  Category.CADET,
  Category.JUNIOR,
  Category.DIV1,
]

const ALL_VET_AGE_GROUPS: VetAgeGroup[] = [
  VetAgeGroupEnum.VET40,
  VetAgeGroupEnum.VET50,
  VetAgeGroupEnum.VET60,
  VetAgeGroupEnum.VET70,
  VetAgeGroupEnum.VET80,
  VetAgeGroupEnum.VET_COMBINED,
]

export { ALL_VET_AGE_GROUPS }

const ALL_WEAPONS: Weapon[] = [Weapon.FOIL, Weapon.EPEE, Weapon.SABRE]
const ALL_GENDERS: Gender[] = [Gender.MEN, Gender.WOMEN]

function buildCatalogue(): CatalogueEntry[] {
  const entries: CatalogueEntry[] = []

  // 60 non-veteran individual events: 10 categories × 3 weapons × 2 genders
  for (const category of INDIVIDUAL_CATEGORIES) {
    for (const weapon of ALL_WEAPONS) {
      for (const gender of ALL_GENDERS) {
        entries.push(makeEntry(category, gender, weapon, EventType.INDIVIDUAL))
      }
    }
  }

  // 36 veteran individual events: 6 age groups × 3 weapons × 2 genders
  for (const vetAgeGroup of ALL_VET_AGE_GROUPS) {
    for (const weapon of ALL_WEAPONS) {
      for (const gender of ALL_GENDERS) {
        entries.push(makeEntry(Category.VETERAN, gender, weapon, EventType.INDIVIDUAL, vetAgeGroup))
      }
    }
  }

  // 18 non-veteran team events: 3 categories × 3 weapons × 2 genders
  for (const category of TEAM_CATEGORIES) {
    for (const weapon of ALL_WEAPONS) {
      for (const gender of ALL_GENDERS) {
        entries.push(makeEntry(category, gender, weapon, EventType.TEAM))
      }
    }
  }

  // 6 veteran team events: 1 × 3 weapons × 2 genders (no age group split for teams)
  for (const weapon of ALL_WEAPONS) {
    for (const gender of ALL_GENDERS) {
      entries.push(makeEntry(Category.VETERAN, gender, weapon, EventType.TEAM))
    }
  }

  return entries
}

export const CATALOGUE: CatalogueEntry[] = buildCatalogue()

// ──────────────────────────────────────────────
// Lookup helper
// ──────────────────────────────────────────────

const CATALOGUE_MAP = new Map(CATALOGUE.map((e) => [e.id, e]))

export function findCompetition(id: string): CatalogueEntry | undefined {
  return CATALOGUE_MAP.get(id)
}

// ──────────────────────────────────────────────
// Template IDs — convenience sets of catalogue IDs grouped by common tournament formats
// (Design spec Section 5)
// ──────────────────────────────────────────────

function ids(categories: Category[], eventTypes: EventType[]): string[] {
  const result: string[] = []
  for (const category of categories) {
    for (const weapon of ALL_WEAPONS) {
      for (const gender of ALL_GENDERS) {
        for (const eventType of eventTypes) {
          // Veteran individual events expand to all age groups
          if (category === Category.VETERAN && eventType === EventType.INDIVIDUAL) {
            for (const vag of ALL_VET_AGE_GROUPS) {
              result.push(makeId(category, gender, weapon, eventType, vag))
            }
          } else {
            result.push(makeId(category, gender, weapon, eventType))
          }
        }
      }
    }
  }
  return result
}

// ROC veterans only have Combined (no individual age group breakdown)
function vetCombinedIds(): string[] {
  const result: string[] = []
  for (const weapon of ALL_WEAPONS) {
    for (const gender of ALL_GENDERS) {
      result.push(makeId(Category.VETERAN, gender, weapon, EventType.INDIVIDUAL, VetAgeGroupEnum.VET_COMBINED))
    }
  }
  return result
}

export const TEMPLATES: Record<string, string[]> = {
  // 4 categories × 3 weapons × 2 genders × IND = 24
  'NAC Youth': ids([Category.Y10, Category.Y12, Category.Y14, Category.CADET], [
    EventType.INDIVIDUAL,
  ]),

  // 2 categories × 3 weapons × 2 genders × (IND + TEAM) = 24
  'NAC Cadet/Junior': ids([Category.CADET, Category.JUNIOR], [
    EventType.INDIVIDUAL,
    EventType.TEAM,
  ]),

  // 2 categories × 3 weapons × 2 genders × (IND + TEAM) = 24
  'NAC Div1/Junior': ids([Category.DIV1, Category.JUNIOR], [
    EventType.INDIVIDUAL,
    EventType.TEAM,
  ]),

  // 3 categories × 3 weapons × 2 genders × (IND + TEAM) = 36
  'NAC Vet/Div1/Junior': ids([Category.VETERAN, Category.DIV1, Category.JUNIOR], [
    EventType.INDIVIDUAL,
    EventType.TEAM,
  ]),

  // ROC veterans are Combined only (no individual age groups)
  'ROC Div1A/Vet': [
    ...ids([Category.DIV1A], [EventType.INDIVIDUAL]),
    ...vetCombinedIds(),
  ],

  'ROC Div1A/Div2/Vet': [
    ...ids([Category.DIV1A, Category.DIV2], [EventType.INDIVIDUAL]),
    ...vetCombinedIds(),
  ],

  // 7 categories × 3 weapons × 2 genders × IND = 42
  'ROC Mega': ids(
    [
      Category.Y10,
      Category.Y12,
      Category.Y14,
      Category.CADET,
      Category.JUNIOR,
      Category.DIV1A,
      Category.DIV2,
    ],
    [EventType.INDIVIDUAL],
  ),

  // 3 categories × 3 weapons × 2 genders = 18 (individual only per spec)
  'RYC Weekend': ids([Category.Y10, Category.Y12, Category.Y14], [EventType.INDIVIDUAL]),

  // 2 categories × 3 weapons × 2 genders = 12 (individual only per spec)
  'RJCC Weekend': ids([Category.CADET, Category.JUNIOR], [EventType.INDIVIDUAL]),

  // Junior Olympics: Cadet IND + Junior IND + Junior TEAM = (2×IND + 1×TEAM) × 3 weapons × 2 genders = 18
  'Junior Olympics': [
    ...ids([Category.CADET, Category.JUNIOR], [EventType.INDIVIDUAL]),
    ...ids([Category.JUNIOR], [EventType.TEAM]),
  ],
}

// ──────────────────────────────────────────────
// Template → fencer count defaults mapping.
// NAC/JO templates use NAC-scale counts; regional templates use smaller counts.
// ──────────────────────────────────────────────

type FencerDefaultTable = Partial<Record<`${Category}:${EventType}`, number>>

export const TEMPLATE_FENCER_DEFAULTS: Record<string, FencerDefaultTable> = {
  'NAC Youth': NAC_FENCER_DEFAULTS,
  'NAC Cadet/Junior': NAC_FENCER_DEFAULTS,
  'NAC Div1/Junior': NAC_FENCER_DEFAULTS,
  'NAC Vet/Div1/Junior': NAC_FENCER_DEFAULTS,
  'Junior Olympics': NAC_FENCER_DEFAULTS,
  'ROC Div1A/Vet': REGIONAL_FENCER_DEFAULTS,
  'ROC Div1A/Div2/Vet': REGIONAL_FENCER_DEFAULTS,
  'ROC Mega': REGIONAL_FENCER_DEFAULTS,
  'RYC Weekend': REGIONAL_FENCER_DEFAULTS,
  'RJCC Weekend': REGIONAL_FENCER_DEFAULTS,
}
