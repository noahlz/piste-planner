# 017 The canvas tells the truth – spec

**Roadmap:** [`competition-planner-workbench.md`](../../docs/design/competition-planner-workbench.md) row 017, with row 025 folded in.
**Backlog:** §The canvas calls events unplaced that the engine placed, §A placed block cannot be selected
from the keyboard, §The engine and the store both report a pin collision, §The canvas draws phases without
the scheduler's waits.
**Branch:** `017-canvas-tells-truth`, worktree `.claude/worktrees/017-canvas-tells-truth`, cut from `main`
at `114d99314b` (016 merged).

## Goal

After Auto-assign the canvas shows the schedule the engine built: every phase at the scheduler's own
times, on the scheduler's own strips, so B1 boots 24 placed / 0 unplaced. Right after a run the footer,
the day bands, the Findings panel and Suggest agree on what is unplaced. Between runs Suggest forecasts a
re-run (its meaning is unchanged, see Out of scope), so after a hand move it can disagree with the board.
A hand move never disturbs a kept event. A block is a keyboard button. After the referee change, the
scheduler reports the peak of its own timeline and the footer counts the board it draws, which right after
a run is the same number.

## Baseline (measured 2026-10-07 at `114d99314b`)

- 82 files / 2278 tests pass with `tmp/` excluded from collection (the planning probes there are not part
  of the suite, see Global constraints in the plan). `tsc -b` and lint are clean.
- Drift ledger B1–B8 scheduled 24 / 24 / 24 / 21 / 12 / 45 / 18 / 53, ERRORs 0 / 0 / 0 / 9 / 0 / 9 / 0 / 0,
  snapshot SHA-256 `cd484a89c7c95f9dc1afebbccf705177487683bde7c1fdd99a674b0afeaff481`.
- Boot footer (app path) B1–B8: 15/9, 13/11, 14/10, 11/19, 8/4, 17/37, 11/7, 30/23.

## Owner rulings (2026-10-07, final)

| # | Question | Ruling |
|---|---|---|
| R1 | Core model | **Yes, as designed.** Keep the last run in memory, never in `Placement` or the URL's placements. Draw run-placed phases at the scheduler's times and strip indices. Fold roadmap row 025 into 017. Narrow D2, with the exact row text below subject to owner approval |
| R2 | METHODOLOGY: referee peak counts the scheduler's timeline after a run | **Yes.** The agent drafts the wording below, the owner approves it, and it is committed before the referee task, as 016's `8e6b8d8e73` was |
| R3 | What a pin fixes | **Unchanged** (day and pool start). The pin-in-place-then-re-run regression (B1 24/0 to 19/5, B8 53/0 to 25/28) becomes a new backlog item |
| R4, R7 | Hand move with no room | The moved event is unplaced and no neighbour moves (0 collateral). Its unseated phase draws in a per-day overflow lane as a focusable button with the findings edge. Its Unplaced row reads "No room here with the current schedule – re-run Auto-assign to schedule around it." The wording may be tightened, the meaning is fixed |
| R5 | Edits outside placements | **Stale banner, not an automatic re-run.** One "Stale – re-run Auto-assign" banner replaces per-event Unplaced rows until the next run, and the board falls back to derived times plus the strip assigner. Roadmap row 020 stays its own feature, with `configKey` noted as its hook |
| R6 | Link replay | **Yes.** The URL carries the pin set the sender's last run used, and boot replays `scheduleAll` with it, so the receiver's board equals the sender's, hand moves included |
| R8 | Video gutter and camera icon | **Deferred** to a later feature |

## Owner approvals (2026-10-07)

The owner approved every item below as proposed, P1 and P2 verbatim, P4 with both the banner and the
Findings row. The planning session continues into implementation, so the worktree is reused.

