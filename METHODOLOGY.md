# Piste Planner — Scheduling Methodology

This document defines the rules, constraints, and penalty weights that Piste Planner uses to **suggest** a tournament schedule. The scheduling algorithm produces an initial layout; users then refine it via drag-and-drop on a day/strip grid. The engine re-validates after each adjustment, surfacing warnings and errors.

For tournament organizers evaluating the tool, developers contributing to the codebase, and LLMs reasoning about scheduling rules.

For the underlying code, see [`src/engine/`](src/engine/). For USA Fencing source documents, see [References](#references).

Piste Planner models tournament scheduling as a resource-constrained scheduling problem: strips are general-purpose queues (each pool is a unit of work during the pool round; double-stripping splits one pool across two strip queues; each bout is a unit of work during DEs), referees are workers feeding off the queues, and the scheduler packs competitions into day/time/strip bins, minimizing constraint violations.

---

## Table of Contents

1. [Inputs and Outputs](#inputs-and-outputs)
2. [Hard Constraints](#hard-constraints)
3. [Warning-Level Rules](#warning-level-rules)
4. [Relaxable Constraints](#relaxable-constraints)
5. [Soft Preferences](#soft-preferences)
6. [Constraint Relaxation](#constraint-relaxation)
7. [Competition Math](#competition-math)
   - [Pool Composition](#pool-composition)
   - [Strip Budget](#strip-budget)
   - [Flighting](#flighting)
   - [Direct Elimination (DE)](#direct-elimination-de)
8. [Resources](#resources)
   - [Strip Assignment](#strip-assignment)
   - [Referee Calculation](#referee-calculation)
9. [Scheduling Algorithm](#scheduling-algorithm)
10. [Tournament-Type Policies](#tournament-type-policies)
11. [Auto-Suggestion Logic](#auto-suggestion-logic)
12. [Capacity-Aware Day Assignment](#capacity-aware-day-assignment)
13. [References](#references)

[Appendix A: Penalty & Constant Defaults](#appendix-a-penalty--constant-defaults)

---

## Inputs and Outputs

### Inputs

- **Competition list**: each competition has a gender, age category, weapon, event type (individual or team), and estimated fencer count (see [`types.ts`](src/engine/types.ts) for data model)
- **Venue resources**:
  - **General strips**: used for pools or DEs; total count is optional — see [Auto-Suggestion Logic](#auto-suggestion-logic) — engine can suggest based on the largest single competition's pool count (see [`analysis.ts`](src/engine/analysis.ts))
  - **Video strip count** (NACs only): 4, 8 (default), 12, or 16. These strips are used for the Video stage of staged DEs. Default of 8 covers a standard Round of 16. Multiple events in the video stage contend for these strips.
- **Referee policy** (not counts — counts are an output, see below):
  - **Refs per pool**: 1 or 2 (default: 2) — affects how many refs the engine reports as needed
  - **Use pod captains**: toggle that adds supervisory refs to DE rounds (see [Pod Captains](#pod-captains))
- **Tournament duration**: 2–4 days (longer events, e.g. Summer Nationals, to be supported in a future version)
- **Per-competition options**:
  - **DE mode**: determined by tournament type — NACs use "Staged DEs" (Prelim + Video stages); all other types use "Single Stage DE" (all DE rounds run as fast as possible)
  - **Video stage** (NACs only): the round at which DEs move to video strips, determined by age category per Ops Manual Ch.4, p.25 (see [Video Replay Policy](#video-replay-policy))
  - **Cut-to-DE**: % cut (e.g., cut 20% → promote 80%) or promoted count (e.g., promote top 256)
  - **Start time**: defaults to 8:00 AM; user can adjust per day
  - **Latest end time**: violation produces a warning with estimated finish time, not a scheduling failure
  - **Flighting**: triggered when a competition's pool count exceeds the per-event strip cap (see [Strip Budget](#strip-budget))

### Outputs

- **Day assignment** for each competition
- **Pool round timing**: start and end times per competition
- **DE phase timing**: prelim and video stage blocks with strip allocations (NACs); single block (all others)
- **Referee requirements**: per-day peak demand, computed from the schedule. Reported as two numbers per day:
  - **3-weapon refs needed** — peak total refs across all bouts (any weapon)
  - **Saber refs needed** — peak refs needed for saber bouts specifically (a subset of the total). Saber bouts can only be officiated by 3-weapon refs, so this number sets the floor on the 3-weapon-certified portion of the staff.
  - Foil/epee-only refs can fill the gap between the saber-refs and total-refs numbers. The organizer chooses the split when staffing.
- **Bottleneck diagnostics**: warnings and errors identifying resource conflicts, constraint relaxations, or policy violations

All times are minutes from midnight (e.g., 480 = 8:00 AM). The scheduling day runs from 8:00 AM to 10:00 PM (14 hours). Pool rounds cannot start after 4:00 PM. (see [`constants.ts`](src/engine/constants.ts))

---

## Hard Constraints

These rules cause scheduling to fail or produce errors. They are never relaxed. (see [`crossover.ts`](src/engine/crossover.ts), [`dayAssignment.ts`](src/engine/dayAssignment.ts))

### Same-Population Conflicts

- Two competitions with **identical age category, gender, and weapon** cannot be on the same day

### Overlapping-Population Separation (Group 1)

Overlapping age categories MUST be on **different days** (per weapon and gender). This prevents fencers who compete in multiple age categories from having schedule conflicts. (Ops Manual Ch.4, pp.26–27 — Group 1: Mandatory Criteria)

- **Always different days at NACs** (same weapon and gender):
  - DIV1 and DIV1A — never same day (near-total fencer overlap)
  - DIV1 and JUNIOR — never same day
  - JUNIOR and CADET — never same day
  - CADET and DIV1 — allowed in rare cases only
  - Y10 and Y12 — different days
  - Y12 and Y14 — different days
  - Y14 and CADET — different days
- **Exception**: Y8 CAN and SHOULD be on the same day as Y10
- **At smaller events** (ROC, RYC): youth categories CAN be on the same day if:
  - 4+ hours apart, AND
  - Allowed by USA Fencing policy
  - This should still be avoided when possible
- **Affinity for unrelated events** on the same day preferred
  - e.g., Y10 and Div 3 have no fencer overlap — good same-day pairing

(see [`constants.ts`](src/engine/constants.ts) — `GROUP_1_MANDATORY`, `CROSSOVER_GRAPH`)

### Single-Day Fit

- A competition's worst-case duration (pool round + 30-minute admin gap + full DE) must fit within the 14-hour day
- If an individual and team event are on the same day, their combined worst-case duration (including the 2-hour gap) must also fit

### Resource Preconditions

Strips are a precondition; referees are not (refs are calculated from the schedule, not supplied as input). `validateConfig` must enforce:

**Strip minimum**: Every event must be able to run all its pools at once (or in two flights for flighted events):

```
strips_total >= max_pools_any_event
```

Where `max_pools_any_event = max(ceil(fencer_count / 7))` across all events. For flighted events (200+ fencers in eligible categories), the requirement is halved: `ceil(pools / 2)`.

This is a **hard validation error**, not a warning. The UI should auto-suggest a strip count meeting this minimum when the user enters competition sizes.

**Video strip minimum**: Tournaments with Cadet/Junior/Div 1 events (staged DE with video REQUIRED) need sufficient video strips for concurrent DE phases. Video strips come in multiples of 4. Minimum 4; 8+ recommended when multiple video-required events share a day.

**Referees are not validated up front.** The engine assumes refs are available for every bout it schedules and reports the resulting peak demand as an output (see [Outputs](#outputs) and [Referee Calculation](#referee-calculation)). The organizer reads those numbers and staffs accordingly; understaffing is handled at staffing time, not by the scheduler.

### Team Events Require a Matching Individual

- Every team competition must have a corresponding individual competition in the same age category, gender, and weapon
- If user selects Team, the corresponding Individual event is automatically enabled and cannot be disabled unless team is first disabled.
- Validated before scheduling begins (see [`validation.ts`](src/engine/validation.ts))

### Team Events Cannot Use Cuts

- Team competitions always advance all entered teams to the DE phase
- Cut-to-DE settings are rejected in validation AND not allowed in the UI

### Fencer Count Bounds

- Each competition must have between 2 and 500 fencers
- Events outside this range are rejected in validation

---

## Warning-Level Rules

These rules produce warnings but do not block scheduling.

### Same-Day Completion

- A competition that starts on a given day should finish on that day
- If the DE phase would extend past the end of the day, the engine flags a warning with the estimated finish time but does not block scheduling

---

## Relaxable Constraints

These constraints apply as infinite penalties at constraint relaxation levels 0–2, behaving like hard blocks. At level 3 (last resort), they are relaxed. See [Constraint Relaxation](#constraint-relaxation).

### Individual/Team Separation

Hard-blocked pairs (Infinity penalty at level < 3, same weapon+gender required):
- **Veteran ind ↔ Veteran team**: overlapping fencer pool
- **Div 1 ind ↔ Junior team**: Junior team draws from Div 1 individual pool
- **Junior ind ↔ Div 1 team**: Div 1 team draws from Junior individual pool

(see [`constants.ts`](src/engine/constants.ts) — `INDIV_TEAM_RELAXABLE_BLOCKS`)

**For other overlapping individual/team pairs**: 4-hour separation required, in either direction
  - e.g., Vet Team at 8 AM allows Div 2 Individual at 10 AM
  - Individual before team is a soft preference, not a hard rule

---

## Soft Preferences

These factors influence day assignment through a weighted penalty system. The auto-suggest algorithm assigns each competition to the day with the lowest total penalty. Penalties are listed in approximate order of strength. All weights will become configurable in a future release. (see [`dayAssignment.ts`](src/engine/dayAssignment.ts))

See Appendix A for exact values.

### Demographic Crossover

- Piste Planner models fencer overlap with a **crossover graph** encoding the fraction of fencers shared between any two age categories (same gender and weapon) (see [`crossover.ts`](src/engine/crossover.ts))
- Maximum crossover weight per edge: **0.8** (capped)
- Examples:
  - Y12 → Y14: 0.8 (nearly all Y12 fencers also enter Y14)
  - Cadet → Junior: 0.8 (typical overlap at NACs)
  - Junior → Div 1A: 0.8 (almost always)
  - Veteran → Div 1: 0.8 (high overlap at NACs)
- Two-hop indirect relationships computed automatically, capped at 0.3
- When two high-crossover competitions are on the same day within 30 minutes: **strong penalty**
- Lower crossover within 30 minutes: **moderate penalty**

### Early-Start Conflicts

- Two high-crossover competitions both starting at 8:00 AM on the **same day**: penalty
- Two high-crossover competitions both starting at 8:00 AM on **consecutive days**: penalty (forces families to arrive early two days in a row)
- Individual + team (same weapon, gender, and category) both starting early on consecutive days: penalty

### Rest Day Preference

- Junior and Cadet (same weapon): consecutive days without rest → penalty
- Junior and Div 1 (same weapon): consecutive days without rest → penalty
- Source: Ops Manual Ch.4, p.26 — Group 2: Highly Desirable (not mandatory)

### Proximity Preference

- Related categories should be on **adjacent days** (e.g., Friday/Saturday), not far apart
  - BAD: Junior Men's Epee on Friday, Div 1 Men's Epee on Monday
- 1 day apart: bonus (preferred)
- 2 days apart: neutral (0.0)
- 3+ days apart: penalty

(see [`constants.ts`](src/engine/constants.ts) — `PROXIMITY_GRAPH`, `PROXIMITY_PENALTY_WEIGHTS`)

### Weapon Balance

- Each day should have a mix of ROW weapons (foil/saber) and epee
- An all-ROW or all-epee day: penalty
- Penalty should be proportional to competition size

### Other Soft Preferences

| Preference | Penalty | Condition |
|---|---|---|
| Soft Separation (DIV1↔CADET) | 5.0 | Same weapon+gender on same day; suppressed at level >= 2. Different weapon or gender does not trigger. (see `SOFT_SEPARATION_PAIRS`) |
| Soft Separation (DIV1↔DIV2) | 3.0 | Same weapon+gender on same day; suppressed at level >= 2. (see `SOFT_SEPARATION_PAIRS`) |
| Soft Separation (DIV1↔DIV3) | 3.0 | Same weapon+gender on same day; suppressed at level >= 2. (see `SOFT_SEPARATION_PAIRS`) |
| Cross-Weapon Same Demographic | 0.2 | Same gender+age, different weapon, same day (Veterans only) |
| Y8/Y10 Early Scheduling | 0.3 | Y8/Y10 not starting at 8:00 AM |

### Individual-Team Proximity

- Applies to **Senior, Junior, and Cadet** only
- Team event preferred the day after individual: bonus
- Team before individual: penalty (soft preference, not hard)
- 2+ days apart: penalty
- **Veteran team**: must be adjacent to ANY veteran individual of the same weapon/gender (Vet Combined or Vet Age 40–80)

(see Appendix A for exact values)

---

## Constraint Relaxation

The scheduling system uses three tiers of constraints: **Hard** (never relaxed), **Relaxable** (infinite penalty at levels 0–2, relaxed at level 3), and **Soft** (finite penalties, active at level 0). Progressive relaxation proceeds through these tiers when no valid assignment exists.

(see [`dayAssignment.ts`](src/engine/dayAssignment.ts))

| Level | What's Relaxed |
|---|---|
| 0 (full constraints) | All rules active: hard blocks, relaxable ind/team pairs, soft preferences, proximity |
| 1 | Drops proximity preferences (Proximity Preference, Individual-Team Proximity distance penalty) |
| 2 | Drops soft crossover penalties and Soft Separation (DIV1↔CADET); overlapping populations may share a day, but same-population hard blocks remain |
| 3 | Drops relaxable constraints (Individual/Team hard blocks); same population still produces a warning but is allowed as last resort |

- Each relaxation emits a warning
- If no valid day exists even at Level 3, scheduling fails with an unresolvable error

---

## Competition Math

### Pool Composition

Pool structure follows USA Fencing rules (Athlete Handbook Table 2.16.1, pages 90–91). (see [`pools.ts`](src/engine/pools.ts))

#### Pool Sizing

- 9 or fewer fencers: single pool of all fencers
- 10 fencers without override: 2 pools of 5
- 10+ fencers: pools targeting 6–7 fencers each → `ceil(fencerCount / 7)` pools
- Remainder fencers distributed so some pools get one extra fencer

#### Pool Duration Estimation

See [Appendix A](#pool-duration-by-weapon-6-person-baseline-15-bouts) for base durations by weapon (6-person pool, 15 round-robin bouts).

- Other pool sizes scaled proportionally by bout count
  - e.g., 7-person pool = 21 bouts → ~1.4x baseline
- Pools with 8+ fencers are **double-stripped** (two bouts simultaneously), reducing effective duration by ~40% (not exactly half due to friction between bouts and fencer rest time)

#### Pool Parallelism

- Concurrent pools = min(available strips, total pools)
- Total pool round duration: `weighted_avg_pool_duration × ceil(total_pools / effective_parallelism)`

### Strip Budget

The strip budget model limits how many strips any single competition may occupy during pools or DEs, preventing one large event from monopolising the venue. (see [`stripBudget.ts`](src/engine/stripBudget.ts))

#### Global Percentages

- `max_pool_strip_pct` on `TournamentConfig` — fraction of total strips a competition may use for pools (default `0.80`)
- `max_de_strip_pct` on `TournamentConfig` — fraction of total strips a competition may use for DEs (default `0.80`)

#### Per-Event Overrides

- `max_pool_strip_pct_override` on `Competition` — when non-null, replaces the global pool percentage for that event
- `max_de_strip_pct_override` on `Competition` — when non-null, replaces the global DE percentage for that event

#### Key Functions

- `computeStripCap(strips_total, pct, override)` — returns `floor(strips_total × effectivePct)`, where `effectivePct` is the override if provided, otherwise the global percentage
- `recommendStripCount(competitions, config)` — advisory: suggests a strip total that keeps each competition within its pool cap
- `flagFlightingCandidates(competitions, config)` — returns competition IDs where `n_pools > pool_strip_cap`

### Flighting

Flighting splits a large competition's pool round into exactly two flights (Flight A and Flight B), using **half the strips for double the time**. Two flights is the maximum — three or more flights are not used in USA Fencing operations. The schedule marks the competition as "flighted" but does not track Flight A/B start/end times separately — only total pool round duration matters. (see [`flighting.ts`](src/engine/flighting.ts))

#### Trigger

A competition is a flighting candidate when its pool count exceeds the per-event strip cap:

- `pool_strip_cap = floor(strips_total × max_pool_strip_pct)` (default 80%)
- Per-event override: `max_pool_strip_pct_override` on a `Competition` replaces the global percentage for that event
- `flagFlightingCandidates()` returns competition IDs where `n_pools > pool_strip_cap` (see [`stripBudget.ts`](src/engine/stripBudget.ts))

#### How Flighting Works

- The **larger event** becomes flighted (uses half the strips, double the time)
- Smaller events get priority to start and run in parallel with the first flight
- Flighted events have a strong affinity for the 8:00 AM time slot

#### Flighting Group Suggestion

- Flighting is suggested when two same-day competitions' combined pool count exceeds `strips_total` but each fits individually within `pool_strip_cap`

### Direct Elimination (DE)

(see [`de.ts`](src/engine/de.ts), [`scheduleOne.ts`](src/engine/scheduleOne.ts))

#### Bracket Sizing

- DE bracket = next power of 2 at or above fencers advancing from pools
- Advancement depends on cut-to-DE setting:
  - **% cut**: `round(fencerCount × (1 - cutPercentage / 100))`
  - **Promoted count**: `min(promotedValue, fencerCount)`
  - **Disabled**: all fencers advance
- Minimum 2 fencers always advance

#### Default Cuts by Age Category

| Age Category | Default Cut | Notes |
|---|---|---|
| Y8, Y10, Y12 | Disabled (100% advance) | |
| Y14, Cadet, Junior, Div 1 | 20% cut (80% advance) | Except at ROCs, SYC, RJCC → 100% advance |
| Div 1A | Disabled (100% advance) | Except at Summer Nationals → 80% advance |
| Div 2, Div 3 | Disabled (100% advance) | |
| Veteran | Disabled (100% advance) | |

#### DE Modes

Determined by event type. NACs always use Staged DEs, with the stage round starting per the Video Policy (NACs always have video). All other event types use Single Stage.

- **Single Stage DE**: all DE rounds run on allocated strips as fast as possible
  - Video replay is not applicable
  - Optimal strips: `floor(bracketSize / 2)`
- **Staged DEs** (NACs only): two phases — **Prelim** and **Video**
  - The Video stage round is determined by age category (see [Video Replay Policy](#video-replay-policy))
  - Structure: Prelim DEs → Video stage (on video strips)
  - Multiple events in the Video stage contend for the available video strips

#### DE Phase Breakdown (for Staged DEs)

- Bracket above the video round: Prelim phase on general strips, then Video phase on video strips
- Bracket at or below the video round: Video phase only
- Duration split proportionally by bout count

#### Video Replay Policy

At national tournaments, video replay is guaranteed from a specific DE round per age category. At local/regional tournaments, video replay is optional. (Ops Manual Ch.4, p.25)

As such, video strips are automatic when the type is NAC. For all other tournament types, video strips might be available but are never guaranteed, and so *do not affect scheduling.*

| Age Category | Guaranteed From | Notes |
|---|---|---|
| Div 1, Junior, Cadet | Round of 16 | |
| Y10, Y12, Y14 | Round of 8 | |
| Vet 50, Vet 60, Vet 70 | Round of 8 | |
| Div 1A, Div 2, Div 3 | Round of 4 | |
| Vet 40, Vet 80, Vet Combined | Round of 4 | |
| Teams | Gold/Bronze only | Gold medal bout scheduling not tracked — negligible impact |

- Phases before the video round run on general strips
- The video round and beyond run on video strips

---

## DE Strip Allocation Models

(see [`capacity.ts`](src/engine/capacity.ts), controlled by `de_capacity_mode` on `TournamentConfig`)

Two models compute how many strip-hours an individual DE event consumes. Team events always use greedy regardless of mode.

### Configuration

- `de_capacity_mode: 'pod' | 'greedy'` on `TournamentConfig` – default `'pod'`

### Constants

- `DE_POD_SIZE = 4` strips per pod
- `DE_BOUT_DURATION`: `{ EPEE: 20, FOIL: 20, SABRE: 10 }` minutes per bout

### Pod Model (`de_capacity_mode: 'pod'`)

Strips are organized into independent pods of 4 running sub-brackets in parallel.

**Pod structure:**

- `n_pods = ceil(strips / DE_POD_SIZE)`; remainder strips distributed so larger pods get one extra strip when not evenly divisible
- All pods fence simultaneously – no serial pod sequencing

**R16 consolidation:**

- When 16 fencers remain across all pods, all pods merge to a single pod of 4 strips
- Strips freed at consolidation become available for other events
- QF runs on 4 strips; SF runs on 2 strips (the other 2 freed for cross-event use)

**Finals exclusion:**

- Gold medal bout runs on a dedicated finals strip, excluded from capacity planning

**Duration scaling:**

- Elapsed time computed from bout counts per round (theoretical)
- Strip-hours scaled by `table_duration / bout_based_duration` to stay calibrated to empirical table data

### Greedy Model (`de_capacity_mode: 'greedy'`)

No pods – all strips treated as a single undifferentiated pool.

- `strip_hours = total_bouts × bout_duration / 60`
- Strip-count-independent: the same total strip-hours regardless of how many strips are allocated
- No duration scaling applied

### Team Events

Team DEs always use the greedy/round-by-round model regardless of `de_capacity_mode`.

- All bouts in a round run simultaneously – one strip per bout
- Rounds are strictly sequential
- Non-power-of-2 entry counts produce play-in bouts in the opening round
- Finals excluded from capacity planning (same as individual)

---

## Resources

### Strip Assignment

(see [`resources.ts`](src/engine/resources.ts))

#### Video Strip Preservation

Video strips are primarily reserved for staged DE phases (R16, QF, SF, Finals). Pool rounds may use video strips only under these conditions:

- **Start-of-day pool wave**: video strips MAY be used by pool rounds running at day start (the first pool wave, when many events open concurrently). Once this wave ends, video strips become reserved for DEs — a later event starting its pools mid-day must run on general strips only.
- **Single-event day**: when only one competition is scheduled for the entire day, video strips remain available for that event's pools at any time (morning or end-of-day). A single event cannot conflict with its own DEs (its DE phases run strictly after its pools), so reserving video strips adds no value.
- **Multi-event mid-day pools**: not allowed. Once the morning pool wave completes on a multi-event day, video strips are locked to DE-only usage.

Phase-level rules:
- **`videoRequired=true`** (staged DE R16, QF, SF, Finals): only video-capable strips are considered.
- **`videoRequired=false` for DE prelims / single-stage DEs**: non-video strips selected first; video strips used as overflow when general strips are exhausted.
- **`videoRequired=false` for pools**: subject to the pool-specific rules above (start-of-day wave, or single-event day).

#### Resource Windows

- For each phase (pool round, DE prelim, DE video stage), the engine finds the earliest time slot where strips are available
- If strips aren't available at the ideal time, the engine scans forward in 30-minute slots
- If delay exceeds a threshold, a strip-contention bottleneck diagnostic is emitted

#### Slot Granularity

- All phase start times snap to 30-minute boundaries (8:00, 8:30, 9:00, etc.)
- End times are not snapped — they reflect actual estimated duration

### Referee Calculation

Referees are an **output** of the scheduler, not an input. After the schedule is built, the engine sweeps every concurrent bout window and reports the peak ref demand per day. The organizer uses these numbers to staff the tournament.

(see [`refs.ts`](src/engine/refs.ts))

#### Referee Types Reported

- **3-weapon refs**: can officiate foil, epee, and saber. The reported "total refs needed" assumes this is the floor.
- **Foil/epee-only refs**: cannot officiate saber. The organizer can substitute foil/epee-only refs for any ref slot **not** covering a saber bout — i.e., up to `total_refs_needed − saber_refs_needed` per day.

#### Per-Day Output

For each day, the engine computes:

- **`peak_total_refs`**: maximum number of refs needed at any one moment, across all events and weapons
- **`peak_saber_refs`**: maximum number of refs needed at any one moment for saber bouts specifically (subset of total)
- **`peak_time`**: the moment of peak demand (informational)

The minimum 3-weapon staff is `peak_saber_refs`. The remaining `peak_total_refs − peak_saber_refs` slots can be filled by either certification.

#### Refs Per Pool (input that affects the output)

- **One ref per pool**: minimum
- **Two refs per pool** (default): preferred for higher-level events
- **Auto**: uses two-per-pool

This setting changes how many refs the engine reports as needed; it does not gate scheduling.

(Logic implemented in `pools.ts:resolveRefsPerPool`. Double-duty referee logic also lives in `pools.ts`: when `refsPerPool=1`, one ref can be reported as covering two adjacent strips.)

#### Pod Captains

- Toggle: "Use Pod Captains to manage DEs"
- When enabled, the reported ref demand includes supervisory pod captains:
  - **1 per 4 strips** for brackets ≤32 and R16 phases
  - **1 per 8 strips** for larger brackets and other phases
- A `FORCE_4` override option sets the ratio to 1 per 4 strips unconditionally
- Pod captains supervise groups of strips during DE phases (NACs)

---

## Scheduling Algorithm

The auto-suggest engine uses a **priority-ordered, constraint-relaxing** approach to generate an initial schedule. The result is a **suggestion** — users can drag-and-drop competitions on the day/strip grid to refine it. The engine re-validates after each manual adjustment, showing warnings and errors for constraint violations. (see [`scheduler.ts`](src/engine/scheduler.ts), [`dayAssignment.ts`](src/engine/dayAssignment.ts), [`scheduleOne.ts`](src/engine/scheduleOne.ts))

### Phase 1: Validation

- All competitions and configuration validated against hard rules (see [Hard Constraints](#hard-constraints))
- Any ERROR-severity violation aborts scheduling immediately
- Warnings collected and carried forward

### Phase 2: Pre-Scheduling Analysis

Analysis passes run before the main scheduling loop. `initialAnalysis()` is a pre-scheduling check called from the UI layer, not from `scheduleAll()` directly. (see [`analysis.ts`](src/engine/analysis.ts))

1. Total pool demand vs. strips — warns if any day's total pools exceed strip count
2. Per-competition strip deficit — warns if a single competition's pools exceed the effective strip cap (`pool_strip_cap`) and flighting is not enabled
3. Flighting suggestions — identifies same-day pairs that would benefit from flighting
4. Multiple-flighting conflicts — warns if more than one flighted competition lands on the same day
5. Video strip demand — warns if peak video-strip need exceeds video-capable strips
6. Flighting-group video conflicts — warns if flighted competitions in the same group have conflicting video strip requirements
7. Cut summaries — informational breakdown of advancement numbers per competition

### Phase 3: Priority Ordering

Competitions sorted by **constraint score** (highest first = scheduled first). Most constrained competitions get first pick. (see [`scheduler.ts`](src/engine/scheduler.ts))

Score factors:
- **Crossover count**: how many other competitions this one conflicts with
- **Window tightness**: how narrow the allowed time window is
- **Video scarcity** (NACs only): ratio of staged DE events requiring video to video strips
- **Referee intensity**: events requiring 2 refs/pool score higher (2.0) than 1 ref/pool (0.5) — purely a tie-breaker; no ref supply is consulted

Within this ordering:
- Mandatory competitions before optional
- Flighting pairs kept together at the priority competition's score position

### Phase 4: Day Assignment

For each competition in priority order:

- Evaluate every available day; pick the one with the **lowest total penalty**
- Penalty = sum of all applicable soft preferences vs. competitions already scheduled
- If no day has finite penalty at current constraint level, escalate through [Constraint Relaxation](#constraint-relaxation)

### Phase 5: Resource Allocation

Once a day is chosen, find the earliest time window with strips available: (see [`scheduleOne.ts`](src/engine/scheduleOne.ts))

1. **Pool round**: allocate strip window for all pools (or half strips if flighted)
2. **Admin gap**: 30-minute mandatory gap between pool end and DE start, snapped to next 30-minute slot
3. **DE phases** (NACs, staged): Prelim phase on general strips, then Video phase on video strips

If strips unavailable at ideal time, scan forward in 30-minute slots. If end time would breach the day boundary, retry with an earlier start slot (up to 3 attempts). If all retries fail, a deadline breach warning is recorded.

Ref demand intervals are recorded as a side effect of each phase allocation; they are summarized into per-day peak totals in Phase 7.

### Phase 6: State Update

- After each competition is scheduled, its resource usage is committed to shared global state
- Subsequent competitions see updated availability

### Phase 7: Post-Schedule Outputs and Warnings

- **Referee requirements** computed by sweeping the recorded ref demand intervals (see [Referee Calculation](#referee-calculation)). Reported as `peak_total_refs` and `peak_saber_refs` per day.
- For 4+ day events, warns if first or last day is significantly longer than average (unbalanced load)

---

## Tournament-Type Policies

(see [`constants.ts`](src/engine/constants.ts), [`catalogue.ts`](src/engine/catalogue.ts))

Selecting the tournament type enables / disables events available in the tournament picker. For example, NACs do not have Div 1A. Only NACs have Team events. ROCs do not have Vet Age or Team events. Regional types (ROC, RYC, RJCC) can be combined — their available events are merged.

### NAC (North American Cup)

- All possible events except Div 1A.
- Full crossover rules apply (Group 1 mandatory separations, rest day preferences)
- Default cuts: Y14/Cadet/Junior/Div 1 at 80% advancement to DE
- Staged DEs with video replay for Cadet, Junior, Div 1
- Typically 3–4 day events with large fields (100+ fencers in major categories)
- Predefined templates for common NAC formats (Youth, Cadet/Junior, Div 1/Junior, etc.)

### ROC (Regional Open Circuit)

- Uses VET_COMBINED (no individual veteran age-group breakdown)
- Div 1A and Veteran categories are the primary focus
- 100% advancement to DE for Div 1A and Veteran
- Can be combined with RJCC and RYC

### RYC / SYC (Regional / Super Youth Circuit)

- Youth categories (Y10, Y12, Y14)
- 100% advancement to DE
- Smaller fields; regional-scale fencer defaults
- Y10 preferred in first time slot
- RYC can be combined with RJCC and ROC
- SYC is the national-level variant; rules are identical

### RJCC / SJCC (Regional / Super Junior-Cadet Circuit)

- Cadet and Junior individual events
- 100% advancement to DE
- Can be combined with ROC and RYC
- SJCC is the national-level variant; rules are identical

---

## Auto-Suggestion Logic

The engine can auto-suggest configuration values to help organizers start with reasonable defaults. (see [`analysis.ts`](src/engine/analysis.ts), [`refs.ts`](src/engine/refs.ts))

### Strip Count Suggestion

- Finds the competition with the most pools (peak strip demand)
- Suggests that number of strips as the baseline

### Referee Output

Referee counts are computed from the schedule, not suggested as inputs (see [Referee Calculation](#referee-calculation)). The engine reports per-day `peak_total_refs` and `peak_saber_refs`; the organizer chooses the foil/epee-only vs 3-weapon split when staffing.

### Flighting Suggestion

See [Flighting](#flighting) and [Strip Budget](#strip-budget) for trigger rules and mechanics. The engine calls `flagFlightingCandidates()` to find competitions whose pool count exceeds `pool_strip_cap`, then identifies same-day pairs whose combined pool count exceeds `strips_total` but each individually fits within `pool_strip_cap`, and suggests flighting for the larger event.

### Fencer Count Defaults

See [Appendix A: Fencer Count Defaults](#fencer-count-defaults) for per-category, per-weapon, per-gender default fencer counts at NAC and regional scale.

---

## Capacity-Aware Day Assignment

Day assignment uses a **capacity-aware bin-packing** model. Each tournament day is a bin with a finite strip-hour budget; competitions are weighted items packed into those bins.

(see [`dayAssignment.ts`](src/engine/dayAssignment.ts))

### Strip-Hour Capacity

A day's capacity is measured in **strip-hours**: available strips × day length (14 hours). A day with 80 strips has 1,120 strip-hours of general capacity. For capacity scoring, video strips are tracked as a separate budget (see [Video-Strip Budget](#video-strip-budget)); however, at runtime the strip allocator can spill the start-of-day pool wave onto idle video strips, and on single-event days video strips remain available for pools throughout (see [Video Strip Preservation](#video-strip-preservation)).

Each competition's strip-hour draw is computed from its pool and DE phases:
- **Pool phase**: `n_pools × pool_duration_hours`
- **DE phase**: `strips_allocated × de_duration_hours`

For staged DEs (NACs), the video-strip draw is tracked separately.

### Age-Category Weights

Not all events consume a day equally. A 310-fencer Div 1 with staged video DEs anchors an entire day; a small Veteran Combined is comparatively lightweight. Each competition's strip-hour draw is multiplied by a category weight that reflects operational impact:

| Category | Weight | Notes |
|---|---|---|
| DIV1 | 1.5 | Heaviest — large fields, video DE serialization |
| JUNIOR, CADET | 1.3 | Heavy — video DE, large fields, early start |
| Y10 | 1.2 | Early start required |
| Y12, Y14 | 1.0 | Baseline |
| VET 40, VET 50 | 0.8 | Lighter; no start offset |
| DIV1A, DIV2, DIV3 | 0.7 | Lighter; can start early |
| VET Combined, VET 60, VET 70, VET 80 | 0.6 | Lightest; 2-hour start offset (medication timing for older athletes) |

### Capacity Penalty Curve

The day-assignment penalty for capacity fill ratio:

| Fill ratio | Penalty |
|---|---|
| < 0.60 | 0 — no penalty |
| 0.60–0.80 | Gentle ramp from 0 to 3.0 |
| 0.80–0.95 | Steep ramp from 3.0 to 10.0 |
| > 0.95 | 20.0 — strongly discouraged |

This is added to the existing soft-preference penalty total, so a nearly-full day is penalized heavily even when it has no crossover or separation issues.

### Video-Strip Budget

For day-assignment scoring, video strip capacity is tracked separately from general strip-hours. This budget governs how many staged-DE events a day can support; it does not prevent the runtime allocator from spilling non-video work onto idle video strips (see [Video Strip Preservation](#video-strip-preservation)).

Peak concurrent demand is modeled: as staged DE rounds progress (R16 → R8 → QF → Finals), earlier rounds release their video strips and those strips become available to other events. If peak demand exceeds 70% of the video strip total, a moderate penalty (5.0) is applied; at 100% of capacity the penalty rises to 15.0.

### Staged DE Strip Release

For NAC staged DEs, each round (R16, R8, QF, Finals) runs in sequence on video strips and then releases them. Freed strips become available to other events on the same day, so multiple events can share a video strip pool without serializing their entire DE phase.

---

> **Note:** Gender equity pool-count validation (proportional strip allocation by gender during pool rounds) is to be added in a future version.

## References

| # | Source | URL / Location |
|---|---|---|
| S1 | USA Fencing Operations Manual, 2019 Edition | [PDF](https://assets.contentstack.io/v3/assets/blteb7d012fc7ebef7f/blt13f7bd461d92bb1c/2019_Operations_Manual_4_2019_Final_1.pdf) — Chapter 4 (Tournament Management), Chapter 7 (Competition Procedures), Appendices |
| S2 | Change.org Petition: "Address Critical Scheduling Issues in National Fencing Events" (488 signatures, Feb 2024) | [Link](https://www.change.org/p/address-critical-scheduling-issues-in-national-fencing-events) |
| S3 | Academy of Fencing Masters: "Petition to Fix the Summer Nationals Schedule" (Feb 2024) | [Link](https://academyoffencingmasters.com/blog/petition-to-fix-the-summer-nationals-schedule/) |
| S4 | Academy of Fencing Masters: "USA Fencing National Events: Time for a Strategic Overhaul" (Nov 2024) | [Link](https://academyoffencingmasters.com/blog/usa-fencing-national-events-time-for-a-strategic-overhaul/) |
| S5 | Fencing Parents: "How much notice should US Fencing give for NAC day schedules?" (Jun 2021) | [Link](https://www.fencingparents.org/whats-new-in-fencing/2021/6/28/how-much-notice-should-us-fencing-give-for-day-schedules-checkin-times-and-policy-changes) |
| S6 | USA Fencing: "Take Note of These Updates to Events and Formats for the 2024-25 Tournament Season" (Jul 2024) | [Link](https://www.usafencing.org/news/2024/july/19/take-note-of-these-updates-to-events-and-formats-for-the-202425-tournament-season) |
| S7 | USA Fencing: "Event Combinations Announced for 2023-24 NACs and Championships" (May 2023) | [Link](https://www.usafencing.org/news/2023/may/31/event-combinations-announced-for-202324-usa-fencing-nacs-and-championships) |
| S8 | USA Fencing Athlete Handbook 2024-25 | [PDF](https://static1.squarespace.com/static/63d04398a7662e295f7c993a/t/6706d6a4b3f88e7f6a2a2467/1728501417355/USA_Fencing_Athlete_Handbook_2024-25.pdf) — Pool sizes, competition formats, gender equity |
| S9 | Academy of Fencing Masters: "How to Make USA Fencing National Events Work for Everyone" | [Link](https://academyoffencingmasters.com/blog/how-to-make-usa-fencing-national-events-work-for-everyone/) |
| S10 | Fencing Time tournament software documentation | [Link](https://www.fencingtime.com/Home/VerHistory) |

---

## Appendix A: Penalty & Constant Defaults

All numeric penalty values and scheduling constants used by the engine. Prose sections use qualitative descriptions only and reference this appendix for exact values.

(see [`dayAssignment.ts`](src/engine/dayAssignment.ts), [`crossover.ts`](src/engine/crossover.ts), [`constants.ts`](src/engine/constants.ts))

### Penalty Weights

| Factor | Value | Description |
|---|---|---|
| Same-time high crossover (≥0.8) | 10.0 | Two high-overlap competitions within 30-min window on same day |
| Same-time low crossover | 4.0 | Two low-overlap competitions within 30-min window on same day |
| Ind+team same-time or wrong order | 8.0 | Individual and team event (same demographic) overlapping or team scheduled first |
| Ind+team gap < 120 min | 3.0 | Individual and team event too close together |
| Early start consecutive days, high crossover | 5.0 | Two high-overlap events both at 8 AM on back-to-back days |
| Early start same day, high crossover | 2.0 | Two high-overlap events both at 8 AM same day |
| Early start consecutive days, ind+team | 2.0 | Ind + team (same weapon+gender+category) both at 8 AM on consecutive days |
| Soft separation (DIV1↔CADET) | 5.0 | Same weapon+gender on same day; suppressed at level ≥ 2 |
| Rest day violation | 1.5 | Junior↔Cadet or Junior↔Div 1 on consecutive days without rest |
| Team before individual | 1.0 | Team event scheduled before its individual counterpart |
| Weapon balance | 0.5 | All-ROW or all-epee day |
| Proximity 3+ days apart | 0.5 | Related categories far apart in the schedule |
| Y10 non-first-slot | 0.3 | Y10 event not starting at 8 AM |
| Ind+team 2+ days apart | 0.3 | Individual and team event far apart |
| Cross-weapon same demographic (Vet only) | 0.2 | Same gender+age, different weapon on same day (Veterans only) |
| Proximity 1 day apart | -0.4 | **Bonus**: related categories on adjacent days |
| Ind+team day after | -0.4 | **Bonus**: team event the day after individual |
| Same population | ∞ | **Hard block**: identical age category + gender + weapon |
| Group 1 mandatory separation | ∞ | **Hard block**: overlapping populations that must be on different days |
| Ind/team relaxable block | ∞ at level < 3 | **Relaxable**: specific ind/team cross-category pairs; relaxed at level 3 |

### Timing Constants

| Constant | Value | Description |
|---|---|---|
| Day start | 8:00 AM (480 min) | Earliest pool round start |
| Day end | 10:00 PM (1320 min) | Latest end time (soft boundary) |
| Day length | 14 hours | Total scheduling window |
| Pool-round cutoff | 4:00 PM (960 min) | Pool rounds cannot start after this time |
| Admin gap | 30 min | Mandatory gap between pool end and DE start |
| Slot granularity | 30 min | All phase start times snap to 30-minute boundaries |
| FLIGHT_BUFFER_MINS | 15 min | Buffer between flighted flights |
| THRESHOLD_MINS / EARLY_START_THRESHOLD | 10 min | Bottleneck detection threshold / early start window |
| SAME_TIME_WINDOW_MINS | 30 min | Window for same-time crossover penalty |

### Pool Duration by Weapon (6-person baseline, 15 bouts)

| Weapon | Duration |
|---|---|
| Epee | 120 min |
| Foil | 105 min |
| Saber | 75 min |

### Fencer Count Defaults

Sourced from integration test scenarios B1–B7 using real USA Fencing tournament data (2024–2026). Values are averaged across scenarios per category/weapon/gender, rounded to nearest 10.

**NAC-scale events** (per weapon × gender, individual):

| Category | E-M | F-M | S-M | E-W | F-W | S-W |
|----------|-----|-----|-----|-----|-----|-----|
| Div1 | 310 | 270 | 210 | 210 | 160 | 210 |
| Junior | 260 | 260 | 260 | 210 | 180 | 200 |
| Cadet | 250 | 220 | 270 | 210 | 200 | 210 |
| Y-14 | 230 | 210 | 230 | 180 | 200 | 200 |
| Y-12 | 210 | 230 | 180 | 170 | 200 | 170 |
| Y-10 | 80 | 110 | 80 | 60 | 70 | 70 |
| Div2 | 180 | 170 | 160 | 110 | 120 | 130 |
| Veteran | 120 | 80 | 40 | 80 | 40 | 50 |

**Regional-scale events** (SYC/SJCC/ROC, individual):

| Category | E-M | F-M | S-M | E-W | F-W | S-W |
|----------|-----|-----|-----|-----|-----|-----|
| Junior | 120 | 110 | 120 | 80 | 50 | 100 |
| Cadet | 130 | 70 | 110 | 70 | 80 | 100 |
| Y-14 | 120 | 140 | 130 | 110 | 110 | 100 |
| Y-12 | 110 | 110 | 110 | 100 | 80 | 90 |
| Y-10 | 50 | 50 | 60 | 50 | 40 | 40 |
| Div1A | 50 | 100 | 50 | 50 | 60 | 10 |
| Div2 | 60 | 70 | 50 | 60 | 20 | 30 |
| Veteran | 40 | 20 | 20 | 20 | 10 | 10 |

### Resource Constants

| Constant | Value | Description |
|---|---|---|
| Flighting threshold | n_pools > pool_strip_cap (default 80% of strips) | Strip-budget trigger; replaces old 200+ fencer rule |
| Video strip options | 4, 8, 12, 16 | Available video strip counts (NACs only); 8 is default |
| Pod captain ratio | 1 per 4 or 8 strips | Varies by bracket size/phase (see [Pod Captains](#pod-captains)) |
| Fencer count bounds | 2–500 | Valid range per competition |
| DE minimum advancement | 2 fencers | Minimum fencers advancing to DE bracket |
| Pool size targets | 6–7 | Target pool size; `ceil(fencerCount / 7)` pools |
| Maximum crossover weight | 0.8 | Crossover graph edge cap |
| Two-hop crossover cap | 0.3 | Indirect relationship cap |
| Ind/team separation gap | 120 min | Minimum gap between individual and team (non-hard-blocked pairs) |
| DE_REFS | 1 | One referee per DE bout |
| RefPolicy.AUTO | 1.0 | Middle constraint score (between TWO=2.0 and ONE=0.5) |
| DEFAULT_DE_DURATION_TABLE | (see `constants.ts`) | DE durations by bracket size and weapon |

### Capacity Model Constants

| Constant | Value | Description |
|---|---|---|
| DIV1 weight | 1.5 | Strip-hour multiplier (heavy: large fields + video serialization) |
| Junior weight | 1.3 | Strip-hour multiplier |
| Cadet weight | 1.3 | Strip-hour multiplier |
| Y10 weight | 1.2 | Strip-hour multiplier |
| Y12, Y14 weight | 1.0 | Baseline weight |
| Div1A, Div2, Div3 weight | 0.7 | Lighter weight |
| Veteran 40/50 weight | 0.8 | Lighter weight, no start offset |
| Veteran Combined/60/70/80 weight | 0.6 | Lightest; 120-min start offset from day start |
| Capacity penalty thresholds | [TBD] | Fill-ratio thresholds for penalty curve |
