# Capacity-Relative Saber Pileup Penalty — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the bucketed `SABER_PILEUP_PENALTY_TABLE` with a capacity-relative quadratic formula so the saber-pileup penalty reflects real ref/strip load (size × duration), recovering B4 scheduling density to ≥9 events without regressing B1, B2, B3, B5, B6, B7.

**Architecture:** A single pure function in `src/engine/dayAssignment.ts` (`saberPileupPenalty`) is rewritten. The new formula sums saber strip-minutes (`strips_allocated × SABRE_POOL_ROUND_MINS`) across saber events on a candidate day — *including* the event being placed — and divides by the day's total saber strip-minute capacity (`config.strips_total × SABRE_POOL_ROUND_MINS`). Penalty is `K_SABER_PILEUP × (ratio)^2`. The call site in `src/engine/dayColoring.ts` passes the existing `config` parameter through.

**Tech Stack:** TypeScript, Vitest. No new dependencies. ts-morph MCP available for refactors (`tsconfigPath: ./tsconfig.app.json`).

**Spec reference:** `.claude/plans/2026-04-23-saber-pileup-capacity-relative.md`

**Conventions (carry forward):**
- `pnpm` not `npm`. Single file: `timeout 120 pnpm --silent vitest run <path> > ./tmp/test.log 2>&1`. Full suite: `timeout 180 pnpm --silent test > ./tmp/test.log 2>&1`. Read `./tmp/test.log` only on failure.
- `as const` objects, never TypeScript enums.
- Engine functions are pure. No global state.
- **Do NOT run `git` commands.** The user owns commits. Wherever this plan says "Commit," it means *stop and signal the user it is a commit checkpoint*.

---

## File Structure

| File | Role | Action |
|---|---|---|
| `src/engine/dayAssignment.ts` | Hosts `saberPileupPenalty` and its constants | Modify |
| `src/engine/dayColoring.ts` | Sole call site for `saberPileupPenalty` | Modify (1 line) |
| `__tests__/engine/dayAssignment.test.ts` | Unit tests for `saberPileupPenalty` | Rewrite the `describe('saberPileupPenalty', …)` block |
| `__tests__/engine/integration.test.ts` | B1–B7 scenario regression suite | Update B4 threshold (and others if measurement requires) |
| `METHODOLOGY.md` | §Saber Pileup section | Rewrite |
| `.claude/plans/scheduling-density-followups.md` | Followups doc | Mark item #1 resolved, update B-scenario table with new numbers |

---

## Tasks

### Task 1: Establish baseline measurements before changing anything

**Files:**
- Read: `__tests__/engine/integration.test.ts` (B1–B7 scenarios)

**Why:** The plan's success criteria are framed as "no regressions vs current numbers" (B1=13, B2=9, B3=6, B4=6, B5=3, B6=18, B7=4). Before any code change, run the integration suite and record the actual numbers as printed by the engine — the followups doc could be stale.

- [ ] **Step 1: Run the integration suite, capture B-scenario counts**

Run: `timeout 120 pnpm --silent vitest run __tests__/engine/integration.test.ts > ./tmp/test.log 2>&1`

Expected: all integration tests pass against the *current* (pre-change) thresholds. If any B scenario fails before any change, stop and reconcile the followups doc with reality before continuing.

- [ ] **Step 2: Record per-scenario scheduled counts**

For each describe block B1–B7, find the test "schedules events with hard constraints respected." Add a temporary `console.log('B<N>:', Object.keys(schedule).length)` line, re-run, and copy the seven numbers into `tmp/baseline-counts.txt`. Remove the console.log lines after recording.

These seven numbers are the **regression floor** for Task 6.

- [ ] **Step 3: Commit (user runs manually)**

Recommended message: `chore: record pre-change B-scenario baseline (no code changes)`. Skip the commit if you removed the console.logs and there are no working-tree changes.

---

### Task 2: Rewrite `saberPileupPenalty` unit tests against the new contract (failing tests first)

**Files:**
- Modify: `__tests__/engine/dayAssignment.test.ts:120-173` (the entire `describe('saberPileupPenalty', …)` block plus its preamble)

**Why:** TDD. The new behavior is fundamentally different (continuous, size-weighted, capacity-relative, self-included), so the existing assertions are obsolete. Replace them with assertions that pin the *shape* of the new function — not exact magic numbers, except where calibration is intentional.

