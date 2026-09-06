# Feature Specification: Wave 1 — the seven independent reconciliation fixes

**Feature Branch**: `010-wave-1-reconciliation`

**Created**: 2026-09-05

**Status**: Draft

**Input**: User description: "Spec and implement Wave 1 (the seven independent
fixes in §Recommended sequence) as a new Spec Kit feature. Constitution III
applies: each item that moves B1–B8 drift gets its diff reviewed before
acceptance."

## Context

[`docs/design/methodology-reconciliation.md`](../../docs/design/methodology-reconciliation.md)
audited METHODOLOGY.md against the engine on 2026-09-05 at `a2dc363e45`, with a
green 67-file / 1799-test suite and a clean `tsc -b`. Every defect it names
survives that suite. Its §Recommended sequence splits the findings into four
waves; **Wave 1 is the seven that need no product-owner decision, touch one file
each, and are independent of one another.**

The reconciliation document is the specification for this feature. It is carried
onto this branch verbatim — this spec restates only what a reader needs to judge
acceptance, and points at the document for the evidence.

Wave 1's seven, in the document's own order:

| # | Item | Site | What it is |
|---|---|---|---|
| 1 | **R1** | `src/engine/validation.ts` | Delete the `indiv-team-same-day` rule |
| 2 | **R7** | `src/engine/dayColoring.ts` | Make the least-bad-color fallback report |
| 3 | **R2** | `src/engine/concurrentScheduler.ts` | Scope per-event structural findings to their subjects |
| 4 | **R3** | `src/store/buildConfig.ts` + `validation.ts` | Coerce `cut-on-team` instead of rejecting |
| 5 | **L1** | `src/engine/dayColoring.ts` | Wire `PROXIMITY_3_PLUS_DAYS` |
| 6 | **L9** | `src/engine/constants.ts` | Remove the Y8→Y10 penalty |
| 7 | **L3** | `src/engine/crossover.ts` | Apply `SOFT_SEPARATION_PAIRS` |

**Part 3 is not answered here.** The document's blocking decision — whether the
eight time-of-day penalty weights get a mechanism (Option A/B) or are retired
(Option C) — is the product owner's, and Wave 1 is unaffected by the answer
either way. Waves 2, 3 and 4 stay unbuilt.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A tournament with a same-category individual/team pair gets a schedule (Priority: P1)

An organizer picks the `NAC Div1/Junior` or `NAC Vet/Div1/Junior` template, sets
any day count, gives the venue any number of strips, and asks for a schedule.
Today the board comes back empty with two errors, at every day count and every
venue size, because `indiv-team-same-day` computes the duration of a day the day
assigner is structurally prevented from producing and finds it 15 minutes over.
After this story the board renders.

**Why this priority**: it is the largest single restoration in the wave —
[§1.2.4](../../docs/design/methodology-reconciliation.md) measures two of ten
templates going from 0 placed to full, and 008's own close-out (T022) recorded
this rule as the reason those two templates stayed at zero after the team-cut
fix landed.

**Independent Test**: apply each of the ten templates through the app's own
configuration path, schedule, and count placed events. The two named templates
must place events where they placed none.

**Acceptance Scenarios**:

1. **Given** the `NAC Div1/Junior` template at the store's default day count and
   a venue with enough strips, **When** the schedule runs, **Then** the returned
   schedule is non-empty and no finding carries the rule id
   `indiv-team-same-day`.
2. **Given** the `NAC Vet/Div1/Junior` template, **When** the schedule runs,
   **Then** the same holds.
3. **Given** any configuration at all, **When** `validateConfig` runs in either
   validation mode, **Then** no finding with rule id `indiv-team-same-day` is
   ever produced, because the rule no longer exists.
4. **Given** the eight B1–B8 reference tournaments, **When** the drift ledger
   runs, **Then** no scenario's scheduled-event count falls below its floor.

---

### User Story 2 - An unsatisfiable day assignment is reported, never silently taken (Priority: P2)

DSatur's no-valid-color fallback picks a "least-bad" day when every day is
blocked. Every candidate scores `Infinity`, so the comparison never improves and
day 0 is taken. When the blocked vertex has no relaxable edge, nothing at all is
recorded: no warning, no error, and `constraint_relaxation_level` stays 0. On the
store's default day count, `NAC Cadet/Junior` places six pairs of events the
specification says can never share a day and reports a clean schedule.

After this story the coloring is unchanged and the report is not: every hard edge
the chosen day breaks is named, with its pair.

