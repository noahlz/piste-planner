import { BottleneckCause, BottleneckSeverity, Phase } from './types.ts'
import type {
  GlobalState,
  TournamentConfig,
  Bottleneck,
  RefDemandByDay,
  RefDemandInterval,
  EventTxLog,
  Strip,
  StripAllocation,
  Weapon,
} from './types.ts'
import { dayStart, dayEnd } from './types.ts'
import { MORNING_WAVE_WINDOW_MINS, SLOT_MINS } from './constants.ts'

// ──────────────────────────────────────────────
// PoolContext — video-strip preservation for pool phases
// ──────────────────────────────────────────────

/**
 * Passed by pool-phase callers into findAvailableStrips and earliestResourceWindow
 * to enable the video-strip-preservation rule (METHODOLOGY.md §Video Strip Preservation).
 *
 * When isPoolPhase=true the rule applies: video strips may only be used as overflow
 * during the morning wave OR when the event is the only one on its day. Outside those
 * conditions, pools are restricted to non-video strips only.
 */
export type PoolContext = {
  /** Must be true to activate the video-strip restriction for pools. */
  isPoolPhase: boolean
  /** True when only one competition is scheduled on this day. */
  isSingleEventDay: boolean
  /** Day index (0-based) — used to compute the morning-wave boundary. */
  day: number
}

// ──────────────────────────────────────────────
// Return types for strip selection and resource windows
// ──────────────────────────────────────────────

type FindStripsResult =
  | { type: 'FOUND'; stripIndices: number[] }
  | { type: 'WAIT_UNTIL'; waitUntil: number }

export type NoWindowReason =
  | { kind: 'STRIPS'; needed: number; available: number; earliest_free: number }
  | { kind: 'TIME'; candidate: number; latest_start: number }

export type ResourceWindowResult =
  | { type: 'FOUND'; startTime: number; stripIndices: number[]; bottlenecks: Bottleneck[] }
  | { type: 'NO_WINDOW'; reason?: NoWindowReason }

/**
 * Result of findAvailableStripsInWindow. On a hit, returns the selected strip
 * indices. On a miss, the discriminated `reason` tells callers whether the strip
 * pool was full (`STRIPS`) or the day-window expired (`TIME`), and
 * `earliest_next_start` carries the soonest moment `count` strips of the right
 * kind become simultaneously free — or `null` if no such slice exists.
 */
export type FindStripsInWindowResult =
  | { fit: 'ok'; strip_indices: number[] }
  | { fit: 'none'; earliest_next_start: number | null; reason: 'STRIPS' | 'TIME' }

// ──────────────────────────────────────────────
// nextFreeTime — bridge between interval list and "is this strip free at T?"
// ──────────────────────────────────────────────

/**
 * Returns the earliest time at which the given strip is free, computed as the
 * latest `end_time` across all of the strip's existing allocations (or 0 if the
 * strip has never been allocated).
 *
 * Because the allocation list is kept sorted by start_time (not by end_time),
 * we must walk the whole list to find the maximum end_time. In practice the
 * lists are short (a handful of allocations per strip per tournament).
 */
export function nextFreeTime(state: GlobalState, strip_index: number): number {
  const list = state.strip_allocations[strip_index]
  if (!list || list.length === 0) return 0
  let max = 0
  for (let i = 0; i < list.length; i++) {
    if (list[i].end_time > max) max = list[i].end_time
  }
  return max
}

// ──────────────────────────────────────────────
// snapshotState / restoreState
// ──────────────────────────────────────────────

/**
 * Creates a targeted snapshot of mutable GlobalState fields for rollback during
 * retry loops. Avoids JSON.parse/stringify overhead by cloning only what changes:
 *
 * - strip_allocations: each strip's interval list is shallow-copied so rollback
 *   via txLog (object identity splice) is unaffected — the StripAllocation
 *   objects themselves are write-once / immutable, shared across snapshot and
 *   live state intentionally.
 * - ref_demand_by_day: each day's intervals array is shallow-copied so rollback via
 *   txLog (object identity splice) is unaffected — the interval objects themselves
 *   are shared across snapshot and live state, which is intentional.
 * - schedule: shallow Record copy (ScheduleResult objects are write-once / immutable)
 * - bottlenecks: shallow array copy (Bottleneck objects are write-once / immutable)
 */