- [ ] **Step 1: Replace the `describe('saberPileupPenalty', …)` block**

Delete lines 120–173 of `__tests__/engine/dayAssignment.test.ts`. Write a new block that imports `saberPileupPenalty` (still from `dayAssignment.ts`) and `makeConfig` from the factories. The new function signature takes a 5th argument `config: TournamentConfig`.

The new describe block must contain these test cases (exact names, exact behaviors — implementing engineer writes the bodies):

1. `'non-saber event → 0 regardless of day contents'` — pass a foil competition; assert returns exactly `0`. Use a config from `makeConfig()`.
2. `'saber on a day with no other saber → small positive (self contribution only)'` — pass a saber event with `strips_allocated: 4`, empty `assignments`, `config = makeConfig({ strips: makeStrips(40, 4) })`. Assert the result is `> 0` AND `< 1.0` (i.e., self-only contribution is a noise-level nudge).
3. `'saber on a day saturating saber capacity → matches K_SABER_PILEUP within 1%'` — construct a scenario where the sum of `strips_allocated` for saber events on day 0 equals `config.strips_total` (e.g., 5 saber events × 8 strips on a 40-strip config). Place the event under test on day 0 alongside enough already-assigned saber events to hit saturation. Assert the result is within `0.01` of `K_SABER_PILEUP` (export `K_SABER_PILEUP` from `dayAssignment.ts` so tests can import it).
4. `'monotonicity: more saber load on day → strictly larger penalty'` — call the function twice for the same target event on the same day, once with 1 other saber assigned, once with 3 others assigned. Assert `penalty(3) > penalty(1)`.
5. `'monotonicity in event size: larger strips_allocated on the candidate event → strictly larger penalty'` — same day, same other assignments, but vary `strips_allocated` on the event under test from 4 → 12. Assert larger event yields larger penalty. (This is the new behavior the change is for.)
6. `'saber events on a different day → 0'` — saber event on day 0, all other sabers assigned to day 1. Assert returns exactly `0`.
7. `'self-inclusion: lone saber event on empty day yields the same penalty whether self is in `assignments` or not'` — call once with self omitted from the assignments map, once with self present at the candidate day. Assert both calls return identical numbers. (Confirms the implementation handles "self in map" and "self not in map" symmetrically.)
8. `'config.strips_total === 0 → does not throw, returns finite number'` — defensive test for divide-by-zero. Use `makeConfig({ strips: makeStrips(0, 0) })`.

- [ ] **Step 2: Run the new unit tests; expect all 8 to fail**

Run: `timeout 120 pnpm --silent vitest run __tests__/engine/dayAssignment.test.ts > ./tmp/test.log 2>&1`

Expected: the 8 new `saberPileupPenalty` tests fail (signature mismatch — function still takes 4 args, no `K_SABER_PILEUP` export, table-based numbers no longer match). `constraintScore` and `findEarlierSlotSameDay` tests in the same file must still pass.

If `constraintScore` or `findEarlierSlotSameDay` tests fail, you accidentally edited outside the saberPileupPenalty block — revert and try again.

- [ ] **Step 3: Commit (user runs manually)**

Recommended message: `test: rewrite saberPileupPenalty tests for capacity-relative model`.

---

### Task 3: Implement the new `saberPileupPenalty` and `K_SABER_PILEUP`

**Files:**
- Modify: `src/engine/dayAssignment.ts:68-103` (the `saberPileupPenalty` section, including the `SABER_PILEUP_PENALTY_TABLE` export to be removed)

**Why:** Make the failing tests from Task 2 pass.

- [ ] **Step 1: Delete `SABER_PILEUP_PENALTY_TABLE`**

Remove the export at lines 72–77. Search the codebase (`grep -rn SABER_PILEUP_PENALTY_TABLE src/ __tests__/`) to confirm no other consumers — the only legitimate references should be in this file and the *old* test block (which Task 2 already replaced).

- [ ] **Step 2: Add `K_SABER_PILEUP` constant**

Add an exported constant near the top of the saber pileup section: `export const K_SABER_PILEUP = 50` (typed as `number`, not `as const`, to keep arithmetic clean). Document with a one-line comment that it is calibrated so saturating a day's saber capacity matches the maximum penalty of the prior bucketed model.

- [ ] **Step 3: Rewrite `saberPileupPenalty`**

