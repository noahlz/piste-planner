# Data Model: 013

What the store holds after this feature, what travels in a share link, what the
browser keeps for one viewer, and the view models the new surfaces read. Every
shape here is stated once. `src/engine/` shapes that do not change are pointed
at, not restated. Reasoning is in [research.md](./research.md).

`[R]` read at `78ae3b28f4`, 2026-09-07.

---

## 1. Store slices after 013

### TournamentSlice

| Field | Before | After |
|---|---|---|
| `tournament_type`, `days_available`, `dayConfigs`, `strips_total`, `video_strips_total`, `pool_round_duration_table` | as today | unchanged |
| `de_mode_override` | – | **new** `DeMode \| null`. `null` follows `TYPE_DEFAULTS[type].de_mode`. Set by the Settings panel's Staged / Single pills. Serialized. |

Actions: `setDeModeOverride(mode: DeMode | null)` added. `suggestStrips` is
replaced by `computeSuggestedStrips(): Promise<number | null>` (search only,
no write) – **Apply** calls the existing `setStrips` ([research D8](./research.md)).

### CompetitionSlice

`[R]` `store.ts:81` `CompetitionConfig` has seven fields. After 013 it has two:

```text
CompetitionConfig = { fencer_count: number, flighted: boolean }
```

`ref_policy`, `cut_mode`, `cut_value`, `de_mode`, `de_video_policy` and
`use_single_pool_override` are computed in `buildConfig.ts` (§4). The
`globalOverrides` field and `setGlobalOverrides` are deleted (D5).

`applyTemplate(name)` keeps its shape and additionally records the loaded
preset (§UiSlice) so both picker groups behave alike.

### UiSlice

| Field | Status | Shape | Serialized |
|---|---|---|---|
| `loadedPresetId` | widened | `PresetId \| null` where `PresetId = ScenarioId \| TemplateName` | no |
| `lastAutoRun` | **new** | `{ at: number, placed: number, unplaced: number } \| null` – set by `runScheduleAll` | no |
| `selectedCompetitionId` | **new** | `string \| null` | no |
| `jumpNonce` | **new** | `number` – incremented by a Findings jump so the canvas scrolls and flashes once per press | no |
| `scorecardBaseline` | deleted (D7) | – | – |
| `hoveredMetricId` | deleted (D7) | – | – |

Actions: `setLoadedPresetId(id: PresetId | null)`, `setLastAutoRun(run)`,
`selectCompetition(id: string | null)`, `jumpToCompetition(id)` (selects and
bumps the nonce).

Selection lives in the store, not in browser storage, because three
components read it (canvas, detail strip, Findings panel) and a stored id that
names an event no longer on the board is meaningless on reload
([research D5](./research.md)).

### PlacementsSlice

Unchanged. `Placement` is `[R]` `types.ts:399`: `{ day, start_time, strip_count,
strips: number[] | null, source, pinned }`. `strips` stays `null` on every path
(D2). `updatePlacement` still marks manual and pinned. `setPlacementsFromAuto`
loses its baseline capture.

### DismissalsSlice

Unchanged in shape. `dismissFinding(id)` widens its guard from "a current WARN
`ValidationError`" to "a current Warning or Unplaced row of the unified
findings list" (§5), so the two derived findings can be dismissed.

### AnalysisSlice

Deleted whole: `flightingSuggestionStates`, `acceptFlightingSuggestion`,
`rejectFlightingSuggestion`. The `flightingSuggestions` parameter threaded
through `buildTournamentConfig` and every selector in `derived.ts` goes with
it.

---

## 2. Viewer state (browser storage, never the URL)

`src/store/viewState.ts` is rewritten. Research D10 from 004 still applies:
viewer preferences never reach `serializeState`.

| Field | Type | Default | Notes |
|---|---|---|---|
| `viewMode` | `'matrix' \| 'schedule'` | `'matrix'` | Survives §6's deletion list because D6 kept the toggle |
| `panel` | `'tournament' \| 'strips' \| 'events' \| 'findings' \| 'settings' \| null` | `null` | One open panel at most |
| `panelDocked` | `boolean` | `false` | Floating over the canvas by default |
| `detailCollapsed` | `boolean` | `false` | The detail strip's one-line state |
| `zoomStep` | `0..5` | `2` | Index into the ladder (§7) |
| `fitting` | `boolean` | `true` | Fit-day mode. The opening view is fit-to-day |

Deleted: `rowHeightStep`, `timeZoom`, `timeScroll`, `rowScroll`,
`drawerHeight`, `scorecardExpanded`. Scroll position belongs to the browser.

Validation on load stays wholesale: any missing or out-of-range field falls
back to the full default, as today.

---

