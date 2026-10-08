# 020 Re-run on parameter change – handoff

**Status: delivered 2026-10-08** on branch `020-rerun-on-parameter-change` (worktree
`.claude/worktrees/020-rerun-on-parameter-change`, cut from `main` `7a7e503f4d`),
awaiting Task M's merge check and then the user's `merge-with-costs`. Plan:
[`plan.md`](./plan.md). There is no separate spec: the plan carries the owner's rulings
R1–R8. The engine is untouched and METHODOLOGY.md is not amended (it mentions neither
re-runs nor Auto-assign). Four questions go to the owner, marked **Owner question**
under Decisions.

## Session notes

Planning ran in session `c6dd25f7-1a9b-4260-a427-3b24f2cc9d17`. Implementation ran in
session `2e8301f9-ddd7-4038-ba66-b184a22c0273`, driven from the main checkout into the
worktree with absolute paths, so both transcripts sit under the main checkout's project
directory (`~/.claude/projects/-Users-noahlz-projects-piste-planner/`). The background
task outputs of both sit under `a91cc939-e943-4ff6-a585-c52637ca30a0`, which is also
019's session id, and a folder of that name exists under both the main checkout's and
019's worktree's project directories. merge-with-costs should count all three ids, and
check that the `a91cc939` share it counts is 020's and not 019's again.

Implementation ran as ultracode workflows: one per dispatch (implement, review wave, one
bundled fix round, smoke), plus a fold workflow for R8, a T3 smoke workflow, and a
docs and final-smoke workflow.

## What changed

In product terms: the board now re-runs itself. An edit to anything the engine reads –
a fencer count, strips, video strips, pool times, day count or hours, a flight toggle,
an added or removed event – re-runs Auto-assign 300 ms after the last change. The board
holds its last fresh layout until the new run lands, so each edit changes the board
once. If the wait passes 500 ms (continuous typing, or a slow machine), an "Updating…"
status shows in the stale banner's slot. While a re-run is due, the Findings panel's
per-event Unplaced rows, the rail badge and the whole footer keep describing the board
on screen rather than the half-edited one (R8), while every other finding still follows
typing. A board with a Blocking finding never re-runs, so a typo such as 0 strips does
not wipe it. A Settings switch, "Re-run automatically", on by default and remembered
per browser, turns the feature off, and the board then goes stale after an edit as it
did before. A file or link whose run could not be replayed still opens stale, and the
next edit re-runs it (R3). "Last run HH:MM" and the placed count update on every
automatic run (R6). Hand moves and pin toggles never trigger a run. Auto-assign stays
and runs at once, cancelling a pending re-run.

Headline, before to after (Base is `7a7e503f4d`, After is `04fc1dcba4`, the last code
commit before the smoke and docs):

| What | Before | After |
|---|---|---|
| Ledger B1–B8 scheduled | 24 / 24 / 24 / 24 / 12 / 51 / 18 / 53 | unchanged |
| ERRORs | 0 / 0 / 0 / 6 / 0 / 3 / 0 / 0 | unchanged |
| Ledger snapshot SHA-256 | `32a4e0afb45a…` | byte-identical at every commit |
| Boot footer B1–B8, placed / unplaced | 24/0, 24/0, 24/0, 24/6, 12/0, 51/3, 18/0, 53/0 | unchanged |
| An edit to an engine input | board goes stale until Auto-assign is pressed | **re-runs 300 ms after the last edit**, the board lands about 450–560 ms after it |
| "Updating…" | none | shows once a re-run has been due 500 ms |
| Unplaced rows, rail badge, footer while due | – (no due state) | **held** at the last calm board (decisions 18, 19) |
| Settings | no Board section | **"Re-run automatically"** switch, on by default, per browser |
| Stale banner after a manual Auto-assign | goes when the board redraws | goes with the run, 150 ms before the redraw (decision 4) |
| A pin on a day the organizer lowers away, then raises back | comes back (019 decision 10) | **dropped** when a run happens in between (R4) |
| Suggest on NAC Vet/Div1/Junior (SC-008) | 103 strips | unchanged |
| Unit suite | 93 files / 3133 tests | 96 files / 3252 tests |

