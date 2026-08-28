# Implementation Plan: P1 Foundations

**Branch**: `001-p1-foundations` | **Date**: 2026-08-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-p1-foundations/spec.md`

## Summary

Remove two operational fictions from the scheduling engine – DE pods and pool
double-stripping – tighten the scheduling grid from 30 minutes to 5, collapse the
dual DE capacity estimators into one table-driven model, and add the per-bout
duration helper later phases need. Referee demand becomes one referee per
allocated strip on every path, correcting an under-count on staged DE.

This is a pure refactor of `src/engine/`, plus the store, serialization, and UI
cleanup that removing two `TournamentConfig` fields forces. The scheduler still
allocates one block per phase from `de_duration_table`, exactly as it does today.
Every change is guarded by a drift-ledger snapshot established before the first
behavior change, so each task's effect on the B1–B8 scenarios is a reviewable diff
rather than a surprise at the end.

## Technical Context

**Language/Version**: TypeScript 5 (`erasableSyntaxOnly` on), React 19

**Primary Dependencies**: Vite, Zustand, shadcn/ui (Radix), Tailwind CSS v4

**Storage**: None. Config serializes to a shareable URL and to saved JSON.

**Testing**: Vitest + React Testing Library. Suite baseline is 712 tests.

**Target Platform**: Browser SPA

**Project Type**: Single project – pure engine library plus a React UI over it

**Performance Goals**: Full `scheduleAll` stays inside a frame budget – measured
at 8–11ms across B1, B6, and B8 (53 events, 4 days, 80 strips). No task here
should move that materially.

**Constraints**: Engine functions pure, no unbounded loops, `as const` over
enums, time as minutes from midnight. The user runs all git commands.

**Scale/Scope**: 8 scenario fixtures, ~24–54 events each, up to 80 strips over
4 days. Roughly 20 source files and 12 test files change.

## Constitution Check

*GATE: evaluated before design, re-checked after.*

| Principle | Status | Notes |
|---|---|---|
| I. Pure Engine Core | PASS | All engine changes stay argument-in, value-out. `perBoutDuration` is a pure function. Store and serialization edits only remove fields. |
| II. Test-First | PASS | Every behavior-changing task writes or rewrites its tests first and runs them to confirm the expected failure. Reviewer agents are explicit task steps. |
| III. Behavior Drift Is Measured | PASS | The drift ledger is the first task, and every later task ends by reviewing its diff. The drift gate is defined in [research.md](./research.md#d2-the-drift-ledger-is-the-guard-rail-and-it-comes-first). |
| IV. Bounded Computation | PASS | No loops added. Removing the pod branch removes a loop over pods. |
| V. Erasable TypeScript | PASS | `DEFAULT_DE_STRIP_FOOTPRINT` and `YOUTH_VET_BOUT_DELTA` are plain constants. Two `as const` union types are deleted, none added. |
| Planning artifacts | PASS | No implementation code in this plan or in tasks.md. Cross-phase design stays in `docs/design/`. |
| Git ownership | PASS | Commit points appear as "(user commits)" checkpoints. `/speckit-implement`'s repository-detection step is skipped – `.gitignore` already exists and is correct. |

No violations. Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/001-p1-foundations/
├── spec.md       # What and why, user stories, requirements, clarifications
├── plan.md       # This file
├── research.md   # Phase 0 decisions – referee rule, drift gate, footprint, risks
└── tasks.md      # Ordered, checkable work
```

Cross-phase design lives outside the feature:

```text
docs/design/
├── competition-planner-workbench.md   # P1–P5 roadmap and workbench design
└── backlog.md                         # Unowned items, incl. what P1 measures for them
```

### Source Code (repository root)

```text
src/
├── engine/          # Pure scheduling engine – the bulk of this feature
│   ├── capacity.ts            # Collapse to one DE estimator
│   ├── concurrentScheduler.ts # Remove the pod allocation branch and pod ref path
│   ├── constants.ts           # SLOT_MINS, DE_BOUT_DURATION, new constants
│   ├── de.ts                  # New perBoutDuration
│   ├── pods.ts                # Deleted
│   ├── pools.ts               # Remove double-stripping
│   ├── refs.ts                # Remove podCaptainsNeeded and computePodRefDemand
│   ├── resources.ts           # allocateInterval loses pod_id
│   ├── stripBudget.ts         # Unchanged, but its output moves
│   └── types.ts               # Remove PodCaptainOverride, Pod, DeCapacityEstimation
├── store/           # buildConfig.ts, serialization.ts, store.ts – field removal
└── components/      # sections/TournamentSetup.tsx – remove one control

__tests__/
├── engine/          # Including the new driftLedger.test.ts and its snapshot
├── store/
├── components/
└── helpers/factories.ts
```

**Structure Decision**: Single project, unchanged. This feature adds one test
file (`__tests__/engine/driftLedger.test.ts`) and deletes one source file
(`src/engine/pods.ts`) with its test. No new directories.

## Complexity Tracking

No constitution violations to justify.

## Execution

Run `/speckit-implement` over [tasks.md](./tasks.md), dispatching each task to a
subagent per `superpowers:subagent-driven-development`. Subagent prompts must
state that no git commands may be run.

Tasks are strictly ordered – each one's drift review depends on the ledger state
the previous one left. `[P]` marks the few tasks that touch disjoint files within
a phase.
