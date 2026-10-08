# 018 Engine correctness – handoff

**Status: delivered 2026-10-08** on branch `018-engine-correctness` (worktree
`.claude/worktrees/018-engine-correctness`, cut from `main` `d4f545736c`),
awaiting Task M's merge check and then the user's `merge-with-costs`. Plan:
[`plan.md`](./plan.md). There is no separate spec: the plan carries the owner's
rulings R1–R7.

Planning and implementation ran in one session from the main checkout, driving
this worktree with absolute paths, so merge-with-costs takes that single session
id.

## What changed

In product terms: an event whose last phase (its DE, or a staged DE's
round-of-16 video stage) would end past the day's 22:00 hard end is now placed
with a Warning that gives its finish, as long as that phase starts before 22:00
and ends by midnight. It used to be dropped. B4 now places 24 events (it placed
21) and B6 51 (it placed 45). The Findings panel shows one dismissable Warning
row per event ending past 22:00, for run-placed and hand-moved events alike, and
the canvas grows past 22:00 to show the late finish. Suggest still answers the
strip count at which every event ends by 22:00. Div 1 promotes 75 % at a NAC (a
25 % cut), per the 2026-27 Athlete Handbook p.37, which shortens Div 1 DE timings
on B1, B2, B7 and B8 without changing what is scheduled. A fencer count must be a
whole number from 2 to 336 (the handbook's NAC cap, §2.2.5 p.15). A share link
or file with anything else is refused with a reason, and a refused link opens B1
with a notice saying why. A newly added event starts at its default count, never
0, and the engine skips an event it cannot size instead of crashing the page.

Headline, before to after (Base is `d4f545736c`, After is `05654fca6d`, the last
code commit):

| What | Before | After |
|---|---|---|
| Ledger B1–B8 scheduled | 24 / 24 / 24 / 21 / 12 / 45 / 18 / 53 | 24 / 24 / 24 / **24** / 12 / **51** / 18 / 53 |
| ERRORs | 0 / 0 / 0 / 9 / 0 / 9 / 0 / 0 | 0 / 0 / 0 / **6** / 0 / **3** / 0 / 0 |
| Boot footer B1–B8, placed / unplaced | 24/0, 24/0, 24/0, 21/9, 12/0, 45/9, 18/0, 53/0 | 24/0, 24/0, 24/0, **24/6**, 12/0, **51/3**, 18/0, 53/0 |
| Footer peak referees, B1–B8 boot | 210 / 240 / 226 / 88 / 118 / 78 / 228 / 212 | 210 / 240 / 226 / **96** / 118 / 78 / 228 / 212 |
| B4 referee peaks by day (scheduler) | 88 / 80 / 80 | 88 / 96 / 94 |
| `daySummaryPeaks` B4, B6 | 152/168/190, 112/106/118 | 152/228/230, 132/126/131 |
| Suggest (`stripRecommendation`) B1–B8 | 53 / 77 / 73 / 74 / 29 / 63 / 82 / 56 | 53 / **75** / 73 / 74 / 29 / 63 / 82 / 56 |
| Overrun Warning rows on a fresh board | none (the rule did not exist) | B4 3, B6 7, the other six 0 |
| NAC Vet/Div1/Junior template (B1 settings) | 58/8, Suggest 103 | 60/6, Suggest 103 |
| Fencer counts a link or file may carry | any number that is not negative | a whole number from 2 to 336 |
| Ledger snapshot SHA-256 | `7e2db75c38bb…` | `903cd991fbca…` |
| Unit suite | 87 files / 2795 tests | 89 files / 3031 tests |

The before peaks are 017's handoff figures, the after peaks T4 drift judge 1's
store-path probe (`t4-J1.md`). B2's Suggest move is T1's (CDT-M-EPEE-TEAM's DE,
waiting on D1-W-EPEE's prelim strips, now fits at B2's floor of 75). T2's R2 held every Suggest answer: without it B5 drops
29 to 28 (T2 judge 3's control).

What each task does now:

- **Plan and amendment (`ed4fbbf365`, `5272d66823`).** The Understand workflow
  (7 readers, a counterfactual in a throwaway worktree, a critic) traced all 18
  B4/B6 drops to the day end (14 TIME, 4 post-fit overrun) and measured the
  overrun rule ahead of time: B4 21 → 24, B6 45 → 51, ERRORs 9 → 6 and 9 → 3,
  nothing else scheduled moving. It also showed the count-0 link was real: it
  reached `computePoolStructure`, which throws, and a fresh page showed the
  error boundary. The plan review had an amendment drafter and checker (five
  must-fix items on the draft METHODOLOGY text, one of them the handbook page,
  p.15 and not p.14) and three lenses with five blockers, four of them distinct:
  a refused link showed no reason anywhere (raised by two lenses, answered by
  ruling R7), T1's red list was 15 tests in 7 files, not the three the plan named, R2 did not hold
  `stripSearch.test.ts:271`, and T2's planned Suggest test could not fail first
  as written. A0 commits the owner-approved METHODOLOGY text verbatim before any
  code: the overrun (R1), Suggest counting an overrun as not placed (R2), the
  Div 1 cut (R4) and the bounds 2 to 336 (R5).
- **T1 – Div 1 promotes 75 % at a NAC (`44576f6f43`).** `DEFAULT_CUT_BY_CATEGORY`
  Div 1 goes 20 → 25. Cadet and Junior stay 20 and regional types stay 100. B1
  D1-M-EPEE-IND now promotes 233 of 310 into the same 256 bracket (was 248), so
  its prelims need 7 waves and not 8 and its R16 starts 20 minutes sooner. B3–B6
  are byte-identical. B1, B2, B7 and B8 move only in timings, plus B2's Suggest
  77 → 75, a new B7 first-day WARN and B8 day 1's sabre peak 56 → 60 (both
  fragile, see Left unfixed). Nothing scheduled, no ERROR and no boot footer
  moved.
- **T2 – the last phase may run past the hard end (`31ce0c3017`).** In
  `tryAllocate`, an event's last phase fits when it ends by the hard end, or when
  it starts before the hard end and ends by `dayMidnight` (new in `types.ts`, the
  ceiling on the scheduler's axes) and by `latest_end`. Every other phase still
  ends by the hard end, and two failed attempts still drop an event. The new
  `lastPhaseOverrunWarnings` runs after the schedule, outside any attempt, and
  emits one WARN per overrunning event (`phase-overruns-day-end`,
  `SAME_DAY_VIOLATION`, `POST_SCHEDULE`). A pinned last phase within the limit is
  claimed and warned. The strip-count search counts overrun ∪ unseated events as
  not placed, once each (R2). Floors B4 21 → 24 and B6 45 → 51, dated.
- **T3 – the overrun on the board (`9533ec187c`, smoke `7bac9559a3`).**
  `placementFindings` runs `lastPhaseOverrunWarnings` on the drawn board, on the
  clock axis with event labels, so the Findings panel shows a dismissable Warning
  row per event ending past the hard end. On fresh boards the rows equal the
  scheduler's WARNs on B1–B8 and the 10 templates (`appPathParity`). A stale
  board's rows follow its drawn ends, as the first and last day rows do. The
  canvas axis grows to the next whole hour after the latest block end when it
  passes the hard end, capped at 30:00, so B4 and B6 boot with an axis ending at
  24:00. `formatClock` now wraps past midnight like the engine's
  `formatClockMins`, so ticks, rows, block labels, bands and the footer agree.
- **T4 – fencer counts the engine can size (`05654fca6d`, smoke `a6eba2385b`).**
  `MAX_FENCERS` 500 → 336, with the factory copy. Load refuses a `fencer_count`
  that is not a whole number or lies outside 2–336, naming the event and the
  bounds, for links and files. `addCompetition` and a template table missing a
  key take the board type's default table (NAC or regional). The fencer-count
  input gains `max`. `isSizeableCount` (`pools.ts`) is the one predicate behind
  `fencer-count-bounds`, now raised for NaN, Infinity and fractions, and it
  guards every pool-math caller. `deriveEventSchedule` and
  `estimateEventFootprint` return `null` for an unsizeable event, and the board
  treats it as not placed. A refused link keeps its reason in the store
  (`loadRefusal`), and a dismissable notice beside the stale banner shows it.
- **Task S – live smoke.** T4's two consecutive passes on the final code head
  (below) serve as Task S. No separate commit.
- **Task D – docs (`91881baee9`).** `backlog.md` marks §Day-end overrun and §A shared URL with a fencer count of 0
  or 1 closed, and the Div 1 bullet of §Policy tables and the second bullet of
  §Suggest's strip-hour floor "Fixed by 018", and keeps them, narrows the `validation.ts` cut entry, updates §Per-event entry caps
  and §Dead code held back, adds 15 entries and writes the §What 018 deliberately
  left unfixed index. `competition-planner-workbench.md` marks row 018 delivered,
  moves the baseline to after 018 and marks row 021's dependency delivered.
- **Task H – this handoff.**

## Measurements

| What | Value | Where |
|---|---|---|
| Unit suite | 89 files / 3031 tests, all pass (from 87 / 2795), `tmp/**` excluded | `05654fca6d` |
| `tsc -b`, lint | clean, clean | every task commit body (T1, T2, T3, T4) |
| Drift ledger snapshot SHA-256 | `7e2db75c38bb6e5702d3618e81127130739e9075536b843ca76a8cc368b89d06` to `9f0641a8e666119efc2fada2565c9f827349e04ce45218f0e070b56e4cae4a80` (T1) to `903cd991fbca8f50c201092211314e48b275e9aa48db61ec7fb64cc0660107ab` (T2), unchanged through T3 and T4 | the task commit bodies |
| Snapshot moves | T1: B1, B2, B7, B8 only. T2: B4 and B6 only. T3 and T4: none | T1 judge 3, T2 judge 3, T4 judge 1 |
| B1–B8 scheduled, ERRORs | 24 / 24 / 24 / 24 / 12 / 51 / 18 / 53 and 0 / 0 / 0 / 6 / 0 / 3 / 0 / 0 | `31ce0c3017`, held through `05654fca6d` |
| Boot footers | 24/0, 24/0, 24/0, 24/6, 12/0, 51/3, 18/0, 53/0, equal to the engine's | `31ce0c3017`, T4 judge 1 |
| Templates (B1 settings) | NAC Vet/Div1/Junior 58/8 → 60/6 (JR-M-EPEE-TEAM ends 23:45, JR-M-FOIL-TEAM 23:50), the nine others unchanged | `31ce0c3017` |
| Overrun rows, fresh boards | B4 3, B6 7, the others none, equal to the scheduler's WARNs on B1–B8 and the 10 templates | `9533ec187c` |
| Unsizeable counts | 0, 1, 1.5, NaN, 1e999, 337, 100000 refused at load and clean in the engine. 100000 is one per-event ERROR (23/24 placed) instead of an empty board, and Suggest answers in 1 ms instead of 33 s | `05654fca6d`, T4 judge 2 |
| Live smoke | **pass**, two consecutive full passes with 0 console errors after T1, T2, T3 and T4. T4's pair is on the final code head | T4: `a6eba2385b`'s body. T1, T2 and T3: orchestrator observations in no commit (scratchpad `smoke1.log`, `smoke2.log`, `run1.log`, `run2.log`, and for T2 the smoke agent's report in the session's `finish-018-T2` workflow journal, which no commit carries) |

Smoke command: `SMOKE_BASE=http://localhost:5188/piste-planner/ timeout 240
node scripts/smoke.mjs`, after `pnpm -C <wt> dev --port 5188 --strictPort`.
What the driver now checks, on top of 017's checks:

1. **Refused link (T4).** A fresh B1 sender's `#config=` link with one event's
   `fencer_count` set to 0, opened on its own page (only `pageerror` recorded),
   renders the shell, reads B1's 24 placed in the footer, shows
   `[data-load-refusal]` naming the event and "2 to 336", and Dismiss notice
   removes it. The final run's line: "the link with D1-M-EPEE-IND at 0 fencers
   booted B1 with the notice "This link couldn't be opened – fencer_count 0 for
   Div 1 Men's Epee Individual (D1-M-EPEE-IND) must be a whole number from 2 to
   336. Showing B1 instead.", and Dismiss removed it".
2. **B4 overrun (T3).** Picking B4 runs Auto-assign, and the Findings panel
   shows the three overrun rows (23:10, 23:15, 23:30). The block-inside-grid
   check is widened to every block on the board: the axis ends at 1440 minutes,
   and all 48 blocks sit inside the time grid. This step sits at the end of the
   driver (decision 18).

### Chain of measurements

Oldest first. Counts are taken from each commit's message body, with `tmp/**`
excluded. Where a body has no count, the row says so and nothing is guessed.

| Step | Commit | Files / tests | Notes |
|---|---|---|---|
| Base | `d4f545736c` (main) | 87 / 2795 | 017's merge, re-measured in the plan |
| Plan | `ed4fbbf365` | 87 / 2795 (the baseline it records) | docs only |
| A0 METHODOLOGY amendment | `5272d66823` | no count in body | docs only, ledger SHA unchanged |
| T1 | `44576f6f43` | 87 / 2797 | snapshot `9f0641a8e666…` |
| T2 | `31ce0c3017` | 87 / 2823 | snapshot `903cd991fbca…`. The body was amended once (decision 19) |
| T3 | `9533ec187c` | 87 / 2854 | snapshot unchanged |
| T3 smoke | `7bac9559a3` | no count in body (the body is empty) | driver only |
| T4 | `05654fca6d` | 89 / 3031 | snapshot unchanged |
| T4 smoke | `a6eba2385b` | no count in body | driver only, two passes |
| Task D | `91881baee9` | no count of its own | docs only |
| Task H | – | 89 / 3031 | docs only |

### Test count chain

| Commit | Total | Δ | What |
|---|---|---|---|
| `d4f545736c` (main) | 2795 | – | baseline |
| `44576f6f43` T1 | 2797 | +2 | the Div 1 cut pin split from Cadet and Junior, the derive case (233 of 310 in a 256 bracket) |
| `31ce0c3017` T2 | 2823 | +26 | R1 cases in `dayHardEnd.test.ts`, the R2 case in `stripSearch.test.ts`. The suite read 2812 before the review round (`t2-verify.md`), so that round added 11 |
| `9533ec187c` T3 | 2854 | +31 | overrun rows, the grown axis and its cap, the 00:00 tick, the app's overrun rows against the scheduler's on every board |
| `05654fca6d` T4 | 3031 | +177 | `sizeableCount.test.ts` and `fencerCountDefaults.test.ts` (both new, 87 → 89 files), load refusals, the boot notice. The implementer reports give 88 / 2937 after the engine step (+83) and 89 / 2971 after the load step (+34), so the review round added 60 |
| smoke, Task D, Task H | 3031 | 0 | driver and docs only |

The deltas sum to 236 (2795 to 3031). The intermediate figures inside T2 and T4
come from evidence files, not commit bodies.

## Reviews

Every task got `test-quality-reviewer` (mutation-probed) and a spec review, T3
and T4 also `react-code-reviewer`, and T1, T2 and T4 their drift judges. There
are no separate fix commits: each task's one bundled fix round is folded into
its task commit, which is why T2 and T4 grew after review.

- **T1 (6 findings, 3 judges accept).** Spec: three minors, among them a
  self-contradicting `stripSearch.test.ts` comment about B2 and knock-on moves
  the commit body had not named (B2 CDT-M-EPEE-TEAM, B7 CDT-W-FOIL-IND, B8
  JR-W-EPEE-IND), which the final body lists. Test quality: three warnings. The
  `refs.test.ts` comment gave the wrong cause for B8's sabre 56 → 60, which is a
  boundary touch at 1665 and not the VET R16 delay, and the comment now says so.
  Judge 2 explained every B7 and B8 move: the new B7 WARN is a 625 = 625 tie,
  and B8's seven VET R16s wait because JR-W-EPEE-IND's prelims fall back onto 8
  of 12 video strips.
- **T2 (spec 6 findings and 2 nits, test quality 5 warnings, 5 judges
  accept).** The notable spec finding: a pinned last phase past the R1 limit got
  an ERROR, a `PINNED_UNCLAIMED` and the new WARN, and now gets no WARN
  (decision 11). Test quality showed a true double decrement in R2 passed the
  whole suite, and a two-event case now pins "once each". It also asked for
  focused tests of the deferral path and the R1 edges and for B3's first-day
  WARN in `derived.test.ts`, which the commit names. Judge 2 traced
  VET-M-SABRE-IND-VCMB to the defer cap, judge 3's control showed R2 alone holds
  B5 at 29, judge 4 found run order deciding which team events get Day 3's late
  strips, and judge 5 showed the three B6 losses each consistent with R1. Judges 2, 4 and 5's findings are Left unfixed items 2 and 3.
- **T3 (React 1 important and 6 suggestions, spec 2 minors, test quality 3
  warnings).** The important one: times past midnight read two ways, "25:10" in
  the late-finish row and "01:10" in the overrun row. `formatClock` now
  delegates to `formatClockMins` (decision 13). Test quality found four
  surviving axis mutants (shrink-to-fit and which block sets the end) and a fifth
  on the unpinned 1440 wrap. Both now have cases, and the overrun rows are compared
  with the scheduler's on every board.
- **T4 (spec 4 minors, React 8 suggestions, test quality 1 critical and 5
  warnings, 2 judges accept).** The critical: deleting the whole-number check at
  load left the suite green, since 1.5 is below the minimum anyway. 24.5 is now
  in the refused list. Spec asked for a template sweep (every template's counts
  in 2–336), now in `fencerCountDefaults.test.ts`. React asked for a straight
  apostrophe in the notice, `print-hidden` on it, and a typed message for a
  non-number count (decision 16). The dismiss focus finding is repo-wide and
  left (item 12). Judge 2 confirmed every pool-math caller is guarded or
  guarded upstream, except two with no production caller (item 17).

## Decisions made on the owner's behalf

### Owner rulings and approvals

1. **2026-10-07, rulings R1–R7** (recorded in the plan). R1 an event's last
   phase may end past the hard end if it starts before it and ends by midnight,
   placed on the first attempt that fits with a WARN. R2 Suggest sizes for
   22:00. R3 a WARN in the engine and a Findings row on the drawn board. R4 Div 1
   cut 25 % at NAC. R5 fencer count bounds 2 to 336. R6 refuse out-of-range
   counts at load, and a new event starts at its default. R7 a refused link says
   why on the board.
2. **2026-10-07, the METHODOLOGY amendment approved**, committed verbatim as
   `5272d66823` before any code.

### Decisions the work made

Each with what it costs if wrong. Decisions 1–9 are the plan's.

1. **The WARN's finish is the last phase's end**, not the end with the
   gold/bronze tail. Cost: five events end past 22:00 only by their tail and get
   no overrun row (item 15).
2. **`latest_end` stays a hard per-event limit.** Cost: none on the app or the
   ledger, where it is `Infinity`. Only tests see it.
3. **Order T1 → T2 → T3 → T4.** Cost: none found. T1 settled the ledger before
   T2, and T4 moved nothing, as expected.
4. **The 4:00 PM pool cutoff stays unenforced and as written.** Cost: T2 made it
   visible, with pools now starting at 17:35 and 20:25 on B6 (item 1).
5. **`validateSameDayCompletion` is left for 021's dead-code sweep.** Cost:
   none while it has no caller (items 16, 17).
6. **A zero-length last phase whose ready time equals the hard end still
   places.** Cost: none on B1–B8.
7. **The overrun row is dismissable**, like the late-finish row. Cost: an
   organizer can hide a real overrun.
8. **The axis cap is 30:00 and labels past midnight wrap.** Cost: a crafted
   link that starts a placement after 06:00 the next morning still draws past
   the axis.
9. **SYC and SJCC use the regional default table**, since no template uses
   them. Cost: an added SYC or SJCC event starts at a regional default that may
   not fit those tournaments.
10. **The WARN text reads "\<label\> ends at HH:MM on Day N, X min past the
    day's hard end 22:00".** Cost: wording only, and it carries no next-day cue
    (item 10).
11. **A pinned last phase past the R1 limit keeps its ERROR and
    `PINNED_UNCLAIMED` and gets no WARN** (T2 spec review). Cost: the organizer
    sees the failure but no estimated finish for that event.
12. **Suggest counts overrun ∪ unseated events once each.** Cost: none found. An
    event both overrunning and unseated (B6 Y12-W-EPEE-IND in the pinned
    re-runs) is one event not placed.
13. **`formatClock` wraps past midnight everywhere** (T3 React review). Cost: no
    label reads "24:00" or "25:10", but none says "next day" either (item 10).
14. **`isSizeableCount` floors at 2** even if a config's `MIN_FENCERS` is lower,
    since a pool needs two fencers. Cost: a config with a minimum of 1 gets a
    `fencer-count-bounds` ERROR at 1. No app path sets a minimum below 2.
15. **The four config-less engine helpers default to the engine's bounds**
    (`suggestStripCount`, `suggestFlightingGroups`, `validateFlightingGroup`,
    `flagFlightingCandidates`). Cost: a config with other bounds could disagree
    with them, in tests only, since the production callers pass the config and
    the last two have none.
16. **A count above the maximum is one per-event ERROR instead of emptying the
    board**, beyond the plan (`validation.ts` skips the strips precondition for
    it). Cost: the rest of the board schedules around the bad event instead of
    refusing to run. A non-number count's load message reads "fencer_count must
    be a number (got \<typeof\>)", and a template table missing a key falls back
    to the board type's table. Cost: wording, and a future template with a gap
    starts that event at a NAC or regional default.
17. **The notice reads "This link couldn't be opened – \<reason\>. Showing B1
    instead."** Cost: wording, and it names the preset by id, where the preset
    picker shows its label.
18. **T1's `findings.test.ts` premise got a new trigger (a start 30 minutes
    later), and the T3 smoke's B4 step sits at the end of the driver**, because
    choosing B4 (SYC) changes the tournament type for every later check (item
    11). Cost: the findings test drives a start-time move the UI cannot make,
    and no smoke check runs after a preset switch.
19. **T2's commit message was amended once by the orchestrator** to correct its
    suite count (20 → 87 files). `31ce0c3017` is the amended commit. Cost: none.

Deliberate corrections recorded in commit bodies: `regionalGroup1Window`'s retry
premise now triggers through `latest_end`. `derived.test.ts` reads B4's last-day
WARN and B3's first-day WARN. The old `dayHardEnd` "fails the DE past 22:00"
case became the positive case, and its role moved to a past-midnight guard. T4
flipped `validation.test.ts`'s boundary 500 → 336 and `stripBudget.test.ts:88`
490 → 336 (48 pools, `foil_epee` 68).

## Left unfixed

Backlog-worthy items are marked with an asterisk and point at their entries, all
indexed under backlog §What 018 deliberately left unfixed.

1. **\*The 4:00 PM pool cutoff is unenforced.** `LATEST_START_MINS` has no engine
   reader. T2 made it visible: B6 now starts pools at 17:35 (JR-W-EPEE-IND,
   Y12-W-EPEE-IND) and 20:25 (VET-M-SABRE-IND-VCMB), while B4's 16:05 and B6's
   16:25 predate 018. Cost if ignored: the engine plans pool rounds a real
   tournament would not run. An owner call: enforce it, move it or delete
   METHODOLOGY :80 and the Timing Constants row at :1028. Backlog §The 4:00 PM
   pool cutoff is not enforced.
2. **\*The defer cap of 16 decides losses.** B6 JR-M-SABRE-IND and
   JR-W-SABRE-IND fail attempt 1 on it, and VET-M-SABRE-IND-VCMB's attempt 1
   failed on it before its retry put pools at 20:25. Related:
   `earliestFreeStartFor` (`resources.ts`) ignores gaps between bookings, so a
   retry's estimate jumps past free windows. Cost if ignored: events are lost
   with a free window open (JR-W-SABRE-IND had one at 21:05). Backlog §The defer
   cap decides which events are lost.
3. **\*Run order decides which events get the late strips.** On NAC
   Vet/Div1/Junior the men's Junior team DEs now place (23:45, 23:50) and push
   the women's Junior team DEs past midnight (lost before too). Cost if ignored:
   which pair is lost follows run order, not any priority an organizer chose.
   Backlog §Run order decides which events get the late strips.
4. **\*`memoizeOnDeps` caches a throw** (`src/store/derived.ts` ~84-85). Cost if
   ignored: a selector throw is misreported or hides findings behind stale
   results. Backlog §`memoizeOnDeps` caches a throw.
5. **\*The `validation.ts` cut-share mismatch is still open**, and for Div 1 the
   false-exclusion range is now 2–5 fencers. Cost if ignored: a very small Div 1
   event is judged against the wrong share. Backlog §`validation.ts` reads a
   percentage cut as the share that advances (existing, narrowed).
6. **\*The dev tool `asciiLaneRenderer`** (`src/tools/asciiLaneRenderer.ts` ~64,
   ~129-131) clips lanes at the hard end. Cost if ignored: dev printouts leave
   out overrun tails. Backlog §The dev lane renderer clips overrun tails.
7. **\*Every Veteran age group shares one default-count key**, so a hand-added
   NAC V80 starts at 120 against 2–5 real entries. Cost if ignored: an added
   event overstates its load until edited. Backlog §Every Veteran age group
   shares one default fencer count.
8. **\*The `'TIME'`/`'STRIPS'` miss label** (`resources.ts`) still reads the hard
   end, so a last phase deferred into the overrun window logs an INFO labelled
   TIME. Cost if ignored: a misleading INFO only, outside the digest. Backlog
   §The TIME and STRIPS miss label still reads the hard end.
9. **\*The engine's day-ends-past-target WARN** (`lateDayWarnings`) adds the
   gold/bronze tail and wraps past midnight (B4 day 3 reads 00:00). It is not
   shown in the Findings panel. Cost if ignored: the engine's own text can read
   a day's end as 00:00. Backlog §The late-day WARN adds the medal tail and
   wraps past midnight.
10. **\*Clock labels wrap past midnight with no next-day cue.** B4's footer
    tournament finish reads 00:00 (Y14-W-EPEE-IND's tail ends at midnight), and
    ticks, rows and bands wrap too. Cost if ignored: a finish of 00:00 reads like
    the start of a day. An owner wording call (for example "00:10 (+1)").
    Backlog §Clock labels wrap past midnight with no next-day cue.
11. **\*A template keeps the board's tournament type** (`applyTemplate` sets
    none). The T3 smoke hit it after B4 (SYC), and the probes ran every template
    as NAC. Predates 018. Cost if ignored: a template applied after a regional
    preset runs under that preset's cut rules. Backlog §A template keeps the
    board's tournament type.
12. **\*Dismiss controls drop focus to `<body>`** (the refusal notice, Findings
    rows, the detail strip), repo-wide. Cost if ignored: keyboard and
    screen-reader users lose their place. Backlog §Dismiss controls drop focus to
    the page body.
13. **\*Since T1, B8's seven day-1 VET R16s run 100–160 minutes later**, because
    JR-W-EPEE-IND's prelims fall back onto 8 of 12 video strips (allocator
    behaviour, `resources.ts` ~216-223). Cost if ignored: a long phase that needs
    no video can starve the events that do. Backlog §B8's day-1 Vet round-of-16s
    run later after the Div 1 cut change.
