import { Weapon, BottleneckCause, BottleneckSeverity } from './types.ts'
import type {
  GlobalState,
  TournamentConfig,
  Bottleneck,
  RefsInUseByDay,
} from './types.ts'
import { dayStart } from './types.ts'

// ──────────────────────────────────────────────
// Return types for strip selection and resource windows
// ──────────────────────────────────────────────

export type FindStripsResult =
  | { type: 'FOUND'; stripIndices: number[] }
  | { type: 'WAIT_UNTIL'; waitUntil: number }

export type AllocateRefsResult =
  | { type: 'OK'; bottlenecks: Bottleneck[] }
  | { type: 'INSUFFICIENT' }

export type ResourceWindowResult =
  | { type: 'FOUND'; startTime: number; stripIndices: number[]; bottlenecks: Bottleneck[] }
  | { type: 'NO_WINDOW' }

// ──────────────────────────────────────────────
// createGlobalState
// ──────────────────────────────────────────────

/**
 * Initialises a fresh GlobalState from tournament config.
 * All strips are free at DAY_START_MINS (day 0 start).
 * Refs, schedule, and bottlenecks start empty.
 */
export function createGlobalState(config: TournamentConfig): GlobalState {
  return {
    // Strips become available at the start of day 0 in the scheduling time model
    strip_free_at: config.strips.map(() => dayStart(0, config)),
    refs_in_use_by_day: {},
    schedule: {},
    bottlenecks: [],
  }
}

// ──────────────────────────────────────────────
// Strip allocation helpers
// ──────────────────────────────────────────────

/**
 * Marks the given strip indices as occupied until endTime.
 * Later allocations always win — endTime is set directly (no max-guard needed
 * since the scheduler never allocates a strip that is still busy).
 */
export function allocateStrips(state: GlobalState, stripIds: number[], endTime: number): void {
  for (const idx of stripIds) {
    state.strip_free_at[idx] = endTime
  }
}

/**
 * No-op if the strip's free_at is already past endTime (the release is stale).
 * Only resets to endTime if the strip's current free_at equals endTime exactly,
 * which is the idempotent release case used by the scheduler.
 *
 * In practice this is not called during normal scheduling — strips expire
 * naturally when their free_at is reached. Kept for correctness and testing.
 */
export function releaseStrips(state: GlobalState, stripIds: number[], endTime: number): void {
  // Strips expire naturally via allocateStrips setting free_at. This function exists for
  // completeness but is effectively a no-op in normal scheduling — strip_free_at is already
  // set to the correct end time during allocation. We never roll back a later allocation
  // or advance a strip that's already free.
  for (const idx of stripIds) {
    if (state.strip_free_at[idx] === endTime) {
      // Already at the expected release time — no-op (idempotent)
    }
  }
}

// ──────────────────────────────────────────────
// findAvailableStrips
// ──────────────────────────────────────────────

/**
 * Finds `count` available strip indices at `atTime`, applying video preference rules.
 *
 * PRD Section 10.3:
 * - videoRequired=true: only video-capable strips; WAIT_UNTIL if not enough free
 * - videoRequired=false: prefer non-video strips first (preserves video strips for
 *   phases that need them); falls back to video strips if non-video is insufficient
 *
 * Returns WAIT_UNTIL with the earliest time when enough suitable strips become free.
 */
export function findAvailableStrips(
  state: GlobalState,
  config: TournamentConfig,
  count: number,
  atTime: number,
  videoRequired: boolean,
): FindStripsResult {
  const strips = config.strips
  const freeAt = state.strip_free_at

  if (videoRequired) {
    const candidates = strips
      .map((s, i) => ({ i, s, freeAt: freeAt[i] }))
      .filter(x => x.s.video_capable && x.freeAt <= atTime)

    if (candidates.length >= count) {
      return { type: 'FOUND', stripIndices: candidates.slice(0, count).map(x => x.i) }
    }

    // Not enough video strips free — return earliest time when count video strips will be free
    const videoStrips = strips
      .map((s, i) => ({ i, s, freeAt: freeAt[i] }))
      .filter(x => x.s.video_capable)
      .sort((a, b) => a.freeAt - b.freeAt)

    const waitUntil = videoStrips.length >= count
      ? videoStrips[count - 1].freeAt
      : Infinity
    return { type: 'WAIT_UNTIL', waitUntil }
  }

  // Non-video preferred: collect free non-video strips first, then free video strips
  const freeNonVideo = strips
    .map((s, i) => ({ i, s, freeAt: freeAt[i] }))
    .filter(x => !x.s.video_capable && x.freeAt <= atTime)
    .sort((a, b) => a.freeAt - b.freeAt)

  const freeVideo = strips
    .map((s, i) => ({ i, s, freeAt: freeAt[i] }))
    .filter(x => x.s.video_capable && x.freeAt <= atTime)
    .sort((a, b) => a.freeAt - b.freeAt)

  const candidates = [...freeNonVideo, ...freeVideo]

  if (candidates.length >= count) {
    return { type: 'FOUND', stripIndices: candidates.slice(0, count).map(x => x.i) }
  }

  // Not enough free — find earliest time when `count` strips become free
  const allSorted = strips
    .map((s, i) => ({ i, s, freeAt: freeAt[i] }))
    .sort((a, b) => a.freeAt - b.freeAt)

  const waitUntil = allSorted.length >= count ? allSorted[count - 1].freeAt : Infinity
  return { type: 'WAIT_UNTIL', waitUntil }
}

