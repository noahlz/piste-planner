# P1 Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove two operational fictions from the engine (DE pods, pool
double-stripping), tighten the scheduling grid from 30 minutes to 5, collapse the
dual DE capacity estimators into one table-driven model, and add the per-bout
duration helper later phases need.

**Architecture:** Pure refactor of `src/engine/`, plus the store, serialization,
and UI cleanup that removing two `TournamentConfig` fields forces. The engine's
data shape and constants change. The scheduler still allocates one block per
phase from `de_duration_table`, exactly as it does today. Every task is
guarded by a drift-ledger snapshot established in Task 1, so each change's
effect on the B1–B8 scenarios is visible as a reviewable diff rather than a
surprise at the end.

**Tech Stack:** TypeScript, Vitest, Zustand, React 19.

Supersedes `2026-05-06-phase1-foundations.md`. Design context lives in
[`2026-08-27-workbench-ui-design.md`](./2026-08-27-workbench-ui-design.md) – this
is its **P1**.

## Global Constraints

- `as const` objects, never TypeScript enums (`erasableSyntaxOnly` is on).
- Engine functions stay pure – no global state, no singletons.
- No unbounded loops – direct computation or an explicit max-iteration guard.
- Semicolons are not used to join independent clauses in prose or comments.
- Run tests as `timeout 120 pnpm --silent test > ./tmp/test.log 2>&1` and read
  `./tmp/test.log` only on failure.
- **The user runs all git commands.** Never run `git` anything. Commit points
  are marked "(user commits)".
- Do not write implementation code into this plan's steps. Steps state intent
  and expected behavior. Code gets written during execution.
- After any task that adds or edits tests, dispatch the `test-quality-reviewer`
  agent. After any task touching React, dispatch `react-code-reviewer`.

## Referee counting: a bug fix inside P1

Decided 2026-08-27: **DE referee demand is one referee per strip, everywhere.**

Today the engine produces three referee figures by three different rules:

1. **Single-stage DE** – `concurrentScheduler.ts:1303-1304` counts
   `strips × DE_REFS`, so one per strip.
2. **Staged DE** – `computePodRefDemand` emits one interval of `count = 1` per
   pod of 4 strips. It does not *add* to per-strip demand, it *replaces* it: the
   per-strip loop at `concurrentScheduler.ts:1258` skips every allocation
   carrying a `pod_id`. The referees actually running staged DE bouts were never
   counted.
3. **The day-summary line** – the `DAY_RESOURCE_SUMMARY` INFO bottleneck
   ("Day N refs: peak demand X") uses `peakDeRefDemand`, which counts one per
   strip *plus* pod captains. So the app already prints two referee numbers for
   the same staged event that disagree by roughly 4×.

Rule 2's "one head referee per pod" is pod-captain-shaped accounting standing in
for bout coverage. A bout needs a referee, and if the allocator claims 16 strips
it is because bouts run on 16 strips.

Consequence: **staged-DE referee demand rises roughly 4× against what the app
prints today**, and NAC scenarios are almost entirely staged. This is a
correction, not a regression. It lands as its own commit with the referee-report
expectations updated, and it is called out rather than folded silently into the
refactor.

After Task 3 removes pod captains, `peakDeRefDemand` reduces to
`DE_REFS × strips`, so all three paths converge on the same rule.

---

### Task 1: Drift-ledger snapshot

Establishes the baseline every later task is measured against. No behavior
change.

**Files:**
- Create: `__tests__/engine/driftLedger.test.ts`
- Create (generated): `__tests__/engine/__snapshots__/driftLedger.test.ts.snap`
- Modify: `__tests__/engine/integration.test.ts` (export the eight scenario
  fixtures so both files share one definition)

**Interfaces:**
- Produces: a named export per scenario from `integration.test.ts`, each an
  object with `fencer_counts`, `days`, `strips`, `video_strips`,
  `tournament_type`. Task 5 of the P2 plan moves these to `src/data/`, so keep
  the shape flat and serializable.

- [ ] **Step 1: Extract the eight B-scenario fixtures**

Each `describe` block in `integration.test.ts` declares its `fencerCounts` and
config inline. Lift all eight into a single exported record at the top of the
file, keyed `B1`–`B8`, preserving every fencer count and config argument exactly
as written today. Rewrite each `describe` to read from that record. The
`Source:` comment URLs move onto the fixture entries.

