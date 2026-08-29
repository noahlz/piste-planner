# Tasks: P2 Derived State

**Input**: Design documents from `/specs/003-p2-derived-state/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md,
contracts/serialization-v2.md, quickstart.md

**Tests**: Mandatory – constitution II. Every behavior task is preceded by a
task that writes its tests and confirms they fail for the stated reason.

**Flow**: Worktree (plan.md). Subagents commit at every task marked
**(commit)** on branch `003-p2-derived-state`. Drift-sensitive tasks record
before/after scheduled counts in their commit messages (constitution III).
The user lands the branch – no agent merges or pushes.

**Dispatch**: One subagent per task. Sonnet by default; T007, T012, and T027
are complicated enough to consider Opus at dispatch time (constitution
§Orchestration).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel with other [P] tasks in its phase (different files, no ordering dependency)
- **[Story]**: US1–US5 from spec.md

## Phase 1: Setup

- [X] T001 Create the git worktree on branch `003-p2-derived-state`, run the full gate (suite, `tsc -b`, lint – commands in quickstart.md), and record the measured B1–B8 scheduled-event counts from `__tests__/engine/driftLedger.test.ts` as the feature's drift baseline in the commit message **(commit)**

---

## Phase 2: Foundational

**Purpose**: Shared types every story builds on. No user story starts before this completes.

- [X] T002 Add foundation types to src/engine/types.ts: `Placement` record and `PlacementSource` (`'auto' | 'manual'`), `RuleKind` (`'structural' | 'policy'`), `ValidationMode` (`'binding' | 'advisory'`), and extend `ValidationError` with `rule`, `kind`, `subjects` fields – all `as const` objects with derived unions (constitution V), shapes per data-model.md. Gate: `tsc -b` clean, suite still green **(commit)**

**Checkpoint**: Types compile – US1/US2 can start (US4 needs neither).

---

## Phase 3: User Story 1 - Placements are remembered intent, the schedule is derived (Priority: P1) 🎯 MVP

**Goal**: `placements` map is the source of truth, everything shown is derived, staleness is unrepresentable, share URLs carry placements (schema v2), and the existing layouts keep working.

**Independent Test**: quickstart.md US1 rows – store/derive/serialization suites green, `grep` for staleness identifiers over `src/` returns nothing, drift ledger identical to the T001 baseline.

### Tests for User Story 1 (write first, confirm failing)

- [X] T003 [P] [US1] Write failing engine tests in __tests__/engine/derive.test.ts: block geometry derived from `(placement, competition, config)` for pool-only, single-stage DE, staged DE, and flighted events; identical output on repeated calls (purity); out-of-range `day` returns flagged blocks instead of throwing (research D1, data-model.md)
- [X] T004 [P] [US1] Write failing store tests in __tests__/store/placements.test.ts: `PlacementsSlice` actions per data-model.md (auto-replace-all, update, remove-with-competition, pin), `runScheduleAll` writing auto placements instead of `scheduleResults`, and absence of `analysisStale`/`scheduleStale`/`markStale`/`clearStale` from the store type
- [X] T005 [P] [US1] Write failing serialization tests in __tests__/store/serialization.test.ts: schema v2 per contracts/serialization-v2.md – round-trip of placements byte-for-byte (SC-001), v1 rejection, days 1–14 bounds, lenient drop-and-report of unknown placement event ids, out-of-range `day` accepted
- [X] T006 [US1] Dispatch test-quality-reviewer over T003–T005 test files and apply its findings

### Implementation for User Story 1

- [X] T007 [US1] Implement src/engine/derive.ts (pure, arguments-only – constitution I) until T003 passes, then run the drift ledger and confirm output identical to the T001 baseline **(commit)**
- [X] T008 [US1] Invert the store: in src/store/store.ts add `PlacementsSlice` and a state-only `DismissalsSlice` (guards arrive in US3), delete staleness from `UiSlice`, delete `ScheduleSlice`, strip `AnalysisSlice` to flighting accept/reject intent; rewrite src/store/runActions.ts so auto-schedule extracts placements from `scheduleAll` output (research D2) until T004 passes **(commit)**
- [X] T009 [US1] Create src/store/derived.ts memoized selectors – derived schedule view model via derive.ts, derived analysis/findings, derived ref requirements – with tests written first in __tests__/store/derived.test.ts confirming derived values track input changes with nothing cached in state **(commit)**
- [x] T010 [US1] Implement serialization v2 in src/store/serialization.ts per contracts/serialization-v2.md until T005 passes **(commit)**
- [X] T011 [US1] Dispatch test-quality-reviewer over T009's tests and apply its findings
- [X] T012 [US1] Re-point components at derived selectors and delete every staleness surface: src/components/ScheduleView.tsx, src/components/wizard/WizardStep4.tsx, src/components/sections/{ScheduleOutput,AnalysisOutput,RefRequirementsReport,ActionButtons,SaveLoadShare}.tsx – updating their tests in the same task (constitution II); both layouts stay functional (FR-005) **(commit)**
- [x] T013 [US1] Dispatch react-code-reviewer over T012's changes and apply its findings
- [X] T014 [US1] US1 checkpoint: full gate per quickstart.md, `grep -rn "analysisStale\|scheduleStale\|markStale\|clearStale" src/` empty (SC-002), drift ledger identical to baseline **(commit)**

**Checkpoint**: MVP – inverted store proven by tests and both layouts working.

---

## Phase 4: User Story 2 - One rule set, two consumers (Priority: P2)

**Goal**: Every rule tagged structural or policy, `validateConfig` mode-aware, days structural 1–14 with policy warning outside 2–4.

**Independent Test**: quickstart.md US2 row – validation suite green, 5-day config warns and schedules, 15-day blocks, rule count identical across modes (SC-003/SC-004).

### Tests for User Story 2 (write first, confirm failing)

- [x] T015 [US2] Write failing tests in __tests__/engine/validation.test.ts: for each policy rule one definition yields ERROR under `binding` and WARN under `advisory` with identical substance; structural rules ERROR in both; days 1 (warn), 2–4 (clean), 5 (warn), 14 (warn), 15 (structural error); rule catalogue counted equal across modes (research D3)
- [x] T016 [US2] Dispatch test-quality-reviewer over T015 and apply its findings

### Implementation for User Story 2

- [x] T017 [US2] Implement the split in src/engine/validation.ts: tag every rule with `RuleKind`, add the `ValidationMode` parameter, compute severity from kind+mode, replace the days check at validation.ts:379 with structural 1–14 + policy 2–4; scheduler stays the binding consumer at src/engine/concurrentScheduler.ts:182, store callers (src/store/runActions.ts, src/store/derived.ts) pass binding in P2. Run the drift ledger before/after – expected identical (all scenarios use 3–4 days); any diff halts until explained in the commit message **(commit)**
- [X] T018 [US2] US2 checkpoint: full gate, B4's pinned behavior (0 scheduled, 1 validation error) confirmed intact **(commit)**

**Checkpoint**: Validation split ready for US3 identity and for P4's advisory consumer.

---

## Phase 5: User Story 3 - Findings keep their identity (Priority: P3)

**Goal**: Stable rule-plus-subject identity, advisory-only sticky dismissals, serialized with the tournament.

**Independent Test**: quickstart.md US3 row – identity stable across recomputes and magnitude changes, distinct per subject, dismissal sticky through rule flicker, ERROR dismissal rejected.

### Tests for User Story 3 (write first, confirm failing)

- [X] T019 [US3] Write failing tests: in __tests__/engine/validation.test.ts identity equality across recomputes, magnitude-invariance, distinctness per subject, no silent identity collisions (spec US3); in __tests__/store/dismissals.test.ts advisory-only guard, stickiness through rule flicker, `dismissedFindings` serialization round-trip per contracts/serialization-v2.md
- [X] T020 [US3] Dispatch test-quality-reviewer over T019 and apply its findings

### Implementation for User Story 3

- [x] T021 [US3] Populate `rule` and `subjects` on every finding in src/engine/validation.ts, add the identity helper (`rule:subjects.join('+')`, research D4), and wire `DismissalsSlice` guards in src/store/store.ts plus `dismissedFindings` handling in src/store/serialization.ts until T019 passes. Drift ledger before/after – identical expected (identity fields are additive) **(commit)**
- [X] T022 [US3] US3 checkpoint: full gate **(commit)**

**Checkpoint**: Findings model complete for P3's drawer.

---

## Phase 6: User Story 4 - One source of truth for presets (Priority: P4)

**Goal**: B1–B8 rosters live in `src/data/tournaments.ts`, tests import from there, zero duplicate rosters.

**Independent Test**: quickstart.md US4 row – integration and drift suites green importing from src/data, no inline roster copies in __tests__/helpers/scenarios.ts.

### Implementation for User Story 4 (pure relocation – existing suites are its tests)

- [x] T023 [P] [US4] Move `SCENARIO_IDS`, `ScenarioId`, `ScenarioFixture`, and `SCENARIOS` to src/data/tournaments.ts; __tests__/helpers/scenarios.ts keeps `buildCompetitions`/`tournamentConfig` and re-exports the moved data (research D6); full gate green with unchanged scheduled counts, then drift ledger confirmed identical **(commit)**

**Checkpoint**: P3's preset picker has its data source.

---

## Phase 7: User Story 5 - Calibration debt (Priority: P5)

**Goal**: Integration floors equal measured reality, `CAPACITY_TARGET_FILL` re-tuned by measurement. Both under constitution III.

**Independent Test**: quickstart.md US5 row – floors at measured counts with B4 pin intact, no scenario below its T001 baseline after the re-tune, before/after counts in commit messages.

### Implementation for User Story 5 (ordered last so the re-tune lands on a quiet engine)

- [ ] T024 [US5] Re-baseline floors in __tests__/engine/integration.test.ts: measure per-scenario scheduled counts on the branch, raise each `toBeGreaterThanOrEqual` floor to the measured count (B1's `>= 14` included), preserve B4's dedicated pin (research D7); record old → new per scenario in the commit message **(commit)**
- [ ] T025 [US5] Dispatch test-quality-reviewer over T024 and apply its findings
- [ ] T026 [US5] Sanity-check the floor change by breaking one scenario intentionally in a scratch run (drop its strips) and confirming the floor now fails – then revert the scratch change; no commit if clean revert leaves no diff
- [ ] T027 [US5] Re-tune `CAPACITY_TARGET_FILL` in src/engine/dayColoring.ts per research D8: sweep candidates 0.4–0.8 in 0.1 steps, drift ledger per candidate, select the highest value with no scenario below its T024 floor and no ERROR-count rise – or record that 0.3 stands with the sweep evidence; update the constant's comment rationale; all eight before/after counts in the commit message (constitution III) **(commit)**
- [ ] T028 [US5] US5 checkpoint: full gate, drift ledger reviewed against T001 baseline with every difference explained in the commit message **(commit)**

**Checkpoint**: Calibration debt paid, evidence in branch history.

---

## Phase 8: Polish & Cross-Cutting

- [ ] T029 [P] Update docs: mark the two P2 rows done – backlog.md §Calibration debt entries and the design doc's "Open items carried forward" `CAPACITY_TARGET_FILL` row – as pointers to specs/003-p2-derived-state/ (one home per fact, no detail restated) **(commit)**
- [ ] T030 Final validation: full gate, quickstart.md manual smoke of both layouts (schedule renders, no staleness surface, share URL round-trips), drift summary against T001 baseline; leave the branch ready for the user's `git merge --no-ff --no-commit` + `commit-with-costs` – no agent merges or pushes **(commit)**

---

## Dependencies & Execution Order

### Phase Dependencies

```text
T001 Setup
  └─▶ T002 Foundational types
        ├─▶ US1 (T003–T014)  ─▶ US2 (T015–T018) ─▶ US3 (T019–T022)
        └─▶ US4 (T023)  [independent of US1–US3, needs only T001]
US5 (T024–T028) after US1–US4 – re-tune lands on an otherwise-quiet engine
Polish (T029–T030) last
```

- US2 follows US1 because validation-mode wiring touches runActions.ts and derived.ts, which US1 creates.
- US3 follows US2 because identity fields ride the rule definitions US2 restructures.
- US4 only needs T001 and can interleave anywhere before US5.
- US5 is strictly last among stories (research D8).

### Parallel Opportunities

- T003, T004, T005 – independent new test files.
- T023 (US4) can run in parallel with any of US1–US3's tasks (touches only scenarios.ts and src/data).
- T029 can run in parallel with T030's gate run.
- Everything else is sequential – single worktree, shared files (store.ts, validation.ts, serialization.ts) across consecutive tasks.

## Implementation Strategy

MVP is US1 alone (T001–T014): the inverted store with both layouts working is
a shippable increment and P3's hard dependency. Each later story is an
independently verifiable increment with its own checkpoint commit. Stop at
any checkpoint – the branch history carries the drift evidence either way.
