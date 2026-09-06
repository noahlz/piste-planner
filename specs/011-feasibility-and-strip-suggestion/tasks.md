# Tasks: The strip count the app suggests is the strip count that works

**Feature**: `011-feasibility-and-strip-suggestion`
**Input**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md)
**Source**: [`docs/design/methodology-reconciliation.md`](../../docs/design/methodology-reconciliation.md) §1.3 R5, §2.1 L5; [`specs/010-wave-1-reconciliation/baseline.md`](../010-wave-1-reconciliation/baseline.md) §3

## Format: `[ID] [P?] [Story] Description`

- **[P]** — runnable in parallel with other `[P]` tasks in the same phase.
- **[US1] / [US2]** — the user story the task serves.
- **(subagent commits)** — a checkpoint. The subagent commits to
  `011-feasibility-and-strip-suggestion` before returning. Unmarked tasks do not
  commit.
- **(Opus)** — dispatch on Opus: a wrong call here stays green.
- **(drift)** — runs the drift ledger before and after, per standing rule 3.

## Standing rules for every phase

1. **The worktree is the workspace.** All work happens in
   `/Users/noahlz/projects/piste-planner-011-feasibility-and-strip-suggestion`
   on branch `011-feasibility-and-strip-suggestion`. No push, no merge, no
   rebase, no amend, no branch deletion, no commit to `main`.
2. **Test-first.** Every implementation task has a test task before it that has
   been run and seen to fail for the stated reason. "Failed for the stated
   reason" means the failure message names what the task predicted, not merely
   that something was red.
3. **The drift gate.** Every task marked *(drift)* runs
   `__tests__/engine/driftLedger.test.ts` immediately before its edit and again
   after. Its commit message carries the eight scheduled counts before and
   after, the snapshot fields that moved by name and scenario, one sentence per
   moved field naming the line that produced it, and an explicit "nothing moved"
   when nothing did. **A scheduled count below its floor halts the task.** Never
   edit a floor down. Never run `vitest -u` to make a snapshot diff disappear
   before it has been read.
4. **One story per commit range.** US1 and US2 do not interleave. A combined
   diff cannot be attributed to either.
5. **One strip per pool, always.** No task may reduce a strip count by
   lengthening a phase. Double-stripping is not a scheduling input
   (spec §Out of Scope).
6. **Reviews.** Dispatch `test-quality-reviewer` after any task that adds or
   edits tests. Dispatch `react-code-reviewer` after T007, the only task
   touching a React test.
7. **Commands** (from the worktree root):
   `timeout 120 pnpm --silent test > ./tmp/test.log 2>&1`,
   `timeout 120 pnpm --silent vitest run <path> > ./tmp/test.log 2>&1`,
   `timeout 180 pnpm exec tsc -b > ./tmp/tsc.log 2>&1`,
   `timeout 120 pnpm --silent lint > ./tmp/lint.log 2>&1`. Read logs only on
   failure.
8. **Measurements win.** Where a measurement disagrees with a number in this
   plan, in `spec.md`, or in 010's `baseline.md`, the measurement is right and
   the disagreement is recorded in the commit message. Do not adjust a fixture
   to reach a predicted number.

---

## Phase 1: Setup and baseline

- [X] **T001** Confirm the workspace: branch
  `011-feasibility-and-strip-suggestion` exists at
  `/Users/noahlz/projects/piste-planner-011-feasibility-and-strip-suggestion`,
  branched from `main` at `ec3d3aee74`; dependencies installed; every artifact
  under `specs/011-feasibility-and-strip-suggestion/` present. Record
  `pnpm test` file and test counts, and `tsc -b` status, as the branch's
  starting numbers. Commit the spec artifacts as the branch's first commit
  *(subagent commits)*

- [X] **T002** **(Opus)** Rebuild the ten-template measurement harness and write
  `baseline.md`. Method is fixed by [plan.md §The measurement instrument](./plan.md)
  and must match 010's `baseline.md` §3 exactly so the two tables compare. The
  probe is a temporary file under `tmp/`, run with `pnpm vitest run`, deleted
  after the numbers are recorded — it is not a repo artifact. Record per
  template: suggested strip count, placed at suggested, ERROR rule ids at
  suggested, placed at 80/12, ERROR rule ids at 80/12. Also record the eight
  B1–B8 scheduled counts and B4's exact bottleneck shape. **Expected: the five
  templates named in spec §Context measure zero at their suggested count on
  `feasibility-strip-hours`.** A disagreement with that expectation is recorded,
  not corrected *(subagent commits)*

