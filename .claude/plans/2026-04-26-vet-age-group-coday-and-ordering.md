# Vet Age-Group Co-Day Correction and Within-Day Ordering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the F2b co-day rule to exclude VET_COMBINED, add hard separation between VET_COMBINED and age-banded Vet ind events, sequence age-banded Vet ind co-day siblings in age-descending order with full event serialization, and add a soft preference placing VET_COMBINED on the day after the age-group co-day.

**Architecture:** Three coupled changes (F3a, F3b, F3c) layered onto the existing serial scheduler. F3a corrects `vetCoDayRequiredColor` and adds an Infinity edge in `crossoverPenalty`. F3b adds a sort key in `daySequencing.ts`; the existing event-major loop in `scheduler.ts` handles the rest. F3c adds `vetCombinedOrderingPenalty` modeled on the existing `individualTeamOrderingPenalty`, wired into `colorPenalty`. METHODOLOGY.md is updated alongside each piece. Concurrent scheduler (Phase C) gets a deferred note for the same dependency edge.

**Tech Stack:** TypeScript, Vitest, pnpm. ts-morph MCP `tsconfigPath = ./tsconfig.app.json`.

**Working order:** F3a → F3b → F3c. F3a is a strict prerequisite for F3c (gap = 0 must be hard-blocked before the soft preference is meaningful). F3b is independent of the other two but cheapest to ship after F3a since both touch METHODOLOGY.md.

**Conventions:**
- pnpm, not npm. Single test file: `timeout 120 pnpm --silent vitest run <path> > ./tmp/test.log 2>&1`. Full suite: `timeout 180 pnpm --silent test > ./tmp/test.log 2>&1`. Read `./tmp/test.log` only on failure.
- `as const` objects, never TypeScript enums.
- Engine functions are pure.
- After any task that adds or edits tests, dispatch the `test-quality-reviewer` agent on the touched test file(s) before moving on.
- After any task that touches React code, dispatch the `react-code-reviewer` agent on the touched component file(s). (Not expected for this plan — engine-only.)
- Git commits are the user's responsibility. Plan steps marked "(user runs manually)" indicate commit points.

---

## File Structure

**Files modified:**
- `src/engine/dayColoring.ts` — F3a (correct `vetCoDayRequiredColor`), F3c (add `vetCombinedOrderingPenalty`, wire into `colorPenalty`).
- `src/engine/crossover.ts` — F3a (add VET_COMBINED ↔ age-banded VET ind hard block in `crossoverPenalty`).
- `src/engine/daySequencing.ts` — F3b (add age-descending sort key for Vet sibling pairs).
- `METHODOLOGY.md` — F3a (amend §Veteran Age-Group Co-Day Rule:86), F3b (add "Within-Day Age-Descending Order" sub-section), F3c (add day-after soft preference bullet).
- `.claude/plans/2026-04-23-concurrent-scheduler.md` — F3b (add Phase C dependency-edge note in §Priority function or §Phase C scheduler loop).

**Test files modified:**
- `__tests__/engine/dayColoring.test.ts` — F3a co-day correction tests, F3c soft-preference tests.
- `__tests__/engine/crossover.test.ts` — F3a hard-block tests for VET_COMBINED ↔ age-banded VET ind.
- `__tests__/engine/daySequencing.test.ts` — F3b age-descending sort tests.

**No new files.**

---

## F3a — VET_COMBINED is not a co-day sibling

### Task 1: Test the corrected co-day siblings rule (VET_COMBINED excluded)

**Files:**
- Test: `__tests__/engine/dayColoring.test.ts`

- [ ] **Step 1: Add a failing test under the existing `'assignDaysByColoring — Veteran Co-Day Rule'` describe block** (around line 401). The test fixture: VET40 M Foil ind + VET60 M Foil ind + VET_COMBINED M Foil ind. `days_available: 3`. Expected: VET40 and VET60 share a day; VET_COMBINED is on a *different* day. Use the existing `makeCompetition` factory and `assignDaysByColoring` import already in the file.

