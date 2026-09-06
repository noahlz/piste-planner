# Research: 012 — the suggested strip count is one a venue can supply

Eight decisions. `[M]` measured by running code, `[R]` read from source at
`670c4da36e`.

---

## D1 — The search lives in a new leaf module, not in `analysis.ts`

**Decision**: a new `src/engine/stripSearch.ts` holds the floor-then-scan search.
Nothing inside `src/engine/` imports it; its only consumer is the store.

**Rationale**: the search must call `scheduleAll`. Putting it in `analysis.ts`
would make `analysis.ts` import `concurrentScheduler.ts`, and `[R]`
`concurrentScheduler.ts:68` already imports `stripBudget.ts`, which `[R]` at
`stripBudget.ts:13` imports `analysis.ts`. That closes a **three-module** cycle
where today there is a two-module one, and the existing two-module cycle is
already an open backlog item warning that it is fragile in a silent way. A leaf
module imports downward only — `concurrentScheduler.ts`, `capacity.ts`,
`analysis.ts` — and is imported by nothing in the engine, so it cannot participate
in a cycle at all.

**Alternatives rejected**:

- *Extend `suggestStripCount` in `analysis.ts`.* Closes the three-way cycle
  above, and conflates a pure arithmetic rule with a search that runs the
  scheduler — two different cost budgets in one function.
- *Put the search in the store.* It is domain math over engine types, which
  constitution I places in the engine. 011's US2 moved a rule out of the store
  for exactly this reason and this feature must not move one back.

---

## D2 — The tournament's aggregate strip-hours gets one home

**Decision**: extract the summation `[R]` `validation.ts:355-362` performs inline
into a named function in `src/engine/capacity.ts`, beside
`estimateCompetitionStripHours`. `validateFeasibility` and the floor both call
it.

**Rationale**: the floor is that sum divided by available hours. Computing it a
second time in `stripSearch.ts` would put two copies of one fact in the codebase,
which constitution §Planning Artifacts prohibits and which is the exact defect
011's FR-008 existed to remove. `[R]` `capacity.ts` already owns
`estimateCompetitionStripHours` and `dayConsumedCapacity`, so the aggregate
belongs there and nowhere else.

**The filter is part of the fact**: `[R]` `validation.ts:358` skips competitions
outside `MIN_FENCERS`–`MAX_FENCERS`. The extracted function keeps that filter, so
the floor and the feasibility warning describe the same board. Dropping it would
make the floor disagree with the warning printed beside it.

**Alternatives rejected**:

- *Compute the sum independently in `stripSearch.ts`.* Two homes for one fact,
  and the two would drift the first time the filter or the estimator changed.
- *Have `stripSearch.ts` call `validateFeasibility` and parse its message.*
  Message-text coupling, which is already an open backlog item from two features.

---

## D3 — The scan is bounded by the concurrency ceiling, and reports absence

**Decision**: candidates run from the floor upward to the busiest-day concurrency
figure inclusive. The iteration count is `ceiling - floor + 1`, known before the
loop starts. Three terminal outcomes:

| Condition | Outcome |
|---|---|
| A candidate places every event | return it — the smallest working count |
| The ceiling is reached with no candidate placing every event | return the absence of an answer |
| The floor exceeds the ceiling | fail loudly |

**Rationale**: constitution IV requires every loop be a direct computation or
carry an explicit max-iteration guard that fails loudly. A range whose length is
computed before entry satisfies the first form. The ceiling is a defensible upper
bound rather than an arbitrary one: `[R]` `analysis.ts:42` sizes for every pool
of the busiest day running at once, so a board that cannot be placed there will
not be placed by adding strips.

**Floor above ceiling should be impossible** — the ceiling sizes for peak
concurrency and the floor for aggregate demand over the whole tournament. It is
not proven impossible, so it fails loudly rather than silently scanning a
backwards range and returning the absence of an answer, which would look like an
ordinary "no count found" and hide an arithmetic contradiction.

**Absence is not zero**: 011's FR-010 established this distinction and `[R]`
`store.ts:246` implements it — a `null` suggestion leaves the strip field
untouched. The search extends it: no working count found is also `null`, and also
leaves the field alone. `[M]` no template in the ten needs it, since all ten
resolve inside their range.

**Alternatives rejected**:

- *Bisection between floor and ceiling.* ~9 runs instead of ~30 `[M]`, but
  correct only if placement is monotonic in strip count. `[M]` monotonicity held
  at every sampled point on all ten templates and was **not proven**. Bisection's
  failure mode is a silently-too-high answer, which is the defect this feature
  exists to remove. The scan is correct without the assumption.
- *An arbitrary iteration cap such as 1000.* The range is already finite; a
  second cap would be a number with no meaning that fires before the real bound.

---

## D4 — The post-schedule recommendation reports no strip count at all

**Decision**: `recommendStripCount` (`stripBudget.ts:52`) is removed as a
user-facing number. The post-schedule finding it feeds reports the four ordered
levers and nothing else. No strip count of its own.

**Rationale**: three candidates existed and all three are barred.

| Candidate | Barred by |
|---|---|
| The search's answer | It runs inside `scheduleAll` (`concurrentScheduler.ts:1466`) — calling the search there recurses, and FR-011 forbids the cost regardless |
| The concurrency ceiling | FR-005 — it must reach no user-visible surface, and this finding is one |
| The strip-hours floor | **011's `research.md` D4**, which rejected dividing total strip-hours by day length as "double-stripping in disguise — it lets a pool round run on fewer strips for longer" |

That last row is the one worth stating carefully, because this feature uses the
floor elsewhere and the distinction is what makes both uses legitimate.

**The floor as a scan start is not the rejected idea.** 011 rejected it as *an
answer given to an organizer*, where it implies a pool round can be run on fewer
strips over more hours — the ad-hoc double-stripping practice that
`docs/design/backlog.md` records as never a planned input, and that the averaged
pool durations already absorb. Used as the first candidate of a search that
climbs away from it, the floor makes no claim at all: `[M]` it undershoots the
true answer by 25–50% on the five largest templates, the search knows this, and
the number never leaves the engine. Nothing is told to anyone.

**Reporting it would have been the rejected idea.** "At least 66 strips" on a
board that truly needs 96 anchors an organizer on 66. The softer wording does not
remove the implication; it only makes it harder to notice.

**Nothing is lost by reporting no number.** `[R]` `validation.ts:371-378` already
prints the shortfall arithmetic — strip-hours needed, available, and "Add N more
day(s) OR M more strip(s)" — and 011's FR-001/FR-002 pin that message unchanged.
That framing is a *shortfall against a stated configuration*, not a claim about
the minimum a pool round needs, which is why it survives where a recommendation
does not. The organizer keeps every figure they have today and gains the ordered
levers.

**Consequence for FR-016**: the reversal of 011's FR-008 is cleaner than first
planned. FR-008 merged two implementations of one rule to remove a duplicate.
Rather than re-splitting them into two rules, one of the two ceases to exist. The
Suggest button's search is the only strip-count rule in the product, so there is
no duplicate to reintroduce.

**Alternatives rejected**:

- *Keep `recommendStripCount` returning the ceiling and hide it from the UI only.*
  A function whose only consumer is a snapshot, computing a number the product
  has decided is wrong. Dead weight that reads as live.
- *Report a range, floor to ceiling.* Two numbers, one too low and one absurd,
  presented as though the truth were uniformly distributed between them. `[M]`
  the range is 66–268 on the largest template, against a true answer of 96.

## D5 — The scan yields between candidates, or the indicator cannot paint

**Decision**: the search yields to the browser between candidates. The store
action that drives it is asynchronous.

**Rationale**: this is the decision most likely to be missed, because it is
invisible in the engine and fatal in the UI. `[M]` a single scheduler run is
0.6–12ms and a worst-case scan is ~350ms. Run synchronously, those 350ms occupy
the main thread in one block: React cannot paint, so the indicator FR-008
requires would not appear until after the scan it exists to cover had already
finished. A show-after-delay reveal is unimplementable inside a synchronous
block, because nothing can observe the delay elapsing.

Yielding between candidates is cheap and natural — the loop already has a
per-candidate boundary, and each candidate is a single-digit number of
milliseconds, so the browser gets a turn roughly every 10ms. Rendering stays
responsive and the reveal delay can be measured honestly.

The engine half stays pure: `stripSearch.ts` exposes the search as a bounded
sequence of candidate evaluations, and the yielding belongs to the caller that
drives it. Constitution I is not weakened — no React import and no store read
enters the engine.

**Alternatives rejected**:

- *Run the scan synchronously and drop the indicator.* A 350ms freeze on every
  press, and FR-008 exists because the product owner asked for the indicator.
- *A Web Worker.* Correct and much larger: the engine and its config would need a
  serialization boundary. Reconsider if a search ever reaches seconds.
- *Chunk by wall-clock budget rather than per candidate.* More machinery for the
  same result at this scale, since candidates are already ~10ms.

---

## D6 — The lever advice is one finding, ordered, and computes nothing

**Decision**: the four levers are reported by `postScheduleDiagnostics`
(`concurrentScheduler.ts:1438`) in the fixed order **days, flighting, entry caps,
strips**, from arithmetic already available at that point.

**Rationale**: FR-011 forbids running the scheduler, which is not merely a budget
here but a structural necessity — the code sits inside `scheduleAll` and calling
it would recurse. FR-013 keeps the figures the feasibility finding already
computes; `[R]` `validation.ts:371-378` derives the day and strip equivalents by
division, at no scheduling cost.

The order is the product owner's, given 2026-09-06 and recorded in
[spec.md](./spec.md) FR-012: strips come last because strips mean renting more of
the facility. `[M]` the ordering is also what the measurement supports — the
largest template places 45 of 66 events at 80 strips on three days and **all 66
at the same 80 strips on four**, so days are a stronger lever than strips on the
board where it matters most.

**Entry caps are named, not modelled** (FR-014). The application has no per-event
cap; `[R]` `MAX_FENCERS = 500` (`constants.ts:91`) is a structural bound enforced
at `validation.ts:151`, not a planning input. Naming a lever the app cannot apply
is a deliberate asymmetry, recorded in `docs/design/backlog.md` with what it
costs.

---

## D7 — The ledger's `stripRecommendation` moves on all eight scenarios

**Decision**: the movement is expected, is reviewed scenario by scenario, and the
task that causes it records all eight before-and-after values in its commit
message. No scheduled event count may fall.

**Rationale**: `[R]` `driftLedger.test.ts:210` snapshots
`recommendStripCount(...)` as `stripRecommendation`. D4 removes that function as
a user-facing rule, so the field must be re-pointed or removed.

**Decision within the decision**: re-point it at the search, not remove it.
Removing it would drop drift coverage on the one strip number the product still
shows. Pointing it at the search keeps the ledger watching what users see, at a
measured cost of roughly two seconds added to the ledger test `[M]` (eight
scenarios × ~30 candidates × ~7ms). Every scenario's recorded value moves — from
the concurrency ceiling to the searched minimum — and constitution III requires
each movement be explained rather than accepted.

**This is the trap 011 fell into and named.** Its `research.md` D6 reasoned that
the ledger contains no reference to any suggestion function and therefore could
not move; `[R]` line 210 is exactly such a reference, and 011's `handoff.md` §8
records the correction. The lesson it drew — the fixtures and the digest are
separate surfaces and each must be read separately — is why this decision exists
in advance rather than as a surprise mid-task.

**The distinction that keeps this safe**: `stripRecommendation` is *recorded* by
the ledger and *consumed* by nothing. No scenario's strip count comes from it, so
scheduled counts have no path to move. A scheduled count that moves anyway is a
signal that something unexamined reads the recommendation, and halts the task.

---

## D8 — Worktree flow

**Decision**: worktree flow, per constitution §Git Ownership. A fresh worktree at
`/Users/noahlz/projects/piste-planner-012-actionable-strip-suggestion` on branch
`012-actionable-strip-suggestion`, branched from `main` at `670c4da36e`.

**Rationale**: the feature has drift to record across eight scenarios and a
deliberate reversal of a prior feature's requirement. Those belong in commit
messages written as the work happens, which the worktree flow permits and the
root flow does not. It also matches 011, whose record this feature builds on
directly.

**The branch does not land itself.** The user runs
`git merge --no-ff --no-commit` and completes it with `commit-with-costs`, and
the merged tree runs `tsc -b`, `lint` and the full suite **before** that merge
commit is written (constitution §The merge is gated, not just the branch).

**One collision is predicted, and is written as a task rather than only as
prose**, per the same section. `docs/design/backlog.md` is modified on `main` by
this session with six new items; if any other branch edits that file the merge
conflicts there. It is documentation, so the resolution is a union of both sets
of items, but the merge task names it so nobody resolves it by picking a side.
