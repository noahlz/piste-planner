import { useState, type ReactElement } from 'react'
import { ChevronDown, ChevronUp, Pin as PinIcon, Split, X } from 'lucide-react'
import { useStore } from '../../store/store.ts'
import type { DrawnSchedule } from '../../store/derived.ts'
import { findCompetition } from '../../engine/catalogue.ts'
import { competitionLabel } from '../../lib/competitionLabels.ts'
import { estimateEventFootprint } from '../../engine/derive.ts'
import { eventTimeSegments } from '../../layout/segments.ts'
import { phaseDisplay, stripSetLabel, unseatedStripsLabel } from '../../lib/placementLabels.ts'
import { formatClock, formatMinutes } from '../../lib/time.ts'
import { Phase } from '../../engine/types.ts'
import { weaponVar, WeaponTokenPart } from '../canvas/weaponTokens.ts'
import { cn } from '@/lib/utils'

export interface DetailStripProps {
  /** The committed drawn model `CenterView` is drawing (FR-042: never the live store). */
  schedule: DrawnSchedule
  detailCollapsed: boolean
  onToggleDetailCollapsed: () => void
}

/** One phase pill, placed (a clock span) or unplaced (an estimated duration). */
interface Pill {
  phase: Phase
  text: string
}

const ACTION_BUTTON =
  'flex h-8 shrink-0 items-center gap-[7px] whitespace-nowrap rounded-[10px] border-[1.5px] border-chrome-border bg-secondary px-[13px] text-[12.5px] font-semibold text-foreground hover:border-accent-400 hover:bg-accent-100'
const ACTION_BUTTON_PRESSED = 'border-accent-400 bg-accent-100 text-accent-800'
const TOGGLE_BUTTON =
  'flex h-[26px] w-[30px] shrink-0 items-center justify-center rounded-[8px] text-neutral-600 hover:bg-neutral-200'
const ICON_BUTTON =
  'flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border-[1.5px] border-chrome-border bg-secondary text-neutral-600 hover:bg-muted hover:text-foreground'

/**
 * The detail strip — contract §4 (phase4-contract.md), FR-042 to FR-047.
 *
 * ## Reads the store directly rather than taking every fact as a prop
 *
 * `schedule` is the one thing that must be the *committed* model (FR-042) —
 * a fact drawn from a live selector here would describe an edit `CenterView`
 * has not settled into the canvas yet, and the strip would disagree with the
 * blocks it is meant to describe. But the actions below (`Pin`, `Move day`,
 * `Flight`) name the state of *their own effect* — whether this placement is
 * pinned right now, not what it was when the schedule last settled — so those
 * five reads (`selectedCompetitionId`, `placements`, `selectedCompetitions`,
 * plus the two setters and `setPinned`/`updatePlacement`/`updateCompetition`)
 * come from the live store. A button that named a fact three keystrokes stale
 * would tell the organizer they had already pinned something they had not.
 * The Pin button reads the store live on purpose (a control acknowledges a
 * press at once), while the canvas badge follows the committed model (FR-042,
 * T046), so the two can disagree for one settle, or for as long as a blocking
 * ERROR holds the commit – this is deliberate.
 *
 * ## Placed vs unplaced is `schedule.events`, not `placements`
 *
 * Every selected competition is in `schedule.competitions` whether or not it
 * has ever been placed; only `schedule.events` is gated on having a
 * placement. Reading `placements` instead would flicker the strip between
 * placed and unplaced shapes mid-settle, a render behind the canvas it sits
 * under.
 *
 * ## The same helpers the block and the tooltip use, not new arithmetic
 *
 * `stripSetLabel`/`unseatedStripsLabel`/`phaseDisplay` are the shared block
 * vocabulary in `src/lib/placementLabels.ts`. `Block` and `CanvasTooltip` read
 * the same helpers through `drawnStripsLabel`. The strip label reads the
 * committed model's own `blocks` and the pills its `events` (017 spec §6):
 * right after a run, the strips and times the run gave the event.
 */
