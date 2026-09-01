---

description: "Task list for P3 Workbench Shell and Canvas"
---

# Tasks: P3 Workbench Shell and Canvas

**Input**: Design documents from `/specs/004-p3-workbench-shell/`

**Prerequisites**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/ui-contract.md](./contracts/ui-contract.md), [quickstart.md](./quickstart.md)

**Tests**: Mandatory. Constitution II requires tests written before the
implementation they describe, run to confirm they fail for the stated reason.

**Git flow**: **Worktree.** Subagents commit incrementally to
`004-p3-workbench-shell`. Checkpoint tasks marked *(subagent commits)* are where
drift counts, before-and-after numbers, and deliberate corrections are recorded.
The user lands the branch with `git merge --no-ff --no-commit` completed by
`commit-with-costs`. No agent pushes, merges, or makes the closing commit.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel – different files, no dependency on incomplete work
- **[Story]**: US1–US5, mapping to the user stories in spec.md

## Standing rules for every phase

- **Dispatch `test-quality-reviewer`** after any task that adds or edits tests.
- **Dispatch `react-code-reviewer`** after any task touching React.
- **Coding subagents default to Sonnet.** Opus is for the complicated ones – the
  canvas windowing (T032–T035) and the drift gate (T060–T062) are the tasks that
  earn it.
- **`scripts/smoke.mjs` is repaired in the task that reshapes the control it
  drives**, never in a cleanup pass and never rewritten from scratch. Every
  locator in it currently targets deleted UI, so this is spread across US1 and
  US2 (research D12).
- **Only US4 may change engine output.** Any other task producing a B1–B8 diff
  is a bug in that task.

---

## Phase 1: Setup

**Purpose**: Isolate the work and capture the numbers the drift gate will need.

- [x] T001 Confirm the starting point and record it: the worktree is on `004-p3-workbench-shell`, the working tree is clean, every artifact under `specs/004-p3-workbench-shell/` is present and tracked, and the branch's merge-base with `main` is noted for T002's baseline. **The worktree and branch already exist** – `scripts/run-chain.sh` creates them before the first session runs, and the feature's artifacts landed on `main` in 60d7fd39df so the checkout carries them
- [x] T002 Capture the pre-change B1–B8 baseline – scheduled event count, pool referee demand, and DE referee demand per scenario – into `specs/004-p3-workbench-shell/drift-baseline.md`, before any source file is edited, so the US4 gate compares against untouched `main` *(subagent commits)*

**Checkpoint**: Worktree ready, baseline recorded.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Viewer-preference persistence, which US1, US2, and US3 all read.

**⚠️ No user story work begins until this phase is complete.**

- [x] T003 Write failing tests for the view-state module in `__tests__/store/viewState.test.ts` – round-trips through `localStorage`, returns defaults when the key is absent or unparseable, and is untouched by `serializeState`
- [x] T004 Implement the view-state module in `src/store/viewState.ts` per [data-model.md](./data-model.md) §New: view state, keeping it outside `src/store/serialization.ts` so an unnamed field cannot reach a share URL (research D10)
- [x] T005 Dispatch `test-quality-reviewer` on T003's tests

**Checkpoint**: Viewer preferences persist. User stories may begin.

---

## Phase 3: User Story 1 – The workbench shell (Priority: P1) 🎯 MVP

**Goal**: One full-bleed screen replaces both layouts, with the existing
schedule table as the center content (research D11).

**Independent Test**: Open the app with no URL fragment – a populated schedule
is on screen in the first frame with no click, no layout toggle exists, and
neither prior layout is reachable. Edit a fencer count and the drawer's numbers
move without a second action.

### Tests for User Story 1 ⚠️ Write first, confirm they fail

