# Phase 1 — Foundations: 5-min slots, pod removal, double-strip removal

Part of the four-phase Strip-Time Matrix Allocation Model rollout. See the
meta-plan at `~/.claude/plans/i-want-to-adjust-calm-rabin.md` for the full
vision and locked decisions.

## Context

This is a pure refactor pass. The engine's data shape and constants change,
but the auto-scheduler still uses `de_duration_table` and a single block
allocation per phase after this phase lands. The work removes two
operational fictions (pods, double-stripping) and tightens the scheduling
slot from 30 min to 5 min, establishing the data shape Phase 2's bout-level
allocator and Phase 3's matrix viewer build on.

After Phase 1, behavior should be observably identical at the
scheduled-event-count level on B1–B8, with at most ±1 event drift on the
densest scenarios from the pod-removal allocation pattern.

## Scope

### Constants (`src/engine/constants.ts`)
- `SLOT_MINS = 30 → 5`.
- `DE_BOUT_DURATION.SABRE: 10 → 15`. Foil and Epee remain at 20.
- Add `YOUTH_VET_BOUT_DELTA = -5` (applied to Y10, Y8, and all VetAgeGroup categories — these run 10-touch DE bouts instead of 15-touch).
- Document in code comments that per-bout time includes the 5-min strip-changeover overhead.

### Per-bout duration helper (`src/engine/de.ts`)
- Add `perBoutDuration(weapon: Weapon, category: Category, vet_age_group: VetAgeGroup | null): number`.
- Returns `DE_BOUT_DURATION[weapon] + (isYouthOrVet ? YOUTH_VET_BOUT_DELTA : 0)`.
- Used by Phase 2's allocator and Phase 4's editor; introduced now so Phase 1 can land the constant changes with a tested helper.

### Types (`src/engine/types.ts`)
- Delete `Pod` interface.
- Drop optional `pod_id?` field from `StripAllocation`.
- Delete `PodCaptainOverride` const and the `pod_captain_override` field on `TournamentConfig`.
- Add `VideoStageMode = { STRICT: 'STRICT', FLUID: 'FLUID' } as const` plus the type export. Add `video_stage_mode: VideoStageMode` field on `TournamentConfig` (default `'STRICT'`). The FLUID branch is a stub field in this phase; allocator wiring lands in Phase 2.

### Concurrent scheduler (`src/engine/concurrentScheduler.ts`)
- Replace every `allocatePods()` call site with a flat `findAvailableStripsInWindow → allocateInterval` sequence that produces a single non-pod allocation matching the previous peak strip count. Pod IDs are gone; the allocator just claims N strips for the phase duration.
- Remove the `use_pods: true` branch on STAGED DE phase nodes.
- `desired_strip_count` for DE phases stays computed as `min(bracketSize/2, DEFAULT_DE_PODS * DE_POD_SIZE)` for backward duration calibration. Document `DEFAULT_DE_PODS * DE_POD_SIZE = 16` as a "DE strip footprint" rather than a pod count.

### Pods file (`src/engine/pods.ts`)
- Delete the file. Remove all imports.

### Refs (`src/engine/refs.ts`)
- Delete pod-captain ref logic and any `PodCaptainOverride` branching.
- Ref demand continues to derive from `peakConcurrentStrips()` per weapon (already implemented).

### Pools (`src/engine/pools.ts`)
- Remove the `if (pool_sizes.length === 1 && pool_sizes[0] >= 8)` 0.6× double-stripping branch in `weightedPoolDuration` (around lines 90–94).
- `weightedPoolDuration` returns the plain weighted average from then on.
- `estimatePoolDuration` math unchanged.

### Capacity (`src/engine/capacity.ts`)
- Collapse `pod_packed` and `spread` models to a single estimator that uses `de_duration_table` lookup as the source-of-truth for per-event DE strip-hours.
- Remove `de_capacity_estimation` config flag and the `DeCapacityEstimation` const from `src/engine/types.ts`.
- Document the simpler model in the file header comment.

