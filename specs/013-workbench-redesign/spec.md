# Feature Specification: The workbench is rebuilt on the approved design

**Feature Branch**: `013-workbench-redesign`

**Created**: 2026-09-07

**Status**: Draft

**Input**: Rebuild the workbench on the Claude Design mockup *Piste Planner
Workbench*: one screen with a header, an unplaced dock, a tool rail with five
inspector panels, a canvas on the mockup's DOM model with a bounded zoom ladder
and weapon colouring, a detail strip for the selected event with Pin, Move day
and Flight, a Findings panel that jumps to its event and adds two derived
findings, a footer with the Matrix ⇄ Schedule toggle, the Schedule view restyled
after USA Fencing's published schedules with a print mode, Export, one preset
picker, and every deletion the design retires. One engine story: Auto-assign
schedules around pinned events. No drag. Worktree flow.

## Context

The record for this feature is
[docs/design/workbench-design-alignment-2026-09-07.md](../../docs/design/workbench-design-alignment-2026-09-07.md).
Its §9 holds every decision, taken by the product owner on 2026-09-07, and its
§3 lists the mockup's own inconsistencies with their resolutions. Where this
spec and that document differ, §9 is the rule. The mockup itself is the visual
target: Claude Design project *Piste Planner Workbench*, file `Piste Planner
Workbench.dc.html`. Its page script's `reflowDay`, `findSlot`, `dayStats` and
`buildFindings` are prototype stand-ins for the engine and the derived
selectors, never behaviour to port.

The design is a new surface over a model that already exists. Placements are
intent and the schedule derives on read, the derived selectors already produce
what the footer and day bands show, presets B1–B8 and the ten templates already
load, and nothing under the engine has to change for any static surface
(alignment §2). What has to change is the shell that shows it, and one
interaction the engine cannot yet honour: an organizer who pins Veteran Men's
Epee to Day 2 means it, and today Auto-assign overwrites the pin.

Facts this spec rests on, `[M]` at `78ae3b28f4` on 2026-09-07:

| Fact | Value | Where |
|---|---|---|
| Preset B1 | NAC, 4 days, 80 strips, 12 video strips, 24 events | `src/data/tournaments.ts` |
| Catalogue | 120 entries | `__tests__/engine/catalogue.test.ts` |
| Drift ledger floors | B1 24 · B2 24 · B3 24 · B4 17 · B5 12 · B6 45 · B7 18 · B8 52 | `__tests__/engine/driftLedger.test.ts` |
| Minimum fencers per event | 2 | `src/engine/constants.ts` |
| Smoke driver | 1,092 lines, four **Suggest** presses (alignment §6 says three – four is the measured count) | `scripts/smoke.mjs` |

The feature after this one, 014 manual placement, adds drag and the crossover
check for hand placements. Nothing in 013 drags. Every placement change goes
through a button, so the one route to the unchecked-crossover gap is **Move
day**, and this spec says so where it applies (FR-047).

## Clarifications

### Session 2026-09-07

- Q: When the day count shrinks and a pinned event's day no longer exists,
  what does Auto-assign do with the pin? → A: Drop the pin and re-place the
  event. It counts as unplaced, a finding names it, and the next run places it
  afresh, unpinned (FR-060).
- Q: When Move day pushes an event past the day's close, is that the same
  Warning as a late finish or its own Blocking finding? → A: One finding, Late
  finish, at Warning. Its message states the margin before close or the minutes
  past it. Auto-assign stays enabled (FR-025).
- Q: With no drag, can an unplaced event be placed by hand from the dock? →
  A: No. Auto-assign is the only way an unplaced event gets a slot in 013.
  Clicking a dock chip selects the event and opens the detail strip without
  Pin or Move day (FR-010, FR-044).
- Q: Should a template in the shared picker also set the tournament type its
  name implies? → A: No. A template sets events and fencer counts only, as
  today. The type stays whatever is set, so the counts 012 measured and the
  smoke driver asserts do not move (FR-005).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - One screen (Priority: P1)

An organizer opens the app and sees one screen: a slim header naming the loaded
tournament and its type, days and strips, a row of chips for the events that
have no slot, a narrow rail of five icons down the left, the grid, and a status
bar along the bottom. Nothing is repeated. The header states the tournament and
the panels are where it is edited. The old two-bar header, the rail of
collapsible sections, and the bottom drawer with its scorecard are gone.

**Why this priority**: Every other story hangs off this shell. It is also where
the product owner judges density and legibility at real size, at 80 strips on
B1, before the canvas is rebuilt against a look nobody has approved
(alignment §8).

**Independent Test**: Load preset B1. Confirm one header, one dock, one rail,
one footer, and no second copy of type, days or strips anywhere on screen. Take
the screenshot the product owner reviews.

**Acceptance Scenarios**:

1. **Given** the app at boot, **When** it renders, **Then** the screen shows
   exactly one header, an unplaced dock beneath it, a rail with five buttons on
   the left, the canvas, and a footer, and no "Work in Progress" badge, top bar,
   drawer or scorecard.
