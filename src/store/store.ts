import { create } from 'zustand'
import type {
  DayConfig,
  TournamentType,
  PodCaptainOverride,
  RefPolicy,
  CutMode,
  DeMode,
  VideoPolicy,
  ValidationError,
  Bottleneck,
  AnalysisResult,
  FlightingGroup,
  ScheduleResult,
} from '../engine/types.ts'
import { findCompetition, TEMPLATES, TEMPLATE_FENCER_DEFAULTS } from '../engine/catalogue.ts'
import { suggestRefs } from './refSuggestion.ts'
import { suggestStrips as computeStripSuggestion } from './stripSuggestion.ts'
import {
  DEFAULT_CUT_BY_CATEGORY,
  DEFAULT_VIDEO_POLICY_BY_CATEGORY,
  ADMIN_GAP_MINS,
  FLIGHT_BUFFER_MINS,
  THRESHOLD_MINS,
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
  include_finals_strip: boolean
  pod_captain_override: PodCaptainOverride

  setTournamentType: (type: TournamentType) => void
  setDays: (days: number) => void
  updateDayConfig: (dayIndex: number, partial: Partial<DayConfig>) => void
  setStrips: (total: number) => void
  setVideoStrips: (total: number) => void
  setIncludeFinalsStrip: (include: boolean) => void
  suggestStrips: () => void
  setPodCaptainOverride: (override: PodCaptainOverride) => void
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
  analysisStale: boolean
  scheduleStale: boolean

  setLayoutMode: (mode: LayoutMode) => void
  setStep: (step: number) => void
  markStale: (flags: { analysisStale?: boolean; scheduleStale?: boolean }) => void
  clearStale: () => void
}

export interface DayRefConfig {
  foil_epee_refs: number
  sabre_refs: number
  allow_sabre_ref_fillin: boolean
}

const DEFAULT_DAY_REF_CONFIG: DayRefConfig = {
  foil_epee_refs: 0,
  sabre_refs: 0,
  allow_sabre_ref_fillin: false,
}

export interface RefereeSlice {
  dayRefs: DayRefConfig[]
  optimalRefs: DayRefConfig[]
  manuallyEditedDays: Set<number>

  setDayRefs: (dayIndex: number, refs: Partial<DayRefConfig>) => void
  toggleSabreFillin: (dayIndex: number) => void
  setOptimalRefs: (refs: DayRefConfig[]) => void
  suggestAllRefs: () => void
}

const SuggestionState = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
} as const
type SuggestionState = (typeof SuggestionState)[keyof typeof SuggestionState]

export interface AnalysisSlice {
  validationErrors: ValidationError[]
  warnings: Bottleneck[]
  suggestions: string[]
  flightingSuggestions: FlightingGroup[]
  flightingSuggestionStates: SuggestionState[]

  setAnalysisResults: (errors: ValidationError[], result: AnalysisResult) => void
  acceptFlightingSuggestion: (index: number) => void
  rejectFlightingSuggestion: (index: number) => void
  clearAnalysis: () => void
}

export interface ScheduleSlice {
  scheduleResults: Record<string, ScheduleResult>
  bottlenecks: Bottleneck[]

  setScheduleResults: (results: Record<string, ScheduleResult>, bottlenecks: Bottleneck[]) => void
  clearSchedule: () => void
}

