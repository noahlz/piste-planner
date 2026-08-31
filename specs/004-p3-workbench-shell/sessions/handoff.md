# Session handoff — 004-p3-workbench-shell

One section per session. Each records what landed, with commit SHAs, and what
the next session has to know that is not obvious from the code.

## S1

**Scope**: T001–T005 (Phase 1 Setup, Phase 2 Foundational). T006 onward belongs
to a later session and was not started.

### Tasks completed

| Task | Commit | What landed |
|---|---|---|
| T001 | – (no artifact) | Starting point confirmed: branch `004-p3-workbench-shell`, clean working tree, all 11 spec artifacts tracked, merge-base with `main` = `f9a74ca58d949ee63988b806a71c774bd2180ecd` (identical to `main` HEAD) |
| T002 | `2697446289` | `specs/004-p3-workbench-shell/drift-baseline.md` — B1–B8 baseline against untouched `main` |
| — | `b0172263ca` | `src/test-setup.ts` guard against Node ≥24's built-in webstorage (see Surprises) |
| T003 | `f15ce07952` | `__tests__/store/viewState.test.ts`, failing on module-not-found |
| T004 | `58cc1d67dd` | `src/store/viewState.ts` |
| T005 | `1bf59903b7` | `test-quality-reviewer` dispatched; its three actionable findings applied to the test file |

### Gate at end of session

`tsc -b` exit 0, `lint` exit 0, full suite **878 passed (878)**, 34 files. Run
twice during T004 to confirm stability, and once more at session close.

### The drift baseline, repeated here

Captured against `f9a74ca58d949ee63988b806a71c774bd2180ecd` on 2026-08-29,
before any source file was edited. Full detail, including the harness T062 must
reproduce, is in [`drift-baseline.md`](../drift-baseline.md).

| Scenario | Type | Scheduled events | Total competitions | Peak pool ref demand | Peak DE ref demand |
|---|---|---:|---:|---:|---:|
| B1 | NAC  | 24 | 24 | 248 | 24 |
| B2 | NAC  | 24 | 24 | 332 | 28 |
| B3 | NAC  | 24 | 24 | 304 | 24 |
| B4 | SYC  | 0  | 30 | 0   | 0  |
| B5 | SJCC | 12 | 12 | 116 | 16 |
| B6 | ROC  | 44 | 54 | 234 | 64 |
| B7 | NAC  | 18 | 18 | 340 | 20 |
| B8 | NAC  | 52 | 53 | 316 | 64 |

B4's zeros are the upfront `validateFeasibility` gate (Ruling 11), not a capture
error. Scheduled counts match `driftLedger.test.ts`'s `SCHEDULED_FLOORS`
exactly, which corroborates the harness.

What T062 should expect to move: **B6 only** for D5 (pool demand roughly
halving, refs per pool 2 → 1 at ROC), and **B1, B2, B3, B7, B8** for D6 (DE
demand rising steeply at NAC). Scheduled event counts must not move on any
scenario — a drop halts T062 (constitution III). The scenario-to-type mapping
was verified against `src/data/tournaments.ts` rather than taken from
research.md; **no discrepancy** was found.

### Surprises the next session must know

**1. Node ≥24 breaks `localStorage` under jsdom, and this feature is the first
thing in the repo to notice.** Node 24 ships a built-in global
`localStorage`/`sessionStorage`, on by default. Under vitest's jsdom
environment `globalThis === window`, and Node's accessor is already on
`globalThis` before jsdom installs its own, so jsdom's real `Storage` never
wins. Without `--localstorage-file` Node's version resolves to a bare object
with no prototype methods, so every call fails with "is not a function". This
worktree runs Node v24.14.1; CI pins Node 22, where the problem does not appear.
The repo has no `.nvmrc` and no `engines` field.

Fixed in `src/test-setup.ts` (`b0172263ca`) as a **guard**, not an override: an
in-memory `Storage`-shaped replacement is installed only when the ambient
`localStorage` lacks working methods, so it is a no-op on CI's Node 22. The
rejected alternative was `--no-experimental-webstorage` via
`poolOptions.forks.execArgv` in `vitest.config.ts` — it works on Node 24 but its
acceptance on Node 22 is unverified, and a flag adapts less well than a guard.
`vitest.config.ts` was not modified.

Two consequences for later sessions:
- Any future test touching `localStorage` — US2's zoom/scroll persistence, US3's
  scorecard expansion (T051) — depends on this guard. Do not delete it as
  redundant just because the suite is green on your machine.
- On Node 24 those tests exercise the shim, not jsdom's real `Storage`. The
  shim stores values as own enumerable properties so `Object.keys(localStorage)`
  behaves like real `Storage`, which is what the "single key" assertion relies
  on. CI on Node 22 exercises the real thing.

**2. A single green vitest run is not evidence here.** During T004 the
view-state file passed once on its own and then failed reproducibly on re-run,
which briefly made the Node 24 problem look like it did not exist. Run the
suite twice before believing a fix.

