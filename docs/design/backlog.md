# Backlog

Work no phase plan has picked up. Items here are not tracked in `specs/` – a
Spec Kit feature directory is created for one only when it is assigned a phase.

> **2026-10-04 plan**: [`competition-planner-workbench.md`](./competition-planner-workbench.md)
> §Roadmap orders the entries needed to finish the product into features
> 014–022 and lists the rest as after-finish work. **This file is the record,
> that table is the index** – do not restate detail there.

> **2026-10-04 update**: pruned. Every entry below is open work. Finished and
> superseded entries, including the former `# Closed` section, were removed –
> git history at `0ab5bd2dc9` preserves them, and each shipped feature's own
> `specs/` handoff records what it deliberately did not fix.

## `Bottleneck` has no structured field for a second subject

*Found by 010's test-quality review of T010 (R7), 2026-09-05. Recorded, not
fixed — `types.ts` is out of this feature's scope.*

`Bottleneck` (`src/engine/types.ts:354-362`) carries a single `competition_id`
plus a free-text `message`, with no field for a second subject. R7's
hard-edge-violation bottlenecks (010 T010,
`specs/010-wave-1-reconciliation/` (removed; git show 0ab5bd2dc9:specs/010-wave-1-reconciliation/))
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

**A second consumer coupled to message text.** `postScheduleDiagnostics`'s gate
(`concurrentScheduler.ts`) tells the demoted feasibility finding apart by
`b.message.startsWith('RESOURCE_INSUFFICIENT')`, because `Bottleneck` carries no
rule id – `ValidationError` has one and it is dropped when the finding is pushed.
Introduced by 011's T005 (2026-09-05) as the only option against today's
interface. It is safe as written, since 011's FR-001 and FR-002 pin that message
text and no other validation message starts with that prefix, but it is not
robust: reword the message and the "Strips: need N, have M" INFO silently stops
appearing on exactly the boards it exists for. Same root cause, so the same fix:
`Bottleneck` needs a rule id plus `subjects`. Two features have now coupled to
message text for want of one. 012 removed the number from the finding but the
prefix gate remains.

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
`specs/004-p3-workbench-shell/data-model.md` (removed; git show 0ab5bd2dc9:specs/004-p3-workbench-shell/data-model.md)
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
  (`drift-baseline.md` §T062 (specs/004-p3-workbench-shell/drift-baseline.md, removed; git show 0ab5bd2dc9:specs/004-p3-workbench-shell/drift-baseline.md)).
- **The factory's independence from the store is deliberate.** 008's
  research.md D2 (specs/008-team-event-cut/research.md, removed; git show 0ab5bd2dc9:specs/008-team-event-cut/research.md) argues it, and it
  is what let the parity check find the team-event bug at all. Converging the
  *rules* is not the same as having the factory call the store's helpers, and
  the argument against the latter still stands.

**B4 shows the same seam, with one unexplained event.** B4's app path places 18
where the ledger places 17 (found by 011's T006, 2026-09-05, recorded and not
reconciled by product-owner direction). The divergence is not new – it was
masked while both paths read 0, and 011's demotion of `feasibility-strip-hours`
made it visible. `validateConfig` on the ledger's B4 config returns twelve WARN
`regional-cut-override` findings, because B4 is an SYC and `buildConfig.ts`
applies `REGIONAL_CUT_OVERRIDES` for Y14 and Cadet while the ledger's factory
(`scenarios.ts:50-52`) cuts at 20%. It is recorded in
`__tests__/store/appPathParity.test.ts` as an FR-004a exception whose `cause` is
marked unconfirmed, and its `closedBy` names this item with that caveat. Whoever
takes this item runs B4's swap-one-default isolation first: if `cut_mode` does
not account for the +1, B4 needs its own owner and that `closedBy` is wrong.

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