- [x] T006 [P] [US1] Write failing tests for the shell's four regions in `__tests__/components/workbench/WorkbenchShell.test.tsx` – top bar, rail, center, drawer, and the unplaced tray each present and locatable by accessible name per [contracts/ui-contract.md](./contracts/ui-contract.md) §Regions
- [x] T007 [P] [US1] Write failing tests for boot behavior in `__tests__/components/workbench/boot.test.tsx` – with no URL fragment a preset is loaded and auto-scheduled, and the center shows its schedule (FR-007)
- [x] T008 [P] [US1] Write failing tests for the invalid-configuration rule in `__tests__/components/workbench/invalidState.test.tsx` – the center keeps the last valid content, dimmed, with blocking findings overlaid, and never blanks (FR-009)
- [x] T009 [P] [US1] Write failing tests for two-tier recompute in `__tests__/components/workbench/recompute.test.tsx` – findings and metrics update per keystroke while the center relayouts only on commit (FR-008)
- [x] T010 [P] [US1] Write failing tests for the unplaced tray in `__tests__/components/workbench/UnplacedTray.test.tsx` – lists every event without a placement and stays identifiable when empty

### Implementation for User Story 1

- [x] T011 [US1] Scaffold the shell's four regions plus the tray in `src/components/workbench/WorkbenchShell.tsx`, full-bleed, replacing the `max-w-4xl` card stack (FR-002)
- [x] T012 [P] [US1] Build the top bar in `src/components/workbench/TopBar.tsx` – preset picker, tournament type, days, strips, `Auto-schedule all`, save and share (FR-003). The gears control is added by US5; leave no placeholder
- [x] T013 [P] [US1] Build the left rail in `src/components/workbench/Rail.tsx` with collapsible panels, re-homing `StripSetup`, `FencerCounts`, `CompetitionOverrides`, and the non-top-bar half of `TournamentSetup` (FR-004)
- [x] T014 [P] [US1] Build the unplaced tray in `src/components/workbench/UnplacedTray.tsx` (FR-005)
- [x] T015 [P] [US1] Build the resizable bottom drawer in `src/components/workbench/Drawer.tsx`, re-homing `AnalysisOutput` as the findings list (FR-006). The scorecard is added by US3
- [x] T016 [US1] Re-point `ScheduleOutput` at derived placements and mount it as the center content, grouped by day (FR-024)
- [x] T017 [US1] Implement the dimmed-invalid overlay so the center never blanks (FR-009)
- [x] T018 [US1] Implement two-tier recompute – per-keystroke findings, on-commit center relayout (FR-008)
- [x] T019 [US1] Boot the app with a preset loaded and auto-scheduled in `src/App.tsx`, preserving the existing `#config=` fragment handling (FR-007)
- [x] T020 [US1] Delete `src/components/wizard/` (5 files), `src/components/KitchenSinkPage.tsx`, `src/components/sections/TemplateSelector.tsx`, `src/components/sections/ActionButtons.tsx`, and the `layoutMode` slice and layout toggle from `src/store/store.ts` and `src/App.tsx` (FR-001)
- [x] T021 [US1] Work through the 52 cases in `__tests__/components/KitchenSinkPage.test.tsx` one at a time – re-target surviving behavior at the workbench, delete what asserted kitchen-sink composition – then delete the file (research D12)
- [x] T022 [US1] Work through the 27 cases in `__tests__/components/WizardShell.test.tsx` the same way – wizard navigation and step sequencing are deleted, not re-targeted – then delete the file (research D12)
- [x] T023 [US1] Re-point the `scripts/smoke.mjs` steps that drove deleted controls at their workbench replacements – the `Single Page` and `Wizard` tabs, `Generate Schedule`, `Save / Load / Share`, `Suggest`, `Number of strips`, `Generate Link`, and the fencer-count spinbutton. Preserve the header comment's corrections where the selector they describe survives in a new form; delete the wizard walk (constitution VI)
- [x] T024 [US1] Dispatch `test-quality-reviewer` on T006–T010 and the re-targeted cases from T021–T022
- [x] T025 [US1] Dispatch `react-code-reviewer` on T011–T019

**Checkpoint**: One screen, both layouts gone, smoke passing against it. US1 is independently shippable. *(subagent commits)*

---

## Phase 4: User Story 2 – The matrix canvas (Priority: P2)

**Goal**: The center region becomes a strips × time matrix the organizer can
read and navigate, with a view toggle back to the schedule table.

**Independent Test**: Every scheduled event appears as a block on the right
strips at the right times. Each encoding channel reads correctly for a known
event. Zoom and scroll across the largest preset keeps blocks correctly
positioned. Toggling to the schedule table shows the same events, days, and
times.

