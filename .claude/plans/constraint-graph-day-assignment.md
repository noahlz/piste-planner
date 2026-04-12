# Constraint-Graph Day Assignment

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the penalty-function-based day assignment with constraint-graph coloring so events are assigned to days by policy (hard/soft constraints) and sequenced within each day by strip demand.

**Architecture:** Build an incompatibility graph from hard constraints (GROUP_1_MANDATORY, INDIV_TEAM_RELAXABLE_BLOCKS, same-population). Color the graph with DSatur (saturation-degree-first) using `days_available` colors, with soft constraints as tiebreakers. Then process days chronologically, sequencing events within each day by strip demand (largest first). Failed events enter a bounded repair loop that tries alternative days.

**Tech Stack:** TypeScript, Vitest, existing engine infrastructure (resources.ts, crossover.ts, pools.ts, de.ts)

---

## Context

The current engine uses a greedy sequential pipeline: each event is scored against all days via a 10-factor penalty function (`totalDayPenalty`), assigned to the best day, then resource-allocated. This approach has three fundamental weaknesses:

1. **No backtracking** — once an event claims a day, it's permanent. Later events that can't fit anywhere fail silently.
2. **Day assignment is decoupled from resource feasibility** — the penalty function tries to predict strip/ref availability but can't model actual temporal staggering. Experiment A proved this: improving the capacity prediction had zero impact on scheduling outcomes.
3. **Fragile ordering** — events are processed in constraint-priority order across all days. The first event gets the best day; event 20 gets whatever's left.

Integration tests show 2-4 of 24-54 events scheduling successfully. Physical capacity is ~16% utilized. Events fail because `estimateStartOnDay()` returns NO_WINDOW for all days, not because of penalty scoring. The penalty function is not the bottleneck — the architecture is.

### What changes

- **New**: `constraintGraph.ts` — graph types, edge builder
- **New**: `dayColoring.ts` — DSatur coloring, within-day sort, repair loop
- **Modify**: `scheduler.ts` — phased orchestration (graph → color → sequence → repair)
- **Modify**: `scheduleOne.ts` — accept `day` as parameter instead of calling `assignDay()`

### What stays

- `resources.ts` — strip/ref allocation, `earliestResourceWindow()`, snapshot/restore
- `crossover.ts` — `crossoverPenalty()` reused for graph edge weights
- `pools.ts`, `de.ts`, `refs.ts` — pool/DE math, ref demand estimation
- `capacity.ts` — strip-hour estimation (used by diagnostics and post-schedule reporting)
- `dayAssignment.ts` — `findEarlierSlotSameDay()` (used by scheduleOne retry loop), `SchedulingError` export. Penalty functions become dead code but are not deleted in this plan.

### Critical architectural constraint

`strip_free_at` tracks absolute minutes-from-midnight-of-day-0 globally. Day N events start at `dayStart(N, config)`. Because `dayStart(N) > dayEnd(N-1)`, strip allocations from earlier days are always expired by the time later days are processed. **Days must be processed in chronological order** (day 0, 1, 2, ...) for strip accounting to work correctly.

---

## Task 1: Build constraint graph

**Files:**
- Create: `src/engine/constraintGraph.ts`
- Test: `__tests__/engine/constraintGraph.test.ts`

### Types

`ConstraintEdge`: `{ targetId: string, weight: number }` — weight is `Infinity` for hard constraints, finite for soft.

`ConstraintGraph`: `Map<string, ConstraintEdge[]>` — adjacency list keyed by competition ID.

### Function: `buildConstraintGraph(competitions: Competition[]): ConstraintGraph`

For every pair of competitions, call `crossoverPenalty(c1, c2)` from `crossover.ts`. If result > 0, add a bidirectional edge with that weight. Also add hard edges for `INDIV_TEAM_RELAXABLE_BLOCKS` pairs (same weapon + gender, matching indiv/team categories per the constant at `constants.ts:539-543`). These edges get weight `Infinity`.

`crossoverPenalty` already handles: same-population (Infinity), GROUP_1_MANDATORY (Infinity), and CROSSOVER_GRAPH soft edges. So the graph builder just needs to iterate all pairs and add INDIV_TEAM edges on top.

