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

> **2026-09-01 update**: the file is split. Everything down to the `# Closed`
> divider is open work; below it are finished features, kept only as a pointer
> plus what each one deliberately did *not* fix. Scan the top half for what
> needs doing, read the bottom half before reopening ground a closed feature
> already covered.

## `Bottleneck` has no structured field for a second subject

*Found by 010's test-quality review of T010 (R7), 2026-09-05. Recorded, not
fixed — `types.ts` is out of this feature's scope.*

`Bottleneck` (`src/engine/types.ts:354-362`) carries a single `competition_id`
plus a free-text `message`, with no field for a second subject. R7's
hard-edge-violation bottlenecks (010 T010,
[`specs/010-wave-1-reconciliation/`](../../specs/010-wave-1-reconciliation/))
are the first producer that genuinely needs two — FR-003 requires naming both
competitions in a violated pair — and with no structured place to put the
second one, the consumer test in
`__tests__/engine/concurrentScheduler.test.ts` ("one WARN
UNAVOIDABLE_CROSSOVER_CONFLICT bottleneck per hard-edged pair") can only assert
`bn.message.includes(a) && bn.message.includes(b)`, which is message-text
coupling this feature's own rules otherwise prohibit. `ValidationError`
(`types.ts`) already solves this with `subjects: string[]`; `Bottleneck` has no
equivalent.

The test's coupling is the best available option against today's interface,
not a test-authoring gap — the cause is the production type, not the
assertion. Fixing it means giving `Bottleneck` a `subjects: string[]` field
mirroring `ValidationError`'s and updating every bottleneck producer to fill
it, which ripples wider than this feature's one-file-per-item scope and needs
its own review.

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

*Measured by 004's S6 on 2026-09-01, re-measured by S8 after US4 landed the
per-type defaults. Recorded, not fixed — the store-side path is the one the UI
shows.*

For B1, `refs:peak-total` and the scheduler's own `ref_requirements_by_day`
agree exactly on days 0, 1 and 3 (**160, 182, 194** both ways) and diverge on
**day 2 only**: the store reads **164**, the engine **156**. The store path is
always the higher of the two.

S6's earlier reading of 220 store / 212 engine on day 0 was pre-US4 and no
longer holds — US4's per-type defaults moved the numbers and moved the
divergence off day 0 entirely. The divergence itself did not close, only
relocated, so the reconciliation below is still open.

The two numbers come from two different demand models:

- `buildRefDemandByDay` (`src/store/derived.ts:160`) sums referee demand **per
  placed event**, so two events overlapping in time add their strips together
  whether or not the day has the strips to run them concurrently.
- `computePostScheduleRefDemand` (`src/engine/concurrentScheduler.ts:1200`)
  measures each window with `peakConcurrentStrips`, which **clamps** to the
  strips actually concurrent in that window.

On a day that is not saturated the two agree by construction, which is why only
the saturated day moves. Neither is wrong for its own purpose — the store's is
an upper bound on referees a day could need, the engine's is what the schedule it
produced actually demands — but the app shows one number and the scheduler
reasons with the other, so an organizer staffing from the drawer staffs above
the schedule's own requirement. Worth reconciling when the referee model is next
opened; until then the divergence is bounded, one-directional, and confined to
saturated days.

## DE prelims gets a sliver of its bracket's time, not its bout share

*Found by the product owner on 2026-09-02 in the live app. Recorded, not
fixed — the fix edits `src/engine/`, so it sits behind constitution III's
B1–B8 drift-ledger review, and needs its own spec directory when picked up.*

A Veteran Combined Men's Saber Individual event with a bracket of 64 showed a
**DE prelims** block of **5 minutes** across 16 strips.

`deBlockDurations` (`src/engine/de.ts:63-77`) splits `totalDeDuration` between
the DE_PRELIMS and DE_ROUND_OF_16 phases — the only two `dePhasesForBracket`
returns once `bracketSize >= 64` (`de.ts:44-49`) — by bout count:

```
totalBouts   = bracketSize / 2
r16Bouts     = min(30, totalBouts - 1)
prelimsBouts = max(totalBouts - 30 - 1, 0)
```

`totalBouts` is meant to stand for every scheduled bout in the bracket, but
`bracketSize / 2` only counts the bracket's first round. The literal `30` is a
cumulative count — bouts from the round of 32 down through the semifinals,
stop-at-semis — measured against that first-round-only total. The subtraction
that produces `prelimsBouts` compares two different units.

- **Bracket 64**: `totalBouts = 32`, `r16Bouts = min(30, 31) = 30`,
  `prelimsBouts = max(32-30-1, 0) = 1`. Prelims gets `round(total × 1/32)`,
  about 3% of DE time, which `deStagedPhaseDuration`'s slot-snap floors to one
  5-minute slot — the reported defect. The round of 64 is 32 bouts, the
  largest single round in the event, and it receives one bout's worth of time.
- **Bracket 128**: `totalBouts = 64`, `r16Bouts = min(30, 63) = 30`,
  `prelimsBouts = max(64-30-1, 0) = 33`. Prelims gets 33/64 ≈ 52% of DE time.
  The bracket's true bout share above the round of 32 is 96 of the 126
  stop-at-semis bouts ≈ 76%. Less severe than bracket 64, but wrong in the
  same direction.

Root cause: `totalBouts = bracketSize / 2` counts only the bracket's first
round, while the `30` it is measured against counts a cumulative total from
the round of 32 to the semifinals, so the formula subtracts a running total
from a single round's count.

**Invisible to the B1–B8 drift ledger by construction.** `totalDeDuration` is
conserved across the split — the misallocated share moves from prelims to r16
rather than disappearing — so no scenario's `scheduledCount` drops and no
ledger snapshot cell moves. The damage is confined to where the
prelims/r16 boundary falls inside an event's own DE block: phase durations,
the strip demand each staged block reports, and the referee-peak window it
lands in are all wrong, but nothing the ledger measures notices. This is why
the defect survived all eight 004 drift-ledger scenarios untouched.

Pre-existing, not introduced by 004: `git log --oneline main..HEAD -L
'63,77:src/engine/de.ts'` on `004-us5-gears` is empty. US5's only touch to
`de.ts` was `c7035a6b28`, which threaded `defaultFootprint`, `boutDurations`,
and `youthVetDelta` as parameters into `deStripFootprint` and
`perBoutDuration` — `deBlockDurations` is untouched by that commit, which is
documented BEHAVIOUR-PRESERVING.

## The workbench canvas is not yet a finished surface

*Found by the product owner on 2026-09-02 driving the running app (B1 preset,
80 strips × 4 days). Recorded, not fixed — the product owner's framing is that
the workbench UI itself is not done, not that any one of these three is an
isolated bug.*

### Block encoding is not readable at a glance (SC-004 fails)

`specs/004-p3-workbench-shell/quickstart.md` §What a human has to confirm asks
whether a person can name a block's weapon, gender, age category, and phase
(pools vs DE) without hovering. Verdict: no. Which of the four is
indistinguishable was not narrowed down in this pass — recorded as open rather
than guessed at. The quickstart already predicts the cause it did not confirm:
"sixteen fills across four families is exactly where that fails quietly."

### No affordance that the canvas can be scrolled, and no drag-to-pan

`MatrixCanvas.tsx` keeps the viewport `overflow-hidden` with both scroll
offsets held as view state, so there are no scrollbars. Movement today is
two-finger/wheel scroll (vertical pans rows, horizontal pans time), Cmd/Ctrl+
scroll to zoom, and arrow keys once the canvas has focus. There is no
pointer-drag handler — `onPointerMove` serves tooltip hit-testing only. The
product owner's first instinct was to drag, got no response, and had no
on-screen cue that any other gesture would work.

SC-002 only ever specified "scrolling and zooming" — dragging was never in
scope — so this is a missing affordance, not a regression against a criterion.

### Zooming in destroys the view

The most severe of the three. Reproduction, confirmed twice in the running
app on B1: click the toolbar's **Zoom in** button roughly six times. The
canvas becomes a single flat colour field — the time-axis header (8:00,
9:00, …) disappears, along with gridlines, block boundaries, and every event
label. Nothing on screen indicates position or scale, and there is no way
back except **Fit to day**, which restores the view fully. The cause is not
speculated on here — that is the fixing session's job.

One line that matters for anyone tempted to treat this as already covered:
the live smoke driver passes three consecutive green runs with zero console
errors against this same build, so `scripts/smoke.mjs` has no assertion
covering what the canvas renders after a zoom.

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

## The store's default day count is unsatisfiable for three templates

*Found by the 2026-08-31 methodology review, made visible (not fixed) by 010
T009/T010 (R7), 2026-09-05.*

`docs/design/methodology-reconciliation.md` §1.2.2 calls this "the single most
serious finding in the audit": the DSatur least-bad-color fallback can break a
hard separation and report nothing. 010's baseline measurement
([`specs/010-wave-1-reconciliation/baseline.md`](../../specs/010-wave-1-reconciliation/baseline.md)
§2) adds two facts the audit's table did not have, and 010 T009/T010 made the
break visible going forward without repairing it.

- **The drift ledger's own eight scenarios cannot catch this class of
  defect.** Two independent methods agree: reconstructing every hard-edge pair
  from the returned day map, and V8 statement coverage showing the fallback's
  no-valid-color block executing 0 times across 896 vertex colorings, in
  either coloring phase. B1–B8 have always been blind to an unsatisfiable
  coloring — 010 did not change that, it proved it.
- **`NAC Cadet/Junior` at the store's default 3 days places 6 hard-blocked
  pairs, 0 relaxations, all on day 0.** The six pairs are not the same at
  every strip count, because `colorPenalty`'s load-balancing term reads
  `dayCapacity` (derived from `strips_total`, `src/engine/dayColoring.ts:653`):
  at the app-suggested 39 strips, five are Group 1 CADET↔JUNIOR breaks plus
  one same-population break; at 80 strips / 12 video, all six are Group 1
  CADET↔JUNIOR. Full witness tables: baseline.md §2.
- Per the audit's §1.2.1 clique/chromatic computation, three templates — `NAC
  Cadet/Junior`, `NAC Div1/Junior`, `NAC Vet/Div1/Junior` — carry a K₄ per
  (gender, weapon) and need 4 days. The store defaults to **3**
  (`src/store/store.ts:193`): the default configuration cannot satisfy its own
  hard constraints.

**010 made this visible and did not fix it.** `assignDaysByColoring` now
returns the hard edges its fallback breaks, and `scheduleAllConcurrent` emits
one WARN per pair with cause `UNAVOIDABLE_CROSSOVER_CONFLICT` — the engine no
longer reports a clean schedule when it broke a hard separation to produce
one. The repair is a bounded re-color pass — the audit's Part 3 Option B,
which shares its machinery with §Runtime failure is terminal above — and it
needs the Part 3 decision first. Tracked as the audit's Wave 3.

Record: [`specs/010-wave-1-reconciliation/`](../../specs/010-wave-1-reconciliation/),
[`methodology-reconciliation.md`](./methodology-reconciliation.md) §1.2.2.

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

## METHODOLOGY.md and the engine have diverged, and the doc is the spec

*Assessed 2026-09-01 against `main` at `1c75548cc6`. **Deferred by the product
owner the same day** – recorded here, fixed later. Needs its own spec directory
when picked up, and most of its fixes edit `src/engine/`, so constitution III's
B1–B8 drift review applies.*

**The analysis is done.** It ran on 2026-09-05 and its output is
[`methodology-reconciliation.md`](./methodology-reconciliation.md) – the
verdicted ledger, a satisfiability computation over all ten templates, and the
blocking decision below written up with a recommendation. **Read that first**:
it re-verifies every claim in this entry, corrects two of them, and adds the
finding that day coloring absorbs unsatisfiable hard constraints in silence.
[`methodology-reconciliation-prompt.md`](./methodology-reconciliation-prompt.md)
is the brief it executed, kept for provenance.

**The framing that matters**: `METHODOLOGY.md` was hand-written as the
*specification* for the engine. Where the two disagree, the default is that the
engine is wrong — not that the doc is stale. Any earlier note proposing to
"rewrite the doc to describe what the engine does" (including
[reassessment-2026-09-01.md §5](./reassessment-2026-09-01.md)) predates that
correction and should not be followed as written.

### The pattern: the spec is implemented in code nothing calls

Five places carry a faithful encoding of the documented rule beside a divergent
implementation that actually runs. The doc is not describing a system that never
existed — these rules were built, then bypassed rather than removed.

| Documented rule | Faithful encoding (no reader) | What runs |
|---|---|---|
| Proximity: 1 day bonus, 2 neutral, 3+ penalty | `crossover.ts:176` `proximityPenalty` – all three rows, clamped | `dayColoring.ts:286` `if (dayGap !== 1) continue` – bonus row only |
| Capacity curve: 0 below 0.60, 3.0 at 0.80, 10.0 at 0.95 | `constants.ts:633` `CAPACITY_PENALTY_CURVE` – every documented threshold | `dayColoring.ts:96` hardcodes 0.85 / 3.0 / 10.0, reads only `OVERFLOW_PENALTY` |
| Soft separation DIV1↔CADET 5.0, ↔DIV2 3.0, ↔DIV3 3.0 | `constants.ts:471` `SOFT_SEPARATION_PAIRS` | `crossover.ts:150` returns the crossover-graph weight – 0.8 for DIV1↔CADET, 6× under spec |
| Youth/vet −5 min DE bout delta | `de.ts:148` `perBoutDuration` + `YOUTH_VET_BOUT_DELTA` | no caller |
| Strip count suggestion | `analysis.ts:22` `suggestStripCount` | the store's own `src/store/stripSuggestion.ts`, which under-recommends and empties `ROC Mega` |

This is why the B1–B8 drift ledger never caught any of it: replacing a live
hardcode with the constant it shadows *moves* numbers, so the divergence is
invisible precisely because nobody attempted the fix. Expect a real snapshot
diff on each, and review it rather than accepting it.

### Penalty weights: 5 of 19 are read

Audited by grepping `PENALTY_WEIGHTS.<KEY>` per key on 2026-09-01. Read:
`REST_DAY_VIOLATION`, `PROXIMITY_1_DAY`, `TEAM_BEFORE_INDIVIDUAL`,
`INDIV_TEAM_DAY_AFTER`, `INDIV_TEAM_2_PLUS_DAYS`. The other fourteen split
three ways, and the split is what decides the size of the work:

- **Three are cheap engine fixes with no architectural blocker.**
  `PROXIMITY_3_PLUS_DAYS`, `WEAPON_BALANCE`,
  `CROSS_WEAPON_SAME_DEMOGRAPHIC_VET` are all pure day-level properties that day
  coloring has every input to compute. `PROXIMITY_3_PLUS_DAYS` is the starkest –
  `PROXIMITY_1_DAY` is applied three lines above the guard that skips it.
- **Eight need a decision, and it is the one blocking question.**
  `SAME_TIME_HIGH_CROSSOVER`, `SAME_TIME_LOW_CROSSOVER`,
  `INDIV_TEAM_SAME_TIME_OR_WRONG_ORDER`, `INDIV_TEAM_GAP_UNDER_MIN`, the three
  `EARLY_START_*`, and `Y10_NON_FIRST_SLOT` are all phrased in the doc as
  time-of-day rules ("both starting at 8:00 AM", "within 30 minutes"). Day
  assignment picks days before any time exists, and the concurrent scheduler
  that picks times allocates greedily rather than minimising penalties. **They
  fell into the seam when Phase D split one scheduler into two.** Options,
  ascending cost: score them in the concurrent scheduler where times are known;
  add a bounded re-color pass against realised times (which would share
  machinery with §Runtime failure is terminal); or retire them from the doc as
  Phase D casualties. **Nothing should be specced until this is answered** – it
  decides whether this is a doc feature with three engine fixes or a scheduler
  change with a full drift review.
- **Three need referee demand earlier than it is computed.** The
  `LAST_DAY_REF_SHORTAGE_*` trio. Referee demand is a post-schedule output
  today.

### Where the doc is likely the wrong one

Three cases argue against "conform the engine", and each has evidence:

- **Capacity penalty curve.** `dayColoring.ts:90-94` records that the
  documented 0.60-start curve "over-steered events in mid-loaded days and caused
  regressions in large multi-day tournaments". That is a tried-and-rejected
  experiment, not drift, and the doc should record the rejection.
- **Constraint relaxation levels 1–2.** The doc specifies four levels over a
  penalty-minimising assigner. DSatur guarantees hard constraints structurally,
  so dropping a *soft* penalty cannot unblock anything – soft edges never block
  a color. Levels 1–2 are not unimplemented, they are inapplicable to a coloring
  algorithm. Only level 3 exists (`dayColoring.ts:560`). Either the doc changes,
  or DSatur was the wrong architecture, and that question sits underneath it.
- **Tiered video replay table (R16/R8/R4 by category).** §Policy tables are
  stale below already records that USA Fencing publishes a flat "R16 onward"
  and that no source was found in either direction. Conforming the engine to an
  uncorroborated table would encode a guess. Every staged event splits at
  `DE_ROUND_OF_16` today.

### The doc also contradicts itself

*Found by the 2026-08-31 methodology review, folded in here on 2026-09-01 so
methodology divergences have one home. Doc-only fixes — no engine change, and
no blocking decision.*

- **DIV1↔CADET is listed as both hard and soft.** The hard-constraint section
  lists it under "always different days at NACs" while Soft Preferences gives
  it penalty 5.0. The code says soft (`constants.ts:453,472`) – the
  hard-constraint bullet should move. Note this is entangled with the soft
  separation row in the table above: the doc's own soft value (5.0) is not the
  one applied (0.8), so fixing the hard/soft listing does not settle the number.
- **Flighting text conflicts with itself.** The Flighting section says Flight
  A/B start/end times are not tracked, while Runtime Decomposition says the
  concurrent scheduler decomposes them into two timed phase nodes. The former
  predates Phase D and should be rewritten.
- **Day-end severity wording** ("soft boundary", warning-level Same-Day
  Completion) contradicts the runtime's ERROR-severity `SAME_DAY_VIOLATION` –
  resolve whichever way §Day-end overrun lands, but the doc and engine should
  say the same thing.

### Also outstanding, unverdicted

`MORNING_WAVE_WINDOW_MINS` and §Video Strip Preservation (`resources.ts:217-222`
implements two rules, not the documented window and single-event-day
exception); `validateSameDayCompletion`, whose WARN the runtime emits as an
`SAME_DAY_VIOLATION` ERROR (§Day-end overrun below is the same finding from the
other side); §Within-Day Age-Descending Order, which names `sequenceEventsForDay`
and `vetAgeOrderingKey` in the unreachable `daySequencing.ts` while the live rule
is `applyCrossEventEdges` – **that file is deliberately still in the tree**, see
§Dead code held back below; the Inputs section's stale day-count, video-strip and
refs-per-pool claims; and the intro, which describes P4 drag-and-drop in the
present tense.

## Dead code held back from the 2026-09-01 sweep

*The sweep deleted `ScheduleView.tsx`, `RefRequirementsReport.tsx`,
`ui/checkbox.tsx` and `ui/tabs.tsx` with their tests. Two things were left in
the tree on purpose.*

- **`src/engine/daySequencing.ts`** is unreachable — nothing imports it and
  `concurrentScheduler.ts:1119` names it only in a comment — but deleting it
  means editing `METHODOLOGY.md` §Within-Day Age-Descending Order, which names
  its `sequenceEventsForDay` and `vetAgeOrderingKey` as the implementation. That
  is methodology work, and it is deferred. It also is not yet confirmed that the
  *rule* survived Phase D rather than only its implementation, so deleting the
  file now would discard the evidence for answering that. `saberPileupPenalty`
  in the sibling `dayAssignment.ts` is live (`dayColoring.ts:40`) and documented
  (§Saber Pileup) – that file stays regardless.
- **Every unused *export*** flagged by `fallow dead-code --production` stays.
  The list is mostly the faithful-but-dead implementations tabulated above, and
  deleting them would destroy the evidence that the engine once matched its
  spec. `src/tools/asciiLaneRenderer.ts` also stays – it is test-only by design
  (`integration.test.ts` renders lanes with it), so `--production` is right to
  flag it and wrong to delete it.

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

*Assigned to feature 007 on 2026-08-31 (unspecced). **007 was superseded on
2026-09-01 by 009 simple workbench** –
[reassessment-2026-09-01.md §7](./reassessment-2026-09-01.md). The directive
below still stands and 009 carries it; what changed is the target. 007 replaced
the five re-homed components with five purpose-built panels, which preserved the
duplication, and 009 rebuilds the rail as two panels with one home per setting.*

The five section components re-homed unmodified into the rail
(`TournamentSetup`, `StripSetup`, `CompetitionMatrix`, `FencerCounts`,
`CompetitionOverrides`) are the surviving wizard/kitchen-sink-era debris:
`CompetitionMatrix` overflows at 320px, day-time selects truncate, and the
top bar and rail both edit tournament type, days, and strips (the
FR-003/FR-004 duplication S2 recorded). User directive 2026-08-31: replace
with purpose-built workbench panels, no preservation effort — tests
re-target to the new panels as they are built, no 005-style triage pass.
Detail in [reassessment-2026-08-31.md §3.5](./reassessment-2026-08-31.md).

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

*Split on 2026-08-29. The gears control and a first panel were delivered by 004
US5 – [`specs/004-p3-workbench-shell/`](../../specs/004-p3-workbench-shell/spec.md).
The remainder, described below, is **unassigned and needs a spec**. It was
parked "after P5" at the split; that was re-homed on 2026-09-01, since P5 is
itself deferred with no owner and "after P5" therefore meant never. Nothing is
queued behind it and nothing blocks it — it needs a spec directory and a
decision to start.*

All engine constants become a configuration file with defaults, reachable from
a gears control in the top bar. Per-event and global weights, penalties, and
earliest-start offsets are all editable. Serialization persists only the
overrides, so unset values continue to track the defaults in `constants.ts`.

**What P3 took**: the top-bar gears control and a panel over two settings –
`ADMIN_GAP_MINS` and `FLIGHT_BUFFER_MINS` – plus `PoolDurationSettings` from
002, which is the precedent for the default / override / reset /
overrides-only-persistence pattern and moved behind the same gears surface. It
intended to take seven, and the five it did not are now the entry below. All
seven still travel through the store, `buildConfig` and the share URL; only two
have an editing surface. `DEFAULT_DE_STRIP_FOOTPRINT` shipped a row briefly and
was withdrawn in the same commit that cut the other four – see the entry below
for why moving the schedule was not enough to keep it.

**What stays here**: promoting the rest of `constants.ts` – per-event and global
weights, the penalty matrices, category start preferences, earliest-start
offsets – into a user-editable configuration file. That is a feature of its own
size and it needs a spec directory when it is picked up.

**One dependency worth naming**: several of those weights are the subject of
§METHODOLOGY.md and the engine have diverged, which found fourteen of nineteen
`PENALTY_WEIGHTS` unread. Promoting a constant to a user-editable setting before
deciding whether the engine should read it at all would ship a control that
silently does nothing – the exact defect US5 withdrew five rows to avoid. That
reconciliation comes first.

`video_stage_mode` is P5's, and P5 is deferred with no owner.

## A what-if scenario mode, not more settings rows

*Reframed 2026-09-01 by the product owner, rejecting this entry's earlier
"teach the engine to read these five settings" framing. Unassigned and
unnumbered – needs its own spec directory, and sits behind the B1–B8 drift
ledger because it edits `src/engine/` (constitution III).*

004's US5 built nine gears rows and shipped three, then withdrew one of those
three – `DEFAULT_DE_STRIP_FOOTPRINT` – in the same commit, leaving two. The
five withdrawn keys are not organizer settings with an incomplete engine
reader. They are **hypotheses about how the tournament would run differently**,
and the settings panel is the wrong shape for that regardless of whether the
engine is wired up to read them:

- **`SLOT_MINS` (scheduling grid resolution)** is an implementation artifact,
  not a domain parameter – it controls how finely the scheduler rounds times,
  not anything about the tournament. It arguably belongs in no user-facing
  panel under any design, settings or otherwise.
- **`YOUTH_VET_BOUT_DELTA` (youth/vet bout adjustment)** is not an organizer's
  choice to make. USA Fencing's rules give Y8/Y10 and veteran categories fewer
  touches per bout (`constants.ts:79-80`), so this delta is a rule the engine
  should apply correctly, not a knob to turn. A what-if tool can still ask "what
  if this rule were different" as a hypothesis, but a settings panel implies an
  organizer is allowed to opt out of the rule as it stands today, and they are not.
- **`DE_BOUT_DURATION` (per-weapon DE bout duration)** is a measured average,
  not a policy – it includes the 5-minute strip-changeover overhead, which is
  why sabre is 15 minutes rather than the pure fencing time (`constants.ts:72-73`).
  Retuning it is a calibration exercise against real data, not a per-tournament
  organizer preference.
- **`THRESHOLD_MINS` (flighting threshold)** has zero readers anywhere in
  `src/engine/` and looks vestigial – `flighting.ts` decides whether to flight
  an event by counting pools against `strips_total`, never by minutes. This
  reads as a parameter left over from a design flighting no longer uses, not a
  hypothesis worth modelling. The open question is whether it should exist in
  `GlobalOverrides` at all, not how to wire it up.
- **`DEFAULT_DE_STRIP_FOOTPRINT` (DE strip footprint)** is the hardest case and
  the reason this whole entry is a what-if feature rather than a settings
  feature. See below – it is not merely inert like the other four, and any
  scenario tool inherits its constraint.

**The calibration coupling is a hard constraint, not a detail.**
`DEFAULT_DE_STRIP_FOOTPRINT` (`constants.ts:68-70`) and
`DEFAULT_DE_DURATION_TABLE` (`config.de_duration_table`) are calibrated
against each other – the table's empirical per-round durations were measured
at the footprint's default value, and the comment at the constant says so.
Moving the footprint without re-deriving the table does not fail loudly and
does not do nothing: it produces a **confidently wrong number** on a model
that was never validated at the new value. T069 measured this directly – an
override from 16 to 4 moved a fixture's `de_duration_actual` from 233 to 116,
a schedule roughly half as long, computed entirely from durations only ever
valid at 16. This is exactly why the footprint's row was cut in this same
commit rather than kept as "at least it moves the schedule" (FR-046's literal
bar) – a control that silently does nothing costs an afternoon of a confused
organizer; one that silently produces a plausible wrong schedule costs a
tournament day. Any what-if tool that lets an organizer move the footprint
must re-derive or interpolate the duration table alongside it, or it inherits
this exact defect with a friendlier UI around it.

**Measured evidence**, all from re-deriving a fixture after changing one
constant: `SLOT_MINS` 5→30, `YOUTH_VET_BOUT_DELTA` −5→−60, `DE_BOUT_DURATION.FOIL`
20→60 and `THRESHOLD_MINS` 10→600 each produced a byte-identical
`ScheduleResult`. `DEFAULT_DE_STRIP_FOOTPRINT` 16→4 did move the schedule –
`de_duration_actual` 233→116 – off a duration table calibrated only at 16.

**What the destination looks like**: a scenario / what-if mode, not a settings
panel – an organizer picks a hypothesis ("what if épée bouts ran faster"),
the engine re-derives a schedule from it, and the result is compared against
the committed schedule and labelled hypothetical throughout its display so it
can never be mistaken for a plan. This is a different feature shape than
`SettingsPanel`'s default/override/revert pattern, which presents a value as
something the organizer's own tournament genuinely uses.

`SettingsPanel.tsx`'s `NotSurfacedKey` union is the list of what stays out of
the gears panel, and the compile-time exhaustiveness check beside it means a
new `GlobalOverrides` key cannot reach the store without either a row or a
reasoned entry there. All five keys keep their store, `buildConfig`,
serialization and engine-threading support regardless of which of them a
scenario feature ends up using – that work is tested and behaviour-preserving.

Mechanical path for whoever picks up `SLOT_MINS`, since it is the one purely
mechanical piece here: `config.SLOT_MINS` is read nowhere today; the only slot
consumer is `snapToSlot` (`src/engine/resources.ts`), which takes no config
and closes over the module constant. Give it a slot parameter and thread
`config.SLOT_MINS` through its **10** call sites, counted 2026-09-01 –
`de.ts` ×1, `concurrentScheduler.ts` ×4, `derive.ts` ×5; `resources.ts` only
defines the function. No design decision is needed for this one, but every
scheduled time is snapped, so the drift review is the real work regardless of
how mechanical the wiring is.

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

## Calibration debt

One item open. The two closed ones – the `CAPACITY_TARGET_FILL` re-tune and the
integration-test floors, both done in 003 – are under
[§Closed](#calibration-debt-closed-items).

- A drift scenario with `days_available` set above the chromatic number, so a
  future `CAPACITY_TARGET_FILL` re-tune has a scenario the current B1–B8 set
  lacks – see
  [research D8](../../specs/003-p2-derived-state/research.md)'s correction for
  why none of today's scenarios can discriminate the constant.

## The suggested strip count is sufficient, not minimal

*Found by 011, 2026-09-06, and measured across all ten templates. Not fixed
there – FR-005 scoped the rule to the busiest day's summed demand and it does
that correctly. **This is the highest-value open item in the strip-suggestion
area.***

011 made the **Suggest** button size for the busiest day rather than the largest
single event, and every one of the ten templates now places 100% of its events
at its suggested count. The number is arithmetically right and, at the top end,
not actionable: nothing in the rule searches for the *smallest* count that fills
the board, and the gap between sufficient and minimal is large.

**On eight of the ten templates, 80 strips place exactly what the suggested
count places.** The suggestion buys events on two templates only – +21 on
`NAC Vet/Div1/Junior` for +277 strips, and +2 on `NAC Youth` for +178. A venue
told it needs 357 strips is being asked to more than quadruple a floor that
already schedules 45 of 66. The small regionals (30, 49, 72, 100) read as
plausible venue plans; the large NACs (179–357) read as a theoretical ceiling.

The per-template table is
[`specs/011-feasibility-and-strip-suggestion/handoff.md`](../../specs/011-feasibility-and-strip-suggestion/handoff.md)
§7 finding 2, which also holds the three options and why they are ordered as
they are: a minimal-sufficient bisection (best answer, most expensive, and it
must be a *second* number because FR-009 forbids this rule depending on a
scheduling result), reporting both figures side by side (cheapest honest
option), or a confidence band (weakest – it says the answer is uncertain without
saying what to do).

**Whoever takes this re-measures at `days_available` = 4 first** – see the next
item.

**Closed by 012 (2026-09-06)**: the search returns the smallest count that
places every event; 268 → 85 on the largest template
([`specs/012-actionable-strip-suggestion/handoff.md`](../../specs/012-actionable-strip-suggestion/handoff.md)
§2).

## `baseline.md`'s suggested strip counts are days=3; the app runs at days=4

*Found by 011's T013 against the running app, 2026-09-06. Recorded, not fixed –
the harness's day count is what makes 010's and 011's tables comparable.*

010's and 011's ten-template harnesses both force `setDays(3)`. The app boots at
**4 days** and `applyTemplate` never touches `days_available`. The old
suggestion rule was a function of the largest event alone and never read day
count, so the harness and the app agreed by accident. The rule 011 shipped reads
`days_available` by design (FR-005), so they no longer agree:

| Template | days=3 (`baseline.md` §5) | **days=4 (what a user sees)** |
|---|---:|---:|
| NAC Youth | 258 | **197** |
| NAC Cadet/Junior | 192 | **144** |
| ROC Div1A/Vet | 30 | **23** |

Both are the rule working correctly at different day counts, and the placed
counts hold at days=4. The hazard is quotation: `baseline.md` §5's suggested
column is the most quotable table in that feature and it is **not** the number
the product shows. Anyone sizing a follow-up against 258 is sizing it against a
harness constant.

**012 measured everything at days=4**;
[`specs/012-actionable-strip-suggestion/baseline.md`](../../specs/012-actionable-strip-suggestion/baseline.md)
supersedes 011's §5 for the suggestion.

## B4's app path places 18 where the drift ledger places 17

*Found by 011's T006, 2026-09-05. Recorded, not reconciled, by product-owner
direction.*

Two code paths over the same scenario disagree by one event. The divergence is
**not new** – it was masked for as long as both paths read 0, and 011's
demotion of `feasibility-strip-hours` made it visible rather than creating it.
It is recorded in `__tests__/store/appPathParity.test.ts` as an FR-004a
exception whose `cause` is marked **unconfirmed**.

Measured: `validateConfig` on the *ledger's* B4 config returns twelve WARN
`regional-cut-override` findings, because B4 is an SYC and `buildConfig.ts:196`
applies `REGIONAL_CUT_OVERRIDES` for Y14 and Cadet while the ledger's factory
(`scenarios.ts:50-52`) cuts at 20%. That is the same seam
[§The drift ledger's factory does not apply the store's per-type resolutions](#the-drift-ledgers-factory-does-not-apply-the-stores-per-type-resolutions)
already documents for B6 and B8. **Not** run: the swap-one-default isolation
that would prove those twelve events account for the one-event gap.

The exception's `closedBy` names that existing item as the owner *with the
caveat that B4's attribution to it is unconfirmed*. Whoever takes it runs B4's
isolation first – if `cut_mode` does not account for the +1, this needs its own
owner and that `closedBy` is wrong.

## A test comment described its own fixture wrongly, and hid what the test proved

*Found by 011's T006, 2026-09-05, in `__tests__/engine/concurrentScheduler.test.ts`.
The one case was fixed there; the class of defect was not audited for.*

The case's comment claimed "every event here is individually valid (no per-event
finding fires)". `[M]` `validateConfig` on that fixture returns **three ERROR
`resource-precondition-strips`**, one per event. The claim was false before 011
touched anything: the test passed because it asserted a feasibility ERROR and
then an empty board, and the three per-event ERRORs delivered the empty board
independently of feasibility. It sat in a describe block titled "a global
finding still empties the whole schedule" while proving nothing of the sort.

A test comment that describes a fixture wrongly is worse than no comment – it is
what the next reader reasons from, and it is invisible to a green suite. 011
fixed this one and split the case into the two halves it could never separate.
**Nothing audited the rest of the suite for the same defect**, and there is no
cheap way to: it needs someone to re-measure fixtures against the claims their
comments make.

## `stripBudget.ts` and `analysis.ts` are a mutual import

*Introduced deliberately by 011's T011, 2026-09-05, and recorded in a comment at
the import site.*

`analysis.ts` imports `computeStripCap` from `stripBudget.ts`, and T011's
delegation of `recommendStripCount` to `suggestStripCount` made the dependency
mutual. **Safe today**: both sides are hoisted function declarations used only
when called, never at module-evaluation time, so neither module observes the
other half-initialized. The alternative was a second copy of the suggestion
rule, which is the exact defect FR-008 exists to remove, so the cycle was the
right call.

It is fragile in a specific, silent way: the day either module gains a top-level
`const` that calls into the other, one of them evaluates against `undefined` and
the failure appears at import time in an unrelated test. The fix is a third leaf
module holding the shared arithmetic. Worth doing opportunistically the next
time either file needs real work – not as a feature of its own.

**Closed by 012 T011** (`b5e0600efc`): `recommendStripCount` deleted,
`stripBudget.ts` no longer imports `analysis.ts`.

## The post-schedule strip recommendation is gated on message text

*Introduced by 011's T005, 2026-09-05, as the only option against today's
`Bottleneck` interface.*

`postScheduleDiagnostics`'s gate (`concurrentScheduler.ts:1457`) tells the
demoted feasibility finding apart by
`message.startsWith('RESOURCE_INSUFFICIENT')`, because `Bottleneck` carries no
rule id – `ValidationError` has one and it is dropped when the finding is pushed
at `:212`.

**It is safe as written**, and the reason is worth stating: 011's FR-001 and
FR-002 pin that message text as unchanged, and `grep` confirms no other
validation message starts with that prefix, so a WARN from any other
notice-kind rule pushed with the same cause still leaves the gate closed. What
it is not is *robust* – reword the message and the "Strips: need N, have M" INFO
silently stops appearing on exactly the boards it exists for.

This is the same root cause as
[§`Bottleneck` has no structured field for a second subject](#bottleneck-has-no-structured-field-for-a-second-subject):
`Bottleneck` needs a rule id, or `subjects`, or both. Two features have now had
to couple to message text for want of one.

**012 removed the number from the finding**; the gate on the
`RESOURCE_INSUFFICIENT` prefix remains (`concurrentScheduler.ts`,
`postScheduleDiagnostics`). Still open.

## Per-event entry caps are not modelled

*Raised 2026-09-06 during 012's brainstorming, as one of the demand-side levers
an organizer reaches for before renting more rooms.*

Nothing in the store, engine, or UI lets an organizer cap entries for one event.
`MAX_FENCERS = 500` (`src/engine/constants.ts:91`) is a structural sanity bound
enforced by `validation.ts:151` – it rejects an impossible `fencer_count`, it
does not express a planning decision.

This matters because capping is the lever that shrinks demand rather than adding
supply. A lower `fencer_count` cuts the event's pool count, which cuts both the
aggregate strip-hours `validateFeasibility` measures and the busiest-day pool sum
`suggestStripCount` measures. Every other lever the app can name – more days,
flighting, more strips – adds capacity. This one removes work, and organizers use
it: USA Fencing itself capped NAC Div1/Junior/Cadet at 315 entries for 2025-26
(see [§Policy tables are stale against USA Fencing 2025-26
changes](#policy-tables-are-stale-against-usa-fencing-2025-26-changes)).

**What it needs**: a per-event cap field alongside `fencer_count`, carried
through `buildConfig.ts`, serialization, and the shared-URL round trip, with the
scheduler reading the capped count. The cap belongs to the organizer – the engine
must never apply one on its own, because capping turns away entrants and that is
never a scheduling decision.

**Cost if ignored**: the app can name capping in advice prose but cannot let an
organizer try it and see the result, so the one lever that reduces the problem is
the one lever the tool cannot model.

012 named this as a lever (FR-014) in the post-schedule finding and did not
model it. Still open.

## The 2026-27 Elite/National split is unmodelled, and it bites where 315 does not

*Raised 2026-09-06 during 012's brainstorming. Distinct from the stale-policy
item above: that one records tables that are already wrong, this one records a
restructure that has not taken effect yet.*

USA Fencing has announced a 2026-27 overhaul splitting NAC events into Elite and
National tiers at **168 entries**, alongside a single national points list
(recorded under [§Policy tables are stale against USA Fencing 2025-26
changes](#policy-tables-are-stale-against-usa-fencing-2025-26-changes)). The
engine models neither tier.

The reason to record it separately is a measured one. The **2025-26 315-entrant
cap does not bite on this app's own defaults** – the largest entry in
`NAC_FENCER_DEFAULTS` (`constants.ts:209`) is Div1 Men's Epee at 310, then 270,
270, 260, 260, 260. Not one event reaches 315, so implementing that cap would
change no template. **A 168 threshold bites nearly every one of them**: 310, 270,
270, 260, 260, 260, 250, 220, 210, 210, 210, 200, 180 all clear it. Whatever the
split does to format, seeding, or scheduling, it applies to most of a NAC's
board, not to an exceptional event or two.

**What it needs**: research first, then a model. The published detail found so far
is the 168 threshold and the single points list; how the two tiers differ in
rounds, cuts, or DE structure is not yet established, and the app should not
encode a guess.

**Cost if ignored**: the ten NAC templates keep describing a season structure
that no longer exists, and every number measured against them – drift ledger
floors included – describes a tournament USA Fencing has stopped running.

## An experimental mode for engine rules the product should not show

*Raised and deferred 2026-09-06 during 012's brainstorming. Deferred
deliberately – it is worth building only after the core engine is right and has
been refactored to accept custom logic.*

012 removes the simultaneous-pools strip sizing from the product, because a
venue sized so every pool of the busiest day runs at once is a tournament nobody
runs – it returned 197 and 268 strips on templates that need 76 and 96. The
arithmetic is not wrong, it answers a question no organizer asks.

The idea recorded here is a switch that lets a rule like that be reachable
anyway, for exploring engine behaviour rather than for planning a tournament.
**It was considered for 012 and rejected there**, on four grounds worth keeping
so the next session does not relitigate them:

1. A mode is config, and constitution Principle I requires every result be
   reproducible from its config alone – so the flag enters `buildConfig.ts`,
   serialization, the shared URL, and the drift ledger, and each grows a branch.
2. No user was nameable who would switch it on, nor a decision it would inform.
3. "Disables guards like this one" has no boundary, so every later guard has to
   argue about whether it belongs inside.
4. The busiest-day figure is better kept as a *named internal upper bound* – you
   provably never need more – than as a user-visible mode. A search that needs a
   ceiling can use it without the product ever printing it.

**The precondition for revisiting**: the engine is extensible with pluggable
rules. At that point this stops being a boolean bolted onto config and becomes
rule selection, which is the shape it should have had. Until then a dev tool – a
probe, a test, a URL parameter that never ships – covers the same need at no
cost to the product surface.

## Hand-placed events are never checked against the crossover constraint graph

*Found 2026-09-06 during 012's brainstorming, by grep. This is the largest gap
between the workbench as built and the workbench as described.*

The engine models demographic crossover properly – `crossover.ts` computes a
penalty between any two competitions, `constraintGraph.ts` turns those into
weighted edges, and `dayColoring.ts` reads `hardEdgeDegree` when it assigns days.
That machinery is what stops Cadet and Junior Men's Foil landing on one day when
the auto-scheduler runs.

**None of it is reachable from a hand placement.** `grep` over `src/store` and
`src/components` returns no reference to `constraintGraph.ts`, `crossover.ts`, or
`hardEdgeDegree`. `selectDerivedFindings` recomputes from placements – so a
hand-edited placement does re-validate – but what it recomputes is
`validateConfig`, which checks fencer counts, strips, refs and dependencies. It
has no notion of two events being wrong *together on a day*.

The consequence is asymmetric and easy to miss: press **Auto-schedule all** and
the crossover rules are enforced. Drag the same two events onto the same day by
hand and the app says nothing. `TopBar.tsx:103` disables the auto-schedule button
on hard errors, which makes the app look like it is guarding placements when the
guard covers only configuration.

**What it needs**: a derived selector that evaluates the current placements
against the constraint graph and emits a finding per violated hard edge, wired
into the same findings surface `validateConfig` already feeds, so a manual
placement and an auto placement are judged by one rule set. `Bottleneck`'s
missing second subject
([§`Bottleneck` has no structured field for a second subject](#bottleneck-has-no-structured-field-for-a-second-subject))
is in the way – a violated edge names two competitions and there is nowhere
structured to put the second.

**Cost if ignored**: the drag-drop half of the product silently permits exactly
the schedule USA Fencing rules forbid, and the organizer finds out at the
tournament. It also makes the two halves of the app disagree about what is legal,
which is worse than either rule alone.

012 recorded this in its handoff §8 as something it did not fix. Still open.

## Templates are invented numbers, not a real season

*Raised 2026-09-06 during 012's brainstorming as a product requirement.*

`TEMPLATE_FENCER_DEFAULTS` (`catalogue.ts:270`) maps all five NAC templates to one
`NAC_FENCER_DEFAULTS` table and all five regional templates to one
`REGIONAL_FENCER_DEFAULTS` table (`constants.ts:209`, `:307`). The counts are
round numbers – 310, 270, 260, 250 – described in their own comment as "rounded
to the nearest 10". They are plausible, and they are not any actual event.

The requirement is that a user can load **a real USA Fencing 2026-27 event** –
an actual NAC or ROC as scheduled – and adjust it, rather than a synthetic
average. Entry counts would be estimated per event from comparable events across
the previous three seasons.

**The hard part is data, not code.** The template mechanism already exists and
takes a table per template; pointing it at real numbers is mechanical. Finding
three seasons of per-event entry counts is not, and no source for them has been
identified. Until one is, this cannot be scoped. Note also that every number this
project has measured – the drift ledger floors, `baseline.md`, 012's minimums –
is measured against these synthetic tables, so replacing them moves every
recorded figure at once.

Related: [§The 2026-27 Elite/National split is
unmodelled](#the-2026-27-elitenational-split-is-unmodelled-and-it-bites-where-315-does-not),
which is the format half of the same season change.

**Cost if ignored**: organizers plan against a tournament shape nobody ran, and
the app's credibility rests on numbers it invented.

## Changing a parameter should re-run the engine, with a working indicator

*Raised 2026-09-06 during 012's brainstorming.*

Today the engine runs only when **Auto-schedule all** is pressed
(`TopBar.tsx:103`) or on boot (`boot.ts:41`). Changing strips or days updates the
config and leaves the schedule stale until the organizer presses the button
again. The desired behaviour is that adjusting a parameter re-runs the engine, so
the loop is adjust-and-see rather than adjust-and-remember-to-press.

Three things the implementation has to get right, all of them measured or
observed rather than assumed:

- **Most re-runs need no indicator at all.** One `scheduleAll` is 0.6ms on a
  small regional and 7-12ms on the 66-event NAC template `[M]` 2026-09-06. Those
  never approach a second. Only a search-backed action – 012's strip suggestion
  scan, ~350ms estimated worst case – gets anywhere near it.
- **"Show a modal if it takes more than a second" cannot be implemented as
  stated**, because the duration is not knowable before the run. The workable
  form is show-after-delay: start the run, reveal the indicator if it is still
  going after a fixed threshold, so fast runs never flash it.
- **A re-run on every keystroke will thrash.** A number field emits a change per
  digit, and 80 typed one digit at a time is three runs, two of them against
  nonsense values. Needs debouncing or commit-on-blur.

**Cost if ignored**: either the schedule is quietly stale after a parameter
change – the failure this replaces – or the app re-runs constantly and flickers
an indicator at values the organizer never meant to enter.

## Adding strips can place fewer events

*Measured 2026-09-06 by 012's baseline sweep. Design note with the mechanism,
the literature and the fix options:
[`strip-count-scheduling-anomaly.md`](./strip-count-scheduling-anomaly.md).*

`[M]` On four of the ten templates at four days, some strip count above the
smallest working one places fewer events than it does – NAC Vet/Div1/Junior
places all 66 at 85 strips and 65 at 86, and does not hold all 66 at every
count until 96. The engine is a greedy list scheduler and this is Graham's
multiprocessing timing anomaly (1966, 1969), a known property of the algorithm
class rather than a defect in one line. The strip count reaches the packer only
through the two `floor(strips_total × pct)` caps at
`concurrentScheduler.ts:466` and `:958-966`.

012's **Suggest** search is safe against it by construction: it scans upward
and returns the first count that places every event. What it cannot protect is
an organizer who books one strip more than the count it wrote, or who edits the
field by hand.

**Cost if ignored**: on a non-monotone board, a hand edit or a venue that rents
strips in pairs can drop an event from the board with no explanation, and it
will be reported as a bug. The design note has the answer to that report and
four fix options with their costs. None is scheduled.

012 measured this (`baseline.md` §1a) and did not fix it. Still open.

---

# Closed

Everything above this line is open. Everything below is done, and is kept for
one reason only: what each feature **deliberately did not fix**, so a later
session does not rediscover it. Each entry is a pointer to the feature record
plus that list. The narrative lives in the linked spec directory, not here.

## NAC Youth suggests 63 in the smoke driver's accumulated state and 66 from a fresh store

*Diagnosed 2026-09-06, not a defect. Record: the NAC Youth step's comment in
[`scripts/smoke.mjs`](../../scripts/smoke.mjs); the original probe is
[`specs/012-actionable-strip-suggestion/handoff.md`](../../specs/012-actionable-strip-suggestion/handoff.md)
§7(c).*

`[M]` The cause: the driver's gears-panel step changes Admin gap 30 → 15,
reverts it to 30, then re-applies 15 so the override carries through the
share link – and nothing after that restores it. `applyTemplate` keeps that
override across the NAC Youth switch the same way it keeps `days_available`,
`strips_total`, `video_strips_total`, and `tournament_type`.

A probe (`tmp/probe-nac-youth-gap.test.ts`, deleted) replayed the driver's
store actions and swapped one field at a time: `ADMIN_GAP_MINS` alone moved
the answer 63 ↔ 66 in both directions, while `strips_total`, `strips`, and
`video_strips_total` were inert. The search's floor and ceiling were
identical on both paths at 53/197, and all 24 competitions were
byte-identical.

Verdict: not a defect. A gears-panel override is a tournament-wide setting
the organizer chose, and a template switch keeping it follows the same rule
that keeps days, strips, type, and video strips.

The original entry's description of this as "Admin-gap 30→15→reverted" was
wrong – the driver re-applies 15 at `scripts/smoke.mjs:677` and never
restores it.

## R5 and L5 — the app refused to schedule at its own recommendation

*Feature 011, done 2026-09-06. Closes the audit's **R5** and **L5**.*

Record:
[`specs/011-feasibility-and-strip-suggestion/`](../../specs/011-feasibility-and-strip-suggestion/),
built against
[`methodology-reconciliation.md`](./methodology-reconciliation.md) §1.3 R5 and
§2.1 L5. `baseline.md` there holds every number and `handoff.md` the record.

Two defects that were two halves of one failure – the app recommended a strip
count and then refused to schedule at it.

- **R5** (`feasibility-strip-hours` demoted ERROR → WARN) — both feasibility
  rules became notice-kind, WARN in every validation mode, rule id, field and
  message text unchanged, and `validateConfig`'s mode re-derivation deleted with
  them. No board is returned empty on an aggregate estimate any more. Drift:
  **B4 0 → 17**, its floor raised to 17 in the same commit; the other seven
  scenarios byte-identical.
- **L5** (the suggestion sizes for the busiest day, not the largest event) —
  three implementations collapsed to one pure function in `src/engine/`, reached
  from the store through `buildConfig`. Drift: no scheduled count moved;
  `stripRecommendation` moved on all eight (B1 57→135, B2 57→189, B3 50→182,
  B4 37→190, B5 23→73, B6 23→165, B7 58→207, B8 48→147), which is what
  `max` → `sum` must do.

**All ten templates now place 100% of their events at their suggested strip
count.** The five that rendered a blank board: `NAC Youth` 0→24 of 24,
`NAC Cadet/Junior` 0→24, `NAC Vet/Div1/Junior` 0→66, `ROC Mega` 0→42,
`Junior Olympics` 0→18. Confirmed live: `NAC Youth` at 197 suggested strips
places 24 of 24 in the browser, SMOKE PASS twice with 0 console errors.

**What 011 deliberately did not fix:**

- **The `DEADLINE_BREACH` shortfall.** Several templates placed fewer events
  than they have on deadline warnings alone, with no ERROR. It disappears from
  the suggested column after L5 – but only because the new strip counts are
  large enough that no event loses its race against the day's end. **The cause
  is untouched.** Give any of those templates a realistic strip count again and
  it returns. Spec §Out of Scope; a separate defect with a separate cause.
- **The feasibility estimate's magnitude.** R5 demoted the finding's severity
  and changed nothing about how it is computed – not the worst-case aggregate
  sum, not the 15% slack band. An estimate that is wrong in magnitude is still
  wrong in magnitude; it merely stops discarding tournaments. It is still shown
  to the user as a warning with a shortfall number in it.
- **Video strip suggestion.** `resolveVideoStrips` still picks a video count by
  tournament type. FR-002 demoted `feasibility-video-strip-hours` alongside its
  sibling, but no rule in 011 recommends a video strip count, and the
  busiest-day rule sizes competition strips only.
- **Double-stripping, in any form.** Never a planned scheduling input. No
  toggle, no ratio, no strip-for-time trade appears anywhere in the feature –
  the rule allocates one strip per pool throughout. Recorded above at
  §Double-stripping.
- **Wave 3's remaining items still wait on Part 3.** R5 was taken out of Wave
  3's order by product-owner direction on 2026-09-05 and nothing else moved with
  it. The eight time-of-day penalty weights are still undecided, and R4, R6, R8,
  R9 and the rest of Waves 2–4 are unbuilt.

**Six things it found and could not fix are open above the divider**: the
suggestion being sufficient rather than minimal (the largest of them), the
days=3 / days=4 harness gap, B4's 18-vs-17 app-path divergence, a test comment
that described its own fixture wrongly, the `stripBudget` ↔ `analysis` import
cycle, and the message-text gate on the strip recommendation.

**Two corrections to its own planning artifacts, recorded because both repeat:**

1. **`research.md` D6 was half wrong.** It claimed US2 could not move the drift
   ledger. True for scheduled counts – B1–B8 supply strip counts as fixture
   literals and nothing consumes the recommendation – and false for the
   snapshot, which records `stripRecommendation`. "The ledger has no reference
   to X" is a claim about the *fixtures*; the digest is a separate surface that
   has to be read separately.
2. **`spec.md` §Tests that invert listed six tests; eleven inverted.** The five
   extra were found by measurement, not by reading, and all five were the same
   "feasibility empties the board" fixture class on files the spec did not name.
   **That table is a merge-gate artifact and it should be built by measurement**
   – make the change on a scratch branch and run the suite, which enumerates the
   list exactly. Reading the codebase for it found 6 of 11.

## Wave 1 of the methodology reconciliation

*Feature 010, done 2026-09-05.*

Record: [`specs/010-wave-1-reconciliation/`](../../specs/010-wave-1-reconciliation/),
built against
[`methodology-reconciliation.md`](./methodology-reconciliation.md) §Recommended
sequence, Wave 1. `baseline.md` there holds every number below.

The seven independent fixes, one commit each:

- **R1** (delete `indiv-team-same-day`) — `NAC Div1/Junior` 0/24 → 24/24 at
  80/12, `NAC Vet/Div1/Junior` 0/66 → 45/66. Drift: nothing moved.
- **R7** (report the fallback's broken hard edges) — one WARN per pair, cause
  `UNAVOIDABLE_CROSSOVER_CONFLICT`. Drift: nothing moved.
- **R2** (scope per-event structural findings to their subjects) — one bad
  event no longer discards the tournament. Drift: nothing moved.
- **R3** (coerce the team cut) — `buildConfig` coerces `cut_mode` to
  `DISABLED`, `cut-on-team` demoted to a notice. Drift: nothing moved.
- **L1** (wire `PROXIMITY_3_PLUS_DAYS`) — day assignments moved on
  B1/B2/B3/B7/B8 with no count lost; B5/B6 byte-identical.
- **L9** (remove the Y8→Y10 penalty) — B6 44 → 45, errors 10 → 9, floor raised
  to 45. Also removed the derived Y8↔Y12 two-hop edge.
- **L3** (apply `SOFT_SEPARATION_PAIRS`) — DIV1↔CADET 0.8 → 5.0, DIV1↔DIV2
  0.0 → 3.0, DIV1↔DIV3 0.0 → 3.0. Drift: nothing moved — see the coverage note
  below.

**What Wave 1 deliberately did not fix:**

- **Part 3 is still open.** The eight time-of-day penalty weights have no
  mechanism, and the Option A/B/C decision on giving them one is the product
  owner's. Wave 1 was built to be unaffected either way —
  [`methodology-reconciliation.md`](./methodology-reconciliation.md) Part 3.
- **Waves 2, 3 and 4 are unbuilt.** §Recommended sequence in that same document
  names them: Wave 2 is documentation-only, Wave 3 needs the Part 3 answer,
  Wave 4 needs its own drift review per item.
- **`feasibility-strip-hours` was the next target — and is now done in 011**
  (§R5 and L5 above; this bullet is kept as Wave 1 wrote it). The product owner
  directed
  on 2026-09-05 that the next session plans the audit's **R5** — demoting it
  from a blocking ERROR to a WARN. It is why four templates still place zero
  at the app-suggested strip count (`NAC Youth`, `NAC Cadet/Junior`,
  `ROC Mega`, `Junior Olympics`) and why `NAC Vet/Div1/Junior` still places
  zero there too (`baseline.md` §3). The audit's **L5** — `suggestStrips`
  recommending one strip per pool of the largest event, ignoring every other
  event on the day — is the cause under that symptom: the app suggests the
  very configuration its own validation gate then refuses.
- **No same-day bonus was added for Y8/Y10.** METHODOLOGY:118 says Y8 "CAN and
  SHOULD" share a day with Y10. L9 removed the penalty, making "CAN" true;
  "SHOULD" would need a weight the specification does not state, and inventing
  one is the habit the audit exists to break (spec.md §Out of Scope).
- **`NAC Youth` places 22 of 24 at 80/12, not 24.** Two events
  (`CDT-W-FOIL-IND`, `Y14-W-FOIL-IND`) go unplaced on `DEADLINE_BREACH`
  warnings with no ERROR. This corrects the audit's §2.1 L5 claim of 24/24 —
  `baseline.md` §6, finding 1.

**Two coverage gaps the drift ledger cannot see, found while building this
feature — these matter more than any single fix, because they say what the
ledger cannot prove:**

1. **B1–B8 never enter the DSatur least-bad-color fallback**, proved by
   day-map reconstruction and by V8 statement coverage showing 0 executions
   across 896 vertex colourings. Already recorded above at §The store's
   default day count is unsatisfiable for three templates — not restated
   here.
2. **L3 moved nothing because the ledger cannot exercise two of its three
   pairs.** DIV1 appears in B1/B2/B7/B8 and DIV2/DIV3 in B3/B6, and those sets
   never intersect, so DIV1↔DIV2 and DIV1↔DIV3 have zero occurrences across
   all eight scenarios — unit-tested only. The third pair, DIV1↔CADET, occurs
   18 times (12 in B2, 6 in B7) and all 18 were already on different days at
   0.8, so raising it to 5.0 only made an already-rejected option more
   expensive. A green ledger is not evidence that L3 is correct.

## Day-axis parity

*Feature 006, done 2026-08-31. Unblocked 004's US3.*

Record: [`specs/006-day-axis-parity/`](../../specs/006-day-axis-parity/). The
finding, repro and isolation numbers are in
[reassessment-2026-08-31.md §2](./reassessment-2026-08-31.md); the store↔engine
axis invariants are
[`contracts/day-axis.md`](../../specs/006-day-axis-parity/contracts/day-axis.md).

**What 006 deliberately did not fix:**

- **Per-day capacity math still uses the `DAY_LENGTH_MINS` constant**, not the
  per-day windows 006 introduced — `dayRemainingCapacity`
  (`src/engine/capacity.ts:211`) and the DSATUR day-assignment loop
  (`src/engine/dayColoring.ts:612`) both compute a day's strip-hour budget as
  `strips_total × DAY_LENGTH_MINS / 60`, a fixed per-day length rather than
  that day's own configured hours. 006's axis fix reconciled where events
  land; it did not touch how much capacity a day is credited with. A
  tournament whose days have unequal lengths is scheduled correctly today only
  because no reference tournament yet discriminates the two — a latent gap, not
  a verified-safe one.
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
  (`concurrentScheduler.ts:902`), which the spy cannot reach. The consequence
  is bounded — an unreached `day` value feeds only the `reason` ternary in
  `findAvailableStripsInWindow`, so no scheduling outcome moves — but a `TIME`
  shortfall could be relabeled `STRIPS` there, manufacturing a spurious
  `STRIP_CONTENTION` bottleneck (`concurrentScheduler.ts:727`) that tells an
  organizer to add strips when the day was the real constraint. Documented in
  the test file's own comment block above the guard's `describe`.

## Team events block their whole tournament

*Found by 006, fixed by feature 008, done 2026-08-31.*

`defaultConfigForId` derived a team competition's cut from
`DEFAULT_CUT_BY_CATEGORY` with no `event_type === TEAM` branch, so a team event
reached the engine carrying a percentage cut, tripped the `cut-on-team` BINDING
error, and one BINDING error discarded the entire tournament's schedule.
Measured: B2 0 → 24, B8 0 → 53. Record:
[`specs/008-team-event-cut/`](../../specs/008-team-event-cut/); B8's residual
gap is [`b8-residual.md`](../../specs/008-team-event-cut/b8-residual.md).

**What 008 deliberately did not fix:**

- **`ROC Mega` also places nothing, and has no team event.** Its cause is a
  strip-hour capacity shortfall reported by `validateConfig` in BINDING mode,
  triggered by `suggestStrips()` under-recommending strips for 42 events – a
  different defect reaching an empty board by the same "one BINDING error
  discards the whole schedule" architecture. Measured in
  [`baseline.md`](../../specs/008-team-event-cut/baseline.md).
- **`NAC Div1/Junior` and `NAC Vet/Div1/Junior` stay at 0**, and 008's fix is
  not implicated — zero `cut-on-team` findings on either. Both are blocked by
  two BINDING errors from `indiv-team-same-day`
  (`src/engine/validation.ts:272-310`), which computes a hypothetical worst
  case — individual total + `INDIV_TEAM_MIN_GAP_MINS` + team total, assuming
  both land on the same day — on the same two Div1 épée pairs, 15 and 20
  minutes over `DAY_LENGTH_MINS` 840. `days_available` appears nowhere in
  `validateTimingConstraints`, so it fires identically on a 1-day and a 5-day
  tournament even though the scheduler is free to separate the pair across
  days. A fix would touch, weakest option last: the rule's severity — it is
  emitted via `policy()` (`validation.ts:299-305`), which maps to ERROR under
  BINDING, and demoting it to `notice()` would let the scheduler place what it
  can, verified at the source; the all-or-nothing gate itself
  (`concurrentScheduler.ts:186-204`) — the finding carries its two implicated
  competitions as `subjects`, so dropping or deferring only those would fix the
  class rather than the instance and would cover `ROC Mega` too, though the
  isolation run never opened `concurrentScheduler.ts` to verify that mechanism;
  or the Div1 épée default fencer counts (`D1-M-EPEE-IND` 310,
  `D1-W-EPEE-IND` 210) — weakest, since it tunes a number to dodge a rule and
  the counts are user-editable. The diagnosis is verified; the outcome of any
  fix is untested.
- **B8's +1 over the ledger stays open**, attributed by isolation to the
  ledger's `de_mode` and `strips_allocated` acting together – neither alone
  moves the count. It belongs with **B4 and B6**, which remain FR-004a
  exceptions.
- **`__tests__/helpers/scenarios.ts`'s copy of the team-event branch is
  deliberate, not debt.** Converging it on the store's helper would make the
  app-path parity check true by construction and destroy the instrument that
  found this bug. Reasoning:
  [research.md D2](../../specs/008-team-event-cut/research.md).

`catalogue.ts:217`'s wrong comment, also recorded here by 008, was fixed on
2026-09-01.

## Per-type defaults in the rail's Advanced panel

*Delivered by 004 US4, 2026-09-01 –
[`specs/004-p3-workbench-shell/`](../../specs/004-p3-workbench-shell/spec.md).*

The six-row table is `src/store/typeDefaults.ts` (`effa7c908e`), the three
per-type resolutions are in `buildConfig.ts` (`9f53379b70`), and
`AdvancedPanel.tsx` shipped with the AUTO marker (`332817d283`). Referees 2 at
NAC/SJCC/SYC and 1 elsewhere, DE mode staged at NAC and single-stage elsewhere,
video strips required for certain NAC events at a default count of 8.

Two open entries above descend from this one: §The Advanced panel re-implements
the engine's referees-per-pool factor, and §The drift ledger's factory does not
apply the store's per-type resolutions.

## Configurable pool round durations

*Delivered by feature 002 –
[`specs/002-configurable-pool-durations/`](../../specs/002-configurable-pool-durations/).*

[research.md D4](../../specs/002-configurable-pool-durations/research.md)
records how the table widens, so the per-category dimension §Youth-event pool
duration calibration may add lands in the same table rather than a second
override system.

## Calibration debt (closed items)

Both delivered by 003 –
[`specs/003-p2-derived-state/`](../../specs/003-p2-derived-state/). The one
open item is §Calibration debt above.

- `CAPACITY_TARGET_FILL` re-tune:
  [research.md D8](../../specs/003-p2-derived-state/research.md) records the
  measured sweep. 0.3 stands – the sweep was non-discriminating, a structural
  finding rather than a tie. **D8 also holds the re-tune's precondition**, which
  is what the open item exists to supply.
- Integration-test floors: re-baselined, with the measured counts B1–B8 now
  assert against in
  [research.md D7](../../specs/003-p2-derived-state/research.md).