What each task does now:

- **Plan (`8998432a6c`) and the R8 fold (`c47a6882a0`).** The Understand workflow (six
  readers on lifecycle, inputs, timing, tests and pins, and a critic) and three
  competing designs fed the plan. The base is a store selector for the rule with a hook
  in `CenterView` for the timers, with grafts from the other two. R8 came after the plan
  commit and was folded first: a not-serialized store snapshot `held` of the last calm
  board (neither due nor Blocking), written by one wrapper around the slices' `set`,
  read by `selectFindings` (the `unplaced:*` rows), `selectPlacementCounts` and
  `selectFooterMetrics` while due. A hold in each panel was rejected, because
  `FindingsPanel`, `ToolRail` and `StatusFooter` read in separate subtrees and could
  disagree. The fold added dispatch T1c.
- **T1a – the re-run fields and their writers (`dded7ac3ff`).** `ViewState` gains
  `autoRerun` (default true, validated). The UI slice gains `autoRerun` (starts false)
  with `setAutoRerun`, and `lastAttemptedKey`, neither serialized. `runScheduleAll`
  writes `lastAttemptedKey` from the config it has just built, before the engine call,
  and `applyLoadedState` seeds it with the loaded key in its one `setState`, so every
  run and every load leaves nothing due. Inert.
- **T1b – the re-run rule in the store (`cc38cccb99`).** `selectConfigKey` (memoised on
  the eight proxy-checked fields), `selectHasBlocking`, `selectRerunDue` (switch on, key
  differs from both the kept run's and the last attempt's, no Blocking row) and
  `selectDueKey`. `selectFindings` drops `stale:run` while due. The Header's Auto-assign
  gate reads `selectHasBlocking`. The edit lists move to
  `__tests__/helpers/inputEdits.ts` as data. Still inert.
- **T1c – the hold (`01396931bd`, fixes `e7c695014d`, `052a97f411`).** R8 as above, in
  `store.ts` (the writer) and `derived.ts` (`heldAfterWrite` and the read side).
  `runScheduleAll`'s direct `lastAttemptedKey` write also clears `held` (decision 20).
- **T2 – the board re-runs itself, behind the flag (`2b29b98a50`, fixes `e0c0d839c7`,
  `ba4e01c8a0`).** New `src/components/workbench/useAutoRerun.ts` (`RERUN_DEBOUNCE_MS`
  300, `RERUN_INDICATOR_DELAY_MS` 500): a debounce keyed on `selectDueKey` that re-checks
  the rule against `getState()` when it fires, a reveal clock keyed on due alone, and the
  late-fire path (reveal, then a frame, then `setTimeout(0)`, re-check, run). Every timer
  is cleared on unmount. `CenterView` calls it once: the settle skips while due, a settle
  still pending when due rises commits at once (so the center draws what the store
  holds), the banner needs the live model stale and not due, "Updating…" shares the
  `role="status"` region, and `<main>` carries `data-rerun` and `data-settled`. The
  flag stays false in the live app.
- **T3 – on by default (`07d094569d`, fix `04fc1dcba4`, smoke `f49f06b332`).**
  `bootstrap` seeds `autoRerun` from the stored preference before anything else, which
  is where the feature turns on. Settings gains a first "Board" section with a Radix
  switch named "Re-run automatically" that writes the store flag and the stored view
  state. The Header's last-run span carries `data-last-run-at`. The feature commit and
  the smoke commit form one change for constitution VI.
- **Task S – the final live smoke.** Two consecutive passes on the final code, 0 console
  errors, boot footers unchanged (`<wt>/tmp/smoke-S-1.log`, `smoke-S-2.log`,
  `smoke-S-bootFooters.log`). No driver change, so no commit.
