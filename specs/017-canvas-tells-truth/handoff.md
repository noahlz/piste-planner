# 017 The canvas tells the truth – handoff

**Status: delivered 2026-10-07** on branch `017-canvas-tells-truth` (worktree
`.claude/worktrees/017-canvas-tells-truth`, cut from `main` `114d99314b`, which
had not moved), awaiting Task M's merge check and then the user's
`merge-with-costs`. Spec: [`spec.md`](./spec.md). Plan: [`plan.md`](./plan.md).
Roadmap row 025 was folded in (owner ruling R1).

## What changed

In product terms: after Auto-assign the canvas now shows the schedule the engine
built, each phase at the scheduler's own time on the scheduler's own strips. B1
boots at 24 placed and 0 unplaced, where the app used to say 15 and 9, and the
footer, the day bands, the Findings panel and Suggest agree about what is
unplaced. Moving an event by hand lays it on the strips the other events leave
free and never disturbs one of them. If no room is left it is the one Unplaced
row, drawn in a "No room" lane at the foot of its day. Changing anything the
engine reads (fencer counts, settings, strips, days) marks the board stale with
a banner and one Findings row until the next run. A share link or saved file
carries the pins the sender's last run used and replays that run, so the
receiver sees the sender's board. Every block is a keyboard button, and every
warning draws its edge, overflow blocks included. The referee peak is the
scheduler's own timeline again, which returns the ledger snapshot to its
pre-016 bytes.

Headline, before to after (Base is `114d99314b`, After is `d1f3e3c831`, the last
code commit):

