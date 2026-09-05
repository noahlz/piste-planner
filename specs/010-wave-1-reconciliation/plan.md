# Implementation Plan: Wave 1 — the seven independent reconciliation fixes

**Branch**: `010-wave-1-reconciliation` | **Date**: 2026-09-05 | **Spec**: [spec.md](./spec.md)

**Input**: [`docs/design/methodology-reconciliation.md`](../../docs/design/methodology-reconciliation.md) §Recommended sequence, Wave 1

## Summary

Seven corrections, each in one file, each independent of the other six. Two of
them restore boards that render nothing today (R1, R2). One makes a silent
hard-constraint violation loud without changing the assignment that produced it
(R7). One stops a cosmetic field from discarding a tournament (R3). Three make
the engine apply the penalty the specification states rather than the one it has
been applying (L1, L9, L3).

The wave's shape is what makes it cheap: no scheduler architecture moves, no
phase model changes, and nothing here waits on the reconciliation document's
Part 3 decision. The expensive part is not the code — it is the drift review.
Five of the seven can move the B1–B8 ledger, and the constitution requires each
diff explained before it is accepted. That is why they land in seven commits in
the document's order rather than one.

## Technical Context

**Language/Version**: TypeScript 5.x, `erasableSyntaxOnly` on
**Primary Dependencies**: none added
**Testing**: Vitest + React Testing Library; drift ledger at `__tests__/engine/driftLedger.test.ts`
**Target Platform**: browser (Vite/React app), pure engine underneath
**Project Type**: single web application with a pure engine core
**Performance Goals**: unchanged; no new loop, no new pass over the competition set beyond a linear filter
**Constraints**: B1–B8 scheduled counts never fall below their floors; day assignments unchanged by R7
**Scale/Scope**: 6 source files touched, 5 of them under `src/engine/`

**Baseline measured on this branch before any edit**: `pnpm test` → 67 files,
1799 tests passed. This matches the reconciliation document's own baseline, so
the document's measurements apply to this tree.

## Constitution Check

*GATE: evaluated before Phase 0 and again after Phase 1 design. Both passes below.*

| Principle | Assessment |
|---|---|
| **I. Pure Engine Core** | Holds. Five of six files are engine-internal and stay pure — no store read, no React import, no singleton. The sixth is `buildConfig.ts`, which is the sanctioned bridge and already carries a coercion loop of exactly this shape for regional cuts ([research.md D4](./research.md)). R2 adds a filter at the scheduler's entry, not a store lookup. |
| **II. Test-First** | Every item is written red first. For R1 and R3 the red test is a scheduling assertion that the tournament is non-empty; for R7, R2 and US4's three penalty corrections it is a direct assertion on the function's return. `test-quality-reviewer` is dispatched after each task that adds tests. |
| **III. Drift Is Measured** | The reason this feature is seven commits. R7, R2, L1, L9 and L3 can each move the ledger; R1 and R3 are expected not to and a movement from either is a signal, not noise. Each task runs the ledger before and after, and its commit carries the eight before/after counts, the moved fields by name, and the line of the change that produced each ([research.md D8](./research.md)). A count below a floor halts the task. |
| **IV. Bounded Computation** | No loop added or altered. R2's exclusion is a single linear filter over the findings and the competition set, run once, with no re-validation pass ([research.md D3](./research.md)). R7 iterates the chosen vertex's existing edge list. |
| **V. Erasable TypeScript** | No enum, namespace, or parameter property. The per-event rule set is a `ReadonlySet<string>` of literals; `BottleneckCause.UNAVOIDABLE_CROSSOVER_CONFLICT` already exists as an `as const` member and no new one is added. |
| **VI. Verified Live** | Two templates go from an empty board to a real schedule and a partial board becomes reachable, both user-visible. `scripts/smoke.mjs` is repaired **in place** in the task that makes it true — never rewritten — adding a `NAC Div1/Junior` step with a measured placed count. The existing boot and `ROC Div1A/Vet` steps stay. The repair loop is dispatched to a subagent. |
| **Planning Artifacts** | `spec.md`, `plan.md`, `research.md` (D1–D8), then `tasks.md`; `baseline.md` and `handoff.md` are produced during execution. The audit's evidence stays in `docs/design/methodology-reconciliation.md` and is referenced, never restated. |
| **Git Ownership** | **Worktree flow.** Work happens in `/Users/noahlz/projects/piste-planner-010-wave-1-reconciliation` on branch `010-wave-1-reconciliation`, branched from `main` at `a2dc363e45`. Subagents commit to that branch at the checkpoints `tasks.md` marks. No push, no merge, no rebase, no amend, no branch deletion. The user lands it with `git merge --no-ff --no-commit` completed by `commit-with-costs`, and the merged tree runs `tsc -b`, `lint` and the full suite before that merge commit is written. |
| **Orchestration** | The orchestrator dispatches and writes no code beyond a 1–5 line edit. Sonnet takes the mechanical items — the deletions, the constant edits, the test writing where the assertion is already stated. Opus takes the three where a wrong call stays green: R2's exclusion gate, R7's violation detection, and every drift-diff review. The smoke repair is dispatched. |

