---

description: "Task list for Day-Axis Parity Between the App and the Drift Ledger"
---

# Tasks: Day-Axis Parity Between the App and the Drift Ledger

**Input**: Design documents from `/specs/006-day-axis-parity/`

**Prerequisites**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/day-axis.md](./contracts/day-axis.md), [quickstart.md](./quickstart.md)

**Tests**: Mandatory. Constitution II requires tests written before the
implementation they describe, run to confirm they fail for the stated reason.
This feature's first test must fail *at the defect's real number*, not merely
fail to compile.

**Git flow**: **Worktree** ([research.md D8](./research.md)). Subagents commit
incrementally to `006-day-axis-parity`. Tasks marked *(subagent commits)* are
where before-and-after counts and drift evidence are recorded. The user lands
the branch with `git merge --no-ff --no-commit` completed by
`commit-with-costs`. No agent pushes, merges, or makes the closing commit.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel – different files, no dependency on incomplete work
- **[Story]**: US1–US3, mapping to the user stories in spec.md

## Standing rules for every phase

- **The drift ledger is the gate.** `__tests__/engine/driftLedger.test.ts` runs
  at every checkpoint. Its snapshot and floors must be byte-identical to `main`.
  A diff halts the task until the cause is identified and both counts recorded
  (constitution III). Never `vitest -u` to make it green.
- **Only T014 may touch `src/engine/`**, and only the `latest_end` sentinel it
  names. Any other task producing an `src/engine/` diff is a bug in that task.
- **No number is invented.** Every count that lands in a test or in the smoke
  driver is one that was measured in the task that wrote it, with the command
  that measured it recorded in the commit message.
- **Dispatch `test-quality-reviewer`** after any task that adds or edits tests.
- **Dispatch `react-code-reviewer`** after T009, the only React change.
- **Coding subagents default to Sonnet.** Opus is for T012 and T016 — reading a
  drift diff and deciding whether a parity gap is an admissible FR-004a
  exception are judgments whose failure mode is a green suite.
- **Live-smoke work is dispatched, never run in the orchestrator**
  (constitution, Orchestration): locator repair iterates, and each round trip
  costs the orchestrator's whole context.

---

## Phase 1: Setup

**Purpose**: Isolate the work and record the before-column.

- [X] T001 Create the worktree and branch `006-day-axis-parity` from `main` (`1040c9f7a3`), confirm a clean tree, and confirm every artifact under `specs/006-day-axis-parity/` is present
- [X] T002 Record the pre-change baseline in `specs/006-day-axis-parity/baseline.md`: the app-path placed-event count for each of B1–B8, each one's drift-ledger `scheduledCount`, the suite total (expected 1221 / 51 files), and `git rev-parse main` — captured before any source file is edited *(subagent commits)*

**Checkpoint**: Worktree ready, the 11-of-24 defect recorded as numbers rather than prose.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The harness that drives the app path, which US1 and US3 both read numbers from.

**⚠️ No user story work begins until this phase is complete.**

- [X] T003 Add an app-path harness to `__tests__/helpers/appPath.ts` that, for a given scenario id, applies the preset through the store's own actions, builds the engine config, runs `scheduleAll`, and returns the placed-event count plus the per-day referee requirements — the same route `src/store/boot.ts` takes, with no test-only shortcut around `buildTournamentConfig`
- [X] T004 Write failing assertions in `__tests__/store/dayAxis.test.ts` for the four scheduler-axis invariants in [contracts/day-axis.md](./contracts/day-axis.md) C1 — pairwise disjoint, strictly ordered, congruent to the store's day modulo 1440, slot-aligned — across uniform hours, per-day hours, and the single-day case. They fail today because all windows coincide

**Checkpoint**: The app path is drivable from a test, and the contract has assertions waiting for it.

---

## Phase 3: User Story 1 - The schedule the app produces is the schedule the engine promises (Priority: P1) 🎯 MVP

**Goal**: The app places every event the engine can place. Boot goes from 11 of 24 to 24 of 24, and all eight reference tournaments match the ledger.

**Independent Test**: `__tests__/store/appPathParity.test.ts` passes with pinned counts equal to the drift ledger's, and the ledger's own snapshot is unchanged.

### Tests for User Story 1 ⚠️

> Write these FIRST and run them. T005 must fail reporting the *real* current counts — that failure message is the before-column.