**3. Nothing was already failing before this session.** The suite was 876/876
green at `f9a74ca58d` and is 878/878 now (+2 tests from T005's findings).

### Decisions made that the plan did not anticipate

- **The view-state module's surface was designed during T003, not specified by
  the plan.** data-model.md names the seven fields but not the API. What
  landed: `ViewMode` and `RowHeightStep` as `as const` objects with derived
  union types (matching `RefPolicy`/`DeMode` per constitution V), a `ViewState`
  interface, `DEFAULT_VIEW_STATE`, `VIEW_STATE_STORAGE_KEY`, `loadViewState()`,
  and `saveViewState()`. One key holds the whole object.
- **`loadViewState()` falls back wholesale, not per field.** Any malformed
  JSON, wrong shape, missing field, or invalid union value returns
  `DEFAULT_VIEW_STATE` entire, rather than merging valid fields over defaults.
  It never throws, including when `localStorage.getItem` itself throws (Safari
  private mode). Union fields are validated against their `as const` value sets
  rather than trusted from the parse.
- **`DEFAULT_VIEW_STATE.viewMode` is `SCHEDULE`**, which is correct for US1
  (research D11: the shell ships with the schedule table in the center).
  **T040 must flip this default to `MATRIX`** when it makes the matrix the
  default view. This is the one line of the module that a later task is
  expected to change.
- **T005's review found no must-fix defects.** Three findings were applied
  (`1bf59903b7`): coverage for the `getItem`-throws branch, coverage for a
  literal JSON `null` payload, and an honest rename of the `serializeState`
  test. The reviewer's `it.each` refactor suggestion and three low-value
  mutation-coverage notes were deliberately left alone.

### Not finished, and why

Nothing in scope was left undone. T006 onward was out of this session's scope by
instruction and was not started. The next session begins at **T006** (Phase 3,
US1) with the Phase 2 checkpoint met: viewer preferences persist.

## S2

**Scope**: T006–T019 — the workbench shell, with the existing schedule table as
the center content. T020 onward was out of scope by instruction and was not
started.

### Tasks completed

| Task | Commit | What landed |
|---|---|---|
| T006–T010 | `0396cc3f7a` | Five failing test files, 16 cases, all red on module resolution |
| T011–T015 | `5c5977070b` | The four regions, the tray, `applyPreset`, `NumberInput.commitOnChange` |
| T016–T019 | `5d378f05b5` | Day-grouped `ScheduleOutput`, the dim rule, two-tier recompute, boot |
| — | `946e10df8e` | The FR-009 coverage gap, found by mutation and closed |
| T025 + T024 (part) | `084ca944f6` | Both reviews dispatched; six accepted findings applied |

### Gate at end of session

`tsc -b` exit 0, `lint` exit 0, full suite **872 passed (872)** across 41 files.
Run twice at session close with identical results, and independently by the
orchestrator after the last subagent commit.

**Suite count reconciliation.** 852 → 872, entirely additive:

```
852  at session start (005's close)
+ 16  T006–T010's five workbench files
+  2  the FR-009 suppression pair
+  2  the review fixes' new cases (preset picker, commitOnChange out-of-range)
= 872
```

**Zero engine drift, as constitution III requires of every task but US4's.**
`git diff --stat main..HEAD -- src/engine/` is empty — `src/engine/` is
byte-identical to `main`, so B1–B8 cannot have moved. `driftLedger.test.ts` and
`integration.test.ts` are in the green suite and corroborate it.

### The accessible names S3 needs

`scripts/smoke.mjs` is re-pointed at these in T023, and every locator it carries
today targets UI that T020 deletes. This table is the record.

**Regions.** Each region component owns its own landmark element —
`WorkbenchShell` composes them and adds no wrapper. This was forced by
`UnplacedTray.test.tsx` mounting the tray standalone and locating it by role;
had the shell owned the landmarks, that mount could not have passed.

| Region | Role | Accessible name |
|---|---|---|
| Top bar | `banner` | `Top bar` |
| Left rail | `complementary` | `Left rail` |
| Unplaced tray | `region` | `Unplaced events` |
| Center | `main` | `Center view` |
| Bottom drawer | `region` | `Drawer` |

**Top bar controls.**

| Control | Role | Accessible name | Id |
|---|---|---|---|
| Preset picker | `combobox` | `Preset` | `topbar-preset` |
| Tournament type | `combobox` | `Tournament type` | `topbar-tournament-type` |
| Day count | `combobox` | `Day count` | `topbar-days` |
| Strip count | `spinbutton` | `Strip count` | – |
| Auto-schedule | `button` | `Auto-schedule all` | – |
| Save and share | `button` | `Save / Share` | – |

`Save / Share` is a `Collapsible` trigger over the unmodified
`<SaveLoadShare />`, closed by default — so `Save to File`, `Load from File`,
and `Generate Link` are **not in the DOM until it is opened**. The smoke
driver's existing steps for those three need that click inserted ahead of them.

**Rail panels.** Each is a `Collapsible` whose trigger is a `button` named for
the panel. Radix unmounts closed content, so a locator inside a closed panel
finds nothing until its trigger is clicked.

| Panel (`button` name) | Contents | Open by default |
|---|---|---|
| `Tournament` | `TournamentSetup` | yes |
| `Strips` | `StripSetup` | yes |
| `Events` | `CompetitionMatrix`, `FencerCounts` | yes |
| `Per-event overrides` | `CompetitionOverrides` | no |
| `Pool durations` | `PoolDurationSettings` | no |

**Everything else with a name.**

| Thing | Role | Accessible name / text |
|---|---|---|
| Drawer resize handle | `separator` | `Resize drawer`, with `aria-valuenow/min/max` over `[96, 640]` |
| Blocking-findings overlay | `region` | `Blocking findings`, `aria-live="assertive"` |
| Overlay heading | `heading` | `Configuration is invalid` |
| Tray empty state | – | text `Every event is placed.` |
| Tray heading | `heading` | `Unplaced events` |
| Center dim marker | – | `data-dimmed="true"` / `"false"` on the content wrapper |
| Schedule day group | – | a full-width row reading `Day N`, never containing a time |

The rail's re-homed components keep the names they already had —
`Type`, `Duration`, `Number of strips`, `Number of video strips`,
`Fencer count for <label>`, `Suggest`, `Presets…`. They did not change.

### What was re-homed, and what fought

Every section component moved into the rail **unmodified** except
`FencerCounts`, which gained one prop. That was the point of keeping them: their
tests mount them directly with no props, and 005 had just finished re-targeting
those tests.

- **`TournamentSetup`, `StripSetup`, `CompetitionMatrix`, `CompetitionOverrides`,
  `PoolDurationSettings`** — mounted as-is into rail panels.
- **`AnalysisOutput`** — the drawer's findings list, as-is.
- **`ScheduleOutput`** — the center's content. T016's "re-point at derived
  placements" was **already done by P2**; what remained was the day grouping and
  one optional `schedule` prop so `CenterView` can hand it the committed model.
  Mounted with no props it behaves exactly as before.
- **`SaveLoadShare`** — behind the top bar's `Save / Share` collapsible, as-is.
- **`TemplateSelector` and `ActionButtons`** are still mounted by
  `KitchenSinkPage` and are T020's to delete.

Four things fought:

1. **FR-003 and FR-004 both claim tournament type, day count, and strip count.**
   The top bar carries them as inline controls and the rail's Tournament and
   Strips panels still carry them too, so both surfaces edit the same store
   fields. The accessible names differ deliberately on each side, so no query is
   ambiguous. The alternative — splitting `TournamentSetup` so the rail keeps
   only the day-schedule half — would have broken two of 005's freshly
   re-targeted cases, which assert `#tournament-type` and `#days-available`
   inside that component. **If the duplication is unwanted, deleting it is a
   product decision, not a cleanup**, and it belongs to whoever owns the rail.
2. **No store action loaded a preset.** `src/data/tournaments.ts` had only ever
   been read by tests, so the top bar's preset picker and FR-007's boot had
   nothing to call. New `src/store/presets.ts` holds `applyPreset`, which drives
   the store's own existing actions rather than a raw `setState`.
3. **`NumberInput` commits on blur, which FR-008 cannot live with.** "The
   drawer's numbers move as the organizer types" needs the store to move per
   keystroke. `NumberInput` gained an optional `commitOnChange`, default `false`,
   so every existing call site is untouched; `FencerCounts` is the only section
   component that sets it, plus the top bar's own Strip count.
4. **The ERROR-severity scheduling gate came back.** 005's handoff recorded it as
   a product gap for this feature rather than a test to restore: `ActionButtons`
   and `WizardShell` hold the only `severity === 'ERROR'` guards in `src/`, and
   T020 deletes both. The top bar's `Auto-schedule all` is disabled while any
   derived finding is ERROR, and `WorkbenchShell.test.tsx` covers it.

### Decisions the plan did not anticipate

- **`tasks.md` T021 and T022 were left stale, deliberately.** They still name the
  two test files 005 deleted and cite a superseded count of 52. `S3.md` carries
  the correction and is the authority. Editing `tasks.md` beyond ticking
  checkboxes is a re-plan the hook halts on, and the correction already exists
  in the place that will be read.
- **T024 is ticked nowhere.** It spans T006–T010 (done — `test-quality-reviewer`
  ran, findings applied) and the re-targeted cases from T021–T022, which belong
  to S3. T025 is ticked; T024 is not, and S3 closes it.
- **`LayoutMode` gained a third member so the workbench is reachable.**
  `WORKBENCH: 'workbench'` is now the slice's default and `App.tsx` has a third
  `Workbench` tab. Both old layouts are still live beside it, exactly as this
  session was scoped. `layoutMode` is not serialized and no test names it. T020
  deletes the whole slice, the toggle, and both layouts together.
- **`loadedPresetId` was added to the store.** The preset picker read blank after
  boot loaded a preset behind its back. It is `ScenarioId | null`, set by
  `applyPreset`, and not serialized — `serializeState` builds an explicit object
  literal, so it cannot reach a share URL. **US3's scorecard baseline (research
  D9) is captured at preset load and belongs beside this field.**
