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

## S5

**Scope**: T029–T031, T037, T038, T040–T043 — US2's second half, closing the
checkpoint. T044 onward (US3, the scorecard) was out of scope by instruction and
was not started.

### Tasks completed

| Task | Commit | What landed |
|---|---|---|
| T029 / T030 / T031 | `f78d8bdc53` | Three failing test files — the encoding contract, the tooltip, view equivalence |
| T037 (part) | `6590df5edb` | `lanes.ts` and its tests — which strips a block draws on |
| T037 | `a3bb5b3887` | `EventBlock.tsx`, the block layer, and the day band's layout space |
| T038 | `e7151a949b` | `CanvasTooltip.tsx`, `blockLabels.ts`, one canvas-level pointer handler |
| T040 | `2c875a73c6` | The Matrix ⇄ Schedule toggle, `ScheduleOutput`'s DE columns, both view-state defaults |
| T040 (part) | `6af576178c` | `viewTogglePersistence.test.tsx` — the hole the toggle's own persistence left |
| T041 | `2bb36517e5` | `scripts/smoke.mjs` drives the matrix |
| T042 (part) | `db97dcb716` | `viewEquivalence.test.tsx`'s window comment and its dead teardown |
| T042 / T043 | `4f2653f118` | The accepted findings from both reviews, 23 new cases |

### Gate at end of session

`tsc -b` exit 0, `lint` exit 0, full suite **1221 passed (1221)** across 51
files, run twice with identical results by the orchestrator after every subagent
had gone idle. `scripts/smoke.mjs` exits 0 with `SMOKE PASS` and zero console
errors, **now driving the matrix** — the first time a browser has rendered this
canvas.

**Suite count reconciliation.** 1101 → 1221, entirely additive:

```
1101  at S4's close
+  74  T029-T031's three files, lanes.test.ts, and T037's MatrixCanvas cases
+  20  T038's tooltip file and the two holes its own mutations found
+   3  T040's matrix two-tier case and the toggle's persistence
+  23  the review findings' new cases
=1221
```

Per file: `EventBlock` 41, `CanvasTooltip` 20, `viewEquivalence` 11, `lanes` 13,
`viewTogglePersistence` 3, `MatrixCanvas` 24 → 74.

**Zero engine drift.** `git diff --stat 2f98ee5126^1 HEAD -- src/engine/` is
empty, so B1–B8 cannot have moved. Only US4 changes engine output.

### The two letter marks, resolved

S4 raised it and deliberately did not decide it: FR-014's gender prefix and the
weapon letter risk reading as one string, `M` + `E` scanning as "ME", and merged
into one glyph they would drop together and lose the contract's degradation
order.

**They are two elements, separated three ways at once.** The weapon mark is a
bordered chip — `border border-current`, bold, 9px, its own padding — sitting
first in a flex row that starts 6px in, past the edge-bar. The gender prefix is
plain text at the label's own size and weight, inside the label's inline group,
4px further right. A chip, then a word. Being two elements is what lets the 28px
threshold drop the chip while 14px keeps the prefix.

**The width thresholds the degradation order actually uses**, all asserted at
literals on both sides:

| Channel | Threshold | Pinned at |
|---|---|---|
| Gender prefix | `>= 14px` | 13 / 14 |
| Weapon chip | `>= 28px` | 27 / 28 |
| Label text | `>= 64px` | 63 / 64 |

`RowHeightStep.COMPACT` drops all three whatever the width. Fill and the
edge-bar are present at every width including 13, and at compact.

**One assertion in the original contract was unsatisfiable and was replaced with
a stronger one.** Between 28px and 63px a correct block renders exactly the chip
and the prefix, so the block root's own `textContent` *is* `EM` — "no element
whose text is the concatenation" cannot hold. What is pinned instead: two
distinct non-nested elements, one letter each, plus a 27-vs-28 case proving they
drop separately. A merged glyph fails whichever marker it wears.

### The day band's layout space, and why

S4 applied the opacity half of this finding and left the layout half, because it
changes the canvas's vertical model. **The layout half is now applied.**

One constant, `HEADER_HEIGHT_PX = 38`, offsets three layers — the gutter `<ul>`,
the grid `<svg>` and the block layer — while `plotHeight = size.height - 38`
feeds `visibleRowRange` and `maxRowScroll` and `rowsBottom` clamps against it.
**Every row-space expression is byte-unchanged**: `blockY`, the gutter `<li>`
tops, the row lines, `rowsTop`, and `stickyHeaderTop` all keep their exact
previous form. That is the point — `MatrixCanvas.tsx`'s old docblock argued
against giving the header space, and the argument was really against a
*non-uniform* offset. A uniform one reserves the space and preserves the
alignment, and the docblock now says so.

Numbers that moved in `MatrixCanvas.test.tsx`'s 900×480 fixture: `PLOT_HEIGHT`
442 (new), `NORMAL_ROWS_VISIBLE` 20 → **19**, `TALL_ROWS_VISIBLE` 14 → **13**,
`MAX_ROW_SCROLL` 70 → **71**. Everything else follows from those and stayed
literal. A case now asserts the first strip's row is not underneath the band, and
mutating the gutter's offset to `0` kills it.

### What the two views had to stop disagreeing about

FR-023 says both views read one derived model so they cannot disagree, and a
user toggling between them would have seen three disagreements. All three are in
`ScheduleOutput`, and fixing them is what made T031 assertable:

- **"DE End" rendered `de_total_end`**, which includes the medal tail the
  scheduler deliberately never places, while the matrix's last block ends at
  `de_end`. It now renders `de_end ?? de_round_of_16_end` — the last *scheduled*
  minute.
- **A staged event showed `—` for both DE times**, because `de_start` is null
  there. "DE Start" now falls back through `de_prelims_start` and
  `de_round_of_16_start`.
- **The medal-tail estimate had nowhere else to live**, so a new final **Finish**
  column carries `de_total_end`. `COLUMN_COUNT` is 8.

Rows carry `data-schedule-row`, cells carry `data-cell`. `Pool Start`'s header
text is untouched, because `scripts/smoke.mjs` finds the table by it.

