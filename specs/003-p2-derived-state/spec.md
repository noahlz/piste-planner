# Feature Specification: P2 Derived State

**Feature Branch**: `003-p2-derived-state`

**Created**: 2026-08-28

**Status**: Draft

**Input**: User description: "Begin P2 of the Competition Planner Workbench roadmap. Source of truth: docs/design/competition-planner-workbench.md (§Roadmap P2 row, §State model, §Validation). Scope: placements as intent + store inversion + staleness removal; validation split (one rule set, ERROR when binding, WARN when advisory); days cap widened; findings identity; presets moved to src/data; P2-pinned debt (re-baseline stale B1–B8 integration floors, re-tune CAPACITY_TARGET_FILL — behavior-drift sensitive, constitution III applies). Worktree flow, branch 003-p2-derived-state."

## Design References

This spec implements the P2 row of the workbench roadmap. The design document
is the single home for the design facts below – this spec points at them and
does not restate them.

| Topic | Home |
|---|---|
| P2 scope row and phase dependencies | [design §Roadmap](../../docs/design/competition-planner-workbench.md) |
| Placement record shape and rules | [design §State model](../../docs/design/competition-planner-workbench.md) |
| Structural vs policy rule split, days cap, findings identity | [design §Validation](../../docs/design/competition-planner-workbench.md) |
| Preset source of truth and app boot behavior | [design §Presets](../../docs/design/competition-planner-workbench.md) |
| Re-baseline and new-coverage expectations | [design §Testing](../../docs/design/competition-planner-workbench.md) |
| `CAPACITY_TARGET_FILL` re-tune and stale-floor detail | [backlog §Calibration debt](../../docs/design/backlog.md) |
| Drift gate governing the calibration work | [constitution §III](../../.specify/memory/constitution.md) |

## Clarifications

### Session 2026-08-28

- Q: When a tournament is shared via URL, should dismissed/accepted findings travel with it? → A: Serialize with the tournament – a dismissal is planning intent like a placement.
- Q: Should the widened day count get a new structural upper bound, or only the 2–4 policy warning? → A: Structural cap at 14 – days below 1 or above 14 block, values outside 2–4 within that range warn.
- Q: Which findings can the organizer dismiss? → A: Advisory WARNs only – structural and binding errors cannot be waved away.
- Q: If a finding's numbers change but its rule and subject events are the same, is it still the same finding (stays dismissed)? → A: Same finding – identity is rule plus subject(s) only, excluding computed magnitudes.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Placements are remembered intent, the schedule is derived (Priority: P1)

The planner stores *where the organizer wants each event* – day, start time,
strip demand, whether it was placed by hand or by the auto-scheduler, and
whether it is pinned – and derives everything else (block geometry, durations,
finish times, referee demand) from that stored intent on demand. Nothing
derived is ever stored, so nothing can ever be stale: the "results out of
date" state, and every control that manages it, ceases to exist.

**Why this priority**: This is the phase's namesake and the dependency for the
entire workbench (P3 renders placements, P4 edits them). Without it, manual
work has nowhere to live and auto-schedule silently eats it (design decision 4).

**Independent Test**: Exercisable entirely through store actions and
serialization, with no new UI. Create placements, derive the schedule, verify
the derivation is pure and repeatable, and verify a save/load round trip
reproduces the identical schedule.

**Acceptance Scenarios**:

1. **Given** a tournament with events, **When** auto-schedule runs, **Then**
   every event's placement is recorded as auto-sourced intent and the rendered
   schedule is derived from those placements, not read from a stored result.
2. **Given** a placement map and a tournament configuration, **When** the
   schedule is derived twice from the same inputs, **Then** both derivations
   are identical (purity – constitution I).
3. **Given** a hand-tuned placement (manual source, pinned), **When**
   auto-schedule all runs, **Then** the placement is overwritten as auto-sourced
   – and **When** the tournament is instead saved and reloaded via share URL,
   **Then** the hand-tuned placement survives byte-for-byte (design §State
   model serialization rule).
4. **Given** the previous stale-marking behavior (edit an input after
   scheduling), **When** any input changes, **Then** no stale flag exists to
   set – derived views reflect current inputs or the UI's explicit re-run
   action, and the stale-banner UI paths are gone.
5. **Given** the existing wizard and single-page layouts (deleted only in P3),
   **When** P2 lands, **Then** both still function against the inverted store.

---

