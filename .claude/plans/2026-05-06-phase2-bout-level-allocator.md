# Phase 2 — Bout-level allocator (FLUID engine path)

Part of the four-phase Strip-Time Matrix Allocation Model rollout. See the
meta-plan at `~/.claude/plans/i-want-to-adjust-calm-rabin.md` for the full
vision and locked decisions. Depends on Phase 1.

## Context

Phase 1 left the engine on the empirical block model with cleaner data shape.
This phase adds the engine-side **FLUID** path: a bout-level allocator the
user invokes via `TournamentConfig.video_stage_mode = 'FLUID'` (programmatic)
or, in Phase 4, via the "Re-pack tightly" UI button.

The FLUID allocator places DE bouts onto the strips × 5-min-block matrix
greedily, honoring parent-bout dependencies and the video-strip constraint.
It produces emergent durations from `max(end_time)` of placed bouts. Default
auto-scheduling stays empirical/STRICT.

Capacity estimation, day-assignment, and validation continue to read
`de_duration_table` for per-event strip-hour estimates regardless of mode
(locked decision #10). FLUID is a runtime allocation strategy, not a
duration-prediction model.

## Scope

### DE bout DAG helpers (`src/engine/de.ts`)
- `boutsPerRound(bracketSize: number): number[]` — returns `[bracket/2, bracket/4, …, 2, 1]`. For a 256 bracket: `[128, 64, 32, 16, 8, 4, 2, 1]`. Stops at the round the engine schedules to (per `tailEstimateMins` semantics, gold/bronze are not allocated).
- `enumerateBoutDag(bracketSize, weapon, category, vet_age_group, video_start_round)` — yields topo-ordered bout descriptors:
  ```
  { round_index: number,
    bout_index: number,
    parent_indices: [number, number] | null,
    duration: number,
    requires_video: boolean }
  ```
  `parent_indices` are global bout indices (positions in the topo list). `requires_video` is set for any bout in or after `video_start_round` (looked up via the existing `VIDEO_STAGE_ROUND` constant).
- For STAGED events, the helper splits the DAG at the video-start-round boundary so the caller can route pre-video bouts through the general-strip allocator and post-video-start bouts through the video-strip allocator.

### Bout-level allocator (`src/engine/deAllocator.ts` — new file)
- `allocateBoutsGreedy(state, config, event_id, phase, bouts, video_required, day): { end_time: number, allocations_made: number } | null`
  - For each bout in topological order: compute `earliest_parent_end = max(parent.end_time)` (0 if no parents); call `findAvailableStripsInWindow(state, config, count=1, max(earliest_parent_end, dayStart(day, config)), bout.duration, video_required, day)`; if it returns `'ok'`, allocate via `allocateInterval` and record the bout's `end_time`; if it returns `'none'`, scan forward by 5-min increments until a fit or the day ends.
  - Returns the maximum `end_time` across all bouts, or `null` if the allocator hits the day boundary.
- The function is pure (no global state); takes the `state` reference and mutates only via `allocateInterval`.

### Concurrent scheduler wiring (`src/engine/concurrentScheduler.ts`)
- Read `config.video_stage_mode`. When `'FLUID'`, route:
  - DE_PRELIMS phases through `allocateBoutsGreedy(bouts=preVideoBouts, video_required=false)`
  - DE_R16 / video-stage phases through `allocateBoutsGreedy(bouts=videoBouts, video_required=true)`
  - SINGLE_STAGE DE phases through `allocateBoutsGreedy(bouts=allBouts, video_required=false)`
- When `'STRICT'`, no change from Phase 1's refactored block allocator.
- The phase-end time for the schedule output uses the allocator's emergent end. The `de_duration_table` value is still computed for capacity bookkeeping but does not gate the runtime allocation under FLUID.

### Type / constant additions
- No new types beyond Phase 1.

### Tests
- New unit tests in `__tests__/engine/deAllocator.test.ts`:
  - Bout dependency invariant: for any allocated bout, both parent bouts' `end_time` ≤ this bout's `start_time`.
  - Video-strip filtering: bouts with `requires_video=true` only land on `video_capable` strips.
  - 5-min snap: allocated `start_time` values are multiples of 5.
  - "Vet R16 held by 2-of-8 video strips" reproduction case: a small fixture where STRICT mode defers a Vet R16 by 60+ min and FLUID starts within 5 min.
- Integration tests in `__tests__/engine/integration.test.ts`:
  - Add a FLUID variant of one or two B-scenarios (B6 or B8 are good candidates since they're already density-tight). Assert: STRICT count ≤ FLUID count; FLUID end times ≤ STRICT end times.
- Snapshot or assertion tests verifying STRICT-mode B1–B8 outputs are identical to Phase 1 baseline.

### Methodology (`METHODOLOGY.md`)
- New §Video Stage Mode section after §DE Capacity Estimation, describing:
  - STRICT (default): per-round mini-batch, sync-start barrier on the first round of the video stage. Match operational reality at NACs.
  - FLUID (toggle): bouts placed greedily on any free video strip; produces a what-if schedule for densification analysis.
  - Concrete user example: the Vet 40 R16 held an hour because the Bout Committee wanted homogenous video-strip usage; FLUID models the alternative.
- Update §Concurrent Phase Scheduler narrative to acknowledge the dual code paths.

## Files to modify (summary)

- `src/engine/de.ts` (helpers)
- `src/engine/deAllocator.ts` (new)
- `src/engine/concurrentScheduler.ts` (mode dispatch)
- `__tests__/engine/deAllocator.test.ts` (new)
- `__tests__/engine/integration.test.ts` (FLUID variants)
- `METHODOLOGY.md` (new section)

## Reused functions and primitives

- `findAvailableStripsInWindow`, `allocateInterval`, `nextFreeTime` (`resources.ts`) — primitives.
- `perBoutDuration` (added in Phase 1) — bout-time source.
- `VIDEO_STAGE_ROUND` (`constants.ts`) — round at which video staging starts per category.
- `dayStart`, `dayEnd` (`types.ts`) — day boundary lookups.
- `de_duration_table` (`constants.ts`, accessed via `config`) — capacity input only; not used by the FLUID runtime.

## Acceptance

- All new unit tests pass.
- STRICT-mode B1–B8 outputs are byte-identical to Phase 1 baseline (regression guard for the dispatch wiring).
- FLUID-mode runs on B6 and B8 schedule at least as many events as STRICT and produce per-event end times ≤ STRICT.
- "Vet R16 held by 2-of-8 video strips" fixture: STRICT delays the event by ≥60 min vs day start; FLUID starts the event within 5 min of when 2 video strips are first free.
- Bout-dependency invariant test passes across all FLUID-mode B-scenario runs.
- METHODOLOGY.md reads end-to-end without contradicting any locked decision.

## Verification

```
timeout 120 pnpm --silent vitest run __tests__/engine/deAllocator.test.ts > ./tmp/test.log 2>&1
timeout 120 pnpm --silent vitest run __tests__/engine/integration.test.ts > ./tmp/test.log 2>&1
timeout 120 pnpm --silent test > ./tmp/test.log 2>&1
```

Visual check: `PISTE_VISUALIZE=1 timeout 120 pnpm --silent vitest run __tests__/engine/integration.test.ts` — ASCII output should show fluid bout placements in FLUID-mode runs (many short rectangles per strip vs the STRICT-mode single block).

## Risks

- **Allocator complexity**: bout-level greedy is O(B × S × T) in the worst case (B bouts × S strips × T forward-scan steps). For B7 (largest currently scheduled) ~few thousand bouts × 80 strips × ~150 5-min slots = a few tens of millions of operations per day. Should be fast enough for the in-process scheduler but worth profiling.
- **Forward-scan termination**: the inner `findAvailableStripsInWindow → forward scan` loop must have a bounded iteration count (use the same `MAX_RESCHEDULE_ATTEMPTS` style guard or scan by 5-min steps until `dayEnd`). No infinite loops permitted.
- **Day-boundary handling**: a bout that can't fit before `dayEnd(day, config)` should fall out and be reported as a bottleneck; the allocator returns `null` and the scheduler falls back to `STRICT` for that event (or surfaces the failure — decide during implementation).
- **STRICT-mode regression**: any change to the dispatch wiring risks shifting STRICT B1–B8 outputs. Snapshot the Phase 1 baseline before starting Phase 2 and assert byte-identity in tests.

## Out of scope

- Visualization (Phase 3).
- UI controls for the FLUID toggle (Phase 3 minimum, Phase 4 full).
- Drag-drop editor (Phase 4).
- Replacing the empirical `de_duration_table` (locked decision #10: never).
- Moving capacity estimation to bout-level math.

## Notes for the executing session

- No pre-written code in this plan. Implementation during execution.
- User runs commits manually.
- After tests pass, dispatch the `test-quality-reviewer` agent. The
  `react-code-reviewer` is not needed in this phase (no React code).
