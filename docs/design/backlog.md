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

- Sequencing onto a pin (the design alignment's E3) –
  [§Auto-assign does not hold an unpinned predecessor before a pinned successor](#auto-assign-does-not-hold-an-unpinned-predecessor-before-a-pinned-successor).
  Unscheduled. Crossover between pins or through Move day is now checked, by 016 –
  [§Hand-placed events are never checked against the crossover constraint graph](#hand-placed-events-are-never-checked-against-the-crossover-constraint-graph).
- The referee model divergence (E5) – fixed by 016 –
  [§The scorecard's peak-referee row reads higher than the scheduler's own](#the-scorecards-peak-referee-row-reads-higher-than-the-schedulers-own).
- The engine and the store both reporting a pin collision –
  [§The engine and the store both report a pin collision](#the-engine-and-the-store-both-report-a-pin-collision).
  Fixed by 017.
- The two dead constants and the unwired `daySequencing.ts` –
  [§Dead code held back from the 2026-09-01 sweep](#dead-code-held-back-from-the-2026-09-01-sweep).
  Feature 021.
- The lane-packer overflow, including the two "Unplaced, needs N strips"
  figures for one event –
  [§The canvas calls events unplaced that the engine placed](#the-canvas-calls-events-unplaced-that-the-engine-placed).
  Fixed by 017.
- Blocks that cannot be selected from the keyboard –
  [§A placed block cannot be selected from the keyboard](#a-placed-block-cannot-be-selected-from-the-keyboard).
  Fixed by 017.
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

## What 024 deliberately left unfixed

*Recorded by 024, 2026-10-06. 024 closed §DE prelims gets a sliver of its
bracket's time and §The engine's rules predate the 2026-27 Operations Manual
(`git show 41e2b975ee:docs/design/backlog.md` recovers both). Its handoff,
`specs/024-ops-manual-conformance/handoff.md`, has the rest of what it left.*

- The largest template's Suggest passing the venue ceiling –
  [§NAC Vet/Div1/Junior suggests 103 strips, past the venue ceiling](#nac-vetdiv1junior-suggests-103-strips-past-the-venue-ceiling).
  Unscheduled, an owner call.
- A percentage cut read as the advancing share in one validation check –
  [§`validation.ts` reads a percentage cut as the share that advances](#validationts-reads-a-percentage-cut-as-the-share-that-advances).
  Unscheduled.
- The video-strip stepper's range –
  [§The video-strip stepper accepts counts the manual does not offer](#the-video-strip-stepper-accepts-counts-the-manual-does-not-offer).
  An owner question, unscheduled.
- Team DEs overflowing onto idle video strips and delaying individual video
  blocks –
  [§Team DEs spill onto idle video strips and delay individual video blocks](#team-des-spill-onto-idle-video-strips-and-delay-individual-video-blocks).
  Allowed by the spec, an owner call, unscheduled.
- Suggest's two bounds reading slightly different inputs –
  [§Suggest's strip-hour floor and its ceiling read different inputs](#suggests-strip-hour-floor-and-its-ceiling-read-different-inputs).
  Unscheduled.
- The type's help text in the Tournament panel –
  [§The Tournament panel's help text is vague and is not read by screen readers](#the-tournament-panels-help-text-is-vague-and-is-not-read-by-screen-readers).
  An owner wording call, unscheduled.
- The late-day WARN's raw minutes and shared dismissal key – fixed by 016 –
  [§Day-level findings have no structured day](#day-level-findings-have-no-structured-day).
- A penalty weight with no reader, `EARLY_START_CONSECUTIVE_HIGH_CROSSOVER` –
  [§Penalty weights: 5 of 19 are read](#penalty-weights-5-of-19-are-read).
  Feature 021, and it predates 024.

## What 016 deliberately left unfixed

*Recorded by 016, 2026-10-07. It closed §Hand-placed events and §The scorecard's
peak-referee row and mostly closed §Day-level findings. Its handoff,
`specs/016-hand-placement-rules/handoff.md`, has the rest.*

- Phases drawn without the scheduler's waits, which the one referee number now
  inherits –
  [§The canvas draws phases without the scheduler's waits](#the-canvas-draws-phases-without-the-schedulers-waits).
  Fixed by 017 (roadmap row 025 folded in).
- The Vet age-group co-day rule unchecked for hand placements, the regional Note
  unreachable by hand and the overflow block that never draws the findings edge –
  [§Hand-placed events are never checked against the crossover constraint graph](#hand-placed-events-are-never-checked-against-the-crossover-constraint-graph).
  The overflow edge was fixed by 017.
- Phase-repeating scheduler findings out of the panel, and the scheduler's own
  messages still printing ids –
  [§Day-level findings have no structured day](#day-level-findings-have-no-structured-day).
  Unscheduled.

## What 017 deliberately left unfixed

*Recorded by 017, 2026-10-07. It closed §The canvas calls events unplaced,
§A placed block cannot be selected, §The engine and the store both report a pin
collision and §The canvas draws phases without the scheduler's waits. Its
handoff, `specs/017-canvas-tells-truth/handoff.md`, has the rest.*

- Pinning every event in place and then re-running Auto-assign loses events –
  [§Pinning an event in place and re-running can lose events](#pinning-an-event-in-place-and-re-running-can-lose-events).
  Beside
  [§Auto-assign does not hold an unpinned predecessor before a pinned successor](#auto-assign-does-not-hold-an-unpinned-predecessor-before-a-pinned-successor).
  An owner call on what a pin fixes, unscheduled.
- The referee sweep counting a block that ends and a block that starts at the
  same minute as both present –
  [§The referee sweep counts an instantaneous handoff twice](#the-referee-sweep-counts-an-instantaneous-handoff-twice).
  An owner call, unscheduled.
- The day band's unplaced count, computed and never displayed –
  [§The day band computes an unplaced count it never shows](#the-day-band-computes-an-unplaced-count-it-never-shows).
  An owner wording call.
- A stale board where an event with every phase unseated shows no strip label –
  [§A stale board's detail strip can show no strips for an event](#a-stale-boards-detail-strip-can-show-no-strips-for-an-event).
  An owner call.
- Re-run on parameter change keeps its whole scope, and `configKey` is its hook –
  [§Changing a parameter should re-run the engine, with a working indicator](#changing-a-parameter-should-re-run-the-engine-with-a-working-indicator).
  Roadmap row 020.
- The video gutter and the camera icon (017 ruling R8) –
  [§The video gutter and camera icon are deferred](#the-video-gutter-and-camera-icon-are-deferred).
  A later feature.

## Day-level findings have no structured day

*Found while planning 014, 2026-10-04. **Mostly fixed by 016, 2026-10-07.** What
is left is the phase-repeating scheduler findings, below.*

**Fixed by 016.** `Bottleneck` has an optional 0-based `day`, filled by every
day-scoped producer: the hard-pair and regional-window findings,
`day-pools-exceed-strips`, `day-video-demand-exceeds-video-strips`,
`multiple-flighted-same-day`, the three `DAY_RESOURCE_SUMMARY` lines (message
text unchanged, since the ledger parses them), `day-ends-past-target` and the
first and last day WARN. The Findings panel's row id is now
`analysis:<rule>:<competition_id>:<subjects joined by +>:<day or ->`, so a
dismissal no longer passes to another finding when the list changes. No two
producers can emit the same id, and a stranded day outside the day range keeps
its raw day in the id. A venue row reads "Day N" instead of "Venue". Two-event
findings, `flighting-group-both-video` among them, mark both blocks and both
gutter flags, through a new `Finding.subjects`. The two 0-based day messages now
print "Day N" 1-based. The late-day WARN prints clock times from the day's own
start (`Day 3 ends at 20:00, 60 min past its target 19:00`), and the first and
last day WARN now reaches the panel. The engine's `day-ends-past-target` is
deliberately not in the panel (owner ruling R2), since the store's
`late-finish:day:<n>` row stays the app's late-day finding.

**Still open.**

- **Scheduler findings that repeat per phase stay out of the panel.**
  `phase-deferred`, `strip-contention-deferral` and `pinned-phase-unclaimed`
  would need `phase` in the row id if they ever reach it, which changes
  dismissal identity and needs its own decision. A run keeps only placements,
  so the scheduler's bottlenecks never reach the panel today. The ledger's
  "day peaks match" check still parses a peak value out of a message that has
  no structured home for it.
- **Sequencing delays name no predecessor.** A `cross-event-dependency-delay`
  bottleneck lists only its owner in `subjects`, because
  `predecessorReadyTime` returns a time and not the predecessor's id.
- **The scheduler's own messages still print ids and scheduler-axis minutes.**
  `hard-separation-violated` and the regional window messages from the
  scheduler print competition ids, and its regional message prints scheduler
  minutes and a lowercase "day N". 016 left them so the scheduler's findings do
  not change. Only the app's own rule check (`checkPlacementRules`) names events
  by label. Cost if ignored: none in the app today, since those findings never
  reach it.
- **No fixture puts a scheduler-reported hard-separation violation on a
  non-zero day**, so that producer's `day` is pinned only on day 0. B1–B8 emit
  none, and the NAC Cadet/Junior template (6 broken pairs) is the only case.

## The scorecard's peak-referee row reads higher than the scheduler's own

*Measured by 004's S6 on 2026-09-01 and re-measured by S8. **Corrected and fixed
by 016, 2026-10-07.** The cause recorded here until then was wrong.*

The two figures did not differ because the engine clamps. `computePostScheduleRefDemand`'s
clamp (`stripsForEvent > peak.total`) fired zero times on B1–B8 and removing it
left every `refRequirementsByDay` byte-identical (an orchestrator observation, not recorded in a branch commit). The store and the engine
emitted the same referee intervals with the same counts and differed only in
**time**. The store derived each phase back to back from the placement, while
the scheduler's allocations sat later where a phase waited for strips, so later
phases were drawn 25–60+ minutes earlier than scheduled and overlapped
more. Engine and store on every day that differed, before 016:

| Scenario | Day | Engine | Store |
|---|---:|---:|---:|
| B1 | 1 / 2 | 210 / 134 | 218 / 140 |
| B2 | 0 / 3 | 228 / 136 | 244 / 140 |
| B4 | 1 / 2 | 80 / 80 | 90 / 104 |
| B6 | 0 / 1 / 2 | 78 / 68 / 64 | 98 / 90 / 112 |
| B7 | 0 / 2 | 156 / 156 | 164 / 168 |
| B8 | 0 / 2 | 212 / 136 | 236 / 172 |

016 made it one number. The scheduler now counts referees from the schedule as
the workbench draws it (`refDemandFromSchedule`, `src/engine/refs.ts`, called by
the store's `buildRefDemandByDay` and by the scheduler's own
`ref_requirements_by_day`), under the METHODOLOGY §Ref Demand Derivation
amendment the owner made first. `computePostScheduleRefDemand` and its inert
clamp are gone. The engine's totals rose to the store's on all 13 days above,
and the footer did not move (B1's boot footer still reads 218). The cost is
named in
[§The canvas draws phases without the scheduler's waits](#the-canvas-draws-phases-without-the-schedulers-waits):
the one number is the drawn one, so it inherits that entry's optimism.

Sabre peaks and peak times moved with the totals, and one move fell outside the
13 days (B8 day 1's sabre peak 56 to 64, total and time unchanged). The owner
accepted all of them on 2026-10-07 as the same cause.

**017 then fixed that entry (2026-10-07).** The scheduler reports the peak of its
own timeline again and the footer counts the board it draws, which right after a
run is the same timeline. The 14 scenario-days that moved are in
`specs/017-canvas-tells-truth/spec.md` §Expected drift, and the ledger snapshot
returned byte for byte to the pre-016 one.

## The canvas draws phases without the scheduler's waits

*Found by 016's planning probe, 2026-10-06, and confirmed by its referee
change. **Fixed by 017, 2026-10-07**, which folded in roadmap row 025.*

After a run the app kept each event's day, start and strip count and re-derived
the phase times without resource contention. A phase that waited for strips
started later in the scheduler's timeline than on the canvas, by up to 75
minutes on B1 and 505 on B6, so DE starts were drawn early and the referee peak
(counted from the drawn intervals since 016) read high on 13 days. The numbers
are in [§The scorecard's peak-referee row reads higher than the scheduler's own](#the-scorecards-peak-referee-row-reads-higher-than-the-schedulers-own).

017 keeps the run in memory (`lastRun`, never in `Placement` and never in the
URL's placements) and draws kept phases at the scheduler's own times on the
scheduler's own strips. The referee peaks moved back to the scheduler's
timeline on 14 scenario-days, and the snapshot SHA-256 is byte-identical to the
pre-016 one (`7e2db75c38bb…`, `b84be7e291`).

**Rejected alternatives, measured by 017's planning on B1–B8:**

- **A no-wait engine** (the scheduler stops waiting for strips, so derived
  times are right by construction): the scheduled counts become
  24/19/23/19/12/40/16/53 (from 24/24/24/21/12/45/18/53), and ERRORs rise to 0/5/1/11/0/14/2/0.
- **Close-gaps** (closing the scheduler's waits where possible): closes 32 of 200
  waits, and B1 reaches only 17 placed, 7 unplaced.
- **Replay without a run record** (a shared link carrying placements only): B6
  boots 5 pools that cannot claim their strips.
- **Re-packers at the kept times:** a one-pass packer leaves 0/3/2/0/0/0/0/2
  blocks in overflow and a two-pass packer 1/1/1/0/0/0/0/3.
- **A splitting packer at derived times:** 7/9/10/9/3/26/6/22 in overflow.
- **Re-packing everything on a hand move:** breaks unmoved events in 69 of 72
  moves on B1 and 159 of 159 on B8. Keeping the kept events fixed gave 0
  collateral across all 585 single moves (every event to every other day,
  B1–B8).

## The referee sweep counts an instantaneous handoff twice

*Found by 017's planning, 2026-10-07. Recorded, not fixed. The rule has been
documented since `a889885424`.*

`sweepLine` (`src/engine/refs.ts`) processes a start before an end at the same
minute, so a block that ends at t and a block that starts at t both count at t.
The comment (`refs.ts:49`) justifies it as an instant referee handoff. With a
half-open sweep (end first) the peaks would read lower. How much lower was not
measured, so this entry carries no figures.

**What it needs**: an owner call on whether an instantaneous handoff should
count both blocks. It changes the footer's referee peak and the scheduler's
`ref_requirements_by_day` together, so the change needs a drift review and a
METHODOLOGY line.

**Cost if ignored**: on days where many phases chain end to start the peak reads
above the referees on the floor at any one moment, so the staffing advice
is generous. It errs toward more referees, never fewer.

## Day-end overrun is a hard failure the methodology calls a warning

*Found by the 2026-08-31 methodology review (web research + code cross-check).
Recorded, not fixed.*

*2026-10-06, from 024: the premise below has narrowed. METHODOLOGY now sets
7:00 PM as a soft target that draws a WARN and 10:00 PM as the hard end, where
a phase that would end past it fails with `SAME_DAY_VIOLATION` at ERROR
severity (§Same-Day Completion), and the engine does both: 024 added the
`day-ends-past-target` WARN (`concurrentScheduler.ts`). The doc and the engine
now agree on the 10:00 PM rule. What stays open is the last sentence's
question, whether a phase past 10:00 PM should drop the event or place it with
a WARN. The text below is the 2026-08-31 record and quotes the older wording.*

**Owner ruling 2026-10-06:** place with a WARN. A phase that would end past
10:00 PM is placed with a WARN carrying the estimated finish, not dropped. This
stays in 018, and the owner amends METHODOLOGY §Same-Day Completion first,
since the current text makes 10:00 PM a hard end.

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

*2026-10-07: 016 checks hand placements against the hard and regional rules but
not this co-day rule. A hand-split Vet co-day raises nothing – see
[§Hand-placed events are never checked against the crossover constraint graph](#hand-placed-events-are-never-checked-against-the-crossover-constraint-graph).*

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

*2026-10-06: 024 built the window that way. `applyCrossEventEdges` stores a
`group1_window_floor` on the older event, and
`__tests__/engine/regionalGroup1Window.test.ts` asserts the older event's
actual pool start. The Vet sibling edge above is unchanged.*

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
  other individual category, with the third tier moving from R4 to R8. 024
  delivered it (`VIDEO_STAGE_ROUND` in `constants.ts`, read by `de.ts`).
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

## NAC Vet/Div1/Junior suggests 103 strips, past the venue ceiling

*Found by 024's measurement, 2026-10-06. Recorded, not fixed. Needs an owner
call on what the app should say.*

Suggest answers 103 strips for the NAC Vet/Div1/Junior template (the 66-event
template in `src/engine/catalogue.ts`) at 4 days, a 9:00–19:00 day and 12 video
strips. All 66 events place at 103. Before 024 the answer was 80, group A's
pool and DE times took it to 90 and group B's 10-hour day and ÷ 14 floor took
it to 103. It holds at 103 with 8, 12 or 16 video strips.

The owner's working ceiling is about 100 strips, because the largest event in
the world is reported to run "over 100 strips" (a judgement, not a sourced
figure). 103 is past it. The cause is not a bug. The manual's bout times make
large-bracket DEs longer, and the shorter planning day leaves less room for
them. 024 reports the number and does not tune it.

The levers an organizer pulls come in this order: days, flighting, entry caps,
and strips last. The first is already spent here, because the day count offers
2, 3 and 4 (`TournamentPanel.tsx`) and this template is at 4. Flighting is
modelled. Entry caps are not (§Per-event entry caps are not modelled). So the
Suggested minimum has nothing left to offer but strips, and it says so with a
bare number.

What would fix it, for the owner to choose between: a note on the Suggested
minimum when the answer passes about 100 that names the levers in order, a
fifth day for the largest templates (METHODOLOGY §Inputs leaves longer events
to a future version), or the entry-cap work named above. None is scheduled.

**Cost if ignored**: Suggest offers a venue the owner calls implausible for
the largest template, which reads as a broken tool.

## `validation.ts` reads a percentage cut as the share that advances

*Found by 024's group E review, 2026-10-06. Recorded, not fixed. A comment in
`validation.ts` names the mismatch.*

The cut-value-min-promotions check (`validation.ts`, near line 183) computes
`round(fencer_count × cut_value / 100)` for a PERCENTAGE cut. That reads
`cut_value` as the share that advances. `computeDeFencerCount` (`pools.ts`)
computes `round(fencer_count × (1 − cut_value / 100))`, so it reads the same
number as the share that is cut, and the DE field it builds is the one the
schedule uses. The two disagree on every percentage.

- **A 20% cut, the default for Cadet, Junior and Div 1**: the check's figure
  is 20% of the field, so 2 to 7 fencers read as fewer than 2 promoted and the
  event is excluded with a `cut-value-min-promotions` ERROR. The DE field would
  have been 2 to 6 fencers, a real if tiny event. Real fields of 2 to 7 are
  rare, but a what-if run or a hand-entered count hits it.
- **A 99% cut**: the check's figure is 99% of the field, so it passes. The DE
  field is 1% of the field, which `computeDeFencerCount` floors to 2. The
  intended protection, an error when a cut leaves fewer than 2 fencers, does
  not fire where it should.

The rule is per-event (`PER_EVENT_ERROR_RULES` in `concurrentScheduler.ts`), so
the damage is confined to the event. Fixing it means changing the check's
PERCENTAGE arm to `round(fencer_count × (1 − cut_value / 100))` and then
checking that no B1–B8 scenario moves. The check cannot simply call
`computeDeFencerCount`, because that function floors its result at 2 and would
hide the case the check exists to catch.

**Cost if ignored**: a small event under a percentage cut is dropped from the
schedule with an error that quotes the wrong count, and an extreme cut is
accepted without the warning it was meant to draw.

## The video-strip stepper accepts counts the manual does not offer

*Found by 024's group C, 2026-10-06. Recorded, not fixed. Owner question below.*

The "With video" stepper in `StripsPanel.tsx` runs from 0 to the strip count.
METHODOLOGY §Inputs offers 4, 8, 12 and 16 video strips at a NAC, and
§Resource Preconditions sets 4 as the minimum. Since 024 every individual event
at a NAC is REQUIRED video, so under the default Staged mode its video stage
asks `min(4, bracket / 2)` strips, which is 4 for any bracket of 8 or more. A
NAC with 1, 2 or 3 video strips therefore draws a `video-r16-strip-shortfall`
ERROR (`validation.ts`) on each such event. That rule is per-event
(`PER_EVENT_ERROR_RULES`), so every individual event with a bracket of 8 or
more is excluded from the schedule. The organizer who types 3 loses the board
and has to read the Findings to learn why.

**Owner question**: restrict the stepper to 4, 8, 12 and 16, or keep free entry
and warn? Restricting matches the spec and makes the error unreachable, but it
also stops an organizer from trying 6 or 10, which the engine accepts. Free
entry with a note on the control keeps that and costs one more line of text.

**Owner ruling 2026-10-06:** keep free entry, from 0 to the strip count. At a
NAC with fewer than 4 video strips, show a note on the control saying
individual events need at least 4.

**Cost if ignored**: a NAC with fewer than 4 video strips loses every
individual event, and the stepper gives no hint.

## Team DEs spill onto idle video strips and delay individual video blocks

*Found by 024's group A review fixes, 2026-10-06 (`dc0ee00c48`'s message, which
corrects the plan's 1925 to 1895). Recorded, not fixed. METHODOLOGY allows it.*

Since 024 every team DE runs Single Stage on general strips and bills no video
strip-hours. A wide team DE can need more strips than the day's general strips
leave free, so the strip allocator takes idle video strips as overflow.
METHODOLOGY §Video Strip Preservation says exactly that: for "DE prelims /
single-stage DEs: non-video strips selected first; video strips used as overflow
when general strips are exhausted." The overflow is legal, and it costs the
individual events that need those strips for their video block.

Group A measured it on B1, in scheduler-axis minutes. On day 2 the Vet
Women's Épée team DE (`VET-W-EPEE-TEAM`) runs from 1880 to 2120. It takes the
4 free general strips and then all 12 video strips. On day 1, team DEs on
general strips push individual prelims onto video overflow. The individual
video blocks that start later because of it, before and after the team ruling:

- Junior Women's Sabre: 1895 to 2120, a delay of 225 minutes.
- Junior Women's Épée: 2020 to 2120.
- Junior Men's Épée: 2040 to 2120.
- Div 1 Men's Sabre: 1115 to 1165.
- Div 1 Women's Foil: 1195 to 1220.

No block started earlier. B1 stays at 24 placed, so no ledger count moved, and
the spec allows the overflow, which is why the contention is recorded here and
not corrected.

What would fix it, for the owner to choose between: keep video strips out of
the overflow on any day that holds a staged individual video block, which is a
rule METHODOLOGY does not state and would amend §Video Strip Preservation, or
leave it as the spec has it. Team events are 023's, so the decision could be
made with that feature.

**Cost if ignored**: individual video blocks at a NAC can start up to 225
minutes later than they would without the team event on the same day.

## Suggest's strip-hour floor and its ceiling read different inputs

*Found by 024's group A review fixes (`dc0ee00c48`, the floor) and group B
review (`61c9f60bc9`, the ceiling), 2026-10-06. Recorded, not fixed. Neither
moves a measured number.*

The strip search (`src/engine/stripSearch.ts`) runs from a floor to a ceiling.
Two small mismatches sit in how those bounds are built.

- **The floor counts general strip-hours only.** `stripSearchRange` reads
  `total_strip_hours` from `aggregateStripHours` (`capacity.ts`) and ignores
  `video_strip_hours`. For a staged event the video-stage bouts bill the video
  budget alone, so they never enter the floor. METHODOLOGY §Strip Count
  Suggestion says the floor covers "the competitions' total strip-hour draw",
  which can be read as general hours or as general plus video. The floor only
  seeds the search – the scan steps up one strip at a time until the scheduler
  places every event – so a low floor costs extra candidates to scan and does
  not return a wrong answer. The owner can settle the wording, and the code
  follows it.
- **The ceiling and the floor's busiest-day spread filter fencer counts
  differently.** `suggestStripCount` (`analysis.ts`, the search's ceiling) skips
  a competition only when `fencer_count <= 1`. `busiestDayCompetitors`
  (`stripSearch.ts`) and `aggregateStripHours` keep only counts from
  `MIN_FENCERS` (2) to `MAX_FENCERS` (500). The two agree for every count from 0
  to 500. They differ for a count above 500, which `fencer-count-bounds`
  rejects as an ERROR (`validation.ts`) and which the ceiling still counts.
  The fix is to share one filter.

**Cost if ignored**: low. A board with an out-of-range fencer count gets a
ceiling that includes an event the floor ignores, and a video-heavy board scans
a few more candidates than it needs to.

## The Tournament panel's help text is vague and is not read by screen readers

*Found by 024's group D reviews, 2026-10-06. Recorded, not fixed. The wording is
an owner call.*

The tournament-type control in `TournamentPanel.tsx` has a line under it:
"Affects event grouping rules and scheduling priorities." It is accurate and
says little. "Scheduling priorities" names nothing the type sets. Since 024 the
type decides whether Group 1 pairs are hard or soft with a window, the video
policy, the DE mode, referees per pool and the default cuts, and it also decides
the rest-day rule the line used to name. 024's plan limited its edit to the
rest-day phrase.

The line is also not tied to its radio group. The group has an `aria-label` and
no `aria-describedby`, so a screen reader never reads the help text, and tests
can only find it by its wording. That was true before 024.

What would fix it: the owner words a sentence that names what the type sets,
and the line gets an id that the radio group points at with `aria-describedby`.
`SettingsPanel.tsx` already does this for its own hints.

**Cost if ignored**: an organizer picking a type does not learn what it changes,
and a screen-reader user does not hear even the sentence there is.

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

*2026-10-06, from 024: two rows of this table no longer describe the code.
The soft-separation row now runs: `crossoverPenalty` (`crossover.ts`) reads
`SOFT_SEPARATION_PAIRS`, which holds DIV1↔DIV2 and DIV1↔DIV3 at 3.0, and
DIV1↔CADET left the table to become a Group 1 pair (`GROUP_1_MANDATORY`), hard
at NAC, SYC and SJCC and `REGIONAL_GROUP_1_PAIR` (5.0) at ROC, RYC and RJCC.
The bout-delta row is gone: `YOUTH_VET_BOUT_DELTA` no longer exists, and
`perBoutDuration` has a caller (`de.ts`) that picks the 10-touch, 15-touch or
team-match time. The other three rows were not re-checked by 024.*

This is why the B1–B8 drift ledger never caught any of it: replacing a live
hardcode with the constant it shadows *moves* numbers, so the divergence is
invisible precisely because nobody attempted the fix. Expect a real snapshot
diff on each, and review it rather than accepting it.

### Penalty weights: 5 of 19 are read

Audited by grepping `PENALTY_WEIGHTS.<KEY>` per key on 2026-09-01. Read:
`REST_DAY_VIOLATION`, `PROXIMITY_1_DAY`, `TEAM_BEFORE_INDIVIDUAL`,
`INDIV_TEAM_DAY_AFTER`, `INDIV_TEAM_2_PLUS_DAYS`. The other fourteen split
three ways, and the split is what decides the size of the work:

- **Three were cheap engine fixes with no architectural blocker.**
  `PROXIMITY_3_PLUS_DAYS`, `WEAPON_BALANCE`,
  `CROSS_WEAPON_SAME_DEMOGRAPHIC_VET` are all pure day-level properties that day
  coloring has every input to compute. `PROXIMITY_3_PLUS_DAYS` is the starkest –
  `PROXIMITY_1_DAY` is applied three lines above the guard that skips it.
  *2026-10-06: 024 took the third. Group 3 replaced
  `CROSS_WEAPON_SAME_DEMOGRAPHIC_VET` with `CROSS_WEAPON_SAME_DEMOGRAPHIC`
  (0.2, every category), which `dayColoring.ts` reads. Only `WEAPON_BALANCE`
  of the three has no reader as of 024 – 010 wired `PROXIMITY_3_PLUS_DAYS`.*
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

*2026-10-06, from 024: `PENALTY_WEIGHTS` now has 20 keys and 8 have a reader
outside `constants.ts`. The count was 5 of 19 on 2026-09-01. 010 wired
`PROXIMITY_3_PLUS_DAYS`, and 024 added `REGIONAL_GROUP_1_PAIR` (read in
`crossover.ts`) and swapped the Vet cross-weapon key for
`CROSS_WEAPON_SAME_DEMOGRAPHIC`, which `dayColoring.ts` reads. The 12 with no
reader are the eight time-of-day weights, `WEAPON_BALANCE` and the
`LAST_DAY_REF_SHORTAGE_*` trio. That includes
`EARLY_START_CONSECUTIVE_HIGH_CROSSOVER` (5.0), a gap against METHODOLOGY
§Early-Start Conflicts that predates 024 and that 024 neither widened nor
closed. That section's three bullets still state the early-start rules, and
`EARLY_START_SAME_DAY_HIGH_CROSSOVER` and `EARLY_START_CONSECUTIVE_INDIV_TEAM`
have no reader either. They are three of the eight the owner ruled to retire
from the doc on 2026-10-04, so 021 either removes the section's bullets with
the other time-of-day rules or wires the weights.*

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
  (p.19) sources the tiers. **Delivered 2026-10-06 by 024:** every staged
  event splits at its category's tier (`videoStageRound` in `de.ts`), so the
  "every staged event splits at `DE_ROUND_OF_16`" sentence describes the code
  before 024.

### The doc also contradicts itself

*Found by the 2026-08-31 methodology review, folded in here on 2026-09-01 so
methodology divergences have one home. Doc-only fixes — no engine change, and
no blocking decision.*

- **DIV1↔CADET is listed as both hard and soft.** The hard-constraint section
  lists it under "always different days at NACs" while Soft Preferences gives
  it penalty 5.0. The code said soft (`constants.ts:453,472`) – the
  hard-constraint bullet should move. Note this is entangled with the soft
  separation row in the table above: the doc's own soft value (5.0) is not the
  one applied (0.8), so fixing the hard/soft listing does not settle the number.
  **Owner ruling 2026-10-05:** soft, even though the 2026-27 manual makes it
  mandatory (p.20). If the two must share a day, they split morning and
  afternoon (024). *2026-10-06, from 024: the contradiction is gone, and the
  outcome differs from the ruling above. METHODOLOGY §Overlapping-Population
  Separation (Group 1) lists DIV1 and CADET as a Group 1 pair, hard at NAC, SYC
  and SJCC and soft at ROC, RYC and RJCC, and `GROUP_1_MANDATORY`
  (`constants.ts`) and `crossoverPenalty` do the same. At a regional type the
  older side's pools start no earlier than day start + 4 hours when a pair
  shares a day, which is the morning and afternoon split.*
  **Owner ruling 2026-10-06:** the spec stands, replacing the 2026-10-05
  ruling. DIV1 and CADET never share a day at NAC, SYC and SJCC.
- **Flighting text conflicts with itself.** The Flighting section says Flight
  A/B start/end times are not tracked, while Runtime Decomposition says the
  concurrent scheduler decomposes them into two timed phase nodes. The former
  predates Phase D and should be rewritten.
- **Day-end severity wording** ("soft boundary", warning-level Same-Day
  Completion) contradicts the runtime's ERROR-severity `SAME_DAY_VIOLATION` –
  resolve whichever way §Day-end overrun lands, but the doc and engine should
  say the same thing. *2026-10-06, from 024: resolved by amending the doc to match
  the engine. METHODOLOGY §Same-Day Completion now makes 7:00 PM the soft target
  that draws a WARN and 10:00 PM the hard end, where `SAME_DAY_VIOLATION` is an
  ERROR, and the engine does both. What stays open is whether a phase that
  would end past 10:00 PM should fail at all, which §Day-end overrun is a hard
  failure asks.*

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

*2026-10-06, from 024: B4 (the SYC, 30 events) places 21 of 30 after 024, up
from 18 before it. Group A's pool-of-7 times took it to 19 and group D's
same-day rules to 21, with 9 ERRORs left (it had 12). A placed count is not a block
length, and 024 did not re-read B4's Y8 and Y10 pool blocks against the 2–3
hours the figures below describe, so whether the manual's times close that
gap is still unmeasured.*

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

*Found 2026-09-06 during 012's brainstorming. **Fixed by 016, 2026-10-07**
(`specs/016-hand-placement-rules/handoff.md`).*

A hand placement is now judged by the rules the auto-scheduler enforces.
`checkPlacementRules` (`src/engine/placementRules.ts`) reads `crossoverPenalty`,
the function the constraint graph uses, and `computeDerivedFindings` feeds the
result to the Findings panel. Two events that may never share a day raise one
`hard-separation-violated` Warning naming both by label. The organizer cannot
dismiss it, Auto-schedule stays enabled, and moving one event off the day
clears it. At ROC, RYC and RJCC the Group 1 pair raises the regional window
finding instead, a Note when the 4-hour split holds and a Warning when it does
not.

Still open from this entry:

- **The Vet age-group co-day rule is not checked for hand placements.** Age-banded
  Vet individuals of one gender and weapon must share a day, and only the
  scheduler's day colouring enforces it (`vetCoDayRequiredColor` in
  `dayColoring.ts`). Hand-moving one Vet band to another day raises nothing.
  The rule is itself unsourced – see
  [§Vet co-day serialization is unsourced and never fit-checked](#vet-co-day-serialization-is-unsourced-and-never-fit-checked).
  Cost if ignored: an organizer can split a Vet co-day by hand and hear
  nothing, the one same-day rule the two halves of the app still judge
  differently.
- **The regional Note cannot be reached by hand in the live app.** No control
  sets an event's start time (Move day keeps the start), so a hand move rarely
  lands a pair on a window the scheduler would call honoured. The live smoke
  asserts the not-honoured Warning on ROC Mega and the store tests cover the
  Note.
- **An overflowing block never drew the findings edge.** Fixed by 017: the
  overflow exemption in `Block.tsx` is gone, so every warned block draws the
  edge, the per-day overflow lane included.

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

**017 (2026-10-07) did not re-run.** An edit to anything the engine reads now
marks the board stale, with a "Stale – re-run Auto-assign" banner and one
Findings row, until the next run. This entry keeps its whole scope, and
017's `configKey` is its hook: the canonical serialization of the engine's
inputs, compared with the kept run's, says when a re-run is due.

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
when the owner set T039's pass condition. **Fixed by 017, 2026-10-07.***

The entry blamed the lane packer's fragmentation and quoted `19 placed · 5
unplaced` for B1. Both were out of date by the time 017 measured them. That
figure predates 024, and the boot footer was 15 placed · 9 unplaced, with all
nine overflow blocks DE phases. Across B1–B8 it read 15/9, 13/11, 14/10, 11/19,
8/4, 17/37, 11/7, 30/23.

**The cause was timing, with the packer's fragmentation on top.** `deriveEventSchedule`
drew the DE at pool end plus the admin gap, without the scheduler's wait for
strips, so the drawn load exceeded the strip count on every day of B1–B8 (B1 84,
115, 90 and 95 strips against 80, B6 90, 83 and 112 against 48, B8 108, 136, 126
and 115 against 68), while the engine's own never does. The contiguous packer
added overflow even at the engine's own times (5/4/5/4/3/6/2/9 blocks).

After a run the store now keeps the scheduler's own times and strip indices in
memory and the canvas draws them. The boot footers read 24/0, 24/0, 24/0, 21/9,
12/0, 45/9, 18/0, 53/0, equal to the engine's scheduled and unscheduled counts,
and `scripts/smoke.mjs` asserts B1's `24 placed · 0 unplaced`. The 21/9 and 45/9
are real, the engine's own ERRORs on B4 and B6. One strip model also removes the
two "Unplaced, needs N strips" figures for one event (013 handoff finding 33),
since the detail strip and the tooltips now read one drawn model.

## A placed block cannot be selected from the keyboard

*013 handoff findings 13 and 20. Owner decision 2026-10-04: blocks become
buttons. **Fixed by 017, 2026-10-07.***

`Block`'s root was `role="img"` with an `aria-label`, so a keyboard or
assistive-technology user could select an unplaced event (the dock's chips are
buttons) and reach a placed one only through Findings → "Show on grid". Each
phase is now one `<button type="button">` on its first run, with its accessible
name, an outline focus ring and a plain tab stop, and Enter or Space selects it.
Further runs of a split phase are `aria-hidden` siblings with `tabIndex={-1}`.
The smoke driver tabs to a block and presses Enter.

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
two pins, and between a pin and an event moved through Move day, was unchecked
for the same reason until 016, which now checks the current placements.

**What it needs**: `Competition.latest_end` is the mechanism the research names
for expressing "this must finish before that pin". 016 delivered only the crossover
check on current placements, so this sequencing part is unscheduled.

**Cost if ignored**: Auto-assign around pins can return a board where a team
event precedes its individual event or a Vet sibling runs out of order, with no
finding.

## Pinning an event in place and re-running can lose events

*Found by 017's planning, 2026-10-07 (ruling R3). Recorded, not fixed. Beside
[§Auto-assign does not hold an unpinned predecessor before a pinned successor](#auto-assign-does-not-hold-an-unpinned-predecessor-before-a-pinned-successor),
the same pre-claim pass.*

A pin fixes an event's day and pool start and nothing else, and 017 left that
unchanged. Pinning every event where Auto-assign put it and re-running is not a
no-op. The pre-claim pass seats each pin on the no-wait chain (pool end plus the
admin gap, without the waits the first run had), not on the times the first run
gave it. Measured: B1 goes from 24 placed, 0 unplaced to 19/5 and
B8 from 53/0 to 25/28. The unseated set after a run with pins still equals
`PINNED_UNCLAIMED` (checked on pin-all and pin-half, 16 of 16 trials), so the
board reports it honestly.

**What it needs**: an owner call on what a pin fixes, since the pool start alone
is not enough to reproduce a board.

**Cost if ignored**: an organizer who pins everything to protect a good board,
then re-runs after a change, loses events with the unseated pins listed in
Findings. Pinning fewer events shrinks the loss but does not remove it: pin-half
still left 0/1/0/2/0/9/0/10 phases unseated on B1–B8.

## The engine and the store both report a pin collision

*013 handoff finding 25. **Fixed by 017, 2026-10-07.***

When a pin could not claim its strips, the engine emitted a `PINNED_UNCLAIMED`
bottleneck (one per phase node, finding 21) and the Findings list showed the lane
packer's Unplaced row instead (FR-059). The two surfaces agreed on one fixture
and nothing checked that they agreed in general.

017 made it one reporter. `unseatedPhases` (`src/engine/`) names the phases that
need strips and hold none, Suggest's subtraction and the referee count read it,
and the drawn model applies the same rule for the footer, the day bands and the
Findings panel. Right after a run it equals the `PINNED_UNCLAIMED` set less any
zero-length phase, which 017's pass conditions check after pin-all and pin-half
runs on B1–B8. A kept pin the engine could not seat
gets one Unplaced row (`unplaced:<id>:room`) reading "Pinned here, but no strips
are free at this time – move or unpin it, then re-run Auto-assign." and
`PINNED_UNCLAIMED` itself stays a ledger WARN with no panel row of its own.

## The day band computes an unplaced count it never shows

*Found by 017, 2026-10-07. An owner wording call.*

The day band's selector counts distinct unplaced events per day with the
footer's rule, and the band does not render the figure. The footer and the
Findings panel carry the count, so nothing is wrong on screen today.

**What it needs**: the owner picks the wording and the spot in the band.

**Cost if ignored**: an organizer scanning a crowded day cannot see at a glance
that it holds an unplaced event, and must read the footer or the Findings panel.
Nothing on screen is wrong.

## A stale board's detail strip can show no strips for an event

*Found by 017, 2026-10-07. An owner call.*

While the board is stale, unseated phases are unknown, not unplaced, so they
get no count and no Unplaced row. An event whose every phase is unseated on a
stale board then has no strips to name, and the detail strip shows no strip
label for it. That bends 013 handoff item 12, "the strips fact always renders".

**What it needs**: an owner call between showing nothing, as now, and a line
that says the strips are unknown until the next run.

**Cost if ignored**: a blank strips fact on a stale board, beside the stale
banner that already says why.

## The video gutter and camera icon are deferred

*017 ruling R8, 2026-10-07. Deferred to a later feature.*

The mockup's video gutter and camera icon are not built. 017 draws strips from
the kept run and leaves video marking as it was, and the alignment doc's D2 row
still says the camera icon waits for a later feature.

**Cost if ignored**: cosmetic. The board has no gutter or icon marking which
strips carry video, so an organizer reads video strips from the strip numbers
alone.

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
assumes the same (§Outputs, §Single-Day Fit, §Resource Preconditions, §Team
Events Cannot Use Cuts, §Individual/Team Separation, §Concurrent Phase
Scheduler, §Phase 2: Pre-Scheduling Analysis, §Phase 5: Resource Allocation,
§Strip Count Suggestion and §Strip-Hour Capacity), so this is a spec gap and
the owner amends the spec first.

What the owner saw (before 024): B1's 10-team Vet events (Men's and Women's
Foil, Men's and Women's Sabre) run two 5-team pools on 2 strips, then a 4-strip
"DE round of 16". The Schedule view's Strips column prints `pool_strip_count`
(`ScheduleOutput.tsx:183`), so the "2 strips" is the pool round. The 4-strip DE
was the fixed `de_round_of_16_strips: 4`, a field 024 removed. A team DE now
asks `min(bracket / 2, 16)` general strips (`deStripFootprint` in `de.ts`).
B8's real 4-team `D1-M-FOIL-TEAM` (`tournaments.ts:166`) still gets a 1-strip
pool. B1's counts are rounded to the nearest 10 (`tournaments.ts:2-3`), so a
"10" may be anywhere from 5 to 14 teams.

Files that count team pools today: `concurrentScheduler.ts` (538-557, 771-783,
1477-1484, 1526, 1691), `derive.ts` (144-203, 272-296), `capacity.ts`
(97-108), `refs.ts:20-22`, `stripBudget.ts` (66-80, 132-139), `validation.ts`
(74-93, 243-248), `flighting.ts` (38-39, 94, 159), `analysis.ts` (49-58, 117,
140), `store/derived.ts:174-175`, `ScheduleOutput.tsx`, `DetailStrip.tsx:127-138`
and `UnplacedDock.tsx:114-115`. "Placed" also means `pool_start !== null` in
`runActions.ts:58`, `stripSearch.ts:146`, `__tests__/helpers/appPath.ts:46,63-64`
and `serialization.ts:253-254`.

Other gaps the same feature closes:

- **Done by 024 (2026-10-06):** a team DE runs at the team match time (60 min
  for foil and épée, 30 for sabre, `perBoutDuration` in `de.ts`) in place of
  the individual DE table, and every team event plans Single Stage with
  BEST_EFFORT video at every tournament type (`resolveDeMode` and
  `resolveVideoPolicy` in `typeDefaults.ts`, which `buildConfig.ts:213-214`
  calls). So no team DE asks for REQUIRED video or video strips any more. The
  gold and bronze bouts are not scheduled, and the bout committee finds a
  video strip for them on the day (METHODOLOGY §Video Replay Policy, Teams
  row). What is left for 023 is the pool round and the "placed" definition
  above.
- The NAC team defaults (`constants.ts:218,228,238,288`) have no stated source,
  and the regional ones are unreachable (METHODOLOGY §Tournament-Type Policies
  says only NACs have team events).
- Since 015 the ledger factory plans team DEs as the app does (Single Stage
  since 024), so 023 is measured against the DE shape the app runs.
- **Staging, superseded**: the owner's earlier 2026-10-05 ruling that team DEs
  are staged at national events gave way to 024's D4 ruling (also 2026-10-05)
  that team events run Single Stage at every type, so the ledger factory and
  the app both plan them that way.
- **Team match length.** The 2026-27 Operations Manual (p.17) gives 60 min for
  foil and épée and 30 for sabre. 024 built it in, and 023 builds on it.

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
`<id>: `. Before 024's group C, B4, B5 and B6 also raised `validation.ts` video
dead-config warnings, and regional events are BEST_EFFORT now, so they no longer
do. The overlay at `CenterView.tsx:201-219` has no `print-hidden` class, so a
dimmed-invalid board prints its codes. `ExportPopover.tsx:129-144` also prints ids from load errors.

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
