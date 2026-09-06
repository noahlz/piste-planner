# Feature Specification: The suggested strip count is one a venue can supply

**Feature Branch**: `012-actionable-strip-suggestion`

**Created**: 2026-09-06

**Status**: Draft

**Input**: Make the strip suggestion actionable. 011 made the suggested count one
that schedules successfully; it did not make it one an organizer can act on. The
button returns two to three times the strips the tournament needs, so it reads as
broken.

## Context

011 closed with the suggestion arithmetically correct and practically unusable.
Its `handoff.md` §7 finding 2 recorded the defect and named this feature as the
fix. Every number below is `[M]` measured at `670c4da36e` on 2026-09-06, at
**days=4** — the day count the app actually boots at (`boot.ts:41` applies preset
B1), not the days=3 that `baseline.md`'s harness forces.

| Template | Events | Suggested | Smallest count that places every event | At 80 strips |
|---|---:|---:|---:|---:|
| NAC Youth | 24 | 197 | **76** | 24 of 24 |
| NAC Cadet/Junior | 24 | 144 | **48** | 24 of 24 |
| NAC Div1/Junior | 24 | 147 | **49** | 24 of 24 |
| NAC Vet/Div1/Junior | 66 | 268 | **96** | 66 of 66 |
| ROC Div1A/Vet | 12 | 23 | **15** | 12 of 12 |
| ROC Div1A/Div2/Vet | 18 | 37 | **16** | 18 of 18 |
| ROC Mega | 42 | 158 | **48** | 42 of 42 |
| RYC Weekend | 18 | 78 | **32** | 18 of 18 |
| RJCC Weekend | 12 | 54 | **24** | 12 of 12 |
| Junior Olympics | 18 | 135 | **49** | 18 of 18 |

The suggestion overshoots by 1.53× to 3.29×. The cause is the rule's own premise:
it sizes the venue so that every pool scheduled on the busiest day could run at
the same moment. Real tournaments run pools in waves across a fourteen-hour day,
so the premise describes a building nobody books. USA Fencing's largest event —
Summer Nationals, 6,100 fencers over ten days — is reported by the product owner
to run above 100 strips; every smallest-count figure above is at or below 96.

The corrective number already exists in the codebase as arithmetic nobody
inverts. `validateFeasibility` (`validation.ts:346`) sums
`estimateCompetitionStripHours` across the board and compares it to
`days × strips × day_hours`. Dividing that same demand by `days × day_hours`
yields the smallest strip count at which the work can possibly fit. `[M]` at
days=4 that floor is 53 / 38 / 66 / 32 / 37 on the five largest templates,
against smallest-working counts of 76 / 48 / 96 / 48 / 49 — a true lower bound
that under-shoots the answer by 25–50%, and therefore a starting point for a
search rather than an answer on its own.

Measured cost of a scheduler run, which is what makes a search affordable:
**0.6ms** on the smallest template, **7–12ms** on the 66-event NAC template
(`[M]` 2026-09-06, `performance.now()` around `scheduleAll`). Fewer strips is
*slower*, not faster — below its minimum a board grinds against contention — so a
scan runs entirely in the expensive region. Worst-case scan is estimated at
~350ms.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The suggested count is a number the venue can supply (Priority: P1)

An organizer planning a NAC opens the strip panel and presses **Suggest**. The
app fills in a strip count. Today that count is 197 or 268 and the organizer
knows immediately that no venue they can book has it, so they stop trusting the
button. After this feature the count is the smallest number of strips that
actually places every event on the board — 76, or 96 — a figure they can take to
a facility and price.

**Why this priority**: This is the defect. Everything else in the feature exists
to support it or to keep it honest. Shipped alone it restores the button's
credibility.

**Independent Test**: Press **Suggest** on each of the ten templates at the
day count the app boots with, and confirm the resulting count both places every
event and that one strip fewer does not.

**Acceptance Scenarios**:

