# Research: 013 workbench redesign

Decisions with their reasoning and the alternatives weighed. Product decisions
were taken by the product owner on 2026-09-07 and live in
[alignment §9](../../docs/design/workbench-design-alignment-2026-09-07.md),
and this file settles the technical ones the spec leaves open. `[R]` read at
`78ae3b28f4`, `[M]` measured, `[Mockup]` read from the Claude Design file
*Piste Planner Workbench* on 2026-09-07.

---

## D1 – Pinned events enter the scheduler fixed

**Decision**: `scheduleAll(competitions, config, pinned = [])` gains a third,
optional parameter: `PinnedPlacement[]` of `{ competition_id, day, start_time,
strip_count }` on the **scheduler axis** (day × 1440 + clock start, the same
conversion `runActions.ts` reverses today). Every new branch is guarded by
`pinned.length > 0`, so the no-pins path executes the same statements it does
today.

The mechanism, in the order the scheduler runs `[R]` `concurrentScheduler.ts:199–344`:

1. **Day assignment** (`dayColoring.ts:632` `assignDaysByColoring`). Both
   `dsaturLoop` passes (`:669`, `:686`) start with `coloring` seeded from the
   pins and `uncolored` excluding them (`:458–463`). Saturation, blocked
   colours (`:499–505`), the Vet co-day rule (`:510`) and the soft penalties
   then see a pinned event as an already-coloured neighbour, which is exactly
   what keeps its crossover neighbours off its day. When any pin exists, phase
   2 runs at `max(effectiveDays, maxPinnedDay + 1)` colours and the
   compaction step (`:691–696`) is skipped, so a pin on Day 3 stays on Day 3
   even when the packer would have used two days. With no pins, `effectiveDays`
   and compaction are untouched.
2. **Event states** (`:355` `buildEventStates`). Pinned events are built like
   any other, with `assigned_day` from the seeded map. They must remain in
   `events`: `applyCrossEventEdges` (`:620`) wires individual→team and Vet
   sibling ordering by event id, and a pinned team event's predecessor lookup
   (`:1250` `predecessorReadyTime`) reads the pinned phases' `end_time`.
3. **Pre-claim** – a new pass between `applyCrossEventEdges` and
   `runConcurrentLoop`. For each pin in a fixed order (day, start, id), walk
   the event's phase nodes in sequence: the first node's `ready_time` is the
   pinned start, each successor's is the predecessor's end plus the admin gap
   (or flight buffer), the same rule the loop applies at `:760–774`. Call
   `tryAllocate` (`:945`) once per node. On `ok` the strips are claimed and the
   node is `RUNNING` with its `end_time`, as in the loop. On `defer` or `fail`
   the node is still marked `RUNNING` with `end_time = ready_time + duration`
   and **no** interval is claimed, and one WARN bottleneck
   (`PINNED_UNCLAIMED`, a new `BottleneckCause`) names the event and phase.
   Either way `commitEventResult` (`:1160`) records the result with the pinned
   day and pool start. A pin is never deferred, never retried, never dropped.
4. **The loop** (`:690`). Seeding (`:699–708`) skips pinned events – they are
   already committed. `handlePhaseFailure` (`:835`) can therefore never see a
   pinned event, so attempt-2 retry and permanent failure do not apply.
5. **The store** (`runActions.ts`). `runScheduleAll` builds the pinned list
   from placements with `pinned: true` **and** a day inside
   `[0, days_available)`, and a pin outside that range is left out and so is
   scheduled afresh (clarification 2026-09-07). After the run, pinned
   placements are kept verbatim (day, start, strip count, source, pinned),
   auto placements are taken from the result for every other event, and the
   action returns `{ placed, unplaced }` and stamps `lastAutoRun`.

**What the engine chooses**: which strips a pin occupies (`findAvailableStripsInWindow`
at the pinned time) and how many, capped as for any event (`:956–968`). The
store never stores them (D2 in §9). Two pins that together exceed the strip
count both keep their day and start. The second's `PINNED_UNCLAIMED` warning
is engine-side, and the store's lane packer independently reports the
collision as an Unplaced finding, which is the surface the spec names.

**Verified twice**: by reading the cited lines directly, and by a read-only
research agent's report on the same question, which confirmed the mechanism
and added the six facts below.

- **Capacity fill counts pins.** `colorPenalty`'s load-balance block
  (`dayColoring.ts:325–338`) sums strip-hours over every entry of `coloring`,
  so a seeded pin weighs on its day's fill ratio with no further change.
