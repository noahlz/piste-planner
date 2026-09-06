# Handoff: 011 — the strip count the app suggests is the strip count that works

**Feature**: `011-feasibility-and-strip-suggestion` · **Status**: Delivered
**Branch**: `011-feasibility-and-strip-suggestion`, worktree flow
**Branched from**: `main` at `ec3d3aee74` · **Closed**: 2026-09-06

Two defects, taken together because they are two halves of one failure: the app
recommended a strip count and then refused to schedule at it. R5 stopped the
refusal, L5 fixed the recommendation.

Every number here is `[M]` measured. Where a measurement disagreed with a
planning artifact, the measurement won and the disagreement is recorded in
§8.

---

## 1. Result: all six Success Criteria met

| | Criterion | Verdict | Where judged |
|---|---|---|---|
| **SC-001** | The five zero templates place a non-zero count at their suggested strip count | **met** — 10, 13, 19, 12, 11 after US1; 24, 24, 66, 42, 18 after US2 | T008, T012 |
| **SC-002** | No template places fewer events than before, at either strip count | **met** — not one cell of twenty fell at any point | T008, T012 |
| **SC-003** | No B1–B8 count falls below its floor; B4 moves off zero and its floor with it | **met** — all eight exactly on their floors throughout; `SCHEDULED_FLOORS.B4` 0 → 17 in T004's own commit | T004, T010, T011 |
| **SC-004** | No board returned empty on account of an aggregate estimate | **met** — `validateConfig(BINDING)` returns zero ERRORs on all twenty template cells; the one board still empty in the suite is empty on three per-event structural ERRORs | T006 |
| **SC-005** | A live smoke step presses **Suggest** on a template that renders nothing today and measures a non-empty board | **met** — NAC Youth, 197 suggested strips, 24 of 24 placed in the browser. SMOKE PASS twice, 0 console errors | T013 |
| **SC-006** | One strip-suggestion rule exists | **met** — `grep` over `src/ __tests__/ scripts/` returns one function body, `suggestStripCount` (`src/engine/analysis.ts:42`). `recommendStripCount` is a one-line delegate, `suggestStrips` a store action reaching it through `buildConfig` | T012 |

**The headline**: all ten templates now place **100% of their events** at their
suggested strip count. The five that rendered a blank board:

| Template | Before | After |
|---|---:|---:|
| NAC Youth | 0 / 24 | **24 / 24** |
| NAC Cadet/Junior | 0 / 24 | **24 / 24** |
| NAC Vet/Div1/Junior | 0 / 66 | **66 / 66** |
| ROC Mega | 0 / 42 | **42 / 42** |
| Junior Olympics | 0 / 18 | **18 / 18** |

---

## 2. The ten templates: before / after US1 / after US2

`[M]` `baseline.md` §1 (`8335928dc5`), §4 (`d7c58dbd90`), §5 (`b19761b0b3`).
Harness method identical across all three runs — store reset,
`setDays(3)`, `applyTemplate`, strips from `suggestStrips()` or 80/12,
`buildTournamentConfig`, `scheduleAll`.

**These are days=3 numbers. The app boots at days=4 — see §7 finding 3.**

| Template | Events | Suggested (before / US1 / **US2**) | Placed @ suggested (before / US1 / **US2**) | Placed @ 80/12 (before / US1 / **US2**) |
|---|---:|---|---|---|
| NAC Youth | 24 | 39 / 39 / **258** | 0 / 10 / **24** | 22 / 22 / **22** |
| NAC Cadet/Junior | 24 | 39 / 39 / **192** | 0 / 13 / **24** | 24 / 24 / **24** |
| NAC Div1/Junior | 24 | 45 / 45 / **195** | 13 / 13 / **24** | 24 / 24 / **24** |
| NAC Vet/Div1/Junior | 66 | 45 / 45 / **357** | 0 / 19 / **66** | 45 / 45 / **45** |
| ROC Div1A/Vet | 12 | 15 / 15 / **30** | 12 / 12 / **12** | 12 / 12 / **12** |
| ROC Div1A/Div2/Vet | 18 | 15 / 15 / **49** | 16 / 16 / **18** | 18 / 18 / **18** |
| ROC Mega | 42 | 20 / 20 / **210** | 0 / 12 / **42** | 42 / 42 / **42** |
| RYC Weekend | 18 | 20 / 20 / **100** | 12 / 12 / **18** | 18 / 18 / **18** |
| RJCC Weekend | 12 | 19 / 19 / **72** | 6 / 6 / **12** | 12 / 12 / **12** |
| Junior Olympics | 18 | 39 / 39 / **179** | 0 / 11 / **18** | 18 / 18 / **18** |

