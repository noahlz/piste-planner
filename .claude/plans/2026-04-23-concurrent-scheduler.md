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

---

## Review issues to address (added 2026-04-26)

Issues raised during a critical review of this plan. Work through these before starting Phase A. Each is small enough to resolve with a few sentences of plan revision; none require re-architecting the spine.

### Coverage gaps — phase model is incomplete

1. **Single-stage DE (non-NAC) is missing from the phase table.** Today `scheduleOne.ts:157` branches on `de_mode === DeMode.SINGLE_STAGE` and calls `scheduleSingleStageDePhase`. ROC, RYC, SYC, RJCC, SJCC events all use `SINGLE_STAGE` — that's B4, B5, B6 in the integration suite. The plan's phase table only enumerates the NAC staged-DE phases (`de_prelims`, `r16`, `quarters`, `semis_finals_bronze`). Without a `de` phase node, half the integration suite cannot run under the concurrent scheduler. **Resolution:** add a `de` phase node for `SINGLE_STAGE` events with `count = floor(bracketSize/2)`, no pods at runtime, no video requirement.

2. **Flighting is not addressed.** `phaseSchedulers.ts:494` `allocateFlightedPools` splits a flighted event into Flight A + `FLIGHT_BUFFER_MINS` + Flight B. The plan's `pools` node implicitly assumes one contiguous block. Flighting trigger is `n_pools > pool_strip_cap` (default 80%) — see METHODOLOGY §Flighting. **Resolution:** model flighting as two `pools` phase nodes (`pools_flight_a`, `pools_flight_b`) at half strip count with a dependency edge plus the buffer.

3. ~~**Team event sequencing is not addressed.**~~ **RESOLVED 2026-04-26.** Same-day indv/team sequencing (`phaseSchedulers.ts:159–172`, +120 min gap) only fires for soft-penalty pairs (cross-population crossover, e.g. Div2 ↔ Vet Team) or level-3-relaxed pairs — same-category pairs (Junior↔Junior, Cadet↔Cadet) are hard-blocked from sharing a day by `crossoverPenalty` Infinity edges. The concurrent scheduler must add a cross-event dependency edge `indiv.last_phase + INDIV_TEAM_MIN_GAP_MINS → team.first_phase` only when both events landed on the same day; this is a narrow case, not the norm.

4. **Per-event strip cap (`max_pool_strip_pct`) enforcement.** `phaseSchedulers.ts:510` calls `computeStripCap` to clamp any one event at 80% of total strips during pools (and DEs at 80% via `max_de_strip_pct`). With true concurrency this matters more, not less — one event grabbing 100% of strips kills concurrency. **Resolution:** explicitly state that the loop's step 2b passes a capped count to `findAvailableStripsInWindow`, not the desired count.

5. **Bronze fallback semantics.** `scheduleBronzePhase` (phaseSchedulers.ts:414) tries to allocate a separate bronze strip; if none available, bronze runs on the gold strip and `DE_FINALS_BRONZE_NO_STRIP` (WARN/INFO) is emitted. The plan's `semis_finals_bronze` single phase loses this conditional fallback. **Resolution:** decide whether bronze gets its own phase node with a soft-fail allocation (preferred), or bronze stays bundled and fallback is in-phase.

### Bottleneck preservation

6. **Bottleneck variants beyond `DEADLINE_BREACH_UNRESOLVABLE` must survive.** Current pipeline emits ~8 distinct variants: `DEADLINE_BREACH` (WARN, retried), `SAME_DAY_VIOLATION`, `DE_FINALS_BRONZE_NO_STRIP`, `NO_WINDOW_DIAGNOSTIC` with discriminated `STRIPS|TIME` reasons, `SEQUENCING_CONSTRAINT`, `FLIGHT_B_DELAYED`, `CONSTRAINT_RELAXED`. `assertScheduleIntegrity` (integration.test.ts:167–173) checks `constraint_relaxation_level` is reflected in matching `CONSTRAINT_RELAXED` bottlenecks. **Resolution:** Phase C acceptance criteria should enumerate every variant the new scheduler must preserve.

### Naming / conceptual collision

