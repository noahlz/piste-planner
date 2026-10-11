# 021 METHODOLOGY reconciliation – handoff

**Status: delivered 2026-10-11** on branch `021-methodology-reconciliation` (worktree
`.claude/worktrees/021-methodology-reconciliation`, cut from `main` `5edbdf7712`, and
`main` has not moved), awaiting the user's `merge-with-costs`. Task M's merge check
passed and is recorded under [Merge](#merge). Plan: [`plan.md`](./plan.md), with [`amendment.md`](./amendment.md),
[`decisions.md`](./decisions.md) (owner rulings O1–O15 and defaults 1–14) and
[`audit.md`](./audit.md) beside it. METHODOLOGY.md was amended three times, each time with
the owner's approval before the commit: A0 (`121394c92a`), the follow-up A1
(`cb4c8deeb9`) and A2 (`2f84c3e158`, O15). No other commit touches it. *O15
(2026-10-11) dropped the Y10 with Div 3 bonus after T5 shipped it, see
[O15 below](#o15--y10-with-div-3-dropped-2026-10-11). Read any Y10↔Div 3 line in this
handoff as history.* The branch holds 21 commits before this
handoff. Four questions go to the owner, listed first below.

## Owner questions

- **A – O14's real cost on NAC Vet/Div1/Junior. Keep `<=`, or revisit?** O14 kept
  `<=` at the morning wave's end and accepted a cost of 1–2 events on this template.
  That figure came from a fresh store with 8 video strips. An organizer who opens the
  app gets the B1 preset (80 strips, 12 video strips, 4 days), and `applyTemplate`
  leaves those alone, so the template runs with 12 video strips. On that route main
  places 60 and leaves 6, and 021 places 55 and leaves 11, so five fewer events are
  placed. Video Strip Preservation (T8) costs six of them by itself, and T4 (+2) and
  T6a (−1) net to +1 before it. If the organizer presses
  Suggest and Apply, all 66 events place before and after 021, at 103 strips on main
  and 104 now, so the cost there is one strip. No floor covers templates. The full
  series is under Measurements, §O14 on NAC Vet/Div1/Junior, and the backlog entry is
  [§Video strip preservation costs NAC Vet/Div1/Junior events](../../docs/design/backlog.md#video-strip-preservation-costs-nac-vetdiv1junior-events).
  Until the owner answers, the 6-event cost stands under O14.
- **B – An older Vet band's retry can break the stagger** (plan decision 8). If an
  older band fails late and restarts after its younger band was released, the younger
  band keeps its place, so the older band can start after it. T6a's J2 found 18 of 6372
  same-day pairs under 60 minutes apart in a 252-run sweep, 15 from an older band's
  retry and 3 from a middle band that never placed. No configuration at or above its
  Suggest lost an event. Should a
  broken order draw a finding, or should the release wait for the older band's second
  attempt? Backlog
  [§An older Vet band's retry can break the stagger](../../docs/design/backlog.md#an-older-vet-bands-retry-can-break-the-stagger).
- **C – What a Veteran team event waits on.** The 120-minute ind→team wait finds one
  Vet individual by list order and ignores the age band, so a Vet team waits on
  whichever band or Vet Combined comes first. Only a pinned or too-short board reaches
  it. Every band, the last to finish, or none? Backlog
  [§A Veteran team event waits on one Vet band, picked by list order](../../docs/design/backlog.md#a-veteran-team-event-waits-on-one-vet-band-picked-by-list-order).
- **D – Should Findings show the flighting suggestion text?** The engine builds a
  suggested flighting pair that nothing outside `analysis.ts` reads (amendment Note 2,
  default 12's correction). The three flighting WARNs carry the signal today. Backlog
  [§The flighting suggestion text never reaches Findings](../../docs/design/backlog.md#the-flighting-suggestion-text-never-reaches-findings).

## Session notes

The orchestrator ran as one session, `da05b850-c940-41f6-92e4-801f66f7c45d`, from
2026-10-08 to 2026-10-11. It was compacted twice, once automatically after T6c on
2026-10-10 and once by hand after the T6a smoke commit and before T5, and then resumed
from `<wt>/tmp/021-resume-prompt.txt`. It drove the worktree from the main checkout with
absolute paths, so its transcript sits under the main checkout's project directory
(`~/.claude/projects/-Users-noahlz-projects-piste-planner/`). Background task outputs
went under `a91cc939-e943-4ff6-a585-c52637ca30a0`, which 019 and 020 share, so the
cost tooling must count only 021's share of that folder and not count 019's or 020's
again.

The work ran as ultracode workflows, one per task or commit: implement, drift judges,
spec and test-quality review, one bundled fix round, re-judge, live smoke with
measured-pin handling, then the commit. The workflow script is
`~/.claude/projects/-Users-noahlz-projects-piste-planner/da05b850-c940-41f6-92e4-801f66f7c45d/workflows/scripts/021-impl-drift-rest.js`.
T5 and Task S ran in one workflow after the resume, and its full record is
`<wt>/tmp/021-t5/workflow-result.json`. The implementation dispatches for T6c, T7 and
T8 had no agent-spawning tool. The judges, reviews and smoke of T7 and T8 ran under the
orchestrator afterwards. For T6c the implementer ran the smoke itself, and its commit
does not say who ran the judges. T3-1's implementer ran a smoke of its own before the
subagent smoke that counts. Smoke logs (`smoke-<task>-*.log`), probes and audit logs
sit git-ignored in `<wt>/tmp/` and go when the worktree is removed.

## What changed

In product terms: METHODOLOGY.md and the engine now say the same thing, except for the
items under Owner questions and Left unfixed. The owner approved one amendment (A0)
after rulings O1–O11 and a follow-up (A1) after O12–O13, while O14 changed no spec text.
Everywhere else the engine moved to the spec.

- The eight time-of-day preferences, which day assignment could never score, are
  retired from the spec and the code, with their dead settings.
- Dead engine code is gone, `daySequencing.ts` included.
- Day assignment uses every day the organizer chose.
- A flighted event asks for only Flight A's share of strips, Flight B starts 15
  minutes after Flight A ends, and the larger event is the one suggested for flighting.
- Day assignment prefers days that hold both épée and foil or sabre, and no B1–B8 day
  now holds only one weapon class (genders pooled). It also prefers to put a Y8 on its
  Y10's day. (T5 first put a Y10 on its Div 3's day too, and O15 removed that.)
- On a Veteran co-day the bands start oldest first, at least 60 minutes apart, and a
  team event that shares a day with its individual waits 120 minutes after it ends. No
  Veteran event has a fixed start offset.
- A split Vet co-day draws a Warning the organizer cannot dismiss, and pools that
  start after 4:00 PM draw a Warning, for run-placed and hand-moved events alike.
- On a multi-event NAC video day, pools that start after the morning wave leave the
  video strips for the video stage.

Headline, before to after (Base is `5edbdf7712`, After is `0544ef1877`, the last code
commit):

| What | Before | After |
|---|---|---|
| Ledger B1–B8 scheduled | 24 / 24 / 24 / 24 / 12 / 51 / 18 / 53 | 24 / 24 / 24 / 24 / 12 / **53** / 18 / 53 |
| ERRORs | 0 / 0 / 0 / 6 / 0 / 3 / 0 / 0 | 0 / 0 / 0 / 6 / 0 / **1** / 0 / 0 |
| Floors | B6 51 | **B6 53** (raised by T4) |
| `stripRecommendation` | 53 / 75 / 73 / 74 / 29 / 63 / 82 / 56 | 53 / 75 / **79** / 74 / **32** / **64** / 82 / 56 |
| Ledger snapshot SHA-256 | `32a4e0afb45a…` | `5f0935202e54…` |
| Boot footer B1–B8, placed / unplaced | 24/0, 24/0, 24/0, 24/6, 12/0, 51/3, 18/0, 53/0 | 24/0, 24/0, 24/0, 24/6, 12/0, **53/1**, 18/0, 53/0 |
| Pooled one-class days on B1–B8 | 1 (B7 day 3, all foil and sabre) | 0 |
| B8 Vet same-day band pairs 60 min or more apart | 1 of 60, 22 younger first | 60 of 60, 0 younger first |
| `pool-start-after-cutoff` WARNs | none (the rule was never read) | B4 1, B6 9, B8 3 |
| A split Vet co-day | silent | one undismissable Warning per gender and weapon |
| Suggest on NAC Vet/Div1/Junior (SC-008, 12 video strips) | 103 | 104 |
| NAC Vet/Div1/Junior after the B1 boot, placed / unplaced | 60/6 | 55/11 (Owner question A) |
| Unit suite | 96 files / 3252 tests | 97 files / 3349 tests |

What each task does now:

- **Plan (`d558631116`) and the O11 fold (`59fc01b9e1`).** A 32-agent audit (16
  auditors, 16 adversarial verifiers) checked every 021 scope item against
  `5edbdf7712` (`audit.md`). The owner ruled O1–O10, the plan took defaults 1–14, and
  the amendment was drafted as 97 blocks applied bottom-up by `apply.py`. The plan was
  reviewed under four lenses. O7's weapon-balance reading was chosen by a 49-board
  probe. The owner annotated the applied amendment in Plannotator, and that annotation
  became O11 (two blocks added, 99 in all).
- **A0 – the amendment (`121394c92a`).** `amendment.md` applied verbatim to
  METHODOLOGY.md (1136 → 1188 lines by `wc -l`), with 0 unmatched blocks, 0 overlaps and 0 broken
  anchors. Ledger unchanged.
- **T1a – the time-of-day weights retired (`c4297a8bac`).** Pure deletion. The 8
  time-of-day `PENALTY_WEIGHTS` keys, the 3 `LAST_DAY_REF_SHORTAGE_*` keys, 5 orphan
  `BottleneckCause` members, and the constants `SAME_TIME_WINDOW_MINS`,
  `EARLY_START_THRESHOLD`, `MAX_RESCHEDULE_ATTEMPTS`, `THRESHOLD_MINS` and
  `LATEST_START_MINS` with their `TournamentConfig` fields, `buildConfig.ts` entries,
  factory entries and assertions. `LATEST_START_OFFSET`, `MORNING_WAVE_WINDOW_MINS`,
  `INDIV_TEAM_MIN_GAP_MINS`, `REGIONAL_GROUP_1_WINDOW_MINS` and `WEAPON_BALANCE` stay
  for later tasks. Ledger byte-identical.
- **T1b – dead code out, two constants wired (`87292a868e`, `6bfdd597b4`).** The first
  commit deletes everything with no caller or reader: `daySequencing.ts`,
  `proximityPenalty`, `individualTeamProximityPenalty`, `SchedulingError`,
  `isRegionalQualifier`, `genderEquityAllowableDiff`, `dayRemainingCapacity`,
  `weightedStripHours`, `peakConcurrentStrips`, `findDayForTime`, `validateRefConfig`,
  `validateSameDayCompletion`, the unreachable same-population rule, several dead
  fields (`Competition.optional`, `de_round_of_16_requirement`, `conflict_score`,
  `accepted_warnings`, `RefPolicy.AUTO`, `Phase.SCHEDULING`) and seven never-emitted
  `BottleneckCause` members. The second moves `INDIV_TAIL_MINS` and `TEAM_TAIL_MINS`
  into `types.ts` beside `tailEstimateMins`, which now reads them, gives
  `flagFlightingCandidates` the signature `(competitions, config)` with each event's
  own strip cap, wires it into analysis Pass 1, and fixes stale comments. Ledger
  byte-identical, and a full capture of Pass 1's 441 warnings on B1–B8 and the 10
  templates was byte-identical too.
- **T1c – `recommendRefCount` dropped (`e2b940dbfd`).** METHODOLOGY computes referees
  from the schedule, so the suggesting function goes, and the ledger loses its
  `refRecommendation` field. The SHA changes (`cf982410ce11…`) while every scheduling
  number holds: the old snapshot minus its 8 blocks equals the new one byte for byte.
- **T2 – every chosen day is used (`6207c03b5f`, O3).** `assignDaysByColoring` runs
  one DSatur pass at `days_available`. The "fewest days" Phase 1 pass, `chromaticN`,
  `capacityDemandedDays`, `CAPACITY_TARGET_FILL`, `MAX_EXPANDED_DAYS` and the expansion
  block are gone, and the load-balance and sabre-pileup terms apply on every candidate
  day. Ledger byte-identical to T1c. Over B1–B8 and every template, only four 5-day
  rows change (B5, B7 and RJCC Weekend at NAC and ROC), each from 4 used days to 5 with
  the same placed count. The calibration scenario was closed by O3, not added.
- **T3 – flighting follows the spec (`1797945660`, then `7185168c98`).** The first
  commit halves the strip minimum for a flighted event (`ceil(pools / 2)`), makes
  Flight A → Flight B wait `FLIGHT_BUFFER_MINS` (15) through one `successorGap` helper
  used by the main loop, the pinned path and `derive.ts`, measures `FLIGHT_B_DELAYED`
  from Flight B's own ready time, adds a Flight A key to the within-day order, and
  makes the suggestion flight the larger event. The second deletes the flighting-group
  path the app can no longer reach (`flighting_group_id`, `is_priority`, the
  `flighting-group-strips` rule, `validateFlightingGroup` and the members only it
  emitted), so a flighted event splits on `comp.flighted` alone. No B1–B8 scenario
  holds a flighted event, so the ledger is byte-identical to T1c.
- **T4 – weapon balance (`39c7145a63`, O4, O7).** A new `weaponBalancePenalty` in
  `dayColoring.ts` scores +0.5 when an event leaves its day holding one weapon class,
  −0.5 when it brings the missing class, and 0 on a day that holds both, with genders
  and team events pooled and the event itself left out of the day state. B6 rises 51 →
  53 (ERRORs 3 → 1), day maps move on B1, B3, B5, B6, B7 and B8, and the B6 floor rises
  to 53.
- **T6a – the Vet stagger and the ind→team wait bind (`bfdf295fca`, O1, O8).** A new
  pure module, `src/engine/crossEventWaits.ts`, and a held set in the scheduler loop.
  Each younger age-banded Vet band's pools wait 60 minutes (`VET_STAGGER_MINS`) after
  the next-older band present on its day starts, and a team's pools wait 120 minutes
  after its individual's last phase ends. A wait lapses when the event waited on never
  places (O8), and a band then waits on the next placed band above it. Waits are
  stored on `EventState`, so a retry keeps them, and post-loop assertions throw on any
  unresolved or cyclic wait (constitution IV). Only B8 moves: its 30 banded Vet events
  are staggered, and 4 D1 team events start earlier as a knock-on.
- **A1 – METHODOLOGY follow-up (`cb4c8deeb9`, O12, O13).** The Y8↔Y10 and Y10↔Div 3
  bonus becomes −0.3 (O15 later dropped the Div 3 half), and the Vet Combined start offset is retired. Both approved
  values had cost B6 events in probes.
- **T6b – the Vet Combined offset retired (`7c3bf6e61f`, O13).** A pure removal of the
  never-read `earliest_start_offset` field from `CATEGORY_START_PREFERENCE`, which now
  holds weights only. An earlier T6b attempt, made before O13, added an offset reader
  and tests, and all of it was undone. Ledger byte-identical.
- **T6c – a split Vet co-day is reported (`0df58dee46`).** One pure check,
  `vetCoDaySplitFindings` in `placementRules.ts`, serves the scheduler and the board's
  hand-placement check. It emits one `vet-co-day-split` WARN per gender and weapon
  whose banded events span two or more days, owned by the oldest band, and
  `UNDISMISSABLE_RULES` refuses its Dismiss. The band order now lives once, in
  `crossover.ts` (`VET_BANDS_OLDEST_FIRST`, `vetBandRank`). Unpinned runs never split,
  so the ledger is byte-identical.
- **T7 – pools after 4:00 PM warn (`8b23e1b964`, O2, O10).** A new pure
  `poolStartAfterCutoffWarnings` runs after the scheduler's run and in the store's
  `placementFindings`. An event whose first pool phase (its pools, or Flight A) starts
  later than day start plus `LATEST_START_OFFSET` draws one dismissable WARN that
  names the start and the cutoff. Flight B is exempt and the event stays placed. The
  ledger gains only the WARN counts, B4 1 and B6 9.
- **T8 – video strips are kept for the video stage (`bad32530d9`, default 11, O14).**
  One predicate, `poolMayUseVideoStrips` in `resources.ts`, serves the engine loop, the
  pinned path and the canvas re-seater (`src/layout/strips.ts`). On a day that holds a
  REQUIRED video phase and more than one event, a pool phase may use video strips only
  while it starts no later than 120 minutes after day start (`<=`, O14). Every DE phase
  keeps video strips as overflow. B2, B3 and B8 are re-timed (4, 5 and 27 events) with
  no count change, B3's `stripRecommendation` goes 76 → 79, and B8 gains 3 cutoff
  WARNs.
- **T6a smoke (`fa6be94556`).** The live stagger check T6a owed, added to
  `scripts/smoke.mjs` in place after T8. It reads each banded Vet band's pool start on
  NAC Vet/Div1/Junior and asserts each younger band starts at least 60 minutes after
  the next-older present band.
- **T5 – Y8 with Y10 and Y10 with Div 3 share a day (`0544ef1877`, O6, O9, O12).** A
  new `sameDayBonus` in `dayColoring.ts`, right after weapon balance, reads its own
  unordered lookup (`SAME_DAY_BONUS_PAIRS`) and scores −0.3 per partner of the same
  weapon and gender on the day. T5 ran last, after T8, as O12 directed. Only B6 moves:
  two Y8 events swap days to sit with their Y10s. *O15 (2026-10-11) later removed the
  Y10↔Div 3 half: the `Y10_DIV3_SAME_DAY` weight and its `SAME_DAY_BONUS_PAIRS` row are
  gone, and the bonus is Y8↔Y10 alone. T5's commit body stays as history.*
- **Task S – the final live smoke.** Two consecutive passes on `0544ef1877`, 0 console
  errors, no pin moved and no locator repaired (`<wt>/tmp/smoke-S-1a.log`,
  `smoke-S-1b.log`). No driver change, so no commit.
- **Task D – docs (`edfe3addaf`, fact-check fixes `ae3439b75a`).** `backlog.md`
  closes or annotates every entry 021 settled, each with its commit and ruling, and
  writes §What 021 deliberately left unfixed. `competition-planner-workbench.md` marks
  row 021 delivered with the new baseline. `methodology-reconciliation.md` gets a
  dated note against every verdict 021 applied. `plan.md` gains the O14 row and the Div
  3 correction. Four fact-checkers then read the docs, and the second commit corrects
  what they found and records the O14 re-measurement. METHODOLOGY.md was not touched.
- **Task H – this handoff.**

## Measurements

| What | Value | Where |
|---|---|---|
| Unit suite | 97 files / 3349 tests, all pass (from 96 / 3252), `tmp/**` excluded | `0544ef1877`, re-run by Task D |
| `tsc -b`, lint | clean, clean | every code commit body, and Task D's check at its head |
| Drift ledger snapshot SHA-256 | `5f0935202e54521e555d3d8feace4172d955a292ed8bce2a9c13e21a7d478341` (from `32a4e0afb45a…`) | `0544ef1877` |
| B1–B8 scheduled | 24 / 24 / 24 / 24 / 12 / 53 / 18 / 53, B6 +2 by T4 | T4 judges J1, J1b |
| ERRORs | 0 / 0 / 0 / 6 / 0 / 1 / 0 / 0, B6 −2 by T4 | T4 |
| `stripRecommendation` | 53 / 75 / 79 / 74 / 32 / 64 / 82 / 56 (B3 +3 by T4 and +3 by T8, B5 +3 and B6 +1 by T4) | T4, T8 |
| Floors | 24 / 24 / 24 / 24 / 12 / 53 / 18 / 53, B6 raised 51 → 53 with a dated entry in `driftLedger.test.ts` and `integration.test.ts`. B4's `toBe(24)` and `SCENARIOS_WITH_DAY_SUMMARY = ['B4', 'B6']` hold | T4 |
| Boot footers through the app path | 24/0, 24/0, 24/0, 24/6, 12/0, 53/1, 18/0, 53/0 | T5's J1 |
| Cutoff WARNs | B4 1, B6 9, B8 3, equal to an independent count of first pool starts after the cutoff | T7, T8 |
| B8 Vet same-day band pairs | 60 before and after. 60 or more minutes apart 1 → 60, younger first 22 → 0, dependency INFOs 1 → 24 | T6a |
| Y8↔Y10 same-day pairs | B6 0/6 → 2/6, B4 0/6 → 0/6. Y10↔Div 3 0 everywhere, since no scenario or template holds a Div 3 (and O15 later removed that half) | T5 |
| SC-008 Suggest, NAC Vet/Div1/Junior | 103 → 104 at T8 (12 video strips). At the type default of 8 video strips both read 103 | T8 |
| Templates plus B1–B8, 49 boards | pooled one-class days 7 → 0, scheduled / ERRORs 1050 / 107 → 1055 / 102 at T4, no count fell anywhere | T4's J4 |
| Live smoke | **pass**, two consecutive full passes with 0 console errors after T2, T3-1, T3-2, T4, T6a, T6b, T6c, T7, T8, the T6a smoke, T5 and Task S | `<wt>/tmp/smoke-<task>-*.log`, `smoke-S-1a.log`, `smoke-S-1b.log` |

Smoke command: `pnpm -C <wt> dev --port 5190 --strictPort`, then
`SMOKE_BASE=http://localhost:5190/piste-planner/ timeout 240 node <wt>/scripts/smoke.mjs`.
What the driver now checks, on top of 020's checks:

1. **021 T3** (`1797945660`, +135 lines). On B1 it flights the strictly largest event
   (D1-M-EPEE-IND, 310 fencers) and checks Flight B starts at snap(A end + 15), 9:00–10:56
   then 11:15. It then lowers the strips until the strip-minimum row is Blocking (44
   strips), presses Flight, and checks the row clears and Auto-assign enables.
2. **016 check 2, selection repaired by T4** (`39c7145a63`). After weapon balance the
   first different-day ROC Mega Group 1 pair yields an honoured Note when moved onto
   one day, so the step tries each pair in turn. The not-honoured Warning is still
   asserted strictly on the pair used, and the step fails if none reaches it.
3. **021 T6c** (`0df58dee46`). On NAC Vet/Div1/Junior, Move day takes
   VET-M-EPEE-IND-V40 from Day 3 to Day 4 and asserts exactly one
   `analysis:vet-co-day-split:` Warning row with no Dismiss control.
4. **021 T7** (`8b23e1b964`). B4's Findings show exactly one cutoff Warning: "Y12 Men's
   Saber Individual pools start at 16:05 on Day 2, 5 min past the pool-start cutoff
   16:00".
5. **021 T8** (`bad32530d9`). On NAC Vet/Div1/Junior, 17 pool phases start after 11:00
   on video days 1–4 and none holds a video strip. It moves JR-W-SABRE-IND from day 1
   to day 2 at 11:55, sees its pools unseated, then moves it back and unpins it, since
   the pin would otherwise follow the id into NAC Cadet/Junior and break 020 R4.
6. **021 T6a** (`fa6be94556`). Inside the T6c block and before its move, each same-day
   group of banded Vet bands is read oldest first and each younger band must start at
   least 60 minutes after the next-older present band. It logs "Vet stagger holds
   across 24 same-day band pairs", and throws if no pair is found.

The SC-008 pin moved once, 103 → 104 at T8, measured through the store path (104
under T8 and 103 at T7 in a control worktree, both at 12 video strips) and updated with
a dated `[M]` comment. Two live readings on NAC Vet/Div1/Junior at its Suggest moved
with no pin attached. Blocks ending after 19:00 read 16 at T2 and T3 (the earliest
smoke logs), 15 at T4, 30 from T6a through T7 and 28 from T8 on. The latest block end
read 1270 min at T2 and T3, 1305 at T4 and 1315 from T6a on. Every other measured pin
held throughout: the B1 boot footer 24 placed · 0 unplaced, B1 peak referees 210, the
B4 overrun trio 23:10 / 23:15 / 23:30, the B1 headline move "23 placed · 1 unplaced",
and the row counts 12 / 24 / 66 / 24.

### O14 on NAC Vet/Div1/Junior, commit by commit

Measured through the app path for Task D's fact-check round: `bootstrap('')` for B1,
then `applyTemplate('NAC Vet/Div1/Junior')`, then `runScheduleAll`. Placed / unplaced is
`selectPlacementCounts`, and ERRORs (E) are engine ERROR bottlenecks, equal to the
unplaced count on every row. Route A is that path, with B1's 12 video strips. Route B
is route A after Suggest and Apply. Route C is T8 Step 1's route (fresh store, NAC, 4
days, 80 strips, video unset, so the NAC default of 8). B1's boot read 24/0 at every
commit.

| Commit | A: B1 boot then template, 12 video | Suggest (route B) | B placed / unplaced | C: 8 video |
|---|---|---|---|---|
| main `5edbdf7712` | 60/6, E6 | 103 | 66/0 | 60/6, E6 |
| P ×2, A0 | 60/6, E6 | 103 | 66/0 | 60/6, E6 |
| T1a through T3-2 | 60/6 | 103 | 66/0 | 60/6 |
| T4 `39c7145a63` | 62/4, E4 | 103 | 66/0 | 62/4, E4 |
| T6a `bfdf295fca` | 61/5, E5 | 103 | 66/0 | 60/6, E6 |
| A1, T6b, T6c | 61/5 | 103 | 66/0 | 60/6 |
| T7 `8b23e1b964` | 61/5, E5 | 103 | 66/0 | 60/6, E6 |
| T8 `bad32530d9` | 55/11, E11 | 104 | 66/0 | 58/8, E8 |
| T6a smoke `fa6be94556` | 55/11 | 104 | 66/0 | 58/8 |
| T5 `0544ef1877` (final) | 55/11, E11 | 104 | 66/0 | 58/8, E8 |

Only four commits change route A's placed set, and every other commit leaves it
byte-identical:

- T4 weapon balance, +2 (60 → 62). In: D1-W-FOIL-TEAM, JR-M-FOIL-IND, JR-W-EPEE-TEAM,
  JR-W-FOIL-IND, JR-W-FOIL-TEAM. Out: JR-M-EPEE-TEAM, VET-W-SABRE-IND-V70,
  VET-W-SABRE-IND-V80.
- T6a stagger and ind→team wait, −1 (62 → 61). In: VET-W-SABRE-IND-V80. Out:
  VET-W-EPEE-IND-V40, VET-W-EPEE-IND-V50.
- T8 Video Strip Preservation, −6 (61 → 55). In: VET-W-SABRE-IND-V70. Out:
  JR-W-EPEE-IND, JR-W-SABRE-IND, VET-W-FOIL-IND-V40, VET-W-FOIL-IND-V50,
  VET-W-FOIL-IND-V60, VET-W-SABRE-IND-V40, VET-W-SABRE-IND-V50.

Main to final on route A is −5: ten events go out (JR-M-EPEE-TEAM, JR-W-EPEE-IND,
JR-W-SABRE-IND, VET-W-EPEE-IND-V40, VET-W-EPEE-IND-V50, VET-W-FOIL-IND-V40,
VET-W-FOIL-IND-V50, VET-W-FOIL-IND-V60, VET-W-SABRE-IND-V40, VET-W-SABRE-IND-V50) and
five come in (D1-W-FOIL-TEAM, JR-M-FOIL-IND, JR-W-EPEE-TEAM, JR-W-FOIL-IND,
JR-W-FOIL-TEAM). On route C the steps are T4 +2, T6a −2 and T8 −2, so main to final is
60/6 → 58/8, and only the T8 step there matches the 1–2 events O14 named. Route B
places all 66 at every commit, and the one change is Suggest's 103 → 104 at T8.

### Chain of measurements

Oldest first. Counts come from each commit's message body, with `tmp/**` excluded.
"Unchanged" means equal to the row above.

| Step | Commit | Files / tests | Ledger SHA-256 | B1–B8 scheduled | ERRORs | `stripRecommendation` |
|---|---|---|---|---|---|---|
| Base | `5edbdf7712` (main) | 96 / 3252 | `32a4e0afb45a…` | 24/24/24/24/12/51/18/53 | 0/0/0/6/0/3/0/0 | 53/75/73/74/29/63/82/56 |
| Plan, O11 fold | `d558631116`, `59fc01b9e1` | 96 / 3252 (baseline recorded) | unchanged | unchanged | unchanged | unchanged |
| A0 | `121394c92a` | no run, METHODOLOGY only | unchanged | unchanged | unchanged | unchanged |
| T1a | `c4297a8bac` | 96 / 3247 | unchanged | unchanged | unchanged | unchanged |
| T1b-1 | `87292a868e` | 95 / 3171 | unchanged | unchanged | unchanged | unchanged |
| T1b-2 | `6bfdd597b4` | 95 / 3195 | unchanged | unchanged | unchanged | unchanged |
| T1c | `e2b940dbfd` | 95 / 3179 | `cf982410ce11…` | unchanged | unchanged | unchanged |
| T2 | `6207c03b5f` | 95 / 3182 | unchanged | unchanged | unchanged | unchanged |
| T3-1 | `1797945660` | 95 / 3196 | unchanged | unchanged | unchanged | unchanged |
| T3-2 | `7185168c98` | 95 / 3172 | unchanged | unchanged | unchanged | unchanged |
| T4 | `39c7145a63` | 95 / 3188 | `68e6e78c91e7…` | 24/24/24/24/12/**53**/18/53 | 0/0/0/6/0/**1**/0/0 | 53/75/**76**/74/**32**/**64**/82/56 |
| T6a | `bfdf295fca` | 96 / 3218 | `6854d2e0295f…` | unchanged | unchanged | unchanged |
| A1 | `cb4c8deeb9` | no run, METHODOLOGY only | unchanged | unchanged | unchanged | unchanged |
| T6b | `7c3bf6e61f` | 96 / 3220 | unchanged | unchanged | unchanged | unchanged |
| T6c | `0df58dee46` | 96 / 3250 | unchanged | unchanged | unchanged | unchanged |
| T7 | `8b23e1b964` | 96 / 3284 | `f3e220c8bc16…` | unchanged | unchanged | unchanged |
| T8 | `bad32530d9` | 97 / 3334 | `0ee11fbbff1c…` | unchanged | unchanged | 53/75/**79**/74/32/64/82/56 |
| T6a smoke | `fa6be94556` | 97 / 3334 | unchanged | unchanged | unchanged | unchanged |
| T5 | `0544ef1877` | 97 / 3349 | `5f0935202e54…` | unchanged | unchanged | unchanged |
| Task D | `edfe3addaf`, `ae3439b75a` | 97 / 3349, measured before the edits | unchanged | unchanged | unchanged | unchanged |
| Task H | – | no run | – | – | – | – |

What moved each SHA: T1c removed the `refRecommendation` digest field. T4 moved day
maps on six scenarios and B6's count. T6a moved B8's pool starts. T7 added two
`warnCountsByCause` lines (B4 1, B6 9), and with them removed the snapshot equals T6a's.
T8 re-timed B2, B3 and B8. T5 moved one 20-line hunk in B6.

### Test count chain

| Commit | Total | Δ | What |
|---|---|---|---|
| `5edbdf7712` (main) | 3252 | – | baseline |
| `c4297a8bac` T1a | 3247 | −5 | `keptRun.test.ts` builds a case per `TournamentConfig` field, and five fields left |
| `87292a868e` T1b-1 | 3171 | −76 | `daySequencing.test.ts` −14 (file deleted, 96 → 95 files), analysis −19, crossover −12, capacity −10, validation −6, typeDefaults −6, resources −4, dayHardEnd −2, keptRun −2, pools −1 |
| `6bfdd597b4` T1b-2 | 3195 | +24 | analysis Pass 1 board guard 19 and a synthetic override case 1, stripBudget 4 |
| `e2b940dbfd` T1c | 3179 | −16 | stripBudget −9 (the `recommendRefCount` describe), sizeableCount −7 |
| `6207c03b5f` T2 | 3182 | +3 | dayColoring +2 red cases, +8 native-day guards, +1 no-renumber case, −5 `capacityDemandedDays`, −2 expansion wiring, −1 chromatic floor |
| `1797945660` T3-1 | 3196 | +14 | concurrentScheduler +4, fix round +10 (PT-23 delay, pinned-path gap, strip-minimum tables, tie-break and WARN text) |
| `7185168c98` T3-2 | 3172 | −24 | sizeableCount −14, flighting −5, validation −2, keptRun −2, derive −1 |
| `39c7145a63` T4 | 3188 | +16 | `weaponBalancePenalty` 12, fix round 4 (one a board-level "no day holds one weapon class" over B1–B8) |
| `bfdf295fca` T6a | 3218 | +30 | `crossEventWaits.test.ts` (new, 95 → 96 files) 17 and 13 from the fix round. derived.test swaps one case for one |
| `cb4c8deeb9` A1 | 3218 | 0 | METHODOLOGY only |
| `7c3bf6e61f` T6b | 3220 | +2 | weights-only guard, no-fixed-offset scheduler pin |
| `0df58dee46` T6c | 3250 | +30 | placementRules +12, concurrentScheduler +2, dismissals +3, fix round +13 |
| `8b23e1b964` T7 | 3284 | +34 | dayHardEnd +12, findings +2, appPathParity +20 |
| `bad32530d9` T8 | 3334 | +50 | resources +19, `videoStripPreservation.test.ts` (new, 96 → 97 files) +23, strips +8 |
| `fa6be94556` T6a smoke | 3334 | 0 | driver only |
| `0544ef1877` T5 | 3349 | +15 | dayColoring +13, then the fix round −1 and +3 |
| Task D, Task H, A2 | 3349 | 0 | docs only |
| O15 removal (uncommitted when this row was written) | 3353 | +4 | dayColoring: −4 (two `it.each` blocks lose two rows each), +1 Div 3 test replacing the guard, +1 Y10 off-weapon guard, +1 sum over partners. crossover +6 (the Y10–Div 3 absence-of-rule guard, one row per tournament type) |

The deltas sum to 101 (3252 to 3353).

## Reviews

**Planning.** The audit ran 16 auditors and 16 adversarial verifiers, and where a
verifier corrected an item the correction won. The plan was read under four lenses
(owner rulings, engine mechanism, drift and ledger, UI and smoke), and each finding went
to a verifier: 48 findings (7 must-fix, 29 should-fix, 12 nits), of which 42 were
confirmed and 6 partly confirmed. None was refuted and all 48 were folded in whole or in
part. Plan §Plan review has the list and the parts declined. The owner reviewed the applied amendment in Plannotator, and the one
annotation became O11.

Each code task got drift judges of at most four items where the engine moved, a spec
review against the amended METHODOLOGY, and `test-quality-reviewer`. Control runs that
needed a code change ran in detached throwaway worktrees, each removed after.

- **T1a – pass, one should-fix fixed.** Four reviews (checks and counts, spec, diff
  against the plan, React file and comment wording). The spec review failed on the two
  "seven settings" comments overclaiming what T1a deleted, and they were reworded. No
  smoke, since nothing the app shows changed.
- **T1b-1 – pass, fixed but one item carried to T3.** Spec and ledger judge 3 nits, spec
  review 4 findings, test quality 6 (3 should-fix). The `bottleneckInvariants.ts`
  exemption whose only user was `flighting-group-strips` was carried to T3. No smoke.
- **T1b-2 – pass, one should-fix fixed.** An analysis-level Pass 1 case now kills each
  of three survivor mutants. Declined: computing Pass 1's cap once (beyond plan Note 5)
  and pinning how many boards fire at 20 strips. No smoke.
- **T1c – pass, 2 findings fixed.** A stale ledger comment and the body's baseline
  citation. No smoke.
- **T2 – 2 fails fixed.** The spec review failed on the header still opening "Two-phase
  DSatur". Test quality failed on a scheduler case that had gone vacuous and on two
  unpinned mutations: `maxPinnedDay` was deleted as dead and the no-renumber case
  pinned the other. One item declined. Smoke: two passes.
- **T3-1 – 2 must-fix and several should-fix fixed.** Test quality failed because
  PT-23 and the pinned-path gap had no failing test, and each mutation now fails a named
  test. The spec judge's two should-fix items (the pinned-path gap and a wrong section
  citation) were fixed. Smoke: two passes after the driver gained the flighting step.
- **T3-2 – pass.** Three comment items fixed, one declined (an inert `flighted: true`).
  Smoke: two passes, no driver change.
- **T4 – pass, every judge.** J1 (baseline reproduced, app path equals engine), J1b (an
  independent probe agrees), J2 (one-class days and the "keeps" reading), J3 (the
  term-off control is byte-identical to T3, so every moved day map is the term's) and J4
  (49 boards). Test quality ran 17 mutants, and the fix round closed the 3 survivors.
  Smoke: two passes, with one driver-selection repair in 016 check 2 and no pin moved.
- **T6a – 2 must-fix fixed.** J1 and J2 passed. The spec review found that a never-placed
  middle band made the younger band lapse to day start, fixed with `passOverFailed`.
  Test quality required the 60 and 120 minute values as literals in the tests, plus
  several new cases. Smoke: two passes, but the driver had no stagger step yet, so the
  store-path J2 (60 of 60 pairs ordered at 103 strips) stood in until `fa6be94556`.
- **T6b – pass.** J1, a spec review redefined by O13, and test quality. Smoke: two
  passes.
- **T6c – pass, 3 should-fix fixed.** J4 (500 unpinned probes, 0 splits), spec review,
  test quality (about 25 mutants) and a code review. Smoke: two passes with the new
  step, run by the implementer since that dispatch could not spawn agents.
- **T7 – pass, 3 should-fix and 2 nits fixed.** J1 (an independent probe lists the same
  1 and 9 events), spec review, and test quality, whose four survivors each now fail a
  test. Smoke: two passes with the new step.
- **T8 – pass, every judge.** J1, J1b (whole-result probe), J2 (16 boards through the
  store path, 0 late-pool-on-video violations from the engine, the pinned runs and the
  re-seater), spec review and test quality (19 mutants, 4 survivors each pinned in the
  fix round). Smoke: two passes with the new step, SC-008 updated to 104.
- **T6a smoke – pass.** Spec review, and a smoke judge whose mutant (every band waits on
  the oldest) failed 18 of 24 pairs. Controls with `VET_STAGGER_MINS` 0 and with the
  driver's constant at 600 each failed the step. Two items declined (pinning the 24-pair
  count, asserting a pair at exactly +60). Smoke: two passes.
- **T5 – pass, every judge.** J1, J2, J3 (a term-off control reproduces the old head
  exactly), J4 spec review and J5 test quality. The fix round added three tests and fixed
  two stale comments. Declined: swapped weights (an equivalent mutant while both are
  −0.3). Smoke: two passes.
- **Task S – pass.** Two consecutive full passes on `0544ef1877`, 0 console errors, no
  pin moved, no locator repaired. The two logs differ only in 020 R1's click-gap
  timings. The full check list is under `result.finalSmoke.details` in
  `<wt>/tmp/021-t5/workflow-result.json`.
- **Docs – four fact-checkers, defects fixed (`ae3439b75a`).** A must-fix on the
  medal-tail entry (two events now end past 22:00 only by the tail, four at the base),
  the Vet team entry's reach, the stagger entry's wording, the O14 entry's claim that the
  owner had accepted the 6-event cost, a new entry for the flighting suggestion text,
  the code leftovers' attribution, a line reference, and row 021's wording. Two declined:
  the forward reference to this handoff, and backlog bullets for T4's accepted effects,
  which this handoff carries instead.

## Decisions made on the owner's behalf

### Owner rulings

Full text in [`decisions.md`](./decisions.md), with the plan's table under §Owner rulings.

1. **2026-10-08, O1–O6.** O1 Vet bands start oldest first with a 60-minute stagger from
   the next-older band's pool start, and nobody waits for a band to finish. O2 the 4:00
   PM pool cutoff stays as Piste Planner's own unsourced rule, a WARN and never a move.
   O3 day assignment uses every chosen day, and the calibration scenario is not added.
   O4 weapon balance is day-level, genders and teams pooled, a flat 0.5. O5 any video
   strip count from 0 to the strip total at any type (doc only). O6 a same-day bonus for
   Y8↔Y10 and Y10↔Div 3 (O15 dropped the Div 3 half).
2. **2026-10-08, second round, O7–O10.** O7 weapon balance reads "keeps": no day holds
   only one weapon class. O8 a wait lapses when the event waited on never places. O9
   Y10↔Div 3 needs the same weapon and gender (moot since O15). O10 the board check emits the cutoff WARN
   for hand-moved events too.
3. **2026-10-08, O11** (the owner's annotation). Veteran bands are one event split by
   age, so the co-day is not a departure from the manual.
4. **2026-10-10, O12 and O13** (A1). The bonus is −0.3, the strongest value that loses
   no B1–B8 event (B6 places 51 at −0.4). The Vet Combined start offset is retired (B6
   places 53 only at offset 0).
5. **2026-10-10, O14** (during T8). Video Strip Preservation keeps `<=` at the wave's
   end, and METHODOLOGY does not change. The owner accepted the 1–2 events T8 Step 1
   measured on NAC Vet/Div1/Junior at 8 video strips. The cost at 12 video strips is 6,
   which is Owner question A.
6. **2026-10-11, O15** (after the merge-tree check). The owner on Y10 with Div 3: "we
   should remove it from the spec. We may be over correcting for that specific case when
   it is just an example". Events that share no fencers have no separation rule and no
   same-day bonus. A2 (`2f84c3e158`) carries the METHODOLOGY text, and the code and test
   change follows it (see the O15 section below). The Y8↔Y10 bonus (−0.3) is unchanged.

### Decisions the work made

Each with what it costs if wrong. Defaults 1–14 are in `decisions.md`, shown to the
owner in the amendment, and apply as written. Default 13 overrides the backlog's
"unused exports stay as evidence" for every symbol it names. Decisions 1–9 are the
plan's, which has them in full. 10 onward were made during implementation.

1. **Order A0 → T1 → T2 → T3 → T4 → T6 → T7 → T8 → T5 → S → D → H → M.** The plan put T5
   after T4, and O12 moved it last. Cost: T8 could and did move T7's counts (B8 gained 3
   cutoff WARNs).
2. **T1b, T3 and T6 split into commits, each with its own review and judges.** Cost: more
   commits and judge runs, each with a single cause.
3. **Smoke after every task that changes what the app shows, before its commit.** Cost:
   eleven smoke rounds of two passes each before Task S, and in return each pin move
   names its task.
4. **T4 raises the B6 floor to 53.** Cost: a later drop on B6 halts and needs the owner.
   None happened.
5. **O8, the lapse.** Cost: a permanently failed older band no longer orders the co-day,
   and a team whose individual fails starts as if it had none.
6. **The cutoff WARN is one pure function shared by the scheduler and the board.** Cost:
   none.
7. **T8's boundary.** Settled by O14 (`<=`). Cost: Owner question A.
8. **An older Vet band's retry may break the stagger.** Cost: Owner question B.
9. **`VET_STAGGER_MINS`, `POOL_START_AFTER_CUTOFF` and `VET_CO_DAY_SPLIT` are named
   constants and causes.** Cost: none.
10. **Inert test data stays** (T1a, T1b-1, T3-2): the `THRESHOLD_MINS` key, the `'AUTO'`
    ref policy and `'same-population:…'` strings in `serialization.test.ts`'s v2
    fixtures, and an unread `flighted: true` in `placementRules.test.ts`. Cost: a reader
    may take them for live data (backlog §Code leftovers from 021).
11. **`makeCompetition`'s default `ref_policy` became `RefPolicy.TWO`** when `AUTO` went
    (T1b-1). Cost: none, the behaviour is unchanged.
12. **`flagFlightingCandidates` checks the config's `MIN_FENCERS` and `MAX_FENCERS`,**
    the bounds Pass 1 already used, rather than `ENGINE_FENCER_BOUNDS`, which the plan
    did not name (T1b-2). It has its own red test. Cost: a config with unusual bounds
    changes which events are flagged.
13. **The tail constants moved into `types.ts`,** since `constants.ts` imports
    `types.ts` (T1b-2, the `DAY_AXIS_SPACING_MINS` precedent). Cost: two constants live
    outside `constants.ts`.
14. **T1c's snapshot was edited by script, not regenerated with `-u`,** so the diff
    proves only the field left. Cost: none.
15. **T2 removed the no-pins renumbering of used days and `maxPinnedDay`,** neither named
    by the plan, and kept `effectiveDays` as an unread count. Both removals were no-ops
    on every probed row. Cost: an unread return value (backlog).
16. **On a flighting tie the engine flights the later id, as before, and the WARN says
    the organizer picks** (T3-1). `calculateFlightedStrips` keeps its arithmetic and
    `FLIGHT_BUFFER_MINS` is marked unsourced. Cost: a tie's suggestion is arbitrary.
17. **T3-2 deleted `SAME_DAY_DEMOGRAPHIC_CONFLICT`,** which the plan did not name,
    because `validateFlightingGroup` was its only emitter. Cost: none.
18. **T4 re-measured 42 existing tests across 10 files** with dated entries, picking
    replacement events by exhaustive search where a premise broke. Cost: those pins now
    describe the post-T4 boards only.
19. **T4's effects marked "for the owner" are accepted, not fixed.** B5 gains a
    `day-pools-exceed-strips` WARN in Findings (Day 2, about 63 pools on 60 strips) and
    its finish moves 920 → 940, while it still places 12 with no ERROR. B7 day 0's sabre
    referee peak rises 64 → 156 because it now holds both Junior sabre events. The
    per-gender one-class day count over the templates re-measures at 52 against the
    probe's 40, because T1a–T3 changed the colouring (J4's control at `5edbdf7712`
    reproduces the probe), so on the templates that tiebreak no longer favours keeps.
    O7 chose keeps on pooled one-class days, which read 0. Cost: one more Warning on a
    youth board, a busier sabre day on B7, and a tiebreak that now reads the other way.
20. **The 016 check 2 smoke step loops over pairs** (T4). Cost: it needs at least one
    pair that reaches the not-honoured Warning, and it fails if none does.
21. **`VET_STAGGER_MINS` is a plain constant, not a `TournamentConfig` field** (T6a).
    Cost: the organizer cannot change it.
22. **B8's `SCHEDULE_ACCEPTED_WITH_WARNINGS` 3 → 2 was accepted** (T6a). The stagger
    lengthens B8's shortest middle day, which clears the first-day-longer-than-middle
    warning. The plan did not predict it. Cost: none, no floor or pin.
23. **`CATEGORY_START_PREFERENCE` keeps its name** though it holds weights only (T6b).
    Cost: a misleading name (backlog).
24. **The scheduler's split check counts an event that has a day but later fails, while
    the board's leaves unplaced events out** (T6c). Cost: after a failure the two can
    disagree on a split.
25. **`dayColoring.ts` keeps its own Vet band set** (T6c, declined as out of scope).
    Cost: two band sets to keep in step (backlog).
26. **The cutoff WARN is computed after the run, not inside an attempt, and is not
    filtered by an overrun ERROR** (T7). Cost: a late event can show both an overrun
    ERROR and a cutoff Warning. The plan's B6 estimate of 4 re-measured at 9 on the new
    head.
27. **T7 added an app-path parity test the plan did not ask for,** mirroring 018 R3. For
    16 of 18 boards it compares empty with empty. Cost: a slower suite by a few cases.
28. **T8 kept an earliest-next-start refinement beyond the plan's text.** A pool that
    misses inside the wave reports when enough general strips come free, per METHODOLOGY
    §Resource Windows. Measured neutral on every count, digest and pin. Cost: some extra
    code for fidelity and the deferral budget.
29. **T8 stores the day facts on `EventState.pool_video_day` and moved `clockAxisConfig`
    to `src/engine/types.ts`.** Cost: none found.
30. **T8's smoke step asserts pools starting strictly after 11:00,** not "at or after the
    window's end" as the plan's text said, because O14 fixed `<=`. Cost: none.
31. **The T6a smoke step was committed after T8** (`fa6be94556`), so its counts are T8's.
    The driver declares its own `VET_STAGGER_MINS`. Cost: the driver's 60 must follow the
    engine's by hand.
32. **T5 has two named weights, no event-type filter, and one bonus per partner,** so a Y10
    with both partners on its day earns −0.6. Cost: J2's synthetic oversubscribed board
    (NAC Youth, 2 days, 40 strips, Y8 and Div 3 clones) lost 3 events, and no template
    holds a Y8 or Div 3 today (backlog).
33. **Measured pins re-taken with dated `[M]` entries,** following T4's precedent, in T6a
    (refs, unseated, segments, derived), T8 (unseated, `stripSearch` T033, segments,
    SC-008) and T5 (unseated pin-half B6 8 → 9). Cost: none, each names its cause.
34. **Plan Note 6: 020's blocking-error hold and the "Re-run automatically" switch stay
    out of METHODOLOGY.** Cost: the spec says Auto-assign re-runs after every
    edit to an engine input, but it does not mention 020's hold while a blocking error
    shows or the "Re-run automatically" switch. Those two are recorded only in 020's
    handoff and the workbench design.

Deliberate corrections recorded in commit bodies: T1b-1's `invalidState` expects 3
items, and three examples moved from same-population to team-requires-individual. T2's
two scheduler cases moved to `days_available: 1`. T3-1's segments, viewEquivalence and
strips pins each moved 15 minutes earlier, re-derived by hand. T4's 42 re-measured
tests (decision 18). T6a's derived first-day case moved from B8 to B2. The pins in
decision 33.

## Left unfixed

Every leftover has a backlog entry, indexed under
[backlog §What 021 deliberately left unfixed](../../docs/design/backlog.md#what-021-deliberately-left-unfixed):
fifteen bullets, ten of them new entries, four of them owner calls (Owner questions A
to D). The handoff does not restate them.

### For later features

022 and 023 measure against the numbers in Measurements. On top of 020's rules (020
handoff, For later features), which still hold:

- **The ledger moved.** B6's floor is 53. `stripRecommendation` is now reported by every
  drift review's J1, at 53 / 75 / 79 / 74 / 32 / 64 / 82 / 56.
- **Day colouring has two more terms,** weapon balance and the same-day bonus. A new term
  churns most day maps, so attribute drift by mechanism with a term-off control in a
  throwaway worktree, as T4's J3 and T5's J3 did.
- **Cross-event waits go through `crossEventWaits.ts`.** A new wait between events is a
  `CrossEventWait` built in `applyCrossEventEdges` and stored on `EventState`, and
  `assertEveryEventResolved` throws after the loop if any event is left held.
- **The ind→team wait holds a team's first phase, which is its pools today.** The cutoff
  WARN reads an event's first pool phase (`flight_a_start ?? pool_start`) and skips an
  event with no pool start. Video Strip Preservation applies to pool phases only
  (`POOLS`, `FLIGHT_A`, `FLIGHT_B`). 023 removes the team pool round, so each of these
  needs a decision for teams.
- **Two new rule ids,** `pool-start-after-cutoff` and `vet-co-day-split`, each with a
  `CAUSE_OF_RULE` row. `vet-co-day-split` is in `UNDISMISSABLE_RULES` beside
  `hard-separation-violated`.
- **The smoke driver's SC-008 pin is 104** at 12 video strips. Its T6a stagger step runs
  inside the T6c block before the split move, and the T8 step unpins JR-W-SABRE-IND
  after moving it back. Keep both orders.
- **The B1 preset sets 12 video strips and templates keep them,** so a template measured
  from a fresh store (8 video strips at a NAC) is not what an organizer sees.

## Merge

`git merge-tree --write-tree main 021-methodology-reconciliation` gives tree `dbdaa0b26c`
with no conflicts. That equals the branch tree at `66ef5c3996`, because `main` has not
moved from `5edbdf7712`, the commit 021 was cut from and also the merge-base. On that tree
the full suite reads 97 files / 3349 tests, `tsc -b` and lint are clean, and the ledger
SHA-256 is still
`5f0935202e54521e555d3d8feace4172d955a292ed8bce2a9c13e21a7d478341`. Task S's two smoke
passes ran on `0544ef1877`. Everything after it is docs, except the O15 removal below,
which changed no UI and no ledger byte and was not smoked.

That check ran before O15, so the merge tree changed with the O15 commit and the
check above describes the earlier tree. Re-run `git merge-tree` and the suite, `tsc -b`
and lint on the new tree before merging. At the O15 head (measured in the worktree before
its commit) the suite reads 97 files / 3353 tests, `tsc -b` and lint are clean, and the
ledger snapshot is byte-identical.

Merge with `merge-with-costs` (never squash).

### O15 – Y10 with Div 3 dropped (2026-10-11)

The owner said the Y10 and Div 3 pairing was only an example of unrelated events and that
021 over-corrected by scoring it. A2 (`2f84c3e158`) carries the METHODOLOGY text: the
Y10↔Div 3 rows left §Other Soft Preferences and Appendix A, and the "Y10 with Div 3"
departure left Appendix B. The code change removes `PENALTY_WEIGHTS.Y10_DIV3_SAME_DAY`
(`PENALTY_WEIGHTS` now has 10 keys) and its `SAME_DAY_BONUS_PAIRS` row, so Y8↔Y10 at −0.3
is the only same-day bonus. O9 is moot. Measured:

- B1–B8 scheduled 24/24/24/24/12/53/18/53, ERRORs 0/0/0/6/0/1/0/0, `stripRecommendation`
  and floors unchanged, and the ledger SHA-256 `5f0935202e54…` byte-identical, since no
  scenario or template holds a Div 3 event.
- Red first: against HEAD's `src`, the new `dayColoring.test.ts` gave 3 failures and 97
  passes ("expected -0.3 to be +0", the sweep listing `DIV3+Y10=-0.3`, and "expected
  -0.6 to be close to -0.3"). The summation test was checked by mutation: replacing the
  running total with a first-match return fails it.
- `dayColoring.test.ts` 104 → 102 tests and `crossover.test.ts` gains 6, so 97 files /
  3349 → 3353 tests.
- Not smoked: no UI changed and the smoke holds no Div 3 event.
- Docs corrected: `docs/design/backlog.md` and `docs/design/methodology-reconciliation.md`,
  `decisions.md` (O15 added, O6, O9, O12 annotated) and `plan.md` (O15 row, T5 correction).

## Resume prompt (after the merge)

```text
Piste Planner. Feature 021 (METHODOLOGY reconciliation) is delivered and merged
into main, and its record is specs/021-methodology-reconciliation/handoff.md.

Next is roadmap feature 023, team events go straight to DE:
docs/design/competition-planner-workbench.md §The finish line, row 023 and
§023 scope, then docs/design/backlog.md §"Team events are scheduled with a pool
round". 022 (release housekeeping) is marked "last" and the roadmap runs 023
before it, so 023 is the next row.

Step one is the owner's METHODOLOGY.md amendment, before any code. The spec
assumes every event has a pool round, and the 023 scope names the sections to
amend: §Outputs, §Single-Day Fit, §Resource Preconditions, §Team Events Cannot
Use Cuts, §Individual/Team Separation, §Concurrent Phase Scheduler, §Phase 2:
Pre-Scheduling Analysis, §Phase 5: Resource Allocation, §Strip Count Suggestion
and §Strip-Hour Capacity. Draft the amendment, show it to the owner on an
applied copy (021 used Plannotator), and commit it only after the owner
approves it, as 021's A0 did. METHODOLOGY.md is the spec: where it and the
engine disagree, the engine is wrong by default. Three 021 rules read a team's
pool round and need the owner's word for a team with none: the 120-minute
individual-to-team wait holds a team's first phase, the 4:00 PM cutoff WARN
reads the first pool phase and skips an event with no pool start, and video
strip preservation applies to pool phases only. The file and line references in
the 023 scope and its backlog entry predate 021, which edited most of those
files, so re-locate them. If the owner has answered 021's Owner question A by
reopening O14, that change comes first.

Measure against the ledger 021 left: B1-B8 scheduled 24 / 24 / 24 / 24 / 12 /
53 / 18 / 53 (B6 floor 53), ERRORs 0 / 0 / 0 / 6 / 0 / 1 / 0 / 0,
stripRecommendation 53 / 75 / 79 / 74 / 32 / 64 / 82 / 56, snapshot SHA-256
5f0935202e54521e555d3d8feace4172d955a292ed8bce2a9c13e21a7d478341, 97 files /
3353 tests (after O15), boot footers 24/0, 24/0, 24/0, 24/6, 12/0, 53/1, 18/0, 53/0. The
023 scope expects B1, B2 and B8 to move and B3-B7 to hold. The smoke's SC-008
Suggest for NAC Vet/Div1/Junior reads 104. 020's and 021's rules for later
features hold (021 handoff, For later features).

Start from the main checkout. Cut a fresh worktree off main, named for its
branch (023-...), and drive it from the main checkout with absolute paths
(git -C <wt>, pnpm -C <wt>). Never cd. Plan 023 yourself: choose the planning
approach and keep the constitution's guardrails (drift ledger, test-first, live
smoke, git ownership). The user merges with merge-with-costs and makes the
closing commit with commit-with-costs. Agents commit only inside the worktree,
and never push, merge or make the closing commit.
```