- [X] T005 [US1] Write the app-path parity test in `__tests__/store/appPathParity.test.ts`: for each of B1–B8, assert the placed-event count against a pinned table seeded from `baseline.md`'s ledger column, and assert that referee requirements are attributed across the tournament's days rather than all to day one ([research.md D1](./research.md), second symptom). Run it, record the actual failing counts, and leave it red *(subagent commits)*

### Implementation for User Story 1

- [X] T006 [US1] Emit scheduler-axis day windows from `buildTournamentConfig` in `src/store/buildConfig.ts` per [contracts/day-axis.md](./contracts/day-axis.md) C1 — day *d* at `[d*1440 + start_d, d*1440 + end_d)` — leaving the store's own `dayConfigs` in clock time
- [X] T007 [US1] Extend `__tests__/store/buildConfig.test.ts` to cover the emission, and turn T004's invariant assertions green. The seam has no existing `dayConfigs` coverage to update — that absence is itself worth a note in the test file
- [X] T008 [US1] Convert schedule times back to clock time in `src/store/runActions.ts` per C2 — a result on day *d* loses `d*1440` before it becomes a `Placement.start_time` — and extend the store tests so a scheduled tournament's placements all fall inside their own day's clock hours
- [X] T009 [US1] Point `dayHours` at the store's `dayConfigs` in `src/components/canvas/MatrixCanvas.tsx:507-513` per C4, so no scheduler-axis value can reach a day band, and add the test that fails if the canvas starts reading day hours from the derived config
- [X] T010 [US1] Run the drift ledger and confirm the snapshot and floors are byte-identical to `main`; confirm `git diff --stat main -- src/engine/` is empty at this point. Record both in the commit message *(subagent commits)*
- [X] T011 [US1] Run the parity test and fill in its final pinned numbers from what was measured, not from expectation
- [X] T012 [US1] Classify any residual gap between an app-path count and its ledger count. Admissible only as an FR-004a exception traced to a per-competition default (`de_mode` staging or `strips_allocated`, [research.md D7](./research.md)); record the ledger's count, the cause, and 004's US4 as the closing feature beside the pinned number. A gap traced to the day axis is not an exception — halt and report *(subagent commits)*

**Checkpoint**: Boot shows 24 of 24. All eight tournaments are pinned and gated. Engine untouched.

---

## Phase 4: User Story 2 - A tournament's day hours are honored, day by day (Priority: P2)

**Goal**: Each day is scheduled inside its own hours, and the two hazards the new spacing exposes are closed before they can bite.

**Independent Test**: A tournament whose days have different hours schedules inside each day's own window, and narrowing one day leaves the other days' placements untouched.

**Depends on**: US1 — there is no per-day behavior to verify until the axis is disjoint.

### Tests for User Story 2 ⚠️

- [X] T013 [P] [US2] Write failing tests in `__tests__/store/dayHours.test.ts`: days with different start and end times place events inside their own windows only; narrowing one day moves that day's overflow without shifting another day's events; a day too short for an event leaves it unplaced rather than spilling past the close

### Implementation for User Story 2

- [X] T014 [US2] Replace the `latest_end: 9999` sentinel in `src/store/buildConfig.ts:122` with a genuinely unconstrained value ([research.md D6](./research.md)) — under 1440 spacing it starts truncating at day 7, where the compacted axis never reached it — and add a test at a day count beyond the UI's current maximum of 4. This is the only permitted `src/engine/`-adjacent change; run the ledger before and after and record both *(subagent commits)*
- [X] T015 [P] [US2] State the day-inference precondition where it lives in `src/engine/resources.ts:186-192,246-251` and add a test in `__tests__/engine/resources.test.ts` that fails if a scheduler call site ever stops passing `day` ([research.md D3](./research.md)). Behavior is unchanged — both real call sites already pass it (`concurrentScheduler.ts:903`, `:915`)
- [X] T016 [US2] Run the full suite and the drift ledger; confirm the snapshot is still byte-identical and that `src/engine/` carries only T014's and T015's named changes *(subagent commits)*

**Checkpoint**: Per-day hours are honored and tested, and neither hazard can resurface silently.

---

## Phase 5: User Story 3 - The running app is verified at a real number (Priority: P3)

**Goal**: `scripts/smoke.mjs` asserts how many events the app actually places, so the next halving fails the run instead of passing it.

**Independent Test**: The smoke run passes and its log reports an asserted boot count; reintroducing the axis mismatch makes it fail.