export function snapshotState(state: GlobalState): GlobalState {
  const refs: GlobalState['ref_demand_by_day'] = {}
  for (const dayKey of Object.keys(state.ref_demand_by_day)) {
    const day = Number(dayKey)
    refs[day] = { intervals: [...state.ref_demand_by_day[day].intervals] }
  }
  return {
    strip_allocations: state.strip_allocations.map(arr => [...arr]),
    ref_demand_by_day: refs,
    schedule: { ...state.schedule },
    bottlenecks: [...state.bottlenecks],
  }
}

/**
 * Restores a GlobalState in-place to match a snapshot produced by snapshotState.
 * Mutates target so that callers holding a reference to the original state object
 * see the rolled-back values (scheduleOne passes state by reference).
 */
export function restoreState(target: GlobalState, snapshot: GlobalState): void {
  target.strip_allocations = snapshot.strip_allocations
  target.ref_demand_by_day = snapshot.ref_demand_by_day
  target.schedule = snapshot.schedule
  target.bottlenecks = snapshot.bottlenecks
}

// ──────────────────────────────────────────────
// createGlobalState
// ──────────────────────────────────────────────

/**
 * Initialises a fresh GlobalState from tournament config.
 * All strips have empty allocation lists.
 * Refs, schedule, and bottlenecks start empty.
 */
export function createGlobalState(config: TournamentConfig): GlobalState {
  return {
    strip_allocations: config.strips.map(() => []),
    ref_demand_by_day: {},
    schedule: {},
    bottlenecks: [],
  }
}

// ──────────────────────────────────────────────
// Interval-list primitives
// ──────────────────────────────────────────────

/**
 * Inserts a single StripAllocation into one strip's list at the correct sorted
 * position (sorted by start_time). Shared by allocateInterval — kept as a
 * function so future callers can append one entry at a time without rebuilding
 * the list.
 */
function insertSorted(list: StripAllocation[], allocation: StripAllocation): void {
  // Lists are short — linear scan from the end is fast and keeps the code simple.
  let i = list.length - 1
  while (i >= 0 && list[i].start_time > allocation.start_time) i--
  list.splice(i + 1, 0, allocation)
}

/**
 * Appends one StripAllocation entry to each of the given strips' lists, keeping
 * each list sorted by start_time. The shared-object pattern is set up for Phase
 * B's pod-aware rollback where it pays off, while Phase A's rollback API is
 * `releaseEventAllocations` which iterates by `event_id` and does not rely on
 * object identity. The separate `allocateStrips` + txLog flow uses object-identity
 * rollback via `rollbackEvent`, which `allocateInterval` does not participate in.
 */
export function allocateInterval(
  state: GlobalState,
  event_id: string,
  phase: Phase,
  strip_indices: number[],
  start_time: number,
  end_time: number,
  pod_id?: string,
): void {
  const allocation: StripAllocation = pod_id !== undefined
    ? { event_id, phase, pod_id, start_time, end_time }
    : { event_id, phase, start_time, end_time }
  for (const idx of strip_indices) {
    insertSorted(state.strip_allocations[idx], allocation)
  }
}

/**
 * Removes every StripAllocation entry across all strips whose `event_id` matches.
 * Order-independent — does not depend on a txLog. Also deletes the schedule
 * entry and removes bottlenecks for the event.
 *
 * Strip allocations and the schedule entry are always filtered by `event_id` only.
 *
 * Bottleneck filtering depends on whether `attempt_id` is supplied:
 * - When `attempt_id` is omitted (undefined): all bottlenecks matching
 *   `competition_id === event_id` are removed, regardless of any `attempt_id`
 *   field on them. This preserves Phase A / serial-scheduler semantics.
 * - When `attempt_id` is supplied: only bottlenecks where BOTH
 *   `competition_id === event_id` AND `entry.attempt_id === attempt_id` match
 *   are removed. Bottlenecks without an `attempt_id` field are NOT removed —
 *   they belong to non-retry emission paths and must persist.
 *
 * `ref_demand_by_day` is intentionally not touched; ref demand is derived post-schedule.
 */
