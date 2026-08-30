# Triage Record

One row per test case carried over from the layout that `004`'s workbench
shell replaces. Column meanings, the invariants each row must satisfy, and the
verified source counts live in
[`data-model.md`](./data-model.md) §Triage record — this file does not restate
them. `Decision` and `Destination / reason` are left blank here; T006–T008
fill them in.

Rows are numbered within each source file so the tally is countable at a
glance: 47 + 27 + 4 = 78.

---

## `__tests__/components/KitchenSinkPage.test.tsx` (47)

| # | Source (describe block) | Case | Decision | Destination / reason |
|---:|---|---|---|---|
| 1 | KitchenSinkPage render tests | renders without crashing | | |
| 2 | KitchenSinkPage render tests | renders tournament type dropdown | | |
| 3 | KitchenSinkPage render tests | renders days input | | |
| 4 | KitchenSinkPage render tests | renders strips input | | |
| 5 | KitchenSinkPage render tests | renders video strips input | | |
| 6 | KitchenSinkPage render tests | renders template selector | | |
| 7 | KitchenSinkPage render tests | renders no Validate button — findings derive on every render | | |
| 8 | KitchenSinkPage render tests | renders Generate Schedule button | | |
| 9 | KitchenSinkPage render tests | renders Save to File button | | |
| 10 | KitchenSinkPage render tests | renders Generate Link button | | |
| 11 | KitchenSinkPage render tests | shows findings on first render with no validate run | | |
| 12 | KitchenSinkPage render tests | shows the analysis empty state when the inputs raise nothing | | |
| 13 | KitchenSinkPage render tests | shows the schedule empty state before anything is placed | | |
| 14 | KitchenSinkPage render tests | shows empty fencer counts message when no competitions selected | | |
| 15 | KitchenSinkPage render tests | renders competition toggles when template is applied | | |
| 16 | KitchenSinkPage render tests | renders file input for loading configurations | | |
| 17 | KitchenSinkPage user flow tests | selecting a template checks competition toggles | | |
| 18 | KitchenSinkPage user flow tests | selecting a template shows fencer count inputs | | |
| 19 | KitchenSinkPage user flow tests | entering fencer counts updates the inputs | | |
| 20 | KitchenSinkPage user flow tests | analysis output follows an input change with no run in between | | |
| 21 | KitchenSinkPage user flow tests | validation errors appear when strips is 0 with competitions selected | | |
| 22 | KitchenSinkPage user flow tests | clicking Generate Schedule writes placements and renders the derived table | | |
| 23 | KitchenSinkPage user flow tests | full flow: template -> strips -> fencer counts -> findings track every edit | | |
| 24 | KitchenSinkPage store integration tests | changing tournament type updates store state | | |
| 25 | KitchenSinkPage store integration tests | changing days input updates store state | | |
| 26 | KitchenSinkPage store integration tests | changing strips input updates store state | | |
| 27 | KitchenSinkPage store integration tests | changing fencer count input updates store state | | |
| 28 | KitchenSinkPage store integration tests | applying a template immediately changes what the analysis shows | | |
| 29 | SaveLoadShare save tests | clicking Save to File triggers URL.createObjectURL | | |
| 30 | SaveLoadShare save tests | saved JSON carries the v2 shape including placements | | |
| 31 | SaveLoadShare load tests | loading valid JSON hydrates store state | | |
| 32 | SaveLoadShare load tests | loading a placement whose event is not selected reports the drop | | |
| 33 | SaveLoadShare load tests | loading a file with no orphan placements shows no drop notice | | |
| 34 | SaveLoadShare load tests | loading valid JSON clears any previous load error | | |
| 35 | SaveLoadShare load tests | loading invalid JSON shows error message | | |
| 36 | SaveLoadShare load tests | loading JSON with wrong schema shows error message | | |
| 37 | KitchenSinkPage error state tests | malformed file upload shows error message | | |
| 38 | KitchenSinkPage error state tests | Generate Schedule is disabled while derived findings hold a hard error | | |
| 39 | KitchenSinkPage error state tests | Generate Schedule is enabled once the hard error is fixed | | |
| 40 | KitchenSinkPage error state tests | schedule output renders a row derived from a seeded placement | | |
| 41 | KitchenSinkPage error state tests | a placement on a day past days_available is flagged, not hidden | | |
| 42 | KitchenSinkPage error state tests | Generate Link produces URL containing #config= hash | | |
| 43 | AnalysisOutput section | shows Validation heading when the inputs produce validation errors | | |
| 44 | AnalysisOutput section | shows Warnings heading when the analysis raises warnings | | |
| 45 | AnalysisOutput section | shows Flighting Suggestions heading with Accept/Reject buttons | | |
| 46 | AnalysisOutput section | clicking Accept changes suggestion state to Accepted | | |
| 47 | AnalysisOutput section | clicking Reject changes suggestion state to Rejected | | |

