---

description: "Task list for Consolidate Domain Logic and Coverage Before the Layout Deletion"
---

# Tasks: Consolidate Domain Logic and Coverage Before the Layout Deletion

**Input**: Design documents from `/specs/005-consolidate-domain-logic/`

**Prerequisites**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md), [data-model.md](./data-model.md), [quickstart.md](./quickstart.md)

**Tests**: Mandatory. Constitution II requires tests written before the
implementation they describe, run to confirm they fail for the stated reason.

**Git flow**: **Worktree**, sharing feature 004's. This feature has no branch of
its own — subagents commit to `004-p3-workbench-shell`. The user lands the
branch with `git merge --no-ff --no-commit` completed by `commit-with-costs`.
No agent pushes, merges, or makes the closing commit.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel – different files, no dependency on incomplete work
- **[Story]**: US1 or US2, mapping to the user stories in spec.md

## Standing rules for every phase

- **`src/engine/` is not read or written.** Not by any task here.
- **Feature 004's `spec.md`, `plan.md`, and `tasks.md` are not edited** beyond
  checkbox state. `~/.claude/hooks/halt-on-speckit-replan.sh` halts on anything
  else, and it is right to.
- **Dispatch `test-quality-reviewer`** after any task that adds or edits tests.
  `react-code-reviewer` has nothing to review — no component is written.
- **Coding subagents default to Sonnet.** T007 is the one that may earn Opus:
  47 individual judgment calls is the task where a cheap wrong answer is
  expensive.
- **`scripts/smoke.mjs` is neither run nor modified** ([plan.md](./plan.md)
  §Constitution Check).
- **Zero engine drift.** Any B1–B8 movement is a defect in this feature, not a
  drift to record.
- **Tooling note**: `.specify/scripts/bash/setup-tasks.sh` resolves `FEATURE_DIR`
  from the git branch name, which is `004-p3-workbench-shell`, and it resolves
  against the main checkout rather than this worktree. It points at the wrong
  feature for this work. Use `specs/005-consolidate-domain-logic/` inside the
  worktree explicitly.

---

## Phase 1: Setup

**Purpose**: Fix the numbers every later check compares against.

- [ ] T001 Confirm and record the starting point in `specs/005-consolidate-domain-logic/sessions/handoff.md`: on branch `004-p3-workbench-shell` in the worktree, the working tree clean, and the suite green. Record the case counts two independent ways – `grep -cE '^\s*(it|test)\('` per file and vitest's own per-file report – for `__tests__/components/KitchenSinkPage.test.tsx` (expect 47), `__tests__/components/WizardShell.test.tsx` (expect 27), and the `layoutMode` cases in `__tests__/store/store.test.ts` (expect 4), plus the whole-suite total (expect 878 across 34 files). **If any count differs from the expected value, stop and report it** – the numbers in 004's artifacts were already wrong once

**Checkpoint**: The starting numbers are recorded and verified, not assumed.

---

## Phase 2: Foundational (Blocking Prerequisites)

**None.** US1 and US2 share no prerequisite, touch no common file, and could run
in either order or at the same time.

This phase is left empty deliberately rather than filled with work invented to
occupy it. Recorded so a later reader does not go looking for the foundational
tasks that were skipped.

---

## Phase 3: User Story 1 – View-state hardening (Priority: P1) 🎯 MVP

**Goal**: `src/store/viewState.ts` cannot leak its shared default, cannot throw
out of a write, and cannot admit a number that its field does not permit —
fixed while the module still has exactly one consumer.

**Independent Test**: Run `__tests__/store/viewState.test.ts` alone. Mutating a
loaded result does not affect the next load, a refused `setItem` does not throw,
and each out-of-range value in [data-model.md](./data-model.md) returns the whole
default object rather than a repaired one.

### Tests for User Story 1 ⚠️ Write first, confirm they fail

- [ ] T002 [US1] Extend `__tests__/store/viewState.test.ts` with failing cases for all three defects, and run them against the **unmodified** module to confirm each fails for its stated reason: (a) load twice with nothing stored, mutate the first result, assert the second still holds defaults – this one currently passes-by-accident on some shapes, so assert on a field the mutation actually changed; (b) make `setItem` throw and assert `saveViewState` returns normally; (c) one case per range rule in [data-model.md](./data-model.md) – `timeZoom: 0`, `timeScroll: -30`, `rowScroll: 2.5`, `drawerHeight: -240` – each asserting the whole default object comes back. Note that on Node 24 these exercise the `src/test-setup.ts` shim, not jsdom's `Storage` (004 handoff §S1, surprise 1) *(subagent commits)*

### Implementation for User Story 1