2. **Given** preset B1 loaded, **When** the organizer reads the header, **Then**
   it states the tournament type, day count and strip count as text, and none
   of the three can be edited there.
3. **Given** the preset picker open, **When** the organizer reads it, **Then**
   it lists the eight tournaments under one heading and the ten templates under
   a second heading that says their figures are invented, and choosing either
   kind records which preset loaded.
4. **Given** a board with three events unplaced, **When** the organizer reads
   the dock, **Then** each of the three shows its name, the strips it needs and
   its pool and elimination durations, coloured by weapon.
5. **Given** every event placed, **When** the organizer reads the dock, **Then**
   it says every event has a slot.
6. **Given** the organizer presses **Auto-assign**, **When** the run finishes,
   **Then** the header shows the clock time of that run, and the dock's note
   says how many events the run placed and how many it could not.
7. **Given** any blocking finding, **When** the organizer looks at
   **Auto-assign**, **Then** it is disabled.
8. **Given** the Export control, **When** the organizer opens it, **Then** it
   offers save to file, load from file, share link, and copy, and warns when a
   load would drop placements.
9. **Given** the footer, **When** the organizer reads it, **Then** it shows the
   placed, unplaced and pinned counts, the tournament finish, peak referees,
   strip use, a weapon legend, and the Matrix ⇄ Schedule toggle, with no
   change-since-preset figures beside any number.
10. **Given** an event's fencer count that would break the app today, **When**
    the shell hits a rendering error, **Then** the organizer sees a message and
    a way to recover rather than a blank page.

---

### User Story 2 - The five inspector panels (Priority: P1)

Each rail button opens one panel, floating over the grid or docked beside it.
Tournament sets type, days and day hours. Strips & referees sets strips and
video strips, shows the suggested minimum with an **Apply**, and states the
referees per pool the type implies. Events shows one card per gender and weapon
with a chip per category, and the selected chip is where the fencer count is
edited. Settings sets pool durations per weapon and the tournament's DE mode.
Findings is story 5.

**Why this priority**: These panels replace every input the old rail carried.
Without them the shell is a picture. They ship with story 1's shell in the sense
that no old control is removed before its replacement exists (FR-066).

**Independent Test**: Open each panel from the rail, change each input, and
confirm the header summary, the canvas and the footer follow. Confirm no input
for referees available, admin gap, flight buffer, per-event cut, per-event DE
mode, per-event video policy or per-event referee policy exists anywhere.

**Acceptance Scenarios**:

1. **Given** the Tournament panel, **When** the organizer reads the type pills,
   **Then** all six tournament types are offered, SJCC included, and choosing
   one updates the header summary.
2. **Given** a shared link carrying five days, **When** the Tournament panel
   opens, **Then** the days row shows 2, 3, 4 and a fourth pill reading 5 that
   cannot be clicked, with the existing out-of-range notice.
3. **Given** the Strips panel open, **When** the search finishes, **Then** the
   card states the smallest strip count that places every event, the strip
   field is unchanged, and pressing **Apply** writes that count into it.
4. **Given** the Strips panel open on the largest template, **When** the search
   takes longer than the reveal delay, **Then** the indicator names what the app
   is doing and clears when the number appears.
5. **Given** the video-strips stepper, **When** the organizer has changed it,
   **Then** a control returns it to following the tournament type and the
   Default marker reappears.
6. **Given** the Events panel, **When** the organizer reads a card, **Then** it
   lists that gender and weapon's individual categories, then the six veteran
   bands, then the team categories suffixed "Team", and the panel heading
   states how many of the 120 are selected.
7. **Given** a selected chip, **When** the organizer edits its fencer count,
   **Then** the count changes in place and the input refuses any value below the
   engine's minimum.
8. **Given** the Settings panel, **When** the organizer reads it, **Then** pool
   durations are listed per weapon with default, override and reset, DE mode
   offers Staged and Single for the whole tournament, and there is no row for
   admin gap, flight buffer or video strips.
9. **Given** the Settings panel's DE mode set to Single, **When** a share link is
   generated and opened, **Then** the setting survives the round trip.

---

### User Story 3 - The canvas at every scale (Priority: P2)

The grid scrolls like a page. The time axis, the day bands and the strip gutter
stay put while the organizer scrolls. Zoom steps through six fixed levels and a
**Fit day** mode that sizes one day to the visible width, and no step can
flatten the grid into an unreadable smear. Blocks are coloured by weapon,
elimination blocks are hatched and carry a bracket icon, pool blocks a grid
icon, and the name text carries category and gender. A pinned block wears a
badge, a block the packer could not fit is drawn dashed, and a gutter row is
flagged when a finding points at an event on that day.

**Why this priority**: The current canvas has three recorded defects – no
affordance that it scrolls, a zoom that destroys the view, and a block encoding
that fails at a glance (backlog §The workbench canvas is not yet a finished
surface). This story closes all three by construction. It follows stories 1 and
2 because its look was judged there.

**Independent Test**: Load B1 at 80 strips, scroll every axis with the mouse
wheel and the scrollbar, step the zoom to both ends, press **Fit day**, and
confirm every strip row of every day is present and every block is legible at
each step.

