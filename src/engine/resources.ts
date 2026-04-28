import { Phase } from './types.ts'
import type {
  GlobalState,
  TournamentConfig,
  StripAllocation,
} from './types.ts'
import { dayStart, dayEnd } from './types.ts'
import { SLOT_MINS } from './constants.ts'

// ──────────────────────────────────────────────
// Return types for strip selection
// ──────────────────────────────────────────────

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
 * B's pod-aware rollback where it pays off.
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
 * allocation overlaps [T, T + duration]. We compute this as
 * `max(startTime, nextFreeTime(strip))`: the strip becomes free for any
 * duration once its last allocation ends.
 */
function earliestFreeStartFor(state: GlobalState, stripIdx: number, startTime: number): number {
  return Math.max(startTime, nextFreeTime(state, stripIdx))
}

/**
 * Find `count` strips simultaneously available for `[startTime, startTime+duration]`,
 * honoring video preferences.
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
 */
export function findAvailableStripsInWindow(
  state: GlobalState,
  config: TournamentConfig,
  count: number,
  startTime: number,
  duration: number,
  videoRequired: boolean,
  day?: number,
): FindStripsInWindowResult {
  const endTime = startTime + duration
  const strips = config.strips

  // Build the candidate strip set per video preference rules.
  let candidatesAll: number[]
  if (videoRequired) {
    candidatesAll = strips.map((s, i) => s.video_capable ? i : -1).filter(i => i >= 0)
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
