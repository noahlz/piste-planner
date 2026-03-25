# FENCING TOURNAMENT SCHEDULER
## Product Requirements Document & Algorithm Specification
### Version 6.0 | USA Fencing Regional & National Events
*For implementation in Cursor / Claude Code*

---

## PURPOSE & SCOPE

This document is the authoritative specification for the Fencing Tournament Scheduler — a planning tool for USA Fencing regional and national multi-day competitions. It is designed to be fed directly into an AI-assisted implementation environment as the primary engineering reference.

**Core Problem:** Given a set of fencing competitions selected from a fixed catalogue, a venue with a known number of strips (some video-capable), and a per-day referee roster, estimate start and end times for every competition phase across a multi-day tournament and flag anything that will cause problems.

This is a resource allocation and queuing estimation problem. The algorithm does not schedule individual bouts. It estimates phase durations based on weapon, fencer count, strip availability, and referee availability, then assigns competitions to time slots respecting demographic conflict constraints.

### What This System Is NOT
- Not a bout scheduler — individual bouts are not scheduled or tracked
- Not a seeding engine — DE bracket seeding is out of scope
- Not a real-time system — all outputs are pre-tournament estimates
- Not a free-form entry tool — competitions are selected from a fixed catalogue only
- Not a repechage system — modern NACs use simple single-elimination DE; repechage brackets are not modelled

### Tournament Profile

| Field | Value |
|---|---|
| Event type | USA Fencing regional and national competitions |
| Duration | 2 to 4 days (Summer Nationals support planned for a future version) |
| Day window | 8:00 AM start — 10:00 PM hard finish |
| Latest start | 4:00 PM — no competition may begin after this |
| Start granularity | 30-minute increments: 08:00, 08:30 … 16:00 |
| Valid start slots | 17 per day (08:00 through 16:00 inclusive) |
| Max fencers/event | 500 |
| Min fencers/event | 2 |

---

## 1. OVERALL PROCESS FLOW

```
PHASE 1 — CONFIGURATION (interactive)
  1a.  Select competitions from fixed catalogue
  1b.  Input fencer counts per competition (ESTIMATED or CAPPED)
  1c.  Input strip count + mark video-capable strips
  1d.  Input number of days
  1e.  Per competition: ref_policy, de_mode, de_video_policy,
       de_round_of_16_strips/requirement, de_finals_strips/requirement,
       cut_mode, cut_value
  1f.  Set pod captain override (optional — algorithm defaults apply,
       see Section 8.1 pod captain rules)
  1g.  Configure TOURNAMENT_CONFIG duration tables, gaps, thresholds
  1h.  PRE-VALIDATION → hard errors surfaced immediately
       (referee availability NOT required at this stage)
  1i.  INITIAL ANALYSIS → strip deficit warnings, concurrent pair suggestions,
       video strip peak demand warnings, cut summary, proximity warnings,
       gender equity cap validation (Pass 7, capped events only)
  1j.  Organiser reviews suggestions, enables flighting, confirms pairs
  1k.  Confirm final configuration

PHASE 1.5 — REFEREE CALCULATION (interactive)
  1.5a.  Engine calculates optimal refs needed per day, split by weapon type
         (foil/epee + sabre) — see calculate_optimal_refs() in Section 8.1
         Definition of "optimal": minimum refs to complete all events within
         the day window (8AM–10PM).
  1.5b.  Present to user: "You need X foil/epee refs and Y sabre refs on day N"
  1.5c.  Engine suggests sabre ref fill-in when sabre refs are short
         (replaces the former allow_sabre_ref_fillin tournament-level toggle)
  1.5d.  User enters ACTUAL referee availability per day
         (adjusts from optimal; split by foil/epee vs sabre)
  1.5e.  Engine re-runs analysis with actual refs, flags bottlenecks
  1.5f.  User can ACCEPT imperfect schedule with warnings
         (see accepted_warnings in SCHEDULE_RESULT, Section 2.8)

PHASE 2 — SCHEDULING (automated)
  2a.  schedule_all() runs
  2b.  SCHEDULE_RESULT produced per competition
  2c.  BOTTLENECK report produced
  2d.  Summary output presented

NOTE: initial_analysis() is stateless — re-runs on any config change.
NOTE: Configurations and results can be saved and reloaded (see Section 20).
```

---

## 2. ENUMERATIONS & CORE DATA TYPES

### 2.1 Enumerations

```
GENDER     = { MEN, WOMEN }
CATEGORY   = { Y8, Y10, Y12, Y14, CADET, JUNIOR, VETERAN, DIV1, DIV1A, DIV2, DIV3 }
WEAPON     = { FOIL, EPEE, SABRE }
EVENT_TYPE = { INDIVIDUAL, TEAM }

REF_POLICY = { ONE, TWO, AUTO }
  // ONE  = always 1 ref per pool (hard)
  // TWO  = always 2 refs per pool (hard; fallback to ONE with WARN)
  // AUTO = prefer 2 if available, fall back to 1 (default)
  //
  // Pod captain rule: see Section 8.1 for pod captain sizing algorithm.
  //   Pod captains manage DE table bouts and are removed from available
  //   referee count during DE phases. Pod size (4 or 8 strips) is
  //   determined algorithmically with user override (POD_CAPTAIN_OVERRIDE).

DE_MODE = { SINGLE_BLOCK, STAGED_DE_BLOCKS }
  // SINGLE_BLOCK    = strips allocated as a single block and progressively
  //                   released as the DE table advances (default)
  //                   Optional: designate a finals strip (see de_finals_strip_id)
  // STAGED_DE_BLOCKS = strips explicitly partitioned into three phases:
  //                   DE_PRELIMS → DE_ROUND_OF_16 → DE_FINALS, each with
  //                   its own strip count and release policy

DE_STRIP_REQUIREMENT = { HARD, IF_AVAILABLE }
  // HARD         = wait for required strip count before starting block
  // IF_AVAILABLE = use available strips, accept duration penalty if short

VIDEO_POLICY = { REQUIRED, BEST_EFFORT, FINALS_ONLY }
  // REQUIRED     = video strips must be used for DE_ROUND_OF_16, DE_FINALS,
  //                and bronze bout (TEAM); delay block start if unavailable
  // BEST_EFFORT  = use video strips when free, fall back to any strip (default)
  // FINALS_ONLY  = video strips required for DE_FINALS and bronze bout only;
  //                DE_ROUND_OF_16 treated as BEST_EFFORT
  // Note: DE_PRELIMS and SINGLE_BLOCK mode NEVER use video strips
  // Note: pool phases NEVER use video strips

VET_AGE_GROUP = { VET40, VET50, VET60, VET70, VET80, VET_COMBINED }
  // Only applicable when category == VETERAN
  // Determines default video replay thresholds (see DEFAULT_VIDEO_BY_CATEGORY)
  // Full veteran category expansion (separate CATEGORY values) deferred to v6
  // Age crossover rule: there is NO crossover between veteran age groups
  //   (e.g. VET40 and VET50 fencers do not cross over), EXCEPT VET_COMBINED
  //   which allows fencers from all veteran age groups to compete together
  //   and thus crosses over with all other VETERAN age groups.

FENCER_COUNT_TYPE = { ESTIMATED, CAPPED }
  // ESTIMATED = organiser's best guess (default)
  // CAPPED    = hard registration cap; triggers gender equity validation
  //             (see initial_analysis() Pass 7)

POD_CAPTAIN_OVERRIDE = { AUTO, DISABLED, FORCE_4 }
  // AUTO     = algorithmic: 4-strip pods if ≤32 fencers in SINGLE_BLOCK DE
  //            or during round-of-16 in STAGED_DE_BLOCKS; 8-strip pods otherwise
  // DISABLED = no pod captains removed from referee pool during DEs
  // FORCE_4  = always use 4-strip pods even when algorithm would use 8

CUT_MODE = { DISABLED, PERCENTAGE, COUNT }
  // DISABLED    = 100% of fencers promoted to DE (default for most categories)
  // PERCENTAGE  = promote top N% from pools (default value 20%)
  // COUNT       = promote exactly N fencers from pools

WEIGHT_SCALE: LIKELY=1.0  SOMETIMES=0.6  RARELY=0.3
```

### 2.2 STRIP

```
STRIP {
  id               // String: letter(s) + digit, e.g. "A1", "B3", "ZZ4"
                   // Letters: A–ZZ (single then double); digit: 1–4
  video_capable    // bool — organiser marks at setup; permanent venue equipment
}

// Derived at startup:
strips_total       = LENGTH(strips)
video_strips_total = COUNT(s WHERE s.video_capable == TRUE)

// Strip preference rules:
//   Pools, DE_PRELIMS, SINGLE_BLOCK DE:
//     Non-video strips preferred → video strips as fallback
//   DE_ROUND_OF_16 and DE_FINALS (VIDEO_POLICY == REQUIRED):
//     Video strips only; delay if unavailable (HARD) or use best available (IF_AVAILABLE)
//   DE_ROUND_OF_16 and DE_FINALS (VIDEO_POLICY == BEST_EFFORT):
//     Video strips preferred → any strip as fallback; never delays
//   Bronze bout:
//     Mirrors competition de_video_policy
//     Must be a DIFFERENT strip from gold bout
//     Runs SIMULTANEOUSLY with gold bout
//     Must use sabre-qualified ref on sabre strips regardless of fill-in setting
```

### 2.3 DAY_REFEREE_AVAILABILITY

```
DAY_REFEREE_AVAILABILITY {
  day               // 0-indexed
  foil_epee_refs    // count qualified for FOIL + EPEE only
  sabre_refs        // count qualified for SABRE (and FOIL + EPEE by rule)
  source            // OPTIMAL | ACTUAL
                    //   OPTIMAL = output of calculate_optimal_refs() (Phase 1.5a)
                    //   ACTUAL  = user-adjusted values (Phase 1.5d)
}

// Dual role (v6):
//   Phase 1.5a: Engine produces OPTIMAL entries via calculate_optimal_refs().
//   Phase 1.5d: User adjusts to ACTUAL availability. Engine re-runs analysis.
//   Phase 2:    Scheduling uses ACTUAL values (or OPTIMAL if user accepts as-is).
//
// Rest day rule: no enforcement by algorithm.
//   3-day tournaments: no rest day requirement.
//   4+ day tournaments: organiser reduces counts on rest days.
//
// Qualification rules:
//   Sabre-qualified refs → can do SABRE, FOIL, EPEE
//   Foil/epee refs       → can do FOIL and EPEE ONLY
//   Default: foil/epee refs NEVER assigned to sabre strips
//   Fill-in: when actual sabre refs < optimal, engine suggests foil/epee
//     fill-in during Phase 1.5c. If user accepts, fill-in is enabled
//     for the affected days — always WARN.
//   Bronze bout on sabre strip: MUST use sabre-qualified ref
//     fill-in rule does NOT apply to bronze bout regardless of setting
//
// Non-sabre strip priority: foil_epee refs first, sabre refs as fallback
// Sabre strip priority: sabre refs first, fill-in if accepted and insufficient

FUNCTION refs_available_on_day(day, weapon, config):
  avail = config.referee_availability[day]
  IF weapon == SABRE: RETURN avail.sabre_refs
  RETURN avail.foil_epee_refs + avail.sabre_refs
```

### 2.4 COMPETITION

```
COMPETITION {
  // Identity (from catalogue)
  id, gender, category, weapon, event_type

  // Organiser inputs
  fencer_count            // 2–500
  fencer_count_type       // FENCER_COUNT_TYPE: ESTIMATED (default) or CAPPED
                          // CAPPED triggers gender equity cap validation in initial_analysis()
  ref_policy              // REF_POLICY (default: AUTO)
  earliest_start          // minutes from T=0
  latest_end              // minutes from T=0
  optional                // bool (team events only)

  // Veteran age group (VETERAN category only)
  vet_age_group             // VET_AGE_GROUP enum: VET40, VET50, VET60, VET70, VET80, NULL
                            // NULL for non-veteran categories; determines video replay defaults

  // Pool configuration
  use_single_pool_override  // bool (default FALSE; valid only when fencer_count <= 10)

  // Pool cut configuration
  cut_mode                // CUT_MODE (default per category — see Section 6.4)
  cut_value               // float (percentage) or int (count); ignored if DISABLED
                          // minimum 2 promoted fencers always enforced

  // DE configuration
  de_mode                 // DE_MODE (default: SINGLE_BLOCK)
  de_video_policy         // VIDEO_POLICY (default: BEST_EFFORT)
                          // applies to DE_ROUND_OF_16, DE_FINALS, and bronze bout
                          // SINGLE_BLOCK and DE_PRELIMS always ignore this

  // Optional designated finals strip (all DE modes):
  de_finals_strip_id          // String or NULL: specific strip ID reserved for gold bout
                              //   e.g. "A1"; NULL = no designated strip (default)
  de_finals_strip_requirement // DE_STRIP_REQUIREMENT: only relevant if de_finals_strip_id set
                              //   HARD = delay finals until that strip is free
                              //   IF_AVAILABLE = use it if free, otherwise any strip

  // STAGED_DE_BLOCKS only:
  de_round_of_16_strips       // int (typically 4)
  de_round_of_16_requirement  // DE_STRIP_REQUIREMENT
  de_finals_strips            // int (typically 1)
  de_finals_requirement       // DE_STRIP_REQUIREMENT
  // Bronze bout (TEAM only): same video policy as competition,
  //   always IF_AVAILABLE for strip count (1 strip), simultaneous with gold,
  //   always requires sabre-qualified ref on sabre weapon (no fill-in)

  // Flighting & pairing (set during configuration phase)
  flighted                // bool (default: FALSE)
  concurrent_pair_id      // ID of paired competition (NULL if unpaired)
  is_priority             // bool
  strips_allocated        // strips assigned in a concurrent pair

  // HARD RULE: all phases (Flight A, Flight B, DE_PRELIMS, DE_ROUND_OF_16,
  // DE_FINALS, bronze) must complete on the same calendar day.
  // No phase may spill to the next day under any circumstance.
}
```

### 2.5 TOURNAMENT_CONFIG

```
TOURNAMENT_CONFIG {
  days_available
  strips[]                    // list of STRIP objects
  strips_total                // derived: LENGTH(strips)
  video_strips_total          // derived: COUNT(s WHERE s.video_capable)
  referee_availability[]      // DAY_REFEREE_AVAILABILITY per day
                              // NOT required during Phase 1 (config).
                              // Populated by calculate_optimal_refs() in Phase 1.5a,
                              // then adjusted by user in Phase 1.5d.
                              // Must be set before Phase 2 (scheduling).
  allow_sabre_ref_fillin      // bool (default: FALSE)
                              // v6: absorbed into Phase 1.5 flow. Engine suggests
                              // fill-in when actual sabre refs < optimal. If user
                              // accepts, this is set TRUE for affected days.

  // Pod captain configuration (v6)
  pod_captain_override        // POD_CAPTAIN_OVERRIDE enum (default: AUTO)
                              //   AUTO = algorithmic (see Section 8.1 pod captain rules)
                              //   DISABLED = no pod captains during DEs
                              //   FORCE_4 = always 4-strip pods (even when algorithm says 8)

  // Time constants
  DAY_START_MINS         = 480    // 8:00 AM
  DAY_END_MINS           = 1320   // 10:00 PM
  LATEST_START_MINS      = 960    // 4:00 PM wall-clock (minutes from midnight)
  LATEST_START_OFFSET    = 480    // derived: LATEST_START_MINS - DAY_START_MINS
                                  // use this in scheduling math, not LATEST_START_MINS
  SLOT_MINS              = 30
  DAY_LENGTH_MINS        = 840    // 14 hours
  ADMIN_GAP_MINS         = 15     // pool end → DE start (minimum)
                                  // maps to Ops Manual mandated result review period
                                  // (15 min national, 10 min regional)
  FLIGHT_BUFFER_MINS     = 15     // Flight A end → Flight B start (minimum)
  THRESHOLD_MINS         = 10     // delays below this not flagged
  DE_REFS                = 1      // DE always 1 ref per strip — hard rule
  DE_FINALS_MIN_MINS     = 30     // hard floor on DE_FINALS duration

  // Pool duration baseline = wall-clock for one full round on optimal strips
  // Anchored to 6-person pool (15 bouts); other sizes scale proportionally
  // Note: Ops Manual gives identical bout timing for foil and epee (6.5 min/bout).
  // The FOIL/EPEE differentiation below reflects empirical observation that epee
  // pools consistently run longer in practice (longer bouts, more priority calls).
  pool_round_duration_table = { EPEE:120, FOIL:90, SABRE:60 }

  // DE duration = total wall-clock first bout → medal (bracket of promoted fencers)
  de_duration_table = {
    FOIL:  { 2:15, 4:30, 8:45, 16:60, 32:90,  64:120, 128:180, 256:240 }
    EPEE:  { 2:15, 4:30, 8:45, 16:60, 32:90,  64:120, 128:180, 256:240 }
    SABRE: { 2:15, 4:20, 8:30, 16:45, 32:60,  64:90,  128:120, 256:120 }
    // All values organiser-configurable; suggested defaults shown
  }
}
```