- **The center's two tiers are one guard, not two rules.** While a derived
  finding is ERROR the committed model is not replaced *at all* — the settle
  timer is never scheduled — so the center keeps the last valid layout, dimmed,
  under the overlay. `CENTER_SETTLE_MS` is 150ms and is exported from
  `CenterView.tsx`. A debounce was chosen over `useDeferredValue` deliberately:
  React flushes a deferred value inside `act()`, which would make the test that
  proves the center did *not* relayout vacuous.

### Things S3 must not be surprised by

- **A low fencer count does not produce an ERROR finding — it crashes the
  render.** `computePoolStructure` (`src/engine/pools.ts:25`) throws for
  `fencerCount <= 1`, and `initialAnalysis` calls it for *every selected
  competition regardless of placement*. Any fixture reaching for a small fencer
  count to raise an ERROR will throw instead of asserting. The workbench tests
  use `strips_total` for that, and `strips_total = 0` versus a small non-zero
  value are **not interchangeable**: `0` trips only the structural check and
  leaves pool geometry alone, so it proves dimming but not suppression.
- **The FR-009 suppression rule survived deleting its own guard.** It was found
  by mutation, not by a red test — `invalidState.test.tsx` ran on real timers and
  asserted synchronously, so the settle timer never fired inside it. Two cases
  under fake timers now fail when `if (hasBlocking) return` is removed. **A green
  suite did not tell anyone about this**, and the same shape of gap is likely
  wherever a rule only manifests after a timer.
- **`configEditing.test.tsx`'s `full flow` case has a weak half, and it is
  weak on purpose.** Its `Validation` heading assertion is satisfied by
  `setStrips(1)` before the fencer-count edits run, so it proves nothing about
  them. A probe over strip counts 1–25 established that **no** strip count makes
  the heading appear only after the edit: every fencer-count-driven ERROR rule is
  monotonic non-decreasing, and every RYC Weekend default already exceeds the
  edited value of 30. A direct store read-back of `fencer_count` now carries the
  real coverage beside it. The heading assertion is 005's, unchanged — whoever
  owns that case may want a fixture where the findings genuinely respond to the
  edit, but that means re-deciding a triaged assertion.
- **`commitOnChange` and `rejectOutOfRange` are independent flags on a shared
  primitive.** No caller sets both. On the `commitOnChange` path an out-of-range
  or unparseable entry now commits nothing and leaves the local text alone, so
  the two flags agree in effect, but they are not wired to each other.

### Reviewed and knowingly not fixed

From `react-code-reviewer`. Each is recorded rather than applied, with why.

