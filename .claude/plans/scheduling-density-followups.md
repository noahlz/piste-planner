# Scheduling Density — Findings and Next-Session Investigation Brief

> Supersedes `stage-6-scheduling-density-remaining.md` (deleted 2026-04-22).
> Captures what Stage 6 attempted, what worked, what didn't, and what to try next.
>
> **Update 2026-04-22 (post-refs-as-output):** Referees were removed as a scheduler input. The engine now assumes infinite refs during scheduling and reports per-day peak ref demand as an output (`ref_requirements_by_day`). The `refs-as-output.md` plan is complete and deleted. This doc has been revised to reflect that change — sections referring to `config.referee_availability`, `refs.fe` / `refs.saber` test-helper args, `saber_scarcity` / `ref_weight` penalties, `refsAvailableOnDay`, and `minRefsForEvents` no longer describe current code.

## TL;DR

Stage 6 shipped structural refactors (phase-scheduler extraction, `EventTxLog` rollback primitive, video-strips-for-pools rule) but **did not improve scheduling density**. The headline fix — phase-major scheduling — was attempted and reverted. Refs-as-output (2026-04-22) simplified the scheduler but did not unlock new density wins and caused a B4 regression from the new `saberPileupPenalty`.

B5 / B7 remain the primary density targets and are unchanged from before.

## Current B-scenario state

Counts show actual `scheduled` events from integration tests (`__tests__/engine/integration.test.ts`).

| Scenario | Pre-Stage-5 | Pre-Stage-6 | Post-Stage-6 | Post-wave-bump | **Post-refs-as-output (current)** | Stage-6 target | Met? |
|---|---|---|---|---|---|---|---|
| B1 (Feb 2026 NAC, 4d / 24 events)    | 15 | 14 | 13 | 13 | **13** | ≥15 | ✗ |
| B2 (Nov 2025 NAC, 4d / 24 events)    | 10 | 11 | 9  | 9  | **9**  | ≥10 | ✗ |
| B3 (Mar 2026 NAC Youth, 4d / 24)     | 5  | 7  | 5  | 5  | **6**  | ≥7  | ✗ |
| B4 (Jan 2026 SYC, 3d / 30)           | 9  | 9  | 8  | 9  | **6**  | ≥9  | ✗ (regressed -3) |
| B5 (Jan 2026 SJCC, 3d / 12)          | 3  | 3  | 3  | 3  | **3**  | ≥8  | ✗ (primary) |
| B6 (Sep 2025 ROC, 3d / 54)           | 17 | 17 | 17 | 17 | **18** | ≥17 | ✓ |
| B7 (Oct 2025 NAC, 4d / 18)           | 4  | 4  | 4  | 4  | **4**  | ≥10 | ✗ (primary) |

### Refs-as-output delta summary

- B3: 5 → 6 (+1), B6: 17 → 18 (+1). Small incidental wins from removing ref gating.
- B4: 9 → 6 (-3). `saberPileupPenalty` (table: 0, 0.5, 2.0, 10.0, 50.0 for 0..4+ saber events on one day) forces saber events to spread more aggressively across B4's 3-day window of 10 saber events, changing day-coloring in ways that cascade into more capacity exhaustion. Plan anticipated this risk and accepted it.
- Everything else unchanged.

If B4's regression is unacceptable, tune `SABER_PILEUP_PENALTY_TABLE` in `src/engine/dayAssignment.ts` downward (e.g., halve each entry) and retest. Exported table makes this trivial.

## What was attempted in Stage 6

