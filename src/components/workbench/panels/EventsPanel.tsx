import { memo, useMemo } from 'react'
import { useStore } from '../../../store/store.ts'
import { CATALOGUE, ALL_VET_AGE_GROUPS } from '../../../engine/catalogue.ts'
import { MIN_FENCERS } from '../../../engine/constants.ts'
import type { CatalogueEntry } from '../../../engine/types.ts'
import { Category, EventType, Gender, Weapon } from '../../../engine/types.ts'
import {
  competitionLabel,
  categoryDisplay,
  vetAgeGroupDisplay,
  GENDER_DISPLAY,
  WEAPON_DISPLAY,
} from '../../competitionLabels.ts'
import { NumberInput } from '@/components/ui/number-input'
import { cn } from '@/lib/utils'

// ──────────────────────────────────────────────
// Catalogue grouping (ported from the retired competition-matrix section)
// ──────────────────────────────────────────────

/** Veteran excluded — its six age bands come from ALL_VET_AGE_GROUPS instead. */
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

const TEAM_CATEGORY_ORDER: Category[] = [Category.CADET, Category.JUNIOR, Category.DIV1]

/** Women first, then Men; within each gender Foil, Epee, Saber (mockup order). */
const GROUP_ORDER: Array<{ gender: Gender; weapon: Weapon }> = [
  { gender: Gender.WOMEN, weapon: Weapon.FOIL },
  { gender: Gender.WOMEN, weapon: Weapon.EPEE },
  { gender: Gender.WOMEN, weapon: Weapon.SABRE },
  { gender: Gender.MEN, weapon: Weapon.FOIL },
  { gender: Gender.MEN, weapon: Weapon.EPEE },
  { gender: Gender.MEN, weapon: Weapon.SABRE },
]

const CATALOGUE_INDEX = new Map<string, CatalogueEntry>()
for (const entry of CATALOGUE) {
  const vetKey = entry.vet_age_group ?? ''
  CATALOGUE_INDEX.set(
    `${entry.gender}-${entry.weapon}-${entry.category}-${entry.event_type}-${vetKey}`,
    entry,
  )
}

function lookup(
  gender: Gender,
  weapon: Weapon,
  category: Category,
  eventType: EventType,
  vetAgeGroup = '',
): CatalogueEntry | undefined {
  return CATALOGUE_INDEX.get(`${gender}-${weapon}-${category}-${eventType}-${vetAgeGroup}`)
}

interface EventGroup {
  key: string
  label: string
  /** One flat chip row per group: 10 individual, 6 veteran bands, 4 team. */
  entries: CatalogueEntry[]
}

const GROUPS: EventGroup[] = GROUP_ORDER.map(({ gender, weapon }) => {
  const entries = [
    ...INDIVIDUAL_CATEGORY_ORDER.map((c) => lookup(gender, weapon, c, EventType.INDIVIDUAL)),
    ...ALL_VET_AGE_GROUPS.map((ag) =>
      lookup(gender, weapon, Category.VETERAN, EventType.INDIVIDUAL, ag),
    ),
    ...TEAM_CATEGORY_ORDER.map((c) => lookup(gender, weapon, c, EventType.TEAM)),
    lookup(gender, weapon, Category.VETERAN, EventType.TEAM),
  ].filter((e): e is CatalogueEntry => e !== undefined)

  return {
    key: `${gender}-${weapon}`,
    label: `${GENDER_DISPLAY[gender]} ${WEAPON_DISPLAY[weapon]}`,
    entries,
  }
})

/** The chip's visible text. The full `competitionLabel` is the accessible name,
 *  so the face of the pill can stay as short as the mockup's chips. */
function chipText(entry: CatalogueEntry): string {
  if (entry.category === Category.VETERAN) {
    if (entry.event_type === EventType.TEAM) return 'Vet Team'
    if (entry.vet_age_group) return vetAgeGroupDisplay(entry.vet_age_group)
  }
  const category = categoryDisplay(entry.category, entry.event_type)
  return entry.event_type === EventType.TEAM ? `${category} Team` : category
}

