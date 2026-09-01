---

description: "Task list for Team-Event Cut Default"
---

# Tasks: Team-Event Cut Default

**Input**: Design documents from `/specs/008-team-event-cut/`

**Prerequisites**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/competition-defaults.md](./contracts/competition-defaults.md), [quickstart.md](./quickstart.md)

**Tests**: Mandatory. Constitution II requires tests written before the
implementation they describe, run to confirm they fail for the stated reason.
The first tests here must fail *at the defect's real numbers* — B2 and B8
placing zero — not merely fail to compile.

**Git flow**: **Worktree** ([research.md D7](./research.md)). Subagents commit
incrementally to `008-team-event-cut` in
`.claude/worktrees/008-team-event-cut`. Tasks marked *(subagent commits)* are
where before-and-after counts and drift evidence are recorded. The user lands
the branch with `git merge --no-ff --no-commit` completed by
`commit-with-costs`. No agent pushes, merges, rebases, amends, or makes the
closing commit.

**GitHub issues**: one per task, label `008-team-event-cut`, numbered
sequentially — T001 is [#246](https://github.com/noahlz/piste-planner/issues/246)
and T019 is [#264](https://github.com/noahlz/piste-planner/issues/264), so the
issue for T*nnn* is `245 + nnn`. Close each one when its task's commit lands on
this branch, per the project's issue-close policy. T001 is already closed.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel – different files, no dependency on incomplete work
- **[Story]**: US1–US3, mapping to the user stories in spec.md

## Standing rules for every phase

- **`src/engine/` is not touched by any task.** `git diff --stat main -- src/engine/`
  must print nothing at every checkpoint. A task producing an engine diff is a
  bug in that task, not a decision to weigh.
- **The drift ledger is the gate.** `__tests__/engine/driftLedger.test.ts` runs
  at every checkpoint and its snapshot must be byte-identical to `main`.
  Nothing in this feature can legitimately move it — no engine code, no ledger
  fixture — so a diff is a stop signal, not a result to interpret
  (constitution III). Never `vitest -u` to make it green.
- **No number is invented.** Every count that lands in a test, a document, or
  the smoke driver was measured in the task that wrote it, with the command
  that measured it recorded in the commit message. `53` for B8 is 006's
  measurement on 006's code — treat it as the expected value to *confirm*, not
  as a number to assert without re-running.
- **Never `git stash` bare.** The stash stack is shared across worktrees and
  004's S6 session is live in `.claude/worktrees/004-p3-workbench-shell`. Use a
  WIP commit on this branch, or `git stash push -u -m "<unique-tag>"` and
  `git stash apply <sha>`.
- **Do not touch `.claude/worktrees/004-p3-workbench-shell` or its branch.**
- **Dispatch `test-quality-reviewer`** after any task that adds or edits tests.
- **Dispatch `react-code-reviewer`** after T012, the only React change.
- **Coding subagents default to Sonnet.** Opus is for T009 — attributing B8's
  residual is a judgment whose failure mode is a green suite carrying a wrong
  explanation.
- **Live-smoke work is dispatched, never run in the orchestrator**
  (constitution, Orchestration): locator repair iterates, and each round trip
  costs the orchestrator's whole context.

---

## Phase 1: Setup

**Purpose**: Isolate the work and record the before-column.

- [X] T001 Create the worktree `.claude/worktrees/008-team-event-cut` and branch `008-team-event-cut` from `main` (`e56a491acb`), install dependencies, and confirm every artifact under `specs/008-team-event-cut/` is present
- [X] T002 Record the pre-change baseline in `specs/008-team-event-cut/baseline.md`, captured before any source file is edited: the app-path placed count for each of B1–B8 (via `__tests__/helpers/appPath.ts`'s `runAppPath`), each one's drift-ledger `scheduledCount`, the placed count today for each of the ten templates in `TEMPLATES` (`src/engine/catalogue.ts`) driven through the app's own route with that template's fencer defaults, the suite total (expected 1274 passed / 55 files), and `git rev-parse main` *(subagent commits)*

**Checkpoint**: the defect recorded as numbers — two reference tournaments and four templates at zero.

---

## Phase 2: User Story 1 — A tournament with team events gets a schedule (P1) 🎯 MVP

**Goal**: a team event carries the all-advance cut the engine requires, so
tournaments containing team events schedule instead of returning an empty
board.

**Independent test**: apply a team-bearing template, schedule, get a non-empty
result; B2 places the ledger's 24.

### Tests first (red)

- [X] T003 [P] [US1] Write `__tests__/store/competitionDefaults.test.ts` covering [contracts/competition-defaults.md](./contracts/competition-defaults.md) C1–C3: every catalogue entry's store-derived config, given a valid fencer count, raises no BINDING ERROR attributable to a field the store defaulted; team entries carry `DISABLED`/`100` through all three creation routes; individual entries' cut pairs equal the category defaults value for value. Run it and record the failure: it must name the team entries and the `cut-on-team` rule. If any *other* finding appears, record it in the commit message and leave it alone — C1's scope note says why
- [X] T004 [US1] In `__tests__/store/appPathParity.test.ts`, move B2's pin to `24` and B8's to `53`, delete B2's `PARITY_EXCEPTIONS` entry, and set B8's entry's `appPath` to match its new pin. Run it and record the failure: B2 and B8 must fail at `0`, and the second `it.each` must fail for B2 having pinned off nothing while an exception still stood if the entry is removed after the pin moves. Leave B8's `cause`/`evidence` prose as it is — T010 rewrites it with evidence

### Implementation

- [X] T005 [US1] Create `src/store/competitionDefaults.ts` exporting a pure derivation from a catalogue entry to its default cut, branching on `event_type === TEAM` to `DISABLED`/`100` and otherwise reading `DEFAULT_CUT_BY_CATEGORY` ([research.md D1, D3](./research.md)), and have `defaultConfigForId` in `src/store/store.ts` read it. Confirm all three creation routes (`selectCompetitions`, `addCompetition`, and the template/preset route) reach it. T003 and T004 must go green
- [X] T006 [US1] Extend `__tests__/store/store.test.ts`'s `selectCompetitions` defaults coverage with a team entry, asserting the all-advance pair, and confirm the existing individual-entry assertions still read from `DEFAULT_CUT_BY_CATEGORY` unchanged
- [X] T020 [US1] Re-pin B2 (`placed` 0 → 24) and B8 (`placed` 0 → 53) in `__tests__/helpers/appPath.test.ts`'s `BASELINE` table, and correct that file's causal comment: it attributes their zero to a `de_mode`/video-policy gate (006 research D7), which [parity-exceptions.md](../006-day-axis-parity/parity-exceptions.md) §B2 "Correction to the record" had already disproved — `video-dead-config` is a notice that never escalates, and only `cut-on-team` gated. **Added after implementation began**, discovered by T007's full-suite run: this list named `appPathParity.test.ts` as the only site pinning these numbers and there are two. A task the list missed, not a change of approach
- [X] T007 [US1] Run the drift gate and the engine-diff gate: `__tests__/engine/driftLedger.test.ts` byte-identical to `main`, `git diff --stat main -- src/engine/` empty. Record both in the commit message alongside the B2/B8 before-and-after counts *(subagent commits)*

**Checkpoint**: B2 places 24, B8 places its measured count, no reference tournament without team events moved, ledger unchanged, engine diff empty.

---

## Phase 3: User Story 2 — The parity record tells the truth (P2)

**Goal**: the pins, the suite's exception table, and the published
classification agree with each other and with what was measured.

**Independent test**: the parity suite fails if a pin moves without an
exception, or if an exception survives its pin reaching the ledger's count.

- [X] T008 [US2] Re-measure B8 against this feature's code and confirm the pin T004 set. If it is not 53, the pin is whatever it measures — record both numbers and what changed between 006's measurement and this one, and do not adjust anything to reach either 52 or 53
- [X] T009 [US2] Attribute B8's residual by isolation, the method `parity-exceptions.md` used for B4 and B6: hold the config fixed and swap one per-competition default at a time (the ledger's `de_mode`, its `strips_allocated`, its `cut_mode`/`cut_value`) to find which one closes the distance to the ledger's 52. Record the runs and the result. If no single default accounts for it, record that it is unattributed rather than choosing the most plausible one **(Opus — a wrong attribution stays green)**
- [X] T010 [US2] Rewrite B8's `PARITY_EXCEPTIONS` entry in `__tests__/store/appPathParity.test.ts` to describe the +1 rather than the empty schedule, with T009's evidence and the feature that closes it. If T009 found the residual is **not** a 004 US4 default, change the `closedBy` assertion at the file's second `it.each` from `toContain('004 US4')` to requiring a non-empty named closing feature, and say so in the file's comment ([research.md D4](./research.md)). Update the file's header comment where it still describes B2 and B8 as placing nothing
- [X] T011 [US2] Update `specs/006-day-axis-parity/parity-exceptions.md`: the verdict table's B2 and B8 rows, B2's section closed with the feature and date that closed it (006's §Day-axis parity closure in `docs/design/backlog.md` is the form), B8's section rewritten around the +1 with T009's evidence, and the "seam all four share" table's `cut_mode` row marked closed. Do not restate the fix — point at this feature's directory *(subagent commits)*

**Checkpoint**: no stale exception, no unevidenced claim, and 006's classification document matches the suite.

---

## Phase 4: User Story 3 — The default indicator stays honest (P3)

**Goal**: a freshly created team event's cut reads as its default, not as
user-modified.

**Independent test**: render the overrides table with a team competition and
read its cut field's marker.

- [X] T012 [US3] Have `src/components/sections/CompetitionOverrides.tsx` derive both cut `DefaultLabel` comparisons from `src/store/competitionDefaults.ts` instead of reading `DEFAULT_CUT_BY_CATEGORY` directly, so the marker and the applied default cannot disagree (contract C4)
- [X] T013 [P] [US3] Add `__tests__/components/sections/CompetitionOverrides.test.tsx` covering the three acceptance scenarios in spec.md US3: a new team row reads as default, a changed one does not, an individual row is unchanged *(subagent commits)*

**Checkpoint**: the rail tells the truth about what the store applied.

---

## Phase 5: Polish & Cross-Cutting

- [X] T014 [P] Add a comment above `buildCompetitions` in `__tests__/helpers/scenarios.ts` recording that its team branch is a deliberate second copy and pointing at [research.md D2](./research.md), so the next reader does not unify it. Comment only — re-run the drift ledger and confirm the snapshot is byte-identical
- [X] T015 Repair `scripts/smoke.mjs` **in place** (never rewritten — constitution VI): add a step that applies the `NAC Cadet/Junior` template, auto-schedules, and asserts a placed count measured against the running app, with the measurement date in the comment beside it ([research.md D5](./research.md)). Keep the boot assertion at 24 and keep the `ROC Div1A/Vet` step. Run the `live-smoke` skill's procedure to `SMOKE PASS` with zero console errors **(dispatched to a subagent — locator repair iterates)** *(subagent commits)*
- [X] T016 Close `docs/design/backlog.md` §Team events block their whole tournament in the form 006 used for §Day-axis parity — assigned-to/done-on line, a pointer to `specs/008-team-event-cut/`, and anything this feature deliberately did not fix. The section does not exist on `main`; add it in closed form and expect the merge conflict [research.md D6](./research.md) predicts
- [X] T021 Correct stale `file:line` citations in `__tests__/store/appPathParity.test.ts`, `specs/008-team-event-cut/b8-residual.md`, `specs/008-team-event-cut/research.md` and `specs/006-day-axis-parity/parity-exceptions.md`, verifying each against the cited file rather than substituting by table. **Added after implementation began**, found by `test-quality-reviewer` on T010's commit: this feature's own T014 inserted a comment block above `buildCompetitions`, shifting every `scenarios.ts:NN` reference written before it, and several `buildConfig.ts:NN` references inherited from 006 were already stale. These citations render into test failure messages and into the parity record. A task the list missed, not a change of approach
- [X] T022 Correct the four-templates outcome claim to the measured two in `docs/design/backlog.md`, with dated amendments to [research.md D5](./research.md) and `plan.md`'s Constitution Check row VI. **Added after implementation began**, forced by measurement: T016 wrote a planning-time prediction into the backlog as an outcome, and a fresh-store run found only `NAC Cadet/Junior` (10 of 24) and `Junior Olympics` (9 of 18) recovered. `NAC Div1/Junior` and `NAC Vet/Div1/Junior` stay at 0 on `indiv-team-same-day` (`src/engine/validation.ts:272-310`), with zero `cut-on-team` findings on either — this feature's fix is not implicated, and the rule is out of scope. Backlogged with its three fix targets and their provenance. A correction measurement forced, not a change of approach
- [ ] T017 Run the full gate twice: `tsc -b`, `lint`, and `pnpm test` on two consecutive runs. Account for the delta from the 1274 passed / 55 files baseline file by file — new files, modified files, tests added, none deleted, none skipped, no assertion weakened — in the commit message *(subagent commits)*
- [ ] T018 Walk [quickstart.md](./quickstart.md) end to end and correct anything it gets wrong about the built feature rather than correcting the feature to match it
- [ ] T019 Write `specs/008-team-event-cut/handoff.md`: before-and-after numbers for all eight reference tournaments and the ten templates, what this feature knowingly did not fix (pointing at the backlog, not restating it), the two predicted merge conflicts (`docs/design/backlog.md` and `src/store/store.ts` against `004-p3-workbench-shell`) and which side to keep, the verification record, and a paste-ready resume prompt *(subagent commits)*

**Checkpoint**: the branch is ready to hand to the user. **The user makes the closing commit.**

---

## Dependencies

```text
T001 ──▶ T002 ──▶ ┌ T003 ┐
                  └ T004 ┘──▶ T005 ──▶ T006 ──▶ T007  (US1, MVP)
                                            │
                                            ├──▶ T008 ──▶ T009 ──▶ T010 ──▶ T011  (US2)
                                            │
                                            ├──▶ T012 ──▶ T013                    (US3)
                                            │
                                            └──▶ T014, T015, T016 ──▶ T017 ──▶ T018 ──▶ T019
```

- **US1 is the MVP** and blocks everything: US2 measures what US1 produced, US3
  corrects a marker only US1 makes wrong, and the smoke step asserts a number
  only US1 makes true.
- **US2 and US3 are independent of each other** and can run in parallel once
  US1's checkpoint is green.
- T003 and T004 are parallel — different files, both red against unfixed code.
- T014 is parallel with anything after US1; it touches one comment.
- T017 runs after every code and test change is in.

## Implementation Strategy

Stop at US1's checkpoint and the product defect is fixed: every tournament
schedules. US2 and US3 are what keep it fixed and keep the record honest — the
parity pins are the instrument that will tell the next session whether this
held, and the default marker is a defect US1 introduces if US3 is skipped.

The order is deliberate: measure, then write the red test at the measured
number, then fix, then re-measure. Every previous feature in this repo that
skipped the first step spent its last tasks recovering the number it assumed.