- [ ] **Step 2: Run the integration tests to confirm the extraction changed nothing**

Run: `timeout 120 pnpm --silent vitest run __tests__/engine/integration.test.ts > ./tmp/test.log 2>&1`
Expected: 8 passed, no assertion changes.

- [ ] **Step 3: Write the drift-ledger snapshot test**

New test file that, for each of B1–B8, runs `scheduleAll` and snapshots a
normalized digest: the scheduled event count, the ERROR-severity bottleneck
count, `ref_requirements_by_day` in full, and a per-event map of `assigned_day`,
`pool_start`, `pool_end`, `de_start`, `de_total_end`, and `pool_strip_count`,
with event ids sorted so ordering is stable. Do not snapshot bottleneck message
strings – they carry times that churn for uninteresting reasons.

Referee requirements are in the ledger specifically because Tasks 3 and 4 change
them on purpose. The snapshot is how that change gets reviewed rather than
assumed.

- [ ] **Step 4: Generate and inspect the snapshot**

Run: `timeout 120 pnpm --silent vitest run __tests__/engine/driftLedger.test.ts > ./tmp/test.log 2>&1`
Expected: 8 written snapshots, all passing on a second run. Read the generated
`.snap` and sanity-check that B1 shows 24 scheduled events and 0 errors – that
is the measured current state and confirms the ledger is wired to real output.

- [ ] **Step 5: Full suite green**

Run: `timeout 120 pnpm --silent test > ./tmp/test.log 2>&1`
Expected: 713+ passed, 0 failed.

- [ ] **Step 6: Dispatch `test-quality-reviewer` on the new test file**

- [ ] **Step 7: (user commits)**

**From here on, every task ends by re-running the drift ledger and reviewing the
snapshot diff before accepting it. An unexplained diff is a bug, not noise.**

---

### Task 2: Per-bout duration helper and bout constants

**Files:**
- Modify: `src/engine/constants.ts:69-73` (`DE_BOUT_DURATION`), plus a new
  `YOUTH_VET_BOUT_DELTA`
- Modify: `src/engine/de.ts` (new `perBoutDuration`)
- Modify: `__tests__/engine/constants.test.ts`
- Modify: `__tests__/engine/de.test.ts`

**Interfaces:**
- Produces: `perBoutDuration(weapon, category, vet_age_group)` returning minutes
  per DE bout. Consumed by P5's allocator and P4's editor. Nothing in P1 calls
  it besides its tests – it is introduced now so the constant changes land with
  a tested helper.
- Produces: `YOUTH_VET_BOUT_DELTA` (number, `-5`).

- [ ] **Step 1: Write failing tests for `perBoutDuration`**

Cover: foil and épée at 20 minutes for a senior category, sabre at 15, Y10 and
Y8 at their weapon's value minus 5, every `VetAgeGroup` value at minus 5, and a
senior category unaffected. Assert the delta applies to all three weapons, so
sabre for Y10 is 10.

- [ ] **Step 2: Run to verify failure**

Run: `timeout 120 pnpm --silent vitest run __tests__/engine/de.test.ts > ./tmp/test.log 2>&1`
Expected: FAIL – `perBoutDuration` is not exported.

- [ ] **Step 3: Change `DE_BOUT_DURATION.SABRE` from 10 to 15 and add `YOUTH_VET_BOUT_DELTA = -5`**

Document in a comment that per-bout time includes the 5-minute strip-changeover
overhead, which is why sabre is 15 rather than the pure fencing time.

- [ ] **Step 4: Implement `perBoutDuration` in `de.ts`**

Returns the weapon's base duration plus the delta when the category is Y10, Y8,
or any veteran age group – these run 10-touch DE bouts rather than 15-touch.

- [ ] **Step 5: Run the tests**

Run: `timeout 120 pnpm --silent vitest run __tests__/engine/de.test.ts __tests__/engine/constants.test.ts > ./tmp/test.log 2>&1`
Expected: PASS.

- [ ] **Step 6: Run the full suite and the drift ledger**

Run: `timeout 120 pnpm --silent test > ./tmp/test.log 2>&1`