export function releaseEventAllocations(state: GlobalState, event_id: string, attempt_id?: number): void {
  for (const list of state.strip_allocations) {
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].event_id === event_id) list.splice(i, 1)
    }
  }
  delete state.schedule[event_id]
  for (let i = state.bottlenecks.length - 1; i >= 0; i--) {
    const entry = state.bottlenecks[i]
    if (entry.competition_id !== event_id) continue
    if (attempt_id === undefined || entry.attempt_id === attempt_id) {
      state.bottlenecks.splice(i, 1)
    }
  }
}

// ──────────────────────────────────────────────
// Strip allocation helpers
// ──────────────────────────────────────────────

/**
 * Records the given strips as occupied for [startTime, endTime] under
 * (eventId, phase). Pushes a single StripAllocation entry into each strip's
 * sorted list and, when txLog is provided, records the entry's object identity
 * so rollbackEvent can splice it out.
 *
 * Each StripAllocation is a write-once record — later allocations on the same
 * strip add another interval rather than overwriting.
 */
export function allocateStrips(
  state: GlobalState,
  stripIds: number[],
  startTime: number,
  endTime: number,
  eventId: string,
  phase: Phase,
  txLog?: EventTxLog,
): void {
  // Build a single allocation object shared by every strip in this call.
  const allocation: StripAllocation = { event_id: eventId, phase, start_time: startTime, end_time: endTime }
  for (const idx of stripIds) {
    insertSorted(state.strip_allocations[idx], allocation)
    if (txLog) {
      txLog.stripAllocationsAdded.push({ stripIdx: idx, allocation })
    }
  }
}

// ──────────────────────────────────────────────
// findAvailableStrips
// ──────────────────────────────────────────────

/**
 * Finds `count` available strip indices at `atTime`, applying video preference rules.
 *
 * METHODOLOGY.md §Video Strip Preservation:
 * - videoRequired=true: only video-capable strips; WAIT_UNTIL if not enough free
 * - videoRequired=false: prefer non-video strips first (preserves video strips for
 *   phases that need them); falls back to video strips if non-video is insufficient
 *
 * When poolContext is provided with isPoolPhase=true, the pool video-strip rule applies:
 * video strips are excluded as overflow UNLESS the candidate time is within the morning
 * wave (atTime <= dayStart(day) + MORNING_WAVE_WINDOW_MINS) OR isSingleEventDay=true.
 * If excluded and insufficient non-video strips are free, returns WAIT_UNTIL based on
 * non-video release times (Infinity if there are never enough non-video strips).
 *
 * Returns WAIT_UNTIL with the earliest time when enough suitable strips become free.
 *
 * This function is a thin shim that reads via `nextFreeTime` so the serial
 * scheduler keeps working unchanged. Phase D removes it in favor of
 * `findAvailableStripsInWindow`.
 */
type IndexedStrip = { i: number; s: Strip; freeAt: number }

/**
 * Annotate each strip with its index and current next-free time. Sorts by freeAt
 * when sort=true so callers can pick the earliest-free strips.
 */
function indexStrips(
  state: GlobalState,
  strips: readonly Strip[],
  predicate: (s: Strip, freeAt: number) => boolean,
  sort = false,
): IndexedStrip[] {
  const result: IndexedStrip[] = []
  for (let i = 0; i < strips.length; i++) {
    const freeAt = nextFreeTime(state, i)
    if (predicate(strips[i], freeAt)) result.push({ i, s: strips[i], freeAt })
  }
  return sort ? result.sort((a, b) => a.freeAt - b.freeAt) : result
}

