# Research: the decisions behind 011

**Feature**: `011-feasibility-and-strip-suggestion` · **Phase 0**
**Date**: 2026-09-05

Six decisions, each taken in the brainstorming session that produced
[`spec.md`](./spec.md), each with the alternative that was rejected and why.
`[R]` read from source, `[M]` measured.

---

## D1 — Feasibility demotes by changing its kind, not by special-casing the scheduler

`[R]` `validateConfig` (`validation.ts:74-77`) already re-derives feasibility's
severity from `ValidationMode`: ERROR under `BINDING`, WARN under `ADVISORY`.
Both callers pass `BINDING` (`concurrentScheduler.ts:207`, `derived.ts:139`), so
the advisory path is dead code.

**Decision**: feasibility findings become notice-kind — WARN in every mode,
never escalating — and the mode re-derivation that exists only to serve them
goes with them. Rule id, field and message text are untouched.

**Rejected**: adding feasibility rule ids to a "does not block scheduling" set
alongside `PER_EVENT_ERROR_RULES` in the scheduler. That would leave a finding
marked ERROR that demonstrably does not block, which is a lie the next reader
has to discover by experiment. R5's text is "demote to WARN, keep the message",
and severity is where the demotion belongs.

**Rejected**: flipping the app's callers to `ADVISORY`. That demotes every
policy finding at once, far past R5's scope, and silently.

## D2 — Both feasibility rules demote together

`[R]` `validateFeasibility` produces two findings on identical logic:
`feasibility-strip-hours` over total strip-hours and
`feasibility-video-strip-hours` over video strip-hours, both worst-case
aggregate sums against the same 1.15 slack band, both capable of emptying a
board on an estimate.

**Decision**: demote both. Confirmed by the product owner on 2026-09-05.

**Rejected**: demoting only the rule R5 names. It satisfies the audit's letter
and leaves the feature's own success criterion unmet — SC-004 says no board is
returned empty on account of an aggregate estimate, and the video rule is one.

## D3 — The post-schedule strip recommendation must outlive the demotion

`[R]` `postScheduleRecommendations` (`concurrentScheduler.ts:1444-1447`) emits
its "Strips: need N, have M" INFO only when some bottleneck is both ERROR and
`RESOURCE_EXHAUSTION`. All validation findings are pushed with that cause
(`:212`), so today a feasibility ERROR is frequently what opens the gate.

**Decision**: widen the gate so a WARN feasibility finding also opens it. The
shortfall message and the strip recommendation are two halves of one answer, and
D1 would otherwise silence the actionable half on exactly the boards it was
written for.

**Evidence this is a real risk, not a hypothetical**: on a configuration whose
only ERROR is feasibility, the gate closes completely after D1.

## D4 — The suggestion sums the busiest day, and never trades strips for time

The rule is: give every event one strip per pool, distribute the events across
`days_available` by descending pool demand into the currently-emptiest group,
take the fullest group's total, and divide by `max_pool_strip_pct` so the pool
phase's share of the venue is respected.

`[R]` One strip per pool is the scheduler's own invariant —
`concurrentScheduler.ts:526` sets an event's `desired_strip_count` to its pool
count, and `:535` records that a 3–5 event day shares the strip pool
concurrently. The defect is `max` where the physics says `sum`.

**Rejected**: dividing total strip-hours by day length. It produces a plausible
number and is double-stripping in disguise — it lets a pool round run on fewer
strips for longer. Double-stripping happens organically on the day, is absorbed
by the averaged pool durations, and is never a planned input
(`docs/design/backlog.md`).

**Rejected**: bootstrapping from a real `dayColoring` assignment. It is the most
accurate available answer and it violates FR-009: `dayColoring` reads capacity,
capacity reads `strips_total`, so the suggestion's answer would depend on the
strip count it is being asked to replace. The balanced partition is an
approximation of what the scheduler will do and buys independence from it.

**Rejected**: counting `max(n_pools, DE strip footprint)` per event. Defensible
and higher, but it makes the rule harder to state on the button's tooltip and
the pool round is the phase that sets the venue's width.

## D5 — The one surviving implementation lives in the engine

`[R]` Three implementations exist: `store/stripSuggestion.ts:9` (live, the
button), `engine/analysis.ts:22` (dead), `engine/stripBudget.ts:35` (live, the
post-schedule INFO, and the only one that applies `max_pool_strip_pct`).

**Decision**: one pure function in `src/engine/`, taking competitions, the day
count and the pool strip percentage. `stripBudget.ts`'s exported name keeps its
call site and delegates. The store file is deleted and the store action reaches
the engine through `buildConfig`.

**Rejected**: the audit's own instruction (§2.1 L5, "delete the engine copy").
It was written when the rule needed only a competition list. The corrected rule
needs `days_available` and `max_pool_strip_pct` from the tournament config,
which makes it domain math, and constitution I puts domain math in the engine
with `buildConfig` as the bridge. Recorded here because this feature
deliberately inverts a written instruction.

## D6 — B4 is the only drift US1 can move, and its floor rises with it

`[M]` from `specs/010-wave-1-reconciliation/baseline.md` §1 and
`[R]` `driftLedger.test.ts:206-222`: B4 is pinned at 0 scheduled with exactly 1
ERROR, and the pin's own comment names `validateFeasibility` as the cause. The
other seven scenarios schedule at or above their floors today, so none of them
is being emptied by feasibility.

`[R]` `driftLedger.test.ts` contains no reference to `suggestStrips`,
`stripSuggestion` or any suggestion function — B1–B8 supply strip counts as
fixture literals. **US2 cannot move the ledger.** This contradicts
`specs/010-wave-1-reconciliation/handoff.md` §8, which predicted L5 "changes
strip counts on every scenario, not just the ones that empty today, so it needs
its own drift review against B1–B8". The audit itself says the opposite (§2.1
L5: "Moves nothing in the ledger … which is why this defect is invisible to
it"). The handoff's prediction is the reason it recommended splitting L5 into
its own feature, and it does not hold.

**Decision**: US1 runs the ledger before and after. US2 runs it too, and a
movement from US2 is a signal that something unexpected reads the suggestion —
not noise to be accepted. `SCHEDULED_FLOORS.B4` is raised to its new measured
count in the same commit that moves it, following L9's precedent from Wave 1
(`c5a589ce13`), so a later regression toward zero cannot pass the gate silently.
