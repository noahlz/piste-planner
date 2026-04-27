# Concurrent Phase Scheduler with Interval-List Strip Allocation

## Vision

A scheduling engine that treats strips as a true concurrent shared resource. Multiple events run in parallel on disjoint strip subsets within the same day. Strip allocation tracks every interval explicitly so concurrent claims are first-class state, rollback is order-independent, and downstream code (referee allocation, capacity reporting, visualizer) reads from a complete record of who-used-what-when.

Density on dense scenarios (Cadet/Junior NACs, ROCs, multi-event SYCs) is bounded by the strip pool's *time-multiplexed capacity*, not by single-event serial timelines.

## Constraints preserved from today

- **Same-day-per-event.** Every scheduled phase of an event (pools → DEs through semifinals) finishes on the event's assigned day. Gold and bronze are not scheduled — see the stop-at-semis model in METHODOLOGY.md.
- **No pool-skipping / no pre-seeding.** Every event runs its pool round.
- **Pool-then-DE phase order.** Pools must complete before any DE phase begins for the same event.
- **DE phase order.** Prelims → R16, in sequence, per event. Gold and bronze are unallocated and absorbed by `tailEstimateMins` on `de_total_end`.
- **Day assignment via DSatur.** The graph-coloring algorithm in `dayColoring.ts` decides which day each event lands on. Hard constraints (rest day, individual/team ordering, crossover hard edges) and soft penalties (proximity, capacity) carry forward.
- **Video strip discipline.** Phases with `videoRequired = true` allocate from the `video_capable` subset of strips. Pools do not consume video strips except in the morning wave or single-event days.

## Resource model

### Strips

Strips are an array of `{ id, video_capable }`. Total = `config.strips_total`. Video subset = strips where `video_capable === true`.

### Allocation as intervals

`state.strip_free_at: number[]` (one timestamp per strip, lossy and append-only-via-overwrite) is replaced with:

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

A *pod* is a logical group of 4 strips that runs a DE round together with one head referee. Pod allocation is the unit of work for STAGED DE phases:

```
Pod = {
  id: string                // synthesized at allocation time, e.g. "evt123-r16-pod0"
  strip_indices: number[]   // up to 4 indices
}
```

