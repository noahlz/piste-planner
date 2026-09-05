# Tasks: Wave 1 — the seven independent reconciliation fixes

**Feature**: `010-wave-1-reconciliation`
**Input**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md)
**Source**: [`docs/design/methodology-reconciliation.md`](../../docs/design/methodology-reconciliation.md) §Recommended sequence, Wave 1

## Format: `[ID] [P?] [Story] Description`

- **[P]** — runnable in parallel with other `[P]` tasks in the same phase.
- **[Story]** — the user story the task serves.
- **(subagent commits)** — a checkpoint. The subagent commits to
  `010-wave-1-reconciliation` before returning. Unmarked tasks do not commit.
- **(Opus)** — dispatch on Opus: a wrong call here stays green.

## Standing rules for every phase

1. **The worktree is the workspace.** All work happens in
   `/Users/noahlz/projects/piste-planner-010-wave-1-reconciliation` on branch
   `010-wave-1-reconciliation`. No push, no merge, no rebase, no amend, no
   branch deletion, no commit to `main`.
2. **Test-first.** Every implementation task has a test task before it that has
   been run and seen to fail for the stated reason. "Failed for the stated
   reason" means the failure message names what the task predicted, not merely
   that something was red.
3. **The drift gate.** Every task marked *(drift)* runs
   `__tests__/engine/driftLedger.test.ts` immediately before its edit and again
   after, and its commit message carries all four of
   [research.md D8](./research.md): the eight scheduled counts before and after,
   the snapshot fields that moved by name and scenario, one sentence per moved
   field naming the line that produced it, and an explicit "nothing moved" when
   nothing did. **A scheduled count below its floor in `SCHEDULED_FLOORS` halts
   the task.** Never edit a floor down. Never run `vitest -u` to make a snapshot
   diff disappear before it has been read.
4. **One item per commit.** The seven items are independent; a combined diff is
   unattributable.
5. **Reviews.** Dispatch `test-quality-reviewer` after any task that adds or
   edits tests. No React is touched in this feature, so
   `react-code-reviewer` does not apply.
6. **Commands** (from the worktree root):
   `timeout 120 pnpm --silent test > ./tmp/test.log 2>&1`,
   `timeout 120 pnpm --silent vitest run <path> > ./tmp/test.log 2>&1`,
   `timeout 180 pnpm exec tsc -b > ./tmp/tsc.log 2>&1`,
   `timeout 120 pnpm --silent lint > ./tmp/lint.log 2>&1`. Read logs only on
   failure.
7. **Measurements win.** Where a measurement disagrees with a number in the
   reconciliation document or in this plan, the measurement is right and the
   disagreement is recorded in the commit message. Do not adjust a fixture to
   reach a predicted number.

---

## Phase 1: Setup and baseline

- [ ] T001 Confirm the workspace: branch `010-wave-1-reconciliation` exists at
  `/Users/noahlz/projects/piste-planner-010-wave-1-reconciliation`, branched from
  `main` at `a2dc363e45`; dependencies installed; every artifact under
  `specs/010-wave-1-reconciliation/` present; and
  `docs/design/methodology-reconciliation.md` carried onto the branch. Commit the
  spec artifacts and the carried reconciliation documents as the branch's first
  commit *(subagent commits)*