/** Earliest time `count` strips matching the predicate become free, or Infinity. */
function waitUntilForCount(
  state: GlobalState,
  strips: readonly Strip[],
  count: number,
  predicate: (s: Strip) => boolean,
): number {
  const sorted = indexStrips(state, strips, (s) => predicate(s), true)
  return sorted.length >= count ? sorted[count - 1].freeAt : Infinity
}

export function findAvailableStrips(
  state: GlobalState,
  config: TournamentConfig,
  count: number,
  atTime: number,
  videoRequired: boolean,
  poolContext?: PoolContext,
): FindStripsResult {
  const strips = config.strips

  if (videoRequired) {
    const candidates = indexStrips(state, strips, (s, t) => s.video_capable && t <= atTime)
    if (candidates.length >= count) {
      return { type: 'FOUND', stripIndices: candidates.slice(0, count).map(x => x.i) }
    }
    return { type: 'WAIT_UNTIL', waitUntil: waitUntilForCount(state, strips, count, (s) => s.video_capable) }
  }

  // Pool video-strip preservation rule:
  // When isPoolPhase=true, video strips are excluded unless we're in the morning wave
  // or this is the only event on the day.
  const applyPoolVideoExclusion = poolContext?.isPoolPhase === true
    && !poolContext.isSingleEventDay
    && atTime > dayStart(poolContext.day, config) + MORNING_WAVE_WINDOW_MINS

  if (applyPoolVideoExclusion) {
    // Non-video strips only — exclude video entirely
    const freeNonVideo = indexStrips(state, strips, (s, t) => !s.video_capable && t <= atTime, true)
    if (freeNonVideo.length >= count) {
      return { type: 'FOUND', stripIndices: freeNonVideo.slice(0, count).map(x => x.i) }
    }
    return { type: 'WAIT_UNTIL', waitUntil: waitUntilForCount(state, strips, count, (s) => !s.video_capable) }
  }

  // Non-video preferred: collect free non-video strips first, then free video strips
  const freeNonVideo = indexStrips(state, strips, (s, t) => !s.video_capable && t <= atTime, true)
  const freeVideo = indexStrips(state, strips, (s, t) => s.video_capable && t <= atTime, true)
  const candidates = [...freeNonVideo, ...freeVideo]

  if (candidates.length >= count) {
    return { type: 'FOUND', stripIndices: candidates.slice(0, count).map(x => x.i) }
  }

  return { type: 'WAIT_UNTIL', waitUntil: waitUntilForCount(state, strips, count, () => true) }
}

// ──────────────────────────────────────────────
// findAvailableStripsInWindow — interval-aware primitive
// ──────────────────────────────────────────────

/**
 * Returns true if the given strip has any allocation that overlaps
 * [startTime, startTime + duration]. Overlap is defined as
 * `existing.start_time < endTime && existing.end_time > startTime` — touching
 * intervals (e.g. one ends at T and another starts at T) do not overlap.
 */
function stripOverlapsWindow(
  state: GlobalState,
  stripIdx: number,
  startTime: number,
  endTime: number,
): boolean {
  const list = state.strip_allocations[stripIdx]
  if (!list) return false
  for (let i = 0; i < list.length; i++) {
    const a = list[i]
    if (a.start_time < endTime && a.end_time > startTime) return true
    // Lists are sorted by start_time; once start_time >= endTime no further
    // entries can overlap.
    if (a.start_time >= endTime) break
  }
  return false
}

/**
 * The earliest time at or after `startTime` at which this strip becomes free
 * for `duration` minutes — i.e. the smallest T ≥ startTime such that no
 * allocation overlaps [T, T + duration]. For Phase A's helper-layer use, we
 * compute this as `max(startTime, nextFreeTime(strip))`: the strip becomes free
 * for any duration once its last allocation ends.
 */
function earliestFreeStartFor(state: GlobalState, stripIdx: number, startTime: number): number {
  return Math.max(startTime, nextFreeTime(state, stripIdx))
}