// ──────────────────────────────────────────────
// Refs per-day state helpers
// ──────────────────────────────────────────────

/**
 * Lazily initialises the per-day ref tracking record if not yet present.
 */
function ensureDayRefs(state: GlobalState, day: number): RefsInUseByDay {
  if (!state.refs_in_use_by_day[day]) {
    state.refs_in_use_by_day[day] = {
      foil_epee_in_use: 0,
      saber_in_use: 0,
      fillin_in_use: 0,
      release_events: [],
    }
  }
  return state.refs_in_use_by_day[day]
}

/**
 * Returns how many foil/epee refs are free (not currently in use) on the given day
 * at the given time, accounting for any release events that have fired by that time.
 *
 * Includes idle saber refs in the available pool (PRD Section 2.3: saber refs can
 * officiate ROW weapons). This is a read-only availability check — actual allocation
 * via allocateRefs always increments the correct pool (foil_epee_in_use). The scheduler
 * is responsible for not over-committing saber refs across concurrent foil/epee and
 * saber phases.
 */
function feRefsFreeAt(day: number, atTime: number, state: GlobalState, config: TournamentConfig): number {
  const avail = config.referee_availability[day]
  if (!avail) return 0
  const dayRefs = state.refs_in_use_by_day[day]
  if (!dayRefs) return avail.foil_epee_refs + avail.saber_refs

  // Count releases that happen at or before atTime
  const released = dayRefs.release_events
    .filter(e => e.time <= atTime && (e.type === 'foil_epee' || e.type === 'fillin'))
    .reduce((sum, e) => sum + e.count, 0)

  const inUse = Math.max(0, dayRefs.foil_epee_in_use + dayRefs.fillin_in_use - released)
  // Saber refs can also officiate foil/epee (PRD Section 2.3)
  const saberReleased = dayRefs.release_events
    .filter(e => e.time <= atTime && e.type === 'saber')
    .reduce((sum, e) => sum + e.count, 0)
  const saberInUse = Math.max(0, dayRefs.saber_in_use - saberReleased)
  const total = avail.foil_epee_refs + avail.saber_refs
  return Math.max(0, total - inUse - saberInUse)
}

/**
 * Returns how many saber refs are free on the given day at atTime.
 */
function saberRefsFreeAt(day: number, atTime: number, state: GlobalState, config: TournamentConfig): number {
  const avail = config.referee_availability[day]
  if (!avail) return 0
  const dayRefs = state.refs_in_use_by_day[day]
  if (!dayRefs) return avail.saber_refs

  const released = dayRefs.release_events
    .filter(e => e.time <= atTime && e.type === 'saber')
    .reduce((sum, e) => sum + e.count, 0)

  return Math.max(0, avail.saber_refs - dayRefs.saber_in_use + released)
}

// ──────────────────────────────────────────────
// allocateRefs / releaseRefs
// ──────────────────────────────────────────────

/**
 * Records ref allocation for a phase: increments in-use counter and
 * appends a release event at endTime so free counts can be computed later.
 *
 * Weapon determines whether foil_epee_in_use or saber_in_use is incremented.
 */
export function allocateRefs(
  state: GlobalState,
  day: number,
  weapon: Weapon,
  count: number,
  _startTime: number,
  endTime: number,
): void {
  const dayRefs = ensureDayRefs(state, day)
  const type: 'foil_epee' | 'saber' = weapon === Weapon.SABRE ? 'saber' : 'foil_epee'

  if (type === 'saber') {
    dayRefs.saber_in_use += count
  } else {
    dayRefs.foil_epee_in_use += count
  }

  dayRefs.release_events.push({ time: endTime, type, count })
}