**Acceptance Scenarios**:

1. **Given** B1 at 80 strips and four days, **When** the canvas renders,
   **Then** every one of the 320 strip rows is in the document and the browser's
   own scrollbars scroll them, with the time axis, day bands and gutter sticky.
2. **Given** any zoom level, **When** the organizer presses zoom in or zoom out
   repeatedly, **Then** the view stops at the ladder's last rung and the button
   disables, and no rung produces a grid narrower than its blocks can label.
3. **Given** **Fit day** on, **When** the window is resized, **Then** one day
   fills the visible width again.
4. **Given** a foil, an epee and a sabre event on one day, **When** the
   organizer reads the blocks, **Then** each weapon has one fill colour, the
   elimination phase of each is hatched, and the name text names category and
   gender.
5. **Given** an event pinned and another that the packer could not fit within
   the strip count, **When** the canvas renders, **Then** the first wears a pin
   badge and the second is drawn dashed.
6. **Given** a finding that points at an event on Day 2, **When** the organizer
   reads Day 2's gutter, **Then** the rows that event occupies are flagged.
7. **Given** any day, **When** the organizer reads its band, **Then** it states
   `Day N`, the event count, the finish time, strips at peak against the strip
   count, and the number of findings on that day, with no calendar date.
8. **Given** a block, **When** the organizer hovers it, **Then** the tooltip
   still carries name, weapon, category, gender, day, phase, start, end,
   duration, strips and findings.
9. **Given** any time shown anywhere on the canvas, **When** it is read,
   **Then** it is in 24-hour form.

---

### User Story 4 - Select an event and act on it (Priority: P2)

Clicking a block selects it. A detail strip slides up under the canvas naming
the event, its day, the strip rows it occupies this render, its fencer count,
and a pill per phase with times. Three buttons: **Pin** fixes the event where it
is, **Move day** moves it to another day at the same start time, and **Flight**
splits its pools into two flights. The strip collapses to one line and can be
dismissed.

**Why this priority**: This is the first time the app has a selection – the
canvas has carried a selection prop nothing sets since the original shell – and
the three buttons are the only placement edits in 013. Pin's promise is kept by
story 6, and the feature does not close with this story delivered and story 6
not.

**Independent Test**: Select a block, press each of the three buttons, and
confirm the placement changes in the store, on the canvas, in the Schedule view
and in the shared link.

**Acceptance Scenarios**:

1. **Given** no selection, **When** the organizer clicks a block, **Then** the
   block shows a selection ring and the detail strip appears with name, day,
   strip rows, fencer count and phase pills with start and end times.
2. **Given** a selected event, **When** the organizer presses **Pin**, **Then**
   the button reads **Pinned**, the block wears the badge, and the footer's
   pinned count rises by one.
3. **Given** a selected event on Day 1 starting at 8:00, **When** the organizer
   moves it to Day 3, **Then** it is on Day 3 starting at 8:00, pinned, and
   marked as a manual placement.
4. **Given** a move that pushes the event past the new day's end, **When** the
   canvas re-renders, **Then** the late-finish finding names it, and no
   crossover finding is raised.
5. **Given** a selected event with one pool round, **When** the organizer
   presses **Flight**, **Then** its pools draw as Flight A and Flight B, the
   button reads as on, and the flag survives a share-link round trip.
6. **Given** a selected event, **When** the organizer presses the strip's
   collapse control, **Then** it shrinks to one line naming the event, and the
   dismiss control clears the selection.
7. **Given** the feature is delivered, **When** any surface is searched for the
   old flighting suggestions and their accept and reject, **Then** none exists.

---

### User Story 5 - Findings that lead to the event (Priority: P2)

The Findings panel lists every finding with a severity badge, where it applies,
and its message. Where a finding points at an event, a **Show on grid** button
selects that event, scrolls it into view and flashes it. Two findings are new:
**Unplaced**, one per block the packer could not fit within the strip count, and
**Late finish**, one per day whose last event ends inside the final 45 minutes
before the venue closes or after it. The rail's Findings button carries the
count.

**Why this priority**: The mockup's Findings panel is the design's answer to
"what is wrong and where". It needs stories 3 and 4 for the jump.

**Independent Test**: Produce a board with one overflow, one late finish and one
blocking finding. Confirm each appears with the right badge, that **Show on
grid** is offered for the two that name an event and not for the one that does
not, and that the jump reaches the block.

**Acceptance Scenarios**:

1. **Given** a board with findings of every severity, **When** the panel opens,
   **Then** each finding shows one of Blocking, Warning, Note or Unplaced, its
   day or subject, and its message.
2. **Given** a finding that names an event, **When** the organizer presses
   **Show on grid**, **Then** that event is selected, its block is scrolled into
   view, and it flashes.
3. **Given** a finding that names no event, **When** the organizer reads it,
   **Then** there is no **Show on grid**.
4. **Given** an event the packer could not fit within the strip count, **When**
   the panel opens, **Then** an Unplaced finding names it and the strips it
   needs.