### Steps

- [ ] **Step 1:** Write tests for `buildConstraintGraph`. Cases:
  - Two DIV1 same-gender same-weapon events → hard edge (Infinity)
  - DIV1 + JUNIOR same-gender same-weapon → hard edge (GROUP_1_MANDATORY)
  - DIV1 + VETERAN same-gender same-weapon → soft edge (CROSSOVER_GRAPH weight 0.8)
  - Different gender events → no edge
  - Different weapon events → no edge
  - VET individual + VET team same-gender same-weapon → hard edge (INDIV_TEAM_RELAXABLE_BLOCKS)
  - Verify graph is symmetric (if A→B exists, B→A exists with same weight)

- [ ] **Step 2:** Implement `buildConstraintGraph`. Import `crossoverPenalty` from `crossover.ts` and `INDIV_TEAM_RELAXABLE_BLOCKS` from `constants.ts`. O(n^2) pair iteration is fine for n <= 54.

- [ ] **Step 3:** Run tests, verify pass.

---

## Task 2: DSatur graph coloring

**Files:**
- Create: `src/engine/dayColoring.ts`
- Test: `__tests__/engine/dayColoring.test.ts`

### Function: `assignDaysByColoring(graph: ConstraintGraph, competitions: Competition[], config: TournamentConfig): Map<string, number>`

Returns a map from competition ID to assigned day (0-indexed).

### DSatur algorithm

DSatur (Degree of Saturation, Brélaz 1979) is a greedy graph coloring heuristic that assigns colors to vertices one at a time, always picking the vertex that is most constrained by its already-colored neighbors. "Saturation" means: how many distinct colors appear among a vertex's neighbors. A vertex with saturation 3 out of 4 available colors has only 1 valid option left — it gets colored next, before it becomes impossible.

This fits the day assignment problem because:
- **Vertices** = competitions, **colors** = days, **edges** = separation constraints
- Hard edges (Infinity weight) mean "must be on different days" — exactly the graph coloring constraint
- DSatur's "most saturated first" ordering naturally handles the "most rigid first" scheduling policy — events with the fewest remaining valid days get assigned first
- It's O(n^2) which is fine for n <= 54 events

The standard greedy coloring weakness — poor color choices early can force more colors later — is mitigated here because we have a fixed number of colors (days_available) and a repair loop for failures.

1. Initialize all vertices as uncolored. Saturation degree = 0 for all.
2. Pick the uncolored vertex with highest saturation degree. **Ties broken by**: (a) hard-edge degree descending (most constrained), then (b) `strips_allocated * categoryWeight(comp)` descending (largest packing footprint first).
3. Determine valid colors: a color `c` is valid if no hard-edge neighbor (weight = Infinity) is colored `c`.
4. Among valid colors, pick the one that minimizes total soft penalty: `sum of edge.weight for same-color soft-edge neighbors`.
5. If no valid color exists among `0..days_available-1`: relax INDIV_TEAM edges to soft (weight 5.0) for this vertex and retry. If still no valid color: assign the least-bad color (lowest soft penalty sum including the now-relaxed hard edges). Record a constraint-relaxation bottleneck.
6. Color the vertex. Update saturation degrees of all uncolored neighbors.
7. Repeat until all colored.

### Additional soft preferences to encode in color scoring (step 4)

When scoring candidate colors, also include:
- **Rest-day penalty**: if a REST_DAY_PAIRS neighbor (same gender + weapon) is colored on an adjacent day (|color difference| = 1), add 1.5
- **Proximity bonus**: if a PROXIMITY_GRAPH neighbor (same gender + weapon) is colored on an adjacent day, subtract 0.4 (bonus)
- **Individual/team ordering**: if this is a TEAM event and its individual counterpart is colored on day `d`, prefer day `d` (same day, sequenced later) or `d+1` (next day). Use `individualTeamProximityPenalty()` from `crossover.ts`.

These replace the corresponding penalty terms from the old `totalDayPenalty()`.

### Steps

