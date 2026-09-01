# Research: Team-Event Cut Default

**Feature**: 008-team-event-cut | **Phase**: 0 | **Date**: 2026-08-31

Decisions this feature had to make before writing tasks. The defect's own
analysis is not re-derived here — it is
[`docs/design/backlog.md` §Team events block their whole tournament](../../docs/design/backlog.md)
and [006's `parity-exceptions.md`](../006-day-axis-parity/parity-exceptions.md).

---

## D1 — Where the default derivation lives

**Decision**: a new store-side module, `src/store/competitionDefaults.ts`,
exporting a pure function from a catalogue entry to its default cut. Both
`defaultConfigForId` (`src/store/store.ts`) and the rail's overrides table
(`src/components/sections/CompetitionOverrides.tsx`) read it.

**Rationale**: three call sites need the same answer, and one of them is a
React component. Today the component re-derives the default by reaching for
`DEFAULT_CUT_BY_CATEGORY` directly and comparing — which is how it stays
correct only as long as the store's derivation is also "the category's
default, nothing else". The moment the store branches on event type and the
component does not, the component starts printing "default" wrongly on every
team row the instant the row exists. Two copies of a rule that has to agree,
in a codebase whose whole defect record is about two copies of a rule that did
not agree, is not a defensible shape.

The helper is store-side rather than engine-side because the constraint on
this feature is an empty `src/engine/` diff. Engine-side is arguably the
better long-term home — the rule it satisfies (`cut-on-team`) is the engine's,
and `DEFAULT_CUT_BY_CATEGORY` already lives in `src/engine/constants.ts` — but
moving it there is an engine change, so it is named here and left for whoever
converges the ledger's factory (D2).

**Alternatives considered**:
- *Inline the branch in `defaultConfigForId`, leave the component alone.*
  Smallest diff, and it leaves the component wrong. Rejected.
- *Inline in both places.* A third copy of the same rule. Rejected on the
  same grounds as D2's second copy.
- *Put the helper in `src/engine/constants.ts` beside the table it reads.*
  Cleanest home, but it violates this feature's hard constraint and would put
  the drift ledger at risk for a cosmetic gain. Deferred, not rejected.

---

## D2 — Should the drift ledger's factory read the store's helper?

**Decision**: **No.** `__tests__/helpers/scenarios.ts` keeps its own copy of
the team branch (`scenarios.ts:49-52`). The only change made to that file is a
comment saying the duplication is deliberate and pointing here, so the next
reader does not "clean it up".

**Rationale**: this is the decision the dispatch asked for, and the tempting
answer is wrong. The duplication *is* why the ledger path never saw this bug —
but the instrument that did see it is 006's app-path parity check, which works
by running both paths and comparing their outputs. That check has power only
because the two paths derive their competitions independently. Point the
factory at the store's helper and the comparison becomes true by construction:
the parity test can no longer detect a divergence in that default, because
there is no longer anything to diverge. A bug in the shared helper would then
move the drift ledger's own snapshot rather than showing up as a parity gap —
turning a loud, localized failure into a silent re-baselining of the project's
behavior record.

The ledger is a second set of books. Two sets of books that are written from
one source are one set of books.

What made the duplication dangerous before 006 was not the duplication, it was
that nothing compared the two. That is fixed. Recording the reasoning here is
the cost of keeping it fixed — this file is what a future session finds when
it notices the copy.

The narrower risk that remains — the two copies drifting on a catalogue entry
the eight reference tournaments do not exercise — is covered instead by the
contract in [contracts/competition-defaults.md](./contracts/competition-defaults.md),
which checks the store's derivation against the engine's rule across the whole
catalogue rather than against the ledger's copy.

**Alternatives considered**:
- *Factory imports the store helper.* Removes the duplication and the
  detector with it. Rejected, above.
- *Both import a shared engine-side helper.* Same loss of independence, plus
  an engine change. Rejected here; if it is ever done it is a constitution III
  event with its own snapshot review, and it belongs to whoever converges the
  factory for 004's US4 (which `parity-exceptions.md` already flags for B6).
- *Delete the factory's branch and let the ledger measure the store's
  behavior.* Would have made the ledger record an empty schedule for B2 and
  B8 as "correct". Rejected on sight.

---

## D3 — What value a team event's cut takes

**Decision**: the all-advance setting — cut mode `DISABLED`, cut value `100` —
matching what the ledger's factory has always sent (`scenarios.ts:50-51`).

**Rationale**: the engine's rule (`src/engine/validation.ts:157-159`) tests
the mode only, so the value is free. Choosing `100` rather than leaving the
category's value keeps the pair readable as "100% advance" and makes the
store's output identical to the ledger's for team events, which is what lets
B2 land exactly on the ledger's count instead of near it. Several categories
(Veteran, Div1A, Div2, Div3, Y8/Y10/Y12) already default to `DISABLED`/`100`,
so for their team events this is a no-op — which is why B1, whose team events
are all Veteran, has never exhibited the defect.

**Alternatives considered**: keep the category's `cut_value` and only force
the mode. Valid to the engine, but it leaves a meaningless `20` sitting in a
field the UI renders, and it makes the store's team events differ from the
ledger's in a way that would have to be explained on every future comparison.

---

## D4 — B8's residual, and the assertion that depends on it

**Decision**: measure it. Do not tune toward 52, and do not inherit 53 as a
prediction — re-run it against this feature's code and pin whatever it
returns. Then attribute the gap by the same isolation method
`parity-exceptions.md` used for B4 and B6: hold the config fixed, swap one
per-competition default at a time, and record which one closes the distance.

The result decides one line of the suite. `appPathParity.test.ts:216` asserts
that every exception's `closedBy` contains the literal `004 US4`. That
assertion was written when all four exceptions were US4's. If B8's residual
is attributable to the staging or `strips_allocated` defaults, it stays US4's
and the line stands. If it is attributable to something else, the honest move
is to weaken that assertion to "names a closing feature" and say in
`parity-exceptions.md` that the residual is unattributed — not to write a
`closedBy` string that makes the assertion pass.

**Rationale**: 006 recorded the 53 as measured and the residual as
*deliberately* unexplained. Predicting it now would repeat exactly the failure
mode the project's parity record exists to prevent — a plausible number
accepted without measurement.

---

## D5 — What the live driver has to prove

**Decision**: `scripts/smoke.mjs` gains one step — apply a team-bearing
template, auto-schedule, assert a measured placed count — and keeps every step
it has. Repaired in place, with the measured number and the date in a comment
beside it.

**Rationale**: constitution VI. Four of the ten shipped templates
(`NAC Cadet/Junior`, `NAC Div1/Junior`, `NAC Vet/Div1/Junior`,
`Junior Olympics`) go from an empty board to a real schedule, which is as
user-visible as a change gets. The driver's current template step uses
`ROC Div1A/Vet` — Div1A individual plus Veteran combined, no team events at
all — so today's SMOKE PASS proves nothing about this defect and would not
have caught it. `NAC Cadet/Junior` is the smallest team-bearing template (24
events, two categories) and is one of the two that actually fails today
(Cadet's category default is a 20% cut).

The boot assertion stays at 24: B1 is the boot preset, its team events are
Veteran, and Veteran already defaults to all-advance — so this feature must
not move it, and the existing assertion is a regression guard on exactly that.

**Alternatives considered**: swap the ROC template step for a team-bearing one.
Rejected — the ROC numbers were re-measured by 006 against the running app and
are the record of that work. Adding a step keeps both.

---

## D6 — The backlog section this feature closes is not on `main`

**Decision**: close it anyway, in the form 006 used for §Day-axis parity, and
state the conflict in the handoff instead of avoiding it.

**Rationale**: §Team events block their whole tournament was written by 006
onto the `004-p3-workbench-shell` branch, where 004's S6 session is live now.
This feature branches from `main`, which does not carry it. Every option has a
cost:

- *Close it on this branch* — the section appears in this branch's
  `backlog.md` in closed form, and `git merge` conflicts on that region against
  004's open form. One conflict, in Markdown, with an obvious resolution
  (keep this branch's closed form), and the record is complete on whichever
  branch a reader opens.
- *Leave it and hand the user an edit to apply after both merge.* No conflict,
  and the backlog is wrong in the window between the two merges, with the
  correction depending on someone remembering to make it.
- *Branch from `004-p3-workbench-shell` instead.* Would drag S6's in-flight
  work into this feature's diff. Rejected on sight.

The first is chosen: a predicted conflict that is written down is cheaper than
an unwritten obligation.

---

## D7 — Git flow

**Decision**: worktree flow, per the constitution's Git Ownership table.
`.claude/worktrees/008-team-event-cut` on branch `008-team-event-cut`, created
off `main`. Subagents commit to that branch at the checkpoints `tasks.md`
marks. The user lands it with `git merge --no-ff --no-commit` completed by
`commit-with-costs`.

**Rationale**: 004's S6 is running concurrently in
`.claude/worktrees/004-p3-workbench-shell`, and both branches edit
`src/store/store.ts` — S6 in the UI slice, this feature in the
competition-default helper. Separate worktrees keep the two working trees from
colliding; the file-level merge conflict, if any, is the user's to reconcile
at merge time and is stated in the handoff.

One operational note carried from the dispatch: **never `git stash` bare**.
The stash stack is shared across worktrees and another session is live. Use a
WIP commit on this branch, or `git stash push -u -m "<unique-tag>"` followed by
`git stash apply <sha>`.