export type StoreState = TournamentSlice & UiSlice & CompetitionSlice & RefereeSlice & AnalysisSlice & ScheduleSlice

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
    include_finals_strip: false,
    pod_captain_override: 'AUTO',

    setTournamentType: (type) => {
      set({ tournament_type: type })
      get().markStale({ analysisStale: true, scheduleStale: true })
    },

    setDays: (days) => {
      const dayConfigs: DayConfig[] = Array.from({ length: days }, () => ({
        day_start_time: DAY_START,
        day_end_time: DAY_END,
      }))
      set({ days_available: days, dayConfigs })
      get().markStale({ analysisStale: true, scheduleStale: true })
    },

    updateDayConfig: (dayIndex, partial) => {
      set((state) => {
        const updated = state.dayConfigs.map((dc, i) =>
          i === dayIndex ? { ...dc, ...partial } : dc,
        )
        return { dayConfigs: updated }
      })
      get().markStale({ analysisStale: true, scheduleStale: true })
    },

    setStrips: (total) => {
      set({ strips_total: total })
      get().markStale({ analysisStale: true, scheduleStale: true })
      autoSuggestRefs(get as GetState, set as SetState)
    },

    setVideoStrips: (total) => {
      set({ video_strips_total: total })
      get().markStale({ analysisStale: true, scheduleStale: true })
    },

    setIncludeFinalsStrip: (include) => {
      set({ include_finals_strip: include })
      get().markStale({ analysisStale: true, scheduleStale: true })
    },

    suggestStrips: () => {
      const state = get()
      const suggested = computeStripSuggestion(
        state.selectedCompetitions,
        state.include_finals_strip,
      )
      if (suggested !== null) {
        set({ strips_total: suggested })
        get().markStale({ analysisStale: true, scheduleStale: true })
        autoSuggestRefs(get as GetState, set as SetState)
      }
    },

    setPodCaptainOverride: (override) => {
      set({ pod_captain_override: override })
      get().markStale({ analysisStale: true, scheduleStale: true })
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
  const defaultCount = fencerDefaults?.[`${entry.category}:${entry.event_type}`] ?? 0
  return {
    fencer_count: defaultCount,
    ref_policy: 'AUTO',
    cut_mode: cut.mode,
    cut_value: cut.value,
    de_mode: 'SINGLE_BLOCK',
    de_video_policy: DEFAULT_VIDEO_POLICY_BY_CATEGORY[entry.category],
    use_single_pool_override: false,
  }
}

/**
 * Auto-populates referee counts for days that haven't been manually edited.
 * Called after competition selection changes.
 */
function autoSuggestRefs(get: GetState, set: SetState) {
  const state = get()
  if (state.days_available === 0 || state.strips_total === 0) return

  const suggestion = suggestRefs(
    state.selectedCompetitions,
    state.days_available,
    state.strips_total,
  )
  if (!suggestion) return

  const extended = ensureDayRefs(state.dayRefs, state.days_available)
  let changed = false
  const updated = extended.map((dc, i) => {
    if (state.manuallyEditedDays.has(i)) return dc
    if (dc.foil_epee_refs === suggestion.foil_epee_refs && dc.sabre_refs === suggestion.sabre_refs) return dc
    changed = true
    return { ...dc, ...suggestion }
  })
  if (changed) set({ dayRefs: updated })
}

function createCompetitionSlice(set: SetState, get: GetState): CompetitionSlice {
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
      get().markStale({ analysisStale: true, scheduleStale: true })
      autoSuggestRefs(get as GetState, set as SetState)
    },

    addCompetition: (id) => {
      const config = defaultConfigForId(id)
      if (!config) return
      set((state) => ({
        selectedCompetitions: { ...state.selectedCompetitions, [id]: config },
      }))
      get().markStale({ analysisStale: true, scheduleStale: true })
      autoSuggestRefs(get as GetState, set as SetState)
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
      get().markStale({ analysisStale: true, scheduleStale: true })
    },

    removeCompetition: (id) => {
      set((state) => {
        const { [id]: _, ...rest } = state.selectedCompetitions
        return { selectedCompetitions: rest }
      })
      get().markStale({ analysisStale: true, scheduleStale: true })
      autoSuggestRefs(get as GetState, set as SetState)
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
      get().markStale({ analysisStale: true, scheduleStale: true })
      autoSuggestRefs(get as GetState, set as SetState)
    },

    setGlobalOverrides: (partial) => {
      set((state) => ({
        globalOverrides: { ...state.globalOverrides, ...partial },
      }))
      get().markStale({ analysisStale: true, scheduleStale: true })
    },
  }
}