### Decisions the plan did not anticipate

- **The canvas has to choose which strips a block draws on.** `Placement.strips`
  is `number[] | null` and is **always null** in P3 (`runActions.ts:33`), so a
  placement implies a strip *count*, never indices. Without a choice every block
  piles onto strip 1. `lanes.ts` packs each day's blocks first-fit onto the
  lowest free run, ordered by day, start, competition id — bounded scans, no
  search, constitution IV. A block that finds no room is `overflow: true`, drawn
  at strip 0, marked `data-overflow`, given a dashed cue, and **reported as
  unplaced rather than claiming strips it never got**.
- **The toggle's radiogroup is named `Center view mode`, not `Center view`.**
  `CenterView` already renders `<main aria-label="Center view">`, and two things
  with one accessible name is a defect a screen reader hears even though the
  roles differ. One line of `viewEquivalence.test.tsx` was updated with it.
- **`CanvasTooltipTarget.dropped` was removed.** The tooltip carries every field
  unconditionally, which is the real contract, so the field was written by the
  canvas and read by nobody. Its describe survives, renamed to say what it proves
   — that no row is gated on width.
- **`phaseRank`/`PHASE_ORDER` was deleted from `lanes.ts`.** The tie-break is
  unreachable on a real `ScheduleResult` (single-stage and staged DE are mutually
  exclusive), and its test passed identically with the comparator returning `0`.
  Within-event order now falls out of `eventTimeSegments`' deterministic emission
  plus a stable sort, and the case is renamed to what it actually proves.

### What the reviews found

Both were dispatched report-only against this session's whole diff, and the
findings applied in one pass. `test-quality-reviewer` ran the review **as
mutation testing** — 40 single-line mutations applied to a scratchpad copy of the
worktree, each executed against the suite — so every "survived" below was run,
not reasoned. **19 findings from it, 11 from `react-code-reviewer`, 23 applied,
31 mutations killed by the cases that closed them.**

**Two real bugs, both user-visible:**

- **The hover hit test was not bounded to the plot.** The block layer is clipped,
  so a block with a negative `x` or `y` is hidden under the frozen gutter or the
  day band — but `blockAt` compared the pointer only against block rectangles, so
  negative coordinates were live hits. Pan time until an event starts before the
  window, move onto a strip label, and a tooltip opened describing a block that
  is not drawn there. The existing case aimed `plotY = -1` at a block whose top
  was `0`, so it passed either way.
- **A trailing wheel write clobbered a newer discrete one.** `writeNow` neither
  cancelled nor drained the pending debounce, so ctrl+wheel then `Fit to day`
  within 200ms persisted the fit window and then overwrote it with the wheel-era
  one. The screen was right and storage was wrong, and the next load opened on
  the window the user had replaced.

**One the toggle itself introduced:** unmounting the canvas discarded an
unpersisted wheel gesture. Before T040 nothing unmounted the canvas mid-session,
which is why a test asserted that drop as intended — it was flipped in the same
change, with the reason in its comment.

**Six holes where a green suite said nothing** — the below-window cull had no
case at all, the above-window cull's `- 1` was one row short of mattering, the
tooltip's anchor could have shipped pinned to the viewport's corner,
`onPointerLeave` was untested, re-pressing the already-selected toggle item
would have written a view state `isValidViewState` rejects (silently resetting
`timeZoom`, `timeScroll`, `rowScroll`, `drawerHeight` and `scorecardExpanded` on
the next load), and `findingsForBlock`'s phase fallback was untested **on the
common path** — `analysis.ts` emits per-competition warnings on `CUT` and
`FLIGHTING`, phases no block ever carries, so those reach a block only through
the fallback.

**Three accessibility gaps**, all closed: findings were pointer-only and are now
in the block's accessible name, the tooltip had no Escape dismissal, and an
overflowed block's name asserted a placement that was fiction.

**`viewEquivalence.test.tsx` is not vacuous.** Deleting the matrix's blocks fails
it, and `EXPECTED_TUPLES` catches both views breaking in the same direction.

**Two things the reviews got wrong, corrected during the apply:**

- Test finding 15 claimed nothing sits at flat row 39. `flighted`'s DE takes 16
  strips from strip 0 on day 1 — flat rows 24–39. The original comment was right
  about row 39 and wrong only about the row count (49, not 50).
- Test finding 1's proposed killing case fails on HEAD before any mutation: the
  fixture it names already carries a `Phase.POOLS` warning for `c1`, so `forPhase`
  is non-empty and the fallback never runs. The case written instead uses a
  fixture whose only warning for `c1` is on `Phase.CUT`.

### Knowingly not fixed, and why

- **Flighted events read differently in the two views.** `derive.ts:183-184` sets
  `pool_end = flightBEnd` and `pool_strip_count = flightAStrips + flightBStrips`,
  so the table shows one pool span across the inter-flight gap at the summed
  count while the matrix draws two blocks at their own. Both read the same
  `ScheduleResult`, so FR-023's one-model rule holds. This is a presentation
  decision someone should make deliberately, not a defect.
- **`Zoom to selection` is permanently disabled.** `CenterView` mounts the canvas
  with no `selection`, and multi-block selection is out of scope for 004. FR-020
  requires the action to be available, so it was not hidden.
- **`latest.current` syncs in a passive effect**, so a wheel event landing between
  a button's commit and the flush computes from the previous position. Sub-frame.
- **`lanes.ts`'s `Math.max(0, Math.floor(stripsTotal))` is unreachable** —
  `strips_total` is `strips.length` at every call site. No test was added for an
  input no caller can produce.
- **The TALL text-size branch is cosmetic** and not one of the encoding
  contract's four channels.
- **`ScheduleOutput` keeps its live store subscription.** S2 recorded this and
  said US2 is where it is worth solving — it was solved for the *canvas* (the
  subscribing wrapper is split from a pure view, so the props path never
  subscribes) and left alone for the table, which is cheap.

