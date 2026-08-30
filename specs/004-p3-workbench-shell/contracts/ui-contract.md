# UI Contract: The Workbench

The application's interface is its UI, so this is the contract this feature
exposes. It states what each region owes the organizer and what tests may hold
it to. Shapes are in [data-model.md](../data-model.md), reasoning in
[research.md](../research.md).

Accessible names matter here beyond accessibility: they are what both the
component tests and `scripts/smoke.mjs` locate controls by. A control listed
below without a stable name is a control the smoke driver cannot reach.

---

## Regions

| Region | Owes | Named for location by |
|---|---|---|
| Top bar | Preset picker, tournament type, day count, strip count, `Auto-schedule all`, save and share, gears | Each control has a stable accessible name. |
| Left rail | Collapsible panels: Tournament, Strips, Events, Per-event overrides, Advanced | Each panel is reachable by its heading whether expanded or collapsed. |
| Unplaced tray | Every event with no placement | The tray is identifiable when empty, not only when populated. |
| Center | The active view – matrix or schedule | The view toggle reports which is active. |
| Bottom drawer | Findings list and scorecard, resizable | Both are present whether the drawer is large or small. |

**Invariants across every region**

- The center region never blanks. An invalid configuration dims the last valid
  layout and overlays blocking findings (FR-009).
- Metrics and findings update per keystroke; the center relayouts on commit
  (FR-008).
- No control anywhere switches layouts, and no "results out of date" state
  exists in any region.

---

## Encoding contract

What a block must communicate without being clicked. This is the part of the
contract a test can assert and a human must confirm.

| Channel | Carries | Testable as |
|---|---|---|
| Fill | Age category | The category token is on the block. Two categories in different families carry different tokens. |
| Left edge-bar and hatch | Phase | Pool and DE blocks differ in this channel and match in fill when their category matches. |
| Icon | Weapon | Present above the width threshold, absent below it. |
| Label prefix | Gender | Present at normal and tall row heights. |

**Degradation order** as a block narrows: label text drops first, then the
weapon icon, then the label prefix. Fill and edge-bar never drop – they are the
channels that survive at compact row height. Anything dropped appears in the
tooltip instead (FR-016, FR-022).

**Not assertable by a test**: whether an organizer can actually name a block's
category, phase, weapon, and gender at a glance (SC-004). A test can confirm the
tokens are present and distinct. Only a person can confirm they are
distinguishable. See [quickstart.md](../quickstart.md) for where that judgment
is made.

---

## Tooltip contract

One tooltip, driven from a single canvas-level pointer handler against a
positioned anchor (research D3).

Contents, in order: event name, weapon, category, gender, day, phase, start and
end as HH:MM, duration, strip range, and any findings attached to that block.

- It escapes the canvas clip.
- It flips rather than being cut off near a viewport edge.
- It shows what the block's own channels dropped for want of width.

---

## View equivalence contract

The matrix and the schedule table read one derived model, so they cannot
disagree (FR-023). The assertion that holds this: for any tournament state, the
set of (event, day, start, end, strips) tuples is identical in both views.

This is the contract most worth a test, because it is the one that silently
breaks – a view that reads its own copy of anything will drift from the other
without any single change looking wrong.

---

## Scorecard contract

| State | Shows |
|---|---|
| Collapsed | Finish time and peak referee demand. Nothing else. |
| Expanded | Adds per-day and per-tournament finish times, peak referee demand split total and sabre, strip utilization, day-balance spread, finding counts by severity. |
| Preset loaded | Every metric with its delta from the frozen baseline. |
| No preset | Every metric with no delta. Not a zero delta – no delta (research D9). |
| Any metric hovered | The blocks driving it are highlighted on the canvas. |

There is no aggregate score in any state (FR-025). "Better" is the organizer's
judgment, and any weights chosen here would encode a guess as if it were theirs.

---

## Settings contract

Two surfaces, and the distinction between them is the contract.

### The rail's Advanced panel – per-type defaults

| State | Shows |
|---|---|
| Collapsed | The applied defaults as dim text, readable without expanding. |
| A value following its type default | Marked as following the default. |
| A value the organizer set | Marked as explicit, with the default it departs from. |
| Any tournament type change | Following values move. Explicit values do not. Nothing is lost. |

Hard policies are absent from this panel. Rules the handbook imposes – regional
cut overrides among them – continue to beat the organizer's own setting, which
is the opposite precedence from the defaults on this panel (FR-040).

### The gears panel – engine settings

| State | Shows |
|---|---|
| Unmodified | The default, with its value. |
| Modified | Marked as overridden, showing the default it departs from, with a reset. |
| Shared by URL | Only the modified settings travel. Unmodified ones track their defaults. |

Contents: admin gap, flight buffer, flighting threshold, scheduling grid
resolution, per-weapon DE bout durations, the youth and veteran bout adjustment,
the DE strip footprint, and the pool round durations – which move here out of
the rail.

Absent, and deliberately: scheduling weights, penalty matrices, category start
preferences, earliest-start offsets (FR-047).

---

## Serialization contract

| Travels in a shared URL | Does not |
|---|---|
| Tournament configuration | View mode, zoom, scroll position |
| Placements | Row height step, drawer size |
| Dismissed findings | Scorecard expansion |
| Settings overrides | The scorecard baseline |

A recipient gets the sender's schedule and their settings, and keeps their own
way of looking at it.

---

## What this feature does not add to the contract

Manual placement, dragging, unpack-to-blocks, undo/redo, and
`Auto-fill unplaced` are P4. No affordance in this feature may suggest a block
can be moved, because in this phase it cannot.