const CHIP_BASE =
  'rounded-full border-[1.5px] px-[11px] py-1 text-[11.5px] leading-tight transition-colors'
const CHIP_SELECTED = 'border-transparent bg-primary text-primary-foreground'
const CHIP_UNSELECTED = 'border-chrome-border bg-white text-neutral-700 hover:bg-chrome-deep'

/**
 * One chip + its fencer-count input. Subscribes only to its own entry's
 * config, not the whole `selectedCompetitions` record, so a fencer-count
 * edit on one chip cannot re-render the other 119 (perf review on T020–T022,
 * standing rule 13's DOM/aria contract preserved exactly).
 */
const EventChip = memo(function EventChip({ entry }: { entry: CatalogueEntry }) {
  const config = useStore((s) => s.selectedCompetitions[entry.id])
  const addCompetition = useStore((s) => s.addCompetition)
  const removeCompetition = useStore((s) => s.removeCompetition)
  const updateCompetition = useStore((s) => s.updateCompetition)

  const isSelected = config !== undefined
  const label = competitionLabel(entry)

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        aria-label={label}
        aria-pressed={isSelected}
        onClick={() => (isSelected ? removeCompetition(entry.id) : addCompetition(entry.id))}
        className={cn(CHIP_BASE, isSelected ? CHIP_SELECTED : CHIP_UNSELECTED)}
      >
        {chipText(entry)}
      </button>
      {isSelected && (
        <NumberInput
          value={config.fencer_count}
          onChange={(v) => updateCompetition(entry.id, { fencer_count: v })}
          min={MIN_FENCERS}
          commitOnChange
          aria-label={`Fencer count for ${label}`}
        />
      )}
    </span>
  )
})

/**
 * The Events inspector panel (013 T021, FR-019–FR-021, research D15). Replaces
 * the competition-matrix and fencer-count sections (both deleted in that
 * task): one
 * group card per gender × weapon, a chip per catalogue entry, and a fencer
 * count inline beside each selected chip. Per FR-021 selection and fencer
 * count are the only per-event inputs — cut, DE mode, video policy, referee
 * policy and the single-pool override are gone. The templates picker moved to
 * the header in phase 1 and is deliberately not ported here.
 */
export function EventsPanel() {
  // Serialized rather than watched by reference (same pattern as
  // StripsPanel's fencerCountsKey): the parent only needs which ids are
  // selected, never their fencer counts, so a count edit — which replaces
  // the whole record — changes no selector value here and re-renders
  // nothing but the one EventChip that owns that entry.
  const selectedKey = useStore((s) => Object.keys(s.selectedCompetitions).sort().join(','))
  const selectedIds = useMemo(
    () => new Set(selectedKey === '' ? [] : selectedKey.split(',')),
    [selectedKey],
  )

  return (
    <div className="flex flex-col gap-2.5">
      <h3 className="flex items-baseline justify-between">
        <span className="text-[11.5px] font-semibold tracking-[.06em] text-neutral-600 uppercase">
          Selected
        </span>
        <span className="font-mono text-[11.5px] font-semibold text-neutral-600">
          {`${selectedIds.size} of ${CATALOGUE.length}`}
        </span>
      </h3>

      {GROUPS.map((group) => {
        const groupCount = group.entries.filter((e) => selectedIds.has(e.id)).length
        return (
          <section
            key={group.key}
            aria-label={group.label}
            className="overflow-hidden rounded-[12px] border-[1.5px] border-chrome-border bg-white"
          >
            <div className="flex items-center justify-between bg-chrome-deep px-[11px] py-[7px] text-[11.5px] font-semibold tracking-[.05em] uppercase">
              <span>{group.label}</span>
              <span className="font-mono font-semibold text-neutral-600">{groupCount}</span>
            </div>
            <div className="flex flex-wrap items-center gap-[5px] px-[11px] pt-[9px] pb-[11px]">
              {group.entries.map((entry) => (
                <EventChip key={entry.id} entry={entry} />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
