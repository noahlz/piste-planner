# Concurrent Phase Scheduler with Interval-List Strip Allocation

## Vision

A scheduling engine that treats strips as a true concurrent shared resource. Multiple events run in parallel on disjoint strip subsets within the same day. Strip allocation tracks every interval explicitly so concurrent claims are first-class state, rollback is order-independent, and downstream code (referee allocation, capacity reporting, visualizer) reads from a complete record of who-used-what-when.

Density on dense scenarios (Cadet/Junior NACs, ROCs, multi-event SYCs) is bounded by the strip pool's *time-multiplexed capacity*, not by single-event serial timelines.

## Constraints preserved from today

- **Same-day-per-event.** Every phase of an event (pools → DEs → finals → bronze) finishes on the event's assigned day. No phase splits across days.
- **No pool-skipping / no pre-seeding.** Every event runs its pool round.
- **Pool-then-DE phase order.** Pools must complete before any DE phase begins for the same event.
- **DE phase order.** Prelims → R16 → QF → SF → Finals → Bronze, in sequence, per event.
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

- DE rounds with N strips required → ⌈N / 4⌉ pods. The last pod may be partial (1–3 strips). Finals = 1 strip = 1 partial-pod.
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
| `de_prelims` (STAGED only) | half of pool strip count | no | |
| `r16` (STAGED only) | 4 (1 pod) or 8 (2 pods) | yes (STAGED + REQUIRED) | |
| `quarters` (STAGED only) | 4 (1 pod) | yes | |
| `semis_finals` (STAGED only) | 2 (max), video | yes (STAGED + REQUIRED) | semis on 2 strips in parallel; gold + bronze share those same 2 strips |
| `de` (SINGLE_STAGE only) | `floor(bracketSize / 2)`, capped via `computeStripCap` | no | flat strip allocation, no pods |
| `bronze` | 0 (shares a `semis_finals` strip) | inherits from finals | sub-allocation within `semis_finals`; soft-fail when only 1 strip available |