### Methodology (`METHODOLOGY.md`)
- §Pool Duration Estimation: drop the double-stripping bullet (currently around line 307).
- §Slot Granularity: change `30 min → 5 min` (line 519 narrative; constants table around line 903).
- §Pod Captains: delete the section.
- §DE Capacity Estimation Models: collapse to a single model description; delete the pod_packed / spread sub-sections.
- §Strip Assignment / Pod Allocation: scrub pod allocation language. Note that strips remain a flat pool indexed by `Strip[]` with `video_capable` as the only categorical distinction.

### Tests
- Delete `__tests__/engine/pods.test.ts`.
- Update any test that asserted on `pod_id` values to assert on `event_id + start_time + end_time + phase` instead.
- Recalibrate B1–B8 expected counts in `__tests__/engine/integration.test.ts` if any case shifts. Most should be stable since pool durations are unchanged for multi-pool events and DE strip footprint stays at 16.

## Files to modify (summary)

- `src/engine/constants.ts`
- `src/engine/types.ts`
- `src/engine/de.ts`
- `src/engine/concurrentScheduler.ts`
- `src/engine/pods.ts` (delete)
- `src/engine/refs.ts`
- `src/engine/pools.ts`
- `src/engine/capacity.ts`
- `METHODOLOGY.md`
- `__tests__/engine/pods.test.ts` (delete)
- `__tests__/engine/integration.test.ts` (recalibrate as needed)
- Any other test asserting on `pod_id` or `pod_captain_override`

## Reused functions and primitives

- `findAvailableStripsInWindow` (`resources.ts:198`) — used directly in the new flat allocation path that replaces `allocatePods()`.
- `allocateInterval` (`resources.ts:88`) — unchanged; just no longer accepts `pod_id`.
- `nextFreeTime`, `peakConcurrentStrips` (`resources.ts`) — unchanged.
- `de_duration_table` and `deBlockDurations()` (`de.ts`) — unchanged in this phase.

## Acceptance

- `pnpm typecheck` clean (no `Pod`, `pod_id`, `pod_captain_override`, `de_capacity_estimation` references in src/).
- `pnpm test` green.
- `pnpm vitest run __tests__/engine/integration.test.ts` produces B1–B8 schedule counts within ±1 event of the pre-Phase-1 baseline; per-event durations unchanged.
- `grep -rni "pod" src/` returns zero non-comment hits.
- `grep -rni "double[-_ ]?strip" src/` returns zero non-comment hits.

## Verification

```
timeout 120 pnpm --silent test > ./tmp/test.log 2>&1
timeout 120 pnpm --silent vitest run __tests__/engine/integration.test.ts > ./tmp/test.log 2>&1
```

Read `./tmp/test.log` only on failure. After tests pass, dispatch the
`test-quality-reviewer` and `react-code-reviewer` agents per project
methodology.

## Risks

- B-scenario calibration drift if any test asserted on `pod_id` content. Most should not.
- Removing the 0.6× double-strip factor for single-pool ≥8-fencer events may inflate the pool duration of a small subset of events (single-pool large youth events). Verify against B-scenarios; the affected events should be rare and the duration shift small (≤30 min on a ~120-min pool).
- `DEFAULT_DE_PODS * DE_POD_SIZE = 16` is now a magic number; rename to `DEFAULT_DE_STRIP_FOOTPRINT = 16` for clarity.

## Out of scope

- Bout-level DE allocation (Phase 2).
- Video-stage STRICT/FLUID mode logic (Phase 2 wires it; this phase only adds the type stub).
- Any visualization changes (Phase 3).
- Drag-drop editor (Phase 4).
- Empirical → computed DE duration swap (deferred; locked to hybrid model).

## Notes for the executing session

- Per project methodology: do not write code in this plan. Implementation
  happens during execution.
- User runs commits manually.
- Use Edit/Write tools for file changes; do not use shell `cat`/`sed`.
- After tests pass, run `react-code-reviewer` and `test-quality-reviewer`
  agents.
