# Implementation Plan: Day-Axis Parity Between the App and the Drift Ledger

**Branch**: `006-day-axis-parity` | **Date**: 2026-08-31 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-day-axis-parity/spec.md`

## Summary

The store hands the scheduler four day windows that all occupy the same 840
minutes of the absolute axis. Strip allocations carry no day dimension, so the
whole tournament shares one day's strip capacity and roughly half its events
cannot be placed — 11 of 24 on the boot preset, against the drift ledger's 24.

The fix gives the scheduler a disjoint, ordered axis (day *d* at
`[d*1440 + start_d, d*1440 + end_d)`) and converts the returned times back to
clock time when they become placements. `src/engine/` is not modified except for
one sentinel value that becomes days-dependent under the new spacing. The
derived path, the canvas, the schedule table, and the shared link keep working
in clock time, because none of them ever reads a day window
([research.md D4](./research.md)).

Then it locks the equality in: an app-path parity check over all eight reference
tournaments, and a live smoke run that asserts a real placed-event count instead
of "non-empty".

## Technical Context

**Language/Version**: TypeScript 5 with `erasableSyntaxOnly`, React 19, Vite

**Primary Dependencies**: Zustand (store), Radix/shadcn + Tailwind v4 (UI),
Playwright-core (live smoke driver). No new dependency.

**Storage**: None. State lives in the store, is shared through a URL fragment,
and times are minutes from midnight throughout.

**Testing**: Vitest + React Testing Library. The B1–B8 drift ledger
(`__tests__/engine/driftLedger.test.ts`) is the behavior gate.
`scripts/smoke.mjs` is the live gate.

**Target Platform**: Browser SPA, GitHub Pages base path `/piste-planner/`.

**Project Type**: Single project — pure engine library plus React app.

**Performance Goals**: None set. Correctness fix; the suite and smoke run should
finish as they do today.

**Constraints**:
- `src/engine/` stays behavior-identical. The one permitted edit is the
  `latest_end` sentinel ([research.md D6](./research.md)), and it must be shown
  not to change the ledger.
- Every user-visible, stored, and shared time stays minutes from midnight.
- No floor lowered, no snapshot accepted without its diff explained.

**Scale/Scope**: Two store functions, one canvas accessor, one sentinel, two new
test files, one smoke-driver update. Eight reference tournaments, 24–52 events
each, 2–4 days, up to 80 strips.

## Constitution Check

*GATE: evaluated before Phase 0 and again after Phase 1 design. Both passes
below.*

| Principle | Assessment |
|---|---|
| **I. Pure Engine Core** | Holds, and improves. The engine keeps taking a `TournamentConfig` and returning a schedule; `buildConfig.ts` remains the only bridge. The change removes a UI read of an engine value (`MatrixCanvas.dayHours`), tightening the boundary rather than crossing it. |
| **II. Test-First** | The parity check is written first and must fail at the current number (the boot preset placing 11 of 24) for the stated reason before any store change. The smoke floor is raised in the same task that makes the number real. |
| **III. Drift Is Measured** | Central. The ledger runs before and after; its snapshot and floors must be byte-identical. The `latest_end` edit is the only engine-adjacent change and carries its own before/after ledger run. Any diff halts the task until explained. |
| **IV. Bounded Computation** | No loop is added or altered. The conversion is arithmetic on a day index. |
| **V. Erasable TypeScript** | No enums, namespaces, or parameter properties introduced. |
| **VI. Verified Live** | The feature's third story *is* this principle: `scripts/smoke.mjs` gains a real boot-count assertion and its lowered floors are re-measured. The driver is edited in the task that changes what it asserts, never rewritten. |
| **Planning Artifacts** | `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/day-axis.md`, `quickstart.md`, then `tasks.md`. The defect's record stays in `docs/design/reassessment-2026-08-31.md` and is referenced, not copied. |
| **Git Ownership** | Worktree flow ([research.md D8](./research.md)). Subagents commit to `006-day-axis-parity`; the user lands it with `--no-ff` plus `commit-with-costs`. |
| **Orchestration** | The orchestrator dispatches; the axis change and the parity check go to Sonnet (well-specified), the drift interpretation and any exception pinning to Opus (judgment, silent failure mode). The smoke-driver repair loop is dispatched, never run in the orchestrator. |

**Result: PASS**, both before and after Phase 1. No entry in Complexity
Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/006-day-axis-parity/
├── plan.md              # This file
├── research.md          # Phase 0 — D1–D8
├── data-model.md        # Phase 1 — the two axes and what lives on each
├── contracts/
│   └── day-axis.md      # Phase 1 — the store↔engine axis invariants
├── quickstart.md        # Phase 1 — how to verify the fix end to end
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # /speckit-tasks output
```

