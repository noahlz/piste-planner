# Piste Planner — Scheduling Methodology

This document describes the logic, policies, and priorities that Piste Planner uses to generate a tournament schedule. It is written for tournament organizers evaluating the tool, developers contributing to the codebase, and LLMs reasoning about scheduling rules.

For the underlying code, see `src/engine/`. For USA Fencing source documents, see [References](#references) at the bottom.

---

## Table of Contents

1. [Inputs and Outputs](#inputs-and-outputs)
2. [Hard Constraints](#hard-constraints)
3. [Soft Preferences](#soft-preferences)
4. [Pool Composition](#pool-composition)
5. [Flighting](#flighting)
6. [Direct Elimination (DE)](#direct-elimination-de)
7. [Strip Assignment](#strip-assignment)
8. [Referee Allocation](#referee-allocation)
9. [Auto-Suggestion Logic](#auto-suggestion-logic)
10. [Constraint Relaxation](#constraint-relaxation)
11. [Scheduling Algorithm](#scheduling-algorithm)
12. [Tournament-Type Policies](#tournament-type-policies)
13. [References](#references)

---

## Inputs and Outputs

### Inputs

- **Competition list**: Each competition has a gender, age category, weapon, event type (individual or team), and estimated fencer count.
- **Venue resources**: Total strips, video-capable strips, finals strip designation.
- **Referee availability**: Foil/epee refs and sabre refs available per day.
- **Tournament duration**: 2–4 days.
- **Per-competition options**: Referee policy (1 or 2 per pool, or auto), DE mode (single block or staged), video replay policy, cut-to-DE settings, earliest start / latest end times, flighting flags.

### Outputs

- **Day assignment** for each competition.
- **Pool round timing**: start and end times per competition (and per flight if flighted).
- **DE phase timing**: prelims, round of 16, and finals blocks with strip allocations.
- **Bottleneck diagnostics**: warnings and errors identifying resource conflicts, constraint relaxations, or policy violations.

All times are expressed as minutes from midnight (e.g., 480 = 8:00 AM). The scheduling day runs from 8:00 AM to 10:00 PM (14 hours). Pool rounds cannot start after 4:00 PM.

---

## Hard Constraints

These rules cause scheduling to fail or block a day assignment entirely. They are not relaxed unless all softer options are exhausted (see [Constraint Relaxation](#constraint-relaxation)).

### Same-Population Conflicts

Two competitions drawing from the **same fencer population** (identical category, gender, and weapon) cannot be scheduled on the same day. This is the strongest constraint in the system.

### Group 1 Mandatory Same-Day Pairings

Certain age-category pairs have near-total fencer overlap and must be scheduled on the **same day** (per weapon and gender). Separating them across days would force athletes to choose one event or travel on multiple days.

- DIV1 / JUNIOR / CADET — any pair must share a day
- Y8 / Y10, Y10 / Y12, Y12 / Y14, Y14 / CADET — adjacent youth categories must share a day

These constraints come from the USA Fencing Operations Manual scheduling criteria (Group 1 — Mandatory). The scheduler returns an infinite penalty for violating them.

### Individual Before Team

When an individual event and its corresponding team event (same category, gender, weapon) fall on the same day, the individual must finish at least **2 hours** before the team event starts. The team event may never precede the individual.

### Team Events Require a Matching Individual

Every team competition must have a corresponding individual competition in the same category, gender, and weapon. This is validated before scheduling begins.

### Team Events Cannot Use Cuts

Team competitions always advance all entered teams to the DE phase. Cut-to-DE settings are not applicable and are rejected in validation.

### Fencer Count Bounds

Each competition must have between 2 and 500 fencers. Events outside this range are rejected in validation.

### Single-Day Fit

A competition's worst-case duration (pool round + 15-minute admin gap + full DE) must fit within the 14-hour day. If an individual and team event are on the same day, their combined worst-case duration (including the 2-hour gap) must also fit.

### Same-Day Completion

A competition that starts on a given day must finish on that day. If the DE phase would extend past the end of the day, the scheduler retries with an earlier start slot. If no valid slot exists, the competition cannot be scheduled.

### Regional Qualifiers Cannot Cap Entries

Per the USA Fencing Athlete Handbook, RYC, RJCC, ROC, SYC, and SJCC tournaments may not limit the number of fencer registrations. The scheduler enforces this by rejecting caps on regional qualifier event types.

---

## Soft Preferences

These factors influence day assignment through a weighted penalty system. The scheduler assigns each competition to the day with the lowest total penalty. Penalties are listed here in approximate order of strength.

### Demographic Crossover

Many fencers compete in multiple age categories at the same tournament. Piste Planner models this with a **crossover graph** that encodes the fraction of fencers shared between any two categories (same gender and weapon). For example:

- A Y12 fencer almost always also enters Y14 (100% overlap)
- A Cadet fencer typically enters Junior and often Div 2/3 (100% overlap)
- A Junior fencer sometimes enters Div 1A (30% overlap)

When two competitions with high crossover are assigned to the same day and their start times are close together, a **strong penalty** applies. If they would start within 30 minutes of each other and have high overlap, the penalty is very strong. Lower-overlap pairs receive proportionally smaller penalties.

Two-hop relationships (e.g., Y12 overlaps Y14, Y14 overlaps Cadet, therefore Y12 partially overlaps Cadet) are computed automatically with a cap to prevent inflated indirect scores.

### Early-Start Conflicts

The scheduler penalizes "early morning collision" patterns:

- Two high-crossover competitions both starting at 8:00 AM on the **same day** — moderate penalty
- Two high-crossover competitions both starting at 8:00 AM on **consecutive days** — strong penalty (forces families to arrive early two days in a row)
- An individual and its team event both starting at 8:00 AM on consecutive days — moderate penalty

### Rest Day Preference

Certain category pairs benefit from a rest day between them:

- Junior and Cadet (same weapon)
- Junior and Div 1 (same weapon)

Scheduling these on consecutive days without a rest day receives a **notable penalty**. This is a desirable (not mandatory) criterion from the Ops Manual.

### Proximity Preference

Related categories are preferred to be near each other in the schedule:

- Div 1 and Junior: strong same-day affinity
- Junior and Cadet: strong same-day affinity
- Cadet and Y14: strong affinity
- Y14 and Y12, Y12 and Y10: moderate affinity
- Veteran and Div 1A: moderate affinity

Being 1 day apart actually receives a **slight bonus** (adjacent days are fine). Being 3+ days apart receives a penalty.

### Weapon Balance

The scheduler prefers each day to have a mix of ROW weapons (foil/sabre) and epee, rather than concentrating one weapon type. An all-ROW or all-epee day receives a small penalty.

### Cross-Weapon Same Demographic

When two competitions for the same gender and age category but different weapons land on the same day (e.g., Men's Junior Foil and Men's Junior Epee), a small penalty applies per pair. This reflects the rare but real case of athletes competing in multiple weapons.

### Y10 Early Scheduling

Y10 events are preferred in the first time slot of their day. If a Y10 event doesn't start at 8:00 AM, a small penalty is applied. This reflects that young fencers benefit from earlier start times.

### Last-Day Referee Shortage

Large events (100+ fencers) are discouraged from the last day when that day has fewer referees than the daily average. Medium events (50–100 fencers) receive a smaller version of the same penalty.

### Individual-Team Proximity

When an individual event and its team counterpart are on different days, the scheduler prefers the team event to be the day **after** the individual (slight bonus). Scheduling the team before the individual, or more than 2 days apart, receives a penalty.

---

## Pool Composition

Pool structure follows USA Fencing rules as specified in the Athlete Handbook (Table 2.16.1 and pages 90–91).

### Pool Sizing

- Fields of 9 or fewer: a single pool of all fencers
- Fields of 10 with a single-pool override: one pool of 10 (double-stripped)
- Fields of 10+: divide into pools targeting **6–7 fencers per pool** using `ceil(fencerCount / 7)`

Remainder fencers are distributed so some pools get one extra fencer. For detailed pool breakdowns by field size, see the USA Fencing Athlete Handbook pages 90–91 ([S8](#references)).

### Pool Duration Estimation

Each weapon has a baseline duration for a standard 6-person pool (15 round-robin bouts):

- **Epee**: 120 minutes
- **Foil**: 105 minutes
- **Sabre**: 75 minutes

Other pool sizes are scaled proportionally by bout count. For example, a 7-person pool has 21 bouts (vs. 15 for a 6-person pool), so its duration is approximately 1.4x the baseline.

When a single pool has 8+ fencers, it is **double-stripped** (two bouts run simultaneously), halving the effective duration.

### Pool Parallelism

The number of pools that can run simultaneously depends on the minimum of: available strips, total pools, and available referees divided by refs-per-pool. If referees exceed strips, excess refs can "double up" to cover additional strips, increasing parallelism.

The total pool round duration is: `weighted_average_pool_duration x ceil(total_pools / effective_parallelism)`.

---

## Flighting

Flighting splits a large competition into two flights (A and B) that run sequentially, allowing their strips to be shared with another competition on the same day.

### When Flighting Is Suggested

The scheduler suggests flighting when two competitions on the same day have a **combined pool count exceeding the available strips**, but each competition's pools fit individually. Without flighting, one competition would have to wait for strips, causing delays.

### How Flights Are Assigned

- The competition with **more pools** becomes the priority event (runs during Flight A)
- The other becomes the flighted event
- If pool counts are tied, a warning is emitted for manual resolution
- Flight A gets `ceil(pools / 2)` pools; Flight B gets the remainder
- A 15-minute buffer separates Flight A's end from Flight B's start
- Both flights must complete on the same day

### Flighting Warnings

The scheduler warns when:
- Multiple flighted competitions land on the same day (resource contention risk)
- A flighted competition is not the largest event on its day (suboptimal strip sharing)
- A flighting pair has demographic crossover (fencers in both events)

---

## Direct Elimination (DE)

### Bracket Sizing

The DE bracket is the next power of 2 at or above the number of fencers advancing from pools. The number advancing depends on the cut-to-DE setting:

- **Percentage cut** (e.g., top 80%): `round(fencerCount x percentage)`
- **Count cut** (e.g., top 64): `min(cutValue, fencerCount)`
- **Disabled**: all fencers advance

Default cut settings by category:
- Y8, Y10, Y12, Veteran, Div 1A, Div 2, Div 3: no cut (100% advance)
- Y14, Cadet, Junior, Div 1: top 80% advance

### DE Phases

Large brackets are broken into phases for resource management:

- Bracket of 64+: **Prelims** (rounds above 32), **Round of 16**, **Finals**
- Bracket of 16–63: **Round of 16**, **Finals**
- Bracket under 16: **Finals** only

Duration is split proportionally by bout count, with a hard minimum of 30 minutes for the finals block.

### DE Modes

- **Single Block**: All DE rounds run on allocated strips without phases. Simpler, uses `floor(bracketSize / 2)` optimal strips. Video replay is not applicable.
- **Staged DE Blocks**: DE runs in distinct phases, each requiring its own resource window. Video replay can be applied to Round of 16 and Finals phases.

### Video Replay Policy

- **Required** (Cadet, Junior, Div 1 by default): DE Round of 16 and Finals must use video-capable strips
- **Finals Only**: Only the Finals phase requires video strips
- **Best Effort** (all other categories): Video strips used if available, not required

### Bronze Medal Bout

Team events include a bronze medal bout scheduled at finals time on a separate strip. Bronze bouts do not use sabre fill-in referees and only receive video if the finals phase requires it.

---

## Strip Assignment

### Video Strip Preservation

When assigning strips for competitions that do **not** require video, the scheduler preferentially selects non-video strips first. This preserves video-capable strips for competitions that need them (Cadet, Junior, Div 1 staged DEs).

### Resource Windows

For each phase (pool round, DE prelims, R16, finals), the scheduler finds the earliest time slot where both sufficient strips **and** sufficient referees are simultaneously available. If resources aren't available at the ideal start time, the scheduler scans forward in 30-minute slots.

If the delay exceeds a threshold, a bottleneck diagnostic is emitted identifying whether the cause was strip contention, referee contention, or both.

### Slot Granularity

All phase start times are snapped to 30-minute boundaries (e.g., 8:00, 8:30, 9:00). End times are not snapped — they reflect actual estimated duration.

---

## Referee Allocation

### Weapon Qualification

- **Sabre referees** can only officiate sabre events by default
- **Foil/epee referees** officiate foil and epee events
- **Sabre fill-in**: When enabled, foil/epee referees may supplement sabre events if sabre referees are insufficient. This emits a warning. Fill-in is **never** allowed for bronze medal bouts.
- Sabre referees **can** officiate foil/epee events (they count toward the foil/epee referee pool)

### Refs Per Pool

- **One ref per pool**: The default minimum.
- **Two refs per pool**: Preferred for higher-level events. Falls back to one with a warning if insufficient refs.
- **Auto**: Uses two-per-pool when the referee supply allows it; silently drops to one otherwise.

### Pod Captains

In staged DE, pod captains supervise groups of strips:

- Auto mode: 4-strip pods for brackets ≤ 32 or Round of 16; 8-strip pods for larger brackets
- Can be disabled or forced to 4-strip pods via configuration
- Pod captains are drawn from the referee pool

---

## Auto-Suggestion Logic

The scheduler can auto-suggest several configuration values to help organizers start with reasonable defaults.

### Strip Count Suggestion

Finds the competition with the most pools (the peak strip demand) and suggests that number of strips, optionally plus one for a dedicated finals strip.

### Referee Suggestion

1. Sums total sabre pools and foil/epee pools across all competitions
2. Estimates pools per day: `ceil(totalPools / daysAvailable)`
3. Caps at strips in use: `min(poolsPerDay, stripsTotal)`
4. Splits proportionally by weapon ratio

The heuristic is **one referee per strip in active use**, split by the sabre-to-foil/epee ratio of the competition mix.

### Optimal Referee Calculation

A more sophisticated approach simulates the schedule with unlimited referees to find **peak concurrent demand** per weapon per day. This uses a preliminary day assignment (greedy crossover-penalty minimization) and sums the maximum simultaneous referee need across pool and DE phases.

### Flighting Suggestion

Automatically identifies same-day competition pairs whose combined pool count exceeds strip availability, and suggests which should be the priority vs. flighted event (see [Flighting](#flighting)).

---

## Constraint Relaxation

When the scheduler cannot find a valid day for a competition at the strictest constraint level, it progressively relaxes rules:

1. **Level 0** (full constraints): All crossover, proximity, and hard-block rules active
2. **Level 1**: Drops proximity preferences (related categories no longer penalized for being far apart)
3. **Level 2**: Drops soft crossover penalties (overlapping populations on same day allowed, but same-population hard blocks remain)
4. **Level 3**: Drops hard blocks (same population allowed on same day — last resort)

Each relaxation emits a warning. If no valid day exists even at Level 3, scheduling fails with an unresolvable error.

---

## Scheduling Algorithm

The scheduler uses a **greedy, priority-ordered, single-pass** approach rather than a global optimizer. Each competition is scheduled one at a time in priority order, locking in its day and time slots before moving to the next. This section describes the pipeline.

### Phase 1: Validation

Before scheduling begins, all competitions and configuration are validated against hard rules (see [Hard Constraints](#hard-constraints)). Any ERROR-severity violation aborts scheduling immediately. Warnings are collected and carried forward.

### Phase 2: Pre-Scheduling Analysis

Seven analysis passes run before the main scheduling loop to surface structural issues early:

1. **Total pool demand vs. strips** — warns if any day's total pools exceed strip count
2. **Per-competition strip deficit** — warns if a single competition's pools exceed strips and flighting is not enabled
3. **Flighting suggestions** — identifies same-day pairs that would benefit from flighting
4. **Multiple-flighting conflicts** — warns if more than one flighted competition lands on the same day
5. **Video strip demand** — warns if peak video-strip need exceeds video-capable strips
6. **Flighting video conflicts** — warns if both competitions in a flighting pair need video
7. **Gender equity** — checks pool count differences between men's and women's events
8. **Cut summaries** — informational breakdown of advancement numbers per competition

### Phase 3: Priority Ordering

Competitions are sorted by **constraint score** (highest first, scheduled first). The most constrained competitions get first pick of days and resources. The constraint score combines:

- **Crossover count**: How many other competitions this one conflicts with (more conflicts = harder to place)
- **Window tightness**: How narrow the allowed time window is (tight windows = fewer options)
- **Sabre scarcity**: For sabre events, the ratio of sabre competitions to minimum sabre refs across days
- **Video scarcity**: For staged DE events requiring video, the ratio of video-needing events to video strips
- **Referee intensity**: Events requiring 2 refs/pool score higher than those needing 1

Within this ordering:
- Mandatory competitions are scheduled before optional ones
- Flighting pairs (priority + flighted event) are kept together and inserted at the priority competition's score position

### Phase 4: Day Assignment

For each competition in priority order, the scheduler evaluates every available day and picks the one with the **lowest total penalty**. The penalty is the sum of all applicable soft preferences (see [Soft Preferences](#soft-preferences)), evaluated against the competitions already locked into the schedule.

This is where the bulk of scheduling intelligence lives. The penalty function considers crossover conflicts, proximity preferences, early-start patterns, rest day needs, weapon balance, and resource availability — all relative to what has already been placed.

If no day has a finite penalty at the current constraint level, the scheduler escalates through [Constraint Relaxation](#constraint-relaxation) levels until a valid day is found or scheduling fails.

### Phase 5: Resource Allocation (per competition)

Once a day is chosen, the scheduler finds the earliest time window on that day where strips and referees are simultaneously available:

1. **Pool round**: Find a resource window for all pools (or Flight A pools if flighted). Reserve strips and refs from the global state.
2. **Flight B** (if flighted): Find a second resource window starting after Flight A + 15-minute buffer.
3. **Admin gap**: 15-minute mandatory gap between pool end and DE start, snapped to the next 30-minute slot.
4. **DE phases**: For each DE phase (prelims, R16, finals), find a resource window with the required strip count (including video strips if applicable). Reserve refs for each phase.
5. **Bronze bout** (team events): Allocate a separate strip at finals time.

At each step, if resources aren't available at the ideal time, the scheduler scans forward in 30-minute slots. If the resulting end time would breach the day boundary or the competition's latest-end constraint, the scheduler retries with an earlier starting slot (up to 3 attempts). If all retries fail, a deadline breach error is recorded.

### Phase 6: State Update

After each competition is successfully scheduled, its resource usage (strips, refs, time slots) is committed to the shared global state. Subsequent competitions see the updated availability when computing their own resource windows.

This is why priority ordering matters — high-constraint competitions that are hard to place get first access to resources, while more flexible competitions adapt around them.

### Phase 7: Post-Schedule Warnings

After all competitions are placed, a final pass checks schedule quality:

- For 4+ day events, warns if the first or last day is significantly longer than average middle days (unbalanced load)

### Why Greedy, Not Optimal?

A global optimizer (e.g., integer linear programming) could theoretically find a schedule with a lower total penalty. The greedy approach was chosen because:

- **Transparency**: Each scheduling decision can be explained in terms of the penalties that drove it. Organizers can understand *why* a competition landed on a given day.
- **Diagnostics**: The bottleneck system reports exactly which constraints caused delays or relaxations, making it actionable.
- **Speed**: The single-pass approach completes in milliseconds, enabling interactive "what-if" exploration in the UI.
- **Constraint relaxation**: The leveled relaxation system provides a clear degradation path, making it obvious when the problem is over-constrained rather than silently producing a bad schedule.

---

## Tournament-Type Policies

### NAC (National Age-group Circuit)

- Full crossover rules apply (Group 1 mandatory pairings, rest day preferences)
- Default cuts: Y14/Cadet/Junior/Div 1 at 80% to DE
- Video replay required for Cadet, Junior, Div 1
- Typically 3–4 day events with large fields (100+ fencers in major categories)
- Predefined templates available for common NAC formats (Youth, Cadet/Junior, Div1/Junior, etc.)

### ROC (Regional Open Championship)

- Cannot cap fencer entries
- Uses VET_COMBINED (no individual veteran age-group breakdown)
- Div 1A and Veteran categories are the primary focus
- 100% advancement to DE (no cuts) for Div 1A and Veteran
- Typically 2-day events with moderate fields

### RYC / SYC (Regional/Sectional Youth Circuit)

- Cannot cap fencer entries
- Youth categories (Y10, Y12, Y14)
- 100% advancement to DE
- Smaller fields than NACs; regional-scale fencer defaults
- Y10 preferred in first time slot

### RJCC / SJCC (Regional/Sectional Junior-Cadet Circuit)

- Cannot cap fencer entries
- Cadet and Junior individual events
- 100% advancement to DE for SJCC; 80% for RJCC at NAC level

### Gender Equity

Per the USA Fencing Athlete Handbook (beginning 2025–26, mandatory), when men's and women's events exist in the same age category and weapon, the difference in pool count is bounded:

| Pools in larger event | Maximum pool count difference |
|---|---|
| 3 or fewer | 0 (must be equal) |
| 4–7 | 1 |
| 8–11 | 2 |
| 12+ | 3 |

Violations emit a warning. This applies only when comparing events of different gender in the same age/weapon category.

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
| S8 | USA Fencing Athlete Handbook 2024-25 | [PDF](https://static1.squarespace.com/static/63d04398a7662e295f7c993a/t/6706d6a4b3f88e7f6a2a2467/1728501417355/USA_Fencing_Athlete_Handbook_2024-25.pdf) — Pool sizes, competition formats, gender equity caps |
| S9 | Academy of Fencing Masters: "How to Make USA Fencing National Events Work for Everyone" | [Link](https://academyoffencingmasters.com/blog/how-to-make-usa-fencing-national-events-work-for-everyone/) |
| S10 | Fencing Time tournament software documentation | [Link](https://www.fencingtime.com/Home/VerHistory) |
