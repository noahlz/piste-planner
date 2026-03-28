import { useState } from 'react'
import { useStore } from '../../store/store.ts'
import { CATALOGUE } from '../../engine/catalogue.ts'
import type { CatalogueEntry } from '../../engine/types.ts'
import { Category, EventType, Gender, Weapon } from '../../engine/types.ts'
import { competitionLabel, CATEGORY_DISPLAY, GENDER_DISPLAY, WEAPON_DISPLAY } from '../competitionLabels.ts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Toggle } from '@/components/ui/toggle'
import { Badge } from '@/components/ui/badge'
import { ChevronDown, ChevronRight } from 'lucide-react'

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
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const selectedIds = new Set(Object.keys(selectedCompetitions))

  function toggle(id: string) {
    if (selectedIds.has(id)) {
      removeCompetition(id)
    } else {
      addCompetition(id)
    }
  }

  function toggleCollapsed(groupKey: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(groupKey)) {
        next.delete(groupKey)
      } else {
        next.add(groupKey)
      }
      return next
    })
  }

  function countSelected(group: WeaponGenderGroup): number {
    let count = 0
    for (const row of group.categories) {
      if (row.individual && selectedIds.has(row.individual.id)) count++
      if (row.team && selectedIds.has(row.team.id)) count++
    }
    return count
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Competition Selection</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {GROUPS.map((group) => {
            const groupKey = `${group.gender}-${group.weapon}`
            const isCollapsed = collapsed.has(groupKey)
            const selected = countSelected(group)
            // Skip categories where neither individual nor team exists
            const visibleRows = group.categories.filter(
              (row) => row.individual || row.team,
            )

            return (
              <div key={groupKey} className="rounded-md border p-2">
                <button
                  type="button"
                  onClick={() => toggleCollapsed(groupKey)}
                  className="flex w-full items-center justify-between text-sm font-semibold text-card-foreground"
                >
                  <span className="flex items-center gap-1.5">
                    {isCollapsed ? (
                      <ChevronRight className="size-4" />
                    ) : (
                      <ChevronDown className="size-4" />
                    )}
                    {group.label}
                  </span>
                  {selected > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {selected}
                    </Badge>
                  )}
                </button>

                {!isCollapsed && (
                  <div className="mt-2 space-y-1">
                    {visibleRows.map((row) => (
                      <div
                        key={row.category}
                        className="flex items-center justify-between text-sm"
                      >
                        <span className="text-card-foreground">{row.label}</span>
                        <div className="flex gap-1">
                          {row.individual && (
                            <Toggle
                              variant="outline"
                              pressed={selectedIds.has(row.individual.id)}
                              onPressedChange={() => toggle(row.individual!.id)}
                              aria-label={competitionLabel(row.individual)}
                              className="h-6 w-7 px-0 text-xs"
                            >
                              I
                            </Toggle>
                          )}
                          {row.team && (
                            <Toggle
                              variant="outline"
                              pressed={selectedIds.has(row.team.id)}
                              onPressedChange={() => toggle(row.team!.id)}
                              aria-label={competitionLabel(row.team)}
                              className="h-6 w-7 px-0 text-xs"
                            >
                              T
                            </Toggle>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {selectedIds.size} competition{selectedIds.size !== 1 ? 's' : ''} selected
        </p>
      </CardContent>
    </Card>
  )
}