### User Story 2 - One rule set, two consumers: binding vs advisory validation (Priority: P2)

Validation rules split by kind, not by copy. Structural preconditions (fencer
count bounds, days outside 1–14, strips below 1) always block. Policy rules
(same-population conflicts, Vet co-day, Group 1 separations, strip minimum,
team-requires-individual, cut-on-team) are defined once and consumed twice:
they bind (ERROR) when the auto-scheduler places events and advise (WARN) when
the organizer places events. The 2–4 day cap is reclassified from structure to
policy, so an organizer can explore a 5+ day layout (up to the structural cap
of 14) and be warned rather than stopped.

**Why this priority**: P4's manual placement is built on "the user may violate
policy knowingly, the auto-scheduler cannot" (design decision 5). The split
must exist before any editing UI does, and the widened day cap is
independently useful the day it lands.

**Independent Test**: For each policy rule, assert the same rule instance
yields ERROR under binding evaluation and WARN under advisory evaluation, from
one rule definition. Assert a 5-day configuration validates with a warning
where it previously errored.

**Acceptance Scenarios**:

1. **Given** a configuration violating a policy rule, **When** validated in
   binding mode, **Then** the finding is an ERROR, and **When** validated in
   advisory mode, **Then** the same finding is a WARN with the same substance.
2. **Given** a configuration violating a structural precondition, **When**
   validated in either mode, **Then** the finding is an ERROR in both.
3. **Given** a 5-day (or more) tournament, **When** validated, **Then** it
   produces a policy warning instead of the current blocking error, and the
   schedule can still be computed.
4. **Given** the full rule catalogue, **When** the two modes are compared,
   **Then** every rule exists exactly once – no rule is duplicated per mode.

---

### User Story 3 - Findings keep their identity across recomputes (Priority: P3)

Every validation finding carries a stable identity derived from what it is
about – the rule plus its subject(s), excluding computed magnitudes – not from
when it was produced. An organizer who dismisses an advisory finding never
sees it reappear on a recompute – not while the rule keeps firing for the same
subjects, not when the numbers in its message change, and not when the rule
briefly stops firing and returns. Dismissal is cleared only by the organizer.
Only advisory WARN findings are dismissible – structural and binding errors
are not.

**Why this priority**: Depends on Story 2's finding shape. The workbench
recomputes findings continuously (design decision 1), so without identity,
dismissal is impossible and the findings list churns. It has no visible
surface until P3's drawer, but the identity must be in the data model first.

**Independent Test**: Recompute findings repeatedly over an unchanged
configuration and assert identities are stable. Change an unrelated input and
assert the identity of an existing finding does not change. Record a dismissal
and assert it still applies after recompute.

**Acceptance Scenarios**:

1. **Given** a finding produced twice by consecutive recomputes over unchanged
   causes, **When** their identities are compared, **Then** they are equal.
2. **Given** a dismissed advisory finding, **When** findings are recomputed
   with the cause unchanged, **Then** the finding is still marked dismissed.
3. **Given** two findings from the same rule about different subjects, **When**
   their identities are compared, **Then** they are distinct.
4. **Given** a dismissed advisory finding, **When** an input change alters the
   magnitudes in its message but the rule still fires for the same subjects,
   **Then** it is the same finding and stays dismissed.
5. **Given** a structural or binding ERROR finding, **When** a dismissal is
   attempted, **Then** it is not dismissible.

---

### User Story 4 - One source of truth for tournament presets (Priority: P4)

The B1–B8 real-tournament rosters move from test fixtures into application
data, keyed and shaped as design §Presets records. The scenario tests import
the same data the app ships, so a preset can never drift from the fixture that
guards it, and P3's preset picker and boot-with-preset behavior have their
data source ready.

**Why this priority**: Pure relocation with no behavior change – lowest risk,
but P3 cannot start its top bar without it, and it keeps presets "real by
construction" (design §Presets).

**Independent Test**: The integration and drift-ledger scenarios pass
unchanged while importing rosters from the application data location, and the
old inline fixture copies are gone.

**Acceptance Scenarios**:

1. **Given** the relocated presets, **When** the B1–B8 scenario tests run,
   **Then** they consume the application's preset data directly and pass with
   unchanged scheduled-event counts.
2. **Given** a roster edit in the application data, **When** tests run,
   **Then** the scenario tests see the edited roster (single source proven).

---

### User Story 5 - Calibration debt: honest floors and a re-tuned capacity target (Priority: P5)

