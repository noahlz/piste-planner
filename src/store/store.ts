import { create } from 'zustand'
import type {
  DayConfig,
  TournamentType,
  RefPolicy,
  CutMode,
  DeMode,
  VideoPolicy,
  Placement,
  Weapon,
} from '../engine/types.ts'
import { BottleneckSeverity, PlacementSource } from '../engine/types.ts'
import { findingIdentity } from '../engine/validation.ts'
import { findCompetition, TEMPLATES, TEMPLATE_FENCER_DEFAULTS } from '../engine/catalogue.ts'
import { suggestStrips as computeStripSuggestion } from './stripSuggestion.ts'
// Value import of a sibling module that itself imports `StoreState` from this
// file as a type-only import (erased at compile time, per erasableSyntaxOnly)
// — no runtime cycle, only a type-level one that TS resolves fine.
import { selectDerivedFindings } from './derived.ts'
import {
  DEFAULT_CUT_BY_CATEGORY,
  DEFAULT_VIDEO_POLICY_BY_CATEGORY,
  ADMIN_GAP_MINS,
  FLIGHT_BUFFER_MINS,
  THRESHOLD_MINS,
  DEFAULT_POOL_ROUND_DURATION_TABLE,
} from '../engine/constants.ts'

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────

const DAY_START = 480 // 8:00 AM in minutes from midnight
const DAY_END = 1320 // 10:00 PM in minutes from midnight

const LayoutMode = {
  KITCHEN_SINK: 'kitchen-sink',
  WIZARD: 'wizard',
} as const
type LayoutMode = (typeof LayoutMode)[keyof typeof LayoutMode]

// ──────────────────────────────────────────────
// Slice types
// ──────────────────────────────────────────────

export interface TournamentSlice {
  tournament_type: TournamentType
  days_available: number
  dayConfigs: DayConfig[]
  strips_total: number
  video_strips_total: number
  pool_round_duration_table: Record<Weapon, number>

  setTournamentType: (type: TournamentType) => void
  setDays: (days: number) => void
  updateDayConfig: (dayIndex: number, partial: Partial<DayConfig>) => void
  setStrips: (total: number) => void
  setVideoStrips: (total: number) => void
  suggestStrips: () => void
  setPoolRoundDuration: (weapon: Weapon, minutes: number) => void
  resetPoolRoundDuration: (weapon: Weapon) => void
}

export interface CompetitionConfig {
  fencer_count: number
  ref_policy: RefPolicy
  cut_mode: CutMode
  cut_value: number
  de_mode: DeMode
  de_video_policy: VideoPolicy
  use_single_pool_override: boolean
}

export interface GlobalOverrides {
  ADMIN_GAP_MINS: number
  FLIGHT_BUFFER_MINS: number
  THRESHOLD_MINS: number
}

export interface CompetitionSlice {
  selectedCompetitions: Record<string, CompetitionConfig>
  globalOverrides: GlobalOverrides

  selectCompetitions: (ids: string[]) => void
  addCompetition: (id: string) => void
  updateCompetition: (id: string, partial: Partial<CompetitionConfig>) => void
  removeCompetition: (id: string) => void
  applyTemplate: (templateName: string) => void
  setGlobalOverrides: (partial: Partial<GlobalOverrides>) => void
}

export interface UiSlice {
  layoutMode: LayoutMode
  wizardStep: number

  setLayoutMode: (mode: LayoutMode) => void
  setStep: (step: number) => void
}

/** Where an event sits. The only schedule state — everything else derives from it. */
export interface PlacementsSlice {
  placements: Record<string, Placement>

  /** Replaces the whole map. Every entry lands as auto and unpinned. */
  setPlacementsFromAuto: (placements: Record<string, Placement>) => void
  /** Merges a partial into an existing entry, marking it manual and pinned. */
  updatePlacement: (id: string, partial: Partial<Placement>) => void
  removePlacement: (id: string) => void
  clearPlacements: () => void
  setPinned: (id: string, pinned: boolean) => void
}

/** Findings the user has waved off, keyed by stable finding id. */
export interface DismissalsSlice {
  dismissedFindings: Record<string, true>

  dismissFinding: (id: string) => void
  undismissFinding: (id: string) => void
}

const SuggestionState = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
} as const
type SuggestionState = (typeof SuggestionState)[keyof typeof SuggestionState]

/** Accept/reject intent only — the suggestions themselves derive from current inputs. */
export interface AnalysisSlice {
  flightingSuggestionStates: SuggestionState[]