### 2.6 CONCURRENT_PAIR

```
CONCURRENT_PAIR {
  priority_competition_id  // gets first pick of strips, runs uninterrupted
  flighted_competition_id  // flights around the priority event
  strips_for_priority      // strip count claimed by priority event
  strips_for_flighted      // strips_total - strips_for_priority
}

// Rules:
//   At most ONE flighted competition per day
//   Flighted competition should be the largest by pool count on that day
//   If two competitions tie on pool count, organiser must designate manually
//   Suggesting a non-largest competition as flighted → WARN in initial_analysis()
//   Priority competition always scheduled before its flighted partner
//   Any two competitions may be paired — demographic conflicts flagged but not blocked
```

### 2.7 GLOBAL_STATE

```
GLOBAL_STATE {
  strip_free_at[]          // array[strips_total] — absolute minute each strip is free
  refs_in_use_by_day = {
    day: {
      foil_epee_in_use: 0,
      sabre_in_use:     0,
      fillin_in_use:    0,   // foil/epee refs filling sabre slots
      release_events:   []   // sorted list of (time, type, count)
    }
  }
  schedule{}
  bottlenecks[]
}
```

### 2.8 SCHEDULE_RESULT

```
SCHEDULE_RESULT {
  competition_id, assigned_day
  use_flighting, is_priority, concurrent_pair_id

  // Pool phase — NOT flighted:
  pool_start, pool_end, pool_strips_count, pool_refs_count

  // Pool phase — flighted:
  flight_a_start, flight_a_end, flight_a_strips, flight_a_refs
  flight_b_start, flight_b_end, flight_b_strips, flight_b_refs
  // Note: flight_a and flight_b always on same calendar day

  // Cut / bracket
  entry_fencer_count      // total entries
  promoted_fencer_count   // after cut (= entry if DISABLED)
  bracket_size            // next_power_of_2(promoted_fencer_count)
  cut_mode, cut_value

  // DE phase
  de_mode, de_video_policy

  // SINGLE_BLOCK:
  de_start, de_end, de_strips_count

  // STAGED_DE_BLOCKS:
  de_prelims_start, de_prelims_end, de_prelims_strips     // NULL if bracket<=16
  de_round_of_16_start, de_round_of_16_end, de_round_of_16_strips
  de_finals_start, de_finals_end, de_finals_strips
  de_bronze_start, de_bronze_end, de_bronze_strip_id      // TEAM only
  de_total_end    // MAX(de_finals_end, de_bronze_end)
  // Note: all DE phases on same calendar day as pool phase

  // Diagnostics
  conflict_score
  pool_duration_baseline, pool_duration_actual
  de_duration_baseline, de_duration_actual
  sabre_fillin_used        // bool
  constraint_relaxation_level  // 0=none, 1=proximity, 2=soft crossover, 3=hard crossover

  // Accepted-with-warnings flags (set when user accepts imperfect schedule)
  accepted_warnings[]      // list of accepted soft constraint violations, if any:
    // { cause: BOTTLENECK cause code, severity: WARN/INFO, message: String }
    // Possible causes:
    //   GENDER_EQUITY_CAP_VIOLATION — USA Fencing guideline violation
    //   REFEREE_INSUFFICIENT_ACCEPTED — fewer refs than optimal for this event
    //   VIDEO_STRIP_CONTENTION — video not available for events that want it
    //   STRIP_CONTENTION — insufficient strips for some time slots
    //   Any other WARN-level bottleneck the user chose to accept
}
```

### 2.9 BOTTLENECK Cause Codes

```
STRIP_CONTENTION
REFEREE_CONTENTION
STRIP_AND_REFEREE_CONTENTION
SEQUENCING_CONSTRAINT
SAME_DAY_DEMOGRAPHIC_CONFLICT
UNAVOIDABLE_CROSSOVER_CONFLICT
SAME_TIME_CROSSOVER
SCHEDULED_8AM_SAME_DAY_CROSSOVER   // same-day 8AM high crossover
SCHEDULED_8AM_CONSECUTIVE_DAYS     // consecutive-day 8AM — critical
SCHEDULED_8AM_INDV_TEAM            // individual+team consecutive 8AM
INDIV_TEAM_ORDERING
DEADLINE_BREACH                   // rescheduled to earlier slot same day
DEADLINE_BREACH_UNRESOLVABLE      // cannot fit in day — hard fail
AUTO_REF_FALLBACK                 // INFO
TWO_REF_FALLBACK                  // WARN
FLIGHT_B_DELAYED
STRIP_DEFICIT_NO_FLIGHTING        // WARN
VIDEO_STRIP_CONTENTION
SABRE_REF_FILLIN                  // WARN
DE_FINALS_BRONZE_NO_STRIP         // WARN (REQUIRED) / INFO (BEST_EFFORT)
PROXIMITY_PREFERENCE_UNMET        // INFO
CONSTRAINT_RELAXED                // WARN — soft constraints relaxed to find day
CONCURRENT_PAIR_NOT_LARGEST       // WARN — flighted is not largest on day
CONCURRENT_PAIR_MANUAL_NEEDED     // WARN — tied pool counts, organiser must designate
GENDER_EQUITY_CAP_VIOLATION       // WARN — capped event pair violates allowable cap difference
REGIONAL_QUALIFIER_CAPPED         // ERROR — regional qualifier (RYC, RJCC, ROC, SYC, SJCC) cannot cap entries
REFEREE_INSUFFICIENT_ACCEPTED     // WARN — user accepted schedule with fewer refs than optimal
SCHEDULE_ACCEPTED_WITH_WARNINGS   // INFO — user accepted imperfect schedule
```

---

## 3. FIXED COMPETITION CATALOGUE

Competitions are selected from this fixed list only. 78 total competitions maximum.

- 60 individual events (10 categories × 3 weapons × 2 genders)
- 18 team events (Junior, Veteran, DIV1 × 3 weapons × 2 genders)

| Category | Individual | Team | ID Format |
|---|---|---|---|
| Y10 | ✓ | — | Y10-{G}-{W}-IND |
| Y12 | ✓ | — | Y12-{G}-{W}-IND |
| Y14 | ✓ | — | Y14-{G}-{W}-IND |
| CADET | ✓ | — | CDT-{G}-{W}-IND |
| JUNIOR | ✓ | ✓ | JR-{G}-{W}-{T} |
| VETERAN | ✓ | ✓ | VET-{G}-{W}-{T} |
| DIV1 | ✓ | ✓ | D1-{G}-{W}-{T} |
| DIV1A | ✓ | — | D1A-{G}-{W}-IND |
| DIV2 | ✓ | — | D2-{G}-{W}-IND |
| DIV3 | ✓ | — | D3-{G}-{W}-IND |

*{G} = M or W | {W} = FOIL, EPEE, or SABRE | {T} = IND or TEAM*

Rules: team events require matching individual; all competitions gender-specific; weapon is relevant to crossover penalties (see Section 4).

---

## 4. DEMOGRAPHIC CROSSOVER GRAPH & PENALTY MATRIX

### 4.1 Crossover Graph

```
CROSSOVER_GRAPH = {
  Y8     : { Y10:    1.0 },
  Y10    : { Y12:    1.0 },
  Y12    : { Y14:    1.0 },
  Y14    : { CADET:  1.0, DIV2: 1.0, DIV3: 1.0, DIV1A: 0.6 },
  CADET  : { JUNIOR: 1.0, DIV1: 1.0, DIV2: 1.0, DIV3:  1.0, DIV1A: 0.6 },
  JUNIOR : { DIV1:   1.0, DIV1A: 0.3 },
  VETERAN: { DIV1:   0.3, DIV2: 1.0, DIV3: 1.0, DIV1A: 1.0 },
  DIV3   : { DIV2:   1.0, DIV1A: 1.0 },
  DIV2   : { DIV1A:  1.0 },
  DIV1   : { DIV1A:  0.3 },
}
// Edges directed (younger→older) but penalties symmetric.
// Gender is hard filter — cross-gender penalty always 0.0.
// Weapon is now relevant — see crossover_penalty() below.

// Ops Manual Group 1 Mandatory: "For any one weapon, these pairs must not
// be held on the same day." Same-weapon = INFINITY. Cross-weapon = 0.0.
GROUP_1_MANDATORY = {
  (DIV1, JUNIOR), (DIV1, CADET), (JUNIOR, CADET),          // Div1/Junior/Cadet
  (Y8, Y10), (Y10, Y12), (Y12, Y14), (Y14, CADET),         // adjacent age groups
}

FUNCTION build_penalty_matrix(graph):
  matrix = {}
  FOR each A, neighbours in graph:
    FOR each B, w in neighbours:
      matrix[(A,B)] = w;  matrix[(B,A)] = w
  FOR each A in graph:
    FOR each B, w_AB in graph[A]:
      FOR each C, w_BC in graph[B]:
        IF C==A OR (A,C) in matrix: CONTINUE
        indirect = MIN(w_AB * w_BC, 0.3)
        matrix[(A,C)] = indirect;  matrix[(C,A)] = indirect
  RETURN matrix

PENALTY_MATRIX = build_penalty_matrix(CROSSOVER_GRAPH)  // built once at startup

FUNCTION crossover_penalty(c1, c2):
  // Same category + same gender + same weapon = absolute hard block
  IF c1.category==c2.category AND c1.gender==c2.gender AND c1.weapon==c2.weapon:
    RETURN INFINITY

  // Cross-gender = no conflict regardless of weapon
  IF c1.gender != c2.gender: RETURN 0.0

  // Same gender, different category — weapon matters for Group 1
  pair = (c1.category, c2.category)   // order-independent lookup
  base_penalty = PENALTY_MATRIX.get(pair, 0.0)
  IF base_penalty == 0.0: RETURN 0.0

  IF c1.weapon == c2.weapon:
    // Same weapon: Group 1 mandatory pairs become INFINITY
    IF pair IN GROUP_1_MANDATORY: RETURN INFINITY
    RETURN base_penalty
  ELSE:
    // Cross-weapon: no demographic crossover penalty
    // (fencers only conflict within the same weapon)
    RETURN 0.0
```

### 4.2 Complete Penalty Reference

All penalties require **same gender**. Cross-gender is always 0.0.

**Same-weapon pairs** use the weight shown. **Cross-weapon pairs** are always 0.0.

Group 1 Mandatory pairs (marked ★) are INFINITY when same-weapon, per Ops Manual.

| Pair (same gender) | Same-weapon | Cross-weapon | Type | Notes |
|---|---|---|---|---|
| Y8 ↔ Y10 | ∞ ★ | 0.0 | Group 1 | Adjacent age groups |
| Y10 ↔ Y12 | ∞ ★ | 0.0 | Group 1 | Adjacent age groups |
| Y12 ↔ Y14 | ∞ ★ | 0.0 | Group 1 | Adjacent age groups |
| Y14 ↔ CADET | ∞ ★ | 0.0 | Group 1 | Adjacent age groups |
| CADET ↔ JUNIOR | ∞ ★ | 0.0 | Group 1 | Div1/Junior/Cadet |
| JUNIOR ↔ DIV1 | ∞ ★ | 0.0 | Group 1 | Div1/Junior/Cadet |
| CADET ↔ DIV1 | ∞ ★ | 0.0 | Group 1 | Div1/Junior/Cadet |
| CADET ↔ DIV2 | 1.0 | 0.0 | Direct | Division crossover |
| CADET ↔ DIV3 | 1.0 | 0.0 | Direct | Division crossover |
| Y14 ↔ DIV2 | 1.0 | 0.0 | Direct | Division crossover |
| Y14 ↔ DIV3 | 1.0 | 0.0 | Direct | Division crossover |
| VET ↔ DIV2 | 1.0 | 0.0 | Direct | Division crossover |
| VET ↔ DIV3 | 1.0 | 0.0 | Direct | Division crossover |
| VET ↔ DIV1A | 1.0 | 0.0 | Direct | Division crossover |
| DIV3 ↔ DIV2 | 1.0 | 0.0 | Direct | Division crossover |
| DIV3 ↔ DIV1A | 1.0 | 0.0 | Direct | Division crossover |
| DIV2 ↔ DIV1A | 1.0 | 0.0 | Direct | Division crossover |
| Y14 ↔ DIV1A | 0.6 | 0.0 | Direct | Sometimes crossover |
| CADET ↔ DIV1A | 0.6 | 0.0 | Direct | Sometimes crossover |
| VET ↔ DIV1 | 0.3 | 0.0 | Direct | Rare crossover |
| JUNIOR ↔ DIV1A | 0.3 | 0.0 | Direct | Rare crossover |
| DIV1 ↔ DIV1A | 0.3 | 0.0 | Direct | Rare crossover |
| Y8 ↔ Y12 | 0.3 | 0.0 | Indirect | Via Y10 |
| Y10 ↔ Y14 | 0.3 | 0.0 | Indirect | Via Y12 |
| Y12 ↔ CADET | 0.3 | 0.0 | Indirect | Via Y14 |
| Y12 ↔ DIV2 | 0.3 | 0.0 | Indirect | Via Y14 |
| Y12 ↔ DIV3 | 0.3 | 0.0 | Indirect | Via Y14 |
| Y12 ↔ DIV1A | 0.3 | 0.0 | Indirect | Via Y14 |
| Y14 ↔ JUNIOR | 0.3 | 0.0 | Indirect | Via CADET |
| Y14 ↔ DIV1 | 0.3 | 0.0 | Indirect | Via CADET |

---

## 5. PENALTY WEIGHT SYSTEM

All day-assignment decisions are scored. Lowest total penalty wins. INFINITY hard-blocks a day.

| Weight | Pattern | Category | Description |
|---|---|---|---|
| ∞ | Same population same day (same weapon) | Hard block | Same category + gender + weapon — absolute block |
| ∞ | Group 1 mandatory same day (same weapon) | Hard block | Ops Manual Group 1 pairs (same weapon only) |
| 10.0 | Same-time high crossover | Time | Crossover ≥1.0, starts within 30 mins |
| 8.0 | Individual + Team same time | Time | Same category, starts within 30 mins |
| 5.0 | 8AM consecutive-day high crossover | 8AM Pattern B | CRITICAL: crossover ≥1.0, both 8AM consecutive days |
| 4.0 | Same-time low crossover | Time | Crossover =0.3, starts within 30 mins |
| 3.0 | Individual + Team insufficient gap | Ordering | Correct order but gap < 2 hours |
| 2.0 | 8AM same-day high crossover | 8AM Pattern A | Crossover ≥1.0, both 8AM same day |
| 2.0 | 8AM consecutive individual+team | 8AM Pattern C | Same category ind+team, both 8AM consecutive |
| 1.0 | High crossover same day | Crossover | Crossover =1.0, well separated |
| 0.6 | Sometimes-crossover same day | Crossover | Crossover =0.6 |
| 0.5 | Proximity 3+ day gap | Proximity | High-crossover pair too far apart |
| 0.3 | Low/indirect crossover same day | Crossover | Crossover =0.3 |
| 0.5 | All-ROW or all-epee day | Balance | No weapon type diversity on day (Ops Manual Group 2) |
| 0.5 | Large event on last day with ref shortage | Scheduling | 100+ fencers, last day, below-avg refs (Ops Manual Group 3) |
| 0.3 | Y10 not early-in-day | Scheduling | Y10 event not in first slot (Ops Manual Group 2) |
| 0.2 | Same age/sex different weapons same day | Group 3 | Per pair, low weight (Ops Manual Group 3, "if possible") |
| 0.0 | 2-day gap proximity | Proximity | Neutral |
| -0.4 | Consecutive-day proximity bonus | Proximity | Same gender+weapon, adjacent pair, day gap=1 |
| 1.5 | No rest day between JR↔CDT or JR↔D1 | Rest day | Same weapon, consecutive days, no gap day (Ops Manual Group 2) |

Notes:
- Pattern B (5.0) is below INFINITY so scheduler degrades gracefully when no better day exists
- Individual + Team (same weapon): normally on different days (INFINITY block). Ordering rules (individual first, 2h gap, 8.0 wrong order) are fallback for constraint relaxation level 3 only
- 8AM threshold: pool_start within 10 mins of day start counts as 8AM start
- Weapon is relevant: crossover penalties apply only to same-weapon pairs; Group 1 mandatory pairs are INFINITY same-weapon
- Flight B never subject to 8AM penalties — flights always on same day as Flight A

