# Feature Specification: Team-event cut default

**Feature Branch**: `008-team-event-cut`

**Created**: 2026-08-31

**Status**: Draft

**Input**: User description: "Team events reach the engine with a percentage cut, a BINDING validation error that discards the whole tournament schedule"

## Context

The record of this defect is
[`docs/design/backlog.md` §Team events block their whole tournament](../../docs/design/backlog.md),
written by feature 006 while classifying its parity exceptions, with the
per-scenario isolation evidence in
[`specs/006-day-axis-parity/parity-exceptions.md`](../006-day-axis-parity/parity-exceptions.md)
(B2's and B8's rows). That is the authoritative scope statement — this spec
does not restate its cause analysis, it states what the product must do
instead.

One sentence: a competition's default cut is derived from its category alone,
with no branch for team events, so a team event reaches the engine carrying a
percentage cut. The engine rejects that outright, and the rejection is
tournament-wide rather than event-wide, so the user gets an empty schedule.

**Where the backlog section lives**: on the `004-p3-workbench-shell` branch,
not on `main`. 006 wrote it there. This feature branches from `main`, so its
closure edit lands on a section `main` does not yet carry — see
[Assumptions](#assumptions).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A tournament with team events gets a schedule (Priority: P1)

An organizer picks a tournament template that includes team events — four of
the ten shipped templates do (`NAC Cadet/Junior`, `NAC Div1/Junior`,
`NAC Vet/Div1/Junior`, `Junior Olympics`) — sets fencer counts, and asks for a
schedule. Today the board comes back completely empty: not one event placed,
including every individual event in the same tournament, which had nothing
wrong with it. The organizer has no way to tell from the board that the cause
is a per-event setting on the team events, and no reason to suspect one.

**Why this priority**: it is the whole defect. Two of the eight reference
tournaments and four of the ten templates schedule nothing today, and nothing
else in this feature matters if this does not change.

**Independent Test**: apply a team-bearing template, run the scheduler, and
confirm a non-empty schedule. Measurable against the drift ledger through the
existing app-path parity harness, which drives the app's own route.

**Acceptance Scenarios**:

1. **Given** a tournament whose competitions include team events, **When** the
   competitions are first added or a template is applied, **Then** each team
   event's cut is the all-advance setting the engine requires of team events,
   and no cut-related validation error is raised for it.
2. **Given** reference tournament B2 (a NAC with six Cadet team events),
   **When** the app's own route schedules it, **Then** it places 24 events —
   the count the drift ledger records for the same tournament.
3. **Given** reference tournament B8 (a Div1 NAC with five team events),
   **When** the app's own route schedules it, **Then** it places 53 events,
   which is one above the ledger's 52 for reasons this feature measures rather
   than assumes.
4. **Given** any tournament with no team events, **When** it is scheduled,
   **Then** its placed count is unchanged from before this feature.

---

### User Story 2 - The parity record tells the truth after the fix (Priority: P2)

The app-path parity check pins each reference tournament's placed count and
requires any pin that differs from the drift ledger to carry a written,
evidenced exception. This fix moves two pins. B2 lands exactly on the ledger,
so its exception must be *removed*, not updated — a stale exception is a
failure the suite already detects. B8 lands one above the ledger, so it keeps
an exception, but the entry now describes a +1 rather than an empty schedule,
and it names what accounts for the +1 and which feature closes it.

**Why this priority**: the pins are how anyone later knows whether this fix
held. Leaving them stale would leave the app's most load-bearing regression
gate asserting a defect.

**Independent Test**: run the parity suite. It fails if a pin moves without a
matching exception entry, and equally if an exception survives after its pin
reaches the ledger's count.

**Acceptance Scenarios**:

1. **Given** the fix is in place, **When** the parity suite runs, **Then** B2
   is pinned at the ledger's count and carries no exception.
2. **Given** the fix is in place, **When** the parity suite runs, **Then** B8
   is pinned at its measured count with an exception that states the +1, its
   evidence, and its closing feature.
3. **Given** the parity suite's pins and exception table, **When** either is
   edited without the other, **Then** the suite fails.
4. **Given** the published classification document that the pins summarize,
   **When** a reader compares it to the pins, **Then** the two agree on every
   reference tournament.

---

### User Story 3 - The default indicator stays honest (Priority: P3)

The rail's per-competition overrides table marks each field as "default" or
not by comparing the current value against the default the app would have
applied. Once team events default to all-advance, that comparison — which
knows only about categories — reports every team event's cut as user-modified
the moment it is created, before the user has touched anything.

**Why this priority**: it is a defect this feature introduces if left alone,
and it is small. It is not a pre-existing gap being opportunistically fixed.

**Independent Test**: create a team competition, open the overrides table, and
confirm its cut field reads as default until the user changes it.

**Acceptance Scenarios**:

1. **Given** a newly added team competition, **When** its row is shown in the
   overrides table, **Then** its cut mode is marked as the default.
2. **Given** a team competition whose cut the user has changed, **When** its
   row is shown, **Then** its cut mode is no longer marked as the default.
3. **Given** an individual competition, **When** its row is shown, **Then**
   the marking is unchanged from before this feature.

---

### Edge Cases

- **A category whose individual default is already all-advance** (Veteran,
  Div1A, Div2, Div3, Y8/Y10/Y12). Their team events are correct today by
  coincidence — which is exactly why B1, whose team events are Veteran, has
  never shown this defect. The fix must not change their values.
- **A team event the user has deliberately given a cut.** The engine rejects
  it, and it must keep rejecting it. This feature changes what the app
  *defaults* to, never what it permits.
- **A serialized tournament saved before this fix**, carrying a percentage cut
  on a team event. The product is unreleased and carries no back-compatibility
  obligation, so such a file continues to load exactly as saved and continues
  to be rejected by the engine. Nothing migrates it.
- **A tournament where team events are the only events.** It must schedule,
  not merely stop erroring.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A competition created from the catalogue MUST receive a default
  cut that is valid for its event type. For a team event that is the
  all-advance setting the engine's team rule requires.
- **FR-002**: The default MUST be applied by every route that creates a
  competition from the catalogue — selecting competitions, adding one, and
  applying a template — not by one of them.
- **FR-003**: Individual competitions' defaults MUST be unchanged, value for
  value, across every category.
- **FR-004**: The app path MUST place a non-zero count for every reference
  tournament that contains team events.
- **FR-005**: The app-path parity pins MUST be re-measured against the running
  code, not predicted, and each pin that differs from the drift ledger's count
  MUST carry an exception stating its cause, the isolation run behind it, and
  the feature that closes it.
- **FR-006**: An exception whose pin now equals the ledger's count MUST be
  removed from both the suite's table and the published classification.
- **FR-007**: The engine (`src/engine/`) MUST NOT change. The drift ledger's
  recorded behavior MUST be byte-identical before and after.
- **FR-008**: The overrides table's default indicator MUST agree with the
  default the app actually applies, for team and individual events alike.
- **FR-009**: The backlog section that records this defect MUST be closed when
  the feature lands, in the same form the day-axis section was closed by 006.

### Key Entities

- **Competition default config**: the per-competition settings the app derives
  from a catalogue entry when the competition first appears — fencer count,
  referee policy, cut mode and value, DE mode, video policy. The cut pair is
  what this feature changes, and only for team events.
- **Parity pin**: one reference tournament's expected app-path placed count,
  plus, when it differs from the drift ledger, a written exception recording
  why.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every reference tournament containing team events schedules a
  non-empty result. Today two of eight schedule nothing; after this feature,
  zero do.
- **SC-002**: B2's app-path count goes from 0 to 24 and equals the drift
  ledger's count for the same tournament, with no exception recorded.
- **SC-003**: B8's app-path count goes from 0 to a measured non-zero number,
  with a written exception accounting for its distance from the ledger's 52.
- **SC-004**: The six reference tournaments without a blocking team event
  place exactly the counts they placed before this feature.
- **SC-005**: The drift ledger snapshot is unchanged, and the engine diff
  against `main` is empty.
- **SC-006**: The full test suite passes on two consecutive runs, with every
  test-count change from the 1274-passed / 55-file baseline accounted for.
- **SC-007**: The live smoke driver passes against the running app, with a
  team-bearing template exercised end to end rather than assumed.

## Assumptions

- **The all-advance setting is the correct team default**, not merely a valid
  one. Team events in USA Fencing advance every team to the DE table, the
  engine's team rule states it as a requirement rather than a preference, and
  the drift ledger's own factory has encoded it since it was written.
- **The +1 on B8 is not this feature's to explain away.** 006 measured 53 and
  deliberately left the residual unattributed. This feature measures it again
  and records what it finds, and records that it remains open if it cannot
  attribute it. It does not tune anything to reach 52.
- **The backlog closure will conflict at merge.** The section being closed
  exists only on the `004-p3-workbench-shell` branch. Whichever branch the
  user merges second will conflict on that region of `docs/design/backlog.md`,
  and the resolution is to keep this feature's closed form. The handoff states
  this explicitly rather than leaving it to be discovered.
- **`src/store/store.ts` will conflict at merge** for an unrelated reason:
  004's S6 is adding fields to the UI slice in the same file while this
  feature changes the competition-default helper. Different regions, same
  file, and the user reconciles it.
- **No migration, no compatibility shim.** The product is unreleased
  (`docs/design/` records this as standing policy), so a saved tournament with
  the old value is not this feature's problem.

## Out of Scope

- The other three parity exceptions — B4's `strips_allocated`, B6's regional
  cut override and DE staging. They are per-*tournament-type* defaults and
  belong to 004's US4, which this feature must leave measurable.
- Converging the drift ledger's own factory with the app's defaults. That
  changes the ledger's recorded behavior and is a constitution III event with
  its own snapshot review.
- Advisory-vs-binding validation wiring: making the engine reject one event
  rather than the whole tournament, or surfacing which event blocked it. The
  app would still be sending a configuration the engine is right to reject.
- Any change to `src/engine/`.