## `__tests__/components/WizardShell.test.tsx` (27)

| # | Source (describe block) | Case | Decision | Destination / reason |
|---:|---|---|---|---|
| 1 | WizardShell navigation | renders step 1 (Tournament) by default | deleted | Asserts the wizard's default step-1 rendering; the workbench has no step sequence to default into. |
| 2 | WizardShell navigation | Forward button advances to the next step | deleted | Asserts Forward-button step advancement; the workbench has no Forward button or step sequence. |
| 3 | WizardShell navigation | Back button retreats to the previous step | deleted | Asserts Back-button step retreat; the workbench has no Back button or step sequence. |
| 4 | WizardShell navigation | Back button is disabled on Step 1 (index 0) | deleted | Asserts Back-button disabled state tied to step index; the workbench has no Back button. |
| 5 | WizardShell navigation | Back button is enabled when not on Step 1 | deleted | Asserts Back-button enabled state tied to step index; the workbench has no Back button. |
| 6 | WizardShell navigation | clicking Back on Step 1 does not go below step 0 | deleted | Asserts a step-index floor on the Back button; the workbench has no Back button or step index. |
| 7 | WizardShell navigation | Forward button shows "Next" on steps 0–2 | deleted | Asserts Forward-button label switching by step; the workbench has no Forward button or steps. |
| 8 | WizardShell navigation | Forward button shows "View Schedule" on Step 4 (Analysis, index 3) | deleted | Asserts Forward-button label switching by step; the workbench has no Forward button or steps. |
| 9 | WizardShell navigation | Forward button is not rendered on Step 5 (Schedule, index 4) | deleted | Asserts Forward-button presence tied to step index; the workbench has no Forward button or steps. |
| 10 | WizardShell navigation | Forward blocked on Step 4 (Analysis) when hard ERROR validation errors exist | deleted | Asserts Forward-button disabled state gated on hard validation errors; the workbench has no Forward button. Hard-error detection itself is covered independently (e.g. KitchenSinkPage error-state tests, AnalysisOutput's Validation heading tests). |
| 11 | WizardShell navigation | Forward blocked on Step 4 does not advance step when clicked | deleted | Asserts that a disabled Forward button does not advance the step on click; the workbench has no Forward button or step index. |
| 12 | WizardShell navigation | Forward allowed on Step 4 when no hard errors | deleted | Asserts Forward-button enabled state when no hard errors; the workbench has no Forward button. |
| 13 | WizardShell navigation | fixing strips re-enables Forward without any validate run | deleted | Its navigation half (Forward-button disabled/enabled state) leaves with the Forward button. Its derived-findings half (validation recomputes on setStrips with no explicit validate call) needs no new home: it is already covered by `__tests__/store/derived.test.ts`'s `selectDerivedFindings > reports validation errors from current inputs – a zero strip count surfaces and clears`, which exercises the identical zero-strips-then-fixed sequence against the same selector this button's `disabled` prop reads. See report for the full reasoning. |
| 14 | WizardShell navigation | step indicator renders all 5 step labels | deleted | Asserts the step-indicator chrome; the workbench has no step indicator. |
| 15 | Layout toggle | default layout mode is wizard | deleted | Asserts the default `layoutMode` value; the wizard/kitchen-sink toggle leaves the product at 004's T020. The `layoutMode` field itself persists dormant in the store until then (research D6) but the toggle behavior it drives does not. |
| 16 | Layout toggle | switching to wizard layout renders wizard content | deleted | Asserts the layout toggle switching to the wizard view; the toggle and the wizard both leave the product. |
| 17 | Layout toggle | switching to kitchen-sink layout hides wizard content | deleted | Asserts the layout toggle switching to the kitchen-sink view; the toggle and the wizard both leave the product. |
| 18 | Layout toggle | wizard layout renders WizardShell step indicator labels | deleted | Asserts the layout toggle plus the step indicator it reveals; both leave the product. |
| 19 | Layout toggle | kitchen-sink layout does not render wizard step indicators | deleted | Asserts the layout toggle plus the step indicator's absence in the other mode; both leave the product. |
| 20 | Layout toggle | state (strips_total) is preserved when switching layouts | deleted | Asserts that toggling `layoutMode` does not reset unrelated store state (`strips_total`). The toggle itself is removed, so there is no longer a layout switch for any state to be preserved across. |
| 21 | Layout toggle | wizard step is preserved when switching layouts | deleted | Asserts that toggling `layoutMode` does not reset `wizardStep`. Both the toggle and the wizard-step slice's product behavior leave with the wizard. |
| 22 | ScheduleView derived output | renders no staleness banner — placements are always current | re-targeted | `__tests__/components/scheduleOutput.test.tsx`, mounts `ScheduleOutput`. Pure negative rendering check against `ScheduleOutput.tsx`, which owns the schedule-rows display. |
| 23 | ScheduleView derived output | a placement seeded into the store renders as a schedule row | re-targeted | `__tests__/components/scheduleOutput.test.tsx`, mounts `ScheduleOutput`. Asserts only `ScheduleOutput.tsx`'s own row rendering (competition id, pool-start time) and its own empty-state text. |
| 24 | ScheduleView derived output | shows the empty state when nothing is placed | re-targeted | Splits across two single-component destinations, not genuinely cross-section: `__tests__/components/scheduleOutput.test.tsx` mounting `ScheduleOutput` for "No events placed yet.", and `__tests__/components/refRequirementsReport.test.tsx` mounting `RefRequirementsReport` for "No referee demand — nothing is placed yet." Neither text depends on the other component being present — the original case bundled two independent single-component empty states because it rendered the composite `ScheduleView`. See report. |
| 25 | ScheduleView derived output | referee requirements derive from the placement, not from a scheduler run | re-targeted | `__tests__/components/refRequirementsReport.test.tsx`, mounts `RefRequirementsReport`. Deviates from research D1's cluster table, which lists `ScheduleOutput` for "referee figures deriving from placements" — but `ScheduleOutput.tsx` renders no referee text at all ("Referee Requirements", "Peak Total Refs", "No referee demand..." are all `RefRequirementsReport.tsx`'s own strings). `RefRequirementsReport` is the actual smallest surviving component exhibiting this behavior, consistent with D1's own rule if not its summary table. Flagged for reconciliation — see report. |
| 26 | ScheduleView derived output | Regenerate writes placements and the derived table follows | re-targeted | `__tests__/components/scheduleView.test.tsx`, mounts `ScheduleView`. The Regenerate button and its `runScheduleAll()` call are defined directly in `src/components/ScheduleView.tsx`, which is not under `src/components/sections/` and is not among 004 T020's deletions (research D6 names only `KitchenSinkPage.tsx` and the 5 files under `wizard/`) — so it remains the smallest surviving component containing this behavior. This is a gap in D1's cluster table, which addresses only `ActionButtons`/`TemplateSelector` as deleted triggers; `ScheduleView.tsx`'s own inline button is a third, uncovered case. Flagged for reconciliation — see report. |
| 27 | ScheduleView derived output | editing a placement changes the rendered schedule with no re-run | re-targeted | `__tests__/components/scheduleOutput.test.tsx`, mounts `ScheduleOutput`. Asserts only `ScheduleOutput.tsx`'s own row rendering following a `updatePlacement` call. |

## `__tests__/store/store.test.ts` — `describe('uiSlice')` (4)

| # | Source (describe block) | Case | Decision | Destination / reason |
|---:|---|---|---|---|
| 1 | uiSlice > initial state | has correct defaults | deleted | Asserts the default values of `layoutMode` and `wizardStep`. The layout toggle and the wizard's step sequence leave the product at 004's T020, even though both fields persist dormant in the store until then (research D6). |
| 2 | uiSlice > setLayoutMode | sets layout mode to wizard | deleted | Asserts `setLayoutMode('wizard')`; the layout toggle leaves the product with the wizard/kitchen-sink distinction it switches between. |
| 3 | uiSlice > setLayoutMode | sets layout mode to kitchen-sink | deleted | Asserts `setLayoutMode('kitchen-sink')`; the layout toggle leaves the product with the wizard/kitchen-sink distinction it switches between. |
| 4 | uiSlice > setStep | sets wizardStep | deleted | Asserts `setStep`; wizard step navigation leaves the product with the wizard. |