### Tests for User Story 2 ⚠️ Write first, confirm they fail

- [x] T026 [P] [US2] Write failing tests for the category palette in `__tests__/components/canvas/palette.test.ts` – all 16 values map to a token, the four families are distinct, and lightness within a family follows the age or division ordering ([data-model.md](./data-model.md) §Category families)
- [x] T027 [P] [US2] Write failing tests for window arithmetic in `__tests__/components/canvas/windowing.test.ts` – visible row range from scroll and viewport, visible time range from scroll and zoom, and flat-row-index to day-and-strip resolution across day groups
- [x] T028 [P] [US2] Write failing tests for block geometry in `__tests__/components/canvas/geometry.test.ts` – x, width, y, and height derived from placement and the engine's duration math, never stored, and identical across repeated derivations (FR-013)
- [x] T029 [P] [US2] Write failing tests for encoding and degradation in `__tests__/components/canvas/EventBlock.test.tsx` – the four channels per [contracts/ui-contract.md](./contracts/ui-contract.md) §Encoding contract, and the degradation order label text, then icon, then label prefix, with fill and edge-bar never dropping
- [x] T030 [P] [US2] Write failing tests for tooltip contents in `__tests__/components/canvas/CanvasTooltip.test.tsx` – every field FR-022 lists, plus whatever the block dropped for want of width
- [x] T031 [P] [US2] Write failing tests for view equivalence in `__tests__/components/canvas/viewEquivalence.test.tsx` – for a given tournament state the set of (event, day, start, end, strips) tuples is identical in the matrix and the schedule table (FR-023). This is the assertion most likely to catch a silent divergence

### Implementation for User Story 2

- [x] T032 [P] [US2] Define the 16-value palette as CSS custom properties in `src/index.css` beside the existing brand tokens, with the category-to-token mapping in `src/components/canvas/palette.ts` (research D4)
- [x] T033 [P] [US2] Draw the foil, épée, and sabre glyphs as inline SVG in `src/components/canvas/WeaponGlyphs.tsx` – lucide has no equivalents (FR-016)
- [x] T034 [US2] Implement the time scale and hour axis as arithmetic over the visible window in `src/components/canvas/MatrixCanvas.tsx`, adding no charting dependency (research D1)
- [x] T035 [US2] Implement row and time windowing in `src/components/canvas/MatrixCanvas.tsx` – direct index arithmetic over uniform row heights, with a day-boundary lookup for day groups. No unbounded iteration (research D2, constitution IV)
- [x] T036 [US2] Implement the frozen strip-label gutter and sticky day header bands (FR-019)
- [x] T037 [US2] Implement `src/components/canvas/EventBlock.tsx` – fill, left edge-bar and hatch, weapon icon, gender label prefix, and the degradation order (FR-014, FR-016)
- [x] T038 [US2] Implement `src/components/canvas/CanvasTooltip.tsx` as a controlled Radix tooltip on a positioned anchor, driven by one canvas-level pointer handler, not per-block listeners (research D3, FR-022)
- [x] T039 [US2] Implement continuous cursor-anchored time zoom, the stepped row-height control, and the fit-to-day, fit-to-tournament, and zoom-to-selection actions, persisting through `viewState` (FR-017, FR-018, FR-020)
- [x] T040 [US2] Implement the Matrix ⇄ Schedule toggle over the shared derived model, making the matrix the default view (FR-023)
- [x] T041 [US2] Extend `scripts/smoke.mjs` to drive the matrix – switch views, confirm blocks render, hover one and read its tooltip, and confirm the two views agree (constitution VI)
- [x] T042 [US2] Dispatch `test-quality-reviewer` on T026–T031
- [x] T043 [US2] Dispatch `react-code-reviewer` on T032–T040

**Checkpoint**: The matrix renders, reads correctly, and agrees with the schedule table. *(subagent commits)*

---

## Phase 5: User Story 3 – The scorecard (Priority: P3)

**Goal**: The drawer reports what this schedule costs, against the loaded preset
as a frozen baseline.