Three things this table says that are easy to miss:

- **The suggested column did not move at all during US1.** US1 changed a
  severity and nothing else. Every movement in that column belongs to US2.
- **The 80/12 column is byte-identical across all three runs.** That column
  never calls the suggestion, so it is the control.
- **`DEADLINE_BREACH` vanishes from the suggested column after US2** on all ten.
  It was never a validation problem: given enough strips to run the day's pools
  in one flight, no event loses its race against the day's end. This is the
  shortfall spec §Out of Scope declines to fix, and US2 removed it as a side
  effect at these strip counts only — see §7 finding 2 before treating it as
  fixed.

---

## 3. B1–B8, before and after

`[M]` `baseline.md` §2, and the ledger run in each drift-bearing commit.

| Scenario | Fixture (days / strips / video / type) | Events | Before | After | Floor after | On floor? |
|---|---|---:|---:|---:|---:|---|
| B1 | 4 / 80 / 12 / NAC | 24 | 24 | 24 | 24 | yes |
| B2 | 4 / 80 / 12 / NAC | 24 | 24 | 24 | 24 | yes |
| B3 | 4 / 80 / 12 / NAC | 24 | 24 | 24 | 24 | yes |
| **B4** | 3 / 40 / 12 / SYC | 30 | **0** | **17** | **17** (raised) | yes |
| B5 | 3 / 60 / 12 / SJCC | 12 | 12 | 12 | 12 | yes |
| B6 | 3 / 48 / 12 / ROC | 54 | 45 | 45 | 45 | yes |
| B7 | 4 / 80 / 12 / NAC | 18 | 18 | 18 | 18 | yes |
| B8 | 4 / 68 / 12 / NAC | 53 | 52 | 52 | 52 | yes |

**Seven of the eight never moved.** Every scenario sits exactly on its floor,
before and after, with no slack anywhere — a single event lost on any of them
would have halted the task that lost it. None did.

### B4's movement, explained

B4 was pinned at 0 scheduled with exactly 1 ERROR, and that ERROR was the whole
cause: `feasibility-strip-hours`, a 481-strip-hour shortfall over 1680 (~29%),
well past the 15% slack band. The gate aborted before any packing ran, so the
digest had nothing to record. T004 made the finding notice-kind and the gate
stopped aborting. B4 now packs 17 of its 30 events.

`SCHEDULED_FLOORS.B4` was raised 0 → 17 **in T004's own commit** (L9's precedent
from Wave 1, `c5a589ce13`), so a later regression toward zero cannot pass
silently. T006 then removed the `continue` that had kept B4 out of the generic
floor test, so from T006 onward that number is asserted on every ledger run.

B4's snapshot fields that moved at T004, each because the scheduler now runs at
all where the gate previously aborted it:

| Field | Before | After | Why |
|---|---|---|---|
| `scheduledCount` | 0 | 17 | the packer runs |
| `events` | `{}` | 17 entries | nothing was packed before, so nothing was recorded |
| `errorCount` | 1 | 13 | the 1 was the feasibility ERROR. The 13 are per-event `DEADLINE_BREACH_UNRESOLVABLE` / `DEADLINE_CHECK` on the events that genuinely do not fit — the shortfall §Out of Scope declines to fix, now visible because the board is built |
| `warnCountsByCause` | — | `DEADLINE_BREACH` 14; `RESOURCE_EXHAUSTION` 12 → 13 | the thirteenth is the demoted feasibility finding itself, carrying the cause it always carried at its new severity |
| `daySummaryPeaks` | `[0,0,0]` | `[86,182,98]` | post-schedule products that exist only once per-day packing runs |
| `refRequirementsByDay` | undefined | 3 day entries | same |
| `stripRecommendation` | 37 | 37 | unchanged at T004 — it reads no validation severity. It moves at T011 |

B1, B2, B3, B5, B6, B7 and B8 snapshots were **byte-identical** at T004.

---

## 4. One row per task, with the drift it moved