- **Task D – docs (`0a3b9371a2`, fact-check fixes `51bb84b4c7`).** `backlog.md` marks the
  re-run entry delivered with its stale lines corrected, writes §What 020 deliberately
  left unfixed with an entry per leftover, and extends the preset-pins entry for R4.
  `competition-planner-workbench.md` marks row 020 delivered with the new baseline.
  019's plan points decision 10 at 020 R4, and 013's ui-contract points "follow the
  store per keystroke" at R8. `StripsPanel.tsx`'s stale 200 ms comments now cite the
  measured 0.2–6.6 ms (comment only). METHODOLOGY.md checked and left unchanged.
- **Task H – this handoff.**

## Measurements

| What | Value | Where |
|---|---|---|
| Unit suite | 96 files / 3252 tests, all pass (from 93 / 3133), `tmp/**` excluded | `07d094569d`, `04fc1dcba4` |
| `tsc -b`, lint | clean, clean | every commit body |
| Drift ledger snapshot SHA-256 | `32a4e0afb45abfbf8239f7bdbc15dda9eb1487c959893442b6029a6d0998b260`, byte-identical at every commit | every task commit body |
| B1–B8 scheduled, ERRORs | 24 / 24 / 24 / 24 / 12 / 51 / 18 / 53 and 0 / 0 / 0 / 6 / 0 / 3 / 0 / 0, unchanged | every task commit body |
| Drift | none, `src/engine/` untouched | T1c and T3 drift judges |
| Boot footers | 24/0, 24/0, 24/0, 24/6, 12/0, 51/3, 18/0, 53/0, unchanged | `<wt>/tmp/smoke-S-bootFooters.log` |
| Floors | none moved | – |
| SC-008 (Suggest, NAC Vet/Div1/Junior) | 103 throughout | every smoke run |
| Rule cost, B8 preset pick (63 notifications) | adds 6.9 ms per pick (after the findings the Header and rail already compute) | `cc38cccb99` |
| Rule plus hold, the same pick | adds about 7.7 ms (whole pick 23.3 ms on, 15.6 ms off) | `01396931bd` |
| Rule alone, nothing computed first | 18.1 ms per pick, over the plan's 16 ms line | `cc38cccb99` |
| The hold's writer, gross | 19.2 ms per pick, over the 16 ms line. Most of it derives the result state the UI then reads from the memo | `01396931bd` |
| A fencer-count write while due, B8 | 0.86 ms with the switch on, 0.67 ms off | `01396931bd` |
| Config key builds per notification | 2 with the switch on, 1 off (the writer's, then the drawn schedule's own). Declined in the plan, backlog entry | `01396931bd` |
| Engine and live re-run cost | `runScheduleAll` 1.8–6.9 ms median, click to paint 53–106 ms | plan §Measurements the plan rests on |
| Live smoke | **pass**, two consecutive full passes with 0 console errors after T1c, T2, T3 and Task S | `<wt>/tmp/smoke-T1c-{1,2}.log`, `smoke-T2-{1,2}.log`, `smoke-T3-final-{1,2}.log`, `smoke-S-{1,2}.log` |

The 16 ms line is the plan's report-back line for "the added cost of `selectRerunDue`
across a B8 preset pick" (T1b) and the writer's per-write cost (T1c).
The rule alone and the writer's gross time pass it, but both count derivation the UI
reads anyway, so they were reported and not optimised (Owner question D).

Smoke command: `pnpm -C <wt> dev --port 5189 --strictPort`, then
`SMOKE_BASE=http://localhost:5189/piste-planner/ timeout 240 node <wt>/scripts/smoke.mjs`.
What the driver now checks, on top of 019's checks (`f49f06b332`):

1. **`settleBoard`** waits out a due or running re-run through `data-settled`, and is
   called at every engine-input edit site (13 sites). It is never called on a Blocking
   board, since `data-settled` stays "false" while a Blocking finding freezes the board
   (decision 22).