5. **Given** a day whose last event ends 30 minutes before the day's end,
   **When** the panel opens, **Then** a Late finish finding names that event and
   the margin.
6. **Given** a Warning the organizer dismissed, **When** the panel re-renders
   after an edit that does not change the finding, **Then** it stays hidden.
7. **Given** any board, **When** the panel opens, **Then** no finding compares
   referees needed against a referee count, because there is none.
8. **Given** three undismissed findings, **When** the organizer reads the rail,
   **Then** the Findings button's badge reads 3.

---

### User Story 6 - Auto-assign schedules around pinned events (Priority: P2)

An organizer pins Veteran Men's Epee – the age groups, the Team, the Combined –
to the days and times they have promised those fencers, then presses
**Auto-assign**. The pinned events stay exactly where they are. The engine
treats them as already on the board: their days are decided before day
assignment runs, so their crossover neighbours are kept off those days, and
their strip-time is claimed before packing runs, so the rest of the day packs
around them. Every event the run places is unpinned.

**Why this priority**: This is the one engine story and the reason the Pin
button is worth having. Its risk is silent: a change to the scheduler that
moves any B1–B8 count on the path with no pins is a regression whatever the
pinned path does.

**Independent Test**: On B1, pin six events across three days, run
**Auto-assign**, and confirm all six keep their day and start while the other
eighteen are placed. Run the drift ledger with no pins and confirm every
scenario's scheduled count is unchanged.

**Acceptance Scenarios**:

1. **Given** six pinned events on B1, **When** **Auto-assign** runs, **Then**
   each of the six has the same day and start time it had before, is still
   pinned, and the remaining eighteen are placed and unpinned.
2. **Given** an event pinned to Day 2 and another event that a crossover rule
   forbids from sharing its day, **When** **Auto-assign** runs, **Then** the
   second event is placed on a different day.
3. **Given** an event pinned at 9:00 needing twenty strips on a day with
   thirty, **When** **Auto-assign** runs, **Then** no auto-placed event overlaps
   it on those strips at that time, and the engine chose which strips it took.
4. **Given** every event pinned, **When** **Auto-assign** runs, **Then** nothing
   changes and the dock's note says the run placed nothing.
5. **Given** no pinned events, **When** the drift ledger runs, **Then** every
   B1–B8 scenario schedules exactly as many events as before this feature.
6. **Given** two pinned events that together need more strips than the day
   has at the same hour, **When** **Auto-assign** runs, **Then** both stay where
   they were, the Unplaced finding reports the overflow, and the run still
   places what it can around them.
7. **Given** a pinned event whose day is beyond the current day count,
   **When** **Auto-assign** runs, **Then** the pin is not honoured, the finding
   says so, and the event is placed afresh, unpinned.

---

### User Story 7 - The Schedule view is the document an organizer publishes (Priority: P3)

The footer's toggle switches the canvas for a schedule table laid out the way
USA Fencing publishes its tournament schedules: one section per day, events in
start order, each with its phases and times. Printing the page yields that
document alone, one day per page, readable in black and white, so it can be
saved to PDF and handed to a bout committee.

**Why this priority**: The mockup had no table and the product owner kept it
(D6). It is last because it changes nothing an organizer decides, only what
they hand over.

**Independent Test**: Load B1, schedule it, switch to Schedule, and confirm
every placed event appears once under its day with the same times the canvas
shows. Print to PDF and confirm the output holds only the schedule.

**Acceptance Scenarios**:

1. **Given** a scheduled B1, **When** the organizer switches to Schedule,
   **Then** the table shows four day sections, each listing its events in start
   order with pool start, elimination start and finish, and every placed event
   appears exactly once.
2. **Given** the Schedule view, **When** the organizer prints, **Then** the
   header, rail, dock, footer and panels do not print, each day begins a new
   page, and the table is legible without colour.
3. **Given** the canvas and the Schedule view, **When** both are read for the
   same board, **Then** every event's day, start and finish agree.

---

### Edge Cases

- **Days outside the pills.** A shared link can carry 1 or 5–14 days. The row
  renders the value as a fourth pill that cannot be clicked, with the existing
  notice. Choosing 2, 3 or 4 replaces it.
- **Video strips following the type.** The stepper's Default marker and revert
  survive on the stepper itself. Without them the "follow the type" state would
  have no way back.
- **A fencer count below the minimum.** The input refuses it. If a count below
  the minimum reaches the store by another route, the shell's error boundary
  shows a recoverable message instead of unmounting the app.
- **Move day past the day's end.** The start time is kept, so a late start on a
  shorter day can run past its close. The late-finish finding reports it and
  the event stays where the organizer put it.
- **Two pins that collide.** Both are honoured. Capacity collisions show as
  Unplaced findings. Crossover collisions between hand placements are not
  checked in 013 – that is 014's E3 – and Move day is the only way to create
  one.
- **A pin on a day that no longer exists.** Reducing the day count can strand a
  pinned placement. It counts as unplaced, the finding names it, and the next
  Auto-assign places it afresh, unpinned.
