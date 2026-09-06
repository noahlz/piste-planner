# Implementation Plan: The strip count the app suggests is the strip count that works

**Branch**: `011-feasibility-and-strip-suggestion` | **Date**: 2026-09-05 | **Spec**: [spec.md](./spec.md)

**Input**: [`docs/design/methodology-reconciliation.md`](../../docs/design/methodology-reconciliation.md) §1.3 R5 and §2.1 L5; [`specs/010-wave-1-reconciliation/baseline.md`](../010-wave-1-reconciliation/baseline.md) §3

## Summary

Two corrections that together close one user-facing failure: the app recommends
a strip count and then refuses to schedule at it.

**US1 (R5)** demotes both feasibility findings from blocking ERROR to WARN, so a
worst-case aggregate estimate can no longer discard a tournament before any
scheduling is attempted. **US2 (L5)** replaces "one strip per pool of the
largest event" with "one strip per pool of every event sharing the busiest day",
and collapses three implementations of the rule into one pure engine function.

They are independent and land in that order. US1 alone moves five templates off
zero, and it is the half that moves the drift ledger — exactly one scenario, B4.
US2 moves the ten-template table and, by [research.md D6](./research.md), cannot
move B1–B8 at all. Sequencing keeps each drift review attributable to one
change.

The expensive part is not the code. It is the measurement: the ten-template
harness is the only instrument that sees either defect, and it runs three times.

## Technical Context

**Language/Version**: TypeScript 5.x, `erasableSyntaxOnly` on
**Primary Dependencies**: none added
**Testing**: Vitest + React Testing Library; drift ledger at `__tests__/engine/driftLedger.test.ts`; live smoke at `scripts/smoke.mjs`
**Target Platform**: browser (Vite/React app), pure engine underneath
**Project Type**: single web application with a pure engine core
**Performance Goals**: unchanged. US2's rule is one sort plus one linear pass over the competition set. US1 removes a short-circuit, so an oversubscribed configuration now costs a full scheduling pass where it previously cost none — the accepted cost in spec §Edge Cases
**Constraints**: B1–B8 scheduled counts never fall below their floors; the suggestion never depends on `strips_total` (FR-009); one strip per pool everywhere (FR-006)
**Scale/Scope**: 5 source files touched — `src/engine/validation.ts`, `src/engine/analysis.ts`, `src/engine/stripBudget.ts`, `src/engine/concurrentScheduler.ts`, `src/store/store.ts` — plus one deletion (`src/store/stripSuggestion.ts`) and `scripts/smoke.mjs`

**Baseline**: `main` at `ec3d3aee74` (the 010 merge). The suite there is the
number T002 records and T015 accounts against.

## Constitution Check

*GATE: evaluated before Phase 0 and again after Phase 1 design. Both passes below.*

