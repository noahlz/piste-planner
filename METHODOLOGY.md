# Piste Planner — Scheduling Methodology

This document defines the rules, constraints, and penalty weights that Piste Planner uses to **suggest** a tournament schedule. The scheduling algorithm produces an initial layout, and the organizer refines it by moving events to other days. A moved event is pinned to its new day. Each hand move is checked at once, without a new engine run, against the hard same-day pairs, a split Veteran co-day, the regional Group 1 window, the first- and last-day length, a first pool phase that starts after the cutoff, and late or overrun finishes, and the app reports what the move breaks. Auto-assign re-runs the engine around the pins after every edit to an engine input.

For tournament organizers evaluating the tool, developers contributing to the codebase, and LLMs reasoning about scheduling rules.

For the underlying code, see [`src/engine/`](src/engine/). For USA Fencing source documents, see [References](#references).

Piste Planner models tournament scheduling as a resource-constrained scheduling problem: strips are general-purpose queues (each pool is a unit of work during the pool round while each bout is a unit of work during DEs), referees are workers feeding off the queues, and the scheduler packs competitions into day/time/strip bins, minimizing constraint violations.

---

## Table of Contents

1. [Inputs and Outputs](#inputs-and-outputs)
2. [Hard Constraints](#hard-constraints)
3. [Warning-Level Rules](#warning-level-rules)
4. [Soft Preferences](#soft-preferences)
5. [When Days Are Too Few](#when-days-are-too-few)
6. [Competition Math](#competition-math)
   - [Pool Composition](#pool-composition)
   - [Strip Budget](#strip-budget)
   - [Flighting](#flighting)
   - [Direct Elimination (DE)](#direct-elimination-de)
7. [DE Capacity Estimation](#de-capacity-estimation)
8. [Resources](#resources)
   - [Strip Assignment](#strip-assignment)
   - [Referee Calculation](#referee-calculation)
9. [Concurrent Phase Scheduler](#concurrent-phase-scheduler)
10. [Scheduling Algorithm](#scheduling-algorithm)
11. [Tournament-Type Policies](#tournament-type-policies)
12. [Auto-Suggestion Logic](#auto-suggestion-logic)
13. [Capacity-Aware Day Assignment](#capacity-aware-day-assignment)
14. [Scheduler Stops at Semis](#scheduler-stops-at-semis)
15. [References](#references)

[Appendix A: Penalty & Constant Defaults](#appendix-a-penalty--constant-defaults)

[Appendix B: Departures from the Operations Manual](#appendix-b-departures-from-the-operations-manual)
   - [Manual Criteria Not Modelled](#manual-criteria-not-modelled)

---

## Inputs and Outputs

### Inputs

- **Competition list**: each competition has a gender, age category, weapon, event type (individual or team), and estimated fencer count (see [`types.ts`](src/engine/types.ts) for data model)
- **Venue resources**:
  - **General strips**: used for pools or DEs. The total count is optional – the engine can suggest one (see [Strip Count Suggestion](#strip-count-suggestion))
  - **Video strip count**: how many of the strips have video, any count from 0 to the strip total, at every tournament type – 8 by default at a NAC and 0 elsewhere. At a NAC these strips are used for the video stage of staged DEs. Each video stage asks for `min(4, bracketSize / 2)` video strips, so the default of 8 lets two events run their video stages at once. Multiple events in the video stage contend for these strips. At every other type video replay is best-effort, so no phase needs a video strip and any phase may use one after the plain strips (see [Video Replay Policy](#video-replay-policy)).
- **Referee policy** (not counts — counts are an output, see below):
  - **Refs per pool**: 1 or 2, set by tournament type – two at NAC, SYC and SJCC, one at ROC, RYC and RJCC (unsourced, see [Refs Per Pool](#refs-per-pool-input-that-affects-the-output)). It is not a scheduling input (see [Not Scheduling Inputs](#not-scheduling-inputs))
- **Tournament duration**: 2–4 days, the range the app offers. A saved file may hold any count from 1 to 14, and the engine schedules it with a warning (`days-available-range`) when the count falls outside 2–4. A count outside 1–14 is an error (`days-available-bounds`). Day assignment uses every day the organizer chose (see [Capacity-Aware Day Assignment](#capacity-aware-day-assignment))
  - Loading a template raises the day count to that template's minimum when the board has fewer days, and never lowers it. The minimum is the fewest days that meet every hard day rule among the template's events under the board's tournament type – hard pairs on different days, and each Veteran age-group co-day on one day. The days already on the board keep their start and end times, and each added day gets the default 9:00 AM to 7:00 PM. Under NAC, SYC and SJCC the NAC Cadet/Junior, NAC Div1/Junior and NAC Vet/Div1/Junior templates need 4 days and Junior Olympics needs 3. Under ROC, RYC and RJCC, where Group 1 pairs are soft (see [Regional Types](#regional-types-soft-with-a-time-of-day-window)), NAC Vet/Div1/Junior needs 3. Every other combination of template and type needs 2 or fewer.
- **Day times**, set per day:
  - **Start time**: defaults to 9:00 AM (Ops Manual p.17)
  - **Latest end time**: defaults to 7:00 PM, a soft target with a 10:00 PM hard end. An event's last phase alone may run past the hard end, up to midnight, with a warning (see [Same-Day Completion](#same-day-completion))
- **Per-competition options**:
  - **DE mode**: determined by tournament type and event type – NAC individual events use "Staged DEs" (Prelim + Video stages), and all other individual events use "Single Stage DE" (all DE rounds run as fast as possible). Team events always use Single Stage, NACs included (see [DE Modes](#de-modes))
  - **Video stage** (NACs only): the round at which DEs move to video strips. Every individual event at a NAC has video REQUIRED (team events have no video stage), from the round of 16 for Div 1, Junior and Cadet and from the round of 8 for every other individual category (Ops Manual p.19 – Video Replay, see [Video Replay Policy](#video-replay-policy))
  - **Cut-to-DE**: % cut (e.g., cut 20% → promote 80%) or promoted count (e.g., promote top 256)
  - **Flighting**: a per-event toggle the organizer turns on. The engine suggests it when a competition's pool count exceeds the per-event strip cap, and the suggestion is advisory – the engine never flights an event itself (see [Strip Budget](#strip-budget) and [Flighting Suggestion](#flighting-suggestion))

#### Not Scheduling Inputs

- **Mixed-gender events**: every event is planned as a single-gender event. The manual lets a youth regional competition be mixed when five or fewer competitors of one gender enter a Y14, Y12 or Y10 category (Ops Manual pp.11–12). Piste Planner does not plan mixed events.
- **Refs per pool**: changes the referee counts the engine reports, never the schedule (see [Refs Per Pool](#refs-per-pool-input-that-affects-the-output)).

### Outputs

- **Day assignment** for each competition
- **Pool round timing**: start and end times per competition
- **DE phase timing**: prelim and video stage blocks with strip allocations (NACs); single block (all others)
- **Referee requirements**: per-day peak demand, computed from the schedule. Reported as two numbers per day:
  - **3-weapon refs needed** — peak total refs across all bouts (any weapon)
  - **Saber refs needed** — peak refs needed for saber bouts specifically (a subset of the total). Saber bouts can only be officiated by 3-weapon refs, so this number sets the floor on the 3-weapon-certified portion of the staff.
  - Foil/epee-only refs can fill the gap between the saber-refs and total-refs numbers. The organizer chooses the split when staffing.
- **Bottleneck diagnostics**: warnings and errors identifying resource conflicts or policy violations

All times are minutes from midnight (e.g., 540 = 9:00 AM). The default scheduling day runs from 9:00 AM to 7:00 PM (10 hours), the planning day of Ops Manual p.17. 7:00 PM is a soft target: the engine may place work until the day's hard end at 10:00 PM, and a day that ends after 7:00 PM draws a warning. An event's last phase alone may end past the hard end, up to midnight, and draws a warning of its own (see [Same-Day Completion](#same-day-completion)). An event's first pool phase – its pools, or Flight A when it is flighted – should not start later than 7 hours after day start, which is 4:00 PM on a 9:00 AM day. An event whose first pool phase starts later is still placed, never dropped or moved, and draws a WARN (`pool-start-after-cutoff`) that carries its start time. Flight B is exempt. This cutoff is Piste Planner's own rule and unsourced, since no current USA Fencing source sets one (see [Pool Start Cutoff](#pool-start-cutoff), [Appendix B](#appendix-b-departures-from-the-operations-manual), and [`constants.ts`](src/engine/constants.ts) – `DAY_START_MINS`, `DAY_END_MINS`, `DAY_HARD_END_MINS`, `LATEST_START_OFFSET`).

---

## Hard Constraints

These rules are never traded for a soft preference, but they do not all act the same way:
- **Validation rules are checked** before any day is assigned (see [Phase 1: Validation](#phase-1-validation)). [Fencer Count Bounds](#fencer-count-bounds), an invalid cut value and the [video strip count](#resource-preconditions) draw an ERROR that excludes only the event it names, and the rest are scheduled. Any other validation ERROR stops the whole tournament – among them a strip total that is not positive, a day count outside 1–14, the [strip minimum](#resource-preconditions) and a [team event with no matching individual](#team-events-require-a-matching-individual).
- **Day rules block a day outright**: [Same-Population Conflicts](#same-population-conflicts), [Individual/Team Separation](#individualteam-separation), the [Veteran Age-Group Co-Day Rule](#veteran-age-group-co-day-rule), [Div 1 and Div 1A on different days](#departures-from-the-manual), and [Group 1 at national types](#national-types-hard). When the days are too few for an event, day assignment still places it, on the least-bad day, and the broken rule draws a WARN instead of stopping the schedule (see [When Days Are Too Few](#when-days-are-too-few)).
- **[Single-Day Fit](#single-day-fit) is enforced when phases are placed**, not in validation.

[Team Events Cannot Use Cuts](#team-events-cannot-use-cuts) draws only a WARN. The one exception by tournament type is [Overlapping-Population Separation (Group 1)](#overlapping-population-separation-group-1): it is hard at national types and soft at regional types. (see [`validation.ts`](src/engine/validation.ts) – `validateConfig`, [`concurrentScheduler.ts`](src/engine/concurrentScheduler.ts) – `scheduleAllConcurrent`, [`crossover.ts`](src/engine/crossover.ts), [`constraintGraph.ts`](src/engine/constraintGraph.ts), [`dayColoring.ts`](src/engine/dayColoring.ts))

### Same-Population Conflicts

- Two competitions with **identical age category, gender, and weapon** cannot be on the same day. This includes individual + team pairs of the same category and weapon: Junior Men's Foil ind + Junior Men's Foil team, Cadet Women's Epee ind + Cadet Women's Epee team, **Vet Men's Foil ind + Vet Men's Foil team**, etc., all must be on different days. This is hard at every tournament type.
- For Veterans, "category" is read as the full `(VETERAN, vet_age_group)` pair: Vet 40 M Foil ind and Vet 50 M Foil ind are *different* categories and are not blocked by this rule (they are forced *together* by the Veteran Age-Group Co-Day Rule below). But Vet 40 M Foil ind and Vet 40 M Foil team share the full pair and are blocked.
- Different-weapon pairs are not blocked: Vet Men's Saber ind + Vet Men's Epee team can share a day.
- The rule holds at every tournament type, regional types included, because the individual and team events of one category draw the same fencers (Ops Manual p.20 – Group 1 bullet 3, which names NACs, and Ops Manual p.20 – Group 2: "same day scheduling of individual and team competitions should be avoided when it is possible that a fencer could fence in both competitions"). Keeping it hard at regional types, where the rest of Group 1 is soft, is listed in [Appendix B: Departures from the Operations Manual](#appendix-b-departures-from-the-operations-manual).

### Individual/Team Separation

- At every tournament type, these cross-level individual/team pairs of one weapon and gender are on different days:
  - **Div 1 ind ↔ Junior team**: Junior team draws from the Div 1 individual pool
  - **Junior ind ↔ Div 1 team**: Div 1 team draws from the Junior individual pool
- Source: Ops Manual p.20 – Group 1 bullet 1 ("For any one weapon, the Div I, Junior, and Cadet competitions must not be held on the same day").
- At NAC, SYC and SJCC both pairs already fall under the [Group 1](#overlapping-population-separation-group-1) pair DIV1 and JUNIOR. At ROC, RYC and RJCC, where Group 1 pairs are soft, these two stay hard – a departure listed in [Appendix B](#appendix-b-departures-from-the-operations-manual).
- Same-category individual/team pairs (Junior↔Junior, Cadet↔Cadet, Div1↔Open Team, Vet↔Vet, etc.) are blocked by [Same-Population Conflicts](#same-population-conflicts).

(see [`crossover.ts`](src/engine/crossover.ts), [`constants.ts`](src/engine/constants.ts) – `INDIV_TEAM_CROSS_LEVEL_BLOCKS`)

### Veteran Age-Group Co-Day Rule

- **All age-banded Veteran *individual* events for a given gender + weapon must be on the same day.** Vet 40, Vet 50, Vet 60, Vet 70, Vet 80 for, say, Men's Foil all run on one day; they cannot be spread across multiple days. The rule does *not* apply to Vet Combined.
- Reason: staffing, refs, and venue setup for the age-banded veteran events are coordinated on a single day per weapon-gender, and nested age-eligibility means a single fencer often enters the age-banded events.
- Ops Manual p.20 – Group 1 bullet 2 keeps immediately adjacent age groups off the same day, and that rule does not reach the Veteran age bands. Vet 40, Vet 50, Vet 60, Vet 70 and Vet 80 are not separate age groups in the manual's sense: they are one Veteran event split into sub-events by age band. So the bands always share a day and carry no adjacent-age separation, and the co-day is not a departure from the manual (owner ruling, 2026-10-08).
- **Vet Combined is hard-blocked from sharing a day with any age-banded Vet ind event** for the same gender + weapon. A fencer typically enters their primary age-banded event AND Vet Combined, so co-locating those two events would double-book that fencer.
- This is an additional hard rule beyond [Same-Population Conflicts](#same-population-conflicts) – it forces both *consolidation* (among age-banded events) and *separation* (Vet Combined from age-banded).
- When a pin or the least-bad fallback (see [When Days Are Too Few](#when-days-are-too-few)) splits the age-banded events of one gender and weapon across days, the engine emits a WARN with rule `vet-co-day-split`, and so does the check that runs when the organizer moves an event by hand. Like the other broken hard rules it cannot be dismissed. The check reads the final day map, pins included.

#### Within-Day Age-Descending Order

- **On a Vet co-day for (gender, weapon), age-banded events start oldest first with a 60-minute stagger:** VET80 → VET70 → VET60 → VET50 → VET40. Each younger band's pools become ready 60 minutes after the pools of the next-older band on that day start.
- Older bands start first because USA Fencing Veterans are nested-eligible: a VET80 fencer's primary event is under way before the younger bands they may also enter.
- No band waits for another band to finish, so once started the bands may run side by side.
- The stagger holds whatever order the events are placed in: a younger band's pools are not ready until 60 minutes after the next-older band's pools start, even when that band is placed later. The concurrent scheduler holds the stagger as a cross-event dependency edge (see [Cross-Event Dependency Edges](#cross-event-dependency-edges) and [`concurrentScheduler.ts`](src/engine/concurrentScheduler.ts) – `applyCrossEventEdges`). When the event waited on is never placed, the wait lapses and the waiting event's pools are ready as if it did not exist – from day start, or from any other floor that applies to it, such as the regional Group 1 window.
- No Veteran event has a fixed start offset – Vet Combined starts like every other event, and it never shares the co-day (see [Age-Category Weights](#age-category-weights)).
- The stagger is Piste Planner's own rule and is unsourced – the one reference found by web research for the 2026-08-31 methodology review describes the 2026 NAC Veteran events as "scheduled on the same day with different start times" (see backlog §Vet co-day serialization is unsourced). It is listed in [Appendix B](#appendix-b-departures-from-the-operations-manual).

#### Vet Combined Day-After Preference

- **Vet Combined for (gender, weapon) is preferentially scheduled on the day immediately after the age-banded co-day.** This is a soft penalty, not a hard rule — if the next day is unavailable, Vet Combined falls back to any other valid day that respects the F3a hard separation.
- Penalty weights mirror the indiv/team ordering preference: gap +1 = -0.4 bonus (ideal), gap -1 = 1.0 penalty (Vet Combined before co-day — strongly discouraged), |gap| ≥ 2 = 0.3 mild penalty.
- Rationale: fencers who enter Vet Combined typically fence their age-banded event the day before, so scheduling Vet Combined immediately after gives them minimal travel disruption and keeps the veteran events contiguous.
- Implementation: `vetCombinedOrderingPenalty` in [`src/engine/dayColoring.ts`](src/engine/dayColoring.ts), wired into `colorPenalty` immediately after `individualTeamOrderingPenalty`. Reuses `INDIV_TEAM_DAY_AFTER`, `TEAM_BEFORE_INDIVIDUAL`, and `INDIV_TEAM_2_PLUS_DAYS` from `PENALTY_WEIGHTS` in `constants.ts`.

### Overlapping-Population Separation (Group 1)

Overlapping age categories are kept apart so that fencers who enter more than one category do not face a same-day conflict. The rule applies per weapon and gender: a pair in different weapons or different genders is not affected. Ops Manual p.20 – Group 1 says "for any one weapon", and applying it per gender as well is Piste Planner's reading.

The Group 1 pairs, each in the same weapon and gender:

| Pair | Younger side | Source |
|---|---|---|
| DIV1 and JUNIOR | JUNIOR | Ops Manual p.20 – Group 1 bullet 1 |
| JUNIOR and CADET | CADET | Ops Manual p.20 – Group 1 bullet 1 |
| DIV1 and CADET | CADET | Ops Manual p.20 – Group 1 bullet 1 |
| Y10 and Y12 | Y10 | Ops Manual p.20 – Group 1 bullet 2 |
| Y12 and Y14 | Y12 | Ops Manual p.20 – Group 1 bullet 2 |
| Y14 and CADET | Y14 | Ops Manual p.20 – Group 1 bullet 2 |

The manual titles these criteria "National Tournament Scheduling Criteria", so how strictly a pair is kept apart depends on the tournament type.

#### National Types: Hard

At NAC, SYC and SJCC every Group 1 pair MUST be on **different days**, DIV1 and CADET included (Ops Manual p.20 – Group 1: "Only group 1 criteria are required"). Piste Planner treats a fencer at these types as entering one individual event per day. The manual does not call SYC or SJCC national tournaments, a departure listed in [Appendix B](#appendix-b-departures-from-the-operations-manual).

#### Regional Types: Soft, With a Time-of-Day Window

At ROC, RYC and RJCC fencers often enter several events in one day (Y14 in the morning, Div 2 in the afternoon). Every Group 1 pair is a soft preference there: day assignment adds the regional Group 1 pair penalty when a pair shares a day (see [Appendix A](#penalty-weights)). The exception is Div 1 individual ↔ Junior team and Junior individual ↔ Div 1 team, which stay hard at every type (see [Individual/Team Separation](#individualteam-separation)).

When a pair does share a day, the scheduler applies a time-of-day window (see [Cross-Event Dependency Edges](#cross-event-dependency-edges)):
- The younger side starts from day start.
- The older side may not start its pools before day start + 4 hours.

Each pair applies its own window, and the windows do not stack. When Y10, Y12 and Y14 share a regional day, Y12 and Y14 both start no earlier than day start + 4 hours, so the Y12–Y14 pair overlaps, its window counts as not honoured, and it draws the WARN.

A pair that shares a day with its window honoured produces an INFO finding. A WARN fires when the window cannot be honoured, for example when pinned events break it.

#### Departures From the Manual

These hold at every tournament type and are listed in [Appendix B: Departures from the Operations Manual](#appendix-b-departures-from-the-operations-manual):
- **DIV1 and DIV1A** are always on different days, because nearly the same fencers enter both. The manual does not list this pair.
- **Y8 can and should share a day with Y10** of the same weapon and gender, although Ops Manual p.20 – Group 1 bullet 2 keeps immediately adjacent age groups apart. Day assignment gives the pair a -0.3 same-day bonus (see [Appendix A](#penalty-weights)).

**Affinity for unrelated events** on the same day is preferred – e.g., Y10 and Div 3 have no fencer overlap, which makes a good same-day pairing. Day assignment scores this one pairing, Y10 and Div 3 of the same weapon and gender, with the same -0.3 same-day bonus as Y8 and Y10 (see [Appendix A](#penalty-weights)).

(see [`constants.ts`](src/engine/constants.ts) – `GROUP_1_MANDATORY`, `CROSSOVER_GRAPH`, and [`dayColoring.ts`](src/engine/dayColoring.ts) – `colorPenalty` for the two same-day bonuses)

### Single-Day Fit

- A competition's worst-case duration (pool round + 30-minute admin gap + full DE) must fit on one day: every phase but its last ends by the day's hard end (9:00 AM to 10:00 PM by default, 13 hours), and its last phase starts before the hard end and ends by midnight. Running past the 7:00 PM soft target is a warning, not a violation, and so is a last phase that runs past the hard end (see [Same-Day Completion](#same-day-completion))
- The limit is enforced when phases are placed, not in [Phase 1: Validation](#phase-1-validation). A phase that would break it fails the attempt (see `SAME_DAY_VIOLATION` in [Bottlenecks Specific to the Concurrent Scheduler](#bottlenecks-specific-to-the-concurrent-scheduler)), and two failed attempts leave the event unscheduled (see [Two-Attempt Retry](#two-attempt-retry))
- An individual and team event of one category, weapon and gender share a day only through a pin or the least-bad fallback (see [Same-Population Conflicts](#same-population-conflicts) and [When Days Are Too Few](#when-days-are-too-few)). The team event's pools are then not ready until 120 minutes after the individual event's last phase ends, whatever order the two are placed in, and every phase of both events must still meet the limit above (see [Cross-Event Dependency Edges](#cross-event-dependency-edges)). When the event waited on is never placed, the wait lapses and the waiting event's pools are ready as if it did not exist – from day start, or from any other floor that applies to it, such as the regional Group 1 window

### Resource Preconditions

Strips are a precondition; referees are not (refs are calculated from the schedule, not supplied as input). `validateConfig` must enforce:

**Strip minimum**: Every event must be able to run all its pools at once (or in two flights for flighted events):

```
strips_total >= max_pools_any_event
```

Where `max_pools_any_event = max(ceil(fencer_count / 7))` across all events. For an event that splits its pools into Flight A and Flight B (see [Flighting](#flighting)), the requirement is halved to Flight A's share: `ceil(pools / 2)`.

This is a **hard validation error**, not a warning. The UI should auto-suggest a strip count when the user enters competition sizes (see [Strip Count Suggestion](#strip-count-suggestion)).

**Video strip count**: every individual event at a NAC runs a staged DE with video REQUIRED (Ops Manual p.19 – Video Replay), and its video stage asks for `min(4, bracketSize / 2)` video strips. An event whose ask exceeds the video strip count draws an ERROR and is excluded from the schedule, and the rest of the tournament is scheduled. The organizer may set any video strip count from 0 to the strip total, at any tournament type. A NAC defaults to 8, which lets two events run their video stages at once. At other types video strips are used best-effort.

**Referees are not validated up front.** The engine assumes refs are available for every bout it schedules and reports the resulting peak demand as an output (see [Outputs](#outputs) and [Referee Calculation](#referee-calculation)). The organizer reads those numbers and staffs accordingly; understaffing is handled at staffing time, not by the scheduler.

### Team Events Require a Matching Individual

- Every team competition must have a corresponding individual competition in the same age category, gender, and weapon
- If user selects Team, the corresponding Individual event is automatically enabled and cannot be disabled unless team is first disabled.
- Validated before scheduling begins (see [`validation.ts`](src/engine/validation.ts))

### Team Events Cannot Use Cuts

- Team competitions always advance all entered teams to the DE phase
- A cut-to-DE setting on a team event is ignored with a WARN, and the UI offers none

### Fencer Count Bounds

- Each competition must have between 2 and 336 fencers
- The maximum is the NAC entry cap for Div I, Junior and Cadet (S8 §2.2.5, p.15 – "DVI, JNR and CDT events at all North American Cups will be capped at a maximum of 336 entries TOTAL"), applied to every event
- The minimum stays 2 because real events run that small: the April 2026 Div I NAC and Veteran Championships had Veteran 80+ events of 2–5 fencers and a Div I men's foil team event of 4 teams
- An event outside this range draws an ERROR in validation and is excluded from the schedule, and the rest of the tournament is scheduled (see [Phase 1: Validation](#phase-1-validation))

---

## Warning-Level Rules

These rules produce warnings but do not block scheduling. Same-Day Completion also states the hard limits behind its warning: a phase that breaks one fails its attempt instead of drawing a warning.

### Same-Day Completion

- A competition that starts on a given day should finish on that day
- Each day's end time (default 7:00 PM) is that day's soft target (Ops Manual p.17 – "should complete no later than 7 p.m. if started by 9 a.m."), and the WARN follows it. The engine may place work past it, up to the day's hard end, and an event's last phase beyond that up to midnight (see below). The hard end is 10:00 PM, unless the organizer sets a later day end, in which case the hard end equals that day end
- When a day's last competition ends after the soft target, the engine emits a structured WARN for that day with the estimated finish time. Scheduling is not blocked
- Every phase but an event's last must end by the hard end (see `SAME_DAY_VIOLATION` in [Bottlenecks Specific to the Concurrent Scheduler](#bottlenecks-specific-to-the-concurrent-scheduler))
- An event's last phase (the event's final allocated phase: its DE, or the video stage for a staged DE – the gold and bronze bouts are not allocated) may end past the hard end when it starts before the hard end and ends by midnight of that day. The event is placed, and the engine emits a structured WARN for that event whose estimated finish is that last phase's end
- A phase that cannot meet its limit fails the attempt, and two failed attempts still leave the event unscheduled (see [Two-Attempt Retry](#two-attempt-retry))

### Pool Start Cutoff

- An event's first pool phase – its pools, or Flight A for a flighted event – should start no later than 7 hours after its day's start, which is 4:00 PM on a 9:00 AM day (`LATEST_START_OFFSET` in [`constants.ts`](src/engine/constants.ts)). Flight B is not checked
- An event whose first pool phase starts later is still placed, and the engine emits a structured WARN for that event with its pool start time (rule `pool-start-after-cutoff`). A hand move is checked against the cutoff at once, the way it is checked for late finishes. No event is dropped or moved for it
- Unsourced: no current USA Fencing source states a cutoff. The 2026-27 Ops Manual's only clock time is p.17's "should complete no later than 7 p.m. if started by 9 a.m." The cutoff is Piste Planner's own rule, from the owner's requirements of 2026-03-24, and is listed in [Appendix B](#appendix-b-departures-from-the-operations-manual)

### Strip-Hour Feasibility

- Before scheduling, the engine compares the whole tournament's estimated strip-hours with what the venue offers: general strip-hours against days × the strip total (video strips included) × the 10-hour planning day, and, when any event needs video, video strip-hours against days × video strips × 10 hours
- When demand exceeds capacity by more than 15%, the engine emits a WARN (rule `feasibility-strip-hours`, or `feasibility-video-strip-hours` for video) with the shortfall and the extra days or extra strips that would cover it
- The check never stops scheduling. The scheduler goes on to place what fits
- The 15% slack is unsourced (see [Appendix A](#appendix-a-penalty--constant-defaults)). It allows for the estimate's worst-case padding, which real schedules routinely run inside
- (see [`validation.ts`](src/engine/validation.ts) – `validateFeasibility`)

---

## Soft Preferences

These factors influence day assignment through a weighted penalty system. The auto-suggest algorithm assigns each competition to the day with the lowest total penalty among the days its hard rules allow. Penalties are listed in approximate order of strength. All weights will become configurable in a future release. (see [`dayColoring.ts`](src/engine/dayColoring.ts) – `colorPenalty`, and [`crossover.ts`](src/engine/crossover.ts) – `crossoverPenalty`)

See Appendix A for exact values.

### Demographic Crossover

- Piste Planner models fencer overlap with a **crossover graph** encoding the fraction of fencers shared between any two age categories (same gender and weapon) (see [`crossover.ts`](src/engine/crossover.ts))
- Maximum crossover weight per edge: **0.8** (capped)
- Examples:
  - Y12 → Y14: 0.8 (nearly all Y12 fencers also enter Y14)
  - Cadet → Junior: 0.8
  - Junior → Div 1A: 0.8 (almost always)
  - Veteran → Div 1: 0.1 (few Veterans also enter Division events, and Div 2, Div 3 and Div 1A carry the same 0.1). Veteran ↔ Div 1A individual events take the 3.0 soft separation instead (see [Other Soft Preferences](#other-soft-preferences))
- Two-hop indirect relationships computed automatically, capped at 0.3
- Two competitions on the same day add the pair's crossover weight to that day's penalty, whatever their start times (`colorPenalty` in [`dayColoring.ts`](src/engine/dayColoring.ts))
- The graph's weight applies only when no other rule sets the pair's value first (`crossoverPenalty` in [`crossover.ts`](src/engine/crossover.ts)). Group 1 pairs, such as Y12–Y14 and Cadet–Junior, are not scored by the graph: they are hard blocks at NAC, SYC and SJCC and take the Regional Group 1 pair penalty at ROC, RYC and RJCC. The other hard blocks and the soft separations in [Other Soft Preferences](#other-soft-preferences) override the graph's weight as well

### Rest Day Preference

- Junior and Div 1 (same weapon): consecutive days without rest → penalty
- Junior and Cadet carry no rest-day penalty at any modelled tournament type, including events built from the "Junior Olympics" template. The manual asks for that rest day only at the Junior Olympic Championships.
- Source: Ops Manual p.20 – Group 2: Highly Desirable ("A day of rest should be scheduled between Junior and Division I competitions in the same weapon", and "(Junior Olympic Championships) A day of rest should be scheduled between Junior and Cadet competitions in the same weapon")

### Proximity Preference

- Related categories should be on **adjacent days** (e.g., Friday/Saturday), not far apart
  - BAD: Junior Men's Epee on Friday, Div 1 Men's Epee on Monday
- 1 day apart: bonus (preferred)
- 2 days apart: neutral (0.0)
- 3+ days apart: penalty
- Ops Manual p.20 – Group 2 asks for this at Summer Nationals only ("For any one weapon, competitions in adjacent age groups should not be widely separated"). Piste Planner applies it at every tournament type, a departure listed in [Appendix B](#appendix-b-departures-from-the-operations-manual).

(see [`dayColoring.ts`](src/engine/dayColoring.ts) – `colorPenalty`, and [`constants.ts`](src/engine/constants.ts) – `PROXIMITY_GRAPH`, `PENALTY_WEIGHTS.PROXIMITY_1_DAY`, `PENALTY_WEIGHTS.PROXIMITY_3_PLUS_DAYS`)

### Weapon Balance

- The goal: no day holds only one weapon class. Each day should hold both the right-of-way weapons (foil and sabre) and épée, and above all no day should hold épée alone
- The balance is judged per day over every event on it, both genders and team events included
- An event that brings the missing class to a day holding only the other class earns a bonus. An event that leaves its day one-class costs a penalty – the first event placed on an empty day and every later event of the same class on a day that still holds one class. An event placed on a day that already holds both classes costs nothing. The bonus and the penalty are the same flat value for every event, whatever its size (see [Appendix A](#appendix-a-penalty--constant-defaults))
- When the tournament has no event of one class at all, weapon balance is not scored
- Source: Ops Manual p.20 – Group 2 ("Each day should include a balance of right of way weapon and épée competitions")
- The rest of that manual bullet is not modelled: separating the start times of large foil and sabre events held on one day, and keeping two same-day sabre events small with separated starts. [Saber Pileup](#saber-pileup) covers sabre stacking at the day level. See [Manual Criteria Not Modelled](#manual-criteria-not-modelled).

### Other Soft Preferences

| Preference | Penalty | Condition |
|---|---|---|
| Regional Group 1 pair | 5.0 | ROC, RYC and RJCC only. A [Group 1 pair](#overlapping-population-separation-group-1) (DIV1↔JUNIOR, JUNIOR↔CADET, DIV1↔CADET, Y10↔Y12, Y12↔Y14, Y14↔CADET) with the same weapon+gender on the same day, run inside the time-of-day window. Different weapon or gender does not trigger. The exception is Div 1 individual ↔ Junior team and Junior individual ↔ Div 1 team, which stay hard at every type (see [Individual/Team Separation](#individualteam-separation)). At NAC, SYC and SJCC these pairs are hard blocks. |
| Soft Separation (DIV1↔DIV2) | 3.0 | Same weapon+gender on same day. (see `SOFT_SEPARATION_PAIRS`) |
| Soft Separation (DIV1↔DIV3) | 3.0 | Same weapon+gender on same day. (see `SOFT_SEPARATION_PAIRS`) |
| Soft Separation (VET↔DIV1A) | 3.0 | Same weapon+gender on same day (per gender, as for Group 1 – Piste Planner's reading). The Veteran side is every Veteran individual event (age-banded and Vet Combined) and the Div 1A side is the Div 1A individual event. Ops Manual p.20 – Group 2 |
| Soft Separation (DIV2↔DIV3) | 3.0 | Same weapon+gender on same day (per gender, as for Group 1 – Piste Planner's reading). Ops Manual p.20 – Group 2 |
| Soft Separation (Y14/CADET/JUNIOR↔DIV1 team) | 3.0 | Same weapon+gender on same day (per gender, as for Group 1 – Piste Planner's reading), where the DIV1 side is the open (Div 1) team event. Matched by event type, so DIV1 individual events are not affected by this row. A pair that a hard block already separates stays blocked. Ops Manual p.20 – Group 2 ("open team") |
| Cross-Weapon Same Demographic | 0.2 | Same category, gender and event type (for Veterans, the same age group), different weapon, same day. Every category. Ops Manual p.20 – Group 3 |
| Y8↔Y10 same day | -0.3 (bonus) | Same weapon+gender on the same day. The spec asks Y8 to share a day with Y10 (see [Departures From the Manual](#departures-from-the-manual)). The value is unsourced (see [Appendix B](#appendix-b-departures-from-the-operations-manual)) |
| Y10↔DIV3 same day | -0.3 (bonus) | Same weapon+gender on the same day. The two draw no common fencers, which makes a good same-day pairing (see [Departures From the Manual](#departures-from-the-manual)). Unsourced (see [Appendix B](#appendix-b-departures-from-the-operations-manual)) |

### Individual-Team Proximity

- Applies to every category that has both an individual and a team event (Ops Manual p.20 – Group 2: "Team competitions should be scheduled for after the individual competition in the same category")
- Team event preferred the day after individual: bonus
- Team before individual: penalty (soft preference, not hard)
- 2+ days apart: penalty
- **Veteran team**: must be adjacent to ANY veteran individual of the same weapon/gender (Vet Combined or Vet Age 40–80)
- **Same-category individual and team on one day**: [Same-Population Conflicts](#same-population-conflicts) keeps them on different days, so they share a day only when a pin or the least-bad fallback ([When Days Are Too Few](#when-days-are-too-few)) puts them there. Then the team event's first phase never starts before the individual event's last phase ends + 120 minutes (`INDIV_TEAM_MIN_GAP_MINS`, see [Cross-Event Dependency Edges](#cross-event-dependency-edges)), and the scheduler emits `SEQUENCING_CONSTRAINT` (INFO) when the wait delays the team. When the event waited on is never placed, the wait lapses and the waiting event's pools are ready as if it did not exist – from day start, or from any other floor that applies to it, such as the regional Group 1 window
- Other individual/team pairs have no time gap within a day. Their day-level separation comes from the day rules above – Group 1, the cross-level blocks in [Individual/Team Separation](#individualteam-separation), the soft separations in [Other Soft Preferences](#other-soft-preferences) and the crossover graph ([Demographic Crossover](#demographic-crossover))

(see Appendix A for exact values)

### Retired Time-of-Day Preferences

The owner retired eight time-of-day preferences on 2026-10-04, together with the two windows they used – the 30-minute same-time window and the 10-minute early-start window:
- Two high-crossover competitions (0.8 and up) within 30 minutes of each other on one day
- Two lower-crossover competitions within 30 minutes of each other on one day
- An individual and team event of one category at the same time, or with the team first, on one day
- An individual and team event under 120 minutes apart
- Two high-crossover competitions both starting at day start on the same day
- Two high-crossover competitions both starting at day start on consecutive days
- An individual and team event of one category both starting at day start on consecutive days
- A Y8 or Y10 event not starting at day start

Each one scored a start time. Day assignment picks each event's day before any start time exists, and the concurrent scheduler that sets the times allocates strips greedily without weighing penalties, so none of them can be scored. The live parts of these rules are described elsewhere: same-day crossover is scored per day ([Demographic Crossover](#demographic-crossover)), a same-category team event waits 120 minutes after its individual event ([Individual-Team Proximity](#individual-team-proximity) and [Cross-Event Dependency Edges](#cross-event-dependency-edges)), Y8 and Y10 get first pick among phases ready at the same time ([Within-Day Priority Order](#within-day-priority-order)), and the regional Group 1 window holds the older side's pools until 4 hours after day start ([Regional Types](#regional-types-soft-with-a-time-of-day-window)).

---

## When Days Are Too Few

Hard rules block a day outright, and soft weights only rank the days that remain, so nothing is relaxed. There are no relaxation levels, and a hard rule is never traded for a soft preference.

When every day is blocked for an event – each day already holds an event it may not share a day with, or the day its Vet co-day requires is blocked – day assignment still gives it a day. It takes the least-bad day, the one with the lowest total penalty, and when the days tie it takes the first of them. Then:
- Each hard pair the placement breaks draws one WARN, `UNAVOIDABLE_CROSSOVER_CONFLICT` (rule `hard-separation-violated`), naming both events
- A placement that splits an age-banded Vet co-day across days draws a WARN with rule `vet-co-day-split` (see [Veteran Age-Group Co-Day Rule](#veteran-age-group-co-day-rule))
- Scheduling continues. Neither WARN stops the run or drops the event

A pin or a hand move that breaks a hard pair draws the same `hard-separation-violated` WARN from the hand-placement check (`checkPlacementRules`), which reads the board, pins included. A split Vet co-day draws `vet-co-day-split` from both the engine and the hand-placement check, which judge the final day map, pins included. Like every other hard break, neither WARN can be dismissed.

(see [`dayColoring.ts`](src/engine/dayColoring.ts) – `dsaturLoop`, [`concurrentScheduler.ts`](src/engine/concurrentScheduler.ts) – `scheduleAllConcurrent`, and [`placementRules.ts`](src/engine/placementRules.ts) – `checkPlacementRules`)

---

## Competition Math

### Pool Composition

Pool structure follows USA Fencing rules (S8 Table 2.16.1, pp.37–38, and pool sizes for smaller fields, pp.85–86). (see [`pools.ts`](src/engine/pools.ts))

#### Pool Sizing

- 9 or fewer fencers: single pool of all fencers
- 10 fencers without override: 2 pools of 5
- 10+ fencers: pools targeting 6–7 fencers each → `ceil(fencerCount / 7)` pools
- Remainder fencers distributed so some pools get one extra fencer

#### Pool Duration Estimation

A pool of N fencers takes the pool-of-7 time scaled by its bout count, rounded to the nearest minute (Ops Manual p.17 – Average Bout Timing, Pool of 7):

```
pool_minutes(N) = pool_of_7_minutes × bouts(N) / 21,   bouts(N) = N × (N − 1) / 2
```

See [Appendix A](#pool-duration-by-weapon-pool-of-7-baseline-21-bouts) for the pool-of-7 defaults by weapon (21 round-robin bouts). The organizer can edit the table, and only its defaults come from the manual.

- e.g., pool of 6 = 15 bouts → 15/21 of the pool-of-7 time: 86 foil, 86 épée, 43 sabre
- e.g., pool of 5 = 10 bouts → 10/21 of the pool-of-7 time: 57 foil, 57 épée, 29 sabre

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
- `searchStripCount(competitions, config, pinned)` in [`stripSearch.ts`](src/engine/stripSearch.ts) – advisory: suggests a strip total (see [Strip Count Suggestion](#strip-count-suggestion))
- `flagFlightingCandidates(competitions, config)` in [`stripBudget.ts`](src/engine/stripBudget.ts) – returns competition IDs where `n_pools` exceeds that event's own `pool_strip_cap`

### Flighting

Flighting splits a large competition's pool round into exactly two flights (Flight A and Flight B), using **half the strips for double the time**. Ops Manual p.17 points to it when strips run short: "If tournaments cannot provide the appropriate number of strips for pools, double flighting may be needed." Two flights is the maximum – three or more flights are not used in USA Fencing operations. The schedule records each flight's start, end, strips and refs (see [Runtime Decomposition](#runtime-decomposition) and [`flighting.ts`](src/engine/flighting.ts)).

#### Trigger

A competition is a flighting candidate when its pool count exceeds the per-event strip cap:

- `pool_strip_cap = floor(strips_total × max_pool_strip_pct)` (default 80%)
- Per-event override: `max_pool_strip_pct_override` on a `Competition` replaces the global percentage for that event
- `flagFlightingCandidates(competitions, config)` returns competition IDs where `n_pools > pool_strip_cap`. It computes each event's cap with `computeStripCap`, so the per-event override above holds (see [`stripBudget.ts`](src/engine/stripBudget.ts)). Pre-scheduling analysis (`initialAnalysis` in [`analysis.ts`](src/engine/analysis.ts)) calls it for its per-competition strip-deficit check and warns (`pools-exceed-strip-cap-unflighted`) for each candidate that is not flighted (see [Phase 2: Pre-Scheduling Analysis](#phase-2-pre-scheduling-analysis)).

#### How Flighting Works

- The **larger event** is the one to flight (half the strips, double the time) – the engine suggests it, and the organizer turns flighting on per event (see [Flighting Pair Suggestion](#flighting-pair-suggestion))
- Other events on the day run in parallel with the flights when strips allow, in the order set by [Within-Day Priority Order](#within-day-priority-order), where larger phases go first
- Flight A starts early – in [Within-Day Priority Order](#within-day-priority-order) a ready Flight A node comes after Y8/Y10 and before video-required phases

#### Flighting Pair Suggestion

- Flighting is suggested when two same-day competitions' combined pool count exceeds `strips_total` but each fits individually within the global `pool_strip_cap`, with no per-event override. The suggestion names the larger event, the one with more pools, for flighting (`suggestFlightingGroups` in [`flighting.ts`](src/engine/flighting.ts)). When both have the same pool count, the suggestion draws a WARN (`flighting-priority-tie`) and the organizer picks.
- The suggestion is advisory. Findings show the WARNs that pre-scheduling analysis raises around it (see [Phase 2: Pre-Scheduling Analysis](#phase-2-pre-scheduling-analysis)), and the organizer decides whether to turn flighting on. The app does not form flighting groups, so a suggestion never changes the schedule by itself.

#### Runtime Decomposition

Under the concurrent scheduler a flighted event's pools split into two dependent phase nodes, `FLIGHT_A → FLIGHT_B`. Flight B is ready `FLIGHT_BUFFER_MINS` (15 minutes, unsourced) after Flight A ends. This flight gap is the flight-specific rule, and it replaces the 30-minute admin gap (`ADMIN_GAP_MINS`) between the two flights. Both nodes run on the event's assigned day. If Flight B cannot meet its day limit, the event fails and retries from `dayStart` (see [Two-Attempt Retry](#two-attempt-retry)). See [Concurrent Phase Scheduler](#concurrent-phase-scheduler).

### Direct Elimination (DE)

(see [`de.ts`](src/engine/de.ts), [`concurrentScheduler.ts`](src/engine/concurrentScheduler.ts))

#### Bracket Sizing

- DE bracket = next power of 2 at or above fencers advancing from pools
- Advancement depends on cut-to-DE setting:
  - **% cut**: `round(fencerCount × (1 - cutPercentage / 100))`
  - **Promoted count**: `min(promotedValue, fencerCount)`
  - **Disabled**: all fencers advance
- Minimum 2 fencers always advance
- Maximum 256 fencers advance in every event: `promoted = min(advancing, 256)`, so no DE bracket is larger than 256 (S8 p.37 – "A maximum of 256 fencers will be promoted out of pools for all events")
- The bracket holds `bracketSize − promoted` byes. Byes are not bouts, so the first round has `promoted − bracketSize / 2` bouts and every later round is full (see [DE Duration](#de-duration))

#### Default Cuts by Age Category

| Age Category | Default Cut | Notes |
|---|---|---|
| Y8, Y10, Y12 | Disabled (100% advance) | |
| Y14 | Disabled (100% advance) | At every tournament type (S8 p.38 – Y14 SYC & NAC, 100% promoted). S8's 80% advance belongs to the Y14 National Championship, which no template models. |
| Cadet, Junior | 20% cut (80% advance) | Except at ROC, RYC, SYC, RJCC and SJCC → 100% advance. Cadet and Junior at a NAC: S8 p.37. |
| Div 1 | 25% cut (75% advance) | Except at ROC, RYC, SYC, RJCC and SJCC → 100% advance. Div 1 at a NAC: S8 p.37 – "Division I National Championships, Division I NACs and Division I July Challenge", "75% promoted to simple direct elimination". |
| Div 1A | Disabled (100% advance) | Except at Summer Nationals → 80% advance |
| Div 2, Div 3 | Disabled (100% advance) | |
| Veteran | Disabled (100% advance) | |

#### DE Modes

Determined by tournament type and event type. NAC individual events use Staged DEs, with the stage round starting per the Video Policy (NAC individual events always have video). All other individual events use Single Stage. Team events use Single Stage at every tournament type, NACs included, even when the organizer's DE mode setting is Staged. A team DE has no video stage to split at (see [Video Replay Policy](#video-replay-policy)).

- **Single Stage DE**: all DE rounds run on allocated strips as fast as possible
  - Video replay is not applicable
  - Strip ask: `min(bracketSize / 2, 16)` (`DEFAULT_DE_STRIP_FOOTPRINT`), none for a bracket of 2. The DE's length is derived at the strips actually granted (see [DE Duration](#de-duration))
  - A team DE is one block on general strips, from the first bracket round through the semifinals. It is derived at the team match time.
- **Staged DEs** (NAC individual events only): two phases – **Prelim** and **Video**
  - The Video stage round is determined by age category (see [Video Replay Policy](#video-replay-policy))
  - Structure: Prelim DEs on general strips, asking `min(bracketSize / 2, 16)` → Video stage on video strips, asking `min(4, bracketSize / 2)`
  - Multiple events in the Video stage contend for the available video strips

#### DE Duration

A DE's length derives from the time per bout (Ops Manual p.17 – Average Bout Timing). Each round from the first bracket round through the semifinals runs in waves, and the rounds run one after another:

```
round_minutes = ceil(bouts_in_round / strips) × bout_minutes
de_minutes    = sum of round_minutes, first bracket round through the semifinals
```

- **Strips**: the strips actually granted to the phase. A DE asks for at most `DEFAULT_DE_STRIP_FOOTPRINT` (16) strips (see [DE Modes](#de-modes)). When fewer are granted, the length is derived again at the granted count.
- **Bouts**: byes are not bouts. The first round has `promoted − bracketSize / 2` bouts, and each later round has half as many bouts as fencers (the round of 16 has 8, the semifinals 2). The gold and bronze bouts are not counted (see [Scheduler Stops at Semis](#scheduler-stops-at-semis)).
- **No counted round**: a DE whose bracket has no counted round – a bracket of 2 – takes 0 minutes and asks no strips, general or video. Its gold bout's time is covered by the tail estimate (see [Scheduler Stops at Semis](#scheduler-stops-at-semis)).
- **Bout time** (see [Timing Constants](#timing-constants)):
  - 15-touch individual bout: 20 foil, 20 épée, 13 sabre – Ops Manual p.17's 15-touch planning figure (15/15/8), read as fencing time, plus a 5-minute strip changeover. The changeover is an extension listed in [Appendix B](#appendix-b-departures-from-the-operations-manual).
  - 10-touch individual bout for Y8, Y10 and every Veteran age group, Vet Combined included: 15 foil, 15 épée, 10 sabre – the 15-touch fencing time × 10⁄15, rounded, plus the 5-minute changeover (S8 p.38 for Y10, Vet Age and Vet Open, and p.41 for all Veteran DEs). This departs from Ops Manual p.17, which prints only a 15-touch figure. Y8's 10-touch bout is Piste Planner's own departure, which extends Y10's rule because S8 no longer states it.
  - Team match: 60 foil, 60 épée, 30 sabre as printed, with no changeover added (Ops Manual p.17 – Team Match). Team DEs derive round by round with it.

Worked example – foil, 248 promoted, bracket of 256, 16 strips granted:

| Round | Bouts | Waves on 16 strips |
|---|---|---|
| R256 | 248 − 128 = 120 | 8 |
| R128 | 64 | 4 |
| R64 | 32 | 2 |
| R32 | 16 | 1 |
| R16 | 8 | 1 |
| QF | 4 | 1 |
| SF | 2 | 1 |

Single stage: (8 + 4 + 2 + 1 + 1 + 1 + 1) × 20 = 360 min.

#### DE Phase Breakdown (for Staged DEs)

A staged DE splits at the event's video-stage round (see [Video Replay Policy](#video-replay-policy)) into two blocks, each derived per [DE Duration](#de-duration) at the strips granted to that block:

- **General (prelims) block** (`DeBlocks.general`): Prelim phase on general strips – covers all rounds above the video-stage round. It asks for `min(bracketSize / 2, 16)` strips.
- **Video block** (`DeBlocks.video`): Video phase on video strips – covers the video-stage round through the semis (the scheduler's terminal round). It asks for `min(4, bracketSize / 2)` video strips.

`deBlocksFor` in [`de.ts`](src/engine/de.ts) builds both blocks. The schedule records the video block in the `de_round_of_16_*` result fields, a name that covers the video block whatever its stage round (round of 16 or round of 8).

A staged DE has a prelims block only when its bracket is larger than its video-stage round. A bracket at or below the video round runs every round in the video phase. The gold and bronze bouts are **not** allocated, and their time is captured by the `tailEstimateMins` buffer in `de_total_end` (see [Scheduler Stops at Semis](#scheduler-stops-at-semis)).

Worked example – the same foil event run as Div 1, video from the round of 16:

- Prelims, R256–R32 on 16 general strips: (8 + 4 + 2 + 1) × 20 = 300 min.
- Video, R16–SF on 4 video strips: R16's 8 bouts take 2 waves, then QF and SF take 1 each, so (2 + 1 + 1) × 20 = 80 min.

#### Video Replay Policy

At national tournaments, video replay is guaranteed from a specific DE round per age category. At local and regional tournaments, video replay is optional. (Ops Manual p.19 – Video Replay)

The video policy is a rule per tournament type, not per category:

- **NAC**: every individual event is `REQUIRED`, from the round in the table below. A NAC defaults to 8 video strips (see [Inputs](#inputs)).
- **Team events, at every type**: `BEST_EFFORT`, NACs included. Ops Manual p.19 lists Teams under "Guaranteed for the Gold/Bronze". Gold and bronze bouts are not scheduled, so team events plan with no video requirement. Teams might wait toward the end of the tournament, and the bout committee finds a video strip for the gold and bronze team matches on the day.
- **Every other type**: every individual event is `BEST_EFFORT` (Ops Manual p.19, "optional for all local and regional tournaments"). SYC and SJCC are treated as regional for video, although they follow the national same-day rules (see [Appendix B](#appendix-b-departures-from-the-operations-manual)). Video strips might be available but are never guaranteed, so no phase waits for one, and any phase may use them as overflow strips (see [Video Strip Preservation](#video-strip-preservation)).

| Age Category | Guaranteed From | Notes |
|---|---|---|
| Div 1, Junior, Cadet | Round of 16 | |
| Y10, Y12, Y14 | Round of 8 | |
| Y8 | Round of 8 | Interpretation – p.19 does not list Y8, so it follows Y10 |
| Vet 50, Vet 60, Vet 70 | Round of 8 | |
| Div 1A, Div 2, Div 3 | Round of 8 | As printed on p.19 (the 2019 edition gave the round of 4) |
| Vet 40, Vet 80, Vet Combined | Round of 8 | As printed on p.19 (the 2019 edition gave the round of 4) |
| Teams | Gold/Bronze only (Ops Manual p.19) | No video in planning at any tournament type. The scheduler stops at semis, so no gold/bronze phase is allocated, and the bout committee finds a video strip on the day (see [Scheduler Stops at Semis](#scheduler-stops-at-semis)). |

- Phases before the video round run on general strips
- The video round and beyond run on video strips. A video block asks for `min(4, bracketSize / 2)` video strips, so the default 8 video strips carry two video stages at once.

---

## DE Capacity Estimation

(see [`capacity.ts`](src/engine/capacity.ts))

One per-bout model estimates the strip-hours a DE event consumes, for day assignment. Each bout bills one strip for one bout time, whatever strip count the scheduler grants, so the estimate never bills strips that later rounds release to other events:

```
de_strip_hours = DE bouts × bout_minutes / 60
```

DE bouts are counted as in [DE Duration](#de-duration): every round from the first bracket round through the semifinals, with byes not counted. The gold and bronze bouts are excluded – the scheduler stops at semis (see [Scheduler Stops at Semis](#scheduler-stops-at-semis)).

### Individual Events

- **SINGLE_STAGE**: every DE bout bills general strip-hours at the event's bout time (15-touch or 10-touch).
- **STAGED**: the split follows [DE Phase Breakdown](#de-phase-breakdown-for-staged-des).
  - Prelims: bouts in the rounds above the video-stage round bill general strip-hours. A bracket at or below its video-stage round has no prelims bill.
  - Video stage: bouts from the video-stage round through the semis bill video strip-hours, and only these count as video strip-hours.
- Example: foil, 248 promoted, bracket of 256 has 120 + 64 + 32 + 16 + 8 + 4 + 2 = 246 bouts × 20 min = 82 strip-hours. Staged from the round of 16, that is 232 prelims bouts (77.3 general strip-hours) and 14 video bouts (4.7 video strip-hours).

### Team Events

Team DEs use the same model with the team-match time in place of the bout time (`estimateCompetitionStripHours` in [`capacity.ts`](src/engine/capacity.ts)):

- Every team match bills general strip-hours and none bills video strip-hours, at every tournament type, NACs included. Team DEs run Single Stage (see [DE Modes](#de-modes)).
- Non-power-of-2 entry counts produce play-in bouts in the opening round, and byes are not bouts.
- The finals match is excluded – the scheduler stops at semis (see [Scheduler Stops at Semis](#scheduler-stops-at-semis)).

---

## Resources

### Strip Assignment

(see [`resources.ts`](src/engine/resources.ts))

The scheduler allocates strips through the semifinal round only. Gold and bronze bouts are not assigned a strip block — organizers handle those ad-hoc on whatever strip becomes free first (see [Scheduler Stops at Semis](#scheduler-stops-at-semis)).

#### Interval-List Model

Strip occupancy lives in `state.strip_allocations`, a `StripAllocation[][]` indexed by strip. Each `StripAllocation` records `{event_id, phase, start_time, end_time}` and the per-strip list is kept sorted by `start_time`. A strip is busy at `[startTime, endTime]` iff at least one of its allocations overlaps that window. Allocations are append-only inside a scheduling pass; rollback for a failed event is order-independent — `releaseEventAllocations(state, event_id, attempt_id?)` splices entries by `event_id` (and optionally `attempt_id` for bottlenecks) across every strip's list.

The core primitive is `findAvailableStripsInWindow(state, config, count, startTime, duration, videoRequired, day?)`. It walks each candidate strip's interval list and returns either:
- `{ fit: 'ok', strip_indices }` — `count` strips are simultaneously free for `[startTime, startTime + duration]`, or
- `{ fit: 'none', earliest_next_start, reason }` — no fit at `startTime`. `earliest_next_start` is the soonest moment `count` candidate strips become simultaneously free for `duration` minutes, and `reason` is `'STRIPS'` (the strip pool was the limiter) or `'TIME'` (the candidate would push past the day's hard end). The concurrent scheduler uses `earliest_next_start` to defer a phase forward in time without retrying the whole event.

Strips are a flat pool – `video_capable` is the only categorical distinction between them. A DE phase claims a contiguous count of strips as one allocation, whether STAGED or SINGLE_STAGE.

#### Video Strip Preservation

Video strips are primarily reserved for staged DE video phases (the video-stage round through SF). The reservation holds only on a day that holds a `REQUIRED` video phase – the staged DE of an individual event at a NAC (see [Video Replay Policy](#video-replay-policy)). On any other day no phase needs a video strip, and pools use video strips the way DE prelims do, as overflow once general strips run out. On a day that holds a `REQUIRED` video phase, pool rounds may use video strips only under these conditions:

- **Start-of-day pool wave**: video strips MAY be used by a pool phase that starts within `MORNING_WAVE_WINDOW_MINS` (120 minutes, unsourced) of the day start – by 11:00 AM on a 9:00 AM day, and a pool phase that starts at exactly 11:00 AM is still in the wave. Once this wave ends, video strips become reserved for DEs – a later event starting its pools mid-day must run on general strips only.
- **Single-event day**: when only one competition is scheduled for the entire day, video strips remain available for that event's pools at any time (morning or end-of-day). A single event cannot conflict with its own DEs (its DE phases run strictly after its pools), so reserving video strips adds no value.
- **Multi-event mid-day pools**: not allowed. On a multi-event day, a pool phase that starts after the wave runs on general strips only.

Phase-level rules:
- **`videoRequired=true`** (staged DE video phase, from the video-stage round through SF – the scheduler's terminal round): only video-capable strips are considered. Gold/bronze video is not modeled, and organizers find a video strip ad hoc (see [Scheduler Stops at Semis](#scheduler-stops-at-semis)).
- **`videoRequired=false` for DE prelims / single-stage DEs**: non-video strips selected first; video strips used as overflow when general strips are exhausted.
- **`videoRequired=false` for pools**: on a day that holds a `REQUIRED` video phase, subject to the pool-specific rules above (start-of-day wave, or single-event day). On any other day, the same as DE prelims.

#### Resource Windows

- For each phase (pool round, DE prelim, DE video stage), the engine finds the earliest time slot where strips are available
- If strips aren't available at the ideal time, the engine defers straight to the soonest moment enough strips are simultaneously free, rather than scanning forward slot by slot
- When strips run short and a phase that needs no video strip is deferred, a strip-contention diagnostic (`STRIP_CONTENTION`, INFO) is emitted once for that event and phase, whatever the delay (see [Bottlenecks Specific to the Concurrent Scheduler](#bottlenecks-specific-to-the-concurrent-scheduler))

#### Slot Granularity

- All phase start times snap to 5-minute boundaries (13:00, 13:05, 13:10, etc.) – a start time that lands between boundaries rounds up to the next one (e.g., 13:03 → 13:05)
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

The tournament type sets refs per pool to One or Two:

| Tournament type | Refs per pool |
|---|---|
| NAC, SYC, SJCC | Two |
| ROC, RYC, RJCC | One |

These values are unsourced. The Operations Manual states no refs-per-pool count and links a separate Referee Requirements document instead (Ops Manual p.19).

- **One ref per pool**: minimum
- **Two refs per pool**: preferred for higher-level events

This setting changes how many refs the engine reports as needed, and it does not change the schedule.

(Logic implemented in `pools.ts:resolveRefsPerPool`.)

#### Ref Demand Derivation

Ref demand is derived post-schedule. The scheduler reports the peak of its own timeline: each phase at the times and on the strips it allocated, waits included, leaving out a phase that holds no strips. The workbench footer counts the board it draws. Right after a run that is the same timeline, so the two are one number. An event moved by hand after the run is counted with its phases laid end to end from its new day and start by the scheduler's duration rules – the times the next run would try to claim for it as a pin – less any phase that finds no free strip. While the engine's inputs differ from the last run's, every event is counted that way, every phase included, until the next run. **DE phases require one referee per allocated strip.** Pool phases follow `refs_per_pool`. Per-day peaks come from a sweep over those intervals.

This corrected a prior under-count on staged DE events – the earlier model reported roughly one referee per 4-strip group, so the fix raised staged-DE referee demand by roughly 4×.

---

## Concurrent Phase Scheduler

The runtime scheduler is an **OS-process-scheduling-style loop over phase nodes**. Each event decomposes into a sequence of phase nodes (`POOLS`, or `FLIGHT_A → FLIGHT_B` for a flighted event, then `DE_PRELIMS → DE_R16` for STAGED or `DE_SINGLE` for SINGLE_STAGE), and the loop pops the highest-priority READY node, allocates strips via the [interval-list model](#interval-list-model), and pushes the successor onto the ready queue. Events with disjoint strip needs run truly concurrently in the same window. These are the scheduler's `PhaseKind` names. Findings and phase labels record the same phases as `Phase` values, where `DE_R16` is `DE_ROUND_OF_16` and `DE_SINGLE` is `DE`. (see [`concurrentScheduler.ts`](src/engine/concurrentScheduler.ts))

Shipped as Phase D on 2026-04-27. `scheduleAll` is now a thin shim over `scheduleAllConcurrent`.

### Phase-Node Lifecycle

Each phase node moves through `PENDING → READY → RUNNING → FAILED`. `READY` means the predecessor phase is RUNNING and the node is on the ready queue; `RUNNING` means the strips are allocated and `end_time` is set; `FAILED` is terminal for the current attempt and triggers the cascade described below.

### Within-Day Priority Order

When multiple phase nodes are READY, the loop picks the one with the highest priority. The comparator (`compareNodes` in [`concurrentScheduler.ts`](src/engine/concurrentScheduler.ts)) orders by:

1. **Earlier `ready_time` first** – the node that can start sooner gets first pick of the strip pool.
2. **Y8/Y10 first** – youth events claim strip-time at the start of the day before larger events crowd them out. Without this key, B3-style scenarios collapse. Ops Manual p.20 – Group 2 asks for Y10 events early in the day, and giving Y8 the same early start is a departure (see [Appendix B](#appendix-b-departures-from-the-operations-manual)).
3. **Flight A first** – a flighted event's first flight claims its strips early in the day (see [Flighting](#flighting)), so Flight B can follow while the day has time left.
4. **Video-required first** – claim scarce video strips before they're contested.
5. **Larger `desired_strip_count` first** – bigger phases are hardest to fit, so they are placed while the strip pool is emptiest.
6. **Higher `constraint_score` first** – the most-constrained event wins the remaining ties (see [Phase 3](#phase-3-priority-ordering)).
7. Stable on `event_id` for full determinism.

### Allocation, Deferral, and Failure

The loop calls `findAvailableStripsInWindow`. On `fit: 'ok'` the node transitions to RUNNING, the successor's `ready_time` is set to `node.end_time + ADMIN_GAP_MINS` (or `+ FLIGHT_BUFFER_MINS` alone after `FLIGHT_A` – the 15-minute flight buffer replaces the 30-minute admin gap between the two flights), and the successor is pushed onto the ready queue. On `fit: 'none'`:
- If the node can still meet its day limit from `earliest_next_start` (end by the day's hard end, or for an event's last phase, start before the hard end and end by midnight – see [Same-Day Completion](#same-day-completion)), the node is **deferred**: `ready_time` advances to `earliest_next_start`, `defer_count++`, and the node goes back onto the ready queue. A monotonicity invariant asserts `new_ready_time > old_ready_time`. `MAX_DEFERS_PER_PHASE = 16` is a circuit breaker against pathological states; the monotonicity invariant alone bounds termination.
- Otherwise the node FAILS, and the failure cascades to all not-yet-RUNNING phases of the event.

### Two-Attempt Retry

The retry budget is **per-event**, not per-phase. On attempt 1's cascade, `releaseEventAllocations(state, event_id, 1)` rolls back every interval, schedule entry, and attempt-1-tagged bottleneck for the event; the event resets to PENDING/READY at `dayStart` and a `DEADLINE_BREACH` (WARN, `attempt_id=1`) is emitted. Attempt 2's failure emits `DEADLINE_BREACH_UNRESOLVABLE` (ERROR, `attempt_id=2`) and the event is permanently unscheduled. The notBefore-deferral path handles forward shifts inside a single attempt; retry's value is the **backward** shift (start the event earlier on the same day, freeing strip-time for the failing phase).

### Cross-Event Dependency Edges

Three narrow cases make a phase node's timing depend on another event on the same day:

- **Indv → team gap.** A TEAM event and its individual counterpart of the same category, weapon and gender are hard-separated (see [Same-Population Conflicts](#same-population-conflicts)), so they share a day only through a pin or the least-bad fallback (see [When Days Are Too Few](#when-days-are-too-few)). When they do, the team's first phase is not ready before `indiv.last_phase.end_time + INDIV_TEAM_MIN_GAP_MINS` (120 min).
- **Vet age-banded stagger.** On the co-day of the age-banded VET individual events of one gender + weapon, the bands start oldest first with a 60-minute stagger: each younger band's pools are not ready before the pools of the next-older band on that day start + 60 minutes. No band waits for another to finish. The stagger is Piste Planner's own rule and unsourced (see [Veteran Age-Group Co-Day Rule](#veteran-age-group-co-day-rule) and [Appendix B](#appendix-b-departures-from-the-operations-manual)).
- **Regional Group 1 window.** At ROC, RYC and RJCC, when a [Group 1 pair](#overlapping-population-separation-group-1) of the same gender + weapon falls on the same day, the younger side's pools are ready from day start, while the older side's pools are not ready before day start + 4 hours. A WARN fires when the window cannot be honoured, for example when a pin places the older side earlier. Each pair applies its own window and the windows do not stack, so in a Y10, Y12 and Y14 day the Y12–Y14 pair is not honoured.

All three are wired in `applyCrossEventEdges`. The first two are waits on another event, and they bind whatever order the loop meets the events in. The regional window is a fixed floor from day start, set when the node is queued. The loop emits `SEQUENCING_CONSTRAINT` (INFO, rule `cross-event-dependency-delay`) when a dependency pushes a node's `ready_time` forward. When the event waited on is never placed, the wait lapses and the waiting event's pools are ready as if it did not exist – from day start, or from any other floor that applies to it, such as the regional Group 1 window.

### Termination Bound

`max_iter = max(total_phase_count × MAX_DEFERS_PER_PHASE × 2, 1)`. The loop throws if it exceeds this — defensive against unbounded retry, though the monotonicity invariant should prevent it.

### Bottlenecks Specific to the Concurrent Scheduler

- `DEADLINE_BREACH` (WARN, `attempt_id=1`) – attempt 1 cascade.
- `DEADLINE_BREACH_UNRESOLVABLE` (ERROR, `attempt_id=2`) – attempt 2 cascade, and the event is permanently unscheduled.
- `SAME_DAY_VIOLATION` (ERROR) – a phase other than the event's last ends past `dayHardEnd`, the day's hard end (default 10:00 PM, see [Timing Constants](#timing-constants)), or the event's last phase starts at or after the hard end or ends past midnight. Ending after the 7:00 PM soft target is not this violation (see [Same-Day Completion](#same-day-completion)).
- `SAME_DAY_VIOLATION` (WARN) – a placed event's last phase ends past `dayHardEnd` but within the midnight limit. One per event, with its estimated finish time.
- `NO_WINDOW_DIAGNOSTIC` (INFO) – a deferral occurred. It carries `reason: 'STRIPS' | 'TIME'`.
- `SEQUENCING_CONSTRAINT` (INFO, rule `cross-event-dependency-delay`) – a cross-event wait pushed `ready_time` forward (see [Cross-Event Dependency Edges](#cross-event-dependency-edges)).
- `FLIGHT_B_DELAYED` (WARN) – Flight B started more than 30 min after its own ready time, which is Flight A's end + `FLIGHT_BUFFER_MINS` rounded up to the scheduling slot. A flighted event that meets no strip contention never draws it.
- `VIDEO_STRIP_CONTENTION` (INFO) – video-required phase had to defer.
- `STRIP_CONTENTION` (INFO) – generic one-shot diagnostic when no specific cause applies.
- `UNAVOIDABLE_CROSSOVER_CONFLICT` (WARN, rule `hard-separation-violated`) – a hard rule blocked every day for an event, so day assignment put it on the least-bad day and broke a hard same-day separation. One per broken pair, naming both events (see [When Days Are Too Few](#when-days-are-too-few)).
- Rule `vet-co-day-split` (WARN) – the final day map, pins included, puts the age-banded Vet individual events of one gender and weapon on more than one day, against the [Veteran Age-Group Co-Day Rule](#veteran-age-group-co-day-rule). A pin or the least-bad fallback causes it. The hand-placement check emits it too, and like the other broken hard rules it cannot be dismissed.
- Rule `pool-start-after-cutoff` (WARN) – an event's first pool phase (`POOLS`, or `FLIGHT_A` for a flighted event) starts later than day start + 7 hours (`LATEST_START_OFFSET`), 4:00 PM on a 9:00 AM day. The WARN carries the start, and the event stays placed – no event is dropped or moved for it. Flight B is exempt. A hand move is checked against it at once, without re-running the engine. Piste Planner's own rule, unsourced (see [Appendix B](#appendix-b-departures-from-the-operations-manual)).

---

## Scheduling Algorithm

The auto-suggest engine assigns each competition a day by **penalty-minimising graph coloring**, then places every phase with a **priority-ordered** loop. The result is a **suggestion**. The organizer moves an event to another day on the board, which pins it there. A hand move is checked at once against the hard same-day pairs, a split Vet co-day, the regional Group 1 window, the first- and last-day length, a first pool phase that starts after the cutoff and late or overrun finishes, without re-running the engine. Auto-assign re-runs around the pins after every edit to an engine input. (see [`scheduler.ts`](src/engine/scheduler.ts), [`dayColoring.ts`](src/engine/dayColoring.ts), [`constraintGraph.ts`](src/engine/constraintGraph.ts), [`concurrentScheduler.ts`](src/engine/concurrentScheduler.ts))

### Phase 1: Validation

- The configuration and each competition's own settings are checked (`validateConfig` in [`validation.ts`](src/engine/validation.ts)): the strip total and day count, fencer count bounds, cut values, team-event settings, the video-stage strip ask, the strip minimum for pools ([Resource Preconditions](#resource-preconditions)) and that every team event has its individual event ([Team Events Require a Matching Individual](#team-events-require-a-matching-individual)). The hard same-day separations and the Vet co-day are not checked here – day assignment applies them ([Phase 4](#phase-4-day-assignment)), and [Single-Day Fit](#single-day-fit) is enforced when phases are placed
- When every ERROR comes from a per-event rule – fencer count bounds, the two cut-value rules or the video-stage strip shortfall (`video-r16-strip-shortfall`) – the events those ERRORs name are excluded, one WARN says how many, and the rest are scheduled
- Any other ERROR aborts scheduling immediately
- Warnings collected and carried forward

### Phase 2: Pre-Scheduling Analysis

Analysis passes run outside the main scheduling loop. `initialAnalysis()` is not called from `scheduleAll()`: the app runs it on the board it draws, with each placed event on its day and each unplaced one spread round-robin over the days, and its warnings reach Findings. (see [`analysis.ts`](src/engine/analysis.ts))

1. Total pool demand vs. strips – warns if any day's total pools exceed strip count
2. Per-competition strip deficit – `flagFlightingCandidates()` finds each competition whose pools exceed its effective strip cap (`pool_strip_cap`, per-event override included). The pass warns (`pools-exceed-strip-cap-unflighted`) when such a competition is not flighted
3. Flighting pairs – identifies same-day pairs whose combined pools exceed the strip total while each fits within the global strip cap, and picks the larger event of each pair as the one to flight (`suggestFlightingGroups` in [`flighting.ts`](src/engine/flighting.ts)). When the two have equal pool counts, a WARN (`flighting-priority-tie`) asks the organizer to choose. The organizer turns flighting on per event
4. Multiple-flighting conflicts – warns if more than one flighted competition falls on the same day
5. Video strip demand – warns when a day holds more staged events that require video than there are video strips. It counts events per day after days are assigned, not concurrent strip demand (rule `day-video-demand-exceeds-video-strips`)
6. Flighting-pair video conflicts – warns when both events of a suggested flighting pair require video
7. Cut summaries – informational breakdown of advancement numbers per competition

### Phase 3: Priority Ordering

Two orders decide which competition goes first, one for days and one for strips.

- **Day order.** Day assignment colors the competitions by DSatur (`dsaturLoop` in [`dayColoring.ts`](src/engine/dayColoring.ts)). The next competition colored is the one whose hard-separated neighbours already sit on the most distinct days, then the one with the most hard-separated neighbours, then the one with the largest packing footprint (strips × [age-category weight](#age-category-weights)).
- **Strip order.** Within a day, phase nodes run in [Within-Day Priority Order](#within-day-priority-order), where the constraint score breaks the ties every earlier key leaves.

Constraint score factors (`constraintScore` in [`dayAssignment.ts`](src/engine/dayAssignment.ts)):
- **Crossover count**: how many other competitions this one has a crossover penalty with
- **Window tightness**: the day's window over the competition's own window. The app sets no per-competition window, so this factor is 0 for every competition
- **Video scarcity**: for a staged event that requires video (a NAC individual event), the number of such events ÷ video strips. Every other event scores 0

### Phase 4: Day Assignment

Day assignment uses every day the organizer chose. It takes the competitions in the day order of [Phase 3](#phase-3-priority-ordering), and for each one:

- Evaluate every day, leave out each day a hard rule blocks, and pick the one with the **lowest total penalty** among the rest
- Penalty = sum of all applicable soft preferences and load-balancing terms vs. competitions already assigned (see [Capacity-Aware Day Assignment](#capacity-aware-day-assignment))
- If a hard rule blocks every day, the event takes the least-bad day and each broken pair draws a WARN (see [When Days Are Too Few](#when-days-are-too-few))

#### Saber Pileup

Saber competitions carry an extra per-candidate-day penalty when other saber events are already on that day. `saberPileupPenalty` (`dayAssignment.ts`) counts how many other SABRE competitions are already assigned to the candidate day and applies an escalating penalty, capped once four or more other saber events are already on the day. Non-saber competitions always score 0. See [Appendix A](#appendix-a-penalty--constant-defaults) for the exact values.

The penalty applies on every candidate day, because saber refs are three-weapon specialists and are naturally scarce – concentrating saber events on one day is a structural staffing risk, not a load-balance nicety. Applied per candidate day inside `colorPenalty` (`dayColoring.ts`).

### Phase 5: Resource Allocation

Once days are chosen, the **[Concurrent Phase Scheduler](#concurrent-phase-scheduler)** runs a single OS-process-style loop over phase nodes across all events. Pool, DE-prelim, DE video-stage (`DE_R16`), and SINGLE_STAGE-DE phases are scheduled in priority order, with disjoint-strip events running truly concurrently in the same window.

Per-event phase decomposition:

1. **Pool round**: one node (`POOLS`) or two nodes (`FLIGHT_A → FLIGHT_B` separated by `FLIGHT_BUFFER_MINS`, 15 min).
2. **Admin gap**: 30-minute mandatory gap between any phase and its successor (`ADMIN_GAP_MINS`), except between Flight A and Flight B, where the flight buffer alone applies.
3. **DE phases**: STAGED events run `DE_PRELIMS → DE_R16`, and SINGLE_STAGE events run a flat `DE_SINGLE` allocation. Gold/bronze are unallocated – `de_total_end = terminal_phase_end + tailEstimateMins(event_type)`.

If strips are unavailable at the ideal time, the loop **defers** the phase to the earliest moment the right number of strips become simultaneously free, using `findAvailableStripsInWindow`'s `earliest_next_start`. If no slot exists within the phase's day limit – ending by the day's hard end (default 10:00 PM), or for the event's last phase starting before the hard end and ending by midnight – the event fails and retries from `dayStart`, and a second failure marks the event permanently unscheduled. A phase that ends after the 7:00 PM soft target but before the hard end is placed, and so is a last phase that runs past the hard end within that limit, with a WARN carrying its estimated finish (see [Same-Day Completion](#same-day-completion)). See [Concurrent Phase Scheduler](#concurrent-phase-scheduler) for the full lifecycle.

Ref demand is **derived post-schedule** from the scheduler's own timeline (see [Ref Demand Derivation](#ref-demand-derivation)), not maintained incrementally by the loop. It is summarized into per-day peak totals in Phase 7.

### Phase 6: State Update

- After each competition is scheduled, its resource usage is committed to shared global state
- Subsequent competitions see updated availability

### Phase 7: Post-Schedule Outputs and Warnings

- **Referee requirements** computed by sweeping the recorded ref demand intervals (see [Referee Calculation](#referee-calculation)). Reported as `peak_total_refs` and `peak_saber_refs` per day.
- From 3 days up, a WARN fires when the projected length of the first or the last day is not shorter than every middle day actually used. A day's projected length is its last end minus its day start. (Ops Manual p.20 – Group 2: "The projected lengths of the first and last days of competition should be shorter than those of intervening days.") Day assignment plans for this with a reduced first- and last-day capacity (see [First and Last Day Capacity](#first-and-last-day-capacity)).

---

## Tournament-Type Policies

(see [`constants.ts`](src/engine/constants.ts), [`catalogue.ts`](src/engine/catalogue.ts))

Selecting the tournament type enables / disables events available in the tournament picker. For example, NACs do not have Div 1A. Only NACs have Team events. ROCs do not have Vet Age or Team events. Regional types (ROC, RYC, RJCC) can be combined — their available events are merged.

Each tournament type sets the same-day rules, the video policy, the DE mode, refs per pool and the default cuts:

| Type | Same-day rules | Group 1 pairs | Video | DE mode | Refs per pool | Default cuts |
|---|---|---|---|---|---|---|
| NAC | National | Hard | REQUIRED for every individual event, BEST_EFFORT for team events | Staged for individual events, Single Stage for team events | Two | Div 1: 25% cut. Cadet, Junior: 20% cut. Every other category: 100% advance |
| SYC | National | Hard | BEST_EFFORT | Single Stage | Two | 100% advance |
| SJCC | National | Hard | BEST_EFFORT | Single Stage | Two | 100% advance |
| ROC | Regional | Soft, with a time-of-day window | BEST_EFFORT | Single Stage | One | 100% advance |
| RYC | Regional | Soft, with a time-of-day window | BEST_EFFORT | Single Stage | One | 100% advance |
| RJCC | Regional | Soft, with a time-of-day window | BEST_EFFORT | Single Stage | One | 100% advance |

- **National types** (NAC, SYC, SJCC): every Group 1 pair is hard, Div 1–Cadet included (Ops Manual p.20 – Group 1). Piste Planner treats a fencer at these types as entering one individual event per day. Treating SYC and SJCC as national is listed in [Appendix B](#appendix-b-departures-from-the-operations-manual).
- **Regional types** (ROC, RYC, RJCC): fencers enter several events a day, so every Group 1 pair is soft, with a time-of-day window (see [Regional Types](#regional-types-soft-with-a-time-of-day-window) and [Appendix B](#appendix-b-departures-from-the-operations-manual)).
- At every type, team and individual events of the same category, weapon and gender stay on different days (see [Same-Population Conflicts](#same-population-conflicts)).
- Video replay is REQUIRED only for individual events at NACs. Team events and every other type use BEST_EFFORT, because video replay is optional at local and regional tournaments (Ops Manual p.19). SYC and SJCC are treated as regional for video (see [Appendix B](#appendix-b-departures-from-the-operations-manual)).
- Refs per pool are unsourced (see [Refs Per Pool](#refs-per-pool-input-that-affects-the-output)).

### NAC (North American Cup)

- All possible events except Div 1A.
- National same-day rules: every Group 1 pair is hard, Div 1–Cadet included (Ops Manual p.20 – Group 1).
- Rest-day preference between Junior and Div 1 in the same weapon (Ops Manual p.20 – Group 2). The Junior–Cadet rest day is a Junior Olympics rule and does not apply.
- Default cuts: Div 1 at 75% advancement to DE, Cadet and Junior at 80%. Y14 and every other category advance 100% (S8 pp.37–38).
- Staged DEs with video replay REQUIRED for every individual event: from the round of 16 for Div 1, Junior and Cadet, and from the round of 8 for every other category (Ops Manual p.19 – see [Video Replay Policy](#video-replay-policy)).
- Team events plan with no video and run Single Stage DEs on general strips. Video is guaranteed only for the gold and bronze team matches (Ops Manual p.19), which are not scheduled. The bout committee finds a video strip for them on the day.
- Two refs per pool.
- Typically 3–4 day events with large fields (100+ fencers in major categories)
- Predefined templates for common NAC formats (Youth, Cadet/Junior, Div 1/Junior, etc.)

### ROC (Regional Open Circuit)

- Uses VET_COMBINED (no individual veteran age-group breakdown)
- Div 1A and Veteran categories are the primary focus
- 100% advancement to DE in every category (Div 1A, Div 2 and Veteran: S8 p.37)
- Regional same-day rules: every Group 1 pair is soft, with the time-of-day window
- Single Stage DEs. Video replay is BEST_EFFORT (Ops Manual p.19)
- One ref per pool
- Can be combined with RJCC and RYC

### RYC / SYC (Regional / Super Youth Circuit)

- Youth categories (Y10, Y12, Y14)
- 100% advancement to DE (S8 p.38 – Y10 and Y12 at RYC and SYC, Y14 at SYC). Y14 at RYC advances 100% under its [default cut](#default-cuts-by-age-category).
- Smaller fields; regional-scale fencer defaults
- Y8 and Y10 events start early in the day: among phases ready at the same time they go first in [Within-Day Priority Order](#within-day-priority-order) (Ops Manual p.20 – Group 2 names Y10, and Y8 is a departure)
- Single Stage DEs. Video replay is BEST_EFFORT (Ops Manual p.19)
- RYC follows the regional same-day rules (every Group 1 pair soft, with the time-of-day window) and uses one ref per pool
- RYC can be combined with RJCC and ROC
- SYC is the national-level variant. It follows the national same-day rules (every Group 1 pair hard) and uses two refs per pool. Its other rules match RYC.

### RJCC / SJCC (Regional / Super Junior-Cadet Circuit)

- Cadet and Junior individual events
- 100% advancement to DE
- No Junior–Cadet rest-day preference – that rest day is a Junior Olympics rule (Ops Manual p.20 – Group 2)
- Single Stage DEs. Video replay is BEST_EFFORT (Ops Manual p.19)
- RJCC follows the regional same-day rules (every Group 1 pair soft, with the time-of-day window) and uses one ref per pool
- Can be combined with ROC and RYC
- SJCC is the national-level variant. It follows the national same-day rules (every Group 1 pair hard) and uses two refs per pool. Its other rules match RJCC.

---

## Auto-Suggestion Logic

The engine can auto-suggest configuration values to help organizers start with reasonable defaults. (see [`analysis.ts`](src/engine/analysis.ts), [`refs.ts`](src/engine/refs.ts))

### Strip Count Suggestion

The suggestion is the smallest strip count at which every event is placed and its last phase ends by the day's hard end (see [`stripSearch.ts`](src/engine/stripSearch.ts)). The search starts at a floor and steps up one strip at a time:

- **Manual baseline**: competitors on the busiest day ÷ 14 (Ops Manual p.17 – "Number of strips needed = Estimated number of competitors per day / 14")
  - **Busiest day**: the competitions' fencer counts are spread over the tournament days largest-first, each into the day with the fewest competitors so far, and the busiest day is the day that ends with the most. This is the same largest-first spread `suggestStripCount`, the search's ceiling, applies to pool counts (see [`analysis.ts`](src/engine/analysis.ts)). It depends only on the fencer counts and the number of days, never on the strip count being tested
  - **Team events** count their entries as stored (one per team)
  - **The divisor is fixed at 14** and does not scale when the organizer edits a day's hours. It is competitors per strip per day, not a day length
- **Strip-hour floor**: the fewest strips whose strip-hour capacity across the tournament's days (see [Strip-Hour Capacity](#strip-hour-capacity)) covers the competitions' total general strip-hour draw. Video strip-hours are not counted
- **Ceiling**: the busiest day's pools ÷ the pool-strip share (`max_pool_strip_pct`), rounded up, where the busiest day comes from the same largest-first spread applied to pool counts (`suggestStripCount` in [`analysis.ts`](src/engine/analysis.ts))
- **Window**: the search starts at max(strip-hour floor, manual baseline) and runs to the ceiling. When that start is above the ceiling, it runs to the start + the ceiling instead (`stripSearchRange` in [`stripSearch.ts`](src/engine/stripSearch.ts))
- **Answer**: the smallest count in that window at which the scheduler places every event with its last phase ending by the day's hard end. The manual's figure is never undercut. When no count in the window works, or no competition can be sized, there is no suggestion
- **Overrun counts as not placed**: an event whose last phase ends past the day's hard end is placed by the scheduler with a warning (see [Same-Day Completion](#same-day-completion)), but the search counts it as not placed. The suggestion sizes for every event ending by the hard end

### Referee Output

Referee counts are computed from the schedule, not suggested as inputs (see [Referee Calculation](#referee-calculation)). The engine reports per-day `peak_total_refs` and `peak_saber_refs`; the organizer chooses the foil/epee-only vs 3-weapon split when staffing.

### Flighting Suggestion

See [Flighting](#flighting) and [Strip Budget](#strip-budget) for trigger rules and mechanics. The analysis passes of [Phase 2](#phase-2-pre-scheduling-analysis) do this in two steps. Item 2 uses `flagFlightingCandidates()` to find competitions whose pool count exceeds their effective `pool_strip_cap` (per-event override included), and warns for each one that is not flighted. Item 3 uses `suggestFlightingGroups` (in [`flighting.ts`](src/engine/flighting.ts)) to find same-day pairs whose combined pool count exceeds `strips_total` while each fits within the global `pool_strip_cap`, and picks the larger event of each pair to flight, with a WARN when the two tie. Flighting is an organizer toggle – the organizer turns it on per event.

### Fencer Count Defaults

See [Appendix A: Fencer Count Defaults](#fencer-count-defaults-1) for per-category, per-weapon, per-gender default fencer counts at NAC and regional scale.

---

## Capacity-Aware Day Assignment

Day assignment uses a **capacity-aware packing** model. Each tournament day is a bin with a finite strip-hour budget, and competitions are weighted items spread across every day the organizer chose (see [Day Count](#day-count)).

(see [`dayColoring.ts`](src/engine/dayColoring.ts) – `assignDaysByColoring`, [`capacity.ts`](src/engine/capacity.ts) – `estimateCompetitionStripHours`, `categoryWeight`)

### Day Count

Day assignment works over every day the organizer chose (`days_available`). It does not first look for the fewest days the events could fit in: the organizer picks the day count, and the capacity penalty and the flat per-event cost (see [Capacity Penalty Curve](#capacity-penalty-curve)) spread the events across those days.

When the hard rules cannot fit every event into the chosen days, see [When Days Are Too Few](#when-days-are-too-few).

An earlier pass was meant to count the fewest days and then grow that count toward a target fill (`CAPACITY_TARGET_FILL` = 0.3, at most 4 days and never more than the organizer chose). It never did: the soft preferences ran in that pass too, so on the benchmark scenarios B1–B8 at 2–4 days it always returned every chosen day, above each scenario's true minimum, and no target fill from 0.2 to 1.0 changed any board (measured 2026-10-08). It was removed with its constants.

### Strip-Hour Capacity

A day's capacity is measured in **strip-hours**: available strips × the planning day length (10 hours, 600 minutes – the 9:00 AM to 7:00 PM day of Ops Manual p.17). A day with 80 strips has 800 strip-hours of general capacity. Capacity plans to the 7:00 PM soft target, not to the day's hard end. Day assignment keeps no separate video budget (see [Retired Video-Strip Budget](#retired-video-strip-budget)). At runtime pools are kept off video strips only on a day that holds a `REQUIRED` video phase, and even there they may use them in the start-of-day pool wave or on a single-event day (see [Video Strip Preservation](#video-strip-preservation)).

Each competition's strip-hour draw is computed from its pool and DE phases:
- **Pool phase**: `n_pools × pool_duration_hours`
- **DE phase**: DE bouts × bout time in hours (see [DE Capacity Estimation](#de-capacity-estimation))

For staged DEs (NACs), the bouts from the video-stage round through the semis count as video strip-hours, not general ones. Day assignment does not score them (see [Retired Video-Strip Budget](#retired-video-strip-budget)), while the feasibility check compares them with the video strips' strip-hours across the tournament (see [Strip-Hour Feasibility](#strip-hour-feasibility)).

### First and Last Day Capacity

From 3 days up, day assignment gives the first and the last day less capacity than a middle day: each gets the first/last day capacity factor times a middle day's strip-hours (see [Capacity Model Constants](#capacity-model-constants)), so the first and last days are planned shorter (Ops Manual p.20 – Group 2: "The projected lengths of the first and last days of competition should be shorter than those of intervening days"). The result is then checked after scheduling (see [Phase 7](#phase-7-post-schedule-outputs-and-warnings)).

### Age-Category Weights

Not all events consume a day equally. A 310-fencer Div 1 with staged video DEs anchors an entire day; a small Veteran Combined is comparatively lightweight. Each competition's strip-hour draw is multiplied by a category weight that reflects operational impact:

| Category | Weight | Notes |
|---|---|---|
| DIV1 | 1.5 | Heaviest — large fields, video DE serialization |
| JUNIOR, CADET | 1.3 | Heavy – video DE, large fields |
| Y10 | 1.2 | Early start required |
| Y8 | 1.0 | Baseline. It starts early with Y10 (see [Within-Day Priority Order](#within-day-priority-order)) but carries no extra weight. Including Y8 is a departure (see [Appendix B](#appendix-b-departures-from-the-operations-manual)) |
| Y12, Y14 | 1.0 | Baseline |
| VET 40, VET 50 | 0.8 | Lighter |
| DIV1A, DIV2, DIV3 | 0.7 | Lighter |
| VET 60, VET 70, VET 80 | 0.6 | Lightest. They share the age-banded co-day with Vet 40 and Vet 50, oldest first (see [Veteran Age-Group Co-Day Rule](#veteran-age-group-co-day-rule)) |
| VET Combined | 0.6 | Lightest. Vet Combined never shares the age-banded co-day |

### Capacity Penalty Curve

Day assignment adds a capacity penalty for a candidate day's fill ratio: the weighted general strip-hours on the day (see [Age-Category Weights](#age-category-weights)) divided by the day's capacity, which is a middle day's strip-hours times the first/last day factor where that applies (see [First and Last Day Capacity](#first-and-last-day-capacity)).

| Fill ratio | Penalty |
|---|---|
| ≤ 0.85 | 0 – no penalty |
| 0.85–1.0 | Linear ramp from 0 to 3.0 |
| > 1.0 | 3.0 plus 10 per unit of fill past 1.0, capped at 20.0 (reached at a fill of 2.7) |

The penalty belongs to day assignment's load-balancing terms, beside a flat 0.5 for each event already on the day (`LOAD_BALANCE_FULLNESS`). Both add to the soft-preference penalty total, so a nearly full day is penalized heavily even when it has no crossover or separation issues. (see [`dayColoring.ts`](src/engine/dayColoring.ts) – `capacityPenalty`, `colorPenalty`)

**Rejected: a curve that starts at 0.60.** An earlier curve charged nothing below a fill of 0.60, ramped gently to 3.0 at 0.80 and steeply to 10.0 at 0.95, and charged 20.0 above that. It over-steered events away from mid-loaded days and caused regressions in large multi-day tournaments, where several days naturally fill to 0.6–0.8 (recorded 2026-04-21 in the comment on `capacityPenalty` in `dayColoring.ts`). Ramping near 1.0 aims at the real failure – packing a day past its strip-hour capacity.

### Retired Video-Strip Budget

The spec once had day assignment score a video-strip budget: the peak concurrent video-strip demand of a day's staged DEs, with a moderate penalty (5.0) above 70% of the video strip total and 15.0 at 100%. It is retired as a Phase D casualty. Peak demand needs start times, and day assignment picks days before any start time exists. The model also assumed that each round released its video strips as it finished, which a video block does not do (see [Staged DE Strip Release](#staged-de-strip-release)).

Day assignment has no video term. Once days are assigned, a WARN (`day-video-demand-exceeds-video-strips`) fires on any day whose staged video events outnumber its video strips (see [Phase 2: Pre-Scheduling Analysis](#phase-2-pre-scheduling-analysis)).

### Staged DE Strip Release

For NAC staged DEs, the video block holds its `min(4, bracketSize / 2)` video strips from the video-stage round through the semis (R16 → QF → SF, or QF → SF for a round-of-8 video stage) and releases them all when the semis end. The rounds shrink as they go, but a block asks for at most 4 strips, so releasing strips round by round would free at most 2, at the semis (see [DE Phase Breakdown](#de-phase-breakdown-for-staged-des)). Other events on the same day run their video blocks on the remaining video strips, or wait until a block ends.

---

> **Note:** Gender equity pool-count validation (proportional strip allocation by gender during pool rounds) is to be added in a future version.

---

## Scheduler Stops at Semis

The scheduler's terminal DE phase is the **video-stage phase** (`DE_R16`, from the video-stage round through the semis) for Staged (NAC) events and the single DE phase (`DE_SINGLE`, through the semis) for Single-Stage events. It does **not** allocate strips, refs, or time windows for the gold medal bout or the bronze (third-place) bout.

### Operational Rationale

Gold and bronze bouts are managed ad-hoc by organizers. Once the semifinal strips are cleared, the tournament director queues them to the next available strip and available referee. Athletes expect and accept this queue wait — it is standard NAC practice. The bouts are typically short (one bout per match) and the field is tiny (2–4 fencers), so strip contention is negligible.

### End-Time Estimate

`ScheduleResult.de_total_end` is `phase_end + tailEstimateMins(event_type)`:

- `INDIV_TAIL_MINS = 30` minutes for individual events
- `TEAM_TAIL_MINS = 60` minutes for team events

This tail estimate gives logistics a realistic end-time for room turnover, awards, and volunteer release. It does not correspond to a scheduled strip block — it is a planning buffer only.

### Referee Coverage

Gold and bronze referee demand is **not** modeled as discrete `RefDemandInterval`s. The peak-demand sweep covers only the scheduled phases (pools through semis), and Piste Planner does not add the gold and bronze bouts, cancellations or lunch coverage to it. Organizers should not read the reported peak as the total refs needed for the full day, and should hold a modest reserve (typically 2–4 refs) for gold/bronze coverage.

### Video Policy Interaction

| Policy | Behavior |
|---|---|
| `REQUIRED` | Every individual event at a NAC (Ops Manual p.19). Allocates video strips for the video-stage phase (`DE_R16`), from the video-stage round through the semis. Gold/bronze video is found ad-hoc. |
| `BEST_EFFORT` | Every team event at every tournament type, NACs included (Ops Manual p.19 guarantees Teams video for the gold and bronze only). Also every event at a non-NAC tournament type (Ops Manual p.19 – optional at local and regional tournaments. SYC and SJCC are treated as regional for video, see [Appendix B](#appendix-b-departures-from-the-operations-manual)). Does not allocate dedicated video strips. Gold/bronze video is found ad-hoc. |

For strip allocation and video strip preservation details, see [Strip Assignment](#strip-assignment) and [Video Strip Preservation](#video-strip-preservation).

## References

| # | Source | URL / Location |
|---|---|---|
| S1 | USA Fencing Operations Manual, 2026-27 Edition (Published August 2026) | [PDF](https://assets.contentstack.io/v3/assets/blteb7d012fc7ebef7f/blt31ccda29e31349e7/USAF_OPsManual_2026_27.pdf) – Chapter 3 (Competitions: mixed events, pp.11–12), Chapter 4 (Tournament Management: scheduling guidelines and planning times p.17, review periods and double stripping p.18, video replay and the Referee Requirements link p.19, national tournament scheduling criteria p.20). Page numbers are the printed numbers in each page's footer, which can differ from a PDF viewer's page index. |
| S2 | Change.org Petition: "Address Critical Scheduling Issues in National Fencing Events" (488 signatures, Feb 2024) | [Link](https://www.change.org/p/address-critical-scheduling-issues-in-national-fencing-events) |
| S3 | Academy of Fencing Masters: "Petition to Fix the Summer Nationals Schedule" (Feb 2024) | [Link](https://academyoffencingmasters.com/blog/petition-to-fix-the-summer-nationals-schedule/) |
| S4 | Academy of Fencing Masters: "USA Fencing National Events: Time for a Strategic Overhaul" (Nov 2024) | [Link](https://academyoffencingmasters.com/blog/usa-fencing-national-events-time-for-a-strategic-overhaul/) |
| S5 | Fencing Parents: "How much notice should US Fencing give for NAC day schedules?" (Jun 2021) | [Link](https://www.fencingparents.org/whats-new-in-fencing/2021/6/28/how-much-notice-should-us-fencing-give-for-day-schedules-checkin-times-and-policy-changes) |
| S6 | USA Fencing: "Take Note of These Updates to Events and Formats for the 2024-25 Tournament Season" (Jul 2024) | [Link](https://www.usafencing.org/news/2024/july/19/take-note-of-these-updates-to-events-and-formats-for-the-202425-tournament-season) |
| S7 | USA Fencing: "Event Combinations Announced for 2023-24 NACs and Championships" (May 2023) | [Link](https://www.usafencing.org/news/2023/may/31/event-combinations-announced-for-202324-usa-fencing-nacs-and-championships) |
| S8 | USA Fencing Athlete Handbook 2026-27 | [PDF](https://assets.contentstack.io/v3/assets/blteb7d012fc7ebef7f/blt46a0168c9377fc1b/USA%20Fencing%20Athlete%20Handbook%202026-27) – Pool sizes, competition formats, gender equity. Cited pages: p.15 (§2.2.5 – the 336-entry cap for Div I, Junior and Cadet at NACs, and §2.3.2 – SYC and SJCC listed as regional tournaments), pp.37–38 (Table 2.16.1 – the 256-fencer maximum DE field on p.37, promotion rates and 10-touch DE bouts by event), p.41 (bout format: Veteran DEs are 10-touch), p.84 (Y8 Developmental Format), pp.85–86 (pool sizes for smaller fields). Page numbers are the printed ones. |
| S9 | Academy of Fencing Masters: "How to Make USA Fencing National Events Work for Everyone" | [Link](https://academyoffencingmasters.com/blog/how-to-make-usa-fencing-national-events-work-for-everyone/) |
| S10 | Fencing Time tournament software documentation | [Link](https://www.fencingtime.com/Home/VerHistory) |

---

## Appendix A: Penalty & Constant Defaults

All numeric penalty values and scheduling constants used by the engine. Prose sections use qualitative descriptions only and reference this appendix for exact values.

(see [`dayColoring.ts`](src/engine/dayColoring.ts) and [`crossover.ts`](src/engine/crossover.ts) for where the penalties apply, [`constants.ts`](src/engine/constants.ts) for the values, and [`dayAssignment.ts`](src/engine/dayAssignment.ts) for the saber-pileup table)

### Penalty Weights

| Factor | Value | Description |
|---|---|---|
| Regional Group 1 pair | 5.0 | ROC, RYC and RJCC only: a Group 1 pair, Div 1–Cadet included, with the same weapon+gender on the same day (Ops Manual p.20 – Group 1). Div 1 ind ↔ Junior team and Junior ind ↔ Div 1 team are the exception and stay hard at every type (see Ind/team cross-level block below) |
| Soft separation (DIV1↔DIV2, DIV1↔DIV3) | 3.0 | Same weapon+gender on same day |
| Soft separation, Group 2 (VET↔DIV1A, DIV2↔DIV3, Y14/CADET/JUNIOR↔DIV1 team) | 3.0 | Same weapon+gender on same day (Ops Manual p.20 – Group 2, applied per gender as for Group 1) |
| Rest day violation | 1.5 | Junior↔Div 1 on consecutive days without rest (Ops Manual p.20 – Group 2) |
| Team before individual | 1.0 | Team event on the day before its individual counterpart (Vet Combined on the day before its age-banded co-day is priced the same). Two or more days before falls to the Ind+team 2+ days apart row |
| Weapon balance | 0.5 | Day-level penalty, so that no day holds only one weapon class: +0.5 when the event leaves its day one-class – ROW (foil and sabre) only, or épée only – whether the day was empty or already held that class alone, and 0 on a day that already holds both classes. Both genders and team events count together. Skipped when the tournament has no event of one class (see [Weapon Balance](#weapon-balance)) |
| Saber pileup (per same-day saber count) | 0, 0.5, 2.0, 10.0, 50.0 (capped at 4+) | Escalating penalty for stacking saber events on one day, indexed by other same-day SABRE competitions |
| Proximity 3+ days apart | 0.5 | Related categories far apart in the schedule |
| Ind+team 2+ days apart | 0.3 | Individual and team event far apart |
| Cross-weapon same demographic | 0.2 | Same category, gender and event type (Veterans: same age group), different weapon, same day – every category (Ops Manual p.20 – Group 3) |
| Proximity 1 day apart | -0.4 | **Bonus**: related categories on adjacent days |
| Ind+team day after | -0.4 | **Bonus**: team event the day after individual |
| Weapon balance, missing class | -0.5 | **Bonus**: an event that brings the missing weapon class to a one-class day. Skipped when the tournament has no event of one class |
| Y8↔Y10 same day | -0.3 | **Bonus**: Y8 and Y10 of the same weapon+gender on the same day. Y8 with Y10 is a departure (see [Appendix B](#appendix-b-departures-from-the-operations-manual)) |
| Y10↔Div 3 same day | -0.3 | **Bonus**: Y10 and Div 3 of the same weapon+gender on the same day – no fencer overlap. Unsourced (see [Appendix B](#appendix-b-departures-from-the-operations-manual)) |
| Same population | ∞ | **Hard block**: identical age category + gender + weapon |
| Group 1 mandatory separation | ∞ | **Hard block** at NAC, SYC and SJCC: Group 1 pairs, Div 1–Cadet included, must be on different days (Ops Manual p.20 – Group 1). DIV1↔DIV1A is a hard block at every type (departure) |
| Ind/team cross-level block | ∞ | **Hard block** at every type: Div 1 ind ↔ Junior team and Junior ind ↔ Div 1 team, same weapon+gender, must be on different days (Ops Manual p.20 – Group 1 bullet 1). Hard at ROC, RYC and RJCC (departure) |

The eight time-of-day weights this table once listed are retired (see [Retired Time-of-Day Preferences](#retired-time-of-day-preferences)).

### Timing Constants

| Constant | Value | Description |
|---|---|---|
| Day start | 9:00 AM (540 min) | Each day's earliest pool round start, editable per day (Ops Manual p.17). The pool-start cutoff is measured from it |
| Day end | 7:00 PM (1140 min) | Each day's soft target, editable per day: a day whose last competition ends later draws a WARN (Ops Manual p.17) |
| Day hard end | 10:00 PM (1320 min) | No phase but an event's last may end past it (`SAME_DAY_VIOLATION`). The last phase must start before it and may end past it with a WARN, up to midnight. Equals the day end when the organizer sets a day end later than 10:00 PM. Unsourced |
| Last-phase limit | Midnight (1440 min) | An event's last phase must end by midnight of its day. Unsourced |
| Day length | 10 hours (600 min) | Planning day, Day start to Day end, used for strip-hour capacity (Ops Manual p.17) |
| Competitors per strip per day | 14 | Fixed divisor of the [Strip Count Suggestion](#strip-count-suggestion) baseline (Ops Manual p.17). Not a day length |
| Pool-start cutoff | Day start + 7 hours (`LATEST_START_OFFSET`, 420 min – 4:00 PM on a 9:00 AM day) | An event whose first pool phase (its pools, or Flight A) starts later is placed with a WARN (`pool-start-after-cutoff`) carrying the start. No event is dropped or moved for it, and Flight B is exempt. Piste Planner's own rule, unsourced (see [Pool Start Cutoff](#pool-start-cutoff) and [Appendix B](#appendix-b-departures-from-the-operations-manual)) |
| Admin gap | 30 min | Mandatory gap between a phase and its successor (see [Phase 5](#phase-5-resource-allocation)). Its floor is the results-review period between rounds (Ops Manual p.18 – 15 min national, 10 regional, 5 local). No gap is added between the DE rounds inside one DE phase – the strip changeover is part of the DE bout time. Flight A → Flight B (`FLIGHT_A → FLIGHT_B`) is exempt and takes `FLIGHT_BUFFER_MINS` instead |
| Slot granularity | 5 min | All phase start times snap to 5-minute boundaries |
| FLIGHT_BUFFER_MINS | 15 min | Flight B becomes ready this long after Flight A ends, in place of the admin gap (see [Runtime Decomposition](#runtime-decomposition)). Unsourced (see [Appendix B](#appendix-b-departures-from-the-operations-manual)) |
| MORNING_WAVE_WINDOW_MINS | 120 min | Start-of-day pool wave: a pool phase that starts no later than day start + 120 min (11:00 AM on a 9:00 AM day, that minute included) is in it. On a day that holds a `REQUIRED` video phase, pools may use video strips only inside it, or all day on a single-event day (see [Video Strip Preservation](#video-strip-preservation)). Unsourced (see [Appendix B](#appendix-b-departures-from-the-operations-manual)) |
| Vet co-day stagger | 60 min | On an age-banded Veteran co-day, each younger band's pools become ready 60 min after the next-older band's pools start. No band waits for another to finish (see [Veteran Age-Group Co-Day Rule](#veteran-age-group-co-day-rule)). Unsourced (see [Appendix B](#appendix-b-departures-from-the-operations-manual)) |
| DE_BOUT_DURATION | Épée 20, Foil 20, Sabre 13 | Minutes per 15-touch DE bout: Ops Manual p.17's 15-touch planning figure (15/15/8, Average Bout Timing), read as fencing time, plus a 5-minute strip changeover (an extension, see [Appendix B](#appendix-b-departures-from-the-operations-manual)) |
| 10-touch DE bout | Épée 15, Foil 15, Sabre 10 | Minutes per DE bout for Y8, Y10 and every Veteran age group, Vet Combined included: 15-touch fencing time × 10⁄15, rounded, plus the 5-minute changeover (S8 p.38 for Y10, Vet Age and Vet Open, and p.41 for all Veteran DEs). A departure from Ops Manual p.17, which prints no 10-touch figure. Y8 is Piste Planner's own departure, which extends Y10's rule |
| Team match | Épée 60, Foil 60, Sabre 30 | Minutes per team DE match, as printed with no changeover added (Ops Manual p.17 – Team Match) |

### Pool Duration by Weapon (pool-of-7 baseline, 21 bouts)

Defaults from Ops Manual p.17 – Average Bout Timing, Pool of 7. The organizer can edit them, and other pool sizes scale by bout count (see [Pool Duration Estimation](#pool-duration-estimation)).

| Weapon | Duration |
|---|---|
| Epee | 120 min |
| Foil | 120 min |
| Saber | 60 min |

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
| Flighting threshold | n_pools > pool_strip_cap (default 80% of strips) | Strip-budget trigger for the flighting suggestion. Flighting itself is the organizer's toggle |
| Video strip count | 0 to the strip total – default 8 at a NAC, 0 elsewhere | Any count at any tournament type. The NAC default of 8 lets two video stages run at once. At types other than NAC video strips are best-effort |
| Video stage strip ask | `min(4, bracketSize / 2)` | Video strips a staged DE's video block asks for |
| Fencer count bounds | 2–336 | Valid range per competition. The maximum is the NAC entry cap for Div I, Junior and Cadet (S8 §2.2.5, p.15), applied to every event. The minimum stays 2 because real events run that small: the April 2026 Div I NAC and Veteran Championships had Veteran 80+ events of 2–5 fencers and a Div I men's foil team event of 4 teams |
| DE minimum advancement | 2 fencers | Minimum fencers advancing to DE bracket |
| DE maximum advancement | 256 fencers | Maximum fencers promoted out of pools in any event (S8 p.37) |
| Pool size targets | 6–7 | Target pool size; `ceil(fencerCount / 7)` pools |
| Maximum crossover weight | 0.8 | Crossover graph edge cap |
| Two-hop crossover cap | 0.3 | Indirect relationship cap |
| Ind/team separation gap | 120 min | A team event's first phase waits this long after its individual counterpart's last phase ends (same category, gender and weapon) when a pin or the least-bad fallback puts the two on one day (see [Cross-Event Dependency Edges](#cross-event-dependency-edges)). Unsourced (see [Appendix B](#appendix-b-departures-from-the-operations-manual)) |
| DE_REFS | 1 | Referees required per allocated DE strip |
| DEFAULT_DE_STRIP_FOOTPRINT | 16 | Cap on the strips a DE asks for: a single-stage DE or prelims block asks `min(bracketSize / 2, 16)`. The DE length is derived at the strips granted (see [DE Duration](#de-duration)) |

### Capacity Model Constants

| Constant | Value | Description |
|---|---|---|
| DIV1 weight | 1.5 | Strip-hour multiplier (heavy: large fields + video serialization) |
| Junior weight | 1.3 | Strip-hour multiplier |
| Cadet weight | 1.3 | Strip-hour multiplier |
| Y10 weight | 1.2 | Strip-hour multiplier |
| Y8 weight | 1.0 | Baseline weight |
| Y12, Y14 weight | 1.0 | Baseline weight |
| Div1A, Div2, Div3 weight | 0.7 | Lighter weight |
| Veteran 40/50 weight | 0.8 | Lighter weight |
| Veteran 60/70/80 weight | 0.6 | Lightest weight. The co-day stagger orders the age bands (see [Veteran Age-Group Co-Day Rule](#veteran-age-group-co-day-rule)) |
| Veteran Combined weight | 0.6 | Lightest weight. Vet Combined never shares the age-banded co-day |
| First/last day capacity factor | 0.8 | Share of a middle day's strip-hours given to the first and the last day, from 3 days up (Ops Manual p.20 – Group 2) |
| Capacity penalty curve | 0 up to fill 0.85, linear to 3.0 at fill 1.0, then 3.0 + 10 per unit of fill past 1.0, capped at 20.0 | Penalty on a candidate day's strip-hour fill, one of day assignment's load-balancing terms, beside the flat per-event cost (see [Capacity Penalty Curve](#capacity-penalty-curve)) |
| Load-balance fullness | 0.5 per event | `LOAD_BALANCE_FULLNESS` in [`dayColoring.ts`](src/engine/dayColoring.ts): a flat penalty per event already on a candidate day, one of day assignment's load-balancing terms beside the capacity curve |
| Feasibility slack | 1.15 | `FEASIBILITY_SLACK` in [`validation.ts`](src/engine/validation.ts): a whole-tournament strip-hour estimate, general and video, draws a WARN when demand exceeds days × strips (video strips for the video check) × day length by more than 15%. It names the extra days or strips and never stops scheduling (see [Strip-Hour Feasibility](#strip-hour-feasibility)). Unsourced (see [Appendix B](#appendix-b-departures-from-the-operations-manual)) |

---

## Appendix B: Departures from the Operations Manual

Where this spec departs from or extends the Operations Manual (S1), and the manual criteria the engine does not model. Page numbers are the manual's printed page numbers.

### Departures

- **Y8 with Y10.** Ops Manual p.20 – Group 1 keeps immediately adjacent age groups off the same day. The spec says Y8 CAN and SHOULD share a day with Y10, and Y8–Y10 is not a Group 1 pair (see [Overlapping-Population Separation (Group 1)](#overlapping-population-separation-group-1)). Day assignment gives Y8 and Y10 of the same weapon and gender a same-day bonus (see [Appendix A](#appendix-a-penalty--constant-defaults)). The bonus value, -0.3, is Piste Planner's own, unsourced.
- **Y10 with Div 3.** No USA Fencing source asks for it. The spec gives Y10 and Div 3 of the same weapon and gender a same-day bonus, because no fencer enters both. Piste Planner's own rule, unsourced.
- **Veteran co-day stagger.** The age-banded Veteran events of one gender and weapon share a day, and that is not a departure: they are one Veteran event split into sub-events by age band, so Ops Manual p.20 – Group 1 bullet 2's adjacent-age rule does not apply to them (see [Veteran Age-Group Co-Day Rule](#veteran-age-group-co-day-rule)). On that day the bands start oldest first with a 60-minute stagger: each younger band's pools become ready 60 minutes after the next-older band's pools start, and no band waits for another to finish. The order and the stagger are Piste Planner's own rule, unsourced – the one reference found describes the 2026 NAC Veteran events as held "on the same day with different start times".
- **Div 1 and Div 1A, hard.** Ops Manual p.20 – Group 1 names "the Div I, Junior, and Cadet competitions", not Div 1A. The spec keeps Div 1 and Div 1A of the same weapon and gender on different days as a hard block, because nearly the same fencers enter both.
- **Group 1 per gender.** Ops Manual p.20 – Group 1 applies "for any one weapon". The spec applies each Group 1 pair per weapon and gender, so a pair in different genders is not separated (see [Overlapping-Population Separation (Group 1)](#overlapping-population-separation-group-1)). The Group 2 soft separations in [Other Soft Preferences](#other-soft-preferences) are read the same way.
- **Group 1 at regional types.** Ops Manual p.20 sets the criteria for national tournaments. At ROC, RYC and RJCC fencers enter several events a day, so the spec makes every Group 1 pair soft there, with a time-of-day window (see [Regional Types](#regional-types-soft-with-a-time-of-day-window)).
- **Div 1 and Junior individual/team pairs kept hard at regional types.** Ops Manual p.20 – Group 1 bullet 1 keeps the Div I, Junior and Cadet competitions of one weapon off the same day, and the spec makes the rest of Group 1 soft at ROC, RYC and RJCC. Div 1 ind ↔ Junior team and Junior ind ↔ Div 1 team of the same weapon and gender stay hard there, because each team event draws from the other level's individual field (see [Individual/Team Separation](#individualteam-separation)).
- **SYC and SJCC.** Neither the Operations Manual nor S8 calls SYC or SJCC a national tournament, and S8 p.15 lists both under "Regional Tournaments". The spec applies Ops Manual p.20's national scheduling criteria to them (every Group 1 pair hard), while it treats them as regional for video (`BEST_EFFORT`, Ops Manual p.19). See [Tournament-Type Policies](#tournament-type-policies).
- **Group 1 bullet 3 kept hard at regional types.** Ops Manual p.20 – Group 1 keeps team and individual events of the same age level and weapon off the same day. The spec keeps this hard at every type, regional types included, because the same fencers enter both by definition, and p.20 – Group 2 asks the same ("same day scheduling of individual and team competitions should be avoided when it is possible that a fencer could fence in both competitions"). See [Same-Population Conflicts](#same-population-conflicts).
- **Y8 in Y10's early-start and video tiers.** Ops Manual p.20 – Group 2 asks for Y10 events early in the day, and p.19 lists Y10, not Y8, in the round-of-8 video tier. The spec gives Y8 the same first pick of the day's strips as Y10 (the Y8/Y10 key of [Within-Day Priority Order](#within-day-priority-order)) and, at a NAC, the same round-of-8 video stage.
- **Proximity at every type.** Ops Manual p.20 – Group 2 asks that adjacent age groups not be widely separated at Summer Nationals only. The spec applies [Proximity Preference](#proximity-preference) at every tournament type.
- **DE strip changeover.** Ops Manual p.17 prints 15/15/8 minutes per 15-touch bout as an average planning time and mentions no changeover. The spec reads that figure as fencing time and adds a 5-minute strip changeover, giving 20 foil, 20 épée, 13 sabre (see [DE Duration](#de-duration)). Team matches take p.17's figure as printed.
- **10-touch DE bouts.** Ops Manual p.17 prints a planning time for a 15-touch DE bout only. Y10 and every Veteran age group, Vet Combined included, fence 10-touch DE bouts (S8 p.38 for Y10, Vet Age and Vet Open, and p.41 for all Veteran DEs). Y8 is held to the same 10-touch bout as Piste Planner's own departure, which extends Y10's rule because S8 no longer states it (owner ruling, 2026-10-05). Their bout time is p.17's figure × 10⁄15, rounded, plus the 5-minute strip changeover: 15 foil, 15 épée, 10 sabre (see [DE Duration](#de-duration)).
- **Refs per pool.** The manual states no refs-per-pool count and links a separate Referee Requirements document instead (Ops Manual p.19). The per-type values in [Refs Per Pool](#refs-per-pool-input-that-affects-the-output) are unsourced.
- **Pool-start cutoff.** No USA Fencing source sets a latest pool start – the only clock time in the Ops Manual, on p.17, is "should complete no later than 7 p.m. if started by 9 a.m." Piste Planner keeps its own rule, unsourced, from the owner's requirements of 2026-03-24: an event whose first pool phase (its pools, or Flight A) starts later than day start + 7 hours (4:00 PM on a 9:00 AM day) is placed with a WARN (`pool-start-after-cutoff`) carrying the start, and no event is dropped or moved for it (see [Pool Start Cutoff](#pool-start-cutoff) and [Timing Constants](#timing-constants)).
- **Feasibility slack.** The whole-tournament strip-hour WARN tolerates demand up to 15% over capacity before it fires, because the estimate is a worst case that overlaps scheduling slack. The 1.15 figure is Piste Planner's own, unsourced (see [Strip-Hour Feasibility](#strip-hour-feasibility)).
- **Timing allowances.** No USA Fencing source gives the 15-minute wait from Flight A's end to Flight B's ready time, the 120-minute start-of-day pool wave that may use video strips, or the 120-minute wait between an individual event and its team event when the two share a day. All three are Piste Planner's own, unsourced (see [Timing Constants](#timing-constants) and [Resource Constants](#resource-constants)).
- **Crossover graph weights.** The fractions in [Demographic Crossover](#demographic-crossover) are Piste Planner's own estimates, unsourced.

### Manual Criteria Not Modelled

- **Staggered starts for large foil and sabre events** on the same day, and the rule that two sabre events sharing a day be small with separated start times (Ops Manual p.20 – Group 2). The same bullet's first sentence, weapon balance, is specified in [Weapon Balance](#weapon-balance), and [Saber Pileup](#saber-pileup) stays as the day-level sabre rule.
- **Weapons control for the first event of the first day** (Ops Manual p.20 – Group 2).
- **Weekday rotation** (Ops Manual p.20 – Group 2), and the closing note on a weapon inconvenienced during a season (p.20). Both are season-level rules, while Piste Planner plans one tournament at a time.
- **Last-day referee shortage** (Ops Manual p.20 – Group 3). Referees are an output of the schedule, not an input, so there is no shortage to plan around.
- **Coaches' training camps, membership and board meetings, and multi-weapon team selection** (Ops Manual p.20 – Group 3).
- **Announced second-flight times** (Ops Manual p.17). The schedule's Flight B start is an estimate, and announcing a flight time is the organizer's call.
- **Double stripping** (Ops Manual p.18). It is decided ad hoc on the day, and the pool durations are averages that absorb it.
- **Pool-round exemptions** – byes past an initial round by seeding (Ops Manual p.17). Every promoted fencer comes from the single pool round.
- **Y8 Developmental Format** (S8 p.84). The handbook requires it from 2025-26: "Fencers will compete in two rounds of pools with no direct elimination," in pools of 5 and 6. The engine runs one pool round and a DE, so Y8 events are planned with a DE.
