# Competition Planner Workbench — UI Design

**Status**: approved design, 2026-08-27. Supersedes the 2026-05-06 four-phase
Strip-Time Matrix rollout, whose plan files have been deleted. Its phase 1 scope
survives as P1 of the roadmap below and is specified in detail at
`specs/001-p1-foundations/` (specs/001-p1-foundations/spec.md, removed; git show 0ab5bd2dc9:specs/001-p1-foundations/spec.md).

This is the cross-phase design document. It outlives any single feature, so it
lives here rather than under `specs/`. Each phase gets its own Spec Kit feature
directory when it is picked up, and those specs reference this document rather
than restating it.

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

80 strips × 4 days is 320 rows, roughly 7000px tall at normal row height. The
canvas is plain SVG built by the component itself – no charting library is a
dependency (research D1 (specs/004-p3-workbench-shell/research.md, removed; git show 0ab5bd2dc9:specs/004-p3-workbench-shell/research.md)) – so
the component renders only the visible row window and the visible time window
itself. This changes the component's structure rather than being a later
optimization, so it belongs in the first implementation.

**Tooltip**

An HTML overlay, not the `title` attribute. A single controlled Radix
`Tooltip` – `radix-ui` is already a dependency – anchored at a zero-size
element the canvas positions per hovered block, portaled so it escapes the
canvas clip and flipped near viewport edges by Radix's own collision detection
(research D1 (specs/004-p3-workbench-shell/research.md, removed; git show 0ab5bd2dc9:specs/004-p3-workbench-shell/research.md), D3). Contents:
event name, weapon, category, gender, day, phase, start and end as HH:MM,
duration, strip range, and any findings attached to that block.

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

*Rewritten 2026-10-04 at `main` `e9fca69e70`, from the state-of-project audit of
that day (removed once folded in here; `git show e9fca69e70:docs/design/state-of-project-2026-10-04.md`).*

### Where it stands

Features 001–012 are delivered and their spec folders removed – `git show
0ab5bd2dc9:specs/<feature>/` recovers any of them. 013, the workbench redesign
from the Claude Design mockup, has phases 0–7 merged. The original P1–P4 rows
are all delivered: P1 as 001, P2 as 003, P3 as 004, and P4's manual placement
and pre-seeded scheduling as 013 (pins, Move day, Auto-assign around pins –
the pinned events are excluded from the loop's seed, not from
`buildEventStates`, per 013 research D1). P5 (FLUID) stays deferred with no
owner.

Baseline: `tsc -b` and lint clean, 76 files / 1747 tests. Drift ledger B1–B8
scheduled 24 / 24 / 24 / 17 / 12 / 45 / 18 / 52, app-path parity 17.

### Owner decisions, 2026-10-04

| Question | Answer | Lands in |
|---|---|---|
| 013 finding 6 – nothing returns `de_mode_override` to null | A third "Default" pill | 013 phase 8 |
| 013 finding 13 – a placed block is mouse-only | Blocks become buttons | 017 |
| 013 finding 25 – the pin badge reads `placements` live | Fix inside 013 | 013 phase 8 |
| 013 finding 16 – late finish reads block ends, not `de_total_end` | Accept, data-model §9 corrected | done |
| 013 finding 7 – unreachable team-cut coercion loop | Delete it | 013 phase 8 |
| T039 – "boot places 24 of 24" while the footer reads 19 / 5 | Pass on 24 schedule rows, record the footer; the overflow is fixed later | 013 phase 8, 017 |
| The eight time-of-day penalty weights | Retire them from METHODOLOGY as Phase D casualties | 021 |

### The finish line

The product is finished when every row below is delivered. Each becomes a Spec
Kit feature when picked up; numbers after 013 are provisional. Detail lives in
[`backlog.md`](./backlog.md) – the second column names its entry.

| # | Work | Backlog entry | Size | After | Drift review |
|---|---|---|---|---|---|
| **013** | Phase 8 close-out – polish, docs, the three decided fixes above, the retired-surface grep, live smoke, the full check twice, the owner's print check, handoff. `specs/013-workbench-redesign/sessions/S11.md` | – | M | – | no engine change |
| **014** | Structured bottlenecks – `Bottleneck` gains a rule id and `subjects`, every producer fills them, both message-text consumers move to them | §`Bottleneck` has no structured field | S–M | 013 | yes, expect zero movement |
| **015** | Ledger converges with the store – the drift factory applies the per-type cut, DE-mode and ref-policy rules; B4's 18-vs-17 isolated first. A deliberate re-baseline, so every later engine fix is measured against what the app runs | §The drift ledger's factory | M | 013 | re-baseline |
| **016** | Hand placements obey the rules – crossover hard edges checked on the current placements and shown as findings; one referee-peak number for the footer and the engine | §Hand-placed events, §The scorecard's peak-referee row | L | 014 | if the referee fix touches the engine |
| **017** | The canvas tells the truth – one strip model for engine and canvas so B1 boots 24 / 0; blocks become keyboard-operable buttons | §The canvas calls events unplaced, §A placed block cannot be selected | M | 015 | if the engine assigns strip ranges |
| **018** | Engine correctness – DE prelims bout share, day-end overrun as a warning, Div 1 cut 25 %, the fencer-count ≤ 1 URL path verified. One drift review per fix | §DE prelims, §Day-end overrun, §Policy tables (Div 1 only), §A shared URL with a fencer count of 0 or 1 | M | 015 | one per fix |
| **019** | Default days per template – the three K₄ templates default to 4 days so they satisfy their own hard rules | §The store's default day count | S | 015 | parity only |
| **020** | Re-run on parameter change – debounced, with a show-after-delay working indicator | §Changing a parameter should re-run the engine | M | 013, independent of 014–019 | no |
| **021** | METHODOLOGY reconciliation – retire the eight time-of-day weights, the three cheap weight fixes, the doc's self-contradictions, the verdicts in [`methodology-reconciliation.md`](./methodology-reconciliation.md); delete `daySequencing.ts` and the dead constants; add the calibration scenario | §METHODOLOGY.md and the engine have diverged, §Dead code held back, §Calibration debt | M–L | 018 (day-end wording) | yes |
| **022** | Release housekeeping – README, dev port, stale settings, stale citations | §Release housekeeping | S | last | no |

020 can run beside any of 014–019 since it touches only the UI. Everything else
runs in the order shown.

### After finish

Recorded in `backlog.md`, not needed to call the product finished, and not
scheduled: global settings as a config file, a what-if scenario mode, the
bounded re-colour repair for runtime failure, the test-comment fixture audit,
P5 (FLUID), and the experimental mode (rejected in 012). Five of them wait on
an owner decision or on data first: vet co-day serialization, per-event entry
caps, the strip non-monotonicity warning, youth pool calibration, and real
2026-27 templates with the Elite/National split. The policy-tables entry's
rows other than the Div 1 cut sit here too.

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

[`backlog.md`](./backlog.md) is the single record of every open item, and
§Roadmap above is its index – the finish-line table and §After finish name
every entry. Detail goes in the backlog and nowhere else.