/**
 * Find `count` strips simultaneously available for `[startTime, startTime+duration]`,
 * honoring video preferences and the pool video-strip-preservation rule.
 *
 * On a miss (`fit: 'none'`):
 * - `reason: 'STRIPS'` — not enough strips of the right kind exist (or every
 *   candidate has at least one allocation overlapping the window).
 * - `earliest_next_start` — the soonest moment at which `count` strips of the
 *   right kind become simultaneously free for `duration` minutes, computed as
 *   the count-th smallest `earliestFreeStartFor` across candidate strips. Returns
 *   `null` when fewer than `count` candidate strips exist.
 *
 * The optional `day` parameter is the tournament day index used to compute the
 * day-end clamp via `dayEnd(day, config)`. When omitted, the helper falls back
 * to inferring the day from `floor(startTime / DAY_LENGTH_MINS)` and computes
 * the day-end as `dayStart(inferredDay, config) + DAY_LENGTH_MINS`. The
 * inference is approximate and only correct under uniform days — pass `day`
 * explicitly whenever `dayConfigs` may override `day_start_time` /
 * `day_end_time`.
 *
 * Phase A note: this primitive is currently used only by the new tests, while
 * the serial scheduler calls `findAvailableStrips` / `earliestResourceWindow`
 * and Phase C wires it into the concurrent scheduler.
 */
export function findAvailableStripsInWindow(
  state: GlobalState,
  config: TournamentConfig,
  count: number,
  startTime: number,
  duration: number,
  videoRequired: boolean,
  poolContext?: PoolContext,
  day?: number,
): FindStripsInWindowResult {
  const endTime = startTime + duration
  const strips = config.strips

  // Build the candidate strip set per the same rules as findAvailableStrips.
  const applyPoolVideoExclusion = poolContext?.isPoolPhase === true
    && !poolContext.isSingleEventDay
    && startTime > dayStart(poolContext.day, config) + MORNING_WAVE_WINDOW_MINS

  // Predicate decides which strips are eligible at all (independent of busy/free).
  let candidatesAll: number[]
  if (videoRequired) {
    candidatesAll = strips.map((s, i) => s.video_capable ? i : -1).filter(i => i >= 0)
  } else if (applyPoolVideoExclusion) {
    candidatesAll = strips.map((s, i) => !s.video_capable ? i : -1).filter(i => i >= 0)
  } else {
    // Non-video preferred — split so we can prefer non-video first
    const nonVideo = strips.map((s, i) => !s.video_capable ? i : -1).filter(i => i >= 0)
    const video = strips.map((s, i) => s.video_capable ? i : -1).filter(i => i >= 0)
    candidatesAll = [...nonVideo, ...video]
  }

  // Hit: pick the first `count` candidates whose interval lists do not overlap
  // [startTime, endTime].
  const free: number[] = []
  for (const i of candidatesAll) {
    if (!stripOverlapsWindow(state, i, startTime, endTime)) free.push(i)
    if (free.length === count) break
  }
  if (free.length === count) {
    return { fit: 'ok', strip_indices: free }
  }

  // Miss — compute earliest_next_start.
  if (candidatesAll.length < count) {
    return { fit: 'none', earliest_next_start: null, reason: 'STRIPS' }
  }

  const earliestPerStrip = candidatesAll.map(i => earliestFreeStartFor(state, i, startTime))
  earliestPerStrip.sort((a, b) => a - b)
  const candidate = earliestPerStrip[count - 1]

  if (!isFinite(candidate)) {
    return { fit: 'none', earliest_next_start: null, reason: 'STRIPS' }
  }

  // Determine reason: TIME if the candidate would push us past the assigned
  // day's hard end, STRIPS otherwise. When `day` is supplied we honor per-day
  // overrides via dayEnd(); otherwise we fall back to inferring the day from
  // startTime and computing dayStart(inferredDay) + DAY_LENGTH_MINS, which is
  // only correct under uniform days.
  const dayHardEnd = day !== undefined
    ? dayEnd(day, config)
    : dayStart(
        Math.max(0, Math.floor(startTime / Math.max(config.DAY_LENGTH_MINS, 1))),
        config,
      ) + config.DAY_LENGTH_MINS
  const reason: 'STRIPS' | 'TIME' = candidate + duration > dayHardEnd ? 'TIME' : 'STRIPS'

  return { fit: 'none', earliest_next_start: candidate, reason }
}