**STAGED vs SINGLE_STAGE.** STAGED events (NACs) decompose to `pools → de_prelims → r16 → quarters → semis_finals → bronze`. SINGLE_STAGE events (ROC, RYC, SYC, RJCC, SJCC) decompose to `pools → de → bronze`. The `de` phase node for SINGLE_STAGE has `desired_strip_count = floor(bracketSize / 2)` (matches today's `deOptimal` in `scheduleSingleStageDePhase`), `video_required = false`, no pods. Duration scales with the ratio `actualStrips / deOptimal` after the cap and window search resolve `actualStrips`: `actualDur = totalDeBase / ratio`. This preserves today's behavior in `scheduleSingleStageDePhase` (fewer strips → longer block).

**Flighting.** A competition is flighted when `n_pools > pool_strip_cap` (computed from `config.max_pool_strip_pct` and per-competition overrides; see METHODOLOGY §Flighting). Flighted events split the `pools` phase into two nodes:
- `pools_flight_a`: `desired_strip_count = ceil(n_pools / 2)`, `desired_refs = ceil(refs_needed / 2)`, `duration = estimatePoolDuration(flightAPools, …)`, `ready_time = dayStart(assigned_day)`.
- `pools_flight_b`: `desired_strip_count = floor(n_pools / 2)`, `desired_refs = floor(refs_needed / 2)`, `duration = estimatePoolDuration(flightBPools, …)`. Dependency edge: `pools_flight_b.ready_time = pools_flight_a.end_time + config.FLIGHT_BUFFER_MINS`.
- All DE phase nodes (`de_prelims` for STAGED, `de` for SINGLE_STAGE) depend on `pools_flight_b`, not on `pools_flight_a`.

Both flights must land on the assigned day. If `pools_flight_b.ready_time + duration > dayHardEnd(assigned_day)`, the loop emits `SAME_DAY_VIOLATION`. Different flights of the same event may land on different physical strips; Flight B's window search naturally finds available strips after Flight A's interval ends. The day-assignment layer (`analysis.ts` / `flighting.ts`) decides flighting per event before the scheduler runs; the concurrent scheduler reads that decision when building phase nodes.

**Bronze.** Bronze runs at the same time as the gold final, on a strip already held by its predecessor — bronze never allocates its own strip when the predecessor has ≥ 2 strips.

For STAGED events: `predecessor = semis_finals`. The 2-strip semis_finals block runs both semifinals in parallel, then continues into the gold-final window. Gold runs on `semis_finals.strip_indices[0]`; bronze runs on `semis_finals.strip_indices[1]` for `bronze.duration = finals_duration` ending at `semis_finals.end_time`. The bronze phase node records the timing and the chosen strip index; no new `StripAllocation` entry is written — the existing semis_finals interval already covers the strip-time. The full SF → F → bronze tail consumes 2 video strips total.

For SINGLE_STAGE events: `predecessor = de`. The `de` phase typically holds many strips (`floor(bracketSize/2)`), so bronze picks any strip other than the one chosen for the gold bout, runs for `bout_duration` ending at `de.end_time`, and is again a sub-allocation within the predecessor's interval — no new StripAllocation written.

**Soft-fail (1 strip available).** When the predecessor was capped to a single strip (e.g. semis_finals fell back to 1 video strip due to contention), there is no second strip to host bronze. Bronze runs on the gold strip after gold ends — outside the original predecessor interval — and `DE_FINALS_BRONZE_NO_STRIP` is emitted (`WARN` if videoRequired, `INFO` otherwise). This matches today's bottleneck in `scheduleBronzePhase` (`phaseSchedulers.ts:448–461`) for the no-strip case; the difference is that today's serial scheduler always writes a separate bronze allocation in the success case, while the concurrent model reuses the predecessor's strip.

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
2. **Video-required phase** over non-video — claim scarce video strips before they're contested.
3. **Larger strip_count / pod_count first** — bigger phases are hardest to fit, so place them when the strip pool is empty (least fragmented). Smaller phases backfill later.
4. **Higher constraint score** (existing `constraintScore` from `dayAssignment.ts`) — most-constrained events first; breaks ties.

Priority is local to a tick of the loop; it does not freeze global decisions. If a small phase blocks a large one, the large one falls back to a later start time on the same day via the notBefore-deferral path.

The morning-wave rule (today's `MORNING_WAVE_WINDOW_MINS = 120`) survives by deprioritizing pool phases for video-strip claims outside the wave window — pools allocate from non-video strips first when their `ready_time` is past the wave window, and only fall back to video strips on single-event days.

### Why this works for concurrency

When event A's pools allocate strips 1–30 from 8:00 to 9:15, event B's pools (next in the ready queue, same `ready_time = 8:00`) call `findAvailableStripsInWindow(30, 8:00, 75, false)` and see strips 31–80 are wide open. They allocate strips 31–60 from 8:00 to 9:15. A and B run truly concurrently. The interval-list state distinguishes "strip 35 has an allocation 8:00–9:15" from "strip 5 has an allocation 8:00–9:15," so refs and capacity reports later see both events as concurrent rather than sequential.

### Bottlenecks the concurrent scheduler emits

Scheduler-emitted variants:
- `DEADLINE_BREACH` (WARN) — emitted on attempt 1's FAILED cascade, tagged with `attempt_id=1`.
- `DEADLINE_BREACH_UNRESOLVABLE` (ERROR) — emitted on attempt 2's FAILED cascade, tagged with `attempt_id=2`.
- `SAME_DAY_VIOLATION` (ERROR) — phase ends after `dayHardEnd` of its assigned day.
- `DE_FINALS_BRONZE_NO_STRIP` (WARN if videoRequired, INFO otherwise) — bronze runs on the gold strip.
- `NO_WINDOW_DIAGNOSTIC` (INFO) — `findAvailableStripsInWindow` returned a miss; carries `reason: 'STRIPS' | 'TIME'`.
- `SEQUENCING_CONSTRAINT` (INFO/WARN) — successor's `ready_time` pushed past predecessor's natural end (indv→team gap, Vet sibling gap, DE phase order).
- `FLIGHT_B_DELAYED` (WARN) — Flight B slipped past `flightA.end + FLIGHT_BUFFER_MINS` due to strip contention.
- `VIDEO_STRIP_CONTENTION` (INFO) — video-required phase had to wait or compromise on video-strip allocation.
- `STRIP_CONTENTION` (INFO) — generic strip-pool diagnostic when no specific cause applies.

Variants emitted by other layers (day-assignment, pre-schedule analysis, post-schedule) carry forward unchanged: `CONSTRAINT_RELAXED`, `SAME_DAY_DEMOGRAPHIC_CONFLICT`, `UNAVOIDABLE_CROSSOVER_CONFLICT`, `INDIV_TEAM_ORDERING`, `PROXIMITY_PREFERENCE_UNMET`, `MULTIPLE_FLIGHTED_SAME_DAY`, `SCHEDULED_8AM_*`; `STRIP_DEFICIT_NO_FLIGHTING`, `FLIGHTING_GROUP_*`, `GENDER_EQUITY_CAP_VIOLATION`, `RESOURCE_*`, `DAY_RESOURCE_SUMMARY`; `AUTO_REF_FALLBACK`, `TWO_REF_FALLBACK`, `REFEREE_INSUFFICIENT_ACCEPTED`, `SCHEDULE_ACCEPTED_WITH_WARNINGS`, `CUT_SUMMARY`, `SAME_TIME_CROSSOVER`. `assertScheduleIntegrity` (`__tests__/engine/integration.test.ts:167–173`) continues to validate `constraint_relaxation_level` against matching `CONSTRAINT_RELAXED` bottlenecks.

## Implementation phases

Each phase ships independently and leaves the engine in a working state.

### Phase 0 — Rename `de_capacity_mode` to `de_capacity_estimation`

**Ships:** the existing config flag `de_capacity_mode: 'pod' | 'greedy'` renamed to `de_capacity_estimation: 'pod_packed' | 'spread'`. The flag is a day-assignment estimation heuristic, not a runtime allocator; the rename keeps the runtime "pod" terminology unambiguous from Phase A onward.

**Files:**
- `src/engine/types.ts` — rename `TournamentConfig.de_capacity_mode` field and the `DeCapacityMode` const.
- `src/engine/capacity.ts` — update consumers.
- `src/store/buildConfig.ts` — update bridge from store to engine.
- `__tests__/engine/capacity.test.ts` — update fixtures.
- `__tests__/helpers/factories.ts` — update default factories.
- `METHODOLOGY.md` §DE Strip Allocation Models — rename to §DE Capacity Estimation Models, reframe as a day-assignment estimation heuristic.

**Acceptance:** mechanical rename, full test suite passes.

### Phase A — Interval-list strip data model

**Ships:** the new data structure replacing `strip_free_at`, the new primitives, and a helper layer that keeps the serial scheduler running on top.

**Files:**
- `src/engine/types.ts` — add `StripAllocation`, `Pod`. Remove `strip_free_at: number[]` from `GlobalState`; add `strip_allocations: StripAllocation[][]`.
- `src/engine/resources.ts` — add `findAvailableStripsInWindow`, `allocateInterval`, `releaseEventAllocations`, `peakConcurrentStrips`, and a `nextFreeTime(strip_index): number` helper for callers needing the "next-free-time" query (walks the strip's interval list and returns the latest `end_time`, or `0` if empty). Remove `findAvailableStrips` and `strip_free_at`. Update `allocateStrips` to write into the interval list.
- `__tests__/engine/resources.test.ts` — rewrite all interval-related tests to assert against `state.strip_allocations` directly. Add tests for `findAvailableStripsInWindow` covering: overlap detection, partial overlap, video filtering, the `earliest_next_start` hint, and the `count`-strips-simultaneous-free invariant. The pre-existing "allocate same strip twice" test (`resources.test.ts:108–113`) becomes "two non-overlapping intervals on the same strip both succeed."

**Acceptance:**
- `state.strip_allocations` is the canonical strip-state representation.
- `__tests__/engine/resources.test.ts` is rewritten; full test suite passes. Any non-`resources.test.ts` failure is a real bug in the helper layer and must be fixed before Phase B starts.
- The serial scheduler continues to work via the `nextFreeTime` helper — `scheduleOne.ts`, `phaseSchedulers.ts`, `dayAssignment.ts` are not touched in this phase.

The serial scheduler's only contract with the strip representation is "I want a window of N free strips starting at time T," preserved by `nextFreeTime`. Replacing `strip_free_at` with the interval list strictly increases information without changing that contract.

### Phase B — Pod allocation primitive

**Ships:** the pod abstraction layered on Phase A's interval list.

**Files:**
- `src/engine/pods.ts` (new) — `allocatePods` and the pod-id synthesis logic.
- `__tests__/engine/pods.test.ts` (new) — pod sizing (full vs partial), video pod selection, multi-pod allocation in one call, rollback.
- `src/engine/refs.ts` — extend `computeRefRequirements` to read pod IDs from `StripAllocation[]` and report ref demand at pod granularity (one head ref per pod).

**Acceptance:** pod tests pass. `computeRefRequirements` produces the same per-day peak counts as today (pod-grouping is a presentation detail).

### Phase C — Concurrent scheduler

**Ships:** the OS-process-scheduling loop, behind a config flag.

**Files:**
- `src/engine/concurrentScheduler.ts` (new) — `scheduleAllConcurrent(competitions, config)`. Reuses `assignDaysByColoring` from `dayAssignment.ts`, then runs the priority-queue loop above.
- `src/engine/types.ts` — add `TournamentConfig.scheduler_mode: 'serial' | 'concurrent'` (default `'serial'` initially). Add `attempt_id` field to bottleneck entries.
- `src/engine/scheduler.ts` — top-level `scheduleAll` dispatches on `scheduler_mode`.
- `__tests__/engine/baselines.ts` (new) — capture and persist the actual scheduled counts produced by the serial scheduler against the integration suite, before the concurrent branch is wired in:

    ```ts
    export const SERIAL_BASELINES = {
      B1: ..., B2: ..., B3: ..., B4: ..., B5: ..., B6: ..., B7: ...,
    } as const
    ```

    These are the comparison floor.
- `__tests__/engine/concurrentScheduler.test.ts` (new):
    - Toy 2-event scenario: both events run pools concurrently on disjoint strips at the same start time.
    - Toy 3-event scenario with video contention: video-required phase wins priority over non-video. Asserts `VIDEO_STRIP_CONTENTION` is emitted.
    - Toy phase-dependency scenario: event's R16 cannot start until its pools and prelims complete.
    - Toy rollback scenario: an event whose final phase fails has all its allocations cleanly removed via `releaseEventAllocations`.
    - Toy retry scenario: an event hits FAILED on attempt 1, retries from earlier start, succeeds on attempt 2. Asserts `DEADLINE_BREACH` (WARN) on attempt 1 and no `DEADLINE_BREACH_UNRESOLVABLE`.
    - Toy deadline-breach scenario: an event hits FAILED on attempts 1 AND 2. Asserts both `DEADLINE_BREACH` and `DEADLINE_BREACH_UNRESOLVABLE` fire with the correct `attempt_id` tags.
- `__tests__/engine/integration.test.ts` — duplicate the B1–B7 scenarios with `scheduler_mode: 'concurrent'`. For B5, B6, B7 (the dense scenarios), assert strict gain over the serial baseline:

    ```ts
    expect(scheduledCount).toBeGreaterThanOrEqual(SERIAL_BASELINES.B5 + GAIN_B5)
    expect(scheduledCount).toBeGreaterThanOrEqual(SERIAL_BASELINES.B6 + GAIN_B6)
    expect(scheduledCount).toBeGreaterThanOrEqual(SERIAL_BASELINES.B7 + GAIN_B7)
    ```

    `GAIN_B*` is set to `(observed_concurrent_count − serial_count) − 1` (1-event safety margin for priority-tie non-determinism). B1–B4 keep `.toBeGreaterThanOrEqual(N)` — they are correctness scenarios, not density-gain scenarios — with N updated to whatever floor the concurrent scheduler establishes.

**Acceptance:**
- All concurrent toy tests pass with their bottleneck-emission assertions.
- `B1..B7` pass under the concurrent scheduler. `B5, B6, B7` schedule strictly more events than the serial baseline.
- Hard constraints (rest day, individual/team, deadline, Vet co-day, Vet sibling order) continue to be respected.
- `assertScheduleIntegrity` and `assertHardSeparations` pass on the concurrent output.

Inline test comments record the date the baselines were captured and the rationale, so future changes that drop concurrent counts below `SERIAL_BASELINES.B* + GAIN_B*` fail loudly.

### Phase D — Migration and cleanup

**Ships:** concurrent becomes the default, legacy scheduler removed.

**Files:**
- `src/engine/types.ts` — remove `TournamentConfig.scheduler_mode` flag. Default behavior is concurrent.
- `src/engine/scheduler.ts` — remove the serial branch.
- `src/engine/scheduleOne.ts` — delete if unused; keep with an "internal helper" docstring if `concurrentScheduler.ts` calls into per-phase helpers from it.
- `src/engine/phaseSchedulers.ts` — collapse into `concurrentScheduler.ts` if no other consumer.
- `src/engine/resources.ts` — remove the serial-only helpers (`nextFreeTime` if the concurrent scheduler does not use it).
- `__tests__/engine/integration.test.ts` — re-baseline B1–B7 thresholds to the new measured counts. Inline comments record the date.
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
