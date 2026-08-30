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