- [ ] T002 Write `specs/010-wave-1-reconciliation/baseline.md`, captured before
  any `src/` file is edited **(Opus — every later acceptance is measured against
  these numbers)**:
  1. Per B1–B8: `scheduledCount`, `errorCount`, and the `warnCountsByCause` keys
     and counts, read from `buildDigest` in `__tests__/engine/driftLedger.test.ts`.
  2. Per B1–B8: whether any event took the DSatur least-bad-color fallback, and
     for each that did, the hard-edge pairs its chosen day breaks. This is what
     decides whether R7 is expected to move the ledger. Measure it with a
     temporary probe under `tmp/`, never by adding a permanent test.
  3. Per template in `TEMPLATES` (`src/engine/catalogue.ts`), driven through the
     app's own path — `applyTemplate`'s `TEMPLATE_FENCER_DEFAULTS` then
     `buildConfig` — at the store's default day count: placed count and the rule
     id of every ERROR, at **both** the app-suggested strip count and at 80
     strips / 12 video. Two columns, because §2.1 L5 says the suggestion
     under-recommends and a template empty at the suggestion but full at 80 has a
     different defect than Wave 1's.
  4. `crossoverPenalty` today for Y8↔Y10, Y8↔Y12, DIV1↔CADET, DIV1↔DIV2,
     DIV1↔DIV3, same gender and weapon.
  5. Suite totals (expect 67 files / 1799 tests) and `git rev-parse main`.
  Record every number as measured, including any that contradicts the
  reconciliation document *(subagent commits)*

**Checkpoint**: `baseline.md` exists and the suite is green. No `src/` file has
been touched.

---

## Phase 2: User Story 1 — the individual/team pair stops emptying the board (P1) 🎯 MVP

**Item**: R1. **Goal**: SC-001. **Independent test**: the ten templates place
what they place, and the two named ones stop placing zero.

### Tests first (red)

- [ ] T003 [US1] Add to `__tests__/engine/validation.test.ts` a test asserting
  that `validateConfig` produces no finding with rule id `indiv-team-same-day`
  for a configuration containing a same-category individual/team pair whose
  combined worst-case duration exceeds `DAY_LENGTH_MINS`. Delete or re-target
  the existing tests that assert the rule *fires* — they assert behavior this
  story removes, and per constitution II they change in the task that changes the
  behavior, not afterwards. Run it and record the failure: it must fail by
  finding the rule, not by any other error

- [ ] T004 [P] [US1] Add to `__tests__/engine/integration.test.ts` (or the
  nearest existing app-path scenario file) a test that builds `NAC Div1/Junior`
  through the app's own configuration path at the store's default day count and
  the strip count `baseline.md` §3 recorded as sufficient, and asserts the
  returned schedule is non-empty. Run it and record the failure: the schedule
  must be empty and the errors must be the two `indiv-team-same-day` findings
  `baseline.md` recorded. **If the errors are anything else, stop and report** —
  the audit's attribution would be wrong and this task's premise with it

### Implementation

- [ ] T005 [US1] *(drift)* Delete the `indiv-team-same-day` rule from
  `src/engine/validation.ts`: the emission site, the enclosing
  `validateTimingConstraints` if the rule was its only content, that function's
  call site in `validateConfig`, and any import — `findIndividualCounterpart`
  among them — that no longer has a use in the file. Leave
  `validateSameDayCompletion` untouched (FR-002). T003 and T004 must go green.
  Run `tsc -b` and `lint`. Expected drift: none — record "nothing moved" or
  explain what did *(subagent commits)*

- [ ] T006 [US1] Re-measure all ten templates exactly as `baseline.md` §3 did and
  append an "after R1" column to it. Confirm SC-001: `NAC Div1/Junior` and
  `NAC Vet/Div1/Junior` place a non-zero count. If either still places zero,
  record the rule ids now blocking it and **do not fix them here** — they belong
  to whichever wave owns them *(subagent commits)*

**Checkpoint**: US1 is independently shippable. Two templates render.

---

## Phase 3: User Story 2 — an unsatisfiable coloring is reported (P2)

**Item**: R7. **Goal**: SC-003. **Independent test**: a configuration whose hard
graph exceeds the days available reports one WARN per broken pair.

### Tests first (red)

- [ ] T007 [US2] Add to `__tests__/engine/dayColoring.test.ts`: given a
  competition set whose hard-constraint graph needs more days than
  `days_available`, `assignDaysByColoring` returns one violation per pair of
  hard-edged competitions that share a day, each naming both ids. `NAC
  Cadet/Junior` at 3 days is the witness the audit measures at six pairs; use
  the count `baseline.md` §2 measured, not the audit's, if they differ. Also
  assert the complement: a satisfiable configuration returns none. Run both and
  record the failures

