# Handoff: 006-day-axis-parity

**Feature**: 006-day-axis-parity | **Written**: 2026-08-31, Phase 6 (T021–T024)

The feature is done: US1, US2, and US3 all closed (`tasks.md` T001–T020 all
checked). This file is Phase 6's handoff record — the before-and-after
numbers, what stayed open on purpose, and a paste-ready prompt to resume 004's
S6, which was gated on this landing.

## Before and after

The defect, in one number: the app booted **11 of B1's 24 events**; the drift
ledger recorded the same tournament as **24 of 24**
([reassessment-2026-08-31.md §2](../../docs/design/reassessment-2026-08-31.md)).
After US1's axis fix, the app boots **24 of 24**.

Referee attribution on B1 (`ref_requirements_by_day`), before → after
(`baseline.md`, T010's commit):

| Day | Before | After |
|---|---:|---:|
| 0 | 134 | 212 |
| 1 | 0 | 200 |
| 2 | 0 | 204 |
| 3 | 0 | 142 |

Before, all 134 peak refs collapsed onto day 0 because the four day windows
coincided on the absolute axis (`findDayForTime` resolved every coincident
window to day 0). After, demand is attributed to the day each event actually
falls on.

All eight reference tournaments, app-path placed count vs. the drift ledger's
`scheduledCount` (`baseline.md`, `parity-exceptions.md`,
`__tests__/store/appPathParity.test.ts`):

| | Before (app path) | After (app path, pinned) | Ledger | Match? |
|---|---:|---:|---:|---|
| B1 | 11 | 24 | 24 | exact |
| B2 | 0 | 0 | 24 | FR-004a exception |
| B3 | 9 | 24 | 24 | exact |
| B4 | 8 | 16 | 0 | FR-004a exception |
| B5 | 9 | 12 | 12 | exact |
| B6 | 19 | 43 | 44 | FR-004a exception |
| B7 | 3 | 18 | 18 | exact |
| B8 | 0 | 0 | 52 | FR-004a exception |

Four of eight match the ledger exactly after the axis fix alone. The
remaining four are FR-004a exceptions — established by isolation (swapping
only the day-axis config between the two paths moves none of these four
numbers; swapping only the per-competition defaults reproduces the other
path's count exactly, in both directions) — so **no residual gap traces to
the day axis** (spec.md SC-002).

## The FR-004a exceptions, and what closes each

Full classification, isolation evidence, and confidence levels:
[`parity-exceptions.md`](./parity-exceptions.md). Summary only, so this file
stays a pointer rather than a second copy:

| | Pinned | Ledger | Cause | Closes in |
|---|---:|---:|---|---|
| B2 | 0 | 24 | team events reach the engine with a PERCENTAGE cut (`cut-on-team`, a BINDING validation ERROR) — `defaultConfigForId` has no `event_type===TEAM` branch | 004 US4 |
| B4 | 16 | 0 | `strips_allocated: 0` zeroes the DE term of the upfront feasibility estimate, so the app never trips the gate the ledger trips on the same tournament | 004 US4 (pin becomes 0) |
| B6 | 43 | 44 | DE bracket sizes — two per-competition defaults (regional cut override, DE staging), each independently sufficient, in different directions | 004 US4 (must converge the ledger's own factory, a constitution III event) |
| B8 | 0 | 52 | same `cut-on-team` cause as B2, on the Div1 team events | 004 US4 (re-measured then — correcting it alone reaches 53, not 52) |

Each pin is gated in the suite two ways: at its own number, and by a second
assertion (`appPathParity.test.ts`'s second `it.each`) that a pin off the
ledger's count cannot exist without a matching entry in `parity-exceptions.md`
— so a regression or a stale exception both fail loudly rather than silently.

## What this feature knowingly did not fix

Recorded once, in
[`docs/design/backlog.md` §Day-axis parity](../../docs/design/backlog.md) —
not restated here. Three items: per-day capacity math
(`capacity.ts:211`, `dayColoring.ts:612`) still uses the flat `DAY_LENGTH_MINS`
constant rather than each day's own configured hours; placement states for
partial knowledge stay parked at P4; and the T015 day-argument guard in
`__tests__/engine/resources.test.ts` has one residual, bounded gap (an
explicit `undefined` in the `day` position slips past the static backstop at
one call site the runtime spy cannot reach).

Also out of scope by the spec, not newly discovered: 004's US4 (per-type
competition defaults — the four exceptions above are all it), the scorecard
(004 US3, exactly what this feature unblocks), advisory-vs-binding validation
wiring, flighting as user intent, and the rail rebuild (007).

## Verification record (2026-08-31, post-landing)

Commands and full before/after accounting live in each task's commit message
(`git log main..HEAD`). Re-verified for this handoff at `396a305545`:

- `__tests__/store/appPathParity.test.ts` — 17/17 passed.
- `__tests__/engine/driftLedger.test.ts` — 17/17 passed, snapshot
  byte-identical to `main`.
- `git diff --stat main -- src/engine/` — `resources.ts` only, 28 lines,
  comments-only (every added/removed line starts with `*`, `//`, or `/*`).
- Full suite: **1274 passed / 55 files** (up from the feature's starting
  1221 / 51 — 4 new test files, 4 modified, 0 deleted, 0 skipped, 0 assertion
  weakened; full accounting in T020's commit, `44e2bbc2a9`).
- `tsc -b` — clean. `lint` — clean.
- Live smoke (T019, commit `55df35714f`) — SMOKE PASS, 0 console errors.
  Boot asserts 24 of 24 (`scripts/smoke.mjs:161`). ROC Div1A/Vet template
  re-measured at 12 of 12 (the old 4-of-12 "strip shortfall" reading was an
  artifact of the broken axis, not a real shortfall). Matrix block-count
  floor raised `< 1` → `< 11`; schedule row-count floor tightened to an exact
  `!== 12`.

## Resume prompt for 004's S6

Paste-ready, for a new session with no memory of this one:

```
You are executing session S6 of feature 004-p3-workbench-shell in the
Piste Planner repository. Read specs/004-p3-workbench-shell/sessions/S6.md
in full before taking any action — start with its PRECONDITION box.

Feature 006 (day-axis parity) landed on 2026-08-31. Its gate for this
session is satisfied: the app now boots 24 of 24 events for B1 (was 11 of
24), so the scorecard S6 builds baselines over a fully scheduled
tournament rather than half of one. S6.md's PRECONDITION box records the
verification that confirmed this (a Vitest check via
__tests__/helpers/appPath.ts's runAppPath('B1'), since there is no tsx
binary in this project), and S6.md's suite baseline and engine-drift check
have already been updated for what 006 changed (1274 passed / 55 files;
the src/engine/ check re-baselined to 006's own tip, 396a305545, since
006 left one comments-only change in src/engine/resources.ts that the
original pre-006 reference commit would have flagged spuriously).

Full record of what 006 did and didn't fix:
specs/006-day-axis-parity/handoff.md. Don't re-derive it — read it once and
proceed to S6.md's "Orient first" section.
```

Nothing else in `specs/004-p3-workbench-shell/` was touched by this feature
— S6.md's PRECONDITION box, suite baseline, and engine-drift check are the
only lines edited there (T022).
