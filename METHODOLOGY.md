# Piste Planner — Scheduling Methodology

This document defines the rules, constraints, and penalty weights that Piste Planner uses to **suggest** a tournament schedule. The scheduling algorithm produces an initial layout; users then refine it via drag-and-drop on a day/strip grid. The engine re-validates after each adjustment, surfacing warnings and errors.

For tournament organizers evaluating the tool, developers contributing to the codebase, and LLMs reasoning about scheduling rules.

For the underlying code, see [`src/engine/`](src/engine/). For USA Fencing source documents, see [References](#references).

---

## Operations Research Framing

Piste Planner models tournament scheduling as a resource-constrained bin-packing problem:

- **Strips** are queues (general-purpose — used for pools or DEs)
  - During pools: each pool is a unit of work assigned to a strip queue
  - Double-stripping splits one pool across two strip queues
  - During DEs: each bout is a unit of work assigned to a strip queue
- **Referees** are workers feeding off the queues
- The scheduler packs competitions into day/time/strip bins, minimizing constraint violations

---

## Table of Contents

1. [Inputs and Outputs](#inputs-and-outputs)
2. [Hard Constraints](#hard-constraints)
3. [Soft Preferences](#soft-preferences)
4. [Penalty Defaults Table](#penalty-defaults-table)
5. [Pool Composition](#pool-composition)
6. [Flighting](#flighting)
7. [Direct Elimination (DE)](#direct-elimination-de)
8. [Strip Assignment](#strip-assignment)
9. [Referee Allocation](#referee-allocation)
10. [Auto-Suggestion Logic](#auto-suggestion-logic)
11. [Constraint Relaxation](#constraint-relaxation)
12. [Scheduling Algorithm](#scheduling-algorithm)
13. [Tournament-Type Policies](#tournament-type-policies)
14. [References](#references)

---

## Inputs and Outputs

### Inputs

- **Competition list**: each competition has a gender, age category, weapon, event type (individual or team), and estimated fencer count (see [`types.ts`](src/engine/types.ts) for data model)
- **Venue resources**:
  - **General strips**: used for pools or DEs; total count is optional — engine can suggest based on the largest single competition's pool count (see [`analysis.ts`](src/engine/analysis.ts))
  - **Video strip count** (NACs only): 4, 8 (default), 12, or 16. These strips are used for the Video stage of staged DEs. Default of 8 covers a standard Round of 16. Multiple events in the video stage contend for these strips.
- **Referees**:
  - **Total referee count**: optional — engine can suggest based on strip count (see [`refs.ts`](src/engine/refs.ts))
  - **3-weapon refs**: default — all refs are assumed 3-weapon (can officiate foil, epee, and sabre)
  - **Foil/epee-only refs**: user can optionally specify how many refs cannot officiate sabre; remainder are 3-weapon
  - **Refs per pool**: 1 or 2 (default: 2) — configured before auto-suggest runs
- **Tournament duration**: 2–4 days
- **Per-competition options**:
  - **DE mode**: determined by tournament type — NACs use "Staged DEs" (Prelim + Video stages); all other types use "Single Stage DE" (all DE rounds run as fast as possible)
  - **Video stage** (NACs only): the round at which DEs move to video strips, determined by age category per Ops Manual Ch.4, p.25 (see [Video Replay Policy](#video-replay-policy))
  - **Cut-to-DE**: % cut (e.g., cut 20% → promote 80%) or promoted count (e.g., promote top 256)
  - **Start time**: defaults to 8:00 AM; user can adjust per day
  - **Latest end time**: violation produces a warning with estimated finish time, not a scheduling failure
  - **Flighting**: only eligible for Cadet, Junior, and Div 1 events with 200+ fencers (see [`flighting.ts`](src/engine/flighting.ts))

### Outputs

- **Day assignment** for each competition
- **Pool round timing**: start and end times per competition
- **DE phase timing**: prelim and video stage blocks with strip allocations (NACs); single block (all others)
- **Bottleneck diagnostics**: warnings and errors identifying resource conflicts, constraint relaxations, or policy violations

All times are minutes from midnight (e.g., 480 = 8:00 AM). The scheduling day runs from 8:00 AM to 10:00 PM (14 hours). Pool rounds cannot start after 4:00 PM. (see [`constants.ts`](src/engine/constants.ts))

---

## Hard Constraints

These rules cause scheduling to fail or produce errors. They are not relaxed unless all softer options are exhausted (see [Constraint Relaxation](#constraint-relaxation)). (see [`crossover.ts`](src/engine/crossover.ts), [`dayAssignment.ts`](src/engine/dayAssignment.ts))

### Same-Population Conflicts

- Two competitions with **identical age category, gender, and weapon** cannot be on the same day
- This is the strongest constraint — returns infinite penalty

### Overlapping-Population Separation

Overlapping age categories MUST be on **different days** (per weapon and gender). This prevents fencers who compete in multiple age categories from having schedule conflicts. (Ops Manual Ch.4, pp.26–27 — Group 1: Mandatory Criteria)

- **Always different days at NACs** (same weapon and gender):
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

(see [`constants.ts`](src/engine/constants.ts) — `GROUP_1_MANDATORY_PAIRS`, `CROSSOVER_GRAPH`)

### Individual/Team Separation

- **Veteran team**: NEVER on the same day as veteran individual (same weapon/gender)
- **Junior team**: NEVER on the same day as Div 1 individual (same weapon/gender)
- **Senior team**: NEVER on the same day as Junior individual (same weapon/gender)
- **Div 1 individual and Senior team**: cannot be on the same day
- **For other overlapping individual/team pairs**: 2-hour separation required, in either direction
  - e.g., Vet Team at 8 AM allows Div 2 Individual at 10 AM
  - Individual before team is a soft preference, not a hard rule

### Team Events Require a Matching Individual

- Every team competition must have a corresponding individual competition in the same age category, gender, and weapon
- If user selects Team, the corresponding Individual event is automatically enabled and cannot be disabled unless team is first disabled.
- Validated before scheduling begins (see [`analysis.ts`](src/engine/analysis.ts))

### Team Events Cannot Use Cuts

- Team competitions always advance all entered teams to the DE phase
- Cut-to-DE settings are rejected in validation AND not allowed in the UI

### Fencer Count Bounds

- Each competition must have between 2 and 500 fencers
- Events outside this range are rejected in validation

### Single-Day Fit

- A competition's worst-case duration (pool round + 30-minute admin gap + full DE) must fit within the 14-hour day
- If an individual and team event are on the same day, their combined worst-case duration (including the 2-hour gap) must also fit

### Same-Day Completion

- A competition that starts on a given day must finish on that day
- If the DE phase would extend past the end of the day, the user is given a **warning** with the estimated finish time
- This is NOT a hard failure — the schedule is allowed but flagged

---

## Soft Preferences

These factors influence day assignment through a weighted penalty system. The auto-suggest algorithm assigns each competition to the day with the lowest total penalty. Penalties are listed in approximate order of strength. All weights will become configurable in a future release. (see [`dayAssignment.ts`](src/engine/dayAssignment.ts))

### Demographic Crossover

- Piste Planner models fencer overlap with a **crossover graph** encoding the fraction of fencers shared between any two age categories (same gender and weapon) (see [`crossover.ts`](src/engine/crossover.ts))
- Maximum crossover weight per edge: **0.8** (capped)
- Examples:
  - Y12 → Y14: 0.8 (nearly all Y12 fencers also enter Y14)
  - Cadet → Junior: 0.8 (typical overlap at NACs)
  - Junior → Div 1A: 0.8 (almost always)
  - Veteran → Div 1: 0.3 (moderate overlap)
  - Div 1 → Div 1A: 0.3 (moderate overlap)
- Two-hop indirect relationships computed automatically, capped at 0.3
- When two high-crossover competitions are on the same day within 30 minutes: **strong penalty** (10.0)
- Lower crossover within 30 minutes: **moderate penalty** (4.0)

### Early-Start Conflicts

- Two high-crossover competitions both starting at 8:00 AM on the **same day**: penalty 2.0
- Two high-crossover competitions both starting at 8:00 AM on **consecutive days**: penalty 5.0 (forces families to arrive early two days in a row)
- Individual + team (same demographic) both starting early on consecutive days: penalty 2.0

### Rest Day Preference

- Junior and Cadet (same weapon): consecutive days without rest → penalty 1.5
- Junior and Div 1 (same weapon): consecutive days without rest → penalty 1.5
- Source: Ops Manual Ch.4, p.26 — Group 2: Highly Desirable (not mandatory)

### Proximity Preference

- Related categories should be on **adjacent days** (e.g., Friday/Saturday), not far apart
  - BAD: Junior Men's Epee on Friday, Div 1 Men's Epee on Monday
- 1 day apart: bonus -0.4 (preferred)
- 2 days apart: neutral (0.0)
- 3+ days apart: penalty 0.5

(see [`constants.ts`](src/engine/constants.ts) — `PROXIMITY_GRAPH`, `PROXIMITY_PENALTY_WEIGHTS`)

### Weapon Balance

- Each day should have a mix of ROW weapons (foil/sabre) and epee
- An all-ROW or all-epee day: penalty 0.5
- Penalty should be proportional to competition size

### Cross-Weapon Same Demographic

- Penalty when same gender + age category but different weapon on same day: 0.2 per pair
- **Applies ONLY to Veteran events** — no other age categories have meaningful cross-weapon overlap

### Y10 Early Scheduling

- Y10 events preferred in the first time slot of their day
- If Y10 doesn't start at 8:00 AM: penalty 0.3
- Reason: avoid young fencers being at competitions late into the evening

### Last-Day Referee Shortage

- Large events on the last day when ref availability is below the daily average:
  - "Large" is relative to event type:
    - NAC: 300+ fencers is large → penalty 0.5
    - ROC: 100+ fencers is large → smaller penalty
  - Medium events (50–100 fencers): penalty 0.2

### Individual-Team Proximity

- Applies to **Senior, Junior, and Cadet** only
- Team event preferred the day after individual: bonus -0.4
- Team before individual: penalty 1.0 (soft preference, not hard)
- 2+ days apart: penalty 0.3
- **Veteran team**: must be adjacent to ANY veteran individual of the same weapon/gender (Vet Combined or Vet Age 40–80)

---

## Penalty Defaults Table

All penalty weights used by the auto-suggest algorithm. These will become configurable via a settings panel in a future release.

| Factor | Default | Description |
|---|---|---|
| Same-time high crossover (≥0.8) | 10.0 | Two high-overlap competitions within 30-min window on same day |
| Same-time low crossover | 4.0 | Two low-overlap competitions within 30-min window on same day |
| Ind+team same-time or wrong order | 8.0 | Individual and team event (same demographic) overlapping or team scheduled first |
| Ind+team gap < 120 min | 3.0 | Individual and team event too close together |
| Early start consecutive days, high crossover | 5.0 | Two high-overlap events both at 8 AM on back-to-back days |
| Early start same day, high crossover | 2.0 | Two high-overlap events both at 8 AM same day |
| Early start consecutive days, ind+team | 2.0 | Ind + team (same demographic) both at 8 AM on consecutive days |
| Rest day violation | 1.5 | Junior↔Cadet or Junior↔Div1 on consecutive days without rest |
| Team before individual | 1.0 | Team event scheduled before its individual counterpart |
| Weapon balance | 0.5 | All-ROW or all-epee day |
| Last-day ref shortage (large event) | 0.5 | Large event on last day with below-average ref availability |
| Proximity 3+ days apart | 0.5 | Related categories far apart in the schedule |
| Y10 non-first-slot | 0.3 | Y10 event not starting at 8 AM |
| Ind+team 2+ days apart | 0.3 | Individual and team event far apart |
| Cross-weapon same demographic (Vet only) | 0.2 | Same gender+age, different weapon on same day (Veterans only) |
| Last-day ref shortage (medium event) | 0.2 | Medium event on last day with below-average ref availability |
| Proximity 1 day apart | -0.4 | **Bonus**: related categories on adjacent days |
| Ind+team day after | -0.4 | **Bonus**: team event the day after individual |
| Same population | ∞ | **Hard block**: identical age category + gender + weapon |
| Group 1 mandatory separation | ∞ | **Hard block**: overlapping populations that must be on different days |

(see [`dayAssignment.ts`](src/engine/dayAssignment.ts), [`crossover.ts`](src/engine/crossover.ts), [`constants.ts`](src/engine/constants.ts))

---

## Pool Composition

Pool structure follows USA Fencing rules (Athlete Handbook Table 2.16.1, pages 90–91). (see [`pools.ts`](src/engine/pools.ts))

### Pool Sizing

- 9 or fewer fencers: single pool of all fencers
- 10 fencers with single-pool override: one pool of 10 (double-stripped)
- 10+ fencers: pools targeting 6–7 fencers each → `ceil(fencerCount / 7)` pools
- Remainder fencers distributed so some pools get one extra fencer

### Pool Duration Estimation

Baseline duration for a standard 6-person pool (15 round-robin bouts):

| Weapon | Duration |
|---|---|
| Epee | 120 min |
| Foil | 105 min |
| Sabre | 75 min |

- Other pool sizes scaled proportionally by bout count
  - e.g., 7-person pool = 21 bouts → ~1.4x baseline
- Pools with 8+ fencers are **double-stripped** (two bouts simultaneously), halving effective duration

### Pool Parallelism

- Concurrent pools = min(available strips, total pools, available refs ÷ refs-per-pool)
- Total pool round duration: `weighted_avg_pool_duration × ceil(total_pools / effective_parallelism)`

---

## Flighting

Flighting splits a large competition's pool round into two flights, using **half the strips for double the time**. The schedule marks the competition as "flighted" but does not track Flight A/B start/end times separately — only total pool round duration matters. (see [`flighting.ts`](src/engine/flighting.ts))

### Eligibility

- **Only** Cadet, Junior, and Div 1 events with **200+ fencers**
- Events below 200 fencers are never flighted
- Y10, Y12, Veteran, Div 2, Div 3, etc. are never flighted regardless of size

### How Flighting Works

- The **larger event** becomes flighted (uses half the strips, double the time)
- Smaller events get priority to start and run in parallel with the first flight
- Flighted events have a strong affinity for the 8:00 AM time slot

### Flighting Rules

- A flighted competition MUST be the largest event on its day — not allowed otherwise
- Flighting is suggested when two same-day competitions' combined pool count exceeds available strips, but each fits individually

---

## Direct Elimination (DE)

(see [`de.ts`](src/engine/de.ts), [`scheduleOne.ts`](src/engine/scheduleOne.ts))

### Bracket Sizing

- DE bracket = next power of 2 at or above fencers advancing from pools
- Advancement depends on cut-to-DE setting:
  - **% cut**: `round(fencerCount × (1 - cutPercentage / 100))`
  - **Promoted count**: `min(promotedValue, fencerCount)`
  - **Disabled**: all fencers advance
- Minimum 2 fencers always advance

### Default Cuts by Age Category

| Age Category | Default Cut | Notes |
|---|---|---|
| Y8, Y10, Y12 | Disabled (100% advance) | |
| Y14, Cadet, Junior, Div 1 | 20% cut (80% advance) | Except at ROCs, SYC, RJCC → 100% advance |
| Div 1A | Disabled (100% advance) | Except at Summer Nationals → 80% advance |
| Div 2, Div 3 | Disabled (100% advance) | |
| Veteran | Disabled (100% advance) | |

### DE Modes

Determined by event type. NACs always use Staged DEs, with the stage round starting per the Video Policy (NACs always have video). All other event types use Single Stage.

- **Single Stage DE**: all DE rounds run on allocated strips as fast as possible
  - Video replay is not applicable
  - Optimal strips: `floor(bracketSize / 2)`
- **Staged DEs** (NACs only): two phases — **Prelim** and **Video**
  - The Video stage round is determined by age category (see [Video Replay Policy](#video-replay-policy))
  - Structure: Prelim DEs → Video stage (on video strips)
  - Multiple events in the Video stage contend for the available video strips

### DE Phase Breakdown (for Staged DEs)

- Bracket above the video round: Prelim phase on general strips, then Video phase on video strips
- Bracket at or below the video round: Video phase only
- Duration split proportionally by bout count

### Video Replay Policy

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

## Strip Assignment

(see [`resources.ts`](src/engine/resources.ts))

### Video Strip Preservation

- When assigning strips for competitions that do NOT require video, non-video strips are selected first
- This preserves video-capable strips for NAC staged DEs (Cadet, Junior, Div 1)

### Resource Windows

- For each phase (pool round, DE prelim, DE video stage), the engine finds the earliest time slot where both strips AND refs are simultaneously available
- If resources aren't available at the ideal time, the engine scans forward in 30-minute slots
- If delay exceeds a threshold, a bottleneck diagnostic is emitted (strip contention, ref contention, or both)

### Slot Granularity

- All phase start times snap to 30-minute boundaries (8:00, 8:30, 9:00, etc.)
- End times are not snapped — they reflect actual estimated duration

---

## Referee Allocation

(see [`refs.ts`](src/engine/refs.ts))

### Referee Types

- **3-Weapon Refs** (default): can officiate foil, epee, and sabre
- **Foil/Epee-Only Refs**: cannot officiate sabre
- By default, all refs are assumed to be 3-weapon
- User can optionally specify a count of foil/epee-only refs

### Refs Per Pool

- **One ref per pool**: minimum
- **Two refs per pool** (default): preferred for higher-level events; falls back to one with a warning if insufficient refs
- **Auto**: uses two-per-pool when supply allows; drops to one otherwise

### Pod Captains

- Toggle: "Use Pod Captains to manage DEs"
- When enabled: 1 pod captain per 8 strips, drawn from the referee pool
- Pod captains supervise groups of strips during DE phases (NACs)

---

## Auto-Suggestion Logic

The engine can auto-suggest configuration values to help organizers start with reasonable defaults. (see [`analysis.ts`](src/engine/analysis.ts), [`refs.ts`](src/engine/refs.ts))

### Strip Count Suggestion

- Finds the competition with the most pools (peak strip demand)
- Suggests that number of strips as the baseline

### Referee Suggestion

- Heuristic: **one referee per strip in active use**
- Split proportionally between 3-weapon and foil/epee-only based on the sabre-to-foil/epee ratio of the competition mix
- Uses peak concurrent demand per weapon per day from a preliminary schedule simulation

### Flighting Suggestion

- Identifies same-day competition pairs whose combined pool count exceeds strip availability
- Only suggests flighting for Cadet, Junior, and Div 1 events with 200+ fencers
- Larger event becomes the flighted event; smaller events get scheduling priority

---

## Constraint Relaxation

When the auto-suggest algorithm cannot find a valid day at the strictest level, it progressively relaxes rules. (see [`dayAssignment.ts`](src/engine/dayAssignment.ts))

| Level | What's Relaxed |
|---|---|
| 0 (full constraints) | All crossover, proximity, and hard-block rules active |
| 1 | Drops proximity preferences (related categories no longer penalized for being far apart) |
| 2 | Drops soft crossover penalties (overlapping populations on same day allowed, but same-population hard blocks remain) |
| 3 | Drops hard blocks (same population allowed on same day — last resort) |

- Each relaxation emits a warning
- If no valid day exists even at Level 3, scheduling fails with an unresolvable error

---

## Scheduling Algorithm

The auto-suggest engine uses a **priority-ordered, constraint-relaxing** approach to generate an initial schedule. The result is a **suggestion** — users can drag-and-drop competitions on the day/strip grid to refine it. The engine re-validates after each manual adjustment, showing warnings and errors for constraint violations. (see [`scheduler.ts`](src/engine/scheduler.ts), [`dayAssignment.ts`](src/engine/dayAssignment.ts), [`scheduleOne.ts`](src/engine/scheduleOne.ts))

### Target Architecture: Bin Packing

The scheduling algorithm is moving toward a **bin-packing approach**:

- **Bin width** = number of available strips
- **Bin height** = day length (14 hours in 30-minute slots)
- Large events are placed first and prefer early time slots
- Smaller events are packed around and on top of larger events
- This replaces the current greedy forward-scanning approach

### Phase 1: Validation

- All competitions and configuration validated against hard rules (see [Hard Constraints](#hard-constraints))
- Any ERROR-severity violation aborts scheduling immediately
- Warnings collected and carried forward

### Phase 2: Pre-Scheduling Analysis

Analysis passes run before the main scheduling loop: (see [`analysis.ts`](src/engine/analysis.ts))

1. Total pool demand vs. strips — warns if any day's total pools exceed strip count
2. Per-competition strip deficit — warns if a single competition's pools exceed strips and flighting is not enabled
3. Flighting suggestions — identifies same-day pairs that would benefit from flighting
4. Multiple-flighting conflicts — warns if more than one flighted competition lands on the same day
5. Video strip demand — warns if peak video-strip need exceeds video-capable strips
6. Gender equity — checks pool count differences between men's and women's events (Athlete Handbook p.15)
7. Cut summaries — informational breakdown of advancement numbers per competition

### Phase 3: Priority Ordering

Competitions sorted by **constraint score** (highest first = scheduled first). Most constrained competitions get first pick. (see [`scheduler.ts`](src/engine/scheduler.ts))

Score factors:
- **Crossover count**: how many other competitions this one conflicts with
- **Window tightness**: how narrow the allowed time window is
- **Sabre scarcity**: for sabre events, ratio of sabre competitions to 3-weapon refs across days
- **Video scarcity** (NACs only): ratio of staged DE events requiring video to video strips
- **Referee intensity**: events requiring 2 refs/pool score higher (2.0) than 1 ref/pool (0.5)

Within this ordering:
- Mandatory competitions before optional
- Flighting pairs kept together at the priority competition's score position

### Phase 4: Day Assignment

For each competition in priority order:

- Evaluate every available day; pick the one with the **lowest total penalty**
- Penalty = sum of all applicable soft preferences vs. competitions already scheduled
- If no day has finite penalty at current constraint level, escalate through [Constraint Relaxation](#constraint-relaxation)

### Phase 5: Resource Allocation

Once a day is chosen, find the earliest time window with strips and refs available: (see [`scheduleOne.ts`](src/engine/scheduleOne.ts))

1. **Pool round**: allocate resource window for all pools (or half strips if flighted); reserve strips and refs
2. **Admin gap**: 30-minute mandatory gap between pool end and DE start, snapped to next 30-minute slot
3. **DE phases** (NACs, staged): Prelim phase on general strips, then Video phase on video strips; reserve refs for each

If resources unavailable at ideal time, scan forward in 30-minute slots. If end time would breach the day boundary, retry with an earlier start slot (up to 3 attempts). If all retries fail, a deadline breach warning is recorded.

### Phase 6: State Update

- After each competition is scheduled, its resource usage is committed to shared global state
- Subsequent competitions see updated availability

### Phase 7: Post-Schedule Warnings

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
- Predefined templates for common NAC formats (Youth, Cadet/Junior, Div1/Junior, etc.)

### ROC (Regional Open Circuit)

- Uses VET_COMBINED (no individual veteran age-group breakdown)
- Div 1A and Veteran categories are the primary focus
- 100% advancement to DE for Div 1A and Veteran
- Can be combined with RJCC and RYC

### RYC (Regional Youth Circuit)

- Youth categories (Y10, Y12, Y14)
- 100% advancement to DE
- Smaller fields; regional-scale fencer defaults
- Y10 preferred in first time slot
- Can be combined with RJCC and ROC

### SYC (Super Youth Circuit)

- Youth (Y10, Y12, Y14), Cadet and Junior categories
- 100% advancement to DE
- Regional-scale fencer defaults

### RJCC (Regional Junior-Cadet Circuit)

- Cadet and Junior individual events
- Default 100% advancement to DE
- Can be combined with ROC and RYC

### Gender Equity

Per the USA Fencing Athlete Handbook (p.15, "Regional Tournament Capping Structure"; beginning 2025–26, mandatory for regional tournaments), when men's and women's events exist in the same age category and weapon, the difference in pool count is bounded:

| Pools in larger event | Maximum pool count difference |
|---|---|
| 3 or fewer | 0 (must be equal) |
| 4–7 | 1 |
| 8–11 | 2 |
| 12+ | 3 |

Violations emit a warning. Applies only when comparing events of different gender in the same age/weapon category.

---

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
