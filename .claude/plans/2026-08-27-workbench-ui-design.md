# Competition Planner Workbench — UI Design

**Status**: approved design, 2026-08-27. Supersedes the 2026-05-06 four-phase
Strip-Time Matrix rollout, whose plan files have been deleted. Its phase 1
scope survives as P1 of the roadmap below and is now planned in detail in
[`2026-08-27-p1-foundations-plan.md`](./2026-08-27-p1-foundations-plan.md).

## Summary

Piste Planner becomes a single-page **competition planner workbench**. The
user loads a real tournament, sees its full schedule rendered as a
strips × time matrix, and adjusts it interactively – adding and removing
events, changing start times, changing strip allocation, moving events between
days. The engine stops being the scheduler and becomes the advisor: it computes
durations, validates continuously, and warns, but it does not block and it does
not own the layout.

Auto-scheduling remains available as an explicit action. It is no longer the
primary interaction.

## Motivation

The current app is a form that produces a report. Two layouts (a 4-step wizard
and a single-page "kitchen sink") both collect parameters, run `scheduleAll` on
a button press, and render a table. The user cannot see what the scheduler did
spatially, cannot disagree with it, and cannot express intent the engine does
not already model.

Tournament organizers do not want a schedule generated for them and handed
over. They want to see the consequences of their own choices, override the
engine where their judgment differs, and be told when an override costs them
something. "Improve" means *by the organizer's preference*, not against an
objective function we invented.

Two measurements made this design viable:

- Full `scheduleAll` on B8 (53 events, 4 days, 80 strips) runs in **9ms**, B6
  (54 events) in **8ms**, B1 in **10.8ms**. Continuous recomputation is well
  inside a frame budget. No worker, no debounce beyond input settling.
- B1 currently schedules **24 of 24 events with 0 errors**. Presets load clean,
  so the workbench's job is quality tuning, not failure rescue.

## Decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | Two-tier recompute: metrics and findings on every keystroke, canvas relayout on commit | Numbers can flicker legibly. A matrix that reshuffles per keystroke reads as instability, not responsiveness. Day assignment is greedy penalty-minimization, so one extra fencer can flip a day and move everything. |
| 2 | Invalid config keeps the last valid layout on canvas, dimmed, with blocking findings overlaid | Intermediate edit states are routinely invalid. The canvas must never blank. Pure UI-layer concern, no engine change. |
| 3 | The workbench replaces both existing layouts | One user story does not justify two UIs. `WizardShell`, the four step components, `KitchenSinkPage`, `layoutMode`, and the layout toggle are deleted. |
| 4 | Placements are stored user intent. The schedule is derived from them | Inverts today's model, where `scheduleResults` is the source of truth and the store only remembers inputs. Without this, manual work has nowhere to live and auto-schedule silently eats it. |
| 5 | Policy rules are advisory when the user places an event, binding when auto-schedule places it | The user may violate policy knowingly. The auto-scheduler cannot – `crossoverPenalty` returning `Infinity` is the mechanism day assignment uses to keep overlapping categories apart. Same rule set, two consumers. |
| 6 | Structural preconditions stay blocking in both modes | Fencer count outside 2–500, days < 1, strips < 1. Pool and DE duration math is undefined outside these bounds, so there is nothing to draw. |
| 7 | Manipulation unit is the block. A DE bout can never be dragged away from its siblings | Bounds the editor's scope. The engine may still reason about bouts internally. |
| 8 | Event-level placement first, unpack-to-blocks second | Event-level covers everything the organizer asked for and stays legible on an 80-strip canvas. Per-strip block control is where the operational value is, and where the scope risk is. |
| 9 | Fill encodes age category. Phase moves to an edge-bar plus hatch fill | Fill can carry only one variable. Category is the scanning axis. |
| 10 | Auto-schedule ships as two actions: "Auto-schedule all" and "Auto-fill unplaced" | The first is free. The second needs a real engine change and lands with manual placement. |

## Architecture

### Shell

Full-bleed, four regions. The `max-w-4xl` centered card stack is gone.

- **Top bar** – preset picker, tournament type / days / strips as compact inline
  controls, `Auto-schedule all`, `Auto-fill unplaced`, save/share.
- **Left rail** (~320px, scrollable, collapsible panels) – Tournament (type,
  days, per-day start and end times), Strips (general, video), Events (add,
  remove, fencer counts), Per-event overrides (cut, DE mode, strip caps).