1. **Given** a template loaded at the app's boot day count, **When** the
   organizer presses **Suggest**, **Then** the strip field holds a count at which
   every event on the board is placed.
2. **Given** that same suggested count, **When** the board is scheduled at one
   strip fewer, **Then** at least one event fails to place — the suggestion is
   the smallest count that works, not merely one that works.
3. **Given** any of the ten templates, **When** the organizer presses
   **Suggest**, **Then** the resulting count does not exceed the count the
   previous rule would have returned, and on the six largest templates it is less
   than half of it.
4. **Given** a board on which no strip count can place every event, **When** the
   organizer presses **Suggest**, **Then** the app does not write a misleading
   number into the strip field and says that no count was found.

---

### User Story 2 - The organizer sees the app working rather than frozen (Priority: P2)

The search re-runs the scheduler once per candidate strip count, so the button
takes noticeably longer than an instant on the largest boards. The organizer sees
an indicator telling them the app is searching, rather than an interface that
appears to have stopped responding.

**Why this priority**: Without it US1 ships a button that appears broken in a new
way. It is P2 rather than P1 because the delay is a few hundred milliseconds, not
seconds, so US1 is still an improvement without it.

**Independent Test**: Press **Suggest** on the largest template and confirm an
indicator appears and clears, and that a small template completes without the
indicator ever flashing into view.

**Acceptance Scenarios**:

1. **Given** a large board whose search takes longer than the reveal delay,
   **When** the organizer presses **Suggest**, **Then** an indicator appears
   naming what the app is doing, and clears when the count is written.
2. **Given** a small board whose search finishes faster than the reveal delay,
   **When** the organizer presses **Suggest**, **Then** no indicator is ever
   shown — the count simply appears.
3. **Given** a search in progress, **When** it is running, **Then** the strip
   field does not show intermediate candidate counts.

---

### User Story 3 - When the plan does not fit, the app names what to change (Priority: P2)

The organizer schedules a board that does not fit. The app reports the shortfall
and names the things they could change, in the order they can actually change
them: add a day, flight events, cap entries, add strips. Strips come last because
strips mean renting more of the facility, which is the most expensive and the
hardest to arrange.

**Why this priority**: It is the half of the problem that survives a correct
suggestion — an organizer whose venue is fixed needs to know what else to move.
Independent of US1: it changes what the app says after scheduling, not what
**Suggest** computes.

**Independent Test**: Schedule a board that cannot fit and confirm the reported
advice names all four levers in the stated order, and that scheduling triggers no
strip search.

**Acceptance Scenarios**:

1. **Given** a board whose work exceeds its resources, **When** it is scheduled,
   **Then** the reported advice names adding days, flighting, capping entries,
   and adding strips, in that order.
2. **Given** any board at all, **When** it is scheduled, **Then** the number of
   scheduler runs performed is exactly one — the advice performs no search.
3. **Given** a board that fits, **When** it is scheduled, **Then** no lever
   advice is reported.

---

### Edge Cases

- **No competition can be sized.** Every event has one fencer or fewer, so no
  pool can form. The existing rule answers "no suggestion" rather than zero, and
  that distinction survives: the strip field keeps whatever the organizer had.
- **The board cannot be placed at any strip count.** Some events fail for reasons
  strips cannot fix — a deadline, a structural conflict. The search must stop at
  its upper bound and report that no count was found, never return the bound as
  though it worked.
- **The floor already places every event.** The scan performs one run and stops.
  This is the expected case on small regionals.
- **The floor exceeds the upper bound.** Arithmetic that should not occur, since
  the bound sizes for full concurrency and the floor for aggregate demand. It
  must fail loudly rather than scan a backwards range.
- **A board whose smallest working count exceeds any plausible venue.** The app
  reports the number it found. Judging whether 300 strips is bookable is the
  organizer's, and the lever advice is what serves them.