New signature:
```
export function saberPileupPenalty(
  competition: Competition,
  candidateDay: number,
  assignments: Map<string, number>,
  allCompetitions: Competition[],
  config: TournamentConfig,
): number
```

Behavior (implementing engineer writes the body):
- If `competition.weapon !== Weapon.SABRE`, return `0`.
- Import `DEFAULT_POOL_ROUND_DURATION_TABLE` from `./constants.ts` and read `SABRE_POOL_ROUND_MINS = DEFAULT_POOL_ROUND_DURATION_TABLE[Weapon.SABRE]` (= 75 today).
- Compute `S_day` as the sum, over every `c` in `allCompetitions` with `c.weapon === Weapon.SABRE`, of `c.strips_allocated * SABRE_POOL_ROUND_MINS` where either `assignments.get(c.id) === candidateDay` OR `c.id === competition.id` (so self always contributes once, regardless of whether self is in the map). Avoid double-counting if self is also present in the map at `candidateDay`.
- Compute `dayCapacity = Math.max(config.strips_total * SABRE_POOL_ROUND_MINS, 1)` to guard against divide-by-zero.
- Return `K_SABER_PILEUP * Math.pow(S_day / dayCapacity, 2)`.

Update the JSDoc comment on the function to describe the new model: capacity-relative quadratic, size-weighted, self-included.

- [ ] **Step 4: Run the unit tests**

Run: `timeout 120 pnpm --silent vitest run __tests__/engine/dayAssignment.test.ts > ./tmp/test.log 2>&1`

Expected: all 8 new `saberPileupPenalty` tests pass. `constraintScore` and `findEarlierSlotSameDay` tests still pass.

If any of the 8 tests fail, debug by running the individual case (e.g., `vitest run -t 'saber on a day saturating saber capacity'`) and reading `./tmp/test.log`. Likely culprits: forgetting to include self when self is not in the map, double-counting self when self IS in the map, or wrong `K_SABER_PILEUP` value.

- [ ] **Step 5: Compile-check the rest of the package**

Run: `timeout 60 pnpm --silent tsc -p tsconfig.app.json --noEmit > ./tmp/test.log 2>&1`

Expected: no TypeScript errors. The call site in `dayColoring.ts` will fail typecheck because it passes only 4 args — that error is expected and Task 4 fixes it. If you see *other* TypeScript errors (e.g., in production code unrelated to this function), stop and investigate.

- [ ] **Step 6: Commit (user runs manually)**

Recommended message: `feat(engine): rewrite saberPileupPenalty as capacity-relative quadratic`.

---

### Task 4: Update the `dayColoring.ts` call site to pass `config`

**Files:**
- Modify: `src/engine/dayColoring.ts:236` (the `saberPileupPenalty` call inside `colorPenalty`)

**Why:** The function signature gained a 5th argument. The single call site must pass it.

- [ ] **Step 1: Find the enclosing function and confirm `config` is in scope**

Inspect `colorPenalty` in `src/engine/dayColoring.ts` (the function containing line 236). Confirm `config: TournamentConfig` is one of its parameters. If it is *not* in scope, walk up the call chain — the caller of `colorPenalty` (likely `dsaturColor` or similar) must already have `config` because the load-balance branch below line 236 uses other config-derived data. Add `config` as a parameter where missing and thread it through.

- [ ] **Step 2: Pass `config` to the `saberPileupPenalty` call**

Change line 236 from `total += saberPileupPenalty(self, c, coloring, competitions)` to `total += saberPileupPenalty(self, c, coloring, competitions, config)`.

- [ ] **Step 3: Compile-check**

Run: `timeout 60 pnpm --silent tsc -p tsconfig.app.json --noEmit > ./tmp/test.log 2>&1`

Expected: no TypeScript errors.

- [ ] **Step 4: Run the dayColoring unit tests**

Run: `timeout 120 pnpm --silent vitest run __tests__/engine/dayColoring.test.ts > ./tmp/test.log 2>&1`

Expected: all pass. The dayColoring tests should not be sensitive to the saber penalty's exact magnitude unless they assert on totals — if any fail, read `./tmp/test.log` and decide whether the failure represents a real regression or just a number that needs updating because the saber penalty value changed.

- [ ] **Step 5: Commit (user runs manually)**

Recommended message: `refactor(engine): thread config to saberPileupPenalty call site`.

---

### Task 5: Run the full integration suite and measure B1–B7 deltas

