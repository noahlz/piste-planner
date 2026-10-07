# 017 The canvas tells the truth – implementation plan

> **For agentic workers:** the orchestrator writes no code. Each task is one subagent dispatch of 2–4
> steps, then its review wave, then (from T5a on) a live-smoke run in its own subagent. Start from
> [`sessions/S1.md`](./sessions/S1.md).

**Goal:** after a run the board draws the engine's own times and strips, one drawn model answers what is
placed and unplaced everywhere in the app, blocks are keyboard buttons, a shared link or saved file
reproduces the sender's board, and the referee peak is the scheduler's timeline.

**Architecture:** `runScheduleAll` keeps the run in memory (`lastRun`). A pure strip assigner in
`src/layout/` seats kept phases on their own indices and hand-moved phases around them, using the
engine's own candidate and claim helpers. One memoized selector, `selectDrawnSchedule`, decides per event
whether the kept run still applies, decides once what counts as unplaced, and feeds the canvas, the
footer, the day bands, the Findings panel and the schedule table. The engine gains one unseated-phase rule
shared with Suggest, locale-independent id tie-breaks and, last, the referee count. The engine's
scheduling is untouched.

**Spec:** [`spec.md`](./spec.md) (owner rulings 2026-10-07, items P1–P7 pending until S1 asks), plus the
METHODOLOGY amendment committed before T9. The spec is never edited to match code. A task that finds it
wrong or silent halts to the owner. A task whose spec item is still pending does not start.

## Global constraints

- `<wt>` = `/Users/noahlz/projects/piste-planner/.claude/worktrees/017-canvas-tells-truth`, branch
  `017-canvas-tells-truth`. Agents commit there only, one commit per task plus one per review-fix round
  and one per smoke-driver change. Never push, merge, rebase or make the closing commit. The user merges
  with `merge-with-costs`.
- **The planning probes in `<wt>/tmp/` are not part of the suite.** `vitest.config.ts:14-18` excludes only
  `.worktrees`, `.claude/worktrees` and `node_modules`, so a bare `pnpm test` collects 90 files, 8 of
  them git-ignored probes that import `src/layout/lanes.ts` (deleted in T6b) and run slow sweeps. Every
  full-suite run passes `--exclude 'tmp/**'` (vitest adds it to the config's excludes), which collects
  the 82 baseline files. Run a probe only by name when a task cites it.
- Baseline: 82 files / 2278 tests (with `tmp/**` excluded), ledger B1–B8 scheduled 24 / 24 / 24 / 21 /
  12 / 45 / 18 / 53, ERRORs 0 / 0 / 0 / 9 / 0 / 9 / 0 / 0, snapshot SHA-256
  `cd484a89c7c95f9dc1afebbccf705177487683bde7c1fdd99a674b0afeaff481`
  (`shasum -a 256 <wt>/__tests__/engine/__snapshots__/driftLedger.test.ts.snap`).
- **Referee ordering.** The store footer's referee peak and the scheduler's `ref_requirements_by_day`
  never disagree at any commit (`appPathParity`). T1–T8 do not change what either counts. T9, after the
  amendment commit, switches both together and is the only task that moves the snapshot, only in
  `refRequirementsByDay`. Any other snapshot move halts to the owner.
- **Test-first.** A task that creates a module first adds stubs with the declared signatures that return
  empty results, so each behaviour test fails on its assertion, not on a missing import. Confirm each
  failure reason. Characterisation tests (marked "must pass before and after") are not failing-first
  tests and must pass at both points.
- `src/engine/` stays pure. `as const` objects with derived unions, never enums. Every loop bounded.
- If a task changes per-event derivation (`deriveEventSchedule`), `__tests__/helpers/scenarios.ts` and
  `__tests__/store/factoryParity.test.ts` join its files and change in the same commit. None is expected to.
- Commands, never `cd`:
  - `timeout 300 pnpm -C <wt> --silent test --exclude 'tmp/**' > <wt>/tmp/test.log 2>&1`
  - `timeout 120 pnpm -C <wt> exec vitest run <file>`
  - `timeout 180 pnpm -C <wt> exec tsc -b > <wt>/tmp/tsc.log 2>&1`
  - `timeout 120 pnpm -C <wt> --silent lint > <wt>/tmp/lint.log 2>&1`
  - Live app: `pnpm -C <wt> dev --port 5188 --strictPort`, then
    `SMOKE_BASE=http://localhost:5188/piste-planner/ timeout 240 node <wt>/scripts/smoke.mjs`.
  - Read logs only on failure.
- Each task ends green on the full suite, `tsc -b` and lint. Its commit message records the snapshot SHA,
  files / tests counts and any deliberate correction.
- **Live smoke after every user-visible task** (constitution VI). From T5a on, each task's last step is a
  `live-smoke` run in its own Sonnet subagent: start the live app, extend `scripts/smoke.mjs` in place with
  the checks that task owns (never rewrite it), repair locators until two consecutive passes, and commit
  only when the driver changed ("017 Tn: smoke …").
- Dispatches may add tests in `__tests__` files outside a task's list when they cover that task's
  behaviour or a review fix. `src/` stays to the list. Name each such file in the commit.
- Scenario sweeps use `SCENARIO_IDS` (`src/data/tournaments.ts:16`) through `runAppPath`
  (`__tests__/helpers/appPath.ts`) and `TEMPLATES` (`src/engine/catalogue.ts`) over B1's settings (80
  strips, 12 video), as `tmp/measure017templates.test.ts` does.