- **Center canvas** – the matrix, the main content of the page.
- **Bottom drawer** (resizable) – scorecard and findings list. Bottom rather
  than right so the canvas keeps full width for 80 strips.
- **Unplaced tray**, docked above the canvas – events with no placement. Adding
  an event drops it here. Dragging it onto the canvas places it. Makes "what
  have I not scheduled yet" visible at a glance.

Existing section components are judged individually. `StripSetup` and
`FencerCounts` are already compact controls and become rail panels.
`AnalysisOutput` becomes the findings list and the invalid-state overlay.
`ScheduleOutput` becomes the Schedule view behind the view toggle.
`TemplateSelector` is superseded by the preset picker.

### State model

The store holds a `placements` map keyed by event id. Each placement records:

| Field | Meaning |
|---|---|
| `day` | assigned day index |
| `start_time` | minutes from midnight, snapped to `SLOT_MINS` |
| `strip_count` | how many strips the event draws |
| `strips` | explicit strip indices, set only once the event is unpacked to blocks |
| `source` | `auto` or `manual` |
| `pinned` | excluded from `Auto-fill unplaced` reallocation |

Rules:

- Block geometry is **derived** from placement plus competition via the
  engine's existing duration math in `pools.ts` and `de.ts`. It is never stored.
- `Auto-schedule all` overwrites every placement with `source: 'auto'`.
- Manual placement sets `source: 'manual'` and implies `pinned` unless the user
  unpins it.
- Placements serialize alongside the config, so a shared URL reproduces a
  hand-tuned schedule.
- `analysisStale`, `scheduleStale`, `markStale`, and `clearStale` are deleted.
  Nothing is ever stale when results are derived.

### Validation

`validateConfig`'s ERROR tier splits by kind, not by mode.

- **Structural preconditions** – fencer count bounds, days < 1, strips < 1.
  Blocking in both modes.
- **Policy rules** – same-population conflicts, Vet co-day rule, Group 1
  separations, strip minimum, team-requires-individual, cut-on-team. Advisory
  for user placements, binding for auto-schedule.

The `days_available` 2–4 cap at `validation.ts:379` is policy rather than
structure. The accepted range widens and values outside 2–4 warn instead of
erroring, so 5+ day layouts can be explored interactively.

Findings carry a stable identity so a dismissed or accepted finding stays
dismissed across recomputes.

### Canvas

**Encoding**

| Channel | Variable |
|---|---|
| Block fill | age category / division |
| Left edge-bar and hatch | phase (solid = pools, hatched = DE) |
| Icon inside block | weapon |
| Text label prefix | gender |

The catalogue spans up to 16 category values (Y8 through Div3, Vet Combined,
five Vet age bands). Categorical palettes stop being distinguishable somewhere
around 8–10 hues, so this is built as hue *families* – youth, cadet/junior,
senior divisions, veteran – with lightness steps inside each family. That
grouping also mirrors the crossover structure the scheduler already models. The
palette itself is designed during implementation, not fixed here.

Weapon glyphs for foil, épée, and sabre are custom inline SVG – lucide has no
equivalents. Icons drop below a block-width threshold and the tooltip carries
the weapon instead.

**Zoom and mechanics**

- X axis (time): continuous zoom in minutes-per-pixel, cursor-anchored, with the
  hour axis pinned at the top of each day group.
- Y axis (strips): stepped row heights – compact (~8px, no labels or icons),
  normal (~22px), tall (~40px, full labels). Stepped rather than continuous
  because icon and text legibility falls off a cliff.
- Strip labels sit in a frozen left gutter. Day headers are sticky bands.
- Fit-to-day and fit-to-tournament presets, plus zoom-to-selection on an event.

**Virtualization**

80 strips × 4 days is 320 rows, roughly 7000px tall at normal row height. visx
does not virtualize, so the canvas renders only the visible row window and the
visible time window. This changes the component's structure rather than being a
later optimization, so it belongs in the first implementation.

**Tooltip**

An HTML overlay, not the `title` attribute. visx's `useTooltip` with
`<TooltipWithBounds>`, portaled so it escapes the canvas clip and flips near
viewport edges. Contents: event name, weapon, category, gender, day, phase,
start and end as HH:MM, duration, strip range, and any findings attached to
that block.

### Scorecard

