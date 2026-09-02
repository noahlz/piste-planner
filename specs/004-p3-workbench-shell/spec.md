# Feature Specification: P3 Workbench Shell and Canvas

**Feature Branch**: `004-p3-workbench-shell`

**Created**: 2026-08-29

**Status**: Delivered 2026-09-01

**Input**: User description: "Begin P3 of the Competition Planner Workbench roadmap. Source of truth: docs/design/competition-planner-workbench.md (§Roadmap P3 row, §Architecture Shell, §Canvas, §Scorecard, §View toggle, §Testing). Scope: workbench shell replacing both existing layouts (top bar, left rail, center canvas, bottom drawer, unplaced tray); strips × time matrix with continuous X zoom, stepped Y row heights, row+time-window virtualization, category/phase/weapon/gender encoding, and a portaled tooltip; scorecard in the drawer with preset-baseline deltas; Matrix⇄Schedule view toggle; 'Auto-schedule all' action. Deletes WizardShell, WizardStep1-4, KitchenSinkPage, layoutMode, and the layout toggle, pruning or re-targeting the wizard/kitchen-sink tests. Plus two backlog items assigned to P3 on 2026-08-29: per-type defaults in the rail's Advanced panel, and the top-bar gears surface scoped to settings the store already carries. Promoting the rest of constants.ts to a config file is explicitly out of scope and stays in the backlog for after P5. Manual placement, drag, and 'Auto-fill unplaced' are P4, not here. Constitution VI applies. Worktree flow, branch 004-p3-workbench-shell."

## Design References

This spec implements the P3 row of the workbench roadmap. The design document
and the backlog are the single homes for the facts below – this spec points at
them and does not restate them.

| Topic | Home |
|---|---|
| P3 scope row and phase dependencies | [design §Roadmap](../../docs/design/competition-planner-workbench.md) |
| Shell regions, rail contents, tray, drawer | [design §Architecture – Shell](../../docs/design/competition-planner-workbench.md) |
| Canvas encoding, zoom, virtualization, tooltip | [design §Canvas](../../docs/design/competition-planner-workbench.md) |
| Scorecard metrics and baseline-delta rule | [design §Scorecard](../../docs/design/competition-planner-workbench.md) |
| Matrix ⇄ Schedule equivalence | [design §View toggle](../../docs/design/competition-planner-workbench.md) |
| Two-tier recompute, dimmed-invalid rule, layout replacement | [design §Decisions 1, 2, 3, 10](../../docs/design/competition-planner-workbench.md) |
| Placement record, derived-geometry rule, serialization | [design §State model](../../docs/design/competition-planner-workbench.md), delivered by [`specs/003-p2-derived-state/`](../003-p2-derived-state/spec.md) |
| Per-type defaults table and the gears split | [backlog §Per-type defaults, §Global settings](../../docs/design/backlog.md) |
| Test pruning and new coverage expectations | [design §Testing](../../docs/design/competition-planner-workbench.md) |
| Live-verification requirement | [constitution §VI](../../.specify/memory/constitution.md) |

## Clarifications

### Session 2026-08-29

- Q: When the organizer re-picks a tournament type after hand-editing per-event
  referee, video, or DE settings, do the new type's defaults overwrite those
  edits? → A: Neither – the question presumed the defaults are written into
  per-event state, and they are not. A per-type default is a fallback resolved
  when the schedule is derived, the way regional cut overrides already are at
  `buildConfig.ts:139`. An event with no explicit value follows its type's
  default and changes when the type changes. An event the organizer has set
  explicitly keeps that value through any number of type changes. Nothing is
  ever overwritten, so the tournament type stays freely changeable.
- Q: Should the tournament type be locked once a tournament is loaded? → A: No.
  Every preset carries its own type, so loading one already changes it, and
  locking the control would leave the type settable only by preset – an
  organizer planning a new ROC from scratch could not pick one. The precedence
  above makes a change safe.
- Q: The regional cut override at `buildConfig.ts:139` beats the user's own cut
  setting. Do per-type referee, video, and DE defaults work the same way? → A:
  Same mechanism, opposite precedence. Regional cuts are handbook policy and
  win over the organizer. Referee, video, and DE defaults are conveniences and
  lose to any explicit value the organizer sets.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - One workbench screen replaces the wizard and the single-page form (Priority: P1)

