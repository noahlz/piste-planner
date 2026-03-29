# Engine Fixes D: Bin-Pack Capacity-Aware Day Assignment

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the capacity-naive day assignment scoring with a weighted bin-packing model that tracks strip-hour capacity per day, weights competitions by age category, and penalizes overfull days.

**Architecture:** Three tightly coupled tasks: (1) build the capacity estimation functions, (2) define age-category weights, (3) integrate both into `totalDayPenalty`. Each task is independently testable but they build on each other sequentially.

**Tech Stack:** TypeScript, Vitest, pure engine functions

**Prerequisite plans:** Plans A–C should be completed first. The new capacity scoring works alongside the newly-wired constraints (soft separations, ind/team hard blocks) and the simplified ref model (no fill-in).

---

### Task 1: Day capacity estimation function

**What & Why:** The current scheduler assigns events to days based purely on crossover penalties and separation constraints — it has no concept of whether a day is "full." A 4-day NAC with 80 strips has roughly 1,120 strip-hours per day (80 strips × 14 hours). A single 310-fencer Div 1 event might consume 200+ strip-hours between pools and DEs. The scheduler doesn't track this, so when 6 large events all have similar penalty profiles, it piles them onto the same day. The result: DE phases overrun the 14-hour day boundary, and the engine has to fail those events with ERROR bottlenecks. Real tournament directors intuitively balance day loads — they know you can't put all the 300-fencer events on Saturday. This task builds the measurement tool: functions that compute how many strip-hours (general and video) a competition will consume and how much capacity a day has remaining. This is the foundation for the bin-packing model in Tasks 2–3.

**Files:**
- Create: `src/engine/capacity.ts` — pure capacity estimation functions
- Test: `__tests__/engine/capacity.test.ts`

- [ ] **Step 1: Write failing tests**

Test cases for a `dayCapacity()` function:
1. Empty day (no events scheduled) → returns full capacity (e.g., 80 strips × 14 hours = 1120 strip-hours).
2. Day with one large event consuming 40 strips for 4 hours → 160 strip-hours consumed, 960 remaining.
3. Day with multiple events → sums their strip-hour consumption correctly.
4. Video-strip capacity: separate budget tracking for video strips vs general strips.

Also test an `estimateCompetitionStripHours()` function:
1. 200-fencer event with 29 pools, weapon=EPEE → computes pool strip-hours (29 strips × 2h pool duration) + DE strip-hours.
2. Team event with 30 fencers → much smaller strip-hour footprint.

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Implement `capacity.ts`**

Two functions:

`estimateCompetitionStripHours(competition, config)`:
- Compute pool strip-hours: `n_pools × weightedPoolDuration / 60` (convert mins to hours)
- Compute DE strip-hours: based on `de_mode` and bracket size — `strips_allocated × deDuration / 60`
- For `STAGED_DE_BLOCKS`: also compute video-strip-hours for R16 + finals phases
- Return `{ total_strip_hours, video_strip_hours }`

`dayConsumedCapacity(day, state, allCompetitions, config)`:
- Sum `estimateCompetitionStripHours` for all competitions assigned to `day` in `state.schedule`
- Return `{ strip_hours_consumed, video_strip_hours_consumed }`

`dayRemainingCapacity(day, state, allCompetitions, config)`:
- Total capacity: `strips_total × DAY_LENGTH_MINS / 60`
- Video capacity: `video_strips_total × DAY_LENGTH_MINS / 60`
- Return `{ strip_hours_remaining, video_strip_hours_remaining }` (total minus consumed)

- [ ] **Step 4: Run tests to verify pass**

- [ ] **Step 5: Commit**

---

### Task 2: Age-category start-time weights

**What & Why:** Not all events consume a day equally. A 310-fencer Div 1 Men's Epee event with staged video DEs is a monster that anchors an entire day — it must start at 8 AM and will run all the way to evening. A 40-fencer Vet 60 event is comparatively lightweight and flexible. Beyond raw size, age category determines when events can realistically start. Y10 (10-and-under) events start first thing in the morning because young fencers tire quickly and parents need to leave at reasonable hours. Div 1 events also start early because they're the longest. Veteran 40 and 50 can start in early slots, but Veteran Combined (which includes 60/70 athletes), 60, 70, and 80 events should start later — some veteran fencers take medication in the morning and need time for the effects to wear off before competing. Div 1A, Div 2, and Div 3 events can also start early despite being lighter-weight events. The current scheduler has only a small Y10-first-slot heuristic. This task defines a proper weight system: each category gets a scheduling weight (how "heavy" it is in the bin-packing sense) and an earliest-start-offset (how much later than day-start it should begin). These weights let the capacity model treat a Div 1 event as 1.5× its raw strip-hours and a Vet Combined event as 0.6× — reflecting the real operational impact on a tournament day.

