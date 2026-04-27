# Stop-at-Semis Scheduler Simplification

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the scheduler's strip allocation at the semifinals (today's `r16` phase). Remove gold + bronze allocation entirely. Add estimated end-time and ref-demand tail to outputs so tournament logistics still see realistic numbers.

**Architecture:** Today's `r16` phase already covers R16 → top-8 → semis (the `r16_bouts = min(30, totalBouts - 1)` formula in `de.ts`). Today's `de_finals` phase is just the gold bout (30-min minimum floor); today's bronze allocator runs the bronze bout for team events only. This plan deletes the `de_finals` and bronze allocators, trims `deBlockDurations` to two blocks, augments `de_total_end` with a tail estimate (30 min individual / 60 min team), and prunes the now-dead enum values, type fields, config knobs, and UI affordances. The serial scheduler is the only consumer touched — the concurrent scheduler does not exist yet.

**Tech Stack:** TypeScript, Vite, Vitest, React (UI form changes), Zustand (store).

**Operational rationale (from brainstorming):** At real tournaments, gold + bronze bouts are queued for ASAP strip/ref availability. Athletes accept queue waits ("if you make the gold bout, you sometimes wait an hour"). The scheduler does not need to allocate strips for these bouts. NACs get video for semis via `VideoPolicy.REQUIRED` on the r16 phase (today's behavior), which naturally extends to gold via the queue. ROCs treat video as nice-to-have (`BEST_EFFORT`), unchanged. `VideoPolicy.FINALS_ONLY` becomes operationally identical to `BEST_EFFORT` (no de_finals to scope video to) but is kept as an enum value so existing data round-trips.

---

## File Structure

**Engine source files modified (`src/engine/`):**
- `constants.ts` — add `INDIV_TAIL_MINS = 30`, `TEAM_TAIL_MINS = 60`. Remove `DE_FINALS_MIN_MINS`.
- `de.ts` — `dePhasesForBracket` returns one fewer phase per bracket size. `deBlockDurations` returns `{prelims_dur, r16_dur}` (no `finals_dur`).
- `types.ts` — `DeBlockDurations` interface drops `finals_dur`. `Phase` enum drops `DE_FINALS`, `DE_FINALS_BRONZE`, `BRONZE`. `BottleneckCause` drops `DE_FINALS_BRONZE_NO_STRIP`. `Competition` drops `de_finals_strips`, `de_finals_requirement`, `de_finals_strip_id`. `ScheduleResult` drops `de_finals_start`, `de_finals_end`, `de_finals_strip_count`, `de_bronze_start`, `de_bronze_end`, `de_bronze_strip_id`. New helper `tailEstimateMins(eventType): number`.
- `phaseSchedulers.ts` — delete `scheduleDeFinalsPhase` and `scheduleBronzePhase` plus their internal helpers and imports.
- `scheduleOne.ts` — drop the de_finals/bronze branches in both STAGED and SINGLE_STAGE arms; assign `de_total_end = r16End + tailEstimateMins(event_type)` for STAGED and `de_end + tailEstimateMins(event_type)` for SINGLE_STAGE. Trim SINGLE_STAGE `de` duration to exclude gold-bout time. Handle bracket<16 STAGED edge case (today's only DE phase was `de_finals`).
- `refs.ts` — extend ref-demand emission so the post-r16 (or post-de) tail gets a `RefDemandInterval` with count=2 (gold + bronze refs queued).
- `validation.ts`, `stripBudget.ts`, `capacity.ts` — drop references to deleted Competition fields.

**Engine tests modified (`__tests__/engine/`):**
- `de.test.ts` — update `deBlockDurations` shape and `dePhasesForBracket` return values. Drop `DE_FINALS_MIN_MINS` checks.
- `phaseSchedulers.test.ts` — delete `scheduleBronzePhase` and `scheduleDeFinalsPhase` test blocks (lines 407+ for bronze).
- `scheduleOne.test.ts` — delete bronze-related tests; add tests asserting `de_total_end` includes tail.
- `refs.test.ts` — assert tail interval emission.
- `pods.test.ts` — drop any references to removed Phase enum values.
- `validation.test.ts`, `capacity.test.ts` — drop deleted-field references.
- `integration.test.ts` — recapture B1–B7 baselines (likely improved on dense scenarios). Inline-comment date and rationale.

**Store / UI / fixtures modified:**
- `src/store/store.ts` — remove `include_finals_strip` field, setter, reset value.
- `src/store/serialization.ts` — drop `include_finals_strip` from save/load shape (keep optional read for backwards compat to avoid breaking saved tournaments).
- `src/store/buildConfig.ts` — drop `de_finals_*` field assignments.
- `src/components/sections/StripSetup.tsx` — remove the "include finals strip" UI toggle.
- `src/components/sections/CompetitionOverrides.tsx` — keep the `FINALS_ONLY` option in the dropdown (still valid enum value, behaves as BEST_EFFORT).
- `__tests__/helpers/factories.ts` — drop deleted Competition / ScheduleResult fields.
- `__tests__/store/buildConfig.test.ts` — drop assertions on deleted output fields.
- `__tests__/components/KitchenSinkPage.test.tsx` — drop `include_finals_strip` toggle assertions.

**METHODOLOGY.md** — add §"Scheduler Stops at Semis" describing the model. Update §DE Phase Breakdown to reflect 2-block split. Note tail constants and operational queueing assumption.

---

## Tasks

### Task 1 — Add tail-estimate constants and helper

**Files:**
- Modify: `src/engine/constants.ts`
- Modify: `src/engine/types.ts`
- Test: `__tests__/engine/de.test.ts`

- [ ] **Step 1: Add tail constants.** In `constants.ts`, add `INDIV_TAIL_MINS = 30` and `TEAM_TAIL_MINS = 60` as exported `as const` values (snake_case context but ALL_CAPS constants per existing file convention). Add inline comments: "Estimated minutes for the gold bout (and bronze for teams) that the scheduler does NOT allocate strips for. Tournament organizers run these ad-hoc on whatever strip frees up next. Used by ScheduleResult.de_total_end and ref-demand tail extension."

- [ ] **Step 2: Add `tailEstimateMins` helper.** In `types.ts`, alongside `dayStart`/`dayEnd`, add and export `tailEstimateMins(eventType: EventType): number`. Returns `TEAM_TAIL_MINS` for `EventType.TEAM`, otherwise `INDIV_TAIL_MINS`. Docstring: "Returns the estimated minutes for the gold (and bronze for team) bouts that follow the scheduler's last allocated phase. See METHODOLOGY.md §Scheduler Stops at Semis."

- [ ] **Step 3: Write a failing test.** In `de.test.ts` (or a new `types.test.ts` if more appropriate), add a `describe('tailEstimateMins')` block with two `it` cases: (a) returns 30 for `EventType.INDIVIDUAL`, (b) returns 60 for `EventType.TEAM`.

- [ ] **Step 4: Run the test.** Command: `timeout 120 pnpm --silent vitest run __tests__/engine/de.test.ts > ./tmp/test.log 2>&1`. Verify the new tests pass and pre-existing tests still pass. (If the helper was not yet imported in `de.test.ts`, the tests fail before step 2's import is added — fix the import.)

---

### Task 2 — Trim `deBlockDurations` to two blocks

**Files:**
- Modify: `src/engine/types.ts`
- Modify: `src/engine/de.ts`
- Test: `__tests__/engine/de.test.ts`

- [ ] **Step 1: Update the type.** In `types.ts`, change `DeBlockDurations` to have only `prelims_dur` and `r16_dur` fields. Drop `finals_dur`.

- [ ] **Step 2: Write failing tests.** In `de.test.ts`, update existing `describe('deBlockDurations')` cases so each `it` asserts the returned object has exactly `prelims_dur` and `r16_dur` keys (no `finals_dur`), with values that reflect the new formula:
  - `prelims_dur = round(totalDeDuration * prelimsBouts / totalBouts)` — unchanged formula
  - `r16_dur = totalDeDuration - prelims_dur` — absorbs everything except the gold-bout share, *but the 1-bout's worth of "gold time" is implicitly excluded by the bout split: r16_bouts continues to be `min(30, totalBouts - 1)`*
  - **Decision:** keep the bout split (prelims_bouts + r16_bouts = totalBouts - 1). New formula:
    - `prelims_dur = round(totalDeDuration * prelimsBouts / totalBouts)` (same as today)
    - `r16_dur = round(totalDeDuration * r16Bouts / totalBouts)` (same as today, just dropped from the return value)
  - Add a test for bracket=8 (no prelims): `r16_dur` covers the R16 + top-8 + semis bouts proportionally; gold's 1-bout share is unallocated (will become tail estimate).
  - Add a test for bracket=64: prelims_dur and r16_dur sum to ≤ totalDe (one bout's share missing — the gold).
  - Add a test for bracket=4 (very small): r16_bouts = min(30, 1) = 1, prelims_bouts = 0, so r16_dur = totalDe / 2 (just one bout besides gold). This is acceptable; the tail covers the rest.

- [ ] **Step 3: Run tests, verify they fail.** Command: `timeout 120 pnpm --silent vitest run __tests__/engine/de.test.ts > ./tmp/test.log 2>&1`. Expect failures referencing the missing `finals_dur` key or wrong return shape.

- [ ] **Step 4: Update `deBlockDurations`.** In `de.ts`, rewrite the function to:
  - Drop the `DE_FINALS_MIN_MINS` floor logic entirely.
  - Compute `prelimsBouts` and `r16Bouts` as today.
  - Return `{ prelims_dur: round(totalDe * prelimsBouts / totalBouts), r16_dur: round(totalDe * r16Bouts / totalBouts) }`.
  - Handle the `totalBouts <= 0` edge case by returning `{ prelims_dur: 0, r16_dur: totalDeDuration }` (puts everything in r16 to avoid divide-by-zero).
  - Drop the `DE_FINALS_MIN_MINS` import.

- [ ] **Step 5: Remove the constant.** In `constants.ts`, delete the `DE_FINALS_MIN_MINS` export. Verify no other file imports it (`grep -rn 'DE_FINALS_MIN_MINS' src/ __tests__/` should return zero hits — fix any leftover references).

- [ ] **Step 6: Run tests.** Same command as step 3. Expect all `deBlockDurations` tests to pass.

---

### Task 3 — Trim `dePhasesForBracket` to drop `DE_FINALS`

**Files:**
- Modify: `src/engine/de.ts`
- Test: `__tests__/engine/de.test.ts`

- [ ] **Step 1: Write failing tests.** In `de.test.ts`, update the `dePhasesForBracket` test cases:
  - bracket >= 64 → returns `[Phase.DE_PRELIMS, Phase.DE_ROUND_OF_16]`
  - bracket >= 16 → returns `[Phase.DE_ROUND_OF_16]`
  - bracket < 16 → returns `[Phase.DE_ROUND_OF_16]` (was `[Phase.DE_FINALS]` — we now use r16 as the single tiny-bracket DE phase; over-allocates strips slightly but keeps the model uniform)

- [ ] **Step 2: Run tests, verify failures.** Command: `timeout 120 pnpm --silent vitest run __tests__/engine/de.test.ts > ./tmp/test.log 2>&1`.

- [ ] **Step 3: Update `dePhasesForBracket`.** Rewrite per the test expectations above. Keep the docstring accurate: note the bracket<16 case absorbs all DE bouts into the r16 phase under the stop-at-semis model.

- [ ] **Step 4: Run tests.** Verify pass.

---

### Task 4 — Drop `de_finals` from STAGED arm of `scheduleCompetition`

**Files:**
- Modify: `src/engine/scheduleOne.ts`
- Test: `__tests__/engine/scheduleOne.test.ts`

- [ ] **Step 1: Write failing tests.** In `scheduleOne.test.ts`, add new tests for the STAGED arm:
  - "STAGED competition: result has null de_finals_* fields" — *but those fields are about to be deleted*; instead assert that the result lacks any `de_finals_start`, `de_finals_end`, `de_finals_strip_count` keys (use `expect(result).not.toHaveProperty(...)`).
  - "STAGED competition: de_total_end equals de_round_of_16_end + tailEstimateMins(event_type)" — for both INDIVIDUAL and TEAM event types.
  - "STAGED competition: result.de_round_of_16_end is the last allocated phase end" — i.e., no allocation after r16.
  - Update existing STAGED tests that referenced `de_finals_start`/`de_finals_end` — drop those assertions or replace with the new tail-based `de_total_end` check.

- [ ] **Step 2: Run, verify failures.** Command: `timeout 120 pnpm --silent vitest run __tests__/engine/scheduleOne.test.ts > ./tmp/test.log 2>&1`.

- [ ] **Step 3: Edit `scheduleOne.ts` STAGED branch.**
  - Remove the `scheduleDeFinalsPhase` call and its result-handling lines.
  - Remove the `if (competition.event_type === EventType.TEAM) { ... scheduleBronzePhase(...) }` block in the STAGED arm.
  - Remove the unused `finalsEnd`, `finalsStripIndices` destructuring.
  - Update `result.de_total_end` assignment: after the `r16End` is computed, set `result.de_total_end = r16End + tailEstimateMins(competition.event_type)`.
  - Remove the `totalActual += (result.de_finals_end! - result.de_finals_start!)` accumulation.
  - Drop the `VideoPolicy` import if no longer referenced after removal.

- [ ] **Step 4: Run tests.** Verify pass.

---

### Task 5 — Drop `de_finals` from SINGLE_STAGE arm and trim `de` duration

**Files:**
- Modify: `src/engine/scheduleOne.ts`
- Modify: `src/engine/phaseSchedulers.ts` (only `scheduleSingleStageDePhase` duration calc)
- Test: `__tests__/engine/scheduleOne.test.ts`
- Test: `__tests__/engine/phaseSchedulers.test.ts`

- [ ] **Step 1: Write failing tests.**
  - In `scheduleOne.test.ts`: "SINGLE_STAGE competition: no bronze phase scheduled for TEAM events" — assert `result.de_bronze_*` fields are absent.
  - In `scheduleOne.test.ts`: "SINGLE_STAGE competition: de_total_end equals de_end + tailEstimateMins(event_type)".
  - In `phaseSchedulers.test.ts`: "scheduleSingleStageDePhase: returned `deEnd` excludes gold-bout time" — for a known bracket and weapon, assert `deEnd - deStart` equals `totalDeBase * (totalBouts - 1) / totalBouts` (rounded), not `totalDeBase`.

- [ ] **Step 2: Run, verify failures.** Commands (run separately):
  - `timeout 120 pnpm --silent vitest run __tests__/engine/scheduleOne.test.ts > ./tmp/test.log 2>&1`
  - `timeout 120 pnpm --silent vitest run __tests__/engine/phaseSchedulers.test.ts > ./tmp/test.log 2>&1`

- [ ] **Step 3: Edit `scheduleSingleStageDePhase` in `phaseSchedulers.ts`.** Compute the gold-bout time fraction as `1 / totalBouts` (where `totalBouts = bracketSize / 2`) and subtract that from `totalDeBase` before applying the strip-ratio scaling. Concretely: `const adjustedTotalDeBase = totalDeBase * (totalBouts - 1) / totalBouts; const actualDur = ratio >= 1.0 ? adjustedTotalDeBase : Math.ceil(adjustedTotalDeBase / ratio)`.

- [ ] **Step 4: Edit `scheduleOne.ts` SINGLE_STAGE branch.** Remove the `if (competition.event_type === EventType.TEAM) { ... scheduleBronzePhase(...) }` block. Update `result.de_total_end = deEnd + tailEstimateMins(competition.event_type)`. Drop `EventType` import if no longer needed.

- [ ] **Step 5: Run tests.** Verify pass.

---

### Task 6 — Delete `scheduleDeFinalsPhase` and `scheduleBronzePhase`

**Files:**
- Modify: `src/engine/phaseSchedulers.ts`
- Test: `__tests__/engine/phaseSchedulers.test.ts`

- [ ] **Step 1: Delete the test blocks.** In `phaseSchedulers.test.ts`, delete the entire `describe('scheduleBronzePhase', ...)` block (line 410+) and the `describe('scheduleDeFinalsPhase', ...)` block. Drop the `scheduleBronzePhase` and `scheduleDeFinalsPhase` imports.

- [ ] **Step 2: Run tests, verify file still parses.** Command: `timeout 120 pnpm --silent vitest run __tests__/engine/phaseSchedulers.test.ts > ./tmp/test.log 2>&1`. Tests should pass (the deleted tests are simply gone; remaining tests should be unchanged).

- [ ] **Step 3: Delete the source functions.** In `phaseSchedulers.ts`:
  - Delete `scheduleDeFinalsPhase` and `scheduleBronzePhase` function definitions.
  - Drop the `nextFreeTime` import if no longer used.
  - Drop the `VideoPolicy` import if no longer used.
  - Drop any other imports orphaned by the removals.

- [ ] **Step 4: Verify no other source file imports the deleted functions.** Run `grep -rn 'scheduleBronzePhase\|scheduleDeFinalsPhase' src/ __tests__/ 2>/dev/null` — expect zero hits. Fix any leftover references.

- [ ] **Step 5: Run full test suite.** Command: `timeout 180 pnpm --silent test > ./tmp/test.log 2>&1`. Expect all engine tests to pass; the integration tests (B1–B7) may show *higher* scheduled counts due to freed strip-time — that is the desired effect. Note any baseline shifts in your head; Task 11 codifies them.

---

### Task 7 — SKIPPED (user feedback 2026-04-26)

Originally: extend ref demand with discrete intervals for the gold/bronze tail.

**Skipped because:** Tournament organizers don't staff to a precise number of refs per minute; they staff a roster that covers scheduled competitions plus a buffer for cancellations, lunches, and ad-hoc bouts (gold/bronze). Modeling these as discrete `RefDemandInterval`s adds false precision and noise.

**Implication for the model:** The existing `peakPoolRefDemand` / `peakDeRefDemand` functions in `refs.ts` continue to give peak concurrent demand for the scheduled phases only. Gold/bronze ref load is absorbed by the staffing-recommendation buffer at the UI/suggestion layer (not at the engine demand layer).

**Implication for Task 13 (METHODOLOGY):** Document the buffer-absorbs-gold/bronze model rather than tail intervals.

---

### Task 8 — Drop `de_finals_*` and `de_bronze_*` fields from `ScheduleResult`

**Files:**
- Modify: `src/engine/types.ts`
- Modify: `__tests__/helpers/factories.ts`
- Modify: `src/engine/scheduleOne.ts` (the result-shell builder)
- Modify: any other source / test file referencing these fields (use grep)

- [ ] **Step 1: Grep for all references.** Run `grep -rn 'de_finals_start\|de_finals_end\|de_finals_strip_count\|de_bronze_start\|de_bronze_end\|de_bronze_strip_id' src/ __tests__/`. Make a list. Each must be either deleted or replaced.

- [ ] **Step 2: Edit `types.ts`.** Delete the six fields from `ScheduleResult`.

- [ ] **Step 3: Edit `scheduleOne.ts`.** Remove the six fields from the result-shell object literal. Verify no later code in the function attempts to assign them.

- [ ] **Step 4: Edit `factories.ts`.** Remove the six fields from any default `ScheduleResult` factory.

- [ ] **Step 5: Update other source / test files.** For each grep hit from step 1: remove the assertion or replace it with an equivalent that uses `de_total_end` (the surviving field).

- [ ] **Step 6: Run full test suite.** Command: `timeout 180 pnpm --silent test > ./tmp/test.log 2>&1`. Expect all tests to pass.

---

### Task 9 — Drop `Phase.DE_FINALS`, `Phase.DE_FINALS_BRONZE`, `Phase.BRONZE`

**Files:**
- Modify: `src/engine/types.ts`
- Modify: any source / test file referencing these (use grep)

- [ ] **Step 1: Grep for references.** Run `grep -rn 'Phase.DE_FINALS\|Phase.DE_FINALS_BRONZE\|Phase\.BRONZE' src/ __tests__/`. Make a list.

- [ ] **Step 2: Delete enum values.** In `types.ts`, remove `DE_FINALS`, `DE_FINALS_BRONZE`, `BRONZE` from the `Phase` `as const` object.

- [ ] **Step 3: Update remaining references.** Most should be in deleted bronze/finals code paths already removed in earlier tasks. Any leftover `Phase.DE_FINALS` reference (e.g. in `de.ts` `dePhasesForBracket` if not already updated by Task 3) must be removed. Any test that compared a phase value to `Phase.DE_FINALS` must be updated or deleted.

- [ ] **Step 4: Run full test suite.** Command: `timeout 180 pnpm --silent test > ./tmp/test.log 2>&1`. Verify pass.

---

### Task 10 — Drop `BottleneckCause.DE_FINALS_BRONZE_NO_STRIP`

**Files:**
- Modify: `src/engine/types.ts`
- Modify: any test referencing the cause (already partially done by Task 6)

- [ ] **Step 1: Grep for references.** Run `grep -rn 'DE_FINALS_BRONZE_NO_STRIP' src/ __tests__/`. Verify only `types.ts` remains; if other references exist, remove them.

- [ ] **Step 2: Delete the enum value.** In `types.ts`, remove `DE_FINALS_BRONZE_NO_STRIP` from `BottleneckCause`.

- [ ] **Step 3: Run full test suite.** Verify pass.

---

### Task 11 — Drop `de_finals_strips`, `de_finals_requirement`, `de_finals_strip_id` from `Competition`

**Files:**
- Modify: `src/engine/types.ts`
- Modify: `src/engine/validation.ts`
- Modify: `src/engine/stripBudget.ts`
- Modify: `src/engine/capacity.ts`
- Modify: `src/store/buildConfig.ts`
- Modify: `src/store/store.ts`
- Modify: `src/store/serialization.ts`
- Modify: `src/components/sections/StripSetup.tsx`
- Modify: `__tests__/helpers/factories.ts`
- Modify: `__tests__/store/buildConfig.test.ts`
- Modify: `__tests__/components/KitchenSinkPage.test.tsx`
- Modify: any other file flagged by grep

- [ ] **Step 1: Grep for references.** Run `grep -rn 'de_finals_strips\|de_finals_requirement\|de_finals_strip_id\|include_finals_strip' src/ __tests__/`. Make a list.

- [ ] **Step 2: Drop the fields from `Competition` (`types.ts`).**

- [ ] **Step 3: Update engine consumers.**
  - `validation.ts`: remove validation rules touching the three deleted fields. Update tests in `validation.test.ts` accordingly.
  - `stripBudget.ts`: any peak-demand calculation using `de_finals_strips` must drop those terms. Recheck `peakDeStripDemand` — if it sums `de_round_of_16_strips + de_finals_strips`, it now uses just `de_round_of_16_strips`.
  - `capacity.ts`: any strip-hour or load estimate using `de_finals_strips` must drop those terms.
  - Update each file's matching test(s) to reflect the new shape.

- [ ] **Step 4: Update store / UI.**
  - `store.ts`: delete the `include_finals_strip` field, its setter, and its initial-state value. Drop it from the persistence selector tuple.
  - `serialization.ts`: keep an optional read of `include_finals_strip` for backwards compat (ignore the value on load — saved tournaments shouldn't break), but drop it from the save shape.
  - `buildConfig.ts`: remove the three `de_finals_*` field assignments from the Competition build.
  - `StripSetup.tsx`: remove the "include finals strip" toggle UI element and the `useStore` selector.

- [ ] **Step 5: Update fixtures / tests.**
  - `factories.ts`: drop the three Competition fields from factory defaults.
  - `buildConfig.test.ts`: drop assertions on the three fields.
  - `KitchenSinkPage.test.tsx`: drop the `include_finals_strip` toggle interaction tests.

- [ ] **Step 6: Run full test suite.** Command: `timeout 180 pnpm --silent test > ./tmp/test.log 2>&1`. Verify pass.

- [ ] **Step 7: Manual UI smoke check.** Spin up the dev server (`pnpm dev` in a separate terminal — tell the user to run it; do not run it yourself). Navigate to Strip Setup; verify the "include finals strip" toggle is gone and no console errors appear. Navigate to Competition Overrides; verify the video-policy dropdown still works and `FINALS_ONLY` is selectable. (If the user reports any UI regression, address before moving on.)

---

### Task 12 — Recapture B1–B7 baselines

**Files:**
- Modify: `__tests__/engine/integration.test.ts`

- [ ] **Step 1: Run the integration suite as-is.** Command: `timeout 180 pnpm --silent vitest run __tests__/engine/integration.test.ts > ./tmp/test.log 2>&1`. Read `./tmp/test.log`.
  - Failures are expected: the existing `.toBeGreaterThanOrEqual(N)` floors may now be too low (count *increased*) or too high (count *decreased* due to a regression). Note the actual `scheduledCount` for each scenario from the test output.

- [ ] **Step 2: Record new baselines.** For each B1–B7, update the `.toBeGreaterThanOrEqual(N)` floor to the new actual count. Add inline comment: `// Baseline updated 2026-04-26 after stop-at-semis simplification — was N_old, now N_new because de_finals + bronze allocation no longer competes for video strips on dense days.`

- [ ] **Step 3: Re-run.** Same command. Verify all integration tests pass at the new floors.

- [ ] **Step 4: Run full test suite one more time.** Command: `timeout 180 pnpm --silent test > ./tmp/test.log 2>&1`. Verify everything passes.

- [ ] **Step 5: Test-quality review.** Dispatch the `test-quality-reviewer` agent to review the modified test files (`de.test.ts`, `scheduleOne.test.ts`, `phaseSchedulers.test.ts`, `refs.test.ts`, `integration.test.ts`, `validation.test.ts`, `capacity.test.ts`, `stripBudget.test.ts`, `buildConfig.test.ts`). Address feedback before declaring complete.

- [ ] **Step 6: React-code review.** Dispatch the `react-code-reviewer` agent against the modified UI files (`StripSetup.tsx`, `store.ts`, `serialization.ts`, `KitchenSinkPage.test.tsx`). Address feedback before declaring complete.

---

### Task 13 — Update METHODOLOGY.md

**Files:**
- Modify: `METHODOLOGY.md`

- [ ] **Step 1: Add §"Scheduler Stops at Semis".** New section explaining:
  - The scheduler's terminal DE phase is `r16` (STAGED) or `de` (SINGLE_STAGE). It does not allocate strips for the gold or bronze bouts.
  - Tournament organizers handle gold + bronze ad-hoc, queueing for "ASAP strip / ref availability." Athletes accept queue waits.
  - `de_total_end` in `ScheduleResult` includes a tail estimate (`INDIV_TAIL_MINS = 30`, `TEAM_TAIL_MINS = 60`) so logistics see a realistic end-time.
  - Gold/bronze referee load is NOT modeled as discrete `RefDemandInterval`s. The existing peak-demand functions cover the scheduled phases only; gold/bronze ref needs are absorbed by the staffing-recommendation buffer (along with cancellations and lunch coverage) at the UI/suggestion layer.
  - Video policy: `REQUIRED` allocates video strips for the r16 phase (covering semis); `BEST_EFFORT` and `FINALS_ONLY` do not allocate video. Gold/bronze video, when needed, is found ad-hoc by organizers.

- [ ] **Step 2: Update §DE Phase Breakdown.** Reflect the 2-block split: prelims_dur and r16_dur. Note that finals_dur was removed because the scheduler no longer allocates the gold bout.

- [ ] **Step 3: Cross-reference from §Strip Allocation and §Video Strip Preservation.** Brief mention that the new model relies on organizer ad-hoc allocation for gold/bronze.

- [ ] **Step 4: Run the full test suite once more for sanity.** Command: `timeout 180 pnpm --silent test > ./tmp/test.log 2>&1`. Verify pass.

---

## Engineering conventions

- `pnpm` not `npm`. Single file: `timeout 120 pnpm --silent vitest run <path> > ./tmp/test.log 2>&1`. Full suite: `timeout 180 pnpm --silent test > ./tmp/test.log 2>&1`. Read `./tmp/test.log` only on failure.
- User owns all git commits. Do not run `git commit`, `git push`, or any commit-creating command. Subagents must not run `git`.
- ts-morph MCP: `tsconfigPath = ./tsconfig.app.json`.
- `as const` objects, never TypeScript enums (`erasableSyntaxOnly` constraint).
- Engine functions are pure — no global state, no singletons.
- No unbounded loops.

## Out of scope (deferred to other plans)

- The concurrent scheduler itself — covered by `.claude/plans/2026-04-23-concurrent-scheduler.md`.
- Removing `VideoPolicy.FINALS_ONLY` (kept as enum value for now; behaves as `BEST_EFFORT`).
- Splitting r16 into separate `r16` / `quarters` / `semis` nodes — same plan (concurrent scheduler) defers this.
- METHODOLOGY rewrite for the concurrent scheduler — happens in concurrent-scheduler Phase D.
