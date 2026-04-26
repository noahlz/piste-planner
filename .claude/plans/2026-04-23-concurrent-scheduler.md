# Concurrent Phase Scheduler with Interval-List Strip Allocation

## Vision

A scheduling engine that treats strips as a true concurrent shared resource. Multiple events run in parallel on disjoint strip subsets within the same day. Strip allocation tracks every interval explicitly so concurrent claims are first-class state, rollback is order-independent, and downstream code (referee allocation, capacity reporting, visualizer) reads from a complete record of who-used-what-when.

Density on dense scenarios (Cadet/Junior NACs, ROCs, multi-event SYCs) is bounded by the strip pool's *time-multiplexed capacity*, not by single-event serial timelines.

## Constraints preserved from today

- **Same-day-per-event.** Every phase of an event (pools → DEs → finals → bronze) finishes on the event's assigned day. No phase splits across days.
- **No pool-skipping / no pre-seeding.** Every event runs its pool round.
- **Pool-then-DE phase order.** Pools must complete before any DE phase begins for the same event.
- **DE phase order.** Prelims → R16 → QF → SF → Finals → Bronze, in sequence, per event.
- **Day assignment via DSatur.** The graph-coloring algorithm in `dayColoring.ts` still decides which day each event lands on. Hard constraints (rest day, individual/team ordering, crossover hard edges) and soft penalties (proximity, capacity) carry forward.
- **Video strip discipline.** Phases with `videoRequired = true` must allocate from the `video_capable` subset of strips. Pools should not squat on video strips except in the morning wave or single-event days.

## Resource model

### Strips

Strips are an array of `{ id, video_capable }`. Total = `config.strips_total`. Video subset = strips where `video_capable === true`.

### Allocation as intervals

Replace `state.strip_free_at: number[]` (one timestamp per strip — lossy, append-only-via-overwrite) with:

```
state.strip_allocations: StripAllocation[][]  // indexed by strip index
```

where

```
StripAllocation = {
  event_id: string
  phase: Phase
  pod_id?: string         // present for DE allocations; absent for pool allocations
  start_time: number      // minutes-from-tournament-start
  end_time: number
}
```

Each strip carries a list of intervals it has been allocated to, in chronological order. The list is append-only during a scheduling pass. Rollback for an event removes every entry where `event_id === target` across all strips — order-independent and complete.

### Pods (DE rounds)

A *pod* is a logical group of 4 strips that runs a DE round together with one head referee. Pod allocation is the unit of work for DE phases:

```
Pod = {
  id: string                // synthesized at allocation time, e.g. "evt123-r16-pod0"
  strip_indices: number[]   // up to 4 indices
}
```

- DE rounds with N strips required → ⌈N / 4⌉ pods. The last pod may be partial (1–3 strips). Finals = 1 strip = 1 partial-pod.
- Pods are assembled at allocation time from currently-free strips that satisfy the video requirement.
- Pod IDs persist on the StripAllocation entries so the post-schedule referee output can group strips into ref-staffing units.

### Operations on the new model

```
findAvailableStripsInWindow(
  count: number,
  startTime: number,
  duration: number,
  videoRequired: boolean,
): { strip_indices: number[] } | null

allocatePods(
  event_id: string,
  phase: Phase,
  pod_count: number,
  pod_size: 4,                // last pod may be partial
  start_time: number,
  duration: number,
  video_required: boolean,
): { pods: Pod[] } | null

allocateInterval(
  event_id: string,
  phase: Phase,
  strip_indices: number[],
  start_time: number,
  end_time: number,
  pod_id?: string,
): void

releaseEventAllocations(event_id: string): void

peakConcurrentStrips(window: { start: number, end: number }): {
  total: number,
  video: number,
}
```

`findAvailableStripsInWindow` walks each strip's interval list once: a strip is available in `[startTime, startTime + duration]` iff none of its existing allocations overlap that interval. Returns the first `count` such strips (preferring non-video for non-video requests, video-only for video requests).

`peakConcurrentStrips` enables the post-schedule referee output (replaces the existing sweep-line on `RefDemandInterval[]`).

## Scheduler model — OS-process-scheduling loop

Each event is decomposed into a sequence of *phases* (the unit the scheduler reasons about):

| Phase | Required strips (typical) | Video required? | Duration source |
|---|---|---|---|
| `pools` | many (e.g. 30 for 200-fencer event) | no (except special cases) | `pool_round_duration_table[weapon] × n_rounds` |
| `de_prelims` | half of pool strip count | no | `de_duration_table[weapon][round]` |
| `r16` | 4 (1 pod) or 8 (2 pods) | yes (STAGED + REQUIRED) | as above |
| `quarters` | 4 (1 pod) | yes | as above |
| `semis_finals_bronze` | 1–4 strips | yes | as above |