- **The axis hazard.** The ledger's `makeConfig` leaves `dayConfigs` empty,
  so `dayStart(d, config)` falls through to `d × DAY_LENGTH_MINS` = `d × 840`
  (`types.ts:446`), while the app path spaces days at `d × 1440 + clock start`
  (`buildConfig.ts:71–74`). A pin's `start_time` is therefore an absolute
  scheduler-axis minute the **caller** computes as `dayStart(day, config) +
  (clock start − the day's clock start)`. In the app that is `day × 1440 +
  start_time`, the inverse of `runActions.ts:36`, and in an engine test it is
  whatever that test's config makes it. The engine never converts.
- **Pins never enter the loop, so the loop needs no guards.** The agent's
  alternative was to pre-claim only the pool phase and push the pin's DE
  phases onto the ready queue, which would need three guards: the
  predecessor shift at `:738–751`, the defer bump at `:779`, and the
  attempt-1 reset in `handlePhaseFailure` at `:851–866`, each of which would
  otherwise move a pin. Rejected: a deferred DE would put the engine's DE
  start after the `pool_end + ADMIN_GAP` the store's `derive.ts:203` draws,
  so the two would disagree about where the block is. The pre-claim pass
  walks the whole chain at fixed times instead, and the seed skip keeps every
  pinned node out of the loop.
- **Sequencing onto a pin is not enforced.** `applyCrossEventEdges`
  (`:620–671`) makes a team event wait for its individual counterpart and a
  Vet sibling wait for the previous one. A pinned *successor* is committed in
  the pre-pass before its unpinned predecessor is placed, so the engine does
  not hold that predecessor before the pin. This is the same family as the
  unchecked crossover gap (E3) and is recorded in the spec's Out of Scope and
  the engine contract's "not guaranteed" list. `latest_end` on `Competition`
  is the mechanism 014 could use to express it.
- **Two constants are dead and one module is unwired.** `SAME_TIME_WINDOW_MINS`
  and `MAX_RESCHEDULE_ATTEMPTS` are threaded through the config and read by
  no engine code, and `daySequencing.ts`'s `sequenceEventsForDay` is called
  only by its own tests. Pins are not wired into any of them.
- **Two signatures and one spy.** `ScheduleAllResult` is declared at
  `scheduler.ts:13` and again at `concurrentScheduler.ts:81`, so the new
  parameter lands on both entry points. `resources.test.ts:453` spies on
  `findAvailableStripsInWindow` and asserts every call passes a defined
  `day`, so the pre-claim pass passes the pin's day.

**Partial claims rejected**: when a pin's phase finds fewer free strips than
it wants, the agent suggested claiming what is free. Rejected: the pin's
geometry is fixed by the store's `derive.ts` from its `strip_count`, so a
narrower engine claim would describe a block the store does not draw. The
phase claims all or nothing and the store's lane packer reports the
collision.

**Determinism**: the pin order is sorted, the seeded `coloring` is a `Map`
iterated only through `graph`/`compMap` lookups the loop already makes, and
the new parameter defaults to a shared empty array. The ledger and
`appPathParity.test.ts` call `scheduleAll` with two arguments and are not
edited.

**Strip search**: `stripSearch.ts:125` calls `scheduleAll` per candidate. The
search takes the same `pinned` list so the suggested minimum is the smallest
count that places every event *around the pins*, which is the count **Apply**
will be judged by. Without it the card could name a count at which the pinned
board overflows.

**Alternatives rejected**:

- *Re-apply pins over the result* (alignment D1's first answer). Rejected by
  the product owner on the second pass: the engine would pack as if the pins
  did not exist and every collision would be discovered by the packer, not
  avoided.
- *Exclude pinned events from `buildEventStates`* (the roadmap's wording).
  Excluding them drops their cross-event edges and their `ScheduleResult`, so
  a pinned individual event could no longer precede its team event and the
  diagnostics would describe a board missing the pins. Excluding them from the
  loop's **seed** is the exclusion that was meant.
- *Pin on `Competition`* (`pinned_day`, `pinned_start` fields). Rejected:
  every call site that builds competitions would carry two more nullable
  fields, and the ledger's factories would need editing to say "unpinned".

---

## D2 – The canvas is HTML on the mockup's DOM model, with no windowing

**Decision**: `MatrixCanvas.tsx` (1,211 lines of SVG with row and time
windowing) is replaced by an HTML canvas: one natively scrolling container,
a sticky time axis, one group per day with a sticky band, a sticky strip
gutter, and one absolutely positioned `div` per block inside each day's plot.
Every strip row of every day is in the document. `[Mockup]` lines 270–364 are
the model.

**Rationale**: the three recorded canvas defects (backlog §The workbench
canvas is not yet a finished surface) all stem from the SVG viewport owning
its own scroll and zoom. Native scrolling gives scrollbars, wheel and
drag-to-pan for free, sticky positioning gives the frozen axis and gutter for
free, and the DOM at this scale is small: B1 at 80 strips is 320 gutter rows
and `[M]` ~48 blocks (24 events × pools + DE), the largest template is 66
events. `[R]` the design document's virtualization section
(`competition-planner-workbench.md:161`) called windowing load-bearing at
"roughly 7000px tall"; a 7,000px document with 320 rows is ordinary for a
browser. FR-070 records the deviation there.

**Alternatives rejected**: keep the SVG and add scrollbars (keeps `zoom.ts`
and `windowing.ts` and their defects); a canvas element (no DOM to test or to
locate by attribute, and the smoke driver's block locators would all break).

---

## D3 – A six-rung zoom ladder and a fit mode

**Decision**: `[Mockup]` `ZOOM_STEPS` verbatim ([data-model §7](./data-model.md)),
`DEFAULT_ZOOM = 2`, readout as a percentage of rung 2's 3.2 px/min. Fit day
solves `usableWidth / axisSpanMinutes` from a `ResizeObserver` on the plot
and positions blocks in percent of the axis span; row height follows the
rung. Zoom in or out from fit mode steps to the neighbouring rung and clears
the flag. The controls disable at the ladder's ends.

**Why a ladder**: the retired continuous zoom over `[0.05, 8]` minutes per
pixel reached scales at which blocks were narrower than their borders
(backlog §Zooming in destroys the view). A ladder cannot reach a scale it
does not contain, which closes that defect by construction rather than by a
clamp somebody can later loosen.

**Axis span**: earliest `day_start_time` to latest `day_end_time` across the
store's `dayConfigs`, so every day shares one axis and Fit day means the same
width on every day. Clock axis throughout.

---

## D4 – Fill is weapon, phase is hatch and icon

**Decision**: three weapon tokens (`[Mockup]` `WEAPON`, [data-model §8](./data-model.md))
replace the 33 `--cat-*` custom properties. DE blocks carry a 45° hatch of the
weapon's hatch colour and a bracket icon, pool blocks a grid icon. Name text
carries category and gender, sized per block from the room available
(`[Mockup]` lines 1249–1271: `namePx`, `iconPx`, `fits()`), falling back from
full name to short name to category. 004's design decision 9 (fill = category)
is reversed; SC-004 of 004 failed on it (backlog §Block encoding is not
readable at a glance).

**Alternatives rejected**: keep the category fill and add a weapon stripe
(two fills per block, which is what failed); encode weapon by icon only (three
icons are harder to read at 15px rows than three fills).

---

## D5 – Viewer state splits between browser storage and the store

**Decision**: `viewState.ts` keeps `viewMode`, `panel`, `panelDocked`,
`detailCollapsed`, `zoomStep`, `fitting` in `localStorage` with wholesale
validation, as today. Selection (`selectedCompetitionId`) and the jump nonce
live in the store's `UiSlice`, unserialized.

**Rationale**: three components read the selection (canvas ring, detail
strip, Findings panel's jump) and one writes it from a dock chip, so it is
shared state, not a preference. A stored selection that names an event no
longer on the board is meaningless on reload. This departs from alignment
§4.1's list, which put `selected` in browser storage; the difference is
recorded here and in [data-model §1](./data-model.md).

`viewMode` survives alignment §6's deletion list because D6 in §9 kept the
Matrix ⇄ Schedule toggle after §6 was drafted.

---

## D6 – One findings list, one layout home

**Decision**: `derived.ts` gains `selectFindings(state): Finding[]`
([data-model §5](./data-model.md)) and `selectDaySummaries(state)`. To
produce the Unplaced finding the selector needs the lane packer, and
`derived.ts` already imports `eventTimeSegments` from
`src/components/canvas/geometry.ts` against the app's usual direction
(`[R]` `derived.ts:17–24` says so). Both `geometry.ts`'s segment function and
`lanes.ts` move to `src/layout/` – pure modules, no React, no store – so the
store, the canvas and the two new selectors read one copy and the import
direction is store → layout ← components.

**Dismissals**: `dismissFinding` (`[R]` `store.ts:488`) guards on "a current
WARN validation error". It widens to "a current row of `selectFindings` whose
underlying severity is WARN", which covers Warning and Unplaced rows and
keeps Blocking and Note rows undismissable.

**Ids for analysis warnings**: `Bottleneck` has no id (`[R]` `types.ts:354`).
`analysis:${cause}:${competition_id}:${n}` with `n` the ordinal among rows
sharing the first two parts is stable for the same board and distinct per
row. Backlog §`Bottleneck` has no structured field for a second subject
stays open; this feature does not add fields to `Bottleneck`.

**Alternatives rejected**: computing overflow inside the canvas and pushing it
up to the store (a view writing state, which the derived model forbids);
leaving the two modules under `components/canvas/` and importing them from
the store (the precedent exists but every new reader would widen it).

---

## D7 – The per-event record shrinks and the payload is v3

**Decision**: `CompetitionConfig = { fencer_count, flighted }`,
`de_mode_override: DeMode | null` on the tournament slice, the
`globalOverrides` slice deleted, `buildConfig.ts` computing every retired
field ([data-model §4](./data-model.md)). `schemaVersion` becomes 3 and a v2
payload is refused with an error – the product is unreleased and carries no
compatibility (backlog, and 012's spec).

**`buildConfig` as the only bridge** (constitution I): the derivations reuse
`defaultCutForEntry`, the regional and team cut coercions already in the
file, `TYPE_DEFAULTS`, and `DEFAULT_VIDEO_POLICY_BY_CATEGORY`. `[R]` no
default table references `VideoPolicy.FINALS_ONLY`, so the enum member goes
with `CompetitionOverrides.tsx`.

**Parity**: `__tests__/store/appPathParity.test.ts` asserts the app path
matches the ledger per preset. On a default store every derived value equals
what the retired field carried, so that test is the check that the shrink
changed nothing. It is run, not edited.

---

## D8 – The suggested minimum searches without writing

**Decision**: `suggestStrips` (`[R]` `store.ts:240–273`) splits into
`computeSuggestedStrips(): Promise<number | null>` – the same bounded scan
with the same macrotask yield, returning the answer – and `setStrips` on
**Apply**. The Strips panel runs the search when it opens and again,
debounced by 300 ms, when strips, video strips, days, day hours, type, fencer
counts or pool durations change. Each run carries a token, and a result whose
token is stale is discarded, so a fast second search cannot be overwritten by
a slow first one. The reveal-delayed indicator and its copy are kept from
`StripSetup.tsx:59`.

**Cost**: `[M]` 012 measured 13–230 ms per template. A debounce of 300 ms
keeps a held stepper from queueing a run per tick.

---

## D9 – The referees-per-pool factor is already exported

**Correction to the alignment document** (§4.4, backlog §The Advanced panel
re-implements the engine's referees-per-pool factor): `[R]` `pools.ts:166`
exports `resolveRefsPerPool(refPolicy, nPools): { refs_per_pool, refs_needed }`,
and the scheduler and `derive.ts` both call it. The Strips panel reads
`resolveRefsPerPool(TYPE_DEFAULTS[type].ref_policy, 1).refs_per_pool`.
Nothing is exported from `refs.ts`; its `peakPoolRefDemand` branch
(`refs.ts:20–22`) is a second statement of the same rule and is left alone in
this feature.

---

## D10 – The dock's need is a derived block with no placement

**Decision**: `estimateEventFootprint(competition, config)` in `derive.ts`
builds a synthetic placement – day 0, the day's start, strip count =
`computePoolStructure(...).n_pools` – calls `deriveEventSchedule`, and returns
`{ strips: pool_strip_count, poolMinutes: pool_end − pool_start, deMinutes:
de_total_end − de_start }`. The dock's chip and the canvas's block therefore
come from one function. No new arithmetic.

**Alternative rejected**: `estimateCompetitionStripHours` (`capacity.ts:93`)
returns strip-hours, a different quantity from the strips-and-minutes the chip
shows, and would put a second duration model beside `derive.ts`.

---

## D11 – Print is a stylesheet, not a second renderer

**Decision**: `@media print` rules in `index.css` hide the header, dock, rail,
panel, detail strip and footer, un-clip the center, and give each day section
`break-after: page`. The Schedule view gains a **Print** button that calls the
browser's print. The view itself is restyled after USA Fencing's published
schedules: one section per day with a day heading, events in start order,
the existing columns minus the Day column.

**Alternatives rejected**: a PDF library (a dependency for a one-page-per-day
table the browser already prints); a separate print route (a second component
tree reading the same model).

---

## D12 – One picker, two groups, one behaviour

**Decision**: the header's picker is a select with two groups, "Tournaments"
(B1–B8, `SCENARIOS[id].label`) and "Templates – invented figures" (the ten
`TEMPLATES` keys). Choosing either applies it and runs Auto-assign, so the
two groups behave alike. `loadedPresetId` widens to `ScenarioId | TemplateName`
and `applyTemplate` records it. A template does not set the tournament type
(clarification 2026-09-07).

`[R]` `src/components/ui/select.tsx` exports no `SelectGroup` or
`SelectLabel`; the shadcn select wrapper is extended with the two Radix parts
in the task that builds the picker.

---

## D13 – Deletions happen in the task that builds the replacement

**Decision**: no task deletes a surface without shipping its replacement in
the same commit, and no test file is triaged – each is re-targeted at what
replaces it. The map:

| Retired test | Re-targets to |
|---|---|
| `components/workbench/WorkbenchShell.test.tsx` | the new shell: six regions, one header |
| `components/workbench/boot.test.tsx` | unchanged in intent, re-pointed at the new header and dock |
| `components/workbench/RailPanel.test.tsx` | `ToolRail.test.tsx` and `InspectorPanel.test.tsx` |
| `components/workbench/Scorecard.test.tsx` | `StatusFooter.test.tsx` (counts, three metrics, legend, toggle) |
| `components/workbench/AdvancedPanel.test.tsx`, `SettingsPanel.test.tsx` | `panels/StripsPanel.test.tsx` (refs per pool, video default) and `panels/SettingsPanel.test.tsx` (DE mode, pool durations) |
| `components/workbench/UnplacedTray.test.tsx` | `UnplacedDock.test.tsx` |
| `components/workbench/viewTogglePersistence.test.tsx` | the footer toggle, same assertion |
| `components/workbench/invalidState.test.tsx`, `recompute.test.tsx` | kept, re-pointed at the new center |
| `components/analysisOutput.test.tsx` | `panels/FindingsPanel.test.tsx` |
| `components/configEditing.test.tsx` | `panels/TournamentPanel.test.tsx` and `panels/EventsPanel.test.tsx` |
| `components/saveLoadShare.test.tsx` | `ExportPopover.test.tsx` and `store/exportActions.test.ts` |
| `components/scheduleOutput.test.tsx` | kept, gains the day sections and print assertions |
| `components/sections/CompetitionOverrides.test.tsx` | deleted with the fields; `store/buildConfig.test.ts` gains the derivations |
| `components/sections/StripSetup.test.tsx` | `panels/StripsPanel.test.tsx` |
| `components/sections/PoolDurationSettings.test.tsx` | kept |
| `components/canvas/EventBlock.test.tsx`, `palette.test.ts`, `MatrixCanvas.test.tsx`, `CanvasTooltip.test.tsx` | `canvas/Block.test.tsx`, `weaponTokens.test.ts`, `Canvas.test.tsx`, tooltip kept |
| `components/canvas/zoom.test.ts`, `windowing.test.ts` | `canvas/zoomLadder.test.ts`; windowing has no successor |
| `components/canvas/geometry.test.ts`, `lanes.test.ts` | move to `layout/` |
| `components/canvas/viewEquivalence.test.tsx` | kept, re-pointed at the new block attributes |
| `store/scorecardBaseline.test.ts`, `globalOverrides.test.ts`, `settingsSerialization.test.ts` | deleted with their subjects; serialization v3 cases go to `store/serialization.test.ts` |
| `store/scorecardMetrics.test.ts` | `store/daySummaries.test.ts` and the footer's three metrics |
| `store/viewState.test.ts` | rewritten for the new shape |
| `store/dismissals.test.ts` | kept, gains the derived-finding cases |

New without a predecessor: `engine/pinnedScheduling.test.ts`,
`engine/footprint.test.ts`, `store/findings.test.ts`,
`components/workbench/DetailStrip.test.tsx`, `components/ErrorBoundary.test.tsx`.

---

## D14 – The smoke driver is re-pointed, never rewritten

Every locator in `scripts/smoke.mjs` that names a retired control, with the
task that moves it. The driver's structure, its boot-count floor, its four
`pressSuggest` calls and its share round-trip stay.

| Driver locator today | Becomes | Moves in |
|---|---|---|
| `button` "Save / Share", `Generate Link`, `input[readonly]` | `button` "Export", then the same two | US1 header |
| `region` "Scorecard", `button` "Scorecard details", `combobox` "Day count" (in the drawer) | footer `data-counts` and `data-metric`; the day count reads the header summary | US1 footer |
| `[data-event-block][data-highlighted="true"]` and the hover step | deleted with D7 – the step goes | US1 footer |
| `spinbutton` "Strip count" (top bar) | `spinbutton` "Number of strips" in the Strips panel | US2 Strips |
| `button` "Presets…" and the template toggles | the header picker's Templates group | US1 header |
| `pressSuggest`: `button` "Suggest" then read "Number of strips" | open Strips panel, wait for `data-suggested-strips`, press "Apply", read the stepper | US2 Strips |
| `button` "Auto-schedule all" | `button` "Auto-assign" | US1 header |
| `button` "Fit to day" and the toolbar | footer `button` "Fit day" | US3 canvas |
| `radio` "Matrix" / "Schedule" | kept, now in the footer | US1 footer |
| `spinbutton` /Fencer count for/ | kept, now on a pressed chip in the Events panel | US2 Events |
| `button` "Settings", `region` "Settings", `spinbutton` "Admin gap", "Revert Admin gap to default" | the Admin gap steps are deleted with `GlobalOverrides`; the Settings steps re-target to `radiogroup` "DE mode" and the pool durations | US2 Settings |
| `region` "Unplaced events", `[data-schedule-row]`, `data-tooltip-field`, `data-hour-tick`, `data-day-group`, `data-strip-row` | kept | – |

**One count is expected to change**: NAC Youth's suggestion in the driver's
accumulated state read 63 because the Admin gap override step changed the
search's config (backlog §NAC Youth suggests 63 in the smoke driver's
accumulated state and 66 from a fresh store). With that step gone it should
read 66. The task that deletes the step records the observed value.

---

## D15 – An error boundary, and a minimum on the input

**Decision**: a class component `ErrorBoundary` (React still has no hook
for error boundaries) wraps `WorkbenchShell` in `App.tsx`, rendering a
message and a reload control. `erasableSyntaxOnly` is satisfied: no parameter
properties, state initialised as a field. The Events panel's fencer input
carries `min={MIN_FENCERS}` and refuses smaller values, which closes backlog
§A fencer count of 0 or 1 unmounts the whole app at the input, with the
boundary as the backstop for any other route.

---

## D16 – Worktree flow, dispatch, and where the human looks

**Decision**: worktree flow (§9). A fresh worktree per session, named for the
branch. Subagents commit at the checkpoints `tasks.md` marks. The orchestrator
writes no code beyond 1–5 line edits.

Model per story: Sonnet for the panels, the dock, the footer, the Export
move, the store shrink, the serialization bump, the test re-targeting and the
smoke re-pointing; Opus for the engine story (D1), the canvas rewrite (D2–D4),
the unified findings selector (D6), and the ledger diff review. Live smoke
repair is dispatched regardless of model.

The product owner's screenshot judgment is at the end of story 1, at 80
strips on B1, before story 3 rewrites the canvas (alignment §8). A "no" halts
story 3.

---

## D17 – The last run is one record

**Decision**: `lastAutoRun: { at, placed, unplaced } | null` on `UiSlice`,
written by `runScheduleAll`, which returns the same counts. `placed` is the
number of events the run placed (pins excluded), `unplaced` the number it
left without a pool start. The header reads `at` as a clock time
(`formatMinutes` of the local time), the dock note reads the two counts.

---

## D18 – The center keeps its two rules

**Decision**: `CenterView` survives as the host of the committed model. It
loses the toggle (to the footer, D5), the hover highlight and the metrics
subscription (D7), and keeps the settle timer and the dimmed-invalid overlay
(`[R]` `CenterView.tsx:58–91`). The new canvas and the restyled Schedule view
are handed the same committed `DerivedSchedule`, so the view-equivalence
contract holds as it does today.
