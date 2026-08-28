---
description: "Task list for P1 Foundations"
---

# Tasks: P1 Foundations

**Input**: Design documents from `specs/001-p1-foundations/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md)

**Tests**: Required. Constitution principle II is test-first, so every
behavior-changing task writes or rewrites its tests first and runs them to
confirm the expected failure before the implementation lands.

**Organization**: Grouped by user story. Phase 1 is blocking – no story starts
until the drift ledger exists.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1–US4 as prioritized in [spec.md](./spec.md)
- File paths are exact. Line numbers are as of 2026-08-27 and are hints, not
  contracts – confirm before editing.

## Execution Rules

- **Do not write implementation code into this file.** Tasks state intent and
  expected behavior. Code is written during execution.
- Run tests as `timeout 120 pnpm --silent test > ./tmp/test.log 2>&1` and read
  `./tmp/test.log` only on failure.
- **Work happens in a worktree on branch `001-p1-foundations`, and checkpoint
  commits land there.** Read-only git is unrestricted. Commit points are marked
  "(commit)" – each message carries that checkpoint's drift evidence. No agent
  pushes and no agent makes the closing commit: when the branch is ready, the
  user reviews it and lands it with `commit-with-costs`.
- Every task after T006 ends by re-running the drift ledger and reviewing the
  snapshot diff before accepting it. An unexplained diff is a bug, not noise.
- **Drift gate**: a task halts if any B1–B8 scenario schedules fewer events after
  it than before it. Resume only once the cause is identified and both counts are
  written into that task's commit message. Start-time shifts, day reassignments,
  and referee changes are expected churn and halt nothing.

---

## Phase 1: Foundational (Blocking Prerequisites)

**Purpose**: Establish the baseline every later task is measured against, and land
the shared constants and helper. No user-visible behavior change intended in
T001–T006.

**⚠️ CRITICAL**: No user story work begins until T006 is complete.

### Drift-ledger snapshot

- [X] T001 Lift the eight B-scenario fixtures into a single exported record keyed `B1`–`B8` at the top of `__tests__/engine/integration.test.ts`, preserving every fencer count and config argument exactly as written today, moving the `Source:` comment URLs onto the fixture entries, and rewriting each `describe` to read from that record. Keep the shape flat and serializable – P2's move to `src/data` consumes it.
- [X] T002 Run `timeout 120 pnpm --silent vitest run __tests__/engine/integration.test.ts > ./tmp/test.log 2>&1` and confirm 8 passed with no assertion changes.
- [X] T003 Write the drift-ledger snapshot test in `__tests__/engine/driftLedger.test.ts`, running `scheduleAll` for each of B1–B8 and snapshotting the normalized digest described in [research.md](./research.md#d2-the-drift-ledger-is-the-guard-rail-and-it-comes-first): scheduled event count and ERROR bottleneck count, full `ref_requirements_by_day`, the per-day peak the `DAY_RESOURCE_SUMMARY` line reports recomputed from `peakPoolRefDemand` and `peakDeRefDemand` the same way `concurrentScheduler.ts:1489-1496` does, `recommendRefCount`'s `{ three_weapon, foil_epee }` and `recommendStripCount`'s result from `stripBudget.ts`, and a per-event map of `assigned_day`, `pool_start`, `pool_end`, `de_start`, `de_total_end`, `pool_strip_count` with event ids sorted. Snapshot no bottleneck message strings.
- [X] T004 Run `timeout 120 pnpm --silent vitest run __tests__/engine/driftLedger.test.ts > ./tmp/test.log 2>&1`, confirm 8 snapshots written and passing on a second run, then read `__tests__/engine/__snapshots__/driftLedger.test.ts.snap` and sanity-check that B1 shows 24 scheduled events and 0 errors.
- [X] T005 Run the full suite. Expected: the 712-test baseline plus the new drift-ledger tests, 0 failed.
- [X] T006 Dispatch `test-quality-reviewer` on `__tests__/engine/driftLedger.test.ts`.

**Checkpoint**: baseline captured (commit). The drift gate is live from here.

### Per-bout duration helper and bout constants

Produces `perBoutDuration(weapon, category, vet_age_group)` and
`YOUTH_VET_BOUT_DELTA`. Nothing in this feature calls the helper besides its
tests – see [research.md](./research.md#d4-perboutduration-ships-without-a-p1-consumer).

- [X] T007 Write failing tests for `perBoutDuration` in `__tests__/engine/de.test.ts`: foil and épée at 20 for a senior category, sabre at 15, Y10 and Y8 at their weapon's value minus 5 across all three weapons (so sabre for Y10 is 10), every `VetAgeGroup` value at minus 5 including `VET_COMBINED`, a senior category unaffected, and an explicit assertion that **Y12 and Y14 are unaffected**.
- [X] T008 Run `timeout 120 pnpm --silent vitest run __tests__/engine/de.test.ts > ./tmp/test.log 2>&1`. Expected: FAIL – `perBoutDuration` is not exported.
- [X] T009 In `src/engine/constants.ts:69-73`, change `DE_BOUT_DURATION.SABRE` from 10 to 15 and add `YOUTH_VET_BOUT_DELTA = -5`. Comment that per-bout time includes the 5-minute strip-changeover overhead, which is why sabre is 15 rather than the pure fencing time. Update `__tests__/engine/constants.test.ts`.
- [X] T010 Implement `perBoutDuration` in `src/engine/de.ts`: the weapon's base duration plus the delta when the category is Y8 or Y10 **or** `vet_age_group` is non-null. The veteran arm keys off `vet_age_group`, not category, so `VET_COMBINED` is covered. Y12 and Y14 take the plain weapon duration.
- [X] T011 Run `timeout 120 pnpm --silent vitest run __tests__/engine/de.test.ts __tests__/engine/constants.test.ts > ./tmp/test.log 2>&1`. Expected: PASS.
- [X] T012 Run the full suite and review the drift-ledger diff. `DE_BOUT_DURATION` is read by `capacity.ts` in `podDeStripHours`, `greedyDeStripHours`, and `teamDeStripHours`, so the sabre change shifts day-assignment capacity estimates for sabre events. Day reassignments and time shifts are expected churn – a *drop* in scheduled event count is a finding.
- [X] T013 Accept the snapshot once the diff is explained, then dispatch `test-quality-reviewer`.

**Checkpoint**: foundation ready (commit). User story work can begin.

---

## Phase 2: User Story 1 - Referee numbers an organizer can staff against (Priority: P1) 🎯 MVP

**Goal**: One referee per allocated strip on every DE path – staged, single-stage,
the day-summary line, and the referee recommendation.

**Independent Test**: The three referee outputs for a staged DE event agree, and
each equals allocated strips × the per-strip rate.

**Read [research.md D1](./research.md#d1-de-referee-demand-is-one-referee-per-strip-everywhere) before starting.** This story changes a headline output deliberately.

### Remove pod captains

Referee-side removal, separated from allocation-side removal so it can be
reviewed on its own.

- [X] T014 [US1] Remove every `podCaptainsNeeded` test and rewrite `peakDeRefDemand` expectations to `DE_REFS × active strips` with no captain addend in `__tests__/engine/refs.test.ts`. Remove the pod-captain control assertions from `__tests__/store/store.test.ts`, `__tests__/store/serialization.test.ts`, `__tests__/store/buildConfig.test.ts`, and `__tests__/components/KitchenSinkPage.test.tsx`.
- [X] T015 [US1] Run the full suite. Expected: FAIL in `refs.test.ts` – `peakDeRefDemand` still adds captains.
- [X] T016 [US1] Delete `podCaptainsNeeded` (`src/engine/refs.ts:14-43`) and its call site, leaving `peakDeRefDemand` (`:66-94`) returning `refsPerStrip × activeStrips`. Delete the now-unused `PodCaptainOverride` and `DeMode` imports if nothing else uses them.
- [X] T017 [US1] Remove the type and every consumer: `PodCaptainOverride` (`src/engine/types.ts:84-89`) and the `pod_captain_override` field (`:213`), the store field, setter, action, and initial-state default (`src/store/store.ts:50,58,152,199-202`), the mapping in `src/store/buildConfig.ts:45`, both serialization directions (`src/store/serialization.ts:17,42,158`), and the Pod Captain Override control with its label and options constants (`src/components/sections/TournamentSetup.tsx:2,31-37,75-76,158-175`).
- [X] T018 [US1] Add a serialization back-compat test: a saved config or shared URL containing `pod_captain_override` loads successfully with the unknown key ignored rather than throwing (FR-010).
- [X] T019 [US1] Run `timeout 180 pnpm exec tsc -b > ./tmp/tsc.log 2>&1 && echo OK` and the full suite. Expected: both clean.
- [X] T020 [US1] Review the drift-ledger diff. Expected: **no change to any schedule time or event count** – any shift means something unintended moved. `ref_requirements_by_day` holds steady, since pod captains never entered it. The **day-summary peak** and **`recommendRefCount`** both fall by the captain addend they were carrying. A day-summary peak that does *not* move means `peakDeRefDemand` still has a captain path in it.
- [X] T021 [US1] Dispatch `test-quality-reviewer` and `react-code-reviewer`.

**Checkpoint**: (commit).

### Remove pod allocation

- [ ] T022 [US1] Write the per-strip referee tests in `__tests__/engine/concurrentScheduler.test.ts`: a staged event's `DE_PRELIMS` and `DE_ROUND_OF_16` blocks each emit ref demand equal to their allocated strip count, a single-stage event is unchanged, two concurrent events emit independent intervals, and pool phases keep their `resolveRefsPerPool` count. Delete the `computePodRefDemand` describe block from `__tests__/engine/refs.test.ts`. Note the deliberate change: a 16-strip staged DE block now reports 16 referees where it reported 4.
- [ ] T023 [US1] Rewrite the `allocateInterval` tests in `__tests__/engine/resources.test.ts` that pass a `pod_id` and assert it lands on the `StripAllocation`, replacing those assertions with `event_id`, `phase`, `start_time`, and `end_time`.
- [ ] T024 [US1] Run the full suite. Expected: FAIL in `refs.test.ts` and `resources.test.ts`.
- [ ] T025 [US1] In `tryAllocate` (`src/engine/concurrentScheduler.ts`), delete the `node.use_pods` branch entirely so STAGED DE phases take the same `findAvailableStripsInWindow` → `allocateInterval` path every other phase uses, claiming `cappedCount` strips for the phase duration as a single allocation. Preserve the branch's two behaviors that are not about pods: the `fitsInDay` pre-check with its deferral probe, and the `VIDEO_STRIP_CONTENTION` bottleneck when a video-required phase deferred. Delete `use_pods` from the `PhaseNode` type and from all six construction sites.
- [ ] T026 [US1] Replace `DEFAULT_DE_PODS = 4` and `DE_POD_SIZE = 4` (`src/engine/constants.ts:68`) with `DEFAULT_DE_STRIP_FOOTPRINT = 16`, and rewrite the explanatory comment at `concurrentScheduler.ts:458-469` so it describes a strip footprint rather than a pod count. The footprint stays 16 because `de_duration_table` is calibrated against it.
- [ ] T027 [US1] Fold staged DE into the per-strip referee path: delete `computePodRefDemand` (`src/engine/refs.ts:162-211`) and its call at `concurrentScheduler.ts:1318`, delete the `if (a.pod_id !== undefined) continue` guard at `:1258` so staged DE allocations enter the same window scan as everything else, and widen the `Phase.DE` branch at `:1303` to cover `DE_PRELIMS` and `DE_ROUND_OF_16`, all counting `stripsForEvent × DE_REFS`. Update the function's doc comment, which currently documents the pod split as the design.
- [ ] T028 [US1] Delete the dead pod surface: `src/engine/pods.ts`, `__tests__/engine/pods.test.ts`, the `Pod` interface and `StripAllocation.pod_id` (`src/engine/types.ts:319-341`), and the trailing `pod_id` parameter of `allocateInterval` (`src/engine/resources.ts:88-100`). Also update the pod-split doc comments at `concurrentScheduler.ts:241,1239`.
- [ ] T029 [US1] Run `timeout 180 pnpm exec tsc -b > ./tmp/tsc.log 2>&1 && echo OK` and the full suite.
- [ ] T030 [US1] Review the drift-ledger diff. **Referee counts rise, roughly 4× on staged DE** – that is the correction. Confirm the rise is confined to the staged NAC scenarios (B1, B2, B3, B7, B8); B6 is regional and mostly single-stage, so a large jump there means the change reached further than intended. **Schedule times are expected to hold** – one 16-strip allocation occupies the same strips for the same window as four 4-strip pod allocations did – but `findAvailableStripsInWindow` is now asked for all 16 strips in one call, so contended days may shift. Investigate any change in scheduled event count before accepting.
- [ ] T031 [US1] Run `grep -rni "pod" src/`. Expected: zero hits, including comments.
- [ ] T032 [US1] Dispatch `test-quality-reviewer`.

**Checkpoint**: US1 complete – referee demand is one per strip on every path. (commit, with the referee correction called out in the message.)

---

## Phase 3: User Story 2 - Pool durations that match what happens on the strips (Priority: P2)

**Goal**: Remove the 0.6× double-stripping reduction from pool round duration.

**Independent Test**: A single pool of 8 returns the same value as
`poolDurationForSize` for size 8.

- [ ] T033 [US2] In `__tests__/engine/pools.test.ts`, change the tests asserting the 0.6× factor for a single pool of 8 or more to assert the plain weighted average, and keep a test that a single pool of 8 now returns the same value as `poolDurationForSize` for size 8 – the clearest statement of the new behavior.
- [ ] T034 [US2] Run `timeout 120 pnpm --silent vitest run __tests__/engine/pools.test.ts > ./tmp/test.log 2>&1`. Expected: FAIL – values still scaled by 0.6.
- [ ] T035 [US2] In `src/engine/pools.ts:78-97`, make `weightedPoolDuration` return the rounded weighted average unconditionally. `estimatePoolDuration` is untouched.
- [ ] T036 [US2] Run the full suite.
- [ ] T037 [US2] Review the drift-ledger diff. Only events whose entire pool round is a single pool of 8 or more are affected – roughly 8 to 63 fencers with the single-pool override, or exactly 8 or 9 without it – and their pool duration rises by about 1.67×. Confirm the affected event list is small and consists of the events you expect. **Record B4's affected pool durations before and after** (SC-008): `docs/design/backlog.md` notes B4 already predicts 5–6 hours for Y8/Y10 pool rounds that run 2–3 hours in reality, and this change pushes them further the same way. The measured delta is what the youth-duration recalibration needs.
- [ ] T038 [US2] Dispatch `test-quality-reviewer`.

**Checkpoint**: US2 complete. (commit, with B4's before/after durations in the message.)

---

## Phase 4: User Story 3 - One DE capacity model, no hidden switch (Priority: P3)

**Goal**: Collapse the two DE capacity estimators into one table-driven model and
delete the config field that selected between them.

**Independent Test**: A SINGLE_STAGE individual event's DE strip-hours equal
`strips_allocated × table_duration / 60`, and no config field can select a model.

- [ ] T039 [US3] In `__tests__/engine/capacity.test.ts`, delete every test that sets `de_capacity_estimation` or asserts a difference between the two models. Keep and re-point the tests asserting pool strip-hours, STAGED prelims plus R16 attribution, video strip-hour attribution, and team strip-hours. Add a test asserting a SINGLE_STAGE individual event's DE strip-hours equal `strips_allocated × table_duration / 60`. Delete the `distributeEvenly` describe block at `:743-754` and its import at `:8`.
- [ ] T040 [US3] Run `timeout 120 pnpm --silent vitest run __tests__/engine/capacity.test.ts > ./tmp/test.log 2>&1`. Expected: FAIL on the new SINGLE_STAGE assertion.
- [ ] T041 [US3] Collapse `src/engine/capacity.ts:55-153,187-303` to the table-driven estimator: delete `podDeStripHours`, `podR16StripHours`, and `greedyDeStripHours`, make the SINGLE_STAGE branch `strips_allocated × totalDeDuration / 60` (matching the flat formula `podPrelimsStripHours` already uses for STAGED prelims), rename `podPrelimsStripHours` to `prelimsStripHours` and drop its unused `_weapon` parameter, and delete `distributeEvenly` and its export. **Keep `teamDeStripHours` unchanged** and keep `prevPowerOf2`, which `teamDeStripHours` uses at `:166,176`.
- [ ] T042 [US3] Remove the config flag: `DeCapacityEstimation` (`src/engine/types.ts:91-95`), the `de_capacity_estimation` field (`:235`), its assignment in `src/store/buildConfig.ts:75`, its default in `__tests__/helpers/factories.ts:67`, and its assertions in `__tests__/store/buildConfig.test.ts`. It has no store field or UI control, so nothing else references it.
- [ ] T043 [US3] Add a serialization back-compat test: a saved config containing `de_capacity_estimation` loads successfully with the unknown key ignored (FR-010).
- [ ] T044 [US3] Extend `capacity.ts`'s header comment to record that DE strip-hours are table-driven from `de_duration_table` for individual events and round-by-round for team events, with no configurable model.
- [ ] T045 [US3] Run `timeout 180 pnpm exec tsc -b > ./tmp/tsc.log 2>&1 && echo OK` and the full suite.
- [ ] T046 [US3] Review the drift-ledger diff. The default was `pod_packed`, so SINGLE_STAGE individual events move from bout-based-scaled strip-hours to the flat table formula. Capacity estimates feed day-assignment penalties, so expect day reassignments on the regional scenarios (B4, B6) where SINGLE_STAGE dominates. Scheduled counts should hold – if a scenario loses events, record before and after counts in the commit message so the P2 re-baseline has the history.
- [ ] T047 [US3] Dispatch `test-quality-reviewer`.

**Checkpoint**: US3 complete. (commit.)

---

## Phase 5: User Story 4 - Phases that start when strips actually free up (Priority: P4)

**Goal**: `SLOT_MINS` 30 → 5.

**Independent Test**: A time of 13:03 snaps to 13:05, and the drift ledger shows
start times moving earlier with scheduled counts holding or rising.

Isolated as the last behavior change because it is the one most likely to move
every scenario and it must be reviewable alone.

- [ ] T048 [US4] Rewrite every test asserting a snapped time or the value of `SLOT_MINS` for a 5-minute grid, in `__tests__/engine/constants.test.ts` and `__tests__/engine/resources.test.ts`. `snapToSlot` at `src/engine/resources.ts:321` is believed to be the constant's only consumer – confirm with `grep -rn "SLOT_MINS" src/` rather than assuming.
- [ ] T049 [US4] Run the full suite. Expected: FAIL on snapping assertions.
- [ ] T050 [US4] Change `SLOT_MINS` from 30 to 5 in `src/engine/constants.ts:49`.
- [ ] T051 [US4] Run the full suite.
- [ ] T052 [US4] Review the drift-ledger diff. Expect broad churn and expect it to be *favorable* – deferred phases now resume at the true earliest free moment rather than rounding up to the next half hour, so start times should move earlier and scheduled counts should hold or rise. A scenario that schedules *fewer* events on a finer grid is a genuine finding.
- [ ] T053 [US4] Dispatch `test-quality-reviewer`.

**Checkpoint**: all four user stories complete. (commit.)

---

## Phase 6: Polish - Documentation and acceptance sweep

**Purpose**: `METHODOLOGY.md` describes the engine as the product's
specification, so a stale sentence in it is a real defect. All tasks touch the
same file and run sequentially.

- [ ] T054 In `METHODOLOGY.md` §Pool Duration Estimation (~line 307), delete the bullet stating that pools of 8 or more are double-stripped for a 40% reduction. The surrounding pool-sizing and scaling text stays.
- [ ] T055 Update §Slot Granularity (~line 519): phase start times snap to 5-minute boundaries, end times remain unsnapped.
- [ ] T056 Delete §Pod Captains (~lines 553-561) and the "Use pod captains" line from the Referee policy bullet under §Inputs. §Referee Calculation's remaining content is unaffected.
- [ ] T057 Rewrite §DE Capacity Estimation Models (~lines 424-477) as §DE Capacity Estimation, collapsed to one model: DE strip-hours for individual events come from `de_duration_table` times the event's strip footprint, team events use the round-by-round model. Delete the `de_capacity_estimation` configuration bullet, the pod-packed subsection, the spread subsection, and the `DE_POD_SIZE` reference.
- [ ] T058 Scrub pod language from §Strip Assignment (~lines 490-497), §Phase 5 resource allocation (~line 673), and §Concurrent Phase Scheduler (~line 566): delete the `allocatePods` paragraph, state that strips are a flat pool indexed by `Strip[]` with `video_capable` as the only categorical distinction, and that a DE phase claims a contiguous count of strips as one allocation. In §Referee Calculation, replace the derivation sentence naming `computePodRefDemand` with the rule plainly – DE phases require one referee per allocated strip, pool phases follow `refs_per_pool`, per-day peaks come from a sweep over those intervals – and record that this corrected a prior under-count on staged DE events.
- [ ] T059 Update Appendix A: `SLOT_MINS` 5, `DE_BOUT_DURATION` sabre 15, new `YOUTH_VET_BOUT_DELTA` −5, new `DEFAULT_DE_STRIP_FOOTPRINT` 16, `DE_POD_SIZE` removed. **There is no referee-grouping constant** – DE referee demand is one per strip with no grouping factor anywhere, so Appendix A must not introduce one.
- [ ] T060 Update `docs/design/backlog.md` if any constant this feature surfaced changed name from what that file lists.
- [ ] T061 Run the acceptance sweep and confirm each result:

  ```text
  grep -rni "pod" src/ METHODOLOGY.md                          → nothing
  grep -rni "double[-_ ]?strip" src/ METHODOLOGY.md            → nothing
  grep -rn "de_capacity_estimation\|pod_captain_override" src/ → nothing
  timeout 180 pnpm exec tsc -b > ./tmp/tsc.log 2>&1 && echo TSC_OK
  timeout 120 pnpm --silent lint > ./tmp/lint.log 2>&1 && echo LINT_OK
  timeout 120 pnpm --silent test > ./tmp/test.log 2>&1
  ```

- [ ] T062 Read `METHODOLOGY.md` end to end and check that no remaining passage contradicts the new model.

**Checkpoint**: feature complete. (commit.)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Foundational)**: no dependencies, blocks everything. T001–T006 must
  complete before any behavior changes, since the ledger is what makes later
  drift reviewable.
- **Phase 2 (US1)**: depends on Phase 1. Pod-captain removal (T014–T021) precedes
  pod-allocation removal (T022–T032) so the two referee changes land in separate
  reviewable commits.
- **Phase 3 (US2)** and **Phase 4 (US3)**: depend on Phase 1 and are independent
  of each other and of US1 – `pools.ts` and `capacity.ts` do not overlap. They run
  sequentially anyway so each one's drift diff is attributable to one change.
- **Phase 5 (US4)**: depends on Phase 1. Sequenced last by design (D6).
- **Phase 6 (Polish)**: depends on all four stories.

### Within Each Story

- Tests are written and confirmed failing before implementation.
- Typecheck and full suite before the drift review.
- Drift review before the reviewer agents.
- Reviewer agents before the commit checkpoint.

### Parallel Opportunities

Almost none, and deliberately so. Each behavior change is measured against the
ledger state the previous one left, so parallel execution would make drift
unattributable. Within a task, independent test-file edits may be batched.

---

## Notes

- Execute with `/speckit-implement`, dispatching tasks to subagents per
  `superpowers:subagent-driven-development`. Subagent prompts must state that
  **subagents never push and never make the closing commit**.
- Skip `/speckit-implement`'s ignore-file step. The project's `.gitignore`
  already exists and is correct.
- Mark each task `[X]` as it completes.
- An unexplained snapshot diff is a bug, not noise.