7. **`de_capacity_mode: 'pod' | 'greedy'` already exists as a strip-hour estimation model** in `capacity.ts` and `TournamentConfig.de_capacity_mode`. The plan's runtime pods are a different concept reusing the same word. **Resolution:** either rename one (e.g., runtime "strip groups"), or explicitly state runtime always uses pods of 4 and the existing config flag becomes day-assignment-only / vestigial.

### Design tensions

8. **"RUNNING is terminal" reduces resilience vs today's MAX_ATTEMPTS=3 retry.** Today `scheduleOne.ts:122–231` can retry an event by finding an earlier pool slot via `findEarlierSlotSameDay`. The plan's only escape is FAILED → cascade → release. On dense days (B7) where one event's late finals can be salvaged by shifting its own pool earlier, the new model gives up. **Resolution:** decide whether `releaseEventAllocations` + retry-with-earlier-start is allowed once before final FAILED.

9. **Priority factor #3 wording is inverted.** Plan says "Larger strip_count / pod_count — bigger phases are harder to fit; place them when the pool is least fragmented." But the pool is *most* empty (least fragmented) at the start, not after smaller allocations. Bigger phases should go first. **Resolution:** re-word to "place them first, when the pool is empty" — or clarify whether the intent really was to defer big phases.

10. **`releaseEventAllocations` scope is unspecified.** Today's `rollbackEvent` (resources.ts:304) restores strips, splices ref intervals by object identity, and the wrapping `restoreState` reverts `state.bottlenecks` and `state.schedule` wholesale. The plan's release function only mentions strip intervals. **Resolution:** specify whether release also touches `ref_demand_by_day` (yes — even though refs are post-schedule output, the intervals are still tagged per event), `state.schedule[event_id]`, and bottlenecks emitted during the failed pass.

11. **Loop progress semantics.** Plan caps iterations at `max_iter = sum of phase counts`. But when a popped READY phase finds no window (strip pool busy), what happens? Re-pushed with later `ready_time`? Discarded? Without a "made-progress-or-defer" rule the loop converges by exhaustion but may discard recoverable phases. **Resolution:** specify the `notBefore` advancement rule when `findAvailableStripsInWindow` returns null.

### Phase A risk

12. **"All existing tests pass unchanged" is risky.** resources.test.ts has 33+ tests asserting against `strip_free_at` semantics. Tests like resources.test.ts:108–113 (allocate same strip twice) have ambiguous behavior under the new model. Maintaining both `strip_free_at` AND interval-list as dual sources of truth is a guaranteed source of bugs during the transition. **Resolution:** either accept that Phase A changes some test expectations and update them in-phase, or commit to a strict wrapper contract with property-based tests proving equivalence.

### Acceptance criteria are too loose

13. **B5/B6/B7 density-gain claim is unfalsifiable.** Baselines are `.toBeGreaterThanOrEqual(N)` lower bounds. "Density gain expected" with no metric means a regression that still meets the lower bound passes. **Resolution:** add explicit `≥ serial_count + N` assertions to Phase C for the scenarios where density gain is the point.

### METHODOLOGY updates beyond what Phase D lists

14. ~~§Resources → Referee Allocation describes refs as a scheduling input.~~ **RESOLVED 2026-04-26.** METHODOLOGY rewritten: refs are an output, with `peak_total_refs` and `peak_saber_refs` per day. Inputs section, Resource Preconditions, Phase 5, Phase 7, Auto-Suggestion, and Appendix A all updated. Section renamed Referee Allocation → Referee Calculation.

15. ~~§Scheduling Algorithm Phase 5 repeats the "strips AND refs available" framing.~~ **RESOLVED 2026-04-26** (folded into #14).

16. **§DE Strip Allocation Models** (METHODOLOGY.md:405–459) describes the existing pod/greedy modes as runtime allocators when they are actually capacity *estimation* models. With runtime pods introduced, this section needs disambiguation or demotion to "day-assignment heuristic only."

17. **§Capacity-Aware Day Assignment** (METHODOLOGY.md:654–705): once `CAPACITY_TARGET_FILL` is re-tuned (open question in the plan), update the documented value here.

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