---

## Phase 2: US1 — an oversubscribed tournament returns a partial board (P1)

**Story goal**: no board is returned empty on account of an aggregate estimate.

**Independent test**: the five zero templates place a non-zero count at their
suggested strip count; B1–B8 hold their floors.

- [X] **T003** [US1] Write the red tests for the demotion, in
  `__tests__/engine/validation.test.ts`: a configuration that trips the
  strip-hour band produces `feasibility-strip-hours` at severity WARN under
  **both** validation modes with its message text unchanged, and a configuration
  that trips the video band does the same for `feasibility-video-strip-hours`.
  Run them; confirm they fail because the severity is ERROR, not because the
  finding is absent

- [X] **T004** [US1] **(drift)** Make feasibility findings notice-kind — WARN in
  every mode — and remove the mode re-derivation at `validation.ts:74-77` that
  exists only to serve them. Rule ids, fields and message text unchanged
  ([research.md D1, D2](./research.md)). T003 goes green. **B4 moves off zero
  here**: record its new scheduled count and raise `SCHEDULED_FLOORS.B4` to
  match **in this same commit**, and explain every snapshot field that moved
  *(subagent commits)*

- [X] **T005** [US1] Write the red test for the recommendation gate: a
  configuration whose only finding is a feasibility WARN still emits the
  post-schedule `RESOURCE_RECOMMENDATION` INFO. Then widen the
  `hasResourceExhaustion` condition at `concurrentScheduler.ts:1444` to accept a
  WARN feasibility finding ([research.md D3](./research.md)) *(subagent commits)*

- [X] **T006** [US1] **(Opus)** **(drift)** Invert the two engine tests that use
  "feasibility empties the board" as a fixture, and explain each inversion in
  the commit message rather than merely rewriting the expectation:
  - `__tests__/engine/driftLedger.test.ts:213` — B4's dedicated pin. It asserts
    0 scheduled and exactly 1 ERROR. Rewrite it to pin B4's new measured count
    and the absence of a feasibility ERROR, keeping the test's purpose: it must
    still trip if B4 silently collapses again.
  - `__tests__/engine/concurrentScheduler.test.ts:852` — "an aggregate shortfall
    … still empties the schedule". Rewrite it to assert a non-empty board
    carrying the WARN. *(subagent commits)*

- [X] **T007** [US1] Update `__tests__/components/workbench/Scorecard.test.tsx`.
  `B1_STRIPS20_FINDINGS` (line 65) expects 11 ERROR / 17 WARN, one of the errors
  being the feasibility finding that pre-allocated strips push past the gate.
  Re-measure rather than assume the arithmetic, and correct the explanatory
  comment above the constant so it says why the count changed. Dispatch
  `react-code-reviewer` after *(subagent commits)*

- [X] **T008** [US1] Re-run the T002 harness and append the after-US1 table to
  `baseline.md`, before and after side by side. **SC-001 is judged here**: all
  five named templates must place a non-zero count at their suggested strip
  count. **SC-002 is judged here**: no template may place fewer than it did in
  T002. Record any template that stays at zero with the rule id that holds it
  there *(subagent commits)*

**Checkpoint**: US1 is independently shippable. `tsc -b`, `lint` and the full
suite are green before Phase 3 begins.

---

## Phase 3: US2 — the Suggest button produces a count that works (P2)

**Story goal**: one rule, sized for the busiest day's summed pool demand.

**Independent test**: the ten-template harness, comparing the suggested number
and the placed count at it.

- [X] **T009** [US2] Write the red tests for the new rule in
  `__tests__/engine/analysis.test.ts`. The fixtures must **separate max from
  sum** by construction — a set where the largest event's pool count and the
  busiest day's summed pool count differ, so a max-rule implementation cannot
  pass. Cover: the multi-event multi-day case; one day (every event shares it);
  more days than events (the busiest group is the single largest event); the
  `max_pool_strip_pct` divisor; determinism across repeated calls; and the
  no-sizeable-competition case returning the absence of an answer rather than
  zero (FR-010). Run them; confirm each fails on the number the max rule
  produces