### Shipped (commit ff07f33476)
- **Phase-scheduler extraction** — `src/engine/phaseSchedulers.ts` exports 6 named phase functions; `scheduleCompetition` is now a thin orchestrator. Non-functional refactor.
- **`EventTxLog` + `rollbackEvent`** — transactional per-event rollback primitive with object-identity tracking for ref allocations. Correct for interleaved txLogs. Currently unused by the scheduler (event-major doesn't need it) but ready for future phase-major work. *(Note: refs-as-output changed the tracked object from `ReleaseEvent` to `RefDemandInterval`; identity-based rollback still works.)*
- **Video-strips-for-pools rule** — `MORNING_WAVE_WINDOW_MINS = 120`. Pools may consume video strips only during the morning wave OR on single-event days. Aligned with METHODOLOGY.md §Video Strip Preservation.

### Attempted and reverted
- **Phase-major per-day scheduling loop** (Task 3). Full postmortem inline in `src/engine/scheduler.ts` Phase 3 comment block, `src/engine/phaseSchedulers.ts` module docstring, and `__tests__/engine/scheduler.test.ts` footer.
  - Blocker (a) — **strip rollback is order-dependent**: `state.strip_free_at` stores only the latest endTime. When two events allocate the same strip across phases in phase-major, reverting them in failure order (not allocation order) corrupts state. A correct fix requires an interval-list-per-strip data model (see Hypothesis 6 below).
  - Blocker (b) — **density regressed**: B5 went 3 → 0, B7 went 4 → 0 because clustering R16/Finals across events created concurrent video-strip contention that event-major serialization avoids.

## Why the video-for-pools rule regressed B1–B4

Pool rounds are long relative to the morning wave:

```
DEFAULT_POOL_ROUND_DURATION_TABLE (src/engine/constants.ts)
  EPEE  = 120 min per round
  FOIL  = 105 min per round
  SABRE =  75 min per round
```

Pre-refs-as-output, pools held FE refs for the round duration. The wave-bump to 120 mins (from 60) gave the second event's pool room to start within the wave. With refs no longer a gating resource, this rationale is now purely about strip contention — the wave-bump is still beneficial because the first pool's strips are held for 75-120 mins regardless of refs.

## Strategy for B5 / B7 — "give more resources, then right-size"

B5 and B7 are configured against tight resource budgets (B5 = 3 days × 60 strips × 8 video). Every event fails because the budget is genuinely insufficient, not because the scheduler is wrong.

*(Note: with refs-as-output, refs are no longer a budget dimension. The budget is days × strips × video strips. Anything the scheduler can't fit is a capacity shortfall, not a ref shortfall. `ref_requirements_by_day` output tells the organizer how many refs they need, after the fact.)*

**Proposed approach:**

1. **Loosen the failing scenarios' configs** — bump strips, video strips, and/or days (up to 4 for B5) until the scheduler successfully places all events. This tests *scheduler correctness* rather than *density*.
2. **Read the successful schedule back** — extract peak strip-hours, peak video-strip demand, and `ref_requirements_by_day` from the output.
3. **Re-tighten the config** to the minimum needed for success. That number is the *real* capacity requirement for that event mix.
4. Compare the re-tightened numbers to the current tight configs. If the delta is large, the original configs were misspecified. If small, genuine scheduler density improvements are still needed.

This turns B5/B7 from "scheduler failures we can't explain" into "capacity sizing tests we can iterate on."

## Next-session investigation list (ordered by cost/value)

### Cheap / low-risk
1. **~~Consider tuning `SABER_PILEUP_PENALTY_TABLE`.~~** **Investigated 2026-04-23 — not actionable.** Replaced bucketed table with capacity-relative quadratic (`K * (S_day / day_saber_capacity)^2`, size-weighted, self-included) and calibrated K through {12.5, 25, 50, 100, 200}. **All five K values produced identical B-counts.** Diagnosis: instrumented `colorPenalty` and confirmed (a) the saber penalty IS dominant during saber-event placement (other components near zero), (b) it DOES differentiate candidate days (penalty values varied 4×+ across days for the same event), but (c) K is a linear scalar and cannot change ordinal day rankings, so DSatur picks the same day at every K. (d) More fundamentally, B4's failure mode is **downstream of day-coloring** — events get assigned valid days by DSatur, then 24 of 30 fail inside `scheduleCompetition` due to strip-hour exhaustion. The new formula's slight shuffle of day assignments produced a net regression (B2 9→8, B6 18→17) without recovering B4 (still 6). The old bucketed table's better numbers were lucky scheduler coincidences, not evidence of a better saber model. **Reverted.** Spec + impl plan + investigation log retained at `.claude/plans/2026-04-23-saber-pileup-capacity-relative*.md` and `tmp/calibration-log.md`. **Real targets for B4/B5/B7 density are items #2, #4, and #6 below — all touch the scheduler, not day-coloring.**

2. **Loosen B5/B7 integration test configs.** In `__tests__/engine/integration.test.ts` (helper `tournamentConfig(days, strips, videoStrips, tournamentType)` — note refs args were removed in refs-as-output), increase `strips`, `videoStrips`, and/or `days_available` for the B5 and B7 describes until all events schedule. Record the minimum config needed.

3. **Right-size downward.** From the successful schedules, compute peak strip-hours and peak video usage (existing `dayConsumedCapacity` in `capacity.ts` can help). Set the scenario config to that minimum + a small buffer.

### Medium — targeted scheduler improvement
4. **Same-day repair via re-sequencing** (old doc's Hypothesis 3). When an event fails its DE phases, the repair loop currently only tries alternate days. It could first try a different sequencing position on the same day (e.g., move the failed event earlier). `sequenceEventsForDay` is in `src/engine/daySequencing.ts`.

5. **Gate Stage 5 day expansion** (old doc's Hypothesis 4 / Stage 6 Task 7 deferred). B1's 15 → 14 regression from Stage 5 expansion may be recoverable by only expanding when the chromaticN-day distribution is actually over-packed, not just when `CAPACITY_TARGET_FILL` says so. File: `src/engine/dayColoring.ts`. Note: `colorPenalty` now also includes `saberPileupPenalty` (added by refs-as-output) — any expansion gate change should be measured with that penalty active.

### Expensive — enables phase-major retry
6. **Interval-list strip allocation.** Replace `strip_free_at: number[]` with per-strip interval lists: `strip_allocations: Array<{ eventId, startTime, endTime }>[]`. `findAvailableStrips` becomes "no allocation overlaps `[atTime, atTime + duration]`." Rollback becomes "remove entries with matching eventId." Unlocks correct phase-major rollback. Major refactor touching `resources.ts`, every allocator, and every snapshot consumer.
   - *Refs-as-output already built this shape for refs* (`RefDemandInterval[]` in `GlobalState.ref_demand_by_day`). Strip allocations can follow the same pattern; the interval-with-object-identity rollback approach is already proven.

## Files that hold the context

- `src/engine/scheduler.ts` — Phase 3 comment block: phase-major attempt postmortem.
- `src/engine/phaseSchedulers.ts` — module docstring: why phase schedulers exist as a structural artifact even though phase-major was reverted.
- `__tests__/engine/scheduler.test.ts` — footer comment: full phase-major postmortem + conditions under which to retry.
- `src/engine/constants.ts` — `MORNING_WAVE_WINDOW_MINS` (=120) and `DEFAULT_POOL_ROUND_DURATION_TABLE`.
- `src/engine/dayAssignment.ts` — `SABER_PILEUP_PENALTY_TABLE` (tunable), `saberPileupPenalty`.
- `src/engine/refs.ts` — `computeRefRequirements` (sweep-line output function).
- `src/engine/types.ts` — `RefDemandInterval`, `RefDemandByDay`, `RefRequirementsByDay`.
- `__tests__/engine/resources.test.ts` — `findAvailableStrips — poolContext video rule` describe block (tests tied to the morning wave).
- `__tests__/engine/integration.test.ts` — `buildCompetitions`, `tournamentConfig` (no longer takes refs args), `assertScheduleIntegrity` helpers and the B1–B7 scenarios.

## Environment / conventions (carry forward)

- `pnpm` not `npm`. Single file: `timeout 120 pnpm --silent vitest run <path> > ./tmp/test.log 2>&1`. Full: `timeout 180 pnpm --silent test > ./tmp/test.log 2>&1`. Read the log only on failure.
- User owns all git commits; scheduler agents do not run `git`.
- ts-morph MCP: `tsconfigPath = ./tsconfig.app.json`.
- `as const` objects, never TypeScript enums.
- Current test count: 704 passing + 1 todo across 29 test files (down from 717 as the refs-as-output refactor removed ~20 obsolete ref-input tests and added ~15 new ref-output / saber-pileup tests).
