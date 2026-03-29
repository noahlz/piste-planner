import { useState } from 'react'
import { useStore } from '../../store/store.ts'
import { CATALOGUE, ALL_VET_AGE_GROUPS, TEMPLATES } from '../../engine/catalogue.ts'
import type { CatalogueEntry } from '../../engine/types.ts'
import { Category, EventType, Gender, Weapon } from '../../engine/types.ts'
import { competitionLabel, categoryDisplay, vetAgeGroupDisplay, GENDER_DISPLAY, WEAPON_DISPLAY } from '../competitionLabels.ts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { RotateCcw, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

const TEMPLATE_NAMES = Object.keys(TEMPLATES)

// ──────────────────────────────────────────────
// Catalogue grouping
// ──────────────────────────────────────────────

// Veteran excluded — gets its own row with age group + team buttons
const INDIVIDUAL_CATEGORY_ORDER: Category[] = [
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

const TEAM_CATEGORY_ORDER: Category[] = [
  Category.CADET,
  Category.JUNIOR,
  Category.DIV1,
]

interface WeaponGenderGroup {
  gender: Gender
  weapon: Weapon
  label: string
  individualEntries: CatalogueEntry[]
  teamEntries: CatalogueEntry[]
  veteranEntries: CatalogueEntry[] // age group individuals + team
}

// Index non-veteran entries by composite key for group building
const CATALOGUE_INDEX = new Map<string, CatalogueEntry>()
for (const entry of CATALOGUE) {
  if (entry.category !== Category.VETERAN) {
    CATALOGUE_INDEX.set(
      `${entry.gender}-${entry.weapon}-${entry.category}-${entry.event_type}`,
      entry,
    )
  }
}

function lookup(
  gender: Gender,
  weapon: Weapon,
  category: Category,
  eventType: EventType,
): CatalogueEntry | undefined {
  return CATALOGUE_INDEX.get(`${gender}-${weapon}-${category}-${eventType}`)
}

// Group order: Women first, then Men; within each gender: Foil, Epee, Saber
const GROUP_ORDER: Array<{ gender: Gender; weapon: Weapon }> = [
  { gender: Gender.WOMEN, weapon: Weapon.FOIL },
  { gender: Gender.WOMEN, weapon: Weapon.EPEE },
  { gender: Gender.WOMEN, weapon: Weapon.SABRE },
  { gender: Gender.MEN, weapon: Weapon.FOIL },
  { gender: Gender.MEN, weapon: Weapon.EPEE },
  { gender: Gender.MEN, weapon: Weapon.SABRE },
]

function buildVeteranEntries(gender: Gender, weapon: Weapon): CatalogueEntry[] {
  // Age group individuals first, then team
  const entries: CatalogueEntry[] = []
  for (const entry of CATALOGUE) {
    if (
      entry.category === Category.VETERAN &&
      entry.gender === gender &&
      entry.weapon === weapon &&
      entry.event_type === EventType.INDIVIDUAL
    ) {
      entries.push(entry)
    }
  }
  // Sort by age group order
  const agOrder = ALL_VET_AGE_GROUPS as readonly string[]
  entries.sort((a, b) => agOrder.indexOf(a.vet_age_group!) - agOrder.indexOf(b.vet_age_group!))

  // Append team entry
  for (const entry of CATALOGUE) {
    if (
      entry.category === Category.VETERAN &&
      entry.gender === gender &&
      entry.weapon === weapon &&
      entry.event_type === EventType.TEAM
    ) {
      entries.push(entry)
    }
  }
  return entries
}

const GROUPS: WeaponGenderGroup[] = GROUP_ORDER.map(({ gender, weapon }) => ({
  gender,
  weapon,
  label: `${GENDER_DISPLAY[gender]} ${WEAPON_DISPLAY[weapon]}`,
  individualEntries: INDIVIDUAL_CATEGORY_ORDER
    .map((cat) => lookup(gender, weapon, cat, EventType.INDIVIDUAL))
    .filter((e): e is CatalogueEntry => e !== undefined),
  teamEntries: TEAM_CATEGORY_ORDER
    .map((cat) => lookup(gender, weapon, cat, EventType.TEAM))
    .filter((e): e is CatalogueEntry => e !== undefined),
  veteranEntries: buildVeteranEntries(gender, weapon),
}))

// ──────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────

function buttonLabel(entry: CatalogueEntry): string {
  if (entry.category === Category.VETERAN) {
    if (entry.event_type === EventType.TEAM) return 'Team'
    if (entry.vet_age_group) return vetAgeGroupDisplay(entry.vet_age_group)
  }
  return categoryDisplay(entry.category, entry.event_type)
}

function EventRow({
  label,
  entries,
  selectedIds,
  onToggle,
}: {
  label: string
  entries: CatalogueEntry[]
  selectedIds: Set<string>
  onToggle: (id: string, selected: boolean) => void
}) {
  return (
    <div className="flex border-b last:border-b-0">
      <span className="w-20 shrink-0 border-r px-2 py-1.5 text-[11px] font-medium text-muted-foreground">
        {label}
      </span>
      <div className="flex flex-wrap gap-1 px-2 py-1.5">
        {entries.map((entry) => {
          const isSelected = selectedIds.has(entry.id)
          return (
            <button
              key={entry.id}
              type="button"
              aria-label={competitionLabel(entry)}
              aria-pressed={isSelected}
              className={cn(
                'h-6 rounded-md border px-2 text-[11px] transition-colors',
                isSelected
                  ? 'border-orange-500 bg-orange-500 text-white'
                  : 'border-input bg-background text-foreground hover:bg-orange-50 hover:text-orange-700',
              )}
              onClick={() => onToggle(entry.id, !isSelected)}
            >
              {buttonLabel(entry)}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function CompetitionMatrix() {
  const selectedCompetitions = useStore((s) => s.selectedCompetitions)
  const addCompetition = useStore((s) => s.addCompetition)
  const removeCompetition = useStore((s) => s.removeCompetition)
  const selectCompetitions = useStore((s) => s.selectCompetitions)

  const selectedIds = new Set(Object.keys(selectedCompetitions))

  function countSelected(group: WeaponGenderGroup): number {
    let count = 0
    for (const e of group.individualEntries) {
      if (selectedIds.has(e.id)) count++
    }
    for (const e of group.teamEntries) {
      if (selectedIds.has(e.id)) count++
    }
    for (const e of group.veteranEntries) {
      if (selectedIds.has(e.id)) count++
    }
    return count
  }

  function handleToggle(id: string, selected: boolean) {
    if (selected) addCompetition(id)
    else removeCompetition(id)
  }

  const applyTemplate = useStore((s) => s.applyTemplate)
  const [templateOpen, setTemplateOpen] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState('')

  function handleTemplateChange(value: string) {
    if (!value) return
    setSelectedTemplate(value)
    applyTemplate(value)
  }

  return (
    <Card className="pt-0 gap-0">
      <CardHeader className="flex flex-row items-center gap-2 bg-foreground/10 rounded-t-xl py-2">
        <CardTitle>Competition Selection</CardTitle>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { selectCompetitions([]); setSelectedTemplate('') }}
                aria-label="Clear Selections"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Clear Selections</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <span className="ml-auto text-xs text-muted-foreground">
          {selectedIds.size} selected
        </span>
      </CardHeader>
      <CardContent className="pt-2 pb-3">
        <Collapsible open={templateOpen} onOpenChange={setTemplateOpen} className="mb-1.5">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronRight className={cn('h-3 w-3 transition-transform', templateOpen && 'rotate-90')} />
              Presets…
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={selectedTemplate}
              onValueChange={handleTemplateChange}
              className="mt-2 flex-wrap justify-start"
            >
              {TEMPLATE_NAMES.map((name) => (
                <ToggleGroupItem key={name} value={name} className="text-xs">
                  {name}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </CollapsibleContent>
        </Collapsible>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
          {GROUPS.map((group) => {
            const groupKey = `${group.gender}-${group.weapon}`
            const selected = countSelected(group)

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

                <div>
                  <EventRow
                    label="Individual"
                    entries={group.individualEntries}
                    selectedIds={selectedIds}
                    onToggle={handleToggle}
                  />
                  <EventRow
                    label="Team"
                    entries={group.teamEntries}
                    selectedIds={selectedIds}
                    onToggle={handleToggle}
                  />
                  <EventRow
                    label="Veteran"
                    entries={group.veteranEntries}
                    selectedIds={selectedIds}
                    onToggle={handleToggle}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