Two measured corrections pinned to P2 by the design and backlog, both
behavior-drift sensitive under constitution III:

1. The integration-test scheduled-event floors are re-baselined from their
   stale values (B1 asserts at least 14 while scheduling 24 of 24) to the
   measured current counts, so the assertions actually guard the behavior.
2. `CAPACITY_TARGET_FILL` (currently 0.3) was tuned for a scheduler that no
   longer exists and is re-tuned upward against the current B1–B8 baselines
   (backlog §Calibration debt).

**Why this priority**: Independent of the state-model work and ordered last so
the re-tune lands on an otherwise-quiet engine. It is in-phase because the
design pins it here and because Story 4 touches the same scenario fixtures.

**Independent Test**: Run the B1–B8 suite before and after each change and
review the drift-ledger diff. Floors equal measured reality, and the re-tune
drops no scenario's scheduled count.

**Acceptance Scenarios**:

1. **Given** the re-baselined floors, **When** any scenario schedules fewer
   events than its measured baseline, **Then** the suite fails – the assertion
   is no longer vacuous.
2. **Given** the re-tuned capacity target, **When** the drift ledger runs,
   **Then** no scenario schedules fewer events than before the re-tune, and
   the before/after counts for every scenario are recorded (constitution III).
3. **Given** B4's pinned collapse behavior (0 scheduled, 1 validation error,
   accepted by Ruling 11), **When** floors are re-baselined, **Then** B4's
   dedicated pin is preserved rather than naively floored.

---

### Edge Cases

- A placement references an event that has since been removed from the
  roster: the placement is dropped with the event, never orphaned.
- The day count is reduced below an existing placement's day index: the
  placement survives as stored intent and surfaces as a finding, and the
  derivation must not crash on it.
- A serialized tournament contains placements for unknown event ids: load is
  lenient (ignore and report), with no migration path – the product is
  unreleased and backwards compatibility is explicitly out of scope.
- Auto-schedule over a tournament with zero events: an empty placement map,
  no findings, no crash.
- Two findings from the same rule about the same subject in the same
  recompute: identities must not collide silently into one.
- The capacity re-tune improves packing on some scenarios while dropping
  another: constitution III halts the task until the drop is explained and
  recorded, no matter how good the aggregate looks.
- A 1-day tournament (structurally valid, outside the 2–4 policy range):
  warns, schedules, does not block. A 15-day tournament (above the structural
  cap of 14) blocks in both modes.
- A dismissed advisory finding whose rule stops firing and later fires again
  for the same subjects: it returns still dismissed. Dismissal is a sticky
  identity-keyed record, cleared only by the organizer – anything else would
  let transient mid-edit states silently resurrect accepted warnings.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST store per-event placement intent with exactly
  the record shape and rules given in design §State model, and MUST derive all
  block geometry from placements plus the tournament configuration at read
  time – derived geometry is never persisted.
- **FR-002**: Auto-schedule MUST express its output *as* placements
  (auto-sourced), overwriting every existing placement, so manual and
  automatic results live in one model.
- **FR-003**: Placements MUST serialize with the tournament configuration such
  that a shared URL reproduces a hand-tuned schedule exactly.
- **FR-004**: The staleness mechanism (`analysisStale`, `scheduleStale`,
  `markStale`, `clearStale`) and every UI element that renders or manages
  staleness MUST be removed. No replacement flag may be introduced.
- **FR-005**: The two pre-workbench layouts MUST remain functional on the
  inverted store until P3 deletes them.
- **FR-006**: Validation MUST classify every rule as either structural
  (blocking in all modes) or policy (severity determined by the consumer), per
  the partition in design §Validation.
- **FR-007**: Each policy rule MUST be defined once and evaluated in two
  modes: binding (yields ERROR) and advisory (yields WARN). The two modes MUST
  agree on everything except severity.
- **FR-008**: The day-count policy range MUST warn outside 2–4 instead of
  erroring, with the structural bounds (at least 1 day, at most 14) blocking.
- **FR-009**: Every finding MUST carry a stable identity composed of its rule
  and its subject(s) only – excluding computed magnitudes and message text –
  equal across recomputes while rule and subjects are unchanged, and distinct
  across different subjects of the same rule.
- **FR-010**: The system MUST persist dismissal for advisory WARN findings
  only, keyed by finding identity and serialized with the tournament so a
  share URL reproduces the accepted-warnings state. Structural and binding
  ERROR findings MUST NOT be dismissible.