- **The dimmed content is not `aria-hidden`.** A screen-reader user would hear
  the stale schedule read as current. Hiding it would break the cases that prove
  the content is still there, and whether the last valid layout should be
  readable while dimmed is a product decision, not a cleanup.
- **`ScheduleOutput` keeps a live store subscription while the center drives it
  from `committed`.** It re-sorts on every keystroke for no visible effect —
  wasted work FR-008 means to defer, though not a correctness bug. US2 replaces
  the center with the canvas, which is where this is worth solving.
- **`bootstrap()` runs in a `useEffect`, so the literal first browser paint can
  show the empty store for one frame.** FR-007 holds after a microtask, not at
  frame zero. Inherited from the fragment-decode effect that was already there.
  The live smoke run in T023 is where this becomes visible or doesn't.
- **The resize handle sets no `touch-action`.** Mobile and touch are out of scope
  for the roadmap.

### Not finished, and why

Nothing in scope was left undone and no halt condition fired. **T020 was not
started, by instruction** — the wizard, the kitchen sink, `TemplateSelector`,
`ActionButtons`, the `layoutMode` slice, and the layout toggle are all still
live and still rendered by `src/App.tsx`. T021–T023 and T024's second half are
S3's. The branch is handed back green, with the closing merge unmade.

## S3

**Scope**: T020–T025, closing the US1 checkpoint. T026 onward was out of scope by
instruction and was not started.

### Tasks completed

| Task | Commit | What landed |
|---|---|---|
| T020 | `0b4582ea18` | The wizard, the kitchen sink, `TemplateSelector`, `ActionButtons`, and the `layoutMode` slice, deleted |
| T021 / T022 | – (no artifact) | Nothing to fix. See below |
| T023 | `b7f23ba310` | `scripts/smoke.mjs` re-pointed at the workbench, `SMOKE PASS` |
| T024 | `4f172f66bb` | `test-quality-reviewer` dispatched, all eleven accepted findings applied |
| T025 | – | Already ticked by S2 |

### Gate at end of session

`tsc -b` exit 0, `lint` exit 0, full suite **875 passed (875)** across 41 files,
run twice with identical results by the orchestrator after the last subagent
commit. `scripts/smoke.mjs` exits 0 with `SMOKE PASS` and zero console errors.

**Suite count reconciliation.** 872 → 875, entirely additive:

```
872  at S2's close
+  1  B1's WARN-only case (invalidState)
+  1  B3's Strip count case (WorkbenchShell)
+  1  B4's cold-boot-into-invalid case (invalidState)
= 875
```

**Zero engine drift.** `git diff --stat main..HEAD -- src/engine/` is still
empty, so B1–B8 cannot have moved. Only US4 changes engine output.

### T021 and T022: none of the four files needed a mount fix

The triage was feature 005's and is finished. What was left for this session was
to check that its four destination files still pass against the shell S2 built,
and against T020's deletion. **They do, unchanged.** No mount fix was required
on any of the four, and no assertion was touched for re-targeting reasons.

Two things confirm it rather than assume it:

- All four mount section components directly – `TournamentSetup`, `StripSetup`,
  `FencerCounts`, `CompetitionMatrix`, `AnalysisOutput`, `ScheduleOutput`,
  `SaveLoadShare`, `ScheduleView`. None reaches for `KitchenSinkPage` or
  `WizardShell`, so T020 had no surface to break.
- `grep -rn "WizardShell\|KitchenSinkPage\|layoutMode"` over `__tests__/`,
  `src/`, and `scripts/` returns nothing. Run before the deletion and again at
  session close.

No halt condition fired here – nothing required re-deciding a triaged
assertion.

### Coverage knowingly dropped

Three things, all deliberate:

1. **The wizard walk in `scripts/smoke.mjs`** (screenshots `06`–`08`, the
   three-step Next loop, the `View Schedule` click, and the wizard staleness
   scan). It has no replacement – the UI it drove is gone. The file's own
   comment instructed this feature to delete it.
2. **The two layout-tab drives** (`Single Page` and `Wizard`). There are no
   tabs. `App.tsx` renders `WorkbenchShell` unconditionally.
3. **`wizardStep` and `setStep` left `UiSlice`** alongside `layoutMode`. They
   were read only by `WizardShell`, and no test named them. `UiSlice` now holds
   `loadedPresetId` and `setLoadedPresetId` alone.

**No test coverage was dropped by this session.** The 39 deletions in the
re-target/delete tally belong to feature 005 and are recorded in
`specs/005-consolidate-domain-logic/triage-record.md`. This session's test count
only rose.

### The smoke driver, locator by locator

| Original step | Now |
|---|---|
| `tab 'Single Page'` click | **deleted** – no tabs, the workbench boots directly |
| `getByText('Save / Load / Share')` readiness wait | `getByRole('button', { name: 'Save / Share' })` |
| Template ToggleGroup, `ROC Div1A/Vet` | kept, preceded by a click on `Presets…` |
| `Suggest` + `Number of strips` | unchanged – the rail's `Strips` panel is open by default |
| `Generate Schedule` | `Auto-schedule all`, disabled-guard and `02b` screenshot kept |
| Schedule rows, staleness scan | unchanged – `ScheduleOutput` now renders inside `CenterView` |
| Fencer-count edit | re-pointed with a real fix, below |
| `Generate Link` | kept, preceded by a click on `Save / Share` |
| page2's tab click and wait | replaced with the same `Save / Share` readiness wait |
| The whole wizard block | **deleted** |

Both new clicks exist for the same reason: Radix unmounts a closed
`Collapsible`'s content, so `Presets…` and `Save / Share` must be opened before
anything inside them is in the DOM at all.

