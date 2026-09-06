# Research: Wave 1 — the seven independent reconciliation fixes

Decisions taken before implementation, each with the alternative that was
rejected. The reconciliation document
([`docs/design/methodology-reconciliation.md`](../../docs/design/methodology-reconciliation.md))
is the source; these are the places where building it required a choice it did
not make, or where following its wording literally would have done harm.

---

## D1 — R7 reports, and does not write `constraint_relaxation_level`

**Decision**: the DSatur fallback's hard-edge violations are reported as WARN
bottlenecks naming both competitions. `constraint_relaxation_level` keeps its
current writer (`dayColoring.ts:558-561`, the `INDIV_TEAM_RELAXABLE_BLOCKS`
path) and its current meaning.

**Rejected**: R7's own wording, "set `constraint_relaxation_level` accordingly".

**Why**: `__tests__/engine/integration.test.ts:71` and `:100` skip their
separation assertions for any event at level ≥ 3:

```
if (sr1.constraint_relaxation_level >= 3 || sr2.constraint_relaxation_level >= 3) continue
```

Writing level 3 onto an event that broke a hard edge would silence exactly the
assertion that exists to catch a broken hard edge. The audit's finding is that
the violation is invisible; following its wording would make it invisible in a
second place. The same file at `:146-150` requires a `CONSTRAINT_RELAXED`
bottleneck for every event above level 0, so the field is not free to reuse.

**Consequence**: `warnCountsByCause` is part of the drift-ledger digest, so a new
WARN cause appears in the snapshot wherever the fallback fires. That is the
reviewable record, and it costs nothing that the digest's
`constraint_relaxation_level` field would have bought.

**Cause to use**: `BottleneckCause.UNAVOIDABLE_CROSSOVER_CONFLICT`, which already
exists (`src/engine/types.ts:116`) and means precisely this. No new enum member.

---

## D2 — R2's per-event set is an explicit rule-id list

**Decision**: an explicit set of five rule ids — `fencer-count-bounds`,
`cut-value-range`, `cut-value-min-promotions`, `de-duration-table-missing-entry`,
`video-r16-strip-shortfall` — defined next to the gate that reads it.

**Rejected**: branching on `kind === RuleKind.STRUCTURAL`, or on whether a
finding's `subjects` resolve to competition ids.

**Why**: `duplicate-competition-id` is structural and its subjects *are*
competition ids, and excluding them is the one thing that must not happen — a
schedule keyed by id cannot be built from a set with duplicates in it, and
dropping both copies discards a real event to fix a naming problem.
`strips-total-positive` is structural with a field name in `subjects`. Both
inference rules admit these; the list does not. The audit's §1.2.5 table
already enumerates the rules by hand, which is the same admission.

---

## D3 — R2 excludes in one pass, and does not re-validate

**Decision**: findings are computed once over the full competition set. If every
ERROR is on the D2 list, the named competitions are removed and the remainder is
scheduled. No second `validateConfig` call over the reduced set.

**Rejected**: exclude, re-validate, and repeat until the finding set is stable.

**Why**: global findings — `feasibility-strip-hours` above all — are sums over
the competition set, so removing events changes them. A re-validating loop would
turn a config that fails feasibility with 24 events into one that passes with 23,
which is a scheduling *decision* dressed as validation, and it is Wave 3's
question (R5 demotes feasibility to WARN, which dissolves the case). A single
pass is bounded by construction and its behavior is one sentence long.

**Consequence**: a tournament with both a per-event finding and a global one is
still rejected whole. That is today's behavior, unchanged, and it is what
FR-008 pins.

---

## D4 — R3 mirrors the regional-cut pattern, on both halves

**Decision**: `buildConfig` coerces a TEAM competition's `cut_mode` to `DISABLED`
in the same loop shape it already uses for `REGIONAL_CUT_OVERRIDES`
(`src/store/buildConfig.ts:193-202`), and `validation.ts`'s `cut-on-team` finding
becomes a `notice` rather than a `policy` — the same pairing
`regional-cut-override` already has.

**Rejected**: coercing inside the engine, at `scheduleAllConcurrent`'s entry.

**Why**: the engine's arithmetic already ignores the field.
`computeDeFencerCount` returns the raw count for `EventType.TEAM` before it looks
at `cut_mode` at all (`src/engine/pools.ts:141`), and every bracket, duration and
strip figure derives from that. So an engine-side coercion would change no
number; it would only hide from a direct caller that its input was wrong. The
notice says it instead, and `buildConfig` fixes the one path where the value is
stored and shown to a user.

**Consequence**: R3 is expected to move no drift at all — the ledger's factory
(`__tests__/helpers/scenarios.ts`) does not route through `buildConfig`, and the
engine's math never read the field. If the ledger moves, something in this
reasoning is wrong and the task halts.

