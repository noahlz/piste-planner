# METHODOLOGY.md ↔ engine reconciliation

*Produced 2026-09-05 against `main` at `a2dc363e45`, executing
[`methodology-reconciliation-prompt.md`](./methodology-reconciliation-prompt.md).
Analysis only – no `src/` file was edited and no `specs/` directory was created.*

**Baseline at the time of measurement**: `pnpm vitest run __tests__` → 67 files,
1799 tests, all passing. `pnpm exec tsc -b` → clean. Every defect below survives
that green suite.

## How to read the evidence markers

Every claim is tagged. The prompt asks for this because prior passes on this
codebase asserted inferences as measurements.

- **[M]** measured – a number produced by running the engine. The harness that
  produced them is at `tmp/reconcile-harness.ts.txt` (untracked – rename to
  `tmp/reconcile.test.ts` and run `pnpm vitest run tmp/reconcile.test.ts`). Each
  measurement below names its harness block (M1–M12).
- **[R]** read – stated by source at a cited `file:line`.
- **[I]** inferred – reasoned from [M] and [R], not directly observed.

### What the harness measures

Templates are built through the app's own path: `store.applyTemplate`'s
`TEMPLATE_FENCER_DEFAULTS` lookup (`src/store/store.ts:339-348`) followed by
`buildConfig.buildCompetitions`'s resolution of `AUTO` ref policy and DE mode
against `TYPE_DEFAULTS` (`src/store/buildConfig.ts:133-202`). Tournament type is
assigned by template name prefix. This is the configuration a user gets by
picking a template in the matrix, not a test fixture.

---

## Part 1 – The specification as a specification

### 1.1 Internal contradictions

The three already on the backlog are confirmed and not restated in detail:
DIV1↔CADET listed hard and soft, the Flighting section contradicting Runtime
Decomposition, and the day-end severity wording. Ten more:

| # | Contradiction | Where |
|---|---|---|
| C1 | **Appendix A marks as `[TBD]` what the prose fully specifies.** §Capacity Penalty Curve gives four bands with exact values. Appendix A §Capacity Model Constants ends with "Capacity penalty thresholds \| [TBD]". | METHODOLOGY:760-766 vs 947 |
| C2 | **Two provenances for one table.** Appendix A says the fencer defaults are "Sourced from integration test scenarios B1–B7 … averaged across scenarios … rounded to nearest 10". `constants.ts` says "Derived from P75 of empirical NAC/Summer Nationals and regional data … skewed towards larger events (METHODOLOGY Appendix A)" – and cites the appendix as its own source. An average and a P75 are different statistics. The numbers themselves agree on every row I spot-checked, so one of the two descriptions is wrong about how they were made. | METHODOLOGY:891 vs `constants.ts:199-203` |
| C3 | **The retired flighting trigger is still stated as current.** §Resource Preconditions still says "For flighted events (200+ fencers in eligible categories), the requirement is halved". Appendix A §Resource Constants explicitly retires that rule: "Flighting threshold \| n_pools > pool_strip_cap … replaces old 200+ fencer rule". Here the appendix is the current one and the prose is stale – the inverse of the usual direction. | METHODOLOGY:143 vs 923 |
| C4 | **Two different penalties for "team before individual".** Appendix A carries `Ind+team same-time or wrong order = 8.0` and `Team before individual = 1.0`. Nothing in the prose distinguishes the two cases beyond the word "same-time", and §Individual-Team Proximity refers to "Team before individual: penalty" without saying which. | METHODOLOGY:845, 852, 262 |
| C5 | **Level 2 relaxes what Appendix A calls a hard block.** §Constraint Relaxation level 2 says "overlapping populations may share a day". Appendix A says `Group 1 mandatory separation \| ∞ \| Hard block`, and §Hard Constraints says Group 1 is never relaxed. Overlapping populations *are* Group 1. | METHODOLOGY:280 vs 862, 78 |
| C6 | **Y8/Y10 scope drift.** §Other Soft Preferences: "Y8/Y10 Early Scheduling \| 0.3 \| Y8/Y10 not starting at 8:00 AM". Appendix A: "Y10 non-first-slot \| 0.3 \| Y10 event not starting at 8 AM". Y8 is in one and not the other. | METHODOLOGY:256 vs 856 |
| C7 | **A day-end overrun is a warning in one section and a hard constraint in another.** §Inputs: latest end time "violation produces a warning … not a scheduling failure". §Hard Constraints §Single-Day Fit: worst-case duration "must fit within the 14-hour day", listed under rules that "cause scheduling to fail". | METHODOLOGY:58 vs 128-131 |
| C8 | **The `FINALS_ONLY` video policy is preserved "for save-file compatibility".** The project's standing decision is that there is no backwards compatibility – the product is unreleased. Keeping an enum member for old save files contradicts that. | METHODOLOGY:812 |
| C9 | **Pointers name the wrong module in five places.** §Hard Constraints, §Soft Preferences, §Constraint Relaxation, §Scheduling Algorithm and Appendix A all cite `dayAssignment.ts`. That file holds only `constraintScore` and `saberPileupPenalty`. Every rule those sections describe lives in `dayColoring.ts`. | METHODOLOGY:78, 203, 274, 588, 837 |
| C10 | **The intro describes P4 in the present tense.** "users then refine it via drag-and-drop … The engine re-validates after each adjustment." Manual placement exists on the canvas but the described re-validate-on-edit loop does not. Already noted on the backlog, and repeated here because it is the first paragraph a reader meets. | METHODOLOGY:3 |

### 1.2 Infeasible and over-constrained criteria

This is the section the prompt calls the most valuable output, and it is where
the measurements land.

#### 1.2.1 Satisfiability of the hard constraints – the computation

**[M, harness M1]** For each of the ten `TEMPLATES`, I built the hard-constraint
conflict graph – `crossoverPenalty(...) === Infinity` plus the
`INDIV_TEAM_RELAXABLE_BLOCKS` edges – contracted the age-banded Veteran
individual siblings into one vertex (the Co-Day rule forces them onto one day,
so they behave as a single vertex that inherits the union of their edges), and
computed the exact clique number by Bron–Kerbosch and the exact chromatic number
by backtracking.