- **Every event pinned.** Auto-assign has nothing to place and says so.
- **A dock chip is clicked.** The event is selected and the detail strip shows
  what it can without a placement. There is no way to place it by hand until
  014's drag. Auto-assign is the route.
- **Auto-assign after a blocking finding.** Disabled, as today.
- **The strip search while typing.** The Strips panel's search re-runs as
  inputs change. It is debounced so a stepper held down does not queue a run
  per tick, and the indicator only appears past the reveal delay.
- **Fit day with no measurable width.** If the container has not been laid out
  yet, the canvas falls back to the ladder's default rung until it has.
- **Browser storage unavailable.** Panel choice, dock state, detail collapse
  and selection fall back to their defaults. Nothing about the board is lost,
  because none of it lives there.
- **Dismissed derived findings.** The two new findings carry stable ids so a
  dismissal survives a re-render that does not change the finding.
- **A template loaded from the picker.** Templates set events and counts, not
  the tournament type. A template chosen from boot schedules as whatever type
  is set, as today.
- **Old share links and saved files.** Not read. The product is unreleased and
  carries no backward compatibility.

## Requirements *(mandatory)*

### Functional Requirements

**Shell**

- **FR-001**: The app MUST render one screen of six regions: a header, an
  unplaced dock beneath it, a tool rail, one inspector panel, the canvas with
  its detail strip, and a footer. The title bar with its badge, the second bar,
  the rail of collapsible sections and the bottom drawer MUST NOT exist.
- **FR-002**: At most one inspector panel MUST be open at a time, opened from
  the rail's five buttons, floating over the canvas by default and dockable
  beside it. Which panel is open, whether it is docked, whether the detail strip
  is collapsed, and which event is selected are viewer state: kept in the
  browser, never in the shared link or the saved file.
- **FR-003**: A rendering failure anywhere in the shell MUST show a recoverable
  message instead of a blank page.

**Header**

- **FR-004**: The header MUST carry the brand, one preset picker, a read-only
  summary of tournament type, day count and strip count, the clock time of the
  last Auto-assign, the **Auto-assign** button and the Export control.
- **FR-005**: The preset picker MUST be the only preset control and MUST list
  the eight tournaments under one group and the ten templates under a second
  whose heading states that the templates' figures are invented. Loading from
  either group MUST record which preset loaded. A template MUST set events and
  fencer counts only and MUST NOT change the tournament type.
- **FR-006**: Type, day count and strip count MUST be editable only in the
  panels. The header states them.
- **FR-007**: The time of the last Auto-assign MUST be recorded when it runs,
  shown as a clock time rather than a relative age, and MUST NOT be serialized.
- **FR-008**: **Auto-assign** MUST be disabled while any Blocking finding
  exists.
- **FR-009**: Export MUST offer save to file, load from file, share link and
  copy, and MUST warn before a load that drops placements. Its file and
  clipboard handling MUST be reusable without the popover, so a later surface
  can offer the same actions (alignment §4.2).

**Unplaced dock**

- **FR-010**: The dock MUST show one chip per event with no placement, carrying
  its name, the strips it needs, its pool and elimination durations, and its
  weapon colour. The need MUST be computed by the engine from the event and
  the tournament configuration alone, with no placement. Clicking a chip MUST
  select the event. A chip MUST NOT place the event: Auto-assign is the only
  way an unplaced event gets a slot in this feature.
- **FR-011**: When every event has a placement the dock MUST say so. After an
  Auto-assign it MUST say how many events the run placed and how many it could
  not.
- **FR-012**: A block the packer cannot fit within the strip count is
  *overflow*. Overflow MUST count as unplaced in the footer, MUST produce an
  Unplaced finding, and MUST draw dashed on the canvas rather than over
  whatever occupies strip one.

**Tournament panel**

- **FR-013**: The type control MUST offer all six tournament types, SJCC
  included.
- **FR-014**: The day-count control MUST offer 2, 3 and 4. A value outside them
  MUST render as a fourth, non-clickable pill with the existing out-of-range
  notice. Choosing a day count rebuilds every day's hours to the defaults, as
  today.
- **FR-015**: Each day's start and end MUST be editable from the existing time
  options and shown in 24-hour form.

**Strips & referees panel**

- **FR-016**: The panel MUST carry a strips stepper and a video-strips stepper.
  The video stepper MUST keep the Default marker and a revert to following the
  tournament type.
- **FR-017**: The suggested-minimum card MUST state the smallest strip count
  that places every event, worded as strips to place every event and never as a
  finish-time claim. The search MUST run when the panel opens and re-run,
  debounced, when its inputs change, MUST show the reveal-delayed indicator,
  and MUST NOT write the strip field. **Apply** writes it.
- **FR-018**: The panel MUST state the referees per pool the tournament type
  implies, read from the same factor the engine applies. No surface MUST offer
  an input for referees available. Referees are output only.

**Events panel**

- **FR-019**: The panel MUST show one card per gender and weapon, each listing
  that pair's catalogue entries as chips in this order: individual categories,
  the six veteran bands, then team categories suffixed "Team". A chip toggles
  the event on or off. The heading MUST state how many of the 120 are selected.