`DE_BOUT_DURATION` is read by `capacity.ts` in `podDeStripHours`,
`greedyDeStripHours`, and `teamDeStripHours`, so the sabre change shifts
day-assignment capacity estimates for sabre events. Expect drift-ledger churn on
sabre-heavy scenarios. Review the diff: day reassignments and time shifts are
expected, a *drop* in scheduled event count is a finding worth pausing on.

- [ ] **Step 7: Accept the snapshot if the diff is explained, then dispatch `test-quality-reviewer`**

- [ ] **Step 8: (user commits)**

---

### Task 3: Remove pod captains

Referee-side pod removal. Separated from allocation-side pod removal (Task 4)
because it spans the store and UI and can be reviewed on its own.

**Files:**
- Modify: `src/engine/refs.ts:14-43` (delete `podCaptainsNeeded`), `:66-94`
  (`peakDeRefDemand`)
- Modify: `src/engine/types.ts:84-89` (delete `PodCaptainOverride`), `:213`
  (delete the `pod_captain_override` field)
- Modify: `src/store/store.ts:50,58,199-202` (state field, action, setter)
- Modify: `src/store/buildConfig.ts:45`
- Modify: `src/store/serialization.ts:17,42,158`
- Modify: `src/components/sections/TournamentSetup.tsx:2,31-37,75-76,158-175`
- Modify: `__tests__/engine/refs.test.ts`, `__tests__/store/store.test.ts`,
  `__tests__/store/serialization.test.ts`,
  `__tests__/store/buildConfig.test.ts`,
  `__tests__/components/KitchenSinkPage.test.tsx`

- [ ] **Step 1: Delete the pod-captain tests and update `peakDeRefDemand`'s tests**

Remove every `podCaptainsNeeded` test. Rewrite `peakDeRefDemand` expectations to
`DE_REFS × active strips` with no captain addend. Remove the pod-captain control
assertions from the store, serialization, buildConfig, and KitchenSinkPage
tests.

- [ ] **Step 2: Run to verify the expected failures**

Run: `timeout 120 pnpm --silent test > ./tmp/test.log 2>&1`
Expected: FAIL in `refs.test.ts` – `peakDeRefDemand` still adds captains.

- [ ] **Step 3: Delete `podCaptainsNeeded` and its call site**

`peakDeRefDemand` returns `refsPerStrip × activeStrips`. Delete the now-unused
`PodCaptainOverride` and `DeMode` imports in `refs.ts` if nothing else uses
them.

- [ ] **Step 4: Remove the type, the config field, and every consumer**

Delete `PodCaptainOverride` from `types.ts` and `pod_captain_override` from
`TournamentConfig`. Remove the store field, its setter, its `buildConfig`
mapping, and both serialization directions. Delete the Pod Captain Override
control from `TournamentSetup.tsx` along with its label and options constants.

Serialization back-compat: a saved config or shared URL containing
`pod_captain_override` must still load. Ignore the unknown key rather than
throwing – add a test for this.

- [ ] **Step 5: Typecheck and test**

Run: `timeout 180 pnpm exec tsc -b > ./tmp/tsc.log 2>&1 && echo OK`
Run: `timeout 120 pnpm --silent test > ./tmp/test.log 2>&1`
Expected: both clean.

- [ ] **Step 6: Review the drift-ledger diff**

Expected: **no change to any schedule time or event count.** Referee numbers may
move where pod captains were being added – `peakDeRefDemand` feeds the day-summary
line, not `ref_requirements_by_day`, so the ledger's referee block should hold
steady here and change in Task 4 instead. Any shift in a schedule time means
something unintended moved.

- [ ] **Step 7: Dispatch `test-quality-reviewer` and `react-code-reviewer`**

- [ ] **Step 8: (user commits)**

---

### Task 4: Remove pod allocation

**Read the "Referee counting" section above before starting.** This task changes
a headline output deliberately.

**Files:**
- Delete: `src/engine/pods.ts`, `__tests__/engine/pods.test.ts`
- Modify: `src/engine/types.ts:319-341` (`StripAllocation.pod_id`, `Pod`)
- Modify: `src/engine/resources.ts:88-100` (`allocateInterval` signature)
- Modify: `src/engine/refs.ts:133-211` (`computePodRefDemand`)
- Modify: `src/engine/concurrentScheduler.ts:9,52,74,164-165,414,431,451,470-471,486,509,529,879,912-958,1232,1258`
- Modify: `src/engine/constants.ts:68` (`DE_POD_SIZE`)
- Modify: `__tests__/engine/resources.test.ts`, `__tests__/engine/refs.test.ts`,
  `__tests__/engine/concurrentScheduler.test.ts`

