# Engine Fixes: Integration Issues & Capacity Planning

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all known engine limitations discovered during integration testing and add bin-pack capacity-aware day assignment with age-category start-time weights.

**Architecture:** Incremental fixes ordered from simplest (wire unused constants, return missing data) through moderate (validation, constant removal) to complex (bin-pack day assignment with capacity + video-strip budgeting + age-category weights). Each task is independently testable and committable. Later tasks build on earlier ones where noted.

**Tech Stack:** TypeScript, Vitest, pure engine functions (no UI except saber fill-in removal which touches store + component)

---

## Difficulty Tier 1: Straightforward Wiring (tasks 1–4)

These fix issues where constants/logic already exist but aren't connected.

### Task 1: Wire `SOFT_SEPARATION_PAIRS` into `totalDayPenalty`

**What & Why:** The USA Fencing Operations Manual says Div 1 and Cadet events of the same weapon and gender should not be on the same day except in rare cases, because fencers who compete in both categories face back-to-back exhaustion. (Div 1 Men's Foil and Cadet Women's Foil can run on the same day — the separation is per weapon+gender.) We already defined this as a soft penalty (5.0 for the DIV1↔CADET pair) in `SOFT_SEPARATION_PAIRS`, but the day-assignment engine never actually reads it. The scheduler currently places Div 1 and Cadet events of the same weapon+gender on the same day with no penalty at all. Wiring this in makes the scheduler strongly prefer separating these categories onto different days — while still allowing it under constraint relaxation if the tournament has no other option.

The constant exists in `constants.ts:240` with a 5.0 penalty for DIV1↔CADET but is never imported or used in `dayAssignment.ts`.

**Files:**
- Modify: `src/engine/dayAssignment.ts` — import and apply in `totalDayPenalty()`
- Test: `__tests__/engine/dayAssignment.test.ts`

- [ ] **Step 1: Write the failing test**

Add a test that schedules a DIV1 event, then scores a CADET event on the same day. Assert the penalty includes the 5.0 soft-separation contribution. Currently this returns 0 for the soft-separation component, so the test will fail.

- [ ] **Step 2: Run test to verify it fails**

Run: `timeout 120 pnpm --silent vitest run __tests__/engine/dayAssignment.test.ts > ./tmp/test.log 2>&1`
Expected: FAIL — no soft-separation penalty applied.

- [ ] **Step 3: Implement**

In `dayAssignment.ts`:
1. Import `SOFT_SEPARATION_PAIRS` from `./constants.ts`
2. In `totalDayPenalty()`, inside the per-scheduled-competition loop (after the crossover penalty block), add a check: for each `SOFT_SEPARATION_PAIRS` entry, if `competition.category` and `c2.category` match the pair (in either order) **and they share the same gender and weapon**, add `entry.penalty` to total. Only apply at level < 2 (same as soft crossover — these are soft constraints). Note: Div 1 Men's Foil and Cadet Women's Foil can coexist — the penalty only applies when weapon AND gender match.

- [ ] **Step 4: Run all dayAssignment tests to verify pass + no regressions**

Run: `timeout 120 pnpm --silent vitest run __tests__/engine/dayAssignment.test.ts > ./tmp/test.log 2>&1`
Expected: PASS

- [ ] **Step 5: Commit**

---

### Task 2: Wire `INDIV_TEAM_HARD_BLOCKS` into `totalDayPenalty`

**What & Why:** At real tournaments, certain individual and team events must never share a day. For example, Div 1 individual foil and Junior team foil can't run on the same day because the Junior team event draws heavily from the same fencer pool as Div 1 individual — fencers would have to choose between them, which isn't fair. Similarly, Veteran individual and Veteran team events of the same weapon must be on separate days. We already defined these pairs in `INDIV_TEAM_HARD_BLOCKS`, but the scheduler ignores the constant entirely. Without this, the B2 integration test (Nov 2025 NAC with Cadet teams) can't even assert individual/team separation. Wiring this in makes these hard blocks just like the existing same-population hard blocks — Infinity penalty at relaxation levels 0–2, only overridable at level 3 as a last resort.