| Template | Events | ω (clique) | χ | χ at level 3 | Witness clique |
|---|---|---|---|---|---|
| NAC Youth | 24 | 2 | 2 | 2 | Y10-W-FOIL-IND, Y12-W-FOIL-IND |
| NAC Cadet/Junior | 24 | **4** | **4** | **4** | CDT-M-FOIL-IND, CDT-M-FOIL-TEAM, JR-M-FOIL-IND, JR-M-FOIL-TEAM |
| NAC Div1/Junior | 24 | **4** | **4** | 2 | D1-M-FOIL-IND, D1-M-FOIL-TEAM, JR-M-FOIL-IND, JR-M-FOIL-TEAM |
| NAC Vet/Div1/Junior | 66 | **4** | **4** | 3 | same D1/JR K₄ |
| ROC Div1A/Vet | 12 | 1 | 1 | 1 | – |
| ROC Div1A/Div2/Vet | 18 | 1 | 1 | 1 | – |
| ROC Mega | 42 | 2 | 2 | 2 | Y10-W-FOIL-IND, Y12-W-FOIL-IND |
| RYC Weekend | 18 | 2 | 2 | 2 | Y10-W-FOIL-IND, Y12-W-FOIL-IND |
| RJCC Weekend | 12 | 2 | 2 | 2 | CDT-M-FOIL-IND, JR-M-FOIL-IND |
| Junior Olympics | 18 | 3 | 3 | 3 | CDT-M-FOIL-IND, JR-M-FOIL-IND, JR-M-FOIL-TEAM |

**The direct answer to the prompt's question: no template is infeasible inside
the spec's own 2–4 day range at the top of that range.** Every ω is ≤
`MAX_EXPANDED_DAYS = 4` (`dayColoring.ts:68`). The spec's hard constraints are
satisfiable, and the empty boards have a different cause (1.2.2).

Three things the table does show:

1. **Three templates require the maximum of the spec's range.** NAC
   Cadet/Junior, NAC Div1/Junior and NAC Vet/Div1/Junior each carry a K₄ per
   (gender, weapon), so nothing under 4 days can satisfy them. At 2 days – the
   bottom of the spec's own stated range – four of ten templates are
   unsatisfiable. The store's default is **3 days** (`src/store/store.ts:193`),
   which is unsatisfiable for those three.
2. **The K₄ is structural, and level 3 only breaks two of the three.** For
   Cadet/Junior the four edges are Group 1 (CADET↔JUNIOR, `constants.ts:458`) and
   same-population (ind↔team of the same category, `crossover.ts:84-97`).
   `INDIV_TEAM_RELAXABLE_BLOCKS` covers only DIV1↔JUNIOR
   (`constants.ts:560-563`), so **the Cadet/Junior K₄ has no relaxation path at
   any level.** Div1/Junior drops to χ=2 at level 3 because both of its
   cross-category edges are relaxable.
3. **The Veteran Co-Day contraction costs nothing here.** ω is identical with and
   without it on every template – the vet cluster's own clique
   ({age-banded merged, VET_COMBINED, VET team}) is 3, below the D1/JR K₄.

#### 1.2.2 The engine does not report unsatisfiability – it absorbs it silently

**[M, harness M6]** Running `assignDaysByColoring` directly and counting pairs
that share a day despite `crossoverPenalty === Infinity`:

| Template | days | true χ | colors used | relaxations recorded | hard-constraint violations |
|---|---|---|---|---|---|
| NAC Cadet/Junior | 2 | 4 | 2 | 0 | **18** |
| NAC Cadet/Junior | **3** | 4 | 3 | **0** | **6** |
| NAC Cadet/Junior | 4 | 4 | 4 | 0 | 0 |
| NAC Div1/Junior | 2 | 4 | 2 | 12 | 12 |
| NAC Div1/Junior | 3 | 4 | 3 | 6 | 6 |
| NAC Vet/Div1/Junior | 2 | 4 | 2 | 12 | **42** |
| Junior Olympics | 2 | 3 | 2 | **0** | **6** |

**[R]** The mechanism is `dsaturLoop`'s no-valid-color fallback
(`dayColoring.ts:505-562`). When every color is blocked, it tries the
`INDIV_TEAM_RELAXABLE_BLOCKS` edges, and if that fails, or if the vertex has no
relaxable edges at all, it takes the "least-bad color" branch
(`dayColoring.ts:534-544, 546-556`). Every candidate's penalty is `Infinity`, so
`bestPenalty` never improves and `chosenColor` stays `0`. A relaxation is
recorded **only** when `relaxable.size > 0` (`dayColoring.ts:558-561`), so a
same-population or Group 1 violation is recorded as nothing at all.

**[I]** This is the single most serious finding in the audit. On the store's
default 3-day setting, NAC Cadet/Junior places six pairs of events that the
specification says can never share a day – Cadet Men's Foil individual with
Cadet Men's Foil team, and so on – and reports no error, no warning, and
`constraint_relaxation_level = 0`. The spec's §Constraint Relaxation ends "If no
valid day exists even at Level 3, scheduling fails with an unresolvable error"
(METHODOLOGY:284). No such failure exists in code.

#### 1.2.3 Phase 1 does not compute what its own comment says it computes

**[M, harness M6]** `colorsUsed` equals `days_available` in **every** template ×
day-count combination measured (30 of 30), including ROC Div1A/Vet where the
true chromatic number is 1.

**[R]** `dayColoring.ts:21-23` states Phase 1's purpose: "run DSatur without
load-balancing penalties to discover the minimum number of days (the effective
chromatic number)". But `colorPenalty` applies `saberPileupPenalty`
unconditionally (`dayColoring.ts:307-309` – deliberately, and documented as
deliberate), plus rest-day, proximity, individual/team ordering and VET_COMBINED
ordering, none of which is gated on `loadBalance`. Phase 1 therefore minimises
soft penalties across all `days_available` colors, and spreading across more days
almost always scores better.

**[I]** This is the root cause under the recorded `CAPACITY_TARGET_FILL`
inertness. The comment at `dayColoring.ts:76-84` correctly reports the symptom –
"on all eight scenarios `chromaticN` already equals `expansionCap`" – and reads
it as a property of the scenarios. It is a property of the algorithm:
`chromaticN` equals `days_available` by construction, so `effectiveDays =
max(chromaticN, min(capacityDays, expansionCap))` collapses to `days_available`
for any `capacityDays`. **[M, harness M3]** confirms one case where
`capacityDays` (3) is genuinely below the cap (4) – ROC Div1A/Vet at 4 days – and
`effectiveDays` is still 4, because `chromaticN` is 4. The constant cannot be
measured by any scenario while Phase 1 behaves this way. The comment's closing
condition ("0.3 stands until a scenario exists where the cap is slack") can never
be met.