- [ ] **Step 2: Add a second failing test** in the same describe block: VET_COMBINED M Foil ind alone (no age-banded siblings). Expected: assignment succeeds (no co-day forcing applied to VET_COMBINED-only fixtures). Asserts that `vetCoDayRequiredColor` returns null when `self.vet_age_group === VET_COMBINED` even with no other Vet events present.

- [ ] **Step 3: Run the new tests to confirm they fail**

```
timeout 120 pnpm --silent vitest run __tests__/engine/dayColoring.test.ts > ./tmp/test.log 2>&1
```

Expected: both new tests fail. The first because the current `vetCoDayRequiredColor` would force VET_COMBINED onto the age-group day; the second may or may not fail depending on what other constraints are in play — confirm the failure mode in the log.

### Task 2: Implement the F3a `vetCoDayRequiredColor` correction

**Files:**
- Modify: `src/engine/dayColoring.ts:269–288` (the `vetCoDayRequiredColor` function).

- [ ] **Step 1: Edit `vetCoDayRequiredColor`** to (a) return null if `self.vet_age_group === VetAgeGroup.VET_COMBINED`, and (b) skip any `other` whose `vet_age_group === VetAgeGroup.VET_COMBINED` in the sibling-search loop. Both checks use the existing `VetAgeGroup` enum import. Update the JSDoc to state the function binds only age-banded VET ind events.

- [ ] **Step 2: Run the dayColoring tests**

```
timeout 120 pnpm --silent vitest run __tests__/engine/dayColoring.test.ts > ./tmp/test.log 2>&1
```

Expected: both new tests pass. All pre-existing tests in the file still pass. If a pre-existing test fails, it likely encoded the buggy F2 behavior (forcing VET_COMBINED onto the co-day) — open the failure, confirm it asserts the buggy behavior, and update the assertion to match the correct rule. Do not silence a failure that asserts something else.

### Task 3: Test the VET_COMBINED ↔ age-banded VET ind hard block in `crossoverPenalty`

**Files:**
- Test: `__tests__/engine/crossover.test.ts`

- [ ] **Step 1: Add a failing test** for `crossoverPenalty(VET40 M Foil ind, VET_COMBINED M Foil ind)`. Expected return value: `Infinity`. Mirror the structure of any existing same-population assertion in the file.

- [ ] **Step 2: Add a second failing test** for the symmetric pair `crossoverPenalty(VET_COMBINED M Foil ind, VET80 M Foil ind)`. Expected: `Infinity`.

- [ ] **Step 3: Add a non-blocking assertion** confirming the rule is gender + weapon scoped: `crossoverPenalty(VET40 M Foil ind, VET_COMBINED W Foil ind)` (different gender) should NOT return Infinity from this rule. Returns whatever the existing `PENALTY_MATRIX` lookup gives (likely 0).

- [ ] **Step 4: Add a fourth assertion** confirming team events are not affected by the new rule: `crossoverPenalty(VET_COMBINED M Foil ind, VET M Foil team)` continues to return Infinity from the existing same-population rule (Vet team spans all age groups). Reading the assertion verifies the new rule didn't accidentally weaken existing same-population behavior.

- [ ] **Step 5: Run the crossover tests to confirm new ones fail**

```
timeout 120 pnpm --silent vitest run __tests__/engine/crossover.test.ts > ./tmp/test.log 2>&1
```

Expected: the two Infinity-pair tests fail (currently return 0 or some matrix value); the gender-mismatch test may already pass; the team test already passes.

### Task 4: Implement the F3a `crossoverPenalty` hard block

**Files:**
- Modify: `src/engine/crossover.ts:99–115` (the `crossoverPenalty` function and surrounding helpers).

- [ ] **Step 1: Add a small helper** `isVetCombinedAgeBandedBlock(c1, c2): boolean` near `isSamePopulation` (`crossover.ts:84`). Returns true iff both events are `VETERAN` ind, same gender, same weapon, and one has `vet_age_group === VET_COMBINED` while the other has `vet_age_group ∈ {VET40, VET50, VET60, VET70, VET80}`. Uses the existing `CompFields` type and `VetAgeGroup` enum (add the import if not already present).