- [ ] T003 [US1] Implement the three changes in `src/store/viewState.ts` per [research D3](./research.md): return `{ ...DEFAULT_VIEW_STATE }` on every fallback path and freeze `DEFAULT_VIEW_STATE`; wrap `saveViewState`'s write in `try`/`catch`; add the four range predicates to `isValidViewState`. Do not add upper bounds and do not clamp – an out-of-range value falls back wholesale, matching the module's existing idiom *(subagent commits)*
- [ ] T004 [US1] Dispatch `test-quality-reviewer` on T002's tests. Apply findings that identify a real gap; record and skip the rest with a reason, as 004's T005 did

**Checkpoint**: US1 is complete and shippable on its own. Suite green.

---

## Phase 4: User Story 2 – Coverage triage (Priority: P1)

**Goal**: All 78 cases have a recorded decision, survivors live in files named
for their behavior and mount surviving section components, and nothing in
`__tests__/` references the departing layouts — so 004's T020 becomes a
source-only deletion.

**Independent Test**: `grep -rn "KitchenSinkPage\|WizardShell\|layoutMode" __tests__/`
returns nothing, `triage-record.md` has exactly 78 decision rows, and the suite
reconciles to `878 − deleted + added`.

### Inventory before judgment

- [ ] T005 [US2] Create `specs/005-consolidate-domain-logic/triage-record.md` with one row per case and the Decision column blank, in the shape [data-model.md](./data-model.md) §Triage record specifies. Enumerate from the files themselves, not from any planning document. **The row count must be 78** – if it is not, stop and report rather than proceeding on a wrong denominator *(subagent commits)*

### Triage, source by source

> These three tasks all write `triage-record.md`, so they are sequential, not parallel.

- [ ] T006 [US2] Triage the 27 cases in `__tests__/components/WizardShell.test.tsx` and fill their decisions. This file splits cleanly at `describe` boundaries per [research D1](./research.md) – `WizardShell navigation` (14) and `Layout toggle` (7) are deletions, `ScheduleView derived output` (6) survives and re-targets at `ScheduleOutput`. Confirm the boundaries against the file rather than trusting this description *(subagent commits)*
- [ ] T007 [US2] Triage the 47 cases in `__tests__/components/KitchenSinkPage.test.tsx` **one case at a time** and fill their decisions. No wholesale calls. For each, name the surviving section component that exhibits the behavior, or the product behavior being removed. A case asserting both surviving and departing behavior in one block is split; if it cannot be split, **halt and ask** rather than rounding it into a bucket ([spec.md](./spec.md) §Edge Cases) *(subagent commits)*
- [ ] T008 [US2] Triage the 4 `layoutMode` and `setLayoutMode` cases at `__tests__/store/store.test.ts:134–148` and fill their decisions. These assert a slice 004's T020 removes, so they are expected deletions – record them as such rather than assuming it *(subagent commits)*

### Re-home the survivors

> Each task creates a distinct new file, so these are parallel. **The four buckets below are provisional** – the triage record decides how many there actually are. A bucket holding one or two cases is merged into its neighbour instead of kept for symmetry, and a bucket the triage did not populate is not created.

- [ ] T009 [P] [US2] Move the save/load/share survivors into `__tests__/components/saveLoadShare.test.tsx`, mounting `SaveLoadShare` directly ([research D1](./research.md)). Preserve the accessible-output assertions – the `role="alert"` load error and the `role="status"` dropped-placement notice are coverage a store-level test cannot provide *(subagent commits)*
- [ ] T010 [P] [US2] Move the findings-display survivors into `__tests__/components/analysisOutput.test.tsx`, mounting `AnalysisOutput` directly *(subagent commits)*
- [ ] T011 [P] [US2] Move the schedule-output survivors into `__tests__/components/scheduleOutput.test.tsx`, mounting `ScheduleOutput` directly. This is where `WizardShell.test.tsx`'s `ScheduleView derived output` block lands – the P2 derived-state contract that placements are always current and referee figures derive from them *(subagent commits)*
- [ ] T012 [P] [US2] Move the configuration-editing survivors into `__tests__/components/configEditing.test.tsx`, mounting `StripSetup`, `FencerCounts`, `CompetitionOverrides`, and `TournamentSetup` individually. A genuinely cross-section flow composes its own minimal host inside the test file rather than importing a page ([research D1](./research.md)). Cases that asserted `TemplateSelector` or `ActionButtons` rendering are deletions; cases that asserted what they *trigger* re-target at the `applyTemplate` and `runScheduleAll` store actions, which survive *(subagent commits)*

### Remove what is left