#### 1.2.4 Worst-case rules that reason about a hypothetical the engine forbids

There are exactly two rules in `validateConfig` that reason from a hypothetical
rather than an assignment, and they are the mirror image of each other.

**`indiv-team-same-day` (`validation.ts:272-310`) – fires, and is vacuous.**

**[R]** It pairs each TEAM event with `findIndividualCounterpart`, which matches
on *identical* category, gender and weapon (`crossover.ts:211-223`). Every such
pair is same-population, and `crossoverPenalty` returns `Infinity` for it
(`crossover.ts:84-97, 143`). §Individual/Team Separation says so in as many
words: same-category ind/team pairs "are hard-blocked … and are *not* relaxed at
level 3" (METHODOLOGY:192).

**[M, harness M10]** Across all ten templates, every firing of the rule is on a
pair for which `crossoverPenalty === Infinity`. There is no counter-example. The
rule computes the duration of a co-location the day assigner is structurally
prevented from producing, and emits it as a `policy` finding – ERROR under
`ValidationMode.BINDING`, which is the mode the scheduler uses
(`concurrentScheduler.ts:186`).

**[M, harness M7 + M11]** The consequence, measured at a realistic venue
(80 strips, 12 video):

| Template | days | scheduled | ERRORs | first ERROR |
|---|---|---|---|---|
| NAC Div1/Junior | 3 | **0 / 24** | 2 | `D1-M-EPEE-IND + D1-M-EPEE-TEAM worst-case same-day duration 855 min exceeds DAY_LENGTH_MINS 840` |
| NAC Div1/Junior | 4 | **0 / 24** | 2 | same |
| NAC Vet/Div1/Junior | 3 | **0 / 66** | 2 | same |
| NAC Vet/Div1/Junior | 4 | **0 / 66** | 2 | same |

**[M, harness M11]** The counterfactual. Raising `DAY_LENGTH_MINS` to 900 – which
slackens the two worst-case rules and widens the feasibility budget by 7%, while
leaving the real day windows at 8 AM–10 PM because `dayEnd` reads `dayConfigs`
when present (`types.ts:453-458`):

| Template | days | scheduled | ERRORs |
|---|---|---|---|
| NAC Div1/Junior | 3 | **24 / 24** | 0 |
| NAC Div1/Junior | 4 | **24 / 24** | 0 |
| NAC Vet/Div1/Junior | 3 | 44 / 66 | 22 |
| NAC Vet/Div1/Junior | 4 | **66 / 66** | 0 |

At 840 the *only* findings on those templates were the two
`indiv-team-same-day` errors – feasibility was not firing – so the 7%
perturbation is not what moved 0 to 24. **Two of ten templates render nothing at
any day count and any venue size because a hypothetical the engine forbids
overruns by 15 minutes.** These are the two empty boards the prompt refers to,
and this is their cause.

**`validateSameDayCompletion` (`validation.ts:75-94`) – the half that could bind
is not wired.** **[R]** It is exported and has no caller in `src/`, and the only
callers are `__tests__/engine/validation.test.ts`, whose own comment at line 819
records that it "is exported but not wired into `validateConfig`'s" pipeline.
**[M, harness M10]** Wiring it would fire on zero competitions across all ten
templates. The doc's Single-Day Fit rule (METHODOLOGY:128-131) has two clauses:
the single-event clause is unenforced and harmless, and the ind/team clause is
enforced, vacuous, and catastrophic.

#### 1.2.5 Severity inflation – every path to BINDING

**[R]** One ERROR from `validateConfig` returns an empty schedule and stops
(`concurrentScheduler.ts:197-204`). The complete list of rules that can reach
that state, by `kind`:

| Rule | Kind | Reaches BINDING ERROR | Should it discard the tournament? |
|---|---|---|---|
| `strips-total-positive` | structural | always | Yes – nothing to draw. |
| `duplicate-competition-id` | structural | always | Yes. |
| `fencer-count-bounds` | structural | always | **No.** One bad event should be dropped, not all of them. Already on the backlog as "A fencer count of 0 or 1 unmounts the whole app". |
| `cut-value-range`, `cut-value-min-promotions` | structural | always | **No.** Per-event, so scope it to that event. |
| `de-duration-table-missing-entry` | structural | always | **No.** Per-event. |
| `video-r16-strip-shortfall` | structural | always | **No.** Per-event, and the doc calls video strips a recommendation ("8+ recommended", METHODOLOGY:147). |
| `flighting-group-strips` | policy | binding | **No.** Reject the flighting group, keep the tournament. |
| `cut-on-team` | policy | binding | **No.** Coerce to DISABLED – `buildConfig` already coerces regional cuts this way (`buildConfig.ts:194-202`). |
| `resource-precondition-strips` | policy | binding | Debatable. See 1.3. |
| `indiv-team-same-day` | policy | binding | **No – delete it.** See 1.2.4. |
| `team-requires-individual` | policy | binding | Yes. The doc makes the individual auto-enabled and undisableable (METHODOLOGY:154). |
| `same-population` (count > days) | policy | binding | **No.** It is the one rule that correctly detects the 1.2.2 shortfall, but only for identical-population groups – and it discards everything rather than reporting the shortfall. |
| `feasibility-strip-hours`, `feasibility-video-strip-hours` | policy | binding | Debatable. It is a genuine global claim, but see 1.3. |

**[M, harness M2/M7]** `feasibility-strip-hours` alone empties NAC Youth (3 days,
39 strips), ROC Mega (3 days, 40 strips), RYC Weekend and Junior Olympics at the
strip count the app itself suggests.

#### 1.2.6 Specified constants with no mechanism behind them

The prompt asks for the others like `CAPACITY_TARGET_FILL`. **[R]** Each of these
is documented as a rule, defined as a constant, and read by nothing in `src/`
outside the settings UI and the config bridge:

