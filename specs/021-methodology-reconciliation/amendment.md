# 021 METHODOLOGY amendment – draft for the owner's approval

Reconciles METHODOLOGY.md with the owner's rulings O1–O11 of 2026-10-08 (O7–O10 from the second round of answers, O11 from the owner's review annotation) and the fourteen defaults the 021 plan takes on the owner's behalf. Task A0 commits the approved text verbatim, alone, before any code.

Line numbers are `METHODOLOGY.md` at `5edbdf7712`, before any edit. The blocks are numbered in the order A0 applies them, bottom of the file first, so every line number holds when its block is applied. A block whose After is empty deletes its Before lines. A block whose After repeats its Before and adds lines inserts new text after that line.

## What this amendment does

- **O1 – Vet co-day order.** Age-banded Vet bands start oldest first with a 60-minute stagger, and nobody waits for another band to finish. Strict end-to-end serialization is gone. The 2-hour start offset stays with Vet Combined only. The stagger is listed as unsourced.
- **O2 – 4:00 PM pool cutoff.** An event whose first pool phase starts later than day start + 7 hours is placed with a `pool-start-after-cutoff` WARN, never dropped or moved. Flight B is exempt. A new §Pool Start Cutoff and an Appendix B entry call it Piste Planner's own rule, unsourced.
- **O3 – Day count.** Day assignment uses every day the organizer chose. The inert "fewest days" pass and its constants are recorded as removed under a new §Day Count.
- **O4 – Weapon balance.** The goal is that no day holds only one weapon class. A flat day-level term, both genders and team events pooled, skipped when a tournament lacks one class. "Proportional to competition size" is dropped. O7 settles the reading.
- **O5 – Video strip count.** Any count from 0 to the strip total at any type, 8 by default at a NAC, and best-effort elsewhere.
- **O6 – Y8 with Y10.** A -0.4 same-day bonus for Y8↔Y10 and for Y10↔Div 3 of the same weapon and gender.
- **O7 – Weapon balance reads "keeps".** The owner asked for "whichever option avoids having a day where only epee is scheduled on that day (we need to balance ROW weapons with epee)". Every event that leaves its day one-class costs +0.5, not only the first one on an empty day, and bringing the missing class earns -0.5. Over 49 boards (B1–B8 and the ten templates) no reading left an épée-only day, and "keeps" left 0 one-class days against 1 for the delta form and 7 with no term (Blocks 69, 16, 14).
- **O8 – An unplaced predecessor.** When the event waited on is never placed, the wait lapses. One identical clause closes the wait in Blocks 44, 88, 83 and 66.
- **O9 – Y10↔Div 3.** Same weapon and gender, as drafted.
- **O10 – The cutoff on the board.** The store's board check emits `pool-start-after-cutoff` for engine-placed and hand-moved events, as drafted (Blocks 99, 42, 76 and 43).
- **O11 – The Veteran co-day is not a departure.** From the owner's review annotation: Veteran age bands are one Veteran event split into sub-events by age band, not separate age groups, so Ops Manual p.20 – Group 1 bullet 2's adjacent-age rule never applies to them and the bands always share a day. Block 90 states this in §Veteran Age-Group Co-Day Rule, Block 85 drops the co-day from §Departures From the Manual, and Block 3 retitles its Appendix B entry to the stagger, which stays Piste Planner's own unsourced rule.
- **Defaults 1–14.** The eight time-of-day preferences are deleted and recorded under a new §Retired Time-of-Day Preferences (1). §Constraint Relaxation becomes §When Days Are Too Few: nothing is relaxed, an event with every day blocked takes the least-bad day, and each broken hard pair or split Vet co-day draws a WARN (2, 9). Stale code pointers are fixed without line numbers (3). The intro and §Scheduling Algorithm describe the app as it is, and the capacity curve states the running values and records the rejected one (4). Veteran → Div 1 is 0.1, and Group 1 pairs are not scored by the crossover graph (5). Larger events go first, and Flight A gets its own within-day priority key (6). §Phase 3 describes DSatur day order and the constraint score as a tie-break (7). The 120-minute individual→team wait applies to same-category pairs only (8). Single-Day Fit is enforced when phases are placed (10). Video strip preservation applies only on days with a `REQUIRED` video phase, the peak-concurrent video budget is retired, and a video block holds its strips through the semis (11). The larger event is the one to flight, flighting is an organizer toggle, the flight buffer replaces the admin gap, and flighting groups are gone (12). Pointers to deleted code are removed or re-pointed (13). Validation outcomes, cut handling, the feasibility WARN, per-day start and end times, the 2–4 day range, the Y8 weight row and the Strip Count Suggestion ceiling are corrected (14).

## Review record

Seven Opus drafters each wrote one cluster (K1–K7) from [`decisions.md`](./decisions.md) and the 32-agent audit ([`audit.md`](./audit.md)), and seven independent checkers reviewed them against the base and the source. Revisers took the checkers' corrections. A cross-cluster critic then read all seven together and raised 16 findings (3 must-fix, 8 should-fix, 5 nits) and 4 missing items. All were taken: the weapon-balance wording now uses the delta form in both places, the flighting suggestion text no longer claims to reach Findings, the morning-wave boundary reads the same in both places, the per-event validation ERRORs include the cut values, the hard-pair WARN for a pin is credited to the hand-placement check only, Appendix B gains the Vet Combined offset and the crossover graph weights, the Y8↔Y10 value is marked unsourced, the intro matches §Scheduling Algorithm on re-runs, two §Video Replay Policy lines are brought in line with O5, and the §Flighting heading becomes "Flighting Pair Suggestion". `tmp/021-amend/apply.py` (run with `python3 -I`) parses every block, checks that each Before occurs exactly once in the base, applies all blocks to a copy and checks every `(#anchor)` link against the copy's heading slugs. Result: 97 blocks, 0 unmatched, 0 overlaps, 0 broken anchors, base 1137 lines, amended 1190 lines. The plan review (recorded in `plan.md`) then added the cutoff to the four lists of what a hand move is checked against (Open item 7) and reworded the lapse clause offered in Open item 3. The re-run gave the same counts. The owner's second round (O7–O10) then rewrote Block 69 and the Appendix A row in Block 16 to the "keeps" reading, put the lapse clause into Blocks 44, 88, 83 and 66, and retired the first round's Open items 1, 3 and 7. The re-run again gave 97 blocks, 0 unmatched, 0 overlaps and 0 broken anchors. The owner reviewed the applied copy in Plannotator and annotated one line, which became O11 (two blocks added, one rewritten). The final run gives 99 blocks, 0 unmatched, 0 overlaps and 0 broken anchors, base 1137 lines, amended 1189 lines.

## Notes for the owner

The owner answered Open items 1, 3 and 7 of the first draft as O7, O8 and O10. Each note below is settled by the default it describes unless the owner objects. The note numbers are the first draft's item numbers.

- **Note 2 – Default 12's premise.** [`decisions.md`](./decisions.md) says the flighting suggestion "reaches Findings through `initialAnalysis`". In the source nothing outside analysis.ts reads `suggestions`, and Findings show only `analysis.warnings`. Default: the text names the WARNs instead (Blocks 59, 40 and 32), and Findings do not show the suggestion text. Showing it is a UI change outside 021, and those three blocks would change together.
- **Note 4 – The morning-wave boundary is provisional.** Both §Video Strip Preservation (Block 52) and the Timing Constants row (Block 10) say a pool phase starting at exactly day start + 120 min is in the wave. Default: `<=`, as written. The V26 engine task measures `<` against `<=` first, and if `<` wins both change together.
- **Note 5 – `flagFlightingCandidates` signature (Block 63).** Default: the engine adopts the doc's `(competitions, config)` and computes each event's cap inside, because the per-event override and analysis Pass 1 are per-event today.
- **Note 6 – Re-runs.** The intro (Block 99) and §Scheduling Algorithm (Block 42) say Auto-assign re-runs after every edit to an engine input. Default: feature 020's hold while a blocking error shows and its "Re-run automatically" switch stay out of the doc. If the owner wants them, the same clause goes into both.

## Block 1 – Appendix B – Departures, :1124

Sources (cluster block K7-18): O2; default 11; default 12; default 8; default 14; audit AX-CUTOFF, K2, R5, PT-22, V26, SC3