### Source Code (repository root)

```text
src/
├── engine/                     # unchanged except the sentinel (D6)
│   ├── types.ts                #   dayStart / dayEnd / findDayForTime — read only
│   ├── concurrentScheduler.ts  #   the absolute-axis consumer
│   └── resources.ts            #   day-end clamp + its inference fallback
├── store/
│   ├── buildConfig.ts          # emits engine-axis day windows  ← changed
│   ├── runActions.ts           # converts schedule times back to clock ← changed
│   └── derived.ts              # unchanged — axis-agnostic
└── components/canvas/
    └── MatrixCanvas.tsx        # day bands read the store, not the config ← changed

__tests__/
├── store/
│   ├── buildConfig.test.ts     # axis emission
│   └── appPathParity.test.ts   # new — the eight-tournament parity gate
└── engine/
    └── driftLedger.test.ts     # unchanged; run as the gate

scripts/
└── smoke.mjs                   # boot count asserted; floors re-measured
```

**Structure Decision**: No new directory. The change lives at the store's two
edges, and the new test sits beside the store tests because it exercises the app
path, not the engine.

## Approach

Four movements, each independently verifiable. `tasks.md` orders them.

### 1. Pin the defect before touching it

Write the app-path parity check against all eight reference tournaments and
watch it fail with the current numbers. Record what each tournament actually
places today — that list is the before-column of the whole feature and belongs
in the commit message.

Nothing is fixed in this movement. Its output is a red test whose failure
message names the real counts.

### 2. Give the scheduler a disjoint axis

Emit day windows on the calendar-day axis when building the engine config, and
subtract the day offset when the schedule becomes placements. Read the canvas's
day bands from the store rather than the engine config, so nothing shifted
reaches the screen.

Verification for this movement:
- The parity check goes green (or green with a pinned exception under FR-004a).
- The drift ledger's snapshot and floors are **unchanged** — this is the
  constitution III gate, and a diff halts the task.
- Per-day referee peaks are attributed to their own days rather than all to day
  one ([research.md D1](./research.md), second symptom).

### 3. Close the two hazards the new spacing exposes

- The `latest_end: 9999` sentinel, which starts binding at day 7 under 1440
  spacing ([research.md D6](./research.md)). Make the unconstrained case
  unconstrained, and cover it at a day count past what the UI offers.
- The day-inference fallback in the strip-window probe
  ([research.md D3](./research.md)), which is unreachable from the scheduler
  because both call sites pass the day. State the precondition where it lives
  and add a test that fails if a caller ever stops passing it.

Both carry their own ledger run.

### 4. Make the live app assert a real number

Add a boot-count assertion to the smoke driver, and re-measure the block and row
floors that were lowered to "non-empty" — including the template the driver
switches to, whose 4-of-12 yield was attributed to a strip shortfall and must be
re-read now that the axis is fixed. Record the measured numbers and their
reasons in the driver, per constitution VI.

Then note in 004's `sessions/S6.md` that its gate is satisfied.

## Risks

| Risk | Handling |
|---|---|
| The ledger diffs. | Halt. A diff means the change reached engine behavior; identify the cause and record both counts before deciding anything (constitution III). Do not accept the snapshot to move on. |
| A tournament's parity number sits below its ledger count for a reason that is **not** a per-competition default. | Not an FR-004a exception. Halt and investigate — that is the day axis still being wrong. |
| The re-measured smoke floors turn out lower than expected on the ROC template. | Legitimate if the strip shortfall is real, but it must be re-confirmed against the fixed axis, not inherited from the old comment. |
| The parity check becomes slow — eight full `scheduleAll` runs. | Acceptable if it stays in the same order as the drift ledger, which already runs eight. Measure before adding any skip. |
| Scope creep into 004's US4 per-type defaults. | FR-004a exists precisely to keep it out. Pin the number, name the closing feature, move on. |

## Out of Scope

Carried verbatim from [spec.md](./spec.md): per-type defaults (004 US4), the
scorecard (004 US3), advisory validation, placement states, flighting as intent,
the rail rebuild (007), and any change to day assignment or packing strategy.