| # | Item | Approved text or rule | Needed by |
|---|---|---|---|
| P1 | METHODOLOGY wording (§METHODOLOGY amendment) | the text below, verbatim | amendment commit, T9 |
| P2 | D2 row (§D2 row amendment) | the text below, verbatim | Task D |
| P3 | Kept-pin Unplaced wording | "Pinned here, but no strips are free at this time – move or unpin it, then re-run Auto-assign." | T5a |
| P4 | Stale rules | (a) while stale, unseated phases are not counted as unplaced and get no row, while rows for an event with no placement or an out-of-range day stay. (b) The banner is one `role="status"` element above the center view, and the Findings panel shows one non-dismissable "Stale – re-run Auto-assign" row where the per-event Unplaced rows were, so the panel is not silent while stale. (c) While stale the footer's referee peak counts every derived phase, seated or not (part 7) | T5a, T7, T9 |
| P5 | Two hand moves on one day | Derived (hand-moved) events are re-seated in (day, start, id) order on every recompute. The 0-collateral guarantee covers kept events: a later hand move with an earlier start may re-seat or unseat an earlier hand-moved event. The alternative, seating in edit order, needs an edit sequence in the store and in the URL (for R6) | T3 |
| P6 | File load | A saved file carries `run` like a link, and loading it replays the run (part 5) | T8 |
| P7 | Locale-independent tie-breaks | T1 replaces the three `localeCompare` id tie-breaks with code-point order (part 5, Link replay). The alternative is to record a non-`en` browser locale as a known R6 limit | T1 |

## What planning measured

Probes in `tmp/` (`measure017*.test.ts`, `replay017.test.ts`, `judge017.test.ts`, `nowait*`), all at
`114d99314b`, no tracked file edited.

- **The cause is timing, not lanes.** `deriveEventSchedule` starts the DE at
  `snapToSlot(poolEnd + ADMIN_GAP_MINS)` (`src/engine/derive.ts:220`), without the scheduler's wait for
  strips. Drawn DE starts are up to 75 min early on B1 and 505 on B6. Drawn per-day strip demand exceeds
  the strip count on every day of B1–B8 (B1 84/115/90/95 against 80, B6 90/83/112 against 48, B8
  108/136/126/115 against 68), while the engine's never does.
- **The contiguous packer adds overflow on top:** 5/4/5/4/3/6/2/9 blocks even at engine times.
- **The backlog's `19 placed · 5 unplaced` is out of date.** B1 boots at 15/9 with 9 overflow blocks,
  all DE phases (`scripts/smoke.mjs:280-282` logs it).
- **Kept engine indices** at engine times: 0 overlaps, 0 video-required phases off video on B1–B8 (of
  18/18/24/0/0/0/18/47) and on all 10 templates. Index sets are not contiguous: B1 14 of 66 phases span
  several runs (at most 4), B6 59 of 90 (at most 5). Rects drawn: B1 85 for 66 blocks, B6 191 for 90,
  B8 194 for 148.
- **Design A boot footers:** 24/0, 24/0, 24/0, 21/9, 12/0, 45/9, 18/0, 53/0, deterministic over re-runs.
- **Pins.** After pin-all plus a re-run the unseated set equals `PINNED_UNCLAIMED` (8/14/10/12/3/37/8/48),
  and after pin-half (0/1/0/2/0/9/0/10), in 16 of 16 trials. Pinning every event in place then
  re-running moves B1 24/0 to 19/5 and B8 53/0 to 25/28, because pre-claim seats pins on the no-wait chain.
- **Move day**, every event to every other day on B1–B8 (585 moves): 0 collateral with kept indices fixed.
  The moved event is unseated in 92–100 % of moves. Re-packing everything instead breaks unmoved events
  in B1 69 of 72 moves and B8 159 of 159. A re-run with the move pinned places 24/23/24/19/12/48/18/53
  with `PINNED_UNCLAIMED` 0. Only single moves were measured.
- **Rejected alternatives:** the no-wait engine (floors 24/19/23/19/12/40/16/53, ERRORs
  0/5/1/11/0/14/2/0), close-gaps (closes 32 of 200 waits, B1 reaches 17/7), replay without a run record
  (B6 boots 5 pools that cannot claim), re-packers at kept times (one-pass 0/3/2/0/0/0/0/2, two-pass
  1/1/1/0/0/0/0/3 overflow), a splitting packer at derived times (7/9/10/9/3/26/6/22).
