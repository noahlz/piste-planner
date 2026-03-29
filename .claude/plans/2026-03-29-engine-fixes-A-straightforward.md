# Engine Fixes A: Straightforward Wiring

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire unused constants into the scheduling engine and fix the `constraint_relaxation_level` return plumbing.

**Architecture:** Four independent tasks that each fix a known gap between what the engine defines and what it actually uses. All are pure wiring changes — import a constant or adjust a return type. Independently testable and committable.

**Tech Stack:** TypeScript, Vitest, pure engine functions (no UI changes)

**Prerequisite plans:** None — this is the first plan in the series.

---

### Task 1: Wire `SOFT_SEPARATION_PAIRS` into `totalDayPenalty`

**What & Why:** The USA Fencing Operations Manual says Div 1 and Cadet events of the same weapon and gender should not be on the same day except in rare cases, because fencers who compete in both categories face back-to-back exhaustion. (Div 1 Men's Foil and Cadet Women's Foil can run on the same day — the separation is per weapon+gender.) We already defined this as a soft penalty (5.0 for the DIV1↔CADET pair) in `SOFT_SEPARATION_PAIRS`, but the day-assignment engine never actually reads it. The scheduler currently places Div 1 and Cadet events of the same weapon+gender on the same day with no penalty at all. Wiring this in makes the scheduler strongly prefer separating these categories onto different days — while still allowing it under constraint relaxation if the tournament has no other option.

The constant exists in `constants.ts:240` with a 5.0 penalty for DIV1↔CADET but is never imported or used in `dayAssignment.ts`.

**Files:**
- Modify: `src/engine/dayAssignment.ts` — import and apply in `totalDayPenalty()`
- Test: `__tests__/engine/dayAssignment.test.ts`

- [ ] **Step 1: Write the failing test**

Add a test that schedules a DIV1 event, then scores a CADET event on the same day. Assert the penalty includes the 5.0 soft-separation contribution. Currently this returns 0 for the soft-separation component, so the test will fail.

- [ ] **Step 2: Run test to verify it fails**

Run: `timeout 120 pnpm --silent vitest run __tests__/engine/dayAssignment.test.ts > ./tmp/test.log 2>&1`
Expected: FAIL — no soft-separation penalty applied.

- [ ] **Step 3: Implement**

In `dayAssignment.ts`:
1. Import `SOFT_SEPARATION_PAIRS` from `./constants.ts`
2. In `totalDayPenalty()`, inside the per-scheduled-competition loop (after the crossover penalty block), add a check: for each `SOFT_SEPARATION_PAIRS` entry, if `competition.category` and `c2.category` match the pair (in either order) **and they share the same gender and weapon**, add `entry.penalty` to total. Only apply at level < 2 (same as soft crossover — these are soft constraints). Note: Div 1 Men's Foil and Cadet Women's Foil can coexist — the penalty only applies when weapon AND gender match.

- [ ] **Step 4: Run all dayAssignment tests to verify pass + no regressions**

Run: `timeout 120 pnpm --silent vitest run __tests__/engine/dayAssignment.test.ts > ./tmp/test.log 2>&1`
Expected: PASS

- [ ] **Step 5: Commit**

---

### Task 2: Wire `INDIV_TEAM_HARD_BLOCKS` into `totalDayPenalty`

**What & Why:** At real tournaments, certain individual and team events must never share a day. For example, Div 1 individual foil and Junior team foil can't run on the same day because the Junior team event draws heavily from the same fencer pool as Div 1 individual — fencers would have to choose between them, which isn't fair. Similarly, Veteran individual and Veteran team events of the same weapon must be on separate days. We already defined these pairs in `INDIV_TEAM_HARD_BLOCKS`, but the scheduler ignores the constant entirely. Without this, the B2 integration test (Nov 2025 NAC with Cadet teams) can't even assert individual/team separation. Wiring this in makes these hard blocks just like the existing same-population hard blocks — Infinity penalty at relaxation levels 0–2, only overridable at level 3 as a last resort.

**Files:**
- Modify: `src/engine/dayAssignment.ts` — import and apply in `totalDayPenalty()`
- Test: `__tests__/engine/dayAssignment.test.ts`

- [ ] **Step 1: Write the failing test**

Add a test that schedules a DIV1 individual event, then scores a JUNIOR team event (same weapon+gender) on the same day. Assert penalty is Infinity at level < 3. Currently returns a finite value, so the test will fail.

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement**

In `dayAssignment.ts`:
1. Import `INDIV_TEAM_HARD_BLOCKS` from `./constants.ts`
2. In `totalDayPenalty()`, after the existing hard-block check (the `crossoverPenalty === Infinity` check), add a second hard-block check: for each `INDIV_TEAM_HARD_BLOCKS` entry, if one competition matches `indivCategory` (INDIVIDUAL) and the other matches `teamCategory` (TEAM), same weapon+gender → return Infinity at level < 3.

- [ ] **Step 4: Run all dayAssignment tests to verify pass + no regressions**

- [ ] **Step 5: Run integration tests**

The B2 scenario has a TODO comment about `assertIndTeamSeparation` — enable it now that the constraint is wired in. If the engine produces errors (meaning it used level-3 relaxation), the assertion helper already skips the check, so this is safe.

Run: `timeout 120 pnpm --silent vitest run __tests__/engine/integration.test.ts > ./tmp/test.log 2>&1`

- [ ] **Step 6: Commit**

---

### Task 3: Wire `REGIONAL_CUT_OVERRIDES` into scheduling

