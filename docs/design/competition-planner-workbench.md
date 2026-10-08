# Competition Planner Workbench — UI Design

**Status**: approved design, 2026-08-27. Supersedes the 2026-05-06 four-phase
Strip-Time Matrix rollout, whose plan files have been deleted. Its phase 1 scope
survives as P1 of the roadmap below and is specified in detail at
`specs/001-p1-foundations/` (specs/001-p1-foundations/spec.md, removed; git show 0ab5bd2dc9:specs/001-p1-foundations/spec.md).

This is the cross-phase design document. It outlives any single feature, so it
lives here rather than under `specs/`. Each phase gets its own feature
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
  After a run, 017 draws each phase from the run kept in memory (the
  scheduler's own times and strips) instead, and falls back to the derivation
  only for an event moved by hand or while the board is stale.
- `Auto-schedule all` overwrites every placement with `source: 'auto'`.
- Manual placement sets `source: 'manual'` and implies `pinned` unless the user
  unpins it.
- Placements serialize alongside the config, so a shared URL reproduces a
  hand-tuned schedule.
- `analysisStale`, `scheduleStale`, `markStale`, and `clearStale` are deleted.
  Nothing is ever stale when results are derived. 017 reintroduces one narrow
  staleness: a board is stale while the engine's inputs differ from the last
  run's (`configKey`), and it says so with a banner until the next run.

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

80 strips × 4 days is 320 rows, roughly 7000px tall at normal row height. This
document first called windowing load-bearing, with the SVG canvas rendering
only the visible row and time windows itself. Feature 013 removed windowing on
purpose. The canvas is now HTML on the mockup's DOM model, with native
scrolling and sticky positioning for the axis, the strip gutter, and the day
bands. The three recorded canvas defects all stemmed from the SVG viewport
owning its own scroll and zoom, and the HTML canvas closes them. Every strip row
of every day is in the document, which at 320 rows and roughly 50–130 blocks is
well inside what a browser lays out. See research D2 (../../specs/013-workbench-redesign/research.md,
"D2 – The canvas is HTML on the mockup's DOM model, with no windowing").

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
from the Claude Design mockup, is delivered and merged (`83168c7f2a`). 014,
structured bottlenecks, is merged (`24d19f7ed6`). 015, the ledger converging
with the store, is merged (`7975e4efea`). 024, the 2026-27 Operations Manual
conformance, is merged (`b84be7e291`). 016, hand placements obey the rules, is
delivered on branch `016-hand-placement-rules`
(`specs/016-hand-placement-rules/handoff.md`), awaiting the user's merge.
The original P1–P4 rows are all delivered: P1 as 001, P2 as 003, P3 as 004,
and P4's manual placement and pre-seeded scheduling as 013 (pins, Move day,
Auto-assign around pins – the pinned events are excluded from the loop's
seed, not from `buildEventStates`, per 013 research D1). P5 (FLUID) stays
deferred with no owner.

Baseline (after 019): `tsc -b` and lint clean, 93 files / 3133 tests. Drift
ledger B1–B8 scheduled 24 / 24 / 24 / 24 / 12 / 51 / 18 / 53, equal to the app
path on all eight, with 0 / 0 / 0 / 6 / 0 / 3 / 0 / 0 ERRORs. Snapshot SHA-256
`32a4e0afb45a…`. (After 018 it was 89 files / 3031 tests and `903cd991fbca…`,
the same counts and ERRORs. 019 moved only the snapshot's text, by deleting the
`constraint_relaxation_level` field. Before 018 it was 87 files / 2795 tests, 24
/ 24 / 24 / 21 / 12 / 45 / 18 / 53, 0 / 0 / 0 / 9 / 0 / 9 / 0 / 0 ERRORs and
`7e2db75c38bb…`. After 016 it was 82 files / 2278 tests and `cd484a89c7c9…`,
after 024 it was 81 files / 2148 tests and `7e2db75c38bb…`, and after 015 it was
78 files / 1830 tests, 24 / 24 / 24 / 18 / 12 / 40 / 18 / 53 and
`a4a71e333c77…`.) 018 moved B4 and B6 by the overrun and the Div 1 timings on
B1, B2, B7 and B8.

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