**Result: PASS**, both before and after Phase 1. No entry in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/010-wave-1-reconciliation/
├── plan.md         # This file
├── spec.md         # What and why
├── research.md     # Phase 0 — D1–D8
├── baseline.md     # Phase 1 output — the pre-change measurement
├── handoff.md      # Phase 9 output
└── tasks.md        # The ordered work
```

### Source Code (repository root)

```text
src/engine/
├── validation.ts          # R1 deletes indiv-team-same-day; R3 demotes cut-on-team
├── dayColoring.ts         # R7 reports fallback violations; L1 wires PROXIMITY_3_PLUS_DAYS
├── concurrentScheduler.ts # R2 scopes per-event findings; R7's findings become bottlenecks
├── constants.ts           # L9 removes the Y8→Y10 edge
└── crossover.ts           # L3 applies SOFT_SEPARATION_PAIRS

src/store/
└── buildConfig.ts         # R3 coerces a team event's cut_mode

__tests__/engine/
├── validation.test.ts     # R1 and R3 assertions
├── dayColoring.test.ts    # R7 and L1 assertions
├── crossover.test.ts      # L9 and L3 assertions
├── constants.test.ts      # L9's graph shape
├── integration.test.ts    # separation assertions that R7 must not silence
└── driftLedger.test.ts    # the gate, run seven times

