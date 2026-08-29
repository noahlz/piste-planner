# Quickstart: validating P2 Derived State

Runnable checks proving the feature end-to-end. Prerequisites: `pnpm install`
on branch `003-p2-derived-state`.

## Full gate (run after every task)

```bash
timeout 120 pnpm --silent test > ./tmp/test.log 2>&1
timeout 180 pnpm exec tsc -b > ./tmp/tsc.log 2>&1
timeout 120 pnpm --silent lint > ./tmp/lint.log 2>&1
```

Read logs only on failure. Suite baseline entering P2: 770 passing.

## Per-story checks

| Story | Command | Expected |
|---|---|---|
| US1 store inversion | `timeout 120 pnpm --silent vitest run __tests__/store` | Placement actions, derivation purity, and serialization round-trip green. No test references `scheduleResults` or stale flags. |
| US1 staleness gone | `grep -rn "analysisStale\|scheduleStale\|markStale\|clearStale" src/` | No matches (SC-002). |
| US2 validation split | `timeout 120 pnpm --silent vitest run __tests__/engine/validation.test.ts` | Mode-mapping cases green: every policy rule ERROR-when-binding, WARN-when-advisory, structural ERROR in both. 5-day config warns, 15-day blocks. |
| US3 findings identity | same file | Identity stable across recomputes and magnitude changes, distinct per subject, dismissal sticky. |
| US4 presets moved | `timeout 120 pnpm --silent vitest run __tests__/engine/integration.test.ts __tests__/engine/driftLedger.test.ts` | Green while importing rosters from `src/data/tournaments.ts`; `grep -n "fencerCounts" __tests__/helpers/scenarios.ts` shows no inline roster copies. |
| US5 floors + re-tune | drift ledger file above | Floors equal measured counts, B4 pin intact, no scenario below its pre-change count. Before/after counts recorded in the task's commit message. |

## Behavior-drift protocol (constitution III)

Any task touching `validation.ts`, `dayColoring.ts`, `constants.ts`, or
engine types runs the drift ledger before and after:

```bash
timeout 120 pnpm --silent vitest run __tests__/engine/driftLedger.test.ts > ./tmp/drift.log 2>&1
```

A scheduled-count drop on any scenario halts the task until the cause is
identified and recorded (spec US5, research D7/D8).

## Manual smoke (existing layouts must keep working – FR-005)

```bash
pnpm dev
```

1. Wizard: pick a template, set counts, run schedule – table renders, no
   stale banner exists anywhere.
2. Edit a fencer count after scheduling – derived table updates from
   placements, nothing asks to be re-run for freshness.
3. Save/share URL, open it fresh – identical schedule (SC-001).