The organizer opens Piste Planner and lands on a single full-bleed workbench
with a real tournament already loaded and already scheduled. There is no layout
choice to make, no four-step sequence to walk, and no "run" button standing
between the inputs and the answer. Controls live in a left rail, the schedule
fills the center, events with no placement sit in a tray above it, and findings
sit in a drawer along the bottom. Editing an input updates the drawer's numbers
as the organizer types and the center view when the edit settles.

**Why this priority**: Every other story in this phase hangs off these regions.
It is also the phase's user-visible thesis – the app stops being a form that
produces a report (design §Motivation) – and it is viable on its own, with the
existing schedule table as the center content.

**Independent Test**: Load the app with no URL fragment and confirm a populated
schedule is on screen in the first frame with no user action. Confirm no layout
toggle exists and neither prior layout is reachable. Edit a fencer count and
confirm the drawer's numbers move without a second action.

**Acceptance Scenarios**:

1. **Given** a first visit with no shared configuration, **When** the app
   loads, **Then** a preset is already loaded and auto-scheduled and the center
   region shows its schedule – not an empty form.
2. **Given** the workbench is on screen, **When** the organizer looks for a way
   to switch layouts, **Then** none exists – the wizard, the single-page form,
   and the toggle between them are gone.
3. **Given** a loaded tournament, **When** the organizer changes a fencer count,
   **Then** the drawer's findings and numbers update as they type, and the
   center view re-lays out once the edit settles rather than on every keystroke.
4. **Given** an input that makes the configuration structurally invalid,
   **When** the value is entered, **Then** the center region keeps showing the
   last valid layout, dimmed, with the blocking findings overlaid – it never
   goes blank.
5. **Given** an event with no placement, **When** the organizer looks at the
   screen, **Then** that event is visible in the unplaced tray above the center
   region.
6. **Given** any tournament state, **When** the organizer triggers
   `Auto-schedule all`, **Then** every event's placement is replaced with an
   auto-sourced one and the center view reflects it.
7. **Given** a shared configuration URL, **When** it is opened, **Then** the
   workbench reproduces that tournament's schedule.

---

### User Story 2 - The schedule is a strips × time matrix the organizer can read and navigate (Priority: P2)

The center region becomes a matrix: one row per strip, grouped by day, with time
running left to right. Each event is a block whose appearance says what it is
without being clicked – its fill carries the age category, a left edge-bar and
hatch carry the phase, an icon carries the weapon, and its label prefix carries
the gender. The organizer zooms the time axis continuously and steps the row
height between compact, normal, and tall, so an 80-strip four-day tournament can
be surveyed whole or inspected hour by hour. Hovering a block reveals its full
detail. A toggle switches between this matrix and the schedule table, and the
two can never disagree because both read the same derived model.

**Why this priority**: This is the phase's namesake and the thing the organizer
cannot do today – see the schedule spatially and judge it (design §Motivation).
It is independently valuable on top of US1's shell and independently testable.

**Independent Test**: Load a preset, switch to the matrix, and confirm every
scheduled event appears as a block on the right strips at the right times.
Confirm each encoding channel reads correctly for a known event. Zoom and scroll
across a large tournament and confirm blocks stay correctly positioned. Toggle
to the schedule table and confirm the same events, days, and times.

**Acceptance Scenarios**:

1. **Given** a scheduled tournament, **When** the matrix renders, **Then** each
   event occupies the strip rows and time span its placement and derived
   duration imply, grouped under its day.
2. **Given** a matrix with many strips, **When** the organizer scrolls
   vertically, **Then** strip labels stay visible in a frozen left gutter and
   the day header stays visible as a sticky band.
3. **Given** any two events of different age categories, **When** the organizer
   scans the canvas, **Then** their fills differ, and events within one category
   family are recognizable as that family.
4. **Given** a pool block and a DE block, **When** the organizer scans the
   canvas, **Then** the phase is distinguishable by edge-bar and hatch, not by
   fill.
5. **Given** the time axis, **When** the organizer zooms, **Then** the zoom is
   continuous, anchored at the cursor, and the hour axis stays pinned at the top
   of each day group.