- [ ] T008 [P] [US2] Add to `__tests__/engine/dayColoring.test.ts` the FR-004
  invariant: for the same witness configuration, the day map returned by
  `assignDaysByColoring` is identical before and after this story. Pin it as an
  explicit expected map captured from the current code, so the test fails if the
  coloring moves at all. This one is **red-then-green in the opposite sense** —
  it passes now and must still pass after T009; run it now and record that it
  passes, which is what makes it a guard rather than a formality

### Implementation

- [ ] T009 [US2] *(drift)* **(Opus — a missed violation stays green forever)** In
  `src/engine/dayColoring.ts`, after `chosenColor` is settled in each of the two
  least-bad-color branches of `dsaturLoop`, collect the already-colored
  neighbours on `chosenColor` whose edge weight is `Infinity` and accumulate
  them. Return them from `dsaturLoop` and propagate through
  `assignDaysByColoring` alongside `dayMap` and `relaxations`. Change no color
  choice, no penalty, and no ordering. Do not write
  `constraint_relaxation_level` ([research.md D1](./research.md)). T007 goes
  green and T008 stays green *(subagent commits)*

- [ ] T010 [US2] *(drift)* In `src/engine/concurrentScheduler.ts`, emit one WARN
  bottleneck per violation returned by `assignDaysByColoring`, with cause
  `BottleneckCause.UNAVOIDABLE_CROSSOVER_CONFLICT`, a message naming both
  competition ids and the separation they break, and `phase` set to whatever the
  existing relaxation bottleneck beside it uses. Mirror the same emission in
  `src/engine/scheduler.ts` if that path also consumes `assignDaysByColoring`.
  Expected drift: `warnCountsByCause` gains a key on exactly the scenarios
  `baseline.md` §2 named, and **nothing else moves** — if a scheduled count or a
  start time moves, T009 changed the coloring and both tasks halt *(subagent commits)*

- [ ] T011 [US2] If `baseline.md` §2 found any B1–B8 scenario placing a
  hard-blocked pair, add a section to `docs/design/backlog.md` recording the
  scenario, the witness pairs, and that the *repair* belongs to Wave 3's re-color
  loop. Then check `__tests__/engine/integration.test.ts`'s separation assertions
  (lines 61–100): if they pass only because the violation was invisible, correct
  them to assert what is measured and say so in the commit. **Never relax an
  assertion to keep it green.** If §2 found no scenario, record that instead and
  make no edit *(subagent commits)*

**Checkpoint**: the engine no longer claims a schedule is clean when it broke a
hard separation to produce it.

---

## Phase 4: User Story 3 — one bad event costs one event (P2)

**Items**: R2 then R3. **Goal**: SC-004.

### Tests first (red)

- [ ] T012 [US3] Add to `__tests__/engine/validation.test.ts` or the scheduler's
  test file: a tournament of several valid events plus one carrying, in turn,
  each of the five per-event defects (`fencer-count-bounds`, `cut-value-range`,
  `cut-value-min-promotions`, `de-duration-table-missing-entry`,
  `video-r16-strip-shortfall`) schedules the valid events, names the invalid one
  in an ERROR, and gives the invalid one no schedule entry. Run and record the
  failures: every case must currently return an empty schedule

- [ ] T013 [P] [US3] Add the FR-008 complement: a tournament whose only ERROR is
  global — zero strips, duplicate competition ids, or an aggregate feasibility
  shortfall — still returns an empty schedule. Run it and record that it passes
  now; it is the guard that R2 did not over-reach

- [ ] T014 [P] [US3] Add to `__tests__/store/buildConfig` coverage (the file the
  regional-cut coercion is tested in) that a TEAM competition whose stored
  `cut_mode` is `PERCENTAGE` reaches the engine with `DISABLED`, and to
  `__tests__/engine/validation.test.ts` that `cut-on-team` is a notice — WARN in
  binding mode, never an error. Run both and record the failures