- [ ] **Step 2: Call the helper from `crossoverPenalty`** immediately after the `isSamePopulation` check (around line 108). If `isVetCombinedAgeBandedBlock(c1, c2)` returns true, return `Infinity`. Order matters: this check belongs *after* `isSamePopulation` (so VET_COMBINED ↔ VET_COMBINED of same gender + weapon still returns Infinity from same-population) and *before* the `isGroup1Mandatory` check (so the hard block fires regardless of the matrix).

- [ ] **Step 3: Update the JSDoc** on `crossoverPenalty` to mention the new VET_COMBINED hard block.

- [ ] **Step 4: Run the crossover tests**

```
timeout 120 pnpm --silent vitest run __tests__/engine/crossover.test.ts > ./tmp/test.log 2>&1
```

Expected: all four new tests pass. All pre-existing tests still pass.

### Task 5: Run the test-quality-reviewer agent on the new tests

- [ ] **Step 1: Dispatch test-quality-reviewer** on `__tests__/engine/dayColoring.test.ts` (added co-day tests in Task 1) and `__tests__/engine/crossover.test.ts` (added Vet-Combined block tests in Task 3). Address any meaningful issues raised; ignore stylistic noise.

### Task 6: Update METHODOLOGY.md for F3a

**Files:**
- Modify: `METHODOLOGY.md:84–88` (§Veteran Age-Group Co-Day Rule).

- [ ] **Step 1: Edit the bullet at line 86** to remove the parenthetical "(and Vet Combined where applicable)". The corrected wording should restrict the co-day rule to age-banded events (VET40–VET80) explicitly.

- [ ] **Step 2: Add a new bullet** to the same section stating that VET_COMBINED is *hard-blocked* from sharing a day with any age-banded Vet ind for the same gender + weapon. State the rationale: a fencer typically enters their primary age-banded event AND VET_COMBINED, so co-locating them double-books that fencer.

- [ ] **Step 3: Verify cross-references.** If line 81 ("Vet 40 M Foil ind and Vet 50 M Foil ind are *different* categories") references the co-day rule, ensure consistency. The block forced by F3a is between VET_COMBINED and age-banded events, not between two age-banded events of different age groups.

### Task 7: Run full suite to confirm no regressions

- [ ] **Step 1: Run the full test suite**

```
timeout 180 pnpm --silent test > ./tmp/test.log 2>&1
```

Expected: full pass. If any test fails, inspect `./tmp/test.log`. Most likely failure mode: an integration scenario whose fixture coincidentally puts VET_COMBINED on the same day as age-banded events. Update the fixture or assertion to match the new rule; the new rule is correct.

- [ ] **Step 2: Commit F3a (user runs manually).** Suggested commit message body: "fix(scheduling): exclude VET_COMBINED from Vet age-group co-day rule and add hard separation".

---

## F3b — Within-day age-descending serialization on the Vet co-day

### Task 8: Test the age-descending sort key for Vet sibling pairs

**Files:**
- Test: `__tests__/engine/daySequencing.test.ts`

- [ ] **Step 1: Add a failing test** with a fixture of three age-banded Vet M Foil ind events: VET40 (large fencer count, e.g. 80), VET60 (medium, e.g. 30), VET80 (small, e.g. 10). Without the new sort key, the existing strip-demand sort would put VET40 first (largest demand). Call `sequenceEventsForDay([vet40, vet60, vet80], config)`. Expected: returned order is `[vet80, vet60, vet40]` — strictly age-descending despite VET40 having higher demand.

- [ ] **Step 2: Add a second failing test** confirming the sort key only fires for same gender + weapon Vet sibling pairs. Fixture: VET40 M Foil + VET60 W Foil (different genders). Expected: their relative order is decided by strip-demand and duration, NOT by age-descending. The age-descending rule must not incorrectly cross-bind genders.