**Owner decisions, 2026-10-05:** every finding of the 2026-27 Operations Manual audit is ruled on, and the rulings were recorded in `backlog.md` §The engine's rules predate the 2026-27 Operations Manual (removed once 024 delivered them – `git show 41e2b975ee:docs/design/backlog.md` recovers it). They became feature 024, and METHODOLOGY.md carries them now.

### The finish line

The product is finished when every row below is delivered. Each becomes a Spec
Kit feature when picked up; numbers after 013 are provisional. Detail lives in
[`backlog.md`](./backlog.md) – the second column names its entry.

| # | Work | Backlog entry | Size | After | Drift review |
|---|---|---|---|---|---|
| **013** | Phase 8 close-out – polish, docs, the three decided fixes above, the retired-surface grep, live smoke, the full check twice, the owner's print check, handoff. `specs/013-workbench-redesign/sessions/S11.md` | – | M | – | no engine change |
| **014** | **Delivered 2026-10-04** – structured bottlenecks: `Bottleneck` gains a rule id and `subjects`, every producer fills them, the message-text readers move to them. `specs/014-structured-bottlenecks/handoff.md` | closed. Leftovers in §Day-level findings have no structured day | S–M | 013 | zero movement, measured |
| **015** | **Delivered 2026-10-05** – ledger converges with the store: the drift factory now applies the per-type cut, DE-mode and ref-policy rules, so B1–B8 are measured on what the app runs. `specs/015-ledger-convergence/handoff.md` | closed | M | 013 | re-baseline, measured |
| **016** | **Delivered 2026-10-07** – hand placements obey the rules: hard same-day pairs and the regional Group 1 window are checked on the current placements and shown as findings (a hard break is a Warning the organizer cannot dismiss), findings carry their day and the panel's row ids combine rule, owner, subjects and day, two-event findings mark both blocks, the first and last day WARN reaches the panel, and the footer's referee peak and the scheduler's `ref_requirements_by_day` are one number counted from the schedule as drawn. `specs/016-hand-placement-rules/handoff.md` | closed. Leftovers in §What 016 deliberately left unfixed | L | 014, 024 | referee peaks rose on 13 days (14 with a sabre move), counts and ERRORs unmoved |
| **017** | **Delivered 2026-10-07** – the canvas tells the truth: after a run the store keeps the scheduler's own times and strip indices in memory and the canvas draws them, so the boot footers read 24/0, 24/0, 24/0, 21/9, 12/0, 45/9, 18/0, 53/0 (they were 15/9, 13/11, 14/10, 11/19, 8/4, 17/37, 11/7, 30/23). An event moved by hand is laid on the strips the kept events leave free and never disturbs a kept one, and when no room is left it is the one Unplaced row, and Suggest, the referee count, the footer and the Findings panel apply one unseated rule (`unseatedPhases` in the engine, the drawn model in the store). Any change to the engine's inputs marks the board stale, with a banner and a Findings row, until the next run. Share links and saved files carry the run's pins and replay it, so the receiver's board equals the sender's. Blocks are keyboard buttons, and the referee peak returns to the scheduler's own timeline (roadmap row 025 folded in). `specs/017-canvas-tells-truth/handoff.md` | closed. Leftovers in §What 017 deliberately left unfixed | M | 016, 024 | referee peaks fell on 14 scenario-days back to the pre-016 snapshot, counts and ERRORs unmoved |
| **018** | **Delivered 2026-10-08** – engine correctness: an event's last phase (its DE, or a staged DE's round-of-16 video stage) may now end past the day's 22:00 hard end when it starts before it and ends by midnight. It is placed with one Warning that carries the finish, the Findings panel shows that Warning for run-placed and hand-moved events alike, and the canvas grows to show the late finish, so B4 now places 24 events (it placed 21) and B6 51 (it placed 45). Div 1 promotes 75 % at a NAC (the cut is 25 %), per the 2026-27 handbook. A fencer count must be a whole number from 2 to 336 (the handbook's cap, not 500): a link or file with anything else opens on B1 with a dismissable notice that names the event and the reason, and the engine skips such an event instead of crashing the page. The 0-or-1 link path was real and wider than the audit said. `specs/018-engine-correctness/handoff.md` | closed. Leftovers in §What 018 deliberately left unfixed | M | 024 | B4 21→24 and B6 45→51 by the overrun, Div 1 timings moved on B1, B2, B7 and B8, fencer bounds no movement |
| **019** | **Delivered 2026-10-08** – default days per template: picking a template raises the board's days to the fewest its own hard same-day rules need, read from the board's tournament type (4 for the three K₄ templates at a national type, 2 or 3 at a regional one), and never lowers them or touches the day hours. When the days are lowered below a minimum of 3 or more, a hint under the Days pills says how many the template needs and why. Div 1 and Junior team events now never share a day at any type, so the Div 1 ↔ Junior relaxation is gone and NAC Div1/Junior and NAC Vet/Div1/Junior no longer relax at 3 days. They break the pair and the Findings panel says so, as NAC Cadet/Junior already did. `specs/019-default-days-per-template/handoff.md` | closed. Leftovers in §What 019 deliberately left unfixed | S | 024 | ledger moved only by the deleted `constraint_relaxation_level` field, counts and ERRORs unmoved |
| **020** | **Delivered 2026-10-08** – re-run on parameter change: a change to the engine's inputs re-runs the schedule 300 ms after the last edit (017's `configKey` says when a re-run is due), with an "Updating…" indicator that shows only after a run has been due for 500 ms, a Settings switch, "Re-run automatically", on by default and remembered per browser, to turn it off, loads that open stale, and a hold that keeps the Findings panel's Unplaced rows and the footer's counts and metrics at the last run's values until the run lands. A run between a lower and a raise of the days now drops a pin left on the lowered-away day (ruling R4). The suite is 96 files / 3252 tests (it was 93 / 3133) and the ledger is byte-identical. `specs/020-rerun-on-parameter-change/handoff.md` | closed. Leftovers in §What 020 deliberately left unfixed | M | 013, independent of 014–019 | none, ledger unchanged |
| **021** | METHODOLOGY reconciliation – retire the eight time-of-day weights, the last cheap weight fix (`WEAPON_BALANCE` – 010 wired the proximity one and 024 the cross-weapon one as Group 3), the doc's self-contradictions, the verdicts in [`methodology-reconciliation.md`](./methodology-reconciliation.md) (minus L6 and L14, the video tiers and the DE prelims split, which 024 settled), delete `daySequencing.ts` and the dead constants, and add the calibration scenario | §METHODOLOGY.md and the engine have diverged, §Dead code held back, §Calibration debt | M–L | 018 (day-end wording, delivered) | yes |
| **022** | Release housekeeping – README, dev port, stale settings, stale citations | §Release housekeeping | S | last | no |
| **023** | Team events go straight to DE – see the scope below | §Team events are scheduled with a pool round | L | 015, 024 | B1, B2, B8 move, B3–B7 must not |
| **024** | **Delivered 2026-10-06** – 2026-27 Operations Manual conformance, one commit per rule group with its drift record: pool and DE times from the manual (A), a 9:00–19:00 day with a 22:00 hard end and a ÷ 14 strip baseline (B), the Y14 and RYC cuts and the 256-fencer DE cap (E), video required for every NAC individual event with team events Single Stage and best-effort (C), and the same-day rules by tournament type (D): Group 1, which now includes Div 1–Cadet, is hard at NAC, SYC and SJCC and soft at ROC, RYC and RJCC with a time-of-day window that holds the older side's pools until day start + 4 hours (METHODOLOGY §Overlapping-Population Separation (Group 1)), plus new Group 2 and 3 soft rules and shorter first and last days. `specs/024-ops-manual-conformance/handoff.md` | closed. Leftovers in §What 024 deliberately left unfixed | L | 015 | re-baseline, measured per group |
| **025** | **Folded into 017** (owner ruling R1, 2026-10-07) – keep each phase's times after a run so DE starts and the referee peak stop reading early on busy days. 017 delivered it, with a hand-moved event laid end to end from its new day and start | closed. See §The canvas draws phases without the scheduler's waits | M | 016 | the referee peak moved again, inside 017 |