---

## 6. PROXIMITY PREFERENCE GRAPH

Proximity preferences are soft weights applied to day assignment scoring. They encourage related competitions to be scheduled on consecutive days for fencer convenience. They never override hard conflict resolution.

### 6.1 Proximity Graph

```
// All proximity pairs require same gender AND same weapon.
// Individual ↔ Team same category handled by ordering rule — not here.

PROXIMITY_GRAPH = [
  (DIV1,    JUNIOR,   weight: 1.0),  // strong — primary crossover population
  (JUNIOR,  CADET,    weight: 1.0),  // strong — primary crossover population
  (CADET,   Y14,      weight: 1.0),  // strong — primary crossover population
  (Y14,     Y12,      weight: 0.8),  // moderate — age ladder
  (Y12,     Y10,      weight: 0.8),  // moderate — age ladder
  (VETERAN, VETERAN,  weight: 1.0),  // all veteran events same gender+weapon cluster
  (VETERAN, DIV1A,    weight: 0.6),  // moderate — veterans likely in DIV1A
]

// Proximity is NOT transitive — only specific pairs above are scored.
// DIV1 ↔ CADET has no proximity bonus (not adjacent in graph).
```

### 6.2 Proximity Penalty Function

```
PROXIMITY_PENALTY_WEIGHTS = {
  day_gap == 0 : 0.0,   // same day — crossover penalties handle this
  day_gap == 1 : -0.4,  // consecutive — bonus (reduces total penalty)
  day_gap == 2 :  0.0,  // neutral
  day_gap >= 3 :  0.5,  // too far apart — soft penalty
}

FUNCTION proximity_penalty(competition, proposed_day, schedule):
  total = 0.0
  FOR each already-scheduled c2 in schedule:
    IF c2.gender != competition.gender: CONTINUE
    IF c2.weapon != competition.weapon: CONTINUE
    prox_weight = get_proximity_weight(competition.category, c2.category)
    IF prox_weight == 0.0: CONTINUE
    day_gap = ABS(proposed_day - schedule[c2].assigned_day)
    IF day_gap == 0: CONTINUE
    raw_penalty = PROXIMITY_PENALTY_WEIGHTS[MIN(day_gap, 3)] * prox_weight
    total += raw_penalty
  RETURN total

FUNCTION get_proximity_weight(cat1, cat2):
  IF cat1==VETERAN AND cat2==VETERAN: RETURN 1.0
  FOR each (a, b, w) in PROXIMITY_GRAPH:
    IF (cat1==a AND cat2==b) OR (cat1==b AND cat2==a): RETURN w
  RETURN 0.0
```

### 6.3 Individual + Team Consecutive Day Preference

```
// When individual and team events of the same category are on different days,
// prefer team the day AFTER individual (day_gap == 1, team_day > individual_day).

FUNCTION individual_team_proximity_penalty(competition, proposed_day, schedule):
  IF competition.event_type == TEAM:
    ind = find_individual_counterpart(competition, schedule)
    IF ind is scheduled:
      gap = proposed_day - schedule[ind].assigned_day
      IF gap == 1:  RETURN -0.4   // bonus — team day after individual
      IF gap == 0:  RETURN 0.0    // same day — ordering rule handles
      IF gap == -1: RETURN 1.0    // team before individual — discourage
      IF gap >= 2:  RETURN 0.3    // too far apart
  RETURN 0.0
```

---

## 7. POOL CONSTRUCTION & CUT

## 7.1 Valid Pool Compositions

Valid pool sizes: 5, 6, 7, 8, 9, and 10 (single pool override only).

Valid combinations:
- `n == 8` → 1 pool of 8 (default single pool)
- `n == 9` → 1 pool of 9 (default single pool)
- `n <= 10` → organiser may override to 1 pool of n (use_single_pool_override)
- All other counts → 6+7 mix preferred, 5+6 fallback
- 5+7 is NOT valid. 8 and 9 never appear in mixed combinations.

```
BOUT_COUNTS = { 5:10, 6:15, 7:21, 8:28, 9:36, 10:45 }

// Single pool override field on COMPETITION:
//   use_single_pool_override  // bool (default FALSE)
//                             // only valid when fencer_count <= 10
//                             // when TRUE: 1 pool of fencer_count

FUNCTION compute_pool_structure(competition):
  n = competition.fencer_count
  IF competition.use_single_pool_override AND n <= 10:
    RETURN { n_pools:1, pool_sizes:[n], pool_round_duration:pool_duration_for_size(weapon,n) }
  IF n NOT IN POOL_TABLE:
    RAISE ValidationError("No pool composition for {n} fencers")
  RETURN POOL_TABLE[n]
```

### POOL_TABLE — Complete Lookup (6–400 fencers)

| n | Pools | Composition | Single Pool Override |
|---|---|---|---|
| 6 | 1 | 1x6 | 1x6 (if enabled) |
| 7 | 1 | 1x7 | 1x7 (if enabled) |
| 8 | 1 | 1x8 | 1x8 (if enabled) |
| 9 | 1 | 1x9 | 1x9 (if enabled) |
| 10 | 2 | 2x5 | 1x10 (if enabled) |
| 11 | 2 | 1x6+1x5 | — |
| 12 | 2 | 2x6 | — |
| 13 | 2 | 1x7+1x6 | — |
| 14 | 2 | 2x7 | — |
| 15 | 3 | 3x5 | — |
| 16 | 3 | 1x6+2x5 | — |
| 17 | 3 | 2x6+1x5 | — |
| 18 | 3 | 3x6 | — |
| 19 | 3 | 1x7+2x6 | — |
| 20 | 3 | 2x7+1x6 | — |
| 21 | 3 | 3x7 | — |
| 22 | 4 | 2x6+2x5 | — |
| 23 | 4 | 3x6+1x5 | — |
| 24 | 4 | 4x6 | — |
| 25 | 4 | 1x7+3x6 | — |
| 26 | 4 | 2x7+2x6 | — |
| 27 | 4 | 3x7+1x6 | — |
| 28 | 4 | 4x7 | — |
| 29 | 5 | 4x6+1x5 | — |
| 30 | 5 | 5x6 | — |
| 31 | 5 | 1x7+4x6 | — |
| 32 | 5 | 2x7+3x6 | — |
| 33 | 5 | 3x7+2x6 | — |
| 34 | 5 | 4x7+1x6 | — |
| 35 | 5 | 5x7 | — |
| 36 | 6 | 6x6 | — |
| 37 | 6 | 1x7+5x6 | — |
| 38 | 6 | 2x7+4x6 | — |
| 39 | 6 | 3x7+3x6 | — |
| 40 | 6 | 4x7+2x6 | — |
| 41 | 6 | 5x7+1x6 | — |
| 42 | 6 | 6x7 | — |
| 43 | 7 | 1x7+6x6 | — |
| 44 | 7 | 2x7+5x6 | — |
| 45 | 7 | 3x7+4x6 | — |
| 46 | 7 | 4x7+3x6 | — |
| 47 | 7 | 5x7+2x6 | — |
| 48 | 7 | 6x7+1x6 | — |
| 49 | 7 | 7x7 | — |
| 50 | 8 | 2x7+6x6 | — |
| 51 | 8 | 3x7+5x6 | — |
| 52 | 8 | 4x7+4x6 | — |
| 53 | 8 | 5x7+3x6 | — |
| 54 | 8 | 6x7+2x6 | — |
| 55 | 8 | 7x7+1x6 | — |
| 56 | 8 | 8x7 | — |
| 57 | 9 | 3x7+6x6 | — |
| 58 | 9 | 4x7+5x6 | — |
| 59 | 9 | 5x7+4x6 | — |
| 60 | 9 | 6x7+3x6 | — |
| 61 | 9 | 7x7+2x6 | — |
| 62 | 9 | 8x7+1x6 | — |
| 63 | 9 | 9x7 | — |
| 64 | 10 | 4x7+6x6 | — |
| 65 | 10 | 5x7+5x6 | — |
| 66 | 10 | 6x7+4x6 | — |
| 67 | 10 | 7x7+3x6 | — |
| 68 | 10 | 8x7+2x6 | — |
| 69 | 10 | 9x7+1x6 | — |
| 70 | 10 | 10x7 | — |
| 71 | 11 | 5x7+6x6 | — |
| 72 | 11 | 6x7+5x6 | — |
| 73 | 11 | 7x7+4x6 | — |
| 74 | 11 | 8x7+3x6 | — |
| 75 | 11 | 9x7+2x6 | — |
| 76 | 11 | 10x7+1x6 | — |
| 77 | 11 | 11x7 | — |
| 78 | 12 | 6x7+6x6 | — |
| 79 | 12 | 7x7+5x6 | — |
| 80 | 12 | 8x7+4x6 | — |
| 81 | 12 | 9x7+3x6 | — |
| 82 | 12 | 10x7+2x6 | — |
| 83 | 12 | 11x7+1x6 | — |
| 84 | 12 | 12x7 | — |
| 85 | 13 | 7x7+6x6 | — |
| 86 | 13 | 8x7+5x6 | — |
| 87 | 13 | 9x7+4x6 | — |
| 88 | 13 | 10x7+3x6 | — |
| 89 | 13 | 11x7+2x6 | — |
| 90 | 13 | 12x7+1x6 | — |
| 91 | 13 | 13x7 | — |
| 92 | 14 | 8x7+6x6 | — |
| 93 | 14 | 9x7+5x6 | — |
| 94 | 14 | 10x7+4x6 | — |
| 95 | 14 | 11x7+3x6 | — |
| 96 | 14 | 12x7+2x6 | — |
| 97 | 14 | 13x7+1x6 | — |
| 98 | 14 | 14x7 | — |
| 99 | 15 | 9x7+6x6 | — |
| 100 | 15 | 10x7+5x6 | — |
| 101 | 15 | 11x7+4x6 | — |
| 102 | 15 | 12x7+3x6 | — |
| 103 | 15 | 13x7+2x6 | — |
| 104 | 15 | 14x7+1x6 | — |
| 105 | 15 | 15x7 | — |
| 106 | 16 | 10x7+6x6 | — |
| 107 | 16 | 11x7+5x6 | — |
| 108 | 16 | 12x7+4x6 | — |
| 109 | 16 | 13x7+3x6 | — |
| 110 | 16 | 14x7+2x6 | — |
| 111 | 16 | 15x7+1x6 | — |
| 112 | 16 | 16x7 | — |
| 113 | 17 | 11x7+6x6 | — |
| 114 | 17 | 12x7+5x6 | — |
| 115 | 17 | 13x7+4x6 | — |
| 116 | 17 | 14x7+3x6 | — |
| 117 | 17 | 15x7+2x6 | — |
| 118 | 17 | 16x7+1x6 | — |
| 119 | 17 | 17x7 | — |
| 120 | 18 | 12x7+6x6 | — |
| 121 | 18 | 13x7+5x6 | — |
| 122 | 18 | 14x7+4x6 | — |
| 123 | 18 | 15x7+3x6 | — |
| 124 | 18 | 16x7+2x6 | — |
| 125 | 18 | 17x7+1x6 | — |
| 126 | 18 | 18x7 | — |
| 127 | 19 | 13x7+6x6 | — |
| 128 | 19 | 14x7+5x6 | — |
| 129 | 19 | 15x7+4x6 | — |
| 130 | 19 | 16x7+3x6 | — |
| 131 | 19 | 17x7+2x6 | — |
| 132 | 19 | 18x7+1x6 | — |
| 133 | 19 | 19x7 | — |
| 134 | 20 | 14x7+6x6 | — |
| 135 | 20 | 15x7+5x6 | — |
| 136 | 20 | 16x7+4x6 | — |
| 137 | 20 | 17x7+3x6 | — |
| 138 | 20 | 18x7+2x6 | — |
| 139 | 20 | 19x7+1x6 | — |
| 140 | 20 | 20x7 | — |
| 141 | 21 | 15x7+6x6 | — |
| 142 | 21 | 16x7+5x6 | — |
| 143 | 21 | 17x7+4x6 | — |
| 144 | 21 | 18x7+3x6 | — |
| 145 | 21 | 19x7+2x6 | — |
| 146 | 21 | 20x7+1x6 | — |
| 147 | 21 | 21x7 | — |
| 148 | 22 | 16x7+6x6 | — |
| 149 | 22 | 17x7+5x6 | — |
| 150 | 22 | 18x7+4x6 | — |
| 151 | 22 | 19x7+3x6 | — |
| 152 | 22 | 20x7+2x6 | — |
| 153 | 22 | 21x7+1x6 | — |
| 154 | 22 | 22x7 | — |
| 155 | 23 | 17x7+6x6 | — |
| 156 | 23 | 18x7+5x6 | — |
| 157 | 23 | 19x7+4x6 | — |
| 158 | 23 | 20x7+3x6 | — |
| 159 | 23 | 21x7+2x6 | — |
| 160 | 23 | 22x7+1x6 | — |
| 161 | 23 | 23x7 | — |
| 162 | 24 | 18x7+6x6 | — |
| 163 | 24 | 19x7+5x6 | — |
| 164 | 24 | 20x7+4x6 | — |
| 165 | 24 | 21x7+3x6 | — |
| 166 | 24 | 22x7+2x6 | — |
| 167 | 24 | 23x7+1x6 | — |
| 168 | 24 | 24x7 | — |
| 169 | 25 | 19x7+6x6 | — |
| 170 | 25 | 20x7+5x6 | — |
| 171 | 25 | 21x7+4x6 | — |
| 172 | 25 | 22x7+3x6 | — |
| 173 | 25 | 23x7+2x6 | — |
| 174 | 25 | 24x7+1x6 | — |
| 175 | 25 | 25x7 | — |
| 176 | 26 | 20x7+6x6 | — |
| 177 | 26 | 21x7+5x6 | — |
| 178 | 26 | 22x7+4x6 | — |
| 179 | 26 | 23x7+3x6 | — |
| 180 | 26 | 24x7+2x6 | — |
| 181 | 26 | 25x7+1x6 | — |
| 182 | 26 | 26x7 | — |
| 183 | 27 | 21x7+6x6 | — |
| 184 | 27 | 22x7+5x6 | — |
| 185 | 27 | 23x7+4x6 | — |
| 186 | 27 | 24x7+3x6 | — |
| 187 | 27 | 25x7+2x6 | — |
| 188 | 27 | 26x7+1x6 | — |
| 189 | 27 | 27x7 | — |
| 190 | 28 | 22x7+6x6 | — |
| 191 | 28 | 23x7+5x6 | — |
| 192 | 28 | 24x7+4x6 | — |
| 193 | 28 | 25x7+3x6 | — |
| 194 | 28 | 26x7+2x6 | — |
| 195 | 28 | 27x7+1x6 | — |
| 196 | 28 | 28x7 | — |
| 197 | 29 | 23x7+6x6 | — |
| 198 | 29 | 24x7+5x6 | — |
| 199 | 29 | 25x7+4x6 | — |
| 200 | 29 | 26x7+3x6 | — |
| 201 | 29 | 27x7+2x6 | — |
| 202 | 29 | 28x7+1x6 | — |
| 203 | 29 | 29x7 | — |
| 204 | 30 | 24x7+6x6 | — |
| 205 | 30 | 25x7+5x6 | — |
| 206 | 30 | 26x7+4x6 | — |
| 207 | 30 | 27x7+3x6 | — |
| 208 | 30 | 28x7+2x6 | — |
| 209 | 30 | 29x7+1x6 | — |
| 210 | 30 | 30x7 | — |
| 211 | 31 | 25x7+6x6 | — |
| 212 | 31 | 26x7+5x6 | — |
| 213 | 31 | 27x7+4x6 | — |
| 214 | 31 | 28x7+3x6 | — |
| 215 | 31 | 29x7+2x6 | — |
| 216 | 31 | 30x7+1x6 | — |
| 217 | 31 | 31x7 | — |
| 218 | 32 | 26x7+6x6 | — |
| 219 | 32 | 27x7+5x6 | — |
| 220 | 32 | 28x7+4x6 | — |
| 221 | 32 | 29x7+3x6 | — |
| 222 | 32 | 30x7+2x6 | — |
| 223 | 32 | 31x7+1x6 | — |
| 224 | 32 | 32x7 | — |
| 225 | 33 | 27x7+6x6 | — |
| 226 | 33 | 28x7+5x6 | — |
| 227 | 33 | 29x7+4x6 | — |
| 228 | 33 | 30x7+3x6 | — |
| 229 | 33 | 31x7+2x6 | — |
| 230 | 33 | 32x7+1x6 | — |
| 231 | 33 | 33x7 | — |
| 232 | 34 | 28x7+6x6 | — |
| 233 | 34 | 29x7+5x6 | — |
| 234 | 34 | 30x7+4x6 | — |
| 235 | 34 | 31x7+3x6 | — |
| 236 | 34 | 32x7+2x6 | — |
| 237 | 34 | 33x7+1x6 | — |
| 238 | 34 | 34x7 | — |
| 239 | 35 | 29x7+6x6 | — |
| 240 | 35 | 30x7+5x6 | — |
| 241 | 35 | 31x7+4x6 | — |
| 242 | 35 | 32x7+3x6 | — |
| 243 | 35 | 33x7+2x6 | — |
| 244 | 35 | 34x7+1x6 | — |
| 245 | 35 | 35x7 | — |
| 246 | 36 | 30x7+6x6 | — |
| 247 | 36 | 31x7+5x6 | — |
| 248 | 36 | 32x7+4x6 | — |
| 249 | 36 | 33x7+3x6 | — |
| 250 | 36 | 34x7+2x6 | — |
| 251 | 36 | 35x7+1x6 | — |
| 252 | 36 | 36x7 | — |
| 253 | 37 | 31x7+6x6 | — |
| 254 | 37 | 32x7+5x6 | — |
| 255 | 37 | 33x7+4x6 | — |
| 256 | 37 | 34x7+3x6 | — |
| 257 | 37 | 35x7+2x6 | — |
| 258 | 37 | 36x7+1x6 | — |
| 259 | 37 | 37x7 | — |
| 260 | 38 | 32x7+6x6 | — |
| 261 | 38 | 33x7+5x6 | — |
| 262 | 38 | 34x7+4x6 | — |
| 263 | 38 | 35x7+3x6 | — |
| 264 | 38 | 36x7+2x6 | — |
| 265 | 38 | 37x7+1x6 | — |
| 266 | 38 | 38x7 | — |
| 267 | 39 | 33x7+6x6 | — |
| 268 | 39 | 34x7+5x6 | — |
| 269 | 39 | 35x7+4x6 | — |
| 270 | 39 | 36x7+3x6 | — |
| 271 | 39 | 37x7+2x6 | — |
| 272 | 39 | 38x7+1x6 | — |
| 273 | 39 | 39x7 | — |
| 274 | 40 | 34x7+6x6 | — |
| 275 | 40 | 35x7+5x6 | — |
| 276 | 40 | 36x7+4x6 | — |
| 277 | 40 | 37x7+3x6 | — |
| 278 | 40 | 38x7+2x6 | — |
| 279 | 40 | 39x7+1x6 | — |
| 280 | 40 | 40x7 | — |
| 281 | 41 | 35x7+6x6 | — |
| 282 | 41 | 36x7+5x6 | — |
| 283 | 41 | 37x7+4x6 | — |
| 284 | 41 | 38x7+3x6 | — |
| 285 | 41 | 39x7+2x6 | — |
| 286 | 41 | 40x7+1x6 | — |
| 287 | 41 | 41x7 | — |
| 288 | 42 | 36x7+6x6 | — |
| 289 | 42 | 37x7+5x6 | — |
| 290 | 42 | 38x7+4x6 | — |
| 291 | 42 | 39x7+3x6 | — |
| 292 | 42 | 40x7+2x6 | — |
| 293 | 42 | 41x7+1x6 | — |
| 294 | 42 | 42x7 | — |
| 295 | 43 | 37x7+6x6 | — |
| 296 | 43 | 38x7+5x6 | — |
| 297 | 43 | 39x7+4x6 | — |
| 298 | 43 | 40x7+3x6 | — |
| 299 | 43 | 41x7+2x6 | — |
| 300 | 43 | 42x7+1x6 | — |
| 301 | 43 | 43x7 | — |
| 302 | 44 | 38x7+6x6 | — |
| 303 | 44 | 39x7+5x6 | — |
| 304 | 44 | 40x7+4x6 | — |
| 305 | 44 | 41x7+3x6 | — |
| 306 | 44 | 42x7+2x6 | — |
| 307 | 44 | 43x7+1x6 | — |
| 308 | 44 | 44x7 | — |
| 309 | 45 | 39x7+6x6 | — |
| 310 | 45 | 40x7+5x6 | — |
| 311 | 45 | 41x7+4x6 | — |
| 312 | 45 | 42x7+3x6 | — |
| 313 | 45 | 43x7+2x6 | — |
| 314 | 45 | 44x7+1x6 | — |
| 315 | 45 | 45x7 | — |
| 316 | 46 | 40x7+6x6 | — |
| 317 | 46 | 41x7+5x6 | — |
| 318 | 46 | 42x7+4x6 | — |
| 319 | 46 | 43x7+3x6 | — |
| 320 | 46 | 44x7+2x6 | — |
| 321 | 46 | 45x7+1x6 | — |
| 322 | 46 | 46x7 | — |
| 323 | 47 | 41x7+6x6 | — |
| 324 | 47 | 42x7+5x6 | — |
| 325 | 47 | 43x7+4x6 | — |
| 326 | 47 | 44x7+3x6 | — |
| 327 | 47 | 45x7+2x6 | — |
| 328 | 47 | 46x7+1x6 | — |
| 329 | 47 | 47x7 | — |
| 330 | 48 | 42x7+6x6 | — |
| 331 | 48 | 43x7+5x6 | — |
| 332 | 48 | 44x7+4x6 | — |
| 333 | 48 | 45x7+3x6 | — |
| 334 | 48 | 46x7+2x6 | — |
| 335 | 48 | 47x7+1x6 | — |
| 336 | 48 | 48x7 | — |
| 337 | 49 | 43x7+6x6 | — |
| 338 | 49 | 44x7+5x6 | — |
| 339 | 49 | 45x7+4x6 | — |
| 340 | 49 | 46x7+3x6 | — |
| 341 | 49 | 47x7+2x6 | — |
| 342 | 49 | 48x7+1x6 | — |
| 343 | 49 | 49x7 | — |
| 344 | 50 | 44x7+6x6 | — |
| 345 | 50 | 45x7+5x6 | — |
| 346 | 50 | 46x7+4x6 | — |
| 347 | 50 | 47x7+3x6 | — |
| 348 | 50 | 48x7+2x6 | — |
| 349 | 50 | 49x7+1x6 | — |
| 350 | 50 | 50x7 | — |
| 351 | 51 | 45x7+6x6 | — |
| 352 | 51 | 46x7+5x6 | — |
| 353 | 51 | 47x7+4x6 | — |
| 354 | 51 | 48x7+3x6 | — |
| 355 | 51 | 49x7+2x6 | — |
| 356 | 51 | 50x7+1x6 | — |
| 357 | 51 | 51x7 | — |
| 358 | 52 | 46x7+6x6 | — |
| 359 | 52 | 47x7+5x6 | — |
| 360 | 52 | 48x7+4x6 | — |
| 361 | 52 | 49x7+3x6 | — |
| 362 | 52 | 50x7+2x6 | — |
| 363 | 52 | 51x7+1x6 | — |
| 364 | 52 | 52x7 | — |
| 365 | 53 | 47x7+6x6 | — |
| 366 | 53 | 48x7+5x6 | — |
| 367 | 53 | 49x7+4x6 | — |
| 368 | 53 | 50x7+3x6 | — |
| 369 | 53 | 51x7+2x6 | — |
| 370 | 53 | 52x7+1x6 | — |
| 371 | 53 | 53x7 | — |
| 372 | 54 | 48x7+6x6 | — |
| 373 | 54 | 49x7+5x6 | — |
| 374 | 54 | 50x7+4x6 | — |
| 375 | 54 | 51x7+3x6 | — |
| 376 | 54 | 52x7+2x6 | — |
| 377 | 54 | 53x7+1x6 | — |
| 378 | 54 | 54x7 | — |
| 379 | 55 | 49x7+6x6 | — |
| 380 | 55 | 50x7+5x6 | — |
| 381 | 55 | 51x7+4x6 | — |
| 382 | 55 | 52x7+3x6 | — |
| 383 | 55 | 53x7+2x6 | — |
| 384 | 55 | 54x7+1x6 | — |
| 385 | 55 | 55x7 | — |
| 386 | 56 | 50x7+6x6 | — |
| 387 | 56 | 51x7+5x6 | — |
| 388 | 56 | 52x7+4x6 | — |
| 389 | 56 | 53x7+3x6 | — |
| 390 | 56 | 54x7+2x6 | — |
| 391 | 56 | 55x7+1x6 | — |
| 392 | 56 | 56x7 | — |
| 393 | 57 | 51x7+6x6 | — |
| 394 | 57 | 52x7+5x6 | — |
| 395 | 57 | 53x7+4x6 | — |
| 396 | 57 | 54x7+3x6 | — |
| 397 | 57 | 55x7+2x6 | — |
| 398 | 57 | 56x7+1x6 | — |
| 399 | 57 | 57x7 | — |
| 400 | 58 | 52x7+6x6 | — |

