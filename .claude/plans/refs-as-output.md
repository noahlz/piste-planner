# Referees as Output — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans`. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Plan style note:** per user preference, steps describe *what* the code must do (behavior + test assertions) rather than pre-writing implementation. Executing agent writes code during execution.
>
> **Execution order:** execute this plan AFTER `stage-6-phase-scheduling.md`. The phase-scheduling refactor is the higher-priority density fix and should land first. This plan cleans up ref-gating complexity and inverts the referee model; it is independent of but easier to execute on a post-phase-refactor codebase.

## Goal

Convert referees from a tournament-config **input** to a post-schedule **output**. The scheduler assumes refs are always available. The engine reports per-day peak ref demand (total + saber-capable subset) so the organizer can staff to that number. Replace the removed `saber_scarcity` / `ref_weight` day-assignment penalties with a `saber_pileup` penalty that prevents clustering too many saber events on one day.

## Architecture

- **New output type** `RefRequirementsByDay[]` attached to `SchedulerResult`. For each day: `{ day, peak_total_refs, peak_saber_refs, peak_time }`.
- **Ref demand tracking** repurposes existing `allocateRefs` call sites. Instead of gating scheduling on availability, it records `{ startTime, endTime, count, weapon }` intervals into `state.ref_demand_by_day[day].intervals`. Post-schedule, a sweep-line computes peaks per day.
- **`earliestResourceWindow` no longer gates on refs** — removes `tRefs`, `feRefsFreeAt`, `saberRefsFreeAt`, and the `kind: 'REFS'` reason. Only strip availability and time-of-day remain as hard constraints.
- **Pool staffing simplifies** — `resolveRefsPerPool` no longer takes `availableRefs`; `AUTO` always returns 2 refs/pool, `TWO` always returns 2, `ONE` always returns 1. No `shortfall` concept.
- **Saber pileup penalty** — day-assignment penalty term proportional to the count of saber events already on a candidate day. Reasonable cap (e.g., ≥3 saber events on one day → large penalty). Integrated into existing DSatur coloring penalty matrix.
- **UI shift** — RefereeSetup wizard step removed. New RefRequirementsReport panel shown after scheduling completes.

## Non-goals

- No change to within-day scheduling (phase-level refactor is a separate follow-on plan).
- No change to strip allocation, day coloring structure, constraint graph, or DE phase logic beyond removing ref checks.
- No change to saved-file schema version; load-time backward compat only (drop `referees` key silently).

## Tech Stack

TypeScript + Vite. Vitest for tests. Zustand store. React components.

## File Structure

### Files modified