020 can run beside any of 014–019 since it touches only the UI. Everything else
runs in the order shown. 023 takes the next free number rather than renumbering
016–022, which would churn their references. Its dependency is "after 015", and
it runs before 022, which stays last. 024 likewise takes the next free number.
It runs right after 015 and ahead of 016–019 and 023, so they are measured
against the 2026-27 planning times rather than the ones it replaces. 023 also
takes its team-match length from 024's DE timing basis, which 024 delivered.
025 took the next free number too, for the canvas timing gap 016's referee change
made visible, and the owner folded it into 017 on 2026-10-07.

#### 023 scope (owner decisions, 2026-10-04)

Team events have no pool round. Since 015 the ledger factory plans team DEs as
the app does, and since 024 that is Single Stage with no video at every
tournament type, so team events already plan no video and run single-stage.
One ledger move covers what is left, including the B1/B2 count replacement.

- **No pool phase for teams.** Every place that counts team pools changes: the
  phase builder (`concurrentScheduler.ts:538-557`), `derive.ts`, `capacity.ts`,
  referee demand (`refs.ts`, `concurrentScheduler.ts:1477-1484`), the strip
  budget (`stripBudget.ts`), `validation.ts`, `flighting.ts`, `analysis.ts`
  and the pinned-placement budget. The full file list is in the backlog entry.