## 3. Serialized state (share link and saved file)

`schemaVersion` becomes **3**. A payload at any other version is rejected with
an error. No migration, no leniency for the removed keys
([project rule: no backwards compatibility](../../docs/design/backlog.md)).

```text
SerializedState v3
  tournament
    tournament_type, days_available, dayConfigs, strips_total,
    video_strips_total (nullable), pool_round_duration_table (overrides only),
    de_mode_override (nullable)
  competitions: Record<id, { fencer_count, flighted }>
  placements: Record<id, Placement>
  dismissedFindings: string[]
```

Removed from v2: `competitions.globalOverrides`, and the five per-event fields
inside each competition entry. `competitions` flattens from
`{ selectedCompetitions, globalOverrides }` to the map itself.

---

## 4. What `buildConfig.ts` computes per competition

Every field a control used to set now has one derivation. All of them exist
today as constants or helpers, and this table is the order they apply in.

| `Competition` field | Derived from | Home |
|---|---|---|
| `fencer_count` | the store | `CompetitionConfig` |
| `flighted` | the store | `CompetitionConfig` |
| `ref_policy` | `TYPE_DEFAULTS[type].ref_policy` | `typeDefaults.ts` |
| `cut_mode`, `cut_value` | `defaultCutForEntry(entry)`, then the regional-type override, then the team coercion – the three rules `buildConfig.ts` already applies in that order | `competitionDefaults.ts`, `constants.ts` |
| `de_mode` | `de_mode_override ?? TYPE_DEFAULTS[type].de_mode` | `typeDefaults.ts` |
| `de_video_policy` | `DEFAULT_VIDEO_POLICY_BY_CATEGORY[category]` | `constants.ts` |
| `use_single_pool_override` | `false` | – |
| `flighting_group_id` | `null` – groups came only from accepted suggestions, which are deleted | – |
| `is_priority` | `false` | – |
| `strips_allocated` | unchanged rule | `buildConfig.ts` |
| `ADMIN_GAP_MINS`, `FLIGHT_BUFFER_MINS`, `THRESHOLD_MINS`, `SLOT_MINS`, `DE_BOUT_DURATION`, `YOUTH_VET_BOUT_DELTA`, `DEFAULT_DE_STRIP_FOOTPRINT` on `TournamentConfig` | the `constants.ts` exports directly | `constants.ts` |

`VideoPolicy.FINALS_ONLY` is deleted from the engine enum. `[R]` its only
references are `types.ts:60` and the deleted `CompetitionOverrides.tsx:19`; no
default table names it.

`flighted: true` with `flighting_group_id: null` is exactly the shape
`derive.ts:148` splits into Flight A and Flight B, so the store's flag needs no
new derivation.

---

## 5. Findings (view model, derived)

One list, one shape, every source. Built in `derived.ts` by a new selector,
`selectFindings(state): Finding[]`.

```text
Finding
  id        string        stable across recomputes of the same condition
  severity  'Blocking' | 'Warning' | 'Note' | 'Unplaced'
  where     string        "Day 2 · Pools", "Strips", "Day 3 · Vet 50 Men's Epee"
  day       number | null
  message   string
  target    string | null  competition id, when the finding names one
```

| Source | `id` | `severity` | `day` | `target` |
|---|---|---|---|---|
| `validateConfig` → `ValidationError` | `findingIdentity(error)` | ERROR → Blocking, WARN → Warning, INFO → Note | the target's placement day, else null | `subjects[0]` when it is a competition id |
| `initialAnalysis` → `Bottleneck` | `analysis:${cause}:${competition_id}:${n}` where `n` disambiguates repeats | same map | the target's placement day, else null | `competition_id` when non-empty |
| **Unplaced** (new) | `unplaced:${competitionId}:${phase}` | Unplaced | the block's day | the event |
| **Late finish** (new) | `late-finish:day:${day}` | Warning | the day | the event that finishes last |

Dismissal applies to Warning and Unplaced rows. Blocking and Note rows cannot
be dismissed, as today.

**Unplaced** is produced per overflow block from the lane packer (§6): the
block the packer could not fit within `strips_total`. Its message names the
strips the block needs.

**Late finish** is produced per day where `latestFinish(day) > day_end_time −
LATE_FINISH_WINDOW_MINS` (45, a UI constant in `derived.ts`, not an engine
constant). The message states the margin before close or the minutes past it.
Underlying severity is WARN in both cases (clarification 2026-09-07).

The rail badge is the count of rows not dismissed.

---

## 6. Layout (pure, shared by the store and the canvas)