**Interfaces:**
- Consumes: `findAvailableStripsInWindow` and `allocateInterval` from
  `resources.ts`, unchanged apart from `allocateInterval` losing its trailing
  `pod_id` parameter.
- Produces: `DEFAULT_DE_STRIP_FOOTPRINT = 16` in `constants.ts`, replacing
  `DE_POD_SIZE` and the local `DEFAULT_DE_PODS`.

- [ ] **Step 1: Rewrite the referee-demand tests for per-strip counting**

Delete `computePodRefDemand` outright rather than reworking it. Staged DE
allocations become ordinary allocations, so the existing per-strip loop in
`computePostScheduleRefDemand` handles them once its `pod_id` skip is gone – the
`Phase.DE` branch at `concurrentScheduler.ts:1303` already computes
`stripsForEvent × DE_REFS`, which is the rule we want for every DE phase.

Write tests in `concurrentScheduler.test.ts` asserting: a staged event's
`DE_PRELIMS` and `DE_ROUND_OF_16` blocks each emit ref demand equal to their
allocated strip count, a single-stage event is unchanged, two concurrent events
emit independent intervals, and pool phases keep their `resolveRefsPerPool`
count. Delete the `computePodRefDemand` describe block from `refs.test.ts`.

Note the deliberate change: a 16-strip staged DE block now reports 16 referees
where it reported 4.

- [ ] **Step 2: Rewrite the resources tests for the dropped parameter**

Every `allocateInterval` test that passes a `pod_id` and asserts it lands on the
`StripAllocation` becomes an assertion on `event_id`, `phase`, `start_time`, and
`end_time` instead.

- [ ] **Step 3: Run to verify failures**

Run: `timeout 120 pnpm --silent test > ./tmp/test.log 2>&1`
Expected: FAIL in `refs.test.ts` and `resources.test.ts`.

- [ ] **Step 4: Replace the pod allocation path in the scheduler**

In `tryAllocate`, delete the `node.use_pods` branch entirely. STAGED DE phases
take the same `findAvailableStripsInWindow` → `allocateInterval` path every
other phase already uses, claiming `cappedCount` strips for the phase duration
as a single allocation. Preserve the branch's two behaviors that are not about
pods: the `fitsInDay` pre-check with its deferral probe, and the
`VIDEO_STRIP_CONTENTION` bottleneck when a video-required phase deferred.

Delete `use_pods` from the `PhaseNode` type and from all six construction sites.

- [ ] **Step 5: Rename the DE strip footprint constant**

`DEFAULT_DE_PODS = 4` and `DE_POD_SIZE = 4` exist only to produce the number 16.
Replace both with `DEFAULT_DE_STRIP_FOOTPRINT = 16` in `constants.ts` and keep
the explanatory comment at `concurrentScheduler.ts:458-469`, rewritten so it
describes a strip footprint rather than a pod count. The empirical durations in
`de_duration_table` are calibrated to this footprint, which is why it stays 16.

- [ ] **Step 6: Fold staged DE into the per-strip referee path**

Delete `computePodRefDemand` from `refs.ts` and its call at
`concurrentScheduler.ts:1318`. In `computePostScheduleRefDemand`, delete the
`if (a.pod_id !== undefined) continue` guard at line 1258 so staged DE
allocations enter the same window scan as everything else, and widen the
`Phase.DE` branch at line 1303 to cover `DE_PRELIMS` and `DE_ROUND_OF_16` as
well, all counting `stripsForEvent × DE_REFS`.

Update the function's doc comment, which currently documents the pod split as
the design.

- [ ] **Step 7: Delete the dead pod surface**

Delete `src/engine/pods.ts`, `__tests__/engine/pods.test.ts`, the `Pod`
interface, and `StripAllocation.pod_id`. Drop the trailing `pod_id` parameter
from `allocateInterval`.

- [ ] **Step 8: Typecheck and test**

Run: `timeout 180 pnpm exec tsc -b > ./tmp/tsc.log 2>&1 && echo OK`
Run: `timeout 120 pnpm --silent test > ./tmp/test.log 2>&1`

- [ ] **Step 9: Review the drift-ledger diff**