6. **Given** the row axis, **When** the organizer changes row height, **Then**
   it steps between compact, normal, and tall rather than scaling continuously.
7. **Given** a block too narrow to show its weapon icon, **When** it renders,
   **Then** the icon is omitted and the weapon appears in the tooltip instead.
8. **Given** any block, **When** the organizer hovers it, **Then** a tooltip
   shows event name, weapon, category, gender, day, phase, start and end as
   HH:MM, duration, strip range, and any findings attached to that block – and
   it stays fully visible near the edges of the viewport rather than being
   clipped by the canvas.
9. **Given** an 80-strip, multi-day tournament, **When** the organizer pans and
   zooms, **Then** the view keeps up with the gesture.
10. **Given** the matrix and the schedule table, **When** the organizer toggles
    between them, **Then** both show the same events on the same days at the
    same times.
11. **Given** a fit-to-day, fit-to-tournament, or zoom-to-selection action,
    **When** it is triggered, **Then** the viewport frames exactly that scope.

---

### User Story 3 - A scorecard says what the current schedule costs (Priority: P3)

The drawer carries a scorecard that reports what this schedule does, not how
good it is. Collapsed, it shows the two numbers that drive venue and staffing
decisions: finish time and peak referee demand. Expanded, it adds per-day and
per-tournament finish times, referee demand split into total and sabre, strip
utilization, day-balance spread, and finding counts by severity. Every metric
is shown against the loaded preset as a baseline, so the organizer sees the
consequence of their own changes rather than an absolute number they have no
reference for.

**Why this priority**: It closes the loop the design's motivation opens – the
organizer sees the consequences of their choices. Every number it shows already
comes out of the engine, so it is presentation over existing data and carries no
engine risk.

**Independent Test**: Load a preset, note the collapsed scorecard, change an
input, and confirm each metric shows the correct delta from the preset's frozen
baseline. Expand and confirm the full metric set. Reload and confirm the
expanded/collapsed state persisted but did not travel in a shared URL.

**Acceptance Scenarios**:

1. **Given** a freshly loaded preset, **When** the scorecard renders collapsed,
   **Then** it shows finish time and peak referee demand and no aggregate score.
2. **Given** a loaded preset, **When** the organizer changes the configuration,
   **Then** each metric shows its value and its change from the preset baseline
   – for example "finish 19:40 (+35m), peak refs 62 (−4)".
3. **Given** an expanded scorecard, **When** the organizer reads it, **Then**
   per-day and per-tournament finish times, peak referee demand split total and
   sabre, strip utilization, day-balance spread, and finding counts by severity
   are all present.
4. **Given** a metric in the scorecard, **When** the organizer hovers it,
   **Then** the blocks driving that metric are highlighted on the canvas.
5. **Given** an expanded scorecard, **When** the organizer reloads the app,
   **Then** it is still expanded – and **When** they share the tournament by
   URL, **Then** the recipient's expanded/collapsed state is their own, not the
   sender's.

---

### User Story 4 - Picking a tournament type fills in what that type usually means (Priority: P4)

The rail's Advanced panel carries the settings that vary by tournament type but
that most organizers never change: how many referees an event gets, whether
video strips are required and how many, and whether DE runs staged or in a
single stage. Picking a type populates these, and the values are visible as dim
text on the collapsed panel so the organizer can see what was assumed without
expanding anything.

**Why this priority**: It removes setup that is identical for every tournament
of a given type, and the panel it lands in is built by US1. It is the smaller of
the two backlog items assigned to this phase and depends only on the rail.

**Independent Test**: Pick each tournament type in turn and confirm the referee
count, video strip requirement and count, and DE mode take that type's values,
that they are legible on the collapsed panel, and that the organizer can still
override any of them.

**Acceptance Scenarios**:

1. **Given** the tournament type is NAC, SJCC, or SYC, **When** the defaults
   apply, **Then** the referee count is 2 – **and given** any other type,
   **Then** it is 1.
2. **Given** the tournament type is NAC, **When** the defaults apply, **Then**
   video strips are required for the categories that require them and the count
   defaults to 8 – **and given** any other type, **Then** video strips are
   optional and the organizer enables them and sets the count.