2. **The 017 T7 step, restated.** It turns the switch off to reach a stale board on
   purpose, checks that a fresh page opened while the switch is off reads it off (R5a)
   and that Space toggles it on and back off.
3. **R3.** An edit on a stale link receiver re-runs the board and clears the banner.
4. **R1.** A burst of 8 fencer-count clicks about 100 ms apart, watched by an observer
   installed before the first click, holds `data-rerun="due"` throughout. "Updating…"
   attaches inside `role="status"` and detaches when the run lands. Measured gaps
   200 / 144 / 142 / 142 / 138 / 146 / 153 / 153 ms. The burst picks the smallest
   qualifying fencer count (decision 24).
5. **R4.** A pin on day 4, then the days lowered to 3: the re-run unpins the event and
   places it on days 1–3. The step asserts 0 pinned and the event placed, not "24
   placed" (decision 23, Owner question C). The board reads 21 placed and 3 unplaced
   with or without the pin.
6. **016 check 2**, a possible throw the plan asked to report: no throw. The pair landed
   JR-M-FOIL-IND on day 1 and CDT-M-FOIL-IND on day 2, with the regional-window Warning
   for the hand-moved pair.

Two live readings moved, neither from a serializer or engine change:

- B1's strip use after the 80 → 84 strips edit read 42.3 % at T2 and 46.9 % at T3,
  because `settleBoard` now reads the fresh re-run at 84 strips (49.3 × 80 / 84).
- The share URL grew from 3195 to 3208 characters. The link now carries `"run":[]`
  because the board is fresh when shared (9 bytes), and one strip count went from 9 to
  12 because the driver's edit sequence changed.

### Chain of measurements

Oldest first. Counts come from each commit's message body, with `tmp/**` excluded.
Where a body has no count, the row says so and nothing is guessed.

| Step | Commit | Files / tests | Notes |
|---|---|---|---|
| Base | `7a7e503f4d` (main) | 93 / 3133 | 019's merge, re-measured in the plan |
| Plan | `8998432a6c` | 93 / 3133 (the baseline it records) | docs only |
| R8 fold | `c47a6882a0` | 93 / 3133 (baseline unchanged) | docs only |
| T1a | `dded7ac3ff` | 94 / 3151 | snapshot unchanged |
| T1b | `cc38cccb99` | 94 / 3186 | snapshot unchanged, rule probe |
| T1c | `01396931bd` | 95 / 3208 | snapshot unchanged, hold probe |
| T1c fixes | `e7c695014d`, `052a97f411` | 95 / 3209, 95 / 3210 | test only |
| T2 | `2b29b98a50` | 96 / 3227 | snapshot unchanged, one deliberate correction (decision 4) |
| T2 fixes | `e0c0d839c7`, `ba4e01c8a0` | 96 / 3231, 96 / 3231 | test only |
| T3 | `07d094569d` | 96 / 3252 | snapshot unchanged |
| T3 fix | `04fc1dcba4` | 96 / 3252 | one case replaced by one |
| T3 smoke | `f49f06b332` | no count in body | driver only, two passes |
| Task D | `0a3b9371a2`, `51bb84b4c7` | no count in body | docs and one comment-only source edit, `tsc -b` and lint clean |
| Task H | – | no run | docs only |

### Test count chain