### 7.2 Pool Duration Estimation

```
// Baseline = wall-clock for one full round on optimal strips.
// Optimal  = 1 strip per pool, all pools simultaneously.
// Anchored to 6-person pool (15 bouts). Other sizes scale proportionally.

FUNCTION pool_duration_for_size(weapon, pool_size, config):
  base  = config.pool_round_duration_table[weapon]
  RETURN ROUND(base * BOUT_COUNTS[pool_size] / 15)

// Examples (EPEE baseline 120 mins):
//   5-person:  80 mins   6-person: 120 mins   7-person: 168 mins
//   8-person: 224 mins   9-person: 288 mins

// Mixed pools — weighted average per round:
FUNCTION weighted_pool_duration(pool_structure, weapon, config):
  total_time=0; total_pools=0
  FOR each (pool_size, count) in pool_structure:
    total_time  += count * pool_duration_for_size(weapon, pool_size, config)
    total_pools += count
  RETURN ROUND(total_time / total_pools)

// For flight planning: use weighted average for all pools.
// Do NOT split large and small pools across flights differently.
```

### 7.3 Pool Duration Adjustment for Resource Shortfalls

```
FUNCTION estimate_pool_duration(competition, pool_structure,
                                  available_strips, available_refs, ref_resolution):
  n_pools       = pool_structure.n_pools
  baseline      = weighted_pool_duration(pool_structure, competition.weapon, config)
  refs_per_pool = ref_resolution.refs_per_pool

  optimal_strips   = n_pools
  effective_strips = MIN(available_strips, optimal_strips)
  ref_limited      = FLOOR(available_refs / refs_per_pool)
  staffable_strips = MIN(effective_strips, ref_limited)

  // Referee double-duty compensation — only when refs_per_pool == 1
  // (One referee covers two strips. Distinct from Ops Manual "double stripping",
  //  which means running one pool across two physical strips simultaneously.)
  IF refs_per_pool == 1:
    excess_refs        = MAX(available_refs - staffable_strips, 0)
    double_duty_pairs  = MIN(excess_refs, optimal_strips - staffable_strips)
  ELSE:
    double_duty_pairs  = 0

  effective_parallelism = staffable_strips + double_duty_pairs
  uncompensated         = MAX(optimal_strips - effective_parallelism, 0)

  IF uncompensated == 0: actual = baseline
  ELSE:
    batches = CEIL(n_pools / effective_parallelism)
    actual  = CEIL(baseline * batches)

  RETURN { actual_duration:actual, baseline, effective_parallelism,
           double_duty_pairs, uncompensated, penalised:uncompensated>0 }
```

### 7.4 Pool Cut — Promoted Fencer Count

```
// Cut determines how many fencers advance from pools to DE.
// Applied ONLY after pools complete — no mid-DE cuts.
// Team events: cuts NEVER apply.
// Minimum 2 promoted fencers always enforced regardless of cut settings.

DEFAULT_CUT_BY_CATEGORY = {
  DIV1:    { cut_mode: PERCENTAGE, cut_value: 20 },
  DIV1A:   { cut_mode: DISABLED },
  DIV2:    { cut_mode: DISABLED },
  DIV3:    { cut_mode: DISABLED },
  JUNIOR:  { cut_mode: PERCENTAGE, cut_value: 20 },
  CADET:   { cut_mode: PERCENTAGE, cut_value: 20 },
  Y14:     { cut_mode: PERCENTAGE, cut_value: 20 },
  Y12:     { cut_mode: DISABLED },
  Y10:     { cut_mode: DISABLED },
  VETERAN: { cut_mode: DISABLED },
  TEAM:    { cut_mode: DISABLED },   // always — never overridable
}

FUNCTION compute_de_fencer_count(competition):
  IF competition.event_type == TEAM: RETURN competition.fencer_count
  MATCH competition.cut_mode:
    CASE DISABLED:    RETURN competition.fencer_count
    CASE PERCENTAGE:  RETURN MAX(ROUND(competition.fencer_count * cut_value/100), 2)
    CASE COUNT:       RETURN MAX(MIN(cut_value, competition.fencer_count), 2)

// bracket_size = next_power_of_2(compute_de_fencer_count(competition))
// NOT next_power_of_2(entry fencer_count)
```

### 7.5 Referee Policy Resolution

```
FUNCTION resolve_refs_per_pool(competition, available_refs, n_pools):
  MATCH competition.ref_policy:
    CASE ONE:
      shortfall = MAX(n_pools - available_refs, 0)
      IF shortfall > 0: append BOTTLENECK(REFEREE_CONTENTION, ERROR)
      RETURN { refs_per_pool:1, refs_needed:n_pools, shortfall }
    CASE TWO:
      shortfall = MAX(n_pools*2 - available_refs, 0)
      IF shortfall > 0:
        append BOTTLENECK(TWO_REF_FALLBACK, WARN)
        RETURN { refs_per_pool:1, refs_needed:n_pools, shortfall }
      RETURN { refs_per_pool:2, refs_needed:n_pools*2, shortfall:0 }
    CASE AUTO:
      IF available_refs >= n_pools*2:
        RETURN { refs_per_pool:2, refs_needed:n_pools*2, shortfall:0 }
      ELSE IF available_refs >= n_pools:
        append BOTTLENECK(AUTO_REF_FALLBACK, INFO)
        RETURN { refs_per_pool:1, refs_needed:n_pools, shortfall:0 }
      ELSE:
        append BOTTLENECK(REFEREE_CONTENTION, ERROR)
        RETURN { refs_per_pool:1, refs_needed:n_pools, shortfall:n_pools-available_refs }
```

---

## 8. REFEREE ALLOCATION

### 8.1 Optimal Referee Calculation & Pod Captain Rules (v6)

```
// Pod captain rules:
//   During DE phases, one referee per pod serves as "pod captain" (manages
//   DE table bouts) and is not available for pool reffing.
//
//   Pod size determination (when pod_captain_override == AUTO):
//     - SINGLE_BLOCK DE with ≤32 fencers in bracket: 4-strip pods
//     - STAGED_DE_BLOCKS round-of-16 phase: 4-strip pods
//     - All other DE phases: 8-strip pods
//   Pod captain count = CEIL(de_strips / pod_size)
//
//   Overrides (pod_captain_override):
//     DISABLED → pod_captains = 0
//     FORCE_4  → always use pod_size = 4

FUNCTION pod_captains_needed(competition, de_phase, de_strips, config):
  IF config.pod_captain_override == DISABLED: RETURN 0
  IF config.pod_captain_override == FORCE_4:
    RETURN CEIL(de_strips / 4)

  // AUTO mode
  IF competition.de_mode == SINGLE_BLOCK:
    bracket = compute_bracket_size(competition)
    pod_size = IF bracket <= 32 THEN 4 ELSE 8
  ELSE:  // STAGED_DE_BLOCKS
    IF de_phase == DE_ROUND_OF_16:
      pod_size = 4
    ELSE:
      pod_size = 8
  RETURN CEIL(de_strips / pod_size)

// Calculate optimal referee counts per day.
// "Optimal" = minimum refs to complete all events within the day window.
// This function is called in Phase 1.5a, before the user provides actual
// referee availability. It uses the preliminary day assignments from
// initial_analysis() to estimate which events land on which day.
//
// For each day, sums the peak concurrent referee demand across all events
// assigned to that day, accounting for pool refs, DE refs, and pod captains.

FUNCTION calculate_optimal_refs(competitions[], config):
  // Preliminary day assignment (greedy, using penalty scoring from Section 12)
  day_assignments = preliminary_day_assign(competitions, config)

  optimal = []
  FOR each day d in 0..config.days_available-1:
    day_comps = [c FOR c IN competitions WHERE day_assignments[c.id] == d]

    // Estimate peak concurrent demand by simulating the schedule
    // without referee constraints (infinite refs available)
    simulated = simulate_day_schedule(day_comps, config, infinite_refs=TRUE)

    // Peak demand per time slot
    peak_foil_epee = 0; peak_sabre = 0
    FOR each time_slot in simulated.slots:
      fe_demand = 0; s_demand = 0
      FOR each active_phase in time_slot.active_phases:
        c = active_phase.competition
        refs = active_phase.refs_needed
        IF active_phase.is_de:
          refs += pod_captains_needed(c, active_phase.de_phase,
                                      active_phase.strips, config)
        IF c.weapon == SABRE:
          s_demand += refs
        ELSE:
          fe_demand += refs
      peak_foil_epee = MAX(peak_foil_epee, fe_demand)
      peak_sabre = MAX(peak_sabre, s_demand)

    optimal.APPEND(DAY_REFEREE_AVAILABILITY {
      day: d, foil_epee_refs: peak_foil_epee,
      sabre_refs: peak_sabre, source: OPTIMAL })

  RETURN optimal
```