**Files:**
- Read: `__tests__/engine/integration.test.ts` (no modifications yet)

**Why:** This is the moment of truth. Before adjusting any thresholds, observe what the new formula produces for every B scenario.

- [ ] **Step 1: Add temporary console.log lines for each B scenario**

In each B describe block (B1 through B7) find the line that asserts `Object.keys(schedule).length`. Immediately before the assertion, add `console.log('B<N>:', Object.keys(schedule).length)`.

- [ ] **Step 2: Run the integration suite**

Run: `timeout 180 pnpm --silent vitest run __tests__/engine/integration.test.ts > ./tmp/test.log 2>&1`

Expected: tests may pass or fail depending on whether the *current* thresholds happen to be ≤ the new numbers. Either way, capture the seven `B<N>: <count>` lines from the log into `tmp/post-change-counts.txt`.

- [ ] **Step 3: Compare against the baseline and decide next action**

Read `tmp/baseline-counts.txt` (from Task 1) and `tmp/post-change-counts.txt` side by side. Three outcomes:

- **(A) B4 ≥ 9 AND every other B ≥ baseline** → Success. Proceed to Task 6.
- **(B) B4 ≥ 9 BUT some other B regressed** → Calibration miss. Halve `K_SABER_PILEUP` to `25` (in `dayAssignment.ts`), update Test 3 in Task 2's spec to expect `K_SABER_PILEUP/4 = ~6.25` at saturation? No — easier: keep `K_SABER_PILEUP` exported and have the test reference it by name (it should already do this). Re-run from Step 2. If two halvings (K=25, K=12.5) don't yield outcome A, escalate to Step 4.
- **(C) B4 < 9** → `K` is too low or model is wrong. Try `K = 100`, then `K = 200`. If neither helps, escalate to Step 4.

- [ ] **Step 4: Escalation — model is wrong, not the constant**

If no value of `K` in `{12.5, 25, 50, 100, 200}` lands outcome (A), the capacity-relative model itself is the wrong shape. Stop, document the K → outcome table in `tmp/calibration-log.md`, revert the working tree to before Task 3, mark item #1 in `.claude/plans/scheduling-density-followups.md` as "investigated, not actionable — capacity-relative quadratic does not unlock B4 without regressing others," and report back to the user. Do not ship a half-fix.

- [ ] **Step 5: Remove temporary console.log lines**

Delete the seven `console.log` lines added in Step 1.

- [ ] **Step 6: Commit (user runs manually) — only if outcome (A) reached**

Recommended message: `chore: record post-change B-scenario counts (K=<final value>)`.

---

### Task 6: Update integration thresholds and the followups doc