- [ ] **Step 3: Add a third test** confirming non-Vet events are unaffected. Fixture: a mix of VET40 M Foil ind, JUNIOR M Foil ind, CADET M Foil ind. The Vet event's position relative to non-Vet events should be decided by the existing chain (mandatory, indiv/team, strip-demand). The age-descending tiebreaker is a no-op for non-Vet pairs.

- [ ] **Step 4: Run the daySequencing tests**

```
timeout 120 pnpm --silent vitest run __tests__/engine/daySequencing.test.ts > ./tmp/test.log 2>&1
```

Expected: the first test fails (VET40 sorts first today). Tests 2 and 3 may already pass since the rule isn't yet implemented and falls back to existing chain behavior — confirm in log.

### Task 9: Implement the F3b age-descending sort key

**Files:**
- Modify: `src/engine/daySequencing.ts` (the `sequenceEventsForDay` function and surrounding helpers).

- [ ] **Step 1: Add a module-level constant** mapping age-banded `VetAgeGroup` values to a numeric sort weight where older = lower (sorts earlier). Suggested mapping: `VET80 → 0, VET70 → 1, VET60 → 2, VET50 → 3, VET40 → 4`. VET_COMBINED is intentionally not in the map (VET_COMBINED siblings should never appear on this co-day per F3a — but the helper should fail gracefully if asked, returning null).

- [ ] **Step 2: Add a helper** `vetAgeOrderingKey(a: Competition, b: Competition): number | null` that returns null unless both events are VETERAN ind, same gender, same weapon, and both have age-banded `vet_age_group` values (in the constant map). When non-null, returns `weight(a) - weight(b)` so older sorts earlier.

- [ ] **Step 3: Insert the helper into the existing comparator chain** in `sequenceEventsForDay` (`daySequencing.ts:50`) between key #3 (indiv before team) and key #4 (strip demand). When `vetAgeOrderingKey(a, b)` returns null, fall through to key #4 unchanged. When non-null and non-zero, return its value.

- [ ] **Step 4: Update the JSDoc** on `sequenceEventsForDay` to list the new key 3.5 ("Vet age-descending for sibling pairs"). Update the surrounding comment block in the function body to enumerate keys 1, 2, 3, 3.5, 4, 5.

- [ ] **Step 5: Run the daySequencing tests**

```
timeout 120 pnpm --silent vitest run __tests__/engine/daySequencing.test.ts > ./tmp/test.log 2>&1
```

Expected: all three new tests pass. All pre-existing tests still pass.

### Task 10: Add an end-to-end assertion that pool starts respect age order

**Files:**
- Test: `__tests__/engine/daySequencing.test.ts` (or a new integration test file if the existing file is unit-scoped — pick the one that already imports `scheduleAll` if any does; otherwise add to `__tests__/engine/scheduler.test.ts`).

- [ ] **Step 1: Add an end-to-end test** that calls `scheduleAll` with a fixture of VET40, VET60, VET80 M Foil ind and confirms `result.schedule[vet80].pool_start < result.schedule[vet60].pool_start < result.schedule[vet40].pool_start`. Use a fencer-count distribution that would otherwise produce a different order (e.g. VET40 = 80, VET60 = 30, VET80 = 10). Strips and refs should be ample so no scheduling failure obscures the check.

- [ ] **Step 2: Run the test**

```
timeout 120 pnpm --silent vitest run <path-to-test-file> > ./tmp/test.log 2>&1
```

Expected: pass. The serial scheduler's event-major loop runs each event end-to-end before the next; combined with the new sort key, the assertion holds.

### Task 11: Update METHODOLOGY.md with the within-day ordering sub-section

**Files:**
- Modify: `METHODOLOGY.md` (immediately after the F3a edits in §Veteran Age-Group Co-Day Rule).

- [ ] **Step 1: Add a sub-heading** "Within-Day Age-Descending Order" under §Veteran Age-Group Co-Day Rule.

