# Feature Specification: P1 Foundations

**Feature Branch**: `001-p1-foundations`

**Created**: 2026-08-27

**Status**: Ready for implementation

**Input**: P1 of the Competition Planner Workbench roadmap – remove DE pods and
pool double-stripping, tighten the scheduling grid to 5 minutes, collapse the two
DE capacity estimators into one table-driven model, and add the per-bout duration
helper later phases need.

**Design context**: [`docs/design/competition-planner-workbench.md`](../../docs/design/competition-planner-workbench.md).
This feature is that document's **P1**. Decisions whose reasoning spans more than
this feature live there, not here.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Referee numbers an organizer can staff against (Priority: P1)

An organizer plans a NAC with staged DE events and needs to know how many
referees to hire. The app prints referee demand in three places: the per-day
requirements report, the day-summary bottleneck line, and the referee
recommendation. Today those three disagree with each other by roughly 4× on the
same staged event, because staged DE was counted as one head referee per group of
four strips while the referees actually running the bouts were never counted at
all. The organizer cannot tell which number to believe.

After this story, every DE phase – staged or single-stage – requires one referee
per allocated strip, and all three outputs report that same rule.

**Why this priority**: It is the only P1 change an organizer sees directly, and
it corrects an under-count that would send someone to a tournament short-staffed.
Every other P1 change is invisible until the schedule shifts.

**Independent Test**: Run the B1–B8 scenarios and compare the three referee
outputs for a staged DE event. They agree, and the figure equals the event's
allocated strip count times the per-strip referee rate.

**Acceptance Scenarios**:

1. **Given** a staged DE event allocated 16 strips, **When** referee demand is
   computed, **Then** its `DE_PRELIMS` and `DE_ROUND_OF_16` blocks each report 16
   referees rather than 4.
2. **Given** the same scenario, **When** the per-day requirements report, the
   day-summary peak, and the referee recommendation are compared, **Then** all
   three derive from one referee per allocated strip and no path adds a group or
   captain allowance.
3. **Given** a single-stage DE event, **When** referee demand is computed,
   **Then** the figure is unchanged from before this feature.
4. **Given** the mostly single-stage regional scenario B6, **When** the drift
   ledger is reviewed, **Then** its referee figures barely move, confirming the
   correction is confined to staged events.
5. **Given** a saved config or shared URL containing `pod_captain_override`,
   **When** it is loaded, **Then** it loads successfully and the unknown key is
   ignored.

---

### User Story 2 - Pool durations that match what happens on the strips (Priority: P2)

The engine shortens a pool round by 40% whenever the whole round is a single pool
of 8 or more fencers, modelling a double-stripping practice the app has no way to
know is happening. Organizers comparing predictions against real events see those
rounds finish late.

After this story, a pool round's duration is the plain weighted average of its
pools, with no hidden reduction.

**Why this priority**: It removes a fiction that silently flatters every small
event, and it produces the measured before/after delta the youth-duration
calibration in [`docs/design/backlog.md`](../../docs/design/backlog.md) is waiting on.

**Independent Test**: A single pool of 8 returns the same duration as
`poolDurationForSize` for size 8. Affected events in the drift ledger are only
those whose entire pool round is one pool of 8 or more.

**Acceptance Scenarios**:

1. **Given** an event whose entire pool round is a single pool of 8, **When** its
   pool duration is computed, **Then** the result equals the duration for a pool
   of 8 with no 0.6 factor applied.
2. **Given** an event with multiple pools, **When** its pool duration is
   computed, **Then** the result is unchanged from before this feature.
3. **Given** scenario B4, **When** the drift ledger is reviewed, **Then** the
   affected pool durations are recorded before and after, since they rise by
   roughly 1.67×.

---

### User Story 3 - One DE capacity model, no hidden switch (Priority: P3)

Two DE capacity estimators exist behind a `de_capacity_estimation` config field
that has no UI control and no store field – the app always runs the default. The
two models disagree, so the dead alternative is a maintenance liability and a
source of confusion when day assignment produces a surprising result.

After this story, DE strip-hours for individual events come from
`de_duration_table` times the event's strip footprint, team events keep their
round-by-round model, and the config field is gone.

**Why this priority**: Pure simplification with real drift risk on the
density-tight regional scenarios, so it is worth isolating but not worth doing
before the two changes above.