| Commit | Total | Δ | What |
|---|---|---|---|
| `7a7e503f4d` (main) | 3133 | – | baseline |
| `dded7ac3ff` T1a | 3151 | +18 | `rerunDue.test.ts` (new, 93 → 94 files) 12, `viewState` 4, serialization 1, `templateDays` 1 (the R4 case) |
| `cc38cccb99` T1b | 3186 | +35 | `rerunDue` cases: the edit sweeps, loads, throws, Blocking, `stale:run` and `selectHasBlocking` |
| `01396931bd` T1c | 3208 | +22 | `rerunHold.test.ts` (new, 94 → 95 files) 21, serialization 1 |
| `e7c695014d` T1c fix 1 | 3209 | +1 | the held `:day` row case |
| `052a97f411` T1c fix 2 | 3210 | +1 | the switch-off case on a Blocking board |
| `2b29b98a50` T2 | 3227 | +17 | `autoRerun.test.tsx` (new, 95 → 96 files) |
| `e0c0d839c7` T2 fix 1 | 3231 | +4 | the fire-time re-check and three late-path cases |
| `ba4e01c8a0` T2 fix 2 | 3231 | 0 | added assertions inside test 1 |
| `07d094569d` T3 | 3252 | +21 | boot 6, Settings 7, `autoRerun` 8 |
| `04fc1dcba4` T3 fix | 3252 | 0 | a vacuous reset case rewritten |
| smoke, Task D, Task H | 3252 | 0 | driver and docs only |

The deltas sum to 119 (3133 to 3252).

## Reviews

The plan got four review lenses (rulings and test-first, timing, UI and smoke, drift and
constitution), each finding checked by a verifier against source. One must-fix (T1
skipped `react-code-reviewer` for the Header switch) and the rest are folded, one claim
was refuted, and one was declined – plan §Measurements, "Plan review", has the list. The
R8 fold got two adversarial lenses (mechanism against source, plan consistency and
test-first). They found 6 must-fixes. The first repair round halted on the 4-step cap,
four capped rounds fixed them, two judges confirmed all six, and the three new minors
they raised were fixed.

Every dispatch got `test-quality-reviewer` and a spec review. The spec review ran as
judges of at most four checks each after the T1b spec reviewer halted on the cap with no
review. `react-code-reviewer` covered T1b's Header, T2 and T3. Drift judges ran after
T1c and T3.

- **T1a – 0 findings.**
- **T1b – 0 findings**, React review on the Header diff included.
- **T1c – 5 fixed, drift judges 4 of 4 pass.** Two important: held `:day` rows were never
  exercised, and the held rows' position in the list was unpinned. Both now have tests
  that a mutant fails (a `:room`-only hold, and the merge without its severity sort).
  Three minor: Finish was not separated from the other footer metrics (the edit now
  moves each metric on its own), the writer's switch-off clause had no Blocking-board
  case, and a test reached `held` by a second `useStore.setState` bypass (it now goes
  through the writer).
- **T2 – 5 findings, 4 fixed.** Two important: no test pinned the 300 ms and 500 ms
  literals, since every step was computed from the imported constants (tests now step
  to 299 and 499, and moving either constant fails them), and the debounce's fire-time
  re-check had no test (a new case fails when the line is deleted). Two minor fixed: the
  late threshold and the unmount were checked only far from their boundaries (three
  cases added), and test 1 skipped its quiet checks on the render where the run lands.
  One minor declined (decision 25).
- **T3 – 1 fixed, drift judges pass.** A boot case duplicated another and could not fail.
  It now boots on, saves the preference off and boots again, and a mutant of
  `boot.ts:35` fails it. The drift wave's one item passed. After the smoke, three more:
  the template counts and R3 passed, and the boot footers read unclear until Task S
  saved them to `<wt>/tmp/smoke-S-bootFooters.log`, which shows them unchanged.
- **Docs – one fact-check, five defects fixed (`51bb84b4c7`).** The roadmap row named the
  control wrongly, 019's index item did not say R4 supersedes it in part, the
  load-notice entry said "a load or a copy", the "as raised" entry omitted the preset
  case, and "Loads open stale" left out loads that carried no run.

## Decisions made on the owner's behalf

### Owner rulings