- **FR-020**: A selected chip MUST show the event's fencer count and edit it in
  place. The input MUST refuse any value below the engine's minimum.
- **FR-021**: No surface MUST offer a per-event control for cut, DE mode, video
  policy, referee policy or single-pool override.

**Findings panel**

- **FR-022**: Every finding MUST carry a stable identity, a severity shown as
  Blocking, Warning, Note or Unplaced, where it applies, its message, and,
  where one exists, the event it targets.
- **FR-023**: **Show on grid** MUST appear only on findings with a target, and
  MUST select that event, scroll its block into view and flash it.
- **FR-024**: An Unplaced finding MUST be produced per overflow block, at
  Warning, targeting the event and naming the strips it needs.
- **FR-025**: A Late finish finding MUST be produced per day whose latest
  finish falls within 45 minutes before that day's end or after it, at Warning,
  targeting the event that finishes last and stating the margin before close
  or the minutes past it. An overrun MUST NOT be a Blocking finding, so
  Auto-assign stays enabled.
- **FR-026**: The existing structural, policy and notice findings MUST still
  render. No finding MUST compare referees needed against a referee count.
  Dismissals MUST persist and MUST hide Warning rows.
- **FR-027**: The rail's Findings button MUST show the count of undismissed
  findings.
- **FR-028**: Flighting suggestions and their accept and reject MUST NOT exist.
  Flighting is user intent (FR-048).

**Settings panel**

- **FR-029**: Pool durations MUST be editable per weapon, keeping the default,
  override and reset pattern.
- **FR-030**: DE mode MUST be a tournament-level choice of Staged or Single that
  overrides the type's default, MUST be serialized, and MUST replace the
  per-event DE mode.
- **FR-031**: Settings MUST NOT carry a row for admin gap, flight buffer or
  video strips.

**Canvas**

- **FR-032**: The canvas MUST scroll natively, with the time axis, the day bands
  and the strip gutter sticky. Scroll position belongs to the browser and MUST
  NOT be view state.
- **FR-033**: Every strip row of every day MUST be in the document. There is no
  windowing.
- **FR-034**: Zoom MUST step through a fixed ladder of six levels plus a
  **Fit day** mode that sizes one day to the measured width. Zoom MUST NOT
  leave the ladder, and the controls MUST disable at its ends.
- **FR-035**: Each block MUST decide what it shows – name, icon, both or
  neither – from the room it has at the current level, and the axis MUST pick
  its tick density from the level.
- **FR-036**: A block's fill MUST encode weapon, one of three hues. The
  elimination phase MUST be hatched and carry a bracket icon, the pool phase a
  grid icon. The name text MUST carry category and gender. Category colour
  tokens MUST NOT exist.
- **FR-037**: A pinned block MUST wear a badge, an overflow block MUST draw
  dashed, the selected block MUST show a ring, and a gutter row MUST be flagged
  when a finding targets an event on that day. No metric MUST highlight blocks
  on hover.
- **FR-038**: Strip rows are planning aids. The packer MAY re-choose lanes on
  every render, no strip number MUST be stored, and no camera or video cue MUST
  be drawn per event.
- **FR-039**: Each day band MUST state `Day N`, the event count, the finish
  time, strips at peak against the strip count, and the number of findings on
  that day. No calendar date.
- **FR-040**: The block tooltip MUST keep name, weapon, category, gender, day,
  phase, start, end, duration, strips and findings.
- **FR-041**: Every time shown in the app MUST be in 24-hour form.
- **FR-042**: The two-tier recompute and the dimmed-invalid rule MUST carry
  over to the new canvas.
- **FR-043**: Blocks MUST NOT offer resize handles and MUST NOT drag.

**Detail strip**

- **FR-044**: Selecting a block MUST open the detail strip with the event's
  name, day, the strip rows it occupies this render, its fencer count, and a
  pill per phase with start and end. The strip MUST collapse to one line and
  MUST dismiss. For a selected event with no placement the strip MUST show its
  name, fencer count and phase durations, offer **Flight**, and MUST NOT offer
  **Pin** or **Move day**.
- **FR-045**: **Pin** MUST toggle the event's pinned state and read **Pinned**
  when set.
- **FR-046**: **Move day** MUST offer the other days and move the event there at
  its current start time, marking it manual and pinned.
- **FR-047**: Move day MUST NOT check crossover rules. It is the only action in
  this feature that can create a crossover conflict between hand placements,
  and that check is 014's.
- **FR-048**: **Flight** MUST toggle a per-event flighted flag that the
  schedule derives as two flights, and the flag MUST be serialized.

**Footer**

- **FR-049**: The footer MUST carry zoom out, zoom in, the level readout, reset,
  **Fit day**, the placed, unplaced and pinned counts, the tournament finish,
  peak referees, strip use, a weapon legend, and the Matrix ⇄ Schedule toggle.
- **FR-050**: No metric MUST show a change against a preset baseline, and no
  baseline MUST be recorded.

**Schedule view**

- **FR-051**: The Schedule view MUST be laid out after USA Fencing's published
  tournament schedules: one section per day, events in start order, each with
  its phases and times, and every placed event exactly once.
