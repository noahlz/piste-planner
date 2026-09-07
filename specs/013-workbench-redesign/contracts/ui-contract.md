# UI Contract: The redesigned workbench

The application's interface is its UI, so this is the contract the feature
exposes. It states what each region owes the organizer and the accessible
names and data attributes tests and `scripts/smoke.mjs` may locate controls
by. Shapes are in [data-model.md](../data-model.md), reasoning in
[research.md](../research.md), the mockup's markup in the Claude Design
project *Piste Planner Workbench*.

A control listed here without a stable name is a control the smoke driver
cannot reach. Names that survive from the current UI are marked **kept**, so
the driver's existing locators keep working where nothing forces a change.

---

## Regions

| Region | Element and name | Owes |
|---|---|---|
| Header | `<header aria-label="Header">` | Brand, preset picker, read-only summary, last-run time, **Auto-assign**, **Export** |
| Unplaced dock | `<section aria-label="Unplaced events">` **kept** | One chip per unplaced event, or the note. Identifiable when empty |
| Tool rail | `<nav aria-label="Tool rail">` | Five buttons, the Findings badge |
| Inspector panel | `<aside aria-label="Inspector panel">` | One panel's content, its heading, dock and close |
| Canvas | `<section aria-label="Matrix canvas">` **kept**, inside `<main aria-label="Center view">` **kept** | Sticky axis, day groups, gutter, blocks |
| Detail strip | `<section aria-label="Selected event">` | The selected event and its three actions |
| Footer | `<footer aria-label="Status bar">` | Zoom, counts, metrics, legend, the view toggle |
| Schedule view | `<section aria-label="Schedule">` | One table section per day |

**Invariants across every region**

- The center never blanks. An invalid configuration dims the last valid layout
  and overlays blocking findings (carried from 004 FR-009).
- Findings, day summaries and footer counts follow the store per keystroke.
  The center relayouts on commit (carried from 004 FR-008).
- No control anywhere edits tournament type, days or strips except the
  Tournament and Strips panels.
- A rendering failure anywhere shows the error boundary's message and a
  reload control, never a blank page.

---

## Header

| Control | Role and name | Behaviour |
|---|---|---|
| Preset picker | `combobox` "Preset" **kept** | Two groups, labelled "Tournaments" and "Templates – invented figures". Choosing any entry applies it and runs Auto-assign |
| Summary | text, `data-summary` | `NAC · 4 days · 80 strips`. Not editable |
| Last run | text, `data-last-run` | `Last run 14:07`, absent until a run |
| Auto-assign | `button` "Auto-assign" | Disabled while any Blocking finding exists |
| Export | `button` "Export" | Opens the Export popover |

**Export popover**: `button` "Save to File" **kept**, `button` "Load from
File" **kept**, `button` "Generate Link" **kept**, the generated link in
`input[readonly]` **kept**, `button` "Copy" **kept**, and the dropped-placements
`role="status"` **kept**.

---

## Unplaced dock

Each chip is a `button` named by the event's label, carrying `data-unplaced-chip`,
`data-event-id`, `data-weapon`, and its need as text (`3 strips · 3:45 · DE
2:10`). Clicking selects the event. The note reads "Every event has a slot."
or, after a run, "Placed N events, M could not be placed."

---

## Tool rail

Five `button`s: "Tournament", "Strips & referees", "Events", "Findings",
"Settings" **kept**. The open one has `aria-pressed="true"`. The Findings
button carries `data-badge` with the undismissed count and renders it as text.

---

## Inspector panel

Header: `<h2>` with the panel name, `button` "Dock panel" / "Float panel",
`button` "Close panel".

### Tournament

| Control | Role and name |
|---|---|
| Type | `radiogroup` "Tournament type" **kept name**, six `radio`s NAC, RYC, RJCC, ROC, SYC, SJCC |
| Days | `radiogroup` "Day count" **kept name**, `radio`s 2, 3, 4, plus a disabled `radio` for an out-of-range value with the notice as text |
| Day hours | per day, `combobox` "Day N start" and "Day N end", 24-hour labels |

### Strips & referees

| Control | Role and name |
|---|---|
| Strips | `spinbutton` "Number of strips" **kept** – now the only element with that name |
| Video strips | `spinbutton` "Number of video strips" **kept**, with the Default marker and `button` "Revert video strips to default" |
| Suggested minimum | `<section aria-label="Suggested minimum">` holding the count as text (`data-suggested-strips`), a `role="status"` indicator while searching (**kept** text: "Searching for the smallest strip count that places every event…"), and `button` "Apply" |
| Referees per pool | text, `data-refs-per-pool` |

The `button` "Suggest" no longer exists. The driver's `pressSuggest` opens
this panel, waits for `data-suggested-strips`, and presses **Apply**.

### Events

Heading text `Selected N of 120`. One `<section>` per gender and weapon named
for it ("Women's Foil"). Each chip is a `button` with `aria-pressed`. A pressed
chip renders `spinbutton` "Fencer count for {label}" **kept** with
`min={MIN_FENCERS}`.

### Findings