export function DetailStrip({
  schedule,
  detailCollapsed,
  onToggleDetailCollapsed,
}: DetailStripProps): ReactElement | null {
  const selectedCompetitionId = useStore((s) => s.selectedCompetitionId)
  const selectCompetition = useStore((s) => s.selectCompetition)
  const placements = useStore((s) => s.placements)
  const setPinned = useStore((s) => s.setPinned)
  const updatePlacement = useStore((s) => s.updatePlacement)
  const selectedCompetitions = useStore((s) => s.selectedCompetitions)
  const updateCompetition = useStore((s) => s.updateCompetition)
  const [moveDayOpen, setMoveDayOpen] = useState(false)

  const id = selectedCompetitionId
  const competition = id === null ? undefined : schedule.competitions.find((c) => c.id === id)

  if (id === null || competition === undefined) return null

  const derived = schedule.events[id]
  const placed = derived !== undefined
  const entry = findCompetition(id)
  const name = entry ? competitionLabel(entry) : id
  const pinned = placements[id]?.pinned ?? false
  const flighted = selectedCompetitions[id]?.flighted ?? false
  const daysAvailable = Math.max(0, Math.floor(schedule.config.days_available))

  let stripsLabel: string | null = null
  if (placed) {
    if (derived.day_out_of_range) {
      // The strip assigner skips a day_out_of_range event outright — there is
      // no strip to report because the block's day does not exist, not
      // because a day that does had no room. Naming the count would claim
      // strips the event was never given, the same fiction
      // `unseatedStripsLabel`'s docblock rules out for an unseated block.
      stripsLabel = 'Unplaced, day out of range'
    } else {
      const blocks = schedule.blocks.filter((b) => b.competitionId === id)
      // The model's one predicate, as the footer and the Findings panel read
      // it: on a stale board an unseated phase is not unplaced (P4 (a)), so the
      // label names whatever the event's other phases hold.
      const unplaced = blocks.filter((b) => b.countsAsUnplaced)
      const held = blocks.flatMap((b) => b.strips)
      if (unplaced.length > 0) {
        stripsLabel = unseatedStripsLabel(Math.max(...unplaced.map((b) => b.stripCount)))
      } else if (held.length > 0) {
        stripsLabel = stripSetLabel(held)
      }
    }
  }

  let pills: Pill[] = []
  if (placed) {
    pills = eventTimeSegments(derived).map((segment) => ({
      phase: segment.phase,
      text: `${phaseDisplay(segment.phase)} ${formatClock(segment.startMinutes)}–${formatClock(segment.endMinutes)}`,
    }))
  } else {
    // No footprint for a count the engine cannot size (018 T4) — no pills.
    const footprint = estimateEventFootprint(competition, schedule.config)
    if (footprint !== null) {
      pills = [
        { phase: Phase.POOLS, text: `Pools ${formatMinutes(footprint.poolMinutes)}` },
        { phase: Phase.DE, text: `DE ${formatMinutes(footprint.deMinutes)}` },
      ]
    }
  }

  const otherDays = placed
    ? Array.from({ length: daysAvailable }, (_, day) => day).filter(
        (day) => day !== derived.result.assigned_day,
      )
    : []

  function moveTo(day: number): void {
    updatePlacement(id!, { day, start_time: placements[id!]?.start_time })
    setMoveDayOpen(false)
  }

  // The facts live on the section itself, not on the spans that display
  // them — contract §4 reads them off `getByRole('region', ...)` directly, so
  // the root is the one place a test (and a future caller) can find them
  // without knowing how the strip lays its text out. Collapsed excludes every
  // one but the name (contract §4 Collapsed).
  const factAttrs: Record<string, string> = { 'data-selected-name': name }
  if (!detailCollapsed) {
    if (placed) factAttrs['data-selected-day'] = String(derived.result.assigned_day + 1)
    if (stripsLabel !== null) factAttrs['data-selected-strips'] = stripsLabel
    factAttrs['data-selected-fencers'] = String(competition.fencer_count)
  }

  return (
    <section
      aria-label="Selected event"
      data-collapsed={detailCollapsed ? 'true' : 'false'}
      {...factAttrs}
      className={cn(
        'print-hidden flex shrink-0 items-center gap-3.5 border-t-[1.5px] border-chrome-border bg-chrome-deep px-3 animate-in fade-in slide-in-from-bottom-full duration-200 motion-reduce:animate-none',
        detailCollapsed ? 'h-[30px]' : 'h-[58px]',
      )}
    >
      <span
        aria-hidden="true"
        className={cn('shrink-0', detailCollapsed ? 'rounded-[5px]' : 'rounded-[7px]')}
        style={{
          width: detailCollapsed ? 14 : 20,
          height: detailCollapsed ? 14 : 34,
          background: weaponVar(competition.weapon, WeaponTokenPart.FILL),
          border: `1.5px solid ${weaponVar(competition.weapon, WeaponTokenPart.EDGE)}`,
        }}
      />

      {detailCollapsed ? (
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold text-foreground">{name}</span>
      ) : (
        <>
          <div className="flex min-w-[150px] flex-1 flex-col gap-px overflow-hidden">
            <span className="truncate text-[17px] leading-[1.2] font-bold text-foreground">{name}</span>
            <span className="flex gap-[11px] font-mono text-[11px] font-semibold whitespace-nowrap text-neutral-600">
              {placed && (
                <span>
                  {derived.day_out_of_range
                    ? `Day ${derived.result.assigned_day + 1} out of range`
                    : `Day ${derived.result.assigned_day + 1}`}
                </span>
              )}
              {stripsLabel !== null && <span>{stripsLabel}</span>}
              <span>{`${competition.fencer_count} fencers`}</span>
            </span>
          </div>

          {pills.length > 0 && (
            <>
              <span aria-hidden="true" className="h-7 w-[1.5px] shrink-0 rounded-sm bg-grid-line" />
              <div className="flex min-w-0 flex-none items-center gap-2 overflow-hidden">
                {pills.map((pill) => (
                  <span
                    key={pill.phase}
                    data-phase-pill={pill.phase}
                    className="flex h-7 items-center gap-[7px] rounded-full border-[1.5px] border-neutral-200 bg-chrome-soft px-[11px] text-[12.5px] whitespace-nowrap text-foreground"
                  >
                    {pill.text}
                  </span>
                ))}
              </div>
            </>
          )}

          <div className="flex flex-none gap-[7px]">
            {placed && (
              <button
                type="button"
                aria-pressed={pinned}
                onClick={() => setPinned(id, !pinned)}
                className={cn(ACTION_BUTTON, pinned && ACTION_BUTTON_PRESSED)}
              >
                <PinIcon aria-hidden="true" className="h-3.5 w-3.5" />
                {pinned ? 'Pinned' : 'Pin'}
              </button>
            )}

            {placed && daysAvailable > 1 && (
              <div className="relative">
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={moveDayOpen}
                  onClick={() => setMoveDayOpen((open) => !open)}
                  className={ACTION_BUTTON}
                >
                  Move day
                </button>
                {moveDayOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 bottom-full z-10 mb-1 min-w-[110px] rounded-[10px] border-[1.5px] border-chrome-border bg-popover py-1 shadow-lg"
                  >
                    {otherDays.map((day) => (
                      <button
                        key={day}
                        type="button"
                        role="menuitem"
                        onClick={() => moveTo(day)}
                        className="block w-full px-3 py-1.5 text-left text-[12.5px] text-foreground hover:bg-accent-100"
                      >
                        {`Day ${day + 1}`}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <button
              type="button"
              aria-pressed={flighted}
              onClick={() => updateCompetition(id, { flighted: !flighted })}
              className={cn(ACTION_BUTTON, flighted && ACTION_BUTTON_PRESSED)}
            >
              <Split aria-hidden="true" className="h-3.5 w-3.5" />
              Flight
            </button>
          </div>
        </>
      )}

      <div className="ml-auto flex flex-none gap-1">
        <button
          type="button"
          aria-label={detailCollapsed ? 'Expand details' : 'Collapse details'}
          onClick={onToggleDetailCollapsed}
          className={TOGGLE_BUTTON}
        >
          {detailCollapsed ? (
            <ChevronUp aria-hidden="true" className="h-4 w-4" />
          ) : (
            <ChevronDown aria-hidden="true" className="h-4 w-4" />
          )}
        </button>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => selectCompetition(null)}
          className={ICON_BUTTON}
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
    </section>
  )
}