  acceptFlightingSuggestion: (index: number) => void
  rejectFlightingSuggestion: (index: number) => void
}

export type StoreState = TournamentSlice &
  UiSlice &
  CompetitionSlice &
  AnalysisSlice &
  PlacementsSlice &
  DismissalsSlice

// ──────────────────────────────────────────────
// Slice creators
// ──────────────────────────────────────────────

type SetState = (
  partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>),
) => void
type GetState = () => StoreState

function createTournamentSlice(set: SetState, get: GetState): TournamentSlice {
  return {
    tournament_type: 'NAC',
    days_available: 3,
    dayConfigs: [],
    strips_total: 0,
    video_strips_total: 0,
    // Copied so store mutations never alias the engine constant
    pool_round_duration_table: { ...DEFAULT_POOL_ROUND_DURATION_TABLE },

    setTournamentType: (type) => {
      set({ tournament_type: type })
    },

    setDays: (days) => {
      const dayConfigs: DayConfig[] = Array.from({ length: days }, () => ({
        day_start_time: DAY_START,
        day_end_time: DAY_END,
      }))
      set({ days_available: days, dayConfigs })
    },

    updateDayConfig: (dayIndex, partial) => {
      set((state) => {
        const updated = state.dayConfigs.map((dc, i) =>
          i === dayIndex ? { ...dc, ...partial } : dc,
        )
        return { dayConfigs: updated }
      })
    },

    setStrips: (total) => {
      set({ strips_total: total })
    },

    setVideoStrips: (total) => {
      set({ video_strips_total: total })
    },

    suggestStrips: () => {
      const state = get()
      const suggested = computeStripSuggestion(
        state.selectedCompetitions,
      )
      if (suggested !== null) {
        set({ strips_total: suggested })
      }
    },

    setPoolRoundDuration: (weapon, minutes) => {
      set((state) => ({
        pool_round_duration_table: { ...state.pool_round_duration_table, [weapon]: minutes },
      }))
    },

    resetPoolRoundDuration: (weapon) => {
      set((state) => ({
        pool_round_duration_table: {
          ...state.pool_round_duration_table,
          [weapon]: DEFAULT_POOL_ROUND_DURATION_TABLE[weapon],
        },
      }))
    },
  }
}

type FencerDefaultTable = Partial<Record<string, number>>

/** Builds a default CompetitionConfig from a catalogue entry's category.
 *  When fencerDefaults is provided (e.g. from a template), uses it to
 *  populate fencer_count instead of defaulting to 0. */
function defaultConfigForId(id: string, fencerDefaults?: FencerDefaultTable): CompetitionConfig | null {
  const entry = findCompetition(id)
  if (!entry) return null
  const cut = DEFAULT_CUT_BY_CATEGORY[entry.category]
  const defaultKey =
    entry.event_type === 'TEAM'
      ? `${entry.category}:TEAM`
      : `${entry.category}:${entry.weapon}:${entry.gender}`
  const defaultCount = fencerDefaults?.[defaultKey] ?? 0
  return {
    fencer_count: defaultCount,
    ref_policy: 'AUTO',
    cut_mode: cut.mode,
    cut_value: cut.value,
    de_mode: 'SINGLE_STAGE',
    de_video_policy: DEFAULT_VIDEO_POLICY_BY_CATEGORY[entry.category],
    use_single_pool_override: false,
  }
}

function createCompetitionSlice(set: SetState, _get: GetState): CompetitionSlice {
  return {
    selectedCompetitions: {},
    globalOverrides: {
      ADMIN_GAP_MINS,
      FLIGHT_BUFFER_MINS,
      THRESHOLD_MINS,
    },

    selectCompetitions: (ids) => {
      const map: Record<string, CompetitionConfig> = {}
      for (const id of ids) {
        const config = defaultConfigForId(id)
        if (config) map[id] = config
      }
      set({ selectedCompetitions: map })
    },

    addCompetition: (id) => {
      const config = defaultConfigForId(id)
      if (!config) return
      set((state) => ({
        selectedCompetitions: { ...state.selectedCompetitions, [id]: config },
      }))
    },

    updateCompetition: (id, partial) => {
      set((state) => {
        const existing = state.selectedCompetitions[id]
        if (!existing) return {}
        return {
          selectedCompetitions: {
            ...state.selectedCompetitions,
            [id]: { ...existing, ...partial },
          },
        }
      })
    },

    removeCompetition: (id) => {
      // The placement goes with the competition, in one action — a placement
      // for an unselected event is an orphan nothing can derive from.
      set((state) => {
        const { [id]: _config, ...restCompetitions } = state.selectedCompetitions
        const { [id]: _placement, ...restPlacements } = state.placements
        return { selectedCompetitions: restCompetitions, placements: restPlacements }
      })
    },

    applyTemplate: (templateName) => {
      const ids = TEMPLATES[templateName] ?? []
      const fencerDefaults = TEMPLATE_FENCER_DEFAULTS[templateName] ?? {}
      const map: Record<string, CompetitionConfig> = {}
      for (const id of ids) {
        const config = defaultConfigForId(id, fencerDefaults)
        if (config) map[id] = config
      }
      set({ selectedCompetitions: map })
    },

    setGlobalOverrides: (partial) => {
      set((state) => ({
        globalOverrides: { ...state.globalOverrides, ...partial },
      }))
    },
  }
}