| Constant / field | Documented as | Readers in `src/` |
|---|---|---|
| `LATEST_START_MINS` = 960 (`constants.ts:47`) | "Pool rounds cannot start after 4:00 PM" (METHODOLOGY:72, 872) | none – only `buildConfig.ts` copies it onto the config |
| `MORNING_WAVE_WINDOW_MINS` = 120 (`constants.ts:55`) | §Video Strip Preservation start-of-day pool wave (METHODOLOGY:470) | none |
| `SAME_TIME_WINDOW_MINS` = 30 (`constants.ts:82`) | "within 30 minutes" crossover window (METHODOLOGY:217, 877) | none |
| `EARLY_START_THRESHOLD` = 10 (`constants.ts:89`) | Appendix A early-start window (METHODOLOGY:876) | none |
| `THRESHOLD_MINS` = 10 (`constants.ts:53`) | Appendix A bottleneck-detection threshold | none (a gears-panel label only) |
| `MAX_RESCHEDULE_ATTEMPTS` = 3 (`constants.ts:90`) | not documented, and contradicts §Two-Attempt Retry | none |
| `VIDEO_STAGE_ROUND` (`constants.ts:532-548`) | the whole R16/R8/R4-by-category table (METHODOLOGY:409-416) | none – `dePhasesForBracket` splits at bracket ≥ 64 for everyone (`de.ts:44-49`) |
| `earliest_start_offset` (`constants.ts:20-39`) | "2-hour start offset (medication timing for older athletes)" for VET 60/70/80/Combined (METHODOLOGY:754) | none – `buildConfig.ts:162` sets `earliest_start: 0` for every event |
| `de_round_of_16_requirement` | not documented | none anywhere |
| `conflict_score` on `ScheduleResult` | not documented | written as `0`, never read |
| `genderEquityAllowableDiff` (`analysis.ts:42-47`) | doc says gender-equity validation "is to be added in a future version" (METHODOLOGY:781) | none – the helper exists, no pass calls it |
| `recommendRefCount` (`stripBudget.ts:60`) | §Referee Output | none in `src/` (drift ledger only) |

**[M]** Three documented crossover weights are unreachable because
`isGroup1Mandatory` is checked before the penalty matrix (`crossover.ts:148-150`):
`crossoverPenalty(Y12, Y14)` returns `Infinity`, not the documented 0.8. The same
holds for Y10↔Y12, Y14↔CADET, CADET↔JUNIOR and JUNIOR↔DIV1. §Demographic
Crossover's own worked examples – "Y12 → Y14: 0.8", "Cadet → Junior: 0.8" – name
values the engine can never apply.

**[M]** And one documented rule is implemented with the opposite sign.
METHODOLOGY:118 states, in bold, "**Exception**: Y8 CAN and SHOULD be on the same
day as Y10". `constants.ts:452` records the intent correctly ("Y8/Y10
intentionally omitted"). But `CROSSOVER_GRAPH` gives `Y8 → Y10 = 0.8`
(`constants.ts:415`), so `crossoverPenalty(Y8, Y10)` returns **0.8** – the largest
finite same-day penalty in the graph, applied against the pairing the doc says to
prefer.

#### 1.2.7 Over-precision without basis

The prompt asks which penalty weights have an empirical or policy source. **[R]**
Sorting the 19 `PENALTY_WEIGHTS` by what backs them:

- **Policy-sourced, in the sense that the *rule* is cited even though the number
  is not**: `REST_DAY_VIOLATION` 1.5 (Ops Manual Ch.4 p.26, Group 2 –
  METHODOLOGY:230). One weight of nineteen.
- **Behaviourally tuned, evidence in a code comment**: `SABER_PILEUP_PENALTY_TABLE`
  `[0, 0.5, 2.0, 10.0, 50.0]` (`dayAssignment.ts:74`). The escalation shape has a
  stated structural rationale (saber refs are three-weapon specialists). The
  values themselves are not derived.
- **Internally consistent by construction, unsourced in magnitude**: the
  ind/team ordering trio (−0.4 / 1.0 / 0.3), reused verbatim for the VET_COMBINED
  day-after rule (`dayColoring.ts:239-242`). Reuse is a design choice, not
  evidence.
- **Invented precision, no source in either direction**: the eight time-of-day
  weights (Part 3), `PROXIMITY_1_DAY` −0.4, `PROXIMITY_3_PLUS_DAYS` 0.5,
  `WEAPON_BALANCE` 0.5, `CROSS_WEAPON_SAME_DEMOGRAPHIC_VET` 0.2, and the three
  `LAST_DAY_REF_SHORTAGE_*`. Fourteen of nineteen.

The single-decimal precision is not the problem. The problem is that **fourteen
weights specify a value for a mechanism that does not exist**, so no amount of
tuning can be validated. Deciding whether the mechanism should exist (Part 3)
must come before any argument about the numbers.

The category weights (`CATEGORY_START_PREFERENCE`, 0.6–1.5) have a stated
rationale (METHODOLOGY:744) and are live in `capacity.ts:237-243`. They are the
best-supported numbers in the document and I would not touch them.

### 1.3 Recommended relaxations

Each row states the specific weakening and its cost.

| # | Criterion | Relaxation | Cost |
|---|---|---|---|
| R1 | `indiv-team-same-day` (`validation.ts:298-306`) | **Delete the rule.** Not demote – delete. Its premise is unreachable (1.2.4). If a same-day ind/team pair ever becomes possible, the check belongs at placement time, not validation time. | None. Removes a class of finding that can never be true. Restores two templates from 0 to full. |
| R2 | Per-event structural findings (`fencer-count-bounds`, `cut-value-*`, `de-duration-table-missing-entry`, `video-r16-strip-shortfall`) | **Scope to the finding's `subjects`.** Exclude the named competitions from the scheduling run and emit one ERROR per excluded event, instead of returning an empty schedule. | One change to the gate at `concurrentScheduler.ts:197-204`, plus a "N events excluded" line. Moves B-scenario counts up wherever a per-event finding currently zeroes a board. |
| R3 | `cut-on-team` | **Coerce, don't reject.** Set `cut_mode = DISABLED` in `buildConfig` and emit a `notice`. | Trivial. `buildConfig.ts:194-202` already does exactly this for regional cut overrides. This is the defect 008 was written to fix, still reachable from any non-store caller. |
| R4 | `flighting-group-strips` | **Demote to WARN and drop the flighting group**, keeping both events unflighted. | Small. The group is an advisory construct, and discarding the tournament over it inverts the priority. |
| R5 | `feasibility-strip-hours` (`validation.ts:405`) | **Demote to WARN, keep the message.** The estimate is a worst-case sum with a 15% slack band, and the concurrent scheduler routinely absorbs more than it predicts. Let the run proceed and let unscheduled events be the report. | Boards stop being empty on a heuristic. Risk: a genuinely impossible config now costs a full scheduling pass and returns a partial board with many ERRORs – arguably a better answer than a blank one, but noisier. |
| R6 | `same-population` group count > `days_available` | **Generalise and demote.** The right check is the one 1.2.1 computes: the clique number of the hard-constraint graph versus `days_available`. Report it as a single WARN naming the witness clique and the days needed, and let the scheduler proceed. | Real work – a clique computation on ≤ 66 vertices, which is instant, plus a new finding type. This is the check that would have caught 1.2.2. |
| R7 | The DSatur least-bad-color fallback (`dayColoring.ts:534-556`) | **Never silent.** Record a violation for every hard edge the chosen color breaks, with the pair, and set `constraint_relaxation_level` accordingly. | Small and additive – no coloring behaviour changes, only reporting. Should land with R6. |
| R8 | `SAME_DAY_VIOLATION` at ERROR (`concurrentScheduler.ts:920-931`) | Already on the backlog under "Day-end overrun is a hard failure the methodology calls a warning". I concur with the recorded verdict: let terminal phases place past `dayHardEnd` with a WARN carrying the estimated finish. | Moves drift-ledger numbers on every scenario with a late day. Needs its own review. |
| R9 | Veteran co-day strict serialization | Already on the backlog under "Vet co-day serialization is unsourced and never fit-checked". **[M, harness M12]** measures the second half of that concern and finds it does not bite: on NAC Vet/Div1/Junior at 80 strips with the worst-case rules slack, all 30 age-banded vet events place, and the longest 5-event chain spans 705 minutes inside an 840-minute day. The sourcing objection stands, but the fit objection does not, on this template. | Recording only. Do not add a chain validator. |