- **Scheduling is not monotonic in strip count.** More strips placing fewer
  events is not proven impossible. Scanning upward from a true lower bound
  returns the smallest working count regardless, which is why the scan is
  specified rather than a bisection.

## Requirements *(mandatory)*

### Functional Requirements

**The suggestion**

- **FR-001**: The strip suggestion MUST return the smallest strip count at which
  every event on the board is placed.
- **FR-002**: The suggestion MUST determine that count by evaluating candidate
  counts upward from a lower bound derived from aggregate strip-hour demand,
  stopping at the first count that places every event.
- **FR-003**: The lower bound MUST be the aggregate strip-hours the board
  requires divided by the schedulable hours available across the tournament's
  days — the same demand estimate the feasibility finding already reports.
- **FR-004**: The search MUST be bounded by an explicit upper limit and MUST
  fail loudly rather than continue past it (constitution IV). The busiest-day
  concurrency figure is that limit.
- **FR-005**: The busiest-day concurrency figure MUST NOT be presented to the
  user in any surface. It survives only as the search's internal upper bound.
- **FR-006**: When no candidate count places every event, the suggestion MUST
  report the absence of an answer and MUST NOT write a count into the strip
  field. This extends 011's FR-010 distinction between "no answer" and "zero".
- **FR-007**: The suggestion MUST NOT return a count greater than the previous
  rule returned for the same board.

**Cost and feedback**

- **FR-008**: An indicator MUST be shown while a search is running, revealed
  only after a fixed delay has elapsed, so that searches shorter than the delay
  never display it.
- **FR-009**: The indicator MUST state what the app is doing, not merely that it
  is busy.
- **FR-010**: The strip field MUST NOT display intermediate candidate counts
  during a search.

**The post-schedule advice**

- **FR-011**: The advice reported after scheduling MUST NOT run the scheduler.
  It is computed from arithmetic over the configuration alone.
- **FR-012**: When a board's work exceeds its resources, the advice MUST name
  four levers in this order: add days, flight events, cap entries, add strips.
- **FR-013**: The advice MUST continue to report the shortfall figures the
  feasibility finding reports today — strip-hours needed, available, and the
  arithmetic day and strip equivalents. Those are pure arithmetic and are not
  what FR-011 excludes.
- **FR-014**: Capping entries MUST be named as prose only. The application does
  not model per-event entry caps, and this feature does not add them.

**The split**

- **FR-015**: The post-schedule finding MUST NOT report a strip count of its own.
  All three available numbers are barred: the searched answer by FR-011 (and by
  recursion, since the finding is produced inside scheduling), the concurrency
  ceiling by FR-005, and the strip-hours floor by 011's own rejection of
  strip-hours-over-day-length as a recommendation. The finding reports the levers
  and the shortfall figures FR-013 preserves.
- **FR-016**: The **Suggest** search MUST be the only strip-count rule in the
  product. This resolves 011's FR-008 — which merged two implementations of one
  rule to remove a duplicate — by removing one of the two outright rather than
  re-splitting them, so no duplicate is reintroduced.
- **FR-017**: The strip-hours floor MUST NOT be presented to the user in any
  surface. It is the search's internal starting point only. Reporting it would
  claim a pool round can run on fewer strips over more hours, which is the
  ad-hoc double-stripping practice the project does not model.

**The record**

- **FR-018**: The drift ledger's recorded strip recommendation MUST track the
  number the product shows — the searched count — rather than being removed when
  the rule behind it is. Its value moves on every B1–B8 scenario. Each movement
  MUST be explained in the task that causes it, and no scenario's scheduled event
  count may fall (constitution III).

### Key Entities

- **Strip-hours floor**: the smallest strip count at which the board's aggregate
  work can possibly fit in the available days. A necessary condition, never a
  sufficient one, and never shown to a user (FR-017).
- **Concurrency ceiling**: the strip count at which every pool of the busiest day
  could run simultaneously. Provably sufficient, never user-visible after this
  feature, and used only to bound the search.