**Why this priority**: [§1.2.2](../../docs/design/methodology-reconciliation.md)
calls it the most serious finding in the audit. It is a correctness *report* fix,
not a correctness fix — the wrong schedule is still produced, but it stops
claiming to be right. The repair path that would produce a right one is Wave 3
and needs the Part 3 answer.

**Independent Test**: run `assignDaysByColoring` on a configuration whose hard-
constraint graph needs more days than are available, and assert one reported
violation per broken pair. `NAC Cadet/Junior` at 3 days is such a configuration
and [§1.2.2](../../docs/design/methodology-reconciliation.md) measures it at six.

**Acceptance Scenarios**:

1. **Given** a configuration where two events with a hard edge between them end
   up on the same day, **When** the schedule runs, **Then** a WARN finding names
   both events and says the separation they violate.
2. **Given** a configuration whose hard-constraint graph is satisfiable in the
   days available, **When** the schedule runs, **Then** no such finding appears.
3. **Given** any configuration, **When** the schedule runs, **Then** the day each
   event is assigned is identical to what it was before this story. Reporting is
   additive.
4. **Given** an event that took the fallback, **When** its
   `constraint_relaxation_level` is read, **Then** it is unchanged — see
   [research.md D1](./research.md) for why the document's "set
   `constraint_relaxation_level` accordingly" is deliberately not followed.

---

### User Story 3 - One unschedulable event costs one event, not the tournament (Priority: P2)

A single event with a fencer count of 0, an out-of-range cut value, a bracket
size with no DE duration entry, or too few video strips for its R16 currently
returns an empty schedule for every other event in the tournament. A team event
carrying a percentage cut does the same from any caller that does not go through
the store.

After this story the named event is excluded and reported, and the rest of the
tournament schedules.

**Why this priority**: it is two of the wave's seven (R2 and R3) and shares one
seam — the validation gate at the top of the scheduler. The backlog already
carries "a fencer count of 0 or 1 unmounts the whole app" as a live defect.

**Independent Test**: build a tournament of several valid events plus one event
carrying each per-event defect in turn, schedule, and confirm the valid events
place while the defective one is named in an error and absent from the schedule.

**Acceptance Scenarios**:

1. **Given** a tournament of N valid events plus one event with `fencer_count`
   below the minimum, **When** the schedule runs, **Then** the N valid events are
   scheduled, one ERROR names the invalid event, and the invalid event has no
   entry in the schedule.
2. **Given** the same, for an out-of-range cut value, a missing DE duration table
   entry, and a video R16 strip shortfall, **Then** the same holds for each.
3. **Given** a tournament whose only ERROR is a *global* one — no strips at all,
   duplicate competition ids, or an aggregate feasibility shortfall — **When**
   the schedule runs, **Then** the schedule is empty exactly as it is today. This
   story scopes per-event findings only.
4. **Given** a team event whose stored `cut_mode` is not `DISABLED`, **When** the
   app builds its engine config, **Then** the built competition carries
   `DISABLED`, a notice says the cut was overridden, and the tournament
   schedules.
5. **Given** the same team event handed to `validateConfig` directly, **When**
   validation runs in binding mode, **Then** the finding is a notice rather than
   an error, and the schedule is not discarded.

---

### User Story 4 - Three same-day and adjacent-day rules match the specification (Priority: P3)

Three penalties the specification states are not the ones the engine applies:

- A category pair the document wants **three or more days apart** carries no
  penalty for being three or more days apart — the adjacent-day branch skips
  every gap that is not exactly 1, so `PROXIMITY_3_PLUS_DAYS` has never been
  read (**L1**).
- **Y8 and Y10 "CAN and SHOULD" share a day**, and the engine charges them 0.8
  for it — the largest finite same-day penalty in the graph, applied against the
  pairing the document says to prefer (**L9**).
- **DIV1↔CADET, DIV1↔DIV2 and DIV1↔DIV3 carry soft separations of 5.0, 3.0 and
  3.0**, and `SOFT_SEPARATION_PAIRS` has no reader: the applied values are 0.8,
  0.0 and 0.0 (**L3**).

**Why this priority**: each is a small, isolated correction, and all three move
the drift ledger. They are last in the wave because they buy accuracy rather than
a restored board, and because their diffs need the most careful review.

**Independent Test**: each is a unit assertion on the function that computes the
penalty, plus a reviewed drift-ledger diff.

**Acceptance Scenarios**:

1. **Given** two competitions of the same gender and weapon in categories the
   proximity graph relates, **When** they are three or more days apart, **Then**
   the color penalty includes `PROXIMITY_3_PLUS_DAYS` scaled by the pair's
   proximity weight; **and when** they are exactly two days apart, **Then** it
   includes neither the bonus nor the penalty.
2. **Given** a Y8 and a Y10 competition of the same gender and weapon, **When**
   their same-day crossover penalty is computed, **Then** it is 0.0.
3. **Given** a DIV1 and a CADET competition of the same gender and weapon,
   **When** their same-day crossover penalty is computed, **Then** it is 5.0; for
   DIV1↔DIV2 and DIV1↔DIV3 it is 3.0.
4. **Given** each of the eight B1–B8 reference tournaments, **When** the drift
   ledger runs after each of the three changes separately, **Then** no scenario
   schedules fewer events than its floor, and the snapshot diff is reviewed and
   explained in the commit that accepts it.

---

### Edge Cases

- **Every event is excluded by a per-event finding.** The schedule is empty and
  every event carries its own ERROR. That is the correct answer, and it is not
  the same as today's single global rejection.
- **An event is excluded and another event depends on it.** A team event's
  individual counterpart carries the dependency (`team-requires-individual`), and
  that rule is global and not in the per-event set — a tournament missing a
  required individual is still rejected whole. Excluding the individual for a
  fencer-count problem while keeping its team is out of scope for this feature
  and is recorded as a known gap.
- **The fallback fires on a scenario in the drift ledger.** Then B1–B8's WARN
  counts move even though no day assignment does. That is the point of US2 and
  the diff is reviewed like any other.
- **Removing the Y8→Y10 edge also removes the two-hop Y8↔Y12 edge** it was the
  only source of. `buildPenaltyMatrix` derives indirect edges from direct ones,
  so Y8↔Y12 drops from 0.3 to 0.0. Deliberate and reviewed, not incidental.
- **`SOFT_SEPARATION_PAIRS` at 5.0 is larger than every weight in
  `CROSSOVER_GRAPH`.** It is meant to be — "allowed in rare cases" is what a
  penalty above the ordinary band expresses. It is still finite, so it never
  blocks a day.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The `indiv-team-same-day` rule MUST NOT exist. Its removal is a
  deletion of the rule and its emission site, not a demotion of its severity.
- **FR-002**: `validateSameDayCompletion` MUST be left exactly as it is —
  exported, uncalled, and covered by its existing tests. Deciding its fate is
  out of scope.
- **FR-003**: When the DSatur loop assigns a day that violates one or more hard
  edges, the engine MUST report one finding per violated pair, naming both
  competitions and the constraint class, at WARN severity.
- **FR-004**: The day each competition is assigned MUST be byte-identical before
  and after FR-003. The reporting change MUST NOT alter any coloring decision.
- **FR-005**: `constraint_relaxation_level` MUST keep its current meaning and its
  current writer. FR-003's findings MUST NOT write it.
- **FR-006**: When every ERROR from `validateConfig` names one or more
  competitions and comes from a rule on the per-event exclusion list, the
  scheduler MUST exclude those competitions and schedule the rest, keeping one
  ERROR per excluded competition.
- **FR-007**: The per-event exclusion list MUST be an explicit set of rule ids —
  `fencer-count-bounds`, `cut-value-range`, `cut-value-min-promotions`,
  `de-duration-table-missing-entry`, `video-r16-strip-shortfall` — and MUST NOT
  be inferred from a finding's `kind` or from whether its `subjects` happen to
  look like competition ids.
- **FR-008**: When any ERROR comes from a rule outside that set, the scheduler
  MUST return an empty schedule exactly as it does today.
- **FR-009**: The scheduler MUST emit one summary finding naming how many
  competitions were excluded, so a reader of a partial board knows it is partial.
- **FR-010**: `buildConfig` MUST coerce a TEAM competition's `cut_mode` to
  `DISABLED` before the competition reaches the engine, by the same mechanism it
  already uses for regional cut overrides.
- **FR-011**: The `cut-on-team` finding MUST become a notice, so it warns in both
  validation modes and never discards a schedule.
- **FR-012**: `colorPenalty` MUST apply `PROXIMITY_3_PLUS_DAYS` scaled by the
  pair's proximity weight when the day gap is three or more, MUST keep applying
  `PROXIMITY_1_DAY` at a gap of exactly one, and MUST apply neither at a gap of
  two. The rest-day check MUST stay at a gap of exactly one.
