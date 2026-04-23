# Capacity-Relative Saber Pileup Penalty

**Status:** Design approved, awaiting implementation plan.
**Supersedes:** The bucketed `SABER_PILEUP_PENALTY_TABLE` introduced alongside refs-as-output.
**Related:** `.claude/plans/scheduling-density-followups.md` item #1.

## Problem

The current saber pileup penalty in `src/engine/dayAssignment.ts` counts
*how many other saber events* are on a candidate day and looks up a penalty
from a fixed table:

```ts
export const SABER_PILEUP_PENALTY_TABLE = [0, 0.5, 2.0, 10.0, 50.0] as const
```

This ignores event size. Six saber events with 10 entrants each impose
roughly the same ref/strip demand as one mid-sized saber event — but the
table treats the six-event day as catastrophic (50.0 penalty) and the
one-event day as free (0).

The mis-model caused B4's scheduling density to regress from 9 → 6
scheduled events after refs-as-output landed. B4 has 10 saber events over
3 days, so by pigeonhole at least one day always has ≥4 saber events and
always pays the 50.0 floor — the penalty stops discriminating between good
and bad placements at the high end and just taxes every valid coloring.

## Goals

1. Recover B4 to ≥ 9 scheduled events (pre-refs-as-output baseline).
2. Hold B1, B2, B3, B5, B6, B7 at or above their current scheduled counts:
   13, 9, 6, 3, 18, 4.
3. Replace the bucketed table with a model whose inputs reflect real
   ref/strip load, so the next round of density tuning has a sound base.

## Non-goals

- Moving the penalty inside the `loadBalance` gate. It stays always-on.
- Modeling DE-phase ref demand. The penalty covers pool-round concurrency
  only — DE refs are lighter and less bursty.
- Tuning other penalty weights (`LOAD_BALANCE_FULLNESS`, proximity, rest-
  day, etc.).
- Changing the call site in `dayColoring.ts` beyond passing `config`
  through.

## Design

### Formula

For a candidate day `c` and competition `E`:

```
if E.weapon !== SABRE:
    penalty = 0

else:
    S_day = sum over every saber competition S_i assigned to day c
            (including E itself) of:
                S_i.strips_allocated × SABRE_POOL_ROUND_MINS
    day_saber_capacity = config.strips_total × SABRE_POOL_ROUND_MINS
    penalty = K_SABER_PILEUP × (S_day / max(day_saber_capacity, 1))^2
```

- `SABRE_POOL_ROUND_MINS` = 75, read from the existing
  `DEFAULT_POOL_ROUND_DURATION_TABLE[SABRE]` in `src/engine/constants.ts`.
- `K_SABER_PILEUP` = 50 initially. Calibrated so a single day absorbing
  an entire tournament's saber pool-round demand (S_day ≈
  day_saber_capacity) matches the old table's 50.0 maximum.

### Self-inclusion rationale

The current function excludes the competition being evaluated. That was
sensible when every saber event contributed weight 1 — "how many others
are already there?" But with size-weighting, excluding self makes a
placement of a 200-fencer saber event look identical to a 20-fencer saber
event on any given day, which defeats the purpose. Including self means a
big event feels a stronger pull toward a lightly-loaded day.

### Calibration sanity check (B4)

- B4: 10 saber events, ~4 strips each (rough average), 3-day window.
- Total saber pool-round demand = 10 × 4 × 75 = 3000 strip-minutes.
- `day_saber_capacity` = 40 strips × 75 = 3000 strip-minutes.
- Evenly distributed (3–4–3 split): worst day carries ~1200 strip-min.
  Penalty = 50 × (1200/3000)^2 = 8.0. Moderate pressure.
- One day grabs all 10: S_day = 3000. Penalty = 50 × 1.0 = 50. Maxes out.
- Any day with zero saber events: 0.

Edge case — first saber event on an otherwise-empty day: a 4-strip event
on a 40-strip day contributes `(4/40)^2 × 50 = 0.5`. Negligible;
doesn't over-discourage the initial placement.

### Signature change

```ts
// before
function saberPileupPenalty(
  competition: Competition,
  candidateDay: number,
  assignments: Map<string, number>,
  allCompetitions: Competition[],
): number

// after
function saberPileupPenalty(
  competition: Competition,
  candidateDay: number,
  assignments: Map<string, number>,
  allCompetitions: Competition[],
  config: TournamentConfig,
): number
```

`dayColoring.ts:236` passes `config` through (already in scope there).

## Files touched

- `src/engine/dayAssignment.ts` — delete `SABER_PILEUP_PENALTY_TABLE`,
  add `K_SABER_PILEUP` constant, rewrite `saberPileupPenalty`.
- `src/engine/dayColoring.ts:236` — pass `config` to penalty call.
- `__tests__/engine/dayAssignment.test.ts` — rewrite the
  `saberPileupPenalty` describe block. Remove index-based bucket
  assertions; add three shape-preserving cases:
  1. Non-saber competition → 0 (unchanged).
  2. Saber event on a day with no other saber load → small positive
     (just this event's contribution).
  3. Saber event on a day that would saturate `day_saber_capacity` → close
     to `K_SABER_PILEUP` (50), within numeric tolerance.
  4. Monotonicity: doubling `strips_allocated` on the target day increases
     the penalty.
- `__tests__/engine/integration.test.ts:301-303` — set B4 threshold to
  ≥ 9. If the implementation lands B4 below 9, iterate on
  `K_SABER_PILEUP` per the Risks section before lowering the threshold.
- `METHODOLOGY.md` — rewrite §Saber Pileup: describe the capacity-
  relative model, drop the table reference.
- `.claude/plans/scheduling-density-followups.md` — mark item #1
  resolved, update the B-scenario table with post-change numbers.

## Acceptance criteria

1. `pnpm test` — all passing.
2. B1 ≥ 13, B2 ≥ 9, B3 ≥ 6, B4 ≥ 9, B5 ≥ 3, B6 ≥ 18, B7 ≥ 4 (measured
   from integration tests).
3. No new TypeScript errors.
4. `saberPileupPenalty` unit tests cover: non-saber (0), empty-day
   placement, saturated-day placement, monotonicity.

## Risks and mitigations

- **Calibration miss.** If K = 50 doesn't land B4 ≥ 9 without regressing
  others, iterate before widening scope. Try K ∈ {25, 75, 100}. Record
  B1–B7 counts at each. If no value in that range satisfies all seven,
  the model is wrong — not the constant — and we return to brainstorming.
- **Self-inclusion surprise.** The first-saber-on-empty-day case
  contributes a small non-zero penalty (~0.5 for a typical 4-strip
  event). If integration tests show first-placements getting pushed to
  worse days than they should, consider a `max(0, S_day − single-event
  self-weight)` threshold. Defer until a failure shows up.
- **B4 does not recover at all.** If B4 stays at 6 regardless of K, the
  bottleneck isn't saber pileup — it's genuine strip-hour capacity or a
  different phase. In that case document the finding, revert, and move
  item #1 in the followups plan to "investigated, not actionable."

## Out of scope / follow-ups

- `dayColoring.ts` load-balance gating revisions (item #5 in the plan).
- B5/B7 config right-sizing (items #2–#3 in the plan).
- Interval-list strip allocation (item #6).