- **Flighted fixtures** (`__tests__/helpers/flightedFixtures.ts`, created in T1, shared by T1–T4): load
  the B1 preset, then before any run call `useStore.getState().updateCompetition(id, partial)` with
  either `'D1-M-EPEE-IND'`, `{ flighted: true }` (310 fencers, many pools) or
  `'VET-M-SABRE-IND-VCMB'`, `{ fencer_count: 6, flighted: true }` (one pool, so FLIGHT_B is empty). If
  validation refuses either, halt to the owner.

## Review focus

Inputs the spec implies that no task's main tests reach, most likely first. Each is pinned by a test in
the owning task.

1. **An engine input the validity key misses.** One failing-first test per mutating action: Move day,
   `updatePlacement({ start_time })`, `updatePlacement({ strip_count })`, fencer count, flighted, deselect,
   a deselect and reselect that reorders competitions, a setting, day count, video count, and the pin
   toggle, which must keep the entry. Plus one test per `StoreState` field `buildTournamentConfig` reads,
   so a field the memo deps miss fails (T4).
2. **Two days whose clock-axis times overlap.** Kept times are minutes from each day's midnight, so the
   assigner keeps one resource state per day. A day-0 and a day-1 phase at the same minutes never
   contend (T3).
3. **A zero-length or zero-strip phase.** B8 VET-W-SABRE-IND-V80's DE_ROUND_OF_16 (3570–3570) and the
   one-pool flighted event's FLIGHT_B are never phases: absent from `phaseSpans`, the kept phases, the
   drawn blocks and `unseatedPhases` (T1, T2, T3).
4. **A flighted event**, which no scenario or template has. The shared fixtures (T1–T4).
5. **A board that was never run.** Component tests build placements without a run, so they are stale now.
   Tests that relied on packer overflow rows are rewritten against a run plus a Move day, or against the
   stale rule, not deleted (T5a, T5b, T6a, T6b, T7).
6. **A pin the engine could not seat**, or whose strip count is above the engine's cap, stays kept, with
   an empty strip set when unseated, and gets the pin wording, not the re-run wording (T2, T5a).
7. **A link from a stale sender**, and an empty board, carry no `run`, and the receiver opens stale (T8).
8. **A multi-run block.** Exactly one element per phase is in the accessibility tree, and an
   `exact: true` locator resolves to one button (T7).
9. **Memoization.** `lastRun` is in `scheduleDeps` itself, so every selector keyed on it redraws after a
   run that changes no placement (T4).
10. **A stale board with unseated phases.** The footer, the bands and the Findings panel all count 0
    unplaced from the model's one predicate (T4, T5a, T6a).
11. **Two hand moves on one day** behave as P5's answer says (T3).
12. **A load over a previous run.** A file or link with a matching config key but no valid `run` never
    keeps the previous `lastRun` (T8).

---

### T1: one unseated rule in the engine, and ids that sort the same everywhere

**Model:** Sonnet. **Reviews:** test-quality-reviewer, spec review. **Needs:** P7 answered.

**Files:**
- Create: `src/engine/unseated.ts`, `src/engine/order.ts`, `__tests__/helpers/flightedFixtures.ts`.
- Modify: `src/engine/stripSearch.ts` (`:211-224` subtracts events in `unseatedPhases` instead of reading
  `PINNED_UNCLAIMED`), `src/engine/concurrentScheduler.ts` (`buildPhaseNodes` at `:625` reads
  `phaseRequiresVideo`, the tie-breaks at `:854` and `:1524` use `compareIds`), `src/store/buildConfig.ts`
  (`:165` uses `compareIds`), `src/layout/segments.ts` (`eventTimeSegments` delegates to `phaseSpans`).
- Test: `__tests__/engine/unseated.test.ts` (new), `__tests__/engine/order.test.ts` (new),
  `__tests__/engine/stripSearch.test.ts`, `__tests__/layout/segments.test.ts`.

**Interfaces:**
- `PhaseSpan = { phase: Phase; start: number; end: number; stripCount: number }`.
- `phaseSpans(result: ScheduleResult): PhaseSpan[]` – the enumeration `eventTimeSegments` uses today
  (flights before pools), moved into the engine, skipping every span with `end === start`, not only DE
  ones (`segments.ts:57-78` skips zero-length DE spans only).
- `phaseKey(competitionId: string, phase: Phase): string`.
- `unseatedPhases(run: { schedule: Record<string, ScheduleResult>; strip_allocations:
  StripAllocation[][] }): Set<string>` – phase keys of spans with `stripCount > 0`, `end > start` and no
  allocation for that event and phase.
- `phaseRequiresVideo(phase: Phase, competition: Competition): boolean` – true only for
  DE_ROUND_OF_16 under `VideoPolicy.REQUIRED`, the rule at `concurrentScheduler.ts:625`.
- `compareIds(a: string, b: string): number` – code-point order, no locale.

- [ ] Add stubs, then write failing tests: `unseatedPhases` equals the `PINNED_UNCLAIMED` (competition,
  phase) set less zero-length phases after pin-all and pin-half re-runs on B1–B8 (counts
  8/14/10/12/3/37/8/48 and 0/1/0/2/0/9/0/10); it is empty after an unpinned run on B1–B8 and the 10
  templates; B8 V80's zero-length phase and the one-pool fixture's FLIGHT_B are in neither `phaseSpans` nor
  it; the many-pools fixture gives FLIGHT_A and FLIGHT_B spans; `compareIds` sorts every catalogue id in
  code-point order, which differs from `localeCompare(…, 'lt')` (premise) and equals
  `localeCompare(…, 'en')`. Must pass before and after: `searchStripCount` yields the same `placed`
  sequence on a pinned fixture, `eventTimeSegments` output is unchanged on B1–B8, the ledger is
  byte-identical.
