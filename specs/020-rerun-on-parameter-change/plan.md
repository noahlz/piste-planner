# 020 Re-run on parameter change – plan

> **For agentic workers:** the orchestrator writes no code. Each task is one or two subagent dispatches
> of 2–4 steps, then its review wave (test quality, spec, drift judges where the store changed, React
> where UI changed), one bundled fix round, then a live-smoke run in its own subagent. Planning and
> implementation run in this one session, driving the worktree with absolute paths.

**Goal:** an edit to anything the engine reads re-runs Auto-assign by itself, 300 ms after the last
change. The board holds its last fresh layout until the new run lands, and an "Updating…" status
appears only when the wait passes 500 ms. A Settings switch, on by default and remembered per browser,
turns it off.

**Sources:** roadmap row 020 (`docs/design/competition-planner-workbench.md:292`), backlog §Changing a
parameter should re-run the engine, with a working indicator (`backlog.md:1854`). The Understand
workflow's six reports (lifecycle, inputs, timing, tests, pins, and a critic that checked the others
against source) and three competing designs (a store-subscribe controller, a provider hook in
WorkbenchShell, and a low-churn store selector with a hook in CenterView) are summarised under
Measurements. The third design is the base of this plan, with grafts from the other two named where
they land. Probes sit git-ignored in `<wt>/tmp/probes/` (`runTiming*.test.ts`, `rerunEdge.test.ts`,
`blockingGate.test.ts`, `liveRerun.mjs`).

## Owner rulings (2026-10-08, this session)

| # | Ruling |
|---|---|
| R1 | **Indicator after 500 ms.** An "Updating…" status sits in the stale banner's slot. It appears once the board has waited 500 ms for a re-run, measured from when the re-run first became due (debounce + run). A single edit never shows it. Continuous typing, or a slow machine, does. |
| R2 | **Debounce 300 ms** after the last engine-input change. The fencer count keeps committing per keystroke (FR-008: Findings follow typing). |
| R3 | **Loads open stale.** A file or link whose saved run could not be replayed (or carried none) is not re-run automatically. The sender's board and the "Stale – re-run Auto-assign" banner stay. The next parameter edit re-runs as usual. |
| R4 | **Accept lost pins.** A re-run after lowering the day count drops pins on removed days and re-places those events, as pressing Auto-assign does today. 019 decision 10 is superseded and its test (`__tests__/store/templateDays.test.ts:83-103`) restated. |
| R5 | **A Settings toggle, "Re-run automatically", on by default.** Off: the board goes stale after an edit, as today. |
| R5a | **The toggle is per browser**, remembered like the panel layout and zoom (`src/store/viewState.ts`). It is not carried in files or links. |
| R6 | **"Last run HH:MM" and "Placed N events, M could not be placed" update on every automatic run.** |
| R7 | **Day hours: re-run anyway** on a transient inverted window (start after end). A validation message for an inverted window goes to the backlog. |
| R8 | **Hold what describes the board while a re-run is due.** The per-event Unplaced rows, the rail badge and the footer's counts keep their last values until the new run lands, matching the held board. Other findings still follow typing (FR-008). Supersedes decision 6. |

**R8 is not folded into the tasks yet.** The next session folds it first, choosing the mechanism (store
filter beside the `stale:run` drop, or a hold in the panels) against source. It touches T1b's
`selectFindings` cases, T2 test 12 (flips from the accepted flicker to held), decision 6 and Task D's
first left-unfixed bullet, which goes.

The orchestrator's decisions recorded beside the rulings (trigger on key, last-attempted key written
in `runScheduleAll` and seeded on load, no trigger on moves or pins, Auto-assign stays, banner and
`stale:run` row hidden while due) all hold below.

## Global constraints

- `<wt>` = `/Users/noahlz/projects/piste-planner/.claude/worktrees/020-rerun-on-parameter-change`,
  branch `020-rerun-on-parameter-change`, cut from `main` `7a7e503f4d`. Agents commit there only, one
  commit per dispatch plus one per smoke-driver change. Never push, merge, rebase or make the closing
  commit. The user merges with `merge-with-costs`.
- **Plan commit first.** Before T1, the orchestrator commits `specs/020-rerun-on-parameter-change/`
  (untracked today) as "020 plan: re-run on parameter change", its body recording the baseline below
  (93 / 3133, SHA `32a4e0af…`, B1–B8 24 / 24 / 24 / 24 / 12 / 51 / 18 / 53), as 018 and 019 did. T1's judge
  and the handoff diff from that commit.
- Baseline (measured in this worktree): 93 files / 3133 tests with `tmp/**` excluded, `tsc -b` and lint
  clean, ledger B1–B8 scheduled 24 / 24 / 24 / 24 / 12 / 51 / 18 / 53, ERRORs 0 / 0 / 0 / 6 / 0 / 3 / 0 / 0,
  snapshot SHA-256 `32a4e0afb45abfbf8239f7bdbc15dda9eb1487c959893442b6029a6d0998b260`
  (`shasum -a 256 <wt>/__tests__/engine/__snapshots__/driftLedger.test.ts.snap`), boot footers 24/0,
  24/0, 24/0, 24/6, 12/0, 51/3, 18/0, 53/0.
- `vitest.config.ts` does not exclude `tmp/`. Every full-suite run passes `--exclude 'tmp/**'`.
- Commands, never `cd`:
  - `timeout 300 pnpm -C <wt> --silent test --exclude 'tmp/**' > <wt>/tmp/test.log 2>&1`
  - `timeout 180 pnpm -C <wt> exec vitest run <file> > <wt>/tmp/<name>.log 2>&1`
  - `timeout 180 pnpm -C <wt> exec tsc -b > <wt>/tmp/tsc.log 2>&1`
  - `timeout 120 pnpm -C <wt> --silent lint --ignore-pattern 'tmp/**' > <wt>/tmp/lint.log 2>&1`
  - Live app: `pnpm -C <wt> dev --port 5189 --strictPort`, then
    `SMOKE_BASE=http://localhost:5189/piste-planner/ timeout 240 node <wt>/scripts/smoke.mjs`.
  - Read logs only on failure.