This is the task most likely to move the ledger, in two distinct ways.

**Referee counts: expected to rise, roughly 4× on staged DE.** That is the
correction this task makes. Confirm the rise is confined to scenarios with
staged events – B1, B2, B3, B7, B8 are NAC and staged, B6 is regional and mostly
single-stage, so B6's referee numbers should barely move. A large jump on B6
means the change reached further than intended.

**Schedule times: expected to hold.** A single 16-strip allocation occupies the
same strips for the same window as four 4-strip pod allocations did. But
`findAvailableStripsInWindow` is now asked for all 16 strips in one call rather
than pods being carved from one window probe, so contended days may shift.
Investigate any change in scheduled event count before accepting.

- [ ] **Step 10: Confirm the pod surface is gone**

Run: `grep -rni "pod" src/`
Expected: zero hits, including comments.

- [ ] **Step 11: Dispatch `test-quality-reviewer`**

- [ ] **Step 12: (user commits)**

---

### Task 5: Collapse the DE capacity estimators

**Files:**
- Modify: `src/engine/capacity.ts:9,11,55-153,187-303`
- Modify: `src/engine/types.ts:91-95` (delete `DeCapacityEstimation`), `:235`
  (delete the field)
- Modify: `src/store/buildConfig.ts:75`
- Modify: `__tests__/engine/capacity.test.ts`, `__tests__/store/buildConfig.test.ts`

- [ ] **Step 1: Rewrite the capacity tests around one estimator**

Delete every test that sets `de_capacity_estimation` or asserts a difference
between the two models. Keep and re-point the tests that assert pool
strip-hours, STAGED prelims plus R16 attribution, video strip-hour attribution,
and team strip-hours. Add a test asserting that a SINGLE_STAGE individual
event's DE strip-hours equal `strips_allocated × table_duration / 60`.

- [ ] **Step 2: Run to verify failure**

Run: `timeout 120 pnpm --silent vitest run __tests__/engine/capacity.test.ts > ./tmp/test.log 2>&1`
Expected: FAIL on the new SINGLE_STAGE assertion.

- [ ] **Step 3: Collapse to the table-driven estimator**

Delete `podDeStripHours`, `podR16StripHours`, and `greedyDeStripHours`. The
SINGLE_STAGE branch becomes `strips_allocated × totalDeDuration / 60`, matching
the flat formula `podPrelimsStripHours` already uses for STAGED prelims. Rename
`podPrelimsStripHours` to `prelimsStripHours` and drop its unused `_weapon`
parameter.

**Keep `teamDeStripHours` unchanged.** It was never selected by the
`de_capacity_estimation` flag – team events always used it – so folding it into
the table-driven model is a separate behavioral change, out of scope here.

Delete `distributeEvenly` and `prevPowerOf2` only if nothing else imports them.
`prevPowerOf2` is used by `teamDeStripHours`, so it stays.

- [ ] **Step 4: Remove the config flag**

Delete `DeCapacityEstimation` from `types.ts`, the `de_capacity_estimation`
field from `TournamentConfig`, and its assignment in `buildConfig.ts`. It has no
store field or UI control, so nothing else references it.

- [ ] **Step 5: Update the file header comment**

`capacity.ts`'s header still describes strip-hours generically. Extend it to
record that DE strip-hours are table-driven from `de_duration_table` for
individual events and round-by-round for team events, with no configurable
model.

- [ ] **Step 6: Typecheck and test**

Run: `timeout 180 pnpm exec tsc -b > ./tmp/tsc.log 2>&1 && echo OK`
Run: `timeout 120 pnpm --silent test > ./tmp/test.log 2>&1`

- [ ] **Step 7: Review the drift-ledger diff**

The default was `pod_packed`, so SINGLE_STAGE individual events change from
bout-based-scaled strip-hours to the flat table formula. Capacity estimates feed
day-assignment penalties, so expect day reassignments on the regional scenarios
(B4, B6) where SINGLE_STAGE dominates. Scheduled counts should hold. If a
scenario loses events, record the before and after counts in the commit message
so the P2 re-baseline has the history.

- [ ] **Step 8: Dispatch `test-quality-reviewer`**

- [ ] **Step 9: (user commits)**

---

### Task 6: Remove pool double-stripping

**Files:**
- Modify: `src/engine/pools.ts:78-97` (`weightedPoolDuration`)
- Modify: `__tests__/engine/pools.test.ts`