| Principle | Assessment |
|---|---|
| **I. Pure Engine Core** | Holds, and improves. US2 moves a domain rule out of `src/store/` into `src/engine/` and deletes the store copy; the store reaches it through `buildConfig`, which is the sanctioned bridge ([research.md D5](./research.md)). Every function touched takes its inputs as arguments. No React import, no store read, no singleton enters the engine. |
| **II. Test-First** | Every implementation task has a red test before it. For US1 the red test asserts the finding's severity and then a non-empty schedule; for US2 it asserts the summed-busiest-day number on a fixture where the max rule and the sum rule differ by construction. `test-quality-reviewer` after every task that adds or edits tests; `react-code-reviewer` after T007, which edits a React component test. |
| **III. Drift Is Measured** | US1 moves B4 from 0. The task that moves it runs the ledger before and after, records all eight counts in its commit message, explains the snapshot diff, and raises `SCHEDULED_FLOORS.B4` to the measured count **in the same commit** (L9's precedent, `c5a589ce13`). US2 is expected to move nothing; a movement there is a signal that something unexpected reads the suggestion, and halts the task ([research.md D6](./research.md)). |
| **IV. Bounded Computation** | No unbounded loop. US2's rule is one descending sort and one pass assigning each event to the currently-emptiest of a fixed `days_available` groups — no convergence, no iteration to a fixed point. The bootstrap-from-day-assignment alternative that would have needed an iteration guard was rejected in D4. |
| **V. Erasable TypeScript** | No enum, namespace, or parameter property. The demotion reuses the existing `RuleKind` and `BottleneckSeverity` `as const` members; no new member is added. |
| **VI. Verified Live** | The feature's whole claim is user-visible: press **Suggest**, get a board. `scripts/smoke.mjs` is repaired **in place** in T013 — never rewritten — gaining a step that presses the button on a template that renders nothing today and measures the placed count. The existing boot, `ROC Div1A/Vet` and `NAC Div1/Junior` steps stay. T013 is dispatched to a subagent because locator repair iterates. |
| **Planning Artifacts** | `spec.md`, `plan.md`, `research.md` (D1–D6), `tasks.md` before execution; `baseline.md` and `handoff.md` produced during it. The audit's evidence stays in `docs/design/methodology-reconciliation.md` and 010's `baseline.md`, referenced rather than restated. |
| **Git Ownership** | **Worktree flow.** Work happens in `/Users/noahlz/projects/piste-planner-011-feasibility-and-strip-suggestion` on branch `011-feasibility-and-strip-suggestion`, branched from `main` at `ec3d3aee74`. Subagents commit to that branch at the checkpoints `tasks.md` marks. No push, no merge, no rebase, no amend, no branch deletion, no commit to `main`. The user lands it with `git merge --no-ff --no-commit` completed by `commit-with-costs`, and the merged tree runs `tsc -b`, `lint` and the full suite before that merge commit is written. |
| **Orchestration** | The orchestrator dispatches and writes no code beyond a 1–5 line edit. Sonnet takes the mechanical work: the severity change, the test inversions, the store rewiring, the deletions. Opus takes the three where a wrong call stays green — T002's baseline harness, T006's drift diff review, and T010's rule implementation, where a subtly wrong partition produces a plausible number that no test catches unless the fixture was built to separate max from sum. T013's smoke repair is dispatched regardless of model. |

**Result: PASS**, both before and after Phase 1. No entry in Complexity Tracking.

## Complexity Tracking

*No constitutional violation. Table intentionally empty.*

## Project Structure

### Documentation (this feature)

```text
specs/011-feasibility-and-strip-suggestion/
├── spec.md         # What and why
├── plan.md         # This file
├── research.md     # Phase 0 — D1–D6
├── baseline.md     # Phase 1 output — the pre-change measurement
├── tasks.md        # The ordered work
└── handoff.md      # Final output
```

### Source Code (repository root)

```text
src/engine/
├── validation.ts            # US1: feasibility findings become notice-kind
├── concurrentScheduler.ts   # US1: the recommendation gate widens (D3)
├── analysis.ts              # US2: the one surviving suggestion rule
└── stripBudget.ts           # US2: recommendStripCount delegates to it

src/store/
├── stripSuggestion.ts       # US2: deleted
└── store.ts                 # US2: the Suggest action reaches the engine via buildConfig

scripts/smoke.mjs            # VI: a Suggest-button step, repaired in place

__tests__/engine/            # driftLedger, concurrentScheduler, stripBudget, analysis
__tests__/components/workbench/Scorecard.test.tsx
src/store/__tests__/stripSuggestion.test.ts   # US2: deleted, cases relocated
```

## The measurement instrument

Both defects are invisible to the drift ledger — US2 entirely, US1 on seven of
eight scenarios. The instrument that sees them is the ten-template harness from
`specs/010-wave-1-reconciliation/baseline.md` §3, and it is rebuilt as this
feature's T002 rather than borrowed, because 010 deleted its probe after
recording the numbers.

Its method, unchanged from 010 §3 so the two tables compare directly: reset the
store to `getInitialState()`, `setDays(3)`, `applyTemplate(name)`, set strips,
`buildTournamentConfig(state)`, `scheduleAll`. "Placed" counts schedule entries
with a non-null `pool_start`. Tournament type stays NAC for all ten, because
`applyTemplate` does not set it and that is the app's real behavior.

It runs three times — T002 (before), T008 (after US1), T012 (after US2) — and
records per template: the suggested number itself, placed at suggested, ERROR
rule ids at suggested, placed at 80/12, ERROR rule ids at 80/12.

## Phase sequence

| Phase | Contents | Gate to leave it |
|---|---|---|
| 1 | Worktree, artifacts, baseline measurement | `baseline.md` written; suite green at the recorded count |
| 2 | US1 — the demotion, the gate widening, the three test inversions, B4's floor | Five templates non-zero at their suggested count; no floor breached |
| 3 | US2 — the engine rule, the three-way collapse, the store rewiring | One rule remains; the suggested numbers rise; no ledger movement |
| 4 | Live smoke | SMOKE PASS with the Suggest step measuring a non-empty board |
| 5 | Close-out | `tsc -b`, `lint`, full suite green; `handoff.md` and backlog written |

US1 and US2 do not interleave. A combined diff is unattributable, and the two
drift questions have different expected answers.