| What | Before | After |
|---|---|---|
| Boot footer B1–B8, placed / unplaced | 15/9, 13/11, 14/10, 11/19, 8/4, 17/37, 11/7, 30/23 | 24/0, 24/0, 24/0, 21/9, 12/0, 45/9, 18/0, 53/0 (equal to the engine's) |
| Ledger B1–B8 scheduled | 24 / 24 / 24 / 21 / 12 / 45 / 18 / 53 | unchanged |
| ERRORs | 0 / 0 / 0 / 9 / 0 / 9 / 0 / 0 | unchanged |
| Footer peak referees, B1–B8 boot | 218 / 244 / 226 / 104 / 118 / 112 / 228 / 236 | 210 / 240 / 226 / 88 / 118 / 78 / 228 / 212 |
| Peak referees, scheduler's own report, 13 days | 218 / 140 / 244 / 140 / 90 / 104 / 98 / 90 / 112 / 164 / 168 / 236 / 172 | 210 / 134 / 228 / 136 / 80 / 80 / 78 / 68 / 64 / 156 / 156 / 212 / 136 |
| Late-finish rows at boot, B1–B8 | 1 / 2 / 2 / 3 / 0 / 2 / 3 / 1 | 1 / 3 / 4 / 3 / 0 / 3 / 3 / 2 |
| Ledger snapshot SHA-256 | `cd484a89c7c9…` | `7e2db75c38bb…`, byte-identical to `b84be7e291`'s (pre-016) |

The 13 days, in the order of the peak row, are B1 days 1 and 2, B2 days 0 and 3,
B4 days 1 and 2, B6 days 0 to 2, B7 days 0 and 2, and B8 days 0 and 2. A
fourteenth scenario-day, B8 day 1, moved only in its sabre peak (64 to 56). The
spec's Expected drift table named all 14 and every total and sabre peak matched
it. The late-finish rows move because they now read the scheduler's DE ends and
not the lane packer at derived times (`2961280f20`). The first and last day WARN
rows, which differed from the scheduler's on seven of eight scenarios at boot,
are now equal on B1–B8 and on all 10 templates.

What each task does now:

- **Spec, plan and amendment (`0ed8e8fb73`, `06b72864e3`, `98b31d96c8`,
  `e68bcac0de`).** Design A (keep the engine's output) was chosen by a
  three-judge panel over a replay allocator and a no-wait engine. The owner's
  rulings R1–R8 and approvals P1–P7 are recorded below. METHODOLOGY §Ref Demand
  Derivation and §Phase 5 were amended first, with the owner's wording verbatim:
  the scheduler reports the peak of its own timeline, the footer counts the
  board it draws, and right after a run they are one number. `e68bcac0de` fixes
  the plan's lint command to skip the git-ignored `tmp/` planning probes.
- **T1 – one unseated-phase rule (`25799f01cb`, review fix `f8bd39078a`).**
  New `src/engine/unseated.ts` names the phases that need strips and hold none
  (`unseatedPhases`), and Suggest's subtraction and the scheduler's video
  condition read it. `src/engine/order.ts` gives a code-point id order with no
  locale (P7) to the scheduler's two id tie-breaks and to `buildPinnedPlacements`.
  Right after a pin-all or pin-half re-run on B1–B8 the unseated set equals the
  engine's `PINNED_UNCLAIMED` set less zero-length phases, and it is empty after
  every unpinned run. Shared flighted fixtures for T1–T4 came with it.
- **T2 – the store keeps the last run (`281bd7efe7`, `337abcdb57`).**
  `runScheduleAll` keeps the whole `scheduleAll` result in memory as `lastRun`:
  its `configKey`, the pins it was given, and per event its placement key, its
  result on the clock axis and its kept phases with the strips the scheduler
  claimed. Nothing is serialized by this task, placements are unchanged, and a
  run that throws clears it.
- **T3 – the strip assigner (`5c25e36ede`, `5478bb9339`).** `assignStrips`
  (`src/layout/strips.ts`) seats kept phases on the strips the run claimed, then
  offers each derived phase to the engine's own free-strip search, in one fixed
  order (P5). A miss is unseated and claims nothing. A kept strip outside the
  strip count throws. Moving any event to any other day on B1–B8 moved no kept
  strip and overlapped nothing.
- **T4 – one drawn model (`e5f893d7de`, `316d041578`).** `selectDrawnSchedule`
  in `src/store/derived.ts` is the one answer to what the board shows. A board is
  stale when it holds an in-range placement and `lastRun` is missing or its
  `configKey` differs from the current inputs'. On a fresh board an event whose
  placement still equals its kept key draws the kept result, and every other
  placed event is derived. A block counts as unplaced only when unseated on a
  fresh board.
- **T5a – footer and Findings count the drawn model (`de463e574c`, `b945fb2299`,
  `eb4ad1348a`, smoke `33e7c40011`).** The footer counts and the Unplaced rows
  read the model, so B1–B8 boot at the engine's counts. One Unplaced row per
  unplaced event: the re-run wording for a hand-moved event and P3's pin wording
  for a kept one. While stale there is no per-event unseated row and one
  non-dismissable "Stale – re-run Auto-assign" row.
- **T5b – finish times and rules (`2961280f20`, `7837e32f7c`).** The footer's
  finish and strip utilization, the late-finish rows, the same-day rule check and
  the first and last day WARN read the drawn model. B5's finish rose from 910 to
  920 because CDT-W-EPEE-IND's DE now waits 750 on day 1, as the scheduler has it.
- **T6a – table, detail strip, day bands (`01c546d76e`, `32ad05f265`).** These
  read the committed drawn model, so no band claims more strips than the day has
  and the detail strip names the strips the blocks hold ("Strips 1–4, 9–10").
  `computeDaySummaries` no longer imports the lane packer.
- **T6b – the canvas draws the scheduler's strips (`daa7735c44`, `dd93a632f5`,
  smoke `f76d4f0d2f`).** One rect per strip run, with the first run carrying the
  DOM contract and continuations `aria-hidden`. Unseated phases draw in a per-day
  overflow lane. `src/layout/lanes.ts` and its test are gone, and `runsOf` moved
  to `src/layout/runs.ts`. A warned unseated block now draws the findings edge,
  which removes the 016 handoff's "overflow never draws the edge" item.
- **T7 – buttons and the stale banner (`f28b5935eb`, `6bacf397a2`, smoke
  `432db190c9`).** A phase's first run is a `<button type="button">` with its
  accessible name and an outline focus ring. The stale banner is a
  `role="status"` region above the center view and keeps its state under a
  Blocking finding.
- **T8 – link and file replay (`a25c166fcb`, `8f21e998f7`, smoke `a2ee1e987d`).**
  The serialized state carries `run` (the pins the last run used) when the kept
  run matches the current inputs and something is placed. Loading validates the
  whole run, refuses it as a unit with a reason, and otherwise replays
  `scheduleAll` so `lastRun` is rebuilt without writing a placement. P6: files
  replay too.
- **T9 – the referee peak (`a97a7d69dd`, `d1f3e3c831`, smoke `5b50f79d40`).**
  The scheduler counts its own timeline minus the unseated phases. The store's
  count reads the drawn model, skipping only blocks the model counts as unplaced,
  so a stale board counts every derived phase (P4 c). The drawn-interval path
  `drawnRefDemand` is deleted. This is the only task that moved the ledger.
- **Task S – live smoke (`11102cdc4d`).** The headline move, below.
- **Task D – docs (`65f0730738`, `b98229ac20`).** `backlog.md` marks the four
  entries 017 closed as "Fixed by 017" and keeps them (decision 10), adds the
  entries for what it left, and writes the §What 017 deliberately left unfixed
  index. `competition-planner-workbench.md` marks row 017 delivered, row 025
  folded in, the D2 row narrowed as approved, and the new baseline.
- **Task H – this handoff and two backlog edits.** The half-open sweep figures
  (below) and the preset-picker entry.

## Measurements

| What | Value | Where |
|---|---|---|
| Unit suite | 87 files / 2795 tests, all pass (from 82 / 2278), `tmp/**` excluded | `d1f3e3c831`, the last code commit |
| `tsc -b`, lint | clean, clean | every task head (the orchestrator re-verified after T2, T4, T5b for `tsc`, and T7 in full) |
| Drift ledger snapshot SHA-256 | `cd484a89c7c95f9dc1afebbccf705177487683bde7c1fdd99a674b0afeaff481` to `7e2db75c38bb6e5702d3618e81127130739e9075536b843ca76a8cc368b89d06` | T9 `a97a7d69dd`, unchanged through T8 |
| Snapshot change in T9 | 30 changed lines, all `peak_*` fields inside `refRequirementsByDay`, on the spec's 14 scenario-days and none on a held day | `a97a7d69dd` (ledger check script exit 0, git-ignored) |
| Snapshot against pre-016 | 0 changed lines against `b84be7e291`'s | `a97a7d69dd` |
| B1–B8 scheduled, ERRORs | 24 / 24 / 24 / 21 / 12 / 45 / 18 / 53 and 0 / 0 / 0 / 9 / 0 / 9 / 0 / 0, both unchanged | every commit |
| Boot footer against the engine | equal on B1–B8, pinned by `appPathParity` | `de463e574c` |
| Boot invariants | 0 unseated, 0 overlaps and 0 video-required phases off video on B1–B8 and the 10 templates, phase times and strips equal to `strip_allocations` | `2961280f20` |
| Live smoke | **pass**, two consecutive full passes after T5a, T5b, T6a, T6b, T7, T8, T9 and Task S, 0 console errors (the pass counts are in the smoke commits' bodies for T6b, T7, T8 and T9, and the rest are orchestrator observations) | the smoke commits above |

Smoke command: `SMOKE_BASE=http://localhost:5188/piste-planner/ timeout 240
node scripts/smoke.mjs`, after `pnpm -C <wt> dev --port 5188 --strictPort`.
What the driver now checks, on top of 016's three checks:

1. **B1 boot.** The footer reads `24 placed · 0 unplaced`, no block is unseated,
   and the footer's peak referees read 210 (016's 218 is retired).
2. **Keyboard.** Every `[data-event-block]` is a button reached by Tab, shows a
   computed focus-visible outline, and opens the detail panel on Enter and on
   Space. These two keys are proven only here, because the repo has no
   `user-event` and jsdom does not turn Enter into a click.
3. **Stale banner.** A fresh board has no banner. A fencer count edit shows the
   banner and the stale Findings row.
4. **Link replay.** A `#config=` link from a freshly run sender, opened in a
   second page, draws the same block set (id, phase, strips, start) with no
   banner, before and after one Move day.
5. **Headline move.** Moving D1-M-EPEE-IND to the next day gives one Unplaced row
   with the "No room here…" wording, a footer of `23 placed · 1 unplaced`, the
   unseated phase in the "No room" lane as a focusable button, and a re-run of
   Auto-assign that clears all three. The driver reloads the page for a fresh B1
   first (decision 11).
6. **Locators.** `exact: true` on the unscoped panel and action-button locators,
   and 016's check 1 tied to the hard-pair row's `data-finding-id`.

### Chain of measurements

Oldest first. Counts are taken from each commit's message body, with `tmp/**`
excluded. Where a body has no count, the row says so and nothing is guessed.
The snapshot is `cd484a89c7c9…` through `6bacf397a2` and later, until T9.

| Step | Commit | Files / tests | Notes |
|---|---|---|---|
| Base | `114d99314b` (main) | 82 / 2278 | spec baseline |
| Spec and plan | `0ed8e8fb73` | no count in body | docs only |
| Owner answers | `06b72864e3` | no count in body | docs only |
| METHODOLOGY amendment | `98b31d96c8` | no count in body | docs only |
| T1 | `25799f01cb` | 84 / 2317 | snapshot unchanged |
| Plan lint fix | `e68bcac0de` | no count in body | plan only |
| T1 review fix | `f8bd39078a` | 84 / 2330 | |
| T2 | `281bd7efe7` | 85 / 2427 | |
| T2 review fix | `337abcdb57` | 85 / 2429 | |
| T3 | `5c25e36ede` | 86 / 2479 | |
| T3 review fix | `5478bb9339` | 86 / 2484 | |
| T4 | `e5f893d7de` | 87 / 2519 | |
| T4 review fix | `316d041578` | 87 / 2524 | |
| T5a | `de463e574c` | 87 / 2565 | |
| T5a review fix | `b945fb2299` | 87 / 2568 | |
| T5a review fix (2) | `eb4ad1348a` | 87 / 2568 | comment only |
| T5a smoke | `33e7c40011` | no count in body | driver only |
| T5b | `2961280f20` | 87 / 2630 | |
| T5b review fix | `7837e32f7c` | 87 / 2634 | |
| T6a | `01c546d76e` | 87 / 2657 | |
| T6a review fix | `32ad05f265` | 87 / 2663 | |
| T6b | `daa7735c44` | 87 / 2677 | `lanes.test.ts` out, `runs.test.ts` in |
| T6b review fix | `dd93a632f5` | 87 / 2681 | |
| T6b smoke | `f76d4f0d2f` | no count in body | driver only |
| T7 | `f28b5935eb` | 87 / 2694 | |
| T7 review fix | `6bacf397a2` | no count in body | the orchestrator re-verified 87 / 2701 at this head (an observation, in no commit) |
| T7 smoke | `432db190c9` | no count in body | driver only |
| T8 | `a25c166fcb` | 87 / 2743 | |
| T8 review fix | `8f21e998f7` | 87 / 2763 | |
| T8 smoke | `a2ee1e987d` | no count in body | driver only |
| T9 | `a97a7d69dd` | 87 / 2795 | snapshot `7e2db75c38bb…`, referee peaks move |
| T9 review fix | `d1f3e3c831` | 2795 tests, files not stated | tests and comments only |
| T9 smoke | `5b50f79d40` | no count in body | driver only |
| Task S | `11102cdc4d` | no count in body | driver only |
| Task D | `65f0730738`, `b98229ac20` | no count in body | docs only |
| Task H | – | 87 / 2795 | docs only |

### Test count chain

| Commit | Total | Δ | What |
|---|---|---|---|
| `114d99314b` (main) | 2278 | – | baseline |
| `25799f01cb` T1 | 2317 | +39 | `unseated.ts`, `order.ts`, call-site tie-break cases |
| `f8bd39078a` T1 review fix | 2330 | +13 | locale mutants, per-guard `unseatedPhases` cases |
| `281bd7efe7` T2 | 2427 | +97 | `keptRun.ts`, store run keeping, kept result against derived |
| `337abcdb57` T2 review fix | 2429 | +2 | skip branch made real, optional `lastRun` |
| `5c25e36ede` T3 | 2479 | +50 | `strips.test.ts` (new) |
| `5478bb9339` T3 review fix | 2484 | +5 | whole-event seating order |
| `e5f893d7de` T4 | 2519 | +35 | `drawnSchedule.test.ts` (new) |
| `316d041578` T4 review fix | 2524 | +5 | key match, flighted, memoization |
| `de463e574c` T5a | 2565 | +41 | counts, rows, stale row, Move-day sweep |
| `b945fb2299` T5a review fix | 2568 | +3 | stale with all seated, kept pin above the cap |
| `eb4ad1348a` T5a review fix (2) | 2568 | 0 | comment only |
| `2961280f20` T5b | 2630 | +62 | boot invariants, first and last day WARN, late-finish rows |
| `7837e32f7c` T5b review fix | 2634 | +4 | stale utilization, fresh derived finish |
| `01c546d76e` T6a | 2657 | +23 | bands, detail strip labels, `stripSetLabel` |
| `32ad05f265` T6a review fix | 2663 | +6 | stale label, "needs 8" case |
| `daa7735c44` T6b | 2677 | +14 | runs, overflow lane, one rect per run |
| `dd93a632f5` T6b review fix | 2681 | +4 | lane stacking, continuations |
| `f28b5935eb` T7 | 2694 | +13 | buttons, tab stops, banner |
| `6bacf397a2` T7 review fix | 2701 (orchestrator) | +7 | frozen board `inert`, focus and blur, scroll padding |
| `a25c166fcb` T8 | 2743 | +42 | run write, validation, replay |
| `8f21e998f7` T8 review fix | 2763 | +20 | table reset on load, day-range rows |
| `a97a7d69dd` T9 | 2795 | +32 | timeline peaks, skip per phase, spec table |
| `d1f3e3c831` T9 review fix | 2795 | 0 | hand-move case re-aimed, comments |
| smoke, Task D, Task H | 2795 | 0 | docs and driver only |

The +7 at T7's review fix and T8's +42 rest on the orchestrator's count at that
head, because the commit body has none. Read against T7's own 2694 the T8 delta
would be +49 and the sum is the same 517 either way (2278 to 2795, five new
files net).

## Reviews

Every task got `test-quality-reviewer` (mutation-probed) plus a spec review
and/or `react-code-reviewer`, one bundled fix round each (T5a two), re-checked
with 0 unresolved.

- **T1 (10 findings).** Call-site tests that fail under a Lithuanian collator for
  each tie-break, one input per guard in `unseatedPhases`, and `phaseSpans`
  skipping `end <= start` as the spec says. One finding rejected: no
  zero-length phase is ever flagged `PINNED_UNCLAIMED`, so the assertion could
  not hold.
- **T2 (9).** A sweep branch that never ran was replaced, and `lastRun` is
  optional on `setPlacementsFromAuto` (decision 8).
- **T3 (9).** The one spec major: seating was per phase, which let a
  later-starting hand-moved event unseat an earlier one's DE. Now whole events
  (decision 1).
- **T4 (8).** A kept event also needs the run's `configKey` to match
  (decision 2), plus flighted, memoization and negative-day cases.
- **T5a (14, two fix rounds).** A stale board where every phase is seated, a
  Move-day oracle that reads the mover's drawn strips, `STALE_FINDING_ID` made
  private, and the retired "needs N strips" wording out of `FindingsPanel.tsx`.
- **T5b (8).** Stale utilization, a fresh derived event in the footer finish, an
  unseated block's end counting toward the day's finish.
- **T6a (15).** The stale-board label, `stripSetLabel([])` throws, `ScheduleOutput`
  takes a drawn model only. Two owner questions came out of it (below).
- **T6b (12).** Exact lane stacking, continuation tests at Canvas level, one
  `renderRect` helper, `unseatedStripsLabel`.
- **T7 (13).** Frozen board `inert`, focus and blur open the tooltip, scroll
  padding clears the sticky gutters, the banner region always mounted. A
  `user-event` dependency was rejected.
- **T8 (19).** A real bug: loading a payload without `pool_round_duration_table`
  kept the previous board's table, and it now resets to the default
  (decision 7). Day-range rows now isolate the check under test.
- **T9.** Four drift judges, each on at most four scenario-days (the step cap),
  all accept. Judge 5 confirmed the held days and fields with a throwaway diff
  script (exit 0), then tests and spec review. Judge 2 raised the sweep boundary
  (Left unfixed). The fix commit re-aimed the hand-move case at
  VET-M-SABRE-IND-VCMB on day 2, where unseated phases really move a peak.

## Decisions made on the owner's behalf

### Owner rulings and approvals

1. **2026-10-07, rulings R1–R8.** R1 core model yes (keep the run in memory,
   never in `Placement` or the URL's placements, fold in 025, narrow D2). R2
   METHODOLOGY amendment yes (committed verbatim as `98b31d96c8`). R3 a pin
   fixes day and pool start, unchanged. R4 and R7 a moved event with no room is
   unplaced, no neighbour moves, and it draws in an overflow lane. R5 stale
   banner, no automatic re-run. R6 link replay yes. R8 video gutter and camera
   icon deferred.
2. **2026-10-07, approvals P1–P7**, all as proposed (`06b72864e3`). P1
   METHODOLOGY text. P2 D2 row. P3 kept-pin wording. P4 stale rules with banner
   and Findings row. P5 fixed seating order. P6 files replay. P7 code-point ids.

### Decisions the work made

Each with what it costs if wrong.

1. **P5 read as whole-event order** (T3 review fix `5478bb9339`). Events seat in
   (day, event start = earliest phase start, code-point id) order, because P5
   says events are re-seated. Cost: a later hand move with an earlier start may
   re-seat or unseat an earlier hand-moved event, which P5 already accepts. Kept
   events are never touched. Phase-by-phase seating would interleave two moved
   events and unseat the earlier one's DE.
2. **A kept event also requires the run's `configKey` to match** (T4 fix
   `316d041578`). This differs from spec §2 only when every placement is out of
   range. Cost: such a board draws no kept events, and it has no in-range event
   to draw. The spec's wording drew a run that read other inputs, or threw
   `KeptStripOutOfRangeError` after strips fell.
3. **The stale Findings row** (T5a). Id `stale:run`, where "Board", severity
   Unplaced, non-dismissable. There is no new row type for an event with no
   placement, since the dock lists those. Cost: the Unplaced badge and the rail
   count include a row the footer does not count (the footer reads 0 unplaced
   while stale). The severity is the owner's to change.
4. **"Unplaced, needs N strips" takes N from the blocks the model counts
   unplaced only** (T6a). On a stale board an event whose every phase is unseated
   shows no strip label, and the day band's unplaced count is computed and never
   displayed. Cost: a blank strips fact on a stale board, which bends 013 handoff
   item 12, and an unseen per-day count. Both are owner items (Left unfixed).
5. **One Block per strip run** (T6b). Continuations carry
   `data-block-run='<id>:<phase>'`. A stale unseated block reuses "Unplaced,
   needs N strips" in its accessible name and tooltip although it is not counted.
   `runsOf` moved to `src/layout/runs.ts`. Cost: on a stale board a block can
   read "Unplaced" while the footer counts none.
6. **T7 choices.** The banner is `role=status` on an always-mounted wrapper, the
   focus ring is `z-[5]` under the sticky gutters (`z-10`), and blocks are
   `inert` while a Blocking finding dims the board. Enter and Space are proven
   only in the live smoke, since no `user-event` dependency was added. Cost: a
   regression in the key handling shows only in a smoke run, not in the unit
   suite. The commit bodies do not record a live check of the scroll padding.
7. **T8 choices.** An empty board writes no run, and a pin-less run on a placed
   board writes `run: []`. Run entries' day and start time must be whole numbers.
   Cost: a hand-edited file with a fractional start loses its run and boots
   stale, with the refusal reason shown beside the export status line.
8. **`setPlacementsFromAuto`'s `lastRun` is optional** (T2), where the plan
   declared it required, so the many one-argument test callers compile. Cost: a
   future caller that forgets the run silently clears it and the board goes
   stale. The only `src` caller passes it.
9. **`ScheduleOutput.tsx:44` keeps `localeCompare`** (T1). It is a display sort.
   Cost: in a non-`en` browser the table's order can differ from the code-point
   order that seats and replays, which is display only.
10. **Closed backlog entries are kept and marked "Fixed by 017"** (Task D), not
    pruned. Cost: a longer file, and readers must read the marker.
11. **Task S's driver reloads the page for a fresh B1**, because picking a preset
    keeps pins (new backlog entry). Cost: no smoke check picks a preset after a
    hand move, so that path rests on the backlog entry.
12. **Plan correction `e68bcac0de`.** The lint command skips `tmp/**`. Cost:
    none, since the suite command already excludes it.

Deliberate corrections recorded in commit bodies: T3's flighted test asserts
FLIGHT_B starts at least the flight buffer past FLIGHT_A and equals derive's
start (derive waits the longer of the admin gap and the buffer). T5b's B5 finish
moved 910 to 920 as above. T6a's day-band peak on one fixture reads 3, not 6,
because an unseated DE holds no strips. T2's kept-against-derived sweep compares
pinned events only, since an event the first run left unscheduled places
unpinned in the second.

## Left unfixed

Backlog-worthy items are marked with an asterisk and point at their entries.

- **\*Pin every event in place, then re-run, loses events** (ruling R3). B1 goes
  24/0 to 19/5 and B8 53/0 to 25/28, because the pre-claim pass seats a pin on
  the no-wait chain. Pin-half still left 0/1/0/2/0/9/0/10 phases unseated on
  B1–B8. Cost if ignored: an organizer who pins everything to protect a board
  loses events on the next run. Backlog §Pinning an event in place and
  re-running can lose events.
- **\*The referee sweep counts an instantaneous handoff twice.** `sweepLine`
  processes a start before an end at the same minute, and it predates 017
  (`a889885424`). T9 drift judge 2 probed a half-open sweep, an orchestrator
  observation recorded in no commit: B6 day 0 reads 48 not 78, B6 day 1 48 not
  68, and B4 day 2's sabre peak 38 not 54. Only those three were probed. Cost if
  ignored: staffing advice errs generous, never short. An owner call, since it
  moves the ledger. Backlog §The referee sweep counts an instantaneous handoff
  twice, which now carries these figures.
- **\*The day band computes an unplaced count it never shows.** Backlog §The day
  band computes an unplaced count it never shows. An owner wording call.
- **\*A stale board's detail strip can show no strips for an event.** Backlog §A
  stale board's detail strip can show no strips for an event. An owner call.
- **\*The video gutter and camera icon** (R8). Backlog §The video gutter and
  camera icon are deferred.
- **\*Re-run on parameter change.** 017 marks the board stale and does not
  re-run. `configKey` is roadmap row 020's hook. Backlog §Changing a parameter
  should re-run the engine, with a working indicator.
- **\*Picking a preset keeps the pins on events the two boards share.**
  `applyPreset` in `src/store/presets.ts` does not clear placements, and
  `PresetPicker` then runs `runScheduleAll`. Re-picking B1 after a hand move runs
  with that pin and, with R3, gave 21 placed · 3 unplaced · 2 pinned in the smoke
  agent's first attempt. It predates 017 (013). Cost if ignored: preset
  comparisons after hand work show a board unlike the preset's own. Reloading is
  the workaround. Backlog §Picking a preset keeps the pins on events the two
  boards share, new in this task.
- **The stale row's badge reads UNPLACED** while the footer reads 0 unplaced
  (decision 3). Open for the owner, no code change.
- **"Pinned here, but no strips are free…" on an unpinned kept event.** Unpinning
  after a pin-all re-run leaves the event kept with P3's wording, as spec §5
  says (a pin toggle changes nothing). The wording is a follow-up for the owner.
- **No B1–B8 scenario or template is flighted**, so flighted behaviour rests on
  the T1 fixtures only. Cost if wrong: a flighted event could differ in a way the
  ledger cannot see.
- **`drawnScheduleFrom` is exported** so component tests go through the
  selector's own rule. If fallow's unused-export check reports it, that is why.
- **The git-ignored planning probes in `<wt>/tmp/` still exist.** They import the
  deleted `lanes.ts` and can be deleted.

### For later features

018 and the features after it measure against the numbers in Measurements. The
referee peak is the scheduler's own timeline again, so a change that moves how
the scheduler waits for strips moves the footer and `ref_requirements_by_day`
together, and the feature must list the peaks it moves. A change to per-event
derivation must also change the factory's copy (`__tests__/helpers/scenarios.ts`
and `__tests__/store/factoryParity.test.ts`). Anything the engine reads must be
in `configKey`, and `selectDrawnSchedule` goes stale on any change to one of the
eight `StoreState` fields `buildTournamentConfig` reads (a Proxy test pins that
list), so a new engine input needs a place in that list.