- [ ] **Step 1:** Write tests. Cases:
  - 2 hard-conflicting events, 2 days → assigned to different days
  - 3 mutually hard-conflicting events, 3 days → each on a different day
  - 3 mutually hard-conflicting events, 2 days → constraint relaxation triggered, bottleneck recorded
  - Soft conflicts prefer different days when enough colors available
  - Tie-breaking: larger event gets colored first when saturation is equal
  - Rest-day pairs prefer non-adjacent days
  - Individual/team proximity: team prefers same day or day after individual

- [ ] **Step 2:** Implement DSatur. Import `categoryWeight` from `capacity.ts`, `REST_DAY_PAIRS` and `INDIV_TEAM_RELAXABLE_BLOCKS` from `constants.ts`, `individualTeamProximityPenalty` and `proximityPenalty` from `crossover.ts`.

- [ ] **Step 3:** Run tests, verify pass.

---

## Task 3: Within-day event sequencing

**Files:**
- Modify: `src/engine/dayColoring.ts` (add sequencing function)
- Test: `__tests__/engine/dayColoring.test.ts` (add sequencing tests)

### Function: `sequenceEventsForDay(events: Competition[]): Competition[]`

Returns events sorted for optimal within-day resource allocation. Sort key:

1. **Y8/Y10 first** — these events must start in the first slot of the day (existing constraint from `PENALTY_WEIGHTS.Y10_NON_FIRST_SLOT`). Boolean flag, descending.
2. **Mandatory before optional** — `!comp.optional` descending.
3. **Individual before team** — when a same-day pair exists (same weapon + gender + category), the individual event goes first so its resources are freed before the team starts. `comp.event_type === INDIVIDUAL` descending.
4. **Strip demand descending** — `comp.strips_allocated * categoryWeight(comp)` descending. Largest events get prime morning slots; small events fill gaps.
5. **Duration descending** — `estimateCompetitionDuration(comp, config)` descending (from `capacity.ts`). Among equal strip demand, longer events start earlier.

### Steps

- [ ] **Step 1:** Write tests. Cases:
  - Y8 event sorted before DIV1 event regardless of strip count
  - Mandatory event sorted before optional event
  - Individual event sorted before matching team event
  - Among same-type events: larger strip demand first
  - Mixed: Y10 (small) before DIV1 (large) because Y10 has first-slot requirement

- [ ] **Step 2:** Implement `sequenceEventsForDay`.

- [ ] **Step 3:** Run tests, verify pass.

---

## Task 4: Modify scheduleCompetition to accept day

**Files:**
- Modify: `src/engine/scheduleOne.ts`
- Test: `__tests__/engine/scheduleOne.test.ts` (if exists, update; otherwise test via integration)

### Changes

Add `day` as a required parameter to `scheduleCompetition()`:

**Current signature:** `scheduleCompetition(competition, state, config, allCompetitions)`
**New signature:** `scheduleCompetition(competition, day, state, config, allCompetitions)`

Remove the `assignDay()` call at line 84. Use the `day` parameter directly. Remove the `constraintLevel` variable (no longer needed — constraint relaxation is handled during graph coloring). Remove the import of `assignDay` from `dayAssignment.ts`.

Keep everything else: pool allocation, DE allocation, retry loop, team sequencing, `findEarlierSlotSameDay()`.

### Steps

- [ ] **Step 1:** Update the function signature and remove the `assignDay` call. Replace `constraintLevel` usage with `0` (or remove if only used for diagnostics).

- [ ] **Step 2:** Update all call sites. The only caller is `scheduler.ts:81`. It will pass the day from the coloring map.

- [ ] **Step 3:** Run existing tests to verify nothing breaks. The unit tests for scheduleOne may need updating to pass a `day` argument.

---

## Task 5: Restructure scheduler loop

**Files:**
- Modify: `src/engine/scheduler.ts`
- Test: `__tests__/engine/scheduler.test.ts` (if exists), otherwise integration tests

### New flow for `scheduleAll()`

Replace the current single-pass loop (lines 76-108) with:

**Phase 1 — Build constraint graph:**
Call `buildConstraintGraph(competitions)`.