`eventTimeSegments` (`src/components/canvas/geometry.ts`) and
`assignStripLanes` (`src/components/canvas/lanes.ts`) are already read by
`derived.ts`, against the app's usual import direction. Both move to
`src/layout/` – pure modules with no React and no store read – so the store,
the Findings selector, the day summaries and the canvas all read one copy
([research D6](./research.md)). Their tests move with them.

`BlockPlacement` (`[R]` `lanes.ts:43`) is unchanged: `competitionId, day,
phase, startMinutes, endMinutes, stripCount, firstStrip, overflow`. Overflow is
still drawn at strip 0 and records no occupancy. The canvas draws it dashed.

---

## 7. Zoom ladder

Six rungs, from the mockup. `ppm` is **pixels per minute** (the retired
`timeZoom` was minutes per pixel). `row` is the strip row height in pixels.

| step | ppm | row | reads as |
|---|---:|---:|---|
| 0 | 1.5 | 15 | 47% |
| 1 | 2.2 | 22 | 69% |
| 2 | 3.2 | 34 | 100% – the reset rung |
| 3 | 4.6 | 48 | 144% |
| 4 | 6.5 | 62 | 203% |
| 5 | 9.0 | 78 | 281% |

**Fit day**: `fitting = true`. The horizontal scale is solved from the measured
plot width divided by the axis span in minutes, and block positions are
percentages of that span so the browser solves the fit at any width. Row
height comes from the ladder's current step. Zoom in or out leaves fit mode at
the neighbouring rung.

**Axis span**: the earliest `day_start_time` to the latest `day_end_time`
across `dayConfigs`, so every day shares one axis. Clock axis, never the
scheduler axis.

---

## 8. Weapon tokens

Three tokens replace the 33 `--cat-*` custom properties. Values from the
mockup's `WEAPON` table.

| Weapon | fill | ink | edge | hatch |
|---|---|---|---|---|
| Foil | `#d7e3ef` | `#2c455d` | `#8fb0cd` | `rgba(44,69,93,.16)` |
| Epee | `#d9e6da` | `#2f4a37` | `#93b79a` | `rgba(47,74,55,.16)` |
| Sabre | `#f1e0d2` | `#5a3f26` | `#cfa887` | `rgba(90,63,38,.16)` |

Defined as `--weapon-{foil,epee,sabre}-{fill,ink,edge,hatch}` in `index.css`.
The DE hatch is a 45° repeating gradient of the hatch colour over the fill.
The legend, the dock chips and the detail strip's swatches read the same
tokens.

---

## 9. Day summary (derived)

`selectDaySummaries(state): DaySummary[]`, one per day in `[0, days_available)`.

```text
DaySummary
  day         number
  events      number     distinct events with a block on the day
  finish      number | null   latest de_total_end on the day (clock axis)
  peakStrips  number     max concurrent strips, sampled at block boundaries
  unplaced    number     overflow blocks on the day
  findings    number     undismissed findings whose day is this day
```

`finish` is the value `finish:day:N` reported in the retired scorecard.
`peakStrips` is the mockup's `dayStats.peak` over the lane packer's blocks.

---

## 10. Footer counts and event footprint

**Counts**, over `selectedCompetitions` and `placements`:

| Count | Definition |
|---|---|
| placed | selected events with a placement whose day is in range |
| unplaced | selected events with no placement or an out-of-range day, **plus** overflow blocks |
| pinned | placements with `pinned: true` |

Matches the mockup's `placementCounts`: an event the packer could not fit is
unplaced whatever the store says.

**Event footprint**, a new pure engine helper `estimateEventFootprint(competition,
config)`:

```text
EventFootprint { strips: number, poolMinutes: number, deMinutes: number }
```

Computed by deriving the event against a synthetic placement at day 0, the
day's start, and a strip budget of its pool count, then reading the three
figures off the result. No arithmetic is added, so the dock's need and the
canvas's blocks cannot disagree ([research D10](./research.md)).

---

## 11. Pinned placements into the engine

The engine story's input. Shape and mechanism are settled in
[research D1](./research.md), and the contract is in
[contracts/engine-contract.md](./contracts/engine-contract.md). In summary:
`runScheduleAll` hands `scheduleAll` the pinned placements as
`{ competition_id, day, start_time, strip_count }` on the scheduler axis, the
engine fixes their day and pre-claims their strip-time before packing, and
the result for each pinned event carries the same day and pool start it was
given.

---

## 12. Retired shapes

Pointer, not a list: everything in
[alignment §6](../../docs/design/workbench-design-alignment-2026-09-07.md).
Two corrections to that list, both recorded in research.md:

- `viewState.viewMode` survives (D6 kept the toggle).
- The referees-per-pool factor is already exported as `resolveRefsPerPool`
  from `src/engine/pools.ts`; nothing new is exported from `refs.ts`.
