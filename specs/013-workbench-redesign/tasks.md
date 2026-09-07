# Tasks: The workbench is rebuilt on the approved design

**Feature**: `013-workbench-redesign`
**Input**: [spec.md](./spec.md), [plan.md](./plan.md) §Phase sequence, [research.md](./research.md) D1–D18, [data-model.md](./data-model.md), [contracts/ui-contract.md](./contracts/ui-contract.md), [contracts/engine-contract.md](./contracts/engine-contract.md), [quickstart.md](./quickstart.md)
**Record**: [docs/design/workbench-design-alignment-2026-09-07.md](../../docs/design/workbench-design-alignment-2026-09-07.md) §6 (what is retired), §9 (decisions)

## Format: `[ID] [P?] [Story] Description`

- **[P]** – touches files no other task in its phase touches. May be dispatched
  beside the other `[P]` tasks of the same phase. When `[P]` tasks run at once,
  none of them commits and the next unmarked task's checkpoint commits them all.
- **[US1]–[US7]** – the user story the task serves. Phase numbers follow
  plan.md §Phase sequence: phase 0 is setup, phases 1–7 are stories 1–7, phase
  8 is close-out.
- **(subagent commits)** – a checkpoint. The subagent commits to
  `013-workbench-redesign` before returning. Unmarked tasks do not commit.
- **(Opus)** – dispatch on Opus. Everything else is Sonnet.
- **(drift)** – runs the drift ledger before and after, per standing rule 3.
- **(dispatched)** – iterates, so it runs in a subagent whatever its model.
- **(user judges)** – the orchestrator stops and hands the result to the
  product owner.

## Standing rules for every phase

1. **The worktree is the workspace.** All work happens in
   `/Users/noahlz/projects/piste-planner-013-workbench-redesign` on branch
   `013-workbench-redesign`, cut from `main` at `3cee79e1e8`. No push, no
   merge, no rebase, no amend, no branch deletion, no commit to `main`
   ([research D16](./research.md), constitution §Git Ownership).
2. **Test-first.** Every implementation task has a red test before it that has
   been run and seen to fail for the stated reason. "Failed for the stated
   reason" means the failure message names what the task predicted, not merely
   that something was red. A red-test task and the implementation task that
   follows it may be one dispatch when together they are four steps or fewer.
3. **The drift gate.** Every task marked *(drift)* runs
   `__tests__/engine/driftLedger.test.ts` immediately before its edit and again
   after, and `__tests__/store/appPathParity.test.ts` with it. Its commit
   message carries the eight scheduled counts before and after, the snapshot
   fields that moved by name and scenario, one sentence per moved field naming
   the line that produced it, and an explicit "nothing moved" when nothing did.
   **In this feature no scheduled count may move at all on the no-pins path
   (FR-058)** – stricter than the floors. Never edit a floor. Never run
   `vitest -u` before the diff has been read.
4. **Delete in the task that replaces** (FR-066, [research D13](./research.md)).
   No task deletes a component, store field, enum member, token or test
   without shipping its replacement in the same commit. No test file is
   triaged: each is re-targeted at what replaces it, at the path D13's map
   names. A retired name that survives a phase is a duplicate control for the
   length of the next one, so every phase ends with the quickstart §2 grep
   restricted to that phase's words.
5. **Re-point the driver, never rewrite it** (FR-067, [research D14](./research.md)).
   `scripts/smoke.mjs` is edited in place in the task that reshapes a control
   it locates. Its structure, boot-count floor, four `pressSuggest` calls
   (`:367`, `:786`, `:863`, `:912`) and share round-trip stay. Driver repair is
   dispatched because locator repair iterates.
6. **Reviews.** Dispatch `test-quality-reviewer` after any task that adds or
   edits tests, and `react-code-reviewer` after any task touching a `.tsx`
   file – most of them.
7. **The engine stays pure** (constitution I). Nothing under `src/engine/`
   imports React or reads the store. `src/layout/` is pure too. `buildConfig.ts`
   is the only bridge.
8. **Every loop is bounded before entry** (constitution IV). The pre-claim pass
   is one attempt per phase per pin. The debounce and the reveal delay are
   timers.
9. **No enum, namespace or parameter property** (constitution V). New unions
   are `as const` objects with derived types.
10. **Commands** (from the worktree root):
    `timeout 120 pnpm --silent test > ./tmp/test.log 2>&1`,
    `timeout 120 pnpm --silent vitest run <path> > ./tmp/test.log 2>&1`,
    `timeout 180 pnpm exec tsc -b > ./tmp/tsc.log 2>&1`,
    `timeout 120 pnpm --silent lint > ./tmp/lint.log 2>&1`. Read logs only on
    failure.
11. **Measurements win.** Where a measurement disagrees with a number in this
    file, in `spec.md` or in `data-model.md`, the measurement is right and the
    disagreement is recorded in the commit message. Do not adjust a fixture to
    reach a predicted number.
12. **Every time shown is 24-hour** (FR-041). No affordance suggests a block
    drags (FR-043). No new dependency (plan.md §Technical Context).

## Decisions made while writing this file

Eight sequencing calls plan.md's table leaves open, each settled by FR-066 or
by what the code shows. None changes what is built.

1. **`Rail.tsx` and `RailPanel.tsx` go in phase 1, not phase 2.** They are the
   old rail's chrome, and plan.md's prose says phase 1 deletes the chrome. The
   five old section components are mounted directly in the new panel host by
   panel id – Tournament → `TournamentSetup`, Strips → `StripSetup` and
   `AdvancedPanel`, Events → `CompetitionMatrix`, `FencerCounts` and
   `CompetitionOverrides`, Findings → `AnalysisOutput`, Settings → the old
   `SettingsPanel` – so no control is missing, and phase 2 replaces them one
   panel at a time.
2. **`AnalysisOutput` survives to phase 5.** Plan.md's phase-1 cell lists it
   deleted, but its replacement is `FindingsPanel`, which phase 5 builds.
   FR-066 wins: phase 1 re-homes it behind the rail's Findings button, phase 4
   strips its flighting-suggestion rows, phase 5 deletes it.
3. **`viewState.ts` is reshaped in three phases, not rewritten once.** Each
   phase removes the fields whose surface it deletes and adds the fields whose
   surface it builds: phase 1 (`panel`, `panelDocked` in; `drawerHeight`,
   `scorecardExpanded` out), phase 3 (`zoomStep`, `fitting` in;
   `rowHeightStep`, `timeZoom`, `timeScroll`, `rowScroll` out), phase 4
   (`detailCollapsed` in). Data-model §2 is the end state.
4. **`selectDaySummaries` is built in phase 3.** The day band (FR-039) needs
   events, finish, peak strips and the findings count in the phase that draws
   it. Its `findings` column reads the current derived findings in phase 3 and
   is re-pointed at `selectFindings` in phase 5.
5. **`selectScorecardMetrics` becomes `selectFooterMetrics`.** Quickstart §2's
   grep for `Scorecard` would otherwise match the selector and its type after
   the component is gone. The three metrics keep their ids.
6. **Pin needs its own action.** `updatePlacement` marks a placement manual
   and pinned, so toggling Pin off through it would mark an auto placement
   manual. `setPinned(id, pinned)` on `PlacementsSlice` flips the flag alone.
7. **The driver's `Strip count` locator moves in phase 1.** D14 places it in
   phase 2, but the top bar that carries it is deleted in phase 1. It
   re-points to the old `StripSetup`'s "Number of strips" behind the Strips
   rail button in phase 1, and that name survives phase 2 unchanged.
8. **Selection and the jump arrive apart.** `selectedCompetitionId` and
   `selectCompetition` come with the detail strip (phase 4). `jumpNonce` and
   `jumpToCompetition` come with Show on grid (phase 5).

---

## Phase 0: Setup and foundation