- **Test-first.** Each behaviour test fails first on its assertion (stub new exports with their declared
  signatures first, so the failure is an assertion and not an import), and the dispatch records the
  failure reason. Tests marked *guard* pass before and after by design. A negative case ("not due", "no
  run") either is marked *guard* or shares its `it` with a positive control that goes red against the
  stub. Each dispatch's red-reason list names its guards, and an unexpected green outside that list is
  a defect.
- **localStorage per test.** Every test file that calls `bootstrap`, clicks the switch or saves the
  stored view state clears `VIEW_STATE_STORAGE_KEY` in `beforeEach`, as `boot.test.tsx:29` does, since
  `bootstrap` seeds `autoRerun` from it from T3 on.
- `src/engine/` is untouched. `as const` objects with derived unions (the indicator's states included).
  Every loop bounded, and every timer cleared on unmount.
- **Factory copy.** No task touches per-event derivation, `MAX_FENCERS`, `MIN_FENCERS` or
  `DAY_HARD_END_MINS`, so `__tests__/helpers/factories.ts`, `scenarios.ts` and `factoryParity.test.ts`
  do not change. A dispatch that finds itself editing any of them stops and reports.
- Each task ends green on the full suite, `tsc -b` and lint. Its commit body records the snapshot SHA,
  files / tests counts, the drift it measured and any deliberate correction.
- **Floors.** No task moves a floor. A count below a floor halts the task.
- **Live smoke** after every task that changes what the app shows (T1, T2, T3), in its own Sonnet
  subagent: extend `scripts/smoke.mjs` in place (never rewrite), repair locators until two consecutive
  passes, commit only when the driver changed ("020 Tn: smoke …"). The smoke subagent never edits the
  Suggest pin (SC-008's 103 at `smoke.mjs:1172`, "measured, not adjustable"). If 103 moves, it reports
  the number.
- **Drift review per store task** (T1b, T3): read-only judges of at most four items each, run in
  parallel. A counterfactual or control run goes in a detached throwaway worktree that the judge removes.
- **The feature turns on in T3, not before.** T1 and T2 land behind a store flag that starts `false`, so
  each commit leaves the live app and the smoke driver as they were, with one deliberate exception that
  ignores the flag: T2's banner also needs the live model STALE, so after a manual Auto-assign the
  banner goes 150 ms before the board redraws (decision 4, `recompute.test.tsx:584`). The T2 commit
  body records it as a deliberate correction. T3 seeds the flag from the viewer's preference and
  extends the driver in the same task. T3's feature commit and its smoke-driver commit form one change
  for constitution VI: the driver fails at the old 017 T7 step between them, and nothing is handed off
  in between.

## Measurements the plan rests on

- **Engine cost** (`runTiming.log`, `runTiming2.log`, Node/jsdom, 2 warm-ups then 7 timed runs).
  `runScheduleAll` median / max: B1 1.8 / 2.0 ms, B6 5.1 / 5.9, B8 3.2 / 3.8, NAC Vet/Div1/Junior 6.9 / 7.2,
  B6 cut to 2 days 6.8 / 9.2. Cold first run (B8) 11.9 ms. Per store change on the largest boards,
  `buildTournamentConfig` plus `configKeyOf` costs 0.1–0.2 ms (a key of about 32,000 characters) and all
  eight memoised selectors together 0.7–0.9 ms. The Suggest search drains in at most 6.6 ms.
- **Live re-run cost** (`liveRerun.mjs`, vite dev server, React dev mode, headless Chromium at
  1440×1000, 5 runs per scenario). From the Auto-assign click to the next paint:

  | Scenario | Click handler (ms) | Click to paint (ms) | Long-task time (ms) |
  |---|---|---|---|
  | B1 boot | median 4, max 5 | median 53, max 60 | median 53, max 59 |
  | NAC Vet/Div1/Junior, 66 events | median 19, max 22 | median 80, max 94 | median 80, max 94 |
  | the same at Suggest's 103 strips (66 placed) | median 20, max 20 | median 94, max 106 | median 94, max 104 |
  | B6 | median 12, max 13 | median 69, max 71 | median 70, max 123 |

  The handler is 4–22 ms, and the rest is React rendering the board. Nothing ran late in the 400 ms
  after each paint, and the page logged no errors. So a single edit lands at about 300 + 106 ms, far
  short of R1's 500 ms, and the indicator shows only under continuous edits or a timer the main thread
  delays. A synchronous run cannot paint an indicator during itself (timing §3), and a Worker or a
  chunked engine is not justified at these times.
- **Who writes the inputs** (inputs report, critic §1 claim 1). The fencer count commits per in-range
  keystroke (`EventsPanel.tsx:136-139`, `number-input.tsx:58-77`), so typing "80" writes 8 then 80, and
  typing "1" writes nothing (min 2). Strips, video strips and pool durations commit on blur or a +/−
  click. Day hours write once per pick, with no start < end check (R7). A preset pick is 7 + N separate
  writes (`presets.ts:15-29`), with fencer counts at 0 in between, then a synchronous run. A template
  pick is one write and a synchronous run.
- **What the key covers** (critic §1 claim 3). `configKeyOf` encodes `{config, competitions}` only
  (`keptRun.ts:92-93`). Hand moves and pin toggles touch `placements` only (`store.ts:473-500`), so they
  never trigger. Flight is a Competition field (`buildConfig.ts:232`), so it does. The proxy check at
  `drawnSchedule.test.ts:219-231` pins the list of store fields `buildTournamentConfig` reads.
- **Key, not run state** (critic §2.4). `runStateOf` returns FRESH when no selected event holds an
  in-range placement (`derived.ts:169-176`), so a run that places nothing leaves the board FRESH whatever
  changes next. The trigger compares keys, which recovers such a board.
- **A run on a Blocking board wipes it** (critic §3.1, `rerunEdge.log`). At strips 0 or 1, or video
  above strips, the run places 0 of 24 and replaces every unpinned placement. The trigger skips a
  Blocking board by the Header's own rule (`Header.tsx:26-27`, `:59`). B1–B8 show 0 Blocking rows under
  both the Header's and CenterView's rules (`blockingGate.log`), so the 6 and 3 ledger ERRORs on B4 and
  B6 never gate the trigger. An inverted window on day 1 is not Blocking, does not throw, and places 18
  of 24 (R7).
- **Throws** (critic §1 claim 2). No UI path reaches a `scheduleAll` throw today. The bound is still
  required (constitution IV), and the last-attempted key supplies it.
- **Stale surfaces** (lifecycle §3). The banner reads CenterView's committed model, while the Findings
  row, the rail badge and the footer read the live store. With a 300 ms debounce and no hold, the
  banner would flash from t0+150 to t0+450 on every edit and the board would jump twice (to the
  placement-derived layout, then to the new run). While stale, `unplacedIds` is empty
  (`derived.ts:230-235`), so per-event Unplaced rows and the footer's unplaced count read 0.
- **Notice and dismissal behaviour** (lifecycle §4, pins §2). `stale:run` is an UNPLACED row, never
  dismissable (`derived.ts:753-764`), so hiding it changes neither the Header's Blocking gate nor
  `dismissFinding`, which reads `selectAllFindings` (`store.ts:519-524`). A dismissed day-scoped
  warning comes back when its event moves day (its id carries the day, `derived.ts:716`). No undo exists.
- **Tests that see a trigger** (tests report, critic §3.6). Only `boot.test.tsx` calls `bootstrap`. A
  flag that only `bootstrap` turns on leaves every other store and component test as written. In
  `boot.test.tsx`, only `:238-266` edits after render and expects the banner.
- **Smoke** (tests report §2). The 017 T7 step (`smoke.mjs:692-718`) needs a stale board, and the share
  round-trip after it (`:723-746`) opens a second page that shares `localStorage` (`:735-737`). Fixed
  400 ms waits after input edits sit at `:327`, `:344`, `:687`, `:854`, `:868`, `:895`, `:958` and
  `:1425`, and the board now holds for about 450–560 ms after an edit. The Auto-assign clicks stay, as
  the run is idempotent. The comment at `:1641-1645` ("receivers open stale by design") turns false.
  017 task S (`:1709-1785`) needs the button to re-seat a hand move, which a move never triggers.
- **What else is stale** (critic §3.10). `StripsPanel.tsx:12-20` cites run times of about 200 ms where
  the probe measures about 7 ms. `METHODOLOGY.md` mentions neither re-runs nor Auto-assign, so it is not
  amended.
- **Plan review** (four lenses: rulings and test-first, timing correctness, UI and smoke, drift and
  constitution, each finding checked by a verifier against source). Upheld and folded:
  - **Must-fix (raised by three lenses, one rated it blocker):** T1 skipped `react-code-reviewer` for the
    Header switch. T1b now dispatches it, scoped to the Header diff.
  - **Test-first:** R6's dock half moves to B4 with its premise asserted; negative cases are marked
    *guard* or paired with a positive control (T2 test 7 now proves a click cancels the pending run);
    `data-rerun="due"` is asserted; StrictMode test 10 mounts while due; R3 races (async file load, a
    full-shell link boot), focus, the switch's accessible name and keyboard, `applyLoadedState` keeping
    `autoRerun`, and the R2 guards are covered; every bootstrap-calling file clears the stored view
    state per test.
  - **Timing:** the late-fire path waits a frame (rAF, then `setTimeout(0)`), and its paint is recorded
    as best-effort; T2 carries react-hooks v7 lint guidance; the hook subscribes through
    `selectDueKey`, so the switch-off path computes no key; the unmount case covers the late-fire wait.
  - **Smoke:** the T3 drift judge splits, and items needing the live log run after the smoke passes;
    `settleBoard` waits on a new `data-settled` attribute instead of a fixed tail, under a stated rule;
    R6 is observable through `data-last-run-at`; R4 and R5a get live checks, and R7 is unit-only by
    record; the R1 burst is 8 clicks about 100 ms apart, observed from before the first click; the
    driver order around R3 is fixed; 016 check 2's possible throw is a measurement to report; stale
    comments are named.
  - **Structure:** T1 splits into T1a (Sonnet) and T1b (Opus); the helper module exports data only, so
    the proxy `it` stays put; the plan is committed before T1; the T2 banner exception to "the live app
    is unchanged" is named; the unchanged guard suites are listed; the two T3 commits form one change.
  - **Recorded rather than fixed:** the Findings flicker during the window goes to the owner as a
    decision (6), and the reveal-clock restart, the early indicator clear, the slot's layout shift and
    the Move day menu focus edge join Task D's left-unfixed index.
  - **Refuted by a verifier:** "a single gap ≥ 300 ms in the R1 burst makes the indicator never appear".
    The reveal clock does not restart on key changes, so only the observed episode's last gap matters.
    Its narrower surviving point (watch from before the first click, and name the page and the
    competition) is folded.
  - **Declined:** having `computeDrawnSchedule` reuse `selectConfigKey` (optional, and it touches the
    drawn-schedule memo outside this feature's scope).

## Design in one paragraph

The rule lives in the store, and the timers live in a hook. `selectRerunDue(state)` is true when the
store's `autoRerun` flag is on, the live config key differs from both `lastRun?.configKey` and a
not-serialized `lastAttemptedKey`, and no Blocking finding shows. `runScheduleAll` writes
`lastAttemptedKey` before it calls the engine, and `applyLoadedState` seeds it with the loaded key in
its one `setState`, so every run and every load leaves nothing due. `autoRerun` starts `false`, and only
`bootstrap` seeds it from the viewer's stored preference. A hook, `useAutoRerun`, called from
`CenterView`, debounces 300 ms on the key while due, re-checks the rule against `getState()` when the
timer fires, and runs once. Because the rule is a store selector, the banner, the Findings row, the rail
badge and the smoke driver's attribute all read the same answer.

## Tasks

### T1: the re-run rule in the store (inert)

Two dispatches, run in order, to keep each inside the 2–4 step cap:

- **T1a – the fields and their writers.** The `ViewState` field and its validation, the UI slice's two
  fields and setter, the `runScheduleAll` write, the `applyLoadedState` seed, and their tests (the
  `viewState.test.ts`, store-reset, serialization, run, throw and load cases below). Sonnet, high effort.
- **T1b – the rule.** The `derived.ts` selectors, the `selectFindings` deps and filter, the Header
  switch, the helper move and the probe, and their tests (every other case below). Opus, high effort: a
  missing memo dep or a mis-ordered seed fails silently.

- **Intent.**
  - `ViewState` gains `autoRerun: boolean`, default `true`, checked in `isValidViewState` like
    `detailCollapsed` (`viewState.ts:113`). A stored value without it falls back to all defaults, as any
    missing field does.
  - The UI slice gains `autoRerun: boolean` (initial `false`) with `setAutoRerun`, and
    `lastAttemptedKey: string | null` (initial `null`). Neither is serialized (`serializeState` builds an
    explicit literal). `getInitialState` resets both.
  - `runScheduleAll` writes `lastAttemptedKey` from the config it has just built, before it calls
    `scheduleAll` (`runActions.ts:37-48`), so the success path,
    the throw path (`:49-57`) and a throw from `keepRun` all record it. Boot (`boot.ts:50`), the picker
    (`PresetPicker.tsx:46`) and Auto-assign (`Header.tsx:58`) record it through it.
  - `applyLoadedState` seeds `lastAttemptedKey` with the key of the merged loaded state, inside its one
    `setState` (`exportActions.ts:53`), so no subscriber sees loaded inputs without the seed. `replayRun`
    is unchanged.
  - In `derived.ts`:
    - `selectConfigKey`: `configKeyOf(buildTournamentConfig(state))`, memoised on exactly the store
      fields `buildTournamentConfig` reads (the proxy-checked list).
    - `selectHasBlocking`: true when any row of `selectAllFindings` is Blocking. Blocking rows are never
      dismissable, so this equals the Header's rule over `selectFindings`. The Header switches to it.
    - `selectRerunDue`: false when `autoRerun` is off (checked first, so the key is not computed), else
      key ≠ `lastRun?.configKey`, key ≠ `lastAttemptedKey`, and not `selectHasBlocking`.
    - `selectDueKey`: the key while due, `null` otherwise, so the T2 hook subscribes to it rather than
      to `selectConfigKey` and computes no key while the switch is off.
    - `computeFindings` drops the `stale:run` row while due. `selectFindings` gets its own deps function
      (`daySummaryDeps` plus `autoRerun` and `lastAttemptedKey`), so `selectDaySummaries` keeps its deps
      (graft from the store design).
  - Move ACTION_EDITS and FIELD_EDITS (`drawnSchedule.test.ts:180-218`) into
    `__tests__/helpers/inputEdits.ts` as data only, imported by `drawnSchedule.test.ts` and the new test,
    with no assertion changed (graft from the store design). The proxy completeness `it`
    (`drawnSchedule.test.ts:221-232`) stays where it is: an `it` in an imported module would register
    once per importing file, change the test count and leave its describe.
  - A probe under `<wt>/tmp/probes/` measures the added cost of `selectRerunDue` across a B8 preset pick
    with `autoRerun` on (7 + N writes). Above 16 ms, report back rather than optimise.
- **Tests first** (new `__tests__/store/rerunDue.test.ts`, red against stubs that return `false` /
  `null` / `''`).
  - With `autoRerun` on, every ACTION_EDIT and FIELD_EDIT after a run makes the board due, and every
    FIELD_EDIT changes `selectConfigKey` (its memo deps are complete). With it off, none does, in the
    same `it` as the "on" sweep so the case is red against the stub. `selectDueKey` is the key while due
    and `null` while off.
  - After `runScheduleAll`, not due, and `lastAttemptedKey` equals `lastRun.configKey`. With
    `scheduleAll` mocked to throw (the `runActions.test.ts:21` passthrough mock), `lastAttemptedKey`
    equals the current key, `lastRun` is null, the board is STALE and not due. Inside the mock,
    `lastAttemptedKey` already holds the key (written before the call).
  - A pick followed by its run (`applyTemplate`, then `applyPreset`) is not due, and an edit after it is
    due (the positive control, same `it`).
  - Loads: `applyLoadedState` with no run, with a refused run and with a replay that throws is not due,
    STALE, with `lastAttemptedKey` equal to the loaded key. A `subscribe` listener sees the seed in the
    same notification as the loaded inputs. The next edit is due. `applyLoadedState` leaves `autoRerun`
    as it was (R5a: a load never carries the switch).
  - Strips 0 is not due, although its key differs from `lastRun.configKey` (asserted in the same `it`).
    Restoring the run's value is still not due (the key equals the run's), and a non-Blocking edit after
    that is due (the positive control, same `it`).
  - A run that places nothing on a board that is not Blocking (find one, such as every day window
    inverted, and assert the premise), then an edit, is due.
  - `setPinned` and `updatePlacement` are not due (*guards*), each followed in the same `it` by a key
    edit that is due. A Flight toggle is due. An inverted day window is due (R7).
  - `selectFindings` has no `stale:run` while due, has it with `autoRerun` off (*guard*), and has it on a
    Blocking board (*guard*: strips 0 is STALE today, since `runStateOf` checks only the day range).
  - `selectHasBlocking` equals the Header's rule over `selectFindings` on B1–B8, strips 0 and strips 1.
  - A store reset gives `autoRerun` false and `lastAttemptedKey` null (red only if the stub omits the
    fields, otherwise *guard*). In `serialization.test.ts`, the payload carries neither field (*guard*:
    `serializeState` builds an explicit literal).
  - `viewState.test.ts`: `DEFAULT_VIEW_STATE.autoRerun` is true, a non-boolean falls back wholesale, and
    a stored object without the field falls back wholesale (records the one-time reset).
- **Guards.** `Header.test.tsx:140-148` and `WorkbenchShell.test.tsx:148-176` (strips 0 disables
  Auto-assign) pass unchanged through `selectHasBlocking`. Every row of tests report §A, §C and §D passes
  unchanged, because the store reset leaves `autoRerun` false. `appPathParity.test.ts` (its template
  sweep included), `keptRun.test.ts` and `appPath.test.ts` pass with their files untouched: they reset
  through `getInitialState`, and `selectAllFindings` keeps `stale:run`.
- **Tests that flip or are restated.**
  - `viewState.test.ts:30-50`: `sampleViewState` gains `autoRerun` (TypeScript forces it).
  - `templateDays.test.ts:79-103` (R4). Restated as two cases. The R4 case: after `setDays(3)`,
    `runScheduleAll()` – the run 020 now performs – re-places the day-4 pin's event as auto and unpinned
    on a day below 3, and the re-pick does not bring the pin back. The *guard* case, retitled "with no
    run between the lower and the raise (automatic re-run off), the pin comes back": the existing body.
    Rewrite the comment at `:79-81` to say 020 R4 supersedes 019 decision 10 whenever a run happens in
    between, which automatic re-run makes the default. Both are green on arrival
    (`runActions.test.ts:76-100` already proves the drop). Record that rather than a red reason.
- **Ledger.** Byte-identical: `32a4e0afb45a…`. No floor moves.
- **Drift review (1 judge, 4 items, after T1b).** (1) Ledger SHA byte-identical, B1–B8 counts and ERRORs
  unchanged. (2) Boot footers through the store path (`__tests__/helpers/appPath.ts`) unchanged at 24/0 …
  53/0. (3) The `__tests__` diff since the plan commit adds tests and changes only the lines listed
  above, and the guard files named above are untouched. (4) The probe's added cost per B8 preset pick,
  and `selectHasBlocking` parity.
- **Reviews.** Test quality and spec after each dispatch. After T1b, also `react-code-reviewer`, scoped
  to the Header diff: the component now subscribes to a boolean selector instead of the findings array,
  which changes when it re-renders and drops its dependence on `selectFindings`' new deps
  (constitution II has no size exemption).
- **Smoke.** Run it after T1b. No driver change is expected, since the flag is off in the live app.

Commits: "020 T1a: the re-run fields and their writers" and "020 T1b: the re-run rule in the store".

### T2: the board re-runs itself (behind the flag)

- **Intent.**
  - New `src/components/workbench/useAutoRerun.ts` exports `RERUN_DEBOUNCE_MS = 300`,
    `RERUN_INDICATOR_DELAY_MS = 500` and `useAutoRerun(): { due: boolean; updating: boolean }`.
    `CenterView` calls it once.
    - **Debounce.** An effect keyed on `[due, key]`, with the key read through `selectDueKey`. While
      due, each key change clears and restarts one
      300 ms timer and remembers the key it armed for. When it fires, it reads `useStore.getState()` and
      calls `runScheduleAll` once only if the key still equals the armed key and `selectRerunDue` is
      still true. The cleanup clears it, which also covers StrictMode's mount, cleanup, mount
      (`main.tsx:7`) and test teardown.
    - **Reveal clock (R1).** When due turns on, the hook records when (`Date.now()`, which the fake
      clock controls) and starts one 500 ms reveal timer that later key changes do not restart.
      `updating` is derived as "due and this due episode has been revealed", so it falls on the render
      where due falls, with no extra state write (graft from the hook design). The hook must also work
      when it mounts while already due (StrictMode's simulated remount keeps refs, and so does a dev
      Fast Refresh): a mount while due starts the reveal clock, rather than waiting for a rising edge
      tracked in a ref.
    - **Lint shape (react-hooks v7, errors in `eslint.config.js`).** Read `Date.now()` only in effects
      or timer callbacks, never in render. Set `revealed` in the reveal timer callback and reset it in
      the effect cleanup (both lint-clean), never synchronously in an effect body. Read no ref during
      render: any render-time value a timer callback needs, such as whether the indicator is showing,
      goes in a ref written in an effect. A probe (`tmp/probes/lintHook.tsx`) shows ref reads in render,
      `Date.now()` in render and a synchronous setState in an effect body each fail lint.
    - **Late fire (R1's slow machine).** If the debounce fires 500 ms or more after due began and the
      indicator is not showing yet, the hook reveals it first, then waits past a frame
      (`requestAnimationFrame`, then `setTimeout(0)`, rather than the bare `setTimeout(0)` of
      `yieldToBrowser` at `store.ts:208-216`, which suffices for the strip search only because it
      yields many times), re-checks the rule and the armed key, and only then runs. A single
      `setTimeout(0)` would usually run before the next frame, so the reveal would commit and vanish
      unpainted. Even with the frame wait, the paint is best-effort: no automated test proves it, and
      Task D records that.
    - At most three timers live at once (debounce, reveal, late-fire wait), each run is preceded by a fresh rule check, and a run records
      its key before the engine starts, so runs ≤ distinct keys the organizer reached (constitution IV).
  - `CenterView`:
    - The settle effect skips its commit while due, as it does for `hasBlocking` (`:168`), with `due`
      in its deps (`:182`). The center keeps the last fresh board until the run lands, then commits 150 ms
      later: one change per edit, not two.
    - The stale banner shows when the committed model is STALE, the live model is STALE, and the board
      is not due. The live check (graft from the store design) stops a 150 ms flash after an automatic
      run on a board that was already stale, such as a stale load then an edit.
    - Inside the same `role="status"` region (`:193-203`), and never with the banner, an "Updating…" row
      with `data-rerun-indicator`, neutral styling and an `aria-hidden` `motion-safe:animate-spin` icon,
      while `updating`. No `aria-busy`.
    - `<main aria-label="Center view">` carries `data-rerun="due"` or `data-rerun="idle"`, read live, and
      `data-settled="true"` once the committed model matches the live one and no settle timer is pending
      (`"false"` otherwise), for tests and the smoke driver.
  - Bare `CenterView` renders with the flag off do nothing new, apart from the banner's live check
    (decision 4), which ignores the flag.
- **Tests first** (new `__tests__/components/workbench/autoRerun.test.tsx`, fake timers in the style of
  `StripsPanel.test.tsx:26-30`, engine calls counted with the `runActions.test.ts:21` passthrough mock,
  bare `CenterView` after B1 and a run, then `setAutoRerun(true)`; fake timers include
  `requestAnimationFrame`). Red reason: "`scheduleAll` called 0 times" and no `[data-rerun-indicator]`,
  because the hook is a stub. Each negative case below shares its `it` with a positive control that is
  red against the stub. *Guards*: the existing commit-per-keystroke tests for the fencer count (FR-008,
  R2) in `number-input` and `EventsPanel` stay green and unchanged.
  1. **Single edit.** 0 runs at 299 ms, 1 at 300 ms, FRESH after. `data-rerun="due"` at every step
     from the edit to 299 ms, `"idle"` from the run on. Stepping 10 ms to 700 ms, no
     `[data-stale-banner]`, no `[data-rerun-indicator]` and no `stale:run` row in `selectFindings` at any
     step. The schedule's text is unchanged until the run plus `CENTER_SETTLE_MS`, then changes once,
     and `data-settled` reads `"true"` only from then on.
  2. **Five edits 200 ms apart.** One run, 300 ms after the last. The indicator is absent at 499 ms
     after the first edit and present at 500 ms, inside `role="status"`, reading "Updating…", and gone
     on the render where the run lands.
  3. **Late fire.** `setSystemTime` 600 ms ahead without advancing, then advance 300 ms: the indicator
     shows and the engine has not run. Advance one frame (16 ms or more, rAF faked): one run, indicator
     gone. This proves ordering, not paint. Unmounting during the late-fire wait, then advancing 1 s,
     gives 0 runs.
  4. **Throw.** With `scheduleAll` throwing, advance 10 s: exactly one call, then the banner and the
     `stale:run` row show.
  5. **Flag off.** An edit and 1 s give no run, and the banner shows after the settle as today. Turning
     the flag on gives one run within 300 ms, and the banner goes.
  6. **Blocking.** Strips 0 gives no run, no indicator, `data-rerun="idle"`, the board dimmed. Restoring
     strips gives no run. A non-Blocking edit after that gives exactly one run (the positive control).
  7. **Moves, pins and the button (decision 13).** `updatePlacement` and `setPinned` give no run and
     `data-rerun="idle"`, and a key edit after them runs exactly once. Then the same key edit twice: once
     left alone, giving one automatic run at 300 ms; once followed by a `runScheduleAll()` click inside
     the window, giving one run in total at +300 ms and still one at +1 s.
  8. **Loads (R3).** `applyLoadedState` with no run, 1 s: no run, the banner shows. The next edit runs,
     and the banner never flashes after it. Race: an edit, then `applyLoadedState` (no run) at +100 ms,
     then advance 1 s: 0 runs and the banner shows (the in-app file load is async, `ExportPopover.tsx:55-61`).
  9. **R7.** An inverted day window runs.
  10. **Lifecycle.** Make the board due before rendering (flag on, then an edit), then render inside
      `<StrictMode>`: exactly one run at 300 ms. Second case, continuous edits from a StrictMode mount
      while due: the indicator appears at 500 ms. Unmounting with the debounce pending, advancing 1 s,
      gives no run, and an edit before the unmount in the same `it` proves a run would have come.
  11. **Focus.** Focus the fencer-count input, type a digit, advance 300 ms: `document.activeElement` is
      still that input and its text is unchanged. The same for the DetailStrip Flight button after the
      run its toggle triggers.
  12. **The accepted Findings flicker (decision 6).** On B6 (51/3), record the `unplaced:*` row count in
      `selectFindings` between an edit and its run. It drops to 0 and comes back when the run lands. This pins
      the accepted behaviour, so a later hold is a deliberate flip.
- **Tests that flip or are restated.**
  - `recompute.test.tsx:573-590`: the assertion at `:584` (`banner()` not null right after
    `runScheduleAll()`) becomes null, because of the live check. Retitle the case to say the banner goes
    with the run and the board follows after the settle.
  - `recompute.test.tsx:524-640` otherwise, `invalidState.test.tsx` and `scheduleOutput.test.tsx:194-205`
    stay as written (flag off).
- **Ledger.** Byte-identical.
- **Reviews.** Test quality, spec, `react-code-reviewer`.
- **Smoke.** Run it. No driver change is expected, since the flag is still off in the live app. The
  live check means a click on Auto-assign drops the banner 150 ms before the board redraws, which no
  smoke step times.

Dispatch: Opus, high effort (a mistake here fails silently).

Commit: "020 T2: the board re-runs itself, behind the flag". The body records the banner's live check
as a deliberate correction that ignores the flag, citing `recompute.test.tsx:584`.

### T3: re-run automatically, on by default (R5, R5a, R6, feature on)

- **Intent.**
  - `bootstrap` seeds `autoRerun` from `loadViewState().autoRerun` before anything else, on both the
    link and the preset path. This is where the feature turns on.
  - `SettingsPanel` gains a first section, "Board", holding a Radix `Switch` (from the `radix-ui` package
    already imported at `SettingsPanel.tsx:2`) named "Re-run automatically", with the description "Off:
    an edit leaves the board stale until you press Auto-assign." linked by `aria-describedby` (the `useId`
    pattern at `:51-52`). The visible text is a `<label htmlFor>` tied to a `useId()` id on
    `Switch.Root`, so the switch has its accessible name and a click on the text toggles it. It reads the
    store's flag. A change calls `setAutoRerun(next)` and
    `saveViewState({ ...loadViewState(), autoRerun: next })`, the merge `WorkbenchShell.tsx:80-111` uses.
    Update the panel's docblock (`SettingsPanel.tsx:23-45`), which says it holds pool durations and DE
    mode only.
  - The Header's `[data-last-run]` span also carries `data-last-run-at={lastAutoRun.at}`, so the smoke
    can see a run happened (the visible text shows minutes only).
  - Smoke driver, extended in place (see Smoke below), in its own commit.
- **Tests first** (red reason: no switch named "Re-run automatically", the query throws, and `bootstrap`
  leaves the flag false). Every file below clears `VIEW_STATE_STORAGE_KEY` in `beforeEach` (Global
  constraints), `SettingsPanel.test.tsx` and the new shell section of `autoRerun.test.tsx` included.
  - `boot.test.tsx`: `bootstrap('')` with nothing stored gives `autoRerun` true. With a stored
    `autoRerun: false`, false. On a link boot, seeded the same way. A case that boots with nothing stored
    right after a switch-off case reads true (proves the reset). Full shell: `bootstrap(<no-run link>)`,
    render `WorkbenchShell`, advance 2 s: 0 `scheduleAll` calls and one `[data-stale-banner]` (R3, the
    seed lands before any run).
  - `SettingsPanel.test.tsx`: `getByRole('switch', { name: 'Re-run automatically' })` has
    `aria-checked="true"` after seeding and `toHaveAccessibleDescription` with the description text. A
    click writes the store and the stored view state with the other fields kept. Space toggles it
    through user-event, and the switch keeps focus. The "exposes nothing it must not" cases
    (`SettingsPanel.test.tsx:208-243`) still hold.
  - Shell-level (extend `autoRerun.test.tsx`, `bootstrap('')` then a full `WorkbenchShell` render):
    - a template pick and a preset pick through the picker each run the engine exactly once in 1 s
      (*guard* before T3: the pick's own run at `PresetPicker.tsx:46` already makes it 1; the same `it`
      then makes an edit and asserts a second run at 300 ms, which is red before T3);
    - R6, Header half on B1: with `setSystemTime`, an automatic run changes "Last run HH:MM" and
      `data-last-run-at`;
    - R6, dock half on B4 (24/6, through the picker or `applyPreset('B4')` and a run): assert first that the dock shows the
      "Placed …" line and at least one unplaced chip, then an edit's automatic run updates it. With
      `scheduleAll` throwing, the placements survive (`runActions.ts:49-57`), so the line reads "Placed 0
      events, <attempted> could not be placed.";
    - R4: pick NAC Cadet/Junior through the picker (that pick runs once), at 4 days pin a day-4 event,
      click the 3 Days pill, advance 300 ms: the event is auto and unpinned on a day below 3. Assert
      first that the 3-day board is not Blocking (probe `tmp/rulingsReviewR4.log` holds the premise);
    - turning the switch on re-runs a board edited while it was off, and a stale load stays stale.
- **Tests that flip or are restated.** `boot.test.tsx:238-266`: save
  `{ ...DEFAULT_VIEW_STATE, autoRerun: false }` before `bootstrap`, with the comment "the switch is how a
  test reaches a stale board on purpose (020 R5)". Every other assertion stays, including the premise
  that both notices show together.
- **Ledger.** Byte-identical.
- **Drift review (2 judges).** In the review wave, 1 item: (3) one engine run per preset or template
  pick, from the shell tests. After the smoke subagent's two consecutive passes and its driver commit,
  a second judge reads that log for 3 items: (1) live boot footers for B1–B8 read 24/0, 24/0, 24/0, 24/6,
  12/0, 51/3, 18/0, 53/0; (2) every template step's row counts and SC-008's 103 are unchanged; (4) a
  stale link stays stale for 2 s live (R3). The second judge never runs smoke itself.
- **Reviews.** Test quality, spec, `react-code-reviewer`.
- **Smoke.** The smoke subagent extends `scripts/smoke.mjs` in place:
  - Reword the header claim at `:5` ("a derived table follows an edit without a re-run") to say the
    board re-runs after an edit.
  - Helpers next to `pressSuggest` (`:216`): `settleBoard(pg)` waits at least 350 ms (so the check
    cannot pass before the render that sets "due"), then for `main[data-rerun="idle"][data-settled="true"]`,
    with no fixed tail. `setAutoRerunSwitch(pg, on)` opens Settings, sets the switch, and leaves the
    panel as it found it (the panel is persisted, `:165`, `:909`). `closePanel` gains a `pg` parameter
    defaulting to `page`, as `openPanel` has (`:190-196`).
  - **The rule for `settleBoard`:** after any engine-input edit, call it before the next Move day, pin
    or board read, unless an Auto-assign click comes first. The subagent reports every place it applied
    the rule. Known sites: replace the fixed 400 ms waits at `:327`, `:344`, `:687`, `:854`, `:868` (so
    the equality at `:873` compares settled boards), `:895`, `:958`, `:1425`. Add it after the days-3
    click in the 019 hint block (`:1336-1378`), before the NAC Youth pick, and after the type change
    and `pressSuggest` in 016 check 2 (`:1580-1588`), before `eventIds()`. The waits at `:986`, `:990`,
    `:1410` and `:1473` stay, because an Auto-assign click, a template pick or a new `settleBoard`
    follows each. The Auto-assign clicks at `:349-359` and their siblings stay.
  - **016 check 2 is a measurement.** With `settleBoard` there, `eventIds()` reads a fresh re-run at
    Suggest's strips rather than the ROC Mega pick's run. If it now throws "no Group 1 pair with pools on
    different days", report it with the chosen pair and its days. Do not loosen the check. If it fires,
    the fix is to move the read before the Apply.
  - Fencer edit (`:651-690`): before the fill, a MutationObserver records any attach of
    `[data-stale-banner]` or `[data-rerun-indicator]`, and the driver reads `data-last-run-at`. After
    `settleBoard`, neither attached, no `stale:run` row exists, `data-last-run-at` increased (R6 live:
    the automatic run happened), and the table moved.
  - `[M]` 017 T7 (`:692-718`), restated, in this order: switch off, edit the fencer count again (98),
    and keep the existing assertions word for word (one banner in `role=status`, one non-dismissable
    `stale:run` row). While the switch is off, open a new page in `ctx` on BASE, `openPanel('Settings',
    pgX)`, assert the switch reads `aria-checked="false"` (R5a live), and close that page. Capture a
    share link from this stale board with `linkFromSender` (`:1655-1662`, hoisted). Switch on,
    `settleBoard`, assert 0 banners and 0 stale rows. Then the share round-trip at `:723-746` as today,
    then R3, then R1, then the gears block at `:746`.
  - New `[M]` 020 R3: assert the switch is checked on the sender first, then open the captured link (no
    run) in a new page. Read the receiver's `[data-schedule-row]` text at open and again after 2 s, and
    assert they are equal, one banner and `data-rerun="idle"`. Edit a fencer count there, `settleBoard`,
    and assert the banner is gone. Close the page.
  - New `[M]` 020 R1, on the main `page` (ROC Div1A/Vet), on a placed competition chosen with the
    existing `unplacedText` filter, at a count at least 8 below max: a MutationObserver installed before
    the first click records any attach and detach of `[data-rerun-indicator]`. Click "Increase Fencer
    count for …" (`number-input.tsx:128`) 8 times about 100 ms apart, logging the measured gaps, and
    assert `main[data-rerun="due"]` holds through the burst. The indicator attached at least once,
    read "Updating…" inside `role=status`, and detached within 3 s. Restore the count and `settleBoard`.
  - R4 live, inside the 019 hint block before it re-raises to 4: pin a day-4 event, click 3 Days,
    `settleBoard`, and assert the event is unpinned on days 1–3 and the footer reads 24 placed.
  - R7 is unit-only (T1b, T2 test 9): an inverted window needs two hour picks, and the unit tests
    already cover the run on it.
  - Reword the comment at `:1641-1645`: a fresh sender's link carries a run now. Reword the stale
    comments at `:776-780` (Settings is first opened earlier now), `:819-820` and `:1288-1291` (the
    fencer count is 98, not 99).
  - In 017 task S (`:1709-1785`), assert `data-rerun="idle"` after the Move (a move never triggers).
  - The count of 4 "Default" texts at `:796-801` should hold with the planned wording. Confirm it.
  - Never touch SC-008's 103 (`:1165-1173`).

Dispatch: Sonnet, high effort. Then the review wave (with the first drift judge), the fix round, the
Sonnet smoke subagent, and last the post-smoke drift judge.

Commits: "020 T3: re-run automatically, on by default" and "020 T3: smoke – the board re-runs after an
edit". The two form one change for constitution VI (Global constraints).

### Task S: the final live smoke

Two consecutive full passes on the final head, 0 console errors, boot footers B1–B8 unchanged.

### Task D: docs

- `backlog.md` §Changing a parameter should re-run the engine (`:1854`): mark it "Delivered by 020",
  with what shipped, correcting its stale lines (`TopBar.tsx:103`, `boot.ts:41`, "Auto-schedule all").
- New entry: an inverted day window (start after end) has no validation message, and a two-pick hours
  change re-runs on the inverted window between the picks (R7).
- A §What 020 deliberately left unfixed index after §What 019's, pointing at entries for:
  - the footer counts, the rail badge and the per-event Unplaced rows read the live stale board for
    about 300 ms per edit (a false "0 unplaced" on B4 and B6), because `unplacedIds` is empty while
    stale. It is a visible flicker: the Unplaced rows vanish and the badge drops while the center still
    shows those events in the No room lane (decision 6, put to the owner at handoff);
  - the indicator cannot show during one long synchronous run, only before it (late fire) or under
    continuous edits. A predictive reveal from the last run's measured time, or a Worker, is later work;
  - an automatic run clears neither `loadRefusal` nor ExportPopover's "opens stale" notice;
  - a deselect, a chip toggle or any key edit reshuffles every unpinned event, a dismissed day-scoped
    warning can return when its event moves day, and there is no undo (the switch is the escape);
  - a share link copied inside the 300 ms window carries no run, so its receiver opens stale;
  - turning the switch on re-runs edits made while it was off;
  - the late-fire reveal is best-effort: it waits a frame before the run, but no automated test proves
    it paints;
  - the reveal clock restarts when a Blocking edit or a switch-off interrupts a due episode, so under
    continuous editing through a Blocking value the indicator can come later than 500 ms after the
    episode first began;
  - the indicator clears on the render where the run lands, about 150 ms before the board redraws, and
    the status region going empty is no completion cue for a screen reader;
  - the indicator's in-flow slot shifts the board about 33 px and makes the canvas re-measure each time
    it appears or disappears during continuous edits (R1 puts it in the banner's slot);
  - an open Move day menu on an event that an automatic run (say from a Flight toggle) unplaces
    unmounts with its button, and focus drops to the body.
- Extend §Picking a preset keeps the pins (`:2001`) and the 019 leftovers: 020 R4 supersedes 019
  decision 10 whenever a run happens between a lower and a raise. Add a one-line pointer at
  `specs/019-default-days-per-template/plan.md:357` to 020 R4, without rewriting the decision.
- Correct the stale timing comments at `src/components/workbench/panels/StripsPanel.tsx:12-20` to the
  measured 0.2–6.6 ms (comment only, then `tsc -b` and lint). A comment-only change is not a React
  edit under constitution II, so no React reviewer.
- `competition-planner-workbench.md` row 020: delivered, with the new baseline.
- `METHODOLOGY.md`: no change (checked: it mentions neither re-runs nor Auto-assign).

Commit: "020 D: docs".

### Task H: handoff

`specs/020-rerun-on-parameter-change/handoff.md` in 019's shape: status, session notes, what changed,
measurements with the chain of measurements and the test count chain, reviews, decisions made on the
owner's behalf (owner rulings, then the decisions the work made) with their cost, left unfixed, merge,
and the resume prompt for the next roadmap feature.

Commit: "020 H: the handoff".

### Task M: the merge check

`git merge-tree --write-tree main 020-rerun-on-parameter-change`. If main has not moved, the tree equals
the branch's and the branch's own checks cover it. Otherwise check out the merged tree in a detached
throwaway worktree and run the full suite, `tsc -b`, lint and the ledger there. Record the result in the
handoff's Merge section.

Commit: "020 M: record the merge-tree check".

## Decisions made on the owner's behalf

1. **The rule is a store selector, and the timers are a hook in `CenterView`.** One answer for the
   banner, the Findings row, the rail badge and the smoke attribute. Cost: automatic re-runs happen only
   while `CenterView` is mounted. It always is in the shell, but a future layout that unmounts the
   center stops them.
2. **`autoRerun` starts `false` in the store, and only `bootstrap` turns it on.** Every existing store and
   bare-component test keeps its premise, and T1 and T2 land without changing the live app. Cost: a
   future entry point that skips `bootstrap` ships with the feature off, which a boot test pins.
3. **The center holds its last fresh board while due.** One change per edit. Cost: the board lands about
   450–560 ms after the last edit (it was 150 ms), and continuous typing keeps the old board up behind
   "Updating…".
4. **The banner also needs the live model STALE.** No flash after an automatic run on a stale board.
   Cost: one 017 assertion is restated (`recompute.test.tsx:584`), and after a manual Auto-assign the
   banner goes 150 ms before the board redraws.
5. **`stale:run` is filtered in `selectFindings` while due**, not in each panel. `stale:run` is UNPLACED
   and never dismissable, so the Blocking gate and `dismissFinding` are unaffected. Cost: none found.
6. **Superseded by R8 (owner, 2026-10-08): hold them.** The original decision follows for the record.
   **The footer, the rail badge and the Unplaced rows follow the live store during the window.**
   FR-008 says metrics follow the store. Cost: a visible flicker on any board with unplaced events. On
   B4 and B6, each edit makes the Unplaced rows vanish and the badge drop for about 300 ms, while the
   center still shows those events in the No room lane, then both come back when the run lands. T2
   test 12 pins it. The alternative, holding the `unplaced:*` rows and the footer's count from the last
   fresh findings while due in the same filter that drops `stale:run`, is cheap, so this goes to the
   owner explicitly at handoff. Backlog.
7. **The late-fire path waits a frame.** Reveal, then `requestAnimationFrame` and `setTimeout(0)`,
   re-check, run. It is the only way a delayed timer can paint the indicator before a synchronous run.
   Cost: a little complexity, the paint is best-effort with no automated proof (T2 test 3 proves
   ordering only), and a single run that is itself longer than 500 ms still cannot show it. The owner
   can have it dropped.
8. **The Header switches to `selectHasBlocking`.** The button and the trigger cannot disagree. Cost:
   none while the parity test holds.
9. **Blocking is part of the rule, and re-checked when the timer fires.** A Blocking edit never runs,
   and restoring the old value makes nothing due. Cost: none found.
10. **Turning the switch on re-runs edits made while it was off, but not a stale load.** Cost: an
    organizer who flips it on to look gets a reshuffle, with no undo.
11. **`autoRerun` is a required `ViewState` field.** Cost: stored panel, zoom and view preferences reset
    once in every browser. The product is unreleased, so no back-compat applies.
12. **A Radix `Switch` in a new first "Board" section of Settings.** It is a setting with an on/off state,
    so `role="switch"` fits better than the `aria-pressed` button the DetailStrip uses for Flight. Cost:
    a second toggle idiom in the app.
13. **Auto-assign stays enabled while due**, and a click runs at once and cancels the pending run. Cost:
    none, the engine is deterministic.
14. **R4's test is restated as two cases**: the run in between drops the pin (020), and with no run in
    between the pin returns (019's body, now the switch-off path). Cost: none.
15. **Not cleared by an automatic run:** `loadRefusal` and ExportPopover's "opens stale" notice. They
    describe the load. Cost: a notice can outlive the stale board it describes. Backlog.
16. **The smoke R1 step depends on click timing** (8 clicks about 100 ms apart against the 300 ms
    debounce and the 500 ms mark, watched by an observer installed before the first click, with the
    gaps logged). Cost: a loaded machine could still flake it, and the logged gaps show whether the
    premise held. The step reports rather than loosens.
17. **Engine untouched, and no METHODOLOGY amendment.** Expected drift: none.