/**
 * Immediately decrements the in-use counter for the given weapon.
 * Used when a phase completes early or is cancelled.
 * Does not remove the release_event record (harmless double-release is guarded by max(0,...)).
 */
export function releaseRefs(
  state: GlobalState,
  day: number,
  weapon: Weapon,
  count: number,
  _endTime: number,
): void {
  const dayRefs = ensureDayRefs(state, day)
  if (weapon === Weapon.SABRE) {
    dayRefs.saber_in_use = Math.max(0, dayRefs.saber_in_use - count)
  } else {
    dayRefs.foil_epee_in_use = Math.max(0, dayRefs.foil_epee_in_use - count)
  }
}

// ──────────────────────────────────────────────
// allocateRefsForSaber
// ──────────────────────────────────────────────

/**
 * Allocates refs for a saber phase, applying fill-in logic per PRD Section 8.2.
 *
 * - If enough saber refs are free: allocate from saber pool directly.
 * - If not and fill-in is enabled: supplement from foil/epee pool.
 *   Fill-in usage tracked in fillin_in_use separately from saber_in_use.
 * - Returns INSUFFICIENT if neither saber nor combined pool is sufficient.
 *
 * Fill-in does NOT apply to bronze bouts; callers must pass config with
 * allow_saber_ref_fillin=false for bronze bout allocation.
 */
export function allocateRefsForSaber(
  refsNeeded: number,
  start: number,
  end: number,
  day: number,
  state: GlobalState,
  config: TournamentConfig,
  competitionId = '',
  phase = '',
): AllocateRefsResult {
  const saberFree = saberRefsFreeAt(day, start, state, config)
  const bottlenecks: Bottleneck[] = []

  if (saberFree >= refsNeeded) {
    const dayRefs = ensureDayRefs(state, day)
    dayRefs.saber_in_use += refsNeeded
    dayRefs.release_events.push({ time: end, type: 'saber', count: refsNeeded })
    return { type: 'OK', bottlenecks }
  }

  const saberShortfall = refsNeeded - saberFree

  if (config.allow_saber_ref_fillin) {
    const feFree = feRefsFreeAt(day, start, state, config)
    if (saberFree + feFree >= refsNeeded) {
      const dayRefs = ensureDayRefs(state, day)
      if (saberFree > 0) {
        dayRefs.saber_in_use += saberFree
        dayRefs.release_events.push({ time: end, type: 'saber', count: saberFree })
      }
      dayRefs.fillin_in_use += saberShortfall
      dayRefs.release_events.push({ time: end, type: 'fillin', count: saberShortfall })

      bottlenecks.push({
        competition_id: competitionId,
        phase,
        cause: BottleneckCause.SABRE_REF_FILLIN,
        severity: BottleneckSeverity.WARN,
        delay_mins: 0,
        message: `${saberShortfall} foil/epee ref(s) filling saber strips.`,
      })

      return { type: 'OK', bottlenecks }
    }
  }

  return { type: 'INSUFFICIENT' }
}

// ──────────────────────────────────────────────
// snapToSlot
// ──────────────────────────────────────────────

/**
 * Rounds t up to the next 30-minute slot boundary.
 * snapToSlot(0)=0, snapToSlot(15)=30, snapToSlot(30)=30, snapToSlot(31)=60.
 *
 * PRD Section 11.2: applied to phase start times; NOT applied to phase end times.
 */
export function snapToSlot(t: number): number {
  const r = t % 30
  if (r === 0) return t
  return t + (30 - r)
}

// ──────────────────────────────────────────────
// earliestResourceWindow
// ──────────────────────────────────────────────

/**
 * Finds the earliest start time at or after notBefore where both strip and ref
 * requirements can be met simultaneously. PRD Section 11.1.
 *
 * Algorithm:
 * 1. Snap notBefore to slot boundary.
 * 2. Try to find strips at candidate time.
 * 3. If WAIT_UNTIL, advance candidate and retry (bounded by strip count limit).
 * 4. Check ref availability; advance if refs not yet free.
 * 5. Snap resulting time to slot.
 * 6. Emit contention bottlenecks if delay exceeds THRESHOLD_MINS.
 * 7. Return NO_WINDOW if time exceeds DAY_START + LATEST_START_OFFSET or DAY_END.
 *
 * The MAX_RESCHEDULE_ATTEMPTS guard prevents unbounded iteration.
 */