**Purpose**: the workspace, the drift instrument, and the two structural moves
every story reads. Nothing is deleted in this phase.

- [ ] **T001** Create the workspace. From the main checkout run
  `git worktree add /Users/noahlz/projects/piste-planner-013-workbench-redesign -b 013-workbench-redesign 3cee79e1e8`,
  then `pnpm install` in the worktree. If `specs/013-workbench-redesign/tasks.md`
  is uncommitted in the main checkout, copy it into the worktree and leave the
  main checkout's copy in place – T043's merge instructions must name it.
  Record `pnpm test` file and test counts, `tsc -b` and `lint` status as the
  branch's starting numbers. Commit as the branch's first commit
  *(subagent commits)*

- [ ] **T002** Write `specs/013-workbench-redesign/drift-baseline.md` before any
  `src/engine/` edit (plan.md §The drift instrument). Run the ledger and record
  per B1–B8 scenario: the scheduled count, the ERROR and WARN counts, and the
  `stripRecommendation` value, all read from
  `__tests__/engine/__snapshots__/driftLedger.test.ts.snap`, plus that file's
  SHA-256. Run `__tests__/store/appPathParity.test.ts` and record that it
  passes. Record the four Suggest counts the driver's comments carry at
  `scripts/smoke.mjs:367`, `:786`, `:863` and `:912` – NAC Youth's is expected
  to read 63 here and 66 after phase 2 ([research D14](./research.md))
  *(subagent commits)*

- [ ] **T003** Move the two shared layout modules to `src/layout/`
  ([research D6](./research.md)). Red first: move
  `__tests__/components/canvas/geometry.test.ts` to
  `__tests__/layout/segments.test.ts` and `__tests__/components/canvas/lanes.test.ts`
  to `__tests__/layout/lanes.test.ts`, keeping every case that exercises
  `eventTimeSegments`, `TimeSegment`, `BlockPlacement` and `assignStripLanes`,
  and re-point their imports at `src/layout/segments.ts` and
  `src/layout/lanes.ts`. Run: both fail because the modules do not exist. Then
  move `eventTimeSegments` and `TimeSegment` (`src/components/canvas/geometry.ts:95–122`)
  into `src/layout/segments.ts` and the whole of `src/components/canvas/lanes.ts`
  into `src/layout/lanes.ts`, and re-point every importer (`src/store/derived.ts:24`,
  `MatrixCanvas.tsx`, `blockLabels.ts`, `UnplacedTray.tsx`, and whatever else
  `grep -rn "canvas/geometry\|canvas/lanes" src __tests__` lists). The pixel
  helpers at `geometry.ts:37–85` (`pxPerMinute`, `blockX`, `blockWidth`,
  `ROW_HEIGHT_PX`, `blockY`, `blockHeight`) stay in `components/canvas/` – T027
  deletes them with the SVG canvas. The cases that covered them stay in a
  trimmed `__tests__/components/canvas/geometry.test.ts` until T027. Delete
  `src/components/canvas/lanes.ts`. Neither new module imports React or the
  store

- [ ] **T004** Extend the select wrapper ([research D12](./research.md)). Red
  first: `src/components/ui/__tests__/select.test.tsx` renders a select with
  two groups and asserts each group's label is in the document and each option
  sits under its group. Run: fails because `SelectGroup` and `SelectLabel` are
  not exported. Then add both to `src/components/ui/select.tsx` over Radix's
  `Select.Group` and `Select.Label`, already in the `radix-ui` package, and
  export them at `select.tsx:142`

**Checkpoint**: `tsc -b`, `lint` and the full suite green at T001's counts plus
T004's cases, and the two layout files pass from `__tests__/layout/`
*(subagent commits)*.

---

## Phase 1: US1 – One screen (P1) 🎯 MVP

**Story goal**: one header, one dock, one rail with a panel host, one footer,
an error boundary, and every top-bar, drawer and scorecard surface gone with
its store fields. The old rail's five section components survive inside the
new panel host until phase 2 replaces them (decision 1).

**Independent test**: load B1. One header, one dock, one rail, one footer, no
second copy of type, days or strips anywhere. The screenshot the product owner
reviews (FR-069).

- [ ] **T005** [P] [US1] **(drift)** The dock's need. Red first:
  `__tests__/engine/footprint.test.ts` asserts `estimateEventFootprint(competition, config)`
  returns `{ strips, poolMinutes, deMinutes }` equal to what
  `deriveEventSchedule` yields for a synthetic placement at day 0, the day's
  start, strip count `computePoolStructure(...).n_pools` – the same three
  figures read off `pool_strip_count`, `pool_end − pool_start`,
  `de_total_end − de_start` – and that a flighted event and a team event agree
  with `deriveEventSchedule` too ([research D10](./research.md)). Run: fails
  because the export is missing. Then add it to `src/engine/derive.ts` with no
  new arithmetic. Ledger expected to show nothing moved – nothing reads it yet

- [ ] **T006** [P] [US1] The last run and the preset id. Red first, in
  `__tests__/store/store.test.ts`: (1) `runScheduleAll` returns
  `{ placed, unplaced }` and writes `lastAutoRun: { at, placed, unplaced }` on
  the `UiSlice`, where `placed` counts events the run gave a pool start and
  `unplaced` those it did not ([research D17](./research.md)); (2)
  `lastAutoRun` is absent from `serializeState`'s output; (3) `applyTemplate`
  records `loadedPresetId` as the template name, and `PresetId` admits both a
  `ScenarioId` and a `TemplateName` (`keyof typeof TEMPLATES`). Run: fail for
  want of the field and the wider type. Then implement in `src/store/store.ts`
  (`UiSlice` at `:119`, `loadedPresetId` at `:121`, `applyTemplate` at `:375`)
  and `src/store/runActions.ts:14`

- [ ] **T007** [P] [US1] Export plumbing without a popover (FR-009). Red first:
  `__tests__/store/exportActions.test.ts` covers save to file (a JSON blob of
  `serializeState`), load from file (parses, rejects an invalid payload with
  an error, reports whether the load would drop placements so a caller can
  warn first), share link (the URL `SaveLoadShare.tsx` builds today), and copy
  (writes the link to the clipboard). Run: fails because
  `src/store/exportActions.ts` does not exist. Then create it by moving the
  handlers out of `src/components/sections/SaveLoadShare.tsx`, leave that
  component rendering over the new module until T011 deletes it, and confirm
  `__tests__/components/saveLoadShare.test.tsx` still passes

- [ ] **T008** [P] [US1] The error boundary ([research D15](./research.md)).
  Red first: `__tests__/components/ErrorBoundary.test.tsx` renders a child
  that throws and asserts a message and a `button` "Reload" appear instead of
  nothing, and that a child that does not throw renders through. Run: fails
  because `src/components/ErrorBoundary.tsx` does not exist. Then write it as a
  class component with state initialised as a field – no parameter property –
  and wrap `<WorkbenchShell />` with it in `src/App.tsx:24`

- [ ] **T009** [US1] The rail and the panel host. Red first:
  `__tests__/components/workbench/ToolRail.test.tsx` – a `nav` "Tool rail" with
  five `button`s "Tournament", "Strips & referees", "Events", "Findings",
  "Settings", the open one `aria-pressed="true"`, pressing an open one closes
  it, at most one open; `__tests__/components/workbench/InspectorPanel.test.tsx`
  – an `aside` "Inspector panel" with an `h2` naming the panel, `button` "Dock
  panel" / "Float panel" toggling `panelDocked`, `button` "Close panel"; and
  `__tests__/store/viewState.test.ts` gains `panel` (five ids or `null`) and
  `panelDocked`, validated wholesale. Both component files re-target
  `__tests__/components/workbench/RailPanel.test.tsx`, which is deleted here.
  Run: fail because the components do not exist. Then build
  `src/components/workbench/ToolRail.tsx` and `InspectorPanel.tsx`, add
  `PanelId` as an `as const` object, add the two fields to
  `src/store/viewState.ts`, and mount the old section components by panel id
  inside the host (decision 1). `src/components/workbench/WorkbenchShell.tsx`
  mounts the rail and host in place of `<Rail />` (`:24`). Delete `Rail.tsx`
  and `RailPanel.tsx` *(subagent commits)*