- **Smallest working count**: the smallest strip count at which every event is
  placed. What **Suggest** returns.
- **Lever**: a change an organizer can make when a board does not fit. Four
  exist, ranked by how readily an organizer can make them.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On all ten templates at the app's boot day count, the suggested
  strip count places every event on the board.
- **SC-002**: On all ten templates, one strip fewer than the suggested count
  fails to place at least one event.
- **SC-003**: No template's suggested count exceeds what the previous rule
  returned, and on the six templates that previously exceeded 100, the new count
  is less than half the old one.
- **SC-004**: Every template's suggested count is at or below 100 strips, the
  scale the product owner identifies as the ceiling for the largest event USA
  Fencing runs.
- **SC-005**: Scheduling a board performs exactly one scheduler run, unchanged
  from today — the advice adds none, and it reports no strip count of its own.
- **SC-005a**: Neither the concurrency ceiling nor the strip-hours floor appears
  in any user-visible text.
- **SC-006**: No B1–B8 scenario places fewer events than its recorded floor.
- **SC-007**: Pressing **Suggest** on the largest template returns its count in
  under two seconds, and on a template that completes faster than the reveal
  delay no indicator is displayed.
- **SC-008**: A live smoke step presses **Suggest** in the running app and
  measures both the resulting count and a full board at that count.

## Assumptions

- **The app's day count is 4, not 3.** `boot.ts:41` applies preset B1, whose
  fixture is four days; the store's initial `days_available` of 3 is never what a
  user sees. All figures in this spec are measured at 4. `baseline.md` §5's
  days=3 column is a harness artifact and is not comparable.
- **Templates run as NAC regardless of name.** `applyTemplate` does not set
  tournament type, so a template chosen from initial state schedules as a NAC.
  This is the app's real behaviour and the measurement method preserves it.
- **A scheduler run costs 0.6–12ms.** Measured 2026-09-06. If a future change
  makes runs substantially more expensive, the scan's cost assumption needs
  re-measuring before it is trusted.
- **Scheduling is assumed non-monotonic in strip count.** Monotonicity held at
  every sampled point on all ten templates but was not proven, so the design does
  not depend on it.
- **The 100-strip ceiling is the product owner's judgement**, offered with
  reference to USA Fencing Summer Nationals. The cited article confirms the
  event's scale — 6,100 fencers, ten days — but does not state a strip count. The
  figure is treated as domain judgement, not as a sourced constant, and SC-004
  uses it as a sanity check rather than an enforced limit.

## Out of Scope

Each of these was raised during this feature's brainstorming and deliberately
left out. All are recorded in `docs/design/backlog.md`.

- **Per-event entry caps.** Named as a lever (FR-014) but not modelled. The one
  lever that reduces work rather than adding capacity, and it needs a new field
  carried through configuration, serialization, and the shared URL.
- **The 2026-27 Elite/National split.** A 168-entry threshold that would apply to
  nearly every event in the NAC templates, where the published 315-entry cap
  applies to none of them.
- **Replacing the templates with a real season.** The templates are rounded
  invented numbers. Every figure this project has measured rests on them.
- **A configurable maximum strip count.** Considered and dropped: `# of Strips`
  already holds the venue's capacity, and a cap over an incorrect rule would have
  produced six false alarms across the ten templates where a correct rule
  produces none.
- **An experimental mode** that re-exposes rules the product should not show.
  Rejected here; revisit only once the engine accepts pluggable rules.
- **Re-running the engine when a parameter changes.** Today the engine runs on an
  explicit action. Making parameter edits re-run it needs debouncing and a shared
  indicator policy.
- **Checking hand placements against the crossover constraint graph.** The
  largest gap found during this brainstorming: the auto-scheduler enforces
  demographic crossover rules and drag-drop does not, so the two halves of the
  app disagree about what is legal.
- **The shortfall that strips cannot fix.** Events that fail on deadlines or
  structural conflicts are unchanged by this feature, as in 011.