**Files:**
- Modify: `src/engine/constants.ts` — add `CATEGORY_START_PREFERENCE` and `CATEGORY_WEIGHT_MODIFIER`
- Modify: `src/engine/capacity.ts` — add weighted capacity function
- Test: `__tests__/engine/capacity.test.ts`

- [ ] **Step 1: Define constants and write failing tests**

Add to `constants.ts`:

`CATEGORY_START_PREFERENCE`: maps Category → `{ earliest_start_offset: number, weight: number }`:
- Y10: `{ earliest_start_offset: 0, weight: 1.2 }` — starts at day start, heavy (many young fencers)
- DIV1: `{ earliest_start_offset: 0, weight: 1.5 }` — starts at day start, heaviest (large fields, video DE)
- JUNIOR: `{ earliest_start_offset: 0, weight: 1.3 }` — early start, heavy (video DE)
- CADET: `{ earliest_start_offset: 0, weight: 1.3 }` — early start, heavy (video DE)
- Y12, Y14: `{ earliest_start_offset: 0, weight: 1.0 }` — normal weight, early start
- VET 40/50: `{ earliest_start_offset: 0, weight: 0.8 }` — can start early, lighter weight
- VET Combined/60/70/80: `{ earliest_start_offset: 120, weight: 0.6 }` — 2h offset (combined includes 60/70 athletes; 60+ need medication timing), lightest
- DIV1A, DIV2, DIV3: `{ earliest_start_offset: 0, weight: 0.7 }` — can start early, lighter weight

Write tests:
1. `weightedStripHours(competition, config)` returns `estimateCompetitionStripHours * weight` for the category.
2. Y10 event with 80 fencers (12 pools) has weight 1.2 → 20% heavier in bin-packing.
3. VET Combined event with 40 fencers (6 pools) has weight 0.6 → 40% lighter in bin-packing.
4. VET 40 event with 40 fencers has weight 0.8 → no start offset, lighter weight.
5. DIV1 event with 310 fencers has weight 1.5 → 50% heavier (large field + video serialization).
6. DIV2 event with 100 fencers has weight 0.7, offset 0 → can start early, lighter weight.

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Implement**

Add `CATEGORY_START_PREFERENCE` to `constants.ts`. Handle VetAgeGroup lookups (VET60/VET70 are specific vet age groups within Category.VETERAN).

Add to `capacity.ts`:
- `categoryWeight(competition)`: looks up competition's category (and vet_age_group for veterans) in `CATEGORY_START_PREFERENCE`, returns weight.
- `weightedStripHours(competition, config)`: returns `estimateCompetitionStripHours(competition, config).total_strip_hours * categoryWeight(competition)`.

- [ ] **Step 4: Run tests to verify pass**

- [ ] **Step 5: Commit**

---

### Task 3: Integrate capacity scoring into `totalDayPenalty`

**What & Why:** This is where everything comes together. Tasks 1 and 2 built the measurement tools — now we plug them into the actual day-assignment decision. Today, `totalDayPenalty` evaluates a day based on crossover conflicts, proximity preferences, and a handful of heuristics (early-start patterns, weapon balance, ref shortages). It has no notion of "this day is already 85% full." The result: the scheduler treats a nearly-empty Monday and a packed-to-the-gills Saturday as equally attractive if they have the same crossover profile. By adding a capacity penalty that ramps up as a day fills — gently at first (60% full), then steeply (80%+), then strongly discouraging (95%+) — the scheduler will naturally spread events across days the way a human tournament director would. The video-strip budget gets its own penalty track because video strips are a scarce, serialized resource: each staged-DE event monopolizes the video strips for its R16 and finals, so stacking too many video-dependent events on one day creates a scheduling bottleneck that can't be fixed with more general strips. This should directly reduce the ERROR bottleneck count in our integration tests — events that currently fail because their DEs overrun a packed day will instead land on a day with room to run.

**Files:**
- Modify: `src/engine/dayAssignment.ts` — add capacity penalty to `totalDayPenalty()`
- Modify: `src/engine/dayAssignment.ts` — import capacity functions
- Test: `__tests__/engine/dayAssignment.test.ts`

- [ ] **Step 1: Write failing tests**

