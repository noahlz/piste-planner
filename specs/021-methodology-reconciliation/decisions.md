# 021 decisions – shared brief for the amendment and plan drafters

Base: `main` at `5edbdf7712`, worktree `/Users/noahlz/projects/piste-planner/.claude/worktrees/021-methodology-reconciliation`
(branch `021-methodology-reconciliation`). METHODOLOGY.md line numbers below are at the base.
Audit record (32 agents, 16 groups, each verified): [`audit.md`](./audit.md) beside this file – per item `status`,
`evidence`, `doc_change`, `engine_change`, `owner_question`, and the verifier's `correction`. Where a verifier
CORRECTED an item, the correction wins.

Baseline measured 2026-10-08 in the worktree: 96 files / 3252 tests, `tsc -b` and lint clean, ledger snapshot
SHA-256 `32a4e0afb45abfbf8239f7bdbc15dda9eb1487c959893442b6029a6d0998b260`, B1–B8 scheduled
24/24/24/24/12/51/18/53, ERRORs 0/0/0/6/0/3/0/0, boot footers 24/0, 24/0, 24/0, 24/6, 12/0, 51/3, 18/0, 53/0.

## Owner rulings, 2026-10-08 (this session)

- **O1 – Vet co-day order.** Age-banded Vet bands of one gender and weapon start oldest first with a 60-minute
  stagger: each younger band's pools become ready 60 minutes after the next-older band's pools start. Nobody waits
  for another band to finish – strict end-to-end serialization is gone from the spec. Unsourced: the one reference
  found describes 2026 NAC Vet events "on the same day with different start times". The 2-hour start offset
  (METHODOLOGY :899, :1100) applies to Vet Combined only, which never shares the co-day. Vet 60/70/80 lose it,
  because on the co-day it would start the older bands after the younger ones. The wait must really bind (today
  `predecessorReadyTime` skips an unplaced predecessor, so 0 of 60 B8 pairs are ordered and 21 start younger first).
