# Piste Planner Engine — Execution Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the scheduling engine for a USA Fencing tournament planner — pure TypeScript, no UI, fully testable in isolation.

**Architecture:** Bottom-up layers. Each layer depends only on layers above it. Engine modules are pure functions (except `resources.ts` which manages mutable `GlobalState`). TDD for all algorithmic logic.

**Tech Stack:** Vite, React 19, TypeScript, Zustand, Tailwind CSS, Vitest, pnpm

**References:**
- Design spec: `.claude/plans/2026-03-25-piste-planner-design.md`
- Strategic plan: `.claude/plans/2026-03-25-engine-implementation-plan.md`
- PRD (v6.0): `docs/plans/piste-planner-prd.md`

---

## Task 0: Project Scaffold

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `eslint.config.js`, `.prettierrc`, `tailwind.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/index.css`
- Create: `.claude/hooks/PostToolUse.sh` (Prettier + ESLint auto-fix hook)
- Create: `__tests__/engine/smoke.test.ts`

- [ ] **Step 0.1: Scaffold Vite project**

Run: `pnpm create vite . --template react-ts`

Accept overwrite prompts for existing files. This creates the base React + TypeScript project.

- [ ] **Step 0.2: Install dependencies**

Production: `tailwindcss`, `@tailwindcss/vite`, `zustand`

Dev: `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`, `@vitest/coverage-v8`, `eslint`, `@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`, `prettier`, `globals`

- [ ] **Step 0.3: Configure Vite + Vitest**

Edit `vite.config.ts`:
- Add Tailwind plugin
- Add Vitest config: jsdom environment, v8 coverage provider
- Coverage exclusions: `src/engine/types.ts`, `src/engine/constants.ts`

- [ ] **Step 0.4: Configure ESLint 9 flat config**

Create `eslint.config.js` with typescript-eslint and react-hooks plugins.

- [ ] **Step 0.5: Configure Prettier**

Create `.prettierrc` with sensible defaults (single quotes, trailing commas, 100 char width).

- [ ] **Step 0.6: Configure Tailwind**

Set up `src/index.css` with Tailwind directives. Custom theme palette per design spec Section 10 (warm off-white background, slate-blue borders, light blue accent).

- [ ] **Step 0.7: Create directory structure**

Create empty directories with `.gitkeep` files:
- `src/engine/`, `src/store/`, `src/components/wizard/`, `src/components/schedule/`, `src/components/common/`, `src/templates/`, `src/theme/`, `src/utils/`
- `__tests__/engine/`, `__tests__/components/`, `__tests__/store/`, `__tests__/utils/`

- [ ] **Step 0.8: Set up Claude hooks**

Create `.claude/hooks/PostToolUse.sh`: runs `pnpm exec prettier --write` and `pnpm exec eslint --fix` on changed `.ts`/`.tsx` files after edits.

- [ ] **Step 0.9: Add npm scripts**

Add to `package.json` scripts: `dev`, `build`, `test`, `test:coverage`, `lint`, `format`

- [ ] **Step 0.10: Write smoke test**

Create `__tests__/engine/smoke.test.ts` — a trivial test (e.g., `expect(1 + 1).toBe(2)`) to verify the test harness works.

- [ ] **Step 0.11: Verify scaffold**

Run: `pnpm test`, `pnpm lint`, `pnpm dev` (verify each succeeds)

- [ ] **Step 0.12: Commit**

```
git add -A && git commit -m "Scaffold Vite + React + TypeScript project with test harness"
```

---

## Task 1: Foundation — Types, Constants, Catalogue

**Files:**
- Create: `src/engine/types.ts`, `src/engine/constants.ts`, `src/engine/catalogue.ts`
- Create: `__tests__/engine/catalogue.test.ts`

### Task 1A: Types

- [ ] **Step 1A.1: Define all enums**

Create `src/engine/types.ts`. Define TypeScript enums for all PRD Section 2.1 enumerations:
- `Gender` (MEN, WOMEN)
- `Category` (Y8, Y10, Y12, Y14, CADET, JUNIOR, VETERAN, DIV1, DIV1A, DIV2, DIV3)
- `Weapon` (FOIL, EPEE, SABRE)
- `EventType` (INDIVIDUAL, TEAM)
- `RefPolicy` (ONE, TWO, AUTO)
- `DeMode` (SINGLE_BLOCK, STAGED_DE_BLOCKS)
- `DeStripRequirement` (HARD, IF_AVAILABLE)
- `VideoPolicy` (REQUIRED, BEST_EFFORT, FINALS_ONLY)
- `VetAgeGroup` (VET40, VET50, VET60, VET70, VET80, VET_COMBINED)
- `TournamentType` (NAC, RYC, RJCC, ROC, SYC, SJCC)
- `FencerCountType` (ESTIMATED, CAPPED)
- `PodCaptainOverride` (AUTO, DISABLED, FORCE_4)
- `CutMode` (DISABLED, PERCENTAGE, COUNT)
- `BottleneckCause` (all cause codes from PRD Section 2.9)
- `BottleneckSeverity` (ERROR, WARN, INFO)

