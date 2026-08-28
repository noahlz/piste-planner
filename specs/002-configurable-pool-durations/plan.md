# Implementation Plan: Configurable Pool Round Durations

**Branch**: `002-configurable-pool-durations` | **Date**: 2026-08-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-configurable-pool-durations/spec.md`

## Summary

Expose the engine's existing `pool_round_duration_table` (per-weapon minutes for the 6-fencer/15-bout baseline) as user-editable state. Today `buildConfig.ts` pins it to `DEFAULT_POOL_ROUND_DURATION_TABLE` (`src/store/buildConfig.ts:66`). The feature adds a store field seeded from the defaults, per-weapon editor UI with the defaults always visible, a one-line bridge pass-through, and serialization of the table in saved files and share URLs, with an omitted key falling back to defaults. Engine math is untouched – `poolDurationForSize` and `weightedPoolDuration` (`src/engine/pools.ts:62,78`) already consume the table from config.

## Technical Context

**Language/Version**: TypeScript 5.x, `erasableSyntaxOnly` on

**Primary Dependencies**: React 19, Vite, Zustand, shadcn/ui (Radix), Tailwind CSS v4

**Storage**: None – state lives in the Zustand store, persisted only through explicit save-to-file (JSON) and share-URL (base64url) serialization in `src/store/serialization.ts`

**Testing**: Vitest + React Testing Library, tests mirror `src/` under `__tests__/`

**Target Platform**: Browser (static SPA)

**Project Type**: Single web app – pure engine (`src/engine/`), store (`src/store/`), components (`src/components/`)

**Performance Goals**: None specific – three numeric inputs and a three-key JSON object have no measurable cost

**Constraints**: Reproducibility from config alone (constitution I), zero drift on B1–B8 with no overrides set (FR-010/SC-003), omitted table key loads as defaults (FR-007 – schema leniency, since backwards compatibility is a non-goal for this unreleased product)

**Scale/Scope**: One store field + two actions, one new section component, one serialization key, ~5 files touched plus their tests

## Constitution Check

*GATE: evaluated before Phase 0, re-checked after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Pure Engine Core | PASS | No engine file changes. The table reaches the engine only through `buildTournamentConfig`, the single bridge. Serializing the table keeps every result reproducible from config alone – snapshot, shared URL, and running app agree. |
| II. Test-First | PASS | Each task writes failing tests first (store, serialization schema, bridge, component). `test-quality-reviewer` dispatched after test-writing tasks, `react-code-reviewer` after the component task. |
| III. Behavior Drift Is Measured | PASS | Engine math and constants untouched, but the bridge changes, so the B1–B8 drift ledger (`__tests__/engine/driftLedger.test.ts`) runs after the bridge task with an expected zero diff. Any diff halts the task. |
| IV. Bounded Computation | PASS | No iteration added anywhere. |
| V. Erasable TypeScript | PASS | `Weapon` is already an `as const` object with a derived union. New types are plain interfaces and `Record<Weapon, number>`. |

**Post-design re-check**: PASS – Phase 1 artifacts add no engine surface, no new stateful modules, and no schema version bump (additive optional key, see [research.md](./research.md) D3).

**Git flow (constitution, Git Ownership)**: **Worktree** – subagents commit incrementally on the `002-configurable-pool-durations` worktree branch, and the user's `commit-with-costs` runs on the squash-merge into `main`.

## Project Structure

### Documentation (this feature)

```text
specs/002-configurable-pool-durations/
├── plan.md              # This file
├── research.md          # Phase 0 – decisions D1–D7
├── data-model.md        # Phase 1 – the duration table entity and its homes
├── quickstart.md        # Phase 1 – validation scenarios
├── contracts/
│   └── serialization-schema.md  # Phase 1 – SerializedState v1 addition
└── tasks.md             # Phase 2 (/speckit-tasks – not created here)
```

### Source Code (repository root)

```text
src/
├── engine/
│   ├── constants.ts             # DEFAULT_POOL_ROUND_DURATION_TABLE (read-only reference, unchanged)
│   ├── types.ts                 # TournamentConfig.pool_round_duration_table (unchanged)
│   └── pools.ts                 # poolDurationForSize / weightedPoolDuration (unchanged)
├── store/
│   ├── store.ts                 # + pool_round_duration_table field on TournamentSlice, set/reset actions
│   ├── buildConfig.ts           # bridge: hardcoded default → state field (one line)
│   └── serialization.ts         # + tournament.pool_round_duration_table serialize/validate/deserialize
└── components/
    ├── sections/
    │   └── PoolDurationSettings.tsx   # NEW – per-weapon editor, defaults visible, revert affordance
    ├── wizard/WizardStep1.tsx         # renders the new section beside TournamentSetup
    └── KitchenSinkPage.tsx            # renders the new section

__tests__/
├── store/
│   ├── store.test.ts            # field default, actions, staleness marking
│   ├── buildConfig.test.ts      # pass-through, default path unchanged
│   └── serialization.test.ts    # round-trip, omitted-key fallback, malformed rejection
├── components/sections/
│   └── PoolDurationSettings.test.tsx  # NEW – render, override, revert, invalid entry
└── engine/
    └── driftLedger.test.ts      # unchanged – run to confirm zero drift (SC-003)
```

**Structure Decision**: Existing single-app layout. One new component file and one new test file, everything else edits files in place. UI lands as a self-contained section component (the established `sections/` pattern used by both wizard and kitchen sink) so P3 can relocate it into the workbench rail's Advanced panel without rework – see [research.md](./research.md) D6.

## Complexity Tracking

No constitution violations. Table intentionally empty.