- [ ] T013 [US2] Delete `__tests__/components/KitchenSinkPage.test.tsx` and `__tests__/components/WizardShell.test.tsx`, and remove the 4 `layoutMode` cases from `__tests__/store/store.test.ts`. **Leave `src/store/store.ts`'s `layoutMode` slice and every source component alone** – `src/App.tsx:60` still renders them and 004's T020 owns their removal ([research D6](./research.md)) *(subagent commits)*
- [ ] T014 [US2] Verify FR-008 mechanically: `grep -rn "KitchenSinkPage\|WizardShell\|layoutMode" __tests__/` returns nothing, and `find __tests__ -iname "*kitchensink*" -o -iname "*wizard*"` returns nothing. A hit means FR-008 is unmet regardless of whether the suite is green
- [ ] T015 [US2] Dispatch `test-quality-reviewer` on the new test files from T009–T012

**Checkpoint**: US2 complete. 004's T020 is now a source-only deletion.

---

## Phase 5: Polish, Verification, and Handoff

- [ ] T016 Run the gate – `tsc -b`, `lint`, then the full suite **twice** (004's S1 recorded a file that passed once and failed reproducibly on re-run). Reconcile the final case count against `triage-record.md`: it must equal `878 − deleted + added`. **A green suite at an unexplained count is the exact failure this feature exists to prevent** – report the discrepancy, do not adjust a count to close it
- [ ] T017 Re-run the B1–B8 harness described in [`../004-p3-workbench-shell/drift-baseline.md`](../004-p3-workbench-shell/drift-baseline.md) and confirm every scenario matches the recorded table exactly. No engine file was touched, so this is proof, not a diff to explain. Any movement at all – including an increase – halts the feature (constitution III)
- [ ] T018 Update `specs/004-p3-workbench-shell/sessions/S2.md` and `S3.md`, and the header comment in `scripts/run-chain.sh`, so S3 no longer instructs 78 judgment calls and no longer cites the superseded 52 and 79 counts. Point S3 at `triage-record.md` instead, and reduce its T021–T022 brief to re-pointing already-triaged tests at the workbench. **Do not touch 004's `tasks.md`, `plan.md`, `spec.md`, or `research.md`** ([research D5](./research.md)) *(subagent commits)*
- [ ] T019 Point `.specify/feature.json` back at `specs/004-p3-workbench-shell` so 004's remaining sessions resolve correctly
- [ ] T020 Write `specs/005-consolidate-domain-logic/sessions/handoff.md`: tasks completed with commit SHAs, the re-targeted and deleted tally with where survivors went, **any coverage knowingly dropped and why** – the thing most worth writing down and easiest to leave out – the final suite count and how it reconciles, and anything not finished *(subagent commits)*
- [ ] T021 Feature checkpoint **(user commits)**. The branch is ready; hand it back with a paste-ready resume prompt for 004's S2

**Checkpoint**: Feature complete. 004's S2 can begin.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (T001)**: no dependencies.
- **Foundational**: empty by design.
- **US1 (T002–T004)** and **US2 (T005–T015)**: both depend only on T001, and on
  nothing from each other.
- **Polish (T016–T021)**: depends on whichever stories were done.

### Within US1

T002 before T003 — the test must be run and seen to fail against the unmodified
module first. T004 after both.

### Within US2

T005 before T006–T008 — the denominator is fixed before any judgment is made.
T006–T008 are sequential with each other (shared record file). T009–T012 depend
on the triage being complete, and are parallel with each other. T013 after
T009–T012, so nothing is deleted before its survivors have a home. T014 after
T013. T015 last.

### Parallel opportunities

- US1 and US2 in full, if two sessions are available.
- T009, T010, T011, T012 — four distinct new files, no shared state.

---

## Parallel Example: re-homing the survivors

```text
# After T005–T008 have filled every decision, launch together:
Task: "Move save/load/share survivors into __tests__/components/saveLoadShare.test.tsx, mounting SaveLoadShare"
Task: "Move findings-display survivors into __tests__/components/analysisOutput.test.tsx, mounting AnalysisOutput"
Task: "Move schedule-output survivors into __tests__/components/scheduleOutput.test.tsx, mounting ScheduleOutput"
Task: "Move configuration-editing survivors into __tests__/components/configEditing.test.tsx, mounting the four rail sections"
```

---

## Implementation Strategy

### MVP

US1 alone is a complete, shippable increment: three defects fixed in a module
before it acquires consumers. It is sequenced first because it finishes cleanly,
so a session that runs out of room mid-triage still lands something whole.

### The story that can halt

US2 is where this feature can stop and ask, and doing so is correct. The halt
conditions are named in the tasks: a case count that is not 78 (T005), a case
that asserts both surviving and departing behavior and cannot be split (T007),
a final count that will not reconcile (T016), and any engine drift at all (T017).

Halting on any of these is a better outcome than a decision made to keep moving.

### Orchestration

The session that wrote this plan does not execute it (constitution
§Orchestration). Execution begins in a fresh session against this file.