- [ ] Confirm each behaviour test fails on its assertion.
- [ ] Implement.
- [ ] Full suite, `tsc -b`, lint. Snapshot SHA unchanged (a move halts). Commit: "017 T1: one
  unseated-phase rule in the engine, shared with Suggest, and locale-free id order".

### T2: the store keeps the last run

**Model:** Sonnet. **Reviews:** test-quality-reviewer, spec review.

**Files:**
- Create: `src/store/keptRun.ts`.
- Modify: `src/store/store.ts` (`lastRun`, `setLastRun` on the UI slice, not serialized, and
  `setPlacementsFromAuto` takes the run so both are one update), `src/store/runActions.ts`
  (`runScheduleAll` keeps the whole `scheduleAll` result).
- Test: `__tests__/store/keptRun.test.ts` (new), `__tests__/store/runActions.test.ts`,
  `__tests__/store/serialization.test.ts` (the payload does not change yet).

**Interfaces:**
- `KeptPhase = { phase: Phase; startMinutes: number; endMinutes: number; stripCount: number; strips:
  readonly number[] }`.
- `KeptEvent = { placementKey: { day: number; start_time: number; strip_count: number }; result:
  ScheduleResult; phases: KeptPhase[] }`, `result` on the clock axis.
- `KeptRun = { configKey: string; pins: PinnedPlacement[]; events: Record<string, KeptEvent> }`.
- `configKeyOf(config: TournamentConfig, competitions: Competition[]): string` – stable key order, arrays
  in their given order, non-finite numbers encoded distinctly from `null` and from each other (spec §2).
- `resultOnClockAxis(result: ScheduleResult): ScheduleResult` – every time field less
  `assigned_day × DAY_AXIS_SPACING_MINS`.
- `keepRun(run: { schedule; strip_allocations }, config, competitions, pins: readonly PinnedPlacement[]):
  KeptRun` – events with a pool start only, phases from `phaseSpans`, strips grouped from
  `strip_allocations` by event and phase. A pinned id's `placementKey` is its pin on the clock axis
  (`{ day: pin.day, start_time: pin.start_time − pin.day × DAY_AXIS_SPACING_MINS, strip_count:
  pin.strip_count }`). Every other id uses `placementFromResult` (`src/engine/derive.ts:66-76`).
- `setPlacementsFromAuto(placements, pinnedIds, lastRun: KeptRun | null)` – one `set()` for both.

Behaviour: `runScheduleAll` passes `keepRun(...)` built with the same pins it scheduled with, and
clears `lastRun` when `scheduleAll` throws. Placements and `AutoRunCounts` are unchanged.

- [ ] Add stubs, then write failing tests: on B1–B8 and the templates, kept phases equal the allocation
  intervals and strip counts, with no index overlap per day and video-required phases only on video
  strips; B8 V80's DE_ROUND_OF_16 is not a kept phase, `keepRun` does not throw on it, and the kept phases
  enumerate exactly `phaseSpans`' phases (148 on B8); a pinned event's `placementKey` equals its store
  placement after the run, including a pin whose `strip_count` is above the engine's cap (as in
  `appPathParity.test.ts:477`); a pinned event's result phase times equal `deriveEventSchedule`'s
  (`concurrentScheduler.ts:836-841` asserts it, nothing measures it); the many-pools fixture keeps FLIGHT_A
  and FLIGHT_B separately; `configKeyOf` is equal for equal inputs, differs for each input field, differs
  for `Infinity` against `null` and for a reordered competition list; a throwing run clears `lastRun`; a
  subscriber sees exactly one store update per run, with placements and `lastRun` together; `encodeToUrl`
  output is byte-identical.
- [ ] Confirm each fails for its stated reason.
- [ ] Implement.
- [ ] Full suite, `tsc -b`, lint. Snapshot SHA unchanged. Commit: "017 T2: the store keeps the last run".

### T3: the strip assigner

**Model:** Opus. **Reviews:** test-quality-reviewer, spec review. **Needs:** P5 answered.

**Files:**
- Create: `src/layout/strips.ts`.
- Test: `__tests__/layout/strips.test.ts` (new).

**Interfaces:**
- `DrawnEventInput = DerivedEventSchedule & { keptStrips: Readonly<Partial<Record<Phase, readonly
  number[]>>> | null }` – `null` for a derived event.
- `StripRun = { first: number; count: number }`.
- `DrawnBlock extends BlockPlacement` (`src/layout/lanes.ts:42`) with `strips: readonly number[]`, `runs:
  readonly StripRun[]` and `unseated: boolean`. Until T6b removes them, `firstStrip` is the first run's
  start (0 when unseated) and `overflow` equals `unseated` (T4 overrides it, see there), so code typed on
  `BlockPlacement` still compiles.
- `assignStrips(events: Record<string, DrawnEventInput>, config: TournamentConfig, competitions:
  Competition[]): DrawnBlock[]`.

Behaviour (spec §3): skips `day_out_of_range` events. Per day, one resource state (`createGlobalState`,
`resources.ts:57`). Kept phases are allocated on their own indices first. A kept index outside
`config.strips` throws a named error. Derived phases, from `phaseSpans`, ordered by (day, start, id with
`compareIds`, phase order), are offered to `findAvailableStripsInWindow` (`resources.ts:203`) with
`phaseRequiresVideo` and the day, and only its hit result is read. A hit is claimed with
`allocateInterval` (`resources.ts:87`), a miss is unseated with no occupancy. The candidate rule is never
copied. Runs are maximal consecutive index stretches. Output order is fixed.