**Phase 2 — Assign days by coloring:**
Call `assignDaysByColoring(graph, competitions, config)`. Returns `Map<string, number>`.

**Phase 3 — Sequence and schedule, day by day:**
For each day 0 to `days_available - 1`:
1. Collect events assigned to this day from the coloring map.
2. Call `sequenceEventsForDay(events)` to sort them.
3. For each event in order: call `scheduleCompetition(event, day, state, config, competitions)`. On `SchedulingError`: add to `failedEvents` list, record bottleneck (same error handling as current).

**Phase 4 — Repair failed events:**
For each failed event:
1. Get valid alternative days from the constraint graph (days where no hard-edge neighbor is assigned).
2. Sort alternative days by total soft penalty (lowest first).
3. Try `scheduleCompetition(event, altDay, state, config, competitions)` for each.
4. On success: update `state.schedule`, break.
5. On failure of all alternatives: record final ERROR bottleneck.

Bound the repair loop: each failed event tries at most `days_available - 1` alternatives. No iterative swapping.

**Phase 5 — Post-schedule diagnostics:**
Keep existing `postScheduleDiagnostics`, `postScheduleDayBreakdown`, `postScheduleWarnings` unchanged.

### Sort function replacement

Remove the import of `constraintScore` from `dayAssignment.ts`. The `sortWithPairs()` function is no longer needed — event ordering is handled by DSatur (for day assignment) and `sequenceEventsForDay` (for within-day). However, flighting pair logic (priority immediately before flighted) must be preserved in the within-day sequencing. Add flighting awareness to `sequenceEventsForDay`: if an event has `is_priority` and a `flighting_group_id`, its flighted partner should immediately follow it.

### Steps

- [ ] **Step 1:** Write the phased `scheduleAll`. Import `buildConstraintGraph` and `assignDaysByColoring` and `sequenceEventsForDay` from the new modules.

- [ ] **Step 2:** Implement the repair loop as described.

- [ ] **Step 3:** Handle flighting pairs in sequencing: ensure priority event is immediately followed by its flighted partner in the within-day sequence.

- [ ] **Step 4:** Run all tests. Fix any failures. Existing integration tests should still pass (they check `scheduled >= 1` and `scheduled + errors = total`).

---

## Task 6: Integration test baselines

**Files:**
- Read: `__tests__/engine/integration.test.ts`

### Steps

- [ ] **Step 1:** Run full test suite: `timeout 120 pnpm --silent test > ./tmp/test.log 2>&1`

- [ ] **Step 2:** Run integration tests with output: `timeout 120 pnpm --silent vitest run __tests__/engine/integration.test.ts 2>&1 | grep '→'`

- [ ] **Step 3:** Record new scheduled/error counts for B1-B7. Compare against baselines:

| Scenario | Events | Old Scheduled | Old Errors |
|----------|--------|---------------|------------|
| B1: Feb 2026 NAC | 24 | 2 | 22 |
| B2: Nov 2025 NAC | 24 | 4 | 20 |
| B3: Mar 2026 NAC | 24 | 4 | 20 |
| B4: Jan 2026 SYC | 30 | 4 | 26 |
| B5: Jan 2026 SJCC | 12 | 4 | 8 |
| B6: Sep 2025 ROC | 54 | 3 | 51 |
| B7: Oct 2025 NAC | 18 | 4 | 14 |

- [ ] **Step 4:** If scheduling density improves, update any test assertions that encode specific counts. If density doesn't improve, investigate whether the bottleneck is now in `earliestResourceWindow()` search limits (`MAX_RESCHEDULE_ATTEMPTS = 3`) or ref availability.

---

## Verification

After all tasks:

```bash
timeout 120 pnpm --silent test > ./tmp/test.log 2>&1
```

Read `./tmp/test.log` only on failure. All existing tests must pass. Integration test scheduled counts should improve (the whole point of this redesign).

If integration counts are unchanged, the bottleneck has moved downstream to the resource allocator. In that case, investigate `MAX_RESCHEDULE_ATTEMPTS` (currently 3, giving 16 search iterations — may be too low for days with many events).