- [ ] **Step 1A.2: Define all interfaces**

In the same file, define TypeScript interfaces for all PRD Section 2 data types:
- `Strip` (Section 2.2)
- `DayRefereeAvailability` (Section 2.3)
- `Competition` (Section 2.4 — all fields including organiser inputs, pool config, DE config, flighting)
- `TournamentConfig` (Section 2.5 — including time constants, duration tables, advanced settings)
- `FlightingGroup` (Section 2.6)
- `GlobalState` (Section 2.7 — strip_free_at, refs_in_use_by_day, schedule, bottlenecks)
- `ScheduleResult` (Section 2.8 — all pool, flight, cut, DE, diagnostics fields)
- `Bottleneck` (Section 2.9 — competition_id, phase, cause, severity, delay_mins, etc.)
- `PoolStructure` (n_pools, pool_sizes, pool_round_duration)
- `PoolDurationResult` (actual_duration, baseline, effective_parallelism, penalised, etc.)
- `RefResolution` (refs_per_pool, refs_needed, shortfall)
- `DeBlockDurations` (prelims_dur, r16_dur, finals_dur)
- `DayConfig` (day_start_time, day_end_time — for per-day time windows)
- `ValidationError` (field, message, severity)
- `AnalysisResult` (warnings, suggestions — return type of `initialAnalysis()`)

Note: Per design spec Section 4, the PRD's `DAY_START(d) = d * 840` formula assumes fixed 14-hour days. With configurable per-day windows, `TournamentConfig` should include a `dayConfigs: DayConfig[]` array, and `DAY_START(d)` / `DAY_END(d)` become functions that read per-day config. Implement helper functions `dayStart(d, config)` and `dayEnd(d, config)` in a shared utility (can live in `constants.ts` or a small `timeUtils.ts`).

- [ ] **Step 1A.3: Verify types compile**

Run: `pnpm exec tsc --noEmit`

- [ ] **Step 1A.4: Commit**

### Task 1B: Constants

- [ ] **Step 1B.1: Define all constants**

Create `src/engine/constants.ts`. Export all PRD Section 17 constants:
- Time constants: `DAY_START_MINS` (480), `DAY_END_MINS` (1320), `LATEST_START_MINS` (960), `LATEST_START_OFFSET` (480), `SLOT_MINS` (30), `DAY_LENGTH_MINS` (840), `ADMIN_GAP_MINS` (15), `FLIGHT_BUFFER_MINS` (15), `THRESHOLD_MINS` (10), `DE_REFS` (1), `DE_FINALS_MIN_MINS` (30)
- Advanced: `SAME_TIME_WINDOW_MINS` (30), `INDIV_TEAM_MIN_GAP_MINS` (120), `EARLY_START_THRESHOLD` (10), `MAX_RESCHEDULE_ATTEMPTS` (3), `MAX_FENCERS` (500), `MIN_FENCERS` (2)
- `BOUT_COUNTS` map: `{2:1, 3:3, 4:6, 5:10, 6:15, 7:21, 8:28, 9:36, 10:45}`
- `DEFAULT_POOL_ROUND_DURATION_TABLE`: `{EPEE:120, FOIL:90, SABRE:60}`
- `DEFAULT_DE_DURATION_TABLE`: per weapon × bracket size (PRD Section 2.5)
- `DEFAULT_CUT_BY_CATEGORY`: per PRD Section 18
- `DEFAULT_VIDEO_POLICY_BY_CATEGORY`: per PRD Section 19
- `CROSSOVER_GRAPH`: per PRD Section 4.1
- `GROUP_1_MANDATORY`: per PRD Section 4.1
- `PROXIMITY_GRAPH`: per PRD Section 6.1
- `PROXIMITY_PENALTY_WEIGHTS`: per PRD Section 6.2
- `REST_DAY_PAIRS`: per PRD Section 12.8

- [ ] **Step 1B.2: Verify constants compile**

Run: `pnpm exec tsc --noEmit`

- [ ] **Step 1B.3: Commit**

### Task 1C: Catalogue

- [ ] **Step 1C.1: Write catalogue tests**

Create `__tests__/engine/catalogue.test.ts`. Test cases:
- Catalogue has exactly 84 entries
- No duplicate IDs
- All 60 individual events present (10 categories × 3 weapons × 2 genders)
- All 24 team events present (CADET, JUNIOR, VETERAN, DIV1 × 3 weapons × 2 genders)
- No team events for Y8, Y10, Y12, Y14, DIV1A, DIV2, DIV3
- ID format matches PRD Section 3 (e.g., `Y10-M-FOIL-IND`, `CDT-W-EPEE-TEAM`)
- Each template references only valid catalogue IDs
- Each template has the expected competition count
- Blank template has zero selections

- [ ] **Step 1C.2: Run tests to verify they fail**