- [ ] Add a stub, then write failing tests: kept phases keep their indices exactly; a derived phase takes
  the engine's candidate order (non-video first, video-only when required); no derived interval overlaps
  a kept interval on the same strip and day, and every kept phase's indices are identical with and without
  derived events present; a derived phase with no room holds nothing and is unseated, under the shared
  predicate (`stripCount > 0`, `end > start`); two derived events on one day give the result P5's answer
  fixes; review focus 2 and 3; non-contiguous sets give the right runs; the many-pools fixture's derived
  FLIGHT_B starts after `FLIGHT_BUFFER_MINS`, and the one-pool fixture's FLIGHT_B is never offered; a kept
  index past the strip count throws the named error; output is identical across two calls.
- [ ] Confirm each fails on its assertion.
- [ ] Implement.
- [ ] Full suite, `tsc -b`, lint. Snapshot SHA unchanged. Commit: "017 T3: the strip assigner seats kept
  phases on the scheduler's strips".

### T4: one drawn model

**Model:** Opus. **Reviews:** test-quality-reviewer, spec review.

**Files:**
- Modify: `src/store/derived.ts` (`selectDrawnSchedule`, `RunState`, and `state.lastRun` added to
  `scheduleDeps` itself at `:88-103`, which `daySummaryDeps` at `:692` spreads, so every selector keyed
  on either recomputes after a run).
- Test: `__tests__/store/drawnSchedule.test.ts` (new).

**Interfaces:**
- `RunState` – an `as const` object `{ FRESH: 'fresh', STALE: 'stale' }` with a derived union.
- `DrawnEventSchedule = DrawnEventInput & { source: 'kept' | 'derived' }`.
- `DrawnScheduleBlock = DrawnBlock & { countsAsUnplaced: boolean }` – `unseated` and the run state is
  fresh. Until T6b the transitional `overflow` on these blocks equals `countsAsUnplaced`, so any reader
  still typed on `BlockPlacement` counts the model's predicate.
- `DrawnSchedule = { config; competitions; events: Record<string, DrawnEventSchedule>; blocks:
  DrawnScheduleBlock[]; unplacedIds: ReadonlySet<string>; runState: RunState }`, a superset of
  `DerivedSchedule` (`derived.ts:47`). `unplacedIds` holds the events with a block that counts as
  unplaced.
- `selectDrawnSchedule(state: StoreState): DrawnSchedule`, memoized on `scheduleDeps`.

Behaviour (spec §2): stale when an in-range placement of a selected event exists and `lastRun` is null
or its `configKey` differs. A kept event needs a fresh state, a `lastRun` entry and an equal
`placementKey`, and draws the kept result (`day_out_of_range: false`) and strips. Every other placed event
is `deriveEventSchedule` output with `keptStrips: null`. `blocks` is `assignStrips` over these events.

- [ ] Add a stub, then write failing tests: after a run every event is kept on B1–B8; review focus 1
  (only the touched event goes derived for placement edits, the whole board goes stale for input edits,
  a pin toggle changes nothing, every `StoreState` field `buildTournamentConfig` reads makes the board
  stale when changed); review focus 9 (two runs with different output and the same placements: each of
  `selectDrawnSchedule`, `selectAllFindings`, `selectDerivedFindings`, `selectFooterMetrics`,
  `selectPlacementCounts` and `selectDaySummaries` returns a new value); review focus 10 at model level
  (a stale board with unseated phases has `unplacedIds` empty and no block counting as unplaced); a board
  with placements and no run is stale; an empty board is fresh; a board whose only placements belong to
  deselected events is fresh.
- [ ] Confirm each fails for its stated reason.
- [ ] Implement.
- [ ] Full suite, `tsc -b`, lint. Snapshot SHA unchanged. Commit: "017 T4: one drawn model decides what
  the board shows".

### T5a: what is unplaced, read from the drawn model

**Model:** Opus. **Reviews:** test-quality-reviewer, spec review, react-code-reviewer (FindingsPanel
test). **Needs:** P3 and P4 answered.

**Files:**
- Modify: `src/store/derived.ts` (`computePlacementCounts` at `:352` and `computeAllFindings`' Unplaced
  rows at `:578-582` read `unplacedIds` and the drawn blocks, not `assignStripLanes`. The stale notice row
  per P4. `buildRefDemandByDay` and `selectDerivedRefRequirements` keep reading `selectDerivedSchedule`,
  referee ordering), `__tests__/helpers/appPath.ts` (`AppPathResult` gains the drawn footer counts).
- Test: `__tests__/store/findings.test.ts` (Unplaced cases, off `assignStripLanes` at `:7`),
  `__tests__/store/derived.test.ts`, `__tests__/store/appPathParity.test.ts`,
  `__tests__/components/workbench/panels/FindingsPanel.test.tsx` (`:63`, `:169`, `:233`),
  `__tests__/store/dismissals.test.ts` (`:233-236`), `__tests__/components/workbench/StatusFooter.test.tsx`.

Behaviour (spec §4): one Unplaced row per unplaced event, id `unplaced:<id>:room`, `where` "Day N ·
<label>", the re-run wording for a derived event and P3's wording for a kept one (review focus 6). While
stale, P4's rules. Between T5a and T6a the canvas and its bands still draw the packer, so they may show
overflow the footer no longer counts. T6a and T6b close that.