A `list` of `listitem`s. Each carries `data-finding-id`, `data-severity`, the
severity badge as text, `where`, the message, and, when a target exists,
`button` "Show on grid". Dismissable rows carry `button` "Dismiss finding".

### Settings

`<section aria-label="Pool round durations">` **kept** with its per-weapon
inputs and revert buttons **kept**. `radiogroup` "DE mode" with `radio`s
"Staged" and "Single", plus the Default marker when following the type.

---

## Canvas

| Element | Attributes |
|---|---|
| Scroll container | `data-canvas-scroller`. Native `overflow: auto` |
| Time axis | `data-time-axis`, sticky top. Ticks `data-hour-tick` **kept** |
| Day group | `data-day-group={day}` **kept** |
| Day band | `data-day-band={day}`, sticky. Text: `Day N · E events · finishes H:MM · P of S strips at peak · F findings` |
| Gutter row | `data-strip-row` **kept**, `data-flagged="true"` when a finding targets an event on that row |
| Block | `role="img"` **kept**, `aria-label={name}` **kept**, `data-event-block` **kept**, `data-event-id`, `data-day`, `data-phase`, `data-phase-kind`, `data-start`, `data-end`, `data-strips`, `data-first-strip`, `data-overflow` (all **kept**), plus `data-weapon`, `data-pinned`, `data-selected`, `data-flash` |

Removed: `data-category`, `data-highlighted`, `data-canvas-viewport`,
`data-block-layer`, `data-row-line`, `data-day-grid`, the `toolbar` "Canvas
zoom controls", and the `group` "Matrix grid".

**Encoding contract**

| Channel | Carries | Testable as |
|---|---|---|
| Fill | Weapon | `data-weapon` and the token on the block. Three weapons, three fills |
| Hatch and icon | Phase | DE blocks carry the hatch and a bracket icon, pool blocks a grid icon |
| Name text | Category and gender | Present when the block has room, else in the tooltip |
| Badge | Pinned | `data-pinned="true"` and the pin glyph |
| Dashed edge | Overflow | `data-overflow="true"` |
| Ring | Selected | `data-selected="true"` |

Nothing highlights on hover from a metric. Nothing resizes. Nothing drags.

**Tooltip** **kept**: one Radix tooltip, `data-tooltip-field` for each of
name, weapon, category, gender, day, phase, start, end, duration, strips,
findings.

---

## Detail strip

| Control | Role and name | State |
|---|---|---|
| Name and facts | text, `data-selected-name`, `data-selected-day`, `data-selected-strips`, `data-selected-fencers` | strips read this render's lanes |
| Phase pills | `data-phase-pill={phase}` with times | – |
| Pin | `button` "Pin" / "Pinned", `aria-pressed` | absent for an unplaced event |
| Move day | `button` "Move day" opening a `menu` of `menuitem`s "Day N" | absent for an unplaced event |
| Flight | `button` "Flight", `aria-pressed` | present for any selected event |
| Collapse | `button` "Collapse details" / "Expand details" | – |
| Dismiss | `button` "Dismiss" | clears selection |

---

## Footer

| Control | Role and name |
|---|---|
| Zoom | `toolbar` "Zoom": `button`s "Zoom out", "Zoom in", "Reset zoom", "Fit day", and the readout `data-zoom-readout` (`100%`) |
| Counts | text `data-counts`: `N placed · N unplaced · N pinned` |
| Finish, Peak referees, Strip use | text `data-metric="finish"`, `"refs"`, `"strips"` |
| View toggle | `radiogroup` "Center view mode" **kept**, `radio`s "Matrix" and "Schedule" **kept** |
| Legend | text `data-legend` with the three weapon swatches |

The driver's `button` "Fit to day" becomes "Fit day".

---

## Schedule view

One `<section aria-label="Day N">` per day with a table whose rows carry
`data-schedule-row={competitionId}` **kept** and whose column headers **kept**
are Competition, Pool Start, Pool End, DE Start, DE End, Strips, Finish
(the Day column moves to the section heading). A `button` "Print" calls the
browser's print. Under `@media print` every region but this one is hidden and
each day section starts a new page.

---

## View equivalence contract (kept from 004)

The matrix and the schedule table read one derived model. For any tournament
state, the set of (event, day, start, end, strips) tuples is identical in both
views. `viewEquivalence.test.tsx` holds it and is re-targeted at the new
canvas's attributes, not rewritten.

---

## Serialization contract

| Travels in a share link | Does not |
|---|---|
| Tournament configuration, including `de_mode_override` | View mode, panel, dock state, detail collapse |
| Per-event fencer count and flighted flag | Zoom step, fit flag |
| Placements | Selection |
| Dismissed findings | Last run time |

A recipient gets the sender's schedule and keeps their own way of looking at
it. A payload from before this feature is refused with an error.

---

## What this feature does not add to the contract

Drag, per-phase placement, crossover checks on hand placements, a referee
count, a start date, strip numbers on placements, metric deltas, hover
highlight, resize handles. No affordance may suggest a block can be dragged,
because in this feature it cannot.
