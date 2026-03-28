import { useStore } from '../../store/store.ts'
import { CATALOGUE } from '../../engine/catalogue.ts'
import type { CatalogueEntry } from '../../engine/types.ts'
import { Category, EventType, Gender, Weapon } from '../../engine/types.ts'
import { competitionLabel, CATEGORY_DISPLAY, GENDER_DISPLAY, WEAPON_DISPLAY } from '../competitionLabels.ts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { RotateCcw } from 'lucide-react'

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
  const selectCompetitions = useStore((s) => s.selectCompetitions)

  const selectedIds = new Set(Object.keys(selectedCompetitions))

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
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-lg">Competition Selection</CardTitle>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => selectCompetitions([])}
                aria-label="Clear Selections"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Clear Selections</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
          {GROUPS.map((group) => {
            const groupKey = `${group.gender}-${group.weapon}`
            const selected = countSelected(group)
            const visibleRows = group.categories.filter(
              (row) => row.individual || row.team,
            )

            return (
              <div key={groupKey} className="rounded-md border">
                <div className="flex items-center justify-between rounded-t-md bg-muted px-2 py-1 text-xs font-semibold uppercase tracking-wide text-card-foreground">
                  <span>{group.label}</span>
                  {selected > 0 && (
                    <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                      {selected}
                    </Badge>
                  )}
                </div>

                <div className="space-y-px px-1.5 py-1">
                  {visibleRows.map((row) => {
                      const value: string[] = []
                      if (row.individual && selectedIds.has(row.individual.id)) value.push(row.individual.id)
                      if (row.team && selectedIds.has(row.team.id)) value.push(row.team.id)

                      return (
                        <div
                          key={row.category}
                          className="flex items-center gap-1.5 py-px text-xs"
                        >
                          <span className="w-14 shrink-0 text-foreground">{row.label}</span>
                          <ToggleGroup
                            type="multiple"
                            variant="outline"
                            size="sm"
                            value={value}
                            onValueChange={(next: string[]) => {
                              const nextSet = new Set(next)
                              // Sync individual toggle
                              if (row.individual) {
                                if (nextSet.has(row.individual.id) && !selectedIds.has(row.individual.id)) {
                                  addCompetition(row.individual.id)
                                } else if (!nextSet.has(row.individual.id) && selectedIds.has(row.individual.id)) {
                                  removeCompetition(row.individual.id)
                                }
                              }
                              // Sync team toggle
                              if (row.team) {
                                if (nextSet.has(row.team.id) && !selectedIds.has(row.team.id)) {
                                  addCompetition(row.team.id)
                                } else if (!nextSet.has(row.team.id) && selectedIds.has(row.team.id)) {
                                  removeCompetition(row.team.id)
                                }
                              }
                            }}
                          >
                            {row.individual && (
                              <ToggleGroupItem
                                value={row.individual.id}
                                aria-label={competitionLabel(row.individual)}
                                className="h-6 px-2 text-[11px]"
                              >
                                Individual
                              </ToggleGroupItem>
                            )}
                            {row.team && (
                              <ToggleGroupItem
                                value={row.team.id}
                                aria-label={competitionLabel(row.team)}
                                className="h-6 px-2 text-[11px]"
                              >
                                Team
                              </ToggleGroupItem>
                            )}
                          </ToggleGroup>
                        </div>
                      )
                    })}
                  </div>
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
