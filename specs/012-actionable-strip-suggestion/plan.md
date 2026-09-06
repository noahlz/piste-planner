# Implementation Plan: The suggested strip count is one a venue can supply

**Branch**: `012-actionable-strip-suggestion` | **Date**: 2026-09-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/012-actionable-strip-suggestion/spec.md`

## Summary

The **Suggest** button returns a strip count 1.53×–3.29× larger than the
tournament needs, because it sizes the venue for every pool of the busiest day
running simultaneously. Replace that rule with a search: start at the strip-hours
floor — the aggregate demand the feasibility warning already computes, divided by
the hours the days provide — and evaluate candidate counts upward until one
places every event. The busiest-day figure survives only as the bound that
terminates the scan, and reaches no user-visible surface.

Three consequences shape the work. The search runs the scheduler, so it cannot
live where the post-schedule diagnostics live — that code runs inside
`scheduleAll` and would recurse. That finding therefore reports **no strip count
at all**, because all three candidates are barred: the searched answer by
recursion, the ceiling by FR-005, and the floor by 011's own rejection of it as a
recommendation ([research.md D4](./research.md)). And a ~350ms synchronous scan
would block the paint of the very indicator that covers it, so the scan yields
between candidates ([research.md D5](./research.md)).

## Technical Context

**Language/Version**: TypeScript 5.x, `erasableSyntaxOnly` on

**Primary Dependencies**: React 19, Zustand, Vite, Tailwind v4, shadcn/ui (Radix)

**Storage**: none — configuration lives in the store and the shared URL

**Testing**: Vitest + React Testing Library; `scripts/smoke.mjs` for live verification

**Target Platform**: browser

**Project Type**: single-project web application with a pure engine core

**Performance Goals**: a **Suggest** press returns in under two seconds (SC-007).
`[M]` one scheduler run is 0.6ms on the smallest template and 7–12ms on the
66-event NAC template; worst-case scan ~350ms estimated.

**Constraints**: the search must not run during `scheduleAll` (recursion, and
FR-011's cost budget). The engine takes no React import and no store read
(constitution I). Every loop is bounded before entry (constitution IV).

**Scale/Scope**: ten templates and eight B1–B8 drift scenarios. Three engine
modules touched, one added, one store action, one component, one smoke step.

## Constitution Check

*GATE: evaluated before Phase 0 and again after Phase 1 design. Both passes recorded.*

| Principle | Assessment |
|---|---|
| **I. Pure Engine Core** | Holds. The search is a new engine leaf module taking competitions and config as arguments and returning a number or the absence of one. No React import, no store read, no singleton. Yielding between candidates belongs to the store caller that drives the sequence, not to the engine ([research.md D5](./research.md)). `buildConfig.ts` remains the only bridge. |
| **II. Test-First** | Every implementation task has a red test first. The search's red test asserts both halves of minimality — the returned count places every event **and** one fewer does not — on a fixture where the floor and the answer differ by construction, so a scan that returns its own starting point cannot pass. `test-quality-reviewer` after every task that adds or edits tests; `react-code-reviewer` after the indicator task. |
| **III. Drift Is Measured** | `stripRecommendation` moves on all eight scenarios and is re-pointed from the concurrency ceiling to the searched count ([research.md D7](./research.md)), so the ledger keeps watching the number users see. The task that moves it records all eight before-and-after values in its commit message and reviews the diff scenario by scenario. No scheduled count may fall; one that does halts the task, since the recommendation is recorded by the ledger and consumed by no scheduling path. A `baseline.md` is written before any `src/` edit. |
| **IV. Bounded Computation** | The scan's iteration count is `ceiling - floor + 1`, computed before entry from two pure functions. Reaching the ceiling without success returns the absence of an answer; a floor above the ceiling fails loudly rather than scanning backwards ([research.md D3](./research.md)). Bisection was rejected partly because its correctness rests on an unproven monotonicity assumption. |
| **V. Erasable TypeScript** | No enum, namespace, or parameter property. The search's outcome is expressed with existing `as const` patterns and a nullable return, reusing 011's FR-010 convention that `null` is the absence of an answer rather than zero. |
| **VI. Verified Live** | The feature's whole claim is user-visible: press **Suggest**, get a number a venue could supply. `scripts/smoke.mjs` is repaired **in place**, never rewritten — its selectors are the accumulated record of corrections against the real DOM. It gains a step that presses **Suggest** on a large template, reads the resulting count, and measures a full board at it. The existing steps stay. That task is dispatched to a subagent, because locator repair iterates. |
| **Planning Artifacts** | `spec.md`, `plan.md`, `research.md` (D1–D8), `data-model.md`, `quickstart.md`, `tasks.md` before execution; `baseline.md` and `handoff.md` during it. 011's measurements are referenced, never restated — with the standing caveat that its `baseline.md` §5 is days=3 and this feature is days=4. |
| **Git Ownership** | **Worktree flow** ([research.md D8](./research.md)). A fresh worktree at `/Users/noahlz/projects/piste-planner-012-actionable-strip-suggestion` on branch `012-actionable-strip-suggestion`, branched from `main` at `670c4da36e`. Subagents commit to that branch at the checkpoints `tasks.md` marks. No push, no merge, no rebase, no amend, no branch deletion, no commit to `main`. The user lands it with `git merge --no-ff --no-commit` completed by `commit-with-costs`, and the merged tree runs `tsc -b`, `lint` and the full suite before that merge commit is written. |
| **Orchestration** | The orchestrator dispatches and writes no code beyond a 1–5 line edit. Sonnet takes the mechanical work: the aggregate extraction, the removal of `recommendStripCount` and the repair of its two call sites, the test inversions, the lever message. Opus takes the three where a wrong call stays green — the baseline harness, the search implementation, and the ledger diff review. The smoke repair is dispatched regardless of model. |

**Pre-Phase 0 result**: pass, no violations.

**Post-Phase 1 result**: pass, no violations. Three items were examined and
cleared rather than waved through, the third of which changed the design:

- *Does a search that calls `scheduleAll` violate Principle I?* No. Principle I
  requires functions take inputs as arguments and return values, with no global
  state or store reads. A pure function calling another pure function is still
  pure. What it does violate is 011's **FR-009**, a requirement of that feature's
  rule, not of the constitution — and FR-016 reverses it deliberately and on the
  record.
- *Does the asynchronous store action put UI concerns in the engine?* No, and D5
  exists to keep it that way. The engine exposes a bounded sequence of candidate
  evaluations; the yielding lives in the store.
- *Does the strip-hours floor reintroduce a rejected model?* Only if shown to a
  user, which FR-017 forbids. 011's `research.md` D4 rejected strip-hours ÷ day
  length as a **recommendation**, because it implies a pool round can run on
  fewer strips for longer — the ad-hoc double-stripping the project does not
  model. As a search's first candidate it asserts nothing and never leaves the
  engine. This was caught during Phase 1 review, after an earlier draft of D4 had
  the finding report the floor.

## Project Structure

### Documentation (this feature)

```text
specs/012-actionable-strip-suggestion/
├── spec.md              # What and why
├── plan.md              # This file
├── research.md          # D1–D8
├── data-model.md        # The four quantities and their relationships
├── quickstart.md        # How to verify the feature end to end
├── baseline.md          # Written during execution, before any src/ edit
├── handoff.md           # Written at close
├── checklists/
│   └── requirements.md  # Spec quality checklist, all items pass
└── tasks.md             # /speckit-tasks output — not created by /speckit-plan
```

### Source Code (repository root)

```text
src/
├── engine/
│   ├── stripSearch.ts        # NEW — floor-then-scan search (leaf: nothing in
│   │                         #       the engine imports it)  [D1]
│   ├── capacity.ts           # gains the aggregate strip-hours function  [D2]
│   ├── validation.ts         # validateFeasibility calls the aggregate  [D2]
│   ├── stripBudget.ts        # recommendStripCount removed as a user-facing
│   │                         #   rule — no number survives review  [D4]
│   ├── analysis.ts           # suggestStripCount unchanged in behaviour;
│   │                         #   becomes the search's internal ceiling  [D3]
│   └── concurrentScheduler.ts # postScheduleDiagnostics: reworded INFO,
│                              #   four ordered levers  [D6]
├── store/
│   └── store.ts              # suggestStrips drives the search, async  [D5]
└── components/
    └── sections/StripSetup.tsx # show-after-delay indicator  [D5]