Each phase is a "process" with state:

- `PENDING` — prior phase not yet complete
- `READY` — prior phase done, waiting for resources
- `RUNNING` — allocated (terminal — once allocated, the phase is decided)
- `FAILED` — could not be allocated within event's day-window

The scheduler maintains:

- A **ready queue** keyed by priority
- A **dependency map** linking each phase to its successor

### Loop

```
1. Init:
   - For each event E (in DSatur day-assignment order):
     - Create phase nodes [pools, de_prelims, r16, quarters, semis_finals_bronze].
     - Pools.state = READY at ready_time = dayStart(E.assigned_day).
     - All other phases.state = PENDING.

2. While ready queue non-empty:
   a. Pop highest-priority READY phase P.
   b. Window search:
        win = findAvailableStripsInWindow(
          P.strip_count or P.pod_count × 4,
          P.ready_time,
          P.duration,
          P.video_required,
        )
   c. If win found:
        Allocate (intervals or pods).
        P.state = RUNNING (decided).
        successor.ready_time = P.end_time + ADMIN_GAP_MINS.
        successor.state = READY.
        Push successor onto ready queue.
   d. If win not found within event's same-day deadline:
        - Try later in the day (advance start_time, retry).
        - If still no fit by `dayHardEnd(assigned_day)`:
          P.state = FAILED.
          Cascade: all successor phases for this event = FAILED.
          releaseEventAllocations(E.id) — restore strip pool.
          Emit DEADLINE_BREACH_UNRESOLVABLE bottleneck.

3. Bounded iteration: max_iter = sum of phase counts across all events.
```

### Priority function

Higher priority is scheduled first when multiple phases are READY. Suggested ordering (descending precedence):

1. **Earlier ready_time** — if event A's pool can start at 8am and event B's at 9am, A goes first.
2. **Video-required phase** over non-video — claim scarce video strips before they're contested.
3. **Larger strip_count / pod_count** — bigger phases are harder to fit; place them when the pool is least fragmented.
4. **Higher constraint score** (existing `constraintScore` from `dayAssignment.ts`) — most-constrained events first, breaks ties.

This priority is local to a tick of the loop; it does not freeze global decisions. If a small phase blocks a large one, the large one falls back to a later start time on the same day.

### Why this works for concurrency

When event A's pools allocate strips 1–30 from 8:00 to 9:15, event B's pools (next in the ready queue, same `ready_time = 8:00`) call `findAvailableStripsInWindow(30, 8:00, 75, false)` and see strips 31–80 are wide open. They allocate strips 31–60 from 8:00 to 9:15. A and B run truly concurrently. The interval-list state distinguishes "strip 35 has an allocation 8:00–9:15" from "strip 5 has an allocation 8:00–9:15," so refs and capacity reports later see both events as concurrent rather than sequential.

## Implementation phases

Each phase ships independently and leaves the engine in a working state.

### Phase A — Interval-list strip data model

**What ships:** new data structure, new primitives, no behavior change.

**Files:**
- `src/engine/types.ts` — add `StripAllocation`, `Pod`. Add `strip_allocations: StripAllocation[][]` to `GlobalState` alongside the existing `strip_free_at`.
- `src/engine/resources.ts` — add `findAvailableStripsInWindow`, `allocateInterval`, `releaseEventAllocations`, `peakConcurrentStrips`. Existing primitives (`findAvailableStrips`, `allocateStrips`) wrap the new ones AND continue to maintain `strip_free_at` for the legacy scheduler.
- `__tests__/engine/resources.test.ts` — new describe block for interval-list operations: overlap detection, allocation, release, partial overlap, video-strip filtering.

**Acceptance:** all existing tests pass unchanged. New tests cover the interval-list primitives in isolation.

**Out of scope:** the existing scheduler is untouched.

### Phase B — Pod allocation primitive

**What ships:** the pod abstraction layered on Phase A's interval-list.

**Files:**
- `src/engine/types.ts` — add `Pod` type if not already in Phase A.
- `src/engine/pods.ts` (new) — `allocatePods` and the pod-id synthesis logic.
- `__tests__/engine/pods.test.ts` (new) — pod sizing (full vs partial), video pod selection, multi-pod allocation in one call, rollback.
- `src/engine/refs.ts` — extend `computeRefRequirements` to read pod IDs from `StripAllocation[]` and report ref demand at pod granularity (one head ref per pod).

**Acceptance:** pod tests pass. `computeRefRequirements` produces the same per-day peak counts as today (pod-grouping is a presentation detail).

### Phase C — Concurrent scheduler

**What ships:** the OS-process-scheduling loop, behind a config flag.