## Merge

Pending Task M.

## Resume prompt (after the merge)

```text
Piste Planner. Feature 017 (the canvas tells the truth) is delivered and merged
into main, and its record is specs/017-canvas-tells-truth/handoff.md.

Next is roadmap feature 018, engine correctness:
docs/design/competition-planner-workbench.md §Roadmap row 018, and
docs/design/backlog.md §"Day-end overrun is a hard failure the methodology calls
a warning", §"Policy tables are stale against USA Fencing 2025-26 changes" (the
Div 1 cut only) and §"A shared URL with a fencer count of 0 or 1 may reach
unguarded pool math". 018 makes the day-end overrun a warning, fixes the Div 1
cut at 25 %, and verifies the fencer-count of 0 or 1 URL path. One drift review
per fix. Its drift is measured against the ledger 017 left: B1-B8 scheduled
24 / 24 / 24 / 21 / 12 / 45 / 18 / 53, ERRORs 0 / 0 / 0 / 9 / 0 / 9 / 0 / 0,
snapshot SHA-256
7e2db75c38bb6e5702d3618e81127130739e9075536b843ca76a8cc368b89d06 (byte-identical
to the pre-016 snapshot), 87 files / 2795 tests, boot footers 24/0, 24/0, 24/0,
21/9, 12/0, 45/9, 18/0, 53/0. The referee peaks are the scheduler's own
timeline again. If a change touches per-event derivation, list
__tests__/helpers/scenarios.ts and __tests__/store/factoryParity.test.ts among
its editable files and change the factory's copy in the same commit.

Start from the main checkout. Cut a fresh worktree off main, named for the
branch (018-...). Plan 018 yourself: no Spec Kit, choose the planning approach,
and keep the constitution's guardrails (drift ledger, test-first, live smoke,
git ownership). The user merges with merge-with-costs and makes the closing
commit with commit-with-costs. Agents commit only inside the worktree, and
never push, merge or make the closing commit.
```