---

## Part 2 – The reconciliation ledger

Cost is rated **S** (an hour or two, one file), **M** (a task with tests), **L**
(a feature). "Moves drift" means the B1–B8 ledger snapshot changes and
constitution III's review applies.

### 2.1 The five faithful-but-dead encodings – re-verified

All five verified by grep for production readers. **[R]** Every one has tests and
no `src/` caller outside its own module.

| # | Spec claim | Engine behaviour | Verdict | Evidence | Cost |
|---|---|---|---|---|---|
| L1 | Proximity: 1 day bonus, 2 neutral, 3+ penalty (METHODOLOGY:234-240) | `proximityPenalty` (`crossover.ts:176-205`) encodes all three rows and has no `src/` caller. The live path is `dayColoring.ts:281-299`, whose `if (dayGap !== 1) continue` at line 286 means only the bonus row can ever apply. `PROXIMITY_3_PLUS_DAYS` has zero readers. | **ENGINE-WRONG** | The guard is three lines above the constant it excludes. No comment records a rejected experiment. The doc's rule is coherent and cheap. | S. Moves drift. |
| L2 | Capacity curve 0 / 0.60 / 0.80 / 0.95 → 0 / 3.0 / 10.0 / 20.0 (METHODOLOGY:760-766) | `capacityPenalty` (`dayColoring.ts:96-104`) hardcodes 0.85 / 1.0 and reads only `OVERFLOW_PENALTY` from `CAPACITY_PENALTY_CURVE`. **[M, harness M5]**: at fill 0.80 the doc says 3.0 and the code says 0.0, and the code needs fill **2.70** to reach the doc's 0.95 value of 20.0. | **DOC-WRONG** | `dayColoring.ts:90-94` records the rejection: the 0.60-start curve "over-steered events in mid-loaded days and caused regressions in large multi-day tournaments". A code comment recording a rejected experiment is the prompt's own criterion for DOC-WRONG. | S, doc-only. The doc should carry the rejection, and `CAPACITY_PENALTY_CURVE`'s five unread members should go with it. |
| L3 | Soft separation DIV1↔CADET 5.0, ↔DIV2 3.0, ↔DIV3 3.0 (METHODOLOGY:252-254) | `SOFT_SEPARATION_PAIRS` (`constants.ts:471-475`) has no reader. **[M]** the applied values are DIV1↔CADET **0.8**, DIV1↔DIV2 **0.0**, DIV1↔DIV3 **0.0** – the last two have no edge in `CROSSOVER_GRAPH` at all, direct or two-hop. | **ENGINE-WRONG** | The doc's DIV1↔CADET 5.0 is the value that makes the pair "allowed in rare cases" mean something, while 0.8 makes it an ordinary crossover edge and 0.0 makes DIV1↔DIV2/DIV3 unmodelled. The prior pass said "6× under spec" for one pair – it is worse for the other two. | S. Moves drift – this is a real penalty change on any DIV1-bearing scenario. |
| L4 | Youth/vet −5 min DE bout delta (METHODOLOGY:879) | `perBoutDuration` (`de.ts:148-159`) has no caller. `SettingsPanel.tsx:72` already carries a comment saying so. | **DECISION-REQUIRED** | The engine's DE durations come from `de_duration_table` by bracket size, not by bout count. There is no seam where a per-bout delta could apply without replacing the table model. Wiring it means re-deriving `DEFAULT_DE_DURATION_TABLE`. | L if wired, S if the doc retires it. Recommend retiring: the table is the model. |
| L5 | Strip count suggestion (METHODOLOGY:705-709) | `analysis.ts:22-30` `suggestStripCount` has no caller. The app uses `src/store/stripSuggestion.ts:9` `suggestStrips`, which is the same algorithm. | **BOTH-WRONG** | The two implementations are byte-equivalent in behaviour (I read both), and the difference is the input shape, not the rule. The defect is not divergence, it is that **the rule itself under-recommends**: **[M, harness M2]** at the suggested count NAC Youth needs 39 strips and empties on feasibility, while at 80 it schedules 24/24. Suggesting "one strip per pool of the largest event" ignores every other event on the day. | M. Delete the engine copy, and re-specify the rule as a day-level demand sum. Moves nothing in the ledger (the ledger supplies its own strip counts) – which is why this defect is invisible to it. |

### 2.2 Sixth encoding, not on the prior list

| # | Spec claim | Engine behaviour | Verdict | Evidence | Cost |
|---|---|---|---|---|---|
| L6 | Video replay begins at R16 / R8 / R4 by age category (METHODOLOGY:409-416) | `VIDEO_STAGE_ROUND` (`constants.ts:532-548`) encodes the full table and has no `src/` reader. `dePhasesForBracket` (`de.ts:44-49`) splits at `bracketSize >= 64` for every category, and `deBlockDurations` (`de.ts:63-77`) gives the video block a fixed 30-bout share. | **DOC-WRONG (provisionally)** | The backlog's §Policy tables entry records that USA Fencing publishes a flat "R16 onward" and that no source was found for the tiering in either direction. Conforming the engine to an uncorroborated table encodes a guess. | S, doc-only: mark the table provisional and state the flat rule as what runs. |

