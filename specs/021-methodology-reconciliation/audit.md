# 021 audit – condensed record

On 2026-10-08, 32 agents audited every 021 METHODOLOGY-reconciliation scope item against the engine at `5edbdf7712`: 16 auditors, one per group, each followed by an adversarial verifier that re-checked every item and named what the auditor missed. Probe logs sit git-ignored in `<wt>/tmp/021-audit/`. Where a verifier CORRECTED an item, the correction wins. The rulings and defaults the audit led to are in [`decisions.md`](./decisions.md).

Each field is cut to 400 characters (a verifier's missed note to 800), so a cut ends in "…". Evidence tags: [R] read in the source, [M] measured by a probe.

## G01-time-of-day

### W1 – METHODOLOGY.md text stating the eight retired time-of-day rules and their two constants

- **Status:** OPEN. **Verifier:** CORRECTED.
- **Evidence:** [R] METHODOLOGY.md now: L245 "When two high-crossover competitions are on the same day within 30 minutes: **strong penalty**". L246 "Lower crossover within 30 minutes: **moderate penalty**". L248-252 §Early-Start Conflicts: heading plus 3 bullets ("both starting at day start on the **same day**: penalty" / "...on **consecutive days**" / "Individual + team ... both starting early on consecutive…
- **Doc change:** Delete L245-246 and put one live bullet in their place: same-day crossover is scored per day by the crossover-graph weight (dayColoring.ts:336-343). Delete L248-252 (§Early-Start Conflicts). Delete the L290 row. Delete Appendix A rows L988-994 and L1003. Change L1026 to "THRESHOLD_MINS | 10 min | Bottleneck detection threshold". Delete L1027. Re-point L817 and L1120 to §Within-Day Priority Order…
- **Owner question:** Approve the replacement bullet for L245-246. It newly documents a live day-level rule: two crossover events on one day add their crossover-graph edge weight. Today the doc states that rule nowhere. The other option is to delete L245-246 with no replacement.
- **Verifier correction:** Status OPEN stands, and every quoted line is right [R]: L245-246, L248-252, L290, L988-994, L1003, L1026-1027, L817, L1120, and a TOC (L13-37) with no Soft Preferences subsections. C6 is fixed by 6a4107b710 (024 diff turns 'Y10 non-first-slot' into 'Y8/Y10'). Two fixes to the doc_change. (1) The proposed L1026 text 'THRESHOLD_MINS | 10 min | Bottleneck detection threshold' would document a dead…

### W2 – src/ and __tests__/ references to the eight keys and the two constants

- **Status:** OPEN. **Verifier:** CORRECTED.
- **Evidence:** [R] grep shows the 8 keys only at their definitions: constants.ts:671-685 (7 keys + doc comments) and :697-698 (Y10_NON_FIRST_SLOT). Nothing outside constants.ts reads them. SAME_TIME_WINDOW_MINS: constants.ts:118, types.ts:290 (TournamentConfig), buildConfig.ts:18,109, factories.ts:62, buildConfig.test.ts:13,330. EARLY_START_THRESHOLD: constants.ts:125, types.ts:292, buildConfig.ts:20,111,…
- **Engine change:** Delete the 8 PENALTY_WEIGHTS keys and their comments (constants.ts:671-685 minus REGIONAL_GROUP_1_PAIR, and :697-698). Delete the constants SAME_TIME_WINDOW_MINS (:118) and EARLY_START_THRESHOLD (:125). Delete the TournamentConfig fields at types.ts:290 and :292, and the imports and config entries at buildConfig.ts:18,20,109,111. Update the constants.ts:668 header if Appendix A changes.…
- **Verifier correction:** Status OPEN, size XS and moves_drift no all stand. The grep matches exactly [R]. Rerun with SAME_TIME_WINDOW_MINS, EARLY_START_THRESHOLD and THRESHOLD_MINS at 9999: output identical, scheduled 24/24/24/24/12/51/18/53, ERRORs 0/0/0/6/0/3/0/0 [M, G01v-verify.log]. The drift digest hashes outputs, not config (driftLedger.test.ts:313-370). configKeyOf is src/store/keptRun.ts:92 (not src/engine), and…

### W3 – Parts of the retired rules still implemented elsewhere, which the doc must keep

- **Status:** OPEN. **Verifier:** CORRECTED.
- **Evidence:** [R] Y8/Y10 first: concurrentScheduler.ts:1523-1534, isYouthPriorityCategory → `category === Category.Y8 || category === Category.Y10`, and compareNodes `if (aYouth !== bYouth) return aYouth ? -1 : 1` second, after ready_time. [M] Every Y8/Y10 event in B3 (6), B4 (12) and B6 (12) starts its pools at day start, offset 0. Ind→team 120 min: applyCrossEventEdges :679-689 pushes `min_gap:…
- **Doc change:** Keep these, unchanged or re-pointed: L643-649 §Within-Day Priority Order item 2 (drop its daySequencing.ts pointer when that file goes). L668 ind→team edge. L670 and L148-158 regional window. L292-297 day-order bullets, plus Appendix A L999-1000, L1004 and L1007. L1085 "Ind/team separation gap 120 min" stays live, but its "(non-hard-blocked pairs)" is wrong: the engine applies the gap only to…
- **Owner question:** Retiring INDIV_TEAM_SAME_TIME_OR_WRONG_ORDER (8.0) settles C4: TEAM_BEFORE_INDIVIDUAL (1.0) becomes the only 'team before individual' weight. Confirm the 120-minute rule applies only to same-category ind/team pairs as coded. The other reading is the doc's 'other overlapping individual/team pairs' (L299, the Vet team / Div 2 example), which the engine does not implement (item 8).
- **Verifier correction:** Status OPEN and the substance stand. Line fixes: (1) Appendix A L1000 is 'Weapon balance | 0.5', not a day-order row. The live ind/team rows are L999 (Team before individual 1.0), L1004 (Ind+team 2+ days 0.3) and L1007 (Ind+team day after -0.4). (2) The regional window is concurrentScheduler.ts:743-756 (applyRegionalWindowFloors, line 755 adds REGIONAL_GROUP_1_WINDOW_MINS), not dayColoring.ts,…

### W4 – Retirement record paragraph and where it lives

- **Status:** OPEN. **Verifier:** CORRECTED.
- **Evidence:** [R] No METHODOLOGY section records retirements yet: grep for 'retired' and 'casualt' finds nothing. L637 and L871 are the doc's only Phase D notes. 5eb5065382 (2026-04-20) deleted the start-time-estimating scorer as dead. Phase D shipped 2026-04-27 (L637). Draft for a new '### Retired Time-of-Day Preferences' at the end of §Soft Preferences (after L304, before §Constraint Relaxation), with a…
- **Doc change:** Insert the paragraph above as a new subsection at the end of §Soft Preferences (after current L304), and add an Appendix A note after L1009 pointing to it. The TOC needs no entry. Owner approval is required before the commit.
- **Owner question:** Approve the wording and placement: a §Soft Preferences subsection plus an Appendix A pointer. The other placement is a note in Appendix A only.
- **Verifier correction:** Status OPEN stands. No 'retired' or 'casualt' text appears in METHODOLOGY [R]. L304 is the end of §Soft Preferences and §Constraint Relaxation starts at L308. Three fixes. (1) The Appendix A penalty table ends at L1010 (Ind/team cross-level block), so the pointer goes after L1010, not L1009. (2) The draft's 'individual and team at the same time or under 120 minutes apart' drops part of…

**Missed by the auditor (G01-time-of-day):** (1) Five orphan BottleneckCause members at src/engine/types.ts:116-120 (SAME_TIME_CROSSOVER, SCHEDULED_8AM_SAME_DAY_CROSSOVER, SCHEDULED_8AM_CONSECUTIVE_DAYS, SCHEDULED_8AM_INDV_TEAM, INDIV_TEAM_ORDERING) are the retired rules' diagnostics. Nothing emits or reads them, so delete them with the eight keys (see W2). (2) Once L290 and L1003 are deleted, the only Ops Manual citation for Y10-early is in L817 and L1120. L648 (§Within-Day Priority Order item 2) has none, so add 'Ops Manual p.20 – Group 2' there. (3) A related time-of-day statement sits outside the eight and was not audited: L393 'Flighted events have a strong affinity for the day-start time slot'. Flag it to whichever group owns flighting. Verification probe log:…

## G02-weights

### WB – WEAPON_BALANCE has no reader; the day-level term is unwired

- **Status:** OPEN. **Verifier:** CONFIRMED.
- **Evidence:** [R] METHODOLOGY:271-276 "Each day should have a mix of ROW weapons (foil/saber) and epee / An all-ROW or all-epee day: penalty / Penalty should be proportional to competition size / Source: Ops Manual p.20 – Group 2 ('Each day should include a balance of right of way weapon and épée competitions')". Appendix A:1000 "| Weapon balance | 0.5 | All-ROW or all-epee day |". constants.ts:691-692 is…
- **Doc change:** The doc must settle the rule before code (owner approval). §Weapon Balance lines 273-275: say what the mix counts (events or fencers), whether it is per gender, whether teams count, and how 'proportional to competition size' fits with Appendix A:1000's flat 0.5 for an 'All-ROW or all-epee day'. Line 1000's description has to match. Lines 277 and 1128 may stay.
- **Engine change:** Add weaponBalancePenalty(self, c, competitions, coloring) to dayColoring.ts next to crossWeaponSameDemographicPenalty, wired into colorPenalty at :385-389, ungated. Probe finding [M]: a penalty-only form (+0.5 when day c holds only self's class) cannot pull the missing class onto a skewed day, and it left B7's all-ROW day3 in place. A delta form, 0.5×(singleClassAfter − singleClassBefore), gives…
- **Owner question:** Define 'balance': (1) day-level, event count, both genders and teams pooled, binary all-ROW/all-epee (Appendix A as written); (2) per gender; (3) size-weighted. Probe on B1-B8 [M]: flat changes 6/8 partitions but leaves B7 day3 all-ROW. Delta changes 7/8, clears every all-class day, and moves B6 from 51 to 53 scheduled (ERR 3→1). Size-weighted (0.5×fencers/100) costs B6 one event (51→50, ERR 4).…
- **Verifier correction:** I re-checked every quote and line against the worktree. [R] METHODOLOGY:271-277 and Appendix A:1000 are verbatim. constants.ts:691-692 is right, and grep finds no reader in src/, __tests__/ or scripts/. colorPenalty runs from dayColoring.ts:320 to :412. The gap-banded rest-day and proximity loop is at :354-378, crossWeaponSameDemographicPenalty at :289-307 (called at :385), and…

### WB-M – B1-B8 per-day weapon distribution today, and how much a WEAPON_BALANCE term would move

- **Status:** OPEN. **Verifier:** CORRECTED.
- **Evidence:** [M] Probe (log tmp/021-audit/G02-weaponBalance.log): assignDaysByColoring equals the scheduler's assigned_day on every scheduled event. Days with no epee at all: only B7 day3, which holds E0/ROW4 (970 fencers). Per-gender single-class days: B1 day1 W(E0/ROW3) and day3 M(E0/ROW3), B2 day3 W(E0/ROW2), B5 day0 W and day2 M. B3, B4, B6 and B8 have none. B8 day3 is skewed (E2/ROW13) but mixed.…
- **Verifier correction:** The auditor's log numbers match tmp/021-audit/G02-weaponBalance.log line by line. My independent baseline probe (log G02v-baseline.log) [M] agrees on B1, B2, B3, B5, B7 and B8, and every per-day count matches for those. The claim that 'B3, B4, B6 and B8 have none' per-gender single-class days holds only for the coloring of all events. B4 is different on the 24 events that actually schedule. The…

### LR – LAST_DAY_REF_SHORTAGE_LARGE_NAC / _LARGE_ROC / _MEDIUM: dead constants

- **Status:** OPEN. **Verifier:** CONFIRMED.
- **Evidence:** [R] constants.ts:693-694 (0.5), :699-700 (0.3), :709-710 (0.2). [M] grep finds zero readers in src/, __tests__/ and scripts/, and no Appendix A row. The only METHODOLOGY text is Appendix B §Manual Criteria Not Modelled :1131: "**Last-day referee shortage** (Ops Manual p.20 – Group 3). Referees are an output of the schedule, not an input, so there is no shortage to plan around." That line was…
- **Doc change:** None in METHODOLOGY (:1131 already covers it). backlog.md:1407-1409 and :1411-1417 need a dated note that 021 deleted the trio.
- **Engine change:** Delete the three keys and their comments from PENALTY_WEIGHTS (constants.ts:693-694, 699-700, 709-710).
- **Verifier correction:** [R] The keys are at constants.ts:693-694, :699-700 and :709-710. grep finds no reader in src/, __tests__/ or scripts/, and there is no Appendix A row. METHODOLOGY:1131 is quoted exactly, and git log -S ties it to 6a4107b710 (024). methodology-reconciliation.md:403 and backlog.md:1407-1409 and :1411-1417 say what the auditor reports. Deleting the keys does not move drift.

### PW – PENALTY_WEIGHTS census: 20 keys, 8 read

- **Status:** PARTIAL. **Verifier:** CORRECTED.
- **Evidence:** [M] grep, excluding constants.ts. Read: REGIONAL_GROUP_1_PAIR crossover.ts:233 (test constants.test.ts:214); REST_DAY_VIOLATION dayColoring.ts:370; TEAM_BEFORE_INDIVIDUAL :212,:274; INDIV_TEAM_2_PLUS_DAYS :213,:275; INDIV_TEAM_DAY_AFTER :210,:272; PROXIMITY_1_DAY :373; PROXIMITY_3_PLUS_DAYS :376 (tests dayColoring.test.ts:444-491); CROSS_WEAPON_SAME_DEMOGRAPHIC :304. No reader:…
- **Doc change:** Retire Appendix A rows :988-994 and :1003 (owner ruling 2026-10-04). Row :996 "suppressed at level ≥ 2" and §Other Soft Preferences :284-285 "suppressed at level >= 2" name relaxation levels that do not exist. Strike those phrases. Row :1000 per WB.
- **Engine change:** Delete the 8 time-of-day keys (constants.ts:671-684, 697-698) and the LR trio, then wire WEAPON_BALANCE. After that, every key has a reader.
- **Verifier correction:** The status (8 of 20 keys read) and the values are right. Every row at Appendix A:988-1007 equals constants.ts:670-715. The census leaves out readers in src/: crossover.ts:342, :344 and :346 also read INDIV_TEAM_DAY_AFTER, TEAM_BEFORE_INDIVIDUAL and INDIV_TEAM_2_PLUS_DAYS, inside the dead individualTeamProximityPenalty. Those readers are dead, so 'every key has a reader' after 021 holds only if…

### PW-DEAD – Dead duplicate penalty helpers: proximityPenalty, individualTeamProximityPenalty and PROXIMITY_PENALTY_WEIGHTS

- **Status:** OPEN. **Verifier:** CORRECTED.
- **Evidence:** [M] crossover.ts:268-297 proximityPenalty reads PROXIMITY_PENALTY_WEIGHTS (constants.ts:565-570, {0:0,1:-0.4,2:0,3:0.5}) at :292. crossover.ts:326-347 individualTeamProximityPenalty reads TEAM_BEFORE_INDIVIDUAL, DAY_AFTER and 2_PLUS (:342-346). Neither has a src/ caller. They are imported only by __tests__/engine/crossover.test.ts:5,7 (describes at :459 and :530). The live path is…
- **Doc change:** METHODOLOGY:269: replace PROXIMITY_PENALTY_WEIGHTS with PENALTY_WEIGHTS.PROXIMITY_1_DAY / PROXIMITY_3_PLUS_DAYS (the live keys). This needs owner approval as a doc edit.
- **Engine change:** Delete proximityPenalty, individualTeamProximityPenalty and PROXIMITY_PENALTY_WEIGHTS. findIndividualCounterpart (crossover.ts:303) stays because dayColoring uses it.
- **Verifier correction:** Mostly confirmed. proximityPenalty is at crossover.ts:268-297 and reads PROXIMITY_PENALTY_WEIGHTS at :292. individualTeamProximityPenalty is at :326-347. PROXIMITY_PENALTY_WEIGHTS is at constants.ts:565-570, and METHODOLOGY:269 is quoted exactly. The describes are at crossover.test.ts:459 and :530. Two corrections: findIndividualCounterpart (crossover.ts:303) is also live in…

### AX-CUTOFF – Appendix A 'Pool-round cutoff 4:00 PM (960)' is not enforced

- **Status:** NEEDS_OWNER_CALL. **Verifier:** CONFIRMED.
- **Evidence:** [R] METHODOLOGY:1022 "| Pool-round cutoff | 4:00 PM (960 min) | Pool rounds cannot start after this time. Unsourced – the 2026-27 manual sets no cutoff |". constants.ts:57-58 LATEST_START_MINS=960 and LATEST_START_OFFSET=420. Neither is read in src/engine. Only buildConfig.ts:105-106 copies them onto the config (types.ts:282-283). This is audit L7 (methodology-reconciliation.md:462), and backlog…
- **Doc change:** If retired: delete METHODOLOGY:1022 and the 4:00 PM clause near :80.
- **Engine change:** Either enforce it in the concurrent scheduler's pool placement, or delete LATEST_START_MINS / LATEST_START_OFFSET from constants.ts, types.ts and buildConfig.ts.
- **Owner question:** Enforce the unsourced 4 PM cutoff (moves B4/B6 and needs a drift review), or retire the rule and both constants? The backlog already asks this. 021 must either take it or explicitly leave it to its backlog entry.
- **Verifier correction:** [R] METHODOLOGY:80 (the last sentence of that paragraph) and :1022 are quoted correctly. constants.ts:57-58, types.ts:282-283 and buildConfig.ts:105-106 are right, and no engine code reads either constant. backlog.md:511-530 asks the owner for exactly this call: enforce the cutoff, source it, or delete it. The audit's L7 verdict was ENGINE-WRONG, so under the spec-wins default the cutoff would…

### AX-DEADCFG – Appendix A Timing rows name constants no engine code reads

- **Status:** OPEN. **Verifier:** CORRECTED.
- **Evidence:** [M] Read in src/engine by nothing except types.ts and buildConfig.ts: THRESHOLD_MINS (types.ts:288, buildConfig.ts:93), EARLY_START_THRESHOLD (:292/:111), SAME_TIME_WINDOW_MINS (:290/:109) and MAX_RESCHEDULE_ATTEMPTS (:293/:112). The rows are METHODOLOGY:1026 "| THRESHOLD_MINS / EARLY_START_THRESHOLD | 10 min | Bottleneck detection threshold / early start window |" and :1027 "|…
- **Doc change:** Delete METHODOLOGY:1026-1027. They go with the time-of-day retirement.
- **Engine change:** Delete THRESHOLD_MINS, EARLY_START_THRESHOLD, SAME_TIME_WINDOW_MINS, MAX_RESCHEDULE_ATTEMPTS and MORNING_WAVE_WINDOW_MINS (unless another group keeps it for §Video Strip Preservation) from constants.ts, the TournamentConfig fields and buildConfig.ts.
- **Verifier correction:** The readers are as stated. Each name is read only by types.ts, buildConfig.ts, factories.ts and buildConfig.test.ts, and MORNING_WAVE_WINDOW_MINS (constants.ts:77) has none at all. METHODOLOGY:1026-1027 is quoted exactly. One correction to tests_affected: serialization.test.ts:161 uses 'THRESHOLD_MINS: 10' as a literal key in an inert v2-rejection fixture and does not import the constant.…

### AX-CAPCURVE – Capacity penalty: Appendix '[TBD]' and the §Capacity Penalty Curve prose both disagree with the code

- **Status:** OPEN. **Verifier:** CONFIRMED.
- **Evidence:** [R] METHODOLOGY:1102 "| Capacity penalty thresholds | [TBD] |". §Capacity Penalty Curve :905-910 says 0 below 0.60, ramp to 3.0 at 0.80, 10.0 at 0.95, 20.0 above. Code, dayColoring.ts:99-107: 0 to 0.85, a linear ramp to 3.0 at 1.0, then min(20, 3+(f−1)×10). Its comment at :93-97 records the rejected 0.60 curve ("over-steered events in mid-loaded days and caused regressions").…
- **Doc change:** Replace :905-910 with the shipped curve and record the rejection. Replace :1102 [TBD] with 0.85 / 1.0 / slope 10 / cap 20.0. Owner approval needed.
- **Engine change:** Delete the five unread CAPACITY_PENALTY_CURVE members, or make capacityPenalty read named constants for 0.85, 3.0 and 10.0. Behaviour stays the same either way.
- **Verifier correction:** [R] METHODOLOGY:901-910 (§Capacity Penalty Curve, bands <0.60 / 0.60-0.80 / 0.80-0.95 / >0.95) and :1102 '[TBD]' are confirmed. capacityPenalty at dayColoring.ts:99-107 uses 0.85, 1.0 and ramp 3.0, then min(20, 3+(f-1)*10). The rejection comment is at :93-97. Only OVERFLOW_PENALTY is read (:106). The other five CAPACITY_PENALTY_CURVE members (constants.ts:721-734) have no reader. The test…

### AX-VIDEO – Appendix A 'Video strip options 4, 8, 12, 16' does not match the input

- **Status:** NEEDS_OWNER_CALL. **Verifier:** CONFIRMED.
- **Evidence:** [R] METHODOLOGY:1077 "| Video strip options | 4, 8, 12, 16 | Available video strip counts (NACs only). 8 is default, enough for two video stages at once |" and :51 "Video strip count (NACs only): 4, 8 (default), 12, or 16". No constant holds the option set [M grep]. StripsPanel.tsx:190-201 is a free Stepper (min 0, max stripsTotal). serialization.ts:193-196 accepts any count from 0 to…
- **Doc change:** If the doc is wrong: :51 and :1077 say 'any count from 0 to strips_total, default 8 at a NAC'.
- **Engine change:** If the spec wins: restrict the UI and serialization to {4,8,12,16}. This is not an engine change.
- **Owner question:** Is video strip count a fixed menu (4/8/12/16, as the spec says) or any integer, as the shipped Stepper and schema allow? Recommend a DOC-WRONG edit, since a venue's video strip count is a physical fact, but the owner must approve.
- **Verifier correction:** [R] METHODOLOGY:51 and :1077 are quoted exactly. No option-set constant exists. StripsPanel.tsx (src/components/workbench/panels/) :190-201 is a free Stepper with min 0 and max stripsTotal. serialization.ts:190-196 accepts null or any value from 0 to strips_total. The NAC default of 8 is at typeDefaults.ts:26. The auditor missed that 'NACs only' is also contradicted. B4 (SYC, tournaments.ts:94),…

### AX-MATCH – Every other Timing, Resource and Capacity row matches constants.ts

- **Status:** ALREADY_FIXED. **Verifier:** CORRECTED.
- **Evidence:** [R] They match. Timing :1016-1030 = constants.ts:50-52, 62, 66, 73-74, 99-117. Last-phase limit midnight = dayMidnight (concurrentScheduler.ts:1252). Pool table :1038-1040 = :159-163. Resource :1076 80% = buildConfig.ts:118 max_pool_strip_pct 0.80. :1078 = VIDEO_BLOCK_STRIP_ASK :629. :1079 = :129-130. :1081 = MAX_DE_FIELD :133. :1082 = pools.ts:58. :1083-1084 = crossover.ts:51 (0.3) and the…
- **Doc change:** Optional (owner): add a Y8 row (weight 1.0) to Capacity Model Constants :1093-1100 and to §Age-Category Weights :891-899.
- **Verifier correction:** The status should be PARTIAL, not ALREADY_FIXED. The values match, and I re-checked them against constants.ts:49-58, 70-133 and 155-163, crossover.ts:51, pools.ts:58, validation.ts:197, buildConfig.ts:118 and concurrentScheduler.ts:688 and :1252. But Capacity Model row :1100 ('Lightest; 120-min start offset from day start') and §Age-Category Weights :899 ('2-hour start offset') describe…

**Missed by the auditor (G02-weights):** 1. The B4 scheduled output has per-gender single-class days that the coloring view hides (see WB-M). The weapon-balance review must count these on scheduled events. 2. METHODOLOGY also names daySequencing.ts at :118 (§Within-Day order implementation: vetAgeOrderingKey, sequenceEventsForDay) and at :669 ('mirrors the within-day sort key in daySequencing.ts'), not only at :648. All three need edits when that file is deleted. 3. The Capacity Model rows at :1099-1100 and the §Age-Category Weights notes at :893-899 ('early start', 'can start early', '2-hour start offset') describe start offsets the engine never applies. This is L8, still open (buildConfig.ts:219, earliest_start: 0). 4. Appendix A:1077 and METHODOLOGY:51 say 'NACs only', but the B4, B5 and B6 non-NAC scenarios use 12 video…

## G03-relaxation

### RX1 – METHODOLOGY §Constraint Relaxation still specifies levels 0–3 (and C5: level 2 relaxes Group 1)

- **Status:** OPEN. **Verifier:** CONFIRMED.
- **Evidence:** [R] METHODOLOGY:308-322 in full: "## Constraint Relaxation" / :310 "two tiers of constraints: **Hard** (never relaxed) and **Soft** (finite penalties, active at level 0). Progressive relaxation proceeds through these tiers when no valid assignment exists." / :312 "(see dayAssignment.ts)" / :314-319 table: 0 all rules; 1 drops proximity; 2 "Drops soft crossover penalties and the Regional Group 1…
- **Doc change:** Replace :308-322 with a short section (rename e.g. "When Days Are Too Few"): hard same-day rules block a day outright and soft weights only rank days, so nothing is relaxed. When every day is blocked for an event, day assignment places it on the least-bad day (today: day 0 on an all-Infinity tie) and emits one WARN UNAVOIDABLE_CROSSOVER_CONFLICT / hard-separation-violated per broken pair, naming…
- **Owner question:** Approve the replacement text (procedural – the behaviour itself is owner decision (b), 019).

### RX2.1 – Backlog item 1 – :86 hard rules "cause scheduling to fail" and "are never relaxed"

- **Status:** OPEN. **Verifier:** CORRECTED.
- **Evidence:** [R] Backlog line :86 still holds. METHODOLOGY:86: "These rules cause scheduling to fail or produce errors. They are never relaxed. The one exception by tournament type is [Overlapping-Population Separation (Group 1)]...: it is hard at national types and soft at regional types." True for validation-gated rules (Single-Day Fit :171-174, Resource Preconditions :176-192, Fencer Count Bounds :205-210…
- **Doc change:** :86 – split the claim: validation rules (Single-Day Fit, Resource Preconditions, Team-needs-Individual, No Cuts, Fencer Count Bounds) stop scheduling with an ERROR; the same-day separation and co-day rules are never traded for a soft preference, but when the days are too few they are broken by the least-bad fallback with a WARN (link the RX1 section). Owner approval before commit.
- **Verifier correction:** Status OPEN stands and the METHODOLOGY:86 quote is exact. The proposed doc_change is wrong about which rules stop scheduling with an ERROR [R]. (1) Single-Day Fit (:171-174): validateSameDayCompletion (validation.ts:59) has no caller anywhere in src. It is enforced only at runtime, as SAME_DAY_VIOLATION or an unscheduled event (backlog :1525-1528 'Also outstanding' owns this). (2) Team Events…

### RX2.2 – Backlog item 2 – :90 "hard at every relaxation level" vs level-3 "allowed as last resort"

- **Status:** OPEN. **Verifier:** CONFIRMED.
- **Evidence:** [R] Backlog cites :90, :325, :328; today :90, :319, :322 (backlog numbers after :90 are 6 high). METHODOLOGY:90 ends "This is hard at every relaxation level." :319 "| 3 | Same population still produces a warning but is allowed as last resort |". :322 "If no valid day exists even at Level 3, scheduling fails with an unresolvable error". Engine: no level 3 (deleted by 019); same-population breaks…
- **Doc change:** :90 – replace "This is hard at every relaxation level." with "This is hard at every tournament type." (the type-independence is what :93 argues), or drop the sentence; :319 and :322 go with the RX1 rewrite.

### RX2.3 – Backlog item 3 – :316 Hard "never relaxed" conflicts with the level-3 row

- **Status:** OPEN. **Verifier:** CONFIRMED.
- **Evidence:** [R] Backlog :316 is today :310: "The scheduling system uses two tiers of constraints: **Hard** (never relaxed) and **Soft** (finite penalties, active at level 0). Progressive relaxation proceeds through these tiers when no valid assignment exists." Conflicts with :319 (level 3 allows same population). After 019 neither half is what runs: there is no progressive pass, only DSatur valid-colour…
- **Doc change:** Rewritten by the RX1 replacement of :308-322; "active at level 0" disappears with it.

### RX2.4 – Backlog item 4 – levels 1–2 unimplemented; "suppressed at level >= 2" depends on them

- **Status:** OPEN. **Verifier:** CONFIRMED.
- **Evidence:** [R] Backlog :323-324 → today :317-318; :294-295 → :284-285; :1002 → :996. :317 "| 1 | Drops proximity preferences ... |" :318 "| 2 | Drops soft crossover penalties and the Regional Group 1 pair penalty; ... |". :284/:285 "Same weapon+gender on same day; suppressed at level >= 2. (see SOFT_SEPARATION_PAIRS)". :996 "| Soft separation (DIV1↔DIV2, DIV1↔DIV3) | 3.0 | Same weapon+gender on same day,…
- **Doc change:** Delete "; suppressed at level >= 2" at :284 and :285 and ", suppressed at level ≥ 2" at :996; levels 1–2 go with RX1. Owner approval before commit.

### RX2.5 – Backlog item 5 – :327 "Each relaxation emits a warning"

- **Status:** OPEN. **Verifier:** CONFIRMED.
- **Evidence:** [R] Backlog :327 → today :321: "- Each relaxation emits a warning". No relaxation exists after 019. What does emit: one WARN per broken hard pair (concurrentScheduler.ts:330-342: cause UNAVOIDABLE_CROSSOVER_CONFLICT, rule HARD_SEPARATION_VIOLATED = 'hard-separation-violated' types.ts:159, severity WARN, subjects = both ids sorted, day = dayMap day, message "<a> and <b> share a day: a hard…
- **Doc change:** Replace with the WARN contract in the RX1 section, and add UNAVOIDABLE_CROSSOVER_CONFLICT (WARN, phase DAY_ASSIGNMENT, rule hard-separation-violated, one per broken pair) to the bottleneck list that holds SEQUENCING_CONSTRAINT etc. (:680-688). Owner approval.

### RX2.6 – Backlog item 6 – "fails with an unresolvable error", :739 escalate, :700 constraint-relaxing

- **Status:** OPEN. **Verifier:** CONFIRMED.
- **Evidence:** [R] Backlog :328 → :322, :739 → :733, :700 → :694. :322 "If no valid day exists even at Level 3, scheduling fails with an unresolvable error". :733 "- If no day has finite penalty at current constraint level, escalate through [Constraint Relaxation](#constraint-relaxation)". :694 "The auto-suggest engine uses a **priority-ordered, constraint-relaxing** approach". Engine: least-bad branch…
- **Doc change:** :322 – per RX1. :733 → "If every day is blocked by a hard rule, the event takes the least-bad day and each broken pair draws a WARN (see <RX1 section>)". :694 – drop "constraint-relaxing" (e.g. "priority-ordered, penalty-minimising"). Owner approval.

### RX2.7 – Backlog item 7 – :318 cites dayAssignment.ts for relaxation

- **Status:** OPEN. **Verifier:** CONFIRMED.
- **Evidence:** [R] Backlog :318 → today :312 "(see [dayAssignment.ts](src/engine/dayAssignment.ts))" under §Constraint Relaxation. dayAssignment.ts (100 lines) holds only SchedulingError (no caller in src or __tests__ [M grep]), constraintScore (used concurrentScheduler.ts:73,485) and saberPileupPenalty (dayColoring.ts:43,389). The fallback lives in dayColoring.ts:571-592 (dsaturLoop) and is reported in…
- **Doc change:** In the RX1 replacement cite dayColoring.ts (dsaturLoop) and concurrentScheduler.ts, not dayAssignment.ts. Owner approval.

### RX2.9 – Backlog item 9 – a Vet co-day split by the least-bad fallback is not reported

- **Status:** NEEDS_OWNER_CALL. **Verifier:** CONFIRMED.
- **Evidence:** [R] Backlog :97 → today :108: "All age-banded Veteran *individual* events for a given gender + weapon must be on the same day." Engine: vetCoDayRequiredColor (dayColoring.ts:430-453); if the required day is blocked, validColors=[] (:554-556) and the least-bad loop (:575-581) may pick another, finite day. violations only record Infinity edges on the chosen day (:586-591); co-day is not a graph…
- **Doc change:** Once decided, add to the RX1 section what the fallback does to a Vet co-day and which finding it draws. Owner approval.
- **Engine change:** In dsaturLoop's least-bad branch, when requiredColor !== null and chosenColor !== requiredColor, record a co-day split; concurrentScheduler.ts emits a WARN for it (subjects: the split event and its colored siblings). Alternative: force requiredColor in the fallback so the co-day holds and the separation break is reported as today. Test-first in dayColoring.test.ts and concurrentScheduler.test.ts…
- **Owner question:** When a pin blocks the Vet co-day, which hard rule yields? (a) keep today's choice (the band leaves the co-day) and add a WARN with a new rule id such as vet-co-day-split; (b) keep the co-day by forcing the required day and report the broken separation as UNAVOIDABLE_CROSSOVER_CONFLICT, which is already reported. Also: should hand-placement checks (backlog :1857) land in 021 or stay separate?

### RX3 – Regional Group 1 pair penalty text omits the cross-level ind/team exception

- **Status:** OPEN. **Verifier:** CONFIRMED.
- **Evidence:** [R] Backlog :293/:1001 → today :283/:995. :283 "| Regional Group 1 pair | 5.0 | ROC, RYC and RJCC only. A [Group 1 pair] (DIV1↔JUNIOR, JUNIOR↔CADET, DIV1↔CADET, ...) with the same weapon+gender on the same day ... At NAC, SYC and SJCC these pairs are hard blocks. |". :995 "ROC, RYC and RJCC only: a Group 1 pair, Div 1–Cadet included ...". Also :150 "Every Group 1 pair is a soft preference…
- **Doc change:** Add to :283, and in short form to :995 and :150: "except Div 1 individual ↔ Junior team and Junior individual ↔ Div 1 team, which stay hard at every type (see Individual/Team Separation)". Owner approval.

### RX4 – Source comments that still name relaxation levels

- **Status:** OPEN. **Verifier:** CONFIRMED.
- **Evidence:** [R] All four still present: crossover.ts:133-134 "(must NOT share a day, hard at every relaxation level)"; dayAssignment.ts:5 "Uses penalty scoring with constraint relaxation to find the best valid day." (the file no longer assigns days); concurrentScheduler.ts:742 "Relaxation-level suppression is not modelled (021)."; constants.ts:437-440 Vet↔Division "Keep a small penalty ... but make it very…
- **Engine change:** Comments only: crossover.ts:134 → "hard at every tournament type". dayAssignment.ts:1-6 header → name what it holds (Phase 3 constraintScore, saberPileupPenalty). Delete concurrentScheduler.ts:742. constants.ts:437-440 → small soft crossover edge, plus a note that Vet↔Div1A is overridden by GROUP_2_SOFT_SEPARATIONS. Optional: delete the uncalled SchedulingError at dayAssignment.ts:12-22…

**Missed by the auditor (G03-relaxation):** I re-checked every cited METHODOLOGY line in WT at 5edbdf7712 and all of them are exact: :19, :86, :90, :283-285, :308-322, :694, :733, :995-996 and :1008-1010. Code citations also hold: dayColoring.ts:538-599, 571-592 and 688-718; concurrentScheduler.ts:328-342 and 742; crossover.ts:133-134, 229-237 and 82-88; dayAssignment.ts:1-22; constants.ts:437-440 and 520-528; types.ts:115 and 159. On my grep of src, __tests__ and scripts for relax, level 3 and level >= 2, the only stale hits are the four RX4 comments. The backlog's line numbers were never valid for today's file: the one METHODOLOGY commit after 019's amendment (f2570e0d8a) changes one line and shifts nothing. The auditor's mapping is still correct. Re-run probe [M], log at WT/tmp/021-audit/G03v-coday.log (probe .test.ts deleted):…

## G04-contradictions

### C1 – Appendix A marks capacity penalty thresholds [TBD] while the prose gives a full curve

- **Status:** OPEN. **Verifier:** CORRECTED.
- **Evidence:** [R] METHODOLOGY.md:1102 "| Capacity penalty thresholds | [TBD] | Fill-ratio thresholds for penalty curve |". This is the only [TBD] in the doc (grep). [R] §Capacity Penalty Curve :903-910 gives four bands: <0.60 → 0, 0.60-0.80 ramp to 3.0, 0.80-0.95 ramp to 10.0, >0.95 → 20.0. [R] The engine follows neither: dayColoring.ts:99-107 `capacityPenalty` is 0 up to 0.85, ramps to 3.0 at 1.0, then…
- **Doc change:** Replace the [TBD] in Appendix A :1102 with real values. Follow L2: rewrite §Capacity Penalty Curve :901-912 to the engine's curve (0 up to fill 0.85, linear to 3.0 at 1.0, +10 per unit of fill past 1.0, capped at 20.0) and record why the 0.60-start curve was rejected. Then make the :1102 row name 0.85 / 1.0 / 20.0. Needs the owner's approval as a METHODOLOGY change.
- **Engine change:** Under L2 DOC-WRONG, delete the five unread members of CAPACITY_PENALTY_CURVE (LOW_THRESHOLD, MID_THRESHOLD, HIGH_THRESHOLD, LOW_BAND_MAX, MID_BAND_DELTA) and optionally name 0.85 / 3.0 / 10.0 as constants. If the spec wins instead, capacityPenalty reads the full curve, which moves the B1-B8 drift.
- **Owner question:** Approve L2 as DOC-WRONG, meaning METHODOLOGY records the engine's 0.85/1.0 curve and the rejected 0.60 curve? The C1 row follows from that answer. Under DOC-WRONG nothing drifts, while spec-wins moves day assignment on every scenario.
- **Verifier correction:** Status OPEN and every citation hold [R]: METHODOLOGY.md:1102 is the only [TBD] (a grep for tbd/todo/placeholder finds nothing else), the doc curve is at :901-912, capacityPenalty is at dayColoring.ts:99-107 with the 0.85/1.0 ramp, it is called at :407, the rejection comment is at :93-97 (added in 69c604be09, 2026-04-21), and CAPACITY_PENALTY_CURVE at constants.ts:721-734 has only…

### C2 – Fencer-default provenance: Appendix A says B1-B7 averages, the constants.ts comment says P75

- **Status:** OPEN. **Verifier:** CONFIRMED.
- **Evidence:** [R] METHODOLOGY.md:1044 says "Sourced from integration test scenarios B1–B7 ... averaged across scenarios per category/weapon/gender, rounded to nearest 10." [R] constants.ts:196-197 says "Derived from P75 of empirical NAC/Summer Nationals and regional data, rounded to nearest 10, skewed towards larger events (METHODOLOGY Appendix A)." [M] Probe tmp/021-audit/G04-fencerdefaults.log: every NAC…
- **Doc change:** None required, since Appendix A :1044 is accurate [M]. Optional: Appendix A :1046-1070 omits rows the engine has (Y8, DIV3 and DIV1A at NAC, team defaults), and constants.ts:285 and :293 already say "not in METHODOLOGY table". The owner can add or ignore them.
- **Engine change:** Comment only: constants.ts:196-197 should say "means of the B1–B7 real-data scenarios (src/data/tournaments.ts), rounded to nearest 10 (METHODOLOGY Appendix A)". No numeric change.

### C3 – Resource Preconditions still stated the retired 200+ fencer flighting trigger

- **Status:** PARTIAL. **Verifier:** CONFIRMED.
- **Evidence:** [R] The contradiction is fixed. 024 (6a4107b710) replaced "(200+ fencers in eligible categories)" with "(see [Flighting](#flighting))", and METHODOLOGY.md:186 now reads "For flighted events (see Flighting), the requirement is halved: `ceil(pools / 2)`". §Flighting Trigger :383-387 is n_pools > pool_strip_cap. Two residues remain. (1) [R] Appendix A :1076 still says "replaces old 200+ fencer…
- **Doc change:** Appendix A :1076: drop "; replaces old 200+ fencer rule" (history belongs in git). Needs owner approval with the other METHODOLOGY edits.
- **Engine change:** None for C3 itself. L15's fix: validation.ts:263 should compare ceil(n_pools/2) for a flighted event, per METHODOLOGY:186.

### C4 – Two penalties for team-before-individual (8.0 vs 1.0)

- **Status:** OPEN. **Verifier:** CORRECTED.
- **Evidence:** [R] Still present. METHODOLOGY.md:990 has "Ind+team same-time or wrong order | 8.0 | ... overlapping or team scheduled first" and :999 has "Team before individual | 1.0". §Individual-Team Proximity :296 says only "Team before individual: penalty". [R] INDIV_TEAM_SAME_TIME_OR_WRONG_ORDER (constants.ts:676) has no reader in src/ or __tests__. It is one of the eight time-of-day weights the owner…
- **Doc change:** Delete Appendix A :990 together with the other retired time-of-day rows. Optionally make :296 say "Team the day before individual: penalty (gap of 2+ days falls to the 2+ days row)", to match dayColoring.ts:209-213.
- **Engine change:** Delete PENALTY_WEIGHTS.INDIV_TEAM_SAME_TIME_OR_WRONG_ORDER (constants.ts:675-676) with the other seven retired keys. Nothing reads it.
- **Verifier correction:** Status OPEN, the doc rows (:990, :999, :296) and the retirement reasoning all hold. One evidence claim is wrong: crossover.ts:344 is not a live reader. The function there, individualTeamProximityPenalty (crossover.ts:326), has no caller in src/ [R, grep] and is reached only from __tests__/engine/crossover.test.ts. The only live readers of TEAM_BEFORE_INDIVIDUAL are dayColoring.ts:212 and :274.…

### C6 – Y8/Y10 early scheduling vs Y10 non-first-slot scope drift

- **Status:** PARTIAL. **Verifier:** CONFIRMED.
- **Evidence:** [R] The scope drift is fixed by 024 (6a4107b710). Both rows now name Y8. :290 has "Y8/Y10 Early Scheduling | 0.3 | Y8/Y10 not starting at day start ... including Y8 is a departure", :1003 has "Y8/Y10 non-first-slot | 0.3 | Y8/Y10 event not starting at day start", and Appendix B :1120 records the Y8 departure. [R] Y10_NON_FIRST_SLOT (constants.ts:698) has no reader. It is one of the eight weights…
- **Doc change:** Delete :290 and Appendix A :1003. At :648, drop "mirrors daySequencing.ts rule 1" and move the source there (Ops Manual p.20 – Group 2, Y10 early, with Y8 as a departure). Re-point Appendix B :1120 "early-start preference" to §Within-Day Priority Order. :895 "Early start required" may stay as the weight's note.
- **Engine change:** Delete PENALTY_WEIGHTS.Y10_NON_FIRST_SLOT (constants.ts:697-698). Fix the comment at concurrentScheduler.ts:1508-1510 so it stops citing daySequencing.ts. No logic change.

### C7 – Day-end overrun: warning in Inputs vs hard constraint in Single-Day Fit

- **Status:** ALREADY_FIXED. **Verifier:** CONFIRMED.
- **Evidence:** [R] Every section now agrees with the engine. :61 "Latest end time: defaults to 7:00 PM, a soft target with a 10:00 PM hard end. An event's last phase alone may run past the hard end, up to midnight, with a warning". :80 agrees. §Single-Day Fit :173 "every phase but its last ends by the day's hard end ... last phase starts before the hard end and ends by midnight. Running past the 7:00 PM soft…

### C7a – Single-Day Fit is never validated up front, and its validator measures to the hard end, not midnight

- **Status:** OPEN. **Verifier:** CORRECTED.
- **Evidence:** [R] §Single-Day Fit :173-174 is listed under Hard Constraints (:86 "cause scheduling to fail"), and Phase 1 :698 validates "against hard rules". validateSameDayCompletion (validation.ts:59-79) has no caller in src/ (validation.test.ts:99-101 and :1036-1037 say so). It also checks total ≤ the widest start-to-hard-end window (780 min), while :173 lets the last phase end by midnight. The :174…
- **Doc change:** None if the engine conforms. Only if the owner deletes the validator: :173-174 move out of Hard Constraints and Phase 1 :698 says Single-Day Fit is enforced at runtime only.
- **Engine change:** Spec wins by default: bring validateSameDayCompletion to the :173 rule (every phase but the last ends by the hard end, the last starts before it and ends by midnight), wire it into validateConfig with the feasibility family's severity, and add the :174 ind+team combined check, or delete :174 with owner approval.
- **Owner question:** Wire Single-Day Fit into validation, per the spec (0 B1-B8 events flagged [M]), or delete validateSameDayCompletion and say the runtime alone enforces it? Also keep or drop the :174 combined ind+team fit, which nothing implements?
- **Verifier correction:** Status OPEN and the code facts hold: validation.ts:59-79 measures against widestHardWindow, it has no src caller, and validation.test.ts:99-101 and :1036-1037 say so. Two corrections. (1) The [M] count is wrong. G04-singledayfit.log shows B1 0/24, B2 0/24, B3 0/24, B4 0/30, B5 0/12, B6 0/54, B7 0/18 and B8 0/53, which is 0 of 239 events, not 243. (2) Two backlog facts are missing.…

### C8 – FINALS_ONLY video policy kept for save-file compatibility

- **Status:** PARTIAL. **Verifier:** CONFIRMED.
- **Evidence:** [R] The engine side is fixed. types.ts:57-60 VideoPolicy has only REQUIRED and BEST_EFFORT. 013 T020 (a85e14f5f5, 2026-09-13) removed FINALS_ONLY from types.ts and the CompetitionOverrides select. grep finds no FINALS_ONLY in src/, __tests__/ or scripts/. de_video_policy is derived, not stored (buildConfig.ts:215 resolveVideoPolicy, typeDefaults.ts:22-32), and the per-event saved record is…
- **Doc change:** Delete the FINALS_ONLY row at METHODOLOGY.md:957 (§Video Policy Interaction). Needs owner approval with the other METHODOLOGY edits.

### C10 – Intro (and §Scheduling Algorithm) describe drag-and-drop with re-validation after each adjustment

- **Status:** OPEN. **Verifier:** CONFIRMED.
- **Evidence:** [R] METHODOLOGY.md:3 "users then refine it via drag-and-drop on a day/strip grid. The engine re-validates after each adjustment, surfacing warnings and errors." :694 repeats it. In the app today nothing drags. canvas/Block.tsx:57-62 says "Nothing here drags, and nothing resizes (FR-043)", and EventsPanel has no drag handler. A hand move is DetailStrip's Move-day menu (DetailStrip.tsx:146-148…
- **Doc change:** Rewrite :3 and :694 to describe the app as it is. The organizer moves an event to another day, which pins it. Hand moves are checked at once against the hard same-day pairs, the regional Group 1 window, first/last-day length and late or overrun finishes. They do not re-run the engine. Auto-assign re-runs around the pins after every edit to an engine input. Needs owner approval.
- **Owner question:** Which hand-placement checks should the intro promise? Today they are the hard pairs, the regional window, first/last day, last-phase overrun and late finish. Vet co-day and the ind/team gap are not re-checked on a hand move.

**Missed by the auditor (G04-contradictions):** (1) Cross-item note: SAME_TIME_WINDOW_MINS and EARLY_START_THRESHOLD are not \"unread\" constants. They are threaded TournamentConfig fields (types.ts:290 and :292, buildConfig.ts:18-20 and :109-111, factories.ts:62 and :64, pinned by buildConfig.test.ts:330-332) with no engine consumer [R grep]. Retiring them with the time-of-day weights is a type change across about 4 files plus a test, not a constants-only delete. (2) C3/L15: the [I] that B1-B8 cannot move is right, since flightedFixtures.ts:2 says no scenario or template contains a flighted event. But the store does pass the user's flag through (buildConfig.ts:232, flighted: overrides.flighted). So validation.ts:263 ignoring the METHODOLOGY:186 halving is user-reachable today: a flighted event with strips_total < n_pools <=…

## G05-pointers

### PT-1 – §Hard Constraints points to dayAssignment.ts for the hard rules

- **Status:** OPEN. **Verifier:** CONFIRMED.
- **Evidence:** [R] METHODOLOGY.md:86: "(see [`crossover.ts`](src/engine/crossover.ts), [`dayAssignment.ts`](src/engine/dayAssignment.ts))". dayAssignment.ts now holds only SchedulingError (16), constraintScore (41) and saberPileupPenalty (82). The hard rules live elsewhere. crossoverPenalty returns Infinity (crossover.ts:219-229), constraintGraph.ts turns that into hard edges, dsaturLoop blocks those colours…
- **Doc change:** METHODOLOGY.md:86: replace `dayAssignment.ts` with `constraintGraph.ts` and `dayColoring.ts`. The line becomes "(see `crossover.ts`, `constraintGraph.ts`, `dayColoring.ts`)". Needs owner approval.

### PT-2 – §Soft Preferences points to dayAssignment.ts

- **Status:** OPEN. **Verifier:** CONFIRMED.
- **Evidence:** [R] METHODOLOGY.md:231: "Penalties are listed in approximate order of strength. ... (see [`dayAssignment.ts`](src/engine/dayAssignment.ts))". No soft preference is scored in dayAssignment.ts. The soft edge weights come from crossoverPenalty (crossover.ts:219), and colorPenalty (dayColoring.ts:320-412) adds proximity, rest day, ind/team ordering, Vet Combined, cross-weapon, saber pileup and load.…
- **Doc change:** METHODOLOGY.md:231: replace `dayAssignment.ts` with `dayColoring.ts` (`colorPenalty`) and `crossover.ts` (`crossoverPenalty`). Needs owner approval.

### PT-3 – §Constraint Relaxation points to dayAssignment.ts, and no relaxation code exists

- **Status:** OPEN. **Verifier:** CONFIRMED.
- **Evidence:** [R] METHODOLOGY.md:312: "(see [`dayAssignment.ts`](src/engine/dayAssignment.ts))" under §Constraint Relaxation. `grep -i relax src/engine` finds no relaxation level anywhere. The only hits are stale comments: dayAssignment.ts:5 ("Uses penalty scoring with constraint relaxation"), crossover.ts:134 and concurrentScheduler.ts:742. What exists is the least-bad fallback in dayColoring.ts:571-592,…
- **Doc change:** METHODOLOGY.md:312: point to `dayColoring.ts` (the least-bad branch of `dsaturLoop`) when the section is rewritten under decision (b). Needs owner approval.
- **Engine change:** Fix the stale header comment at dayAssignment.ts:5. This overlaps with the four-relaxation-comments item.
- **Verifier correction:** Small addition. The WARN UNAVOIDABLE_CROSSOVER_CONFLICT the item names is emitted at concurrentScheduler.ts:328-334 from the dsaturLoop violations (dayColoring.ts:583-591). The relaxation-comment overlap has four sites, not three (see missed: constants.ts:440).

### PT-4 – §Direct Elimination points to scheduleOne.ts, which was deleted in Phase D

- **Status:** OPEN. **Verifier:** CONFIRMED.
- **Evidence:** [R] METHODOLOGY.md:405: "(see [`de.ts`](src/engine/de.ts), [`scheduleOne.ts`](src/engine/scheduleOne.ts))". src/engine/scheduleOne.ts does not exist. `git log -S scheduleOne -- src` shows it last changed in 4ef8fa96fa, "switch scheduleAll to concurrent scheduler (Phase D)". DE phases are now built by buildPhaseNodes (concurrentScheduler.ts:497, DE nodes 587-640) from de.ts deBlocksFor (de.ts:173).
- **Doc change:** METHODOLOGY.md:405: replace `scheduleOne.ts` with `concurrentScheduler.ts`. Needs owner approval.

### PT-5 – §Strip Budget Key Functions names the removed recommendStripCount

- **Status:** OPEN. **Verifier:** CONFIRMED.
- **Evidence:** [R] METHODOLOGY.md:374: "`recommendStripCount(competitions, config)` — advisory: suggests a strip total that keeps each competition within its pool cap". The function is absent from src. It was removed in b5e0600efc ("012 T011: remove recommendStripCount and re-point the ledger at the search"). The strip suggestion is now searchStripCount (stripSearch.ts:254), with suggestStripCount…
- **Doc change:** METHODOLOGY.md:374: delete the bullet, or replace it with "strip count suggestion: see [Strip Count Suggestion](#strip-count-suggestion) (`stripSearch.ts`)". Needs owner approval.

### PT-6 – flagFlightingCandidates has the wrong signature in the doc and no production caller

- **Status:** OPEN. **Verifier:** CORRECTED.
- **Evidence:** [R] METHODOLOGY.md:375 "`flagFlightingCandidates(competitions, config)`", :387, and :857 "The engine calls `flagFlightingCandidates()` to find competitions whose pool count exceeds `pool_strip_cap`". The real signature is (competitions, poolStripCap, bounds?) (stripBudget.ts:143-147), and only stripBudget.test.ts and sizeableCount.test.ts call it. The live path is initialAnalysis…
- **Doc change:** METHODOLOGY.md:375, :387, :857: name `initialAnalysis` (`analysis.ts`) and `suggestFlightingGroups` (`flighting.ts`) instead of flagFlightingCandidates, and drop the `(competitions, config)` signature. Needs owner approval.
- **Engine change:** Delete the dead export flagFlightingCandidates (stripBudget.ts:137-152). The alternative is to have analysis.ts use it in place of its inline check, with no behaviour change.
- **Verifier correction:** The quotes and signature (stripBudget.ts:143-147) are right, and the only callers are tests. Two things are missing. (1) The engine_change deletes a dead export, but backlog.md:1554-1557 says unused exports stay as evidence until 021 decides. Like PT-11, this needs the same owner question rather than a default deletion. (2) :857 also says the engine 'suggests flighting for the larger event', and…

### PT-7 – §DE Phase Breakdown names the removed prelims_dur and r16_dur

- **Status:** OPEN. **Verifier:** CONFIRMED.
- **Evidence:** [R] METHODOLOGY.md:478 "**`prelims_dur`**: Prelim phase on general strips" and :479 "**`r16_dur`**: Video phase on video strips". Neither identifier is in src. They were removed in 93ec5dc558 (024 group A). Today the split is DeBlocks.general / DeBlocks.video, with generalAsk and videoAsk (types.ts:472-486), built once by deBlocksFor (de.ts:173). The scheduler records the blocks in…
- **Doc change:** METHODOLOGY.md:478-479: rename the bullets to the general (prelims) block and the video block (`DeBlocks.general` and `DeBlocks.video`, built by `deBlocksFor` in `de.ts`), and keep the asks. Move the 'name covers' sentence onto the `de_round_of_16_*` result fields. Needs owner approval.

### PT-8 – Phase-node names in the doc do not match PhaseKind and Phase

- **Status:** OPEN. **Verifier:** CONFIRMED.
- **Evidence:** [R] The doc uses lowercase node names: METHODOLOGY.md:401 "`pools_flight_a` and `pools_flight_b`", :635 "(`pools` or `pools_flight_a → pools_flight_b`; `de_prelims → de_r16` for STAGED; `de` for SINGLE_STAGE)", :656, :743 "(`de_r16`)", :747, :749, :932 "(`r16`, ...)" and :955 "(`r16`)". None of them is in src. The node kinds are PhaseKind POOLS, FLIGHT_A, FLIGHT_B, DE_PRELIMS, DE_R16 and…
- **Doc change:** METHODOLOGY.md:401, 635, 656, 743, 747, 749, 932, 955: use `POOLS`, `FLIGHT_A → FLIGHT_B`, `DE_PRELIMS → DE_R16` and `DE_SINGLE` (PhaseKind), noting the recorded `Phase` names once at :635. Needs owner approval.

### PT-9 – §Within-Day Age-Descending Order names unreachable daySequencing.ts and a sort key that does not exist

- **Status:** OPEN. **Verifier:** CONFIRMED.
- **Evidence:** [R] METHODOLOGY.md:117: "A within-day sort key orders the siblings, after the indiv-before-team rule and before strip-demand." :118: "Implementation: `vetAgeOrderingKey` and `VET_AGE_ORDER` in daySequencing.ts, inserted as comparator key 3.5 in `sequenceEventsForDay`." Only __tests__/engine/daySequencing.test.ts:2 imports daySequencing.ts. The live comparator compareNodes…
- **Doc change:** METHODOLOGY.md:117-118: delete the sort-key sentence and the daySequencing.ts pointer, and keep "Strict end-to-end serialization is enforced by ... `applyCrossEventEdges`" as the sole implementation. Needs owner approval.
- **Engine change:** Delete src/engine/daySequencing.ts and its test (in scope for 021).

### PT-10 – §Within-Day Priority Order and §Cross-Event Dependency Edges cite daySequencing.ts as their model

- **Status:** OPEN. **Verifier:** CONFIRMED.
- **Evidence:** [R] METHODOLOGY.md:648: "**Y8/Y10 first** ... (mirrors `daySequencing.ts` rule 1; without this, B3-style scenarios collapse)". :669: "(mirrors the within-day sort key in `daySequencing.ts`, but enforces strict end-to-end serialization ...)". daySequencing.ts is unreachable (see PT-9), and the same 'mirrors daySequencing.ts rule 1' wording sits in the code comment at…
- **Doc change:** METHODOLOGY.md:648: drop "mirrors `daySequencing.ts` rule 1;" and keep the B3 rationale. :669: drop the "mirrors the within-day sort key in `daySequencing.ts`, but" clause. Needs owner approval.
- **Engine change:** Reword the comment at concurrentScheduler.ts:1508-1510 to drop the daySequencing.ts reference.

### PT-11 – §Proximity Preference names PROXIMITY_PENALTY_WEIGHTS, which only dead code reads

- **Status:** OPEN. **Verifier:** CORRECTED.
- **Evidence:** [R] METHODOLOGY.md:269: "(see `constants.ts` — `PROXIMITY_GRAPH`, `PROXIMITY_PENALTY_WEIGHTS`)". The only reader of PROXIMITY_PENALTY_WEIGHTS (constants.ts:565) is proximityPenalty (crossover.ts:268-292), and no src code calls proximityPenalty. individualTeamProximityPenalty (crossover.ts:326) has no src caller either. The live rule is colorPenalty (dayColoring.ts:354-377), which applies…
- **Doc change:** METHODOLOGY.md:269: replace `PROXIMITY_PENALTY_WEIGHTS` with `PENALTY_WEIGHTS.PROXIMITY_1_DAY` / `PROXIMITY_3_PLUS_DAYS`, and add `dayColoring.ts` (`colorPenalty`). Needs owner approval.
- **Engine change:** Delete the dead constant PROXIMITY_PENALTY_WEIGHTS (constants.ts:565-570) along with its only readers, proximityPenalty and individualTeamProximityPenalty (crossover.ts:268-345).
- **Owner question:** The backlog (backlog.md:1554) kept dead exports as evidence that the engine once matched its spec. Should 021 delete proximityPenalty and individualTeamProximityPenalty together with the dead constant, or keep the functions?
- **Verifier correction:** Only proximityPenalty reads PROXIMITY_PENALTY_WEIGHTS (crossover.ts:292). individualTeamProximityPenalty (crossover.ts:326-347) never reads it. It returns PENALTY_WEIGHTS.INDIV_TEAM_DAY_AFTER, TEAM_BEFORE_INDIVIDUAL or INDIV_TEAM_2_PLUS_DAYS, and it is dead for a separate reason: no src caller, because the live rule is individualTeamOrderingPenalty (dayColoring.ts:195). So deleting the constant…

### PT-12 – §DE Capacity Estimation → Team Events names the removed teamDeStripHours

- **Status:** OPEN. **Verifier:** CONFIRMED.
- **Evidence:** [R] METHODOLOGY.md:535: "Team DEs use the same model with the team-match time in place of the bout time (`teamDeStripHours`)". No such identifier exists in src. It was removed in 93ec5dc558 (024 group A). Team billing is now estimateCompetitionStripHours (capacity.ts:68) through deBoutStripHours (capacity.ts:42). The code comment at capacity.ts:66 still says "METHODOLOGY's `teamDeStripHours` is…
- **Doc change:** METHODOLOGY.md:535: replace `teamDeStripHours` with `estimateCompetitionStripHours`. Needs owner approval.
- **Engine change:** Delete the sentence at capacity.ts:66.

### PT-13 – §Scheduling Algorithm intro cites dayAssignment.ts for day assignment

- **Status:** OPEN. **Verifier:** CONFIRMED.
- **Evidence:** [R] METHODOLOGY.md:694: "(see `scheduler.ts`, `dayAssignment.ts`, `concurrentScheduler.ts`)". scheduler.ts is a re-export shim over scheduleAllConcurrent (scheduler.ts:1-33). Day assignment is assignDaysByColoring (dayColoring.ts:616) over constraintGraph.ts. dayAssignment.ts supplies only constraintScore and saberPileupPenalty. C9.
- **Doc change:** METHODOLOGY.md:694: "(see `scheduler.ts`, `dayColoring.ts`, `constraintGraph.ts`, `concurrentScheduler.ts`)". Needs owner approval.

### PT-14 – §Phase 3 Priority Ordering points to scheduler.ts

- **Status:** OPEN. **Verifier:** CONFIRMED.
- **Evidence:** [R] METHODOLOGY.md:716: "Competitions sorted by **constraint score** ... (see [`scheduler.ts`](src/engine/scheduler.ts))". scheduler.ts sorts nothing (it is the shim at scheduler.ts:26-31). constraintScore is at dayAssignment.ts:41, and its only use is the 5th tiebreak in compareNodes (concurrentScheduler.ts:1541-1543). Day order is DSatur saturation, then hard-edge degree, then footprint…
- **Doc change:** METHODOLOGY.md:716: point to `dayColoring.ts` (`dsaturLoop`) and to `dayAssignment.ts` (`constraintScore`) as rewritten under L12. Needs owner approval.

### PT-15 – §Saber Pileup gives stale line numbers dayAssignment.ts:83-100

- **Status:** OPEN. **Verifier:** CONFIRMED.
- **Evidence:** [R] METHODOLOGY.md:737: "`saberPileupPenalty` (`dayAssignment.ts:83-100`) counts how many other SABRE competitions ...". The function spans dayAssignment.ts:82-99, and its table SABER_PILEUP_PENALTY_TABLE is at :73. The behaviour matches the sentence: it counts other SABRE events on the candidate day, caps at index 4, and returns 0 for non-sabre events.
- **Doc change:** METHODOLOGY.md:737: drop the line range and write "`saberPileupPenalty` (`dayAssignment.ts`)" so the pointer cannot rot again. Needs owner approval.

### PT-16 – §Saber Pileup gives a stale line number dayColoring.ts:301 for colorPenalty

- **Status:** OPEN. **Verifier:** CONFIRMED.
- **Evidence:** [R] METHODOLOGY.md:739: "Applied per candidate day inside `colorPenalty` (`dayColoring.ts:301`)." colorPenalty is defined at dayColoring.ts:320, and the saber call is at :389, outside the loadBalance gate as the sentence says ("always active").
- **Doc change:** METHODOLOGY.md:739: "inside `colorPenalty` (`dayColoring.ts`)", with no line number. Needs owner approval.

### PT-17 – §Capacity-Aware Day Assignment cites dayAssignment.ts

- **Status:** OPEN. **Verifier:** CONFIRMED.
- **Evidence:** [R] METHODOLOGY.md:869: "(see `dayAssignment.ts`, `dayColoring.ts`)". dayAssignment.ts has no capacity code. The capacity code is dayColoring.ts (capacityPenalty :99, dayCapacityFactor :115, assignDaysByColoring :616-680) together with capacity.ts (estimateCompetitionStripHours :68, categoryWeight :183). C9.
- **Doc change:** METHODOLOGY.md:869: "(see `dayColoring.ts`, `capacity.ts`)". Needs owner approval.

### PT-18 – The Phase D note on CAPACITY_TARGET_FILL still calls the re-tune open

- **Status:** OPEN. **Verifier:** CONFIRMED.
- **Evidence:** [R] METHODOLOGY.md:871: "Re-tuning `CAPACITY_TARGET_FILL` upward against the re-baselined B1–B7 counts is open follow-up. The constant is unchanged in this commit." The pointer itself is right (dayColoring.ts:88, value 0.3). But dayColoring.ts:77-87 records a 2026-08-29 sweep of 0.3 to 0.8 across B1–B8 that gave byte-identical schedules, because chromaticN equals expansionCap in every scenario.…
- **Doc change:** METHODOLOGY.md:871: replace the note with the sweep result (0.3–0.8 make no difference on B1–B8 because the day cap binds) and point to the calibration scenario 021 adds. Drop "in this commit" and "B1–B7". Needs owner approval.

### PT-19 – §Video Policy Interaction lists FINALS_ONLY, which was removed in 013

- **Status:** OPEN. **Verifier:** CONFIRMED.
- **Evidence:** [R] METHODOLOGY.md:957: "| `FINALS_ONLY` | Operationally identical to `BEST_EFFORT` — there is no `de_finals` phase ... The enum value is **preserved for save-file compatibility** ...". VideoPolicy is now { REQUIRED, BEST_EFFORT } only (types.ts:57-60). `git log -S FINALS_ONLY -- src` shows the last change in a85e14f5f5 ("013 T020: the per-event record shrinks ...; payload is v3"). The engine…
- **Doc change:** METHODOLOGY.md:957: delete the FINALS_ONLY row. Needs owner approval (text change).

### PT-20 – Appendix A cites dayAssignment.ts for the penalty weights

- **Status:** PARTIAL. **Verifier:** CORRECTED.
- **Evidence:** [R] METHODOLOGY.md:982: "(see `dayAssignment.ts`, `crossover.ts`, `constants.ts`)". PENALTY_WEIGHTS is at constants.ts:670-715 and is applied in crossoverPenalty (crossover.ts) and colorPenalty (dayColoring.ts:320-412). dayAssignment.ts holds only SABER_PILEUP_PENALTY_TABLE (:73), so it covers one row (saber pileup) and the main applier, dayColoring.ts, is missing. C9.
- **Doc change:** METHODOLOGY.md:982: add `dayColoring.ts`, and keep `dayAssignment.ts` only for the saber-pileup table. Needs owner approval.
- **Verifier correction:** The status should be OPEN, not PARTIAL. No shipped feature touched the pointer: it is partly right, but nothing has been fixed and 021 must act. The evidence holds. PENALTY_WEIGHTS readers are dayColoring.ts (10 reads) and crossover.ts (4 reads), and dayAssignment.ts holds only SABER_PILEUP_PENALTY_TABLE (:73).

### PT-21 – Appendix A Timing Constants lists three constants that no engine code reads

- **Status:** OPEN. **Verifier:** CORRECTED.
- **Evidence:** [R] METHODOLOGY.md:1026 "| THRESHOLD_MINS / EARLY_START_THRESHOLD | 10 min | Bottleneck detection threshold / early start window |" and :1027 "| SAME_TIME_WINDOW_MINS | 30 min | Window for same-time crossover penalty |". grep src shows no reader outside constants.ts, types.ts (TournamentConfig fields :288, :290, :292) and buildConfig.ts:93,109,111, which only copies them. SAME_TIME_WINDOW_MINS…
- **Doc change:** METHODOLOGY.md:1026-1027: delete both rows together with the time-of-day weight retirement (Part 3). Needs owner approval.
- **Engine change:** Delete THRESHOLD_MINS, EARLY_START_THRESHOLD, SAME_TIME_WINDOW_MINS and MAX_RESCHEDULE_ATTEMPTS from constants.ts, the TournamentConfig fields in types.ts and buildConfig.ts. MORNING_WAVE_WINDOW_MINS waits on the §2.6 verdict.
- **Verifier correction:** The quotes at :1026-1027 and the no-reader claims hold [R]: the only readers outside constants.ts are types.ts:288,290,292,293 and buildConfig.ts:18-28,93,109-112. Fixes needed: (1) tests_affected misses buildConfig.test.ts:333 (MAX_RESCHEDULE_ATTEMPTS). (2) Deleting THRESHOLD_MINS and EARLY_START_THRESHOLD goes beyond the backlog's 021 list (backlog.md:1551 names only SAME_TIME_WINDOW_MINS and…

### PT-22 – Flight A to Flight B gap: the doc gives 15 min, the doc also gives 30 min, and the engine uses 30

- **Status:** NEEDS_OWNER_CALL. **Verifier:** CORRECTED.
- **Evidence:** [R] METHODOLOGY.md:401 "separated by `FLIGHT_BUFFER_MINS` (15)"; :656 "successor's `ready_time` is set to `node.end_time + ADMIN_GAP_MINS` (or `+ FLIGHT_BUFFER_MINS` after `pools_flight_a`)". Against that, :748 says "Admin gap: 30-minute mandatory gap between any phase and its successor", and :1023 agrees. The engine takes max(ADMIN 30, FLIGHT 15) at concurrentScheduler.ts:1008-1018 and :868-874…
- **Doc change:** Option (a): keep METHODOLOGY.md:401/:656 and amend :748/:1023 to exempt Flight A→B from the admin gap. Option (b): amend :401, :656, :747 and :1025 to say the admin gap governs, and delete the FLIGHT_BUFFER_MINS row. Needs owner approval either way.
- **Engine change:** (a) Use FLIGHT_BUFFER_MINS alone after FLIGHT_A at concurrentScheduler.ts:1008-1018 and :868-874 and at derive.ts:189-192. (b) Delete FLIGHT_BUFFER_MINS from constants, types and buildConfig.
- **Owner question:** Between Flight A and Flight B, which gap applies: FLIGHT_BUFFER_MINS (15 min, as METHODOLOGY.md:401/:656 say) or the 30-min admin gap (as :748/:1023 say and the engine does today)? If 15, FLIGHT_BUFFER_MINS starts to matter and every flighted Flight B moves 15 min earlier. If 30, FLIGHT_BUFFER_MINS is dead and is deleted. The B1–B8 ledger moves in neither case.
- **Verifier correction:** The quotes (:401, :656, :747, :748, :1023, :1025) and the engine max(ADMIN 30, FLIGHT 15) at concurrentScheduler.ts:1008-1018 / :868-874 and derive.ts:189-192 are right. My re-probe [M] (G05v-flightgap.log: foil, epee and sabre at n=24-130 on 24 strips) found Flight B gaps of 30-34, never 15. Add three things. (1) The code comment at concurrentScheduler.ts:1012, 'Flight A → Flight B uses…

### PT-23 – FLIGHT_B_DELAYED fires on uncontended flighted events

- **Status:** OPEN. **Verifier:** CONFIRMED.
- **Evidence:** [R] METHODOLOGY.md:686: "`FLIGHT_B_DELAYED` (WARN) — Flight B started more than 30 min past Flight A's natural buffer." The engine measures delay from flight_a_end + 0 (concurrentScheduler.ts:1427-1430), even though the comment there claims the buffer is included. Flight B cannot start before snap(a_end+30), so any Flight A end that is not on a 5-minute boundary gives a delay of 31–34 and a WARN…
- **Doc change:** After PT-22 settles the gap, METHODOLOGY.md:686 can stay as is ("30 min past ... natural buffer"). It needs only a rename of `pools_flight_a` per PT-8.
- **Engine change:** Measure the delay from Flight B's own unblocked ready time, snap(a_end + gap) where gap is the PT-22 answer, not from flight_a_end, at concurrentScheduler.ts:1426-1430. Write a failing test first: one flighted event alone on a day emits no FLIGHT_B_DELAYED.
- **Verifier correction:** I confirmed this with an independent probe [M] (WT/tmp/021-audit/G05v-flightgap.log; the .test.ts was deleted). Of 18 single-event flighted runs, 12 emitted FLIGHT_B_DELAYED, exactly the runs whose flight_a_end is not a multiple of 5, with delays of 31-34. The 6 runs on a slot boundary had a delay of exactly 30 and no WARN. The cause is concurrentScheduler.ts:1427-1430 (idealStart = flight_a_end…

### PT-24 – §Individual-Team Proximity: the 120-min runtime edge never reaches the pairs the sentence describes

- **Status:** NEEDS_OWNER_CALL. **Verifier:** CONFIRMED.
- **Evidence:** [R] METHODOLOGY.md:299: "For other overlapping individual/team pairs: 4-hour separation required". :302: "When such a pair lands on the same day ... the runtime sequencer enforces `team_pools_start >= indiv_DE_end + 120 min` and emits `SEQUENCING_CONSTRAINT` (INFO)." The edge (concurrentScheduler.ts:679-692) pairs a team only with findIndividualCounterpart (crossover.ts:303-315), which requires…
- **Doc change:** METHODOLOGY.md:299-302: settle 4 h or 120 min, and say which pairs the edge applies to: same-category pairs only (fallback or pin), or cross-category ind/team pairs as well. Needs owner approval.
- **Engine change:** If the owner wants cross-category pairs covered, widen the edge beyond findIndividualCounterpart. That moves drift on scenarios with team events. Otherwise there is no engine change.
- **Owner question:** Which individual/team pairs on the same day must the scheduler separate in time, and by how much? Option 1: only same-category pairs (reached only through the least-bad fallback or a pin), at 120 min. Today's engine does this, and the doc text would be narrowed to match. Option 2: also the cross-category overlapping pairs in :299-300, at 120 min or at 4 h. That is new engine behaviour and moves…

**Missed by the auditor (G05-pointers):** (1) METHODOLOGY.md:391 says 'The **larger event** becomes flighted', and :857 says the engine 'suggests flighting for the larger event'. suggestFlightingGroups (flighting.ts:55-58) flights the smaller and makes the larger the priority. Its header (flighting.ts:21-23) and calculateFlightedStrips (flighting.ts:93-96) cite METHODOLOGY rules ('more pools is designated priority', 'Priority receives strips equal to its pool count') that the doc does not contain. Ledger row L11 does not cover this. It needs its own item, likely NEEDS_OWNER_CALL: either the doc is wrong (flighting the smaller event frees the larger) or the engine is. (2) In reverse, code comments cite METHODOLOGY text that does not exist (flighting.ts:21-23, :93-96). The PT sweep went one way only, doc to code. (3) :379 'does…

## G06-selfcontra

### SC1 – Flighting section says Flight A/B times are not tracked, but Runtime Decomposition and the engine track them

- **Status:** OPEN. **Verifier:** CONFIRMED.
- **Evidence:** [R] METHODOLOGY.md:379 says "The schedule marks the competition as \"flighted\" but does not track Flight A/B start/end times separately – only total pool round duration matters." METHODOLOGY.md:401 says "a flighted event's pools split into two dependent phase nodes — `pools_flight_a` and `pools_flight_b` — separated by `FLIGHT_BUFFER_MINS` (15)". The engine agrees with :401.…
- **Doc change:** METHODOLOGY.md:379: replace "The schedule marks the competition as flighted but does not track Flight A/B start/end times separately – only total pool round duration matters" with a sentence saying the schedule records each flight's start, end, strips and refs (see Runtime Decomposition). This needs owner approval before commit.
- **Owner question:** Approve the rewritten :379 sentence.

### SC1b – Flighting group: the doc flights the larger event, while suggestFlightingGroups flights the smaller one

- **Status:** OPEN. **Verifier:** CONFIRMED.
- **Evidence:** [R] METHODOLOGY.md:391-392 says "The **larger event** becomes flighted (uses half the strips, double the time)" and "Smaller events get priority to start and run in parallel with the first flight". flighting.ts:22 claims to cite §Flighting Group Suggestion ("The competition with more pools is designated priority; the other becomes flighted"), but the doc has no such text. flighting.ts:52-54…
- **Doc change:** none if the spec wins. Optionally, since the group has no accept flow, METHODOLOGY:395-397 could say the suggestion is advisory text. That wording needs owner approval.
- **Engine change:** flighting.ts:52-54: make the event with more pools the flighted one and the smaller one the priority (strips_for_priority = the smaller event's pools). Fix the docstring at :22 and the tie message. Then either delete validateFlightingGroup (dead code, backlog §Dead code) or keep it, since it already agrees with the spec.
- **Owner question:** The spec-wins default is to flight the larger event (and Ops Manual practice agrees [I]), so this needs no owner call. The owner still has to decide whether the advisory flighting-group suggestion should survive at all now that FR-028 retired its accept flow. The options are to delete suggestFlightingGroups, calculateFlightedStrips and validateFlightingGroup along with §Flighting Group…

### SC1c – §Inputs and §How Flighting Works describe flighting as automatic and time-affine, but it is a user toggle with no time affinity

- **Status:** PARTIAL. **Verifier:** CONFIRMED.
- **Evidence:** [R] METHODOLOGY.md:62 says "**Flighting**: triggered when a competition's pool count exceeds the per-event strip cap". In the engine, flighting is the organizer's per-event flag (store.ts:72-80 CompetitionConfig.flighted, passed through at buildConfig.ts:232). An over-cap unflighted event only draws a POOLS_EXCEED_STRIP_CAP_UNFLIGHTED WARN and a "consider flighting" suggestion…
- **Doc change:** METHODOLOGY.md:62: change "triggered when" to "suggested when ... ; the organizer turns it on per event". :393 belongs to L11 and follows that verdict. All wording needs owner approval.
- **Engine change:** Delete flagFlightingCandidates if it is confirmed dead. That is dead-code sweep scope.
- **Owner question:** Should flighting stay a manual per-event toggle that the engine only suggests (matching the workbench 'engine is advisor' design)? If so, :62 is DOC-WRONG on the grounds of an owner ruling.

### SC2 – Day-end severity wording mostly fixed, with residual contradictions

- **Status:** PARTIAL. **Verifier:** CONFIRMED.
- **Evidence:** [R] Fixed by 024 (6a4107b710) and 018 (5272d66823). METHODOLOGY 61/80/173/221-224/682-683/751/1017-1019 now agree with the engine: DAY_ENDS_PAST_TARGET WARN (concurrentScheduler.ts:1731), PHASE_OVERRUNS_DAY_END ERROR for a non-last phase or a last phase past midnight (:1252-1324), WARN for a last-phase overrun (:1627), and the hard end = max(day end, 22:00) (constants.ts:54). [M] B1-B8 overrun…
- **Doc change:** :216: say Same-Day Completion WARNs at the soft target and fails a phase past its limit, or move :223-225 under Hard Constraints. :174: delete it (same-category ind/team pairs are hard-blocked by :90). :224: replace "the round-of-16 video stage" with "the video stage". :173: decide what "must fit" means without a validator. All of this needs owner approval.
- **Engine change:** Either delete validateSameDayCompletion (dead, backlog 1557-1567) or wire it with the last-phase midnight allowance. Deleting it is the cheaper choice, since the runtime already enforces the limit per phase.
- **Owner question:** Should §Single-Day Fit stay a pre-schedule hard check (wire a validator) or become a description of the runtime per-phase limit (delete validateSameDayCompletion)? The medal-tail WARN gaps belong to separate backlog entries (backlog:623, :723).

### SC3 – Individual-Team Proximity: '4-hour separation required' contradicts its 2-hour example, the 120-min engine gap, and 'soft'

- **Status:** NEEDS_OWNER_CALL. **Verifier:** CONFIRMED.
- **Evidence:** [R] METHODOLOGY.md:299 says "**For other overlapping individual/team pairs**: 4-hour separation required, in either direction". :300 says "e.g., Vet Team at 9 AM allows Div 2 Individual at 11 AM" (2 h, team first). :302 says "(because their constraint is soft, not hard), the runtime sequencer enforces `team_pools_start >= indiv_DE_end + 120 min`". In the engine, the only gap is…
- **Doc change:** Rewrite :299-302. Option A: state the engine. The same-category pair is hard-blocked, and if the fallback co-days it, the team starts ≥120 min after the individual's last phase (INFO). No time gap applies to other ind/team pairs, whose day-level separation is the Group 2 soft rows (:288). Also drop the Appendix A row 'Ind+team gap < 120 min 3.0' (:991) with the eight retired weights. This needs…
- **Engine change:** Option A: none beyond deleting INDIV_TEAM_GAP_UNDER_MIN with the retired weights. Option B: add a cross-category ind/team time separation (choose 120 or 240 and which pairs), which moves B1 and B8.
- **Owner question:** The doc gives three numbers (4 h, 2 h, 120 min) and calls the rule both 'required' and 'soft', so spec-wins cannot pick one. Option A (recommended, consistent with retiring time-of-day rules as Phase D casualties): document only the 120-min same-category edge and no intra-day gap for other pairs. Option B: enforce a separation for cross-category overlapping pairs. If B, the owner must pick the…

### UV1a – §Inputs day-count claim

- **Status:** ALREADY_FIXED. **Verifier:** CORRECTED.
- **Evidence:** [R] METHODOLOGY.md:54 says "**Tournament duration**: 2–4 days". :55 (added by the 019 amendment bf8931c78c) covers template minimums and is consistent. TournamentPanel.tsx:121 offers [2, 3, 4], and an out-of-range day count shows as a disabled pill (:126-133). validation.ts:457 enforces a structural 1–14 bound, and validation.ts:434 raises a 'recommended 2–4 day range' notice. The store default…
- **Verifier correction:** The ALREADY_FIXED status has no basis: no shipped feature fixed this line. METHODOLOGY.md:54 "**Tournament duration**: 2–4 days" is unchanged since 2f4e67e307 (2026-04-01, git blame). When backlog commit 2a18984b8d (2026-09-01) called it stale, the UI already offered 2/3/4 (TopBar.tsx:17 `DAY_COUNTS = [2, 3, 4]` at that commit), and so does the UI today (TournamentPanel.tsx:121). 019…

### UV1b – §Inputs video-strip claim (4/8/12/16, NACs only, multiples of 4) vs a free 0..strips stepper at every type

- **Status:** OPEN. **Verifier:** CONFIRMED.
- **Evidence:** [R] METHODOLOGY.md:51 (024 amendment 6a4107b710) says "**Video strip count** (NACs only): 4, 8 (default), 12, or 16." :190 says "Video strips come in multiples of 4. The minimum is 4". In the UI, StripsPanel.tsx:190-200 shows a 'With video' Stepper with min 0, max stripsTotal and the default step 1 (number-input.tsx:31) at every tournament type. TYPE_DEFAULTS gives 8 at NAC and 0 elsewhere…
- **Doc change:** none if the spec wins. Otherwise relax :51 and :190 to 'any count; 8 default at NAC'. That needs owner approval.
- **Engine change:** Spec-wins: in the UI/store (not src/engine), step the video stepper by 4 with a minimum of 4 at NAC, and hide it or pin it to 0 at non-NAC types. Update the live-smoke driver to match.
- **Owner question:** Should the UI constrain video strips to 4/8/12/16 and NAC only (spec as written), or should the doc relax to any count at any type? The 024 amendment wrote :51 on 2026-10-05, so the spec-wins default is UI-WRONG.

### UV1c – §Inputs per-competition list holds per-day settings (start and latest end time)

- **Status:** OPEN. **Verifier:** CONFIRMED.
- **Evidence:** [R] METHODOLOGY.md:56-62 lists "**Start time**: defaults to 9:00 AM ... the user can adjust it per day" and "**Latest end time**: defaults to 7:00 PM" under "**Per-competition options**". In the engine these are per-day: dayConfigs feed dayStart/dayEnd/dayHardEnd (types.ts:584-603; buildConfig.ts:82). The per-competition latest_end is always Infinity (buildConfig.ts:225) and earliest_start is…
- **Doc change:** METHODOLOGY.md:60-61: move Start time and Latest end time out of 'Per-competition options' into a per-day item under Inputs. This needs owner approval.
- **Owner question:** Approve the move.

### L16 – Refs per pool: per-type defaults now documented, but the 'Auto' bullet and the 'default' wording describe a choice the app no longer offers

- **Status:** PARTIAL. **Verifier:** CONFIRMED.
- **Evidence:** [R] 024 (6a4107b710) fixed the audit's finding. METHODOLOGY.md:608-613 now tables Two at NAC/SYC/SJCC and One at ROC/RYC/RJCC, and :53 matches TYPE_DEFAULTS (typeDefaults.ts:27-48), which buildConfig.ts:178,204 applies. Residuals: :619 says "**Auto**: uses two-per-pool at every type". That is true of resolveRefsPerPool (pools.ts:202-203), but no app path produces AUTO: TYPE_DEFAULTS is never…
- **Doc change:** :619: delete the Auto bullet (or mark it test-only). :53/:608: change 'defaulted by'/'sets the default' to 'set by'. Needs owner approval.
- **Engine change:** Under decision (c), drop RefPolicy.AUTO (types.ts:41) and its branch comment (pools.ts:192,202), switch factories.ts:92 to TWO (same 2/pool, so no drift [I]), and delete the dead AUTO_REF_FALLBACK cause.
- **Owner question:** Is refs per pool fixed by type with no organizer override (current app)? If yes, approve deleting 'Auto' and the 'default' wording.

**Missed by the auditor (G06-selfcontra):** 1. SC1b/SC1c: METHODOLOGY.md:857 (§Flighting Suggestion) says \"The engine calls `flagFlightingCandidates()` ... and suggests flighting for the larger event\". The 'larger event' clause backs SC1b's spec-wins verdict. The 'engine calls' clause is false: analysis.ts:155-183 (Pass 1) does its own per-event-override cap check, and flagFlightingCandidates has no caller in src/, only tests (stripBudget.test.ts:150-175, sizeableCount.test.ts:138-143). Deleting it means editing METHODOLOGY :375, :387 and :857, and that needs owner approval. The organizer's toggle is DetailStrip.tsx:267-268. Since buildConfig.ts:233 always sets flighting_group_id to null, these never run in the app: the flighting-group strip validation (validation.ts:106-111) and the 'Flighting pairs kept together' rule…

## G07-deadcode-a

### DS – Delete unreachable daySequencing.ts and its 14 tests, and repoint METHODOLOGY's three mentions

- **Status:** OPEN. **Verifier:** CONFIRMED.
- **Evidence:** [R] grep of src/: nothing imports daySequencing.ts. The only mention is the comment at concurrentScheduler.ts:1508-1510 ("mirrors daySequencing.ts rule 1"). The backlog's :1119 cite at backlog.md:1543 is stale. [M] __tests__/engine/daySequencing.test.ts holds 14 its (9 under describe :8, 5 under :182). METHODOLOGY:117 says "A within-day sort key orders the siblings, after the indiv-before-team…
- **Doc change:** Owner approval needed. METHODOLOGY:117-118: drop the sort-key sentence and the daySequencing pointer, and name `applyCrossEventEdges` alone. The wording must match the DS-EDGE ruling, because today's text claims serialization 'is enforced', which is false. :648: replace '(mirrors `daySequencing.ts` rule 1; ...)' with the B3 rationale alone. :669: drop '(mirrors the within-day sort key in…
- **Engine change:** Delete src/engine/daySequencing.ts. Reword the comment at concurrentScheduler.ts:1508-1510 so it no longer names daySequencing.ts. After the deletion, Competition.optional (types.ts:235, set false for every event at buildConfig.ts:226) has no reader, because daySequencing.ts:101-102 is its only reader. METHODOLOGY:724 'Mandatory competitions before optional' is then vacuous, which is L12's…
- **Owner question:** Approve the METHODOLOGY:117-118, :648 and :669 rewrites. The :118 wording depends on the DS-EDGE answer, since the doc may not claim the edge enforces serialization while it does not.

### DS-EDGE – Live Vet sibling serialization edge never binds (0 of 60 pairs serialized)

- **Status:** NEEDS_OWNER_CALL. **Verifier:** CORRECTED.
- **Evidence:** [M] Probe G07-vetorder.log at 5edbdf7712. B8 has 60 same-day age-banded sibling pairs: 0 meet younger.pool_start >= older.end + 30, and in 21 the younger starts first. NAC Vet/Div1/Junior on B1's board shows 0 of 60 with 35 inverted. No other B or template has banded vets. [R] Cause: predecessorReadyTime (concurrentScheduler.ts:1560-1574) skips any predecessor whose last phase is not RUNNING…
- **Doc change:** Depends on the ruling. With strict serialization, METHODOLOGY:116-118 and :669 stand once the pointer is fixed (DS). With a staggered start, rewrite :116-118 and :669 from 'pools wait on the older sibling's last phase end + ADMIN_GAP_MINS' to a start offset, and record it in Appendix B as Piste Planner's own rule.
- **Engine change:** Make the chosen wait real. Either set a floor at queue time, the way group1_window_floor does (concurrentScheduler.ts:744-760, :804-810), or re-queue a node whose predecessor is unplaced. Add a test asserting the younger sibling's actual pool start. The ind→team edge (:679-692) has the same defect but cannot fire (backlog.md:1023-1028).
- **Owner question:** Strict end-to-end serialization as METHODOLOGY:118/:669 states, which loses 8 B8 events per backlog.md:1044-1048 and needs a policy-amendment floor lowering? Or a staggered start, such as each younger band's pools ready 60 min after the older band's pool start, which keeps B8 at 53 but needs a METHODOLOGY amendment? Or defer it out of 021 and only correct the doc's 'is enforced' claim?
- **Verifier correction:** Status NEEDS_OWNER_CALL and the numbers stand. Re-probe G07v-recheck.log [M]: B8 has 60 same-day banded pairs, 0 serialized and 21 inverted. B1-B8 emit 0 CROSS_EVENT_DEPENDENCY_DELAY findings, so the edge never pushes once. The mechanism is wrong, though. predecessorReadyTime is not 'checked only once, at pop': a deferred node is re-queued and re-checked at :981 on every pop. It never binds…

### K1 – Delete SAME_TIME_WINDOW_MINS and MAX_RESCHEDULE_ATTEMPTS (no readers)

- **Status:** OPEN. **Verifier:** CORRECTED.
- **Evidence:** [R] Full trace: constants.ts:118 and :126; TournamentConfig types.ts:290 and :293; buildConfig.ts:18 and :21 (imports) and :109 and :112. They have no store slice, serialization, share link, save file or UI: 013 T022 removed the overrides slice (store.ts:83-87, SettingsPanel.tsx:35-38). configKeyOf (keptRun.ts:92) encodes the whole config, but no test pins a literal key. inputEdits.ts lists…
- **Doc change:** Owner approval needed, and it goes with the time-of-day retirement. Delete METHODOLOGY:1027 (the SAME_TIME_WINDOW_MINS row) together with :244-246 (same-time section) and :988-989. MAX_RESCHEDULE_ATTEMPTS needs no METHODOLOGY change. Update backlog.md:1551-1553 to record the deletion.
- **Engine change:** Remove both exports (constants.ts:118, :126), both TournamentConfig fields (types.ts:290, :293), and the imports and fields in buildConfig.ts (:18, :21, :109, :112).
- **Verifier correction:** The trace, the evidence and the engine change are confirmed: constants.ts:118/:126, types.ts:290/:293, buildConfig.ts:18/:21/:109/:112, factories.ts:62/:65 and buildConfig.test.ts:13-14/:330/:333. The commits 5eb5065382 and 4ef8fa96fa removed the readers [R via git show]. The doc_change line range is wrong: METHODOLOGY:244 is '- Two-hop indirect relationships computed automatically, capped at…

### K2 – 4:00 PM pool cutoff: LATEST_START_MINS and LATEST_START_OFFSET dead, B4 and B6 place pools after 16:00

- **Status:** NEEDS_OWNER_CALL. **Verifier:** CORRECTED.
- **Evidence:** [R] Trace: constants.ts:57-58; types.ts:282-283; buildConfig.ts:14-15, :105-106; factories.ts:21, :54-55; buildConfig.test.ts:10, :325-326. There is no store, serialization or UI path. Phase D 4ef8fa96fa deleted the enforcement (`latestStart = dayStart + LATEST_START_OFFSET` → NO_WINDOW) and its Phase D plan records no rejection. METHODOLOGY:80 says "Pool rounds cannot start after 4:00 PM – this…
- **Doc change:** Depends on the call. To enforce: METHODOLOGY:80 and :1022 stand, and possibly name the rule's severity. To delete: strike the last sentence of :80 and the :1022 row as a Phase D casualty. To warn only: reword both as a WARN on a pool start after 16:00. Every version goes to the owner for approval.
- **Engine change:** To enforce: add a notAfter check on the start of pools, flight_a and flight_b in the concurrent loop. A deferral past the cutoff fails the attempt, so the retry can try earlier. Also decide whether it is 16:00 on the clock or day start + 7h (LATEST_START_OFFSET) when the organizer moves day start. To delete: remove both constants, both TournamentConfig fields, the buildConfig lines,…
- **Owner question:** Enforce (pools after 16:00 fail and retry, likely losing B4 and B6 events and needing a sanctioned floor drop), warn only (the pool stays placed with a WARN, matching 018's overrun approach), or delete as an unsourced Phase D casualty? If enforced: clock 16:00, or 7h after an edited day start?
- **Verifier correction:** The [M] numbers reproduce exactly (G07v-recheck.log): B4 Y12-M-SABRE-IND at 16:05 on day 2, and B6 CDT-W-FOIL-IND at 16:25, Y12-W-EPEE-IND and JR-W-EPEE-IND at 17:35 and VET-M-SABRE-IND-VCMB at 20:25. No flight_a or flight_b starts after 16:00 on any B scenario. I did not re-run the templates. The evidence omits the reconciliation verdict: methodology-reconciliation.md:462 rules L7…

### K3 – Delete EARLY_START_THRESHOLD and THRESHOLD_MINS (no readers)

- **Status:** OPEN. **Verifier:** CORRECTED.
- **Evidence:** [R] EARLY_START_THRESHOLD: constants.ts:125, types.ts:292, buildConfig.ts:20 and :111, factories.ts:64, buildConfig.test.ts:14 and :332. Its reader was removed in 5eb5065382. THRESHOLD_MINS: constants.ts:75, types.ts:288, buildConfig.ts:28 and :93, inside the block buildConfig.ts:85-90 calls "These seven". Also factories.ts:60, buildConfig.test.ts:11 and :266 (describe 'the seven retuned…
- **Doc change:** Owner approval needed. Delete METHODOLOGY:1026 together with the retired early-start text (:248-251, :992-994). backlog.md:1631-1636 and :1662 should note the deletion.
- **Engine change:** Remove both exports (constants.ts:75, :125), both fields (types.ts:288, :292) and the buildConfig.ts lines. 'Seven' becomes 'six' in the comments at buildConfig.ts:85-90, store.ts:83-87 and SettingsPanel.tsx:35-38.
- **Verifier correction:** The trace is confirmed (constants.ts:75/:125, types.ts:288/:292, buildConfig.ts:20/:28/:93/:111, factories.ts:60/:64, buildConfig.test.ts:11/:14/:266/:332, serialization.test.ts:161). It misses METHODOLOGY:578, 'If delay exceeds a threshold, a strip-contention bottleneck diagnostic is emitted'. That is a spec statement of the THRESHOLD_MINS rule, and it contradicts :688 ('generic one-shot…

**Missed by the auditor (G07-deadcode-a):** The DS rules in daySequencing.ts beyond rule 1 and rule 2 are not traced: - Rule 3, individual before team, survives only as the ind→team edge, which cannot fire (backlog.md:1023-1028). - Rule 4 multiplies strip demand by categoryWeight. Live compareNodes key 4 (concurrentScheduler.ts:1539) uses raw desired_strip_count with no categoryWeight. - Rule 5, duration descending, has no live successor. - The post-sort flighting-partner adjacency (daySequencing.ts:124-145) is the only reader behind METHODOLOGY:725, 'Flighting pairs kept together at the priority competition's score position'. METHODOLOGY:724 (mandatory before optional) and :725 are in §Phase 3 Priority Ordering, which names scheduler.ts. That file is 34 lines and implements neither, so both are vacuous today, not only after the…

## G08-deadcode-b

### V1 – validateFlightingGroup (flighting.ts) has no production caller

- **Status:** OPEN. **Verifier:** CORRECTED.
- **Evidence:** [R] Defined flighting.ts:141-222. Callers are tests only: flighting.test.ts:175-270 (5 its) and sizeableCount.test.ts:153-167 (2 it.each). No caller in src/. Check 1 (multiple flighted on one day) duplicates live initialAnalysis Pass 3 (analysis.ts:198-225, reached from store/derived.ts:342). Checks 2 and 3 need a FlightingGroup, which the app never builds: buildConfig.ts:233 sets…
- **Engine change:** Delete it: validateFlightingGroup (flighting.ts:124-222) and its imports, plus the enum members only it produces. Those are BottleneckCause FLIGHTING_GROUP_NOT_LARGEST (types.ts:129) and SAME_DAY_DEMOGRAPHIC_CONFLICT (types.ts:114), and BottleneckRule FLIGHTED_NOT_LARGEST and FLIGHTING_GROUP_CROSSOVER_PENALTY (types.ts:185-186) [R: grep finds no other producer]. Keep MULTIPLE_FLIGHTED_SAME_DAY,…
- **Verifier correction:** OPEN stands, and the cited lines check out: flighting.ts:141-222, no caller in src/, analysis.ts:198-225 Pass 3 duplicates check 1, buildConfig.ts:233-234 sets the group id to null and is_priority to false, and validation.ts:104-126 is dead in the app. Three corrections. (1) tests_affected misses __tests__/helpers/bottleneckInvariants.ts:13. CAUSE_OF_RULE there is typed Record<BottleneckRule,…

### V2 – validateSameDayCompletion is unwired and stricter than §Single-Day Fit

- **Status:** OPEN. **Verifier:** CORRECTED.
- **Evidence:** [R] validation.ts:59-83. No caller in src/. Tests only: validation.test.ts:1036-1099 (11 its). It checks pool + admin + DE baseline <= the widest hard window (780). METHODOLOGY:173: 'every phase but its last ends by the day's hard end ... and its last phase starts before the hard end and ends by midnight'. So the function flags cases the spec allows, a last phase that may overrun after 018 R1.…
- **Doc change:** None if aligned and wired (default). The alternative needs owner approval: METHODOLOGY:171-174 would say Single-Day Fit is enforced at allocation (SAME_DAY_VIOLATION, :682) and not as a Phase 1 pre-check.
- **Engine change:** Default (spec wins): align and wire. Measure phases-but-last against hardEnd - start, and the last phase's start against the hard end and its end against midnight (dayMidnight). Guard with isSizeableCount so it returns null and never throws. Call it per event from validateConfig as a per-event finding with rule same-day-completion. Fix the docstring (:46-58) to cite the last-phase rule.
- **Owner question:** Wire the aligned check (spec default, zero fires on B1-B8)? Or delete it and amend §Single-Day Fit to say the runtime limits (SAME_DAY_VIOLATION plus the two-attempt retry) are the enforcement? Either one closes 018's note.
- **Verifier correction:** The status (OPEN), the spec quotes (METHODOLOGY:173, :84-86, :698) and every [M] number are right. My rerun of the probe gave 0 fires on all 239 events and the same throw at n=1, 'computePoolStructure: fencerCount must be > 1, got 1' [M]. The test count is wrong. validation.test.ts:1046-1099 holds one describe with 4 its, not 11: 700 passes, 790 fails, 830 fits 840, and past the widest day fails…

### V2b – Single-Day Fit's ind+team bullet has no implementation since 010 deleted it

- **Status:** OPEN. **Verifier:** CORRECTED.
- **Evidence:** [R] METHODOLOGY:174: 'If an individual and team event are on the same day, their combined worst-case duration (including the 2-hour gap) must also fit'. 010 T005 (5a3a1a6826) deleted the rule as vacuous (reconciliation R1, methodology-reconciliation.md:346): same-category ind/team pairs are blocked by Same-Population Conflicts (METHODOLOGY:102), so the premise never holds. The doc bullet…
- **Doc change:** METHODOLOGY:174: delete the bullet, or reword it to say the case arises only when the least-bad fallback breaks a hard pair, and that the runtime then handles it (owner approval needed).
- **Owner question:** Delete METHODOLOGY:174, or keep it reworded as a statement about the least-bad fallback case?
- **Verifier correction:** OPEN, METHODOLOGY:174, commit 5a3a1a6826 ('010 T005: delete the vacuous indiv-team-same-day rule (R1)') and 024 handoff:440 all check out. Two premises are wrong. (1) The least-bad fallback is not the only path to a same-day ind/team pair. Hand placements produce one too: placementRules.ts:51-61 emits WARN UNAVOIDABLE_CROSSOVER_CONFLICT / HARD_SEPARATION_VIOLATED for any same-day…

### L8 – Vet 60/70/80/Combined 2-hour start offset is unenforced

- **Status:** OPEN. **Verifier:** CORRECTED.
- **Evidence:** [R] METHODOLOGY:899: 'VET Combined, VET 60, VET 70, VET 80 | 0.6 | Lightest; 2-hour start offset (medication timing for older athletes)'. :1100 says '120-min start offset from day start'. The doc says 10:00 AM nowhere: the audit's 10:00 assumed the old 8:00 day start, and 024 moved it to 9:00 (:1016), so the literal rule is now 11:00. constants.ts:20-39 sets earliest_start_offset 120 for…
- **Doc change:** If the owner keeps +120: state the rule in prose (not only in the weights table at :899 and :1100), and reconcile it with :116 (VET80 to VET40, older first). [M] With the offset alone, B8 VET-M-EPEE runs V40/V50 at 09:00 and V60-80 at 11:00, youngest first, because the sibling edge never binds (backlog §The Vet sibling and individual-to-team edges never hold an event back).
- **Engine change:** In firstPhaseReadyTime (concurrentScheduler.ts:803-809), use dayStart(assigned_day) + the category offset, looked up through capacity.ts:180-188's compound key. Do not use buildConfig's earliest_start: it is an absolute minute and the day is unknown at build time. The retry path shares this function. Hand pins (016) are not checked against the offset.
- **Owner question:** 024 moved day start 8:00 to 9:00. Is the rule day start + 120 (11:00 by default, zero count loss [M]) or 10:00 AM clock (+60, loses 1 B6 event [M])? Also, older bands starting 2 h after VET40/50 inverts §Within-Day Age-Descending Order while the sibling edge is broken. Accept that, or fix the edge first?
- **Verifier correction:** OPEN is right. The quotes check out (METHODOLOGY:899, :1100 '120-min start offset from day start', :897 VET40/50 'no start offset', :1016 day start 9:00), and the doc says 10:00 nowhere. constants.ts:31-34 is unread (capacity.ts:183-189 reads only .weight), buildConfig.ts:219 sets earliest_start 0, and firstPhaseReadyTime is at concurrentScheduler.ts:803-809. Two corrections. (1) The…

### D2a – de_round_of_16_requirement / DeStripRequirement: unread Competition field

- **Status:** OPEN. **Verifier:** CONFIRMED.
- **Evidence:** [R] types.ts:242 (field), types.ts:51-55 (DeStripRequirement). Its only writer is buildConfig.ts:227 (HARD). No reader in src/. METHODOLOGY never mentions it. Tests: factories.ts:102, concurrentScheduler.test.ts:50 (IF_AVAILABLE override, no effect), buildConfig.test.ts:184. The fixture buildConfig-preShrink-nac-vet-div1-junior.json carries it in 132 rows and is deep-equal checked at…
- **Engine change:** Delete the field and the DeStripRequirement const and type (types.ts:51-55, :242), plus buildConfig.ts:227 and the DeStripRequirement import at buildConfig.ts:6. No back-compat needed (decision c).

### D2b – conflict_score on ScheduleResult: always 0, never read

- **Status:** OPEN. **Verifier:** CONFIRMED.
- **Evidence:** [R] types.ts:376. Written as 0 at concurrentScheduler.ts:465 and derive.ts:161, and named in derive.ts:16-18's docblock as a neutral diagnostic. No reader in src/. Tests: factories.ts:178, and derive.test.ts:69 and :89, which exclude it from parity. METHODOLOGY never documents it. Not in the ledger snapshot (0 matches [M grep]).
- **Engine change:** Delete the field from ScheduleResult and both writers, and trim derive.ts:16-18 to name only accepted_warnings.

### D2c – genderEquityAllowableDiff: helper for a feature the doc calls future

- **Status:** OPEN. **Verifier:** CONFIRMED.
- **Evidence:** [R] analysis.ts:95-109. No caller in src/. Its docstring cites §Phase 2 Pre-Scheduling Analysis, but that list (METHODOLOGY:706-712) has no gender-equity pass. METHODOLOGY:926: 'Gender equity pool-count validation ... is to be added in a future version.' BottleneckCause.GENDER_EQUITY_CAP_VIOLATION (types.ts:132) has no producer. Tests: analysis.test.ts:20-41 (12 table cases sourced to 'PRD…
- **Doc change:** None. METHODOLOGY:926 stays true either way.
- **Engine change:** Recommend deleting genderEquityAllowableDiff, GENDER_EQUITY_CAP_VIOLATION and the stale docstring. No documented rule encodes it today: the doc defers it, and git history keeps the table for the future feature.
- **Owner question:** Gender equity is on the roadmap only as 'future'. Delete the seed table now (recommended), or keep it as test-only evidence until that feature is specced?

### D2d – recommendRefCount: pre-schedule referee suggestion the spec rules out

- **Status:** OPEN. **Verifier:** CORRECTED.
- **Evidence:** [R] stripBudget.ts:55-140. No caller in src/: StripsPanel.tsx:179 uses resolveRefsPerPool only. METHODOLOGY:853: 'Referee counts are computed from the schedule, not suggested as inputs', and :587 says refs are 'an output'. Not in §Strip Budget Key Functions (:371-375), which instead names recommendStripCount, a function that does not exist (012 FR-016, stripBudget.ts:1-6). Readers:…
- **Doc change:** Separate small doc fix (owner approval): METHODOLOGY:374 names a nonexistent recommendStripCount. Remove the line or point it at stripSearch.ts searchStripCount.
- **Engine change:** Delete recommendRefCount and the 'recommend ref counts' phrase in stripBudget.ts:1-2. Keep peakDeStripDemand and peakDeRefDemand, which concurrentScheduler.ts:1866 and :1888 use.
- **Verifier correction:** OPEN and delete stand (METHODOLOGY:853 and :587 quoted correctly, StripsPanel.tsx:179 uses only resolveRefsPerPool, 8 refRecommendation blocks in the snapshot [M]). Three corrections. (1) The span is stripBudget.ts:54-135: docblock 54-68, function 69-135. It is not 55-140, and :143 is flagFlightingCandidates. (2) peakDeRefDemand is defined in refs.ts:38, not stripBudget.ts, so 'keep…

### D2e – CAPACITY_PENALTY_CURVE: 5 of 6 members unread; doc curve rejected in code

- **Status:** OPEN. **Verifier:** CONFIRMED.
- **Evidence:** [R] constants.ts:721-734. Only OVERFLOW_PENALTY is read (dayColoring.ts:106). capacityPenalty (dayColoring.ts:99-107) hardcodes 0.85 / 1.0 / 3.0 / 10.0. METHODOLOGY:901-912 still documents '< 0.60 0', '0.60-0.80 ... 0 to 3.0', '0.80-0.95 ... 3.0 to 10.0', '> 0.95 20.0'. dayColoring.ts:93-97 records the rejected experiment ('over-steered events in mid-loaded days'). The audit verdict is L2…
- **Doc change:** Through L2 (owner approval): rewrite METHODOLOGY:901-912 to the live curve (0 up to 0.85, linear to 3.0 at 1.0, then 3.0 + 10 x (fill - 1) capped at 20.0), and record the rejected 0.60-start curve with its reason.
- **Engine change:** After the doc change, delete LOW_THRESHOLD, MID_THRESHOLD, HIGH_THRESHOLD, LOW_BAND_MAX and MID_BAND_DELTA. Optionally move the live 0.85, 3.0 and 10.0 into the constant so the doc's numbers have one source (no value change).
- **Owner question:** Approve L2's rewrite of §Capacity Penalty Curve to the live 0.85-start curve. It is the precondition for deleting the five constants.

### D2f – MORNING_WAVE_WINDOW_MINS: documented rule, unimplemented (keep and wire)

- **Status:** OPEN. **Verifier:** CONFIRMED.
- **Evidence:** [R] constants.ts:76-77 (120, with its own rationale comment). No reader in src/ or __tests__. It encodes METHODOLOGY:565, the start-of-day pool wave: 'video strips MAY be used by pool rounds running at day start ... Once this wave ends, video strips become reserved for DEs', with :566-567 adding the single-event-day and mid-day rules. Audit §2.6 (methodology-reconciliation.md:447-449) verdict:…
- **Engine change:** Keep it. It is wired by whichever 021 item implements §2.6, which adds a time-of-day and event-count branch for pools in findAvailableStripsInWindow (resources.ts). Not a dead-code deletion.

**Missed by the auditor (G08-deadcode-b):** 1. cross_item_notes item 6 is right that backlog.md:1527 is stale, but for the wrong reason. The line reads 'validateSameDayCompletion, whose WARN the runtime emits as an SAME_DAY_VIOLATION ERROR (§Day-end overrun below is the same finding from the other side)'. It refers to the doc's WARN versus the runtime ERROR on day-end overrun, which 018 closed (backlog.md:159). It does not concern the function's own err(). err() is ERROR, validation.ts:9-11. 2. D2c context. METHODOLOGY:972 (source S8, Athlete Handbook 2026-27) lists 'gender equity' as a Handbook topic, so the PRD 9.1 table probably has a USA Fencing origin. Also, :926 describes 'proportional strip allocation by gender during pool rounds', which is a different mechanism from the pool-count-difference cap that…

## G09-unused-exports

### UX-SchedulingError – SchedulingError class is dead since Phase D

- **Status:** OPEN. **Verifier:** CONFIRMED.
- **Evidence:** [R] src/engine/dayAssignment.ts:16-22 `export class SchedulingError`. [M] ts-morph find_unused_exports over the app tsconfig (src+__tests__) reports it with 0 refs, and grep finds no reader in src/, __tests__/ or scripts/. [R] `git log -S "new SchedulingError"` shows its last thrower was removed by 4ef8fa96fa (Phase D, switch to the concurrent scheduler). METHODOLOGY.md never names it (grep,…
- **Engine change:** Delete dayAssignment.ts:12-22 (class and its banner comment). The rest of the file (constraintScore, saberPileupPenalty) stays live.

### UX-isRegionalQualifier – isRegionalQualifier and REGIONAL_QUALIFIER_TYPES have no production reader

- **Status:** OPEN. **Verifier:** CONFIRMED.
- **Evidence:** [R] analysis.ts:14-16 `isRegionalQualifier` has no reader in src/ (prod-only scan, 0 refs). Its only data is REGIONAL_QUALIFIER_TYPES (constants.ts:583-593, comment: "cannot cap fencer registrations per handbook"), which only analysis.ts:7,15 reads, so it is transitively dead. [R] METHODOLOGY never names it. The fencer-count rule it would gate is applied to every event: "Fencer count bounds |…
- **Engine change:** DELETE-IN-021: remove isRegionalQualifier (analysis.ts:10-16 with its docblock), the REGIONAL_QUALIFIER_TYPES constant and banner (constants.ts:583-593) and the analysis.ts:7 import, and reword the constants.ts:475 comment so it does not name it.

### UX-genderEquityAllowableDiff – genderEquityAllowableDiff, a future-feature helper removed from the pipeline in April

- **Status:** OPEN. **Verifier:** CONFIRMED.
- **Evidence:** [R] analysis.ts:95-109 has no src/ caller. [R] Commit a356981140 (2026-04-02) deleted initialAnalysis' Pass 7, its only caller, and added the doc footnote at METHODOLOGY:926: "Gender equity pool-count validation (proportional strip allocation by gender during pool rounds) is to be added in a future version." No METHODOLOGY section states its thresholds (≤3→0, 4–7→1, 8–11→2, 12+→3). The docblock…
- **Engine change:** DELETE-IN-021: remove genderEquityAllowableDiff and BottleneckCause.GENDER_EQUITY_CAP_VIOLATION. METHODOLOGY:926 stays, since the future feature can re-derive the thresholds from S8 (Athlete Handbook, gender equity).
- **Owner question:** Optional: should the gender-equity thresholds stay in the tree as a stub for the future validation, or go (recommended)?

### UX-dayRemainingCapacity – dayRemainingCapacity is test-only; day coloring computes capacity inline

- **Status:** OPEN. **Verifier:** CONFIRMED.
- **Evidence:** [R] capacity.ts:158-173 (and its result type DayRemainingCapacity at capacity.ts:36) has no src/ caller. [R] `git log -S` shows it was added by ff646c8af3 (Plan D Task 1) and never wired after Phase D. The live §Strip-Hour Capacity rule is in dayColoring.ts:625-650: "available strips × the planning day length (10 hours...)" (METHODOLOGY:875). Its sibling dayConsumedCapacity stays live…
- **Engine change:** DELETE-IN-021: remove dayRemainingCapacity and the DayRemainingCapacity interface.

### UX-weightedStripHours – weightedStripHours duplicates the inline category weighting in dayColoring

- **Status:** OPEN. **Verifier:** CONFIRMED.
- **Evidence:** [R] capacity.ts:191-198 has no src/ caller. [R] METHODOLOGY §Age-Category Weights (:887-889) is live spec: "Each competition's strip-hour draw is multiplied by a category weight". [R] It runs inline at dayColoring.ts:643-644 (`raw * categoryWeight(c)`), so the rule is enforced and only the helper is dead. [R] Added by f5ea2fe782 (Plan D). [R] Tests: capacity.test.ts:8 and :596-723 (6 its,…
- **Engine change:** DELETE-IN-021 (preferred), or call it from dayColoring.ts:643-644. Neither changes numbers.

### UX-proximityPenalty – proximityPenalty (L1's faithful encoding) is now a duplicate; deleting it orphans PROXIMITY_PENALTY_WEIGHTS, which METHODOLOGY cites

- **Status:** OPEN. **Verifier:** CONFIRMED.
- **Evidence:** [R] crossover.ts:268-297 has no src/ caller (last caller removed by 5eb5065382). [R] L1 was fixed by 010: dayColoring.ts:346-377 now applies PENALTY_WEIGHTS.PROXIMITY_1_DAY (-0.4) at gap 1 and PROXIMITY_3_PLUS_DAYS (0.5) at gap 3+ (constants.ts:712, 696). [R] PROXIMITY_PENALTY_WEIGHTS {1:-0.4, 2:0, 3:0.5} (constants.ts:565-570) is read only by crossover.ts:292 inside the dead function.…
- **Doc change:** METHODOLOGY:269: replace `PROXIMITY_PENALTY_WEIGHTS` with `PENALTY_WEIGHTS` (PROXIMITY_1_DAY, PROXIMITY_3_PLUS_DAYS, Appendix A :1002/:1006). This is a doc edit and needs owner approval. The no-doc-change alternative is to have dayColoring read PROXIMITY_PENALTY_WEIGHTS and retire the two PENALTY_WEIGHTS keys instead. The values are identical either way.
- **Engine change:** DELETE-IN-021: remove proximityPenalty, the PROXIMITY_PENALTY_WEIGHTS constant and banner (constants.ts:560-570), and the crossover.ts:12 import. Check whether the ScheduleResult import at crossover.ts:1 becomes unused.
- **Owner question:** Approve the METHODOLOGY:269 pointer change (keep the PENALTY_WEIGHTS keys and drop PROXIMITY_PENALTY_WEIGHTS), or keep the table and drop the keys?

### UX-individualTeamProximityPenalty – individualTeamProximityPenalty duplicates dayColoring's live ordering penalty

- **Status:** OPEN. **Verifier:** CONFIRMED.
- **Evidence:** [R] crossover.ts:316-347 has no src/ caller. The live copy is dayColoring.ts:195-214 `individualTeamOrderingPenalty`, which reads the same three PENALTY_WEIGHTS keys and implements METHODOLOGY §Individual-Team Proximity (:292-298: "Team event preferred the day after individual: bonus / Team before individual: penalty / 2+ days apart: penalty"). [R] The audit already called it "no src/ caller"…
- **Engine change:** DELETE-IN-021: remove individualTeamProximityPenalty. After this item and UX-proximityPenalty, drop the ScheduleResult type import at crossover.ts:1 if nothing else uses it.

### UX-peakConcurrentStrips – peakConcurrentStrips lost its last caller in 016; its docblock claims callers that do not exist

- **Status:** OPEN. **Verifier:** CONFIRMED.
- **Evidence:** [R] resources.ts:269-317 has no src/ caller. [R] `git log -S "peakConcurrentStrips("` shows its last production use was removed by bce5a8ec5e (016 Task E: one referee number). The docblock at :277-279 still says "Used by Phase B's referee-staffing layer ... and by post-schedule capacity reporting", which is false. [R] METHODOLOGY never names it. Ref demand is the refs.ts sweep (§Referee…
- **Engine change:** DELETE-IN-021: remove the function and its banner.

### UX-findDayForTime – findDayForTime lost its last caller in 016

- **Status:** OPEN. **Verifier:** CONFIRMED.
- **Evidence:** [R] types.ts:644-658 has no src/ caller. [R] `git log -S "findDayForTime("` shows the last caller removed by bce5a8ec5e (016 Task E). METHODOLOGY never names it. [R] Tests: dayHardEnd.test.ts:2 and :677-703 (2 its). Historical comments remain at __tests__/helpers/appPath.test.ts:109 and __tests__/store/appPathParity.test.ts:241 (they describe a past bug and can stay or be reworded).
- **Engine change:** DELETE-IN-021: remove findDayForTime and its docblock.

### UX-flagFlightingCandidates – Doc says the engine calls flagFlightingCandidates; analysis Pass 1 inlines the rule instead

- **Status:** OPEN. **Verifier:** CONFIRMED.
- **Evidence:** [R] stripBudget.ts:137-152 has no src/ caller (added by a42b03a531). METHODOLOGY names it as called, at :375 "`flagFlightingCandidates(competitions, config)` — returns competition IDs where `n_pools > pool_strip_cap`", at :387, and at :857 "The engine calls `flagFlightingCandidates()` to find competitions whose pool count exceeds `pool_strip_cap`". [R] The live rule is analysis.ts:155-183 (Pass…
- **Doc change:** None under WIRE. Separate, at METHODOLOGY:374: `recommendStripCount(competitions, config)` does not exist (strip suggestion is stripSearch.ts, §Strip Count Suggestion :839). Removing that bullet needs owner approval.
- **Engine change:** WIRE (spec wins): change its signature to (competitions, config), compute the cap per event with computeStripCap(strips_total, max_pool_strip_pct, override), and make analysis Pass 1 iterate its result. Warnings and suggestions come out identical.

### UX-recommendRefCount – recommendRefCount: a pre-schedule ref suggester the spec rules out, kept alive only by the drift ledger

- **Status:** NEEDS_OWNER_CALL. **Verifier:** CORRECTED.
- **Evidence:** [R] stripBudget.ts:53-135 has no src/ caller. [R] METHODOLOGY §Referee Output (:853): "Referee counts are computed from the schedule, not suggested as inputs". §Referee Calculation (:587) says refs are an output. The function sizes refs from pool and DE peaks before any schedule exists. [R] The drift ledger reads it: driftLedger.test.ts:27, :230, :358 (`refRecommendation` in each B1–B8 digest),…
- **Engine change:** If deleted: remove recommendRefCount and its now-unused imports (stripBudget.ts:9 Weapon/DeMode and :12 peakDeRefDemand, if nothing else uses them), and remove `refRecommendation` from the ledger digest.
- **Owner question:** Keep `refRecommendation` in the B1–B8 drift-ledger digest (so recommendRefCount stays as a ledger-only function), or delete the function and the digest field, which changes the snapshot SHA but no scheduling number?
- **Verifier correction:** The status (NEEDS_OWNER_CALL) and the owner question stand. One citation is wrong: driftLedger.test.ts reads recommendRefCount at :27 (import), :290 (a docblock naming it) and :358 (refRecommendation in the digest), not at :230 [R]. Reason it is a real owner call and not spec-wins: METHODOLOGY:853 says "Referee counts are computed from the schedule, not suggested as inputs", so the spec does…

### UX-MORNING_WAVE_WINDOW_MINS – MORNING_WAVE_WINDOW_MINS lost its reader in Phase D; its rule is live spec

- **Status:** OPEN. **Verifier:** CORRECTED.
- **Evidence:** [R] constants.ts:77 has 0 readers anywhere (ts-morph, including tests). [R] `git log -S` shows 4ef8fa96fa (Phase D) removed resources.ts's `atTime > dayStart(...) + MORNING_WAVE_WINDOW_MINS` pool-on-video guard. [R] METHODOLOGY:564: "Start-of-day pool wave: video strips MAY be used by pool rounds running at day start ... Once this wave ends, video strips become reserved for DEs". :566-567 cover…
- **Engine change:** WIRE, owned by the §Video Strip Preservation item (reconciliation §2.6): thread the day-start wave window and the single-event-day test into findAvailableStripsInWindow for pools. If that item is deferred, the constant should still not be deleted, since the doc rule is live.
- **Verifier correction:** The status (OPEN, WIRE, owned by the reconciliation §2.6 / Video Strip Preservation item, moves drift) and the evidence stand. Line numbers are off by one: the METHODOLOGY quote "Start-of-day pool wave: video strips MAY be used by pool rounds running at day start" is at :565, not :564. The single-event-day rule is at :566 and the multi-event mid-day ban at :567 [R]. The constant is at…

### UX-TAIL_MINS – INDIV_TAIL_MINS and TEAM_TAIL_MINS are unread duplicates of literals in tailEstimateMins

- **Status:** OPEN. **Verifier:** CONFIRMED.
- **Evidence:** [R] constants.ts:86-87 (30, 60) have 0 readers anywhere. [R] types.ts:549-553 `tailEstimateMins` hardcodes `60 : 30`, with the comment "Values are duplicated from INDIV_TAIL_MINS / TEAM_TAIL_MINS and must stay in sync". The duplication avoids a types.ts↔constants.ts import cycle. [R] METHODOLOGY:940-943 names both constants as the rule: "`INDIV_TAIL_MINS = 30` minutes for individual events /…
- **Engine change:** WIRE: move both constants into types.ts beside tailEstimateMins (re-exporting from constants.ts if wanted) and have the function read them. This leaves one source with the names the doc cites, and the values do not change.

### UX-dead-enum-members – 13 BottleneckCause/Phase members are never emitted

- **Status:** OPEN. **Verifier:** CONFIRMED.
- **Evidence:** [M] A per-member grep of `Obj.KEY` and bare/string-literal KEY over src/ (outside types.ts) finds 0 uses of these BottleneckCause members: REFEREE_CONTENTION :111, STRIP_AND_REFEREE_CONTENTION :112, SAME_TIME_CROSSOVER :116, SCHEDULED_8AM_SAME_DAY_CROSSOVER :117, SCHEDULED_8AM_CONSECUTIVE_DAYS :118, SCHEDULED_8AM_INDV_TEAM :119, INDIV_TEAM_ORDERING :120, AUTO_REF_FALLBACK :123, TWO_REF_FALLBACK…
- **Engine change:** DELETE-IN-021: drop the 12 BottleneckCause members and Phase.SCHEDULING from types.ts. Coordinate GENDER_EQUITY with UX-genderEquityAllowableDiff and the four time-of-day causes with the PENALTY_WEIGHTS retirement group.

### UX-de_round_of_16_requirement – Competition.de_round_of_16_requirement and DeStripRequirement are written by buildConfig, read by nothing

- **Status:** OPEN. **Verifier:** CONFIRMED.
- **Evidence:** [M] The field sweep found no engine reader of `de_round_of_16_requirement` (types.ts:242). Its only src/ occurrence is the write at buildConfig.ts:227 (`DeStripRequirement.HARD`). DeStripRequirement (types.ts:51-55), and IF_AVAILABLE in particular, has no prod reader. [R] The audit listed it as "not documented | none anywhere" (methodology-reconciliation.md:290), and METHODOLOGY never names it.…
- **Engine change:** DELETE-IN-021: remove the Competition field, DeStripRequirement const and type, the buildConfig.ts:6 import and :227 write, and the factory default. Strip the key from the fixture JSON and add a line to the fixture docblock.

### UX-ScheduleResult-constant-fields – ScheduleResult.conflict_score and accepted_warnings are always 0 / [] and never read

- **Status:** OPEN. **Verifier:** CONFIRMED.
- **Evidence:** [R] types.ts:376 `conflict_score: number`, :381 `accepted_warnings: AcceptedWarning[]` and the AcceptedWarning interface at :335-339. The only writers are concurrentScheduler.ts:465,470 and derive.ts:161,166, which write the constants 0 and []. There is no reader in src/components, store, layout or lib, and no doc mention. [R] The audit listed conflict_score as "written as 0, never read"…
- **Engine change:** DELETE-IN-021: remove both fields and the AcceptedWarning interface, the writers in concurrentScheduler.ts and derive.ts, and the derive.ts:16-18 docblock sentence.

### UX-searchStripCount – searchStripCount is drift-ledger-only by design

- **Status:** OBSOLETE. **Verifier:** CONFIRMED.
- **Evidence:** [R] stripSearch.ts:254-267 has no src/ caller because the store drives stripSearchRange and scanStripCounts itself (store.ts:11, :283-293). The docblock (:245-252) says it is "for callers that do not need to — the tests and the drift ledger". driftLedger.test.ts:28 and :359 (`stripRecommendation`) and stripSearch.test.ts:408-500 read it. METHODOLOGY §Strip Count Suggestion (:839-847) describes…

### UX-export-keyword-only – Exports used only inside their own file or by tests: KEEP (live code, test seams)

- **Status:** OBSOLETE. **Verifier:** CORRECTED.
- **Evidence:** [M] The production-only ts-morph scan flags these, but each is called inside its own file, so the code is live and only the `export` keyword serves tests. Engine: buildPenaltyMatrix (crossover.ts:29), capacityPenalty, dayCapacityFactor, capacityDemandedDays and crossWeaponSameDemographicPenalty (dayColoring.ts:99, 115, 133, 289), nextPowerOf2, deStripFootprint, perBoutDuration, deRounds,…
- **Verifier correction:** The KEEP verdict stands for the engine entries, and every one listed has sameFileRefs>=1 in a production-only ts-morph scan I re-ran over WT/tmp/021-audit/tsconfig.prod.json (85 candidates, components excluded from the candidates) [M]. Two details differ. (1) store selectDaySummaries (derived.ts:1185) is not keyword-only: it has sameFileRefs=0, so it is a selector with no production reader at…

**Missed by the auditor (G09-unused-exports):** 1) The auditor missed four members that die with validateFlightingGroup. Another group owns that function (flighting.ts:141-221), but it is the only emitter of BottleneckCause.FLIGHTING_GROUP_NOT_LARGEST (flighting.ts:194; the only other src hit is a docblock at :132), BottleneckCause.SAME_DAY_DEMOGRAPHIC_CONFLICT (:211, plus a docblock at :134), BottleneckRule.FLIGHTED_NOT_LARGEST (:195) and BottleneckRule.FLIGHTING_GROUP_CROSSOVER_PENALTY (:212) [M: grep -w over src]. If 021 deletes validateFlightingGroup, these four become dead and belong in the same commit as UX-dead-enum-members. MULTIPLE_FLIGHTED_SAME_DAY survives because analysis.ts:216-217 still emits it. validateSameDayCompletion orphans nothing: weightedPoolDuration and deBlocksFor have live callers, and widestHardWindow is…

## G10-verdicts-a

### L1 – Proximity 3+ days penalty wired in day coloring

- **Status:** ALREADY_FIXED. **Verifier:** CONFIRMED.
- **Evidence:** [R] dayColoring.ts:354-377 bands by gap: gap 1 gets REST_DAY_VIOLATION + PROXIMITY_1_DAY*proxW, gap 2 skipped (line 359 `if (dayGap !== 1 && dayGap < 3) continue`), gap>=3 adds `PENALTY_WEIGHTS.PROXIMITY_3_PLUS_DAYS * proxW` (line 376). constants.ts:696 PROXIMITY_3_PLUS_DAYS: 0.5. METHODOLOGY:264-266 "1 day apart: bonus (preferred) / 2 days apart: neutral (0.0) / 3+ days apart: penalty" and…
- **Doc change:** None in METHODOLOGY for the rule itself. backlog.md:1357 row (Proximity) is stale and should be marked delivered by 010.
- **Verifier correction:** I re-checked this in WT at 5edbdf7712. dayColoring.ts:358-376 is as quoted, constants.ts:696 has PROXIMITY_3_PLUS_DAYS 0.5, and METHODOLOGY:264-266 and :1002 have the quoted text. `git log -S 'PROXIMITY_3_PLUS_DAYS * proxW'` returns 39911b6940 '010 T018 ... (L1)'. dayColoring.test.ts:444 has the describe 'colorPenalty — PROXIMITY_3_PLUS_DAYS (L1)'. backlog.md:1356 (not :1357) still describes the…

### L1b – proximityPenalty and PROXIMITY_PENALTY_WEIGHTS are a dead duplicate

- **Status:** OPEN. **Verifier:** CONFIRMED.
- **Evidence:** [R] crossover.ts:268-297 `proximityPenalty` has no src/ caller (grep: only crossover.ts:268 and __tests__/engine/crossover.test.ts:5,459-521). Its table PROXIMITY_PENALTY_WEIGHTS (constants.ts:565-570: 0:0, 1:-0.4, 2:0, 3:0.5) is read only at crossover.ts:292, so it is dead too, and duplicates PENALTY_WEIGHTS.PROXIMITY_1_DAY/-0.4 and PROXIMITY_3_PLUS_DAYS/0.5. The live rule…
- **Doc change:** METHODOLOGY:269: replace `PROXIMITY_PENALTY_WEIGHTS` with `PENALTY_WEIGHTS` (PROXIMITY_1_DAY, PROXIMITY_3_PLUS_DAYS) and optionally cite dayColoring.ts. Owner approval required (METHODOLOGY text).
- **Engine change:** Delete crossover.ts:258-297 (proximityPenalty) and the PROXIMITY_PENALTY_WEIGHTS import at crossover.ts:12; delete constants.ts:561-570 (PROXIMITY_PENALTY_WEIGHTS). Pure dead-code removal.
- **Verifier correction:** Grep across src/__tests__/METHODOLOGY finds proximityPenalty only at its definition (crossover.ts:268) and in crossover.test.ts:5, 459-521. It finds PROXIMITY_PENALTY_WEIGHTS only at crossover.ts:12 and :292, constants.ts:565 and METHODOLOGY:269. individualTeamProximityPenalty (crossover.ts:326) is likewise called only from tests (crossover.test.ts:7, 530-600). There is one tension the plan…

### L2 – Capacity penalty curve: doc states the rejected 0.60-start curve

- **Status:** OPEN. **Verifier:** CONFIRMED.
- **Evidence:** [R] dayColoring.ts:93-97 comment: "Earlier-triggering curves (starting at 60% fill) over-steered events in mid-loaded days and caused regressions in large multi-day tournaments where several days naturally land in the 0.6-0.8 range." Code :99-107: 0 at fill<=0.85; linear 0.85→1.0 maps 0→3.0; above 1.0 `min(OVERFLOW_PENALTY, 3.0 + (fill-1.0)*10.0)`. Applied only when loadBalance (Phase 2),…
- **Doc change:** DOC-WRONG (reason: code comment recording a rejected experiment). METHODOLOGY:901-912: replace table with ≤0.85→0; 0.85–1.0 linear 0→3.0; >1.0: 3.0 + 10 per unit over 1.0, capped at 20.0 (reached at fill 2.7). Say it applies only in the load-balancing pass, against capacity scaled by the first/last day factor, beside a flat 0.5 per event already on the day, and record that a 0.60-start curve was…
- **Engine change:** Delete CAPACITY_PENALTY_CURVE's five unread members; optionally name the hardcoded 0.85, 1.0, 3.0 and 10.0 (e.g. CAPACITY_PENALTY_CURVE.{RAMP_START, FULL, FULL_PENALTY, OVERFLOW_SLOPE}) so Appendix A can point at them. Same values, no behavior change.
- **Owner question:** Approve the DOC-WRONG verdict: METHODOLOGY adopts the running 0.85-start curve and records the rejected 0.60 curve, with only a code comment (dayColoring.ts:93-97) as evidence of the experiment. Alternative: re-run the 0.60 curve against B1–B8 to re-confirm the rejection before amending.
- **Verifier correction:** I re-read dayColoring.ts:90-107 and :393-408 and quotes and code are exact. constants.ts:721-734 has the members as listed, and only OVERFLOW_PENALTY is read (dayColoring.ts:106). The phase 1 call at :664-667 passes loadBalance=false and the phase 2 call at :688-690 passes true, so 'only in the load-balancing pass' is correct. METHODOLOGY:907-912 and :1102 match. I re-measured capacityPenalty…

### L3 – Soft separation pairs applied

- **Status:** ALREADY_FIXED. **Verifier:** CONFIRMED.
- **Evidence:** [R] crossover.ts:109-113 softSeparationPenalty reads SOFT_SEPARATION_PAIRS (constants.ts:501-504: DIV1↔DIV2 3.0, DIV1↔DIV3 3.0) and crossoverPenalty applies it at :236-237 after Group 1. [M] crossoverPenalty DIV1-DIV2 = 3, DIV1-DIV3 = 3 at NAC and ROC. Wired by 010 T020 (2799e0b49b, git log -S), not 024. 024 moved DIV1↔CADET to GROUP_1_MANDATORY (constants.ts:468; [M] NAC=Infinity, ROC=5).…
- **Doc change:** None for L3. The 'suppressed at level >= 2' clauses at METHODOLOGY:284, :285, :996 belong to the relaxation-levels item.
- **Verifier correction:** constants.ts:501-504 holds only DIV1↔DIV2 and DIV1↔DIV3 at 3.0. crossover.ts:236-237 applies them after Group 1 (:232-234). `git log -S softSeparationPenalty` returns 2799e0b49b '010 T020 ... (L3)'. The auditor is right that 010, not 024, wired this pair, which corrects the prompt's hypothesis. No code in crossover.ts, dayColoring.ts or constraintGraph.ts implements 'suppressed at level >= 2'…

### L4 – Youth/vet bout delta retired, perBoutDuration live

- **Status:** ALREADY_FIXED. **Verifier:** CONFIRMED.
- **Evidence:** [R] de.ts:63 perBoutDuration (team match time, else 10-touch or 15-touch table) is called at de.ts:178 in DE duration. YOUTH_VET_BOUT_DELTA no longer exists in src (grep empty); removed by 024 group A 93ec5dc558 / dc0ee00c48 (git log -S). METHODOLOGY has no '−5 min' text (grep empty); METHODOLOGY:457 and Appendix A :1029 describe the 10-touch bout (15 foil, 15 épée, 10 sabre) from S8 p.38/p.41.…
- **Doc change:** backlog.md:1360 row could be struck; nothing in METHODOLOGY.
- **Verifier correction:** de.ts:63 defines perBoutDuration and de.ts:178 calls it. Grep finds no YOUTH_VET/BOUT_DELTA in src or METHODOLOGY. `git log -S YOUTH_VET_BOUT_DELTA -- src` has 93ec5dc558 and dc0ee00c48 (024 group A) as the latest commits. METHODOLOGY:457 and :1029 carry the 10-touch text from S8 p.38/p.41. backlog.md:1360 (the bout-delta row) is already annotated as gone by the 024 note at :1364-1370.

### L9 – Y8→Y10 penalty removed

- **Status:** ALREADY_FIXED. **Verifier:** CONFIRMED.
- **Evidence:** [M] probe crossoverPenalty(Y8 ind, Y10 ind) = 0 at NAC, SYC, SJCC, ROC, RYC, RJCC; Y8↔Y12 = 0 at all six (old two-hop gone). [R] constants.ts:410-420 `[Category.Y8]: {}` with a comment recording the removal (010 L9); GROUP_1_MANDATORY omits the pair (:461-462). Commit 2bacf2aa8e '010 T019: remove the Y8→Y10 penalty' (git log -S); driftLedger.test.ts:70-73 records B6 44→45 from it.…
- **Verifier correction:** I re-measured with my own probe (tmp/021-audit/G10v-xcheck.log): crossoverPenalty Y8–Y10 = 0 and Y8–Y12 = 0 at NAC, SYC, SJCC, ROC, RYC and RJCC [M]. constants.ts:410-420 has `[Category.Y8]: {}` with the removal comment. Commit 2bacf2aa8e is '010 T019: remove the Y8→Y10 penalty ... (L9)'. driftLedger.test.ts:70-72 records B6 44→45.

### L9b – Y8 'should' share a day with Y10 has no engine term

- **Status:** NEEDS_OWNER_CALL. **Verifier:** CONFIRMED.
- **Evidence:** [R] METHODOLOGY:164 "Y8 can and should share a day with Y10" and :1112 "The spec says Y8 CAN and SHOULD share a day with Y10". No term rewards it: CROSSOVER_GRAPH Y8 has no edges (constants.ts:420), PROXIMITY_GRAPH has no Y8 row (constants.ts:551-559), so [M] getProximityWeight(Y8,Y10)=0, and with no constraint-graph edge (constraintGraph.ts:47-48) dayColoring never scores the pair at all.…
- **Doc change:** Depends on the call: either add a same-day bonus row to Appendix A Penalty Weights (and to §Other Soft Preferences), or reword :164/:1112 to 'may share a day' and :167 to drop 'preferred'. Owner approval required either way.
- **Engine change:** If a bonus is chosen: a negative same-day term for Y8↔Y10 (same weapon+gender) in dayColoring colorPenalty, test-first. Constraint graph must carry the pair (it drops weight 0 edges), so the term needs its own lookup.
- **Owner question:** METHODOLOGY says Y8 SHOULD share a day with Y10 (and that Y10+Div 3 affinity is 'preferred') but gives no magnitude. Choose: (a) add a same-day bonus and name its value (e.g. −0.4, matching the other bonuses), or (b) amend the doc to 'can' / drop 'preferred' so the engine's neutral 0 is the spec.
- **Verifier correction:** METHODOLOGY:164, :167 and :1112 are quoted exactly. [M] getProximityWeight(Y8,Y10)=0 and crossoverPenalty Y10–DIV3 = 0 at all six types, so no term rewards either pairing. No backlog entry owns a same-day bonus (grep 'same-day bonus|affinity' in backlog.md is empty). The original audit row (methodology-reconciliation.md:464) offered 'remove the edge or make it a bonus', and 010 took only the…

### L10 – Veteran → Div 1 crossover: doc 0.8 vs engine 0.1

- **Status:** OPEN. **Verifier:** CORRECTED.
- **Evidence:** [R] METHODOLOGY:243 "Veteran → Div 1: 0.8 (high overlap at NACs)". constants.ts:437-446: "divisions are rating-based (open to any age) but in practice only ~5–10% of vet fencers also enter Div events. Keep a small penalty…" with VETERAN→DIV1/DIV2/DIV3/DIV1A all 0.1. [M] crossoverPenalty(VET40 ind, DIV1 ind), (VET_COMBINED ind, DIV1 ind), (VET team, DIV1 team) = 0.1 at all six types. The code…
- **Doc change:** DOC-WRONG (USA Fencing evidence: the B8 real schedule and Ops Manual p.20 Group 2's choice of Div 1A). METHODOLOGY:243 → 'Veteran → Div 1, Div 2, Div 3, Div 1A: 0.1 (few Veterans enter Division events; Veteran individual ↔ Div 1A individual takes the Group 2 soft separation instead)'. Owner approval required.
- **Engine change:** None if the doc is amended. Optionally cite the B8 schedule in the constants.ts:437-440 comment so the 0.1 has a source.
- **Owner question:** Approve amending METHODOLOGY:243 to Veteran → Division 0.1 (engine value), on the strength of USA Fencing's own April 2026 schedule putting Div 1 and Veteran women's sabre on one day. Alternative: conform the engine to 0.8, which [M] keeps all counts but moves 7 events' days across B1 and B8.
- **Verifier correction:** The quotes and numbers hold: METHODOLOGY:243, constants.ts:437-446, and [M] 0.1 at all types for VET40 ind–DIV1 ind and VET team–DIV1 team. I re-diffed G10-base.log against G10-vet08.log and confirmed the auditor's result exactly: B1 moves 2 events (the VET-M-SABRE IND-VCMB and TEAM swap), B8 moves 5, and no count changes. The status should be NEEDS_OWNER_CALL, not OPEN with a firm DOC-WRONG,…

### XE – §Demographic Crossover examples name unreachable values

- **Status:** OPEN. **Verifier:** CORRECTED.
- **Evidence:** [R] METHODOLOGY:239-243 examples: "Y12 → Y14: 0.8", "Cadet → Junior: 0.8 (typical overlap at NACs)", "Junior → Div 1A: 0.8", "Veteran → Div 1: 0.8". [M] crossoverPenalty (men's foil individual): Y12-Y14 NAC/SYC/SJCC=Infinity, ROC/RYC/RJCC=5; CADET-JUNIOR same (Inf / 5); JUNIOR-DIV1A 0.8 at all six (reachable, the only correct example); VET-DIV1 0.1 at all six. Full matrix [M]: every Group 1 pair…
- **Doc change:** METHODOLOGY:239-243: replace the examples with reachable ones, e.g. 'Cadet → Div 2: 0.8', 'Junior → Div 1A: 0.8', 'Y14 → Div 1A: 0.6', 'Veteran → Div 1: 0.1'; add one line: 'Group 1 pairs (e.g. Y12–Y14, Cadet–Junior) are not scored by the graph – hard at NAC, SYC and SJCC, the Regional Group 1 pair penalty at ROC, RYC and RJCC – and the soft separations in Other Soft Preferences override it.'…
- **Verifier correction:** I re-measured the numbers [M]: Y12–Y14 and Cadet–Junior are Inf at NAC/SYC/SJCC and 5 at ROC/RYC/RJCC. Junior–Div 1A is 0.8 everywhere, Vet–Div 1 0.1, Cadet–Div 2 0.8, Y14–Div 1A 0.6, Y10–Y14 0.3, Div 2–Div 3 3, Vet ind–Div 1A ind 3, and Div 1–Div 1A Inf. The diagnosis needs correcting: three of the four examples (Y12→Y14, Cadet→Junior, Junior→Div 1A, all 0.8) ARE the CROSSOVER_GRAPH weights…

**Missed by the auditor (G10-verdicts-a):** Three items in scope that the auditor did not report: (1) The live proximity rule (dayColoring.ts:354-377) scores only pairs that have a constraint-graph edge. [M] VET40 ind–VET50 ind crossover = 0, so the PROXIMITY_GRAPH VETERAN↔VETERAN row (constants.ts:557) never fires between age bands. This is harmless because the Co-Day rule puts the bands on one day, but deleting PROXIMITY_PENALTY_WEIGHTS should not be read as making every PROXIMITY_GRAPH row live. (2) backlog.md:1554-1557 ('Every unused export ... stays ... evidence that the engine once matched its spec') conflicts with L1b's deletion of proximityPenalty and individualTeamProximityPenalty and with L2's deletion of the CAPACITY_PENALTY_CURVE members. 021 should amend that note in the same change. (3) The B8 real schedule separates…

## G11-verdicts-b

### L5 – Strip count suggestion – which rule runs, and does the doc describe it

- **Status:** ALREADY_FIXED. **Verifier:** CONFIRMED.
- **Evidence:** [R] src/store/stripSuggestion.ts was deleted by 011 T012 (b19761b0b3). The Suggest button runs store.ts:269-305 computeSuggestedStrips → stripSearchRange + scanStripCounts (stripSearch.ts:150-243): floor = max(strip-hour floor, busiest-day competitors ÷14), then a +1 scan with scheduleAll until every event places and ends by the hard end, with pins. suggestStripCount (analysis.ts:51-66) is live,…
- **Doc change:** None in METHODOLOGY for the core rule. Stale tracking text: backlog.md:1361 (the pattern table's 'Strip count suggestion' row still names stripSuggestion.ts – annotate it as fixed by 011/012), and methodology-reconciliation.md:375 L5 row ('Delete the engine copy' – don't, it is the live ceiling).

### L5a – Strip-suggestion leftovers in METHODOLOGY: a removed function, an undefined ceiling, the floor's video hours

- **Status:** OPEN. **Verifier:** CONFIRMED.
- **Evidence:** [R] METHODOLOGY:374 '`recommendStripCount(competitions, config)` — advisory: suggests a strip total that keeps each competition within its pool cap'. That function was removed by 012 T011 (b5e0600efc), and grep finds no reference in src/. METHODOLOGY:844 calls `suggestStripCount` 'the search's ceiling' but never defines it (busiest-day pools ÷ max_pool_strip_pct, analysis.ts:65). It also never…
- **Doc change:** METHODOLOGY:374 – delete the recommendStripCount bullet, or replace it with a pointer to §Strip Count Suggestion. METHODOLOGY:839-849 – add one bullet for the ceiling (the busiest day's pools ÷ the pool-strip share, the same largest-first spread), the [floor, floor+ceiling] widening, and 'no count in range → no suggestion'. Settle the :847 floor wording to match the owner's answer.
- **Engine change:** Only if the owner says the floor includes video hours: stripSearch.ts:158–159 adds video_strip_hours (or divides it by the video strips separately). It moves no answer, only the number of candidates scanned (backlog:1281-1283) [R].
- **Owner question:** Does the strip-hour floor cover general strip-hours only (what the code does) or general plus video (one reading of METHODOLOGY:847)? Default: amend the doc to say 'general strip-hours', which moves no number.

### L11a – 'Smaller events get priority to start' (§Flighting) vs larger-first in compareNodes

- **Status:** NEEDS_OWNER_CALL. **Verifier:** CONFIRMED.
- **Evidence:** METHODOLOGY:392 says 'Smaller events get priority to start and run in parallel with the first flight', but METHODOLOGY:650 says '4. **Larger `desired_strip_count` first** — bigger phases are hardest to fit'. The spec contradicts itself. The code is concurrentScheduler.ts:1539 `return b.desired_strip_count - a.desired_strip_count` [R]. The audit (reconciliation.md:466) cited a 'measured reason'…
- **Doc change:** Option A (no drift): delete METHODOLOGY:392, or reword it to 'smaller events run in parallel with the first flight when strips allow'. Option B: keep :392 and change :650 to name a flighted-day exception.
- **Engine change:** Option A: none. Option B: a compareNodes key that orders non-flighted nodes ahead of FLIGHT_A on a day holding a flighted event, written test-first.
- **Owner question:** Which spec line wins: §Flighting's 'smaller events get priority to start' (:392) or §Within-Day Priority Order's larger-first (:650)? A = drop :392 (it matches the engine and moves nothing). B = implement smaller-first on flighted days. Recommend A, but note that larger-first has no recorded measurement – the audit's 'measured' claim is wrong.

### L11b – Flighted events' 'strong affinity for the day-start time slot' has no engine term

- **Status:** OPEN. **Verifier:** CORRECTED.
- **Evidence:** METHODOLOGY:393 '- Flighted events have a strong affinity for the day-start time slot'. '8:00 AM' (a2dc363e45:METHODOLOGY:348) was already changed to 'day-start' by 024 (6a4107b710), so '8 AM' is no longer stale. compareNodes (concurrentScheduler.ts:1527-1546) has no flighting key: its keys are ready_time, Y8/Y10, video, desired_strip_count, constraint_score, then id [R]. Every first phase seeds…
- **Doc change:** None if implemented. If the owner retires it as a time-of-day rule, delete METHODOLOGY:393 and record the retirement with the eight weights.
- **Engine change:** Add a compareNodes key after Y8/Y10 (before video) that puts FLIGHT_A nodes first, and update the pickHighestPriorityIndex doc comment (:1505-1514) and METHODOLOGY §Within-Day Priority Order list (:645-652) to match. Write a failing test first: a flighted event whose flight A asks for fewer strips than a co-day non-flighted event must start at day start.
- **Owner question:** Does the 2026-10-04 retirement of the eight time-of-day weights also cover this flight affinity? It is not a PENALTY_WEIGHT, so the spec-wins default is to implement it as a comparator key. Retiring it is the doc-only alternative.
- **Verifier correction:** Status OPEN stands. The doc_change field contradicts the engine_change field. Implementing the key means adding a flight-A key to METHODOLOGY §Within-Day Priority Order (:645-652) and to the pickHighestPriorityIndex comment (concurrentScheduler.ts:1504-1514). That is a METHODOLOGY text change, so it goes to the owner for approval, which makes doc_change 'add key N to :645-652 (owner-approved)',…

### L12 – Phase 3 'sorted by constraint score' vs DSatur saturation and the compareNodes chain

- **Status:** OPEN. **Verifier:** CORRECTED.
- **Evidence:** METHODOLOGY:716 'Competitions sorted by **constraint score** (highest first = scheduled first)… (see scheduler.ts)', and :722-724 adds 'Mandatory competitions before optional / Flighting pairs kept together'. :729 (Phase 4) says 'For each competition in priority order: … pick … lowest total penalty'. In the code, day assignment is DSatur: the highest saturation degree goes first, then the most…
- **Doc change:** Rewrite METHODOLOGY:714-724 to say: day assignment colors competitions by DSatur (most saturated first, then most hard-edge neighbours, then largest packing footprint), and within a day the order is §Within-Day Priority Order, where constraint score is tie-break 5. List the three score factors there, and say window tightness is inert while latest_end is unset. Drop the 'mandatory before…
- **Verifier correction:** Status OPEN and the substance hold. The line numbers are off. The 'Mandatory competitions before optional' and 'Flighting pairs kept together…' bullets are at METHODOLOGY:724-725, under 'Within this ordering:' at :723, not :722-724 [R]. :729 is correct. Phase 4's :733 'escalate through [Constraint Relaxation]' sits in the same rewrite span, and backlog.md:1506-1509 already lists it as 019…

### L13 – predecessorReadyTime skips predecessors not yet RUNNING, so Vet-sibling and ind→team edges never bind

- **Status:** NEEDS_OWNER_CALL. **Verifier:** CORRECTED.
- **Evidence:** The skip is still present at concurrentScheduler.ts:1566-1568 (`if (…state !== PhaseState.RUNNING) continue`). Predecessors are checked once, at pop (:978-997), and nothing re-queues the node. The probe [M] (G11b-probe.out.txt) on B8 found 60 same-day Vet sibling pairs, all 60 started before the older sibling's end + 30, and 0 CROSS_EVENT_DEPENDENCY_DELAY (B1–B7: no pairs). The ind→team edge is…
- **Doc change:** Depends on the ruling. Strict: no change to :118/:669. Staggered: rewrite METHODOLOGY:118 and :669 ('strict end-to-end serialization' → 'younger band's pools ready N min after the older band's pool start'). In either case fix :298-302 (019 item 8): '4-hour separation required' conflicts with the 120-minute rule, and :302 applies the rule to soft pairs while :668 and the code apply it to the hard…
- **Engine change:** Make the wait real: re-queue a node whose predecessor is unplaced (keeping the monotone ready_time invariant), or compute the floor up front like group1_window_floor. For the stagger, base the floor on the older sibling's pool start. Then either delete the ind→team edge or keep it for fallback days, and assert actual pool starts, not that the edges exist.
- **Owner question:** Vet sibling edge: the spec (METHODOLOGY:118, :669) says strict end-to-end serialization, which loses 8 of B8's 53 events. Backlog:952 records no USA Fencing source for it, while one source describes staggered starts. Choose (A) strict as written and accept the B8 loss, (B) a staggered start (amend :118/:669, B8 stays at 53), or (C) leave it to backlog:987 outside 021. Also: keep the ind→team…
- **Verifier correction:** Status NEEDS_OWNER_CALL applies only to the Vet half. Re-measured [M] (G11bv-vet.out.txt): B8 places 53, with 60 same-day Vet pairs, 60 broken and 0 cross-event-dependency-delay. G11bv-team.out.txt: D1 M Foil ind+team at days=1 both start at 0, against a required ≥500 (120/20) or ≥440 (60/20). For the ind→team edge, :668 states the rule and nothing contradicts it, so the spec-wins default (make…

**Missed by the auditor (G11-verdicts-b):** Each item below was checked against WT at 5edbdf7712. 1. METHODOLOGY:116-117 says a within-day sort key orders Vet siblings 'after the indiv-before-team rule and before strip-demand'. compareNodes (concurrentScheduler.ts:1527-1546) has neither key, so deleting daySequencing.ts takes away the spec's age order. Retargeting the reference is not enough: spec-wins means moving vetAgeOrderingKey into compareNodes, which probably moves B8 [I], or an owner-approved doc change. Settle it together with L13. 2. METHODOLOGY:672 'The loop resolves them lazily' is false. The Vet and ind→team edges never resolve, and the regional window is a seeded floor (:803-810). Rewrite it with L13. 3. METHODOLOGY:375 and :387 present flagFlightingCandidates (stripBudget.ts:143) as live, but its only callers are…

## G12-verdicts-c

### L15 – Strip minimum not halved for flighted events

- **Status:** OPEN. **Verifier:** CONFIRMED.
- **Evidence:** [R] METHODOLOGY:180-188: "Every event must be able to run all its pools at once (or in two flights for flighted events)" ... "For flighted events (see Flighting), the requirement is halved: `ceil(pools / 2)`. This is a **hard validation error**". [R] validation.ts:263-264: `if (n_pools > config.strips_total)` → policy(...'resource-precondition-strips') with no flighted branch. Severity matches…
- **Engine change:** validation.ts:263: compare ceil(n_pools/2) to strips_total when comp.flighted. The halving should apply only to standalone flighting (flighting_group_id === null), because concurrentScheduler.ts:515 splits only those; group-flighted events run one pool node. Add a validation test: flighted 200 fencers on 20 strips → no finding, unflighted → ERROR.

### V26 – Video Strip Preservation: three pool rules unimplemented

- **Status:** OPEN. **Verifier:** CONFIRMED.
- **Evidence:** [R] METHODOLOGY:563-567: pools may use video strips only in the "Start-of-day pool wave", on a "Single-event day", and "Multi-event mid-day pools: not allowed". :572 "videoRequired=false for pools: subject to the pool-specific rules above". [R] resources.ts:220-228 has only video-only vs non-video-first-then-video. There is no pool, time or event-count branch. MORNING_WAVE_WINDOW_MINS…
- **Doc change:** METHODOLOGY:565 says "the first pool wave" without a length. It should state the window as 120 min from dayStart, with an inclusive or exclusive boundary. Under `<` B2's video delay is 712 min against 232 under `<=` [M]. Also scope :563 to days that hold a staged video phase. :496 already says that at BEST_EFFORT types video strips "do not affect scheduling". Appendix A should get a…
- **Engine change:** Thread pool-phase context into findAvailableStripsInWindow (resources.ts:207): isPool, the day's event count and day for the wave check. Fill it at both concurrentScheduler.ts call sites (1283, 1297) from event.assigned_day and per-day event counts built after buildEventStates (:305). The pinned-pool path (~:879) and the canvas re-seater src/layout/strips.ts:191 need the same rule. Otherwise the…
- **Owner question:** Scope: the spec text applies the rule on every day, but that drops B4 (SYC) 24→20 and B6 (ROC) 51→49 [M], and the drift gate halts on that. Options: (A) preserve only on days holding a REQUIRED video phase, which leaves all B1-B8 counts unchanged [M] and matches :496; (B) apply it at every tournament type and accept lowered B4/B6 floors as a policy amendment. Also decide whether the wave…

### V27a – Video-strip budget penalty absent from day assignment

- **Status:** NEEDS_OWNER_CALL. **Verifier:** CORRECTED.
- **Evidence:** [R] METHODOLOGY:916-918: "video strip capacity is tracked separately ... Peak concurrent demand is modeled ... If peak demand exceeds 70% of the video strip total, a moderate penalty (5.0) is applied, and at 100% ... 15.0." :881 and :875 repeat the separate budget. Appendix A (:1070-1095) has no 0.70/5.0/15.0 row, and constants.ts has no video penalty constant [R]. [R] dayColoring.ts:640-651…
- **Doc change:** Depends on the ruling. If retired: delete METHODOLOGY:914-918 and the budget clauses at :875 and :881. If implemented as a strip-hours budget: reword :918 from "peak concurrent demand" to video strip-hours fill, and add the thresholds and penalties to Appendix A. The owner approves the text either way.
- **Engine change:** If a strip-hours budget: add a colorPenalty term in dayColoring.ts using estimateCompetitionStripHours().video_strip_hours per day against video_strips_total×DAY_LENGTH, plus constants. [M] it would never fire on B1-B8. If retired: none.
- **Owner question:** "Peak concurrent demand" is a time-of-day quantity, and day coloring runs before any time exists. That is the same Phase D seam as the eight retired weights, so the Wave 3 "documentation task" claim is plausible here but not automatic. Options: (A) retire it as a Phase D casualty (doc-only, zero drift); (B) implement a strip-hours budget (S, measured never to fire on B1-B8, so inert today); (C)…
- **Verifier correction:** The NEEDS_OWNER_CALL status stands, but four details need fixing. (1) The engine already has a time-free 'peak video demand' proxy that the auditor did not mention. analysis.ts:228-255 (Pass 4, METHODOLOGY:710 'warns if peak video-strip need exceeds video-capable strips') counts staged REQUIRED events per day and compares that count with video_strips_total, which sets events against strips. [M]…

### V27b – Staged DE video block holds its strips for the whole block

- **Status:** NEEDS_OWNER_CALL. **Verifier:** CONFIRMED.
- **Evidence:** [R] METHODOLOGY:922: "each round from the video-stage round through the semis ... runs in sequence on video strips and then releases them". This contradicts METHODOLOGY:559: "A DE phase claims a contiguous count of strips as one allocation, whether STAGED or SINGLE_STAGE". :51 ("8 lets two events run their video stages at once") and :918 also assume the hold or the release. [R] Since 024 there…
- **Doc change:** If the hold stands: rewrite METHODOLOGY:920-922 (and the release clause at :918) to say that a video block holds its min(4, bracket/2) strips through the semis. That agrees with :559, :51 and :1078. The owner approves the text.
- **Engine change:** If release is chosen: give the video block multiple intervals, or per-round nodes, so SF's idle strips free after QF. That reworks the phase model, ScheduleResult fields, refs, and layout/strips.ts seating.
- **Owner question:** METHODOLOGY contradicts itself (:559 one allocation vs :922 per-round release), so spec-wins cannot settle it. Options: (A) whole-block hold, a doc-only fix with zero drift. Since 024's 4-strip ask, release would free only 2 strips for one SF wave per event; (B) per-round release, size L, phase-model change that moves NAC timings. Wave 3's "documentation task" claim holds only under (A).

**Missed by the auditor (G12-verdicts-c):** L15 (confirmed): METHODOLOGY:180/186/188 quotes match. validation.ts:263-264 has no flighted branch, policy() is ERROR under BINDING (validation.ts:24-33), and the callers are concurrentScheduler.ts:226 and derived.ts:341. 011 demoted feasibility to WARN (feasibilityErr→notice, validation.ts:365-366; commits bd41df2ef3/670c4da36e). L15 is reachable by users: DetailStrip.tsx:268 toggles `flighted`. The standalone-only limit on the fix is moot from the store, because buildConfig.ts:233 hard-codes flighting_group_id: null. Group flighting reaches the engine only from tests, and validation.ts:106-114 is the only group check. L15 sits in no wave (reconciliation.md:570-604), so it is right that it was never Wave 3. C3 was fixed by 6a4107b710 (024). V26 (confirmed): the auditor's log numbers…

## G13-rules-a

### R1 – indiv-team-same-day validation rule: engine deleted it, but METHODOLOGY still specifies the combined-fit clause

- **Status:** PARTIAL. **Verifier:** CORRECTED.
- **Evidence:** [R] The rule is gone. `git log -S indiv-team-same-day -- src` gives 5a3a1a6826 "010 T005: delete the vacuous indiv-team-same-day rule (R1)". The current validation.ts (476 lines) has no such rule, and validateDependencies (290-334) holds only team-requires-individual and same-population. METHODOLOGY:174 still says "If an individual and team event are on the same day, their combined worst-case…
- **Doc change:** METHODOLOGY.md:174: delete the bullet. Or reword it to say no individual/team pair of one population can share a day (:90, :97-102), so there is no combined-fit check. Needs owner approval.
- **Owner question:** Approve deleting METHODOLOGY.md:174, the ind/team combined Single-Day Fit clause? It is vacuous under :90 and :97-102, and the engine dropped it in 010 (5a3a1a6826).
- **Verifier correction:** PARTIAL and the git facts are right: 5a3a1a6826 deleted the rule, validation.ts has no such rule, and METHODOLOGY:174 is quoted correctly. The claim that :174 is vacuous under :90/:97-102 is wrong since 019. [M] Junior M Epee ind(60)+team(12), days=1, ROC: both on day 0 with WARN hard-separation-violated, and both pools start at 0. The 120-min gap (:668) is skipped because predecessorReadyTime…

### R2 – Per-event structural ERRORs now exclude only their subjects, but METHODOLOGY:699 still says any ERROR aborts

- **Status:** PARTIAL. **Verifier:** CONFIRMED.
- **Evidence:** [R] The gate is in concurrentScheduler.ts. :206-211 `PER_EVENT_ERROR_RULES = new Set(['fencer-count-bounds','cut-value-range','cut-value-min-promotions','video-r16-strip-shortfall'])`. :251-252 `scoped = errorFindings.length > 0 && errorFindings.every(ve => PER_EVENT_ERROR_RULES.has(ve.rule))`. :262 drops the subjects, and :269-275 returns an empty schedule when any non-listed ERROR is present…
- **Doc change:** METHODOLOGY.md:699: replace it with an ERROR from a per-event rule (fencer count bounds, cut value, video strip shortfall) excluding that event and emitting a WARN summary of how many were excluded, while any other ERROR aborts. Optionally add to :210 "…rejected in validation and excluded from the schedule". Needs owner approval.
- **Engine change:** Stale comments only. validation.ts:13 says a structural finding "leaves nothing to draw", though per-event structural rules now drop only their event. __tests__/engine/validation.test.ts:72-73 says "the scheduler aborts on any ERROR (concurrentScheduler.ts:195)".
- **Owner question:** Ratify per-event exclusion in METHODOLOGY §Phase 1 (:699), which 010 shipped and 018 relies on, or restore abort-on-any-ERROR? Reverting would empty boards again on one bad fencer count.
- **Verifier correction:** Every citation checks out: concurrentScheduler.ts:206-211, 251-252, 262, 269-275 and 278-289. Commits 01379cd03d, 05654fca6d and 93ec5dc558 match, and so do the [M] figures in G13-rules.log. The quote at METHODOLOGY:699 is verbatim. The stale comments at validation.ts:13 and validation.test.ts:72-73 are real. Nit: in cross_item_notes, video-r16-strip-shortfall and both cut-value rules are also…

### R3 – cut-on-team: notice (WARN) in the engine, coercion deleted from buildConfig as unreachable, and METHODOLOGY:203 still says rejected

- **Status:** PARTIAL. **Verifier:** CONFIRMED.
- **Evidence:** [R] validation.ts:169-171 emits `notice(… 'cut-on-team' …)`, which is WARN in both modes. 51d834341c (010 T016) made it a notice and added a buildConfig coercion loop. 3c2d298d5d (013 T047) deleted that loop as unreachable. Team cuts now arrive DISABLED because competitionDefaults.ts:22-24 returns DISABLED/100 for TEAM, and buildConfig.ts:189,205-206 uses it. The engine ignores a team cut anyway…
- **Doc change:** METHODOLOGY.md:203: replace "rejected in validation" with: a team event always advances every team, a cut on a team event is ignored with a WARN, and the UI offers none. Needs owner approval.
- **Engine change:** Optional: delete cut-on-team as unreachable from the store, since pools.ts:172 already ignores the field. Fix the stale comment at competitionDefaults.ts:10-11, which cites "validation.ts:157-159" (now 169-171) and says the rule "requires" DISABLED.
- **Owner question:** For a team event's cut: keep the WARN notice and amend :203 to say it is ignored with a warning, or delete the rule? The engine ignores the field (pools.ts:172) and the app never produces it.

### R4 – flighting-group-strips is still policy (BINDING ERROR) and empties the whole board, though the app can no longer form a flighting group

- **Status:** NEEDS_OWNER_CALL. **Verifier:** CORRECTED.
- **Evidence:** [R] validation.ts:117-126 pushes `policy(… 'flighting-group-strips' …)`, which is ERROR under BINDING. It is not in PER_EVENT_ERROR_RULES (concurrentScheduler.ts:206-211), so the gate at :269-275 returns an empty schedule. [M] On B1, two individual events with flighting_group_id 'g1' and 50 strips each (100 > 80) give 0/24 scheduled and 1 ERROR. [R] It cannot be reached from the app.…
- **Doc change:** Under option (a), add one line at :397 saying a group whose strips exceed strips_total draws a WARN and the events run unflighted. Under option (b), no doc change is needed unless :395-397 and :711 go as well.
- **Engine change:** Option (a), as the audit wrote R4: make it a notice/WARN and clear the group (flighting_group_id=null) before scheduling. Option (b): delete the rule, validateFlightingGroup and, under the no-backcompat rule, the flighting_group_id field (types.ts:244,346; derive.ts:124-126,173; concurrentScheduler.ts:433-435,515; daySequencing.ts goes in 021 anyway).
- **Owner question:** The flighting-group strip check cannot be reached since 013 retired group acceptance. Choose: (a) demote it to WARN and drop the group, as R4 recommends; (b) delete the rule, validateFlightingGroup and the flighting_group_id field; or (c) add it to the per-event exclusion list so only the group's events drop.
- **Verifier correction:** Status NEEDS_OWNER_CALL holds, and the citations check out. Engine option (a) is wrong as written. Clearing flighting_group_id while flighted stays true makes the event split into Flight A/B (derive.ts:173, concurrentScheduler.ts:515), so it becomes flighted, the opposite of audit R4's 'keeping both events unflighted' (methodology-reconciliation.md:349). Option (a) must also set flighted=false.…

### SEV-resource-precondition-strips – The strip-minimum check ignores the flighted halving that METHODOLOGY:186 specifies

- **Status:** OPEN. **Verifier:** CORRECTED.
- **Evidence:** METHODOLOGY:183 "strips_total >= max_pools_any_event", and :186 "For flighted events (see Flighting), the requirement is halved: `ceil(pools / 2)`". :188 says "This is a hard validation error". [R] validation.ts:258-265 tests `n_pools > config.strips_total` with no `comp.flighted` branch. Severity agrees: policy, BINDING ERROR, not per-event, so it empties the board, consistent with :699. [M] A…
- **Engine change:** validation.ts:259-264: when comp.flighted is true, compare ceil(n_pools/2) with strips_total. Write a failing test first.
- **Verifier correction:** OPEN and the engine change are right. [M] I re-ran it: 300 fencers give 43 pools, and a flighted event on 30 strips draws resource-precondition-strips/ERROR. The auditor missed that ledger row L15 already owns this: 'ENGINE-WRONG on the halving, doc unclear on severity' (methodology-reconciliation.md:470). C3 (:49) is the related doc fix that is already applied. The halving should apply only to…

### SEV-cut-value-min-promotions – cut-value-min-promotions reads PERCENTAGE inverted and rejects where the spec floors at 2

- **Status:** OPEN. **Verifier:** CONFIRMED.
- **Evidence:** METHODOLOGY:411 "% cut: round(fencerCount × (1 - cutPercentage / 100))" and :414 "Minimum 2 fencers always advance". [R] validation.ts:192-193 computes `Math.round((comp.fencer_count * comp.cut_value) / 100)`, inverted, and :188-189 admits "a known mismatch". pools.ts:176 matches the spec. [M] Cadet 20% with 7 fencers gives cut-value-min-promotions/ERROR ("only 1 promoted") while…
- **Doc change:** Only if the owner keeps the rejection: add after :414 that an explicit cut leaving fewer than 2 promoted is rejected per event.
- **Engine change:** validation.ts:193: change it to `Math.round(comp.fencer_count * (1 - comp.cut_value / 100))`, as backlog :1191-1195 says. Do not call computeDeFencerCount, which floors. Update the :188-189 comment.
- **Owner question:** With the arithmetic fixed, should a cut that leaves fewer than 2 promoted still exclude the event (keep the rule and add a doc line), or follow :414's floor of 2 with no finding?

### SEV-days-available-range – Doc gives the duration as 2–4 days while the engine accepts 1–14 with a WARN outside 2–4

- **Status:** OPEN. **Verifier:** CONFIRMED.
- **Evidence:** METHODOLOGY:54 "Tournament duration: 2–4 days (longer events, e.g. Summer Nationals, to be supported in a future version)". [R] validation.ts:457-463 makes 1–14 the structural bound (days-available-bounds, ERROR) and emits a days-available-range notice (WARN) for 1 or 5–14 (validation.ts:431-436). TournamentPanel.tsx:78 shows that notice. The doc names no validation rule for days. Its 2–4…
- **Doc change:** METHODOLOGY.md:54: state that 2–4 days is the recommended range, that 1 and 5–14 are accepted with a warning, and that values outside 1–14 are rejected. Needs owner approval.
- **Owner question:** Is the engine's 1–14 range, with a warning outside 2–4, the spec, so that :54 is amended? Or should the engine reject days outside 2–4?

### SEV-same-day-completion – Single-Day Fit (:173) is a hard constraint the doc says is validated, but its validator is not wired

- **Status:** OPEN. **Verifier:** CONFIRMED.
- **Evidence:** METHODOLOGY:173 (§Hard Constraints › Single-Day Fit) says worst-case duration "must fit on one day". :698 says "All competitions and configuration validated against hard rules". [R] validation.ts:59-80 `validateSameDayCompletion` (rule 'same-day-completion') has no caller in src (grep: only its definition). Only __tests__/engine/validation.test.ts:1036-1087 calls it, so validateConfig never…
- **Doc change:** If deleted: reword :173 so the day limit is enforced at placement (SAME_DAY_VIOLATION), not in Phase 1 validation. Needs owner approval.
- **Engine change:** Delete validateSameDayCompletion and its tests, or wire it in as a notice measured to the last phase's midnight limit.
- **Owner question:** Delete validateSameDayCompletion and make placement the only enforcement of Single-Day Fit (amending :173), or wire it into validateConfig as a pre-run WARN?

### SEV-same-population – The same-population count rule still aborts as a BINDING ERROR, where 019's ruling breaks pairs with a WARN, and the app cannot reach it

- **Status:** NEEDS_OWNER_CALL. **Verifier:** CONFIRMED.
- **Evidence:** [R] validation.ts:308-331 emits policy 'same-population' when more individual events share a category|gender|weapon(|vet_age_group) key than days_available. Under BINDING that is an ERROR, it is not per-event, and the gate empties the board (concurrentScheduler.ts:269-275). METHODOLOGY:86 "These rules cause scheduling to fail or produce errors" supports an ERROR. Owner decision (b) from 019 has…
- **Doc change:** Depends on the call. The :86 rewrite is already queued by backlog :1494-1496.
- **Engine change:** Option (a): delete it as unreachable. Option (b): make it a notice so DSatur's least-bad WARN answers it, matching 019. Option (c): keep it.
- **Owner question:** Since 019, too few days produce a WARN at day coloring. Should the pre-run same-population count, which the app cannot reach, keep aborting as an ERROR, become a WARN, or be deleted?
- **Verifier correction:** Verified. [M] I re-ran the catalogue count: 96 individual entries, 96 keys, no duplicates. Context for the owner: audit R6 (methodology-reconciliation.md:351, Wave 3) already recommends demoting this rule to a WARN backed by a clique check. Since 019 the least-bad fallback emits hard-separation-violated WARNs (concurrentScheduler.ts:329-341), so that path already produces the shortfall report.

**Missed by the auditor (G13-rules-a):** 1) regional-cut-override, which the table marks 'Agree': the engine never applies REGIONAL_CUT_OVERRIDES. Only buildConfig.ts:254 does, and validation.ts:276 just warns that the cut 'will be overridden'. A hand-built ROC config therefore keeps its Cadet cut, contrary to METHODOLOGY:424-425 (100% advance), and the notice text is false for that caller. The store path never reaches it. 2) strips-total-positive (validation.ts:100) tests only ===0. [M] strips_total=NaN draws no finding at all, and a negative value falls through to resource-precondition. Probably not reachable from the store [I]. 3) validateRefConfig (validation.ts:132-134) is an empty stub that validateConfig:469 calls. It is dead code for the sweep. 4) L13 (methodology-reconciliation.md:468) calls the ind→team gap skip…

## G14-rules-b

### R5 – feasibility-strip-hours / feasibility-video-strip-hours demoted to WARN

- **Status:** PARTIAL. **Verifier:** CONFIRMED.
- **Evidence:** Engine done by 011 (78dc5aaff2 "011 T004: demote both feasibility findings to WARN"). validation.ts:357-367 feasibilityErr delegates to notice() (WARN in every mode, :18-21); validation.ts:472-473 comment "Feasibility is notice-kind at its source". [M] probe G14-rules.log: B1 at 1 day/80 strips -> feasibility-strip-hours WARN, run continues, 12/24 placed; B6 at 1 day -> WARN, 22/54 placed. B1 at…
- **Doc change:** Add one bullet (owner approval needed) under §Warning-Level Rules (:214-225) or §Resource Preconditions (:176-192): a whole-tournament strip-hour estimate (general and video) over days x strips x 10 h that draws a WARN when demand exceeds capacity by more than 15%, names extra days or strips, and never stops scheduling. The audit's R5 row (methodology-reconciliation.md:350) can be marked…
- **Owner question:** Should METHODOLOGY describe the feasibility WARN at all, or leave it as an unspecced engine heuristic? If described, decide where it goes (Warning-Level Rules vs Resource Preconditions) and whether the 1.15 slack gets stated as an unsourced constant in Appendix A.
- **Verifier correction:** Re-checked at WT 5edbdf7712. validation.ts:19-21 notice() returns WARN. :365-367 feasibilityErr delegates to it. :472-473 is the 'Feasibility is notice-kind at its source' comment. FEASIBILITY_SLACK = 1.15 at :348. Commit 78dc5aaff2 is '011 T004: demote both feasibility findings to WARN'. git log -S feasib on METHODOLOGY.md returns nothing, so the spec has never described this check. A grep of…

### R6a – Clique/chromatic number vs days_available check: 019 replaced it with a static template table and a UI hint

- **Status:** PARTIAL. **Verifier:** CORRECTED.
- **Evidence:** No runtime clique or chromatic check exists in src/ [R]. 019 owner ruling R3 (specs/019-default-days-per-template/handoff.md:258): "no new warning, but a built-in hint under the Days pills". TEMPLATE_MIN_DAYS is a hand-written table (catalogue.ts:305-316, read by templateMinDays :323-327), pinned by an exact chromatic test (__tests__/engine/templateMinDays.test.ts with…
- **Owner question:** R3 settled templates. For a hand-built or hand-edited board, no check says "these events need N days". Options: (a) accept the per-pair UNAVOIDABLE_CROSSOVER_CONFLICT WARNs as the report and close R6, which matches R3; (b) promote __tests__/helpers/chromatic.ts into the engine as a bounded runtime check that emits one WARN with the witness clique and days needed, which reverses R3's "no new…
- **Verifier correction:** The facts hold. catalogue.ts:305-316 and :323-327, templateHint.ts selectTemplateDaysHint, and the 019 handoff :258 ruling 'R3 no new warning, but a built-in hint'. The status framing needs correcting: R3 is an owner ruling (019 plan.md:26 says 'No new warning, but templates carry built-in hints'). 019 plan decision 12 (handoff.md:300) also leaves the hint out of METHODOLOGY on purpose because…

### R6b – The 'same-population' count > days_available validation rule is unreachable dead code

- **Status:** OPEN. **Verifier:** CORRECTED.
- **Evidence:** validation.ts:308-331 groups INDIVIDUAL events by category|gender|weapon(|vet_age_group) and emits a policy finding when a group's count > days_available. It is ERROR under BINDING (concurrentScheduler.ts:226) and global (not in PER_EVENT_ERROR_RULES :206-211), so it would empty the board. [M] The catalogue has 96 individual keys with at most 1 event per key, so the rule fires only when…
- **Engine change:** Delete the same-population group-count block in validateDependencies (validation.ts:308-331). The pairwise rule stays in crossoverPenalty, with breaks reported as UNAVOIDABLE_CROSSOVER_CONFLICT.
- **Verifier correction:** Status OPEN is right. The code is at validation.ts:308-331, and my probe confirms the catalogue has 96 individual keys with at most 1 per key [M], so the rule fires only when days<1, which already trips days-available-bounds (:457-458). tests_affected is incomplete, though. invalidState.test.tsx:196 asserts getAllByRole('listitem').toHaveLength(4), and that count includes same_population…

### R7a – Least-bad fallback reports every broken hard pair as WARN UNAVOIDABLE_CROSSOVER_CONFLICT

- **Status:** ALREADY_FIXED. **Verifier:** CONFIRMED.
- **Evidence:** 010 added the violation list and 019 deleted the relaxation path. dayColoring.ts:572-591: in the no-valid-color branch every Infinity edge whose neighbour holds the chosen color is pushed to violations. concurrentScheduler.ts:328-342 emits one WARN per pair (cause UNAVOIDABLE_CROSSOVER_CONFLICT, rule HARD_SEPARATION_VIOLATED). Every hard kind is Infinity in crossoverPenalty…
- **Verifier correction:** Verified dayColoring.ts:572-591 (the least-bad branch pushes every Infinity edge whose target holds the chosen color) and concurrentScheduler.ts:328-342 (one WARN per pair, UNAVOIDABLE_CROSSOVER_CONFLICT / HARD_SEPARATION_VIOLATED). crossover.ts:224-233 returns Infinity for same-pop, VET_COMBINED, cross-level, DIV1/DIV1A and national Group 1. Seeded ids are skipped (:498-503). derived.ts:298-325…

### R7b – A split Vet co-day is never reported by the engine or the board check

- **Status:** OPEN. **Verifier:** CONFIRMED.
- **Evidence:** Left for 021 item 9 (backlog.md:1516-1517). The co-day rule is hard (METHODOLOGY:108). When the required color is blocked, validColors=[] (dayColoring.ts:554-556) and the least-bad loop (:572-581) may pick any day. Its violation list holds only Infinity edges (:586-591), and co-day membership is not an edge. checkPlacementRules (placementRules.ts:51-91) checks crossoverPenalty and the regional…
- **Engine change:** Add a co-day-split finding with a new BottleneckRule (e.g. 'vet-co-day-split', WARN like other hard breaks): (1) in scheduleAllConcurrent after coloring, per (gender, weapon) whose age-banded Vet individual events span more than one day; (2) in checkPlacementRules over the board, so pins and hand moves are covered. Test-first in placementRules.test.ts and concurrentScheduler.test.ts (pinned…
- **Owner question:** Severity and wording of the split finding: WARN like the other hard-pair breaks (the default), and is it non-dismissable like them?
- **Verifier correction:** Verified dayColoring.ts:550-556: requiredColor is blocked, so validColors=[]. The least-bad loop (:572-581) can then pick a finite-penalty day, which records no violation because co-day is not an edge. placementRules.ts:27-91 checks only crossoverPenalty and the regional window, and src/ has no other co-day check (grep). Stronger evidence than G03: G03v-coday.log pins v40+vteam on day 0. The…

### R7c – METHODOLOGY never describes the least-bad fallback or its WARN and still promises an unresolvable error

- **Status:** OPEN. **Verifier:** CORRECTED.
- **Evidence:** No METHODOLOGY hit for UNAVOIDABLE, least-bad or fallback [R grep]. Current text: :86 "These rules cause scheduling to fail or produce errors. They are never relaxed." :319 level 3 "Same population still produces a warning but is allowed as last resort". :321 "Each relaxation emits a warning". :322 "If no valid day exists even at Level 3, scheduling fails with an unresolvable error". :733…
- **Doc change:** Owner-approved rewrite: §Hard Constraints :86 says hard rules are never relaxed by choice, and when days are too few the engine still assigns a day, breaks the fewest pairs it can (today the first tied day) and emits one WARN UNAVOIDABLE_CROSSOVER_CONFLICT per broken pair, plus a co-day split if R7b lands. Replace §Constraint Relaxation :308-322 with that fallback. Fix :733 and :694, and add the…
- **Owner question:** Approve the replacement text. Should the doc promise a better fallback (fewest broken pairs, cross-level before same-population), which backlog §Runtime failure is terminal (backlog.md:879-893) records as unbuilt, or describe today's tie-to-day-0 behaviour?
- **Verifier correction:** Quotes verified: METHODOLOGY:86, :319 (level-3 row), :321, :322, :694 'constraint-relaxing' and :733 'escalate through Constraint Relaxation', with no hit for UNAVOIDABLE, least-bad or fallback. Status is OPEN. The doc_change misses :90 'This is hard at every relaxation level.' (Left-for-021 item 2) and :310 'Progressive relaxation proceeds through these tiers', although :310 falls inside the…

### R8 – Day-end overrun: last phase past the hard end is placed with a WARN

- **Status:** ALREADY_FIXED. **Verifier:** CONFIRMED.
- **Evidence:** 018 fixed both sides: engine 31ce0c3017 "018 T2: the last phase may run past the hard end", METHODOLOGY 5272d66823 "018 A0: METHODOLOGY amendment (owner-approved)". Backlog.md:472-480 marks it fixed. Engine: concurrentScheduler.ts:1303-1324 ERROR only when the phase breaks its limit (non-last past the hard end, or last starting at or after the hard end or ending past midnight).…
- **Verifier correction:** Verified concurrentScheduler.ts:1303-1324: the fitsDay failure raises an ERROR only for broken limits, and brokenLimit distinguishes a last phase that started in time. lastPhaseOverrunWarnings (:1609-1634) emits WARN phase-overruns-day-end. Commits 31ce0c3017 and 5272d66823 exist with the cited titles, and backlog.md:472-480 says fixed by 018. Quotes found at METHODOLOGY:61, :80, :173, :219-225,…

### R9 – Vet co-day strict serialization: unsourced, described as enforced, never binds

- **Status:** NEEDS_OWNER_CALL. **Verifier:** CORRECTED.
- **Evidence:** Backlog "Vet co-day serialization is unsourced and never fit-checked" (backlog.md:952-985) is still "Recorded, not fixed". Appendix B (:1113) sources the co-day departure and says "oldest first" but gives no source for end-to-end serialization. METHODOLOGY:118 says "Strict end-to-end serialization is enforced by ... `younger_sibling.pools.ready_time = older_sibling.last_phase.end_time +…
- **Doc change:** Whatever the ruling: METHODOLOGY:118 must drop the daySequencing.ts citation (vetAgeOrderingKey and sequenceEventsForDay go with the file). If strict serialization is not chosen, :118 and :669 drop "strict end-to-end serialization", and Appendix B :1113 states the chosen order rule and its source (or that it is unsourced).
- **Engine change:** Depends on the ruling (backlog.md:1030-1036): make the chosen wait real (re-queue a node until its predecessor's end is known, or set an up-front floor like group1_window_floor), with a test that asserts the younger sibling's actual pool start. Or delete the sibling edge if the ruling is order-free.
- **Owner question:** Which Vet co-day order rule does the spec keep? (a) strict serialization as written: B8 loses 8 events, and a chain-fit check may be needed; (b) staggered start, younger pools ready 60 min after the older band's pools start, unsourced: B8 keeps 53, Suggest for NAC Vet/Div1/Junior goes 103->110 strips; (c) start order only, oldest first; (d) no order. Should 021 include this, or record the ruling…
- **Verifier correction:** NEEDS_OWNER_CALL holds for the serialization rule, and my re-probe reproduces the numbers [M]: B8 has 53 placed, 60 sibling pairs all on the same day, 0 serialized (younger start >= older end+30), the younger starting first in 21/60, and 0 dependency findings. predecessorReadyTime (:1560-1574) skips a predecessor that is not RUNNING. Correction: one part is not an owner call. METHODOLOGY:116-117…

**Missed by the auditor (G14-rules-b):** 1. METHODOLOGY:80 says 'Pool rounds cannot start after 4:00 PM', and no engine code enforces this. It sits next to R8's day-end rules, and backlog.md:511 '§The 4:00 PM pool cutoff is not enforced' (an owner call) owns it. 2. The individual-to-team edge (METHODOLOGY:668 and concurrentScheduler.ts:681-692) can never fire, because same-pop is hard, and it has the same predecessorReadyTime defect as the Vet edge. backlog.md:987-1030 owns it and says to delete it or comment it as unreachable. Act on it together with R9. 3. METHODOLOGY:699 'Any ERROR-severity violation aborts scheduling immediately' disagrees with the per-event exclusion at concurrentScheduler.ts:206-211 and :244-289, as the auditor's cross-note 1 says, and needs an owner. 4. On a partial board, coloring-time…

## G15-calibration

### CAL-P1 – Phase 1 reports days_available, not the fewest days (reconciliation §1.2.3), so day expansion and CAPACITY_TARGET_FILL do nothing

- **Status:** NEEDS_OWNER_CALL. **Verifier:** CORRECTED.
- **Evidence:** [R] The comments say Phase 1 finds the minimum days: dayColoring.ts:21-22 and 609. But colorPenalty (320-412) adds soft edges, rest-day/proximity, ordering, cross-weapon and saber pileup (387-389, 'Always active') in Phase 1 too. Only 393 is gated on loadBalance. Phase 1 runs at days_available (664-668). [M] chromaticN equals days_available in all 48 B1–B8 rows at 2–4 days. It is 5 at 5 days,…
- **Doc change:** Under option A, METHODOLOGY:739 ('always active, not gated by the load-balance flag') must say Phase 1 counts days on hard rules only, while Phase 2 keeps the pileup. This needs owner approval. Under option B, see CAL-DOC.
- **Engine change:** Option A: when !loadBalance, colorPenalty returns only the Infinity edge weights. Phase 1 becomes first-fit DSatur (about 5 lines). Option B: set effectiveDays = days_available. Delete Phase 1, chromaticN, capacityDemandedDays, CAPACITY_TARGET_FILL and MAX_EXPANDED_DAYS. Either way, fix the comments at 21-22, 73-88 and 609-610.
- **Owner question:** When demand is light, should the engine use fewer days than the organizer chose? A (compact, the documented intent and the meaning of 'bin-packing' at METHODOLOGY:867) changes app boards [M]. RJCC Weekend at NAC, 4 days, 80 strips uses 3 days. ROC Div1A/Div2/Vet at 4 days uses 1 day (NAC) or 2 (ROC). B (use every day, today's real behaviour, and the April scheduling-density plan's…
- **Verifier correction:** NEEDS_OWNER_CALL stands. Every code cite checks out today: dayColoring.ts:21-22, :388-389 (saber pileup, 'Always active'), :393 (the only loadBalance gate), :664-668, :680 and :609, and concurrentScheduler.ts:302 is the only src caller of assignDaysByColoring. [M] My own unmocked probe (tmp/021-audit/G15v-chi.log) gives exact hard chromatic numbers of 2/3/2/2/2/1/3/3, using…

### CAL – Calibration scenario with days_available above the chromatic number (backlog §Calibration debt)

- **Status:** NEEDS_OWNER_CALL. **Verifier:** CORRECTED.
- **Evidence:** [R] The backlog item (backlog.md:1719-1723) relies on D8's correction (0ab5bd2dc9 research.md, D8 Outcome), which says chromaticN equals expansionCap on all eight scenarios. [M] That premise is false: every B scenario already has days above its exact chromatic number (B1 4>2, B2 4>3, B3 4>2, B4 3>2, B5 3>2, B6 3>1, B7 4>3, B8 4>3). The blocker is Phase 1 (CAL-P1), not the scenario set. [M] With…
- **Doc change:** No METHODOLOGY change. Correct backlog.md:1719-1723: the missing piece is Phase 1, not a scenario. Under option B, close the item.
- **Engine change:** None beyond CAL-P1, option A.
- **Owner question:** It depends on CAL-P1. Under A, which fixture? B5 at 4 days separates 0.3 from 0.5 on day maps only. ROC Div1A/Vet at 15 strips also moves counts and ERRORs, which is what D8's no-drop rule needs. Under B, close the backlog item.
- **Verifier correction:** Status NEEDS_OWNER_CALL is right, and it depends on CAL-P1. One correction: D8's observation is true and its diagnosis is false. The variable chromaticN does equal expansionCap on B1–B8 (research.md at 0ab5bd2dc9, D8 Outcome, about lines 227-233), and I confirmed it [M]. What is false is D8's and backlog.md:1719-1723's premise that B1–B8 lack days_available above the chromatic number. All eight…

### CAL-DOC – METHODOLOGY §Capacity-Aware Day Assignment does not describe how the day count is chosen

- **Status:** OPEN. **Verifier:** CONFIRMED.
- **Evidence:** [R] METHODOLOGY.md:867: 'Day assignment uses a **capacity-aware bin-packing** model. Each tournament day is a bin with a finite strip-hour budget'. :871, the Phase D note: 'Re-tuning `CAPACITY_TARGET_FILL` upward against the re-baselined B1–B7 counts is open follow-up.' That note is stale. 003 T027 swept it and kept 0.3 (dayColoring.ts:77-86), and there are now eight scenarios. :729-733 (Phase…
- **Doc change:** Replace :871 with the day-count policy the owner picks under CAL-P1. Under A: Phase 1 counts days on hard rules, then expands to min(days_available, 4) at the target fill. Under B: every chosen day is used. Fix :739's line reference. The owner approves before commit.
- **Owner question:** Approve the replacement text for METHODOLOGY:871 and the :739 edit once CAL-P1 is decided.
- **Verifier correction:** Every quote is verbatim at :867, :871, :739 (which cites stale dayColoring.ts:301, now :387-389) and :54. One small fix: Phase 4 runs :727-733, with the header at :727, not 729. grep finds no METHODOLOGY mention of chromatic, MAX_EXPANDED_DAYS or LOAD_BALANCE_FULLNESS. CAPACITY_TARGET_FILL appears only at :871.

### CAL-CAP – MAX_EXPANDED_DAYS = 4 is not a cap when days_available is above 4

- **Status:** OPEN. **Verifier:** CORRECTED.
- **Evidence:** [R] dayColoring.ts:23-26 says expansion is capped at min(config.days_available, MAX_EXPANDED_DAYS). But :680 computes effectiveDays = max(chromaticN, min(capacityDays, expansionCap)), and chromaticN reaches days_available (CAL-P1). [M] At 5 days, B1, B2, B3, B4, B6 and B8 use 5 days, and B4 schedules 30 events where a 4-day cap gives 27. Only a loaded file can reach this: serialization.ts:177…
- **Engine change:** Option A of CAL-P1 enforces the cap as a side effect [M]. Under option B, decide whether more than 4 days is clamped or flagged.
- **Owner question:** Should a loaded file with days_available above 4 be rejected, which would mean narrowing serialization.ts:177 to METHODOLOGY:54's 2–4? Should it be clamped, or used as given?
- **Verifier correction:** OPEN is right, and CAL-P1 decides it. Code cites hold: dayColoring.ts:23-26, :71, :679-680, serialization.ts:177 (1–14) and TournamentPanel.tsx:121 ([2,3,4], at src/components/workbench/panels/). [M] At d=5, B1/B2/B3/B4/B6/B8 use 5 days and B5/B7 use 4. B4 schedules 30 (my probe). At d=6, B1/B2/B3/B4/B6/B7/B8 use 6, so the cap is exceeded further. The auditor missed an existing deliberate rule.…

**Missed by the auditor (G15-calibration):** The auditor missed six things: 1. The 'days-available-range' WARN notice (validation.ts:431-437, :460-462). Accepting 1–14 days with a warning is deliberate, which changes CAL-CAP's options. 2. METHODOLOGY:727-733's Phase 4 text ('Evaluate every available day; pick the one with the lowest total penalty' at :731). It is spec text that supports option B (use every day) and counts against the claim that compaction is the documented intent. 3. The use-all-days policy is at 971a950922:.claude/plans/2026-04-27-scheduling-density.md:18 and :188, not at 64a8e3b991. 4. METHODOLOGY:737 cites saberPileupPenalty at 'dayAssignment.ts:83-100'. The function is now at dayAssignment.ts:82-99, a stale cite next to the :739 one the auditor caught. 5. An exact hard-rules day count already exists in spec and…

## G16-process

### P1 – How 019 ran its METHODOLOGY amendment (the format 021 should reuse)

- **Status:** OPEN. **Verifier:** CONFIRMED.
- **Evidence:** [R] specs/019-default-days-per-template/amendment.md:1-19: title 'draft for the owner's approval'; header names rulings covered, base commit for line numbers (METHODOLOGY at 8de0d5a12b), and 'blocks are numbered in the order A0 applies them, bottom of the file first, so every line number holds'; a review record (Opus drafter + independent checker + plan-review amendment lens with adversarial…
- **Doc change:** 021 writes specs/021-*/amendment.md in this format: base-commit line numbers, blocks ordered bottom-up, Before/After per block, a review record, then the owner approves and A0 commits METHODOLOGY.md alone and verbatim before any engine task.
- **Owner question:** Approval mechanism is not recorded in the docs beyond the date (plan gate + handoff 'Owner rulings and approvals'). Caveat: 019's one-line follow-up (naming INDIV_TEAM_CROSS_LEVEL_BLOCKS) went in docs commit f2570e0d8a with backlog/roadmap edits, not alone – 021 should decide whether follow-ups also get their own commit.
- **Verifier correction:** Verified against WT. amendment.md:1 title 'draft for the owner's approval'. :5-6 'Task A0 commits the approved text verbatim, alone, before any code'. :8-10 base commit 8de0d5a12b, bottom-of-file-first order. :12-19 review record. Blocks 1-9 at :21-160+. 'Left for 021' at :208. plan.md:30 gate and :141-144 A0 'verbatim, in their numbered order ... commit them alone'. bf8931c78c touches…

### P2a – Live smoke vs removing the dead config fields (SAME_TIME_WINDOW_MINS, MAX_RESCHEDULE_ATTEMPTS, LATEST_START_MINS/OFFSET, THRESHOLD_MINS, EARLY_START_THRESHOLD)

- **Status:** OPEN. **Verifier:** CORRECTED.
- **Evidence:** [R] Skill at WT/.claude/skills/live-smoke/SKILL.md (none under ~/.claude): run scripts/smoke.mjs (2225 lines) in a Sonnet subagent, last line 'SMOKE PASS', fix locators in place, never rewrite. Driver sections (smoke.mjs:346-2171): shell, B1 boot footer '24 placed · 0 unplaced' and peak refs 210 (:395,:418), matrix canvas, schedule table, 020 re-run switch (:801,:868), Gears/Settings panel…
- **Doc change:** METHODOLOGY.md:1026-1027 (Appendix A rows 'THRESHOLD_MINS / EARLY_START_THRESHOLD' and 'SAME_TIME_WINDOW_MINS') and, for LATEST_START_MINS, :80 'Pool rounds cannot start after 4:00 PM' and :1022 'Pool-round cutoff' – owner-approved amendment needed before deletion.
- **Engine change:** Delete the six fields from TournamentConfig (types.ts:282-293) and constants (constants.ts:57-58,75,118,125-126); no engine reader changes.
- **Owner question:** LATEST_START_MINS is owned by backlog §'The 4:00 PM pool cutoff is not enforced' (~:511-530), which asks the owner to enforce, source, or delete the cutoff; enforcing it moves B4/B6. Deleting the constant requires that call first.
- **Verifier correction:** The core claim holds [R]: grep finds no reader of the six fields outside types.ts:282-293, constants.ts:57-58,75,118,125-126, buildConfig.ts, factories.ts, buildConfig.test.ts and serialization.test.ts:161. Engine spreads (stripSearch.ts:213, derived.ts:255) copy the config and do not read it. The METHODOLOGY quotes at :80, :1022 and :1026-1027 are exact. Three corrections. (1) smoke.mjs has 13…

### P2b – Calibration scenario placement – a new ledger scenario becomes a UI preset

- **Status:** OPEN. **Verifier:** CORRECTED.
- **Evidence:** [R] backlog.md:1719-1723: 'A drift scenario with days_available set above the chromatic number' for a future CAPACITY_TARGET_FILL re-tune. [R] The ledger iterates SCENARIO_IDS from src/data/tournaments.ts:16 (re-exported by __tests__/helpers/scenarios.ts:27), and the same list drives PresetPicker.tsx:67 'Tournaments' options and presets.ts:13. So adding B9 there adds a visible preset.…
- **Owner question:** Is the calibration scenario a user-visible preset (add to SCENARIO_IDS: the smoke's 'B1-B8' comments, boot footers, and Header test then cover 9) or a ledger-only fixture (a second list in __tests__ that driftLedger also iterates, keeping the UI untouched)?
- **Verifier correction:** The owner question is right, and src/data/tournaments.ts:10-14 even says 'adding a B9 here is a type error until the fixture exists, and the drift ledger picks it up automatically'. Three corrections. (1) 12 test files use it.each(SCENARIO_IDS), not 17. Seventeen test files reference SCENARIO_IDS, and the others iterate with for-of or a spread (driftLedger:368,467; bottleneckSubjects:78,81;…

### P3 – What removing a TournamentConfig field must also change, file by file (020/019 'For later features')

- **Status:** OPEN. **Verifier:** CONFIRMED.
- **Evidence:** [R] 020 handoff.md:391-410: anything the engine reads must be in configKey; a new store field read by buildTournamentConfig joins selectConfigKey deps (derived.ts:907-918) and FIELD_EDITS (__tests__/helpers/inputEdits.ts:39-61), pinned by the Proxy check drawnSchedule.test.ts:184-195; bootstrap tests clear VIEW_STATE_STORAGE_KEY (9 test files); per-event derivation changes scenarios.ts +…
- **Engine change:** Per field, in one commit: src/engine/types.ts (TournamentConfig), src/engine/constants.ts (export), src/store/buildConfig.ts (import + literal; the 'These seven' comment at :85-90 if THRESHOLD_MINS goes), __tests__/helpers/factories.ts makeConfig (else factoryParity fails on the key union and tsc on excess property), __tests__/store/buildConfig.test.ts (imports :10-14, asserts :266/:325-333,…
- **Verifier correction:** Verified. 020 handoff §For later features is at :391-410, and 019's is at :393. configKeyOf (keptRun.ts:92) encodes the whole config. configKeyDeps lists only StoreState fields. It sits at derived.ts:905-916, a minor offset from the cited :907-918. FIELD_EDITS is at inputEdits.ts:41-61, and the Proxy check at drawnSchedule.test.ts:184-195 compares against StoreState reads, so constant-fed fields…

### P4 – Drift-ledger procedure and how 018/019/024 recorded drift reviews

- **Status:** OPEN. **Verifier:** CONFIRMED.
- **Evidence:** [R] driftLedger.test.ts:1-18 header: snapshot a digest of scheduleAll per B1-B8, review the diff, halt if any scenario schedules fewer than SCHEDULED_FLOORS; floors are asserted because vitest -u defeats a snapshot. :33-63: only two lowerings are allowed: input correction (4 conditions incl. factoryParity passing) and policy amendment (024 D3: one rule group's commit, review names the amendment…
- **Verifier correction:** Verified. The driftLedger.test.ts:1-17 header and the :32-67 docblock name the two admitted lowerings: input correction (four conditions) and policy amendment (024 D3, four conditions). The floors at :166 read 24/24/24/24/12/51/18/53. The digest types at :208-244 hold no config fields, and per the header the message strings are excluded. [M] shasum -a 256 of…

**Missed by the auditor (G16-process):** (1) P2b: making the calibration scenario a preset forces six Record<ScenarioId> entries, each measured: SCENARIOS (src/data/tournaments.ts:33), SCHEDULED_FLOORS (__tests__/engine/driftLedger.test.ts:69), and in __tests__/store/appPathParity.test.ts LEDGER_SCHEDULED_COUNTS:107, PINNED_APP_PATH_COUNTS:189, BOOT_FOOTERS:556 and BOOT_REF_PEAKS:591. A ledger-only fixture avoids all of these but needs its own floor. (2) P2a: THRESHOLD_MINS is also owned by backlog §'A what-if scenario mode' (~:1631, 'whether it should exist in TournamentConfig at all') and §Global settings (~:1584-1596, which keeps the seven fields on TournamentConfig on purpose). Deleting any of the seven means editing those entries and the 'These seven' comment at buildConfig.ts:85-90 together. (3) Backlog §Dead code…
