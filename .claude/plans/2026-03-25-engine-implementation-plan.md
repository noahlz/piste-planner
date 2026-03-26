# Piste Planner — Engine Implementation Plan

**Date:** 2026-03-25
**Status:** Draft
**Scope:** Project scaffold + scheduling engine (Steps 0–5). UI deferred to a separate plan.
**Design Spec:** `.claude/plans/2026-03-25-piste-planner-design.md`
**PRD Reference:** `docs/plans/piste-planner-prd.md` (v6.0)

---

## Approach

- **Engine-first:** All engine modules built and tested before any UI work.
- **Bottom-up layers:** Modules grouped by dependency — each layer depends only on layers above it.
- **TDD for engine logic:** Failing test first, then implementation, for all modules with algorithmic logic.
- **Hand-authored catalogue:** All 84 competitions and 9 templates defined as typed arrays, not generated.

---

## Step 0: Scaffold

**Goal:** Working Vite + React + TypeScript project with test harness, linting, formatting, and Claude hooks.

**Actions:**

1. `pnpm create vite . --template react-ts` (scaffold in existing project directory)
2. Install production deps: `tailwindcss`, `@tailwindcss/vite`, `zustand`
3. Install dev deps: `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`, `@vitest/coverage-v8`, `eslint`, `@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`, `prettier`, `globals`
4. Configure `vite.config.ts` with Tailwind plugin
5. Configure `vitest` in `vite.config.ts` (jsdom environment, coverage with v8 provider, coverage exclusions for `src/engine/types.ts` and `src/engine/constants.ts`)
6. Configure ESLint 9 flat config (`eslint.config.js`) with typescript-eslint and react-hooks plugin
7. Configure Prettier (`.prettierrc`)
8. Configure Tailwind with custom theme palette per design spec Section 10
9. Create empty directory structure:
   - `src/engine/`
   - `src/store/`
   - `src/components/wizard/`
   - `src/components/schedule/`
   - `src/components/common/`
   - `src/templates/`
   - `src/theme/`
   - `src/utils/`
   - `__tests__/engine/`
   - `__tests__/components/`
   - `__tests__/store/`
   - `__tests__/utils/`
10. Set up `.claude/hooks/` post-edit hook: run `pnpm exec prettier --write` and `pnpm exec eslint --fix` on changed files
11. Add a trivial test (`__tests__/engine/smoke.test.ts`) to verify test harness works
12. Add npm scripts: `dev`, `build`, `test`, `test:coverage`, `lint`, `format`

**Exit criteria:**

- `pnpm dev` starts the dev server
- `pnpm test` runs and passes (trivial smoke test)
- `pnpm lint` passes
- Claude hooks auto-format on file edit

---

## Step 1: Foundation

**Goal:** All enums, data types, constants, and the full 84-competition catalogue — the shared vocabulary every engine module imports.

**Modules:**

### `src/engine/types.ts`

All PRD enums and interfaces:

- **Enums:** `Gender`, `Category`, `Weapon`, `EventType`, `RefPolicy`, `DeMode`, `VideoPolicy`, `VetAgeGroup`, `TournamentType`, `FencerCountType`, `PodCaptainOverride`, `CutMode`, `DeStripRequirement`, `WeightScale`
- **Interfaces:** `Strip`, `Competition`, `TournamentConfig`, `DayRefereeAvailability`, `FlightingGroup`, `GlobalState`, `ScheduleResult`, `Bottleneck`

No logic — compile-time only. Excluded from coverage.

### `src/engine/constants.ts`

PRD Section 17 constants and default tables:

- Time constants: `DAY_START_MINS`, `DAY_END_MINS`, `LATEST_START_MINS`, `LATEST_START_OFFSET`, `SLOT_MINS`, `DAY_LENGTH_MINS`, `ADMIN_GAP_MINS`, `FLIGHT_BUFFER_MINS`, `THRESHOLD_MINS`, `DE_REFS`, `DE_FINALS_MIN_MINS`
- Advanced constants: `SAME_TIME_WINDOW_MINS`, `INDIV_TEAM_MIN_GAP_MINS`, `EARLY_START_THRESHOLD`, `MAX_RESCHEDULE_ATTEMPTS`
- Default duration tables: `DEFAULT_POOL_ROUND_DURATION_TABLE` (per weapon), `DEFAULT_DE_DURATION_TABLE` (per weapon × bracket size)
- Default per-category settings: `DEFAULT_CUT_MODE_BY_CATEGORY`, `DEFAULT_CUT_VALUE_BY_CATEGORY`, `DEFAULT_VIDEO_POLICY_BY_CATEGORY` (PRD Sections 18, 19)

Excluded from coverage.

### `src/engine/catalogue.ts`

- Hand-authored array of 84 `Competition` identity records (id, gender, weapon, category, event_type, vet_age_group). All valid gender × weapon × category × event_type combinations with correct exclusions (no Y8 teams, etc.).
- 9 template definitions (NAC Youth, NAC Cadet/Junior, NAC Div1/Junior, NAC Vet/Div1/Junior, ROC Div1A/Vet, ROC Div1A/Div2/Vet, ROC Mega, RYC Weekend, RJCC Weekend), each referencing a subset of catalogue IDs.
- Blank template (empty selection).

**Testing:**

- `catalogue.ts`: exactly 84 entries, no duplicate IDs, all expected gender/weapon/category/event_type combinations present, no unexpected ones. Each template references only valid catalogue IDs. Each template selects the expected count of competitions.

**Exit criteria:** All types compile. Catalogue and template tests green.

---

## Step 2: Competition Math

**Goal:** Pure functions for pool sizing, DE duration estimation, cut/promotion logic, and crossover penalty scoring. Each depends only on types/constants.

**Modules:**

### `src/engine/pools.ts` — PRD Section 7

- `calculate_pool_size(fencer_count)` — optimal pool count and size for a given fencer count
- `calculate_pool_rounds(pool_size)` — number of pool rounds given pool size
- `calculate_pool_duration(weapon, pool_count, refs_per_pool, duration_table)` — wall-clock estimate using duration table, pool count, and ref availability
- `calculate_promoted_fencers(fencer_count, cut_mode, cut_value)` — apply cut mode/value, enforce minimum 2
- `should_use_single_pool(fencer_count, override)` — single pool override logic for ≤10 fencers

### `src/engine/de.ts` — PRD Section 10

- `calculate_de_bracket_size(promoted_count)` — next power of 2
- `calculate_de_duration(weapon, bracket_size, duration_table)` — lookup from de_duration_table, interpolate between table entries if needed
- `calculate_de_finals_duration(weapon, duration_table)` — with `DE_FINALS_MIN_MINS` floor
- `calculate_total_de_strips(de_mode, competition)` — strip needs by DE mode (single block vs staged blocks)

### `src/engine/crossover.ts` — PRD Section 4

- `build_penalty_matrix(catalogue)` — static matrix of demographic conflict weights between all competitions
- `crossover_penalty(comp_a, comp_b)` — penalty score for two competitions in the same time window
- `proximity_penalty(comp_a, comp_b, time_gap)` — penalty for near-simultaneous scheduling of related events

**Testing (TDD):**

- `pools.ts`: table-driven tests for pool sizing across fencer counts 2–500, cut promotion counts for each `CutMode`, single-pool override edge cases (≤10 fencers with override on/off, >10 fencers).
- `de.ts`: table-driven tests for bracket sizing (powers of 2), duration lookups for all weapons × bracket sizes in the default table, finals duration floor enforcement.
- `crossover.ts`: penalty matrix dimensions (84×84), known conflict pairs (same weapon+gender, different category) produce expected weights, non-conflicting pairs (different weapon or different gender) score 0, proximity penalty distance decay.

**Exit criteria:** All competition math tests green. Functions are pure — no side effects, no imports beyond types/constants.

---

## Step 3: Resource Planning

**Goal:** Referee calculation, flighting group logic, and strip/ref allocation tracking.

**Modules:**

### `src/engine/refs.ts` — PRD Section 8