- [ ] **T010** [US1] The header ([research D12](./research.md), FR-004 to
  FR-008). Red first: `__tests__/components/workbench/Header.test.tsx` – a
  `header` "Header" with the brand, `combobox` "Preset" listing eight
  tournaments under "Tournaments" and ten templates under "Templates –
  invented figures", choosing either applies it, runs Auto-assign and records
  `loadedPresetId`, a template leaves `tournament_type` unchanged; `data-summary`
  reading `NAC · 4 days · 80 strips` with no input inside it; `data-last-run`
  absent before a run and `Last run HH:MM` after; `button` "Auto-assign"
  disabled while any ERROR finding exists; `button` "Export" opens the
  popover. `__tests__/components/workbench/ExportPopover.test.tsx` re-targets
  `__tests__/components/saveLoadShare.test.tsx` (deleted here): `button`s "Save
  to File", "Load from File", "Generate Link", "Copy", the link in
  `input[readonly]`, and the dropped-placements `role="status"`.
  `__tests__/components/workbench/boot.test.tsx` is re-pointed at the header.
  Run: fail because the components do not exist. Then build
  `src/components/workbench/Header.tsx`, `PresetPicker.tsx` (over T004's group
  parts, `SCENARIOS[id].label` and the `TEMPLATES` keys) and
  `ExportPopover.tsx` (over T007's module, Radix Popover), mount the header
  in `WorkbenchShell.tsx` in place of `<TopBar />` (`:22`), and delete
  `TopBar.tsx`, `src/components/sections/SaveLoadShare.tsx`, and the `header`
  at `src/App.tsx:18–23` with its badge. The top bar's Settings popover goes
  with it – the old `SettingsPanel` is already behind the rail's Settings
  button (T009) *(subagent commits)*

- [ ] **T011** [US1] The footer, and the center loses its chrome (FR-049,
  FR-050, [research D7, D18](./research.md)). Red first:
  `__tests__/components/workbench/StatusFooter.test.tsx` re-targets
  `Scorecard.test.tsx` (deleted here) – a `footer` "Status bar" with
  `data-counts` reading `N placed · N unplaced · N pinned` where unplaced
  includes the lane packer's overflow blocks (data-model §10), `data-metric`
  `finish`, `refs`, `strips` with the three values the scorecard showed, a
  `data-legend` with three weapon swatches, the `radiogroup` "Center view
  mode" with `radio`s "Matrix" and "Schedule", and **no** delta beside any
  number; `__tests__/components/workbench/viewTogglePersistence.test.tsx`
  keeps its assertion, re-pointed at the footer's toggle;
  `__tests__/store/footerMetrics.test.ts` re-targets
  `scorecardMetrics.test.ts` (deleted here) for `selectFooterMetrics` and its
  three rows, plus a `selectPlacementCounts` case with one overflow block;
  `__tests__/store/scorecardBaseline.test.ts` is deleted;
  `__tests__/store/viewState.test.ts` loses `drawerHeight` and
  `scorecardExpanded`; `invalidState.test.tsx` and `recompute.test.tsx` are
  re-pointed at a center with no toggle. Run: fail for want of the footer and
  the renamed selector. Then build `src/components/workbench/StatusFooter.tsx`,
  rename `selectScorecardMetrics` (`src/store/derived.ts:541`) to
  `selectFooterMetrics` returning only finish, peak referees and strip use
  (decision 5), add `selectPlacementCounts` over `src/layout/lanes.ts`, delete
  `ScorecardBaseline`, `scorecardBaseline`, `hoveredMetricId` and
  `setHoveredMetricId` from `derived.ts` and `store.ts` (`:130`, `:133`,
  `:397–406`, the baseline capture in `setPlacementsFromAuto` at `:423–445`),
  remove the toggle, the hover resolution and the metrics subscription from
  `src/components/workbench/CenterView.tsx:106–116`, mount the footer in
  `WorkbenchShell.tsx` in place of `<Drawer />` (`:30`), and delete
  `Drawer.tsx` and `Scorecard.tsx` and the two fields from `viewState.ts`.
  `AnalysisOutput` is mounted only behind the rail's Findings button from
  here (decision 2) *(subagent commits)*

- [ ] **T012** [US1] The dock (FR-010, FR-011). Red first:
  `__tests__/components/workbench/UnplacedDock.test.tsx` re-targets
  `UnplacedTray.test.tsx` (deleted here) – a `section` "Unplaced events",
  identifiable when empty, one `button` chip per event with no placement
  carrying `data-unplaced-chip`, `data-event-id`, `data-weapon` and its need as
  text (`3 strips · 3:45 · DE 2:10`) from T005's helper, the note "Every event
  has a slot." when none is unplaced and "Placed N events, M could not be
  placed." after a run, read from `lastAutoRun`. Run: fails because the
  component does not exist. Then build `src/components/workbench/UnplacedDock.tsx`,
  mount it in `WorkbenchShell.tsx` in place of `<UnplacedTray />` (`:26`), and
  delete `UnplacedTray.tsx`. The chip's click handler is wired in T030

- [ ] **T013** [US1] The shell, whole. Red first: rewrite
  `__tests__/components/workbench/WorkbenchShell.test.tsx` – exactly one
  `header` "Header", one `section` "Unplaced events", one `nav` "Tool rail",
  at most one `aside` "Inspector panel", one `main` "Center view", one
  `footer` "Status bar", no "Work in Progress", no `region` "Top bar",
  "Drawer" or "Scorecard", and no second element carrying the tournament type,
  day count or strip count as an input. Run: fails on whichever region the
  shell still lacks. Then finish `src/components/workbench/WorkbenchShell.tsx`
  as the six-region layout owning `panel` and `panelDocked` from
  `loadViewState`, with the panel floating over the canvas by default and
  docked beside it on request. Run the quickstart §2 grep restricted to this
  phase's words – `TopBar`, `Drawer\b`, `Scorecard`, `UnplacedTray`,
  `SaveLoadShare`, `RailPanel`, `scorecardBaseline`, `hoveredMetricId`,
  `data-highlighted` – over `src/` and `__tests__/`; it must return nothing
  *(subagent commits)*

- [ ] **T014** [US1] **(dispatched)** Re-point `scripts/smoke.mjs` for phase 1,
  in place ([research D14](./research.md)): `button` "Save / Share" at `:181`,
  `:547`, `:559`, `:685`, `:692` → `button` "Export", then "Generate Link" and
  `input[readonly]` as before; the scorecard steps at `:210–279` → read
  `data-counts` and the three `data-metric` values from the footer and the day
  count from the header's `data-summary`; the hover step at `:281–325` is
  deleted with `data-highlighted`; `spinbutton` "Strip count" at `:338` → open
  the Strips rail button and read `spinbutton` "Number of strips" (decision 7);
  `button` "Presets…" at `:363`, `:730`, `:781`, `:855`, `:907` → choose the
  template from the header picker's Templates group; `button` "Auto-schedule
  all" at `:371`, `:746`, `:789`, `:870`, `:915` → `button` "Auto-assign";
  `button` "Settings" and `region` "Settings" at `:586–596`, `:693–694` → the
  rail's Settings button and `aside` "Inspector panel"; `button` "Advanced"
  at `:978` → the Strips rail button; `combobox` "Tournament type" at `:1053`
  → the Tournament rail button and the old section's type control. The
  `radio` "Matrix" / "Schedule" steps stay, now inside the footer. Run the
  driver twice; report SMOKE PASS/FAIL for both, every Suggest count read, and
  the console error count, which must be 0 *(subagent commits)*

- [ ] **T015** [US1] **(user judges)** The product owner's screenshot (FR-069,
  SC-001, quickstart §3). Dispatch the `live-smoke` skill to run the app, load
  B1 at 80 strips, and save full-window screenshots at 1440×900 and 1920×1080
  under `scripts/smoke-shots/`. Send both to the product owner and **stop**.
  They judge: one header, one dock, one rail, one footer, no second copy of
  type, days or strips, and whether 80 strip rows across four days read as a
  board at 100%. Record the verdict in `handoff.md` §Verdicts. **A "no" halts
  phase 3 until the look is revised**, and the revision is a re-plan – record
  it, hand back a resume prompt, stop (constitution §Orchestration)

