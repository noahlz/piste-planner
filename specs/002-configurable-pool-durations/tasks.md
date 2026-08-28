# Tasks: Configurable Pool Round Durations

**Input**: Design documents from `/specs/002-configurable-pool-durations/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/serialization-schema.md, quickstart.md

**Tests**: Included and mandatory – constitution II is test-first. Every implementation task is preceded by a task that writes its tests and confirms they fail for the stated reason.

**Git flow**: Worktree ([plan.md](./plan.md)). Every task below commits its work on the `002-configurable-pool-durations` worktree branch when it completes – those commits are the working record. The user makes the closing squash-merge into `main` with `commit-with-costs`. No agent pushes, merges, or commits to `main`.

**Organization**: Tasks are grouped by user story so each story is an independently testable increment.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 (override UI), US2 (serialization round-trip)

**Scope note (2026-08-28)**: the product is unreleased and backwards compatibility is a non-goal. The former US3 (pre-feature configs) is deleted – the omitted-key → defaults behavior survives as schema leniency, tested inside US2 (research.md D3).

## Phase 1: Setup

**Purpose**: Isolated workspace with a verified-green baseline

- [X] T001 Create a git worktree on branch `002-configurable-pool-durations` from `main`, then confirm the baseline is green there: `timeout 120 pnpm --silent test > ./tmp/test.log 2>&1` and `timeout 180 pnpm exec tsc -b > ./tmp/tsc.log 2>&1` (read logs only on failure). No commit – nothing has changed.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The store field and the bridge pass-through. Both user-facing stories consume the store field, so this phase blocks them. Design references: research.md D1, D2, D7 and data-model.md.

**⚠️ CRITICAL**: No user story work begins until this phase is complete.

- [X] T002 Write failing store tests in `__tests__/store/store.test.ts`: `pool_round_duration_table` is seeded with the default values (epee 120, foil 105, sabre 75), `setPoolRoundDuration(weapon, minutes)` updates only that weapon and marks analysis + schedule stale, `resetPoolRoundDuration(weapon)` restores that weapon's default and marks stale, and setting a value equal to the default is allowed. Run the file and confirm the new tests fail because the field and actions do not exist (assertions on `undefined`, not compile errors – vitest strips types). Commit.
- [X] T003 Implement the store change in `src/store/store.ts`: add `pool_round_duration_table: Record<Weapon, number>` plus the two actions to `TournamentSlice` per research.md D1/D2, seeding from `DEFAULT_POOL_ROUND_DURATION_TABLE`. T002's tests pass, `timeout 180 pnpm exec tsc -b` clean. Commit.
- [X] T004 Write failing bridge tests in `__tests__/store/buildConfig.test.ts`: a store state with an overridden epee value produces `config.pool_round_duration_table` carrying that value, and a default store state produces a table equal to `DEFAULT_POOL_ROUND_DURATION_TABLE`. Run and confirm the override case fails because `src/store/buildConfig.ts:66` still hardcodes the constant. Commit.
- [X] T005 Implement the bridge pass-through in `src/store/buildConfig.ts` (the hardcoded constant becomes the store field – one line). T004's tests pass. Then run the drift check per research.md D7: `timeout 120 pnpm --silent vitest run __tests__/engine/driftLedger.test.ts > ./tmp/test.log 2>&1` and the integration suite in `__tests__/engine/integration.test.ts`. Expected: zero drift on B1–B8. Any diff halts this task until the cause is identified and recorded (constitution III). Record the zero-drift result in the commit message. Commit.
- [ ] T006 Dispatch `test-quality-reviewer` covering the tests added in T002 and T004, apply accepted findings, and re-run the two test files. Commit if anything changed.

**Checkpoint**: Store and bridge done, drift ledger proven zero. US1 and US2 can now proceed – in parallel if desired, since they touch disjoint files.

---

## Phase 3: User Story 1 - Override a Weapon's Pool Round Duration (Priority: P1) 🎯 MVP

**Goal**: An organizer edits per-weapon pool durations in the UI, defaults always visible and never blank, with revert, and recomputed schedules reflect the change.

**Independent Test**: Open the duration settings, change one weapon's value, verify the computed schedule's pool lengths change while other weapons keep defaults (quickstart.md scenarios 1–2).

- [ ] T007 [US1] Write failing component tests in `__tests__/components/sections/PoolDurationSettings.test.tsx`: renders three rows pre-filled with 120/105/75 and a "Default" badge each, never a blank input (spec US1 scenario 1), editing epee to 110 calls `setPoolRoundDuration` and shows the default (120) as reference text plus a revert control (scenarios 2–3), the revert control calls `resetPoolRoundDuration` (scenario 4), and an invalid entry (0, negative, cleared field) is rejected with the last valid value still in effect (scenario 5, bounds 1–999 per research.md D5). Follow existing section-test patterns and `__tests__/helpers/factories.ts`. Run and confirm all fail – the component does not exist. Commit.
- [ ] T008 [US1] Implement `src/components/sections/PoolDurationSettings.tsx` per research.md D6: one row per weapon using `NumberInput` (`src/components/ui/number-input.tsx`, min 1 max 999) and the `DefaultLabel` badge (`src/components/common/DefaultLabel.tsx`) when the value equals the default, switching to a "default: N min" reference and revert control when overridden. State is derived by comparing to `DEFAULT_POOL_ROUND_DURATION_TABLE` – no stored flag (data-model.md). T007's tests pass. Commit.
- [ ] T009 [US1] Render the section in both layouts: `src/components/wizard/WizardStep1.tsx` (beside `TournamentSetup`) and `src/components/KitchenSinkPage.tsx`. Full test suite still green. Commit.
- [ ] T010 [US1] Dispatch `react-code-reviewer` covering T008–T009 and `test-quality-reviewer` covering T007 (parallel dispatch is fine). Apply accepted findings, re-run the component tests and lint. Commit if anything changed.

**Checkpoint**: US1 fully functional – overrides flow store → bridge → engine and the UI honors defaults-visible/revert. This is the MVP.

---

## Phase 4: User Story 2 - Shared and Saved Configurations Carry the Durations (Priority: P2)

**Goal**: The table always travels with saved files and share URLs, so any recipient reproduces the sender's exact schedule.

**Independent Test**: Set an override, save/share, load fresh, verify identical table and schedule (quickstart.md scenarios 3–4).

- [ ] T011 [US2] Write failing serialization tests in `__tests__/store/serialization.test.ts` per the write/read contract in [contracts/serialization-schema.md](./contracts/serialization-schema.md): `serializeState` always writes the full three-key table under `tournament` (overridden or not), a save→load round-trip and an `encodeToUrl`→`decodeFromUrl` round-trip both restore a mixed table (one override, two defaults) exactly, `validateSchema` rejects each malformed shape – wrong type, missing weapon key, extra key, non-integer, value < 1, value > 999 – with a field-specific error (FR-008), and a JSON without the key loads with the returned partial state **not containing the key at all** (not present-as-`undefined`, which would clobber the store's seeded defaults through `useStore.setState` merge – FR-007, same setState-merge mechanics as the removed-field tests at lines 257–303). Model the tests on the existing round-trip and validation tests in the same file. Run and confirm the new tests fail – nothing is serialized yet. Commit.
- [ ] T012 [US2] Implement the schema change in `src/store/serialization.ts`: add `pool_round_duration_table` to `SerializedState.tournament`, write it always in `serializeState`, validate it when present in `validateSchema` (exactly three `Weapon` keys, integers 1–999), and include it in `deserializeState`'s returned state only when present – an explicit conditional, never a key set to `undefined`. T011's tests pass and the full suite stays green. Commit.
- [ ] T013 [US2] Dispatch `test-quality-reviewer` covering T011, apply accepted findings, re-run the serialization tests. Commit if anything changed.

**Checkpoint**: Both stories work independently – custom durations survive save/share, an omitted key loads as defaults.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [ ] T014 [P] Update `docs/design/backlog.md`: the "Configurable pool round durations" entry (line 68) becomes a one-line pointer to `specs/002-configurable-pool-durations/` – the spec is now the fact's home (constitution: each fact has exactly one home). Keep the youth-calibration cross-reference intact by pointing it at research.md D4. Commit.
- [ ] T015 Full validation per quickstart.md: `timeout 120 pnpm --silent test`, `timeout 180 pnpm exec tsc -b`, `timeout 120 pnpm --silent lint`, drift ledger zero on B1–B8. Read logs only on failure, fix anything red, record results in the commit message. Commit. The branch is now ready for the user's squash-merge via `commit-with-costs` – stop here.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: none – start immediately
- **Phase 2 (Foundational)**: after T001. Strictly serial inside: T002 → T003 → T004 → T005 → T006 (same files or direct dependencies)
- **Phase 3 (US1)** and **Phase 4 (US2)**: each after Phase 2, independent of each other – US1 touches components, US2 touches `serialization.ts`, disjoint files
- **Phase 5 (Polish)**: after both stories. T014 is [P]-safe any time after Phase 2 but is grouped here

### Story Dependency Notes

- US1 needs only the store field (T003) and bridge (T005) – no serialization dependency
- US2 needs only the store field – no UI dependency

### Parallel Opportunities

- After Phase 2: Phase 3 (T007–T010) and Phase 4 (T011–T013) can run as parallel tracks
- T010's two reviewer dispatches run in parallel within the task
- T014 can run in parallel with any post-Phase-2 work

## Parallel Example: after the Phase 2 checkpoint

```text
Track A (US1): T007 → T008 → T009 → T010
Track B (US2): T011 → T012 → T013
Either track may also pick up T014 at any point.
```

## Implementation Strategy

**MVP first**: Phases 1–3 deliver US1 – editable durations flowing into real schedules. Stop and validate at the Phase 3 checkpoint (quickstart.md scenarios 1–2).

**Incremental delivery**: Phase 4 makes overrides durable and shareable, Phase 5 closes the loop. Each checkpoint leaves the branch green and demonstrable.

**Per-task discipline** (constitution II and III): tests fail first for the stated reason, then pass. Reviewer dispatches are their own tasks (T006, T010, T013). The drift ledger gate lives in T005 and is re-confirmed in T015.

## Notes

- [P] tasks touch different files with no pending dependencies
- Every task commits on the worktree branch – drift evidence and before/after counts go in commit messages
- The user owns the squash-merge into `main` (`commit-with-costs`) – no agent performs it