// ──────────────────────────────────────────────
// peakConcurrentStrips — sweep-line over allocation intervals
// ──────────────────────────────────────────────

/**
 * Returns the peak concurrent strip occupancy within `window`, separated into
 * total strips and the video-strip subset. Walks every allocation across every
 * strip in the state; small N keeps this cheap.
 *
 * Used by Phase B's referee-staffing layer (replaces the existing sweep-line on
 * RefDemandInterval[]) and by post-schedule capacity reporting.
 */
export function peakConcurrentStrips(
  state: GlobalState,
  config: TournamentConfig,
  window: { start: number; end: number },
): { total: number; video: number } {
  type Event = { time: number; deltaTotal: number; deltaVideo: number }
  const events: Event[] = []

  for (let i = 0; i < state.strip_allocations.length; i++) {
    const isVideo = config.strips[i]?.video_capable === true
    const list = state.strip_allocations[i]
    for (const a of list) {
      // Allocation overlaps window?
      if (a.start_time >= window.end || a.end_time <= window.start) continue
      const start = Math.max(a.start_time, window.start)
      const end = Math.min(a.end_time, window.end)
      events.push({ time: start, deltaTotal: 1, deltaVideo: isVideo ? 1 : 0 })
      events.push({ time: end, deltaTotal: -1, deltaVideo: isVideo ? -1 : 0 })
    }
  }

  // Sort: ascending by time. End events (negative delta) before start events at
  // the same instant so touching intervals do not double-count.
  events.sort((a, b) => a.time - b.time || a.deltaTotal - b.deltaTotal)

  let curTotal = 0
  let curVideo = 0
  let peakTotal = 0
  let peakVideo = 0
  for (const e of events) {
    curTotal += e.deltaTotal
    curVideo += e.deltaVideo
    if (curTotal > peakTotal) peakTotal = curTotal
    if (curVideo > peakVideo) peakVideo = curVideo
  }
  return { total: peakTotal, video: peakVideo }
}

// ──────────────────────────────────────────────
// Refs per-day state helpers
// ──────────────────────────────────────────────

/**
 * Lazily initialises the per-day ref demand record if not yet present.
 */
function ensureDayRefs(state: GlobalState, day: number): RefDemandByDay {
  if (!state.ref_demand_by_day[day]) {
    state.ref_demand_by_day[day] = { intervals: [] }
  }
  return state.ref_demand_by_day[day]
}

// ──────────────────────────────────────────────
// allocateRefs
// ──────────────────────────────────────────────

/**
 * Records ref allocation for a phase by pushing a RefDemandInterval into the
 * day's intervals array. The interval records ref demand for post-schedule reporting
 * (computeRefRequirements sweep-line analysis).
 *
 * If txLog is provided, the pushed interval object reference is recorded so
 * rollbackEvent can splice it out by identity.
 */
export function allocateRefs(
  state: GlobalState,
  day: number,
  weapon: Weapon,
  count: number,
  startTime: number,
  endTime: number,
  txLog?: EventTxLog,
): void {
  const dayRefs = ensureDayRefs(state, day)
  const interval: RefDemandInterval = { startTime, endTime, count, weapon }
  dayRefs.intervals.push(interval)

  if (txLog) {
    txLog.refEvents.push({ day, event: interval })
  }
}

/**
 * Reverses all strip and ref allocations recorded in txLog.
 *
 * Strip allocations: splice out each recorded allocation by object identity
 * across all strips it was added to. Order-independent (the interval list is
 * fully reconstructable from remaining entries).
 *
 * Ref changes: find-and-remove the recorded RefDemandInterval by object identity.
 * Object-reference tracking is required for phase-major scheduling where multiple
 * events' txLogs interleave entries in the same intervals array — positional indices
 * recorded by one event would be shifted by concurrent rollbacks.
 */