function createUiSlice(set: SetState, _get: GetState): UiSlice {
  return {
    layoutMode: 'wizard',
    wizardStep: 0,

    setLayoutMode: (mode) => set({ layoutMode: mode }),
    setStep: (step) => set({ wizardStep: step }),
  }
}

function createPlacementsSlice(set: SetState, _get: GetState): PlacementsSlice {
  return {
    placements: {},

    setPlacementsFromAuto: (placements) => {
      const normalised: Record<string, Placement> = {}
      for (const [id, placement] of Object.entries(placements)) {
        normalised[id] = { ...placement, source: PlacementSource.AUTO, pinned: false }
      }
      set({ placements: normalised })
    },

    updatePlacement: (id, partial) => {
      set((state) => {
        const existing = state.placements[id]
        if (!existing) return {}
        return {
          placements: {
            ...state.placements,
            [id]: { ...existing, ...partial, source: PlacementSource.MANUAL, pinned: true },
          },
        }
      })
    },

    removePlacement: (id) => {
      set((state) => {
        const { [id]: _removed, ...rest } = state.placements
        return { placements: rest }
      })
    },

    clearPlacements: () => set({ placements: {} }),

    setPinned: (id, pinned) => {
      set((state) => {
        const existing = state.placements[id]
        if (!existing) return {}
        return { placements: { ...state.placements, [id]: { ...existing, pinned } } }
      })
    },
  }
}

function createDismissalsSlice(set: SetState, get: GetState): DismissalsSlice {
  return {
    dismissedFindings: {},

    // Advisory-only guard (data-model.md §Dismissals, spec clarification
    // 2026-08-28): an id only takes effect when it currently matches a
    // WARN-severity finding on the derived findings surface. ERROR ids and
    // unknown ids are silent no-ops — no state change.
    dismissFinding: (id) => {
      const { validationErrors } = selectDerivedFindings(get())
      const isCurrentWarn = validationErrors.some(
        (finding) => finding.severity === BottleneckSeverity.WARN && findingIdentity(finding) === id,
      )
      if (!isCurrentWarn) return
      set((state) => ({ dismissedFindings: { ...state.dismissedFindings, [id]: true } }))
    },

    undismissFinding: (id) => {
      set((state) => {
        const { [id]: _removed, ...rest } = state.dismissedFindings
        return { dismissedFindings: rest }
      })
    },
  }
}

function createAnalysisSlice(set: SetState, _get: GetState): AnalysisSlice {
  return {
    flightingSuggestionStates: [],

    acceptFlightingSuggestion: (index) => {
      set((state) => {
        const updated = [...state.flightingSuggestionStates]
        updated[index] = SuggestionState.ACCEPTED
        return { flightingSuggestionStates: updated }
      })
    },

    rejectFlightingSuggestion: (index) => {
      set((state) => {
        const updated = [...state.flightingSuggestionStates]
        updated[index] = SuggestionState.REJECTED
        return { flightingSuggestionStates: updated }
      })
    },
  }
}

// ──────────────────────────────────────────────
// Combined store
// ──────────────────────────────────────────────

export const useStore = create<StoreState>()((set, get) => ({
  ...createTournamentSlice(set as SetState, get as GetState),
  ...createCompetitionSlice(set as SetState, get as GetState),
  ...createUiSlice(set as SetState, get as GetState),
  ...createAnalysisSlice(set as SetState, get as GetState),
  ...createPlacementsSlice(set as SetState, get as GetState),
  ...createDismissalsSlice(set as SetState, get as GetState),
}))