3. **Given** the tournament type is NAC, **When** the defaults apply, **Then**
   DE mode is staged – **and given** any other type, **Then** it is
   single-stage.
4. **Given** the Advanced panel is collapsed, **When** the organizer looks at
   it, **Then** the applied defaults are readable as dim text without expanding
   it.
5. **Given** any applied default, **When** the organizer changes it, **Then**
   the change holds and the panel shows it as no longer the default.
6. **Given** a hard policy such as "no Vet Team and Vet Individual on the same
   day", **When** the organizer looks for it in this panel, **Then** it is not
   there – hard policies are overridden by placing events and accepting the
   warning, not by a setting.

---

### User Story 5 - A gears control reaches the settings that were already there (Priority: P5)

A gears control in the top bar opens the tournament's engine settings. Three of
them – the admin gap, the flight buffer, and the flighting threshold – already
live in the tournament's saved state and already travel in a shared URL, but
today no screen in the app can reach them. This story gives them a surface,
along with the scheduling grid resolution, the DE bout durations, the youth and
veteran bout adjustment, the DE strip footprint, and the pool round durations
that currently sit in their own rail card. Each shows its default, marks itself
when overridden, and can be reset, and only the overrides are saved.

**Why this priority**: It is the smallest useful cut of the global-settings
backlog item – it exposes what the store already carries rather than promoting
new constants, which keeps it clear of the canvas work. Leaving it out would
mean three settings stay saved, shared, and unreachable for three more phases.

**Independent Test**: Open the gears panel, confirm every listed setting is
present with its default shown, change one, confirm it is marked as overridden
and that the schedule reflects it, reset it, and confirm a shared URL carries
only the settings that were actually changed.

**Acceptance Scenarios**:

1. **Given** the top bar, **When** the organizer opens the gears control,
   **Then** a settings panel appears holding the admin gap, flight buffer,
   flighting threshold, scheduling grid resolution, per-weapon DE bout
   durations, the youth/veteran bout adjustment, the DE strip footprint, and the
   pool round durations.
2. **Given** the pool round durations, **When** the organizer looks for them in
   the rail, **Then** they are no longer a separate rail card – they are behind
   the gears with the rest.
3. **Given** an unmodified setting, **When** the organizer views it, **Then** it
   is shown as the default with the default's value.
4. **Given** a modified setting, **When** the organizer views it, **Then** it is
   marked as overridden, shows the default it departs from, and offers a reset
   that restores it.
5. **Given** a changed setting, **When** the schedule is derived, **Then** it
   uses the changed value.
6. **Given** a tournament with two settings overridden, **When** it is shared by
   URL and reopened, **Then** those two overrides come back and every other
   setting still tracks its default.
7. **Given** the engine's remaining constants – scheduling weights, penalty
   matrices, category start preferences, earliest-start offsets – **When** the
   organizer opens the gears panel, **Then** they are not there; that work is
   deferred past this phase.

---

### Edge Cases

- **Every event unplaced.** The tray holds every event and the center region is
  empty but structurally intact – strip rows, day bands, and the time axis are
  all drawn.
- **Auto-schedule fails.** Existing placements survive untouched and the center
  view continues to show them, with the failure reported as a finding rather
  than as a blank screen.
- **The largest tournament the structural cap allows.** 80 strips across 14 days
  is 1,120 rows. The organizer can reach any of them, and only what is on screen
  is drawn.
- **A configuration with no preset baseline.** The organizer has changed enough
  that no preset is loaded, or built from scratch. Metrics show values with no
  deltas rather than deltas against a stale baseline.
- **A block shorter than its own label.** Text is omitted before the block is
  distorted, and the tooltip carries what was dropped.
- **Two events on the same strip at the same time.** P3 does not create this –
  the auto-scheduler does not overlap – but a shared URL from a later phase
  might. Blocks render without one silently hiding the other.
- **A shared URL saved before this phase.** It carries no settings overrides and
  no view state, and it opens with every setting at its default.
- **The category catalogue's full span.** Sixteen category values are on one
  canvas at once and remain distinguishable as families.
- **Day count changed while zoomed in.** The viewport resolves to a valid scope
  rather than to a day that no longer exists.

## Requirements *(mandatory)*