**Independent Test**: Load a preset, change an input, and each metric shows the
correct delta from the preset's frozen baseline. Expand for the full set.
Reload and the expansion state persists but did not travel in a shared URL.

### Tests for User Story 3 ⚠️ Write first, confirm they fail

- [x] T044 [P] [US3] Write failing tests for baseline capture in `__tests__/store/scorecardBaseline.test.ts` – captured once at preset load, unmoved by subsequent edits, absent from `serializeState`, and absent entirely when no preset is loaded (research D9)
- [x] T045 [P] [US3] Write failing tests for the metric selectors in `__tests__/store/scorecardMetrics.test.ts` – every metric in [contracts/ui-contract.md](./contracts/ui-contract.md) §Scorecard contract, derived purely from store inputs
- [x] T046 [P] [US3] Write failing tests for the scorecard's states in `__tests__/components/workbench/Scorecard.test.tsx` – collapsed set, expanded set, deltas with a preset, no deltas without one, and no aggregate score in any state (FR-025)

### Implementation for User Story 3

- [x] T047 [US3] Add the non-serialized baseline slice to `src/store/store.ts`, captured on preset load (research D9)
- [x] T048 [US3] Add the scorecard metric selectors to `src/store/derived.ts`, reading referee requirements, strip allocations, finish times, and findings the engine already produces – adding no engine calculation
- [x] T049 [US3] Build `src/components/workbench/Scorecard.tsx` – collapsed by default with finish time and peak referee demand, expanding to the full set, every metric carrying its delta (FR-026 to FR-028)
- [x] T050 [US3] Wire metric hover to highlight the driving blocks on the canvas (FR-029)
- [x] T051 [US3] Persist expansion state through `viewState`, confirming it stays out of the share URL (FR-030)
- [x] T052 [US3] Extend `scripts/smoke.mjs` to read the collapsed scorecard, change an input, and confirm a delta appears (constitution VI)
- [x] T053 [US3] Dispatch `test-quality-reviewer` on T044–T046
- [x] T054 [US3] Dispatch `react-code-reviewer` on T049–T051

**Checkpoint**: The scorecard reports deltas against a frozen baseline. *(subagent commits)*

---

## Phase 6: User Story 4 – Per-type defaults (Priority: P4) ⚠️ DRIFT GATE

**Goal**: Picking a tournament type fills in what that type usually means,
without ever destroying a value the organizer set.

**⚠️ This is the only story that changes engine output. Constitution III
governs it.** Two changes land together – research D5 (`RefPolicy.AUTO`
resolving per type, affecting B6 only) and research D6 (`de_mode` defaulting to
staged at NAC, affecting B1, B2, B3, B7, and B8). D6 is the larger drift, and
P1's DE referee correction means staged-DE referee figures run roughly fourfold.
The task does not close until the diff is explained.

**Independent Test**: Pick each tournament type and confirm referee count, video
strips, and DE mode take that type's values, are legible on the collapsed panel,
and can be overridden. Then set a value by hand, change the type, and confirm
the hand-set value survives.

### Pre-task: the merged tree must be green before the gate runs

- [X] T054a [US4] Re-vehicle the two US3 scorecard tests that the 008 merge
  invalidated – both used "preset B2 schedules nothing" as their fixture and 008
  made B2 schedule 24. The behavior each pins survives unchanged in strength: the
  capture rule firing over an empty placement map, and a null *baseline entry*
  rendering no delta rather than a delta against nothing (S6 mutation M09). Added
  2026-08-31 under constitution 1.6.0, whose post-merge gate exists because of
  this exact collision. The drift gate cannot re-baseline against a red suite
  *(subagent commits)*

### Tests for User Story 4 ⚠️ Write first, confirm they fail