- **"Placed" stops meaning "has a pool start".** `runActions.ts:58`,
  `stripSearch.ts:146`, the `appPath.ts` helper, `serialization.ts:253-254`
  (rejects `strip_count` < 1) and the dock chip all anchor on the pool.
- **The team DE is modelled for teams – done by 024.** The strips are sized to
  the field (`min(bracket / 2, 16)`, `deStripFootprint` in `de.ts`) in place of
  the fixed `de_round_of_16_strips: 4`, which is gone. The match length is the
  team match time (60 min foil and épée, 30 sabre), and no team DE asks for
  video (`resolveVideoPolicy` in `typeDefaults.ts`, METHODOLOGY §Video Replay
  Policy, Teams row). The mockup's 260–300 minute team DEs are a calibration
  hint, not data. What 023 still owes is the pool round, above.
- **The Schedule view's Strips column** for a team row reports DE strips, since
  it prints `pool_strip_count` today (`ScheduleOutput.tsx:183`).
- **Real B1/B2 team counts** from FencingTimeLive replace the rounded ones
  (`src/data/tournaments.ts:41-42`, `56-57`).
- **Prerequisite**: the owner amends METHODOLOGY.md first – §Outputs,
  §Single-Day Fit, §Resource Preconditions, §Team Events Cannot Use Cuts,
  §Individual/Team Separation, §Concurrent Phase Scheduler, §Phase 2:
  Pre-Scheduling Analysis, §Phase 5: Resource Allocation, §Strip Count
  Suggestion and §Strip-Hour Capacity.
- **Ledger**: B1, B2 and B8 move. B3–B7 must not. The app-path counts
  (24 / 24 / 53) and the smoke's 24-row boot hold.

### After finish

Recorded in `backlog.md`, not needed to call the product finished, and not
scheduled: global settings as a config file, a what-if scenario mode, the
bounded re-colour repair for runtime failure, the test-comment fixture audit,
P5 (FLUID), and the experimental mode (rejected in 012). Five of them wait on
an owner decision or on data first: vet co-day serialization, per-event entry
caps, the strip non-monotonicity warning, youth pool calibration, and real
2026-27 templates with the Elite/National split. The policy-tables entry's
rows other than the Div 1 cut sit here too, since 018 delivered the Div 1 cut
and 024 the Y14 and RYC cuts.

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
- ~~Replacing the empirical `de_duration_table`.~~ Lifted 2026-10-05, and done by 024: DE length derives from the 2026-27 Operations Manual's bout times, round by round.

## Open items carried forward

[`backlog.md`](./backlog.md) is the single record of every open item, and
§Roadmap above is its index – the finish-line table and §After finish name
every entry. Detail goes in the backlog and nowhere else.