**One coverage claim that is honestly limited.** The `clearTimeout` inside
`writeNow` is not independently falsifiable: removing only the cancel leaves
behaviour identical apart from one redundant no-op write 200ms later, and that
mutation survived. The pre-fix `writeNow`/`writeSoon` pair reverted wholesale is
killed by three cases, and dropping only the merge is killed by one, so the pair
is covered from both sides. The single line is not, and the cancel was kept
anyway — a timer whose work has been drained should not fire.

**React finding 4 changed no observable behaviour** and has no test of its own.
Splitting the subscribing wrapper from a pure view removes a re-render, which no
assertion in this repo can see. Both paths are exercised by the existing suite.

### Things S6 must not be surprised by

- **No store state can produce a flighted event.** `buildConfig.ts:126` sets
  `flighted: false` on every competition, and the only path that raises it also
  sets a non-null `flighting_group_id`, which `derive.ts:148` requires to be null
  before it splits flights. The app cannot draw a flight pair today.
  `viewEquivalence.test.tsx` builds one through the engine and hands the same
  object to both views. **This is a product gap, not a test convenience.**
- **The React Compiler is not in the build.** `vite.config.ts` is a bare
  `react()` with no babel plugin, and `react-hooks/preserve-manual-memoization`
  runs as *lint* only. Nothing memoizes the blocks at runtime — the
  `CanvasTooltipTarget` object is still built in the JSX prop position, because
  that is what keeps the lint gate green, but do not assume runtime memoization
  from it.
- **`flushSync` in the pointer handler is load-bearing.** React classes
  `pointermove` as continuous, so a `useState` update from it is scheduled rather
  than applied and a synchronous assertion reads a stale DOM.
- **jsdom 26 ships no `PointerEvent` constructor.** `fireEvent.pointerMove(el,
  {clientX})` degrades to a bare `Event` with `clientX` undefined. Dispatch
  `new MouseEvent('pointermove', {clientX, clientY, bubbles: true})` instead.
- **Radix portals two copies of tooltip content** — a positioned one and an
  unpositioned measurement one, identical text. Every `data-tooltip-field` read
  in the smoke driver needs `.first()`.
- **`scripts/smoke.mjs` had a locator that was silently reading the wrong
  table.** The old `rowCount < 5` check used an unscoped `table tbody tr`, which
  returned 12 while the schedule table's real row count is 4. That assertion had
  been passing on the rail's markup. Everything is now scoped to
  `[data-schedule-row]`, including the round-trip counts.
- **ROC Div1A/Vet at the suggested strip count places only 4 of 12
  competitions**, explained by the strip-shortfall warning and verified
  deterministic. Not new, and not a bug — but it means the smoke driver's
  block-count floors are "non-empty" rather than a number, because anything
  higher would assert that run's scroll position.
- **`data-event-id` belongs to blocks alone.** `viewEquivalence.test.tsx` selects
  it across the whole document.
- **The day band, once pinned mid-canvas, still hit-tests through.** It is opaque
  and `pointer-events-none`, so a block genuinely inside the plot but hidden
  behind the band is still hoverable. Arguably fine — it describes what the band
  covers — and recorded rather than fixed.
- S1's `localStorage` guard in `src/test-setup.ts` is still not redundant, and
  `computePoolStructure` still throws for `fencerCount <= 1`.

### Not finished, and why

Nothing in scope was left undone and no halt condition fired. No dependency was
needed after D1, D2 and D3 rejected them, the matrix and the schedule table were
made to agree without either reading its own copy of anything, and engine drift
is zero on every scenario.

**The US2 checkpoint is met**: the matrix renders, reads correctly, and agrees
with the schedule table — proved in the suite and in a browser. T044 onward (US3,
the scorecard) is S6's. The branch is handed back green, with the closing merge
unmade.

---

## S6

**Scope**: T044–T054, closing US3. All eleven done. Ran after feature 006 landed,
so the scorecard baselines over a fully scheduled B1 (24 of 24) rather than the
11 of 24 the day-axis defect used to produce.

### Tasks completed

| Task | Commit | What landed |
|---|---|---|
| T044 / T045 / T046 | `2fdcfaecc9` | Three failing test files – 60 cases, nothing under `src/` |
| T047 / T048 | `ab34bb9f6c` | The baseline slice and the metric selectors |
| T049 / T051 | `bebb17ec97` | `Scorecard.tsx`, deltas, expansion persisted through `viewState` |
| T050 | `922df9fd4f` | Metric hover lights the driving blocks |
| T045 follow-up | `57c8ac00cb` | The two `day_out_of_range` skips nothing covered |
| T052 | `9db6c94370` | `scripts/smoke.mjs` drives the scorecard |
| T053 / T054 | `b5d241dab7` | Both reviews' accepted findings, 12 new cases |
| — | `46fae80050` | Two backlog entries |

### Gate at end of session

`tsc -b` exit 0, `lint` exit 0, full suite **1368 passed across 58 files**, run
twice with identical results by the orchestrator after every subagent had gone
idle. `scripts/smoke.mjs` exits 0 with `SMOKE PASS` and zero console errors,
re-run after the review-apply pass because that pass changed the components it
drives.

**Suite reconciliation.** 1274 → 1368, entirely additive:

```
1274  post-006 baseline at 396a305545
+  60  T044-T046's three files (20 + 27 + 13)
+   3  the day_out_of_range coverage gap
+  19  T050's highlight cases
+  12  the review findings' new cases
=1368
```

**Zero engine drift.** `git diff --stat 396a305545 -- src/engine/` is empty.
Only US4 changes engine output, and it is not this session's.

### Where the highlight state lives, and why

**A store field for the hover, a prop for the canvas.** `UiSlice.hoveredMetricId`
holds which metric is hovered; the `Scorecard` is the only writer.
`CenterView` reads it, resolves the metric's `blockKeys` into a `Set`, and hands
that to `MatrixCanvas` as a new `highlight?: ReadonlySet<string>` prop.

The driving set has exactly one definition: every metric produced by
`selectScorecardMetrics` carries its own `blockKeys`, built from
`eventTimeSegments` with the same `day_out_of_range` skip `assignStripLanes`
uses. The scorecard names the blocks and the canvas draws them – neither
computes its own set, which is FR-023's rule applied to a highlight.