1. **2026-10-08, rulings R1–R7** (recorded in the plan). R1 "Updating…" in the stale
   banner's slot once the board has waited 500 ms for a re-run, measured from when it
   first became due. R2 a 300 ms debounce after the last engine-input change, with the
   fencer count still committing per keystroke (FR-008). R3 loads whose run could not be
   replayed, or carried none, open stale and are not re-run until the next edit. R4 a
   re-run after lowering the days drops pins on removed days, superseding 019 decision
   10 (its test restated as two cases). R5 a Settings toggle "Re-run automatically", on
   by default. R5a the toggle is per browser, like the panel layout and zoom, and not in
   files or links. R6 "Last run HH:MM" and the placed count update on every automatic
   run. R7 an inverted day window re-runs anyway, and its validation message goes to the
   backlog.
2. **2026-10-08, ruling R8**: hold what describes the board while a re-run is due – the
   per-event Unplaced rows, the rail badge and the footer's counts keep their last values
   until the new run lands, while other findings still follow typing. It supersedes
   plan decision 6 (accept the flicker). Folded first (`c47a6882a0`). Two of its
   readings are the work's, and go back to the owner as questions A and B below.

### Decisions the work made

Each with what it costs if wrong. Decisions 1–19 are the plan's, and the plan has
them in full. 20 onward were made during implementation.

1. **The rule is a store selector and the timers a hook in `CenterView`.** Cost: re-runs
   happen only while `CenterView` is mounted. It always is in the shell today.
2. **`autoRerun` starts false and only `bootstrap` turns it on.** Cost: a future entry
   point that skips `bootstrap` ships with the feature off, which a boot test pins.
3. **The center holds its last fresh board while due.** Cost: the board lands about
   450–560 ms after the last edit (it was 150 ms), and continuous typing keeps the old
   board up behind "Updating…".
4. **The banner also needs the live model stale.** Cost: one 017 assertion restated
   (`recompute.test.tsx:584`), and after a manual Auto-assign the banner goes 150 ms
   before the board redraws. Recorded in T2's body as a deliberate correction.
5. **`stale:run` is filtered in `selectFindings` while due.** Cost: none found.
6. **Superseded by R8.** It accepted the Unplaced-row and badge flicker.
7. **The late-fire path waits a frame** so a delayed timer can paint the indicator before
   a synchronous run. Cost: some complexity, and the paint is best-effort with no
   automated proof. The owner can have it dropped.
8. **The Header's gate reads `selectHasBlocking`.** Cost: none while the parity test
   holds.
9. **Blocking is part of the rule and re-checked when the timer fires.** Cost: none found.
10. **Turning the switch on re-runs edits made while it was off, but not a stale load.**
    Cost: an organizer who flips it on to look gets a reshuffle, with no undo.
11. **`autoRerun` is a required `ViewState` field.** Cost: stored panel, zoom and view
    preferences reset once in every browser. No back-compat applies.
12. **A Radix `Switch` in a new first "Board" section of Settings.** Cost: a second toggle
    idiom beside the DetailStrip's `aria-pressed` Flight button.
13. **Auto-assign stays enabled while due** and cancels the pending run. Cost: none.
14. **R4's test is restated as two cases** (a run in between drops the pin, no run
    brings it back). Cost: none.
15. **An automatic run clears neither `loadRefusal` nor the export "opens stale" notice.**
    Cost: a notice can outlive the stale board it describes. Backlog.
16. **The smoke's R1 step depends on click timing.** Cost: a loaded machine could flake
    it. The logged gaps show whether the premise held.
17. **Engine untouched, no METHODOLOGY amendment.** Cost: none, drift measured none.
18. **R8's hold is a store snapshot written through the store's one `set`**, not a hold
    in each panel. Cost: a direct `useStore.setState` bypasses it (so `applyLoadedState`
    and `runScheduleAll` clear `held` themselves), a Dismiss on a held row the live
    board no longer raises does nothing while due, the Unplaced dock follows the live
    store, and a Blocking edit within the settle window can leave the held values one
    settle ahead of the frozen board. Plan decision 18 lists every cost.

    **Owner question A – "the footer's counts" read as the whole footer.** The footer's
    metrics (Finish, Peak referees, Strip use) hold with its counts, because they also
    change on going stale alone and the footer would otherwise be half held and half
    live. Cost: during the window the metrics no longer follow typing, while the
    late-finish and drawn-board warning rows stay live under "other findings still
    follow typing", so the footer's Finish and a late-finish row can disagree until the
    run lands. The other reading holds only placed, unplaced and pinned.
