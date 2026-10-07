/**
 * The one rule for a phase the scheduler could not seat (017 spec §3, §5): a
 * phase with strips to claim and time to run, for which the run recorded no
 * strip allocation. The engine's pinned-unclaimed case is exactly this, since
 * a pinned phase that finds no free strips still keeps its times in the result
 * but claims nothing. `stripSearch.ts` (Suggest), the store's kept run and the
 * drawn model all read it, so they cannot disagree about what is unplaced.
 *
 * Pure: reads a `ScheduleResult` and the allocations, imports no store, no
 * React and nothing from the scheduler.
 */

import { Phase, VideoPolicy } from './types.ts'
import type { Competition, ScheduleResult, StripAllocation } from './types.ts'

/** One phase of an event as the scheduler timed it. Times are the result's own axis. */
export interface PhaseSpan {
  phase: Phase
  start: number
  end: number
  stripCount: number
}

/**
 * Every phase of one result that exists, in drawing order (flights before
 * pools, then the DE phases). A phase with a null start or end, or one that
 * lasts zero minutes – a bracket of 2 has no counted round (METHODOLOGY.md §DE
 * Duration), a one-pool flighted event has an empty FLIGHT_B – is not a phase.
 *
 * A flighted event fills `flight_a_*` and `flight_b_*` *and* leaves
 * `pool_start`/`pool_end` spanning both flights, so flights are checked first
 * or the gap between them would count as pool time. `de_total_end` extends
 * past the last block to cover medal bouts the scheduler does not time, and
 * gets no span.
 */
export function phaseSpans(result: ScheduleResult): PhaseSpan[] {
  const spans: PhaseSpan[] = []
  const push = (
    phase: Phase,
    start: number | null,
    end: number | null,
    stripCount: number,
  ): void => {
    if (start === null || end === null || end === start) return
    spans.push({ phase, start, end, stripCount })
  }

  if (result.flight_a_start !== null) {
    push(Phase.FLIGHT_A, result.flight_a_start, result.flight_a_end, result.flight_a_strips)
    push(Phase.FLIGHT_B, result.flight_b_start, result.flight_b_end, result.flight_b_strips)
  } else {
    push(Phase.POOLS, result.pool_start, result.pool_end, result.pool_strip_count)
  }
  push(Phase.DE, result.de_start, result.de_end, result.de_strip_count)
  push(
    Phase.DE_PRELIMS,
    result.de_prelims_start,
    result.de_prelims_end,
    result.de_prelims_strip_count,
  )
  push(
    Phase.DE_ROUND_OF_16,
    result.de_round_of_16_start,
    result.de_round_of_16_end,
    result.de_round_of_16_strip_count,
  )
  return spans
}

/** The key one (event, phase) goes by in a `Set` of phases. Ids never contain a pipe. */
export function phaseKey(competitionId: string, phase: Phase): string {
  return `${competitionId}|${phase}`
}

/**
 * The phases the run timed but left without strips: those with `stripCount >
 * 0`, `end > start` and no allocation for that event and phase. Empty after
 * any run with no pins, since an unpinned phase that cannot claim is deferred
 * or its event dropped, never recorded.
 */
export function unseatedPhases(run: {
  schedule: Record<string, ScheduleResult>
  strip_allocations: StripAllocation[][]
}): Set<string> {
  const seated = new Set<string>()
  for (const strip of run.strip_allocations) {
    for (const allocation of strip) seated.add(phaseKey(allocation.event_id, allocation.phase))
  }

  const unseated = new Set<string>()
  for (const [id, result] of Object.entries(run.schedule)) {
    for (const span of phaseSpans(result)) {
      if (span.stripCount <= 0) continue
      const key = phaseKey(id, span.phase)
      if (!seated.has(key)) unseated.add(key)
    }
  }
  return unseated
}

/**
 * Whether a phase must run on video strips: only the round of 16, and only
 * under `VideoPolicy.REQUIRED`. The scheduler's phase nodes and the strip
 * assigner both read it, so a kept run and a hand-moved event pick strips by
 * the same rule.
 */
export function phaseRequiresVideo(phase: Phase, competition: Competition): boolean {
  return phase === Phase.DE_ROUND_OF_16 && competition.de_video_policy === VideoPolicy.REQUIRED
}
