# Implementation Plan: The workbench is rebuilt on the approved design

**Branch**: `013-workbench-redesign` | **Date**: 2026-09-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/013-workbench-redesign/spec.md`

## Summary

Replace the workbench shell with the Claude Design mockup's six regions –
header, unplaced dock, tool rail with five inspector panels, an HTML canvas
on the mockup's DOM model, a detail strip for the selected event, and a
status footer – and shrink the state underneath to what those surfaces edit:
a per-event record of fencer count and flighted flag, a tournament-level DE
mode, no global overrides, no scorecard baseline, no flighting suggestions.
The Schedule view stays behind the footer's toggle, restyled after USA
Fencing's published schedules with a print stylesheet.

One engine change. `scheduleAll` takes an optional list of pinned placements,
seeds the day colouring with their days, pre-claims their strip-time before
the packing loop, and keeps them out of the loop's seed, so Auto-assign packs
around what the organizer fixed ([research D1](./research.md)). Every new
branch is guarded on the list being non-empty, and the B1–B8 ledger must show
no scheduled count moving on the no-pins path.

Three findings from research correct the alignment record: the referees-per-
pool factor is already exported from `pools.ts` (D9), `viewMode` survives
because the toggle was kept (D5), and the smoke driver presses **Suggest**
four times, not three (D14).

## Technical Context

**Language/Version**: TypeScript 5.9, `erasableSyntaxOnly` on

**Primary Dependencies**: React 19, Zustand 5, Vite 8, Tailwind v4,
shadcn/ui over `radix-ui` 1.4, lucide-react. No new dependency: the select
gains Radix's group and label parts already in the umbrella package, the
popover uses Radix's Popover from the same package, print is CSS.

**Storage**: none. Configuration in the store and the share link at schema
v3, and viewer preferences in browser storage.

**Testing**: Vitest + React Testing Library, and `scripts/smoke.mjs` under
`playwright-core` for live verification.

**Target Platform**: browser, judged at 1440×900 and 1920×1080.

**Project Type**: single-project web application with a pure engine core.

**Performance Goals**: B1 at 80 strips renders every one of 320 strip rows
and `[M]` ~48 blocks without windowing, and scrolls natively. The strip
search on the largest template stays under the two seconds 012 set (`[M]`
13–230 ms per candidate), debounced at 300 ms.

**Constraints**: the engine takes no React import and no store read
(constitution I), every loop is bounded before entry (IV), no enum, namespace
or parameter property is used (V), and the merged tree runs `tsc -b`, `lint`
and the full suite before the merge commit (§Git Ownership).

**Scale/Scope**: seven user stories, 71 requirements. `[M]` 19 component
test files name a retired surface, and the source tree below lists 25 files
deleted, 8 rewritten and 20 added.

## Constitution Check

*GATE: evaluated before Phase 0 and again after Phase 1 design. Both passes recorded.*

| Principle | Assessment |
|---|---|
| **I. Pure Engine Core** | Holds. The engine gains one optional parameter on `scheduleAll`, one bottleneck cause, and one helper in `derive.ts` that calls `deriveEventSchedule` with a synthetic placement. `buildConfig.ts` stays the only bridge and takes on the per-event derivations the store used to carry ([research D7](./research.md)). The two layout modules the store already reads move to `src/layout/`, pure, so the import direction is store → layout ← components ([D6](./research.md)). |
| **II. Test-First** | Every implementation task has a red test first. The engine story's red tests assert both halves – pins keep their day and start, **and** the no-pins result is byte-identical – on B1 fixtures, so an implementation that honours pins by moving everything else cannot pass. `test-quality-reviewer` after every task that adds or edits tests; `react-code-reviewer` after every task touching React, which is most of them. |
| **III. Drift Is Measured** | The engine story is the only task that touches engine math. `drift-baseline.md` is written before it, recording every B1–B8 count and the snapshot hash. The ledger runs the no-pins path, so the rule is stricter than its floors: no count may move at all, and the snapshot diff must be empty or explained line by line in the commit ([quickstart §4](./quickstart.md)). The store shrink (D7) changes what reaches the engine on a non-default store only; `appPathParity.test.ts` proves a default store is unchanged. |
| **IV. Bounded Computation** | The pre-claim pass makes one allocation attempt per phase per pin, in a sorted list. The lane packer, the zoom ladder (six rungs) and the strip search (bounded by 012) are unchanged in kind. The debounce and the reveal delay are timers, not loops. |
| **V. Erasable TypeScript** | The error boundary is a class with a field initialiser, no parameter property. New unions (`PresetId`, `PanelId`, `FindingSeverity`) are `as const` objects with derived types. `VideoPolicy.FINALS_ONLY` is removed from an `as const` object, not an enum. |
| **VI. Verified Live** | `scripts/smoke.mjs` is re-pointed in each task that reshapes a control it locates ([research D14](./research.md) is the map), never rewritten. Its four **Suggest** presses survive as open-panel-and-Apply. The product owner's screenshot judgment at 80 strips on B1 happens at the end of story 1, before the canvas is rewritten (FR-069). Live smoke repair is dispatched to a subagent because locator repair iterates. |
| **Planning Artifacts** | `spec.md` (clarified), `plan.md`, `research.md` (D1–D18), `data-model.md`, `contracts/ui-contract.md`, `contracts/engine-contract.md`, `quickstart.md`, then `tasks.md`; `drift-baseline.md` and `handoff.md` during execution. The alignment document is pointed at, never restated; its three corrections are recorded in research.md, not patched into it silently. FR-070's edit to the design document's virtualization section is a task. |
| **Git Ownership** | **Worktree flow** ([research D16](./research.md)). A fresh worktree per session at `/Users/noahlz/projects/piste-planner-013-workbench-redesign` on `013-workbench-redesign`, branched from `main` at `78ae3b28f4` or later. Subagents commit to that branch at the checkpoints `tasks.md` marks. No push, no merge, no rebase, no amend, no branch deletion, no commit to `main`. The user merges it with `git merge --no-ff --no-commit` completed by `commit-with-costs`, and the merged tree runs `tsc -b`, `lint` and the full suite first. |
| **Orchestration** | The orchestrator dispatches and writes no code beyond a 1–5 line edit. Sonnet: panels, dock, footer, Export move, store shrink, serialization bump, test re-targeting, smoke re-pointing, the design-document edit. Opus: the engine story, the canvas rewrite, the unified findings selector, the ledger diff review. A session that revises this plan or `tasks.md` after implementation begins records the change, hands back a resume prompt, and stops. |

**Pre-Phase 0 result**: pass, no violations.

**Post-Phase 1 result**: pass, no violations. Three items were examined and
cleared rather than waved through:

- *Does the store reading `src/layout/` widen the store → components import
  the constitution frowns on?* No. `derived.ts:17–24` already imports
  `geometry.ts` from the canvas folder and explains why. Moving both modules
  to a pure `src/layout/` removes the cross-direction import rather than
  adding a second one.
- *Does seeding the colouring with pinned days change the no-pins path?* Not
  if the seed is empty. `dsaturLoop` initialises `coloring` and `uncolored`
  from the competition list (`dayColoring.ts:458–463`); seeding from an empty
  list leaves both as they are, and the phase-2 colour count and compaction
  branch are guarded on `pinned.length > 0`. The ledger is the proof, and
  the task halts on any movement.
- *Does a pin that cannot claim strips violate "the engine never spins"?*
  No. It makes one attempt per phase, records the result, and emits one
  warning. The lane packer on the store side is unchanged and already
  bounded.

## Project Structure

### Documentation (this feature)

```text
specs/013-workbench-redesign/
├── spec.md                  # What and why, with the 2026-09-07 clarifications
├── plan.md                  # This file
├── research.md              # D1–D18
├── data-model.md            # Store, viewer state, payload v3, view models
├── quickstart.md            # How to verify the feature end to end
├── contracts/
│   ├── ui-contract.md       # Regions, names, attributes the driver locates
│   └── engine-contract.md   # scheduleAll with pins, and the two pure helpers
├── checklists/
│   └── requirements.md      # Spec quality checklist, all items pass
├── drift-baseline.md        # Written during execution, before the engine edit
├── handoff.md               # Written at close
└── tasks.md                 # /speckit-tasks output – not created by /speckit-plan
```

### Source Code (repository root)

```text
src/
├── engine/
│   ├── scheduler.ts             # scheduleAll(competitions, config, pinned = [])  [D1]
│   ├── concurrentScheduler.ts   # seed skip, pre-claim pass, PINNED_UNCLAIMED  [D1]
│   ├── dayColoring.ts           # seeded coloring, guarded colour count and compaction  [D1]
│   ├── stripSearch.ts           # threads pinned through scanStripCounts  [D1, D8]
│   ├── derive.ts                # estimateEventFootprint  [D10]
│   └── types.ts                 # PinnedPlacement, PINNED_UNCLAIMED; FINALS_ONLY removed  [D7]
├── layout/                      # NEW, pure  [D6]
│   ├── segments.ts              # eventTimeSegments, from components/canvas/geometry.ts
│   └── lanes.ts                 # assignStripLanes, from components/canvas/lanes.ts
├── store/
│   ├── store.ts                 # CompetitionConfig shrinks; de_mode_override; UiSlice
│   │                            #   gains lastAutoRun, selection, jumpNonce; AnalysisSlice,
│   │                            #   globalOverrides, baseline, hover deleted  [D5, D7, D17]
│   ├── buildConfig.ts           # derives the six retired fields; constants read direct  [D7]
│   ├── derived.ts               # selectFindings, selectDaySummaries, footer counts;
│   │                            #   scorecard metrics reduced to three  [D6]
│   ├── serialization.ts         # schemaVersion 3, v2 refused  [D7]
│   ├── runActions.ts            # pins in, { placed, unplaced } out, lastAutoRun  [D1, D17]
│   ├── exportActions.ts         # NEW – save, load, share, copy plumbing  [FR-009]
│   ├── presets.ts               # applyTemplate records loadedPresetId  [D12]
│   └── viewState.ts             # rewritten: viewMode, panel, docked, detail, zoomStep, fitting  [D5]
├── components/
│   ├── ErrorBoundary.tsx        # NEW  [D15]
│   ├── workbench/
│   │   ├── WorkbenchShell.tsx   # rewritten: six regions, owns viewer state
│   │   ├── Header.tsx           # NEW – brand, PresetPicker, summary, last run, Auto-assign, Export
│   │   ├── PresetPicker.tsx     # NEW – two groups  [D12]
│   │   ├── ExportPopover.tsx    # NEW – over exportActions
│   │   ├── UnplacedDock.tsx     # NEW, replaces UnplacedTray
│   │   ├── ToolRail.tsx         # NEW – five buttons, badge
│   │   ├── InspectorPanel.tsx   # NEW – host: heading, dock, close
│   │   ├── panels/
│   │   │   ├── TournamentPanel.tsx   # NEW
│   │   │   ├── StripsPanel.tsx       # NEW  [D8, D9]
│   │   │   ├── EventsPanel.tsx       # NEW  [I4]
│   │   │   ├── FindingsPanel.tsx     # NEW  [D6]
│   │   │   └── SettingsPanel.tsx     # rewritten: pool durations, DE mode
│   │   ├── CenterView.tsx       # keeps settle and dimmed-invalid; loses toggle, hover  [D18]
│   │   ├── DetailStrip.tsx      # NEW – select, Pin, Move day, Flight
│   │   └── StatusFooter.tsx     # NEW – zoom, counts, metrics, legend, toggle
│   ├── canvas/
│   │   ├── Canvas.tsx           # NEW – HTML, sticky axis/band/gutter, replaces MatrixCanvas  [D2]
│   │   ├── Block.tsx            # NEW – weapon fill, hatch, icons, badges, replaces EventBlock  [D4]
│   │   ├── zoomLadder.ts        # NEW – six rungs, fit  [D3]
│   │   ├── weaponTokens.ts      # NEW – replaces palette.ts
│   │   └── CanvasTooltip.tsx    # kept
│   ├── sections/
│   │   ├── ScheduleOutput.tsx   # restyled: day sections, Print  [D11]
│   │   └── PoolDurationSettings.tsx  # kept, re-homed in SettingsPanel
│   ├── common/DefaultLabel.tsx  # kept – video stepper and DE mode
│   └── ui/select.tsx            # gains SelectGroup, SelectLabel  [D12]
├── lib/time.ts                  # gains TIME_OPTIONS from the deleted TournamentSetup
├── index.css                    # weapon tokens in; 33 --cat-* out; @media print  [D4, D11]
└── App.tsx                      # header removed; ErrorBoundary around the shell

