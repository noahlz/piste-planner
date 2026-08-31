# Feature Specification: Day-Axis Parity Between the App and the Drift Ledger

**Feature Branch**: `006-day-axis-parity`

**Created**: 2026-08-31

**Status**: Draft

**Input**: User description: "006-day-axis-parity — reconcile the store's clock-time dayConfigs with the engine's compacted day axis so the app path schedules what the B1–B8 drift ledger records"

## Why This Feature Exists

The app boots into its default tournament and places **11 of that tournament's
24 events**. The drift ledger, the suite that is supposed to guarantee the
engine's behavior, records the same tournament as **24 of 24**. Both numbers are
correct, because the app and the ledger hand the engine two different day
axes — the finding is recorded in full in
[`docs/design/reassessment-2026-08-31.md` §2](../../docs/design/reassessment-2026-08-31.md),
with the repro, the isolation runs, and the fix options.

The consequence is larger than one half-empty screen. Every drift gate the
project has run since P1 has measured a configuration the app never builds. The
constitution's third principle — behavior drift is measured, not assumed — has
been measuring the wrong subject, and no amount of green suite would have said
so.

This feature makes the app and the ledger describe the same tournament, and
then locks that equality into the suite so it cannot silently part again.

It blocks 004's US3. The scorecard freezes a baseline the moment a preset
loads, and a baseline taken over 11 of 24 events is a number nobody should
anchor to.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The schedule the app produces is the schedule the engine promises (Priority: P1)

A planner opens the app. It loads a real tournament and auto-schedules it. Every
event that the scheduling engine can place is placed — on the canvas, in the
schedule table, and out of the unplaced tray. When the planner switches to
another built-in tournament, the same holds.

**Why this priority**: This is the defect. Everything else in the feature exists
to keep it fixed. Until it lands, the app under-schedules by roughly half on its
own boot screen and every downstream number — scorecard baselines, referee
peaks, strip recommendations — is computed over a schedule the engine did not
mean to produce.

**Independent Test**: Load each built-in tournament in turn and compare the
number of placed events against the number the drift ledger records for that
tournament. They match.

**Acceptance Scenarios**:

1. **Given** a fresh load with no shared link, **When** the app finishes its
   boot auto-schedule, **Then** the number of placed events equals the count the
   drift ledger records for the default tournament, and the unplaced tray holds
   only the events the ledger also leaves unscheduled.
2. **Given** any of the eight reference tournaments, **When** it is applied and
   auto-scheduled through the app's own inputs, **Then** the placed-event count
   equals that tournament's ledger count.
3. **Given** a scheduled tournament, **When** any event's start time is read
   anywhere in the app — canvas block, tooltip, schedule table, shared link —
   **Then** it reads as a wall-clock time within that day's configured hours,
   not as an offset from the start of the tournament.
4. **Given** the eight reference tournaments run through the ledger's own path,
   **When** the ledger runs after this change, **Then** its recorded behavior is
   unchanged: same snapshot, same floors, no scenario scheduling fewer events.

---

### User Story 2 - A tournament's day hours are honored, day by day (Priority: P2)

A planner sets Saturday to start at 08:00 and Sunday to start at 09:00 and end
early. The schedule respects each day's own hours: nothing is placed before a
day opens or after it closes, and shortening one day does not move the events on
another.

**Why this priority**: The app already exposes per-day start and end times, and
they are the reason the store populates day windows at all. A fix that reached
parity by discarding them would trade one silent wrong answer for another.

**Independent Test**: Configure two days with different hours, auto-schedule,
and confirm each day's events fall inside that day's own window and that
narrowing one day leaves the other day's placements untouched.

**Acceptance Scenarios**:

1. **Given** a multi-day tournament whose days have different start times,
   **When** it is auto-scheduled, **Then** no event on any day starts before
   that day's start time or ends after that day's end time.
2. **Given** the same tournament, **When** one day's end time is moved earlier
   so that day can no longer hold everything assigned to it, **Then** the events
   that no longer fit become unplaced or move, and the other days' placements do
   not shift as a side effect.