**Independent Test**: A SINGLE_STAGE individual event's DE strip-hours equal
`strips_allocated × table_duration / 60`. No config field selects a model, and no
test can set one.

**Acceptance Scenarios**:

1. **Given** a SINGLE_STAGE individual event, **When** its DE strip-hours are
   estimated, **Then** the result is the flat table formula rather than a
   bout-based scaled estimate.
2. **Given** a team event, **When** its DE strip-hours are estimated, **Then** the
   round-by-round model produces the same result as before this feature.
3. **Given** a saved config containing `de_capacity_estimation`, **When** it is
   loaded, **Then** it loads successfully and the unknown key is ignored.

---

### User Story 4 - Phases that start when strips actually free up (Priority: P4)

A deferred phase resumes at the next 30-minute boundary, so an event whose strips
free at 13:05 waits until 13:30. Across a four-day tournament that rounding
accumulates into finish times an organizer would not accept.

After this story, phase start times snap to 5-minute boundaries. End times remain
unsnapped.

**Why this priority**: The single change most likely to move every scenario, so
it lands last and alone, against a drift ledger that every earlier task has
already stabilized.

**Independent Test**: Snapping a time of 13:03 yields 13:05 rather than 13:30, and
the drift ledger shows start times moving earlier with scheduled counts holding or
rising.

**Acceptance Scenarios**:

1. **Given** a phase that can start at 13:03, **When** its start time is snapped,
   **Then** it starts at 13:05.
2. **Given** the B1–B8 scenarios, **When** the drift ledger is reviewed after the
   change, **Then** no scenario schedules fewer events than it did before it.

---

### Edge Cases

- A saved config or shared URL carrying a removed key (`pod_captain_override`,
  `de_capacity_estimation`) must load rather than throw. Unknown keys are ignored.
- `VET_COMBINED` carries a `vet_age_group` but not a veteran category, so the
  per-bout youth/veteran delta must key off `vet_age_group` rather than category.
- Y12 and Y14 sit between Y10 and cadet in the catalogue and are deliberately
  **not** given the delta. Their absence is a decision, not an oversight.
- A pool round of exactly one pool of 8 is the smallest case the double-stripping
  removal affects, and the clearest test of it.
- `grep -rni "pod"` can produce false positives on words like "podium". There are
  none today – the acceptance sweep confirms rather than assumes.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Every DE phase MUST require one referee per allocated strip, in
  staged and single-stage mode alike.
- **FR-002**: The per-day referee requirements report, the day-summary peak line,
  and the referee-count recommendation MUST all derive from FR-001, with no
  captain, pod, or grouping allowance on any path.
- **FR-003**: Pod captains MUST NOT be modelled. The `pod_captain_override`
  config field, its store state, its serialization, and its UI control are
  removed.
- **FR-004**: A STAGED DE phase MUST claim its capped strip count as a single
  contiguous allocation taking the same availability path as every other phase.
  Strips MUST be a flat pool with `video_capable` as the only categorical
  distinction.
- **FR-005**: The DE strip footprint MUST be a single constant
  (`DEFAULT_DE_STRIP_FOOTPRINT = 16`) replacing the pod-count × pod-size pair,
  because `de_duration_table` is calibrated against a 16-strip footprint.
- **FR-006**: Pool round duration MUST be the rounded weighted average of its
  pools' durations, with no reduction for a single pool of 8 or more.
- **FR-007**: DE strip-hours for individual events MUST come from
  `de_duration_table` times the strip footprint. Team events keep the
  round-by-round model. No configuration selects between models.
- **FR-008**: Phase start times MUST snap to 5-minute boundaries. End times
  remain unsnapped.
- **FR-009**: The engine MUST expose `perBoutDuration(weapon, category,
  vet_age_group)` returning per-bout minutes: 20 for foil and épée, 15 for sabre,
  each less 5 minutes when the category is Y8 or Y10 **or** `vet_age_group` is
  non-null. Y12 and Y14 take the plain weapon duration.
- **FR-010**: Loading a config that contains a removed key MUST succeed, ignoring
  the unknown key.
- **FR-011**: A drift-ledger snapshot over the B1–B8 scenarios MUST exist before
  the first behavior change and MUST be reviewed and explained after every
  behavior-changing task.