export function rollbackEvent(state: GlobalState, txLog: EventTxLog): void {
  // Remove strip allocations in reverse order (no semantic dependence, but keeps
  // the iteration shape symmetric with the txLog).
  for (let i = txLog.stripAllocationsAdded.length - 1; i >= 0; i--) {
    const { stripIdx, allocation } = txLog.stripAllocationsAdded[i]
    const list = state.strip_allocations[stripIdx]
    if (!list) continue
    const idx = list.indexOf(allocation)
    if (idx >= 0) list.splice(idx, 1)
  }

  // Remove ref intervals by object identity
  for (let i = txLog.refEvents.length - 1; i >= 0; i--) {
    const { day, event } = txLog.refEvents[i]
    const dayRefs = state.ref_demand_by_day[day]
    if (!dayRefs) continue

    const idx = dayRefs.intervals.indexOf(event)
    if (idx >= 0) {
      dayRefs.intervals.splice(idx, 1)
    }
  }

  txLog.stripAllocationsAdded = []
  txLog.refEvents = []
}

// ──────────────────────────────────────────────
// snapToSlot
// ──────────────────────────────────────────────

/**
 * Rounds t up to the next SLOT_MINS boundary.
 * snapToSlot(0)=0, snapToSlot(15)=30, snapToSlot(30)=30, snapToSlot(31)=60.
 *
 * METHODOLOGY.md §Slot Granularity: applied to phase start times; NOT applied to phase end times.
 */
export function snapToSlot(t: number): number {
  const r = t % SLOT_MINS
  if (r === 0) return t
  return t + (SLOT_MINS - r)
}

// ──────────────────────────────────────────────
// NO_WINDOW diagnostic helpers
// ──────────────────────────────────────────────

/**
 * Counts how many strips are free at `atTime`, optionally filtering to video-capable strips only.
 */
function countFreeStrips(
  state: GlobalState,
  config: TournamentConfig,
  atTime: number,
  videoRequired: boolean,
): number {
  let n = 0
  for (let i = 0; i < config.strips.length; i++) {
    const s = config.strips[i]
    if ((!videoRequired || s.video_capable) && nextFreeTime(state, i) <= atTime) n++
  }
  return n
}

/**
 * Determines the limiting NoWindowReason when no window could be found.
 * Returns TIME if the candidate is already past the deadline, otherwise STRIPS.
 */
function diagNoWindowReason(
  candidate: number,
  latestStart: number,
  stripsNeeded: number,
  stripsAvailable: number,
  lastStripFreeMax: number,
): NoWindowReason {
  if (candidate > latestStart) {
    return { kind: 'TIME', candidate, latest_start: latestStart }
  }
  return { kind: 'STRIPS', needed: stripsNeeded, available: stripsAvailable, earliest_free: lastStripFreeMax }
}

// ──────────────────────────────────────────────
// earliestResourceWindow
// ──────────────────────────────────────────────

/**
 * Finds the earliest start time at or after notBefore where strip requirements
 * can be met. Refs are always assumed available — only strips and time gate scheduling.
 * METHODOLOGY.md §Resource Windows.
 *
 * Algorithm:
 * 1. Snap notBefore to slot boundary.
 * 2. Try to find strips at candidate time.
 * 3. If WAIT_UNTIL, advance candidate and retry (bounded by strip count limit).
 * 4. Snap resulting time to slot.
 * 5. Emit STRIP_CONTENTION bottleneck if delay exceeds THRESHOLD_MINS.
 * 6. Return NO_WINDOW if time exceeds DAY_START + LATEST_START_OFFSET or DAY_END.
 *
 * The MAX_RESCHEDULE_ATTEMPTS guard prevents unbounded iteration.
 *
 * Reads strip availability via `nextFreeTime` so the underlying interval-list
 * representation is opaque to the serial scheduler.
 */