**Engine:**
- `src/engine/types.ts` — remove `referee_availability` from `TournamentConfig`; remove `foil_epee_in_use` / `saber_in_use` / `release_events` from `RefsInUseByDay`; add `RefDemandInterval`, `RefDemandByDay`, `RefRequirementsByDay`; add `ref_requirements_by_day` to top-level engine return
- `src/engine/resources.ts` — remove ref-gating logic (~80 lines: `tRefs` computation in `earliestResourceWindow`, `feRefsFreeAt`, `saberRefsFreeAt`, `REFS` `NoWindowReason`); rewrite `allocateRefs` to push interval into `ref_demand_by_day[day]`; `releaseRefs` becomes unused and is deleted; snapshot/restore logic adjusted to handle interval-array instead of counters
- `src/engine/refs.ts` — delete `refsAvailableOnDay`; add `computeRefRequirements(demandByDay, days) → RefRequirementsByDay[]` pure function
- `src/engine/scheduleOne.ts` — remove 3 `availRefs = refsAvailableOnDay(...)` sites (lines ~123, ~271, ~472) and any downstream shortfall branches; `allocateRefs` calls remain
- `src/engine/pools.ts` — simplify `computePoolStaffing` (drop `availableRefs` param, `staffable_strips = min(availableStrips, nPools)`); simplify `resolveRefsPerPool` (drop `availableRefs` param, always return optimal refs_per_pool, remove `shortfall` field from return); all callers updated
- `src/engine/dayAssignment.ts` — delete `saber_scarcity` and `ref_weight` penalty terms and their helpers; add `saberPileupPenalty(candidateDay, weapon, alreadyAssignedOnDay) → number` helper; wire into existing penalty composition
- `src/engine/scheduler.ts` — after main scheduling loop, call `computeRefRequirements` and attach `ref_requirements_by_day` to the return object
- `src/engine/capacity.ts` — verify no ref-hours in capacity estimate; if any, remove
- `src/engine/analysis.ts` — update any analysis output that surfaces ref fields (only remove; don't add ref-requirement reporting here — that lives on `SchedulerResult`)

**Store:**
- `src/store/buildConfig.ts` — delete `buildRefereeAvailability` function and its call site; no `referee_availability` built
- `src/store/store.ts` — remove `dayRefs` state (or convert to read-only cache populated from scheduler result); remove `setDayRefs`; remove auto-suggestion logic that syncs ref counts
- `src/store/refSuggestion.ts` — delete `suggestRefsForDay` (input suggestion) entirely; planning-output display uses scheduler output directly
- `src/store/serialization.ts` — on load, ignore `referees` key if present (backward compat); on save, omit `referees`

**UI:**
- `src/components/sections/RefereeSetup.tsx` — delete file
- `src/components/` — add new `RefRequirementsReport.tsx` component consuming `scheduleResult.ref_requirements_by_day`; rendered on the schedule-results screen
- Wizard component — remove RefereeSetup step from the step list

**Tests:**
- `__tests__/helpers/factories.ts` — remove `referee_availability` from `makeConfig` default; add `makeRefDemandInterval` helper for unit tests
- `__tests__/engine/integration.test.ts` — remove `minRefsForEvents` function; drop `refs.fe, refs.saber` args from `tournamentConfig`; add ref-requirement assertions on scheduler output for each B-scenario
- `__tests__/engine/refs.test.ts` — rewrite around `computeRefRequirements` instead of `refsAvailableOnDay`
- `__tests__/engine/resources.test.ts` — drop ref-gating tests
- `__tests__/engine/dayAssignment.test.ts` — replace `saber_scarcity` / `ref_weight` tests with `saber_pileup` tests
- `__tests__/engine/pools.test.ts` — update `resolveRefsPerPool` / `computePoolStaffing` tests to new signatures
- `__tests__/store/*` — drop ref-suggestion / dayRefs tests; serialization tests add backward-compat case

### Files created

- `src/components/RefRequirementsReport.tsx`

### Files deleted

- `src/store/refSuggestion.ts`
- `src/components/sections/RefereeSetup.tsx`

## User Preferences (from project memory)

- Use `pnpm`, not `npm`.
- Single-file test run: `timeout 120 pnpm --silent vitest run <path> > ./tmp/test.log 2>&1`. Full: `timeout 180 pnpm --silent test > ./tmp/test.log 2>&1`. Read `./tmp/test.log` only on failure.
- User handles all git commits — plan steps do NOT run `git`. Each "commit point" note indicates a natural stop-to-commit moment for the user.
- Use Edit/Write tools, not shell heredoc.
- After writing tests, dispatch `test-quality-reviewer` agent.
- After React changes, dispatch `react-code-reviewer` agent.
- `as const` objects, not TypeScript enums.
- ts-morph MCP `tsconfigPath` = `./tsconfig.app.json`.

---

## Task 1: Output types (additive, no behavior change)

**Purpose:** land the output data model without touching any engine behavior yet. Safe, isolated.

**Files:**
- Modify: `src/engine/types.ts`

- [ ] **Step 1:** Read `src/engine/types.ts` to locate where `RefsInUseByDay`, `GlobalState`, and `ScheduleAllResult` (or equivalent top-level return) live.

- [ ] **Step 2:** Add new types (keep existing `RefsInUseByDay` untouched for now — will be replaced in Task 3):
  - `RefDemandInterval = { startTime: number; endTime: number; count: number; weapon: Weapon }` — one ref allocation span
  - `RefDemandByDay = { intervals: RefDemandInterval[] }` — per-day demand timeline
  - `RefRequirementsByDay = { day: number; peak_total_refs: number; peak_saber_refs: number; peak_time: number }` — output report
  - Add `ref_requirements_by_day?: RefRequirementsByDay[]` as an **optional** field on the top-level scheduler return type.

- [ ] **Step 3:** Run `timeout 60 pnpm --silent exec tsc --noEmit -p tsconfig.app.json > ./tmp/test.log 2>&1`. Expected: no new errors (additive change).

← **Commit point (user):** "add ref-requirements output types"

---

## Task 2: `computeRefRequirements` pure function (TDD)

**Purpose:** implement and unit-test the sweep-line that turns demand intervals into peak-demand output.

**Files:**
- Create: `src/engine/refs.ts` changes (add new function alongside existing)
- Test: `__tests__/engine/refs.test.ts`

**Behavior specification for `computeRefRequirements(demandByDay: Record<number, RefDemandByDay>, daysAvailable: number): RefRequirementsByDay[]`:**

Returns one entry per day `0..daysAvailable-1`. Each entry:
- Use sweep-line: convert each `RefDemandInterval` into two events `(startTime, +count)` and `(endTime, -count)`. Sort by time, tie-break `+count` before `-count` (events starting at the same time as others ending still count toward peak).
- `peak_total_refs` = max running sum across all intervals for that day (regardless of weapon).
- `peak_saber_refs` = same but filter intervals to `weapon === SABRE` before sweeping.
- `peak_time` = time at which `peak_total_refs` is first reached.
- Empty day: all zeros, `peak_time = 0`.

- [ ] **Step 1:** Write the failing tests in `__tests__/engine/refs.test.ts`. Test cases:
  1. Single interval `{10:00, 11:00, 3, FE}` → `peak_total=3, peak_saber=0, peak_time=10:00`.
  2. Two non-overlapping FE intervals → peak = max count, not sum.
  3. Two overlapping FE intervals `{10:00–12:00, 2}` and `{11:00–13:00, 3}` → `peak_total=5, peak_time=11:00`.
  4. Mixed weapons: overlapping `{10:00–11:00, 2, FE}` and `{10:30–11:30, 4, SABRE}` → `peak_total=6, peak_saber=4, peak_time=10:30`.
  5. Tie-break: interval A ends at `T`, interval B starts at `T` — both briefly count at `T`. Assert peak reflects this.
  6. Empty day → all zeros.
  7. Multi-day fixture: day 0 has demand, day 1 empty, day 2 has different demand → returns three entries with correct values.

- [ ] **Step 2:** Run tests and confirm they FAIL (`computeRefRequirements is not a function` or similar).

  Run: `timeout 60 pnpm --silent vitest run __tests__/engine/refs.test.ts > ./tmp/test.log 2>&1`

- [ ] **Step 3:** Implement `computeRefRequirements` in `src/engine/refs.ts`. Pure function, no engine state dependencies. Follows behavior spec above. Keep `refsAvailableOnDay` untouched for now (Task 5 deletes it).

- [ ] **Step 4:** Run tests and confirm PASS.

- [ ] **Step 5:** Dispatch `test-quality-reviewer` agent on `__tests__/engine/refs.test.ts`. Address any feedback before committing.

← **Commit point (user):** "add computeRefRequirements pure function"

---

## Task 3: Switch demand tracking to interval model (internal refactor)

**Purpose:** replace the `foil_epee_in_use` / `saber_in_use` / `release_events` counters with an interval list. Engine STILL gates on refs for now (Task 5 removes gating) — this task just changes the shape of what `allocateRefs` records.

**Files:**
- Modify: `src/engine/types.ts`, `src/engine/resources.ts`, `src/engine/scheduler.ts`
- Test: `__tests__/engine/resources.test.ts`

**Behavior:**
- `RefsInUseByDay` is replaced by `RefDemandByDay = { intervals: RefDemandInterval[] }` (existing counters removed).
- `GlobalState.refs_in_use_by_day` renamed to `ref_demand_by_day: Record<number, RefDemandByDay>`.
- `allocateRefs(state, day, weapon, count, startTime, endTime)` pushes a new interval. No counter updates. (Signature gains `startTime` if it was implicit before — verify call sites.)
- `releaseRefs` is deleted — intervals encode release implicitly via `endTime`.
- `feRefsFreeAt(day, t)` and `saberRefsFreeAt(day, t)` temporarily rewritten: compute `available = configured_refs - (count of active intervals at t matching weapon)`. Still used by gating for now — will be deleted in Task 5.
- `snapshotState` / `restoreState`: shallow-copy `ref_demand_by_day[day].intervals` (slice the array per day).

- [ ] **Step 1:** Write failing tests in `__tests__/engine/resources.test.ts` for the new `ref_demand_by_day` shape:
  1. After `allocateRefs(state, 0, FE, 3, 10:00, 11:00)`, `state.ref_demand_by_day[0].intervals` has one entry with those fields.
  2. Multiple allocations on same day → intervals accumulate.
  3. `snapshotState` / `restoreState` round-trip preserves intervals; mutations after snapshot don't leak to the snapshot.

- [ ] **Step 2:** Run tests → confirm FAIL.

- [ ] **Step 3:** Update `src/engine/types.ts`: replace `RefsInUseByDay` with `RefDemandByDay`; rename field on `GlobalState`.

- [ ] **Step 4:** Update `src/engine/resources.ts`:
  - `ensureDayRefs` returns `{ intervals: [] }`.
  - `allocateRefs` pushes interval.
  - Rewrite `feRefsFreeAt` / `saberRefsFreeAt` on intervals (temporary — count active at `atTime`).
  - Delete `releaseRefs` and its callers.
  - `snapshotState` clones intervals per day; `restoreState` restores.

- [ ] **Step 5:** Update all `allocateRefs` call sites (grep: `allocateRefs(state,`). Ensure each passes `startTime` and `endTime`.

- [ ] **Step 6:** Run full engine test suite. Expected: all existing tests pass (behavior preserved, internal representation changed).

  Run: `timeout 120 pnpm --silent vitest run __tests__/engine > ./tmp/test.log 2>&1`

- [ ] **Step 7:** If failures, inspect `./tmp/test.log` and address. Common issue: a test asserted directly on `foil_epee_in_use` — rewrite to assert via `feRefsFreeAt` or interval count.

← **Commit point (user):** "refactor ref tracking to interval model (internal)"

---

## Task 4: Wire ref requirements into scheduler output (additive)

**Purpose:** have the scheduler produce the output. Still no behavior change in scheduling itself.

**Files:**
- Modify: `src/engine/scheduler.ts`
- Test: `__tests__/engine/integration.test.ts` (add a single sanity assertion, don't rewrite all yet)

- [ ] **Step 1:** In `src/engine/scheduler.ts`, after the main scheduling + repair loop completes and before returning, call `computeRefRequirements(state.ref_demand_by_day, config.days_available)` and attach to the return object under `ref_requirements_by_day`.

- [ ] **Step 2:** Add a smoke test in an appropriate integration test block: pick one currently-passing scenario (B2 or B6), assert `result.ref_requirements_by_day` has `config.days_available` entries and each `peak_total_refs >= 0`.

- [ ] **Step 3:** Run the targeted integration test; confirm PASS.

  Run: `timeout 120 pnpm --silent vitest run __tests__/engine/integration.test.ts > ./tmp/test.log 2>&1`

← **Commit point (user):** "expose ref_requirements_by_day on scheduler output"

---

## Task 5: Remove ref-gating from scheduling

**Purpose:** make refs truly always-available at scheduling time. This is the behavior-changing core task. Some B-scenario counts may improve here; some may not change (strips, not refs, are the real bottleneck).

**Files:**
- Modify: `src/engine/resources.ts`, `src/engine/scheduleOne.ts`, `src/engine/pools.ts`, `src/engine/refs.ts`

### 5a: Simplify `pools.ts` staffing

- [ ] **Step 1:** Update signature of `computePoolStaffing` — drop `availableRefs` parameter; computation becomes `staffable_strips = min(availableStrips, nPools)` with no ref-based floor.
- [ ] **Step 2:** Update signature of `resolveRefsPerPool` — drop `availableRefs` parameter; return value has no `shortfall` field. Rules: `ONE` → `{ refs_per_pool: 1, refs_needed: nPools }`; `TWO` → `{ refs_per_pool: 2, refs_needed: 2*nPools }`; `AUTO` → `{ refs_per_pool: 2, refs_needed: 2*nPools }`.
- [ ] **Step 3:** Update callers in `src/engine/scheduleOne.ts` and elsewhere to new signatures; remove any `shortfall` handling.
- [ ] **Step 4:** Update `__tests__/engine/pools.test.ts` to drop `availableRefs` args and remove shortfall assertions.
- [ ] **Step 5:** Run pools tests. Confirm PASS.

  Run: `timeout 60 pnpm --silent vitest run __tests__/engine/pools.test.ts > ./tmp/test.log 2>&1`

### 5b: Remove `tRefs` from `earliestResourceWindow`

- [ ] **Step 6:** In `src/engine/resources.ts:earliestResourceWindow`:
  - Remove the `tRefs` computation.
  - Remove `tRefs` from `T = max(candidate, stripFreeMax, tRefs)` — becomes `T = max(candidate, stripFreeMax)`.
  - Remove the `REFS` branch from the `kind` union of `NoWindowReason`.
  - Remove the `REFS` return-path from `diagNoWindowReason`.
  - Drop the `refsNeeded`, `weapon` parameters from the function signature (grep and update callers in `scheduleOne.ts`).

- [ ] **Step 7:** Delete `feRefsFreeAt`, `saberRefsFreeAt`, `earliestRefsTime` from `src/engine/resources.ts`.

- [ ] **Step 8:** Delete `refsAvailableOnDay` from `src/engine/refs.ts`.

### 5c: Remove ref checks from `scheduleOne.ts`

- [ ] **Step 9:** Delete the 3 `availRefs = refsAvailableOnDay(...)` call sites (lines ~123, ~271, ~472). Remove any downstream branches that acted on ref availability (shortfall handling, early-abort paths). Keep all `allocateRefs(...)` calls — they still record demand.

### 5d: Clean up diagnostics and run tests

- [ ] **Step 10:** Search for any remaining references to deleted symbols: `refsAvailableOnDay`, `feRefsFreeAt`, `saberRefsFreeAt`, `'REFS'` in NoWindowReason kinds, `foil_epee_in_use`, `saber_in_use`, `release_events`. All must be gone from engine files.

  Run: `grep -rn "refsAvailableOnDay\|feRefsFreeAt\|saberRefsFreeAt\|foil_epee_in_use\|saber_in_use\|release_events" src/engine/`
  Expected: no matches.

- [ ] **Step 11:** Run full engine test suite.

  Run: `timeout 180 pnpm --silent vitest run __tests__/engine > ./tmp/test.log 2>&1`

  Expected: most tests pass. Some tests may fail because:
  - They asserted that an event fails due to ref shortage → update to expect success.
  - They constructed tight-ref configs expecting deadline breach → update assertion or remove.
  - `dayAssignment` tests fail (expected — Task 6 covers).

- [ ] **Step 12:** For each failing engine test not related to `dayAssignment`: inspect, fix by updating the assertion to reflect the new always-available-refs model.

- [ ] **Step 13:** Capture B-scenario event counts for comparison later. Document in a scratch note: "after Task 5, B1/B2/B3/B4/B5/B6/B7 scheduled = X / Y / Z / ..." (read from test output or diagnostic print).

← **Commit point (user):** "remove ref-availability gating from scheduling"

---

## Task 6: Replace `saber_scarcity` / `ref_weight` with `saber_pileup` in dayAssignment

**Purpose:** restore day-coloring's ability to spread saber events without relying on ref counts.

**Files:**
- Modify: `src/engine/dayAssignment.ts`
- Test: `__tests__/engine/dayAssignment.test.ts`

**Behavior specification for `saberPileupPenalty(competition: Competition, candidateDay: number, state: { assignments: Map<string, number> }, allCompetitions: Competition[]): number`:**

Returns a scalar penalty to add to the day-assignment cost when placing `competition` on `candidateDay`.

Rules:
- If `competition.weapon !== SABRE`: returns `0`.
- Otherwise count saber competitions already assigned to `candidateDay` in `state.assignments`: `n = count`.
- Penalty curve: `0` for `n=0`, `0.5` for `n=1`, `2.0` for `n=2`, `10.0` for `n=3`, `50.0` for `n >= 4`. (The sharp climb at 3 is the "never 100% concurrent" intent — discourages more than a few saber events per day.)
- Constants (`SABER_PILEUP_PENALTY_TABLE`) exported for test-ability.

- [ ] **Step 1:** Write failing tests in `__tests__/engine/dayAssignment.test.ts`:
  1. Non-saber event → penalty is 0 regardless of day contents.
  2. Saber event on a day with 0 saber events → penalty 0.
  3. Saber event on a day with 1 saber → 0.5.
  4. Saber event on a day with 3 saber → 10.0.
  5. Saber event on a day with 5 saber → 50.0.
  6. Full dayAssignment integration: given 4 saber events and 4 non-saber events across 2 days, assignments should split saber 2/2 across days (not 4/0), assuming no hard-constraint conflicts.

- [ ] **Step 2:** Run failing tests.

  Run: `timeout 60 pnpm --silent vitest run __tests__/engine/dayAssignment.test.ts > ./tmp/test.log 2>&1`

- [ ] **Step 3:** Delete `saber_scarcity` penalty logic and `ref_weight` penalty logic from `src/engine/dayAssignment.ts`. Delete any imports of `refsAvailableOnDay` / `resolveRefsPerPool` from dayAssignment.

- [ ] **Step 4:** Implement `saberPileupPenalty` per spec above. Export `SABER_PILEUP_PENALTY_TABLE` for tests.

- [ ] **Step 5:** Integrate `saberPileupPenalty` into the existing day-assignment penalty composition (wherever `saber_scarcity` + `ref_weight` were added to the total). Additive term.

- [ ] **Step 6:** Run dayAssignment tests; confirm PASS including the integration case (#6 above).

- [ ] **Step 7:** Dispatch `test-quality-reviewer` agent on the updated dayAssignment test file.

← **Commit point (user):** "replace ref-based day-assignment penalties with saber_pileup"

---

## Task 7: Remove `referee_availability` from `TournamentConfig`

**Purpose:** clear the input field from the config schema. After Task 5, nothing reads it — this task removes the dead field and updates factories.

**Files:**
- Modify: `src/engine/types.ts`, `__tests__/helpers/factories.ts`

- [ ] **Step 1:** In `src/engine/types.ts`, delete `referee_availability` from `TournamentConfig`. Delete the per-day-ref entry type if no longer referenced.

- [ ] **Step 2:** In `__tests__/helpers/factories.ts`, delete the `referee_availability` block from `makeConfig`.

- [ ] **Step 3:** Run full test suite.

  Run: `timeout 180 pnpm --silent test > ./tmp/test.log 2>&1`

  Expected: engine tests all pass. Store tests likely fail (next task). Integration tests referencing `tournamentConfig(...refs.fe, refs.saber...)` fail — fixed in Task 10.

- [ ] **Step 4:** Compile check: `timeout 60 pnpm --silent exec tsc --noEmit -p tsconfig.app.json > ./tmp/test.log 2>&1`. Expected errors only in store and integration tests.

← **Commit point (user):** "remove referee_availability from TournamentConfig"

---

## Task 8: Update store (buildConfig, serialization, refSuggestion)

**Purpose:** stop the store emitting ref config; retain backward compat for saved files.

**Files:**
- Modify: `src/store/buildConfig.ts`, `src/store/serialization.ts`, `src/store/store.ts`
- Delete: `src/store/refSuggestion.ts`

- [ ] **Step 1:** In `src/store/buildConfig.ts`, delete `buildRefereeAvailability` and its call; remove `referee_availability` from the returned config.

- [ ] **Step 2:** In `src/store/serialization.ts`:
  - On save: omit `referees` key.
  - On load: if `referees` key is present, ignore it silently (do NOT fail validation). Update the load-validation logic that currently requires the `referees` key.
  - Add a test: loading a legacy saved file with `referees: { dayRefs: [...] }` succeeds and produces a state with no ref fields.

- [ ] **Step 3:** In `src/store/store.ts`: delete `dayRefs` state field, `setDayRefs` action, and any auto-suggest effect that syncs ref counts. Delete any action that reads `dayRefs` state.

- [ ] **Step 4:** Delete `src/store/refSuggestion.ts` and any imports of it.

- [ ] **Step 5:** Update/delete associated store tests: `__tests__/store/refSuggestion.test.ts` deleted; `__tests__/store/serialization.test.ts` updated (add backward-compat load case); `__tests__/store/store.test.ts` updated to drop `dayRefs` references.

- [ ] **Step 6:** Run store tests.

  Run: `timeout 60 pnpm --silent vitest run __tests__/store > ./tmp/test.log 2>&1`

  Expected: PASS after updates.

← **Commit point (user):** "remove referee inputs from store; add save-file backward compat"

---

## Task 9: UI — remove RefereeSetup wizard step

**Purpose:** remove the input form from the UI.

**Files:**
- Delete: `src/components/sections/RefereeSetup.tsx`
- Modify: whichever component assembles the wizard step list (likely `src/components/Wizard.tsx` or similar — grep to locate)

- [ ] **Step 1:** Locate the wizard step registry: `grep -rn "RefereeSetup" src/components/`.

- [ ] **Step 2:** Remove the RefereeSetup step entry from the wizard step list. Adjust step indices / navigation if zero-based.

- [ ] **Step 3:** Delete `src/components/sections/RefereeSetup.tsx`.

- [ ] **Step 4:** Remove any imports of `RefereeSetup` in the codebase.

- [ ] **Step 5:** Confirm build compiles: `timeout 60 pnpm --silent exec tsc --noEmit -p tsconfig.app.json > ./tmp/test.log 2>&1`.

- [ ] **Step 6:** Run component tests touching the wizard. Update any snapshot tests.

  Run: `timeout 60 pnpm --silent vitest run __tests__/components > ./tmp/test.log 2>&1`

← **Commit point (user):** "remove RefereeSetup wizard step"

---

## Task 10: UI — add RefRequirementsReport panel

**Purpose:** show the output the engine now produces. Rendered on the results screen.

**Files:**
- Create: `src/components/RefRequirementsReport.tsx`
- Modify: whichever component renders schedule results (likely `src/components/ScheduleResults.tsx` or similar — grep to locate)
- Test: `__tests__/components/RefRequirementsReport.test.tsx`

**Component contract for `RefRequirementsReport`:**

Props: `{ requirements: RefRequirementsByDay[] }` (nullable/undefined handled gracefully).

Renders: a table or card grid, one row/card per day. Each row shows:
- Day label (Day 1, Day 2, ...)
- Peak total refs
- Peak saber-capable refs
- Peak time (formatted HH:MM)
- Derived: "FE-only refs needed: peak_total - peak_saber" (as a hint)

Empty-array or undefined → renders "No schedule available" placeholder.

Uses existing shadcn/ui components (`Card`, `Table`).

- [ ] **Step 1:** Write failing tests in `__tests__/components/RefRequirementsReport.test.tsx` using React Testing Library:
  1. Renders one row per day for a 3-day requirements array.
  2. Shows `peak_total_refs` and `peak_saber_refs` correctly.
  3. Formats `peak_time` as HH:MM.
  4. Shows placeholder for empty or undefined input.
  5. Derived FE-only refs calculation displayed.

- [ ] **Step 2:** Run tests → FAIL.

- [ ] **Step 3:** Implement the component. Match existing codebase styling — check neighboring components for patterns (shadcn card/table usage, Tailwind classes).

- [ ] **Step 4:** Locate the results screen and add the panel. Pass the engine output's `ref_requirements_by_day` through.

- [ ] **Step 5:** Run component tests → PASS.

- [ ] **Step 6:** Dispatch `react-code-reviewer` agent on `RefRequirementsReport.tsx` and the results-screen integration.

← **Commit point (user):** "add RefRequirementsReport UI panel"

---

## Task 11: Update integration tests (drop minRefsForEvents)

**Purpose:** tests now reflect the new contract. Ref demand becomes an assertion-on-output instead of a config input.

**Files:**
- Modify: `__tests__/engine/integration.test.ts`

- [ ] **Step 1:** Delete the `minRefsForEvents` function and its per-scenario calls.

- [ ] **Step 2:** Update the `tournamentConfig` helper inside integration.test.ts — drop the `refs.fe` and `refs.saber` parameters and the referee-block construction.

- [ ] **Step 3:** For each B-scenario test, change the body to also assert on `result.ref_requirements_by_day`:
  - Length equals `config.days_available`.
  - Each day's `peak_total_refs >= 0`.
  - Each day's `peak_saber_refs <= peak_total_refs`.
  - For at least one scenario, assert a specific expected range (e.g., B1 day 1 `peak_total_refs` within `[10, 40]`) — use the actual output from a single run, ±slack, to catch regressions.

- [ ] **Step 4:** Run integration tests.

  Run: `timeout 180 pnpm --silent vitest run __tests__/engine/integration.test.ts > ./tmp/test.log 2>&1`

- [ ] **Step 5:** Record new B-scenario event counts vs. the pre-refactor baseline from Stage 5:

  | Scenario | Stage 5 result | After refs-as-output | Delta |
  |---|---|---|---|

  Document any wins (likely small — refs were not the primary bottleneck per prior diagnosis) and any losses (should be none; if any, investigate).

- [ ] **Step 6:** Dispatch `test-quality-reviewer` on the updated integration test file.

← **Commit point (user):** "rewrite integration tests around ref-requirements output"

---

## Task 12: Final verification

**Files:** none modified.

- [ ] **Step 1:** Run full test suite.

  Run: `timeout 180 pnpm --silent test > ./tmp/test.log 2>&1`

  Expected: all tests pass.

- [ ] **Step 2:** Compile check.

  Run: `timeout 60 pnpm --silent exec tsc --noEmit -p tsconfig.app.json > ./tmp/test.log 2>&1`

  Expected: 0 errors.

- [ ] **Step 3:** Smoke-test the app UI locally (user to confirm): `pnpm dev` — walk the wizard, confirm no RefereeSetup step, confirm RefRequirementsReport renders after scheduling.

- [ ] **Step 4:** Final sweep: `grep -rn "referee_availability\|refsAvailableOnDay\|foil_epee_in_use\|saber_in_use\|release_events\|minRefsForEvents\|RefereeSetup\|refSuggestion" src/ __tests__/` — expected: no matches (or only inside deleted-but-committed backward-compat serialization handling).

- [ ] **Step 5:** Summarize B-scenario delta table from Task 11 in a closing comment / memory note. Expect marginal improvements (1–3 events total); record actual numbers so the next plan (phase-level scheduling) starts from a known baseline.

← **Commit point (user):** "refs-as-output: final verification"

---

## Risks and Open Questions

- **Stage 5 day-expansion interaction:** the new `saber_pileup` penalty is additive with the existing capacity penalty. If both fire on the same candidate, they may double-penalize saber events on already-full days. Monitor B3's output — if B3 regresses, tune the saber_pileup scale down.
- **Integration test determinism:** asserting specific numeric ranges on `peak_total_refs` is a regression guard but couples tests to current behavior. Use ±slack (e.g., ±5) to absorb small routing changes.
- **Saved file backward compat window:** this plan ignores legacy `referees` key on load. If the schema version needs bumping for clarity, add a follow-up task — not in scope here.
- **B-scenario count delta:** prior analysis (see `.claude/plans/stage-6-scheduling-density-remaining.md`) indicates refs are not the primary B5/B7 bottleneck. This plan does NOT target density improvement; any gains are incidental. The next plan (phase-level scheduling) is where density wins live.

## Out of Scope (follow-on plan after this ships)

- Phase-level scheduling refactor (decompose `scheduleCompetition` into per-phase schedulers; phase-major loop in `scheduler.ts` inner day loop). This is the main lever for B5/B7 density failures.