**The correction this session added to the header comment.** The fencer-edit
step took `.first()` over every `Fencer count for…` spinbutton, which is
alphabetical and therefore arbitrary. `runScheduleAll` (`src/store/runActions.ts`,
from 003, and not a regression) places no event the scheduler leaves with
`pool_start === null`, so on the ROC Div1A/Vet template at the suggested 15
strips only 4 of 12 selected competitions reach the schedule table and the rest
sit in the tray. The alphabetically-first input was an unplaced competition, so
the schedule table correctly never moved. The step now reads the `Unplaced
events` region and picks the first input whose label is not in it. This is a bad
test assumption that was fixed, not an app bug.

### What the T024 review found, and why it mattered

Eleven findings, all applied. The one worth carrying forward:

**Nothing anywhere distinguished WARN from ERROR.** `CenterView.tsx`'s
`.filter(e => e.severity === 'ERROR')` and `TopBar.tsx`'s
`.some(e => e.severity === 'ERROR')` could both be mutated to treat *any*
finding as blocking and the whole workbench suite stayed green – every fixture
that reached a dim or a disable did it through `strips_total = 0`, an ERROR, and
the valid fixtures raised no findings at all. A config with only advisory notices
would have dimmed the center, covered it with `Configuration is invalid`, frozen
the layout, and disabled `Auto-schedule all`, undetected. `setDays(5)` on a
placed competition yields exactly one WARN and no ERROR, and two new cases pin
the behavior under it.

This is the same shape as the FR-009 gap S2 found by mutation. **Twice now in
this feature a green suite has said nothing about a rule it appeared to cover.**
Every new case for the four graded findings was proved by mutating the named
source line, watching the case fail, and reverting – the failure messages are in
`4f172f66bb`'s body.

Three smaller ones worth knowing:

- `vi.stubGlobal('URL', …)` in `saveLoadShare.test.tsx` was never unstubbed, and
  `vi.restoreAllMocks()` does not undo it on vitest 3.2.4 with this repo's
  config. Seven later cases in that file were running with `globalThis.URL`
  replaced by a plain object with no constructor. They passed only because
  nothing on those paths touched `URL` – the first refactor of `handleShare` to
  use `new URL(...)` would have failed them for an unrelated reason.
  `vi.unstubAllGlobals()` now sits beside it.
- **The top bar's Strip count input was in no test anywhere.** `onChange` could
  have been wired to `setVideoStrips` with the suite green. It has a case now.
- FR-009's cold-boot-into-invalid branch, documented in `CenterView.tsx`'s own
  header, had no test – every case mounted valid and then broke the config.

### Departures from the review, and things it got wrong

- **B5's expected count was wrong, and the test's existing comment was too.**
  The finding asked for `toHaveLength(2)` on the overlay's `<li>`s. The fixture
  actually renders **four**: `strips_total = 0` also trips
  `resource_precondition`, and `days_available = 0` also trips
  `same_population` against the placed competition. The case's pre-existing
  comment claiming it "isolates the second ERROR" was never true – it had simply
  never been checked. The real count is asserted, with the cascade explained.
- **A5 was investigated and left alone.** `configEditing.test.tsx`'s `full flow`
  case keeps its fixture-satisfied `Validation` heading assertion. At
  `setStrips(1)` there are 19 ERROR findings before the loop runs, so the
  heading is indeed satisfied by the fixture, and there is no better one –
  `days-available-range` is the only WARN reachable in that config and it does
  not depend on fencer counts. The read-back at line 181 does carry the real
  coverage: the sorted-first RYC Weekend id seeds to 50, so `toBe(30)` is
  loop-driven and fires with no blur, which is precisely the `commitOnChange`
  contract. Removing `commitOnChange` from `FencerCounts.tsx` fails it. **No
  re-triage proposal** – nothing here needs re-deciding.
- **`commitOnChange` and `rejectOutOfRange` are distinguished, not conflated.**
  `number-input.test.tsx` exercises one, `PoolDurationSettings.test.tsx` the
  other. The combination is untested and no caller sets both.

### Left for a later session

- **The reviewer could not sweep for test-ordering dependence** beyond the one
  mechanism it proved in `saveLoadShare.test.tsx`. If another `stubGlobal` or
  module-level mutation exists in the suite, nothing here would have found it.
- **`Object.keys(localStorage)` shim-versus-jsdom equivalence on Node 22 is
  still unverified locally.** S1's guard makes the local run exercise the shim
  and CI exercise real `Storage`. Only CI proves the second.
- **FR-003 and FR-004's duplicated controls survive.** The top bar and the rail
  both edit tournament type, day count, and strip count, with deliberately
  different accessible names. S2 recorded that deleting the duplication is a
  product decision rather than a cleanup, and that has not changed.

### Not finished, and why

Nothing in scope was left undone and no halt condition fired. The US1 checkpoint
is met: **one screen, both old layouts gone, smoke passing against it.** The
branch is handed back green, with the closing merge unmade.

## S4

**Scope**: T026–T028, T032–T036, T039 — US2's first half, the grid. T029–T031,
T037, T038, T040, T041 were out of scope by instruction and were not started.
**T042 and T043 are deliberately unticked**; see "The reviews" below.

### Tasks completed

| Task | Commit | What landed |
|---|---|---|
| T026 / T032 / T033 | `00dd12199b` | The sixteen-value palette in `index.css`, the mapping in `palette.ts`, `weaponMark` |
| T027 / T028 | `612ccef340` | `windowing.ts` and `geometry.ts`, the arithmetic everything else builds on |
| T034 / T035 / T036 / T039 | `f7a61b606f` | `MatrixCanvas.tsx` and `zoom.ts` — axis, windowing, gutter, day bands, zoom |
| T042 / T043 (part) | `d62df502d1` | Both reviews dispatched; the first seventeen accepted findings applied |
| T042 / T043 (part) | `dcdfd3701f` | The reviewers' second batch — M4 and W1–W8 |

### Gate at end of session

`tsc -b` exit 0, `lint` exit 0, full suite **1101 passed (1101)** across 46
files, run twice with identical results by the orchestrator after the last
subagent commit. `scripts/smoke.mjs` exits 0 with `SMOKE PASS` and zero console
errors, **unchanged** — nothing this session built is mounted, so that was a
regression check, not a repair.