- [ ] Write failing tests: boot footers 24/0, 24/0, 24/0, 21/9, 12/0, 45/9, 18/0, 53/0 equal to the
  engine's counts; Move day of every event to every other day on B1–B8 changes no kept event's times or
  strips and gives the moved event, when unseated, one row with the re-run wording; headline move reads
  B1 23/1 with one re-run row and Auto-assign then gives 24/0; a pin-all re-run gives one pin-wording row
  per event with an unseated phase and none with the re-run wording; a settings edit after a run shows no
  unseated rows, keeps no-placement and out-of-range rows, and shows the P4 stale row; the footer's
  referee peak is unchanged at boot on B1–B8. Rebuild the FindingsPanel and dismissals fixtures as
  `runScheduleAll` plus one Move day that cannot fit, so the row comes from an unseated derived event with
  the new id and wording, and keep one case asserting a run-less (stale) board shows no unseated row.
- [ ] Confirm each fails for its stated reason.
- [ ] Implement. Rewrite, not delete, tests that relied on packer overflow (review focus 5).
- [ ] Full suite, `tsc -b`, lint. Snapshot SHA unchanged. Commit: "017 T5a: the footer and the Findings
  panel count what the drawn model leaves unplaced". Then live smoke: `:280-282` becomes an assertion of
  B1 `24 placed · 0 unplaced` ("017 T5a: smoke asserts B1 24 placed").

### T5b: finish times and rules read the drawn model

**Model:** Opus. **Reviews:** test-quality-reviewer, spec review.

**Files:**
- Modify: `src/store/derived.ts` (`computeFooterMetrics` finish and strip utilization at `:275-340`
  adding `strips.length`, the late-finish rows at `:648-662` with the culprit typed `DrawnScheduleBlock`,
  `placementFindings` at `:161` and `computeDerivedFindings` at `:186` on the drawn model, and the
  `assignStripLanes` value import at `:26` removed).
- Test: `__tests__/store/footerMetrics.test.ts`, `__tests__/store/findings.test.ts` (late-finish cases),
  `__tests__/store/derived.test.ts`, `__tests__/store/appPathParity.test.ts`.

- [ ] Write failing tests: boot invariants on B1–B8 and the templates (spec pass conditions); the app's
  first and last day WARN equal the scheduler's at boot (halt if not); late-finish rows follow the kept DE
  ends; strip utilization never counts an unseated block's strips.
- [ ] Confirm each fails for its stated reason.
- [ ] Implement.
- [ ] Full suite, `tsc -b`, lint. Snapshot SHA unchanged. Commit: "017 T5b: finish times and rules read
  the drawn model", with late-finish row counts per scenario at boot, before and after. Then live smoke
  runs the driver unchanged and repairs locators ("017 T5b: smoke follows the drawn finish times").

### T6a: the readers around the canvas take the drawn model

**Model:** Opus. **Reviews:** react-code-reviewer (Opus), test-quality-reviewer, spec review.