3. **Given** a tournament whose days all use the same hours, **When** it is
   auto-scheduled, **Then** the result is the same as the ledger's for that
   tournament (US1's parity holds through this path, not around it).

---

### User Story 3 - The running app is verified at a real number (Priority: P3)

The live smoke run asserts how many events the app actually places, so a future
change that halves the schedule again fails the run instead of passing it.

**Why this priority**: The smoke driver's block and row floors were lowered to
"non-empty" for a reason that was legitimate at the time, and that lowering is
part of why F1 survived. Constitution VI's guarantee is only as strong as the
number the driver asserts.

**Independent Test**: Run the live smoke driver against the running app; it
reports and asserts a specific placed-event count at boot, and fails when the
count drops.

**Acceptance Scenarios**:

1. **Given** the running app at boot, **When** the smoke driver inspects the
   canvas, **Then** it asserts a specific event count rather than mere
   non-emptiness, and that count is the one the ledger records for the boot
   tournament.
2. **Given** the driver's later template switch, **When** it re-measures that
   template's yield after this change, **Then** its floors are set from the
   measured number and the comment records what the number is and why.
3. **Given** an artificially reintroduced day-axis mismatch, **When** the smoke
   driver runs, **Then** it fails.

---

### Edge Cases

- A tournament whose days have unequal lengths — the longest day must not be
  truncated to the shortest, and no day may borrow another day's hours.
- A day short enough that an event assigned to it cannot fit: the event fails to
  place and is reported, and no event silently spills past the day's close.
- The eight-of-eight parity check includes the reference tournament the ledger
  records as **zero scheduled with one validation error**; parity there means
  the app also places nothing and surfaces the same failure, not that the check
  is skipped.
- A placement whose day index no longer addresses a configured day (days reduced
  after placement) stays out of range and is not silently re-homed onto another
  day.
- A shared link's placements are restored as clock times and render at those
  clock times.
- The single-day tournament, where the whole distinction is invisible and must
  stay correct anyway.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The schedule the app produces from its own inputs MUST match the
  schedule the engine produces for the same tournament through the drift
  ledger's path — same events placed, on the same days.
- **FR-002**: Each tournament day MUST be scheduled inside its own configured
  start and end times, independently of every other day's.
- **FR-003**: Every time value the user sees, edits, stores, or shares MUST be a
  wall-clock time in minutes from midnight. Any internal representation the
  scheduler uses MUST NOT leak into stored placements, shared links, the canvas,
  the schedule table, or tooltips.
- **FR-004**: The suite MUST carry an app-path parity check: for each of the
  eight reference tournaments, applying it through the app's own inputs and
  auto-scheduling MUST place an asserted number of events, and that number MUST
  be the drift ledger's count for that tournament unless a documented exception
  applies (FR-004a). The check MUST fail on any mismatch rather than absorb a
  new number.
- **FR-004a**: A tournament may be pinned at a count other than its ledger count
  only when the difference is traced to a per-competition default the app has
  not yet adopted (elimination staging, pre-allocated strips) and never to the
  day axis. Each such exception MUST record, beside the number, the ledger's
  count, the cause, and the feature that closes it (004's US4). The exception's
  own number is then gated exactly as the others are.
- **FR-005**: The drift ledger's recorded behavior for all eight reference
  tournaments MUST be unchanged by this feature — same snapshot, same asserted
  floors, no scenario scheduling fewer events (constitution III).
- **FR-006**: The rules that reason about how far apart two days are — crossover
  penalties, rest-day pairing, day sequencing, day coloring — MUST produce the
  same decisions after this change as before it, and the plan MUST state how
  that was established rather than assume it.
- **FR-007**: Any place that infers which day a time belongs to, rather than
  being told, MUST be identified and either given the day explicitly or shown to
  be correct under the reconciled axis.
- **FR-008**: The live smoke driver MUST assert a specific placed-event count at
  boot, and its other placement floors MUST be re-measured after this change and
  set to the measured numbers, with the reason recorded in the driver.
- **FR-009**: The engine's public behavior contract MUST NOT be widened to make
  this fix fit — no floor lowered, no assertion relaxed, no snapshot accepted
  without the diff being reviewed and explained.
- **FR-010**: 004's S6 session prompt MUST record that it is gated on this
  feature, so the scorecard is not baselined over an under-scheduled tournament.

### Key Entities

- **Day window**: A tournament day's open and close times. Authored by the user
  in clock time, one per day, and the only thing that says when a day begins and
  ends.
- **Placement**: An event's day and start time as the app records it — the
  single source of the user's scheduling intent, always in clock time.
- **Drift ledger**: The recorded behavior of the eight reference tournaments.
  The project's guarantee that engine changes are deliberate. After this
  feature, it describes the app.
- **App path**: The route from a chosen tournament through the app's own inputs
  to a scheduled result. Before this feature, untested end to end.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Opening the app with no shared link shows a canvas holding every
  event the engine can place for the boot tournament — 24 of 24 for the current
  default, against 11 today — and an unplaced tray holding only what the engine
  genuinely could not place.
- **SC-002**: For all eight reference tournaments, the app's placed-event count
  is asserted by a test in the normal suite, equal to the drift ledger's
  scheduled count except where a recorded per-default exception says otherwise —
  and no exception is attributable to the day axis.
- **SC-003**: The drift ledger's snapshot and floors are byte-identical before
  and after the change.
- **SC-004**: Setting two days to different hours produces a schedule in which
  every event falls inside its own day's hours, and narrowing one day leaves the
  other day's events where they were.
- **SC-005**: The live smoke run passes and reports an asserted, specific
  placed-event count at boot rather than "non-empty".
- **SC-006**: The full suite, the typecheck, and the lint pass, with no test
  deleted or floor lowered to achieve it.

## Assumptions

- **The two paths' remaining differences are not this feature's to close.** The
  app and the ledger also differ in two per-competition defaults (elimination
  staging and pre-allocated strips). The reassessment's isolation runs show the
  day windows are the cause of the shortfall and those two are noise, and 004's
  US4 owns per-type defaults. If, once the day axis is reconciled, a
  tournament's app-path count still differs from its ledger count, FR-004a
  applies: the difference is pinned and gated with its cause recorded, not
  closed here.
- **No backwards compatibility.** The product is unreleased. Links shared before
  this change need not decode to the same schedule, and no migration is written.
- **The reference tournaments themselves do not change.** No fixture's fencer
  counts, strips, days, or event list is edited by this feature. A parity gap is
  closed by fixing the code, never by editing a tournament until the numbers
  agree.
- **The engine's own contract is preferred untouched.** The reassessment names a
  store-side reconciliation as the leading option precisely because it leaves
  the engine byte-identical. If the plan finds that option unsound, changing the
  engine is permitted — under the full constitution III treatment, recorded in
  `research.md`.
- **Scope is the axis and its guard.** The debt items the reassessment lists
  alongside F1 — advisory validation wiring, partial-knowledge placement states,
  unreachable flighting, the re-homed rail — are not touched here.
- **Timing is not a criterion.** This is a correctness fix. No performance target
  is set beyond "the suite and the smoke run finish as they do today".

## Clarifications

### Session 2026-08-31

- Q: If a reference tournament's app-path count still differs from its ledger
  count after the day axis is reconciled, does 006 converge the app's
  per-competition defaults with the ledger's, or record the difference?
  → A: Record it and gate it. The parity check pins the app-path number for that
  tournament with the ledger's count, the cause, and the closing feature written
  beside it, so the difference is still guarded against drift. Converging the
  defaults stays 004's US4. Encoded as FR-004a.

## Out of Scope

- Per-type competition defaults (004's US4).
- The scorecard (004's US3), which waits on this.
- Advisory-versus-binding validation wiring, placement states for partial
  knowledge, flighting as user intent — all carried to P4.
- The rail rebuild (007).
- Any change to how days are assigned to events, or to the scheduler's packing
  strategy.

## Dependencies

- [`docs/design/reassessment-2026-08-31.md` §2](../../docs/design/reassessment-2026-08-31.md)
  is the record of the defect: repro, isolation runs, and fix options.
- [`docs/design/competition-planner-workbench.md` §Revised sequence (2026-08-31)](../../docs/design/competition-planner-workbench.md)
  places this feature ahead of 004's remaining sessions.
- 004's S6 does not start until this lands.