- [ ] **Step 1: Rewrite the double-stripping tests**

Find the tests asserting the 0.6× factor for a single pool of 8 or more fencers.
Change them to assert the plain weighted average. Keep a test that a single pool
of 8 now returns the same value as `poolDurationForSize` for size 8, which is
the clearest statement of the new behavior.

- [ ] **Step 2: Run to verify failure**

Run: `timeout 120 pnpm --silent vitest run __tests__/engine/pools.test.ts > ./tmp/test.log 2>&1`
Expected: FAIL – values still scaled by 0.6.

- [ ] **Step 3: Delete the branch**

`weightedPoolDuration` returns the rounded weighted average unconditionally.
`estimatePoolDuration` is untouched.

- [ ] **Step 4: Test**

Run: `timeout 120 pnpm --silent test > ./tmp/test.log 2>&1`

- [ ] **Step 5: Review the drift-ledger diff**

Affects only events whose entire pool round is a single pool of 8 or more, which
means small events – roughly 8 to 63 fencers with the single-pool override, or
exactly 8 or 9 without it. Their pool duration rises by about 1.67×. On a
120-minute pool round that is roughly 30 extra minutes for a handful of small
veteran and team events. Confirm the affected event list is small and consists
of the events you expect.

- [ ] **Step 6: Dispatch `test-quality-reviewer`**

- [ ] **Step 7: (user commits)**

---

### Task 7: 5-minute scheduling grid

Isolated as its own task because it is the single change most likely to move
every scenario, and it must be reviewable alone.

**Files:**
- Modify: `src/engine/constants.ts:49`
- Modify: `__tests__/engine/constants.test.ts`,
  `__tests__/engine/resources.test.ts` (any `snapToSlot` expectations)

- [ ] **Step 1: Update the tests that encode 30-minute snapping**

Find every test asserting a snapped time or the value of `SLOT_MINS`. Rewrite
expectations for a 5-minute grid. `snapToSlot` in `resources.ts:321` is the only
consumer of the constant – confirm with `grep -rn "SLOT_MINS" src/` before
assuming.

- [ ] **Step 2: Run to verify failure**

Run: `timeout 120 pnpm --silent test > ./tmp/test.log 2>&1`
Expected: FAIL on snapping assertions.

- [ ] **Step 3: Change `SLOT_MINS` from 30 to 5**

- [ ] **Step 4: Test**

Run: `timeout 120 pnpm --silent test > ./tmp/test.log 2>&1`

- [ ] **Step 5: Review the drift-ledger diff**

Expect broad churn and expect it to be *favorable*: deferred phases now resume
at the true earliest free moment rather than rounding up to the next half hour,
so start times should move earlier and scheduled counts should hold or rise. A
scenario that schedules *fewer* events on a finer grid is a genuine finding –
investigate before accepting.

- [ ] **Step 6: Dispatch `test-quality-reviewer`**

- [ ] **Step 7: (user commits)**

---

### Task 8: Documentation and acceptance sweep

**Files:**
- Modify: `METHODOLOGY.md` – §Pool Duration Estimation (~line 307), §Slot
  Granularity (~line 519), §Pod Captains (~lines 553-561), §DE Capacity
  Estimation Models (~lines 424-477), §Strip Assignment interval-list and pod
  paragraphs (~lines 490-497), §Phase 5 resource allocation (~line 673),
  §Concurrent Phase Scheduler (~line 566), Appendix A constants table
- Modify: `.claude/plans/TODO.md` if any P1-surfaced constant changed name

- [ ] **Step 1: Strike double-stripping from §Pool Duration Estimation**

Delete the bullet stating that pools of 8 or more are double-stripped for a 40%
reduction. The surrounding pool-sizing and scaling text stays.

- [ ] **Step 2: Update §Slot Granularity**

Phase start times snap to 5-minute boundaries. Update the narrative and the
`SLOT_MINS` row in Appendix A. End times remain unsnapped.

- [ ] **Step 3: Delete §Pod Captains**

Remove the section and the "Use pod captains" line from the Referee policy
bullet under §Inputs. §Referee Calculation's remaining content is unaffected.

- [ ] **Step 4: Rewrite §DE Capacity Estimation Models**