- **Link replay** of `scheduleAll` takes 0–6 ms and is deterministic on one machine. The engine's id
  tie-breaks use `localeCompare` with no locale (`src/engine/concurrentScheduler.ts:854`, `:1524`,
  `src/store/buildConfig.ts:165`), so the order follows the browser's locale. Under `lt`, where Y sorts
  between I and J, `'JR-M'.localeCompare('Y14-M', 'lt')` is 1 while code-point order and `en` give -1.
- **Referee peaks** on the scheduler's timeline, per day, are the table under Expected drift. They equal
  the scheduler's own figures before 016 Task E, and the ledger diff 016 made (`b84be7e291` to now) is 30
  lines, all `peak_*` inside `refRequirementsByDay`.

## Design

### 1. The kept run

`runScheduleAll` (`src/store/runActions.ts:30-63`) keeps the run, not only its placements, in a new
in-memory store field `lastRun: KeptRun | null`. It is never stored in `Placement` and never in the URL's
placements.

- `KeptRun = { configKey; pins: PinnedPlacement[]; events: Record<id, KeptEvent> }`. `pins` are the
  run's inputs (for R6).
- `KeptEvent = { placementKey: { day, start_time, strip_count }; result: ScheduleResult (clock axis);
  phases: KeptPhase[] }`, `KeptPhase = { phase; startMinutes; endMinutes; stripCount; strips }`.
- **Where `placementKey` comes from.** For a pinned event it is the pin itself, on the clock axis:
  `{ day: pin.day, start_time: pin.start_time − pin.day × DAY_AXIS_SPACING_MINS, strip_count:
  pin.strip_count }`. That is what `setPlacementsFromAuto` keeps as the placement
  (`src/store/store.ts:398-401`). For every other event it is `placementFromResult`
  (`src/engine/derive.ts:66-76`). A pin's key never comes from the result, because pre-claim caps the
  result's strip count at `min(desired, pin.strip_count)` (`src/engine/concurrentScheduler.ts:883-894`),
  so a pin whose strip count is above that cap would fail its own key straight after the run.
- Phases come from the engine's `phaseSpans` (part 3), so a zero-length phase is not a kept phase. Strips
  come from `strip_allocations`, grouped by event and phase. A phase that claimed nothing keeps an empty
  set.
- Only `runScheduleAll` and a state load with a `run` (part 5) write `lastRun`. A run that throws clears
  it. `runScheduleAll` writes placements and `lastRun` in one store update, so no subscriber sees the new
  placements with the old run.

### 2. One drawn model

`selectDrawnSchedule(state)` is the single answer to "what does the board show".

