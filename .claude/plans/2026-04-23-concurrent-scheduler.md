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
3. **Larger strip_count / pod_count first** — bigger phases are hardest to fit, so place them when the strip pool is empty (least fragmented). Smaller phases can backfill later.
4. **Higher constraint score** (existing `constraintScore` from `dayAssignment.ts`) — most-constrained events first, breaks ties.

This priority is local to a tick of the loop; it does not freeze global decisions. If a small phase blocks a large one, the large one falls back to a later start time on the same day.

### Why this works for concurrency

When event A's pools allocate strips 1–30 from 8:00 to 9:15, event B's pools (next in the ready queue, same `ready_time = 8:00`) call `findAvailableStripsInWindow(30, 8:00, 75, false)` and see strips 31–80 are wide open. They allocate strips 31–60 from 8:00 to 9:15. A and B run truly concurrently. The interval-list state distinguishes "strip 35 has an allocation 8:00–9:15" from "strip 5 has an allocation 8:00–9:15," so refs and capacity reports later see both events as concurrent rather than sequential.

## Implementation phases

Each phase ships independently and leaves the engine in a working state.

### Phase A — Interval-list strip data model

**What ships:** new data structure replacing `strip_free_at`, new primitives, helper layer that keeps the serial scheduler working.

**Files:**
- `src/engine/types.ts` — add `StripAllocation`, `Pod`. Replace `strip_free_at: number[]` with `strip_allocations: StripAllocation[][]` on `GlobalState`.
- `src/engine/resources.ts` — add `findAvailableStripsInWindow`, `allocateInterval`, `releaseEventAllocations`, `peakConcurrentStrips`. Add `nextFreeTime(strip_index): number` helper for callers that need the "next-free-time" query. Replace `findAvailableStrips` with `findAvailableStripsInWindow`. Update `allocateStrips` to write into the interval list.
- `__tests__/engine/resources.test.ts` — rewrite existing tests to assert against `state.strip_allocations` directly. Add new tests for interval-list operations: overlap detection, allocation, release, partial overlap, video-strip filtering, `earliest_next_start` hint (per issue #11).

**Acceptance:** full test suite passes. Tests in `resources.test.ts` are rewritten against the new model (per resolved issue #12). The serial scheduler continues to work via the helper layer — any non-`resources.test.ts` failure is a real bug.

**Out of scope:** the concurrent scheduler loop (Phase C). The serial scheduler keeps running through `scheduleOne.ts` / `phaseSchedulers.ts`, now backed by the interval list under the hood.

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
- `src/engine/resources.ts` — `strip_free_at` and `findAvailableStrips` are already gone (removed in Phase A per resolved issue #12). Phase D removes any helper-layer compatibility shims that were only used by the serial scheduler.
- `src/engine/types.ts` — `strip_free_at` is already gone (Phase A).
- `__tests__/engine/integration.test.ts` — re-baseline B1–B7 thresholds to the new measured counts. Document the new floor in inline comments with the date.
- `METHODOLOGY.md` — new §"Concurrent Phase Scheduler" describing the model. Existing §Strip Allocation rewritten to describe the interval-list model. §DE Strip Allocation Models renamed to §DE Capacity Estimation Models and reframed as a day-assignment heuristic only (per resolved issue #16). §Capacity-Aware Day Assignment updated with the new `CAPACITY_TARGET_FILL` value chosen empirically (per resolved issue #17). §Flighting cross-references the two-phase-node model (per resolved issue #2).

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

---

## Review issues to address (added 2026-04-26)

Issues raised during a critical review of this plan. Work through these before starting Phase A. Each is small enough to resolve with a few sentences of plan revision; none require re-architecting the spine.

### Coverage gaps — phase model is incomplete

1. ~~**Single-stage DE (non-NAC) is missing from the phase table.**~~ **RESOLVED 2026-04-26.** The phase decomposition is `de_mode`-dependent:

    | Event class | Phase decomposition |
    |---|---|
    | `de_mode === STAGED` (NACs) | `pools → de_prelims → r16 → quarters → semis_finals → bronze` |
    | `de_mode === SINGLE_STAGE` (ROC, RYC, SYC, RJCC, SJCC) | `pools → de → bronze` |

    The `de` phase node for SINGLE_STAGE:
    - `desired_strip_count = floor(bracketSize / 2)` (matches today's `deOptimal` in `scheduleSingleStageDePhase`).
    - `video_required = false` (SINGLE_STAGE never uses video, per current behavior).
    - `pod_count = 0` — runtime pods do not apply; this is a flat strip allocation, not a 4-strip-grouped DE round.
    - **Capped count via `computeStripCap(..., max_de_strip_pct, override)`** (per issue #4).
    - **Duration scaling preserved.** Today's `scheduleSingleStageDePhase` scales duration with the ratio `actualStrips / deOptimal` (fewer strips → longer block). The concurrent scheduler must do the same: after the window search returns `actualStrips`, recompute `actualDur = totalDeBase / ratio`.

    `bronze` is its own phase node — see issue #5 resolution for its semantics.

    The integration scenarios B4 / B5 / B6 (which contain only SINGLE_STAGE events) become viable under the concurrent scheduler with this addition.

2. ~~**Flighting is not addressed.**~~ **RESOLVED 2026-04-26.** Flighted events split the `pools` phase into two nodes. Trigger is unchanged: a competition is flighted when `n_pools > pool_strip_cap` (computed from `config.max_pool_strip_pct` and per-competition overrides; see METHODOLOGY §Flighting).

    **Phase nodes for a flighted event:**
    - `pools_flight_a`:
      - `desired_strip_count = ceil(n_pools / 2)` (matches `flightAPools` in `allocateFlightedPools`).
      - `desired_refs = ceil(refs_needed / 2)`.
      - `duration = estimatePoolDuration(flightAPools, wDuration, effectiveCap, refs_per_pool)`.
      - `ready_time = dayStart(assigned_day)` initially.
    - `pools_flight_b`:
      - `desired_strip_count = floor(n_pools / 2)`.
      - `desired_refs = floor(refs_needed / 2)`.
      - `duration = estimatePoolDuration(flightBPools, ...)`.
      - **Dependency edge:** `pools_flight_b.ready_time = pools_flight_a.end_time + config.FLIGHT_BUFFER_MINS`.
    - All DE phase nodes (`de_prelims` for STAGED, or `de` for SINGLE_STAGE) depend on `pools_flight_b` (the later flight), not on `pools_flight_a`.

    **Same-day invariant.** Both flights must land on the assigned day. If `pools_flight_b.ready_time + duration > dayHardEnd(assigned_day)`, the loop emits `SAME_DAY_VIOLATION` (matching today's behavior at `phaseSchedulers.ts:554`).

    **Concurrency note.** No special "same strips for both flights" constraint is needed in the concurrent model — Flight B's window search naturally finds available strips after Flight A's interval ends. Different flights of the same event can land on different physical strips, which the existing serial scheduler also permits.

    **`FLIGHT_B_DELAYED` bottleneck (per issue #6).** When Flight B cannot start at `flightA.end + FLIGHT_BUFFER_MINS` because of strip contention with another event's allocation, the loop's notBefore-deferral path (issue #11) advances `pools_flight_b.ready_time` past the ideal start. Emit `FLIGHT_B_DELAYED` (WARN) at the deferred start.

    **Phase node materialization.** Day-assignment runs first and produces a flighting decision per event (computed today by `analysis.ts` / `flighting.ts`). The concurrent scheduler reads that decision when building phase nodes — flighted events get the two-node decomposition; non-flighted events get the single `pools` node from the existing phase table.

3. ~~**Team event sequencing is not addressed.**~~ **RESOLVED 2026-04-26.** Same-day indv/team sequencing (`phaseSchedulers.ts:159–172`, +120 min gap) only fires for soft-penalty pairs (cross-population crossover, e.g. Div2 ↔ Vet Team) or level-3-relaxed pairs — same-category pairs (Junior↔Junior, Cadet↔Cadet) are hard-blocked from sharing a day by `crossoverPenalty` Infinity edges. The concurrent scheduler must add a cross-event dependency edge `indiv.last_phase + INDIV_TEAM_MIN_GAP_MINS → team.first_phase` only when both events landed on the same day; this is a narrow case, not the norm.

4. ~~**Per-event strip cap (`max_pool_strip_pct`) enforcement.**~~ **RESOLVED 2026-04-26.** With true concurrency this matters more, not less — one event grabbing 100% of strips kills concurrency. The loop's step 2b must compute the cap *before* the window search:

   ```
   pool_cap = computeStripCap(strips_total, config.max_pool_strip_pct,
                              event.max_pool_strip_pct_override)
   de_cap   = computeStripCap(strips_total, config.max_de_strip_pct,
                              event.max_de_strip_pct_override)

   capped_count = min(P.desired_strip_count, pool_cap_or_de_cap)
   ```

   - For pool phases, `capped_count` is the requested strip count for `findAvailableStripsInWindow`. Duration is recomputed from `capped_count` (fewer concurrent strips → more pool rounds → longer block); this falls out of the existing `pool_round_duration_table[weapon] × n_rounds` math.
   - For DE phases (staged or single-stage), the cap clamps `pod_count × 4` (or raw strip count for SINGLE_STAGE). When the clamp activates, the phase runs more sequential rounds within its window.
   - Per-competition overrides (`max_pool_strip_pct_override`, `max_de_strip_pct_override`) take precedence over the global config when present, matching today's `computeStripCap` contract.

5. ~~**Bronze fallback semantics.**~~ **RESOLVED 2026-04-26.** Bronze becomes its own phase node with **soft-fail** allocation. The bundled phase in the original phase table is renamed `semis_finals` (no bronze).

    **Phase node `bronze`:**
    - `desired_strip_count = 1`.
    - `pod_count = 0` (single strip — runtime pods do not apply).
    - `video_required` matches the event's finals video requirement (today's `videoRequired` parameter to `scheduleBronzePhase`).
    - **Concurrent-with-finals timing.** Bronze runs at the same time as the gold final, on a different strip. Specifically:
        - For STAGED events: `predecessor = semis_finals`. `bronze.ready_time = semis_finals.start_time + (semis_finals.duration − finals_duration)`. `bronze.duration = finals_duration`. Both end at `semis_finals.end_time`.
        - For SINGLE_STAGE events: `predecessor = de`. `bronze.ready_time = de.end_time − bout_duration`. `bronze.duration = bout_duration` (single bout slot).
    - **Strip exclusion.** The window search must exclude the strip indices held by the predecessor phase (gold final lives on one of those strips). The pod-aware `findAvailableStripsInWindow` already returns only strips with no overlapping interval, so this falls out naturally — the predecessor's strip allocations are still live during the bronze window.

    **Soft-fail semantics.** If `findAvailableStripsInWindow(1, ready_time, duration, video)` returns no fit:
    - Bronze does *not* trigger FAILED / cascade. Bronze "runs" on the gold strip (no separate allocation written). `bronze.state = RUNNING`.
    - Emit `DE_FINALS_BRONZE_NO_STRIP` with severity:
        - `WARN` if `videoRequired` (per METHODOLOGY §Video Replay Policy).
        - `INFO` otherwise.
    - This matches today's behavior in `scheduleBronzePhase` (`phaseSchedulers.ts:448–461`).

    **Video-fallback search order** (preserved from `phaseSchedulers.ts:440–445`):
    - If `videoRequired`: search video strips only (excluding the gold strip).
    - If not `videoRequired`: prefer non-video, fall back to any video strip if no non-video is free.

    Bronze allocates 1 ref for its duration (matching today's `allocateRefs(state, day, weapon, 1, ...)`).

    Updated phase table (replaces the table in §Resource model → Scheduler model):

    | Phase | Required strips | Video required? | Notes |
    |---|---|---|---|
    | `pools` (or `pools_flight_a`/`pools_flight_b`) | many | no (except special cases) | flighting per issue #2 |
    | `de_prelims` (STAGED only) | half of pool strip count | no | |
    | `r16` (STAGED only) | 4 (1 pod) or 8 (2 pods) | yes (STAGED + REQUIRED) | |
    | `quarters` (STAGED only) | 4 (1 pod) | yes | |
    | `semis_finals` (STAGED only) | 1–4 strips | yes | semis + gold final, no bronze |
    | `de` (SINGLE_STAGE only) | `floor(bracketSize/2)` | no | per issue #1 |
    | `bronze` | 1 | inherits from finals | soft-fail; concurrent with gold final |

### Bottleneck preservation

6. ~~**Bottleneck variants beyond `DEADLINE_BREACH_UNRESOLVABLE` must survive.**~~ **RESOLVED 2026-04-26.** The concurrent scheduler must continue to emit the bottleneck variants the current scheduler is responsible for. Other layers (day-assignment, pre-schedule analysis, post-schedule) are unchanged and their variants carry forward unmodified.

   **Scheduler-emitted variants the concurrent scheduler must preserve** (added to Phase C acceptance):
   - `DEADLINE_BREACH` — WARN, emitted when an event's pool slips past its day-window soft end and is retried with an earlier start (see issue #8 retry budget).
   - `DEADLINE_BREACH_UNRESOLVABLE` — ERROR, emitted when retry exhausts and the event cascade-FAILS.
   - `SAME_DAY_VIOLATION` — ERROR, emitted if a phase ends after `dayHardEnd` of its assigned day. Same-day-per-event invariant.
   - `DE_FINALS_BRONZE_NO_STRIP` — WARN/INFO, emitted when bronze must run on the gold strip (see issue #5).
   - `NO_WINDOW_DIAGNOSTIC` — INFO, emitted when `findAvailableStripsInWindow` returns null. Must carry the discriminated `reason: 'STRIPS' | 'TIME'` so consumers can tell whether the strip pool was full vs the day-window expired.
   - `SEQUENCING_CONSTRAINT` — INFO/WARN, emitted when a successor phase's `ready_time` had to be pushed past the predecessor's natural end (e.g., indv→team gap, DE phase order).
   - `FLIGHT_B_DELAYED` — WARN, emitted when Flight B cannot start at `flightA.end + FLIGHT_BUFFER_MINS` and slips later (see issue #2 flighted-pools modeling).
   - `VIDEO_STRIP_CONTENTION` — INFO, emitted when a video-required phase had to wait or compromise on video-strip allocation.
   - `STRIP_CONTENTION` — INFO, generic strip-pool diagnostic when no specific cause applies.

   **Variants from other layers — carry forward, no scheduler change required:**
   - Day-assignment: `CONSTRAINT_RELAXED`, `SAME_DAY_DEMOGRAPHIC_CONFLICT`, `UNAVOIDABLE_CROSSOVER_CONFLICT`, `INDIV_TEAM_ORDERING`, `PROXIMITY_PREFERENCE_UNMET`, `MULTIPLE_FLIGHTED_SAME_DAY`, `SCHEDULED_8AM_*`.
   - Pre-schedule analysis: `STRIP_DEFICIT_NO_FLIGHTING`, `FLIGHTING_GROUP_*`, `GENDER_EQUITY_CAP_VIOLATION`, `RESOURCE_*`, `DAY_RESOURCE_SUMMARY`.
   - Post-schedule: `AUTO_REF_FALLBACK`, `TWO_REF_FALLBACK`, `REFEREE_INSUFFICIENT_ACCEPTED`, `SCHEDULE_ACCEPTED_WITH_WARNINGS`, `CUT_SUMMARY`, `SAME_TIME_CROSSOVER`.

   `assertScheduleIntegrity` (`__tests__/engine/integration.test.ts:167–173`) checks `constraint_relaxation_level` is reflected in matching `CONSTRAINT_RELAXED` bottlenecks; this is a day-assignment concern and continues to work unchanged. Phase C tests should add explicit assertions on the scheduler-emitted variants in their natural toy scenarios (e.g., a video-contention test asserts `VIDEO_STRIP_CONTENTION` is emitted; a deadline-breach test asserts both retry warning and unresolvable error fire in the right cases).

### Naming / conceptual collision

7. ~~**`de_capacity_mode: 'pod' | 'greedy'` already exists as a strip-hour estimation model**~~ **RESOLVED 2026-04-26.** Keep "pod" as the runtime term (4 strips + 1 head ref — the natural fencing meaning). Rename the existing config flag `de_capacity_mode: 'pod' | 'greedy'` → `de_capacity_estimation: 'pod_packed' | 'spread'` to clarify it is a day-assignment estimation heuristic, not a runtime allocator. The rename is a small, mechanical change that should land *before* Phase A so the runtime "pod" terminology is unambiguous from the start. Touches: `src/engine/types.ts` (`TournamentConfig`, `DeCapacityMode` const), `src/engine/capacity.ts`, `src/store/buildConfig.ts`, `__tests__/engine/capacity.test.ts`, `__tests__/helpers/factories.ts`. METHODOLOGY §DE Strip Allocation Models (issue #16) is updated as part of the same change.

### Design tensions

8. ~~**"RUNNING is terminal" reduces resilience vs today's MAX_ATTEMPTS=3 retry.**~~ **RESOLVED 2026-04-26.** **One retry per event** before final FAILED. The retry budget is per-event, not per-phase — once any phase of an event hits FAILED, the entire event is rolled back and re-attempted from its pool start.

    **Retry mechanism:**
    1. First pass through the loop schedules the event via the normal priority queue, with `attempt_id = 1`. Phases use the dynamic notBefore-deferral from issue #11 to find later slots within the day.
    2. If any phase reaches the FAILED terminal state on attempt 1:
        - Cascade: mark all of the event's not-yet-RUNNING phases FAILED.
        - `releaseEventAllocations(state, event_id, attempt_id=1)` (per issue #10).
        - Increment `event.attempt_id` to 2.
        - Reset all phases of this event back to PENDING/READY with `pools.ready_time = dayStart(assigned_day)`.
        - Re-push the pools phase onto the ready queue.
    3. The retry runs through the loop again. If any phase reaches FAILED on attempt 2:
        - Final cascade. `releaseEventAllocations(state, event_id, attempt_id=2)`.
        - Emit `DEADLINE_BREACH_UNRESOLVABLE` (ERROR) — event is permanently unscheduled.
        - The next event in the priority queue continues unaffected.

    **Why one retry, not three.** Today's MAX_ATTEMPTS=3 in the serial scheduler exists because the serial loop only knows how to push start times *forward*. The concurrent scheduler's notBefore-deferral (issue #11) already does forward-shift dynamically inside a single pass. Retry's value is the *backward shift* (start the event earlier on the same day, freeing strip-time for the failing phase) — and one retry captures that case. Multiple retries would only help if the second attempt also failed and a third backward shift could rescue it, which is a degenerate scenario in concurrent scheduling.

    **Bottleneck preservation.** First-pass `DEADLINE_BREACH` (WARN) is emitted on attempt 1's FAILED cascade. Final `DEADLINE_BREACH_UNRESOLVABLE` (ERROR) is emitted on attempt 2's failure. Bottlenecks are tagged with `attempt_id` per issue #10's resolution so downstream consumers can distinguish "this event retried and recovered" from "this event retried and gave up."

    **Loop bound.** With one retry, total iterations are bounded by `total_phase_count × MAX_DEFERS_PER_PHASE × 2` — still well-defined.

9. ~~**Priority factor #3 wording is inverted.**~~ **RESOLVED 2026-04-26.** Standard scheduling intuition (job-shop, bin-packing) is to place the hardest-to-fit work first. Reword priority factor #3 in the §Priority function section to: *"Larger strip_count / pod_count first — bigger phases are hardest to fit, so place them when the strip pool is empty (least fragmented). Smaller phases can backfill later."* No change to ordering semantics — only the rationale was inverted in the original wording.

10. ~~**`releaseEventAllocations` scope is unspecified.**~~ **RESOLVED 2026-04-26.** The function reverts every piece of state the scheduler wrote *for this event* during the current pass. Order-independent, no snapshot/restore — each piece of state is keyed by `event_id`, so the function filters/deletes by that key.

    Concretely:
    - **`state.strip_allocations[*]`** — splice out every entry where `entry.event_id === target_event_id`. This is the canonical strip-pool revert; subsequent `findAvailableStripsInWindow` calls automatically see those intervals as free again.
    - **`state.schedule[target_event_id]`** — delete the schedule entry (or partial entry) written for this event, including any per-phase records.
    - **`state.bottlenecks`** — splice out every bottleneck entry where `entry.event_id === target_event_id` *and* `entry.attempt_id === current_attempt_id`. Bottlenecks from earlier successful events stay; bottlenecks from this failed event's prior retry attempt also stay (they explain the retry chain). This requires tagging bottlenecks with an `attempt_id` (a small per-event counter incremented each retry — see issue #8 retry budget); without that tag, retries would either lose the warning history or accumulate stale errors.
    - **`state.ref_demand_by_day`** — *not* touched directly. Per the refs-as-output model (METHODOLOGY §Referee Calculation), ref demand is derived post-schedule from `peakConcurrentStrips` over the final `strip_allocations`. The scheduler does not maintain `ref_demand_by_day` incrementally during the pass, so there is nothing per-event to revert. (If a future change reintroduces incremental ref tracking, this contract must be updated to splice ref intervals by `event_id` too.)
    - **Phase nodes for this event** — reset every phase node back to `READY` or `PENDING` per the dependency map, with `ready_time` reset to `dayStart(assigned_day)`. The retry path will re-push the pool node onto the ready queue.

    Pseudo-signature:

    ```ts
    releaseEventAllocations(state: GlobalState, event_id: string, attempt_id: number): void
    ```

11. ~~**Loop progress semantics.**~~ **RESOLVED 2026-04-26.** When `findAvailableStripsInWindow` returns null, the phase is re-pushed onto the ready queue with a strictly-greater `ready_time`. The advancement rule and termination conditions:

    **`findAvailableStripsInWindow` extended return type.** On a miss, return a hint instead of plain `null`:
    ```ts
    { fit: 'none', earliest_next_start: number | null, reason: 'STRIPS' | 'TIME' }
    ```
    `earliest_next_start` = the earliest time at which `count` strips of the right kind (video / non-video) all become simultaneously free for `duration` minutes. Computed by walking the per-strip interval lists and finding the next horizontal slice of `count` simultaneous free slots. `null` if no such slice exists before `dayHardEnd(assigned_day)`.

    **Re-push rule (in step 2d):**
    - If `earliest_next_start` is non-null and `earliest_next_start + duration ≤ dayHardEnd(assigned_day)`: set `P.ready_time = earliest_next_start`, push P back onto the ready queue. Emit a `NO_WINDOW_DIAGNOSTIC` (INFO) with `reason` from the hint and the deferred-to time. Do **not** count this against the event's retry budget — it is in-pass deferral, not a restart.
    - Otherwise: phase is unschedulable in its assigned day. `P.state = FAILED`. Cascade successors. Trigger the retry-with-earlier-start path (see issue #8) before final `DEADLINE_BREACH_UNRESOLVABLE`.

    **Monotonicity invariant.** Each re-push must satisfy `new_ready_time > old_ready_time`. If `findAvailableStripsInWindow` ever returns `earliest_next_start ≤ old_ready_time` for a re-pushed phase, that's a bug — assert and fail loudly. The invariant is what proves the loop terminates: each pop either decides a phase (RUNNING/FAILED) or strictly advances some phase's `ready_time` toward `dayHardEnd`.

    **Iteration cap.** `max_iter = total_phase_count × MAX_DEFERS_PER_PHASE` where `MAX_DEFERS_PER_PHASE` is a small constant (e.g., 16). Each phase can be re-pushed at most that many times before it is forced to FAILED — a circuit-breaker against pathological allocation states. The monotonicity invariant alone bounds the loop, but a tight bound limits worst-case work on the dense scenarios.

### Phase A risk

12. ~~**"All existing tests pass unchanged" is risky.**~~ **RESOLVED 2026-04-26.** Phase A drops the "all existing tests pass unchanged" goal. Tests in `__tests__/engine/resources.test.ts` that assert against `strip_free_at` semantics will be rewritten in Phase A to assert against the interval-list model. No dual sources of truth.

    **Revised Phase A acceptance:**
    - The interval-list (`state.strip_allocations: StripAllocation[][]`) is the canonical strip-state representation.
    - `strip_free_at` is removed in Phase A, not Phase D. The wrappers that maintained both are not introduced.
    - `findAvailableStrips` is replaced by `findAvailableStripsInWindow` (the in-window variant) immediately. Any existing call site that needs a "next-free-time" query gets a small helper that derives it from the interval list (`nextFreeTime(strip_index)` walks the strip's interval list and returns the latest `end_time`, or `0` if empty).
    - `__tests__/engine/resources.test.ts` is rewritten in Phase A. The serial scheduler is unaffected because Phase A does not touch its consumers — `scheduleOne.ts`, `phaseSchedulers.ts`, `dayAssignment.ts` continue to work via the helper. Phase B/C/D layer on top.

    **Why this is safe.** The serial scheduler's only contract with the strip representation is "I want a window of N free strips starting at time T." That contract is preserved by the helper layer. Internally, `strip_free_at` was always a lossy projection of "every interval allocated so far"; replacing it with the interval list strictly increases information without changing the contract.

    **Test scope in Phase A:**
    - Rewrite all interval-related tests in `resources.test.ts` to assert on `state.strip_allocations` directly.
    - Add new tests for `findAvailableStripsInWindow` covering: overlap detection, partial overlap, video filtering, the `earliest_next_start` hint from issue #11, and the `count`-strips-simultaneous-free invariant.
    - Tests that used to assert "allocate same strip twice" (resources.test.ts:108–113) become "two non-overlapping intervals on the same strip both succeed" — a strictly more useful assertion.
    - Run the full test suite at end of Phase A. Any non-`resources.test.ts` failure is a real bug in the helper layer and must be fixed before Phase B starts.

### Acceptance criteria are too loose

13. ~~**B5/B6/B7 density-gain claim is unfalsifiable.**~~ **RESOLVED 2026-04-26.** Phase C's integration suite must assert that the concurrent scheduler schedules *strictly more* events than the serial scheduler on the dense scenarios where density gain is the point.

    **Current serial baselines** (from `__tests__/engine/integration.test.ts`):
    - B5 (SJCC, 12 events): `≥ 3`
    - B6 (ROC, 54 events): `≥ 17`
    - B7 (NAC, 18 events): `≥ 4`

    **Phase C deliverables:**

    1. **Capture serial counts at start of Phase C.** Before the concurrent scheduler is wired into `scheduleAll`'s dispatch, run the integration suite against the serial scheduler and record the *actual* scheduled counts (not the lower-bound baselines). Persist these as constants — for example, in a `__tests__/engine/baselines.ts` module:
        ```ts
        export const SERIAL_BASELINES = {
          B1: ..., B2: ..., B3: ..., B4: ..., B5: ..., B6: ..., B7: ...,
        } as const
        ```
        These are the comparison floor for the concurrent scheduler.

    2. **Density-gain assertions.** Add explicit gain-floor assertions for B5, B6, B7 in `concurrentScheduler.test.ts` (or in `integration.test.ts` under the `scheduler_mode: 'concurrent'` re-runs):
        ```ts
        expect(scheduledCount).toBeGreaterThanOrEqual(SERIAL_BASELINES.B5 + GAIN_B5)
        expect(scheduledCount).toBeGreaterThanOrEqual(SERIAL_BASELINES.B6 + GAIN_B6)
        expect(scheduledCount).toBeGreaterThanOrEqual(SERIAL_BASELINES.B7 + GAIN_B7)
        ```
        The `GAIN_B*` constants are determined empirically during Phase C: run the concurrent scheduler against each scenario, observe the new count, and set `GAIN = (concurrent_count − serial_count) − safety_margin` where `safety_margin` is small (e.g., 1 event) to absorb non-determinism in priority tie-breaking.

    3. **Non-density scenarios still use lower-bound assertions.** B1–B4 are not specifically about density gain; they are correctness scenarios. They keep their `.toBeGreaterThanOrEqual(N)` style, with N updated to the new floor where the concurrent scheduler does better incidentally (per Phase D re-baselining).

    4. **Ratchet enforcement.** Document in inline test comments the date the baselines were captured and the rationale, so future changes that drop concurrent counts below `SERIAL_BASELINES.B* + GAIN_B*` fail loudly.

### METHODOLOGY updates beyond what Phase D lists

14. ~~§Resources → Referee Allocation describes refs as a scheduling input.~~ **RESOLVED 2026-04-26.** METHODOLOGY rewritten: refs are an output, with `peak_total_refs` and `peak_saber_refs` per day. Inputs section, Resource Preconditions, Phase 5, Phase 7, Auto-Suggestion, and Appendix A all updated. Section renamed Referee Allocation → Referee Calculation.

15. ~~§Scheduling Algorithm Phase 5 repeats the "strips AND refs available" framing.~~ **RESOLVED 2026-04-26** (folded into #14).

16. ~~**§DE Strip Allocation Models** (METHODOLOGY.md:405–459)~~ **RESOLVED-PLAN 2026-04-26 (defer execution to Phase D).** Section will be rewritten in Phase D to:
    - Rename: §DE Strip Allocation Models → §DE Capacity Estimation Models (matches the renamed config flag `de_capacity_estimation` per issue #7).
    - Reframe explicitly as "day-assignment estimation heuristic only" — the values `pod_packed | spread` describe how the day-assignment pass *estimates* DE strip-hour demand for capacity scoring, not how strips are allocated at runtime.
    - Add a cross-reference to the new §Concurrent Phase Scheduler section (introduced in Phase D per the existing Phase D deliverables) describing that runtime DE allocation always uses pods of 4 (the unit of work for one head referee), independent of the estimation heuristic.

17. ~~**§Capacity-Aware Day Assignment** (METHODOLOGY.md:654–705)~~ **RESOLVED-PLAN 2026-04-26 (defer execution to Phase D).** Phase D updates this section after re-tuning:
    - Document the new `CAPACITY_TARGET_FILL` value chosen empirically by re-running B1–B7 with progressively higher targets (per the existing "Open questions to resolve during execution" item). Inline-comment the date and the source benchmark.
    - Note that the conservative-fill rationale ("compensate for serial scheduler underutilization") no longer applies post-Phase-D; the new value reflects true concurrent capacity.

### Suggested working order

Roughly grouped from cheapest to most disruptive:

- Naming + wording fixes: #7, #9 (1–2 sentences each)
- Scope clarifications: #4, #6, #10, #11 (a paragraph each in the plan)
- Phase model additions: #1, #2, #5 (extend the phase table and dependency model). #3 also touches the dependency model, narrowly — see resolution above.
- Resilience + acceptance: #8, #12, #13 (decisions about retry budget and test strictness)
- METHODOLOGY: #14, #15, #16, #17 (defer to Phase D, but list them now so they're not forgotten)

## Follow-up code fixes (separate from concurrent scheduler)

Surfaced 2026-04-26 while resolving review issues #3. These are spec/code inconsistencies that exist in the *current* engine, independent of the concurrent scheduler. Fix in a dedicated task before or in parallel with Phase A — they are small but they affect day-assignment correctness and will skew any concurrent-scheduler benchmark on tournaments with veterans.

- **F1. Remove Vet/Vet from `INDIV_TEAM_RELAXABLE_BLOCKS`.** `src/engine/constants.ts:535` lists `{ indivCategory: VETERAN, teamCategory: VETERAN }`. Per spec (METHODOLOGY §Same-Population Conflicts), same-weapon Vet ind ↔ Vet team is hard non-relaxable. Drop the entry; the existing same-category Infinity edge from `crossoverPenalty` is what prevents same-day, and at level 3 it should *not* be relaxed. Verify no test depends on level-3 relaxation of a Vet/Vet pair.

- **F2. Veteran age-group handling in `crossoverPenalty` and a positive Vet Co-Day rule.** `src/engine/crossover.ts:78–88` ignores `vet_age_group`. Two coupled fixes:
  - Treat the effective category for Veterans as the compound `(VETERAN, vet_age_group)` pair when checking same-population. Vet 40 M Foil ind + Vet 50 M Foil ind currently return Infinity from the same-category check; they should not, because they have different vet_age_groups.
  - Add a hard rule (METHODOLOGY §Veteran Age-Group Co-Day Rule) that all Vet *individual* events for a given (gender, weapon) must share a day. This is *positive* enforcement (force-together), not the usual *negative* enforcement (block-apart) the constraint graph models. Likely needs a pre-coloring grouping pass that assigns all Vet age groups for a (gender, weapon) the same color, or a custom soft penalty with very high weight.
  - Acceptance: a test fixture with Vet 40 M Foil + Vet 50 M Foil + Vet 60 M Foil schedules all three on the same day; same fixture with Vet 40 M Foil + Vet 40 M Foil Team schedules them on different days.

- **F3. Vet age-group within-day ordering (older-first).** USA Fencing Veteran age-eligibility is nested: a fencer aged ≥80 may also fence in Vet 70, Vet 60, Vet 50, Vet 40 (older fencers can fence down). For a fencer to enter both their primary age-group event and a younger-group event on the same day, the older event must finish before the younger one begins. With F2b co-locating all Vet ind events of a (gender, weapon) on one day, the within-day start ordering becomes load-bearing.

  Currently NOT handled. `CATEGORY_START_PREFERENCES` (`src/engine/constants.ts:21–38`) gives Vet 60/70/80/Combined the same `earliest_start_offset: 120`; the engine has no relative-ordering rule between Vet age groups. The day-assignment layer only models day-level constraints; intra-day ordering would touch `scheduleOne.ts` / `phaseSchedulers.ts` (or the concurrent scheduler's priority function in Phase C).

  Required behavior (METHODOLOGY needs a new subsection): on a given Vet co-day for (gender, weapon), pools start in age-descending order: Vet 80 → Vet 70 → Vet 60 → Vet 50 → Vet 40 (Vet Combined slots in by the operator's preference; default oldest-priority placement). Older event's pools must complete before next-younger event's pools begin, so a fencer can finish their primary event and enter the next.

  Implementation sketch: bump each Vet ind event's `ready_time` by the cumulative duration of all older Vet sibling events of the same (gender, weapon). In the concurrent scheduler this is a sequencing edge between sibling phase-nodes. In the current serial scheduler, it would require either a per-event `earliest_start` adjustment computed from co-day siblings or a new dependency edge in `phaseSchedulers.ts`.

  Out of scope for F1/F2; raise as a separate review item once F2b is on main.