### 8.2 Sabre Referee Fill-In

```
FUNCTION allocate_refs_for_sabre(refs_needed, start, end, day, state, config):
  sabre_free = sabre_refs_free_at(day, start, state)

  IF sabre_free >= refs_needed:
    append release_event(end, SABRE, refs_needed)
    RETURN OK

  sabre_shortfall = refs_needed - sabre_free

  IF config.allow_sabre_ref_fillin:
    fe_free = fe_refs_free_at(day, start, state)
    IF sabre_free + fe_free >= refs_needed:
      IF sabre_free > 0: append release_event(end, SABRE, sabre_free)
      append release_event(end, FILLIN, sabre_shortfall)
      append BOTTLENECK(SABRE_REF_FILLIN, WARN,
        "{sabre_shortfall} foil/epee ref(s) filling sabre strips.")
      RETURN OK
    ELSE:
      RETURN INSUFFICIENT
  ELSE:
    RETURN INSUFFICIENT

// Fill-in applies to pool phase and DE blocks.
// Fill-in does NOT apply to bronze bout — sabre bronze requires sabre-qualified ref.
// Fill-in refs tracked separately (fillin_in_use) to accurately report sabre availability.
```

---

## 9. FLIGHTING & CONCURRENT PAIRS

### 9.1 Initial Analysis

```
FUNCTION initial_analysis(competitions[], config):
  warnings=[]; suggestions=[]

  // Pass 1 — strip deficit → flighting suggestions
  FOR each competition c:
    ps = compute_pool_structure(c)
    IF ps.n_pools > config.strips_total:
      warnings.APPEND({ id:c.id, issue:STRIP_DEFICIT,
        n_pools:ps.n_pools, strips:config.strips_total })
      IF NOT c.flighted:
        append BOTTLENECK(STRIP_DEFICIT_NO_FLIGHTING, WARN,
          "{c.id}: {ps.n_pools} pools but only {config.strips_total} strips, flighting not enabled")
      suggestions.APPEND({ type:FLIGHT_POOLS, id:c.id,
        pools_per_flight:CEIL(ps.n_pools/2),
        gap_estimate:snap_to_slot(pool_round_dur+FLIGHT_BUFFER_MINS) })

  // Pass 2 — concurrent pair suggestions
  FOR each pair (c1, c2):
    c1p=n_pools(c1); c2p=n_pools(c2)
    IF c1p+c2p > strips_total AND c1p<=strips_total AND c2p<=strips_total:
      pri=(c1p>=c2p)?c1:c2; flt=(c1p>=c2p)?c2:c1
      IF c1p==c2p: flag CONCURRENT_PAIR_MANUAL_NEEDED
      xpen=crossover_penalty(c1,c2)
      suggestions.APPEND({ type:CONCURRENT_PAIR, priority_id:pri.id,
        flighted_id:flt.id, xpen, demographic_warning:xpen>0 })

  // Pass 3 — validate only one flighted per day (estimate day assignments)
  FOR each day d:
    flighted_on_day = competitions flighted AND estimated on day d
    IF COUNT(flighted_on_day) > 1:
      warnings.APPEND({ issue:MULTIPLE_FLIGHTED_SAME_DAY, day:d })
    IF COUNT(flighted_on_day)==1:
      flighted = flighted_on_day[0]
      largest  = MAX by n_pools among competitions on day d
      IF flighted.id != largest.id:
        warnings.APPEND({ issue:CONCURRENT_PAIR_NOT_LARGEST,
          flighted:flighted.id, largest:largest.id })

  // Pass 4 — video strip peak demand
  video_demand = compute_peak_video_demand(competitions, config)
  // For TEAM events with REQUIRED policy: count 2 video strips at finals
  IF video_demand.peak > config.video_strips_total:
    warnings.APPEND({ issue:VIDEO_STRIP_PEAK_DEMAND,
      demand:video_demand.peak, available:config.video_strips_total })

  // Pass 5 — concurrent pair video conflict
  FOR each pair (pri, flt):
    IF both have de_video_policy==REQUIRED:
      warnings.APPEND({ issue:CONCURRENT_PAIR_VIDEO_CONFLICT })

  // Pass 6 — cut summary (informational)
  FOR each competition c WHERE c.cut_mode != DISABLED:
    promoted = compute_de_fencer_count(c)
    suggestions.APPEND({ type:CUT_SUMMARY, id:c.id,
      entry:c.fencer_count, promoted, bracket:compute_bracket_size(c) })

  // Pass 7 — gender equity cap validation (capped events only)
  // Per USA Fencing Athlete Handbook 2024-25 (p14-15):
  //   Required beginning 2025-26 season.
  //   Regional qualifiers (RYC, RJCC, ROC, SYC, SJCC) cannot cap entries at all.
  //
  // Allowable cap difference table (compares pools in larger vs smaller event):
  //   3 or fewer pools (≤21 fencers): caps must be equal
  //   4-7 pools (22-49 fencers):      max 1 pool difference
  //   8-11 pools (50-77 fencers):     max 2 pools difference
  //   12+ pools (78+ fencers):        max 3 pools difference
  //
  // Assumes pools of 5-7, targeted 6-7.
  capped = [c FOR c IN competitions WHERE c.fencer_count_type == CAPPED]
  FOR each c in capped:
    IF is_regional_qualifier(c):
      append BOTTLENECK(REGIONAL_QUALIFIER_CAPPED, ERROR,
        "{c.id}: regional qualifiers cannot cap entries")

  // Compare men's vs women's capped events in same age/weapon category
  FOR each (category, weapon) group:
    mens   = [c FOR c IN capped WHERE c.gender==MEN AND c.category==category AND c.weapon==weapon]
    womens = [c FOR c IN capped WHERE c.gender==WOMEN AND c.category==category AND c.weapon==weapon]
    IF LENGTH(mens)==0 OR LENGTH(womens)==0: CONTINUE
    m = mens[0]; w = womens[0]
    m_pools = compute_pool_structure(m).n_pools
    w_pools = compute_pool_structure(w).n_pools
    larger_pools = MAX(m_pools, w_pools)
    pool_diff = ABS(m_pools - w_pools)
    allowed = gender_equity_allowable_diff(larger_pools)
    IF pool_diff > allowed:
      append BOTTLENECK(GENDER_EQUITY_CAP_VIOLATION, WARN,
        "{m.id} vs {w.id}: cap difference is {pool_diff} pools, "
        "max allowed is {allowed} for {larger_pools}-pool larger event")

  RETURN { warnings, suggestions }

FUNCTION gender_equity_allowable_diff(larger_pools):
  IF larger_pools <= 3: RETURN 0    // must be equal
  IF larger_pools <= 7: RETURN 1
  IF larger_pools <= 11: RETURN 2
  RETURN 3                          // 12+ pools
```

### 9.2 Flight Structure

```
pools_per_flight  = CEIL(n_pools / 2)     // Flight A gets extra if odd
flight_duration   = estimate_pool_duration(... pools_per_flight ...)
flight_b_offset   = snap_to_slot(flight_duration + FLIGHT_BUFFER_MINS)
flight_b_start    = flight_a_start + flight_b_offset

// HARD RULE: Flight A and Flight B must both complete on the same calendar day.
// If flight_b_end would exceed DAY_END(day), validation must catch this.
// 4PM ceiling applies to Flight A start only — Flight B is internal.
// Gap between flights is available to other competitions.
// Mixed pool sizes: use weighted average duration for both flights.
```

---

## 10. DIRECT ELIMINATION (DE) ESTIMATION & EXECUTION

### 10.1 Bracket Size & Phase Applicability

```
FUNCTION next_power_of_2(n):
  p=1; WHILE p<n: p=p*2; RETURN p

// bracket_size = next_power_of_2(compute_de_fencer_count(competition))
// NOT next_power_of_2(entry fencer_count)

// Phase applicability:
//   bracket > 32   → DE_PRELIMS + DE_ROUND_OF_16 + DE_FINALS
//   bracket == 16  → DE_ROUND_OF_16 + DE_FINALS (no PRELIMS)
//   bracket <= 8   → DE_FINALS only
//   SINGLE_BLOCK   → always one block regardless of bracket

// Phase coverage:
//   DE_PRELIMS:      rounds 32 and above
//   DE_ROUND_OF_16:  rounds 16, 8, 4 (QF), 2 (SF) — 30 bouts total
//   DE_FINALS:       gold medal bout only — 1 bout, 30-min hard floor
//   Bronze bout:     simultaneous with DE_FINALS, TEAM only
//                    same video policy as competition
//                    sabre weapon: must use sabre-qualified ref (no fill-in)

// HARD RULE: all DE phases complete on same calendar day as pool phase.
```

### 10.2 Block Duration Split

```
FUNCTION de_block_durations(bracket_size, total_de_duration):
  total_bouts   = bracket_size / 2
  prelims_bouts = MAX(total_bouts - 30 - 1, 0)
  r16_bouts     = MIN(30, total_bouts - 1)
  finals_bouts  = 1

  prelims_dur = ROUND(total_de_duration * prelims_bouts / total_bouts)
  r16_dur     = ROUND(total_de_duration * r16_bouts     / total_bouts)
  finals_dur  = total_de_duration - prelims_dur - r16_dur
  finals_dur  = MAX(finals_dur, DE_FINALS_MIN_MINS)  // 30-min hard floor

  RETURN { prelims_dur, r16_dur, finals_dur }
```

### 10.3 Video-Aware Strip Selection

```
FUNCTION select_strips_for_phase(strips_needed, competition, phase, not_before, state):
  // Never video: pools, DE_PRELIMS, SINGLE_BLOCK
  IF phase IN [POOL, DE_PRELIMS, SINGLE_BLOCK]:
    RETURN select_strips(strips_needed, video_required=FALSE, not_before, state)

  // DE_ROUND_OF_16, DE_FINALS, bronze bout — check video policy
  IF competition.de_video_policy == REQUIRED:
    strips = select_strips(strips_needed, TRUE, not_before, state)
    IF strips == WAIT_UNTIL(t): RETURN WAIT_UNTIL(t)
    RETURN strips
  ELSE:  // BEST_EFFORT
    video_free = free video strips at not_before
    IF COUNT(video_free) >= strips_needed: RETURN video_free[0..strips_needed-1]
    RETURN select_strips(strips_needed, FALSE, not_before, state)

// Non-video strips always preferred for non-video phases
// to preserve video strips for ROUND_OF_16 and FINALS.
FUNCTION select_strips(strips_needed, video_required, not_before, state):
  IF video_required:
    candidates = FILTER(strips, video_capable AND free at not_before)
    IF COUNT(candidates) < strips_needed:
      RETURN WAIT_UNTIL(Nth video strip free_at)
  ELSE:
    non_video = FILTER(strips, !video_capable AND free at not_before)
    video     = FILTER(strips,  video_capable AND free at not_before)
    candidates = SORT(non_video, BY free_at) + SORT(video, BY free_at)
    candidates = candidates[0..strips_needed-1]
  RETURN candidates
```

### 10.4 SINGLE_BLOCK Execution

```
// Default. Entire DE on all available strips. No video requirement.
de_optimal   = FLOOR(bracket_size / 2)
de_strips    = MIN(free_strips_at_de_start, de_optimal)
ratio        = MIN(de_strips/de_optimal, de_refs_free/de_optimal)
actual_dur   = IF ratio>=1.0 THEN baseline ELSE CEIL(baseline/ratio)
de_end       = de_start + actual_dur
MARK de_strips occupied until de_end
// Refs released at de_end

// Bronze bout (TEAM only) — simultaneous with gold:
// BEST_EFFORT always (SINGLE_BLOCK never video)
// Non-video strip preferred, then any strip, excluding gold strips
// Sabre weapon: must use sabre-qualified ref (no fill-in for bronze)
bronze_strip = first free non-gold strip at de_start (non-video preferred)
IF none: append BOTTLENECK(DE_FINALS_BRONZE_NO_STRIP, INFO)
         // schedule bronze at de_end + SLOT_MINS on next free strip
ELSE: MARK bronze_strip occupied until de_end
```

### 10.5 STAGED_DE_BLOCKS Execution

```
// Refs released at end of each block and reallocated for next.
// No gap between blocks — continuous flow.
// Strips released between blocks — other competitions may use them.
// All blocks must complete on the same calendar day.

blocks = de_block_durations(bracket_size, total_baseline)
phases = de_phases_for_bracket(bracket_size)

// ── DE_PRELIMS (bracket > 32) ───────────────────────────────
IF DE_PRELIMS in phases:
  prelims_strips = select_strips_for_phase(de_optimal, comp, DE_PRELIMS, de_start)
  prelims_ratio  = COUNT(prelims_strips) / de_optimal
  prelims_actual = snap_to_slot(CEIL(blocks.prelims_dur / prelims_ratio))
  prelims_end    = de_start + prelims_actual
  MARK prelims_strips occupied until prelims_end
  allocate_refs(day, weapon, COUNT(prelims_strips), de_start, prelims_end)
  // Strips AND refs released at prelims_end

// ── DE_ROUND_OF_16 ──────────────────────────────────────────
r16_not_before = IF DE_PRELIMS in phases THEN prelims_end ELSE de_start
r16_target = competition.de_round_of_16_strips

IF competition.de_round_of_16_requirement == HARD:
  r16_start, r16_strips = earliest_resource_window(
    r16_target, DE_REFS*r16_target, weapon,
    video=(de_video_policy==REQUIRED), r16_not_before, day)
ELSE:  // IF_AVAILABLE
  r16_strips = select_strips_for_phase(r16_target, comp, DE_ROUND_OF_16, r16_not_before)
  IF r16_strips==WAIT_UNTIL: r16_strips = all_free_strips_at(r16_not_before)
  r16_start = r16_not_before

r16_ratio  = COUNT(r16_strips) / r16_target
r16_actual = snap_to_slot(CEIL(blocks.r16_dur / r16_ratio))
r16_end    = r16_start + r16_actual
MARK r16_strips occupied until r16_end
allocate_refs(day, weapon, COUNT(r16_strips), r16_start, r16_end)
// Strips AND refs released at r16_end

// ── DE_FINALS (gold medal bout) ─────────────────────────────
fin_not_before = r16_end  // continuous — no gap
fin_target = competition.de_finals_strips

IF competition.de_finals_requirement == HARD:
  fin_start, gold_strips = earliest_resource_window(
    fin_target, DE_REFS, weapon,
    video=(de_video_policy==REQUIRED), fin_not_before, day)
ELSE:
  gold_strips = select_strips_for_phase(fin_target, comp, DE_FINALS, fin_not_before)
  IF gold_strips==WAIT_UNTIL:
    gold_strips = [first_free_strip(video=(de_video_policy==REQUIRED))]
  fin_start = fin_not_before

fin_actual = MAX(blocks.finals_dur, DE_FINALS_MIN_MINS)
fin_end    = fin_start + fin_actual
MARK gold_strips occupied until fin_end
allocate_refs(day, weapon, 1, fin_start, fin_end)

// ── BRONZE BOUT (TEAM only) — simultaneous with gold ────────
IF competition.event_type == TEAM:
  // Bronze uses same video policy as gold
  // Sabre weapon: MUST use sabre-qualified ref — fill-in NOT permitted
  IF competition.de_video_policy == REQUIRED:
    video_candidates = free video strips at fin_start WHERE NOT IN gold_strips
    IF COUNT(video_candidates) > 0:
      bronze_strip = video_candidates[0]
      MARK bronze_strip occupied until fin_end
      allocate_refs_for_sabre_or_weapon(day, weapon, 1, fin_start, fin_end,
                                         allow_fillin=FALSE)
    ELSE:
      append BOTTLENECK(DE_FINALS_BRONZE_NO_STRIP, WARN)
      // Schedule bronze at fin_end + SLOT_MINS on next free video strip
  ELSE:  // BEST_EFFORT
    candidates = (free video strips NOT IN gold) OR (any free strip NOT IN gold)
    IF candidates exist:
      bronze_strip = candidates[0]  // non-video preferred
      MARK bronze_strip occupied until fin_end
      allocate_refs_for_sabre_or_weapon(day, weapon, 1, fin_start, fin_end,
                                         allow_fillin=FALSE)
    ELSE:
      append BOTTLENECK(DE_FINALS_BRONZE_NO_STRIP, INFO)
      // Schedule bronze at fin_end + SLOT_MINS on next free strip
```