### 2.3 Penalty weights: 5 of 19 read – confirmed, with a correction

**[M]** Per-key `grep -rn "PENALTY_WEIGHTS\.<KEY>" src/`:

- **Live**: `REST_DAY_VIOLATION` (`dayColoring.ts:294`), `PROXIMITY_1_DAY`
  (`dayColoring.ts:298`), `TEAM_BEFORE_INDIVIDUAL` / `INDIV_TEAM_DAY_AFTER` /
  `INDIV_TEAM_2_PLUS_DAYS` (`dayColoring.ts:177-180` and `239-242`).
- **Correction to the prior pass**: those last three each have a *third*
  occurrence at `crossover.ts:250-254`, inside `individualTeamProximityPenalty`,
  which has no `src/` caller. Five keys are read, and only `dayColoring.ts` reads
  them.
- **Zero readers, including tests**: the other fourteen. No test asserts on them
  either, so nothing would go red if they were deleted.

The three-way split the prior pass proposed holds and I confirm it:

| Group | Keys | Verdict | Cost |
|---|---|---|---|
| Cheap engine fixes, no blocker | `PROXIMITY_3_PLUS_DAYS`, `WEAPON_BALANCE`, `CROSS_WEAPON_SAME_DEMOGRAPHIC_VET` | **ENGINE-WRONG** – all three are day-level properties `colorPenalty` has every input to compute | S each. Moves drift. |
| Need the Part 3 decision | `SAME_TIME_HIGH_CROSSOVER`, `SAME_TIME_LOW_CROSSOVER`, `INDIV_TEAM_SAME_TIME_OR_WRONG_ORDER`, `INDIV_TEAM_GAP_UNDER_MIN`, `EARLY_START_CONSECUTIVE_HIGH_CROSSOVER`, `EARLY_START_SAME_DAY_HIGH_CROSSOVER`, `EARLY_START_CONSECUTIVE_INDIV_TEAM`, `Y10_NON_FIRST_SLOT` | **DECISION-REQUIRED** | See Part 3. |
| Need ref demand earlier than it is computed | `LAST_DAY_REF_SHORTAGE_LARGE_NAC`, `_LARGE_ROC`, `_MEDIUM` | **DECISION-REQUIRED**, and undocumented – no METHODOLOGY section describes a last-day ref-shortage penalty at all | Deferred. Recommend deleting the constants and leaving the idea on the backlog. |

### 2.4 Constraint relaxation: four levels specified, one implemented

| Spec claim | Engine behaviour | Verdict | Evidence | Cost |
|---|---|---|---|---|
| Four levels, 0–3, each emitting a warning, and failure at level 3 is an unresolvable error (METHODOLOGY:270-284) | One level. `relaxations.set(id, 3)` (`dayColoring.ts:560`) is the only value ever written, and only for `INDIV_TEAM_RELAXABLE_BLOCKS` edges. No level-1 or level-2 code path exists. No unresolvable error exists – see 1.2.2. | **DOC-WRONG on levels 1–2, ENGINE-WRONG on the failure report** | The prior pass's argument is correct and I verified the mechanism: hard edges block a color outright (`dayColoring.ts:472-479`) and soft edges only contribute penalty, so dropping a soft penalty cannot unblock a color. Levels 1–2 are not unimplemented – they are inapplicable to a coloring algorithm. But the doc's promise of a loud failure at the end of the ladder is right, and its absence is 1.2.2. | S for the doc rewrite. S–M for R6/R7. |

The doc should say: hard constraints are structural under DSatur, one relaxation
tier exists (the ind/team cross-category blocks), and an assignment that cannot
satisfy the hard graph is reported, not silently taken.

### 2.5 `daySequencing.ts` – did the rule survive Phase D?

**The prompt's question has a clear answer: the rule survived, in a stronger
form. Only the implementation was replaced.**

**[R]** `applyCrossEventEdges` (`concurrentScheduler.ts:563-591`) implements the
Within-Day Age-Descending Order rule directly. It uses its own `VET_AGE_WEIGHT`
map (`concurrentScheduler.ts:595-601`) with the same ordering as
`daySequencing.ts:26-32`'s `VET_AGE_ORDER`, and for every pair of age-banded vet
individual siblings on the same day it adds a predecessor edge from the older to
the younger with `min_gap = ADMIN_GAP_MINS`.

**[R]** METHODOLOGY:97 already describes both halves: the sort key in
`daySequencing.ts` and the serialization edge in `applyCrossEventEdges`. The doc
is not wrong about the rule. It is wrong that the sort key exists – nothing
imports `daySequencing.ts` (`concurrentScheduler.ts:1119` names it only in a
comment), and `sequenceEventsForDay` carries 14 passing tests for code that
cannot run.

**[I]** The replacement is *stronger* than the sort key it replaced.
METHODOLOGY:96 is explicit that the sort key "alone only governs which sibling
starts first — with ample strips, age-banded siblings could otherwise still run
in parallel". The edge forbids the parallelism the sort key permitted. That is
the change the backlog's §Vet co-day entry objects to on sourcing grounds, and
it is a deliberate strengthening, not drift.

| Verdict | Action |
|---|---|
| **DOC-WRONG on the implementation pointer, engine correct on the rule** | Rewrite METHODOLOGY:97 to name `applyCrossEventEdges` alone. Then `daySequencing.ts` and its 14 tests can be deleted – the evidence question the file was held for is now answered, and this document is the record. Cost S, moves no drift. |

### 2.6 Video Strip Preservation – three documented rules, none implemented

| Spec claim | Engine behaviour | Verdict | Evidence | Cost |
|---|---|---|---|---|
| Pools may use video strips in the start-of-day wave; on a single-event day video strips are always available to pools; multi-event mid-day pools may not touch video strips (METHODOLOGY:466-477) | `findAvailableStripsInWindow` (`resources.ts:203-267`) implements only the two phase-level rules: `videoRequired` → video-capable candidates only (line 217-218), otherwise non-video first and video as overflow (line 220-223). There is no time-of-day branch, no event-count branch, and `MORNING_WAVE_WINDOW_MINS` has no reader. | **ENGINE-WRONG** | The doc gives an operational reason for each of the three rules and they are mutually consistent. Nothing in the code records a rejection. The current behaviour is strictly more permissive: pools can take video strips at any hour on any day once general strips are exhausted. | M. Needs the day's event count and the day-start window threaded into the allocator. Moves drift on every NAC scenario. |