19. **Owner question B – the rail badge counts what the Findings panel shows**: the held
    Unplaced rows plus the live other rows, rather than a held number. Cost: the badge
    can change during the window when a live row changes, and on a board that was
    already stale it drops by one, since decision 5 hides `stale:run` while due. Holding
    the badge as a whole number would let it disagree with the panel it opens.
20. **`runScheduleAll` writes `lastAttemptedKey` and clears `held` in one direct
    `setState` before the engine call** (T1a, T1c). A throw, or a run on a Blocking
    board that boot or a picker can reach, then never leaves a stale snapshot behind.
    Cost: one extra store notification per run (backlog entry).
21. **`CenterView`'s settle effect no longer arms a timer at mount** when the committed
    model already matches the live one (T2). That lets `data-settled` mean "no settle
    pending". Cost: none found, the old timer was a no-op.
22. **`data-settled` stays "false" while a Blocking finding freezes the board** (T2).
    The smoke's `settleBoard` is therefore never called on a Blocking board. Cost: a
    future smoke step that waits to settle on a Blocking board would time out.
23. **Owner question C – the smoke's R4 step asserts 0 pinned and the event placed on
    days 1–3, not the plan's "24 placed"** (`f49f06b332`). The driver's 3-day board
    places 21 with or without the pin, by a control run, so the shortfall is the
    driver's accumulated strip state, not R4. Cost: the step no longer checks the whole
    board's count, which is logged as a measurement instead.
24. **The smoke's R1 burst picks the smallest qualifying fencer count.** Eight increases
    on Div 1A Women's Foil tipped a pool-strip precondition into Blocking, which
    correctly stops the re-run and so broke the step's premise. Cost: the burst depends
    on the driver's board leaving headroom for eight increases.
25. **The restated `recompute.test.tsx` case keeps two added `data-settled`
    assertions.** The T2 spec reviewer flagged them as beyond the plan's restatement,
    and the fixer declined removal because they back the title the plan gave the case
    ("the board follows after the settle"). Cost: one 017 case asserts a little more
    than the plan restated.
26. **`@testing-library/user-event` is not installed, so the switch's Space key is
    checked in the live smoke only.** The unit test pins a focusable, enabled button
    that keeps focus through a toggle. Cost: a regression in Space handling shows only
    in the smoke.
27. **Owner question D – the plan's 16 ms probe line is read as the added cost, not the
    gross.** The rule adds 6.9 ms and the rule with the hold about 7.7 ms per B8 preset
    pick, under the line. The rule alone (18.1 ms) and the writer's gross time
    (19.2 ms) are over it, but both count derivation the UI reads anyway. Reported,
    not optimised. Cost if the gross reading was meant: a preset pick on the largest
    board can take more than a frame, and the hold's writer would need trimming.
28. **T2 test 12 moved to B1 after the headline move** during the fold, since B4's and
    B6's unplaced events have no placement and never flickered. Cost: none, the B1
    premise (one `:room` row, 23 / 1 / 1) is asserted first.

Deliberate corrections recorded in commit bodies: `recompute.test.tsx:584` flips from
not-null to null with the case retitled (T2, decision 4). `boot.test.tsx:238-266` saves
the preference off before `bootstrap`, assertions unchanged (T3). The 019 R4 test keeps
its old body as the switch-off guard beside the new run-between case (T1a, decision 14).
T3's review fix replaced its suggested order, since the flag starts false and that order
still passed a seed that only turns the flag on. The smoke's R4 step (decision 23).

## Left unfixed