- `calculate_optimal_refs(competitions_by_day, config)` — minimum refs per day split by foil/epee and sabre, given the competitions assigned to each day
- `calculate_pod_captains(strip_count, de_mode, fencer_count, override)` — pod captain count removed from ref pool during DE, based on strip count and `PodCaptainOverride`
- `refs_available_on_day(day, weapon, config)` — available refs for a weapon on a given day, accounting for fill-in

### `src/engine/flighting.ts` — PRD Section 9

- `suggest_flighting_groups(competitions, strips_total, day_assignments)` — identify candidates for flighting based on pool count and strip deficit
- `calculate_flighted_strips(priority_comp, flighted_comp, strips_total)` — split strips between priority and flighted competition
- `validate_flighting_group(group, competitions, day_assignments)` — check constraints: at most one flighted per day, largest-by-pool-count rule, demographic conflict warnings

### `src/engine/resources.ts` — PRD Section 11

- `create_global_state(config)` — initialize `GlobalState` from tournament config
- `allocate_strips(state, count, start_time, duration, video_preference)` / `release_strips(state, strip_ids, end_time)` — update `strip_free_at` array
- `allocate_refs(state, day, weapon, count)` / `release_refs(state, day, weapon, count, end_time)` — update `refs_in_use_by_day` with weapon-aware tracking
- `find_available_strips(state, count, at_time, video_preference)` — find N strips free at a given time, respecting video preference rules (non-video preferred for pools, video preferred/required for DE rounds per policy)

**Testing (TDD):**

- `refs.ts`: optimal ref counts for known tournament configs (e.g., 3 foil + 3 epee events → expected foil/epee ref count), pod captain removal for different strip counts and all three override modes, sabre fill-in scenarios (actual < optimal, fill-in accepted vs rejected).
- `flighting.ts`: flighting suggestions triggered for strip-deficit scenarios, strip split calculations for various strip counts, validation catches — more than one flighted per day, non-largest competition selected, demographic conflict warnings.
- `resources.ts`: allocate/release round-trips (strips freed at correct times), strip availability queries with video preference (non-video first, video fallback), ref tracking with weapon splits and fill-in counting.

**Exit criteria:** All resource planning tests green. `resources.ts` manages mutable state through a clean API — `GlobalState` is passed as a parameter, no global singletons.

---

## Step 4: Scheduling

**Goal:** The core orchestrator — assign competitions to days, schedule each one, produce the full schedule.

**Modules:**

### `src/engine/dayAssignment.ts` — PRD Section 12

- `assign_days(competitions, config)` — distribute competitions across available days, minimizing crossover penalty, respecting constraints: all phases same day, individual-before-team gap (`INDIV_TEAM_MIN_GAP_MINS`), latest start time. Returns a day assignment map (competition ID → day index).

### `src/engine/scheduleOne.ts` — PRD Section 13

- `schedule_competition(competition, day, state, config)` — given a competition, its assigned day, and current `GlobalState`: find earliest feasible start time (respecting `LATEST_START_OFFSET`), allocate strips/refs for pool phase, apply `ADMIN_GAP_MINS`, allocate for DE phase (handling single block vs staged), handle flighted scheduling with `FLIGHT_BUFFER_MINS`, produce a `ScheduleResult`. Mutates `GlobalState` via the `resources.ts` API.

### `src/engine/scheduler.ts` — PRD Section 14

- `schedule_all(competitions, day_assignments, config)` — master orchestrator: initialize `GlobalState`, iterate competitions in priority order, call `schedule_competition()` for each, collect `ScheduleResult[]` and `Bottleneck[]`, handle deadline reschedule retries up to `MAX_RESCHEDULE_ATTEMPTS`. Returns the complete schedule output.

**Testing (TDD):**