### 2.7 Video-strip budget and staged-DE strip release – specified, absent

| Spec claim | Engine behaviour | Verdict | Cost |
|---|---|---|---|
| Video strip capacity tracked as a separate day-assignment budget; peak > 70% → 5.0 penalty, 100% → 15.0 (METHODOLOGY:769-773) | `estimateCompetitionStripHours` computes `video_strip_hours` (`capacity.ts:147-150`), and the only reader is `validateFeasibility` (`validation.ts:399`). `dayColoring.ts:603-612` builds `stripHoursMap` from `total_strip_hours` and `dayCapacity` from general strips only. **No video budget participates in day assignment.** | **ENGINE-WRONG** | M. New term in `colorPenalty`. Moves drift on NAC scenarios. |
| Staged DE rounds run in sequence on video strips and release them between rounds (METHODOLOGY:775-777) | One `DE_R16` node holds `de_round_of_16_strips` for the whole R32→SF block as a single allocation (`concurrentScheduler.ts:499-514`). No per-round release. | **DECISION-REQUIRED** | L. Per-round decomposition is a phase-model change. The doc's claim is the more realistic model, while the code’s is the cheaper one. |

### 2.8 Remaining rows

| # | Spec claim | Engine behaviour | Verdict | Cost |
|---|---|---|---|---|
| L7 | Pool rounds cannot start after 4:00 PM (METHODOLOGY:72, 872) | `LATEST_START_MINS` reaches the config and no engine code reads it. Pools can be deferred to any hour that leaves room before `dayHardEnd`. | **ENGINE-WRONG** | S. A `notBefore`/`notAfter` check in `tryAllocate`. Moves drift – some late pool phases become failures, which interacts with R8. |
| L8 | VET 60/70/80/Combined may not start before 10:00 AM (METHODOLOGY:754, "120-min start offset") | `earliest_start_offset` has no reader, and `buildConfig.ts:162` sets `earliest_start: 0` for every event. | **ENGINE-WRONG** | S. One line in `buildConfig` plus the lookup. Moves drift on vet-bearing scenarios. |
| L9 | Y8 CAN and SHOULD share a day with Y10 (METHODOLOGY:118) | `crossoverPenalty(Y8, Y10)` = **0.8** **[M]**, the maximum finite same-day penalty. `GROUP_1_MANDATORY` correctly omits the pair (`constants.ts:452`), but `CROSSOVER_GRAPH` supplies a penalty against it (`constants.ts:415`). | **ENGINE-WRONG** | S. Either remove the edge or make it a bonus. Moves drift on B4 and NAC Youth. |
| L10 | Veteran → Div 1 crossover 0.8, "high overlap at NACs" (METHODOLOGY:215) | 0.1 **[M]**, with a code comment stating "only ~5–10% of vet fencers also enter Div events" (`constants.ts:432-435`). | **DOC-WRONG** | S, doc-only. The code comment is a reasoned rejection of the doc's figure. |
| L11 | Flighted events have a strong affinity for 8:00 AM, and smaller events get priority to start (METHODOLOGY:347-349) | `compareNodes` (`concurrentScheduler.ts:1149`) orders **larger** `desired_strip_count` first, and there is no flighting term in the comparator at all. | **ENGINE-WRONG on the flight affinity, DOC-WRONG on "smaller first"** | S–M. The comparator's own comment (`concurrentScheduler.ts:1122`) gives a measured reason for larger-first. The doc's "smaller events get priority" is the rejected alternative and should be rewritten, while the 8 AM flight affinity is a real missing rule. |
| L12 | Phase 3 sorts competitions by constraint score, most-constrained first (METHODOLOGY:608-620) | `constraintScore` is computed (`concurrentScheduler.ts:364`) and used only as tiebreaker #5 in `compareNodes`. Day assignment orders by DSatur saturation degree, not constraint score (`dayColoring.ts:449-464`). | **DOC-WRONG** | S, doc-only. Saturation degree *is* "most constrained first" – the doc should say so and name the tiebreak chain. |
| L13 | The individual/team 120-minute gap is enforced at runtime (METHODOLOGY:197, 564) | `predecessorReadyTime` (`concurrentScheduler.ts:1170-1184`) skips any predecessor whose terminal phase is not yet RUNNING (line 1178, `continue`). If the team's first node is popped before the individual has run, no floor applies. **[I]** – **[M, harness M4/M8]** could not produce a counter-example: no template or B-scenario places an ind/team pair on the same day, because same-population blocks them. So the branch is unreachable today for the same reason `indiv-team-same-day` is vacuous. | **ENGINE-WRONG, latent** | S. Worth fixing when the cross-category ind/team relaxation at level 3 starts producing same-day pairs – that is when it becomes reachable. |
| L14 | DE prelims / R16 split by bout share (METHODOLOGY:394-401) | Already on the backlog as "DE prelims gets a sliver of its bracket's time, not its bout share", with the unit error located at `de.ts:63-77`. Confirmed, not re-derived. | **ENGINE-WRONG** | M. Owned by that backlog entry. |
| L15 | Strip minimum `strips_total >= max_pools_any_event`, halved for flighted events (METHODOLOGY:137-145) | `validation.ts:245-247` checks `n_pools > strips_total` per competition with no halving for flighted events. | **ENGINE-WRONG on the halving, doc unclear on severity** | S. But see R5 – the whole feasibility family needs its severity settled first. |
| L16 | Refs per pool: "Auto: uses two-per-pool" (METHODOLOGY:515) | True in `resolveRefsPerPool` (`pools.ts:166-176`), but `buildConfig` resolves `AUTO` against `TYPE_DEFAULTS` first, giving **one** ref per pool for ROC / RYC / RJCC (`typeDefaults.ts:21-23`). The engine never sees `AUTO` from the app path. | **DOC-WRONG** | S, doc-only. Document the per-type resolution. |

---

## Part 3 – The blocking decision

### The seam

**[R]** Eight `PENALTY_WEIGHTS` are phrased as time-of-day rules: two same-time
crossover weights, two ind/team timing weights, three early-start weights, and
`Y10_NON_FIRST_SLOT`. **[R]** Day assignment runs first
(`concurrentScheduler.ts:208`) and no phase has a start time yet. The concurrent
loop assigns times (`concurrentScheduler.ts:610-748`) and allocates greedily –
`compareNodes` orders by readiness and scarcity, and `tryAllocate` takes the
earliest fitting window. Nothing in either half minimises a penalty over times.
Phase D split one scheduler into two and these eight weights fell into the seam.