- **`configKey`** is a canonical serialization of `buildTournamentConfig(state)`'s whole output, config
  plus every Competition: object keys in a stable order, arrays in their given order (so a deselect and
  reselect that reorders competitions changes the key), and non-finite numbers (`Infinity` in every
  Competition's `latest_end`, `-Infinity`, `NaN`) encoded distinctly from `null` and from each other. It
  is compared by string equality, never hand-picked fields, so any engine input change invalidates the
  run.
- **Run state.** `stale` when at least one in-range placement of a selected event exists and `lastRun` is
  null or its `configKey` differs from the current one. Otherwise `fresh`. A deselected event's leftover
  placement does not count, as in `computePlacementCounts` (`src/store/derived.ts:371`).
- **A kept event** is one where the run state is fresh, `lastRun.events[id]` exists, and the current
  placement's `{day, start_time, strip_count}` equals its `placementKey`. It draws the kept result and
  strips. Every other placed event is **derived**: `deriveEventSchedule` times.
- **What counts as unplaced** is decided once, on the model: a block `countsAsUnplaced` when it is
  unseated and the run state is fresh, and the model exposes the set of event ids with such a block. The
  footer, the day bands, the Findings rows and the referee count read only that, never `unseated` alone.
- Validity lives in the selector, so no action can forget to invalidate. A pin toggle keeps the entry.

### 3. Strips

`assignStrips` (a pure function in `src/layout/`) turns the drawn model into blocks.

- Per day, it first seats every kept phase on its own indices as fixed occupancy. It then seats each
  derived phase, ordered by (day, start, id, phase order), on the first free strips in the engine's
  candidate order (non-video first, video-only for a video-required phase), by calling the engine's own
  `findAvailableStripsInWindow` and `allocateInterval` (`src/engine/resources.ts:203`, `:87`) over a
  resource state built from that occupancy. It never copies the candidate rule. A phase that cannot claim
  records no occupancy. One pass, bounded by phases × strips. A kept index outside the day's strips throws
  a named error rather than failing inside the resource state.
- **Collateral.** Kept events never move: no derived interval overlaps a kept interval on the same strip
  and day, and every kept phase's indices are the same with and without derived events present. Derived
  events are re-seated in fixed order on every recompute, so whether one hand move can disturb another is
  item P5 (approved: fixed order).
- **Unseated:** a phase with `stripCount > 0` and `endMinutes > startMinutes` that holds no strips. Every
  zero-length phase is skipped by `phaseSpans`, so it is never offered, never drawn and never flagged
  (B8 VET-W-SABRE-IND-V80's DE_ROUND_OF_16, 3570–3570, and a flighted one-pool event's empty FLIGHT_B).
- The engine gets one helper with the same rule, `unseatedPhases`, read by Suggest's subtraction
  (`src/engine/stripSearch.ts:211-224`) and by the referee count. Right after a run it equals the
  `PINNED_UNCLAIMED` set less any zero-length phase. `PINNED_UNCLAIMED` stays a ledger WARN with no panel
  row of its own.

### 4. Unplaced, findings and footer

- An event is **unplaced** when it has no in-range placement, or the model counts one of its blocks as
  unplaced (part 2). The footer counts, the day bands, the Findings Unplaced rows,
  `selectPlacementCounts`, the late-finish rows, the first and last day WARN, the rule check and the
  footer's finish and strip utilization all read the drawn model and its blocks, nothing else.
- **Strips held** are a block's `strips.length`, which is 0 for an unseated block. Strip utilization and
  the day band's peak strips add that, never `stripCount`, so a band cannot claim more strips than exist.
- **Day bands** count distinct unplaced events per day with the footer's predicate, not blocks, so a
  moved event with three unseated phases reads 1 in its band and 1 in the footer.
- **One Unplaced row per unplaced event**, id `unplaced:<id>:room`, `where` "Day N · <label>":
  - a derived (hand-moved) event: "No room here with the current schedule – re-run Auto-assign to
    schedule around it."
  - a kept event whose pinned phase the engine could not seat: P3's wording (approved).
- **While stale** (P4, approved): the board is not a schedule until the next run, so unseated phases are
  unknown, not unplaced. No unseated rows, no unseated counts in the footer or the bands. Rows for events
  with no placement or an out-of-range day stay. The stale notice replaces the unseated rows (part 6).
- The footer's referee peak does **not** change until the referee task (part 7).

### 5. What each action does

| Action | Run state | What draws |
|---|---|---|
| Auto-assign, preset load, boot | fresh | every placed event kept |
| Move day (`DetailStrip.tsx:147-150`), `updatePlacement({ start_time })`, `updatePlacement({ strip_count })` | fresh | that event derived, seated around kept strips, unseated when no room, and no kept event moves |
| Pin or unpin (`setPinned`) | fresh | unchanged |
| Settings, day count, fencer count, flighting, event set, video count | stale | derived times plus `assignStrips`, stale notice |
| Link or file load with a valid `run` | fresh after replay | the sender's board, hand moves included |
| Link or file load without `run`, or with a refused `run` | stale (if anything is placed) | stale notice |

The two `updatePlacement` rows are store-level writes. Today the only UI placement writers are Move day
(`DetailStrip.tsx:148`) and the pin toggle (`DetailStrip.tsx:226`). No drag or strip budget control
exists yet, so no task looks for one.

- After a day reduction an event on a removed day is out of range and unplaced (existing rule). The next
  run treats its pin as absent, since `buildPinnedPlacements` skips out-of-range pins
  (`src/store/buildConfig.ts:151`), and places it afresh.
- **Link and file replay (R6, P6).** The payload gains an optional top-level `run: PinnedPlacement[]`.
  `serializeState` is shared by the share link (`encodeToUrl`, `src/store/serialization.ts:393`) and file
  save (`src/store/exportActions.ts:16`), so both carry it.
  - **Written** only when `lastRun` is non-null and `lastRun.configKey` equals the current config's key,
    computed directly in serialization from `buildTournamentConfig` and `configKeyOf`, not through the
    memoized selector. An empty board, or one whose run is stale, writes no `run`. `schemaVersion` stays
    3 (no back-compat, an absent key means no run).
  - **Validated as a whole.** Every entry must name a selected event that exists in the catalogue, once,
    with a day in range, a `start_time` on its own day's axis (`day × DAY_AXIS_SPACING_MINS ≤ start_time <
    (day + 1) × DAY_AXIS_SPACING_MINS`) and a whole `strip_count ≥ 1`. One invalid entry refuses the whole
    `run`, since a partial replay would draw a board different from the sender's while calling it fresh.
    A refused run is reported the way `droppedPlacements` is (`boot.ts:31` for a link, the dropped
    placements notice in `ExportPopover.tsx` for a file), and the board opens stale.
  - **Every state load ends with `lastRun` set.** A link (`src/store/boot.ts:24-37`) or a file
    (`applyLoadedState`, `src/store/exportActions.ts:46-48`) applies the payload, then replays
    `scheduleAll` with a valid `run` and writes `lastRun` only, never placements. Without a valid `run`,
    `lastRun` becomes null, so a run from the previous board never draws against loaded placements, even
    when the two configs share a key.
  - **Ids sort the same everywhere** (P7, approved). The engine's three id tie-breaks become code-point
    order. Over every catalogue id that order equals `en`'s, so the ledger stays byte-identical, and a
    sender and a receiver in different locales replay to one board.
  - **URL size.** `run` repeats each pin of the sender's last run, about 80 bytes each before base64. A
    pin-all board on B6 or B8 adds about 4 KB, so share links pass `URL_SIZE_WARNING_BYTES` (2048,
    `exportActions.ts:5`) more often and the existing size warning shows.

### 6. Canvas and keyboard

- A kept phase draws on its own index set, one rect per strip run. Unseated phases draw in a per-day
  overflow lane below the day's strips, at their time.
- Each phase is one `<button type="button">` on its first run, with its aria-label, an outline focus
  ring and a plain tab stop. Enter or Space selects it. Further runs are `aria-hidden` siblings with
  `tabIndex={-1}`, the same fill and click-to-select, sharing hover, selection and the warned edge.
- The overflow edge exemption goes (`warnedEdge = warned && !placement.overflow`,
  `src/components/canvas/Block.tsx:204`). Every warned block draws the findings edge, the overflow lane
  included.
- **The stale notice** (P4, approved) is one `role="status"` banner above the center view reading
  "Stale – re-run Auto-assign", plus, under the proposal, one non-dismissable row with the same text in
  the Findings panel where the per-event Unplaced rows were. The banner reads the center view's committed
  model's run state (`src/components/workbench/CenterView.tsx:142-170`), so it changes when the board
  redraws, not before. While a Blocking finding freezes the committed model and disables Auto-assign, the
  banner keeps the frozen state and the Blocking rows say why Auto-assign is off.
- The schedule table, the detail strip's pills and strip label read the drawn model too.
- **DOM contract** (read by unit tests and `scripts/smoke.mjs`): a phase's first run carries
  `data-event-block`, `data-event-id`, `data-phase`, `data-strips` (comma-joined indices, empty when
  unseated), `data-strip-count` and `data-unseated`. Continuations carry `data-block-run` only, never
  `data-event-block`, so `[data-event-block]` counts phases, not rects. The overflow lane is
  `[data-overflow-lane][data-day]`. The banner carries `data-stale-banner`. `data-overflow` and
  `data-first-strip` go (no test or smoke step reads them today).

### 7. Referee demand (after the amendment)

- The scheduler counts each event's own `ScheduleResult` phase intervals on its own axis, leaving out
  `unseatedPhases`. It no longer goes through `placementFromResult` plus `deriveEventSchedule`
  (`src/engine/concurrentScheduler.ts:1559-1594`).
- The store's footer counts the drawn model's intervals, leaving out the blocks the model counts as
  unplaced (part 2). While fresh that skips unseated phases. While stale it skips nothing, so every
  derived phase is counted, seated or not (P4 (c), approved), since the stale board is not a schedule.
- Both switch in one commit, so `appPathParity` holds at every commit.

### METHODOLOGY amendment (P1, owner approves, committed before the referee task)

**§Ref Demand Derivation, `METHODOLOGY.md:628`.** Replace the whole paragraph with:

> Ref demand is derived post-schedule. The scheduler reports the peak of its own timeline: each phase at the times and on the strips it allocated, waits included, leaving out a phase that holds no strips. The workbench footer counts the board it draws. Right after a run that is the same timeline, so the two are one number. An event moved by hand after the run is counted with its phases laid end to end from its new day and start by the scheduler's duration rules – the times the next run would try to claim for it as a pin – less any phase that finds no free strip. While the engine's inputs differ from the last run's, every event is counted that way, every phase included, until the next run. **DE phases require one referee per allocated strip.** Pool phases follow `refs_per_pool`. Per-day peaks come from a sweep over those intervals.

**§Phase 5: Resource Allocation, `METHODOLOGY.md:753`.** Replace the line with:

> Ref demand is **derived post-schedule** from the scheduler's own timeline (see [Ref Demand Derivation](#ref-demand-derivation)), not maintained incrementally by the loop. It is summarized into per-day peak totals in Phase 7.

No other METHODOLOGY line changes (`:588` and `:630` stay true).

### D2 row amendment (P2, owner approves, applied in Task D)

`docs/design/workbench-design-alignment-2026-09-07.md:409`, replacing the row verbatim:

```text
| D2 | Store strips | **No**, narrowed by 017 (owner ruling 2026-10-07). Strip numbers are planning aids and will not match the strips assigned at the competition, so nothing stores them: `Placement.strips` stays `null`, no strip number enters the URL, the camera icon waits for a later feature (017 R8), and a 014 drag sets day and time only. After a run the canvas draws each phase on the strips the scheduler gave it, from an in-memory record of that run. A shared link rebuilds that record by replaying the run. Any change to the engine's inputs makes it stale. An event moved by hand is laid on the strips the kept events leave free, and a stale board lays every event that way |
```

## Pass conditions

- **Boot footer, app path** (preset, `runScheduleAll`, drawn model): 24/0, 24/0, 24/0, 21/9, 12/0, 45/9,
  18/0, 53/0, equal to the engine's scheduled and unscheduled counts.
- **Boot invariants, B1–B8 and all 10 templates:** 0 unseated phases, 0 strip-index overlaps per day, 0
  video-required phases off video, drawn phase times equal to `ScheduleResult` times with 0 mismatches
  against `strip_allocations`, and the app's first and last day WARN equal to the scheduler's own (a
  mismatch halts for attribution).
- **Pins:** after pin-all and pin-half plus a re-run, the unseated set equals `PINNED_UNCLAIMED`
  (counts above), and every pinned event stays kept, including a pin whose strip count is above the
  engine's cap. A pinned event's result phase times equal `deriveEventSchedule`'s.
- **Move day**, every event to every other day on B1–B8: 0 kept events change times or strips. The moved
  event's row carries the re-run wording. Headline (first id to the next day): B1 reads 23/1, the day
  band and the footer both count 1, and Auto-assign then gives 24/0.
- **Two moves on one day:** the result P5's answer fixes.
- **Settings edit:** the stale notice shows, no per-event unseated rows, the footer and the bands count 0
  unseated, and Auto-assign returns the engine's counts.
- **Link and file round-trip:** the receiver's drawn model equals the sender's, before and after one Move
  day. A refused `run` opens stale.
- **Flighted fixtures:** B1's D1-M-EPEE-IND set `flighted: true` keeps FLIGHT_A and FLIGHT_B as separate
  kept phases, and its derived fallback includes `FLIGHT_BUFFER_MINS`. A one-pool flighted event's empty
  FLIGHT_B is never a phase.
- **Ledger:** byte-identical through every task except the referee task.
- **Smoke** (`scripts/smoke.mjs`, extended in place, each check added by the task that creates the
  behaviour): B1 `24 placed · 0 unplaced` asserted, 0 unseated blocks at boot, blocks are buttons
  reachable by Tab with Enter selecting, `openPanel` uses `exact: true`, the stale notice after a settings
  edit and none on a fresh run, link round-trip identical, footer peak referees 210, headline Move day
  shows one Unplaced row with the re-run wording and Auto-assign clears it.

## Expected drift

- **Every task but the referee task:** the engine's outputs are untouched. Snapshot SHA stays `cd484a89c7c9…`.
  `deriveEventSchedule` is unchanged, so `__tests__/helpers/scenarios.ts` and `factoryParity.test.ts` do
  not move. The app path moves: footers as above, late-finish and first and last day rows follow the
  scheduler's later DE ends (recorded per scenario in Task T5b's commit).
- **Referee task:** only `refRequirementsByDay` moves. Scheduled counts, ERRORs, times and allocations do
  not. The new peaks are the scheduler's timeline, so the snapshot is expected to return byte for byte to
  the pre-016 one, SHA-256 `7e2db75c38bb6e5702d3618e81127130739e9075536b843ca76a8cc368b89d06`. A
  different SHA is judged against the `b84be7e291` snapshot field by field. Any move outside
  `refRequirementsByDay`, or a total that differs from the table, halts to the owner.

| Scenario / day | Total, drawn to timeline | Sabre (expected, 016 Task E reversed) |
|---|---|---|
| B1 d1 / d2 | 218 to 210 / 140 to 134 | 68 to 64 / 56 held |
| B2 d0 / d3 | 244 to 228 / 140 to 136 | 90 held / 70 held |
| B4 d1 / d2 | 90 to 80 / 104 to 80 | 44 held / 60 to 54 |
| B6 d0 / d1 / d2 | 98 to 78 / 90 to 68 / 112 to 64 | 48 held / 24 to 20 / 58 to 32 |
| B7 d0 / d2 | 164 to 156 / 168 to 156 | 64 held / 86 to 70 |
| B8 d0 / d1 / d2 | 236 to 212 / 146 held / 172 to 136 | 66 to 56 / 64 to 56 / 48 held |
| B1 d0, d3; B2 d1, d2; B3; B4 d0; B5; B7 d1, d3; B8 d3 | held | held |

`peak_time` returns to the `b84be7e291` values on the same days. B1's footer peak reads 210. The table
lists 14 scenario-days that move in some field (B8 d1 moves in sabre only).

## Out of scope

- Pin semantics (R3): a pin still fixes day and pool start. New backlog item.
- Re-run on parameter change (roadmap row 020): stale notice only.
- Video gutter and camera icon (R8).
- Relabelling Suggest as a re-run forecast: not in the rulings. Suggest's number does not change.
- Storing strip numbers anywhere, or carrying run outputs in the URL. `run` carries the run's inputs.
- Engine scheduling changes of any kind. The tie-break change (P7) keeps the order on every catalogue id
  and the ledger byte-identical, so it is not one.