- [X] T055 [P] [US4] Write failing tests for the default table in `__tests__/store/typeDefaults.test.ts` – every tournament type maps to the row in [data-model.md](./data-model.md) §Per-type default table
- [X] T056 [P] [US4] Write failing tests for resolution in `__tests__/store/buildConfig.typeDefaults.test.ts` – `AUTO`, `AUTO`, and `null` resolve to the type's values; `ONE`, `TWO`, `SINGLE_STAGE`, `STAGED`, and any number including `0` resolve to themselves; nothing is written back to the store ([data-model.md](./data-model.md) §Resolution rules)
- [X] T057 [P] [US4] Write failing tests for precedence in `__tests__/store/typeDefaultPrecedence.test.ts` – an explicit value survives any number of type changes (FR-037, SC-012), while the regional cut override still beats an explicit cut setting, which is the opposite direction (FR-040)
- [X] T058 [P] [US4] Write failing tests for the Advanced panel in `__tests__/components/workbench/AdvancedPanel.test.tsx` – defaults readable as dim text when collapsed, and following-default distinguishable from explicitly-set (FR-035, FR-039)

### Implementation for User Story 4

- [X] T059 [US4] Create the per-type default table in `src/store/typeDefaults.ts` ([data-model.md](./data-model.md) §Per-type default table)
- [X] T060 [US4] Widen the store's `CompetitionConfig.de_mode` to `DeModeSetting` with `AUTO` as the default for a new event, and make `video_strips_total` nullable defaulting to `null`, in `src/store/store.ts`. The engine's `DeMode` and `Competition` are not touched (research D6, D7, constitution I)
- [X] T061 [US4] Resolve all three defaults in `src/store/buildConfig.ts`, alongside the regional cut override already at line 139. `src/engine/pools.ts` is not modified – `resolveRefsPerPool` never learns about tournaments (research D5, constitution I)
- [X] T061a [US4] Resolve `strips_allocated` in `src/store/buildConfig.ts`, which
  sends a hardcoded `0` at line 151 where the ledger's factory pre-allocates
  `max(2, ceil(fencer_count / 7))` (`__tests__/helpers/scenarios.ts:69`). This is
  the fourth seam of the four `specs/006-day-axis-parity/parity-exceptions.md`
  names, and the one no D5/D6/D7 task covers – it is required to close B4 and,
  jointly with `de_mode`, B8. **Store-side only**, so the B1–B8 ledger table T062
  diffs against is untouched. Expect the app-path B4 pin to move 16 → 0 as the
  feasibility gate starts firing: an explained drop, recorded in
  `parity-exceptions.md` §B4, not a regression. Added 2026-08-31
- [X] T062 [US4] **Run the drift gate.** Execute B1–B8 and diff against `specs/004-p3-workbench-shell/drift-baseline.md` from T002. Scheduled event counts MUST be identical – any drop halts the task until the cause is identified and recorded. Explain every referee movement: B6's pool demand roughly halving from D5, and B1/B2/B3/B7/B8's DE demand rising from D6. Record before-and-after figures per scenario in the commit message (constitution III) *(subagent commits)*
- [X] T063 [US4] Re-baseline the B1–B8 integration referee assertions in `__tests__/engine/integration.test.ts` to the explained figures from T062, and record in `specs/004-p3-workbench-shell/research.md` that the drift was reviewed rather than accepted
- [X] T063a [US4] Re-measure the three app-path parity pins in
  `__tests__/store/appPathParity.test.ts` – B4 (16), B6 (43), B8 (53) – against
  the post-D5/D6/D7/T061a code, and record whatever they measure rather than
  adjusting anything to reach a hoped-for number. Then reconcile
  `specs/006-day-axis-parity/parity-exceptions.md`: close B4 and B8 if they reach
  their ledger counts, and **re-assign B6's `closedBy` to its own future
  feature** – B6 closes only by the ledger's factory adopting
  `REGIONAL_CUT_OVERRIDES`, a constitution III change to the ledger's own
  recorded behavior, deliberately out of this story's scope. That re-assignment
  requires relaxing the `closedBy` assertion at `appPathParity.test.ts:216` from
  `toContain('004 US4')` to requiring a non-empty named closing feature, which
  issue #255 (008 T010) already anticipated. A pin off the ledger's count with no
  matching `parity-exceptions.md` entry fails the suite, so a stale entry fails
  loudly. Added 2026-08-31 *(subagent commits)*
