# Implementation Plan: P2 Derived State

**Branch**: `003-p2-derived-state` | **Date**: 2026-08-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-p2-derived-state/spec.md`

**Flow**: **Worktree** (constitution §Git Ownership). Subagents commit
checkpoints on branch `003-p2-derived-state`, the user lands it with
`git merge --no-ff --no-commit` completed by `commit-with-costs`.

## Summary

Invert the store: a `placements` map (the organizer's intent) becomes the
source of truth and everything the app displays is derived from it, killing
staleness structurally. Split validation into structural rules (always block)
and policy rules (one definition, ERROR when binding, WARN when advisory),
widen the day cap to structural 1–14 with a policy warning outside 2–4, give
findings a stable rule-plus-subject identity with serialized dismissals, move
the B1–B8 rosters into `src/data`, and pay down two pieces of calibration debt
(integration floors, `CAPACITY_TARGET_FILL`) under the constitution III drift
gate. No new UI – the existing layouts keep working on the inverted store
until P3 replaces them.

## Technical Context

**Language/Version**: TypeScript ~5.9 (`erasableSyntaxOnly` on – constitution V)

**Primary Dependencies**: React 19, Vite 8, Zustand 5 (no additions)

**Storage**: Browser only – serialized JSON in base64url share-URL hash
(`src/store/serialization.ts`), schema version bumps 1 → 2

**Testing**: Vitest 3 + React Testing Library, suite currently 770 passing

**Target Platform**: Static web app (browser)

**Project Type**: Single Vite project – pure engine (`src/engine/`), Zustand
store (`src/store/`), React components (`src/components/`)

**Performance Goals**: Full `scheduleAll` on the largest scenario runs in ~9ms
(design §Motivation), so derive-on-read selectors need only memoization, no
workers or debounce

**Constraints**: Engine stays pure (constitution I). Drift ledger floors
(`__tests__/engine/driftLedger.test.ts`) may not drop on any scenario
(constitution III). No backwards compatibility for serialized state – product
unreleased, schema v1 support is dropped, not migrated

**Scale/Scope**: ~54 events × 80 strips × 4 days worst case (B6/B8). Touches
`store.ts` (410 lines), `serialization.ts` (248), `validation.ts` (392),
`dayColoring.ts` (1 constant), 2 test files re-pointed, ~4 components
re-wired, 0 components added

## Constitution Check

*GATE: evaluated before Phase 0, re-evaluated after Phase 1 design.*

| Principle | Status | How this plan complies |
|---|---|---|
| I. Pure Engine Core | PASS | New `src/engine/derive.ts` and the validation-mode split are pure functions over explicit inputs. Placements live in the store and cross into the engine only as arguments. `buildConfig.ts` remains the only bridge. |
| II. Test-First | PASS | Every task writes failing tests first. `test-quality-reviewer` after test-writing tasks, `react-code-reviewer` after React tasks. |
| III. Drift Is Measured | PASS | Store inversion must leave engine output untouched – drift ledger runs unchanged as the proof. US5's floor re-baseline and `CAPACITY_TARGET_FILL` re-tune are explicit drift tasks with before/after counts recorded in commit messages. Any scheduled-count drop halts. |
| IV. Bounded Computation | PASS | Derivation is direct computation per event (no search, no iteration to convergence). No new loops. |
| V. Erasable TypeScript | PASS | `PlacementSource`, `RuleKind`, `ValidationMode` are `as const` objects with derived unions, matching existing style. |
| Git Ownership | PASS | Worktree flow declared above. No agent pushes, merges, or closes the feature. |
| Orchestration & Model Roles | PASS | Orchestrator dispatches all coding to Sonnet subagents, Opus for the store inversion and re-tune tasks if judged complicated at dispatch time. |

**Post-design re-check** (after Phase 1): PASS unchanged. The design added no
projects, no new dependencies, no impure engine paths. Complexity Tracking
stays empty.

## Project Structure

### Documentation (this feature)

```text
specs/003-p2-derived-state/
├── plan.md              # This file
├── research.md          # Phase 0: decisions D1–D8
├── data-model.md        # Phase 1: placements, findings, schema v2, presets
├── quickstart.md        # Phase 1: validation scenarios
├── contracts/
│   └── serialization-v2.md   # Share-URL schema contract
└── tasks.md             # Phase 2 (/speckit-tasks – not created here)
```

### Source Code (repository root)

```text
src/
├── data/
│   └── tournaments.ts        # NEW – B1–B8 preset rosters (moved from __tests__/helpers/scenarios.ts)
├── engine/
│   ├── derive.ts             # NEW – pure per-event block-geometry derivation
│   ├── validation.ts         # CHANGED – rule kinds + mode-aware severity, days 1–14
│   ├── types.ts              # CHANGED – Finding identity fields, Placement types
│   ├── dayColoring.ts        # CHANGED – CAPACITY_TARGET_FILL re-tuned
│   └── constants.ts          # CHANGED – day-bound constants
├── store/
│   ├── store.ts              # CHANGED – PlacementsSlice + DismissalsSlice in,
│   │                         #   staleness out, scheduleResults out
│   ├── runActions.ts         # CHANGED – auto-schedule writes placements
│   ├── serialization.ts      # CHANGED – schema v2: placements, dismissals, days 1–14
│   ├── buildConfig.ts        # unchanged (still the only bridge)
│   └── derived.ts            # NEW – memoized selectors: schedule view, analysis
└── components/               # CHANGED – ScheduleView, WizardStep4, sections/
                              #   re-pointed at derived selectors, stale banners deleted

__tests__/
├── helpers/scenarios.ts      # CHANGED – re-exports fixtures from src/data
├── engine/integration.test.ts# CHANGED – floors re-baselined
├── engine/driftLedger.test.ts# unchanged assertions (imports follow scenarios.ts)
├── engine/derive.test.ts     # NEW
├── engine/validation.test.ts # CHANGED – mode mapping, days bounds
└── store/                    # CHANGED – placements, dismissals, serialization v2
```

**Structure Decision**: Single-project layout, unchanged. The one structural
addition is `src/data/` for shipped tournament rosters, per design §Presets.

## Complexity Tracking

No constitution violations. Table intentionally empty.