### Implementation

- [ ] T015 [US3] *(drift)* **(Opus — an over-broad exclusion silently discards
  real events)** In `src/engine/concurrentScheduler.ts`, replace the
  all-or-nothing gate: define the explicit per-event rule-id set from
  [research.md D2](./research.md) beside the gate, partition the ERROR findings
  against it, and when the ERROR set is non-empty and wholly inside the set,
  remove the competitions named in those findings' `subjects` and continue with
  the remainder. Otherwise return empty as today. One pass, no re-validation
  ([research.md D3](./research.md)). Emit one summary bottleneck naming the
  excluded count (FR-009). T012 goes green, T013 stays green. Expected drift:
  the audit predicts B4 moves; this plan predicts it does not, because B4's
  error is a *policy* feasibility finding. Record which happened and why
  *(subagent commits)*

- [ ] T016 [US3] *(drift)* R3, both halves: in `src/store/buildConfig.ts` coerce
  a TEAM competition's `cut_mode` to `DISABLED` in the same loop shape the
  `REGIONAL_CUT_OVERRIDES` block uses, and in `src/engine/validation.ts` change
  the `cut-on-team` finding from `policy(...)` to `notice(...)`. T014 goes green.
  Expected drift: none — the ledger's factory does not route through
  `buildConfig` and `computeDeFencerCount` ignores the field for TEAM
  (`src/engine/pools.ts:141`). A movement means that reasoning is wrong; halt and
  explain *(subagent commits)*

**Checkpoint**: a partial board is reachable, and a cosmetic field no longer
discards a tournament.

---

## Phase 5: User Story 4 — three penalties match the specification (P3)

**Items**: L1, then L9, then L3 — in that order, one commit each. This is the
phase the drift review exists for.

- [ ] T017 [US4] Add the three red tests, one per item, in the file that owns
  each function. **L1** in `__tests__/engine/dayColoring.test.ts`: for a pair the
  proximity graph relates, same gender and weapon, the color penalty at a gap of
  3 includes `PROXIMITY_3_PLUS_DAYS × weight`, at a gap of 2 includes neither
  term, and at a gap of 1 is unchanged. **L9** in
  `__tests__/engine/crossover.test.ts` and `constants.test.ts`:
  `crossoverPenalty(Y8, Y10)` is 0.0, `crossoverPenalty(Y8, Y12)` is 0.0, and
  `CROSSOVER_GRAPH[Y8]` is empty. **L3** in
  `__tests__/engine/crossover.test.ts`: DIV1↔CADET is 5.0, DIV1↔DIV2 is 3.0,
  DIV1↔DIV3 is 3.0. Run all three and record each failure with the value it
  found — those values must equal `baseline.md` §4

- [ ] T018 [US4] *(drift)* **L1**: in `src/engine/dayColoring.ts`'s
  `colorPenalty`, split the `if (dayGap !== 1) continue` block into a gap-of-1
  branch keeping the rest-day check and `PROXIMITY_1_DAY`, and a
  gap-of-3-or-more branch adding `PENALTY_WEIGHTS.PROXIMITY_3_PLUS_DAYS ×
  proximityWeight`. A gap of 2 gets neither ([research.md D7](./research.md)).
  Keep the gender and weapon guards. The rest-day check stays at gap 1 only.
  Review the diff scenario by scenario before accepting *(subagent commits)*

- [ ] T019 [US4] *(drift)* **L9**: in `src/engine/constants.ts` make
  `CROSSOVER_GRAPH[Category.Y8]` empty, with a comment citing METHODOLOGY:118 and
  pointing at the already-correct note above `GROUP_1_MANDATORY`. The review must
  account for **two** changes: Y8↔Y10 going 0.8 → 0.0, and the two-hop Y8↔Y12
  edge going 0.3 → 0.0 because `buildPenaltyMatrix` derived it from the edge just
  removed ([research.md D5](./research.md)). A review naming only the first is
  incomplete *(subagent commits)*