**Checkpoint**: `tsc -b`, `lint` and the full suite green. US1 is the MVP: the
shell stands on the old panels and every old chrome surface is gone.

---

## Phase 2: US2 – The five inspector panels (P1)

**Story goal**: every input has one home. The per-event record shrinks to
fencer count and flighted, DE mode becomes a tournament-level choice, global
overrides are gone, the payload is v3, and the five old section components are
deleted one panel at a time.

**Independent test**: open each panel, change each input, confirm the header
summary, canvas and footer follow. No input exists for referees available,
admin gap, flight buffer, per-event cut, DE mode, video policy or referee
policy. `appPathParity.test.ts` unchanged. A v2 link is refused.

- [ ] **T016** [P] [US2] Tournament panel (FR-013 to FR-015). Red first:
  `__tests__/components/workbench/panels/TournamentPanel.test.tsx` takes the
  type, day-count and day-hours cases from `__tests__/components/configEditing.test.tsx`
  – `radiogroup` "Tournament type" with six `radio`s NAC, RYC, RJCC, ROC, SYC,
  SJCC, choosing one updates the header's `data-summary`; `radiogroup` "Day
  count" with `radio`s 2, 3, 4 and, for a store at 5 days, a fourth disabled
  `radio` "5" with the existing out-of-range notice; per day `combobox` "Day N
  start" and "Day N end" over the time options in 24-hour labels. Run: fails
  because the panel does not exist. Then build
  `src/components/workbench/panels/TournamentPanel.tsx`, move `TIME_OPTIONS`
  from `src/components/sections/TournamentSetup.tsx` to `src/lib/time.ts`,
  mount the panel under the Tournament button in place of the old section,
  delete `TournamentSetup.tsx`, and re-point the driver's type step at
  `scripts/smoke.mjs:1053` to `radio` "ROC" in that radiogroup. The events
  cases in `configEditing.test.tsx` wait for T020

- [ ] **T017** [P] [US2] The search returns instead of writing
  ([research D8](./research.md), FR-017). Red first, in
  `__tests__/store/store.test.ts`: `describe('suggestStrips')` becomes
  `describe('computeSuggestedStrips')` – it resolves to the search's answer for
  `buildTournamentConfig(state)`, the two `null` cases still resolve `null`,
  and `strips_total` is **never** written – subscribe during the search and
  assert no write; `setStrips(n)` is what changes the field. Run: fails
  because the action is missing. Then split `suggestStrips`
  (`src/store/store.ts:63`, `:240–273`) into `computeSuggestedStrips():
  Promise<number | null>` with the same bounded scan and macrotask yield, and
  delete `suggestStrips`

- [ ] **T018** [US2] Strips & referees panel (FR-016 to FR-018,
  [research D8, D9](./research.md)). Red first:
  `__tests__/components/workbench/panels/StripsPanel.test.tsx` re-targets
  `__tests__/components/sections/StripSetup.test.tsx` and
  `__tests__/components/workbench/AdvancedPanel.test.tsx` (both deleted here)
  – `spinbutton` "Number of strips", `spinbutton` "Number of video strips"
  with the Default marker and `button` "Revert video strips to default";
  `section` "Suggested minimum" whose `data-suggested-strips` holds the count,
  the search runs on open and again 300 ms after strips, video strips, days,
  day hours, type, a fencer count or a pool duration changes (fake timers),
  a stale token's result is discarded (resolve a slow first search after a
  fast second one and assert the second's count stands), the `role="status"`
  indicator with the kept text appears only past the reveal delay, the strip
  field is unchanged until `button` "Apply" writes it; `data-refs-per-pool`
  equals `resolveRefsPerPool(TYPE_DEFAULTS[type].ref_policy, 1).refs_per_pool`;
  no `button` "Suggest" and no input for referees available. Run: fails
  because the panel does not exist. Then build
  `src/components/workbench/panels/StripsPanel.tsx` over T017's action and
  `resolveRefsPerPool` from `src/engine/pools.ts`, mount it under the Strips
  button in place of `StripSetup` and `AdvancedPanel`, delete
  `src/components/sections/StripSetup.tsx` and
  `src/components/workbench/AdvancedPanel.tsx`, and re-point the driver:
  `pressSuggest` at `scripts/smoke.mjs:163` opens the Strips panel, waits for
  `data-suggested-strips`, presses "Apply" and reads the stepper (all four
  callers unchanged); the Advanced steps at `:978–1001` read
  `data-refs-per-pool` and press the video revert in this panel
  *(subagent commits)*

- [ ] **T019** [US2] Red tests for the shrink ([research D7](./research.md),
  FR-062, FR-064, FR-071). In `__tests__/store/buildConfig.test.ts`: on a
  default store `buildTournamentConfig` derives, per competition, `ref_policy`
  from `TYPE_DEFAULTS[type]`, `cut_mode` and `cut_value` from
  `defaultCutForEntry` then the regional override then the team coercion,
  `de_video_policy` from `DEFAULT_VIDEO_POLICY_BY_CATEGORY`,
  `use_single_pool_override` false, `flighting_group_id` null, `is_priority`
  false, and the result deep-equals what the same store built before the
  shrink (capture it from the current code in the test's fixture, not by
  hand). In `__tests__/store/serialization.test.ts`: a round trip carries
  `schemaVersion: 3`, `competitions` as `Record<id, { fencer_count, flighted }>`
  and nothing per-event beyond the two, and a payload at `schemaVersion: 2`
  is refused with an error naming the version. In
  `__tests__/components/workbench/panels/EventsPanel.test.tsx` (taking the
  events and fencer cases from `configEditing.test.tsx`): heading `Selected N
  of 120`, one `section` per gender and weapon ("Women's Foil"), chips in the
  order individual categories, six veteran bands, team categories suffixed
  "Team", each a `button` with `aria-pressed`, a pressed chip renders
  `spinbutton` "Fencer count for {label}" with `min` at `MIN_FENCERS` that
  refuses a smaller value. Re-target `buildConfig.typeDefaults.test.ts`,
  `typeDefaultPrecedence.test.ts` and `competitionDefaults.test.ts` wherever
  they set a retired per-event field. Run: the shrink cases fail on the extra
  fields and the version, the panel cases because it does not exist

- [ ] **T020** [US2] The per-event record shrinks. `CompetitionConfig`
  (`src/store/store.ts:81`) becomes `{ fencer_count, flighted }`,
  `defaultConfigForId` (`:297`) and `updateCompetition` follow,
  `src/store/buildConfig.ts` derives the six fields per data-model §4,
  `VideoPolicy.FINALS_ONLY` is removed from `src/engine/types.ts:60`,
  `src/store/serialization.ts` writes `schemaVersion: 3` with the flat
  competitions map and refuses any other version at `:164`. Delete
  `src/components/sections/CompetitionOverrides.tsx` and
  `__tests__/components/sections/CompetitionOverrides.test.tsx` – the fields'
  only control – and the driver's per-event referee steps at
  `scripts/smoke.mjs:1012–1050`. T019 green. Run
  `__tests__/store/appPathParity.test.ts`: it must pass unedited – this is the
  check that the shrink changed nothing the engine sees on a default store
  *(subagent commits)*