__tests__/
├── engine/
│   ├── stripSearch.test.ts   # NEW — minimality from both sides
│   ├── capacity.test.ts      # the extracted aggregate
│   ├── stripBudget.test.ts   # recommendStripCount's tests retire with it
│   ├── validation.test.ts    # feasibility unchanged after the extraction
│   ├── concurrentScheduler.test.ts # the four levers, in order
│   └── driftLedger.test.ts   # stripRecommendation moves on all eight  [D7]
├── store/
│   └── store.test.ts         # suggestStrips writes the searched count
└── components/
    └── sections/StripSetup.test.tsx # indicator appears and clears

scripts/smoke.mjs             # repaired in place — one new Suggest step
```

**Structure Decision**: single project with a pure engine core, unchanged. The
only structural addition is `src/engine/stripSearch.ts` as a leaf module, chosen
in [research.md D1](./research.md) to avoid closing a three-module import cycle
where a two-module one already exists and is already on the backlog.

## The measurement instrument

Every number this feature claims is produced by the harness `011/baseline.md`
§The method documents, with **one deliberate change**: `setDays(4)` replaces the
store's pre-boot default of 3, because `[R]` `boot.ts:41` applies preset B1 and
the app a user sees runs at four days.

This matters enough to state twice. `011/baseline.md` §5's suggested column is
measured at days=3 and is **not** what the product shows. Anyone comparing this
feature's numbers against that table is comparing two different tournaments.
`[M]` NAC Youth suggests 258 at days=3 and 197 at days=4; both are the same rule
working correctly on different inputs.

The probe is temporary, reads `src/` and never writes to it, and is deleted once
its numbers are recorded in `baseline.md`.

## Phase sequence

| Phase | Content | Exit condition |
|---|---|---|
| 1 | Worktree, artifacts, baseline measurement at days=4 | `baseline.md` written; suite green at the recorded count |
| 2 | US1 — the aggregate extraction, the search, the store action | The ten templates suggest their smallest working count; one fewer fails |
| 3 | US3 — `recommendStripCount` removed, the four ordered levers, the ledger re-pointed at the search | All eight `stripRecommendation` values recorded before and after; no scheduled count falls; no floor or ceiling in any user-visible text |
| 4 | US2 — the show-after-delay indicator | Indicator appears on the largest template, never flashes on the smallest |
| 5 | Live smoke, close-out | `scripts/smoke.mjs` passes twice with 0 console errors; `handoff.md` written |

US3 precedes US2 because US3 touches the engine and the ledger, where a late
change is expensive, while US2 is confined to the store action and one component.
Both are independently testable and either could ship without the other.

## Complexity Tracking

> No constitution violations. This table records the two costs the design accepts
> deliberately, so a reviewer does not have to rediscover whether they were
> considered.

| Cost accepted | Why | Simpler alternative rejected because |
|---|---|---|
| The suggestion now depends on a scheduling result | It is the only way to return the *smallest* working count rather than a sufficient one, which is the feature's entire purpose | A closed-form rule cannot express it: `[M]` the divisor that would reproduce the true minimum ranges 1.53×–3.29× across the ten templates, so any single formula is wrong by up to a factor of two |
| The post-schedule finding loses its strip number entirely | All three candidates are barred: the searched answer recurses inside `scheduleAll`, the ceiling is forbidden a user surface by FR-005, and the floor was rejected by 011 as double-stripping in disguise | Reporting the floor was the plan until 011's `research.md` D4 was re-read. Its rejection applies to the floor *as an answer given to an organizer*, which is what this would have been |