scripts/smoke.mjs          # repaired in place for the restored template
```

## Approach

### 1. Measure the before

Nothing is edited until `baseline.md` exists. It records, for this tree: the
drift-ledger `scheduledCount` for each of B1–B8 and the current
`warnCountsByCause` keys; the placed count for each of the ten `TEMPLATES`
driven through the app's own configuration path; whether the DSatur least-bad
fallback fires at all on any B1–B8 scenario; and the suite totals. The template
numbers are what SC-001 is measured against, and the fallback answer decides
whether R7 is expected to move the ledger or not.

The audit measured templates at 80 strips and 12 video strips. The baseline
records the app-suggested strip count as well, because §2.1's L5 finding is that
the suggestion under-recommends — a template that places nothing at the
suggested count and fully at 80 has a *different* defect than the one Wave 1
fixes, and conflating them would credit R1 with a restoration it did not make.

### 2. R1 — delete the rule

`validateTimingConstraints` in `validation.ts` contains one rule and it is this
one. Delete the rule, and the function with it if nothing else is left; remove
its call site and any import it alone justified. The red test asserts that a
`NAC Div1/Junior` configuration schedules a non-zero number of events.

Expected drift: none on B1–B8, because the rule fires only on same-category
individual/team pairs and the audit found no such pair placed on the same day in
any scenario. If the ledger moves, R1 was doing something the audit did not
find and the task halts to explain it.

### 3. R7 — make the fallback report

Both least-bad-color branches in `dsaturLoop` currently choose a color whose
penalty is `Infinity` and record nothing. After the color is chosen, collect the
already-colored neighbours on that color whose edge weight is `Infinity` and
carry them out of the loop alongside `coloring` and `relaxations`.
`assignDaysByColoring` propagates them, and `scheduleAllConcurrent` turns each
into one WARN bottleneck naming both competitions, with cause
`UNAVOIDABLE_CROSSOVER_CONFLICT`.

The invariant that makes this safe to accept is FR-004: the coloring must be
identical. The task proves it by asserting the day map is unchanged, not by
inspection.

### 4. R2 — scope per-event findings

The gate at `scheduleAllConcurrent` returns empty on any ERROR. Split the ERROR
set by the explicit rule-id list from [research.md D2](./research.md). If the set
is non-empty and every member is on the list, remove the named competitions and
continue with the remainder plus a summary bottleneck; otherwise return empty
exactly as today. Findings are still emitted for the excluded events.

This is the task most likely to move B4, and the audit predicts it will. The
plan expects that prediction to fail — B4 trips a *policy* feasibility rule, and
R2 scopes structural ones. Either outcome is acceptable; an unexplained one is
not.

### 5. R3 — coerce the team cut

Two halves, both small: `buildConfig` gets a TEAM branch in the same loop that
applies `REGIONAL_CUT_OVERRIDES`, and `cut-on-team` becomes a `notice`. The
engine's arithmetic already ignores the field ([research.md D4](./research.md)),
so drift is expected to be nil and a movement halts the task.

### 6. L1, L9, L3 — the three penalty corrections

One task each, in that order, each with its own ledger run and its own commit.
L1 restructures one adjacent-day branch into two; L9 empties one graph entry and
must account for the two-hop Y8↔Y12 edge it also removes; L3 adds a lookup
between two existing checks in `crossoverPenalty`.

L3 is last because it is the largest expected movement — three pairs change
simultaneously and one of them by a factor of six. Its review names each of the
three separately.

### 7. Live verification and close-out

`scripts/smoke.mjs` gains a `NAC Div1/Junior` step asserting a placed count
measured against the running app on the finished branch, with the measurement
date beside it. The driver is repaired in place. Then the full gate twice,
`quickstart` walked, and `handoff.md` written with the before/after table and a
resume prompt.

## Risks

| Risk | Mitigation |
|---|---|
| **L3's 5.0 destabilises day assignment on DIV1-bearing scenarios.** It is six times the largest weight the coloring has seen and could push a board past a floor. | It is finite, so it never blocks a day — the worst case is a worse arrangement, not a lost event. Its task is last and alone, its ledger diff is reviewed pair by pair, and a floor drop halts it. The specification's value stands; FR-015 forbids retuning it to make the diff smaller. |
| **R2 lets a partial board look like a whole one.** | FR-009's summary finding exists for this, and every excluded event keeps its own ERROR. |
| **R7 turns out to fire on a B-scenario and the separation assertions in `integration.test.ts` were passing only because the violation was invisible.** | That is the finding, not a failure. The task records it, and the assertions are corrected to expect what is measured — never relaxed to pass. If a scenario is found to place a hard-blocked pair, it goes to the backlog with its witness, because *fixing* it is Wave 3's repair loop. |
| **Seven sequential drift reviews are the feature's whole cost, and the temptation is to batch them.** | The audit's own §2.1 argument is that compounded drift hides. One item per commit, per [research.md D8](./research.md). |
| **The orchestrator re-plans mid-implementation.** | `tasks.md` is complete before the first dispatch. A task the list missed is added as a task and labelled "added after implementation began" with the measurement that forced it, which is what 008 did (T020–T022); a change of *approach* halts the session and hands back a resume prompt. |

## Out of Scope

Everything in [spec.md §Out of Scope](./spec.md): Part 3 and all of Waves 2, 3
and 4, the removal of dead code this feature orphans, a same-day bonus for
Y8/Y10, and re-validation after exclusion.