- [ ] **T021** [US2] Events panel (FR-019 to FR-021, [research D15](./research.md)).
  Build `src/components/workbench/panels/EventsPanel.tsx` so T019's panel
  cases go green, mount it under the Events button in place of
  `CompetitionMatrix` and `FencerCounts`, delete
  `src/components/sections/CompetitionMatrix.tsx`, `FencerCounts.tsx` and
  `__tests__/components/configEditing.test.tsx` (its cases now live in T016
  and T019), and re-point the driver's `spinbutton` /Fencer count for/ step at
  `scripts/smoke.mjs:524` to open the Events panel and read the pressed
  chips' inputs *(subagent commits)*

- [ ] **T022** [US2] Settings panel and the last two store changes (FR-029 to
  FR-031, FR-063, [research D7](./research.md)). Red first:
  `__tests__/components/workbench/panels/SettingsPanel.test.tsx` re-targets
  `__tests__/components/workbench/SettingsPanel.test.tsx` (deleted here) –
  `section` "Pool round durations" with its per-weapon inputs and reverts,
  `radiogroup` "DE mode" with `radio`s "Staged" and "Single" plus the Default
  marker while following the type, choosing one writes `de_mode_override`,
  and no row for admin gap, flight buffer or video strips;
  `__tests__/store/serialization.test.ts` gains `de_mode_override` in the round
  trip and asserts no `globalOverrides` key; `__tests__/store/buildConfig.test.ts`
  gains `de_mode` from `de_mode_override ?? TYPE_DEFAULTS[type].de_mode` and
  the seven engine constants read from `constants.ts` directly;
  `__tests__/store/globalOverrides.test.ts` and `settingsSerialization.test.ts`
  are deleted with their subjects. Run: fail for want of the field and the
  panel. Then add `de_mode_override: DeMode | null` and `setDeModeOverride` to
  `TournamentSlice`, delete `globalOverrides`, `setGlobalOverrides` and the
  `GlobalOverrides` type from `src/store/store.ts:109`, `:322`, `:388` and
  from `buildConfig.ts` and `serialization.ts`, rewrite
  `src/components/workbench/SettingsPanel.tsx` (the rows at `:45–48` go, the
  `PoolDurationSettings` mount at `:178` stays) into
  `src/components/workbench/panels/SettingsPanel.tsx`, delete
  `src/components/deModeLabels.ts` with the two labels inlined, and re-point
  the driver: the Admin gap steps at `scripts/smoke.mjs:636–655` and
  `:696–706` are deleted and replaced by one step that sets DE mode to Single,
  generates a link, opens it and reads the radio back, and one that changes a
  pool duration and confirms the schedule moves *(subagent commits)*

- [ ] **T023** [US2] **(dispatched)** Run the driver twice. **Record NAC
  Youth's count** at `scripts/smoke.mjs:786` in the driver's own comment and
  in `handoff.md` §Verdicts – expected 66 now that the Admin gap step is gone
  ([research D14](./research.md)); a different value is recorded, not
  corrected. Report SMOKE PASS/FAIL for both runs, all four Suggest counts, and
  0 console errors. Run the quickstart §2 grep restricted to this phase's
  words – `AdvancedPanel`, `CompetitionMatrix`, `FencerCounts`,
  `CompetitionOverrides`, `StripSetup`, `TournamentSetup`, `globalOverrides`,
  `FINALS_ONLY`, `deModeLabels`, `suggestStrips` – over `src/` and
  `__tests__/`; it must return nothing *(subagent commits)*

**Checkpoint**: `tsc -b`, `lint` and the full suite green. Every input has one
home. Phases 0–2 are the MVP.

---

## Phase 3: US3 – The canvas at every scale (P2)

**Story goal**: an HTML canvas on the mockup's DOM model with every strip row
in the document, a six-rung ladder with Fit day, weapon fills with phase hatch
and icons, the five cues, and the SVG canvas deleted with its windowing, zoom,
palette and labels. **Blocked until T015's verdict is "yes".**

**Independent test**: B1 at 80 strips scrolls natively on both axes with axis,
bands and gutter sticky, zoom stops at both ends with the button disabled, Fit
day refits on resize, every block keeps fill, hatch and label at the closest
rung.

- [ ] **T024** [P] [US3] The ladder and the tokens ([research D3, D4](./research.md),
  data-model §7, §8). Red first: `__tests__/components/canvas/zoomLadder.test.ts`
  re-targets `zoom.test.ts` – six rungs with the exact `ppm` and `row` values,
  `DEFAULT_ZOOM = 2`, readout as a percentage of rung 2 (`47%`, `69%`, `100%`,
  `144%`, `203%`, `281%`), step in and out clamp at the ends and report
  `canZoomIn` / `canZoomOut`, stepping from fit mode lands on the neighbouring
  rung with `fitting` cleared; `__tests__/components/canvas/weaponTokens.test.ts`
  re-targets `palette.test.ts` – three weapons map to
  `--weapon-{foil,epee,sabre}-{fill,ink,edge,hatch}` and nothing maps to a
  `--cat-` name. Run: fail because neither module exists. Then write
  `src/components/canvas/zoomLadder.ts` and `weaponTokens.ts`, and add the
  twelve weapon tokens to `src/index.css`. `zoom.ts`, `palette.ts`, the
  `--cat-*` block and the two old test files are deleted in T026, when their
  last readers go