**Depends on**: US1 — the number to assert does not exist until the fix lands.

- [X] T017 [US3] Add a boot-count assertion to `scripts/smoke.mjs` after the initial canvas wait (near line 143): the number of placed events at boot on the default preset, measured against the running app, replacing the absence of any boot floor today
- [X] T018 [US3] Re-measure the block and row floors lowered to "non-empty" (`scripts/smoke.mjs:52-60`, `:184-186`, `:252-257`) against the fixed axis and set them to the measured numbers. The ROC Div1A/Vet template's 4-of-12 yield was attributed to a strip shortfall while the day axis was broken — re-read it now and rewrite the comment to say what the number is and why, per constitution VI
- [X] T019 [US3] Run `scripts/smoke.mjs` against the running app via the `live-smoke` skill, dispatched to a subagent; capture `scripts/smoke-shots/01-initial.png` showing the boot tray holding only genuinely unplaceable events, against the 13 chips it shows today *(subagent commits)*

**Checkpoint**: The live gate asserts a real number. All three stories complete.

---

## Phase 6: Polish & Handoff

- [X] T020 [P] Run the full suite, `tsc -b`, and lint; confirm the suite total is above the 1221 baseline with nothing deleted or floored down to get there
- [ ] T021 [P] Walk [quickstart.md](./quickstart.md) end to end and correct anything it gets wrong about the finished feature
- [ ] T022 Record in `specs/004-p3-workbench-shell/sessions/S6.md` that its gate is satisfied — the scorecard now baselines over a fully scheduled tournament (FR-010) — and update the 006 row in `docs/design/competition-planner-workbench.md` §Revised sequence from "Next, unspecced" to done
- [ ] T023 Add the day-axis contract to the project's standing record: a pointer from `docs/design/backlog.md` to [contracts/day-axis.md](./contracts/day-axis.md), plus the two items this feature deliberately did not fix — per-day capacity math still using the `DAY_LENGTH_MINS` constant (`capacity.ts:211`, `dayColoring.ts:612`), and placement states for partial knowledge (P4)
- [ ] T024 Write the handoff in `specs/006-day-axis-parity/handoff.md`: the before-and-after counts, the FR-004a exceptions and what closes them, and a paste-ready prompt to resume 004's S6 in a new session

**Checkpoint**: Branch ready. The user lands it with `git merge --no-ff --no-commit 006-day-axis-parity` completed by `commit-with-costs`.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (T001–T002)**: no dependencies.
- **Foundational (T003–T004)**: needs Setup. Blocks every story.
- **US1 (T005–T012)**: needs Foundational. **This is the MVP** — it is the defect.
- **US2 (T013–T016)**: needs US1. Per-day behavior is not observable until the windows are disjoint.
- **US3 (T017–T019)**: needs US1. The number it asserts does not exist before then.
- **Polish (T020–T024)**: needs all three.

Unlike a feature of independent slices, US2 and US3 genuinely depend on US1
here. US1 alone is a shippable increment: the app schedules correctly and the
suite gates it. US2 and US3 harden it.

### Within US1

T005 is written and left failing before T006. T006 and T008 are the two halves
of one contract and are verified together at T010 — the parity test can pass
neither halfway. T009 is independent of both and can land any time after T006.

### Parallel opportunities

- T013 and T015 touch different files and have no ordering between them.
- T020 and T021 are independent.
- Nothing inside US1 parallelizes usefully — T006, T007, T008 form one chain
  through the same contract, and splitting them across agents costs more in
  re-verification than it saves.

---

## Implementation Strategy

### MVP: User Story 1 only

1. Setup + Foundational.
2. US1.
3. **Stop and validate**: boot shows 24 of 24, parity green on all eight, ledger
   snapshot unchanged, `src/engine/` diff empty.
4. That is a landable branch on its own, and it unblocks 004's S6.

### Then

5. US2 — closes the two hazards the new spacing exposes.
6. US3 — makes the live gate assert a real number.
7. Polish and handoff.

---

## Notes

- The failure mode this feature fixes has no exception and no error message.
  Green tests are not evidence against it. That is why T005 comes before T006
  and why T012 refuses to absorb an unexplained number.
- A parity gap traced to the day axis is not an FR-004a exception. Halting is
  the correct outcome, not pinning.
- Commit at every task marked *(subagent commits)*; the numbers in those
  messages are the feature's record.