**Files:**
- Modify: `__tests__/engine/integration.test.ts:303` (B4 threshold) and any other B describe whose threshold can now be tightened to its new measured floor
- Modify: `.claude/plans/scheduling-density-followups.md` (table + item #1)

**Why:** Lock in the new floor and document the resolution.

- [ ] **Step 1: Set B4 threshold to ≥ 9**

Change `expect(Object.keys(schedule).length).toBeGreaterThanOrEqual(6)` at `__tests__/engine/integration.test.ts:303` to `toBeGreaterThanOrEqual(9)`. Update the inline comment on lines 301–302 to reflect the new model and threshold (e.g., "B4: 30 events; engine schedules ≥9 (capacity-relative saber penalty restored pre-refs-as-output baseline).").

- [ ] **Step 2: Optionally tighten other B thresholds**

If `tmp/post-change-counts.txt` shows other B scenarios scheduling more events than their current threshold (e.g., B6 measured 19 vs. threshold 17), tightening is *encouraged but not required*. If you tighten, update only to the measured floor (no buffer) and update the inline comment.

- [ ] **Step 3: Run the full integration suite**

Run: `timeout 180 pnpm --silent vitest run __tests__/engine/integration.test.ts > ./tmp/test.log 2>&1`

Expected: all integration tests pass with the updated thresholds.

- [ ] **Step 4: Run the full test suite**

Run: `timeout 180 pnpm --silent test > ./tmp/test.log 2>&1`

Expected: all tests pass. If any non-integration test fails, it likely depends on the saber penalty's exact magnitude (uncommon — the unit tests we rewrote are the main consumers). Investigate before continuing.

- [ ] **Step 5: Update `.claude/plans/scheduling-density-followups.md`**

In the B-scenario state table (around lines 18–26), add a new "Post-saber-penalty-refactor" column with the new measured numbers. In the "Refs-as-output delta summary" section, add a paragraph noting that B4's regression has been resolved by the capacity-relative penalty rewrite. In the "Next-session investigation list" section, mark item #1 as **resolved** and note the resolution date (2026-04-23) and the final value of `K_SABER_PILEUP`.

- [ ] **Step 6: Commit (user runs manually)**

Recommended message: `test: tighten B-scenario thresholds to new measured floor` (combine with the followups doc edit).

---

### Task 7: Update METHODOLOGY.md

**Files:**
- Modify: `METHODOLOGY.md`, §Saber Pileup section (search for "Saber Pileup" or "SABER_PILEUP")

**Why:** Keep documentation in sync with code. The bucketed table is no longer the model.

- [ ] **Step 1: Locate the §Saber Pileup section**

Run: `grep -n "Saber Pileup\|SABER_PILEUP" /Users/noahlz/projects/piste-planner/METHODOLOGY.md`

If no section exists, add one under the §Scheduling Algorithm heading (the JSDoc on `saberPileupPenalty` references it).

- [ ] **Step 2: Rewrite the section**

The new section should describe:
- *Why* the penalty exists: saber refs are scarce three-weapon specialists, so concentrating saber pool rounds onto one day strains ref staffing even when total strip capacity is fine.
- *What it measures*: total saber pool-round strip-minutes on a candidate day (size-weighted, including the event being placed) divided by the day's total saber strip-minute capacity, squared, scaled by `K_SABER_PILEUP`.
- *What the formula does NOT model*: DE-phase ref demand (covered separately by `ref_requirements_by_day` post-schedule output).
- *Tuning knob*: `K_SABER_PILEUP` in `src/engine/dayAssignment.ts`. Default 50 (or whichever value Task 5 settled on).

Remove any prose referring to the old bucketed table or magic numbers (0.5, 2.0, 10.0, 50.0).

- [ ] **Step 3: Commit (user runs manually)**

Recommended message: `docs: rewrite METHODOLOGY §Saber Pileup for capacity-relative model`.

---

### Task 8: Final verification

**Files:** none to modify.

- [ ] **Step 1: Run the full suite one more time**

Run: `timeout 180 pnpm --silent test > ./tmp/test.log 2>&1`

Expected: all tests pass.

- [ ] **Step 2: TypeScript check**

Run: `timeout 60 pnpm --silent tsc -p tsconfig.app.json --noEmit > ./tmp/test.log 2>&1`

Expected: no errors.

- [ ] **Step 3: Lint / build (if applicable)**

If the repo has a lint or build command in `package.json`, run it. Read `package.json` `scripts` to find candidates (`pnpm lint`, `pnpm build`).

- [ ] **Step 4: Verify the B-scenario delta in the followups doc matches reality**

Read `.claude/plans/scheduling-density-followups.md` and confirm the new "Post-saber-penalty-refactor" column matches `tmp/post-change-counts.txt`. If they diverge, fix the doc.

- [ ] **Step 5: Dispatch test-quality-reviewer agent on the rewritten test block**

Per project standing instruction (`feedback_test_quality_review.md`), after editing tests dispatch the test-quality-reviewer agent on `__tests__/engine/dayAssignment.test.ts`. Address any actionable feedback in a follow-up commit.

- [ ] **Step 6: Final summary for the user**

Report:
- Final value of `K_SABER_PILEUP`.
- Pre and post B-scenario counts for B1–B7.
- Files touched.
- Any unexpected behavior or follow-ups uncovered.

---

## Self-Review Notes

- Spec coverage: every section of the spec maps to a task — formula (Task 3), self-inclusion (Task 3 + Task 2 case 7), files touched (Tasks 3–7), acceptance criteria (Tasks 5, 6, 8), risks (Task 5 escalation flow).
- No placeholders (no TBD, no "implement appropriate X").
- Type consistency: `saberPileupPenalty` always referenced with the new 5-arg signature (Tasks 2, 3, 4). `K_SABER_PILEUP` consistently named across Tasks 3, 5, 7. `SABRE_POOL_ROUND_MINS` derived consistently via `DEFAULT_POOL_ROUND_DURATION_TABLE[Weapon.SABRE]` (Task 3).
- Git policy honored: every "Commit" step is annotated `(user runs manually)`.