Test cases:
1. Day with 80% weighted capacity consumed → `totalDayPenalty` returns higher penalty than day at 20%.
2. Day with 3 staged-DE events already assigned → video-strip penalty applied.
3. Two empty days: a DIV1 event (weight 1.5, 310 fencers) vs a VET event (weight 0.6, 40 fencers) — the larger weighted event should produce a larger capacity "footprint" and the penalty should scale accordingly.
4. Day near full: adding one more large event pushes weighted capacity past threshold → steep penalty (exponential or cliff).

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Implement capacity penalty**

In `totalDayPenalty()`, add two new penalty components (after existing penalties, before return):

**General capacity penalty:**
- Compute `dayRemainingCapacity(day, state, allCompetitions, config)`
- Compute `weightedStripHours(competition, config)` for the candidate
- Compute `fillRatio = (consumed + candidate) / total_capacity`
- Apply penalty curve:
  - fillRatio < 0.6 → 0 penalty (plenty of room)
  - 0.6–0.8 → linear ramp from 0 to 3.0
  - 0.8–0.95 → steeper ramp from 3.0 to 10.0
  - > 0.95 → 20.0 (strongly discourage, but not Infinity — the engine can still override at higher relaxation levels)

**Video-strip capacity penalty** (only for events with STAGED_DE_BLOCKS):

Video strips are shared between events when capacity allows — two events can overlap on video strips as long as there are enough strips for both at the same time. Staged DE phases naturally release strips as rounds progress (R16 needs 8 strips, R8 needs 4, QF needs 2, finals needs 1), so later rounds free up strips for other events. The engine already handles this correctly at the strip-scheduling level via per-strip `strip_free_at` tracking.

For the day-assignment penalty, estimate **peak video strip demand** rather than counting events:
- For each staged-DE event already on this day, compute its video strip demand profile over time (R16 strips × R16 duration, R8 strips × R8 duration, etc.)
- Estimate the candidate event's video strip demand profile
- Find the peak concurrent video strip demand if the candidate were added
- If peak demand > `video_strips_total`: penalty 15.0 (guaranteed contention — events will serialize waiting for strips)
- If peak demand > 0.7 × `video_strips_total`: penalty 5.0 (tight — small scheduling shifts could cause contention)
- If peak demand ≤ 0.7 × `video_strips_total`: no video penalty (plenty of room for overlap)

- [ ] **Step 4: Run dayAssignment tests to verify pass**

- [ ] **Step 5: Run integration tests**

Run: `timeout 120 pnpm --silent vitest run __tests__/engine/integration.test.ts > ./tmp/test.log 2>&1`

Key expectation: fewer ERROR bottlenecks than before, because events are now spread across days more evenly. If error counts change, update integration test assertions if needed (they check `scheduled + errors = total`, which should still hold).

- [ ] **Step 6: Run full test suite for regressions**

Run: `timeout 120 pnpm --silent test > ./tmp/test.log 2>&1`

- [ ] **Step 7: Commit**

---

## Post-Plan D

Update METHODOLOGY.md with the new bin-pack capacity model:
- Add a new section describing the capacity-aware day assignment model:
  - Days are bins with finite strip-hour capacity (strips × day length)
  - Video-strip hours are tracked as a separate budget
  - Each competition's "weight" in the bin depends on both raw strip-hours and an age-category weight modifier
  - Document the category weight table and rationale:
    - DIV1 (1.5), JUNIOR/CADET (1.3), Y10 (1.2) — heaviest, early start
    - Y12/Y14 (1.0) — baseline, early start
    - VET 40/50 (0.8) — lighter, can start early
    - VET Combined/60/70/80 (0.6) — lightest, 2h start offset (medication timing for older athletes)
    - DIV1A/DIV2/DIV3 (0.7) — lighter, can start early
  - Document the capacity penalty curve (thresholds at 60%, 80%, 95%)
  - Document the cascading video strip release model: staged DE phases release strips as rounds progress (R16→R8→QF→Finals), freed strips become available to other events. Multiple events can overlap on video strips when total concurrent demand fits within `video_strips_total`. Update or replace the existing "Correct behavior: Staged DE serializes video strip usage" note with the full model
- Move "Limitation: Day assignment is penalty-driven, not capacity-aware" from "Known Engine Limitations" to "Resolved" section.
- Update integration test header comments — remove limitation notes that no longer apply.
- Run full integration suite — verify all 7 scenarios pass and compare ERROR bottleneck counts to pre-fix baseline.