- **FR-052**: Printing the Schedule view MUST render only the schedule, one day
  per page, legible without colour.
- **FR-053**: The Schedule view and the canvas MUST agree on every event's day,
  start and finish.

**Engine: Auto-assign around pins**

- **FR-054**: Pinned placements MUST enter the scheduler fixed: their day MUST
  be assigned before day assignment runs and their strip-time MUST be claimed
  before packing runs. The engine MUST NOT move a pinned event's day or start.
- **FR-055**: Day assignment MUST keep a pinned event's crossover neighbours off
  its day.
- **FR-056**: The engine MUST choose which strips a pinned event occupies, and
  the result MUST NOT store them.
- **FR-057**: Every event the run places MUST be unpinned. Pinned events stay
  pinned.
- **FR-058**: With no pinned events the scheduler's output MUST be identical to
  its output before this feature on every B1–B8 scenario.
- **FR-059**: Pinned events that collide with each other MUST both be honoured.
  A capacity collision MUST be reported by the Unplaced finding. A crossover
  collision MUST NOT be reported in this feature.
- **FR-060**: A pinned placement whose day is outside the current day count
  MUST NOT be honoured. It counts as unplaced, a finding says so, and the run
  places it afresh, unpinned.
- **FR-061**: The run MUST report how many events it placed and how many it
  could not.

**Data model**

- **FR-062**: Per-event configuration MUST be the fencer count and the flighted
  flag, and nothing else. Cut, referee policy, DE mode, video policy and the
  single-pool choice MUST be computed from the tournament type, the catalogue
  defaults and the tournament-level DE mode when the engine configuration is
  built. The shared link MUST carry only the two.
- **FR-063**: No global override setting MUST exist in the app or the shared
  link. The engine's defaults for admin gap and flight buffer apply.
- **FR-064**: The finals-only video policy MUST NOT exist.
- **FR-065**: View state MUST be the open panel, docked flag, detail collapse,
  selection, zoom level and fit flag. View mode, row height step, time zoom,
  the two scroll offsets, drawer height and scorecard expansion MUST NOT exist.

**Deletions and verification**

- **FR-066**: Every component, store field, engine enum member, token and
  driver selector listed in alignment §6 MUST be removed in the task that
  builds its replacement, so no state exists in which the old control is gone
  and the new one is not yet there. Tests that name a deleted surface MUST be
  re-targeted at what replaces it, never triaged away.
- **FR-067**: The smoke driver MUST be re-pointed in each task that reshapes a
  control it locates, and MUST NOT be rewritten. Its four **Suggest** presses
  MUST survive on the new button.
- **FR-068**: The engine story MUST run the B1–B8 drift ledger, MUST explain
  its snapshot diff before accepting it, and MUST show no scheduled count moving
  on the no-pins path.
- **FR-069**: The product owner MUST review a screenshot of the shell at 80
  strips on preset B1 at the end of story 1, before the canvas is rewritten.
- **FR-070**: The deliberate removal of windowing MUST be recorded in the
  workbench design document's virtualization section.
- **FR-071**: No backward compatibility MUST be provided for share links or
  saved files written before this feature.

### Key Entities

- **Placement**: an event's day, start time and strip count, whether it was
  placed by hand or by the engine, and whether it is pinned. Never its strips.
- **Pinned placement**: a placement the engine treats as already on the board –
  fixed in day and start, packed around, never moved.
- **Overflow**: a block the lane packer cannot fit within the strip count.
  Counts as unplaced, draws dashed, raises an Unplaced finding.
- **Event configuration**: fencer count and flighted flag. Everything else about
  an event is computed.
- **Tournament DE mode**: one Staged-or-Single choice for the whole tournament,
  overriding the type's default.
- **Finding**: identity, severity, where, message, optional target event.
  Blocking findings disable Auto-assign. Warnings can be dismissed.
- **Event footprint**: the strips, pool minutes and elimination minutes an
  event needs, computed without a placement. What the dock's chips show.
- **Day summary**: event count, finish, peak strips, unplaced count and
  findings count for one day. What the day band shows.
- **Preset**: a tournament (B1–B8, real rosters) or a template (ten, invented
  figures). One picker, two groups.
- **View state**: open panel, docked, detail collapsed, selection, zoom level,
  fit. Browser-local, never shared.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On preset B1 at 80 strips and four days, every strip row and
  every block is present without windowing, the screen has one header, one
  rail, one footer and no second copy of any input, and the product owner has
  approved the density and legibility screenshot before the canvas is rewritten.
- **SC-002**: A search of the codebase for every component, store field, enum
  member, token and selector alignment §6 retires returns nothing.
- **SC-003**: With no pinned events, every B1–B8 scenario schedules exactly the
  number of events it did at the branch point, and the ledger's snapshot diff
  is explained in the engine story's record.
- **SC-004**: With six events pinned across three days of B1, Auto-assign
  leaves all six at their day and start and places the remaining eighteen.
- **SC-005**: The zoom ladder has six levels, the in and out controls disable
  at its ends, and at the closest level a four-day B1 board still scrolls with
  every block keeping its fill, hatch and label.