### 10.6 Finals Strip Summary

| DE_VIDEO_POLICY | Gold Strip | Bronze Strip (TEAM only) | Bronze Missing Severity |
|---|---|---|---|
| REQUIRED (STAGED_DE_BLOCKS) | Video, HARD | Video, IF_AVAILABLE | WARN |
| BEST_EFFORT (STAGED_DE_BLOCKS) | Video preferred, any fallback | Video preferred, any fallback | INFO |
| SINGLE_BLOCK (any) | Any strip | Any non-gold strip | INFO |

---

## 11. RESOURCE ALLOCATION

### 11.1 Earliest Resource Window

```
FUNCTION earliest_resource_window(strips_needed, refs_needed, weapon,
                                   video_required, not_before, day, state):
  candidate = not_before
  LOOP:
    selected = select_strips(strips_needed, video_required, candidate, state)
    IF selected==WAIT_UNTIL(t): candidate=t; CONTINUE
    T_refs = earliest t >= candidate where refs_free_at(day,weapon,t) >= refs_needed
    T = snap_to_slot(MAX(candidate, MAX(strip_free_at[s] FOR s IN selected), T_refs))
    IF T > DAY_START(day) + LATEST_START_OFFSET: RETURN NO_WINDOW
    IF T > DAY_END(day): RETURN NO_WINDOW
    IF COUNT(qualifying free strips at T) >= strips_needed:
      // Emit bottleneck if resource wait caused a delay
      delay = T - not_before
      IF delay >= THRESHOLD_MINS:
        strip_wait = MAX(strip_free_at[s] FOR s IN selected) - not_before
        ref_wait   = T_refs - not_before
        IF strip_wait > 0 AND ref_wait > 0:
          append BOTTLENECK(STRIP_AND_REFEREE_CONTENTION, WARN, delay_mins=delay)
        ELSE IF strip_wait > 0:
          append BOTTLENECK(STRIP_CONTENTION, WARN, delay_mins=delay)
        ELSE IF ref_wait > 0:
          append BOTTLENECK(REFEREE_CONTENTION, WARN, delay_mins=delay)
      IF video_required AND delay >= THRESHOLD_MINS:
        append BOTTLENECK(VIDEO_STRIP_CONTENTION, WARN, delay_mins=delay)
      RETURN T, selected, refs_needed
    candidate = MIN of all free_at values > T
```

### 11.2 Snap to Slot

```
FUNCTION snap_to_slot(t):
  r = t MOD 30
  IF r==0: RETURN t
  RETURN t + (30-r)

// Applied to: pool_start, flight_b_start, de_start, DE block transitions
// NOT applied to: pool_end, flight ends, DE block ends (start + duration)
// Buffers (ADMIN_GAP, FLIGHT_BUFFER) are minimums; snap rounds up from them.
```

---

## 12. DAY ASSIGNMENT

### 12.1 Time Representation

```
// All times: absolute minutes from T=0 = Day 0 08:00 AM
DAY_START(d) = d * 840
DAY_END(d)   = d * 840 + 840
FUNCTION which_day(t): RETURN FLOOR(t / 840)
```

### 12.2 Constraint Score (Priority Ordering)

```
FUNCTION constraint_score(competition, all_competitions, config):
  crossover_count  = COUNT c2 WHERE crossover_penalty(competition, c2) > 0
  window_tightness = 840 / (competition.latest_end - competition.earliest_start)
  sabre_min        = MIN(config.referee_availability[d].sabre_refs FOR d)
  sabre_scarcity   = IF weapon==SABRE THEN sabre_comps/MAX(sabre_min,1) ELSE 0
  video_scarcity   = IF de_mode==STAGED_DE_BLOCKS AND de_video_policy==REQUIRED
                     THEN video_comps_requiring/MAX(video_strips_total,1) ELSE 0
  ref_weight       = {TWO:2.0, AUTO:1.0, ONE:0.5}[ref_policy]
  RETURN crossover_count + window_tightness + sabre_scarcity
       + video_scarcity + ref_weight
```

### 12.3 Soft Constraint Relaxation

```
// When no valid day found at the current constraint level,
// relax soft constraints progressively before hard failing.

CONSTRAINT_LEVELS = [
  0: full constraints (proximity + crossover + hard blocks),
  1: ignore proximity penalties,
  2: ignore soft crossover penalties (keep INFINITY blocks only),
  3: ignore INFINITY blocks (last resort — same population allowed),
]

FUNCTION assign_day(competition, pool_info, state):
  FOR level IN CONSTRAINT_LEVELS:
    scores = score_all_days(competition, pool_info, state, level)
    valid  = FILTER(scores, not NO_WINDOW)
    IF valid is not empty:
      best = MIN(valid, BY score)
      IF level > 0:
        append BOTTLENECK(CONSTRAINT_RELAXED, WARN,
          "Constraints relaxed to level {level} to find valid day")
      IF best.score > 0:
        append BOTTLENECK(UNAVOIDABLE_CROSSOVER_CONFLICT or PROXIMITY_PREFERENCE_UNMET)
      RETURN best.day

  RAISE SchedulingError(DEADLINE_BREACH_UNRESOLVABLE,
    "No valid day found even with all constraints relaxed")
```

### 12.4 Day Penalty Scoring

```
FUNCTION total_day_penalty(competition, day, estimated_start, state, level):
  total = 0.0

  FOR each r in schedule WHERE r.assigned_day==day:
    c2   = competition_by_id(r.competition_id)
    xpen = crossover_penalty(competition, c2)

    IF level < 3 AND xpen==INFINITY: RETURN INFINITY
    IF level < 2:
      total += xpen
      IF xpen > 0:
        append BOTTLENECK(SAME_DAY_DEMOGRAPHIC_CONFLICT, INFO,
          "{competition.id} and {c2.id} same day, crossover {xpen}")

    // Same-time penalty (always applied regardless of level)
    IF ABS(estimated_start - r.pool_start) <= 30 AND xpen > 0:
      total += (xpen >= 1.0) ? 10.0 : 4.0
      append BOTTLENECK(SAME_TIME_CROSSOVER, WARN,
        "{competition.id} and {c2.id} start within 30 min, crossover {xpen}")

    // Individual+Team ordering (same weapon only — cross-weapon has no ordering constraint)
    IF competition.category==c2.category AND competition.weapon==c2.weapon AND comparable(competition, c2):
      IF one is INDIVIDUAL and other is TEAM:
        gap = team_start - individual_start
        IF ABS(gap)<=30 OR gap<0:
          total += 8.0
          append BOTTLENECK(INDIV_TEAM_ORDERING, WARN,
            "{competition.id} and {c2.id}: individual must precede team by 2+ hours")
        ELSE IF gap<120:
          total += 3.0
          append BOTTLENECK(INDIV_TEAM_ORDERING, INFO,
            "{competition.id} and {c2.id}: gap {gap} min, recommended 120")

  // 8AM patterns (always applied)
  total += early_start_penalty(competition, day, estimated_start, state)

  // Y10 early-in-day preference (Ops Manual Group 2)
  IF competition.category == Y10 AND estimated_start > DAY_START(day) + SLOT_MINS:
    total += 0.3

  // ROW/epee balance (Ops Manual Group 2) — prefer each day to mix weapon types
  total += weapon_balance_penalty(competition, day, state)

  // Same age/sex different weapons same day (Ops Manual Group 3)
  total += cross_weapon_same_demographic_penalty(competition, day, state)

  // Smaller events on last day when ref shortage (Ops Manual Group 3)
  total += last_day_ref_shortage_penalty(competition, day, state, config)

  // Rest day preference for JR↔CDT and JR↔D1 (Ops Manual Group 2)
  total += rest_day_penalty(competition, day, state)

  // Proximity (skipped at level >= 1)
  IF level < 1:
    total += proximity_penalty(competition, day, state.schedule)
    total += individual_team_proximity_penalty(competition, day, state.schedule)

  RETURN total
```

### 12.5 Weapon Balance Penalty (Ops Manual Group 2)

```
// "Each day should include a balance of right of way weapon and epee competitions."
// ROW weapons: FOIL, SABRE. Non-ROW: EPEE.

FUNCTION weapon_balance_penalty(competition, day, state):
  scheduled_on_day = [c FOR c IN state.schedule WHERE c.assigned_day == day]
  row_count  = COUNT(c WHERE c.weapon IN {FOIL, SABRE} FOR c IN scheduled_on_day)
  epee_count = COUNT(c WHERE c.weapon == EPEE FOR c IN scheduled_on_day)

  // Add the proposed competition
  IF competition.weapon == EPEE: epee_count += 1
  ELSE: row_count += 1

  total = row_count + epee_count
  IF total <= 1: RETURN 0.0

  // Penalty based on imbalance ratio
  minority = MIN(row_count, epee_count)
  IF minority == 0: RETURN 0.5    // all one type — mild penalty
  RETURN 0.0
```

### 12.6 Cross-Weapon Same Demographic Penalty (Ops Manual Group 3)

```
// "Competitions in the same age group and sex but in different weapons
//  should not be held on the same day." — Group 3 (if possible)

FUNCTION cross_weapon_same_demographic_penalty(competition, day, state):
  total = 0.0
  FOR each r in state.schedule WHERE r.assigned_day == day:
    c2 = competition_by_id(r.competition_id)
    IF c2.gender != competition.gender: CONTINUE
    IF c2.category != competition.category: CONTINUE
    IF c2.weapon == competition.weapon: CONTINUE   // same-weapon handled by crossover
    total += 0.2   // low weight — Group 3 = "if possible"
  RETURN total
```

### 12.7 Last Day Referee Shortage Penalty (Ops Manual Group 3)

```
// "If there is a shortage of referees in a given weapon, the last day
//  should include only smaller competitions in that weapon." — Group 3

FUNCTION last_day_ref_shortage_penalty(competition, day, state, config):
  last_day = config.days_available - 1
  IF day != last_day: RETURN 0.0

  weapon = competition.weapon
  avg_refs = AVG(refs_available_on_day(d, weapon, config) FOR d IN 0..last_day)
  last_day_refs = refs_available_on_day(last_day, weapon, config)

  // Only applies when refs are below average on last day
  IF last_day_refs >= avg_refs: RETURN 0.0

  // Penalize larger events (by fencer count) on the last day
  IF competition.fencer_count > 100: RETURN 0.5
  IF competition.fencer_count > 50:  RETURN 0.2
  RETURN 0.0
```

### 12.8 Rest Day Preference (Ops Manual Group 2)

```
// "Rest day between Junior and Cadet, and between Junior and Div1"
// (same weapon only). Penalizes consecutive-day scheduling of these
// pairs when no rest day separates them. This counteracts the proximity
// bonus that would otherwise reward consecutive scheduling.

REST_DAY_PAIRS = { (JUNIOR, CADET), (JUNIOR, DIV1) }

FUNCTION rest_day_penalty(competition, day, state):
  total = 0.0
  FOR each r in state.schedule:
    c2 = competition_by_id(r.competition_id)
    IF c2.gender != competition.gender: CONTINUE
    IF c2.weapon != competition.weapon: CONTINUE
    pair = (competition.category, c2.category)
    IF pair NOT IN REST_DAY_PAIRS AND REVERSE(pair) NOT IN REST_DAY_PAIRS: CONTINUE

    day_gap = ABS(day - r.assigned_day)
    IF day_gap == 1:
      // Consecutive days with no rest day — discourage
      total += 1.5
    // day_gap >= 2 is fine — at least one rest day exists
  RETURN total
```

### 12.9 Early Start Penalty (8AM Patterns)

```
// Computes 8AM Pattern A, B, and C penalties.
// "8AM" = pool_start within EARLY_START_THRESHOLD of DAY_START.

FUNCTION early_start_penalty(competition, day, estimated_start, state):
  total = 0.0
  is_early = (estimated_start - DAY_START(day)) <= EARLY_START_THRESHOLD

  IF NOT is_early: RETURN 0.0

  // Pattern A: same-day 8AM high crossover
  // Two competitions with crossover ≥1.0 both starting at 8AM on the same day
  FOR each r in state.schedule WHERE r.assigned_day == day:
    c2 = competition_by_id(r.competition_id)
    c2_start = r.pool_start OR r.flight_a_start
    c2_is_early = (c2_start - DAY_START(day)) <= EARLY_START_THRESHOLD
    IF NOT c2_is_early: CONTINUE

    xpen = crossover_penalty(competition, c2)

    IF xpen >= 1.0:
      total += 2.0   // SCHEDULED_8AM_SAME_DAY_CROSSOVER
      append BOTTLENECK(SCHEDULED_8AM_SAME_DAY_CROSSOVER, WARN,
        "{competition.id} and {c2.id} both 8AM on day {day}, crossover {xpen}")

  // Pattern B: consecutive-day 8AM high crossover
  // Two competitions with crossover ≥1.0 both starting at 8AM on consecutive days
  FOR each r in state.schedule WHERE ABS(r.assigned_day - day) == 1:
    c2 = competition_by_id(r.competition_id)
    c2_start = r.pool_start OR r.flight_a_start
    c2_is_early = (c2_start - DAY_START(r.assigned_day)) <= EARLY_START_THRESHOLD
    IF NOT c2_is_early: CONTINUE

    xpen = crossover_penalty(competition, c2)

    IF xpen >= 1.0:
      total += 5.0   // SCHEDULED_8AM_CONSECUTIVE_DAYS — critical
      append BOTTLENECK(SCHEDULED_8AM_CONSECUTIVE_DAYS, WARN,
        "{competition.id} (day {day}) and {c2.id} (day {r.assigned_day}) "
        "both 8AM on consecutive days, crossover {xpen}")

  // Pattern C: consecutive-day 8AM individual+team
  // Same category ind+team, both 8AM on consecutive days
  FOR each r in state.schedule WHERE ABS(r.assigned_day - day) == 1:
    c2 = competition_by_id(r.competition_id)
    c2_start = r.pool_start OR r.flight_a_start
    c2_is_early = (c2_start - DAY_START(r.assigned_day)) <= EARLY_START_THRESHOLD
    IF NOT c2_is_early: CONTINUE

    IF competition.category == c2.category AND competition.gender == c2.gender:
      IF competition.event_type != c2.event_type:   // one IND, one TEAM
        total += 2.0   // SCHEDULED_8AM_INDV_TEAM
        append BOTTLENECK(SCHEDULED_8AM_INDV_TEAM, WARN,
          "{competition.id} and {c2.id} ind+team both 8AM consecutive days")

  RETURN total
```

### 12.10 Find Earlier Slot Same Day

```
// When a competition's projected end time breaches the day deadline,
// attempt to find an earlier start slot on the same day that fits.

FUNCTION find_earlier_slot_same_day(competition, pool_structure, day, state):
  day_start = DAY_START(day)
  current_slot = day_start

  WHILE current_slot < DAY_START(day) + LATEST_START_OFFSET:
    // Check if resources are available at this slot
    strips_needed = pool_structure.n_pools   // or effective_parallelism
    IF competition.flighted:
      strips_needed = CEIL(pool_structure.n_pools / 2)

    available_strips = COUNT(s WHERE state.strip_free_at[s] <= current_slot)
    available_refs   = refs_free_at(day, competition.weapon, current_slot, state)

    IF available_strips >= strips_needed AND available_refs > 0:
      // Estimate total duration at this slot
      pool_dur = estimate_pool_duration(competition, pool_structure,
                   available_strips, available_refs,
                   resolve_refs_per_pool(competition, available_refs, pool_structure.n_pools))
      total_dur = pool_dur.actual_duration + ADMIN_GAP_MINS
                + config.de_duration_table[competition.weapon][compute_bracket_size(competition)]

      IF competition.flighted:
        total_dur = pool_dur.flight_duration + FLIGHT_BUFFER_MINS
                  + pool_dur.flight_duration + ADMIN_GAP_MINS
                  + config.de_duration_table[competition.weapon][compute_bracket_size(competition)]

      projected_end = current_slot + total_dur
      IF projected_end <= DAY_END(day):
        RETURN current_slot

    current_slot += SLOT_MINS

  RETURN NULL   // no earlier slot fits
```