**Files:**
- Modify: `src/components/workbench/CenterView.tsx` (`:142-170`, the committed model holds a
  `DrawnSchedule`, keeping FR-042's settle and freeze), `src/components/canvas/Canvas.tsx` (`:374-377`,
  the day bands read the committed model's `blocks`; drawing is unchanged until T6b), `src/store/derived.ts`
  (`daySummariesFromBlocks` at `:782`, `peakStripsOnDay` at `:750` and `computeDaySummaries` at `:817`
  take `DrawnScheduleBlock[]`, count distinct `unplacedIds` events per day and add `strips.length`, and
  the `BlockPlacement` import at `:27` goes), `src/components/sections/ScheduleOutput.tsx`,
  `src/components/workbench/DetailStrip.tsx` (the `assignStripLanes` import at `:8` goes, `:110-121`
  strip label from runs, pills from the drawn result), `src/lib/placementLabels.ts`.
- Test: `__tests__/store/daySummaries.test.ts` (off `assignStripLanes` at `:7`),
  `__tests__/components/workbench/DetailStrip.test.tsx` (off `assignStripLanes` at `:10`),
  `__tests__/components/scheduleOutput.test.tsx` (not `:163`, which T7 owns),
  `__tests__/components/workbench/recompute.test.tsx` or `WorkbenchShell.test.tsx` (the committed model),
  `__tests__/components/canvas/Canvas.test.tsx` (bands).

- [ ] Write failing tests: after the headline move the day band and the footer both count 1; after a
  settings edit the bands count 0 unplaced; a band's peak strips never exceed the strip count; the
  schedule table and the detail pills show kept times; the detail strip label names the drawn strips.
- [ ] Confirm each fails for its stated reason.
- [ ] Implement.
- [ ] Full suite, `tsc -b`, lint. Snapshot SHA unchanged. Commit: "017 T6a: the schedule table, the
  detail strip and the day bands read the drawn model". Then live smoke runs the driver unchanged and
  repairs locators ("017 T6a: smoke follows the drawn readers").

### T6b: the canvas draws the scheduler's strips

**Model:** Sonnet. **Reviews:** react-code-reviewer (Opus), test-quality-reviewer.

**Files:**
- Modify: `src/components/canvas/Canvas.tsx` (`:369-372` and `:385-463` draw the committed `blocks` and
  the overflow lane, `assignStripLanes` import at `:5` goes, and the file's own local `interface
  DrawnBlock` at `:125` is renamed, since `strips.ts` exports that name), `src/components/canvas/Block.tsx` (one rect
  per run, the DOM contract, the `BlockPlacement` import at `:5` goes),
  `src/components/canvas/CanvasTooltip.tsx` (`:6` import, `:179-181` read runs and `unseated`),
  `src/layout/strips.ts` (drop `firstStrip`, `overflow` and the `BlockPlacement` base),
  `src/store/derived.ts` (T4's transitional `overflow` assignment goes).
- Delete: `src/layout/lanes.ts`, `__tests__/layout/lanes.test.ts` (cases still meaningful move to
  `strips.test.ts`).
- Test: `__tests__/components/canvas/Canvas.test.tsx`, `Block.test.tsx`, `CanvasTooltip.test.tsx` (`:9`,
  `:61-62`, `:140-141`), `viewEquivalence.test.tsx`, `__tests__/components/workbench/UnplacedDock.test.tsx`.

**Interfaces (DOM contract, spec §6):** a phase's first run carries `data-event-block`, `data-event-id`,
`data-phase`, `data-strips` (comma-joined indices, empty when unseated), `data-strip-count` and
`data-unseated`. Continuations carry `data-block-run` only, never `data-event-block`. The overflow lane is
`[data-overflow-lane][data-day]`. `data-overflow` and `data-first-strip` go.

- [ ] Write failing tests: a kept phase with a split index set draws one rect per run at those strips and
  one `[data-event-block]`; an unseated phase draws in its day's overflow lane at its time; the tooltip
  names the drawn strips.
- [ ] Confirm each fails for its stated reason.
- [ ] Implement. Before deleting `lanes.ts`, `grep -rn "layout/lanes\|firstStrip\|\.overflow\b" <wt>/src
  <wt>/__tests__` returns nothing but CSS `overflow` style properties.
- [ ] Full suite, `tsc -b`, lint. Snapshot SHA unchanged. Commit: "017 T6b: the canvas draws the
  scheduler's strips". Then live smoke repairs locators and adds: 0 `[data-event-block][data-unseated="true"]`
  at boot ("017 T6b: smoke locators follow the drawn canvas").

### T7: keyboard blocks, the findings edge and the stale banner

**Model:** Sonnet. **Reviews:** react-code-reviewer (Opus), test-quality-reviewer. **Needs:** P4 answered.

**Files:**
- Modify: `src/components/canvas/Block.tsx` (button root, continuation runs, `:204` exemption removed),
  `src/components/workbench/CenterView.tsx` (the banner, or a new `StaleBanner.tsx` beside it, reading the
  committed model's `runState`), `scripts/smoke.mjs` (by the live-smoke subagent, below).
- Test: `__tests__/components/canvas/Block.test.tsx`, `Canvas.test.tsx`,
  `__tests__/components/workbench/recompute.test.tsx` or `WorkbenchShell.test.tsx`,
  `__tests__/components/scheduleOutput.test.tsx` (`:163`).

Behaviour (spec §6): each phase is one `<button type="button">` on its first run, aria-label kept,
outline focus ring. Continuations are `aria-hidden`, `tabIndex={-1}`, same fill, click selects, shared
hover, selection and edge. Every warned block draws the edge. The banner is `role="status"` with
`data-stale-banner` and "Stale – re-run Auto-assign" while the committed run state is stale. While a
Blocking finding freezes the committed model, it keeps the frozen state.

- [ ] Write failing tests: one button per phase and none per continuation (review focus 8); Tab reaches
  every block in order and Enter selects and opens the detail panel; an overflow-lane block that is warned
  draws the edge; the banner shows after a settings edit, goes after Auto-assign, and follows the committed
  model, not the live one; `scheduleOutput.test.tsx:163` ("renders no staleness banner — placements are
  always current") is renamed and scoped to a fresh run, with the opposite case beside it.
- [ ] Confirm each fails for its stated reason.
- [ ] Implement.
- [ ] Full suite, `tsc -b`, lint. Snapshot SHA unchanged. Commit: "017 T7: blocks are buttons, every
  warning draws its edge, and a stale board says so". Then live smoke, extending in place:
  - `openPanel` (`:175`) uses `exact: true`.
  - Every `[data-event-block]` is a `button` reachable by Tab, and Enter opens the detail panel.
  - `:563-568` narrows: on a fresh board just after Auto-assign there is no `[data-stale-banner]`, and
    'outdated', 'out of date' and 'Run Validate' stay banned. The comment names the cause (017 R5 brought
    a stale state back). A settings edit then shows the banner (and the P4 Findings row, if approved).
  - 016 check 1 (`:1313-1341`) ties its evidence to the hard-pair row's `data-finding-id`, not to
    `data-warned` alone, since an unseated block is now warned by its Unplaced row.
  - Commit: "017 T7: smoke checks buttons and the stale banner".

### T8: a shared link or saved file replays the sender's run

**Model:** Sonnet. **Reviews:** test-quality-reviewer, spec review, react-code-reviewer (ExportPopover).
**Needs:** P6 answered.

**Files:**
- Modify: `src/store/serialization.ts` (`SerializedState.run?`, `VALID_TOP_LEVEL_KEYS`, validation,
  `deserializeState` at `:306`), `src/store/boot.ts` (`:24-37` loads through `applyLoadedState`),
  `src/store/exportActions.ts` (`applyLoadedState` at `:46-48`), `src/store/runActions.ts` (`replayRun`),
  `src/components/workbench/ExportPopover.tsx` (`:53` passes the run, the refused-run notice).
- Test: `__tests__/store/serialization.test.ts`, `__tests__/components/workbench/boot.test.tsx`,
  `__tests__/store/runActions.test.ts`, `__tests__/store/exportActions.test.ts`,
  `__tests__/components/workbench/ExportPopover.test.tsx`.

**Interfaces:**
- `SerializedState.run?: PinnedPlacement[]`. `serializeState` writes it only when `lastRun !== null` and
  `lastRun.configKey === configKeyOf(...buildTournamentConfig(state))`, computed directly, not through
  `selectDrawnSchedule` (no `serialization.ts` to `derived.ts` import, and confirm no import cycle).
- `deserializeState(json): { state: Partial<StoreState>; droppedPlacements: string[]; run:
  PinnedPlacement[] | null; runRefused: string | null } | { error: string }` – the whole `run` is refused
  on any invalid entry (spec §5), with the reason in `runRefused`.
- `replayRun(state: StoreState, pins: readonly PinnedPlacement[]): void` – `scheduleAll` with `pins`,
  then `setLastRun(keepRun(..., pins))`. It writes no placement.
- `applyLoadedState(state: Partial<StoreState>, run: readonly PinnedPlacement[] | null): void` – applies
  the state, then `replayRun` with a valid run, else `setLastRun(null)`. Boot and file load both use it.

- [ ] Write failing tests: the receiver's `selectDrawnSchedule` deep-equals the sender's, by link and by
  file, before and after one Move day; review focus 7 (a stale sender and an empty board write no `run`,
  and an empty board does not throw); review focus 12 (a file loaded over a run, with an equal config key
  and no `run`, leaves `lastRun` null); each invalid-entry kind (unknown id, unselected id, duplicate id,
  day out of range, `start_time` off its day's axis, `strip_count` below 1) refuses the whole `run`,
  reports it, and opens stale; a link without `run` and with placements opens stale.
- [ ] Confirm each fails for its stated reason.
- [ ] Implement.
- [ ] Full suite, `tsc -b`, lint. Snapshot SHA unchanged. Commit: "017 T8: a shared link or saved file
  replays the sender's run". Then live smoke runs the existing share-link steps (`smoke.mjs:165-175`
  pages 2 and 3), repairs locators, and adds: a `#config=` link opened in a second page draws the same
  `[data-event-block]` set (id, phase, `data-strips`, `data-start`), before and after one Move day
  ("017 T8: smoke checks the link replay").

### Amendment commit (before T9)

The orchestrator commits the spec's METHODOLOGY wording (P1) verbatim, and only once the owner has
approved it in this session: "Amend METHODOLOGY.md: ref demand counts the scheduler's timeline after a
run (017)". No approval, no T9.

### T9: one referee number on the scheduler's timeline

**Model:** Opus. **Reviews:** five drift judges (below), test-quality-reviewer, spec review.

**Files:**
- Modify: `src/engine/concurrentScheduler.ts` (`:1559-1594`, counts its own results without the axis
  shift, skipping `unseatedPhases`), `src/engine/refs.ts` (`refDemandFromSchedule` gains `skip`),
  `src/store/derived.ts` (`buildRefDemandByDay` and `selectDerivedRefRequirements` read the drawn model),
  `scripts/smoke.mjs` (`:290-302`, by the live-smoke subagent, below).
- Test: `__tests__/engine/refs.test.ts`, `__tests__/helpers/appPath.test.ts` (`:158-175` B1 pin),
  `__tests__/store/appPathParity.test.ts` (`:472-490` included), `__tests__/store/derived.test.ts`,
  `__tests__/engine/__snapshots__/driftLedger.test.ts.snap`.

**Interfaces:**
- `refDemandFromSchedule(results: ScheduleResult[], config: TournamentConfig, competitions:
  Competition[], skip?: ReadonlySet<string>): Record<number, RefDemandByDay>` – `skip` holds `phaseKey`s.
  Each pushed interval maps to one phase (`refs.ts:141-168`): `flight_a_*` FLIGHT_A, `flight_b_*`
  FLIGHT_B, `pool_*` POOLS, `de_*` DE, `de_prelims_*` DE_PRELIMS, `de_round_of_16_*` DE_ROUND_OF_16.
- `buildRefDemandByDay(drawn: DrawnSchedule): Record<number, RefDemandByDay>` – kept and derived
  results, skipping only blocks with `countsAsUnplaced`. While fresh that skips unseated phases. While
  stale it skips nothing (spec §7, P4 (c)).

- [ ] Read the header of `__tests__/engine/driftLedger.test.ts` first and follow it. Write failing tests:
  per-day peaks equal a sweep of the scheduler's own intervals; the footer peak equals the reported peak
  at boot on B1–B8 and with four hand-moved pins (`appPathParity.test.ts:472-490`); a pinned-unclaimed
  phase counts no referees on both sides; after a hand move the footer counts the moved event at its
  derived times, less an unseated phase; after a fencer-count edit (stale) the footer counts every derived
  phase, including one `assignStrips` cannot seat.
- [ ] Confirm they fail on exactly the spec's days with the spec's numbers.
- [ ] Implement. Update the snapshot with `timeout 120 pnpm -C <wt> exec vitest run
  __tests__/engine/driftLedger.test.ts -u`. Expected SHA `7e2db75c38bb…`. Re-pin appPath's B1. Write a
  throwaway script in `<wt>/tmp/` (ignored, never committed) that compares the new snapshot with
  `git -C <wt> show b84be7e291:__tests__/engine/__snapshots__/driftLedger.test.ts.snap` and with the
  pre-T9 one, lists every changed line by scenario, day and field into `<wt>/tmp/017-t9-ledger-diff.txt`,
  and exits non-zero when a held scenario-day or any field outside `refRequirementsByDay` differs.
- [ ] Full suite, `tsc -b`, lint. Commit: "017 T9: the referee peak is the scheduler's timeline", with
  old and new totals, sabre peaks and peak times per scenario-day, the check's result and both SHA-256
  digests. Then live smoke: `:290-302`, B1's boot peak 218 becomes 210 with the cause in the comment
  ("017 T9: smoke expects the timeline's referee peak").

Judges, at most four scenario-days each, read-only, in parallel: (1) B1 d1, d2, B2 d0, d3. (2) B4 d1, d2,
B6 d0, d1. (3) B6 d2, B7 d0, d2, B8 d0. (4) B8 d1 (sabre only), d2. (5) reads only
`tmp/017-t9-ledger-diff.txt` and the script's exit code, and confirms every held day and every field
outside `refRequirementsByDay` is unchanged.

### Task S: the final live smoke

**Model:** Sonnet, `live-smoke` skill, in a subagent. **Files:** `scripts/smoke.mjs`, extended in place,
never rewritten.

- [ ] Start the live app and run the driver (Global constraints).
- [ ] Extend: headline Move day (first id to the next day) shows one Unplaced row with the re-run wording,
  and Auto-assign clears it. Every earlier task's checks stay.
- [ ] Repair locators until two consecutive full passes.
- [ ] Commit: "017 Task S: the live smoke checks the headline move".

### Task D: docs

**Model:** Sonnet. Documentation and one source comment, no tests. **Needs:** P2 answered.

**Files:** `docs/design/backlog.md`, `docs/design/competition-planner-workbench.md`,
`docs/design/workbench-design-alignment-2026-09-07.md` (`:409`, owner-approved text only),
`src/engine/derive.ts` (header comment `:1-13` only).

- [ ] Backlog: §The canvas calls events unplaced (`:1296`, the `19 placed · 5 unplaced` at `:1302`
  becomes 15/9, the cause is timing with the packer's fragmentation on top, closed by 017); §A placed
  block cannot be selected (`:1326`) closed; §The engine and the store both report a pin collision
  (`:1362`) closed (one `unseatedPhases`, one Unplaced row); §The canvas draws phases without the
  scheduler's waits (`:209`) closed with the rejected alternatives and their numbers (spec §What planning
  measured); a new entry for the pin-in-place-then-re-run regression (R3) beside §Auto-assign does not
  hold an unpinned predecessor (`:1339`).
- [ ] Roadmap: row 017 (`:278`) delivered with what it now includes; row 025 (`:286`) folded into 017;
  row 020 (`:281`) keeps its scope with a note that `configKey` is its hook. The design rules at
  `:102-103` ("Block geometry is derived … never stored") and `:109-110` ("Nothing is ever stale when
  results are derived") each gain one sentence pointing to 017: after a run, geometry comes from the
  in-memory kept run (R1), and a board is stale while the engine's inputs differ from the last run's (R5).
- [ ] D2 row only with the text the owner approved. `derive.ts` header: the canvas uses
  `deriveEventSchedule` only for hand-moved or stale events, and kept events draw the scheduler's times.
- [ ] Snapshot SHA unchanged. Commit: "017 Task D: backlog, roadmap and D2 brought up to date with 017".

### Task H: handoff

**Model:** Sonnet. **Files:** `specs/017-canvas-tells-truth/handoff.md` (new, 016's handoff shape).

- [ ] What changed in product terms, the headline table (boot footers, referee peaks, SHA), per-task
  commits, the measurement chain and the test count chain (files / tests per commit, `tmp/**` excluded),
  reviews, owner rulings and the P1–P7 answers, decisions made on the owner's behalf with their costs,
  left unfixed, and the resume prompt.
- [ ] Commit: "017 Task H: the handoff".

### Task M: the merge check

**Model:** Sonnet.

- [ ] `git -C <wt> merge-tree --write-tree main 017-canvas-tells-truth`. Check the tree out in a detached
  throwaway worktree and run the full suite, `tsc -b`, lint and the snapshot SHA there (it has no `tmp/`,
  so its counts are clean either way). Resolve any conflict there and report it for the owner.
- [ ] Record the tree id and results in the handoff's Merge section. Commit: "017 Task M: record the
  merge-tree check in the handoff". Remove the throwaway worktree.

## Review waves

After each task: the listed reviewers in parallel, one bundled fix dispatch with every accepted issue, a
re-review of the fixed items, and a review-fix commit ("017 Tn: review fixes"). Spec reviewers check the
diff against `spec.md`. Drift judges get at most four scenario items each.

## Self-review (done at writing)

- Spec coverage: §1 → T2, §2 → T4, §3 → T1 and T3, §4 → T5a, T5b and T6a, §5 → T1, T4, T5a and T8,
  §6 → T6b and T7, §7 → T9, P1–P7 → S1 before T1, the amendment → its own commit, D2, backlog and roadmap
  → D, pass conditions → T5a–T9 and S.
- Interfaces: T1's helpers feed T2, T3 and T9, `keepRun` (T2) feeds T4 and T8, `assignStrips` (T3) feeds
  T4 and T6b, `selectDrawnSchedule` (T4) feeds T5a–T9. `DrawnBlock` extends `BlockPlacement` until T6b,
  with `overflow` equal to the model's predicate from T4, so no reader typed on `BlockPlacement` breaks
  before T6b. The last `src/layout/lanes.ts` importers go in T5b (`derived.ts` value import), T6a
  (`derived.ts` type import, `DetailStrip.tsx`) and T6b (`Canvas.tsx`, `Block.tsx`, `CanvasTooltip.tsx`).