Rejected: lifting React state into `WorkbenchShell`. It would re-render the whole
shell on every pointer move across the scorecard and force new props onto
`Drawer` and `CenterView`, both of which existing tests mount bare. Rejected
also: giving `MatrixCanvasView` a `useStore` call, which would undo S5's
separation of the subscribing wrapper from the pure view.

### The live-versus-committed boundary

The scorecard is drawer-side and reads the live store per keystroke (FR-008)
while the canvas draws a model committed behind `CENTER_SETTLE_MS`. The
highlight crosses that boundary, and the resolution is:

> The block-key set is computed from the **live** model and passed **undebounced**.
> The canvas matches keys against the blocks it has actually committed. A key with
> no committed block simply does not highlight.

A `${competitionId}:${phase}` key identifies the same block wherever it currently
sits, so the worst case during a settle is *fewer* blocks lit, never a wrong one.
A hover cue that arrives 150ms after the hover is not a hover cue.

**This rule was very nearly unenforced.** The case written to hold it seeded the
store *before* `render`, so `committed === live` at the moment it hovered and a
debounced highlight was indistinguishable from an undebounced one. The mutation
review found it (M59) and it is now pinned by an edit that starts a settle the
centre has not committed.

### The baseline's capture point, and why it is not `applyPreset`

S6.md said `applyPreset` is the only capture point. **Taken literally that is
wrong, and it was not built that way.** `applyPreset` places nothing – both of
its call sites (`boot.ts:40`, `TopBar.tsx:39`) are `applyPreset(id)` immediately
followed by `runScheduleAll()`. Capturing inside it would freeze a baseline over
zero placements, so the app's first frame would show every metric as an enormous
delta against an empty tournament.

The rule instead: `setLoadedPresetId` clears the baseline, and
`setPlacementsFromAuto` captures it when `loadedPresetId !== null &&
scorecardBaseline === null`. One arm, one fulfil, no extra flag. Boot and the
picker behave identically, so boot is not special-cased – which is what S6.md
actually asked for. A later `Auto-schedule all` does not re-baseline (D9 rejects
that explicitly), and a shared-URL boot never captures at all, which is D9's
no-preset case.

Two claims in the session's own design brief were wrong and were corrected by
measurement mid-session, both recorded here so they are not re-derived:

- **`scheduleAll` does not throw** for a tournament it cannot schedule.
  `scheduleAllConcurrent` returns an empty schedule after its BINDING validation
  pass, as `appPathParity.test.ts`'s B2 note already recorded. So a preset that
  schedules nothing still gets a baseline, over zero placements, rather than
  `null`.
- **`refs:peak-sabre`'s driving day was ambiguous.** "The total peak day's
  `peak_time`" reads two ways and on B5 they disagree. The binding reading: the
  day is the `peak_saber_refs` argmax row and the time is that same row's
  `peak_time`. The other reading lights blocks on a day whose sabre peak is not
  the number being reported.

### What the reviews found

Both dispatched report-only against the whole session diff, findings applied in
one pass. `test-quality-reviewer` ran **76 single-line mutations against a
scratchpad copy**, each executed against the full suite – 59 killed, 17 survived,
of which 11 were real holes and 6 correctly diagnosed as equivalent or
unreachable. `react-code-reviewer` returned 8 findings plus 2 promoted items.
**All 19 applied, and all 11 surviving mutations are now killed**, plus 5 more
written for the new fixes.

**The largest cluster was `computeDelta`** – 5 of the 11 holes. Research D9's
rule that no-preset means *no delta element*, not a zero delta, was enforced by
code and asserted nowhere:

- an id the baseline never held rendered `0:00` (M07)
- a live value going null rendered `−17:17`, because `null - 1037` coerces (M08)
- a null *baseline entry* rendered `+45:38`, a delta against nothing (M09)
- no negative time delta was asserted anywhere, leaving the `Math.abs` trick
  unpinned (M12) – `formatMinutes` floors, so the naive form renders `−-2:-40`

**The second cluster was rendered strings and paint the tests locate but never
read.** Deleting the highlight cue's entire `boxShadow` left the unit suite *and*
`scripts/smoke.mjs` green (M77): the 13 block cases assert the cue exists, is
`aria-hidden`, and does not hit-test, all satisfied by a span that paints
nothing. FR-029 would have been dead on screen with everything passing. The
per-day label's 1-based numbering (M71) and label distinctness (M78) were
unpinned the same way.

**Two accessibility defects, both closed.** The metric rows' focus indicator was
`focus:bg-muted` at about 1.08:1 against the card with `focus:outline-none`
removing the browser default – invisible, on the rows that are the entire
keyboard path to FR-029. And FR-029 announced nothing at all: blocks are
`role="img"` with a static label, and `role="img"` is not a live region. A
visually-hidden `aria-live` node now reports what the hovered metric drives.

**One defect in the design brief, not in anyone's implementation.** The capture
rule put `selectScorecardMetrics` inside `setPlacementsFromAuto` *after* its
`set`, and that selector can throw – it reaches `computePoolStructure`, which
throws for `fencerCount <= 1`. `runActions.ts:44` calls the action outside its
own `try`, so a throw would unwind `bootstrap()` with placements written and no
baseline. `dismissFinding` in the same file has the identical shape and gets it
right by calling its selector before any `set`. Fixed by mirroring that: the
baseline is computed from `{ ...get(), placements: normalised }` before a single
`set` carrying both. No `try`/`catch` – the point is that a throw unwinds with
nothing mutated.

### Vacuity, which is now this feature's signature failure

S5 recorded six places a green suite said nothing. **S6 found four more**, and
the count of distinct shapes is now seven:

- the not-debounced case whose fixture made both paths identical (M59)
- two `undefined toEqual undefined` comparisons an author caught in their own
  file, taking it from 45 failed / 2 passed to 47/47