export function earliestResourceWindow(
  stripsNeeded: number,
  refsNeeded: number,
  weapon: Weapon,
  videoRequired: boolean,
  notBefore: number,
  day: number,
  state: GlobalState,
  config: TournamentConfig,
  competitionId: string,
  phase: string,
): ResourceWindowResult {
  const latestStart = dayStart(day, config) + config.LATEST_START_OFFSET
  const dayEndTime = dayStart(day, config) + config.DAY_LENGTH_MINS

  let candidate = snapToSlot(notBefore)

  // Bounded iteration — each iteration must advance candidate; guards against stalls
  const maxAttempts = config.MAX_RESCHEDULE_ATTEMPTS * 2 + 10
  let attempts = 0

  while (attempts < maxAttempts) {
    attempts++

    if (candidate > latestStart || candidate > dayEndTime) {
      return { type: 'NO_WINDOW' }
    }

    const stripResult = findAvailableStrips(state, config, stripsNeeded, candidate, videoRequired)

    if (stripResult.type === 'WAIT_UNTIL') {
      const next = snapToSlot(stripResult.waitUntil)
      if (next <= candidate) {
        // Shouldn't happen, but guard against infinite loop
        return { type: 'NO_WINDOW' }
      }
      candidate = next
      continue
    }

    const selectedStrips = stripResult.stripIndices

    // T_refs: earliest time >= notBefore when sufficient refs are available.
    // Computed from notBefore (not candidate) so refWait accurately reflects
    // whether refs themselves are the source of delay vs. strips being the cause.
    const tRefs = earliestRefsTime(day, weapon, refsNeeded, notBefore, state, config)

    // T is the latest of: candidate, all selected strip free_at values, and ref availability
    const stripFreeMax = selectedStrips.reduce(
      (max, i) => Math.max(max, state.strip_free_at[i]),
      0,
    )
    const T = snapToSlot(Math.max(candidate, stripFreeMax, tRefs))

    if (T > latestStart || T > dayEndTime) {
      return { type: 'NO_WINDOW' }
    }

    // Verify strips are still available at T (they may have been claimed by a concurrent phase)
    const verifyResult = findAvailableStrips(state, config, stripsNeeded, T, videoRequired)
    if (verifyResult.type === 'WAIT_UNTIL') {
      const next = snapToSlot(verifyResult.waitUntil)
      if (next <= candidate) return { type: 'NO_WINDOW' }
      candidate = next
      continue
    }

    // Compute bottlenecks for contention delays
    const delay = T - notBefore
    const bottlenecks: Bottleneck[] = []

    if (delay >= config.THRESHOLD_MINS) {
      const stripWait = Math.max(0, stripFreeMax - notBefore)
      const refWait = Math.max(0, tRefs - notBefore)

      let cause: BottleneckCause
      if (stripWait > 0 && refWait > 0) {
        cause = BottleneckCause.STRIP_AND_REFEREE_CONTENTION
      } else if (stripWait > 0) {
        cause = BottleneckCause.STRIP_CONTENTION
      } else {
        cause = BottleneckCause.REFEREE_CONTENTION
      }

      bottlenecks.push({
        competition_id: competitionId,
        phase,
        cause,
        severity: BottleneckSeverity.WARN,
        delay_mins: delay,
        message: `${competitionId} ${phase}: delayed ${delay} min due to resource contention`,
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

  return { type: 'NO_WINDOW' }
}

/**
 * Returns the earliest time >= atTime when the required number of refs
 * are free for the given weapon on the given day.
 *
 * Scans release events in chronological order to find when enough refs
 * come free. If refs are already available at atTime, returns atTime.
 */
function earliestRefsTime(
  day: number,
  weapon: Weapon,
  refsNeeded: number,
  atTime: number,
  state: GlobalState,
  config: TournamentConfig,
): number {
  const avail = config.referee_availability[day]
  if (!avail) return atTime

  const dayRefs = state.refs_in_use_by_day[day]
  if (!dayRefs) return atTime // no refs allocated yet — all free

  // Compute current free count for weapon at atTime
  const freeNow = weapon === Weapon.SABRE
    ? saberRefsFreeAt(day, atTime, state, config)
    : feRefsFreeAt(day, atTime, state, config)

  if (freeNow >= refsNeeded) return atTime

  // Find future release events that increase free count enough
  // Sort events by time and walk forward until we have enough refs
  const futureReleases = dayRefs.release_events
    .filter(e => e.time > atTime)
    .sort((a, b) => a.time - b.time)

  let accumulatedFree = freeNow
  for (const event of futureReleases) {
    const isRelevant = weapon === Weapon.SABRE
      ? event.type === 'saber'
      : event.type === 'foil_epee' || event.type === 'fillin' || event.type === 'saber'
    if (isRelevant) {
      accumulatedFree += event.count
      if (accumulatedFree >= refsNeeded) return event.time
    }
  }

  // No future release makes enough refs available — return far future
  return Infinity
}