**Files:**
- Modify: `src/engine/dayAssignment.ts` — import and apply in `totalDayPenalty()`
- Test: `__tests__/engine/dayAssignment.test.ts`

- [ ] **Step 1: Write the failing test**

Add a test that schedules a DIV1 individual event, then scores a JUNIOR team event (same weapon+gender) on the same day. Assert penalty is Infinity at level < 3. Currently returns a finite value, so the test will fail.

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement**

In `dayAssignment.ts`:
1. Import `INDIV_TEAM_HARD_BLOCKS` from `./constants.ts`
2. In `totalDayPenalty()`, after the existing hard-block check (the `crossoverPenalty === Infinity` check), add a second hard-block check: for each `INDIV_TEAM_HARD_BLOCKS` entry, if one competition matches `indivCategory` (INDIVIDUAL) and the other matches `teamCategory` (TEAM), same weapon+gender → return Infinity at level < 3.

- [ ] **Step 4: Run all dayAssignment tests to verify pass + no regressions**

- [ ] **Step 5: Run integration tests**

The B2 scenario has a TODO comment about `assertIndTeamSeparation` — enable it now that the constraint is wired in. If the engine produces errors (meaning it used level-3 relaxation), the assertion helper already skips the check, so this is safe.

Run: `timeout 120 pnpm --silent vitest run __tests__/engine/integration.test.ts > ./tmp/test.log 2>&1`

- [ ] **Step 6: Commit**

---

### Task 3: Wire `REGIONAL_CUT_OVERRIDES` into scheduling

**What & Why:** The USA Fencing Athlete Handbook specifies that regional qualifier tournaments (ROC, SYC, RJCC, SJCC) must advance all fencers from pools to DEs — no cuts allowed for Y14, Cadet, Junior, and Div 1 categories. This is because these tournaments serve as regional qualifying pathways, and cutting fencers before DEs would unfairly limit who can qualify. We defined `REGIONAL_CUT_OVERRIDES` with these rules, but the engine never applies them. Right now, if a user sets up an ROC tournament and forgets to disable cuts for Junior events, the scheduler will happily apply a 20% cut — producing an incorrect schedule with smaller DE brackets than the event should actually have. This means wrong duration estimates, wrong strip assignments, and a schedule that wouldn't match what actually happens on the tournament floor.

**Files:**
- Modify: `src/engine/scheduleOne.ts` or `src/store/buildConfig.ts` — apply overrides before scheduling
- Modify: `src/engine/validation.ts` — warn if regional tournament has custom cuts for override categories
- Test: `__tests__/engine/scheduleOne.test.ts` or `__tests__/engine/validation.test.ts`

**Design decision:** The override should be applied when building the config from the store (in `buildConfig.ts`), NOT inside the engine. The engine receives competitions with final cut values already set. The store layer is where tournament_type context lives. If a user explicitly sets a cut for a regional tournament, emit a WARN validation error but respect their choice.

- [ ] **Step 1: Write the failing test**

Test in `buildConfig.test.ts` (or a new test file): given a ROC tournament with a JUNIOR competition that has `cut_mode: PERCENTAGE, cut_value: 20`, assert that after building config the competition's cut is overridden to `DISABLED, 100`.

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement the override in buildConfig**