- **FR-013**: `CROSSOVER_GRAPH` MUST carry no Y8↔Y10 edge, and MUST carry a
  comment naming METHODOLOGY:118 as the reason.
- **FR-014**: `crossoverPenalty` MUST return the `SOFT_SEPARATION_PAIRS` penalty
  for a listed pair, checked after the Group 1 mandatory test and before the
  crossover penalty matrix.
- **FR-015**: Every constant this feature makes readable MUST keep the value the
  specification states. No weight is retuned to make a drift diff smaller.
- **FR-016**: Each of the seven items MUST land in its own commit, carrying the
  before-and-after B1–B8 scheduled counts and the reviewed explanation of its
  snapshot diff.

### Key Entities

- **Per-event finding** — a `ValidationError` whose `rule` is on the exclusion
  list and whose `subjects` name the competitions it is about. The scheduler
  reads `subjects` to decide what to drop.
- **Hard-edge violation** — a pair of competitions sharing a day across an edge
  whose weight is `Infinity`. Produced by the DSatur fallback, reported by
  FR-003, never produced deliberately.
- **Excluded competition** — one named by a per-event finding. It has no entry in
  the returned schedule and does not participate in day assignment or resource
  allocation.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: `NAC Div1/Junior` and `NAC Vet/Div1/Junior` place a non-zero number
  of events through the app's own configuration path, at the store's default day
  count. Both place zero today.
- **SC-002**: No B1–B8 scenario schedules fewer events than its drift-ledger
  floor at any point in the feature. A drop halts the task that caused it.
- **SC-003**: `NAC Cadet/Junior` at 3 days reports a WARN for every hard-edge
  pair the day assignment breaks. The reconciliation document measures six and
  the engine reports zero today.
- **SC-004**: A tournament of valid events plus one event with a fencer count of
  0 schedules the valid events. It schedules none today.
- **SC-005**: `PROXIMITY_3_PLUS_DAYS`, `SOFT_SEPARATION_PAIRS` and the Y8↔Y10
  correction each have at least one test that fails if the constant is reverted.
- **SC-006**: The full suite, `tsc -b` and `lint` are green on the branch, and
  green again on the merged tree before the merge commit is written.
- **SC-007**: Seven commits, one per item, each naming the drift it moved or
  stating that it moved none.

## Assumptions

- The reconciliation document's measurements are taken as the baseline claim, not
  as fact this feature may skip re-measuring. Every number it predicts is
  re-measured on this branch before the corresponding task is accepted, and where
  the measurement disagrees the measurement wins and the disagreement is
  recorded. The document's own §1.2.5 prediction that R2 moves B4 is one this
  feature expects to fail: B4 trips a *policy* feasibility rule, which R2 does
  not scope.
- `computeDeFencerCount` returns the raw fencer count for TEAM events regardless
  of cut mode (`src/engine/pools.ts:141`), so R3 changes no arithmetic. It is a
  reporting and stored-state fix, and its drift is expected to be nil.
- The document's ordering within Wave 1 is preserved. The items are independent,
  so the order is not a dependency chain — it is what makes each drift diff
  attributable to one change.

## Out of Scope

- **Part 3 and every wave that depends on it.** The eight time-of-day weights,
  the video-strip budget, video strip preservation, the clique check (R6), the
  feasibility demotion (R5) and the day-end overrun (R8) are Wave 3.
- **Wave 2's documentation work.** METHODOLOGY.md is not edited by this feature.
  The ten contradictions in §1.1, the DOC-WRONG rows, and the deletion of
  `daySequencing.ts` and its 14 tests belong to a separate session that can run
  in parallel.
- **Wave 4.** The DE prelims bout-share unit error, the strip-suggestion
  re-specification, the 4 PM pool cutoff and the veteran start offset each need
  their own drift review and their own task.
- **Deleting dead code this feature orphans.** `findIndividualCounterpart` loses
  a production caller when R1 lands and keeps another; `proximityPenalty` and
  `individualTeamProximityPenalty` in `crossover.ts` stay dead. Wave 2 owns
  removals.
- **A same-day *bonus* for Y8/Y10.** The specification says Y8 "SHOULD" share a
  day with Y10 and states no weight for it. L9 removes the penalty and stops
  there; inventing a bonus weight is a Wave 3-shaped decision and is backlogged.
- **Re-validating after exclusion.** R2 excludes in one pass against findings
  computed over the full competition set. A second validation pass over the
  reduced set would change which global findings fire and is not attempted here
  ([research.md D3](./research.md)).
