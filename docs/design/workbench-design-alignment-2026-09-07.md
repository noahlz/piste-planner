# Workbench design alignment — 2026-09-07

**Status**: analysis, written before the spec for the next feature. Nothing
here changes code. Every claim was verified against `main` at `470a8c95a8`.

**Source design**: Claude Design project *Piste Planner Workbench*,
`Piste Planner Workbench.dc.html`
(<https://claude.ai/design/p/f4e0ca5c-b7ea-4d4a-a215-6341ad1179d4?file=Piste+Planner+Workbench.dc.html>).
The project also holds `Piste Planner Current.dc.html`, a tracing of the app
as it is today, and four reference screenshots.

**Direction from the product owner**: the design takes precedence over the
current UI. Where the design and the code disagree, this document says which
side moves and what has to be cleaned up first. It supersedes
[reassessment-2026-09-01.md §6–§7](./reassessment-2026-09-01.md) as the scope
of "009 simple workbench": that scope was never specced, 010–012 shipped ahead
of it, and the design now defines the target it only sketched.

---

## 1. The design in one paragraph

One screen, six regions. A 44px **header** with the brand, one preset picker,
a read-only summary (`NAC · 4 days · 15 strips`, `last run 2 min ago`), an
**Auto-assign** button and an **Export** icon. An **unplaced dock** under it,
holding one draggable chip per event with no slot (`Vet 40 Women's Foil
Individual · 3 strips · 3:45`), or a "Every event has a slot" note. A narrow
**tool rail** on the left with five icon buttons – Tournament, Strips, Events,
Findings (badge = count), Settings – each opening one **inspector panel** that
floats over the grid or docks beside it. The **canvas**: a sticky time axis,
one group per day with a sticky band (`DAY 1 · Thu 12 Feb · 8 events ·
finishes 20:30 · 13 of 15 strips at peak · 2 findings`), a sticky strip
gutter, and one block per event *phase* (pools, DE), coloured by weapon,
hatched for DE, with a pool-grid or bracket icon, a pin badge, a dashed
"unplaced" cue, and a selection ring. A **detail strip** slides up under the
canvas when a block is selected: name, day, strips, fencers, phase pills with
times, and Pin / Move day / Flight buttons. A 32px **footer** with the zoom
ladder, Fit day, `N placed · N unplaced · N pinned`, Finish, Peak referees,
Strip use, and a weapon legend. Blocks drag with a ghost that snaps to five
minutes and refuses to cross the other phase of the same event. Findings jump
to their block.

The design ships its own logic in the page script: a first-fit `reflowDay`,
a `findSlot` auto-assign, `dayStats`, and `buildFindings`. Those are
**prototype stand-ins for the engine and the derived selectors**, not
behaviour to port. §5 says which of them the store already provides and which
the engine cannot yet.

---

## 2. What carries over unchanged

The design is a new surface over a model that already exists. None of this
moves:

| Kept as is | Where | Why it fits the design |
|---|---|---|
| Placements as intent, schedule derived on read | `src/store/store.ts` `PlacementsSlice`, `src/engine/derive.ts` | The design's blocks are placements plus engine durations, exactly this model |
| Derived selectors: schedule, findings, ref requirements, scorecard metrics | `src/store/derived.ts` | Footer, day bands and the Findings panel are all reads over these |
| `buildTournamentConfig` and the per-type defaults | `src/store/buildConfig.ts`, `typeDefaults.ts` | The design's "Referees per pool: 2 · default for all events" is `TYPE_DEFAULTS` read back |
| Presets B1–B8 and `applyPreset` | `src/data/tournaments.ts`, `src/store/presets.ts` | The picker's `Feb 2026 NAC — Div1/Junior` is B1's label |
| `runScheduleAll` | `src/store/runActions.ts` | Auto-assign's engine call (semantics differ, §4.2) |
| The strip search | `src/engine/stripSearch.ts`, `suggestStrips` | The "Suggested minimum" card, minus the write (§4.4) |
| Share-URL serialization | `src/store/serialization.ts` | Export's payload |
| Time segments and first-fit lanes | `src/components/canvas/geometry.ts` `eventTimeSegments`, `lanes.ts` | The design's `segmentsOfEvent` and `reflowDay` are these two functions, minus a fixed-lane rule |
| `competitionLabel` and the catalogue | `src/components/competitionLabels.ts`, `src/engine/catalogue.ts` | Block names, chip labels |
| The two-tier recompute and the dimmed-invalid rule | `CenterView.tsx` | The design does not draw an invalid state, and design decision 2 still holds – carry the rule into the new center |
| Everything under `src/engine/` | – | No engine change is needed for the design's static surfaces. §5 lists where its *interactions* outrun the engine |

---

## 3. The design's own inconsistencies

These have to be settled in the spec, because the design cannot be built as
drawn.

| # | What the design shows | Why it cannot ship as drawn | Resolution |
|---|---|---|---|
| I1 | **Video strips in two panels** – a "With video" stepper in Strips *and* "Video strips · 8 reserved for finals" in Settings | Two homes for one setting is the duplication 009 exists to remove ([reassessment §6.1](./reassessment-2026-09-01.md)) | One home: the Strips panel stepper. Settings drops the line |
| I2 | **Pool durations by pool size** – "Pool of 5 · 50 min, Pool of 6 · 60 min, Pool of 7 · 75 min" | The engine's table is per **weapon** (`pool_round_duration_table: Record<Weapon, number>`), and pool sizes are folded in by `weightedPoolDuration`. Feature 002 chose that axis | Rows become Foil / Epee / Saber. The per-size axis is future engine work and stays in the backlog under "Youth-event pool duration calibration" |
| I3 | **"18 strips to finish every day by 18:00 · Apply"** | The search returns the smallest count that *places every event* (012 FR-001). No finish-time criterion exists, and the day ends at 22:00 by default | Copy becomes "strips to place every event". A finish-time search is not in scope |
| I4 | **No fencer-count editing anywhere.** The Events panel is chips, the detail strip shows `186 fencers` as text | Fencer count is the one per-event input every schedule depends on. Today it is `FencerCounts`, which the design deletes with the rail | The Events panel must carry the count: a selected chip exposes it (chip with count, click to edit). This is the one addition the design needs |
| I5 | **Type pills omit SJCC** | `TournamentType` has six members and `TYPE_DEFAULTS` has a row for SJCC. B5 is an SJCC preset | Add the pill, or delete SJCC from the engine. Recommendation: add the pill – B5 loads it |
| I6 | **Days pills 2 · 3 · 4** | Validation accepts 1–14 and warns outside 2–4 (P2 widened it). A shared URL can carry 5 | Keep the three pills. A value outside them renders as a fourth, non-clickable pill with the notice. Do not offer 1–14 |
| I7 | **Resize handles on the selected block** (`cursor:ew-resize`) with no handler | Horizontal resize would set a duration, and durations are engine output, never stored (design decision, `derive.ts` header) | Drop the handles |
| I8 | **Two clock formats** – `clock12` in the tooltip and ghost, `hhmm` everywhere else | The app has one formatter, `formatMinutes` (24h `H:MM`) | 24h everywhere, via `formatMinutes` |
| I9 | **Auto-assign pins what it places**, and the dock says a dropped chip "drops pinned" | In the store, `auto` placements are unpinned by construction (`setPlacementsFromAuto`) and only manual edits pin. Pinning auto output would make every later Auto-assign a no-op | Auto output stays unpinned. Only a hand drop or the Pin button pins |
| I10 | **Mock figures**: `26 of 96`, `15 strips`, `28 referees entered`, `last run 2 min ago` | The catalogue has 120 entries, presets run 40–80 strips, no referee count exists in the store, no run timestamp exists | All derived. §4 names the new fields |
| I11 | **The Findings panel lists three kinds** – Unplaced, late finish, referee peak – and nothing else | The store produces structural, policy and notice findings from `validateConfig` plus the analysis warnings. None of the design's three exists today | The panel renders the existing findings *and* the two new derived rules (§4.5). The referee-peak finding is dropped (D8). Severity badges map ERROR → "Blocking", WARN → "Warning", INFO → "Note", plus "Unplaced" for overflow |
| I12 | **The design system is not the one linked** – the page links the *Industry* stylesheet (Barlow, blueprint corners) and then overrides everything with Figtree, 9–12px radii and pill chips | The workbench's own look is the design. The Industry tokens are unused except the steel accent `#5980a6` | Tokens for the app come from the workbench page's palette, not `_ds/…/styles.css` |

---

## 4. Alignment by surface

Each row: what the design has, what the code has, what moves.

### 4.1 Shell

| Design | Current | What moves |
|---|---|---|
| One 44px header | Two dark bars: `App.tsx`'s title bar with the "Work in Progress!" badge, then `TopBar` | Both deleted. One header component |
| Icon rail + one inspector panel (floating or docked, 324px) | 320px rail of five collapsible `RailPanel`s over the re-homed section components plus `AdvancedPanel` | Rail, `RailPanel`, `TournamentSetup`, `StripSetup`, `CompetitionMatrix`, `FencerCounts`, `CompetitionOverrides`, `AdvancedPanel` deleted. Five new panels |
| Footer status bar + detail strip | Resizable bottom `Drawer` holding `Scorecard` and `AnalysisOutput` | Drawer, Scorecard, AnalysisOutput deleted. `viewState.drawerHeight` and `scorecardExpanded` go with them |
| No Matrix ⇄ Schedule toggle, no canvas toolbar | `CenterView` toggle, `ScheduleOutput` table, the canvas's seven-button toolbar | The toolbar goes. **The toggle stays** (D6, decided against the mockup): the Schedule view is restyled after the schedules USA Fencing publishes, grouped by day, and gets a print mode so it can be printed to PDF. Its home is the footer, beside Fit day |
| Panel floats over the grid by default, docks on request | – | New view state: `panel`, `panelDocked`, `detailCollapsed`, `selected`. Viewer state, `localStorage`, never the URL (research D10 still applies) |

### 4.2 Header

| Design | Current | What moves |
|---|---|---|
| One preset picker | Two preset systems: `TopBar`'s B1–B8 picker and the rail's ten `TEMPLATES` toggles | One picker with two groups: *Tournaments* (B1–B8) and *Templates* (the ten). `applyTemplate` stays but goes through `applyPreset`'s shape so both paths record `loadedPresetId`. Template numbers are invented (backlog §Templates are invented numbers) – the group heading says so |
| Read-only `NAC · 4 days · 15 strips` | Editable type / days / strips selects in the top bar, duplicating the rail | The header states, the panels edit. Resolves FR-003/FR-004 duplication |
| `last run 2 min ago` | Nothing records when the scheduler ran | New `lastAutoRunAt: number | null` in `UiSlice`, set by `runScheduleAll`, not serialized. Rendered as a clock time, not a relative age |
| **Auto-assign** | **Auto-schedule all**: overwrites every placement, disabled on any ERROR finding | Label changes. Semantics are decision D1. The ERROR disable stays – it is design decision 6 (structural preconditions block) |
| **Export** icon | **Save / Share** popover: JSON save, JSON load, share URL, copy | Export popover keeps all three plus the "dropped placements" warning. The inline browser plumbing moves to `src/store/exportActions.ts` (backlog §Save / load / share browser plumbing – this is the moment it named) |

### 4.3 Unplaced dock

| Design | Current | What moves |
|---|---|---|
| Chip per event: name, `3 strips · 3:45` need, weapon colour, draggable | `UnplacedTray`: id-sorted labels, no need, no colour, no drag | The need is a new pure engine helper, `estimateEventFootprint(competition, config)` → strips, pool minutes, DE minutes, reusing `derive.ts`'s arithmetic without a placement. Drag is manual placement (§6) |
| "Every event has a slot." or "Placed 3 events and pinned them." | "Every event is placed." | `runScheduleAll` returns `{ placed, unplaced }` instead of `void`, and the note reads from it |
| Dock also counts *overflow* segments – blocks the lane packer could not fit | `lanes.ts` marks `overflow: true` and draws the block at strip 0, over whatever is there, with no cue | Overflow becomes a finding (§4.5) and a dashed block. The footer's "unplaced" count is `no placement + overflow`, as the design's `placementCounts` computes it |

### 4.4 Inspector panels

**Tournament** – type pills, days pills, per-day start/end.

- Type: pills over `setTournamentType`. Add SJCC (I5). The helper text under the pills is `TournamentSetup`'s existing sentence.
- Days: pills over `setDays` (I6). `setDays` rebuilds `dayConfigs` at 8:00–22:00, losing edited hours – acceptable, and already the behaviour.
- Day hours: the design's `8:00 AM ▾ – 9:30 PM ▾` are `updateDayConfig` over `TIME_OPTIONS`. Rendered 24h (I8).

**Strips & referees** – strips stepper, video stepper, suggested-minimum card, referees per pool.

- Strips and video: `setStrips`, `setVideoStrips`. The video field's `null` (follow the type) needs a way back: keep the `Default` marker and revert `AdvancedPanel` had, on the stepper itself. Otherwise the `null` semantics and `resolveVideoStrips` are dead weight and should go.
- Suggested minimum: today `suggestStrips` *writes* `strips_total` when the search finishes (012 FR-010). The card needs the number without the write. Split into `computeSuggestedStrips(): Promise<number | null>` (search only, yields to the browser as now) and the existing write on **Apply**. The search runs when the panel opens and re-runs when inputs change – it costs 13–230ms per template (012 §2), so it needs the reveal-delayed indicator `StripSetup` already has and a debounce.
- "Referees per pool: 2 · default for all events": `TYPE_DEFAULTS[type].ref_policy` resolved to a number. The factor lives in `src/engine/refs.ts` as a branch, not an export – export it (backlog §The Advanced panel re-implements the engine's referees-per-pool factor). The per-event referee override UI is gone with `AdvancedPanel` (D4).
- **No referees-available input** (D8). Referees are an *output*: the panel and the footer state the peak needed, and nothing is entered to compare it against. The design's `REFS_ENTERED = 28` and its referee finding are dropped.

**Events** – `Selected N of 120`, one card per gender × weapon, category chips.

- Chips are catalogue entries for that gender × weapon: individual categories, then the six veteran bands, then team categories suffixed "Team". Twenty per group. `addCompetition` / `removeCompetition` per chip.
- A selected chip shows its fencer count and edits it in place (I4). `min={MIN_FENCERS}` – closes the backlog crash (§A fencer count of 0 or 1 unmounts the whole app) at the input, and the shell gets an `ErrorBoundary` as the backstop.
- Per-event cut, DE mode, video policy and referee policy have no control in the design (D4).

**Findings** – see §4.5.

**Settings** – pool durations, DE mode.

- Pool durations: per weapon (I2), the `PoolDurationSettings` default / override / reset pattern kept.
- DE mode `Staged | Single`: today per-event `de_mode` with `'AUTO'` following the type. The design makes it tournament-level. New `de_mode_override: DeMode | null` on the tournament slice, resolved in `buildConfig` ahead of the type default. Per-event `de_mode` goes (D4).
- Admin gap and flight buffer rows: gone, as reassessment §7.5 recommended. Decision D5 covers whether `GlobalOverrides` survives at all.
- Video strips line: gone (I1).

### 4.5 Findings

The design's Findings panel and the rail badge need every finding to carry
four things the current surfaces do not consistently have: a stable id, a
severity, a **day**, and a **target** (a competition to select and scroll to).

| Source today | Id | Day | Target | Gap |
|---|---|---|---|---|
| `validateConfig` → `ValidationError` | `findingIdentity()` | none | `subjects[0]` when it is a competition | Day is derivable from that competition's placement |
| `initialAnalysis` → `Bottleneck` | none | in message text only | `competition_id`, often `''` | No id, no structured day, no second subject (backlog §`Bottleneck` has no structured field for a second subject) |
| Flighting `suggestions: string[]` with Accept/Reject | none | – | – | Deleted (reassessment §7.4, and Flight becomes user intent in §4.7) |

Two findings the design adds, both derived, neither engine-side:

1. **Unplaced** – one per overflow segment from `lanes.ts`, severity WARN,
   target the event, message naming the strips it needs.
2. **Late finish** – per day, when `latestFinish(day)` lands inside a
   45-minute window before `dayConfigs[day].day_end_time`, target the event
   that finishes last.

The design's third, "referee peak exceeds entered", is dropped (D8): there
is no entered count to compare against. The footer's Peak referees stays as
an output, and the backlog's referee-model divergence (§The scorecard's
peak-referee row reads higher than the scheduler's own) stays open.

The panel renders every finding with severity, `where`, message, and "Show on
grid" only when a target exists. Jump = select + scroll the block into view +
flash. Dismissals (`dismissedFindings`) stay and hide WARN rows.

### 4.6 Canvas

| Design | Current | What moves |
|---|---|---|
| Native scrolling container, sticky time axis, sticky day bands, sticky gutter | `overflow-hidden` viewport with `timeScroll` / `rowScroll` as view state, no scrollbars, no drag-to-pan (backlog §No affordance that the canvas can be scrolled) | Rewritten on the design's DOM model. Scroll position is the browser's |
| Six-rung zoom ladder `{ppm, row}` plus a Fit-day mode that solves the scale from the measured width and uses percentage geometry | Continuous cursor-anchored zoom over `[0.05, 8]` minutes/px, three row-height steps, seven toolbar buttons, and a zoom that flattens the view after ~6 clicks (backlog §Zooming in destroys the view) | `zoom.ts` and `windowing.ts` retire. `viewState` keeps `zoomStep: number` and `fitting: boolean`. The flattening defect is closed by construction – a bounded ladder cannot reach the scale that broke |
| Detail tier follows the ladder: overview / medium / detail decide labels, ticks, merged pool+DE blocks | `blockChannels()` degrades label → weapon mark → gender prefix by width | Replaced by the design's per-block sizing (`namePx`, `iconPx`, `fits()`) |
| Every row rendered, grid as CSS gradients, ~24–66 events | Row and time windowing (`windowing.ts`) so only the visible slice mounts – the design doc called this load-bearing for 80 strips × 4 days | 320 gutter labels and ≤ ~200 block elements is inside what the DOM handles without windowing. Deliberate deviation from [competition-planner-workbench.md §Virtualization](./competition-planner-workbench.md), to be recorded there when the spec lands |
| **Fill = weapon** (3 hues), phase = pool-grid or bracket icon plus DE hatch, camera icon for DE on video strips, name text carries category and gender | Fill = category (16 tokens, 4 hue families), phase = edge bar + hatch, weapon = letter chip, gender = label prefix. Failed SC-004 (backlog §Block encoding is not readable at a glance) | Design decision 9 is reversed. `palette.ts`, the 33 `--cat-*` tokens in `index.css`, `EventBlock`, `blockLabels.ts` and their tests are rewritten. Three weapon tokens with fill / ink / edge / hatch each |
| One block per phase, each phase on its **own** strip run (`poolsStrip`, `deStrip`) | One `BlockPlacement` per segment, lanes chosen by first-fit per segment – already per-phase on screen | Matches, and stays as it is. **Strip numbers are planning aids, not intent** (D2): they will not correspond to the strips assigned at the competition, so nothing stores them and the packer may re-choose lanes on every render. A drag in 014 sets day and time; the row it lands on is cosmetic |
| Pinned badge, dashed-overflow cue, flagged strip rows in the gutter, selection ring | `data-highlighted` ring driven by scorecard hover | Pin reads `placement.pinned`. Overflow reads `lanes.ts`. Flagged rows come from findings with a target on that day. Selection is new view state. The scorecard hover highlight goes (D7) |
| Day band summary: events, finish, `N of S strips at peak`, findings chip | Day band shows `Day N` only | New per-day selector in `derived.ts`: event count, finish (exists as `finish:day:N`), peak concurrent strips (a sweep over `scorecardBlocks`, the same shape `refs.ts`'s `sweepLine` uses), unplaced count, findings count. Dates (`Thu 12 Feb`) need a tournament start date the store does not have – render `Day 1` without a date unless D9 adds one |
| Tooltip: name + `Pools 8:00` | Radix tooltip with name, weapon, category, gender, day, phase, start, end, duration, strips, findings | Keep the Radix anchor and the richer fields – the smoke driver asserts on `data-tooltip-field` and nothing in the design argues for less information on hover |
| Video strips: `ON_VIDEO` set decides the camera icon | `Strip.video_capable` exists per strip and the engine's `strip_allocations` know which strips a DE took, but `runActions` discards them | Camera icon dropped. With strips not stored (D2) there is no per-event video fact to draw. The video strip *count* still reaches the engine through `buildStrips` |

### 4.7 Detail strip

| Design | Current | What moves |
|---|---|---|
| Appears on selection, collapses to one line, dismisses | No selection exists. `MatrixCanvas` takes a `selection` prop nothing sets, so "Zoom to selection" has been permanently disabled since T037 | `selected: string | null` view state. The canvas's `selection` prop and `zoomToSelection` go with the toolbar |
| **Pin / Pinned** | `setPinned` exists | Wired. Honouring it is D1 |
| **Move day** | `updatePlacement(id, { day })` exists, marks manual + pinned | Wired as a day picker. Same-day start time is kept, which can push the event past the new day's end – the late-finish and overflow findings say so |
| **Flight** ("Split into flights") | The store cannot represent a flighted event. `flighted` reaches the engine only through accepted flighting suggestions, and `derive.ts` already splits pools into Flight A / B when `competition.flighted` is set with no group | New `flighted: boolean` on `CompetitionConfig`, set by the button, serialized. `buildConfig` passes it through. `flightingSuggestionStates`, `acceptFlightingSuggestion`, `rejectFlightingSuggestion` and the `flightingSuggestions` parameter threaded through every selector are deleted. This closes the "flighting as user intent or removal" question the roadmap parked at P4: it is user intent |
| `Day 1 · Strips 1–5 · 186 fencers` | – | Reads. Strips come from the lane the packer chose this render (D2: planning aid, not intent) |
| Phase pills with times | – | `eventTimeSegments` |

### 4.8 Footer

| Design | Current | What moves |
|---|---|---|
| Zoom out / in / readout / reset / Fit day | Canvas toolbar | Moves here |
| `N placed · N unplaced · N pinned` | – | Counts over `placements` and the overflow set |
| Finish, Peak referees, Strip use | `finish:tournament`, `refs:peak-total`, `strips:utilization` in `selectScorecardMetrics` | Read as is |
| Weapon legend | – | Static, from the three weapon tokens |
| No deltas, no hover highlight | Every metric shows a delta against the frozen preset baseline (research D9) and lights its blocks on hover (FR-029) | Decision D7 |
| Not shown: per-day finish, sabre peak, day-balance spread, finding counts by severity | Expanded scorecard rows | Per-day finish moves to the day bands. Finding counts move to the rail badge. Sabre peak and balance spread have no home in the design and are deleted with `Scorecard` |

---

## 5. Engine wiring the design assumes and the engine does not have

The page script's own logic marks exactly where the design outruns the engine.
Each row is engine work under constitution III, with its own drift review, and
none of it is needed to build the static surfaces.

| # | The design does | The engine does | Backlog / roadmap home |
|---|---|---|---|
| E1 | Auto-assign places only the dock's events, one at a time against the board as it stands, and leaves everything already placed where it is | `scheduleAll` starts from an empty `GlobalState` and colours every vertex – it cannot be told "these are fixed" | Roadmap P4 "Auto-fill unplaced": pre-seeded strip intervals, pre-coloured days, exclusion from `buildEventStates` ([competition-planner-workbench.md](./competition-planner-workbench.md) §Roadmap) |
| E2 | A DE can be dragged to a different strip run and start than its pools, subject to "pools end before DE starts" | `Placement` has one `start_time` and one `strip_count`. DE start is `pool_end + ADMIN_GAP_MINS`, always | P4 "unpack to blocks". Needs `Placement` to carry per-phase start and strips, and `derive.ts` to honour a DE start override |
| E3 | A hand-dropped event is checked, and warned about, only for strips, late finish and referees | Auto placement enforces the crossover constraint graph. Hand placement bypasses it entirely | Backlog §Hand-placed events are never checked against the crossover constraint graph. Needed the moment drag ships, because the design's drag makes the gap live |
| E4 | A late finish is a warning: "DE finishes at 20:55, 35 minutes before the venue closes" | An overrun past `dayHardEnd` is `SAME_DAY_VIOLATION` at ERROR and two failed attempts drop the event | Backlog §Day-end overrun is a hard failure the methodology calls a warning. The derived late-finish finding (§4.5) works on hand placements now, but auto placement will keep dropping the events the design would warn about |
| E5 | "Peak demand of 32 referees … exceeds the 28 entered" | Two referee models that disagree on saturated days | Backlog §The scorecard's peak-referee row reads higher than the scheduler's own |
| E6 | Suggested minimum "to finish every day by 18:00" | Search criterion is placement, not finish time | Not scheduled. Copy changes (I3) |
| E7 | Pool durations by pool size | Per weapon | Backlog §Youth-event pool duration calibration |
| E8 | Adding one strip never loses an event | Greedy list scheduling is non-monotone in strip count on four of ten templates | [strip-count-scheduling-anomaly.md](./strip-count-scheduling-anomaly.md). The stepper's `+` can drop an event and the design gives no cue. The overflow / unplaced findings are the cue |

---

## 6. What the design retires

Delete, with their tests re-targeted at what replaces them rather than triaged
(the 007/009 directive, backlog §Rail rebuild).

**Components**: `App.tsx` header, `TopBar`, `Rail`, `RailPanel`,
`TournamentSetup`, `StripSetup`, `CompetitionMatrix`, `FencerCounts`,
`CompetitionOverrides`, `AdvancedPanel`, `SettingsPanel`, `Drawer`,
`Scorecard`, `AnalysisOutput`, `CenterView`'s toggle, `SaveLoadShare` (its
handlers move to the store), `MatrixCanvas` and `windowing.ts`, `zoom.ts`,
`EventBlock`, `blockLabels.ts`, `palette.ts` (all rewritten), `DefaultLabel`
where no default marker survives, `deModeLabels.ts`. `ScheduleOutput` stays
and is restyled as the published schedule with a print mode (D6).

**Store**: `flightingSuggestionStates` and both actions (§4.7),
`scorecardBaseline` and `hoveredMetricId` (D7), `viewState`'s `viewMode`,
`rowHeightStep`, `timeZoom`, `timeScroll`, `rowScroll`, `drawerHeight`,
`scorecardExpanded`. `GlobalOverrides` is D5. Per-event `ref_policy`,
`cut_mode`, `cut_value`, `de_mode`, `de_video_policy`,
`use_single_pool_override` are D4.

**Engine enum**: `VideoPolicy.FINALS_ONLY` – referenced only by `types.ts`
and the deleted `CompetitionOverrides` (reassessment §5.9, no back-compat rule).

**Tokens**: the 33 `--cat-*` custom properties in `index.css`.

**Smoke driver**: `scripts/smoke.mjs` locates the scorecard details button,
the `Strip count` spinbutton, `[data-schedule-row]`, the Admin gap field, the
share URL's readonly input, `Number of strips` / `Number of video strips`,
`data-highlighted`, and the canvas toolbar by name. Every one of those is
re-pointed in the task that reshapes its control (constitution VI), never
rewritten. Its three pressSuggest steps survive with a new button.

**Tests**: 19 files under `__tests__/components/` name a deleted component or
the SVG canvas's attributes. `__tests__/store/` loses `scorecardBaseline`,
`scorecardMetrics` (partly), `globalOverrides`, `settingsSerialization`,
`viewState` (rewritten), and gains selection, day stats, the two findings,
`flighted`, `de_mode_override`.

---

## 7. Decisions for the spec

Answered by the product owner on 2026-09-07 – the answers are in §9. The
options and recommendations below are kept as written, for the record of what
was weighed. Where the answer departs from the recommendation (D2, D6, D8),
§9 is the rule and the surface sections above have been corrected to match.

**D1 – What Auto-assign does to pinned events.** The design's semantics are
E1 and need engine work. Options: (a) Auto-assign = today's Auto-schedule all,
overwriting every placement including pinned ones, and the Pin button ships
disabled until E1 lands. (b) Auto-schedule all, then re-apply every pinned
placement over the result and let the overflow and crossover findings report
the collisions the engine did not know about. (c) E1 first.
**Recommendation: (b)** for the redesign feature, (c) as the manual-placement
feature's engine task. Pinned events stay where the organizer put them, the
engine packs around nothing, and the findings say what collided. The spec
must state this limitation in the Pin button's tooltip.

**D2 – Whether strips are stored.** Today the canvas re-chooses lanes on
every render and the engine's own `strip_allocations` are thrown away in
`runActions.ts`, so the app has two allocators that can disagree and no way
to draw the camera icon. Options: (a) keep `strips: null` and accept
first-fit; (b) record the engine's first strip per phase on auto placement,
and the drop position on manual placement, in `Placement`, with `lanes.ts`
holding fixed lanes and first-fitting only the rest.
**Recommendation: (b)**, limited to the *pool* phase's first strip in the
redesign (`first_strip: number | null`) with DE following the pool strip as it
does today. Per-phase strips arrive with E2.

**D3 – One preset picker.** Fold the ten templates in under a *Templates*
group, or delete `TEMPLATES`. **Recommendation: fold.** Three templates that
placed zero events were fixed by 010–012, and the driver presses Suggest on
four of them.

**D4 – Per-event settings.** The design edits fencer count (I4) and flighted
(§4.7) per event and nothing else. `CompetitionConfig` today also carries
`ref_policy`, `cut_mode`, `cut_value`, `de_mode`, `de_video_policy`,
`use_single_pool_override`, all serialized. Options: (a) keep the fields with
no UI, (b) delete them and compute cut from `defaultCutForEntry`, referees and
DE mode from the type default and the new tournament-level override, video
policy from `DEFAULT_VIDEO_POLICY_BY_CATEGORY`, in `buildConfig`.
**Recommendation: (b).** A field no control can set is the next
`video_strips_total` (the case `SettingsPanel`'s exhaustiveness check was
built to prevent). Reassessment §7.2's "advanced disclosure per row" is
superseded by the design.

**D5 – `GlobalOverrides`.** With admin gap and flight buffer withdrawn, no
key has a control. Options: (a) keep the slice, serialization and the
`NotSurfacedKey` machinery for a future settings feature, (b) delete the
slice and read the constants in `buildConfig`. **Recommendation: (b).** The
backlog's "Global settings" entry keeps the intent. US5 built the plumbing to
be withheld and the withholding is now total.

**D6 – The schedule table.** The design has no Matrix ⇄ Schedule toggle. The
original design doc called the table "the artifact an organizer would publish
or hand to a bout committee". Options: (a) delete `ScheduleOutput`, (b) keep
it behind Export as a printable view. **Recommendation: (b)**, as an Export
popover entry, so the view-equivalence test keeps its purpose.

**D7 – Scorecard deltas and hover highlight.** Research D9 froze a baseline
per preset so every metric shows a delta, and FR-029 lights a metric's blocks
on hover. The design shows neither. **Recommendation: delete both.** The
footer has three numbers and the day bands carry the rest. If deltas come
back they come back as a design change, not a retained feature.

**D8 – Which referee number the finding compares.** See E5. Options: (a)
compare the store's upper bound and label the finding "up to N", (b) expose
the engine's clamped model to the derived path first. **Recommendation:
(a)** in the redesign, (b) recorded as the referee model's next opening.

**D9 – A tournament start date.** The day bands show `Thu 12 Feb`. Nothing in
the store carries a date. **Recommendation: no date.** Bands show `Day 1`.
Presets could carry their real dates later.

**D10 – One feature or two.** See §8.

---

## 8. Proposed sequencing

Two features. The split follows constitution III: the second edits the
engine and needs its own drift review, the first does not.

**013 – Workbench redesign** (worktree flow, no engine change beyond pure
additions). The shell, header, dock, rail, five panels, the canvas rewrite on
the design's DOM model with the zoom ladder and weapon encoding, the footer
with the Matrix ⇄ Schedule toggle, the Schedule view restyled after USA
Fencing's published schedules with a print mode, the detail strip with
select / Pin / Move day / Flight, the Findings panel with jump and the two
derived findings, Export, the single preset picker, `flighted`,
`de_mode_override`, `lastAutoRunAt`, and every deletion in §6. Pure engine
additions only: `estimateEventFootprint`, the exported referees-per-pool
factor, `computeSuggestedStrips` split from the write. No drag. Every
placement change goes through a button, so the crossover gap (E3) is reached
only by Move day, and the spec says so.

**014 – Manual placement** (worktree flow, engine drift review). Drag on the
grid and from the dock with the ghost, five-minute snap and legal-range
clamp, lanes honouring the dropped strip, the crossover finding for hand
placements (E3), and Auto-assign around pins by pre-seeding the scheduler
(E1). Per-phase drag (E2) is scoped out of 014 unless E1 turns out small.

Before either: nothing. The cleanups in §6 are 013's first tasks, not a
separate feature – each one removes a surface the design replaces in the same
task, so there is no state where the old control is gone and the new one is
not yet there.

**Human look at the end of the first story**, not the last (reassessment
§9). 013's first story is the shell and header; the screenshot judgment on
density and legibility happens there, at 80 strips on B1, before the canvas
is rewritten against a look nobody has approved at real size.

---

## 9. Decisions taken 2026-09-07

Answered by the product owner in session, one question per decision.

| # | Decision | Answer |
|---|---|---|
| D1 | Auto-assign and pinned events | **Re-apply pins after the run.** Full auto-schedule, then every pinned placement goes back where it was. Collisions surface as overflow and findings. Engine pre-seeding is 014's |
| D2 | Store strips | **No.** Strip numbers are planning aids and will not match the strips assigned at the competition, so nothing preserves them across a re-allocation. `Placement.strips` stays `null`, the packer re-chooses lanes freely, the camera icon is dropped, and a 014 drag sets day and time only |
| D3 | Preset picker | **Fold the ten templates into the one picker** under a *Templates* group |
| D4 | Per-event fields | **Delete** `ref_policy`, `cut_mode`, `cut_value`, `de_mode`, `de_video_policy`, `use_single_pool_override` from `CompetitionConfig` and the URL. `buildConfig` computes them. `CompetitionConfig` becomes `{ fencer_count, flighted }` |
| D5 | `GlobalOverrides` | **Delete the slice.** `buildConfig` reads the constants |
| D6 | Schedule table | **Keep the Matrix ⇄ Schedule toggle**, against the mockup. The Schedule view is restyled after the schedules USA Fencing publishes and gets a print mode for printing to PDF |
| D7 | Scorecard deltas and hover highlight | **Drop both** |
| D8 | Referee finding | **No referees-available input.** Referees needed is output only. No referee finding |
| D9 | Start date | **No date.** Bands show `Day 1` |
| I4 | Fencer count home | **The Events panel**, on the selected chip, edited in place |
| D10 | Split | **Two features**: 013 workbench redesign, then 014 manual placement |
| flow | Git flow for 013 | **Worktree** |

## 10. Pointers, not copies

Facts this document leans on and does not restate:

- The store inversion, validation split, and findings identity: [competition-planner-workbench.md §State model, §Validation](./competition-planner-workbench.md).
- The three canvas defects: [backlog.md §The workbench canvas is not yet a finished surface](./backlog.md).
- The strip search and its non-monotone band: [specs/012-actionable-strip-suggestion/handoff.md](../../specs/012-actionable-strip-suggestion/handoff.md), [strip-count-scheduling-anomaly.md](./strip-count-scheduling-anomaly.md).
- Every engine gap in §5: its named backlog entry.
- The 009 scope this supersedes: [reassessment-2026-09-01.md §7](./reassessment-2026-09-01.md).