- [X] T064 [US4] Update `src/store/serialization.ts` for the nullable video strip count and the widened DE mode, keeping `schemaVersion` at `2` with new fields optional on read and always written on save (research D8)
- [X] T065 [US4] Build `src/components/workbench/AdvancedPanel.tsx` in the rail – the three defaults, dim on the collapsed panel, with following-default distinguishable from explicit (FR-031, FR-035, FR-039). Hard policies are absent (FR-040)
- [X] T066 [US4] Extend `scripts/smoke.mjs` to change the tournament type and confirm a hand-set value survives it – the behavior the spec's clarification settled (constitution VI)
- [X] T067 [US4] Dispatch `test-quality-reviewer` on T055–T058 and the re-baselined assertions in T063
- [X] T068 [US4] Dispatch `react-code-reviewer` on T065

**Checkpoint**: Per-type defaults apply, explicit values survive type changes, and the drift is explained and recorded. *(subagent commits)*

---

## Phase 7: User Story 5 – The gears surface (Priority: P5)

**Goal**: The settings the store already carries become reachable, editable, and
resettable.

**Independent Test**: Open the gears, confirm every listed setting with its
default, change one and confirm it is marked overridden and the schedule
reflects it, reset it, and confirm a shared URL carries only what was changed.

### Tests for User Story 5 ⚠️ Write first, confirm they fail

- [ ] T069 [P] [US5] Write failing tests for the widened `globalOverrides` in `__tests__/store/globalOverrides.test.ts` – the three existing settings plus the four P1 constants reach `buildConfig` and change the derived schedule
- [ ] T070 [P] [US5] Write failing tests for override-versus-default derivation in `__tests__/components/workbench/SettingsPanel.test.tsx` – derived by comparison with no stored flag, reset restores the default, matching the `PoolDurationSettings` pattern (research D8)
- [ ] T071 [P] [US5] Write failing tests for overrides-only serialization in `__tests__/store/settingsSerialization.test.ts` – two overridden settings round-trip, unset settings track their defaults, and a URL saved without the new keys opens at defaults (FR-045)

### Implementation for User Story 5

- [ ] T072 [US5] Widen `globalOverrides` in `src/store/store.ts` with `SLOT_MINS`, per-weapon `DE_BOUT_DURATION`, `YOUTH_VET_BOUT_DELTA`, and `DEFAULT_DE_STRIP_FOOTPRINT`, and feed them through `src/store/buildConfig.ts` alongside the three already at line 55 (research D8)
- [ ] T073 [US5] Build `src/components/workbench/SettingsPanel.tsx` covering every setting in [contracts/ui-contract.md](./contracts/ui-contract.md) §The gears panel, reusing the existing `DefaultLabel` component rather than a second convention
- [ ] T074 [US5] Move `PoolDurationSettings` out of the rail and behind the gears, keeping `__tests__/components/sections/PoolDurationSettings.test.tsx` passing against its new home (FR-043)
- [ ] T075 [US5] Add the gears control to `src/components/workbench/TopBar.tsx` (FR-041)
- [ ] T076 [US5] Extend `src/store/serialization.ts` for the widened overrides, optional on read (FR-045)
- [ ] T077 [US5] Extend `scripts/smoke.mjs` to open the gears, change a setting, confirm the schedule follows, and confirm it round-trips through a share link (constitution VI)
- [ ] T078 [US5] Dispatch `test-quality-reviewer` on T069–T071
- [ ] T079 [US5] Dispatch `react-code-reviewer` on T073–T075

**Checkpoint**: Three settings that were saved, shared, and unreachable are now reachable. *(subagent commits)*

---

## Phase 8: Validation & Handoff

**Purpose**: Confirm the whole feature, then stop. The closing merge is the
user's.