Deleted: App.tsx header, TopBar, Rail, RailPanel, TournamentSetup, StripSetup,
CompetitionMatrix, FencerCounts, CompetitionOverrides, AdvancedPanel, Drawer,
Scorecard, AnalysisOutput, SaveLoadShare, UnplacedTray, MatrixCanvas,
EventBlock, blockLabels.ts, palette.ts, windowing.ts, zoom.ts,
deModeLabels.ts, and geometry.ts / lanes.ts under components/canvas (moved).

__tests__/
├── engine/
│   ├── pinnedScheduling.test.ts # NEW – six pins on B1, crossover, capacity, stranded, all-pinned
│   ├── footprint.test.ts        # NEW
│   └── driftLedger.test.ts      # unchanged; run, not edited
├── layout/                      # segments.test.ts, lanes.test.ts (moved)
├── store/
│   ├── findings.test.ts         # NEW – the unified list, both derived findings
│   ├── daySummaries.test.ts     # NEW
│   ├── exportActions.test.ts    # NEW
│   ├── serialization.test.ts    # v3 cases; v2 refused
│   ├── buildConfig.test.ts      # the six derivations
│   ├── viewState.test.ts        # rewritten
│   └── dismissals.test.ts       # gains derived-finding cases
└── components/                  # re-targeted per research D13's map