**What & Why:** The USA Fencing Athlete Handbook specifies that regional qualifier tournaments (ROC, SYC, RJCC, SJCC) must advance all fencers from pools to DEs — no cuts allowed for Y14, Cadet, Junior, and Div 1 categories. This is because these tournaments serve as regional qualifying pathways, and cutting fencers before DEs would unfairly limit who can qualify. We defined `REGIONAL_CUT_OVERRIDES` with these rules, but the engine never applies them. Right now, if a user sets up an ROC tournament and forgets to disable cuts for Junior events, the scheduler will happily apply a 20% cut — producing an incorrect schedule with smaller DE brackets than the event should actually have. This means wrong duration estimates, wrong strip assignments, and a schedule that wouldn't match what actually happens on the tournament floor.

**Files:**
- Modify: `src/engine/scheduleOne.ts` or `src/store/buildConfig.ts` — apply overrides before scheduling
- Modify: `src/engine/validation.ts` — warn if regional tournament has custom cuts for override categories
- Test: `__tests__/engine/scheduleOne.test.ts` or `__tests__/engine/validation.test.ts`

**Design decision:** The override should be applied when building the config from the store (in `buildConfig.ts`), NOT inside the engine. The engine receives competitions with final cut values already set. The store layer is where tournament_type context lives. If a user explicitly sets a cut for a regional tournament, emit a WARN validation error but respect their choice.

- [ ] **Step 1: Write the failing test**

Test in `buildConfig.test.ts` (or a new test file): given a ROC tournament with a JUNIOR competition that has `cut_mode: PERCENTAGE, cut_value: 20`, assert that after building config the competition's cut is overridden to `DISABLED, 100`.

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement the override in buildConfig**

In `buildConfig.ts`: after building competitions from store state, if `tournament_type` is in `REGIONAL_QUALIFIER_TYPES`, iterate competitions and apply `REGIONAL_CUT_OVERRIDES` for matching categories (only if the user hasn't manually customized — or always override, treating the constant as authoritative).

- [ ] **Step 4: Add validation warning**

In `validation.ts`: if tournament_type is regional and a competition in an override category has a non-disabled cut, emit a WARN-severity error noting the override will be applied.

- [ ] **Step 5: Run tests to verify pass**

- [ ] **Step 6: Commit**

---

### Task 4: Return `constraint_relaxation_level` from `assignDay`

**What & Why:** When the scheduler can't find a valid day at full constraint strictness, it progressively relaxes constraints through 4 levels — from "respect all crossover and proximity rules" (level 0) up to "override even hard blocks" (level 3). The scheduler already does this correctly and even emits a warning bottleneck when relaxation occurs. But it throws away a critical piece of information: which level was actually used for each event. The `constraint_relaxation_level` field in the schedule result is hardcoded to 0. This matters because downstream consumers (the integration tests, the UI, future reporting) need to know whether an event was placed cleanly or was force-placed on a day that violates hard separation rules. Without this, our integration tests have to use a blunt heuristic — "if there are any errors, skip all hard-separation checks" — instead of checking per-event. Fixing this is a small plumbing change: make `assignDay` return both the day and the level it used.

**Files:**
- Modify: `src/engine/dayAssignment.ts` — change `assignDay()` return type to `{ day: number; level: number }`
- Modify: `src/engine/scheduleOne.ts` — destructure the return and store level in result
- Modify: `src/engine/types.ts` — add `DayAssignmentResult` type (or just use inline object)
- Test: `__tests__/engine/dayAssignment.test.ts`, `__tests__/engine/scheduleOne.test.ts`

- [ ] **Step 1: Write failing tests**

Two tests:
1. In `dayAssignment.test.ts`: test that `assignDay` returns `{ day, level }` where level > 0 when relaxation occurs (set up a scenario where level 0 has all-Infinity days).
2. In `scheduleOne.test.ts`: test that `scheduleCompetition` result has `constraint_relaxation_level > 0` when relaxation occurred.

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Implement**

1. Change `assignDay()` return from `number` to `{ day: number; level: ConstraintLevel }`.
2. Return `{ day: best.day, level }` instead of `best.day`.
3. In `scheduleCompetition()`: destructure `const { day, level } = assignDay(...)`, set `result.assigned_day = day` and `result.constraint_relaxation_level = level`.
4. Update any other callers of `assignDay` (check with grep).

- [ ] **Step 4: Run full test suite to verify pass + fix any broken call sites**

Run: `timeout 120 pnpm --silent test > ./tmp/test.log 2>&1`

- [ ] **Step 5: Update integration test helper**

In `integration.test.ts`, update `assertHardSeparations` to use `constraint_relaxation_level` from the schedule result instead of checking `hasErrors`:
- If `sr.constraint_relaxation_level >= 3`, skip the hard-separation check for that event (it knowingly overrode constraints).
- Remove the `hasErrors` parameter — check per-event instead of globally.

- [ ] **Step 6: Commit**

---

## Post-Plan A

After all 4 tasks pass, update METHODOLOGY.md:
- Move resolved items from "Known Engine Limitations and Open Bugs" to a "Resolved" section.
- **Soft separation (Task 1):** Document that soft-separation penalties apply per weapon+gender — e.g., Div 1 Men's Foil and Cadet Women's Foil can share a day; Div 1 Men's Foil and Cadet Men's Foil cannot (except under constraint relaxation). Add this to the separation rules section.
- **Individual/team hard blocks (Task 2):** Document which ind/team category pairs are hard-blocked (Vet ind↔Vet team, Div1 ind↔Jr team, Jr ind↔Div1 team) and that the block requires same weapon+gender. Add to separation rules section.
- Update integration test header comments — remove limitation notes that no longer apply.
