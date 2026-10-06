# Backlog

Work no phase plan has picked up. Items here are not tracked in `specs/` – a
feature directory is created for one only when it is assigned a phase.

> **2026-10-04 plan**: [`competition-planner-workbench.md`](./competition-planner-workbench.md)
> §Roadmap orders the entries needed to finish the product into features
> 014–022 and lists the rest as after-finish work. **This file is the record,
> that table is the index** – do not restate detail there.

> **2026-10-04 update**: pruned. Every entry below is open work. Finished and
> superseded entries, including the former `# Closed` section, were removed –
> git history at `0ab5bd2dc9` preserves them, and each shipped feature's own
> `specs/` handoff records what it deliberately did not fix.

## What 013 deliberately left unfixed

*Recorded by 013 T042, 2026-10-04. Each bullet points at its entry. The roadmap
feature that owns it is in [`competition-planner-workbench.md`](./competition-planner-workbench.md)
§Roadmap.*

- Sequencing onto a pin, and crossover between pins or through Move day (the
  design alignment's E3) –
  [§Auto-assign does not hold an unpinned predecessor before a pinned successor](#auto-assign-does-not-hold-an-unpinned-predecessor-before-a-pinned-successor)
  and
  [§Hand-placed events are never checked against the crossover constraint graph](#hand-placed-events-are-never-checked-against-the-crossover-constraint-graph).
  Feature 016.
- The referee model divergence (E5) –
  [§The scorecard's peak-referee row reads higher than the scheduler's own](#the-scorecards-peak-referee-row-reads-higher-than-the-schedulers-own).
  Feature 016.
- The engine and the store both reporting a pin collision –
  [§The engine and the store both report a pin collision](#the-engine-and-the-store-both-report-a-pin-collision).
  Feature 017.
- The two dead constants and the unwired `daySequencing.ts` –
  [§Dead code held back from the 2026-09-01 sweep](#dead-code-held-back-from-the-2026-09-01-sweep).
  Feature 021.
- The lane-packer overflow, including the two "Unplaced, needs N strips"
  figures for one event –
  [§The canvas calls events unplaced that the engine placed](#the-canvas-calls-events-unplaced-that-the-engine-placed).
  Feature 017.
- Blocks that cannot be selected from the keyboard –
  [§A placed block cannot be selected from the keyboard](#a-placed-block-cannot-be-selected-from-the-keyboard).
  Feature 017.
- The mockup's remaining visual gaps –
  [§The mockup's remaining visual gaps](#the-mockups-remaining-visual-gaps).
- Small text still below WCAG AA –
  [§Small text still below WCAG AA](#small-text-still-below-wcag-aa).

- Team events scheduled with a pool round –
  [§Team events are scheduled with a pool round](#team-events-are-scheduled-with-a-pool-round).
  Feature 023. Came from the T041 print remarks.
- Catalogue ids inside Findings messages –
  [§Findings messages name events by catalogue id](#findings-messages-name-events-by-catalogue-id).
  Came from the T041 print remarks, unscheduled.
- `competitionLabel`'s wording against published schedules –
  [§`competitionLabel` may not match published USA Fencing wording](#competitionlabel-may-not-match-published-usa-fencing-wording).
  Came from the T041 print remarks, an owner wording call.

Fact, not work: `src/store/derived.ts` no longer imports from `components/`
(013 handoff finding 19).

## What 014 deliberately left unfixed

*Recorded by 014, 2026-10-04. 014 gave `Bottleneck` a `rule` and `subjects`
and kept every user-visible surface unchanged.*

- Per-day venue findings that only the message tells apart, two-subject
  findings shown on one block, and sequencing delays that do not name their
  predecessor –
  [§Day-level findings have no structured day](#day-level-findings-have-no-structured-day).
  Unscheduled.
- `validateFlightingGroup` and `validateSameDayCompletion` have no caller in
  `src/` –
  [§Dead code held back from the 2026-09-01 sweep](#dead-code-held-back-from-the-2026-09-01-sweep).
  Feature 021.

## Day-level findings have no structured day

*Found while planning 014, 2026-10-04. Recorded, not fixed – 014 kept every
user-visible surface unchanged.*

014 gave `Bottleneck` a `rule` and `subjects`, and neither carries a day.
Venue findings scoped to one day name no competition, so they share `rule` and
`subjects` (`[]`) and differ only by the day in their message text, for
example `day-pools-exceed-strips` and `day-video-demand-exceeds-video-strips`
from `initialAnalysis`. Two consequences in the Findings panel:

- The Findings panel's bottleneck row id stays
  `analysis:<cause>:<competition_id>:<ordinal>` (`store/derived.ts`, §1.2).
  When one of two same-cause venue warnings disappears, the survivor's ordinal
  drops to 0 and it inherits the other's dismissal.
- These rows show `day: null` and `where: 'Venue'`, so a Day 2 strip warning is
  not tied to Day 2 in the panel or on the canvas.

The scheduler's three `DAY_RESOURCE_SUMMARY` lines (`postScheduleDayBreakdown`)
have the same shape. Scheduler bottlenecks never reach the panel, though,
because `runActions.ts` keeps only placements, so only the ledger's day-summary
check meets them.

The fix is a structured `day` on `Bottleneck`, filled by every day-scoped
producer. The row id must then combine `rule`, `competition_id`, `subjects` and
`day`. `rule` + `subjects` + `day` alone is not unique: `multiple-flighted-same-day`
emits one warning per flighted event on a day, all with the same rule, the same
`subjects` and the same day, and only `competition_id` tells them apart.
Scheduler findings that repeat per phase (`phase-deferred`,
`strip-contention-deferral`, `pinned-phase-unclaimed`) would also need `phase`
if they ever reach the panel. That changes dismissal identity, so it needs its
own decision. The ledger's day-summary
check (`driftLedger.test.ts`, "day peaks match …") could then filter by rule and
day, though the peak value it parses from the message has no structured home
either.

**Two-subject findings show on one block only.** `findingsForBlock`
(`Canvas.tsx`) attaches a bottleneck to the block whose `competition_id`
matches. A finding naming two events, such as `flighting-group-both-video`
(`analysis.ts` pass 5), appears only on its owner's block. Matching on
`subjects` would show it on both, which is a user-visible change.

**Sequencing delays name no predecessor.** A `cross-event-dependency-delay`
bottleneck lists only its owner in `subjects`, because its message does not
name the event it waited for. `predecessorReadyTime` returns a time, not the
predecessor's id.

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
(`specs/010-wave-1-reconciliation/baseline.md` (removed; git show 0ab5bd2dc9:specs/010-wave-1-reconciliation/baseline.md)
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
  CADET↔JUNIOR. Full witness tables: specs/010-wave-1-reconciliation/baseline.md §2 (removed; git show 0ab5bd2dc9:specs/010-wave-1-reconciliation/baseline.md).
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

Record: `specs/010-wave-1-reconciliation/` (removed; git show 0ab5bd2dc9:specs/010-wave-1-reconciliation/),
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

*2026-10-05: the owner kept the Vet co-day as a documented departure from the
manual's adjacent-age-group rule (024). This entry's serialization question
stays open. The edge has never bound – see
[The Vet sibling and individual-to-team edges never hold an event back](#the-vet-sibling-and-individual-to-team-edges-never-hold-an-event-back).
A staggered start keeps B8 whole while strict serialization loses eight events.*

## The Vet sibling and individual-to-team edges never hold an event back

*Found by 024 planning, 2026-10-05. Recorded, not fixed.*

`applyCrossEventEdges` (`src/engine/concurrentScheduler.ts:654–707`) adds two
waits. A younger age-banded Vet sibling waits for the older sibling's last
phase to end, plus `ADMIN_GAP_MINS` (30). A team event on its individual
event's day waits for the individual event's end, plus
`INDIV_TEAM_MIN_GAP_MINS` (120). Neither wait has ever moved an event.

Line numbers in this entry are at main 7975e4efea.

**What happens**: A throwaway probe ran B1–B8 down the factory path and the
app path. B8 is the only scenario with age-banded Vet events. It has 60
sibling pairs the Vet edge should order – six gender-weapon groups, ten pairs
each. All 60 break the rule on both paths. On B8's Men's Epee day, Vet 40, 50,
60 and 70 all start pools in the day's first slot. Vet 80 starts 2 h 25 min
later, after the younger events it should come before. Vet 70 alone runs
6.5 hours. Women's Sabre shows the same pattern. No run emitted a
`CROSS_EVENT_DEPENDENCY_DELAY` bottleneck. The individual-to-team edge had
nothing to act on. No scenario puts a team event on its individual event's
day.

**Why**: Every event's first phase enters the ready queue at day start
(`:841–851`). The loop checks predecessors once, when it picks the node
(`:880`). `predecessorReadyTime` (`:1422–1436`) counts a predecessor only once
its last phase is placed (`:1430`). Otherwise it skips the predecessor and
returns no floor. The older sibling's DE is never placed by the time the
younger sibling's pools are picked, so the younger event starts with no wait.
Nothing puts it back in the queue to check again. The comment at `:833–835`
says the edge "resolves lazily", but nothing ever resolves it. The sort key
METHODOLOGY credits with ordering siblings (`vetAgeOrderingKey` in
`daySequencing.ts`) is unwired – see
[§Dead code held back from the 2026-09-01 sweep](#dead-code-held-back-from-the-2026-09-01-sweep).
That is why Vet 80 can start last.

The individual-to-team edge fails for a different reason. It can never fire.
`findIndividualCounterpart` (`src/engine/crossover.ts:238–250`) matches the
same category, gender and weapon. That pair is a hard same-day block at every
relaxation level (`isSamePopulation`, `crossover.ts:101–114`, returned as
`Infinity` at `:167`). If a pin or Move day ever produced the pair, the edge
would fail the same way the Vet edge does.

**What it needs**: Settle the serialization question in
[§Vet co-day serialization is unsourced and never fit-checked](#vet-co-day-serialization-is-unsourced-and-never-fit-checked)
first. Then make the chosen wait real. Either a node whose predecessor is not
placed yet goes back in the queue until the predecessor's end is known, or the
node gets a floor computed up front. A test must assert the younger sibling's
actual pool start, not that the edge exists. Delete the individual-to-team
edge, or keep it with a comment saying the day rule makes it unreachable.

**How it bears on the serialization entry**: That entry asks whether strict
end-to-end serialization has a source. It also warns that nothing checks the
chain fits a day. In practice the engine has never serialized anything. B8
fits only because its siblings run in parallel. A prototype of all of 024's
rules measured both ways to make the edge real:

- **Bind as written** (younger pools wait for the older event's last phase,
  plus 30 min). B8 drops from 53 to 45 placed. The eight Vet 40 and Vet 50
  épée and foil events are lost, and eight `DEADLINE_BREACH` errors appear.
  Suggest for the NAC Vet/Div1/Junior template finds no strip count (44 of 66
  placed). The cause is five bands of 3–4.5 h each chained end to end.
- **Staggered start** (each younger band's pools are ready 60 min after the
  older band's pool start). B8 keeps 53. Suggest for NAC Vet/Div1/Junior goes
  from 103 to 110 strips. The start order follows age.

Fixing the edge as written trades a silent rule break for lost placements.
A staggered start does not.

**How it bears on 024's regional Group 1 window**: The new window says the
older side's pools start no earlier than day start + 4 hours. Unlike these
edges, it must bind. It is a fixed offset from day start, so it can be a
floor set when the event is queued, like `earliest_start` (`:845–848`). If it
goes through `cross_event_predecessors`, it inherits this defect. 024's tests
should assert the older event's actual pool start. That check would have
caught this defect.

**Cost if ignored**: Every Vet co-day runs all five age bands at once. Nested
eligibility means one fencer often enters more than one band, so those fencers
are double-booked with no finding. METHODOLOGY describes an order and a wait
the engine never applies, which misleads anyone checking the board against
the spec.

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
- **Tiered video replay is settled by the 2026-27 Operations Manual**
  (p.19). It guarantees R16 for Div I, Junior and Cadet, and R8 for every
  other individual category, with the third tier moving from R4 to R8. See
  §The engine's rules predate the 2026-27 Operations Manual (024).
- **2 refs/pool default is unverified**: no source states a per-pool referee
  count, and the default doubles reported staffing versus 1/pool. One usable
  sanity bound exists: the Referee Commission Chair estimated **150-180
  refs/day** at a NAC
  ([FencingParents, 2020](https://www.fencingparents.org/suggestions-for-us-fencing/2020/2/23/fencing-parents-need-to-up-their-game-according-to-referee-commission-chair)).
  The 2026-27 manual gives no count either, and links a separate Referee
  Requirements document instead. The owner left the per-type values as they
  are (2026-10-05).
- **A 2026-27 overhaul is announced** (single national points list, Elite vs
  National split at 168 entries), so these tables will go stale again.
- **RYC regional cut** (owner ruling, 2026-10-05; roadmap 024): at regional
  level, Y14 has no 20% cut by default. `REGIONAL_CUT_TOURNAMENT_TYPES`
  (`constants.ts:586-591`) leaves out RYC, so an RYC's Y14 events cut 20%
  today.
  - The spec contradicts itself. METHODOLOGY.md:377 leaves out RYC and SJCC,
    while :683-694 give RYC/SYC and RJCC/SJCC 100% advancement. 024's first
    task drafts the :377 amendment for the owner's approval.
  - With RYC added, the set equals `REGIONAL_QUALIFIER_TYPES`
    (`constants.ts:525-531`).
  - No B1–B8 scenario is an RYC, so no ledger number moves.
- **Y14 at NACs** (owner ruling, 2026-10-05; roadmap 024): Y14 advances 100%
  at a NAC by default, per the 2024-25 Athlete Handbook, Table 2.16.1 ("Y14
  SYC & NAC: 100% to SE"). The code (`DEFAULT_CUT_BY_CATEGORY`) and
  METHODOLOGY.md:377 cut Y14 20% there. With this ruling and the RYC one
  together, Y14 advances in full at every tournament type the app models, so
  its default becomes all-advance. Its `REGIONAL_CUT_OVERRIDES` entry then
  does nothing. The handbook's 80% applies to the Y14 National Championship,
  which no template models.
  - B2 and B3 hold NAC Y14 events, so this moves the ledger and needs 024's
    drift review against the converged ledger 015 leaves.
  - The :377 amendment is drafted together with the RYC fix.

The durable fix is the one already on this backlog – promote policy tables
(cuts, video rounds, flighting caps) into the per-season configuration file
described under "Global settings," rather than chasing each season in
`constants.ts`.

## The Y8 Developmental Format is not modelled

*Found by 024 planning, 2026-10-05. Recorded, not fixed.*

The 2026-27 Athlete Handbook (p.84) makes the Youth Developmental Format
required for Y8 from 2025-26: two rounds of pools of 5 and 6, "with no direct
elimination." The engine instead runs one pool round and a DE for every Y8
event, with 10-touch DE bouts as a documented departure (METHODOLOGY.md,
Appendix B).

Modelling it needs a second pool round with seeded "shark" and "minnow" pools
and no DE bracket for Y8. If ignored, Y8 events are planned with a DE that does
not happen, so their time and strip use is wrong.

## The engine's rules predate the 2026-27 Operations Manual

*Audited 2026-10-05 against the [USA Fencing Operations Manual
2026-27](https://assets.contentstack.io/v3/assets/blteb7d012fc7ebef7f/blt31ccda29e31349e7/USAF_OPsManual_2026_27.pdf)
("Published August 2026"). The edition before it, from 2019, is the spec's
source S1. Every ruling below is the owner's, made on 2026-10-05. Roadmap
feature 024, after 015.*

The spec and the engine were written against the 2019 manual. The 2026-27
edition changes the planning times and the video rounds, and its scheduling
criteria (p.20) are word-for-word those of 2019. The audit found that the
spec departs from them in places without saying so.

**Spec first.** 024's first task drafts every METHODOLOGY.md amendment below,
each citing its manual page, and updates source S1 to the 2026-27 edition.
No code changes until the owner approves the spec diff.

**Planning times** (p.17, "Average Bout Timing in Minutes": a pool of 7 takes
120 min for foil and épée and 60 for sabre, and a 15-touch bout takes
15 / 15 / 8):

- **Pools follow the manual.** A pool of N takes the pool-of-7 time ×
  bouts(N) ÷ 21. That gives 86 / 86 / 43 min for a pool of 6, and 57 / 57 / 29
  for a pool of 5. It replaces the default `pool_round_duration_table`
  (`constants.ts:114-118`). That table gives foil, épée and sabre
  105 / 120 / 75 for a pool of 6, which `poolDurationForSize`
  (`pools.ts:62-71`) scales to 147 / 168 / 105 for a pool of 7. The table stays user-editable
  and only its default changes. The youth calibration entry below is affected.
- **DE bouts follow the manual plus changeover.** The manual's figures are
  treated as fencing time, with the app's 5-minute strip changeover added:
  20 / 20 / 13 per bout. DE length derives from that, and the empirical
  `de_duration_table` goes. This lifts the design doc's "replacing the
  empirical `de_duration_table`" out-of-scope line.
- **The team match is 60 min for foil and épée and 30 for sabre.** That is
  the figure §Team events (023) needs.
- **Strips and the day.** The default day becomes 9:00–19:00 (today
  8:00–22:00, `constants.ts:45-46`). Suggest takes competitors on the busiest
  day ÷ 14 as its baseline, against about ÷ 5.6 today (`analysis.ts:74-75`).
  A day that finishes after 19:00 raises a warning, which pairs with §Day-end
  overrun (018). 024's plan decides how the ÷ 14 baseline combines with the
  placement search that 011 and 012 built.

**Video** (p.19): replay is guaranteed at NACs for every category.

- From the round of 16: Div I, Junior, Cadet.
- From the round of 8: all other individual categories. The manual prints
  "round of 8" for Div IA, II, III and Vet 40/80/Combined, which 2019 had at
  round of 4, and the owner takes it as printed.
- Teams: gold and bronze only (023).

At NACs every individual category becomes REQUIRED. Today only Cadet, Junior
and Div I are REQUIRED (`constants.ts:184-196`). `VIDEO_STAGE_ROUND`
(`constants.ts:551-556`) gets the round of 8 for the third tier and is wired
into the staged DE. Nothing in `src/` reads it today.

**Same-day rules** (p.20, Groups 1–3):

| Rule | Manual | Ruling |
|---|---|---|
| Div I vs Cadet, same weapon | Group 1, mandatory | **Soft block.** If they must share a day, one runs in the morning and the other in the afternoon, with minimal overlap or one finishing before the other starts. Today it is a soft penalty with no time-of-day rule (`constants.ts:480`), and the spec also lists it as hard (:110-114). |
| Group 1 and gender | "for any one weapon" | **Per weapon and gender**, as the engine applies it today. The spec states this as its reading. |
| Group 1 at regionals | titled "National" | **Soft at ROC, RYC, RJCC, SYC and SJCC**, with the Div I–Cadet treatment. This replaces the spec's unsourced "4+ hours apart" exception (:119-122). Today `crossover.ts:172` blocks at every type. |
| Adjacent age groups | Group 1 | **Y8 with Y10, and the Vet co-day, stay.** The spec documents both as departures from the manual. |
| Div I vs Div IA | not in the manual | **Stays a hard block**, documented as a departure because nearly the same fencers enter both. |
| Junior–Cadet rest day | Group 2, Junior Olympics only | **Junior Olympics only.** It comes out of `REST_DAY_PAIRS` (`constants.ts:516-519`) because no template is a Junior Olympics. Junior–Div I keeps its rest day. |
| First and last day shorter | Group 2 | **Planned, then checked.** Day assignment gives the first and last day less capacity. A warning fires from 3 days up when either isn't shorter. Today it is checked only at 4+ days, and only when longer (`concurrentScheduler.ts:1544, :1588`). |
| Vet vs Div IA, same weapon | Group 2 | New soft separation. |
| Div II vs Div III, same weapon | Group 2 | New soft separation. |
| Y14, Cadet, Junior vs open team, same weapon | Group 2 | New soft separation. |
| Same age group and gender, different weapon | Group 3 | A weak soft preference for every category. It replaces `CROSS_WEAPON_SAME_DEMOGRAPHIC_VET`, which nothing reads. |
| Large foil and sabre starts staggered | Group 2 | **Declined.** Not modelled. |

**Cuts.** The RYC regional cut and Y14 all-advance at NACs (§Policy tables)
move here from 018.

**Not scheduling inputs:**

- Mixed-gender youth events (p.12). The app always plans single-gender events,
  and a merge is an output decision like referee assignment.
- Refs per pool. The manual links a separate Referee Requirements document,
  and the per-type values stay as they are, unsourced.

**Drift.** Pool and DE times move every B1–B8 event, and the video and
same-day rules move placement. 024 is measured against 015's converged ledger,
with one drift review per rule group.

## METHODOLOGY.md and the engine have diverged, and the doc is the spec

*Assessed 2026-09-01 against `main` at `1c75548cc6`, deferred the same day.
**Unblocked 2026-10-04**: the product owner answered the blocking question
below – the eight time-of-day weights are retired from the doc. Roadmap
feature 021. Most of its fixes edit `src/engine/`, so constitution III's B1–B8
drift review applies.*

**The analysis is done.** It ran on 2026-09-05 and its output is
[`methodology-reconciliation.md`](./methodology-reconciliation.md) – the
verdicted ledger, a satisfiability computation over all ten templates, and the
blocking decision below written up with a recommendation. **Read that first**:
it re-verifies every claim in this entry, corrects two of them, and adds the
finding that day coloring absorbs unsatisfiable hard constraints in silence.
`methodology-reconciliation-prompt.md` was the brief it executed (removed; see
git history at 0ab5bd2dc9).

**The framing that matters**: `METHODOLOGY.md` was hand-written as the
*specification* for the engine. Where the two disagree, the default is that the
engine is wrong — not that the doc is stale. Any earlier note proposing to
"rewrite the doc to describe what the engine does" (including
`reassessment-2026-09-01.md` §5, removed; see git history at 0ab5bd2dc9) predates that
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
- **Eight needed a decision – answered 2026-10-04: retire them from the doc
  as Phase D casualties.** That makes this a doc feature with three engine
  fixes, not a scheduler change. The analysis that framed the choice:
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
  Phase D casualties. The owner took the last option.
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
  `DE_ROUND_OF_16` today. **Settled 2026-10-05:** the 2026-27 Operations Manual
  (p.19) sources the tiers, and 024 conforms the engine to them.

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
  **Owner ruling 2026-10-05:** soft, even though the 2026-27 manual makes it
  mandatory (p.20). If the two must share a day, they split morning and
  afternoon (024).
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
- **`SAME_TIME_WINDOW_MINS` and `MAX_RESCHEDULE_ATTEMPTS`** are threaded through
  the config and read by no engine code (013 research D1). Roadmap feature 021
  deletes them with `daySequencing.ts`. Pins are wired into none of the three.
- **Every unused *export*** flagged by `fallow dead-code --production` stays.
  The list is mostly the faithful-but-dead implementations tabulated above, and
  deleting them would destroy the evidence that the engine once matched its
  spec. `src/tools/asciiLaneRenderer.ts` also stays – it is test-only by design
  (`integration.test.ts` renders lanes with it), so `--production` is right to
  flag it and wrong to delete it. 014 found two more of these with no caller in
  `src/`: `validateFlightingGroup` (`flighting.ts`) and
  `validateSameDayCompletion` (`validation.ts`). 014 gave both rule ids and
  subjects, so they stay correct until 021 decides.

## Global settings

*Rewritten 2026-10-04. After-finish work – not on the roadmap's finish line,
needs its own spec directory and a decision to start.*

All engine constants become a configuration file with defaults. Per-event and
global weights, penalties, and earliest-start offsets are all editable.
Serialization persists only the overrides, so unset values continue to track
the defaults in `constants.ts`.

**Where it stands after 013.** 004 US5 built a gears panel over two constants
(`ADMIN_GAP_MINS`, `FLIGHT_BUFFER_MINS`) and carried five more through the
store unreachable. 013 T022 (research D7) deleted the `GlobalOverrides` slice
and the gears surface: `buildConfig.ts` now reads all seven from `constants.ts`
directly, and they no longer travel through the store or the share URL
(`src/store/store.ts:77`). The engine's `TournamentConfig` still carries every
one of them as a field, so an engine reader needs no change when an editing
surface returns. The one constant an organizer can still edit is
`pool_round_duration_table`, in the Strips panel, which keeps the
default / override / reset / overrides-only-persistence pattern this entry
would generalise.

**One dependency worth naming**: many of those weights are the subject of
§METHODOLOGY.md and the engine have diverged, which found fourteen of nineteen
`PENALTY_WEIGHTS` unread. Promoting a constant to a user-editable setting before
the engine reads it ships a control that silently does nothing. Roadmap feature
021 comes first.

`video_stage_mode` belongs to P5 (FLUID), which is deferred with no owner.

## A what-if scenario mode, not more settings rows

*Reframed 2026-09-01 by the product owner, rejecting this entry's earlier
"teach the engine to read these five settings" framing. Rewritten 2026-10-04
after 013 removed the gears panel. After-finish work – needs its own spec
directory, and sits behind the B1–B8 drift ledger because it edits
`src/engine/` (constitution III).*

004's US5 built nine gears rows and shipped three, then withdrew
`DEFAULT_DE_STRIP_FOOTPRINT` in the same commit, leaving two. 013 T022 then
removed the panel and the store slice altogether (§Global settings). The five
withdrawn keys are not organizer settings with an incomplete engine reader.
They are **hypotheses about how the tournament would run differently**, and a
settings panel is the wrong shape for that regardless of whether the engine is
wired up to read them:

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
  `TournamentConfig` at all, not how to wire it up.
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
can never be mistaken for a plan. This is a different feature shape than a
default/override/revert setting, which presents a value as something the
organizer's own tournament genuinely uses.

Since 013 T022 none of the five reaches the store, serialization or the share
URL – `buildConfig.ts` fills them from `constants.ts`. A scenario feature
re-adds whichever it uses as scenario state, never as tournament config, so a
hypothetical value cannot leak into a shared plan.

Mechanical path for whoever picks up `SLOT_MINS`, since it is the one purely
mechanical piece here: `config.SLOT_MINS` is read nowhere today; the only slot
consumer is `snapToSlot` (`src/engine/resources.ts`), which takes no config
and closes over the module constant. Give it a slot parameter and thread
`config.SLOT_MINS` through its **10** call sites, counted 2026-09-01 –
`de.ts` ×1, `concurrentScheduler.ts` ×4, `derive.ts` ×5; `resources.ts` only
defines the function. No design decision is needed for this one, but every
scheduled time is snapped, so the drift review is the real work regardless of
how mechanical the wiring is.

## Youth-event pool duration calibration

*2026-10-05: 024 resets the default pool durations to the 2026-27 Operations
Manual's planning times (p.17), which are shorter than today's. Re-measure B4
after 024 before deciding anything here.*

B4 currently predicts 5–6 hours for Y8/Y10 events that finish in 2–3 hours in
reality. Recalibrate `pool_round_duration_table`, or add a youth-event
multiplier, once there is evidence about whether the gap closes by
densification or genuinely needs duration recalibration.

P1's US2 widens this gap – removing double-stripping raises the duration of any
event whose pool round is a single pool of 8 or more by about 1.67×. Task T037 in
`specs/001-p1-foundations/tasks.md` (removed; git show 0ab5bd2dc9:specs/001-p1-foundations/tasks.md)
records B4's affected durations before and after, so the recalibration starts
from a measured number rather than a re-derived one.

## Calibration debt

One item open. The two closed ones – the `CAPACITY_TARGET_FILL` re-tune and the
integration-test floors, both done in 003 – were removed with the `# Closed`
section (see git history at 0ab5bd2dc9).

- A drift scenario with `days_available` set above the chromatic number, so a
  future `CAPACITY_TARGET_FILL` re-tune has a scenario the current B1–B8 set
  lacks – see
  research D8 (specs/003-p2-derived-state/research.md, removed; git show 0ab5bd2dc9:specs/003-p2-derived-state/research.md)'s correction for
  why none of today's scenarios can discriminate the constant.

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
placement and an auto placement are judged by one rule set. Since 014 a
`Bottleneck` names both competitions of a violated pair in `subjects`, as the
engine's own `hard-separation-violated` finding already does, so the finding
has a structured place for its second subject.

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
project has measured – the drift ledger floors, `baseline.md` (the per-feature baselines, e.g. specs/010-wave-1-reconciliation/baseline.md, removed; git show 0ab5bd2dc9:specs/010-wave-1-reconciliation/baseline.md), 012's minimums –
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

012 measured this (`specs/012-actionable-strip-suggestion/baseline.md` §1a (removed; git show 0ab5bd2dc9:specs/012-actionable-strip-suggestion/baseline.md)) and did not fix it. Still open.

## The canvas calls events unplaced that the engine placed

*Measured by 013 (handoff findings 1 and 9), promoted to an entry 2026-10-04
when the owner set T039's pass condition. Roadmap feature 017.*

On the boot preset (B1, 80 strips) the engine places all 24 events and the
Schedule view shows 24 rows, but the footer reads `19 placed · 5 unplaced ·
0 pinned` and the canvas draws five blocks at strip 0 with the dashed overflow
edge. `assignStripLanes` (`src/layout/lanes.ts:13`) packs each block into the
lowest *contiguous* run of strips, in a fixed order, while the engine only
counts free strips per window. Fragmentation leaves the packer without a run
the engine's count says exists. `selectPlacementCounts` and the Findings
list's Unplaced rows both read the packer, so the first screen of the app
reports five problems that are not real.

**What it needs**: one strip model shared by the engine and the canvas –
either the engine assigns concrete strip ranges the canvas draws, or the
packer may split a block across non-contiguous strips. The first edits
`src/engine/` and needs a drift review. Pass condition: the footer reads
24 / 0 on B1 at 80 strips, and the smoke driver asserts it.

**Cost if ignored**: every organizer's first impression is a board with five
phantom unplaced events and Findings rows they cannot act on.

The same overflow shows one event two different figures (013 handoff finding
33). B1's Div 1 Women's Epee reads "Unplaced, needs 32 strips" in the detail
strip and "needs 16 strips" in the DE-prelims tooltip, each being that phase's
own need under the packer, beside a dock that says "Every event has a slot."
One strip model removes it.

## A placed block cannot be selected from the keyboard

*013 handoff findings 13 and 20. Owner decision 2026-10-04: blocks become
buttons. Roadmap feature 017.*

`Block`'s root is `role="img"` with an `aria-label`, pinned by 013's
`ui-contract.md` §Canvas, and T029 added `onClick` to it. A keyboard or
assistive-technology user can select an unplaced event (the dock's chips are
buttons) and can reach a placed one only through Findings → "Show on grid".
The fix changes the role to `button` in the contract, keeps the accessible
name, adds a visible focus ring, and re-checks the smoke driver's block
locators in the same task.

## Auto-assign does not hold an unpinned predecessor before a pinned successor

*013 research D1 and the engine contract's "not guaranteed" list. Recorded, not
fixed. Same family as the crossover gap in
[§Hand-placed events are never checked against the crossover constraint graph](#hand-placed-events-are-never-checked-against-the-crossover-constraint-graph),
which is the design alignment's E3.*

`applyCrossEventEdges` (`src/engine/concurrentScheduler.ts`, around `:620–671`)
makes a team event wait for its individual counterpart and a Vet sibling wait
for the previous one. A pinned *successor* is committed in the pre-claim pass
before its unpinned predecessor is placed, so the engine does not hold the
predecessor before the pin, and the loop may place it after. Crossover between
two pins, and between a pin and an event moved through Move day, is unchecked
for the same reason.

**What it needs**: `Competition.latest_end` is the mechanism the research names
for expressing "this must finish before that pin". It belongs with roadmap
feature 016, which already owns the crossover check on current placements.

**Cost if ignored**: Auto-assign around pins can return a board where a team
event precedes its individual event or a Vet sibling runs out of order, with no
finding.

## The engine and the store both report a pin collision

*013 handoff finding 25. Recorded, not fixed.*

When a pin cannot claim its strips, the engine emits a `PINNED_UNCLAIMED`
bottleneck (one per phase node, finding 21). The UI never reads it: the Findings
list shows the lane packer's Unplaced row instead (FR-059). The two surfaces
agree on the fixture in finding 22 and nothing checks that they agree in
general, so a pin the engine could not seat and a pin the packer could not seat
can differ.

**What it needs**: one reporter. Feature 017's single strip model is the natural
point, and 014's structured `Bottleneck` makes `PINNED_UNCLAIMED` consumable
without message-text matching.

**Cost if ignored**: the same pin can be reported twice, or by only one surface,
and the organizer cannot tell which to trust.

## The mockup's remaining visual gaps

*013 handoff finding 31, ruled 2026-10-04: these stay out of 013. The gap list
is in the T044 commits.*

- Day-band spans, the overflow stripe, block meta text, the detail strip's pill
  internals, the rail tooltip and the panel title level. Each needs a new
  element, not restyling.
- The mockup's +3 / −6 block inset was applied and reverted. `Block.tsx`'s label
  fit assumes +2 / −4, so adopting the mockup's inset means re-deriving the fit.

**Cost if ignored**: cosmetic. The shell matches the mockup's look and not every
element of it.

## Small text still below WCAG AA

*013 T049 measured this after raising only the panel captions and the canvas's
off-hour ticks, an owner decision. Line numbers as of commit `e8c6f2db90`.*

`neutral-600` `#7a7a7d` is 4.28:1 on white, 4.00 on `--chrome` `#f7f7f9`, 3.83
on `--chrome-soft` `#f2f2f4` and 3.59 on `--chrome-deep` `#eaebee`.
`neutral-500` `#98989b` is 2.88 on white, 2.69 on chrome and 2.41 on
chrome-deep. Ratios are against the nearest known background, not each element's
stacked background.

- `neutral-600` small text: `UnplacedDock.tsx:50` h2 11px (and the p lines at 54
  and 61, 11.5px), `PresetPicker.tsx:58` 10.5px caption, `DetailStrip.tsx:191`
  mono 11px, `FindingsPanel.tsx:49` 12.5px, `FindingsPanel.tsx:86` mono 10.5px,
  `ScheduleOutput.tsx:87` 12.5px, `PoolDurationSettings.tsx:58` and `:62`
  text-xs.
- `neutral-500` small text: `Header.tsx:51` mono 11px on chrome (2.69),
  `StripsPanel.tsx:226` role=status 11px, `StatusFooter.tsx:81`, `89`, `96` and
  `104` labels at 11.5px on chrome-deep (2.41), `TournamentPanel.tsx:140` the
  en-dash glyph (2.69, decorative, likely exempt).
- Icon-only buttons using `neutral-600` are non-text contrast (3:1 threshold) and
  pass at 4.00.

**Cost if ignored**: low-vision users cannot read captions and status labels the
app relies on. Raising the tokens moves the shell's look, so it is an owner
call.

## A shared URL with a fencer count of 0 or 1 may reach unguarded pool math

*Unverified, from the 2026-10-04 state-of-project audit. Roadmap feature 018
verifies it first.*

`analysis.ts:117` and `:140` call `computePoolStructure(comp.fencer_count, …)`
with no guard, while the module's own comment (`:44`) says a competition with
≤ 1 fencer cannot form a pool. 013 fixed the UI path that let a 0 or 1 unmount
the app, but `deserializeState` checks shape, not range, so a hand-edited or
old share link may still deliver one. Verify with a failing test before
deciding where the guard goes.

## Release housekeeping

*From the 2026-10-04 state-of-project audit. Roadmap feature 022, the last
before calling the product finished.*

- `README.md` names no dev URL (the app is served under `/piste-planner/`) and
  no lint, typecheck or smoke command.
- `.claude/launch.json` uses port 5175 while `scripts/` default to 5173.
- `.claude/settings.local.json` carries stale allow entries.
- Bare `research.md D#` and `data-model.md §` citations in `src/` and
  `__tests__/` mostly mean 013's files, but some mean deleted features. Each
  becomes a path or a `git show 0ab5bd2dc9:…` pointer.

## Team events are scheduled with a pool round

*From the owner's T041 print remarks, 2026-10-04. Roadmap feature 023, after
015. The owner's rule: team events go straight to DE.*

The engine gives every event a pool round before its DE, because the phase
builder has no event-type branch (`concurrentScheduler.ts:538-557`). METHODOLOGY.md
assumes the same (:64, :72, :130-145, :157-160, :197, :531, :600-601,
:639-643, :707, :736-738), so this is a spec gap and the owner amends the spec
first.

What the owner saw: B1's 10-team Vet events (Men's and Women's Foil, Men's and
Women's Sabre) run two 5-team pools on 2 strips, then a 4-strip "DE round of
16". The Schedule view's Strips column prints `pool_strip_count`
(`ScheduleOutput.tsx:183`), so the "2 strips" is the pool round. The 4-strip DE
is the fixed `de_round_of_16_strips: 4` (`buildConfig.ts:218`) whatever the
field. B8's real 4-team `D1-M-FOIL-TEAM` (`tournaments.ts:166`) gets a 1-strip
pool and a 4-strip DE for two semifinal bouts. B1's counts are rounded to the
nearest 10 (`tournaments.ts:2-3`), so a "10" may be anywhere from 5 to 14
teams.

Files that count team pools today: `concurrentScheduler.ts` (538-557, 771-783,
1477-1484, 1526, 1691), `derive.ts` (144-203, 272-296), `capacity.ts`
(97-108), `refs.ts:20-22`, `stripBudget.ts` (66-80, 132-139), `validation.ts`
(74-93, 243-248), `flighting.ts` (38-39, 94, 159), `analysis.ts` (49-58, 117,
140), `store/derived.ts:174-175`, `ScheduleOutput.tsx`, `DetailStrip.tsx:127-138`
and `UnplacedDock.tsx:114-115`. "Placed" also means `pool_start !== null` in
`runActions.ts:58`, `stripSearch.ts:146`, `__tests__/helpers/appPath.ts:46,63-64`
and `serialization.ts:253-254`.

Other gaps the same feature closes:

- Team DE length comes from the individual DE table
  (`concurrentScheduler.ts:403,582`), not a team match.
- Div 1, Junior and Cadet team DEs ask for REQUIRED video
  (`buildConfig.ts:206`) where METHODOLOGY.md:416 says gold and bronze only.
- The NAC team defaults (`constants.ts:218,228,238,288`) have no stated source,
  and the regional ones are unreachable (METHODOLOGY.md:665 says only NACs have
  team events).
- Since 015 the ledger factory stages NAC team DEs as the app does, so 023 is
  measured against the DE shape the app runs.
- **Staging is right** (owner, 2026-10-05): at national events, team DEs are
  staged, with video strips for the gold and bronze medal bouts. What 023
  changes is the team DE's shape and which rounds take video, not its DE
  mode.
- **Team match length.** The 2026-27 Operations Manual (p.17) gives 60 min for
  foil and épée and 30 for sabre. 023 builds on 024's DE timing basis.

Cost if ignored: team events spend strips, time and referees on a round that
does not exist, and the Strips column reports it.

## Findings messages name events by catalogue id

*From the owner's T041 print remarks, 2026-10-04. Not scheduled.*

The Schedule view and the rest of the app show event labels, but engine message
text still carries ids, for example `D1-M-EPEE-IND: cut summary — …`
(`analysis.ts:256`, 12 Notes in B1) and the `${comp.id}: …` messages in
`validation.ts:142-287`. They reach the Findings panel
(`store/derived.ts:477,502`), the tooltip's Findings row and the block's
accessible name (`Canvas.tsx:152-172`, `Block.tsx:130-139`), and the invalid
overlay (`CenterView.tsx:213-216`).

Options: (B) substitute labels in `computeAllFindings`, store-side, or (C)
reword the engine messages. Neither moves the drift ledger, which excludes
message strings (`driftLedger.test.ts:13-15`). Some messages name two ids
mid-text (`flighting.ts:57`, `analysis.ts:149,193,240`, `validation.ts:89`), so
a fix must substitute every catalogue id, not only the target or a leading
`<id>: `. B4, B5 and B6 also raise `validation.ts:217` warnings. The overlay at
`CenterView.tsx:201-219` has no `print-hidden` class, so a dimmed-invalid board
prints its codes. `ExportPopover.tsx:129-144` also prints ids from load errors.

Since 014, every `Bottleneck` carries `subjects`, as `ValidationError` already
did. For an engine finding these are exactly the competition ids its message
names. A finding copied from a validation rule keeps that rule's subjects: a
field name such as `['feasibility']` for a global rule, and, for
`same-population` and `flighting-group-strips`, ids their message does not
name. Option (B) can take the ids to substitute from `subjects` instead of
scanning the text, once it skips subjects that are not competitions.

## `competitionLabel` may not match published USA Fencing wording

*From the owner's T041 print remarks, 2026-10-04. An owner wording call,
unsourced either way.*

The Schedule view now shows `competitionLabel` (`competitionLabels.ts:54-58`),
which prints "Div 1" / "Div 1A" / "Div 2" (:12-15), always appends
"Individual" (:37) and reads "Senior" for a Div 1 team event (:20-23). The
handbook notes use "Div I / IA / II / III". FR-051 only says the view follows
USA Fencing's published schedules, so whether they say "Division I" or omit
"Individual" is unverified. Confirm the wording against a published schedule
before pinning it in tests. Labels run up to 41 characters, and 21 of 120 exceed
34, so a wording change also moves print wrapping.