The drawer's scorecard is feedback, not a target. There is no aggregate score,
because "better" is the organizer's judgment and any weights we picked would
encode our guesses instead of theirs.

**Collapsed by default** – finish time and peak referee demand only, the two
numbers that drive venue and staffing decisions. A `[+]` control expands it to
the full set: per-day and per-tournament finish times, peak referee demand split
into total and sabre, strip utilization, day-balance spread, and finding counts
by severity. Expanded or collapsed is remembered across sessions but is not part
of the serialized tournament config.

Every metric shows a delta against the loaded preset, which stays frozen as the
baseline – "finish 19:40 (+35m), peak refs 62 (−4)". Hovering a metric
highlights the blocks driving it.

All of these numbers already exist. `ref_requirements_by_day` comes out of the
engine today, utilization falls out of `strip_allocations`, finish time out of
the derived placements, and findings out of validation. The scorecard is
presentation over data the engine already produces.

### View toggle

`Matrix` ⇄ `Schedule`. Schedule is the existing `ScheduleOutput` table
re-pointed at derived placements and grouped by day – the artifact an organizer
would publish or hand to a bout committee. Both views read the same derived
model, so they cannot disagree.

### Presets

`src/data/tournaments.ts` holds the B1–B8 rosters, each as an id, display name,
`source_url`, tournament type, day count, strip counts, and the
`Record<catalogueId, fencerCount>` roster. `__tests__/engine/integration.test.ts`
imports from there instead of declaring fixtures inline, so presets stay real by
construction and the scenario tests keep guarding them.

The app boots with a preset already loaded and auto-scheduled. The first frame
is a full canvas, not an empty form.

## Roadmap

Each phase gets its own implementation plan when it is picked up. This document
is the design they all reference.

| | Work | Depends on |
|---|---|---|
| **P1** | Foundations – `SLOT_MINS` 5, pod removal, double-strip removal, capacity model collapse, `perBoutDuration` helper. Planned in [`2026-08-27-p1-foundations-plan.md`](./2026-08-27-p1-foundations-plan.md) | – |
| **P2** | Derived state – placements as intent, store inversion, staleness removal, validation split, days cap widened, findings identity, presets moved to `src/data` | P1 |
| **P3** | Workbench shell and canvas – visx matrix with zoom, virtualization, encoding, tooltip, rail, tray, drawer, view toggle. Deletes wizard, kitchen sink, and `layoutMode` | P2 |
| **P4** | Manual placement – event-level drag, unpack-to-blocks, advisory edit validation, undo/redo, `Auto-fill unplaced` via pre-colored DSatur and pre-seeded scheduler state | P3 |
| **P5** | FLUID bout allocator – deferred. An auto-schedule strategy with no UI dependency | P1 |

`Auto-schedule all` works from P3. `Auto-fill unplaced` needs P4's engine
change: `createGlobalState` starts empty at `concurrentScheduler.ts:183` and
`assignDaysByColoring` colors every vertex, so pinned events need pre-seeded
strip intervals, pre-colored days, and exclusion from `buildEventStates`.

## Testing

- Engine tests are unchanged. B1–B8 keep running the **no-pins** path so the
  baselines stay meaningful once pinning exists.
- Re-baseline the stale integration floors during P2. B1 asserts `>= 14` while
  actually scheduling 24 of 24, which makes the assertion close to vacuous.
- New coverage: placement reducers, validation-mode mapping (one rule yielding
  ERROR when binding and WARN when advisory), derived-geometry purity.
- Component coverage: canvas render smoke test, encoding correctness, tooltip
  contents, zoom state, view toggle.
- Roughly 70 wizard and kitchen-sink tests are pruned or re-targeted.

## Out of scope

- Dragging individual DE bouts (decision 7).
- Multi-block selection and group drag.
- Conflict auto-resolution suggestions.
- Mobile and touch drag.
- Collaborative editing.
- Export to PNG or PDF.
- Replacing the empirical `de_duration_table`.

## Open items carried forward

These predate this design and are unaffected by it:

- Youth-event pool duration calibration – B4 predicts 5–6 hours for Y8/Y10
  events that finish in 2–3 hours in reality.
- `CAPACITY_TARGET_FILL = 0.3` in `dayColoring.ts` was tuned for the deleted
  serial scheduler and has never been re-tuned against concurrent-scheduler
  baselines.
- Global settings – engine constants as a user-editable configuration file with
  defaults, where serialization persists only the overrides.