`SAME_TIME_WINDOW_MINS` and `EARLY_START_THRESHOLD` – the two constants the rules
would need – are also unread (1.2.6). The seam is complete: rule, weight and
threshold all present, mechanism absent.

### Option A – score them in the concurrent scheduler

Add a penalty term to `compareNodes`, or a post-allocation scoring pass that
re-orders the ready queue against realised times.

- **Cost**: M–L. `compareNodes` is a pure comparator today and every ordering
  decision is local. A same-time crossover penalty is pairwise across events, so
  the comparator would need the current allocation state – a different shape of
  function.
- **Risk**: high. The loop's termination argument rests on the monotonicity
  invariant (`concurrentScheduler.ts:701-705`). Any change that reorders on a
  computed score risks reintroducing the deferral cycles that invariant exists to
  catch. It also moves every B1–B8 start time, so the drift review is on the
  whole ledger rather than one scenario.
- **What it buys**: the rules become real, and `Y10_NON_FIRST_SLOT` in particular
  encodes a genuine USA Fencing practice (youth events in the morning).

### Option B – a bounded re-color pass against realised times

Run the concurrent scheduler, score the realised schedule against the eight
weights, and re-color once with the worst offenders' days excluded.

- **Cost**: L. But it shares its machinery with the backlog's "Runtime failure is
  terminal – day assignment never re-colors", which is the amplifier under
  several recorded empty-board defects, and with R6/R7 above.
- **Risk**: medium. A second pass is easy to bound (cap at one) and easy to make
  deterministic. The failure mode is that the second coloring is worse than the
  first, which a "keep the better of the two" rule handles.
- **What it buys**: the time-of-day rules *and* the re-color repair path, from
  one mechanism. That is the strongest argument for it – the backlog already
  wants the repair loop for a different reason.

### Option C – retire them from the specification

Delete the eight weights and rewrite the sections that describe them, recording
Phase D as the reason.

- **Cost**: S. Doc-only, plus deleting eight constants nothing reads.
- **Risk**: low, and reversible.
- **What it costs**: the specification stops describing three things a human
  scheduler genuinely cares about – not stacking two overlapping populations at 8
  AM, not making a family show up at 8 AM two days running, and starting Y10
  first. Y8/Y10-first survives independently: it is already a hard tiebreaker in
  `compareNodes` (`concurrentScheduler.ts:1143-1145`) and in the dead
  `daySequencing.ts` rule 1.

### Recommendation

**Option B, but not first, and not as one piece.**

The reasoning: Option C is honest but throws away rules the domain wants, and it
would have to be re-decided the moment anyone looks at a schedule and asks why
two Junior events both start at 8 AM. Option A pays the full cost of a scheduler
change and returns only these eight weights. Option B pays a similar cost and
returns the eight weights **plus** the re-color repair path the backlog
independently wants, which is also the mechanism R6 and R7 need to report an
unsatisfiable coloring properly.

The qualifier matters. Option B should not be the next thing built. Sections 1.2.4
and 1.2.2 describe defects that make four of ten templates render nothing and one
render silent hard-constraint violations, and they are fixed with single-file
edits that move no scheduler architecture. Building a re-color pass on top of an
engine that empties two templates over a vacuous 15-minute rule is spending the
expensive budget before the cheap one.

So: **answer this question B, and schedule it after Wave 1 below.** If the answer
is C instead, Wave 1 is unaffected and Wave 3 shrinks to a documentation task.

**This is the product owner's call. It is not decided here.**

---

## Recommended sequence

### Wave 1 – independent, cheap, and each one restores a board

None of these needs the Part 3 answer. Each is a single file. They are ordered by
how much they restore per unit of work.

| Order | Item | File | Drift |
|---|---|---|---|
| 1 | **R1** – delete `indiv-team-same-day` | `validation.ts:298-306` | Two templates go 0 → full. Ledger: verify B1/B2/B8 counts do not drop. |
| 2 | **R7** – make the least-bad-color fallback report | `dayColoring.ts:534-556` | Additive reporting only, with no coloring change. |
| 3 | **R2** – scope per-event structural findings to their subjects | `concurrentScheduler.ts:197-204` | Expect B4 (currently floor 0) to move. Review before accepting. |
| 4 | **R3** – coerce `cut-on-team` instead of rejecting | `buildConfig.ts` | None expected. |
| 5 | **L1** – wire `PROXIMITY_3_PLUS_DAYS` | `dayColoring.ts:286` | Moves drift. Review the diff. |
| 6 | **L9** – remove the Y8→Y10 penalty | `constants.ts:415` | Moves drift on B4 and NAC Youth. |
| 7 | **L3** – apply `SOFT_SEPARATION_PAIRS` | `crossover.ts:150` | Moves drift on every DIV1 scenario. Review carefully – three pairs change at once. |

### Wave 2 – documentation, no engine change, no decision needed

Can run in parallel with Wave 1 by a different session. All ten contradictions in
1.1, plus the DOC-WRONG rows: **L2** (record the capacity-curve rejection),
**L6** (mark the video tiering provisional), **L10** (Veteran↔Div1 0.1),
**L12** (saturation degree is the priority order), **L16** (per-type ref policy),
**2.4** (one relaxation tier, not four), **2.5** (name `applyCrossEventEdges`
alone – then delete `daySequencing.ts` and its 14 tests), and **L11**'s
"smaller events first" clause.

### Wave 3 – needs the Part 3 answer first

**2.7** video-strip budget, **2.6** video strip preservation, **R6** the clique
check, **R5** feasibility demotion, **R8** day-end overrun, and the eight
time-of-day weights themselves. These share the day-assignment/runtime seam, and
sequencing them before the decision means building twice.

### Wave 4 – needs its own drift review, each alone

**L14** (the DE prelims bout-share unit error – already has its own backlog
entry), **L5** (re-specify the strip suggestion as a day-level demand sum),
**L7** (the 4 PM pool cutoff), **L8** (the veteran start offset). Each of these
changes phase durations or placements directly and should not share a task with
anything else.

### What this document does not do

It does not create a `specs/` directory. Per the prompt, the feature is sized
after the Part 3 answer. Wave 1 is small enough to be a single feature on its own
and does not need to wait for that answer – if the product owner wants to move
before deciding Part 3, Wave 1 plus Wave 2 is the feature to spec.