scripts/smoke.mjs                # re-pointed per research D14's map, in place
docs/design/competition-planner-workbench.md  # §Virtualization records the removal (FR-070)
```

**Structure Decision**: single project with a pure engine core, unchanged. Two
structural additions: `src/layout/` for the two pure layout modules the store
and the canvas share ([research D6](./research.md)), and `src/components/
workbench/panels/` for the five inspector panels, so the rail's contents are
one folder rather than five siblings of the shell.

## Phase sequence

Stories are the phases. Each story's tasks delete the surface they replace in
the same task (FR-066), re-target the tests that named it (D13), and
re-point the driver's locators for it (D14).

| Phase | Story | Content | Model | Exit condition |
|---|---|---|---|---|
| 0 | – | Worktree, `drift-baseline.md`, `src/layout/` move, `select` group parts | Sonnet | Suite green at the recorded counts; `layout/` tests pass from their new home |
| 1 | US1 | Header with picker, summary, last run, Auto-assign, Export over `exportActions`; dock with footprint chips; rail chrome and panel host; footer with counts, three metrics, legend and the toggle; `ErrorBoundary`; App header, TopBar, Drawer, Scorecard, AnalysisOutput, UnplacedTray, SaveLoadShare deleted with their store fields | Sonnet | One header, one dock, one rail, one footer; **screenshot judged by the product owner at 80 strips on B1** (FR-069). The old Rail's panels survive into phase 2 behind the new rail's buttons so no control is missing |
| 2 | US2 | The five panels; `CompetitionConfig` shrinks; `de_mode_override`; `GlobalOverrides` deleted; serialization v3; `computeSuggestedStrips`; Rail, RailPanel, the five section components, AdvancedPanel deleted | Sonnet | Every input has one home; `appPathParity` unchanged; a v2 link refused |
| 3 | US3 | `Canvas`, `Block`, `zoomLadder`, `weaponTokens`; `viewState` rewritten; `--cat-*` tokens out; MatrixCanvas, EventBlock, blockLabels, palette, windowing, zoom deleted; view-equivalence re-pointed | **Opus** | 320 rows for B1, six rungs, weapon fills, cues; equivalence holds |
| 4 | US4 | Selection in the store, `DetailStrip`, Pin, Move day, Flight; `flighted` serialized; flighting suggestions and their parameter deleted from every selector | Sonnet | The three buttons change the store, the canvas, the table and the link |
| 5 | US5 | `selectFindings`, `selectDaySummaries`, `FindingsPanel`, the two derived findings, jump, badge, day bands read the summaries | **Opus** | Every finding has severity, where and message, the jump reaches the block, and dismissal covers the derived rows |
| 6 | US6 | `PinnedPlacement`, seeded colouring, pre-claim pass, seed skip, `runScheduleAll` with pins, strip search with pins, `pinnedScheduling.test.ts`, ledger review | **Opus** | Six pins on B1 hold; **no ledger count moves**; diff explained in the commit |
| 7 | US7 | `ScheduleOutput` day sections, Print button, `@media print`; `scheduleOutput.test.tsx` gains the cases | Sonnet | Four pages for B1 in the human print check |
| 8 | – | Design-document edits: §Virtualization records the removal (FR-070) and the roadmap's stale `concurrentScheduler.ts:183` citation for `createGlobalState` is corrected to `:203`; live smoke twice; `handoff.md` | Sonnet, smoke dispatched | SMOKE PASS ×2, 0 console errors, NAC Youth's observed count recorded |

**Why this order.** Story 1 first because the product owner's look happens
there and a "no" changes story 3. Story 2 before story 3 because the panels
remove the last inputs that would otherwise sit beside the rewritten canvas
in an old chrome. Story 6 after stories 4 and 5 because its tests read the
Unplaced finding and the Pin button, both of which exist only after them.
Story 7 last because it changes nothing an organizer decides. Story 4 does
not ship without story 6 (spec US4).

**What is deleted when.** Alignment §6's list is split across phases 1–5 so
that at every commit the old control is gone only where the new one is
present. Phase 1 deletes the chrome and the drawer but leaves the old Rail's
five section components mounted inside the new panel host until phase 2
replaces them one panel at a time. Nothing is deleted in phase 0.

## The drift instrument

`drift-baseline.md` is written in phase 0, before any `src/engine/` edit, and
records for each B1–B8 scenario the scheduled count, the ERROR and WARN
counts, and the snapshot file's hash at the branch point. Phase 6's review
compares the post-change snapshot against it line by line. The store shrink
in phase 2 is checked by `appPathParity.test.ts` rather than by the ledger,
because the ledger's factories never carried the retired fields (backlog §The
drift ledger's factory does not apply the store's per-type resolutions).

## Complexity Tracking

> No constitution violations. This table records the costs the design accepts
> deliberately, so a reviewer does not have to rediscover whether they were
> considered.

| Cost accepted | Why | Simpler alternative rejected because |
|---|---|---|
| The whole DOM is rendered, no windowing | Native scrolling and sticky positioning close three recorded defects at once, and 320 rows with ~50–130 blocks is inside what a browser lays out without help | Keeping windowing keeps the viewport that owned scroll and zoom, which is where all three defects live. The design document's virtualization section is corrected (FR-070) rather than obeyed |
| A pinned event that cannot claim strips is committed unclaimed with a warning | The product owner's rule is that pins are fixed. Dropping or moving a pin because two pins collide would silently undo an organizer's decision | Failing the whole run on a pin collision would make one bad pin block scheduling everything else |
| Two layout modules move out of `components/canvas/` | The store already reads one of them against the import direction, and the unified findings selector needs the other | Importing `lanes.ts` from the store as well would make the exception the rule |
| Serialization v3 refuses v2 with no migration | The product is unreleased and the project's rule is no backwards compatibility | A lenient read that ignored the removed keys would let a v2 link load with silently different per-event settings |
| Selection lives in the store, against alignment §4.1's placement in browser storage | Three components read it and a dock chip writes it; a stored selection is meaningless on reload | Component state lifted to the shell would thread a prop through six components for a value the store already models cleanly |