function createUiSlice(set: SetState, _get: GetState): UiSlice {
  return {
    layoutMode: 'wizard',
    wizardStep: 0,
    analysisStale: false,
    scheduleStale: false,

    setLayoutMode: (mode) => set({ layoutMode: mode }),
    setStep: (step) => set({ wizardStep: step }),

    markStale: (flags) => {
      set((state) => ({
        analysisStale: flags.analysisStale ?? state.analysisStale,
        scheduleStale: flags.scheduleStale ?? state.scheduleStale,
      }))
    },

    clearStale: () => set({ analysisStale: false, scheduleStale: false }),
  }
}

/** Ensures dayRefs array is at least `length` elements, filling gaps with defaults. */
export function ensureDayRefs(existing: DayRefConfig[], length: number): DayRefConfig[] {
  if (existing.length >= length) return existing
  return [
    ...existing,
    ...Array.from({ length: length - existing.length }, () => ({ ...DEFAULT_DAY_REF_CONFIG })),
  ]
}

function createRefereeSlice(set: SetState, get: GetState): RefereeSlice {
  return {
    dayRefs: [],
    optimalRefs: [],
    manuallyEditedDays: new Set<number>(),

    setDayRefs: (dayIndex, refs) => {
      set((state) => {
        const extended = ensureDayRefs(state.dayRefs, dayIndex + 1)
        const updated = extended.map((dc, i) =>
          i === dayIndex ? { ...dc, ...refs } : dc,
        )
        const newManual = new Set(state.manuallyEditedDays)
        newManual.add(dayIndex)
        return { dayRefs: updated, manuallyEditedDays: newManual }
      })
      get().markStale({ scheduleStale: true })
    },

    toggleSabreFillin: (dayIndex) => {
      set((state) => {
        const extended = ensureDayRefs(state.dayRefs, dayIndex + 1)
        const updated = extended.map((dc, i) =>
          i === dayIndex ? { ...dc, allow_sabre_ref_fillin: !dc.allow_sabre_ref_fillin } : dc,
        )
        return { dayRefs: updated }
      })
      get().markStale({ scheduleStale: true })
    },

    setOptimalRefs: (refs) => {
      set({ optimalRefs: refs })
    },

    suggestAllRefs: () => {
      const state = get()
      if (state.days_available === 0 || state.strips_total === 0) return
      const suggestion = suggestRefs(
        state.selectedCompetitions,
        state.days_available,
        state.strips_total,
      )
      if (!suggestion) return
      const extended = ensureDayRefs(state.dayRefs, state.days_available)
      const dayRefs = extended.slice(0, state.days_available).map((dc) => ({
        ...dc,
        ...suggestion,
      }))
      set({ dayRefs, manuallyEditedDays: new Set<number>() })
    },
  }
}

function createAnalysisSlice(set: SetState, _get: GetState): AnalysisSlice {
  return {
    validationErrors: [],
    warnings: [],
    suggestions: [],
    flightingSuggestions: [],
    flightingSuggestionStates: [],

    setAnalysisResults: (errors, result) => {
      set({
        validationErrors: errors,
        warnings: result.warnings,
        suggestions: result.suggestions,
        flightingSuggestions: result.flightingSuggestions ?? [],
        flightingSuggestionStates: (result.flightingSuggestions ?? []).map(() => SuggestionState.PENDING),
      })
    },

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

    clearAnalysis: () => {
      set({
        validationErrors: [],
        warnings: [],
        suggestions: [],
        flightingSuggestions: [],
        flightingSuggestionStates: [],
      })
    },
  }
}

function createScheduleSlice(set: SetState, _get: GetState): ScheduleSlice {
  return {
    scheduleResults: {},
    bottlenecks: [],

    setScheduleResults: (results, bottlenecks) => {
      set({ scheduleResults: results, bottlenecks })
    },

    clearSchedule: () => {
      set({ scheduleResults: {}, bottlenecks: [] })
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
  ...createRefereeSlice(set as SetState, get as GetState),
  ...createAnalysisSlice(set as SetState, get as GetState),
  ...createScheduleSlice(set as SetState, get as GetState),
}))