- [ ] **T025** [US3] Red tests for the canvas. `__tests__/components/canvas/Canvas.test.tsx`
  re-targets `MatrixCanvas.test.tsx` – for B1 at 80 strips and four days,
  exactly 320 `data-strip-row` elements are in the document with no
  windowing, `data-canvas-scroller` is the one scrolling container, the axis
  (`data-time-axis`, `data-hour-tick`), each `data-day-band={day}` and the
  gutter are `position: sticky`, no `data-canvas-viewport`, `data-block-layer`,
  `data-row-line`, `data-day-grid`, `toolbar` "Canvas zoom controls" or
  `group` "Matrix grid" exists, each band's text reads `Day N · E events ·
  finishes HH:MM · P of S strips at peak · F findings` with no date, a gutter
  row is `data-flagged="true"` when a derived finding names an event on that
  row, the settle and dimmed-invalid rules hold (re-point
  `__tests__/components/workbench/recompute.test.tsx` and
  `invalidState.test.tsx`), and the Fit day fallback uses rung 2 when the
  plot has no measured width. `__tests__/components/canvas/Block.test.tsx`
  re-targets `EventBlock.test.tsx` – `role="img"`, `aria-label`, every kept
  `data-*` attribute, `data-weapon`, a DE block carries the hatch and the
  bracket icon and a pool block the grid icon, the label falls back full name
  → short name → category as the room shrinks, `data-pinned="true"` with the
  glyph, `data-overflow="true"` drawn dashed, `data-selected="true"` with the
  ring, no `data-category`, no resize handle. `__tests__/components/canvas/viewEquivalence.test.tsx`
  is re-pointed at the new block attributes, not rewritten.
  `__tests__/components/workbench/StatusFooter.test.tsx` gains the `toolbar`
  "Zoom" – `button`s "Zoom out", "Zoom in", "Reset zoom", "Fit day" and
  `data-zoom-readout`, in and out disabled at the ends.
  `__tests__/store/viewState.test.ts` gains `zoomStep` (0–5) and `fitting`
  and loses `rowHeightStep`, `timeZoom`, `timeScroll`, `rowScroll`.
  `__tests__/store/daySummaries.test.ts` (decision 4) asserts one
  `DaySummary` per day with `events`, `finish`, `peakStrips` sampled at block
  boundaries, `unplaced` and `findings`. Run: everything fails for want of
  `Canvas.tsx`, `Block.tsx`, the selector and the view-state fields.
  `windowing.test.ts` has no successor and is deleted in T026

- [ ] **T026** [US3] **(Opus)** The canvas ([research D2, D3, D4, D18](./research.md),
  FR-032 to FR-043). Build `src/components/canvas/Canvas.tsx` – one natively
  scrolling container, a sticky time axis picking tick density from the rung,
  one group per day with a sticky band reading `selectDaySummaries`, a sticky
  gutter, one absolutely positioned `div` per block from `src/layout/lanes.ts`,
  blocks positioned in percent of the axis span under Fit day with the scale
  solved from a `ResizeObserver` – and `src/components/canvas/Block.tsx` –
  weapon fill from the tokens, 45° hatch and bracket icon for DE, grid icon for
  pools, name sized from the room per the mockup's `fits()` rule, badge, dashed
  edge, ring. Add `selectDaySummaries` to `src/store/derived.ts` (data-model
  §9). Rewrite `src/store/viewState.ts` for `zoomStep` and `fitting`. Give
  `StatusFooter.tsx` the zoom toolbar over the ladder. Point
  `CenterView.tsx` at the new canvas, keeping its settle timer and
  dimmed-invalid overlay. `CanvasTooltip.tsx` and its test are kept. Delete
  `MatrixCanvas.tsx`, `EventBlock.tsx`, `blockLabels.ts`, `palette.ts`,
  `windowing.ts`, `zoom.ts`, the remainder of `geometry.ts`, the 33 `--cat-*`
  properties in `src/index.css`, and `MatrixCanvas.test.tsx`,
  `EventBlock.test.tsx`, `palette.test.ts`, `windowing.test.ts`,
  `zoom.test.ts`, `geometry.test.ts`. No windowing, no drag handler, no
  resize handle, no camera icon, no hover highlight. T024 and T025 green.
  Re-point the driver: `button` "Fit to day" at `scripts/smoke.mjs:463` →
  footer `button` "Fit day", and any toolbar locator → the footer's `toolbar`
  "Zoom" *(subagent commits)*

- [ ] **T027** [US3] **(dispatched)** Run the driver twice and add the SC-005
  read to the live check: step zoom in until "Zoom in" disables, count
  `[data-event-block]` and confirm every one still carries `data-weapon` and
  its label or icon, then "Reset zoom". Report SMOKE PASS/FAIL ×2, the rung
  count reached (must be 5), and 0 console errors. Run the quickstart §2 grep
  for `MatrixCanvas`, `EventBlock`, `blockLabels`, `palette\.ts`, `windowing`,
  `canvas/zoom`, `--cat-`, `rowHeightStep`, `timeZoom` over `src/` and
  `__tests__/`; it must return nothing *(subagent commits)*

**Checkpoint**: `tsc -b`, `lint` and the full suite green. 320 rows, six rungs,
weapon fills, five cues, view equivalence holds.

---

## Phase 4: US4 – Select an event and act on it (P2)

**Story goal**: a selection in the store, a detail strip with Pin, Move day
and Flight, and the flighting suggestions gone from every selector. Acceptance
scenario 4 (the late-finish finding on a move past close) is met by phase 5.
**This story does not ship without phase 6** (spec US4).

**Independent test**: select a block, press each button, confirm the change in
the store, on the canvas, in the Schedule view and in the share link.

- [ ] **T028** [US4] Red tests. `__tests__/store/selection.test.ts`:
  `selectedCompetitionId` defaults null, `selectCompetition(id)` sets it and
  `selectCompetition(null)` clears it, it is absent from `serializeState`, and
  `setPinned(id, false)` flips `pinned` without touching `source` (decision
  6). `__tests__/components/workbench/DetailStrip.test.tsx`: a `section`
  "Selected event" with `data-selected-name`, `data-selected-day`,
  `data-selected-strips` (this render's lanes), `data-selected-fencers`, a
  `data-phase-pill` per phase with start and end in 24-hour form; `button`
  "Pin" toggles `pinned` and reads "Pinned" with `aria-pressed`; `button`
  "Move day" opens a `menu` of the other days and choosing "Day 3" calls
  `updatePlacement` with day 2 and the same start, leaving the placement
  manual and pinned; `button` "Flight" toggles `flighted` with `aria-pressed`;
  `button` "Collapse details" / "Expand details" flips `detailCollapsed` to a
  one-line strip; `button` "Dismiss" clears the selection; for a selected
  event with no placement the strip shows name, fencer count and phase
  durations from `estimateEventFootprint`, offers Flight, and has no Pin or
  Move day. `__tests__/store/viewState.test.ts` gains `detailCollapsed`.
  `__tests__/components/canvas/Canvas.test.tsx` gains: clicking a block calls
  `selectCompetition` and the block reads `data-selected` from the store.
  `__tests__/components/workbench/UnplacedDock.test.tsx` gains: clicking a chip
  selects. `__tests__/store/derived.test.ts` and `buildConfig.test.ts` lose
  every case that passes a `flightingSuggestions` argument, and
  `__tests__/store/serialization.test.ts` asserts `flighted` survives the
  round trip. Run: fail for want of the slice fields, the component and the
  narrowed signatures

- [ ] **T029** [US4] The selection and the strip (FR-044 to FR-048, FR-028).
  Add `selectedCompetitionId`, `selectCompetition` and `setPinned` to
  `src/store/store.ts`, `detailCollapsed` to `src/store/viewState.ts`. Build
  `src/components/workbench/DetailStrip.tsx` and mount it under the canvas in
  `CenterView.tsx`. Wire the block click in `Canvas.tsx` and the chip click in
  `UnplacedDock.tsx`. Delete the `AnalysisSlice`
  (`src/store/store.ts:168–169`, `:508–522`): `flightingSuggestionStates`,
  `acceptFlightingSuggestion`, `rejectFlightingSuggestion`; the
  `flightingSuggestions` parameter from `buildTournamentConfig` and every
  selector in `src/store/derived.ts`; and the Accept / Reject rows from
  `src/components/sections/AnalysisOutput.tsx:33–151`. `flighting_group_id`
  is always null. T028 green. Move day performs no crossover check (FR-047)
  *(subagent commits)*

**Checkpoint**: `tsc -b`, `lint` and the full suite green. Run the quickstart
§2 grep for `flightingSuggestion` over `src/` and `__tests__/`; nothing.

---

## Phase 5: US5 – Findings that lead to the event (P2)

**Story goal**: one findings list with a stable id, a severity, a where, a
message and an optional target, two derived findings, a jump that selects,
scrolls and flashes, a badge on the rail, and `AnalysisOutput` deleted.

**Independent test**: a board with one overflow, one late finish and one
blocking finding shows all three with the right badge, offers Show on grid for
the two that name an event, and the jump reaches the block.

- [ ] **T030** [US5] Red tests. `__tests__/store/findings.test.ts` for
  `selectFindings` (data-model §5): every row has `id`, `severity` in
  Blocking / Warning / Note / Unplaced, `where`, `day`, `message`, `target`; a
  `ValidationError` maps ERROR → Blocking, WARN → Warning, INFO → Note with
  `findingIdentity` as id and `subjects[0]` as target when it is a competition
  id; a `Bottleneck` gets `analysis:${cause}:${competition_id}:${n}` with `n`
  distinguishing repeats; one Unplaced row per overflow block from
  `src/layout/lanes.ts`, id `unplaced:${id}:${phase}`, naming the strips it
  needs; one Late finish row per day whose latest finish is inside 45 minutes
  before `day_end_time` or after it, id `late-finish:day:${day}`, at Warning,
  targeting the last finisher, the message stating the margin or the minutes
  past close – a hand move past close yields the same row and **no** Blocking
  row; the existing out-of-range-day finding appears with the stranded event
  as target (FR-060); no row compares referees needed to a referee count; a
  dismissed Warning or Unplaced row is filtered and a Blocking or Note row
  cannot be dismissed. `__tests__/store/dismissals.test.ts` gains the two
  derived rows. `__tests__/store/daySummaries.test.ts`'s `findings` column now
  counts `selectFindings` rows on the day. `__tests__/store/selection.test.ts`
  gains `jumpToCompetition(id)` selecting and incrementing `jumpNonce`.
  `__tests__/components/workbench/panels/FindingsPanel.test.tsx` re-targets
  `__tests__/components/analysisOutput.test.tsx` – a `list` of `listitem`s
  with `data-finding-id`, `data-severity`, the badge text, where, message,
  `button` "Show on grid" only when a target exists and calling
  `jumpToCompetition`, `button` "Dismiss finding" only on dismissable rows.
  `ToolRail.test.tsx` gains `data-badge` on Findings equal to the undismissed
  count. `Canvas.test.tsx` gains: a `jumpNonce` change scrolls the target
  block into view and sets `data-flash` once, and `data-flagged` reads
  `selectFindings`. `Header.test.tsx`'s Auto-assign case reads Blocking rows
  from `selectFindings`. Run: fail for want of the selector, the panel and the
  nonce

- [ ] **T031** [US5] **(Opus)** The unified list ([research D6](./research.md),
  FR-022, FR-024 to FR-026). Add `selectFindings`, `FindingSeverity` as an
  `as const` object, and `LATE_FINISH_WINDOW_MINS = 45` (a UI constant, not
  an engine one) to `src/store/derived.ts`, reading the lane packer for
  overflow and the derived schedule for finishes. Widen `dismissFinding`
  (`src/store/store.ts:488`) to "a current row whose underlying severity is
  WARN". Re-point `selectDaySummaries.findings` at the list. Add `jumpNonce`
  and `jumpToCompetition` to the `UiSlice`. T030's store cases green

- [ ] **T032** [US5] The panel, the badge, the jump (FR-023, FR-027). Build
  `src/components/workbench/panels/FindingsPanel.tsx`, add the badge to
  `ToolRail.tsx`, make `Canvas.tsx` scroll the target into view and set
  `data-flash` on each `jumpNonce` change (a timer clears it, no loop), point
  `Header.tsx`'s Auto-assign disable and `data-flagged` at `selectFindings`,
  mount the panel under the Findings button in place of `AnalysisOutput`, and
  delete `src/components/sections/AnalysisOutput.tsx` and
  `__tests__/components/analysisOutput.test.tsx`. T030 green. Run the
  quickstart §2 grep for `AnalysisOutput` over `src/` and `__tests__/`;
  nothing *(subagent commits)*

**Checkpoint**: `tsc -b`, `lint` and the full suite green. Every finding has a
severity, a where and a message, and the jump reaches the block.

---

## Phase 6: US6 – Auto-assign schedules around pinned events (P2)

**Story goal**: the one engine change. Pins enter `scheduleAll` fixed, seed
the day colouring, pre-claim their strip-time, and stay out of the loop's
seed, and **no B1–B8 count moves on the no-pins path**.

**Independent test**: six pins across three days of B1 hold their day and
start while the other eighteen are placed. The ledger with no pins is
unmoved on every scenario.

- [ ] **T033** [US6] Red tests ([contracts/engine-contract.md](./contracts/engine-contract.md)).
  `__tests__/engine/pinnedScheduling.test.ts` on B1 from
  `__tests__/helpers/scenarios.ts`, with `start_time` computed on the
  scheduler axis as `dayStart(day, config) + (clock start − that day's clock
  start)` – the caller converts, never the engine: (1) six pins across three
  days keep `assigned_day` and `pool_start` and the other eighteen get a pool
  start; (2) an event a hard edge of the constraint graph joins to a pinned
  event is not on the pin's day, or the existing
  `UNAVOIDABLE_CROSSOVER_CONFLICT` names the pair; (3) every strip interval
  an auto-placed phase claims is disjoint from the pinned event's intervals
  at its time, read from the result's strip allocations; (4) every event
  pinned: the result carries each pin's day and start and nothing else
  changes; (5) two pins at one hour whose strips exceed the day's count both
  keep day and start and the second carries one WARN bottleneck with cause
  `PINNED_UNCLAIMED` naming the event and phase, and the rest still packs;
  (6) **the no-pins result is byte-identical**: `scheduleAll(c, cfg)`
  deep-equals `scheduleAll(c, cfg, [])` on all eight scenarios; (7) two calls
  with the same pins return the same result. `__tests__/store/runActions.test.ts`
  (new): `runScheduleAll` builds the pinned list from placements with
  `pinned: true` and a day in `[0, days_available)`, a pin outside that range
  is left out and re-placed unpinned, pinned placements are kept verbatim
  after the run, every auto placement is unpinned with source AUTO, the
  return is `{ placed, unplaced }` with pins excluded from `placed`, and with
  every event pinned `placed` is 0. `__tests__/store/findings.test.ts` gains:
  after a run with two colliding pins the Unplaced row names the second.
  `__tests__/engine/stripSearch.test.ts` gains: the search with pins returns a
  count at which every event places around them, and one fewer does not.
  Run: (1)–(5) and (7) fail because the third argument is ignored and
  `PINNED_UNCLAIMED` does not exist, (6) passes already and stays

- [ ] **T034** [US6] **(Opus)** **(drift)** Implement
  ([research D1](./research.md), FR-054 to FR-061). `PinnedPlacement` and
  `BottleneckCause.PINNED_UNCLAIMED` in `src/engine/types.ts:110`; the third
  parameter `pinned = []` on both `ScheduleAllResult` entry points
  (`src/engine/scheduler.ts:20`, `concurrentScheduler.ts:199`); `dayColoring.ts`
  seeds `coloring` and `uncolored` from the pins in both `dsaturLoop` passes
  and, only when `pinned.length > 0`, runs phase 2 at
  `max(effectiveDays, maxPinnedDay + 1)` colours and skips compaction; a
  pre-claim pass in `concurrentScheduler.ts` between `applyCrossEventEdges`
  and `runConcurrentLoop` walks each pin's phase chain in (day, start, id)
  order with one `tryAllocate` per node, passing the pin's day, marks the node
  RUNNING either way, claims nothing on defer or fail and emits the WARN; the
  loop's seed skips pinned events. `src/engine/stripSearch.ts` threads
  `pinned` to every candidate. `src/store/runActions.ts` builds the list,
  keeps pins verbatim, returns the counts. `computeSuggestedStrips` passes the
  same list. Every new branch guarded on `pinned.length > 0`. T033 green.
  Ledger expected to show **nothing moved**; the commit carries the eight
  counts before and after *(subagent commits)*

- [ ] **T035** [US6] **(Opus)** **(drift)** The ledger review (FR-058, FR-068,
  SC-003). A second reader, not T034's implementer. Run the ledger and
  `appPathParity.test.ts`. Compare every B1–B8 scheduled count, ERROR count,
  WARN count and `stripRecommendation` against `drift-baseline.md`, and the
  snapshot's SHA-256 against the recorded one. **Any scheduled count that
  moved on any scenario halts this task** – record what moved, hand back a
  resume prompt, stop. A snapshot diff that is not empty is read line by line
  and every line is either explained in the commit message with the source
  line that produced it or is a halt. Append the after-table to
  `drift-baseline.md` §After phase 6 *(subagent commits)*

**Checkpoint**: `tsc -b`, `lint` and the full suite green. Six pins hold, no
ledger count moved, the diff is explained.

---

## Phase 7: US7 – The Schedule view is the document an organizer publishes (P3)

**Story goal**: one section per day, events in start order, a Print button,
and a print stylesheet that leaves nothing but the schedule.

**Independent test**: B1 in Schedule view shows four day sections with every
placed event once at the canvas's times, and printing yields four pages.

- [ ] **T036** [US7] Red first: `__tests__/components/scheduleOutput.test.tsx`
  gains ([research D11](./research.md), FR-051 to FR-053) – one `section`
  "Day N" per day with a heading, rows inside each in pool-start order, no
  Day column (`src/components/sections/ScheduleOutput.tsx:87` goes), every
  placed event exactly once across the sections, an out-of-range placement
  still flagged, `button` "Print" calls `window.print` (spy), each day section
  carries the page-break class, and the header, dock, rail, panel, detail
  strip and footer each carry the print-hidden class. Run: fail on the
  sections and the button. Then restyle `ScheduleOutput.tsx` after USA
  Fencing's published schedules – day heading, start order, the kept columns
  minus Day – add the Print button, and add the `@media print` rules to
  `src/index.css` (or Tailwind `print:` variants on the regions, one or the
  other, not both): hide every region but the schedule, un-clip the center,
  `break-after: page` per day section. If the driver reads the Day cell
  inside `[data-schedule-row]` at `scripts/smoke.mjs:486`, re-point it at the
  section heading. The human print check (quickstart §8) is recorded in T043
  *(subagent commits)*

**Checkpoint**: `tsc -b`, `lint` and the full suite green.

---

## Phase 8: Close-out

- [ ] **T037** [P] Design-document edits (FR-070). In
  `docs/design/competition-planner-workbench.md`: §Virtualization (`:161`)
  records that 013 removed windowing deliberately – native scrolling and
  sticky positioning closed three recorded defects, 320 rows and ~50–130
  blocks are inside what a browser lays out – with a pointer to
  [research D2](./research.md); the roadmap's `concurrentScheduler.ts:183`
  citation for `createGlobalState` (`:235`) becomes `:203`; and the same
  sentence's "exclusion from `buildEventStates`" is corrected to exclusion
  from the loop's seed, with a note that 013 delivered the pre-seeded
  colouring and intervals (research D1 rejected the original wording)
  *(subagent commits)*

- [ ] **T038** The retired surfaces are gone (SC-002). From the orchestrator,
  no commit: run the full quickstart §2 grep over `src/`, `__tests__/` and
  `scripts/`, plus `data-highlighted`, `Auto-schedule all`, `Save / Share`,
  `Presets…`, `Fit to day`, `Strip count`, `name: 'Suggest'` over `scripts/`.
  Every one must return nothing. Record the command and its empty output for
  T043's handoff

- [ ] **T039** **(dispatched)** Live, in the browser (SC-013, quickstart §9).
  Use the `live-smoke` skill against the running app. Pass condition: SMOKE
  PASS twice, 0 console errors, boot places 24 of 24, all four Suggest presses
  return their counts, the share link round-trips. Any repair to
  `scripts/smoke.mjs` is in place. Report both runs' verdicts, the four
  counts, and NAC Youth's observed value *(subagent commits if the driver
  changed)*

- [ ] **T040** Run the full gate on the finished branch twice: `tsc -b`,
  `lint`, `pnpm test`. Account for the test-count delta against T001's
  starting numbers – tests added minus tests deleted must close exactly, with
  none skipped and no assertion weakened; `grep -rE 'it\.skip|test\.skip|describe\.skip|\.todo|\.only'`
  over `__tests__/` and `src/` returns nothing. Record both runs' numbers here

- [ ] **T041** [P] Print, by hand (SC-008, quickstart §8). Run the app, load
  B1, Auto-assign, switch to Schedule, press Print, save to PDF. Confirm four
  pages, one per day, each holding only that day's table, legible in
  greyscale. Record the result in `specs/013-workbench-redesign/handoff.md`
  §Verdicts for T043 *(user judges)*

- [ ] **T042** Update `docs/design/backlog.md`: close the three canvas
  defects under §The workbench canvas is not yet a finished surface, §A
  fencer count of 0 or 1 unmounts the whole app, §The Advanced panel
  re-implements the engine's referees-per-pool factor (corrected by research
  D9, not fixed), and §NAC Youth suggests 63 in the smoke driver's accumulated
  state (with T023's observed value); note that `derived.ts` no longer imports
  from `components/`; and record what this feature deliberately did not fix –
  sequencing onto a pin, crossover between pins and through Move day (014's
  E3), the referee model divergence (E5), the engine and the store both
  reporting a pin collision, `Bottleneck`'s missing second subject, the two
  dead constants and the unwired `daySequencing.ts` research D1 found
  *(subagent commits)*

- [ ] **T043** Write `specs/013-workbench-redesign/handoff.md`: §Verdicts (the
  T015 screenshot verdict, T023's NAC Youth value, T041's print check); the
  drift record (T002's baseline beside T035's after-table, every count
  unmoved); one row per task with what it deleted and what replaced it; the
  T038 grep record; the T039 and T040 verification records; the merge
  instructions, naming anything in the main checkout's working tree that will
  block `git merge --no-ff --no-commit` (the untracked or modified
  `specs/013-workbench-redesign/tasks.md` if T001 copied it) and the
  post-merge gate the constitution requires (`tsc -b`, `lint`, full suite on
  the merged tree before `commit-with-costs`); and a paste-ready resume
  prompt. Mark `spec.md` Status Delivered. Then stop – the merge commit is the
  user's *(subagent commits)*

---

## Dependencies

```
T001 → T002 → T003 → T004
                       ↓