- `dayAssignment.ts`: small configs (3–4 competitions, 2 days) with known optimal assignments, individual/team gap enforcement (team must be ≥120 min after individual for same weapon/gender), crossover penalty minimization (conflicting events spread across days).
- `scheduleOne.ts`: single competition scheduling with mock `GlobalState` — verify correct start time, strip/ref allocation, admin gap placement. Flighted pair scheduling — priority runs first, flighted starts after `FLIGHT_BUFFER_MINS`. Staged DE block sequencing (prelims → round of 16 → finals). Video strip preference enforcement per `VideoPolicy`.
- `scheduler.ts`: integration tests using template tournament configs (NAC Youth, ROC Div1A/Vet, RYC Weekend at minimum) with realistic fencer counts. Verify: all competitions scheduled, no phase exceeds day window, bottleneck detection for intentionally constrained inputs (e.g., too few strips, tight ref counts). Reschedule retry triggered when deadline exceeded.

**Exit criteria:** `schedule_all()` produces valid `ScheduleResult[]` for at least 3 template configs. All phases complete within day windows. Bottleneck reports generated for intentionally constrained inputs.

---

## Step 5: Validation & Analysis

**Goal:** Pre-flight validation (hard errors that block scheduling) and initial analysis (warnings, suggestions, equity checks).

**Modules:**

### `src/engine/validation.ts` — PRD Section 15

- `validate_config(config, competitions)` — run before scheduling. Returns an array of hard errors (empty array = valid). Checks:
  - All selected competitions have fencer counts provided
  - Strip count > 0 and divisible by 4
  - `days_available` in valid range (2–4)
  - No duplicate competition selections
  - Team events have matching individual events selected
  - CAPPED fencer count type not allowed for regional qualifiers (`RYC`, `RJCC`, `ROC`, `SYC`, `SJCC`)
  - Per-competition field range checks (fencer count 2–500, valid enum values)

### `src/engine/analysis.ts` — PRD Section 9 / Phase 1h–1k

- `initial_analysis(config, competitions, day_assignments)` — stateless, re-runs on any config change. Returns warnings and suggestions:
  - Strip deficit warnings per day (competitions need more strips than available)
  - Flighting group suggestions (calls `suggest_flighting_groups()` from `flighting.ts`)
  - Video strip peak demand warnings (concurrent DE phases needing video > video strips available)
  - Cut summary (promoted fencer counts per competition, for user review)
  - Gender equity cap validation (CAPPED events only — flag if one gender's cap is significantly lower than the other for the same weapon/category)
  - Proximity warnings for demographically related events on same day (calls `proximity_penalty()` from `crossover.ts`)

**Testing (TDD):**

- `validation.ts`: each hard error condition tested individually — missing fencer count, strip count not divisible by 4, zero strips, days out of range, duplicate selections, orphan team event (no matching individual), regional qualifier with CAPPED type, fencer count out of range. Also test that a valid config produces no errors.
- `analysis.ts`: strip deficit detection with known strip count vs competition needs, flighting suggestions triggered at correct thresholds, gender equity flag for asymmetric caps (e.g., Women's Foil capped at 64, Men's Foil capped at 128), video demand warning when concurrent video-required DEs exceed video strip count, proximity warnings for same-weapon/gender events on same day. Verify statelessness — same input produces identical output on repeated calls.

**Exit criteria:** All validation/analysis tests green. `validate_config()` catches all PRD Section 15 hard errors. `initial_analysis()` produces actionable warnings for at least 2 template configs with intentionally constrained inputs.

---

## Dependency Graph

```
Step 0: Scaffold
  └── Step 1: Foundation (types, constants, catalogue)
       └── Step 2: Competition Math (pools, de, crossover)
            └── Step 3: Resource Planning (refs, flighting, resources)
                 └── Step 4: Scheduling (dayAssignment, scheduleOne, scheduler)
                 └── Step 5: Validation & Analysis (validation, analysis)
```

Steps 4 and 5 both depend on Step 3 but are independent of each other. They could be built in either order or in parallel. Validation/analysis is listed last because its integration tests benefit from having the scheduler available as a cross-check, but it does not import from `scheduler.ts`.

---

## What This Plan Does NOT Cover

Deferred to a separate UI implementation plan:

- Zustand store slices
- React components (wizard screens, schedule output views, diagnostics)
- Tailwind styling and theme application
- Save/load/share functionality
- Gantt visualization (Frappe Gantt vs React Modern Gantt evaluation)
- Component tests