14. **\*Fragile figures.** B7's new first-day WARN sits on a 625 = 625 minute
    tie. B8's day-1 sabre peak 60 and B4's 96/94 are boundary-touch figures under
    the existing §The referee sweep counts an instantaneous handoff twice (T2
    judge 1: 80 and 78 counting only true overlaps). Cost if ignored: any
    5-minute shift in a later feature can flip them, and a judge may read the
    flip as a regression. Backlog §Three drift figures sit on a tie or a boundary
    touch.
15. **\*Five events end past 22:00 only by their gold/bronze tail** and get no
    hard-end WARN (B2 ×1, B4 ×1, B6 ×3), per plan decision 1. Cost if ignored: no
    overrun row for an event whose medal bouts run past 22:00. Backlog §Five
    events end past 22:00 only by their medal tail.
16. **\*`validateSameDayCompletion`** (no callers) still measures Single-Day Fit
    to the hard end. Feature 021's sweep. Cost if ignored: none until something
    calls it. Backlog §Dead code held back from the 2026-09-01 sweep (note
    added).
17. **\*`calculateFlightedStrips` and `validateSameDayCompletion` still throw on
    an unsizeable count** if called directly. No production caller reaches them.
    Cost if ignored: a future caller must guard first. Backlog §Two fencer-count
    corners 018 left open.