### Functional Requirements

**Shell**

- **FR-001**: The application MUST present exactly one layout. The wizard, its
  four steps, the single-page form, the layout-mode state, and the toggle
  between layouts MUST be removed, not hidden.
- **FR-002**: The workbench MUST occupy the full viewport width, with a top bar,
  a left rail, a center region, an unplaced tray docked above the center region,
  and a resizable bottom drawer.
- **FR-003**: The top bar MUST carry the preset picker, tournament type, day
  count and strip count as inline controls, `Auto-schedule all`, save and share,
  and the gears control.
- **FR-004**: The left rail MUST be scrollable and organized into collapsible
  panels covering tournament settings, strips, event selection with fencer
  counts, and per-event overrides.
- **FR-005**: The unplaced tray MUST list every event that has no placement, and
  MUST make "what have I not scheduled yet" answerable at a glance.
- **FR-006**: The bottom drawer MUST be resizable and MUST hold the findings
  list and the scorecard.
- **FR-007**: On first load with no shared configuration, the application MUST
  boot with a preset loaded and auto-scheduled, so the first frame shows a
  populated schedule rather than an empty form.
- **FR-008**: Metrics and findings MUST update on every input keystroke, while
  the center region's layout MUST update only once an edit settles.
- **FR-009**: When the configuration is invalid, the center region MUST continue
  showing the last valid layout, dimmed, with blocking findings overlaid. It
  MUST NOT blank.
- **FR-010**: `Auto-schedule all` MUST replace every placement with an
  auto-sourced one.
- **FR-011**: `Auto-fill unplaced`, manual placement, dragging, and undo/redo
  MUST NOT be part of this feature.

**Canvas**

- **FR-012**: The center region MUST offer a matrix of strips against time, one
  row per strip, grouped by day, with each event drawn as a block spanning the
  strips and the time its placement and derived duration imply.
- **FR-013**: Block geometry MUST be derived from placement and configuration on
  read and MUST NOT be stored.
- **FR-014**: Block fill MUST encode age category, a left edge-bar and hatch
  MUST encode phase, an icon MUST encode weapon, and the label prefix MUST
  encode gender.
- **FR-015**: The category palette MUST be organized as hue families – youth,
  cadet and junior, senior divisions, veteran – with lightness steps inside each
  family, covering the catalogue's sixteen values while remaining scannable.
- **FR-016**: Weapon marks for foil, épée, and sabre MUST be drawn by the
  application. They MUST be omitted below a block-width threshold, with the
  weapon carried in the tooltip instead.
- **FR-017**: The time axis MUST zoom continuously, anchored at the cursor, with
  the hour axis pinned at the top of each day group.
- **FR-018**: Row height MUST step between compact, normal, and tall rather than
  scaling continuously.
- **FR-019**: Strip labels MUST sit in a frozen left gutter and day headers MUST
  be sticky bands.
- **FR-020**: Fit-to-day, fit-to-tournament, and zoom-to-selection actions MUST
  be available.
- **FR-021**: Only the visible row window and the visible time window MUST be
  rendered.
- **FR-022**: The tooltip MUST be an overlay that escapes the canvas clip and
  flips near viewport edges, carrying event name, weapon, category, gender, day,
  phase, start and end as HH:MM, duration, strip range, and any findings
  attached to that block.
- **FR-023**: A toggle MUST switch the center region between the matrix and the
  schedule table, and both MUST read the same derived model so they cannot
  disagree.
- **FR-024**: The schedule table MUST be grouped by day and MUST read derived
  placements.

**Scorecard**

- **FR-025**: The scorecard MUST show no aggregate score.
- **FR-026**: Collapsed, the scorecard MUST show finish time and peak referee
  demand only.
- **FR-027**: Expanded, the scorecard MUST additionally show per-day and
  per-tournament finish times, peak referee demand split into total and sabre,
  strip utilization, day-balance spread, and finding counts by severity.
- **FR-028**: Each metric MUST show its change against the loaded preset, which
  stays frozen as the baseline.
- **FR-029**: Hovering a metric MUST highlight the blocks driving it.
- **FR-030**: Expanded or collapsed state MUST persist across sessions and MUST
  NOT be part of the serialized tournament configuration.