---

## D5 — L9 removes the edge and invents no bonus

**Decision**: `CROSSOVER_GRAPH[Y8]` becomes `{}`, with a comment citing
METHODOLOGY:118 and the already-correct comment at `constants.ts:452`.

**Rejected**: giving Y8↔Y10 a negative weight so that sharing a day scores a
bonus.

**Why**: `colorPenalty` sums edge weights for same-colored neighbours, so a
negative weight would mechanically work. But METHODOLOGY states the preference
("CAN and SHOULD") and states no magnitude for it, and §1.2.7 of the audit is an
argument against exactly this — fourteen of nineteen weights specify a value for
a mechanism that does not exist, and adding a fifteenth invented number is the
habit the audit is trying to break. Removing the penalty makes "CAN" true. "SHOULD"
goes on the backlog with its provenance.

**Consequence to review, not to avoid**: `buildPenaltyMatrix` derives two-hop
edges from direct ones (`src/engine/crossover.ts:36-49`), and Y8→Y10 is Y8's only
direct edge. Removing it drops Y8↔Y12 from 0.3 to 0.0 as well. The drift review
for this task names both changes or it is incomplete.

---

## D6 — L3 is checked after Group 1 and before the penalty matrix

**Decision**: in `crossoverPenalty`, the `SOFT_SEPARATION_PAIRS` lookup sits
after `isGroup1Mandatory` and before the `PENALTY_MATRIX` lookup.

**Rejected**: folding the three pairs into `CROSSOVER_GRAPH` as ordinary edges.

**Why**: order first. None of the three pairs is in `GROUP_1_MANDATORY`
(`constants.ts:456-463`), so placing the lookup after it changes nothing about
which pairs are hard — it only guarantees that a future Group 1 addition still
wins. Placing it before `PENALTY_MATRIX` is what makes it an override rather than
a suggestion, which is the point: DIV1↔CADET has a matrix value of 0.8 today and
the specification says 5.0.

Folding them into `CROSSOVER_GRAPH` was rejected because the graph's documented
meaning is "fraction of fencers in category A who also compete in B", capped at
0.8 (`constants.ts:412`), and 5.0 is not a fraction. It would also feed the
two-hop derivation, inventing indirect edges from a policy number.

**Consequence**: three values change at once — 0.8→5.0, 0.0→3.0, 0.0→3.0 — and
5.0 is six times the largest weight the coloring has ever seen. This is the
wave's largest expected drift and §Recommended sequence puts it last for that
reason.

---

## D7 — L1 keeps the rest-day check at a gap of exactly one

**Decision**: the adjacent-day block in `colorPenalty` splits into a gap-of-1
branch (rest-day check plus `PROXIMITY_1_DAY`) and a gap-of-3-or-more branch
(`PROXIMITY_3_PLUS_DAYS`). A gap of 2 gets neither.

**Rejected**: applying the rest-day penalty at every gap.

**Why**: a rest-day violation *is* the claim that two events are too close, which
is a statement about adjacency and nothing else. `isRestDayPair`
(`dayColoring.ts:137`) has no gap parameter and its callers have always passed
adjacency. Widening it would be a second, unrequested behavior change riding on
L1's diff, and it would be invisible in the review because both changes move the
same numbers.

**On the three-day clamp**: the dead `proximityPenalty` in `crossover.ts:176-205`
clamps the gap at 3 before its table lookup, and `PROXIMITY_PENALTY_WEIGHTS`
(`constants.ts:496`) is keyed by clamped gap. The live path in `dayColoring.ts`
does not use that table — it reads `PENALTY_WEIGHTS.PROXIMITY_1_DAY` directly —
so L1 adds a single `PENALTY_WEIGHTS.PROXIMITY_3_PLUS_DAYS` term and does not
adopt the dead function's table. Unifying the two is Wave 2's removal work.

---

## D8 — Verification order, and what a drift review has to contain

**Decision**: every task that touches engine math or constants runs
`__tests__/engine/driftLedger.test.ts` before and after, and its commit message
carries:

1. The scheduled count per scenario, before and after, for all eight.
2. Which snapshot fields moved, by name, and for which scenarios.
3. A sentence per moved field saying which line of the change produced it.
4. An explicit statement when nothing moved.

A count below `SCHEDULED_FLOORS` halts the task. Raising a floor is allowed only
when the change improves packing and the commit says so; lowering one is the
regression the gate exists to catch.

**Why the per-item commits**: the seven items are independent, so a single
combined diff would be unattributable — the audit's own §2.1 records that
sequential refactors compound drift no single diff reveals, and the constitution
III text says the same. One item per commit is what makes "which line produced
this" answerable.