18. **\*`selectCompetitions` still seeds a count of 0**, which `applyPreset`
    overwrites at once. Cost if ignored: none today, and a new caller would seed
    0. Backlog §Two fencer-count corners 018 left open.

Task D's caveat: the backlog entries for items 1, 4, 6–12, 15, 17 and 18 say "Found during
018", because no commit body traces which task or review found them.

### For later features

019 and the features after it measure against the numbers in Measurements. A
change that delays a DE can now give a late finish with a WARN where it used to
drop the event, so the scheduled count may rise and the `SAME_DAY_VIOLATION`
WARNs and the overrun rows move with it. Suggest still sizes for 22:00, and an
overrunning event counts as not placed there. Any new pool-math caller of
`fencer_count` must go through `isSizeableCount` or be guarded upstream, and a
new load refusal reaches the board through `loadRefusal` and the notice. A change
to `MAX_FENCERS`, `MIN_FENCERS` or `DAY_HARD_END_MINS` changes the factory's copy
(`__tests__/helpers/factories.ts`) in the same commit, and a change to per-event
derivation also changes `__tests__/helpers/scenarios.ts` and
`__tests__/store/factoryParity.test.ts`. 017's rule still holds: anything the
engine reads must be in `configKey`.

## Merge

Checked 2026-10-08 with `git merge-tree --write-tree main 018-engine-correctness`.