- [ ] **Step 2: Document the rule.** On a Vet co-day for (gender, weapon), age-banded events run in age-descending sequence (VET80 → VET70 → VET60 → VET50 → VET40), each event completing in full (pools + DEs + bronze) before the next-younger event begins. Cite the rationale: USA Fencing Veterans are nested-eligible — a fencer aged ≥80 may also enter VET70/60/50/40 and must finish their primary event before starting the next.

- [ ] **Step 3: Note implementation hooks.** Reference `daySequencing.ts` for the serial scheduler ordering and forward-reference the concurrent scheduler dependency edge (Phase C, see plan `.claude/plans/2026-04-23-concurrent-scheduler.md` issue #3 / F3b).

### Task 12: Add the concurrent-scheduler dependency-edge note for F3b

**Files:**
- Modify: `.claude/plans/2026-04-23-concurrent-scheduler.md` (the §Priority function section, around lines 162–170, OR review issue #3 resolution at line 313).

- [ ] **Step 1: Add a short paragraph** stating that the concurrent scheduler must add a sequencing edge `younger_sibling.pools.ready_time = older_sibling.last_phase.end_time + ADMIN_GAP_MINS` between Vet age-banded ind siblings of the same gender + weapon. This mirrors the indv→team gap pattern already covered by review issue #3. The edge fires only when both siblings are colored on the same day (which they always will be per F2b after the F3a correction).

### Task 13: Run test-quality-reviewer on F3b tests

- [ ] **Step 1: Dispatch test-quality-reviewer** on `__tests__/engine/daySequencing.test.ts` (and the integration test from Task 10 if it landed in a separate file). Address findings.

### Task 14: Run full suite, commit F3b (user runs manually)

- [ ] **Step 1: Run the full test suite**

```
timeout 180 pnpm --silent test > ./tmp/test.log 2>&1
```

Expected: full pass. Suggested commit message body: "feat(scheduling): sequence Vet age-banded co-day siblings in age-descending order".

---

## F3c — VET_COMBINED day-after-age-group soft preference

### Task 15: Test the day-after preference

**Files:**
- Test: `__tests__/engine/dayColoring.test.ts`

- [ ] **Step 1: Add a failing test** under the existing `'assignDaysByColoring — Veteran Co-Day Rule'` describe block (or a new sibling describe block titled `'— Vet Combined Day-After Preference'`). Fixture: VET40 + VET60 + VET80 M Foil ind + VET_COMBINED M Foil ind. `days_available: 3`. Strips and refs ample. Expected: the three age-banded events share day D; VET_COMBINED lands on day D+1 (gap = +1 from any age-banded sibling).

- [ ] **Step 2: Add a second failing test** confirming the preference is genuinely a soft penalty, not a hard rule. Fixture: same Vet events PLUS a fixture that consumes day D+1's capacity entirely (e.g. a large Junior event). Expected: VET_COMBINED falls back to a different day (D+2 or earlier-than-D), not crashing or violating any hard rule. The exact day depends on the soft-penalty arithmetic; assert only that VET_COMBINED is scheduled and not on day D itself (F3a hard rule).

- [ ] **Step 3: Run the dayColoring tests**

```
timeout 120 pnpm --silent vitest run __tests__/engine/dayColoring.test.ts > ./tmp/test.log 2>&1
```

Expected: the first test fails (today's coloring has no preference for D+1 over D+2, so VET_COMBINED could land anywhere ≥ D+0, and the F3a hard rule sends it to D+0 ± neighbors). The second test may pass or fail depending on existing fallback behavior — confirm in log.

### Task 16: Implement the F3c soft preference

**Files:**
- Modify: `src/engine/dayColoring.ts` (add new helper, wire into `colorPenalty`).

- [ ] **Step 1: Add a new helper** `vetCombinedOrderingPenalty(competition, proposedDay, coloring, competitions): number` near `individualTeamOrderingPenalty` (`dayColoring.ts:154`). Structure mirrors `individualTeamOrderingPenalty`:
    - Returns 0.0 unless `competition.vet_age_group === VetAgeGroup.VET_COMBINED` AND `competition.event_type === EventType.INDIVIDUAL`.
    - Searches `competitions` for any age-banded VET ind sibling (same gender + weapon, `vet_age_group ∈ {VET40, VET50, VET60, VET70, VET80}`). Per F3a, all such siblings are colored on the same day, so picking any one is sufficient — guard with a defensive assertion or pick the first colored one.
    - Computes `gap = proposedDay - siblingDay`.
    - Returns `PENALTY_WEIGHTS.INDIV_TEAM_DAY_AFTER` (-0.4) for gap = +1, `PENALTY_WEIGHTS.TEAM_BEFORE_INDIVIDUAL` (1.0) for gap = -1, `PENALTY_WEIGHTS.INDIV_TEAM_2_PLUS_DAYS` (0.3) for |gap| ≥ 2.
    - gap = 0 cannot occur (F3a hard rule); return 0 defensively if it ever does.

- [ ] **Step 2: Wire the helper into `colorPenalty`** at `dayColoring.ts:232`, immediately after the `individualTeamOrderingPenalty` call. Add the new total contribution. The function signature and parameter list of `vetCombinedOrderingPenalty` should match the existing pattern so the call site is a one-line add.

- [ ] **Step 3: Update the JSDoc on `colorPenalty`** to mention the new Vet-Combined ordering term.

- [ ] **Step 4: Run the dayColoring tests**

```
timeout 120 pnpm --silent vitest run __tests__/engine/dayColoring.test.ts > ./tmp/test.log 2>&1
```

Expected: both new tests pass. All pre-existing tests still pass.

### Task 17: Run test-quality-reviewer on F3c tests

- [ ] **Step 1: Dispatch test-quality-reviewer** on the F3c additions in `__tests__/engine/dayColoring.test.ts`. Address findings.

### Task 18: Update METHODOLOGY.md with the day-after preference

**Files:**
- Modify: `METHODOLOGY.md` (§Veteran Age-Group Co-Day Rule, after the F3a/F3b additions).

- [ ] **Step 1: Add a bullet** noting the soft preference: VET_COMBINED for (gender, weapon) is preferentially scheduled on the day immediately after the age-banded co-day. Soft penalty in the day-coloring layer, mirroring the existing indv/team day-after preference. Defaults: gap +1 = bonus, gap -1 = strong penalty, |gap| ≥ 2 = mild penalty.

- [ ] **Step 2: Cross-reference** the implementation: `vetCombinedOrderingPenalty` in `src/engine/dayColoring.ts`, weights from `PENALTY_WEIGHTS` in `constants.ts` (reuses `INDIV_TEAM_DAY_AFTER`, `TEAM_BEFORE_INDIVIDUAL`, `INDIV_TEAM_2_PLUS_DAYS`).

### Task 19: Run full suite, commit F3c (user runs manually)

- [ ] **Step 1: Run the full test suite**

```
timeout 180 pnpm --silent test > ./tmp/test.log 2>&1
```

Expected: full pass. If a pre-existing integration test now picks a different day for VET_COMBINED than before — that is the new soft preference at work. Update the assertion if it asserted a stale day and the new placement is correct; investigate if the new placement violates a hard rule.

- [ ] **Step 2: Commit F3c (user runs manually).** Suggested commit message body: "feat(scheduling): prefer VET_COMBINED on day after age-group co-day".

---

## Final Acceptance Checklist

Before declaring done:

- [ ] All three sub-pieces (F3a, F3b, F3c) ship with their METHODOLOGY.md updates and tests.
- [ ] `timeout 180 pnpm --silent test > ./tmp/test.log 2>&1` produces a full pass with no skipped tests.
- [ ] The F3 entry in `.claude/plans/2026-04-23-concurrent-scheduler.md` (lines 533–558) accurately reflects what shipped (it already does as of 2026-04-26 — no further edits needed unless implementation diverged).
- [ ] The Phase C dependency-edge note (Task 12) is in place for the future concurrent-scheduler implementation.
- [ ] Three commits exist (one per sub-piece) per user policy.