**Suite count reconciliation.** 875 → 1101, entirely additive:

```
 875  at S3's close
+  24  T026 palette.test.ts
+  71  T027/T028 windowing.test.ts + geometry.test.ts
+  41  T039 zoom.test.ts
+  24  T034/T035/T036 MatrixCanvas.test.tsx
+  66  the review findings' new and strengthened cases
=1101
```

**A git incident, recorded because the reflog will outlive anyone's memory of
it.** The fix subagent's `git commit --amend` raced this session's handoff
commit `40493e31e1`, absorbed it, and a follow-up amend then dropped its files —
erasing it from the branch. The subagent restored it with `git reset --soft`
(soft only, the working tree was never touched) and its contents were verified
byte-identical afterwards: `handoff.md` +306, `tasks.md` +18/−9, nine tasks
ticked, T042 and T043 not. The review's second batch is therefore its own
commit rather than folded into the first, since squashing would have meant
rewriting across the handoff commit a second time.

**The lesson for later sessions: do not write the handoff while a subagent is
still working.** This session did, and only the subagent's own care caught it.

**Zero engine drift.** `git diff --stat main..HEAD -- src/engine/` is empty, so
B1–B8 cannot have moved. Only US4 changes engine output.

### What is deliberately unreachable

`MatrixCanvas` is **mounted nowhere** — not in `CenterView`, not in
`WorkbenchShell`, not in `App.tsx`. `DEFAULT_VIEW_STATE.viewMode` is still
`SCHEDULE`. The center still renders `ScheduleOutput`. **T040 mounts the canvas
and flips that default**, and it is the one line of `viewState.ts` a later task
is expected to change (S1 recorded this; it is still true).

This is why the session ends green with a passing smoke run and no driver edit.
T041 extends the driver once T040 makes the matrix reachable.

### The exact arithmetic S5 must build against

**Do not re-derive any of this.** `EventBlock` positions itself with the same
functions and the same conventions, or the two disagree.

**Conventions.** `timeZoom` is **minutes per pixel**; `geometry.pxPerMinute` is
its reciprocal and is the only place the scale is inverted — never open-code it.
Both axes return **window-relative** pixels and **neither clamps**, so a block
scrolled off the left or above the top gets a negative coordinate and slides
under the edge. Row ranges are **inclusive** both ends; time ranges are
**half-open** `[start, end)`. The day header band is an **overlay, not a row**,
so `rowsPerDay === stripsTotal` exactly and `flatRowIndex = day * stripsTotal +
strip` with no correction term.

`ROW_HEIGHT_PX`: **compact 16, normal 24, tall 36.**

**Geometry**, asserted at three zooms so the inversion cannot survive:

| Call | Result |
|---|---|
| `pxPerMinute(1 / 2 / 0.5)` | `1` / `0.5` / `2` |
| `blockX(540, 480, 1)` — 09:00 in an 08:00 window | `60` |
| `blockX(540, 480, 2)` — zoomed out | `30` |
| `blockX(540, 480, 0.5)` — zoomed in | `120` |
| `blockX(420, 480, 1)` — starts before the window | `-60`, never clamped |
| `blockX(1320, 480, 1)` — starts after the window end | `840`, uncapped |
| `blockWidth(105, 1 / 2 / 0.5)` | `105` / `52.5` / `210` |
| `blockY(5, 0, NORMAL / COMPACT / TALL)` | `120` / `80` / `180` |
| `blockY(5, 3, NORMAL)` / `blockY(3, 5, NORMAL)` | `48` / `-48` |
| `blockHeight(4, COMPACT / NORMAL / TALL)` | `64` / `96` / `144` |

**Segments**, from the engine's own output for the factory defaults (24 foil
fencers, 4 pools of 6, 4 strips, 08:00 start, 30-minute admin gap). These are
**read** from `ScheduleResult`, never recomputed, so the canvas cannot disagree
with `ScheduleOutput` about when a phase runs:

| Shape | Segments |
|---|---|
| Plain | `POOLS 480–585 ×4`, `DE 615–699 ×16` |
| Flighted | `FLIGHT_A 480–585 ×2`, `FLIGHT_B 615–720 ×2`, `DE 750–834 ×16` |
| Staged, 64 fencers | `POOLS 480–846 ×4`, `DE_PRELIMS 880–885 ×16`, `DE_ROUND_OF_16 915–1030 ×4` |

**The medal tail gets no block.** `de_total_end` is `729` on the plain event
while the last segment ends at `699` — the difference is `tailEstimateMins()`
covering bouts the scheduler deliberately does not schedule. Reading
`de_total_end` to draw a block is wrong and a test catches it.

**Flights are checked before pools.** `derive.ts` leaves `pool_start`/`pool_end`
spanning *both* flights, so an implementation that checks `pool_start` first
draws a single 480–720 block over the gap between them.

**Windowing**, against `buildDayLayout(3, 20)` — 60 rows, day boundaries at
0, 20, 40:

| Call | Result |
|---|---|
| `resolveFlatRow` `0` / `19` / `20` / `59` / `60` / `-1` | `{0,0}` / `{0,19}` / `{1,0}` / `{2,19}` / `null` / `null` |
| `flatRowIndex` `(0,0)` / `(0,19)` / `(1,0)` / `(2,19)` | `0` / `19` / `20` / `59` |
| `flatRowIndex` `(3,0)` / `(0,20)` / `(-1,0)` / `(0,-1)` | `null` (all four) |
| `visibleRowRange(0, 96, NORMAL, 60)` | `{0, 3}` — 96/24 = 4 exact; row 4 starts at the first pixel outside |
| `visibleRowRange(0, 97, NORMAL, 60)` | `{0, 4}` — visible by one pixel, included |
| `visibleRowRange(5, 96, NORMAL, 60)` | `{5, 8}` — starts at exactly `rowScroll` |
| `visibleRowRange(19 / 20 / 21, 96, NORMAL, 60)` | `{19,22}` / `{20,23}` / `{21,24}` — across the day boundary |
| `visibleRowRange(0, 96, COMPACT / TALL, 60)` | `{0, 5}` / `{0, 2}` |
| `visibleRowRange(0, 1940, NORMAL, 60)` | `{0, 59}` — viewport taller than the canvas |
| `visibleRowRange(5.9, 96, NORMAL, 60)` | `{5, 8}` — the `Math.floor` on a fractional scroll |
| `visibleTimeRange(480, 1 / 2 / 0.5, 600)` | `{480,1080}` / `{480,1680}` / `{480,780}` |
| `intersectsTimeRange([480,1080), 1079–1090 / 1080–1090)` | `true` / `false` |
| `intersectsTimeRange([480,1080), 400–480 / 400–481)` | `false` / `true` |

**`visibleRowRange`'s clamp changed during the reviews.** It now pins
`firstRow` to a newly exported `maxRowScroll(...)` — the last *full* window —
not to `totalRows - 1`. So `(58, 96, NORMAL, 60)` is `{56, 59}`, not
`{58, 59}`, and `(100, 96, NORMAL, 60)` is `{56, 59}`, not `{59, 59}`. See
"The blank canvas" below for why.

**S5 will get this wrong if it reasons from the old rule.** An over-large
`rowScroll` pins to the last full window, *not* to the last row: on the
90-row test layout, `rowScroll: 200` resolves to a first row of **70**, not 89.
The orchestrator's own proposed test expectation during the review said 89 and
was wrong, and the subagent caught it. Ask `maxRowScroll` rather than
reaching for `totalRows - 1`.

### The reviews, and why T042/T043 stay unticked

Both were dispatched against **this session's own work** — `test-quality-reviewer`
on T026–T028 (and on `zoom.test.ts` and `MatrixCanvas.test.tsx`, which T039 and
T034–T036 brought with them), `react-code-reviewer` on T032–T036 and T039. The
checkboxes name T026–T031 and T032–T040, and T029–T031, T037, T038 and T040 do
not exist yet, so **the boxes belong to S5**. S2 and S3 handled T024 the same
way. Seventeen findings were accepted and applied in `d62df502d1`, with 24
mutations run and 24 killed.

**Everything below was found by mutation, not by a red test.**

#### The blank canvas — the one real bug

**Both reviewers found it independently**, which is the strongest signal in this
session. `MatrixCanvas` positioned gutter rows and grid lines against
`rowScroll` while positioning day bands against `rowRange.firstRow`.
`visibleRowRange` clamps, so those diverge whenever the stored `rowScroll`
exceeds the layout — and it can, because `rowScroll` persists across
tournaments, `isValidViewState` accepts any non-negative integer, and nothing
re-clamps it when `setDays` or `setStrips` shrinks the layout underneath.

Scroll a large tournament to row 500, load a 3×30 one: one row renders at
`-9864px` under a floating day band, and the canvas reads as empty. The fix
puts a single named `windowStartRow` behind all three, and pins `firstRow` to
the last full window via a new exported `maxRowScroll`. The pin lives in the
pure function rather than the state initializer because the stale value arrives
by two routes — a load, and a live layout shrink under a mounted canvas — and
only the pure function covers both without a state-syncing effect.

`geometry.blockY`'s own docstring had named the correct value the whole time.
**A docstring is not a test.**

#### Three ways the wheel was broken

- **Ctrl+wheel zoomed the page as well as the canvas.** React registers `wheel`
  as a **passive** listener — verified in this repo's installed react-dom 19.2.4
  at `react-dom-client.development.js:19251-19255`, which sets `passive: true`
  for exactly `touchstart`, `touchmove`, `wheel` — so `onWheel` *cannot*
  `preventDefault`. Now a native listener attached in an effect with
  `{ passive: false }`.
- **`deltaMode` was ignored.** Firefox on Windows and Linux fires
  `DOM_DELTA_LINE` with `deltaY: ±3`, and `Math.round(3/24)` is `0`, so row
  panning never moved at all on those platforms.
- **Sub-row deltas were discarded**, so slow trackpad scrolling did nothing and
  the residue never accumulated. Now normalized by `deltaMode` with the
  fractional remainder carried in a ref.

With no keyboard path and no scrollbar, those three together left **no way to
scroll rows**. `tabIndex={0}` with arrow keys, PageUp and PageDown now sits on
the viewport (`role="group"`, `aria-label="Matrix grid"`), following
`Drawer.tsx`'s precedent.

#### A fourth "green suite proved nothing", and it is a new shape

This feature had three recorded cases before this session — S2's rule that only
manifested after a timer, S3's fixture-satisfied assertion, and S3's
WARN-versus-ERROR gap. This session adds a fourth: **an expectation computed
from the same formula as the implementation**, which by construction cannot
detect that formula being wrong.

`zoom.test.ts`'s clamp case asserted `timeScroll` against
`Math.max(0, 580 - 100 * MAX_TIME_ZOOM)`, whose midnight floor returned `0`
under both the correct and the mutated code. Anchoring against an unclamped
zoom drifted the cursor at exactly the end of the range a user pushes against,
suite green. Replaced with two literal windows, `{timeZoom: 8, timeScroll: 930}`
and `{timeZoom: 0.05, timeScroll: 1095}`, one per clamp end, at a scroll and
cursor where the floor cannot fire.

**Four times now.** The pattern across all four: an assertion that describes the
*shape* of an answer, or re-derives it, rather than pinning a literal.

#### Coverage that existed only in appearance

- **The SVG grid — the actual deliverable of T034 and T035 — had no assertion at
  all.** Returning `null` in its place left all 24 cases green, because they
  read the gutter `<li>`s and the band `<span>`s, which are the label layers.