Run: `pnpm exec vitest run __tests__/engine/catalogue.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 1C.3: Implement catalogue**

Create `src/engine/catalogue.ts`:
- Export `CATALOGUE`: array of 84 competition identity records. Hand-author all entries following the ID format from PRD Section 3. Each entry has: `id`, `gender`, `category`, `weapon`, `event_type`, `vet_age_group` (null for non-veteran).
- Export `TEMPLATES`: object mapping template names to arrays of catalogue IDs. 9 templates per design spec Section 5 (NAC Youth, NAC Cadet/Junior, NAC Div1/Junior, NAC Vet/Div1/Junior, ROC Div1A/Vet, ROC Div1A/Div2/Vet, ROC Mega, RYC Weekend, RJCC Weekend) plus Blank.
- Export helper: `findCompetition(id)` — lookup by ID.

- [ ] **Step 1C.4: Run tests to verify they pass**

Run: `pnpm exec vitest run __tests__/engine/catalogue.test.ts`
Expected: PASS

- [ ] **Step 1C.5: Commit**

---

## Task 2: Competition Math — Pools, DE, Crossover

**Files:**
- Create: `src/engine/pools.ts`, `src/engine/de.ts`, `src/engine/crossover.ts`
- Create: `__tests__/engine/pools.test.ts`, `__tests__/engine/de.test.ts`, `__tests__/engine/crossover.test.ts`

### Task 2A: Pool Sizing & Duration

- [ ] **Step 2A.1: Write pool tests**

Create `__tests__/engine/pools.test.ts`. Test cases:

**`computePoolStructure()` — table-driven:**
- n=2 → 1 pool of 2
- n=5 → 1 pool of 5
- n=6 → 1 pool of 6
- n=7 → 1 pool of 7
- n=8 → 1 pool of 8 (default single pool)
- n=9 → 1 pool of 9 (default single pool)
- n=10 → 2 pools of 5
- n=10 with single_pool_override → 1 pool of 10
- n=12 → 2 pools of 6
- n=13 → 1×7 + 1×6
- n=24 → 4 pools of 6
- n=100 → 15 pools (verify 6+7 mix)
- n=500 → 72 pools (68×7 + 4×6)
- n=10 with override=false → 2×5 (not single pool)
- n=11 with override=true → still 1×6+1×5 (override only valid ≤10)

**`poolDurationForSize()` — per weapon:**
- EPEE, 6-person pool → 120 min
- EPEE, 5-person pool → 80 min
- EPEE, 7-person pool → 168 min
- FOIL, 6-person pool → 90 min
- SABRE, 6-person pool → 60 min

**`weightedPoolDuration()` — mixed pools:**
- 1×7 + 1×6, EPEE → average of 168 and 120 = 144

**`estimatePoolDuration()` — resource shortfalls:**
- n_pools=4, available_strips=4, available_refs=4, refs_per_pool=1 → baseline (no penalty)
- n_pools=4, available_strips=2 → ~2× baseline (batched)
- n_pools=4, available_refs=2, refs_per_pool=1 → ref-limited parallelism

**`computeDeFencerCount()` — cuts:**
- 100 fencers, PERCENTAGE 20% → 20
- 100 fencers, COUNT 50 → 50
- 100 fencers, DISABLED → 100
- 10 fencers, PERCENTAGE 10% → 2 (minimum enforced)
- TEAM event with any cut_mode → fencer_count unchanged

**`resolveRefsPerPool()`:**
- Policy ONE, 4 pools, 4 refs → refs_per_pool=1, no shortfall
- Policy TWO, 4 pools, 8 refs → refs_per_pool=2
- Policy TWO, 4 pools, 6 refs → fallback to 1, WARN
- Policy AUTO, 4 pools, 8 refs → refs_per_pool=2
- Policy AUTO, 4 pools, 5 refs → refs_per_pool=1, INFO

- [ ] **Step 2A.2: Run tests to verify they fail**

- [ ] **Step 2A.3: Implement pools.ts**

Create `src/engine/pools.ts`. Implement per PRD Section 7:
- `computePoolStructure(competition)` — PRD Section 7.1 POOL_TABLE lookup. For n≤5: single pool. For 6-9: single pool (or override for ≤10). For 10+: solve 6+7 mix using the formula: `n_pools = ceil(n/7)` if divisible, else `7a + 6b = n`.
- `poolDurationForSize(weapon, poolSize, config)` — PRD Section 7.2: `round(base * BOUT_COUNTS[poolSize] / 15)`
- `weightedPoolDuration(poolStructure, weapon, config)` — PRD Section 7.2: weighted average across mixed pool sizes
- `estimatePoolDuration(competition, poolStructure, availableStrips, availableRefs, refResolution)` — PRD Section 7.3: resource shortfall adjustment with double-duty compensation
- `computeDeFencerCount(competition)` — PRD Section 7.4: apply cut, enforce minimum 2
- `resolveRefsPerPool(competition, availableRefs, nPools)` — PRD Section 7.5: ref policy resolution with bottleneck reporting

- [ ] **Step 2A.4: Run tests to verify they pass**

- [ ] **Step 2A.5: Commit**

### Task 2B: DE Duration Estimation

- [ ] **Step 2B.1: Write DE tests**

Create `__tests__/engine/de.test.ts`. Test cases:

**`nextPowerOf2()` — table-driven:**
- 1→1, 2→2, 3→4, 5→8, 16→16, 17→32, 20→32, 33→64, 100→128, 256→256

**`computeBracketSize()`:**
- 100 entries, 20% cut → 20 promoted → bracket 32
- 64 entries, DISABLED → bracket 64
- 5 entries, DISABLED → bracket 8

**`dePhasesForBracket()`:**
- bracket 64 → [DE_PRELIMS, DE_ROUND_OF_16, DE_FINALS]
- bracket 32 → [DE_ROUND_OF_16, DE_FINALS]
- bracket 16 → [DE_ROUND_OF_16, DE_FINALS]
- bracket 8 → [DE_FINALS]
- bracket 4 → [DE_FINALS]

**`deBlockDurations()`:**
- bracket 64, total 120 min → verify prelims + r16 + finals sum to ~120, finals ≥ 30
- bracket 32, total 90 min → no prelims, r16 + finals sum to ~90
- bracket 8, total 45 min → finals only, ≥ 30

**`calculateDeDuration()`:**
- FOIL, bracket 32 → 90 (from default table)
- SABRE, bracket 16 → 45
- All weapon × bracket size combinations in default table return expected values

- [ ] **Step 2B.2: Run tests to verify they fail**

- [ ] **Step 2B.3: Implement de.ts**

Create `src/engine/de.ts`. Implement per PRD Sections 10.1–10.2:
- `nextPowerOf2(n)` — smallest power of 2 ≥ n
- `computeBracketSize(competition)` — `nextPowerOf2(computeDeFencerCount(competition))`
- `dePhasesForBracket(bracketSize)` — phase applicability rules
- `deBlockDurations(bracketSize, totalDeDuration)` — bout-proportional split with 30-min finals floor
- `calculateDeDuration(weapon, bracketSize, durationTable)` — lookup from table

- [ ] **Step 2B.4: Run tests to verify they pass**

- [ ] **Step 2B.5: Commit**

### Task 2C: Crossover & Proximity Penalties

- [ ] **Step 2C.1: Write crossover tests**

Create `__tests__/engine/crossover.test.ts`. Test cases:

**`buildPenaltyMatrix()`:**
- Matrix has entries for all direct pairs from CROSSOVER_GRAPH
- Symmetric: matrix[(A,B)] === matrix[(B,A)]
- Indirect pairs capped at 0.3 (e.g., Y8↔Y12 via Y10 = 0.3)
- No self-pairs

**`crossoverPenalty()` — table-driven from PRD Section 4.2:**
- Same category + gender + weapon → INFINITY
- Cross-gender (any) → 0.0
- Same gender, same weapon, Y10↔Y12 (Group 1) → INFINITY
- Same gender, same weapon, CADET↔DIV2 → 1.0
- Same gender, different weapon, Y10↔Y12 → 0.0
- Same gender, same weapon, VET↔DIV1 → 0.3
- Same gender, same weapon, Y14↔DIV1A → 0.6

**`proximityPenalty()`:**
- Same gender+weapon, DIV1↔JUNIOR, day_gap=1 → negative bonus (-0.4 × 1.0)
- Same gender+weapon, DIV1↔JUNIOR, day_gap=0 → 0.0 (same day handled elsewhere)
- Same gender+weapon, DIV1↔JUNIOR, day_gap=3 → positive penalty (0.5 × 1.0)
- Different gender → 0.0 regardless
- Different weapon → 0.0 regardless
- Non-proximity pair (e.g., DIV1↔Y10) → 0.0

**`getProximityWeight()`:**
- VET↔VET → 1.0
- JUNIOR↔CADET → 1.0
- VET↔DIV1A → 0.6
- DIV1↔Y10 → 0.0 (not in graph)

**`individualTeamProximityPenalty()`:**
- TEAM event, individual scheduled day before → -0.4 bonus
- TEAM event, individual scheduled same day → 0.0
- TEAM event, individual scheduled day after (team before ind) → 1.0 penalty
- INDIVIDUAL event → 0.0

- [ ] **Step 2C.2: Run tests to verify they fail**

- [ ] **Step 2C.3: Implement crossover.ts**

Create `src/engine/crossover.ts`. Implement per PRD Sections 4–6:
- `buildPenaltyMatrix(graph)` — direct + indirect (2-hop, capped at 0.3). Build once at import time.
- `crossoverPenalty(c1, c2)` — same cat+gender+weapon=∞, cross-gender=0, same-weapon Group 1=∞, same-weapon direct=weight, cross-weapon=0
- `getProximityWeight(cat1, cat2)` — lookup in PROXIMITY_GRAPH
- `proximityPenalty(competition, proposedDay, schedule)` — sum proximity weights × day-gap penalties for same gender+weapon pairs
- `individualTeamProximityPenalty(competition, proposedDay, schedule)` — team-after-individual bonus/penalty
- `findIndividualCounterpart(competition, schedule)` — find matching individual for a team event

- [ ] **Step 2C.4: Run tests to verify they pass**

- [ ] **Step 2C.5: Commit**

---

## Task 3: Resource Planning — Refs, Flighting, Resources

**Files:**
- Create: `src/engine/refs.ts`, `src/engine/flighting.ts`, `src/engine/resources.ts`
- Create: `__tests__/engine/refs.test.ts`, `__tests__/engine/flighting.test.ts`, `__tests__/engine/resources.test.ts`

### Task 3A: Referee Calculation

- [ ] **Step 3A.1: Write refs tests**

Create `__tests__/engine/refs.test.ts`. Test cases:

**`podCaptainsNeeded()`:**
- Override DISABLED → 0
- Override FORCE_4, 12 strips → 3
- AUTO, SINGLE_BLOCK, bracket ≤32, 8 strips → ceil(8/4) = 2
- AUTO, SINGLE_BLOCK, bracket 64, 16 strips → ceil(16/8) = 2
- AUTO, STAGED, DE_ROUND_OF_16 phase, 4 strips → ceil(4/4) = 1
- AUTO, STAGED, DE_FINALS phase, 8 strips → ceil(8/8) = 1

**`refsAvailableOnDay()`:**
- SABRE weapon → sabre_refs only
- FOIL weapon → foil_epee_refs + sabre_refs
- EPEE weapon → foil_epee_refs + sabre_refs

**`calculateOptimalRefs()`:**
- 3 foil + 3 epee competitions on day 0 → sum of peak concurrent foil/epee ref demand
- 2 sabre competitions on day 1 → sabre ref count reflects concurrent demand
- Test with known small config: verify optimal counts are reasonable

- [ ] **Step 3A.2: Run tests to verify they fail**

- [ ] **Step 3A.3: Implement refs.ts**

Create `src/engine/refs.ts`. Implement per PRD Section 8:
- `podCaptainsNeeded(competition, dePhase, deStrips, config)` — PRD Section 8.1 pod captain rules
- `refsAvailableOnDay(day, weapon, config)` — PRD Section 2.3
- `calculateOptimalRefs(competitions, config)` — PRD Section 8.1: simulate day schedule with infinite refs, find peak concurrent demand per weapon type per day

- [ ] **Step 3A.4: Run tests to verify they pass**

- [ ] **Step 3A.5: Commit**

### Task 3B: Flighting Groups

- [ ] **Step 3B.1: Write flighting tests**

Create `__tests__/engine/flighting.test.ts`. Test cases:

**`suggestFlightingGroups()`:**
- 2 competitions: 20 pools + 15 pools, 24 strips → suggest group (combined > strips, each fits alone)
- 2 competitions: 10 pools + 10 pools, 24 strips → no suggestion (combined fits)
- 2 competitions: 30 pools + 30 pools, 24 strips → no suggestion (neither fits alone)
- Tied pool counts → flag FLIGHTING_GROUP_MANUAL_NEEDED

**`calculateFlightedStrips()`:**
- 24 strips, priority needs 14 pools, flighted needs 12 pools → priority gets 14, flighted gets 10
- Verify strip split sums to strips_total

**`validateFlightingGroup()`:**
- Two flighted on same day → warning
- Flighted competition is not largest by pool count → FLIGHTING_GROUP_NOT_LARGEST warning
- Demographic conflict between grouped pair → warning with crossover score

- [ ] **Step 3B.2: Run tests to verify they fail**

- [ ] **Step 3B.3: Implement flighting.ts**

Create `src/engine/flighting.ts`. Implement per PRD Section 9:
- `suggestFlightingGroups(competitions, stripsTotal, dayAssignments)` — identify strip-deficit pairs
- `calculateFlightedStrips(priorityComp, flightedComp, stripsTotal)` — split strips
- `validateFlightingGroup(group, competitions, dayAssignments)` — constraint checks

- [ ] **Step 3B.4: Run tests to verify they pass**

- [ ] **Step 3B.5: Commit**

### Task 3C: Resource Allocation (GlobalState)

- [ ] **Step 3C.1: Write resources tests**

Create `__tests__/engine/resources.test.ts`. Test cases:

**`createGlobalState()`:**
- 24 strips → strip_free_at has 24 entries, all initialized to day 0 start

**`allocateStrips()` / `releaseStrips()`:**
- Allocate 4 strips at t=0 for 120 min → those 4 strips have free_at=120
- Release at t=120 → those strips free_at back to 120 (already set)
- Allocate then query → allocated strips not available until their free_at

**`findAvailableStrips()`:**
- 24 strips, 20 allocated → returns 4 available
- Video preference: non-video preferred for pools (returns non-video first)
- Video required: returns only video-capable strips
- Video required but none free → returns WAIT_UNTIL with earliest video free time

**`allocateRefs()` / `releaseRefs()`:**
- Allocate 3 foil/epee refs on day 0 → refs_in_use increases
- Release → refs_in_use decreases
- Sabre allocation with fill-in: shortfall filled from foil/epee pool, tracked separately

**`earliestResourceWindow()`:**
- Strips and refs all free → returns not_before time
- Strips busy until t=60 → returns t=60 (snapped to slot)
- Delay > THRESHOLD_MINS → produces STRIP_CONTENTION bottleneck
- Exceeds LATEST_START_OFFSET → returns NO_WINDOW

**`snapToSlot()`:**
- 0 → 0, 15 → 30, 30 → 30, 31 → 60, 45 → 60

- [ ] **Step 3C.2: Run tests to verify they fail**

- [ ] **Step 3C.3: Implement resources.ts**

Create `src/engine/resources.ts`. Implement per PRD Sections 10.3, 11:
- `createGlobalState(config)` — initialize strip_free_at, refs_in_use_by_day, empty schedule/bottlenecks
- `allocateStrips(state, stripIds, endTime)` — update strip_free_at
- `releaseStrips(state, stripIds, endTime)` — no-op if already past endTime
- `findAvailableStrips(state, count, atTime, videoPreference)` — video-aware strip selection per PRD Section 10.3 (selectStripsForPhase logic)
- `allocateRefs(state, day, weapon, count, startTime, endTime)` — update refs_in_use_by_day with release events
- `releaseRefs(state, day, weapon, count, endTime)` — decrement in-use counts
- `allocateRefsForSabre(refsNeeded, start, end, day, state, config)` — PRD Section 8.2 fill-in logic
- `earliestResourceWindow(stripsNeeded, refsNeeded, weapon, videoRequired, notBefore, day, state)` — PRD Section 11.1
- `snapToSlot(t)` — PRD Section 11.2: round up to next 30-min boundary

State is passed as a parameter — no global singletons.

- [ ] **Step 3C.4: Run tests to verify they pass**

- [ ] **Step 3C.5: Commit**

---

## Task 4: Scheduling — Day Assignment, Schedule One, Scheduler

**Files:**
- Create: `src/engine/dayAssignment.ts`, `src/engine/scheduleOne.ts`, `src/engine/scheduler.ts`
- Create: `__tests__/engine/dayAssignment.test.ts`, `__tests__/engine/scheduleOne.test.ts`, `__tests__/engine/scheduler.test.ts`

### Task 4A: Day Assignment

- [ ] **Step 4A.1: Write day assignment tests**

Create `__tests__/engine/dayAssignment.test.ts`. Test cases:

**`constraintScore()`:**
- Competition with many crossover conflicts → higher score
- Sabre competition with low sabre ref availability → higher score
- STAGED_DE + REQUIRED video → higher score

**`totalDayPenalty()` — PRD Section 12.4:**
- Same population same weapon on day → INFINITY
- Group 1 mandatory pair same weapon on day → INFINITY
- Cross-gender pair on day → 0.0
- High crossover same time (within 30 min) → 10.0
- Individual + team wrong order → 8.0
- Y10 not in first slot → 0.3

**`earlyStartPenalty()` — PRD Section 12.9:**
- Pattern A: two high-crossover comps both at 8AM same day → 2.0
- Pattern B: two high-crossover comps both at 8AM consecutive days → 5.0
- Pattern C: ind+team both 8AM consecutive days → 2.0

**`weaponBalancePenalty()`:**
- All ROW weapons on day → 0.5
- Mix of ROW and epee → 0.0

**`restDayPenalty()`:**
- JUNIOR↔CADET same weapon consecutive days → 1.5
- JUNIOR↔CADET same weapon, gap ≥ 2 → 0.0

**`assignDay()` — constraint relaxation:**
- Simple 3-comp, 2-day config → optimal day assignment
- Impossible at level 0 → relaxes to level 1, produces CONSTRAINT_RELAXED bottleneck
- All days impossible → throws SchedulingError

- [ ] **Step 4A.2: Run tests to verify they fail**

- [ ] **Step 4A.3: Implement dayAssignment.ts**

Create `src/engine/dayAssignment.ts`. Implement per PRD Section 12:
- `constraintScore(competition, allCompetitions, config)` — PRD Section 12.2
- `totalDayPenalty(competition, day, estimatedStart, state, level)` — PRD Section 12.4, calls earlyStartPenalty, weaponBalancePenalty, crossWeaponSameDemographicPenalty, lastDayRefShortagePenalty, restDayPenalty, proximityPenalty
- `earlyStartPenalty(competition, day, estimatedStart, state)` — PRD Section 12.9 (Patterns A, B, C)
- `weaponBalancePenalty(competition, day, state)` — PRD Section 12.5
- `crossWeaponSameDemographicPenalty(competition, day, state)` — PRD Section 12.6
- `lastDayRefShortagePenalty(competition, day, state, config)` — PRD Section 12.7
- `restDayPenalty(competition, day, state)` — PRD Section 12.8
- `assignDay(competition, poolInfo, state)` — PRD Section 12.3: try all days at each constraint level (0–3), pick lowest penalty
- `findEarlierSlotSameDay(competition, poolStructure, day, state)` — PRD Section 12.10

- [ ] **Step 4A.4: Run tests to verify they pass**

- [ ] **Step 4A.5: Commit**

### Task 4B: Schedule One Competition

- [ ] **Step 4B.1: Write scheduleOne tests**

Create `__tests__/engine/scheduleOne.test.ts`. Test cases:

**`scheduleCompetition()` — non-flighted:**
- Simple individual event, 24 fencers, 24 strips, plenty of refs → pool phase + admin gap + DE phase, all on same day
- Verify pool_start, pool_end, de_start, de_end populated
- Verify strips allocated and released at correct times

**`scheduleCompetition()` — flighted (standalone):**
- Large event (80 fencers), 12 strips, flighted=true → Flight A + buffer + Flight B + admin gap + DE
- Verify flight_a_start < flight_b_start
- Verify both flights on same day
- Flight B delayed → FLIGHT_B_DELAYED bottleneck

**`scheduleCompetition()` — flighting group:**
- Priority + flighted pair on same day → priority gets dedicated strips, flighted gets remainder
- Verify strip allocation matches flighting group split

**`scheduleCompetition()` — STAGED_DE_BLOCKS:**
- Bracket 64 → DE_PRELIMS + DE_ROUND_OF_16 + DE_FINALS
- Bracket 16 → DE_ROUND_OF_16 + DE_FINALS (no prelims)
- Video policy REQUIRED → video strips used for R16 and finals

**`scheduleCompetition()` — team bronze bout:**
- TEAM event → bronze bout simultaneous with gold on separate strip
- No free strip for bronze → DE_FINALS_BRONZE_NO_STRIP bottleneck

**`scheduleCompetition()` — deadline breach:**
- Competition that overruns day end → triggers find_earlier_slot_same_day
- Successful reschedule → DEADLINE_BREACH warning
- No valid slot → DEADLINE_BREACH_UNRESOLVABLE error

**`scheduleCompetition()` — individual+team sequencing:**
- Team event on same day as individual (constraint relaxation) → team delayed by INDIV_TEAM_MIN_GAP_MINS after individual ends

- [ ] **Step 4B.2: Run tests to verify they fail**

- [ ] **Step 4B.3: Implement scheduleOne.ts**

Create `src/engine/scheduleOne.ts`. Implement per PRD Section 13:
- `scheduleCompetition(competition, state, config)` — the full scheduling pipeline:
  1. Compute pool structure
  2. Assign day (calls dayAssignment)
  3. Enforce individual-before-team sequencing (same weapon)
  4. Resolve refs per pool
  5. Estimate pool duration
  6. Allocate pool resources (non-flighted, standalone flighted, or paired flighting group)
  7. Deadline check with reschedule retry (up to MAX_RESCHEDULE_ATTEMPTS)
  8. Admin gap
  9. Execute DE phase (SINGLE_BLOCK or STAGED_DE_BLOCKS per PRD Sections 10.4/10.5)
  10. Bronze bout for TEAM events
  11. Same-day validation
  12. Record ScheduleResult

- [ ] **Step 4B.4: Run tests to verify they pass**

- [ ] **Step 4B.5: Commit**

### Task 4C: Master Scheduler

- [ ] **Step 4C.1: Write scheduler tests**

Create `__tests__/engine/scheduler.test.ts`. Test cases:

**`scheduleAll()` — integration tests using templates:**
- NAC Youth (3 days, Y10/Y12/Y14/Cadet, all weapons, both genders): verify all events scheduled, no day overflow
- ROC Div1A/Vet (2 days): verify all events fit in 2 days
- RYC Weekend (2 days, Y10–Y14): verify all events scheduled

**`scheduleAll()` — constraint scenarios:**
- Intentionally constrained: 16 strips, many competitions → bottlenecks generated
- Zero video strips → no video bottlenecks (all BEST_EFFORT)
- Single day, 6 non-conflicting events → all fit on day 0

**`sortWithPairs()`:**
- Priority competition always immediately before its flighted partner in sort order
- Most constrained competitions first (by constraint_score)
- Optional events after all mandatory

**`postScheduleWarnings()`:**
- 4-day tournament, first day longest → warning generated
- 3-day tournament → no first/last day warning (only applies to 4+)

- [ ] **Step 4C.2: Run tests to verify they fail**

- [ ] **Step 4C.3: Implement scheduler.ts**

Create `src/engine/scheduler.ts`. Implement per PRD Section 14:
- `scheduleAll(competitions, config)` — master orchestrator: create GlobalState, validate, sort competitions (sortWithPairs), schedule each, return results + bottlenecks
- `sortWithPairs(competitions)` — sort by constraint_score descending, keep priority before flighted partner
- `postScheduleWarnings(schedule, config)` — PRD Section 14: first/last day length warnings for 4+ day events

- [ ] **Step 4C.4: Run tests to verify they pass**

- [ ] **Step 4C.5: Commit**

---

## Task 5: Validation & Analysis

**Files:**
- Create: `src/engine/validation.ts`, `src/engine/analysis.ts`
- Create: `__tests__/engine/validation.test.ts`, `__tests__/engine/analysis.test.ts`

### Task 5A: Pre-Flight Validation

- [ ] **Step 5A.1: Write validation tests**

Create `__tests__/engine/validation.test.ts`. Test cases (one per hard error condition):

- Missing fencer count → error
- Fencer count < 2 → error
- Fencer count > 500 → error
- Strip count = 0 → error
- Strip count not divisible by 4 → error (note: verify this is actually required by PRD — strip IDs are letter+digit where digit is 1-4, implying pods of 4)
- days_available < 2 or > 4 → error
- Duplicate competition IDs → error
- Team event without matching individual → error
- CAPPED fencer count on regional qualifier (RYC, RJCC, ROC, SYC, SJCC) → error
- Team event with cut_mode ≠ DISABLED → error
- cut_mode PERCENTAGE with value ≤ 0 or > 100 → error
- cut_mode COUNT with value > fencer_count → error
- Cut produces < 2 promoted → error
- DE duration not in table for weapon × bracket → error
- REQUIRED video policy with SINGLE_BLOCK mode → warning (dead config)
- STAGED_DE_BLOCKS + REQUIRED + video_strips < de_round_of_16_strips → error
- Same population individuals exceed days_available → error
- Individual+team same-day duration exceeds DAY_LENGTH_MINS → error
- Flighting group strips exceed strips_total → error
- Valid config → no errors returned

- [ ] **Step 5A.2: Run tests to verify they fail**

- [ ] **Step 5A.3: Implement validation.ts**

Create `src/engine/validation.ts`. Implement per PRD Section 15:
- `validateConfig(config, competitions)` — returns array of validation errors (empty = valid). Checks all conditions listed above.
- `validateSameDayCompletion(competition, config)` — PRD Section 15: worst-case pool + admin gap + DE duration must fit in DAY_LENGTH_MINS

- [ ] **Step 5A.4: Run tests to verify they pass**

- [ ] **Step 5A.5: Commit**

### Task 5B: Initial Analysis

- [ ] **Step 5B.1: Write analysis tests**

Create `__tests__/engine/analysis.test.ts`. Test cases:

**`initialAnalysis()` — Pass 1 (strip deficit):**
- Competition with 30 pools, 24 strips → strip deficit warning + flighting suggestion
- Competition with 10 pools, 24 strips → no warning

**`initialAnalysis()` — Pass 2 (flighting group suggestions):**
- Two competitions: 14 + 12 pools, 24 strips → flighting group suggestion
- Tied pool counts → FLIGHTING_GROUP_MANUAL_NEEDED

**`initialAnalysis()` — Pass 3 (one flighted per day):**
- Two flighted on estimated same day → warning

**`initialAnalysis()` — Pass 4 (video demand):**
- Peak concurrent video-required DEs = 3, video_strips = 2 → warning
- No video-required DEs → no warning

**`initialAnalysis()` — Pass 6 (cut summary):**
- Competition with PERCENTAGE 20%, 100 fencers → cut summary: 20 promoted, bracket 32

**`initialAnalysis()` — Pass 7 (gender equity):**
- Men's Foil capped at 128, Women's Foil capped at 64 → GENDER_EQUITY_CAP_VIOLATION
- Equal caps → no violation
- Regional qualifier with CAPPED → REGIONAL_QUALIFIER_CAPPED error

**`genderEquityAllowableDiff()`:**
- 3 pools → 0 (must be equal)
- 5 pools → 1
- 10 pools → 2
- 15 pools → 3

**Statelessness:**
- Call `initialAnalysis()` twice with same input → identical output

- [ ] **Step 5B.2: Run tests to verify they fail**

- [ ] **Step 5B.3: Implement analysis.ts**

Create `src/engine/analysis.ts`. Implement per PRD Section 9.1:
- `initialAnalysis(config, competitions, dayAssignments)` — stateless, all 7 passes:
  - Pass 1: strip deficit → flighting suggestions
  - Pass 2: flighting group suggestions for pairs
  - Pass 3: validate one flighted per day
  - Pass 4: video strip peak demand
  - Pass 5: flighting group video conflict
  - Pass 6: cut summary (informational)
  - Pass 7: gender equity cap validation
- `genderEquityAllowableDiff(largerPools)` — PRD Section 9.1
- `isRegionalQualifier(config)` — checks tournament_type

- [ ] **Step 5B.4: Run tests to verify they pass**

- [ ] **Step 5B.5: Commit**

---

## Post-Completion

After all tasks pass:

- [ ] **Run full test suite with coverage**

Run: `pnpm test:coverage`
Verify: `engine/` at 90%+ coverage (excluding types.ts, constants.ts)

- [ ] **Final commit**

```
git add -A && git commit -m "Complete engine implementation: all modules passing"
```

- [ ] **Plan UI implementation phase** (separate session)