export function earliestResourceWindow(
  stripsNeeded: number,
  videoRequired: boolean,
  notBefore: number,
  day: number,
  state: GlobalState,
  config: TournamentConfig,
  competitionId: string,
  phase: Phase,
  poolContext?: PoolContext,
): ResourceWindowResult {
  const latestStart = dayStart(day, config) + config.LATEST_START_OFFSET
  const dayEndTime = dayStart(day, config) + config.DAY_LENGTH_MINS

  const buildNoWindow = (cand: number, stripFreeMax: number): ResourceWindowResult => ({
    type: 'NO_WINDOW',
    reason: diagNoWindowReason(
      cand,
      latestStart,
      stripsNeeded,
      countFreeStrips(state, config, cand, videoRequired),
      stripFreeMax,
    ),
  })

  let candidate = snapToSlot(notBefore)

  // Resource-window search uses more attempts than the outer reschedule loop (MAX_RESCHEDULE_ATTEMPTS)
  // because each 30-min slot scan may need multiple probes to find strip availability.
  // The multiplier and offset provide headroom for dense schedules.
  // Each iteration must advance candidate to guard against stalls.
  const maxAttempts = config.MAX_RESCHEDULE_ATTEMPTS * 2 + 10
  let attempts = 0

  // Hoisted to capture the last known strip free time for diagnostics on loop exhaustion.
  let lastStripFreeMax = 0

  while (attempts < maxAttempts) {
    attempts++

    if (candidate > latestStart || candidate > dayEndTime) {
      return {
        type: 'NO_WINDOW',
        reason: { kind: 'TIME', candidate, latest_start: latestStart },
      }
    }

    const stripResult = findAvailableStrips(state, config, stripsNeeded, candidate, videoRequired, poolContext)

    if (stripResult.type === 'WAIT_UNTIL') {
      const next = snapToSlot(stripResult.waitUntil)
      if (next <= candidate) {
        // Shouldn't happen, but guard against infinite loop
        return {
          type: 'NO_WINDOW',
          reason: {
            kind: 'STRIPS',
            needed: stripsNeeded,
            available: countFreeStrips(state, config, candidate, videoRequired),
            earliest_free: stripResult.waitUntil,
          },
        }
      }
      candidate = next
      continue
    }

    const selectedStrips = stripResult.stripIndices

    // T is the latest of: candidate and all selected strip free_at values
    const stripFreeMax = selectedStrips.reduce(
      (max, i) => Math.max(max, nextFreeTime(state, i)),
      0,
    )
    lastStripFreeMax = stripFreeMax

    const T = snapToSlot(Math.max(candidate, stripFreeMax))

    if (T > latestStart || T > dayEndTime) {
      return buildNoWindow(candidate, stripFreeMax)
    }

    // Verify strips are still available at T (they may have been claimed by a concurrent phase)
    const verifyResult = findAvailableStrips(state, config, stripsNeeded, T, videoRequired, poolContext)
    if (verifyResult.type === 'WAIT_UNTIL') {
      const next = snapToSlot(verifyResult.waitUntil)
      if (next <= candidate) {
        return {
          type: 'NO_WINDOW',
          reason: {
            kind: 'STRIPS',
            needed: stripsNeeded,
            available: countFreeStrips(state, config, T, videoRequired),
            earliest_free: verifyResult.waitUntil,
          },
        }
      }
      candidate = next
      continue
    }

    // Compute bottlenecks for contention delays
    const delay = T - notBefore
    const bottlenecks: Bottleneck[] = []

    if (delay >= config.THRESHOLD_MINS) {
      bottlenecks.push({
        competition_id: competitionId,
        phase,
        cause: BottleneckCause.STRIP_CONTENTION,
        severity: BottleneckSeverity.WARN,
        delay_mins: delay,
        message: `${competitionId} ${phase}: delayed ${delay} min due to strip contention`,
      })

      if (videoRequired) {
        bottlenecks.push({
          competition_id: competitionId,
          phase,
          cause: BottleneckCause.VIDEO_STRIP_CONTENTION,
          severity: BottleneckSeverity.WARN,
          delay_mins: delay,
          message: `${competitionId} ${phase}: video strip contention caused ${delay} min delay`,
        })
      }
    }

    return {
      type: 'FOUND',
      startTime: T,
      stripIndices: verifyResult.stripIndices,
      bottlenecks,
    }
  }

  return buildNoWindow(candidate, lastStripFreeMax)
}