In `buildConfig.ts`: after building competitions from store state, if `tournament_type` is in `REGIONAL_QUALIFIER_TYPES`, iterate competitions and apply `REGIONAL_CUT_OVERRIDES` for matching categories (only if the user hasn't manually customized — or always override, treating the constant as authoritative).

- [ ] **Step 4: Add validation warning**

In `validation.ts`: if tournament_type is regional and a competition in an override category has a non-disabled cut, emit a WARN-severity error noting the override will be applied.

- [ ] **Step 5: Run tests to verify pass**

- [ ] **Step 6: Commit**

---

### Task 4: Return `constraint_relaxation_level` from `assignDay`

**What & Why:** When the scheduler can't find a valid day at full constraint strictness, it progressively relaxes constraints through 4 levels — from "respect all crossover and proximity rules" (level 0) up to "override even hard blocks" (level 3). The scheduler already does this correctly and even emits a warning bottleneck when relaxation occurs. But it throws away a critical piece of information: which level was actually used for each event. The `constraint_relaxation_level` field in the schedule result is hardcoded to 0. This matters because downstream consumers (the integration tests, the UI, future reporting) need to know whether an event was placed cleanly or was force-placed on a day that violates hard separation rules. Without this, our integration tests have to use a blunt heuristic — "if there are any errors, skip all hard-separation checks" — instead of checking per-event. Fixing this is a small plumbing change: make `assignDay` return both the day and the level it used.

**Files:**
- Modify: `src/engine/dayAssignment.ts` — change `assignDay()` return type to `{ day: number; level: number }`
- Modify: `src/engine/scheduleOne.ts` — destructure the return and store level in result
- Modify: `src/engine/types.ts` — add `DayAssignmentResult` type (or just use inline object)
- Test: `__tests__/engine/dayAssignment.test.ts`, `__tests__/engine/scheduleOne.test.ts`

- [ ] **Step 1: Write failing tests**

Two tests:
1. In `dayAssignment.test.ts`: test that `assignDay` returns `{ day, level }` where level > 0 when relaxation occurs (set up a scenario where level 0 has all-Infinity days).
2. In `scheduleOne.test.ts`: test that `scheduleCompetition` result has `constraint_relaxation_level > 0` when relaxation occurred.

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Implement**

1. Change `assignDay()` return from `number` to `{ day: number; level: ConstraintLevel }`.
2. Return `{ day: best.day, level }` instead of `best.day`.
3. In `scheduleCompetition()`: destructure `const { day, level } = assignDay(...)`, set `result.assigned_day = day` and `result.constraint_relaxation_level = level`.
4. Update any other callers of `assignDay` (check with grep).

- [ ] **Step 4: Run full test suite to verify pass + fix any broken call sites**

Run: `timeout 120 pnpm --silent test > ./tmp/test.log 2>&1`

- [ ] **Step 5: Update integration test helper**

In `integration.test.ts`, update `assertHardSeparations` to use `constraint_relaxation_level` from the schedule result instead of checking `hasErrors`:
- If `sr.constraint_relaxation_level >= 3`, skip the hard-separation check for that event (it knowingly overrode constraints).
- Remove the `hasErrors` parameter — check per-event instead of globally.

- [ ] **Step 6: Commit**

---

## Difficulty Tier 2: Moderate Removal/Addition (tasks 5–6)

### Task 5: Remove saber ref fill-in concept

**What & Why:** The engine currently has a feature that lets foil/epee-only referees substitute for 3-weapon referees on saber events when saber refs are in short supply. This concept is wrong — it doesn't reflect how real tournaments work. Saber bouts require referees trained in saber-specific rules and conventions (right-of-way, attack/parry timing). A foil/epee-only ref cannot officiate a saber bout. If a tournament doesn't have enough 3-weapon refs, that's a real staffing problem the tournament organizer needs to solve before the event — not something the scheduler should silently paper over. The fill-in feature creates false confidence: the schedule looks feasible, but on tournament day you'd have unqualified refs on saber strips. Removing this forces the scheduler to surface the actual problem as a validation error, giving organizers a clear signal to hire more 3-weapon refs.

**Files to modify (removal):**
- `src/engine/types.ts` — remove `allow_saber_ref_fillin` from `TournamentConfig`, `saber_fillin_used` from `CompetitionScheduleResult`, `SABER_REF_FILLIN` from `BottleneckCause`
- `src/engine/resources.ts` — remove `allocateRefsForSaber()`, inline simple saber-only allocation
- `src/engine/refs.ts` — remove any fill-in logic references
- `src/engine/scheduleOne.ts` — replace `allocateRefsForSaber()` calls with direct `allocateRefs()` for saber
- `src/store/store.ts` — remove `toggleSaberFillin` action, `allow_saber_ref_fillin` from `DayRefConfig`
- `src/store/buildConfig.ts` — remove fill-in flag from config building
- `src/components/sections/RefereeSetup.tsx` — remove fill-in checkbox UI
- Tests: `__tests__/engine/resources.test.ts`, `__tests__/engine/scheduleOne.test.ts`, `__tests__/store/store.test.ts`, `__tests__/components/WizardShell.test.tsx` — remove fill-in test cases

**Approach:** This is a "delete and fix compilation" task. Remove the type definitions first, then let TypeScript errors guide the remaining cleanup.

- [ ] **Step 1: Remove type definitions**

Remove `allow_saber_ref_fillin` from `TournamentConfig` and `DayRefConfig` (via store types). Remove `saber_fillin_used` from `CompetitionScheduleResult`. Remove `SABER_REF_FILLIN` from `BottleneckCause`.

- [ ] **Step 2: Fix engine compilation**

Work through TypeScript errors:
- In `resources.ts`: remove `allocateRefsForSaber()`. Where saber ref allocation is needed, call `allocateRefs()` directly with the saber ref count. If saber refs are insufficient, return `INSUFFICIENT` (which the caller handles as a scheduling failure).
- In `scheduleOne.ts`: replace `allocateRefsForSaber()` calls with direct saber ref allocation.
- In `refs.ts`: remove any fill-in references.

- [ ] **Step 3: Fix store compilation**

- Remove `toggleSaberFillin` from store.
- Remove `allow_saber_ref_fillin` from `DayRefConfig` and from `buildConfig.ts`.

- [ ] **Step 4: Fix UI compilation**

- Remove fill-in checkbox from `RefereeSetup.tsx`.

- [ ] **Step 5: Fix tests**

- Remove fill-in-specific test cases.
- Update test factories if they set `allow_saber_ref_fillin`.
- Ensure remaining saber-related tests pass with direct allocation.

- [ ] **Step 6: Run full test suite**

Run: `timeout 120 pnpm --silent test > ./tmp/test.log 2>&1`

- [ ] **Step 7: Commit**

---

### Task 6: Add resource precondition validation

**What & Why:** When the scheduler fails to place an event, it currently throws a generic "no valid day found" error. This is technically accurate but useless to a tournament organizer trying to figure out what went wrong. The real cause is often simple: not enough strips or refs configured for the event's pool round. For example, a 210-fencer event needs 30 pools running simultaneously, so it needs at least 30 strips and 30 refs — but the organizer only configured 24. The scheduler grinds through all days, fails on every one, and reports an opaque error. By validating resource preconditions upfront (before scheduling even starts), we can surface messages like "Men's Junior Epee requires 30 strips for pools but only 24 are configured" — giving the organizer an immediate, actionable fix instead of a cryptic failure.

**Files:**
- Modify: `src/engine/validation.ts` — add upfront strip/ref minimum checks
- Test: `__tests__/engine/validation.test.ts`

- [ ] **Step 1: Write failing tests**

Test cases:
1. A competition needs 10 strips for pools (ceil(70/7)=10 pools) but config has only 8 strips → ERROR: "Event X requires Y strips for pools but only Z total strips configured."
2. A saber event needs 15 saber refs (15 pools) but config has only 10 saber refs on a given day → ERROR: "Event X requires Y saber refs for pools but only Z configured."
3. Config has adequate resources → no validation errors from these checks.

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Implement upfront validation**

In `validateConfig()`, after existing competition-level checks:
1. For each competition, compute `n_pools = computePoolStructure(fencer_count).n_pools`.
2. Check `n_pools <= config.strips_total` — if not, emit ERROR.
3. Check ref availability: for saber events, check that at least one day has `saber_refs >= n_pools`. For foil/epee, check `foil_epee_refs >= n_pools` on at least one day.
4. If `de_mode === STAGED_DE_BLOCKS && de_video_policy === REQUIRED`, check `video_strips_total >= de_round_of_16_strips` (this check already exists partially — extend it).

- [ ] **Step 4: Run tests to verify pass**

- [ ] **Step 5: Commit**

---

## Difficulty Tier 3: Complex — Bin-Pack Capacity-Aware Day Assignment (tasks 7–9)

This replaces the capacity-naive penalty scoring with a weighted bin-packing model. Split into three sub-tasks: capacity estimation, age-category weights, and integration into scoring.

### Task 7: Day capacity estimation function

**What & Why:** The current scheduler assigns events to days based purely on crossover penalties and separation constraints — it has no concept of whether a day is "full." A 4-day NAC with 80 strips has roughly 1,120 strip-hours per day (80 strips × 14 hours). A single 310-fencer Div 1 event might consume 200+ strip-hours between pools and DEs. The scheduler doesn't track this, so when 6 large events all have similar penalty profiles, it piles them onto the same day. The result: DE phases overrun the 14-hour day boundary, and the engine has to fail those events with ERROR bottlenecks. Real tournament directors intuitively balance day loads — they know you can't put all the 300-fencer events on Saturday. This task builds the measurement tool: functions that compute how many strip-hours (general and video) a competition will consume and how much capacity a day has remaining. This is the foundation for the bin-packing model in Tasks 8–9.

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

### Task 8: Age-category start-time weights

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

### Task 9: Integrate capacity scoring into `totalDayPenalty`

**What & Why:** This is where everything comes together. Tasks 7 and 8 built the measurement tools — now we plug them into the actual day-assignment decision. Today, `totalDayPenalty` evaluates a day based on crossover conflicts, proximity preferences, and a handful of heuristics (early-start patterns, weapon balance, ref shortages). It has no notion of "this day is already 85% full." The result: the scheduler treats a nearly-empty Monday and a packed-to-the-gills Saturday as equally attractive if they have the same crossover profile. By adding a capacity penalty that ramps up as a day fills — gently at first (60% full), then steeply (80%+), then strongly discouraging (95%+) — the scheduler will naturally spread events across days the way a human tournament director would. The video-strip budget gets its own penalty track because video strips are a scarce, serialized resource: each staged-DE event monopolizes the video strips for its R16 and finals, so stacking too many video-dependent events on one day creates a scheduling bottleneck that can't be fixed with more general strips. This should directly reduce the ERROR bottleneck count in our integration tests — events that currently fail because their DEs overrun a packed day will instead land on a day with room to run.

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
- Count staged-DE events already on this day
- Each additional staged-DE event adds serialized video time; estimate serialized hours
- If serialized video hours > 70% of day → penalty 5.0
- If > 90% → penalty 15.0

- [ ] **Step 4: Run dayAssignment tests to verify pass**

- [ ] **Step 5: Run integration tests**

Run: `timeout 120 pnpm --silent vitest run __tests__/engine/integration.test.ts > ./tmp/test.log 2>&1`

Key expectation: fewer ERROR bottlenecks than before, because events are now spread across days more evenly. If error counts change, update integration test assertions if needed (they check `scheduled + errors = total`, which should still hold).

- [ ] **Step 6: Run full test suite for regressions**

Run: `timeout 120 pnpm --silent test > ./tmp/test.log 2>&1`

- [ ] **Step 7: Commit**

---

## Post-Implementation

After all tasks are complete:

1. **Update METHODOLOGY.md "Known Engine Limitations and Open Bugs"** — Move resolved items to a "Resolved" section, noting which task fixed each.

2. **Enrich METHODOLOGY.md with new methodology introduced by this plan:**
   - **Soft separation (Task 1):** Document that soft-separation penalties apply per weapon+gender — e.g., Div 1 Men's Foil and Cadet Women's Foil can share a day; Div 1 Men's Foil and Cadet Men's Foil cannot (except under constraint relaxation). Add this to the separation rules section.
   - **Individual/team hard blocks (Task 2):** Document which ind/team category pairs are hard-blocked (Vet ind↔Vet team, Div1 ind↔Jr team, Jr ind↔Div1 team) and that the block requires same weapon+gender. Add to separation rules section.
   - **Bin-pack capacity model (Tasks 7–9):** Add a new section describing the capacity-aware day assignment model:
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
     - Document video-strip serialization as correct behavior (block allocation, not dynamic sharing) — update or replace the existing "Correct behavior" note with the full model
   - **Resource precondition validation (Task 6):** Document the upfront validation checks (strips ≥ max pools, refs ≥ pools per weapon type) and the actionable error messages they produce. Add to the validation/preconditions section.

3. **Update integration test header comments** — Remove limitation notes that no longer apply.

4. **Run full integration suite** — Verify all 7 scenarios pass and compare ERROR bottleneck counts to pre-fix baseline.