Every leftover has a backlog entry, indexed under
[backlog §What 020 deliberately left unfixed](../../docs/design/backlog.md#what-020-deliberately-left-unfixed):
fifteen entries, two of them owner calls (whether an inverted day window is Blocking,
and the reshuffle with no undo). The handoff does not restate them.

### For later features

021 and the features after it measure against the numbers in Measurements, which equal
019's apart from the test counts. The board now re-runs itself, so:

- Anything the engine reads must still be in `configKey`. A new store field that
  `buildTournamentConfig` reads also joins `selectConfigKey`'s memo deps and the proxy
  list (`__tests__/helpers/inputEdits.ts`, checked in `drawnSchedule.test.ts`), or an
  edit to it will not re-run.
- Every test file that calls `bootstrap`, clicks the switch or saves the stored view
  state clears `VIEW_STATE_STORAGE_KEY` in `beforeEach`. Store and bare-component tests
  start with the switch off.
- Store writes go through actions, so the hold's writer sees them. A direct
  `useStore.setState` bypasses the hold and must clear `held` itself.
- A smoke step that edits an engine input calls `settleBoard`. The driver reads
  `data-rerun`, `data-settled` and `data-last-run-at`.
- 018's and 019's rules still hold: a change to per-event derivation also changes
  `__tests__/helpers/scenarios.ts` and `__tests__/store/factoryParity.test.ts`, and a
  change to `MAX_FENCERS`, `MIN_FENCERS` or `DAY_HARD_END_MINS` changes the factory's
  copy in the same commit.

## Merge

Pending Task M.

## Resume prompt (after the merge)

```text
Piste Planner. Feature 020 (re-run on parameter change) is delivered and merged
into main, and its record is specs/020-rerun-on-parameter-change/handoff.md.

Next is roadmap feature 021, METHODOLOGY reconciliation:
docs/design/competition-planner-workbench.md §Roadmap row 021. Read
docs/design/methodology-reconciliation.md first, then docs/design/backlog.md
§"METHODOLOGY.md and the engine have diverged, and the doc is the spec"
(including §"Left for 021 by 019's amendment"), §"Dead code held back from the
2026-09-01 sweep" and §"Calibration debt". Scope: retire the eight time-of-day
weights (owner decision 2026-10-04), make the last cheap weight fix
(WEAPON_BALANCE), fix the doc's
self-contradictions, apply the reconciliation verdicts except L6 and L14 (024
settled them), delete daySequencing.ts and the dead constants, add the
calibration scenario, and fix the four source comments that still name
relaxation levels (019 handoff, Left unfixed item 11). METHODOLOGY.md is the
spec: where it and the engine disagree, the engine is wrong by default, and any
METHODOLOGY.md text change goes to the owner for approval before it is
committed, as 019's amendment did. Most fixes edit src/engine/, so the drift
ledger review applies. Measure against the ledger 020 left: B1-B8 scheduled 24
/ 24 / 24 / 24 / 12 / 51 / 18 / 53, ERRORs 0 / 0 / 0 / 6 / 0 / 3 / 0 / 0,
snapshot SHA-256
32a4e0afb45abfbf8239f7bdbc15dda9eb1487c959893442b6029a6d0998b260, 96 files /
3252 tests, boot footers 24/0, 24/0, 24/0, 24/6, 12/0, 51/3, 18/0, 53/0. The
board now re-runs itself after every engine-input edit: smoke steps that edit
an input call settleBoard, and tests that call bootstrap clear
VIEW_STATE_STORAGE_KEY per test (020 handoff, For later features).

Start from the main checkout. Cut a fresh worktree off main, named for its
branch (021-...), and drive it from the main checkout with absolute paths
(git -C <wt>, pnpm -C <wt>). Never cd. Plan 021 yourself: choose the planning
approach and keep the constitution's guardrails (drift ledger, test-first, live
smoke, git ownership). The user merges with merge-with-costs and makes the
closing commit with commit-with-costs. Agents commit only inside the worktree,
and never push, merge or make the closing commit.
```