- **`dayHours` could be replaced by the engine constants** and nothing failed:
  `store.ts` seeds every `dayConfig` with the same numbers as `DAY_START_MINS`
  and `DAY_END_MINS`, and **no test ever shortened a day**. The same fixture
  also failed to kill `const topDay = 0`. Now covered by a case that shortens
  day 1 and fits from inside it.
- **`placedSpans` could return `[]` unconditionally**, since every case rendered
  with nothing placed and the only assertion was that `Fit to tournament` is
  disabled — which `disabled={true}` also satisfies. The `schedule` prop was
  never passed a value either. Now covered with a committed schedule whose event
  has both a pool and a DE segment, so the union is what gets asserted.
- **Horizontal time panning had zero coverage** — deleting the whole
  `if (e.deltaX !== 0)` block left the suite green, and it is the only way to
  scroll time.
- `expect(NORMAL_ROWS_VISIBLE).toBeLessThan(TOTAL_ROWS)` compared two test-file
  constants, `20 < 90`. No mutation of `src/` could reach it.

#### The palette had no readable foreground

FR-014 puts a gender label prefix on every block, and T037 draws it. Measured
against `--foreground: #475569`, `--cat-div1` gave **1.85:1** and `--cat-y8`
**2.23:1**. Even the file's darkest existing token reached only 3.57:1 on
`--cat-div1`. Sixteen `--cat-*-fg` tokens and a `categoryInk()` helper now sit
beside the fills, each pair asserted twice — a ≥4.5:1 floor and its tuned value —
from a WCAG relative-luminance formula computed in the test.

**`--cat-div1` is the binding constraint at 4.97:1**, and that is the ceiling:
no ink beats 5.44:1 on `#9b6bb3` because pure black does not. Every other pair
clears 6:1. If S5 wants headroom there, the fill has to darken, which is a
palette change and not a T037 change.

### Departures from what the reviewers asked

- **Finding 5's functional-setter form was rejected with reasoning, and I accept
  the reasoning.** The ctrl-zoom branch needs `timeZoom` and `timeScroll`
  together, which two independent functional updaters cannot do atomically, and
  a functional updater cannot hand its computed value to the persist timer
  without a side effect inside the updater. A `latest` ref fixes all three sites
  uniformly and additionally survives a burst where two wheel events land before
  a re-render, which the functional form does not.
- **The day band's opacity was fixed; its layout space was not.** The reviewer
  correctly observed that the band covers the plot's top 38px with no
  compensating offset, so the first ~1.6 strips of every window sit underneath
  it. Making the two layers opaque is a bug fix. Reserving space changes the
  canvas's whole vertical model, and `MatrixCanvas.tsx`'s own docblock argues
  deliberately for the current arrangement. **This is S5's to decide** — it is
  where obscured blocks start reading as a bug rather than as empty grid, once
  T037 draws them.

### Knowingly not fixed, and why

All from the test reviewer's low-value list, recorded rather than applied:

- **`geometry.ts`'s flighted branch keys on `flight_a_start`**, and mutating it
  to `flight_b_start` survives, because the fixture fills both. A fixture with
  only one flight populated would kill it, but `derive.ts` never produces that.
- **`zoom.ts`'s `Math.sign(delta)` is never distinguished from raw `delta`** —
  no case and no caller passes a magnitude above 1.
- **`MatrixCanvas`'s `- rect.left` is untestable as written**: jsdom's
  `getBoundingClientRect()` returns zeros. The `- GUTTER_WIDTH_PX` half of the
  same expression is pinned.
- `MAX_AXIS_TICKS` is pinned only to `(89, ∞)`; `palette.test.ts`'s
  "same direction" case is implied by the four monotonicity cases above it; a
  `liveObservers` array in the ResizeObserver stub is written and never read.

**No test coverage was dropped this session**, and no assertion was weakened.
The "no stray tokens" check was rewritten to claim fills and inks as two
families and still fails on a genuine orphan, proved by mutation.

### Things S5 must not be surprised by

- **`weaponMark` returns a letter, and `tasks.md`, `spec.md`, `data-model.md`
  and `ui-contract.md` all still say "icon" or "glyph".** They are stale on
  purpose — S4.md carries the user's 2026-08-30 decision and is the authority.
  There is no `WeaponGlyphs.tsx` and there should not be one.
- **The block will carry two letter marks.** FR-014's gender prefix and the new
  weapon letter risk reading as one two-letter string — `M` + `E` scanning as
  "ME" — which blurs two channels the encoding contract keeps separate. Keep
  them visually distinct in T037.
- **The degradation order needs them separately droppable.** The contract drops
  label text, then the weapon mark, then the label prefix. That still works with
  a letter, but only while the two marks are two elements. Merged into one glyph
  they drop together and the contract's order is lost.
- **`ROW_HEIGHT_PX` and the palette are the only two places a visual constant
  lives.** Blocks read `categoryFill` and `categoryInk`; nothing in T037 should
  introduce a third.
- **The tests exercise the `localStorage` shim on this machine, not jsdom's real
  `Storage`.** S1's guard in `src/test-setup.ts` installs an in-memory
  replacement only when the ambient `localStorage` lacks working methods — a
  Node ≥24 workaround that is a no-op on CI's Node 22. Still do not delete it.
- **`hourTicks` throws past `MAX_AXIS_TICKS`** rather than truncating silently,
  per constitution IV. A pathological zoom surfaces as a loud failure.

### Not finished, and why

Nothing in scope was left undone and no halt condition fired — the arithmetic
satisfies constitution IV with no search and no unbounded loop, no charting or
virtualization dependency was needed, and engine drift is zero.

**T029, T030, T031, T037, T038, T040 and T041 are S5's**, by instruction. The
grid exists and is unreachable; S5 fills it, mounts it, and extends the smoke
driver in the task that mounts it. T042 and T043 close there too. The US2
checkpoint closes at the end of S5, so **no checkpoint commit was made here**.
The branch is handed back green, with the closing merge unmade.