- **SC-006**: A share link round-trips fencer count, flighted, and the
  tournament DE mode, and carries no per-event cut, referee policy, DE mode,
  video policy or single-pool field.
- **SC-007**: Every finding renders with a severity badge, a location and a
  message, and pressing Show on grid on a targeted finding selects and scrolls
  to its block in one interaction.
- **SC-008**: Printing the Schedule view for B1 yields four day sections, each
  on its own page, holding all 24 events once, with nothing else on the page.
- **SC-009**: The preset picker lists 8 tournaments and 10 templates, and no
  other preset control exists.
- **SC-010**: No input for referees available exists, and no finding names a
  referee count.
- **SC-011**: The suggested-minimum card shows a count without changing the
  strip field, and Apply changes it.
- **SC-012**: Entering a fencer count below the minimum is impossible from the
  Events panel, and a forced render error shows a recoverable message rather
  than a blank page.
- **SC-013**: The live smoke driver passes against the running app with every
  re-pointed selector and its four Suggest presses intact.
- **SC-014**: Every test that named a retired surface has a replacement
  targeting the new one, and the full suite, typecheck and lint pass on the
  merged tree.

## Assumptions

- **The mockup is the visual target and §9 is the rule.** Tokens come from the
  workbench page's own palette, not the Industry stylesheet it links (I12). The
  product owner's answers in alignment §9 override any earlier recommendation
  in §7, and this spec restates none of the reasoning.
- **The prototype script is not behaviour.** `reflowDay`, `findSlot`,
  `dayStats` and `buildFindings` in the mockup are stand-ins for the engine and
  the derived selectors. Where they differ from the store, the store wins.
- **No calendar date.** Day bands read `Day N` (D9). Presets may carry real
  dates in a later feature.
- **Templates do not set tournament type.** Carried from 012: a template sets
  events and counts, so one loaded from boot schedules as whatever type is set.
- **Late finish covers the overrun, at Warning.** The alignment doc defines the
  finding as the final 45 minutes before the day's end. A hand move can run
  past the end, and §4.7 says the late-finish finding reports it. The
  clarification session made it one Warning covering both, so an overrun never
  disables Auto-assign.
- **A stranded pin is unplaced.** Decided in this spec's clarification session,
  not in the alignment doc. The derived blocks already flag an out-of-range
  day, so the finding reads from that and the next run places the event afresh.
- **Overflow is the packer's word.** A block is overflow when the first-fit
  lane packer cannot place it within the strip count. The Unplaced finding and
  the dashed cue read from that one source.
- **The windowing removal is deliberate.** 320 gutter labels and around 200
  block elements are inside what the DOM handles. This deviates from the
  workbench design document's virtualization section and FR-070 records it
  there.
- **Viewer state lives in browser storage.** Panel, docked, detail collapse
  and selection follow research D10: never the URL.
- **Auto output is unpinned** (I9). Only Pin, Move day and a later drag pin.
- **The referee model divergence stays open.** Peak referees is shown as the
  store computes it today. The backlog's note that it reads higher than the
  scheduler's own is unchanged.
- **Constitution III governs the engine story.** The ledger runs the no-pins
  path. The pinned path is new behaviour with its own tests and no ledger
  floor to protect.

## Out of Scope

Each of these was weighed in the alignment document and left out. The backlog
holds the ones with a future.

- **Drag**, on the grid or from the dock, with ghost, snap and clamp. 014.
- **Crossover checking for hand placements** (E3). 014. Reachable in 013 only
  through Move day, and FR-047 says so.
- **Sequencing rules onto a pin.** The engine holds a team event after its
  individual counterpart and a Vet sibling after the previous one, but not
  when the later event is pinned: a pinned team event is fixed before its
  unpinned individual is placed, so the individual may follow it. The same
  family as E3, and 014's to close.
- **Per-phase placement** – a DE dragged to its own strips and start (E2).
  Parked at 014 unless small.
- **Day-end overrun as a warning instead of a hard failure** (E4). Backlog.
  The derived late-finish finding reports hand placements now, and the engine
  still drops auto placements that overrun.
- **The referee model divergence** (E5). Backlog.
- **A finish-time strip search** (E6). Not scheduled. The copy no longer claims
  it.
- **Pool durations by pool size** (E7). Backlog.
- **Monotonicity in strip count** (E8). Recorded in the strip-count anomaly
  document. The Unplaced finding is the cue the stepper lacked.
- **A tournament start date** (D9).
- **Scorecard deltas and hover highlight** (D7). Deleted, not deferred.
- **A referees-available input and a referee finding** (D8).
- **Storing strip numbers** (D2). Planning aids only.
- **The camera icon** for DE on video strips. Falls with D2.
- **Resize handles** on the selected block (I7). Durations are output.
- **Admin gap and flight buffer controls** and the global overrides slice
  behind them (D5). The backlog's "Global settings" entry keeps the intent.
- **Per-event overrides** for cut, referees, DE mode, video policy and single
  pool (D4).
- **Backward compatibility** for earlier share links or saved files.