**Per-type defaults**

- **FR-031**: The rail MUST carry an Advanced panel holding, per tournament
  type, the referee count, whether video strips are required and how many, and
  the DE mode.
- **FR-032**: Referee count MUST default to 2 for NAC, SJCC, and SYC and to 1
  for every other type.
- **FR-033**: Video strips MUST default to required with a count of 8 for NAC,
  applying to the categories that require video, and to optional elsewhere with
  the organizer enabling them and setting the count.
- **FR-034**: DE mode MUST default to staged for NAC and single-stage for every
  other type.
- **FR-035**: The applied defaults MUST be readable as dim text on the collapsed
  Advanced panel.
- **FR-036**: A per-type default MUST be resolved when the schedule is derived,
  not written into an event's stored settings. Changing the tournament type
  MUST NOT modify any event's stored settings.
- **FR-037**: An event with no explicit referee, video, or DE value MUST follow
  its tournament type's default and MUST change when the type changes. An event
  the organizer has set explicitly MUST keep that value through any number of
  type changes.
- **FR-038**: The organizer MUST be able to change the tournament type at any
  time, and MUST be able to return a setting from an explicit value to
  following its type default.
- **FR-039**: The Advanced panel MUST distinguish a value that follows its type
  default from a value the organizer set explicitly.
- **FR-040**: Hard policies MUST NOT be adjustable in this panel. Rules the USA
  Fencing handbook imposes on a tournament type – the regional cut overrides
  among them – MUST continue to win over the organizer's own setting, which is
  the opposite precedence from the defaults in FR-032 through FR-034.

**Gears**

- **FR-041**: A gears control in the top bar MUST open a settings panel.
- **FR-042**: The panel MUST expose the admin gap, the flight buffer, the
  flighting threshold, the scheduling grid resolution, the per-weapon DE bout
  durations, the youth and veteran bout adjustment, the DE strip footprint, and
  the pool round durations.
- **FR-043**: The pool round duration controls MUST move out of the rail and
  behind the gears surface.
- **FR-044**: Each setting MUST show its default value, MUST be marked when it
  departs from that default, and MUST offer a reset that restores it.
- **FR-045**: Only settings that depart from their defaults MUST be persisted
  and shared. Unset settings MUST continue to track their defaults.
- **FR-046**: A changed setting MUST be reflected in the derived schedule.
- **FR-047**: Scheduling weights, penalty matrices, category start preferences,
  and earliest-start offsets MUST NOT be exposed by this feature.

**Verification and cleanup**

- **FR-048**: The live smoke driver MUST be updated in the same task that
  reshapes each part of the UI it asserts on, and MUST pass against the finished
  workbench.
- **FR-049**: Test coverage of the deleted layouts MUST be re-targeted at the
  workbench where the behavior survives and deleted where it does not. No test
  may be left asserting against a removed layout.
- **FR-050**: Engine behavior MUST NOT change in this feature. The B1–B8 drift
  scenarios MUST produce identical results before and after.

### Key Entities

- **Workbench view state**: which center view is active, the current time zoom
  and scroll position, the row-height step, and whether the drawer's scorecard
  is expanded. Belongs to the viewer, not to the tournament, so it persists
  locally and does not travel in a shared URL.
- **Category encoding**: the mapping from an event's age category to a fill,
  organized into hue families with lightness steps within each family.
- **Per-type default set**: for one tournament type, the referee count, the
  video strip requirement and count, and the DE mode that type implies.
- **Settings override set**: the engine settings the organizer has changed away
  from their defaults. Only the departures are recorded, so unchanged settings
  follow the defaults as those defaults evolve.
- **Scorecard baseline**: the frozen metric values of the preset as loaded,
  against which every current metric is reported as a delta.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A first-time visitor sees a complete tournament schedule on screen
  without clicking anything, and is never asked to choose a layout.
- **SC-002**: An organizer can locate any strip on any day of the largest
  supported tournament – 80 strips across 14 days – by scrolling and zooming,
  and panning or zooming keeps up with the gesture without visible stalling.
- **SC-003**: Changing an input updates the drawer's numbers as the organizer
  types, with no separate action to re-run the schedule and no "results out of
  date" state anywhere in the product.