- **FR-012**: `METHODOLOGY.md` MUST describe the engine as implemented – no pods,
  no double-stripping, one DE capacity model, a 5-minute grid, and referee demand
  stated as one per allocated strip.

### Key Entities

- **Scenario fixture (B1–B8)**: A real tournament's roster and configuration –
  fencer counts, days, strips, video strips, tournament type, source URL. Shared
  by the integration tests and the drift ledger from one definition. P2 moves
  these to `src/data`, so the shape stays flat and serializable.
- **Drift-ledger digest**: The normalized per-scenario snapshot – scheduled event
  count, ERROR bottleneck count, full per-day referee requirements, the day-summary
  peak recomputed from its inputs, the referee and strip recommendations, and a
  per-event map of assigned day, phase start and end times, and pool strip count.
  Carries no message strings.
- **StripAllocation**: One event-phase's claim on a strip over an interval. Loses
  its `pod_id` grouping.
- **Referee demand interval**: A count of referees required over a window, swept
  per day to produce peaks.
- **TournamentConfig**: Loses `pod_captain_override` and `de_capacity_estimation`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For any staged DE event, the three referee outputs agree, and each
  equals allocated strips × the per-strip referee rate.
- **SC-002**: Staged-DE referee demand on the NAC scenarios (B1, B2, B3, B7, B8)
  rises roughly 4×, while the mostly single-stage B6 barely moves.
- **SC-003**: `grep -rni "pod" src/ METHODOLOGY.md` and
  `grep -rni "double[-_ ]?strip" src/ METHODOLOGY.md` return nothing.
- **SC-004**: `grep -rn "de_capacity_estimation\|pod_captain_override" src/`
  returns nothing.
- **SC-005**: No B1–B8 scenario ends this feature scheduling fewer events than it
  did at the drift-ledger baseline, unless the drop is deliberate and its cause,
  with before and after counts, is recorded in the commit message of the task that
  caused it.
- **SC-006**: Full test suite green, `tsc -b` clean, `pnpm lint` clean.
- **SC-007**: A saved config containing `pod_captain_override` or
  `de_capacity_estimation` loads without error.
- **SC-008**: B4's affected pool durations are recorded before and after the
  double-stripping removal, giving the youth-duration calibration a measured
  delta rather than a re-derived one.

## Assumptions

- The referee increase is a correction to an under-count, not a regression.
  Anyone comparing figures across this feature will see a step change and is told
  why. Accepted 2026-08-27.
- `DEFAULT_DE_STRIP_FOOTPRINT` stays at 16 because the empirical
  `de_duration_table` was calibrated against that footprint. Changing the
  footprint would require recalibrating the table, which is out of scope.
- `teamDeStripHours` is left unchanged. It was never selected by the
  `de_capacity_estimation` flag, so folding it into the table-driven model is a
  separate behavioral change.
- `perBoutDuration` has no P1 consumer. It is introduced here so this feature's
  constant changes land under test, and it is consumed by P4 and P5.
- UI work is limited to deleting the Pod Captain Override control. The workbench
  shell is P3.

## Clarifications

### Session 2026-08-27

- Q: Should a `DE_REF_STRIP_GROUP = 4` constant exist? → A: No. A 4-strip referee
  grouping is the pod-captain accounting this feature removes.
- Q: What halts a task when drift exceeds expectation? → A: Any drop in scheduled
  event count on any B1–B8 scenario. Time and day churn passes freely.
- Q: Should the drift ledger cover the outputs the pod-captain removal changes? →
  A: Yes. Per-day peak referee figures and the referee recommendation join the
  digest.
- Q: Which categories get the youth/veteran per-bout delta? → A: Y8, Y10, and any
  non-null `vet_age_group`, `VET_COMBINED` included. Y12 and Y14 are unaffected.
- Q: What happens to `distributeEvenly` once `podDeStripHours` is gone? → A:
  Delete the export and its `describe` block together.

## Out of Scope

- Bout-level DE allocation and the STRICT/FLUID split (P5).
- The `video_stage_mode` config field – deferred to P5, where it has a consumer.
- Any UI work beyond deleting the Pod Captain Override control (P3).
- Placements, derived state, and moving presets to `src/data` (P2).
- Re-baselining the stale integration-test floors (P2).
- Replacing the empirical `de_duration_table`.