- **O2 – 4:00 PM pool cutoff.** No current USA Fencing source states it (2026-27 Ops Manual, 2019 Ops Manual and
  2026-27 Athlete Handbook searched – the only clock time is Ops Manual p.17's "should complete no later than 7 p.m.
  if started by 9 a.m."). It comes from the owner's PRD of 2026-03-24 ("Latest start | 4:00 PM – no competition may
  begin after this", Flight B exempt). Keep it as Piste Planner's own rule, listed in Appendix B as unsourced. An
  event whose first pool phase (its pools, or Flight A) starts later than day start + 7 hours (4:00 PM on a 9:00 day)
  is placed with a WARN carrying the start. No event is dropped or moved for it.
- **O3 – Day count.** Day assignment uses every day the organizer chose. Delete the inert "fewest days" Phase 1
  pass, `chromaticN`, `capacityDemandedDays`, `CAPACITY_TARGET_FILL` and `MAX_EXPANDED_DAYS`; effective days =
  `days_available`. The backlog §Calibration debt scenario is not added: it presupposed a pass that never worked.
  Close the item with a written record (the audit measured that no fill value changes any B1–B8 board, and that all
  eight already run above their chromatic number). Expected: ledger byte-identical at 2–4 days.
- **O4 – Weapon balance.** Day-level, events of both genders and team events pooled, flat 0.5, delta form: an event
  that brings the missing weapon class (ROW = foil and sabre, versus épée) to a one-class day earns −0.5, and one
  that keeps a day one-class costs +0.5. Skip the term when the tournament lacks one class entirely. Drop
  "proportional to competition size". Probe: clears every one-class day on B1–B8, B6 places 53 (from 51).
  Measure single-class days on the scheduled output, not the coloring (B4's 6 ERRORed events hide three).
- **O5 – Video strip count.** Any count from 0 to the strip total, at any tournament type, default 8 at a NAC.
  Amend METHODOLOGY :51 and :1077 (they say NAC-only, 4/8/12/16). At non-NAC types video strips are best-effort.
  No engine or UI change.
- **O6 – Y8 with Y10.** A −0.4 same-day bonus for Y8↔Y10 of the same weapon and gender, and the same bonus for
  Y10↔Div 3 (METHODOLOGY :167 "preferred" – the Div 3 half was removed on 2026-10-11, O15). Spec-wins: :164 says Y8 CAN and SHOULD share a day with Y10.
  The constraint graph drops weight-0 edges, so the term needs its own lookup. Moves day assignment on B3, B4, B6.

## Owner rulings, 2026-10-08 (second round)

- **O7 – Weapon balance reads "keeps".** The owner: "whichever option avoids having a day where only epee is
  scheduled on that day (we need to balance ROW weapons with epee)". The goal is that no day holds only one weapon
  class. An event that leaves its day one-class costs +0.5 (the first event on an empty day, and every later
  same-class event on a day that still holds one class), an event that brings the missing class earns −0.5, and an
  event on a day holding both classes costs 0. O4's delta wording above is replaced. A probe of 49 boards (B1–B8,
  and each of the 10 templates at NAC 4 days, ROC 4 days and its `TEMPLATE_MIN_DAYS`) found no all-épée pooled day
  under any variant. Pooled one-class days: no term 7 (all ROW), delta 1 (a ROW day it creates on RJCC Weekend at
  ROC 4 days), keeps 0, so keeps wins, narrowly. Delta was ahead on the next tiebreak, which was not reached
  (per-gender one-class days 34 against 40). Neither reading lowers a B1–B8 count. Under keeps, scheduled B1–B8 =
  24/24/24/24/12/53/18/53 and ERRORs = 0/0/0/6/0/1/0/0: only B6 moves (51/3 → 53/1). Keeps also clears B7's all-ROW
  day 3 and leaves B2 identical to baseline. Full table in `plan.md` §Measurements.
- **O8 – An unplaced predecessor.** When the event waited on (an older Vet band, or a team event's individual
  counterpart) is never placed, the wait lapses: the waiting event's pools are ready as if it did not exist, from
  day start or from any other floor that applies to it, such as the regional Group 1 window. One identical clause
  goes into amendment Blocks 44, 88, 83 and 66, and T6a's release follows it.
- **O9 – Y10↔Div 3.** The bonus needs the same weapon and gender, as drafted. *Moot since 2026-10-11: O15 removed the bonus.*
- **O10 – The cutoff on the board.** The store's board check emits `pool-start-after-cutoff` for engine-placed and
  hand-moved events, as drafted. T7 builds both the engine WARN and the store board check, test-first, and the
  smoke asserts the Findings row.
- **O11 – The Veteran co-day is not a departure** (the owner's annotation on the applied amendment). Veteran age
  bands are one Veteran event split into sub-events by age band, not separate age groups, so Ops Manual p.20 – Group 1
  bullet 2's adjacent-age rule never applies to them and the bands always share a day. Amendment Blocks 90 and 85
  say so and drop the co-day from §Departures From the Manual, and Block 3 retitles the Appendix B entry to the
  stagger, which stays Piste Planner's own unsourced rule. No engine change. Amendment Blocks 44, 88, 83 and 66 carry
  O8's clause after the renumbering.

## Owner rulings, 2026-10-10 (third round, METHODOLOGY follow-up "021 A1", `cb4c8deeb9`)

Both rulings change approved values after measurement showed them costing events on B6. A1 carries the text.

- **O12 – The Y8↔Y10 same-day bonus is −0.3** (it covered Y10↔Div 3 too until O15), not O6's −0.4. Probe at `39c7145a63` (T4): B6
  places 53 events at −0.05 through −0.3 and 51 at −0.4, so −0.3 is the strongest value that loses no event on
  B1–B8. The other −0.4 values (proximity one day apart, Ind+team day after, Vet Combined day-after bonus) are
  unchanged. T5 runs last, at −0.3.
- **O13 – The Vet Combined start offset is retired**, so no Veteran event has a fixed start offset (O1 had already
  removed it from Vet 60/70/80). Probe: B6 places 52 at offsets of 60–120 minutes, 51 at 30, and 53 only at 0.
  Vet Combined starts like every other event and still never shares the age-banded co-day. T6b becomes a pure
  removal: `CATEGORY_START_PREFERENCE` drops its never-read `earliest_start_offset` field and keeps its weights,
  and no engine code applies a Veteran start offset.

## Owner ruling, 2026-10-10 (fourth round, during T8)

- **O14 – Video Strip Preservation keeps `<=` at the wave's end**, as the amendment says ("a pool phase that starts
  at exactly 11:00 AM is still in the wave"), so METHODOLOGY does not change. T8 Step 1 measured both boundaries on
  B1–B8 and the four NAC templates at T7's head `8b23e1b964`. Every board tied on counts except NAC Vet/Div1/Junior
  (NAC, 4 days, 80 strips, the default 8 video strips): base 60 placed / 6 ERRORs, `<=` 58/8 (video delay 1525
  min), `<` 59/7 (1245 min). Totals over the 12 boards: base 364/13, `<=` 362/15, `<` 363/14. `<` also raised B2's
  video delay 225 → 705 and NAC Youth's 1365 → 1515, and lowered it on B7 (450 → 260). The owner accepts the events the rule costs that template,
  since templates carry no floor.
- **Measured after the ruling, for the owner (T8 fix round):** the same template loaded as `unseated.test.ts` and
  `strips.test.ts` load templates (B1 preset, then the template: 80 strips, 12 video strips, 4 days) goes 61/5 →
  55/11 under `<=`, 6 events net, more than the 1–2 the ruling named. Out: JR-W-EPEE-IND, JR-W-SABRE-IND,
  VET-W-FOIL-IND-V40, VET-W-FOIL-IND-V50, VET-W-FOIL-IND-V60, VET-W-SABRE-IND-V40, VET-W-SABRE-IND-V50. In:
  VET-W-SABRE-IND-V70. The other three NAC templates hold 24/0 on both routes, and B1–B8 do not move. No floor
  applies, so this stands under O14 unless the owner reverses it.
- **Open owner question – re-measured 2026-10-11 at the final head `0544ef1877`, commit by commit (Task D).** O14
  named 1–2 events, and the route an organizer takes costs more. Through the app path (`bootstrap` for B1, then
  `applyTemplate('NAC Vet/Div1/Junior')`, then `runScheduleAll`; the B1 preset sets 12 video strips and the template
  keeps them) main places 60 and leaves 6, and the final head places 55 and leaves 11, so 5 events net (10 out, 5
  in). The route series is 60 (main through T3-2), 62 (T4, +2), 61 (T6a, −1), 61 (A1 through T7), 55 (T8, −6) and 55
  (the smoke commit and T5). T8 alone costs 6 on this route. On the 8-video-strip route that T8 Step 1 measured
  (fresh store, NAC, 4 days, 80 strips) the series is 60, 62 (T4), 60 (T6a), 58 (T8), so T8 costs 2 there and that
  is the figure O14 named. After Suggest and Apply every row places 66 of 66, at 103 strips on main and 104 at T8
  and after, so the cost to an organizer who applies Suggest is one strip. The owner decides whether the 6-event
  cost reopens O14, and until then it stands. The numbers are in backlog §Video strip preservation costs NAC
  Vet/Div1/Junior events.

Standing owner decisions: the eight time-of-day weights are retired as Phase D casualties (2026-10-04); no hard
pair is ever relaxed (019); no backwards compatibility (product unreleased); the engine follows the 2026-27 Ops
Manual's planning figures; METHODOLOGY.md is the spec and every text change is owner-approved before commit.

## Defaults the plan takes on the owner's behalf (the owner sees each in the amendment and the plan)

Each follows a reconciliation verdict, the spec-wins rule, or an earlier owner ruling.

1. **Time-of-day retirement (W1–W4).** Delete METHODOLOGY :245–246 and replace them with one live bullet: two
   crossover events on one day add their crossover-graph weight (dayColoring.ts colorPenalty). Delete §Early-Start
   Conflicts :248–252, the :290 row, Appendix A rows :988–994 and :1003, and Timing rows :1026–1027. Add a
   "Retired time-of-day preferences" record at the end of §Soft Preferences naming the eight (including "or with
   the team first"), the two windows, and the reason (day assignment picks days before any time exists, and the
   concurrent scheduler allocates greedily without weighing penalties). Name where the live parts are: per-day
   crossover, the 120-minute ind→team edge, Y8/Y10 first pick, the regional Group 1 window. Re-point :817 and
   :1120 to §Within-Day Priority Order and cite Ops Manual p.20 – Group 2 there (Y10 early, Y8 a departure).
   Delete the five orphan BottleneckCause members of these rules. Delete the 8 keys, `SAME_TIME_WINDOW_MINS`,
   `EARLY_START_THRESHOLD` and their TournamentConfig fields.
2. **Relaxation text (RX1–RX4, 019 Left-for-021 items 1–7, 9, 10).** Replace §Constraint Relaxation :308–322 with a
   short section (rename it, e.g. "When Days Are Too Few", and fix the TOC :19 and every anchor): hard rules block a
   day outright and soft weights only rank days, so nothing is relaxed. When every day is blocked for an event, day
   assignment places it on the least-bad day (today the first tied day) and emits one WARN
   `UNAVOIDABLE_CROSSOVER_CONFLICT` (rule `hard-separation-violated`) per broken pair, and a split Vet co-day draws
   its own WARN (default 9). Scheduling continues. Describe today's behaviour – do not promise the better fallback
   backlog §Runtime failure is terminal records as unbuilt. Fix :86 (validation rules that stop scheduling are a
   different set from the day rules – get the list right per the RX2.1 verifier), :90 ("hard at every tournament
   type"), :283 and :995 and :150 (name the cross-level ind/team exception), :284–285 and :996 (drop "suppressed
   at level >= 2"), :694 ("constraint-relaxing"), :733. Add the WARN to the §Bottlenecks list :678–688. Fix the four
   source comments (crossover.ts:134, dayAssignment.ts:5, concurrentScheduler.ts:742, constants.ts:437–440).
3. **Code pointers (PT-1 … PT-21, PT-23).** Fix every stale pointer the G05 audit lists, without line numbers so
   they cannot rot. Use PhaseKind names (`POOLS`, `FLIGHT_A → FLIGHT_B`, `DE_PRELIMS → DE_R16`, `DE_SINGLE`).
4. **Contradictions.** C1 and L2 (DOC-WRONG, the rejection is recorded at dayColoring.ts:93–97): §Capacity Penalty
   Curve :901–912 states the running curve (0 up to fill 0.85, linear to 3.0 at 1.0, then 3.0 + 10 per unit of fill
   past 1.0, capped at 20.0), says it applies in the load-balancing pass, and records the rejected 0.60-start curve;
   Appendix A :1102 gets the values. Delete the five unread `CAPACITY_PENALTY_CURVE` members and name the live
   numbers. C2: comment fix in constants.ts only. C3: drop "replaces old 200+ fencer rule" at :1076. C8/PT-19:
   delete the FINALS_ONLY row :957. C10: rewrite :3 and :694 to describe the app as it is (the organizer moves
   events to days, which pins them; hand moves are checked at once against the hard same-day pairs, the regional
   window, first/last-day length and late or overrun finishes; Auto-assign re-runs around the pins after every edit
   to an engine input).
5. **L10 (DOC-WRONG, reasoned code comment at constants.ts:432–435).** Veteran → Div 1 is 0.1. Do not cite B8 as
   evidence (B8 separates Div 1 from Vet in 5 of 6 groups). XE: keep the four graph examples – they are graph
   weights – and add a line that Group 1 pairs are not scored by the graph (hard at NAC, SYC, SJCC; the Regional
   Group 1 pair penalty at ROC, RYC, RJCC), and that soft separations override it.
6. **L11a (DOC-WRONG).** Drop "smaller events get priority to start" (:392); larger-first stands (§Within-Day
   Priority Order). **L11b (ENGINE-WRONG).** The flighted day-start affinity (:393) becomes a comparator key: Flight A
   nodes after Y8/Y10 first and before video-required; add it to §Within-Day Priority Order.
7. **L12.** Rewrite §Phase 3 :714–725: day assignment colors by DSatur (most saturated first, then most hard-edge
   neighbours, then largest packing footprint); within a day the order is §Within-Day Priority Order, where the
   constraint score is a tie-break; list its factors; drop "mandatory before optional" and "flighting pairs kept
   together" (both only in the dead daySequencing.ts). Fix :729 and :733.
8. **Individual/team same-day gap (SC3, PT-24, L13, 019 item 8).** 120 minutes, same-category pairs only – the pair
   can share a day only through a pin or the least-bad fallback – and the wait must really bind. Rewrite :299–302
   (drop "4-hour separation required", the Vet-team/Div 2 example and "soft") and Appendix A :1085 "(non-hard-blocked
   pairs)". :174 (Single-Day Fit's ind+team clause) is reworded to the same case. :672 "resolves them lazily" is
   rewritten to say how the waits bind.
9. **Vet co-day split (R7b, item 9).** When a pin or the least-bad fallback splits an age-banded Vet co-day, the
   engine and the hand-placement check emit a WARN with a new rule id (e.g. `vet-co-day-split`), not dismissable,
   like the other hard breaks. Check the final day map, pins included.
10. **Single-Day Fit (C7a, V2, V2b, SEV).** Delete `validateSameDayCompletion` and its tests. §Single-Day Fit :171–174
    says the limit is enforced when phases are placed (`SAME_DAY_VIOLATION`, two-attempt retry), not in Phase 1.
11. **Video (V26, V27a, V27b).** V26 ENGINE-WRONG, scoped by the spec's own :496: Video Strip Preservation applies
    on days that hold a REQUIRED (NAC staged) video phase – pools may use video strips only in the start-of-day wave
    (`MORNING_WAVE_WINDOW_MINS` = 120 from day start), or all day on a single-event day; elsewhere video strips stay
    available as today. State the window and its boundary in the doc; the engine task measures `<` against `<=`
    and reports before choosing. The pinned-pool path and the canvas re-seater (`src/layout/strips.ts`) follow the
    same rule. V27a: retire the peak-concurrent video-demand penalty (:914–918, and the budget clauses at :875 and
    :881) as a Phase D casualty – peak demand needs start times that day assignment does not have. Keep analysis
    Pass 4's post-assignment WARN. V27b: :920–922 states that a video block holds its min(4, bracket ÷ 2) strips
    through the semis (since 024 the ask is at most 4, so release would free 2), matching :559.
12. **Flighting (SC1, SC1b, SC1c, PT-6, PT-22, PT-23, L15, R4, V1).** :379 says flights are tracked. The suggestion
    flights the larger event (:391, :857 – spec-wins, fix `suggestFlightingGroups` and `calculateFlightedStrips`
    order). The suggestion stays advisory text (it reaches Findings through `initialAnalysis`). Flighting is an
    organizer toggle the engine suggests (:62). Flight A → Flight B gap is `FLIGHT_BUFFER_MINS` (15 min), the
    flight-specific rule (:401, :656); :748 and :1023 exempt it from the admin gap. `FLIGHT_B_DELAYED` measures from
    Flight B's own ready time (fixes the false WARN on uncontended events). L15: the strip minimum halves for an
    event that splits into flights. R4: the app cannot form a flighting group since 013, so delete the group
    execution path (`flighting_group_id`, `is_priority`, the `flighting-group-strips` rule, `validateFlightingGroup`
    and the enum members only it emits, group branches in derive and the scheduler) – no back-compat. Wire
    `flagFlightingCandidates` into analysis Pass 1 (the doc says the engine calls it; fix its signature in the doc).
    **Correction (2026-10-08, amendment Note 2):** the flighting suggestion does not reach Findings. Nothing
    outside analysis.ts reads `suggestions`, and Findings show only `analysis.warnings`. The amendment names the
    WARNs instead (Blocks 59, 40 and 32), and showing the suggestion text is a UI change outside 021.
13. **Dead code (G07–G09).** Delete `daySequencing.ts` and its test (and `Competition.optional`, read only there),
    `MAX_RESCHEDULE_ATTEMPTS`, `THRESHOLD_MINS` (amend :578 to the live one-shot `STRIP_CONTENTION`, matching :688),
    `LATEST_START_MINS` (O2 uses the offset), the `LAST_DAY_REF_SHORTAGE_*` trio, `proximityPenalty` with
    `PROXIMITY_PENALTY_WEIGHTS` (:269 points at `PENALTY_WEIGHTS.PROXIMITY_*`), `individualTeamProximityPenalty`,
    `SchedulingError`, `isRegionalQualifier` with `REGIONAL_QUALIFIER_TYPES`, `genderEquityAllowableDiff` with its
    cause, `dayRemainingCapacity`, `weightedStripHours`, `peakConcurrentStrips`, `findDayForTime`, every never-emitted
    BottleneckCause / Phase member, `de_round_of_16_requirement` with `DeStripRequirement`, `conflict_score` and
    `accepted_warnings`, `validateRefConfig`, the unreachable `same-population` count rule, `RefPolicy.AUTO` (L16:
    drop the Auto bullet, "set by type" not "defaulted"), `recommendRefCount` (its own commit: the ledger digest loses
    `refRecommendation`, so the snapshot SHA changes while every scheduling number stays). Wire `INDIV_TAIL_MINS` and
    `TEAM_TAIL_MINS` into `tailEstimateMins`. This overrides backlog.md:1554–1560's "unused exports stay as evidence"
    for these symbols: each one's doc rule is retired, re-pointed, or matched by live code – record it there.
14. **Other doc fixes.** R2: :699 says a per-event ERROR excludes that event and any other ERROR aborts. R3: :203 says
    a cut on a team event is ignored with a WARN. R5: describe the feasibility WARN under Warning-Level Rules with the
    unsourced 1.15 slack in Appendix A. SC2: :216 and :224 wording ("the video stage"). UV1c: move start time and
    latest end out of per-competition options into a per-day input. :54 states 2–4 days as the offered range and that
    saved files accept 1–14 with a WARN outside 2–4. :1093–1100 and :891–899 gain a Y8 row (weight 1.0) and lose the
    Vet 60/70/80 offset (O1). PT-18/CAL-DOC: replace the :871 Phase D note with the O3 policy. L5a: :839–849 gain
    the ceiling bullet and say "general strip-hours" for the floor.

## Not in 021 (each has its own backlog entry, left as is)

`cut-value-min-promotions` reading a percentage inverted (backlog §`validation.ts` reads a percentage cut…),
`regional-cut-override` for non-store callers, `strips-total-positive` on NaN, the medal-tail WARN entries
(backlog §The late-day WARN adds the medal tail… and §Events end past 22:00 only by their medal tail),
the better least-bad fallback (§Runtime failure is terminal), the R6 clique WARN (declined by 019's R3 – mark
settled).

## Owner ruling, 2026-10-11 (fifth round, after the merge-tree check)

- **O15 – Y10 with Div 3 is dropped.** The pairing was only an example of unrelated events, and 021 over-corrected
  by scoring it. The owner: "we should remove it from the spec. We may be over correcting for that specific case
  when it is just an example". Events that share no fencers, such as Y10 and Div 3, have no separation rule and no
  same-day bonus, so day assignment places them by its other terms (load and weapon balance). A2 (`2f84c3e158`)
  carries the METHODOLOGY text: the Y10↔Div 3 rows left §Other Soft Preferences and Appendix A, and the "Y10 with
  Div 3" departure left Appendix B. The code drops `PENALTY_WEIGHTS.Y10_DIV3_SAME_DAY` and its
  `SAME_DAY_BONUS_PAIRS` row. The Y8↔Y10 bonus (−0.3, O6, O12) is unchanged. O9 is moot. No B1–B8 scenario or
  template holds a Div 3 event, so the drift ledger stays byte-identical.