- **SC-004**: Shown a block at normal row height, an organizer can name its age
  category, phase, weapon, and gender without hovering or clicking it.
- **SC-005**: Every scorecard metric is reported alongside its change from the
  loaded preset, so the organizer never has to remember a previous number.
- **SC-006**: No sequence of input edits, valid or invalid, produces a blank
  center region.
- **SC-007**: Opening a shared tournament URL reproduces the sender's schedule
  and their settings overrides exactly, while leaving the recipient's own view
  preferences alone.
- **SC-008**: Selecting a tournament type sets that type's referee count, video
  strip requirement, and DE mode without the organizer entering any of them, and
  those values are visible without expanding a panel.
- **SC-009**: Three engine settings that are saved and shared today but
  unreachable in the product become reachable, editable, and resettable.
- **SC-010**: The live smoke run passes against the reshaped UI, and no test in
  the suite references a removed layout.
- **SC-011**: The B1–B8 drift scenarios produce identical scheduled-event counts
  and durations before and after this feature.
- **SC-012**: An organizer can change the tournament type any number of times
  without losing a single setting they entered by hand.

## Assumptions

- **US1's center content is the schedule table.** The matrix arrives in US2, so
  US1 is shippable and demonstrable on its own. The view toggle ships with US2,
  at which point the matrix becomes the default view.
- **Existing rail-ready components are reused.** `StripSetup`, `FencerCounts`,
  `CompetitionOverrides`, `AnalysisOutput`, and `ScheduleOutput` are already
  compact enough to become rail panels, the findings list, and the schedule view
  respectively, per design §Architecture. `TemplateSelector` is superseded by
  the preset picker.
- **The scorecard's numbers already exist.** Referee requirements, strip
  allocations, finish times, and findings all come out of the engine today. This
  feature presents them and computes deltas, and adds no engine calculation.
- **No baseline means no deltas.** When no preset is loaded, metrics show values
  without deltas rather than comparing against a stale or invented baseline.
- **Settings overrides serialize the way pool durations already do.** The
  override-versus-default distinction is derived by comparison against the
  default, with no separate stored flag, matching the pattern
  `specs/002-configurable-pool-durations/` established.
- **The share-URL schema may change without a migration path.** The product is
  unreleased, so a URL saved before this feature is read leniently and opens
  with defaults rather than being migrated.
- **Video "required" categories come from the existing per-category video
  policy.** The per-type default supplies the strip count and whether the type
  honors the requirement, not a new list of which categories need video.
- **Per-type defaults resolve on read, like regional cut overrides.** The
  mechanism at `buildConfig.ts:139` – consult the tournament type while building
  the config, never write the result back to the store – transfers directly. The
  precedence inverts: a regional cut override beats the organizer, a per-type
  default loses to them.
- **An event's referee, video, and DE settings gain an "unset" state.**
  Distinguishing "follows the type default" from "explicitly set to the value
  the default happens to have" needs somewhere to record the difference. How
  that is represented is a design decision for the plan.
- **`erasableSyntaxOnly` and the pure-engine boundary hold.** No UI work in this
  feature adds state, imports, or React dependencies to `src/engine/`.

## Dependencies

- **P2 (`specs/003-p2-derived-state/`) is merged.** Placements as stored intent,
  the derived read selectors, staleness removal, the validation split, the
  widened day cap, findings identity, and presets in `src/data` are all
  preconditions of this feature and are already in `main`.
- **P4 depends on this.** Manual placement, unpack-to-blocks, advisory edit
  validation, undo/redo, and `Auto-fill unplaced` all build on the canvas this
  feature delivers.

## Out of Scope

- Manual placement, event dragging, unpack-to-blocks, undo/redo, and
  `Auto-fill unplaced` – all P4.
- The FLUID bout allocator – P5.
- Promoting the remainder of the engine's constants to a user-editable
  configuration file – stays in the backlog for after P5.
- Dragging individual DE bouts, multi-block selection and group drag, conflict
  auto-resolution suggestions, mobile and touch drag, collaborative editing,
  export to PNG or PDF, and replacing the empirical DE duration table – all
  listed out of scope by the design and unchanged here.
- Youth-event pool duration recalibration – unassigned in the backlog.