Collapse to one model: DE strip-hours for individual events come from
`de_duration_table` times the event's strip footprint, and team events use the
round-by-round model. Delete the `de_capacity_estimation` configuration bullet,
the pod-packed subsection, the spread subsection, and the `DE_POD_SIZE`
constant reference. Retitle to §DE Capacity Estimation.

- [ ] **Step 5: Scrub pod language from §Strip Assignment and the scheduler sections**

Delete the `allocatePods` paragraph. State that strips are a flat pool indexed
by `Strip[]` with `video_capable` as the only categorical distinction, and that
a DE phase claims a contiguous count of strips as one allocation. Update §Phase
5 and §Concurrent Phase Scheduler where they say STAGED DE phases run as pods of
`DE_POD_SIZE`.

In §Referee Calculation, replace the derivation sentence naming
`computePodRefDemand` and state the rule plainly: DE phases require one referee
per allocated strip, pool phases follow `refs_per_pool`, and per-day peaks come
from a sweep over those intervals. Record that this corrected a prior
under-count on staged DE events.

- [ ] **Step 6: Update Appendix A**

`SLOT_MINS` 5, `DE_BOUT_DURATION` sabre 15, new `YOUTH_VET_BOUT_DELTA` −5, new
`DEFAULT_DE_STRIP_FOOTPRINT` 16, new `DE_REF_STRIP_GROUP` 4. Remove `DE_POD_SIZE`.

- [ ] **Step 7: Run the acceptance sweep**

```
grep -rni "pod" src/ METHODOLOGY.md
grep -rni "double[-_ ]?strip" src/ METHODOLOGY.md
grep -rn "de_capacity_estimation\|pod_captain_override" src/
timeout 180 pnpm exec tsc -b > ./tmp/tsc.log 2>&1 && echo TSC_OK
timeout 120 pnpm --silent lint > ./tmp/lint.log 2>&1 && echo LINT_OK
timeout 120 pnpm --silent test > ./tmp/test.log 2>&1
```

Expected: the three greps return nothing, typecheck and lint clean, full suite
green.

- [ ] **Step 8: Read METHODOLOGY.md end to end**

Check that no remaining passage contradicts the new model. The document is 976
lines and describes the engine as the product's specification, so a stale
sentence here is a real defect.

- [ ] **Step 9: (user commits)**

---

## Acceptance

- `pnpm test` green, `tsc -b` clean, `pnpm lint` clean.
- `grep -rni "pod" src/` and `grep -rni "double[-_ ]?strip" src/` return nothing.
- No references to `de_capacity_estimation` or `pod_captain_override` anywhere
  in `src/`.
- The drift-ledger snapshot has been reviewed and accepted at every task, with
  each accepted change explained in its commit message.
- DE referee demand is one referee per strip on every path – staged, single
  stage, and the day-summary line – with the increase visible and accepted in
  the drift ledger.
- A saved config containing `pod_captain_override` still loads.

## Risks

- **Task 5 drift.** Collapsing SINGLE_STAGE capacity from the bout-based scaled
  model to the flat table formula is the least behavior-preserving change in
  P1. It feeds day-assignment penalties on exactly the scenarios (B4, B6) that
  are already density-tight.
- **Task 4 referee correction is user-visible.** Staged-DE referee demand rises
  roughly 4×, which lands on every NAC scenario. `RefRequirementsReport` and its
  tests move with it. The number is more correct than what it replaces, but
  anyone who has been reading the old figures will see a step change and should
  be told why.
- **Compounding drift.** Seven behavior-affecting tasks in sequence can drift
  the scenarios well past the ±1 event the original phase-1 plan predicted. The
  drift ledger exists to make this visible per-task rather than in aggregate.
  P2 re-baselines the integration floors regardless, since B1's floor of 14 is
  already stale against an actual 24.
- **`grep -rni "pod"` false positives.** Words like "podium" would trip it.
  There are none today – confirm rather than assume when the sweep runs.

## Out of scope

- Bout-level DE allocation and the STRICT/FLUID split (P5).
- The `video_stage_mode` config field. The original phase-1 plan added it as a
  stub. It is deferred to P5, where it has a consumer – adding an unused config
  field now is exactly the kind of speculative surface the workbench design
  removed elsewhere.
- Any UI work beyond deleting the Pod Captain Override control (P3).
- Placements, derived state, presets (P2).
- Re-baselining the integration-test floors (P2).