### 12.11 Allocate Pool Resources for Concurrent Pair

```
// Allocates strips and refs for the priority competition in a concurrent pair.
// The priority event gets its dedicated strips; the flighted partner gets the remainder.

FUNCTION allocate_pool_resources_paired(competition, pool_dur, not_before, state):
  pair = get_concurrent_pair(competition)
  priority_strips = pair.strips_for_priority
  flighted_strips = pair.strips_for_flighted

  IF competition.id == pair.priority_competition_id:
    // Priority event: allocate its dedicated strip count
    T, strips, _ = earliest_resource_window(
      priority_strips, DE_REFS * priority_strips,
      competition.weapon, FALSE, not_before, which_day(not_before))

    pool_end = T + pool_dur.actual_duration
    MARK strips occupied until pool_end
    allocate_refs(which_day(T), competition.weapon, COUNT(strips), T, pool_end, state)

    RETURN { start: T, end: pool_end, strips: strips }

  ELSE:
    // Flighted partner: uses remaining strips, flights around priority
    // Priority must already be scheduled on this day
    priority_result = state.schedule[pair.priority_competition_id]

    // Flight A: before or alongside priority's pool phase
    flight_a_strips = MIN(flighted_strips, CEIL(pool_dur.n_pools / 2))
    T_a, strips_a, _ = earliest_resource_window(
      flight_a_strips, DE_REFS * flight_a_strips,
      competition.weapon, FALSE, not_before, which_day(not_before))
    flight_a_end = T_a + pool_dur.flight_duration
    MARK strips_a occupied until flight_a_end
    allocate_refs(which_day(T_a), competition.weapon, COUNT(strips_a), T_a, flight_a_end, state)

    // Flight B: after Flight A buffer
    flight_b_strips = FLOOR(pool_dur.n_pools / 2)
    T_b = snap_to_slot(flight_a_end + FLIGHT_BUFFER_MINS)
    IF which_day(T_b) != which_day(T_a): RAISE SchedulingError(SAME_DAY_VIOLATION)
    T_b, strips_b, _ = earliest_resource_window(
      flight_b_strips, DE_REFS * flight_b_strips,
      competition.weapon, FALSE, T_b, which_day(T_b))
    flight_b_end = T_b + pool_dur.flight_duration
    MARK strips_b occupied until flight_b_end
    allocate_refs(which_day(T_b), competition.weapon, COUNT(strips_b), T_b, flight_b_end, state)

    RETURN { flight_a_start: T_a, flight_a_end: flight_a_end,
             flight_b_start: T_b, flight_b_end: flight_b_end,
             strips_a: strips_a, strips_b: strips_b }
```

---

## 13. SCHEDULE ONE COMPETITION

```
FUNCTION schedule_competition(competition, state, config):
  pool_structure = compute_pool_structure(competition)
  day            = assign_day(competition, pool_structure, state)
  not_before     = MAX(competition.earliest_start, DAY_START(day))

  // If team event, enforce individual-first ordering on same day (same weapon only)
  // Note: this is a fallback for constraint relaxation level 3 — normally
  // crossover_penalty() returns INFINITY and prevents same-day scheduling.
  IF competition.event_type == TEAM:
    ind = find_individual_counterpart(competition, state.schedule)  // same cat+gender+weapon
    IF ind is scheduled AND state.schedule[ind].assigned_day == day:
      ind_end = state.schedule[ind].de_total_end OR state.schedule[ind].pool_end
      sequenced_start = snap_to_slot(ind_end + INDIV_TEAM_MIN_GAP_MINS)
      IF sequenced_start > not_before:
        append BOTTLENECK(SEQUENCING_CONSTRAINT, INFO,
          "{competition.id} delayed to {sequenced_start} — must follow {ind.id} + 2h gap")
        not_before = sequenced_start

  bracket        = compute_bracket_size(competition)
  total_de_base  = config.de_duration_table[competition.weapon][bracket]

  // ── POOL PHASE ───────────────────────────────────────────
  avail_strips = COUNT free strips at not_before
  avail_refs   = refs_free_at(day, competition.weapon, not_before, state)
  ref_res      = resolve_refs_per_pool(competition, avail_refs, pool_structure.n_pools)
  pool_dur     = estimate_pool_duration(competition, pool_structure,
                   avail_strips, avail_refs, ref_res)

  IF competition.concurrent_pair_id != NULL:
    allocate_pool_resources_paired(competition, pool_dur, not_before, state)
  ELSE IF competition.flighted:
    T_a, strips_a, _ = earliest_resource_window(
      CEIL(pool_structure.n_pools/2), ref_res.refs_needed/2,
      weapon, FALSE, not_before, day)
    flight_a_end = T_a + pool_dur.flight_duration
    MARK strips_a occupied until flight_a_end
    allocate_refs(day, weapon, COUNT(strips_a), T_a, flight_a_end, state)

    T_b = snap_to_slot(T_a + flight_b_offset)
    // HARD: T_b must be on same day as T_a
    IF which_day(T_b) != which_day(T_a): RAISE SchedulingError(SAME_DAY_VIOLATION)
    T_b, strips_b, _ = earliest_resource_window(
      FLOOR(pool_structure.n_pools/2), ref_res.refs_needed/2,
      weapon, FALSE, T_b, day)
    flight_b_end = T_b + pool_dur.flight_duration
    // Emit FLIGHT_B_DELAYED if Flight B was pushed back beyond the buffer
    flight_b_ideal = snap_to_slot(T_a + flight_b_offset)
    IF T_b > flight_b_ideal + THRESHOLD_MINS:
      append BOTTLENECK(FLIGHT_B_DELAYED, WARN, delay_mins = T_b - flight_b_ideal)
    MARK strips_b occupied until flight_b_end
    allocate_refs(day, weapon, COUNT(strips_b), T_b, flight_b_end, state)
    pool_end = flight_b_end
  ELSE:
    T, strips, _ = earliest_resource_window(
      pool_dur.effective_parallelism, ref_res.refs_needed,
      weapon, FALSE, not_before, day)
    pool_end = T + pool_dur.actual_duration
    MARK strips occupied until pool_end
    allocate_refs(day, weapon, ref_res.refs_needed, T, pool_end, state)

  // ── DEADLINE CHECK — attempt reschedule if breached ─────
  // Retry guard: at most MAX_RESCHEDULE_ATTEMPTS (default 3) re-runs.
  // Each attempt tries an earlier slot; the slot search itself is bounded
  // by 17 slots/day (DAY_START to LATEST_START_OFFSET in SLOT_MINS steps).
  // Convergence: each retry uses a strictly earlier start, so the sequence
  // is monotonically decreasing and terminates.
  reschedule_attempts = 0
  MAX_RESCHEDULE_ATTEMPTS = 3

  LABEL retry_from_pool_allocation:
  IF pool_end > DAY_END(day):
    reschedule_attempts += 1
    IF reschedule_attempts > MAX_RESCHEDULE_ATTEMPTS:
      append BOTTLENECK(DEADLINE_BREACH_UNRESOLVABLE, ERROR,
        "Exhausted {MAX_RESCHEDULE_ATTEMPTS} reschedule attempts")
      RAISE SchedulingError
    earlier_slot = find_earlier_slot_same_day(competition, pool_structure, day, state)
    IF earlier_slot exists:
      append BOTTLENECK(DEADLINE_BREACH, WARN,
        "Rescheduled to earlier slot (attempt {reschedule_attempts})")
      not_before = earlier_slot
      GOTO retry_from_pool_allocation  // re-run pool + DE allocation
    ELSE:
      append BOTTLENECK(DEADLINE_BREACH_UNRESOLVABLE, ERROR)
      RAISE SchedulingError

  // ── ADMIN GAP ────────────────────────────────────────────
  de_not_before = snap_to_slot(pool_end + ADMIN_GAP_MINS)

  // ── DE PHASE ─────────────────────────────────────────────
  IF competition.de_mode == SINGLE_BLOCK:
    execute_single_block_de(competition, bracket, de_not_before, state)
  ELSE:
    execute_three_block_de(competition, bracket, de_not_before, state)

  // HARD: de_total_end must be on same day as pool_start
  IF which_day(de_total_end) != day:
    RAISE SchedulingError(SAME_DAY_VIOLATION)

  IF de_total_end > competition.latest_end OR de_total_end > DAY_END(day):
    reschedule_attempts += 1
    IF reschedule_attempts > MAX_RESCHEDULE_ATTEMPTS:
      append BOTTLENECK(DEADLINE_BREACH_UNRESOLVABLE, ERROR,
        "Exhausted {MAX_RESCHEDULE_ATTEMPTS} reschedule attempts")
      RAISE SchedulingError
    earlier_slot = find_earlier_slot_same_day(competition, pool_structure, day, state)
    IF earlier_slot exists:
      append BOTTLENECK(DEADLINE_BREACH, WARN,
        "Rescheduled to earlier slot (attempt {reschedule_attempts})")
      not_before = earlier_slot
      GOTO retry_from_pool_allocation  // re-run pool + DE allocation
    ELSE:
      append BOTTLENECK(DEADLINE_BREACH_UNRESOLVABLE, ERROR)
      RAISE SchedulingError

  state.schedule[competition.id] = SCHEDULE_RESULT { ... }
```

---

## 14. MASTER SCHEDULER

```
FUNCTION schedule_all(competitions[], config):
  state = GLOBAL_STATE {
    strip_free_at = [DAY_START(0)] * strips_total,
    refs_in_use_by_day = { d:{fe:0,sab:0,fillin:0,release_events:[]} FOR d },
    schedule={}, bottlenecks=[]
  }
  validate(competitions, config)
  mandatory = sort_with_pairs(FILTER(competitions, !optional))
  optional  = sort_with_pairs(FILTER(competitions,  optional))
  FOR each c in (mandatory + optional):
    schedule_competition(c, state, config)
  RETURN state.schedule, state.bottlenecks

// sort_with_pairs: most constrained first (by constraint_score),
//   priority competition always immediately before its flighted partner.

// ── Post-schedule warnings ──────────────────────────────────
FUNCTION post_schedule_warnings(schedule, config):
  // First/last day length warning (Ops Manual Group 2, 4+ day events only)
  IF config.days_available >= 4:
    day_durations = {}
    FOR each r in schedule:
      end = r.de_total_end OR r.pool_end
      start = r.pool_start OR r.flight_a_start
      day_durations[r.assigned_day] = MAX(day_durations.get(r.assigned_day, 0), end - DAY_START(r.assigned_day))
    middle_days = [d FOR d IN 1..(config.days_available-2)]
    IF LENGTH(middle_days) > 0:
      avg_middle = AVG(day_durations.get(d, 0) FOR d IN middle_days)
      first_day_dur = day_durations.get(0, 0)
      last_day_dur  = day_durations.get(config.days_available-1, 0)
      IF first_day_dur > avg_middle:
        WARN "First day ({first_day_dur} min) is longer than average middle day ({avg_middle} min)"
      IF last_day_dur > avg_middle:
        WARN "Last day ({last_day_dur} min) is longer than average middle day ({avg_middle} min)"
```

---

## 15. PRE-FLIGHT VALIDATION

```
FUNCTION validate(competitions[], config):

  // ── Referee availability ──────────────────────────────────
  // v6: referee_availability is optional during Phase 1 (pre-validation).
  // It is populated by calculate_optimal_refs() in Phase 1.5a, then
  // adjusted by the user. Full validation runs before Phase 2 scheduling.
  IF config.referee_availability IS NOT EMPTY:
    IF LENGTH(config.referee_availability) != days_available: RAISE
    FOR each day d:
      IF avail.foil_epee_refs<0 OR avail.sabre_refs<0: RAISE
      IF avail.sabre_refs==0: WARN "No sabre refs on day {d}"
      IF avail.foil_epee_refs+avail.sabre_refs==0: WARN "No refs on day {d}"

    // ── Zero refs for weapon with selected competitions ───────
    weapons_selected = DISTINCT(c.weapon FOR c IN competitions)
    FOR each w in weapons_selected:
      IF w == SABRE:
        IF SUM(avail.sabre_refs FOR avail IN config.referee_availability) == 0:
          RAISE "No sabre refs on any day but sabre competitions are selected"
      ELSE:
        IF SUM(avail.foil_epee_refs + avail.sabre_refs FOR avail IN config.referee_availability) == 0:
          RAISE "No refs for {w} on any day but {w} competitions are selected"

  // ── Per-competition ───────────────────────────────────────
  FOR each competition c:
    IF c.fencer_count < 6 OR c.fencer_count > 400: RAISE
    IF c.earliest_start < DAY_START(0): RAISE
    IF c.latest_end > DAY_END(days-1): RAISE
    IF c.latest_end <= c.earliest_start: RAISE
    IF c.fencer_count NOT IN POOL_TABLE: RAISE

    // Cut validation
    IF c.event_type==TEAM AND c.cut_mode!=DISABLED: RAISE
    IF c.cut_mode==PERCENTAGE:
      IF c.cut_value<=0 OR c.cut_value>100: RAISE
    IF c.cut_mode==COUNT:
      IF c.cut_value > c.fencer_count: RAISE
    promoted = compute_de_fencer_count(c)
    IF promoted < 2: RAISE "Cut produces fewer than 2 promoted fencers"
    IF promoted < 4: WARN "Very small DE bracket ({promoted} fencers)"

    // DE duration configured
    bracket = compute_bracket_size(c)
    IF config.de_duration_table[c.weapon][bracket] NULL: RAISE

    // Same-day completion feasibility
    CALL validate_same_day_completion(c, config)

    // Video strip availability (STAGED_DE_BLOCKS only)
    IF c.de_mode==STAGED_DE_BLOCKS AND c.de_video_policy==REQUIRED:
      IF config.video_strips_total < c.de_round_of_16_strips: RAISE
      IF config.video_strips_total < c.de_finals_strips: RAISE
      IF c.event_type==TEAM AND config.video_strips_total < c.de_finals_strips+1:
        WARN "May not have video strip for bronze bout"

  // ── Dead configuration detection ─────────────────────────
  FOR each c in competitions:
    IF c.de_video_policy == REQUIRED AND c.de_mode == SINGLE_BLOCK:
      WARN "{c.id}: REQUIRED video policy has no effect in SINGLE_BLOCK mode"

  // ── Same-population individuals need distinct days ────────
  // Same category + gender + weapon = same population (hard block same day)
  FOR each group (gender, category, weapon):
    IF COUNT(individual events in group) > days_available: RAISE

  // ── Team requires matching individual ─────────────────────
  FOR each team: IF no matching individual: RAISE

  // ── Individual + Team same-day feasibility ────────────────
  FOR each (ind, team) pair (same gender, category):
    IF ind_dur + INDIV_TEAM_MIN_GAP_MINS + team_de_dur > DAY_LENGTH_MINS: RAISE

  // ── Concurrent pair integrity ─────────────────────────────
  FOR each pair:
    IF strips_allocated_sum > strips_total: RAISE
    IF either strips_allocated < 1: RAISE
    // Priority event in a concurrent pair must not require flighting
    priority = get_priority_competition(pair)
    IF priority.flighted: RAISE "Priority event in concurrent pair cannot also be flighted"

FUNCTION validate_same_day_completion(competition, config):
  pool_structure = compute_pool_structure(competition)
  bracket        = compute_bracket_size(competition)
  de_baseline    = config.de_duration_table[competition.weapon][bracket]
  worst_pool     = weighted_pool_duration(pool_structure, competition.weapon, config)

  IF competition.flighted:
    worst_pool = snap_to_slot(worst_pool + FLIGHT_BUFFER_MINS) + worst_pool

  total_worst = worst_pool + ADMIN_GAP_MINS + de_baseline

  IF total_worst > DAY_LENGTH_MINS:
    RAISE ValidationError(
      "{competition.id}: worst-case duration {total_worst} mins exceeds "
      "14-hour day. Reduce fencer count, enable flighting, or "
      "adjust pool/DE durations.")
```

---

## 16. OUTPUT FORMAT

### 16.1 Schedule Entry