- Branch head checked: 83144571432348bd55db7b5eeb8ecea6040d57c0 (the branch tip before this note).
- Main: d4f545736c2ebb355f91456c573c95713a578529, which has not moved since the branch was cut.
- Merge tree: 327dfe7762846cd952b4702efcb5461674e75ece, identical to the branch's own tree.
- Conflicts: none.
- Because the trees are identical, the checks ran in the feature worktree at the branch head (clean status), with `tmp/**` excluded from the suite and lint.
- Full suite: 89 files, 3031 tests, all passing.
- `tsc -b`: clean. Lint: clean.
- Drift ledger snapshot SHA-256: 903cd991fbca8f50c201092211314e48b275e9aa48db61ec7fb64cc0660107ab, byte-identical to the expected value.

The user merges with merge-with-costs. If main moves first, the check is re-run there.

## Resume prompt (after the merge)

```text
Piste Planner. Feature 018 (engine correctness) is delivered and merged into
main, and its record is specs/018-engine-correctness/handoff.md.

Next is roadmap feature 019, default days per template:
docs/design/competition-planner-workbench.md §Roadmap row 019, and
docs/design/backlog.md §"The store's default day count is unsatisfiable for
three templates". 019 makes the three K4 templates default to 4 days so they
satisfy their own hard rules. Its drift is expected to be parity only, measured
against the ledger 018 left: B1-B8 scheduled 24 / 24 / 24 / 24 / 12 / 51 / 18 /
53, ERRORs 0 / 0 / 0 / 6 / 0 / 3 / 0 / 0, snapshot SHA-256
903cd991fbca8f50c201092211314e48b275e9aa48db61ec7fb64cc0660107ab, 89 files /
3031 tests, boot footers 24/0, 24/0, 24/0, 24/6, 12/0, 51/3, 18/0, 53/0. An
event's last phase may now run past 22:00 to midnight with a WARN, so a change
that delays a DE can move scheduled counts and WARNs together. If a change
touches per-event derivation, list __tests__/helpers/scenarios.ts and
__tests__/store/factoryParity.test.ts among its editable files and change the
factory's copy in the same commit.

Start from the main checkout. Cut a fresh worktree off main, named for the
branch (019-...). Plan 019 yourself: no Spec Kit, choose the planning approach,
and keep the constitution's guardrails (drift ledger, test-first, live smoke,
git ownership). The user merges with merge-with-costs and makes the closing
commit with commit-with-costs. Agents commit only inside the worktree, and
never push, merge or make the closing commit.
```