| Task | What it did | Drift |
|---|---|---|
| **T001** `8335928dc5` | Opened the branch with the five spec artifacts | none — no code |
| **T002** `b278b0c328` | Rebuilt the ten-template harness, wrote `baseline.md` §1–§3. Zero disagreements with spec §Context | none — measurement only |
| **T003** *(in T004's commit)* | Red tests for the demotion, both rules, both validation modes. Failed because the severity was ERROR, the predicted reason | none — tests only |
| **T004** `78dc5aaff2` | `feasibilityErr` delegates to `notice()`. Both feasibility rules WARN in every mode; `validateConfig`'s mode re-derivation at `validation.ts:74-77` deleted outright | **B4 0 → 17**, floor raised to 17 in the same commit. Six B4 snapshot fields moved (§3). Seven scenarios byte-identical |
| **T005** `879fcc7bcb` | Widened `hasResourceExhaustion` (`concurrentScheduler.ts:1444`) so a WARN feasibility finding still opens the "Strips: need N, have M" gate | nothing moved |
| **T006** `d7c58dbd90` | Inverted the fixtures that encoded an emptied B4 — **eleven** tests across six files, where spec.md predicted six | nothing moved. B4's 0 → 17 belongs to T004's commit; the `.snap` file is untouched in this diff |
| **T007** `bd41df2ef3` | Re-measured the Scorecard's B1-at-20-strips tallies: ERROR 11 → 10, WARN 17 → 18, INFO 12 unchanged. One finding moved tallies, none appeared or disappeared | nothing moved |
| **T008** `1baacb19ee` | Re-ran the harness, `baseline.md` §4. SC-001 and SC-002 judged and met | none — measurement only |
| **T009** *(in T010's commit)* | Red tests for the busiest-day rule, fixtures constructed so max ≠ sum | none — tests only |
| **T010** `d65dca77f0` | `suggestStripCount` becomes the rule: one strip per pool, LPT-greedy distribution across `days_available`, fullest group's total ÷ `max_pool_strip_pct`. Reads no `strips_total`, no day assignment, no scheduling result (FR-009) | nothing moved, `stripRecommendation` included — `driftLedger.test.ts` still imported the old rule from `stripBudget.ts` at this commit (that import is at `:25` today) |
| **T011** `2d449233c1` | `recommendStripCount` collapsed onto the new rule, keeping its name and call site | scheduled counts unchanged. **`stripRecommendation` moved on all eight**: B1 57→135, B2 57→189, B3 50→182, B4 37→190, B5 23→73, B6 23→165, B7 58→207, B8 48→147. The committed snapshot diff is exactly eight lines, all `stripRecommendation` |
| **T012** `b19761b0b3` | Deleted `src/store/stripSuggestion.ts` and its test file; `suggestStrips` reaches the engine through `buildTournamentConfig`. SC-006 judged and met. `baseline.md` §5 | nothing moved — the `.snap` file is untouched in the diff |
| **T013** `d51eb0afb1` | Added a Suggest step to `scripts/smoke.mjs` on NAC Youth; repaired two Suggest-driven steps that had gone stale from the rule change | nothing moved — driver only |

**Every value rose at T011, which is what `max` → `sum` must do.** Each new
value was checked against an independent bound: it sits at or just above
`ceil(ceil(totalPools / days) / pct)`, the answer a perfectly balanced partition
would give, and far below the all-on-one-day ceiling. B3, B5, B6 and B8 land
exactly on it, B1 and B4 one strip above, B2 six, B7 fifteen (18 events over 4
days is the lumpiest set). That is the LPT partition honouring `days_available`,
not an argument-order slip.

---

## 5. Verification record

### The gate, run twice on the finished branch (`d51eb0afb1`)

| | Run 1 | Run 2 |
|---|---|---|
| `tsc -b` | exit 0 | exit 0 |
| `lint` | exit 0 | exit 0 |
| `pnpm test` | exit 0 — **66 files, 1829 tests passed** | exit 0 — **66 files, 1829 tests passed** |
| Skipped / todo | **0** | **0** |

`grep` for `it.skip`, `test.skip`, `describe.skip`, `.todo` and `.only` across
`__tests__/` and `src/` returns **zero matches**. 66 test files on disk, matching
the 66 vitest collected.

### The test-count delta closes exactly: 1821 + 8 = 1829

T001's starting numbers at `ec3d3aee74` were **67 files, 1821 tests, 0 skipped**.
Per commit, counted from the diff of test-case declarations and cross-checked
against each task's own measured run:

| Commit | Task | Added | Removed | Net | Running total | Measured anchor |
|---|---|---:|---:|---:|---:|---|
| — | T001 start | | | | **1821** | `[M]` T001 |
| `78dc5aaff2` | T003 + T004 | 2 | 3 | −1 | 1820 | |
| `879fcc7bcb` | T005 | 1 | 0 | +1 | **1821** | `[M]` T006's "1821 → 1823" |
| `d7c58dbd90` | T006 | 4 + **1** | 3 | +2 | **1823** | `[M]` T006 |
| `1baacb19ee` | T008 | 0 | 0 | 0 | 1823 | |
| `bd41df2ef3` | T007 | 0 | 0 | 0 | **1823** | `[M]` T007 |
| `d65dca77f0` | T009 + T010 | 9 | 4 | +5 | **1828** | `[M]` T010 |
| `2d449233c1` | T011 | 4 | 3 | +1 | **1829** | `[M]` T011 |
| `b19761b0b3` | T012 | 6 | 6 | 0 | **1829** | `[M]` T012 (67 → 66 files) |
| `d51eb0afb1` | T013 | 0 | 0 | 0 | **1829** | `[M]` T014, twice |
| | **Totals** | **27** | **19** | **+8** | | |

**27 added − 19 deleted = +8. 1821 + 8 = 1829.** It closes exactly.

Two entries need their arithmetic spelled out:

- **T006's `+1` in bold is a test with no `it(` line of its own.** It is
  generated by the loop in `driftLedger.test.ts`'s generic floor test, and it
  appeared because T006 removed the `continue` that had kept B4 out of that
  loop. A static count of test declarations shows T006 as +1; the suite measured
  +2. The loop is the difference, and T004's commit predicted it in those words.
- **T012's file count 67 → 66** is `src/store/__tests__/stripSuggestion.test.ts`
  deleted with its six cases. Six were added in their place — two relocated to
  `__tests__/engine/analysis.test.ts` (the fencer-count-0 guard, the single-pool
  override, the ≤9-fencer case), three added to `__tests__/store/store.test.ts`
  for the `suggestStrips` action, which had no test at all. Three of the deleted
  six were not relocated: two were already covered by engine cases and one
  asserted the max-over-events rule T010 deleted.

No assertion was weakened. Where a test's expectation inverted, T006's commit
message records the decision one test at a time and each inverted test keeps or
strengthens its guard — the B4 ledger pin, for one, went from `toBe(0)` to an
exact pin at 17 **plus** an assertion that `feasibility-strip-hours` is still
present as a WARN, which is a guard the old test did not have and which is the
only thing that would catch a silent re-escalation.

### Live smoke

`scripts/smoke.mjs`, repaired in place per constitution VI, **SMOKE PASS on two
consecutive runs, 0 console errors, deterministic across both.** The new step
applies NAC Youth, clicks **Suggest**, auto-schedules, and asserts a non-zero
schedule table: **197 suggested strips, 24 of 24 placed**, against 0 of 24
before this feature.

Running the driver unchanged *before* editing it found two existing
Suggest-driven steps that had gone stale from the rule change and had never been
checked against a browser. Both were the rule working correctly at the app's
real day count, both were re-measured and repaired, and both are recorded in
T013's commit. That is the reason the driver is run before it is edited.

### Reviews

`test-quality-reviewer` after every test-bearing task; `react-code-reviewer`
after T007, the one task touching a React test. T009's review found a real
coverage gap — a mixed valid/invalid competition list that T009 had dropped,
without which an implementation that sizes every competition unconditionally
**throws** out of `pools.ts:26` and nothing catches it. Closed with a new test,
red at the old rule's answer before the implementation.

---

## 6. Merge instructions

**Worktree flow** (`plan.md` §Constitution Check). The user owns the merge and
the closing commit.

```bash
# 1. From the main checkout, deal with the untracked spec copies first — see below.
cd /Users/noahlz/projects/piste-planner
git status --short          # expect: ?? specs/011-feasibility-and-strip-suggestion/

# 2. Merge, without committing.
git merge --no-ff --no-commit 011-feasibility-and-strip-suggestion

# 3. Gate the MERGED tree, before the merge commit is written.
timeout 180 pnpm exec tsc -b > ./tmp/tsc.log 2>&1
timeout 120 pnpm --silent lint > ./tmp/lint.log 2>&1
timeout 600 pnpm --silent test > ./tmp/test.log 2>&1
#    expect: 66 files, 1829 tests, 0 skipped

# 4. Complete the pending merge with cost trailers.
#    /commit-with-costs
```

No squash. The branch's eleven commits are the working record — the drift
counts, the before-and-after numbers and the deliberate corrections all live in
those messages and nowhere else.

### The untracked files that will block the merge

**Verified, not assumed.** `git status --short` in
`/Users/noahlz/projects/piste-planner` reports
`?? specs/011-feasibility-and-strip-suggestion/`, holding `plan.md`,
`research.md`, `spec.md` and `tasks.md` — authored there on 2026-09-05 before
the branch existed, then committed on the branch at T001. Git refuses a merge
that would overwrite untracked files, so this merge fails with *"untracked
working tree files would be overwritten by merge"* until they are dealt with.

They are **older** than the branch's copies: `spec.md` is marked Delivered on the
branch and Draft in the checkout, `tasks.md` has every box ticked on the branch
and none in the checkout, and `baseline.md` and `handoff.md` do not exist in the
checkout at all. The branch's copies are the ones to keep. Deleting the
untracked directory is the intended action here, but it is a delete of the
user's own files and it is the user's call:

```bash
git status --short specs/011-feasibility-and-strip-suggestion/   # confirm untracked, not modified
rm -rf specs/011-feasibility-and-strip-suggestion/               # or: mv it aside
```

### Predicted conflicts

**Against `main` as it stands today: none.** `main` is still at `ec3d3aee74`,
which is exactly where this branch was cut, so nothing has landed alongside it.
The merge is textually clean once the untracked files are cleared.

If another feature lands in `main` first, these are the collision surfaces, in
descending order of risk. `git diff --stat ec3d3aee74..HEAD` is the source.

| File | Lines changed | Why it collides |
|---|---:|---|
| `__tests__/engine/__snapshots__/driftLedger.test.ts.snap` | **308** | The largest diff in the branch, and the one a textual merge cannot resolve. Any feature that moves the ledger rewrites the same file. A conflict here is **re-measured, never hand-merged** — take one side, re-run the ledger, read the diff |
| `__tests__/engine/concurrentScheduler.test.ts` | 199 | The busiest test file in the repo; T005 added a block at EOF and T006 split a case out of the T013 block |
| `__tests__/engine/analysis.test.ts` | 136 | Nine cases replacing four; a feature touching `analysis.ts` lands in the same describe blocks |
| `__tests__/engine/driftLedger.test.ts` | 105 | `SCHEDULED_FLOORS.B4` and B4's dedicated pin. Two features raising different floors conflict on one constant object |
| `scripts/smoke.mjs` | 98 | One shared driver, no module boundaries. Every UI-touching feature edits it |
| `__tests__/engine/stripBudget.test.ts` | 68 | Four cases rewritten in place |
| `__tests__/engine/validation.test.ts` | 70 | Three tests deleted, two added |
| `__tests__/store/appPathParity.test.ts` | 55 | `PARITY_EXCEPTIONS`, `LEDGER_SCHEDULED_COUNTS` and `PINNED_APP_PATH_COUNTS` — three constants any B-series movement touches |
| `src/engine/concurrentScheduler.ts` | 30 | `hasResourceExhaustion` at `:1444` and the `recommendStripCount` call at `:1450` |
| `src/engine/validation.ts` | 26 | `feasibilityErr` and `validateConfig`'s pipeline array |
| `src/engine/analysis.ts`, `stripBudget.ts`, `src/store/store.ts`, `StripSetup.tsx` | 57 / 32 / 21 / 3 | Small and localized |

### The collision a textual merge will not show you

Per constitution §The merge is gated, the dangerous case is the one with no
conflict markers. Two fixture classes this branch invalidated:

1. **"Feasibility empties the board."** Any test written on another branch that
   uses an aggregate shortfall to produce an empty schedule, or that expects a
   `feasibility-strip-hours` **ERROR**, passes its own gate and merges red. T006
   found eleven such tests on this branch alone across six files, where
   `spec.md` predicted six.
2. **"The suggestion is max-over-events."** Any test asserting a strip
   suggestion number computed by hand from the largest event merges red. The
   rule now reads `days_available`, so such a test also breaks when a fixture's
   day count changes.

**Run the full suite on the merged tree and read the failures against these two
descriptions before assuming a red merge is a mistake in this branch.**

---

## 7. What this feature found and did not fix

Six items, all real, all reproduced in the repo, none of them in scope here.
Each is now in `docs/design/backlog.md` above the `# Closed` divider. **Finding
2 is the most important.**

### 1. B4's app path reads 18 where the ledger reads 17

Two code paths over the same scenario disagree by one event. The divergence is
**not new** — it was masked for as long as both paths read 0, and the demotion
made it visible rather than creating it. Recorded in
`__tests__/store/appPathParity.test.ts` as an FR-004a exception, with its cause
marked `unconfirmed`.

What is measured: `validateConfig` on the *ledger's* B4 config returns twelve
WARN `regional-cut-override` findings, because B4 is an SYC and
`buildConfig.ts:196` applies `REGIONAL_CUT_OVERRIDES` for Y14 and Cadet while
the ledger's factory (`scenarios.ts:50-52`) cuts at 20% — the same seam B6 and
B8 already sit on. What was **not** run is the swap-one-default isolation that
would prove those twelve events account for the one-event gap.

**Cost if ignored**: two pinned numbers that are supposed to describe the same
tournament drift apart with a recorded reason that may be the wrong one. The
exception's `closedBy` names the existing backlog owner *with the caveat that
B4's attribution to it is unconfirmed* — whoever takes that item runs B4's
isolation first, and if `cut_mode` does not account for the +1, the entry needs
its own owner.

### 2. The suggestion is sufficient, not minimal — and at the top end it is not actionable

**This is the most important open item in the feature.** The rule is
arithmetically right per FR-005 and the boards it produces are full. The number
it produces is a *sufficient* strip count, not a *minimum* one: nothing in the
rule searches for the smallest count that fills the board.

| Template | Suggested | × the 80-strip column | Placed @ 80 | Placed @ suggested | Bought by the extra strips |
|---|---:|---:|---:|---:|---|
| NAC Vet/Div1/Junior | **357** | 4.5× | 45 of 66 | 66 of 66 | +21, for +277 strips |
| NAC Youth | **258** | 3.2× | 22 of 24 | 24 of 24 | **+2, for +178 strips** |
| ROC Mega | **210** | 2.6× | 42 of 42 | 42 of 42 | **none** |
| NAC Div1/Junior | **195** | 2.4× | 24 of 24 | 24 of 24 | **none** |
| NAC Cadet/Junior | **192** | 2.4× | 24 of 24 | 24 of 24 | **none** |
| Junior Olympics | **179** | 2.2× | 18 of 18 | 18 of 18 | **none** |
| RYC Weekend | **100** | 1.3× | 18 of 18 | 18 of 18 | none |
| RJCC Weekend | **72** | 0.9× | 12 of 12 | 12 of 12 | none |
| ROC Div1A/Div2/Vet | **49** | 0.6× | 18 of 18 | 18 of 18 | none |
| ROC Div1A/Vet | **30** | 0.4× | 12 of 12 | 12 of 12 | none |

**On eight of the ten templates, 80 strips place exactly what the suggested
count places.** No venue has 357 strips. The small regionals (30, 49, 72, 100)
read as plausible venue plans; the large NACs (179–357) read as a theoretical
ceiling.

**What would make it actionable** — three options, in the order they are worth
trying:

1. **A minimal-sufficient search.** Report the smallest strip count that places
   every event, found by bisecting between a lower bound and the busiest-day
   number and running the scheduler at each step. It is the answer an organizer
   actually wants and it is the most expensive: it makes the suggestion depend
   on a scheduling result, which FR-009 forbids of *this* rule — so it is a
   second, separately named number, not a change to this one.
2. **Report both numbers.** Keep the busiest-day figure, labelled "to run every
   pool concurrently", beside a smaller "to place every event". Cheapest honest
   option and it needs no new search if the second number comes from a coarse
   sweep rather than an exact bisection.
3. **A confidence band.** Present the suggestion as a range with the busiest-day
   number as its upper bound. Weakest of the three — it tells the organizer the
   answer is uncertain without telling them what to do.

**Cost if ignored**: the app gives large-NAC organizers a number they will
disregard, and the feature's user-facing win is confined to the regionals.

### 3. `baseline.md`'s numbers are days=3; the app runs at days=4

`baseline.md`'s harness forces `setDays(3)`, matching 010's method so the two
tables compare. The app boots at **4 days** and `applyTemplate` never touches
`days_available`. The old suggestion rule was a function of the largest event
alone and never read day count, so the two agreed by accident. **The new rule
reads `days_available` by design (FR-005), so they no longer agree.**

The three points measured at days=4, in the running app (T013):

| Template | days=3 (`baseline.md` §5) | **days=4 (what a user sees)** |
|---|---:|---:|
| NAC Youth | 258 | **197** |
| NAC Cadet/Junior | 192 | **144** |
| ROC Div1A/Vet | 30 | **23** |

Both are the rule working correctly at different day counts. The placed counts
hold at days=4 — NAC Youth still places 24 of 24, ROC Div1A/Vet still 12 of 12.

**Cost if ignored**: `baseline.md` §5's suggested column is the most quotable
table in this feature and it is **not** the number the product shows. Anyone
sizing a follow-up against 258 is sizing it against a harness constant. Say
which numbers are which, every time.

### 4. `concurrentScheduler.test.ts:852`'s fixture carried a false comment

The case's comment claimed "every event here is individually valid (no per-event
finding fires)". `[M]` `validateConfig` on that fixture returns **three ERROR
`resource-precondition-strips`**, one per event — "requires 29 strips for pools
but only 2 total strips configured". The claim was false **before 011 touched
anything**. The test passed because it asserted a feasibility ERROR and then an
empty board, and the three per-event ERRORs delivered the empty board
independently of feasibility.

T006 kept the fixture, moved it out of the "a global finding empties the whole
schedule" block, and split it into the two halves it could never separate while
asserting one thing.

**Cost if ignored**: a test comment that describes a fixture wrongly is worse
than no comment — it is the thing the next reader reasons from. This one hid a
test that proved something other than what it claimed for as long as it existed.
There may be more of them; nothing in this feature audited for that.

### 5. `stripBudget.ts` now imports `analysis.ts`, closing an import cycle

`analysis.ts` already imported `computeStripCap` from `stripBudget.ts`. T011's
delegation makes the dependency mutual. **It is safe today**: both sides are
hoisted function declarations used only when called, never at module-evaluation
time, so neither module observes the other half-initialized. It is recorded in a
comment at the import.

The alternative was a second copy of the rule, which is the exact defect FR-008
exists to remove — so the cycle was the right call.

**Cost if ignored**: it is fragile in a specific, silent way. The day either
module gains a top-level `const` that calls into the other, one of them
evaluates against `undefined`, and the failure appears at import time in an
unrelated test. Splitting the shared arithmetic into a third leaf module is the
fix, whenever either file next needs real work.

### 6. The recommendation gate matches on message text

T005's widened `hasResourceExhaustion` (`concurrentScheduler.ts:1457`) tells the
demoted feasibility finding apart by
`message.startsWith('RESOURCE_INSUFFICIENT')`, because `Bottleneck` carries no
rule id — `ValidationError` has one and it is dropped when the finding is pushed
at `:212`.

**This is safe, and here is precisely why**: FR-001 and FR-002 pin that message
text as unchanged, and `grep` confirms no other validation message starts with
that prefix. A WARN from any other notice-kind rule pushed with the same cause
(`days-available-range`, for one) still leaves the gate closed.

**Cost if ignored**: it breaks silently if the message is ever reworded. The
post-schedule strip recommendation simply stops appearing, on exactly the boards
it exists for, with no test failure unless one specifically asserts the INFO's
presence. T005's test does assert it — so the guard exists, but it guards the
behavior, not the coupling. The structural fix is giving `Bottleneck` a rule id
or a `subjects` field, which is already an open backlog item from 010.

---

## 8. Two corrections to the planning artifacts

Both belong in the record because both are the kind of mistake that repeats.

### `research.md` D6 was half wrong

D6 claimed **US2 cannot move the ledger**, reasoning that
`driftLedger.test.ts` contains no reference to any suggestion function and that
B1–B8 supply their strip counts as fixture literals.

**True for scheduled counts, and that is why no count moved** — nothing consumes
the recommendation. **False for the snapshot**: `driftLedger.test.ts:210` records
`recommendStripCount`'s answer as `stripRecommendation`, so T011 moved it on all
eight scenarios.

D6 was written to contradict 010's `handoff.md` §8, which predicted L5 "changes
strip counts on every scenario … so it needs its own drift review against
B1–B8". **010 was right about the snapshot and wrong about its consequences.**
The lesson is narrow and worth keeping: "the ledger has no reference to X" is a
claim about the *fixtures*, and the digest is a separate surface that has to be
read separately.

### `spec.md` §Tests that invert enumerated six tests; eleven inverted

The five extra were found by **measurement** at T004, not by reading: T004's
demotion reached `__tests__/helpers/appPath.test.ts` (×2),
`__tests__/store/appPathParity.test.ts`, `__tests__/engine/integration.test.ts`
and `__tests__/store/scorecardMetrics.test.ts`, all the same "feasibility empties
the board" fixture class, none of them named in the spec.

They were folded into T006 by orchestrator direction — they were single-constant
updates plus one rewrite of exactly the kind T006 was already doing. **This
widened T006's scope, and that is recorded here as a fact of the record, not as
a re-plan.**

**The lesson**: the §Tests that invert table is a merge-gate artifact
(constitution §The merge is gated), and it should be **built by measurement, not
by reading**. Making the change on a scratch branch and running the suite
enumerates the list exactly; reading the codebase for it found 6 of 11.

---

## 9. Scope notes

- **T006's scope was widened** by orchestrator direction to cover the five
  additional inverting tests, as recorded in §8.
- **T014 and T015 were run by one subagent**, rather than one each.
- **B4's app-path divergence was recorded, not reconciled**, by product-owner
  direction (§7 finding 1).

All three are recorded facts, not re-planning.

---

## 10. Resume prompt

The most valuable next work is **finding 2** — making the suggested strip count
actionable at the top end. The feature's central promise is that the number the
app suggests is a number that works, and it now is, arithmetically. But on eight
of ten templates 80 strips do the same job, and no venue has 357. Everything
else on the open list is either a one-event accounting question, a fragile
seam that is currently safe, or a documentation hazard. This is the one an
organizer would notice.

It should start by re-measuring at **days=4** (finding 3), because the days=3
table everyone will quote is not what the product shows.

```
Read specs/011-feasibility-and-strip-suggestion/handoff.md §7 finding 2 and
finding 3, and docs/design/backlog.md §"The suggested strip count is sufficient,
not minimal".

Feature 011 made the strip suggestion size for the busiest day's summed pool
demand, and every one of the ten templates now places 100% of its events at its
suggested count. The number is arithmetically right and, on the large NACs, not
actionable: it suggests 179-357 strips where 80 already place exactly the same
events on eight of the ten templates.

Plan a follow-up feature that gives an organizer a number they can act on.
Read handoff.md §7 finding 2 for the three options and why they are ordered as
they are — a minimal-sufficient bisection, reporting both figures, or a
confidence band. FR-009 forbids THIS rule depending on a scheduling result, so a
search-based answer is a second, separately named number, not a change to the
existing one.

Before anything else, re-measure the ten templates at days=4, the count the app
actually boots at. baseline.md's tables force setDays(3) to stay comparable with
010, and the new rule reads days_available, so its suggested column is a harness
number and not what a user sees. Three days=4 points are already measured in
handoff.md §7 finding 3.

Start with /speckit-specify. Do not begin implementation in the planning
session.
```

### If you would rather close the smaller items first

- **Finding 1** (B4 18 vs 17) is one isolation run: swap `cut_mode` on the
  twelve divergent events in the ledger's B4 config and see whether the
  one-event gap closes. It resolves an `unconfirmed` cause into a confirmed one
  or reopens it with its own owner.
- **Finding 5** (the import cycle) is worth doing opportunistically, the next
  time either `analysis.ts` or `stripBudget.ts` needs real work — not as a
  feature of its own.
- **Wave 3's remaining items still wait on the Part 3 decision** (the eight
  time-of-day penalty weights), which is the product owner's and is unaffected
  by this feature. R5 was taken out of Wave 3's order by product-owner direction
  on 2026-09-05; nothing else moved with it.