- an over-specified fixture: `{ day: 3, start_time: 480 }` where the real start
  was 585, so the override moved the very value under test and the case passed
  with or without the rule it existed to pin

That last one is worth its own note, because the same literal is **load-bearing**
in `scorecardBaseline.test.ts:212` and a **confound** in `scorecardMetrics.test.ts`.
It was correctly distinguished in both places rather than pattern-matched.

The lesson that keeps paying: a mutation coming back green is a reason to suspect
your own fixture, not to explain the mutation away.

### Knowingly not fixed, and why

- **A fencer count of 0 or 1 unmounts the whole app.** `FencerCounts.tsx` renders
  `min={0}` with `commitOnChange`, `analysis.ts:26` calls `computePoolStructure`
  unguarded, and there is **no `ErrorBoundary` anywhere in `src/`** – so the
  throw escapes to the root and React unmounts the tree. Blank page, no recovery
  short of a reload. Pre-existing and US2's territory, not introduced here.
  Recorded in `docs/design/backlog.md` with the detail that makes it cheap:
  `MIN_FENCERS` is already `2`, exactly the throw threshold, so raising the
  input's `min` is a one-character fix.
- **The scorecard's peak-referee row reads higher than the scheduler's own.** 220
  against 212 on B1 day 0. `buildRefDemandByDay` sums each placed event's
  requested refs while `computePostScheduleRefDemand` clamps each event by
  `peakConcurrentStrips`, which only exists inside a live scheduler run. A clamp
  can only lower a count, so the store path is ≥ the scheduler path and diverges
  only where concurrency saturates – days 1–3 agree exactly. 220 is the honest
  number for a metric specified over `selectDerivedRefRequirements`. Also in the
  backlog. **If US4 ever unifies the two paths, re-pin the literal rather than
  hunting a regression.**
- **`day_out_of_range` is checked at three traversals of `schedule.events`**
  (`derived.ts:170`, `:277`, `:341`). Two are now pinned; the third is an
  equivalent mutant, proven twice independently – `computeRefRequirements` reads
  only `demandByDay[d]` for `d` in `[0, daysAvailable)`, so an out-of-range
  bucket is never addressed whether or not the skip wrote to it. The risk is not
  the three drifting in meaning, it is a fourth call site being added without the
  guard. **The recommended fix, deferred rather than done: filter
  `schedule.events` to in-range entries once and have all three consume it.**
  Refactoring `derived.ts` while another agent was mid-flight in the canvas is
  how two green branches make one broken merge.
- **The highlight covers the dashed overflow border on a block that is both.**
  Mitigated by drawing the overflow cue after the highlight cue, so its gaps show
  through. An inset ring was rejected because it collapses to nothing on the
  1–2px blocks a person is reaching for the scorecard to find.
- **Sub-4px blocks lose their category fill while highlighted**, a consequence of
  the settled `inset-0` choice. Recorded in the cue's docblock rather than
  changed.
- **Eight style preferences from the React review were declined**, listed in
  `scratchpad/S6-react-review.md`. One was adopted: `aria-controls` on the
  disclosure, since the focus-ring fix already edited that element.

### Coverage knowingly dropped

None. The one case deliberately not written – `buildRefDemandByDay`'s skip – is
an equivalent mutant with no observable difference to assert against, verified by
two independent agents, and inventing a case to pin it would have pinned nothing.

### Things S7 must not be surprised by

- **The scorecard reads the live store; the canvas reads a committed model.** A
  metric moves before the blocks relayout. That is FR-008, not a bug.
- **Every delta is zero on the first frame**, because the baseline is captured
  from the same auto-schedule the app boots into. A test or a driver asserting
  "a delta exists" proves nothing – assert that one *moved*.
- **Only about 5 blocks are in the canvas window at boot on B1**, because 80
  strips makes a tall grid. Windowing, not placement: the schedule table still
  reads 24 of 24.
- **`selectScorecardMetrics` can throw**, by the same `computePoolStructure` path
  everything else in the drawer can. It was deliberately not wrapped in a
  `try`/`catch`, which would hide a real defect behind a component silently
  rendering nothing.
- **B2 and B8 still place zero events** – the team-event cut defect, being fixed
  as its own feature in a separate session. Do not drive them in a smoke run.
- S1's `localStorage` guard in `src/test-setup.ts` is still not redundant.

### Not finished, and why

Nothing in scope was left undone and no halt condition fired. No metric needed
arithmetic that belongs in `src/engine/`, no dependency was needed after D1, D2
and D3 rejected them, the highlight was built without either side reading its own
copy of the driving set, and engine drift is zero.

**The US3 checkpoint is met**: the scorecard reports deltas against a frozen
baseline, in the suite and in a browser. T055 onward (US4, per-type defaults) is
the next session's – and it is the **drift gate**, the only story that changes
engine output, so it starts fresh with constitution III in front of it. The
branch is handed back green, with the closing merge unmade.

## S7

**Scope**: US4 (T055–T068) was the assignment. **No US4 task was started.** The
session halted on the constitution's re-plan rule after establishing that the
task list could not be executed as written. What it produced instead is a
verified zero point, a green tree, a constitution amendment, and three added
tasks. T055 onward is S8's.

### What landed

| Task | Commit | What landed |
|---|---|---|
| baseline re-verification | `e08636b0c6` | `drift-baseline.md` §Re-verification before US4 |
| constitution 1.6.0 + scope | `af5ec4eb7c` | Post-merge gate, T054a/T061a/T063a added |
| T054a | `4c99905673` | The two merge-invalidated US3 tests re-vehicled |

**Gate at end of session**: `tsc -b` exit 0, `lint` exit 0, full suite **1660
passed across 60 files**, zero failures.

**A count correction worth carrying.** `4c99905673`'s message records the suite
as 1659 → 1661 across 61 files. That is one file and one test too many: the
baseline re-verification's scratch harness, `tmp/baseline.capture.test.ts`, is
gitignored but still **collected by vitest**, so it inflated every count measured
while it existed. It has been deleted, as `drift-baseline.md` §Harness always
specified. The true figures are 1658 passed + 2 failed → **1660 passed**. S8
reconciles against 1660, and any scratch harness it recreates for T062 must be
deleted before the suite is counted.