[US1: T005 ‖ T006 ‖ T007 ‖ T008 → T009 → T010 → T011 → T012 → T013 → T014 → T015 (user judges)]
                       ↓
[US2: T016 ‖ T017 → T018 → T019 → T020 → T021 → T022 → T023]
                       ↓  (blocked by T015 = "yes")
[US3: T024 → T025 → T026 → T027]
                       ↓
[US4: T028 → T029]
                       ↓
[US5: T030 → T031 → T032]
                       ↓
[US6: T033 → T034 → T035]
                       ↓
[US7: T036]
                       ↓
T037 ‖ T038 → T039 → T040 → T041 ‖ T042 → T043
```

Stories run in this order and do not interleave (plan.md §Why this order):
story 1 first because the product owner's look happens there, story 2 before
story 3 because the panels remove the last inputs that would otherwise sit
beside the rewritten canvas, story 6 after 4 and 5 because its tests read the
Unplaced finding and the Pin button, story 7 last because it changes nothing an
organizer decides. `‖` marks the only parallel pairs, each on disjoint files.
Every drift-bearing task (T005, T034, T035) is the only change in its diff.

## Model split

| Task | Model | Why |
|---|---|---|
| T026, T031, T034, T035 | Opus | The canvas rewrite, the unified findings selector, the engine change and the ledger review are the places a wrong call stays green (plan.md §Constitution Check, Orchestration) |
| T014, T023, T027, T039 | either, dispatched | Locator repair iterates |
| T038 | orchestrator | Read-only grep |
| T015, T041 | the product owner | Screenshot and print are human judgments |
| all others | Sonnet | The decisions are in this file, the research and the contracts; the work is carrying them out |

## What halts a task

- Any B1–B8 scheduled count that moves on the no-pins path, in T034 or T035
  (FR-058). Not "below its floor" – any movement.
- The ledger moving in T005, which nothing reads.
- `appPathParity.test.ts` failing after T020 or T022, which means the shrink
  changed what a default store sends the engine.
- A "no" from the product owner in T015, which halts phase 3.
- A retired name surviving its phase's grep (standing rule 4).
- A driver locator repaired by rewriting the driver rather than re-pointing
  it, or a `pressSuggest` call lost (FR-067).
- A control deleted in a task whose replacement is not in the same commit
  (FR-066).
- An import of React or the store under `src/engine/` or `src/layout/`.
- A red test that fails for a reason other than the one its task predicted.
- A loop without a bound stated before entry.

## MVP scope

Phases 0–2 (T001–T023): US1 and US2, both P1. The shell stands, every old
chrome surface is gone, every input has one home, the payload is v3, and the
product owner has judged the look. Phases 3–7 each ship independently on top
of it, in order, with phase 4 held until phase 6 closes.