**Files:**
- `src/engine/concurrentScheduler.ts` (new) — `scheduleAllConcurrent(competitions, config)`. Reuses `assignDaysByColoring` from `dayAssignment.ts` for the day-assignment step, then runs the priority-queue loop above.
- `src/engine/types.ts` — add `TournamentConfig.scheduler_mode: 'serial' | 'concurrent'` (default `'serial'` initially).
- `src/engine/scheduler.ts` — top-level `scheduleAll` dispatches on `scheduler_mode`.
- `__tests__/engine/concurrentScheduler.test.ts` (new):
  - Toy 2-event scenario: both events run pools concurrently on disjoint strips at the same start time.
  - Toy 3-event scenario with video contention: video-required phase wins priority over non-video.
  - Toy phase-dependency scenario: event's R16 cannot start until its pools and prelims complete.
  - Toy rollback scenario: an event whose final phase fails has all its allocations cleanly removed.
- `__tests__/engine/integration.test.ts` — duplicate the B1–B7 scenarios with `scheduler_mode: 'concurrent'`. Compare scheduled counts against the serial scheduler's baseline.

**Acceptance:**
- All concurrent toy tests pass.
- `B1..B7` under the concurrent scheduler each schedule ≥ as many events as under the serial scheduler. Density gains expected on B5/B7 specifically.
- Hard constraints (rest day, individual/team, deadline) continue to be respected.
- `assertScheduleIntegrity` and `assertHardSeparations` pass on the concurrent output.

### Phase D — Migration and cleanup

**What ships:** concurrent becomes the default, legacy scheduler removed.

**Files:**
- `src/engine/types.ts` — flip default `scheduler_mode` to `'concurrent'`. Or remove the flag entirely.
- `src/engine/scheduler.ts` — remove the serial branch.
- `src/engine/scheduleOne.ts` — delete if unused, or keep with a clear "internal helper" docstring if `concurrentScheduler.ts` still calls into per-phase helpers from it.
- `src/engine/phaseSchedulers.ts` — collapse into `concurrentScheduler.ts` if no other consumer.
- `src/engine/resources.ts` — remove `strip_free_at` and the wrappers that maintained it. Remove `findAvailableStrips` (replaced by the in-window variant).
- `src/engine/types.ts` — remove `strip_free_at` from `GlobalState`.
- `__tests__/engine/integration.test.ts` — re-baseline B1–B7 thresholds to the new measured counts. Document the new floor in inline comments with the date.
- `METHODOLOGY.md` — new §"Concurrent Phase Scheduler" describing the model. Existing §Strip Allocation rewritten to describe the interval-list model.

**Acceptance:**
- Full test suite passes with the concurrent scheduler as the only path.
- Integration baselines locked at the new (higher) numbers.
- No dead code in `src/engine/`.

## Open questions to resolve during execution

These aren't blockers; they're decisions that should be made deliberately during the relevant phase rather than guessed up-front.

- **Priority tie-breaking under load.** When 4 events all have the same `ready_time` and the strip pool can fit 3 of them, which 3? The priority function above is a starting point; the test scenarios will reveal whether it produces good outcomes or pathological ones.
- **Pod sharing across rounds.** When event A's R16 finishes a pod, can event B's quarters claim the same 4 strips immediately, or is there a transition cost? Default: immediately (with `ADMIN_GAP_MINS` between A's R16 end and B's quarters start).
- **Pool-round morning wave.** The existing `MORNING_WAVE_WINDOW_MINS = 120` rule says pools may consume video strips only during the morning wave or on single-event days. The concurrent scheduler should preserve this — likely by deprioritizing pool phases for video-strip claims outside the wave window. Decide where this lives in the priority function.
- **DSatur day-assignment compatibility.** The current `dayColoring.ts` uses a strip-hour capacity heuristic with a conservative fill target to compensate for the serial scheduler's underutilization. With true concurrency, the fill target can be raised. Decide the new value empirically by re-running B1–B7 with progressively higher targets and measuring density.
- **Late-finish allowance.** Even with concurrency, very large events may not fit in a 14-hour day. A future relaxation could add `DAY_HARD_END_MINS` (e.g., `DAY_LENGTH_MINS + 120`) and a `LATE_FINISH_WARNING` bottleneck to allow events to extend past the soft day-end with operator visibility. Out of scope for Phases A–D but a natural follow-on if Phase C still leaves density on the table.

## Engineering conventions (carry forward)

- `pnpm` not `npm`. Single file: `timeout 120 pnpm --silent vitest run <path> > ./tmp/test.log 2>&1`. Full: `timeout 180 pnpm --silent test > ./tmp/test.log 2>&1`. Read the log only on failure.
- User owns all git commits; subagents do not run `git`.
- ts-morph MCP: `tsconfigPath = ./tsconfig.app.json`.
- `as const` objects, never TypeScript enums.
- Engine functions are pure — no global state, no singletons.
- No unbounded loops — the scheduler loop has a bounded `max_iter` derived from the total phase count.