The branch is `004-us4-drift-gate`, cut from `main` at `e67fa9cdd0`. It is **not**
`004-p3-workbench-shell` — that branch was 27 commits behind and already merged,
so continuing on it would have re-landed US1–US3.

### The baseline survived 006 and 008, and this was measured

`drift-baseline.md` was captured at T002 against `f9a74ca58d`, before features
006 and 008 both landed. A drift gate run against a stale baseline is worse than
no gate, so it was re-measured rather than argued from.

All 48 cells match, two consecutive runs agreeing. The inputs moved only by
comments: `src/engine/` touches `resources.ts`'s docblock alone, `src/data/` is
empty, `__tests__/helpers/scenarios.ts` gained only 008's 15-line note. **The
zero point holds. S8 does not need to re-verify it again** unless something lands
in `src/engine/`, `src/data/`, or the ledger factory first.

### `main` was red, and neither feature's gate could have caught it

004 US3 closed green at 1368 passed. 008 closed green. Their merge is red:

- `scorecardBaseline.test.ts` — *captures a baseline over zero placements when
  the preset schedules nothing*: expected length 0, got 24
- `Scorecard.test.tsx` — *renders no delta when the baseline entry itself was
  null*: expected null, got 1198

Both used **"preset B2 schedules nothing"** as their fixture. 008's team
`cut_mode` fix made B2 schedule 24, and no preset schedules nothing any more —
`appPathParity.test.ts` now pins all eight at non-zero.

Every feature's final gate runs on its own branch. The merge is the first moment
both halves exist, so neither gate could see it. S6's handoff *predicted* the
collision in prose — "B2 and B8 still place zero events — being fixed as its own
feature" — and the prediction never became a check.

**This is why the constitution is now 1.6.0.** §Git Ownership gained "The merge
is gated, not just the branch": the merged tree runs `tsc -b`, `lint`, and the
full suite before the pending merge commit is written, a red merge belongs to the
session making it, and a predicted collision is written as a task in the
receiving feature's `tasks.md` rather than only as prose.

### Why US4's task list could not be executed as written

T055–T068 covers three settings — `ref_policy` (D5), `de_mode` (D6),
`video_strips_total` (D7). The three parity exceptions that name US4 as their
closer need two things no task listed:

- **`strips_allocated`.** `buildConfig.ts:151` sends a hardcoded `0` where the
  ledger's factory pre-allocates `max(2, ceil(fencer_count / 7))`. It is the
  fourth seam of the four `parity-exceptions.md` names, required to close B4 and,
  jointly with `de_mode`, B8. Now **T061a**.
- **The ledger factory adopting `REGIONAL_CUT_OVERRIDES`.** The only way B6
  closes. It moves the drift ledger's own B4 and B6 numbers — the baseline T062
  diffs against — mid-gate. **Deliberately out of scope**, see below.

006 and 008 both wrote "closes in 004 US4" into `parity-exceptions.md` and into
an *asserted* `closedBy` field, while 004's `tasks.md` predates both. The naming
was enforceable in one direction and unbuildable in the other.

### The two scope decisions, and who made them

Both were put to the user and answered:

1. **`strips_allocated` is in, the `scenarios.ts` regional-cut change is out.**
   `strips_allocated` is store-side, so T062's ledger table stays a clean zero
   point. Changing `scenarios.ts` would move the very table T062 measures
   against, and `drift-baseline.md` states D5 and D6 are the only changes T062 is
   permitted to see. B6 is therefore **re-assigned to a future feature** rather
   than closed here — a constitution III change to the ledger's own recorded
   behavior, with its own snapshot review.
2. **`de_mode` resolves per tournament type**, as `data-model.md`'s §Per-type
   default table specifies — `AUTO` → `STAGED` at NAC, `SINGLE_STAGE` elsewhere —
   **not** per event as the ledger factory derives it (`STAGED` when individual
   and video REQUIRED).

### The de_mode rule is not the ledger's rule, and B8 will show it

This is the single most likely thing to be misread as a regression.

`b8-residual.md`'s P1 reached 52 by adopting the **ledger's** per-event rule. The
approved design is the **per-type** rule. They are different assignments: at
B8/NAC the per-type rule stages team events and individual events whose video
policy is not REQUIRED, which the ledger leaves `SINGLE_STAGE`. At B6/ROC the
per-type rule resolves to `SINGLE_STAGE`, so `de_mode` stays divergent there
entirely and B6 cannot converge on it.

**So B8's pin is re-measured, never adjusted toward 52.** `parity-exceptions.md`
§B8 already says exactly this: "The pin is re-measured then, not assumed to
become 52." Whatever it measures is the pin.

### What T063a has to reconcile, and the assertion that will fight it

`appPathParity.test.ts:216` asserts `exception?.closedBy` `.toContain('004 US4')`.
Re-assigning B6 to a future feature **fails that assertion**, by design — it must
be relaxed to requiring a non-empty named closing feature. Issue #255 (008 T010)
already anticipated this exact change and says so.

The companion assertion is the one that keeps everyone honest: a pin off the
ledger's count cannot exist without a matching `parity-exceptions.md` entry, and
a stale entry left behind after a pin closes fails too. Neither can be quietly
skipped.

### Things S8 must not be surprised by

- **The branch is `004-us4-drift-gate`, not `004-p3-workbench-shell`.**
- **T061a's B4 movement is a scheduled-count *drop*, 16 → 0, and it is correct.**
  `strips_allocated: 0` zeroes the DE term of the feasibility estimate, so the
  app never trips the gate the ledger trips. Fixing it makes
  RESOURCE_INSUFFICIENT start firing. Constitution III halts on an *unexplained*
  drop — this one is explained in `parity-exceptions.md` §B4 and must be recorded
  in the commit anyway, not waved through on this paragraph.
- **T062 measures the ledger path** (`scenarios.ts` → `scheduleAll`); the parity
  pins measure the **app path** (store → `buildConfig` → `scheduleAll`). D5/D6
  move the first, `strips_allocated` moves only the second. Do not diff one
  against the other's table.
