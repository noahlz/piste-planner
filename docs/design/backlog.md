# Backlog

Work no phase plan has picked up. Items here are not tracked in `specs/` – a
Spec Kit feature directory is created for one only when it is assigned a phase.

> **2026-08-27 update**: The workbench UI design at
> [`competition-planner-workbench.md`](./competition-planner-workbench.md)
> absorbed most of this list – real-tournament presets, the tournament setup
> screen, the FLUID re-pack button, and drag-drop matrix repair are all covered
> by its P1–P5 roadmap.
>
> What remains below is work no phase plan has picked up. The design's "Open
> items carried forward" table lists these same four items with their owner
> phase, and points back here for the detail. **This file is the record, that
> table is the index** – do not restate detail there.

## Day-axis parity

*Assigned to feature 006 on 2026-08-31, done 2026-08-31. Unblocked 004's US3.*

The app path (`applyPreset → buildTournamentConfig → scheduleAll`) scheduled
11 of B1's 24 events while the drift ledger's factory path scheduled 24/24 —
the store's clock-time `dayConfigs` collided on the engine's compacted day
axis. The record, with repro, isolation numbers, and fix options, is
[reassessment-2026-08-31.md §2](./reassessment-2026-08-31.md). The full
feature record, including the app-path parity test that now protects the app
rather than a config it never builds, is
[`specs/006-day-axis-parity/`](../../specs/006-day-axis-parity/); the
store↔engine axis invariants it enforces are
[`contracts/day-axis.md`](../../specs/006-day-axis-parity/contracts/day-axis.md).

**What 006 deliberately did not fix**, so a later session does not have to
rediscover these:

- **Per-day capacity math still uses the `DAY_LENGTH_MINS` constant**, not the
  per-day windows 006 introduced — `dayRemainingCapacity`
  (`src/engine/capacity.ts:211`) and the DSATUR day-assignment loop
  (`src/engine/dayColoring.ts:612`) both compute a day's strip-hour budget as
  `strips_total × DAY_LENGTH_MINS / 60`, a fixed per-day length rather than
  that day's own configured hours. 006's axis fix reconciled where events
  land; it did not touch how much capacity a day is credited with. A
  tournament whose days have unequal lengths (spec.md's own edge case) is
  scheduled correctly today only because no reference tournament yet
  discriminates the two — this is a latent gap, not a verified-safe one.
- **Placement states for partial knowledge** — unplaced /
  day-known-time-unknown / placed / pinned — stay parked at P4, per the
  §Revised sequence table in
  [`competition-planner-workbench.md`](./competition-planner-workbench.md).
- **`findAvailableStripsInWindow`'s `day` argument guard has one residual
  gap.** T015 states the day-inference precondition (`src/engine/resources.ts`
  comments, no behavior change) and `__tests__/engine/resources.test.ts`
  backstops it two ways: a `vi.spyOn` over a real multi-day `scheduleAll` run,
  and a static arity check per call site in `concurrentScheduler.ts`. An
  explicit `undefined` passed in the `day` position keeps the call's arity at
  7 and slips past the static backstop at the STAGED-DE precheck call site
  (`concurrentScheduler.ts:902`), which the spy cannot reach (it only fires
  when a DE node doesn't fit before `dayHardEnd`, which no ordinary scenario
  run triggers). The consequence is bounded — an unreached `day` value feeds
  only the `reason` ternary in `findAvailableStripsInWindow`, so no scheduling
  outcome moves — but a `TIME` shortfall could be relabeled `STRIPS` there,
  manufacturing a spurious `STRIP_CONTENTION` bottleneck
  (`concurrentScheduler.ts:727`) that tells an organizer to add strips when
  the day was the real constraint. Documented in the test file's own comment
  block above the guard's `describe`.

## Team events block their whole tournament

*Found by feature 006 on 2026-08-31 while classifying its parity exceptions,
assigned to feature 008, done 2026-08-31.*

Two of the eight reference tournaments, B2 and B8, scheduled **nothing** – not
a partial schedule, an empty one. Every tournament containing team events was
affected, so this was a live product defect rather than a calibration gap:
`defaultConfigForId` derived a competition's cut from `DEFAULT_CUT_BY_CATEGORY`
with no `event_type === TEAM` branch, so a team event reached the engine
carrying a percentage cut, tripped the `cut-on-team` BINDING error, and one
BINDING error discarded the entire tournament's schedule. The full record,
including the isolation method and the store-side helper that now derives the
default, is [`specs/008-team-event-cut/`](../../specs/008-team-event-cut/);
B8's residual gap against the drift ledger is
[`b8-residual.md`](../../specs/008-team-event-cut/b8-residual.md).

Measured: B2 went from 0 to 24, the drift ledger's exact count, removing its
FR-004a exception. B8 went from 0 to 53, one above the ledger's 52, so its
exception was rewritten around the +1 rather than deleted. Two of the ten
shipped templates went from an empty board to a real schedule –
`NAC Cadet/Junior` (24 selected, 10 placed) and `Junior Olympics` (18
selected, 9 placed). The other two team-bearing templates, `NAC Div1/Junior`
(24 selected) and `NAC Vet/Div1/Junior` (66 selected), stay at 0 – blocked by
a different, unrelated BINDING rule detailed below, not by the defect this
feature fixes. No `src/engine/` change, and the drift ledger snapshot is
byte-identical to `main`.

**What 008 deliberately did not fix**, so a later session does not have to
rediscover these:

- **`ROC Mega` also placed nothing, and has no team event.** Its cause is a
  strip-hour capacity shortfall reported by `validateConfig` in BINDING mode,
  triggered by `suggestStrips()` under-recommending strips for 42 events – a
  different defect that reaches an empty board by the same "one BINDING error
  discards the whole schedule" architecture. `ROC Mega` staying at 0 after this
  feature is expected and correct, not a regression. Measured in
  [`baseline.md`](../../specs/008-team-event-cut/baseline.md).
- **`NAC Div1/Junior` and `NAC Vet/Div1/Junior` stay at 0, and this feature's
  fix is not implicated.** Isolation found zero `cut-on-team` findings on
  either template – every TEAM competition on both carries `DISABLED`/`100`.
  Both are gated instead by two BINDING errors from a different rule,
  `indiv-team-same-day` (`src/engine/validation.ts:272-310`): `Individual
  D1-M-EPEE-IND + team D1-M-EPEE-TEAM worst-case same-day duration 855 min
  exceeds DAY_LENGTH_MINS 840 min` and `Individual D1-W-EPEE-IND + team
  D1-W-EPEE-TEAM worst-case same-day duration 860 min exceeds
  DAY_LENGTH_MINS 840 min` – 15- and 20-minute overruns on the same two Div1
  épée pairs in both templates (`NAC Vet/Div1/Junior` is a superset
  containing Div1; its 42 Veteran competitions contribute nothing).
  `NAC Cadet/Junior` has zero ERRORs here because its Cadet and Junior épée
  pairs stay under 840. Read from source, not measured: the rule computes a
  hypothetical worst case – individual total + `INDIV_TEAM_MIN_GAP_MINS` +
  team total, assuming both land on the same day – and `days_available`
  appears nowhere in `validateTimingConstraints`, so it fires identically on
  a 1-day and a 5-day tournament even though the scheduler is free to
  separate the pair across days. It reaches an empty board through the same
  "one BINDING error discards the whole schedule" amplifier as `ROC Mega`
  (`src/engine/concurrentScheduler.ts:186-204`). A fix would touch, weakest
  option last: the rule's severity – it is emitted via `policy()`
  (`validation.ts:299-305`), which maps to ERROR under BINDING
  (`validation.ts:25-29`), and demoting it to `notice()` would let the
  scheduler place what it can and separate the pair across days, verified at
  the source; the all-or-nothing gate itself
  (`concurrentScheduler.ts:186-204`) – the finding carries its two
  implicated competitions as `subjects`, so dropping or deferring only those
  would fix the class rather than the instance and would cover `ROC Mega`
  too, though this is reasoning inherited from `baseline.md` and the
  dispatch, since the isolation run never opened `concurrentScheduler.ts` to
  verify the mechanism; or the Div1 épée default fencer counts
  (`D1-M-EPEE-IND` 310, `D1-W-EPEE-IND` 210) against `DAY_LENGTH_MINS` 840 –
  weakest, since it tunes a number to dodge a rule rather than fixing it, and
  the counts are user-editable so a user raising them re-breaks it. The
  diagnosis is verified; the outcome of any fix is untested, since nothing
  was changed and re-measured. Out of `src/engine/`, which this feature's
  hard constraint puts out of scope.
- **`src/engine/catalogue.ts:217`'s comment is wrong about its own count.** It
  claims `NAC Vet/Div1/Junior` selects 36 events; the measured count is 66,
  because Veteran individual events expand to six age groups. Left alone
  because `src/engine/` was outside this feature's hard constraint, not
  because it is right.
- **B8's +1 over the ledger stays open**, attributed by isolation to the
  ledger's `de_mode` and `strips_allocated` acting together – neither alone
  moves the count. It is 004 US4's, along with **B4 and B6**, which remain
  FR-004a exceptions, untouched.
- **`__tests__/helpers/scenarios.ts`'s copy of the team-event branch is
  deliberate, not debt.** Converging it on the store's helper would make the
  app-path parity check true by construction and destroy the instrument that
  found this bug. The reasoning is
  [research.md D2](../../specs/008-team-event-cut/research.md).

## A fencer count of 0 or 1 unmounts the whole app

*Found by 004's T054 React review on 2026-09-01 while reviewing US3. Not fixed
there — it is pre-existing and belongs to US2's territory, not US3's scope.
Highest user-facing defect in the area reviewed.*

`FencerCounts` (`src/components/sections/FencerCounts.tsx:51`) renders its
`NumberInput` with `min={0}` and `commitOnChange`, so typing `0` or `1` commits
on the keystroke. `computePoolStructure` (`src/engine/pools.ts:25`) throws for
`fencerCount <= 1`, and `initialAnalysis` (`src/engine/analysis.ts:26`) calls it
unguarded for every *selected* competition regardless of whether it is placed —
so `AnalysisOutput` and `CenterView` both reach it on the next render. There is
no `ErrorBoundary` and no `componentDidCatch` anywhere in `src/`, so the throw
escapes to the root and React unmounts the tree: blank page, no recovery short
of a reload, and the typed value is not even persisted.

Two independent cheap fixes, either sufficient on its own:

- Raise the input's `min` to `MIN_FENCERS`, which is already **2**
  (`src/engine/constants.ts:92`) and so coincides exactly with the throw
  threshold — the guard the component needs already exists as a named constant
  and is simply not used here.
- Guard `analysis.ts:26` the way `validation.ts:240-241` already guards its own
  call to the same function.

An `ErrorBoundary` at the shell is worth having regardless, but it is the weaker
fix on its own: it converts a crash into a dead panel rather than keeping the
app usable.

## The scorecard's peak-referee row reads higher than the scheduler's own

*Measured by 004's S6 on 2026-09-01. Recorded, not fixed — US4 is the only 004
story that may move engine output, and the store-side path is the one the UI
shows.*

For B1, `refs:peak-total` reads **220** on day 0 while the scheduler's own
`ref_requirements_by_day` for the same run says **212**. Days 1–3 agree exactly
(200, 204, 142 both ways). Only the saturated day diverges, and the store path
is always the higher of the two.

The two numbers come from two different demand models:

- `buildRefDemandByDay` (`src/store/derived.ts:160`) sums referee demand **per
  placed event**, so two events overlapping in time add their strips together
  whether or not the day has the strips to run them concurrently.
- `computePostScheduleRefDemand` (`src/engine/concurrentScheduler.ts:1200`)
  measures each window with `peakConcurrentStrips`, which **clamps** to the
  strips actually concurrent in that window.

On a day that is not saturated the two agree by construction, which is why only
day 0 moves. Neither is wrong for its own purpose — the store's is an upper
bound on referees a day could need, the engine's is what the schedule it
produced actually demands — but the app shows one number and the scheduler
reasons with the other, so an organizer staffing from the drawer staffs above
the schedule's own requirement. Worth reconciling when the referee model is next
opened; until then the divergence is bounded, one-directional, and confined to
saturated days.

## Day-end overrun is a hard failure the methodology calls a warning

*Found by the 2026-08-31 methodology review (web research + code cross-check).
Recorded, not fixed.*

`METHODOLOGY.md` calls the 10 PM day end a soft boundary and says a late finish
"produces a warning with estimated finish time, not a scheduling failure"
(Inputs, Warning-Level Rules, Appendix A timing table). The runtime disagrees –
a phase that would end past `dayHardEnd` fails with `SAME_DAY_VIOLATION` at
ERROR severity (`src/engine/concurrentScheduler.ts:920-928`), and two failed
attempts permanently unschedule the event. Reality sides with the doc's warning
model: AFM documents a tournament that ["ended at
1am"](https://academyoffencingmasters.com/blog/passing-time-during-long-fencing-tournaments-with-intention/),
and a USA Fencing referee-POV piece has a referee working "until about
midnight." A real bout committee runs late rather than dropping the event, so
every overrun the engine converts to an unscheduled event is a false
infeasibility. Candidate fix: let terminal phases place past `dayHardEnd` with
a WARN-severity bottleneck carrying the estimated finish, reserving failure
for events that cannot start at all.

## Runtime failure is terminal – day assignment never re-colors

*Found by the 2026-08-31 methodology review. Recorded, not fixed.*

Phase 4 (day coloring) picks days with capacity heuristics, Phase 5 (concurrent
scheduler) discovers infeasibility, and the only recourse is one retry from
8 AM on the *same* day, then `DEADLINE_BREACH_UNRESOLVABLE` and a permanent
drop (`src/engine/concurrentScheduler.ts`, Two-Attempt Retry). There is no path
that returns a failed event to day assignment for re-coloring onto another day
– the move a human scheduler makes first. This is the amplifier under several
recorded empty-board defects (see "Team events block their whole tournament"
above for the BINDING variant of the same all-or-nothing shape). A bounded
repair loop – re-color the failed event with its failed day excluded, capped at
one pass – would convert permanent drops into placements at the cost of a
second coloring round.

## Vet co-day serialization is unsourced and never fit-checked

*Found by the 2026-08-31 methodology review. Recorded, not fixed.*

Two stacked problems with the Veteran Age-Group Co-Day Rule:

- **The strict end-to-end serialization has no policy source.** Web research
  found no USA Fencing rule requiring it – the one reference found describes
  2026 NAC vet events "scheduled on the same day with different start times,"
  which is a staggered-start model, not `younger.pools.ready =
  older.last_phase.end + ADMIN_GAP_MINS` (`applyCrossEventEdges`,
  `src/engine/concurrentScheduler.ts`). The methodology's own rationale – a
  VET80 fencer finishes their primary event before a nested event starts –
  requires only a start offset for the younger event, not full serialization
  behind the older event's DE tail.
- **Nothing validates the serialized chain fits a day.** Single-Day Fit
  (`src/engine/validation.ts:71-301`) checks single events and ind/team pairs
  only. Five age-banded vet events serialized end-to-end with admin gaps can
  exceed the day, and day assignment will still emit that co-day – the runtime
  then fails events with no repair path (see previous entry).

Relaxing the edge to a staggered-start offset shrinks the chain enough that
the missing fit check may become moot – measure against the vet-bearing
templates (`NAC Vet/Div1/Junior`) before adding a chain validator.

## Policy tables are stale against USA Fencing 2025-26 changes

*Found by the 2026-08-31 methodology review (policy research against
usafencing.org). Recorded, not applied.*

USA Fencing is mid-restructure and several encoded policies no longer match
published rules:

- **Div 1 cut**: the doc and `DEFAULT_CUT_BY_CATEGORY` say 20% cut (80%
  advance). The 2025-26 published standard is **75% advance (25% cut)** with a
  single round of pools everywhere
  ([Division I Format Update for 2025-26](https://www.usafencing.org/news)).
  The 20% figure belongs to a different mechanism – the new 315-entrant NAC
  cap for Div1/Junior/Cadet, sized so 315 entries produce a 256 DE tableau
  ([Event Restructure Update, June 2025](https://www.usafencing.org/news)).
- **Flighting trigger**: the old entries-based two-pool-round rule was
  eliminated for 2025-26. The engine's strip-budget trigger is closer to real
  practice (flighting as the release valve when strips/refs are short), but
  the "max two flights" cap and fixed `FLIGHT_BUFFER_MINS` cadence conflict
  with observed practice – uneven 1.5-2 hour flight gaps
  ([AFM on double-flighted events](https://academyoffencingmasters.com/blog/how-to-make-double-flighted-events-work-for-you/)).
- **Tiered video replay is uncorroborated**: USA Fencing's public pages
  describe a flat "R16 onward" rule at NACs. The doc's R16/R8/R4-by-category
  table has no source found in either direction, and the per-category video
  logic built on it should be treated as provisional.
- **2 refs/pool default is unverified**: no source states a per-pool referee
  count, and the default doubles reported staffing versus 1/pool. One usable
  sanity bound exists: the Referee Commission Chair estimated **150-180
  refs/day** at a NAC
  ([FencingParents, 2020](https://www.fencingparents.org/suggestions-for-us-fencing/2020/2/23/fencing-parents-need-to-up-their-game-according-to-referee-commission-chair)).
- **A 2026-27 overhaul is announced** (single national points list, Elite vs
  National split at 168 entries), so these tables will go stale again.

The durable fix is the one already on this backlog – promote policy tables
(cuts, video rounds, flighting caps) into the per-season configuration file
described under "Global settings," rather than chasing each season in
`constants.ts`.

## METHODOLOGY.md internal contradictions

*Found by the 2026-08-31 methodology review. Doc-only fixes.*

- **DIV1↔CADET is listed as both hard and soft.** The hard-constraint section
  lists it under "always different days at NACs" while Soft Preferences gives
  it penalty 5.0. The code says soft (`src/engine/constants.ts:453,472`) –
  the hard-constraint bullet should move.
- **Flighting text conflicts with itself.** The Flighting section says Flight
  A/B start/end times are not tracked, while Runtime Decomposition says the
  concurrent scheduler decomposes them into two timed phase nodes. The former
  predates Phase D and should be rewritten.
- **Day-end severity wording** ("soft boundary", warning-level Same-Day
  Completion) contradicts the runtime's ERROR-severity `SAME_DAY_VIOLATION` –
  resolve whichever way the day-end overrun entry above lands, but the doc and
  engine should say the same thing.
## The sabre referee row can light no blocks at all

*Surfaced by 004's US4 T067 on 2026-09-01, restoring the singular branch of the
scorecard's highlight announcement. Recorded, not fixed — the repair is a
referee-model change, and US4 does not open one.*

On B1, hovering `refs:peak-sabre` announces **"Peak sabre referees: 0 blocks
highlighted"** while the row itself reads 64. FR-029 says hovering a metric MUST
highlight the blocks driving it, and here it highlights nothing.

The cause is documented at `src/store/derived.ts:409-414` and is a missing
field, not a bug in the selector. `RefRequirementsByDay` carries no
sabre-specific peak time: `src/engine/refs.ts:97-99` sweeps the **total** demand
for `peak_time` and sweeps sabre separately for the value, so the sabre row's
day and its instant come from two different sweeps. `selectScorecardMetrics`
uses that row's own `peak_time` as the closest instant available — the
alternative, the total peak day's time, would light blocks on a day whose sabre
peak is not the number being reported. On B1 after T061a's re-pack the sabre
maximum of 64 is reached on days 0, 1 and 3, the first is day 0, and day 0's
total `peak_time` is 480, a minute at which no sabre block on that day is open.

The approximation has been in place since the metric was written. B1 is the
first fixture where it visibly fails, and
`__tests__/components/workbench/Scorecard.test.tsx` now pins the 0 as an
expected string — which is the moment it stops being noticed. Closing it means
`refs.ts` recording a per-weapon peak instant alongside the per-weapon value, so
the row can name the blocks that actually produce its number.

## The drift ledger's factory does not apply the store's per-type resolutions

*Measured by 004's US4 T063a on 2026-09-01, when the app-path parity pins were
re-measured. Unassigned and unnumbered — it needs a spec directory when it is
picked up. It is the sole remaining owner of the last two FR-004a parity
exceptions, so it is not optional cleanup: `appPathParity.test.ts` names it in
B6's and B8's `closedBy`.*

`__tests__/helpers/scenarios.ts`'s `buildCompetitions` derives `cut_mode` and
`de_mode` **per event**, from the catalogue's category and video policy. Since
004's US4 the store derives them **per tournament type** — `REGIONAL_CUT_OVERRIDES`
in `buildConfig.ts`, and the per-type table in
[`specs/004-p3-workbench-shell/data-model.md`](../../specs/004-p3-workbench-shell/data-model.md)
(`AUTO` → `STAGED` at NAC, `SINGLE_STAGE` elsewhere; two referees per pool at
NAC/SJCC/SYC, one elsewhere). The two paths now apply different rules, not the
same rule at different stages, which is why no number can be tuned to close the
gap. Measured field by field:

| Field | Store, after US4 | Ledger factory | Events differing (B6 / B8) |
|---|---|---|---:|
| `cut_mode` / `cut_value` | regional all-advance override at ROC/RYC/RJCC | 20% cut by category | 18 / 0 |
| `de_mode` | per-type table | `STAGED` when individual and video REQUIRED | 12 / 41 |
| `ref_policy` | resolved `ONE` / `TWO` | unresolved `AUTO` | 54 / 53 |

Adopting the store's rules in the factory would move the drift ledger's own
recorded counts — B6 44 → 39 and B8 52 → 53 on the evidence of T063a's swap
runs — so it is a **constitution III change to the ledger's own baseline**, and
it needs its own snapshot review rather than a fixture edit. That is exactly
why 004 US4 did not do it: `scenarios.ts` is the comparison point its own drift
gate (T062) diffs against, and moving the baseline inside the story measuring
against it would have destroyed the measurement.

Two cautions for whoever picks it up:

- **`ref_policy` is inert on placement but not on referee demand.** `AUTO` and
  `TWO` both score two refs per pool (`src/engine/pools.ts:170-175`), so
  swapping it moves no scheduled count — but it is why B6's referee columns
  stay apart from the ledger's after US4
  ([`drift-baseline.md` §T062](../../specs/004-p3-workbench-shell/drift-baseline.md)).
- **The factory's independence from the store is deliberate.** 008's
  [research.md D2](../../specs/008-team-event-cut/research.md) argues it, and it
  is what let the parity check find the team-event bug at all. Converging the
  *rules* is not the same as having the factory call the store's helpers, and
  the argument against the latter still stands.

## Rail rebuild

*Assigned to feature 007 on 2026-08-31 (unspecced), after 004 closes.*

The five section components re-homed unmodified into the rail
(`TournamentSetup`, `StripSetup`, `CompetitionMatrix`, `FencerCounts`,
`CompetitionOverrides`) are the surviving wizard/kitchen-sink-era debris:
`CompetitionMatrix` overflows at 320px, day-time selects truncate, and the
top bar and rail both edit tournament type, days, and strips (the
FR-003/FR-004 duplication S2 recorded). User directive 2026-08-31: replace
with purpose-built workbench panels, no preservation effort — tests
re-target to the new panels as they are built, no 005-style triage pass.
Detail in [reassessment-2026-08-31.md §3.5](./reassessment-2026-08-31.md).

## Per-type defaults in the rail's Advanced panel

*Assigned to P3 on 2026-08-29. Specified in
[`specs/004-p3-workbench-shell/`](../../specs/004-p3-workbench-shell/spec.md).
P3 builds the rail, so the Advanced panel is its deliverable rather than a
second pass over it.*

Defaults the Advanced panel should apply when the user picks a tournament type,
shown as dim text on the collapsed panel so they are visible without expanding:

- Referee count: 2 for NAC, SJCC, SYC. 1 for all others.
- Video strips: required for certain NAC events, default count 8. Optional
  elsewhere, user enables and sets the count.
- DE mode: staged for NAC, single-stage for all others.

Separate from the "gears" global-settings surface below. Hard policies (for
example, no Vet Team and Vet Individual on the same day) are not adjustable
here – the user overrides those by placing events manually and accepting the
warning.

## The Advanced panel re-implements the engine's referees-per-pool factor

*Raised by 004's US4 T068 React review on 2026-09-01. Unassigned and
unnumbered — it needs a spec directory when it is picked up, because the fix
edits `src/engine/`.*

`AdvancedPanel.tsx`'s `refereesPerPool` returns `policy === RefPolicy.ONE ? 1 :
2`, a second copy of the factor `peakPoolRefDemand` scales its demand by
(`src/engine/refs.ts:22`). The number the panel states as the type's applied
default and the number the engine schedules against are therefore two
independent answers, and the copy in the UI is invisible to the B1–B8 drift
ledger — a change to the engine's factor moves every scenario's referee columns
and leaves the panel stating the old value with a green suite.

The fix is to export the factor from `src/engine/refs.ts` and have the panel
read it. That edits the engine, so constitution III makes it a gated change with
its own snapshot review, which is why T068 recorded it here rather than making
it. Note that swapping it changes no *scheduled* count today — both `AUTO` and
`TWO` already score two refs per pool — so the review is over the referee
columns, not the placement counts.

## Global settings

*Split on 2026-08-29. The gears control and a first panel are assigned to P3 –
[`specs/004-p3-workbench-shell/`](../../specs/004-p3-workbench-shell/spec.md).
The remainder, described below, stays unassigned and is revisited after P5.*

All engine constants become a configuration file with defaults, reachable from
a gears control in the top bar. Per-event and global weights, penalties, and
earliest-start offsets are all editable. Serialization persists only the
overrides, so unset values continue to track the defaults in `constants.ts`.

**What P3 took**: the top-bar gears control and a panel over three settings –
`ADMIN_GAP_MINS`, `FLIGHT_BUFFER_MINS` and `DEFAULT_DE_STRIP_FOOTPRINT` – plus
`PoolDurationSettings` from 002, which is the precedent for the default /
override / reset / overrides-only-persistence pattern and moved behind the same
gears surface. It intended to take seven, and the four it did not are now the
entry below. All seven still travel through the store, `buildConfig` and the
share URL; only three have an editing surface.

**What stays here**: promoting the rest of `constants.ts` – per-event and global
weights, the penalty matrices, category start preferences, earliest-start
offsets – into a user-editable configuration file. That is a feature of its own
size and it needs a spec directory when it is picked up, after P5.

`video_stage_mode` arrives with P5, not P1.

## Four settings the engine cannot yet act on

*Unassigned and unnumbered. Blocks the return of four gears rows, and needs its
own spec directory: the fix edits `src/engine/`, so constitution III puts it
behind the B1–B8 drift ledger.*

004's US5 built nine gears rows and shipped three. T078 measured each candidate
by changing it and re-deriving: `SLOT_MINS` 5→30, `YOUTH_VET_BOUT_DELTA` −5→−60,
`DE_BOUT_DURATION.FOIL` 20→60 and `THRESHOLD_MINS` 10→600 each produced a
**byte-identical `ScheduleResult`**. FR-046 requires a setting to move the
schedule, and an organizer must not be shown a control that silently does
nothing, so the rows were cut rather than shipped with a caveat. The keys keep
their store, `buildConfig`, serialization and engine-threading support – that
work is the seam this entry builds on, and it is tested and behaviour-preserving.

`SettingsPanel.tsx`'s `NotSurfacedKey` union is the list, and the compile-time
exhaustiveness check beside it means a new `GlobalOverrides` key cannot reach
the store without either a row or a reasoned entry here.

What each key would take, smallest first:

- **`SLOT_MINS` – mechanical.** `config.SLOT_MINS` is read nowhere; the only
  slot consumer is `snapToSlot` (`src/engine/resources.ts`), which takes one
  argument and closes over the module constant. Give it a slot parameter and
  thread `config.SLOT_MINS` through its 10 call sites – `de.ts` ×1,
  `concurrentScheduler.ts` ×4, `derive.ts` ×5, counted 2026-09-01;
  `resources.ts` only defines it. No design decision, but every scheduled time
  is snapped, so the drift review is the real work.
- **`DE_BOUT_DURATION` and `YOUTH_VET_BOUT_DELTA` for individual events – design
  work.** `DE_BOUT_DURATION` is read once, at `capacity.ts:132`, inside the
  `EventType.TEAM` branch, and it genuinely drives team day-assignment
  estimates today – it is only inert on an individual-only tournament.
  Individual DE duration instead comes from the table-driven
  `config.de_duration_table`, and per-bout duration is not in that path at all.
  `YOUTH_VET_BOUT_DELTA`'s only reader, `perBoutDuration` (`de.ts:148`), has no
  caller in `src/`. Making either act on individual events means deciding how a
  per-bout duration and a per-round duration table compose – whether the table
  derives from bout duration, or the delta adjusts the table – which is a
  modelling decision before it is a code change.
- **`THRESHOLD_MINS` – no smallest change exists.** Nothing in `src/engine/`
  reads it. `flighting.ts` decides by pool count against `strips_total`, never
  by minutes. The open question is not how to wire it up but whether a
  minutes-based flighting threshold should exist at all; if the answer is no,
  the key leaves `GlobalOverrides` instead of gaining a row.

## Save / load / share browser plumbing

*Specified and cut from
[`specs/005-consolidate-domain-logic/`](../../specs/005-consolidate-domain-logic/spec.md)
on 2026-08-30. Unassigned.*

`SaveLoadShare.tsx` defines its save, load, and share handlers inline: a blob
built and downloaded through a synthetic anchor, a `FileReader` read, a share
URL assembled from `window.location`, a clipboard write, and a 2KB size
threshold. None of it is layout, but all of it is reachable only by rendering
the component, which is why its cases sat in `KitchenSinkPage.test.tsx` and had
to be re-homed rather than pointed at a module.

The serialization underneath is already extracted and already carries 76 tests
in `__tests__/store/serialization.test.ts`. What is left is the browser
plumbing wrapped around it.

Cut from 005 because `SaveLoadShare.tsx` survives 004's T020 deletion – it is
re-homed into the workbench top bar intact – so nothing breaks without the
extraction, and doing it there would have traded a test dependency on one
layout for a dependency on another. Worth picking up when the top bar is
settled and the trade is no longer circular.

## Youth-event pool duration calibration

B4 currently predicts 5–6 hours for Y8/Y10 events that finish in 2–3 hours in
reality. Recalibrate `pool_round_duration_table`, or add a youth-event
multiplier, once there is evidence about whether the gap closes by
densification or genuinely needs duration recalibration.

P1's US2 widens this gap – removing double-stripping raises the duration of any
event whose pool round is a single pool of 8 or more by about 1.67×. Task T037 in
[`specs/001-p1-foundations/tasks.md`](../../specs/001-p1-foundations/tasks.md)
records B4's affected durations before and after, so the recalibration starts
from a measured number rather than a re-derived one.

## Configurable pool round durations

Specified and implemented in
[`specs/002-configurable-pool-durations/`](../../specs/002-configurable-pool-durations/) –
[research.md D4](../../specs/002-configurable-pool-durations/research.md)
records how the table widens so the per-category dimension the youth
calibration (above) may add lands in the same table rather than a second
override system.

## Calibration debt

- `CAPACITY_TARGET_FILL` re-tune: done, in
  [`specs/003-p2-derived-state/`](../../specs/003-p2-derived-state/) –
  [research.md D8](../../specs/003-p2-derived-state/research.md) records the
  measured sweep. 0.3 stands – the sweep was non-discriminating, a structural
  finding rather than a tie. See D8 for the re-tune's precondition.
- Integration-test floors: done, re-baselined in
  [`specs/003-p2-derived-state/`](../../specs/003-p2-derived-state/) –
  [research.md D7](../../specs/003-p2-derived-state/research.md) records the
  measured counts B1–B8 now assert against.
- New candidate: a drift scenario with `days_available` set above the
  chromatic number, so a future `CAPACITY_TARGET_FILL` re-tune has a scenario
  the current B1–B8 set lacks – see research D8's correction for why none of
  today's scenarios can discriminate the constant.