| Field | Description |
|---|---|
| competition_id | Catalogue ID |
| assigned_day | 0-indexed |
| use_flighting / is_priority / concurrent_pair_id | Pairing metadata |
| pool_start, pool_end | Non-flighted pool phase |
| flight_a/b_start, flight_a/b_end | Flighted pool phase (same day guaranteed) |
| entry_fencer_count / promoted_fencer_count | Cut results |
| bracket_size | Based on promoted count |
| cut_mode, cut_value | As configured |
| de_mode, de_video_policy | DE configuration |
| de_start, de_end, de_strips_count | SINGLE_BLOCK |
| de_prelims_start/end/strips | STAGED_DE_BLOCKS PRELIMS (NULL if bracket≤16) |
| de_round_of_16_start/end/strips | STAGED_DE_BLOCKS R16 |
| de_finals_start/end/strips | STAGED_DE_BLOCKS FINALS |
| de_bronze_start/end/strip_id | TEAM only; NULL or delayed time if unavailable |
| de_total_end | MAX(finals_end, bronze_end) |
| pool/de duration actual vs baseline | Diagnostics |
| conflict_score | Soft penalty total for day |
| sabre_fillin_used | Bool |
| constraint_relaxation_level | 0–3; 0 = no relaxation needed |

### 16.2 Bottleneck Entry

| Field | Description |
|---|---|
| competition_id | Affected competition |
| phase | POOL / DE / POOL_FLIGHT_B / DAY_ASSIGNMENT / DE_FINALS_BRONZE |
| cause | Cause code from Section 2.9 |
| severity | ERROR / WARN / INFO |
| delay_mins | Minutes late vs ideal |
| conflict_score | Penalty score |
| blocking_competition_id | Competition causing the block |

---

## 17. CONSTANTS REFERENCE

| Constant | Value | Configurable? | Notes |
|---|---|---|---|
| DAY_START_MINS | 480 | No | 8:00 AM |
| DAY_END_MINS | 1320 | No | 10:00 PM |
| LATEST_START_MINS | 960 | No | 4:00 PM wall-clock (minutes from midnight) |
| LATEST_START_OFFSET | 480 | No | Derived: LATEST_START_MINS - DAY_START_MINS; use in scheduling math |
| SLOT_MINS | 30 | No | Half-hour snapping |
| DAY_LENGTH_MINS | 840 | No | 14-hour day |
| ADMIN_GAP_MINS | 15 | Yes | Pool→DE minimum |
| FLIGHT_BUFFER_MINS | 15 | Yes | Flight A→B minimum |
| SAME_TIME_WINDOW_MINS | 30 | Yes | Within this = same time |
| INDIV_TEAM_MIN_GAP_MINS | 120 | Yes | Individual 2h before team |
| EARLY_START_THRESHOLD | 10 | Yes | 8AM window in minutes |
| THRESHOLD_MINS | 10 | Yes | Min delay worth flagging |
| MAX_RESCHEDULE_ATTEMPTS | 3 | Yes | Deadline reschedule retry limit per competition (Section 13) |
| DE_REFS | 1 | No | DE always 1 ref per strip |
| DE_FINALS_MIN_MINS | 30 | No | Finals hard floor |
| MAX_FENCERS | 400 | No | Per competition max |
| MIN_FENCERS | 6 | No | Per competition min |
| allow_sabre_ref_fillin | FALSE | Yes | v6: absorbed into Phase 1.5 flow; engine suggests when sabre refs short |
| pod_captain_override | AUTO | Yes | AUTO/DISABLED/FORCE_4 — see Section 8.1 |

---

## 18. DEFAULT CUT CONFIGURATION BY CATEGORY

| Category | Default Cut Mode | Default Value | Notes |
|---|---|---|---|
| DIV1 | PERCENTAGE | 20% | Top 20% qualify for DE |
| DIV1A | DISABLED | 100% | All promoted |
| DIV2 | DISABLED | 100% | All promoted |
| DIV3 | DISABLED | 100% | All promoted |
| JUNIOR | PERCENTAGE | 20% | Top 20% qualify for DE |
| CADET | PERCENTAGE | 20% | Top 20% qualify for DE |
| Y14 | PERCENTAGE | 20% | Top 20% qualify for DE |
| Y12 | DISABLED | 100% | All promoted |
| Y10 | DISABLED | 100% | All promoted |
| VETERAN | DISABLED | 100% | All promoted |
| TEAM (all) | DISABLED | 100% | Cuts never apply to team events |

*Organiser may override any default. Minimum 2 promoted fencers always enforced.*

---

## 19. DEFAULT VIDEO REPLAY BY CATEGORY

Suggested defaults shown during configuration. Organiser can override per competition.

Per Ops Manual (S1, Chapter 4, p.25):

| Category | Video Guaranteed From | Default de_video_policy |
|---|---|---|
| DIV1 | Round of 16 | REQUIRED |
| JUNIOR | Round of 16 | REQUIRED |
| CADET | Round of 16 | REQUIRED |
| Y14 | Round of 8 | BEST_EFFORT |
| Y12 | Round of 8 | BEST_EFFORT |
| Y10 | Round of 8 | BEST_EFFORT |
| VETERAN (VET50, VET60, VET70) | Round of 8 | BEST_EFFORT |
| VETERAN (VET40, VET80) | Round of 4 | BEST_EFFORT |
| DIV1A | Round of 4 | BEST_EFFORT |
| DIV2 | Round of 4 | BEST_EFFORT |
| DIV3 | Round of 4 | BEST_EFFORT |
| TEAM (all) | Gold/Bronze only | BEST_EFFORT |

*Note: "Video Guaranteed From" indicates at which elimination round video replay must be available per the Ops Manual. REQUIRED policy means the scheduler will delay DE blocks to secure video strips. BEST_EFFORT means video strips are preferred but the schedule won't delay for them.*

```
FUNCTION default_video_policy(competition):
  IF competition.category IN {DIV1, JUNIOR, CADET}: RETURN REQUIRED
  RETURN BEST_EFFORT

FUNCTION video_guaranteed_round(competition):
  IF competition.event_type == TEAM: RETURN "GOLD_BRONZE"
  IF competition.category IN {DIV1, JUNIOR, CADET}: RETURN "ROUND_OF_16"
  IF competition.category IN {Y10, Y12, Y14}: RETURN "ROUND_OF_8"
  IF competition.category == VETERAN:
    IF competition.vet_age_group IN {VET50, VET60, VET70}: RETURN "ROUND_OF_8"
    RETURN "ROUND_OF_4"   // VET40, VET80
  RETURN "ROUND_OF_4"     // DIV1A, DIV2, DIV3
```

---

## 20. OPEN ITEMS

| Item | Status | Notes |
|---|---|---|
| POOL_TABLE | ✅ RESOLVED | Full table for all fencer counts 6–400 hardcoded in Section 7.1. Single pool override (n≤10) documented. |
| Save/load configurations | 🔲 v6 | Save tournament configuration + schedule results for later reloading and re-running. Serialization format, storage backend, and versioning TBD. |
| Full veteran category expansion | 🔲 v6 | Expand VET40-80 as separate CATEGORY values with per-group crossover differences. Carried from v5.3 exclusions. |
| `is_regional_qualifier()` definition | 🔲 v6 | Need mapping of competition IDs to tournament types (RYC, RJCC, ROC, SYC, SJCC) for gender equity cap validation. May require catalogue extension. |

*See version history for closed items.*

---

## 21. OUT OF SCOPE / EXPLICIT EXCLUSIONS

The following items were evaluated during the v5.2 review and explicitly excluded. They may be revisited in future versions.

| Item | Source | Reason for Exclusion |
|---|---|---|
| Rest day between Junior↔Cadet (JO) and Junior↔Div1 | Ops Manual Group 2 | JO-specific rule. At NACs, Junior and Cadet are typically adjacent with no rest day. Organizers handle manually for JO events. |
| Two-round pool format for 203+ fencers | USA Fencing 2024-25 format updates | Rare edge case (only Div1 Men's Epee/Foil currently). Requires significant pool duration model changes. |
| Parafencing events | USA Fencing 2024-25 | Different equipment, rules, and scheduling needs. Out of scope for v5.2. |
| Repechage format | Ops Manual Appendix | Modern NACs use simple DE. Documented as intentional omission. |
| Coach coverage model | Community feedback | Coaches unable to cover multiple events is a real concern but modeling club/coach resources is out of scope. |
| Schedule publication timing | Community feedback | Process issue, not an algorithm issue. Early estimation is a design goal but not enforced by the scheduler. |
| Full veteran category expansion (VET40-80 as CATEGORY values) | Ops Manual | Partial solution via `vet_age_group` field (Section 2.4). Full expansion deferred to v6 when per-group crossover differences need modeling. |

---

---

## APPENDIX A — REVIEW FINDINGS & SOURCE REFERENCES

*Added 2026-03-23 following review against USA Fencing Operations Manual and community feedback.*

Full research document: [`prd-review-research.md`](./prd-review-research.md)

### A.1 Sources

| # | Source | URL / Location |
|---|---|---|
| S1 | USA Fencing Operations Manual, 2019 Edition | [PDF](https://assets.contentstack.io/v3/assets/blteb7d012fc7ebef7f/blt13f7bd461d92bb1c/2019_Operations_Manual_4_2019_Final_1.pdf) — Chapter 4 (Tournament Management), Chapter 7 (Competition Procedures), Appendices (Pool Formats, Tournament Procedures) |
| S2 | Change.org Petition: "Address Critical Scheduling Issues in National Fencing Events" (488 signatures, Feb 2024) | [Link](https://www.change.org/p/address-critical-scheduling-issues-in-national-fencing-events) |
| S3 | Academy of Fencing Masters: "Petition to Fix the Summer Nationals Schedule" (Feb 2024) | [Link](https://academyoffencingmasters.com/blog/petition-to-fix-the-summer-nationals-schedule/) |
| S4 | Academy of Fencing Masters: "USA Fencing National Events: Time for a Strategic Overhaul" (Nov 2024) | [Link](https://academyoffencingmasters.com/blog/usa-fencing-national-events-time-for-a-strategic-overhaul/) |
| S5 | Fencing Parents: "How much notice should US Fencing give for NAC day schedules?" (Jun 2021) | [Link](https://www.fencingparents.org/whats-new-in-fencing/2021/6/28/how-much-notice-should-us-fencing-give-for-day-schedules-checkin-times-and-policy-changes) |
| S6 | USA Fencing: "Take Note of These Updates to Events and Formats for the 2024-25 Tournament Season" (Jul 2024) | [Link](https://www.usafencing.org/news/2024/july/19/take-note-of-these-updates-to-events-and-formats-for-the-202425-tournament-season) |
| S7 | USA Fencing: "Event Combinations Announced for 2023-24 NACs and Championships" (May 2023) | [Link](https://www.usafencing.org/news/2023/may/31/event-combinations-announced-for-202324-usa-fencing-nacs-and-championships) |
| S8 | USA Fencing Athlete Handbook 2024-25 | [PDF](https://static1.squarespace.com/static/63d04398a7662e295f7c993a/t/6706d6a4b3f88e7f6a2a2467/1728501417355/USA_Fencing_Athlete_Handbook_2024-25.pdf) — Note: where Ops Manual and Handbook conflict, Handbook prevails |
| S9 | Academy of Fencing Masters: "How to Make USA Fencing National Events Work for Everyone" | [Link](https://academyoffencingmasters.com/blog/how-to-make-usa-fencing-national-events-work-for-everyone/) |
| S10 | Fencing Time tournament software documentation | [Link](https://www.fencingtime.com/Home/VerHistory) |

### A.2 Critical Findings Requiring PRD Changes

**A.2.1 — Weapon Scoping (P0) — RESOLVED**
Crossover penalties are now weapon-scoped. `crossover_penalty()` in Section 4.1 checks weapon: same-weapon pairs use the penalty graph; cross-weapon pairs return 0.0. Group 1 mandatory pairs (Div1/Junior/Cadet, adjacent age groups) are INFINITY for same-weapon. See `GROUP_1_MANDATORY` set in Section 4.1.

**A.2.2 — Time-System Mismatch in LATEST_START Check (P0) — RESOLVED**
Added `LATEST_START_OFFSET = 480` derived constant. Section 11.1 now uses `DAY_START(day) + LATEST_START_OFFSET`.

**A.2.3 — DIV1↔DIV1A Indirect Penalty Not Producible (P0) — RESOLVED**
Added `DIV1: { DIV1A: 0.3 }` as a direct edge in CROSSOVER_GRAPH. Table entry updated from "Indirect" to "Direct".

**A.2.4 — DE Bracket=32 Phase Boundary (P0) — RESOLVED**
Changed phase applicability text to "bracket > 32" (formula was already correct).

**A.2.5 — Veteran Category Expansion (P1) — RESOLVED**
Added `vet_age_group` field (VET40/50/60/70/80) to COMPETITION struct (Section 2.4). Used for video replay defaults (Section 19). Full category expansion deferred to v6.

**A.2.6 — Video Replay Category Defaults (P1) — RESOLVED**
Added DEFAULT_VIDEO_BY_CATEGORY table in Section 19 with `default_video_policy()` and `video_guaranteed_round()` functions. Encodes Ops Manual thresholds per category and vet age group.

**A.2.7 — Pool Duration Source — RESOLVED**
Comment added to `pool_round_duration_table` in Section 2.5 documenting that FOIL/EPEE differentiation is based on empirical observation, not Ops Manual timing.

**A.2.8 — Community-Validated Scheduling Conflicts — RESOLVED**
Per S2, S3, S4: the April 2024 NAC saw Division 1 Men's Epee and Junior Team Men's Epee overlap. Now addressed: weapon-scoped crossover penalties make same-weapon Div1↔Junior an INFINITY hard block (Group 1 mandatory).

**A.2.9 — Internal Consistency Issues (P1)**
Additional issues found via automated consistency analysis (see `prd-review-research.md` Section 3 for full details):
- ~~3 functions called but never defined~~ — RESOLVED: defined in Sections 12.9, 12.10, 12.11
- ~~12 bottleneck cause codes never emitted~~ — RESOLVED: emit points added in Sections 11.1, 12.4, 12.9, 12.10, 13, 9.1
- ~~`use_single_pool_override` missing from struct~~ — RESOLVED: added to Section 2.4
- ~~Flight B strip over-allocation~~ — RESOLVED: Flight B now uses FLOOR(n_pools/2)
- ~~No bracket_size=2 entry~~ — RESOLVED: added `2:15` to all weapons in de_duration_table
- ~~Zero refs not hard-errored~~ — RESOLVED: hard validation error in Section 15
- ~~REQUIRED+SINGLE_BLOCK silently ignored~~ — RESOLVED: validation WARN in Section 15
- ~~INDIV_TEAM_MIN_GAP naming inconsistency~~ — RESOLVED: renamed to INDIV_TEAM_MIN_GAP_MINS everywhere

### A.3 Ops Manual Scheduling Criteria Coverage Matrix

| Ops Manual Criterion | Group | PRD Section | Status |
|---|---|---|---|
| Div1/Junior/Cadet not same day (per weapon) | 1-Mandatory | 4.1 GROUP_1_MANDATORY | ✅ INFINITY for same-weapon pairs |
| Adjacent age groups not same day (per weapon) | 1-Mandatory | 4.1 GROUP_1_MANDATORY | ✅ INFINITY for same-weapon pairs |
| Team/individual not same day (per weapon) | 1-Mandatory | 5 Penalty Weights | ✅ Ordering penalty + weapon-scoped crossover |
| First/last day shorter | 2-Desirable | 14 post_schedule_warnings | ✅ WARN if first/last day longer than middle days (4+ day events) |
| Balance ROW weapon and epee per day | 2-Desirable | 12.5 weapon_balance_penalty | ✅ 0.5 penalty for all-ROW or all-epee day |
| Rest day Junior↔Cadet (JO) | 2-Desirable | 12.8 rest_day_penalty | ✅ 1.5 penalty for consecutive days without rest day |
| Rest day Junior↔Div1 | 2-Desirable | 12.8 rest_day_penalty | ✅ 1.5 penalty for consecutive days without rest day |
| Adjacent age groups not widely separated | 2-Desirable | 6 Proximity | ✅ Proximity penalty for day_gap≥3 |
| Team after individual | 2-Desirable | 5 Penalty Weights | ✅ 8.0 penalty for wrong order |
| Y14/Cadet/Junior+team not same day | 2-Desirable | 4.1 Crossover Graph | ✅ Covered by weapon-scoped crossover |
| Vet↔Div1A not same day | 2-Desirable | 4.1 Crossover Graph | ✅ Weight 1.0 |
| Y10 early in day | 2-Desirable | 5 Penalty Weights | ✅ 0.3 penalty if Y10 not in first slot |
| Div2↔Div3 not same day | 2-Desirable | 4.1 Crossover Graph | ✅ Weight 1.0 |
| Same age/sex different weapons not same day | 3-If Possible | 12.6 cross_weapon_same_demographic_penalty | ✅ 0.2 soft penalty per pair |
| Smaller events on last day if ref shortage | 3-If Possible | 12.7 last_day_ref_shortage_penalty | ✅ 0.5 for large events on last day with low refs |

---

*END OF SPECIFICATION — v5.3*