- **T059–T063 are strictly sequential**, with T061a inside that run and T063a
  after T063.
- **The GitHub mirror is #215–#228 for T055–T068**, label
  `004-p3-workbench-shell`, all open. T054a, T061a and T063a have **no issues
  yet** — the user opens them. Nothing was renumbered, so the existing mapping
  still holds.
- **`selectScorecardMetrics` can still throw** by the `computePoolStructure` path,
  and a fencer count of 0 or 1 still unmounts the app. Both pre-existing, both in
  the backlog, neither this session's.

### Not finished, and why

Every US4 implementation task. The session established the preconditions —
verified baseline, green tree, amended constitution, completed task list — and
then hit the re-plan rule, which exists precisely so the session that discovers a
plan is wrong does not also build against its own revision. The record is
written and the branch is green. S8 starts at T055 with the gate in front of it.

## S8

**Scope**: US4 (T059–T068), resuming from S7's verified zero point. T055–T058 were
already committed. **All of US4 is complete.** The drift gate ran, passed, and is
explained. What remains is the merge, which is the user's.

### Final gate

`tsc -b` exit 0 · `lint` exit 0 · **65 files, 1754 tests, 0 failures** ·
**live smoke PASS**, three consecutive green runs, zero console errors.

The suite grew 1660 → 1754. S7's reconciliation figure of 1660 was the correct
starting point and was never contradicted.

### What landed

| Task | Commit | What landed |
|---|---|---|
| T059 | `effa7c908e` | `src/store/typeDefaults.ts`, the six-row table |
| T060 | `85025b7aa8` | `DeModeSetting`; `video_strips_total` nullable |
| T060 follow-up | `4bf42eb776` | the two store-default assertions T060's dispatch fenced off |
| T061 | `9f53379b70` | the three per-type resolutions in `buildConfig.ts` |
| T061a | `29aabc9031` | `strips_allocated` pre-allocation, the fourth app-path seam |
| T061a follow-up | `aaaa409a1c` | the two `strips_allocated` assertions re-baselined |
| T062 | `6fc25a3b4a` | **the drift gate**, run and explained |
| T063 | `a70844c8c5` | the app-path assertions the measured drift moved |
| T063a | `aa13bbce7b` | parity pins re-measured, exceptions reconciled |
| T064 | `b5a10d5254` | serialization: optional on read, `de_mode` validated |
| T065 | `332817d283` | `AdvancedPanel.tsx`; DE mode's AUTO marker |
| T065 hardening | `94c1fef200` | T067's four contract hardenings |
| T067 fixes | `b25e1e16c8` | the assertions the re-baseline weakened |
| T068 fixes | `b48eb7ad95` | video strips' follow-default path |
| T068 finding 7 | `e11b72ef10` | `RailPanel` gains a summary slot |
| T066 | `940480e198` | the type-change smoke assertion |

### The gate was flat, and that is the finding

**All 48 ledger cells unchanged. No `scheduledCount` dropped. The halt condition
never fired.**

The flatness is not a rubber stamp — it is the measurement that refuted
`drift-baseline.md` §"What research D5 and D6 predict will move". That section
predicted B6's pool demand halving and the five NAC scenarios' DE demand rising
fourfold **on the ledger**. It was written believing resolution would reach the
ledger path. It does not: D5, D6, D7 and T061a all live in `src/store/`, and the
ledger harness builds from `__tests__/helpers/scenarios.ts` straight into
`scheduleAll`, never traversing `buildConfig.ts`. `integration.test.ts` staying
green untouched through T059–T061a was the first corroboration, before T062 ran.

So the drift was measured where it actually is — the app path — and recorded in
`drift-baseline.md` §T062. D5 isolated cleanly there: holding the schedule fixed
and resolving only the policy gives Δ 0 on seven scenarios and **−100 on B6
alone** (200 → 100), the exact halving research predicted, one path over.

**D6's "roughly fourfold" claim is untestable on this instrument and remains
untested.** `peakDeRefDemand` reduces to `DE_REFS × de_round_of_16_strips` = 1 × 4
(`src/engine/refs.ts:31-42`) and never reads `de_mode`. Staging did land — 24/24/24/18/53
events `STAGED` on B1/B2/B3/B7/B8 — but every DE-column movement is re-packing.
Testing the claim needs `de_prelims_strip_count` / `de_round_of_16_strip_count`.

### The drop nobody predicted: B6, 43 → 39

T061a was dispatched expecting one movement (B4, 16 → 0). It found two. **B6's
app-path count fell 43 → 39**, and the measurement is why we know:

- `validateFeasibility` is clean on both sides — a re-pack inside the budget, not
  a refusal.
- Not a clean loss of four: **8 events out, 4 in**. Three of the four gained are
  events `parity-exceptions.md` §B6 lists as *ledger-only*, so the app moved
  toward the ledger there while shedding eight youth/vet events.
- B6 is an ROC, so `REGIONAL_CUT_OVERRIDES` forces all-advance brackets, and those
  brackets now cost real strip-hours that `strips_allocated: 0` had masked.
- Both movements were isolated by zeroing `strips_allocated` back and re-running,
  so neither belongs to T061.

Identified and recorded before the commit, which is what constitution III requires.

### The seam flipped sides, and the old attributions are now wrong

T063a re-measured field-by-field across all 54 of B6's and all 53 of B8's
competitions rather than inheriting 006's and 008's causes:

- **B6** — `strips_allocated` now differs on **zero** competitions. Ledger
  `de_mode` alone reaches exactly 44; `cut_mode` alone **overshoots to 54**. 006's
  "either default alone is worth one event" no longer holds.
- **B8** — `de_mode` is now **sole and sufficient** (52 on its own), where
  `b8-residual.md` had it necessary-but-insufficient in conjunction with
  `strips_allocated`. T061a closed the other half.

