import { useStore } from '../../store/store.ts'
import { CATALOGUE } from '../../engine/catalogue.ts'
import type { CatalogueEntry } from '../../engine/types.ts'
import { Category, EventType, Gender, Weapon } from '../../engine/types.ts'
import { competitionLabel, CATEGORY_DISPLAY, GENDER_DISPLAY, WEAPON_DISPLAY } from '../competitionLabels.ts'

// ──────────────────────────────────────────────
// Catalogue grouping
// ──────────────────────────────────────────────

interface WeaponGenderGroup {
  gender: Gender
  weapon: Weapon
  label: string
  categories: CategoryRow[]
}

interface CategoryRow {
  category: Category
  label: string
  individual: CatalogueEntry | undefined
  team: CatalogueEntry | undefined
}

const CATEGORY_ORDER: Category[] = [
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

// Pre-index catalogue by composite key for O(1) lookup
const CATALOGUE_INDEX = new Map<string, CatalogueEntry>()
for (const entry of CATALOGUE) {
  CATALOGUE_INDEX.set(
    `${entry.gender}-${entry.weapon}-${entry.category}-${entry.event_type}`,
    entry,
  )
}

function lookup(
  gender: Gender,
  weapon: Weapon,
  category: Category,
  eventType: EventType,
): CatalogueEntry | undefined {
  return CATALOGUE_INDEX.get(`${gender}-${weapon}-${category}-${eventType}`)
}

// Group order: Women first, then Men; within each gender: Foil, Epee, Sabre
const GROUP_ORDER: Array<{ gender: Gender; weapon: Weapon }> = [
  { gender: Gender.WOMEN, weapon: Weapon.FOIL },
  { gender: Gender.WOMEN, weapon: Weapon.EPEE },
  { gender: Gender.WOMEN, weapon: Weapon.SABRE },
  { gender: Gender.MEN, weapon: Weapon.FOIL },
  { gender: Gender.MEN, weapon: Weapon.EPEE },
  { gender: Gender.MEN, weapon: Weapon.SABRE },
]

const GROUPS: WeaponGenderGroup[] = GROUP_ORDER.map(({ gender, weapon }) => ({
  gender,
  weapon,
  label: `${GENDER_DISPLAY[gender]} ${WEAPON_DISPLAY[weapon]}`,
  categories: CATEGORY_ORDER.map((category) => ({
    category,
    label: CATEGORY_DISPLAY[category],
    individual: lookup(gender, weapon, category, EventType.INDIVIDUAL),
    team: lookup(gender, weapon, category, EventType.TEAM),
  })),
}))

// ──────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────

export function CompetitionMatrix() {
  const selectedCompetitions = useStore((s) => s.selectedCompetitions)
  const addCompetition = useStore((s) => s.addCompetition)
  const removeCompetition = useStore((s) => s.removeCompetition)

  const selectedIds = new Set(Object.keys(selectedCompetitions))

  function toggle(id: string, checked: boolean) {
    if (checked) {
      addCompetition(id)
    } else {
      removeCompetition(id)
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-card p-5 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-header">Competition Selection</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {GROUPS.map((group) => (
          <div key={`${group.gender}-${group.weapon}`} className="rounded-md border border-slate-200 p-3">
            <h3 className="mb-2 text-sm font-semibold text-header">{group.label}</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted">
                  <th className="pb-1 text-left font-medium">Category</th>
                  <th className="pb-1 text-center font-medium">Ind</th>
                  <th className="pb-1 text-center font-medium">Team</th>
                </tr>
              </thead>
              <tbody>
                {group.categories.map((row) => (
                  <tr key={row.category} className="even:bg-slate-50">
                    <td className="py-0.5 text-body">{row.label}</td>
                    <td className="py-0.5 text-center">
                      {row.individual && (
                        <input
                          type="checkbox"
                          checked={selectedIds.has(row.individual.id)}
                          onChange={(e) => toggle(row.individual!.id, e.target.checked)}
                          aria-label={competitionLabel(row.individual)}
                          className="accent-accent"
                        />
                      )}
                    </td>
                    <td className="py-0.5 text-center">
                      {row.team && (
                        <input
                          type="checkbox"
                          checked={selectedIds.has(row.team.id)}
                          onChange={(e) => toggle(row.team!.id, e.target.checked)}
                          aria-label={competitionLabel(row.team)}
                          className="accent-accent"
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted">
        {selectedIds.size} competition{selectedIds.size !== 1 ? 's' : ''} selected
      </p>
    </div>
  )
}
