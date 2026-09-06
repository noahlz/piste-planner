# Data Model: 012

No stored entity changes. No new store field, no serialization change, no
shared-URL key. This feature adds four **quantities** and changes what one
existing function returns.

---

## The four quantities

| Quantity | What it is | Depends on a scheduling result? | Reaches a user? |
|---|---|---|---|
| **Aggregate strip-hours** | Total fencing work the board contains | no | indirectly, via the feasibility figures |
| **Strip-hours floor** | Smallest strip count at which the work can possibly fit | no | **never** (FR-017) |
| **Concurrency ceiling** | Strip count at which every pool of the busiest day runs at once | no | **never** (FR-005) |
| **Smallest working count** | Smallest strip count that places every event | **yes** | yes — the **Suggest** button |

They stand in a fixed relationship:

```text
floor  ≤  smallest working count  ≤  ceiling
```

`[M]` measured at days=4, the relationship holds on all ten templates with room
on both sides. The floor undershoots by 25–50% and the ceiling overshoots by
1.53×–3.29×, which is why neither is the answer and why the answer needs a
search:

| Template | Floor | Smallest working | Ceiling |
|---|---:|---:|---:|
| NAC Youth | 53 | **76** | 197 |
| NAC Cadet/Junior | 38 | **48** | 144 |
| NAC Vet/Div1/Junior | 66 | **96** | 268 |
| ROC Mega | 32 | **48** | 158 |
| Junior Olympics | 37 | **49** | 135 |

---

## Aggregate strip-hours

**What it is**: the sum of `estimateCompetitionStripHours(...).total_strip_hours`
over every competition whose fencer count lies within `MIN_FENCERS`–`MAX_FENCERS`.

**Where it lives** (D2): `src/engine/capacity.ts`, beside
`estimateCompetitionStripHours`.

**Who reads it**: `validateFeasibility` (`validation.ts`), which computes it
inline today, and the floor. Exactly two readers, one definition.

**The fencer-count filter is part of the definition, not an optimisation.**
`[R]` `validation.ts:358` skips out-of-range competitions. If the floor omitted
that filter it would describe a different board from the warning printed beside
it, and the two numbers would disagree for a reason no reader could see.

---

## Strip-hours floor

**Definition**: aggregate strip-hours ÷ (`days_available` × day length in hours).
Rounded up.

**What it means**: below this count the work cannot fit, however the schedule is
arranged. Necessary, never sufficient.

**Who reads it**: the search, as its starting candidate. That is the only reader.

**Never shown to a user** (FR-017, [research.md D4](./research.md)). `[M]` it
undershoots the smallest working count by 25–50% on the five largest templates,
so presenting it would replace one wrong number with another. Worse, it would
replace it with a *specific* wrong claim: that a pool round can run on fewer
strips over more hours, which is the ad-hoc double-stripping practice this
project does not model and which 011's own research rejected by name.

Starting a search there makes no such claim. The floor is where the counting
begins, not an answer, and it never leaves the engine.

---

## Concurrency ceiling

**Definition**: unchanged from `suggestStripCount` (`analysis.ts:42`) — the
busiest day's summed pool demand divided by the pool phase's share of the venue,
with events spread across days by longest-processing-time greedy.

**What changes**: nothing about the computation. Only its audience. Before this
feature it was the suggestion; after it, it is the search's terminating bound and
appears in no user-visible surface (FR-005).

**Why it survives at all**: a board that cannot be placed with every pool running
concurrently will not be placed by adding strips, so it is a defensible upper
bound rather than an arbitrary iteration cap (D3).

---

## Smallest working count

**Definition**: the smallest strip count in `[floor, ceiling]` at which every
event on the board is placed.

**Placed** means a schedule entry with a non-null `pool_start` — the rule
`[R]` `runActions.ts:31` already uses. The search and the app must agree on what
counts as placed, or the button will report success on a board the app draws as
incomplete.

**Three outcomes**, and they are distinguishable:

| Outcome | Meaning | What the app does |
|---|---|---|
| A count | The smallest that works | Write it into the strip field |
| Absence of an answer | No count in range places every event | Leave the strip field untouched |
| Loud failure | Floor exceeds ceiling — an arithmetic contradiction | Fail, do not degrade to "no answer" |

The middle row extends 011's FR-010 convention that absence is not zero. `[R]`
`store.ts:246` already leaves the field alone on a `null` suggestion, so the
existing behaviour covers the new case unchanged.

---

## What the post-schedule finding reports

| | Before | After |
|---|---|---|
| Strip count | Concurrency ceiling, as "Strips: need N, have M" | **none** |
| Levers | none | four, ordered: days, flighting, entry caps, strips |
| Shortfall figures | from the feasibility warning, unchanged | from the feasibility warning, unchanged |

`recommendStripCount` ceases to exist as a user-facing rule. All three numbers it
could have reported are barred — the searched answer by recursion and cost, the
ceiling by FR-005, the floor by FR-017 — so the finding reports no count of its
own ([research.md D4](./research.md)).

**Nothing is lost.** `[R]` `validation.ts:371-378` already prints strip-hours
needed, strip-hours available, and "Add N more day(s) OR M more strip(s)", and
011's FR-001/FR-002 pin that message unchanged. That is a shortfall against a
stated configuration, not a claim about the minimum a pool round needs — which is
exactly why it survives where a recommendation does not.

**Two call sites move**: `concurrentScheduler.ts:1466` loses its number, and
`driftLedger.test.ts:210` re-points at the search so the ledger keeps watching
the figure users actually see.

---

## The four levers

Not data — an ordered list rendered in one finding. Recorded here because the
order is a requirement (FR-012) and orders are the kind of thing that drift.

| # | Lever | Modelled? |
|---|---|---|
| 1 | Add days | yes |
| 2 | Flight events | yes |
| 3 | Cap entries | **no** — named as prose only (FR-014) |
| 4 | Add strips | yes |

Strips are last because strips mean renting more of the facility. `[M]` the
ordering is what the measurement supports as well as what the product owner
specified: the largest template places 45 of 66 events at 80 strips on three
days and **all 66 at the same 80 strips on four**.