- [ ] T020 [US4] *(drift)* **L3**: in `src/engine/crossover.ts`'s
  `crossoverPenalty`, look up `SOFT_SEPARATION_PAIRS` after `isGroup1Mandatory`
  and before the `PENALTY_MATRIX` lookup, returning the listed penalty when the
  pair matches ([research.md D6](./research.md)). Do not fold the pairs into
  `CROSSOVER_GRAPH`. Do not retune 5.0 / 3.0 / 3.0 to make the diff smaller
  (FR-015). The review names each of the three pairs separately and says which
  scenarios each moved *(subagent commits)*

- [ ] T021 [US4] Dispatch `test-quality-reviewer` over every test added or edited
  in T003, T004, T007, T008, T012, T013, T014 and T017, and act on its findings.
  Findings that would change what gets built rather than how it is tested go to
  the backlog, not into this feature *(subagent commits)*

**Checkpoint**: all seven items are in, each in its own reviewed commit.

---

## Phase 6: Live verification and close-out

- [ ] T022 Repair `scripts/smoke.mjs` **in place** (constitution VI — never
  rewritten): add a step applying the `NAC Div1/Junior` template, auto-scheduling,
  and asserting a placed count measured against the running app on this branch,
  with the measurement date in the comment beside it. Keep the existing boot
  assertion and the `ROC Div1A/Vet` step, correcting their expected numbers only
  if this feature moved them — and saying which item did. Run the `live-smoke`
  procedure to `SMOKE PASS` with zero console errors **(dispatched to a subagent
  — locator repair iterates)** *(subagent commits)*

- [ ] T023 Run the full gate twice: `tsc -b`, `lint`, and `pnpm test` on two
  consecutive runs. Account for the delta from the 67 files / 1799 tests baseline
  file by file — files added, tests added, tests deleted with the behavior they
  asserted, none skipped, no assertion weakened — in the commit message
  *(subagent commits)*

- [ ] T024 Close the reconciliation document's Wave 1 in
  `docs/design/backlog.md`: an assigned-to/done-on line pointing at
  `specs/010-wave-1-reconciliation/`, the seven items marked done, and what this
  feature knowingly did not fix — Part 3 still open, Waves 2–4 unbuilt, the
  Y8/Y10 same-day *bonus* unspecified, and anything T006 or T011 found. Point at
  the reconciliation document, do not restate it *(subagent commits)*

- [ ] T025 Write `specs/010-wave-1-reconciliation/handoff.md`: the before/after
  table for B1–B8 and for the ten templates, one row per item saying what drift
  it moved, the verification record, the predicted merge conflicts against `main`
  (`docs/design/backlog.md` at minimum) and which side to keep, what is left
  open, and a paste-ready resume prompt for the session that takes Wave 2 or the
  Part 3 decision *(subagent commits)*

**Checkpoint**: the branch is ready to hand to the user. The user runs
`git merge --no-ff --no-commit 010-wave-1-reconciliation` from `main`, runs
`tsc -b` / `lint` / the full suite on the merged tree, and completes the merge
with `commit-with-costs`.

---

## Dependencies

- T001 → T002 → everything.
- Within each phase, the test tasks precede their implementation task.
- T009 → T010 (the scheduler cannot emit what the coloring does not return).
- T010 → T011 (the backlog record needs the measured outcome).
- T015 and T016 are independent of each other but share a phase and commit
  separately.
- T018 → T019 → T020, strictly sequential: each drift diff must be attributable
  to one item.
- Phase 6 follows all of Phases 2–5.

The seven items themselves have no functional dependency on one another. The
ordering is the drift ledger's requirement, not the code's.

## Implementation Strategy

Dispatch one subagent per task, Sonnet by default. Opus on T002, T009 and T015 —
the three where a wrong answer leaves a green suite. Every drift review is read
by the orchestrator before the next task is dispatched; a review the orchestrator
cannot follow sends the task back rather than proceeding.