Before:
~~~
- **Refs per pool.** The manual states no refs-per-pool count and links a separate Referee Requirements document instead (Ops Manual p.19). The per-type values in [Refs Per Pool](#refs-per-pool-input-that-affects-the-output) are unsourced.
~~~

After:
~~~
- **Refs per pool.** The manual states no refs-per-pool count and links a separate Referee Requirements document instead (Ops Manual p.19). The per-type values in [Refs Per Pool](#refs-per-pool-input-that-affects-the-output) are unsourced.
- **Pool-start cutoff.** No USA Fencing source sets a latest pool start – the only clock time in the Ops Manual, on p.17, is "should complete no later than 7 p.m. if started by 9 a.m." Piste Planner keeps its own rule, unsourced, from the owner's requirements of 2026-03-24: an event whose first pool phase (its pools, or Flight A) starts later than day start + 7 hours (4:00 PM on a 9:00 AM day) is placed with a WARN (`pool-start-after-cutoff`) carrying the start, and no event is dropped or moved for it (see [Pool Start Cutoff](#pool-start-cutoff) and [Timing Constants](#timing-constants)).
- **Feasibility slack.** The whole-tournament strip-hour WARN tolerates demand up to 15% over capacity before it fires, because the estimate is a worst case that overlaps scheduling slack. The 1.15 figure is Piste Planner's own, unsourced (see [Strip-Hour Feasibility](#strip-hour-feasibility)).
- **Timing allowances.** No USA Fencing source gives the 15-minute wait from Flight A's end to Flight B's ready time, the 120-minute start-of-day pool wave that may use video strips, or the 120-minute wait between an individual event and its team event when the two share a day. All three are Piste Planner's own, unsourced (see [Timing Constants](#timing-constants) and [Resource Constants](#resource-constants)).
- **Vet Combined start offset.** No USA Fencing source gives Vet Combined a 2-hour start offset from day start (medication timing for older athletes). It is Piste Planner's own rule, unsourced. The age-banded Vet 60, 70 and 80 events no longer carry it, because on their shared co-day it would start the older bands after the younger ones (see [Age-Category Weights](#age-category-weights) and [Veteran Age-Group Co-Day Rule](#veteran-age-group-co-day-rule)).
- **Crossover graph weights.** The fractions in [Demographic Crossover](#demographic-crossover) are Piste Planner's own estimates, unsourced.
~~~

## Block 2 – Appendix B – Departures, :1120

Sources (cluster block K7-17): default 1; audit W1, C6

Before:
~~~
- **Y8 in Y10's early-start and video tiers.** Ops Manual p.20 – Group 2 asks for Y10 events early in the day, and p.19 lists Y10, not Y8, in the round-of-8 video tier. The spec gives Y8 the same early-start preference as Y10 and, at a NAC, the same round-of-8 video stage.
~~~

After:
~~~
- **Y8 in Y10's early-start and video tiers.** Ops Manual p.20 – Group 2 asks for Y10 events early in the day, and p.19 lists Y10, not Y8, in the round-of-8 video tier. The spec gives Y8 the same first pick of the day's strips as Y10 (the Y8/Y10 key of [Within-Day Priority Order](#within-day-priority-order)) and, at a NAC, the same round-of-8 video stage.
~~~

## Block 3 – Appendix B – Departures, :1113

Sources (cluster block K7-16): O1; O11 (owner annotation, 2026-10-08); audit R9, DS-EDGE, L13, L8

Before:
~~~
- **Veteran age-group co-day.** Ops Manual p.20 – Group 1 keeps immediately adjacent age groups off the same day. The spec puts every age-banded Veteran individual event of one gender and weapon on one day, oldest first (see [Veteran Age-Group Co-Day Rule](#veteran-age-group-co-day-rule)). Staffing, referees and venue setup are coordinated per weapon and gender, and nested age eligibility means one fencer often enters several of these events.
~~~

After:
~~~
- **Veteran co-day stagger.** The age-banded Veteran events of one gender and weapon share a day, and that is not a departure: they are one Veteran event split into sub-events by age band, so Ops Manual p.20 – Group 1 bullet 2's adjacent-age rule does not apply to them (see [Veteran Age-Group Co-Day Rule](#veteran-age-group-co-day-rule)). On that day the bands start oldest first with a 60-minute stagger: each younger band's pools become ready 60 minutes after the next-older band's pools start, and no band waits for another to finish. The order and the stagger are Piste Planner's own rule, unsourced – the one reference found describes the 2026 NAC Veteran events as held "on the same day with different start times".
~~~

## Block 4 – Appendix B – Departures, :1112

Sources (cluster block K7-15): O6; audit L9b

Before:
~~~
- **Y8 with Y10.** Ops Manual p.20 – Group 1 keeps immediately adjacent age groups off the same day. The spec says Y8 CAN and SHOULD share a day with Y10, and Y8–Y10 is not a Group 1 pair (see [Overlapping-Population Separation (Group 1)](#overlapping-population-separation-group-1)).
~~~

After:
~~~
- **Y8 with Y10.** Ops Manual p.20 – Group 1 keeps immediately adjacent age groups off the same day. The spec says Y8 CAN and SHOULD share a day with Y10, and Y8–Y10 is not a Group 1 pair (see [Overlapping-Population Separation (Group 1)](#overlapping-population-separation-group-1)). Day assignment gives Y8 and Y10 of the same weapon and gender a same-day bonus (see [Appendix A](#appendix-a-penalty--constant-defaults)). The bonus value, -0.4, is Piste Planner's own, unsourced.
- **Y10 with Div 3.** No USA Fencing source asks for it. The spec gives Y10 and Div 3 of the same weapon and gender a same-day bonus, because no fencer enters both. Piste Planner's own rule, unsourced.
~~~

## Block 5 – Capacity Model Constants, :1102

Sources (cluster block K7-14): O3; default 4; default 14; audit C1, L2, AX-CAPCURVE, R5

Before:
~~~
| Capacity penalty thresholds | [TBD] | Fill-ratio thresholds for penalty curve |
~~~

After:
~~~
| Capacity penalty curve | 0 up to fill 0.85, linear to 3.0 at fill 1.0, then 3.0 + 10 per unit of fill past 1.0, capped at 20.0 | Penalty on a candidate day's strip-hour fill, one of day assignment's load-balancing terms, beside the flat per-event cost (see [Capacity Penalty Curve](#capacity-penalty-curve)) |
| Load-balance fullness | 0.5 per event | `LOAD_BALANCE_FULLNESS` in [`dayColoring.ts`](src/engine/dayColoring.ts): a flat penalty per event already on a candidate day, one of day assignment's load-balancing terms beside the capacity curve |
| Feasibility slack | 1.15 | `FEASIBILITY_SLACK` in [`validation.ts`](src/engine/validation.ts): a whole-tournament strip-hour estimate, general and video, draws a WARN when demand exceeds days × strips (video strips for the video check) × day length by more than 15%. It names the extra days or strips and never stops scheduling (see [Strip-Hour Feasibility](#strip-hour-feasibility)). Unsourced (see [Appendix B](#appendix-b-departures-from-the-operations-manual)) |
~~~

## Block 6 – Capacity Model Constants, :1099–1100

Sources (cluster block K7-13): O1; default 14; audit L8, AX-MATCH

Before:
~~~
| Veteran 40/50 weight | 0.8 | Lighter weight, no start offset |
| Veteran Combined/60/70/80 weight | 0.6 | Lightest; 120-min start offset from day start |
~~~

After:
~~~
| Veteran 40/50 weight | 0.8 | Lighter weight |
| Veteran 60/70/80 weight | 0.6 | Lightest weight. No start offset – the co-day stagger orders the age bands (see [Veteran Age-Group Co-Day Rule](#veteran-age-group-co-day-rule)) |
| Veteran Combined weight | 0.6 | Lightest weight, with a 120-min start offset from day start. Vet Combined never shares the age-banded co-day. Unsourced (see [Appendix B](#appendix-b-departures-from-the-operations-manual)) |
~~~

## Block 7 – Capacity Model Constants, :1096

Sources (cluster block K7-12): default 14; audit AX-MATCH

Before:
~~~
| Y10 weight | 1.2 | Strip-hour multiplier |
~~~

After:
~~~
| Y10 weight | 1.2 | Strip-hour multiplier |
| Y8 weight | 1.0 | Baseline weight |
~~~

## Block 8 – Resource Constants, :1085

Sources (cluster block K7-11): default 8; audit SC3, PT-24, L13, W3

Before:
~~~
| Ind/team separation gap | 120 min | Minimum gap between individual and team (non-hard-blocked pairs) |
~~~

After:
~~~
| Ind/team separation gap | 120 min | A team event's first phase waits this long after its individual counterpart's last phase ends (same category, gender and weapon) when a pin or the least-bad fallback puts the two on one day (see [Cross-Event Dependency Edges](#cross-event-dependency-edges)). Unsourced (see [Appendix B](#appendix-b-departures-from-the-operations-manual)) |
~~~

## Block 9 – Resource Constants, :1076–1077

Sources (cluster block K7-10): O5; default 12; audit C3, AX-VIDEO

Before:
~~~
| Flighting threshold | n_pools > pool_strip_cap (default 80% of strips) | Strip-budget trigger; replaces old 200+ fencer rule |
| Video strip options | 4, 8, 12, 16 | Available video strip counts (NACs only). 8 is default, enough for two video stages at once |
~~~

After:
~~~
| Flighting threshold | n_pools > pool_strip_cap (default 80% of strips) | Strip-budget trigger for the flighting suggestion. Flighting itself is the organizer's toggle |
| Video strip count | 0 to the strip total – default 8 at a NAC, 0 elsewhere | Any count at any tournament type. The NAC default of 8 lets two video stages run at once. At types other than NAC video strips are best-effort |
~~~

## Block 10 – Timing Constants, :1025–1027

Sources (cluster block K7-09): default 1; default 11; default 12; default 13; O1; audit PT-21, PT-22, AX-DEADCFG, K1, K3, V26, DS-EDGE, R9. Provisional, as K4-10 is: the inclusive boundary ("that minute included") waits on the V26 engine task's `<` against `<=` measurement (default 11) – if `<` wins, this row and K4-10 both change to "before day start + 120 min (11:00 AM excluded)" in the same edit

Before:
~~~
| FLIGHT_BUFFER_MINS | 15 min | Buffer between flighted flights |
| THRESHOLD_MINS / EARLY_START_THRESHOLD | 10 min | Bottleneck detection threshold / early start window |
| SAME_TIME_WINDOW_MINS | 30 min | Window for same-time crossover penalty |
~~~

After:
~~~
| FLIGHT_BUFFER_MINS | 15 min | Flight B becomes ready this long after Flight A ends, in place of the admin gap (see [Runtime Decomposition](#runtime-decomposition)). Unsourced (see [Appendix B](#appendix-b-departures-from-the-operations-manual)) |
| MORNING_WAVE_WINDOW_MINS | 120 min | Start-of-day pool wave: a pool phase that starts no later than day start + 120 min (11:00 AM on a 9:00 AM day, that minute included) is in it. On a day that holds a `REQUIRED` video phase, pools may use video strips only inside it, or all day on a single-event day (see [Video Strip Preservation](#video-strip-preservation)). Unsourced (see [Appendix B](#appendix-b-departures-from-the-operations-manual)) |
| Vet co-day stagger | 60 min | On an age-banded Veteran co-day, each younger band's pools become ready 60 min after the next-older band's pools start. No band waits for another to finish (see [Veteran Age-Group Co-Day Rule](#veteran-age-group-co-day-rule)). Unsourced (see [Appendix B](#appendix-b-departures-from-the-operations-manual)) |
~~~

## Block 11 – Timing Constants, :1022–1023

Sources (cluster block K7-08): O2; default 12; default 13; audit AX-CUTOFF, K2, P2a, PT-22

Before:
~~~
| Pool-round cutoff | 4:00 PM (960 min) | Pool rounds cannot start after this time. Unsourced – the 2026-27 manual sets no cutoff |
| Admin gap | 30 min | Mandatory gap between a phase and its successor (see [Phase 5](#phase-5-resource-allocation)). Its floor is the results-review period between rounds (Ops Manual p.18 – 15 min national, 10 regional, 5 local). No gap is added between the DE rounds inside one DE phase – the strip changeover is part of the DE bout time |
~~~

After:
~~~
| Pool-start cutoff | Day start + 7 hours (`LATEST_START_OFFSET`, 420 min – 4:00 PM on a 9:00 AM day) | An event whose first pool phase (its pools, or Flight A) starts later is placed with a WARN (`pool-start-after-cutoff`) carrying the start. No event is dropped or moved for it, and Flight B is exempt. Piste Planner's own rule, unsourced (see [Pool Start Cutoff](#pool-start-cutoff) and [Appendix B](#appendix-b-departures-from-the-operations-manual)) |
| Admin gap | 30 min | Mandatory gap between a phase and its successor (see [Phase 5](#phase-5-resource-allocation)). Its floor is the results-review period between rounds (Ops Manual p.18 – 15 min national, 10 regional, 5 local). No gap is added between the DE rounds inside one DE phase – the strip changeover is part of the DE bout time. Flight A → Flight B (`FLIGHT_A → FLIGHT_B`) is exempt and takes `FLIGHT_BUFFER_MINS` instead |
~~~

## Block 12 – Timing Constants, :1016

Sources (cluster block K7-07): O2; default 14; audit UV1c

Before:
~~~
| Day start | 9:00 AM (540 min) | Earliest pool round start (Ops Manual p.17) |
~~~

After:
~~~
| Day start | 9:00 AM (540 min) | Each day's earliest pool round start, editable per day (Ops Manual p.17). The pool-start cutoff is measured from it |
~~~

## Block 13 – Penalty Weights, :1010

Sources (cluster block K7-06): default 1; audit W4

Before:
~~~
| Ind/team cross-level block | ∞ | **Hard block** at every type: Div 1 ind ↔ Junior team and Junior ind ↔ Div 1 team, same weapon+gender, must be on different days (Ops Manual p.20 – Group 1 bullet 1). Hard at ROC, RYC and RJCC (departure) |
~~~

After:
~~~
| Ind/team cross-level block | ∞ | **Hard block** at every type: Div 1 ind ↔ Junior team and Junior ind ↔ Div 1 team, same weapon+gender, must be on different days (Ops Manual p.20 – Group 1 bullet 1). Hard at ROC, RYC and RJCC (departure) |

The eight time-of-day weights this table once listed are retired (see [Retired Time-of-Day Preferences](#retired-time-of-day-preferences)).
~~~

## Block 14 – Penalty Weights, :1007

Sources (cluster block K7-05): O4; O6; O7; O9 (Y10↔Div 3 same weapon and gender, as drafted); audit WB, L9b

Before:
~~~
| Ind+team day after | -0.4 | **Bonus**: team event the day after individual |
~~~

After:
~~~
| Ind+team day after | -0.4 | **Bonus**: team event the day after individual |
| Weapon balance, missing class | -0.5 | **Bonus**: an event that brings the missing weapon class to a one-class day. Skipped when the tournament has no event of one class |
| Y8↔Y10 same day | -0.4 | **Bonus**: Y8 and Y10 of the same weapon+gender on the same day. Y8 with Y10 is a departure (see [Appendix B](#appendix-b-departures-from-the-operations-manual)) |
| Y10↔Div 3 same day | -0.4 | **Bonus**: Y10 and Div 3 of the same weapon+gender on the same day – no fencer overlap. Unsourced (see [Appendix B](#appendix-b-departures-from-the-operations-manual)) |
~~~

## Block 15 – Penalty Weights, :1003

Sources (cluster block K7-04): default 1; audit W1, PW, C6

Before:
~~~
| Y8/Y10 non-first-slot | 0.3 | Y8/Y10 event not starting at day start (Ops Manual p.20 – Group 2 names Y10, and including Y8 is a departure) |
~~~

After: nothing – the Before lines are deleted.

## Block 16 – Penalty Weights, :999–1000

Sources (cluster block K7-03): O4; O7 (the keeps reading); audit WB, PW, C4

Before:
~~~
| Team before individual | 1.0 | Team event scheduled before its individual counterpart |
| Weapon balance | 0.5 | All-ROW or all-epee day |
~~~

After:
~~~
| Team before individual | 1.0 | Team event on the day before its individual counterpart (Vet Combined on the day before its age-banded co-day is priced the same). Two or more days before falls to the Ind+team 2+ days apart row |
| Weapon balance | 0.5 | Day-level penalty, so that no day holds only one weapon class: +0.5 when the event leaves its day one-class – ROW (foil and sabre) only, or épée only – whether the day was empty or already held that class alone, and 0 on a day that already holds both classes. Both genders and team events count together. Skipped when the tournament has no event of one class (see [Weapon Balance](#weapon-balance)) |
~~~

## Block 17 – Penalty Weights, :988–996

Sources (cluster block K7-02): default 1; default 2; audit W1, PW, C4, SC3, K1, K3, RX3, RX2.4, L3

Before:
~~~
| Same-time high crossover (≥0.8) | 10.0 | Two high-overlap competitions within 30-min window on same day |
| Same-time low crossover | 4.0 | Two low-overlap competitions within 30-min window on same day |
| Ind+team same-time or wrong order | 8.0 | Individual and team event (same demographic) overlapping or team scheduled first |
| Ind+team gap < 120 min | 3.0 | Individual and team event too close together |
| Early start consecutive days, high crossover | 5.0 | Two high-overlap events both at day start on back-to-back days |
| Early start same day, high crossover | 2.0 | Two high-overlap events both at day start same day |
| Early start consecutive days, ind+team | 2.0 | Ind + team (same weapon+gender+category) both at day start on consecutive days |
| Regional Group 1 pair | 5.0 | ROC, RYC and RJCC only: a Group 1 pair, Div 1–Cadet included, with the same weapon+gender on the same day (Ops Manual p.20 – Group 1) |
| Soft separation (DIV1↔DIV2, DIV1↔DIV3) | 3.0 | Same weapon+gender on same day, suppressed at level ≥ 2 |
~~~

After:
~~~
| Regional Group 1 pair | 5.0 | ROC, RYC and RJCC only: a Group 1 pair, Div 1–Cadet included, with the same weapon+gender on the same day (Ops Manual p.20 – Group 1). Div 1 ind ↔ Junior team and Junior ind ↔ Div 1 team are the exception and stay hard at every type (see Ind/team cross-level block below) |
| Soft separation (DIV1↔DIV2, DIV1↔DIV3) | 3.0 | Same weapon+gender on same day |
~~~

## Block 18 – Appendix A, :982

Sources (cluster block K7-01): default 3; audit PT-20

Before:
~~~
(see [`dayAssignment.ts`](src/engine/dayAssignment.ts), [`crossover.ts`](src/engine/crossover.ts), [`constants.ts`](src/engine/constants.ts))
~~~

After:
~~~
(see [`dayColoring.ts`](src/engine/dayColoring.ts) and [`crossover.ts`](src/engine/crossover.ts) for where the penalties apply, [`constants.ts`](src/engine/constants.ts) for the values, and [`dayAssignment.ts`](src/engine/dayAssignment.ts) for the saber-pileup table)
~~~

## Block 19 – Video Policy Interaction, :957

Sources (cluster block K6-13): default 4 (C8/PT-19); audit C8, PT-19

Before:
~~~
| `FINALS_ONLY` | Operationally identical to `BEST_EFFORT` — there is no `de_finals` phase to scope video to. The enum value is **preserved for save-file compatibility** with schedules saved before the stop-at-semis change. |
~~~

After: nothing – the Before lines are deleted.

## Block 20 – Video Policy Interaction, :955

Sources (cluster block K6-12): default 3; audit PT-8

Before:
~~~
| `REQUIRED` | Every individual event at a NAC (Ops Manual p.19). Allocates video strips for the video-stage phase (`r16`), from the video-stage round through the semis. Gold/bronze video is found ad-hoc. |
~~~

After:
~~~
| `REQUIRED` | Every individual event at a NAC (Ops Manual p.19). Allocates video strips for the video-stage phase (`DE_R16`), from the video-stage round through the semis. Gold/bronze video is found ad-hoc. |
~~~

## Block 21 – Referee Coverage, :949

Sources (cluster block K6-11): default 13; audit (checker missing item – no audit doc_change)

Before:
~~~
Gold and bronze referee demand is **not** modeled as discrete `RefDemandInterval`s. The peak-demand sweep covers only the scheduled phases (pools through semis). Gold/bronze ref needs — along with cancellations and lunch coverage — are absorbed by the staffing-recommendation buffer applied at the UI/suggestion layer. Organizers should not interpret the reported peak as the total refs needed for the full day; a modest buffer (typically 2–4 refs) should be held in reserve for gold/bronze coverage.
~~~

After:
~~~
Gold and bronze referee demand is **not** modeled as discrete `RefDemandInterval`s. The peak-demand sweep covers only the scheduled phases (pools through semis), and Piste Planner does not add the gold and bronze bouts, cancellations or lunch coverage to it. Organizers should not read the reported peak as the total refs needed for the full day, and should hold a modest reserve (typically 2–4 refs) for gold/bronze coverage.
~~~

## Block 22 – Scheduler Stops at Semis, :932

Sources (cluster block K6-10): default 3; audit PT-8

Before:
~~~
The scheduler's terminal DE phase is the **video-stage phase** (`r16`, from the video-stage round through the semis) for Staged (NAC) events and the equivalent final allocated round for Single-Stage events. It does **not** allocate strips, refs, or time windows for the gold medal bout or the bronze (third-place) bout.
~~~

After:
~~~
The scheduler's terminal DE phase is the **video-stage phase** (`DE_R16`, from the video-stage round through the semis) for Staged (NAC) events and the single DE phase (`DE_SINGLE`, through the semis) for Single-Stage events. It does **not** allocate strips, refs, or time windows for the gold medal bout or the bronze (third-place) bout.
~~~

## Block 23 – Staged DE Strip Release, :922

Sources (cluster block K6-09): default 11 (V27b); audit V27b

Before:
~~~
For NAC staged DEs, each round from the video-stage round through the semis (R16 → QF → SF, or QF → SF for a round-of-8 video stage) runs in sequence on video strips and then releases them. Freed strips become available to other events on the same day, so multiple events can share a video strip pool without serializing their entire DE phase.
~~~

After:
~~~
For NAC staged DEs, the video block holds its `min(4, bracketSize / 2)` video strips from the video-stage round through the semis (R16 → QF → SF, or QF → SF for a round-of-8 video stage) and releases them all when the semis end. The rounds shrink as they go, but a block asks for at most 4 strips, so releasing strips round by round would free at most 2, at the semis (see [DE Phase Breakdown](#de-phase-breakdown-for-staged-des)). Other events on the same day run their video blocks on the remaining video strips, or wait until a block ends.
~~~

## Block 24 – Video-Strip Budget, :914–918

Sources (cluster block K6-08): default 11 (V27a, V27b); audit V27a (verifier correction), V27b

Before:
~~~
### Video-Strip Budget

For day-assignment scoring, video strip capacity is tracked separately from general strip-hours. This budget governs how many staged-DE events a day can support; it does not prevent the runtime allocator from spilling non-video work onto idle video strips (see [Video Strip Preservation](#video-strip-preservation)).

Peak concurrent demand is modeled: as staged DE rounds progress (R16 → QF → SF, or QF → SF for a round-of-8 video stage), earlier rounds release their video strips and those strips become available to other events. If peak demand exceeds 70% of the video strip total, a moderate penalty (5.0) is applied, and at 100% of capacity the penalty rises to 15.0.
~~~

After:
~~~
### Retired Video-Strip Budget

The spec once had day assignment score a video-strip budget: the peak concurrent video-strip demand of a day's staged DEs, with a moderate penalty (5.0) above 70% of the video strip total and 15.0 at 100%. It is retired as a Phase D casualty. Peak demand needs start times, and day assignment picks days before any start time exists. The model also assumed that each round released its video strips as it finished, which a video block does not do (see [Staged DE Strip Release](#staged-de-strip-release)).

Day assignment has no video term. Once days are assigned, a WARN (`day-video-demand-exceeds-video-strips`) fires on any day whose staged video events outnumber its video strips (see [Phase 2: Pre-Scheduling Analysis](#phase-2-pre-scheduling-analysis)).
~~~

## Block 25 – Capacity Penalty Curve, :903–912

Sources (cluster block K6-07): default 4 (C1, L2); audit C1, L2, AX-CAPCURVE, D2e (each with verifier notes)

Before:
~~~
The day-assignment penalty for capacity fill ratio:

| Fill ratio | Penalty |
|---|---|
| < 0.60 | 0 — no penalty |
| 0.60–0.80 | Gentle ramp from 0 to 3.0 |
| 0.80–0.95 | Steep ramp from 3.0 to 10.0 |
| > 0.95 | 20.0 — strongly discouraged |

This is added to the existing soft-preference penalty total, so a nearly-full day is penalized heavily even when it has no crossover or separation issues.
~~~

After:
~~~
Day assignment adds a capacity penalty for a candidate day's fill ratio: the weighted general strip-hours on the day (see [Age-Category Weights](#age-category-weights)) divided by the day's capacity, which is a middle day's strip-hours times the first/last day factor where that applies (see [First and Last Day Capacity](#first-and-last-day-capacity)).

| Fill ratio | Penalty |
|---|---|
| ≤ 0.85 | 0 – no penalty |
| 0.85–1.0 | Linear ramp from 0 to 3.0 |
| > 1.0 | 3.0 plus 10 per unit of fill past 1.0, capped at 20.0 (reached at a fill of 2.7) |

The penalty belongs to day assignment's load-balancing terms, beside a flat 0.5 for each event already on the day (`LOAD_BALANCE_FULLNESS`). Both add to the soft-preference penalty total, so a nearly full day is penalized heavily even when it has no crossover or separation issues. (see [`dayColoring.ts`](src/engine/dayColoring.ts) – `capacityPenalty`, `colorPenalty`)

**Rejected: a curve that starts at 0.60.** An earlier curve charged nothing below a fill of 0.60, ramped gently to 3.0 at 0.80 and steeply to 10.0 at 0.95, and charged 20.0 above that. It over-steered events away from mid-loaded days and caused regressions in large multi-day tournaments, where several days naturally fill to 0.6–0.8 (recorded 2026-04-21 in the comment on `capacityPenalty` in `dayColoring.ts`). Ramping near 1.0 aims at the real failure – packing a day past its strip-hour capacity.
~~~

## Block 26 – Age-Category Weights, :894–899

Sources (cluster block K6-06): O1; default 1; default 14; audit AX-MATCH (verifier correction), L8 (verifier correction), C6

Before:
~~~
| JUNIOR, CADET | 1.3 | Heavy — video DE, large fields, early start |
| Y10 | 1.2 | Early start required |
| Y12, Y14 | 1.0 | Baseline |
| VET 40, VET 50 | 0.8 | Lighter; no start offset |
| DIV1A, DIV2, DIV3 | 0.7 | Lighter; can start early |
| VET Combined, VET 60, VET 70, VET 80 | 0.6 | Lightest; 2-hour start offset (medication timing for older athletes) |
~~~

After:
~~~
| JUNIOR, CADET | 1.3 | Heavy – video DE, large fields |
| Y10 | 1.2 | Early start required |
| Y8 | 1.0 | Baseline. It starts early with Y10 (see [Within-Day Priority Order](#within-day-priority-order)) but carries no extra weight. Including Y8 is a departure (see [Appendix B](#appendix-b-departures-from-the-operations-manual)) |
| Y12, Y14 | 1.0 | Baseline |
| VET 40, VET 50 | 0.8 | Lighter; no start offset |
| DIV1A, DIV2, DIV3 | 0.7 | Lighter |
| VET 60, VET 70, VET 80 | 0.6 | Lightest, with no start offset. They share the age-banded co-day with Vet 40 and Vet 50, oldest first, and an offset would start the older bands after the younger ones (see [Veteran Age-Group Co-Day Rule](#veteran-age-group-co-day-rule)) |
| VET Combined | 0.6 | Lightest, with a 2-hour start offset from day start (medication timing for older athletes – unsourced, see [Appendix B](#appendix-b-departures-from-the-operations-manual)). Vet Combined never shares the age-banded co-day |
~~~

## Block 27 – Strip-Hour Capacity, :881

Sources (cluster block K6-05): default 11 (V27a); audit V27a (verifier correction)

Before:
~~~
For staged DEs (NACs), the bouts from the video-stage round through the semis draw on the video-strip budget, tracked separately.
~~~

After:
~~~
For staged DEs (NACs), the bouts from the video-stage round through the semis count as video strip-hours, not general ones. Day assignment does not score them (see [Retired Video-Strip Budget](#retired-video-strip-budget)), while the feasibility check compares them with the video strips' strip-hours across the tournament (see [Strip-Hour Feasibility](#strip-hour-feasibility)).
~~~

## Block 28 – Strip-Hour Capacity, :875

Sources (cluster block K6-04): default 11 (V27a, V26); audit V27a, V26

Before:
~~~
A day's capacity is measured in **strip-hours**: available strips × the planning day length (10 hours, 600 minutes – the 9:00 AM to 7:00 PM day of Ops Manual p.17). A day with 80 strips has 800 strip-hours of general capacity. Capacity plans to the 7:00 PM soft target, not to the day's hard end. For capacity scoring, video strips are tracked as a separate budget (see [Video-Strip Budget](#video-strip-budget)), but at runtime the strip allocator can spill the start-of-day pool wave onto idle video strips, and on single-event days video strips remain available for pools throughout (see [Video Strip Preservation](#video-strip-preservation)).
~~~

After:
~~~
A day's capacity is measured in **strip-hours**: available strips × the planning day length (10 hours, 600 minutes – the 9:00 AM to 7:00 PM day of Ops Manual p.17). A day with 80 strips has 800 strip-hours of general capacity. Capacity plans to the 7:00 PM soft target, not to the day's hard end. Day assignment keeps no separate video budget (see [Retired Video-Strip Budget](#retired-video-strip-budget)). At runtime pools are kept off video strips only on a day that holds a `REQUIRED` video phase, and even there they may use them in the start-of-day pool wave or on a single-event day (see [Video Strip Preservation](#video-strip-preservation)).
~~~

## Block 29 – Capacity-Aware Day Assignment, :871

Sources (cluster block K6-03): O3; default 14 (PT-18/CAL-DOC); audit PT-18, CAL-P1, CAL-DOC

Before:
~~~
> **Phase D note (2026-04-27).** `CAPACITY_TARGET_FILL = 0.3` (in `dayColoring.ts`) was tuned for the serial scheduler, where the historical rationale was "compensate for serial-scheduler underutilization" — events ran end-to-end and crowded each other off dense days, so day-count was inflated above the strip-hour minimum. The concurrent scheduler runs disjoint-strip events in parallel and absorbs 1.5×–4× more events on dense scenarios (B5/B6/B7), so the conservative-fill rationale no longer applies. Re-tuning `CAPACITY_TARGET_FILL` upward against the re-baselined B1–B7 counts is open follow-up. The constant is unchanged in this commit.
~~~

After:
~~~
### Day Count

Day assignment works over every day the organizer chose (`days_available`). It does not first look for the fewest days the events could fit in: the organizer picks the day count, and the capacity penalty and the flat per-event cost (see [Capacity Penalty Curve](#capacity-penalty-curve)) spread the events across those days.

When the hard rules cannot fit every event into the chosen days, see [When Days Are Too Few](#when-days-are-too-few).

An earlier pass was meant to count the fewest days and then grow that count toward a target fill (`CAPACITY_TARGET_FILL` = 0.3, at most 4 days and never more than the organizer chose). It never did: the soft preferences ran in that pass too, so on the benchmark scenarios B1–B8 at 2–4 days it always returned every chosen day, above each scenario's true minimum, and no target fill from 0.2 to 1.0 changed any board (measured 2026-10-08). It was removed with its constants.
~~~

## Block 30 – Capacity-Aware Day Assignment, :869

Sources (cluster block K6-02): default 3; audit PT-17

Before:
~~~
(see [`dayAssignment.ts`](src/engine/dayAssignment.ts), [`dayColoring.ts`](src/engine/dayColoring.ts))
~~~

After:
~~~
(see [`dayColoring.ts`](src/engine/dayColoring.ts) – `assignDaysByColoring`, [`capacity.ts`](src/engine/capacity.ts) – `estimateCompetitionStripHours`, `categoryWeight`)
~~~

## Block 31 – Capacity-Aware Day Assignment, :867

Sources (cluster block K6-01): O3; audit CAL-P1 (verifier correction), CAL-DOC

Before:
~~~
Day assignment uses a **capacity-aware bin-packing** model. Each tournament day is a bin with a finite strip-hour budget; competitions are weighted items packed into those bins.
~~~

After:
~~~
Day assignment uses a **capacity-aware packing** model. Each tournament day is a bin with a finite strip-hour budget, and competitions are weighted items spread across every day the organizer chose (see [Day Count](#day-count)).
~~~

## Block 32 – Flighting Suggestion, :857

Sources (cluster block K5-16): default 12 (wire `flagFlightingCandidates` into analysis, flight the larger event, flighting is an organizer toggle – suggestion text never reaches Findings, see K5-08); default 3; audit PT-6 (verifier correction), SC1b, SC1c, UX-flagFlightingCandidates

Before:
~~~
See [Flighting](#flighting) and [Strip Budget](#strip-budget) for trigger rules and mechanics. The engine calls `flagFlightingCandidates()` to find competitions whose pool count exceeds `pool_strip_cap`, then identifies same-day pairs whose combined pool count exceeds `strips_total` but each individually fits within `pool_strip_cap`, and suggests flighting for the larger event.
~~~

After:
~~~
See [Flighting](#flighting) and [Strip Budget](#strip-budget) for trigger rules and mechanics. The analysis passes of [Phase 2](#phase-2-pre-scheduling-analysis) do this in two steps. Item 2 uses `flagFlightingCandidates()` to find competitions whose pool count exceeds their effective `pool_strip_cap` (per-event override included), and warns for each one that is not flighted. Item 3 uses `suggestFlightingGroups` (in [`flighting.ts`](src/engine/flighting.ts)) to find same-day pairs whose combined pool count exceeds `strips_total` while each fits within the global `pool_strip_cap`, and picks the larger event of each pair to flight, with a WARN when the two tie. Flighting is an organizer toggle – the organizer turns it on per event.
~~~

## Block 33 – Strip Count Suggestion, :847–848

Sources (cluster block K5-15): default 14 (L5a – the ceiling bullet and "general strip-hours" for the floor); audit L5a

Before:
~~~
- **Strip-hour floor**: the fewest strips whose strip-hour capacity across the tournament's days (see [Strip-Hour Capacity](#strip-hour-capacity)) covers the competitions' total strip-hour draw
- **Answer**: the smallest count at or above max(strip-hour floor, manual baseline) at which the scheduler places every event with its last phase ending by the day's hard end. The manual's figure is never undercut
~~~

After:
~~~
- **Strip-hour floor**: the fewest strips whose strip-hour capacity across the tournament's days (see [Strip-Hour Capacity](#strip-hour-capacity)) covers the competitions' total general strip-hour draw. Video strip-hours are not counted
- **Ceiling**: the busiest day's pools ÷ the pool-strip share (`max_pool_strip_pct`), rounded up, where the busiest day comes from the same largest-first spread applied to pool counts (`suggestStripCount` in [`analysis.ts`](src/engine/analysis.ts))
- **Window**: the search starts at max(strip-hour floor, manual baseline) and runs to the ceiling. When that start is above the ceiling, it runs to the start + the ceiling instead (`stripSearchRange` in [`stripSearch.ts`](src/engine/stripSearch.ts))
- **Answer**: the smallest count in that window at which the scheduler places every event with its last phase ending by the day's hard end. The manual's figure is never undercut. When no count in the window works, or no competition can be sized, there is no suggestion
~~~

## Block 34 – Tournament-Type Policies, RYC / SYC, :817

Sources (cluster block K5-14): default 1 (re-point :817 to Within-Day Priority Order, where Ops Manual p.20 – Group 2 is cited); audit C6, W3

Before:
~~~
- Y10 preferred in first time slot (Ops Manual p.20 – Group 2)
~~~

After:
~~~
- Y8 and Y10 events start early in the day: among phases ready at the same time they go first in [Within-Day Priority Order](#within-day-priority-order) (Ops Manual p.20 – Group 2 names Y10, and Y8 is a departure)
~~~

## Block 35 – Phase 5: Resource Allocation, per-event decomposition, :747–749

Sources (cluster block K5-13): default 3 (PhaseKind names); default 12 (Flight A → Flight B gap is `FLIGHT_BUFFER_MINS`, and :748 exempts it from the admin gap); audit PT-8, PT-22

Before:
~~~
1. **Pool round**: one node (`pools`) or two nodes (`pools_flight_a → pools_flight_b` separated by `FLIGHT_BUFFER_MINS`).
2. **Admin gap**: 30-minute mandatory gap between any phase and its successor (`ADMIN_GAP_MINS`).
3. **DE phases**: STAGED events run `de_prelims → de_r16`; SINGLE_STAGE events run a flat `de` allocation. Gold/bronze are unallocated — `de_total_end = terminal_phase_end + tailEstimateMins(event_type)`.
~~~

After:
~~~
1. **Pool round**: one node (`POOLS`) or two nodes (`FLIGHT_A → FLIGHT_B` separated by `FLIGHT_BUFFER_MINS`, 15 min).
2. **Admin gap**: 30-minute mandatory gap between any phase and its successor (`ADMIN_GAP_MINS`), except between Flight A and Flight B, where the flight buffer alone applies.
3. **DE phases**: STAGED events run `DE_PRELIMS → DE_R16`, and SINGLE_STAGE events run a flat `DE_SINGLE` allocation. Gold/bronze are unallocated – `de_total_end = terminal_phase_end + tailEstimateMins(event_type)`.
~~~

## Block 36 – Phase 5: Resource Allocation, :743

Sources (cluster block K5-12): default 3 (PhaseKind names); audit PT-8

Before:
~~~
Once days are chosen, the **[Concurrent Phase Scheduler](#concurrent-phase-scheduler)** runs a single OS-process-style loop over phase nodes across all events. Pool, DE-prelim, DE video-stage (`de_r16`), and SINGLE_STAGE-DE phases are scheduled in priority order, with disjoint-strip events running truly concurrently in the same window.
~~~

After:
~~~
Once days are chosen, the **[Concurrent Phase Scheduler](#concurrent-phase-scheduler)** runs a single OS-process-style loop over phase nodes across all events. Pool, DE-prelim, DE video-stage (`DE_R16`), and SINGLE_STAGE-DE phases are scheduled in priority order, with disjoint-strip events running truly concurrently in the same window.
~~~

## Block 37 – Saber Pileup, :737–739

Sources (cluster block K5-11): O3 (the fewest-days pass is deleted, so the load-balance flag no longer separates two passes); default 3 (code pointers without line numbers); audit PT-15, PT-16, CAL-P1, CAL-DOC

Before:
~~~
Saber competitions carry an extra per-candidate-day penalty when other saber events are already on that day. `saberPileupPenalty` (`dayAssignment.ts:83-100`) counts how many other SABRE competitions are already assigned to the candidate day and applies an escalating penalty, capped once four or more other saber events are already on the day. Non-saber competitions always score 0. See [Appendix A](#appendix-a-penalty--constant-defaults) for the exact values.

The penalty is always active, not gated by the load-balance flag, because saber refs are three-weapon specialists and are naturally scarce – concentrating saber events on one day is a structural staffing risk, not a load-balance nicety. Applied per candidate day inside `colorPenalty` (`dayColoring.ts:301`).
~~~

After:
~~~
Saber competitions carry an extra per-candidate-day penalty when other saber events are already on that day. `saberPileupPenalty` (`dayAssignment.ts`) counts how many other SABRE competitions are already assigned to the candidate day and applies an escalating penalty, capped once four or more other saber events are already on the day. Non-saber competitions always score 0. See [Appendix A](#appendix-a-penalty--constant-defaults) for the exact values.

The penalty applies on every candidate day, because saber refs are three-weapon specialists and are naturally scarce – concentrating saber events on one day is a structural staffing risk, not a load-balance nicety. Applied per candidate day inside `colorPenalty` (`dayColoring.ts`).
~~~

## Block 38 – Phase 4: Day Assignment, :729–733

Sources (cluster block K5-10): default 7 (fix :729 "in priority order" and :733); default 2 (least-bad day and WARN replace relaxation); O3 (every day the organizer chose is used); audit L12, RX2.6, R7c, CAL-P1, CAL-DOC

Before:
~~~
For each competition in priority order:

- Evaluate every available day; pick the one with the **lowest total penalty**
- Penalty = sum of all applicable soft preferences vs. competitions already scheduled
- If no day has finite penalty at current constraint level, escalate through [Constraint Relaxation](#constraint-relaxation)
~~~

After:
~~~
Day assignment uses every day the organizer chose. It takes the competitions in the day order of [Phase 3](#phase-3-priority-ordering), and for each one:

- Evaluate every day, leave out each day a hard rule blocks, and pick the one with the **lowest total penalty** among the rest
- Penalty = sum of all applicable soft preferences and load-balancing terms vs. competitions already assigned (see [Capacity-Aware Day Assignment](#capacity-aware-day-assignment))
- If a hard rule blocks every day, the event takes the least-bad day and each broken pair draws a WARN (see [When Days Are Too Few](#when-days-are-too-few))
~~~

## Block 39 – Phase 3: Priority Ordering, :716–725

Sources (cluster block K5-09): default 7 (L12 rewrite – DSatur day order, Within-Day Priority Order with the constraint score as a tie-break, list its factors, drop "mandatory before optional" and "flighting pairs kept together"); default 13 (`daySequencing.ts`, `Competition.optional` deleted); default 12 (R4 – group execution path deleted); default 3; audit L12 (verifier line fix), PT-14, DS, R4

Before:
~~~
Competitions sorted by **constraint score** (highest first = scheduled first). Most constrained competitions get first pick. (see [`scheduler.ts`](src/engine/scheduler.ts))

Score factors:
- **Crossover count**: how many other competitions this one conflicts with
- **Window tightness**: how narrow the allowed time window is
- **Video scarcity** (NACs only): ratio of staged DE events requiring video to video strips

Within this ordering:
- Mandatory competitions before optional
- Flighting pairs kept together at the priority competition's score position
~~~

After:
~~~
Two orders decide which competition goes first, one for days and one for strips.

- **Day order.** Day assignment colors the competitions by DSatur (`dsaturLoop` in [`dayColoring.ts`](src/engine/dayColoring.ts)). The next competition colored is the one whose hard-separated neighbours already sit on the most distinct days, then the one with the most hard-separated neighbours, then the one with the largest packing footprint (strips × [age-category weight](#age-category-weights)).
- **Strip order.** Within a day, phase nodes run in [Within-Day Priority Order](#within-day-priority-order), where the constraint score breaks the ties every earlier key leaves.

Constraint score factors (`constraintScore` in [`dayAssignment.ts`](src/engine/dayAssignment.ts)):
- **Crossover count**: how many other competitions this one has a crossover penalty with
- **Window tightness**: the day's window over the competition's own window. The app sets no per-competition window, so this factor is 0 for every competition
- **Video scarcity**: for a staged event that requires video (a NAC individual event), the number of such events ÷ video strips. Every other event scores 0
~~~

## Block 40 – Phase 2: Pre-Scheduling Analysis, :704–712

Sources (cluster block K5-08): default 12 (wire `flagFlightingCandidates` into the strip-deficit pass; flight the larger event; group execution path deleted – its premise that the suggestion reaches Findings is false against src, where only `analysis.warnings` is read, so the text names the WARNs and is escalated to the orchestrator); default 11 (V27a – keep the analysis video WARN, retire the peak-concurrent penalty); audit PT-6, UX-flagFlightingCandidates, SC1b, SC1c, R4, V27a (verifier correction 1)

Before:
~~~
Analysis passes run before the main scheduling loop. `initialAnalysis()` is a pre-scheduling check called from the UI layer, not from `scheduleAll()` directly. (see [`analysis.ts`](src/engine/analysis.ts))

1. Total pool demand vs. strips — warns if any day's total pools exceed strip count
2. Per-competition strip deficit — warns if a single competition's pools exceed the effective strip cap (`pool_strip_cap`) and flighting is not enabled
3. Flighting suggestions — identifies same-day pairs that would benefit from flighting
4. Multiple-flighting conflicts — warns if more than one flighted competition lands on the same day
5. Video strip demand — warns if peak video-strip need exceeds video-capable strips
6. Flighting-group video conflicts — warns if flighted competitions in the same group have conflicting video strip requirements
7. Cut summaries — informational breakdown of advancement numbers per competition
~~~

After:
~~~
Analysis passes run outside the main scheduling loop. `initialAnalysis()` is not called from `scheduleAll()`: the app runs it on the board it draws, with each placed event on its day and each unplaced one spread round-robin over the days, and its warnings reach Findings. (see [`analysis.ts`](src/engine/analysis.ts))

1. Total pool demand vs. strips – warns if any day's total pools exceed strip count
2. Per-competition strip deficit – `flagFlightingCandidates()` finds each competition whose pools exceed its effective strip cap (`pool_strip_cap`, per-event override included). The pass warns (`pools-exceed-strip-cap-unflighted`) when such a competition is not flighted
3. Flighting pairs – identifies same-day pairs whose combined pools exceed the strip total while each fits within the global strip cap, and picks the larger event of each pair as the one to flight (`suggestFlightingGroups` in [`flighting.ts`](src/engine/flighting.ts)). When the two have equal pool counts, a WARN (`flighting-priority-tie`) asks the organizer to choose. The organizer turns flighting on per event
4. Multiple-flighting conflicts – warns if more than one flighted competition falls on the same day
5. Video strip demand – warns when a day holds more staged events that require video than there are video strips. It counts events per day after days are assigned, not concurrent strip demand (rule `day-video-demand-exceeds-video-strips`)
6. Flighting-pair video conflicts – warns when both events of a suggested flighting pair require video
7. Cut summaries – informational breakdown of advancement numbers per competition
~~~

## Block 41 – Phase 1: Validation, :698–699

Sources (cluster block K5-07): default 14 (R2 – a per-event ERROR excludes that event, any other ERROR aborts); default 2 (the rules that stop scheduling are a different set from the day rules); default 10 (Single-Day Fit is enforced when phases are placed, not in Phase 1); default 14 SC2 ("the video stage"); audit R2 (verifier: both cut-value rules and the video shortfall are per-event too), RX2.1 (verifier: :698–699 together)

Before:
~~~
- All competitions and configuration validated against hard rules (see [Hard Constraints](#hard-constraints))
- Any ERROR-severity violation aborts scheduling immediately
~~~

After:
~~~
- The configuration and each competition's own settings are checked (`validateConfig` in [`validation.ts`](src/engine/validation.ts)): the strip total and day count, fencer count bounds, cut values, team-event settings, the video-stage strip ask, the strip minimum for pools ([Resource Preconditions](#resource-preconditions)) and that every team event has its individual event ([Team Events Require a Matching Individual](#team-events-require-a-matching-individual)). The hard same-day separations and the Vet co-day are not checked here – day assignment applies them ([Phase 4](#phase-4-day-assignment)), and [Single-Day Fit](#single-day-fit) is enforced when phases are placed
- When every ERROR comes from a per-event rule – fencer count bounds, the two cut-value rules or the video-stage strip shortfall (`video-r16-strip-shortfall`) – the events those ERRORs name are excluded, one WARN says how many, and the rest are scheduled
- Any other ERROR aborts scheduling immediately
~~~

## Block 42 – Scheduling Algorithm, :694

Sources (cluster block K5-06): default 4 (C10 – describe the app as it is); default 2 (drop "constraint-relaxing"); default 9 (the hand-placement check reports a split Vet co-day); default 3 (code pointers); audit C10, RX2.6, R7c, PT-13; O10 (2026-10-08: the store's board check emits `pool-start-after-cutoff` for engine-placed and hand-moved events, as drafted)

Before:
~~~
The auto-suggest engine uses a **priority-ordered, constraint-relaxing** approach to generate an initial schedule. The result is a **suggestion** — users can drag-and-drop competitions on the day/strip grid to refine it. The engine re-validates after each manual adjustment, showing warnings and errors for constraint violations. (see [`scheduler.ts`](src/engine/scheduler.ts), [`dayAssignment.ts`](src/engine/dayAssignment.ts), [`concurrentScheduler.ts`](src/engine/concurrentScheduler.ts))
~~~

After:
~~~
The auto-suggest engine assigns each competition a day by **penalty-minimising graph coloring**, then places every phase with a **priority-ordered** loop. The result is a **suggestion**. The organizer moves an event to another day on the board, which pins it there. A hand move is checked at once against the hard same-day pairs, a split Vet co-day, the regional Group 1 window, the first- and last-day length, a first pool phase that starts after the cutoff and late or overrun finishes, without re-running the engine. Auto-assign re-runs around the pins after every edit to an engine input. (see [`scheduler.ts`](src/engine/scheduler.ts), [`dayColoring.ts`](src/engine/dayColoring.ts), [`constraintGraph.ts`](src/engine/constraintGraph.ts), [`concurrentScheduler.ts`](src/engine/concurrentScheduler.ts))
~~~

## Block 43 – Bottlenecks Specific to the Concurrent Scheduler, :680–688

Sources (cluster block K5-05): default 2 (add `UNAVOIDABLE_CROSSOVER_CONFLICT` to this list); default 9 (`vet-co-day-split`, not dismissable, final day map, pins included); O2 (`pool-start-after-cutoff`, unsourced); default 12 (`FLIGHT_B_DELAYED` measures from Flight B's own ready time); default 13 (one-shot `STRIP_CONTENTION`); audit RX2.5, R7b, R7c, PT-23, PT-8; O10 (2026-10-08: the store's board check emits `pool-start-after-cutoff` for engine-placed and hand-moved events, as drafted)

Before:
~~~
- `DEADLINE_BREACH` (WARN, `attempt_id=1`) — attempt 1 cascade.
- `DEADLINE_BREACH_UNRESOLVABLE` (ERROR, `attempt_id=2`) — attempt 2 cascade; event permanently unscheduled.
- `SAME_DAY_VIOLATION` (ERROR) — a phase other than the event's last ends past `dayHardEnd`, the day's hard end (default 10:00 PM, see [Timing Constants](#timing-constants)), or the event's last phase starts at or after the hard end or ends past midnight. Ending after the 7:00 PM soft target is not this violation (see [Same-Day Completion](#same-day-completion)).
- `SAME_DAY_VIOLATION` (WARN) — a placed event's last phase ends past `dayHardEnd` but within the midnight limit. One per event, with its estimated finish time.
- `NO_WINDOW_DIAGNOSTIC` (INFO) — a deferral occurred; carries `reason: 'STRIPS' | 'TIME'`.
- `SEQUENCING_CONSTRAINT` (INFO) — cross-event predecessor pushed `ready_time` forward.
- `FLIGHT_B_DELAYED` (WARN) — Flight B started more than 30 min past Flight A's natural buffer.
- `VIDEO_STRIP_CONTENTION` (INFO) — video-required phase had to defer.
- `STRIP_CONTENTION` (INFO) — generic one-shot diagnostic when no specific cause applies.
~~~

After:
~~~
- `DEADLINE_BREACH` (WARN, `attempt_id=1`) – attempt 1 cascade.
- `DEADLINE_BREACH_UNRESOLVABLE` (ERROR, `attempt_id=2`) – attempt 2 cascade, and the event is permanently unscheduled.
- `SAME_DAY_VIOLATION` (ERROR) – a phase other than the event's last ends past `dayHardEnd`, the day's hard end (default 10:00 PM, see [Timing Constants](#timing-constants)), or the event's last phase starts at or after the hard end or ends past midnight. Ending after the 7:00 PM soft target is not this violation (see [Same-Day Completion](#same-day-completion)).
- `SAME_DAY_VIOLATION` (WARN) – a placed event's last phase ends past `dayHardEnd` but within the midnight limit. One per event, with its estimated finish time.
- `NO_WINDOW_DIAGNOSTIC` (INFO) – a deferral occurred. It carries `reason: 'STRIPS' | 'TIME'`.
- `SEQUENCING_CONSTRAINT` (INFO, rule `cross-event-dependency-delay`) – a cross-event wait pushed `ready_time` forward (see [Cross-Event Dependency Edges](#cross-event-dependency-edges)).
- `FLIGHT_B_DELAYED` (WARN) – Flight B started more than 30 min after its own ready time, which is Flight A's end + `FLIGHT_BUFFER_MINS` rounded up to the scheduling slot. A flighted event that meets no strip contention never draws it.
- `VIDEO_STRIP_CONTENTION` (INFO) – video-required phase had to defer.
- `STRIP_CONTENTION` (INFO) – generic one-shot diagnostic when no specific cause applies.
- `UNAVOIDABLE_CROSSOVER_CONFLICT` (WARN, rule `hard-separation-violated`) – a hard rule blocked every day for an event, so day assignment put it on the least-bad day and broke a hard same-day separation. One per broken pair, naming both events (see [When Days Are Too Few](#when-days-are-too-few)).
- Rule `vet-co-day-split` (WARN) – the final day map, pins included, puts the age-banded Vet individual events of one gender and weapon on more than one day, against the [Veteran Age-Group Co-Day Rule](#veteran-age-group-co-day-rule). A pin or the least-bad fallback causes it. The hand-placement check emits it too, and like the other broken hard rules it cannot be dismissed.
- Rule `pool-start-after-cutoff` (WARN) – an event's first pool phase (`POOLS`, or `FLIGHT_A` for a flighted event) starts later than day start + 7 hours (`LATEST_START_OFFSET`), 4:00 PM on a 9:00 AM day. The WARN carries the start, and the event stays placed – no event is dropped or moved for it. Flight B is exempt. A hand move is checked against it at once, without re-running the engine. Piste Planner's own rule, unsourced (see [Appendix B](#appendix-b-departures-from-the-operations-manual)).
~~~

## Block 44 – Cross-Event Dependency Edges, :668–672

Sources (cluster block K5-04): O1 (Vet co-day 60-minute stagger replaces end-to-end serialization, unsourced, the wait must really bind); default 8 (120-minute ind→team edge, same-category pairs only, reached only through a pin or the least-bad fallback, the wait must really bind); default 13 (`daySequencing.ts` deleted); audit DS, DS-EDGE (verifier correction on :672), L13, R9, PT-10, W3, SC3; O8 (2026-10-08: when the event waited on is never placed, the wait lapses – the same clause closes K2-04 bullet 4, K2-08 bullet 3 and K3-13 bullet 1)

Before:
~~~
- **Indv → team gap.** When a TEAM event lands on the same day as its individual counterpart, the team's first phase waits on `indiv.last_phase.end_time + INDIV_TEAM_MIN_GAP_MINS` (120 min).
- **Vet age-banded sibling order.** When two age-banded VET individual events of the same gender + weapon land on the same day, the younger sibling's pools wait on the older sibling's last phase end + `ADMIN_GAP_MINS` (mirrors the within-day sort key in `daySequencing.ts`, but enforces strict end-to-end serialization regardless of resource availability).
- **Regional Group 1 window.** At ROC, RYC and RJCC, when a [Group 1 pair](#overlapping-population-separation-group-1) of the same gender + weapon lands on the same day, the younger side's pools are ready from day start, while the older side's pools are not ready before day start + 4 hours. A WARN fires when the window cannot be honoured, for example when a pin places the older side earlier. Each pair applies its own window and the windows do not stack, so in a Y10, Y12 and Y14 day the Y12–Y14 pair is not honoured.

All three are wired in `applyCrossEventEdges`. The loop resolves them lazily and emits `SEQUENCING_CONSTRAINT` (INFO) when a dependency pushes a node's `ready_time` forward.
~~~

After:
~~~
- **Indv → team gap.** A TEAM event and its individual counterpart of the same category, weapon and gender are hard-separated (see [Same-Population Conflicts](#same-population-conflicts)), so they share a day only through a pin or the least-bad fallback (see [When Days Are Too Few](#when-days-are-too-few)). When they do, the team's first phase is not ready before `indiv.last_phase.end_time + INDIV_TEAM_MIN_GAP_MINS` (120 min).
- **Vet age-banded stagger.** On the co-day of the age-banded VET individual events of one gender + weapon, the bands start oldest first with a 60-minute stagger: each younger band's pools are not ready before the pools of the next-older band on that day start + 60 minutes. No band waits for another to finish. The stagger is Piste Planner's own rule and unsourced (see [Veteran Age-Group Co-Day Rule](#veteran-age-group-co-day-rule) and [Appendix B](#appendix-b-departures-from-the-operations-manual)).
- **Regional Group 1 window.** At ROC, RYC and RJCC, when a [Group 1 pair](#overlapping-population-separation-group-1) of the same gender + weapon falls on the same day, the younger side's pools are ready from day start, while the older side's pools are not ready before day start + 4 hours. A WARN fires when the window cannot be honoured, for example when a pin places the older side earlier. Each pair applies its own window and the windows do not stack, so in a Y10, Y12 and Y14 day the Y12–Y14 pair is not honoured.

All three are wired in `applyCrossEventEdges`. The first two are waits on another event, and they bind whatever order the loop meets the events in. The regional window is a fixed floor from day start, set when the node is queued. The loop emits `SEQUENCING_CONSTRAINT` (INFO, rule `cross-event-dependency-delay`) when a dependency pushes a node's `ready_time` forward. When the event waited on is never placed, the wait lapses and the waiting event's pools are ready as if it did not exist – from day start, or from any other floor that applies to it, such as the regional Group 1 window.
~~~

## Block 45 – Allocation, Deferral, and Failure, :656

Sources (cluster block K5-03): default 3 (PhaseKind names); default 12 (Flight A → Flight B gap is `FLIGHT_BUFFER_MINS`, exempt from the admin gap); audit PT-8, PT-22

Before:
~~~
The loop calls `findAvailableStripsInWindow`. On `fit: 'ok'` the node transitions to RUNNING, the successor's `ready_time` is set to `node.end_time + ADMIN_GAP_MINS` (or `+ FLIGHT_BUFFER_MINS` after `pools_flight_a`), and the successor is pushed onto the ready queue. On `fit: 'none'`:
~~~

After:
~~~
The loop calls `findAvailableStripsInWindow`. On `fit: 'ok'` the node transitions to RUNNING, the successor's `ready_time` is set to `node.end_time + ADMIN_GAP_MINS` (or `+ FLIGHT_BUFFER_MINS` alone after `FLIGHT_A` – the 15-minute flight buffer replaces the 30-minute admin gap between the two flights), and the successor is pushed onto the ready queue. On `fit: 'none'`:
~~~

## Block 46 – Within-Day Priority Order, :645–652

Sources (cluster block K5-02): default 1 (Y8/Y10 first pick stays live, cite Ops Manual p.20 – Group 2, Y8 a departure); default 6 (L11b Flight A key after Y8/Y10 and before video-required); default 7 (constraint score is a tie-break); default 13 (`daySequencing.ts` deleted); audit C6, PT-10, DS, W3, L11b, L12

Before:
~~~
When multiple phase nodes are READY, the loop picks the one with the highest priority. The comparator (`compareNodes` in [`concurrentScheduler.ts`](src/engine/concurrentScheduler.ts)) orders by:

1. **Earlier `ready_time` first** — the node that can start sooner gets first pick of the strip pool.
2. **Y8/Y10 first** — youth-priority events claim morning strip-time before larger events crowd them out (mirrors `daySequencing.ts` rule 1; without this, B3-style scenarios collapse).
3. **Video-required first** — claim scarce video strips before they're contested.
4. **Larger `desired_strip_count` first** — bigger phases are hardest to fit; place them when the pool is empty.
5. **Higher `constraint_score` first** — most-constrained event wins ties.
6. Stable on `event_id` for full determinism.
~~~

After:
~~~
When multiple phase nodes are READY, the loop picks the one with the highest priority. The comparator (`compareNodes` in [`concurrentScheduler.ts`](src/engine/concurrentScheduler.ts)) orders by:

1. **Earlier `ready_time` first** – the node that can start sooner gets first pick of the strip pool.
2. **Y8/Y10 first** – youth events claim strip-time at the start of the day before larger events crowd them out. Without this key, B3-style scenarios collapse. Ops Manual p.20 – Group 2 asks for Y10 events early in the day, and giving Y8 the same early start is a departure (see [Appendix B](#appendix-b-departures-from-the-operations-manual)).
3. **Flight A first** – a flighted event's first flight claims its strips early in the day (see [Flighting](#flighting)), so Flight B can follow while the day has time left.
4. **Video-required first** – claim scarce video strips before they're contested.
5. **Larger `desired_strip_count` first** – bigger phases are hardest to fit, so they are placed while the strip pool is emptiest.
6. **Higher `constraint_score` first** – the most-constrained event wins the remaining ties (see [Phase 3](#phase-3-priority-ordering)).
7. Stable on `event_id` for full determinism.
~~~

## Block 47 – Concurrent Phase Scheduler, :635

Sources (cluster block K5-01): default 3 (PhaseKind names); audit PT-8

Before:
~~~
The runtime scheduler is an **OS-process-scheduling-style loop over phase nodes**. Each event decomposes into a sequence of phase nodes (`pools` or `pools_flight_a → pools_flight_b`; `de_prelims → de_r16` for STAGED; `de` for SINGLE_STAGE), and the loop pops the highest-priority READY node, allocates strips via the [interval-list model](#interval-list-model), and pushes the successor onto the ready queue. Events with disjoint strip needs run truly concurrently in the same window. (see [`concurrentScheduler.ts`](src/engine/concurrentScheduler.ts))
~~~

After:
~~~
The runtime scheduler is an **OS-process-scheduling-style loop over phase nodes**. Each event decomposes into a sequence of phase nodes (`POOLS`, or `FLIGHT_A → FLIGHT_B` for a flighted event, then `DE_PRELIMS → DE_R16` for STAGED or `DE_SINGLE` for SINGLE_STAGE), and the loop pops the highest-priority READY node, allocates strips via the [interval-list model](#interval-list-model), and pushes the successor onto the ready queue. Events with disjoint strip needs run truly concurrently in the same window. These are the scheduler's `PhaseKind` names. Findings and phase labels record the same phases as `Phase` values, where `DE_R16` is `DE_ROUND_OF_16` and `DE_SINGLE` is `DE`. (see [`concurrentScheduler.ts`](src/engine/concurrentScheduler.ts))
~~~

## Block 48 – Refs Per Pool, :618–621

Sources (cluster block K4-14): default 13 (delete `RefPolicy.AUTO`, L16: drop the Auto bullet); audit L16

Before:
~~~
- **Two refs per pool**: preferred for higher-level events
- **Auto**: uses two-per-pool at every type. It is not a tournament type's default, which the table above sets to One or Two directly.

This setting changes how many refs the engine reports as needed. It does not gate scheduling.
~~~

After:
~~~
- **Two refs per pool**: preferred for higher-level events

This setting changes how many refs the engine reports as needed, and it does not change the schedule.
~~~

## Block 49 – Refs Per Pool, :608

Sources (cluster block K4-13): default 13 (L16: "set by type", not "defaulted"); audit L16

Before:
~~~
The tournament type sets the default to One or Two:
~~~

After:
~~~
The tournament type sets refs per pool to One or Two:
~~~

## Block 50 – Resource Windows, :578

Sources (cluster block K4-12): default 13 (delete `THRESHOLD_MINS`, amend :578 to the live one-shot `STRIP_CONTENTION`, matching :688); audit K3 (verifier correction), PT-21

Before:
~~~
- If delay exceeds a threshold, a strip-contention bottleneck diagnostic is emitted
~~~

After:
~~~
- When strips run short and a phase that needs no video strip is deferred, a strip-contention diagnostic (`STRIP_CONTENTION`, INFO) is emitted once for that event and phase, whatever the delay (see [Bottlenecks Specific to the Concurrent Scheduler](#bottlenecks-specific-to-the-concurrent-scheduler))
~~~

## Block 51 – Video Strip Preservation, phase-level rules, :572

Sources (cluster block K4-11): default 11 (V26 scope); audit V26

Before:
~~~
- **`videoRequired=false` for pools**: subject to the pool-specific rules above (start-of-day wave, or single-event day).
~~~

After:
~~~
- **`videoRequired=false` for pools**: on a day that holds a `REQUIRED` video phase, subject to the pool-specific rules above (start-of-day wave, or single-event day). On any other day, the same as DE prelims.
~~~

## Block 52 – Video Strip Preservation, :563–567

Sources (cluster block K4-10): default 11 (V26: preservation applies on days that hold a `REQUIRED` video phase, the 120-minute window and its boundary stated); O5 (video strips are best-effort at non-NAC types); audit V26, UX-MORNING_WAVE_WINDOW_MINS (verifier correction). Provisional: the inclusive boundary clause ("starts at exactly 11:00 AM is still in the wave") waits on the V26 engine task's `<` against `<=` measurement (default 11) – if `<` wins it becomes "a pool phase that starts at exactly 11:00 AM is outside the wave". Hand-off: the Appendix A/B owner gives the window row the same unsourced note and lists the start-of-day wave rule in Appendix B as Piste Planner's own rule, and the V26 engine task updates the `findAvailableStripsInWindow` signature at base :555 in the same change that adds the pool context

Before:
~~~
Video strips are primarily reserved for staged DE video phases (the video-stage round through SF). Pool rounds may use video strips only under these conditions:

- **Start-of-day pool wave**: video strips MAY be used by pool rounds running at day start (the first pool wave, when many events open concurrently). Once this wave ends, video strips become reserved for DEs — a later event starting its pools mid-day must run on general strips only.
- **Single-event day**: when only one competition is scheduled for the entire day, video strips remain available for that event's pools at any time (morning or end-of-day). A single event cannot conflict with its own DEs (its DE phases run strictly after its pools), so reserving video strips adds no value.
- **Multi-event mid-day pools**: not allowed. Once the morning pool wave completes on a multi-event day, video strips are locked to DE-only usage.
~~~

After:
~~~
Video strips are primarily reserved for staged DE video phases (the video-stage round through SF). The reservation holds only on a day that holds a `REQUIRED` video phase – the staged DE of an individual event at a NAC (see [Video Replay Policy](#video-replay-policy)). On any other day no phase needs a video strip, and pools use video strips the way DE prelims do, as overflow once general strips run out. On a day that holds a `REQUIRED` video phase, pool rounds may use video strips only under these conditions:

- **Start-of-day pool wave**: video strips MAY be used by a pool phase that starts within `MORNING_WAVE_WINDOW_MINS` (120 minutes, unsourced) of the day start – by 11:00 AM on a 9:00 AM day, and a pool phase that starts at exactly 11:00 AM is still in the wave. Once this wave ends, video strips become reserved for DEs – a later event starting its pools mid-day must run on general strips only.
- **Single-event day**: when only one competition is scheduled for the entire day, video strips remain available for that event's pools at any time (morning or end-of-day). A single event cannot conflict with its own DEs (its DE phases run strictly after its pools), so reserving video strips adds no value.
- **Multi-event mid-day pools**: not allowed. On a multi-event day, a pool phase that starts after the wave runs on general strips only.
~~~

## Block 53 – DE Capacity Estimation, Team Events, :535

Sources (cluster block K4-09): default 3 (code pointers); audit PT-12

Before:
~~~
Team DEs use the same model with the team-match time in place of the bout time (`teamDeStripHours`):
~~~

After:
~~~
Team DEs use the same model with the team-match time in place of the bout time (`estimateCompetitionStripHours` in [`capacity.ts`](src/engine/capacity.ts)):
~~~

## Block 54 – Video Replay Policy, every other type, :496

Sources (cluster block K4-16): default 11 (V26: on a day with no `REQUIRED` phase any phase may use video strips as overflow); O5; audit V26; cross-cluster critic (missing block)

Before:
~~~
- **Every other type**: every individual event is `BEST_EFFORT` (Ops Manual p.19, "optional for all local and regional tournaments"). SYC and SJCC are treated as regional for video, although they follow the national same-day rules (see [Appendix B](#appendix-b-departures-from-the-operations-manual)). Video strips might be available but are never guaranteed, and so *do not affect scheduling.*
~~~

After:
~~~
- **Every other type**: every individual event is `BEST_EFFORT` (Ops Manual p.19, "optional for all local and regional tournaments"). SYC and SJCC are treated as regional for video, although they follow the national same-day rules (see [Appendix B](#appendix-b-departures-from-the-operations-manual)). Video strips might be available but are never guaranteed, so no phase waits for one, and any phase may use them as overflow strips (see [Video Strip Preservation](#video-strip-preservation)).
~~~

## Block 55 – Video Replay Policy, NAC, :494

Sources (cluster block K4-15): O5 (any video strip count from 0 to the strip total, default 8 at a NAC); audit AX-VIDEO, UV1b; cross-cluster critic (missing block)

Before:
~~~
- **NAC**: every individual event is `REQUIRED`, from the round in the table below. Video strips are automatic when the type is NAC.
~~~

After:
~~~
- **NAC**: every individual event is `REQUIRED`, from the round in the table below. A NAC defaults to 8 video strips (see [Inputs](#inputs)).
~~~

## Block 56 – DE Phase Breakdown, :478–479

Sources (cluster block K4-08): default 3 (code pointers); default 13 (`de_round_of_16_requirement` and `DeStripRequirement` go, the `de_round_of_16_*` result fields stay); audit PT-7

Before:
~~~
- **`prelims_dur`**: Prelim phase on general strips – covers all rounds above the video-stage round. It asks for `min(bracketSize / 2, 16)` strips.
- **`r16_dur`**: Video phase on video strips – covers the video-stage round through the semis (the scheduler's terminal round). It asks for `min(4, bracketSize / 2)` video strips. The name covers the video block whatever its stage round (round of 16 or round of 8).
~~~

After:
~~~
- **General (prelims) block** (`DeBlocks.general`): Prelim phase on general strips – covers all rounds above the video-stage round. It asks for `min(bracketSize / 2, 16)` strips.
- **Video block** (`DeBlocks.video`): Video phase on video strips – covers the video-stage round through the semis (the scheduler's terminal round). It asks for `min(4, bracketSize / 2)` video strips.

`deBlocksFor` in [`de.ts`](src/engine/de.ts) builds both blocks. The schedule records the video block in the `de_round_of_16_*` result fields, a name that covers the video block whatever its stage round (round of 16 or round of 8).
~~~

## Block 57 – Direct Elimination (DE), :405

Sources (cluster block K4-07): default 3 (code pointers); audit PT-4

Before:
~~~
(see [`de.ts`](src/engine/de.ts), [`scheduleOne.ts`](src/engine/scheduleOne.ts))
~~~

After:
~~~
(see [`de.ts`](src/engine/de.ts), [`concurrentScheduler.ts`](src/engine/concurrentScheduler.ts))
~~~

## Block 58 – Flighting, Runtime Decomposition, :401

Sources (cluster block K4-06): default 3 (PhaseKind names); default 12 (Flight A → Flight B gap is `FLIGHT_BUFFER_MINS`, the flight-specific rule); audit PT-8, PT-22 (verifier correction). Hand-off: the Appendix A/B owner marks the :1023 row unsourced and lists the 15-minute flight gap among Piste Planner's own rules in Appendix B

Before:
~~~
Under the concurrent scheduler a flighted event's pools split into two dependent phase nodes — `pools_flight_a` and `pools_flight_b` — separated by `FLIGHT_BUFFER_MINS` (15). Both nodes must land on the assigned day; if Flight B's earliest start would push past `dayHardEnd`, the event fails and retries from `dayStart`. See [Concurrent Phase Scheduler](#concurrent-phase-scheduler).
~~~

After:
~~~
Under the concurrent scheduler a flighted event's pools split into two dependent phase nodes, `FLIGHT_A → FLIGHT_B`. Flight B is ready `FLIGHT_BUFFER_MINS` (15 minutes, unsourced) after Flight A ends. This flight gap is the flight-specific rule, and it replaces the 30-minute admin gap (`ADMIN_GAP_MINS`) between the two flights. Both nodes run on the event's assigned day. If Flight B cannot meet its day limit, the event fails and retries from `dayStart` (see [Two-Attempt Retry](#two-attempt-retry)). See [Concurrent Phase Scheduler](#concurrent-phase-scheduler).
~~~

## Block 59 – Flighting, Flighting Group Suggestion, :395–397

Sources (cluster block K4-05): default 12 (the suggestion stays advisory; R4 deletes the group execution path, so the heading becomes "Flighting Pair Suggestion"). Escalated: default 12's premise that the suggestion text reaches Findings through `initialAnalysis` is false against src – `analysis.suggestions` has no reader outside analysis.ts and derived.ts reads only `analysis.warnings` – so the text names the WARNs instead, matching K5-08 and K5-16. If the owner wants the suggestion text shown, that is a UI change outside 021, and K4-05, K5-08 and K5-16 change together; audit SC1b, R4 (verifier correction), PT-6 (verifier correction 2)

Before:
~~~
#### Flighting Group Suggestion

- Flighting is suggested when two same-day competitions' combined pool count exceeds `strips_total` but each fits individually within `pool_strip_cap`
~~~

After:
~~~
#### Flighting Pair Suggestion

- Flighting is suggested when two same-day competitions' combined pool count exceeds `strips_total` but each fits individually within the global `pool_strip_cap`, with no per-event override. The suggestion names the larger event, the one with more pools, for flighting (`suggestFlightingGroups` in [`flighting.ts`](src/engine/flighting.ts)). When both have the same pool count, the suggestion draws a WARN (`flighting-priority-tie`) and the organizer picks.
- The suggestion is advisory. Findings show the WARNs that pre-scheduling analysis raises around it (see [Phase 2: Pre-Scheduling Analysis](#phase-2-pre-scheduling-analysis)), and the organizer decides whether to turn flighting on. The app does not form flighting groups, so a suggestion never changes the schedule by itself.
~~~

## Block 60 – Flighting, How Flighting Works, :391–393

Sources (cluster block K4-04): default 12 (the suggestion flights the larger event, spec-wins; flighting is an organizer toggle the engine suggests); default 6 (L11a drop smaller-first, L11b Flight A comparator key); audit SC1b, SC1c, V1 (verifier correction 2), L11a, L11b (verifier correction)

Before:
~~~
- The **larger event** becomes flighted (uses half the strips, double the time)
- Smaller events get priority to start and run in parallel with the first flight
- Flighted events have a strong affinity for the day-start time slot
~~~

After:
~~~
- The **larger event** is the one to flight (half the strips, double the time) – the engine suggests it, and the organizer turns flighting on per event (see [Flighting Pair Suggestion](#flighting-pair-suggestion))
- Other events on the day run in parallel with the flights when strips allow, in the order set by [Within-Day Priority Order](#within-day-priority-order), where larger phases go first
- Flight A starts early – in [Within-Day Priority Order](#within-day-priority-order) a ready Flight A node comes after Y8/Y10 and before video-required phases
~~~

## Block 61 – Flighting, Trigger, :387

Sources (cluster block K4-03): default 12 (wire `flagFlightingCandidates` into analysis, fix its signature – `(competitions, config)` with the cap computed per event, per the CONFIRMED UX-flagFlightingCandidates); default 3; audit PT-6, UX-flagFlightingCandidates

Before:
~~~
- `flagFlightingCandidates()` returns competition IDs where `n_pools > pool_strip_cap` (see [`stripBudget.ts`](src/engine/stripBudget.ts))
~~~

After:
~~~
- `flagFlightingCandidates(competitions, config)` returns competition IDs where `n_pools > pool_strip_cap`. It computes each event's cap with `computeStripCap`, so the per-event override above holds (see [`stripBudget.ts`](src/engine/stripBudget.ts)). Pre-scheduling analysis (`initialAnalysis` in [`analysis.ts`](src/engine/analysis.ts)) calls it for its per-competition strip-deficit check and warns (`pools-exceed-strip-cap-unflighted`) for each candidate that is not flighted (see [Phase 2: Pre-Scheduling Analysis](#phase-2-pre-scheduling-analysis)).
~~~

## Block 62 – Flighting, :379

Sources (cluster block K4-02): default 12 (:379 says flights are tracked); audit SC1, PT-22 (verifier correction 3)

Before:
~~~
Flighting splits a large competition's pool round into exactly two flights (Flight A and Flight B), using **half the strips for double the time**. Ops Manual p.17 points to it when strips run short: "If tournaments cannot provide the appropriate number of strips for pools, double flighting may be needed." Two flights is the maximum – three or more flights are not used in USA Fencing operations. The schedule marks the competition as "flighted" but does not track Flight A/B start/end times separately – only total pool round duration matters. (see [`flighting.ts`](src/engine/flighting.ts))
~~~

After:
~~~
Flighting splits a large competition's pool round into exactly two flights (Flight A and Flight B), using **half the strips for double the time**. Ops Manual p.17 points to it when strips run short: "If tournaments cannot provide the appropriate number of strips for pools, double flighting may be needed." Two flights is the maximum – three or more flights are not used in USA Fencing operations. The schedule records each flight's start, end, strips and refs (see [Runtime Decomposition](#runtime-decomposition) and [`flighting.ts`](src/engine/flighting.ts)).
~~~

## Block 63 – Strip Budget, Key Functions, :374–375

Sources (cluster block K4-01): default 3 (code pointers); default 12 (wire `flagFlightingCandidates`, fix its signature in the doc – the base `(competitions, config)` stands and the engine moves to it, computing each event's cap inside with `computeStripCap`, per the CONFIRMED UX-flagFlightingCandidates – the plan records this reading of default 12, because the per-event override (:386) and analysis Pass 1 are per-event today; the code's `(competitions, poolStripCap, bounds)` changes, not the doc); audit PT-5, PT-6, L5a, D2d, UX-flagFlightingCandidates

Before:
~~~
- `recommendStripCount(competitions, config)` — advisory: suggests a strip total that keeps each competition within its pool cap
- `flagFlightingCandidates(competitions, config)` — returns competition IDs where `n_pools > pool_strip_cap`
~~~

After:
~~~
- `searchStripCount(competitions, config, pinned)` in [`stripSearch.ts`](src/engine/stripSearch.ts) – advisory: suggests a strip total (see [Strip Count Suggestion](#strip-count-suggestion))
- `flagFlightingCandidates(competitions, config)` in [`stripBudget.ts`](src/engine/stripBudget.ts) – returns competition IDs where `n_pools` exceeds that event's own `pool_strip_cap`
~~~

## Block 64 – §Constraint Relaxation replaced by §When Days Are Too Few, :308–322

Sources (cluster block K3-15): default 2 (RX1–RX4, 019 Left-for-021 items 1–7, 9, 10); default 9 (split Vet co-day WARN `vet-co-day-split`, not dismissable, checked on the final day map, pins included); standing decision (019: no hard pair is ever relaxed); audit RX1, RX2.2, RX2.3, RX2.5, RX2.6, RX2.7, R7a, R7b, R7c, PT-3

Before:
~~~
## Constraint Relaxation

The scheduling system uses two tiers of constraints: **Hard** (never relaxed) and **Soft** (finite penalties, active at level 0). Progressive relaxation proceeds through these tiers when no valid assignment exists.

(see [`dayAssignment.ts`](src/engine/dayAssignment.ts))

| Level | What's Relaxed |
|---|---|
| 0 (full constraints) | All rules active: hard blocks, soft preferences, proximity |
| 1 | Drops proximity preferences (Proximity Preference, Individual-Team Proximity distance penalty) |
| 2 | Drops soft crossover penalties and the Regional Group 1 pair penalty; overlapping populations may share a day, but same-population hard blocks remain |
| 3 | Same population still produces a warning but is allowed as last resort |

- Each relaxation emits a warning
- If no valid day exists even at Level 3, scheduling fails with an unresolvable error
~~~

After:
~~~
## When Days Are Too Few

Hard rules block a day outright, and soft weights only rank the days that remain, so nothing is relaxed. There are no relaxation levels, and a hard rule is never traded for a soft preference.

When every day is blocked for an event – each day already holds an event it may not share a day with, or the day its Vet co-day requires is blocked – day assignment still gives it a day. It takes the least-bad day, the one with the lowest total penalty, and when the days tie it takes the first of them. Then:
- Each hard pair the placement breaks draws one WARN, `UNAVOIDABLE_CROSSOVER_CONFLICT` (rule `hard-separation-violated`), naming both events
- A placement that splits an age-banded Vet co-day across days draws a WARN with rule `vet-co-day-split` (see [Veteran Age-Group Co-Day Rule](#veteran-age-group-co-day-rule))
- Scheduling continues. Neither WARN stops the run or drops the event

A pin or a hand move that breaks a hard pair draws the same `hard-separation-violated` WARN from the hand-placement check (`checkPlacementRules`), which reads the board, pins included. A split Vet co-day draws `vet-co-day-split` from both the engine and the hand-placement check, which judge the final day map, pins included. Like every other hard break, neither WARN can be dismissed.

(see [`dayColoring.ts`](src/engine/dayColoring.ts) – `dsaturLoop`, [`concurrentScheduler.ts`](src/engine/concurrentScheduler.ts) – `scheduleAllConcurrent`, and [`placementRules.ts`](src/engine/placementRules.ts) – `checkPlacementRules`)
~~~

## Block 65 – Retired Time-of-Day Preferences (new), :304

Sources (cluster block K3-14): default 1 (W1–W4 retirement record: the eight, "or with the team first", the two windows, the reason, where the live parts are); standing decision of 2026-10-04 (time-of-day weights retired as Phase D casualties); audit W4 (with its verifier corrections), W1, W2, W3, K1, K3, C4, C6

Before:
~~~
(see Appendix A for exact values)
~~~

After:
~~~
(see Appendix A for exact values)

### Retired Time-of-Day Preferences

The owner retired eight time-of-day preferences on 2026-10-04, together with the two windows they used – the 30-minute same-time window and the 10-minute early-start window:
- Two high-crossover competitions (0.8 and up) within 30 minutes of each other on one day
- Two lower-crossover competitions within 30 minutes of each other on one day
- An individual and team event of one category at the same time, or with the team first, on one day
- An individual and team event under 120 minutes apart
- Two high-crossover competitions both starting at day start on the same day
- Two high-crossover competitions both starting at day start on consecutive days
- An individual and team event of one category both starting at day start on consecutive days
- A Y8 or Y10 event not starting at day start

Each one scored a start time. Day assignment picks each event's day before any start time exists, and the concurrent scheduler that sets the times allocates strips greedily without weighing penalties, so none of them can be scored. The live parts of these rules are described elsewhere: same-day crossover is scored per day ([Demographic Crossover](#demographic-crossover)), a same-category team event waits 120 minutes after its individual event ([Individual-Team Proximity](#individual-team-proximity) and [Cross-Event Dependency Edges](#cross-event-dependency-edges)), Y8 and Y10 get first pick among phases ready at the same time ([Within-Day Priority Order](#within-day-priority-order)), and the regional Group 1 window holds the older side's pools until 4 hours after day start ([Regional Types](#regional-types-soft-with-a-time-of-day-window)).
~~~

## Block 66 – Individual-Team Proximity, same-day gap, :299–302

Sources (cluster block K3-13): O8 (the wait lapses when the event waited on is never placed); default 8 (120 minutes, same-category pairs only, the wait binds; drop "4-hour separation required", the Vet-team/Div 2 example and "soft"); audit SC3, PT-24, L13, W3

Before:
~~~
- **For other overlapping individual/team pairs**: 4-hour separation required, in either direction
  - e.g., Vet Team at 9 AM allows Div 2 Individual at 11 AM
  - Individual before team is a soft preference, not a hard rule
  - When such a pair lands on the same day (because their constraint is soft, not hard), the runtime sequencer enforces `team_pools_start >= indiv_DE_end + 120 min` and emits `SEQUENCING_CONSTRAINT` (INFO).
~~~

After:
~~~
- **Same-category individual and team on one day**: [Same-Population Conflicts](#same-population-conflicts) keeps them on different days, so they share a day only when a pin or the least-bad fallback ([When Days Are Too Few](#when-days-are-too-few)) puts them there. Then the team event's first phase never starts before the individual event's last phase ends + 120 minutes (`INDIV_TEAM_MIN_GAP_MINS`, see [Cross-Event Dependency Edges](#cross-event-dependency-edges)), and the scheduler emits `SEQUENCING_CONSTRAINT` (INFO) when the wait delays the team. When the event waited on is never placed, the wait lapses and the waiting event's pools are ready as if it did not exist – from day start, or from any other floor that applies to it, such as the regional Group 1 window
- Other individual/team pairs have no time gap within a day. Their day-level separation comes from the day rules above – Group 1, the cross-level blocks in [Individual/Team Separation](#individualteam-separation), the soft separations in [Other Soft Preferences](#other-soft-preferences) and the crossover graph ([Demographic Crossover](#demographic-crossover))
~~~

## Block 67 – Other Soft Preferences, Y8/Y10 row replaced by the two same-day bonuses, :290

Sources (cluster block K3-12): default 1 (delete the :290 row); O6 (Y8↔Y10 and Y10↔Div 3 same-day bonus, −0.4); audit W1, C6, L9b

Before:
~~~
| Y8/Y10 Early Scheduling | 0.3 | Y8/Y10 not starting at day start. Ops Manual p.20 – Group 2 names Y10 only, and including Y8 is a departure (see [Appendix B](#appendix-b-departures-from-the-operations-manual)) |
~~~

After:
~~~
| Y8↔Y10 same day | -0.4 (bonus) | Same weapon+gender on the same day. The spec asks Y8 to share a day with Y10 (see [Departures From the Manual](#departures-from-the-manual)). The value is unsourced (see [Appendix B](#appendix-b-departures-from-the-operations-manual)) |
| Y10↔DIV3 same day | -0.4 (bonus) | Same weapon+gender on the same day. The two draw no common fencers, which makes a good same-day pairing (see [Departures From the Manual](#departures-from-the-manual)). Unsourced (see [Appendix B](#appendix-b-departures-from-the-operations-manual)) |
~~~

## Block 68 – Other Soft Preferences, Regional Group 1 pair and Div 1 soft separations, :283–285

Sources (cluster block K3-11): default 2 (:283 names the cross-level ind/team exception, :284–285 drop "suppressed at level >= 2"); audit RX3, RX2.4, PW, L3

Before:
~~~
| Regional Group 1 pair | 5.0 | ROC, RYC and RJCC only. A [Group 1 pair](#overlapping-population-separation-group-1) (DIV1↔JUNIOR, JUNIOR↔CADET, DIV1↔CADET, Y10↔Y12, Y12↔Y14, Y14↔CADET) with the same weapon+gender on the same day, run inside the time-of-day window. Different weapon or gender does not trigger. At NAC, SYC and SJCC these pairs are hard blocks. |
| Soft Separation (DIV1↔DIV2) | 3.0 | Same weapon+gender on same day; suppressed at level >= 2. (see `SOFT_SEPARATION_PAIRS`) |
| Soft Separation (DIV1↔DIV3) | 3.0 | Same weapon+gender on same day; suppressed at level >= 2. (see `SOFT_SEPARATION_PAIRS`) |
~~~

After:
~~~
| Regional Group 1 pair | 5.0 | ROC, RYC and RJCC only. A [Group 1 pair](#overlapping-population-separation-group-1) (DIV1↔JUNIOR, JUNIOR↔CADET, DIV1↔CADET, Y10↔Y12, Y12↔Y14, Y14↔CADET) with the same weapon+gender on the same day, run inside the time-of-day window. Different weapon or gender does not trigger. The exception is Div 1 individual ↔ Junior team and Junior individual ↔ Div 1 team, which stay hard at every type (see [Individual/Team Separation](#individualteam-separation)). At NAC, SYC and SJCC these pairs are hard blocks. |
| Soft Separation (DIV1↔DIV2) | 3.0 | Same weapon+gender on same day. (see `SOFT_SEPARATION_PAIRS`) |
| Soft Separation (DIV1↔DIV3) | 3.0 | Same weapon+gender on same day. (see `SOFT_SEPARATION_PAIRS`) |
~~~

## Block 69 – Weapon Balance, :273–275

Sources (cluster block K3-10): O4; O7 (2026-10-08, the "keeps" reading: "whichever option avoids having a day where only epee is scheduled on that day (we need to balance ROW weapons with epee)" – over 49 boards KEEPS left 0 pooled one-class days against DELTA's 1 and none's 7, and both readings place B6 at 53); audit WB (with its verifier note on both wordings)

Before:
~~~
- Each day should have a mix of ROW weapons (foil/saber) and epee
- An all-ROW or all-epee day: penalty
- Penalty should be proportional to competition size
~~~

After:
~~~
- The goal: no day holds only one weapon class. Each day should hold both the right-of-way weapons (foil and sabre) and épée, and above all no day should hold épée alone
- The balance is judged per day over every event on it, both genders and team events included
- An event that brings the missing class to a day holding only the other class earns a bonus. An event that leaves its day one-class costs a penalty – the first event placed on an empty day and every later event of the same class on a day that still holds one class. An event placed on a day that already holds both classes costs nothing. The bonus and the penalty are the same flat value for every event, whatever its size (see [Appendix A](#appendix-a-penalty--constant-defaults))
- When the tournament has no event of one class at all, weapon balance is not scored
~~~

## Block 70 – Proximity Preference, code pointer, :269

Sources (cluster block K3-09): default 3 (PT-11); default 13 (`PROXIMITY_PENALTY_WEIGHTS` deleted, :269 points at `PENALTY_WEIGHTS.PROXIMITY_*`); audit PT-11, PW-DEAD, L1b, UX-proximityPenalty

Before:
~~~
(see [`constants.ts`](src/engine/constants.ts) — `PROXIMITY_GRAPH`, `PROXIMITY_PENALTY_WEIGHTS`)
~~~

After:
~~~
(see [`dayColoring.ts`](src/engine/dayColoring.ts) – `colorPenalty`, and [`constants.ts`](src/engine/constants.ts) – `PROXIMITY_GRAPH`, `PENALTY_WEIGHTS.PROXIMITY_1_DAY`, `PENALTY_WEIGHTS.PROXIMITY_3_PLUS_DAYS`)
~~~

## Block 71 – Early-Start Conflicts (deleted), :247–252

Sources (cluster block K3-08): default 1 (delete §Early-Start Conflicts :248–252); audit W1, K3 (verifier: the retired text is :248–252)

Before:
~~~

### Early-Start Conflicts

- Two high-crossover competitions both starting at day start on the **same day**: penalty
- Two high-crossover competitions both starting at day start on **consecutive days**: penalty (forces families to arrive early two days in a row)
- Individual + team (same weapon, gender, and category) both starting early on consecutive days: penalty
~~~

After: nothing – the Before lines are deleted.

## Block 72 – Demographic Crossover, same-day scoring, :245–246

Sources (cluster block K3-07): default 1 (W1: replace :245–246 with one live bullet); default 5 (XE: Group 1 pairs are not scored by the graph, and soft separations override it); audit W1 (with its verifier correction on precedence), XE, K1 (verifier: :244 stays)

Before:
~~~
- When two high-crossover competitions are on the same day within 30 minutes: **strong penalty**
- Lower crossover within 30 minutes: **moderate penalty**
~~~

After:
~~~
- Two competitions on the same day add the pair's crossover weight to that day's penalty, whatever their start times (`colorPenalty` in [`dayColoring.ts`](src/engine/dayColoring.ts))
- The graph's weight applies only when no other rule sets the pair's value first (`crossoverPenalty` in [`crossover.ts`](src/engine/crossover.ts)). Group 1 pairs, such as Y12–Y14 and Cadet–Junior, are not scored by the graph: they are hard blocks at NAC, SYC and SJCC and take the Regional Group 1 pair penalty at ROC, RYC and RJCC. The other hard blocks and the soft separations in [Other Soft Preferences](#other-soft-preferences) override the graph's weight as well
~~~

## Block 73 – Demographic Crossover, Veteran → Div 1 example, :243

Sources (cluster block K3-06): default 5 (L10: Veteran → Div 1 is 0.1, do not cite B8); audit L10 (with its verifier correction), XE

Before:
~~~
  - Veteran → Div 1: 0.8 (high overlap at NACs)
~~~

After:
~~~
  - Veteran → Div 1: 0.1 (few Veterans also enter Division events, and Div 2, Div 3 and Div 1A carry the same 0.1). Veteran ↔ Div 1A individual events take the 3.0 soft separation instead (see [Other Soft Preferences](#other-soft-preferences))
~~~

## Block 74 – Demographic Crossover, Cadet → Junior example, :241

Sources (cluster block K3-05): default 5 (XE: keep the four graph examples); audit XE (verifier correction: drop "typical overlap at NACs", since that pair is hard at NACs)

Before:
~~~
  - Cadet → Junior: 0.8 (typical overlap at NACs)
~~~

After:
~~~
  - Cadet → Junior: 0.8
~~~

## Block 75 – Soft Preferences, intro and pointer, :231

Sources (cluster block K3-04): default 3 (PT-2); default 2 (hard rules block a day, soft weights only rank days); audit PT-2

Before:
~~~
These factors influence day assignment through a weighted penalty system. The auto-suggest algorithm assigns each competition to the day with the lowest total penalty. Penalties are listed in approximate order of strength. All weights will become configurable in a future release. (see [`dayAssignment.ts`](src/engine/dayAssignment.ts))
~~~

After:
~~~
These factors influence day assignment through a weighted penalty system. The auto-suggest algorithm assigns each competition to the day with the lowest total penalty among the days its hard rules allow. Penalties are listed in approximate order of strength. All weights will become configurable in a future release. (see [`dayColoring.ts`](src/engine/dayColoring.ts) – `colorPenalty`, and [`crossover.ts`](src/engine/crossover.ts) – `crossoverPenalty`)
~~~

## Block 76 – Warning-Level Rules, new Pool Start Cutoff and Strip-Hour Feasibility, :225

Sources (cluster block K3-03): O2 (rule id `pool-start-after-cutoff`); default 13 (`LATEST_START_MINS` deleted, O2 uses the offset); default 14 (R5: the feasibility WARN under Warning-Level Rules, slack unsourced); audit K2, AX-CUTOFF, P2a, R5; O10 (2026-10-08: the store's board check emits `pool-start-after-cutoff` for engine-placed and hand-moved events, as drafted)

Before:
~~~
- A phase that cannot meet its limit fails the attempt, and two failed attempts still leave the event unscheduled (see [Two-Attempt Retry](#two-attempt-retry))
~~~

After:
~~~
- A phase that cannot meet its limit fails the attempt, and two failed attempts still leave the event unscheduled (see [Two-Attempt Retry](#two-attempt-retry))

### Pool Start Cutoff

- An event's first pool phase – its pools, or Flight A for a flighted event – should start no later than 7 hours after its day's start, which is 4:00 PM on a 9:00 AM day (`LATEST_START_OFFSET` in [`constants.ts`](src/engine/constants.ts)). Flight B is not checked
- An event whose first pool phase starts later is still placed, and the engine emits a structured WARN for that event with its pool start time (rule `pool-start-after-cutoff`). A hand move is checked against the cutoff at once, the way it is checked for late finishes. No event is dropped or moved for it
- Unsourced: no current USA Fencing source states a cutoff. The 2026-27 Ops Manual's only clock time is p.17's "should complete no later than 7 p.m. if started by 9 a.m." The cutoff is Piste Planner's own rule, from the owner's requirements of 2026-03-24, and is listed in [Appendix B](#appendix-b-departures-from-the-operations-manual)

### Strip-Hour Feasibility

- Before scheduling, the engine compares the whole tournament's estimated strip-hours with what the venue offers: general strip-hours against days × the strip total (video strips included) × the 10-hour planning day, and, when any event needs video, video strip-hours against days × video strips × 10 hours
- When demand exceeds capacity by more than 15%, the engine emits a WARN (rule `feasibility-strip-hours`, or `feasibility-video-strip-hours` for video) with the shortfall and the extra days or extra strips that would cover it
- The check never stops scheduling. The scheduler goes on to place what fits
- The 15% slack is unsourced (see [Appendix A](#appendix-a-penalty--constant-defaults)). It allows for the estimate's worst-case padding, which real schedules routinely run inside
- (see [`validation.ts`](src/engine/validation.ts) – `validateFeasibility`)
~~~

## Block 77 – Same-Day Completion, last phase, :224

Sources (cluster block K3-02): default 14 (SC2 :224 "the video stage"); audit SC2

Before:
~~~
- An event's last phase (the event's final allocated phase: its DE, or the round-of-16 video stage for a staged DE – the gold and bronze bouts are not allocated) may end past the hard end when it starts before the hard end and ends by midnight of that day. The event is placed, and the engine emits a structured WARN for that event whose estimated finish is that last phase's end
~~~

After:
~~~
- An event's last phase (the event's final allocated phase: its DE, or the video stage for a staged DE – the gold and bronze bouts are not allocated) may end past the hard end when it starts before the hard end and ends by midnight of that day. The event is placed, and the engine emits a structured WARN for that event whose estimated finish is that last phase's end
~~~

## Block 78 – Warning-Level Rules, intro, :216

Sources (cluster block K3-01): default 14 (SC2 :216 wording); audit SC2

Before:
~~~
These rules produce warnings but do not block scheduling.
~~~

After:
~~~
These rules produce warnings but do not block scheduling. Same-Day Completion also states the hard limits behind its warning: a phase that breaks one fails its attempt instead of drawing a warning.
~~~

## Block 79 – Fencer Count Bounds, :210

Sources (cluster block K2-12): default 14 (R2, a per-event ERROR excludes that event); audit R2, RX2.1 (verifier correction)

Before:
~~~
- Events outside this range are rejected in validation
~~~

After:
~~~
- An event outside this range draws an ERROR in validation and is excluded from the schedule, and the rest of the tournament is scheduled (see [Phase 1: Validation](#phase-1-validation))
~~~

## Block 80 – Team Events Cannot Use Cuts, :203

Sources (cluster block K2-11): default 14 (R3); audit R3, RX2.1 (verifier correction)

Before:
~~~
- Cut-to-DE settings are rejected in validation AND not allowed in the UI
~~~

After:
~~~
- A cut-to-DE setting on a team event is ignored with a WARN, and the UI offers none
~~~

## Block 81 – Resource Preconditions, video strip count, :190

Sources (cluster block K2-10): O5; default 14 (R2, the per-event exclusion); audit UV1b, RX2.1 (verifier correction), R2

Before:
~~~
**Video strip minimum**: A NAC needs video strips for its concurrent video stages, because every individual event at a NAC runs a staged DE with video REQUIRED (Ops Manual p.19 – Video Replay). Video strips come in multiples of 4. The minimum is 4, one video stage's ask of `min(4, bracketSize / 2)`, and 8+ is recommended when multiple video-required events share a day.
~~~

After:
~~~
**Video strip count**: every individual event at a NAC runs a staged DE with video REQUIRED (Ops Manual p.19 – Video Replay), and its video stage asks for `min(4, bracketSize / 2)` video strips. An event whose ask exceeds the video strip count draws an ERROR and is excluded from the schedule, and the rest of the tournament is scheduled. The organizer may set any video strip count from 0 to the strip total, at any tournament type. A NAC defaults to 8, which lets two events run their video stages at once. At other types video strips are used best-effort.
~~~

## Block 82 – Resource Preconditions, flighted halving, :186

Sources (cluster block K2-09): default 12 (L15: the strip minimum halves for an event that splits into flights; R4: flighting groups are gone); audit L15, SEV-resource-precondition-strips, C3

Before:
~~~
Where `max_pools_any_event = max(ceil(fencer_count / 7))` across all events. For flighted events (see [Flighting](#flighting)), the requirement is halved: `ceil(pools / 2)`.
~~~

After:
~~~
Where `max_pools_any_event = max(ceil(fencer_count / 7))` across all events. For an event that splits its pools into Flight A and Flight B (see [Flighting](#flighting)), the requirement is halved to Flight A's share: `ceil(pools / 2)`.
~~~

## Block 83 – Single-Day Fit, :173–174

Sources (cluster block K2-08): default 10 (C7a, V2, V2b, SEV); default 8 (the :174 ind+team clause, SC3, L13); O8 (the wait lapses when the event waited on is never placed); audit C7a, V2, V2b, R1, SEV-same-day-completion, SC2

Before:
~~~
- A competition's worst-case duration (pool round + 30-minute admin gap + full DE) must fit on one day: every phase but its last ends by the day's hard end (9:00 AM to 10:00 PM by default, 13 hours), and its last phase starts before the hard end and ends by midnight. Running past the 7:00 PM soft target is a warning, not a violation, and so is a last phase that runs past the hard end (see [Same-Day Completion](#same-day-completion))
- If an individual and team event are on the same day, their combined worst-case duration (including the 2-hour gap) must also fit
~~~

After:
~~~
- A competition's worst-case duration (pool round + 30-minute admin gap + full DE) must fit on one day: every phase but its last ends by the day's hard end (9:00 AM to 10:00 PM by default, 13 hours), and its last phase starts before the hard end and ends by midnight. Running past the 7:00 PM soft target is a warning, not a violation, and so is a last phase that runs past the hard end (see [Same-Day Completion](#same-day-completion))
- The limit is enforced when phases are placed, not in [Phase 1: Validation](#phase-1-validation). A phase that would break it fails the attempt (see `SAME_DAY_VIOLATION` in [Bottlenecks Specific to the Concurrent Scheduler](#bottlenecks-specific-to-the-concurrent-scheduler)), and two failed attempts leave the event unscheduled (see [Two-Attempt Retry](#two-attempt-retry))
- An individual and team event of one category, weapon and gender share a day only through a pin or the least-bad fallback (see [Same-Population Conflicts](#same-population-conflicts) and [When Days Are Too Few](#when-days-are-too-few)). The team event's pools are then not ready until 120 minutes after the individual event's last phase ends, whatever order the two are placed in, and every phase of both events must still meet the limit above (see [Cross-Event Dependency Edges](#cross-event-dependency-edges)). When the event waited on is never placed, the wait lapses and the waiting event's pools are ready as if it did not exist – from day start, or from any other floor that applies to it, such as the regional Group 1 window
~~~

## Block 84 – Group 1, Y10 and Div 3 affinity and pointer, :167–169

Sources (cluster block K2-07): O6; O9 (2026-10-08: the Y10↔Div 3 bonus needs the same weapon and gender, as drafted); audit L9b

Before:
~~~
**Affinity for unrelated events** on the same day is preferred – e.g., Y10 and Div 3 have no fencer overlap, which makes a good same-day pairing.

(see [`constants.ts`](src/engine/constants.ts) – `GROUP_1_MANDATORY`, `CROSSOVER_GRAPH`)
~~~

After:
~~~
**Affinity for unrelated events** on the same day is preferred – e.g., Y10 and Div 3 have no fencer overlap, which makes a good same-day pairing. Day assignment scores this one pairing, Y10 and Div 3 of the same weapon and gender, with the same -0.4 same-day bonus as Y8 and Y10 (see [Appendix A](#penalty-weights)).

(see [`constants.ts`](src/engine/constants.ts) – `GROUP_1_MANDATORY`, `CROSSOVER_GRAPH`, and [`dayColoring.ts`](src/engine/dayColoring.ts) – `colorPenalty` for the two same-day bonuses)
~~~

## Block 85 – Departures From the Manual, Veteran co-day removed, :165

Sources (cluster block K2-14): O11 (owner annotation, 2026-10-08)

Before:
~~~
- **Age-banded Veteran events** of one gender and weapon share a day, although Vet 40–80 are adjacent age groups (see [Veteran Age-Group Co-Day Rule](#veteran-age-group-co-day-rule)).
~~~

After: nothing – the Before lines are deleted.

## Block 86 – Departures From the Manual, Y8 with Y10, :164

Sources (cluster block K2-06): O6; audit L9b

Before:
~~~
- **Y8 can and should share a day with Y10**, although Ops Manual p.20 – Group 1 bullet 2 keeps immediately adjacent age groups apart.
~~~

After:
~~~
- **Y8 can and should share a day with Y10** of the same weapon and gender, although Ops Manual p.20 – Group 1 bullet 2 keeps immediately adjacent age groups apart. Day assignment gives the pair a -0.4 same-day bonus (see [Appendix A](#penalty-weights)).
~~~

## Block 87 – Regional Types, Group 1 penalty, :150

Sources (cluster block K2-05): default 2 (:150 names the cross-level ind/team exception); audit RX3

Before:
~~~
At ROC, RYC and RJCC fencers often enter several events in one day (Y14 in the morning, Div 2 in the afternoon). Every Group 1 pair is a soft preference there: day assignment adds the regional Group 1 pair penalty when a pair shares a day (see [Appendix A](#penalty-weights)).
~~~

After:
~~~
At ROC, RYC and RJCC fencers often enter several events in one day (Y14 in the morning, Div 2 in the afternoon). Every Group 1 pair is a soft preference there: day assignment adds the regional Group 1 pair penalty when a pair shares a day (see [Appendix A](#penalty-weights)). The exception is Div 1 individual ↔ Junior team and Junior individual ↔ Div 1 team, which stay hard at every type (see [Individual/Team Separation](#individualteam-separation)).
~~~

## Block 88 – Within-Day Age-Descending Order, :116–118

Sources (cluster block K2-04): O1; O8 (the wait lapses when the event waited on is never placed); default 13 (daySequencing.ts deleted); audit DS, DS-EDGE (verifier correction), PT-9, R9 (verifier correction), L8, L13 (verifier correction)

Before:
~~~
- **On a Vet co-day for (gender, weapon), age-banded events are sequenced in age-descending order:** VET80 → VET70 → VET60 → VET50 → VET40. Older fencers run first so a VET80 fencer can complete their primary event before starting any nested-eligible event (VET70/60/50/40 — USA Fencing Veterans are nested-eligible).
- A within-day sort key orders the siblings, after the indiv-before-team rule and before strip-demand. The sort key alone only governs which sibling starts first – with ample strips, age-banded siblings could otherwise still run in parallel.
- Implementation: `vetAgeOrderingKey` and `VET_AGE_ORDER` in [`src/engine/daySequencing.ts`](src/engine/daySequencing.ts), inserted as comparator key 3.5 in `sequenceEventsForDay`. Strict end-to-end serialization is enforced by the concurrent scheduler's cross-event dependency edge `younger_sibling.pools.ready_time = older_sibling.last_phase.end_time + ADMIN_GAP_MINS`, wired in `applyCrossEventEdges` (see [Cross-Event Dependency Edges](#cross-event-dependency-edges)).
~~~

After:
~~~
- **On a Vet co-day for (gender, weapon), age-banded events start oldest first with a 60-minute stagger:** VET80 → VET70 → VET60 → VET50 → VET40. Each younger band's pools become ready 60 minutes after the pools of the next-older band on that day start.
- Older bands start first because USA Fencing Veterans are nested-eligible: a VET80 fencer's primary event is under way before the younger bands they may also enter.
- No band waits for another band to finish, so once started the bands may run side by side.
- The stagger holds whatever order the events are placed in: a younger band's pools are not ready until 60 minutes after the next-older band's pools start, even when that band is placed later. The concurrent scheduler holds the stagger as a cross-event dependency edge (see [Cross-Event Dependency Edges](#cross-event-dependency-edges) and [`concurrentScheduler.ts`](src/engine/concurrentScheduler.ts) – `applyCrossEventEdges`). When the event waited on is never placed, the wait lapses and the waiting event's pools are ready as if it did not exist – from day start, or from any other floor that applies to it, such as the regional Group 1 window.
- No age-banded band has a fixed start offset. The 2-hour start offset applies to Vet Combined only, which never shares the co-day (see [Age-Category Weights](#age-category-weights)).
- The stagger is Piste Planner's own rule and is unsourced – the one reference found by web research for the 2026-08-31 methodology review describes the 2026 NAC Veteran events as "scheduled on the same day with different start times" (see backlog §Vet co-day serialization is unsourced). It is listed in [Appendix B](#appendix-b-departures-from-the-operations-manual).
~~~

## Block 89 – Veteran Age-Group Co-Day Rule, split co-day WARN, :112

Sources (cluster block K2-03): default 9 (R7b, `vet-co-day-split`); default 2 (a split Vet co-day draws its own WARN); audit R7b, R7c

Before:
~~~
- This is an additional hard rule beyond [Same-Population Conflicts](#same-population-conflicts) — it forces both *consolidation* (among age-banded events) and *separation* (Vet Combined from age-banded).
~~~

After:
~~~
- This is an additional hard rule beyond [Same-Population Conflicts](#same-population-conflicts) – it forces both *consolidation* (among age-banded events) and *separation* (Vet Combined from age-banded).
- When a pin or the least-bad fallback (see [When Days Are Too Few](#when-days-are-too-few)) splits the age-banded events of one gender and weapon across days, the engine emits a WARN with rule `vet-co-day-split`, and so does the check that runs when the organizer moves an event by hand. Like the other broken hard rules it cannot be dismissed. The check reads the final day map, pins included.
~~~

## Block 90 – Veteran Age-Group Co-Day Rule, not a departure, :110

Sources (cluster block K2-13): O11 (owner annotation, 2026-10-08)

Before:
~~~
- This departs from Ops Manual p.20 – Group 1 bullet 2, which keeps immediately adjacent age groups off the same day (see [Appendix B: Departures from the Operations Manual](#appendix-b-departures-from-the-operations-manual)).
~~~

After:
~~~
- Ops Manual p.20 – Group 1 bullet 2 keeps immediately adjacent age groups off the same day, and that rule does not reach the Veteran age bands. Vet 40, Vet 50, Vet 60, Vet 70 and Vet 80 are not separate age groups in the manual's sense: they are one Veteran event split into sub-events by age band. So the bands always share a day and carry no adjacent-age separation, and the co-day is not a departure from the manual (owner ruling, 2026-10-08).
~~~

## Block 91 – Same-Population Conflicts, :90

Sources (cluster block K2-02): default 2 (:90 "hard at every tournament type"); audit RX2.2, C4 (verifier correction)

Before:
~~~
- Two competitions with **identical age category, gender, and weapon** cannot be on the same day. This includes individual + team pairs of the same category and weapon: Junior Men's Foil ind + Junior Men's Foil team, Cadet Women's Epee ind + Cadet Women's Epee team, **Vet Men's Foil ind + Vet Men's Foil team**, etc., all must be on different days. This is hard at every relaxation level.
~~~

After:
~~~
- Two competitions with **identical age category, gender, and weapon** cannot be on the same day. This includes individual + team pairs of the same category and weapon: Junior Men's Foil ind + Junior Men's Foil team, Cadet Women's Epee ind + Cadet Women's Epee team, **Vet Men's Foil ind + Vet Men's Foil team**, etc., all must be on different days. This is hard at every tournament type.
~~~

## Block 92 – Hard Constraints, intro, :86

Sources (cluster block K2-01): default 2 (RX2.1, :86 – the stopping rules are a different set from the day rules); default 3 (PT-1); default 9; default 10; default 14 (R2, R3); audit RX2.1 (verifier correction), PT-1, R7c, SEV-same-population

Before:
~~~
These rules cause scheduling to fail or produce errors. They are never relaxed. The one exception by tournament type is [Overlapping-Population Separation (Group 1)](#overlapping-population-separation-group-1): it is hard at national types and soft at regional types. (see [`crossover.ts`](src/engine/crossover.ts), [`dayAssignment.ts`](src/engine/dayAssignment.ts))
~~~

After:
~~~
These rules are never traded for a soft preference, but they do not all act the same way:
- **Validation rules are checked** before any day is assigned (see [Phase 1: Validation](#phase-1-validation)). [Fencer Count Bounds](#fencer-count-bounds), an invalid cut value and the [video strip count](#resource-preconditions) draw an ERROR that excludes only the event it names, and the rest are scheduled. Any other validation ERROR stops the whole tournament – among them a strip total that is not positive, a day count outside 1–14, the [strip minimum](#resource-preconditions) and a [team event with no matching individual](#team-events-require-a-matching-individual).
- **Day rules block a day outright**: [Same-Population Conflicts](#same-population-conflicts), [Individual/Team Separation](#individualteam-separation), the [Veteran Age-Group Co-Day Rule](#veteran-age-group-co-day-rule), [Div 1 and Div 1A on different days](#departures-from-the-manual), and [Group 1 at national types](#national-types-hard). When the days are too few for an event, day assignment still places it, on the least-bad day, and the broken rule draws a WARN instead of stopping the schedule (see [When Days Are Too Few](#when-days-are-too-few)).
- **[Single-Day Fit](#single-day-fit) is enforced when phases are placed**, not in validation.

[Team Events Cannot Use Cuts](#team-events-cannot-use-cuts) draws only a WARN. The one exception by tournament type is [Overlapping-Population Separation (Group 1)](#overlapping-population-separation-group-1): it is hard at national types and soft at regional types. (see [`validation.ts`](src/engine/validation.ts) – `validateConfig`, [`concurrentScheduler.ts`](src/engine/concurrentScheduler.ts) – `scheduleAllConcurrent`, [`crossover.ts`](src/engine/crossover.ts), [`constraintGraph.ts`](src/engine/constraintGraph.ts), [`dayColoring.ts`](src/engine/dayColoring.ts))
~~~

## Block 93 – Outputs, the time paragraph and the 4:00 PM pool cutoff, :80

Sources (cluster block K1-07): O2; default 13 (`LATEST_START_MINS` is deleted, O2 uses the offset); audit AX-CUTOFF, K2 (verifier correction: offset, not clock 16:00), P2a

Before:
~~~
All times are minutes from midnight (e.g., 540 = 9:00 AM). The default scheduling day runs from 9:00 AM to 7:00 PM (10 hours), the planning day of Ops Manual p.17. 7:00 PM is a soft target: the engine may place work until the day's hard end at 10:00 PM, and a day that ends after 7:00 PM draws a warning. An event's last phase alone may end past the hard end, up to midnight, and draws a warning of its own (see [Same-Day Completion](#same-day-completion)). Pool rounds cannot start after 4:00 PM – this cutoff is unsourced, since the 2026-27 manual sets none. (see [`constants.ts`](src/engine/constants.ts))
~~~

After:
~~~
All times are minutes from midnight (e.g., 540 = 9:00 AM). The default scheduling day runs from 9:00 AM to 7:00 PM (10 hours), the planning day of Ops Manual p.17. 7:00 PM is a soft target: the engine may place work until the day's hard end at 10:00 PM, and a day that ends after 7:00 PM draws a warning. An event's last phase alone may end past the hard end, up to midnight, and draws a warning of its own (see [Same-Day Completion](#same-day-completion)). An event's first pool phase – its pools, or Flight A when it is flighted – should not start later than 7 hours after day start, which is 4:00 PM on a 9:00 AM day. An event whose first pool phase starts later is still placed, never dropped or moved, and draws a WARN (`pool-start-after-cutoff`) that carries its start time. Flight B is exempt. This cutoff is Piste Planner's own rule and unsourced, since no current USA Fencing source sets one (see [Pool Start Cutoff](#pool-start-cutoff), [Appendix B](#appendix-b-departures-from-the-operations-manual), and [`constants.ts`](src/engine/constants.ts) – `DAY_START_MINS`, `DAY_END_MINS`, `DAY_HARD_END_MINS`, `LATEST_START_OFFSET`).
~~~

## Block 94 – Inputs, per-competition options (start time, latest end, flighting), :60–62

Sources (cluster block K1-06): default 14 (UV1c: start time and latest end move to the per-day input, see K1-05); default 12 (flighting is an organizer toggle the engine suggests, the suggestion stays advisory); audit UV1c, SC1c

Before:
~~~
  - **Start time**: defaults to 9:00 AM (Ops Manual p.17), and the user can adjust it per day
  - **Latest end time**: defaults to 7:00 PM, a soft target with a 10:00 PM hard end. An event's last phase alone may run past the hard end, up to midnight, with a warning (see [Same-Day Completion](#same-day-completion))
  - **Flighting**: triggered when a competition's pool count exceeds the per-event strip cap (see [Strip Budget](#strip-budget))
~~~

After:
~~~
  - **Flighting**: a per-event toggle the organizer turns on. The engine suggests it when a competition's pool count exceeds the per-event strip cap, and the suggestion is advisory – the engine never flights an event itself (see [Strip Budget](#strip-budget) and [Flighting Suggestion](#flighting-suggestion))
~~~

## Block 95 – Inputs, tournament duration and day times, :54–55

Sources (cluster block K1-05): default 14 (:54 states 2–4 days as the offered range, saved files accept 1–14 with a WARN outside 2–4; UV1c moves start time and latest end into a per-day input); O3 (day assignment uses every day the organizer chose); audit SEV-days-available-range, UV1a (verifier correction), CAL-CAP (verifier correction), UV1c

Before:
~~~
- **Tournament duration**: 2–4 days (longer events, e.g. Summer Nationals, to be supported in a future version)
  - Loading a template raises the day count to that template's minimum when the board has fewer days, and never lowers it. The minimum is the fewest days that meet every hard day rule among the template's events under the board's tournament type – hard pairs on different days, and each Veteran age-group co-day on one day. The days already on the board keep their start and end times, and each added day gets the default 9:00 AM to 7:00 PM. Under NAC, SYC and SJCC the NAC Cadet/Junior, NAC Div1/Junior and NAC Vet/Div1/Junior templates need 4 days and Junior Olympics needs 3. Under ROC, RYC and RJCC, where Group 1 pairs are soft (see [Regional Types](#regional-types-soft-with-a-time-of-day-window)), NAC Vet/Div1/Junior needs 3. Every other combination of template and type needs 2 or fewer.
~~~

After:
~~~
- **Tournament duration**: 2–4 days, the range the app offers. A saved file may hold any count from 1 to 14, and the engine schedules it with a warning (`days-available-range`) when the count falls outside 2–4. A count outside 1–14 is an error (`days-available-bounds`). Day assignment uses every day the organizer chose (see [Capacity-Aware Day Assignment](#capacity-aware-day-assignment))
  - Loading a template raises the day count to that template's minimum when the board has fewer days, and never lowers it. The minimum is the fewest days that meet every hard day rule among the template's events under the board's tournament type – hard pairs on different days, and each Veteran age-group co-day on one day. The days already on the board keep their start and end times, and each added day gets the default 9:00 AM to 7:00 PM. Under NAC, SYC and SJCC the NAC Cadet/Junior, NAC Div1/Junior and NAC Vet/Div1/Junior templates need 4 days and Junior Olympics needs 3. Under ROC, RYC and RJCC, where Group 1 pairs are soft (see [Regional Types](#regional-types-soft-with-a-time-of-day-window)), NAC Vet/Div1/Junior needs 3. Every other combination of template and type needs 2 or fewer.
- **Day times**, set per day:
  - **Start time**: defaults to 9:00 AM (Ops Manual p.17)
  - **Latest end time**: defaults to 7:00 PM, a soft target with a 10:00 PM hard end. An event's last phase alone may run past the hard end, up to midnight, with a warning (see [Same-Day Completion](#same-day-completion))
~~~

## Block 96 – Inputs, refs per pool, :53

Sources (cluster block K1-04): default 13 (L16: "set by type", not "defaulted"); audit L16

Before:
~~~
  - **Refs per pool**: 1 or 2, defaulted by tournament type – two at NAC, SYC and SJCC, one at ROC, RYC and RJCC (unsourced, see [Refs Per Pool](#refs-per-pool-input-that-affects-the-output)). It is not a scheduling input (see [Not Scheduling Inputs](#not-scheduling-inputs))
~~~

After:
~~~
  - **Refs per pool**: 1 or 2, set by tournament type – two at NAC, SYC and SJCC, one at ROC, RYC and RJCC (unsourced, see [Refs Per Pool](#refs-per-pool-input-that-affects-the-output)). It is not a scheduling input (see [Not Scheduling Inputs](#not-scheduling-inputs))
~~~

## Block 97 – Inputs, video strip count, :51

Sources (cluster block K1-03): O5; audit AX-VIDEO (with its verifier correction on "NACs only"), UV1b

Before:
~~~
  - **Video strip count** (NACs only): 4, 8 (default), 12, or 16. These strips are used for the Video stage of staged DEs. Each video stage asks for `min(4, bracketSize / 2)` video strips, so the default of 8 lets two events run their video stages at once. Multiple events in the video stage contend for these strips.
~~~

After:
~~~
  - **Video strip count**: how many of the strips have video, any count from 0 to the strip total, at every tournament type – 8 by default at a NAC and 0 elsewhere. At a NAC these strips are used for the video stage of staged DEs. Each video stage asks for `min(4, bracketSize / 2)` video strips, so the default of 8 lets two events run their video stages at once. Multiple events in the video stage contend for these strips. At every other type video replay is best-effort, so no phase needs a video strip and any phase may use one after the plain strips (see [Video Replay Policy](#video-replay-policy)).
~~~

## Block 98 – Table of Contents, :19

Sources (cluster block K1-02): default 2 (rename §Constraint Relaxation to "When Days Are Too Few", fix the TOC); audit RX1

Before:
~~~
5. [Constraint Relaxation](#constraint-relaxation)
~~~

After:
~~~
5. [When Days Are Too Few](#when-days-are-too-few)
~~~

## Block 99 – Intro, :3

Sources (cluster block K1-01): default 4 (C10); default 9 (the hand-placement check also reports a split Vet co-day); audit C10. Worded to match default 4 and K5-06. Feature 020's blocking-error hold and "Re-run automatically" Settings switch are left out – if the owner wants them documented, the same clause goes into K1-01 and K5-06 together; O10 (2026-10-08: the store's board check emits `pool-start-after-cutoff` for engine-placed and hand-moved events, as drafted)

Before:
~~~
This document defines the rules, constraints, and penalty weights that Piste Planner uses to **suggest** a tournament schedule. The scheduling algorithm produces an initial layout; users then refine it via drag-and-drop on a day/strip grid. The engine re-validates after each adjustment, surfacing warnings and errors.
~~~

After:
~~~
This document defines the rules, constraints, and penalty weights that Piste Planner uses to **suggest** a tournament schedule. The scheduling algorithm produces an initial layout, and the organizer refines it by moving events to other days. A moved event is pinned to its new day. Each hand move is checked at once, without a new engine run, against the hard same-day pairs, a split Veteran co-day, the regional Group 1 window, the first- and last-day length, a first pool phase that starts after the cutoff, and late or overrun finishes, and the app reports what the move breaks. Auto-assign re-runs the engine around the pins after every edit to an engine input.
~~~

## Left out of this amendment

Each item has its own backlog entry and stays as it is:

- `cut-value-min-promotions` reads a percentage cut inverted (backlog §`validation.ts` reads a percentage cut…).
- `regional-cut-override` for callers outside the store.
- `strips-total-positive` on NaN.
- The medal-tail WARN entries (backlog :623, :723).
- The better least-bad fallback (backlog §Runtime failure is terminal). §When Days Are Too Few describes today's behaviour, the first tied day, and promises nothing more.
- The R6 clique WARN, declined by 019's R3 – marked settled.
- The backlog §Calibration debt scenario is not added (O3): it presupposed a "fewest days" pass that never worked.