- [ ] T080 Run the full gate – `tsc -b`, `lint`, and the full test suite – and confirm no test in the suite references `WizardShell`, `KitchenSinkPage`, or `layoutMode` (FR-046, SC-010)
- [ ] T081 Run `scripts/smoke.mjs` end to end against the finished workbench. Dispatch this to a subagent – locator repair runs in rounds of four or five full round trips, and an orchestrator deep into a feature pays its whole context for each (constitution §Orchestration)
- [ ] T082 Make the two human judgments [quickstart.md](./quickstart.md) §What a human has to confirm names – SC-004 encoding legibility at normal row height, and SC-002 pan and zoom responsiveness on the largest preset. A failure here is a finding against the palette or the windowing, not a matter of taste
- [ ] T083 [P] Update `docs/design/backlog.md` – close the per-type defaults entry, and narrow the global settings entry to what remains for after P5, per the split recorded on 2026-08-29
- [ ] T084 [P] Update `docs/design/competition-planner-workbench.md` – mark the P3 roadmap row delivered, and record in the design's own text that the canvas is plain SVG rather than visx, pointing at [research D1](./research.md) for the reasoning
- [ ] T085 Confirm the branch is ready and hand the user a resume prompt naming the merge command. **The resume prompt names the post-merge gate** – constitution 1.6.0 requires `tsc -b`, `lint`, and the full suite to run on the merged tree after `git merge --no-ff --no-commit` and before `commit-with-costs` writes the merge commit. Agents do not push, do not merge, and do not make the closing commit (constitution §Git Ownership)

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (T001–T002)**: no dependencies. T002 must precede every source edit.
- **Foundational (T003–T005)**: blocks all user stories.
- **US1 (T006–T025)**: depends on Foundational. Blocks every other story – it deletes the old layouts and creates the regions the rest mount into.
- **US2 (T026–T043)**: depends on US1.
- **US3 (T044–T054)**: depends on US1 for the drawer. T050's metric-hover highlighting depends on US2.
- **US4 (T055–T068)**: depends on US1 for the rail, and on T002 for its baseline.
- **US5 (T069–T079)**: depends on US1 for the top bar.
- **Validation (T080–T085)**: depends on every story that is being shipped.

### Story independence

US1 is the hard prerequisite – it removes the old layouts, so nothing after it
is written against a codebase with two live shells. Once US1 lands, US2, US4,
and US5 touch different regions and different store slices and can proceed in
parallel. US3 is the exception: shippable after US1 with T050 deferred until US2
exists.

### Within each story

Tests are written and confirmed failing before implementation. Store and data
shapes precede the components that read them. The smoke driver is repaired in
the task that reshaped the control, not afterwards.

---

## Parallel Opportunities

**Setup and Foundational**: nothing parallel – T002 must complete before any
edit, and T004 depends on T003.

**Within US1**: T006–T010 all write different test files and run together.
T012–T015 build four different components and run together once T011's scaffold
exists.

**Within US2**: T026–T031 run together. T032 and T033 are independent of each
other and of the canvas mechanics.

**Within US4**: T055–T058 run together. **T059 through T063 are strictly
sequential** – the drift gate cannot run before the change it measures, and the
re-baseline cannot precede the explanation.

**Across stories, after US1**: US2, US4, and US5 are independent.

---

## Implementation Strategy

### MVP

Phase 1 → Phase 2 → Phase 3. At the US1 checkpoint the app is one screen with a
real schedule on it and both old layouts gone. That is a shippable increment and
the phase's user-visible thesis.

### Incremental delivery

Each checkpoint is a stopping point. US2 makes the schedule spatial, US3 makes
its cost legible, US4 removes repetitive setup, US5 reaches settings that were
already there. Any prefix of the five is a coherent product.

### Where the risk is

- **T062, the drift gate.** Two behavior changes land together and referee
  figures move on six of eight scenarios. The failure mode is a plausible number
  hiding a regression, which is exactly what constitution III exists for.
- **T034–T035, the canvas mechanics.** The only non-trivial rendering work in
  the feature, and where rejecting visx (research D1) is either vindicated or
  reversed. Reversal is one task and the windowing work survives it.
- **T023, the smoke driver.** Every locator targets deleted UI. Repairing it in
  place preserves the accumulated record; rewriting it discards that record and
  rediscovers the same failures (constitution VI).

---

## Notes

- `[P]` marks different files with no dependency on incomplete work.
- Verify tests fail for the stated reason before implementing.
- Checkpoints marked *(subagent commits)* are where the working record is
  written – drift counts, before-and-after numbers, deliberate corrections.
- The user makes the closing merge with `commit-with-costs`. Stop when the
  branch is ready.