- [X] **T010** [US2] **(Opus)** **(drift)** Implement the rule in
  `src/engine/analysis.ts` as a pure function of competitions, `days_available`
  and `max_pool_strip_pct`, replacing the dead `suggestStripCount`. The rule is
  stated in [research.md D4](./research.md): one strip per pool, distribute
  events across the day count by descending pool demand into the emptiest group,
  take the fullest group's total, divide by the pool strip percentage. **It must
  not read `strips_total`, day assignment, or any scheduling result** (FR-009).
  Ledger expected to show nothing moved; a movement halts the task
  *(subagent commits)*

- [X] **T011** [US2] Collapse `stripBudget.ts`'s `recommendStripCount` onto the
  new rule, keeping its exported name and its call site at
  `concurrentScheduler.ts:1450` and its INFO message text. Rewrite the four
  cases at `__tests__/engine/stripBudget.test.ts:44-67`, which assert the
  max-over-events rule, against the busiest-day rule — re-measure each expected
  number rather than deriving it by hand *(subagent commits)*

- [X] **T012** [US2] Delete `src/store/stripSuggestion.ts` and its test file
  `src/store/__tests__/stripSuggestion.test.ts`, relocating any case the engine
  test does not already cover. Rewire the `suggestStrips` action
  (`src/store/store.ts:229`) to reach the engine rule through
  `buildTournamentConfig`. **SC-006 is judged here**: `grep` for `suggestStrips`
  and `recommendStripCount` must show one rule behind both names. Then re-run
  the T002 harness and append the after-US2 table to `baseline.md`, recording
  the suggested number per template before and after *(subagent commits)*

**Checkpoint**: `tsc -b`, `lint` and the full suite green before Phase 4.

---

## Phase 4: Verified live

- [ ] **T013** **(dispatched — locator repair iterates, plan.md §Constitution
  Check VI)** Repair `scripts/smoke.mjs` **in place**. Add a step that selects a
  template rendering nothing today (`NAC Youth` or `ROC Mega`), presses
  **Suggest**, schedules, and measures the placed count, asserting it is
  non-zero and reporting the number. Existing boot, `ROC Div1A/Vet` and
  `NAC Div1/Junior` steps must still pass. The driver is a repo artifact and its
  selectors are the accumulated record of corrections against the real DOM —
  update it, never rewrite it. Report SMOKE PASS/FAIL, the measured count, and
  the console error count *(subagent commits)*

---

## Phase 5: Close-out

- [ ] **T014** Run the full gate on the finished branch twice: `tsc -b`, `lint`,
  `pnpm test`. Account for the test-count delta against T001's starting numbers
  — tests added minus tests deleted must close exactly, with none skipped and no
  assertion weakened

- [ ] **T015** Write `handoff.md`: the ten-template table before / after US1 /
  after US2, the eight B1–B8 counts before and after with B4's movement
  explained, one row per task with the drift it moved, the verification record,
  the merge instructions with predicted conflicts, and a paste-ready resume
  prompt. Update `docs/design/backlog.md` — close R5 and L5, record what this
  feature deliberately did not fix (the `DEADLINE_BREACH` shortfall, the
  feasibility estimate's magnitude, video strip suggestion), and note that
  Wave 3's remaining items still wait on Part 3 *(subagent commits)*

---

## Dependencies

```
T001 → T002 → [Phase 2: T003 → T004 → T005 → T006 → T007 → T008]
                    ↓
            [Phase 3: T009 → T010 → T011 → T012]
                    ↓
                  T013 → T014 → T015
```

T005 and T006 may run in either order after T004. Everything else is strictly
sequential: each drift-bearing task must be the only change in its diff.

## What halts a task

- A B1–B8 scheduled count below its floor.
- The ledger moving during US2, which by [research.md D6](./research.md) it
  cannot do unless something unexpected reads the suggestion.
- A template placing fewer events after a task than before it.
- A suggestion implementation that reads `strips_total` in any form.
- A red test that fails for a reason other than the one its task predicted.