- DE rounds with N strips required → ⌈N / 4⌉ pods. The last pod may be partial (1–3 strips). Under stop-at-semis, the terminal scheduled DE phase is r16 (which subsumes QF and SF in today's model); gold and bronze are unallocated.
- Pods are assembled at allocation time from currently-free strips that satisfy the video requirement.
- Pod IDs persist on the StripAllocation entries so the post-schedule referee output groups strips into ref-staffing units.
- SINGLE_STAGE DE phases do not use pods — they allocate flat strip counts (see phase table below).

### Operations on the new model

```
findAvailableStripsInWindow(
  count: number,
  startTime: number,
  duration: number,
  videoRequired: boolean,
): { fit: 'ok', strip_indices: number[] }
| { fit: 'none', earliest_next_start: number | null, reason: 'STRIPS' | 'TIME' }

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

releaseEventAllocations(state: GlobalState, event_id: string, attempt_id: number): void

peakConcurrentStrips(window: { start: number, end: number }): {
  total: number,
  video: number,
}
```

`findAvailableStripsInWindow` walks each strip's interval list once: a strip is available in `[startTime, startTime + duration]` iff none of its existing allocations overlap that interval. On a hit, returns `count` such strips (preferring non-video for non-video requests, video-only for video requests). On a miss, returns the earliest time at which `count` strips of the right kind become simultaneously free for `duration` minutes (computed by walking the per-strip interval lists for the next horizontal slice of `count` simultaneous free slots), or `null` if no such slice exists before `dayHardEnd(assigned_day)`. The discriminated `reason` lets callers distinguish "the strip pool was full" from "the day-window expired" for diagnostic emission.

`peakConcurrentStrips` enables the post-schedule referee output (replaces the existing sweep-line on `RefDemandInterval[]`).

`releaseEventAllocations` reverts every piece of state the scheduler wrote for this event during the current pass. Order-independent — each piece of state is keyed by `event_id`, so the function filters by that key. Concretely:
- `state.strip_allocations[*]` — splice out every entry where `entry.event_id === target`.
- `state.schedule[target]` — delete the schedule entry, including any per-phase records.
- `state.bottlenecks` — splice out every entry where `entry.event_id === target` AND `entry.attempt_id === current_attempt_id`. Bottlenecks from earlier successful events stay; bottlenecks from this event's prior retry attempt also stay (they explain the retry chain).
- `state.ref_demand_by_day` — not touched. Ref demand is derived post-schedule from `peakConcurrentStrips`; the scheduler does not maintain it incrementally.
- Phase nodes for this event — reset to `READY` or `PENDING` per the dependency map, with `ready_time` reset to `dayStart(assigned_day)`.

## Scheduler model — OS-process-scheduling loop

Each event is decomposed into a sequence of *phases* (the unit the scheduler reasons about). The decomposition depends on `de_mode` and on whether the event is flighted:

| Phase | Required strips | Video required? | Notes |
|---|---|---|---|
| `pools` (or `pools_flight_a` / `pools_flight_b` for flighted events) | many | no (except special cases) | non-flighted: one node; flighted: two nodes (see Flighting below) |
| `de_prelims` (STAGED only) | half of pool strip count | no | grouped into ⌈N/4⌉ pods |
| `r16` (STAGED only) — terminal | `competition.de_round_of_16_strips` | yes when `de_video_policy = REQUIRED` | grouped into ⌈N/4⌉ pods (typically 1 pod). Subsumes QF + SF; gold/bronze unallocated. |
| `de` (SINGLE_STAGE only) — terminal | `floor(bracketSize / 2)`, capped via `computeStripCap` | no | flat strip allocation, no pods. Excludes gold-bout time fraction. |

**STAGED vs SINGLE_STAGE.** STAGED events (NACs) decompose to `pools → de_prelims → r16` (gold + bronze unallocated). SINGLE_STAGE events (ROC, RYC, SYC, RJCC, SJCC) decompose to `pools → de`. The `de` phase node for SINGLE_STAGE has `desired_strip_count = floor(bracketSize / 2)`, `video_required = false`, no pods. Duration scales with the ratio `actualStrips / deOptimal` after the cap and window search resolve `actualStrips`: `actualDur = totalDeBase × (totalBouts − 1) / totalBouts / ratio` (the `(totalBouts − 1) / totalBouts` factor excludes the gold bout's share, which is captured by `tailEstimateMins` instead). The terminal-phase end-time is then extended by `tailEstimateMins(event_type)` to populate `de_total_end`.

**Flighting.** A competition is flighted when `n_pools > pool_strip_cap` (computed from `config.max_pool_strip_pct` and per-competition overrides; see METHODOLOGY §Flighting). Flighted events split the `pools` phase into two nodes:
- `pools_flight_a`: `desired_strip_count = ceil(n_pools / 2)`, `desired_refs = ceil(refs_needed / 2)`, `duration = estimatePoolDuration(flightAPools, …)`, `ready_time = dayStart(assigned_day)`.
- `pools_flight_b`: `desired_strip_count = floor(n_pools / 2)`, `desired_refs = floor(refs_needed / 2)`, `duration = estimatePoolDuration(flightBPools, …)`. Dependency edge: `pools_flight_b.ready_time = pools_flight_a.end_time + config.FLIGHT_BUFFER_MINS`.
- All DE phase nodes (`de_prelims` for STAGED, `de` for SINGLE_STAGE) depend on `pools_flight_b`, not on `pools_flight_a`.

Both flights must land on the assigned day. If `pools_flight_b.ready_time + duration > dayHardEnd(assigned_day)`, the loop emits `SAME_DAY_VIOLATION`. Different flights of the same event may land on different physical strips; Flight B's window search naturally finds available strips after Flight A's interval ends. The day-assignment layer (`analysis.ts` / `flighting.ts`) decides flighting per event before the scheduler runs; the concurrent scheduler reads that decision when building phase nodes.

**Gold + bronze (not scheduled).** Per the stop-at-semis model (METHODOLOGY.md §"Scheduler Stops at Semis"), the gold and bronze bouts are not allocated. Tournament organizers run them ad-hoc on whatever strip + ref free up at the tail of the day. `de_total_end` extends the terminal scheduled phase end by `tailEstimateMins(event_type)` (30 min for individual, 60 min for team) so logistics see a realistic end-time. Gold/bronze ref load is absorbed by the staffing-buffer recommendation, not modeled as discrete demand intervals.

### Phase state

Each phase node has state:

- `PENDING` — prior phase not yet complete
- `READY` — prior phase done, waiting for resources
- `RUNNING` — allocated (terminal — once allocated, the phase is decided for this attempt)
- `FAILED` — could not be allocated within event's day-window

The scheduler maintains a ready queue keyed by priority and a dependency map linking each phase to its successor.

### Loop

```
1. Init:
   - For each event E (in DSatur day-assignment order):
     - Build phase nodes per the table above (de_mode-dependent; flighted pools split).
     - First pool node (pools, or pools_flight_a if flighted).state = READY at ready_time = dayStart(E.assigned_day).
     - All other phases.state = PENDING.
     - E.attempt_id = 1.

2. While ready queue non-empty and iter < max_iter:
   a. Pop highest-priority READY phase P (event = E).
   b. Compute the cap for this phase:
        pool_cap = computeStripCap(strips_total, config.max_pool_strip_pct,
                                   E.max_pool_strip_pct_override)
        de_cap   = computeStripCap(strips_total, config.max_de_strip_pct,
                                   E.max_de_strip_pct_override)
        capped_count = min(P.desired_strip_count, pool_or_de_cap_for_phase_kind)
   c. Window search:
        win = findAvailableStripsInWindow(
          capped_count or P.pod_count × 4,
          P.ready_time,
          P.duration_for(capped_count),  // pool: derived from rounds; SINGLE_STAGE de: scaled
          P.video_required,
        )
   d. If win.fit === 'ok':
        - Allocate intervals (pods for STAGED DE phases; flat for SINGLE_STAGE de and pools).
        - P.state = RUNNING.
        - successor.ready_time = P.end_time + ADMIN_GAP_MINS.
        - successor.state = READY. Push successor onto ready queue.
   e. If win.fit === 'none':
        - If win.earliest_next_start is non-null and win.earliest_next_start + duration ≤ dayHardEnd(E.assigned_day):
            P.ready_time = win.earliest_next_start. Push P back onto ready queue.
            Emit NO_WINDOW_DIAGNOSTIC (INFO) with win.reason.
            Monotonicity invariant: new_ready_time > old_ready_time. If violated, assert and fail loudly.
        - Otherwise:
            P.state = FAILED. Cascade: mark all of E's not-yet-RUNNING phases FAILED.
            If E.attempt_id === 1:
              releaseEventAllocations(state, E.id, attempt_id=1).
              Emit DEADLINE_BREACH (WARN) tagged with attempt_id=1.
              E.attempt_id = 2. Reset E's phases to PENDING/READY with pools.ready_time = dayStart(E.assigned_day).
              Re-push the pool node onto the ready queue.
            Else (attempt_id === 2):
              releaseEventAllocations(state, E.id, attempt_id=2).
              Emit DEADLINE_BREACH_UNRESOLVABLE (ERROR) tagged with attempt_id=2.
              Event E is permanently unscheduled. Continue with the next ready phase.

3. Bounded iteration: max_iter = total_phase_count × MAX_DEFERS_PER_PHASE × 2.
   MAX_DEFERS_PER_PHASE is a small constant (e.g. 16), a circuit-breaker against pathological allocation states.
   The monotonicity invariant alone bounds the loop; the tight bound limits worst-case work on dense scenarios.
```

**Per-event strip cap.** With true concurrency the cap matters more than under serial scheduling — one event grabbing 100% of strips kills concurrency. For pool phases, the cap clamps `capped_count` and the duration recomputes (fewer concurrent strips → more pool rounds → longer block; the `pool_round_duration_table[weapon] × n_rounds` math handles this). For DE phases, the cap clamps `pod_count × 4` (or raw strip count for SINGLE_STAGE); the phase runs more sequential rounds within its window.

**One retry per event.** The retry budget is per-event, not per-phase. The notBefore-deferral path (step 2e first branch) handles forward-shift dynamically inside a single pass, so retry's value is the *backward shift* (start the event earlier on the same day, freeing strip-time for the failing phase) — one retry captures that case.

**Cross-event dependency edges.** Two narrow cases produce explicit edges between phase nodes of different events:
- **Indv → team gap.** Same-day indv/team sequencing (today's `phaseSchedulers.ts:159–172`, +120 min gap) only fires for soft-penalty pairs (cross-population crossover, e.g. Div2 ↔ Vet Team) or level-3-relaxed pairs — same-category pairs are hard-blocked from sharing a day. When an indv/team pair did land on the same day, add `indiv.last_phase + INDIV_TEAM_MIN_GAP_MINS → team.first_phase`.
- **Vet age-banded sibling order.** When two age-banded VET ind events of the same gender + weapon land on the same day (per the Veteran Age-Group Co-Day Rule), add `younger_sibling.pools.ready_time = older_sibling.last_phase.end_time + ADMIN_GAP_MINS` so each event runs end-to-end before the next-younger begins. The serial scheduler approximates this via a within-day sort key (`vetAgeOrderingKey` in `daySequencing.ts`); the explicit dependency edge is what enforces strict serialization under concurrency.

### Priority function

When multiple phases are READY, the higher-priority one is scheduled first. Ordering (descending precedence):

1. **Earlier ready_time** — if event A's pool can start at 8am and event B's at 9am, A goes first.
2. **Y8/Y10 events first** — youth-priority categories must claim morning strip-time before larger events crowd them out. Mirrors `daySequencing.ts` rule 1; without it, large events grab strips at `dayStart` and small Y10 events get pushed past their DE windows on dense days (B3 regression diagnosed 2026-04-27).
3. **Video-required phase** over non-video — claim scarce video strips before they're contested.
4. **Larger strip_count / pod_count first** — bigger phases are hardest to fit, so place them when the strip pool is empty (least fragmented). Smaller phases backfill later.
5. **Higher constraint score** (existing `constraintScore` from `dayAssignment.ts`) — most-constrained events first; breaks ties.

Priority is local to a tick of the loop; it does not freeze global decisions. If a small phase blocks a large one, the large one falls back to a later start time on the same day via the notBefore-deferral path.

The morning-wave rule (today's `MORNING_WAVE_WINDOW_MINS = 120`) survives by deprioritizing pool phases for video-strip claims outside the wave window — pools allocate from non-video strips first when their `ready_time` is past the wave window, and only fall back to video strips on single-event days.

### Why this works for concurrency

When event A's pools allocate strips 1–30 from 8:00 to 9:15, event B's pools (next in the ready queue, same `ready_time = 8:00`) call `findAvailableStripsInWindow(30, 8:00, 75, false)` and see strips 31–80 are wide open. They allocate strips 31–60 from 8:00 to 9:15. A and B run truly concurrently. The interval-list state distinguishes "strip 35 has an allocation 8:00–9:15" from "strip 5 has an allocation 8:00–9:15," so refs and capacity reports later see both events as concurrent rather than sequential.

### Bottlenecks the concurrent scheduler emits

Scheduler-emitted variants:
- `DEADLINE_BREACH` (WARN) — emitted on attempt 1's FAILED cascade, tagged with `attempt_id=1`.
- `DEADLINE_BREACH_UNRESOLVABLE` (ERROR) — emitted on attempt 2's FAILED cascade, tagged with `attempt_id=2`.
- `SAME_DAY_VIOLATION` (ERROR) — phase ends after `dayHardEnd` of its assigned day.
- `NO_WINDOW_DIAGNOSTIC` (INFO) — `findAvailableStripsInWindow` returned a miss; carries `reason: 'STRIPS' | 'TIME'`.
- `SEQUENCING_CONSTRAINT` (INFO/WARN) — successor's `ready_time` pushed past predecessor's natural end (indv→team gap, Vet sibling gap, DE phase order).
- `FLIGHT_B_DELAYED` (WARN) — Flight B slipped past `flightA.end + FLIGHT_BUFFER_MINS` due to strip contention.
- `VIDEO_STRIP_CONTENTION` (INFO) — video-required phase had to wait or compromise on video-strip allocation.
- `STRIP_CONTENTION` (INFO) — generic strip-pool diagnostic when no specific cause applies.

Variants emitted by other layers (day-assignment, pre-schedule analysis, post-schedule) carry forward unchanged: `CONSTRAINT_RELAXED`, `SAME_DAY_DEMOGRAPHIC_CONFLICT`, `UNAVOIDABLE_CROSSOVER_CONFLICT`, `INDIV_TEAM_ORDERING`, `PROXIMITY_PREFERENCE_UNMET`, `MULTIPLE_FLIGHTED_SAME_DAY`, `SCHEDULED_8AM_*`; `STRIP_DEFICIT_NO_FLIGHTING`, `FLIGHTING_GROUP_*`, `GENDER_EQUITY_CAP_VIOLATION`, `RESOURCE_*`, `DAY_RESOURCE_SUMMARY`; `AUTO_REF_FALLBACK`, `TWO_REF_FALLBACK`, `REFEREE_INSUFFICIENT_ACCEPTED`, `SCHEDULE_ACCEPTED_WITH_WARNINGS`, `CUT_SUMMARY`, `SAME_TIME_CROSSOVER`. `assertScheduleIntegrity` (`__tests__/engine/integration.test.ts:167–173`) continues to validate `constraint_relaxation_level` against matching `CONSTRAINT_RELAXED` bottlenecks.

## Implementation phases

Each phase ships independently and leaves the engine in a working state.

### Phases 0, A, B — COMPLETED 2026-04-26

Phase 0 (config flag rename), Phase A (interval-list strip data model), and Phase B (pod allocation primitive) are committed: Phase 0 + A in `9ea7c85f`, Phase B in `a6ef3c07`.

**Resulting state of the codebase:**

- `TournamentConfig.de_capacity_estimation: 'pod_packed' | 'spread'` (renamed from `de_capacity_mode`). Day-assignment estimation flag, no runtime effect.
- `GlobalState.strip_allocations: StripAllocation[][]` replaces `strip_free_at`. Each strip carries a per-strip chronological list. `EventTxLog.stripAllocationsAdded` replaces `stripChanges`.
- `src/engine/resources.ts` exports the new primitives: `nextFreeTime`, `findAvailableStripsInWindow` (overlap-aware, returns `{ fit: 'ok' | 'none', earliest_next_start, reason: 'STRIPS' | 'TIME' }`), `allocateInterval`, `releaseEventAllocations`, `peakConcurrentStrips`. The serial scheduler runs unchanged via these helpers — `findAvailableStrips`, `earliestResourceWindow`, `rollbackEvent`, `snapshotState`/`restoreState`, `createGlobalState` all reimplemented over the new state shape.
- `src/engine/pods.ts` exports `allocatePods(state, config, event_id, phase, total_strip_count, pod_size, start_time, duration, video_required): { pods: Pod[] } | null`. Pod IDs follow `${event_id}-${phase.toLowerCase()}-pod${i}`. StripAllocation entries written by pods carry the `pod_id`. `releaseEventAllocations` cleans them up by event_id filter.
- `src/engine/refs.ts` exports `computePodRefDemand(state, config, competitions: Pick<Competition, 'id' | 'weapon'>[]): Record<number, RefDemandByDay>` — groups by `pod_id` across strips, emits one interval (count=1) per unique pod_id, bucketed into days via `findDayForTime`. Allocations without `pod_id` are skipped. Throws if a pod's `event_id` is not in the supplied `competitions`. `computeRefRequirements` is unchanged. `findDayForTime` lives in `types.ts` next to `dayStart`/`dayEnd`.
- `phaseSchedulers.ts` callsites updated to the new `allocateStrips(state, stripIds, startTime, endTime, eventId, phase, txLog?)` signature; the bronze finder uses `nextFreeTime`.
- `METHODOLOGY.md` §DE Capacity Estimation Models renamed and reframed as a day-assignment heuristic.

**Resume here.** Phase C builds the concurrent scheduler on top of these primitives.

### Phase C — Concurrent scheduler (parallel file, no flag)

**Ships:** `concurrentScheduler.ts` as a new entry point alongside the serial path. The existing `scheduleAll` continues to call the serial path; the new `scheduleAllConcurrent` is exercised only via direct test calls. No config flag, no dispatch shim, no `TournamentConfig` change.

**Files:**
- `src/engine/concurrentScheduler.ts` (new) — `scheduleAllConcurrent(competitions, config): ScheduleAllResult`. Reuses `assignDaysByColoring` from `dayAssignment.ts`, then runs the priority-queue loop above. Reuses pure helpers from `pools.ts`, `de.ts`, `stripBudget.ts`, and the new primitives in `resources.ts` / `pods.ts`. Does not call into `scheduleOne.ts` or `phaseSchedulers.ts`.
- `src/engine/types.ts` — add `attempt_id?: number` field to `Bottleneck` so retry-tagged emissions can be filtered. No other type changes.
- `src/engine/resources.ts` — extend `releaseEventAllocations` to accept an optional `attempt_id` and filter bottlenecks by both `event_id` and `attempt_id` when supplied. The Phase A behavior (filter by `event_id` only) remains the default when `attempt_id` is omitted.
- `__tests__/engine/baselines.ts` (new) — captures the actual scheduled counts produced by the serial scheduler against the integration suite, recorded once before the concurrent suite is added:

    ```ts
    export const SERIAL_BASELINES = {
      B1: ..., B2: ..., B3: ..., B4: ..., B5: ..., B6: ..., B7: ...,
    } as const
    ```

    These are the comparison floor. Inline comments record the date and the commit at which the numbers were captured.
- `__tests__/engine/concurrentScheduler.test.ts` (new):
    - Toy 2-event scenario: both events run pools concurrently on disjoint strips at the same start time.
    - Toy 3-event scenario with video contention: video-required phase wins priority over non-video. Asserts `VIDEO_STRIP_CONTENTION` is emitted.
    - Toy phase-dependency scenario: event's R16 cannot start until its pools and prelims complete.
    - Toy rollback scenario: an event whose terminal phase fails has all its allocations cleanly removed via `releaseEventAllocations`.
    - Toy tail scenario: STAGED INDIVIDUAL and STAGED TEAM events both produce `de_total_end = r16_end + tailEstimateMins(event_type)` (30 / 60 min respectively); same for SINGLE_STAGE on `de_end`.
    - Toy retry scenario: an event hits FAILED on attempt 1, retries from earlier start, succeeds on attempt 2. Asserts `DEADLINE_BREACH` (WARN) on attempt 1 and no `DEADLINE_BREACH_UNRESOLVABLE`.
    - Toy deadline-breach scenario: an event hits FAILED on attempts 1 AND 2. Asserts both `DEADLINE_BREACH` and `DEADLINE_BREACH_UNRESOLVABLE` fire with the correct `attempt_id` tags.
- `__tests__/engine/integration.concurrent.test.ts` (new) — duplicates the B1–B7 scenarios calling `scheduleAllConcurrent` directly. For B5, B6, B7 (the dense scenarios), asserts strict gain over the serial baseline:

    ```ts
    expect(scheduledCount).toBeGreaterThanOrEqual(SERIAL_BASELINES.B5 + GAIN_B5)
    expect(scheduledCount).toBeGreaterThanOrEqual(SERIAL_BASELINES.B6 + GAIN_B6)
    expect(scheduledCount).toBeGreaterThanOrEqual(SERIAL_BASELINES.B7 + GAIN_B7)
    ```

    `GAIN_B*` is set to `(observed_concurrent_count − serial_count) − 1` (1-event safety margin for priority-tie non-determinism). B1–B4 use `.toBeGreaterThanOrEqual(N)` — they are correctness scenarios, not density-gain scenarios — with N matching whatever floor the concurrent scheduler establishes.

**Acceptance:**
- All concurrent toy tests pass with their bottleneck-emission assertions.
- `B1..B7` pass under `scheduleAllConcurrent`. `B5, B6, B7` schedule strictly more events than the serial baseline.
- Hard constraints (rest day, individual/team, deadline, Vet co-day, Vet sibling order) continue to be respected.
- `assertScheduleIntegrity` and `assertHardSeparations` pass on the concurrent output.
- The serial path (`scheduleAll`) is unchanged; the existing serial test suite continues to pass.

Inline test comments record the date the baselines were captured and the rationale, so future changes that drop concurrent counts below `SERIAL_BASELINES.B* + GAIN_B*` fail loudly.

### Phase D — Switch over and delete serial

**Ships:** `scheduleAll` swaps to call `scheduleAllConcurrent`; serial code deleted; integration baselines re-locked at the new (higher) numbers.

**Files:**
- `src/engine/scheduler.ts` — `scheduleAll` body is rewritten to call `scheduleAllConcurrent`. The serial-specific orchestration (per-day event loop with `snapshotState`/`restoreState`, the repair loop, `sortWithPairs`-driven event-major dispatch) is removed. `postScheduleDiagnostics`, `postScheduleDayBreakdown`, `postScheduleWarnings` are preserved or moved into `concurrentScheduler.ts` if they are the only consumers.
- `src/engine/scheduleOne.ts` — delete.
- `src/engine/phaseSchedulers.ts` — delete (logic re-expressed inside `concurrentScheduler.ts` during Phase C).
- `src/engine/resources.ts` — remove the serial-only helpers: `findAvailableStrips`, `earliestResourceWindow`, `snapshotState`, `restoreState`, `allocateStrips` (txLog-coupled variant), `rollbackEvent`, `nextFreeTime` (if unused after deletion), `PoolContext` (if not needed by the concurrent loop), and the `EventTxLog`-rollback path.
- `src/engine/types.ts` — remove `EventTxLog` interface.
- `__tests__/engine/integration.test.ts` — re-baseline B1–B7 thresholds to the new measured counts; absorb the concurrent-suite assertions and delete `integration.concurrent.test.ts`. Inline comments record the date.
- `__tests__/engine/scheduleOne.test.ts`, `__tests__/engine/phaseSchedulers.test.ts`, `__tests__/engine/scheduler.test.ts` — delete the serial-only tests; preserve any tests that exercise pure helpers that survive (pools, de, stripBudget).
- `__tests__/engine/resources.test.ts` — drop the tests covering deleted serial helpers.
- `METHODOLOGY.md` — add §"Concurrent Phase Scheduler" describing the model. Rewrite §Strip Allocation to describe the interval-list model. Update §Capacity-Aware Day Assignment with the new `CAPACITY_TARGET_FILL` value chosen empirically by re-running B1–B7 with progressively higher targets; inline-comment the date and source benchmark; note the conservative-fill rationale ("compensate for serial scheduler underutilization") no longer applies. Update §Flighting to cross-reference the two-phase-node model. §DE Capacity Estimation Models (renamed in Phase 0) gets a cross-reference to the new §Concurrent Phase Scheduler section noting that runtime DE allocation always uses pods of 4 for STAGED, regardless of the estimation heuristic.

**Acceptance:**
- Full test suite passes with the concurrent scheduler as the only path.
- Integration baselines locked at the new (higher) numbers.
- No dead code in `src/engine/`.

## Engineering conventions

- `pnpm` not `npm`. Single file: `timeout 120 pnpm --silent vitest run <path> > ./tmp/test.log 2>&1`. Full: `timeout 180 pnpm --silent test > ./tmp/test.log 2>&1`. Read the log only on failure.
- User owns all git commits; subagents do not run `git`.
- ts-morph MCP: `tsconfigPath = ./tsconfig.app.json`.
- `as const` objects, never TypeScript enums.
- Engine functions are pure — no global state, no singletons.
- No unbounded loops — the scheduler loop has a bounded `max_iter` derived from the total phase count.