- **FR-011**: The B1–B8 rosters MUST live in application data (design
  §Presets) and the scenario tests MUST import them from there, with no
  second copy remaining in test fixtures.
- **FR-012**: The integration-test scheduled-event floors MUST be raised to
  the measured current counts per scenario, preserving B4's dedicated pinned
  collapse behavior.
- **FR-013**: `CAPACITY_TARGET_FILL` MUST be re-tuned upward against the
  current B1–B8 baselines with the drift ledger reviewed before and after; a
  scheduled-count drop on any scenario halts the change (constitution III).
- **FR-014**: All engine work MUST preserve constitution I purity: placements
  in, schedule out, no store reads from the engine.

### Key Entities

- **Placement**: The organizer's stored intent for one event – where, when,
  how many strips, who placed it, and whether it is pinned. Shape and rules
  are homed in design §State model. Keyed by event id.
- **Finding**: One validation outcome with a kind (structural or policy), a
  severity determined by kind and consumer, and a stable identity composed of
  rule plus subject(s). Advisory WARN findings alone carry an optional
  dismissal state, keyed by that identity and serialized with the tournament.
- **Preset**: A real tournament roster (B1–B8) shipped as application data –
  id, display name, source URL, tournament type, day count, strip counts, and
  per-event fencer counts – consumed by both the app and the scenario tests.
- **Baseline**: The measured scheduled-event count per scenario that the
  drift gate asserts against, recorded in the drift ledger and the
  re-baselined integration floors.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A hand-tuned schedule saved to a share URL and reloaded
  reproduces 100% of placements and derived blocks identically.
- **SC-002**: Zero staleness flags, actions, or banners remain anywhere in the
  product – the concept is unrepresentable, not merely unused.
- **SC-003**: Every policy rule produces both an ERROR (binding) and a WARN
  (advisory) outcome from a single definition – rule count identical across
  modes, zero rules duplicated.
- **SC-004**: A 5-day tournament configuration can be validated and scheduled,
  producing a warning where it previously produced a blocking error.
- **SC-005**: A dismissed finding remains dismissed across at least 100
  consecutive recomputes with unchanged cause.
- **SC-006**: Every scenario's integration floor equals its measured scheduled
  count (B4 excepted per its pin) – no floor sits more than 0 below reality.
- **SC-007**: After the capacity re-tune, no B1–B8 scenario schedules fewer
  events than its pre-change baseline, with before/after counts recorded per
  scenario.
- **SC-008**: The full test suite passes with the wizard and single-page
  layouts still operational (their deletion is P3's, not P2's).

## Assumptions

- **No placement-editing UI in P2.** Placements are created by auto-schedule
  and by store actions under test. Interactive placement is P4 and rendering
  is P3, so P2's proof surface is store behavior, derivation purity, and
  serialization.
- **Dismissal semantics are settled** (Clarifications, 2026-08-28): advisory
  WARNs only, keyed by rule-plus-subject identity, serialized with the
  tournament, sticky until the organizer clears them.
- **Day bounds are settled** (Clarifications, 2026-08-28): structural 1–14,
  policy warning outside 2–4.
- **Re-baselined floors are set to measured counts at re-baseline time**, in
  the same spirit as the drift ledger's asserted floors, and may later be
  deliberately raised but never casually lowered.
- **The re-tuned capacity value is discovered empirically**, not specified
  here. The acceptance bar is behavioral (no scenario drops, diff reviewed and
  recorded), not a target number.
- **Serialization format changes are free.** The product is unreleased and
  backwards compatibility is explicitly rejected – lenient loading is a
  courtesy, migrations are out of scope.
- **Worktree flow** per constitution §Git Ownership: branch
  `003-p2-derived-state`, subagents commit checkpoints on the branch, the user
  lands it by true merge with `commit-with-costs`.

## Out of Scope

- Everything P3 owns: the workbench shell, canvas, matrix rendering, preset
  picker UI, boot-with-preset, layout deletion.
- Everything P4 owns: manual drag placement, unpack-to-blocks, undo/redo,
  `Auto-fill unplaced` and its engine pre-seeding.
- Youth-event pool duration calibration (backlog-owned, unassigned).
- Any scheduling-algorithm change beyond the `CAPACITY_TARGET_FILL` re-tune.
- Migration of previously shared URLs.