**B4 closed** at 0, the ledger's exact count; its entry was deleted, forced by the
existing companion assertion rather than chosen. B6 and B8 re-assign to one
unnumbered follow-up in `docs/design/backlog.md`: *"The drift ledger's factory
does not apply the store's per-type resolutions."* B8 was never going to reach 52
this way — `b8-residual.md` P1 measured 52 under the ledger's **per-event**
staging rule, and US4 shipped the **per-type** rule per `data-model.md`. A rule
difference, not a shortfall.

`appPathParity.test.ts:216`'s `closedBy` assertion was relaxed from
`toContain('004 US4')` to requiring a non-empty named owner **that names a
locatable artifact** (`/backlog\.md|specs\//`) — the placeholder-list version
alone would have let `closedBy: 'later'` pass.

### Two requirement gaps the reviews found, which the tasks did not

Both were invisible to a green suite, and neither was in any task's text.

1. **FR-038 was unasserted anywhere in the repo**, and `tasks.md:242` scoped T065
   to FR-031/035/039 only. The panel could have shipped `AUTO` as **write-once
   through the UI** — the whole per-type mechanism intact, unreachable, suite
   green. T065 had in fact built the follow-default option already; nothing pinned
   it.
2. **`video_strips_total` had no follow-default path at all.** Referees and DE mode
   each got their `Auto (…)` option; video did not. `number-input.tsx:9` types
   `onChange: (value: number) => void`, so the only UI writer of the field could
   never write `null`, and `boot.ts:40` applies a preset on every non-`#config=`
   boot. In the running app the field was a number from first paint and stayed
   one. A prior session had recorded the consequence at `appPath.test.ts:70`
   without connecting it to FR-038.

Also closed: `ref_policy` and `de_mode` were both **unvalidated on
deserialization**. A link carrying an unrecognized value dropped the control into
the no-selection state T065's DE-mode repair had just fixed — the same hole, one
field over.

### One discovery worth carrying beyond this feature

`src/test-setup.ts` needed a `scrollIntoView` no-op. jsdom does not implement it,
and Radix's `Select` calls it on the active item the instant its listbox opens,
throwing out of a commit effect. **Before this, no test in this repo could open a
Select.** Verified load-bearing by reverting it: both Select-driving cases fail at
`@radix-ui/react-select select.tsx:590`.

### Recorded in `docs/design/backlog.md`, deliberately not fixed

- The ledger factory not applying the store's per-type resolutions (B6, B8).
- `AdvancedPanel.tsx`'s `refereesPerPool` re-implements `refs.ts:22`'s factor in
  the UI, invisible to the B1–B8 ledger. The fix edits `src/engine/`, so it is a
  gated change with its own snapshot review, not a follow-up patch.
- `RefRequirementsByDay` carries no sabre-specific peak time
  (`refs.ts:97-99` sweeps the total for `peak_time`), so a metric row can report
  64 referees and highlight nothing. FR-029 says hovering MUST highlight the
  driving blocks. B1 is the first fixture where the documented approximation
  visibly fails, and it is now pinned as an expected string.
- RYC is absent from `REGIONAL_CUT_TOURNAMENT_TYPES` while `data-model.md` groups
  it with the regionals at 1 ref/pool — regional for referee defaults,
  non-regional for handbook cut policy. Pre-existing.

The "220 peak refs on day 0" backlog figure was **stale** — it was S6's pre-US4
reading. B1 day 0 now reads **160 on both paths**, and the store/engine divergence
has moved off day 0 entirely: days 0, 1 and 3 agree exactly (160, 182, 194) and
only day 2 differs (store 164, engine 156). It is not comparable to a published
headcount in any case — `peak_total_refs` is a sweep-line maximum of simultaneous
referee *assignments* at one minute, carrying no rotation, rest, or bout-committee
overhead, over one competition day.

### What is left, and it is the user's

The merge. Under constitution 1.6.0 §"The merge is gated, not just the branch",
the **merged** tree runs `tsc -b`, `lint`, and the full suite before the pending
merge commit is written. Both halves of the 004×008 collision that produced that
amendment are already resolved on this branch.

`git merge --no-ff --no-commit 004-us4-drift-gate`, gate the merged tree, then
`commit-with-costs` completes it.

## S9

**Scope**: US5 close-out, T080–T084. T085 (the merge handoff) is what this
session ends on.

### Final gate

`tsc -b` exit 0 · `lint` exit 0 · **68 files, 1809 tests, 0 failures**, run
2026-09-01 22:00.

### T081 — PASS

Three consecutive green live-smoke runs, zero console errors, no locator
repairs, `scripts/smoke.mjs` unchanged. Verified the gears panel's
override/revert/share round-trip end to end.

### T083/T084

Commit `6efaab8c14` closes the two design docs against what US4 and US5
actually shipped.

### A DE engine defect found and recorded, not fixed

Commit `da6bae3c2c`. See `docs/design/backlog.md` §"DE prelims gets a sliver
of its bracket's time, not its bout share" for the finding — not restated
here.

### T082 — one criterion fails, one is mixed

**SC-004 fails.** **SC-002 is mixed**: two-finger scroll and zoom-by-gesture
perform fine, but zoom is broken badly enough (canvas goes flat past ~6 clicks
of Zoom in) that the criterion cannot be called passed. Both are recorded in
`docs/design/backlog.md` §"The workbench canvas is not yet a finished
surface" rather than restated here.

### A lost-subagent incident worth recording

An earlier attempt at this session dispatched T081 and T083/T084 as
subagents. Both vanished with no completion notice — no commits, no error,
nothing to resume — and left two orphaned vite dev servers running. The work
was redone from scratch in this session rather than trusted from a silent
gap.

Also worth recording: this feature was orchestrated from the **main**
checkout rather than from the worktree, so no worktree-keyed session
transcript exists for `004-us5-gears`. `merge-with-costs`'s worktree-path
resolution will find nothing there, and the session id for the cost trailers
has to be picked by hand rather than resolved automatically.

### Not done, and it is the user's

The `tasks.md` checkboxes for T069–T084 remain unticked — the re-plan hook
halts edits to that file, so this session left it alone rather than working
around it. The merge itself is the user's, same as every prior session in
this feature.
